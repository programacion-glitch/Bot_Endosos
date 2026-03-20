# Refactoring: Helper Deduplication Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate ~400 LOC of duplicated utility functions across 12+ action files by consolidating into 3 helper files.

**Architecture:** Three helper files with clear responsibilities: `_base.ts` (pure utilities/constants), `_policyHelpers.ts` (aspx/RadComboBox interactions), `_holderHelpers.ts` (Angular/Momentum holder operations). Consumer files import instead of re-declaring.

**Tech Stack:** TypeScript, Playwright

**Spec:** `docs/superpowers/specs/2026-03-20-refactor-deduplication-design.md`

---

## File Structure

### Files to create
- `src/actions/_policyHelpers.ts` — RadComboBox, checkbox, coverage, and policy-edit helpers

### Files to modify (helpers)
- `src/actions/_base.ts` — Add shared pure functions and constants
- `src/actions/_holderHelpers.ts` — Update imports, add holder-specific shared functions

### Files to modify (consumers — major reduction)
- `src/actions/addPolicy.ts` — Remove extracted helpers, add imports
- `src/actions/updateLimitDeductible.ts` — Replace local functions with imports
- `src/actions/updatePolicyNumber.ts` — Replace local functions with imports
- `src/actions/addAdditionalInsured.ts` — Extract shared holder functions
- `src/actions/addAIandWOS.ts` — Extract shared holder functions
- `src/actions/addWaiverSubrogation.ts` — Extract shared holder functions

### Files to modify (consumers — import-only changes)
- `src/actions/addVehicle.ts` — Remove local escapeRegex + selectRadComboByText
- `src/actions/addDriver.ts` — Remove local STATE_NAMES + toFullStateName
- `src/actions/createInsured.ts` — Remove local STATE_NAMES + toFullStateName
- `src/actions/updateHolder.ts` — Remove local escapeRegex
- `src/actions/createMaster.ts` — Remove local escapeRegex
- `src/actions/updateMailingAddress.ts` — Remove local escapeRegex (keep local selectRadComboByText wrapper)
- `src/actions/deleteVehicleValue.ts` — Replace inline regex with escapeRegex import
- `src/actions/updateVehicleValue.ts` — Replace inline regex with escapeRegex import
- `src/browser/nowcertsLogin.ts` — Remove local escapeRegex

---

## Task 1: Add shared utilities to `_base.ts`

**Files:**
- Modify: `src/actions/_base.ts` (add exports after line 150)

- [ ] **Step 1: Add `escapeRegex`, `toDigits`, `byIdEndsWith` to `_base.ts`**

Append to end of `src/actions/_base.ts`:

```typescript
/**
 * Escapes special regex characters in a string for use in RegExp constructor.
 */
export function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Extracts only digit characters from a string. Returns empty string if no digits.
 */
export function toDigits(value?: string): string {
  return (value ?? '').replace(/[^\d]/g, '');
}

/**
 * Builds a CSS selector matching elements whose id ends with the given suffix.
 */
export function byIdEndsWith(suffix: string): string {
  return `[id$="${suffix}"]`;
}
```

- [ ] **Step 2: Add `STATE_NAMES`, `toFullStateName` to `_base.ts`**

Append to `src/actions/_base.ts`:

```typescript
export const STATE_NAMES: Record<string, string> = {
  AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California',
  CO: 'Colorado', CT: 'Connecticut', DE: 'Delaware', FL: 'Florida', GA: 'Georgia',
  HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois', IN: 'Indiana', IA: 'Iowa',
  KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana', ME: 'Maine', MD: 'Maryland',
  MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota', MS: 'Mississippi', MO: 'Missouri',
  MT: 'Montana', NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire', NJ: 'New Jersey',
  NM: 'New Mexico', NY: 'New York', NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio',
  OK: 'Oklahoma', OR: 'Oregon', PA: 'Pennsylvania', RI: 'Rhode Island', SC: 'South Carolina',
  SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah', VT: 'Vermont',
  VA: 'Virginia', WA: 'Washington', WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming',
  DC: 'District of Columbia',
};

export function toFullStateName(value: string): string {
  return STATE_NAMES[value.toUpperCase()] ?? value;
}
```

