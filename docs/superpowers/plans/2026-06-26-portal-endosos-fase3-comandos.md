# Portal de Endosos — Fase 3: comandos restantes (17) + cliente nuevo — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que el portal cubra los 17 comandos restantes y el modo "cliente nuevo" (`CREATE_INSURED`), validados por el mismo Zod compartido y armables desde el JobBuilder. (Se OMITE `ADD_DRIVER`: pausado en el bot.)

**Architecture:** Se extiende `src/shared/schemas.ts` (Zod, autoridad de validación) con sub-esquemas reutilizables (holder, driver, policyType) y los 17 esquemas de comando, y se cambia `jobInputSchema.mode` a enum con regla de coherencia. En la UI se crecen `types.ts`, `defaultCommand`, `COMMAND_LABELS` y `CommandForm` (con sub-componentes por grupo), y el `JobBuilder` gana un selector de modo. El `jobsRouter` y el worker del bot NO cambian (ya manejan ambos modos y `CREATE_INSURED`).

**Tech Stack:** TypeScript, zod, Vitest (backend) + React/Vite, @testing-library/react (UI).

## Global Constraints

- TS strict. Backend Zod en `src/shared/schemas.ts`; UI en `web/ui/`.
- **Backend = autoridad de validación.** La UI valida campos requeridos básicos (UX); el POST se valida con el Zod compartido.
- Los esquemas Zod deben **reflejar 1:1** las interfaces de `src/types/index.ts` (mismos nombres de campo; los `?` son `.optional()`).
- **Comandos cubiertos (17):** CREATE_INSURED, CREATE_MASTER, REMOVE_VEHICLE, REMOVE_DRIVER, REMOVE_HOLDER, ADD_ADDITIONAL_INSURED, ADD_WAIVER_SUBROGATION, ADD_AI_AND_WOS, ADD_NOTE_TO_HOLDER, ADD_NOTE_TO_MASTER, ADD_LOSS_PAYEE, UPDATE_HOLDER, UPDATE_LP_HOLDER, ADD_POLICY, UPDATE_LIMIT_DEDUCTIBLE, UPDATE_MAILING_ADDRESS, UPDATE_POLICY_NUMBER. **OMITIR ADD_DRIVER.**
- `mode`: `new_client` ⇒ debe incluir un `CREATE_INSURED`; `existing_client` ⇒ NO puede incluir `CREATE_INSURED` (coherencia, espejo de `validateCoherence` del bot).
- Mantener el guard `_SchemaAssignableToJobInput` (la unión ampliada debe seguir siendo asignable a `JobInput`).
- `PolicyType = 'AL'|'MTC'|'APD'|'GL'|'WC'|'EXL'|'NTL'`. `HolderInfo = {name, address, note?}`. `Driver = {firstName,lastName,cdl,cdlState,dob}`.
- Marca H2O ya definida en `web/ui/src/theme.css` (reusar clases `.card/.field/.row/.error`).

---

## Estructura de archivos (Fase 3)

| Archivo | Acción |
| --- | --- |
| `src/shared/schemas.ts` | Modificar (sub-esquemas + 17 comandos + union + mode/coherencia) |
| `src/shared/schemas.test.ts` | Modificar (casos nuevos) |
| `web/ui/src/types.ts` | Modificar (todas las variantes UICommand + mode enum) |
| `web/ui/src/components/CommandForm.tsx` | Modificar (defaultCommand/labels + campos por comando) |
| `web/ui/src/components/HolderFields.tsx` | Crear (sub-form holder + policies) |
| `web/ui/src/components/PolicyFields.tsx` | Crear (sub-form ADD_POLICY / UPDATE_LIMIT_DEDUCTIBLE) |
| `web/ui/src/components/CreateInsuredFields.tsx` | Crear (sub-form cliente nuevo + drivers) |
| `web/ui/src/components/CommandForm.test.tsx` | Modificar (tests nuevos) |
| `web/ui/src/pages/JobBuilder.tsx` | Modificar (selector de modo + paleta por modo) |

---

## Task 1 (backend): sub-esquemas + comandos simples/remove

**Files:** Modify `src/shared/schemas.ts`, `src/shared/schemas.test.ts`

**Interfaces produced:** `policyTypeSchema`, `driverSchema`, `holderSchema`; command schemas `createMasterSchema`, `removeVehicleSchema`, `removeDriverSchema`, `removeHolderSchema`, `addNoteToMasterSchema`, `updateMailingAddressSchema`, `updatePolicyNumberSchema`; all added to `commandSchema` union.

- [ ] **Step 1: Add failing tests** to `src/shared/schemas.test.ts`:
```ts
it('acepta REMOVE_VEHICLE válido', () => {
  const res = validateJobInput({ ...baseJob, commands: [{ type:'REMOVE_VEHICLE', rawText:'', vin:'V1', year:'2007', description:'VOLVO', effectiveDate:'03/05/2026' }] });
  expect(res.ok).toBe(true);
});
it('acepta CREATE_MASTER y UPDATE_MAILING_ADDRESS', () => {
  const res = validateJobInput({ ...baseJob, commands: [{ type:'CREATE_MASTER', rawText:'' }, { type:'UPDATE_MAILING_ADDRESS', rawText:'', address:'123 Main' }] });
  expect(res.ok).toBe(true);
});
it('rechaza UPDATE_POLICY_NUMBER con policyType inválido', () => {
  const res = validateJobInput({ ...baseJob, commands: [{ type:'UPDATE_POLICY_NUMBER', rawText:'', policyType:'ZZ', newPolicyNumber:'X-1' }] });
  expect(res.ok).toBe(false);
});
it('acepta REMOVE_DRIVER (dob opcional)', () => {
  const res = validateJobInput({ ...baseJob, commands: [{ type:'REMOVE_DRIVER', rawText:'', driver:{ firstName:'Juan', lastName:'Perez', cdl:'TX1', cdlState:'TX' } }] });
  expect(res.ok).toBe(true);
});
```

- [ ] **Step 2: Run, confirm FAIL** — `npx vitest run src/shared/schemas.test.ts` (new cases fail: types not in union).

- [ ] **Step 3: Implement** in `src/shared/schemas.ts`. Add the sub-schemas and command schemas (after the existing `rawText` const, before `commandSchema`):
```ts
export const policyTypeSchema = z.enum(['AL', 'MTC', 'APD', 'GL', 'WC', 'EXL', 'NTL']);

export const driverSchema = z.object({
  firstName: z.string().min(1, 'Nombre requerido'),
  lastName: z.string().min(1, 'Apellido requerido'),
  cdl: z.string().min(1, 'CDL requerido'),
  cdlState: z.string().min(1, 'Estado del CDL requerido'),
  dob: z.string().min(1, 'DOB requerido'),
});

export const holderSchema = z.object({
  name: z.string().min(1, 'Nombre del holder requerido'),
  address: z.string().min(1, 'Dirección del holder requerida'),
  note: z.string().optional(),
});

export const createMasterSchema = z.object({ type: z.literal('CREATE_MASTER'), rawText });

export const removeVehicleSchema = z.object({
  type: z.literal('REMOVE_VEHICLE'), rawText,
  vin: z.string().min(1, 'VIN requerido'),
  year: z.string().min(1, 'Año requerido'),
  description: z.string().min(1, 'Descripción requerida'),
  value: z.string().optional(),
  effectiveDate: z.string().min(1, 'Effective Date requerida'),
});

export const removeDriverSchema = z.object({
  type: z.literal('REMOVE_DRIVER'), rawText,
  driver: z.object({
    firstName: z.string().min(1), lastName: z.string().min(1),
    cdl: z.string().min(1), cdlState: z.string().min(1),
    dob: z.string().optional().default(''), // DOB opcional al remover
  }),
});

export const removeHolderSchema = z.object({ type: z.literal('REMOVE_HOLDER'), rawText, holderName: z.string().min(1, 'Holder requerido') });
export const addNoteToMasterSchema = z.object({ type: z.literal('ADD_NOTE_TO_MASTER'), rawText, note: z.string().min(1, 'Nota requerida') });
export const updateMailingAddressSchema = z.object({ type: z.literal('UPDATE_MAILING_ADDRESS'), rawText, address: z.string().min(1, 'Dirección requerida') });
export const updatePolicyNumberSchema = z.object({ type: z.literal('UPDATE_POLICY_NUMBER'), rawText, policyType: policyTypeSchema, newPolicyNumber: z.string().min(1, 'Nuevo número requerido') });
```
Then add these seven to the `commandSchema` discriminated union array (keep the existing 4):
```ts
export const commandSchema = z.discriminatedUnion('type', [
  noChangeSchema, addVehicleSchema, updateVehicleValueSchema, deleteVehicleValueSchema,
  createMasterSchema, removeVehicleSchema, removeDriverSchema, removeHolderSchema,
  addNoteToMasterSchema, updateMailingAddressSchema, updatePolicyNumberSchema,
]);
```

