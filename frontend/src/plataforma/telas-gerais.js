// Telas gerais: Meu Painel, Dashboard Executivo, Calendário, Comitê, Universidade, Gamificação, Assistente e CMS.
import { S, api, esc, ic, iniciais, prog, head, kpiCard, abrirModal, fecharModal, toast, pontosToast, chamar, grafico,
  dataBR, dataCurta, dataHoraBR, hojeISO, pode, opcoes, val, recarregarBase } from './nucleo.js';

const AREA = id => S.D.areas[id];
const COR = m => S.D.brandcolor[m] || '#5B6B73';
const MESES = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ'];
const MESNOME = { JAN: 'Janeiro', FEV: 'Fevereiro', MAR: 'Março', ABR: 'Abril', MAI: 'Maio', JUN: 'Junho', JUL: 'Julho', AGO: 'Agosto', SET: 'Setembro', OUT: 'Outubro', NOV: 'Novembro', DEZ: 'Dezembro' };
const dataExtenso = () => new Date().toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

// ================= MEU PAINEL =================
S.telas.home = async () => {
  const p = await api('/plataforma/painel');
  S.painel = p;
  const u = S.D.usuario, primeiro = u.nome.split(' ')[0];
  const minhasAreas = u.area_id ? [u.area_id, ...S.D.areaOrder.filter(x => x !== u.area_id)] : S.D.areaOrder;
  const d = dataExtenso();
  return `
${head(`Olá, ${esc(primeiro)} 👋`, `${d.charAt(0).toUpperCase() + d.slice(1)} · seu dia na Academia Milla 360`, `<button class="btn red" onclick="go('areas')">Abrir áreas →</button>`)}
<div class="grid cards-4" style="margin-bottom:18px">
  ${kpiCard('kanban', 'linear-gradient(135deg,#C8102E,#ef4d63)', p.acoesAbertas, 'Ações abertas', p.acoesHoje ? `${p.acoesHoje} vencem até hoje` : 'em dia', !p.acoesHoje, "go('areas')")}
  ${kpiCard('cap', 'linear-gradient(135deg,#1D4ED8,#2563EB)', p.cursosEmCurso, 'Treinamentos em curso', `${p.cursosConcluidos} concluídos`, true, "go('univ')")}
  ${kpiCard('check', 'linear-gradient(135deg,#1F9D6B,#34c98b)', p.checklists30d ? p.aderencia + '%' : '—', 'Score médio dos checklists', `${p.checklists30d} em 30 dias`, true, "go('areas')")}
  ${kpiCard('medal', 'linear-gradient(135deg,#E0A82E,#f0c25a)', p.pontos.toLocaleString('pt-BR'), `Pontos · ${p.nivel.nome}`, p.nivel.proximo ? `faltam ${p.nivel.faltam}` : 'nível máximo', true, "go('game')")}
</div>
<div class="card p" style="margin-bottom:18px">
  <div class="between"><div><div class="sect-title">${u.area_id ? 'Minhas áreas' : 'Áreas'}</div><div class="sect-sub">Entre em cada área para ver metas, indicadores, plano de ação, checklists, treinamentos e rotina</div></div><a class="mini" style="color:var(--royal);font-weight:700;cursor:pointer" onclick="go('areas')">Ver todas →</a></div>
  <div class="grid cards-4" style="margin-top:6px">${minhasAreas.slice(0, 4).map(id => { const a = AREA(id); return `<div class="card area-card" onclick="openArea('${id}')"><div class="hd" style="background:${a.grad}"><div class="ic">${ic(a.ic)}</div><div><b style="display:block;font-size:13.5px">${esc(a.nome)}</b><small style="font-size:11px;opacity:.85">${esc(a.resp)}</small></div></div></div>`; }).join('')}</div>
</div>
<div class="grid cards-3">
  <div class="card p">
    <div class="between"><div class="sect-title">Plano de ação</div><span class="mini">mais urgentes</span></div>
    ${p.acoes.length ? p.acoes.map(a => { const venc = a.prazo && String(a.prazo).slice(0, 10) < hojeISO(); return `<div class="row-item" style="cursor:pointer" onclick="openArea('${a.area_id}','acao')"><div class="ico" style="background:#EEF3F5">${ic('kanban')}</div><div style="flex:1"><div class="ttl">${esc(a.titulo)}</div><div class="meta">${esc(a.area)}</div></div><span class="tag ${venc ? 'red' : a.status === 'Em andamento' ? 'blue' : 'amber'}">${a.prazo ? dataCurta(a.prazo) : '—'}</span></div>`; }).join('') : '<div class="vazio">Nenhuma ação aberta.</div>'}
  </div>
  <div class="card p">
    <div class="sect-title">Próximas campanhas</div><div class="sect-sub">Clique para ver a execução por área</div>
    ${p.campanhas.map(c => `<div class="row-item" style="cursor:pointer" onclick="openCampaign(${c.id})"><span style="width:10px;height:34px;border-radius:6px;background:${COR(c.marca)}"></span><div style="flex:1"><div class="ttl">${esc(c.nome)}</div><div class="meta">${esc(c.marca)}</div></div><span class="tag gray">${esc(c.periodo)}</span></div>`).join('') || '<div class="vazio">Sem campanhas futuras.</div>'}
  </div>
  <div class="card p">
    <div class="sect-title">Indicadores · ${esc(AREA(minhasAreas[0]).nome)}</div><div class="sect-sub">Últimos registros</div>
    <canvas id="homeChart" height="170"></canvas>
  </div>
</div>`;
};
S.depois.home = () => {
  const a = AREA(S.D.usuario.area_id || S.D.areaOrder[0]);
  const k = a.kpis.slice(0, 2);
  grafico('homeChart', { type: 'line', data: { labels: ['1', '2', '3', '4'], datasets: k.map((x, i) => ({ label: x[0], data: x[4], borderColor: i ? '#C8102E' : '#1D4ED8', backgroundColor: 'rgba(29,78,216,.08)', fill: !i, tension: .4, yAxisID: i ? 'y1' : 'y' })) }, options: { plugins: { legend: { labels: { boxWidth: 12, font: { size: 11 } } } }, scales: { y1: { position: 'right', grid: { drawOnChartArea: false } } } } });
};