- [ ] **Step 3: Add `LINE_LABELS` to `_base.ts`**

Append to `src/actions/_base.ts`:

```typescript
/** Maps policy type codes to the display labels used in NowCerts policy grids. */
export const LINE_LABELS: Record<string, string> = {
  AL: 'Commercial Auto',
  NTL: 'Commercial Auto',
  MTC: 'Motor Truck Cargo',
  APD: 'Physical Damage',
  GL: 'General Liability',
  WC: "Worker's Compensation",
  EXL: 'Excess Liability',
};
```

- [ ] **Step 4: Verify compilation**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add src/actions/_base.ts
git commit -m "refactor: add shared utilities and constants to _base.ts"
```

---

## Task 2: Create `_policyHelpers.ts`

**Files:**
- Create: `src/actions/_policyHelpers.ts`
- Source: Extract from `src/actions/addPolicy.ts` lines 60-325 and consolidate from `src/actions/updateLimitDeductible.ts` lines 46-110, `src/actions/updatePolicyNumber.ts` lines 20-64

- [ ] **Step 1: Create `_policyHelpers.ts` with selector constants, RadComboBox and checkbox helpers**

Create `src/actions/_policyHelpers.ts` with constants and functions extracted from `addPolicy.ts`:

```typescript
import { Page } from 'playwright';
import { logger } from '../utils/logger';
import { escapeRegex, toDigits, buildNowCertsUrl } from './_base';

// ── Selector constants (moved from addPolicy.ts, shared with other policy files) ──

export const COVERAGES_VIEW = 'div.ibox:has(h4:text-is("Coverages")) span.label.state';
export const COVERAGES_ARROW = '#ctl00_ContentPlaceHolder1_FormView1_ctl01_ctl23___LinesOfBusinessAndFees_rptManageCoverages_ctl00_usrCoveragesSelector_ddlCoveragesSections_Arrow';
export const COVERAGES_REFRESH = '#ctl00_ContentPlaceHolder1_FormView1_ctl01_ctl23___LinesOfBusinessAndFees_btnRefreshSections';
export const COVERAGES_DROPDOWN = '#ctl00_ContentPlaceHolder1_FormView1_ctl01_ctl23___LinesOfBusinessAndFees_rptManageCoverages_ctl00_usrCoveragesSelector_ddlCoveragesSections_DropDown li';
export const AL_SECTION_CHECKBOX = '[id$="automobileLiability_cbAutomobileLiability"]';

// ── RadComboBox helpers ──────────────────────────────────────────────────────

export async function selectRadComboByText(page: Page, arrowSelector: string, text: string): Promise<boolean> {
  // Copy from addPolicy.ts lines 72-111 (the 3-retry version)
}

// ── Checkbox and form control helpers ────────────────────────────────────────

export async function waitForControlAttached(page: Page, selector: string, timeout = 10000): Promise<boolean> {
  // Copy from addPolicy.ts lines 227-236
}

export async function ensureControlExists(page: Page, selector: string): Promise<void> {
  // Copy from addPolicy.ts lines 238-253, uses openCoveragesView internally
}

export async function setCheckboxById(page: Page, selector: string, checked: boolean): Promise<void> {
  // Copy from addPolicy.ts lines 255-275
}

export async function fillCoverageText(page: Page, selector: string, value?: string): Promise<void> {
  // Copy from addPolicy.ts lines 277-294 (uses toDigits from _base)
}
```

Note: `ensureControlExists` calls `openCoveragesView` internally, so both must be in the same file.

- [ ] **Step 2: Add coverage section helpers to `_policyHelpers.ts`**

Append functions extracted from `addPolicy.ts`:

```typescript
// ── Coverage section management ──────────────────────────────────────────────

export async function openCoveragesView(page: Page): Promise<void> {
  // Copy from addPolicy.ts lines 169-177
}

