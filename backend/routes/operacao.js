// Rotas operacionais da plataforma: plano de ação, checklists, metas, indicadores,
// calendário, universidade, comitê, conteúdos (CMS) e gamificação.
const { Router } = require('express');
const { pool } = require('../db');
const { exigirLogin } = require('../lib/auth');
const { pode, permissoesDe } = require('../lib/rbac');
const { REGRAS, NIVEIS, nivel, creditar, totalDe } = require('../lib/pontos');

const r = Router();
r.use(exigirLogin);

const txt = (v, max = 500) => String(v ?? '').trim().slice(0, max);
const dataOuNull = v => (/^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) ? v : null);
const hojeSP = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
async function nomeUsuario(id) { const { rows } = await pool.query('SELECT nome FROM usuarios WHERE id = $1', [id]); return rows[0]?.nome || 'Usuário'; }
async function areaExiste(id) { const { rowCount } = await pool.query('SELECT 1 FROM areas WHERE id = $1', [id]); return rowCount > 0; }

// ======================= PLANO DE AÇÃO =======================
const STATUS = ['A fazer', 'Em andamento', 'Em revisão', 'Concluído'];
const PRIOR = ['Alta', 'Média', 'Baixa'];

r.get('/acoes', pode('areas', 1), async (req, res) => {
  const p = []; const w = [];
  if (req.query.area) { p.push(req.query.area); w.push(`a.area_id = $${p.length}`); }
  if (req.query.marca && req.query.marca !== 'Todas') { p.push(req.query.marca); w.push(`(a.marca = $${p.length} OR a.marca IS NULL)`); }
  const { rows } = await pool.query(
    `SELECT a.*, ar.nome AS area_nome, (SELECT COUNT(*)::int FROM acao_comentarios c WHERE c.acao_id = a.id) AS comentarios
       FROM acoes a JOIN areas ar ON ar.id = a.area_id ${w.length ? 'WHERE ' + w.join(' AND ') : ''}
      ORDER BY CASE a.status WHEN 'Concluído' THEN 1 ELSE 0 END, a.prazo NULLS LAST, a.id`, p);
  res.json(rows);
});

r.get('/acoes/:id', pode('areas', 1), async (req, res) => {
  const { rows } = await pool.query('SELECT a.*, ar.nome AS area_nome FROM acoes a JOIN areas ar ON ar.id = a.area_id WHERE a.id = $1', [req.params.id]);
  if (!rows[0]) return res.status(404).json({ erro: 'Ação não encontrada.' });
  const com = await pool.query('SELECT id, autor, texto, criado_em FROM acao_comentarios WHERE acao_id = $1 ORDER BY criado_em', [req.params.id]);
  res.json({ ...rows[0], comentarios: com.rows });
});

r.post('/acoes', pode('acao', 1), async (req, res) => {
  const b = req.body || {};
  const titulo = txt(b.titulo, 200);
  if (!titulo) return res.status(400).json({ erro: 'Informe o título da ação.' });
  if (!(await areaExiste(b.area_id))) return res.status(400).json({ erro: 'Área inválida.' });
  const status = STATUS.includes(b.status) ? b.status : 'A fazer';
  const { rows } = await pool.query(
    `INSERT INTO acoes (area_id, titulo, descricao, status, prioridade, marca, responsavel, inicio, prazo, origem, criado_por)
     VALUES ($1,$2,$3,$4,$5,$6,$7,COALESCE($8::date, CURRENT_DATE),$9,$10,$11) RETURNING *`,
    [b.area_id, titulo, txt(b.descricao, 2000) || null, status, PRIOR.includes(b.prioridade) ? b.prioridade : 'Média',
     b.marca && b.marca !== 'Todas' ? txt(b.marca, 40) : null, txt(b.responsavel, 120) || await nomeUsuario(req.usuario.sub),
     dataOuNull(b.inicio), dataOuNull(b.prazo), txt(b.origem, 120) || null, req.usuario.sub]);
  res.status(201).json(rows[0]);
});

