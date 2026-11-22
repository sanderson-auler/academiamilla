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

## 5. Versão e changelog
Fonte da verdade: o **topo** de `frontend/src/data/changelog.js`. Toda entrega que vai ao ar sobe a versão ali (e em `backend/package.json`). O `deploy.sh` confere se a versão no ar é a mesma do código.

## 6. Deploy
Na VPS (`187.77.254.121`), em `/opt/apps/academiamilla`:
```bash
bash deploy.sh
```
Faz `git pull`, rebuild de `api` e `web` e confere: API + banco respondendo e versão do frontend no ar. **Só avise o cliente depois do ✅ final.**
A VPS acessa o Git por deploy key somente leitura (`git@github-academiamilla:sanderson-auler/academiamilla.git`).

## 7. Infraestrutura
Roteiro completo de implantação, scripts e logs: OneDrive `SCA_Consultoria\Grupo Milla\VPS\Desenvolvimento\academia-milla`.
