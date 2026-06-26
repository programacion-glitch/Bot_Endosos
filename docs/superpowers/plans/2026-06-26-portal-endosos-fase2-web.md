# Portal de Endosos — Fase 2: web funcional (API + UI) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Una web interna ejecutable donde un usuario interno inicia sesión, arma un endoso (cliente existente + comandos) y lo envía; el envío encola un job REAL en la cola SQLite de la Fase 1 que el bot ya procesa.

**Architecture:** La API es un nuevo entry point dentro del proyecto TS raíz (`src/web/`) que **reutiliza** `validateJobInput` (Zod) y `openJobStore` (la misma `data/jobs.db`) de la Fase 1. Auth con cuentas individuales (bcryptjs + sesión por cookie) sobre una `data/users.db` aparte. La UI es una app React+Vite independiente en `web/ui/` con la marca H2O; en build se sirve estática desde la API. La API es solo escritura/lectura de la cola — **nunca reclama jobs** (eso lo sigue haciendo solo el bot), preservando el invariante de un solo claimer.

**Tech Stack:** TypeScript, Node 24 (dev) / Node 20 (Docker), Express, express-session, bcryptjs (JS puro, sin binario nativo), better-sqlite3 (Fase 1), React 18 + Vite, Vitest + supertest.

## Global Constraints

- TypeScript `strict: true`. La API vive bajo `src/web/` (proyecto TS raíz, `rootDir: ./src`). La UI vive bajo `web/ui/` (proyecto Vite independiente, su propio package.json/tsconfig/node_modules).
- **Reuso, no duplicación:** la API importa `validateJobInput` de `../shared/schemas` y `openJobStore` de `../job/jobStore`. La validación autoritativa es el Zod compartido (lado backend). La UI hace validación ligera de campos requeridos para UX; el backend es la fuente de verdad.
- **Invariante de claimer único:** la API solo usa `createJob`, `getJob`, `listJobs` del `JobStore`. NUNCA llama `claimNextQueued`/`completeJob`/`failJob` (eso es exclusivo del bot). better-sqlite3 abre `jobs.db` en modo WAL (Fase 1), permitiendo que API (escritor) y bot (claimer) compartan el archivo.
- **Auth:** cuentas individuales; contraseñas con hash bcryptjs; sesión por cookie (`express-session`). Cada job sella `createdBy` = usuario de la sesión (NUNCA confiar en un `createdBy` que venga del cliente).
- **Alcance de comandos v2:** los 4 ya validados en Fase 1 — `ADD_VEHICLE`, `UPDATE_VEHICLE_VALUE`, `DELETE_VEHICLE_VALUE`, `NO_CHANGE`. Modo `existing_client` únicamente. (Los 22 comandos y `new_client`/`CREATE_INSURED` son Fase 3.)
- **Marca H2O** (de [[h2o-brand-palette]] / `2026-06-26-portal-web-endosos-design.md`): navy `#2B2B5E`, azul `#0960A8`, cian `#00CDE5`, gris texto `#82828A`, superficies `#F0EFF4`/`#FFFFFF`, tipografía **Kumbh Sans**. Construir la UI con estos tokens.
- **Toolchain Rollup en Windows:** Vite y Vitest usan Rollup; el binario nativo `@rollup/rollup-win32-x64-msvc` lo borra Windows Defender (falso positivo, confirmado en Fase 1). El `web/ui/package.json` DEBE incluir `"overrides": { "rollup": "npm:@rollup/wasm-node@4.62.2" }` para evitar ese bloqueo, igual que el root.
- **Verificación local (cómo se "prueba"):** dev = API (`npm run web`) + Vite dev server (`cd web/ui && npm run dev`, proxy `/api` → API). Prod = `cd web/ui && npm run build` y la API sirve `web/ui/dist`.

---

## Estructura de archivos (Fase 2)

| Archivo | Responsabilidad | Acción |
| --- | --- | --- |
| `package.json` (root) | + express, express-session, bcryptjs, supertest, types; scripts `web`, `web:dev`, `seed-user` | Modificar |
| `.env.example` | + sección Web (WEB_PORT, SESSION_SECRET, USERS_DB_PATH) | Modificar |
| `src/config/config.ts` | + sección `web` | Modificar |
| `src/web/userStore.ts` | Tabla `users` (data/users.db) + bcryptjs | Crear |
| `src/web/userStore.test.ts` | Tests del userStore | Crear |
| `src/web/seedUser.ts` | CLI para crear/actualizar un usuario | Crear |
| `src/web/auth.ts` | session middleware + router login/logout/me + requireAuth | Crear |
| `src/web/auth.test.ts` | Tests de auth (supertest) | Crear |
| `src/web/jobsRouter.ts` | Router POST/GET jobs + descarga de archivos | Crear |
| `src/web/jobsRouter.test.ts` | Tests de jobs API (supertest) | Crear |
| `src/web/app.ts` | `createApp(deps)` — arma el Express app (testable) | Crear |
| `src/web/server.ts` | Entry point: abre stores, `createApp`, `listen` | Crear |
| `web/ui/package.json` | App Vite React TS (+ override rollup wasm) | Crear |
| `web/ui/vite.config.ts` | Vite + proxy `/api` | Crear |
| `web/ui/tsconfig.json` | TS de la UI | Crear |
| `web/ui/index.html` | HTML raíz + Kumbh Sans | Crear |
| `web/ui/src/main.tsx` | Bootstrap React + Router | Crear |
| `web/ui/src/theme.css` | Tokens de marca H2O | Crear |
| `web/ui/src/api.ts` | Cliente fetch a la API | Crear |
| `web/ui/src/types.ts` | Tipos de comando/job para la UI | Crear |
| `web/ui/src/pages/Login.tsx` | Página de login | Crear |
| `web/ui/src/pages/JobBuilder.tsx` | Armar endoso (cliente + comandos) | Crear |
| `web/ui/src/pages/Jobs.tsx` | Lista/estado + descargas | Crear |
| `web/ui/src/components/CommandForm.tsx` | Formularios condicionales por comando | Crear |
| `web/ui/src/components/CommandForm.test.tsx` | Test de mapeo de un formulario | Crear |
| `docker-compose.yml` / `Dockerfile.web` | Servicio web (opcional, última tarea) | Crear/Modificar |

---

## Task 1: Dependencias y config de la API

**Files:**
- Modify: `package.json` (root)
- Modify: `src/config/config.ts`
- Modify: `.env.example`

**Interfaces:**
- Consumes: helpers `optional`/`path` de config.ts.
- Produces: deps `express`, `express-session`, `bcryptjs` (+ types, + `supertest` dev) instaladas; `config.web = { port: number; sessionSecret: string; usersDbPath: string }`; scripts `web`, `web:dev`, `seed-user`.

- [ ] **Step 1: Instalar dependencias**

