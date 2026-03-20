import { Page } from 'playwright';
import { UpdateVehicleValueCommand, ActionResult } from '../types';
import { logger } from '../utils/logger';
import { ok, fail, escapeRegex, getInsuredUrl, getInsuredIdFromUrl, buildNowCertsUrl } from './_base';

async function openVehicles(page: Page): Promise<void> {
  await page.goto(getInsuredUrl(page, 'Vehicles'), {
    waitUntil: 'domcontentloaded',
  });
  await page.waitForTimeout(2000);
}

async function resolveVehicleEditUrl(page: Page, vin: string): Promise<string> {
  await openVehicles(page);

  const row = page.locator('tr').filter({ hasText: new RegExp(escapeRegex(vin), 'i') }).first();
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

function normalizePrice(value: string): string {
  const digits = value.replace(/[^0-9.]/g, '');
  if (!digits) return '';
  const [whole, decimals] = digits.split('.');
  const withComma = Number(whole).toLocaleString('en-US');
  return decimals ? `${withComma}.${decimals}` : withComma;
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

    await page.locator('#ContentPlaceHolder1_FormView1_ctl01_ctl09___Price_TextBox1').fill(normalizePrice(cmd.value));
    await page.locator('#btnUpdate_input').click({ force: true });
    await page.waitForTimeout(5000);

    return ok('UPDATE_VEHICLE_VALUE', `Value updated to ${cmd.value} for VIN ${cmd.vin}.`);
  } catch (err) {
    return fail('UPDATE_VEHICLE_VALUE', (err as Error).message, err as Error);
  }
}
