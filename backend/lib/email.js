// Envio de e-mail usando a configuração SMTP salva na administração (tabela config_email).
const nodemailer = require('nodemailer');
const { pool } = require('../db');

// Chave de cifragem da senha SMTP no banco: SESSION_SECRET do backend/.env.
// NÃO troque o SESSION_SECRET depois de salvar o SMTP (a senha salva deixaria de abrir;
// se trocar, basta salvar a senha de novo na tela).
const chave = () => process.env.SESSION_SECRET;

async function obterConfig({ comSenha = false } = {}) {
  const { rows } = await pool.query(
    `SELECT host, porta, seguranca, usuario, remetente_nome, remetente_email, atualizado_em,
            senha_cifrada IS NOT NULL AS senha_definida
            ${comSenha ? ', pgp_sym_decrypt(senha_cifrada, $1) AS senha' : ''}
       FROM config_email WHERE id = 1`,
    comSenha ? [chave()] : []
  );
  return rows[0] || null;
}

function criarTransporte(cfg) {
  return nodemailer.createTransport({
    host: cfg.host,
    port: cfg.porta,
    secure: cfg.seguranca === 'ssl',
    requireTLS: cfg.seguranca === 'starttls',
    auth: cfg.usuario ? { user: cfg.usuario, pass: cfg.senha || '' } : undefined,
    connectionTimeout: 15000,
  });
}

async function enviarEmail({ para, assunto, html, texto }) {
  const cfg = await obterConfig({ comSenha: true });
  if (!cfg) throw new Error('O envio de e-mail ainda não foi configurado na administração.');
  return criarTransporte(cfg).sendMail({
    from: `"${cfg.remetente_nome.replace(/"/g, '')}" <${cfg.remetente_email}>`,
    to: para,
    subject: assunto,
    text: texto,
    html,
  });
}

module.exports = { chave, obterConfig, enviarEmail };
