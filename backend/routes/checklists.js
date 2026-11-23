// Checklists editáveis: o modelo é montado por seções (blocos) e itens — incluir, alterar, excluir e reordenar —
// e as visitas salvas podem ser reabertas para edição. Exportação e PDF são gerados no navegador.
const { Router } = require('express');
const { pool } = require('../db');
const { exigirLogin } = require('../lib/auth');
const { pode, permissoesDe } = require('../lib/rbac');

const r = Router();
r.use(exigirLogin);
const txt = (v, max = 500) => String(v ?? '').trim().slice(0, max);
async function nomeUsuario(id) { const { rows } = await pool.query('SELECT nome FROM usuarios WHERE id = $1', [id]); return rows[0]?.nome || 'Usuário'; }
const CAB_PADRAO = [['loja', 'Loja'], ['responsavel', 'Responsável'], ['data', 'Data']];
const classe = v => (v == null ? null : v >= 85 ? 'Destaque' : v >= 70 ? 'Estável' : v >= 50 ? 'Atenção' : 'Prioridade alta');

// Valida e limpa a estrutura enviada pelo editor.
function normalizar(e) {
  if (!e || typeof e !== 'object') throw new Error('Estrutura do checklist inválida.');
  const escala = e.escala === 'comparativa' ? 'comparativa' : 'conformidade';
  let cab = Array.isArray(e.cabecalho) ? e.cabecalho.filter(c => Array.isArray(c) && /^[a-z_]{2,20}$/.test(c[0]) && txt(c[1], 60)).map(c => [c[0], txt(c[1], 60)]) : [];
  if (!cab.length) cab = CAB_PADRAO;
  const blocos = (Array.isArray(e.blocos) ? e.blocos : []).slice(0, 40).map(b => ({
    nome: txt(b?.nome, 120),
    peso: Math.min(3, Math.max(1, parseInt(b?.peso, 10) || 2)),
    area: txt(b?.area, 80) || '—',
    acao: txt(b?.acao, 300) || 'Ajustar o ponto apontado, registrar a evidência e combinar o prazo com o responsável.',
    itens: (Array.isArray(b?.itens) ? b.itens : []).map(i => txt(i, 300)).filter(Boolean).slice(0, 60),
  }));
  if (!blocos.length) throw new Error('Inclua pelo menos uma seção.');
  const semNome = blocos.findIndex(b => !b.nome);
  if (semNome >= 0) throw new Error(`Dê um nome à seção ${semNome + 1}.`);
  const vazia = blocos.find(b => !b.itens.length);
  if (vazia) throw new Error(`A seção "${vazia.nome}" está sem itens. Inclua um item ou exclua a seção.`);
  return { escala, cabecalho: cab, blocos };
}

r.post('/modelos', pode('check', 2), async (req, res) => {
  const b = req.body || {};
  const nome = txt(b.nome, 150);
  if (!nome) return res.status(400).json({ erro: 'Informe o nome do checklist.' });
  if (!(await pool.query('SELECT 1 FROM areas WHERE id = $1', [b.area_id])).rowCount) return res.status(400).json({ erro: 'Área inválida.' });
  let est; try { est = normalizar(b.estrutura); } catch (e) { return res.status(400).json({ erro: e.message }); }
  const { rows: [m] } = await pool.query(
    `INSERT INTO checklist_modelos (area_id, nome, itens, estrutura, ordem, atualizado_em, atualizado_por)
     VALUES ($1,$2,$3,$4,(SELECT COALESCE(MAX(ordem),0)+1 FROM checklist_modelos WHERE area_id = $1), now(), $5) RETURNING id`,
    [b.area_id, nome, JSON.stringify(est.blocos.flatMap(x => x.itens)), JSON.stringify(est), await nomeUsuario(req.usuario.sub)]);
  res.status(201).json({ id: m.id });
});

r.put('/modelos/:id', pode('check', 2), async (req, res) => {
  const b = req.body || {};
  const nome = txt(b.nome, 150);
  if (!nome) return res.status(400).json({ erro: 'Informe o nome do checklist.' });
  let est; try { est = normalizar(b.estrutura); } catch (e) { return res.status(400).json({ erro: e.message }); }
  const { rowCount } = await pool.query(
    `UPDATE checklist_modelos SET nome=$2, itens=$3, estrutura=$4, atualizado_em=now(), atualizado_por=$5 WHERE id=$1 AND ativo`,
    [req.params.id, nome, JSON.stringify(est.blocos.flatMap(x => x.itens)), JSON.stringify(est), await nomeUsuario(req.usuario.sub)]);
  if (!rowCount) return res.status(404).json({ erro: 'Checklist não encontrado.' });
  res.json({ ok: true });
});

// "Excluir" o modelo = inativar: as visitas já salvas continuam consultáveis.
r.delete('/modelos/:id', pode('check', 2), async (req, res) => {
  const { rowCount } = await pool.query(`UPDATE checklist_modelos SET ativo = FALSE, atualizado_em = now(), atualizado_por = $2 WHERE id = $1`, [req.params.id, await nomeUsuario(req.usuario.sub)]);
  if (!rowCount) return res.status(404).json({ erro: 'Checklist não encontrado.' });
  res.json({ ok: true });
});