- [ ] **Step 4: Run, confirm PASS** — `npx vitest run src/shared/schemas.test.ts` + `npx tsc --noEmit` clean.

- [ ] **Step 5: Commit** — `git add src/shared/schemas.ts src/shared/schemas.test.ts` → `feat(web): esquemas Zod comandos simples/remove (Fase 3)`

---

## Task 2 (backend): grupo holder + loss payee + update holder/LP

**Files:** Modify `src/shared/schemas.ts`, `src/shared/schemas.test.ts`

**Interfaces produced:** `addAdditionalInsuredSchema`, `addWaiverSubrogationSchema`, `addAIAndWOSSchema`, `addNoteToHolderSchema`, `addLossPayeeSchema`, `updateHolderSchema`, `updateLPHolderSchema`; added to union.

- [ ] **Step 1: Add failing tests**:
```ts
const holder = { name:'Holder LLC', address:'500 Market St, Houston, TX, 77002', note:'As per contract' };
it('acepta ADD_ADDITIONAL_INSURED con holder y policies', () => {
  const res = validateJobInput({ ...baseJob, commands: [{ type:'ADD_ADDITIONAL_INSURED', rawText:'', policies:['AL','GL'], holder }] });
  expect(res.ok).toBe(true);
});
it('rechaza AI sin holder.name', () => {
  const res = validateJobInput({ ...baseJob, commands: [{ type:'ADD_ADDITIONAL_INSURED', rawText:'', policies:['AL'], holder:{ name:'', address:'x' } }] });
  expect(res.ok).toBe(false);
});
it('acepta ADD_LOSS_PAYEE y UPDATE_HOLDER', () => {
  const res = validateJobInput({ ...baseJob, commands: [
    { type:'ADD_LOSS_PAYEE', rawText:'', vin:'V1', holder },
    { type:'UPDATE_HOLDER', rawText:'', holderName:'Old LLC', updateTo:'New LLC' },
  ] });
  expect(res.ok).toBe(true);
});
```

- [ ] **Step 2: Run, confirm FAIL**.

- [ ] **Step 3: Implement** — add to `src/shared/schemas.ts`:
```ts
const policiesArray = z.array(z.string().min(1)).min(1, 'Indica al menos una póliza');

export const addAdditionalInsuredSchema = z.object({ type: z.literal('ADD_ADDITIONAL_INSURED'), rawText, policies: policiesArray, holder: holderSchema });
export const addWaiverSubrogationSchema = z.object({ type: z.literal('ADD_WAIVER_SUBROGATION'), rawText, policies: policiesArray, holder: holderSchema });
export const addAIAndWOSSchema = z.object({ type: z.literal('ADD_AI_AND_WOS'), rawText, policies: policiesArray, holder: holderSchema });
export const addNoteToHolderSchema = z.object({ type: z.literal('ADD_NOTE_TO_HOLDER'), rawText, holder: holderSchema });
export const addLossPayeeSchema = z.object({ type: z.literal('ADD_LOSS_PAYEE'), rawText, vin: z.string().min(1), holder: holderSchema, policyLabel: z.string().optional() });
export const updateHolderSchema = z.object({ type: z.literal('UPDATE_HOLDER'), rawText, holderName: z.string().min(1), updateTo: z.string().min(1), note: z.string().optional() });
export const updateLPHolderSchema = z.object({ type: z.literal('UPDATE_LP_HOLDER'), rawText, vin: z.string().min(1), holderName: z.string().min(1), updateTo: z.string().min(1), note: z.string().optional() });
```
Add the seven to the `commandSchema` union array.

- [ ] **Step 4: Run, confirm PASS** + `tsc --noEmit`.

- [ ] **Step 5: Commit** — `feat(web): esquemas Zod grupo holder/loss-payee (Fase 3)`

---

## Task 3 (backend): pólizas (ADD_POLICY, UPDATE_LIMIT_DEDUCTIBLE)

**Files:** Modify `src/shared/schemas.ts`, `src/shared/schemas.test.ts`

**Interfaces produced:** `addPolicySchema`, `updateLimitDeductibleSchema`; added to union.

- [ ] **Step 1: Add failing tests**:
```ts
it('acepta ADD_POLICY AL con scheduledAutos', () => {
  const res = validateJobInput({ ...baseJob, commands: [{ type:'ADD_POLICY', rawText:'', policyType:'AL', carrier:'County Hall', mga:'County Hall RRG', policyNumber:'Fake-5445', effectiveDate:'03/05/2026', expirationDate:'03/05/2027', limit:'$500,000', scheduledAutos:true }] });
  expect(res.ok).toBe(true);
});
it('rechaza ADD_POLICY sin carrier', () => {
  const res = validateJobInput({ ...baseJob, commands: [{ type:'ADD_POLICY', rawText:'', policyType:'AL', carrier:'', mga:'m', policyNumber:'p', effectiveDate:'d', expirationDate:'d' }] });
  expect(res.ok).toBe(false);
});
it('acepta UPDATE_LIMIT_DEDUCTIBLE', () => {
  const res = validateJobInput({ ...baseJob, commands: [{ type:'UPDATE_LIMIT_DEDUCTIBLE', rawText:'', policyType:'GL', eachOccurrence:'$1,000,000' }] });
  expect(res.ok).toBe(true);
});
```

- [ ] **Step 2: Run, confirm FAIL**.

- [ ] **Step 3: Implement** — add to `src/shared/schemas.ts`:
```ts
const coverageFields = {
  limit: z.string().optional(),
  deductible: z.string().optional(),
  eachOccurrence: z.string().optional(),
  damageToRentedPremises: z.string().optional(),
  medExp: z.string().optional(),
  personalAdvInjury: z.string().optional(),
  generalAggregate: z.string().optional(),
  productsCompOpAgg: z.string().optional(),
  elEachAccident: z.string().optional(),
  elDiseaseEaEmployee: z.string().optional(),
  elDiseasePolicyLimit: z.string().optional(),
  aggregate: z.string().optional(),
};

export const addPolicySchema = z.object({
  type: z.literal('ADD_POLICY'), rawText,
  policyType: policyTypeSchema,
  carrier: z.string().min(1, 'Carrier requerido'),
  mga: z.string().min(1, 'MGA requerido'),
  policyNumber: z.string().min(1, 'Número de póliza requerido'),
  effectiveDate: z.string().min(1, 'Effective Date requerida'),
  expirationDate: z.string().min(1, 'Expiration Date requerida'),
  anyAuto: z.boolean().optional(),
  allOwnedAutos: z.boolean().optional(),
  scheduledAutos: z.boolean().optional(),
  hiredAutos: z.boolean().optional(),
  nonOwnedAutos: z.boolean().optional(),
  ...coverageFields,
});

export const updateLimitDeductibleSchema = z.object({
  type: z.literal('UPDATE_LIMIT_DEDUCTIBLE'), rawText,
  policyType: policyTypeSchema,
  ...coverageFields,
});
```
Add both to the `commandSchema` union array.

- [ ] **Step 4: Run, confirm PASS** + `tsc --noEmit`.

