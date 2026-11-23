// /api/comite-gestao — Comitê Comercial: calendário de reuniões, indicadores, transcrição, ata (IA) e
// plano de ação em checklist com encaminhamento ao Kanban da área.
const { Router } = require('express');
const { pool } = require('../db');
const { exigirLogin } = require('../lib/auth');
const { pode } = require('../lib/rbac');
const IA = require('../lib/ia');
const { REGRAS, creditar } = require('../lib/pontos');

const r = Router();
r.use(exigirLogin);

const txt = (v, max = 500) => String(v ?? '').trim().slice(0, max);
const dataOuNull = v => (/^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) ? v : null);
const dtHora = v => (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(String(v || '')) ? String(v).slice(0, 16) : null);
const STATUS_ITEM = ['Aberta', 'Em andamento', 'Concluída', 'Cancelada', 'Agendada'];
const quem = async req => (await pool.query('SELECT nome FROM usuarios WHERE id = $1', [req.usuario.sub])).rows[0]?.nome || 'Usuário';

// Situação efetiva do item: quando encaminhado, acompanha a ação da área.
const SQL_ITENS = `
  SELECT i.*, r.data AS reuniao_data, r.titulo AS reuniao_titulo, a.nome AS area_nome,
         ac.status AS acao_status, ac.prazo AS acao_prazo,
         CASE WHEN i.status = 'Cancelada' THEN 'Cancelada'
              WHEN ac.id IS NOT NULL AND ac.status = 'Concluído' THEN 'Concluída'
              WHEN ac.id IS NULL AND i.status = 'Concluída' THEN 'Concluída'
              WHEN COALESCE(ac.prazo, i.prazo) < CURRENT_DATE THEN 'Atrasada'
              WHEN ac.id IS NOT NULL AND ac.status IN ('Em andamento', 'Em revisão') THEN 'Em andamento'
              ELSE i.status END AS situacao,
         CASE WHEN ac.id IS NOT NULL THEN ac.concluido_em ELSE i.concluido_em END AS concluido_efetivo
    FROM comite_itens i
    JOIN comite_reunioes r ON r.id = i.reuniao_id
    LEFT JOIN areas a ON a.id = i.area_id
    LEFT JOIN acoes ac ON ac.id = i.acao_id`;