Run:
```bash
npm install express@^4.21.2 express-session@^1.18.1 bcryptjs@^2.4.3
npm install -D @types/express@^4.17.21 @types/express-session@^1.18.0 @types/bcryptjs@^2.4.6 supertest@^7.0.0 @types/supertest@^6.0.2
```
Expected: instala sin errores (todo JS puro / tipos; sin binarios nativos nuevos).

- [ ] **Step 2: Añadir scripts en `package.json`**

Dentro de `"scripts"`, añadir:
```json
    "web": "node dist/web/server.js",
    "web:dev": "ts-node-dev --respawn --transpile-only src/web/server.ts",
    "seed-user": "ts-node src/web/seedUser.ts",
```

- [ ] **Step 3: Añadir la sección `web` en `src/config/config.ts`**

Después del bloque `queue: { ... },` (creado en Fase 1) y antes de `playwright:`, insertar:
```ts
  web: {
    port: parseInt(optional('WEB_PORT', '4000')),
    sessionSecret: optional('SESSION_SECRET', 'dev-insecure-secret-change-me'),
    usersDbPath: path.resolve(optional('USERS_DB_PATH', './data/users.db')),
  },
```

- [ ] **Step 4: Añadir variables al `.env.example`**

Al final de `.env.example`, añadir:
```
# ─── Portal Web (Fase 2) ──────────────────────────────────────────────────────
WEB_PORT=4000
SESSION_SECRET=cambia-esto-por-un-secreto-largo-aleatorio
USERS_DB_PATH=./data/users.db
```

- [ ] **Step 5: Verificar typecheck**

Run: `npx tsc --noEmit`
Expected: 0 errores.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json src/config/config.ts .env.example
git commit -m "feat(web): deps y config de la API del portal (express, session, bcrypt)"
```

---

## Task 2: User store (auth) con bcryptjs

**Files:**
- Create: `src/web/userStore.ts`
- Test: `src/web/userStore.test.ts`

**Interfaces:**
- Consumes: `better-sqlite3`, `bcryptjs`.
- Produces:
  - `interface UserStore { createUser(username: string, password: string): void; verifyUser(username: string, password: string): boolean; userExists(username: string): boolean; close(): void }`
  - `function openUserStore(dbPath: string): UserStore`

- [ ] **Step 1: Escribir el test que falla**

`src/web/userStore.test.ts`:
```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { openUserStore, UserStore } from './userStore';

let store: UserStore;
beforeEach(() => { store = openUserStore(':memory:'); });
afterEach(() => { store.close(); });

describe('userStore', () => {
  it('crea un usuario y verifica la contraseña correcta', () => {
    store.createUser('maria', 'secreta123');
    expect(store.verifyUser('maria', 'secreta123')).toBe(true);
  });
  it('rechaza contraseña incorrecta', () => {
    store.createUser('maria', 'secreta123');
    expect(store.verifyUser('maria', 'mala')).toBe(false);
  });
  it('verifyUser de usuario inexistente es false', () => {
    expect(store.verifyUser('nadie', 'x')).toBe(false);
  });
  it('userExists refleja la creación', () => {
    expect(store.userExists('maria')).toBe(false);
    store.createUser('maria', 'secreta123');
    expect(store.userExists('maria')).toBe(true);
  });
  it('createUser sobre un usuario existente actualiza su contraseña', () => {
    store.createUser('maria', 'vieja');
    store.createUser('maria', 'nueva');
    expect(store.verifyUser('maria', 'nueva')).toBe(true);
    expect(store.verifyUser('maria', 'vieja')).toBe(false);
  });
  it('no guarda la contraseña en texto plano', () => {
    store.createUser('maria', 'secreta123');
    expect(store.verifyUser('maria', 'secreta123')).toBe(true); // hash verificable
  });
});
```

- [ ] **Step 2: Ejecutar el test para verificar que falla**

Run: `npx vitest run src/web/userStore.test.ts`
Expected: FAIL — `Cannot find module './userStore'`.

- [ ] **Step 3: Implementar `src/web/userStore.ts`**

```ts
import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';

export interface UserStore {
  createUser(username: string, password: string): void;
  verifyUser(username: string, password: string): boolean;
  userExists(username: string): boolean;
  close(): void;
}

const SALT_ROUNDS = 10;

