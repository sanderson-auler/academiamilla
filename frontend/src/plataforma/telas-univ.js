// Universidade 0.5.0 — catálogo, página do curso (vídeos com controle de conclusão, prova, certificado),
// Treinamentos da área, Meus certificados e Gestão de cursos (cadastro, áreas, vídeos, prova/gabarito, modelo de certificado, acompanhamento).
import { S, api, esc, ic, prog, head, toast, pontosToast, chamar, abrirModal, fecharModal, go, trilha, marcarAtivo, recarregarBase, dataHoraBR, dataBR, pode } from './nucleo.js';
import { sessao } from '../api.js';
import './univ.css';

const BASE = import.meta.env.VITE_API_URL || '/api';
const AREA = id => S.D.areas[id];
S.uv = S.uv || { aba: 'meus', filtro: '', cursoId: null, videoId: null, origem: null, ed: null, edAba: 'dados' };
const minutos = s => (s ? s < 60 ? `${Math.round(s)}s` : (s >= 3600 ? `${Math.floor(s / 3600)}h${String(Math.round((s % 3600) / 60)).padStart(2, '0')}` : `${Math.max(1, Math.round(s / 60))} min`) : '—');
const nota = v => (v == null ? '—' : Number(v).toLocaleString('pt-BR', { maximumFractionDigits: 1 }));
const gradCurso = c => AREA(c.areas?.[0])?.grad || 'linear-gradient(135deg,#0E4A5C,#1D4ED8)';
const situacao = c => (c.concluido_em || c.pct >= 100 ? ['green', 'Concluído ✓'] : c.pct > 0 || c.iniciado_em ? ['blue', `${c.pct}% concluído`] : ['gray', 'Não iniciado']);
const ehGestor = () => pode('cms', 2) || !!S.D.usuario.area_id;

function cardCurso(c, areaId) {
  const [cor, txt] = situacao(c);
  const det = [c.videos ? `${c.videos} ${c.videos === 1 ? 'vídeo' : 'vídeos'}` : `${c.aulas} ${c.aulas === 1 ? 'aula' : 'aulas'}`, c.duracao_seg ? minutos(c.duracao_seg) : c.duracao, c.perguntas && c.exige_prova ? 'prova' : ''].filter(Boolean).join(' · ');
  return `<div class="card course" onclick="uvAbrirCurso(${c.id},null,${areaId ? `'${areaId}'` : 'null'})"><div class="thumb" style="background:${gradCurso(c)}"><span class="badge">${esc(det)}</span><span style="font-weight:700;font-size:13px">${ic('cap')} Curso${c.certificado_id ? ' · 🎓' : ''}</span></div>
  <div class="b"><h4>${esc(c.titulo)}</h4><div class="mini" style="display:flex;justify-content:space-between;gap:6px"><span class="${cor === 'green' ? 'uv-ok' : ''}">${txt}</span>${c.melhor_nota != null ? `<span>nota ${nota(c.melhor_nota)}</span>` : ''}</div>${prog(c.pct, c.pct >= 100 ? 'bar-green' : '')}</div></div>`;
}

// ======================= UNIVERSIDADE (menu) =======================
S.telas.univ = async () => {
  const abas = [['meus', '🎓 Meus cursos'], ['cert', '📜 Meus certificados']].concat(ehGestor() ? [['gestao', '⚙️ Gestão de cursos']] : []);
  if (!abas.some(a => a[0] === S.uv.aba)) S.uv.aba = 'meus';
  let corpo = '';
  if (S.uv.aba === 'meus') corpo = await meusCursosHTML();
  else if (S.uv.aba === 'cert') corpo = await certificadosHTML();
  else corpo = await gestaoHTML();
  return `${head('Universidade Corporativa', 'Cursos por área com vídeos, prova e certificado · todo o percurso fica registrado', '')}
  <div class="subtabs" style="margin-bottom:16px">${abas.map(([k, t]) => `<button class="${S.uv.aba === k ? 'on' : ''}" onclick="uvAba('${k}')">${t}</button>`).join('')}</div>${corpo}`;
};
window.uvAba = k => { S.uv.aba = k; go('univ'); };

async function meusCursosHTML() {
  const l = await api('/univ/cursos');
  const areasComCurso = S.D.areaOrder.filter(id => l.some(c => c.areas.includes(id)));
  const f = S.uv.filtro && areasComCurso.includes(S.uv.filtro) ? S.uv.filtro : '';
  const lista = f ? l.filter(c => c.areas.includes(f)) : l;
  const andamento = lista.filter(c => c.pct > 0 && c.pct < 100).sort((a, b) => b.pct - a.pct);
  const novos = lista.filter(c => !c.pct && !c.concluido_em);
  const feitos = lista.filter(c => c.pct >= 100 || c.concluido_em);
  const hero = andamento[0] || novos[0];
  const bloco = (t, arr, vazio) => `<div class="sect-title" style="margin:6px 0 10px">${t} <span class="mini">(${arr.length})</span></div>${arr.length ? `<div class="grid cards-3" style="margin-bottom:20px">${arr.map(c => cardCurso(c)).join('')}</div>` : `<div class="card p mini" style="margin-bottom:20px">${vazio}</div>`}`;
  return `${hero ? `<div class="card p uv-hero"><div style="flex:1"><div class="uv-kick">${hero.pct > 0 ? 'Continue de onde parou' : 'Comece por aqui'}</div><div class="uv-hero-t">${esc(hero.titulo)}</div>
    <div style="font-size:13px;opacity:.9">${esc(hero.areas.map(a => AREA(a)?.nome).filter(Boolean).join(' · '))}</div><div style="max-width:360px;margin-top:10px">${prog(hero.pct, 'bar-red')}<div class="mini" style="color:#CDE0E7;margin-top:4px">${hero.pct}% concluído</div></div></div>
    <button class="btn" style="background:#fff;color:var(--petrol);border:0" onclick="uvAbrirCurso(${hero.id})">${hero.pct > 0 ? 'Continuar' : 'Iniciar'} ▶</button></div>` : ''}
  <div class="segmented" style="margin-bottom:16px;flex-wrap:wrap"><button class="${f ? '' : 'on'}" onclick="uvFiltro('')">Todas as áreas</button>${areasComCurso.map(id => `<button class="${f === id ? 'on' : ''}" onclick="uvFiltro('${id}')">${esc(AREA(id).nome)}</button>`).join('')}</div>
  ${bloco('Em andamento', andamento, 'Nenhum curso em andamento.')}${bloco('Disponíveis para você', novos, 'Você já começou todos os cursos disponíveis.')}${bloco('Concluídos', feitos, 'Conclua um curso para emitir o certificado.')}`;
}
window.uvFiltro = id => { S.uv.filtro = id; go('univ'); };

