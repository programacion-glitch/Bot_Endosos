# Portal Web H2O Endosos — Guía de uso

Documento para ejecutar y probar el portal en local (dev y prod-local).

---

## Prerrequisitos

1. **Node 20+** y dependencias instaladas (`npm install` en la raíz; `npm install` también en `web/ui`).
2. **`.env`** en la raíz del proyecto con al menos:

   ```env
   SESSION_SECRET=cambia-este-secreto
   # Opcional — si no se definen, usan los defaults:
   WEB_PORT=4000
   JOBS_DB_PATH=./data/jobs.db
   USERS_DB_PATH=./data/users.db
   DOWNLOADS_PATH=./downloads
   ```

3. **Carpeta `data/`** existente (se crea sola en el primer arranque).

---

## 1. Crear un usuario

```bash
# Forma corta (usa el script npm):
npm run seed-user -- demo demo1234

# O directamente con ts-node:
npx ts-node src/web/seedUser.ts demo demo1234
```

El usuario queda en `data/users.db`. Ejecutar el mismo comando sobre un usuario existente actualiza su contraseña.

---

## 2. Modo desarrollo (hot-reload)

Abrir **dos terminales**:

**Terminal A — API (puerto 4000):**

```bash
npm run web:dev
```

**Terminal B — UI Vite (puerto 5173, proxy a la API):**

```bash
cd web/ui
npm run dev
```

Abrir **http://localhost:5173** en el navegador.

### Flujo de prueba

1. Iniciar sesión con `demo` / `demo1234`.
2. En el **Builder de Endoso**, completar:
   - Cliente: nombre cualquiera (ej. `Empresa Test`).
   - Notificar a: un email válido (ej. `ops@example.com`).
   - Idioma: Español o English.
   - Al menos un comando — p. ej. **NO_CHANGE** (sin campos adicionales).
3. Hacer clic en **Enviar**.
4. La app redirige al **Historial**; el endoso debe aparecer con badge **queued**.
5. Verificar por DB (opcional):

   ```bash
   npx ts-node -e "import('./src/job/jobStore').then(m=>{
     const s=m.openJobStore('./data/jobs.db');
     console.log(s.listJobs().map(j=>({id:j.id,status:j.status,by:j.createdBy})));
     s.close();
   })"
   ```

   Resultado esperado: objeto con `status: 'queued'` y `createdBy: 'demo'`.

> **Nota:** el job permanece en estado `queued` mientras el bot no esté corriendo.
> Eso confirma que la web ha cumplido su parte (encolar correctamente).
> Para que el bot procese los jobs, arrancar también: `npm run dev` (o el contenedor Docker).

---

## 3. Modo producción local (build completo)

**Paso 1 — compilar la UI:**

```bash
cd web/ui
npm run build
```

Esto genera `web/ui/dist/`.

**Paso 2 — compilar el servidor:**

```bash
npm run build
```

**Paso 3 — arrancar:**

```bash
npm run web
```

Abrir **http://localhost:4000** (la API sirve directamente la UI compilada).

---

## 4. Variables de entorno relevantes

| Variable | Default | Descripción |
|---|---|---|
| `SESSION_SECRET` | `dev-insecure-secret-change-me` | **Cambiar en producción** |
| `WEB_PORT` | `4000` | Puerto de escucha de la API |
| `JOBS_DB_PATH` | `./data/jobs.db` | Base de datos de la cola |
| `USERS_DB_PATH` | `./data/users.db` | Base de datos de usuarios web |
| `DOWNLOADS_PATH` | `./downloads` | Carpeta de archivos generados |

---

## 5. Notas de arquitectura

- La validación del formulario en la UI es ligera (campos requeridos). El backend aplica el esquema Zod completo — es el árbitro autoritativo.
- La UI (React + Vite) y la API (Express) comparten tipos a través de `src/shared/`. No hay duplicación de esquemas.
- En `fase 2.5` se añadirá el servicio `web` a `docker-compose` con `Dockerfile.web`.
- Para producción real: usar `SESSION_SECRET` fuerte, cookie `secure: true` detrás de TLS/reverse-proxy.
