import { useEffect, useState } from 'react';
import { api, sessao } from '../api.js';
import { ir } from '../rotas.js';
import { VERSAO } from '../data/changelog.js';
import ConfigEmail from './ConfigEmail.jsx';

const MENU = [{ grupo: 'Configurações', itens: [{ rota: '/admin/email', nome: 'E-mail de envio (SMTP)' }] }];

export default function Admin({ rota }) {
  const [usuario, setUsuario] = useState(sessao.obter()?.usuario || null);
  useEffect(() => { api('/auth/eu').then(setUsuario).catch(() => {}); }, []);
  const sair = () => { sessao.limpar(); ir('/entrar'); };
  const pagina = rota === '/admin' ? '/admin/email' : rota;

  return (
    <div className="admin">
      <header className="topo">
        <div className="marca pequena">M</div>
        <b>Academia Milla 360</b><span className="tag">Administração</span>
        <span className="espaco" />
        <span className="quem">{usuario?.nome}</span>
        <button className="link claro" onClick={sair}>Sair</button>
      </header>
      <div className="corpo">
        <nav className="lateral">
          {MENU.map(g => <div key={g.grupo}><div className="grupo">{g.grupo}</div>
            {g.itens.map(i => <button key={i.rota} className={pagina === i.rota ? 'ativo' : ''} onClick={() => ir(i.rota)}>{i.nome}</button>)}</div>)}
          <div className="versao">versão {VERSAO}</div>
        </nav>
        <section className="conteudo">{pagina === '/admin/email' && <ConfigEmail />}</section>
      </div>
    </div>
  );
}
