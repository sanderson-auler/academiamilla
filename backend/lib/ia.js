// Motor dos agentes de IA: catálogo de provedores, chamada aos modelos, leitura de arquivos,
// indexação em trechos, busca na base de conhecimento e montagem do prompt.
const { pool } = require('../db');

// ---------------- Provedores ----------------
// tipo: openai (API compatível com OpenAI) · anthropic · gemini
const PROVEDORES = {
  openai:     { nome: 'OpenAI (ChatGPT)', tipo: 'openai', base: 'https://api.openai.com/v1', site: 'platform.openai.com', modelos: ['gpt-5.1', 'gpt-5', 'gpt-5-mini', 'gpt-4.1', 'gpt-4.1-mini', 'gpt-4o-mini'] },
  anthropic:  { nome: 'Anthropic (Claude)', tipo: 'anthropic', base: 'https://api.anthropic.com/v1', site: 'console.anthropic.com', modelos: ['claude-sonnet-5-5', 'claude-opus-5-5', 'claude-haiku-5-5', 'claude-sonnet-4-5'] },
  gemini:     { nome: 'Google (Gemini)', tipo: 'gemini', base: 'https://generativelanguage.googleapis.com/v1beta', site: 'aistudio.google.com', modelos: ['gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-2.5-flash-lite'] },
  maritaca:   { nome: 'Maritaca AI (Sabiá · Brasil)', tipo: 'openai', base: 'https://chat.maritaca.ai/api', site: 'plataforma.maritaca.ai', modelos: ['sabia-3.1', 'sabiazinho-3'] },
  deepseek:   { nome: 'DeepSeek', tipo: 'openai', base: 'https://api.deepseek.com/v1', site: 'platform.deepseek.com', modelos: ['deepseek-chat', 'deepseek-reasoner'] },
  mistral:    { nome: 'Mistral AI', tipo: 'openai', base: 'https://api.mistral.ai/v1', site: 'console.mistral.ai', modelos: ['mistral-large-latest', 'mistral-medium-latest', 'mistral-small-latest'] },
  xai:        { nome: 'xAI (Grok)', tipo: 'openai', base: 'https://api.x.ai/v1', site: 'console.x.ai', modelos: ['grok-4', 'grok-3-mini'] },
  groq:       { nome: 'Groq (Llama e outros, alta velocidade)', tipo: 'openai', base: 'https://api.groq.com/openai/v1', site: 'console.groq.com', modelos: ['llama-3.3-70b-versatile', 'openai/gpt-oss-120b'] },
  openrouter: { nome: 'OpenRouter (vários modelos, uma chave)', tipo: 'openai', base: 'https://openrouter.ai/api/v1', site: 'openrouter.ai', modelos: ['anthropic/claude-sonnet-4.5', 'openai/gpt-4.1-mini', 'google/gemini-2.5-flash'] },
  compativel: { nome: 'Compatível com OpenAI (Ollama, LM Studio, Azure via gateway…)', tipo: 'openai', base: '', site: '', modelos: [], exigeUrl: true, chaveOpcional: true },
};

const segredo = () => process.env.SESSION_SECRET;

async function credencial(codigo) {
  const { rows } = await pool.query(
    `SELECT CASE WHEN chave_cifrada IS NULL THEN NULL ELSE pgp_sym_decrypt(chave_cifrada, $2) END AS chave, base_url
       FROM ia_provedores WHERE codigo = $1`, [codigo, segredo()]);
  return rows[0] || null;
}

async function http(url, opts, ms = 90000) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch(url, { ...opts, signal: ctl.signal });
    const txt = await r.text();
    let json = null; try { json = JSON.parse(txt); } catch {}
    if (!r.ok) {
      const msg = json?.error?.message || json?.error?.type || json?.message || txt.slice(0, 200) || `HTTP ${r.status}`;
      const e = new Error(`${r.status} — ${msg}`); e.status = r.status; throw e;
    }
    return json;
  } catch (e) {
    if (e.name === 'AbortError') throw new Error('O provedor demorou demais para responder (tempo esgotado).');
    if (e.status) throw e;
    throw new Error(`Não foi possível conectar ao provedor: ${e.cause?.code || e.message}`);
  } finally { clearTimeout(t); }
}

function baseDe(prov, cred) {
  const p = PROVEDORES[prov];
  return String((p.exigeUrl || prov === 'openrouter' ? cred?.base_url : '') || cred?.base_url || p.base).replace(/\/+$/, '');
}

