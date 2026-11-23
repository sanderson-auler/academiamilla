// Academia Milla 360 — API
require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const { pool } = require('./db');
const { migrar } = require('./migrar');
const pkg = require('./package.json');

const app = express();
app.set('trust proxy', 1); // atrás do Nginx Proxy Manager
app.use(helmet());
// Envio de arquivos para a base de conhecimento da IA (até 15 MB em base64).
app.use('/api/ia', express.json({ limit: '25mb' }));
app.use('/api/univ', express.json({ limit: '12mb' }));
app.use('/api/comite-gestao', express.json({ limit: '5mb' }));
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

app.use('/api/auth', require('./routes/auth'));
app.use('/api/admin/config', require('./routes/admin-config'));
app.use('/api/plataforma', require('./routes/plataforma'));
app.use('/api/gestao', require('./routes/usuarios').router);
app.use('/api/ia', require('./routes/ia'));
app.use('/api/univ', require('./routes/universidade'));
app.use('/api/cadastro-areas', require('./routes/areas'));
app.use('/api/comite-gestao', require('./routes/comite'));
app.use('/api/checklists-gestao', require('./routes/checklists'));
app.use('/api/arquivos', require('./routes/arquivos'));
app.use('/api', require('./routes/checklists').leitura);
app.use('/api', require('./routes/operacao'));

app.use('/api', (req, res) => res.status(404).json({ erro: 'Rota não encontrada' }));

app.use((err, req, res, next) => {
  console.error('[erro]', err);
  res.status(500).json({ erro: 'Erro interno. Tente novamente.' });
});

const porta = Number(process.env.PORT) || 3000;
migrar()
  .then(() => app.listen(porta, () => console.log(`Academia Milla 360 API ${pkg.version} na porta ${porta}`)))
  .catch(e => { console.error('[boot]', e.message); process.exit(1); });
