-- 005 — Assistente Milla: um agente de IA por área (+ o Assistente Milla geral).
-- Cada agente tem identidade, comportamento, provedor/modelo, base de conhecimento
-- (arquivos e textos escritos pela área) e aprendizado governado (feedback, correções e lacunas).
-- Chaves de API ficam cifradas no banco (pgp_sym_encrypt com o SESSION_SECRET), uma por provedor.

-- ---------- RBAC: novo módulo "ia" (1 usa o assistente · 2 configura qualquer agente) ----------
-- O responsável de uma área (usuarios.area_id) também configura o agente da própria área.
UPDATE perfis
   SET permissoes = permissoes || jsonb_build_object('ia', CASE WHEN codigo IN ('admin', 'consultor', 'diretor') THEN 2 ELSE 1 END)
 WHERE NOT permissoes ? 'ia';

-- ---------- Provedores de IA (chave compartilhada pelos agentes) ----------
CREATE TABLE IF NOT EXISTS ia_provedores (
  codigo          TEXT PRIMARY KEY,
  chave_cifrada   BYTEA,
  chave_final     TEXT,            -- últimos 4 caracteres, só para exibição
  base_url        TEXT,            -- usado por provedores compatíveis/locais
  atualizado_em   TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_por  TEXT
);

-- ---------- Agentes ----------
CREATE TABLE IF NOT EXISTS ia_agentes (
  id                SERIAL PRIMARY KEY,
  codigo            TEXT NOT NULL UNIQUE,                    -- 'geral' ou o id da área
  area_id           TEXT REFERENCES areas(id) ON DELETE CASCADE,
  nome              TEXT NOT NULL,
  descricao         TEXT,
  saudacao          TEXT,
  sugestoes         JSONB NOT NULL DEFAULT '[]'::jsonb,
  tom               TEXT NOT NULL DEFAULT 'consultiva',
  tracos            JSONB NOT NULL DEFAULT '{}'::jsonb,
  formato           TEXT NOT NULL DEFAULT 'equilibrado',
  instrucoes        TEXT,
  restricoes        JSONB NOT NULL DEFAULT '[]'::jsonb,
  encaminhamentos   JSONB NOT NULL DEFAULT '[]'::jsonb,      -- [[tema, para quem]]
  provedor          TEXT,
  modelo            TEXT,
  temperatura       NUMERIC(3,2) NOT NULL DEFAULT 0.40,
  max_tokens        INT NOT NULL DEFAULT 1200,
  ativo             BOOLEAN NOT NULL DEFAULT TRUE,           -- IA generativa habilitada
  usar_guia         BOOLEAN NOT NULL DEFAULT TRUE,           -- usa o guia da área cadastrado na plataforma
  aprendizado_auto  BOOLEAN NOT NULL DEFAULT FALSE,          -- correções entram sem aprovação
  atualizado_em     TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_por    TEXT
);