// Edição de uma visita salva (quem aplicou ou perfil com Checklists total). Ações já geradas no plano não são duplicadas.
r.put('/aplicacoes/:id', pode('check', 1), async (req, res) => {
  const { rows: [ap] } = await pool.query(
    `SELECT ap.*, COALESCE(ap.estrutura_snap, m.estrutura) AS est FROM checklist_aplicacoes ap JOIN checklist_modelos m ON m.id = ap.modelo_id WHERE ap.id = $1`, [req.params.id]);
  if (!ap) return res.status(404).json({ erro: 'Checklist não encontrado.' });
  const perm = await permissoesDe(req.usuario.perfil);
  if (ap.usuario_id !== req.usuario.sub && (perm.check || 0) < 2) return res.status(403).json({ erro: 'Só quem aplicou o checklist (ou um gestor) pode editá-lo.' });
  const est = ap.est;
  if (!est) return res.status(400).json({ erro: 'Este checklist antigo não pode ser editado.' });
  const n = est.blocos.reduce((s, b) => s + b.itens.length, 0);
  const b = req.body || {};
  const resp = Array.isArray(b.respostas) ? b.respostas.slice(0, n) : [];
  if (resp.length !== n) return res.status(400).json({ erro: 'Respostas incompletas.' });
  const norm = resp.map(x => ({ s: ['ok', 'warn', 'no'].includes(x?.s) ? x.s : '', obs: txt(x?.obs, 2000) }));
  const av = norm.filter(x => x.s);
  if (!av.length) return res.status(400).json({ erro: 'Marque pelo menos um item antes de salvar.' });
  const ok = norm.filter(x => x.s === 'ok').length, w = norm.filter(x => x.s === 'warn').length, no = norm.filter(x => x.s === 'no').length;
  const score = Math.round(((ok + w * 0.5) / av.length) * 100);
  let i = 0; const ind = [];
  for (const bl of est.blocos) {
    const rs = norm.slice(i, i + bl.itens.length); i += bl.itens.length;
    const a = rs.filter(x => x.s).length;
    if (a) ind.push([((rs.filter(x => x.s === 'ok').length + rs.filter(x => x.s === 'warn').length * 0.5) / a) * 100, bl.peso || 1]);
  }
  const pond = ind.length ? Math.round(ind.reduce((s, [v, p]) => s + v * p, 0) / ind.reduce((s, [, p]) => s + p, 0)) : null;
  const cab = {};
  for (const [k] of est.cabecalho || []) if (b.cabecalho?.[k]) cab[k] = txt(b.cabecalho[k], 150);
  const loja = b.loja_id ? Number(b.loja_id) : null;
  await pool.query(
    `UPDATE checklist_aplicacoes SET respostas=$2, score=$3, qtd_ok=$4, qtd_atencao=$5, qtd_nc=$6, observacao=$7, cabecalho=$8, indice_ponderado=$9, classificacao=$10,
            loja_id=$11, marca=(SELECT marca FROM lojas WHERE id = $11), estrutura_snap=COALESCE(estrutura_snap, $12), atualizado_em=now(), atualizado_por=$13 WHERE id=$1`,
    [ap.id, JSON.stringify(norm), score, ok, w, no, txt(b.observacao, 2000) || null, JSON.stringify(cab), pond, classe(score), loja, JSON.stringify(est), await nomeUsuario(req.usuario.sub)]);
  res.json({ ok: true, id: ap.id, score, ponderado: pond, classificacao: classe(score) });
});

// Lista dos checklists salvos (com quem aplicou, se é editável e se foi editado).
r.get('/aplicacoes', pode('areas', 1), async (req, res) => {
  const p = []; let w = '';
  if (req.query.area) { p.push(req.query.area); w = 'WHERE ap.area_id = $1'; }
  const { rows } = await pool.query(
    `SELECT ap.id, ap.modelo_id, m.nome AS modelo, ap.area_id, l.nome AS loja, ap.score, ap.indice_ponderado, ap.classificacao, ap.cabecalho, ap.qtd_ok, ap.qtd_atencao, ap.qtd_nc,
            ap.criado_em, ap.atualizado_em, ap.usuario_id, (ap.estrutura_snap IS NOT NULL) AS estruturado, u.nome AS usuario
       FROM checklist_aplicacoes ap JOIN checklist_modelos m ON m.id = ap.modelo_id
       LEFT JOIN lojas l ON l.id = ap.loja_id LEFT JOIN usuarios u ON u.id = ap.usuario_id
       ${w} ORDER BY ap.criado_em DESC LIMIT 300`, p);
  res.json(rows);
});

// Leitura de um checklist salvo com a estrutura do momento da aplicação (substitui a rota antiga, montada antes dela).
const leitura = Router();
leitura.get('/checklists/aplicacoes/:id', exigirLogin, pode('areas', 1), async (req, res) => {
  const { rows } = await pool.query(
    `SELECT ap.*, m.nome AS modelo, m.itens, ap.estrutura_snap AS estrutura, l.nome AS loja, u.nome AS usuario FROM checklist_aplicacoes ap
       JOIN checklist_modelos m ON m.id = ap.modelo_id LEFT JOIN lojas l ON l.id = ap.loja_id LEFT JOIN usuarios u ON u.id = ap.usuario_id
      WHERE ap.id = $1`, [req.params.id]);
  if (!rows[0]) return res.status(404).json({ erro: 'Checklist não encontrado.' });
  res.json(rows[0]);
});

module.exports = r;
module.exports.leitura = leitura;
