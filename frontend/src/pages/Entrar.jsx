import { useState } from 'react';
import { api, sessao } from '../api.js';
import { ir } from '../rotas.js';
import '../plataforma/estilo.css';

// Login no visual aprovado do protótipo.
export default function Entrar() {
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);
  const destino = new URLSearchParams(window.location.search).get('voltar') || '/';

  async function entrar(e) {
    e.preventDefault(); setErro(''); setEnviando(true);
    try {
      const r = await api('/auth/login', { metodo: 'POST', corpo: { email, senha } });
      sessao.salvar(r); window.location.href = destino.startsWith('/') ? destino : '/';
    } catch (x) { setErro(x.message); } finally { setEnviando(false); }
  }

  return (
    <div id="login">
      <div className="login-left">
        <div className="brandmark"><div className="logo-badge">M</div>
          <div><b style={{ color: '#fff', fontSize: 18 }}>Academia Milla 360</b><br /><small style={{ color: '#9CC0CC' }}>Sistema Operacional de Gestão Comercial</small></div></div>
        <div>
          <h1>Capacitar.<br />Executar.<br />Governar.</h1>
          <p>Uma plataforma única que reúne, por área, as metas, os indicadores, o plano de ação, os treinamentos, os checklists e as rotinas de cada gestor do Grupo Milla — integrados ao calendário comercial.</p>
          <div className="pillrow">{['MILLA', 'MILLA CASA', 'DÁHLIA', 'DOM CORTEZ', '18 lojas', '7 áreas'].map(p => <span key={p} className="pill">{p}</span>)}</div>
        </div>
        <div style={{ fontSize: 12, color: '#86AAB6' }}>© {new Date().getFullYear()} Grupo Milla · Academia Milla 360</div>
      </div>
      <div className="login-right">
        <form className="login-card" onSubmit={entrar}>
          <h2>Bem-vindo de volta</h2><p className="sub">Acesse sua conta para continuar</p>
          <div className="field"><label>E-mail corporativo</label><input type="email" autoComplete="username" value={email} onChange={e => setEmail(e.target.value)} required /></div>
          <div className="field"><label>Senha</label><input type="password" autoComplete="current-password" value={senha} onChange={e => setSenha(e.target.value)} required /></div>
          {erro && <div className="aviso erro" style={{ marginTop: 0 }}>{erro}</div>}
          <button className="btn-primary" disabled={enviando}>{enviando ? 'Entrando…' : 'Entrar na plataforma'}</button>
          <div className="login-foot">Primeiro acesso? Use o link de convite recebido por e-mail.<br />Esqueceu a senha? Peça um novo convite à administração.<br /><br />Acesso protegido por perfil (RBAC)</div>
        </form>
      </div>
    </div>
  );
}
