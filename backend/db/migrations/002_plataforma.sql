-- 002 — Plataforma Academia Milla 360: perfis (RBAC), marcas, lojas, áreas,
-- indicadores, metas, plano de ação, checklists, calendário, universidade,
-- gamificação, comitê e conteúdos (CMS).
-- Linhas com demo = TRUE são carga inicial de demonstração e podem ser
-- removidas pela administração (Configurações → Dados de demonstração).

-- ---------- Perfis de acesso (RBAC) ----------
-- permissoes: { modulo: 0 sem acesso | 1 leitura | 2 total }
-- módulos: exec, areas, cal, acao, comite, check, cms, rbac
CREATE TABLE IF NOT EXISTS perfis (
  codigo      TEXT PRIMARY KEY,
  nome        TEXT NOT NULL,
  ordem       INT  NOT NULL DEFAULT 0,
  permissoes  JSONB NOT NULL
);

-- ---------- Marcas e lojas ----------
CREATE TABLE IF NOT EXISTS marcas (
  codigo  TEXT PRIMARY KEY,
  cor     TEXT NOT NULL,
  ordem   INT  NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS lojas (
  id      SERIAL PRIMARY KEY,
  nome    TEXT NOT NULL,
  marca   TEXT NOT NULL REFERENCES marcas(codigo),
  cidade  TEXT,
  ativa   BOOLEAN NOT NULL DEFAULT TRUE
);

-- ---------- Áreas ----------
-- conteudo: { pilares, rotina, fases, videos, modelos, meta_padrao }
CREATE TABLE IF NOT EXISTS areas (
  id        TEXT PRIMARY KEY,
  nome      TEXT NOT NULL,
  resp      TEXT,
  cargo     TEXT,
  cor       TEXT NOT NULL,
  grad      TEXT NOT NULL,
  ic        TEXT NOT NULL,
  tag       TEXT,
  papel     TEXT,
  ordem     INT  NOT NULL DEFAULT 0,
  conteudo  JSONB NOT NULL DEFAULT '{}'::jsonb
);

-- ---------- Usuários: vínculo com área, marca, loja e perfil ----------
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS cargo   TEXT;
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS area_id TEXT REFERENCES areas(id);
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS marca   TEXT REFERENCES marcas(codigo);
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS loja_id INT  REFERENCES lojas(id);
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS demo    BOOLEAN NOT NULL DEFAULT FALSE;

-- Convite de definição de senha para usuários criados pela administração.
CREATE TABLE IF NOT EXISTS convites_usuario (
  id          SERIAL PRIMARY KEY,
  usuario_id  INT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  token_hash  TEXT NOT NULL UNIQUE,
  expira_em   TIMESTAMPTZ NOT NULL,
  usado_em    TIMESTAMPTZ,
  criado_em   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------- Indicadores da área ----------
CREATE TABLE IF NOT EXISTS indicadores (
  id         SERIAL PRIMARY KEY,
  area_id    TEXT NOT NULL REFERENCES areas(id) ON DELETE CASCADE,
  ordem      INT  NOT NULL DEFAULT 0,
  nome       TEXT NOT NULL,
  valor      TEXT NOT NULL,
  variacao   TEXT,
  positivo   BOOLEAN NOT NULL DEFAULT TRUE,
  serie      JSONB NOT NULL DEFAULT '[]'::jsonb,
  atualizado_em  TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_por INT REFERENCES usuarios(id)
);

-- ---------- Metas por área × marca (alimentam bônus e pontos) ----------
CREATE TABLE IF NOT EXISTS metas (
  id           SERIAL PRIMARY KEY,
  area_id      TEXT NOT NULL REFERENCES areas(id) ON DELETE CASCADE,
  marca        TEXT NOT NULL REFERENCES marcas(codigo),
  periodo      TEXT NOT NULL,
  indicador    TEXT NOT NULL,
  unidade      TEXT NOT NULL CHECK (unidade IN ('R$', '%', 'un')),
  meta         NUMERIC(14,2) NOT NULL CHECK (meta > 0),
  realizado    NUMERIC(14,2) NOT NULL DEFAULT 0,
  peso         TEXT,
  responsavel  TEXT,
  pontuada     INT NOT NULL DEFAULT 0,          -- pontos já creditados por esta meta
  demo         BOOLEAN NOT NULL DEFAULT FALSE,
  criado_por   INT REFERENCES usuarios(id),
  criado_em    TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (area_id, marca, periodo, indicador)
);

-- ---------- Plano de ação ----------
CREATE TABLE IF NOT EXISTS acoes (
  id              SERIAL PRIMARY KEY,
  area_id         TEXT NOT NULL REFERENCES areas(id) ON DELETE CASCADE,
  titulo          TEXT NOT NULL,
  descricao       TEXT,
  status          TEXT NOT NULL DEFAULT 'A fazer'
                  CHECK (status IN ('A fazer', 'Em andamento', 'Em revisão', 'Concluído')),
  prioridade      TEXT NOT NULL DEFAULT 'Média' CHECK (prioridade IN ('Alta', 'Média', 'Baixa')),
  marca           TEXT,
  responsavel     TEXT,
  responsavel_id  INT REFERENCES usuarios(id),
  inicio          DATE NOT NULL DEFAULT CURRENT_DATE,
  prazo           DATE,
  origem          TEXT,
  concluido_em    TIMESTAMPTZ,
  demo            BOOLEAN NOT NULL DEFAULT FALSE,
  criado_por      INT REFERENCES usuarios(id),
  criado_em       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS acoes_area_idx ON acoes(area_id, status);

CREATE TABLE IF NOT EXISTS acao_comentarios (
  id          SERIAL PRIMARY KEY,
  acao_id     INT NOT NULL REFERENCES acoes(id) ON DELETE CASCADE,
  usuario_id  INT REFERENCES usuarios(id),
  autor       TEXT NOT NULL,
  texto       TEXT NOT NULL,
  criado_em   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------- Checklists ----------
CREATE TABLE IF NOT EXISTS checklist_modelos (
  id        SERIAL PRIMARY KEY,
  area_id   TEXT NOT NULL REFERENCES areas(id) ON DELETE CASCADE,
  nome      TEXT NOT NULL,
  itens     JSONB NOT NULL,
  ordem     INT NOT NULL DEFAULT 0,
  ativo     BOOLEAN NOT NULL DEFAULT TRUE
);

-- respostas: [{ s: 'ok'|'warn'|'no'|'', obs: '' }]
CREATE TABLE IF NOT EXISTS checklist_aplicacoes (
  id          SERIAL PRIMARY KEY,
  modelo_id   INT NOT NULL REFERENCES checklist_modelos(id) ON DELETE CASCADE,
  area_id     TEXT NOT NULL REFERENCES areas(id) ON DELETE CASCADE,
  loja_id     INT REFERENCES lojas(id),
  marca       TEXT,
  usuario_id  INT REFERENCES usuarios(id),
  respostas   JSONB NOT NULL,
  score       INT NOT NULL,
  qtd_ok      INT NOT NULL DEFAULT 0,
  qtd_atencao INT NOT NULL DEFAULT 0,
  qtd_nc      INT NOT NULL DEFAULT 0,
  observacao  TEXT,
  demo        BOOLEAN NOT NULL DEFAULT FALSE,
  criado_em   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS chk_apl_area_idx ON checklist_aplicacoes(area_id, criado_em DESC);

-- ---------- Calendário comercial ----------
CREATE TABLE IF NOT EXISTS campanhas (
  id      SERIAL PRIMARY KEY,
  marca   TEXT NOT NULL REFERENCES marcas(codigo),
  nome    TEXT NOT NULL,
  inicio  DATE NOT NULL,
  fim     DATE NOT NULL,
  CHECK (fim >= inicio)
);
CREATE INDEX IF NOT EXISTS campanhas_marca_idx ON campanhas(marca, inicio);

-- ---------- Universidade ----------
CREATE TABLE IF NOT EXISTS cursos (
  id       SERIAL PRIMARY KEY,
  area_id  TEXT NOT NULL REFERENCES areas(id) ON DELETE CASCADE,
  titulo   TEXT NOT NULL,
  aulas    INT  NOT NULL DEFAULT 6,
  duracao  TEXT,
  ordem    INT  NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS curso_progresso (
  usuario_id     INT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  curso_id       INT NOT NULL REFERENCES cursos(id) ON DELETE CASCADE,
  aulas_feitas   INT NOT NULL DEFAULT 0,
  concluido_em   TIMESTAMPTZ,
  atualizado_em  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (usuario_id, curso_id)
);

-- ---------- Gamificação ----------
CREATE TABLE IF NOT EXISTS pontos (
  id          SERIAL PRIMARY KEY,
  usuario_id  INT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  pontos      INT NOT NULL,
  motivo      TEXT NOT NULL,
  ref         TEXT,
  demo        BOOLEAN NOT NULL DEFAULT FALSE,
  criado_em   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS pontos_usuario_idx ON pontos(usuario_id);

-- ---------- Comitê comercial ----------
-- pauta: [{ item, area }]
CREATE TABLE IF NOT EXISTS comite_reunioes (
  id          SERIAL PRIMARY KEY,
  titulo      TEXT NOT NULL,
  data        TIMESTAMPTZ NOT NULL,
  presidente  TEXT,
  status      TEXT NOT NULL DEFAULT 'Agendada' CHECK (status IN ('Agendada', 'Realizada')),
  pauta       JSONB NOT NULL DEFAULT '[]'::jsonb,
  ata         TEXT,
  participantes TEXT,
  demo        BOOLEAN NOT NULL DEFAULT FALSE,
  criado_por  INT REFERENCES usuarios(id),
  criado_em   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS comite_encaminhamentos (
  id           SERIAL PRIMARY KEY,
  reuniao_id   INT NOT NULL REFERENCES comite_reunioes(id) ON DELETE CASCADE,
  texto        TEXT NOT NULL,
  area_id      TEXT REFERENCES areas(id),
  responsavel  TEXT,
  prazo        DATE,
  status       TEXT NOT NULL DEFAULT 'Pendente' CHECK (status IN ('Pendente', 'Em curso', 'Concluído')),
  demo         BOOLEAN NOT NULL DEFAULT FALSE,
  criado_em    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------- Conteúdos (CMS) ----------
CREATE TABLE IF NOT EXISTS conteudos (
  id            SERIAL PRIMARY KEY,
  titulo        TEXT NOT NULL,
  tipo          TEXT NOT NULL CHECK (tipo IN ('Comunicado', 'Banner', 'Página', 'Notícia')),
  area_id       TEXT REFERENCES areas(id),
  corpo         TEXT,
  status        TEXT NOT NULL DEFAULT 'Rascunho' CHECK (status IN ('Publicado', 'Rascunho')),
  demo          BOOLEAN NOT NULL DEFAULT FALSE,
  criado_por    INT REFERENCES usuarios(id),
  criado_em     TIMESTAMPTZ NOT NULL DEFAULT now(),
  publicado_em  TIMESTAMPTZ
);
