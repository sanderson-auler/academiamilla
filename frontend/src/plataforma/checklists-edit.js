// Checklists editáveis (0.8.0): editor de seções e itens (incluir, alterar, excluir, reordenar),
// checklists salvos com filtro, edição, exportação para Excel e PDF com cabeçalho e rodapé sem quebra no meio dos itens.
import './checklists-edit.css';
import { S, api, esc, ic, abrirModal, fecharModal, toast, chamar, recarregarBase, dataBR, val, pode } from './nucleo.js';

const AREA = id => S.D.areas[id];
const ACAO_PADRAO = 'Ajustar o ponto apontado, registrar a evidência e combinar o prazo com o responsável.';
const CAB_PADRAO = [['loja', 'Loja'], ['responsavel', 'Responsável'], ['data', 'Data']];
const ESC = { conformidade: { ok: 'OK', warn: 'Atenção', no: 'Não', '': 'Não avaliado' }, comparativa: { no: 'Acima', warn: 'Igual', ok: 'Abaixo', '': 'Não avaliado' } };
const classe = v => (v == null ? 'Sem avaliação' : v >= 85 ? 'Destaque' : v >= 70 ? 'Estável' : v >= 50 ? 'Atenção' : 'Prioridade alta');
const pct = v => (v == null ? '—' : Math.round(v) + '%');
const clone = o => JSON.parse(JSON.stringify(o));

// ======================= Aba Checklists =======================
S.abasArea.check = async (id, a) => {
  const hist = await api(`/checklists-gestao/aplicacoes?area=${id}`);
  S.ckHist = hist; S.ckArea = id;
  const gestor = pode('check', 2);
  const cards = a.checklists.map((c, i) => {
    const e = c[3], nS = e ? e.blocos.length : 1;
    return `<div class="card p cl" style="display:flex;flex-direction:column">
      <div class="between" onclick="openChecklist('${id}',${i})" style="cursor:pointer"><div class="ico" style="width:44px;height:44px;border-radius:12px;background:${a.grad};color:#fff;display:grid;place-items:center">${ic('check')}</div><span class="tag gray">${c[1].length} itens · ${nS} ${nS === 1 ? 'seção' : 'seções'}</span></div>
      <div class="sect-title" style="margin-top:12px;cursor:pointer" onclick="openChecklist('${id}',${i})">${esc(c[0])}</div>
      <div class="mini" style="margin-bottom:10px">${e?.escala === 'comparativa' ? 'Concorrente acima, igual ou abaixo da Milla · gera oportunidades no plano' : 'Cabeçalho, observação por item, índice ponderado e plano de ação'}</div>
      <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:auto">
        <button class="btn red sm" onclick="openChecklist('${id}',${i})">Aplicar</button>
        ${gestor ? `<button class="btn ghost sm" onclick="ckEditor('${id}',${c[2]})">✎ Editar seções e itens</button><button class="btn ghost sm" style="color:var(--red)" onclick="ckExcluirModelo(${c[2]})">Excluir</button>` : ''}
      </div></div>`;
  }).join('');
  return `<div class="page-head" style="margin-bottom:14px"><div><h1 style="font-size:18px">Checklists · ${esc(a.nome)}</h1><p>Aplique um checklist, edite as seções e os itens e consulte os checklists salvos — com edição, exportação para Excel e PDF.</p></div>${gestor ? `<button class="btn red" onclick="ckEditor('${id}',null)">+ Novo checklist</button>` : ''}</div>
<div class="grid cards-2">${cards || '<div class="mini">Nenhum checklist cadastrado nesta área.</div>'}</div>
<div class="card p" style="margin-top:18px" id="ckSalvos">${salvosHTML()}</div>`;
};

