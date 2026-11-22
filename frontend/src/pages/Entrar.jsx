import { useState } from 'react';
import { api, sessao } from '../api.js';
import { ir } from '../rotas.js';

export default function Entrar() {
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);

  async function entrar(e) {
    e.preventDefault(); setErro(''); setEnviando(true);
    try {
      const r = await api('/auth/login', { metodo: 'POST', corpo: { email, senha } });
      sessao.salvar(r); ir('/admin');
    } catch (x) { setErro(x.message); } finally { setEnviando(false); }
  }

  return (
    <div className="centro">
      <form className="cartao" onSubmit={entrar}>
        <div className="marca escura">M</div>
        <h1>Entrar</h1>
        <p className="sub">Administração da Academia Milla 360</p>
        <label>E-mail<input type="email" autoComplete="username" value={email} onChange={e => setEmail(e.target.value)} required /></label>
        <label>Senha<input type="password" autoComplete="current-password" value={senha} onChange={e => setSenha(e.target.value)} required /></label>
        {erro && <div className="aviso erro">{erro}</div>}
        <button className="btn" disabled={enviando}>{enviando ? 'Entrando…' : 'Entrar'}</button>
        <button type="button" className="link" onClick={() => ir('/')}>← Voltar</button>
      </form>
    </div>
  );
}