// ================= DASHBOARD EXECUTIVO =================
S.telas.exec = async () => {
  const e = await api('/plataforma/executivo');
  S.exec = e;
  return `
${head('Dashboard Executivo', 'Visão consolidada para a diretoria · todas as áreas · calculado a partir da execução registrada na plataforma', '')}
<div class="grid cards-4" style="margin-bottom:18px">
  ${kpiCard('cap', 'linear-gradient(135deg,#1D4ED8,#2563EB)', e.cursosConcluidos, 'Cursos concluídos', '', true)}
  ${kpiCard('cal', 'linear-gradient(135deg,#0E4A5C,#13586E)', e.execucaoCalendario + '%', 'Calendário 2026 executado', '', true)}
  ${kpiCard('check', 'linear-gradient(135deg,#1F9D6B,#34c98b)', e.aderencia + '%', 'Score médio dos checklists', '', true)}
  ${kpiCard('kanban', 'linear-gradient(135deg,#C8102E,#ef4d63)', e.slaAcoes + '%', 'Ações concluídas no prazo', '', true)}
</div>
<div class="grid cards-2" style="margin-bottom:16px">
  <div class="card p"><div class="sect-title">Saúde das áreas</div><div class="sect-sub">Índice composto: 40% metas + 30% checklists + 30% execução do plano</div><canvas id="ex1" height="170"></canvas></div>
  <div class="card p"><div class="sect-title">Engajamento</div><div class="sect-sub">Usuários cadastrados × ativos por área</div><canvas id="ex2" height="170"></canvas></div>
</div>
<div class="card p"><div class="between"><div><div class="sect-title">Painel por área</div><div class="sect-sub">Clique para abrir a área</div></div></div>
<div style="overflow-x:auto"><table><thead><tr><th>Área</th><th>Responsável</th><th>Metas (ating.)</th><th>Execução do plano</th><th>Checklists</th><th>Vencidas</th><th>Índice</th></tr></thead><tbody>
${e.areas.map(a => `<tr style="cursor:pointer" onclick="openArea('${a.id}')"><td><b>${esc(a.nome)}</b></td><td>${esc(a.resp)}</td><td><span class="tag ${a.meta >= 100 ? 'green' : a.meta >= 90 ? 'amber' : 'red'}">${a.meta}%</span></td><td><div style="min-width:90px">${prog(a.execucao)}<span class="mini">${a.execucao}% de ${a.acoes}</span></div></td><td>${a.checklists ? `<span class="tag ${a.checklist >= 80 ? 'green' : 'amber'}">${a.checklist}</span>` : '<span class="mini">—</span>'}</td><td>${a.vencidas ? `<span class="tag red">${a.vencidas}</span>` : '<span class="mini">0</span>'}</td><td><b>${a.indice}</b></td></tr>`).join('')}
</tbody></table></div></div>`;
};
S.depois.exec = () => {
  const e = S.exec;
  grafico('ex1', { type: 'radar', data: { labels: e.areas.map(a => a.nome.replace(/^(Gestão de |Gerência |Supervisão )/, '')), datasets: [{ label: 'Índice', data: e.areas.map(a => a.indice), borderColor: '#1D4ED8', backgroundColor: 'rgba(29,78,216,.15)' }] }, options: { plugins: { legend: { display: false } }, scales: { r: { suggestedMin: 0, suggestedMax: 100 } } } });
  grafico('ex2', { type: 'bar', data: { labels: e.engajamento.map(x => x.grupo), datasets: [{ label: 'Usuários', data: e.engajamento.map(x => x.usuarios), backgroundColor: '#C9D2D7' }, { label: 'Ativos', data: e.engajamento.map(x => x.ativos), backgroundColor: '#0B3D4D' }] }, options: { plugins: { legend: { labels: { boxWidth: 12 } } } } });
};

