// /api/ia — agentes de IA por área: configuração, provedores, base de conhecimento, chat, feedback e aprendizado.
const crypto = require('crypto');
const { Router } = require('express');
const { pool } = require('../db');
const { exigirLogin } = require('../lib/auth');
const { permissoesDe } = require('../lib/rbac');
const IA = require('../lib/ia');
const arquivos = require('../lib/arquivos');

const r = Router();
r.use(exigirLogin);

const txt = (v, max = 500) => String(v ?? '').trim().slice(0, max);
const lista = (v, max = 30, tam = 300) => (Array.isArray(v) ? v : String(v || '').split('\n')).map(x => txt(x, tam)).filter(Boolean).slice(0, max);
const MAX_ARQUIVO = 15 * 1024 * 1024;

async function eu(req) {
  const { rows: [u] } = await pool.query('SELECT id, nome, perfil, area_id FROM usuarios WHERE id = $1', [req.usuario.sub]);
  return { ...u, perm: await permissoesDe(u?.perfil) };
}
// Configura: perfil com IA total, ou responsável pela própria área.
const podeConfigurar = (u, ag) => (u.perm.ia || 0) >= 2 || (!!ag.area_id && u.area_id === ag.area_id && (u.perm.ia || 0) >= 1);
const podeUsar = u => (u.perm.ia ?? 1) >= 1;

async function agentePor(codigo) {
  const { rows: [ag] } = await pool.query('SELECT * FROM ia_agentes WHERE codigo = $1', [codigo]);
  return ag || null;
}
async function exigirAgente(req, res, configurar) {
  const ag = await agentePor(req.params.codigo);
  if (!ag) { res.status(404).json({ erro: 'Agente não encontrado.' }); return null; }
  const u = await eu(req);
  if (configurar ? !podeConfigurar(u, ag) : !podeUsar(u)) {
    res.status(403).json({ erro: configurar ? 'Só o responsável pela área ou um perfil com IA total pode configurar este agente.' : 'Seu perfil não tem acesso ao assistente.' });
    return null;
  }
  return { ag, u };
}
const provedorStatus = async () => {
  const { rows } = await pool.query('SELECT codigo, chave_final, base_url, (chave_cifrada IS NOT NULL) AS tem_chave, atualizado_em, atualizado_por FROM ia_provedores');
  const m = Object.fromEntries(rows.map(x => [x.codigo, x]));
  return Object.entries(IA.PROVEDORES).map(([codigo, p]) => ({
    codigo, nome: p.nome, site: p.site, modelos: p.modelos, exige_url: !!p.exigeUrl, chave_opcional: !!p.chaveOpcional,
    configurado: !!(m[codigo]?.tem_chave || (p.chaveOpcional && m[codigo]?.base_url)),
    chave_final: m[codigo]?.chave_final || null, base_url: m[codigo]?.base_url || null,
    atualizado_em: m[codigo]?.atualizado_em || null, atualizado_por: m[codigo]?.atualizado_por || null,
  }));
};
const publico = ag => ({
  codigo: ag.codigo, area_id: ag.area_id, nome: ag.nome, descricao: ag.descricao, saudacao: ag.saudacao, sugestoes: ag.sugestoes,
  tom: ag.tom, tracos: ag.tracos, formato: ag.formato, instrucoes: ag.instrucoes, restricoes: ag.restricoes, encaminhamentos: ag.encaminhamentos,
  provedor: ag.provedor, modelo: ag.modelo, temperatura: Number(ag.temperatura), max_tokens: ag.max_tokens, ativo: ag.ativo,
  usar_guia: ag.usar_guia, aprendizado_auto: ag.aprendizado_auto, atualizado_em: ag.atualizado_em, atualizado_por: ag.atualizado_por,
});

