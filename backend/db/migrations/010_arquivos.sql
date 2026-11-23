-- 0.9.0 · Arquivos: anexos em ações, checklists salvos, reuniões do comitê e direto na área.
-- Exclusão é lógica (excluido_em): nada se perde e o arquivo pode ser restaurado.
CREATE TABLE IF NOT EXISTS arquivos (
  id              SERIAL PRIMARY KEY,
  area_id         TEXT REFERENCES areas(id) ON DELETE SET NULL,   -- NULL = geral (ex.: Comitê)
  origem_tipo     TEXT NOT NULL,                                   -- acao | checklist | comite | area
  origem_id       TEXT,
  origem_titulo   TEXT,
  nome            TEXT NOT NULL,
  descricao       TEXT,
  mime            TEXT,
  tamanho         BIGINT,
  chave_r2        TEXT,
  conteudo        BYTEA,                                           -- só quando o R2 não está configurado
  enviado_por     INT REFERENCES usuarios(id) ON DELETE SET NULL,
  enviado_por_nome TEXT,
  criado_em       TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em   TIMESTAMPTZ,
  atualizado_por  TEXT,
  excluido_em     TIMESTAMPTZ,
  excluido_por    TEXT
);
CREATE INDEX IF NOT EXISTS arquivos_area_idx ON arquivos(area_id, criado_em DESC);
CREATE INDEX IF NOT EXISTS arquivos_origem_idx ON arquivos(origem_tipo, origem_id);

-- Nova aba "Arquivos" visível em todas as áreas (e no padrão de áreas novas).
ALTER TABLE areas ALTER COLUMN abas SET DEFAULT '["visao","kpis","metas","acao","check","treino","rotina","guia","ia","arquivos"]'::jsonb;
UPDATE areas SET abas = abas || '["arquivos"]'::jsonb WHERE NOT abas ? 'arquivos';
