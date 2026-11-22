# Academia Milla 360

Sistema operacional de gestão comercial do **Grupo Milla**: áreas, metas, plano de ação, checklists, universidade corporativa, calendário comercial, comitê, gamificação e IA corporativa.

> Antes de mexer no código, leia o **[`CLAUDE.md`](./CLAUDE.md)** (arquitetura, regras e deploy).

## Stack
- **Frontend:** React 19 + Vite 7 → container `academiamilla-web` (nginx)
- **Backend:** Node 20 + Express 5 → container `academiamilla-api` (porta interna 3000)
- **Banco:** PostgreSQL 17 + pgvector → container `postgres` (mesma VPS)
- **Arquivos:** Cloudflare R2 · bucket privado `academia-milla`

## Endereços
| Ambiente | Endereço |
|---|---|
| Sistema | https://app.academiamilla.tech |
| API | https://api.academiamilla.tech/api/saude |

## Rodar localmente
```bash
# Backend (precisa de um PostgreSQL acessível; ver backend/.env.example)
cd backend && cp .env.example .env && npm install && npm run dev

# Frontend
cd frontend && npm install && npm run dev   # http://localhost:5173
```

## Deploy (na VPS)
```bash
cd /opt/apps/academiamilla && bash deploy.sh
```
O deploy só está concluído quando terminar com **✅ ... versão X no ar**.

## Versão
A fonte da verdade é o topo de [`frontend/src/data/changelog.js`](./frontend/src/data/changelog.js).
