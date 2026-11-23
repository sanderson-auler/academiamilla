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
