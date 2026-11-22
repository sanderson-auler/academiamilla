-- 001 — Usuários administradores, convite de primeiro acesso e configuração de e-mail (SMTP).
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS usuarios (
  id             SERIAL PRIMARY KEY,
  nome           TEXT        NOT NULL,
  email          TEXT        NOT NULL UNIQUE,
  senha_hash     TEXT        NOT NULL,
  perfil         TEXT        NOT NULL DEFAULT 'admin',
  ativo          BOOLEAN     NOT NULL DEFAULT TRUE,
  criado_em      TIMESTAMPTZ NOT NULL DEFAULT now(),
  ultimo_acesso  TIMESTAMPTZ
);

-- Convite de uso único para criar um administrador (gerado na VPS pela opção 12).
CREATE TABLE IF NOT EXISTS convites_admin (
  id          SERIAL PRIMARY KEY,
  token_hash  TEXT        NOT NULL UNIQUE,
  expira_em   TIMESTAMPTZ NOT NULL,
  usado_em    TIMESTAMPTZ,
  usado_por   INT REFERENCES usuarios(id),
  criado_em   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Configuração única do envio de e-mail. A senha fica cifrada (pgcrypto) e
-- nunca é devolvida para a tela.
CREATE TABLE IF NOT EXISTS config_email (
  id               SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  host             TEXT    NOT NULL,
  porta            INT     NOT NULL CHECK (porta BETWEEN 1 AND 65535),
  seguranca        TEXT    NOT NULL CHECK (seguranca IN ('ssl', 'starttls', 'nenhuma')),
  usuario          TEXT,
  senha_cifrada    BYTEA,
  remetente_nome   TEXT    NOT NULL,
  remetente_email  TEXT    NOT NULL,
  atualizado_em    TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_por   INT REFERENCES usuarios(id)
);
