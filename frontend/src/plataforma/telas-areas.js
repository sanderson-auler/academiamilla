// Áreas: hub e workspace (visão, indicadores, metas, plano de ação, checklists, treinamentos, rotina, guia).
import { S, api, esc, ic, iniciais, prog, head, kpiCard, abrirModal, fecharModal, toast, pontosToast, chamar, grafico, destruirGraficos,
  marcarAtivo, trilha, dataBR, dataCurta, hojeISO, pode, opcoes, val, recarregarBase, Chart } from './nucleo.js';
import { rotinaGuiaHTML, conversaHTML } from './telas-guia.js';

const AREA = id => S.D.areas[id];
const MARCAS = () => S.D.marcas;
const COR = m => S.D.brandcolor[m] || '#5B6B73';

// ---------- Hub ----------
S.telas.areas = () => `
${head('Áreas do Grupo Milla', 'Cada área tem metas, indicadores, plano de ação, checklists, treinamentos e rotina — segmentados por marca e integrados ao calendário.', '')}
<div class="card p" style="margin-bottom:18px"><div class="between"><div class="sect-title">Marcas do grupo</div><span class="mini">${S.D.lojas.length} lojas ativas</span></div>
<div style="display:flex;gap:14px;flex-wrap:wrap;margin-top:12px">${MARCAS().map(m => `<div style="display:flex;align-items:center;gap:10px;padding:10px 18px;border-radius:12px;border:1px solid var(--line);background:#fff"><div style="width:30px;height:30px;border-radius:8px;background:${COR(m)};color:#fff;display:grid;place-items:center;font-weight:900">${esc(m[0])}</div><span style="font-weight:800;letter-spacing:.5px;color:${COR(m)}">${esc(m)}</span><span class="mini">${S.D.lojas.filter(l => l.marca === m).length} lojas</span></div>`).join('')}</div></div>
<div class="grid cards-3">
  ${S.D.areaOrder.map(id => { const a = AREA(id); return `<div class="card area-card" onclick="openArea('${id}')">
    <div class="hd" style="background:${a.grad}"><div class="ic">${ic(a.ic)}</div><div><b style="display:block;font-size:15px">${esc(a.nome)}</b><small style="font-size:11.5px;opacity:.85">${esc(a.cargo)} · ${esc(a.resp)}</small></div></div>
    <div class="bd"><p style="margin:0;font-size:12.5px;color:var(--muted);line-height:1.5">${esc(a.tag)}</p>
      <div class="chips"><span class="chip-min">Metas por marca</span><span class="chip-min">${a.kpis.length} indicadores</span><span class="chip-min">${a.checklists.length} checklists</span><span class="chip-min">${a.cursos.length} cursos</span></div>
    </div></div>`; }).join('')}
</div>`;

// ---------- Workspace ----------
const ABAS = [['visao', 'Visão Geral'], ['kpis', 'Indicadores'], ['metas', 'Metas'], ['acao', 'Plano de Ação'], ['check', 'Checklists'], ['treino', 'Treinamentos'], ['rotina', 'Rotina & Atividades'], ['guia', 'Guia'], ['ia', '✨ Assistente IA']];

function openArea(id, aba) {
  destruirGraficos();
  fecharModal();
  const a = AREA(id); if (!a) return;
  S.cur = { area: id, tab: aba || 'visao', marca: 'Todas', acaoView: S.cur.acaoView || 'kanban' };
  marcarAtivo('area:' + id);
  trilha(`Academia Milla 360 · <a onclick="go('areas')">Áreas</a> · <b>${esc(a.nome)}</b>`);
  document.getElementById('view').innerHTML = `
  <div class="area-banner" style="background:${a.grad}"><div class="ic">${ic(a.ic)}</div>
    <div style="flex:1"><h1>${esc(a.nome)}</h1><p>${esc(a.papel)}</p></div>
    <div style="text-align:right"><div style="font-size:11px;opacity:.8;text-transform:uppercase;letter-spacing:1px">Responsável</div><div style="font-weight:700">${esc(a.resp)}</div><div style="font-size:12px;opacity:.85">${esc(a.cargo)}</div></div></div>
  <div class="subtabs" id="areaSub">${ABAS.map(t => `<button class="${t[0] === S.cur.tab ? 'on' : ''}" onclick="switchAreaTab('${t[0]}')">${t[1]}</button>`).join('')}</div>
  <div id="areaBody"></div>`;
  window.scrollTo(0, 0); document.getElementById('sidebar').classList.remove('open');
  renderAreaTab();
}
function switchAreaTab(t) { S.cur.tab = t; destruirGraficos(); document.querySelectorAll('#areaSub button').forEach((b, i) => b.classList.toggle('on', ABAS[i][0] === t)); renderAreaTab(); }
async function renderAreaTab() {
  const id = S.cur.area, a = AREA(id), el = document.getElementById('areaBody'), aba = S.cur.tab;
  if (!el) return;
  el.innerHTML = '<div class="carregando">Carregando…</div>';
  try {
    const html = await S.abasArea[aba](id, a);
    if (S.cur.area !== id || S.cur.tab !== aba) return;
    el.innerHTML = html;
    if (S.abasDepois[aba]) S.abasDepois[aba](id, a);
  } catch (e) { el.innerHTML = `<div class="card p"><b>Não foi possível carregar.</b><div class="mini">${esc(e.message)}</div></div>`; }
}
function setAreaMarca(m) { S.cur.marca = m; destruirGraficos(); renderAreaTab(); }
const barraMarcas = () => `<div class="segmented" style="margin-bottom:16px;flex-wrap:wrap">${['Todas', ...MARCAS()].map(m => `<button class="${(S.cur.marca || 'Todas') === m ? 'on' : ''}" onclick="setAreaMarca(${esc(JSON.stringify(m))})">${esc(m)}</button>`).join('')}</div>`;

// --- Visão Geral ---
S.abasArea.visao = (id, a) => `
<div class="grid cards-4" style="margin-bottom:18px">${a.kpis.slice(0, 4).map((k, i) => kpiCard(a.ic, a.grad, k[1], k[0], k[2], k[3], `openKpi('${id}',${i})`)).join('')}</div>
<div class="grid cards-2">
  <div class="card p"><div class="sect-title">Os pilares da área</div><div class="sect-sub">O que ${esc(a.resp)} acompanha</div>
    <div class="grid cards-2" style="margin-top:6px">${(a.pilares || []).map(p => `<div class="pillar"><h4><span class="dotc" style="background:${p[2]}"></span>${esc(p[0])}</h4><p>${esc(p[1])}</p></div>`).join('')}</div></div>
  <div style="display:flex;flex-direction:column;gap:16px">
    <div class="card p"><div class="sect-title">Atalhos da área</div>
      ${[['Metas da área', 'metas', 'medal'], ['Plano de ação', 'acao', 'kanban'], ['Aplicar checklist', 'check', 'check'], ['Treinamentos', 'treino', 'cap']].map(s => `<div class="row-item" style="cursor:pointer" onclick="switchAreaTab('${s[1]}')"><div class="ico" style="background:#EEF3F5">${ic(s[2])}</div><div class="ttl" style="flex:1">${s[0]}</div><span class="mini">→</span></div>`).join('')}
    </div>
    <div class="card p" style="background:${a.grad};color:#fff;border:0"><div class="sect-title" style="color:#fff">Integração no calendário</div>
      <div style="font-size:13px;color:rgba(255,255,255,.9);margin-top:8px;line-height:1.6">Esta área executa atividades específicas antes de cada data do calendário comercial. Veja a régua D-X em <b>Rotina & Atividades</b>.</div>
      <button class="btn" style="margin-top:12px;background:#fff;color:${a.cor};border:0" onclick="switchAreaTab('rotina')">Ver atividades da campanha</button></div>
  </div>
</div>`;

