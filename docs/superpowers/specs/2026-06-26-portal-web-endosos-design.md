# Diseño — Portal interno de Endosos H2O

**Fecha:** 2026-06-26
**Estado:** Aprobado para planificación
**Autor:** Equipo H2O + Claude

---

## 1. Problema y objetivo

Hoy el equipo interno de H2O redacta a mano los correos `BOT-END` / `BOT-DOCUMENTAR`
siguiendo reglas de formato específicas. Cuando el correo sale mal formado, el parser
de texto falla o malinterpreta los comandos, y el endoso debe reprocesarse — lo que
consume demasiado tiempo.

**Causa raíz:** el correo de texto libre es una entrada no estructurada. Los errores
de formato (orden de campos, typos en tipo de póliza, VIN mal escrito, fechas en
formato raro, comandos mal separados) son inevitables en ese medio.

**Objetivo:** reemplazar la redacción manual de correos por un **portal web interno**
con formularios validados que producen el dato ya limpio y tipado, y lo entregan al
bot a través de una cola estructurada que **omite el parser de texto**.

**Alcance del objetivo (honesto):** elimina los errores de *formato/parsing*. NO
elimina errores *semánticos* (elegir el VIN o el holder equivocado) ni los fallos de
la automatización Playwright contra NowCerts; esos son independientes.

---

## 2. Decisiones tomadas

| Tema | Decisión |
| --- | --- |
| Usuarios | Solo equipo interno H2O |
| Flujo actual reemplazado | El equipo interno deja de redactar correos a mano |
| Alcance v1 | **Todos** los comandos (22 tipos; `NO_CHANGE` es trivial, `ADD_DRIVER` está pausado en el bot hoy) |
| Estructura de envío | Un cliente + varios comandos (igual que un correo) |
| Hosting | Servidor interno / LAN, junto al bot Docker |
| Canal email | **Se mantiene como respaldo** (IMAP sigue activo) |
| Integración | **Enfoque B**: cola de jobs estructurados (SQLite) |
| Stack web | React + Vite + API Node/Express, todo TypeScript |
| Auth | Cuentas individuales (sella `createdBy` por job) |
| Branding | Paleta oficial h2oins.com + Kumbh Sans, vía plugin `frontend-design` |

---

## 3. Hechos del código actual que condicionan el diseño

1. **La unidad de trabajo del bot es un `ParsedEmail`**
   (`src/types/index.ts`): `{ clientName?, usdot?, dba?, commands: Command[], from, to, language, sendTo?, ... }`.
   El núcleo de ejecución es `dispatchCommands(page, email)` (`src/actions/dispatcher.ts`),
   que recorre los `Command[]` tipados y ejecuta cada acción. **El formulario solo
   necesita producir ese mismo objeto.**

2. **El bot procesa de a un trabajo a la vez** (`src/main.ts`): por cada correo abre un
   navegador, procesa y lo cierra. Es **un solo worker** contra NowCerts. Por tanto los
   jobs del portal deben **encolarse y drenarse uno por uno**; no se corren dos sesiones
   en paralelo.

3. **`processEmail` está acoplado a IMAP** (usa `raw.uid`, `markAsSeen`, `moveToFolder`).
   Hay que separar la lógica de "procesar un job" de la "fuente IMAP".

4. **Validación de coherencia existente** (`validateCoherence` en `main.ts`):
   `BOT-DOCUMENTAR` ⇒ debe incluir `CREATE_INSURED`; `BOT-END` ⇒ no puede incluirlo.
   El portal replica esto con el selector de modo (cliente nuevo vs existente).

---

## 4. Arquitectura

Workspace nuevo dentro del mismo repo, con un contrato de tipos único compartido.

```
Bot_Endosos/
├── src/                  ← bot actual (Playwright) — refactor mínimo
│   ├── actions/          ← SIN CAMBIOS (dispatcher + acciones)
│   ├── email/            ← SIN CAMBIOS (sigue como fuente de respaldo)
│   ├── job/              ← NUEVO: processJob() + queueSource (poller) + jobStore
│   └── main.ts           ← refactor: un worker que drena cola + IMAP
├── shared/               ← NUEVO: tipos Command/Job + esquemas Zod (fuente única)
├── web/
│   ├── api/              ← NUEVO: backend Node/Express TS
│   └── ui/               ← NUEVO: frontend React + Vite TS
└── data/jobs.db          ← NUEVO: cola SQLite (volumen Docker compartido)
```

