// Plano de Ação · Kanban: arrastar e soltar os cartões entre colunas para mudar o status.
import { S, api, toast, pontosToast, pode } from './nucleo.js';

const ST = ['A fazer', 'Em andamento', 'Em revisão', 'Concluído'];
const depoisAcao = S.abasDepois.acao;
S.abasDepois.acao = (id, a) => {
  if (depoisAcao) depoisAcao(id, a);
  if ((S.cur.acaoView || 'kanban') !== 'kanban' || !pode('acao')) return;
  const cols = [...document.querySelectorAll('#areaBody .kanban .kcol')];
  if (cols.length !== ST.length) return;
  let arrastando = null;
  cols.forEach((col, i) => {
    col.dataset.status = ST[i];
    col.querySelectorAll('.kcard').forEach(card => {
      const tid = Number((card.getAttribute('onclick') || '').match(/openTask\((\d+)\)/)?.[1]);
      if (!tid) return;
      card.draggable = true; card.dataset.id = tid;
      card.addEventListener('dragstart', e => { arrastando = card; card.classList.add('kd-drag'); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', String(tid)); });
      card.addEventListener('dragend', () => { card.classList.remove('kd-drag'); cols.forEach(c => c.classList.remove('kd-alvo')); arrastando = null; });
    });
    col.addEventListener('dragover', e => { if (!arrastando) return; e.preventDefault(); e.dataTransfer.dropEffect = 'move'; col.classList.add('kd-alvo');
      const antes = [...col.querySelectorAll('.kcard:not(.kd-drag)')].find(c => e.clientY < c.getBoundingClientRect().top + c.offsetHeight / 2);
      const fim = col.querySelector(':scope > button'); if (antes) col.insertBefore(arrastando, antes); else col.insertBefore(arrastando, fim || null); });
    col.addEventListener('dragleave', e => { if (!col.contains(e.relatedTarget)) col.classList.remove('kd-alvo'); });
    col.addEventListener('drop', async e => {
      e.preventDefault(); col.classList.remove('kd-alvo');
      const card = arrastando; if (!card) return;
      const novo = col.dataset.status;
      cols.forEach(c => { const n = c.querySelectorAll('.kcard').length; const cnt = c.querySelector('.cnt'); if (cnt) cnt.textContent = n; });
      try {
        const r = await api(`/acoes/${card.dataset.id}`, { metodo: 'PATCH', corpo: { status: novo } });
        pontosToast(r, `Ação movida para “${novo}”`);
        if (window.renderAreaTabAtual) window.renderAreaTabAtual();
      } catch (err) { toast(err.message, 'erro'); if (window.renderAreaTabAtual) window.renderAreaTabAtual(); }
    });
  });
};
const st = document.createElement('style');
st.textContent = `.kcard[draggable=true]{cursor:grab}.kcard.kd-drag{opacity:.45;cursor:grabbing}.kcol.kd-alvo{outline:2px dashed var(--royal);outline-offset:-4px;background:#E6EDF8}`;
document.head.appendChild(st);
