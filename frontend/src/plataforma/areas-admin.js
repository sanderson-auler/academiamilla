// Cadastro de áreas (0.6.0): ativar/desativar, criar e editar identidade, abas visíveis e chips do card.
// Também aplica, nas telas já existentes, as abas e chips configurados por área.
import { S, api, esc, ic, head, toast, chamar, abrirModal, fecharModal, go, trilha, marcarAtivo, recarregarBase, montarMenu, dataHoraBR, pode } from './nucleo.js';

const NOMES_ABAS = { visao: 'Visão Geral', kpis: 'Indicadores', metas: 'Metas', acao: 'Plano de Ação', check: 'Checklists', treino: 'Treinamentos', rotina: 'Rotina & Atividades', guia: 'Guia', ia: 'Assistente IA', arquivos: 'Arquivos' };
const NOMES_CHIPS = { metas: 'Metas por marca', kpis: 'Nº de indicadores', check: 'Nº de checklists', cursos: 'Nº de cursos' };
const TODAS_ABAS = Object.keys(NOMES_ABAS), TODOS_CHIPS = Object.keys(NOMES_CHIPS);
const abasDe = a => (Array.isArray(a?.abas) && a.abas.length ? a.abas : TODAS_ABAS);
const chipsDe = a => (Array.isArray(a?.chips) ? a.chips : TODOS_CHIPS);
const podeGerirAreas = () => pode('rbac', 2) || !!S.D?.usuario?.area_id;
S.ar = S.ar || { d: null, ed: null };

// ---------- abas visíveis no workspace da área ----------
const openAreaOriginal = window.openArea;
window.openArea = (id, aba) => {
  const a = S.D.areas[id];
  if (!a) { toast('Esta área está inativa.', 'erro'); return; }
  const vis = abasDe(a);
  openAreaOriginal(id, vis.includes(aba || 'visao') ? aba : vis[0]);
  aplicarAbas(id);
};
function aplicarAbas(id) {
  const vis = abasDe(S.D.areas[id]);
  document.querySelectorAll('#areaSub button').forEach(b => {
    const k = (b.getAttribute('onclick') || '').match(/switchAreaTab\('(\w+)'\)/)?.[1];
    if (k && !vis.includes(k)) b.style.display = 'none';
  });
}
const switchOriginal = window.switchAreaTab;
window.switchAreaTab = t => { const vis = abasDe(S.D.areas[S.cur.area]); switchOriginal(vis.includes(t) ? t : vis[0]); };
// Atalhos da Visão Geral que apontam para abas ocultas.
const depoisVisao = S.abasDepois.visao;
S.abasDepois.visao = (id, a) => {
  if (depoisVisao) depoisVisao(id, a);
  const vis = abasDe(a);
  document.querySelectorAll('#areaBody [onclick*="switchAreaTab"]').forEach(el => {
    const k = (el.getAttribute('onclick') || '').match(/switchAreaTab\('(\w+)'\)/)?.[1];
    if (k && !vis.includes(k)) el.style.display = 'none';
  });
};

// ---------- tela Áreas: chips por área e botão de gestão ----------
const depoisAreas = S.depois.areas;
S.depois.areas = () => {
  if (depoisAreas) depoisAreas();
  document.querySelectorAll('#view .area-card').forEach(card => {
    const id = (card.getAttribute('onclick') || '').match(/openArea\('([\w-]+)'\)/)?.[1];
    const chips = chipsDe(S.D.areas[id]);
    card.querySelectorAll('.chips .chip-min').forEach((c, i) => { if (!chips.includes(TODOS_CHIPS[i])) c.style.display = 'none'; });
  });
  const ph = document.querySelector('#view .page-head > div:last-child');
  if (ph && podeGerirAreas() && !document.getElementById('btnGerAreas')) ph.innerHTML = `<button class="btn" id="btnGerAreas" onclick="go('areasAdm')">⚙️ Gerenciar áreas</button>`;
};

