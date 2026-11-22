// Aplica, em ordem, os arquivos de db/migrations que ainda não rodaram.
// Cada arquivo roda numa transação; o nome fica registrado em schema_migracoes.
const fs = require('fs');
const path = require('path');
const { pool } = require('./db');

async function migrar() {
  const dir = path.join(__dirname, 'db', 'migrations');
  const arquivos = fs.readdirSync(dir).filter(f => f.endsWith('.sql')).sort();
  const c = await pool.connect();
  try {
    await c.query(`CREATE TABLE IF NOT EXISTS schema_migracoes (
      nome TEXT PRIMARY KEY, aplicada_em TIMESTAMPTZ NOT NULL DEFAULT now())`);
    const { rows } = await c.query('SELECT nome FROM schema_migracoes');
    const feitas = new Set(rows.map(r => r.nome));
    for (const arq of arquivos) {
      if (feitas.has(arq)) continue;
      const sql = fs.readFileSync(path.join(dir, arq), 'utf8');
      await c.query('BEGIN');
      try {
        await c.query(sql);
        await c.query('INSERT INTO schema_migracoes (nome) VALUES ($1)', [arq]);
        await c.query('COMMIT');
        console.log(`[migracao] aplicada: ${arq}`);
      } catch (e) {
        await c.query('ROLLBACK');
        throw new Error(`Falha na migração ${arq}: ${e.message}`);
      }
    }
  } finally {
    c.release();
  }
}

module.exports = { migrar };
