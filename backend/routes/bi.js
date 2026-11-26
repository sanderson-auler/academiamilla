// /api/bi — relatórios de BI com dados do DW do Grupo Milla.
// Simulador de Compras por Faixa de Preço: leitura da carga ativa e importação de carga (arquivo JSON gerado do DW).
const { Router } = require('express');
const { pool } = require('../db');
const { exigirLogin } = require('../lib/auth');
const { pode } = require('../lib/rbac');

const r = Router();
r.use(exigirLogin);

const REL = 'compra-faixa';
let cache = { id: null, dados: null };

const num = v => (Number.isFinite(Number(v)) ? Number(v) : 0);
const txt = (v, max = 160) => String(v ?? '').trim().slice(0, max);

async function cargaAtiva() {
  const { rows: [c] } = await pool.query(
    `SELECT id, origem, to_char(data_referencia, 'YYYY-MM-DD') AS data_referencia, meta, linhas, criado_em FROM bi_cargas
      WHERE relatorio = $1 AND ativa ORDER BY criado_em DESC, id DESC LIMIT 1`, [REL]);
  return c || null;
}

r.get('/relatorios', pode('bi', 1), async (req, res) => {
  const c = await cargaAtiva();
  res.json([{
    id: REL,
    titulo: 'Simulador de Compras por Faixa de Preço',
    descricao: 'Planejamento de verba do semestre por linha, grupo, subgrupo e faixa de preço, com base na venda líquida do ano anterior.',
    area: 'Compras',
    pagina: '/bi/simulador-compras.html',
    carga: c ? { data_referencia: c.data_referencia, linhas: c.linhas, origem: c.origem, criado_em: c.criado_em } : null,
  }]);
});

// Dados no formato usado pela tela do simulador (dimensões em listas + linhas compactas).
r.get('/compra-faixa', pode('bi', 1), async (req, res) => {
  const c = await cargaAtiva();
  if (!c) return res.status(404).json({ erro: 'Ainda não há carga de dados para este relatório. Peça ao administrador para importar a carga.' });
  if (cache.id === c.id) return res.json(cache.dados);
  const { rows } = await pool.query(
    `SELECT linha, grupo, subgrupo, nivel_preco, faixa_preco, vendas, prev_qt, est_qt, est_custo, ped_qt
       FROM bi_compra_faixa WHERE carga_id = $1`, [c.id]);
  const anos = (c.meta.anos || []).map(Number).sort();
  const L = [...new Set(rows.map(x => x.linha))].sort(), G = [...new Set(rows.map(x => x.grupo))].sort(), S = [...new Set(rows.map(x => x.subgrupo))].sort();
  const iL = new Map(L.map((v, i) => [v, i])), iG = new Map(G.map((v, i) => [v, i])), iS = new Map(S.map((v, i) => [v, i]));
  const faixas = {};
  const linhas = rows.map(x => {
    faixas[x.nivel_preco] = x.faixa_preco;
    const v = anos.flatMap(a => (x.vendas[a] || [0, 0, 0]).map(num));
    return [iL.get(x.linha), iG.get(x.grupo), iS.get(x.subgrupo), x.nivel_preco, ...v, num(x.prev_qt), num(x.est_qt), num(x.est_custo), num(x.ped_qt)];
  });
  const dados = {
    meta: { ...c.meta, anos, carga: c.data_referencia, origem: c.origem, importada_em: c.criado_em },
    faixas, linhas: L, grupos: G, subgrupos: S,
    cols: ['li', 'gi', 'si', 'nivel', ...anos.flatMap(a => [`q${a}`, `v${a}`, `c${a}`]), 'rq', 'eq', 'ec', 'pq'],
    rows: linhas,
  };
  cache = { id: c.id, dados };
  res.json(dados);
});

r.get('/compra-faixa/cargas', pode('bi', 2), async (req, res) => {
  const { rows } = await pool.query(
    `SELECT c.id, c.origem, to_char(c.data_referencia, 'YYYY-MM-DD') AS data_referencia, c.linhas, c.ativa, c.criado_em, u.nome AS criado_por
       FROM bi_cargas c LEFT JOIN usuarios u ON u.id = c.criado_por
      WHERE c.relatorio = $1 ORDER BY c.criado_em DESC LIMIT 20`, [REL]);
  res.json(rows);
});