// ======================= CERTIFICADOS =======================
async function certificadosHTML() {
  const l = await api('/univ/certificados');
  if (!l.length) return '<div class="card p"><div class="vazio">Você ainda não tem certificados. Assista a todos os vídeos do curso (e seja aprovado na prova, quando houver) para emitir o seu.</div></div>';
  return `<div class="grid cards-3">${l.map(c => `<div class="card p uv-cert" onclick="uvVerCertificado(${c.id})"><div class="uv-cert-ico">🎓</div><div class="sect-title" style="margin-top:8px">${esc(c.titulo)}</div>
  <div class="mini">${esc(c.areas || '')}</div><div class="mini" style="margin-top:8px">Emitido em ${dataBR(c.emitido_em)}${c.nota != null ? ` · nota ${nota(c.nota)}` : ''}</div><div class="mini">Código <b>${esc(c.codigo)}</b></div>
  <button class="btn" style="margin-top:12px" onclick="event.stopPropagation();uvVerCertificado(${c.id})">Ver e baixar</button></div>`).join('')}</div>`;
}
window.meusCertificados = async () => {
  const l = await chamar(() => api('/univ/certificados'));
  abrirModal('Meus certificados', l.length ? l.map(c => `<div class="row-item" style="cursor:pointer" onclick="uvVerCertificado(${c.id})"><div class="ico" style="background:#E6F6EF">${ic('cap')}</div><div style="flex:1"><div class="ttl">${esc(c.titulo)}</div><div class="meta">Emitido em ${dataBR(c.emitido_em)}${c.nota != null ? ` · nota ${nota(c.nota)}` : ''} · código ${esc(c.codigo)}</div></div><span class="tag green">Ver certificado</span></div>`).join('')
    : '<div class="vazio">Você ainda não tem certificados. Assista a todos os vídeos do curso (e seja aprovado na prova, quando houver) para emitir o seu.</div>');
};

function carregarImg(src) { return new Promise((ok, erro) => { const i = new Image(); i.onload = () => ok(i); i.onerror = erro; i.src = src; }); }
// Desenha o certificado: modelo assinado enviado pela área (nome sobreposto) ou o modelo padrão da Academia.
async function desenharCertificado(cv, d, modelo) {
  const ctx = cv.getContext('2d');
  const cfg = d.cert_config || {};
  let W, H;
  if (modelo) {
    const img = await carregarImg(modelo);
    const k = Math.min(1, 2400 / img.naturalWidth);
    W = cv.width = Math.round(img.naturalWidth * k); H = cv.height = Math.round(img.naturalHeight * k);
    ctx.drawImage(img, 0, 0, W, H);
  } else {
    W = cv.width = 2000; H = cv.height = 1414;
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = '#0B3D4D'; ctx.lineWidth = 28; ctx.strokeRect(40, 40, W - 80, H - 80);
    ctx.strokeStyle = '#C8102E'; ctx.lineWidth = 4; ctx.strokeRect(80, 80, W - 160, H - 160);
    ctx.textAlign = 'center'; ctx.fillStyle = '#C8102E'; ctx.font = '700 40px Inter, Arial'; ctx.fillText('ACADEMIA MILLA 360 · GRUPO MILLA', W / 2, 250);
    ctx.fillStyle = '#0B3D4D'; ctx.font = '800 120px Georgia, serif'; ctx.fillText('Certificado', W / 2, 420);
    ctx.fillStyle = '#5B6B76'; ctx.font = '400 44px Inter, Arial'; ctx.fillText('Certificamos que', W / 2, 580);
    ctx.font = '400 32px Inter, Arial'; ctx.fillText('Universidade Corporativa · Academia Milla 360', W / 2, H - 200);
  }
  const txt = (t, c, peso, fam) => {
    if (c?.mostrar === false) return;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = c.cor || '#0B3D4D';
    let px = Math.round((c.tam || 4) / 100 * W);
    ctx.font = `${peso} ${px}px ${fam}`;
    while (ctx.measureText(t).width > W * 0.86 && px > 10) { px -= 2; ctx.font = `${peso} ${px}px ${fam}`; }
    ctx.fillText(t, (c.x ?? 50) / 100 * W, (c.y ?? 50) / 100 * H);
  };
  const carga = d.duracao_seg ? minutos(d.duracao_seg) : d.duracao;
  txt(d.nome, cfg.nome || { x: 50, y: 50, tam: 4.4 }, '700', 'Georgia, serif');
  txt(`concluiu o curso "${d.titulo}"${carga ? ` · carga horária ${carga}` : ''} · em ${dataBR(d.emitido_em)}${d.nota != null ? ` · nota ${nota(d.nota)}` : ''} · código ${d.codigo}`, cfg.info || { x: 50, y: 61, tam: 1.7 }, '400', 'Inter, Arial');
}
window.uvVerCertificado = async id => {
  const d = await chamar(() => api(`/univ/certificados/${id}`));
  const m = d.tem_modelo ? (await api(`/univ/cursos/${d.curso_id}/certificado-modelo`)).modelo : null;
  abrirModal(`Certificado · ${esc(d.titulo)}`, `<canvas id="uvCert" class="uv-canvas"></canvas>
  <div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap"><button class="btn red" onclick="uvBaixarCert('${esc(d.codigo)}')">⬇ Baixar PNG</button><button class="btn" onclick="uvImprimirCert()">🖨 Imprimir / PDF</button><button class="btn ghost" onclick="fecharModal()">Fechar</button>
  <span class="mini" style="margin-left:auto;align-self:center">Código de validação <b>${esc(d.codigo)}</b></span></div>`, true);
  await desenharCertificado(document.getElementById('uvCert'), d, m);
};
window.uvBaixarCert = cod => { const a = document.createElement('a'); a.download = `certificado-${cod}.png`; a.href = document.getElementById('uvCert').toDataURL('image/png'); a.click(); };
window.uvImprimirCert = () => {
  const url = document.getElementById('uvCert').toDataURL('image/png');
  const w = window.open('', '_blank'); if (!w) return toast('Libere pop-ups para imprimir.', 'erro');
  w.document.write(`<html><head><title>Certificado</title><style>@page{size:landscape;margin:0}body{margin:0}img{width:100%;display:block}</style></head><body><img src="${url}" onload="setTimeout(()=>print(),200)"></body></html>`); w.document.close();
};

// ======================= TREINAMENTOS DA ÁREA =======================
S.abasArea.treino = async (id, a) => {
  const d = await api(`/univ/area/${id}`);
  const vids = d.videos, feitos = vids.filter(v => v.concluido_em), pend = vids.filter(v => !v.concluido_em);
  const item = v => `<div class="vid" onclick="uvAbrirCurso(${v.curso_id},${v.id},'${id}')"><div class="pl" style="background:${v.concluido_em ? 'linear-gradient(135deg,#0E7C66,#16A34A)' : a.grad}">${v.concluido_em ? '✓' : ic('play')}</div>
    <div style="flex:1;min-width:0"><div class="ttl">${esc(v.titulo)}</div><div class="meta">${esc(v.curso)}${v.duracao_seg ? ' · ' + minutos(v.duracao_seg) : ''}</div></div>
    <span class="tag ${v.concluido_em ? 'green' : v.iniciado_em ? 'blue' : 'gray'}">${v.concluido_em ? 'Assistido ' + dataBR(v.concluido_em).slice(0, 5) : v.iniciado_em ? 'Em andamento' : 'A assistir'}</span></div>`;
  const gerir = ehGestor() && (pode_cms() || S.D.usuario.area_id === id);
  return `<div class="page-head" style="margin-bottom:14px"><div><h1 style="font-size:18px">Treinamentos · ${esc(a.nome)}</h1><p>Assista aos vídeos até o fim para concluir. Com prova, a aprovação também é exigida — o certificado sai na hora.</p></div>
  <div style="display:flex;gap:8px">${gerir ? `<button class="btn" onclick="S_uvGestao()">⚙️ Gerenciar cursos</button>` : ''}<button class="btn red" onclick="meusCertificados()">Meus certificados</button></div></div>
  ${d.cursos.length ? `<div class="grid cards-3" style="margin-bottom:20px">${d.cursos.map(c => cardCurso(c, id)).join('')}</div>` : '<div class="card p mini" style="margin-bottom:20px">Nenhum curso ligado a esta área ainda.</div>'}
  <div class="grid cards-2">
    <div class="card p"><div class="between"><div><div class="sect-title">Vídeos da área · em andamento</div><div class="sect-sub">O que falta assistir</div></div><span class="tag blue">${pend.length}</span></div>${pend.map(item).join('') || '<div class="vazio">Nenhum vídeo pendente. 👏</div>'}</div>
    <div class="card p"><div class="between"><div><div class="sect-title">Vídeos concluídos</div><div class="sect-sub">Assistidos até o fim</div></div><span class="tag green">${feitos.length}</span></div>${feitos.map(item).join('') || '<div class="vazio">Nenhum vídeo concluído ainda.</div>'}</div>
  </div>`;
};
const pode_cms = () => pode('cms', 2);
window.S_uvGestao = () => { S.uv.aba = 'gestao'; go('univ'); };
// Compatibilidade com chamadas antigas (painel inicial, busca).
window.openCourse = (areaId, idx) => { const c = AREA(areaId)?.cursos?.[idx]; if (c) window.uvAbrirCurso(c[3], null, areaId); };

