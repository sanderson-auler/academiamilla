// Gamificação: crédito de pontos por execução real e cálculo de nível.
const { pool } = require('../db');

const REGRAS = {
  curso: 100, aula: 10, checklist: 30, checklist_bonus: 20,
  acao_prazo: 25, comite: 20, meta_batida: 200, meta_acelerador: 300,
};

const NIVEIS = [
  { nome: 'Bronze', min: 0, cor: '#cd7f32' },
  { nome: 'Prata', min: 1000, cor: '#9AA7AE' },
  { nome: 'Ouro', min: 2000, cor: '#E0A82E' },
  { nome: 'Diamante', min: 3000, cor: '#5BC0EB' },
  { nome: 'Master Milla', min: 4000, cor: '#C8102E' },
];

function nivel(total) {
  let i = 0;
  NIVEIS.forEach((n, k) => { if (total >= n.min) i = k; });
  const prox = NIVEIS[i + 1] || null;
  const pct = prox ? Math.round(((total - NIVEIS[i].min) / (prox.min - NIVEIS[i].min)) * 100) : 100;
  return { ...NIVEIS[i], proximo: prox?.nome || null, faltam: prox ? prox.min - total : 0, pct };
}

async function creditar(usuarioId, pontos, motivo, ref = null, cliente = pool) {
  if (!usuarioId || !pontos) return;
  await cliente.query('INSERT INTO pontos (usuario_id, pontos, motivo, ref) VALUES ($1, $2, $3, $4)', [usuarioId, pontos, motivo, ref]);
}

async function totalDe(usuarioId) {
  const { rows } = await pool.query('SELECT COALESCE(SUM(pontos),0)::int AS t FROM pontos WHERE usuario_id = $1', [usuarioId]);
  return rows[0].t;
}

module.exports = { REGRAS, NIVEIS, nivel, creditar, totalDe };