// ================= CALENDÁRIO =================
S.calMarca = null;
S.telas.cal = () => {
  if (!S.calMarca) S.calMarca = S.D.marcas[0];
  return `
${head('Calendário Comercial Integrado 2026', 'Campanhas das marcas. Clique numa campanha para ver o que cada área executa antes da data e gerar as atividades no plano de ação.', pode('cal', 2) ? '<button class="btn red" onclick="novaCampanha()">+ Nova campanha</button>' : '')}
<div class="between" style="margin-bottom:16px"><div class="segmented" id="brandSeg">${S.D.marcas.map(m => `<button class="${m === S.calMarca ? 'on' : ''}" onclick="setBrand(${esc(JSON.stringify(m))})">${esc(m)}</button>`).join('')}</div>
<div class="mini">Régua de planejamento: D-120 a D-0 · governança ativa entre áreas</div></div>
<div id="calBody"></div>`;
};
S.depois.cal = () => renderCal();
function setBrand(m) { S.calMarca = m; document.querySelectorAll('#brandSeg button').forEach(b => b.classList.toggle('on', b.textContent === m)); renderCal(); }
function renderCal() {
  const por = {}; MESES.forEach(m => por[m] = []);
  (S.D.cal[S.calMarca] || []).forEach(c => por[c[0]].push(c));
  const hoje = hojeISO();
  document.getElementById('calBody').innerHTML = `<div class="year-grid">${MESES.map(m => `<div class="month"><div class="mh"><span>${MESNOME[m]}</span><span class="mini">${por[m].length} camp.</span></div><div class="mb">${por[m].length ? por[m].map(c => `<div class="cev" onclick="openCampaign(${c[3]})" style="${c[5] < hoje ? 'opacity:.6' : ''}"><span class="bar" style="background:${COR(S.calMarca)}"></span><div><div class="cev-n">${esc(c[1])}</div><div class="mini">${esc(c[2])}${c[4] <= hoje && c[5] >= hoje ? ' · <b style="color:var(--green)">no ar</b>' : ''}</div></div></div>`).join('') : '<div class="mini" style="padding:6px 2px">—</div>'}</div></div>`).join('')}</div>`;
}
function acharCampanha(cid) { for (const m of S.D.marcas) { const c = (S.D.cal[m] || []).find(x => x[3] === cid); if (c) return { marca: m, c }; } return null; }
function openCampaign(cid) {
  const f = acharCampanha(cid); if (!f) return;
  const { marca, c } = f;
  const areas = S.D.areaOrder.map(id => ({ id, a: AREA(id) })).filter(x => x.a.fases);
  abrirModal(`${esc(c[1])} · ${esc(marca)}`, `<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:8px"><span class="tag" style="background:${COR(marca)}22;color:${COR(marca)}">${esc(marca)}</span><span class="tag gray">${esc(c[2])}/2026</span><span class="tag blue">${areas.length} áreas integradas</span></div>
  <p class="mini" style="margin:0 0 14px">Cada área executa suas atividades antes da data, seguindo a régua D-X. ${pode('cal', 2) ? 'Use o botão abaixo para criar essas atividades no plano de ação de cada área, com prazos calculados a partir do início da campanha.' : ''}</p>
  ${areas.map(({ id, a }) => `<div class="phase" style="margin-bottom:8px" id="cp${id}"><div class="ph" onclick="document.getElementById('cp${id}').classList.toggle('open')"><div class="num" style="background:${a.cor}">${ic(a.ic)}</div><div style="flex:1"><div style="font-weight:700;font-size:13.5px">${esc(a.nome)} <span class="mini">· ${esc(a.fases[0][0].match(/D-\d+/)?.[0] || '')} a D-0</span></div></div><div class="chev" style="color:var(--muted)">${ic('chev')}</div></div><div class="pbody">${a.fases.map(x => `<div class="act"><span class="dotc" style="background:${a.cor}"></span><b>${esc(x[0])}</b> — ${esc(x[2].join(' · '))}</div>`).join('')}</div></div>`).join('')}
  <div style="display:flex;gap:8px;margin-top:8px;flex-wrap:wrap">${pode('cal', 2) ? `<button class="btn red" onclick="gerarAcoesCampanha(${cid})">Gerar atividades no plano de ação</button>` : ''}<button class="btn ghost" onclick="fecharModal()">Fechar</button>${pode('cal', 2) ? `<button class="btn ghost" style="margin-left:auto;color:var(--red)" onclick="excluirCampanha(${cid})">Excluir campanha</button>` : ''}</div>`, true);
}
function novaCampanha() {
  abrirModal('Nova campanha', `<div class="form-grid"><div class="full"><label class="lbl">Nome</label><input class="inp" id="cpNome" placeholder="ex.: Natal Premiado"></div>
  <div class="full"><label class="lbl">Marca</label><select class="inp" id="cpMarca">${opcoes(S.D.marcas, S.calMarca)}</select></div>
  <div><label class="lbl">Início</label><input class="inp" type="date" id="cpIni"></div><div><label class="lbl">Fim</label><input class="inp" type="date" id="cpFim"></div></div>
  <div style="display:flex;gap:8px;margin-top:14px"><button class="btn red" onclick="salvarCampanha()">Salvar campanha</button><button class="btn ghost" onclick="fecharModal()">Cancelar</button></div>`);
}
async function salvarCampanha() {
  await chamar(() => api('/campanhas', { metodo: 'POST', corpo: { nome: val('cpNome'), marca: val('cpMarca'), inicio: val('cpIni'), fim: val('cpFim') } }));
  S.calMarca = val('cpMarca'); await recarregarBase(); fecharModal(); toast('Campanha incluída no calendário.', 'ok'); go('cal');
}
async function excluirCampanha(cid) {
  if (!confirm('Excluir esta campanha do calendário?')) return;
  await chamar(() => api(`/campanhas/${cid}`, { metodo: 'DELETE' }));
  await recarregarBase(); fecharModal(); toast('Campanha excluída.', 'ok'); go('cal');
}