// Chama o modelo. mensagens: [{ papel: 'user'|'assistant', conteudo }]
async function gerar({ provedor, modelo, sistema, mensagens, temperatura = 0.4, maxTokens = 1200 }) {
  const p = PROVEDORES[provedor];
  if (!p) throw new Error('Provedor de IA não configurado.');
  const cred = await credencial(provedor);
  if (!cred?.chave && !p.chaveOpcional) throw new Error(`A chave de API do provedor ${p.nome} ainda não foi cadastrada.`);
  if (p.exigeUrl && !cred?.base_url) throw new Error('Informe o endereço (URL base) do provedor compatível.');
  const base = baseDe(provedor, cred);
  const t0 = Date.now();
  if (p.tipo === 'anthropic') {
    const j = await http(`${base}/messages`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': cred.chave, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: modelo, max_tokens: maxTokens, temperature: Number(temperatura), system: sistema,
        messages: mensagens.map(m => ({ role: m.papel, content: m.conteudo })) }),
    });
    return { texto: (j.content || []).filter(c => c.type === 'text').map(c => c.text).join('\n').trim(),
      entrada: j.usage?.input_tokens, saida: j.usage?.output_tokens, ms: Date.now() - t0 };
  }
  if (p.tipo === 'gemini') {
    const j = await http(`${base}/models/${encodeURIComponent(modelo)}:generateContent`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': cred.chave },
      body: JSON.stringify({ systemInstruction: { parts: [{ text: sistema }] },
        contents: mensagens.map(m => ({ role: m.papel === 'assistant' ? 'model' : 'user', parts: [{ text: m.conteudo }] })),
        generationConfig: { temperature: Number(temperatura), maxOutputTokens: maxTokens } }),
    });
    const partes = j.candidates?.[0]?.content?.parts || [];
    return { texto: partes.map(x => x.text || '').join('\n').trim(), entrada: j.usageMetadata?.promptTokenCount, saida: j.usageMetadata?.candidatesTokenCount, ms: Date.now() - t0 };
  }
  // API compatível com OpenAI
  const raciocinio = provedor === 'openai' && /^(gpt-5|o\d)/.test(modelo);
  const corpo = { model: modelo, messages: [{ role: 'system', content: sistema }, ...mensagens.map(m => ({ role: m.papel, content: m.conteudo }))] };
  if (raciocinio) corpo.max_completion_tokens = Math.max(maxTokens, 2000);
  else { corpo.max_tokens = maxTokens; corpo.temperature = Number(temperatura); }
  const headers = { 'content-type': 'application/json' };
  if (cred?.chave) headers.authorization = `Bearer ${cred.chave}`;
  if (provedor === 'openrouter') { headers['HTTP-Referer'] = process.env.APP_URL || 'https://app.academiamilla.tech'; headers['X-Title'] = 'Academia Milla 360'; }
  const j = await http(`${base}/chat/completions`, { method: 'POST', headers, body: JSON.stringify(corpo) });
  return { texto: String(j.choices?.[0]?.message?.content || '').trim(), entrada: j.usage?.prompt_tokens, saida: j.usage?.completion_tokens, ms: Date.now() - t0 };
}