function salvosHTML() {
  const f = S.ckFiltro || (S.ckFiltro = { modelo: '', busca: '' });
  const modelos = [...new Map(S.ckHist.map(h => [h.modelo, h.modelo])).keys()];
  const lista = S.ckHist.filter(h => (!f.modelo || h.modelo === f.modelo) && (!f.busca || JSON.stringify([h.loja, h.cabecalho, h.usuario]).toLowerCase().includes(f.busca.toLowerCase())));
  const media = lista.length ? Math.round(lista.reduce((s, h) => s + h.score, 0) / lista.length) : null;
  const ref = h => h.loja || h.cabecalho?.loja || h.cabecalho?.concorrente || h.cabecalho?.campanha || h.cabecalho?.marca || '—';
  return `<div class="between" style="flex-wrap:wrap;gap:10px"><div><div class="sect-title">Checklists salvos</div><div class="sect-sub">${lista.length ? `${lista.length} checklists · score médio ${media}%` : 'Nenhum checklist salvo com este filtro'}</div></div>
  <div style="display:flex;gap:8px;flex-wrap:wrap"><select class="inp" style="width:auto" onchange="ckFiltrar('modelo',this.value)"><option value="">Todos os checklists</option>${modelos.map(m => `<option ${m === f.modelo ? 'selected' : ''}>${esc(m)}</option>`).join('')}</select>
  <input class="inp" style="width:200px" placeholder="Buscar loja, responsável…" value="${esc(f.busca)}" onchange="ckFiltrar('busca',this.value)">
  <button class="btn ghost" onclick="ckExportarLista()">⬇ Exportar lista</button></div></div>
  ${lista.length ? `<div style="overflow-x:auto;margin-top:10px"><table><thead><tr><th>Checklist</th><th>Loja / referência</th><th>Aplicado por</th><th>Data</th><th>Resultado</th><th>Score</th><th style="text-align:right">Ações</th></tr></thead><tbody>
  ${lista.map(h => `<tr><td><b style="cursor:pointer" onclick="verAplicacao(${h.id})">${esc(h.modelo)}</b>${h.atualizado_em ? '<div class="mini">editado</div>' : ''}</td><td>${esc(ref(h))}</td><td>${esc(h.usuario || 'Carga inicial')}</td><td>${new Date(h.criado_em).toLocaleDateString('pt-BR')}</td>
  <td class="mini">${h.qtd_ok} OK · ${h.qtd_atencao} atenção · ${h.qtd_nc} não</td><td><span class="tag ${h.score >= 85 ? 'green' : h.score >= 70 ? 'blue' : h.score >= 50 ? 'amber' : 'red'}">${h.score}%</span></td>
  <td style="text-align:right;white-space:nowrap"><button class="btn ghost sm" title="Ver relatório" onclick="verAplicacao(${h.id})">Ver</button>${h.estruturado ? `${podeEditar(h) ? `<button class="btn ghost sm" title="Editar" onclick="ckEditarVisita(${h.id})">✎</button>` : ''}<button class="btn ghost sm" title="Exportar para Excel" onclick="ckExcel(${h.id})">⬇</button><button class="btn ghost sm" title="PDF" onclick="ckPDF(${h.id})">PDF</button>` : ''}</td></tr>`).join('')}
  </tbody></table></div>` : ''}`;
}
const podeEditar = h => h.usuario_id === S.D.usuario.id || pode('check', 2);
function ckFiltrar(k, v) { S.ckFiltro[k] = v; const el = document.getElementById('ckSalvos'); if (el) el.innerHTML = salvosHTML(); }