// ================= COMITÊ =================
S.telas.comite = async () => {
  const c = await api('/comite');
  S.comite = c;
  const prox = c.reunioes.filter(r => r.status === 'Agendada').sort((a, b) => new Date(a.data) - new Date(b.data))[0];
  const hist = c.reunioes.filter(r => r.status === 'Realizada');
  const ed = pode('comite', 2);
  const stTag = s => s === 'Concluído' ? 'green' : s === 'Em curso' ? 'amber' : 'red';
  return `
${head('Comitê Comercial', 'Reuniões · pautas · atas · encaminhamentos por área', ed ? '<button class="btn red" onclick="novaReuniao()">+ Nova reunião</button>' : '')}
<div class="grid cards-3" style="margin-bottom:18px">${kpiCard('kanban', 'linear-gradient(135deg,#E8A23C,#f0c25a)', c.kpis.abertos, 'Encaminhamentos abertos', '', true)}${kpiCard('check', 'linear-gradient(135deg,#C8102E,#ef4d63)', c.kpis.vencidos, 'Vencidos', '', false)}${kpiCard('medal', 'linear-gradient(135deg,#1F9D6B,#34c98b)', c.kpis.concluidos, 'Concluídos', '', true)}</div>
<div class="grid cards-3"><div class="card p" style="grid-column:span 2">
${prox ? `<div class="between"><div class="sect-title">${esc(prox.titulo)}</div><span class="tag blue">${dataHoraBR(prox.data)}</span></div><div class="sect-sub">${prox.presidente ? 'Presidido por ' + esc(prox.presidente) : ''}${prox.participantes ? ' · ' + esc(prox.participantes) : ''}</div>
<div style="font-weight:700;font-size:13px;margin:14px 0 8px">📋 Pauta (por área)</div>
${prox.pauta.length ? prox.pauta.map((p, i) => `<div class="row-item"><div class="rank-pos">${i + 1}</div><div style="flex:1"><div class="ttl">${esc(p.item)}</div><div class="meta">${esc(AREA(p.area)?.nome || p.area || '')}</div></div></div>`).join('') : '<div class="mini">Pauta a definir.</div>'}
${ed ? `<div style="display:flex;gap:8px;margin-top:12px"><button class="btn red" onclick="registrarAta(${prox.id})">Registrar ata e encaminhamentos</button></div>` : ''}` : `<div class="vazio">Nenhuma reunião agendada.${ed ? ' Use “+ Nova reunião”.' : ''}</div>`}
<div style="font-weight:700;font-size:13px;margin:20px 0 8px">✅ Encaminhamentos</div>
${c.encaminhamentos.length ? `<div style="overflow-x:auto"><table><thead><tr><th>Encaminhamento</th><th>Área</th><th>Responsável</th><th>Prazo</th><th>Status</th></tr></thead><tbody>
${c.encaminhamentos.map(e => { const venc = e.status !== 'Concluído' && e.prazo && String(e.prazo).slice(0, 10) < hojeISO(); return `<tr><td><b>${esc(e.texto)}</b><div class="mini">${esc(e.reuniao)} · ${new Date(e.reuniao_data).toLocaleDateString('pt-BR')}</div></td><td>${esc(e.area_nome || '—')}</td><td>${esc(e.responsavel || '—')}</td><td style="${venc ? 'color:var(--red);font-weight:700' : ''}">${dataBR(e.prazo)}</td><td>${pode('comite') ? `<select onchange="statusEnc(${e.id},this.value)" style="padding:5px 8px;border:1px solid var(--line);border-radius:8px;font-size:12px">${opcoes(['Pendente', 'Em curso', 'Concluído'], e.status)}</select>` : `<span class="tag ${stTag(e.status)}">${e.status}</span>`}</td></tr>`; }).join('')}
</tbody></table></div>` : '<div class="vazio">Nenhum encaminhamento registrado.</div>'}
</div>
<div class="card p"><div class="sect-title">Histórico de atas</div><div class="sect-sub">Reuniões realizadas</div>${hist.map(r => `<div class="row-item" style="cursor:pointer" onclick="verAta(${r.id})"><div class="ico" style="background:#EEF3F5">${ic('book')}</div><div style="flex:1"><div class="ttl">${esc(r.titulo)}</div><div class="meta">${new Date(r.data).toLocaleDateString('pt-BR')}</div></div><span class="tag green">Ata</span></div>`).join('') || '<div class="mini">Nenhuma ata ainda.</div>'}</div></div>`;
};
function novaReuniao() {
  const amanha = new Date(Date.now() + 864e5).toISOString().slice(0, 10);
  abrirModal('Nova reunião do comitê', `<div class="form-grid"><div class="full"><label class="lbl">Título</label><input class="inp" id="rTit" value="Comitê Semanal Comercial"></div>
  <div><label class="lbl">Data e hora</label><input class="inp" type="datetime-local" id="rData" value="${amanha}T16:00"></div><div><label class="lbl">Presidente</label><input class="inp" id="rPres" value="Gilberto (Diretor Executivo)"></div>
  <div class="full"><label class="lbl">Participantes</label><input class="inp" id="rPart" placeholder="Nomes separados por vírgula"></div></div>
  <div class="sect-title" style="font-size:14px;margin-top:14px">Pauta</div><div id="rPauta">${[0, 1, 2].map(i => linhaPauta(i)).join('')}</div>
  <button class="linkbtn" style="margin-top:6px" onclick="document.getElementById('rPauta').insertAdjacentHTML('beforeend',linhaPauta(Date.now()))">+ item de pauta</button>
  <div style="display:flex;gap:8px;margin-top:14px"><button class="btn red" onclick="salvarReuniao()">Agendar reunião</button><button class="btn ghost" onclick="fecharModal()">Cancelar</button></div>`, true);
}
function linhaPauta() { return `<div class="form-grid pauta" style="margin-bottom:8px;grid-template-columns:2fr 1fr"><input class="inp pi" placeholder="Item de pauta"><select class="inp pa">${opcoes([['', 'Área'], ...S.D.areaOrder.map(id => [id, AREA(id).nome])])}</select></div>`; }
async function salvarReuniao() {
  const pauta = [...document.querySelectorAll('#rPauta .pauta')].map(p => ({ item: p.querySelector('.pi').value, area: p.querySelector('.pa').value })).filter(p => p.item.trim());
  await chamar(() => api('/comite/reunioes', { metodo: 'POST', corpo: { titulo: val('rTit'), data: val('rData'), presidente: val('rPres'), participantes: val('rPart'), pauta } }));
  fecharModal(); toast('Reunião agendada.', 'ok'); go('comite');
}
function registrarAta(rid) {
  const r = S.comite.reunioes.find(x => x.id === rid);
  abrirModal('Ata · ' + esc(r.titulo), `<label class="lbl">Ata (resumo da reunião, alinhamentos e posicionamentos)</label><textarea class="inp" id="ataTxt" style="min-height:140px">${esc(r.ata || '')}</textarea>
  <div class="sect-title" style="font-size:14px;margin-top:14px">Encaminhamentos <span class="mini">(cada um vira ação no plano da área)</span></div><div id="encs">${[0, 1].map(() => linhaEnc()).join('')}</div>
  <button class="linkbtn" style="margin-top:6px" onclick="document.getElementById('encs').insertAdjacentHTML('beforeend',linhaEnc())">+ encaminhamento</button>
  <div style="display:flex;gap:8px;margin-top:14px"><button class="btn red" onclick="salvarAta(${rid})">Salvar ata e encerrar reunião</button><button class="btn ghost" onclick="fecharModal()">Cancelar</button></div>`, true);
}
function linhaEnc() { return `<div class="form-grid enc" style="margin-bottom:8px;grid-template-columns:2fr 1fr 1fr 1fr"><input class="inp et" placeholder="Encaminhamento"><select class="inp ea">${opcoes([['', 'Área'], ...S.D.areaOrder.map(id => [id, AREA(id).nome])])}</select><input class="inp er" placeholder="Responsável"><input class="inp ep" type="date"></div>`; }
async function salvarAta(rid) {
  const encs = [...document.querySelectorAll('#encs .enc')].map(e => ({ texto: e.querySelector('.et').value, area_id: e.querySelector('.ea').value, responsavel: e.querySelector('.er').value, prazo: e.querySelector('.ep').value })).filter(e => e.texto.trim());
  const r = await chamar(() => api(`/comite/reunioes/${rid}`, { metodo: 'PATCH', corpo: { ata: val('ataTxt'), status: 'Realizada' } }));
  for (const e of encs) await chamar(() => api('/comite/encaminhamentos', { metodo: 'POST', corpo: { ...e, reuniao_id: rid } }));
  fecharModal(); pontosToast(r, `Ata registrada${encs.length ? ` · ${encs.length} encaminhamento(s) enviados aos planos das áreas` : ''}`); await recarregarBase(); go('comite');
}
function verAta(rid) {
  const r = S.comite.reunioes.find(x => x.id === rid);
  const encs = S.comite.encaminhamentos.filter(e => e.reuniao_id === rid);
  abrirModal(esc(r.titulo) + ' · ' + new Date(r.data).toLocaleDateString('pt-BR'), `<div class="mini" style="margin-bottom:10px">${r.presidente ? 'Presidido por ' + esc(r.presidente) : ''}${r.participantes ? ' · ' + esc(r.participantes) : ''}</div>
  <div style="white-space:pre-wrap;font-size:13.5px;line-height:1.6">${esc(r.ata || 'Ata não registrada.')}</div>
  ${encs.length ? `<div class="sect-title" style="font-size:14px;margin-top:14px">Encaminhamentos</div>${encs.map(e => `<div class="row-item"><div style="flex:1"><div class="ttl">${esc(e.texto)}</div><div class="meta">${esc(e.area_nome || '')} · ${esc(e.responsavel || '')} · ${dataBR(e.prazo)}</div></div><span class="tag gray">${e.status}</span></div>`).join('')}` : ''}`, true);
}
async function statusEnc(id, st) { await chamar(() => api(`/comite/encaminhamentos/${id}`, { metodo: 'PATCH', corpo: { status: st } })); toast('Status atualizado.', 'ok'); }