r.patch('/acoes/:id', pode('acao', 1), async (req, res) => {
  const { rows: [a] } = await pool.query('SELECT * FROM acoes WHERE id = $1', [req.params.id]);
  if (!a) return res.status(404).json({ erro: 'Ação não encontrada.' });
  const b = req.body || {};
  const novo = {
    titulo: b.titulo !== undefined ? txt(b.titulo, 200) || a.titulo : a.titulo,
    descricao: b.descricao !== undefined ? txt(b.descricao, 2000) : a.descricao,
    status: STATUS.includes(b.status) ? b.status : a.status,
    prioridade: PRIOR.includes(b.prioridade) ? b.prioridade : a.prioridade,
    marca: b.marca !== undefined ? (b.marca && b.marca !== 'Todas' ? txt(b.marca, 40) : null) : a.marca,
    responsavel: b.responsavel !== undefined ? txt(b.responsavel, 120) : a.responsavel,
    prazo: b.prazo !== undefined ? dataOuNull(b.prazo) : a.prazo,
  };
  const concluindo = novo.status === 'Concluído' && a.status !== 'Concluído';
  const { rows } = await pool.query(
    `UPDATE acoes SET titulo=$2, descricao=$3, status=$4, prioridade=$5, marca=$6, responsavel=$7, prazo=$8,
            concluido_em = CASE WHEN $4 = 'Concluído' THEN COALESCE(concluido_em, now()) ELSE NULL END
      WHERE id = $1 RETURNING *`,
    [a.id, novo.titulo, novo.descricao, novo.status, novo.prioridade, novo.marca, novo.responsavel, novo.prazo]);
  let pontos = 0;
  if (concluindo && (!a.prazo || hojeSP() <= a.prazo.toISOString().slice(0, 10))) {
    pontos = REGRAS.acao_prazo;
    await creditar(req.usuario.sub, pontos, 'Ação concluída no prazo', `acao:${a.id}`);
  }
  res.json({ ...rows[0], pontosGanhos: pontos });
});

r.delete('/acoes/:id', pode('acao', 2), async (req, res) => {
  await pool.query('DELETE FROM acoes WHERE id = $1', [req.params.id]);
  res.json({ ok: true });
});

r.post('/acoes/:id/comentarios', pode('areas', 1), async (req, res) => {
  const texto = txt(req.body?.texto, 2000);
  if (!texto) return res.status(400).json({ erro: 'Escreva o comentário.' });
  const { rows } = await pool.query(
    'INSERT INTO acao_comentarios (acao_id, usuario_id, autor, texto) VALUES ($1,$2,$3,$4) RETURNING id, autor, texto, criado_em',
    [req.params.id, req.usuario.sub, await nomeUsuario(req.usuario.sub), texto]);
  res.status(201).json(rows[0]);
});

// ======================= CHECKLISTS =======================
r.get('/checklists/aplicacoes', pode('areas', 1), async (req, res) => {
  const p = []; let w = '';
  if (req.query.area) { p.push(req.query.area); w = 'WHERE ap.area_id = $1'; }
  const { rows } = await pool.query(
    `SELECT ap.id, ap.modelo_id, m.nome AS modelo, ap.area_id, l.nome AS loja, ap.score, ap.qtd_ok, ap.qtd_atencao, ap.qtd_nc, ap.criado_em, u.nome AS usuario
       FROM checklist_aplicacoes ap JOIN checklist_modelos m ON m.id = ap.modelo_id
       LEFT JOIN lojas l ON l.id = ap.loja_id LEFT JOIN usuarios u ON u.id = ap.usuario_id
       ${w} ORDER BY ap.criado_em DESC LIMIT 30`, p);
  res.json(rows);
});

r.get('/checklists/aplicacoes/:id', pode('areas', 1), async (req, res) => {
  const { rows } = await pool.query(
    `SELECT ap.*, m.nome AS modelo, m.itens, l.nome AS loja, u.nome AS usuario FROM checklist_aplicacoes ap
       JOIN checklist_modelos m ON m.id = ap.modelo_id LEFT JOIN lojas l ON l.id = ap.loja_id LEFT JOIN usuarios u ON u.id = ap.usuario_id
      WHERE ap.id = $1`, [req.params.id]);
  if (!rows[0]) return res.status(404).json({ erro: 'Checklist não encontrado.' });
  res.json(rows[0]);
});

