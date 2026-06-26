import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { api } from './api';

interface AuthCtx { user: string | null; setUser: (u: string | null) => void; loading: boolean; }
const Ctx = createContext<AuthCtx>({ user: null, setUser: () => {}, loading: true });

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    api.me().then(r => setUser(r.user)).catch(() => setUser(null)).finally(() => setLoading(false));
  }, []);
  return <Ctx.Provider value={{ user, setUser, loading }}>{children}</Ctx.Provider>;
}

export const useAuth = () => useContext(Ctx);

export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="container">Cargando…</div>;
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}
