-- 006 — Universidade: cadastro de cursos (ligados a N áreas), vídeos, prova com gabarito,
-- modelo de certificado assinado e trilha completa do aluno (início/fim de cada vídeo,
-- início/fim da prova, nota e certificado emitido).

-- Um curso pode estar em várias áreas (cursos.area_id continua como área principal).
CREATE TABLE IF NOT EXISTS curso_areas (
  curso_id  INT  NOT NULL REFERENCES cursos(id) ON DELETE CASCADE,
  area_id   TEXT NOT NULL REFERENCES areas(id) ON DELETE CASCADE,
  PRIMARY KEY (curso_id, area_id)
);
INSERT INTO curso_areas (curso_id, area_id) SELECT id, area_id FROM cursos ON CONFLICT DO NOTHING;

ALTER TABLE cursos ADD COLUMN IF NOT EXISTS descricao       TEXT;
ALTER TABLE cursos ADD COLUMN IF NOT EXISTS ativo           BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE cursos ADD COLUMN IF NOT EXISTS exige_prova     BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE cursos ADD COLUMN IF NOT EXISTS nota_minima     INT NOT NULL DEFAULT 70;
ALTER TABLE cursos ADD COLUMN IF NOT EXISTS tentativas_max  INT NOT NULL DEFAULT 3;
-- prova: [{ pergunta, opcoes: [..], correta: índice }] — o gabarito nunca vai para o aluno.
ALTER TABLE cursos ADD COLUMN IF NOT EXISTS prova           JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE cursos ADD COLUMN IF NOT EXISTS cert_modelo     BYTEA;
ALTER TABLE cursos ADD COLUMN IF NOT EXISTS cert_tipo       TEXT;
ALTER TABLE cursos ADD COLUMN IF NOT EXISTS cert_config     JSONB;
ALTER TABLE cursos ADD COLUMN IF NOT EXISTS atualizado_em   TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE cursos ADD COLUMN IF NOT EXISTS atualizado_por  TEXT;

-- Vídeos do curso: arquivo no R2 privado, YouTube ou link (Vimeo, Drive, MP4…).
CREATE TABLE IF NOT EXISTS curso_videos (
  id           SERIAL PRIMARY KEY,
  curso_id     INT NOT NULL REFERENCES cursos(id) ON DELETE CASCADE,
  ordem        INT NOT NULL DEFAULT 0,
  titulo       TEXT NOT NULL,
  descricao    TEXT,
  tipo         TEXT NOT NULL,          -- arquivo | youtube | link
  url          TEXT,
  chave_r2     TEXT,
  tamanho      BIGINT,
  duracao_seg  INT,
  criado_em    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS curso_videos_curso_idx ON curso_videos(curso_id, ordem);

-- Trilha do aluno por vídeo.
CREATE TABLE IF NOT EXISTS curso_video_progresso (
  usuario_id     INT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  video_id       INT NOT NULL REFERENCES curso_videos(id) ON DELETE CASCADE,
  iniciado_em    TIMESTAMPTZ NOT NULL DEFAULT now(),
  concluido_em   TIMESTAMPTZ,
  posicao_seg    NUMERIC NOT NULL DEFAULT 0,
  assistido_seg  NUMERIC NOT NULL DEFAULT 0,
  duracao_seg    NUMERIC,
  atualizado_em  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (usuario_id, video_id)
);

ALTER TABLE curso_progresso ADD COLUMN IF NOT EXISTS iniciado_em TIMESTAMPTZ;

-- Provas: cada tentativa com início, fim, respostas, acertos e nota.
CREATE TABLE IF NOT EXISTS curso_tentativas (
  id             SERIAL PRIMARY KEY,
  usuario_id     INT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  curso_id       INT NOT NULL REFERENCES cursos(id) ON DELETE CASCADE,
  iniciado_em    TIMESTAMPTZ NOT NULL DEFAULT now(),
  finalizado_em  TIMESTAMPTZ,
  respostas      JSONB,
  acertos        INT,
  total          INT,
  nota           NUMERIC(5,1),
  aprovado       BOOLEAN
);
CREATE INDEX IF NOT EXISTS curso_tent_idx ON curso_tentativas(curso_id, usuario_id);

-- Certificados emitidos (ficam com o aluno para consulta).
CREATE TABLE IF NOT EXISTS curso_certificados (
  id          SERIAL PRIMARY KEY,
  usuario_id  INT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  curso_id    INT NOT NULL REFERENCES cursos(id) ON DELETE CASCADE,
  codigo      TEXT NOT NULL UNIQUE,
  nome        TEXT NOT NULL,
  nota        NUMERIC(5,1),
  emitido_em  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (usuario_id, curso_id)
);