export function openUserStore(dbPath: string): UserStore {
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      username TEXT PRIMARY KEY,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
  `);

  const upsert = db.prepare(`
    INSERT INTO users (username, password_hash, created_at)
    VALUES (@username, @hash, @created_at)
    ON CONFLICT(username) DO UPDATE SET password_hash = @hash
  `);
  const selectHash = db.prepare(`SELECT password_hash FROM users WHERE username = ?`);
  const selectExists = db.prepare(`SELECT 1 FROM users WHERE username = ?`);

  return {
    createUser(username, password): void {
      const hash = bcrypt.hashSync(password, SALT_ROUNDS);
      upsert.run({ username, hash, created_at: new Date().toISOString() });
    },
    verifyUser(username, password): boolean {
      const row = selectHash.get(username) as { password_hash: string } | undefined;
      if (!row) return false;
      return bcrypt.compareSync(password, row.password_hash);
    },
    userExists(username): boolean {
      return !!selectExists.get(username);
    },
    close(): void {
      db.close();
    },
  };
}
```

- [ ] **Step 4: Ejecutar los tests para verificar que pasan**

Run: `npx vitest run src/web/userStore.test.ts`
Expected: PASS — 6 tests.

- [ ] **Step 5: Commit**

```bash
git add src/web/userStore.ts src/web/userStore.test.ts
git commit -m "feat(web): userStore con bcryptjs (cuentas individuales)"
```

---

## Task 3: CLI seed-user

**Files:**
- Create: `src/web/seedUser.ts`

**Interfaces:**
- Consumes: `openUserStore` (Task 2), `config.web.usersDbPath` (Task 1).
- Produces: ejecutable `npx ts-node src/web/seedUser.ts <username> <password>` que crea/actualiza un usuario.

- [ ] **Step 1: Implementar `src/web/seedUser.ts`**

```ts
import 'dotenv/config';
import { openUserStore } from './userStore';
import { config } from '../config/config';

const [, , username, password] = process.argv;

if (!username || !password) {
  console.error('Uso: npx ts-node src/web/seedUser.ts <username> <password>');
  process.exit(1);
}

const store = openUserStore(config.web.usersDbPath);
store.createUser(username, password);
store.close();
console.log(`Usuario "${username}" creado/actualizado en ${config.web.usersDbPath}`);
```

- [ ] **Step 2: Verificar que typechequea y corre**

Run: `npx tsc --noEmit`
Expected: 0 errores.

Run: `npx ts-node src/web/seedUser.ts demo demo1234`
Expected: imprime `Usuario "demo" creado/actualizado en ...data/users.db` y crea el archivo.

- [ ] **Step 3: Commit**

```bash
git add src/web/seedUser.ts
git commit -m "feat(web): CLI seed-user para crear cuentas"
```

---

## Task 4: Auth (sesión + router + requireAuth)

**Files:**
- Create: `src/web/auth.ts`
- Test: `src/web/auth.test.ts`

**Interfaces:**
- Consumes: `express`, `express-session`, `UserStore` (Task 2).
- Produces:
  - `function sessionMiddleware(secret: string): express.RequestHandler`
  - `function requireAuth(req, res, next)` — 401 si no hay `req.session.user`
  - `function createAuthRouter(users: UserStore): express.Router` con `POST /login` (body `{username,password}` → set `req.session.user`), `POST /logout`, `GET /me` (→ `{ user }` o 401)
  - Augmentación de tipo: `declare module 'express-session' { interface SessionData { user?: string } }`

- [ ] **Step 1: Escribir el test que falla**

`src/web/auth.test.ts`:
```ts
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
  });
});
```

- [ ] **Step 2: Ejecutar el test para verificar que falla**

Run: `npx vitest run src/web/auth.test.ts`
Expected: FAIL — `Cannot find module './auth'`.

- [ ] **Step 3: Implementar `src/web/auth.ts`**

```ts
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
    if (typeof username !== 'string' || typeof password !== 'string' || !users.verifyUser(username, password)) {
      return res.status(401).json({ error: 'Credenciales inválidas' });
    }
    req.session.user = username;
    res.json({ user: username });
  });

  router.post('/logout', (req, res) => {
    req.session.destroy(() => res.json({ ok: true }));
  });

  router.get('/me', (req, res) => {
    if (!req.session.user) return res.status(401).json({ error: 'No autenticado' });
    res.json({ user: req.session.user });
  });

  return router;
}
```

- [ ] **Step 4: Ejecutar los tests para verificar que pasan**

Run: `npx vitest run src/web/auth.test.ts`
Expected: PASS — 5 tests.

- [ ] **Step 5: Commit**

```bash
git add src/web/auth.ts src/web/auth.test.ts
git commit -m "feat(web): auth con sesión (login/logout/me + requireAuth)"
```

---

## Task 5: Jobs router (encolar + listar + estado + descarga)

**Files:**
- Create: `src/web/jobsRouter.ts`
- Test: `src/web/jobsRouter.test.ts`

**Interfaces:**
- Consumes: `express`, `JobStore` (Fase 1, `src/job/jobStore`), `validateJobInput` (`src/shared/schemas`), `requireAuth` (Task 4), `path`, `fs`.
- Produces: `function createJobsRouter(store: JobStore, downloadsDir: string): express.Router`. Todas las rutas detrás de `requireAuth`. `createdBy` SIEMPRE se toma de `req.session.user` (nunca del body).
  - `POST /` → arma `{ ...body, createdBy: session.user }`, `validateJobInput`, `store.createJob`, 201 `{ id }`; 400 `{ errors }` si inválido.
  - `GET /` → `store.listJobs()`.
  - `GET /:id` → `store.getJob(id)` o 404.
  - `GET /:id/files/:name` → valida que `name` no escape `downloadsDir` (basename), 404 si no existe, si no `res.download`.

- [ ] **Step 1: Escribir el test que falla**

`src/web/jobsRouter.test.ts`:
```ts
import { describe, it, expect, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createJobsRouter } from './jobsRouter';
import { openJobStore, JobStore } from '../job/jobStore';

// Sesión simulada: inyecta un usuario fijo para saltar requireAuth real.
function makeApp(store: JobStore) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { (req as any).session = { user: 'maria' }; next(); });
  app.use('/api/jobs', createJobsRouter(store, '/tmp/does-not-matter'));
  return app;
}

let store: JobStore;
let app: express.Express;
const validBody = {
  mode: 'existing_client',
  clientName: 'Pix Test',
  usdot: '123',
  language: 'es',
  notifyTo: 'a@h2oins.com',
  commands: [{ type: 'NO_CHANGE', rawText: '' }],
};

beforeEach(() => {
  store = openJobStore(':memory:');
  app = makeApp(store);
});

describe('jobsRouter', () => {
  it('POST /api/jobs encola un job válido y sella createdBy del usuario', async () => {
    const res = await request(app).post('/api/jobs').send(validBody);
    expect(res.status).toBe(201);
    expect(res.body.id).toBeTruthy();
    const job = store.getJob(res.body.id);
    expect(job?.status).toBe('queued');
    expect(job?.createdBy).toBe('maria'); // del "session", no del body
  });

  it('POST ignora un createdBy enviado por el cliente', async () => {
    const res = await request(app).post('/api/jobs').send({ ...validBody, createdBy: 'hacker' });
    const job = store.getJob(res.body.id);
    expect(job?.createdBy).toBe('maria');
  });

  it('POST inválido → 400 con errores', async () => {
    const res = await request(app).post('/api/jobs').send({ ...validBody, commands: [] });
    expect(res.status).toBe(400);
    expect(Array.isArray(res.body.errors)).toBe(true);
  });

  it('GET /api/jobs lista los jobs', async () => {
    await request(app).post('/api/jobs').send(validBody);
    const res = await request(app).get('/api/jobs');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
  });

  it('GET /api/jobs/:id devuelve el job o 404', async () => {
    const created = await request(app).post('/api/jobs').send(validBody);
    const ok = await request(app).get(`/api/jobs/${created.body.id}`);
    expect(ok.status).toBe(200);
    const missing = await request(app).get('/api/jobs/no-existe');
    expect(missing.status).toBe(404);
  });

  it('descarga rechaza traversal de path con 400', async () => {
    const created = await request(app).post('/api/jobs').send(validBody);
    const res = await request(app).get(`/api/jobs/${created.body.id}/files/..%2f..%2fsecret`);
    expect([400, 404]).toContain(res.status); // nunca 200
  });
});
```

- [ ] **Step 2: Ejecutar el test para verificar que falla**

Run: `npx vitest run src/web/jobsRouter.test.ts`
Expected: FAIL — `Cannot find module './jobsRouter'`.

- [ ] **Step 3: Implementar `src/web/jobsRouter.ts`**

```ts
import express, { Router } from 'express';
import path from 'path';
import fs from 'fs';
import { JobStore } from '../job/jobStore';
import { validateJobInput } from '../shared/schemas';
import { requireAuth } from './auth';

export function createJobsRouter(store: JobStore, downloadsDir: string): Router {
  const router = express.Router();
  router.use(requireAuth);

  // Encolar un job
  router.post('/', (req, res) => {
    const createdBy = req.session.user!; // requireAuth garantiza que existe
    const candidate = { ...(req.body ?? {}), createdBy };
    const result = validateJobInput(candidate);
    if (!result.ok) {
      return res.status(400).json({ errors: result.errors });
    }
    const job = store.createJob(result.value);
    res.status(201).json({ id: job.id });
  });

  // Listar / historial
  router.get('/', (_req, res) => {
    res.json(store.listJobs());
  });

  // Detalle / estado
  router.get('/:id', (req, res) => {
    const job = store.getJob(req.params.id);
    if (!job) return res.status(404).json({ error: 'Job no encontrado' });
    res.json(job);
  });

  // Descargar un archivo generado (certificado / screenshot)
  router.get('/:id/files/:name', (req, res) => {
    const job = store.getJob(req.params.id);
    if (!job) return res.status(404).json({ error: 'Job no encontrado' });

    // Seguridad: solo el basename, nunca permitir traversal fuera de downloadsDir
    const safeName = path.basename(req.params.name);
    if (safeName !== req.params.name) {
      return res.status(400).json({ error: 'Nombre de archivo inválido' });
    }
    // Solo archivos que realmente pertenecen al job
    const belongs = (job.resultFiles ?? []).some(f => path.basename(f) === safeName);
    if (!belongs) return res.status(404).json({ error: 'Archivo no asociado al job' });

    const filePath = path.join(downloadsDir, safeName);
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Archivo no encontrado' });
    res.download(filePath, safeName);
  });

  return router;
}
```

- [ ] **Step 4: Ejecutar los tests para verificar que pasan**

Run: `npx vitest run src/web/jobsRouter.test.ts`
Expected: PASS — 6 tests.

- [ ] **Step 5: Commit**

```bash
git add src/web/jobsRouter.ts src/web/jobsRouter.test.ts
git commit -m "feat(web): jobsRouter (encolar/listar/estado/descarga segura)"
```

---

## Task 6: App + server (wiring) y servir la UI

**Files:**
- Create: `src/web/app.ts`
- Create: `src/web/server.ts`

**Interfaces:**
- Consumes: todo lo anterior + `config` + `openJobStore` + `openUserStore`.
- Produces:
  - `function createApp(deps: { jobStore: JobStore; userStore: UserStore; sessionSecret: string; downloadsDir: string; uiDistDir?: string }): express.Express`
  - `server.ts`: abre stores reales con rutas de `config`, llama `createApp`, `listen(config.web.port)`.

- [ ] **Step 1: Implementar `src/web/app.ts`**

```ts
import express from 'express';
import path from 'path';
import fs from 'fs';
import { JobStore } from '../job/jobStore';
import { UserStore } from './userStore';
import { sessionMiddleware, createAuthRouter } from './auth';
import { createJobsRouter } from './jobsRouter';

export interface AppDeps {
  jobStore: JobStore;
  userStore: UserStore;
  sessionSecret: string;
  downloadsDir: string;
  uiDistDir?: string;
}

export function createApp(deps: AppDeps): express.Express {
  const app = express();
  app.use(express.json());
  app.use(sessionMiddleware(deps.sessionSecret));

  app.use('/api', createAuthRouter(deps.userStore));
  app.use('/api/jobs', createJobsRouter(deps.jobStore, deps.downloadsDir));

  // Servir la UI compilada (si existe) con fallback SPA
  if (deps.uiDistDir && fs.existsSync(deps.uiDistDir)) {
    app.use(express.static(deps.uiDistDir));
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api')) return next();
      res.sendFile(path.join(deps.uiDistDir!, 'index.html'));
    });
  }

  return app;
}
```

- [ ] **Step 2: Implementar `src/web/server.ts`**

```ts
import 'dotenv/config';
import path from 'path';
import { createApp } from './app';
import { openJobStore } from '../job/jobStore';
import { openUserStore } from './userStore';
import { config } from '../config/config';
import { logger } from '../utils/logger';

const jobStore = openJobStore(config.jobs.dbPath);
const userStore = openUserStore(config.web.usersDbPath);
const uiDistDir = path.resolve(__dirname, '../../web/ui/dist');

const app = createApp({
  jobStore,
  userStore,
  sessionSecret: config.web.sessionSecret,
  downloadsDir: config.files.downloadsPath,
  uiDistDir,
});

app.listen(config.web.port, () => {
  logger.info(`Portal web escuchando en http://localhost:${config.web.port}`);
  if (config.web.sessionSecret === 'dev-insecure-secret-change-me') {
    logger.warn('SESSION_SECRET por defecto — define uno propio en .env para producción.');
  }
});
```

- [ ] **Step 3: Verificar typecheck y arranque**

Run: `npx tsc --noEmit`
Expected: 0 errores.

Run (humo, 5s): `npx ts-node-dev --transpile-only src/web/server.ts &` luego `curl -s -o /dev/null -w "%{http_code}" http://localhost:4000/api/me` y matar el proceso.
Expected: responde `401` (sin sesión) — confirma que la API levanta. (Si `curl` no está disponible en el entorno, omite este paso y confía en `tsc` + la suite.)