// ======================= Editor de seções e itens =======================
function ckEditor(areaId, modeloId) {
  const c = modeloId ? AREA(areaId).checklists.find(x => x[2] === modeloId) : null;
  const est = c?.[3] ? clone(c[3]) : c
    ? { escala: 'conformidade', cabecalho: CAB_PADRAO, blocos: [{ nome: 'Itens do checklist', peso: 2, area: AREA(areaId).nome, acao: ACAO_PADRAO, itens: [...c[1]] }] }
    : { escala: 'conformidade', cabecalho: CAB_PADRAO, blocos: [{ nome: '', peso: 2, area: AREA(areaId).nome, acao: ACAO_PADRAO, itens: [''] }] };
  S.cke = { area: areaId, id: modeloId, nome: c?.[0] || '', est };
  abrirModal(modeloId ? 'Editar checklist' : 'Novo checklist', '<div id="ckeCorpo"></div>', true);
  document.querySelector('#modalRoot .modal').classList.add('modal-xl');
  ckeRender();
}
function ckeRender(foco) {
  const { nome, est, id } = S.cke;
  const tot = est.blocos.reduce((s, b) => s + b.itens.length, 0);
  document.getElementById('ckeCorpo').innerHTML = `
  <div class="form-grid" style="grid-template-columns:2fr 1fr;gap:12px">
    <div><label class="lbl">Nome do checklist</label><input class="inp" value="${esc(nome)}" placeholder="ex.: Visita à loja" oninput="S.cke.nome=this.value"></div>
    <div><label class="lbl">Escala de resposta</label><select class="inp" onchange="S.cke.est.escala=this.value"><option value="conformidade" ${est.escala !== 'comparativa' ? 'selected' : ''}>OK · Atenção · Não</option><option value="comparativa" ${est.escala === 'comparativa' ? 'selected' : ''}>Concorrente Acima · Igual · Abaixo</option></select></div>
  </div>
  <div class="mini" style="margin:10px 0">${est.blocos.length} seções · ${tot} itens. Inclua, altere, exclua ou reordene seções e itens. ${id ? 'Os checklists já salvos mantêm a versão com que foram aplicados.' : ''}</div>
  ${est.blocos.map((b, bi) => `<div class="cke-sec">
    <div class="cke-sech"><b>Seção ${bi + 1}</b><input class="inp" value="${esc(b.nome)}" placeholder="Nome da seção (ex.: Abertura e equipe)" oninput="S.cke.est.blocos[${bi}].nome=this.value" id="ckeS${bi}">
      <span class="cke-bts"><button class="btn ghost sm" title="Subir seção" onclick="ckeMov('s',${bi},-1)" ${bi ? '' : 'disabled'}>↑</button><button class="btn ghost sm" title="Descer seção" onclick="ckeMov('s',${bi},1)" ${bi < est.blocos.length - 1 ? '' : 'disabled'}>↓</button><button class="btn ghost sm" style="color:var(--red)" onclick="ckeDelSec(${bi})">Excluir seção</button></span></div>
    <div class="cke-meta"><label>Peso<select class="inp" onchange="S.cke.est.blocos[${bi}].peso=+this.value">${[1, 2, 3].map(p => `<option ${p === (b.peso || 2) ? 'selected' : ''}>${p}</option>`).join('')}</select></label>
      <label>Área responsável<input class="inp" value="${esc(b.area)}" oninput="S.cke.est.blocos[${bi}].area=this.value"></label>
      <label style="flex:2">Ação sugerida quando houver ajuste<input class="inp" value="${esc(b.acao)}" oninput="S.cke.est.blocos[${bi}].acao=this.value"></label></div>
    ${b.itens.map((it, ii) => `<div class="cke-item"><span class="n">${ii + 1}</span><input class="inp" id="ckeI${bi}_${ii}" value="${esc(it)}" placeholder="Descreva o item (ex.: Equipe completa e escalada para o movimento)" oninput="S.cke.est.blocos[${bi}].itens[${ii}]=this.value" onkeydown="if(event.key==='Enter'){event.preventDefault();ckeAddItem(${bi},${ii + 1})}">
      <button class="btn ghost sm" title="Subir" onclick="ckeMov('i',${bi},-1,${ii})" ${ii ? '' : 'disabled'}>↑</button><button class="btn ghost sm" title="Descer" onclick="ckeMov('i',${bi},1,${ii})" ${ii < b.itens.length - 1 ? '' : 'disabled'}>↓</button><button class="btn ghost sm" title="Excluir item" style="color:var(--red)" onclick="ckeDelItem(${bi},${ii})">✕</button></div>`).join('')}
    <button class="btn ghost sm" style="margin-top:6px" onclick="ckeAddItem(${bi})">+ Incluir item nesta seção</button></div>`).join('')}
  <button class="btn ghost" style="margin-top:4px" onclick="ckeAddSec()">+ Nova seção</button>
  <div class="between" style="margin-top:16px;flex-wrap:wrap;gap:8px"><span class="mini">Dica: Enter num item cria o próximo item da mesma seção.</span>
  <div style="display:flex;gap:8px"><button class="btn ghost" onclick="fecharModal()">Cancelar</button><button class="btn red" onclick="ckeSalvar()">Salvar checklist</button></div></div>`;
  if (foco) document.getElementById(foco)?.focus();
}
function ckeAddItem(bi, pos) { const it = S.cke.est.blocos[bi].itens; const p = pos ?? it.length; it.splice(p, 0, ''); ckeRender(`ckeI${bi}_${p}`); }
function ckeDelItem(bi, ii) { S.cke.est.blocos[bi].itens.splice(ii, 1); ckeRender(); }
function ckeAddSec() { const b = S.cke.est.blocos; b.push({ nome: '', peso: 2, area: AREA(S.cke.area).nome, acao: ACAO_PADRAO, itens: [''] }); ckeRender(`ckeS${b.length - 1}`); }
function ckeDelSec(bi) { const b = S.cke.est.blocos[bi]; if ((b.itens.filter(Boolean).length) && !confirm(`Excluir a seção "${b.nome || 'sem nome'}" e os ${b.itens.length} itens dela?`)) return; S.cke.est.blocos.splice(bi, 1); ckeRender(); }
function ckeMov(t, bi, d, ii) {
  const arr = t === 's' ? S.cke.est.blocos : S.cke.est.blocos[bi].itens, i = t === 's' ? bi : ii, j = i + d;
  if (j < 0 || j >= arr.length) return; [arr[i], arr[j]] = [arr[j], arr[i]]; ckeRender();
}
async function ckeSalvar() {
  const { area, id, nome, est } = S.cke;
  const e = { ...est, blocos: est.blocos.map(b => ({ ...b, nome: b.nome.trim(), itens: b.itens.map(x => x.trim()).filter(Boolean) })) };
  if (!nome.trim()) return toast('Informe o nome do checklist.', 'erro');
  await chamar(() => api(id ? `/checklists-gestao/modelos/${id}` : '/checklists-gestao/modelos', { metodo: id ? 'PUT' : 'POST', corpo: { area_id: area, nome, estrutura: e } }));
  fecharModal(); toast(id ? 'Checklist atualizado.' : 'Checklist criado.', 'ok');
  await recarregarBase(); window.renderAreaTabAtual?.();
}
async function ckExcluirModelo(id) {
  if (!confirm('Excluir este checklist? Ele deixa de aparecer para aplicação; os checklists já salvos continuam consultáveis.')) return;
  await chamar(() => api(`/checklists-gestao/modelos/${id}`, { metodo: 'DELETE' }));
  toast('Checklist excluído.', 'ok'); await recarregarBase(); window.renderAreaTabAtual?.();
}