// ======================= PÁGINA DO CURSO =======================
window.uvAbrirCurso = (cursoId, videoId, areaId) => {
  S.uv.cursoId = cursoId; S.uv.videoId = videoId || null;
  S.uv.origem = areaId ? { area: areaId } : (S.uv.origem?.area && S.cur.area === S.uv.origem.area && document.getElementById('areaBody') ? S.uv.origem : { univ: true });
  go('curso');
};
S.telas.curso = async () => {
  const c = await api(`/univ/cursos/${S.uv.cursoId}`);
  S.uv.c = c;
  const vs = c.videos_lista;
  let atual = vs.find(v => v.id === S.uv.videoId) || vs.find(v => !v.concluido_em) || vs[0];
  S.uv.videoId = atual?.id || null;
  const ok = vs.filter(v => v.concluido_em).length;
  const voltar = 'uvPararPlayer();' + (S.uv.origem?.area ? `openArea('${S.uv.origem.area}','treino')` : "go('univ')");
  return `<div class="page-head"><div><h1>${esc(c.titulo)}</h1><p>${esc(c.areas.map(a => a.nome).join(' · '))}${c.descricao ? ' — ' + esc(c.descricao) : ''}</p></div>
  <div style="display:flex;gap:8px"><button class="btn" onclick="${voltar}">← Voltar</button>${c.pode_gerir ? `<button class="btn" onclick="uvEditar(${c.id})">⚙️ Editar curso</button>` : ''}</div></div>
  <div class="uv-curso"><div>
    <div class="card uv-player" id="uvPlayer">${atual ? '' : '<div class="uv-vazio">Os vídeos deste curso ainda não foram publicados pela área.</div>'}</div>
    ${atual ? `<div class="card p" style="margin-top:12px"><div class="between"><div><div class="sect-title" id="uvVTit">${esc(atual.titulo)}</div><div class="mini" id="uvVStatus"></div></div><div id="uvVAcao"></div></div>${atual.descricao ? `<div class="mini" style="margin-top:8px">${esc(atual.descricao)}</div>` : ''}</div>` : ''}
  </div>
  <div class="uv-lado">
    <div class="card p"><div class="sect-title">Seu progresso</div><div style="margin:10px 0 6px">${prog(c.pct, c.pct >= 100 ? 'bar-green' : '')}</div>
      <div class="mini">${vs.length ? `${ok} de ${vs.length} vídeos assistidos` : `${c.aulas_feitas || 0} de ${c.aulas} aulas`} · ${c.pct}%</div>
      ${c.iniciado_em ? `<div class="mini">Início: ${dataHoraBR(c.iniciado_em)}</div>` : ''}${c.concluido_em ? `<div class="mini uv-ok">Concluído em ${dataHoraBR(c.concluido_em)}</div>` : ''}</div>
    <div class="card p"><div class="sect-title">Vídeos</div>${vs.map((v, i) => `<div class="uv-vi ${v.id === S.uv.videoId ? 'on' : ''}" onclick="uvTrocarVideo(${v.id})"><div class="uv-n ${v.concluido_em ? 'ok' : ''}">${v.concluido_em ? '✓' : i + 1}</div>
      <div style="flex:1;min-width:0"><div class="ttl">${esc(v.titulo)}</div><div class="meta">${v.duracao_seg ? minutos(v.duracao_seg) : ''}${v.concluido_em ? ' · assistido ' + dataHoraBR(v.concluido_em) : v.iniciado_em ? ' · em andamento' : ''}</div></div></div>`).join('') || '<div class="vazio">Sem vídeos.</div>'}</div>
    ${provaCardHTML(c, ok, vs.length)}
    ${certCardHTML(c, ok, vs.length)}
  </div></div>`;
};
S.depois.curso = () => {
  const c = S.uv.c; if (!c) return;
  const o = S.uv.origem?.area ? AREA(S.uv.origem.area) : null;
  trilha(`Academia Milla 360 · ${o ? `<a onclick="openArea('${S.uv.origem.area}','treino')">${esc(o.nome)}</a>` : `<a onclick="go('univ')">Universidade</a>`} · <b>${esc(c.titulo)}</b>`);
  marcarAtivo(o ? 'areas' : 'univ');
  const v = c.videos_lista.find(x => x.id === S.uv.videoId);
  if (v) montarPlayer(v);
};
window.uvTrocarVideo = id => { pararPlayer(); S.uv.videoId = id; go('curso'); };

function provaCardHTML(c, ok, n) {
  if (!c.perguntas || !c.exige_prova) return '';
  const aprov = c.tentativas.find(t => t.aprovado);
  const feitas = c.tentativas.filter(t => t.finalizado_em).length;
  const libera = (!n || ok >= n) && !aprov && feitas < c.tentativas_max;
  return `<div class="card p"><div class="between"><div class="sect-title">Prova</div><span class="tag ${aprov ? 'green' : 'gray'}">${aprov ? 'Aprovado' : `mín. ${c.nota_minima}`}</span></div>
  <div class="mini" style="margin:6px 0">${c.perguntas} perguntas de múltipla escolha · ${c.tentativas_max} tentativa(s)</div>
  ${c.tentativas.filter(t => t.finalizado_em).map(t => `<div class="mini">• ${dataHoraBR(t.iniciado_em)} → ${dataHoraBR(t.finalizado_em)} · ${t.acertos}/${t.total} · nota <b>${nota(t.nota)}</b> ${t.aprovado ? '<span class="uv-ok">aprovado</span>' : '<span style="color:#C8102E">reprovado</span>'}</div>`).join('')}
  ${aprov ? '' : libera ? `<button class="btn red" style="margin-top:10px;width:100%" onclick="uvIniciarProva(${c.id})">${feitas ? 'Refazer a prova' : 'Fazer a prova'}</button>`
    : `<div class="mini" style="margin-top:8px">${feitas >= c.tentativas_max ? 'Limite de tentativas atingido — fale com o responsável da área.' : `Liberada após assistir a todos os vídeos (${ok}/${n}).`}</div>`}</div>`;
}
function certCardHTML(c, ok, n) {
  if (c.certificado) return `<div class="card p uv-certok"><div class="sect-title">🎓 Certificado emitido</div><div class="mini">Em ${dataHoraBR(c.certificado.emitido_em)} · código ${esc(c.certificado.codigo)}</div><button class="btn red" style="margin-top:10px;width:100%" onclick="uvVerCertificado(${c.certificado.id})">Ver e baixar certificado</button></div>`;
  const req = [`${n ? `Assistir aos ${n} vídeos até o fim (${ok}/${n})` : 'Vídeos a publicar'}`].concat(c.exige_prova && c.perguntas ? [`Ser aprovado na prova (nota ≥ ${c.nota_minima})`] : []);
  return `<div class="card p"><div class="sect-title">Certificado</div><div class="mini" style="margin-top:6px">Para emitir:</div>${req.map(r => `<div class="mini">• ${esc(r)}</div>`).join('')}</div>`;
}

