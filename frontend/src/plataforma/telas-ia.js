// Assistente Milla: agentes de IA por área — chat (aba da área e menu Assistente Milla),
// configuração do agente (identidade, comportamento, provedor/modelo, conhecimento, aprendizado, teste)
// e cadastro das chaves dos provedores.
import './guia-ia.css';
import { S, api, esc, head, abrirModal, fecharModal, toast, chamar, val, trilha, marcarAtivo, dataHoraBR, pode } from './nucleo.js';

S.iaChat = S.iaChat || {};

// ---------- markdown simples e seguro ----------
function md(t) {
  const inline = s => esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/(^|[\s(])_(.+?)_(?=[\s).,;:!?]|$)/g, '$1<i>$2</i>').replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\[(\d{1,2})\]/g, '<sup class="fn">[$1]</sup>');
  const out = []; let lista = null;
  const fecha = () => { if (lista) { out.push(`</${lista}>`); lista = null; } };
  for (const l of String(t || '').split('\n')) {
    let m;
    if ((m = l.match(/^\s*[-*•]\s+(.*)/))) { if (lista !== 'ul') { fecha(); out.push('<ul>'); lista = 'ul'; } out.push(`<li>${inline(m[1])}</li>`); continue; }
    if ((m = l.match(/^\s*\d+[.)]\s+(.*)/))) { if (lista !== 'ol') { fecha(); out.push('<ol>'); lista = 'ol'; } out.push(`<li>${inline(m[1])}</li>`); continue; }
    fecha();
    if ((m = l.match(/^#{1,4}\s+(.*)/))) { out.push(`<div class="md-h">${inline(m[1])}</div>`); continue; }
    if (!l.trim()) { out.push('<div class="md-sp"></div>'); continue; }
    out.push(`<div>${inline(l)}</div>`);
  }
  fecha();
  return out.join('');
}

const TONS = [['amigavel', 'Amigável', 'Comunicação leve, próxima e acolhedora', '😊'], ['profissional', 'Profissional', 'Clara, educada e objetiva', '💼'], ['empatica', 'Empática', 'Compreende e acolhe antes de orientar', '🤝'], ['consultiva', 'Consultiva', 'Orienta, sugere e ajuda a decidir', '🧭'], ['objetiva', 'Objetiva', 'Direto ao ponto, respostas curtas', '🎯']];
const TRACOS = [['acolhedora', 'Acolhedora', 'Recebe com cordialidade e calor humano'], ['objetiva', 'Objetiva', 'Vai direto ao ponto com clareza'], ['didatica', 'Didática', 'Explica de forma simples e fácil'], ['proativa', 'Proativa', 'Antecipa o próximo passo'], ['empatica', 'Empática', 'Se coloca no lugar de quem pergunta'], ['persistente', 'Persistente', 'Insiste até resolver a dúvida']];
const FORMATOS = [['curto', 'Curto'], ['equilibrado', 'Equilibrado'], ['detalhado', 'Detalhado']];
const nomeTom = t => TONS.find(x => x[0] === t)?.[1] || t;
const nomeProv = (lst, c) => lst.find(p => p.codigo === c)?.nome || '—';

// ================= CHAT =================
function statusPill(ag, provs) {
  const p = provs.find(x => x.codigo === ag.provedor);
  if (ag.ativo && p?.configurado && ag.modelo) return `<span class="tag green">IA generativa · ${esc(ag.modelo)}</span>`;
  return `<span class="tag amber" title="Responde buscando na base de conhecimento até um provedor ser configurado">Modo busca</span>`;
}
function chatHTML(codigo, ag, altura = 520) {
  return `<div class="ia-chat" style="height:${altura}px"><div class="ia-stream" id="iaS_${codigo}">
    <div class="ia-msg ai"><div class="ia-av">✨</div><div class="ia-bub">${md(ag.saudacao || 'Olá! Como posso ajudar?')}</div></div></div>
    <div class="ia-sug" id="iaSug_${codigo}">${(ag.sugestoes || []).map(s => `<button onclick="iaPergunta('${codigo}',${esc(JSON.stringify(s))})">${esc(s)}</button>`).join('')}</div>
    <div class="ia-in"><textarea id="iaI_${codigo}" class="inp" rows="1" placeholder="Pergunte para ${esc(ag.nome)}…" onkeydown="if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();iaEnviar('${codigo}')}"></textarea>
    <button class="btn" title="Nova conversa" onclick="iaNova('${codigo}')">↺</button><button class="btn red" onclick="iaEnviar('${codigo}')">Enviar</button></div></div>`;
}
function iaAdd(codigo, html, quem, id) {
  const s = document.getElementById('iaS_' + codigo); if (!s) return null;
  const d = document.createElement('div'); d.className = `ia-msg ${quem}`; if (id) d.dataset.id = id;
  d.innerHTML = quem === 'me' ? `<div class="ia-bub">${html}</div>` : `<div class="ia-av">✨</div><div class="ia-bub">${html}</div>`;
  s.appendChild(d); s.scrollTop = s.scrollHeight; return d;
}
function rodapeResposta(m) {
  const fontes = [...new Set((m.fontes || []).filter(f => f.titulo).map(f => f.titulo))];
  return `<div class="ia-meta">${m.modo === 'ia' ? `<span>✨ ${esc(m.modelo || 'IA')}</span>` : '<span>🔎 busca na base</span>'}${fontes.length ? `<span title="${esc(fontes.join(' · '))}">📚 ${fontes.length} fonte(s): ${esc(fontes.slice(0, 2).join(' · '))}${fontes.length > 2 ? '…' : ''}</span>` : ''}
  <span class="ia-fb" id="iaFb_${m.id}">${m.feedback ? (m.feedback > 0 ? '👍 útil' : '👎 registrado') : `<button onclick="iaFeedback(${m.id},1)">👍 Útil</button><button onclick="iaFeedback(${m.id},-1)">👎 Não ajudou</button>`}</span></div>`;
}
async function iaEnviar(codigo, texto) {
  const i = document.getElementById('iaI_' + codigo);
  const q = (texto ?? i?.value ?? '').trim(); if (!q) return;
  if (i) i.value = '';
  document.getElementById('iaSug_' + codigo)?.classList.add('hidden');
  iaAdd(codigo, esc(q).replace(/\n/g, '<br>'), 'me');
  const esp = iaAdd(codigo, '<span class="ia-dots"><i></i><i></i><i></i></span>', 'ai');
  try {
    const r = await api(`/ia/agentes/${codigo}/chat`, { metodo: 'POST', corpo: { mensagem: q, conversa_id: S.iaChat[codigo] || null } });
    S.iaChat[codigo] = r.conversa_id;
    esp.querySelector('.ia-bub').innerHTML = md(r.mensagem.conteudo) + rodapeResposta(r.mensagem);
  } catch (e) { esp.querySelector('.ia-bub').innerHTML = `<span style="color:var(--red)">${esc(e.message)}</span>`; }
  const s = document.getElementById('iaS_' + codigo); if (s) s.scrollTop = s.scrollHeight;
}
const iaPergunta = (c, s) => iaEnviar(c, s);
function iaNova(codigo) {
  S.iaChat[codigo] = null;
  const s = document.getElementById('iaS_' + codigo); if (!s) return;
  [...s.children].slice(1).forEach(n => n.remove());
  document.getElementById('iaSug_' + codigo)?.classList.remove('hidden');
  toast('Nova conversa iniciada.');
}
async function iaFeedback(id, valor) {
  if (valor === 1) {
    const r = await chamar(() => api(`/ia/mensagens/${id}/feedback`, { metodo: 'POST', corpo: { valor: 1 } }));
    document.getElementById('iaFb_' + id).innerHTML = '👍 útil';
    return toast(r.status === 'aprovado' ? 'Obrigado! A resposta virou aprendizado da IA.' : 'Obrigado! A área vai validar esta resposta como aprendizado.', 'ok');
  }
  abrirModal('Ajude a IA a aprender', `<p class="mini" style="margin-top:0">Sua correção vai para a área responsável${'' } — depois de aprovada, a IA passa a responder assim.</p>
  <label class="lbl">Qual seria a resposta correta? (opcional, mas é o que mais ensina)</label><textarea class="inp" id="fbCor" style="min-height:120px" placeholder="Escreva a resposta certa, com os números e o procedimento corretos."></textarea>
  <label class="lbl" style="margin-top:10px">O que faltou ou estava errado?</label><input class="inp" id="fbCom" placeholder="Ex.: o prazo informado está desatualizado">
  <div style="display:flex;gap:8px;margin-top:14px"><button class="btn red" onclick="iaFeedbackEnviar(${id})">Enviar para aprendizado</button><button class="btn ghost" onclick="fecharModal()">Cancelar</button></div>`);
}
async function iaFeedbackEnviar(id) {
  const r = await chamar(() => api(`/ia/mensagens/${id}/feedback`, { metodo: 'POST', corpo: { valor: -1, correcao: val('fbCor'), comentario: val('fbCom') } }));
  fecharModal(); document.getElementById('iaFb_' + id).innerHTML = '👎 registrado';
  toast(r.status === 'aprovado' ? 'Correção aprendida automaticamente pela IA.' : 'Obrigado! A correção foi para aprovação da área.', 'ok');
}

// ---------- Aba "Assistente IA" dentro da área ----------
S.abasArea.ia = async (id, a) => {
  const d = await api(`/ia/agentes/${id}`);
  S.iaAgentes = S.iaAgentes || {}; S.iaAgentes[id] = d;
  const ag = d.agente;
  return `<div class="grid cards-3"><div class="card" style="grid-column:span 2">${chatHTML(id, ag)}</div>
  <div style="display:flex;flex-direction:column;gap:16px">
    <div class="card p"><div style="display:flex;gap:12px;align-items:center"><div class="ia-avg" style="background:${a.grad}">✨</div><div style="flex:1"><div class="sect-title" style="font-size:15px">${esc(ag.nome)}</div><div class="mini">${esc(a.nome)}</div></div></div>
      <p style="font-size:13px;color:var(--muted);line-height:1.55;margin:12px 0">${esc(ag.descricao || '')}</p>
      <div style="display:flex;gap:6px;flex-wrap:wrap">${statusPill(ag, d.provedores)}<span class="tag gray">Tom ${esc(nomeTom(ag.tom))}</span></div>
      ${d.pode_configurar ? `<button class="btn red" style="width:100%;margin-top:14px" onclick="abrirConfigIA('${id}')">⚙ Configurar a IA da área</button>` : ''}</div>
    <div class="card p" style="background:${a.grad};color:#fff;border:0"><div class="sect-title" style="color:#fff">Como esta IA aprende</div>
      <div style="font-size:12.5px;line-height:1.6;margin-top:8px;color:rgba(255,255,255,.92)">Responde com base no <b>guia da área</b> e nos <b>arquivos e textos</b> que a área publica. Marque 👍 ou 👎 nas respostas: correções e perguntas sem resposta viram <b>aprendizado</b>, validado pela área.</div></div>
  </div></div>`;
};

// ---------- Menu "Assistente Milla" ----------
S.telas.ia = async () => {
  const d = await api('/ia/agentes');
  S.iaLista = d;
  const sel = S.iaSel && d.agentes.find(a => a.codigo === S.iaSel) ? S.iaSel : 'geral';
  S.iaSel = sel;
  const ag = d.agentes.find(a => a.codigo === sel);
  return `${head('Assistente Milla', 'Um agente de IA por área, treinado com os guias e os conteúdos de cada time', pode('rbac') ? `<button class="btn" onclick="cfgAba('ia')">⚙ Gerenciar agentes</button>` : '')}
  <div class="ia-layout"><div class="card p ia-lista"><div class="sect-title" style="font-size:14px;margin-bottom:8px">Agentes</div>
    ${d.agentes.map(a => `<div class="ia-ag ${a.codigo === sel ? 'on' : ''}" onclick="iaSelecionar('${a.codigo}')"><div class="ia-avg sm" style="background:${a.grad || 'linear-gradient(135deg,#C8102E,#1D4ED8)'}">${a.codigo === 'geral' ? 'M' : '✨'}</div><div style="flex:1;min-width:0"><div class="ttl">${esc(a.nome)}</div><div class="mini">${a.provedor_ok && a.ativo && a.modelo ? '● IA generativa' : '○ modo busca'} · ${a.documentos} conteúdo(s)</div></div></div>`).join('')}
  </div>
  <div class="card"><div class="ia-topo"><div><b>${esc(ag.nome)}</b><div class="mini">${esc(ag.descricao || '')}</div></div><div style="display:flex;gap:8px;align-items:center">${statusPill(ag, d.provedores)}${ag.pode_configurar ? `<button class="btn" onclick="abrirConfigIA('${ag.codigo}')">⚙ Configurar</button>` : ''}</div></div>${chatHTML(sel, ag, 540)}</div></div>`;
};
function iaSelecionar(c) { S.iaSel = c; window.go('ia'); }

// ================= CONFIGURAÇÃO DO AGENTE =================
const ABAS_CFG = [['identidade', 'Identidade'], ['comportamento', 'Comportamento'], ['provedor', 'Provedor & Modelo'], ['conhecimento', 'Conhecimento'], ['aprendizado', 'Aprendizado'], ['testar', 'Testar & Uso']];
function abrirConfigIA(codigo, aba) {
  S.iac = { codigo, aba: aba || 'identidade' };
  window.go('iacfg');
}
S.telas.iacfg = async () => {
  if (!S.iac?.codigo) return '<div class="card p">Escolha um agente em Configurações → Inteligência Artificial.</div>';
  const d = await api(`/ia/agentes/${S.iac.codigo}`);
  if (!d.pode_configurar) return '<div class="card p">Seu perfil não pode configurar este agente.</div>';
  S.iac.d = d;
  S.iac.draft = JSON.parse(JSON.stringify(d.agente));
  return cfgHTML();
};
S.depois.iacfg = () => {
  const d = S.iac?.d; if (!d) return;
  const area = d.agente.area_id ? S.D.areas[d.agente.area_id] : null;
  trilha(`Academia Milla 360 · <a onclick="go('ia')">Assistente Milla</a> · <b>Configurar ${esc(d.agente.nome)}</b>`);
  marcarAtivo(area ? 'areas' : 'ia');
};
function cfgHTML() {
  const { d, aba, draft } = S.iac;
  const ag = d.agente;
  const area = ag.area_id ? S.D.areas[ag.area_id] : null;
  const pend = d.aprendizados.filter(x => x.status === 'pendente').length;
  return `<div class="page-head"><div><h1>${esc(ag.nome)}</h1><p>Configure como a IA ${area ? 'da ' + esc(area.nome) : 'corporativa'} interage, responde, aprende e qual modelo ela usa.</p></div>
  <div style="display:flex;gap:8px">${area ? `<button class="btn" onclick="openArea('${ag.area_id}','ia')">← Voltar à área</button>` : `<button class="btn" onclick="go('ia')">← Assistente</button>`}<button class="btn" onclick="iacAba('testar')">💬 Testar</button><button class="btn red" onclick="iacSalvar()">💾 Salvar alterações</button></div></div>
  <div class="ia-cfg"><div><div class="subtabs">${ABAS_CFG.map(([k, t]) => `<button class="${aba === k ? 'on' : ''}" onclick="iacAba('${k}')">${t}${k === 'aprendizado' && pend ? ` <span class="tag red" style="padding:1px 7px">${pend}</span>` : ''}${k === 'conhecimento' ? ` <span class="mini">(${d.documentos.length})</span>` : ''}</button>`).join('')}</div>
  <div id="iacCorpo">${ABA[aba](d, draft)}</div></div>
  <div class="ia-resumo">${resumoHTML(d, draft)}</div></div>`;
}
function resumoHTML(d, dr) {
  const prov = d.provedores.find(p => p.codigo === dr.provedor);
  const linhas = [['Tom de voz', nomeTom(dr.tom)], ['Formato', FORMATOS.find(f => f[0] === dr.formato)?.[1]], ['Provedor', prov ? prov.nome.split(' (')[0] : 'Não definido'], ['Modelo', dr.modelo || '—'],
    ['Chave do provedor', prov ? (prov.configurado ? '✓ cadastrada' : '✕ falta cadastrar') : '—'], ['IA generativa', dr.ativo ? 'Ligada' : 'Desligada (modo busca)'],
    ['Conhecimentos', d.documentos.filter(x => x.ativo).length], ['Aprendizados ativos', d.aprendizados.filter(x => x.status === 'aprovado').length], ['Aguardando aprovação', d.aprendizados.filter(x => x.status === 'pendente').length]];
  return `<div class="card p"><div class="sect-title" style="font-size:14px">Resumo do agente</div><div class="sect-sub">Visão geral da configuração atual</div>
  ${linhas.map(l => `<div class="ia-rl"><span>${l[0]}</span><b>${esc(l[1])}</b></div>`).join('')}</div>
  <div class="card p" style="margin-top:14px"><div class="sect-title" style="font-size:14px">Exemplo de saudação</div><div class="ia-msg ai" style="margin-top:10px"><div class="ia-av">✨</div><div class="ia-bub">${md(dr.saudacao || '')}</div></div></div>
  <div class="card p" style="margin-top:14px"><div class="sect-title" style="font-size:14px">Ações rápidas</div>
    <div class="row-item" style="cursor:pointer" onclick="iacAba('conhecimento')"><div class="ico" style="background:#EEF3F5">📚</div><div class="ttl" style="flex:1">Enviar arquivo de conhecimento</div></div>
    <div class="row-item" style="cursor:pointer" onclick="iacAba('aprendizado')"><div class="ico" style="background:#EEF3F5">🧠</div><div class="ttl" style="flex:1">Revisar aprendizados</div></div>
    <div class="row-item" style="cursor:pointer" onclick="iacAba('provedor')"><div class="ico" style="background:#EEF3F5">⚙</div><div class="ttl" style="flex:1">Trocar provedor / modelo</div></div></div>`;
}
function iacAba(k) { S.iac.aba = k; document.getElementById('view').innerHTML = cfgHTML(); posRender(); window.scrollTo(0, 0); }
function posRender() { if (S.iac.aba === 'testar') { /* chat já montado */ } }
function iacSet(k, v) { S.iac.draft[k] = v; const r = document.querySelector('.ia-resumo'); if (r) r.innerHTML = resumoHTML(S.iac.d, S.iac.draft); }
function iacProvedor(v) { iacSet('provedor', v); iacSet('modelo', (S.iac.d.provedores.find(x => x.codigo === v)?.modelos || [])[0] || ''); iacAba('provedor'); }
function iacTraco(k, v) { S.iac.draft.tracos = { ...S.iac.draft.tracos, [k]: Number(v) }; const o = document.getElementById('trv_' + k); if (o) o.textContent = v + '%'; }
async function iacSalvar(silencioso) {
  const dr = S.iac.draft;
  const r = await chamar(() => api(`/ia/agentes/${S.iac.codigo}`, { metodo: 'PUT', corpo: dr }));
  S.iac.d.agente = r.agente; S.iac.draft = JSON.parse(JSON.stringify(r.agente));
  if (!silencioso) toast('Configuração do agente salva.', 'ok');
  iacAba(S.iac.aba);
}
async function iacRecarregar(aba) {
  const d = await api(`/ia/agentes/${S.iac.codigo}`);
  const draft = S.iac.draft;
  S.iac.d = d; S.iac.draft = draft; iacAba(aba || S.iac.aba);
}

const toggle = (k, v, t, sub) => `<label class="ia-tg"><input type="checkbox" ${v ? 'checked' : ''} onchange="iacSet('${k}',this.checked)"><span class="ia-sw"></span><span><b>${t}</b>${sub ? `<small>${sub}</small>` : ''}</span></label>`;

const ABA = {
  identidade: (d, dr) => `<div class="card p"><div class="sect-title">Identidade do agente</div><div class="sect-sub">Como o agente se apresenta para o time</div>
    <div class="form-grid"><div><label class="lbl">Nome do agente</label><input class="inp" value="${esc(dr.nome)}" oninput="iacSet('nome',this.value)"></div>
    <div><label class="lbl">Área</label><input class="inp" disabled value="${esc(dr.area_id ? S.D.areas[dr.area_id]?.nome : 'Todas as áreas (Assistente geral)')}"></div>
    <div class="full"><label class="lbl">Papel / descrição (aparece para os usuários)</label><textarea class="inp" oninput="iacSet('descricao',this.value)">${esc(dr.descricao || '')}</textarea></div>
    <div class="full"><label class="lbl">Mensagem de saudação</label><textarea class="inp" oninput="iacSet('saudacao',this.value)">${esc(dr.saudacao || '')}</textarea></div>
    <div class="full"><label class="lbl">Sugestões de perguntas (uma por linha · até 8)</label><textarea class="inp" style="min-height:110px" oninput="iacSet('sugestoes',this.value.split('\\n'))">${esc((dr.sugestoes || []).join('\n'))}</textarea></div></div>
    <div style="margin-top:12px">${toggle('ativo', dr.ativo, 'IA generativa habilitada', 'Desligada, o agente só faz busca na base de conhecimento (sem custo de API).')}</div></div>`,

  comportamento: (d, dr) => `<div class="card p"><div class="sect-title">Tom de voz</div><div class="sect-sub">Como o agente se comunica com o time</div>
    <div class="ia-tons">${TONS.map(t => `<div class="ia-tom ${dr.tom === t[0] ? 'on' : ''}" onclick="iacSet('tom','${t[0]}');iacAba('comportamento')"><div class="e">${t[3]}</div><b>${t[1]}</b><small>${t[2]}</small><span class="rd"></span></div>`).join('')}</div></div>
  <div class="card p" style="margin-top:16px"><div class="sect-title">Personalidade</div><div class="sect-sub">Intensidade de cada traço na forma de responder</div>
    <div class="grid cards-2" style="gap:14px 28px;margin-top:8px">${TRACOS.map(t => `<div><div class="between"><div><b style="font-size:13px">${t[1]}</b><div class="mini">${t[2]}</div></div><b id="trv_${t[0]}" class="ia-pct">${dr.tracos?.[t[0]] ?? 60}%</b></div><input type="range" min="0" max="100" step="5" value="${dr.tracos?.[t[0]] ?? 60}" class="ia-range" oninput="iacTraco('${t[0]}',this.value)"></div>`).join('')}</div>
    <div style="margin-top:14px"><label class="lbl">Tamanho das respostas</label><div class="segmented">${FORMATOS.map(f => `<button class="${dr.formato === f[0] ? 'on' : ''}" onclick="iacSet('formato','${f[0]}');iacAba('comportamento')">${f[1]}</button>`).join('')}</div></div></div>
  <div class="card p" style="margin-top:16px"><div class="sect-title">Instruções da área (prompt)</div><div class="sect-sub">Escreva como a IA deve agir: contexto, prioridades, linguagem, exemplos. É o “cérebro” do agente.</div>
    <textarea class="inp" style="min-height:190px" oninput="iacSet('instrucoes',this.value)" placeholder="Ex.: Você apoia os supervisores na condução das lojas. Sempre que falar de visita, lembre o checklist e o registro do plano de ação em 24 h…">${esc(dr.instrucoes || '')}</textarea></div>
  <div class="grid cards-2" style="margin-top:16px"><div class="card p"><div class="sect-title">Restrições e limites</div><div class="sect-sub">O que a IA NUNCA deve fazer (uma por linha)</div>
    <textarea class="inp" style="min-height:150px" oninput="iacSet('restricoes',this.value.split('\\n'))">${esc((dr.restricoes || []).join('\n'))}</textarea></div>
  <div class="card p"><div class="sect-title">Encaminhamentos obrigatórios</div><div class="sect-sub">Assunto → quem procurar (um por linha, separado por “|”)</div>
    <textarea class="inp" style="min-height:150px" oninput="iacSet('encaminhamentos',this.value.split('\\n').map(l=>l.split('|').map(x=>x.trim())).filter(x=>x[0]&&x[1]))" placeholder="Férias e afastamentos | RH / DP">${esc((dr.encaminhamentos || []).map(e => `${e[0]} | ${e[1]}`).join('\n'))}</textarea></div></div>`,

  provedor: (d, dr) => {
    const p = d.provedores.find(x => x.codigo === dr.provedor);
    const modelos = [...new Set([...(S.iac.vivos?.[dr.provedor] || []), ...(p?.modelos || [])])];
    return `<div class="card p"><div class="sect-title">Provedor e modelo</div><div class="sect-sub">Escolha qual IA responde por este agente. Dá para trocar a qualquer momento — o conhecimento e os aprendizados continuam.</div>
    <div class="form-grid"><div><label class="lbl">Provedor</label><select class="inp" onchange="iacProvedor(this.value)"><option value="">Selecione…</option>${d.provedores.map(x => `<option value="${x.codigo}" ${x.codigo === dr.provedor ? 'selected' : ''}>${esc(x.nome)}${x.configurado ? ' ✓' : ''}</option>`).join('')}</select></div>
    <div><label class="lbl">Modelo</label><div style="display:flex;gap:6px"><input class="inp" list="iacModelos" value="${esc(dr.modelo || '')}" oninput="iacSet('modelo',this.value)" placeholder="nome do modelo"><datalist id="iacModelos">${modelos.map(m => `<option value="${esc(m)}">`).join('')}</datalist>
      <button class="btn" title="Buscar a lista de modelos da sua conta" onclick="iacModelosVivo()" ${p?.configurado ? '' : 'disabled'}>⟳</button></div><div class="mini" style="margin-top:4px">${S.iac.vivos?.[dr.provedor] ? `${S.iac.vivos[dr.provedor].length} modelo(s) · ao vivo` : 'Sugestões do catálogo · ⟳ busca ao vivo na sua conta'}</div></div>
    <div><label class="lbl">Temperatura (<span id="tmpV">${Number(dr.temperatura).toFixed(2)}</span>) — criatividade</label><input type="range" class="ia-range" min="0" max="1" step="0.05" value="${dr.temperatura}" oninput="document.getElementById('tmpV').textContent=Number(this.value).toFixed(2);iacSet('temperatura',Number(this.value))"><div class="mini">0 = mais fiel às fontes · 1 = mais criativo. Recomendado: 0,2 a 0,4.</div></div>
    <div><label class="lbl">Máximo de tokens por resposta</label><input class="inp" type="number" min="200" max="8000" step="100" value="${dr.max_tokens}" oninput="iacSet('max_tokens',Number(this.value))"><div class="mini">≈ 0,75 palavra por token. 1.200 atende bem.</div></div></div>
    <div style="margin-top:12px;display:flex;flex-direction:column;gap:10px">${toggle('ativo', dr.ativo, 'IA habilitada', 'Desligada, o agente responde só por busca na base.')}${dr.area_id ? toggle('usar_guia', dr.usar_guia, 'Usar o guia da área cadastrado na plataforma', 'Pilares, rotinas, programação, checklists, régua de campanha, indicadores e cursos.') : ''}</div>
    <div style="display:flex;gap:8px;margin-top:16px;align-items:center;flex-wrap:wrap"><button class="btn red" onclick="iacSalvar()">💾 Salvar</button><button class="btn" onclick="iacTestar()">🤖 Testar conexão</button><span class="mini" id="iacTeste"></span></div></div>
    ${p ? chaveHTML(p, d.pode_provedores) : ''}`;
  },

  conhecimento: (d) => `<div class="grid cards-2"><div class="card p"><div class="sect-title">Enviar arquivos</div><div class="sect-sub">Books, manuais, políticas, planilhas, apresentações</div>
    <label class="ia-drop" id="iaDrop" ondragover="event.preventDefault();this.classList.add('on')" ondragleave="this.classList.remove('on')" ondrop="event.preventDefault();this.classList.remove('on');iacArquivos(event.dataTransfer.files)">
      <input type="file" multiple accept=".pdf,.docx,.xlsx,.pptx,.txt,.md,.csv,.json,.html,.htm" onchange="iacArquivos(this.files)" hidden>
      <div style="font-size:30px">☁️</div><b>Arraste e solte os arquivos aqui</b><span class="mini">ou clique para selecionar · PDF, Word, Excel, PowerPoint, TXT, CSV, HTML · até 15 MB cada</span></label>
    <div id="iaUp" class="mini" style="margin-top:8px"></div></div>
  <div class="card p"><div class="sect-title">Escrever conhecimento</div><div class="sect-sub">Políticas, combinados, respostas padrão — direto na plataforma</div>
    <input class="inp" id="kTit" placeholder="Título (ex.: Política de bonificação 2026)"><textarea class="inp" id="kTxt" style="min-height:120px;margin-top:8px" placeholder="Escreva o conteúdo que a IA deve conhecer…"></textarea>
    <button class="btn red" style="margin-top:8px" onclick="iacTexto()">Adicionar à base</button></div></div>
  <div class="card p" style="margin-top:16px"><div class="between"><div><div class="sect-title">Base de conhecimento</div><div class="sect-sub">${d.documentos.length} fonte(s) · ${d.documentos.reduce((s, x) => s + (x.ativo ? x.trechos : 0), 0)} trechos indexados para busca</div></div>${d.agente.area_id ? `<button class="btn" onclick="iacGuia()">⟳ Atualizar guia da área</button>` : ''}</div>
    <div style="overflow-x:auto"><table><thead><tr><th>Fonte</th><th>Tipo</th><th>Trechos</th><th>Enviado por</th><th>Data</th><th>Status</th><th></th></tr></thead><tbody>
    ${d.documentos.map(x => `<tr style="${x.ativo ? '' : 'opacity:.5'}"><td><b>${esc(x.titulo)}</b>${x.origem === 'guia' ? '<div class="mini">Atualizado automaticamente a partir da área</div>' : ''}</td><td><span class="tag ${x.origem === 'guia' ? 'petrol' : x.origem === 'texto' ? 'blue' : 'gray'}">${x.origem === 'guia' ? 'Guia da área' : x.origem === 'texto' ? 'Texto' : esc(String(x.tipo || '').toUpperCase())}</span></td><td>${x.trechos}</td><td>${esc(x.enviado_por || '—')}</td><td>${dataHoraBR(x.criado_em)}</td><td><span class="tag ${x.ativo ? 'green' : 'gray'}">${x.ativo ? 'Ativo' : 'Inativo'}</span></td>
    <td style="white-space:nowrap"><button class="linkbtn" onclick="iacVerDoc(${x.id})">Ver</button>${x.tem_original ? ` · <button class="linkbtn" onclick="iacOriginal(${x.id})">Original</button>` : ''} · <button class="linkbtn" onclick="iacAtivoDoc(${x.id},${!x.ativo})">${x.ativo ? 'Desativar' : 'Ativar'}</button>${x.origem !== 'guia' ? ` · <button class="linkbtn" style="color:var(--red)" onclick="iacExcluirDoc(${x.id})">Excluir</button>` : ''}</td></tr>`).join('')}
    </tbody></table></div><div class="mini" style="margin-top:8px">Cada fonte é dividida em trechos e indexada. A cada pergunta, a IA recebe só os trechos mais relevantes — por isso pode receber books grandes sem perder precisão.</div></div>`,

  aprendizado: (d, dr) => {
    const pend = d.aprendizados.filter(x => x.status === 'pendente');
    const lac = pend.filter(x => x.tipo === 'lacuna'), rev = pend.filter(x => x.tipo !== 'lacuna');
    const ativos = d.aprendizados.filter(x => x.status === 'aprovado');
    const TIPO = { correcao: ['Correção', 'red'], validada: ['Resposta validada', 'green'], revisao: ['Revisar resposta', 'amber'], lacuna: ['Lacuna', 'amber'], faq: ['Pergunta frequente', 'blue'], instrucao: ['Regra da área', 'petrol'] };
    const card = x => `<div class="ia-apr"><div class="between"><span class="tag ${TIPO[x.tipo]?.[1] || 'gray'}">${TIPO[x.tipo]?.[0] || x.tipo}</span><span class="mini">${esc(x.criado_por || '')} · ${dataHoraBR(x.criado_em)}</span></div>
      ${x.pergunta ? `<div style="margin:8px 0 4px;font-size:13px"><b>Pergunta:</b> ${esc(x.pergunta)}</div>` : ''}
      <textarea class="inp" id="apr_${x.id}" style="min-height:${x.tipo === 'lacuna' ? 80 : 90}px" placeholder="${x.tipo === 'lacuna' ? 'Escreva a resposta correta para a IA aprender…' : ''}">${esc(x.conteudo || '')}</textarea>
      <div style="display:flex;gap:8px;margin-top:8px"><button class="btn red" onclick="iacApr(${x.id},'aprovado')">✓ ${x.tipo === 'lacuna' ? 'Responder e ensinar' : 'Aprovar'}</button><button class="btn ghost" onclick="iacApr(${x.id},'rejeitado')">Descartar</button></div></div>`;
    return `<div class="grid cards-4" style="margin-bottom:16px">${[['👍 Respostas úteis', d.uso.uteis], ['👎 Não ajudaram', d.uso.nao_uteis], ['🧠 Aprendizados ativos', ativos.length], ['⏳ Aguardando a área', pend.length]].map(k => `<div class="card p" style="text-align:center"><div style="font-size:24px;font-weight:800">${k[1]}</div><div class="mini">${k[0]} · 30 dias</div></div>`).join('')}</div>
    <div class="card p"><div class="between" style="flex-wrap:wrap;gap:10px"><div><div class="sect-title">Como a IA aprende</div><div class="sect-sub">Pergunta → resposta → feedback 👍/👎 → aprovação da área → passa a valer em todas as respostas</div></div>
      <div>${toggle('aprendizado_auto', dr.aprendizado_auto, 'Aprendizado automático', 'Correções e respostas validadas entram sem aprovação. Recomendado só depois de a área ganhar confiança.')}</div></div>
      <div class="mini" style="margin-top:8px">Perguntas que a IA não encontrou na base viram <b>lacunas</b>: responda uma vez e ela aprende. ${dr.aprendizado_auto !== d.agente.aprendizado_auto ? '<b style="color:var(--red)">Salve para aplicar a mudança.</b>' : ''}</div></div>
    <div class="grid cards-2" style="margin-top:16px"><div class="card p"><div class="sect-title">Correções e validações (${rev.length})</div><div class="sect-sub">Enviadas pelos usuários no chat</div>${rev.map(card).join('') || '<div class="vazio">Nada aguardando. 👍</div>'}</div>
    <div class="card p"><div class="sect-title">Lacunas de conhecimento (${lac.length})</div><div class="sect-sub">Perguntas sem resposta na base</div>${lac.map(card).join('') || '<div class="vazio">Nenhuma lacuna aberta.</div>'}</div></div>
    <div class="card p" style="margin-top:16px"><div class="sect-title">Ensinar diretamente</div><div class="sect-sub">Pergunta frequente ou regra que a IA deve seguir</div>
      <div class="form-grid"><div class="full"><input class="inp" id="nfP" placeholder="Pergunta (ex.: Qual o prazo para registrar o plano da visita?)"></div><div class="full"><textarea class="inp" id="nfR" placeholder="Resposta correta"></textarea></div></div>
      <button class="btn red" style="margin-top:8px" onclick="iacFaq()">Ensinar a IA</button></div>
    <div class="card p" style="margin-top:16px"><div class="sect-title">Aprendizados ativos (${ativos.length})</div><div class="sect-sub">Têm prioridade sobre as fontes nas respostas</div>
      ${ativos.length ? `<div style="overflow-x:auto"><table><thead><tr><th>Tipo</th><th>Pergunta</th><th>Resposta / regra</th><th>Aprovado por</th><th></th></tr></thead><tbody>${ativos.map(x => `<tr><td><span class="tag ${TIPO[x.tipo]?.[1] || 'gray'}">${TIPO[x.tipo]?.[0] || x.tipo}</span></td><td>${esc(x.pergunta || '—')}</td><td style="max-width:420px">${esc(String(x.conteudo || '').slice(0, 260))}${String(x.conteudo || '').length > 260 ? '…' : ''}</td><td class="mini">${esc(x.revisado_por || '')}<br>${dataHoraBR(x.revisado_em)}</td><td><button class="linkbtn" style="color:var(--red)" onclick="iacAprExcluir(${x.id})">Remover</button></td></tr>`).join('')}</tbody></table></div>` : '<div class="vazio">Ainda não há aprendizados aprovados.</div>'}</div>`;
  },

  testar: (d) => `<div class="grid cards-3"><div class="card" style="grid-column:span 2">${chatHTML(S.iac.codigo, S.iac.draft, 520)}</div>
    <div style="display:flex;flex-direction:column;gap:16px"><div class="card p"><div class="sect-title" style="font-size:14px">Uso nos últimos 30 dias</div>
      ${[['Perguntas', d.uso.perguntas], ['Conversas', d.uso.conversas], ['Respostas com IA', d.uso.respostas_ia], ['Respostas por busca', d.uso.respostas_busca], ['Tokens (entrada / saída)', `${d.uso.tokens_entrada.toLocaleString('pt-BR')} / ${d.uso.tokens_saida.toLocaleString('pt-BR')}`], ['Tempo médio da IA', d.uso.ms_medio ? (d.uso.ms_medio / 1000).toFixed(1) + ' s' : '—']].map(l => `<div class="ia-rl"><span>${l[0]}</span><b>${l[1]}</b></div>`).join('')}
      <div class="mini" style="margin-top:8px">O teste usa a configuração <b>salva</b>. Salve antes de testar mudanças.</div></div>
    <div class="card p"><div class="sect-title" style="font-size:14px">Perguntas recentes</div>${d.recentes.map(r => `<div class="row-item"><div style="flex:1"><div class="ttl" style="font-size:12.5px">${esc(r.conteudo.slice(0, 90))}</div><div class="meta">${esc(r.nome || '')} · ${dataHoraBR(r.criado_em)}</div></div></div>`).join('') || '<div class="mini">Nenhuma pergunta ainda.</div>'}</div></div></div>`,
};

// ---------- chaves de provedor ----------
function chaveHTML(p, pode) {
  return `<div class="card p" style="margin-top:16px"><div class="between"><div><div class="sect-title">Chave do provedor · ${esc(p.nome)}</div><div class="sect-sub">Uma chave por provedor, usada por todos os agentes que escolherem ${esc(p.nome.split(' (')[0])}. Fica cifrada no banco e nunca volta para a tela.</div></div>
    <span class="tag ${p.configurado ? 'green' : 'amber'}">${p.configurado ? `✓ cadastrada${p.chave_final ? ' · ••••' + esc(p.chave_final) : ''}` : 'Não cadastrada'}</span></div>
    ${p.atualizado_por ? `<div class="mini">Atualizada por ${esc(p.atualizado_por)} em ${dataHoraBR(p.atualizado_em)}</div>` : ''}
    ${pode ? `<div class="form-grid" style="margin-top:10px"><div class="${p.exige_url || p.codigo === 'openrouter' ? '' : 'full'}"><label class="lbl">${p.configurado ? 'Trocar a chave de API' : 'Chave de API'}${p.chave_opcional ? ' (opcional)' : ''}</label><input class="inp" type="password" id="pkChave" autocomplete="new-password" placeholder="${p.configurado ? 'deixe em branco para manter a atual' : 'cole a chave aqui'}"></div>
      ${p.exige_url || p.codigo === 'openrouter' ? `<div><label class="lbl">URL base${p.exige_url ? '' : ' (opcional)'}</label><input class="inp" id="pkUrl" value="${esc(p.base_url || '')}" placeholder="${p.exige_url ? 'http://servidor:11434/v1' : 'https://openrouter.ai/api/v1'}"></div>` : ''}</div>
      <div style="display:flex;gap:8px;margin-top:10px"><button class="btn red" onclick="iacChave('${p.codigo}')">Salvar chave</button>${p.configurado ? `<button class="btn ghost" style="color:var(--red)" onclick="iacChaveRemover('${p.codigo}')">Remover chave</button>` : ''}</div>
      ${p.site ? `<div class="mini" style="margin-top:8px">Crie a chave em <b>${esc(p.site)}</b>. O consumo é cobrado pelo provedor na conta do Grupo Milla.</div>` : ''}`
    : '<div class="mini" style="margin-top:8px">Só perfis com IA total (administração) cadastram chaves. Peça à administração.</div>'}</div>`;
}
async function iacChave(codigo) {
  const chave = val('pkChave'), url = document.getElementById('pkUrl') ? val('pkUrl') : '';
  const provs = await chamar(() => api(`/ia/provedores/${codigo}`, { metodo: 'PUT', corpo: { chave, base_url: url } }));
  if (S.iac?.d) { S.iac.d.provedores = provs; iacAba(S.iac.aba); }
  else window.go('config');
  toast('Chave salva e cifrada.', 'ok');
}
async function iacChaveRemover(codigo) {
  abrirModal('Remover chave', `<p style="margin-top:0">Os agentes que usam este provedor passam a responder em <b>modo busca</b> até uma nova chave ser cadastrada. Deseja remover?</p><div style="display:flex;gap:8px"><button class="btn red" onclick="iacChaveRemoverOk('${codigo}')">Remover chave</button><button class="btn ghost" onclick="fecharModal()">Cancelar</button></div>`);
}
async function iacChaveRemoverOk(codigo) {
  const provs = await chamar(() => api(`/ia/provedores/${codigo}`, { metodo: 'DELETE' }));
  fecharModal(); toast('Chave removida.', 'ok');
  if (S.iac?.d && document.querySelector('.ia-cfg')) { S.iac.d.provedores = provs; iacAba(S.iac.aba); } else window.go('config');
}
async function iacModelosVivo() {
  const p = S.iac.draft.provedor;
  const r = await chamar(() => api(`/ia/provedores/${p}/modelos`, { metodo: 'POST' }));
  S.iac.vivos = { ...(S.iac.vivos || {}), [p]: r.modelos };
  toast(`${r.modelos.length} modelo(s) disponíveis na sua conta.`, 'ok'); iacAba('provedor');
}
async function iacTestar() {
  const el = document.getElementById('iacTeste'); el.textContent = 'Testando…';
  try {
    const r = await api(`/ia/agentes/${S.iac.codigo}/testar`, { metodo: 'POST', corpo: { provedor: S.iac.draft.provedor, modelo: S.iac.draft.modelo } });
    el.innerHTML = `<span style="color:var(--green);font-weight:700">✓ Conectado em ${(r.ms / 1000).toFixed(1)} s</span> — “${esc(r.resposta.slice(0, 120))}”`;
  } catch (e) { el.innerHTML = `<span style="color:var(--red);font-weight:700">✕ ${esc(e.message)}</span>`; }
}

// ---------- conhecimento ----------
const lerBase64 = f => new Promise((ok, erro) => { const r = new FileReader(); r.onload = () => ok(String(r.result).split(',')[1]); r.onerror = () => erro(new Error('Não foi possível ler o arquivo.')); r.readAsDataURL(f); });
async function iacArquivos(files) {
  const lst = [...files]; if (!lst.length) return;
  const st = document.getElementById('iaUp');
  let ok = 0;
  for (const [i, f] of lst.entries()) {
    st.innerHTML = `Enviando ${i + 1} de ${lst.length}: <b>${esc(f.name)}</b>…`;
    if (f.size > 15 * 1024 * 1024) { toast(`${f.name}: maior que 15 MB.`, 'erro'); continue; }
    try {
      const b64 = await lerBase64(f);
      const r = await api(`/ia/agentes/${S.iac.codigo}/documentos`, { metodo: 'POST', corpo: { nome: f.name, tipo: f.type, base64: b64 } });
      ok++; toast(`${f.name}: ${r.trechos} trecho(s) indexado(s).`, 'ok');
    } catch (e) { toast(`${f.name}: ${e.message}`, 'erro'); }
  }
  st.textContent = '';
  if (ok) iacRecarregar('conhecimento');
}
async function iacTexto() {
  await chamar(() => api(`/ia/agentes/${S.iac.codigo}/documentos`, { metodo: 'POST', corpo: { titulo: val('kTit'), texto: val('kTxt') } }));
  toast('Conhecimento adicionado à base.', 'ok'); iacRecarregar('conhecimento');
}
async function iacGuia() { await chamar(() => api(`/ia/agentes/${S.iac.codigo}/guia`, { metodo: 'POST' })); toast('Guia da área reindexado.', 'ok'); iacRecarregar('conhecimento'); }
async function iacVerDoc(id) {
  const d = await chamar(() => api(`/ia/documentos/${id}`));
  abrirModal(esc(d.titulo), `<div class="mini" style="margin-bottom:8px">${d.trechos} trecho(s) indexado(s)${d.truncado ? ' · exibindo o início do texto' : ''}</div>
  ${d.origem === 'texto' ? `<input class="inp" id="edTit" value="${esc(d.titulo)}"><textarea class="inp" id="edTxt" style="min-height:300px;margin-top:8px">${esc(d.texto)}</textarea><div style="display:flex;gap:8px;margin-top:10px"><button class="btn red" onclick="iacSalvarDoc(${id})">Salvar e reindexar</button><button class="btn ghost" onclick="fecharModal()">Fechar</button></div>`
    : `<pre class="ia-pre">${esc(d.texto)}</pre>`}`, true);
}
async function iacSalvarDoc(id) { await chamar(() => api(`/ia/documentos/${id}`, { metodo: 'PATCH', corpo: { titulo: val('edTit'), texto: val('edTxt') } })); fecharModal(); toast('Conhecimento atualizado.', 'ok'); iacRecarregar('conhecimento'); }
async function iacOriginal(id) {
  const r = await chamar(() => api(`/ia/documentos/${id}/original`));
  if (r.url) { window.open(r.url, '_blank'); return; }
  const bin = atob(r.base64); const u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([u8])); a.download = r.nome; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}