// ---------------- Agentes ----------------
r.get('/agentes', async (req, res) => {
  const u = await eu(req);
  const provs = await provedorStatus();
  const { rows } = await pool.query(`
    SELECT a.*, ar.nome AS area_nome, ar.grad, ar.ic, ar.ordem AS area_ordem,
      (SELECT COUNT(*) FROM ia_documentos d WHERE d.agente_id = a.id AND d.ativo AND d.origem <> 'guia')::int AS documentos,
      (SELECT COUNT(*) FROM ia_aprendizados x WHERE x.agente_id = a.id AND x.status = 'aprovado')::int AS aprendizados,
      (SELECT COUNT(*) FROM ia_aprendizados x WHERE x.agente_id = a.id AND x.status = 'pendente')::int AS pendentes,
      (SELECT COUNT(*) FROM ia_mensagens m WHERE m.agente_id = a.id AND m.papel = 'user' AND m.criado_em > now() - interval '30 days')::int AS perguntas_30d
    FROM ia_agentes a LEFT JOIN areas ar ON ar.id = a.area_id
    ORDER BY (a.codigo <> 'geral'), ar.ordem NULLS FIRST`);
  res.json({
    agentes: rows.map(a => ({ ...publico(a), area_nome: a.area_nome, grad: a.grad, ic: a.ic, documentos: a.documentos, aprendizados: a.aprendizados,
      pendentes: a.pendentes, perguntas_30d: a.perguntas_30d, pode_configurar: podeConfigurar(u, a),
      provedor_ok: !!provs.find(p => p.codigo === a.provedor)?.configurado })),
    provedores: provs, pode_provedores: (u.perm.ia || 0) >= 2,
  });
});

r.get('/agentes/:codigo', async (req, res) => {
  const x = await exigirAgente(req, res, false); if (!x) return;
  const { ag, u } = x;
  const pc = podeConfigurar(u, ag);
  if (ag.area_id) await IA.sincronizarGuia(ag).catch(e => console.error('[ia] guia:', e.message));
  const base = { agente: publico(ag), pode_configurar: pc, provedores: await provedorStatus(), pode_provedores: (u.perm.ia || 0) >= 2 };
  if (!pc) return res.json(base);
  const [docs, apr, st] = await Promise.all([
    pool.query(`SELECT id, titulo, origem, tipo, tamanho, trechos, ativo, enviado_por, criado_em, (chave_r2 IS NOT NULL OR arquivo IS NOT NULL) AS tem_original
                  FROM ia_documentos WHERE agente_id = $1 ORDER BY (origem = 'guia') DESC, criado_em DESC`, [ag.id]),
    pool.query(`SELECT id, tipo, pergunta, conteudo, status, criado_por, revisado_por, criado_em, revisado_em
                  FROM ia_aprendizados WHERE agente_id = $1 AND status <> 'rejeitado' ORDER BY (status = 'pendente') DESC, criado_em DESC LIMIT 200`, [ag.id]),
    pool.query(`SELECT COUNT(*) FILTER (WHERE papel = 'user')::int AS perguntas,
                       COUNT(*) FILTER (WHERE feedback = 1)::int AS uteis, COUNT(*) FILTER (WHERE feedback = -1)::int AS nao_uteis,
                       COUNT(*) FILTER (WHERE modo = 'ia')::int AS respostas_ia, COUNT(*) FILTER (WHERE modo = 'busca')::int AS respostas_busca,
                       COALESCE(SUM(tokens_entrada), 0)::int AS tokens_entrada, COALESCE(SUM(tokens_saida), 0)::int AS tokens_saida,
                       COALESCE(ROUND(AVG(duracao_ms) FILTER (WHERE modo = 'ia')), 0)::int AS ms_medio,
                       COUNT(DISTINCT conversa_id)::int AS conversas
                  FROM ia_mensagens WHERE agente_id = $1 AND criado_em > now() - interval '30 days'`, [ag.id]),
  ]);
  const { rows: recentes } = await pool.query(
    `SELECT m.conteudo, m.criado_em, u.nome FROM ia_mensagens m JOIN ia_conversas c ON c.id = m.conversa_id LEFT JOIN usuarios u ON u.id = c.usuario_id
      WHERE m.agente_id = $1 AND m.papel = 'user' ORDER BY m.criado_em DESC LIMIT 12`, [ag.id]);
  res.json({ ...base, documentos: docs.rows, aprendizados: apr.rows, uso: st.rows[0], recentes });
});

