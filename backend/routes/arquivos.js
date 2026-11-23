// /api/arquivos — anexos de qualquer parte do sistema (ações, checklists salvos, reuniões do comitê, área)
// e a listagem consolidada por área, que também traz os vídeos dos cursos e os documentos da IA.
const crypto = require('crypto');
const { Router } = require('express');
const { S3Client, GetObjectCommand } = require('@aws-sdk/client-s3');
const { Upload } = require('@aws-sdk/lib-storage');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const { pool } = require('../db');
const { exigirLogin } = require('../lib/auth');
const { pode, permissoesDe } = require('../lib/rbac');

const r = Router();
r.use(exigirLogin);
const txt = (v, max = 300) => String(v ?? '').trim().slice(0, max);
const MAX_R2 = 500 * 1024 * 1024, MAX_BANCO = 20 * 1024 * 1024;
const ORIGENS = ['acao', 'checklist', 'comite', 'area'];
const TIPOS_OK = /^(image|video|audio)\/|^application\/(pdf|msword|vnd\.openxmlformats-officedocument\.|vnd\.ms-|vnd\.oasis\.opendocument\.|zip|x-zip|rtf|json|octet-stream)|^text\//;

const r2Ativo = () => !!(process.env.R2_ENDPOINT && process.env.R2_ACCESS_KEY_ID && process.env.R2_SECRET_ACCESS_KEY && process.env.R2_BUCKET_NAME);
let s3c = null;
const s3 = () => (s3c ||= new S3Client({ region: process.env.R2_REGION || 'auto', endpoint: process.env.R2_ENDPOINT,
  credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY } }));
async function usuario(id) { const { rows } = await pool.query('SELECT id, nome, perfil FROM usuarios WHERE id = $1', [id]); return rows[0]; }

// Descobre a área e o título da origem (para listar e abrir de volta).
async function resolverOrigem(tipo, id, areaPedida) {
  if (tipo === 'acao') { const { rows: [x] } = await pool.query('SELECT area_id, titulo FROM acoes WHERE id = $1', [id]); return x && { area: x.area_id, titulo: x.titulo }; }
  if (tipo === 'checklist') { const { rows: [x] } = await pool.query(`SELECT ap.area_id, m.nome || COALESCE(' · ' || l.nome, '') || ' · ' || to_char(ap.criado_em AT TIME ZONE 'America/Sao_Paulo','DD/MM/YYYY') AS t FROM checklist_aplicacoes ap JOIN checklist_modelos m ON m.id = ap.modelo_id LEFT JOIN lojas l ON l.id = ap.loja_id WHERE ap.id = $1`, [id]); return x && { area: x.area_id, titulo: x.t }; }
  if (tipo === 'comite') { const { rows: [x] } = await pool.query(`SELECT titulo || ' · ' || to_char(data AT TIME ZONE 'America/Sao_Paulo','DD/MM/YYYY') AS t FROM comite_reunioes WHERE id = $1`, [id]); return x && { area: null, titulo: x.t }; }
  if (tipo === 'area') { const { rows: [x] } = await pool.query('SELECT id, nome FROM areas WHERE id = $1', [areaPedida]); return x && { area: x.id, titulo: 'Arquivos da área' }; }
  return null;
}

// Envio: corpo bruto (application/octet-stream), tipo real em ?tipo=, nome em ?nome=.
r.post('/', pode('areas', 1), async (req, res) => {
  const tipo = txt(req.query.origem_tipo, 20), oid = txt(req.query.origem_id, 40) || null;
  const nome = txt(req.query.nome, 200).replace(/[\\/]/g, '_'), mime = txt(req.query.tipo, 120) || 'application/octet-stream';
  const tam = Number(req.headers['content-length'] || 0);
  if (!ORIGENS.includes(tipo)) return res.status(400).json({ erro: 'Origem inválida.' });
  if (!nome) return res.status(400).json({ erro: 'Informe o nome do arquivo.' });
  if (!TIPOS_OK.test(mime)) return res.status(400).json({ erro: 'Tipo de arquivo não aceito. Envie imagem, vídeo, áudio, PDF, Word, Excel, PowerPoint ou texto.' });
  const org = await resolverOrigem(tipo, oid, txt(req.query.area, 40));
  if (!org) return res.status(404).json({ erro: 'Origem do arquivo não encontrada.' });
  const u = await usuario(req.usuario.sub);
  let chave = null, conteudo = null;
  if (r2Ativo()) {
    if (tam > MAX_R2) return res.status(400).json({ erro: 'Arquivo maior que 500 MB.' });
    chave = `arquivos/${org.area || 'geral'}/${tipo}/${Date.now()}-${crypto.randomBytes(4).toString('hex')}-${nome.replace(/[^\w.\-]+/g, '_').slice(-80)}`;
    try { await new Upload({ client: s3(), params: { Bucket: process.env.R2_BUCKET_NAME, Key: chave, Body: req, ContentType: mime }, queueSize: 3, partSize: 10 * 1024 * 1024 }).done(); }
    catch (e) { console.error('[arquivos] envio:', e.message); return res.status(500).json({ erro: 'Não foi possível guardar o arquivo. Tente novamente.' }); }
  } else {
    if (tam > MAX_BANCO) return res.status(400).json({ erro: 'Sem o armazenamento R2 configurado, o limite é de 20 MB por arquivo.' });
    const partes = []; let total = 0;
    for await (const c of req) { total += c.length; if (total > MAX_BANCO) return res.status(400).json({ erro: 'Arquivo maior que 20 MB.' }); partes.push(c); }
    conteudo = Buffer.concat(partes);
  }
  const { rows: [a] } = await pool.query(
    `INSERT INTO arquivos (area_id, origem_tipo, origem_id, origem_titulo, nome, mime, tamanho, chave_r2, conteudo, enviado_por, enviado_por_nome)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id, criado_em`,
    [org.area, tipo, oid, org.titulo, nome, mime, conteudo ? conteudo.length : tam || null, chave, conteudo, u.id, u.nome]);
  res.status(201).json(a);
});