// ---------- tela de gestão ----------
S.telas.areasAdm = async () => {
  const d = await api('/cadastro-areas');
  S.ar.d = d;
  const ativas = d.areas.filter(a => a.ativo), inativas = d.areas.filter(a => !a.ativo);
  const linha = (a, i, arr) => `<div class="ar-row ${a.ativo ? '' : 'off'}">
    ${d.admin && a.ativo ? `<div class="ar-ord"><button class="btn ghost sm" onclick="arMover('${a.id}',-1)" ${i ? '' : 'disabled'}>↑</button><button class="btn ghost sm" onclick="arMover('${a.id}',1)" ${i < arr.length - 1 ? '' : 'disabled'}>↓</button></div>` : '<div class="ar-ord"></div>'}
    <div class="ar-ic" style="background:${a.grad}">${ic(a.ic)}</div>
    <div style="flex:1;min-width:0"><div class="ttl">${esc(a.nome)} ${a.ativo ? '' : '<span class="tag gray">Inativa</span>'}</div>
      <div class="meta">${esc(a.cargo || '')}${a.resp ? ' · ' + esc(a.resp) : ''} · ${a.usuarios} usuários · ${a.acoes_abertas} ações abertas · ${a.cursos} cursos · ${abasDe(a).length}/${TODAS_ABAS.length} abas</div></div>
    ${d.admin ? `<label class="ar-tg" title="${a.ativo ? 'Desativar' : 'Reativar'}"><input type="checkbox" ${a.ativo ? 'checked' : ''} onchange="arAtivo('${a.id}',this.checked)"><span></span></label>` : ''}
    <button class="btn" onclick="arEditar('${a.id}')">Editar</button></div>`;
  return `${head('Cadastro de áreas', 'Ative, desative, crie e configure as áreas. Desativar só esconde a área — nada é apagado e tudo volta ao reativar.', `<div style="display:flex;gap:8px"><button class="btn" onclick="go('areas')">← Áreas</button>${d.admin ? '<button class="btn red" onclick="arEditar()">+ Nova área</button>' : ''}</div>`)}
  <div class="card p"><div class="sect-title">Áreas ativas <span class="mini">(${ativas.length})</span></div><div class="sect-sub">A ordem abaixo é a ordem do menu e da tela Áreas</div>${ativas.map(linha).join('')}</div>
  ${inativas.length ? `<div class="card p" style="margin-top:14px"><div class="sect-title">Áreas inativas <span class="mini">(${inativas.length})</span></div><div class="sect-sub">Ocultas do menu, das telas e da busca · dados preservados</div>${inativas.map(linha).join('')}</div>` : ''}`;
};
S.depois.areasAdm = () => { trilha('Academia Milla 360 · <a onclick="go(\'areas\')">Áreas</a> · <b>Cadastro de áreas</b>'); marcarAtivo('areas'); };

async function aposMudanca(msg) {
  toast(msg, 'ok');
  await recarregarBase();
  try { montarMenu(); } catch {}
  go('areasAdm');
}
window.arAtivo = async (id, ativo) => {
  try { await api(`/cadastro-areas/${id}/ativo`, { metodo: 'PATCH', corpo: { ativo } }); }
  catch (e) { toast(e.message, 'erro'); return go('areasAdm'); }
  aposMudanca(ativo ? 'Área reativada.' : 'Área desativada — os dados continuam guardados.');
};
window.arMover = async (id, dir) => {
  const ids = S.ar.d.areas.filter(a => a.ativo).map(a => a.id);
  const i = ids.indexOf(id), j = i + dir; if (j < 0 || j >= ids.length) return;
  [ids[i], ids[j]] = [ids[j], ids[i]];
  await chamar(() => api('/cadastro-areas/ordem/salvar', { metodo: 'PUT', corpo: { ids } }));
  aposMudanca('Ordem atualizada.');
};

