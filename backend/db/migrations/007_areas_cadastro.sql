-- 007 — Cadastro de áreas: ativar/desativar (sem apagar nada), abas visíveis e chips do card.
ALTER TABLE areas ADD COLUMN IF NOT EXISTS ativo          BOOLEAN NOT NULL DEFAULT TRUE;
-- Abas exibidas no workspace da área (o conteúdo de abas ocultas continua guardado).
ALTER TABLE areas ADD COLUMN IF NOT EXISTS abas           JSONB NOT NULL DEFAULT '["visao","kpis","metas","acao","check","treino","rotina","guia","ia"]'::jsonb;
-- Chips do card da área na tela Áreas.
ALTER TABLE areas ADD COLUMN IF NOT EXISTS chips          JSONB NOT NULL DEFAULT '["metas","kpis","check","cursos"]'::jsonb;
ALTER TABLE areas ADD COLUMN IF NOT EXISTS criado_em      TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE areas ADD COLUMN IF NOT EXISTS atualizado_em  TIMESTAMPTZ;
ALTER TABLE areas ADD COLUMN IF NOT EXISTS atualizado_por TEXT;
