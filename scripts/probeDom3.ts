/**
 * PROBE READ-ONLY v3 — botones del form de edición de vehículo (Angular) para
 * saber cuál es el Save. NO guarda nada.
 * Uso: HEADLESS=true npx ts-node scripts/probeDom3.ts
 */
import * as fs from 'fs';
import * as path from 'path';
import { getNowCertsPage } from '../src/browser/nowcertsLogin';
import { closeBrowser } from '../src/browser/browserManager';
import { buildNowCertsUrl } from '../src/actions/_base';

const EDIT_PATH = '/AMSINS/Vehicles/Edit/6c62f65b-0cef-4db1-939f-158d2841e6e4?parentId=55c82b02-351c-490c-a22e-205482e085cd&parentType=0&MomentumUrl=/Insureds/Details/55c82b02-351c-490c-a22e-205482e085cd/Vehicles';
const OUT = path.resolve('./probe-out');
function dump(n: string, c: string) { if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true }); fs.writeFileSync(path.join(OUT, n), c); console.log(`[dump] ${n} (${c.length}b)`); }

async function main() {
  const page = await getNowCertsPage();
  await page.goto(buildNowCertsUrl(EDIT_PATH), { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(6000);
  const info = await page.evaluate(() => {
    const doc = (globalThis as any).document;
    const buttons = (Array.from(doc.querySelectorAll('button, a.ant-btn, input[type="submit"]')) as any[])
      .map((b: any) => ({ text: (b.textContent || '').trim().slice(0, 30), cls: b.className, id: b.id || null }))
      .filter((b: any) => b.text);
    const valueInputs = doc.querySelectorAll('input[placeholder="Value"]').length;
    const vinInputs = doc.querySelectorAll('input[placeholder="VIN Number"]').length;
    return JSON.stringify({ url: (globalThis as any).location.href, valueInputs, vinInputs, buttons }, null, 2);
  });
  dump('C3_edit_buttons.json', info);
  await closeBrowser().catch(() => {});
  process.exit(0);
}
main().catch((e) => { console.error('fatal', e); process.exit(1); });