- [ ] **Step 5: Commit** — `feat(web): esquemas Zod ADD_POLICY y UPDATE_LIMIT_DEDUCTIBLE (Fase 3)`

---

## Task 4 (backend): CREATE_INSURED + modo + coherencia

**Files:** Modify `src/shared/schemas.ts`, `src/shared/schemas.test.ts`

**Interfaces produced:** `createInsuredSchema` (added to union); `jobInputSchema.mode` cambia a `z.enum(['new_client','existing_client'])` con `superRefine` de coherencia.

- [ ] **Step 1: Add failing tests**:
```ts
const insured = { type:'CREATE_INSURED', rawText:'', name:'Pix Test', address:'123 Main, Dallas, TX, 75201', usdot:'123', phone:'2145551234', email:'a@b.com', drivers:[{ firstName:'Juan', lastName:'Perez', cdl:'TX1', cdlState:'TX', dob:'01/15/1988' }] };
it('acepta new_client con CREATE_INSURED', () => {
  const res = validateJobInput({ ...baseJob, mode:'new_client', commands:[insured] });
  expect(res.ok).toBe(true);
});
it('rechaza new_client SIN CREATE_INSURED (coherencia)', () => {
  const res = validateJobInput({ ...baseJob, mode:'new_client', commands:[{ type:'NO_CHANGE', rawText:'' }] });
  expect(res.ok).toBe(false);
});
it('rechaza existing_client CON CREATE_INSURED (coherencia)', () => {
  const res = validateJobInput({ ...baseJob, mode:'existing_client', commands:[insured] });
  expect(res.ok).toBe(false);
});
```
(`baseJob` ya usa `mode:'existing_client'`; estos tests lo sobrescriben.)

- [ ] **Step 2: Run, confirm FAIL**.

- [ ] **Step 3: Implement** — add `createInsuredSchema`, add it to the union, and replace `jobInputSchema`:
```ts
export const createInsuredSchema = z.object({
  type: z.literal('CREATE_INSURED'), rawText,
  name: z.string().min(1, 'Nombre requerido'),
  dba: z.string().optional(),
  address: z.string().min(1, 'Dirección requerida'),
  usdot: z.string().min(1, 'USDOT requerido'),
  drivers: z.array(driverSchema),
  phone: z.string().min(1, 'Teléfono requerido'),
  email: z.string().email('Email inválido'),
  secondaryEmail: z.string().email('Email secundario inválido').optional(),
});
```
Add `createInsuredSchema` to the `commandSchema` union array. Then replace `jobInputSchema` (and keep the guard intact below it):
```ts
export const jobInputSchema = z.object({
  mode: z.enum(['new_client', 'existing_client']),
  clientName: z.string().min(1, 'Nombre de cliente requerido'),
  usdot: z.string().optional(),
  dba: z.string().optional(),
  commands: z.array(commandSchema).min(1, 'Se requiere al menos un comando'),
  notifyTo: z.string().email('notifyTo debe ser un email válido'),
  language: z.enum(['es', 'en']),
  createdBy: z.string().min(1, 'createdBy requerido'),
}).superRefine((job, ctx) => {
  const hasCreate = job.commands.some(c => c.type === 'CREATE_INSURED');
  if (job.mode === 'new_client' && !hasCreate) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['commands'], message: 'Modo cliente nuevo requiere un comando Create Insured' });
  }
  if (job.mode === 'existing_client' && hasCreate) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['commands'], message: 'Cliente existente no puede incluir Create Insured' });
  }
});
```
Keep the existing `_SchemaAssignableToJobInput` guard and `validateJobInput` below this (unchanged). If the guard now errors, the inferred union differs from `JobInput`; adjust the schema field types to match `src/types/index.ts` rather than weakening the guard, and report.

- [ ] **Step 4: Run, confirm PASS** — full `npm test` + `npx tsc --noEmit` clean.

- [ ] **Step 5: Commit** — `feat(web): CREATE_INSURED + modo new_client/coherencia en jobInputSchema (Fase 3)`

---

## Task 5 (UI): tipos, defaultCommand y labels de todos los comandos

**Files:** Modify `web/ui/src/types.ts`, `web/ui/src/components/CommandForm.tsx`

**Interfaces produced:** `CommandType` (los 17 nuevos + 4 previos, sin ADD_DRIVER); `UICommand` union completa; `UIHolder`, `UIDriver` tipos; `JobInputUI.mode` → `'new_client'|'existing_client'`; `defaultCommand` (todos); `COMMAND_LABELS` (todos).

- [ ] **Step 1: Rewrite `web/ui/src/types.ts`** to include all command types:
```ts
export type PolicyType = 'AL' | 'MTC' | 'APD' | 'GL' | 'WC' | 'EXL' | 'NTL';

export type CommandType =
  | 'NO_CHANGE' | 'ADD_VEHICLE' | 'UPDATE_VEHICLE_VALUE' | 'DELETE_VEHICLE_VALUE'
  | 'CREATE_MASTER' | 'REMOVE_VEHICLE' | 'REMOVE_DRIVER' | 'REMOVE_HOLDER'
  | 'ADD_NOTE_TO_MASTER' | 'UPDATE_MAILING_ADDRESS' | 'UPDATE_POLICY_NUMBER'
  | 'ADD_ADDITIONAL_INSURED' | 'ADD_WAIVER_SUBROGATION' | 'ADD_AI_AND_WOS'
  | 'ADD_NOTE_TO_HOLDER' | 'ADD_LOSS_PAYEE' | 'UPDATE_HOLDER' | 'UPDATE_LP_HOLDER'
  | 'ADD_POLICY' | 'UPDATE_LIMIT_DEDUCTIBLE' | 'CREATE_INSURED';

export interface UIHolder { name: string; address: string; note?: string }
export interface UIDriver { firstName: string; lastName: string; cdl: string; cdlState: string; dob: string }

export type UICommand =
  | { type: 'NO_CHANGE'; rawText: string }
  | { type: 'CREATE_MASTER'; rawText: string }
  | { type: 'ADD_VEHICLE'; rawText: string; vin: string; year: string; description: string; value?: string; effectiveDate: string }
  | { type: 'REMOVE_VEHICLE'; rawText: string; vin: string; year: string; description: string; value?: string; effectiveDate: string }
  | { type: 'UPDATE_VEHICLE_VALUE'; rawText: string; vin: string; value: string }
  | { type: 'DELETE_VEHICLE_VALUE'; rawText: string; vin: string }
  | { type: 'REMOVE_DRIVER'; rawText: string; driver: UIDriver }
  | { type: 'REMOVE_HOLDER'; rawText: string; holderName: string }
  | { type: 'ADD_NOTE_TO_MASTER'; rawText: string; note: string }
  | { type: 'UPDATE_MAILING_ADDRESS'; rawText: string; address: string }
  | { type: 'UPDATE_POLICY_NUMBER'; rawText: string; policyType: PolicyType; newPolicyNumber: string }
  | { type: 'ADD_ADDITIONAL_INSURED'; rawText: string; policies: string[]; holder: UIHolder }
  | { type: 'ADD_WAIVER_SUBROGATION'; rawText: string; policies: string[]; holder: UIHolder }
  | { type: 'ADD_AI_AND_WOS'; rawText: string; policies: string[]; holder: UIHolder }
  | { type: 'ADD_NOTE_TO_HOLDER'; rawText: string; holder: UIHolder }
  | { type: 'ADD_LOSS_PAYEE'; rawText: string; vin: string; holder: UIHolder }
  | { type: 'UPDATE_HOLDER'; rawText: string; holderName: string; updateTo: string; note?: string }
  | { type: 'UPDATE_LP_HOLDER'; rawText: string; vin: string; holderName: string; updateTo: string; note?: string }
  | { type: 'ADD_POLICY'; rawText: string; policyType: PolicyType; carrier: string; mga: string; policyNumber: string; effectiveDate: string; expirationDate: string;
      limit?: string; deductible?: string; anyAuto?: boolean; allOwnedAutos?: boolean; scheduledAutos?: boolean; hiredAutos?: boolean; nonOwnedAutos?: boolean;
      eachOccurrence?: string; damageToRentedPremises?: string; medExp?: string; personalAdvInjury?: string; generalAggregate?: string; productsCompOpAgg?: string;
      elEachAccident?: string; elDiseaseEaEmployee?: string; elDiseasePolicyLimit?: string; aggregate?: string }
  | { type: 'UPDATE_LIMIT_DEDUCTIBLE'; rawText: string; policyType: PolicyType;
      limit?: string; deductible?: string; eachOccurrence?: string; damageToRentedPremises?: string; medExp?: string; personalAdvInjury?: string; generalAggregate?: string; productsCompOpAgg?: string;
      elEachAccident?: string; elDiseaseEaEmployee?: string; elDiseasePolicyLimit?: string; aggregate?: string }
  | { type: 'CREATE_INSURED'; rawText: string; name: string; dba?: string; address: string; usdot: string; drivers: UIDriver[]; phone: string; email: string; secondaryEmail?: string };

export interface JobInputUI {
  mode: 'new_client' | 'existing_client';
  clientName: string;
  usdot?: string;
  dba?: string;
  language: 'es' | 'en';
  notifyTo: string;
  commands: UICommand[];
}

export type JobStatus = 'queued' | 'processing' | 'done' | 'failed' | 'needs_review';

export interface JobSummary {
  id: string; status: JobStatus; clientName: string; usdot?: string;
  commands: UICommand[]; notifyTo: string; createdBy: string; createdAt: string;
  resultSummary?: string; resultFiles?: string[]; errorMessage?: string;
}
```