// ================= UNIVERSIDADE =================
S.telas.univ = () => {
  const todos = S.D.areaOrder.flatMap(id => AREA(id).cursos.map(c => ({ id, c })));
  const emCurso = todos.filter(x => x.c[2] > 0 && x.c[2] < 100).sort((a, b) => b.c[2] - a.c[2])[0] || todos.find(x => x.c[2] < 100) || todos[0];
  const concl = todos.filter(x => x.c[2] === 100).length;
  const a0 = AREA(emCurso.id);
  return `
${head('Universidade Corporativa', `Trilhas por cargo e por área · ${todos.length} cursos · ${concl} concluídos por você`, '<button class="btn red" onclick="meusCertificados()">Meus certificados</button>')}
<div class="card p" style="margin-bottom:18px;display:flex;align-items:center;gap:20px;background:linear-gradient(135deg,var(--petrol),var(--royal));color:#fff;border:0">
<div style="flex:1"><div style="font-size:12px;opacity:.85;text-transform:uppercase;letter-spacing:1px">${emCurso.c[2] > 0 ? 'Continue de onde parou' : 'Comece por aqui'}</div><div style="font-size:20px;font-weight:800;margin:6px 0">${esc(emCurso.c[0])}</div><div style="font-size:13px;opacity:.9">${esc(a0.nome)} · ${esc(emCurso.c[1])}</div><div style="max-width:360px;margin-top:10px">${prog(emCurso.c[2], 'bar-red')}<div class="mini" style="color:#CDE0E7;margin-top:4px">${emCurso.c[2]}% concluído</div></div></div>
<button class="btn" style="background:#fff;color:var(--petrol);border:0" onclick="openArea('${emCurso.id}','treino');setTimeout(()=>openCourse('${emCurso.id}',${AREA(emCurso.id).cursos.indexOf(emCurso.c)}),300)">${emCurso.c[2] > 0 ? 'Continuar' : 'Iniciar'} ▶</button></div>
<div class="sect-title" style="margin-bottom:10px">Trilhas por área</div>
<div class="grid cards-3">${S.D.areaOrder.map(id => { const a = AREA(id); const avg = Math.round(a.cursos.reduce((s, c) => s + c[2], 0) / (a.cursos.length || 1)); return `<div class="card p cl" onclick="openArea('${id}','treino')"><div class="between"><div class="ico" style="width:42px;height:42px;border-radius:11px;background:${a.grad};color:#fff;display:grid;place-items:center">${ic('cap')}</div><span class="tag gray">${a.cursos.length} cursos</span></div><div class="sect-title" style="margin-top:12px">${esc(a.nome)}</div><div class="mini" style="margin-bottom:8px">${esc(a.cursos.map(c => c[0]).join(' · '))}</div>${prog(avg, avg === 100 ? 'bar-green' : '')}<div class="mini" style="margin-top:6px">${avg}% da trilha</div></div>`; }).join('')}</div>`;
};

