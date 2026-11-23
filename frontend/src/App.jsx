import { useEffect, useState } from 'react';
import { sessao } from './api.js';
import { ir } from './rotas.js';
import Entrar from './pages/Entrar.jsx';
import PrimeiroAcesso from './pages/PrimeiroAcesso.jsx';
import DefinirSenha from './pages/DefinirSenha.jsx';
import Admin from './pages/Admin.jsx';
import Status from './pages/Status.jsx';
import Plataforma from './pages/Plataforma.jsx';

export default function App() {
  const [rota, setRota] = useState(window.location.pathname);
  useEffect(() => {
    const atualizar = () => setRota(window.location.pathname);
    const sair = () => { window.location.href = '/entrar'; };
    window.addEventListener('popstate', atualizar);
    window.addEventListener('am360:rota', atualizar);
    window.addEventListener('am360:sair', sair);
    return () => { window.removeEventListener('popstate', atualizar); window.removeEventListener('am360:rota', atualizar); window.removeEventListener('am360:sair', sair); };
  }, []);

  const logado = !!sessao.obter()?.token;
  if (rota === '/entrar') return <Entrar />;
  if (rota === '/primeiro-acesso') return <PrimeiroAcesso />;
  if (rota === '/definir-senha') return <DefinirSenha />;
  if (rota === '/status') return <Status />;
  if (!logado) { setTimeout(() => ir('/entrar' + (rota !== '/' ? `?voltar=${encodeURIComponent(rota)}` : ''))); return null; }
  if (rota.startsWith('/admin')) return <Admin rota={rota} />;
  return <Plataforma />;
}
