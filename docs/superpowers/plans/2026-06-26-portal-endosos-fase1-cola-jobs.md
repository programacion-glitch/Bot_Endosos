# Portal de Endosos — Fase 1: pipeline backend de la cola de jobs — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que el bot pueda tomar un job estructurado y validado desde una cola SQLite y ejecutarlo con el dispatcher existente, omitiendo el parser de texto, manteniendo el canal IMAP de respaldo.

**Architecture:** Se añade una capa de cola (SQLite vía `better-sqlite3`) y esquemas de validación (Zod) bajo `src/`. La lógica de "procesar un correo" se extrae de `main.ts` a un núcleo `processJob(email)` reutilizable por dos fuentes: el adaptador IMAP existente y un nuevo poller de la cola. Un único worker secuencial drena la cola y luego IMAP, garantizando una sola sesión de navegador a la vez (como hoy).

**Tech Stack:** TypeScript (CommonJS, target ES2020), Node 20, Playwright, `better-sqlite3`, `zod`, `vitest` (nuevo, para tests).

## Global Constraints

- TypeScript `strict: true` (de `tsconfig.json`). Sin `any` nuevos salvo los ya presentes en el código heredado.
- `tsconfig.json` tiene `rootDir: ./src` e `include: ["src/**/*"]`. **Todo el código nuevo va bajo `src/`.** La carpeta `shared/` a nivel raíz del spec se pospone a la Fase 2 (cuando entre el web app); en Fase 1 el código compartido vive en `src/shared/`.
- El bot procesa **un job a la vez** (un solo worker, una sesión de navegador). No introducir concurrencia.
- El canal IMAP (`BOT-END`/`BOT-DOCUMENTAR`) debe seguir funcionando sin cambios de comportamiento observable.
- Idempotencia: un job interrumpido NO se reintenta solo (se marca `needs_review`).
- Alcance de validación Zod en Fase 1: comandos `NO_CHANGE`, `ADD_VEHICLE`, `UPDATE_VEHICLE_VALUE`, `DELETE_VEHICLE_VALUE` y modo `existing_client`. El resto de comandos y el modo `new_client` (con `CREATE_INSURED`) llegan en fases posteriores junto a sus formularios. El **dispatcher ya soporta todos los comandos**; esta limitación es solo de la validación de entrada de la cola.
- Zona horaria de timestamps: ISO 8601 UTC (`new Date().toISOString()`), consistente con el almacenamiento.

---

## Estructura de archivos (Fase 1)

| Archivo | Responsabilidad | Acción |
| --- | --- | --- |
| `package.json` | deps (`better-sqlite3`, `zod`) + devDeps (`vitest`, `@types/better-sqlite3`) + script `test` | Modificar |
| `vitest.config.ts` | Config de tests | Crear |
| `src/shared/jobTypes.ts` | Tipos `Job`, `JobInput`, `JobStatus`, `JobMode` | Crear |
| `src/shared/schemas.ts` | Esquemas Zod de comandos (subset) + `jobInputSchema` | Crear |
| `src/shared/schemas.test.ts` | Tests de validación | Crear |
| `src/job/jobStore.ts` | Acceso SQLite a la cola | Crear |
| `src/job/jobStore.test.ts` | Tests del store (`:memory:`) | Crear |
| `src/job/processJob.ts` | Núcleo de ejecución (extraído de `main.ts`) | Crear |
| `src/job/processJob.test.ts` | Tests con dependencias mockeadas | Crear |
| `src/job/queueSource.ts` | Poller: Job → ParsedEmail → processJob → store | Crear |
| `src/job/queueSource.test.ts` | Tests con store fake + processJob mock | Crear |
| `src/config/config.ts` | Añadir `jobs.dbPath` y `queue.pollIntervalMs` | Modificar |
| `src/main.ts` | Refactor: usar `processJob` + worker unificado cola/IMAP | Modificar |

---

## Task 1: Test harness y dependencias

**Files:**
- Modify: `package.json`
- Create: `vitest.config.ts`
- Create: `src/shared/smoke.test.ts` (se elimina al final de la tarea)

**Interfaces:**
- Consumes: nada.
- Produces: comando `npm test` ejecutable con Vitest; dependencias `better-sqlite3`, `zod`, `vitest`, `@types/better-sqlite3` instaladas.

- [ ] **Step 1: Instalar dependencias**

Run:
```bash
npm install better-sqlite3@^11.8.1 zod@^3.24.1
npm install -D vitest@^2.1.8 @types/better-sqlite3@^7.6.12
```
Expected: `package.json` y `package-lock.json` actualizados sin errores. `better-sqlite3` baja binarios precompilados para Node 20.

- [ ] **Step 2: Añadir el script de test**

En `package.json`, dentro de `"scripts"`, añadir la línea `test`:

```json
  "scripts": {
    "start": "node dist/main.js",
    "dev": "ts-node-dev --respawn --transpile-only src/main.ts",
    "build": "tsc",
    "lint": "eslint src/**/*.ts",
    "test": "vitest run",
    "test:watch": "vitest"
  },
```

- [ ] **Step 3: Crear `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    globals: false,
  },
});
```

- [ ] **Step 4: Crear un smoke test temporal**

`src/shared/smoke.test.ts`:
```ts
import { describe, it, expect } from 'vitest';

describe('test harness', () => {
  it('runs', () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 5: Ejecutar el smoke test**

Run: `npm test`
Expected: PASS — 1 test passed.

- [ ] **Step 6: Borrar el smoke test y commit**

```bash
rm src/shared/smoke.test.ts
git add package.json package-lock.json vitest.config.ts
git commit -m "chore: añade Vitest, zod y better-sqlite3 para el pipeline de jobs"
```

---

## Task 2: Tipos de Job

**Files:**
- Create: `src/shared/jobTypes.ts`

**Interfaces:**
- Consumes: `Command`, `Language` de `src/types/index.ts`.
- Produces:
  - `type JobStatus = 'queued' | 'processing' | 'done' | 'failed' | 'needs_review'`
  - `type JobMode = 'new_client' | 'existing_client'`
  - `interface JobInput { mode: JobMode; clientName: string; usdot?: string; dba?: string; commands: Command[]; notifyTo: string; language: Language; createdBy: string }`
  - `interface Job extends JobInput { id: string; status: JobStatus; createdAt: string; startedAt?: string; finishedAt?: string; resultSummary?: string; resultFiles?: string[]; errorMessage?: string }`

- [ ] **Step 1: Crear `src/shared/jobTypes.ts`**

```ts
import { Command, Language } from '../types';

