// Controle de acesso por perfil (RBAC). Permissões vêm da tabela "perfis":
// { modulo: 0 sem acesso | 1 leitura | 2 total }. Cache de 30 s.
const { pool } = require('../db');

const MODULOS = ['exec', 'areas', 'cal', 'acao', 'comite', 'check', 'cms', 'ia', 'rbac'];
let cache = { em: 0, mapa: {} };

async function perfis() {
  if (Date.now() - cache.em < 30000) return cache.mapa;
  const { rows } = await pool.query('SELECT codigo, nome, ordem, permissoes FROM perfis ORDER BY ordem');
  cache = { em: Date.now(), mapa: Object.fromEntries(rows.map(r => [r.codigo, r])) };
  return cache.mapa;
}
const limparCache = () => { cache.em = 0; };

async function permissoesDe(perfil) {
  const p = (await perfis())[perfil];
  const base = Object.fromEntries(MODULOS.map(m => [m, 0]));
  return p ? { ...base, ...p.permissoes } : base;
}

// Middleware: exige nível mínimo (1 leitura, 2 total) no módulo.
function pode(modulo, nivel = 1) {
  return async (req, res, next) => {
    const p = await permissoesDe(req.usuario?.perfil);
    if ((p[modulo] || 0) >= nivel) return next();
    res.status(403).json({ erro: nivel >= 2 ? 'Seu perfil não tem permissão para alterar isto.' : 'Seu perfil não tem acesso a este módulo.' });
  };
}

module.exports = { MODULOS, perfis, permissoesDe, pode, limparCache };
