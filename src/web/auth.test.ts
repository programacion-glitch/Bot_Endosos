import { describe, it, expect, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { sessionMiddleware, createAuthRouter, requireAuth } from './auth';
import { openUserStore, UserStore } from './userStore';

function makeApp(users: UserStore) {
  const app = express();
  app.use(express.json());
  app.use(sessionMiddleware('test-secret'));
  app.use('/api', createAuthRouter(users));
  app.get('/api/protected', requireAuth, (_req, res) => res.json({ ok: true }));
  return app;
}

let users: UserStore;
let app: express.Express;
beforeEach(() => {
  users = openUserStore(':memory:');
  users.createUser('maria', 'secreta123');
  app = makeApp(users);
});

describe('auth', () => {
  it('login correcto fija sesión y permite /me', async () => {
    const agent = request.agent(app);
    const login = await agent.post('/api/login').send({ username: 'maria', password: 'secreta123' });
    expect(login.status).toBe(200);
    const me = await agent.get('/api/me');
    expect(me.status).toBe(200);
    expect(me.body.user).toBe('maria');
  });
  it('login con credenciales malas → 401', async () => {
    const res = await request(app).post('/api/login').send({ username: 'maria', password: 'mala' });
    expect(res.status).toBe(401);
  });
  it('ruta protegida sin sesión → 401', async () => {
    const res = await request(app).get('/api/protected');
    expect(res.status).toBe(401);
  });
  it('ruta protegida con sesión → 200', async () => {
    const agent = request.agent(app);
    await agent.post('/api/login').send({ username: 'maria', password: 'secreta123' });
    const res = await agent.get('/api/protected');
    expect(res.status).toBe(200);
  });
  it('logout limpia la sesión', async () => {
    const agent = request.agent(app);
    await agent.post('/api/login').send({ username: 'maria', password: 'secreta123' });
    await agent.post('/api/logout');
    const me = await agent.get('/api/me');
    expect(me.status).toBe(401);
    const prot = await agent.get('/api/protected');
    expect(prot.status).toBe(401);
  });
});

describe('cookie Secure', () => {
  it('login funciona sobre HTTP plano aun con NODE_ENV=production (cookie sin Secure)', async () => {
    const prev = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    delete process.env.WEB_COOKIE_SECURE;
    try {
      const agent = request.agent(makeApp(users));
      const login = await agent.post('/api/login').send({ username: 'maria', password: 'secreta123' });
      expect(login.status).toBe(200);
      const setCookie: string[] = login.headers['set-cookie'] ?? [];
      expect(setCookie.length).toBeGreaterThan(0);
      expect(setCookie.join(';')).not.toMatch(/;\s*secure/i);
      const me = await agent.get('/api/me');
      expect(me.status).toBe(200);
    } finally {
      process.env.NODE_ENV = prev;
    }
  });

  it('WEB_COOKIE_SECURE=true activa el flag Secure (no se emite cookie sobre HTTP)', async () => {
    process.env.WEB_COOKIE_SECURE = 'true';
    try {
      const res = await request(makeApp(users))
        .post('/api/login')
        .send({ username: 'maria', password: 'secreta123' });
      // express-session con secure:true no emite Set-Cookie en conexiones no-TLS
      expect(res.headers['set-cookie']).toBeUndefined();
    } finally {
      delete process.env.WEB_COOKIE_SECURE;
    }
  });
});