// ================= GAMIFICAÇÃO =================
S.telas.game = async () => {
  const g = await api('/gamificacao');
  const n = g.nivel;
  const cores = ['#E0A82E', '#9AA7AE', '#cd7f32', '#0E4A5C', '#1D4ED8', '#13586E', '#7A2E8E', '#0E7C66'];
  return `
${head('Gamificação & Bonificação', 'Pontos por execução real — treinamento, checklists, ações e metas batidas. Os pontos guiam o desenvolvimento e reforçam o programa de bônus.', '')}
<div class="grid cards-3" style="margin-bottom:18px">
<div class="card p" style="grid-column:span 2;display:flex;align-items:center;gap:22px;background:linear-gradient(135deg,var(--petrol),var(--royal));color:#fff;border:0"><div class="medal" style="width:78px;height:78px;background:linear-gradient(135deg,${n.cor},#f7d774);font-size:13px;text-align:center">${esc(n.nome.toUpperCase())}</div><div style="flex:1"><div style="font-size:12px;opacity:.85;text-transform:uppercase;letter-spacing:1px">Seu nível${g.posicao ? ` · ${g.posicao}º no ranking` : ''}</div><div style="font-size:24px;font-weight:800;margin:4px 0">${esc(n.nome)} · ${g.total.toLocaleString('pt-BR')} pontos</div><div style="max-width:380px">${prog(n.pct, 'bar-red')}<div class="mini" style="color:#CDE0E7;margin-top:6px">${n.proximo ? `Faltam ${n.faltam.toLocaleString('pt-BR')} pts para ${esc(n.proximo)}` : 'Nível máximo alcançado 👑'}</div></div></div></div>
<div class="card p"><div class="sect-title">Níveis e faixas</div>
${g.niveis.map((x, i) => { const prox = g.niveis[i + 1]; const atual = x.nome === n.nome; return `<div class="row-item"><div class="medal" style="width:30px;height:30px;background:${x.cor}"></div><div style="flex:1"><div class="ttl">${x.nome}</div><div class="meta">${x.min.toLocaleString('pt-BR')}${prox ? '–' + (prox.min - 1).toLocaleString('pt-BR') : '+'} pts</div></div><span class="tag ${atual ? 'amber' : g.total >= x.min ? 'green' : 'gray'}">${atual ? 'Atual' : g.total >= x.min ? '✓' : '—'}</span></div>`; }).join('')}</div></div>
<div class="grid cards-2" style="margin-bottom:18px">
<div class="card p"><div class="sect-title">Como ganhar pontos</div><div class="sect-sub">Regras objetivas — pontuação automática pela execução</div>
<table><thead><tr><th>Ação</th><th>Pontos</th></tr></thead><tbody>
${[['Concluir um curso da trilha', g.regras.curso], ['Concluir uma aula', g.regras.aula], ['Aplicar um checklist', g.regras.checklist], ['Checklist com score ≥ 90% (bônus)', g.regras.checklist_bonus], ['Concluir uma ação do plano no prazo', g.regras.acao_prazo], ['Registrar a ata do comitê', g.regras.comite], ['Bater a meta da marca (100–109%)', g.regras.meta_batida], ['Acelerador de meta (≥110%)', g.regras.meta_acelerador]].map(r => `<tr><td>${r[0]}</td><td><span class="tag ${r[1] >= 100 ? 'green' : 'blue'}">+${r[1]}</span></td></tr>`).join('')}
</tbody></table></div>
<div class="card p"><div class="sect-title">Meu extrato</div><div class="sect-sub">Últimos créditos</div>
${g.extrato.map(e => `<div class="row-item"><div style="flex:1"><div class="ttl" style="font-size:13px">${esc(e.motivo)}</div><div class="meta">${new Date(e.criado_em).toLocaleString('pt-BR')}</div></div><span class="tag green">+${e.pontos}</span></div>`).join('') || '<div class="vazio">Execute atividades na plataforma para ganhar pontos.</div>'}</div></div>
<div class="grid cards-3">
<div class="card p"><div class="sect-title">Minhas medalhas</div><div class="sect-sub">${g.medalhas.filter(m => m[2]).length} conquistadas</div><div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-top:6px">${g.medalhas.map(m => `<div style="text-align:center;${m[2] ? '' : 'opacity:.3;filter:grayscale(1)'}"><div class="medal" style="margin:0 auto;background:#EEF3F5;color:#0B3D4D;font-size:22px">${m[0]}</div><div class="mini" style="margin-top:4px">${m[1]}</div></div>`).join('')}</div></div>
<div class="card p" style="grid-column:span 2"><div class="sect-title">Ranking geral de desenvolvimento</div><div class="sect-sub">Pontos acumulados por execução</div>${g.ranking.map((r, i) => `<div class="rank-row ${r.id === S.D.usuario.id ? 'me' : ''}"><div class="rank-pos" style="color:${cores[i % cores.length]};font-size:16px">${i + 1}º</div><div class="who" style="background:${cores[i % cores.length]}">${iniciais(r.nome)}</div><div style="flex:1"><div class="ttl">${esc(r.nome)}</div><div class="meta">${esc(r.area)}</div></div><b>${r.pontos.toLocaleString('pt-BR')} pts</b></div>`).join('')}</div></div>`;
};