r.post('/checklists/aplicacoes', pode('check', 1), async (req, res) => {
  const b = req.body || {};
  const { rows: [m] } = await pool.query('SELECT * FROM checklist_modelos WHERE id = $1 AND ativo', [b.modelo_id]);
  if (!m) return res.status(400).json({ erro: 'Checklist inválido.' });
  const resp = Array.isArray(b.respostas) ? b.respostas.slice(0, m.itens.length) : [];
  if (resp.length !== m.itens.length) return res.status(400).json({ erro: 'Respostas incompletas.' });
  const norm = resp.map(x => ({ s: ['ok', 'warn', 'no'].includes(x?.s) ? x.s : '', obs: txt(x?.obs, 300) }));
  if (norm.some(x => !x.s)) return res.status(400).json({ erro: 'Marque todos os itens (OK, Atenção ou Não conforme) antes de salvar.' });
  const ok = norm.filter(x => x.s === 'ok').length, w = norm.filter(x => x.s === 'warn').length, no = norm.filter(x => x.s === 'no').length;
  const score = Math.round(((ok + w * 0.5) / norm.length) * 100);
  const loja = b.loja_id ? Number(b.loja_id) : null;
  const { rows } = await pool.query(
    `INSERT INTO checklist_aplicacoes (modelo_id, area_id, loja_id, marca, usuario_id, respostas, score, qtd_ok, qtd_atencao, qtd_nc, observacao)
     VALUES ($1,$2,$3,(SELECT marca FROM lojas WHERE id = $3),$4,$5,$6,$7,$8,$9,$10) RETURNING id, score`,
    [m.id, m.area_id, loja, req.usuario.sub, JSON.stringify(norm), score, ok, w, no, txt(b.observacao, 1000) || null]);
  let pontos = REGRAS.checklist;
  await creditar(req.usuario.sub, REGRAS.checklist, `Checklist aplicado: ${m.nome}`, `chk:${rows[0].id}`);
  if (score >= 90) { pontos += REGRAS.checklist_bonus; await creditar(req.usuario.sub, REGRAS.checklist_bonus, 'Checklist com score ≥ 90%', `chk:${rows[0].id}`); }
  // Itens não conformes viram ação no plano da área.
  const ncs = norm.map((x, i) => ({ ...x, item: m.itens[i] })).filter(x => x.s === 'no');
  for (const n of ncs) {
    await pool.query(
      `INSERT INTO acoes (area_id, titulo, descricao, status, prioridade, marca, responsavel, prazo, origem, criado_por)
       VALUES ($1,$2,$3,'A fazer','Alta',(SELECT marca FROM lojas WHERE id = $4),$5,CURRENT_DATE + 2,$6,$7)`,
      [m.area_id, `Corrigir: ${n.item}`.slice(0, 200), n.obs || `Não conformidade apontada no checklist "${m.nome}".`, loja,
       await nomeUsuario(req.usuario.sub), `Checklist #${rows[0].id}`, req.usuario.sub]);
  }
  res.status(201).json({ id: rows[0].id, score, pontosGanhos: pontos, acoesGeradas: ncs.length });
});

r.post('/checklists/modelos', pode('check', 2), async (req, res) => {
  const b = req.body || {};
  const nome = txt(b.nome, 150);
  const itens = (Array.isArray(b.itens) ? b.itens : String(b.itens || '').split('\n')).map(i => txt(i, 200)).filter(Boolean).slice(0, 40);
  if (!nome) return res.status(400).json({ erro: 'Informe o nome do checklist.' });
  if (!(await areaExiste(b.area_id))) return res.status(400).json({ erro: 'Área inválida.' });
  if (itens.length < 2) return res.status(400).json({ erro: 'Informe pelo menos 2 itens (um por linha).' });
  const { rows } = await pool.query(
    `INSERT INTO checklist_modelos (area_id, nome, itens, ordem) VALUES ($1,$2,$3,(SELECT COALESCE(MAX(ordem),0)+1 FROM checklist_modelos WHERE area_id = $1)) RETURNING *`,
    [b.area_id, nome, JSON.stringify(itens)]);
  res.status(201).json(rows[0]);
});

