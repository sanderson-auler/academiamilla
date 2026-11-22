import { useEffect, useState } from 'react';
import { api, sessao } from '../api.js';
import { ir } from '../rotas.js';

export default function PrimeiroAcesso() {
  const token = new URLSearchParams(window.location.search).get('token') || '';
  const [valido, setValido] = useState(null);
  const [f, setF] = useState({ nome: '', email: '', senha: '', confirma: '' });
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    if (!token) { setValido(false); return; }
    api(`/auth/primeiro-acesso/${encodeURIComponent(token)}`).then(r => setValido(r.valido)).catch(() => setValido(false));
  }, [token]);

  const campo = k => e => setF({ ...f, [k]: e.target.value });

  async function criar(e) {
    e.preventDefault(); setErro('');
    if (f.senha.length < 8) return setErro('A senha precisa ter pelo menos 8 caracteres.');
    if (f.senha !== f.confirma) return setErro('As senhas não conferem.');
    setEnviando(true);
    try {
      const r = await api('/auth/primeiro-acesso', { metodo: 'POST', corpo: { token, nome: f.nome, email: f.email, senha: f.senha } });
      sessao.salvar(r); window.history.replaceState(null, '', '/admin'); ir('/admin');
    } catch (x) { setErro(x.message); } finally { setEnviando(false); }
  }

  return (
    <div className="centro">
      <form className="cartao" onSubmit={criar}>
        <div className="marca escura">M</div>
        <h1>Primeiro acesso</h1>
        {valido === null && <p className="sub">Validando o convite…</p>}
        {valido === false && <><div className="aviso erro">Este convite é inválido, expirou ou já foi usado. Gere um novo na VPS (instalar-vps → opção 12).</div><button type="button" className="link" onClick={() => ir('/')}>← Voltar</button></>}
        {valido && <>
          <p className="sub">Crie o usuário administrador da Academia Milla 360.</p>
          <label>Nome<input value={f.nome} onChange={campo('nome')} required /></label>
          <label>E-mail<input type="email" autoComplete="username" value={f.email} onChange={campo('email')} required /></label>
          <label>Senha (mínimo 8 caracteres)<input type="password" autoComplete="new-password" value={f.senha} onChange={campo('senha')} required /></label>
          <label>Confirme a senha<input type="password" autoComplete="new-password" value={f.confirma} onChange={campo('confirma')} required /></label>
          {erro && <div className="aviso erro">{erro}</div>}
          <button className="btn" disabled={enviando}>{enviando ? 'Criando…' : 'Criar administrador'}</button>
        </>}
      </form>
    </div>
  );
}