// --- Indicadores ---
S.abasArea.kpis = (id, a) => `
<div class="page-head" style="margin-bottom:14px"><div><h1 style="font-size:18px">Indicadores · ${esc(a.nome)}</h1><p>Clique em um indicador para abrir a análise${pode('acao') ? ' e registrar o valor atual' : ''}.</p></div></div>
<div class="grid cards-3" style="margin-bottom:18px">${a.kpis.map((k, i) => kpiCard(a.ic, a.grad, k[1], k[0], k[2], k[3], `openKpi('${id}',${i})`)).join('')}</div>
<div class="grid cards-2">
  <div class="card p"><div class="sect-title">Evolução dos principais indicadores</div><div class="sect-sub">Últimos 4 registros</div><canvas id="areaChart1" height="150"></canvas></div>
  <div class="card p"><div class="sect-title">Comparativo atual</div><div class="sect-sub">Último registro por indicador</div><canvas id="areaChart2" height="150"></canvas></div>
</div>`;
S.abasDepois.kpis = (id, a) => {
  const cols = ['#1D4ED8', '#C8102E', '#1F9D6B'];
  grafico('areaChart1', { type: 'line', data: { labels: ['1', '2', '3', '4'], datasets: a.kpis.slice(0, 3).map((k, i) => ({ label: k[0], data: k[4], borderColor: cols[i], tension: .4 })) }, options: { plugins: { legend: { labels: { boxWidth: 12, font: { size: 10 } } } } } });
  grafico('areaChart2', { type: 'bar', data: { labels: a.kpis.map(k => k[0].length > 12 ? k[0].slice(0, 12) + '…' : k[0]), datasets: [{ label: 'Índice', data: a.kpis.map(k => k[4][k[4].length - 1]), backgroundColor: a.cor }] }, options: { plugins: { legend: { display: false } }, scales: { x: { ticks: { font: { size: 9 } } } } } });
};
function openKpi(id, idx) {
  const a = AREA(id), k = a.kpis[idx];
  abrirModal(`${esc(k[0])} · ${esc(a.nome)}`, `<div class="between" style="margin-bottom:14px"><div><div style="font-size:32px;font-weight:800">${esc(k[1])}</div><div class="mini">${esc(a.nome)}</div></div><span class="trend ${k[3] ? 'up' : 'down'}" style="font-size:14px">${k[3] ? '▲' : '▼'} ${esc(k[2])}</span></div>
  <canvas id="kpiChart" height="140"></canvas>
  ${pode('acao') ? `<div class="sect-title" style="margin-top:18px;font-size:14px">Registrar valor atual</div>
  <div class="form-grid" style="margin-top:8px"><div><label class="lbl">Valor (como deve aparecer)</label><input class="inp" id="kVal" value="${esc(k[1])}"></div>
  <div><label class="lbl">Variação</label><input class="inp" id="kVar" value="${esc(k[2])}"></div>
  <div><label class="lbl">Tendência</label><select class="inp" id="kPos">${opcoes([['1', 'Positiva ▲'], ['0', 'Negativa ▼']], k[3] ? '1' : '0')}</select></div></div>
  <div style="display:flex;gap:8px;margin-top:12px"><button class="btn red" onclick="salvarKpi('${id}',${idx})">Salvar indicador</button><button class="btn ghost" onclick="fecharModal()">Fechar</button></div>` : ''}
  <div class="mini" style="margin-top:12px">Atualização manual pela área. A integração automática com o Power BI / DW entra na fase evolutiva.</div>`, true);
  S.modalChart = new Chart(document.getElementById('kpiChart'), { type: 'line', data: { labels: k[4].map((_, i) => String(i + 1)), datasets: [{ label: k[0], data: k[4], borderColor: a.cor, backgroundColor: 'rgba(29,78,216,.08)', fill: true, tension: .4 }] }, options: { plugins: { legend: { display: false } } } });
}
async function salvarKpi(id, idx) {
  const k = AREA(id).kpis[idx];
  await chamar(() => api(`/indicadores/${k[5]}`, { metodo: 'PATCH', corpo: { valor: val('kVal'), variacao: val('kVar'), positivo: val('kPos') === '1' } }));
  await recarregarBase(); fecharModal(); toast('Indicador atualizado.', 'ok'); renderAreaTab();
}