- [ ] **Step 2: Extend `defaultCommand` and `COMMAND_LABELS`** in `web/ui/src/components/CommandForm.tsx` to cover all types. Replace the existing `defaultCommand` switch and `COMMAND_LABELS` with full versions:
```ts
const emptyHolder = (): UIHolder => ({ name: '', address: '', note: '' });

export function defaultCommand(type: CommandType): UICommand {
  switch (type) {
    case 'NO_CHANGE': return { type, rawText: '' };
    case 'CREATE_MASTER': return { type, rawText: '' };
    case 'ADD_VEHICLE': return { type, rawText: '', vin: '', year: '', description: '', value: '', effectiveDate: '' };
    case 'REMOVE_VEHICLE': return { type, rawText: '', vin: '', year: '', description: '', value: '', effectiveDate: '' };
    case 'UPDATE_VEHICLE_VALUE': return { type, rawText: '', vin: '', value: '' };
    case 'DELETE_VEHICLE_VALUE': return { type, rawText: '', vin: '' };
    case 'REMOVE_DRIVER': return { type, rawText: '', driver: { firstName: '', lastName: '', cdl: '', cdlState: '', dob: '' } };
    case 'REMOVE_HOLDER': return { type, rawText: '', holderName: '' };
    case 'ADD_NOTE_TO_MASTER': return { type, rawText: '', note: '' };
    case 'UPDATE_MAILING_ADDRESS': return { type, rawText: '', address: '' };
    case 'UPDATE_POLICY_NUMBER': return { type, rawText: '', policyType: 'AL', newPolicyNumber: '' };
    case 'ADD_ADDITIONAL_INSURED': return { type, rawText: '', policies: [], holder: emptyHolder() };
    case 'ADD_WAIVER_SUBROGATION': return { type, rawText: '', policies: [], holder: emptyHolder() };
    case 'ADD_AI_AND_WOS': return { type, rawText: '', policies: [], holder: emptyHolder() };
    case 'ADD_NOTE_TO_HOLDER': return { type, rawText: '', holder: emptyHolder() };
    case 'ADD_LOSS_PAYEE': return { type, rawText: '', vin: '', holder: emptyHolder() };
    case 'UPDATE_HOLDER': return { type, rawText: '', holderName: '', updateTo: '', note: '' };
    case 'UPDATE_LP_HOLDER': return { type, rawText: '', vin: '', holderName: '', updateTo: '', note: '' };
    case 'ADD_POLICY': return { type, rawText: '', policyType: 'AL', carrier: '', mga: '', policyNumber: '', effectiveDate: '', expirationDate: '' };
    case 'UPDATE_LIMIT_DEDUCTIBLE': return { type, rawText: '', policyType: 'AL' };
    case 'CREATE_INSURED': return { type, rawText: '', name: '', dba: '', address: '', usdot: '', drivers: [], phone: '', email: '', secondaryEmail: '' };
  }
}

export const COMMAND_LABELS: Record<CommandType, string> = {
  NO_CHANGE: 'Sin cambios (Recibido)', CREATE_MASTER: 'Crear Master',
  ADD_VEHICLE: 'Agregar vehículo', REMOVE_VEHICLE: 'Quitar vehículo',
  UPDATE_VEHICLE_VALUE: 'Actualizar valor de vehículo', DELETE_VEHICLE_VALUE: 'Borrar valor de vehículo',
  REMOVE_DRIVER: 'Quitar driver', REMOVE_HOLDER: 'Quitar holder',
  ADD_NOTE_TO_MASTER: 'Nota al Master', UPDATE_MAILING_ADDRESS: 'Actualizar dirección',
  UPDATE_POLICY_NUMBER: 'Actualizar número de póliza',
  ADD_ADDITIONAL_INSURED: 'Additional Insured', ADD_WAIVER_SUBROGATION: 'Waiver of Subrogation',
  ADD_AI_AND_WOS: 'AI & WOS', ADD_NOTE_TO_HOLDER: 'Nota al holder',
  ADD_LOSS_PAYEE: 'Loss Payee', UPDATE_HOLDER: 'Actualizar holder', UPDATE_LP_HOLDER: 'Actualizar LP holder',
  ADD_POLICY: 'Agregar póliza', UPDATE_LIMIT_DEDUCTIBLE: 'Actualizar límite/deducible',
  CREATE_INSURED: 'Crear asegurado (cliente nuevo)',
};
```
Import `UIHolder`, `UIDriver`, `PolicyType` in CommandForm. The big render switch comes in Tasks 6–8; for now `CommandForm` can keep rendering the existing 4 + a `return null` fallback for unimplemented types (temporary).

