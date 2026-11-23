// Arquivos (0.9.0): anexos em ações, checklists salvos, reuniões do comitê e direto na área,
// com a aba "Arquivos" de cada área listando tudo — origem, quem incluiu, inclusão e alteração.
import './arquivos.css';
import { S, api, esc, abrirModal, fecharModal, toast, chamar, pode } from './nucleo.js';
import { sessao } from '../api.js';

const BASE = import.meta.env.VITE_API_URL || '/api';
const ACEITA = 'image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.csv,.ppt,.pptx,.txt,.odt,.ods,.odp,.rtf,.zip';
const ORIGEM = { acao: ['Plano de ação', '🗂️'], checklist: ['Checklist', '✅'], comite: ['Comitê (geral)', '👥'], area: ['Arquivos da área', '📁'], curso: ['Universidade', '🎓'], ia: ['Base da IA', '✨'] };

export function categoria(mime = '', nome = '') {
  const ext = (nome.split('.').pop() || '').toLowerCase();
  if (/^image\//.test(mime)) return ['Imagem', '🖼️'];
  if (/^video\/|^link\//.test(mime)) return ['Vídeo', '🎬'];
  if (/^audio\//.test(mime)) return ['Áudio', '🎧'];
  if (/pdf/.test(mime) || ext === 'pdf') return ['PDF', '📕'];
  if (/sheet|excel|csv/.test(mime) || ['xls', 'xlsx', 'csv', 'ods'].includes(ext)) return ['Planilha', '📊'];
  if (/presentation|powerpoint/.test(mime) || ['ppt', 'pptx', 'odp'].includes(ext)) return ['Apresentação', '📽️'];
  if (/word|document|rtf|text\//.test(mime) || ['doc', 'docx', 'odt', 'txt', 'rtf', 'md'].includes(ext)) return ['Documento', '📄'];
  return ['Outro', '📎'];
}
const tam = b => (!b ? '—' : b < 1024 ? b + ' B' : b < 1048576 ? (b / 1024).toFixed(0) + ' KB' : b < 1073741824 ? (b / 1048576).toFixed(1).replace('.', ',') + ' MB' : (b / 1073741824).toFixed(2).replace('.', ',') + ' GB');
const dh = d => (d ? new Date(d).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—');
const podeMexer = a => a.fonte === 'anexo' && (a.enviado_por === S.D.usuario.id || pode('areas', 2) || pode('rbac', 2));

// ---------- envio (vários arquivos, com progresso) ----------
function enviarUm(f, ctx, onProg) {
  return new Promise((ok, falha) => {
    const q = new URLSearchParams({ origem_tipo: ctx.tipo, origem_id: ctx.id || '', area: ctx.area || '', nome: f.name, tipo: f.type || 'application/octet-stream' });
    const x = new XMLHttpRequest();
    x.open('POST', `${BASE}/arquivos?${q}`);
    x.setRequestHeader('Content-Type', 'application/octet-stream');
    const tk = sessao.obter()?.token; if (tk) x.setRequestHeader('Authorization', `Bearer ${tk}`);
    x.upload.onprogress = e => e.lengthComputable && onProg(e.loaded / e.total);
    x.onload = () => { let r = {}; try { r = JSON.parse(x.responseText); } catch {} x.status < 300 ? ok(r) : falha(new Error(r.erro || 'Falha no envio.')); };
    x.onerror = () => falha(new Error('Conexão interrompida no envio.'));
    x.send(f);
  });
}
async function enviar(files, ctx, alvoProg, depois) {
  const lista = [...files]; if (!lista.length) return;
  let feitos = 0, erros = 0;
  for (const f of lista) {
    try {
      await enviarUm(f, ctx, p => { if (alvoProg) alvoProg.innerHTML = `<div class="arq-prog"><span>Enviando ${esc(f.name)} (${feitos + 1}/${lista.length})</span><div class="progress"><i style="width:${Math.round(p * 100)}%"></i></div></div>`; });
      feitos++;
    } catch (e) { erros++; toast(`${f.name}: ${e.message}`, 'erro'); }
  }
  if (alvoProg) alvoProg.innerHTML = '';
  if (feitos) toast(feitos === 1 ? 'Arquivo anexado.' : `${feitos} arquivos anexados.`, 'ok');
  depois?.();
}

// ---------- visualizar / baixar ----------
async function linkDe(a, baixar) {
  if (a.fonte === 'video') return (await api(`/univ/videos/${a.id.split(':')[1]}/fonte`)).url;
  if (a.fonte === 'ia') { const r = await api(`/ia/documentos/${a.id.split(':')[1]}/original`); return r.url || (r.base64 && URL.createObjectURL(new Blob([Uint8Array.from(atob(r.base64), c => c.charCodeAt(0))]))); }
  const r = await api(`/arquivos/${a.id}/url${baixar ? '?baixar=1' : ''}`);
  return r.url || URL.createObjectURL(new Blob([Uint8Array.from(atob(r.base64 || ''), c => c.charCodeAt(0))], { type: r.mime }));
}
async function arqVer(json) {
  const a = JSON.parse(decodeURIComponent(json));
  const url = await chamar(() => linkDe(a));
  if (!url) return;
  const [cat, icone] = categoria(a.mime, a.nome);
  const corpo = cat === 'Imagem' ? `<img src="${url}" class="arq-prev-img" alt="">`
    : cat === 'Vídeo' && !/^link\//.test(a.mime) ? `<video src="${url}" controls autoplay class="arq-prev-vid"></video>`
    : cat === 'Áudio' ? `<audio src="${url}" controls autoplay style="width:100%"></audio>`
    : cat === 'PDF' ? `<iframe src="${url}" class="arq-prev-pdf"></iframe>`
    : `<div class="vazio" style="padding:30px">${icone} Este tipo de arquivo (${esc(cat)}) não tem pré-visualização no navegador. Use <b>Baixar</b> para abrir no seu computador.</div>`;
  abrirModal(esc(a.nome), `${corpo}${a.descricao ? `<div class="mini" style="margin-top:8px">${esc(a.descricao)}</div>` : ''}
    <div class="between" style="margin-top:12px;flex-wrap:wrap;gap:8px"><span class="mini">${esc(ORIGEM[a.origem_tipo]?.[0] || a.origem_tipo)} · ${esc(a.origem_titulo || '')} · ${tam(a.tamanho)} · incluído por ${esc(a.enviado_por_nome || '—')} em ${dh(a.criado_em)}</span>
    <div style="display:flex;gap:8px"><button class="btn ghost" onclick="fecharModal()">Fechar</button><button class="btn red" onclick="arqBaixar('${json}')">⬇ Baixar</button></div></div>`, true);
  document.querySelector('#modalRoot .modal')?.classList.add('modal-xl');
}
async function arqBaixar(json) {
  const a = JSON.parse(decodeURIComponent(json));
  const url = await chamar(() => linkDe(a, true)); if (!url) return;
  const l = document.createElement('a'); l.href = url; l.download = a.nome; l.target = '_blank'; l.rel = 'noopener'; document.body.appendChild(l); l.click(); l.remove();
}
async function arqRenomear(id, json) {
  const a = JSON.parse(decodeURIComponent(json));
  abrirModal('Editar arquivo', `<label class="lbl">Nome</label><input class="inp" id="arqNome" value="${esc(a.nome)}"><label class="lbl" style="margin-top:10px">Descrição</label><textarea class="inp" id="arqDesc" placeholder="Do que se trata este arquivo">${esc(a.descricao || '')}</textarea>
    <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:12px"><button class="btn ghost" onclick="fecharModal()">Cancelar</button><button class="btn red" onclick="arqRenomearOk(${id})">Salvar</button></div>`);
}
async function arqRenomearOk(id) {
  await chamar(() => api(`/arquivos/${id}`, { metodo: 'PATCH', corpo: { nome: document.getElementById('arqNome').value, descricao: document.getElementById('arqDesc').value } }));
  fecharModal(); toast('Arquivo atualizado.', 'ok'); atualizarTudo();
}
async function arqExcluir(id, nome) {
  if (!confirm(`Excluir o arquivo "${decodeURIComponent(nome)}"? Ele sai das listas (a administração pode restaurar).`)) return;
  await chamar(() => api(`/arquivos/${id}`, { metodo: 'DELETE' }));
  toast('Arquivo excluído.', 'ok'); atualizarTudo();
}
const acoesArq = a => { const j = encodeURIComponent(JSON.stringify(a)); return `<button class="btn ghost sm" onclick="arqVer('${j}')" title="Visualizar">👁</button><button class="btn ghost sm" onclick="arqBaixar('${j}')" title="Baixar">⬇</button>${podeMexer(a) ? `<button class="btn ghost sm" onclick="arqRenomear(${a.id},'${j}')" title="Renomear / descrever">✎</button><button class="btn ghost sm" style="color:var(--red)" onclick="arqExcluir(${a.id},'${encodeURIComponent(a.nome)}')" title="Excluir">✕</button>` : ''}`; };

// ---------- bloco de anexos (ação, checklist, reunião) ----------
const blocos = new Map();
export function anexosHTML(tipo, id, area) {
  const k = `anx_${tipo}_${String(id).replace(/\W/g, '')}`;
  blocos.set(k, { tipo, id: String(id), area });
  setTimeout(() => carregarBloco(k), 0);
  return `<div class="arq-bloco" id="${k}" ondragover="event.preventDefault();this.classList.add('drag')" ondragleave="this.classList.remove('drag')" ondrop="event.preventDefault();this.classList.remove('drag');arqSoltar('${k}',event.dataTransfer.files)">
    <div class="between"><b style="font-size:13px">📎 Anexos <span class="mini" id="${k}_n"></span></b>
    <label class="btn ghost sm" style="cursor:pointer">+ Anexar arquivos<input type="file" multiple accept="${ACEITA}" hidden onchange="arqSoltar('${k}',this.files);this.value=''"></label></div>
    <div id="${k}_p"></div><div id="${k}_l" class="arq-lista"><div class="mini">Carregando…</div></div>
    <div class="mini" style="margin-top:6px">Arraste arquivos para cá: imagem, vídeo, áudio, PDF, Word, Excel, PowerPoint (até 500 MB cada).</div></div>`;
}
async function carregarBloco(k) {
  const b = blocos.get(k), el = document.getElementById(k + '_l'); if (!b || !el) return;
  const l = await api(`/arquivos/origem/${b.tipo}/${encodeURIComponent(b.id)}`).catch(() => []);
  document.getElementById(k + '_n').textContent = l.length ? `(${l.length})` : '';
  el.innerHTML = l.length ? l.map(a => { const [cat, ico] = categoria(a.mime, a.nome); return `<div class="arq-item"><span class="arq-ico">${ico}</span><div style="flex:1;min-width:0"><div class="arq-nome" onclick="arqVer('${encodeURIComponent(JSON.stringify(a))}')">${esc(a.nome)}</div><div class="mini">${cat} · ${tam(a.tamanho)} · ${esc(a.enviado_por_nome || '')} · ${dh(a.criado_em)}${a.atualizado_em ? ` · alterado ${dh(a.atualizado_em)}` : ''}</div></div><span class="arq-bts">${acoesArq(a)}</span></div>`; }).join('') : '<div class="mini">Nenhum anexo ainda.</div>';
}
function arqSoltar(k, files) { const b = blocos.get(k); enviar(files, b, document.getElementById(k + '_p'), () => (k === 'arqTabUp' ? window.renderAreaTabAtual?.() : carregarBloco(k))); }
function atualizarTudo() {
  blocos.forEach((_, k) => document.getElementById(k) ? carregarBloco(k) : blocos.delete(k));
  if (S.cur?.tab === 'arquivos' && document.getElementById('arqTab')) window.renderAreaTabAtual?.();
}

// ---------- aba Arquivos da área ----------
S.abasArea.arquivos = async (id, a) => {
  S.arq = { area: id, lista: await api(`/arquivos/area/${id}`), f: S.arq?.area === id ? S.arq.f : { origem: '', cat: '', busca: '' } };
  blocos.set('arqTabUp', { tipo: 'area', id: '', area: id });
  return `<div id="arqTab"><div class="page-head" style="margin-bottom:14px"><div><h1 style="font-size:18px">Arquivos · ${esc(a.nome)}</h1><p>Tudo o que foi anexado na área — plano de ação, checklists, comitê, cursos e base da IA — com origem, quem incluiu, inclusão e alteração.</p></div>
    <label class="btn red" style="cursor:pointer">+ Enviar arquivos<input type="file" multiple accept="${ACEITA}" hidden onchange="arqSoltar('arqTabUp',this.files);this.value=''"></label></div>
    <div class="arq-drop" ondragover="event.preventDefault();this.classList.add('drag')" ondragleave="this.classList.remove('drag')" ondrop="event.preventDefault();this.classList.remove('drag');arqSoltar('arqTabUp',event.dataTransfer.files)">Arraste arquivos para cá para guardá-los na área <span class="mini">(imagem, vídeo, áudio, PDF, Word, Excel, PowerPoint · até 500 MB cada)</span><div id="arqTabUp_p"></div></div>
    <div id="arqCorpo">${corpoAba()}</div></div>`;
};
S.abasDepois.arquivos = () => { blocos.set('arqTabUp', { tipo: 'area', id: '', area: S.arq.area }); };
function filtrada() {
  const { lista, f } = S.arq, b = f.busca.toLowerCase();
  return lista.filter(a => (!f.origem || a.origem_tipo === f.origem) && (!f.cat || categoria(a.mime, a.nome)[0] === f.cat) && (!b || `${a.nome} ${a.descricao || ''} ${a.origem_titulo || ''} ${a.enviado_por_nome || ''}`.toLowerCase().includes(b)));
}
function corpoAba() {
  const { lista, f } = S.arq, l = filtrada();
  const porCat = {}; lista.forEach(a => { const c = categoria(a.mime, a.nome)[0]; porCat[c] = (porCat[c] || 0) + 1; });
  const total = lista.reduce((s, a) => s + Number(a.tamanho || 0), 0);
  const kpis = [['Arquivos', lista.length], ['Espaço usado', tam(total)], ...['Imagem', 'Vídeo', 'PDF', 'Planilha', 'Documento', 'Áudio'].filter(c => porCat[c]).map(c => [c, porCat[c]])];
  return `<div class="arq-kpis">${kpis.map(k => `<div class="arq-kpi"><b>${k[1]}</b><span>${k[0]}</span></div>`).join('')}</div>
  <div class="card p" style="margin-top:14px"><div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px">
    <select class="inp" style="width:auto" onchange="arqFiltro('origem',this.value)"><option value="">Todas as origens</option>${Object.entries(ORIGEM).map(([k, v]) => `<option value="${k}" ${f.origem === k ? 'selected' : ''}>${v[0]}</option>`).join('')}</select>
    <select class="inp" style="width:auto" onchange="arqFiltro('cat',this.value)"><option value="">Todos os tipos</option>${['Imagem', 'Vídeo', 'Áudio', 'PDF', 'Planilha', 'Documento', 'Apresentação', 'Outro'].map(c => `<option ${f.cat === c ? 'selected' : ''}>${c}</option>`).join('')}</select>
    <input class="inp" style="flex:1;min-width:200px" placeholder="Buscar por nome, descrição, origem ou pessoa…" value="${esc(f.busca)}" oninput="arqFiltro('busca',this.value,1)"></div>
  ${l.length ? `<div style="overflow-x:auto"><table class="arq-tab"><thead><tr><th>Arquivo</th><th>Origem</th><th>Incluído por</th><th>Inclusão</th><th>Alteração</th><th style="text-align:right">Ações</th></tr></thead><tbody>
  ${l.map(a => { const [cat, ico] = categoria(a.mime, a.nome), o = ORIGEM[a.origem_tipo] || [a.origem_tipo, '📎']; return `<tr>
    <td><div style="display:flex;gap:10px;align-items:center"><span class="arq-ico">${ico}</span><div style="min-width:0"><div class="arq-nome" onclick="arqVer('${encodeURIComponent(JSON.stringify(a))}')">${esc(a.nome)}</div><div class="mini">${cat} · ${tam(a.tamanho)}${a.descricao ? ' · ' + esc(a.descricao) : ''}</div></div></div></td>
    <td><span class="tag gray">${o[1]} ${esc(o[0])}</span><div class="mini arq-link" onclick="arqOrigem('${a.origem_tipo}','${esc(a.origem_id || '')}','${a.area_id || S.arq.area}')">${esc(a.origem_titulo || '')}</div></td>
    <td>${esc(a.enviado_por_nome || '—')}</td><td class="mini">${dh(a.criado_em)}</td><td class="mini">${a.atualizado_em ? `${dh(a.atualizado_em)}<div>${esc(a.atualizado_por || '')}</div>` : '—'}</td>
    <td style="text-align:right;white-space:nowrap">${acoesArq(a)}</td></tr>`; }).join('')}</tbody></table></div>` : `<div class="vazio" style="padding:24px">${lista.length ? 'Nenhum arquivo com este filtro.' : 'Nenhum arquivo ainda. Anexe nas ações, checklists e reuniões, ou envie aqui.'}</div>`}</div>`;
}
let tBusca;
function arqFiltro(k, v, atraso) { S.arq.f[k] = v; clearTimeout(tBusca); tBusca = setTimeout(() => { const el = document.getElementById('arqCorpo'); if (el) { const foco = document.activeElement?.placeholder; el.innerHTML = corpoAba(); if (foco) { const i = [...el.querySelectorAll('input')].find(x => x.placeholder === foco); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } } } }, atraso ? 250 : 0); }
function arqOrigem(tipo, id, area) {
  if (tipo === 'acao') { window.openArea(area, 'acao'); setTimeout(() => window.openTask(Number(id)), 500); }
  else if (tipo === 'checklist') window.verAplicacao(Number(id));
  else if (tipo === 'comite') window.cmAbrir(Number(id));
  else if (tipo === 'curso') window.openArea(area, 'treino');
  else if (tipo === 'ia') window.openArea(area, 'ia');
}

// ---------- ganchos: ação, checklist salvo e reunião do comitê ----------
const taskOrig = window.openTask;
window.openTask = async tid => {
  await taskOrig(tid);
  const corpo = document.querySelector('#modalRoot .mbd');
  const com = [...(corpo?.querySelectorAll('div') || [])].find(d => /^Comentários e evidências/.test(d.textContent.trim()) && d.children.length === 0);
  const html = anexosHTML('acao', tid, S.cur?.area);
  if (com) com.insertAdjacentHTML('beforebegin', html); else corpo?.insertAdjacentHTML('beforeend', html);
};
const relOrig = window.verAplicacaoGuia;
window.verAplicacaoGuia = async apId => {
  await relOrig(apId);
  document.querySelector('#modalRoot .no-print')?.insertAdjacentHTML('beforebegin', `<div class="no-print">${anexosHTML('checklist', apId, S.cur?.area)}</div>`);
};
const depoisReuniao = S.depois.reuniao;
S.depois.reuniao = () => {
  depoisReuniao?.();
  if (S.cm?.id) document.getElementById('view')?.insertAdjacentHTML('beforeend', `<div class="card p" style="margin-top:16px">${anexosHTML('comite', S.cm.id, null)}</div>`);
};

Object.assign(window, { arqVer, arqBaixar, arqRenomear, arqRenomearOk, arqExcluir, arqSoltar, arqFiltro, arqOrigem });
