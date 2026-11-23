-- 008 — Comitê Comercial: reunião completa (transcrição, ata no modelo executivo) e plano de ação em checklist,
-- com encaminhamento de cada item para o plano de ação (Kanban) da área.
ALTER TABLE comite_reunioes DROP CONSTRAINT IF EXISTS comite_reunioes_status_check;
ALTER TABLE comite_reunioes ADD CONSTRAINT comite_reunioes_status_check CHECK (status IN ('Agendada', 'Realizada', 'Cancelada'));
ALTER TABLE comite_reunioes ADD COLUMN IF NOT EXISTS fim                TIMESTAMPTZ;
ALTER TABLE comite_reunioes ADD COLUMN IF NOT EXISTS local              TEXT;
ALTER TABLE comite_reunioes ADD COLUMN IF NOT EXISTS conducao           TEXT;
ALTER TABLE comite_reunioes ADD COLUMN IF NOT EXISTS registro           TEXT;
ALTER TABLE comite_reunioes ADD COLUMN IF NOT EXISTS ausencias          TEXT;
ALTER TABLE comite_reunioes ADD COLUMN IF NOT EXISTS subtitulo          TEXT;
ALTER TABLE comite_reunioes ADD COLUMN IF NOT EXISTS transcricao        TEXT;
ALTER TABLE comite_reunioes ADD COLUMN IF NOT EXISTS transcricao_origem TEXT;
-- Ata estruturada: { documentos, resumo:[{tema,texto}], diretrizes:[...], observacoes }
ALTER TABLE comite_reunioes ADD COLUMN IF NOT EXISTS ata_json           JSONB;
ALTER TABLE comite_reunioes ADD COLUMN IF NOT EXISTS ata_gerada_em      TIMESTAMPTZ;
ALTER TABLE comite_reunioes ADD COLUMN IF NOT EXISTS ata_gerada_por     TEXT;
ALTER TABLE comite_reunioes ADD COLUMN IF NOT EXISTS atualizado_em      TIMESTAMPTZ;
ALTER TABLE comite_reunioes ADD COLUMN IF NOT EXISTS atualizado_por     TEXT;

-- Plano de ação da reunião (checklist). Ao encaminhar, vira ação no Kanban da área (acao_id) e o status acompanha a área.
CREATE TABLE IF NOT EXISTS comite_itens (
  id               SERIAL PRIMARY KEY,
  reuniao_id       INT  NOT NULL REFERENCES comite_reunioes(id) ON DELETE CASCADE,
  ordem            INT  NOT NULL DEFAULT 0,
  acao             TEXT NOT NULL,
  objetivo         TEXT,
  area_id          TEXT REFERENCES areas(id),
  responsavel      TEXT,
  responsavel_id   INT  REFERENCES usuarios(id) ON DELETE SET NULL,
  inicio           DATE,
  prazo            DATE,
  prazo_texto      TEXT,
  status           TEXT NOT NULL DEFAULT 'Aberta' CHECK (status IN ('Aberta', 'Em andamento', 'Concluída', 'Cancelada', 'Agendada')),
  acao_id          INT  REFERENCES acoes(id) ON DELETE SET NULL,
  encaminhado_em   TIMESTAMPTZ,
  concluido_em     TIMESTAMPTZ,
  demo             BOOLEAN NOT NULL DEFAULT FALSE,
  criado_em        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS comite_itens_reuniao_idx ON comite_itens(reuniao_id, ordem);

-- Encaminhamentos já registrados passam para o novo plano de ação.
INSERT INTO comite_itens (reuniao_id, ordem, acao, area_id, responsavel, prazo, status, concluido_em, demo, criado_em)
SELECT e.reuniao_id, ROW_NUMBER() OVER (PARTITION BY e.reuniao_id ORDER BY e.id), e.texto, e.area_id, e.responsavel, e.prazo,
       CASE e.status WHEN 'Concluído' THEN 'Concluída' WHEN 'Em curso' THEN 'Em andamento' ELSE 'Aberta' END,
       CASE WHEN e.status = 'Concluído' THEN e.criado_em END, e.demo, e.criado_em
  FROM comite_encaminhamentos e
 WHERE NOT EXISTS (SELECT 1 FROM comite_itens i WHERE i.reuniao_id = e.reuniao_id AND i.acao = e.texto);
