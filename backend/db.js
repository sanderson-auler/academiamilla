// Conexão com o PostgreSQL (container "postgres" na rede docker "proxy").
// Variáveis padrão do driver pg: PGHOST, PGPORT, PGDATABASE, PGUSER, PGPASSWORD.
const { Pool } = require('pg');

const pool = new Pool({ max: 10, idleTimeoutMillis: 30000 });
pool.on('connect', c => c.query("SET TIME ZONE 'America/Sao_Paulo'"));
pool.on('error', e => console.error('[pg] erro no pool:', e.message));

module.exports = { pool };
