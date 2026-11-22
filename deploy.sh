#!/bin/bash
# deploy.sh — Academia Milla 360
# git pull + rebuild dos containers + CONFERÊNCIA do que está no ar.
# Só avise o cliente depois do ✅ final.
set -e
G='\033[0;32m'; R='\033[0;31m'; Y='\033[1;33m'; N='\033[0m'
RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ETAPA="início"
trap 'echo -e "\n${R}❌ DEPLOY INTERROMPIDO na etapa: ${ETAPA}. O que vem depois NÃO foi atualizado.${N}"' ERR
cd "$RAIZ"

ETAPA="pré-checagem"
[ -f backend/.env ] || { echo -e "${R}❌ backend/.env não encontrado. Rode a instalação (opção 11) ou copie de backend/.env.example.${N}"; exit 1; }

ETAPA="git pull"
echo -e "${Y}🔄 Atualizando o código (git pull)...${N}"
git pull --ff-only
VERSAO="$(grep -m1 -oE 'versao: *"[0-9]+\.[0-9]+\.[0-9]+"' frontend/src/data/changelog.js | grep -oE '[0-9]+\.[0-9]+\.[0-9]+')"
echo -e "${G}   commit: $(git log -1 --format='%h %s')${N}"
echo -e "${G}   versão no código: ${VERSAO:-desconhecida}${N}"

ETAPA="build e subida dos containers"
echo -e "${Y}🚀 Reconstruindo e subindo api e web...${N}"
docker compose build --pull
docker compose up -d --remove-orphans

ETAPA="conferência"
trap - ERR; set +e
echo -e "\n${Y}🔎 Conferindo o que está no ar...${N}"
FALHOU=0
for i in $(seq 1 20); do
  SAUDE="$(docker exec academiamilla-api wget -qO- http://localhost:3000/api/saude 2>/dev/null)"
  [ -n "$SAUDE" ] && break; sleep 2
done
if echo "$SAUDE" | grep -q '"banco":"online"'; then
  echo -e "${G}   ✅ API respondendo e banco conectado.${N}"
else
  echo -e "${R}   ❌ API ou banco sem resposta. Veja: docker logs --tail 50 academiamilla-api${N}"; FALHOU=1
fi
BUNDLE="$(docker exec academiamilla-web wget -qO- http://localhost/ 2>/dev/null | grep -oE 'assets/index-[A-Za-z0-9_-]+\.js' | head -1)"
NO_AR=""
[ -n "$BUNDLE" ] && NO_AR="$(docker exec academiamilla-web wget -qO- "http://localhost/$BUNDLE" 2>/dev/null | grep -m1 -oE 'versao:"[0-9]+\.[0-9]+\.[0-9]+"' | grep -oE '[0-9]+\.[0-9]+\.[0-9]+')"
if [ -z "$NO_AR" ]; then
  echo -e "${R}   ❌ Não consegui ler a versão do frontend no ar. Veja: docker logs --tail 50 academiamilla-web${N}"; FALHOU=1
elif [ "$NO_AR" != "$VERSAO" ]; then
  echo -e "${R}   ❌ Frontend no ar na ${NO_AR}, código na ${VERSAO}. O frontend NÃO foi atualizado.${N}"; FALHOU=1
else
  echo -e "${G}   ✅ Frontend no ar na versão ${NO_AR}.${N}"
fi
docker image prune -f >/dev/null 2>&1
if [ "$FALHOU" -ne 0 ]; then echo -e "\n${R}❌ Deploy terminou COM PROBLEMA — confira os itens acima.${N}"; exit 1; fi
echo -e "\n${G}✅ Deploy Academia Milla 360 concluído e conferido: versão ${NO_AR} no ar.${N}"
echo -e "${G}   app: https://app.academiamilla.tech · api: https://api.academiamilla.tech/api/saude${N}"
