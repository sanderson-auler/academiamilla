// Guia de Supervisão de Loja (e qualquer área com o mesmo formato): rotina na loja, programação mensal
// por semana, roteiro de conversa com o gerente e checklists estruturados (blocos, pesos, cabeçalho,
// observação por item, índice ponderado, classificação e plano de ação sugerido).
import './guia-ia.css';
import { S, api, esc, abrirModal, fecharModal, toast, pontosToast, chamar, hojeISO, dataBR, val, recarregarBase } from './nucleo.js';

const AREA = id => S.D.areas[id];
const REF = 85;
const classe = v => (v == null ? ['Sem avaliação', 'gray'] : v >= 85 ? ['Destaque', 'green'] : v >= 70 ? ['Estável', 'blue'] : v >= 50 ? ['Atenção', 'amber'] : ['Prioridade alta', 'red']);
const pct = v => (v == null ? '—' : Math.round(v) + '%');
const ESCALAS = {
  conformidade: [['ok', 'OK'], ['warn', 'Atenção'], ['no', 'Não']],
  comparativa: [['no', 'Acima'], ['warn', 'Igual'], ['ok', 'Abaixo']],
};
const rotulo = (escala, s) => (ESCALAS[escala] || ESCALAS.conformidade).find(x => x[0] === s)?.[1] || 'Não avaliado';
const COR_S = { ok: 'green', warn: 'amber', no: 'red', '': 'gray' };

// ---------- Rotina na loja + programação mensal (aba Rotina & Atividades) ----------
export function rotinaGuiaHTML(id, a) {
  let h = '';
  if (a.rotina_loja) {
    h += `<div class="card p" style="margin-bottom:18px"><div class="sect-title">${esc(a.rotina_titulo || 'Rotina diária na loja — da abertura ao fechamento')}</div><div class="sect-sub">${esc(a.rotina_sub || 'O que a supervisão acompanha (e cobra) em toda visita à loja')}</div>
    <div class="guia-timeline">${a.rotina_loja.map(t => `<div class="guia-tcard"><div class="tt">${esc(t[0])}</div><h4>${esc(t[1])}</h4><ul>${t[2].map(x => `<li>${esc(x)}</li>`).join('')}</ul></div>`).join('')}</div></div>`;
  }
  if (a.programacao) {
    const sem = a.programacao.semanas;
    const wi = Math.min(S.progSemana || 0, sem.length - 1);
    const w = sem[wi];
    h += `<div class="card p" style="margin-bottom:18px"><div class="sect-title">${esc(a.prog_titulo || 'Programação mensal — a semana da supervisão')}</div><div class="sect-sub">Cada semana tem um foco. Clique num dia para abrir a rotina detalhada, até o pacote de trabalho.</div>
    <div class="segmented" style="margin:12px 0;flex-wrap:wrap">${sem.map((s, i) => `<button class="${i === wi ? 'on' : ''}" onclick="progSemana('${id}',${i})">${esc(s.n)} · ${esc(s.foco)}</button>`).join('')}</div>
    <div class="guia-obj"><b>Objetivo da semana:</b> ${esc(w.obj || '—')}</div>
    <div class="guia-days">${w.dias.map((d, di) => { const tk = d.tasks || []; return `<div class="guia-day ${tk.length ? 'clk' : ''}" ${tk.length ? `onclick="progDia('${id}',${wi},${di})"` : ''}>
      <h4>${esc(d.d)} ${di > 4 ? '<span>plantão</span>' : ''}</h4><ul>${tk.length ? tk.map(t => `<li class="${t.ref ? 'vl' : ''}">${esc(t.t)}</li>`).join('') : '<li class="muted">Sem programação</li>'}</ul>${tk.length ? '<div class="more">ver detalhe ▸</div>' : ''}</div>`; }).join('')}</div></div>`;
  }
  return h;
}
function progSemana(id, i) { S.progSemana = i; window.renderAreaTabAtual?.(); }
function no(n, prog, topo) {
  if (n.ptr) return `<div class="guia-ptr">→ Checklist completo: ${esc(n.t)} (aba Checklists)</div>`;
  const filhos = n.ref ? prog.blocos[n.ref] || [] : n.c || [];
  if (filhos.length) return `<details ${topo ? 'open' : ''}><summary>${esc(n.t)}</summary><div class="sub">${filhos.map(f => no(f, prog)).join('')}</div></details>`;
  return `<div class="leaf" ${topo ? 'style="font-weight:600;color:var(--petrol)"' : ''}>• ${esc(n.t)}</div>`;
}
function progDia(id, wi, di) {
  const prog = AREA(id).programacao, w = prog.semanas[wi], d = w.dias[di];
  abrirModal(`${esc(d.d)} · ${esc(w.n)}`, `<div class="mini" style="margin-bottom:10px">${esc(w.foco)} — ${esc(w.obj || '')}</div><div class="guia-tree">${(d.tasks || []).map(t => no(t, prog, true)).join('')}</div>`, true);
}

