// Autenticação: hash de senha, token JWT e middlewares de acesso.
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const SEGREDO = process.env.JWT_SECRET;
if (!SEGREDO) throw new Error('JWT_SECRET não definido no backend/.env');

const hashSenha = s => bcrypt.hash(s, 12);
const conferirSenha = (s, h) => bcrypt.compare(s, h);

function gerarToken(u) {
  return jwt.sign({ sub: u.id, nome: u.nome, perfil: u.perfil }, SEGREDO, { expiresIn: '8h' });
}

function exigirLogin(req, res, next) {
  const [tipo, token] = (req.headers.authorization || '').split(' ');
  if (tipo !== 'Bearer' || !token) return res.status(401).json({ erro: 'Sessão expirada. Entre novamente.' });
  try {
    req.usuario = jwt.verify(token, SEGREDO);
    next();
  } catch {
    res.status(401).json({ erro: 'Sessão expirada. Entre novamente.' });
  }
}

function exigirAdmin(req, res, next) {
  if (req.usuario?.perfil !== 'admin') return res.status(403).json({ erro: 'Acesso restrito à administração.' });
  next();
}

const emailValido = e => typeof e === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.trim());

module.exports = { hashSenha, conferirSenha, gerarToken, exigirLogin, exigirAdmin, emailValido };