// ---------------- painel: calendário + indicadores + histórico ----------------
r.get('/painel', pode('comite', 1), async (req, res) => {
  const mes = /^\d{4}-\d{2}$/.test(req.query.mes || '') ? req.query.mes : new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date()).slice(0, 7);
  const ini = `${mes}-01`;
  const [reun, kpi, hist, pend, prox] = await Promise.all([
    pool.query(`SELECT r.id, r.titulo, r.data, r.fim, r.status, r.local, (r.ata_json IS NOT NULL OR r.ata IS NOT NULL) AS tem_ata,
                       (SELECT COUNT(*) FROM comite_itens i WHERE i.reuniao_id = r.id)::int AS itens
                  FROM comite_reunioes r
                 WHERE r.data >= ($1::date - interval '7 days') AND r.data < ($1::date + interval '1 month' + interval '7 days') ORDER BY r.data`, [ini]),
    pool.query(`WITH it AS (${SQL_ITENS})
      SELECT
        (SELECT COUNT(*) FROM comite_reunioes WHERE status = 'Realizada' AND data >= $1::date AND data < $1::date + interval '1 month')::int AS realizadas,
        (SELECT COUNT(*) FROM comite_reunioes WHERE status <> 'Cancelada' AND data >= $1::date AND data < $1::date + interval '1 month')::int AS agendadas,
        (SELECT COUNT(*) FROM it WHERE reuniao_data >= $1::date AND reuniao_data < $1::date + interval '1 month')::int AS geradas,
        (SELECT COUNT(*) FROM it WHERE reuniao_data >= $1::date AND reuniao_data < $1::date + interval '1 month' AND situacao = 'Concluída')::int AS geradas_concluidas,
        (SELECT COUNT(*) FROM it WHERE reuniao_data >= $1::date AND reuniao_data < $1::date + interval '1 month' AND acao_id IS NOT NULL)::int AS encaminhadas,
        (SELECT COUNT(*) FROM it WHERE situacao = 'Concluída' AND concluido_efetivo >= $1::date AND concluido_efetivo < $1::date + interval '1 month')::int AS resolvidas,
        (SELECT COUNT(*) FROM it WHERE situacao = 'Concluída' AND concluido_efetivo >= $1::date AND concluido_efetivo < $1::date + interval '1 month'
                                   AND (COALESCE(acao_prazo, prazo) IS NULL OR concluido_efetivo::date <= COALESCE(acao_prazo, prazo)))::int AS resolvidas_prazo,
        (SELECT ROUND(AVG(EXTRACT(EPOCH FROM (concluido_efetivo - reuniao_data)) / 86400))::int FROM it
          WHERE situacao = 'Concluída' AND concluido_efetivo >= $1::date AND concluido_efetivo < $1::date + interval '1 month') AS dias_medios,
        (SELECT COUNT(*) FROM it WHERE situacao = 'Atrasada')::int AS vencidas,
        (SELECT COUNT(*) FROM it WHERE situacao IN ('Aberta', 'Em andamento', 'Atrasada', 'Agendada'))::int AS abertas,
        (SELECT COUNT(*) FROM it WHERE situacao IN ('Aberta', 'Atrasada') AND acao_id IS NULL AND area_id IS NULL)::int AS sem_responsavel`, [ini]),
    pool.query(`SELECT r.id, r.titulo, r.data, r.status, (r.ata_json IS NOT NULL OR r.ata IS NOT NULL) AS tem_ata,
                       (SELECT COUNT(*) FROM comite_itens i WHERE i.reuniao_id = r.id)::int AS itens
                  FROM comite_reunioes r WHERE r.status = 'Realizada' ORDER BY r.data DESC LIMIT 12`),
    pool.query(`WITH it AS (${SQL_ITENS}) SELECT * FROM it WHERE situacao IN ('Aberta', 'Em andamento', 'Atrasada', 'Agendada')
                ORDER BY CASE situacao WHEN 'Atrasada' THEN 0 ELSE 1 END, COALESCE(acao_prazo, prazo) NULLS LAST LIMIT 12`),
    pool.query(`SELECT id, titulo, data FROM comite_reunioes WHERE status = 'Agendada' AND data >= now() ORDER BY data LIMIT 1`),
  ]);
  res.json({ mes, reunioes: reun.rows, kpis: kpi.rows[0], historico: hist.rows, pendencias: pend.rows, proxima: prox.rows[0] || null });
});

// ---------------- reunião ----------------
async function carregar(id) {
  const { rows: [r0] } = await pool.query('SELECT * FROM comite_reunioes WHERE id = $1', [id]);
  if (!r0) return null;
  const [itens, ant, us] = await Promise.all([
    pool.query(`WITH it AS (${SQL_ITENS}) SELECT * FROM it WHERE reuniao_id = $1 ORDER BY ordem, id`, [id]),
    pool.query(`WITH it AS (${SQL_ITENS}) SELECT * FROM it WHERE reuniao_data < $1 AND reuniao_id <> $2
                  AND (situacao IN ('Aberta', 'Em andamento', 'Atrasada', 'Agendada') OR concluido_efetivo >= $1 - interval '1 day')
                ORDER BY reuniao_data, ordem LIMIT 60`, [r0.data, id]),
    pool.query(`SELECT id, nome, cargo, area_id FROM usuarios WHERE ativo ORDER BY nome`),
  ]);
  return { reuniao: r0, itens: itens.rows, anteriores: ant.rows, usuarios: us.rows };
}
r.get('/reunioes/:id', pode('comite', 1), async (req, res) => {
  const d = await carregar(req.params.id);
  if (!d) return res.status(404).json({ erro: 'Reunião não encontrada.' });
  res.json(d);
});