// ---------- player com controle de conclusão ----------
let P = null; // { v, tipo, iniciou, assistido, ultimo, timer, yt, intervalo }
function pararPlayer() {
  if (!P) return;
  const p = P; P = null;
  clearInterval(p.timer); clearInterval(p.intervalo); clearInterval(p.cont);
  try { enviarProgresso(false, p); } catch {}
  try { p.yt?.destroy(); } catch {}
}
const ytId = u => (u.match(/(?:youtu\.be\/|v=|embed\/|shorts\/)([\w-]{11})/) || [])[1];
const ehArquivoVideo = u => /\.(mp4|webm|mov|m4v)(\?|$)/i.test(u || '');
function statusVideo(t) { const el = document.getElementById('uvVStatus'); if (el) el.innerHTML = t; }
async function marcarInicio() {
  if (!P || P.iniciou) return; P.iniciou = true;
  api(`/univ/videos/${P.v.id}/inicio`, { metodo: 'POST' }).catch(() => {});
}
async function enviarProgresso(concluido, alvo) {
  const p = alvo || P;
  if (!p || p.fim) return;
  if (!alvo && !document.getElementById('uvPlayer')) { pararPlayer(); return; }
  const v = p.v, pos = p.pos(), dur = p.dur();
  if (!concluido && !p.iniciou) return;
  if (concluido) p.fim = true;
  const r = await api(`/univ/videos/${v.id}/progresso`, { metodo: 'POST', corpo: { posicao: Math.round(pos), duracao: dur ? Math.round(dur) : null, assistido: Math.round(p.assistido), concluido: !!concluido } }).catch(() => null);
  if (r?.concluido && !v.concluido_em) {
    v.concluido_em = new Date().toISOString();
    pontosToast(r, r.situacao?.concluiu ? 'Curso concluído! Certificado emitido 🎓' : 'Vídeo concluído ✓');
    recarregarBase().catch(() => {});
    const id = S.uv.videoId;
    setTimeout(() => { if (S.uv.videoId === id && document.getElementById('uvPlayer')) { pararPlayer(); S.uv.videoId = null; go('curso'); } }, 1200);
  }
}
function montarPlayer(v) {
  pararPlayer();
  const el = document.getElementById('uvPlayer');
  const p = P = { v, iniciou: !!v.iniciado_em, assistido: Number(v.assistido_seg) || 0, ultimo: null, pos: () => 0, dur: () => v.duracao_seg || 0 };
  const feito = !!v.concluido_em;
  statusVideo(feito ? `<span class="uv-ok">✓ Assistido em ${dataHoraBR(v.concluido_em)}</span>` : 'Assista até o fim para concluir o vídeo.');
  const yid = v.tipo === 'youtube' ? ytId(v.url || '') : null;
  if (v.tipo === 'arquivo' || ehArquivoVideo(v.url)) {
    el.innerHTML = '<video id="uvVideo" controls playsinline preload="metadata"></video>';
    const vid = document.getElementById('uvVideo');
    (v.tipo === 'arquivo' ? api(`/univ/videos/${v.id}/fonte`).then(r => r.url) : Promise.resolve(v.url)).then(u => {
      vid.src = u;
      vid.addEventListener('loadedmetadata', () => { if (v.posicao_seg && !feito && v.posicao_seg < vid.duration - 5) vid.currentTime = v.posicao_seg; }, { once: true });
    }).catch(e => { el.innerHTML = `<div class="uv-vazio">${esc(e.message)}</div>`; });
    p.pos = () => vid.currentTime || 0; p.dur = () => (isFinite(vid.duration) ? vid.duration : v.duracao_seg || 0);
    vid.addEventListener('play', marcarInicio);
    vid.addEventListener('timeupdate', () => { const t = vid.currentTime; if (p.ultimo != null && t > p.ultimo && t - p.ultimo < 1.5) p.assistido += t - p.ultimo; p.ultimo = t; });
    vid.addEventListener('seeking', () => { p.ultimo = vid.currentTime; });
    vid.addEventListener('ended', () => enviarProgresso(true));
    vid.addEventListener('pause', () => enviarProgresso(false));
    p.timer = setInterval(() => { if (!vid.paused) enviarProgresso(false); }, 15000);
  } else if (yid) {
    el.innerHTML = '<div id="uvYT"></div>';
    const criar = () => {
      if (P !== p) return;
      p.yt = new window.YT.Player('uvYT', { videoId: yid, playerVars: { rel: 0, modestbranding: 1, start: !feito && v.posicao_seg ? Math.round(v.posicao_seg) : 0 },
        events: { onStateChange: e => {
          if (e.data === 1) { marcarInicio(); clearInterval(p.intervalo); p.intervalo = setInterval(() => { p.assistido += 1; }, 1000); }
          else clearInterval(p.intervalo);
          if (e.data === 0) enviarProgresso(true); else if (e.data === 2) enviarProgresso(false);
        } } });
      p.pos = () => { try { return p.yt.getCurrentTime() || 0; } catch { return 0; } };
      p.dur = () => { try { return p.yt.getDuration() || v.duracao_seg || 0; } catch { return v.duracao_seg || 0; } };
      p.timer = setInterval(() => enviarProgresso(false), 15000);
    };
    if (window.YT?.Player) criar();
    else {
      const ant = window.onYouTubeIframeAPIReady; window.onYouTubeIframeAPIReady = () => { ant?.(); criar(); };
      if (!document.getElementById('ytApi')) { const s = document.createElement('script'); s.id = 'ytApi'; s.src = 'https://www.youtube.com/iframe_api'; document.head.appendChild(s); }
    }
  } else {
    // Vimeo, Drive, Stream…: o fim do vídeo não é detectável; confirmação liberada após o tempo do vídeo.
    el.innerHTML = `<iframe src="${esc(v.url)}" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen></iframe>`;
    marcarInicio();
    if (!feito) {
      const minimo = Math.max(30, Math.round((v.duracao_seg || 60) * 0.9));
      let resta = minimo - Math.round(p.assistido);
      const acao = document.getElementById('uvVAcao');
      const pinta = () => { if (acao) acao.innerHTML = resta > 0 ? `<button class="btn" disabled>Concluir em ${resta >= 60 ? Math.ceil(resta / 60) + ' min' : resta + 's'}</button>` : '<button class="btn red" onclick="uvConfirmarVideo()">✓ Assisti até o fim</button>'; };
      pinta();
      p.cont = setInterval(() => { if (document.hidden) return; p.assistido += 1; resta -= 1; if (resta <= 0) { clearInterval(p.cont); } pinta(); }, 1000);
      p.timer = setInterval(() => enviarProgresso(false), 20000);
    }
  }
}
window.uvConfirmarVideo = () => enviarProgresso(true);
window.uvPararPlayer = () => pararPlayer();
window.addEventListener('beforeunload', () => { if (P) try { enviarProgresso(false); } catch {} });
// Sai da página do curso: grava a posição.
document.addEventListener('click', e => { if (P && e.target.closest('.nav, .sidebar, #crumb a')) pararPlayer(); }, true);