- [ ] **Step 4: Ejecutar la suite completa**

Run: `npm test`
Expected: PASS — todos los tests (Fase 1 + userStore + auth + jobsRouter).

- [ ] **Step 5: Commit**

```bash
git add src/web/app.ts src/web/server.ts
git commit -m "feat(web): createApp + server (monta API y sirve la UI)"
```

---

## Task 7: Scaffold de la UI (Vite React TS) + marca H2O

**Files:**
- Create: `web/ui/package.json`, `web/ui/vite.config.ts`, `web/ui/tsconfig.json`, `web/ui/tsconfig.node.json`, `web/ui/index.html`, `web/ui/src/main.tsx`, `web/ui/src/theme.css`, `web/ui/src/App.tsx`

**Interfaces:**
- Produces: una app Vite React TS que arranca (`npm run dev`) y compila (`npm run build` → `web/ui/dist`), con los tokens de marca H2O y un layout base. Proxy `/api` → `http://localhost:4000` en dev.

Nota de toolchain: incluir el override de rollup-wasm (ver Global Constraints) para evitar el falso positivo de Windows Defender.

- [ ] **Step 1: `web/ui/package.json`**

```json
{
  "name": "h2o-portal-ui",
  "private": true,
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview",
    "test": "vitest run"
  },
  "dependencies": {
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "react-router-dom": "^6.28.0"
  },
  "devDependencies": {
    "@types/react": "^18.3.12",
    "@types/react-dom": "^18.3.1",
    "@vitejs/plugin-react": "^4.3.4",
    "typescript": "^5.3.3",
    "vite": "^5.4.11",
    "vitest": "^2.1.8",
    "jsdom": "^25.0.1",
    "@testing-library/react": "^16.1.0",
    "@testing-library/jest-dom": "^6.6.3"
  },
  "overrides": {
    "rollup": "npm:@rollup/wasm-node@4.62.2"
  }
}
```

Run: `cd web/ui && npm install`
Expected: instala sin que Defender rompa el build (override wasm activo).

- [ ] **Step 2: `web/ui/vite.config.ts`**

```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:4000',
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/setupTests.ts'],
  },
});
```

- [ ] **Step 3: `web/ui/tsconfig.json` y `web/ui/tsconfig.node.json`**

