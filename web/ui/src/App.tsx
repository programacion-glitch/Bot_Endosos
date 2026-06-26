import { Routes, Route, Navigate, Link, useNavigate } from 'react-router-dom';
import { AuthProvider, RequireAuth, useAuth } from './auth';
import { api } from './api';
import Login from './pages/Login';
import JobBuilder from './pages/JobBuilder';
import Jobs from './pages/Jobs';

function Header() {
  const { user, setUser } = useAuth();
  const nav = useNavigate();
  async function logout() { await api.logout().catch(() => {}); setUser(null); nav('/login'); }
  return (
    <header className="app-header">
      <span className="dot" /> Portal de Endosos H2O
      {user && (
        <nav style={{ marginLeft: 'auto', display: 'flex', gap: 16, alignItems: 'center' }}>
          <Link to="/" style={{ color: '#fff' }}>Nuevo endoso</Link>
          <Link to="/jobs" style={{ color: '#fff' }}>Historial</Link>
          <span style={{ opacity: 0.8 }}>{user}</span>
          <button className="secondary" onClick={logout}>Salir</button>
        </nav>
      )}
    </header>
  );
}

function Placeholder({ title }: { title: string }) {
  return <div className="container"><div className="card">{title}</div></div>;
}

export default function App() {
  return (
    <AuthProvider>
      <Header />
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/" element={<RequireAuth><JobBuilder /></RequireAuth>} />
        <Route path="/jobs" element={<RequireAuth><Jobs /></RequireAuth>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AuthProvider>
  );
}