// ======================= METAS =======================
const faixa = p => (p >= 110 ? 'acelerador' : p >= 100 ? 'batida' : p >= 90 ? 'quase' : 'abaixo');

r.get('/metas', pode('areas', 1), async (req, res) => {
  const p = [req.query.area]; let extra = '';
  if (req.query.periodo) { p.push(req.query.periodo); extra = ' AND periodo = $2'; }
  const { rows } = await pool.query(`SELECT * FROM metas WHERE area_id = $1${extra} ORDER BY periodo DESC, marca`, p);
  const periodos = (await pool.query('SELECT periodo, MAX(atualizado_em) AS ult FROM metas WHERE area_id = $1 GROUP BY periodo ORDER BY ult DESC', [req.query.area])).rows.map(x => x.periodo);
  res.json({ metas: rows.map(m => ({ ...m, meta: Number(m.meta), realizado: Number(m.realizado) })), periodos });
});

async function pontuarMeta(m, usuarioId) {
  const pct = (Number(m.realizado) / Number(m.meta)) * 100;
  const devido = pct >= 110 ? REGRAS.meta_acelerador : pct >= 100 ? REGRAS.meta_batida : 0;
  if (devido > m.pontuada) {
    const resp = (await pool.query(`SELECT id FROM usuarios WHERE ativo AND area_id = $1 ORDER BY demo, id LIMIT 1`, [m.area_id])).rows[0]?.id || usuarioId;
    await creditar(resp, devido - m.pontuada, `Meta ${pct >= 110 ? 'acelerada (≥110%)' : 'batida'}: ${m.indicador} · ${m.marca}`, `meta:${m.id}`);
    await pool.query('UPDATE metas SET pontuada = $2 WHERE id = $1', [m.id, devido]);
    return devido - m.pontuada;
  }
  return 0;
}

r.post('/metas', pode('acao', 1), async (req, res) => {
  const b = req.body || {};
  if (!(await areaExiste(b.area_id))) return res.status(400).json({ erro: 'Área inválida.' });
  const meta = Number(String(b.meta ?? '').replace(/\./g, '').replace(',', '.'));
  const real = Number(String(b.realizado ?? '0').replace(/\./g, '').replace(',', '.')) || 0;
  if (!(meta > 0)) return res.status(400).json({ erro: 'Informe o valor da meta.' });
  if (!['R$', '%', 'un'].includes(b.unidade)) return res.status(400).json({ erro: 'Unidade inválida.' });
  const periodo = txt(b.periodo, 80), indicador = txt(b.indicador, 120);
  if (!periodo || !indicador) return res.status(400).json({ erro: 'Informe o indicador e o período.' });
  const { rows } = await pool.query(
    `INSERT INTO metas (area_id, marca, periodo, indicador, unidade, meta, realizado, peso, responsavel, criado_por)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
     ON CONFLICT (area_id, marca, periodo, indicador) DO UPDATE SET meta = EXCLUDED.meta, realizado = EXCLUDED.realizado,
        unidade = EXCLUDED.unidade, peso = EXCLUDED.peso, responsavel = EXCLUDED.responsavel, atualizado_em = now()
     RETURNING *`,
    [b.area_id, txt(b.marca, 40), periodo, indicador, b.unidade, meta, real, txt(b.peso, 60) || null, txt(b.responsavel, 120) || null, req.usuario.sub]);
  const pontos = await pontuarMeta(rows[0], req.usuario.sub);
  res.status(201).json({ ...rows[0], pontosGanhos: pontos });
});