// ---------- prova ----------
window.uvIniciarProva = async id => {
  const p = await chamar(() => api(`/univ/cursos/${id}/prova/iniciar`, { metodo: 'POST' }));
  pararPlayer();
  S.uv.prova = { ...p, resp: Array(p.perguntas.length).fill(null), curso: id };
  abrirModal(`Prova · ${esc(S.uv.c?.titulo || '')}`, `<div class="mini" style="margin-bottom:12px">Tentativa ${p.tentativa} de ${p.tentativas_max} · nota mínima ${p.nota_minima} · iniciada em ${dataHoraBR(p.iniciado_em)}</div>
  ${p.perguntas.map((q, i) => `<div class="uv-q"><div class="uv-qt">${i + 1}. ${esc(q.pergunta)}</div>${q.opcoes.map((o, j) => `<label class="uv-op"><input type="radio" name="uvq${i}" onchange="uvResp(${i},${j})"> <span>${String.fromCharCode(65 + j)}) ${esc(o)}</span></label>`).join('')}</div>`).join('')}
  <div style="display:flex;gap:8px;align-items:center;margin-top:14px"><button class="btn red" onclick="uvFinalizarProva()">Finalizar e corrigir</button><span class="mini" id="uvFalta">${p.perguntas.length} sem resposta</span></div>`, true);
};
window.uvResp = (i, j) => { S.uv.prova.resp[i] = j; const f = S.uv.prova.resp.filter(x => x === null).length; document.getElementById('uvFalta').textContent = f ? `${f} sem resposta` : 'Tudo respondido ✓'; };
window.uvFinalizarProva = async () => {
  const p = S.uv.prova;
  if (p.resp.some(x => x === null)) return toast('Responda todas as perguntas antes de finalizar.', 'erro');
  const r = await chamar(() => api(`/univ/tentativas/${p.tentativa_id}/finalizar`, { metodo: 'POST', corpo: { respostas: p.resp } }));
  abrirModal('Resultado da prova', `<div style="text-align:center;padding:10px 0"><div style="font-size:46px">${r.aprovado ? '🎉' : '📘'}</div><div class="uv-hero-t" style="color:var(--petrol)">Nota ${nota(r.nota)}</div>
  <div class="mini">${r.acertos} de ${r.total} acertos · mínimo ${r.nota_minima}</div><div class="sect-title" style="margin-top:10px;color:${r.aprovado ? '#0E7C66' : '#C8102E'}">${r.aprovado ? 'Aprovado!' : 'Não foi desta vez — revise os vídeos e tente de novo.'}</div>
  ${r.situacao?.concluiu ? '<div class="mini" style="margin-top:6px">Curso concluído e certificado emitido 🎓</div>' : ''}</div>
  <div style="display:flex;gap:8px;justify-content:center;margin-top:10px"><button class="btn red" onclick="fecharModal();go('curso')">Voltar ao curso</button></div>`);
  if (r.pontosGanhos) pontosToast(r, 'Curso concluído!');
  recarregarBase().catch(() => {});
};

// ======================= GESTÃO DE CURSOS =======================
async function gestaoHTML() {
  const d = await api('/univ/gestao/cursos');
  return `<div class="card p"><div class="between" style="margin-bottom:10px"><div><div class="sect-title">Cursos cadastrados</div><div class="sect-sub">${d.gestor_geral ? 'Todos os cursos' : 'Cursos ligados à sua área'} · clique para editar vídeos, prova, certificado e acompanhar os alunos</div></div><button class="btn red" onclick="uvNovoCurso()">+ Novo curso</button></div>
  ${d.r2 ? '' : '<div class="mini uv-aviso">Armazenamento de arquivos (R2) não configurado neste ambiente: cadastre os vídeos por link (YouTube, Vimeo…).</div>'}
  <div style="overflow-x:auto"><table><thead><tr><th>Curso</th><th>Áreas</th><th>Vídeos</th><th>Prova</th><th>Certificado</th><th>Alunos</th><th>Concluíram</th><th>Status</th></tr></thead><tbody>
  ${d.cursos.map(c => `<tr style="cursor:pointer" onclick="uvEditar(${c.id})"><td><b>${esc(c.titulo)}</b>${c.duracao ? `<div class="mini">${esc(c.duracao)}</div>` : ''}</td><td>${c.areas.map(a => `<span class="tag gray" style="margin:1px">${esc(AREA(a)?.nome || a)}</span>`).join('')}</td>
  <td>${c.videos}</td><td>${c.exige_prova ? `${c.perguntas} perg. · mín ${c.nota_minima}` : '—'}</td><td>${c.tem_modelo ? '<span class="tag green">Modelo próprio</span>' : '<span class="tag gray">Padrão</span>'}</td><td>${c.alunos}</td><td>${c.concluintes}</td><td><span class="tag ${c.ativo ? 'green' : 'gray'}">${c.ativo ? 'Ativo' : 'Inativo'}</span></td></tr>`).join('')}
  </tbody></table></div></div>`;
}
const checkAreas = (sel, travada) => `<div class="uv-areas">${S.D.areaOrder.map(id => `<label class="uv-chk"><input type="checkbox" name="uvArea" value="${id}" ${sel.includes(id) ? 'checked' : ''} ${travada && travada !== id && !pode_cms() ? 'disabled' : ''}${travada === id && !pode_cms() ? ' checked disabled' : ''}> ${esc(AREA(id).nome)}</label>`).join('')}</div>`;
const areasMarcadas = () => [...document.querySelectorAll('input[name=uvArea]:checked')].map(x => x.value);
window.uvNovoCurso = () => {
  const minha = S.D.usuario.area_id;
  abrirModal('Novo curso', `<label class="lbl">Título</label><input id="ncT" class="inp" placeholder="Ex.: Atendimento que vende">
  <label class="lbl">Descrição</label><textarea id="ncD" class="inp" rows="2"></textarea><label class="lbl">Carga horária</label><input id="ncH" class="inp" placeholder="Ex.: 2h">
  <label class="lbl">Áreas (o curso aparece nos Treinamentos de cada área marcada)</label>${checkAreas(minha && !pode_cms() ? [minha] : [], pode_cms() ? null : minha)}
  <div style="display:flex;gap:8px;margin-top:14px"><button class="btn red" onclick="uvCriarCurso()">Criar e continuar</button><button class="btn ghost" onclick="fecharModal()">Cancelar</button></div>`);
};
window.uvCriarCurso = async () => {
  const r = await chamar(() => api('/univ/gestao/cursos', { metodo: 'POST', corpo: { titulo: document.getElementById('ncT').value, descricao: document.getElementById('ncD').value, duracao: document.getElementById('ncH').value, areas: areasMarcadas() } }));
  fecharModal(); toast('Curso criado. Agora cadastre os vídeos.', 'ok'); window.uvEditar(r.id, 'videos');
};
window.uvEditar = (id, aba) => { pararPlayer(); S.uv.edId = id; S.uv.edAba = aba || 'dados'; go('cursoEd'); };