-- ---------- Base de conhecimento ----------
CREATE TABLE IF NOT EXISTS ia_documentos (
  id            SERIAL PRIMARY KEY,
  agente_id     INT NOT NULL REFERENCES ia_agentes(id) ON DELETE CASCADE,
  titulo        TEXT NOT NULL,
  origem        TEXT NOT NULL,          -- arquivo | texto | guia
  tipo          TEXT,                   -- pdf, docx, xlsx…
  tamanho       INT,
  arquivo       BYTEA,                  -- original, quando o R2 não está configurado
  chave_r2      TEXT,                   -- original no R2 privado
  texto         TEXT,
  trechos       INT NOT NULL DEFAULT 0,
  ativo         BOOLEAN NOT NULL DEFAULT TRUE,
  enviado_por   TEXT,
  criado_em     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ia_doc_agente_idx ON ia_documentos(agente_id);

-- Trechos indexados para busca (texto normalizado sem acento em "busca").
CREATE TABLE IF NOT EXISTS ia_trechos (
  id            SERIAL PRIMARY KEY,
  documento_id  INT NOT NULL REFERENCES ia_documentos(id) ON DELETE CASCADE,
  agente_id     INT NOT NULL REFERENCES ia_agentes(id) ON DELETE CASCADE,
  ordem         INT NOT NULL,
  texto         TEXT NOT NULL,
  busca         TEXT NOT NULL,
  tsv           TSVECTOR GENERATED ALWAYS AS (to_tsvector('portuguese', busca)) STORED
);
CREATE INDEX IF NOT EXISTS ia_trechos_tsv_idx ON ia_trechos USING GIN (tsv);
CREATE INDEX IF NOT EXISTS ia_trechos_agente_idx ON ia_trechos(agente_id);

-- ---------- Conversas ----------
CREATE TABLE IF NOT EXISTS ia_conversas (
  id          SERIAL PRIMARY KEY,
  agente_id   INT NOT NULL REFERENCES ia_agentes(id) ON DELETE CASCADE,
  usuario_id  INT REFERENCES usuarios(id) ON DELETE SET NULL,
  titulo      TEXT,
  criado_em   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ia_mensagens (
  id                   SERIAL PRIMARY KEY,
  conversa_id          INT NOT NULL REFERENCES ia_conversas(id) ON DELETE CASCADE,
  agente_id            INT NOT NULL REFERENCES ia_agentes(id) ON DELETE CASCADE,
  papel                TEXT NOT NULL,           -- user | assistant
  conteudo             TEXT NOT NULL,
  fontes               JSONB NOT NULL DEFAULT '[]'::jsonb,
  modo                 TEXT,                    -- ia | busca
  provedor             TEXT,
  modelo               TEXT,
  tokens_entrada       INT,
  tokens_saida         INT,
  duracao_ms           INT,
  feedback             SMALLINT,                -- 1 útil · -1 não ajudou
  feedback_comentario  TEXT,
  criado_em            TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ia_msg_agente_idx ON ia_mensagens(agente_id, criado_em DESC);

-- ---------- Aprendizado governado ----------
-- tipo: correcao (resposta corrigida pelo usuário) · validada (resposta marcada como útil)
--       lacuna (pergunta sem base de conhecimento) · instrucao (regra escrita pela área)
CREATE TABLE IF NOT EXISTS ia_aprendizados (
  id            SERIAL PRIMARY KEY,
  agente_id     INT NOT NULL REFERENCES ia_agentes(id) ON DELETE CASCADE,
  tipo          TEXT NOT NULL,
  pergunta      TEXT,
  conteudo      TEXT,
  mensagem_id   INT REFERENCES ia_mensagens(id) ON DELETE SET NULL,
  status        TEXT NOT NULL DEFAULT 'pendente',   -- pendente | aprovado | rejeitado
  criado_por    TEXT,
  revisado_por  TEXT,
  criado_em     TIMESTAMPTZ NOT NULL DEFAULT now(),
  revisado_em   TIMESTAMPTZ,
  busca         TEXT NOT NULL DEFAULT '',
  tsv           TSVECTOR GENERATED ALWAYS AS (to_tsvector('portuguese', busca)) STORED
);
CREATE INDEX IF NOT EXISTS ia_apr_agente_idx ON ia_aprendizados(agente_id, status);
CREATE INDEX IF NOT EXISTS ia_apr_tsv_idx ON ia_aprendizados USING GIN (tsv);

-- ---------- Agentes iniciais: Assistente Milla (geral) + um por área ----------
INSERT INTO ia_agentes (codigo, area_id, nome, descricao, saudacao, sugestoes, tom, tracos, instrucoes, restricoes, encaminhamentos)
VALUES ('geral', NULL, 'Assistente Milla',
        'Assistente corporativo da Academia Milla 360: conhece os guias, rotinas, checklists e o calendário comercial de todas as áreas.',
        'Olá! Sou o Assistente Milla. Pergunte sobre rotinas, checklists, metas, campanhas ou qualquer área do Grupo Milla.',
        '["Qual a rotina diária do supervisor comercial?","Como funciona a régua D-X de uma campanha?","O que avaliar numa visita à loja?","Como montar o OTB?"]'::jsonb,
        'consultiva', '{"acolhedora":70,"objetiva":80,"didatica":80,"proativa":70,"empatica":70,"persistente":60}'::jsonb,
        'Ajude os colaboradores do Grupo Milla a executar a rotina comercial com disciplina. Indique sempre a área responsável e, quando fizer sentido, o próximo passo prático.',
        '["Não inventar números, metas ou resultados que não estejam nas fontes.","Não criar condições comerciais, descontos ou prazos.","Não compartilhar dados pessoais de clientes ou colaboradores."]'::jsonb,
        '[["Questões trabalhistas, férias e afastamentos","RH / DP"],["Dúvidas sobre metas e bônus individuais","Gerente da área"]]'::jsonb)
ON CONFLICT (codigo) DO NOTHING;

INSERT INTO ia_agentes (codigo, area_id, nome, descricao, saudacao, sugestoes, tom, tracos, instrucoes, restricoes, encaminhamentos)
SELECT a.id, a.id, 'IA · ' || a.nome,
       'Agente da área ' || a.nome || ': responde com base no guia da área e nos conteúdos publicados por ' || COALESCE(a.resp, 'responsável') || '.',
       'Olá! Sou a IA da ' || a.nome || '. Posso ajudar com rotina, checklists, metas, plano de ação e campanhas da área.',
       COALESCE((SELECT jsonb_agg(x) FROM (
           SELECT 'Qual a rotina diária da ' || a.nome || '?' AS x
           UNION ALL SELECT 'Quais são os pilares da área?'
           UNION ALL SELECT 'O que verificar no checklist ' || (SELECT m.nome FROM checklist_modelos m WHERE m.area_id = a.id AND m.ativo ORDER BY m.ordem LIMIT 1) || '?'
           UNION ALL SELECT 'O que a área faz antes de uma campanha?') s WHERE x IS NOT NULL), '[]'::jsonb),
       'consultiva', '{"acolhedora":70,"objetiva":80,"didatica":80,"proativa":70,"empatica":70,"persistente":60}'::jsonb,
       'Você apoia o time de ' || a.nome || ' (' || COALESCE(a.cargo, 'responsável') || ': ' || COALESCE(a.resp, '—') || '). Papel da área: ' || COALESCE(a.papel, '') ||
       ' Responda de forma prática, com passos claros, e conecte a resposta aos indicadores e à rotina da área.',
       '["Não inventar números, metas ou resultados que não estejam nas fontes.","Não criar condições comerciais, descontos ou prazos.","Não compartilhar dados pessoais de clientes ou colaboradores."]'::jsonb,
       '[["Questões trabalhistas, férias e afastamentos","RH / DP"]]'::jsonb
  FROM areas a
ON CONFLICT (codigo) DO NOTHING;

-- Sugestões específicas da Supervisão Comercial (guia de supervisão de loja).
UPDATE ia_agentes
   SET sugestoes = '["O que faço na 1ª semana do mês?","Como conduzir a conversa com o gerente?","Quais blocos pesam mais no checklist de visita à loja?","O que observar na visita à concorrência?"]'::jsonb
 WHERE codigo = 'comercial';