`web/ui/tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "types": ["vitest/globals", "@testing-library/jest-dom"]
  },
  "include": ["src"],
  "references": [{ "path": "./tsconfig.node.json" }]
}
```

`web/ui/tsconfig.node.json`:
```json
{
  "compilerOptions": {
    "composite": true,
    "skipLibCheck": true,
    "module": "ESNext",
    "moduleResolution": "bundler",
    "allowSyntheticDefaultImports": true,
    "strict": true,
    "noEmit": true
  },
  "include": ["vite.config.ts"]
}
```

- [ ] **Step 4: `web/ui/index.html`** (incluye Kumbh Sans de Google Fonts)

```html
<!doctype html>
<html lang="es">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Portal de Endosos — H2O</title>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=Kumbh+Sans:wght@400;500;600;700&display=swap" rel="stylesheet" />
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 5: `web/ui/src/theme.css`** (tokens de marca H2O)

```css
:root {
  --h2o-navy: #2B2B5E;
  --h2o-blue: #0960A8;
  --h2o-cyan: #00CDE5;
  --h2o-gray: #82828A;
  --h2o-surface: #F0EFF4;
  --h2o-surface-2: #F4F3F8;
  --h2o-white: #FFFFFF;
  --h2o-radius: 12px;
  --h2o-shadow: 0 4px 16px rgba(43, 43, 94, 0.08);
}
* { box-sizing: border-box; }
body {
  margin: 0;
  font-family: "Kumbh Sans", system-ui, sans-serif;
  background: var(--h2o-surface);
  color: var(--h2o-navy);
}
button {
  font-family: inherit;
  cursor: pointer;
  border: none;
  border-radius: 8px;
  padding: 10px 16px;
  font-weight: 600;
  background: var(--h2o-blue);
  color: var(--h2o-white);
}
button.secondary { background: var(--h2o-surface-2); color: var(--h2o-navy); }
button:disabled { opacity: 0.5; cursor: not-allowed; }
input, select, textarea {
  font-family: inherit;
  width: 100%;
  padding: 9px 11px;
  border: 1px solid #d8d7e0;
  border-radius: 8px;
  background: var(--h2o-white);
  color: var(--h2o-navy);
}
.card {
  background: var(--h2o-white);
  border-radius: var(--h2o-radius);
  box-shadow: var(--h2o-shadow);
  padding: 20px;
}
.app-header {
  background: var(--h2o-navy);
  color: var(--h2o-white);
  padding: 14px 24px;
  display: flex; align-items: center; gap: 12px;
  font-weight: 700;
}
.app-header .dot { width: 12px; height: 12px; border-radius: 50%; background: var(--h2o-cyan); }
.container { max-width: 920px; margin: 24px auto; padding: 0 16px; }
.field { margin-bottom: 12px; }
.field label { display: block; font-size: 13px; font-weight: 600; margin-bottom: 4px; color: var(--h2o-gray); }
.row { display: flex; gap: 12px; flex-wrap: wrap; }
.badge { padding: 2px 10px; border-radius: 999px; font-size: 12px; font-weight: 600; }
.badge.queued { background: #e7eefc; color: var(--h2o-blue); }
.badge.processing { background: #e0faff; color: #0782a0; }
.badge.done { background: #e3f8ec; color: #1b8a4b; }
.badge.failed, .badge.needs_review { background: #fdecec; color: #c0392b; }
.error { color: #c0392b; font-size: 13px; }
```

- [ ] **Step 6: `web/ui/src/main.tsx` y `web/ui/src/App.tsx`**

`web/ui/src/main.tsx`:
```tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import './theme.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);
```

`web/ui/src/App.tsx` (placeholder de layout; las rutas reales se añaden en Task 9):
```tsx
import { Routes, Route, Navigate } from 'react-router-dom';

function Placeholder({ title }: { title: string }) {
  return (
    <div className="container">
      <div className="card">{title}</div>
    </div>
  );
}

export default function App() {
  return (
    <>
      <header className="app-header"><span className="dot" /> Portal de Endosos H2O</header>
      <Routes>
        <Route path="/" element={<Placeholder title="Inicio" />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
}
```

- [ ] **Step 7: `web/ui/src/setupTests.ts`**

```ts
import '@testing-library/jest-dom';
```

- [ ] **Step 8: Verificar build**

Run: `cd web/ui && npm run build`
Expected: compila a `web/ui/dist` sin errores (override wasm evita el problema de Defender).

- [ ] **Step 9: Commit**

```bash
git add web/ui/package.json web/ui/package-lock.json web/ui/vite.config.ts web/ui/tsconfig.json web/ui/tsconfig.node.json web/ui/index.html web/ui/src/main.tsx web/ui/src/App.tsx web/ui/src/theme.css web/ui/src/setupTests.ts
git commit -m "feat(ui): scaffold Vite React + tema de marca H2O"
```

---

## Task 8: Tipos y cliente API de la UI

**Files:**
- Create: `web/ui/src/types.ts`
- Create: `web/ui/src/api.ts`

**Interfaces:**
- Produces:
  - `types.ts`: tipos locales de la UI — `CommandType` (los 4), `UICommand` (union), `JobInputUI`, `JobSummary` (lo que devuelve la API), `JobStatus`.
  - `api.ts`: `login`, `logout`, `me`, `createJob`, `listJobs`, `getJob` — wrappers `fetch` con `credentials: 'include'` y manejo de errores.

- [ ] **Step 1: `web/ui/src/types.ts`**

```ts
export type CommandType = 'ADD_VEHICLE' | 'UPDATE_VEHICLE_VALUE' | 'DELETE_VEHICLE_VALUE' | 'NO_CHANGE';

export type UICommand =
  | { type: 'NO_CHANGE'; rawText: string }
  | { type: 'ADD_VEHICLE'; rawText: string; vin: string; year: string; description: string; value?: string; effectiveDate: string }
  | { type: 'UPDATE_VEHICLE_VALUE'; rawText: string; vin: string; value: string }
  | { type: 'DELETE_VEHICLE_VALUE'; rawText: string; vin: string };

export interface JobInputUI {
  mode: 'existing_client';
  clientName: string;
  usdot?: string;
  language: 'es' | 'en';
  notifyTo: string;
  commands: UICommand[];
}

export type JobStatus = 'queued' | 'processing' | 'done' | 'failed' | 'needs_review';

export interface JobSummary {
  id: string;
  status: JobStatus;
  clientName: string;
  usdot?: string;
  commands: UICommand[];
  notifyTo: string;
  createdBy: string;
  createdAt: string;
  resultSummary?: string;
  resultFiles?: string[];
  errorMessage?: string;
}
```

- [ ] **Step 2: `web/ui/src/api.ts`**

```ts
import { JobInputUI, JobSummary } from './types';

async function req<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, { credentials: 'include', headers: { 'Content-Type': 'application/json' }, ...options });
  if (!res.ok) {
    let body: any = {};
    try { body = await res.json(); } catch { /* ignore */ }
    const err = new Error(body.error || body.errors?.join('; ') || `HTTP ${res.status}`);
    (err as any).status = res.status;
    throw err;
  }
  return res.status === 204 ? (undefined as T) : res.json();
}

export const api = {
  login: (username: string, password: string) =>
    req<{ user: string }>('/api/login', { method: 'POST', body: JSON.stringify({ username, password }) }),
  logout: () => req<{ ok: true }>('/api/logout', { method: 'POST' }),
  me: () => req<{ user: string }>('/api/me'),
  createJob: (job: JobInputUI) =>
    req<{ id: string }>('/api/jobs', { method: 'POST', body: JSON.stringify(job) }),
  listJobs: () => req<JobSummary[]>('/api/jobs'),
  getJob: (id: string) => req<JobSummary>(`/api/jobs/${id}`),
};
```

- [ ] **Step 3: Verificar typecheck**

Run: `cd web/ui && npx tsc -b`
Expected: 0 errores.

- [ ] **Step 4: Commit**

```bash
git add web/ui/src/types.ts web/ui/src/api.ts
git commit -m "feat(ui): tipos y cliente API"
```

---

## Task 9: Login + ruta protegida + layout autenticado

**Files:**
- Create: `web/ui/src/pages/Login.tsx`
- Create: `web/ui/src/auth.tsx` (contexto de sesión + RequireAuth)
- Modify: `web/ui/src/App.tsx`

**Interfaces:**
- Consumes: `api` (Task 8).
- Produces: contexto `useAuth()` con `{ user, setUser }`; componente `RequireAuth`; página `Login`; `App` con rutas `/login`, `/` (builder, protegida), `/jobs` (protegida) — las páginas reales llegan en Tasks 10-11, aquí van como placeholders protegidos.

- [ ] **Step 1: `web/ui/src/auth.tsx`**

```tsx
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
```

- [ ] **Step 2: `web/ui/src/pages/Login.tsx`**

```tsx
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
            <label>Usuario</label>
            <input value={username} onChange={e => setUsername(e.target.value)} autoFocus />
          </div>
          <div className="field">
            <label>Contraseña</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} />
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
```

- [ ] **Step 3: Reescribir `web/ui/src/App.tsx`**

```tsx
import { Routes, Route, Navigate, Link, useNavigate } from 'react-router-dom';
import { AuthProvider, RequireAuth, useAuth } from './auth';
import { api } from './api';
import Login from './pages/Login';

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
        <Route path="/" element={<RequireAuth><Placeholder title="Builder (Task 10)" /></RequireAuth>} />
        <Route path="/jobs" element={<RequireAuth><Placeholder title="Historial (Task 11)" /></RequireAuth>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AuthProvider>
  );
}
```

- [ ] **Step 4: Verificar build**

Run: `cd web/ui && npm run build`
Expected: compila sin errores.

- [ ] **Step 5: Commit**

```bash
git add web/ui/src/auth.tsx web/ui/src/pages/Login.tsx web/ui/src/App.tsx
git commit -m "feat(ui): login, contexto de sesión y rutas protegidas"
```

---

## Task 10: CommandForm + JobBuilder (armar y enviar endoso)

**Files:**
- Create: `web/ui/src/components/CommandForm.tsx`
- Create: `web/ui/src/components/CommandForm.test.tsx`
- Create: `web/ui/src/pages/JobBuilder.tsx`
- Modify: `web/ui/src/App.tsx` (usar JobBuilder en `/`)

**Interfaces:**
- Consumes: `UICommand`, `CommandType`, `JobInputUI`, `api` (Task 8).
- Produces:
  - `defaultCommand(type: CommandType): UICommand` — fábrica de un comando vacío del tipo dado.
  - `<CommandForm value onChange />` — renderiza los campos condicionales según `value.type` y emite el `UICommand` actualizado.
  - Página `JobBuilder`: header de cliente (clientName, usdot, notifyTo, language) + lista de `CommandForm` apilables (agregar/quitar) + enviar → `api.createJob`.

- [ ] **Step 1: Escribir el test que falla** (`web/ui/src/components/CommandForm.test.tsx`)

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import CommandForm, { defaultCommand } from './CommandForm';

describe('CommandForm', () => {
  it('defaultCommand crea un ADD_VEHICLE vacío con los campos esperados', () => {
    const cmd = defaultCommand('ADD_VEHICLE');
    expect(cmd.type).toBe('ADD_VEHICLE');
    expect(cmd).toHaveProperty('vin', '');
    expect(cmd).toHaveProperty('effectiveDate', '');
  });

  it('editar el VIN de un ADD_VEHICLE emite el comando actualizado', () => {
    const onChange = vi.fn();
    render(<CommandForm value={defaultCommand('ADD_VEHICLE')} onChange={onChange} />);
    const vin = screen.getByLabelText(/VIN/i);
    fireEvent.change(vin, { target: { value: '4V4NC9TG97N436292' } });
    expect(onChange).toHaveBeenCalled();
    const last = onChange.mock.calls.at(-1)![0];
    expect(last).toMatchObject({ type: 'ADD_VEHICLE', vin: '4V4NC9TG97N436292' });
  });

  it('NO_CHANGE no muestra campos de VIN', () => {
    render(<CommandForm value={defaultCommand('NO_CHANGE')} onChange={() => {}} />);
    expect(screen.queryByLabelText(/VIN/i)).toBeNull();
  });
});
```

- [ ] **Step 2: Ejecutar el test para verificar que falla**

Run: `cd web/ui && npx vitest run src/components/CommandForm.test.tsx`
Expected: FAIL — módulo no encontrado.

- [ ] **Step 3: Implementar `web/ui/src/components/CommandForm.tsx`**

```tsx
import { CommandType, UICommand } from '../types';

export function defaultCommand(type: CommandType): UICommand {
  switch (type) {
    case 'ADD_VEHICLE':
      return { type, rawText: '', vin: '', year: '', description: '', value: '', effectiveDate: '' };
    case 'UPDATE_VEHICLE_VALUE':
      return { type, rawText: '', vin: '', value: '' };
    case 'DELETE_VEHICLE_VALUE':
      return { type, rawText: '', vin: '' };
    case 'NO_CHANGE':
      return { type, rawText: '' };
  }
}

export const COMMAND_LABELS: Record<CommandType, string> = {
  ADD_VEHICLE: 'Agregar vehículo',
  UPDATE_VEHICLE_VALUE: 'Actualizar valor de vehículo',
  DELETE_VEHICLE_VALUE: 'Borrar valor de vehículo',
  NO_CHANGE: 'Sin cambios (Recibido)',
};

export default function CommandForm({ value, onChange }: { value: UICommand; onChange: (c: UICommand) => void }) {
  const set = (patch: Partial<UICommand>) => onChange({ ...value, ...patch } as UICommand);

  if (value.type === 'NO_CHANGE') {
    return <p style={{ color: 'var(--h2o-gray)', margin: 0 }}>Responde “Recibido” sin modificar nada.</p>;
  }

  return (
    <>
      <div className="field">
        <label>VIN</label>
        <input value={value.vin} onChange={e => set({ vin: e.target.value })} />
      </div>

      {value.type === 'ADD_VEHICLE' && (
        <>
          <div className="row">
            <div className="field" style={{ flex: 1 }}>
              <label>Año</label>
              <input value={value.year} onChange={e => set({ year: e.target.value })} placeholder="2007" />
            </div>
            <div className="field" style={{ flex: 2 }}>
              <label>Descripción</label>
              <input value={value.description} onChange={e => set({ description: e.target.value })} placeholder="VOLVO" />
            </div>
          </div>
          <div className="row">
            <div className="field" style={{ flex: 1 }}>
              <label>Valor (opcional)</label>
              <input value={value.value ?? ''} onChange={e => set({ value: e.target.value })} placeholder="$15,000" />
            </div>
            <div className="field" style={{ flex: 1 }}>
              <label>Effective Date</label>
              <input value={value.effectiveDate} onChange={e => set({ effectiveDate: e.target.value })} placeholder="03/05/2026" />
            </div>
          </div>
        </>
      )}

      {value.type === 'UPDATE_VEHICLE_VALUE' && (
        <div className="field">
          <label>Nuevo valor</label>
          <input value={value.value} onChange={e => set({ value: e.target.value })} placeholder="15,000" />
        </div>
      )}
    </>
  );
}
```

- [ ] **Step 4: Ejecutar el test para verificar que pasa**

Run: `cd web/ui && npx vitest run src/components/CommandForm.test.tsx`
Expected: PASS — 3 tests.

- [ ] **Step 5: Implementar `web/ui/src/pages/JobBuilder.tsx`**

```tsx
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CommandType, UICommand, JobInputUI } from '../types';
import { api } from '../api';
import CommandForm, { defaultCommand, COMMAND_LABELS } from '../components/CommandForm';

const TYPES: CommandType[] = ['ADD_VEHICLE', 'UPDATE_VEHICLE_VALUE', 'DELETE_VEHICLE_VALUE', 'NO_CHANGE'];

export default function JobBuilder() {
  const [clientName, setClientName] = useState('');
  const [usdot, setUsdot] = useState('');
  const [notifyTo, setNotifyTo] = useState('');
  const [language, setLanguage] = useState<'es' | 'en'>('es');
  const [commands, setCommands] = useState<UICommand[]>([defaultCommand('ADD_VEHICLE')]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const nav = useNavigate();

  const updateCmd = (i: number, c: UICommand) => setCommands(cs => cs.map((x, j) => (j === i ? c : x)));
  const removeCmd = (i: number) => setCommands(cs => cs.filter((_, j) => j !== i));
  const addCmd = (t: CommandType) => setCommands(cs => [...cs, defaultCommand(t)]);

  const canSubmit = clientName.trim() && notifyTo.trim() && commands.length > 0;

  async function submit() {
    setBusy(true); setError('');
    const job: JobInputUI = {
      mode: 'existing_client',
      clientName: clientName.trim(),
      usdot: usdot.trim() || undefined,
      notifyTo: notifyTo.trim(),
      language,
      commands,
    };
    try {
      const { id } = await api.createJob(job);
      nav(`/jobs?new=${id}`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="container">
      <div className="card" style={{ marginBottom: 16 }}>
        <h2 style={{ marginTop: 0 }}>Nuevo endoso</h2>
        <div className="row">
          <div className="field" style={{ flex: 2 }}>
            <label>Cliente (nombre en NowCerts)</label>
            <input value={clientName} onChange={e => setClientName(e.target.value)} />
          </div>
          <div className="field" style={{ flex: 1 }}>
            <label>USDOT (opcional)</label>
            <input value={usdot} onChange={e => setUsdot(e.target.value)} />
          </div>
        </div>
        <div className="row">
          <div className="field" style={{ flex: 2 }}>
            <label>Notificar a (email)</label>
            <input value={notifyTo} onChange={e => setNotifyTo(e.target.value)} placeholder="agente@h2oins.com" />
          </div>
          <div className="field" style={{ flex: 1 }}>
            <label>Idioma</label>
            <select value={language} onChange={e => setLanguage(e.target.value as 'es' | 'en')}>
              <option value="es">Español</option>
              <option value="en">English</option>
            </select>
          </div>
        </div>
      </div>

      {commands.map((c, i) => (
        <div className="card" style={{ marginBottom: 12 }} key={i}>
          <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <strong>{COMMAND_LABELS[c.type]}</strong>
            <button className="secondary" onClick={() => removeCmd(i)} disabled={commands.length === 1}>Quitar</button>
          </div>
          <CommandForm value={c} onChange={cmd => updateCmd(i, cmd)} />
        </div>
      ))}

      <div className="card">
        <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--h2o-gray)' }}>Agregar acción</label>
        <div className="row" style={{ marginTop: 8 }}>
          {TYPES.map(t => (
            <button key={t} className="secondary" onClick={() => addCmd(t)}>+ {COMMAND_LABELS[t]}</button>
          ))}
        </div>
        {error && <p className="error" style={{ marginTop: 12 }}>{error}</p>}
        <div style={{ marginTop: 16 }}>
          <button onClick={submit} disabled={!canSubmit || busy}>
            {busy ? 'Enviando…' : 'Enviar endoso'}
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Usar `JobBuilder` en `/`** (modificar `web/ui/src/App.tsx`)

Reemplazar el import placeholder y la ruta `/`:
```tsx
import JobBuilder from './pages/JobBuilder';
```
y en `<Routes>`:
```tsx
<Route path="/" element={<RequireAuth><JobBuilder /></RequireAuth>} />
```

- [ ] **Step 7: Verificar build + tests**

Run: `cd web/ui && npm run build && npx vitest run`
Expected: build OK; tests de CommandForm PASS.

- [ ] **Step 8: Commit**

```bash
git add web/ui/src/components/CommandForm.tsx web/ui/src/components/CommandForm.test.tsx web/ui/src/pages/JobBuilder.tsx web/ui/src/App.tsx
git commit -m "feat(ui): CommandForm + JobBuilder (armar y enviar endoso)"
```

---

## Task 11: Página de Historial/Estado + descargas

**Files:**
- Create: `web/ui/src/pages/Jobs.tsx`
- Modify: `web/ui/src/App.tsx` (usar Jobs en `/jobs`)

**Interfaces:**
- Consumes: `api.listJobs`, `api.getJob`, `JobSummary`.
- Produces: página `Jobs` que lista los jobs (más recientes primero) con su badge de estado, y permite descargar `resultFiles` vía `/api/jobs/:id/files/:name`. Auto-refresca cada 5s mientras haya jobs en `queued`/`processing`.

- [ ] **Step 1: Implementar `web/ui/src/pages/Jobs.tsx`**

```tsx
import { useEffect, useState, useCallback } from 'react';
import { api } from '../api';
import { JobSummary } from '../types';

function basename(p: string): string { return p.split(/[\\/]/).pop() || p; }

export default function Jobs() {
  const [jobs, setJobs] = useState<JobSummary[]>([]);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try { setJobs(await api.listJobs()); } catch (e) { setError((e as Error).message); }
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const pending = jobs.some(j => j.status === 'queued' || j.status === 'processing');
    if (!pending) return;
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [jobs, load]);

  return (
    <div className="container">
      <h2>Historial de endosos</h2>
      {error && <p className="error">{error}</p>}
      {jobs.length === 0 && <div className="card">Aún no hay endosos.</div>}
      {jobs.map(job => (
        <div className="card" style={{ marginBottom: 12 }} key={job.id}>
          <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <strong>{job.clientName}</strong>{job.usdot ? ` · USDOT ${job.usdot}` : ''}
              <div style={{ fontSize: 12, color: 'var(--h2o-gray)' }}>
                {job.commands.map(c => c.type).join(', ')} · por {job.createdBy} · {new Date(job.createdAt).toLocaleString()}
              </div>
            </div>
            <span className={`badge ${job.status}`}>{job.status}</span>
          </div>
          {job.resultSummary && <pre style={{ whiteSpace: 'pre-wrap', fontSize: 13, marginTop: 8 }}>{job.resultSummary}</pre>}
          {job.errorMessage && <p className="error">{job.errorMessage}</p>}
          {(job.resultFiles ?? []).length > 0 && (
            <div className="row" style={{ marginTop: 8 }}>
              {job.resultFiles!.map(f => (
                <a key={f} href={`/api/jobs/${job.id}/files/${encodeURIComponent(basename(f))}`}>{basename(f)}</a>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Usar `Jobs` en `/jobs`** (modificar `web/ui/src/App.tsx`)

```tsx
import Jobs from './pages/Jobs';
```
y:
```tsx
<Route path="/jobs" element={<RequireAuth><Jobs /></RequireAuth>} />
```

- [ ] **Step 3: Verificar build**

Run: `cd web/ui && npm run build`
Expected: compila sin errores.

- [ ] **Step 4: Commit**

```bash
git add web/ui/src/pages/Jobs.tsx web/ui/src/App.tsx
git commit -m "feat(ui): historial/estado de jobs con descargas y auto-refresh"
```

---

## Task 12: Smoke test end-to-end manual + README de uso

**Files:**
- Create: `docs/portal-web-uso.md`

**Interfaces:**
- Consumes: todo lo anterior.
- Produces: documento corto con los pasos exactos para correr el portal en local y probar el flujo completo; verificación manual de que un endoso enviado desde la UI aparece como job `queued`.

- [ ] **Step 1: Verificación manual end-to-end**

Ejecutar (documentar el resultado en el reporte de la tarea):
1. `npx ts-node src/web/seedUser.ts demo demo1234` → crea el usuario.
2. Arrancar API: `npm run web:dev` (queda escuchando en :4000).
3. Arrancar UI: `cd web/ui && npm run dev` (Vite en :5173, proxy a la API).
4. Abrir `http://localhost:5173`, login `demo`/`demo1234`.
5. Armar un endoso (cliente cualquiera, notifyTo un email, un comando `NO_CHANGE`) y enviar.
6. Confirmar redirección a Historial y que aparece el job con badge `queued`.
7. Verificar por DB que se encoló: `npx ts-node -e "import('./src/job/jobStore').then(m=>{const s=m.openJobStore('./data/jobs.db');console.log(s.listJobs().map(j=>({id:j.id,status:j.status,by:j.createdBy})));s.close();})"`

Expected: el job aparece en la cola con `status: 'queued'` y `createdBy: 'demo'`. (El bot, si está corriendo, lo tomará; sin bot, queda en cola — eso confirma que la web cumple su parte.)

- [ ] **Step 2: Escribir `docs/portal-web-uso.md`** con esos pasos (dev + build de producción: `cd web/ui && npm run build` y luego `npm run web` sirve la UI en `:4000`).

- [ ] **Step 3: Commit**

```bash
git add docs/portal-web-uso.md
git commit -m "docs: guía de uso del portal web (dev + prod local)"
```

---

## Self-Review

**1. Spec coverage (contra `2026-06-26-portal-web-endosos-design.md`, §6 Fase 2):**
- API Express + auth cuentas individuales → Tasks 1-6.
- `POST/GET /jobs`, `GET /:id`, descarga de archivos → Task 5.
- Reuso de Zod + jobStore (sin duplicar; invariante claimer único) → Tasks 5, 6 + Global Constraints.
- UI React/Vite mínima end-to-end (login, builder, historial) con marca H2O → Tasks 7-11.
- `createdBy` por usuario de sesión → Task 5.
- Subset de comandos → Global Constraints + Tasks 8, 10.
- Decisión "hoist de shared/": NO se hace (la API reutiliza `src/shared` directamente al estar en el mismo proyecto TS) → documentado en Architecture.
- Servicio Docker `web`: diferido (Task de compose marcada opcional fuera de este plan; la verificación es local). Nota: añadir `web` a docker-compose + `Dockerfile.web` es trabajo de Fase 2.5 una vez aprobado el flujo local.

**2. Placeholder scan:** sin TBD/TODO; todo el código está inline. Los "Placeholder" components de Tasks 7/9 son intencionales y se reemplazan en Tasks 10/11 (indicado explícitamente).

**3. Type consistency:** `JobStore`/`validateJobInput` se consumen con las firmas de Fase 1. `UserStore`/`openUserStore`, `createAuthRouter`/`requireAuth`/`sessionMiddleware`, `createJobsRouter(store, downloadsDir)`, `createApp(deps)` consistentes entre definición y consumo. UI: `UICommand`/`JobInputUI`/`JobSummary` consistentes entre `types.ts`, `api.ts`, `CommandForm`, `JobBuilder`, `Jobs`. `defaultCommand`/`COMMAND_LABELS` exportados por `CommandForm` y usados por `JobBuilder`.

**4. Ambigüedad:** la validación client-side es ligera a propósito (campos requeridos); el backend (Zod compartido) es autoritativo. Documentado.

---

## Próximas fases / pendientes
- **Fase 2.5 (opcional):** servicio `web` en docker-compose + `Dockerfile.web` (build de la UI + API) compartiendo `./data` y `./downloads`; endurecer auth para producción (secret real, cookie `secure` detrás de TLS/reverse-proxy).
- **Fase 3:** los 22 comandos (incl. `new_client`/`CREATE_INSURED`), validación Zod completa, formularios condicionales restantes, y pulido de branding con el plugin frontend-design.