function cabecalho(b, atual = {}) {
  const pauta = Array.isArray(b.pauta) ? b.pauta.map(p => ({ item: txt(p.item, 200), area: txt(p.area, 40) })).filter(p => p.item).slice(0, 30) : atual.pauta || [];
  return {
    titulo: txt(b.titulo, 150) || atual.titulo, subtitulo: b.subtitulo !== undefined ? txt(b.subtitulo, 300) : atual.subtitulo,
    data: dtHora(b.data) || null, fim: b.fim !== undefined ? dtHora(b.fim) : undefined,
    local: b.local !== undefined ? txt(b.local, 120) : atual.local, conducao: b.conducao !== undefined ? txt(b.conducao, 120) : atual.conducao,
    registro: b.registro !== undefined ? txt(b.registro, 120) : atual.registro, presidente: b.presidente !== undefined ? txt(b.presidente, 120) : atual.presidente,
    participantes: b.participantes !== undefined ? txt(b.participantes, 1500) : atual.participantes, ausencias: b.ausencias !== undefined ? txt(b.ausencias, 800) : atual.ausencias,
    pauta,
  };
}
r.post('/reunioes', pode('comite', 2), async (req, res) => {
  const c = cabecalho(req.body || {});
  if (!c.titulo || !c.data) return res.status(400).json({ erro: 'Informe o título, a data e a hora da reunião.' });
  const { rows: [n] } = await pool.query(
    `INSERT INTO comite_reunioes (titulo, subtitulo, data, fim, local, conducao, registro, presidente, participantes, ausencias, pauta, criado_por, atualizado_em, atualizado_por)
     VALUES ($1,$2,($3::timestamp AT TIME ZONE 'America/Sao_Paulo'),($4::timestamp AT TIME ZONE 'America/Sao_Paulo'),$5,$6,$7,$8,$9,$10,$11,$12,now(),$13) RETURNING id`,
    [c.titulo, c.subtitulo || null, c.data, c.fim || null, c.local || null, c.conducao || null, c.registro || null, c.presidente || null, c.participantes || null, c.ausencias || null, JSON.stringify(c.pauta), req.usuario.sub, await quem(req)]);
  res.status(201).json({ id: n.id });
});
r.put('/reunioes/:id', pode('comite', 2), async (req, res) => {
  const { rows: [r0] } = await pool.query('SELECT * FROM comite_reunioes WHERE id = $1', [req.params.id]);
  if (!r0) return res.status(404).json({ erro: 'Reunião não encontrada.' });
  const b = req.body || {};
  const c = cabecalho(b, r0);
  const status = ['Agendada', 'Realizada', 'Cancelada'].includes(b.status) ? b.status : r0.status;
  const ata = b.ata_json && typeof b.ata_json === 'object' ? limparAta(b.ata_json) : r0.ata_json;
  await pool.query(
    `UPDATE comite_reunioes SET titulo=$2, subtitulo=$3, data=COALESCE((($4::text)::timestamp AT TIME ZONE 'America/Sao_Paulo'), data),
            fim=CASE WHEN $5::text = '__manter' THEN fim ELSE (($5::text)::timestamp AT TIME ZONE 'America/Sao_Paulo') END,
            local=$6, conducao=$7, registro=$8, presidente=$9, participantes=$10, ausencias=$11, pauta=$12, status=$13,
            transcricao=$14, ata_json=$15, atualizado_em=now(), atualizado_por=$16 WHERE id=$1`,
    [r0.id, c.titulo, c.subtitulo || null, c.data, c.fim === undefined ? '__manter' : c.fim, c.local || null, c.conducao || null, c.registro || null, c.presidente || null,
     c.participantes || null, c.ausencias || null, JSON.stringify(c.pauta), status, b.transcricao !== undefined ? txt(b.transcricao, 400000) || null : r0.transcricao,
     ata ? JSON.stringify(ata) : null, await quem(req)]);
  let pontos = 0;
  if (status === 'Realizada' && r0.status !== 'Realizada') { pontos = REGRAS.comite; await creditar(req.usuario.sub, pontos, `Participação no comitê: ${r0.titulo}`, `comite:${r0.id}`); }
  res.json({ ok: true, pontosGanhos: pontos });
});

