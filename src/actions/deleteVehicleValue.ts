import { Page } from 'playwright';
import { DeleteVehicleValueCommand, ActionResult } from '../types';
import { logger } from '../utils/logger';
import { ok, fail, escapeRegex, getInsuredUrl } from './_base';

async function openVehicles(page: Page): Promise<void> {
  await page.goto(getInsuredUrl(page, 'Vehicles'), {
    waitUntil: 'domcontentloaded',
  });
  await page.waitForTimeout(2000);
}

/**
 * Resuelve la URL de edición del vehículo por VIN. Ver nota en updateVehicleValue.ts:
 * la grilla migró a Kendo/Angular (Momentum Ago-2026); leemos el href del ítem "Edit"
 * del menú "Actions" de la fila, que trae la URL nueva con el VehicleId embebido.
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
 * Guarda el form de edición de vehículo (Angular): botón "Save Changes" + posible modal.
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
 * DELETE VEHICLE'S VALUE
 * 1. Vehicles list
 * 2. Resolve the selected vehicle's edit route
 * 3. Clear only the price/value field
 * 4. Update
 */
export async function deleteVehicleValue(
  page: Page,
  cmd: DeleteVehicleValueCommand
): Promise<ActionResult> {
  logger.info(`deleteVehicleValue: VIN=${cmd.vin}`);

  try {
    const editUrl = await resolveVehicleEditUrl(page, cmd.vin);
    await page.goto(editUrl, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2500);

    const valueInput = page.locator('input[placeholder="Value"]').first();
    await valueInput.waitFor({ state: 'visible', timeout: 20_000 });
    await valueInput.fill('');
    await saveVehicleEdit(page);
    await page.waitForTimeout(4000);

    return ok('DELETE_VEHICLE_VALUE', `Value deleted for VIN ${cmd.vin}.`);
  } catch (err) {
    return fail('DELETE_VEHICLE_VALUE', (err as Error).message, err as Error);
  }
}
