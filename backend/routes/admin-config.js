// /api/admin/config — configurações do sistema mantidas pela administração.
// E-mail (SMTP): consultar, salvar, remover e enviar teste.
const { Router } = require('express');
const { pool } = require('../db');
const { exigirLogin, exigirAdmin, emailValido } = require('../lib/auth');
const { chave, obterConfig, enviarEmail } = require('../lib/email');

const r = Router();
r.use(exigirLogin, exigirAdmin);

r.get('/email', async (req, res) => {
  const cfg = await obterConfig();
  res.json(cfg ? { configurado: true, ...cfg } : { configurado: false });
});

r.put('/email', async (req, res) => {
  const b = req.body || {};
  const host = String(b.host || '').trim();
  const porta = Number(b.porta);
  const seguranca = String(b.seguranca || '');
  const usuario = String(b.usuario || '').trim() || null;
  let senha = typeof b.senha === 'string' && b.senha !== '' ? b.senha : null; // vazio = manter a atual
  if (senha && host === 'smtp.gmail.com') senha = senha.replace(/\s+/g, ''); // senha de app do Google vem em blocos com espaço
  const remetenteNome = String(b.remetente_nome || '').trim();
  const remetenteEmail = String(b.remetente_email || '').trim().toLowerCase();

  if (!host) return res.status(400).json({ erro: 'Informe o servidor SMTP.' });
  if (!Number.isInteger(porta) || porta < 1 || porta > 65535) return res.status(400).json({ erro: 'Porta inválida.' });
  if (!['ssl', 'starttls', 'nenhuma'].includes(seguranca)) return res.status(400).json({ erro: 'Escolha o tipo de segurança.' });
  if (!remetenteNome) return res.status(400).json({ erro: 'Informe o nome do remetente.' });
  if (!emailValido(remetenteEmail)) return res.status(400).json({ erro: 'Informe um e-mail de remetente válido.' });

  await pool.query(
    `INSERT INTO config_email (id, host, porta, seguranca, usuario, senha_cifrada, remetente_nome, remetente_email, atualizado_em, atualizado_por)
     VALUES (1, $1, $2, $3, $4, CASE WHEN $5::text IS NULL THEN NULL ELSE pgp_sym_encrypt($5::text, $6::text) END, $7, $8, now(), $9)
     ON CONFLICT (id) DO UPDATE SET
       host = EXCLUDED.host, porta = EXCLUDED.porta, seguranca = EXCLUDED.seguranca, usuario = EXCLUDED.usuario,
       senha_cifrada = CASE WHEN $5::text IS NULL THEN config_email.senha_cifrada ELSE EXCLUDED.senha_cifrada END,
       remetente_nome = EXCLUDED.remetente_nome, remetente_email = EXCLUDED.remetente_email,
       atualizado_em = now(), atualizado_por = EXCLUDED.atualizado_por`,
    [host, porta, seguranca, usuario, senha, chave(), remetenteNome, remetenteEmail, req.usuario.sub]
  );
  res.json({ configurado: true, ...(await obterConfig()) });
});

r.delete('/email', async (req, res) => {
  await pool.query('DELETE FROM config_email WHERE id = 1');
  res.json({ configurado: false });
});

r.post('/email/teste', async (req, res) => {
  const para = String(req.body?.para || '').trim();
  if (!emailValido(para)) return res.status(400).json({ erro: 'Informe um e-mail válido para o teste.' });
  try {
    await enviarEmail({
      para,
      assunto: 'Academia Milla 360 — teste de envio de e-mail',
      texto: 'Este é um e-mail de teste da Academia Milla 360. Se você recebeu, a configuração de envio está funcionando.',
      html: '<p>Este é um e-mail de teste da <b>Academia Milla 360</b>.</p><p>Se você recebeu, a configuração de envio está funcionando.</p>',
    });
    res.json({ ok: true });
  } catch (e) {
    res.status(502).json({ erro: `O servidor de e-mail recusou o envio: ${e.message}` });
  }
});

module.exports = r;
