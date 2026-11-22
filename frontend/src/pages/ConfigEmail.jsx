import { useEffect, useState } from 'react';
import { api, sessao } from '../api.js';

const PRESETS = {
  Gmail: { host: 'smtp.gmail.com', porta: 465, seguranca: 'ssl' },
  'Outlook / Microsoft 365': { host: 'smtp.office365.com', porta: 587, seguranca: 'starttls' },
  Hostinger: { host: 'smtp.hostinger.com', porta: 465, seguranca: 'ssl' },
};
const VAZIO = { host: '', porta: 465, seguranca: 'ssl', usuario: '', senha: '', remetente_nome: 'Academia Milla 360', remetente_email: '' };

export default function ConfigEmail() {
  const [f, setF] = useState(VAZIO);
  const [atual, setAtual] = useState(null);
  const [msg, setMsg] = useState(null);
  const [ocupado, setOcupado] = useState('');
  const [para, setPara] = useState(sessao.obter()?.usuario?.email || '');
  const [confirmaRemover, setConfirmaRemover] = useState(false);

  async function carregar() {
    const r = await api('/admin/config/email');
    setAtual(r);
    if (r.configurado) setF({ host: r.host, porta: r.porta, seguranca: r.seguranca, usuario: r.usuario || '', senha: '', remetente_nome: r.remetente_nome, remetente_email: r.remetente_email });
  }
  useEffect(() => { carregar().catch(e => setMsg({ tipo: 'erro', texto: e.message })); }, []);

  const campo = k => e => setF({ ...f, [k]: k === 'porta' ? Number(e.target.value) : e.target.value });

  async function salvar(e) {
    e.preventDefault(); setMsg(null); setOcupado('salvar');
    try {
      const r = await api('/admin/config/email', { metodo: 'PUT', corpo: f });
      setAtual(r); setF({ ...f, senha: '' }); setMsg({ tipo: 'ok', texto: 'Configuração salva.' });
    } catch (x) { setMsg({ tipo: 'erro', texto: x.message }); } finally { setOcupado(''); }
  }
  async function testar() {
    setMsg(null); setOcupado('teste');
    try { await api('/admin/config/email/teste', { metodo: 'POST', corpo: { para } }); setMsg({ tipo: 'ok', texto: `E-mail de teste enviado para ${para}. Confira a caixa de entrada (e o spam).` }); }
    catch (x) { setMsg({ tipo: 'erro', texto: x.message }); } finally { setOcupado(''); }
  }
  async function remover() {
    setOcupado('remover');
    try { await api('/admin/config/email', { metodo: 'DELETE' }); setAtual({ configurado: false }); setF(VAZIO); setConfirmaRemover(false); setMsg({ tipo: 'ok', texto: 'Configuração removida. O sistema não enviará e-mails até uma nova configuração.' }); }
    catch (x) { setMsg({ tipo: 'erro', texto: x.message }); } finally { setOcupado(''); }
  }

  if (!atual) return <p className="sub">Carregando…</p>;
  const gmail = f.host === 'smtp.gmail.com';

  return (
    <>
      <h1>E-mail de envio (SMTP)</h1>
      <p className="sub">Conta usada pelo sistema para enviar recuperação de senha, convites e notificações.
        {atual.configurado ? ` Última alteração: ${new Date(atual.atualizado_em).toLocaleString('pt-BR')}.` : ' Ainda não configurado.'}</p>

      <div className="presets"><span>Preencher com:</span>{Object.keys(PRESETS).map(n =>
        <button type="button" key={n} className="chip" onClick={() => setF({ ...f, ...PRESETS[n] })}>{n}</button>)}</div>

      {gmail && <div className="aviso info">No Gmail, use uma <b>senha de app</b> (16 letras), não a senha normal da conta. Ela é criada em myaccount.google.com → Segurança → Verificação em duas etapas → Senhas de app. O e-mail do remetente deve ser o mesmo da conta.</div>}

      <form className="grade" onSubmit={salvar}>
        <label className="larga">Servidor SMTP<input value={f.host} onChange={campo('host')} placeholder="smtp.seudominio.com" required /></label>
        <label>Porta<input type="number" min="1" max="65535" value={f.porta} onChange={campo('porta')} required /></label>
        <label>Segurança<select value={f.seguranca} onChange={campo('seguranca')}>
          <option value="ssl">SSL/TLS (geralmente 465)</option>
          <option value="starttls">STARTTLS (geralmente 587)</option>
          <option value="nenhuma">Nenhuma</option>
        </select></label>
        <label>Usuário<input value={f.usuario} onChange={campo('usuario')} autoComplete="off" placeholder="conta@dominio.com" /></label>
        <label>Senha<input type="password" value={f.senha} onChange={campo('senha')} autoComplete="new-password"
          placeholder={atual.senha_definida ? '•••••••• salva (em branco = manter)' : 'senha da conta ou senha de app'} /></label>
        <label>Nome do remetente<input value={f.remetente_nome} onChange={campo('remetente_nome')} required /></label>
        <label>E-mail do remetente<input type="email" value={f.remetente_email} onChange={campo('remetente_email')} required /></label>
        <div className="acoes larga"><button className="btn" disabled={!!ocupado}>{ocupado === 'salvar' ? 'Salvando…' : 'Salvar configuração'}</button></div>
      </form>

      {msg && <div className={`aviso ${msg.tipo === 'ok' ? 'ok' : 'erro'}`} role="status">{msg.texto}</div>}

      {atual.configurado && <div className="bloco">
        <h2>Enviar e-mail de teste</h2>
        <div className="linha-form">
          <input type="email" value={para} onChange={e => setPara(e.target.value)} placeholder="destinatário do teste" />
          <button type="button" className="btn secundario" onClick={testar} disabled={!!ocupado}>{ocupado === 'teste' ? 'Enviando…' : 'Enviar teste'}</button>
        </div>
      </div>}

      {atual.configurado && <div className="bloco perigo">
        <h2>Remover configuração</h2>
        {!confirmaRemover
          ? <button type="button" className="btn perigo" onClick={() => setConfirmaRemover(true)}>Remover configuração de e-mail</button>
          : <div className="linha-form"><span>O sistema deixará de enviar e-mails. Confirmar?</span>
              <button type="button" className="btn perigo" onClick={remover} disabled={!!ocupado}>Sim, remover</button>
              <button type="button" className="btn secundario" onClick={() => setConfirmaRemover(false)}>Cancelar</button></div>}
      </div>}
    </>
  );
}
