# Refactorización: Deduplicación y Reorganización de Helpers

**Fecha**: 2026-03-20
**Scope**: src/actions/ (y src/browser/nowcertsLogin.ts para escapeRegex)

## Problema

~400+ líneas de código duplicado en 12+ archivos de acciones. Funciones utilitarias, constantes y helpers de UI están copiados en múltiples archivos. `addPolicy.ts` tiene 617 LOC mezclando helpers genéricos con lógica específica de pólizas.

## Solución

Reorganizar en 3 archivos helper con responsabilidades claras, sin cambiar funcionalidad.

## Arquitectura de Helpers

### `_base.ts` — Utilidades genéricas y constantes

Responsabilidad: Funciones puras, constantes, URL builders. Nota: ya tiene funciones que aceptan `Page` (`waitForSaveConfirmation`, `triggerDownload`) — esto se mantiene por conveniencia.

**Funciones existentes** (no se mueven):
- `ok()`, `fail()`, `getNowCertsBaseUrl()`, `buildNowCertsUrl()`
- `getInsuredIdFromUrl()`, `buildInsuredUrl()`, `getInsuredUrl()`
- `getTruckingCompanyEditUrl()`, `buildTruckingCompanyDetailsUrl()`
- `waitForSaveConfirmation()`, `triggerDownload()`
- `todayYYYYMMdd()`, `cleanClientName()`, `safeFilenamePart()`

**Funciones a agregar** (extraer de archivos que las duplican):
- `escapeRegex(value: string): string` — de 11 archivos (10 en actions/ + nowcertsLogin.ts)
- `toDigits(value?: string): string` — de addPolicy.ts, updateLimitDeductible.ts
- `STATE_NAMES: Record<string, string>` — de _holderHelpers.ts, addDriver.ts, createInsured.ts
- `toFullStateName(value: string): string` — de mismos 3 archivos
- `LINE_LABELS: Record<string, string>` — de updatePolicyNumber.ts, updateLimitDeductible.ts (mapea AL→'Commercial Auto', etc.)
- `byIdEndsWith(suffix: string): string` — de addPolicy.ts, updateLimitDeductible.ts

**Nota**: `addPolicy.ts` tiene `LOB_NAMES`, `BUSINESS_TYPE_NAMES` y `COVERAGE_SECTION_NAMES` que son distintos de `LINE_LABELS`. `LOB_NAMES` se queda en addPolicy.ts porque solo lo usa ese archivo. `COVERAGE_SECTION_NAMES` también se queda ahí.

### `_policyHelpers.ts` — Controles aspx de pólizas (NUEVO)

Responsabilidad: Interacción con controles RadComboBox, checkboxes, coverages y formularios aspx de NowCerts.

**Funciones a extraer desde addPolicy.ts:**
- `selectRadComboByText(page, arrowSelector, text): Promise<boolean>` — versión con 3 reintentos (canónica)
- `setCheckboxById(page, selector, checked): Promise<void>`
- `ensureControlExists(page, selector): Promise<void>`
- `fillCoverageText(page, selector, value?): Promise<void>`
- `waitForControlAttached(page, selector, timeout?): Promise<boolean>`
- `openCoveragesView(page): Promise<void>`
- `selectCoverageSection(page, sectionName): Promise<void>`
- `refreshCoverageSections(page): Promise<void>`

**Funciones a consolidar:**
- `resolvePolicyEditUrl(page, insuredId, policyLabel): Promise<string>` — versión canónica: navega a Policies grid, busca fila por LOB, extrae policy ID del link, retorna Edit.aspx URL. Acepta `insuredId` como parámetro (no lo extrae del URL actual, para evitar el bug que ya corregimos). El caller es responsable de pasar el insuredId.
- `saveMaster(page, strict?): Promise<void>` — acepta parámetro `strict` (default `false`). Si `strict=true` y no hay master, lanza error (comportamiento actual de updatePolicyNumber). Si `strict=false`, skip graceful (comportamiento de updateLimitDeductible). Así no cambia el comportamiento de ningún caller.

**Reconciliación de divergencias:**
- `selectRadComboByText`: La versión canónica es la de addPolicy.ts (3 reintentos). `addVehicle.ts` actualmente usa 1 intento — cambiará a 3 reintentos, lo cual es más robusto, no un regression.
- `updateMailingAddress.ts` tiene una versión con 4 parámetros que también llena el input. Esta se queda como función local en updateMailingAddress.ts (wrapper que llama a la versión canónica internamente).
- `fillField` (updateLimitDeductible.ts) se elimina y se reemplaza por `fillCoverageText` importado de _policyHelpers.ts (misma lógica, ambos formatean con toDigits + toLocaleString).

### `_holderHelpers.ts` — Operaciones de holders/certificates

**Sin cambios estructurales mayores.** Solo:
- Eliminar `escapeRegex` local, importar de `_base.ts`
- Eliminar `STATE_NAMES`/`toFullStateName` locales, importar de `_base.ts`