// ---------- Roteiro de conversa (aba Guia) ----------
export function conversaHTML(a) {
  if (!a.conversa) return '';
  return `<div class="card p" style="margin-top:18px"><div class="sect-title">${esc(a.conversa_titulo || 'Como conduzir a conversa com o gerente')}</div><div class="sect-sub">Roteiro de perguntas-chave por bloco. Ouça mais do que fale — e encerre com dono e prazo.</div>
  <div class="grid cards-2" style="margin-top:8px">${a.conversa.map(b => `<div class="guia-q"><h4><span>${esc(b[1])}</span>${esc(b[0])}</h4><ul>${b[2].map(q => `<li>${esc(q)}</li>`).join('')}</ul></div>`).join('')}</div></div>`;
}

// ---------- Checklist estruturado: aplicação ----------
function openChecklistGuia(id, idx) {
  const a = AREA(id), c = a.checklists[idx], est = c[3];
  const n = c[1].length;
  S.clg = { area: id, modelo: c[2], nome: c[0], est, resp: Array.from({ length: n }, () => ({ s: '', obs: '' })) };
  const campo = ([k, t]) => {
    if (k === 'loja') return `<div><label class="lbl">${esc(t)}</label><select class="inp" id="clgLoja"><option value="">Selecione a loja</option>${S.D.lojas.map(l => `<option value="${l.id}">${esc(l.nome)}</option>`).join('')}</select></div>`;
    if (k === 'data') return `<div><label class="lbl">${esc(t)}</label><input class="inp" type="date" id="clgCab_data" value="${hojeISO()}"></div>`;
    return `<div><label class="lbl">${esc(t)}</label><input class="inp" id="clgCab_${k}" value="${k === 'responsavel' ? esc(S.D.usuario.nome) : ''}" placeholder="${esc(t)}"></div>`;
  };
  let i = 0;
  const blocos = est.blocos.map(b => `<div class="clg-bloco"><div class="gt"><span>${esc(b.nome)}</span><small>${est.escala === 'comparativa' ? '' : `peso ${b.peso} · `}${esc(b.area)}</small></div><div class="clg-box">${b.itens.map(item => { const k = i++; return `
    <div class="clg-item" id="clgI${k}"><div class="lbl">${esc(item)}</div><div class="sbs">${ESCALAS[est.escala].map(([s, t]) => `<button class="sb ${s}" onclick="clgSet(${k},'${s}',this)">${t}</button>`).join('')}</div>
    <button class="clg-obsbtn" onclick="clgObs(${k})" id="clgOb${k}">+ Observação</button><textarea class="inp clg-obs" id="clgO${k}" placeholder="O que foi visto, causa provável e o que foi combinado com a loja" oninput="clgObsSet(${k},this.value)"></textarea></div>`; }).join('')}</div></div>`).join('');
  abrirModal(esc(c[0]), `
  <div class="mini" style="margin-bottom:10px">${esc(a.nome)} · ${n} pontos em ${est.blocos.length} blocos · ${est.escala === 'comparativa' ? 'indique como o concorrente está em relação à Milla' : 'marque OK, Atenção ou Não e registre a observação'}</div>
  <div class="form-grid clg-cab">${est.cabecalho.map(campo).join('')}</div>
  <div class="clg-barra"><div class="progress bar-green" style="flex:1"><i id="clgBar" style="width:0%"></i></div><span class="mini" id="clgSum"></span></div>
  <div class="clg-kpis" id="clgKpis"></div>
  ${blocos}
  <label class="lbl" style="margin-top:14px">Observações gerais da visita</label><textarea class="inp" id="clgObsGeral" placeholder="Resumo da visita, combinados com o gerente, evidências enviadas…"></textarea>
  <div class="between" style="margin-top:14px;flex-wrap:wrap;gap:10px"><span class="mini">${est.escala === 'comparativa' ? 'Itens com o concorrente acima viram oportunidade no plano de ação.' : 'Itens em Não e Atenção viram ação no plano (Não em bloco de peso 3: 48 h · Não: 7 dias · Atenção: 15 dias).'}</span>
  <div style="display:flex;gap:8px"><button class="btn ghost" onclick="fecharModal()">Cancelar</button><button class="btn red" onclick="salvarChecklistGuia()">Salvar visita</button></div></div>`, true);
  document.querySelector('#modalRoot .modal').classList.add('modal-xl');
  clgResumo();
}
function clgSet(k, s, btn) {
  const r = S.clg.resp[k]; r.s = r.s === s ? '' : s;
  btn.parentElement.querySelectorAll('.sb').forEach(b => b.classList.toggle('on', b.classList.contains(r.s) && !!r.s));
  clgResumo();
}
function clgObsSet(k, v) { S.clg.resp[k].obs = v; }
function clgObs(k) { const t = document.getElementById('clgO' + k); t.classList.toggle('on'); if (t.classList.contains('on')) t.focus(); }
function calcular(est, resp) {
  let i = 0;
  const blocos = est.blocos.map(b => {
    const rs = resp.slice(i, i + b.itens.length); i += b.itens.length;
    const c = { ok: 0, warn: 0, no: 0, na: 0 }; rs.forEach(x => c[x.s || 'na']++);
    const av = rs.length - c.na;
    return { ...b, ...c, n: rs.length, av, indice: av ? ((c.ok + c.warn * 0.5) / av) * 100 : null };
  });
  const tot = resp.length, c = { ok: 0, warn: 0, no: 0, na: 0 }; resp.forEach(x => c[x.s || 'na']++);
  const av = tot - c.na;
  const val_ = blocos.filter(b => b.indice != null);
  const pond = val_.length ? val_.reduce((s, b) => s + b.indice * (b.peso || 1), 0) / val_.reduce((s, b) => s + (b.peso || 1), 0) : null;
  return { blocos, ...c, tot, av, indice: av ? ((c.ok + c.warn * 0.5) / av) * 100 : null, pond, cob: (av / tot) * 100 };
}
function kpisHTML(R, comp) {
  const cl = classe(R.indice);
  const ks = comp
    ? [['Vantagem Milla', pct(R.indice), cl[1]], ['Concorrente acima', R.no, 'red'], ['Igual', R.warn, 'amber'], ['Milla à frente', R.ok, 'green'], ['Cobertura', pct(R.cob), 'gray']]
    : [['Conformidade', pct(R.indice), cl[1]], ['Ponderado', pct(R.pond), 'blue'], ['Cobertura', pct(R.cob), 'gray'], ['OK', R.ok, 'green'], ['Atenção', R.warn, 'amber'], ['Não', R.no, 'red']];
  return ks.map(k => `<div class="clg-kpi ${k[2]}"><b>${k[1]}</b><span>${k[0]}</span></div>`).join('') + (comp ? '' : `<div class="clg-kpi ${cl[1]}"><b style="font-size:14px">${cl[0]}</b><span>Classificação</span></div>`);
}
function clgResumo() {
  const R = calcular(S.clg.est, S.clg.resp);
  document.getElementById('clgBar').style.width = Math.round(R.cob) + '%';
  document.getElementById('clgSum').textContent = `${R.av} de ${R.tot} avaliados`;
  document.getElementById('clgKpis').innerHTML = kpisHTML(R, S.clg.est.escala === 'comparativa');
  S.clg.resp.forEach((r, k) => { const b = document.getElementById('clgOb' + k); if (b) b.textContent = r.obs ? '✎ Observação' : '+ Observação'; });
}
async function salvarChecklistGuia() {
  const { est, resp, modelo } = S.clg;
  if (!resp.some(r => r.s)) return toast('Marque pelo menos um item antes de salvar.', 'erro');
  const cab = {};
  for (const [k] of est.cabecalho) {
    if (k === 'loja') { const sel = document.getElementById('clgLoja'); if (sel.value) cab.loja = sel.options[sel.selectedIndex].text; continue; }
    cab[k] = val('clgCab_' + k);
  }
  const r = await chamar(() => api('/checklists/aplicacoes', { metodo: 'POST', corpo: { modelo_id: modelo, loja_id: val('clgLoja') || null, respostas: resp, cabecalho: cab, observacao: val('clgObsGeral') } }));
  fecharModal();
  pontosToast(r, `Visita salva · ${r.score}%${r.classificacao ? ' · ' + r.classificacao : ''}${r.acoesGeradas ? ` · ${r.acoesGeradas} ação(ões) no plano` : ''}`);
  await recarregarBase(); window.renderAreaTabAtual?.();
  window.verAplicacaoGuia(r.id);
}

