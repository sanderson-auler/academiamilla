import { useEffect, useState } from 'react';
import { VERSAO } from './data/changelog.js';

const API = import.meta.env.VITE_API_URL || '/api';

function Status({ rotulo, valor, ok }) {
  return (
    <div className="item">
      <span className={`ponto ${ok === undefined ? '' : ok ? 'ok' : 'falha'}`} />
      <div>
        <div className="rotulo">{rotulo}</div>
        <div className="valor">{valor}</div>
      </div>
    </div>
  );
}

export default function App() {
  const [saude, setSaude] = useState(null);
  const [erro, setErro] = useState(false);

  useEffect(() => {
    fetch(`${API}/saude`)
      .then(r => r.json())
      .then(setSaude)
      .catch(() => setErro(true));
  }, []);

  const apiOk = saude?.api === 'online';
  const bancoOk = saude?.banco === 'online';
  const carregando = !saude && !erro;

  return (
    <main>
      <section className="faixa">
        <div className="marca">M</div>
        <h1>Academia Milla 360</h1>
        <p>Sistema operacional de gestão comercial do Grupo Milla</p>
        <span className="selo">Ambiente em implantação</span>
      </section>
      <section className="painel">
        <h2>Status do ambiente</h2>
        <Status rotulo="Aplicação" valor={`versão ${VERSAO}`} ok />
        <Status rotulo="API" valor={carregando ? 'verificando…' : apiOk ? `online · ${saude.versao}` : 'sem resposta'} ok={carregando ? undefined : apiOk} />
        <Status rotulo="Banco de dados" valor={carregando ? 'verificando…' : bancoOk ? 'conectado' : 'sem conexão'} ok={carregando ? undefined : bancoOk} />
        <Status rotulo="Busca inteligente (pgvector)" valor={saude?.pgvector ? `ativo · ${saude.pgvector}` : carregando ? 'verificando…' : '—'} ok={carregando ? undefined : !!saude?.pgvector} />
        {saude?.agora && (
          <p className="hora">Horário do servidor: {new Date(saude.agora).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}</p>
        )}
      </section>
      <footer>© {new Date().getFullYear()} Grupo Milla · Academia Milla 360</footer>
    </main>
  );
}
