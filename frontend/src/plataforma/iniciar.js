// Montagem da plataforma: casca (menu, barra superior), busca, comunicados e notificações.
import './estilo.css';
import { S, api, esc, ic, iniciais, montarMenu, go, recarregarBase, atualizarRodape, sair, abrirModal, dataCurta, hojeISO } from './nucleo.js';
import './telas-areas.js';
import './telas-gerais.js';
import './telas-config.js';
import './telas-univ.js';
import './marcas.js';
import './kanban-dnd.js';
import './areas-admin.js';
import './telas-comite.js';
import './checklists-edit.js';
import './chave-ajuda.js';

export const CASCA = `
<div id="app">
  <aside class="sidebar" id="sidebar">
    <div class="brand"><div class="logo-badge sm">M</div><div><b>Academia Milla</b><small>360 · GESTÃO COMERCIAL</small></div></div>
    <nav class="nav" id="nav"></nav>
    <div class="upg" id="upg"></div>
  </aside>
  <div class="main">
    <header class="topbar">
      <div class="menu-toggle" onclick="document.getElementById('sidebar').classList.toggle('open')">☰</div>
      <div class="crumb" id="crumb"></div>
      <div class="search"><span>🔎</span><input id="busca" placeholder="Buscar áreas, cursos, ações, campanhas..." autocomplete="off" /><div id="buscaRes"></div></div>
      <button class="topbtn" title="Comunicados" onclick="verComunicados()"><span>📣</span><span class="dot" id="dotCom"></span></button>
      <button class="topbtn" title="Notificações" onclick="verNotificacoes()"><span>🔔</span><span class="dot" id="dotNot"></span></button>
      <div class="avatar" onclick="menuUsuario()" style="position:relative"><div class="ball" id="avBall"></div><div class="nm" id="avNome"></div><div id="menuU"></div></div>
    </header>
    <main class="content" id="view"></main>
  </div>
</div>
<div id="modalRoot"></div>`;

export async function iniciar() {
  await recarregarBase();
  const u = S.D.usuario;
  document.getElementById('avBall').textContent = iniciais(u.nome);
  document.getElementById('avNome').innerHTML = `${esc(u.nome)}<small>${esc(u.cargo || u.perfil_nome)}</small>`;
  document.getElementById('dotCom').style.display = S.D.comunicados.length ? '' : 'none';
  montarMenu(); atualizarRodape();
  configurarBusca();
  go('home');
  api('/plataforma/painel').then(p => { document.getElementById('dotNot').style.display = p.acoesHoje ? '' : 'none'; S.painel = p; }).catch(() => {});
}
window.recarregarBaseGlobal = recarregarBase;

// ---------- busca ----------
function configurarBusca() {
  const inp = document.getElementById('busca'), res = document.getElementById('buscaRes');
  let t;
  inp.addEventListener('input', () => {
    clearTimeout(t);
    const q = inp.value.trim();
    if (q.length < 2) { res.innerHTML = ''; return; }
    t = setTimeout(async () => {
      const r = await api(`/plataforma/busca?q=${encodeURIComponent(q)}`).catch(() => ({}));
      const linhas = [
        ...(r.areas || []).map(a => [`openArea('${a.id}')`, 'grid', a.nome, 'Área']),
        ...(r.acoes || []).map(a => [`openArea('${a.area_id}','acao');setTimeout(()=>openTask(${a.id}),400)`, 'kanban', a.titulo, `Ação · ${a.status}`]),
        ...(r.cursos || []).map(c => [`openArea('${c.area_id}','treino')`, 'cap', c.titulo, 'Curso']),
        ...(r.campanhas || []).map(c => [`go('cal');setTimeout(()=>openCampaign(${c.id}),300)`, 'cal', c.nome, `Campanha · ${c.marca} · ${c.periodo}`]),
        ...(r.checklists || []).map(c => [`openArea('${c.area_id}','check')`, 'check', c.nome, 'Checklist']),
        ...(r.conteudos || []).map(c => [`go('cms')`, 'layers', c.titulo, c.tipo]),
      ];
      res.innerHTML = `<div class="drop">${linhas.length ? linhas.slice(0, 12).map(l => `<div class="row-item" onclick="document.getElementById('buscaRes').innerHTML='';document.getElementById('busca').value='';${l[0]}"><div class="ico" style="background:#EEF3F5">${ic(l[1])}</div><div style="flex:1"><div class="ttl">${esc(l[2])}</div><div class="meta">${esc(l[3])}</div></div></div>`).join('') : '<div class="mini" style="padding:10px">Nada encontrado.</div>'}</div>`;
    }, 250);
  });
  document.addEventListener('click', e => { if (!e.target.closest('.search')) res.innerHTML = ''; if (!e.target.closest('.avatar')) { const m = document.getElementById('menuU'); if (m) m.innerHTML = ''; } });
}

window.verComunicados = () => {
  const l = S.D.comunicados;
  abrirModal('📣 Comunicados', l.length ? l.map(c => `<div class="coment"><b>${esc(c.titulo)}</b> <span class="mini">· ${new Date(c.publicado_em).toLocaleDateString('pt-BR')}</span><div style="margin-top:6px;white-space:pre-wrap">${esc(c.corpo || '')}</div></div>`).join('') : '<div class="vazio">Nenhum comunicado publicado.</div>', true);
};
window.verNotificacoes = async () => {
  const p = S.painel || await api('/plataforma/painel');
  const venc = p.acoes.filter(a => a.prazo && String(a.prazo).slice(0, 10) <= hojeISO());
  abrirModal('🔔 Notificações', `${venc.length ? `<div class="sect-title" style="font-size:14px">Ações que vencem até hoje</div>${venc.map(a => `<div class="row-item" style="cursor:pointer" onclick="fecharModal();openArea('${a.area_id}','acao')"><div class="ico" style="background:#FDECEE">${ic('kanban')}</div><div style="flex:1"><div class="ttl">${esc(a.titulo)}</div><div class="meta">${esc(a.area)}</div></div><span class="tag red">${dataCurta(a.prazo)}</span></div>`).join('')}` : '<div class="vazio">Tudo em dia. Nenhuma ação vencendo hoje. ✅</div>'}
  ${p.campanhas.length ? `<div class="sect-title" style="font-size:14px;margin-top:14px">Próxima campanha</div><div class="row-item"><div style="flex:1"><div class="ttl">${esc(p.campanhas[0].nome)}</div><div class="meta">${esc(p.campanhas[0].marca)} · ${esc(p.campanhas[0].periodo)}</div></div></div>` : ''}`);
};
window.menuUsuario = () => {
  const m = document.getElementById('menuU');
  if (m.innerHTML) { m.innerHTML = ''; return; }
  const u = S.D.usuario;
  m.innerHTML = `<div class="drop" style="width:240px;top:48px" onclick="event.stopPropagation()"><div style="padding:6px 8px 10px;border-bottom:1px solid var(--line);margin-bottom:6px"><b>${esc(u.nome)}</b><div class="mini">${esc(u.email)}</div><div class="mini">Perfil: ${esc(u.perfil_nome)}</div></div>
  <div class="row-item" onclick="go('game')"><div class="ttl">🏅 Meus pontos</div></div><div class="row-item" onclick="meusCertificados()"><div class="ttl">🎓 Meus certificados</div></div>
  ${S.D.permissoes.rbac ? `<div class="row-item" onclick="go('config')"><div class="ttl">⚙️ Configurações</div></div>` : ''}<div class="row-item" onclick="sairPlataforma()"><div class="ttl" style="color:var(--red)">Sair</div></div></div>`;
};
