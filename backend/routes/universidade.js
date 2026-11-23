// /api/univ — Universidade: catálogo por área, trilha do aluno (vídeos, prova, certificado)
// e gestão de cursos (cadastro, áreas, vídeos, prova com gabarito, modelo de certificado, acompanhamento).
const crypto = require('crypto');
const { Router } = require('express');
const { S3Client, GetObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const { Upload } = require('@aws-sdk/lib-storage');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const { pool } = require('../db');
const { exigirLogin } = require('../lib/auth');
const { permissoesDe } = require('../lib/rbac');
const { REGRAS, creditar } = require('../lib/pontos');

const r = Router();
r.use(exigirLogin);

const txt = (v, max = 500) => String(v ?? '').trim().slice(0, max);
const MAX_VIDEO = 1024 * 1024 * 1024; // 1 GB
const MAX_CERT = 8 * 1024 * 1024;
const CERT_PADRAO = { nome: { x: 50, y: 50, tam: 4.4, cor: '#0B3D4D' }, info: { x: 50, y: 61, tam: 1.7, cor: '#33424F' } };

// ---------------- R2 (vídeos) ----------------
const r2Ativo = () => !!(process.env.R2_ENDPOINT && process.env.R2_ACCESS_KEY_ID && process.env.R2_SECRET_ACCESS_KEY && process.env.R2_BUCKET_NAME);
let s3c = null;
const s3 = () => (s3c ||= new S3Client({ region: process.env.R2_REGION || 'auto', endpoint: process.env.R2_ENDPOINT,
  credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY } }));

// ---------------- acesso ----------------
async function eu(req) {
  const { rows: [u] } = await pool.query('SELECT id, nome, perfil, area_id FROM usuarios WHERE id = $1', [req.usuario.sub]);
  return { ...u, perm: await permissoesDe(u?.perfil) };
}
// Gestão: perfil com CMS total, ou responsável de área (só cursos ligados à própria área).
const gestorGeral = u => (u.perm.cms || 0) >= 2;
async function podeGerir(u, cursoId) {
  if (gestorGeral(u)) return true;
  if (!u.area_id) return false;
  if (!cursoId) return true;
  const { rowCount } = await pool.query('SELECT 1 FROM curso_areas WHERE curso_id = $1 AND area_id = $2', [cursoId, u.area_id]);
  return rowCount > 0;
}
async function exigirGestao(req, res, cursoId) {
  const u = await eu(req);
  if (!(await podeGerir(u, cursoId))) { res.status(403).json({ erro: 'Seu perfil não pode cadastrar ou alterar este curso.' }); return null; }
  return u;
}

// ---------------- regras de conclusão ----------------
const codigoCert = () => crypto.randomBytes(5).toString('hex').toUpperCase();
async function emitirCertificado(uid, cursoId, nota) {
  const { rows: [u] } = await pool.query('SELECT nome FROM usuarios WHERE id = $1', [uid]);
  const { rows } = await pool.query(
    `INSERT INTO curso_certificados (usuario_id, curso_id, codigo, nome, nota) VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (usuario_id, curso_id) DO NOTHING RETURNING id`, [uid, cursoId, codigoCert(), u?.nome || 'Aluno', nota ?? null]);
  return rows[0]?.id || null;
}
// Recalcula a situação do aluno no curso; conclui e emite o certificado quando cumpre tudo.
async function avaliar(uid, cursoId) {
  const { rows: [c] } = await pool.query('SELECT id, titulo, exige_prova FROM cursos WHERE id = $1', [cursoId]);
  if (!c) return null;
  const { rows: [v] } = await pool.query(
    `SELECT COUNT(*)::int AS total, COUNT(p.concluido_em)::int AS ok FROM curso_videos cv
       LEFT JOIN curso_video_progresso p ON p.video_id = cv.id AND p.usuario_id = $2 WHERE cv.curso_id = $1`, [cursoId, uid]);
  const { rows: [t] } = await pool.query(
    `SELECT MAX(nota) FILTER (WHERE aprovado) AS nota_aprov, MAX(nota) AS melhor FROM curso_tentativas WHERE curso_id = $1 AND usuario_id = $2 AND finalizado_em IS NOT NULL`, [cursoId, uid]);
  await pool.query('UPDATE cursos SET aulas = GREATEST($2, 1) WHERE id = $1 AND $2 > 0', [cursoId, v.total]);
  const { rows: [p] } = await pool.query(
    `INSERT INTO curso_progresso (usuario_id, curso_id, aulas_feitas, iniciado_em) VALUES ($1,$2,$3,now())
     ON CONFLICT (usuario_id, curso_id) DO UPDATE SET aulas_feitas = CASE WHEN $3 > 0 OR curso_progresso.concluido_em IS NULL THEN $3 ELSE curso_progresso.aulas_feitas END,
       iniciado_em = COALESCE(curso_progresso.iniciado_em, now()), atualizado_em = now()
     RETURNING *`, [uid, cursoId, v.total ? v.ok : 0]);
  const provaOk = !c.exige_prova || t.nota_aprov != null;
  let concluiu = false;
  if (v.total > 0 && v.ok === v.total && provaOk && !p.concluido_em) {
    await pool.query('UPDATE curso_progresso SET concluido_em = now() WHERE usuario_id = $1 AND curso_id = $2', [uid, cursoId]);
    await creditar(uid, REGRAS.curso, `Curso concluído: ${c.titulo}`, `curso:${cursoId}`);
    concluiu = true;
  }
  if (concluiu || p.concluido_em) await emitirCertificado(uid, cursoId, t.nota_aprov != null ? Number(t.nota_aprov) : null);
  return { videos: v.total, videos_ok: v.ok, prova_ok: provaOk, concluiu };
}

