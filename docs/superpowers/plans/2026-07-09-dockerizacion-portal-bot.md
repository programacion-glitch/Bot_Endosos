# Dockerización Portal + Bot y Usuarios — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dejar portal web y bot corriendo como servicios Docker durables (auto-reinicio), con la UI React servida desde el contenedor, datos SQLite migrados a un volumen nombrado, y usuarios `julian`/`emanuel` creados.

**Architecture:** Una sola imagen (base `mcr.microsoft.com/playwright:v1.58.2-jammy`) con backend compilado (`dist/`) + UI compilada (`web/ui/dist`). Dos servicios compose: `web` (`node dist/web/server.js`, puerto 80) y `bot` (`node dist/main.js`, worker de cola+IMAP). Volumen nombrado `botdata` para `/app/data` (SQLite WAL no es seguro en bind mounts de Windows compartidos); bind mounts para `downloads/` (compartido) y `logs/` (separado por servicio, porque winston rota `bot.log` y dos procesos rotando el mismo archivo chocan).

**Tech Stack:** Docker Desktop 29.3.1 / Compose v5.1.1 (ya instalados), Node 20 (en imagen), TypeScript, Express, better-sqlite3, React+Vite, vitest.

## Global Constraints

- Despliegue **solo LAN interna**, HTTP plano puerto 80 — nunca expuesto a internet.
- Usuarios a crear: `julian` y `emanuel`, contraseña `H2OinsEndosos2026` (ambos).
- Base de imagen pineada: `mcr.microsoft.com/playwright:v1.58.2-jammy` (coincide con playwright 1.58.2 del package.json).
- El host es Windows (PowerShell 5.1: NO usar `&&` para encadenar; usar `;` o pasos separados).
- Directorio del proyecto: `C:\Users\Usuario\Documents\Bots_H2O\Bot_Endosos` (proyecto compose `bot_endosos`).
- `.env` ya contiene `WEB_PORT=80` y `SESSION_SECRET`; NO commitear `.env`.
- El bot ya consume la cola (`src/main.ts` → `processOneQueuedJob`) — no tocar esa lógica.
- Los procesos host `dist/index.js` (PIDs ajenos) son de OTRO proyecto: no tocarlos.

---

### Task 1: Cookie de sesión — quitar `Secure` implícito por NODE_ENV (bug que rompe login en Docker)

La imagen pone `NODE_ENV=production` y `src/web/auth.ts:20` hace `secure: process.env.NODE_ENV === 'production'`. Cookie `Secure` sobre HTTP plano ⇒ el navegador no reenvía la cookie ⇒ login roto en el contenedor. El flag debe depender de una variable propia (`WEB_COOKIE_SECURE`, default apagado) y no de NODE_ENV. No se importa `config` en auth.ts a propósito: los tests web corren sin `.env` completo.

**Files:**
- Modify: `src/web/auth.ts:11-24` (función `sessionMiddleware`)
- Test: `src/web/auth.test.ts` (agregar describe al final)

**Interfaces:**
- Produces: `sessionMiddleware(secret)` sin cambio de firma; nueva env var opcional `WEB_COOKIE_SECURE` ('true' activa cookie Secure; ausente/otro valor = sin Secure).

- [ ] **Step 1: Escribir tests que fallan**

Agregar al final de `src/web/auth.test.ts` (dentro del archivo, después del `describe('auth', ...)` existente; reusa `users` y `makeApp` del módulo):

```ts
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
```

- [ ] **Step 2: Correr tests y verificar que fallan**

Run: `npx vitest run src/web/auth.test.ts`
Expected: FAIL — el primer test nuevo falla (con NODE_ENV=production el middleware actual pone `secure:true` y no emite Set-Cookie, así que `setCookie.length` es 0).

- [ ] **Step 3: Implementación mínima**

En `src/web/auth.ts`, reemplazar dentro de `sessionMiddleware`:

```ts
      // secure detrás de TLS en prod; requiere app.set('trust proxy', 1) si hay reverse proxy
      secure: process.env.NODE_ENV === 'production',
```

por:

```ts
      // El portal es HTTP interno (LAN). Secure solo si algún día hay TLS delante:
      // activar con WEB_COOKIE_SECURE=true (y app.set('trust proxy', 1) si hay proxy).
      secure: process.env.WEB_COOKIE_SECURE === 'true',
```

