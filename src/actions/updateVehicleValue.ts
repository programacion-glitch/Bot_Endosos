import { Page } from 'playwright';
import { UpdateVehicleValueCommand, ActionResult } from '../types';
import { logger } from '../utils/logger';
import { ok, fail, escapeRegex, getInsuredUrl } from './_base';

async function openVehicles(page: Page): Promise<void> {
  await page.goto(getInsuredUrl(page, 'Vehicles'), {
    waitUntil: 'domcontentloaded',
  });
  await page.waitForTimeout(2000);
}

/**
 * Resuelve la URL de edición del vehículo por VIN.
 *
 * Tras la migración de Momentum (Ago-2026) la grilla de vehículos es un Kendo grid
 * Angular y el viejo popup RadWindow (`rwPopup`) que exponía el VehicleId desapareció.
 * El menú "Actions" de cada fila tiene un ítem "Edit" cuyo href ya trae la URL nueva
 * con el VehicleId embebido: /AMSINS/Vehicles/Edit/<vehicleId>?parentId=...&MomentumUrl=...
 */
async function resolveVehicleEditUrl(page: Page, vin: string): Promise<string> {
  await openVehicles(page);

  const row = page.locator('[role="grid"] tbody tr, table tbody tr')
    .filter({ hasText: new RegExp(escapeRegex(vin), 'i') }).first();
  if (await row.count() === 0) {
    throw new Error(`Vehicle row not found for VIN ${vin}`);
  }

  const actionsBtn = row.locator('.ncm-menu-grid-actions-button, li[aria-label="..."]').first();
  await actionsBtn.click({ force: true });
  await page.waitForTimeout(1200);

  const editLink = page.locator('a[href*="/Vehicles/Edit/"]:visible').first();
  await editLink.waitFor({ state: 'visible', timeout: 10_000 });
  const editHref = await editLink.getAttribute('href');
  if (!editHref) {
    throw new Error('Vehicle "Edit" link not found in Actions menu (post-migración Momentum)');
  }
  return editHref.startsWith('http') ? editHref : new URL(editHref, page.url()).toString();
}

/**
 * Guarda el form de edición de vehículo (Angular): botón "Save Changes" + posible
 * modal de confirmación.
 */
async function saveVehicleEdit(page: Page): Promise<void> {
  const saveBtn = page.locator('button.btn-primary').filter({ hasText: /Save Changes/i }).first();
  await saveBtn.waitFor({ state: 'visible', timeout: 15_000 });
  await saveBtn.scrollIntoViewIfNeeded().catch(() => {});
  await saveBtn.click({ force: true }).catch(async () => {
    await saveBtn.evaluate((el: any) => el.click());
  });
  const confirmYes = page.locator('.ant-modal button.ant-btn-primary, .modal button.btn-primary')
    .filter({ hasText: /^(Yes|OK|Save)$/i }).first();
  await confirmYes.click({ timeout: 3000 }).catch(() => {});
}

/**
 * Normalizes the value field while preserving any trailing text (e.g. notes).
 * Examples:
 *   "19580" -> "19,580"
 *   "19,580" -> "19,580"
 *   "19,580 Including Permanently Attached Equip" -> "19,580 Including Permanently Attached Equip"
 *   "$19,580.00 with notes" -> "19,580.00 with notes"
 */
function normalizePrice(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return '';

  // Try to extract the leading number (allowing $, commas, decimals) and the rest as text
  const match = trimmed.match(/^\$?\s*([\d,]+(?:\.\d+)?)\s*(.*)$/);
  if (!match) return trimmed;

  const numericPart = match[1].replace(/,/g, '');
  const restText = match[2].trim();

  if (!numericPart) return trimmed;

  const [whole, decimals] = numericPart.split('.');
  const formatted = Number(whole).toLocaleString('en-US');
  const formattedNumber = decimals ? `${formatted}.${decimals}` : formatted;

  return restText ? `${formattedNumber} ${restText}` : formattedNumber;
}

/**
 * UPDATE VEHICLE'S VALUE
 * Uses the old stable vehicle edit route and writes prices with comma formatting.
 */
export async function updateVehicleValue(
  page: Page,
  cmd: UpdateVehicleValueCommand
): Promise<ActionResult> {
  logger.info(`updateVehicleValue: VIN=${cmd.vin} value=${cmd.value}`);

  try {
    const editUrl = await resolveVehicleEditUrl(page, cmd.vin);
    await page.goto(editUrl, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2500);

    const valueInput = page.locator('input[placeholder="Value"]').first();
    await valueInput.waitFor({ state: 'visible', timeout: 20_000 });
    await valueInput.fill(normalizePrice(cmd.value));
    await saveVehicleEdit(page);
    await page.waitForTimeout(4000);

    return ok('UPDATE_VEHICLE_VALUE', `Value updated to ${cmd.value} for VIN ${cmd.vin}.`);
  } catch (err) {
    return fail('UPDATE_VEHICLE_VALUE', (err as Error).message, err as Error);
  }
}