export type JobStatus = 'queued' | 'processing' | 'done' | 'failed' | 'needs_review';

export type JobMode = 'new_client' | 'existing_client';

/** Datos que entran al crear un job (lo que produce el formulario / la API). */
export interface JobInput {
  mode: JobMode;
  clientName: string;
  usdot?: string;
  dba?: string;
  commands: Command[];
  notifyTo: string;
  language: Language;
  createdBy: string;
}

/** Un job persistido en la cola. */
export interface Job extends JobInput {
  id: string;
  status: JobStatus;
  createdAt: string;
  startedAt?: string;
  finishedAt?: string;
  resultSummary?: string;
  resultFiles?: string[];
  errorMessage?: string;
}
```

- [ ] **Step 2: Verificar que typechequea**

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 3: Commit**

```bash
git add src/shared/jobTypes.ts
git commit -m "feat: tipos Job/JobInput/JobStatus para la cola de endosos"
```

---

## Task 3: Esquemas Zod de validación (subset)

**Files:**
- Create: `src/shared/schemas.ts`
- Test: `src/shared/schemas.test.ts`

**Interfaces:**
- Consumes: `zod`.
- Produces:
  - `commandSchema` (discriminated union de los 4 comandos del subset).
  - `jobInputSchema` (objeto de entrada; modo fijo `existing_client` en Fase 1).
  - `validateJobInput(data: unknown): { ok: true; value: JobInput } | { ok: false; errors: string[] }`

- [ ] **Step 1: Escribir el test que falla**

`src/shared/schemas.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { validateJobInput } from './schemas';

const baseJob = {
  mode: 'existing_client',
  clientName: 'Pix Test 2 2026 - 2027',
  usdot: '1234567',
  notifyTo: 'agente@h2oins.com',
  language: 'es',
  createdBy: 'maria',
  commands: [
    { type: 'UPDATE_VEHICLE_VALUE', rawText: '', vin: '4V4NC9TG97N436292', value: '15,000' },
  ],
};

describe('validateJobInput', () => {
  it('acepta un job válido de existing_client', () => {
    const res = validateJobInput(baseJob);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.value.commands).toHaveLength(1);
  });

  it('rechaza un comando ADD_VEHICLE con año inválido', () => {
    const res = validateJobInput({
      ...baseJob,
      commands: [{ type: 'ADD_VEHICLE', rawText: '', vin: 'ABC', year: '07', description: 'VOLVO', effectiveDate: '03/05/2026' }],
    });
    expect(res.ok).toBe(false);
  });

  it('rechaza un job sin comandos', () => {
    const res = validateJobInput({ ...baseJob, commands: [] });
    expect(res.ok).toBe(false);
  });

  it('rechaza notifyTo no-email', () => {
    const res = validateJobInput({ ...baseJob, notifyTo: 'no-es-email' });
    expect(res.ok).toBe(false);
  });

  it('rechaza un tipo de comando fuera del subset (CREATE_INSURED en Fase 1)', () => {
    const res = validateJobInput({
      ...baseJob,
      commands: [{ type: 'CREATE_INSURED', rawText: '' }],
    });
    expect(res.ok).toBe(false);
  });
});
```

- [ ] **Step 2: Ejecutar el test para verificar que falla**

Run: `npx vitest run src/shared/schemas.test.ts`
Expected: FAIL — `Cannot find module './schemas'` o `validateJobInput is not a function`.

- [ ] **Step 3: Implementar `src/shared/schemas.ts`**

```ts
import { z } from 'zod';
import { JobInput } from './jobTypes';

const rawText = z.string().default('');

export const noChangeSchema = z.object({
  type: z.literal('NO_CHANGE'),
  rawText,
});

export const addVehicleSchema = z.object({
  type: z.literal('ADD_VEHICLE'),
  rawText,
  vin: z.string().min(1, 'VIN requerido'),
  year: z.string().regex(/^\d{4}$/, 'Año debe tener 4 dígitos'),
  description: z.string().min(1, 'Descripción requerida'),
  value: z.string().optional(),
  effectiveDate: z.string().min(1, 'Effective Date requerida'),
  usage: z.string().optional(),
});

export const updateVehicleValueSchema = z.object({
  type: z.literal('UPDATE_VEHICLE_VALUE'),
  rawText,
  vin: z.string().min(1, 'VIN requerido'),
  value: z.string().min(1, 'Valor requerido'),
});

export const deleteVehicleValueSchema = z.object({
  type: z.literal('DELETE_VEHICLE_VALUE'),
  rawText,
  vin: z.string().min(1, 'VIN requerido'),
});

export const commandSchema = z.discriminatedUnion('type', [
  noChangeSchema,
  addVehicleSchema,
  updateVehicleValueSchema,
  deleteVehicleValueSchema,
]);

// Fase 1: solo modo existing_client (endosos). new_client + CREATE_INSURED en fase posterior.
export const jobInputSchema = z.object({
  mode: z.literal('existing_client'),
  clientName: z.string().min(1, 'Nombre de cliente requerido'),
  usdot: z.string().optional(),
  dba: z.string().optional(),
  commands: z.array(commandSchema).min(1, 'Se requiere al menos un comando'),
  notifyTo: z.string().email('notifyTo debe ser un email válido'),
  language: z.enum(['es', 'en']),
  createdBy: z.string().min(1, 'createdBy requerido'),
});

