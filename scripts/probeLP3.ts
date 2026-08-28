/**
 * Abre el form de EDICIÓN de un LP holder existente (Probe LP Bank NA) y vuelca su
 * estructura (frame + campo Company Name + botón Save). NO guarda nada.
 * Uso: HEADLESS=true npx ts-node scripts/probeLP3.ts
 */
import * as fs from 'fs';
import * as path from 'path';
import { getNowCertsPage } from '../src/browser/nowcertsLogin';
import { closeBrowser } from '../src/browser/browserManager';
import { buildInsuredUrl } from '../src/actions/_base';

const INSURED_ID = '55c82b02-351c-490c-a22e-205482e085cd';
const VIN = '1FUJBBCK17LX0356';
const HOLDER = 'Probe LP Bank NA';
const OUT = path.resolve('./probe-out');
function dump(n: string, c: string) { if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true }); fs.writeFileSync(path.join(OUT, n), c); console.log(`[dump] ${n}`); }

async function main() {
  const page = await getNowCertsPage();
  await page.goto(buildInsuredUrl(INSURED_ID, 'Vehicles'), { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(5000);

  // Expandir Lien Holders de la fila
  const row = page.locator('[role="grid"] tbody tr').filter({ hasText: VIN }).first();
  await row.locator('.ncm-menu-grid-actions-button, li[aria-label="..."]').first().click({ force: true });
  await page.waitForTimeout(1500);
  await page.getByText(/^Lien Holders$/i).first().click({ force: true }).catch(() => {});
  await page.waitForTimeout(4000);

  // Fila del holder -> su botón Actions
  const holderRow = page.locator('tr').filter({ hasText: HOLDER }).first();
  console.log('holderRow count', await holderRow.count());
  await holderRow.locator('button, a, span').filter({ hasText: /Actions/i }).first().click({ force: true }).catch(() => {});
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(OUT, 'LP3_holder_actions.png'), fullPage: true }).catch(() => {});
  // Click Edit
  await page.getByText(/^Edit$/i).first().click({ force: true }).catch(() => {});
  await page.waitForTimeout(5000);
  await page.screenshot({ path: path.join(OUT, 'LP3_editform.png'), fullPage: true }).catch(() => {});
  console.log('url after Edit:', page.url());

  // Volcar todos los frames: ubicar Company Name y el botón Save
  const report: any[] = [];
  for (const f of page.frames()) {
    try {
      const hit = await f.evaluate(() => {
        const doc = (globalThis as any).document;
        const inputs = Array.from(doc.querySelectorAll('input, textarea')).map((e: any) => ({ id: e.id || null, name: e.getAttribute('name'), ph: e.getAttribute('placeholder'), val: (e.value || '').toString().slice(0, 25) })).filter((x: any) => (x.ph || (x.name && /company|name|address/i.test(x.name)) || (x.id && /company|name|address/i.test(x.id))));
        const buttons = Array.from(doc.querySelectorAll('button, input[type="submit"], a.btn')).map((e: any) => ({ text: (e.textContent || e.value || '').trim().slice(0, 25), id: e.id || null, cls: (e.className || '').slice(0, 40) })).filter((b: any) => /save|update|guardar/i.test(b.text + b.id));
        return { inputs: inputs.slice(0, 20), buttons: buttons.slice(0, 10) };
      });
      if (hit.inputs.length || hit.buttons.length) report.push({ frameUrl: f.url(), ...hit });
    } catch { /* ignore */ }
  }
  dump('LP3_editform_fields.json', JSON.stringify(report, null, 2));

  await closeBrowser().catch(() => {});
  process.exit(0);
}
main().catch((e) => { console.error('fatal', e); process.exit(1); });