// ================= ASSISTENTE =================
S.telas.ia = () => `
${head('Assistente Milla', 'Consulta os guias, rotinas, checklists e régua de campanha de cada área', '<span class="prev-tag">IA generativa: fase evolutiva</span>')}
<div class="grid cards-3"><div class="card" style="grid-column:span 2"><div style="display:flex;flex-direction:column;height:520px">
<div style="flex:1;overflow-y:auto;padding:18px;display:flex;flex-direction:column;gap:14px" id="iaStream">
<div class="bub ai" style="max-width:85%;padding:11px 14px;border-radius:14px;font-size:13.5px;line-height:1.5;background:#EEF3F5">Olá, ${esc(S.D.usuario.nome.split(' ')[0])}! Pergunte sobre rotinas, checklists, pilares ou atividades de campanha de qualquer área — eu busco a resposta nos guias cadastrados.</div></div>
<div style="display:flex;gap:10px;padding:14px;border-top:1px solid var(--line)"><input id="iaInput" class="inp" placeholder="Ex.: qual a rotina diária do gerente regional?" onkeydown="if(event.key==='Enter')iaSend()"><button class="btn red" onclick="iaSend()">Enviar</button></div></div></div>
<div style="display:flex;flex-direction:column;gap:16px"><div class="card p"><div class="sect-title">Sugestões</div>${['Checklist de auditoria de VM', 'Como montar o OTB?', 'Régua de CRM da campanha', 'Rotina diária do gerente regional', 'Oferta financeira do cartão'].map(s => `<div class="row-item" style="cursor:pointer" onclick="iaSuggest(${esc(JSON.stringify(s))})"><div class="ico" style="background:#EEF3F5">${ic('spark')}</div><div class="ttl" style="flex:1">${s}</div></div>`).join('')}</div>
<div class="card p" style="background:linear-gradient(135deg,var(--royal),#1736a8);color:#fff;border:0"><div class="sect-title" style="color:#fff">📚 Base de conhecimento</div><div style="font-size:13px;color:#dbe5ff;margin-top:8px;line-height:1.6">${S.D.areaOrder.length} guias de área, checklists e calendário comercial. Na fase evolutiva, a IA generativa (operadora contratada pelo Grupo Milla) passa a redigir as respostas a partir desta mesma base.</div></div></div></div>`;
function iaPush(html, me) {
  const s = document.getElementById('iaStream'); const d = document.createElement('div');
  d.style.cssText = 'max-width:85%;padding:11px 14px;border-radius:14px;font-size:13.5px;line-height:1.5;' + (me ? 'align-self:flex-end;background:var(--royal);color:#fff' : 'background:#EEF3F5');
  d.innerHTML = html; s.appendChild(d); s.scrollTop = s.scrollHeight;
}
async function iaSend() {
  const i = document.getElementById('iaInput'); const q = i.value.trim(); if (!q) return;
  iaPush(esc(q), true); i.value = '';
  try {
    const r = await api('/plataforma/assistente', { metodo: 'POST', corpo: { pergunta: q } });
    if (!r.resposta) return iaPush('Não encontrei isso nos guias cadastrados. Tente outras palavras (ex.: nome da área, “checklist”, “rotina”, “campanha”).');
    iaPush(r.resposta.map(t => `<div style="margin-bottom:8px"><b>${esc(t.area)} — ${esc(t.titulo)}</b><ul style="margin:4px 0 0 18px;padding:0">${t.itens.map(x => `<li>${esc(x)}</li>`).join('')}</ul></div>`).join('') + `<div class="mini">Fonte: ${esc(r.fontes.join(' · '))}</div>`);
  } catch (e) { iaPush(esc(e.message)); }
}
function iaSuggest(s) { document.getElementById('iaInput').value = s; iaSend(); }

