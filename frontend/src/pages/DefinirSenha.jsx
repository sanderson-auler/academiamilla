import { useEffect, useState } from 'react';
import { api, sessao } from '../api.js';
import { ir } from '../rotas.js';

// Definição de senha pelo link de convite enviado pela administração.
export default function DefinirSenha() {
  const token = new URLSearchParams(window.location.search).get('token') || '';
  const [conv, setConv] = useState(null);
  const [f, setF] = useState({ senha: '', confirma: '' });
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    if (!token) { setConv({ valido: false }); return; }
    api(`/auth/convite/${encodeURIComponent(token)}`).then(setConv).catch(() => setConv({ valido: false }));
  }, [token]);

  async function salvar(e) {
    e.preventDefault(); setErro('');
    if (f.senha.length < 8) return setErro('A senha precisa ter pelo menos 8 caracteres.');
    if (f.senha !== f.confirma) return setErro('As senhas não conferem.');
    setEnviando(true);
    try {
      const r = await api('/auth/convite', { metodo: 'POST', corpo: { token, senha: f.senha } });
      sessao.salvar(r); window.location.href = '/';
    } catch (x) { setErro(x.message); } finally { setEnviando(false); }
  }

  return (
    <div className="centro">
      <form className="cartao" onSubmit={salvar}>
        <div className="marca escura">M</div>
        <h1>Definir senha</h1>
        {conv === null && <p className="sub">Validando o link…</p>}
        {conv?.valido === false && <><div className="aviso erro">Este link é inválido, expirou ou já foi usado. Peça um novo convite à administração da plataforma.</div><button type="button" className="link" onClick={() => ir('/entrar')}>← Ir para o login</button></>}
        {conv?.valido && <>
          <p className="sub">Olá, <b>{conv.nome}</b>! Crie sua senha de acesso à Academia Milla 360 ({conv.email}).</p>
          <label>Nova senha (mínimo 8 caracteres)<input type="password" autoComplete="new-password" value={f.senha} onChange={e => setF({ ...f, senha: e.target.value })} required /></label>
          <label>Confirme a senha<input type="password" autoComplete="new-password" value={f.confirma} onChange={e => setF({ ...f, confirma: e.target.value })} required /></label>
          {erro && <div className="aviso erro">{erro}</div>}
          <button className="btn" disabled={enviando}>{enviando ? 'Salvando…' : 'Salvar e entrar'}</button>
        </>}
      </form>
    </div>
  );
}