r.patch('/metas/:id', pode('acao', 1), async (req, res) => {
  const real = Number(String(req.body?.realizado ?? '').replace(/\./g, '').replace(',', '.'));
  if (!Number.isFinite(real) || real < 0) return res.status(400).json({ erro: 'Informe o realizado.' });
  const { rows } = await pool.query('UPDATE metas SET realizado = $2, atualizado_em = now() WHERE id = $1 RETURNING *', [req.params.id, real]);
  if (!rows[0]) return res.status(404).json({ erro: 'Meta não encontrada.' });
  const pontos = await pontuarMeta(rows[0], req.usuario.sub);
  const pct = Math.round(real / Number(rows[0].meta) * 100);
  res.json({ ...rows[0], pct, faixa: faixa(pct), pontosGanhos: pontos });
});

// ======================= INDICADORES =======================
r.patch('/indicadores/:id', pode('acao', 1), async (req, res) => {
  const b = req.body || {};
  const valor = txt(b.valor, 40);
  if (!valor) return res.status(400).json({ erro: 'Informe o valor atual.' });
  const { rows: [k] } = await pool.query('SELECT * FROM indicadores WHERE id = $1', [req.params.id]);
  if (!k) return res.status(404).json({ erro: 'Indicador não encontrado.' });
  const num = Number(String(valor).replace(/[^\d,.-]/g, '').replace(/\./g, '').replace(',', '.'));
  const serie = Array.isArray(k.serie) ? [...k.serie] : [];
  if (Number.isFinite(num)) { serie.push(num); while (serie.length > 4) serie.shift(); }
  const { rows } = await pool.query(
    `UPDATE indicadores SET valor=$2, variacao=$3, positivo=$4, serie=$5, atualizado_em=now(), atualizado_por=$6 WHERE id=$1 RETURNING *`,
    [k.id, valor, txt(b.variacao, 40) || k.variacao, b.positivo === undefined ? k.positivo : !!b.positivo, JSON.stringify(serie), req.usuario.sub]);
  res.json(rows[0]);
});

// ======================= CALENDÁRIO =======================
r.post('/campanhas', pode('cal', 2), async (req, res) => {
  const b = req.body || {};
  const nome = txt(b.nome, 120);
  if (!nome) return res.status(400).json({ erro: 'Informe o nome da campanha.' });
  const ini = dataOuNull(b.inicio), fim = dataOuNull(b.fim);
  if (!ini || !fim || fim < ini) return res.status(400).json({ erro: 'Informe início e fim válidos.' });
  const { rowCount } = await pool.query('SELECT 1 FROM marcas WHERE codigo = $1', [b.marca]);
  if (!rowCount) return res.status(400).json({ erro: 'Marca inválida.' });
  const { rows } = await pool.query('INSERT INTO campanhas (marca, nome, inicio, fim) VALUES ($1,$2,$3,$4) RETURNING *', [b.marca, nome, ini, fim]);
  res.status(201).json(rows[0]);
});

r.delete('/campanhas/:id', pode('cal', 2), async (req, res) => {
  await pool.query('DELETE FROM campanhas WHERE id = $1', [req.params.id]);
  res.json({ ok: true });
});

// Gera no plano de ação as atividades da régua D-X da campanha para todas as áreas.
r.post('/campanhas/:id/gerar-acoes', pode('cal', 2), async (req, res) => {
  const { rows: [c] } = await pool.query('SELECT * FROM campanhas WHERE id = $1', [req.params.id]);
  if (!c) return res.status(404).json({ erro: 'Campanha não encontrada.' });
  const ja = await pool.query('SELECT COUNT(*)::int AS n FROM acoes WHERE origem = $1', [`Campanha #${c.id}`]);
  if (ja.rows[0].n) return res.status(409).json({ erro: `As atividades desta campanha já foram geradas (${ja.rows[0].n} ações).` });
  const { rows: areas } = await pool.query('SELECT id, resp, conteudo FROM areas ORDER BY ordem');
  let n = 0;
  for (const a of areas) {
    for (const f of (a.conteudo?.fases || [])) {
      const d = Number((String(f[0]).match(/D-(\d+)/) || [])[1] || 0);
      for (const atv of f[2]) {
        await pool.query(
          `INSERT INTO acoes (area_id, titulo, descricao, status, prioridade, marca, responsavel, inicio, prazo, origem, criado_por)
           VALUES ($1,$2,$3,'A fazer','Média',$4,$5,$6::date - $7::int - 7,$6::date - $7::int,$8,$9)`,
          [a.id, atv.slice(0, 200), `${c.nome} (${c.marca}) — ${f[0]}`, c.marca, a.resp, c.inicio, d, `Campanha #${c.id}`, req.usuario.sub]);
        n++;
      }
    }
  }
  res.status(201).json({ geradas: n });
});