// --- Metas ---
const fmtMeta = (un, v) => un === 'R$' ? 'R$ ' + Math.round(v).toLocaleString('pt-BR') : un === '%' ? `${Number(v).toLocaleString('pt-BR')}%` : Number(v).toLocaleString('pt-BR');
const faixaBonus = p => p >= 110 ? ['Acelerador', '150% do bônus-alvo', 'green'] : p >= 100 ? ['Meta batida', '100% do bônus-alvo', 'green'] : p >= 90 ? ['Quase lá', '50% do bônus-alvo', 'amber'] : ['Abaixo', 'Sem bônus', 'red'];
S.abasArea.metas = async (id, a) => {
  const { metas, periodos } = await api(`/metas?area=${id}`);
  const periodo = S.cur.periodo && periodos.includes(S.cur.periodo) ? S.cur.periodo : periodos[0];
  S.cur.periodo = periodo;
  let lista = metas.filter(m => m.periodo === periodo);
  if (S.cur.marca !== 'Todas') lista = lista.filter(m => m.marca === S.cur.marca);
  S.cur.metasLista = lista;
  const cards = lista.map(m => {
    const p = Math.round(m.realizado / m.meta * 100), f = faixaBonus(p);
    return `<div class="card p"><div class="between"><div style="display:flex;align-items:center;gap:10px"><span style="width:10px;height:30px;border-radius:5px;background:${COR(m.marca)}"></span><div><div class="ttl" style="font-size:13.5px">${esc(m.marca)}</div><div class="meta">${esc(m.indicador)}</div></div></div><span class="tag ${f[2]}">${p}%</span></div>
    <div class="grid cards-2" style="gap:10px;margin:12px 0 8px"><div><div class="mini">Meta</div><div style="font-weight:800;font-size:15px">${fmtMeta(m.unidade, m.meta)}</div></div><div><div class="mini">Realizado</div><div style="font-weight:800;font-size:15px;color:${p >= 100 ? 'var(--green)' : p >= 90 ? 'var(--amber)' : 'var(--red)'}">${fmtMeta(m.unidade, m.realizado)}</div></div></div>
    ${prog(Math.min(p, 100), p >= 100 ? 'bar-green' : p >= 90 ? '' : 'bar-red')}
    <div class="between" style="margin-top:10px"><span class="tag ${f[2]}">${f[0]}</span><span class="mini">Bônus: ${f[1]}</span></div>
    ${pode('acao') ? `<div style="margin-top:10px"><button class="linkbtn" onclick="atualizarRealizado(${m.id})">Atualizar realizado →</button></div>` : ''}</div>`;
  }).join('');
  let consolid = '';
  if (lista.length) {
    const un = lista[0].unidade;
    if (un === 'R$') {
      const tm = lista.reduce((s, m) => s + m.meta, 0), tr = lista.reduce((s, m) => s + m.realizado, 0), tp = Math.round(tr / tm * 100), f = faixaBonus(tp);
      consolid = `<div class="card p" style="background:${a.grad};color:#fff;border:0;margin-bottom:16px"><div class="between"><div><div style="font-size:12px;opacity:.85;text-transform:uppercase;letter-spacing:1px">Consolidado · ${lista.length} marca(s)</div><div style="font-size:22px;font-weight:800;margin-top:4px">${fmtMeta('R$', tr)} <span style="font-size:13px;opacity:.85">de ${fmtMeta('R$', tm)}</span></div></div><div style="text-align:right"><div style="font-size:28px;font-weight:800">${tp}%</div><div style="font-size:12px;opacity:.9">${f[0]} · ${f[1]}</div></div></div></div>`;
    } else {
      const avg = Math.round(lista.reduce((s, m) => s + m.realizado / m.meta, 0) / lista.length * 100), f = faixaBonus(avg);
      consolid = `<div class="card p" style="background:${a.grad};color:#fff;border:0;margin-bottom:16px"><div class="between"><div><div style="font-size:12px;opacity:.85;text-transform:uppercase;letter-spacing:1px">Consolidado · ${lista.length} marca(s)</div><div style="font-size:22px;font-weight:800;margin-top:4px">${esc(lista[0].indicador)}</div></div><div style="text-align:right"><div style="font-size:28px;font-weight:800">${avg}%</div><div style="font-size:12px;opacity:.9">atingimento médio · ${f[0]}</div></div></div></div>`;
    }
  }
  return `
<div class="page-head" style="margin-bottom:10px"><div><h1 style="font-size:18px">Metas · ${esc(a.nome)}</h1><p>Cadastre a meta por marca e acompanhe o atingimento. As metas alimentam o <b>programa de bonificação</b> e a <b>gamificação</b>.</p></div>${pode('acao') ? `<button class="btn red" onclick="openMetaForm('${id}')">+ Cadastrar meta</button>` : ''}</div>
<div class="between" style="flex-wrap:wrap;gap:10px">${barraMarcas()}<div class="selbar"><span class="mini">Período</span><select onchange="setPeriodoMeta(this.value)">${opcoes(periodos, periodo)}</select></div></div>
${consolid}
${lista.length ? `<div class="grid cards-2">${cards}</div>` : '<div class="vazio">Nenhuma meta cadastrada para este filtro. Use “+ Cadastrar meta”.</div>'}
<div class="grid cards-2" style="margin-top:16px">
  <div class="card p"><div class="sect-title">Meta × Realizado por marca</div><div class="sect-sub">${esc(periodo || '')}</div><canvas id="metaChart" height="150"></canvas></div>
  <div class="card p"><div class="sect-title">Programa de bonificação</div><div class="sect-sub">Faixas de atingimento → bônus${a.meta_padrao?.peso ? ' · peso desta meta: ' + esc(a.meta_padrao.peso) : ''}</div>
    <table><thead><tr><th>Atingimento</th><th>Bônus</th><th>Pontos (gamificação)</th></tr></thead><tbody>
    <tr><td><span class="tag red">&lt; 90%</span></td><td>Sem bônus</td><td>0 pts</td></tr>
    <tr><td><span class="tag amber">90–99%</span></td><td>50% do bônus-alvo</td><td>—</td></tr>
    <tr><td><span class="tag green">100–109%</span></td><td>100% do bônus-alvo</td><td>+200 pts</td></tr>
    <tr><td><span class="tag green">≥ 110%</span></td><td>150% (acelerador)</td><td>+300 pts</td></tr>
    </tbody></table>
    <div class="mini" style="margin-top:10px">Bater a meta credita pontos automaticamente ao responsável da área (ver Gamificação).</div>
  </div>
</div>`;
};
S.abasDepois.metas = (id, a) => {
  const l = S.cur.metasLista || []; if (!l.length) return;
  grafico('metaChart', { type: 'bar', data: { labels: l.map(m => m.marca), datasets: [{ label: 'Meta', data: l.map(m => m.meta), backgroundColor: '#C9D2D7' }, { label: 'Realizado', data: l.map(m => m.realizado), backgroundColor: a.cor }] }, options: { plugins: { legend: { labels: { boxWidth: 12, font: { size: 11 } } } }, scales: { x: { ticks: { font: { size: 9 } } } } } });
};
function setPeriodoMeta(p) { S.cur.periodo = p; destruirGraficos(); renderAreaTab(); }
function openMetaForm(id) {
  const a = AREA(id), mp = a.meta_padrao || {};
  abrirModal('Cadastrar meta · ' + esc(a.nome), `
  <div class="form-grid">
    <div><label class="lbl">Marca</label><select class="inp" id="mMarca">${opcoes(MARCAS())}</select></div>
    <div><label class="lbl">Período / campanha</label><input class="inp" id="mPer" value="${esc(S.cur.periodo || '')}" placeholder="ex.: Dezembro/2026 — Natal"></div>
    <div class="full"><label class="lbl">Indicador da meta</label><input class="inp" id="mInd" value="${esc(mp.tipo || '')}"></div>
    <div><label class="lbl">Unidade</label><select class="inp" id="mUn">${opcoes([['R$', 'R$ (valor)'], ['%', '% (percentual)'], ['un', 'Unidades']], mp.un)}</select></div>
    <div><label class="lbl">Valor da meta</label><input class="inp" id="mMeta" placeholder="ex.: 1200000 ou 36"></div>
    <div><label class="lbl">Realizado até agora</label><input class="inp" id="mReal" placeholder="0"></div>
    <div><label class="lbl">Peso na bonificação</label><input class="inp" id="mPeso" value="${esc(mp.peso || '')}"></div>
    <div class="full"><label class="lbl">Responsável</label><input class="inp" id="mResp" value="${esc(a.resp)}"></div>
  </div>
  <div style="display:flex;gap:8px;margin-top:14px"><button class="btn red" onclick="salvarMeta('${id}')">Salvar meta</button><button class="btn ghost" onclick="fecharModal()">Cancelar</button></div>
  <div class="mini" style="margin-top:10px">Se já existir meta para a mesma marca, período e indicador, ela é atualizada.</div>`, true);
}
async function salvarMeta(id) {
  const r = await chamar(() => api('/metas', { metodo: 'POST', corpo: { area_id: id, marca: val('mMarca'), periodo: val('mPer'), indicador: val('mInd'), unidade: val('mUn'), meta: val('mMeta'), realizado: val('mReal'), peso: val('mPeso'), responsavel: val('mResp') } }));
  S.cur.periodo = r.periodo; fecharModal(); toast(r.pontosGanhos ? `Meta salva · +${r.pontosGanhos} pontos creditados ao responsável da área 🏅` : 'Meta salva.', 'ok'); destruirGraficos(); renderAreaTab();
}
function atualizarRealizado(mid) {
  const m = (S.cur.metasLista || []).find(x => x.id === mid); if (!m) return;
  abrirModal(`Atualizar realizado · ${esc(m.marca)}`, `<div class="mini" style="margin-bottom:10px">${esc(m.indicador)} · meta ${fmtMeta(m.unidade, m.meta)}</div>
  <label class="lbl">Realizado</label><input class="inp" id="mNovo" value="${m.realizado}">
  <div style="display:flex;gap:8px;margin-top:14px"><button class="btn red" onclick="salvarRealizado(${mid})">Salvar</button><button class="btn ghost" onclick="fecharModal()">Cancelar</button></div>`);
}
async function salvarRealizado(mid) {
  const r = await chamar(() => api(`/metas/${mid}`, { metodo: 'PATCH', corpo: { realizado: val('mNovo') } }));
  fecharModal(); toast(`Realizado atualizado: ${r.pct}% da meta${r.pontosGanhos ? ` · +${r.pontosGanhos} pontos ao responsável da área 🏅` : ''}`, 'ok'); destruirGraficos(); renderAreaTab();
}