export function validateJobInput(
  data: unknown
): { ok: true; value: JobInput } | { ok: false; errors: string[] } {
  const parsed = jobInputSchema.safeParse(data);
  if (parsed.success) {
    return { ok: true, value: parsed.data as JobInput };
  }
  return {
    ok: false,
    errors: parsed.error.issues.map(i => `${i.path.join('.') || '(root)'}: ${i.message}`),
  };
}
```

- [ ] **Step 4: Ejecutar los tests para verificar que pasan**

Run: `npx vitest run src/shared/schemas.test.ts`
Expected: PASS — 5 tests passed.

- [ ] **Step 5: Commit**

```bash
git add src/shared/schemas.ts src/shared/schemas.test.ts
git commit -m "feat: esquemas Zod y validateJobInput para la cola (subset Fase 1)"
```

---

## Task 4: Job store (SQLite)

**Files:**
- Create: `src/job/jobStore.ts`
- Test: `src/job/jobStore.test.ts`

**Interfaces:**
- Consumes: `better-sqlite3`, `Job`, `JobInput`, `JobStatus` de `src/shared/jobTypes.ts`.
- Produces:
  - `interface JobStore { createJob(input: JobInput): Job; claimNextQueued(): Job | null; completeJob(id: string, summary: string, files: string[]): void; failJob(id: string, errorMessage: string, summary: string, files: string[]): void; getJob(id: string): Job | null; listJobs(): Job[]; markStuckProcessingAsNeedsReview(): number; close(): void }`
  - `function openJobStore(dbPath: string): JobStore`

- [ ] **Step 1: Escribir el test que falla**

`src/job/jobStore.test.ts`:
```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { openJobStore, JobStore } from './jobStore';
import { JobInput } from '../shared/jobTypes';

const input: JobInput = {
  mode: 'existing_client',
  clientName: 'Pix Test',
  usdot: '1234567',
  commands: [{ type: 'NO_CHANGE', rawText: '' }],
  notifyTo: 'a@h2oins.com',
  language: 'es',
  createdBy: 'maria',
};

let store: JobStore;

beforeEach(() => {
  store = openJobStore(':memory:');
});
afterEach(() => {
  store.close();
});

