import { useEffect, useState } from 'react';
import { sessao } from './api.js';
import { ir } from './rotas.js';
import Status from './pages/Status.jsx';
import Entrar from './pages/Entrar.jsx';
import PrimeiroAcesso from './pages/PrimeiroAcesso.jsx';
import Admin from './pages/Admin.jsx';

export default function App() {
  const [rota, setRota] = useState(window.location.pathname);
  useEffect(() => {
    const atualizar = () => setRota(window.location.pathname);
    const sair = () => ir('/entrar');
    window.addEventListener('popstate', atualizar);
    window.addEventListener('am360:rota', atualizar);
    window.addEventListener('am360:sair', sair);
    return () => { window.removeEventListener('popstate', atualizar); window.removeEventListener('am360:rota', atualizar); window.removeEventListener('am360:sair', sair); };
  }, []);

  if (rota === '/entrar') return <Entrar />;
  if (rota === '/primeiro-acesso') return <PrimeiroAcesso />;
  if (rota.startsWith('/admin')) {
    if (!sessao.obter()?.token) { setTimeout(() => ir('/entrar')); return null; }
    return <Admin rota={rota} />;
  }
  return <Status />;
}
