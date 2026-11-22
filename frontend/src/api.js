// Cliente da API: guarda o token da sessão e padroniza erros.
const BASE = import.meta.env.VITE_API_URL || '/api';
const CHAVE = 'am360_sessao';

export const sessao = {
  obter() { try { return JSON.parse(localStorage.getItem(CHAVE)) || null; } catch { return null; } },
  salvar(s) { try { localStorage.setItem(CHAVE, JSON.stringify(s)); } catch {} },
  limpar() { try { localStorage.removeItem(CHAVE); } catch {} },
};

export async function api(caminho, { metodo = 'GET', corpo } = {}) {
  const s = sessao.obter();
  let r;
  try {
    r = await fetch(`${BASE}${caminho}`, {
      method: metodo,
      headers: { 'Content-Type': 'application/json', ...(s?.token ? { Authorization: `Bearer ${s.token}` } : {}) },
      body: corpo ? JSON.stringify(corpo) : undefined,
    });
  } catch {
    throw new Error('Não foi possível falar com o servidor. Verifique sua conexão.');
  }
  const dados = await r.json().catch(() => ({}));
  if (r.status === 401 && s?.token) { sessao.limpar(); window.dispatchEvent(new Event('am360:sair')); }
  if (!r.ok) throw new Error(dados.erro || 'Não foi possível concluir. Tente novamente.');
  return dados;
}
