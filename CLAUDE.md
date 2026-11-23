# CLAUDE.md — Academia Milla 360

## 1. O que é
Plataforma **Academia Milla 360** do Grupo Milla (cliente SCA Solutions): sistema operacional de gestão comercial — áreas × marcas, metas e bonificação, plano de ação (Kanban/Lista/Gantt), checklists com evidência, universidade corporativa, calendário comercial com régua D-X, comitê, gamificação, CMS, RBAC e IA corporativa.
Referências de negócio (guias, calendários, protótipo navegável): OneDrive `SCA_Consultoria\Grupo Milla\Comite Comercial\Projeto Academia Milla 360`.

## 2. 🔴 Isolamento
Projeto **novo e isolado**. Não compartilha servidor, banco, storage nem Git com nenhum outro produto (em especial o SIC Courê). Não copie `.env`, segredos ou buckets de outros projetos.

## 3. Stack e estrutura
| Pasta | Stack | Container | Porta interna |
|---|---|---|---|
| `frontend/` | React 19 + Vite 7, servido por nginx | `academiamilla-web` | 80 |
| `backend/` | Node 20 + Express 5 + `pg` | `academiamilla-api` | 3000 |
| banco | PostgreSQL 17 + pgvector + pgcrypto | `postgres` | 5432 (só 127.0.0.1) |

- Rede docker **`proxy`** (externa) liga o Nginx Proxy Manager, os containers do app e o PostgreSQL.
- **Nenhuma porta do app é publicada no servidor.** O acesso externo é só pelo proxy: `app.academiamilla.tech → academiamilla-web:80`, `api.academiamilla.tech → academiamilla-api:3000`.
- Banco: `PGHOST=postgres`, base/usuário `academiamilla`. Senha só no `backend/.env` da VPS (vem de `/root/.credenciais-postgres`).

## 4. Regras
- **Segredos nunca no Git.** `backend/.env` está no `.gitignore`; use `backend/.env.example` como modelo.
- **SQL parametrizado** (`$1, $2...`). Concatenar entrada do usuário em SQL é proibido.
- **Fuso:** servidor, containers e banco em `America/Sao_Paulo`. "Hoje" de regra de negócio sai de `Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' })`, nunca de `toISOString()`.
- **Arquivos** (evidências, materiais, certificados) vão para o R2 privado, servidos por URL temporária assinada — nunca bucket público.
- Textos da interface em **português do Brasil**, UTF-8 sem BOM.
- Correções cirúrgicas: não refatore o que já está homologado.

## 5. Banco, administração e configurações
- **Migrações:** arquivos `backend/db/migrations/NNN_*.sql`, aplicados em ordem no boot da API (`migrar.js`, tabela `schema_migracoes`). Nunca edite uma migração já aplicada: crie a próxima.
- **Administração:** `/entrar`, `/admin`. Usuários na tabela `usuarios` (senha bcrypt, sessão JWT de 8 h). O primeiro administrador é criado por **convite de uso único** gerado na VPS: `docker exec academiamilla-api node scripts/convite-admin.js` (opção 12 do instalar-vps) → link `/primeiro-acesso?token=...` válido por 24 h.
- **Configurações editáveis pela tela** (CRUD na administração), não no `.env`: hoje, **E-mail de envio (SMTP)** — tabela `config_email` (linha única), senha cifrada com `pgp_sym_encrypt` usando o `SESSION_SECRET`; nunca devolvida para o frontend. Envio passa por `backend/lib/email.js` (`enviarEmail`).
- Segredos de infraestrutura (banco, JWT, R2) continuam no `backend/.env`.

## 5.1 Plataforma (0.3.0)
- **Frontend:** as telas da plataforma ficam em `frontend/src/plataforma/` (JS puro, fiel ao protótipo aprovado): `nucleo.js` (estado, API, menu, navegação), `telas-areas.js` (workspace das áreas), `telas-gerais.js` (painel, executivo, calendário, comitê, universidade, gamificação, assistente, CMS), `telas-config.js` (usuários, RBAC, lojas, sistema), `estilo.css`. O React (`pages/Plataforma.jsx`) só monta a casca. Rotas: `/` plataforma, `/entrar`, `/definir-senha`, `/primeiro-acesso`, `/admin/email`, `/status`.
- **Backend:** `routes/plataforma.js` (base, painel, executivo, busca, assistente), `routes/operacao.js` (ações, checklists, metas, indicadores, campanhas, cursos, comitê, conteúdos, gamificação), `routes/usuarios.js` (`/api/gestao`: usuários + convite, perfis, lojas, demo). RBAC em `lib/rbac.js` (tabela `perfis`, níveis 0/1/2 por módulo); pontos em `lib/pontos.js`.
- **Dados de demonstração:** linhas com `demo = TRUE` (migração 003). Removíveis em Configurações → Sistema. Guias, áreas, indicadores, checklists, cursos, lojas e calendário são dados reais de base.
- Todo texto vindo do banco é escapado com `esc()` antes de ir para o HTML.

