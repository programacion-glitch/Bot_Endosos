/**
 * Test integración: ejecuta addVehicle() contra NowCerts con un VIN específico.
 *
 * Uso:
 *   npx ts-node scripts/test-add-vehicle.ts
 *
 * Requiere .env con NOWCERTS_USER / NOWCERTS_PASSWORD válidos.
 *
 * Caso de prueba:
 *   Cliente: Pix Test 3 LLC (id d9fd4e2c-0d62-411f-8c6c-4f2431fb6783)
 *   VIN:     3AKJHHDR4JSJR3836
 *   Year:    2018
 *   Desc:    FRHT
 *   Eff:     05/15/2026
 *
 * Asserts:
 *   1) addVehicle retorna success === true (o partial con file no nulo si AL existe)
 *   2) El URL final está fuera de /Insert
 *   3) El vehículo aparece en la lista de Vehicles del insured
 */
import { addVehicle } from '../src/actions/addVehicle';
import { getNowCertsPage } from '../src/browser/nowcertsLogin';
import { closeBrowser } from '../src/browser/browserManager';
import { buildInsuredUrl } from '../src/actions/_base';
import { AddVehicleCommand } from '../src/types';
import { logger } from '../src/utils/logger';

const INSURED_ID = 'd9fd4e2c-0d62-411f-8c6c-4f2431fb6783'; // Pix Test 3 LLC

const TEST_VIN = '3AKJHHDR4JSJR3836';
const TEST_COMMAND: AddVehicleCommand = {
  type: 'ADD_VEHICLE',
  rawText: 'Add Vehicle\nVIN#: 3AKJHHDR4JSJR3836\nYear: 2018\nDescription: FRHT\nEffective Date: 05/15/2026',
  vin: TEST_VIN,
  year: '2018',
  description: 'FRHT',
  effectiveDate: '05/15/2026',
};

type AssertResult = { name: string; pass: boolean; detail?: string };

function logResult(r: AssertResult): void {
  const icon = r.pass ? '✅' : '❌';
  console.log(`${icon} ${r.name}${r.detail ? ' — ' + r.detail : ''}`);
}

async function runTest(): Promise<void> {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('Test: addVehicle() — Pix Test 3 LLC / VIN ' + TEST_VIN);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  const results: AssertResult[] = [];

  try {
    logger.info('Test: opening NowCerts page (login if needed)...');
    const page = await getNowCertsPage();

    // Posicionarnos en el insured antes de llamar addVehicle (que lee el ID del URL)
    const insuredUrl = buildInsuredUrl(INSURED_ID, 'Information');
    logger.info(`Test: navigating to insured ${insuredUrl}`);
    await page.goto(insuredUrl, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);

    // Snapshot del estado inicial: cuántos vehículos hay antes
    const beforeUrl = buildInsuredUrl(INSURED_ID, 'Vehicles');
    await page.goto(beforeUrl, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);
    const vehiclesBefore = await page.evaluate(() => {
      const doc = (globalThis as any).document;
      return doc.querySelectorAll('[role="grid"] tbody tr').length as number;
    }).catch(() => 0);

    console.log(`\n  Estado inicial: ${vehiclesBefore} vehículos en la lista`);
    console.log(`  Ejecutando addVehicle(${TEST_VIN}, year=${TEST_COMMAND.year})...\n`);

    // Volver al Insured antes de ejecutar (addVehicle hace su propia navegación)
    await page.goto(insuredUrl, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);

    const t0 = Date.now();
    const result = await addVehicle(page, TEST_COMMAND, [TEST_COMMAND]);
    const elapsed = ((Date.now() - t0) / 1000).toFixed(1);

    console.log(`\n  addVehicle terminó en ${elapsed}s`);
    console.log(`  result.success = ${result.success}`);
    console.log(`  result.message = "${result.message}"`);
    if (result.downloadedFiles?.length) {
      console.log(`  result.downloadedFiles = ${result.downloadedFiles.join(', ')}`);
    }
    if (result.errorScreenshot) {
      console.log(`  result.errorScreenshot = ${result.errorScreenshot}`);
    }
    if (result.error) {
      console.log(`  result.error = ${result.error.message}`);
    }
    console.log('');

    // Aceptamos success OR partial-success por ID Card faltante (eso depende de pólizas)
    const okOrPartialIdCard = result.success || /ID Card/i.test(result.message);
    results.push({
      name: 'addVehicle() retornó success o partial (ID Card failure ok)',
      pass: okOrPartialIdCard,
      detail: `success=${result.success}, msg="${result.message.slice(0, 80)}"`,
    });

    // Verificar URL final NO está en /Insert
    const finalUrl = page.url();
    results.push({
      name: 'URL final fuera de /Insert',
      pass: !finalUrl.includes('/Insert'),
      detail: finalUrl,
    });

    // Verificar el vehículo aparece en la lista
    await page.goto(buildInsuredUrl(INSURED_ID, 'Vehicles'), { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);
    const vehiclesAfter = await page.evaluate(() => {
      const doc = (globalThis as any).document;
      return doc.querySelectorAll('[role="grid"] tbody tr').length as number;
    }).catch(() => 0);
    const vinFound = await page.evaluate((vin: string) => {
      const doc = (globalThis as any).document;
      const rows = Array.from(doc.querySelectorAll('[role="grid"] tbody tr')) as any[];
      return rows.some((r: any) => (r.textContent || '').includes(vin));
    }, TEST_VIN);

    results.push({
      name: `Vehicle count creció (${vehiclesBefore} → ${vehiclesAfter})`,
      pass: vehiclesAfter > vehiclesBefore,
      detail: `before=${vehiclesBefore} after=${vehiclesAfter}`,
    });

    results.push({
      name: `VIN ${TEST_VIN} aparece en lista de Vehicles`,
      pass: vinFound,
    });
  } catch (err) {
    results.push({
      name: 'Test no lanzó excepción',
      pass: false,
      detail: (err as Error).message,
    });
    console.error('\n❌ Excepción no manejada:', err);
  } finally {
    console.log('\n━━━━━━ Asserts ━━━━━━');
    for (const r of results) logResult(r);
    const passed = results.filter(r => r.pass).length;
    console.log(`\n${passed}/${results.length} asserts passed\n`);

    await closeBrowser().catch(() => {});
    process.exit(results.every(r => r.pass) ? 0 : 1);
  }
}

runTest().catch(err => {
  console.error('Fatal error in runTest:', err);
  process.exit(1);
});
