// /api/plataforma — carga da plataforma, painéis, busca e assistente.
const { Router } = require('express');
const { pool } = require('../db');
const { exigirLogin } = require('../lib/auth');
const { permissoesDe, pode, perfis } = require('../lib/rbac');
const { nivel, totalDe } = require('../lib/pontos');

const r = Router();
r.use(exigirLogin);

const MES = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ'];
const ddmm = d => `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
const iso = d => d.toISOString().slice(0, 10);

// Tudo que a plataforma precisa para abrir, no formato usado pelas telas.
r.get('/base', async (req, res) => {
  const uid = req.usuario.sub;
  const [u, marcas, areas, ind, chk, cur, cal, lojas, com] = await Promise.all([
    pool.query('SELECT id, nome, email, perfil, cargo, area_id, marca FROM usuarios WHERE id = $1', [uid]),
    pool.query('SELECT codigo, cor FROM marcas ORDER BY ordem'),
    pool.query('SELECT * FROM areas ORDER BY ordem'),
    pool.query('SELECT * FROM indicadores ORDER BY area_id, ordem, id'),
    pool.query('SELECT * FROM checklist_modelos WHERE ativo ORDER BY area_id, ordem, id'),
    pool.query(`SELECT c.*, COALESCE(p.aulas_feitas,0) AS feitas FROM cursos c
                LEFT JOIN curso_progresso p ON p.curso_id = c.id AND p.usuario_id = $1 ORDER BY c.area_id, c.ordem, c.id`, [uid]),
    pool.query('SELECT * FROM campanhas ORDER BY inicio, id'),
    pool.query('SELECT id, nome, marca FROM lojas WHERE ativa ORDER BY marca, nome'),
    pool.query(`SELECT id, titulo, tipo, corpo, publicado_em FROM conteudos WHERE status = 'Publicado' AND tipo = 'Comunicado' ORDER BY publicado_em DESC LIMIT 5`),
  ]);
  const usuario = u.rows[0];
  const ps = await perfis();
  const A = {};
  for (const a of areas.rows) {
    A[a.id] = {
      nome: a.nome, resp: a.resp, cargo: a.cargo, cor: a.cor, grad: a.grad, ic: a.ic, tag: a.tag, papel: a.papel,
      ...a.conteudo, kpis: [], checklists: [], cursos: [],
    };
  }
  ind.rows.forEach(k => A[k.area_id]?.kpis.push([k.nome, k.valor, k.variacao, k.positivo, k.serie, k.id]));
  chk.rows.forEach(c => A[c.area_id]?.checklists.push([c.nome, c.itens, c.id, c.estrutura || null]));
  cur.rows.forEach(c => A[c.area_id]?.cursos.push([c.titulo, `${c.aulas} aulas · ${c.duracao || ''}`.trim(), Math.min(100, Math.round((c.feitas / c.aulas) * 100)), c.id, c.aulas, c.feitas]));
  const CAL = Object.fromEntries(marcas.rows.map(m => [m.codigo, []]));
  cal.rows.forEach(c => CAL[c.marca]?.push([MES[c.inicio.getMonth()], c.nome, `${ddmm(c.inicio)}–${ddmm(c.fim)}`, c.id, iso(c.inicio), iso(c.fim)]));
  const total = await totalDe(uid);
  res.json({
    usuario: { ...usuario, perfil_nome: ps[usuario.perfil]?.nome || usuario.perfil },
    permissoes: await permissoesDe(usuario.perfil),
    marcas: marcas.rows.map(m => m.codigo),
    brandcolor: Object.fromEntries(marcas.rows.map(m => [m.codigo, m.cor])),
    areaOrder: areas.rows.map(a => a.id),
    areas: A, cal: CAL, lojas: lojas.rows,
    pontos: { total, nivel: nivel(total) },
    comunicados: com.rows,
    hoje: new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date()),
  });
});

// Meu Painel
r.get('/painel', async (req, res) => {
  const uid = req.usuario.sub;
  const { rows: [u] } = await pool.query('SELECT nome, area_id FROM usuarios WHERE id = $1', [uid]);
  const primeiro = (u.nome || '').split(' ')[0];
  const [acoes, cursos, chk, prox] = await Promise.all([
    pool.query(`SELECT a.id, a.titulo, a.prazo, a.status, a.area_id, ar.nome AS area FROM acoes a JOIN areas ar ON ar.id = a.area_id
                WHERE a.status <> 'Concluído' AND (a.responsavel_id = $1 OR a.criado_por = $1 OR ($2::text IS NOT NULL AND a.area_id = $2) OR a.responsavel ILIKE $3)
                ORDER BY a.prazo NULLS LAST LIMIT 50`, [uid, u.area_id, primeiro ? primeiro + '%' : '__']),
    pool.query(`SELECT COUNT(*) FILTER (WHERE aulas_feitas > 0 AND concluido_em IS NULL)::int AS em_curso,
                       COUNT(*) FILTER (WHERE concluido_em IS NOT NULL)::int AS concluidos FROM curso_progresso WHERE usuario_id = $1`, [uid]),
    pool.query(`SELECT COALESCE(ROUND(AVG(score)),0)::int AS media, COUNT(*)::int AS qtd FROM checklist_aplicacoes WHERE criado_em > now() - interval '30 days'`),
    pool.query(`SELECT id, marca, nome, inicio, fim FROM campanhas WHERE fim >= CURRENT_DATE ORDER BY inicio LIMIT 4`),
  ]);
  const total = await totalDe(uid);
  // Fallback: se o usuário ainda não tem ações próprias, mostra as abertas mais urgentes do grupo.
  let lista = acoes.rows;
  if (!lista.length) lista = (await pool.query(`SELECT a.id, a.titulo, a.prazo, a.status, a.area_id, ar.nome AS area FROM acoes a JOIN areas ar ON ar.id = a.area_id
      WHERE a.status <> 'Concluído' ORDER BY a.prazo NULLS LAST LIMIT 6`)).rows;
  const hoje = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
  res.json({
    acoesAbertas: lista.length,
    acoesHoje: lista.filter(a => a.prazo && iso(a.prazo) <= hoje).length,
    acoes: lista.slice(0, 6),
    cursosEmCurso: cursos.rows[0].em_curso, cursosConcluidos: cursos.rows[0].concluidos,
    aderencia: chk.rows[0].media, checklists30d: chk.rows[0].qtd,
    pontos: total, nivel: nivel(total),
    campanhas: prox.rows.map(c => ({ ...c, periodo: `${ddmm(c.inicio)}–${ddmm(c.fim)}` })),
  });
});

// Dashboard executivo — índices calculados a partir da execução real.
r.get('/executivo', pode('exec', 1), async (req, res) => {
  const [areas, acoes, chk, metas, cursos, engaj, cal] = await Promise.all([
    pool.query('SELECT id, nome, resp FROM areas ORDER BY ordem'),
    pool.query(`SELECT area_id, COUNT(*)::int AS total,
                       COUNT(*) FILTER (WHERE status = 'Concluído')::int AS concl,
                       COUNT(*) FILTER (WHERE status = 'Concluído' AND (prazo IS NULL OR concluido_em::date <= prazo))::int AS no_prazo,
                       COUNT(*) FILTER (WHERE status <> 'Concluído' AND prazo < CURRENT_DATE)::int AS vencidas
                  FROM acoes GROUP BY area_id`),
    pool.query(`SELECT area_id, ROUND(AVG(score))::int AS media, COUNT(*)::int AS qtd FROM checklist_aplicacoes
                 WHERE criado_em > now() - interval '60 days' GROUP BY area_id`),
    pool.query(`SELECT area_id, ROUND(AVG(LEAST(realizado/meta*100, 120)))::int AS ating FROM metas GROUP BY area_id`),
    pool.query(`SELECT COUNT(*) FILTER (WHERE concluido_em IS NOT NULL)::int AS concl FROM curso_progresso`),
    pool.query(`SELECT COALESCE(a.nome, 'Corporativo') AS grupo, COUNT(DISTINCT u.id)::int AS usuarios,
                       COUNT(DISTINCT u.id) FILTER (WHERE u.ultimo_acesso > now() - interval '30 days' OR EXISTS (SELECT 1 FROM pontos p WHERE p.usuario_id = u.id AND NOT p.demo))::int AS ativos
                  FROM usuarios u LEFT JOIN areas a ON a.id = u.area_id WHERE u.ativo GROUP BY 1, a.ordem ORDER BY a.ordem NULLS FIRST`),
    pool.query(`SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE fim < CURRENT_DATE)::int AS realizadas FROM campanhas`),
  ]);
  const by = (rows) => Object.fromEntries(rows.map(x => [x.area_id, x]));
  const A = by(acoes.rows), C = by(chk.rows), M = by(metas.rows);
  const linhas = areas.rows.map(a => {
    const ac = A[a.id] || { total: 0, concl: 0, no_prazo: 0, vencidas: 0 };
    const exec = ac.total ? Math.round(ac.concl / ac.total * 100) : 0;
    const sla = ac.concl ? Math.round(ac.no_prazo / ac.concl * 100) : 0;
    const ck = C[a.id]?.media ?? 0;
    const meta = M[a.id]?.ating ?? 0;
    const indice = Math.round((Math.min(meta, 100) * 0.4) + (ck * 0.3) + (exec * 0.3));
    return { id: a.id, nome: a.nome, resp: a.resp, execucao: exec, sla, checklist: ck, checklists: C[a.id]?.qtd || 0, meta, indice, vencidas: ac.vencidas, acoes: ac.total };
  });
  const tot = acoes.rows.reduce((s, x) => ({ c: s.c + x.concl, p: s.p + x.no_prazo }), { c: 0, p: 0 });
  const media = arr => arr.length ? Math.round(arr.reduce((s, v) => s + v, 0) / arr.length) : 0;
  res.json({
    cursosConcluidos: cursos.rows[0].concl,
    execucaoCalendario: cal.rows[0].total ? Math.round(cal.rows[0].realizadas / cal.rows[0].total * 100) : 0,
    aderencia: media(linhas.filter(l => l.checklists).map(l => l.checklist)),
    slaAcoes: tot.c ? Math.round(tot.p / tot.c * 100) : 0,
    areas: linhas,
    engajamento: engaj.rows,
  });
});

// Busca geral (barra superior) e base do assistente.
async function buscar(termo) {
  const t = `%${termo}%`;
  const [ar, ac, cu, ca, ch, ct] = await Promise.all([
    pool.query(`SELECT id, nome FROM areas WHERE nome ILIKE $1 OR tag ILIKE $1 OR papel ILIKE $1 OR conteudo::text ILIKE $1 LIMIT 6`, [t]),
    pool.query(`SELECT a.id, a.titulo, a.area_id, a.status FROM acoes a WHERE a.titulo ILIKE $1 OR a.descricao ILIKE $1 ORDER BY a.prazo NULLS LAST LIMIT 6`, [t]),
    pool.query(`SELECT id, titulo, area_id FROM cursos WHERE titulo ILIKE $1 LIMIT 6`, [t]),
    pool.query(`SELECT id, nome, marca, inicio, fim FROM campanhas WHERE nome ILIKE $1 ORDER BY inicio LIMIT 6`, [t]),
    pool.query(`SELECT id, nome, area_id, itens FROM checklist_modelos WHERE nome ILIKE $1 OR itens::text ILIKE $1 LIMIT 6`, [t]),
    pool.query(`SELECT id, titulo, tipo, area_id FROM conteudos WHERE titulo ILIKE $1 OR corpo ILIKE $1 LIMIT 6`, [t]),
  ]);
  return {
    areas: ar.rows, acoes: ac.rows, cursos: cu.rows,
    campanhas: ca.rows.map(c => ({ ...c, periodo: `${ddmm(c.inicio)}–${ddmm(c.fim)}` })),
    checklists: ch.rows.map(c => ({ id: c.id, nome: c.nome, area_id: c.area_id })), conteudos: ct.rows,
  };
}
r.get('/busca', async (req, res) => {
  const q = String(req.query.q || '').trim();
  if (q.length < 2) return res.json({});
  res.json(await buscar(q));
});

// Assistente: responde a partir dos guias cadastrados (busca na base de conhecimento).
// A IA generativa entra na fase evolutiva, com a chave da operadora contratada pelo Grupo Milla.
const PARADAS = new Set('a o e de da do das dos em no na nos nas um uma para por com como qual quais que é o os as ao à se sobre minha meu'.split(' '));
r.post('/assistente', async (req, res) => {
  const pergunta = String(req.body?.pergunta || '').trim().slice(0, 300);
  if (!pergunta) return res.status(400).json({ erro: 'Escreva a pergunta.' });
  const palavras = pergunta.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').split(/[^a-z0-9]+/).filter(p => p.length > 2 && !PARADAS.has(p));
  const { rows: areas } = await pool.query('SELECT id, nome, resp, papel, conteudo FROM areas ORDER BY ordem');
  const { rows: chks } = await pool.query('SELECT area_id, nome, itens FROM checklist_modelos WHERE ativo');
  const norm = s => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const trechos = [];
  const add = (area, titulo, itens) => {
    const txt = norm(titulo + ' ' + itens.join(' ') + ' ' + area.nome);
    const nota = palavras.reduce((s, p) => s + (txt.includes(p) ? (norm(titulo + ' ' + area.nome).includes(p) ? 3 : 1) : 0), 0);
    if (nota > 0) trechos.push({ nota, area: area.nome, titulo, itens });
  };
  for (const a of areas) {
    const c = a.conteudo || {};
    if (c.rotina) {
      add(a, 'Rotina diária', c.rotina.diaria || []);
      add(a, 'Rotina semanal', c.rotina.semanal || []);
      add(a, 'Programação mensal', c.rotina.mensal || []);
    }
    (c.pilares || []).forEach(p => add(a, `Pilar: ${p[0]}`, [p[1]]));
    (c.fases || []).forEach(f => add(a, `Campanha — ${f[0]}`, f[2]));
    add(a, 'Papel da função', [a.papel || '']);
  }
  chks.forEach(c => { const a = areas.find(x => x.id === c.area_id); if (a) add(a, `Checklist: ${c.nome}`, c.itens); });
  trechos.sort((x, y) => y.nota - x.nota);
  const top = trechos.slice(0, 3);
  if (!top.length) return res.json({ resposta: null, trechos: [] });
  res.json({ resposta: top, fontes: [...new Set(top.map(t => `Guia — ${t.area}`))] });
});

module.exports = r;