const ED_ABAS = [['dados', 'Dados & áreas'], ['videos', 'Vídeos'], ['prova', 'Prova & gabarito'], ['cert', 'Certificado'], ['acomp', 'Acompanhamento']];
S.telas.cursoEd = async () => {
  const c = await api(`/univ/gestao/cursos/${S.uv.edId}`);
  S.uv.ed = c; S.uv.provaDraft = JSON.parse(JSON.stringify(c.prova || []));
  S.uv.certDraft = { config: JSON.parse(JSON.stringify(c.cert_config)), modelo: null, novo: null };
  return `<div class="page-head"><div><h1>${esc(c.titulo)}</h1><p>Gestão do curso · ${c.videos.length} vídeos · ${c.exige_prova ? `prova com ${c.prova.length} perguntas` : 'sem prova'} · ${c.ativo ? 'ativo' : 'inativo'}${c.atualizado_por ? ` · alterado por ${esc(c.atualizado_por)} em ${dataHoraBR(c.atualizado_em)}` : ''}</p></div>
  <div style="display:flex;gap:8px"><button class="btn" onclick="uvAba('gestao')">← Cursos</button><button class="btn" onclick="uvAbrirCurso(${c.id})">👁 Ver como colaborador</button></div></div>
  <div class="subtabs" style="margin-bottom:14px">${ED_ABAS.map(([k, t]) => `<button class="${S.uv.edAba === k ? 'on' : ''}" onclick="uvEdAba('${k}')">${t}</button>`).join('')}</div><div id="uvEdCorpo"></div>`;
};
S.depois.cursoEd = () => {
  trilha(`Academia Milla 360 · <a onclick="uvAba('gestao')">Universidade · Gestão</a> · <b>${esc(S.uv.ed?.title || S.uv.ed?.titulo || '')}</b>`);
  marcarAtivo('univ'); window.uvEdAba(S.uv.edAba || 'dados', true);
};
window.uvEdAba = async (k, sem) => {
  if (!sem && S.uv.edAba === 'prova' && k !== 'prova') lerProva();
  S.uv.edAba = k;
  document.querySelectorAll('.subtabs button').forEach((b, i) => b.classList.toggle('on', ED_ABAS[i]?.[0] === k));
  const el = document.getElementById('uvEdCorpo'); if (!el) return;
  el.innerHTML = '<div class="carregando">Carregando…</div>';
  try { el.innerHTML = await ED[k](S.uv.ed); if (k === 'cert') previewCert(); } catch (e) { el.innerHTML = `<div class="card p">${esc(e.message)}</div>`; }
};
const recarregarEd = async aba => { S.uv.edAba = aba; await go('cursoEd'); };

const ED = {
  dados: c => `<div class="card p" style="max-width:820px"><label class="lbl">Título</label><input id="edT" class="inp" value="${esc(c.titulo)}">
    <label class="lbl">Descrição</label><textarea id="edD" class="inp" rows="3">${esc(c.descricao || '')}</textarea>
    <div class="grid cards-2"><div><label class="lbl">Carga horária (texto)</label><input id="edH" class="inp" value="${esc(c.duracao || '')}" placeholder="Ex.: 2h"></div>
    <div><label class="lbl">Situação</label><select id="edA" class="inp"><option value="1" ${c.ativo ? 'selected' : ''}>Ativo — visível para os colaboradores</option><option value="0" ${c.ativo ? '' : 'selected'}>Inativo — oculto</option></select></div></div>
    <label class="lbl">Áreas ligadas (o mesmo curso pode estar em várias áreas)</label>${checkAreas(c.areas, pode_cms() ? null : S.D.usuario.area_id)}
    <button class="btn red" style="margin-top:14px" onclick="uvSalvarDados()">💾 Salvar</button></div>`,
  videos: c => `<div class="grid cards-2 uv-ed2"><div class="card p"><div class="sect-title">Vídeos do curso</div><div class="sect-sub">A ordem abaixo é a ordem da trilha</div>
    ${c.videos.map((v, i) => `<div class="uv-vrow"><div class="uv-n">${i + 1}</div><div style="flex:1;min-width:0"><input class="inp uv-vt" value="${esc(v.titulo)}" onchange="uvRenVideo(${v.id},this.value)">
      <div class="mini">${v.tipo === 'arquivo' ? `📁 arquivo${v.tamanho ? ' · ' + (v.tamanho / 1048576).toFixed(0) + ' MB' : ''}` : v.tipo === 'youtube' ? '▶ YouTube' : '🔗 link'} · ${v.duracao_seg ? minutos(v.duracao_seg) : 'duração detectada no 1º play'}</div></div>
      <button class="btn ghost sm" title="Subir" onclick="uvMoverVideo(${v.id},'cima')" ${i ? '' : 'disabled'}>↑</button><button class="btn ghost sm" title="Descer" onclick="uvMoverVideo(${v.id},'baixo')" ${i < c.videos.length - 1 ? '' : 'disabled'}>↓</button>
      <button class="btn ghost sm" id="del${v.id}" onclick="uvExcluirVideo(${v.id})">🗑</button></div>`).join('') || '<div class="vazio">Nenhum vídeo ainda. Adicione ao lado.</div>'}</div>
    <div><div class="card p"><div class="sect-title">Adicionar por link</div><div class="sect-sub">YouTube (conclusão automática ao fim), MP4 público, Vimeo, Drive…</div>
      <label class="lbl">Título</label><input id="vlT" class="inp"><label class="lbl">Link</label><input id="vlU" class="inp" placeholder="https://www.youtube.com/watch?v=…">
      <label class="lbl">Duração (min) — usada quando o player não informa</label><input id="vlM" class="inp" type="number" min="0" step="0.5">
      <button class="btn red" style="margin-top:10px" onclick="uvAddLink()">+ Adicionar vídeo</button></div>
    <div class="card p" style="margin-top:12px"><div class="sect-title">Enviar arquivo de vídeo</div><div class="sect-sub">MP4/WEBM/MOV até 1 GB · guardado no armazenamento privado (R2)</div>
      ${c.r2 ? `<label class="lbl">Título</label><input id="vaT" class="inp"><input id="vaF" type="file" accept="video/mp4,video/webm,video/quicktime" class="inp" style="margin-top:8px">
      <div class="progress" style="margin-top:10px;display:none" id="vaBar"><i style="width:0%"></i></div><div class="mini" id="vaMsg"></div>
      <button class="btn red" style="margin-top:10px" id="vaBtn" onclick="uvEnviarVideo()">⬆ Enviar vídeo</button>` : '<div class="mini uv-aviso">O armazenamento R2 não está configurado neste servidor. Use a opção de link.</div>'}</div></div></div>`,
  prova: c => provaEdHTML(c),
  cert: c => `<div class="uv-certed"><div class="card p"><div class="sect-title">Modelo do certificado</div><div class="sect-sub">Envie a arte já assinada (PNG ou JPG, horizontal, em alta resolução). O nome do colaborador é escrito por cima, na posição definida abaixo.</div>
    <input id="ceF" type="file" accept="image/png,image/jpeg" class="inp" onchange="uvCertArquivo(this)"><div class="mini" style="margin:4px 0 10px">Tem o modelo em PDF? Exporte a página como imagem PNG (300 dpi) antes de enviar.</div>
    ${['nome', 'info'].map(k => { const g = S.uv.certDraft.config[k] || {}; return `<div class="uv-pos"><div class="sect-title" style="font-size:13px">${k === 'nome' ? 'Nome do colaborador' : 'Linha de informações (curso, carga, data, nota, código)'}</div>
      <div class="uv-pos-g">${[['x', 'Horizontal %', 0, 100, 0.5], ['y', 'Vertical %', 0, 100, 0.5], ['tam', 'Tamanho', 0.5, 12, 0.1]].map(([p, t, mi, ma, st]) => `<label>${t}<input type="range" min="${mi}" max="${ma}" step="${st}" value="${g[p]}" oninput="uvCertCfg('${k}','${p}',this.value)"></label>`).join('')}
      <label>Cor<input type="color" value="${g.cor || '#0B3D4D'}" oninput="uvCertCfg('${k}','cor',this.value)"></label>${k === 'info' ? `<label class="uv-chk"><input type="checkbox" ${g.mostrar === false ? '' : 'checked'} onchange="uvCertCfg('info','mostrar',this.checked)"> mostrar</label>` : ''}</div></div>`; }).join('')}
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px"><button class="btn red" onclick="uvSalvarCert()">💾 Salvar certificado</button>${c.tem_modelo ? '<button class="btn ghost" onclick="uvRemoverModelo()">Usar o modelo padrão</button>' : ''}</div></div>
    <div class="card p"><div class="sect-title">Pré-visualização</div><div class="sect-sub">${c.tem_modelo ? 'Modelo próprio do curso' : 'Modelo padrão da Academia (envie o seu para substituir)'} · nome de exemplo</div><canvas id="ceCv" class="uv-canvas"></canvas></div></div>`,
  acomp: async c => {
    const d = await api(`/univ/gestao/cursos/${c.id}/acompanhamento`);
    if (!d.alunos.length) return '<div class="card p"><div class="vazio">Nenhum colaborador iniciou este curso ainda.</div></div>';
    const concl = d.alunos.filter(a => a.concluido_em).length;
    return `<div class="grid cards-3" style="margin-bottom:14px"><div class="card p"><div class="mini">Alunos</div><div class="uv-num">${d.alunos.length}</div></div><div class="card p"><div class="mini">Concluíram</div><div class="uv-num">${concl}</div></div><div class="card p"><div class="mini">Certificados emitidos</div><div class="uv-num">${d.alunos.filter(a => a.codigo).length}</div></div></div>
    <div class="card p"><div style="overflow-x:auto"><table><thead><tr><th>Colaborador</th><th>Início do curso</th><th>Vídeos</th><th>1º vídeo</th><th>Último vídeo concluído</th><th>Prova</th><th>Conclusão</th><th>Certificado</th></tr></thead><tbody>
    ${d.alunos.map(a => `<tr style="cursor:pointer" onclick="uvAluno(${c.id},${a.id},${esc(JSON.stringify(a.nome))})"><td><b>${esc(a.nome)}</b><div class="mini">${esc(a.area || a.email)}</div></td><td>${dataHoraBR(a.iniciado_em)}</td><td>${a.videos_ok}/${d.videos}</td><td>${dataHoraBR(a.primeiro_video)}</td><td>${dataHoraBR(a.ultimo_video)}</td>
    <td>${a.tentativas ? `${a.tentativas}× · melhor ${nota(a.melhor_nota)} ${a.aprovado ? '<span class="tag green">aprov.</span>' : '<span class="tag red">reprov.</span>'}` : '—'}</td><td>${a.concluido_em ? dataHoraBR(a.concluido_em) : '<span class="tag blue">em curso</span>'}</td>
    <td>${a.certificado_id ? `<button class="linkbtn" onclick="event.stopPropagation();uvVerCertificado(${a.certificado_id})">${esc(a.codigo)}</button>` : '—'}</td></tr>`).join('')}</tbody></table></div><div class="mini" style="margin-top:8px">Clique no colaborador para ver o percurso completo (cada vídeo e cada tentativa de prova).</div></div>`;
  },
};