// ======================= Editar um checklist salvo =======================
async function ckEditarVisita(apId) {
  const ap = await chamar(() => api(`/checklists/aplicacoes/${apId}`));
  if (!ap.estrutura) return toast('Este checklist antigo não pode ser editado.', 'erro');
  const a = AREA(ap.area_id);
  a.checklists.push([ap.modelo, ap.estrutura.blocos.flatMap(b => b.itens), ap.modelo_id, ap.estrutura]);
  try { window.openChecklistGuia(ap.area_id, a.checklists.length - 1); } finally { a.checklists.pop(); }
  document.querySelector('#modalRoot .modal-h h3, #modalRoot h3')?.insertAdjacentText('beforeend', ' · editando');
  const cab = ap.cabecalho || {};
  for (const [k] of ap.estrutura.cabecalho) {
    if (k === 'loja') { const sel = document.getElementById('clgLoja'); if (sel) sel.value = ap.loja_id || ''; continue; }
    const el = document.getElementById('clgCab_' + k); if (el && cab[k] != null) el.value = cab[k];
  }
  (ap.respostas || []).forEach((r, k) => {
    if (!S.clg.resp[k]) return;
    S.clg.resp[k] = { s: r.s || '', obs: r.obs || '' };
    const item = document.getElementById('clgI' + k);
    item?.querySelectorAll('.sb').forEach(b => b.classList.toggle('on', !!r.s && b.classList.contains(r.s)));
    if (r.obs) { const t = document.getElementById('clgO' + k); t.value = r.obs; t.classList.add('on'); }
  });
  const og = document.getElementById('clgObsGeral'); if (og) og.value = ap.observacao || '';
  const btn = [...document.querySelectorAll('#modalRoot button')].find(b => b.getAttribute('onclick') === 'salvarChecklistGuia()');
  if (btn) { btn.textContent = 'Salvar alterações'; btn.setAttribute('onclick', `ckSalvarEdicao(${apId})`); }
  // recalcula os indicadores com as respostas carregadas
  const k0 = S.clg.resp.findIndex(r => r.s); if (k0 >= 0) { const r = S.clg.resp[k0], s = r.s, b = document.querySelector(`#clgI${k0} .sb.${s}`); r.s = ''; window.clgSet(k0, s, b); }
}
async function ckSalvarEdicao(apId) {
  const { est, resp } = S.clg;
  if (!resp.some(r => r.s)) return toast('Marque pelo menos um item antes de salvar.', 'erro');
  const cab = {};
  for (const [k] of est.cabecalho) {
    if (k === 'loja') { const sel = document.getElementById('clgLoja'); if (sel?.value) cab.loja = sel.options[sel.selectedIndex].text; continue; }
    cab[k] = val('clgCab_' + k);
  }
  const r = await chamar(() => api(`/checklists-gestao/aplicacoes/${apId}`, { metodo: 'PUT', corpo: { loja_id: val('clgLoja') || null, respostas: resp, cabecalho: cab, observacao: val('clgObsGeral') } }));
  fecharModal(); toast(`Checklist atualizado · ${r.score}% · ${r.classificacao}`, 'ok');
  await recarregarBase(); window.renderAreaTabAtual?.();
  window.verAplicacaoGuia(apId);
}

// ======================= Relatório: botões extras =======================
const verOrig = window.verAplicacaoGuia;
window.verAplicacaoGuia = async apId => {
  await verOrig(apId);
  const bar = document.querySelector('#modalRoot .no-print');
  if (!bar) return;
  const h = (S.ckHist || []).find(x => x.id === apId);
  bar.innerHTML = `<button class="btn ghost" onclick="fecharModal()">Fechar</button>${!h || podeEditar(h) ? `<button class="btn ghost" onclick="fecharModal();ckEditarVisita(${apId})">✎ Editar</button>` : ''}<button class="btn ghost" onclick="ckExcel(${apId})">⬇ Exportar Excel</button><button class="btn red" onclick="ckPDF(${apId})">Imprimir / salvar PDF</button>`;
};

// ======================= Cálculo (mesma regra do relatório) =======================
function calc(est, resp) {
  let i = 0;
  const blocos = est.blocos.map(b => {
    const rs = resp.slice(i, i + b.itens.length); i += b.itens.length;
    const c = { ok: 0, warn: 0, no: 0, na: 0 }; rs.forEach(x => c[x.s || 'na']++);
    const av = rs.length - c.na;
    return { ...b, ...c, av, rs, indice: av ? ((c.ok + c.warn * 0.5) / av) * 100 : null };
  });
  const c = { ok: 0, warn: 0, no: 0, na: 0 }; resp.forEach(x => c[x.s || 'na']++);
  const av = resp.length - c.na, v = blocos.filter(b => b.indice != null);
  const pond = v.length ? v.reduce((s, b) => s + b.indice * (b.peso || 1), 0) / v.reduce((s, b) => s + (b.peso || 1), 0) : null;
  return { blocos, ...c, tot: resp.length, av, indice: av ? ((c.ok + c.warn * 0.5) / av) * 100 : null, pond, cob: resp.length ? (av / resp.length) * 100 : 0 };
}
async function carregar(apId) {
  const ap = await chamar(() => api(`/checklists/aplicacoes/${apId}`));
  const est = ap.estrutura;
  const resp = est.blocos.flatMap(b => b.itens).map((_, i) => ap.respostas[i] || { s: '' });
  return { ap, est, resp, R: calc(est, resp) };
}
const cabTexto = (ap, est) => est.cabecalho.map(([k, t]) => [t, k === 'data' ? dataBR(ap.cabecalho?.[k]) : ap.cabecalho?.[k] || (k === 'loja' ? ap.loja : '') || '—']);