export async function selectCoverageSection(page: Page, sectionName: string): Promise<void> {
  // Copy from addPolicy.ts lines 179-220
}

export async function refreshCoverageSections(page: Page): Promise<void> {
  // Copy from addPolicy.ts lines 222-225
}

export async function enableAutomobileLiabilityCoverage(page: Page): Promise<void> {
  // Copy from addPolicy.ts lines 296-325
}
```

- [ ] **Step 3: Add `resolvePolicyEditUrl` to `_policyHelpers.ts`**

Consolidated version that navigates to Policies grid first and accepts insuredId:

```typescript
export async function resolvePolicyEditUrl(page: Page, insuredId: string, policyLabel: string): Promise<string> {
  const policiesUrl = `${buildNowCertsUrl('/AMSINS/Insureds/Details/')}${insuredId}/Policies`;
  await page.goto(policiesUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);

  const row = page.locator('table tbody tr, [role="row"]')
    .filter({ hasText: new RegExp(escapeRegex(policyLabel), 'i') })
    .first();
  if (await row.count() === 0) {
    throw new Error(`Policy row not found for ${policyLabel}`);
  }

  const link = row.locator('a[href*="/AMSINS/Policies/Details/"]').first();
  const href = await link.getAttribute('href');
  if (!href) {
    throw new Error(`Policy details link not found for ${policyLabel}`);
  }

  const match = href.match(/\/AMSINS\/Policies\/Details\/([^/]+)/i);
  if (!match?.[1]) {
    throw new Error(`Policy id not found in link: ${href}`);
  }

  return buildNowCertsUrl(`/Policies/Edit.aspx?Id=${match[1]}`);
}
```

- [ ] **Step 4: Add `saveMaster` to `_policyHelpers.ts`**

Consolidated version with `strict` parameter:

```typescript
export async function saveMaster(page: Page, strict = false): Promise<void> {
  const certRows = page.locator('table tbody tr').filter({
    has: page.locator('button, a, span').filter({ hasText: /Actions/i }),
  });
  const count = await certRows.count();
  if (strict && count !== 1) {
    throw new Error(`Expected exactly 1 master certificate row, found ${count}`);
  }
  if (count === 0) {
    logger.info('No master certificate found - skipping');
    return;
  }

  const row = certRows.first();
  await row.locator('button, a, span').filter({ hasText: /Actions/i }).first().click({ force: true });
  await page.waitForTimeout(700);
  await page.locator('li, a, span').filter({ hasText: /^Edit$/i }).first().click({ force: true });
  await page.waitForTimeout(3000);
  const frame = page.frame({ name: 'rwPopup' });
  if (!frame) {
    throw new Error('Master certificate edit popup did not load');
  }

  await frame.locator('#ctl00_ContentPlaceHolder1_btnUpdate_input').click({ force: true }).catch(async () => {
    await frame.locator('#ctl00_ContentPlaceHolder1_btnUpdate_input').evaluate((el: any) => el.click());
  });
  await page.waitForTimeout(5000);
}
```

- [ ] **Step 5: Verify compilation**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 6: Commit**

```bash
git add src/actions/_policyHelpers.ts
git commit -m "refactor: create _policyHelpers.ts with extracted policy helpers"
```

---

## Task 3: Update `_holderHelpers.ts`

**Files:**
- Modify: `src/actions/_holderHelpers.ts`
- Source: Extract from `src/actions/addAdditionalInsured.ts`, `src/actions/addAIandWOS.ts`, `src/actions/addWaiverSubrogation.ts`

- [ ] **Step 1: Replace local `escapeRegex`, `STATE_NAMES`, `toFullStateName` with imports**

In `src/actions/_holderHelpers.ts`:
- Remove `escapeRegex` (lines 67-69)
- Remove `STATE_NAMES` (lines 13-25)
- Remove `toFullStateName` (lines 27-29)
- Add to existing import from `_base`: `escapeRegex, STATE_NAMES, toFullStateName`

- [ ] **Step 2: Add `selectNgMultiOption` to `_holderHelpers.ts`**

Copy from `addAdditionalInsured.ts` lines 13-33 and export:

```typescript
export async function selectNgMultiOption(page: Page, index: number, value: string): Promise<boolean> {
  // Copy from addAdditionalInsured.ts lines 13-33 (single value, returns boolean)
  // Replace internal escapeRegex call with imported version (already imported)
}
```

- [ ] **Step 3: Add `policyLineLabel`, `policySelectionLabel`, `wosCheckbox` to `_holderHelpers.ts`**

```typescript
export function policyLineLabel(policyType: string): string {
  // Copy from addWaiverSubrogation.ts lines 94-107 (canonical: EXL → 'Umbrella Liability')
}

