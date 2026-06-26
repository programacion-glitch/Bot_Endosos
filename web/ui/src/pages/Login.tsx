import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth';

export default function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const nav = useNavigate();
  const { setUser } = useAuth();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError('');
    try {
      const r = await api.login(username, password);
      setUser(r.user);
      nav('/');
    } catch (err) {
      setError((err as Error).message || 'No se pudo iniciar sesión');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="container" style={{ maxWidth: 380 }}>
      <div className="card">
        <h2 style={{ marginTop: 0 }}>Iniciar sesión</h2>
        <form onSubmit={submit}>
          <div className="field">
            <label htmlFor="login-username">Usuario</label>
            <input id="login-username" value={username} onChange={e => setUsername(e.target.value)} autoFocus />
          </div>
          <div className="field">
            <label htmlFor="login-password">Contraseña</label>
            <input id="login-password" type="password" value={password} onChange={e => setPassword(e.target.value)} />
          </div>
          {error && <p className="error">{error}</p>}
          <button type="submit" disabled={busy || !username || !password}>
            {busy ? 'Entrando…' : 'Entrar'}
          </button>
        </form>
      </div>
    </div>
  );
}