// ======================= Exportar para Excel (CSV) =======================
function baixar(nome, linhas) {
  const csv = '﻿' + linhas.map(l => l.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(';')).join('\r\n');
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  a.download = nome.replace(/[^\w\-. ]+/g, '_') + '.csv'; document.body.appendChild(a); a.click(); a.remove();
}
async function ckExcel(apId) {
  const { ap, est, R } = await carregar(apId);
  const L = { ...ESC[est.escala === 'comparativa' ? 'comparativa' : 'conformidade'] };
  const linhas = [['Grupo Milla · ' + (AREA(ap.area_id)?.nome || '')], ['Checklist', ap.modelo], ...cabTexto(ap, est), ['Aplicado por', ap.usuario || ''], ['Data de registro', new Date(ap.criado_em).toLocaleString('pt-BR')],
    [est.escala === 'comparativa' ? 'Vantagem Milla' : 'Conformidade', pct(R.indice)], ['Ponderado', pct(R.pond)], ['Classificação', est.escala === 'comparativa' ? '—' : classe(R.indice)], [],
    ['Seção', 'Peso', 'Nº', 'Item', 'Status', 'Observação', 'Área responsável']];
  R.blocos.forEach(b => b.itens.forEach((it, i) => linhas.push([b.nome, b.peso || 1, i + 1, it, L[b.rs[i].s || ''], b.rs[i].obs || '', b.area])));
  if (ap.observacao) linhas.push([], ['Observações gerais', ap.observacao]);
  baixar(`${ap.modelo} - ${ap.cabecalho?.loja || ap.loja || ap.cabecalho?.concorrente || ''} - ${String(ap.cabecalho?.data || ap.criado_em).slice(0, 10)}`, linhas);
}
function ckExportarLista() {
  const ref = h => h.loja || h.cabecalho?.loja || h.cabecalho?.concorrente || h.cabecalho?.campanha || h.cabecalho?.marca || '';
  const f = S.ckFiltro;
  const lista = S.ckHist.filter(h => (!f.modelo || h.modelo === f.modelo) && (!f.busca || JSON.stringify([h.loja, h.cabecalho, h.usuario]).toLowerCase().includes(f.busca.toLowerCase())));
  baixar(`Checklists salvos - ${AREA(S.ckArea).nome}`, [['Nº', 'Checklist', 'Loja / referência', 'Aplicado por', 'Data', 'OK', 'Atenção', 'Não', 'Score (%)', 'Ponderado (%)', 'Classificação'],
    ...lista.map(h => [h.id, h.modelo, ref(h), h.usuario || '', new Date(h.criado_em).toLocaleDateString('pt-BR'), h.qtd_ok, h.qtd_atencao, h.qtd_nc, h.score, h.indice_ponderado ?? '', h.classificacao || ''])]);
}