describe('jobStore', () => {
  it('crea un job en estado queued con id y createdAt', () => {
    const job = store.createJob(input);
    expect(job.id).toBeTruthy();
    expect(job.status).toBe('queued');
    expect(job.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(job.commands).toHaveLength(1);
  });

  it('claimNextQueued devuelve el más antiguo y lo pasa a processing', () => {
    const a = store.createJob(input);
    const claimed = store.claimNextQueued();
    expect(claimed?.id).toBe(a.id);
    expect(claimed?.status).toBe('processing');
    expect(store.getJob(a.id)?.status).toBe('processing');
  });

  it('claimNextQueued devuelve null si no hay queued', () => {
    expect(store.claimNextQueued()).toBeNull();
  });

  it('completeJob marca done con resumen y archivos', () => {
    const a = store.createJob(input);
    store.claimNextQueued();
    store.completeJob(a.id, '✓ NO_CHANGE: ok', ['/app/downloads/cert.pdf']);
    const j = store.getJob(a.id);
    expect(j?.status).toBe('done');
    expect(j?.resultSummary).toBe('✓ NO_CHANGE: ok');
    expect(j?.resultFiles).toEqual(['/app/downloads/cert.pdf']);
    expect(j?.finishedAt).toBeTruthy();
  });

  it('failJob marca failed con mensaje de error', () => {
    const a = store.createJob(input);
    store.claimNextQueued();
    store.failJob(a.id, 'algo falló', '✗ NO_CHANGE: error', []);
    const j = store.getJob(a.id);
    expect(j?.status).toBe('failed');
    expect(j?.errorMessage).toBe('algo falló');
  });

  it('markStuckProcessingAsNeedsReview convierte processing en needs_review', () => {
    const a = store.createJob(input);
    store.claimNextQueued(); // -> processing
    const n = store.markStuckProcessingAsNeedsReview();
    expect(n).toBe(1);
    expect(store.getJob(a.id)?.status).toBe('needs_review');
  });

  it('listJobs devuelve todos, más recientes primero', () => {
    store.createJob(input);
    store.createJob({ ...input, clientName: 'Otro' });
    expect(store.listJobs()).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Ejecutar el test para verificar que falla**

Run: `npx vitest run src/job/jobStore.test.ts`
Expected: FAIL — `Cannot find module './jobStore'`.

- [ ] **Step 3: Implementar `src/job/jobStore.ts`**

```ts
import Database from 'better-sqlite3';
import { randomUUID } from 'crypto';
import { Job, JobInput, JobStatus } from '../shared/jobTypes';

export interface JobStore {
  createJob(input: JobInput): Job;
  claimNextQueued(): Job | null;
  completeJob(id: string, summary: string, files: string[]): void;
  failJob(id: string, errorMessage: string, summary: string, files: string[]): void;
  getJob(id: string): Job | null;
  listJobs(): Job[];
  markStuckProcessingAsNeedsReview(): number;
  close(): void;
}

interface Row {
  id: string;
  status: JobStatus;
  mode: string;
  client_name: string;
  usdot: string | null;
  dba: string | null;
  commands_json: string;
  notify_to: string;
  language: string;
  created_by: string;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
  result_summary: string | null;
  result_files_json: string | null;
  error_message: string | null;
}

function rowToJob(r: Row): Job {
  return {
    id: r.id,
    status: r.status,
    mode: r.mode as Job['mode'],
    clientName: r.client_name,
    usdot: r.usdot ?? undefined,
    dba: r.dba ?? undefined,
    commands: JSON.parse(r.commands_json),
    notifyTo: r.notify_to,
    language: r.language as Job['language'],
    createdBy: r.created_by,
    createdAt: r.created_at,
    startedAt: r.started_at ?? undefined,
    finishedAt: r.finished_at ?? undefined,
    resultSummary: r.result_summary ?? undefined,
    resultFiles: r.result_files_json ? JSON.parse(r.result_files_json) : undefined,
    errorMessage: r.error_message ?? undefined,
  };
}

export function openJobStore(dbPath: string): JobStore {
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.exec(`
    CREATE TABLE IF NOT EXISTS jobs (
      id TEXT PRIMARY KEY,
      status TEXT NOT NULL,
      mode TEXT NOT NULL,
      client_name TEXT NOT NULL,
      usdot TEXT,
      dba TEXT,
      commands_json TEXT NOT NULL,
      notify_to TEXT NOT NULL,
      language TEXT NOT NULL,
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL,
      started_at TEXT,
      finished_at TEXT,
      result_summary TEXT,
      result_files_json TEXT,
      error_message TEXT
    );
  `);

  const insert = db.prepare(`
    INSERT INTO jobs (id, status, mode, client_name, usdot, dba, commands_json,
                      notify_to, language, created_by, created_at)
    VALUES (@id, @status, @mode, @client_name, @usdot, @dba, @commands_json,
            @notify_to, @language, @created_by, @created_at)
  `);
  const selectById = db.prepare(`SELECT * FROM jobs WHERE id = ?`);
  const selectAll = db.prepare(`SELECT * FROM jobs ORDER BY created_at DESC`);
  const selectOldestQueued = db.prepare(
    `SELECT * FROM jobs WHERE status = 'queued' ORDER BY created_at ASC LIMIT 1`
  );
  const setProcessing = db.prepare(
    `UPDATE jobs SET status = 'processing', started_at = @started_at WHERE id = @id`
  );
  const setDone = db.prepare(`
    UPDATE jobs SET status = 'done', result_summary = @summary,
      result_files_json = @files, finished_at = @finished_at WHERE id = @id
  `);
  const setFailed = db.prepare(`
    UPDATE jobs SET status = 'failed', error_message = @error,
      result_summary = @summary, result_files_json = @files, finished_at = @finished_at
    WHERE id = @id
  `);
  const setStuckNeedsReview = db.prepare(
    `UPDATE jobs SET status = 'needs_review' WHERE status = 'processing'`
  );

  const now = () => new Date().toISOString();

  const claim = db.transaction((): Job | null => {
    const row = selectOldestQueued.get() as Row | undefined;
    if (!row) return null;
    setProcessing.run({ id: row.id, started_at: now() });
    return rowToJob(selectById.get(row.id) as Row);
  });

  return {
    createJob(input: JobInput): Job {
      const id = randomUUID();
      const createdAt = now();
      insert.run({
        id,
        status: 'queued',
        mode: input.mode,
        client_name: input.clientName,
        usdot: input.usdot ?? null,
        dba: input.dba ?? null,
        commands_json: JSON.stringify(input.commands),
        notify_to: input.notifyTo,
        language: input.language,
        created_by: input.createdBy,
        created_at: createdAt,
      });
      return rowToJob(selectById.get(id) as Row);
    },
    claimNextQueued(): Job | null {
      return claim();
    },
    completeJob(id, summary, files): void {
      setDone.run({ id, summary, files: JSON.stringify(files), finished_at: now() });
    },
    failJob(id, errorMessage, summary, files): void {
      setFailed.run({ id, error: errorMessage, summary, files: JSON.stringify(files), finished_at: now() });
    },
    getJob(id): Job | null {
      const row = selectById.get(id) as Row | undefined;
      return row ? rowToJob(row) : null;
    },
    listJobs(): Job[] {
      return (selectAll.all() as Row[]).map(rowToJob);
    },
    markStuckProcessingAsNeedsReview(): number {
      return setStuckNeedsReview.run().changes;
    },
    close(): void {
      db.close();
    },
  };
}
```

- [ ] **Step 4: Ejecutar los tests para verificar que pasan**

Run: `npx vitest run src/job/jobStore.test.ts`
Expected: PASS — 7 tests passed.

- [ ] **Step 5: Commit**

```bash
git add src/job/jobStore.ts src/job/jobStore.test.ts
git commit -m "feat: jobStore SQLite (crear/claim/complete/fail/needs_review)"
```

---

## Task 5: Núcleo `processJob` (extraído de main.ts)

**Files:**
- Create: `src/job/processJob.ts`
- Test: `src/job/processJob.test.ts`

**Interfaces:**
- Consumes: `ParsedEmail`, `ActionResult` de `src/types`; `getNowCertsPage`, `navigateToClient`, `invalidateSession` de `src/browser/nowcertsLogin`; `closeBrowser` de `src/browser/browserManager`; `dispatchCommands` de `src/actions/dispatcher`; `sendReviewEmail`, `sendErrorNotification`, `sendAlertEmail` de `src/email/emailSender`.
- Produces:
  - `interface ProcessOutcome { allSucceeded: boolean; summary: string; files: string[]; errorMessage?: string }`
  - `async function processJob(email: ParsedEmail): Promise<ProcessOutcome>`
  - `function buildChangesDescription(results: ActionResult[]): string`

Nota: `processJob` NO cierra el navegador ni hace bookkeeping de la fuente (IMAP/cola); de eso se encarga quien lo llama.

- [ ] **Step 1: Escribir el test que falla**

`src/job/processJob.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ParsedEmail, ActionResult } from '../types';

// Mocks de las dependencias que tocan navegador / email / NowCerts.
vi.mock('../browser/nowcertsLogin', () => ({
  getNowCertsPage: vi.fn(async () => ({ url: () => 'https://nowcerts.com/AMSINS/x' })),
  navigateToClient: vi.fn(async () => true),
  invalidateSession: vi.fn(),
}));
vi.mock('../browser/browserManager', () => ({
  closeBrowser: vi.fn(async () => {}),
  screenshot: vi.fn(async () => undefined),
}));
vi.mock('../actions/dispatcher', () => ({
  dispatchCommands: vi.fn(),
}));
vi.mock('../email/emailSender', () => ({
  sendReviewEmail: vi.fn(async () => {}),
  sendErrorNotification: vi.fn(async () => {}),
  sendAlertEmail: vi.fn(async () => {}),
}));

import { processJob } from './processJob';
import { dispatchCommands } from '../actions/dispatcher';
import { navigateToClient } from '../browser/nowcertsLogin';
import { sendReviewEmail } from '../email/emailSender';

const email: ParsedEmail = {
  uid: 0, subject: '[PORTAL] Pix', from: 'a@h2oins.com', to: 'a@h2oins.com', body: '',
  clientName: 'Pix', usdot: '123', commands: [{ type: 'NO_CHANGE', rawText: '' }],
  language: 'es',
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('processJob', () => {
  it('devuelve allSucceeded=true cuando todos los comandos pasan', async () => {
    (dispatchCommands as any).mockResolvedValue([
      { success: true, commandType: 'NO_CHANGE', message: 'ok', downloadedFiles: ['/d/cert.pdf'] } as ActionResult,
    ]);
    const out = await processJob(email);
    expect(out.allSucceeded).toBe(true);
    expect(out.files).toContain('/d/cert.pdf');
    expect(sendReviewEmail).toHaveBeenCalledOnce();
  });

  it('devuelve allSucceeded=false cuando un comando falla', async () => {
    (dispatchCommands as any).mockResolvedValue([
      { success: false, commandType: 'NO_CHANGE', message: 'boom', errorScreenshot: '/d/err.png' } as ActionResult,
    ]);
    const out = await processJob(email);
    expect(out.allSucceeded).toBe(false);
    expect(out.errorMessage).toContain('NO_CHANGE');
    expect(out.files).toContain('/d/err.png');
  });

  it('devuelve allSucceeded=false cuando el cliente no se encuentra', async () => {
    (navigateToClient as any).mockResolvedValue(false);
    const out = await processJob(email);
    expect(out.allSucceeded).toBe(false);
    expect(out.errorMessage?.toLowerCase()).toContain('cliente');
    expect(dispatchCommands).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Ejecutar el test para verificar que falla**

Run: `npx vitest run src/job/processJob.test.ts`
Expected: FAIL — `Cannot find module './processJob'`.

- [ ] **Step 3: Implementar `src/job/processJob.ts`**

```ts
import { ParsedEmail, ActionResult } from '../types';
import { getNowCertsPage, navigateToClient, invalidateSession } from '../browser/nowcertsLogin';
import { closeBrowser } from '../browser/browserManager';
import { dispatchCommands } from '../actions/dispatcher';
import { sendReviewEmail, sendErrorNotification, sendAlertEmail } from '../email/emailSender';
import { logger, logEmailProcessing } from '../utils/logger';

export interface ProcessOutcome {
  allSucceeded: boolean;
  summary: string;
  files: string[];
  errorMessage?: string;
}

export function buildChangesDescription(results: ActionResult[]): string {
  return results
    .map(r => `${r.success ? '✓' : '✗'} ${r.commandType}: ${r.message}`)
    .join('\n');
}

/**
 * Núcleo de ejecución, independiente de la fuente (IMAP o cola).
 * Abre el navegador, navega al cliente, ejecuta los comandos, manda el review
 * email y notificaciones de error. NO cierra el navegador ni toca la fuente.
 */
export async function processJob(email: ParsedEmail): Promise<ProcessOutcome> {
  logEmailProcessing(email.subject, email.commands.length);

  // 1. Abrir navegador + login (un reintento, igual que main.ts)
  let page;
  try {
    page = await getNowCertsPage();
  } catch (err) {
    const msg = (err as Error).message;
    logger.error(`Failed to open NowCerts browser for "${email.subject}": ${msg}`);
    invalidateSession();
    try { await closeBrowser(); } catch { /* ignore */ }
    try {
      page = await getNowCertsPage();
    } catch (err2) {
      const msg2 = (err2 as Error).message;
      const errorMessage = `No se pudo abrir el navegador de NowCerts tras 2 intentos.\nError 1: ${msg}\nError 2: ${msg2}`;
      await sendErrorNotification({
        emailSubject: email.subject,
        errorMessage,
        clientName: email.clientName,
        usdot: email.usdot,
      });
      return { allSucceeded: false, summary: '', files: [], errorMessage };
    }
  }

  // 2. Navegar al cliente (si no es Create Insured)
  const isCreateInsured = email.commands.some(c => c.type === 'CREATE_INSURED');
  if (!isCreateInsured && email.clientName) {
    const found = await navigateToClient(page, email.clientName, email.usdot);
    if (!found) {
      const errorMessage = `Cliente no encontrado en NowCerts: "${email.clientName}" (USDOT: ${email.usdot ?? 'N/A'})`;
      logger.error(errorMessage);
      await sendAlertEmail({
        to: email.from,
        subject: `[ERROR] Cliente no encontrado: ${email.clientName}`,
        body: errorMessage,
      });
      return { allSucceeded: false, summary: '', files: [], errorMessage };
    }
  }

  // 3. Ejecutar los comandos
  let results: ActionResult[];
  try {
    results = await dispatchCommands(page, email);
  } catch (err) {
    const errorMessage = `Error fatal durante el dispatch: ${(err as Error).message}`;
    logger.error(errorMessage);
    await sendErrorNotification({
      emailSubject: email.subject,
      errorMessage: `${errorMessage}\n\n${(err as Error).stack ?? ''}`,
      clientName: email.clientName,
      usdot: email.usdot,
    });
    invalidateSession();
    return { allSucceeded: false, summary: '', files: [], errorMessage };
  }

  // 4. Recolectar resultados
  const allFiles = results.flatMap(r => r.downloadedFiles ?? []);
  const errorScreenshots = results.map(r => r.errorScreenshot).filter((s): s is string => !!s);
  const failures = results.filter(r => !r.success);
  const summary = buildChangesDescription(results);
  const files = [...allFiles, ...errorScreenshots];

  // 5. Review email (siempre)
  try {
    await sendReviewEmail({
      clientName: email.clientName ?? 'Unknown',
      usdot: email.usdot ?? '',
      changesDescription: summary,
      attachments: files,
    });
  } catch (err) {
    logger.error(`Failed to send review email: ${(err as Error).message}`);
  }

  // 6. Notificación de error si hubo fallos
  if (failures.length > 0) {
    const failSummary = failures.map(f => `${f.commandType}: ${f.message}`).join('\n');
    await sendErrorNotification({
      emailSubject: email.subject,
      errorMessage: `${failures.length} comando(s) fallaron:\n\n${failSummary}`,
      clientName: email.clientName,
      usdot: email.usdot,
      screenshots: errorScreenshots,
    });
    return { allSucceeded: false, summary, files, errorMessage: failSummary };
  }

  return { allSucceeded: true, summary, files };
}
```

- [ ] **Step 4: Ejecutar los tests para verificar que pasan**

Run: `npx vitest run src/job/processJob.test.ts`
Expected: PASS — 3 tests passed.

- [ ] **Step 5: Commit**

```bash
git add src/job/processJob.ts src/job/processJob.test.ts
git commit -m "feat: núcleo processJob reutilizable (IMAP + cola)"
```

---

## Task 6: Poller de la cola `queueSource`

**Files:**
- Create: `src/job/queueSource.ts`
- Test: `src/job/queueSource.test.ts`

**Interfaces:**
- Consumes: `JobStore` de `src/job/jobStore`; `Job` de `src/shared/jobTypes`; `ParsedEmail` de `src/types`; `processJob`, `ProcessOutcome` de `src/job/processJob`.
- Produces:
  - `function jobToParsedEmail(job: Job): ParsedEmail`
  - `async function processOneQueuedJob(store: JobStore, deps?: { processJob: typeof processJob }): Promise<boolean>` — devuelve `true` si procesó un job, `false` si la cola estaba vacía.

- [ ] **Step 1: Escribir el test que falla**

`src/job/queueSource.test.ts`:
```ts
import { describe, it, expect, vi } from 'vitest';
import { jobToParsedEmail, processOneQueuedJob } from './queueSource';
import type { Job } from '../shared/jobTypes';
import type { JobStore } from './jobStore';

const job: Job = {
  id: 'j1', status: 'processing', mode: 'existing_client', clientName: 'Pix', usdot: '123',
  commands: [{ type: 'NO_CHANGE', rawText: '' }], notifyTo: 'a@h2oins.com',
  language: 'es', createdBy: 'maria', createdAt: '2026-06-26T00:00:00.000Z',
};

function fakeStore(claimed: Job | null): JobStore & { completed: any[]; failed: any[] } {
  const completed: any[] = [];
  const failed: any[] = [];
  return {
    createJob: vi.fn(), getJob: vi.fn(), listJobs: vi.fn(),
    markStuckProcessingAsNeedsReview: vi.fn(), close: vi.fn(),
    claimNextQueued: vi.fn(() => claimed),
    completeJob: vi.fn((id, summary, files) => completed.push({ id, summary, files })),
    failJob: vi.fn((id, error, summary, files) => failed.push({ id, error, summary, files })),
    completed, failed,
  } as any;
}

describe('jobToParsedEmail', () => {
  it('mapea el job a ParsedEmail con from = notifyTo y los comandos', () => {
    const email = jobToParsedEmail(job);
    expect(email.from).toBe('a@h2oins.com');
    expect(email.clientName).toBe('Pix');
    expect(email.commands).toHaveLength(1);
    expect(email.subject).toContain('Pix');
  });
});

describe('processOneQueuedJob', () => {
  it('devuelve false cuando la cola está vacía', async () => {
    const store = fakeStore(null);
    const did = await processOneQueuedJob(store, { processJob: vi.fn() as any });
    expect(did).toBe(false);
  });

  it('completa el job cuando processJob tiene éxito', async () => {
    const store = fakeStore(job);
    const processJob = vi.fn(async () => ({ allSucceeded: true, summary: 's', files: ['/f'] }));
    const did = await processOneQueuedJob(store, { processJob: processJob as any });
    expect(did).toBe(true);
    expect(store.completed[0]).toMatchObject({ id: 'j1', summary: 's', files: ['/f'] });
  });

  it('falla el job cuando processJob no tiene éxito', async () => {
    const store = fakeStore(job);
    const processJob = vi.fn(async () => ({ allSucceeded: false, summary: 's', files: [], errorMessage: 'boom' }));
    await processOneQueuedJob(store, { processJob: processJob as any });
    expect(store.failed[0]).toMatchObject({ id: 'j1', error: 'boom' });
  });

  it('falla el job cuando processJob lanza', async () => {
    const store = fakeStore(job);
    const processJob = vi.fn(async () => { throw new Error('explotó'); });
    await processOneQueuedJob(store, { processJob: processJob as any });
    expect(store.failed[0]).toMatchObject({ id: 'j1', error: 'explotó' });
  });
});
```

- [ ] **Step 2: Ejecutar el test para verificar que falla**

Run: `npx vitest run src/job/queueSource.test.ts`
Expected: FAIL — `Cannot find module './queueSource'`.

- [ ] **Step 3: Implementar `src/job/queueSource.ts`**

```ts
import { JobStore } from './jobStore';
import { Job } from '../shared/jobTypes';
import { ParsedEmail } from '../types';
import { processJob as defaultProcessJob } from './processJob';
import { logger } from '../utils/logger';

/** Convierte un Job de la cola al ParsedEmail que consume processJob/dispatcher. */
export function jobToParsedEmail(job: Job): ParsedEmail {
  return {
    uid: 0,
    subject: `[PORTAL] ${job.clientName}${job.usdot ? ` // USDOT ${job.usdot}` : ''}`,
    from: job.notifyTo,
    to: job.notifyTo,
    body: '',
    clientName: job.clientName,
    usdot: job.usdot,
    dba: job.dba,
    commands: job.commands,
    language: job.language,
  };
}

/**
 * Toma el siguiente job en cola y lo procesa. Devuelve true si procesó uno,
 * false si la cola estaba vacía. El navegador lo cierra el llamador.
 */
export async function processOneQueuedJob(
  store: JobStore,
  deps: { processJob: typeof defaultProcessJob } = { processJob: defaultProcessJob }
): Promise<boolean> {
  const job = store.claimNextQueued();
  if (!job) return false;

  logger.info(`Procesando job de la cola: ${job.id} (${job.clientName})`);
  try {
    const outcome = await deps.processJob(jobToParsedEmail(job));
    if (outcome.allSucceeded) {
      store.completeJob(job.id, outcome.summary, outcome.files);
      logger.info(`Job ${job.id} completado.`);
    } else {
      store.failJob(job.id, outcome.errorMessage ?? 'Falló sin mensaje', outcome.summary, outcome.files);
      logger.warn(`Job ${job.id} falló: ${outcome.errorMessage}`);
    }
  } catch (err) {
    const msg = (err as Error).message;
    store.failJob(job.id, msg, '', []);
    logger.error(`Job ${job.id} lanzó excepción: ${msg}`);
  }
  return true;
}
```

- [ ] **Step 4: Ejecutar los tests para verificar que pasan**

Run: `npx vitest run src/job/queueSource.test.ts`
Expected: PASS — 5 tests passed.

- [ ] **Step 5: Commit**

```bash
git add src/job/queueSource.ts src/job/queueSource.test.ts
git commit -m "feat: queueSource (poller de la cola que ejecuta jobs vía processJob)"
```

---

## Task 7: Config de la cola

**Files:**
- Modify: `src/config/config.ts:54-58` (bloque `files`) y secciones siguientes

**Interfaces:**
- Consumes: helpers `optional` ya existentes en `config.ts`.
- Produces: `config.jobs.dbPath: string` y `config.queue.pollIntervalMs: number`.

- [ ] **Step 1: Añadir la sección `jobs` y `queue` en `config.ts`**

En `src/config/config.ts`, después del bloque `files: { ... },` (línea ~58) y antes de `playwright:`, insertar:

```ts
  jobs: {
    dbPath: path.resolve(optional('JOBS_DB_PATH', './data/jobs.db')),
  },

  queue: {
    pollIntervalMs: parseInt(optional('QUEUE_POLL_INTERVAL_MS', '5000')),
  },
```

- [ ] **Step 2: Verificar que typechequea**

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 3: Commit**

```bash
git add src/config/config.ts
git commit -m "feat: config para la cola de jobs (JOBS_DB_PATH, QUEUE_POLL_INTERVAL_MS)"
```

---

## Task 8: Worker unificado en `main.ts` (cola + IMAP)

**Files:**
- Modify: `src/main.ts` (refactor de `processEmail` y `main`)

**Interfaces:**
- Consumes: `processJob` de `src/job/processJob`; `openJobStore` de `src/job/jobStore`; `processOneQueuedJob` de `src/job/queueSource`; `fetchUnseenEmails`, `markAsSeen`, `moveToFolder`, `ensureMailbox`, `closeImap` de `src/email/imapClient`; `parseEmail` de `src/email/emailParser`; `config` de `src/config/config`; `sleep` de `src/utils/retry`.
- Produces: proceso que en cada ciclo drena la cola y luego procesa IMAP, un job a la vez.

Nota: `processEmail` deja de hacer el trabajo pesado (eso ya vive en `processJob`) y conserva solo el bookkeeping IMAP (prefijo, coherencia, `markAsSeen`/`moveToFolder`).

- [ ] **Step 1: Reemplazar el contenido de `src/main.ts`**

```ts
import 'dotenv/config';
import { fetchUnseenEmails, markAsSeen, moveToFolder, ensureMailbox, closeImap, RawEmail } from './email/imapClient';
import { parseEmail } from './email/emailParser';
import { closeBrowser } from './browser/browserManager';
import { invalidateSession } from './browser/nowcertsLogin';
import { processJob } from './job/processJob';
import { openJobStore } from './job/jobStore';
import { processOneQueuedJob } from './job/queueSource';
import { config } from './config/config';
import { sleep } from './utils/retry';
import { logger } from './utils/logger';
import { Command } from './types';

const PROCESSED_FOLDER = 'H2O-Endosos';

type SubjectPrefix = 'BOT-END' | 'BOT-DOCUMENTAR';

function getSubjectPrefix(subject: string): SubjectPrefix | null {
  const upper = subject.toUpperCase().trim();
  if (upper.startsWith('BOT-DOCUMENTAR')) return 'BOT-DOCUMENTAR';
  if (upper.startsWith('BOT-END') || upper.startsWith('END-BOT')) return 'BOT-END';
  return null;
}

function validateCoherence(prefix: SubjectPrefix, commands: Command[]): { valid: boolean; reason?: string } {
  const hasCreateInsured = commands.some(c => c.type === 'CREATE_INSURED');
  if (prefix === 'BOT-DOCUMENTAR' && !hasCreateInsured) {
    return { valid: false, reason: 'Subject says BOT-DOCUMENTAR but no CREATE_INSURED command found in body' };
  }
  if (prefix === 'BOT-END' && hasCreateInsured) {
    return { valid: false, reason: 'Subject says BOT-END (existing client) but body contains CREATE_INSURED command' };
  }
  return { valid: true };
}

/** Procesa un correo IMAP: valida, ejecuta vía processJob y hace bookkeeping IMAP. */
async function processEmail(raw: RawEmail): Promise<void> {
  const prefix = getSubjectPrefix(raw.subject);
  if (!prefix) {
    logger.warn(`Email subject doesn't match valid prefixes: "${raw.subject}" — skipping.`);
    await markAsSeen(raw.uid);
    return;
  }

  const email = parseEmail(raw);

  if (email.commands.length === 0) {
    logger.warn(`No commands found in email: "${email.subject}" — skipping.`);
    await markAsSeen(raw.uid);
    return;
  }

  const coherence = validateCoherence(prefix, email.commands);
  if (!coherence.valid) {
    logger.warn(`Coherence validation failed for "${email.subject}": ${coherence.reason} — skipping.`);
    await markAsSeen(raw.uid);
    return;
  }

  const outcome = await processJob(email);

  if (outcome.allSucceeded) {
    await moveToFolder(raw.uid, PROCESSED_FOLDER);
  } else {
    await markAsSeen(raw.uid);
  }
  logger.info(`Email processed (success=${outcome.allSucceeded}). Subject: "${email.subject}"`);
}

/** Cierra el navegador entre jobs para no dejar sesiones abiertas. */
async function closeBrowserSafe(): Promise<void> {
  try {
    await closeBrowser();
    invalidateSession();
    logger.info('Browser closed after job.');
  } catch (err) {
    logger.warn(`Could not close browser cleanly: ${(err as Error).message}`);
  }
}

async function main(): Promise<void> {
  logger.info('=== H2O Bot starting ===');

  const store = openJobStore(config.jobs.dbPath);
  // Jobs que quedaron 'processing' por un reinicio: marcarlos para revisión (no se reintentan solos).
  const stuck = store.markStuckProcessingAsNeedsReview();
  if (stuck > 0) logger.warn(`${stuck} job(s) quedaron en 'processing' tras un reinicio — marcados como 'needs_review'.`);

  const shutdown = async () => {
    logger.info('Shutting down...');
    await closeImap();
    await closeBrowser();
    store.close();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  try {
    await ensureMailbox(PROCESSED_FOLDER);
    logger.info(`Mailbox "${PROCESSED_FOLDER}" ready.`);
  } catch (err) {
    logger.warn(`Could not verify mailbox "${PROCESSED_FOLDER}": ${(err as Error).message}`);
  }

  logger.info('Bot ready. Worker único: drena la cola y luego IMAP, un job a la vez.');

  // Worker unificado: un solo job a la vez (cola primero, luego IMAP).
  while (true) {
    try {
      // 1. Drenar la cola del portal
      let didQueueJob = false;
      while (await processOneQueuedJob(store)) {
        didQueueJob = true;
        await closeBrowserSafe();
      }

      // 2. Procesar correos IMAP (respaldo)
      const emails = await fetchUnseenEmails().catch(err => {
        logger.error(`IMAP fetch error: ${(err as Error).message}`);
        return [] as RawEmail[];
      });
      for (const email of emails) {
        try {
          await processEmail(email);
        } catch (err) {
          logger.error(`Unhandled error processing email "${email.subject}": ${(err as Error).message}`);
        } finally {
          await closeBrowserSafe();
        }
      }

      // 3. Esperar antes del siguiente ciclo solo si no hubo trabajo de cola
      if (!didQueueJob) {
        await sleep(config.queue.pollIntervalMs);
      }
    } catch (err) {
      logger.error(`Worker loop error: ${(err as Error).message}`);
      await sleep(config.queue.pollIntervalMs);
    }
  }
}

main().catch(err => {
  logger.error(`Fatal startup error: ${err.message}`);
  process.exit(1);
});
```

- [ ] **Step 2: Verificar que compila**

Run: `npx tsc --noEmit`
Expected: sin errores. (Si `buildChangesDescription` u otra función quedó sin usar en `main.ts`, ya fue removida — está ahora en `processJob.ts`.)

- [ ] **Step 3: Ejecutar toda la suite de tests**

Run: `npm test`
Expected: PASS — todos los tests de schemas, jobStore, processJob y queueSource pasan.

- [ ] **Step 4: Prueba manual de humo del pipeline de cola (sin NowCerts real)**

Crear `src/job/seedJob.ts` (script temporal de verificación):
```ts
import { openJobStore } from './jobStore';
import { config } from '../config/config';

const store = openJobStore(config.jobs.dbPath);
const job = store.createJob({
  mode: 'existing_client',
  clientName: 'Pix Test 2 2026 - 2027',
  usdot: '1234567',
  commands: [{ type: 'NO_CHANGE', rawText: '' }],
  notifyTo: 'programacion@h2oins.com',
  language: 'es',
  createdBy: 'verificacion',
});
console.log('Job creado:', job.id, 'estado:', job.status);
console.log('Total en cola:', store.listJobs().filter(j => j.status === 'queued').length);
store.close();
```

Run: `npx ts-node src/job/seedJob.ts`
Expected: imprime el `id` del job y `estado: queued`, y `Total en cola: 1`. Confirma que el store escribe en `./data/jobs.db`.

- [ ] **Step 5: Limpiar el script de verificación y commit**

```bash
rm src/job/seedJob.ts
git add src/main.ts
git commit -m "feat: worker unificado cola+IMAP usando processJob; needs_review al reiniciar"
```

---

## Self-Review

**1. Spec coverage (contra `2026-06-26-portal-web-endosos-design.md`):**

- §4.1 contrato compartido + Zod → Tasks 2, 3 (subset; resto deferido por Global Constraints).
- §4.2 cola SQLite (tabla `jobs` con todos los campos del spec) → Task 4.
- §4.3 refactor del bot (`processJob` + `queueSource` + un worker/mutex + `needs_review` al reiniciar) → Tasks 5, 6, 8.
- §5 flujo de datos (pasos 6–8: encolar, claim, procesar, escribir resultado) → Tasks 4, 6, 8.
- §8 manejo de errores (job falla → `failed` con mensaje; reinicio → `needs_review`; email de respaldo intacto) → Tasks 5, 6, 8.
- §9 testing (Zod, store, processJob, continuidad con tipos) → Tasks 3, 4, 5, 6.
- **Fuera de Fase 1 (por diseño):** API/UI (§6, Fase 2), los 22 formularios y branding (§7, Fase 3), `new_client`/`CREATE_INSURED` y los 18 esquemas restantes (Global Constraints). La descarga de archivos por la API (§6) es Fase 2; en Fase 1 las rutas de archivos se guardan en `result_files_json`.

**2. Placeholder scan:** Sin TBD/TODO/"handle errors"/"similar to". Todo el código está completo e inline.

**3. Type consistency:** `JobStore`, `openJobStore`, `createJob`, `claimNextQueued`, `completeJob(id, summary, files)`, `failJob(id, errorMessage, summary, files)`, `getJob`, `listJobs`, `markStuckProcessingAsNeedsReview`, `close` — idénticos entre Task 4 (definición), Task 6 (consumo) y Task 8 (consumo). `ProcessOutcome { allSucceeded, summary, files, errorMessage? }` y `processJob(email)` consistentes entre Tasks 5, 6, 8. `jobToParsedEmail`/`processOneQueuedJob(store, deps)` consistentes entre Tasks 6 y 8. `JobInput`/`Job` consistentes entre Tasks 2, 3, 4, 6.

---

## Próximas fases (fuera de este plan)

- **Fase 2** — `web/api` (Express + auth de cuentas individuales + `POST/GET /jobs`, descarga de archivos) + `web/ui` mínima (React+Vite) end-to-end con el subset; decisión de hoistear `shared/` a la raíz como paquete compartido entre bot y web.
- **Fase 3** — Los 22 formularios (incluido `CREATE_INSURED`/`new_client` y los 18 esquemas Zod restantes), estado/historial en la UI, pulido de branding con el plugin `frontend-design`.
