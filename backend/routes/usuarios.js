// /api/gestao — usuários, perfis (RBAC), lojas e dados de demonstração.
const crypto = require('crypto');
const { Router } = require('express');
const { pool } = require('../db');
const { exigirLogin, emailValido, hashSenha } = require('../lib/auth');
const { pode, perfis, limparCache, MODULOS } = require('../lib/rbac');
const { enviarEmail, obterConfig } = require('../lib/email');

const r = Router();
r.use(exigirLogin);
const sha256 = t => crypto.createHash('sha256').update(String(t)).digest('hex');
const txt = (v, max = 200) => String(v ?? '').trim().slice(0, max);

r.get('/usuarios', pode('rbac', 1), async (req, res) => {
  const { rows } = await pool.query(
    `SELECT u.id, u.nome, u.email, u.perfil, u.cargo, u.area_id, a.nome AS area, u.marca, u.loja_id, l.nome AS loja, u.ativo, u.demo, u.ultimo_acesso,
            EXISTS (SELECT 1 FROM convites_usuario c WHERE c.usuario_id = u.id AND c.usado_em IS NULL AND c.expira_em > now()) AS convite_pendente
       FROM usuarios u LEFT JOIN areas a ON a.id = u.area_id LEFT JOIN lojas l ON l.id = u.loja_id ORDER BY u.ativo DESC, u.nome`);
  res.json(rows);
});

async function gerarConvite(usuarioId) {
  const token = crypto.randomBytes(32).toString('base64url');
  await pool.query('UPDATE convites_usuario SET expira_em = now() WHERE usuario_id = $1 AND usado_em IS NULL', [usuarioId]);
  await pool.query(`INSERT INTO convites_usuario (usuario_id, token_hash, expira_em) VALUES ($1, $2, now() + interval '72 hours')`, [usuarioId, sha256(token)]);
  return `${(process.env.APP_URL || 'https://app.academiamilla.tech').replace(/\/$/, '')}/definir-senha?token=${token}`;
}

async function enviarConvite(u, link) {
  if (!(await obterConfig())) return false;
  try {
    await enviarEmail({
      para: u.email,
      assunto: 'Seu acesso à Academia Milla 360',
      texto: `Olá, ${u.nome}!\n\nSeu acesso à Academia Milla 360 foi criado. Defina sua senha pelo link abaixo (válido por 72 horas):\n${link}\n\nGrupo Milla`,
      html: `<div style="font-family:Segoe UI,Arial,sans-serif;max-width:520px"><h2 style="color:#0B3D4D">Academia Milla 360</h2>
        <p>Olá, <b>${u.nome.replace(/</g, '')}</b>!</p><p>Seu acesso à plataforma foi criado. Defina sua senha pelo botão abaixo (link válido por 72 horas).</p>
        <p><a href="${link}" style="background:#C8102E;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:700">Definir minha senha</a></p>
        <p style="color:#5B6B73;font-size:12px">Se o botão não abrir, copie este endereço no navegador:<br>${link}</p></div>`,
    });
    return true;
  } catch (e) {
    console.error('[convite] falha no e-mail:', e.message);
    return false;
  }
}

async function enviarRedefinicao(u, link) {
  if (!(await obterConfig())) return false;
  try {
    await enviarEmail({
      para: u.email,
      assunto: 'Redefinição de senha — Academia Milla 360',
      texto: `Olá, ${u.nome}!\n\nRecebemos um pedido para redefinir a sua senha na Academia Milla 360. Crie a nova senha pelo link abaixo (válido por 72 horas):\n${link}\n\nSe você não pediu a redefinição, desconsidere este e-mail: a senha atual continua valendo.\n\nGrupo Milla`,
      html: `<div style="font-family:Segoe UI,Arial,sans-serif;max-width:520px"><h2 style="color:#0B3D4D">Academia Milla 360</h2>
        <p>Olá, <b>${u.nome.replace(/</g, '')}</b>!</p><p>Recebemos um pedido para redefinir a sua senha. Crie a nova senha pelo botão abaixo (link válido por 72 horas).</p>
        <p><a href="${link}" style="background:#C8102E;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:700">Criar nova senha</a></p>
        <p style="color:#5B6B73;font-size:12px">Se você não pediu a redefinição, desconsidere este e-mail: a senha atual continua valendo.<br>Se o botão não abrir, copie este endereço no navegador:<br>${link}</p></div>`,
    });
    return true;
  } catch (e) {
    console.error('[senha] falha no e-mail:', e.message);
    return false;
  }
}