// ======================= PDF (janela de impressão) — modelo do relatório de visita =======================
async function ckPDF(apId) {
  const w = window.open('', '_blank');
  if (!w) return toast('Libere as janelas pop-up deste site para gerar o PDF.', 'erro');
  w.document.write('<p style="font-family:sans-serif;padding:20px">Gerando o PDF…</p>');
  const { ap, est, R } = await carregar(apId);
  const comp = est.escala === 'comparativa', L = ESC[comp ? 'comparativa' : 'conformidade'];
  const e = s => esc(s || '').replace(/\n/g, '<br>');
  const areaNome = AREA(ap.area_id)?.nome || '';
  const ref = ap.cabecalho?.loja || ap.loja || ap.cabecalho?.concorrente || ap.cabecalho?.campanha || ap.cabecalho?.marca || 'Referência não informada';
  const dataRef = dataBR(ap.cabecalho?.data || ap.criado_em);
  const cor = s => ({ ok: '#137a52', warn: '#8a5a0b', no: '#a32d2d' }[s] || '#7c8a96');
  const fundo = s => ({ ok: '#E3F5EC', warn: '#FBF0DB', no: '#FBE7E6' }[s] || '#F1F4F6');
  const corCl = v => (v == null ? '#7c8a96' : v >= 85 ? '#137a52' : v >= 70 ? '#0057B8' : v >= 50 ? '#8a5a0b' : '#a32d2d');
  const fundoCl = v => (v == null ? '#F1F4F6' : v >= 85 ? '#E3F5EC' : v >= 70 ? '#E6EEF8' : v >= 50 ? '#FBF0DB' : '#FBE7E6');
  const prazo = (b, r) => { const d = comp ? 15 : r.s === 'no' ? ((b.peso || 1) >= 3 ? 2 : 7) : 15; const dt = new Date(ap.cabecalho?.data || ap.criado_em); dt.setDate(dt.getDate() + d); return `${d === 2 ? '48 horas' : d + ' dias'} (${dt.toLocaleDateString('pt-BR')})`; };
  const kpis = comp
    ? [['Vantagem Milla', pct(R.indice), '#0B4A6F'], ['Concorrente acima', R.no, '#a32d2d'], ['Igual', R.warn, '#8a5a0b'], ['Milla à frente', R.ok, '#137a52'], ['Cobertura', pct(R.cob), '#0B2545']]
    : [['Conformidade', pct(R.indice), corCl(R.indice)], ['Ponderado', pct(R.pond), '#0057B8'], ['Cobertura', pct(R.cob), '#0B2545'], ['OK', R.ok, '#137a52'], ['Atenção', R.warn, '#8a5a0b'], ['Não', R.no, '#a32d2d']];
  const plano = [];
  R.blocos.forEach(b => b.itens.forEach((it, i) => { const r = b.rs[i]; if (comp ? r.s === 'no' : (r.s === 'no' || r.s === 'warn')) plano.push({ b, it, r }); }));
  const bons = R.blocos.filter(b => b.indice != null && b.indice >= 90 && b.av === b.itens.length);
  const focos = R.blocos.filter(b => b.indice != null && b.indice < 85).sort((x, y) => x.indice - y.indice).slice(0, 3);
  const semObs = plano.filter(p => !p.r.obs).length;
  const cab = cabTexto(ap, est);
  const leitura = comp
    ? `<h4>Resultado geral</h4><p>Foram comparados ${R.av} de ${R.tot} pontos. O concorrente está <b>acima</b> da Milla em ${R.no}, <b>igual</b> em ${R.warn} e <b>abaixo</b> em ${R.ok}. A vantagem Milla ficou em <b>${pct(R.indice)}</b>.</p>
       <h4>Próximos passos</h4><p>Os pontos em que o concorrente está acima foram registrados como oportunidade no plano de ação, para avaliação no Comitê Integrado de Execução Comercial.</p>`
    : `<h4>Resultado geral</h4><p>Foram avaliados ${R.av} dos ${R.tot} pontos do checklist. O resultado foi de <b>${pct(R.indice)}</b> de conformidade, faixa "<b>${classe(R.indice)}</b>". A referência do Grupo é de 85%${R.indice >= 85 ? ' e o resultado está dentro dela.' : `; faltam ${Math.max(1, Math.round(85 - R.indice))} pontos percentuais para alcançá-la.`}</p>
       ${R.pond != null ? `<h4>O que mais pesa</h4><p>Dando mais importância às seções de maior peso, o resultado passa a ser <b>${pct(R.pond)}</b>${Math.abs(R.pond - R.indice) <= 3 ? ', próximo do resultado geral — os ajustes estão distribuídos de forma equilibrada.' : R.pond < R.indice ? ' — os ajustes estão justamente nas seções de maior peso; comece por elas.' : ' — as seções de maior peso estão bem conduzidas.'}</p>` : ''}
       ${bons.length ? `<h4>O que está funcionando bem</h4><p>Seções com todos os pontos avaliados e 90% ou mais — boas práticas que merecem reconhecimento:</p><ul>${bons.map(b => `<li>${esc(b.nome)} — ${pct(b.indice)}</li>`).join('')}</ul>` : ''}
       ${focos.length ? `<h4>Onde concentrar o esforço</h4><ol>${focos.map(b => `<li><b>${esc(b.nome)}</b> — ${pct(b.indice)} ("${classe(b.indice)}"). Quem pode apoiar: ${esc(b.area)}. Sugestão: ${esc(b.acao)}</li>`).join('')}</ol>` : ''}
       <h4>Pontos que pedem ajuste</h4><p>${plano.length ? `Foram encontrados ${plano.length} pontos fora do padrão (${R.no} em "Não" e ${R.warn} em "Atenção"). Cada ponto aparece no plano de ação com o que fazer, quem pode conduzir e o prazo sugerido.` : 'Nenhum ponto fora do padrão nesta aplicação.'}</p>
       ${plano.length ? `<h4>Registro das observações</h4><p>Dos ${plano.length} pontos fora do padrão, ${plano.length - semObs} têm observação escrita. A observação permite entender o motivo do ajuste e agir sobre a causa certa.</p>` : ''}
       <h4>Próximos passos</h4><p>As ações, as áreas e os prazos indicados neste relatório são sugestões para apoiar a condução. A confirmação das prioridades, dos responsáveis e das datas cabe à direção, na próxima reunião do Comitê Integrado de Execução Comercial.</p>`;
  const titulo = 'Relatório · ' + ap.modelo;
  const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><title>${esc(ap.modelo)} — ${esc(ref)} — ${dataRef}</title><style>
  @page{size:A4;margin:0}*{box-sizing:border-box}html,body{margin:0}body{font-family:'Helvetica Neue',Arial,sans-serif;color:#1F2A30;font-size:9.6pt;line-height:1.42;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  .topo{position:fixed;top:0;left:0;right:0;height:25mm;background:#073F63;color:#fff;padding:7mm 14mm 0;display:flex;justify-content:space-between;align-items:flex-start}
  .topo .k{font-size:7.5pt;font-weight:700;letter-spacing:.6px;color:#BFD7E8}.topo h1{margin:2mm 0 0;font-size:15pt}.topo .d{margin-top:6.5mm;font-size:8.5pt;color:#BFD7E8}
  .pe{position:fixed;bottom:0;left:0;right:0;height:13mm;padding:4mm 14mm 0;font-size:7.5pt;color:#8a97a3;display:flex;justify-content:space-between}
  table.pg{width:100%;border-collapse:collapse}table.pg>thead td{height:31mm}table.pg>tfoot td{height:17mm}table.pg>tbody>tr>td{padding:0 14mm}
  .info{display:grid;grid-template-columns:repeat(3,1fr);gap:4mm 6mm;margin-bottom:6mm}.info .l{font-size:7pt;font-weight:700;color:#5e7286;letter-spacing:.4px;text-transform:uppercase}.info b{display:block;font-size:10pt;margin-top:1mm}
  .kpis{display:flex;gap:3mm;margin-bottom:7mm}.kpi{flex:1;background:#EEF2F6;border-top:3px solid;padding:3mm 2mm;text-align:center}.kpi b{display:block;font-size:15pt}.kpi span{font-size:7.5pt;font-weight:700;color:#5e7286}
  h2{font-size:12.5pt;color:#073F63;margin:6mm 0 3mm;padding-bottom:1.5mm;border-bottom:2px solid #4FA3D1;break-after:avoid;page-break-after:avoid}
  .guia{background:#F1F6FA;border-left:4px solid #4FA3D1;padding:3mm 5mm}.guia h4,.leit h4{color:#073F63;font-size:9.8pt;margin:3mm 0 1mm;break-after:avoid;page-break-after:avoid}.leit h4{color:#0057B8}.guia p,.leit p{margin:0 0 1.5mm}.guia ul,.leit ul,.leit ol{margin:0 0 1.5mm;padding-left:5mm}
  .leit h4+p,.leit h4+ul,.leit h4+ol{break-before:avoid}
  table.t{width:100%;border-collapse:collapse;margin-bottom:4mm}table.t th{background:#073F63;color:#fff;font-size:8pt;padding:2.2mm 2mm;text-align:center;border:1px solid #073F63}table.t td{border:1px solid #DCE3E9;padding:2mm;font-size:8.6pt;vertical-align:top}
  table.t tr{break-inside:avoid;page-break-inside:avoid}table.t thead{display:table-header-group}table.t tbody tr:nth-child(even) td{background:#F6F9FB}
  .c{text-align:center}.cl{font-weight:700;text-align:center}.o{font-size:7.8pt;color:#5e7286;margin-top:1mm}.sec{break-inside:avoid-page}
  .obs{background:#FFF8E5;border-left:4px solid #E0A82E;padding:3mm 5mm;margin:3mm 0;break-inside:avoid}
  .nova{break-before:page;page-break-before:always}
  .acoes{position:fixed;top:30mm;right:8mm;z-index:5}.acoes button{font:600 13px sans-serif;padding:8px 14px;border-radius:8px;border:0;background:#C8102E;color:#fff;cursor:pointer}@media print{.acoes{display:none}}
  </style></head><body>
  <div class="acoes"><button onclick="window.print()">Imprimir / salvar PDF</button></div>
  <div class="topo"><div><div class="k">GRUPO MILLA · ${esc(areaNome.toUpperCase())}</div><h1>${esc(titulo)}</h1></div><div class="d">${esc(ref)} · ${dataRef}</div></div>
  <div class="pe"><span>Grupo Milla · ${esc(ap.modelo)} · SCA Solutions · Consultoria</span><span>Nº ${ap.id} · emitido em ${new Date().toLocaleString('pt-BR')}</span></div>
  <table class="pg"><thead><tr><td></td></tr></thead><tfoot><tr><td></td></tr></tfoot><tbody><tr><td>
  <div class="info">${cab.map(([t, v]) => `<div><div class="l">${esc(t)}</div><b>${esc(v)}</b></div>`).join('')}${comp ? '' : `<div><div class="l">Classificação</div><b style="color:${corCl(R.indice)}">${classe(R.indice)}</b></div>`}<div><div class="l">Aplicado por</div><b>${esc(ap.usuario || '—')}</b></div></div>
  <div class="kpis">${kpis.map(k => `<div class="kpi" style="border-top-color:${k[2]}"><b style="color:${k[2]}">${esc(k[1])}</b><span>${esc(k[0])}</span></div>`).join('')}</div>
  <h2>Como ler este relatório</h2>
  <div class="guia"><h4>O que é este relatório</h4><p>É o resumo do checklist "${esc(ap.modelo)}". ${comp ? 'Cada ponto foi marcado como Acima (o concorrente está melhor), Igual ou Abaixo (a Milla está à frente).' : 'Cada ponto foi marcado como OK (está no padrão), Atenção (parcialmente adequado, precisa de cuidado) ou Não (fora do padrão).'} Os pontos sem marcação aparecem como "Não avaliado".</p>
  <h4>Como a nota é calculada</h4><p>Cada ponto vale: OK = 100, Atenção = 50 e Não = 0. A nota é a média dos pontos avaliados. O ponderado dá mais importância às seções de maior peso (1 a 3).</p>
  <h4>Como interpretar o resultado</h4><ul><li>Destaque: 85% ou mais — dentro da referência do Grupo.</li><li>Estável: de 70% a 84% — próximo da referência, com ajustes pontuais.</li><li>Atenção: de 50% a 69% — pede acompanhamento próximo.</li><li>Prioridade alta: abaixo de 50% — pede ação imediata.</li></ul></div>
  <h2 class="nova">Leitura ${comp ? 'da comparação' : 'da aplicação'}</h2><div class="leit">${leitura}</div>
  ${ap.observacao ? `<div class="obs"><b>Observações gerais</b><div>${e(ap.observacao)}</div></div>` : ''}
  <h2 class="nova">${comp ? 'Vantagem Milla por seção' : 'Conformidade por seção'}</h2>
  <table class="t"><thead><tr><th style="text-align:left">Seção</th>${comp ? '' : '<th>Peso</th>'}<th>Avaliados</th><th>${comp ? 'Abaixo' : 'OK'}</th><th>${comp ? 'Igual' : 'Atenção'}</th><th>${comp ? 'Acima' : 'Não'}</th><th>Índice</th>${comp ? '' : '<th>Classificação</th>'}</tr></thead><tbody>
  ${R.blocos.map(b => `<tr><td><b>${esc(b.nome)}</b></td>${comp ? '' : `<td class="c">${b.peso || 1}</td>`}<td class="c">${b.av}/${b.itens.length}</td><td class="c">${b.ok}</td><td class="c">${b.warn}</td><td class="c">${b.no}</td><td class="c"><b>${pct(b.indice)}</b></td>${comp ? '' : `<td class="cl" style="color:${corCl(b.indice)};background:${fundoCl(b.indice)}">${classe(b.indice)}</td>`}</tr>`).join('')}</tbody></table>
  <h2>${comp ? 'Oportunidades (concorrente acima)' : 'Plano de ação sugerido'}</h2>
  ${plano.length ? `<table class="t"><thead><tr><th style="width:11%">Status</th><th style="width:16%">Seção</th><th style="width:25%">Item</th><th>Ação sugerida</th><th style="width:18%">Área · prazo</th></tr></thead><tbody>${plano.map(({ b, it, r }) => `<tr><td class="cl" style="color:${cor(r.s)};background:${fundo(r.s)}">${L[r.s]}</td><td>${esc(b.nome)}</td><td>${e(it)}${r.obs ? `<div class="o">Obs.: ${e(r.obs)}</div>` : ''}</td><td>${e(b.acao)}</td><td>${esc(b.area)} · ${prazo(b, r)}</td></tr>`).join('')}</tbody></table>` : '<p>Nenhum ponto com ajuste nesta aplicação.</p>'}
  <h2 class="nova">Anexo — checklist completo (${R.tot} itens)</h2>
  <table class="t"><thead><tr><th style="width:20%">Seção</th><th style="width:5%">Nº</th><th style="text-align:left">Item</th><th style="width:13%">Status</th></tr></thead><tbody>
  ${R.blocos.map(b => b.itens.map((it, i) => { const r = b.rs[i]; return `<tr><td>${i ? '' : `<b>${esc(b.nome)}</b>`}</td><td class="c">${i + 1}</td><td>${e(it)}${r.obs ? `<div class="o">Obs.: ${e(r.obs)}</div>` : ''}</td><td class="cl" style="color:${cor(r.s)};background:${fundo(r.s)}">${L[r.s || '']}</td></tr>`; }).join('')).join('')}</tbody></table>
  </td></tr></tbody></table></body></html>`;
  w.document.open(); w.document.write(html); w.document.close();
  w.onload = () => setTimeout(() => w.print(), 300);
}

// Os campos do editor gravam direto no estado (S.cke) pelos atributos inline.
window.S = S;
Object.assign(window, { ckEditor, ckeRender, ckeAddItem, ckeDelItem, ckeAddSec, ckeDelSec, ckeMov, ckeSalvar, ckExcluirModelo, ckEditarVisita, ckSalvarEdicao, ckExcel, ckExportarLista, ckPDF, ckFiltrar });
