# Dockerización del portal + bot y creación de usuarios — Diseño

**Fecha:** 2026-07-09
**Rama:** `feat/portal-web-endosos`
**Estado:** Aprobado por el usuario

## Objetivo

Dejar el portal de endosos y el bot corriendo de forma durable en Docker
(reemplazando el proceso `npm run web` suelto que muere con la sesión), y crear
los usuarios `julian` y `emanuel` para el portal.

## Contexto (lo que ya existe — no se toca)

- El bot **ya consume la cola SQLite**: `src/main.ts` drena la cola del portal
  (`processOneQueuedJob`) antes de revisar IMAP, un job a la vez.
- `npm run seed-user <user> <pass>` ya crea/actualiza usuarios (bcrypt, upsert).
- Existen `Dockerfile`, `docker-compose.yml` y `.dockerignore`, pero solo
  cubren el bot (`node dist/main.js`) y **no construyen la UI de React**.
- Docker Desktop 29.3.1 + Compose v5.1.1 instalados y corriendo en el host.
- Lockfiles presentes en raíz y en `web/ui` → builds reproducibles con `npm ci`.
- DNS interno `endosos.h2oins.com` → 10.4.4.148 ya resuelve (zona en MEDUSA).

## Arquitectura

Una sola imagen Docker (base `mcr.microsoft.com/playwright:v1.58.2-jammy`,
la actual), dos servicios en compose que solo difieren en el comando:

| Servicio | Comando                   | Puerto  | Reinicio         |
|----------|---------------------------|---------|------------------|
| `web`    | `node dist/web/server.js` | `80:80` | `unless-stopped` |
| `bot`    | `node dist/main.js`       | —       | `unless-stopped` |

## Volúmenes

- **`botdata` (volumen nombrado de Docker) → `/app/data`**: contiene
  `jobs.db`, `users.db`, `agents.xlsx`. Se usa volumen nombrado (no bind mount
  a `C:\`) porque SQLite en modo WAL sobre bind mounts de Windows compartido
  entre dos contenedores es propenso a `database is locked` / corrupción.
- **`./downloads` (bind mount)** compartido entre ambos servicios: el bot
  genera archivos de resultado y el portal los sirve para descarga. No es
  SQLite, así que el bind mount es seguro y deja los archivos visibles en el host.
- **`./logs` (bind mount)**: logs visibles en el host.

## Cambios de código

0. **`src/web/auth.ts`** (hallazgo post-diseño): la cookie de sesión usa
   `secure: NODE_ENV === 'production'` y la imagen Docker define
   `NODE_ENV=production` → cookie `Secure` sobre HTTP plano rompería el login
   en el contenedor. Se cambia a `secure: WEB_COOKIE_SECURE === 'true'`
   (default apagado; el portal es HTTP interno).

1. **`Dockerfile`**: agregar etapa de build de la UI React
   (`COPY web/ui` → `npm ci` → `npm run build`) y copiar `web/ui/dist` al
   runtime en la ruta que espera el servidor
   (`path.resolve(__dirname, '../../web/ui/dist')` desde `dist/web/` →
   `/app/web/ui/dist`). Sin esto el contenedor web no tiene interfaz que servir.
2. **`docker-compose.yml`**: agregar servicio `web` (misma build, comando web,
   puerto 80, `env_file: .env`), definir volumen nombrado `botdata`, compartir
   `data` + `downloads` entre ambos servicios.

3. **`.dockerignore`**: agregar `web/ui/node_modules` y `web/ui/dist`. Las
   entradas actuales `node_modules` y `dist` solo aplican a la raíz del
   contexto (así funciona el matching de Docker), por lo que sin estas líneas
   `COPY web/ui` arrastraría los módulos instalados y builds viejos del host.
   El build de la UI ocurre dentro de la imagen a partir del código fuente.

## Migración de datos (una sola vez)

Copiar los `jobs.db`, `users.db` y `agents.xlsx` actuales de `./data` al
volumen `botdata` (via contenedor temporal), para conservar historial de jobs
y usuarios existentes. `agents.xlsx` es obligatorio para el bot.

## Usuarios

Crear con el seed dentro del volumen:

```
docker compose run --rm web npm run seed-user julian H2OinsEndosos2026
docker compose run --rm web npm run seed-user emanuel H2OinsEndosos2026
```

(Contraseña definida por el usuario; queda con hash bcrypt en `users.db`.)

## Cutover (≈1 min de corte en puerto 80)

1. `docker compose build`
2. Migrar data al volumen + crear usuarios
3. Parar el proceso host del portal (`npm run web`, PIDs actuales 17652/18156)
4. `docker compose up -d`
5. Verificar: HTTP 200 en `http://endosos.h2oins.com`, login de `julian`,
   y un job de prueba que fluya portal → cola → bot.

Los procesos `dist/index.js` (PIDs 14672/6168) son de otro proyecto: no se tocan.

## Manejo de errores

- `restart: unless-stopped` en ambos servicios: sobreviven crashes y reinicios
  del demonio Docker.
- El bot ya marca jobs `processing` huérfanos como `needs_review` al arrancar
  (`markStuckProcessingAsNeedsReview`) — cubre reinicios del contenedor a
  mitad de un job.
- `shm_size: 2gb` se mantiene para Chromium en el servicio bot (el web no lo
  necesita, pero no estorba si comparte config).

## Durabilidad — límite conocido

Docker Desktop en Windows corre en la sesión del usuario. Para sobrevivir
reinicios del equipo sin intervención:

1. Docker Desktop → Settings → General → ✅ "Start Docker Desktop when you
   sign in to your computer".
2. Auto-login de Windows: `netplwiz` → desmarcar "Los usuarios deben escribir
   su nombre y contraseña" (con la consideración de seguridad de acceso físico).

Ambos son ajustes manuales del usuario, fuera del alcance de código de este diseño.

## Fuera de alcance

- Regla de firewall puerto 80 (pendiente aparte, requiere consola admin).
- Reserva DHCP para 10.4.4.148 (pendiente con TI).
- HTTPS / proxy inverso.
- Cambio de contraseñas de infraestructura (pendiente aparte).

## Criterios de éxito

- `docker compose up -d` levanta `web` y `bot`; ambos reinician solos tras un
  `docker restart` o crash.
- `http://endosos.h2oins.com` responde 200 y sirve la UI desde el contenedor.
- `julian` y `emanuel` pueden iniciar sesión.
- Un job creado en el portal es procesado por el contenedor `bot` (estado
  `done`/`failed` visible en el portal) sin el proceso host corriendo.