r.put('/agentes/:codigo', async (req, res) => {
  const x = await exigirAgente(req, res, true); if (!x) return;
  const { ag, u } = x; const b = req.body || {};
  const nome = txt(b.nome, 80);
  if (!nome) return res.status(400).json({ erro: 'Dê um nome ao agente.' });
  if (b.provedor && !IA.PROVEDORES[b.provedor]) return res.status(400).json({ erro: 'Provedor inválido.' });
  const tracos = {};
  for (const k of ['acolhedora', 'objetiva', 'didatica', 'proativa', 'empatica', 'persistente']) tracos[k] = Math.max(0, Math.min(100, Math.round(Number(b.tracos?.[k] ?? 60))));
  const enc = (Array.isArray(b.encaminhamentos) ? b.encaminhamentos : []).map(e => [txt(e?.[0], 150), txt(e?.[1], 100)]).filter(e => e[0] && e[1]).slice(0, 20);
  const temp = Math.max(0, Math.min(1, Number(b.temperatura ?? 0.4)));
  const maxT = Math.max(200, Math.min(8000, Math.round(Number(b.max_tokens) || 1200)));
  const { rows: [novo] } = await pool.query(
    `UPDATE ia_agentes SET nome=$2, descricao=$3, saudacao=$4, sugestoes=$5, tom=$6, tracos=$7, formato=$8, instrucoes=$9, restricoes=$10,
            encaminhamentos=$11, provedor=$12, modelo=$13, temperatura=$14, max_tokens=$15, ativo=$16, usar_guia=$17, aprendizado_auto=$18,
            atualizado_em=now(), atualizado_por=$19 WHERE id=$1 RETURNING *`,
    [ag.id, nome, txt(b.descricao, 600), txt(b.saudacao, 600), JSON.stringify(lista(b.sugestoes, 8, 150)),
     ['amigavel', 'profissional', 'empatica', 'consultiva', 'objetiva'].includes(b.tom) ? b.tom : 'consultiva', JSON.stringify(tracos),
     ['curto', 'equilibrado', 'detalhado'].includes(b.formato) ? b.formato : 'equilibrado', txt(b.instrucoes, 8000),
     JSON.stringify(lista(b.restricoes, 30, 300)), JSON.stringify(enc), b.provedor || null, txt(b.modelo, 120) || null, temp, maxT,
     b.ativo !== false, b.usar_guia !== false, !!b.aprendizado_auto, u.nome]);
  res.json({ agente: publico(novo) });
});

// ---------------- Provedores (chaves) ----------------
r.get('/provedores', async (req, res) => res.json(await provedorStatus()));

r.put('/provedores/:codigo', async (req, res) => {
  const u = await eu(req);
  if ((u.perm.ia || 0) < 2) return res.status(403).json({ erro: 'Só perfis com IA total cadastram chaves de provedores.' });
  const p = IA.PROVEDORES[req.params.codigo];
  if (!p) return res.status(400).json({ erro: 'Provedor inválido.' });
  const chave = txt(req.body?.chave, 400);
  const url = txt(req.body?.base_url, 300);
  if (url && !/^https?:\/\/[^\s]+$/i.test(url)) return res.status(400).json({ erro: 'URL base inválida (use http:// ou https://).' });
  if (p.exigeUrl && !url) return res.status(400).json({ erro: 'Informe a URL base do provedor compatível (ex.: http://servidor:11434/v1).' });
  if (!chave && !p.chaveOpcional && !url) return res.status(400).json({ erro: 'Cole a chave de API.' });
  await pool.query(
    `INSERT INTO ia_provedores (codigo, chave_cifrada, chave_final, base_url, atualizado_em, atualizado_por)
     VALUES ($1, CASE WHEN $2::text = '' THEN NULL ELSE pgp_sym_encrypt($2::text, $3::text) END, NULLIF($4,''), NULLIF($5,''), now(), $6)
     ON CONFLICT (codigo) DO UPDATE SET
       chave_cifrada = CASE WHEN $2::text = '' THEN ia_provedores.chave_cifrada ELSE EXCLUDED.chave_cifrada END,
       chave_final = CASE WHEN $2::text = '' THEN ia_provedores.chave_final ELSE EXCLUDED.chave_final END,
       base_url = EXCLUDED.base_url, atualizado_em = now(), atualizado_por = EXCLUDED.atualizado_por`,
    [req.params.codigo, chave, process.env.SESSION_SECRET, chave ? chave.slice(-4) : '', url, u.nome]);
  res.json(await provedorStatus());
});