async function iacAtivoDoc(id, ativo) { await chamar(() => api(`/ia/documentos/${id}`, { metodo: 'PATCH', corpo: { ativo } })); iacRecarregar('conhecimento'); }
function iacExcluirDoc(id) {
  abrirModal('Excluir conhecimento', `<p style="margin-top:0">O arquivo e todos os trechos indexados serão apagados. A IA deixa de usar este conteúdo. Deseja excluir?</p><div style="display:flex;gap:8px"><button class="btn red" onclick="iacExcluirDocOk(${id})">Excluir</button><button class="btn ghost" onclick="fecharModal()">Cancelar</button></div>`);
}
async function iacExcluirDocOk(id) { await chamar(() => api(`/ia/documentos/${id}`, { metodo: 'DELETE' })); fecharModal(); toast('Conhecimento excluído.', 'ok'); iacRecarregar('conhecimento'); }

// ---------- aprendizado ----------
async function iacApr(id, status) {
  await chamar(() => api(`/ia/aprendizados/${id}`, { metodo: 'PATCH', corpo: { status, conteudo: val('apr_' + id) } }));
  toast(status === 'aprovado' ? 'Aprendizado aprovado: a IA já usa nas próximas respostas.' : 'Item descartado.', 'ok'); iacRecarregar('aprendizado');
}
async function iacAprExcluir(id) { await chamar(() => api(`/ia/aprendizados/${id}`, { metodo: 'DELETE' })); toast('Aprendizado removido.', 'ok'); iacRecarregar('aprendizado'); }
async function iacFaq() {
  await chamar(() => api(`/ia/agentes/${S.iac.codigo}/aprendizados`, { metodo: 'POST', corpo: { tipo: 'faq', pergunta: val('nfP'), conteudo: val('nfR') } }));
  toast('A IA aprendeu esta resposta.', 'ok'); iacRecarregar('aprendizado');
}