// --- Plano de ação ---
const ST = ['A fazer', 'Em andamento', 'Em revisão', 'Concluído'];
const ST_COR = { 'A fazer': '#9AA7AE', 'Em andamento': '#1D4ED8', 'Em revisão': '#E0A82E', 'Concluído': '#1F9D6B' };
const ST_TAG = { 'A fazer': 'gray', 'Em andamento': 'blue', 'Em revisão': 'amber', 'Concluído': 'green' };
function setAcaoView(v) { S.cur.acaoView = v; destruirGraficos(); renderAreaTab(); }
const vencida = t => t.status !== 'Concluído' && t.prazo && String(t.prazo).slice(0, 10) < hojeISO();
S.abasArea.acao = async (id, a) => {
  const tarefas = await api(`/acoes?area=${id}${S.cur.marca !== 'Todas' ? '&marca=' + encodeURIComponent(S.cur.marca) : ''}`);
  const v = S.cur.acaoView || 'kanban';
  const seg = `<div class="segmented">${[['kanban', 'Kanban'], ['lista', 'Lista'], ['gantt', 'Gantt']].map(([k, t]) => `<button class="${v === k ? 'on' : ''}" onclick="setAcaoView('${k}')">${t}</button>`).join('')}</div>`;
  const novo = pode('acao') ? `<button class="btn red" onclick="novaAcao('${id}')">+ Nova ação</button>` : '';
  const hd = `<div class="page-head" style="margin-bottom:14px"><div><h1 style="font-size:18px">Plano de Ação · ${esc(a.nome)}</h1><p>${tarefas.length} ações · clique num cartão para detalhar, comentar e mudar o status.</p></div><div style="display:flex;gap:8px;align-items:center">${seg}${novo}</div></div>${barraMarcas()}`;
  const cartao = t => `<div class="kcard" onclick="openTask(${t.id})"><div class="top"><span class="tag ${ST_TAG[t.status]}">${esc(t.marca || 'Todas')}</span><span class="mini" style="${vencida(t) ? 'color:var(--red);font-weight:700' : ''}">${t.prazo ? (vencida(t) ? 'vencida ' : 'venc. ') + dataCurta(t.prazo) : 'sem prazo'}</span></div><h5>${esc(t.titulo)}</h5><div class="ft"><div style="display:flex;gap:6px"><span class="tag ${t.prioridade === 'Alta' ? 'red' : 'gray'}" style="font-size:10px">${esc(t.prioridade)}</span><span class="tag gray" style="font-size:10px">💬 ${t.comentarios}</span></div><div class="who" title="${esc(t.responsavel)}">${iniciais(t.responsavel)}</div></div></div>`;
  if (!tarefas.length) return hd + '<div class="vazio">Nenhuma ação para este filtro. Use “+ Nova ação”.</div>';
  if (v === 'kanban') {
    return hd + `<div class="kanban">${ST.map(n => { const it = tarefas.filter(t => t.status === n); return `<div class="kcol"><div class="h"><span style="display:flex;align-items:center;gap:7px"><span style="width:9px;height:9px;border-radius:50%;background:${ST_COR[n]}"></span>${n}</span><span class="cnt">${it.length}</span></div>${it.map(cartao).join('')}
      ${pode('acao') ? `<button class="btn" style="width:100%;border-style:dashed;color:var(--muted)" onclick="novaAcao('${id}','${n}')">+ Adicionar</button>` : ''}</div>`; }).join('')}</div>`;
  }
  if (v === 'lista') {
    return hd + `<div class="card p"><div style="overflow-x:auto"><table><thead><tr><th>Ação</th><th>Marca</th><th>Responsável</th><th>Prazo</th><th>Status</th><th>Origem</th></tr></thead><tbody>
    ${tarefas.map(t => `<tr style="cursor:pointer" onclick="openTask(${t.id})"><td><b>${esc(t.titulo)}</b></td><td><span class="tag gray">${esc(t.marca || 'Todas')}</span></td><td>${esc(t.responsavel)}</td><td style="${vencida(t) ? 'color:var(--red);font-weight:700' : ''}">${dataBR(t.prazo)}</td><td><span class="tag ${ST_TAG[t.status]}">${t.status}</span></td><td class="mini">${esc(t.origem || '—')}</td></tr>`).join('')}
    </tbody></table></div></div>`;
  }
  const ts = tarefas.filter(t => t.prazo);
  const ini = Math.min(...ts.map(t => new Date(String(t.inicio).slice(0, 10)).getTime()));
  const fim = Math.max(...ts.map(t => new Date(String(t.prazo).slice(0, 10)).getTime()));
  const dias = Math.max(7, Math.round((fim - ini) / 864e5) + 1);
  const marcas = Array.from({ length: 7 }, (_, i) => new Date(ini + (dias - 1) * 864e5 * i / 6));
  const grade = marcas.map((m, i) => `<div style="position:absolute;left:${i / 6 * 100}%;top:0;bottom:0;border-left:1px dashed #E4E9ED"><span style="position:absolute;top:-18px;left:2px;font-size:10px;color:var(--muted);white-space:nowrap">${String(m.getUTCDate()).padStart(2, '0')}/${String(m.getUTCMonth() + 1).padStart(2, '0')}</span></div>`).join('');
  return hd + `<div class="card p"><div class="sect-title">Cronograma (Gantt)</div><div class="sect-sub">Do início ao prazo de cada ação · clique numa barra para detalhar</div>
  <div style="margin-top:26px">${ts.map(t => { const s = (new Date(String(t.inicio).slice(0, 10)) - ini) / 864e5, e = (new Date(String(t.prazo).slice(0, 10)) - ini) / 864e5 + 1; const left = s / dias * 100, w = Math.max((e - s) / dias * 100, 3); return `<div style="display:flex;align-items:center;gap:10px;margin-bottom:12px"><div style="width:210px;flex:none;font-size:12.5px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${esc(t.titulo)}">${esc(t.titulo)}</div>
  <div style="position:relative;flex:1;height:30px;background:#F4F7F9;border-radius:8px">${grade}<div onclick="openTask(${t.id})" title="${t.status} · venc. ${dataCurta(t.prazo)}" style="position:absolute;left:${Math.max(0, left)}%;width:${w}%;top:5px;height:20px;border-radius:6px;background:${ST_COR[t.status]};cursor:pointer;display:flex;align-items:center;padding:0 8px;color:#fff;font-size:10px;font-weight:700;overflow:hidden">${t.status}</div></div></div>`; }).join('')}</div>
  <div style="display:flex;gap:14px;margin-top:14px;flex-wrap:wrap">${Object.entries(ST_COR).map(([n, c]) => `<span style="display:flex;align-items:center;gap:6px;font-size:12px;color:var(--muted)"><span style="width:12px;height:12px;border-radius:4px;background:${c}"></span>${n}</span>`).join('')}</div></div>`;
};
function novaAcao(id, status) {
  const a = AREA(id);
  abrirModal('Nova ação · ' + esc(a.nome), `<div class="form-grid">
    <div class="full"><label class="lbl">Título</label><input class="inp" id="aTit" placeholder="O que precisa ser feito"></div>
    <div class="full"><label class="lbl">Descrição</label><textarea class="inp" id="aDesc" placeholder="Detalhes, critério de pronto, evidência esperada"></textarea></div>
    <div><label class="lbl">Responsável</label><input class="inp" id="aResp" value="${esc(a.resp)}"></div>
    <div><label class="lbl">Marca</label><select class="inp" id="aMarca">${opcoes(['Todas', ...MARCAS()], S.cur.marca)}</select></div>
    <div><label class="lbl">Prazo</label><input class="inp" type="date" id="aPrazo"></div>
    <div><label class="lbl">Prioridade</label><select class="inp" id="aPri">${opcoes(['Alta', 'Média', 'Baixa'], 'Média')}</select></div>
    <div><label class="lbl">Status</label><select class="inp" id="aSt">${opcoes(ST, status || 'A fazer')}</select></div>
  </div>
  <div style="display:flex;gap:8px;margin-top:14px"><button class="btn red" onclick="salvarAcao('${id}')">Criar ação</button><button class="btn ghost" onclick="fecharModal()">Cancelar</button></div>`, true);
  setTimeout(() => document.getElementById('aTit')?.focus(), 50);
}
async function salvarAcao(id) {
  await chamar(() => api('/acoes', { metodo: 'POST', corpo: { area_id: id, titulo: val('aTit'), descricao: val('aDesc'), responsavel: val('aResp'), marca: val('aMarca'), prazo: val('aPrazo'), prioridade: val('aPri'), status: val('aSt') } }));
  fecharModal(); toast('Ação criada.', 'ok'); renderAreaTab();
}
async function openTask(tid) {
  const t = await chamar(() => api(`/acoes/${tid}`));
  const edita = pode('acao');
  abrirModal(esc(t.titulo), `<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px"><span class="tag blue">${esc(t.area_nome)}</span><span class="tag ${ST_TAG[t.status]}">${t.status}</span><span class="tag ${t.prioridade === 'Alta' ? 'red' : 'gray'}">Prioridade ${esc(t.prioridade)}</span>${vencida(t) ? '<span class="tag red">Vencida</span>' : ''}</div>
  ${t.descricao ? `<p style="font-size:13.5px;line-height:1.55;margin:0 0 12px">${esc(t.descricao)}</p>` : ''}
  <table><tr><td class="mini">Responsável</td><td><b>${esc(t.responsavel || '—')}</b></td></tr><tr><td class="mini">Marca</td><td>${esc(t.marca || 'Todas')}</td></tr><tr><td class="mini">Início</td><td>${dataBR(t.inicio)}</td></tr><tr><td class="mini">Prazo</td><td>${dataBR(t.prazo)}</td></tr><tr><td class="mini">Origem</td><td>${esc(t.origem || '—')}</td></tr>${t.concluido_em ? `<tr><td class="mini">Concluída em</td><td>${dataBR(new Date(t.concluido_em).toISOString())}</td></tr>` : ''}</table>
  ${edita ? `<div class="form-grid" style="margin-top:14px"><div><label class="lbl">Mudar status</label><select class="inp" id="tSt">${opcoes(ST, t.status)}</select></div><div><label class="lbl">Prazo</label><input class="inp" type="date" id="tPrazo" value="${String(t.prazo || '').slice(0, 10)}"></div></div>
  <div style="display:flex;gap:8px;margin-top:10px"><button class="btn red" onclick="salvarTask(${t.id})">Salvar alterações</button>${t.status !== 'Concluído' ? `<button class="btn" onclick="concluirTask(${t.id})">✓ Marcar como concluída</button>` : ''}</div>` : ''}
  <div style="font-weight:700;font-size:13px;margin:18px 0 8px">Comentários e evidências (${t.comentarios.length})</div>
  ${t.comentarios.map(c => `<div class="coment"><b>${esc(c.autor)}</b> <span class="mini">· ${new Date(c.criado_em).toLocaleString('pt-BR')}</span><div style="margin-top:4px">${esc(c.texto)}</div></div>`).join('') || '<div class="mini" style="margin-bottom:8px">Nenhum comentário ainda.</div>'}
  <div style="display:flex;gap:8px;margin-top:6px"><input class="inp" id="tCom" placeholder="Escreva um comentário ou descreva a evidência…" onkeydown="if(event.key==='Enter')comentarTask(${t.id})"><button class="btn" onclick="comentarTask(${t.id})">Enviar</button></div>`, true);
}
async function salvarTask(tid) {
  const r = await chamar(() => api(`/acoes/${tid}`, { metodo: 'PATCH', corpo: { status: val('tSt'), prazo: val('tPrazo') || null } }));
  fecharModal(); pontosToast(r, 'Ação atualizada'); if (r.pontosGanhos) await recarregarBase(); renderAreaTab();
}
async function concluirTask(tid) {
  const r = await chamar(() => api(`/acoes/${tid}`, { metodo: 'PATCH', corpo: { status: 'Concluído' } }));
  fecharModal(); pontosToast(r, 'Ação concluída ✓'); if (r.pontosGanhos) await recarregarBase(); renderAreaTab();
}
async function comentarTask(tid) {
  const texto = val('tCom'); if (!texto.trim()) return;
  await chamar(() => api(`/acoes/${tid}/comentarios`, { metodo: 'POST', corpo: { texto } }));
  openTask(tid);
}

