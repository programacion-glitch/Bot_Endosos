import { Page } from 'playwright';
import { DeleteVehicleValueCommand, ActionResult } from '../types';
import { logger } from '../utils/logger';
import { ok, fail, getInsuredUrl, getInsuredIdFromUrl, buildNowCertsUrl } from './_base';

async function openVehicles(page: Page): Promise<void> {
  await page.goto(getInsuredUrl(page, 'Vehicles'), {
    waitUntil: 'domcontentloaded',
  });
  await page.waitForTimeout(2000);
}

async function resolveVehicleEditUrl(page: Page, vin: string): Promise<string> {
  await openVehicles(page);

  const row = page.locator('tr').filter({ hasText: new RegExp(vin.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') }).first();
  if (await row.count() === 0) {
    throw new Error(`Vehicle row not found for VIN ${vin}`);
  }

  await row.locator('button, a, span').filter({ hasText: /Actions/i }).first().click({ force: true });
  await page.waitForTimeout(600);
  await page.locator('li, a, span').filter({ hasText: /^ID Card$/i }).first().click({ force: true });
  await page.waitForTimeout(3000);

  const frame = page.frame({ name: 'rwPopup' });
  if (!frame) {
    throw new Error('Unable to resolve vehicle ID from ID Card popup');
  }

  const popupUrl = frame.url();
  const vehicleId = new URL(popupUrl).searchParams.get('VehicleId');
  if (!vehicleId) {
    throw new Error('VehicleId not found in ID Card popup URL');
  }

  const insuredId = getInsuredIdFromUrl(page);
  return buildNowCertsUrl(`/Vehicles/Edit.aspx?Id=${vehicleId}&Return=Details&TruckingCompanyId=${insuredId}`);
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

    const valueInput = page.locator('#ContentPlaceHolder1_FormView1_ctl01_ctl09___Price_TextBox1').first();
    await valueInput.fill('');

    await page.locator('#btnUpdate_input').click({ force: true });
    await page.waitForTimeout(5000);

    return ok('DELETE_VEHICLE_VALUE', `Value deleted for VIN ${cmd.vin}.`);
  } catch (err) {
    return fail('DELETE_VEHICLE_VALUE', (err as Error).message, err as Error);
  }
}
