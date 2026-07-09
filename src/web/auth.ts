import express, { RequestHandler, Router } from 'express';
import session from 'express-session';
import { UserStore } from './userStore';

declare module 'express-session' {
  interface SessionData {
    user?: string;
  }
}

export function sessionMiddleware(secret: string): RequestHandler {
  return session({
    secret,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      // El portal es HTTP interno (LAN). Secure solo si algún día hay TLS delante:
      // activar con WEB_COOKIE_SECURE=true (y app.set('trust proxy', 1) si hay proxy).
      secure: process.env.WEB_COOKIE_SECURE === 'true',
      maxAge: 1000 * 60 * 60 * 8, // 8h
    },
  });
}

export const requireAuth: RequestHandler = (req, res, next) => {
  if (req.session.user) return next();
  res.status(401).json({ error: 'No autenticado' });
};

export function createAuthRouter(users: UserStore): Router {
  const router = express.Router();

  router.post('/login', (req, res) => {
    const { username, password } = req.body ?? {};
    if (
      typeof username !== 'string' ||
      typeof password !== 'string' ||
      !users.verifyUser(username, password)
    ) {
      return res.status(401).json({ error: 'Credenciales inválidas' });
    }
    req.session.regenerate(err => {
      if (err) return res.status(500).json({ error: 'Error de sesión' });
      req.session.user = username;
      res.json({ user: username });
    });
  });

  router.post('/logout', (req, res) => {
    req.session.destroy(err => {
      if (err) return res.status(500).json({ error: 'No se pudo cerrar sesión' });
      res.json({ ok: true });
    });
  });

  router.get('/me', (req, res) => {
    if (!req.session.user) return res.status(401).json({ error: 'No autenticado' });
    res.json({ user: req.session.user });
  });

  return router;
}