**Funciones a agregar** (extraer de addAdditionalInsured.ts, addAIandWOS.ts, addWaiverSubrogation.ts):
- `selectNgMultiOption(page, index, values): Promise<void>` — duplicada en 3 archivos (~20 LOC x 3)
- `policyLineLabel(policyType): string` — duplicada en 3 archivos. Reconciliación: addAdditionalInsured.ts mapea EXL→'Excess', los otros dos mapean EXL→'Umbrella Liability'. Usar 'Umbrella Liability' como canónico (es el texto real en NowCerts).
- `policySelectionLabel(policyType, policyNumber): string` — duplicada en 3 archivos, idéntica
- `wosCheckbox(page): Promise<void>` — duplicada en addAIandWOS.ts y addWaiverSubrogation.ts

**Funciones que permanecen sin cambios:**
- `openAdditionalInterestInsert()`, `searchOrCreateHolder()`, `downloadCertificate()`
- `selectNgSelectByIndex()`, `checkAllCombo()`, `buildPreviewPdf()` (privadas)

## Archivos a modificar

### Archivos que se reducen significativamente

| Archivo | Antes | Después | Cambio |
|---------|-------|---------|--------|
| addPolicy.ts | 617 | ~280 | Extraer helpers genéricos a _policyHelpers.ts |
| updateLimitDeductible.ts | 194 | ~80 | Eliminar duplicados, importar de _base y _policyHelpers |
| updatePolicyNumber.ts | 106 | ~50 | Eliminar saveMaster, resolvePolicyEditUrl, escapeRegex |
| addAdditionalInsured.ts | 153 | ~80 | Extraer selectNgMultiOption, policyLineLabel, policySelectionLabel |
| addAIandWOS.ts | 158 | ~80 | Extraer mismas funciones + wosCheckbox |
| addWaiverSubrogation.ts | 134 | ~60 | Extraer mismas funciones + wosCheckbox |

### Archivos que solo cambian imports (eliminar función local, agregar import)

- `addVehicle.ts` — eliminar `escapeRegex` y `selectRadComboByText` locales
- `addDriver.ts` — eliminar `escapeRegex`, `STATE_NAMES`, `toFullStateName`
- `createInsured.ts` — eliminar `escapeRegex`, `STATE_NAMES`, `toFullStateName`
- `updateHolder.ts` — eliminar `escapeRegex`
- `createMaster.ts` — eliminar `escapeRegex`
- `_holderHelpers.ts` — eliminar `escapeRegex`, `STATE_NAMES`, `toFullStateName`
- `updateMailingAddress.ts` — eliminar `escapeRegex` (mantiene su selectRadComboByText local de 4 params como wrapper)
- `nowcertsLogin.ts` (src/browser/) — eliminar `escapeRegex`
- `deleteVehicleValue.ts` — reemplazar inline regex escape por import de `escapeRegex`
- `updateVehicleValue.ts` — reemplazar inline regex escape por import de `escapeRegex`

### Archivos que NO se tocan
- `dispatcher.ts`, `main.ts`
- `emailParser.ts`, `imapClient.ts`, `emailSender.ts`
- `browserManager.ts`
- `config.ts`, `types/index.ts`
- `logger.ts`, `retry.ts`, `agentLookup.ts`
- `addNoteToHolder.ts`, `addLossPayee.ts`, `addNoteToMaster.ts`
- `noChange.ts`, `removeVehicle.ts`, `removeDriver.ts`
- `updateLPHolder.ts`

## Orden de implementación

1. **`_base.ts`** — agregar funciones puras y constantes
2. **`_policyHelpers.ts`** — crear archivo, extraer helpers aspx de addPolicy.ts + consolidar de updateLimitDeductible.ts y updatePolicyNumber.ts
3. **`_holderHelpers.ts`** — actualizar imports de _base.ts + agregar helpers extraídos de los 3 archivos holder
4. **Archivos consumidores grandes** — addPolicy.ts, updateLimitDeductible.ts, updatePolicyNumber.ts, addAdditionalInsured.ts, addAIandWOS.ts, addWaiverSubrogation.ts
5. **Archivos consumidores pequeños** — addVehicle.ts, addDriver.ts, createInsured.ts, etc. (solo cambio de imports)
6. **Verificación** — compilación + grep + smoke test

## Validación

- `npx tsc --noEmit` — sin errores después de cada paso
- `grep -r "function escapeRegex" src/` — solo debe aparecer en `_base.ts`
- `grep -r "const LINE_LABELS" src/` — solo en `_base.ts`
- `grep -r "const STATE_NAMES" src/` — solo en `_base.ts`
- `grep -r "async function selectRadComboByText" src/` — solo en `_policyHelpers.ts`
- `grep -r "async function saveMaster" src/` — solo en `_policyHelpers.ts`
- Verificar LOC de addPolicy.ts < 300
- Smoke test: ejecutar un flujo de ADD_VEHICLE y UPDATE_LIMIT_DEDUCTIBLE para confirmar que no hay regression
