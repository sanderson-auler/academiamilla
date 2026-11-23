// Fonte da verdade da versão do produto: o TOPO desta lista.
// O deploy.sh lê a versão daqui e confere se é a mesma que está no ar.
export const CHANGELOG = [
  {
    versao: "0.4.0",
    data: "2026-11-23",
    itens: [
      "Supervisão Comercial com o Guia de Supervisão de Loja: rotina na loja da abertura ao fechamento, programação mensal por semana (com o detalhe de cada dia) e roteiro de conversa com o gerente.",
      "Checklists de Visita à Loja (49 pontos em 11 blocos) e Visita à Concorrência (36 pontos): cabeçalho da visita, observação por item, índice ponderado, classificação, relatório com leitura da visita e plano de ação automático com os prazos do guia.",
      "Assistente IA em cada área e Assistente Milla geral: respostas com base no guia da área e nos conteúdos publicados, com citação das fontes.",
      "Configuração do agente de IA: identidade, tom de voz e personalidade, instruções da área, restrições, encaminhamentos, provedor e modelo (OpenAI, Claude, Gemini, Maritaca, DeepSeek, Mistral, Grok, Groq, OpenRouter ou compatível).",
      "Base de conhecimento por área: envio de PDF, Word, Excel, PowerPoint, TXT, CSV e HTML, e conhecimento escrito direto na plataforma.",
      "Aprendizado governado: feedback 👍/👎 nas respostas, correções, lacunas de conhecimento e aprovação pela área (ou aprendizado automático).",
    ],
  },
  {
    versao: "0.3.0",
    data: "2026-11-23",
    itens: [
      "Plataforma completa no visual aprovado: Meu Painel, Áreas (7), Dashboard Executivo, Calendário 2026, Comitê, Universidade, Gamificação, Assistente, CMS e Configurações.",
      "Por área: metas por marca com faixas de bônus, indicadores, plano de ação (Kanban, Lista e Gantt) com comentários, checklists com score e geração automática de ações, treinamentos com progresso e rotina/régua D-X.",
      "Calendário: nova campanha e geração das atividades da régua D-X no plano de ação de cada área.",
      "Comitê: agenda, pauta por área, ata e encaminhamentos que viram ação no plano da área.",
      "Gamificação com pontos automáticos por execução, níveis, medalhas e ranking.",
      "Usuários com 13 perfis de acesso (RBAC editável), convite por e-mail para definir a senha, lojas e dados de demonstração removíveis.",
    ],
  },
  {
    versao: "0.2.0",
    data: "2026-11-22",
    itens: [
      "Administração: login, primeiro acesso por convite de uso único e área administrativa.",
      "Configuração de e-mail de envio (SMTP) editável pela tela: salvar, enviar teste e remover; senha guardada cifrada.",
    ],
  },
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