// ---------------- catálogo e trilha do aluno ----------------
const SQL_CURSOS = `
  SELECT c.id, c.titulo, c.descricao, c.duracao, c.exige_prova, c.nota_minima, c.ativo, c.aulas,
         (c.cert_modelo IS NOT NULL) AS tem_modelo,
         ARRAY(SELECT area_id FROM curso_areas ca WHERE ca.curso_id = c.id ORDER BY area_id) AS areas,
         (SELECT COUNT(*) FROM curso_videos v WHERE v.curso_id = c.id)::int AS videos,
         (SELECT COALESCE(SUM(duracao_seg),0) FROM curso_videos v WHERE v.curso_id = c.id)::int AS duracao_seg,
         (SELECT COUNT(*) FROM curso_video_progresso p JOIN curso_videos v ON v.id = p.video_id WHERE v.curso_id = c.id AND p.usuario_id = $1 AND p.concluido_em IS NOT NULL)::int AS videos_ok,
         jsonb_array_length(c.prova) AS perguntas,
         cp.aulas_feitas, cp.iniciado_em, cp.concluido_em,
         (SELECT MAX(nota) FROM curso_tentativas t WHERE t.curso_id = c.id AND t.usuario_id = $1 AND t.finalizado_em IS NOT NULL) AS melhor_nota,
         (SELECT bool_or(aprovado) FROM curso_tentativas t WHERE t.curso_id = c.id AND t.usuario_id = $1) AS aprovado,
         (SELECT id FROM curso_certificados cc WHERE cc.curso_id = c.id AND cc.usuario_id = $1) AS certificado_id
    FROM cursos c LEFT JOIN curso_progresso cp ON cp.curso_id = c.id AND cp.usuario_id = $1`;
const pctDe = c => (c.concluido_em ? 100 : c.videos ? Math.round(c.videos_ok / c.videos * 100) : Math.min(100, Math.round(((c.aulas_feitas || 0) / (c.aulas || 1)) * 100)));
const resumo = c => ({ ...c, pct: pctDe(c), melhor_nota: c.melhor_nota == null ? null : Number(c.melhor_nota) });

r.get('/cursos', async (req, res) => {
  const p = [req.usuario.sub]; let w = 'WHERE c.ativo';
  if (req.query.area) { p.push(req.query.area); w += ` AND EXISTS (SELECT 1 FROM curso_areas ca WHERE ca.curso_id = c.id AND ca.area_id = $2)`; }
  const { rows } = await pool.query(`${SQL_CURSOS} ${w} ORDER BY c.ordem, c.titulo`, p);
  res.json(rows.map(resumo));
});

// Treinamentos da área: cursos + vídeos (em andamento / concluídos) do usuário.
r.get('/area/:area', async (req, res) => {
  const uid = req.usuario.sub;
  const { rows: cursos } = await pool.query(`${SQL_CURSOS} WHERE c.ativo AND EXISTS (SELECT 1 FROM curso_areas ca WHERE ca.curso_id = c.id AND ca.area_id = $2) ORDER BY c.ordem, c.titulo`, [uid, req.params.area]);
  const { rows: videos } = await pool.query(
    `SELECT v.id, v.titulo, v.duracao_seg, v.curso_id, c.titulo AS curso, p.iniciado_em, p.concluido_em, p.posicao_seg
       FROM curso_videos v JOIN cursos c ON c.id = v.curso_id AND c.ativo
       LEFT JOIN curso_video_progresso p ON p.video_id = v.id AND p.usuario_id = $1
      WHERE EXISTS (SELECT 1 FROM curso_areas ca WHERE ca.curso_id = c.id AND ca.area_id = $2)
      ORDER BY c.ordem, c.titulo, v.ordem, v.id`, [uid, req.params.area]);
  res.json({ cursos: cursos.map(resumo), videos });
});

