// Configurar IA: abaixo de "Salvar chave", link direto para a página de chaves do provedor escolhido
// e um passo a passo curto. Substitui a linha "Crie a chave em …" sempre que o cartão da chave é desenhado.
import { esc } from './nucleo.js';

const CHAVE_LINK = {
  openai: ['https://platform.openai.com/api-keys', 'Entre com a conta da empresa → API keys → "Create new secret key" → copie a chave (começa com sk-). Em Billing, cadastre a forma de pagamento.'],
  anthropic: ['https://console.anthropic.com/settings/keys', 'Entre no Console → Settings → API Keys → "Create Key" → copie a chave (começa com sk-ant-). Em Billing, adicione créditos.'],
  gemini: ['https://aistudio.google.com/app/apikey', 'Entre com a conta Google da empresa → "Create API key" → escolha o projeto → copie a chave (começa com AIza).'],
  maritaca: ['https://plataforma.maritaca.ai/chaves-de-api', 'Entre na plataforma → Chaves de API → "Criar nova chave" → copie a chave. Adicione créditos em Faturamento.'],
  deepseek: ['https://platform.deepseek.com/api_keys', 'Entre na plataforma → API keys → "Create new API key" → copie a chave (começa com sk-). Recarregue créditos em Top up.'],
  mistral: ['https://console.mistral.ai/api-keys', 'Entre no Console → API Keys → "Create new key" → copie a chave. Ative um plano em Billing.'],
  xai: ['https://console.x.ai', 'Entre no Console → API Keys → "Create API key" → copie a chave (começa com xai-). Adicione créditos em Billing.'],
  groq: ['https://console.groq.com/keys', 'Entre no Console → API Keys → "Create API Key" → copie a chave (começa com gsk_).'],
  openrouter: ['https://openrouter.ai/settings/keys', 'Entre no OpenRouter → Keys → "Create Key" → copie a chave (começa com sk-or-). Adicione créditos em Credits.'],
};

function aplicar() {
  document.querySelectorAll('#view .mini, #modalRoot .mini').forEach(el => {
    if (el.dataset.ajuda || !/^Crie a chave em/.test(el.textContent.trim())) return;
    let box = el.parentElement;
    while (box && !box.querySelector('[onclick^="iacChave("]')) box = box.parentElement;
    const m = box?.querySelector('[onclick^="iacChave("]')?.getAttribute('onclick').match(/iacChave\('([\w-]+)'\)/);
    const c = m && CHAVE_LINK[m[1]];
    if (!c) return;
    const site = el.querySelector('b')?.textContent || 'site do provedor';
    el.dataset.ajuda = '1';
    el.className = 'coment';
    el.style.cssText = 'margin-top:12px;font-size:12.5px;line-height:1.5';
    el.innerHTML = `<b>Como criar a chave</b><div style="margin:4px 0">${esc(c[1])} Depois, cole a chave no campo acima, clique em <b>Salvar chave</b> e em <b>Testar conexão</b>.</div>
      <a class="btn ghost" href="${c[0]}" target="_blank" rel="noopener noreferrer" style="display:inline-block;margin-top:4px;padding:6px 12px;font-size:12.5px">Abrir ${esc(site)} ↗</a>
      <div class="mini" style="margin-top:6px">O consumo é cobrado pelo provedor na conta do Grupo Milla. A chave fica cifrada e nunca volta para a tela.</div>`;
  });
}
new MutationObserver(aplicar).observe(document.documentElement, { childList: true, subtree: true });