window.uvSalvarDados = async () => {
  await chamar(() => api(`/univ/gestao/cursos/${S.uv.edId}`, { metodo: 'PUT', corpo: { titulo: document.getElementById('edT').value, descricao: document.getElementById('edD').value, duracao: document.getElementById('edH').value, ativo: document.getElementById('edA').value === '1', areas: areasMarcadas() } }));
  toast('Curso salvo.', 'ok'); recarregarBase().catch(() => {}); recarregarEd('dados');
};
window.uvAddLink = async () => {
  await chamar(() => api(`/univ/gestao/cursos/${S.uv.edId}/videos`, { metodo: 'POST', corpo: { titulo: document.getElementById('vlT').value, url: document.getElementById('vlU').value.trim(), duracao_min: document.getElementById('vlM').value } }));
  toast('Vídeo adicionado.', 'ok'); recarregarEd('videos');
};
window.uvRenVideo = async (id, t) => { await chamar(() => api(`/univ/gestao/videos/${id}`, { metodo: 'PATCH', corpo: { titulo: t } })); toast('Título atualizado.', 'ok'); };
window.uvMoverVideo = async (id, d) => { await chamar(() => api(`/univ/gestao/videos/${id}`, { metodo: 'PATCH', corpo: { mover: d } })); recarregarEd('videos'); };
window.uvExcluirVideo = async id => {
  const b = document.getElementById(`del${id}`);
  if (!b.dataset.conf) { b.dataset.conf = 1; b.textContent = 'Excluir?'; b.classList.add('red'); setTimeout(() => { if (b.isConnected) { delete b.dataset.conf; b.textContent = '🗑'; b.classList.remove('red'); } }, 4000); return; }
  await chamar(() => api(`/univ/gestao/videos/${id}`, { metodo: 'DELETE' })); toast('Vídeo removido.', 'ok'); recarregarEd('videos');
};
function duracaoArquivo(f) {
  return new Promise(ok => { const v = document.createElement('video'); v.preload = 'metadata'; const u = URL.createObjectURL(f); v.onloadedmetadata = () => { URL.revokeObjectURL(u); ok(isFinite(v.duration) ? Math.round(v.duration) : 0); }; v.onerror = () => ok(0); v.src = u; });
}
window.uvEnviarVideo = async () => {
  const f = document.getElementById('vaF').files[0], t = document.getElementById('vaT').value.trim() || f?.name?.replace(/\.\w+$/, '');
  if (!f) return toast('Escolha o arquivo de vídeo.', 'erro');
  if (f.size > 1024 * 1024 * 1024) return toast('Vídeo maior que 1 GB. Comprima ou use um link do YouTube.', 'erro');
  const dur = await duracaoArquivo(f);
  const bar = document.getElementById('vaBar'), msg = document.getElementById('vaMsg'), btn = document.getElementById('vaBtn');
  bar.style.display = ''; btn.disabled = true;
  const x = new XMLHttpRequest();
  x.open('POST', `${BASE}/univ/gestao/cursos/${S.uv.edId}/videos/arquivo?titulo=${encodeURIComponent(t)}&nome=${encodeURIComponent(f.name)}&duracao=${dur}`);
  x.setRequestHeader('Content-Type', f.type || 'video/mp4');
  const tk = sessao.obter()?.token; if (tk) x.setRequestHeader('Authorization', `Bearer ${tk}`);
  x.upload.onprogress = e => { if (e.lengthComputable) { const p = Math.round(e.loaded / e.total * 100); bar.firstElementChild.style.width = p + '%'; msg.textContent = p < 100 ? `Enviando… ${p}% de ${(f.size / 1048576).toFixed(0)} MB` : 'Gravando no armazenamento…'; } };
  x.onload = () => { let r = {}; try { r = JSON.parse(x.responseText); } catch {} btn.disabled = false; if (x.status >= 300) { msg.textContent = ''; bar.style.display = 'none'; return toast(r.erro || 'Falha no envio.', 'erro'); } toast('Vídeo enviado.', 'ok'); recarregarEd('videos'); };
  x.onerror = () => { btn.disabled = false; toast('Conexão interrompida durante o envio.', 'erro'); };
  x.send(f);
};