// --- Checklists ---
S.abasArea.check = async (id, a) => {
  const hist = await api(`/checklists/aplicacoes?area=${id}`);
  const media = hist.length ? Math.round(hist.reduce((s, h) => s + h.score, 0) / hist.length) : null;
  return `<div class="page-head" style="margin-bottom:14px"><div><h1 style="font-size:18px">Checklists · ${esc(a.nome)}</h1><p>Clique num checklist para aplicá-lo. Marque cada item (OK / Atenção / Não conforme) e veja o score ao vivo. Itens não conformes viram ação no plano.</p></div>${pode('check', 2) ? `<button class="btn red" onclick="novoChecklist('${id}')">+ Novo checklist</button>` : ''}</div>
<div class="grid cards-2">${a.checklists.map((c, i) => `<div class="card p cl" onclick="openChecklist('${id}',${i})"><div class="between"><div class="ico" style="width:44px;height:44px;border-radius:12px;background:${a.grad};color:#fff;display:grid;place-items:center">${ic('check')}</div><span class="tag gray">${c[1].length} itens${c[3] ? ` · ${c[3].blocos.length} blocos` : ''}</span></div>
<div class="sect-title" style="margin-top:12px">${esc(c[0])}</div><div class="mini" style="margin-bottom:8px">${c[3] ? (c[3].escala === 'comparativa' ? 'Concorrente acima, igual ou abaixo da Milla · gera oportunidades no plano' : 'Cabeçalho da visita, observação por item, índice ponderado e plano de ação') : 'Toque para aplicar · gera score, pontos e ações'}</div><span class="tag green">${c[3] ? 'Guia de supervisão' : 'Pronto para aplicar'}</span></div>`).join('')}</div>
<div class="card p" style="margin-top:18px"><div class="between"><div><div class="sect-title">Aplicações recentes</div><div class="sect-sub">${hist.length ? `${hist.length} aplicações · score médio ${media}` : 'Nenhuma aplicação ainda'}</div></div></div>
${hist.length ? `<div style="overflow-x:auto"><table><thead><tr><th>Checklist</th><th>Loja</th><th>Aplicado por</th><th>Data</th><th>Resultado</th><th>Score</th></tr></thead><tbody>
${hist.map(h => `<tr style="cursor:pointer" onclick="verAplicacao(${h.id})"><td><b>${esc(h.modelo)}</b></td><td>${esc(h.loja || h.cabecalho?.loja || h.cabecalho?.concorrente || '—')}</td><td>${esc(h.usuario || 'Carga inicial')}</td><td>${new Date(h.criado_em).toLocaleDateString('pt-BR')}</td><td class="mini">${h.qtd_ok} OK · ${h.qtd_atencao} atenção · ${h.qtd_nc} N/C</td><td><span class="tag ${h.score >= 80 ? 'green' : h.score >= 50 ? 'amber' : 'red'}">${h.score}${h.classificacao ? '% · ' + esc(h.classificacao) : ''}</span></td></tr>`).join('')}
</tbody></table></div>` : ''}</div>`;
};
function openChecklist(id, idx) {
  const a = AREA(id), c = a.checklists[idx];
  if (c[3]) return window.openChecklistGuia(id, idx);
  const itens = c[1].map((t, i) => `<div class="chk" data-s="" onclick="cycleChk(this)"><div class="box" data-i="${i}"></div><div class="txt">${esc(t)}</div><span class="st">Pendente</span></div>`).join('');
  abrirModal(esc(c[0]), `<div class="between" style="margin-bottom:14px;gap:12px;flex-wrap:wrap"><div style="flex:1;min-width:220px"><div class="mini" style="margin-bottom:6px">${esc(a.nome)} · ${c[1].length} itens</div>
  <select class="inp" id="cLoja"><option value="">Loja (opcional — corporativo)</option>${S.D.lojas.map(l => `<option value="${l.id}">${esc(l.nome)}</option>`).join('')}</select></div>
  <div class="score-ring" id="ring"><div class="inner"><div><div style="font-size:20px;font-weight:800" id="scoreN">0</div><div class="mini" style="font-size:9px">SCORE</div></div></div></div></div>
  <div id="chkList">${itens}</div>
  <label class="lbl" style="margin-top:10px">Observações / evidências</label><textarea class="inp" id="cObs" placeholder="O que foi visto, fotos enviadas, combinados com a loja…"></textarea>
  <div class="between" style="margin-top:10px"><div style="display:flex;gap:8px"><span class="tag green" id="cOk">0 OK</span><span class="tag amber" id="cWarn">0 Atenção</span><span class="tag red" id="cNo">0 N/C</span></div>
  ${pode('check') ? `<button class="btn red" onclick="salvarChecklist(${c[2]})">Finalizar e salvar</button>` : ''}</div>
  <div class="mini" style="margin-top:10px">Clique repetidamente num item para alternar Pendente → OK → Atenção → Não conforme.</div>`, true);
  recalcScore();
}
function cycleChk(el) {
  const seq = ['', 'ok', 'warn', 'no']; const n = seq[(seq.indexOf(el.getAttribute('data-s') || '') + 1) % 4]; el.setAttribute('data-s', n);
  el.querySelector('.box').textContent = n === 'ok' ? '✓' : n === 'no' ? '✕' : n === 'warn' ? '!' : '';
  el.querySelector('.st').textContent = n === 'ok' ? 'OK' : n === 'warn' ? 'Atenção' : n === 'no' ? 'Não conforme' : 'Pendente'; recalcScore();
}
function recalcScore() {
  const it = [...document.querySelectorAll('#chkList .chk')]; if (!it.length) return;
  let ok = 0, w = 0, no = 0; it.forEach(i => { const s = i.getAttribute('data-s'); if (s === 'ok') ok++; else if (s === 'warn') w++; else if (s === 'no') no++; });
  const sc = Math.round((ok + w * .5) / it.length * 100);
  document.getElementById('scoreN').textContent = sc;
  document.getElementById('cOk').textContent = ok + ' OK'; document.getElementById('cWarn').textContent = w + ' Atenção'; document.getElementById('cNo').textContent = no + ' N/C';
  document.getElementById('ring').style.background = `conic-gradient(${sc >= 80 ? '#1F9D6B' : sc >= 50 ? '#E8A23C' : '#C8102E'} ${sc}%,#EAEFF2 0)`;
}
async function salvarChecklist(modeloId) {
  const respostas = [...document.querySelectorAll('#chkList .chk')].map(i => ({ s: i.getAttribute('data-s') || '' }));
  if (respostas.some(r => !r.s)) return toast('Marque todos os itens antes de salvar.', 'erro');
  const r = await chamar(() => api('/checklists/aplicacoes', { metodo: 'POST', corpo: { modelo_id: modeloId, loja_id: val('cLoja') || null, respostas, observacao: val('cObs') } }));
  fecharModal(); pontosToast(r, `Checklist salvo · score ${r.score}${r.acoesGeradas ? ` · ${r.acoesGeradas} ação(ões) criada(s) no plano` : ''}`);
  await recarregarBase(); renderAreaTab();
}
async function verAplicacao(apId) {
  const ap = await chamar(() => api(`/checklists/aplicacoes/${apId}`));
  if (ap.estrutura) return window.verAplicacaoGuia(apId);
  const lbl = { ok: ['OK', 'green'], warn: ['Atenção', 'amber'], no: ['Não conforme', 'red'] };
  abrirModal(esc(ap.modelo), `<div class="between" style="margin-bottom:12px"><div class="mini">${esc(ap.loja || 'Corporativo')} · ${esc(ap.usuario || 'Carga inicial')} · ${new Date(ap.criado_em).toLocaleString('pt-BR')}</div><span class="tag ${ap.score >= 80 ? 'green' : ap.score >= 50 ? 'amber' : 'red'}">Score ${ap.score}</span></div>
  ${ap.itens.map((t, i) => { const r = ap.respostas[i] || {}; const l = lbl[r.s] || ['—', 'gray']; return `<div class="row-item"><div style="flex:1;font-size:13px">${esc(t)}</div><span class="tag ${l[1]}">${l[0]}</span></div>`; }).join('')}
  ${ap.observacao ? `<div class="coment" style="margin-top:10px"><b>Observações</b><div>${esc(ap.observacao)}</div></div>` : ''}`, true);
}
function novoChecklist(id) {
  abrirModal('Novo checklist · ' + esc(AREA(id).nome), `<label class="lbl">Nome do checklist</label><input class="inp" id="nNome" placeholder="ex.: Abertura de loja — fim de semana">
  <label class="lbl" style="margin-top:12px">Itens (um por linha)</label><textarea class="inp" id="nItens" style="min-height:160px" placeholder="Loja limpa e organizada&#10;Vitrine da campanha aplicada&#10;…"></textarea>
  <div style="display:flex;gap:8px;margin-top:14px"><button class="btn red" onclick="salvarNovoChecklist('${id}')">Criar checklist</button><button class="btn ghost" onclick="fecharModal()">Cancelar</button></div>`, true);
}
async function salvarNovoChecklist(id) {
  await chamar(() => api('/checklists/modelos', { metodo: 'POST', corpo: { area_id: id, nome: val('nNome'), itens: val('nItens') } }));
  await recarregarBase(); fecharModal(); toast('Checklist criado.', 'ok'); renderAreaTab();
}

