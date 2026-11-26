-- 011 — BI: relatórios com dados do DW do Grupo Milla.
-- Primeiro relatório: Simulador de Compras por Faixa de Preço.
-- Cada carga (manual pela tela ou, no futuro, pela rotina Oracle) fica registrada em bi_cargas;
-- só a carga ativa mais recente de cada relatório é usada pelas telas.

CREATE TABLE IF NOT EXISTS bi_cargas (
  id               SERIAL PRIMARY KEY,
  relatorio        TEXT NOT NULL,
  origem           TEXT NOT NULL,                 -- 'manual' (arquivo) | 'oracle' (rotina)
  data_referencia  DATE NOT NULL,                 -- data da carga do DW
  meta             JSONB NOT NULL DEFAULT '{}'::jsonb,
  linhas           INT NOT NULL DEFAULT 0,
  ativa            BOOLEAN NOT NULL DEFAULT TRUE,
  criado_por       INT REFERENCES usuarios(id),
  criado_em        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS bi_cargas_rel_idx ON bi_cargas(relatorio, ativa, criado_em DESC);

-- Grão: linha × grupo × subgrupo × faixa de preço.
-- vendas: { "2025": [qtd, venda, cmv], "2026": [...] } — 1º semestre de cada ano, venda líquida.
CREATE TABLE IF NOT EXISTS bi_compra_faixa (
  carga_id     INT  NOT NULL REFERENCES bi_cargas(id) ON DELETE CASCADE,
  linha        TEXT NOT NULL,
  grupo        TEXT NOT NULL,
  subgrupo     TEXT NOT NULL,
  nivel_preco  INT  NOT NULL,
  faixa_preco  TEXT NOT NULL,
  vendas       JSONB NOT NULL DEFAULT '{}'::jsonb,
  prev_qt      NUMERIC(14,2) NOT NULL DEFAULT 0,   -- previsão de venda até 31/12
  est_qt       NUMERIC(14,2) NOT NULL DEFAULT 0,   -- estoque atual
  est_custo    NUMERIC(16,2) NOT NULL DEFAULT 0,   -- estoque atual a custo
  ped_qt       NUMERIC(14,2) NOT NULL DEFAULT 0,   -- pedidos pendentes
  PRIMARY KEY (carga_id, linha, grupo, subgrupo, nivel_preco)
);

-- Novo módulo de permissão "bi": leitura para todos os perfis, total para quem administra o RBAC.
UPDATE perfis
   SET permissoes = permissoes || jsonb_build_object('bi', CASE WHEN COALESCE((permissoes->>'rbac')::int, 0) >= 2 THEN 2 ELSE 1 END)
 WHERE NOT (permissoes ? 'bi');
