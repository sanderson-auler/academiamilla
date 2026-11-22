// Fonte da verdade da versão do produto: o TOPO desta lista.
// O deploy.sh lê a versão daqui e confere se é a mesma que está no ar.
export const CHANGELOG = [
  {
    versao: "0.1.0",
    data: "2026-11-22",
    itens: [
      "Estrutura inicial: API (Node 20 + Express) conectada ao PostgreSQL e frontend (React + Vite).",
      "Tela de status do ambiente com a saúde da API e do banco.",
    ],
  },
];

export const VERSAO = CHANGELOG[0].versao;
