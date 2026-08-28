/**
 * Agrega un Loss Payee (flujo que funciona) a un vehículo permanente y luego abre
 * "Lien Holders" para capturar (screenshot + DOM) cómo se edita un LP holder ahora.
 * Uso: HEADLESS=true npx ts-node scripts/probeLP2.ts
 */
import * as fs from 'fs';
import * as path from 'path';
import { getNowCertsPage } from '../src/browser/nowcertsLogin';
import { closeBrowser } from '../src/browser/browserManager';
import { buildInsuredUrl } from '../src/actions/_base';
import { addLossPayee } from '../src/actions/addLossPayee';
import { AddLossPayeeCommand } from '../src/types';

const INSURED_ID = '55c82b02-351c-490c-a22e-205482e085cd';
const VIN = '1FUJBBCK17LX0356';
const HOLDER = 'Probe LP Bank NA';
const OUT = path.resolve('./probe-out');
function dump(n: string, c: string) { if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true }); fs.writeFileSync(path.join(OUT, n), c); console.log(`[dump] ${n}`); }

async function main() {
  const page = await getNowCertsPage();
  await page.goto(buildInsuredUrl(INSURED_ID, 'Information'), { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);

  // 1) Agregar loss payee (idempotente-ish: si ya existe, NowCerts puede duplicar; ok para probe)
  const cmd: AddLossPayeeCommand = {
    type: 'ADD_LOSS_PAYEE',
    rawText: `Add Loss Payee VIN# ${VIN}\nHolder name: ${HOLDER}\nHolder address: 1 Finance Way, Dallas, TX, 75201`,
    vin: VIN,
    holder: { name: HOLDER, address: '1 Finance Way, Dallas, TX, 75201' },
  };
  const res = await addLossPayee(page, cmd);
  console.log('addLossPayee:', res.success, res.message);

  // 2) Ir a Vehicles, abrir Actions de la fila y clickear "Lien Holders"
  await page.goto(buildInsuredUrl(INSURED_ID, 'Vehicles'), { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(5000);
  const row = page.locator('[role="grid"] tbody tr').filter({ hasText: VIN }).first();
  await row.locator('.ncm-menu-grid-actions-button, li[aria-label="..."]').first().click({ force: true });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(OUT, 'LP2_menu_open.png'), fullPage: false }).catch(() => {});
  const lien = page.locator('.k-animation-container').getByText(/^Lien Holders$/i).first();
  await lien.click({ force: true }).catch(async () => {
    await page.getByText(/^Lien Holders$/i).first().click({ force: true }).catch(() => {});
  });
  await page.waitForTimeout(5000);
  await page.screenshot({ path: path.join(OUT, 'LP2_after_lien.png'), fullPage: true }).catch(() => {});
  console.log('url after Lien Holders:', page.url());

  // 3) Volcar todos los frames: inputs y filas que contengan el holder
  const frames = page.frames();
  const report: any[] = [];
  for (const f of frames) {
    try {
      const hit = await f.evaluate((holder: string) => {
        const doc = (globalThis as any).document;
        const hasHolder = (doc.body?.textContent || '').includes(holder);
        const inputs = Array.from(doc.querySelectorAll('input, textarea')).map((e: any) => ({ id: e.id || null, name: e.getAttribute('name'), ph: e.getAttribute('placeholder') })).filter((x: any) => x.id || x.name || x.ph);
        const actions = Array.from(doc.querySelectorAll('a, button, span, .k-item')).map((e: any) => (e.textContent || '').trim()).filter((t: string) => /edit|actions|lien|holder|company/i.test(t)).slice(0, 20);
        return { url: (globalThis as any).location.href, hasHolder, inputCount: inputs.length, inputs: inputs.slice(0, 25), actions };
      }, HOLDER);
      report.push({ frameUrl: f.url(), ...hit });
    } catch (e) { report.push({ frameUrl: f.url(), error: String(e).slice(0, 80) }); }
  }
  dump('LP2_frames.json', JSON.stringify(report, null, 2));

  await closeBrowser().catch(() => {});
  process.exit(0);
}
main().catch((e) => { console.error('fatal', e); process.exit(1); });