- [ ] **Step 4: Correr tests y verificar que pasan (todos, no solo auth)**

Run: `npx vitest run`
Expected: PASS todos los archivos (auth, userStore, jobsRouter, jobStore, queueSource, processJob, schemas).

- [ ] **Step 5: Commit**

```powershell
git add src/web/auth.ts src/web/auth.test.ts
git commit -m "fix(web): cookie Secure controlada por WEB_COOKIE_SECURE, no por NODE_ENV (login sobre HTTP interno)"
```

---

### Task 2: `.dockerignore` — excluir artefactos de la UI y datos del host

Las entradas `node_modules`/`dist` actuales solo aplican a la raíz del contexto (así funciona el matching de Docker): sin nuevas líneas, `COPY web/ui` arrastraría `web/ui/node_modules` (enorme) y builds viejos, y `COPY data` metería las DBs del host y el perfil de Chromium de Windows a la imagen. La imagen debe llevar de `data/` únicamente `agents.xlsx`.

**Files:**
- Modify: `.dockerignore`

**Interfaces:**
- Produces: contexto de build que incluye `web/ui` (solo fuente) y `data/agents.xlsx`; excluye DBs y perfil.

- [ ] **Step 1: Reemplazar el contenido completo de `.dockerignore` por:**

```
node_modules
dist
.git
.gitignore
.env
.env.example
.history
.playwright-mcp
.claude
.vscode
logs
downloads
docs
scripts
*.log
*.md
*.png
README*
tests
test_*.ts
manual_email_*.json
Dockerfile
.dockerignore
docker-compose.yml
web/ui/node_modules
web/ui/dist
data/*.db
data/*.db-shm
data/*.db-wal
data/playwright-profile
```

- [ ] **Step 2: Commit**

```powershell
git add .dockerignore
git commit -m "chore(docker): excluir UI compilada/node_modules y datos del host del contexto de build"
```

---

### Task 3: `Dockerfile` — agregar build de la UI React y copiarla al runtime

`src/web/server.ts` resuelve la UI en `path.resolve(__dirname, '../../web/ui/dist')`; con el código en `/app/dist/web/`, eso es `/app/web/ui/dist`. Hoy la imagen no construye ni copia la UI ⇒ el contenedor web no tendría interfaz.

**Files:**
- Modify: `Dockerfile`

**Interfaces:**
- Consumes: `.dockerignore` de Task 2 (para que `COPY web/ui ./` no arrastre node_modules).
- Produces: imagen con `/app/dist` (backend), `/app/web/ui/dist` (SPA), `/app/data/agents.xlsx`, `CMD node dist/main.js` (el servicio web lo sobreescribe con `command:` en compose).

- [ ] **Step 1: Reemplazar el contenido completo de `Dockerfile` por:**

```dockerfile
# syntax=docker/dockerfile:1.6

# ---------- Builder: compila TypeScript del backend ----------
FROM mcr.microsoft.com/playwright:v1.58.2-jammy AS builder

WORKDIR /app

# La imagen base ya trae Chromium en /ms-playwright; evitamos que npm lo vuelva a bajar.
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1

# Instalar TODAS las deps (incluidas dev) para poder compilar con tsc
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm \
    npm ci

# Compilar TS -> dist/
COPY tsconfig.json ./
COPY src ./src
RUN npx tsc

# Dejar solo deps de producción para copiar un node_modules limpio al runtime
RUN --mount=type=cache,target=/root/.npm \
    npm prune --omit=dev


# ---------- UI builder: compila la SPA React (portal) ----------
FROM mcr.microsoft.com/playwright:v1.58.2-jammy AS ui-builder

WORKDIR /ui

COPY web/ui/package.json web/ui/package-lock.json ./
RUN --mount=type=cache,target=/root/.npm \
    npm ci

COPY web/ui ./
RUN npm run build


# ---------- Runtime: imagen única para bot (CMD) y web (command en compose) ----------
FROM mcr.microsoft.com/playwright:v1.58.2-jammy

ENV TZ=America/Chicago \
    HEADLESS=true \
    NODE_ENV=production \
    PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
RUN ln -snf /usr/share/zoneinfo/$TZ /etc/localtime && echo $TZ > /etc/timezone

WORKDIR /app

# Copiar artefactos de los builders
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=ui-builder /ui/dist ./web/ui/dist
COPY package.json ./
# Solo agents.xlsx llega aquí (las DBs y el perfil quedan fuera por .dockerignore);
# en el primer arranque Docker copia este contenido al volumen botdata vacío.
COPY data ./data

# Crear carpetas runtime (las sobrescriben los volúmenes de docker-compose)
RUN mkdir -p logs/screenshots downloads

# Ejecutar JS compilado directamente (sin ts-node)
CMD ["node", "dist/main.js"]
```