r.delete('/provedores/:codigo', async (req, res) => {
  const u = await eu(req);
  if ((u.perm.ia || 0) < 2) return res.status(403).json({ erro: 'Só perfis com IA total removem chaves de provedores.' });
  await pool.query('DELETE FROM ia_provedores WHERE codigo = $1', [req.params.codigo]);
  res.json(await provedorStatus());
});

r.post('/provedores/:codigo/modelos', async (req, res) => {
  const u = await eu(req);
  if ((u.perm.ia || 0) < 2 && !u.area_id) return res.status(403).json({ erro: 'Sem permissão.' });
  try { res.json({ modelos: await IA.listarModelos(req.params.codigo) }); }
  catch (e) { res.status(400).json({ erro: e.message }); }
});

r.post('/agentes/:codigo/testar', async (req, res) => {
  const x = await exigirAgente(req, res, true); if (!x) return;
  const b = req.body || {};
  const provedor = b.provedor || x.ag.provedor, modelo = txt(b.modelo, 120) || x.ag.modelo;
  if (!provedor || !modelo) return res.status(400).json({ erro: 'Escolha o provedor e o modelo.' });
  try {
    const g = await IA.gerar({ provedor, modelo, sistema: 'Você é um teste de conexão. Responda em português, em uma frase curta.', mensagens: [{ papel: 'user', conteudo: 'Diga "Conexão OK" e o nome do seu modelo.' }], temperatura: 0, maxTokens: 60 });
    res.json({ ok: true, resposta: g.texto, ms: g.ms });
  } catch (e) { res.status(400).json({ erro: e.message }); }
});

// ---------------- Base de conhecimento ----------------
r.post('/agentes/:codigo/documentos', async (req, res) => {
  const x = await exigirAgente(req, res, true); if (!x) return;
  const { ag, u } = x; const b = req.body || {};
  let titulo = txt(b.titulo || b.nome, 200), texto, tipo = 'texto', tamanho, buffer = null, origem = 'texto';
  if (b.base64) {
    buffer = Buffer.from(String(b.base64), 'base64');
    if (!buffer.length) return res.status(400).json({ erro: 'Arquivo vazio.' });
    if (buffer.length > MAX_ARQUIVO) return res.status(400).json({ erro: 'Arquivo maior que 15 MB. Divida o conteúdo ou envie em PDF compactado.' });
    try { const e = await IA.extrairTexto(b.nome || 'arquivo', buffer); texto = e.texto; tipo = e.ext; }
    catch (e) { return res.status(400).json({ erro: e.message.startsWith('Formato') ? e.message : `Não foi possível ler o arquivo: ${e.message}` }); }
    origem = 'arquivo'; tamanho = buffer.length;
    if (!titulo) titulo = txt(b.nome, 200);
  } else {
    texto = txt(b.texto, 200000);
    if (!titulo) return res.status(400).json({ erro: 'Dê um título ao conhecimento.' });
    tamanho = texto.length;
  }
  texto = String(texto || '').replace(/\u0000/g, '').slice(0, 2000000);
  if (texto.replace(/\s/g, '').length < 20) return res.status(400).json({ erro: origem === 'arquivo' ? 'Não encontrei texto legível no arquivo (PDF escaneado como imagem não tem texto). Envie a versão em texto ou Word.' : 'Escreva o conteúdo (pelo menos algumas linhas).' });
  let chave = null;
  if (buffer && arquivos.r2Ativo()) {
    chave = `ia/${ag.codigo}/${Date.now()}-${crypto.randomBytes(4).toString('hex')}-${String(b.nome || 'arquivo').replace(/[^\w.\-]+/g, '_').slice(-80)}`;
    try { await arquivos.guardar(chave, buffer, b.tipo); } catch (e) { console.error('[r2] envio:', e.message); chave = null; }
  }
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    const { rows: [d] } = await c.query(
      `INSERT INTO ia_documentos (agente_id, titulo, origem, tipo, tamanho, arquivo, chave_r2, texto, enviado_por) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id, agente_id, titulo, texto`,
      [ag.id, titulo, origem, tipo, tamanho, buffer && !chave ? buffer : null, chave, texto, u.nome]);
    const n = await IA.indexar(c, d);
    await c.query('COMMIT');
    res.status(201).json({ id: d.id, trechos: n, caracteres: texto.length });
  } catch (e) { await c.query('ROLLBACK'); throw e; } finally { c.release(); }
});

