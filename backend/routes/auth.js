// /api/auth — entrar, sessão atual e primeiro acesso por convite.
const crypto = require('crypto');
const { Router } = require('express');
const { pool } = require('../db');
const { hashSenha, conferirSenha, gerarToken, exigirLogin, emailValido } = require('../lib/auth');

const r = Router();
const sha256 = t => crypto.createHash('sha256').update(String(t)).digest('hex');

// Limite simples de tentativas de login: 10 por IP a cada 15 minutos.
const tentativas = new Map();
function limitar(req, res, next) {
  const agora = Date.now(), ip = req.ip;
  const t = (tentativas.get(ip) || []).filter(x => agora - x < 15 * 60 * 1000);
  if (t.length >= 10) return res.status(429).json({ erro: 'Muitas tentativas. Aguarde alguns minutos e tente de novo.' });
  t.push(agora); tentativas.set(ip, t); next();
}

const publico = u => ({ id: u.id, nome: u.nome, email: u.email, perfil: u.perfil });

r.post('/login', limitar, async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const senha = String(req.body?.senha || '');
  if (!email || !senha) return res.status(400).json({ erro: 'Informe e-mail e senha.' });
  const { rows } = await pool.query('SELECT * FROM usuarios WHERE email = $1 AND ativo', [email]);
  const u = rows[0];
  if (!u || !(await conferirSenha(senha, u.senha_hash))) return res.status(401).json({ erro: 'E-mail ou senha inválidos.' });
  await pool.query('UPDATE usuarios SET ultimo_acesso = now() WHERE id = $1', [u.id]);
  res.json({ token: gerarToken(u), usuario: publico(u) });
});

r.get('/eu', exigirLogin, async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM usuarios WHERE id = $1 AND ativo', [req.usuario.sub]);
  if (!rows[0]) return res.status(401).json({ erro: 'Sessão expirada. Entre novamente.' });
  res.json(publico(rows[0]));
});

async function conviteValido(token) {
  const { rows } = await pool.query(
    'SELECT id FROM convites_admin WHERE token_hash = $1 AND usado_em IS NULL AND expira_em > now()',
    [sha256(token)]
  );
  return rows[0] || null;
}

r.get('/primeiro-acesso/:token', async (req, res) => {
  res.json({ valido: !!(await conviteValido(req.params.token)) });
});

r.post('/primeiro-acesso', limitar, async (req, res) => {
  const { token } = req.body || {};
  const nome = String(req.body?.nome || '').trim();
  const email = String(req.body?.email || '').trim().toLowerCase();
  const senha = String(req.body?.senha || '');
  if (!nome) return res.status(400).json({ erro: 'Informe o nome.' });
  if (!emailValido(email)) return res.status(400).json({ erro: 'Informe um e-mail válido.' });
  if (senha.length < 8) return res.status(400).json({ erro: 'A senha precisa ter pelo menos 8 caracteres.' });
  const convite = await conviteValido(token);
  if (!convite) return res.status(400).json({ erro: 'Convite inválido, expirado ou já utilizado. Gere um novo na VPS (opção 12).' });
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    const existe = await c.query('SELECT 1 FROM usuarios WHERE email = $1', [email]);
    if (existe.rowCount) { await c.query('ROLLBACK'); return res.status(409).json({ erro: 'Já existe um usuário com este e-mail.' }); }
    const { rows } = await c.query(
      `INSERT INTO usuarios (nome, email, senha_hash, perfil) VALUES ($1, $2, $3, 'admin') RETURNING *`,
      [nome, email, await hashSenha(senha)]
    );
    await c.query('UPDATE convites_admin SET usado_em = now(), usado_por = $2 WHERE id = $1', [convite.id, rows[0].id]);
    await c.query('COMMIT');
    res.status(201).json({ token: gerarToken(rows[0]), usuario: publico(rows[0]) });
  } catch (e) {
    await c.query('ROLLBACK');
    throw e;
  } finally {
    c.release();
  }
});

// ---------- Definição de senha por convite (usuários criados pela administração) ----------
async function conviteUsuario(token) {
  const { rows } = await pool.query(
    `SELECT c.id, c.usuario_id, u.nome, u.email FROM convites_usuario c JOIN usuarios u ON u.id = c.usuario_id
      WHERE c.token_hash = $1 AND c.usado_em IS NULL AND c.expira_em > now() AND u.ativo`, [sha256(token)]);
  return rows[0] || null;
}

r.get('/convite/:token', async (req, res) => {
  const c = await conviteUsuario(req.params.token);
  res.json(c ? { valido: true, nome: c.nome, email: c.email } : { valido: false });
});

r.post('/convite', limitar, async (req, res) => {
  const senha = String(req.body?.senha || '');
  if (senha.length < 8) return res.status(400).json({ erro: 'A senha precisa ter pelo menos 8 caracteres.' });
  const c = await conviteUsuario(req.body?.token);
  if (!c) return res.status(400).json({ erro: 'Link inválido, expirado ou já utilizado. Peça um novo à administração.' });
  await pool.query('UPDATE usuarios SET senha_hash = $2, demo = FALSE WHERE id = $1', [c.usuario_id, await hashSenha(senha)]);
  await pool.query('UPDATE convites_usuario SET usado_em = now() WHERE id = $1', [c.id]);
  const { rows } = await pool.query('SELECT * FROM usuarios WHERE id = $1', [c.usuario_id]);
  res.json({ token: gerarToken(rows[0]), usuario: publico(rows[0]) });
});

module.exports = r;
