// Configurações & RBAC: permissões por perfil, usuários (com convite por e-mail), lojas e sistema.
import { S, api, esc, head, abrirModal, fecharModal, toast, chamar, pode, opcoes, val, iniciais } from './nucleo.js';
import { abaIAConfig } from './telas-ia.js';

const MOD_NOMES = { exec: 'Dash Exec.', areas: 'Áreas', cal: 'Calendário', acao: 'Plano Ação', comite: 'Comitê', check: 'Checklists', cms: 'CMS', ia: 'IA', rbac: 'RBAC', bi: 'BI' };
S.cfgAba = 'usuarios';

S.telas.config = async () => {
  const [pf, us, lj, demo] = await Promise.all([api('/gestao/perfis'), api('/gestao/usuarios'), api('/gestao/lojas'), api('/gestao/demo').catch(() => null)]);
  S.cfg = { pf, us, lj, demo };
  const ed = pode('rbac', 2);
  const abas = [['usuarios', `Usuários (${us.filter(u => u.ativo).length})`], ['rbac', 'Permissões (RBAC)'], ['lojas', `Lojas (${lj.filter(l => l.ativa).length})`], ['ia', '✨ Inteligência Artificial'], ['sistema', 'Sistema']];
  let corpo = '';
  if (S.cfgAba === 'ia') {
    corpo = await abaIAConfig();
  } else if (S.cfgAba === 'rbac') {
    const dot = v => `<span class="dotp ${v === 2 ? 'y' : v === 1 ? 'p' : 'n'}"></span>`;
    corpo = `<div class="card p"><div class="sect-title">Matriz de acesso</div><div class="sect-sub">${pf.perfis.length} perfis × módulos · <span class="dotp y"></span> Total &nbsp;<span class="dotp p"></span> Leitura &nbsp;<span class="dotp n"></span> Sem acesso${ed ? ' · altere e salve por perfil' : ''}</div>
    <div style="overflow-x:auto"><table class="matrix"><thead><tr><th>Perfil</th>${pf.modulos.map(m => `<th>${MOD_NOMES[m] || m}</th>`).join('')}${ed ? '<th></th>' : ''}</tr></thead><tbody>
    ${pf.perfis.map(p => `<tr><td><b>${esc(p.nome)}</b></td>${pf.modulos.map(m => `<td>${ed && p.codigo !== 'admin' ? `<select data-p="${p.codigo}" data-m="${m}">${opcoes([[2, 'Total'], [1, 'Leitura'], [0, '—']], p.permissoes[m] ?? 0)}</select>` : dot(p.permissoes[m] ?? 0)}</td>`).join('')}${ed ? `<td>${p.codigo !== 'admin' ? `<button class="linkbtn" onclick="salvarPerfil('${p.codigo}')">Salvar</button>` : '<span class="mini">fixo</span>'}</td>` : ''}</tr>`).join('')}
    </tbody></table></div><div class="mini" style="margin-top:10px">Universidade, Gamificação e Assistente ficam abertos a todos os usuários. A mudança vale a partir do próximo carregamento da plataforma do usuário.</div></div>`;
  } else if (S.cfgAba === 'lojas') {
    corpo = `<div class="card p"><div class="between"><div><div class="sect-title">Lojas</div><div class="sect-sub">${lj.length} cadastradas · ${S.D.marcas.length} marcas</div></div>${ed ? '<button class="btn red" onclick="novaLoja()">+ Nova loja</button>' : ''}</div>
    <div style="overflow-x:auto"><table><thead><tr><th>Loja</th><th>Marca</th><th>Cidade</th><th>Status</th>${ed ? '<th></th>' : ''}</tr></thead><tbody>
    ${lj.map(l => `<tr><td><b>${esc(l.nome)}</b></td><td><span class="tag gray">${esc(l.marca)}</span></td><td>${esc(l.cidade || '—')}</td><td><span class="tag ${l.ativa ? 'green' : 'gray'}">${l.ativa ? 'Ativa' : 'Inativa'}</span></td>${ed ? `<td><button class="linkbtn" onclick="editarLoja(${l.id})">Editar</button></td>` : ''}</tr>`).join('')}
    </tbody></table></div><div class="mini" style="margin-top:10px">Os nomes foram cadastrados de forma genérica — ajuste para os nomes oficiais das lojas.</div></div>`;
  } else if (S.cfgAba === 'sistema') {
    corpo = `<div class="grid cards-2"><div class="card p"><div class="sect-title">E-mail de envio (SMTP)</div><div class="sect-sub">Usado nos convites de acesso e avisos da plataforma</div>
    <p class="mini" style="line-height:1.6">Servidor, porta, usuário e remetente são configurados pela tela de administração — a senha fica cifrada no banco.</p><button class="btn" onclick="window.location.href='/admin/email'">Abrir configuração de e-mail →</button></div>
    ${demo ? `<div class="card p"><div class="sect-title">Dados de demonstração</div><div class="sect-sub">Carga inicial usada na apresentação</div>
    <table><tbody>${[['Ações do plano', demo.acoes], ['Metas', demo.metas], ['Checklists aplicados', demo.checklists], ['Lançamentos de pontos', demo.pontos], ['Reuniões do comitê', demo.reunioes], ['Conteúdos', demo.conteudos], ['Usuários de exemplo', demo.usuarios]].map(r => `<tr><td>${r[0]}</td><td><b>${r[1]}</b></td></tr>`).join('')}</tbody></table>
    ${ed ? `<button class="btn" style="margin-top:12px;color:var(--red)" onclick="limparDemo()">Remover dados de demonstração</button><div class="mini" style="margin-top:8px">Remove só o que foi carregado como exemplo. Guias, áreas, indicadores, checklists, cursos, lojas e calendário permanecem.</div>` : ''}</div>` : ''}</div>`;
  } else {
    corpo = `<div class="card p"><div class="between"><div><div class="sect-title">Usuários</div><div class="sect-sub">Cada usuário recebe por e-mail o link para definir a própria senha</div></div>${ed ? '<button class="btn red" onclick="editarUsuario()">+ Novo usuário</button>' : ''}</div>
    <div style="overflow-x:auto"><table><thead><tr><th>Usuário</th><th>Perfil</th><th>Área</th><th>Marca / loja</th><th>Situação</th>${ed ? '<th></th>' : ''}</tr></thead><tbody>
    ${us.map(u => `<tr style="${u.ativo ? '' : 'opacity:.5'}"><td><div style="display:flex;align-items:center;gap:10px"><div class="who">${iniciais(u.nome)}</div><div><b>${esc(u.nome)}</b><div class="mini">${esc(u.email)}</div></div></div></td><td>${esc(pf.perfis.find(p => p.codigo === u.perfil)?.nome || u.perfil)}</td><td>${esc(u.area || '—')}</td><td class="mini">${esc(u.loja || u.marca || '—')}</td>
    <td>${!u.ativo ? '<span class="tag gray">Inativo</span>' : u.demo ? '<span class="tag amber">Exemplo · sem acesso</span>' : u.convite_pendente ? '<span class="tag amber">Convite pendente</span>' : u.ultimo_acesso ? `<span class="tag green">Ativo</span>` : '<span class="tag blue">Sem acesso ainda</span>'}</td>
    ${ed ? `<td style="white-space:nowrap"><button class="linkbtn" onclick="editarUsuario(${u.id})">Editar</button>${u.ativo ? ` · <button class="linkbtn" onclick="enviarConvite(${u.id})">Convite</button> · <button class="linkbtn" onclick="redefinirSenha(${u.id})">Redefinir senha</button>` : ''}</td>` : ''}</tr>`).join('')}
    </tbody></table></div></div>`;
  }
  return `${head('Configurações & RBAC', 'Usuários · perfis e permissões · lojas · sistema', '')}
  <div class="segmented" style="margin-bottom:18px">${abas.map(([k, t]) => `<button class="${S.cfgAba === k ? 'on' : ''}" onclick="cfgAba('${k}')">${t}</button>`).join('')}</div>${corpo}`;
};
function cfgAba(a) { S.cfgAba = a; go('config'); }