export function policySelectionLabel(policyType: string, policyNumber: string): string {
  // Copy from addAdditionalInsured.ts lines 142-153
}

export function wosCheckbox(page: Page, policy: string): Locator {
  // Copy from addWaiverSubrogation.ts lines 122-134 (synchronous, returns Locator)
  // Import { Locator } from 'playwright' at top of file
}
```

- [ ] **Step 4: Verify compilation**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add src/actions/_holderHelpers.ts
git commit -m "refactor: consolidate holder helpers, remove local duplicates"
```

---

## Task 4: Update `addPolicy.ts` — remove extracted helpers

**Files:**
- Modify: `src/actions/addPolicy.ts`

- [ ] **Step 1: Update imports**

Replace/add imports at top of file:
```typescript
import { escapeRegex, toDigits, byIdEndsWith } from './_base';
import {
  COVERAGES_VIEW, COVERAGES_ARROW, COVERAGES_REFRESH, COVERAGES_DROPDOWN, AL_SECTION_CHECKBOX,
  selectRadComboByText, setCheckboxById, ensureControlExists,
  fillCoverageText, waitForControlAttached, openCoveragesView,
  selectCoverageSection, refreshCoverageSections,
  enableAutomobileLiabilityCoverage,
} from './_policyHelpers';
```

Note: `addPolicy.ts` still uses these constants in `chooseLOB` and `assignPolicyToMasterCertificate`, so they need to be imported back. The constants now live in `_policyHelpers.ts`.

- [ ] **Step 2: Remove extracted functions from addPolicy.ts**

Delete these local functions (replaced by imports):
- `escapeRegex` (lines 60-62)
- `byIdEndsWith` (lines 64-66)
- `toDigits` (lines 68-70)
- `selectRadComboByText` (lines 72-111)
- `openCoveragesView` (lines 169-177)
- `selectCoverageSection` (lines 179-220)
- `refreshCoverageSections` (lines 222-225)
- `waitForControlAttached` (lines 227-236)
- `ensureControlExists` (lines 238-253)
- `setCheckboxById` (lines 255-275)
- `fillCoverageText` (lines 277-294)
- `enableAutomobileLiabilityCoverage` (lines 296-325)
- `setChecked` (lines 327-330) — inline into callers: `if (value) await setCheckboxById(page, sel, true);`

Keep: `clickPoliciesAddNew`, `chooseLOB`, `fill*` functions per policy type, `assignPolicyToMasterCertificate`, `mapLimitToCsl`, `validateSupportedPolicy`, `assertValidatedCoverageSupport`, `fillPhysicalDamage`, `addPolicy`.