function dadosUsuario(b, ps) {
  return {
    nome: txt(b.nome, 120),
    email: txt(b.email, 160).toLowerCase(),
    perfil: ps[b.perfil] ? b.perfil : null,
    cargo: txt(b.cargo, 120) || null,
    area_id: txt(b.area_id, 40) || null,
    marca: txt(b.marca, 40) || null,
    loja_id: b.loja_id ? Number(b.loja_id) : null,
  };
}

r.post('/usuarios', pode('rbac', 2), async (req, res) => {
  const d = dadosUsuario(req.body || {}, await perfis());
  if (!d.nome) return res.status(400).json({ erro: 'Informe o nome.' });
  if (!emailValido(d.email)) return res.status(400).json({ erro: 'Informe um e-mail válido.' });
  if (!d.perfil) return res.status(400).json({ erro: 'Escolha o perfil de acesso.' });
  const existe = await pool.query('SELECT 1 FROM usuarios WHERE email = $1', [d.email]);
  if (existe.rowCount) return res.status(409).json({ erro: 'Já existe um usuário com este e-mail.' });
  const senhaTemp = crypto.randomBytes(24).toString('hex');
  const bcrypt = require('bcryptjs');
  const { rows } = await pool.query(
    `INSERT INTO usuarios (nome, email, senha_hash, perfil, cargo, area_id, marca, loja_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id, nome, email`,
    [d.nome, d.email, await bcrypt.hash(senhaTemp, 10), d.perfil, d.cargo, d.area_id, d.marca, d.loja_id]);
  const link = await gerarConvite(rows[0].id);
  const enviado = await enviarConvite(rows[0], link);
  res.status(201).json({ ...rows[0], link, emailEnviado: enviado });
});

r.patch('/usuarios/:id', pode('rbac', 2), async (req, res) => {
  const b = req.body || {};
  const { rows: [u] } = await pool.query('SELECT * FROM usuarios WHERE id = $1', [req.params.id]);
  if (!u) return res.status(404).json({ erro: 'Usuário não encontrado.' });
  const d = dadosUsuario({ ...u, ...b }, await perfis());
  if (!d.nome || !emailValido(d.email) || !d.perfil) return res.status(400).json({ erro: 'Confira nome, e-mail e perfil.' });
  if (u.id === req.usuario.sub && (d.perfil !== u.perfil || b.ativo === false)) return res.status(400).json({ erro: 'Você não pode alterar o próprio perfil nem se desativar.' });
  const dup = await pool.query('SELECT 1 FROM usuarios WHERE email = $1 AND id <> $2', [d.email, u.id]);
  if (dup.rowCount) return res.status(409).json({ erro: 'Já existe outro usuário com este e-mail.' });
  const ativo = b.ativo === undefined ? u.ativo : !!b.ativo;
  const { rows } = await pool.query(
    `UPDATE usuarios SET nome=$2, email=$3, perfil=$4, cargo=$5, area_id=$6, marca=$7, loja_id=$8, ativo=$9 WHERE id=$1 RETURNING id, nome, email, perfil, ativo`,
    [u.id, d.nome, d.email, d.perfil, d.cargo, d.area_id, d.marca, d.loja_id, ativo]);
  res.json(rows[0]);
});

r.post('/usuarios/:id/convite', pode('rbac', 2), async (req, res) => {
  const { rows: [u] } = await pool.query('SELECT id, nome, email FROM usuarios WHERE id = $1 AND ativo', [req.params.id]);
  if (!u) return res.status(404).json({ erro: 'Usuário não encontrado ou inativo.' });
  const link = await gerarConvite(u.id);
  res.json({ link, emailEnviado: await enviarConvite(u, link) });
});

// Redefinição de senha pela administração:
//  { modo: 'definir', senha } → grava a nova senha na hora (mín. 8 caracteres) e cancela links pendentes;
//  { modo: 'link', enviarEmail } → gera o link de 72 h (o mesmo do convite) e, se pedido, envia ao e-mail do usuário.
r.post('/usuarios/:id/senha', pode('rbac', 2), async (req, res) => {
  const { rows: [u] } = await pool.query('SELECT id, nome, email FROM usuarios WHERE id = $1 AND ativo', [req.params.id]);
  if (!u) return res.status(404).json({ erro: 'Usuário não encontrado ou inativo.' });
  const b = req.body || {};
  if (b.modo === 'definir') {
    const senha = String(b.senha || '');
    if (senha.length < 8) return res.status(400).json({ erro: 'A senha precisa ter pelo menos 8 caracteres.' });
    await pool.query('UPDATE usuarios SET senha_hash = $2, demo = FALSE WHERE id = $1', [u.id, await hashSenha(senha)]);
    await pool.query('UPDATE convites_usuario SET expira_em = now() WHERE usuario_id = $1 AND usado_em IS NULL', [u.id]);
    return res.json({ ok: true, modo: 'definir' });
  }
  const enviar = b.enviarEmail !== false;
  const link = await gerarConvite(u.id);
  res.json({ modo: 'link', link, email: u.email, enviarEmail: enviar, emailEnviado: enviar ? await enviarRedefinicao(u, link) : false });
});

