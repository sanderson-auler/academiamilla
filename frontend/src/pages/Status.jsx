import { useEffect, useState } from 'react';
import { VERSAO } from '../data/changelog.js';
import { api } from '../api.js';
import { ir } from '../rotas.js';

function Linha({ rotulo, valor, ok }) {
  return (
    <div className="item">
      <span className={`ponto ${ok === undefined ? '' : ok ? 'ok' : 'falha'}`} />
      <div><div className="rotulo">{rotulo}</div><div className="valor">{valor}</div></div>
    </div>
  );
}

export default function Status() {
  const [saude, setSaude] = useState(null);
  const [erro, setErro] = useState(false);
  useEffect(() => { api('/saude').then(setSaude).catch(() => setErro(true)); }, []);
  const carregando = !saude && !erro;
  const apiOk = saude?.api === 'online';
  const bancoOk = saude?.banco === 'online';
  return (
    <main>
      <section className="faixa">
        <div className="marca">M</div>
        <h1>Academia Milla 360</h1>
        <p>Sistema operacional de gestão comercial do Grupo Milla</p>
        <span className="selo">Ambiente em implantação</span>
        <div><button className="btn claro" onClick={() => ir('/entrar')}>Entrar na administração</button></div>
      </section>
      <section className="painel">
        <h2>Status do ambiente</h2>
        <Linha rotulo="Aplicação" valor={`versão ${VERSAO}`} ok />
        <Linha rotulo="API" valor={carregando ? 'verificando…' : apiOk ? `online · ${saude.versao}` : 'sem resposta'} ok={carregando ? undefined : apiOk} />
        <Linha rotulo="Banco de dados" valor={carregando ? 'verificando…' : bancoOk ? 'conectado' : 'sem conexão'} ok={carregando ? undefined : bancoOk} />
        <Linha rotulo="Busca inteligente (pgvector)" valor={saude?.pgvector ? `ativo · ${saude.pgvector}` : carregando ? 'verificando…' : '—'} ok={carregando ? undefined : !!saude?.pgvector} />
        {saude?.agora && <p className="hora">Horário do servidor: {new Date(saude.agora).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}</p>}
      </section>
      <footer>© {new Date().getFullYear()} Grupo Milla · Academia Milla 360</footer>
    </main>
  );
}