## 5.2 Guia de supervisão e agentes de IA (0.4.0)
- **Guia de supervisão:** `areas.conteudo` aceita `rotina_loja`, `programacao` (semanas → dias → árvore de tarefas, com `blocos` reutilizáveis via `ref`) e `conversa`. Telas em `frontend/src/plataforma/telas-guia.js`.
- **Checklist estruturado:** `checklist_modelos.estrutura` = `{ escala: 'conformidade'|'comparativa', cabecalho, blocos: [{ nome, peso, area, acao, itens }] }`; `itens` continua sendo a lista achatada. Ao salvar: índice (OK 100 · Atenção 50 · Não 0, só itens avaliados), ponderado por peso, classificação (Destaque ≥ 85 · Estável 70–84 · Atenção 50–69 · Prioridade alta < 50) e ações no plano (Não em bloco de peso 3: 48 h · Não: 7 dias · Atenção: 15 dias; comparativa: concorrente acima → 15 dias).
- **Agentes de IA:** `routes/ia.js` (`/api/ia`) + `lib/ia.js`. Um agente por área (`ia_agentes.codigo` = id da área) e o geral (`geral`). Provedores com chave cifrada (`ia_provedores`, `pgp_sym_encrypt` com `SESSION_SECRET`); adaptadores OpenAI-compatível, Anthropic e Gemini. Sem provedor configurado (ou com erro), o agente responde em **modo busca**.
- **Conhecimento:** arquivos e textos em `ia_documentos` (original no R2 privado quando configurado; senão no banco), divididos em `ia_trechos` e buscados por texto completo (`tsvector` português, texto sem acento). O guia da área vira o documento `origem = 'guia'`, refeito pelo botão "Atualizar guia da área".
- **Aprendizado:** `ia_aprendizados` (correcao, validada, revisao, lacuna, faq, instrucao) com status pendente/aprovado/rejeitado. Aprovados entram no prompt com prioridade sobre as fontes. `aprendizado_auto` aprova correções e validações sem revisão.
- **RBAC:** módulo `ia` (1 usa · 2 configura qualquer agente e cadastra chaves). O usuário com `area_id` configura o agente da própria área.

## 5.3 Universidade (0.5.0)
- **Rotas:** `routes/universidade.js` (`/api/univ`, JSON até 12 MB). Tela `frontend/src/plataforma/telas-univ.js` (+ `univ.css`), importada em `iniciar.js`; substitui `S.telas.univ`, `S.abasArea.treino`, `openCourse` e `meusCertificados`.
- **Dados:** `curso_areas` (curso ↔ N áreas; `cursos.area_id` fica como área principal), `curso_videos` (`tipo` arquivo|youtube|link; arquivo no R2 em `univ/curso-<id>/…`, tocado por URL assinada de 6 h), `curso_video_progresso` (início, posição, tempo assistido, conclusão), `curso_tentativas` (início, fim, respostas, acertos, nota, aprovado), `curso_certificados` (código único por usuário+curso). Prova e gabarito em `cursos.prova` (o gabarito nunca vai ao aluno); modelo do certificado em `cursos.cert_modelo` (bytea) + `cert_config` (posição/tamanho/cor do nome e da linha de informações, em %).
- **Regras:** vídeo concluído no evento de fim do player ou ≥ 90% assistido (links sem evento de fim: botão liberado após 90% da duração). Prova liberada após todos os vídeos, até `tentativas_max`. Curso concluído = todos os vídeos + (prova aprovada, se `exige_prova`) → pontos (`REGRAS.curso`) + certificado. Vídeo concluído dá `REGRAS.aula` uma vez (`pontos.ref = video:<id>`).
- **Gestão:** CMS nível 2 gerencia todos os cursos; o responsável com `area_id` gerencia os cursos ligados à própria área. Upload de vídeo: corpo bruto (`Content-Type: video/*`) enviado em streaming ao R2 (`@aws-sdk/lib-storage`).

## 5.4 Cadastro de áreas (0.6.0)
- **Rotas:** `routes/areas.js` (`/api/cadastro-areas`): listar, criar, editar, `PATCH /:id/ativo`, `PUT /ordem/salvar`. Perfil com `rbac` nível 2 faz tudo; o usuário com `area_id` edita só a identidade da própria área.
- **Dados (migração 007):** `areas.ativo` (inativa = oculta em base, Executivo e busca; nada é apagado; não existe exclusão de área), `areas.abas` (abas visíveis do workspace), `areas.chips` (informações do card). Área nova recebe `conteudo` vazio e o seu `ia_agentes`.
- **Tela:** `frontend/src/plataforma/areas-admin.js` (`go('areasAdm')`, botão "Gerenciar áreas" na tela Áreas). Envolve `openArea`/`switchAreaTab` para respeitar as abas visíveis. Outros módulos de apoio: `marcas.js` (logos das marcas) e `kanban-dnd.js` (arrastar e soltar no Kanban).

## 6. Versão e changelog
Fonte da verdade: o **topo** de `frontend/src/data/changelog.js`. Toda entrega que vai ao ar sobe a versão ali (e em `backend/package.json`). O `deploy.sh` confere se a versão no ar é a mesma do código.

## 7. Deploy
Na VPS (`187.77.254.121`), em `/opt/apps/academiamilla`:
```bash
bash deploy.sh
```
Faz `git pull`, rebuild de `api` e `web` e confere: API + banco respondendo e versão do frontend no ar. **Só avise o cliente depois do ✅ final.**
A VPS acessa o Git por deploy key somente leitura (`git@github-academiamilla:sanderson-auler/academiamilla.git`).

## 8. Infraestrutura
Roteiro completo de implantação, scripts e logs: OneDrive `SCA_Consultoria\Grupo Milla\VPS\Desenvolvimento\academia-milla`.