- [ ] **Step 2: Commit**

```powershell
git add Dockerfile
git commit -m "feat(docker): construir la UI React en la imagen y servirla en /app/web/ui/dist"
```

---

### Task 4: `docker-compose.yml` — servicios web + bot con volumen compartido

**Files:**
- Modify: `docker-compose.yml`

**Interfaces:**
- Consumes: imagen de Task 3.
- Produces: servicios `web` (puerto 80, contenedor `endosos-web`) y `bot` (contenedor `endosos-bot`); volumen nombrado `botdata` (nombre real `bot_endosos_botdata`) montado en `/app/data` de ambos.

- [ ] **Step 1: Reemplazar el contenido completo de `docker-compose.yml` por:**

```yaml
services:
  web:
    build: .
    container_name: endosos-web
    restart: unless-stopped
    command: ["node", "dist/web/server.js"]
    env_file:
      - .env
    ports:
      - "80:80"
    volumes:
      # DBs SQLite (jobs/users) + agents.xlsx: volumen nombrado (WAL no es
      # seguro en bind mounts de Windows compartidos entre contenedores)
      - botdata:/app/data
      # El bot genera archivos aquí y el portal los sirve para descarga
      - ./downloads:/app/downloads
      # Logs separados por servicio: winston rota bot.log y dos procesos
      # rotando el mismo archivo se pisan
      - ./logs/web:/app/logs

  bot:
    build: .
    container_name: endosos-bot
    restart: unless-stopped
    env_file:
      - .env
    environment:
      - HEADLESS=true
    volumes:
      - botdata:/app/data
      - ./downloads:/app/downloads
      - ./logs/bot:/app/logs
    # Chromium necesita /dev/shm amplio (evita crashes con páginas pesadas)
    shm_size: '2gb'

volumes:
  botdata:
```

- [ ] **Step 2: Validar sintaxis**

Run: `docker compose config --quiet; if ($?) { "compose OK" }`
Expected: `compose OK` (sin errores de parseo).

- [ ] **Step 3: Commit**

```powershell
git add docker-compose.yml
git commit -m "feat(docker): servicios web (puerto 80) y bot con volumen botdata y logs separados"
```

---

### Task 5: Build de la imagen y verificación de contenido

**Files:** ninguno (verificación).

**Interfaces:**
- Consumes: Tasks 2–4.
- Produces: imagen construida con backend + UI + agents.xlsx, lista para el cutover.

- [ ] **Step 1: Build**

Run: `docker compose build`
Expected: termina sin error (primera vez tarda varios minutos: descarga base + 2×`npm ci` + tsc + vite build).

- [ ] **Step 2: Verificar artefactos dentro de la imagen**

Run:
```powershell
docker compose run --rm --no-deps web bash -lc "ls web/ui/dist/index.html dist/web/server.js dist/web/seedUser.js data/agents.xlsx && ls data | head -20"
```
Expected: los 4 archivos listados sin error; `data/` contiene SOLO `agents.xlsx` (sin `jobs.db`, `users.db` ni `playwright-profile`).
Nota: este `run` ya crea el volumen `bot_endosos_botdata` y Docker lo puebla con `agents.xlsx` de la imagen — comportamiento esperado.

- [ ] **Step 3: Verificar que el server arranca dentro del contenedor (sin publicar puerto)**

Run:
```powershell
docker compose run --rm --no-deps web bash -lc "timeout 8 node dist/web/server.js; true"
```
Expected: log `Portal web escuchando en http://localhost:80` y NINGÚN warning de `SESSION_SECRET por defecto`.

---

### Task 6: Cutover — parar proceso host, migrar datos, crear usuarios, levantar servicios