function limparAta(a) {
  const lista = (v, n, m) => (Array.isArray(v) ? v : []).map(x => txt(x, m)).filter(Boolean).slice(0, n);
  return {
    documentos: txt(a.documentos, 3000),
    resumo: (Array.isArray(a.resumo) ? a.resumo : []).map(s => ({ tema: txt(s.tema, 120), texto: txt(s.texto, 6000) })).filter(s => s.tema || s.texto).slice(0, 20),
    diretrizes: lista(a.diretrizes, 30, 600),
    observacoes: txt(a.observacoes, 3000),
  };
}

// ---------------- transcrição: arquivo de texto/Word/PDF/legenda ou áudio (transcrito por IA) ----------------
r.post('/reunioes/:id/transcricao', pode('comite', 2), async (req, res) => {
  const { rows: [r0] } = await pool.query('SELECT id FROM comite_reunioes WHERE id = $1', [req.params.id]);
  if (!r0) return res.status(404).json({ erro: 'Reunião não encontrada.' });
  const nome = txt(req.query.nome, 200) || 'arquivo.txt';
  const tipo = String(req.headers['content-type'] || '');
  const partes = []; let total = 0;
  for await (const p of req) { total += p.length; if (total > 26 * 1024 * 1024) return res.status(400).json({ erro: 'Arquivo maior que 25 MB.' }); partes.push(p); }
  const buf = Buffer.concat(partes);
  let texto = '';
  try {
    if (/^(audio|video)\//.test(tipo)) texto = await transcreverAudio(buf, nome, tipo);
    else if (/\.(vtt|srt)$/i.test(nome)) texto = buf.toString('utf8').replace(/^WEBVTT.*$/m, '').replace(/^\d+\s*$/gm, '').replace(/^[\d:.,]+ --> [\d:.,]+.*$/gm, '').replace(/\n{2,}/g, '\n').trim();
    else texto = (await IA.extrairTexto(nome, buf)).texto;
  } catch (e) { return res.status(400).json({ erro: e.message }); }
  texto = String(texto || '').trim();
  if (!texto) return res.status(400).json({ erro: 'Não foi possível ler texto deste arquivo.' });
  await pool.query('UPDATE comite_reunioes SET transcricao = $2, transcricao_origem = $3, atualizado_em = now(), atualizado_por = $4 WHERE id = $1',
    [r0.id, texto.slice(0, 400000), nome, await quem(req)]);
  res.json({ ok: true, caracteres: texto.length, texto: texto.slice(0, 400000) });
});

async function transcreverAudio(buf, nome, tipo) {
  for (const prov of ['openai', 'groq']) {
    const cred = await IA.credencial(prov);
    if (!cred?.chave) continue;
    const base = prov === 'openai' ? 'https://api.openai.com/v1' : 'https://api.groq.com/openai/v1';
    const fd = new FormData();
    fd.append('file', new Blob([buf], { type: tipo }), nome);
    fd.append('model', prov === 'openai' ? 'whisper-1' : 'whisper-large-v3');
    fd.append('language', 'pt');
    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 300000);
    try {
      const resp = await fetch(`${base}/audio/transcriptions`, { method: 'POST', headers: { authorization: `Bearer ${cred.chave}` }, body: fd, signal: ctl.signal });
      const j = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(j?.error?.message || `HTTP ${resp.status}`);
      return j.text;
    } finally { clearTimeout(t); }
  }
  throw new Error('Para transcrever áudio, cadastre a chave da OpenAI ou da Groq em Assistente Milla → Configurar → Provedor. Outra opção: envie a transcrição do Google Meet (.txt, .docx ou .vtt).');
}