// Lista os modelos disponíveis na conta (ao vivo).
async function listarModelos(provedor) {
  const p = PROVEDORES[provedor];
  if (!p) throw new Error('Provedor inválido.');
  const cred = await credencial(provedor);
  if (!cred?.chave && !p.chaveOpcional) throw new Error('Cadastre a chave de API do provedor para listar os modelos.');
  const base = baseDe(provedor, cred);
  if (p.tipo === 'anthropic') {
    const j = await http(`${base}/models?limit=100`, { headers: { 'x-api-key': cred.chave, 'anthropic-version': '2023-06-01' } }, 20000);
    return (j.data || []).map(m => m.id);
  }
  if (p.tipo === 'gemini') {
    const j = await http(`${base}/models?pageSize=200`, { headers: { 'x-goog-api-key': cred.chave } }, 20000);
    return (j.models || []).filter(m => (m.supportedGenerationMethods || []).includes('generateContent')).map(m => m.name.replace(/^models\//, ''));
  }
  const headers = cred?.chave ? { authorization: `Bearer ${cred.chave}` } : {};
  const j = await http(`${base}/models`, { headers }, 20000);
  return (j.data || j.models || []).map(m => m.id || m.name).filter(Boolean).sort();
}

// ---------------- Leitura de arquivos ----------------
const TIPOS = { pdf: 'PDF', docx: 'Word', xlsx: 'Excel', pptx: 'PowerPoint', txt: 'Texto', md: 'Markdown', csv: 'CSV', json: 'JSON', html: 'HTML', htm: 'HTML' };
const ent = s => s.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");

async function extrairTexto(nome, buffer) {
  const ext = String(nome).toLowerCase().split('.').pop();
  if (!TIPOS[ext]) throw new Error('Formato não suportado. Envie PDF, Word (.docx), Excel (.xlsx), PowerPoint (.pptx), TXT, MD, CSV, JSON ou HTML.');
  if (ext === 'pdf') {
    const pdf = require('pdf-parse/lib/pdf-parse.js');
    const r = await pdf(buffer);
    return { ext, texto: r.text };
  }
  if (ext === 'docx') {
    const r = await require('mammoth').extractRawText({ buffer });
    return { ext, texto: r.value };
  }
  if (ext === 'xlsx') {
    const ExcelJS = require('exceljs');
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer);
    const partes = [];
    wb.eachSheet(ws => {
      partes.push(`## Planilha: ${ws.name}`);
      ws.eachRow({ includeEmpty: false }, row => {
        const cel = (row.values || []).slice(1).map(v => {
          if (v == null) return '';
          if (typeof v === 'object') return v.text ?? v.result ?? (v.richText ? v.richText.map(x => x.text).join('') : v instanceof Date ? v.toISOString().slice(0, 10) : '');
          return String(v);
        });
        if (cel.some(c => String(c).trim())) partes.push(cel.join(' | '));
      });
    });
    return { ext, texto: partes.join('\n') };
  }
  if (ext === 'pptx') {
    const zip = await require('jszip').loadAsync(buffer);
    const slides = Object.keys(zip.files).filter(f => /^ppt\/slides\/slide\d+\.xml$/.test(f))
      .sort((a, b) => Number(a.match(/(\d+)\.xml/)[1]) - Number(b.match(/(\d+)\.xml/)[1]));
    const partes = [];
    for (const [i, f] of slides.entries()) {
      const xml = await zip.files[f].async('string');
      const t = [...xml.matchAll(/<a:t>([^<]*)<\/a:t>/g)].map(m => ent(m[1])).join(' ');
      if (t.trim()) partes.push(`## Slide ${i + 1}\n${t}`);
    }
    return { ext, texto: partes.join('\n\n') };
  }
  let t = buffer.toString('utf8');
  if (ext === 'html' || ext === 'htm') {
    t = ent(t.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<(br|\/p|\/div|\/li|\/h\d|\/tr)[^>]*>/gi, '\n').replace(/<[^>]+>/g, ' '));
  }
  return { ext, texto: t };
}

// ---------------- Indexação e busca ----------------
const normalizar = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const limpar = s => String(s || '').replace(/\r/g, '').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();