// ======================= UNIVERSIDADE =======================
r.post('/cursos/:id/aula', async (req, res) => {
  const { rows: [c] } = await pool.query('SELECT * FROM cursos WHERE id = $1', [req.params.id]);
  if (!c) return res.status(404).json({ erro: 'Curso não encontrado.' });
  const { rows: [p] } = await pool.query(
    `INSERT INTO curso_progresso (usuario_id, curso_id, aulas_feitas) VALUES ($1,$2,1)
     ON CONFLICT (usuario_id, curso_id) DO UPDATE SET aulas_feitas = LEAST(curso_progresso.aulas_feitas + 1, $3), atualizado_em = now()
     RETURNING *`, [req.usuario.sub, c.id, c.aulas]);
  let pontos = 0;
  if (p.aulas_feitas <= c.aulas && !p.concluido_em) {
    pontos += REGRAS.aula; await creditar(req.usuario.sub, REGRAS.aula, `Aula concluída: ${c.titulo}`, `curso:${c.id}`);
    if (p.aulas_feitas >= c.aulas) {
      await pool.query('UPDATE curso_progresso SET concluido_em = now() WHERE usuario_id = $1 AND curso_id = $2', [req.usuario.sub, c.id]);
      pontos += REGRAS.curso; await creditar(req.usuario.sub, REGRAS.curso, `Curso concluído: ${c.titulo}`, `curso:${c.id}`);
    }
  }
  res.json({ aulas_feitas: p.aulas_feitas, aulas: c.aulas, pct: Math.round(p.aulas_feitas / c.aulas * 100), pontosGanhos: pontos });
});

r.get('/cursos/certificados', async (req, res) => {
  const { rows } = await pool.query(
    `SELECT c.titulo, a.nome AS area, p.concluido_em FROM curso_progresso p JOIN cursos c ON c.id = p.curso_id JOIN areas a ON a.id = c.area_id
      WHERE p.usuario_id = $1 AND p.concluido_em IS NOT NULL ORDER BY p.concluido_em DESC`, [req.usuario.sub]);
  res.json(rows);
});

// ======================= GAMIFICAÇÃO =======================
r.get('/gamificacao', async (req, res) => {
  const uid = req.usuario.sub;
  const [rank, ext, stats] = await Promise.all([
    pool.query(`SELECT u.id, u.nome, COALESCE(a.nome, u.cargo, '') AS area, COALESCE(SUM(p.pontos),0)::int AS pontos
                  FROM usuarios u LEFT JOIN pontos p ON p.usuario_id = u.id LEFT JOIN areas a ON a.id = u.area_id
                 WHERE u.ativo GROUP BY u.id, a.nome HAVING COALESCE(SUM(p.pontos),0) > 0 ORDER BY pontos DESC, u.nome LIMIT 20`),
    pool.query('SELECT pontos, motivo, criado_em FROM pontos WHERE usuario_id = $1 ORDER BY criado_em DESC LIMIT 15', [uid]),
    pool.query(`SELECT
        (SELECT COUNT(*) FROM curso_progresso WHERE usuario_id = $1 AND concluido_em IS NOT NULL)::int AS cursos,
        (SELECT COUNT(*) FROM checklist_aplicacoes WHERE usuario_id = $1)::int AS checklists,
        (SELECT COUNT(*) FROM checklist_aplicacoes WHERE usuario_id = $1 AND score >= 90)::int AS checklists90,
        (SELECT COUNT(*) FROM acoes WHERE criado_por = $1 AND status = 'Concluído')::int AS acoes`, [uid]),
  ]);
  const total = await totalDe(uid);
  const s = stats.rows[0];
  const pos = rank.rows.findIndex(x => x.id === uid);
  const medalhas = [
    ['🎓', 'Formado', s.cursos >= 1], ['📚', '5 cursos', s.cursos >= 5], ['✅', '10 checklists', s.checklists >= 10],
    ['💯', 'Checklist ≥ 90%', s.checklists90 >= 1], ['⚡', 'Ação no prazo', s.acoes >= 1], ['🏆', 'Top 3', pos >= 0 && pos < 3],
    ['🔥', '1.000 pts', total >= 1000], ['💎', 'Diamante', total >= 3000],
  ];
  res.json({ total, nivel: nivel(total), niveis: NIVEIS, regras: REGRAS, ranking: rank.rows, extrato: ext.rows, medalhas, posicao: pos + 1 });
});

