/**
 * PROBE READ-ONLY — flujo Lien Holders (UPDATE_LP_HOLDER) sobre un vehículo permanente.
 * Abre Vehicles -> fila FREIGHTLINER -> Actions -> Lien Holders y vuelca lo que aparece.
 * Si hay un holder con Edit, vuelca el form de edición (campo Company Name). NO guarda nada.
 * Uso: HEADLESS=true npx ts-node scripts/probeLP.ts
 */
import * as fs from 'fs';
import * as path from 'path';
import { getNowCertsPage } from '../src/browser/nowcertsLogin';
import { closeBrowser } from '../src/browser/browserManager';
import { buildInsuredUrl } from '../src/actions/_base';

const INSURED_ID = '55c82b02-351c-490c-a22e-205482e085cd';
const VIN = '1FUJBBCK17LX0356'; // FREIGHTLINER permanente
const OUT = path.resolve('./probe-out');
function dump(n: string, c: string) { if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true }); fs.writeFileSync(path.join(OUT, n), c); console.log(`[dump] ${n} (${c.length}b)`); }

async function main() {
  const page = await getNowCertsPage();
  await page.goto(buildInsuredUrl(INSURED_ID, 'Vehicles'), { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(5000);

  const row = page.locator('[role="grid"] tbody tr, table tbody tr').filter({ hasText: VIN }).first();
  const rowExists = await row.count();
  console.log('rowExists', rowExists);
  if (rowExists === 0) { dump('LP_no_row.txt', `VIN ${VIN} no está en la grilla`); await closeBrowser(); process.exit(0); }

  // Abrir Actions y clickear "Lien Holders"
  await row.locator('.ncm-menu-grid-actions-button, li[aria-label="..."]').first().click({ force: true }).catch(() => {});
  await page.waitForTimeout(1500);
  const beforeUrl = page.url();
  await page.locator('a, .k-item, [role="menuitem"], span').filter({ hasText: /Lien\s*Holders/i }).first().click({ force: true }).catch(() => {});
  await page.waitForTimeout(4000);
  const afterUrl = page.url();
  console.log('urls', beforeUrl, '->', afterUrl);

  // Volcar lo que apareció: URL, grids/tablas/paneles y sus filas
  const panel = await page.evaluate(() => {
    const doc = (globalThis as any).document;
    const grids = Array.from(doc.querySelectorAll('[role="grid"], table, .rwWindowContent, .k-window, .modal-content, iframe')) as any[];
    const out = grids.map((g: any) => {
      if (g.tagName.toLowerCase() === 'iframe') return `IFRAME name=${g.getAttribute('name')} src=${g.getAttribute('src')}`;
      return `<!-- ${g.tagName} class=${g.className} -->\n` + g.outerHTML.slice(0, 2500);
    });
    return { url: (globalThis as any).location.href, count: grids.length, out: out.join('\n\n=====\n\n').slice(0, 9000) };
  });
  dump('LP_panel.json', JSON.stringify({ url: panel.url, count: panel.count }, null, 2));
  dump('LP_panel.html', panel.out);

  // ¿Hay filas de holders con menú Actions? Intentar abrir Edit del primero y volcar el form
  try {
    const holderRow = page.locator('[role="grid"] tbody tr, .rwWindowContent tbody tr, iframe').first();
    // Buscar dentro de posibles iframes también
    const frames = page.frames();
    let fieldsDump = 'NO EDIT FORM';
    for (const f of frames) {
      const compName = await f.locator('input[placeholder="Company Name"], input[name="CompanyName"], input[id*="CompanyName"], input[id*="Name"]').count().catch(() => 0);
      if (compName > 0) {
        fieldsDump = await f.evaluate(() => {
          const doc = (globalThis as any).document;
          const els = Array.from(doc.querySelectorAll('input, textarea, select, button')) as any[];
          return JSON.stringify(els.map((e: any) => ({ tag: e.tagName.toLowerCase(), type: e.getAttribute('type'), id: e.id || null, name: e.getAttribute('name'), placeholder: e.getAttribute('placeholder'), text: (e.textContent || '').trim().slice(0, 25), val: (e.value || '').toString().slice(0, 25) })).filter((x: any) => x.id || x.name || x.placeholder || x.text), null, 2);
        });
        break;
      }
    }
    dump('LP_editform_fields.json', String(fieldsDump));
  } catch (e) { dump('LP_editform_ERROR.txt', String(e)); }

  await closeBrowser().catch(() => {});
  process.exit(0);
}
main().catch((e) => { console.error('fatal', e); process.exit(1); });