// --- Treinamentos ---
S.abasArea.treino = (id, a) => `
<div class="page-head" style="margin-bottom:14px"><div><h1 style="font-size:18px">Treinamentos · ${esc(a.nome)}</h1><p>Trilha de formação do cargo. Abra o curso e registre cada aula concluída — o progresso e os pontos são seus.</p></div><button class="btn red" onclick="meusCertificados()">Meus certificados</button></div>
<div class="grid cards-3" style="margin-bottom:20px">${a.cursos.map((c, i) => `<div class="card course" onclick="openCourse('${id}',${i})"><div class="thumb" style="background:${a.grad}"><span class="badge">${esc(c[1])}</span><span style="font-weight:700;font-size:13px">${ic('cap')} Curso</span></div><div class="b"><h4>${esc(c[0])}</h4><div class="mini">${c[2] === 100 ? 'Concluído ✓' : c[2] + '% concluído'}</div>${prog(c[2], c[2] === 100 ? 'bar-green' : '')}</div></div>`).join('')}</div>
<div class="card p"><div class="sect-title">Vídeos da área</div><div class="sect-sub">Microlearning · conteúdo a ser publicado pela área</div>
${(a.videos || []).map(v => `<div class="vid" onclick="openVideo(${esc(JSON.stringify(v[0]))},'${id}')"><div class="pl" style="background:${a.grad}">${ic('play')}</div><div style="flex:1"><div class="ttl">${esc(v[0])}</div><div class="meta">${esc(a.nome)} · ${esc(v[1])}</div></div><span class="tag gray">${esc(v[1])}</span></div>`).join('')}</div>`;
const AULAS = ['Introdução', 'Conceitos', 'Prática', 'Estudo de caso', 'Ferramentas', 'Aplicação', 'Indicadores', 'Avaliação', 'Revisão', 'Projeto', 'Roteiro de campo', 'Encerramento'];
function openCourse(id, idx) {
  const a = AREA(id), c = a.cursos[idx], total = c[4], feitas = c[5];
  const aulas = Array.from({ length: total }, (_, i) => `<div class="row-item"><div class="ico" style="background:${i < feitas ? '#E6F6EF' : '#EEF3F5'}">${ic(i < feitas ? 'check' : 'play')}</div><div style="flex:1"><div class="ttl">Aula ${i + 1} — ${AULAS[i] || 'Conteúdo'}</div><div class="meta">${8 + i * 2} min</div></div><span class="tag ${i < feitas ? 'green' : i === feitas ? 'blue' : 'gray'}">${i < feitas ? 'Concluída' : i === feitas ? 'Próxima' : 'Bloqueada'}</span></div>`).join('');
  abrirModal(esc(c[0]), `<div style="display:flex;gap:8px;margin-bottom:14px"><span class="tag blue">${esc(a.nome)}</span><span class="tag gray">${esc(c[1])}</span></div>
  <div style="margin-bottom:14px">${prog(c[2], c[2] === 100 ? 'bar-green' : '')}<div class="mini" style="margin-top:6px">${feitas} de ${total} aulas · ${c[2]}% concluído</div></div>
  <div class="sect-title" style="font-size:13px">Aulas</div>${aulas}
  <div style="display:flex;gap:8px;margin-top:14px">${feitas < total ? `<button class="btn red" onclick="concluirAula('${id}',${idx})">✓ Concluir aula ${feitas + 1}</button>` : '<span class="tag green" style="padding:9px 14px">Curso concluído · certificado disponível</span>'}<button class="btn ghost" onclick="fecharModal()">Fechar</button></div>
  <div class="mini" style="margin-top:10px">Os vídeos e materiais de cada aula são publicados pela área no CMS e armazenados no R2.</div>`, true);
}
async function concluirAula(id, idx) {
  const c = AREA(id).cursos[idx];
  const r = await chamar(() => api(`/cursos/${c[3]}/aula`, { metodo: 'POST' }));
  pontosToast(r, r.pct >= 100 ? 'Curso concluído! 🎓' : `Aula registrada · ${r.pct}% do curso`);
  await recarregarBase(); openCourse(id, idx); if (S.cur.tab === 'treino') renderAreaTab();
}
function openVideo(t, id) {
  abrirModal(esc(t), `<div style="aspect-ratio:16/9;border-radius:12px;background:linear-gradient(135deg,#0B3D4D,#1D4ED8);display:grid;place-items:center;color:#fff;margin-bottom:14px"><div style="text-align:center"><div style="font-size:40px">▶</div><div class="mini" style="color:#cfe0e6">Vídeo em produção pela área · será publicado no CMS</div></div></div><div class="mini">${esc(AREA(id).nome)}</div>`, true);
}
async function meusCertificados() {
  const l = await chamar(() => api('/cursos/certificados'));
  abrirModal('Meus certificados', l.length ? l.map(c => `<div class="row-item"><div class="ico" style="background:#E6F6EF">${ic('cap')}</div><div style="flex:1"><div class="ttl">${esc(c.titulo)}</div><div class="meta">${esc(c.area)} · concluído em ${new Date(c.concluido_em).toLocaleDateString('pt-BR')}</div></div><span class="tag green">Certificado</span></div>`).join('') : '<div class="vazio">Você ainda não concluiu nenhum curso. Conclua as aulas para emitir o certificado.</div>');
}