// ---------------- gerar a ata com IA ----------------
async function provedorAta() {
  const { rows } = await pool.query(`SELECT provedor, modelo FROM ia_agentes WHERE provedor IS NOT NULL AND modelo IS NOT NULL
                                      ORDER BY CASE codigo WHEN 'geral' THEN 0 WHEN 'comercial' THEN 1 ELSE 2 END LIMIT 1`);
  return rows[0] || null;
}
async function chamarIA(prov, modelo, sistema, usuario) {
  const p = IA.PROVEDORES[prov]; const cred = await IA.credencial(prov);
  if (!p) throw new Error('Provedor de IA não configurado.');
  if (!cred?.chave && !p.chaveOpcional) throw new Error(`Cadastre a chave do provedor ${p.nome} em Assistente Milla → Configurar.`);
  const base = String(cred?.base_url || p.base).replace(/\/+$/, '');
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 300000);
  const pedir = async (url, headers, corpo) => {
    const resp = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(corpo), signal: ctl.signal });
    const j = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error(j?.error?.message || j?.message || `HTTP ${resp.status}`);
    return j;
  };
  try {
    if (p.tipo === 'anthropic') {
      const j = await pedir(`${base}/messages`, { 'x-api-key': cred.chave, 'anthropic-version': '2023-06-01' }, { model: modelo, max_tokens: 8000, temperature: 0.2, system: sistema, messages: [{ role: 'user', content: usuario }] });
      return (j.content || []).filter(c => c.type === 'text').map(c => c.text).join('\n');
    }
    if (p.tipo === 'gemini') {
      const j = await pedir(`${base}/models/${encodeURIComponent(modelo)}:generateContent`, { 'x-goog-api-key': cred.chave },
        { systemInstruction: { parts: [{ text: sistema }] }, contents: [{ role: 'user', parts: [{ text: usuario }] }], generationConfig: { temperature: 0.2, maxOutputTokens: 8000, responseMimeType: 'application/json' } });
      return (j.candidates?.[0]?.content?.parts || []).map(x => x.text || '').join('\n');
    }
    const corpo = { model: modelo, messages: [{ role: 'system', content: sistema }, { role: 'user', content: usuario }] };
    if (prov === 'openai' && /^(gpt-5|o\d)/.test(modelo)) corpo.max_completion_tokens = 16000; else { corpo.max_tokens = 8000; corpo.temperature = 0.2; }
    const j = await pedir(`${base}/chat/completions`, cred?.chave ? { authorization: `Bearer ${cred.chave}` } : {}, corpo);
    return String(j.choices?.[0]?.message?.content || '');
  } catch (e) {
    if (e.name === 'AbortError') throw new Error('A IA demorou demais para responder. Tente novamente.');
    throw e;
  } finally { clearTimeout(t); }
}
const SISTEMA_ATA = `Você é o secretário executivo do Comitê Integrado de Execução Comercial do Grupo Milla e redige atas no padrão da consultoria SCA Solutions.
Regras de redação:
- Português do Brasil, tom executivo e cordial, objetivo e factual. Sem adjetivos duros e sem crítica pessoal.
- A consultoria não decide: registre "diretrizes", "posicionamentos" e "encaminhamentos"; a decisão cabe à direção do Grupo Milla. Nunca use a expressão "decisões tomadas".
- Não invente números, nomes ou prazos que não estejam na transcrição. Se algo estiver incerto, escreva "[confirmar]".
- Toda ação precisa de responsável e prazo; se a transcrição não disser, use "a definir".
Responda SOMENTE com um JSON válido (sem markdown), neste formato:
{
 "cabecalho": { "subtitulo": "tema(s) da reunião em uma linha", "conducao": "", "registro": "", "participantes": "nomes separados por vírgula", "ausencias": "", "local": "", "duracao": "" },
 "documentos": "documentos e materiais apresentados, e observações de agenda",
 "resumo": [ { "tema": "Título curto do bloco", "texto": "parágrafo(s) com o que foi apresentado, discutido e os encaminhamentos do bloco" } ],
 "diretrizes": [ "Frase curta em negrito: explicação." ],
 "revisao_pendencias": [ { "numero": 1, "acao": "", "status": "Concluída | Em andamento | Atrasada | Reagendada — comentário" } ],
 "acoes": [ { "acao": "verbo no infinitivo + o quê", "objetivo": "", "responsavel": "", "area": "id da área da lista ou vazio", "prazo_texto": "como foi dito (ex.: próxima reunião, esta semana, 11/08)", "prazo_data": "AAAA-MM-DD ou vazio", "status": "Aberta | Em andamento | Concluída | Agendada" } ],
 "observacoes": "regra de ouro e observações finais"
}`;
function extrairJSON(t) {
  const s = String(t || '').replace(/^```(json)?/im, '').replace(/```\s*$/m, '');
  const i = s.indexOf('{'), f = s.lastIndexOf('}');
  if (i < 0 || f < i) throw new Error('A IA não devolveu a ata no formato esperado. Tente novamente.');
  return JSON.parse(s.slice(i, f + 1));
}
r.post('/reunioes/:id/gerar-ata', pode('comite', 2), async (req, res) => {
  const d = await carregar(req.params.id);
  if (!d) return res.status(404).json({ erro: 'Reunião não encontrada.' });
  const r0 = d.reuniao;
  if (!r0.transcricao || r0.transcricao.length < 200) return res.status(400).json({ erro: 'Inclua a transcrição da reunião (texto, arquivo ou áudio) antes de gerar a ata.' });
  const pv = await provedorAta();
  if (!pv) return res.status(400).json({ erro: 'Nenhum provedor de IA configurado. Em Assistente Milla → Gerenciar agentes, defina o provedor e o modelo do Assistente geral.' });
  const { rows: areas } = await pool.query('SELECT id, nome, resp FROM areas WHERE ativo ORDER BY ordem');
  const dataBR = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' }).format(r0.data);
  const usuario = `Reunião: ${r0.titulo} — ${dataBR}${r0.local ? ' — ' + r0.local : ''}
Condução: ${r0.conducao || r0.presidente || '[confirmar]'} · Registro: ${r0.registro || '[confirmar]'}
Participantes informados: ${r0.participantes || '[ver transcrição]'}
Pauta prevista: ${(r0.pauta || []).map(p => p.item).join('; ') || '—'}
Áreas (use o id em "area"): ${areas.map(a => `${a.id} = ${a.nome}${a.resp ? ' (' + a.resp + ')' : ''}`).join('; ')}
Pendências de reuniões anteriores em aberto (para a revisão): ${d.anteriores.filter(x => x.situacao !== 'Concluída').map((x, i) => `${i + 1}. ${x.acao} — ${x.responsavel || x.area_nome || 'sem responsável'} — ${x.situacao}`).join(' | ') || 'nenhuma'}

TRANSCRIÇÃO:
${r0.transcricao.slice(0, 180000)}`;
  let j;
  try { j = extrairJSON(await chamarIA(pv.provedor, pv.modelo, SISTEMA_ATA, usuario)); }
  catch (e) { return res.status(502).json({ erro: `Não foi possível gerar a ata: ${e.message}` }); }
  const ata = limparAta(j);
  const cab = j.cabecalho || {};
  const autor = await quem(req);
  await pool.query(
    `UPDATE comite_reunioes SET ata_json = $2, ata_gerada_em = now(), ata_gerada_por = $3, status = CASE WHEN status = 'Agendada' THEN 'Realizada' ELSE status END,
            subtitulo = COALESCE(NULLIF(subtitulo, ''), $4), conducao = COALESCE(NULLIF(conducao, ''), $5), registro = COALESCE(NULLIF(registro, ''), $6),
            participantes = COALESCE(NULLIF(participantes, ''), $7), ausencias = COALESCE(NULLIF(ausencias, ''), $8), local = COALESCE(NULLIF(local, ''), $9),
            atualizado_em = now(), atualizado_por = $3 WHERE id = $1`,
    [r0.id, JSON.stringify({ ...ata, revisao_ia: Array.isArray(j.revisao_pendencias) ? j.revisao_pendencias.slice(0, 40) : [] }), autor,
     txt(cab.subtitulo, 300) || null, txt(cab.conducao, 120) || null, txt(cab.registro, 120) || null, txt(cab.participantes, 1500) || null, txt(cab.ausencias, 800) || null,
     txt([cab.local, cab.duracao].filter(Boolean).join(' · '), 120) || null]);
  // Ações da ata viram o plano de ação da reunião (itens ainda não encaminhados são substituídos).
  const ids = new Set(areas.map(a => a.id));
  await pool.query('DELETE FROM comite_itens WHERE reuniao_id = $1 AND acao_id IS NULL', [r0.id]);
  let n = (await pool.query('SELECT COALESCE(MAX(ordem),0) AS m FROM comite_itens WHERE reuniao_id = $1', [r0.id])).rows[0].m;
  for (const a of (Array.isArray(j.acoes) ? j.acoes : []).slice(0, 60)) {
    if (!txt(a.acao)) continue;
    const st = STATUS_ITEM.includes(a.status) ? a.status : 'Aberta';
    await pool.query(`INSERT INTO comite_itens (reuniao_id, ordem, acao, objetivo, area_id, responsavel, prazo, prazo_texto, status, concluido_em)
                      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9, CASE WHEN $9 = 'Concluída' THEN now() END)`,
      [r0.id, ++n, txt(a.acao, 400), txt(a.objetivo, 400) || null, ids.has(a.area) ? a.area : null, txt(a.responsavel, 160) || null,
       dataOuNull(a.prazo_data), txt(a.prazo_texto, 60) || null, st]);
  }
  res.json({ ok: true, ...(await carregar(r0.id)) });
});