// ---------- Relatório da visita ----------
async function verAplicacaoGuia(apId) {
  const ap = await chamar(() => api(`/checklists/aplicacoes/${apId}`));
  const est = ap.estrutura, comp = est.escala === 'comparativa';
  const resp = est.blocos.flatMap(b => b.itens).map((_, i) => ap.respostas[i] || { s: '' });
  const R = calcular(est, resp);
  const cab = ap.cabecalho || {};
  const info = est.cabecalho.map(([k, t]) => `<div><div class="mini">${esc(t)}</div><b>${esc(k === 'data' ? dataBR(cab[k]) : cab[k] || (k === 'loja' ? ap.loja : '') || '—')}</b></div>`).join('');
  const barras = `<div class="clg-barras">${R.blocos.map(b => { const cl = classe(b.indice); return `<div class="row"><span class="nm">${esc(b.nome)}</span><div class="trk"><i class="${cl[1]}" style="width:${b.indice ?? 0}%"></i><em style="left:${REF}%"></em></div><b>${pct(b.indice)}</b></div>`; }).join('')}</div><div class="mini" style="text-align:right">Linha vermelha: referência do Grupo (${REF}%)</div>`;
  // Leitura da visita (linguagem simples)
  const cl = classe(R.indice);
  const focos = R.blocos.filter(b => b.indice != null && b.indice < REF).sort((x, y) => x.indice - y.indice || (y.peso || 1) - (x.peso || 1)).slice(0, 3);
  const leitura = comp
    ? [`Foram comparados ${R.av} de ${R.tot} pontos. O concorrente está <b>acima</b> da Milla em ${R.no}, <b>igual</b> em ${R.warn} e <b>abaixo</b> em ${R.ok}.`,
       R.no ? `Os pontos em que o concorrente está acima foram registrados como oportunidade no plano de ação, para avaliação no Comitê Comercial.` : 'Nenhum ponto com o concorrente acima da Milla nesta visita.']
    : [`Foram avaliados ${R.av} de ${R.tot} pontos. A loja alcançou <b>${pct(R.indice)}</b> de conformidade (faixa "${cl[0]}"). ${R.indice >= REF ? `Está dentro da referência do Grupo (${REF}%).` : `Para a referência de ${REF}% ${Math.round(REF - R.indice) === 1 ? 'falta 1 ponto percentual' : `faltam ${Math.round(REF - R.indice)} pontos percentuais`}.`}`,
       R.pond != null ? `Dando mais peso aos blocos que mais influenciam a venda (exposição, abastecimento, atendimento e indicadores), o resultado é <b>${pct(R.pond)}</b>${R.pond < R.indice - 3 ? ' — os ajustes estão justamente nas áreas que mais pesam na venda; comece por eles.' : R.pond > R.indice + 3 ? ' — as áreas que mais pesam na venda estão bem conduzidas.' : ' — os ajustes estão distribuídos de forma equilibrada.'}` : '',
       focos.length ? `Onde concentrar o esforço: ${focos.map(b => `<b>${esc(b.nome)}</b> (${pct(b.indice)} · ${esc(b.area)})`).join('; ')}.` : 'Todos os blocos avaliados estão na referência ou acima.',
       R.na ? `${R.na} pontos ficaram sem marcação e estão fora do cálculo — complete-os na próxima visita.` : ''];
  let i = 0;
  const plano = [], anexo = [];
  est.blocos.forEach(b => b.itens.forEach(item => {
    const r = resp[i++];
    anexo.push(`<tr><td>${esc(b.nome)}</td><td>${esc(item)}${r.obs ? `<div class="mini">Obs.: ${esc(r.obs)}</div>` : ''}</td><td><span class="tag ${COR_S[r.s || '']}">${rotulo(est.escala, r.s)}</span></td></tr>`);
    const gera = comp ? r.s === 'no' : (r.s === 'no' || r.s === 'warn');
    if (gera) plano.push(`<tr><td><span class="tag ${COR_S[r.s]}">${rotulo(est.escala, r.s)}</span></td><td><b>${esc(item)}</b>${r.obs ? `<div class="mini">Obs.: ${esc(r.obs)}</div>` : ''}</td><td>${esc(b.acao)}</td><td>${esc(b.area)}<div class="mini">${comp ? '15 dias' : r.s === 'no' ? ((b.peso || 1) >= 3 ? '48 horas' : '7 dias') : '15 dias'}</div></td></tr>`);
  }));
  abrirModal(`${esc(ap.modelo)} · relatório`, `<div id="clgRel">
  <div class="clg-relhead"><div><div class="mini" style="color:#cfe0e6">GRUPO MILLA · ${esc(AREA(ap.area_id)?.nome || '')}</div><h3>${esc(ap.modelo)}</h3><div style="font-size:12.5px;color:#cfe0e6">${esc(ap.usuario || '')} · ${new Date(ap.criado_em).toLocaleString('pt-BR')}</div></div><span class="tag ${cl[1]}" style="font-size:13px">${comp ? 'Vantagem Milla ' + pct(R.indice) : cl[0]}</span></div>
  <div class="clg-info">${info}</div>
  <div class="clg-kpis">${kpisHTML(R, comp)}</div>
  <div class="sect-title" style="margin-top:14px;font-size:14px">Leitura da visita</div><div class="clg-leitura">${leitura.filter(Boolean).map(p => `<p>${p}</p>`).join('')}</div>
  <div class="sect-title" style="margin-top:14px;font-size:14px">${comp ? 'Vantagem Milla por bloco' : 'Conformidade por bloco'}</div>${barras}
  <div class="sect-title" style="margin-top:14px;font-size:14px">${comp ? 'Oportunidades (concorrente acima)' : 'Plano de ação sugerido'}</div>
  ${plano.length ? `<div style="overflow-x:auto"><table><thead><tr><th>Status</th><th>Item</th><th>Ação sugerida</th><th>Área · prazo</th></tr></thead><tbody>${plano.join('')}</tbody></table></div><div class="mini" style="margin-top:6px">As ações já foram criadas no Plano de Ação da área. Responsáveis e datas finais são validados pela direção no Comitê Comercial.</div>` : '<div class="mini">Nenhum ponto fora do padrão nesta visita.</div>'}
  ${ap.observacao ? `<div class="coment" style="margin-top:12px"><b>Observações gerais</b><div>${esc(ap.observacao)}</div></div>` : ''}
  <details style="margin-top:14px"><summary class="linkbtn" style="cursor:pointer">Anexo — checklist completo (${R.tot} pontos)</summary><div style="overflow-x:auto;margin-top:8px"><table><thead><tr><th>Bloco</th><th>Ponto</th><th>Status</th></tr></thead><tbody>${anexo.join('')}</tbody></table></div></details>
  </div><div style="display:flex;gap:8px;justify-content:flex-end;margin-top:14px" class="no-print"><button class="btn ghost" onclick="fecharModal()">Fechar</button><button class="btn red" onclick="imprimirRelatorio()">Imprimir / salvar PDF</button></div>`, true);
  document.querySelector('#modalRoot .modal').classList.add('modal-xl');
}
function imprimirRelatorio() {
  document.querySelectorAll('#clgRel details').forEach(d => { d.open = true; });
  document.body.classList.add('imprimindo-modal');
  window.print();
  setTimeout(() => document.body.classList.remove('imprimindo-modal'), 500);
}

Object.assign(window, { progSemana, progDia, openChecklistGuia, clgSet, clgObs, clgObsSet, salvarChecklistGuia, verAplicacaoGuia, imprimirRelatorio });