// Importação da carga (arquivo JSON do DW). Formato:
// { meta: { carga: 'AAAA-MM-DD', anos: [2025, 2026], remanescente }, faixas: {nivel: faixa}, linhas, grupos, subgrupos,
//   rows: [[li, gi, si, nivel, (qtd, venda, cmv) por ano..., prev_qt, est_qt, est_custo, (ped_qt opcional)]] }
r.post('/compra-faixa/carga', pode('bi', 2), async (req, res) => {
  const b = req.body || {};
  const anos = Array.isArray(b.meta?.anos) ? b.meta.anos.map(Number).filter(a => a > 2000 && a < 2100) : [];
  const ref = /^\d{4}-\d{2}-\d{2}$/.test(b.meta?.carga || '') ? b.meta.carga : null;
  if (!anos.length || !ref) return res.status(400).json({ erro: 'Arquivo inválido: faltam meta.anos ou meta.carga (AAAA-MM-DD).' });
  if (![b.linhas, b.grupos, b.subgrupos, b.rows].every(Array.isArray) || !b.rows.length) return res.status(400).json({ erro: 'Arquivo inválido: faltam linhas, grupos, subgrupos ou rows.' });
  const n = 4 + 3 * anos.length;
  const cols = { l: [], g: [], s: [], nv: [], fx: [], v: [], p: [], e: [], c: [], pd: [] };
  const chaves = new Set();
  for (const x of b.rows) {
    if (!Array.isArray(x) || x.length < n + 3) return res.status(400).json({ erro: 'Arquivo inválido: linha com colunas faltando.' });
    const l = txt(b.linhas[x[0]]), g = txt(b.grupos[x[1]]), s = txt(b.subgrupos[x[2]]), nv = Math.trunc(num(x[3]));
    if (!l || !g || !s || !nv) return res.status(400).json({ erro: 'Arquivo inválido: linha, grupo, subgrupo ou faixa sem valor.' });
    const k = `${l}|${g}|${s}|${nv}`;
    if (chaves.has(k)) return res.status(400).json({ erro: `Arquivo inválido: combinação repetida (${k}).` });
    chaves.add(k);
    const vendas = Object.fromEntries(anos.map((a, i) => [a, [num(x[4 + 3 * i]), num(x[5 + 3 * i]), num(x[6 + 3 * i])]]));
    cols.l.push(l); cols.g.push(g); cols.s.push(s); cols.nv.push(nv); cols.fx.push(txt(b.faixas?.[nv] || b.faixas?.[String(nv)] || `Nível ${nv}`, 40));
    cols.v.push(JSON.stringify(vendas)); cols.p.push(num(x[n])); cols.e.push(num(x[n + 1])); cols.c.push(num(x[n + 2])); cols.pd.push(num(x[n + 3]));
  }
  const meta = { anos, remanescente: txt(b.meta.remanescente, 120) || null, fonte: txt(b.meta.fonte, 200) || 'Arquivo de carga do DW (CSVs do ETL Pentaho)' };
  const cx = await pool.connect();
  try {
    await cx.query('BEGIN');
    const { rows: [nova] } = await cx.query(
      `INSERT INTO bi_cargas (relatorio, origem, data_referencia, meta, linhas, criado_por) VALUES ($1, 'manual', $2, $3, $4, $5) RETURNING id`,
      [REL, ref, JSON.stringify(meta), b.rows.length, req.usuario.sub]);
    await cx.query(
      `INSERT INTO bi_compra_faixa (carga_id, linha, grupo, subgrupo, nivel_preco, faixa_preco, vendas, prev_qt, est_qt, est_custo, ped_qt)
       SELECT $1, t.l, t.g, t.s, t.nv, t.fx, t.v::jsonb, t.p, t.e, t.c, t.pd
         FROM unnest($2::text[], $3::text[], $4::text[], $5::int[], $6::text[], $7::text[], $8::numeric[], $9::numeric[], $10::numeric[], $11::numeric[])
           AS t(l, g, s, nv, fx, v, p, e, c, pd)`,
      [nova.id, cols.l, cols.g, cols.s, cols.nv, cols.fx, cols.v, cols.p, cols.e, cols.c, cols.pd]);
    await cx.query('UPDATE bi_cargas SET ativa = FALSE WHERE relatorio = $1 AND id <> $2', [REL, nova.id]);
    await cx.query('COMMIT');
    cache = { id: null, dados: null };
    res.status(201).json({ ok: true, id: nova.id, linhas: b.rows.length, data_referencia: ref, anos });
  } catch (e) {
    await cx.query('ROLLBACK');
    throw e;
  } finally {
    cx.release();
  }
});

module.exports = r;
