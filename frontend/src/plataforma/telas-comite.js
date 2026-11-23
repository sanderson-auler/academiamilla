// Comitê Comercial 0.7.0 — calendário de reuniões, indicadores do comitê, reunião com transcrição,
// ata executiva (gerada por IA no modelo SCA Solutions, exportada em PDF) e plano de ação em checklist
// com encaminhamento ao Kanban da área.
import { S, api, esc, ic, head, toast, pontosToast, chamar, abrirModal, fecharModal, go, trilha, marcarAtivo, dataBR, dataHoraBR, pode, opcoes } from './nucleo.js';
import { sessao } from '../api.js';

const BASE = import.meta.env.VITE_API_URL || '/api';
S.cm = S.cm || { mes: null, id: null, aba: 'ata', d: null };
const AREAS = () => S.D.areaOrder.map(id => [id, S.D.areas[id].nome]);
const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const SIT_COR = { 'Concluída': 'green', 'Em andamento': 'blue', Atrasada: 'red', Aberta: 'gray', Agendada: 'amber', Cancelada: 'gray' };
const hojeMes = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date()).slice(0, 7);
const spParts = d => { const f = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(d)); const g = t => f.find(x => x.type === t)?.value; return { dia: `${g('year')}-${g('month')}-${g('day')}`, hora: `${g('hour')}:${g('minute')}` }; };
const inputDT = d => { if (!d) return ''; const p = spParts(d); return `${p.dia}T${p.hora}`; };
const duracao = (a, b) => { if (!a || !b) return ''; const m = Math.round((new Date(b) - new Date(a)) / 60000); return m > 0 ? `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}` : ''; };
const podeEditar = () => pode('comite', 2);