function editarUsuario(id) {
  const u = id ? S.cfg.us.find(x => x.id === id) : { perfil: 'usuario', ativo: true };
  const eu = id === S.D.usuario.id;
  abrirModal(id ? 'Editar usuário' : 'Novo usuário', `<div class="form-grid">
  <div><label class="lbl">Nome</label><input class="inp" id="uNome" value="${esc(u.nome || '')}"></div>
  <div><label class="lbl">E-mail</label><input class="inp" id="uEmail" value="${esc(u.email || '')}" placeholder="nome@grupomilla.com.br"></div>
  <div><label class="lbl">Perfil de acesso</label><select class="inp" id="uPerfil" ${eu ? 'disabled' : ''}>${opcoes(S.cfg.pf.perfis.map(p => [p.codigo, p.nome]), u.perfil)}</select></div>
  <div><label class="lbl">Cargo</label><input class="inp" id="uCargo" value="${esc(u.cargo || '')}"></div>
  <div><label class="lbl">Área</label><select class="inp" id="uArea">${opcoes([['', '—'], ...S.D.areaOrder.map(a => [a, S.D.areas[a].nome])], u.area_id || '')}</select></div>
  <div><label class="lbl">Marca</label><select class="inp" id="uMarca">${opcoes([['', '—'], ...S.D.marcas], u.marca || '')}</select></div>
  <div><label class="lbl">Loja</label><select class="inp" id="uLoja">${opcoes([['', '—'], ...S.cfg.lj.filter(l => l.ativa).map(l => [l.id, l.nome])], u.loja_id || '')}</select></div>
  ${id && !eu ? `<div><label class="lbl">Situação</label><select class="inp" id="uAtivo">${opcoes([['1', 'Ativo'], ['0', 'Inativo']], u.ativo ? '1' : '0')}</select></div>` : ''}
  </div>
  <div style="display:flex;gap:8px;margin-top:14px"><button class="btn red" onclick="salvarUsuario(${id || 0})">${id ? 'Salvar' : 'Criar e enviar convite'}</button><button class="btn ghost" onclick="fecharModal()">Cancelar</button></div>
  ${id ? '' : '<div class="mini" style="margin-top:10px">O usuário recebe por e-mail um link (válido por 72 h) para definir a senha.</div>'}`, true);
}
function mostrarLink(r, titulo) {
  abrirModal(titulo, `<p style="font-size:13.5px;line-height:1.6;margin-top:0">${r.enviarEmail === false ? 'Link gerado (não foi enviado por e-mail).' : r.emailEnviado ? `✅ Link enviado por e-mail${r.email ? ` para <b>${esc(r.email)}</b>` : ''}.` : '⚠️ O e-mail não pôde ser enviado (confira a configuração de SMTP).'} Se preferir, copie o link e envie pelo WhatsApp:</p>
  <input class="inp" id="lnk" value="${esc(r.link)}" readonly onclick="this.select()"><div style="display:flex;gap:8px;margin-top:12px"><button class="btn red" onclick="navigator.clipboard.writeText(document.getElementById('lnk').value).then(()=>toastOk('Link copiado.'))">Copiar link</button><button class="btn ghost" onclick="fecharModal()">Fechar</button></div><div class="mini" style="margin-top:8px">Link de uso único, válido por 72 horas.</div>`);
}
async function salvarUsuario(id) {
  const corpo = { nome: val('uNome'), email: val('uEmail'), perfil: val('uPerfil'), cargo: val('uCargo'), area_id: val('uArea'), marca: val('uMarca'), loja_id: val('uLoja') || null };
  if (document.getElementById('uAtivo')) corpo.ativo = val('uAtivo') === '1';
  const r = await chamar(() => api(id ? `/gestao/usuarios/${id}` : '/gestao/usuarios', { metodo: id ? 'PATCH' : 'POST', corpo }));
  await go('config');
  if (!id) mostrarLink(r, 'Usuário criado'); else { fecharModal(); toast('Usuário atualizado.', 'ok'); }
}
async function enviarConvite(id) {
  const r = await chamar(() => api(`/gestao/usuarios/${id}/convite`, { metodo: 'POST' }));
  await go('config');
  mostrarLink(r, 'Convite gerado');
}
function redefinirSenha(id) {
  const u = S.cfg.us.find(x => x.id === id);
  abrirModal(`Redefinir senha · ${esc(u.nome)}`, `<div class="segmented" style="margin-bottom:14px"><button id="rsBL" class="on" onclick="modoSenha('link')">Enviar link por e-mail</button><button id="rsBD" onclick="modoSenha('definir')">Definir nova senha</button></div>
  <div id="rsLink"><p class="mini" style="line-height:1.6;margin-top:0">O usuário recebe em <b>${esc(u.email)}</b> um link (válido por 72 h) para criar a nova senha. A senha atual continua valendo até o link ser usado.</p>
  <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn red" onclick="linkSenha(${id}, true)">Enviar por e-mail</button><button class="btn ghost" onclick="linkSenha(${id}, false)">Só gerar o link</button><button class="btn ghost" onclick="fecharModal()">Cancelar</button></div></div>
  <div id="rsDef" style="display:none"><div class="form-grid"><div><label class="lbl">Nova senha</label><input class="inp" type="password" id="rsS1" autocomplete="new-password"></div><div><label class="lbl">Confirmar a senha</label><input class="inp" type="password" id="rsS2" autocomplete="new-password"></div></div>
  <div class="mini" style="margin-top:8px">Mínimo de 8 caracteres. A senha passa a valer na hora e os links pendentes deste usuário são cancelados. Combine com o usuário como ele vai receber a senha.</div>
  <div style="display:flex;gap:8px;margin-top:12px"><button class="btn red" onclick="salvarNovaSenha(${id})">Salvar nova senha</button><button class="btn ghost" onclick="fecharModal()">Cancelar</button></div></div>`);
}
function modoSenha(m) {
  document.getElementById('rsLink').style.display = m === 'link' ? '' : 'none';
  document.getElementById('rsDef').style.display = m === 'definir' ? '' : 'none';
  document.getElementById('rsBL').classList.toggle('on', m === 'link');
  document.getElementById('rsBD').classList.toggle('on', m === 'definir');
}
async function linkSenha(id, enviarEmail) {
  const r = await chamar(() => api(`/gestao/usuarios/${id}/senha`, { metodo: 'POST', corpo: { modo: 'link', enviarEmail } }));
  await go('config');
  mostrarLink(r, enviarEmail ? 'Redefinição de senha enviada' : 'Link de redefinição de senha');
}
async function salvarNovaSenha(id) {
  const s1 = val('rsS1'), s2 = val('rsS2');
  if (s1.length < 8) return toast('A senha precisa ter pelo menos 8 caracteres.', 'erro');
  if (s1 !== s2) return toast('As duas senhas não conferem.', 'erro');
  await chamar(() => api(`/gestao/usuarios/${id}/senha`, { metodo: 'POST', corpo: { modo: 'definir', senha: s1 } }));
  fecharModal(); toast('Nova senha salva.', 'ok'); go('config');
}
async function salvarPerfil(cod) {
  const permissoes = {};
  document.querySelectorAll(`select[data-p="${cod}"]`).forEach(s => { permissoes[s.dataset.m] = Number(s.value); });
  await chamar(() => api(`/gestao/perfis/${cod}`, { metodo: 'PUT', corpo: { permissoes } }));
  toast('Permissões do perfil salvas.', 'ok');
}
function novaLoja() {
  abrirModal('Nova loja', `<div class="form-grid"><div class="full"><label class="lbl">Nome</label><input class="inp" id="lNome"></div><div><label class="lbl">Marca</label><select class="inp" id="lMarca">${opcoes(S.D.marcas)}</select></div><div><label class="lbl">Cidade</label><input class="inp" id="lCid"></div></div>
  <div style="display:flex;gap:8px;margin-top:14px"><button class="btn red" onclick="salvarLoja(0)">Salvar</button><button class="btn ghost" onclick="fecharModal()">Cancelar</button></div>`);
}
function editarLoja(id) {
  const l = S.cfg.lj.find(x => x.id === id);
  abrirModal('Editar loja', `<div class="form-grid"><div class="full"><label class="lbl">Nome</label><input class="inp" id="lNome" value="${esc(l.nome)}"></div><div><label class="lbl">Cidade</label><input class="inp" id="lCid" value="${esc(l.cidade || '')}"></div><div><label class="lbl">Situação</label><select class="inp" id="lAtiva">${opcoes([['1', 'Ativa'], ['0', 'Inativa']], l.ativa ? '1' : '0')}</select></div></div>
  <div style="display:flex;gap:8px;margin-top:14px"><button class="btn red" onclick="salvarLoja(${id})">Salvar</button><button class="btn ghost" onclick="fecharModal()">Cancelar</button></div>`);
}
async function salvarLoja(id) {
  const corpo = id ? { nome: val('lNome'), cidade: val('lCid'), ativa: val('lAtiva') === '1' } : { nome: val('lNome'), marca: val('lMarca'), cidade: val('lCid') };
  await chamar(() => api(id ? `/gestao/lojas/${id}` : '/gestao/lojas', { metodo: id ? 'PATCH' : 'POST', corpo }));
  await window.recarregarBaseGlobal(); fecharModal(); toast('Loja salva.', 'ok'); go('config');
}
async function limparDemo() {
  if (!confirm('Remover todos os dados de demonstração? Esta ação não pode ser desfeita.')) return;
  await chamar(() => api('/gestao/demo', { metodo: 'DELETE' }));
  await window.recarregarBaseGlobal(); toast('Dados de demonstração removidos.', 'ok'); go('config');
}

Object.assign(window, { cfgAba, editarUsuario, salvarUsuario, enviarConvite, redefinirSenha, modoSenha, linkSenha, salvarNovaSenha, salvarPerfil, novaLoja, editarLoja, salvarLoja, limparDemo, toastOk: m => toast(m, 'ok') });
