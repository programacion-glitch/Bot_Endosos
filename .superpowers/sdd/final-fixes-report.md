# Final-Review Fixes Report — Phase 1 Portal Web Endosos

Date: 2026-06-26
Branch: feat/portal-web-endosos

---

## Fix 1 — Deterministic FIFO ordering in the job store

### Changes applied

**`src/job/jobStore.ts`**
- `selectAll` query: `ORDER BY created_at DESC` → `ORDER BY created_at DESC, rowid DESC`
- `selectOldestQueued` query: `ORDER BY created_at ASC LIMIT 1` → `ORDER BY created_at ASC, rowid ASC LIMIT 1`

**`src/job/jobStore.test.ts`**
- Strengthened the `listJobs devuelve todos, más recientes primero` test by adding:
  `expect(store.listJobs()[0].clientName).toBe('Otro');`
  This verifies that when two jobs share the same millisecond `created_at`, rowid breaks the tie and the second-inserted job (clientName: 'Otro') sorts first.

---

## Fix 2 — Remove dead IMAP polling config/code

### Grep evidence confirming dead code

**`startPolling` grep result (`grep -rn "startPolling" src/`):**
```
src\email\imapClient.ts:201:export async function startPolling(
```
Only found at its own definition. No external callers.

**`pollIntervalMs` grep result (`grep -rn "pollIntervalMs" src/`):**
```
src\config\config.ts:23:    pollIntervalMs: parseInt(optional('IMAP_POLL_INTERVAL_MS', '30000')),
src\config\config.ts:65:    pollIntervalMs: parseInt(optional('QUEUE_POLL_INTERVAL_MS', '5000')),
src\main.ts:147:        await sleep(config.queue.pollIntervalMs);
src\main.ts:151:        await sleep(config.queue.pollIntervalMs);
src\email\imapClient.ts:204:  logger.info(`Starting IMAP polling every ${config.imap.pollIntervalMs / 1000}s...`);
src\email\imapClient.ts:218:    await sleep(config.imap.pollIntervalMs);
```
`imap.pollIntervalMs` is only referenced inside `startPolling` (imapClient.ts lines 204, 218) and its own config definition.
`queue.pollIntervalMs` is actively used by `src/main.ts` — left untouched.

Both confirmed dead outside their definitions. Fix 2 applied.

### Changes applied

**`src/email/imapClient.ts`**
- Removed the `startPolling` function (the entire exported async function and its JSDoc block).
- Removed the `import { sleep } from '../utils/retry'` import, which became unused after removing `startPolling`.

**`src/config/config.ts`**
- Removed `pollIntervalMs: parseInt(optional('IMAP_POLL_INTERVAL_MS', '30000')),` from the `imap` config section.

---

## Verification

### `npx tsc --noEmit`
Exit code 0 — no errors.

### `npm test`
```
Test Files  4 passed (4)
      Tests  21 passed (21)
   Duration  3.20s
```
All 21 tests pass, including the strengthened `listJobs` assertion.