r.get('/cursos/:id', async (req, res) => {
  const uid = req.usuario.sub;
  const { rows: [c] } = await pool.query(`${SQL_CURSOS} WHERE c.id = $2`, [uid, req.params.id]);
  if (!c) return res.status(404).json({ erro: 'Curso não encontrado.' });
  const [vid, tent, cert] = await Promise.all([
    pool.query(`SELECT v.id, v.titulo, v.descricao, v.tipo, v.url, v.duracao_seg, v.ordem, p.iniciado_em, p.concluido_em, p.posicao_seg, p.assistido_seg
                  FROM curso_videos v LEFT JOIN curso_video_progresso p ON p.video_id = v.id AND p.usuario_id = $2 WHERE v.curso_id = $1 ORDER BY v.ordem, v.id`, [c.id, uid]),
    pool.query('SELECT id, iniciado_em, finalizado_em, acertos, total, nota, aprovado FROM curso_tentativas WHERE curso_id = $1 AND usuario_id = $2 ORDER BY id DESC', [c.id, uid]),
    pool.query('SELECT id, codigo, emitido_em, nota FROM curso_certificados WHERE curso_id = $1 AND usuario_id = $2', [c.id, uid]),
  ]);
  const { rows: areas } = await pool.query('SELECT a.id, a.nome FROM curso_areas ca JOIN areas a ON a.id = ca.area_id WHERE ca.curso_id = $1 ORDER BY a.ordem', [c.id]);
  const u = await eu(req);
  res.json({ ...resumo(c), areas, videos_lista: vid.rows.map(v => ({ ...v, url: v.tipo === 'arquivo' ? null : v.url })), tentativas: tent.rows, certificado: cert.rows[0] || null,
    tentativas_max: (await pool.query('SELECT tentativas_max FROM cursos WHERE id = $1', [c.id])).rows[0].tentativas_max, pode_gerir: await podeGerir(u, c.id) });
});

// URL temporária (6 h) para tocar o vídeo do R2 privado.
r.get('/videos/:id/fonte', async (req, res) => {
  const { rows: [v] } = await pool.query('SELECT * FROM curso_videos WHERE id = $1', [req.params.id]);
  if (!v) return res.status(404).json({ erro: 'Vídeo não encontrado.' });
  if (v.tipo !== 'arquivo') return res.json({ url: v.url });
  if (!r2Ativo() || !v.chave_r2) return res.status(400).json({ erro: 'Arquivo de vídeo indisponível (armazenamento R2 não configurado).' });
  const url = await getSignedUrl(s3(), new GetObjectCommand({ Bucket: process.env.R2_BUCKET_NAME, Key: v.chave_r2 }), { expiresIn: 6 * 3600 });
  res.json({ url });
});

