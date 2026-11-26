// Relatórios BI: catálogo de relatórios com dados do DW do Grupo Milla e importação de carga (administração).
// O relatório abre numa página própria (public/bi/*.html) dentro da plataforma, lendo os dados da API com a sessão do usuário.
import { S, api, esc, head, toast, chamar, pode, dataBR, dataHoraBR, trilha, go } from './nucleo.js';

S.telas.bi = async () => {
  const rels = await api('/bi/relatorios');
  const adm = pode('bi', 2);
  const cargas = adm ? await api('/bi/compra-faixa/cargas').catch(() => []) : [];
  const cards = rels.map(r => `<div class="card p">
    <div class="between" style="align-items:flex-start;gap:12px"><div><div class="sect-title">${esc(r.titulo)}</div><div class="sect-sub">${esc(r.descricao)}</div></div><span class="tag blue">${esc(r.area)}</span></div>
    <div class="mini" style="margin:10px 0 14px">${r.carga ? `Dados do DW de <b>${dataBR(r.carga.data_referencia)}</b> · ${Number(r.carga.linhas).toLocaleString('pt-BR')} combinações linha × grupo × subgrupo × faixa · importados em ${dataHoraBR(r.carga.criado_em)}` : 'Sem carga de dados ainda.'}</div>
    <button class="btn red" ${r.carga ? '' : 'disabled'} onclick="abrirRelatorioBI('${esc(r.id)}')">Abrir relatório</button></div>`).join('');
  const carga = adm ? `<div class="card p" style="margin-top:18px"><div class="sect-title">Carga de dados — Simulador de Compras</div>
    <div class="sect-sub">Enquanto a rotina automática com o Oracle não entra, a carga é feita por arquivo gerado do DW (CSVs do ETL Pentaho). A carga nova substitui a anterior para todos os usuários; as anteriores ficam no histórico.</div>
    <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-top:12px"><input type="file" id="biArq" accept=".json,application/json" class="inp" style="max-width:420px"><button class="btn" onclick="importarCargaBI()">Importar carga</button></div>
    ${cargas.length ? `<div style="overflow-x:auto;margin-top:14px"><table><thead><tr><th>Data do DW</th><th>Combinações</th><th>Origem</th><th>Importada em</th><th>Por</th><th>Situação</th></tr></thead><tbody>
    ${cargas.map(c => `<tr><td>${dataBR(c.data_referencia)}</td><td>${Number(c.linhas).toLocaleString('pt-BR')}</td><td>${c.origem === 'oracle' ? 'Rotina Oracle' : 'Arquivo'}</td><td>${dataHoraBR(c.criado_em)}</td><td>${esc(c.criado_por || '—')}</td><td><span class="tag ${c.ativa ? 'green' : 'gray'}">${c.ativa ? 'Em uso' : 'Histórico'}</span></td></tr>`).join('')}
    </tbody></table></div>` : ''}</div>` : '';
  return `${head('Relatórios BI', 'Relatórios com dados do DW do Grupo Milla · venda, estoque e compras', '')}
  <div class="grid cards-2">${cards}</div>${carga}`;
};

function abrirRelatorioBI(id) {
  const paginas = { 'compra-faixa': ['/bi/simulador-compras.html', 'Simulador de Compras por Faixa de Preço'] };
  const [pagina, titulo] = paginas[id] || [];
  if (!pagina) return;
  trilha(`Academia Milla 360 · <a onclick="go('bi')" style="cursor:pointer">Relatórios BI</a> · <b>${esc(titulo)}</b>`);
  document.getElementById('view').innerHTML = `<div class="between" style="margin-bottom:10px;gap:10px;flex-wrap:wrap">
    <button class="btn ghost" onclick="go('bi')">← Relatórios BI</button>
    <a class="btn ghost" href="${pagina}" target="_blank" rel="noopener">Abrir em tela cheia ↗</a></div>
    <iframe src="${pagina}" title="${esc(titulo)}" style="width:100%;height:calc(100vh - 150px);min-height:560px;border:1px solid var(--line);border-radius:12px;background:#fff"></iframe>`;
}

async function importarCargaBI() {
  const f = document.getElementById('biArq')?.files?.[0];
  if (!f) return toast('Escolha o arquivo de carga (.json).', 'erro');
  let corpo;
  try { corpo = JSON.parse(await f.text()); } catch { return toast('O arquivo não é um JSON válido.', 'erro'); }
  toast('Importando a carga…');
  const r = await chamar(() => api('/bi/compra-faixa/carga', { metodo: 'POST', corpo }));
  toast(`Carga importada: ${Number(r.linhas).toLocaleString('pt-BR')} combinações · dados de ${dataBR(r.data_referencia)}.`, 'ok');
  go('bi');
}

Object.assign(window, { abrirRelatorioBI, importarCargaBI });