async function docComPermissao(req, res) {
  const { rows: [d] } = await pool.query('SELECT d.*, a.codigo, a.area_id FROM ia_documentos d JOIN ia_agentes a ON a.id = d.agente_id WHERE d.id = $1', [req.params.id]);
  if (!d) { res.status(404).json({ erro: 'Documento não encontrado.' }); return null; }
  if (!podeConfigurar(await eu(req), d)) { res.status(403).json({ erro: 'Sem permissão para este documento.' }); return null; }
  return d;
}
r.get('/documentos/:id', async (req, res) => {
  const d = await docComPermissao(req, res); if (!d) return;
  res.json({ id: d.id, titulo: d.titulo, origem: d.origem, tipo: d.tipo, texto: String(d.texto || '').slice(0, 60000), truncado: String(d.texto || '').length > 60000, trechos: d.trechos });
});
r.get('/documentos/:id/original', async (req, res) => {
  const d = await docComPermissao(req, res); if (!d) return;
  if (d.chave_r2) return res.json({ url: await arquivos.urlTemporaria(d.chave_r2, d.titulo) });
  if (d.arquivo) return res.json({ base64: d.arquivo.toString('base64'), nome: d.titulo });
  res.status(404).json({ erro: 'Este conhecimento foi escrito na plataforma e não tem arquivo original.' });
});
r.patch('/documentos/:id', async (req, res) => {
  const d = await docComPermissao(req, res); if (!d) return;
  const b = req.body || {};
  if (d.origem === 'texto' && typeof b.texto === 'string') {
    const texto = txt(b.texto, 200000), titulo = txt(b.titulo, 200) || d.titulo;
    const c = await pool.connect();
    try {
      await c.query('BEGIN');
      await c.query('UPDATE ia_documentos SET texto = $2, titulo = $3, tamanho = $4 WHERE id = $1', [d.id, texto, titulo, texto.length]);
      await IA.indexar(c, { id: d.id, agente_id: d.agente_id, titulo, texto });
      await c.query('COMMIT');
    } catch (e) { await c.query('ROLLBACK'); throw e; } finally { c.release(); }
  }
  if (typeof b.ativo === 'boolean') await pool.query('UPDATE ia_documentos SET ativo = $2 WHERE id = $1', [d.id, b.ativo]);
  res.json({ ok: true });
});
r.delete('/documentos/:id', async (req, res) => {
  const d = await docComPermissao(req, res); if (!d) return;
  if (d.origem === 'guia') return res.status(400).json({ erro: 'O guia da área vem da plataforma: desative-o em vez de excluir.' });
  if (d.chave_r2) await arquivos.remover(d.chave_r2);
  await pool.query('DELETE FROM ia_documentos WHERE id = $1', [d.id]);
  res.json({ ok: true });
});
r.post('/agentes/:codigo/guia', async (req, res) => {
  const x = await exigirAgente(req, res, true); if (!x) return;
  if (!x.ag.area_id) return res.status(400).json({ erro: 'O Assistente Milla geral usa os guias de todas as áreas.' });
  await IA.sincronizarGuia(x.ag, true);
  res.json({ ok: true });
});

// ---------------- Chat ----------------
function respostaBusca(achados, aviso) {
  const L = [];
  if (aviso) L.push(`_${aviso}_`, '');
  if (achados.aprendizados.length) {
    L.push('**Resposta validada pela área:**', achados.aprendizados[0].conteudo, '');
  }
  if (achados.trechos.length) {
    L.push('**Encontrei isto na base de conhecimento:**');
    achados.trechos.slice(0, 3).forEach((t, i) => {
      const corpo = t.texto.replace(/^\[[^\]]*\]\n/, '').replace(/^#+ /gm, '').trim();
      L.push('', `**[${i + 1}] ${t.titulo}**`, corpo.length > 700 ? corpo.slice(0, 700) + '…' : corpo);
    });
  }
  if (!L.filter(Boolean).length || (!achados.trechos.length && !achados.aprendizados.length)) {
    L.push('Não encontrei isso na base de conhecimento desta área. Tente outras palavras ou procure o responsável pela área. A pergunta foi registrada como lacuna para a área completar o conhecimento.');
  }
  return L.join('\n');
}