// ======================= PAINEL: indicadores + calendário + histórico =======================
S.telas.comite = async () => {
  S.cm.mes = S.cm.mes || hojeMes();
  const d = await api(`/comite-gestao/painel?mes=${S.cm.mes}`);
  const k = d.kpis, [ano, mes] = S.cm.mes.split('-').map(Number);
  const pct = (a, b) => (b ? Math.round(a / b * 100) : 0);
  const card = (icn, cor, valor, rotulo, sub) => `<div class="card p cm-kpi"><div class="cm-kic" style="background:${cor}">${ic(icn)}</div><div class="cm-kv">${valor}</div><div class="cm-kl">${rotulo}</div><div class="mini">${sub}</div></div>`;
  return `${head('Comitê Comercial', 'Reuniões, atas e plano de ação do Comitê Integrado de Execução Comercial', podeEditar() ? '<button class="btn red" onclick="cmNova()">+ Nova reunião</button>' : '')}
  <div class="cm-kpis">
    ${card('users', 'linear-gradient(135deg,#0B3D4D,#13586E)', `${k.realizadas}<small>/${k.agendadas}</small>`, 'Reuniões realizadas', `${MESES[mes - 1]} · ${k.agendadas} na agenda`)}
    ${card('kanban', 'linear-gradient(135deg,#1D4ED8,#1736a8)', k.geradas, 'Ações definidas', `nas reuniões do mês · ${k.encaminhadas} encaminhadas às áreas`)}
    ${card('check', 'linear-gradient(135deg,#0E7C66,#1F9D6B)', k.resolvidas, 'Ações resolvidas no mês', `${pct(k.geradas_concluidas, k.geradas)}% das ações do mês já concluídas`)}
    ${card('medal', 'linear-gradient(135deg,#E0A82E,#b9851a)', `${pct(k.resolvidas_prazo, k.resolvidas)}%`, 'Resolvidas no prazo', `${k.resolvidas_prazo} de ${k.resolvidas} no mês`)}
    ${card('cal', 'linear-gradient(135deg,#C8102E,#7A1020)', k.vencidas, 'Ações vencidas', `${k.abertas} em aberto no total`)}
    ${card('chart', 'linear-gradient(135deg,#7A2E8E,#1D4ED8)', k.dias_medios == null ? '—' : `${k.dias_medios}d`, 'Tempo médio de resolução', 'da reunião até a conclusão')}
  </div>
  <div class="cm-grid">
    <div class="card p"><div class="between" style="margin-bottom:10px"><div class="sect-title">Calendário do comitê</div>
      <div class="cm-mesnav"><button class="btn ghost sm" onclick="cmMes(-1)">‹</button><b>${MESES[mes - 1]} ${ano}</b><button class="btn ghost sm" onclick="cmMes(1)">›</button>${S.cm.mes !== hojeMes() ? '<button class="linkbtn" onclick="cmMes(0)">hoje</button>' : ''}</div></div>
      ${calendario(ano, mes, d.reunioes)}
      <div class="cm-leg"><span><i style="background:#1D4ED8"></i>Agendada</span><span><i style="background:#1F9D6B"></i>Realizada</span><span><i style="background:#9AA7AE"></i>Cancelada</span>${d.proxima ? `<span style="margin-left:auto">Próxima: <b>${esc(d.proxima.titulo)}</b> · ${dataHoraBR(d.proxima.data)}</span>` : ''}</div></div>
    <div class="card p"><div class="sect-title">Histórico de atas</div><div class="sect-sub">Reuniões realizadas</div>
      ${d.historico.map(h => `<div class="row-item" style="cursor:pointer" onclick="cmAbrir(${h.id})"><div class="ico" style="background:#EEF3F5">${ic('book')}</div><div style="flex:1;min-width:0"><div class="ttl">${esc(h.titulo)}</div><div class="meta">${dataBR(h.data)} · ${h.itens} ações</div></div>${h.tem_ata ? `<button class="btn ghost sm" onclick="event.stopPropagation();cmPDF(${h.id})">PDF</button>` : '<span class="tag gray">sem ata</span>'}</div>`).join('') || '<div class="vazio">Nenhuma reunião realizada.</div>'}</div>
  </div>
  <div class="card p" style="margin-top:16px"><div class="between"><div><div class="sect-title">Pendências em aberto</div><div class="sect-sub">Ações do comitê ainda não concluídas · as atrasadas primeiro</div></div><span class="tag ${k.vencidas ? 'red' : 'green'}">${k.vencidas} vencidas</span></div>
    ${d.pendencias.length ? `<div style="overflow-x:auto"><table><thead><tr><th>Ação</th><th>Reunião</th><th>Área</th><th>Responsável</th><th>Prazo</th><th>Situação</th></tr></thead><tbody>
    ${d.pendencias.map(p => `<tr style="cursor:pointer" onclick="cmAbrir(${p.reuniao_id},'plano')"><td><b>${esc(p.acao)}</b></td><td class="mini">${dataBR(p.reuniao_data)}</td><td>${esc(p.area_nome || '—')}</td><td>${esc(p.responsavel || '—')}</td><td>${p.acao_prazo || p.prazo ? dataBR(p.acao_prazo || p.prazo) : esc(p.prazo_texto || '—')}</td><td><span class="tag ${SIT_COR[p.situacao]}">${p.situacao}</span>${p.acao_id ? ' <span class="mini">· no Kanban</span>' : ''}</td></tr>`).join('')}</tbody></table></div>` : '<div class="vazio">Nenhuma pendência em aberto. ✅</div>'}</div>`;
};
function calendario(ano, mes, reunioes) {
  const primeiro = new Date(Date.UTC(ano, mes - 1, 1)), dias = new Date(Date.UTC(ano, mes, 0)).getUTCDate();
  const ini = (primeiro.getUTCDay() + 6) % 7; // semana começa na segunda
  const hoje = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
  const porDia = {};
  reunioes.forEach(r => { const p = spParts(r.data); (porDia[p.dia] ||= []).push({ ...r, hora: p.hora }); });
  let cel = '';
  for (let i = 0; i < ini; i++) cel += '<div class="cm-dia vazio"></div>';
  for (let d = 1; d <= dias; d++) {
    const iso = `${ano}-${String(mes).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const rs = porDia[iso] || [];
    cel += `<div class="cm-dia ${iso === hoje ? 'hoje' : ''}" ${podeEditar() ? `ondblclick="cmNova('${iso}')" title="Clique duas vezes para agendar"` : ''}><span class="n">${d}</span>${rs.map(r => `<div class="cm-ev ${r.status.toLowerCase()}" onclick="event.stopPropagation();cmAbrir(${r.id})" title="${esc(r.titulo)}"><b>${r.hora}</b> ${esc(r.titulo)}</div>`).join('')}</div>`;
  }
  return `<div class="cm-cal">${['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'].map(x => `<div class="cm-sem">${x}</div>`).join('')}${cel}</div>`;
}
window.cmMes = n => { if (!n) S.cm.mes = hojeMes(); else { let [a, m] = S.cm.mes.split('-').map(Number); m += n; if (m < 1) { m = 12; a--; } if (m > 12) { m = 1; a++; } S.cm.mes = `${a}-${String(m).padStart(2, '0')}`; } go('comite'); };
window.cmAbrir = (id, aba) => { S.cm.id = id; S.cm.aba = aba || S.cm.aba || 'ata'; go('reuniao'); };

// ---------- nova reunião / editar cabeçalho ----------
function formCabecalho(r = {}) {
  return `<div class="form-grid" style="grid-template-columns:1fr 1fr">
  <div class="full"><label class="lbl">Título</label><input class="inp" id="cmT" value="${esc(r.titulo || 'Comitê Integrado de Execução Comercial')}"></div>
  <div class="full"><label class="lbl">Tema / subtítulo</label><input class="inp" id="cmSub" value="${esc(r.subtitulo || '')}" placeholder="Ex.: Semana 1 — Performance Comercial + Pessoas & Produtividade"></div>
  <div><label class="lbl">Início</label><input class="inp" type="datetime-local" id="cmIni" value="${esc(r.ini || '')}"></div>
  <div><label class="lbl">Término (previsto)</label><input class="inp" type="datetime-local" id="cmFim" value="${esc(r.fimv || '')}"></div>
  <div><label class="lbl">Local / formato</label><input class="inp" id="cmLocal" value="${esc(r.local || '')}" placeholder="Google Meet, sala da diretoria…"></div>
  <div><label class="lbl">Condução</label><input class="inp" id="cmCond" value="${esc(r.conducao || '')}" placeholder="Sanderson Auler"></div>
  <div><label class="lbl">Registro da ata</label><input class="inp" id="cmReg" value="${esc(r.registro || '')}"></div>
  <div><label class="lbl">Presidente</label><input class="inp" id="cmPres" value="${esc(r.presidente || '')}" placeholder="Diretor executivo"></div>
  <div class="full"><label class="lbl">Participantes</label><textarea class="inp" id="cmPart" rows="2" placeholder="Nomes separados por vírgula">${esc(r.participantes || '')}</textarea></div>
  <div class="full"><label class="lbl">Ausências</label><input class="inp" id="cmAus" value="${esc(r.ausencias || '')}"></div>
  <div class="full"><label class="lbl">Pauta (um item por linha · opcional: "item | área")</label><textarea class="inp" id="cmPauta" rows="3">${esc((r.pauta || []).map(p => p.item + (p.area ? ' | ' + p.area : '')).join('\n'))}</textarea></div></div>`;
}
const lerCabecalho = () => {
  const v = id => document.getElementById(id)?.value ?? '';
  const nomes = Object.fromEntries(AREAS().map(([id, n]) => [n.toLowerCase(), id]));
  return { titulo: v('cmT'), subtitulo: v('cmSub'), data: v('cmIni'), fim: v('cmFim') || null, local: v('cmLocal'), conducao: v('cmCond'), registro: v('cmReg'), presidente: v('cmPres'),
    participantes: v('cmPart'), ausencias: v('cmAus'),
    pauta: v('cmPauta').split('\n').map(l => l.trim()).filter(Boolean).map(l => { const [i, a] = l.split('|').map(x => x.trim()); return { item: i, area: a ? (nomes[a.toLowerCase()] || a) : '' }; }) };
};
window.cmNova = dia => {
  abrirModal('Nova reunião do comitê', `${formCabecalho({ ini: dia ? `${dia}T15:00` : '', conducao: 'Sanderson Auler', local: 'Google Meet' })}
  <div style="display:flex;gap:8px;margin-top:14px"><button class="btn red" onclick="cmCriar()">Agendar reunião</button><button class="btn ghost" onclick="fecharModal()">Cancelar</button></div>`, true);
};
window.cmCriar = async () => {
  const c = lerCabecalho();
  if (!c.data) return toast('Informe a data e a hora de início.', 'erro');
  const r = await chamar(() => api('/comite-gestao/reunioes', { metodo: 'POST', corpo: c }));
  fecharModal(); toast('Reunião agendada.', 'ok'); S.cm.mes = c.data.slice(0, 7); window.cmAbrir(r.id, 'transcricao');
};

// ======================= REUNIÃO =======================
const ABAS_R = [['transcricao', '🎙️ Transcrição'], ['ata', '📄 Ata'], ['plano', '✅ Plano de ação'], ['pauta', '🗂️ Pauta']];
S.telas.reuniao = async () => {
  const d = await api(`/comite-gestao/reunioes/${S.cm.id}`);
  S.cm.d = d; S.cm.ataDraft = JSON.parse(JSON.stringify(d.reuniao.ata_json || { resumo: d.reuniao.ata ? [{ tema: 'Registro', texto: d.reuniao.ata }] : [], diretrizes: [], documentos: '', observacoes: '' }));
  const r = d.reuniao, ok = d.itens.filter(i => i.situacao === 'Concluída').length;
  return `<div class="page-head"><div><h1>${esc(r.titulo)}</h1><p>${dataHoraBR(r.data)}${r.fim ? ' às ' + spParts(r.fim).hora : ''}${duracao(r.data, r.fim) ? ' · ' + duracao(r.data, r.fim) : ''}${r.local ? ' · ' + esc(r.local) : ''}${r.subtitulo ? ' — ' + esc(r.subtitulo) : ''}</p></div>
  <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn" onclick="go('comite')">← Comitê</button>${podeEditar() ? '<button class="btn" onclick="cmEditarCab()">✏️ Dados da reunião</button>' : ''}${r.ata_json || r.ata ? `<button class="btn" onclick="cmPDF(${r.id})">⬇ Ata em PDF</button>` : ''}</div></div>
  <div class="card p cm-cab"><div class="cm-cabg">
    <div><span>Status</span><b><span class="tag ${r.status === 'Realizada' ? 'green' : r.status === 'Cancelada' ? 'gray' : 'blue'}">${r.status}</span></b></div>
    <div><span>Condução</span><b>${esc(r.conducao || r.presidente || '—')}</b></div><div><span>Registro da ata</span><b>${esc(r.registro || '—')}</b></div>
    <div><span>Plano de ação</span><b>${ok}/${d.itens.length} concluídas</b></div>
    <div class="full"><span>Participantes</span><b>${esc(r.participantes || '—')}</b></div>${r.ausencias ? `<div class="full"><span>Ausências</span><b>${esc(r.ausencias)}</b></div>` : ''}</div>
    ${podeEditar() && r.status === 'Agendada' ? '<div style="display:flex;gap:8px;margin-top:10px"><button class="btn" onclick="cmStatus(\'Realizada\')">✓ Marcar como realizada</button><button class="btn ghost" onclick="cmStatus(\'Cancelada\')">Cancelar reunião</button></div>' : ''}</div>
  <div class="subtabs" style="margin:14px 0">${ABAS_R.map(([k, t]) => `<button class="${S.cm.aba === k ? 'on' : ''}" onclick="cmAba('${k}')">${t}${k === 'plano' ? ` <span class="mini">(${d.itens.length})</span>` : ''}</button>`).join('')}</div>
  <div id="cmCorpo"></div>`;
};
S.depois.reuniao = () => {
  trilha(`Academia Milla 360 · <a onclick="go('comite')">Comitê Comercial</a> · <b>${esc(S.cm.d?.reuniao?.titulo || '')} · ${dataBR(S.cm.d?.reuniao?.data)}</b>`);
  marcarAtivo('comite'); window.cmAba(S.cm.aba || 'ata');
};
window.cmAba = k => {
  if (S.cm.aba === 'ata' && k !== 'ata') lerAta();
  S.cm.aba = k;
  document.querySelectorAll('.subtabs button').forEach((b, i) => b.classList.toggle('on', ABAS_R[i]?.[0] === k));
  const el = document.getElementById('cmCorpo'); if (el) el.innerHTML = ABA[k](S.cm.d);
};
window.cmEditarCab = () => {
  const r = S.cm.d.reuniao;
  abrirModal('Dados da reunião', `${formCabecalho({ ...r, ini: inputDT(r.data), fimv: inputDT(r.fim) })}
  <div style="display:flex;gap:8px;margin-top:14px"><button class="btn red" onclick="cmSalvarCab()">💾 Salvar</button><button class="btn ghost" onclick="fecharModal()">Cancelar</button></div>`, true);
};
window.cmSalvarCab = async () => { await chamar(() => api(`/comite-gestao/reunioes/${S.cm.id}`, { metodo: 'PUT', corpo: lerCabecalho() })); fecharModal(); toast('Dados da reunião salvos.', 'ok'); go('reuniao'); };
window.cmStatus = async st => { const r = await chamar(() => api(`/comite-gestao/reunioes/${S.cm.id}`, { metodo: 'PUT', corpo: { status: st } })); pontosToast(r, st === 'Realizada' ? 'Reunião realizada.' : 'Reunião cancelada.'); go('reuniao'); };

const ABA = {
  transcricao: d => {
    const r = d.reuniao;
    return `<div class="cm-2"><div class="card p"><div class="between"><div><div class="sect-title">Transcrição da reunião</div><div class="sect-sub">${r.transcricao_origem ? `Carregada de ${esc(r.transcricao_origem)} · ` : ''}${(r.transcricao || '').length.toLocaleString('pt-BR')} caracteres</div></div></div>
      <textarea class="inp cm-trans" id="cmTrans" placeholder="Cole aqui a transcrição do Google Meet / Teams, ou digite o que aconteceu na reunião…" ${podeEditar() ? '' : 'readonly'}>${esc(r.transcricao || '')}</textarea>
      ${podeEditar() ? `<div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap"><button class="btn" onclick="cmSalvarTrans()">💾 Salvar transcrição</button><button class="btn red" onclick="cmGerarAta()">✨ Gerar ata com IA</button></div>` : ''}</div>
      <div class="card p"><div class="sect-title">Enviar arquivo</div><div class="sect-sub">O texto do arquivo substitui o que está no campo ao lado</div>
        ${podeEditar() ? `<label class="cm-drop"><input type="file" accept=".txt,.vtt,.srt,.docx,.pdf,.md,audio/*,video/mp4,video/webm" onchange="cmArquivo(this)" style="display:none"><b>📎 Escolher arquivo</b><span class="mini">Texto (.txt, .vtt, .docx, .pdf) ou áudio (.mp3, .m4a, .wav, .webm) até 25 MB</span></label><div class="mini" id="cmArqMsg" style="margin-top:8px"></div>` : ''}
        <div class="mini" style="margin-top:12px;line-height:1.6"><b>Como funciona:</b><br>1. Inclua a transcrição (cole, envie o arquivo ou grave um áudio).<br>2. Clique em <b>Gerar ata com IA</b>: a ata sai no modelo executivo do comitê, com resumo por tema, diretrizes, revisão das pendências e plano de ação.<br>3. Revise a ata, ajuste o plano de ação e encaminhe cada ação para a área.<br><br>Áudio é transcrito com a chave da OpenAI ou da Groq cadastrada no Assistente Milla. Vídeo longo: use a transcrição gerada pelo Meet.</div></div></div>`;
  },
  ata: d => {
    const a = S.cm.ataDraft, ed = podeEditar(), r = d.reuniao;
    return `<div class="card p">${r.ata_gerada_em ? `<div class="mini" style="margin-bottom:8px">Ata gerada por IA em ${dataHoraBR(r.ata_gerada_em)} (${esc(r.ata_gerada_por || '')}) · revise antes de enviar</div>` : ''}
      <label class="lbl">Documentos da reunião e observações de agenda</label><textarea class="inp" id="ataDoc" rows="3" ${ed ? '' : 'readonly'}>${esc(a.documentos || '')}</textarea>
      <div class="sect-title" style="margin-top:16px">01 · Resumo da reunião</div>
      <div id="ataResumo">${(a.resumo || []).map((s, i) => `<div class="cm-bloco"><div class="between"><input class="inp ata-tema" value="${esc(s.tema)}" placeholder="Tema do bloco" ${ed ? '' : 'readonly'}>${ed ? `<button class="btn ghost sm" onclick="cmAtaDel('resumo',${i})">🗑</button>` : ''}</div><textarea class="inp ata-texto" rows="5" ${ed ? '' : 'readonly'}>${esc(s.texto)}</textarea></div>`).join('')}</div>
      ${ed ? '<button class="linkbtn" onclick="cmAtaAdd(\'resumo\')">+ bloco do resumo</button>' : ''}
      <div class="sect-title" style="margin-top:16px">02 · Diretrizes registradas</div><div class="sect-sub">Posicionamentos do comitê — a decisão cabe à direção do Grupo Milla</div>
      <div id="ataDir">${(a.diretrizes || []).map((t, i) => `<div class="cm-dir"><span>—</span><textarea class="inp ata-dir" rows="2" ${ed ? '' : 'readonly'}>${esc(t)}</textarea>${ed ? `<button class="btn ghost sm" onclick="cmAtaDel('diretrizes',${i})">🗑</button>` : ''}</div>`).join('')}</div>
      ${ed ? '<button class="linkbtn" onclick="cmAtaAdd(\'diretrizes\')">+ diretriz</button>' : ''}
      <div class="sect-title" style="margin-top:16px">03 e 04 · Revisão de pendências e ações definidas</div><div class="mini">Vêm do plano de ação (aba ✅ Plano de ação) e entram automaticamente no PDF.</div>
      <label class="lbl" style="margin-top:14px">Observações finais</label><textarea class="inp" id="ataObs" rows="2" ${ed ? '' : 'readonly'}>${esc(a.observacoes || 'Regra de ouro: nenhuma ação sem responsável e prazo; a revisão desta ata é a primeira pauta da próxima reunião.')}</textarea>
      <div style="display:flex;gap:8px;margin-top:14px;flex-wrap:wrap">${ed ? '<button class="btn red" onclick="cmSalvarAta()">💾 Salvar ata</button>' : ''}<button class="btn" onclick="cmSalvarAta(true)">⬇ Baixar PDF</button></div></div>`;
  },
  plano: d => {
    const ed = podeEditar();
    const linha = (i, n, ant) => `<tr class="${i.situacao === 'Concluída' ? 'cm-ok' : ''}"><td><input type="checkbox" ${i.situacao === 'Concluída' ? 'checked' : ''} ${pode('comite') && i.situacao !== 'Cancelada' ? '' : 'disabled'} onchange="cmCheck(${i.id},this.checked)" title="Concluída"></td>
      <td>${n}</td><td><b>${esc(i.acao)}</b>${i.objetivo ? `<div class="mini">${esc(i.objetivo)}</div>` : ''}${ant ? `<div class="mini">Reunião de ${dataBR(i.reuniao_data)}</div>` : ''}</td>
      <td>${esc(i.area_nome || '—')}</td><td>${esc(i.responsavel || '—')}</td>
      <td class="mini">${i.inicio ? dataBR(i.inicio) + ' → ' : ''}${i.acao_prazo || i.prazo ? dataBR(i.acao_prazo || i.prazo) : esc(i.prazo_texto || 'a definir')}</td>
      <td><span class="tag ${SIT_COR[i.situacao]}">${i.situacao}</span></td>
      <td style="white-space:nowrap">${i.acao_id ? `<button class="linkbtn" onclick="openArea('${i.area_id}','acao');setTimeout(()=>openTask(${i.acao_id}),500)">Ver no Kanban →</button>` : ed && i.situacao !== 'Concluída' && i.situacao !== 'Cancelada' ? `<button class="btn sm red" onclick="cmEncaminhar(${i.id})">Encaminhar à área</button>` : ''}
        ${ed ? `<button class="btn ghost sm" onclick="cmItem(${i.id})">✏️</button>` : ''}</td></tr>`;
    const tab = (lista, ant) => `<div style="overflow-x:auto"><table class="cm-tab"><thead><tr><th></th><th>Nº</th><th>Ação</th><th>Área</th><th>Responsável</th><th>Execução</th><th>Status</th><th></th></tr></thead><tbody>${lista.map((i, n) => linha(i, n + 1, ant)).join('')}</tbody></table></div>`;
    return `${d.anteriores.length ? `<div class="card p" style="margin-bottom:14px"><div class="sect-title">Revisão de pendências anteriores</div><div class="sect-sub">Ações de reuniões anteriores ainda abertas (ou concluídas desde a última reunião) — primeira pauta da reunião</div>${tab(d.anteriores, true)}</div>` : ''}
    <div class="card p"><div class="between"><div><div class="sect-title">Ações definidas nesta reunião</div><div class="sect-sub">Marque a caixa quando concluir · encaminhe para a área executar pelo Kanban (o status volta para cá automaticamente)</div></div>${ed ? '<button class="btn red" onclick="cmItem()">+ Nova ação</button>' : ''}</div>
      ${d.itens.length ? tab(d.itens) : '<div class="vazio">Nenhuma ação ainda. Gere a ata com IA ou inclua as ações manualmente.</div>'}
      <div class="mini" style="margin-top:8px">Status possíveis: Aberta · Em andamento · Concluída · Atrasada (prazo vencido) · Agendada · Cancelada. Regra de ouro: nenhuma ação sem responsável e prazo.</div></div>`;
  },
  pauta: d => {
    const p = d.reuniao.pauta || [];
    return `<div class="card p"><div class="sect-title">Pauta</div>${p.length ? p.map((x, i) => `<div class="row-item"><div class="cm-num">${i + 1}</div><div style="flex:1"><div class="ttl">${esc(x.item)}</div><div class="meta">${esc(S.D.areas[x.area]?.nome || x.area || '')}</div></div></div>`).join('') : '<div class="vazio">Sem pauta cadastrada.</div>'}
    ${podeEditar() ? '<button class="btn" style="margin-top:10px" onclick="cmEditarCab()">✏️ Editar pauta</button>' : ''}</div>`;
  },
};

// ---------- transcrição ----------
window.cmSalvarTrans = async () => {
  await chamar(() => api(`/comite-gestao/reunioes/${S.cm.id}`, { metodo: 'PUT', corpo: { transcricao: document.getElementById('cmTrans').value } }));
  S.cm.d.reuniao.transcricao = document.getElementById('cmTrans').value; toast('Transcrição salva.', 'ok');
};
window.cmArquivo = inp => {
  const f = inp.files[0]; if (!f) return;
  if (f.size > 25 * 1024 * 1024) { inp.value = ''; return toast('Arquivo maior que 25 MB. Para vídeos longos, use a transcrição gerada pelo Meet.', 'erro'); }
  const msg = document.getElementById('cmArqMsg'); msg.textContent = /^(audio|video)\//.test(f.type) ? 'Enviando e transcrevendo o áudio… pode levar alguns minutos.' : 'Lendo o arquivo…';
  const x = new XMLHttpRequest();
  x.open('POST', `${BASE}/comite-gestao/reunioes/${S.cm.id}/transcricao?nome=${encodeURIComponent(f.name)}`);
  x.setRequestHeader('Content-Type', f.type || 'application/octet-stream');
  const tk = sessao.obter()?.token; if (tk) x.setRequestHeader('Authorization', `Bearer ${tk}`);
  x.onload = () => { let r = {}; try { r = JSON.parse(x.responseText); } catch {} if (x.status >= 300) { msg.textContent = ''; return toast(r.erro || 'Não foi possível ler o arquivo.', 'erro'); }
    msg.textContent = `✓ ${r.caracteres.toLocaleString('pt-BR')} caracteres carregados.`; S.cm.d.reuniao.transcricao = r.texto; S.cm.d.reuniao.transcricao_origem = f.name; document.getElementById('cmTrans').value = r.texto; toast('Transcrição carregada.', 'ok'); };
  x.onerror = () => toast('Conexão interrompida no envio.', 'erro');
  x.send(f);
};
window.cmGerarAta = async () => {
  const t = document.getElementById('cmTrans')?.value || '';
  if (t.trim().length < 200) return toast('Inclua a transcrição (ou o relato da reunião) antes de gerar a ata.', 'erro');
  if (S.cm.d.itens.some(i => !i.acao_id) && S.cm.d.reuniao.ata_json && !confirmarRegerar()) return;
  await chamar(() => api(`/comite-gestao/reunioes/${S.cm.id}`, { metodo: 'PUT', corpo: { transcricao: t } }));
  abrirModal('Gerando a ata…', '<div style="text-align:center;padding:20px"><div style="font-size:36px">✨</div><div class="sect-title" style="margin-top:8px">A IA está lendo a transcrição e montando a ata</div><div class="mini" style="margin-top:6px">Resumo por tema, diretrizes, revisão de pendências e plano de ação. Isso pode levar até 2 minutos.</div></div>');
  try {
    await api(`/comite-gestao/reunioes/${S.cm.id}/gerar-ata`, { metodo: 'POST' });
    fecharModal(); toast('Ata gerada. Revise o texto e o plano de ação.', 'ok'); S.cm.aba = 'ata'; go('reuniao');
  } catch (e) { fecharModal(); toast(e.message, 'erro'); }
};
function confirmarRegerar() { return window.confirm('Gerar de novo substitui a ata e as ações ainda não encaminhadas. As ações já encaminhadas às áreas são mantidas. Continuar?'); }

// ---------- ata ----------
function lerAta() {
  if (!document.getElementById('ataDoc')) return;
  S.cm.ataDraft = {
    documentos: document.getElementById('ataDoc').value,
    resumo: [...document.querySelectorAll('#ataResumo .cm-bloco')].map(b => ({ tema: b.querySelector('.ata-tema').value, texto: b.querySelector('.ata-texto').value })),
    diretrizes: [...document.querySelectorAll('#ataDir .ata-dir')].map(x => x.value).filter(x => x.trim()),
    observacoes: document.getElementById('ataObs').value,
  };
}
window.cmAtaAdd = k => { lerAta(); (S.cm.ataDraft[k] ||= []).push(k === 'resumo' ? { tema: '', texto: '' } : ''); document.getElementById('cmCorpo').innerHTML = ABA.ata(S.cm.d); };
window.cmAtaDel = (k, i) => { lerAta(); S.cm.ataDraft[k].splice(i, 1); document.getElementById('cmCorpo').innerHTML = ABA.ata(S.cm.d); };
window.cmSalvarAta = async pdf => {
  lerAta();
  if (podeEditar()) { await chamar(() => api(`/comite-gestao/reunioes/${S.cm.id}`, { metodo: 'PUT', corpo: { ata_json: S.cm.ataDraft } })); S.cm.d.reuniao.ata_json = S.cm.ataDraft; if (!pdf) toast('Ata salva.', 'ok'); }
  if (pdf) window.cmPDF(S.cm.id);
};

// ---------- plano de ação ----------
window.cmCheck = async (id, ok) => {
  try { await api(`/comite-gestao/itens/${id}/status`, { metodo: 'PATCH', corpo: { status: ok ? 'Concluída' : 'Aberta' } }); toast(ok ? 'Ação concluída ✓' : 'Ação reaberta.', 'ok'); }
  catch (e) { toast(e.message, 'erro'); }
  const d = await api(`/comite-gestao/reunioes/${S.cm.id}`); S.cm.d = d; document.getElementById('cmCorpo').innerHTML = ABA.plano(d);
};
const todosItens = () => [...S.cm.d.itens, ...S.cm.d.anteriores];
window.cmItem = id => {
  const i = id ? todosItens().find(x => x.id === id) : {};
  abrirModal(id ? 'Editar ação' : 'Nova ação', `<div class="form-grid" style="grid-template-columns:1fr 1fr">
    <div class="full"><label class="lbl">Ação</label><textarea class="inp" id="itA" rows="2">${esc(i.acao || '')}</textarea></div>
    <div class="full"><label class="lbl">Objetivo</label><input class="inp" id="itO" value="${esc(i.objetivo || '')}"></div>
    <div><label class="lbl">Área</label><select class="inp" id="itAr">${opcoes([['', '—'], ...AREAS()], i.area_id || '')}</select></div>
    <div><label class="lbl">Responsável</label><input class="inp" id="itR" list="cmUsuarios" value="${esc(i.responsavel || '')}"><datalist id="cmUsuarios">${S.cm.d.usuarios.map(u => `<option value="${esc(u.nome)}">`).join('')}</datalist></div>
    <div><label class="lbl">Início da execução</label><input class="inp" type="date" id="itI" value="${i.inicio ? String(i.inicio).slice(0, 10) : ''}"></div>
    <div><label class="lbl">Término (prazo)</label><input class="inp" type="date" id="itP" value="${i.prazo ? String(i.prazo).slice(0, 10) : ''}"></div>
    <div class="full"><label class="lbl">Prazo como combinado (opcional)</label><input class="inp" id="itPT" value="${esc(i.prazo_texto || '')}" placeholder="próxima reunião, esta semana…"></div>
    ${id ? `<div><label class="lbl">Status</label><select class="inp" id="itS">${opcoes(['Aberta', 'Em andamento', 'Concluída', 'Agendada', 'Cancelada'], i.status || 'Aberta')}</select></div>` : ''}</div>
    <div style="display:flex;gap:8px;margin-top:14px;flex-wrap:wrap"><button class="btn red" onclick="cmSalvarItem(${id || 0})">💾 Salvar</button>${id && !i.acao_id ? `<button class="btn ghost" onclick="cmExcluirItem(${id})" id="cmDel">Excluir</button>` : ''}<button class="btn ghost" onclick="fecharModal()">Cancelar</button></div>`, true);
};
window.cmSalvarItem = async id => {
  const v = x => document.getElementById(x)?.value || '';
  const u = S.cm.d.usuarios.find(x => x.nome === v('itR'));
  const corpo = { acao: v('itA'), objetivo: v('itO'), area_id: v('itAr') || null, responsavel: v('itR'), responsavel_id: u?.id || null, inicio: v('itI'), prazo: v('itP'), prazo_texto: v('itPT') };
  if (!corpo.acao.trim()) return toast('Descreva a ação.', 'erro');
  if (id) {
    await chamar(() => api(`/comite-gestao/itens/${id}`, { metodo: 'PUT', corpo }));
    const st = v('itS'); const i = todosItens().find(x => x.id === id);
    if (st && st !== i.status) await chamar(() => api(`/comite-gestao/itens/${id}/status`, { metodo: 'PATCH', corpo: { status: st } }));
  } else await chamar(() => api(`/comite-gestao/reunioes/${S.cm.id}/itens`, { metodo: 'POST', corpo }));
  fecharModal(); toast('Ação salva.', 'ok'); S.cm.aba = 'plano'; go('reuniao');
};
window.cmExcluirItem = async id => {
  const b = document.getElementById('cmDel');
  if (!b.dataset.conf) { b.dataset.conf = 1; b.textContent = 'Confirmar exclusão'; b.classList.add('red'); return; }
  await chamar(() => api(`/comite-gestao/itens/${id}`, { metodo: 'DELETE' })); fecharModal(); toast('Ação excluída.', 'ok'); S.cm.aba = 'plano'; go('reuniao');
};
window.cmEncaminhar = id => {
  const i = todosItens().find(x => x.id === id);
  const hoje = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
  abrirModal('Encaminhar à área', `<div class="card p" style="background:#F8FAFB;margin-bottom:12px"><b>${esc(i.acao)}</b>${i.objetivo ? `<div class="mini">${esc(i.objetivo)}</div>` : ''}</div>
  <div class="form-grid" style="grid-template-columns:1fr 1fr">
    <div><label class="lbl">Área que executa</label><select class="inp" id="enA" onchange="cmFiltrarResp()">${opcoes([['', 'Escolha…'], ...AREAS()], i.area_id || '')}</select></div>
    <div><label class="lbl">Usuário responsável</label><select class="inp" id="enU"></select></div>
    <div><label class="lbl">Início da execução</label><input class="inp" type="date" id="enI" value="${i.inicio ? String(i.inicio).slice(0, 10) : hoje}"></div>
    <div><label class="lbl">Término (prazo)</label><input class="inp" type="date" id="enP" value="${i.prazo ? String(i.prazo).slice(0, 10) : ''}"></div>
    <div><label class="lbl">Prioridade</label><select class="inp" id="enPr">${opcoes(['Alta', 'Média', 'Baixa'], 'Alta')}</select></div></div>
  <div class="mini" style="margin-top:10px">A ação entra no Plano de Ação (Kanban) da área, com origem "Comitê". A área edita, comenta e muda o status por lá; a situação volta para este plano automaticamente.</div>
  <div style="display:flex;gap:8px;margin-top:14px"><button class="btn red" onclick="cmConfirmarEnc(${id})">Encaminhar</button><button class="btn ghost" onclick="fecharModal()">Cancelar</button></div>`, true);
  S.cm.respPadrao = i.responsavel; window.cmFiltrarResp();
};
window.cmFiltrarResp = () => {
  const a = document.getElementById('enA').value, us = S.cm.d.usuarios;
  const daArea = us.filter(u => u.area_id === a), outros = us.filter(u => u.area_id !== a);
  const sel = us.find(u => u.nome === S.cm.respPadrao)?.id || daArea[0]?.id || '';
  document.getElementById('enU').innerHTML = `<option value="">— sem usuário (só o nome) —</option>${daArea.length ? `<optgroup label="Da área">${daArea.map(u => `<option value="${u.id}" ${u.id === sel ? 'selected' : ''}>${esc(u.nome)}</option>`).join('')}</optgroup>` : ''}<optgroup label="Outros usuários">${outros.map(u => `<option value="${u.id}" ${u.id === sel ? 'selected' : ''}>${esc(u.nome)}</option>`).join('')}</optgroup>`;
};
window.cmConfirmarEnc = async id => {
  const v = x => document.getElementById(x)?.value || '';
  const r = await chamar(() => api(`/comite-gestao/itens/${id}/encaminhar`, { metodo: 'POST', corpo: { area_id: v('enA'), responsavel_id: v('enU') || null, inicio: v('enI'), prazo: v('enP'), prioridade: v('enPr') } }));
  fecharModal(); toast(`Encaminhada ao Kanban de ${r.area}.`, 'ok'); S.cm.aba = 'plano'; go('reuniao');
};

// ======================= ATA EM PDF (modelo executivo SCA Solutions) =======================
window.cmPDF = async id => {
  const d = id === S.cm.d?.reuniao?.id ? S.cm.d : await chamar(() => api(`/comite-gestao/reunioes/${id}`));
  const r = d.reuniao, a = (id === S.cm.d?.reuniao?.id ? S.cm.ataDraft : null) || r.ata_json || { resumo: r.ata ? [{ tema: 'Registro', texto: r.ata }] : [], diretrizes: [] };
  const ini = spParts(r.data), fim = r.fim ? spParts(r.fim) : null;
  const e = s => esc(s || '').replace(/\n/g, '<br>');
  const prazo = i => (i.acao_prazo || i.prazo ? dataBR(i.acao_prazo || i.prazo) : esc(i.prazo_texto || 'a definir'));
  const resp = i => esc([i.responsavel, i.area_nome && !String(i.responsavel || '').includes(i.area_nome) ? `(${i.area_nome})` : ''].filter(Boolean).join(' ') || 'a definir');
  const tabela = (lista, ant) => `<table class="t"><thead><tr><th style="width:5%">Nº</th><th style="width:30%">Ação</th><th style="width:22%">Objetivo</th><th style="width:17%">Responsável</th><th style="width:11%">Prazo</th><th style="width:15%">Status</th></tr></thead><tbody>
    ${lista.map((i, n) => `<tr><td class="c">${n + 1}</td><td>${e(i.acao)}${ant ? `<div class="s">Reunião de ${dataBR(i.reuniao_data)}</div>` : ''}</td><td>${e(i.objetivo || '—')}</td><td>${resp(i)}</td><td>${prazo(i)}</td><td><b class="st ${i.situacao === 'Concluída' ? 'ok' : i.situacao === 'Atrasada' ? 'at' : ''}">${i.situacao}</b>${i.acao_id ? '<div class="s">no Kanban da área</div>' : ''}</td></tr>`).join('') || '<tr><td colspan="6" class="c">—</td></tr>'}</tbody></table>`;
  const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><title>Ata Executiva — ${esc(r.titulo)} — ${dataBR(r.data)}</title><style>
  @page{size:A4;margin:14mm 13mm 16mm}*{box-sizing:border-box}body{font-family:Calibri,'Segoe UI',Arial,sans-serif;color:#1F2A30;font-size:10.5pt;margin:0;line-height:1.42}
  .faixa{background:#0B2545;color:#fff;padding:16px 20px;border-radius:4px}.faixa .k{font-size:8.5pt;letter-spacing:1.4px;font-weight:700;color:#F4C542}.faixa h1{margin:4px 0 2px;font-size:20pt}.faixa p{margin:0;font-size:10pt;opacity:.92}
  table.cab{width:100%;border-collapse:collapse;margin:12px 0}table.cab td{border:1px solid #D5DCE3;padding:6px 8px;vertical-align:top;font-size:9.5pt}table.cab td.l{background:#EEF2F6;font-weight:700;width:15%;color:#0B2545}
  .doc{background:#FFF8E5;border-left:4px solid #E0A82E;padding:8px 12px;font-size:9.5pt;margin:8px 0 14px}
  h2{color:#0B2545;font-size:13pt;margin:18px 0 8px;border-bottom:2px solid #0B2545;padding-bottom:3px}h2 b{color:#C8102E;margin-right:6px}
  .res p{margin:0 0 8px;text-align:justify}.res b{color:#0B2545}.dir{background:#F3F6FA;border-left:4px solid #0B2545;padding:8px 14px}.dir p{margin:5px 0;font-weight:700}
  table.t{width:100%;border-collapse:collapse;font-size:9pt}table.t th{background:#0B2545;color:#fff;padding:6px;text-align:left;font-weight:700}table.t td{border-bottom:1px solid #D5DCE3;padding:5px 6px;vertical-align:top}
  table.t tr:nth-child(even) td{background:#F7F9FB}.c{text-align:center}.s{font-size:8pt;color:#5B6B76}.st.ok{color:#0E7C66}.st.at{color:#C8102E}
  .obs{margin-top:12px;font-size:9pt;background:#EEF2F6;padding:8px 12px}.rod{text-align:center;color:#0B2545;font-style:italic;margin-top:16px;font-size:9.5pt}
  tr,.dir p,.res p{page-break-inside:avoid}h2{page-break-after:avoid}</style></head><body>
  <div class="faixa"><div class="k">GRUPO MILLA · ${esc((r.titulo || 'Comitê').toUpperCase())}</div><h1>Ata Executiva — Reunião de ${dataBR(r.data)}</h1><p>${esc(r.subtitulo || r.titulo)}</p></div>
  <table class="cab"><tr><td class="l">Data / horário</td><td>${dataBR(r.data)} · ${ini.hora}${fim ? ` às ${fim.hora}` : ''}</td><td class="l">Duração</td><td>${[duracao(r.data, r.fim), r.local].filter(Boolean).map(esc).join(' · ') || '—'}</td></tr>
  <tr><td class="l">Condução</td><td>${esc(r.conducao || r.presidente || '—')}</td><td class="l">Registro da ata</td><td>${esc(r.registro || '—')}</td></tr>
  <tr><td class="l">Participantes</td><td>${esc(r.participantes || '—')}</td><td class="l">Ausências</td><td>${esc(r.ausencias || '—')}</td></tr></table>
  ${a.documentos ? `<div class="doc">${e(a.documentos)}</div>` : ''}
  <h2><b>01</b>Resumo da reunião</h2><div class="res">${(a.resumo || []).map(s => `<p>${s.tema ? `<b>${esc(s.tema)}:</b> ` : ''}${e(s.texto)}</p>`).join('') || '<p>—</p>'}</div>
  <h2><b>02</b>Diretrizes registradas</h2><div class="dir">${(a.diretrizes || []).map(t => `<p>— ${esc(t)}</p>`).join('') || '<p>—</p>'}</div>
  <h2><b>03</b>Revisão de pendências anteriores</h2>${tabela(d.anteriores, true)}
  <h2><b>04</b>Ações definidas nesta reunião</h2>${tabela(d.itens)}
  <div class="obs">Status possíveis: Concluída · Em andamento · Atrasada · Agendada · Aberta · Cancelada. ${e(a.observacoes || 'Regra de ouro: nenhuma ação sem responsável e prazo; a revisão desta ata é a primeira pauta da próxima reunião.')}</div>
  <div class="rod">Disciplina + Integração = Resultados · Apresentar, decidir, evoluir.<br><span class="s">SCA Solutions · Academia Milla 360</span></div>
  <script>setTimeout(()=>print(),350)<\/script></body></html>`;
  const w = window.open('', '_blank');
  if (!w) return toast('Libere as janelas pop-up para gerar o PDF.', 'erro');
  w.document.write(html); w.document.close();
};

const st = document.createElement('style');
st.textContent = `.cm-kpis{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:12px;margin-bottom:16px}
.cm-kpi{padding:14px}.cm-kic{width:34px;height:34px;border-radius:10px;display:grid;place-items:center;color:#fff;margin-bottom:8px}.cm-kic svg{width:18px;height:18px}
.cm-kv{font-size:24px;font-weight:800;color:var(--ink);line-height:1.1}.cm-kv small{font-size:14px;color:var(--muted);font-weight:700}.cm-kl{font-weight:700;font-size:12.5px;margin:2px 0}
.cm-grid{display:grid;grid-template-columns:minmax(0,2fr) minmax(0,1fr);gap:16px;align-items:start}
.cm-mesnav{display:flex;align-items:center;gap:8px}.cm-mesnav b{min-width:130px;text-align:center}
.cm-cal{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:4px}.cm-sem{font-size:11px;font-weight:700;color:var(--muted);text-align:center;padding:4px 0}
.cm-dia{min-height:78px;border:1px solid var(--line);border-radius:8px;padding:4px;background:#fff;overflow:hidden}.cm-dia.vazio{background:transparent;border-color:transparent}
.cm-dia.hoje{border-color:var(--red);box-shadow:inset 0 0 0 1px var(--red)}.cm-dia .n{font-size:11px;font-weight:700;color:var(--muted)}
.cm-ev{font-size:10.5px;border-radius:5px;padding:2px 5px;margin-top:3px;cursor:pointer;color:#fff;background:#1D4ED8;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.cm-ev.realizada{background:#1F9D6B}.cm-ev.cancelada{background:#9AA7AE;text-decoration:line-through}
.cm-leg{display:flex;gap:14px;flex-wrap:wrap;margin-top:10px;font-size:11.5px;color:var(--muted)}.cm-leg i{display:inline-block;width:10px;height:10px;border-radius:3px;margin-right:5px;vertical-align:-1px}
.cm-cab{padding:14px 18px}.cm-cabg{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px 16px}.cm-cabg .full{grid-column:1/-1}.cm-cabg span{display:block;font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:.5px}.cm-cabg b{font-size:13px}
.cm-2{display:grid;grid-template-columns:minmax(0,1.6fr) minmax(0,1fr);gap:16px;align-items:start}.cm-trans{min-height:380px;font-family:inherit;line-height:1.5;margin-top:8px}
#app label.cm-drop{display:flex;flex-direction:column;align-items:center;gap:6px;border:2px dashed #c6d4e0;border-radius:12px;padding:22px;cursor:pointer;background:#FAFCFD;text-align:center;margin-top:10px}
.cm-bloco{border:1px solid var(--line);border-radius:10px;padding:10px;margin:8px 0}.cm-bloco .ata-tema{font-weight:700;margin-right:8px}.cm-bloco textarea{margin-top:6px}
.cm-dir{display:flex;gap:8px;align-items:flex-start;margin:6px 0}.cm-dir span{font-weight:800;color:var(--petrol);padding-top:8px}
.cm-tab td{vertical-align:top}.cm-tab tr.cm-ok td b{text-decoration:line-through;color:var(--muted)}.cm-tab input[type=checkbox]{width:18px;height:18px;accent-color:#1F9D6B}
.cm-num{width:28px;height:28px;border-radius:50%;background:#EEF3F5;display:grid;place-items:center;font-weight:800;color:var(--petrol);flex:none}
@media (max-width:1200px){.cm-kpis{grid-template-columns:repeat(3,minmax(0,1fr))}.cm-grid,.cm-2{grid-template-columns:1fr}}`;
document.head.appendChild(st);