- [ ] **Step 3: Verify compilation**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add src/actions/addPolicy.ts
git commit -m "refactor: remove extracted helpers from addPolicy.ts, use imports"
```

---

## Task 5: Update `updateLimitDeductible.ts` and `updatePolicyNumber.ts`

**Files:**
- Modify: `src/actions/updateLimitDeductible.ts`
- Modify: `src/actions/updatePolicyNumber.ts`

- [ ] **Step 1: Rewrite `updateLimitDeductible.ts` imports and remove local functions**

Replace imports:
```typescript
import { ok, fail, getInsuredIdFromUrl, buildInsuredUrl, LINE_LABELS, byIdEndsWith, toDigits } from './_base';
import { openCoveragesView, fillCoverageText, resolvePolicyEditUrl, saveMaster } from './_policyHelpers';
```

Remove local functions: `escapeRegex`, `byIdEndsWith`, `toDigits`, `fillField`, `resolvePolicyEditUrl`, `openCoveragesView`, `saveMaster`, `LINE_LABELS`.

Replace `fillField(page, selector, value)` calls with `fillCoverageText(page, selector, value)`.

Update `resolvePolicyEditUrl(page, policyLabel)` calls to `resolvePolicyEditUrl(page, insuredId, policyLabel)`.

- [ ] **Step 2: Rewrite `updatePolicyNumber.ts` imports and remove local functions**

Replace imports:
```typescript
import { ok, fail, buildNowCertsUrl, buildInsuredUrl, getInsuredIdFromUrl, LINE_LABELS } from './_base';
import { resolvePolicyEditUrl, saveMaster } from './_policyHelpers';
```

Remove local functions: `escapeRegex`, `resolvePolicyEditUrl`, `saveMaster`, `LINE_LABELS`.

Update `resolvePolicyEditUrl(page, policyLabel)` call to `resolvePolicyEditUrl(page, insuredId, policyLabel)` (insuredId already captured at line 86).

Update `saveMaster(page)` call to `saveMaster(page, true)` to preserve strict behavior.

- [ ] **Step 3: Verify compilation**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add src/actions/updateLimitDeductible.ts src/actions/updatePolicyNumber.ts
git commit -m "refactor: use shared helpers in updateLimitDeductible and updatePolicyNumber"
```

---

## Task 6: Update holder action files

**Files:**
- Modify: `src/actions/addAdditionalInsured.ts`
- Modify: `src/actions/addAIandWOS.ts`
- Modify: `src/actions/addWaiverSubrogation.ts`

- [ ] **Step 1: Update `addAdditionalInsured.ts`**

Add to imports from `_holderHelpers`:
```typescript
import { openAdditionalInterestInsert, searchOrCreateHolder, downloadCertificate, selectNgMultiOption, policyLineLabel, policySelectionLabel } from './_holderHelpers';
```

Remove local functions: `escapeRegex` (line 35-37), `selectNgMultiOption` (lines 13-33), `policyLineLabel` (lines 121-131), `policySelectionLabel` (lines 142-153).

Note: `addAdditionalInsured.ts` currently maps EXL→'Excess'. After this change it will use 'Umbrella Liability'. This matches the actual NowCerts UI text.

- [ ] **Step 2: Update `addAIandWOS.ts`**

Add to imports from `_holderHelpers`:
```typescript
import { openAdditionalInterestInsert, searchOrCreateHolder, downloadCertificate, selectNgMultiOption, policyLineLabel, policySelectionLabel, wosCheckbox } from './_holderHelpers';
```

Remove local functions: `escapeRegex` (lines 29-31), `selectNgMultiOption` (lines 7-27), `policyLineLabel` (lines 105-118), `policySelectionLabel` (lines 120-131), `wosCheckbox` (lines 146-158).

- [ ] **Step 3: Update `addWaiverSubrogation.ts`**

Add to imports from `_holderHelpers`:
```typescript
import { openAdditionalInterestInsert, searchOrCreateHolder, downloadCertificate, selectNgMultiOption, policyLineLabel, policySelectionLabel, wosCheckbox } from './_holderHelpers';
```

Remove local functions: `escapeRegex` (lines 29-31), `selectNgMultiOption` (lines 7-27), `policyLineLabel` (lines 94-107), `policySelectionLabel` (lines 109-120), `wosCheckbox` (lines 122-134).