const COLS = `a.id::text AS id, 'anexo' AS fonte, a.area_id, a.origem_tipo, a.origem_id, a.origem_titulo, a.nome, a.descricao, a.mime, a.tamanho,
  a.enviado_por, a.enviado_por_nome, a.criado_em, a.atualizado_em, a.atualizado_por`;

// Anexos de uma origem (ação, checklist, reunião).
r.get('/origem/:tipo/:id', pode('areas', 1), async (req, res) => {
  const { rows } = await pool.query(`SELECT ${COLS} FROM arquivos a WHERE a.origem_tipo = $1 AND a.origem_id = $2 AND a.excluido_em IS NULL ORDER BY a.criado_em`, [req.params.tipo, req.params.id]);
  res.json(rows);
});

// Tudo o que existe de arquivo na área: anexos (da área e gerais), vídeos dos cursos da área e documentos da IA da área.
r.get('/area/:area', pode('areas', 1), async (req, res) => {
  const area = req.params.area;
  const { rows } = await pool.query(`
    SELECT ${COLS} FROM arquivos a WHERE (a.area_id = $1 OR a.area_id IS NULL) AND a.excluido_em IS NULL
    UNION ALL
    SELECT 'video:' || v.id, 'video', $1, 'curso', c.id::text, c.titulo, v.titulo, v.descricao,
           CASE WHEN v.tipo = 'arquivo' THEN 'video/mp4' ELSE 'link/' || v.tipo END, v.tamanho, NULL, 'Universidade', v.criado_em, NULL, NULL
      FROM curso_videos v JOIN cursos c ON c.id = v.curso_id JOIN curso_areas ca ON ca.curso_id = c.id AND ca.area_id = $1
     WHERE c.ativo
    UNION ALL
    SELECT 'ia:' || d.id, 'ia', $1, 'ia', d.id::text, 'Base de conhecimento · ' || g.nome, d.titulo, NULL,
           COALESCE(d.tipo, 'texto'), d.tamanho, NULL, COALESCE(d.enviado_por, '—'), d.criado_em, NULL, NULL
      FROM ia_documentos d JOIN ia_agentes g ON g.id = d.agente_id
     WHERE g.area_id = $1 AND d.ativo AND d.origem = 'arquivo'
    ORDER BY criado_em DESC LIMIT 1000`, [area]);
  res.json(rows);
});

async function anexo(id) { const { rows: [a] } = await pool.query('SELECT * FROM arquivos WHERE id = $1 AND excluido_em IS NULL', [id]); return a; }

// Link temporário para ver (inline) ou baixar.
r.get('/:id/url', pode('areas', 1), async (req, res) => {
  const a = await anexo(req.params.id);
  if (!a) return res.status(404).json({ erro: 'Arquivo não encontrado.' });
  if (a.chave_r2) {
    const disp = `${req.query.baixar ? 'attachment' : 'inline'}; filename*=UTF-8''${encodeURIComponent(a.nome)}`;
    return res.json({ url: await getSignedUrl(s3(), new GetObjectCommand({ Bucket: process.env.R2_BUCKET_NAME, Key: a.chave_r2, ResponseContentDisposition: disp, ResponseContentType: a.mime || undefined }), { expiresIn: 3600 }) });
  }
  res.json({ base64: a.conteudo ? a.conteudo.toString('base64') : '', mime: a.mime, nome: a.nome });
});

async function podeAlterar(req, a) {
  if (a.enviado_por === req.usuario.sub) return true;
  const p = await permissoesDe(req.usuario.perfil);
  return (p.areas || 0) >= 2 || (p.rbac || 0) >= 2;
}

r.patch('/:id', pode('areas', 1), async (req, res) => {
  const a = await anexo(req.params.id);
  if (!a) return res.status(404).json({ erro: 'Arquivo não encontrado.' });
  if (!(await podeAlterar(req, a))) return res.status(403).json({ erro: 'Só quem enviou o arquivo (ou um gestor) pode alterá-lo.' });
  const nome = txt(req.body?.nome, 200) || a.nome, desc = req.body?.descricao === undefined ? a.descricao : txt(req.body.descricao, 1000) || null;
  const u = await usuario(req.usuario.sub);
  await pool.query('UPDATE arquivos SET nome = $2, descricao = $3, atualizado_em = now(), atualizado_por = $4 WHERE id = $1', [a.id, nome, desc, u.nome]);
  res.json({ ok: true });
});

r.delete('/:id', pode('areas', 1), async (req, res) => {
  const a = await anexo(req.params.id);
  if (!a) return res.status(404).json({ erro: 'Arquivo não encontrado.' });
  if (!(await podeAlterar(req, a))) return res.status(403).json({ erro: 'Só quem enviou o arquivo (ou um gestor) pode excluí-lo.' });
  const u = await usuario(req.usuario.sub);
  await pool.query('UPDATE arquivos SET excluido_em = now(), excluido_por = $2 WHERE id = $1', [a.id, u.nome]);
  res.json({ ok: true });
});

module.exports = r;