async function registrarLacuna(ag, pergunta, autor, msgId) {
  const { rowCount } = await pool.query(`SELECT 1 FROM ia_aprendizados WHERE agente_id = $1 AND tipo = 'lacuna' AND status = 'pendente' AND lower(pergunta) = lower($2)`, [ag.id, pergunta]);
  if (!rowCount) await pool.query(`INSERT INTO ia_aprendizados (agente_id, tipo, pergunta, mensagem_id, criado_por, busca) VALUES ($1,'lacuna',$2,$3,$4,$5)`, [ag.id, pergunta, msgId, autor, IA.normalizar(pergunta)]);
}

r.post('/agentes/:codigo/chat', async (req, res) => {
  const x = await exigirAgente(req, res, false); if (!x) return;
  const { ag, u } = x;
  const pergunta = txt(req.body?.mensagem, 4000);
  if (!pergunta) return res.status(400).json({ erro: 'Escreva a pergunta.' });
  // Conversa (só do próprio usuário)
  let conversaId = Number(req.body?.conversa_id) || null;
  if (conversaId) {
    const { rowCount } = await pool.query('SELECT 1 FROM ia_conversas WHERE id = $1 AND usuario_id = $2 AND agente_id = $3', [conversaId, u.id, ag.id]);
    if (!rowCount) conversaId = null;
  }
  if (!conversaId) ({ rows: [{ id: conversaId }] } = await pool.query('INSERT INTO ia_conversas (agente_id, usuario_id, titulo) VALUES ($1,$2,$3) RETURNING id', [ag.id, u.id, pergunta.slice(0, 120)]));
  const { rows: hist } = await pool.query('SELECT papel, conteudo FROM ia_mensagens WHERE conversa_id = $1 ORDER BY id DESC LIMIT 8', [conversaId]);
  await pool.query('INSERT INTO ia_mensagens (conversa_id, agente_id, papel, conteudo) VALUES ($1,$2,$3,$4)', [conversaId, ag.id, 'user', pergunta]);

  if (ag.area_id && ag.usar_guia) await IA.sincronizarGuia(ag).catch(e => console.error('[ia] guia:', e.message));
  // Busca: pergunta atual + contexto da última pergunta (perguntas de continuação).
  const ultimaUser = hist.find(h => h.papel === 'user')?.conteudo || '';
  let achados = await IA.buscar(ag, pergunta);
  if (!achados.trechos.length && ultimaUser) achados = await IA.buscar(ag, `${pergunta} ${ultimaUser}`);
  if (!ag.usar_guia) achados.trechos = achados.trechos.filter(t => t.origem !== 'guia');
  const semBase = !achados.trechos.length && !achados.aprendizados.length;

  let texto, modo = 'busca', meta = {};
  const prov = ag.provedor && IA.PROVEDORES[ag.provedor];
  if (ag.ativo && prov && ag.modelo) {
    try {
      const { rows: marcas } = await pool.query('SELECT codigo FROM marcas ORDER BY ordem');
      const { rows: [area] } = ag.area_id ? await pool.query('SELECT nome FROM areas WHERE id = $1', [ag.area_id]) : { rows: [null] };
      const sistema = IA.montarSistema(ag, marcas.map(m => m.codigo), achados, area?.nome);
      const msgs = hist.reverse().map(h => ({ papel: h.papel, conteudo: h.conteudo.slice(0, 4000) }));
      while (msgs.length && msgs[0].papel !== 'user') msgs.shift();
      msgs.push({ papel: 'user', conteudo: pergunta });
      const g = await IA.gerar({ provedor: ag.provedor, modelo: ag.modelo, sistema, mensagens: msgs, temperatura: ag.temperatura, maxTokens: ag.max_tokens });
      if (!g.texto) throw new Error('o modelo devolveu uma resposta vazia');
      texto = g.texto; modo = 'ia'; meta = g;
    } catch (e) {
      console.error('[ia] geração:', e.message);
      texto = respostaBusca(achados, `A IA generativa não respondeu agora (${e.message}). Mostrando o resultado da busca na base de conhecimento.`);
    }
  } else {
    texto = respostaBusca(achados, ag.ativo && !prov ? 'Modo busca: este agente ainda não tem provedor de IA configurado.' : !ag.ativo ? 'Modo busca: a IA generativa deste agente está desligada.' : '');
  }
  const fontes = [...achados.trechos.map((t, i) => ({ n: i + 1, titulo: t.titulo, origem: t.origem })), ...achados.aprendizados.map(a => ({ titulo: 'Aprendizado validado', tipo: a.tipo }))];
  const { rows: [m] } = await pool.query(
    `INSERT INTO ia_mensagens (conversa_id, agente_id, papel, conteudo, fontes, modo, provedor, modelo, tokens_entrada, tokens_saida, duracao_ms)
     VALUES ($1,$2,'assistant',$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
    [conversaId, ag.id, texto, JSON.stringify(fontes), modo, modo === 'ia' ? ag.provedor : null, modo === 'ia' ? ag.modelo : null, meta.entrada || null, meta.saida || null, meta.ms || null]);
  if (semBase || /^n[aã]o encontrei isso na base/i.test(texto)) await registrarLacuna(ag, pergunta, u.nome, m.id);
  res.json({ conversa_id: conversaId, mensagem: { id: m.id, conteudo: texto, fontes, modo, modelo: modo === 'ia' ? ag.modelo : null } });
});

r.get('/agentes/:codigo/conversas', async (req, res) => {
  const x = await exigirAgente(req, res, false); if (!x) return;
  const { rows } = await pool.query(
    `SELECT c.id, c.titulo, c.criado_em, (SELECT COUNT(*) FROM ia_mensagens m WHERE m.conversa_id = c.id)::int AS mensagens
       FROM ia_conversas c WHERE c.agente_id = $1 AND c.usuario_id = $2 ORDER BY c.criado_em DESC LIMIT 15`, [x.ag.id, x.u.id]);
  res.json(rows);
});
r.get('/conversas/:id', async (req, res) => {
  const { rows: [c] } = await pool.query('SELECT * FROM ia_conversas WHERE id = $1 AND usuario_id = $2', [req.params.id, req.usuario.sub]);
  if (!c) return res.status(404).json({ erro: 'Conversa não encontrada.' });
  const { rows } = await pool.query('SELECT id, papel, conteudo, fontes, modo, modelo, feedback FROM ia_mensagens WHERE conversa_id = $1 ORDER BY id', [c.id]);
  res.json({ id: c.id, mensagens: rows });
});

// ---------------- Feedback e aprendizado ----------------
r.post('/mensagens/:id/feedback', async (req, res) => {
  const { rows: [m] } = await pool.query(
    `SELECT m.*, c.usuario_id FROM ia_mensagens m JOIN ia_conversas c ON c.id = m.conversa_id WHERE m.id = $1 AND m.papel = 'assistant'`, [req.params.id]);
  if (!m || m.usuario_id !== req.usuario.sub) return res.status(404).json({ erro: 'Resposta não encontrada.' });
  const valor = Number(req.body?.valor) === 1 ? 1 : -1;
  const comentario = txt(req.body?.comentario, 1000), correcao = txt(req.body?.correcao, 6000);
  await pool.query('UPDATE ia_mensagens SET feedback = $2, feedback_comentario = $3 WHERE id = $1', [m.id, valor, comentario || correcao || null]);
  const { rows: [q] } = await pool.query(`SELECT conteudo FROM ia_mensagens WHERE conversa_id = $1 AND papel = 'user' AND id < $2 ORDER BY id DESC LIMIT 1`, [m.conversa_id, m.id]);
  const { rows: [ag] } = await pool.query('SELECT * FROM ia_agentes WHERE id = $1', [m.agente_id]);
  const u = await eu(req);
  const pergunta = q?.conteudo || '';
  let tipo = null, conteudo = null;
  if (valor === 1) { tipo = 'validada'; conteudo = m.conteudo; }
  else if (correcao) { tipo = 'correcao'; conteudo = correcao; }
  else { tipo = 'revisao'; conteudo = comentario || 'Resposta marcada como "não ajudou" — revisar e escrever a resposta correta.'; }
  // Aprendizado automático: correções e validações entram direto; revisões sempre passam pela área.
  const status = ag.aprendizado_auto && tipo !== 'revisao' ? 'aprovado' : 'pendente';
  await pool.query(`DELETE FROM ia_aprendizados WHERE mensagem_id = $1 AND status = 'pendente' AND tipo IN ('validada','correcao','revisao')`, [m.id]);
  await pool.query(
    `INSERT INTO ia_aprendizados (agente_id, tipo, pergunta, conteudo, mensagem_id, status, criado_por, revisado_por, revisado_em, busca)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    [ag.id, tipo, pergunta, conteudo, m.id, status, u.nome, status === 'aprovado' ? 'Aprendizado automático' : null, status === 'aprovado' ? new Date() : null, IA.normalizar(`${pergunta} ${conteudo}`)]);
  res.json({ ok: true, status, tipo });
});