// ======================= COMITÊ =======================
r.get('/comite', pode('comite', 1), async (req, res) => {
  const [reun, enc] = await Promise.all([
    pool.query('SELECT * FROM comite_reunioes ORDER BY data DESC LIMIT 30'),
    pool.query(`SELECT e.*, a.nome AS area_nome, r.titulo AS reuniao, r.data AS reuniao_data FROM comite_encaminhamentos e
                  JOIN comite_reunioes r ON r.id = e.reuniao_id LEFT JOIN areas a ON a.id = e.area_id
                 ORDER BY CASE e.status WHEN 'Concluído' THEN 1 ELSE 0 END, e.prazo NULLS LAST`),
  ]);
  const hoje = hojeSP();
  const abertos = enc.rows.filter(e => e.status !== 'Concluído');
  res.json({
    reunioes: reun.rows, encaminhamentos: enc.rows,
    kpis: {
      abertos: abertos.length,
      vencidos: abertos.filter(e => e.prazo && e.prazo.toISOString().slice(0, 10) < hoje).length,
      concluidos: enc.rows.length - abertos.length,
    },
  });
});

r.post('/comite/reunioes', pode('comite', 2), async (req, res) => {
  const b = req.body || {};
  const titulo = txt(b.titulo, 150);
  const data = String(b.data || '');
  if (!titulo || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(data)) return res.status(400).json({ erro: 'Informe título, data e hora.' });
  const pauta = (Array.isArray(b.pauta) ? b.pauta : []).map(p => ({ item: txt(p.item, 200), area: txt(p.area, 40) })).filter(p => p.item).slice(0, 20);
  const { rows } = await pool.query(
    `INSERT INTO comite_reunioes (titulo, data, presidente, pauta, participantes, criado_por) VALUES ($1, ($2::timestamp AT TIME ZONE 'America/Sao_Paulo'), $3, $4, $5, $6) RETURNING *`,
    [titulo, data, txt(b.presidente, 120) || null, JSON.stringify(pauta), txt(b.participantes, 500) || null, req.usuario.sub]);
  res.status(201).json(rows[0]);
});

r.patch('/comite/reunioes/:id', pode('comite', 2), async (req, res) => {
  const b = req.body || {};
  const { rows: [r0] } = await pool.query('SELECT * FROM comite_reunioes WHERE id = $1', [req.params.id]);
  if (!r0) return res.status(404).json({ erro: 'Reunião não encontrada.' });
  const status = ['Agendada', 'Realizada'].includes(b.status) ? b.status : r0.status;
  const { rows } = await pool.query('UPDATE comite_reunioes SET ata = $2, status = $3 WHERE id = $1 RETURNING *',
    [r0.id, b.ata !== undefined ? txt(b.ata, 10000) : r0.ata, status]);
  let pontos = 0;
  if (status === 'Realizada' && r0.status !== 'Realizada') { pontos = REGRAS.comite; await creditar(req.usuario.sub, pontos, `Participação no comitê: ${r0.titulo}`, `comite:${r0.id}`); }
  res.json({ ...rows[0], pontosGanhos: pontos });
});