// ================= CONFIGURAÇÕES → INTELIGÊNCIA ARTIFICIAL =================
export async function abaIAConfig() {
  const d = await api('/ia/agentes');
  return `<div class="card p"><div class="sect-title">Agentes de IA</div><div class="sect-sub">Um agente por área + o Assistente Milla geral. Cada área sobe o próprio conteúdo e valida o que a IA aprende.</div>
  <div class="grid cards-3" style="margin-top:10px">${d.agentes.map(a => `<div class="ia-cardag"><div style="display:flex;gap:10px;align-items:center"><div class="ia-avg sm" style="background:${a.grad || 'linear-gradient(135deg,#C8102E,#1D4ED8)'}">${a.codigo === 'geral' ? 'M' : '✨'}</div><div style="flex:1;min-width:0"><b style="font-size:13.5px">${esc(a.nome)}</b><div class="mini">${esc(a.area_nome || 'Todas as áreas')}</div></div></div>
    <div style="display:flex;gap:6px;flex-wrap:wrap;margin:10px 0">${a.provedor_ok && a.ativo && a.modelo ? `<span class="tag green">${esc(nomeProv(d.provedores, a.provedor).split(' (')[0])} · ${esc(a.modelo)}</span>` : '<span class="tag amber">Modo busca</span>'}<span class="tag gray">${a.documentos} conteúdo(s)</span><span class="tag blue">${a.aprendizados} aprendizado(s)</span>${a.pendentes ? `<span class="tag red">${a.pendentes} pendente(s)</span>` : ''}</div>
    <div class="between"><span class="mini">${a.perguntas_30d} pergunta(s) em 30 dias</span>${a.pode_configurar ? `<button class="linkbtn" onclick="abrirConfigIA('${a.codigo}')">Configurar →</button>` : ''}</div></div>`).join('')}</div></div>
  <div class="card p" style="margin-top:16px"><div class="sect-title">Provedores de IA</div><div class="sect-sub">Cadastre a chave uma vez por provedor; cada agente escolhe o provedor e o modelo que vai usar</div>
  <div style="overflow-x:auto"><table><thead><tr><th>Provedor</th><th>Modelos sugeridos</th><th>Chave</th><th>Agentes usando</th>${d.pode_provedores ? '<th></th>' : ''}</tr></thead><tbody>
  ${d.provedores.map(p => `<tr><td><b>${esc(p.nome)}</b>${p.site ? `<div class="mini">${esc(p.site)}</div>` : ''}</td><td class="mini">${esc(p.modelos.slice(0, 3).join(', ') || 'informe o modelo')}</td><td><span class="tag ${p.configurado ? 'green' : 'gray'}">${p.configurado ? `✓ ${p.chave_final ? '••••' + esc(p.chave_final) : 'configurado'}` : 'Não cadastrada'}</span></td><td>${d.agentes.filter(a => a.provedor === p.codigo).length}</td>${d.pode_provedores ? `<td><button class="linkbtn" onclick="cfgChaveModal('${p.codigo}')">${p.configurado ? 'Trocar' : 'Cadastrar'} chave</button></td>` : ''}</tr>`).join('')}
  </tbody></table></div><div class="mini" style="margin-top:8px">As chaves ficam cifradas no banco e nunca voltam para a tela. Sem chave, os agentes respondem em modo busca (sem custo).</div></div>`;
}
function cfgChaveModal(codigo) {
  const p = (S.iaProvs || []).find(x => x.codigo === codigo);
  api('/ia/provedores').then(provs => {
    S.iaProvs = provs; const pp = provs.find(x => x.codigo === codigo);
    S.iac = null;
    abrirModal('Chave do provedor', chaveHTML(pp, true).replace('class="card p" style="margin-top:16px"', 'style=""'));
  }).catch(e => toast(e.message, 'erro'));
  return p;
}

Object.assign(window, { iaEnviar, iaPergunta, iaNova, iaFeedback, iaFeedbackEnviar, iaSelecionar, abrirConfigIA, iacAba, iacSet, iacTraco, iacProvedor, iacSalvar, iacChave, iacChaveRemover, iacChaveRemoverOk,
  iacModelosVivo, iacTestar, iacArquivos, iacTexto, iacGuia, iacVerDoc, iacSalvarDoc, iacOriginal, iacAtivoDoc, iacExcluirDoc, iacExcluirDocOk, iacApr, iacAprExcluir, iacFaq, cfgChaveModal });