// ---------- prova & gabarito ----------
function provaEdHTML(c) {
  const q = S.uv.provaDraft;
  return `<div class="card p" style="margin-bottom:12px"><div class="grid cards-3"><label class="uv-chk" style="align-self:end"><input type="checkbox" id="pvE" ${c.exige_prova ? 'checked' : ''}> Exigir prova para o certificado</label>
    <div><label class="lbl">Nota mínima (0–100)</label><input id="pvN" class="inp" type="number" min="0" max="100" value="${c.nota_minima}"></div><div><label class="lbl">Tentativas permitidas</label><input id="pvT" class="inp" type="number" min="1" max="20" value="${c.tentativas_max}"></div></div>
    <div class="mini" style="margin-top:6px">A nota é a % de acertos. A prova só é liberada depois que o colaborador assiste a todos os vídeos. O gabarito nunca é enviado ao navegador do aluno.</div></div>
  <div id="pvLista">${q.map((x, i) => `<div class="card p uv-qed"><div class="between"><b>Pergunta ${i + 1}</b><button class="btn ghost sm" onclick="uvPvDel(${i})">🗑 Remover</button></div>
    <textarea class="inp pv-p" rows="2" placeholder="Enunciado">${esc(x.pergunta)}</textarea>
    ${x.opcoes.map((o, j) => `<div class="uv-opd"><input type="radio" name="pvc${i}" value="${j}" ${Number(x.correta) === j ? 'checked' : ''} title="Alternativa correta (gabarito)"><span>${String.fromCharCode(65 + j)})</span><input class="inp pv-o" value="${esc(o)}" placeholder="Alternativa"><button class="btn ghost sm" onclick="uvPvOp(${i},${j})" ${x.opcoes.length > 2 ? '' : 'disabled'}>✕</button></div>`).join('')}
    ${x.opcoes.length < 6 ? `<button class="linkbtn" onclick="uvPvOp(${i},-1)">+ alternativa</button>` : ''}<div class="mini">Marque o círculo da alternativa correta (gabarito).</div></div>`).join('')}</div>
  <div style="display:flex;gap:8px;margin-top:4px"><button class="btn" onclick="uvPvAdd()">+ Pergunta</button><button class="btn red" onclick="uvSalvarProva()">💾 Salvar prova e gabarito</button></div>`;
}
function lerProva() {
  const el = document.querySelectorAll('.uv-qed'); if (!el.length && !document.getElementById('pvLista')) return;
  S.uv.provaDraft = [...el].map((b, i) => ({ pergunta: b.querySelector('.pv-p').value, opcoes: [...b.querySelectorAll('.pv-o')].map(x => x.value), correta: Number(b.querySelector(`input[name=pvc${i}]:checked`)?.value ?? -1) }));
  if (document.getElementById('pvE')) S.uv.provaCfg = { exige_prova: document.getElementById('pvE').checked, nota_minima: document.getElementById('pvN').value, tentativas_max: document.getElementById('pvT').value };
}
const repintaProva = () => { const cfg = S.uv.provaCfg; const c = { ...S.uv.ed, ...(cfg ? { exige_prova: cfg.exige_prova, nota_minima: cfg.nota_minima, tentativas_max: cfg.tentativas_max } : {}) }; document.getElementById('uvEdCorpo').innerHTML = provaEdHTML(c); };
window.uvPvAdd = () => { lerProva(); S.uv.provaDraft.push({ pergunta: '', opcoes: ['', '', '', ''], correta: -1 }); repintaProva(); };
window.uvPvDel = i => { lerProva(); S.uv.provaDraft.splice(i, 1); repintaProva(); };
window.uvPvOp = (i, j) => { lerProva(); const q = S.uv.provaDraft[i]; if (j < 0) q.opcoes.push(''); else { q.opcoes.splice(j, 1); if (q.correta === j) q.correta = -1; else if (q.correta > j) q.correta -= 1; } repintaProva(); };
window.uvSalvarProva = async () => {
  lerProva();
  const cfg = S.uv.provaCfg || {};
  const r = await chamar(() => api(`/univ/gestao/cursos/${S.uv.edId}/prova`, { metodo: 'PUT', corpo: { ...cfg, perguntas: S.uv.provaDraft } }));
  toast(r.exige_prova ? `Prova salva · ${r.perguntas} perguntas` : 'Salvo · curso sem prova obrigatória', 'ok'); S.uv.provaCfg = null; recarregarEd('prova');
};

// ---------- certificado (modelo) ----------
async function previewCert() {
  const cv = document.getElementById('ceCv'); if (!cv) return;
  const dr = S.uv.certDraft;
  if (dr.modelo === null && S.uv.ed.tem_modelo && !dr.carregado) { dr.carregado = true; dr.modelo = (await api(`/univ/cursos/${S.uv.ed.id}/certificado-modelo`)).modelo; }
  await desenharCertificado(cv, { nome: 'Nome do Colaborador', titulo: S.uv.ed.titulo, duracao: S.uv.ed.duracao, duracao_seg: S.uv.ed.videos.reduce((s, v) => s + (v.duracao_seg || 0), 0), emitido_em: new Date().toISOString(), nota: S.uv.ed.exige_prova ? 90 : null, codigo: 'A1B2C3D4E5', cert_config: dr.config }, dr.novo?.url || dr.modelo);
}
let tPrev = null;
window.uvCertCfg = (k, p, v) => { const g = S.uv.certDraft.config[k] = S.uv.certDraft.config[k] || {}; g[p] = p === 'cor' || p === 'mostrar' ? v : Number(v); clearTimeout(tPrev); tPrev = setTimeout(previewCert, 60); };
window.uvCertArquivo = inp => {
  const f = inp.files[0]; if (!f) return;
  if (!/^image\/(png|jpeg)$/.test(f.type)) { inp.value = ''; return toast('Envie PNG ou JPG (exporte o PDF assinado como imagem).', 'erro'); }
  if (f.size > 8 * 1024 * 1024) { inp.value = ''; return toast('Imagem maior que 8 MB.', 'erro'); }
  const rd = new FileReader(); rd.onload = () => { S.uv.certDraft.novo = { url: rd.result, tipo: f.type }; previewCert(); }; rd.readAsDataURL(f);
};
window.uvSalvarCert = async () => {
  const dr = S.uv.certDraft;
  await chamar(() => api(`/univ/gestao/cursos/${S.uv.edId}/certificado`, { metodo: 'PUT', corpo: { config: dr.config, ...(dr.novo ? { base64: dr.novo.url.split(',')[1], tipo: dr.novo.tipo } : {}) } }));
  toast('Certificado salvo.', 'ok'); recarregarEd('cert');
};
window.uvRemoverModelo = async () => { await chamar(() => api(`/univ/gestao/cursos/${S.uv.edId}/certificado`, { metodo: 'PUT', corpo: { remover: true, config: S.uv.certDraft.config } })); toast('Voltou ao modelo padrão.', 'ok'); recarregarEd('cert'); };

// ---------- percurso de um aluno ----------
window.uvAluno = async (cid, uid, nome) => {
  const d = await chamar(() => api(`/univ/gestao/cursos/${cid}/aluno/${uid}`));
  abrirModal(`Percurso · ${esc(nome)}`, `<div class="sect-title" style="font-size:13px">Vídeos</div><table><thead><tr><th>Vídeo</th><th>Começou</th><th>Terminou</th><th>Tempo assistido</th></tr></thead><tbody>
  ${d.videos.map(v => `<tr><td>${esc(v.titulo)}</td><td>${dataHoraBR(v.iniciado_em)}</td><td>${v.concluido_em ? dataHoraBR(v.concluido_em) : '—'}</td><td>${v.assistido_seg ? minutos(v.assistido_seg) : '—'}${v.duracao_seg ? ' / ' + minutos(v.duracao_seg) : ''}</td></tr>`).join('')}</tbody></table>
  <div class="sect-title" style="font-size:13px;margin-top:14px">Prova</div>${d.tentativas.length ? `<table><thead><tr><th>#</th><th>Começou</th><th>Finalizou</th><th>Acertos</th><th>Nota</th><th>Resultado</th></tr></thead><tbody>
  ${d.tentativas.map((t, i) => `<tr><td>${i + 1}</td><td>${dataHoraBR(t.iniciado_em)}</td><td>${dataHoraBR(t.finalizado_em)}</td><td>${t.finalizado_em ? `${t.acertos}/${t.total}` : '—'}</td><td>${nota(t.nota)}</td><td>${t.finalizado_em ? (t.aprovado ? '<span class="tag green">Aprovado</span>' : '<span class="tag red">Reprovado</span>') : '<span class="tag blue">Em andamento</span>'}</td></tr>`).join('')}</tbody></table>` : '<div class="mini">Sem tentativas.</div>'}`, true);
};