// ---------- Perfis (RBAC) ----------
r.get('/perfis', async (req, res) => {
  res.json({ modulos: MODULOS, perfis: Object.values(await perfis()) });
});

r.put('/perfis/:codigo', pode('rbac', 2), async (req, res) => {
  if (req.params.codigo === 'admin') return res.status(400).json({ erro: 'O perfil Super Admin tem acesso total e não pode ser alterado.' });
  const p = req.body?.permissoes || {};
  const limpo = Object.fromEntries(MODULOS.map(m => [m, [0, 1, 2].includes(Number(p[m])) ? Number(p[m]) : 0]));
  const { rowCount } = await pool.query('UPDATE perfis SET permissoes = $2 WHERE codigo = $1', [req.params.codigo, JSON.stringify(limpo)]);
  if (!rowCount) return res.status(404).json({ erro: 'Perfil não encontrado.' });
  limparCache();
  res.json({ codigo: req.params.codigo, permissoes: limpo });
});

// ---------- Lojas ----------
r.get('/lojas', async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM lojas ORDER BY marca, nome');
  res.json(rows);
});

r.post('/lojas', pode('rbac', 2), async (req, res) => {
  const nome = txt(req.body?.nome, 120), marca = txt(req.body?.marca, 40);
  if (!nome) return res.status(400).json({ erro: 'Informe o nome da loja.' });
  const { rowCount } = await pool.query('SELECT 1 FROM marcas WHERE codigo = $1', [marca]);
  if (!rowCount) return res.status(400).json({ erro: 'Escolha a marca.' });
  const { rows } = await pool.query('INSERT INTO lojas (nome, marca, cidade) VALUES ($1,$2,$3) RETURNING *', [nome, marca, txt(req.body?.cidade, 80) || null]);
  res.status(201).json(rows[0]);
});

r.patch('/lojas/:id', pode('rbac', 2), async (req, res) => {
  const b = req.body || {};
  const { rows: [l] } = await pool.query('SELECT * FROM lojas WHERE id = $1', [req.params.id]);
  if (!l) return res.status(404).json({ erro: 'Loja não encontrada.' });
  const { rows } = await pool.query('UPDATE lojas SET nome=$2, cidade=$3, ativa=$4 WHERE id=$1 RETURNING *',
    [l.id, txt(b.nome, 120) || l.nome, b.cidade !== undefined ? txt(b.cidade, 80) || null : l.cidade, b.ativa === undefined ? l.ativa : !!b.ativa]);
  res.json(rows[0]);
});

// ---------- Dados de demonstração ----------
r.get('/demo', pode('rbac', 1), async (req, res) => {
  const { rows } = await pool.query(`SELECT
    (SELECT COUNT(*) FROM acoes WHERE demo)::int AS acoes, (SELECT COUNT(*) FROM metas WHERE demo)::int AS metas,
    (SELECT COUNT(*) FROM checklist_aplicacoes WHERE demo)::int AS checklists, (SELECT COUNT(*) FROM pontos WHERE demo)::int AS pontos,
    (SELECT COUNT(*) FROM comite_reunioes WHERE demo)::int AS reunioes, (SELECT COUNT(*) FROM conteudos WHERE demo)::int AS conteudos,
    (SELECT COUNT(*) FROM usuarios WHERE demo)::int AS usuarios`);
  res.json(rows[0]);
});

r.delete('/demo', pode('rbac', 2), async (req, res) => {
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    for (const t of ['acoes', 'metas', 'checklist_aplicacoes', 'pontos', 'comite_encaminhamentos', 'comite_reunioes', 'conteudos']) await c.query(`DELETE FROM ${t} WHERE demo`);
    await c.query('DELETE FROM curso_progresso p USING usuarios u WHERE u.id = p.usuario_id AND u.demo');
    await c.query(`UPDATE usuarios SET ativo = FALSE WHERE demo AND NOT EXISTS (SELECT 1 FROM convites_usuario cv WHERE cv.usuario_id = usuarios.id AND cv.usado_em IS NOT NULL)`);
    await c.query('COMMIT');
  } catch (e) { await c.query('ROLLBACK'); throw e; } finally { c.release(); }
  res.json({ ok: true });
});

module.exports = { router: r, sha256 };