// --- Rotina & Atividades ---
S.abasArea.rotina = (id, a) => {
  const blk = (t, arr, cor) => `<div class="card p"><div class="sect-title" style="color:${cor}">${t}</div><div style="margin-top:8px">${(arr || []).map(x => `<div class="row-item"><div style="width:20px;height:20px;border-radius:6px;background:${cor};display:grid;place-items:center;color:#fff;font-size:11px;flex:none">✓</div><div style="flex:1;font-size:13px">${esc(x)}</div></div>`).join('')}</div></div>`;
  const rot = `<div class="grid cards-3">${blk('🌅 Rotina diária', a.rotina?.diaria, '#C8102E')}${blk('📅 Rotina semanal', a.rotina?.semanal, '#1D4ED8')}${blk('🗓️ Programação mensal', a.rotina?.mensal, '#0E4A5C')}</div>`;
  let plan = '';
  if (a.fases) {
    const sel = S.cur.marca !== 'Todas' ? S.cur.marca : null;
    const prox = sel ? (S.D.cal[sel] || []).find(c => c[5] >= hojeISO()) : null;
    plan = `<div class="card p" style="margin-top:18px"><div class="between"><div><div class="sect-title">Planejamento — atividades da campanha (régua D-X)</div><div class="sect-sub">O que ${esc(a.nome)} executa antes de cada data, por marca. Clique para expandir.</div></div><span class="tag petrol">${a.fases.length} fases</span></div>
    ${barraMarcas()}
    ${sel ? `<div class="card p" style="background:${COR(sel)}12;border-color:${COR(sel)}33;margin-bottom:12px"><div class="mini">Próxima campanha · ${esc(sel)}</div><div style="font-weight:800;font-size:15px">${prox ? esc(prox[1]) + ' · ' + esc(prox[2]) : 'Sem campanha futura cadastrada'}</div>${prox && pode('cal', 2) ? `<button class="linkbtn" style="margin-top:6px" onclick="gerarAcoesCampanha(${prox[3]})">Gerar as atividades desta campanha no plano de ação →</button>` : ''}</div>`
      : '<div class="card p" style="background:#F8FAFB;margin-bottom:12px"><div class="mini">Selecione uma marca acima para ver a próxima campanha. Abaixo, a régua D-X padrão da área.</div></div>'}
    <div>${a.fases.map((f, i) => `<div class="phase" id="ph${i}"><div class="ph" onclick="document.getElementById('ph${i}').classList.toggle('open')"><div class="num">${i + 1}</div><div style="flex:1"><div style="font-weight:700;font-size:13.5px">${esc(f[0])}</div><div class="meta">Responsável: ${esc(f[1])}${sel ? ' · ' + esc(sel) : ''}</div></div><div class="chev" style="color:var(--muted);transition:.2s">${ic('chev')}</div></div>
    <div class="pbody">${f[2].map(x => `<div class="act"><span class="dotc" style="background:${a.cor}"></span>${esc(x)}</div>`).join('')}</div></div>`).join('')}</div></div>`;
  }
  let modelos = '';
  if (a.modelos) {
    modelos = `<div class="card p" style="margin-top:18px"><div class="sect-title">Modelo OTB — orçamento de compra</div><div class="sect-sub">OTB disponível = (Venda planejada + Estoque-alvo do fim) − (Estoque inicial + Pedidos em aberto) · valores de exemplo</div>
    <div style="overflow-x:auto"><table><thead><tr><th>Linha (marca)</th><th>Venda plan.</th><th>Est. inicial</th><th>Est.-alvo</th><th>Pedidos abertos</th><th>OTB disp.</th><th>Cobertura</th></tr></thead><tbody>
    ${[['Feminino (MILLA)', '600.000', '320.000', '380.000', '250.000', '410.000', '2,0 m'], ['Calçados (DÁHLIA)', '240.000', '150.000', '170.000', '120.000', '140.000', '2,2 m'], ['Acessórios (MILLA)', '90.000', '60.000', '70.000', '40.000', '60.000', '1,8 m'], ['Calçados (DOM CORTEZ)', '130.000', '90.000', '100.000', '70.000', '70.000', '2,5 m'], ['TOTAL', '1.060.000', '620.000', '720.000', '480.000', '680.000', '—']].map(r => `<tr>${r.map((c, j) => `<td>${j === 0 || r[0] === 'TOTAL' ? '<b>' + c + '</b>' : c}</td>`).join('')}</tr>`).join('')}
    </tbody></table></div></div>`;
  }
  return rotinaGuiaHTML(id, a) + rot + plan + modelos;
};