// ---------- editor ----------
const PALETA = ['#0B3D4D', '#13586E', '#1D4ED8', '#7A2E8E', '#0E7C66', '#C8102E', '#E0A82E', '#5B6B73', '#B45309', '#0F766E'];
window.arEditar = id => {
  const d = S.ar.d, a = id ? d.areas.find(x => x.id === id) : null;
  S.ar.ed = a ? { ...a, abas: [...abasDe(a)], chips: [...chipsDe(a)] } : { nome: '', resp: '', cargo: '', tag: '', papel: '', cor: '#13586E', ic: 'grid', abas: [...TODAS_ABAS], chips: [...TODOS_CHIPS] };
  const e = S.ar.ed, adm = d.admin;
  abrirModal(a ? `Editar área · ${esc(a.nome)}` : 'Nova área', `<div class="ar-ed"><div>
    <div class="sect-title" style="font-size:13px">Identidade</div>
    <div class="form-grid" style="grid-template-columns:1fr 1fr">
      <div class="full"><label class="lbl">Nome da área</label><input class="inp" id="arNome" value="${esc(e.nome)}" oninput="arPrev()" placeholder="Ex.: Gestão de Pessoas"></div>
      <div><label class="lbl">Responsável</label><input class="inp" id="arResp" list="arUsuarios" value="${esc(e.resp || '')}" oninput="arPrev()" placeholder="Nome do responsável"><datalist id="arUsuarios">${d.usuarios.map(u => `<option value="${esc(u.nome)}">${esc(u.cargo || '')}</option>`).join('')}</datalist></div>
      <div><label class="lbl">Cargo do responsável</label><input class="inp" id="arCargo" value="${esc(e.cargo || '')}" oninput="arPrev()" placeholder="Ex.: Gerente de RH"></div>
      <div class="full"><label class="lbl">Frase do card (slogan)</label><input class="inp" id="arTag" value="${esc(e.tag || '')}" oninput="arPrev()" placeholder="Ex.: Pessoas que fazem a loja vender"></div>
      <div class="full"><label class="lbl">Papel da função</label><textarea class="inp" id="arPapel" rows="2" placeholder="O que a área garante no dia a dia">${esc(e.papel || '')}</textarea></div>
    </div>
    <label class="lbl">Cor</label><div class="ar-cores">${PALETA.map(c => `<button type="button" class="ar-cor ${c === e.cor ? 'on' : ''}" style="background:${c}" onclick="arCor('${c}')"></button>`).join('')}<input type="color" id="arCorLivre" value="${e.cor}" oninput="arCor(this.value)" title="Outra cor"></div>
    <label class="lbl">Ícone</label><div class="ar-icones">${d.icones.map(n => `<button type="button" class="ar-icb ${n === e.ic ? 'on' : ''}" onclick="arIcone('${n}')">${ic(n)}</button>`).join('')}</div>
    ${adm ? `<div class="sect-title" style="font-size:13px;margin-top:14px">Funcionalidades visíveis na área</div><div class="sect-sub">Desligar só esconde a aba — o conteúdo continua guardado</div>
    <div class="ar-chks">${TODAS_ABAS.map(k => `<label class="ar-chk"><input type="checkbox" ${e.abas.includes(k) ? 'checked' : ''} onchange="arLista('abas','${k}',this.checked)"> ${NOMES_ABAS[k]}</label>`).join('')}</div>
    <div class="sect-title" style="font-size:13px;margin-top:14px">Informações no card da área</div>
    <div class="ar-chks">${TODOS_CHIPS.map(k => `<label class="ar-chk"><input type="checkbox" ${e.chips.includes(k) ? 'checked' : ''} onchange="arLista('chips','${k}',this.checked)"> ${NOMES_CHIPS[k]}</label>`).join('')}</div>` : '<div class="mini" style="margin-top:12px">Abas e informações do card são definidas por quem tem acesso a Configurações.</div>'}
  </div><div><div class="sect-title" style="font-size:13px">Pré-visualização</div><div id="arPrev"></div>
    ${a?.atualizado_por ? `<div class="mini" style="margin-top:10px">Última alteração: ${esc(a.atualizado_por)} · ${dataHoraBR(a.atualizado_em)}</div>` : ''}
    ${!a ? '<div class="mini" style="margin-top:10px">A nova área já nasce com o seu Assistente IA. Guia, rotina, indicadores, checklists e cursos são preenchidos nas telas da própria área.</div>' : ''}</div></div>
  <div style="display:flex;gap:8px;margin-top:16px"><button class="btn red" onclick="arSalvar()">💾 ${a ? 'Salvar alterações' : 'Criar área'}</button><button class="btn ghost" onclick="fecharModal()">Cancelar</button></div>`, true);
  window.arPrev();
};
window.arCor = c => { S.ar.ed.cor = c; document.querySelectorAll('.ar-cor').forEach(b => b.classList.toggle('on', b.style.background && rgbHex(b.style.background) === c.toUpperCase())); const cl = document.getElementById('arCorLivre'); if (cl) cl.value = c; window.arPrev(); };
window.arIcone = n => { S.ar.ed.ic = n; document.querySelectorAll('.ar-icb').forEach(b => b.classList.toggle('on', b.getAttribute('onclick') === `arIcone('${n}')`)); window.arPrev(); };
window.arLista = (campo, k, on) => { const l = S.ar.ed[campo]; if (on && !l.includes(k)) l.push(k); if (!on) S.ar.ed[campo] = l.filter(x => x !== k); window.arPrev(); };
function rgbHex(rgb) { const m = rgb.match(/\d+/g); return m ? '#' + m.slice(0, 3).map(x => Number(x).toString(16).padStart(2, '0')).join('').toUpperCase() : ''; }
function escurecer(hex, f = 0.62) { const n = parseInt(hex.slice(1), 16), c = s => Math.round(((n >> s) & 255) * f).toString(16).padStart(2, '0'); return `#${c(16)}${c(8)}${c(0)}`; }
window.arPrev = () => {
  const e = S.ar.ed, v = id => document.getElementById(id)?.value || '';
  const g = e.grad && e.cor === (S.ar.d.areas.find(x => x.id === e.id)?.cor) ? e.grad : `linear-gradient(135deg,${e.cor},${escurecer(e.cor)})`;
  const chips = [['metas', 'Metas por marca'], ['kpis', 'indicadores'], ['check', 'checklists'], ['cursos', 'cursos']].filter(([k]) => e.chips.includes(k)).map(([k, t]) => `<span class="chip-min">${k === 'metas' ? t : '0 ' + t}</span>`).join('');
  document.getElementById('arPrev').innerHTML = `<div class="card area-card" style="cursor:default"><div class="hd" style="background:${g}"><div class="ic">${ic(e.ic)}</div><div><b style="display:block;font-size:15px">${esc(v('arNome') || 'Nome da área')}</b><small style="font-size:11.5px;opacity:.85">${esc(v('arCargo') || 'Cargo')} · ${esc(v('arResp') || 'Responsável')}</small></div></div>
    <div class="bd"><p style="margin:0;font-size:12.5px;color:var(--muted);line-height:1.5">${esc(v('arTag') || 'Frase do card')}</p><div class="chips">${chips}</div></div></div>
    <div class="ar-abasprev">${TODAS_ABAS.filter(k => e.abas.includes(k)).map(k => `<span>${NOMES_ABAS[k]}</span>`).join('')}</div>`;
};
window.arSalvar = async () => {
  const e = S.ar.ed, v = id => document.getElementById(id)?.value || '';
  const corpo = { nome: v('arNome'), resp: v('arResp'), cargo: v('arCargo'), tag: v('arTag'), papel: v('arPapel'), cor: e.cor, ic: e.ic, abas: e.abas, chips: e.chips };
  if (!corpo.nome.trim()) return toast('Informe o nome da área.', 'erro');
  if (!e.abas.length) return toast('Deixe pelo menos uma aba visível.', 'erro');
  if (e.id) await chamar(() => api(`/cadastro-areas/${e.id}`, { metodo: 'PUT', corpo }));
  else await chamar(() => api('/cadastro-areas', { metodo: 'POST', corpo }));
  fecharModal();
  aposMudanca(e.id ? 'Área atualizada.' : 'Área criada — ela já aparece no menu e na tela Áreas.');
};