### 4.1 Contrato compartido (`shared/`)

- Hoy los tipos viven en `src/types/index.ts`. Se mueven a `shared/` (o se re-exportan
  desde ahí) para que bot y web usen exactamente los mismos.
- Se definen **esquemas Zod por comando**; los tipos TS se derivan de Zod
  (`z.infer`). El **mismo Zod** se usa en tres lugares:
  1. Validación en el navegador (UX inmediata).
  2. Validación en la API (nunca confiar en el cliente).
  3. Contrato que describe lo que el bot consume.
- Esto es el respaldo de la promesa "dato limpio garantizado".

### 4.2 Cola de trabajos (SQLite)

Archivo `data/jobs.db` en un volumen Docker compartido entre `web` y el bot. Tabla `jobs`:

| Campo | Tipo | Notas |
| --- | --- | --- |
| `id` | TEXT (uuid) | PK |
| `status` | TEXT | `queued` \| `processing` \| `done` \| `failed` \| `needs_review` |
| `mode` | TEXT | `new_client` \| `existing_client` |
| `client_name` | TEXT | |
| `usdot` | TEXT | nullable |
| `dba` | TEXT | nullable |
| `commands_json` | TEXT | `Command[]` serializado (validado por Zod) |
| `notify_to` | TEXT | email del usuario que envía; recibe respuestas tipo `Recibido` (NO_CHANGE) y alertas "cliente no encontrado". El review email (`services@`) y el de error (`programacion@`) conservan sus destinatarios configurados |
| `language` | TEXT | `es` \| `en` |
| `created_by` | TEXT | usuario interno (auth) |
| `created_at` | TEXT | ISO |
| `started_at` / `finished_at` | TEXT | nullable |
| `result_summary` | TEXT | resumen por comando (✓/✗) |
| `result_files_json` | TEXT | rutas de PDFs/screenshots generados |
| `error_message` | TEXT | nullable |

Acceso vía un módulo `jobStore` (SQLite con `better-sqlite3`), compartido por la API
(escribe jobs, lee estado) y el bot (toma jobs, escribe resultado).

### 4.3 Refactor del bot

- Extraer `processJob(job: Job): Promise<JobResult>` desde `processEmail`. Contiene:
  abrir browser → (crear/navegar al cliente) → `dispatchCommands` → review email →
  notificaciones de error → devolver resultados. **`dispatcher.ts` y las acciones no se
  tocan.**
- `src/job/queueSource.ts`: poller que lee el job `queued` más antiguo, lo marca
  `processing`, llama a `processJob`, y escribe el resultado de vuelta.
- IMAP adaptado: el adaptador de correo construye un `Job` (vía parser actual) y llama
  al mismo `processJob`; luego hace `markAsSeen` / `moveToFolder` según resultado.
- **Un solo worker / mutex**: el loop principal garantiza que solo un job (de la cola o
  de IMAP) se ejecute a la vez.

### 4.4 docker-compose

- Servicio nuevo `web`: sirve el frontend compilado + la API. Comparte volúmenes
  `./data` (jobs.db) y `./downloads` (certificados) con el bot. Variables de entorno
  para auth y puerto.

---

## 5. Flujo de datos (end-to-end)

1. Usuario interno inicia sesión (cuenta individual).
2. Elige modo: **Cliente nuevo (Documentar)** o **Cliente existente (Endoso)**.
3. Captura identidad del cliente (nombre, USDOT, DBA).
4. Agrega **N tarjetas de comando**; cada una es un formulario tipado con campos
   condicionales (p.ej. Add Policy: AL → checkboxes de autos; GL → límites de liability;
   WC → EL; EXL → aggregate). Puede reordenarlas.
5. Validación Zod en el navegador → enviar.
6. La API **re-valida con el mismo Zod** + valida coherencia modo↔comandos → arma el
   `Job` → lo inserta en SQLite (`queued`).
7. El poller del bot toma el job → `processing` → `processJob`.
8. La UI muestra **estado en vivo + historial**, con descarga de los certificados.

---

## 6. Componentes y límites

