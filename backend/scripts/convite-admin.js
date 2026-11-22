// Gera um convite de uso único (válido por 24 h) para criar um administrador.
// Uso na VPS: docker exec academiamilla-api node scripts/convite-admin.js
require('dotenv').config();
const crypto = require('crypto');
const { pool } = require('../db');
const { migrar } = require('../migrar');

(async () => {
  await migrar();
  const token = crypto.randomBytes(24).toString('hex');
  const hash = crypto.createHash('sha256').update(token).digest('hex');
  await pool.query(`INSERT INTO convites_admin (token_hash, expira_em) VALUES ($1, now() + interval '24 hours')`, [hash]);
  const { rows } = await pool.query(`SELECT count(*)::int AS n FROM usuarios WHERE perfil = 'admin' AND ativo`);
  const base = (process.env.APP_URL || 'https://app.academiamilla.tech').replace(/\/$/, '');
  console.log(`Administradores ativos hoje: ${rows[0].n}`);
  console.log('Link de primeiro acesso (uso único, válido por 24 horas):');
  console.log(`${base}/primeiro-acesso?token=${token}`);
  await pool.end();
})().catch(async e => {
  console.error('Erro ao gerar convite:', e.message);
  process.exit(1);
});