⚠️ Inicia el corte del puerto 80 (~2 min). Los pasos van en orden estricto: el portal host debe estar APAGADO antes de copiar las DBs (cierre limpio = WAL checkpointeado).

**Files:** ninguno (operación).

**Interfaces:**
- Consumes: imagen de Task 5; DBs del host en `.\data\`.
- Produces: contenedores `endosos-web` y `endosos-bot` corriendo; volumen con `jobs.db`, `users.db` (con `julian`/`emanuel`), `agents.xlsx`.

- [ ] **Step 1: Parar el portal host (árbol npm→node completo)**

Run:
```powershell
Get-CimInstance Win32_Process -Filter "Name='node.exe'" |
  Where-Object { $_.CommandLine -match 'npm-cli\.js.*run web|dist[/\\]web[/\\]server\.js' } |
  ForEach-Object { taskkill /PID $_.ProcessId /T /F }
```
Expected: 1–2 procesos terminados. NO tocar los `node dist/index.js` de otro proyecto.

- [ ] **Step 2: Verificar puerto 80 libre**

Run: `if (Get-NetTCPConnection -LocalPort 80 -State Listen -ErrorAction SilentlyContinue) { "OCUPADO" } else { "LIBRE" }`
Expected: `LIBRE`.

- [ ] **Step 3: Migrar DBs y agents.xlsx al volumen**

Run:
```powershell
docker compose run --rm --no-deps -v "C:\Users\Usuario\Documents\Bots_H2O\Bot_Endosos\data:/hostdata:ro" web bash -lc "cp -v /hostdata/jobs.db* /hostdata/users.db* /hostdata/agents.xlsx /app/data/ && ls -la /app/data"
```
Expected: `cp` lista jobs.db/users.db (y sus -shm/-wal si existen) + agents.xlsx; `ls` los muestra en `/app/data`. El perfil de Chromium NO se migra a propósito (perfil de Windows en Linux es frágil; el bot crea uno nuevo y hace login fresco en NowCerts).

- [ ] **Step 4: Crear usuarios julian y emanuel**

Run:
```powershell
docker compose run --rm --no-deps web node dist/web/seedUser.js julian H2OinsEndosos2026
docker compose run --rm --no-deps web node dist/web/seedUser.js emanuel H2OinsEndosos2026
```
Expected: `Usuario "julian" creado/actualizado...` y lo mismo para `emanuel`.

- [ ] **Step 5: Verificar usuarios en la DB del volumen**

Run:
```powershell
docker compose run --rm --no-deps web node -e 'const {openUserStore}=require("./dist/web/userStore");const s=openUserStore("./data/users.db");console.log("julian:",s.userExists("julian"),"| emanuel:",s.userExists("emanuel"));s.close();'
```
Expected: `julian: true | emanuel: true`.

- [ ] **Step 6: Levantar los servicios**

Run: `docker compose up -d; docker compose ps`
Expected: `endosos-web` y `endosos-bot` en estado `Up` (o `running`).

- [ ] **Step 7: Verificar portal (HTTP, API, login, cookie sin Secure)**

Run:
```powershell
(Invoke-WebRequest http://localhost/ -UseBasicParsing).StatusCode
try { Invoke-WebRequest http://localhost/api/me -UseBasicParsing } catch { $_.Exception.Response.StatusCode.value__ }
$r = Invoke-WebRequest http://localhost/api/login -Method POST -ContentType 'application/json' -Body '{"username":"julian","password":"H2OinsEndosos2026"}' -UseBasicParsing -SessionVariable web
$r.StatusCode
(Invoke-WebRequest http://localhost/api/me -UseBasicParsing -WebSession $web).Content
(Invoke-WebRequest http://endosos.h2oins.com/ -UseBasicParsing).StatusCode
```
Expected (en orden): `200`, `401`, `200`, `{"user":"julian"}`, `200`.

- [ ] **Step 8: Verificar bot y políticas de reinicio**

Run:
```powershell
docker compose logs bot --tail 30
docker inspect endosos-web endosos-bot --format '{{.Name}}: {{.HostConfig.RestartPolicy.Name}}'
```
Expected: logs del bot muestran `Bot ready. Worker único: drena la cola y luego IMAP...` y `Mailbox "H2O-Endosos" ready.` (o warning IMAP explicable); ambas políticas = `unless-stopped`.

- [ ] **Step 9: Commit del plan/checkboxes si hay cambios pendientes**

```powershell
git add docs/superpowers/plans/2026-07-09-dockerizacion-portal-bot.md
git commit -m "docs: plan de dockerización ejecutado hasta cutover"
```

---

### Task 7: Smoke test E2E real (portal → cola → bot → NowCerts)

⚠️ **GATE con el usuario antes de ejecutar:** este test hace login REAL en NowCerts, navega a un cliente REAL y envía un correo "Recibido" a `notifyTo`. Pedir al usuario: (a) nombre exacto de un cliente que exista en NowCerts, (b) su USDOT, (c) email destino (sugerir el del propio usuario). No ejecutar sin esos datos.

**Files:** ninguno (verificación).

**Interfaces:**
- Consumes: sesión `$web` del Task 6 Step 7 (o repetir login); contrato POST `/api/jobs` (`{mode, clientName, usdot?, commands, notifyTo, language}` — `createdBy` lo pone el servidor con el usuario de la sesión).

- [ ] **Step 1: Encolar job NO_CHANGE vía API (sustituir los 3 valores del gate)**

```powershell
$body = '{"mode":"existing_client","clientName":"<CLIENTE_REAL>","usdot":"<USDOT>","commands":[{"type":"NO_CHANGE","rawText":"smoke test docker"}],"notifyTo":"<EMAIL>","language":"es"}'
$job = Invoke-WebRequest http://localhost/api/jobs -Method POST -ContentType 'application/json' -Body $body -UseBasicParsing -WebSession $web
$job.StatusCode; $job.Content
```
Expected: `201` y `{"id":"<uuid>"}`.

- [ ] **Step 2: Observar al bot procesarlo**

Run: `docker compose logs -f bot` (cortar con Ctrl+C cuando termine)
Expected: `Procesando job de la cola: <id> (<cliente>)` → login NowCerts → `Job <id> completado.` (o `falló:` con motivo claro — un fallo explicable también valida el pipeline; investigar el motivo antes de dar por bueno).

- [ ] **Step 3: Verificar estado final vía API**

```powershell
(Invoke-WebRequest "http://localhost/api/jobs/<uuid>" -UseBasicParsing -WebSession $web).Content
```
Expected: `"status":"done"` (ideal) con `resultSummary`; el correo "Recibido" llega a `notifyTo`.

---

### Task 8: Durabilidad y acceso remoto — cierre

**Files:** ninguno (operación + comunicación).

- [ ] **Step 1: Verificar acceso desde OTRA PC de la LAN**

Pedir al usuario/TI que abran `http://endosos.h2oins.com` desde la PC que ya tenía DNS ajustado a 10.4.4.230. Contexto: el listener del puerto 80 cambió de `node.exe` a `com.docker.backend.exe` — si el firewall filtraba por programa, puede requerir la regla pendiente. Si NO carga, ejecutar en una consola **admin** del servidor:
```powershell
New-NetFirewallRule -DisplayName "Portal Endosos HTTP 80" -Direction Inbound -Action Allow -Protocol TCP -LocalPort 80 -Profile Domain
```
Expected: la URL carga desde la otra PC (con o sin la regla).

- [ ] **Step 2: Activar auto-arranque (manual del usuario, ya explicado en chat)**

- Docker Desktop → Settings ⚙️ → General → ✅ "Start Docker Desktop when you sign in to your computer".
- (Opcional, para sobrevivir reinicios sin login) `netplwiz` → desmarcar "Los usuarios deben escribir su nombre y contraseña".
Expected: usuario confirma el checkbox de Docker Desktop como mínimo.

- [ ] **Step 3: Entregar credenciales y estado final al usuario**

Informar: URL, usuarios `julian`/`emanuel` + contraseña, que el proceso host ya no existe (todo corre en Docker), y pendientes externos (reserva DHCP 10.4.4.148 con TI; regla firewall si aplicó; rotación de credenciales de infraestructura).

- [ ] **Step 4: Commit final de checkboxes del plan**

```powershell
git add docs/superpowers/plans/2026-07-09-dockerizacion-portal-bot.md
git commit -m "docs: plan de dockerización completado"
```