// ---------------- plano de ação (itens) ----------------
r.post('/reunioes/:id/itens', pode('comite', 2), async (req, res) => {
  const b = req.body || {};
  if (!txt(b.acao)) return res.status(400).json({ erro: 'Descreva a ação.' });
  const { rows: [{ m }] } = await pool.query('SELECT COALESCE(MAX(ordem),0) AS m FROM comite_itens WHERE reuniao_id = $1', [req.params.id]);
  const { rows: [i] } = await pool.query(
    `INSERT INTO comite_itens (reuniao_id, ordem, acao, objetivo, area_id, responsavel, responsavel_id, inicio, prazo, prazo_texto)
     VALUES ($1,$2,$3,$4,(SELECT id FROM areas WHERE id = $5),$6,$7,$8,$9,$10) RETURNING id`,
    [req.params.id, m + 1, txt(b.acao, 400), txt(b.objetivo, 400) || null, b.area_id || null, txt(b.responsavel, 160) || null, Number(b.responsavel_id) || null,
     dataOuNull(b.inicio), dataOuNull(b.prazo), txt(b.prazo_texto, 60) || null]);
  res.status(201).json({ id: i.id });
});
async function item(id) { return (await pool.query('SELECT * FROM comite_itens WHERE id = $1', [id])).rows[0]; }
r.put('/itens/:id', pode('comite', 2), async (req, res) => {
  const i = await item(req.params.id); if (!i) return res.status(404).json({ erro: 'Item não encontrado.' });
  const b = req.body || {};
  await pool.query(`UPDATE comite_itens SET acao=$2, objetivo=$3, area_id=(SELECT id FROM areas WHERE id = $4), responsavel=$5, responsavel_id=$6, inicio=$7, prazo=$8, prazo_texto=$9 WHERE id=$1`,
    [i.id, txt(b.acao, 400) || i.acao, txt(b.objetivo, 400) || null, b.area_id || null, txt(b.responsavel, 160) || null, Number(b.responsavel_id) || null,
     dataOuNull(b.inicio), dataOuNull(b.prazo), txt(b.prazo_texto, 60) || null]);
  // Se já foi encaminhado, mantém a ação da área alinhada.
  if (i.acao_id) await pool.query('UPDATE acoes SET titulo=$2, responsavel=COALESCE($3, responsavel), responsavel_id=COALESCE($4, responsavel_id), prazo=COALESCE($5, prazo) WHERE id=$1',
    [i.acao_id, txt(b.acao, 200) || i.acao, txt(b.responsavel, 120) || null, Number(b.responsavel_id) || null, dataOuNull(b.prazo)]);
  res.json({ ok: true });
});
r.patch('/itens/:id/status', pode('comite', 1), async (req, res) => {
  const i = await item(req.params.id); if (!i) return res.status(404).json({ erro: 'Item não encontrado.' });
  const st = req.body?.status;
  if (!STATUS_ITEM.includes(st)) return res.status(400).json({ erro: 'Status inválido.' });
  await pool.query(`UPDATE comite_itens SET status=$2, concluido_em = CASE WHEN $2 = 'Concluída' THEN COALESCE(concluido_em, now()) ELSE NULL END WHERE id=$1`, [i.id, st]);
  if (i.acao_id) {
    const s = st === 'Concluída' ? 'Concluído' : st === 'Em andamento' ? 'Em andamento' : 'A fazer';
    await pool.query(`UPDATE acoes SET status=$2, concluido_em = CASE WHEN $2 = 'Concluído' THEN COALESCE(concluido_em, now()) ELSE NULL END WHERE id=$1`, [i.acao_id, s]);
  }
  res.json({ ok: true });
});
r.delete('/itens/:id', pode('comite', 2), async (req, res) => {
  const i = await item(req.params.id); if (!i) return res.status(404).json({ erro: 'Item não encontrado.' });
  if (i.acao_id) return res.status(400).json({ erro: 'Este item já foi encaminhado à área. Altere o status para Cancelada em vez de excluir.' });
  await pool.query('DELETE FROM comite_itens WHERE id = $1', [i.id]);
  res.json({ ok: true });
});
// Encaminhar à área: cria a ação no Kanban da área, com responsável e período de execução.
r.post('/itens/:id/encaminhar', pode('comite', 2), async (req, res) => {
  const i = await item(req.params.id); if (!i) return res.status(404).json({ erro: 'Item não encontrado.' });
  if (i.acao_id) return res.status(400).json({ erro: 'Este item já foi encaminhado.' });
  const b = req.body || {};
  const { rows: [area] } = await pool.query('SELECT id, nome FROM areas WHERE id = $1 AND ativo', [b.area_id || i.area_id]);
  if (!area) return res.status(400).json({ erro: 'Escolha a área que vai executar.' });
  const inicio = dataOuNull(b.inicio) || new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
  const prazo = dataOuNull(b.prazo) || i.prazo;
  if (!prazo) return res.status(400).json({ erro: 'Informe a data de término (prazo) da execução.' });
  if (prazo < inicio) return res.status(400).json({ erro: 'O término não pode ser antes do início.' });
  let resp = txt(b.responsavel, 120) || i.responsavel, respId = Number(b.responsavel_id) || null;
  if (respId) resp = (await pool.query('SELECT nome FROM usuarios WHERE id = $1', [respId])).rows[0]?.nome || resp;
  const { rows: [rr] } = await pool.query('SELECT titulo, data FROM comite_reunioes WHERE id = $1', [i.reuniao_id]);
  const quando = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short' }).format(rr.data);
  const { rows: [ac] } = await pool.query(
    `INSERT INTO acoes (area_id, titulo, descricao, status, prioridade, responsavel, responsavel_id, inicio, prazo, origem, criado_por)
     VALUES ($1,$2,$3,'A fazer',$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
    [area.id, i.acao.slice(0, 200), [i.objetivo ? `Objetivo: ${i.objetivo}` : '', `Encaminhado pelo ${rr.titulo} de ${quando}.`].filter(Boolean).join('\n'),
     ['Alta', 'Média', 'Baixa'].includes(b.prioridade) ? b.prioridade : 'Alta', resp || null, respId, inicio, prazo, `Comitê · ${quando}`, req.usuario.sub]);
  await pool.query(`UPDATE comite_itens SET acao_id=$2, area_id=$3, responsavel=$4, responsavel_id=$5, inicio=$6, prazo=$7, encaminhado_em=now(),
                    status = CASE WHEN status IN ('Concluída','Cancelada') THEN status ELSE 'Aberta' END WHERE id=$1`,
    [i.id, ac.id, area.id, resp || null, respId, inicio, prazo]);
  res.json({ ok: true, acao_id: ac.id, area: area.nome });
});

module.exports = r;