- [ ] **Step 4: Verify compilation**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add src/actions/addAdditionalInsured.ts src/actions/addAIandWOS.ts src/actions/addWaiverSubrogation.ts
git commit -m "refactor: use shared holder helpers in AI, WOS, and AI+WOS actions"
```

---

## Task 7: Update remaining consumer files (import-only changes)

**Files:**
- Modify: `src/actions/addVehicle.ts`
- Modify: `src/actions/addDriver.ts`
- Modify: `src/actions/createInsured.ts`
- Modify: `src/actions/updateHolder.ts`
- Modify: `src/actions/createMaster.ts`
- Modify: `src/actions/updateMailingAddress.ts`
- Modify: `src/actions/deleteVehicleValue.ts`
- Modify: `src/actions/updateVehicleValue.ts`
- Modify: `src/browser/nowcertsLogin.ts`

- [ ] **Step 1: Update `addVehicle.ts`**

Add imports: `import { escapeRegex } from './_base';` and `import { selectRadComboByText } from './_policyHelpers';`
Remove local `escapeRegex` (line 14-16) and local `selectRadComboByText` (lines 24-58).

- [ ] **Step 2: Update `addDriver.ts` and `createInsured.ts`**

For both files, add to import from `_base`: `STATE_NAMES, toFullStateName`
Remove local `STATE_NAMES` and `toFullStateName` constants.
- `addDriver.ts`: remove lines 6-22
- `createInsured.ts`: remove lines 33-49

- [ ] **Step 3: Update `updateHolder.ts`, `createMaster.ts`**

Add `escapeRegex` to import from `_base`. Remove local `escapeRegex` (line 7-9 in both files).

- [ ] **Step 4: Update `updateMailingAddress.ts`**

Add `escapeRegex` to import from `_base`. Note: there is no local `escapeRegex` function in this file — only an inline regex pattern inside the local `selectRadComboByText`.
Keep local `selectRadComboByText` (lines 47-68) as-is since it has a different 4-parameter signature. Replace the inline `value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')` with `escapeRegex(value)` from the import.

- [ ] **Step 5: Update `deleteVehicleValue.ts` and `updateVehicleValue.ts`**

Add `import { escapeRegex } from './_base';`
Replace inline `vin.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')` (line 16 in both) with `escapeRegex(vin)`.

- [ ] **Step 6: Update `nowcertsLogin.ts`**

Add `import { escapeRegex } from '../actions/_base';`
Remove local `escapeRegex` (lines 182-184).

- [ ] **Step 7: Verify compilation**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 8: Commit**

```bash
git add src/actions/addVehicle.ts src/actions/addDriver.ts src/actions/createInsured.ts \
  src/actions/updateHolder.ts src/actions/createMaster.ts src/actions/updateMailingAddress.ts \
  src/actions/deleteVehicleValue.ts src/actions/updateVehicleValue.ts src/browser/nowcertsLogin.ts
git commit -m "refactor: replace local utility duplicates with shared imports"
```

---

## Task 8: Validation

- [ ] **Step 1: Verify no duplicate functions remain**

```bash
grep -rn "function escapeRegex" src/ | grep -v "_base.ts"
grep -rn "const LINE_LABELS" src/ | grep -v "_base.ts"
grep -rn "const STATE_NAMES" src/ | grep -v "_base.ts"
grep -rn "async function selectRadComboByText" src/ | grep -v "_policyHelpers.ts" | grep -v "updateMailingAddress.ts"
grep -rn "async function saveMaster" src/ | grep -v "_policyHelpers.ts"
grep -rn "async function resolvePolicyEditUrl" src/ | grep -v "_policyHelpers.ts"
grep -rn "function toFullStateName" src/ | grep -v "_base.ts"
```

Expected: All commands return empty (no matches).

- [ ] **Step 2: Verify line counts**

```bash
wc -l src/actions/addPolicy.ts src/actions/updateLimitDeductible.ts src/actions/updatePolicyNumber.ts src/actions/_base.ts src/actions/_policyHelpers.ts src/actions/_holderHelpers.ts
```

Expected: `addPolicy.ts` < 300, `updateLimitDeductible.ts` < 100, `updatePolicyNumber.ts` < 60.

- [ ] **Step 3: Full compilation check**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Final commit if any cleanup needed**

```bash
git add src/
git commit -m "refactor: cleanup after deduplication"
```