// Divide em trechos de ~1.200 caracteres, respeitando seções e parágrafos.
function fatiar(texto, titulo, tam = 1200) {
  const t = limpar(texto);
  if (!t) return [];
  const secoes = t.split(/\n(?=#{1,3} )/);
  const out = [];
  for (const sec of secoes) {
    const cab = (sec.match(/^#{1,3} (.+)/) || [])[1] || '';
    const pars = sec.split(/\n\n+/);
    let atual = '';
    const fechar = () => { if (atual.trim()) out.push(atual.trim()); atual = ''; };
    for (let p of pars) {
      while (p.length > tam) { // parágrafo muito longo: corta em frases
        const corte = p.lastIndexOf('. ', tam) > tam / 2 ? p.lastIndexOf('. ', tam) + 1 : tam;
        if (atual) fechar();
        out.push((cab && !p.startsWith('#') ? `${cab}\n` : '') + p.slice(0, corte).trim());
        p = p.slice(corte);
      }
      if ((atual + '\n\n' + p).length > tam) { fechar(); atual = cab && !p.startsWith('#') ? `${cab}\n${p}` : p; }
      else atual = atual ? `${atual}\n\n${p}` : p;
    }
    fechar();
  }
  return out.map(x => `[${titulo}]\n${x}`);
}

async function indexar(cliente, doc) {
  await cliente.query('DELETE FROM ia_trechos WHERE documento_id = $1', [doc.id]);
  const partes = fatiar(doc.texto, doc.titulo);
  for (const [i, p] of partes.entries()) {
    await cliente.query('INSERT INTO ia_trechos (documento_id, agente_id, ordem, texto, busca) VALUES ($1,$2,$3,$4,$5)',
      [doc.id, doc.agente_id, i, p, normalizar(p)]);
  }
  await cliente.query('UPDATE ia_documentos SET trechos = $2 WHERE id = $1', [doc.id, partes.length]);
  return partes.length;
}

const PARADAS = new Set('a o e de da do das dos em no na nos nas um uma uns umas para pra por com como qual quais que quem onde quando e o os as ao aos se sobre minha meu meus minhas sua seu voce voces eu nos ele ela isso isto esse essa este esta tem ter ser sao foi fazer faco faz pode posso devo deve mais menos muito tambem ja nao sim ou entre ate apos antes depois cada todo toda todos todas'.split(' '));
function termos(pergunta) {
  return [...new Set(normalizar(pergunta).split(/[^a-z0-9]+/).filter(p => p.length > 2 && !PARADAS.has(p)))].slice(0, 12);
}

async function buscar(agente, pergunta, limite = 8) {
  const ws = termos(pergunta);
  if (!ws.length) return { trechos: [], aprendizados: [] };
  const q = ws.map(w => `${w}:*`).join(' | ');
  const escopo = agente.codigo === 'geral' ? 'TRUE' : 't.agente_id = $2';
  const params = [q]; if (agente.codigo !== 'geral') params.push(agente.id);
  const { rows: trechos } = await pool.query(
    `SELECT t.id, t.texto, d.titulo, d.origem, ts_rank(t.tsv, to_tsquery('portuguese', $1)) AS nota
       FROM ia_trechos t JOIN ia_documentos d ON d.id = t.documento_id
      WHERE ${escopo} AND d.ativo AND t.tsv @@ to_tsquery('portuguese', $1)
      ORDER BY nota DESC LIMIT ${Number(limite)}`, params);
  const { rows: aprendizados } = await pool.query(
    `SELECT id, tipo, pergunta, conteudo, ts_rank(tsv, to_tsquery('portuguese', $1)) AS nota
       FROM ia_aprendizados WHERE agente_id = $2 AND status = 'aprovado' AND tipo <> 'lacuna' AND tsv @@ to_tsquery('portuguese', $1)
      ORDER BY nota DESC LIMIT 5`, [q, agente.id]);
  return { trechos, aprendizados };
}

// ---------------- Guia da área → texto indexável ----------------
function linhasArvore(nos, blocos, nivel = 0) {
  const out = [];
  for (const n of nos || []) {
    if (n.ptr) { out.push(`${'  '.repeat(nivel)}- ${n.t} (checklist completo na aba Checklists)`); continue; }
    out.push(`${'  '.repeat(nivel)}- ${n.t}${n.ref ? ` (ver pacote de trabalho "${n.t}")` : ''}`);
    if (n.c) out.push(...linhasArvore(n.c, blocos, nivel + 1));
  }
  return out;
}
async function textoGuia(areaId) {
  const { rows: [a] } = await pool.query('SELECT * FROM areas WHERE id = $1', [areaId]);
  if (!a) return '';
  const c = a.conteudo || {};
  const [ind, chk, cur, met] = await Promise.all([
    pool.query('SELECT nome, valor, variacao FROM indicadores WHERE area_id = $1 ORDER BY ordem', [areaId]),
    pool.query('SELECT nome, itens, estrutura FROM checklist_modelos WHERE area_id = $1 AND ativo ORDER BY ordem', [areaId]),
    pool.query('SELECT titulo, aulas, duracao FROM cursos WHERE area_id = $1 ORDER BY ordem', [areaId]),
    pool.query(`SELECT marca, periodo, indicador, unidade, meta, realizado FROM metas WHERE area_id = $1 ORDER BY periodo DESC, marca LIMIT 12`, [areaId]),
  ]);
  const L = [`# Guia da área ${a.nome}`, `Responsável: ${a.resp || '—'} (${a.cargo || '—'}).`, `Papel da área: ${a.papel || ''}`, a.tag ? `Foco: ${a.tag}` : ''];
  if (c.pilares) L.push('', '## Pilares da área', ...c.pilares.map(p => `- ${p[0]}: ${p[1]}`));
  if (c.rotina) {
    L.push('', '## Rotina da área');
    if (c.rotina.diaria) L.push('### Rotina diária', ...c.rotina.diaria.map(x => `- ${x}`));
    if (c.rotina.semanal) L.push('### Rotina semanal', ...c.rotina.semanal.map(x => `- ${x}`));
    if (c.rotina.mensal) L.push('### Programação mensal', ...c.rotina.mensal.map(x => `- ${x}`));
  }
  if (c.rotina_loja) L.push('', '## Rotina diária na loja (da abertura ao fechamento)', ...c.rotina_loja.flatMap(r => [`### ${r[0]} — ${r[1]}`, ...r[2].map(x => `- ${x}`)]));
  if (c.programacao) {
    for (const w of c.programacao.semanas) {
      L.push('', `## Programação mensal — ${w.n}: ${w.foco}`, `Objetivo da semana: ${w.obj || ''}`);
      for (const d of w.dias) { if (!(d.tasks || []).length) continue; L.push(`### ${w.n} · ${d.d}`, ...linhasArvore(d.tasks, c.programacao.blocos)); }
    }
    for (const [k, nos] of Object.entries(c.programacao.blocos || {})) {
      L.push('', `## Pacote de trabalho: ${c.programacao.nomes_ref?.[k] || k}`, ...linhasArvore(nos, c.programacao.blocos));
    }
  }
  if (c.conversa) L.push('', '## Como conduzir a conversa com o gerente', 'Ouça mais do que fale — e encerre com dono e prazo.', ...c.conversa.flatMap(b => [`### ${b[0]}`, ...b[2].map(q => `- ${q}`)]));
  for (const m of chk.rows) {
    if (m.estrutura) {
      const e = m.estrutura;
      L.push('', `## Checklist: ${m.nome}`, e.escala === 'comparativa'
        ? 'Escala: o concorrente está Acima, Igual ou Abaixo da Milla em cada ponto. Pontos com o concorrente acima viram oportunidade no plano de ação.'
        : 'Escala: OK = 100, Atenção = 50, Não = 0. Referência do Grupo ≥ 85%. Classificação: Destaque ≥ 85% · Estável 70–84% · Atenção 50–69% · Prioridade alta < 50%. Prazos sugeridos: Não em bloco de peso 3 → 48 horas; demais Não → 7 dias; Atenção → 15 dias.');
      for (const b of e.blocos) L.push(`### ${m.nome} — bloco ${b.nome}${e.escala === 'comparativa' ? '' : ` (peso ${b.peso}, área ${b.area})`}`, ...b.itens.map(x => `- ${x}`), e.escala === 'comparativa' ? '' : `Ação sugerida quando fora do padrão: ${b.acao}`);
    } else L.push('', `## Checklist: ${m.nome}`, ...m.itens.map(x => `- ${x}`));
  }
  if (c.fases) L.push('', '## Régua de campanha (atividades antes de cada data do calendário)', ...c.fases.flatMap(f => [`### ${f[0]} — responsável: ${f[1]}`, ...f[2].map(x => `- ${x}`)]));
  if (ind.rows.length) L.push('', '## Indicadores da área (último registro)', ...ind.rows.map(k => `- ${k.nome}: ${k.valor} (${k.variacao || 's/ variação'})`));
  if (met.rows.length) L.push('', '## Metas cadastradas', ...met.rows.map(m => `- ${m.periodo} · ${m.marca} · ${m.indicador}: meta ${m.meta} ${m.unidade}, realizado ${m.realizado}`));
  if (c.meta_padrao) L.push(`Meta padrão da área: ${c.meta_padrao.tipo} (${c.meta_padrao.un}), peso ${c.meta_padrao.peso}.`);
  if (cur.rows.length) L.push('', '## Treinamentos da área (Universidade)', ...cur.rows.map(x => `- ${x.titulo} — ${x.aulas} aulas${x.duracao ? ' · ' + x.duracao : ''}`));
  if (c.videos) L.push(...c.videos.map(v => `- Vídeo: ${v[0]} (${v[1]})`));
  return L.filter(x => x !== '').join('\n');
}

// Garante (ou refaz) o documento "Guia da área" do agente.
async function sincronizarGuia(agente, forcar = false) {
  if (!agente.area_id) return null;
  const { rows: [d] } = await pool.query(`SELECT id FROM ia_documentos WHERE agente_id = $1 AND origem = 'guia'`, [agente.id]);
  if (d && !forcar) return d.id;
  const texto = await textoGuia(agente.area_id);
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    let id = d?.id;
    if (id) await c.query('UPDATE ia_documentos SET texto = $2, tamanho = $3, criado_em = now() WHERE id = $1', [id, texto, texto.length]);
    else ({ rows: [{ id }] } = await c.query(
      `INSERT INTO ia_documentos (agente_id, titulo, origem, tipo, tamanho, texto, enviado_por) VALUES ($1,$2,'guia','guia',$3,$4,'Plataforma') RETURNING id`,
      [agente.id, 'Guia da área (cadastrado na plataforma)', texto.length, texto]));
    await indexar(c, { id, agente_id: agente.id, titulo: 'Guia da área', texto });
    await c.query('COMMIT');
    return id;
  } catch (e) { await c.query('ROLLBACK'); throw e; } finally { c.release(); }
}

// ---------------- Prompt ----------------
const TONS = {
  amigavel: 'Amigável: comunicação leve, próxima e acolhedora.',
  profissional: 'Profissional: comunicação clara, educada e objetiva.',
  empatica: 'Empática: foco em compreender e acolher a pessoa antes de orientar.',
  consultiva: 'Consultiva: orienta, sugere caminhos e ajuda a pessoa a decidir, como um consultor de varejo experiente.',
  objetiva: 'Objetiva: vai direto ao ponto, com respostas curtas e práticas.',
};
const TRACOS = { acolhedora: 'Acolhedora', objetiva: 'Objetiva', didatica: 'Didática', proativa: 'Proativa', empatica: 'Empática', persistente: 'Persistente' };
const FORMATOS = {
  curto: 'Responda em até 5 linhas, priorizando a ação.',
  equilibrado: 'Responda de forma completa, mas enxuta: um parágrafo de contexto e, quando houver passos, uma lista curta.',
  detalhado: 'Responda de forma detalhada e estruturada, com títulos curtos, listas e exemplos práticos.',
};

function montarSistema(ag, marcas, achados, areaNome) {
  const L = [
    `Você é "${ag.nome}", agente de IA da Academia Milla 360 — a plataforma de gestão comercial do Grupo Milla (varejo de moda, casa e calçados; marcas ${marcas.join(', ')}).`,
    ag.descricao ? `Seu papel: ${ag.descricao}` : '',
    areaNome ? `Área: ${areaNome}.` : 'Você atende todas as áreas do Grupo.',
    '', `Tom de voz — ${TONS[ag.tom] || TONS.consultiva}`,
    `Intensidade dos traços de personalidade (0 a 100): ${Object.entries(ag.tracos || {}).map(([k, v]) => `${TRACOS[k] || k} ${v}`).join(', ')}.`,
    `Formato — ${FORMATOS[ag.formato] || FORMATOS.equilibrado}`,
  ];
  if (ag.instrucoes) L.push('', 'Instruções da área:', ag.instrucoes);
  if ((ag.restricoes || []).length) L.push('', 'Restrições (nunca faça):', ...ag.restricoes.map(r => `- ${r}`));
  if ((ag.encaminhamentos || []).length) L.push('', 'Encaminhamentos obrigatórios (oriente a pessoa a procurar o responsável):', ...ag.encaminhamentos.map(e => `- ${e[0]} → ${e[1]}`));
  L.push('', 'Regras fixas:',
    '- Responda sempre em português do Brasil.',
    '- Baseie-se nas FONTES e nos APRENDIZADOS abaixo. Quando usar uma fonte, cite o número entre colchetes, ex.: [1].',
    '- Se a resposta não estiver nas fontes, comece com "Não encontrei isso na base de conhecimento" e sugira quem procurar. Não invente números, metas, prazos ou políticas.',
    '- Use markdown simples: **negrito**, listas com "- " e listas numeradas. Sem tabelas largas.');
  if (achados.aprendizados.length) {
    L.push('', 'APRENDIZADOS VALIDADOS PELA ÁREA (têm prioridade sobre as fontes):');
    achados.aprendizados.forEach(a => L.push(`- Pergunta: ${a.pergunta || '—'}\n  Resposta correta: ${a.conteudo}`));
  }
  L.push('', 'FONTES:');
  if (!achados.trechos.length) L.push('(nenhum trecho encontrado para esta pergunta)');
  achados.trechos.forEach((t, i) => L.push(`[${i + 1}] ${t.titulo}\n${t.texto.slice(0, 1600)}`));
  return L.filter(x => x !== null).join('\n');
}

module.exports = { PROVEDORES, TIPOS, credencial, gerar, listarModelos, extrairTexto, normalizar, fatiar, indexar, buscar, sincronizarGuia, textoGuia, montarSistema, termos };