r.post('/comite/encaminhamentos', pode('comite', 2), async (req, res) => {
  const b = req.body || {};
  const texto = txt(b.texto, 300);
  if (!texto) return res.status(400).json({ erro: 'Descreva o encaminhamento.' });
  const area = b.area_id && (await areaExiste(b.area_id)) ? b.area_id : null;
  const { rows } = await pool.query(
    'INSERT INTO comite_encaminhamentos (reuniao_id, texto, area_id, responsavel, prazo) VALUES ($1,$2,$3,$4,$5) RETURNING *',
    [b.reuniao_id, texto, area, txt(b.responsavel, 120) || null, dataOuNull(b.prazo)]);
  // Vira ação no plano da área, para acompanhamento até a conclusão.
  if (area) {
    await pool.query(
      `INSERT INTO acoes (area_id, titulo, status, prioridade, responsavel, prazo, origem, criado_por) VALUES ($1,$2,'A fazer','Alta',$3,$4,'Comitê comercial',$5)`,
      [area, texto.slice(0, 200), txt(b.responsavel, 120) || null, dataOuNull(b.prazo), req.usuario.sub]);
  }
  res.status(201).json(rows[0]);
});

r.patch('/comite/encaminhamentos/:id', pode('comite', 1), async (req, res) => {
  const st = req.body?.status;
  if (!['Pendente', 'Em curso', 'Concluído'].includes(st)) return res.status(400).json({ erro: 'Status inválido.' });
  const { rows } = await pool.query('UPDATE comite_encaminhamentos SET status = $2 WHERE id = $1 RETURNING *', [req.params.id, st]);
  res.json(rows[0] || {});
});

// ======================= CONTEÚDOS (CMS) =======================
r.get('/conteudos', async (req, res) => {
  const p = await permissoesDe(req.usuario.perfil);
  const { rows } = await pool.query(
    `SELECT c.*, a.nome AS area_nome, u.nome AS autor FROM conteudos c LEFT JOIN areas a ON a.id = c.area_id LEFT JOIN usuarios u ON u.id = c.criado_por
      ${p.cms >= 1 ? '' : "WHERE c.status = 'Publicado'"} ORDER BY c.criado_em DESC`);
  res.json(rows);
});

r.post('/conteudos', pode('cms', 2), async (req, res) => {
  const b = req.body || {};
  const titulo = txt(b.titulo, 200);
  if (!titulo) return res.status(400).json({ erro: 'Informe o título.' });
  if (!['Comunicado', 'Banner', 'Página', 'Notícia'].includes(b.tipo)) return res.status(400).json({ erro: 'Tipo inválido.' });
  const status = b.status === 'Publicado' ? 'Publicado' : 'Rascunho';
  const area = b.area_id && (await areaExiste(b.area_id)) ? b.area_id : null;
  const { rows } = await pool.query(
    `INSERT INTO conteudos (titulo, tipo, area_id, corpo, status, criado_por, publicado_em) VALUES ($1,$2,$3,$4,$5,$6, CASE WHEN $5 = 'Publicado' THEN now() END) RETURNING *`,
    [titulo, b.tipo, area, txt(b.corpo, 20000) || null, status, req.usuario.sub]);
  res.status(201).json(rows[0]);
});

r.patch('/conteudos/:id', pode('cms', 2), async (req, res) => {
  const b = req.body || {};
  const { rows: [c] } = await pool.query('SELECT * FROM conteudos WHERE id = $1', [req.params.id]);
  if (!c) return res.status(404).json({ erro: 'Conteúdo não encontrado.' });
  const status = ['Publicado', 'Rascunho'].includes(b.status) ? b.status : c.status;
  const { rows } = await pool.query(
    `UPDATE conteudos SET titulo=$2, corpo=$3, status=$4, publicado_em = CASE WHEN $4 = 'Publicado' THEN COALESCE(publicado_em, now()) ELSE NULL END WHERE id=$1 RETURNING *`,
    [c.id, b.titulo !== undefined ? txt(b.titulo, 200) || c.titulo : c.titulo, b.corpo !== undefined ? txt(b.corpo, 20000) : c.corpo, status]);
  res.json(rows[0]);
});

r.delete('/conteudos/:id', pode('cms', 2), async (req, res) => {
  await pool.query('DELETE FROM conteudos WHERE id = $1', [req.params.id]);
  res.json({ ok: true });
});

module.exports = r;
