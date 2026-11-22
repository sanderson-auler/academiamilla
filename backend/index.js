// Academia Milla 360 — API
// Esqueleto técnico: sobe o servidor, conecta no PostgreSQL e expõe a rota de saúde.
require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const { pool } = require('./db');
const pkg = require('./package.json');

const app = express();
app.set('trust proxy', 1); // atrás do Nginx Proxy Manager
app.use(helmet());
app.use(express.json({ limit: '2mb' }));

const origens = (process.env.CORS_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
app.use(cors({ origin: (origem, cb) => cb(null, !origem || origens.includes(origem)) }));

// Saúde: usada pelo deploy.sh, pelo healthcheck do Docker e pela tela inicial.
app.get('/api/saude', async (req, res) => {
  const base = { api: 'online', versao: pkg.version };
  try {
    const { rows } = await pool.query(
      `select now() as agora,
              current_setting('TimeZone') as fuso,
              (select extversion from pg_extension where extname = 'vector') as pgvector`
    );
    res.json({ ...base, banco: 'online', ...rows[0] });
  } catch (e) {
    console.error('[saude] banco indisponível:', e.message);
    res.status(503).json({ ...base, banco: 'offline' });
  }
});

app.use('/api', (req, res) => res.status(404).json({ erro: 'Rota não encontrada' }));

app.use((err, req, res, next) => {
  console.error('[erro]', err);
  res.status(500).json({ erro: 'Erro interno' });
});

const porta = Number(process.env.PORT) || 3000;
app.listen(porta, () => console.log(`Academia Milla 360 API ${pkg.version} na porta ${porta}`));