// --- Guia ---
S.abasArea.guia = (id, a) => `
<div class="card p"><div class="between"><div><div class="sect-title">Guia — ${esc(a.nome)}</div><div class="sect-sub">Conhecimento navegável da função</div></div><span class="tag gray">${(a.pilares || []).length + 1} capítulos</span></div>
<div style="margin-top:8px">
${[['Papel da função', a.papel]].concat((a.pilares || []).map(p => [p[0], p[1]])).map((s, i) => `<div class="phase" id="g${i}"><div class="ph" onclick="document.getElementById('g${i}').classList.toggle('open')"><div class="num" style="background:${a.cor}">${i + 1}</div><div style="flex:1"><div style="font-weight:700;font-size:13.5px">${esc(s[0])}</div></div><div class="chev" style="color:var(--muted);transition:.2s">${ic('chev')}</div></div><div class="pbody"><div class="act">${esc(s[1])}</div></div></div>`).join('')}
</div></div>${conversaHTML(a)}`;

async function gerarAcoesCampanha(cid) {
  const r = await chamar(() => api(`/campanhas/${cid}/gerar-acoes`, { metodo: 'POST' }));
  fecharModal(); toast(`${r.geradas} atividades geradas no plano de ação das áreas.`, 'ok');
}

Object.assign(window, { openArea, switchAreaTab, setAreaMarca, openKpi, salvarKpi, setPeriodoMeta, openMetaForm, salvarMeta, atualizarRealizado, salvarRealizado,
  setAcaoView, novaAcao, salvarAcao, openTask, salvarTask, concluirTask, comentarTask, openChecklist, cycleChk, salvarChecklist, verAplicacao, novoChecklist,
  salvarNovoChecklist, openCourse, concluirAula, openVideo, meusCertificados, gerarAcoesCampanha });
window.renderAreaTabAtual = () => renderAreaTab();
export { renderAreaTab };