// Início do vídeo (primeiro play) e progresso/conclusão.
r.post('/videos/:id/inicio', async (req, res) => {
  const { rows: [v] } = await pool.query('SELECT id, curso_id FROM curso_videos WHERE id = $1', [req.params.id]);
  if (!v) return res.status(404).json({ erro: 'Vídeo não encontrado.' });
  await pool.query(`INSERT INTO curso_video_progresso (usuario_id, video_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [req.usuario.sub, v.id]);
  await pool.query(`INSERT INTO curso_progresso (usuario_id, curso_id, aulas_feitas, iniciado_em) VALUES ($1,$2,0,now())
                    ON CONFLICT (usuario_id, curso_id) DO UPDATE SET iniciado_em = COALESCE(curso_progresso.iniciado_em, now())`, [req.usuario.sub, v.curso_id]);
  res.json({ ok: true });
});
r.post('/videos/:id/progresso', async (req, res) => {
  const uid = req.usuario.sub;
  const { rows: [v] } = await pool.query('SELECT v.*, c.titulo AS curso FROM curso_videos v JOIN cursos c ON c.id = v.curso_id WHERE v.id = $1', [req.params.id]);
  if (!v) return res.status(404).json({ erro: 'Vídeo não encontrado.' });
  const b = req.body || {};
  const pos = Math.max(0, Number(b.posicao) || 0), dur = Math.max(0, Number(b.duracao) || 0), assist = Math.max(0, Number(b.assistido) || 0);
  if (dur && (!v.duracao_seg || Math.abs(v.duracao_seg - dur) > 2)) await pool.query('UPDATE curso_videos SET duracao_seg = $2 WHERE id = $1', [v.id, Math.round(dur)]);
  // Conclui quando o player avisa o fim, ou quando assistiu ≥ 90% da duração.
  const concluir = !!b.concluido || (dur > 0 && assist >= dur * 0.9);
  const { rows: [p] } = await pool.query(
    `INSERT INTO curso_video_progresso (usuario_id, video_id, posicao_seg, assistido_seg, duracao_seg, concluido_em)
     VALUES ($1,$2,$3,$4,$5, CASE WHEN $6 THEN now() END)
     ON CONFLICT (usuario_id, video_id) DO UPDATE SET posicao_seg = $3, assistido_seg = GREATEST(curso_video_progresso.assistido_seg, $4),
       duracao_seg = COALESCE($5, curso_video_progresso.duracao_seg), atualizado_em = now(),
       concluido_em = COALESCE(curso_video_progresso.concluido_em, CASE WHEN $6 THEN now() END)
     RETURNING (xmax = 0) AS novo, concluido_em`, [uid, v.id, pos, assist, dur || null, concluir]);
  let pontos = 0, situacao = null;
  if (concluir) {
    const { rowCount } = await pool.query('SELECT 1 FROM pontos WHERE usuario_id = $1 AND ref = $2', [uid, `video:${v.id}`]);
    if (!rowCount) { pontos = REGRAS.aula; await creditar(uid, REGRAS.aula, `Vídeo concluído: ${v.titulo}`, `video:${v.id}`); }
    situacao = await avaliar(uid, v.curso_id);
    if (situacao?.concluiu) pontos += REGRAS.curso;
  }
  res.json({ ok: true, concluido: !!p.concluido_em, pontosGanhos: pontos, situacao });
});

// ---------------- prova ----------------
r.post('/cursos/:id/prova/iniciar', async (req, res) => {
  const uid = req.usuario.sub;
  const { rows: [c] } = await pool.query('SELECT * FROM cursos WHERE id = $1 AND ativo', [req.params.id]);
  if (!c) return res.status(404).json({ erro: 'Curso não encontrado.' });
  if (!c.prova?.length) return res.status(400).json({ erro: 'Este curso não tem prova cadastrada.' });
  const s = await avaliar(uid, c.id);
  if (s.videos && s.videos_ok < s.videos) return res.status(400).json({ erro: `Assista a todos os vídeos antes da prova (${s.videos_ok} de ${s.videos}).` });
  const { rows: tent } = await pool.query('SELECT * FROM curso_tentativas WHERE curso_id = $1 AND usuario_id = $2 ORDER BY id DESC', [c.id, uid]);
  if (tent.some(t => t.aprovado)) return res.status(400).json({ erro: 'Você já foi aprovado nesta prova.' });
  let t = tent.find(x => !x.finalizado_em);
  if (!t) {
    if (tent.length >= c.tentativas_max) return res.status(400).json({ erro: `Limite de ${c.tentativas_max} tentativa(s) atingido. Procure o responsável pela área.` });
    ({ rows: [t] } = await pool.query('INSERT INTO curso_tentativas (usuario_id, curso_id, total) VALUES ($1,$2,$3) RETURNING *', [uid, c.id, c.prova.length]));
  }
  res.json({ tentativa_id: t.id, iniciado_em: t.iniciado_em, nota_minima: c.nota_minima, tentativa: tent.filter(x => x.finalizado_em).length + 1, tentativas_max: c.tentativas_max,
    perguntas: c.prova.map((q, i) => ({ i, pergunta: q.pergunta, opcoes: q.opcoes })) });
});

r.post('/tentativas/:id/finalizar', async (req, res) => {
  const uid = req.usuario.sub;
  const { rows: [t] } = await pool.query('SELECT * FROM curso_tentativas WHERE id = $1 AND usuario_id = $2', [req.params.id, uid]);
  if (!t) return res.status(404).json({ erro: 'Prova não encontrada.' });
  if (t.finalizado_em) return res.status(400).json({ erro: 'Esta prova já foi finalizada.' });
  const { rows: [c] } = await pool.query('SELECT id, titulo, prova, nota_minima FROM cursos WHERE id = $1', [t.curso_id]);
  const resp = Array.isArray(req.body?.respostas) ? req.body.respostas.slice(0, c.prova.length).map(x => (x === null || x === '' || x === undefined ? null : Number(x))) : [];
  if (resp.length < c.prova.length || resp.some(x => x === null || Number.isNaN(x))) return res.status(400).json({ erro: 'Responda todas as perguntas antes de finalizar.' });
  const acertos = c.prova.reduce((s, q, i) => s + (Number(q.correta) === resp[i] ? 1 : 0), 0);
  const nota = Math.round((acertos / c.prova.length) * 1000) / 10;
  const aprovado = nota >= c.nota_minima;
  await pool.query('UPDATE curso_tentativas SET finalizado_em = now(), respostas = $2, acertos = $3, total = $4, nota = $5, aprovado = $6 WHERE id = $1',
    [t.id, JSON.stringify(resp), acertos, c.prova.length, nota, aprovado]);
  const situacao = await avaliar(uid, c.id);
  res.json({ acertos, total: c.prova.length, nota, aprovado, nota_minima: c.nota_minima, situacao, pontosGanhos: situacao?.concluiu ? REGRAS.curso : 0 });
});

// ---------------- certificados ----------------
r.get('/certificados', async (req, res) => {
  const uid = req.usuario.sub;
  // Cursos concluídos antes da 0.5.0 também recebem o certificado.
  const { rows: pend } = await pool.query(`SELECT curso_id FROM curso_progresso p WHERE usuario_id = $1 AND concluido_em IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM curso_certificados cc WHERE cc.usuario_id = p.usuario_id AND cc.curso_id = p.curso_id)`, [uid]);
  for (const p of pend) await emitirCertificado(uid, p.curso_id, null);
  const { rows } = await pool.query(
    `SELECT cc.id, cc.codigo, cc.nome, cc.nota, cc.emitido_em, c.id AS curso_id, c.titulo, c.duracao,
            (SELECT string_agg(a.nome, ' · ' ORDER BY a.ordem) FROM curso_areas ca JOIN areas a ON a.id = ca.area_id WHERE ca.curso_id = c.id) AS areas
       FROM curso_certificados cc JOIN cursos c ON c.id = cc.curso_id WHERE cc.usuario_id = $1 ORDER BY cc.emitido_em DESC`, [uid]);
  res.json(rows);
});
// Dados para desenhar o certificado (do próprio aluno, ou de qualquer aluno para a gestão).
r.get('/certificados/:id', async (req, res) => {
  const { rows: [cc] } = await pool.query(
    `SELECT cc.*, c.titulo, c.duracao, c.cert_config, c.cert_tipo, (c.cert_modelo IS NOT NULL) AS tem_modelo,
            (SELECT COALESCE(SUM(duracao_seg),0) FROM curso_videos v WHERE v.curso_id = c.id)::int AS duracao_seg
       FROM curso_certificados cc JOIN cursos c ON c.id = cc.curso_id WHERE cc.id = $1`, [req.params.id]);
  if (!cc) return res.status(404).json({ erro: 'Certificado não encontrado.' });
  if (cc.usuario_id !== req.usuario.sub && !(await podeGerir(await eu(req), cc.curso_id))) return res.status(403).json({ erro: 'Certificado de outro usuário.' });
  res.json({ ...cc, cert_config: cc.cert_config || CERT_PADRAO });
});
r.get('/cursos/:id/certificado-modelo', async (req, res) => {
  const { rows: [c] } = await pool.query('SELECT cert_modelo, cert_tipo, cert_config FROM cursos WHERE id = $1', [req.params.id]);
  if (!c?.cert_modelo) return res.json({ modelo: null, config: c?.cert_config || CERT_PADRAO });
  res.json({ modelo: `data:${c.cert_tipo || 'image/png'};base64,${c.cert_modelo.toString('base64')}`, config: c.cert_config || CERT_PADRAO });
});
// Validação pública do código não exige dados pessoais além do nome impresso.
r.get('/validar/:codigo', async (req, res) => {
  const { rows: [cc] } = await pool.query(`SELECT cc.nome, cc.emitido_em, c.titulo FROM curso_certificados cc JOIN cursos c ON c.id = cc.curso_id WHERE cc.codigo = $1`, [String(req.params.codigo).toUpperCase()]);
  res.json(cc ? { valido: true, ...cc } : { valido: false });
});

// ======================= GESTÃO DE CURSOS =======================
r.get('/gestao/cursos', async (req, res) => {
  const u = await eu(req);
  if (!gestorGeral(u) && !u.area_id) return res.status(403).json({ erro: 'Seu perfil não gerencia cursos.' });
  const { rows } = await pool.query(`
    SELECT c.id, c.titulo, c.ativo, c.exige_prova, c.nota_minima, c.duracao, (c.cert_modelo IS NOT NULL) AS tem_modelo, jsonb_array_length(c.prova) AS perguntas,
           ARRAY(SELECT area_id FROM curso_areas ca WHERE ca.curso_id = c.id) AS areas,
           (SELECT COUNT(*) FROM curso_videos v WHERE v.curso_id = c.id)::int AS videos,
           (SELECT COUNT(*) FROM curso_progresso p WHERE p.curso_id = c.id AND (p.iniciado_em IS NOT NULL OR p.aulas_feitas > 0))::int AS alunos,
           (SELECT COUNT(*) FROM curso_progresso p WHERE p.curso_id = c.id AND p.concluido_em IS NOT NULL)::int AS concluintes,
           (SELECT COUNT(*) FROM curso_certificados cc WHERE cc.curso_id = c.id)::int AS certificados
      FROM cursos c
     WHERE $1 OR EXISTS (SELECT 1 FROM curso_areas ca WHERE ca.curso_id = c.id AND ca.area_id = $2)
     ORDER BY c.ativo DESC, c.titulo`, [gestorGeral(u), u.area_id]);
  res.json({ cursos: rows, gestor_geral: gestorGeral(u), area_usuario: u.area_id, r2: r2Ativo() });
});

r.get('/gestao/cursos/:id', async (req, res) => {
  if (!(await exigirGestao(req, res, req.params.id))) return;
  const { rows: [c] } = await pool.query(
    `SELECT id, titulo, descricao, duracao, ativo, exige_prova, nota_minima, tentativas_max, prova, cert_config, (cert_modelo IS NOT NULL) AS tem_modelo,
            ARRAY(SELECT area_id FROM curso_areas ca WHERE ca.curso_id = cursos.id) AS areas, atualizado_em, atualizado_por
       FROM cursos WHERE id = $1`, [req.params.id]);
  if (!c) return res.status(404).json({ erro: 'Curso não encontrado.' });
  const { rows: videos } = await pool.query('SELECT id, ordem, titulo, descricao, tipo, url, (chave_r2 IS NOT NULL) AS no_r2, tamanho, duracao_seg FROM curso_videos WHERE curso_id = $1 ORDER BY ordem, id', [c.id]);
  res.json({ ...c, cert_config: c.cert_config || CERT_PADRAO, videos, r2: r2Ativo() });
});

async function salvarAreas(cursoId, areas) {
  await pool.query('DELETE FROM curso_areas WHERE curso_id = $1', [cursoId]);
  for (const a of areas) await pool.query('INSERT INTO curso_areas (curso_id, area_id) SELECT $1, id FROM areas WHERE id = $2 ON CONFLICT DO NOTHING', [cursoId, a]);
}
r.post('/gestao/cursos', async (req, res) => {
  const u = await exigirGestao(req, res, null); if (!u) return;
  const b = req.body || {};
  const titulo = txt(b.titulo, 150);
  let areas = (Array.isArray(b.areas) ? b.areas : []).map(String).filter(Boolean);
  if (!gestorGeral(u)) areas = [u.area_id];
  if (!titulo) return res.status(400).json({ erro: 'Informe o título do curso.' });
  if (!areas.length) return res.status(400).json({ erro: 'Ligue o curso a pelo menos uma área.' });
  const { rows: [c] } = await pool.query(
    `INSERT INTO cursos (area_id, titulo, descricao, duracao, aulas, ordem, atualizado_por) VALUES ($1,$2,$3,$4,1,(SELECT COALESCE(MAX(ordem),0)+1 FROM cursos),$5) RETURNING id`,
    [areas[0], titulo, txt(b.descricao, 2000) || null, txt(b.duracao, 40) || null, u.nome]);
  await salvarAreas(c.id, areas);
  res.status(201).json({ id: c.id });
});
r.put('/gestao/cursos/:id', async (req, res) => {
  const u = await exigirGestao(req, res, req.params.id); if (!u) return;
  const b = req.body || {};
  const titulo = txt(b.titulo, 150);
  if (!titulo) return res.status(400).json({ erro: 'Informe o título do curso.' });
  let areas = (Array.isArray(b.areas) ? b.areas : []).map(String).filter(Boolean);
  if (!gestorGeral(u) && !areas.includes(u.area_id)) areas.push(u.area_id);
  if (!areas.length) return res.status(400).json({ erro: 'Ligue o curso a pelo menos uma área.' });
  await pool.query(`UPDATE cursos SET titulo=$2, descricao=$3, duracao=$4, ativo=$5, area_id=$6, atualizado_em=now(), atualizado_por=$7 WHERE id=$1`,
    [req.params.id, titulo, txt(b.descricao, 2000) || null, txt(b.duracao, 40) || null, b.ativo !== false, areas[0], u.nome]);
  await salvarAreas(req.params.id, areas);
  res.json({ ok: true });
});

// Prova e gabarito
r.put('/gestao/cursos/:id/prova', async (req, res) => {
  const u = await exigirGestao(req, res, req.params.id); if (!u) return;
  const b = req.body || {};
  const perguntas = (Array.isArray(b.perguntas) ? b.perguntas : []).slice(0, 60).map(q => {
    const opcoes = (Array.isArray(q.opcoes) ? q.opcoes : []).map(o => txt(o, 300)).filter(Boolean).slice(0, 6);
    return { pergunta: txt(q.pergunta, 600), opcoes, correta: Number(q.correta) };
  }).filter(q => q.pergunta);
  for (const [i, q] of perguntas.entries()) {
    if (q.opcoes.length < 2) return res.status(400).json({ erro: `Pergunta ${i + 1}: informe pelo menos 2 alternativas.` });
    if (!(q.correta >= 0 && q.correta < q.opcoes.length)) return res.status(400).json({ erro: `Pergunta ${i + 1}: marque a alternativa correta (gabarito).` });
  }
  const exige = !!b.exige_prova && perguntas.length > 0;
  const nota = Math.max(0, Math.min(100, Math.round(Number(b.nota_minima) || 70)));
  const tent = Math.max(1, Math.min(20, Math.round(Number(b.tentativas_max) || 3)));
  await pool.query('UPDATE cursos SET prova = $2, exige_prova = $3, nota_minima = $4, tentativas_max = $5, atualizado_em = now(), atualizado_por = $6 WHERE id = $1',
    [req.params.id, JSON.stringify(perguntas), exige, nota, tent, u.nome]);
  res.json({ ok: true, perguntas: perguntas.length, exige_prova: exige });
});

// Modelo de certificado (imagem PNG/JPG já assinada) e posição do nome
r.put('/gestao/cursos/:id/certificado', async (req, res) => {
  const u = await exigirGestao(req, res, req.params.id); if (!u) return;
  const b = req.body || {};
  const cfg = b.config && typeof b.config === 'object' ? b.config : CERT_PADRAO;
  const limpa = k => ({ x: Math.max(0, Math.min(100, Number(cfg[k]?.x ?? CERT_PADRAO[k].x))), y: Math.max(0, Math.min(100, Number(cfg[k]?.y ?? CERT_PADRAO[k].y))),
    tam: Math.max(0.5, Math.min(12, Number(cfg[k]?.tam ?? CERT_PADRAO[k].tam))), cor: /^#[0-9a-f]{6}$/i.test(cfg[k]?.cor) ? cfg[k].cor : CERT_PADRAO[k].cor, mostrar: cfg[k]?.mostrar !== false });
  const config = { nome: limpa('nome'), info: limpa('info') };
  if (b.remover) {
    await pool.query('UPDATE cursos SET cert_modelo = NULL, cert_tipo = NULL, cert_config = $2 WHERE id = $1', [req.params.id, JSON.stringify(config)]);
    return res.json({ ok: true });
  }
  if (b.base64) {
    const tipo = /^image\/(png|jpeg)$/.test(b.tipo) ? b.tipo : null;
    if (!tipo) return res.status(400).json({ erro: 'Envie o modelo como imagem PNG ou JPG (exporte o PDF assinado como imagem em alta resolução).' });
    const buf = Buffer.from(String(b.base64), 'base64');
    if (buf.length > MAX_CERT) return res.status(400).json({ erro: 'Imagem maior que 8 MB.' });
    await pool.query('UPDATE cursos SET cert_modelo = $2, cert_tipo = $3, cert_config = $4, atualizado_em = now(), atualizado_por = $5 WHERE id = $1', [req.params.id, buf, tipo, JSON.stringify(config), u.nome]);
  } else {
    await pool.query('UPDATE cursos SET cert_config = $2, atualizado_em = now(), atualizado_por = $3 WHERE id = $1', [req.params.id, JSON.stringify(config), u.nome]);
  }
  res.json({ ok: true });
});

// Vídeos: link (YouTube, Vimeo, Drive, MP4) ou envio de arquivo para o R2 privado.
const tipoLink = url => (/youtu\.?be/i.test(url) ? 'youtube' : 'link');
r.post('/gestao/cursos/:id/videos', async (req, res) => {
  const u = await exigirGestao(req, res, req.params.id); if (!u) return;
  const b = req.body || {};
  const titulo = txt(b.titulo, 200), url = txt(b.url, 600);
  if (!titulo) return res.status(400).json({ erro: 'Informe o título do vídeo.' });
  if (!/^https?:\/\/\S+$/i.test(url)) return res.status(400).json({ erro: 'Informe um link válido (https://…).' });
  const dur = Math.round((Number(b.duracao_min) || 0) * 60) || null;
  const { rows: [v] } = await pool.query(
    `INSERT INTO curso_videos (curso_id, ordem, titulo, descricao, tipo, url, duracao_seg) VALUES ($1,(SELECT COALESCE(MAX(ordem),0)+1 FROM curso_videos WHERE curso_id = $1),$2,$3,$4,$5,$6) RETURNING id`,
    [req.params.id, titulo, txt(b.descricao, 1000) || null, tipoLink(url), url, dur]);
  await pool.query('UPDATE cursos SET aulas = GREATEST((SELECT COUNT(*) FROM curso_videos WHERE curso_id = $1), 1) WHERE id = $1', [req.params.id]);
  res.status(201).json({ id: v.id });
});
// Corpo bruto do arquivo (Content-Type do vídeo), enviado direto em streaming para o R2.
r.post('/gestao/cursos/:id/videos/arquivo', async (req, res) => {
  const u = await exigirGestao(req, res, req.params.id); if (!u) return;
  if (!r2Ativo()) return res.status(400).json({ erro: 'Armazenamento R2 não configurado no servidor. Cadastre o vídeo por link (YouTube, Vimeo…).' });
  const titulo = txt(req.query.titulo, 200), nome = txt(req.query.nome, 200) || 'video.mp4';
  const tam = Number(req.headers['content-length'] || 0);
  if (!titulo) return res.status(400).json({ erro: 'Informe o título do vídeo.' });
  if (!/^video\//.test(req.headers['content-type'] || '')) return res.status(400).json({ erro: 'Envie um arquivo de vídeo (MP4, WEBM ou MOV).' });
  if (tam > MAX_VIDEO) return res.status(400).json({ erro: 'Vídeo maior que 1 GB. Comprima o arquivo ou use um link do YouTube.' });
  const chave = `univ/curso-${req.params.id}/${Date.now()}-${crypto.randomBytes(4).toString('hex')}-${nome.replace(/[^\w.\-]+/g, '_').slice(-80)}`;
  try {
    await new Upload({ client: s3(), params: { Bucket: process.env.R2_BUCKET_NAME, Key: chave, Body: req, ContentType: req.headers['content-type'] }, queueSize: 3, partSize: 10 * 1024 * 1024 }).done();
  } catch (e) {
    console.error('[univ] envio de vídeo:', e.message);
    return res.status(500).json({ erro: 'Não foi possível guardar o vídeo no armazenamento. Tente novamente.' });
  }
  const dur = Math.round(Number(req.query.duracao) || 0) || null;
  const { rows: [v] } = await pool.query(
    `INSERT INTO curso_videos (curso_id, ordem, titulo, tipo, chave_r2, tamanho, duracao_seg) VALUES ($1,(SELECT COALESCE(MAX(ordem),0)+1 FROM curso_videos WHERE curso_id = $1),$2,'arquivo',$3,$4,$5) RETURNING id`,
    [req.params.id, titulo, chave, tam || null, dur]);
  await pool.query('UPDATE cursos SET aulas = GREATEST((SELECT COUNT(*) FROM curso_videos WHERE curso_id = $1), 1) WHERE id = $1', [req.params.id]);
  res.status(201).json({ id: v.id });
});
async function videoGestao(req, res) {
  const { rows: [v] } = await pool.query('SELECT * FROM curso_videos WHERE id = $1', [req.params.id]);
  if (!v) { res.status(404).json({ erro: 'Vídeo não encontrado.' }); return null; }
  if (!(await exigirGestao(req, res, v.curso_id))) return null;
  return v;
}
r.patch('/gestao/videos/:id', async (req, res) => {
  const v = await videoGestao(req, res); if (!v) return;
  const b = req.body || {};
  if (b.mover) {
    const { rows: lista } = await pool.query('SELECT id FROM curso_videos WHERE curso_id = $1 ORDER BY ordem, id', [v.curso_id]);
    const ids = lista.map(x => x.id); const i = ids.indexOf(v.id), j = i + (b.mover === 'cima' ? -1 : 1);
    if (j >= 0 && j < ids.length) { [ids[i], ids[j]] = [ids[j], ids[i]]; for (const [k, id] of ids.entries()) await pool.query('UPDATE curso_videos SET ordem = $2 WHERE id = $1', [id, k + 1]); }
    return res.json({ ok: true });
  }
  await pool.query('UPDATE curso_videos SET titulo = $2, descricao = $3, duracao_seg = COALESCE($4, duracao_seg) WHERE id = $1',
    [v.id, txt(b.titulo, 200) || v.titulo, b.descricao !== undefined ? txt(b.descricao, 1000) : v.descricao, b.duracao_min ? Math.round(Number(b.duracao_min) * 60) : null]);
  res.json({ ok: true });
});
r.delete('/gestao/videos/:id', async (req, res) => {
  const v = await videoGestao(req, res); if (!v) return;
  if (v.chave_r2 && r2Ativo()) { try { await s3().send(new DeleteObjectCommand({ Bucket: process.env.R2_BUCKET_NAME, Key: v.chave_r2 })); } catch (e) { console.error('[univ] remover vídeo:', e.message); } }
  await pool.query('DELETE FROM curso_videos WHERE id = $1', [v.id]);
  await pool.query('UPDATE cursos SET aulas = GREATEST((SELECT COUNT(*) FROM curso_videos WHERE curso_id = $1), 1) WHERE id = $1', [v.curso_id]);
  res.json({ ok: true });
});

// Acompanhamento: trilha de cada aluno no curso.
r.get('/gestao/cursos/:id/acompanhamento', async (req, res) => {
  if (!(await exigirGestao(req, res, req.params.id))) return;
  const id = req.params.id;
  const { rows: [{ n }] } = await pool.query('SELECT COUNT(*)::int AS n FROM curso_videos WHERE curso_id = $1', [id]);
  const { rows } = await pool.query(`
    SELECT u.id, u.nome, u.email, a.nome AS area, cp.iniciado_em, cp.concluido_em, cp.aulas_feitas,
           (SELECT COUNT(*) FROM curso_video_progresso p JOIN curso_videos v ON v.id = p.video_id WHERE v.curso_id = $1 AND p.usuario_id = u.id AND p.concluido_em IS NOT NULL)::int AS videos_ok,
           (SELECT MIN(p.iniciado_em) FROM curso_video_progresso p JOIN curso_videos v ON v.id = p.video_id WHERE v.curso_id = $1 AND p.usuario_id = u.id) AS primeiro_video,
           (SELECT MAX(p.concluido_em) FROM curso_video_progresso p JOIN curso_videos v ON v.id = p.video_id WHERE v.curso_id = $1 AND p.usuario_id = u.id) AS ultimo_video,
           (SELECT COUNT(*) FROM curso_tentativas t WHERE t.curso_id = $1 AND t.usuario_id = u.id)::int AS tentativas,
           (SELECT MAX(nota) FROM curso_tentativas t WHERE t.curso_id = $1 AND t.usuario_id = u.id AND t.finalizado_em IS NOT NULL) AS melhor_nota,
           (SELECT bool_or(aprovado) FROM curso_tentativas t WHERE t.curso_id = $1 AND t.usuario_id = u.id) AS aprovado,
           cc.id AS certificado_id, cc.codigo, cc.emitido_em
      FROM usuarios u
      LEFT JOIN areas a ON a.id = u.area_id
      LEFT JOIN curso_progresso cp ON cp.usuario_id = u.id AND cp.curso_id = $1
      LEFT JOIN curso_certificados cc ON cc.usuario_id = u.id AND cc.curso_id = $1
     WHERE cp.usuario_id IS NOT NULL OR EXISTS (SELECT 1 FROM curso_tentativas t WHERE t.curso_id = $1 AND t.usuario_id = u.id)
     ORDER BY cp.concluido_em DESC NULLS LAST, u.nome`, [id]);
  res.json({ videos: n, alunos: rows });
});
r.get('/gestao/cursos/:id/aluno/:uid', async (req, res) => {
  if (!(await exigirGestao(req, res, req.params.id))) return;
  const [v, t] = await Promise.all([
    pool.query(`SELECT v.titulo, v.duracao_seg, p.iniciado_em, p.concluido_em, p.assistido_seg FROM curso_videos v
                  LEFT JOIN curso_video_progresso p ON p.video_id = v.id AND p.usuario_id = $2 WHERE v.curso_id = $1 ORDER BY v.ordem, v.id`, [req.params.id, req.params.uid]),
    pool.query('SELECT iniciado_em, finalizado_em, acertos, total, nota, aprovado FROM curso_tentativas WHERE curso_id = $1 AND usuario_id = $2 ORDER BY id', [req.params.id, req.params.uid]),
  ]);
  res.json({ videos: v.rows, tentativas: t.rows });
});

module.exports = r;