// ================= CMS =================
S.telas.cms = async () => {
  const l = await api('/conteudos');
  S.cms = l;
  const ed = pode('cms', 2);
  const tipos = ['Página', 'Banner', 'Comunicado', 'Notícia'];
  return `
${head('CMS / Conteúdos', 'Páginas, banners, comunicados e notícias da plataforma. Comunicados publicados aparecem no 📣 do topo.', ed ? '<button class="btn red" onclick="editarConteudo()">+ Novo conteúdo</button>' : '')}
<div class="grid cards-4" style="margin-bottom:18px">${tipos.map(t => kpiCard('layers', 'linear-gradient(135deg,#0E4A5C,#1D4ED8)', l.filter(c => c.tipo === t).length, t + 's', `${l.filter(c => c.tipo === t && c.status === 'Publicado').length} publicados`, true)).join('')}</div>
<div class="card p"><div class="sect-title">Conteúdos</div>${l.length ? `<div style="overflow-x:auto"><table><thead><tr><th>Título</th><th>Tipo</th><th>Área</th><th>Status</th><th>Criado</th><th></th></tr></thead><tbody>
${l.map(c => `<tr><td><b>${esc(c.titulo)}</b></td><td><span class="tag blue">${c.tipo}</span></td><td>${esc(c.area_nome || 'Geral')}</td><td><span class="tag ${c.status === 'Publicado' ? 'green' : 'gray'}">${c.status}</span></td><td class="mini">${new Date(c.criado_em).toLocaleDateString('pt-BR')}</td><td style="white-space:nowrap"><button class="linkbtn" onclick="verConteudo(${c.id})">Ver</button>${ed ? ` · <button class="linkbtn" onclick="editarConteudo(${c.id})">Editar</button>` : ''}</td></tr>`).join('')}
</tbody></table></div>` : '<div class="vazio">Nenhum conteúdo cadastrado.</div>'}</div>`;
};
function verConteudo(id) { const c = S.cms.find(x => x.id === id); abrirModal(esc(c.titulo), `<div style="display:flex;gap:8px;margin-bottom:12px"><span class="tag blue">${c.tipo}</span><span class="tag ${c.status === 'Publicado' ? 'green' : 'gray'}">${c.status}</span><span class="tag gray">${esc(c.area_nome || 'Geral')}</span></div><div style="white-space:pre-wrap;font-size:14px;line-height:1.65">${esc(c.corpo || '')}</div>`, true); }
function editarConteudo(id) {
  const c = id ? S.cms.find(x => x.id === id) : { tipo: 'Comunicado', status: 'Rascunho' };
  abrirModal(id ? 'Editar conteúdo' : 'Novo conteúdo', `<div class="form-grid"><div class="full"><label class="lbl">Título</label><input class="inp" id="ctTit" value="${esc(c.titulo || '')}"></div>
  <div><label class="lbl">Tipo</label><select class="inp" id="ctTipo" ${id ? 'disabled' : ''}>${opcoes(['Comunicado', 'Página', 'Banner', 'Notícia'], c.tipo)}</select></div>
  <div><label class="lbl">Área</label><select class="inp" id="ctArea" ${id ? 'disabled' : ''}>${opcoes([['', 'Geral'], ...S.D.areaOrder.map(a => [a, AREA(a).nome])], c.area_id || '')}</select></div>
  <div class="full"><label class="lbl">Texto</label><textarea class="inp" id="ctCorpo" style="min-height:180px">${esc(c.corpo || '')}</textarea></div>
  <div><label class="lbl">Status</label><select class="inp" id="ctSt">${opcoes(['Rascunho', 'Publicado'], c.status)}</select></div></div>
  <div style="display:flex;gap:8px;margin-top:14px"><button class="btn red" onclick="salvarConteudo(${id || 0})">Salvar</button><button class="btn ghost" onclick="fecharModal()">Cancelar</button>${id ? `<button class="btn ghost" style="margin-left:auto;color:var(--red)" onclick="excluirConteudo(${id})">Excluir</button>` : ''}</div>`, true);
}
async function salvarConteudo(id) {
  const corpo = { titulo: val('ctTit'), tipo: val('ctTipo'), area_id: val('ctArea'), corpo: val('ctCorpo'), status: val('ctSt') };
  await chamar(() => api(id ? `/conteudos/${id}` : '/conteudos', { metodo: id ? 'PATCH' : 'POST', corpo }));
  await recarregarBase(); fecharModal(); toast('Conteúdo salvo.', 'ok'); go('cms');
}
async function excluirConteudo(id) {
  if (!confirm('Excluir este conteúdo?')) return;
  await chamar(() => api(`/conteudos/${id}`, { metodo: 'DELETE' }));
  await recarregarBase(); fecharModal(); toast('Conteúdo excluído.', 'ok'); go('cms');
}

Object.assign(window, { setBrand, openCampaign, novaCampanha, salvarCampanha, excluirCampanha, novaReuniao, linhaPauta, salvarReuniao, registrarAta, linhaEnc, salvarAta,
  verAta, statusEnc, iaSend, iaSuggest, verConteudo, editarConteudo, salvarConteudo, excluirConteudo });
