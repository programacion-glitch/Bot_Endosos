/**
 * Clickea el "Edit" CORRECTO del menú Actions del LP holder (acotado al dropdown que
 * contiene "Send Certificate"/"Remove") y vuelca el form de edición. NO guarda nada.
 * Uso: HEADLESS=true npx ts-node scripts/probeLP4.ts
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

  const row = page.locator('[role="grid"] tbody tr').filter({ hasText: VIN }).first();
  await row.locator('.ncm-menu-grid-actions-button, li[aria-label="..."]').first().click({ force: true });
  await page.waitForTimeout(1500);
  await page.getByText(/^Lien Holders$/i).first().click({ force: true }).catch(() => {});
  await page.waitForTimeout(4000);

  const holderRow = page.locator('tr').filter({ hasText: HOLDER }).first();
  await holderRow.locator('button, a, span').filter({ hasText: /Actions/i }).first().click({ force: true });
  await page.waitForTimeout(1200);

  // Volcar el menú visible (para conocer el contenedor del Edit del holder)
  const menuHtml = await page.evaluate(() => {
    const doc = (globalThis as any).document;
    const cands = Array.from(doc.querySelectorAll('.dropdown-menu, [role="menu"], .k-animation-container, ul')) as any[];
    const menu = cands.find((m: any) => /Send Certificate/i.test(m.textContent || '') && /Remove/i.test(m.textContent || ''));
    return menu ? menu.outerHTML.slice(0, 2500) : 'NO MENU';
  });
  dump('LP4_holder_menu.html', menuHtml);

  // Click Edit acotado al menú del holder
  const menu = page.locator('.dropdown-menu, [role="menu"], .k-animation-container, ul')
    .filter({ hasText: 'Send Certificate' }).filter({ hasText: 'Remove' }).last();
  await menu.getByText(/^Edit$/i).first().click({ force: true }).catch(async () => {
    await menu.locator('a, button, span, li').filter({ hasText: /^Edit$/i }).first().click({ force: true }).catch(() => {});
  });
  await page.waitForTimeout(6000);
  await page.screenshot({ path: path.join(OUT, 'LP4_editform.png'), fullPage: true }).catch(() => {});
  console.log('url after Edit:', page.url());

  const report: any[] = [];
  for (const f of page.frames()) {
    try {
      const hit = await f.evaluate(() => {
        const doc = (globalThis as any).document;
        const inputs = Array.from(doc.querySelectorAll('input, textarea')).map((e: any) => ({ id: e.id || null, name: e.getAttribute('name'), ph: e.getAttribute('placeholder'), val: (e.value || '').toString().slice(0, 25) })).filter((x: any) => x.ph && !/search/i.test(x.ph));
        const saveBtns = Array.from(doc.querySelectorAll('button, input[type="submit"]')).map((e: any) => ({ text: (e.textContent || e.value || '').trim().slice(0, 25), cls: (e.className || '').slice(0, 40) })).filter((b: any) => /save|update/i.test(b.text));
        return { inputs: inputs.slice(0, 25), saveBtns };
      });
      if (hit.inputs.length || hit.saveBtns.length) report.push({ frameUrl: f.url(), ...hit });
    } catch { /* ignore */ }
  }
  dump('LP4_editform_fields.json', JSON.stringify(report, null, 2));

  await closeBrowser().catch(() => {});
  process.exit(0);
}
main().catch((e) => { console.error('fatal', e); process.exit(1); });