const st = document.createElement('style');
st.textContent = `.ar-row{display:flex;align-items:center;gap:12px;padding:10px 4px;border-bottom:1px solid var(--line)}.ar-row:last-child{border-bottom:0}.ar-row.off{opacity:.6}
.ar-row .ttl{font-weight:700;font-size:14px}.ar-row .meta{font-size:12px;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ar-ord{display:flex;flex-direction:column;gap:2px;width:34px}.ar-ord .btn{padding:0 6px;line-height:18px}
.ar-ic{width:40px;height:40px;border-radius:11px;display:grid;place-items:center;color:#fff;flex:none}.ar-ic svg{width:20px;height:20px}
#app label.ar-tg,#modalRoot label.ar-tg{position:relative;display:inline-block;width:42px;height:24px;flex:none;cursor:pointer}.ar-tg input{opacity:0;width:0;height:0}
.ar-tg span{position:absolute;inset:0;background:#CBD5DB;border-radius:99px;transition:.2s}.ar-tg span:before{content:'';position:absolute;width:18px;height:18px;left:3px;top:3px;background:#fff;border-radius:50%;transition:.2s}
.ar-tg input:checked+span{background:#1F9D6B}.ar-tg input:checked+span:before{transform:translateX(18px)}
.ar-ed{display:grid;grid-template-columns:minmax(0,1.3fr) minmax(0,1fr);gap:20px}
.ar-cores{display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin:4px 0 6px}.ar-cor{width:26px;height:26px;border-radius:8px;border:2px solid #fff;box-shadow:0 0 0 1px var(--line);cursor:pointer}
.ar-cor.on{box-shadow:0 0 0 2px var(--ink)}#arCorLivre{width:34px;height:28px;border:1px solid var(--line);border-radius:8px;padding:0;background:#fff}
.ar-icones{display:flex;gap:6px;flex-wrap:wrap;margin:4px 0}.ar-icb{width:34px;height:34px;border-radius:9px;border:1px solid var(--line);background:#fff;display:grid;place-items:center;cursor:pointer;color:var(--petrol)}
.ar-icb.on{background:var(--petrol);color:#fff;border-color:var(--petrol)}.ar-icb svg{width:18px;height:18px}
.ar-chks{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-top:6px}
#modalRoot label.ar-chk{display:flex;flex-direction:row;gap:8px;align-items:center;padding:7px 9px;border:1px solid var(--line);border-radius:9px;cursor:pointer;font-size:13px}
#modalRoot label.ar-chk input{width:auto;margin:0;flex:none}
.ar-abasprev{display:flex;flex-wrap:wrap;gap:4px;margin-top:10px}.ar-abasprev span{font-size:11px;background:#EEF3F5;border-radius:99px;padding:3px 9px;color:#33464e}
@media (max-width:900px){.ar-ed{grid-template-columns:1fr}}`;
document.head.appendChild(st);