r.post('/agentes/:codigo/aprendizados', async (req, res) => {
  const x = await exigirAgente(req, res, true); if (!x) return;
  const pergunta = txt(req.body?.pergunta, 1000), conteudo = txt(req.body?.conteudo, 6000);
  if (!conteudo) return res.status(400).json({ erro: 'Escreva o conteúdo do aprendizado.' });
  const tipo = req.body?.tipo === 'instrucao' ? 'instrucao' : 'faq';
  await pool.query(`INSERT INTO ia_aprendizados (agente_id, tipo, pergunta, conteudo, status, criado_por, revisado_por, revisado_em, busca) VALUES ($1,$2,$3,$4,'aprovado',$5,$5,now(),$6)`,
    [x.ag.id, tipo, pergunta || null, conteudo, x.u.nome, IA.normalizar(`${pergunta} ${conteudo}`)]);
  res.status(201).json({ ok: true });
});

async function aprComPermissao(req, res) {
  const { rows: [a] } = await pool.query('SELECT x.*, g.area_id, g.codigo FROM ia_aprendizados x JOIN ia_agentes g ON g.id = x.agente_id WHERE x.id = $1', [req.params.id]);
  if (!a) { res.status(404).json({ erro: 'Aprendizado não encontrado.' }); return null; }
  const u = await eu(req);
  if (!podeConfigurar(u, a)) { res.status(403).json({ erro: 'Sem permissão.' }); return null; }
  return { a, u };
}
r.patch('/aprendizados/:id', async (req, res) => {
  const x = await aprComPermissao(req, res); if (!x) return;
  const { a, u } = x; const b = req.body || {};
  const status = ['aprovado', 'rejeitado', 'pendente'].includes(b.status) ? b.status : a.status;
  const pergunta = b.pergunta !== undefined ? txt(b.pergunta, 1000) : a.pergunta;
  const conteudo = b.conteudo !== undefined ? txt(b.conteudo, 6000) : a.conteudo;
  if (status === 'aprovado' && !conteudo) return res.status(400).json({ erro: 'Escreva a resposta correta antes de aprovar.' });
  // Lacuna respondida vira FAQ aprovada.
  const tipo = a.tipo === 'lacuna' && status === 'aprovado' ? 'faq' : a.tipo === 'revisao' && status === 'aprovado' ? 'correcao' : a.tipo;
  await pool.query(`UPDATE ia_aprendizados SET status = $2, pergunta = $3, conteudo = $4, tipo = $5, revisado_por = $6, revisado_em = now(), busca = $7 WHERE id = $1`,
    [a.id, status, pergunta, conteudo, tipo, u.nome, IA.normalizar(`${pergunta || ''} ${conteudo || ''}`)]);
  res.json({ ok: true });
});
r.delete('/aprendizados/:id', async (req, res) => {
  const x = await aprComPermissao(req, res); if (!x) return;
  await pool.query('DELETE FROM ia_aprendizados WHERE id = $1', [x.a.id]);
  res.json({ ok: true });
});

module.exports = r;
