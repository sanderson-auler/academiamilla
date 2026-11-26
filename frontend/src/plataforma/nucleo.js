// Núcleo da plataforma: estado, acesso à API, utilitários de tela, menu e navegação.
import Chart from 'chart.js/auto';
import { api, sessao } from '../api.js';
import { ICONS } from './icones.js';

export { api, Chart };
export const S = { D: null, cur: { area: null, tab: 'visao', marca: 'Todas' }, charts: [], modalChart: null, telas: {}, depois: {}, abasArea: {}, abasDepois: {} };

// ---------- utilitários ----------
export const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const ic = (n, c) => `<svg class="${c || 'svg-ic'}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${ICONS[n] || ''}</svg>`;
export const iniciais = n => String(n || '?').split(' ').filter(Boolean).map(x => x[0]).join('').slice(0, 2).toUpperCase();
export const prog = (p, cls) => `<div class="progress ${cls || ''}"><i style="width:${Math.max(0, Math.min(100, p))}%"></i></div>`;
export const head = (t, s, btn) => `<div class="page-head"><div><h1>${t}</h1><p>${s}</p></div><div>${btn || ''}</div></div>`;
export function kpiCard(ic_, cor, v, l, trend, up, onclick) {
  return `<div class="card kpi ${onclick ? 'cl' : ''}" ${onclick ? `onclick="${onclick}"` : ''}><div class="top"><div class="ic" style="background:${cor}">${ic(ic_)}</div>${trend ? `<span class="trend ${up ? 'up' : 'down'}">${up ? '▲' : '▼'} ${esc(trend)}</span>` : ''}</div><div class="v">${esc(v)}</div><div class="l">${esc(l)}</div></div>`;
}
export const hojeISO = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
export const dataBR = d => { if (!d) return '—'; const s = String(d).slice(0, 10).split('-'); return `${s[2]}/${s[1]}/${s[0]}`; };
export const dataCurta = d => { if (!d) return '—'; const s = String(d).slice(0, 10).split('-'); return `${s[2]}/${s[1]}`; };
export const dataHoraBR = d => d ? new Date(d).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
export const pode = (mod, nivel = 1) => (S.D?.permissoes?.[mod] || 0) >= nivel;
export const opcoes = (lista, sel) => lista.map(o => { const [v, t] = Array.isArray(o) ? o : [o, o]; return `<option value="${esc(v)}" ${String(v) === String(sel ?? '') ? 'selected' : ''}>${esc(t)}</option>`; }).join('');

export function toast(msg, tipo = '') {
  const t = document.createElement('div');
  t.className = `toast ${tipo}`; t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 3800);
}
export function pontosToast(r, base) {
  if (r?.pontosGanhos) toast(`${base} · +${r.pontosGanhos} pontos na gamificação 🏅`, 'ok');
  else toast(base, 'ok');
}
export async function chamar(fn, ok) {
  try { const r = await fn(); if (ok) ok(r); return r; } catch (e) { toast(e.message, 'erro'); throw e; }
}

// ---------- gráficos ----------
export function destruirGraficos() { S.charts.forEach(c => { try { c.destroy(); } catch {} }); S.charts = []; }
export function grafico(id, cfg) { const el = document.getElementById(id); if (!el) return null; const c = new Chart(el, cfg); S.charts.push(c); return c; }

// ---------- modal ----------
export function abrirModal(titulo, corpo, largo) {
  document.getElementById('modalRoot').innerHTML = `<div class="modal-bg" onclick="if(event.target===this)fecharModal()"><div class="modal" style="${largo ? 'max-width:760px' : ''}"><div class="mhd"><h3>${titulo}</h3><button class="x" onclick="fecharModal()">✕</button></div><div class="mbd">${corpo}</div></div></div>`;
}
export function fecharModal() {
  if (S.modalChart) { try { S.modalChart.destroy(); } catch {} S.modalChart = null; }
  document.getElementById('modalRoot').innerHTML = '';
}
export const val = id => document.getElementById(id)?.value ?? '';

