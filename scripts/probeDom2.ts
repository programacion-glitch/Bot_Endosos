/**
 * PROBE READ-ONLY v2 — vuelca el form de edición de vehículo (Angular, nuevo) y
 * la sección Lien Holders, para arreglar UPDATE/DELETE_VEHICLE_VALUE y UPDATE_LP_HOLDER.
 * NO guarda nada (nunca toca Save/Update).
 * Uso: HEADLESS=true npx ts-node scripts/probeDom2.ts
 */
import * as fs from 'fs';
import * as path from 'path';
import { getNowCertsPage } from '../src/browser/nowcertsLogin';
import { closeBrowser } from '../src/browser/browserManager';
import { buildInsuredUrl } from '../src/actions/_base';
import { logger } from '../src/utils/logger';

const INSURED_ID = '55c82b02-351c-490c-a22e-205482e085cd';
const OUT = path.resolve('./probe-out');

function dump(name: string, content: string): void {
  if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, name), content);
  console.log(`[dump] ${name} (${content.length} bytes)`);
}

async function openRowActions(page: any): Promise<void> {
  const firstRow = page.locator('[role="grid"] tbody tr.k-master-row, [role="grid"] tbody tr').first();
  // El botón Actions de la fila (kendo-menu ncm-menu-grid)
  const actionsBtn = firstRow.locator('.ncm-menu-grid-actions-button, li[aria-label="..."]').first();
  await actionsBtn.click({ force: true }).catch(() => {});
  await page.waitForTimeout(1500);
}

async function main(): Promise<void> {
  const page = await getNowCertsPage();

  // Ir a la grilla de vehículos y leer el href del "Edit" del menú Actions de la 1ra fila
  let editHref: string | null = null;
  try {
    await page.goto(buildInsuredUrl(INSURED_ID, 'Vehicles'), { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(5000);
    await openRowActions(page);
    editHref = await page.evaluate(() => {
      const doc = (globalThis as any).document;
      const a = Array.from(doc.querySelectorAll('a[href*="/Vehicles/Edit/"]'))[0] as any;
      return a ? a.getAttribute('href') : null;
    });
    // También volcar TODO el submenú de acciones de vehículo (para ubicar Lien Holders / ID Card)
    const submenu = await page.evaluate(() => {
      const doc = (globalThis as any).document;
      const items = Array.from(doc.querySelectorAll('.k-animation-container a, .k-animation-container .k-item, [role="menu"] a, [role="menuitem"]')) as any[];
      return items.map((el: any) => ({ text: (el.textContent || '').trim().slice(0, 40), href: el.getAttribute && el.getAttribute('href') })).filter((x: any) => x.text);
    });
    dump('C2_vehicle_actions_items.json', JSON.stringify(submenu, null, 2));
    console.log('editHref =', editHref);
  } catch (e) {
    dump('C2_actions_ERROR.txt', String((e as Error).stack || e));
  }

  // Navegar al form de edición del vehículo y volcar sus campos (buscar el de Value)
  try {
    if (editHref) {
      const abs = editHref.startsWith('http') ? editHref : new URL(editHref, page.url()).toString();
      await page.goto(abs, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(5000);
      const fields = await page.evaluate(() => {
        const doc = (globalThis as any).document;
        const els = Array.from(doc.querySelectorAll('input, select, textarea, ng-select, kendo-numerictextbox, kendo-textbox')) as any[];
        return els.map((el: any) => {
          // buscar un label asociado
          let label = '';
          if (el.id) {
            const l = doc.querySelector(`label[for="${el.id}"]`);
            if (l) label = (l.textContent || '').trim();
          }
          if (!label && el.closest) {
            const wrap = el.closest('.form-group, .field, [class*="col"]');
            if (wrap) {
              const l = wrap.querySelector('label');
              if (l) label = (l.textContent || '').trim();
            }
          }
          return {
            tag: el.tagName.toLowerCase(),
            type: el.getAttribute('type'),
            id: el.id || null,
            name: el.getAttribute('name'),
            placeholder: el.getAttribute('placeholder'),
            formcontrolname: el.getAttribute('formcontrolname'),
            label: label.slice(0, 40),
            value: (el.value || '').toString().slice(0, 30),
          };
        }).filter((f: any) => f.label || f.placeholder || f.formcontrolname || f.name);
      });
      dump('C2_vehicle_edit_fields.json', JSON.stringify({ url: page.url(), fields }, null, 2));
      // Además, un recorte del HTML alrededor de "Value"
      const valueHtml = await page.evaluate(() => {
        const doc = (globalThis as any).document;
        const all = Array.from(doc.querySelectorAll('label, span, div')) as any[];
        const lbl = all.find((e: any) => /^\s*Value\s*$/i.test(e.textContent || ''));
        const wrap = lbl && lbl.closest ? lbl.closest('.form-group, .row, [class*="col"]') : null;
        return wrap ? wrap.outerHTML.slice(0, 2500) : (lbl ? lbl.parentElement.outerHTML.slice(0, 2500) : 'NO Value label');
      });
      dump('C2_vehicle_edit_value_area.html', valueHtml);
    } else {
      dump('C2_no_editHref.txt', 'No se pudo leer el href de Edit del menú Actions');
    }
  } catch (e) {
    dump('C2_editform_ERROR.txt', String((e as Error).stack || e));
  }

  await closeBrowser().catch(() => {});
  logger.info('probeDom2: done');
  process.exit(0);
}

main().catch((e) => { console.error('probeDom2 fatal:', e); process.exit(1); });