| Unidad | Responsabilidad | Depende de |
| --- | --- | --- |
| `shared/` | Tipos `Command`/`Job` + Zod | — |
| `web/api` | Rutas + auth + `jobStore` (escribe jobs) | `shared/`, SQLite |
| `web/ui` | Login, JobBuilder, JobStatus, History | `shared/`, API |
| `src/job/jobStore` | Acceso SQLite (lee/escribe jobs) | `shared/`, SQLite |
| `src/job/queueSource` | Poller de la cola | `jobStore`, `processJob` |
| `src/job/processJob` | Ejecuta un job (núcleo) | `dispatcher`, browser, emailSender |
| `src/email/*` | Fuente IMAP de respaldo | `processJob` |

**Rutas API (v1):**

- `POST /api/login`, `POST /api/logout` (sesión).
- `POST /api/jobs` — valida (Zod + coherencia) y encola.
- `GET /api/jobs` — lista/historial (filtros por estado, fecha, usuario).
- `GET /api/jobs/:id` — detalle + estado + resultado.
- `GET /api/jobs/:id/files/:name` — descarga de certificado/screenshot.

**UI:** cada formulario de comando es un componente **dirigido por config de esquema**,
para que mantener los 22 sea uniforme y agregar uno nuevo sea trivial.

---

## 7. Diseño visual (plugin `frontend-design`)

**Paleta oficial (extraída de h2oins.com — tokens globales del sitio):**

| Rol | Color |
| --- | --- |
| Navy (marca/secundario) | `#2B2B5E` |
| Azul corporativo (primario) | `#0960A8` |
| Cian "agua" (acento) | `#00CDE5` |
| Gris texto | `#82828A` |
| Superficies claras | `#F0EFF4` / `#F4F3F8` |
| Blanco (tarjetas) | `#FFFFFF` |
| Tipografía | **Kumbh Sans** |

Layout: sidebar navy, contenido sobre `#F0EFF4`, tarjetas blancas redondeadas con
sombra suave, botones primarios azul, estados activos/progreso en cian (motivo de
agua), logo H2O. El JobBuilder se siente como "armar el endoso": header del cliente
arriba, comandos como tarjetas apilables (**+ Agregar acción**), resumen y enviar.
Responsive y accesible. Construido con el plugin `frontend-design`.

---

## 8. Manejo de errores

- **Validación en navegador** evita envíos mal formados (objetivo central); **la API
  revalida** siempre.
- **Job falla en el bot** → `failed` con mensaje + screenshot guardados y visibles en la
  UI; el correo de error a `programacion@h2oins.com` sigue disparándose. El usuario puede
  **clonar** el job fallido, corregir y reenviar.
- **Bot reiniciado a mitad de un job**: los jobs `processing` al arrancar se marcan
  `needs_review` (NO se reintentan solos: reejecutar podría duplicar, p.ej. agregar el
  vehículo dos veces). Se expone honestamente en la UI.
- **Email de respaldo** sigue funcionando sin cambios.

---

## 9. Testing

- Unit de esquemas Zod (válido/inválido por comando).
- Tests de API (`POST /jobs` valida + persiste; coherencia modo↔comandos).
- Test de `processJob` con `page`/dispatch mockeados (arma estructura correcta y llama a
  `dispatchCommands`).
- **Continuidad**: el JSON que produce el formulario = el input que ya consume
  `src/runManual.ts`, así cualquier job se prueba en seco con el runner manual existente.
- Frontend: tests de formularios condicionales (visibilidad de campos en Add Policy) +
  typecheck contra `shared/`.

---

## 10. Despliegue por fases

- **Fase 1** — `shared/` + Zod + `jobStore` + refactor del bot (`processJob` +
  `queueSource`). El bot ya acepta jobs encolados; el email sigue funcionando.
- **Fase 2** — API + UI mínima con unos pocos comandos end-to-end (probar el circuito
  completo).
- **Fase 3** — los 22 formularios + estado/historial + pulido de marca.
- El email se mantiene de respaldo todo el tiempo; se retira después si se decide.

---

## 11. Fuera de alcance (v1)

- Acceso de agentes/clientes externos.
- Retirar el canal de correo.
- Edición de endosos ya procesados (sí se permite clonar y reenviar).
- Métricas/dashboards más allá del historial básico de jobs.
