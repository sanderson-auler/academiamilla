import { useEffect, useRef, useState } from 'react';
import { CASCA, iniciar } from '../plataforma/iniciar.js';

// A plataforma é montada uma única vez dentro deste componente (telas em JS puro, como no protótipo aprovado).
export default function Plataforma() {
  const ref = useRef(null);
  const [erro, setErro] = useState('');
  useEffect(() => {
    if (!ref.current || ref.current.dataset.ok) return;
    ref.current.dataset.ok = '1';
    ref.current.innerHTML = CASCA;
    iniciar().catch(e => setErro(e.message || 'Não foi possível abrir a plataforma.'));
  }, []);
  return <>
    <div ref={ref} />
    {erro && <div style={{ position: 'fixed', inset: 0, display: 'grid', placeItems: 'center', background: '#F4F7F9', fontFamily: 'Segoe UI, Arial' }}>
      <div style={{ background: '#fff', padding: 28, borderRadius: 14, maxWidth: 420, textAlign: 'center' }}>
        <b>Não foi possível abrir a plataforma.</b><p style={{ color: '#5B6B73' }}>{erro}</p>
        <button onClick={() => window.location.reload()} style={{ padding: '10px 18px', borderRadius: 10, border: 0, background: '#C8102E', color: '#fff', fontWeight: 700 }}>Tentar de novo</button>
      </div></div>}
  </>;
}