// ---------- menu e navegação ----------
const NAV = [
  { g: 'Início' }, { id: 'home', t: 'Meu Painel', ic: 'home' }, { id: 'areas', t: 'Áreas', ic: 'grid', mod: 'areas' }, { id: 'exec', t: 'Dashboard Executivo', ic: 'chart', mod: 'exec' },
  { g: 'Gestão Comercial' }, { id: 'cal', t: 'Calendário Comercial', ic: 'cal', mod: 'cal' }, { id: 'comite', t: 'Comitê Comercial', ic: 'users', mod: 'comite' },
  { g: 'BI' }, { id: 'bi', t: 'Relatórios BI', ic: 'chart', mod: 'bi' },
  { g: 'Desenvolvimento' }, { id: 'univ', t: 'Universidade', ic: 'cap' }, { id: 'game', t: 'Gamificação', ic: 'medal' },
  { g: 'Inteligência' }, { id: 'ia', t: 'Assistente Milla', ic: 'spark' }, { id: 'cms', t: 'CMS / Conteúdos', ic: 'layers', mod: 'cms' },
  { g: 'Administração' }, { id: 'config', t: 'Configurações & RBAC', ic: 'gear', mod: 'rbac' },
];
export const TITULOS = Object.fromEntries(NAV.filter(n => n.id).map(n => [n.id, n.t]));

export function montarMenu() {
  const itens = NAV.filter(n => !n.mod || pode(n.mod));
  const limpo = itens.filter((n, i) => !n.g || (itens[i + 1] && !itens[i + 1].g));
  document.getElementById('nav').innerHTML = limpo.map(n => n.g ? `<div class="group">${n.g}</div>` : `<a data-id="${n.id}" onclick="go('${n.id}')">${ic(n.ic, 'ic')}<span>${n.t}</span></a>`).join('');
}
export function marcarAtivo(id) {
  document.querySelectorAll('#nav a').forEach(a => a.classList.toggle('active', a.dataset.id === id || (String(id).startsWith('area:') && a.dataset.id === 'areas')));
}
export function trilha(html) { document.getElementById('crumb').innerHTML = html; }

export async function go(id) {
  destruirGraficos();
  fecharModal();
  if (String(id).startsWith('area:')) return window.openArea(id.split(':')[1]);
  marcarAtivo(id);
  trilha(`Academia Milla 360 · <b>${TITULOS[id] || ''}</b>`);
  const v = document.getElementById('view');
  const tela = S.telas[id];
  window.scrollTo(0, 0);
  document.getElementById('sidebar').classList.remove('open');
  if (!tela) { v.innerHTML = '<div class="card p">Em construção</div>'; return; }
  v.innerHTML = '<div class="carregando">Carregando…</div>';
  try {
    const html = await tela();
    if (S.atual !== id) { /* navegação mudou durante o carregamento */ }
    v.innerHTML = html;
    if (S.depois[id]) S.depois[id]();
  } catch (e) {
    v.innerHTML = `<div class="card p"><b>Não foi possível carregar.</b><div class="mini" style="margin-top:6px">${esc(e.message)}</div><button class="btn" style="margin-top:12px" onclick="go('${id}')">Tentar de novo</button></div>`;
  }
}

// Recarrega os dados base (após ações que mudam pontos, cursos, calendário…).
export async function recarregarBase() {
  S.D = await api('/plataforma/base');
  atualizarRodape();
}
export function atualizarRodape() {
  const n = S.D.pontos.nivel;
  document.getElementById('upg').innerHTML = `<b>Nível: ${esc(n.nome)} 🏅</b>${S.D.pontos.total.toLocaleString('pt-BR')} pts${n.proximo ? ` · faltam ${n.faltam.toLocaleString('pt-BR')} para ${esc(n.proximo)}` : ''}`;
}

export function sair() { sessao.limpar(); window.location.href = '/entrar'; }

Object.assign(window, { go, fecharModal, sairPlataforma: sair });