- [ ] **Step 3: Typecheck** — `cd web/ui && npx tsc -b` clean (CommandForm may need a temporary `default: return null;` for unhandled types — that's fine, Tasks 6-8 fill them).

- [ ] **Step 4: Commit** — `feat(ui): tipos/labels/defaults de todos los comandos (Fase 3)`

---

## Task 6 (UI): formularios simples, remove, note, mailing, policy-number

**Files:** Modify `web/ui/src/components/CommandForm.tsx`, `web/ui/src/components/CommandForm.test.tsx`

**Produces:** render de campos para CREATE_MASTER (sin campos), REMOVE_VEHICLE, REMOVE_DRIVER, REMOVE_HOLDER, ADD_NOTE_TO_MASTER, UPDATE_MAILING_ADDRESS, UPDATE_POLICY_NUMBER.

- [ ] **Step 1: Add a failing test** to `CommandForm.test.tsx`:
```ts
it('REMOVE_HOLDER edita holderName', () => {
  const onChange = vi.fn();
  render(<CommandForm value={defaultCommand('REMOVE_HOLDER')} onChange={onChange} />);
  fireEvent.change(screen.getByLabelText(/Holder/i), { target: { value: 'ACME LLC' } });
  expect(onChange.mock.calls.at(-1)![0]).toMatchObject({ type: 'REMOVE_HOLDER', holderName: 'ACME LLC' });
});
it('UPDATE_POLICY_NUMBER cambia policyType y número', () => {
  const onChange = vi.fn();
  render(<CommandForm value={defaultCommand('UPDATE_POLICY_NUMBER')} onChange={onChange} />);
  fireEvent.change(screen.getByLabelText(/Nuevo n[uú]mero/i), { target: { value: 'X-99' } });
  expect(onChange.mock.calls.at(-1)![0]).toMatchObject({ type: 'UPDATE_POLICY_NUMBER', newPolicyNumber: 'X-99' });
});
```

- [ ] **Step 2: Run, confirm FAIL** — `cd web/ui && npx vitest run src/components/CommandForm.test.tsx`.

- [ ] **Step 3: Implement** these branches in `CommandForm` (use the `instanceId` prefix pattern already present for ids, and the `set(patch)` helper). Add, before the final fallback:
```tsx
  if (value.type === 'CREATE_MASTER') {
    return <p style={{ color: 'var(--h2o-gray)', margin: 0 }}>Crea el certificado master del asegurado.</p>;
  }

  if (value.type === 'REMOVE_VEHICLE') {
    return (
      <>
        <div className="field"><label htmlFor={`cmd-${instanceId}-vin`}>VIN</label><input id={`cmd-${instanceId}-vin`} value={value.vin} onChange={e => set({ vin: e.target.value })} /></div>
        <div className="row">
          <div className="field" style={{ flex: 1 }}><label htmlFor={`cmd-${instanceId}-year`}>Año</label><input id={`cmd-${instanceId}-year`} value={value.year} onChange={e => set({ year: e.target.value })} /></div>
          <div className="field" style={{ flex: 2 }}><label htmlFor={`cmd-${instanceId}-desc`}>Descripción</label><input id={`cmd-${instanceId}-desc`} value={value.description} onChange={e => set({ description: e.target.value })} /></div>
        </div>
        <div className="field"><label htmlFor={`cmd-${instanceId}-eff`}>Effective Date</label><input id={`cmd-${instanceId}-eff`} value={value.effectiveDate} onChange={e => set({ effectiveDate: e.target.value })} placeholder="03/05/2026" /></div>
      </>
    );
  }

  if (value.type === 'REMOVE_DRIVER') {
    const d = value.driver;
    const setD = (patch: Partial<UIDriver>) => set({ driver: { ...d, ...patch } } as Partial<UICommand>);
    return (
      <div className="row">
        <div className="field" style={{ flex: 1 }}><label htmlFor={`cmd-${instanceId}-fn`}>Nombre</label><input id={`cmd-${instanceId}-fn`} value={d.firstName} onChange={e => setD({ firstName: e.target.value })} /></div>
        <div className="field" style={{ flex: 1 }}><label htmlFor={`cmd-${instanceId}-ln`}>Apellido</label><input id={`cmd-${instanceId}-ln`} value={d.lastName} onChange={e => setD({ lastName: e.target.value })} /></div>
        <div className="field" style={{ flex: 1 }}><label htmlFor={`cmd-${instanceId}-cdl`}>CDL</label><input id={`cmd-${instanceId}-cdl`} value={d.cdl} onChange={e => setD({ cdl: e.target.value })} /></div>
        <div className="field" style={{ flex: 1 }}><label htmlFor={`cmd-${instanceId}-cdls`}>Estado CDL</label><input id={`cmd-${instanceId}-cdls`} value={d.cdlState} onChange={e => setD({ cdlState: e.target.value })} /></div>
      </div>
    );
  }

  if (value.type === 'REMOVE_HOLDER') {
    return <div className="field"><label htmlFor={`cmd-${instanceId}-hn`}>Holder</label><input id={`cmd-${instanceId}-hn`} value={value.holderName} onChange={e => set({ holderName: e.target.value })} /></div>;
  }

  if (value.type === 'ADD_NOTE_TO_MASTER') {
    return <div className="field"><label htmlFor={`cmd-${instanceId}-note`}>Nota</label><textarea id={`cmd-${instanceId}-note`} value={value.note} onChange={e => set({ note: e.target.value })} rows={3} /></div>;
  }

  if (value.type === 'UPDATE_MAILING_ADDRESS') {
    return <div className="field"><label htmlFor={`cmd-${instanceId}-addr`}>Nueva dirección</label><input id={`cmd-${instanceId}-addr`} value={value.address} onChange={e => set({ address: e.target.value })} placeholder="555 Estadio Rd, Dallas, TX, 75201" /></div>;
  }

  if (value.type === 'UPDATE_POLICY_NUMBER') {
    return (
      <div className="row">
        <div className="field" style={{ flex: 1 }}>
          <label htmlFor={`cmd-${instanceId}-pt`}>Tipo de póliza</label>
          <select id={`cmd-${instanceId}-pt`} value={value.policyType} onChange={e => set({ policyType: e.target.value as PolicyType })}>
            {['AL','MTC','APD','GL','WC','EXL','NTL'].map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
        <div className="field" style={{ flex: 2 }}><label htmlFor={`cmd-${instanceId}-num`}>Nuevo número</label><input id={`cmd-${instanceId}-num`} value={value.newPolicyNumber} onChange={e => set({ newPolicyNumber: e.target.value })} /></div>
      </div>
    );
  }
```

- [ ] **Step 4: Run, confirm PASS** + `cd web/ui && npx tsc -b` + `npm run build`.

- [ ] **Step 5: Commit** — `feat(ui): formularios simples/remove/note/mailing/policy-number (Fase 3)`

---

## Task 7 (UI): grupo holder (HolderFields) + comandos asociados

**Files:** Create `web/ui/src/components/HolderFields.tsx`; Modify `CommandForm.tsx`, `CommandForm.test.tsx`

**Produces:** `HolderFields` (name/address/note + selector de pólizas opcional) y render de ADD_ADDITIONAL_INSURED, ADD_WAIVER_SUBROGATION, ADD_AI_AND_WOS, ADD_NOTE_TO_HOLDER, ADD_LOSS_PAYEE, UPDATE_HOLDER, UPDATE_LP_HOLDER.

- [ ] **Step 1: Failing test**:
```ts
it('ADD_ADDITIONAL_INSURED edita holder.name y togglea póliza AL', () => {
  const onChange = vi.fn();
  render(<CommandForm value={defaultCommand('ADD_ADDITIONAL_INSURED')} onChange={onChange} />);
  fireEvent.change(screen.getByLabelText(/Nombre del holder/i), { target: { value: 'RXO LLC' } });
  fireEvent.click(screen.getByLabelText('AL'));
  const last = onChange.mock.calls.at(-1)![0];
  expect(last.holder.name).toBe('RXO LLC');
  expect(last.policies).toContain('AL');
});
```

- [ ] **Step 2: Run, confirm FAIL**.

- [ ] **Step 3: Create `web/ui/src/components/HolderFields.tsx`**:
```tsx
import { UIHolder } from '../types';

const POLICY_OPTIONS = ['AL', 'GL', 'WC', 'MTC', 'APD', 'EXL'];

export function PolicyPicker({ instanceId, value, onChange }: { instanceId: number; value: string[]; onChange: (p: string[]) => void }) {
  const toggle = (p: string) => onChange(value.includes(p) ? value.filter(x => x !== p) : [...value, p]);
  return (
    <div className="field">
      <label>Pólizas</label>
      <div className="row">
        {POLICY_OPTIONS.map(p => (
          <label key={p} htmlFor={`cmd-${instanceId}-pol-${p}`} style={{ display: 'flex', gap: 6, alignItems: 'center', fontWeight: 400 }}>
            <input id={`cmd-${instanceId}-pol-${p}`} type="checkbox" style={{ width: 'auto' }} checked={value.includes(p)} onChange={() => toggle(p)} aria-label={p} />
            {p}
          </label>
        ))}
      </div>
    </div>
  );
}

export function HolderFields({ instanceId, value, onChange }: { instanceId: number; value: UIHolder; onChange: (h: UIHolder) => void }) {
  const set = (patch: Partial<UIHolder>) => onChange({ ...value, ...patch });
  return (
    <>
      <div className="field"><label htmlFor={`cmd-${instanceId}-hname`}>Nombre del holder</label><input id={`cmd-${instanceId}-hname`} value={value.name} onChange={e => set({ name: e.target.value })} /></div>
      <div className="field"><label htmlFor={`cmd-${instanceId}-haddr`}>Dirección del holder</label><input id={`cmd-${instanceId}-haddr`} value={value.address} onChange={e => set({ address: e.target.value })} placeholder="500 Market St, Houston, TX, 77002" /></div>
      <div className="field"><label htmlFor={`cmd-${instanceId}-hnote`}>Nota (opcional)</label><textarea id={`cmd-${instanceId}-hnote`} value={value.note ?? ''} onChange={e => set({ note: e.target.value })} rows={2} /></div>
    </>
  );
}
```

- [ ] **Step 4: Wire into `CommandForm`** — import `{ HolderFields, PolicyPicker }`; add branches:
```tsx
  if (value.type === 'ADD_ADDITIONAL_INSURED' || value.type === 'ADD_WAIVER_SUBROGATION' || value.type === 'ADD_AI_AND_WOS') {
    return (
      <>
        <PolicyPicker instanceId={instanceId} value={value.policies} onChange={p => set({ policies: p } as Partial<UICommand>)} />
        <HolderFields instanceId={instanceId} value={value.holder} onChange={h => set({ holder: h } as Partial<UICommand>)} />
      </>
    );
  }
  if (value.type === 'ADD_NOTE_TO_HOLDER') {
    return <HolderFields instanceId={instanceId} value={value.holder} onChange={h => set({ holder: h } as Partial<UICommand>)} />;
  }
  if (value.type === 'ADD_LOSS_PAYEE') {
    return (
      <>
        <div className="field"><label htmlFor={`cmd-${instanceId}-lpvin`}>VIN</label><input id={`cmd-${instanceId}-lpvin`} value={value.vin} onChange={e => set({ vin: e.target.value })} /></div>
        <HolderFields instanceId={instanceId} value={value.holder} onChange={h => set({ holder: h } as Partial<UICommand>)} />
      </>
    );
  }
  if (value.type === 'UPDATE_HOLDER' || value.type === 'UPDATE_LP_HOLDER') {
    return (
      <>
        {value.type === 'UPDATE_LP_HOLDER' && (
          <div className="field"><label htmlFor={`cmd-${instanceId}-uvin`}>VIN</label><input id={`cmd-${instanceId}-uvin`} value={value.vin} onChange={e => set({ vin: e.target.value })} /></div>
        )}
        <div className="field"><label htmlFor={`cmd-${instanceId}-uhn`}>Holder actual</label><input id={`cmd-${instanceId}-uhn`} value={value.holderName} onChange={e => set({ holderName: e.target.value })} /></div>
        <div className="field"><label htmlFor={`cmd-${instanceId}-uto`}>Actualizar a (nuevo nombre o dirección)</label><input id={`cmd-${instanceId}-uto`} value={value.updateTo} onChange={e => set({ updateTo: e.target.value })} /></div>
        <div className="field"><label htmlFor={`cmd-${instanceId}-unote`}>Nota (opcional)</label><textarea id={`cmd-${instanceId}-unote`} value={value.note ?? ''} onChange={e => set({ note: e.target.value })} rows={2} /></div>
      </>
    );
  }
```

- [ ] **Step 5: Run, confirm PASS** + `tsc -b` + `npm run build`.

- [ ] **Step 6: Commit** — `feat(ui): grupo holder (AI/WOS/AI&WOS/note/loss-payee/update holder) (Fase 3)`

---

## Task 8 (UI): pólizas (PolicyFields) — ADD_POLICY + UPDATE_LIMIT_DEDUCTIBLE

**Files:** Create `web/ui/src/components/PolicyFields.tsx`; Modify `CommandForm.tsx`, `CommandForm.test.tsx`

**Produces:** `PolicyFields` con coberturas condicionales por `policyType`, usado por ADD_POLICY (con header carrier/mga/número/fechas + autos para AL/NTL) y UPDATE_LIMIT_DEDUCTIBLE.

- [ ] **Step 1: Failing test**:
```ts
it('ADD_POLICY AL muestra checkboxes de autos y togglea Scheduled Autos', () => {
  const onChange = vi.fn();
  render(<CommandForm value={defaultCommand('ADD_POLICY')} onChange={onChange} />);
  fireEvent.click(screen.getByLabelText(/Scheduled Autos/i));
  expect(onChange.mock.calls.at(-1)![0]).toMatchObject({ type: 'ADD_POLICY', scheduledAutos: true });
});
it('ADD_POLICY GL no muestra Scheduled Autos', () => {
  const gl = { ...defaultCommand('ADD_POLICY'), policyType: 'GL' as const };
  render(<CommandForm value={gl} onChange={() => {}} />);
  expect(screen.queryByLabelText(/Scheduled Autos/i)).toBeNull();
});
```

- [ ] **Step 2: Run, confirm FAIL**.

- [ ] **Step 3: Create `web/ui/src/components/PolicyFields.tsx`**:
```tsx
import { PolicyType } from '../types';

const POLICY_TYPES: PolicyType[] = ['AL', 'MTC', 'APD', 'GL', 'WC', 'EXL', 'NTL'];

type CoverageKeys =
  | 'limit' | 'deductible' | 'eachOccurrence' | 'damageToRentedPremises' | 'medExp'
  | 'personalAdvInjury' | 'generalAggregate' | 'productsCompOpAgg'
  | 'elEachAccident' | 'elDiseaseEaEmployee' | 'elDiseasePolicyLimit' | 'aggregate';
type AutoKeys = 'anyAuto' | 'allOwnedAutos' | 'scheduledAutos' | 'hiredAutos' | 'nonOwnedAutos';

export interface PolicyFieldsValue {
  policyType: PolicyType;
  limit?: string; deductible?: string; eachOccurrence?: string; damageToRentedPremises?: string;
  medExp?: string; personalAdvInjury?: string; generalAggregate?: string; productsCompOpAgg?: string;
  elEachAccident?: string; elDiseaseEaEmployee?: string; elDiseasePolicyLimit?: string; aggregate?: string;
  anyAuto?: boolean; allOwnedAutos?: boolean; scheduledAutos?: boolean; hiredAutos?: boolean; nonOwnedAutos?: boolean;
}

const AUTO_LABELS: Record<AutoKeys, string> = { anyAuto: 'Any Auto', allOwnedAutos: 'All Owned Autos', scheduledAutos: 'Scheduled Autos', hiredAutos: 'Hired Autos', nonOwnedAutos: 'Non-Owned Autos' };

function Txt({ id, label, val, on }: { id: string; label: string; val?: string; on: (v: string) => void }) {
  return <div className="field" style={{ flex: 1, minWidth: 180 }}><label htmlFor={id}>{label}</label><input id={id} value={val ?? ''} onChange={e => on(e.target.value)} /></div>;
}

export function PolicyFields({ instanceId, value, onChange, showAutos }: {
  instanceId: number; value: PolicyFieldsValue; onChange: (patch: Partial<PolicyFieldsValue>) => void; showAutos: boolean;
}) {
  const t = value.policyType;
  const txt = (k: CoverageKeys, label: string) => <Txt id={`cmd-${instanceId}-${k}`} label={label} val={value[k]} on={v => onChange({ [k]: v } as Partial<PolicyFieldsValue>)} />;
  return (
    <>
      <div className="field">
        <label htmlFor={`cmd-${instanceId}-ptype`}>Tipo de póliza</label>
        <select id={`cmd-${instanceId}-ptype`} value={t} onChange={e => onChange({ policyType: e.target.value as PolicyType })}>
          {POLICY_TYPES.map(p => <option key={p} value={p}>{p}</option>)}
        </select>
      </div>

      {(t === 'AL' || t === 'NTL') && (
        <>
          {showAutos && (
            <div className="field">
              <label>Autos</label>
              <div className="row">
                {(Object.keys(AUTO_LABELS) as AutoKeys[]).map(k => (
                  <label key={k} htmlFor={`cmd-${instanceId}-${k}`} style={{ display: 'flex', gap: 6, alignItems: 'center', fontWeight: 400 }}>
                    <input id={`cmd-${instanceId}-${k}`} type="checkbox" style={{ width: 'auto' }} checked={!!value[k]} onChange={e => onChange({ [k]: e.target.checked } as Partial<PolicyFieldsValue>)} aria-label={AUTO_LABELS[k]} />
                    {AUTO_LABELS[k]}
                  </label>
                ))}
              </div>
            </div>
          )}
          <div className="row">{txt('limit', 'Límite (CSL)')}{txt('deductible', 'Deducible')}</div>
        </>
      )}

      {t === 'GL' && (
        <>
          <div className="row">{txt('eachOccurrence', 'Each Occurrence')}{txt('generalAggregate', 'General Aggregate')}</div>
          <div className="row">{txt('productsCompOpAgg', 'Products-Comp/Op Agg')}{txt('personalAdvInjury', 'Personal & Adv Injury')}</div>
          <div className="row">{txt('damageToRentedPremises', 'Damage to Rented Premises')}{txt('medExp', 'Med Exp')}</div>
          <div className="row">{txt('deductible', 'Deducible')}</div>
        </>
      )}

      {t === 'WC' && (
        <div className="row">{txt('elEachAccident', 'E.L. Each Accident')}{txt('elDiseaseEaEmployee', 'E.L. Disease - EA Employee')}{txt('elDiseasePolicyLimit', 'E.L. Disease - Policy Limit')}</div>
      )}

      {t === 'EXL' && (<div className="row">{txt('eachOccurrence', 'Each Occurrence')}{txt('aggregate', 'Aggregate')}</div>)}

      {(t === 'MTC' || t === 'APD') && (<div className="row">{txt('limit', 'Límite')}{txt('deductible', 'Deducible')}</div>)}
    </>
  );
}
```

- [ ] **Step 4: Wire into `CommandForm`** — import `{ PolicyFields }`; add branches:
```tsx
  if (value.type === 'ADD_POLICY') {
    return (
      <>
        <div className="row">
          <div className="field" style={{ flex: 1 }}><label htmlFor={`cmd-${instanceId}-carrier`}>Carrier</label><input id={`cmd-${instanceId}-carrier`} value={value.carrier} onChange={e => set({ carrier: e.target.value })} /></div>
          <div className="field" style={{ flex: 1 }}><label htmlFor={`cmd-${instanceId}-mga`}>MGA</label><input id={`cmd-${instanceId}-mga`} value={value.mga} onChange={e => set({ mga: e.target.value })} /></div>
        </div>
        <div className="row">
          <div className="field" style={{ flex: 1 }}><label htmlFor={`cmd-${instanceId}-pnum`}>Número de póliza</label><input id={`cmd-${instanceId}-pnum`} value={value.policyNumber} onChange={e => set({ policyNumber: e.target.value })} /></div>
          <div className="field" style={{ flex: 1 }}><label htmlFor={`cmd-${instanceId}-eff`}>Effective</label><input id={`cmd-${instanceId}-eff`} value={value.effectiveDate} onChange={e => set({ effectiveDate: e.target.value })} placeholder="03/05/2026" /></div>
          <div className="field" style={{ flex: 1 }}><label htmlFor={`cmd-${instanceId}-exp`}>Expiration</label><input id={`cmd-${instanceId}-exp`} value={value.expirationDate} onChange={e => set({ expirationDate: e.target.value })} placeholder="03/05/2027" /></div>
        </div>
        <PolicyFields instanceId={instanceId} showAutos value={value} onChange={patch => set(patch as Partial<UICommand>)} />
      </>
    );
  }
  if (value.type === 'UPDATE_LIMIT_DEDUCTIBLE') {
    return <PolicyFields instanceId={instanceId} showAutos={false} value={value} onChange={patch => set(patch as Partial<UICommand>)} />;
  }
```

- [ ] **Step 5: Run, confirm PASS** + `tsc -b` + `npm run build`.

- [ ] **Step 6: Commit** — `feat(ui): formularios de póliza (ADD_POLICY/UPDATE_LIMIT_DEDUCTIBLE) (Fase 3)`

---

## Task 9 (UI): CREATE_INSURED + selector de modo en JobBuilder

**Files:** Create `web/ui/src/components/CreateInsuredFields.tsx`; Modify `CommandForm.tsx`, `web/ui/src/pages/JobBuilder.tsx`, `CommandForm.test.tsx`

**Produces:** sub-form de cliente nuevo (con array de drivers), branch CREATE_INSURED en CommandForm, y un JobBuilder con selector **Cliente nuevo / Cliente existente** que: en `new_client` muestra solo el form CREATE_INSURED (+ permite agregar otras acciones), en `existing_client` excluye CREATE_INSURED de la paleta y manda `mode` correcto.

- [ ] **Step 1: Failing test** (CommandForm):
```ts
it('CREATE_INSURED agrega un driver', () => {
  const onChange = vi.fn();
  render(<CommandForm value={defaultCommand('CREATE_INSURED')} onChange={onChange} />);
  fireEvent.click(screen.getByText(/Agregar driver/i));
  expect(onChange.mock.calls.at(-1)![0].drivers).toHaveLength(1);
});
```

- [ ] **Step 2: Run, confirm FAIL**.

- [ ] **Step 3: Create `web/ui/src/components/CreateInsuredFields.tsx`**:
```tsx
import { UIDriver } from '../types';

export interface CreateInsuredValue {
  name: string; dba?: string; address: string; usdot: string; drivers: UIDriver[]; phone: string; email: string; secondaryEmail?: string;
}

const emptyDriver = (): UIDriver => ({ firstName: '', lastName: '', cdl: '', cdlState: '', dob: '' });

export function CreateInsuredFields({ instanceId, value, onChange }: { instanceId: number; value: CreateInsuredValue; onChange: (patch: Partial<CreateInsuredValue>) => void }) {
  const setDriver = (i: number, patch: Partial<UIDriver>) => onChange({ drivers: value.drivers.map((d, j) => (j === i ? { ...d, ...patch } : d)) });
  const addDriver = () => onChange({ drivers: [...value.drivers, emptyDriver()] });
  const removeDriver = (i: number) => onChange({ drivers: value.drivers.filter((_, j) => j !== i) });
  return (
    <>
      <div className="row">
        <div className="field" style={{ flex: 2 }}><label htmlFor={`cmd-${instanceId}-iname`}>Nombre del asegurado</label><input id={`cmd-${instanceId}-iname`} value={value.name} onChange={e => onChange({ name: e.target.value })} /></div>
        <div className="field" style={{ flex: 1 }}><label htmlFor={`cmd-${instanceId}-idba`}>DBA (opcional)</label><input id={`cmd-${instanceId}-idba`} value={value.dba ?? ''} onChange={e => onChange({ dba: e.target.value })} /></div>
      </div>
      <div className="field"><label htmlFor={`cmd-${instanceId}-iaddr`}>Dirección</label><input id={`cmd-${instanceId}-iaddr`} value={value.address} onChange={e => onChange({ address: e.target.value })} placeholder="123 Main St, Dallas, TX, 75201" /></div>
      <div className="row">
        <div className="field" style={{ flex: 1 }}><label htmlFor={`cmd-${instanceId}-iusdot`}>USDOT</label><input id={`cmd-${instanceId}-iusdot`} value={value.usdot} onChange={e => onChange({ usdot: e.target.value })} /></div>
        <div className="field" style={{ flex: 1 }}><label htmlFor={`cmd-${instanceId}-iphone`}>Teléfono</label><input id={`cmd-${instanceId}-iphone`} value={value.phone} onChange={e => onChange({ phone: e.target.value })} /></div>
      </div>
      <div className="row">
        <div className="field" style={{ flex: 1 }}><label htmlFor={`cmd-${instanceId}-iemail`}>Email</label><input id={`cmd-${instanceId}-iemail`} value={value.email} onChange={e => onChange({ email: e.target.value })} /></div>
        <div className="field" style={{ flex: 1 }}><label htmlFor={`cmd-${instanceId}-iemail2`}>Email secundario (opcional)</label><input id={`cmd-${instanceId}-iemail2`} value={value.secondaryEmail ?? ''} onChange={e => onChange({ secondaryEmail: e.target.value })} /></div>
      </div>
      <div className="field">
        <label>Drivers</label>
        {value.drivers.map((d, i) => (
          <div className="row" key={i} style={{ alignItems: 'flex-end' }}>
            <div className="field" style={{ flex: 1 }}><label htmlFor={`cmd-${instanceId}-d${i}-fn`}>Nombre</label><input id={`cmd-${instanceId}-d${i}-fn`} value={d.firstName} onChange={e => setDriver(i, { firstName: e.target.value })} /></div>
            <div className="field" style={{ flex: 1 }}><label htmlFor={`cmd-${instanceId}-d${i}-ln`}>Apellido</label><input id={`cmd-${instanceId}-d${i}-ln`} value={d.lastName} onChange={e => setDriver(i, { lastName: e.target.value })} /></div>
            <div className="field" style={{ flex: 1 }}><label htmlFor={`cmd-${instanceId}-d${i}-cdl`}>CDL</label><input id={`cmd-${instanceId}-d${i}-cdl`} value={d.cdl} onChange={e => setDriver(i, { cdl: e.target.value })} /></div>
            <div className="field" style={{ flex: 1 }}><label htmlFor={`cmd-${instanceId}-d${i}-st`}>Estado</label><input id={`cmd-${instanceId}-d${i}-st`} value={d.cdlState} onChange={e => setDriver(i, { cdlState: e.target.value })} /></div>
            <div className="field" style={{ flex: 1 }}><label htmlFor={`cmd-${instanceId}-d${i}-dob`}>DOB</label><input id={`cmd-${instanceId}-d${i}-dob`} value={d.dob} onChange={e => setDriver(i, { dob: e.target.value })} placeholder="01/15/1988" /></div>
            <button type="button" className="secondary" onClick={() => removeDriver(i)}>Quitar</button>
          </div>
        ))}
        <button type="button" className="secondary" onClick={addDriver}>+ Agregar driver</button>
      </div>
    </>
  );
}
```

- [ ] **Step 4: Wire CREATE_INSURED branch in `CommandForm`**:
```tsx
  if (value.type === 'CREATE_INSURED') {
    return <CreateInsuredFields instanceId={instanceId} value={value} onChange={patch => set(patch as Partial<UICommand>)} />;
  }
```
(import `{ CreateInsuredFields }`). Remove the temporary `default: return null` if all types are now handled (the switch/if-chain should cover every `CommandType`).

- [ ] **Step 5: Update `JobBuilder.tsx`** — add a mode selector and make the command palette mode-aware. Key changes:
  - Add state `const [mode, setMode] = useState<'new_client' | 'existing_client'>('existing_client');`
  - When `mode === 'new_client'`: initialize `commands` to `[defaultCommand('CREATE_INSURED')]` and the "Agregar acción" palette should NOT offer CREATE_INSURED again but MAY offer the others; when switching to `existing_client`, reset to `[defaultCommand('ADD_VEHICLE')]`.
  - The available types for the palette:
```tsx
const EXISTING_TYPES: CommandType[] = ['ADD_VEHICLE','REMOVE_VEHICLE','UPDATE_VEHICLE_VALUE','DELETE_VEHICLE_VALUE','ADD_POLICY','UPDATE_LIMIT_DEDUCTIBLE','UPDATE_POLICY_NUMBER','ADD_ADDITIONAL_INSURED','ADD_WAIVER_SUBROGATION','ADD_AI_AND_WOS','ADD_NOTE_TO_HOLDER','ADD_LOSS_PAYEE','UPDATE_HOLDER','UPDATE_LP_HOLDER','REMOVE_HOLDER','ADD_NOTE_TO_MASTER','UPDATE_MAILING_ADDRESS','CREATE_MASTER','REMOVE_DRIVER','NO_CHANGE'];
const NEW_TYPES: CommandType[] = ['CREATE_MASTER','ADD_VEHICLE','ADD_POLICY','ADD_ADDITIONAL_INSURED','ADD_WAIVER_SUBROGATION','ADD_AI_AND_WOS','ADD_NOTE_TO_HOLDER','ADD_NOTE_TO_MASTER'];
```
  - A handler to switch mode that resets commands:
```tsx
function switchMode(m: 'new_client' | 'existing_client') {
  setMode(m);
  setCommands(m === 'new_client' ? [defaultCommand('CREATE_INSURED')] : [defaultCommand('ADD_VEHICLE')]);
}
```
  - Render a toggle at the top of the client card:
```tsx
<div className="field">
  <label>Tipo de solicitud</label>
  <div className="row">
    <button type="button" className={mode === 'existing_client' ? '' : 'secondary'} onClick={() => switchMode('existing_client')}>Cliente existente (endoso)</button>
    <button type="button" className={mode === 'new_client' ? '' : 'secondary'} onClick={() => switchMode('new_client')}>Cliente nuevo (documentar)</button>
  </div>
</div>
```
  - The palette maps over `(mode === 'new_client' ? NEW_TYPES : EXISTING_TYPES)`.
  - In `submit`, send `mode` (not hardcoded): `const job: JobInputUI = { mode, clientName: clientName.trim(), usdot: usdot.trim() || undefined, notifyTo: notifyTo.trim(), language, commands };`
  - For `new_client`, `clientName` should default to the CREATE_INSURED's `name` if the user left the header blank — to keep it simple, keep requiring `clientName` (the header field) and let the user type the new client's name there too; OR auto-fill: when mode is new_client and there's a CREATE_INSURED command, use its `name` as clientName. Implement the simple rule: `const effectiveClientName = mode === 'new_client' ? (commands.find(c => c.type === 'CREATE_INSURED') as any)?.name || clientName : clientName;` and validate that it's non-empty.

- [ ] **Step 6: Run all UI tests + build** — `cd web/ui && npx vitest run && npx tsc -b && npm run build`. Run root `npm test` too (backend unaffected but confirm green).

- [ ] **Step 7: Commit** — `feat(ui): CREATE_INSURED + selector de modo en JobBuilder (Fase 3)`

---

## Self-Review

**1. Spec coverage:** Los 17 comandos tienen esquema Zod (Tasks 1-4) y formulario UI (Tasks 6-9); `mode`/coherencia en Task 4 + JobBuilder Task 9. ADD_DRIVER omitido a propósito (Global Constraints). `jobsRouter`/worker sin cambios (ya soportan ambos modos + CREATE_INSURED — verificado en Fase 1/2).

**2. Placeholder scan:** El `default: return null` temporal de CommandForm (Task 5) se elimina en Task 9 cuando todos los tipos están cubiertos — indicado explícitamente. Sin otros placeholders.

**3. Type consistency:** `holderSchema`/`driverSchema`/`policyTypeSchema` definidos en Task 1 y reusados en 2-4. UI: `UIHolder`/`UIDriver`/`PolicyType`/`UICommand` en types.ts (Task 5) consumidos por `HolderFields`/`PolicyFields`/`CreateInsuredFields`/`CommandForm`/`JobBuilder`. `defaultCommand`/`COMMAND_LABELS` cubren exactamente `CommandType`.

**4. Ambigüedad:** `policies` (AI/WOS) se modela como checkboxes AL/GL/WC/MTC/APD/EXL → `string[]`, espejo de cómo el bot mapea. Coberturas por tipo de póliza siguen el mapeo de `addPolicy`/`emailParser`. Validación fuerte = backend Zod.

---

## Notas / fuera de alcance
- **ADD_DRIVER**: omitido hasta cerrar la acción del bot. Cuando se cierre: agregar `addDriverSchema` a la unión + variante UICommand + branch en CommandForm + a `NEW_TYPES`/`EXISTING_TYPES`.
- `ADD_LOSS_PAYEE`/`UPDATE_LP_HOLDER` siguen "pending" en el bot (NowCerts sin Physical Damage en el cliente de prueba) — el form encola bien, pero el bot puede fallar hasta que esa acción esté validada en vivo.
- Posible refactor futuro: compartir tipos/Zod hacia la UI para eliminar la duplicación `UICommand` ↔ esquemas.
