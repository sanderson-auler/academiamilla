// Navegação simples por caminho (o nginx devolve o index.html para qualquer rota).
export function ir(caminho) {
  window.history.pushState(null, '', caminho);
  window.dispatchEvent(new Event('am360:rota'));
}
