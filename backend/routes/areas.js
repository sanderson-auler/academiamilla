// /api/cadastro-areas — cadastro de áreas: criar, editar identidade, abas visíveis, chips, ordem e ativar/desativar.
// Área nunca é excluída: inativa some das telas, mas metas, ações, checklists, cursos e o agente de IA ficam guardados.
const { Router } = require('express');
const { pool } = require('../db');
const { exigirLogin } = require('../lib/auth');
const { permissoesDe } = require('../lib/rbac');

const r = Router();
r.use(exigirLogin);

const ABAS = ['visao', 'kpis', 'metas', 'acao', 'check', 'treino', 'rotina', 'guia', 'ia', 'arquivos'];
const CHIPS = ['metas', 'kpis', 'check', 'cursos'];
const ICONES = ['users', 'check', 'layers', 'spark', 'cart', 'card', 'chart', 'cap', 'book', 'medal', 'cal', 'kanban', 'grid', 'home', 'gear'];
const txt = (v, max = 300) => String(v ?? '').trim().slice(0, max);
const cor = v => (/^#[0-9a-f]{6}$/i.test(v || '') ? v.toUpperCase() : null);
const lista = (v, ok) => (Array.isArray(v) ? [...new Set(v.map(String).filter(x => ok.includes(x)))] : null);
function escurecer(hex, f = 0.62) {
  const n = parseInt(hex.slice(1), 16), c = s => Math.round(((n >> s) & 255) * f).toString(16).padStart(2, '0');
  return `#${c(16)}${c(8)}${c(0)}`.toUpperCase();
}
const grad = hex => `linear-gradient(135deg,${hex},${escurecer(hex)})`;
const slug = s => txt(s, 60).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'area';

async function eu(req) {
  const { rows: [u] } = await pool.query('SELECT id, nome, perfil, area_id FROM usuarios WHERE id = $1', [req.usuario.sub]);
  return { ...u, perm: await permissoesDe(u?.perfil) };
}
const admin = u => (u.perm.rbac || 0) >= 2;

r.get('/', async (req, res) => {
  const u = await eu(req);
  if (!admin(u) && !u.area_id) return res.status(403).json({ erro: 'Seu perfil não gerencia áreas.' });
  const { rows } = await pool.query(`
    SELECT a.id, a.nome, a.resp, a.cargo, a.cor, a.grad, a.ic, a.tag, a.papel, a.ordem, a.ativo, a.abas, a.chips, a.atualizado_em, a.atualizado_por,
           (SELECT COUNT(*) FROM usuarios x WHERE x.area_id = a.id AND x.ativo)::int AS usuarios,
           (SELECT COUNT(*) FROM acoes x WHERE x.area_id = a.id AND x.status <> 'Concluído')::int AS acoes_abertas,
           (SELECT COUNT(*) FROM indicadores x WHERE x.area_id = a.id)::int AS indicadores,
           (SELECT COUNT(*) FROM checklist_modelos x WHERE x.area_id = a.id AND x.ativo)::int AS checklists,
           (SELECT COUNT(*) FROM curso_areas x WHERE x.area_id = a.id)::int AS cursos
      FROM areas a ORDER BY a.ativo DESC, a.ordem, a.nome`);
  const { rows: usuarios } = await pool.query('SELECT id, nome, cargo, area_id FROM usuarios WHERE ativo ORDER BY nome');
  res.json({ areas: admin(u) ? rows : rows.filter(a => a.id === u.area_id), usuarios, admin: admin(u), abas: ABAS, chips: CHIPS, icones: ICONES });
});

function dados(b, atual = {}) {
  const c = cor(b.cor) || atual.cor || '#0B3D4D';
  return {
    nome: txt(b.nome, 80) || atual.nome, resp: b.resp !== undefined ? txt(b.resp, 80) : atual.resp, cargo: b.cargo !== undefined ? txt(b.cargo, 80) : atual.cargo,
    tag: b.tag !== undefined ? txt(b.tag, 120) : atual.tag, papel: b.papel !== undefined ? txt(b.papel, 600) : atual.papel,
    cor: c, grad: atual.grad && c === atual.cor ? atual.grad : grad(c), ic: ICONES.includes(b.ic) ? b.ic : atual.ic || 'grid',
  };
}

r.post('/', async (req, res) => {
  const u = await eu(req);
  if (!admin(u)) return res.status(403).json({ erro: 'Somente o perfil com Configurações pode criar áreas.' });
  const b = req.body || {};
  if (!txt(b.nome)) return res.status(400).json({ erro: 'Informe o nome da área.' });
  const d = dados(b);
  let id = slug(b.nome), n = 1;
  while ((await pool.query('SELECT 1 FROM areas WHERE id = $1', [id])).rowCount) id = `${slug(b.nome)}-${++n}`;
  const abas = lista(b.abas, ABAS) || ABAS, chips = lista(b.chips, CHIPS) || CHIPS;
  await pool.query(
    `INSERT INTO areas (id, nome, resp, cargo, cor, grad, ic, tag, papel, ordem, conteudo, ativo, abas, chips, atualizado_em, atualizado_por)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,(SELECT COALESCE(MAX(ordem),0)+1 FROM areas),
             '{"pilares":[],"rotina":{"diaria":[],"semanal":[],"mensal":[]},"videos":[]}'::jsonb, TRUE, $10, $11, now(), $12)`,
    [id, d.nome, d.resp, d.cargo, d.cor, d.grad, d.ic, d.tag, d.papel, JSON.stringify(abas), JSON.stringify(chips), u.nome]);
  // Toda área nasce com o seu agente de IA.
  await pool.query(
    `INSERT INTO ia_agentes (codigo, area_id, nome, descricao, saudacao, sugestoes, instrucoes)
     VALUES ($1, $1, $2, $3, $4, $5::jsonb, $6) ON CONFLICT (codigo) DO NOTHING`,
    [id, `IA · ${d.nome}`, `Agente da área ${d.nome}: responde com base no guia da área e nos conteúdos publicados.`,
     `Olá! Sou a IA da ${d.nome}. Posso ajudar com rotina, checklists, metas, plano de ação e campanhas da área.`,
     JSON.stringify([`Qual a rotina da ${d.nome}?`, 'Quais são as prioridades da área?']),
     `Ajude a equipe da ${d.nome} a executar a rotina com disciplina, sempre com o próximo passo prático.`]);
  res.status(201).json({ id });
});

r.put('/:id', async (req, res) => {
  const u = await eu(req);
  const { rows: [a] } = await pool.query('SELECT * FROM areas WHERE id = $1', [req.params.id]);
  if (!a) return res.status(404).json({ erro: 'Área não encontrada.' });
  if (!admin(u) && u.area_id !== a.id) return res.status(403).json({ erro: 'Você só pode editar a sua área.' });
  const b = req.body || {};
  const d = dados(b, a);
  // O responsável da área edita a identidade; abas e chips ficam com quem tem Configurações.
  const abas = admin(u) ? lista(b.abas, ABAS) || a.abas : a.abas;
  const chips = admin(u) ? lista(b.chips, CHIPS) || a.chips : a.chips;
  if (!abas.length) return res.status(400).json({ erro: 'Deixe pelo menos uma aba visível.' });
  await pool.query(`UPDATE areas SET nome=$2, resp=$3, cargo=$4, cor=$5, grad=$6, ic=$7, tag=$8, papel=$9, abas=$10, chips=$11, atualizado_em=now(), atualizado_por=$12 WHERE id=$1`,
    [a.id, d.nome, d.resp, d.cargo, d.cor, d.grad, d.ic, d.tag, d.papel, JSON.stringify(abas), JSON.stringify(chips), u.nome]);
  if (d.nome !== a.nome) await pool.query(`UPDATE ia_agentes SET nome = $2 WHERE codigo = $1 AND nome = $3`, [a.id, `IA · ${d.nome}`, `IA · ${a.nome}`]);
  res.json({ ok: true });
});

r.patch('/:id/ativo', async (req, res) => {
  const u = await eu(req);
  if (!admin(u)) return res.status(403).json({ erro: 'Somente o perfil com Configurações pode ativar ou desativar áreas.' });
  const ativo = req.body?.ativo !== false;
  if (!ativo) {
    const { rows: [{ n }] } = await pool.query('SELECT COUNT(*)::int AS n FROM areas WHERE ativo AND id <> $1', [req.params.id]);
    if (!n) return res.status(400).json({ erro: 'Mantenha pelo menos uma área ativa.' });
  }
  const { rowCount } = await pool.query('UPDATE areas SET ativo = $2, atualizado_em = now(), atualizado_por = $3 WHERE id = $1', [req.params.id, ativo, u.nome]);
  if (!rowCount) return res.status(404).json({ erro: 'Área não encontrada.' });
  res.json({ ok: true, ativo });
});

r.put('/ordem/salvar', async (req, res) => {
  const u = await eu(req);
  if (!admin(u)) return res.status(403).json({ erro: 'Somente o perfil com Configurações pode ordenar as áreas.' });
  const ids = Array.isArray(req.body?.ids) ? req.body.ids.map(String) : [];
  for (const [i, id] of ids.entries()) await pool.query('UPDATE areas SET ordem = $2 WHERE id = $1', [id, i]);
  res.json({ ok: true });
});

module.exports = r;
