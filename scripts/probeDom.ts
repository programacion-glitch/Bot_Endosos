/**
 * PROBE READ-ONLY — vuelca el DOM nuevo (post-migración Momentum Ago-2026) para
 * arreglar los flujos rotos de vehículos (cluster C) y pólizas/LOB (cluster D).
 * NO guarda nada en NowCerts (nunca toca Save/Update).
 *
 * Uso (en el host):  HEADLESS=true npx ts-node scripts/probeDom.ts
 * Salida: ./probe-out/*.txt|json|html
 */
import * as fs from 'fs';
import * as path from 'path';
import { getNowCertsPage } from '../src/browser/nowcertsLogin';
import { closeBrowser } from '../src/browser/browserManager';
import { buildInsuredUrl, getInsuredUrl } from '../src/actions/_base';
import { logger } from '../src/utils/logger';

const INSURED_ID = '55c82b02-351c-490c-a22e-205482e085cd'; // Pix Test 2 2026 - 2027
const OUT = path.resolve('./probe-out');

// Constantes del form de póliza (copiadas de addPolicy.ts)
const POLICY_ADD_NEW = 'a[href*="Policies/Insert.aspx"][href*="TruckingCompanyId"]';
const LOB_INPUT = '#ctl00_ContentPlaceHolder1_FormView1_ctl01_ctl23___LinesOfBusinessAndFees_rptLinesOfBusiness_ctl00_usrLineOfBusiness_ddlLineOfBusinesses_Input';

function dump(name: string, content: string): void {
  if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });
  const p = path.join(OUT, name);
  fs.writeFileSync(p, content);
  console.log(`[dump] ${name} (${content.length} bytes)`);
}

async function main(): Promise<void> {
  const page = await getNowCertsPage();

  // ===================== CLUSTER C: grilla de vehículos =====================
  try {
    await page.goto(buildInsuredUrl(INSURED_ID, 'Vehicles'), { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(5000);

    const info = await page.evaluate(() => {
      const doc = (globalThis as any).document;
      const grid = doc.querySelector('[role="grid"]') || doc.querySelector('table');
      const rows = Array.from(doc.querySelectorAll('[role="grid"] tbody tr, table tbody tr')) as any[];
      const firstRow = rows[0];
      // Links y botones de la primera fila (pencil / actions)
      const rowLinks = firstRow
        ? (Array.from(firstRow.querySelectorAll('a')) as any[]).map((a: any) => ({ text: (a.textContent || '').trim().slice(0, 30), href: a.getAttribute('href'), cls: a.className }))
        : [];
      const rowButtons = firstRow
        ? (Array.from(firstRow.querySelectorAll('button, [role="button"], i, span[class*="icon"], span[class*="mdi"]')) as any[]).map((b: any) => ({ text: (b.textContent || '').trim().slice(0, 20), title: b.getAttribute('title'), cls: b.className })).slice(0, 25)
        : [];
      return JSON.stringify({
        rowCount: rows.length,
        gridOuter: grid ? grid.outerHTML.slice(0, 2500) : 'NO GRID',
        firstRowOuter: firstRow ? firstRow.outerHTML.slice(0, 4000) : 'NO ROW',
        rowLinks,
        rowButtons,
      }, null, 2);
    });
    dump('C_vehicles_grid.json', info);

    // Intentar abrir el menú/acciones de la primera fila (read-only) y volcar popups
    const firstRow = page.locator('[role="grid"] tbody tr, table tbody tr').first();
    const actionsCtl = firstRow.locator('button, a, span, i').filter({ hasText: /Actions/i }).first();
    if (await actionsCtl.count() > 0) {
      await actionsCtl.click({ force: true }).catch(() => {});
      await page.waitForTimeout(1500);
    } else {
      // Sin "Actions" textual: probar el último botón/ícono de la fila (kebab)
      const kebab = firstRow.locator('button, [role="button"], i, span[class*="mdi"]').last();
      await kebab.click({ force: true }).catch(() => {});
      await page.waitForTimeout(1500);
    }
    const menus = await page.evaluate(() => {
      const doc = (globalThis as any).document;
      const sels = ['.k-animation-container', '.k-menu-popup', '[role="menu"]', 'ul.dropdown-menu', '.mat-menu-panel', '.cdk-overlay-container'];
      const found: string[] = [];
      for (const s of sels) {
        for (const el of Array.from(doc.querySelectorAll(s)) as any[]) {
          if ((el.textContent || '').trim()) found.push(`<!-- ${s} -->\n` + el.outerHTML.slice(0, 3000));
        }
      }
      return found.join('\n\n=====\n\n') || 'NO MENU POPUPS FOUND';
    });
    dump('C_vehicles_actions_menu.html', menus);
  } catch (e) {
    dump('C_vehicles_ERROR.txt', String((e as Error).stack || e));
  }

  // ===================== CLUSTER D: dropdown Lines of Business =====================
  try {
    await page.goto(getInsuredUrl(page, 'Policies'), { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);
    const addNew = page.locator(POLICY_ADD_NEW).first();
    await addNew.waitFor({ state: 'visible', timeout: 20_000 });
    const href = await addNew.getAttribute('href');
    if (href) {
      const abs = href.startsWith('http') ? href : new URL(href, page.url()).toString();
      await page.goto(abs, { waitUntil: 'domcontentloaded' });
    } else {
      await addNew.click({ force: true });
    }
    await page.waitForURL('**/Policies/Insert.aspx**', { timeout: 20_000 }).catch(() => {});
    await page.waitForTimeout(4000);

    // Abrir el dropdown LOB SIN filtrar para ver todas las opciones disponibles
    const lob = page.locator(LOB_INPUT).first();
    const lobExists = await lob.count();
    if (lobExists > 0) {
      await lob.click({ force: true }).catch(() => {});
      await page.waitForTimeout(1200);
      const allOpts = await page.evaluate((sel: string) => {
        const doc = (globalThis as any).document;
        const dd = doc.querySelector(sel.replace('_Input', '_DropDown'));
        return dd ? dd.outerHTML.slice(0, 6000) : 'NO DROPDOWN CONTAINER';
      }, LOB_INPUT);
      dump('D_lob_all_options.html', allOpts);

      // Ahora filtrar por "Commercial" y ver qué muestra
      await lob.fill('Commercial').catch(() => {});
      await page.waitForTimeout(1500);
      const filtered = await page.evaluate((sel: string) => {
        const doc = (globalThis as any).document;
        const dd = doc.querySelector(sel.replace('_Input', '_DropDown'));
        return dd ? dd.outerHTML.slice(0, 6000) : 'NO DROPDOWN CONTAINER';
      }, LOB_INPUT);
      dump('D_lob_filtered_commercial.html', filtered);
    } else {
      // El input no existe con ese id → volcar la sección LOB entera para ver el id nuevo
      const section = await page.evaluate(() => {
        const doc = (globalThis as any).document;
        const sec = doc.querySelector('[id*="LinesOfBusiness"]');
        return sec ? sec.outerHTML.slice(0, 6000) : 'NO LinesOfBusiness section';
      });
      dump('D_lob_section_new.html', section);
    }
  } catch (e) {
    dump('D_policy_ERROR.txt', String((e as Error).stack || e));
  }

  await closeBrowser().catch(() => {});
  logger.info('probeDom: done');
  process.exit(0);
}

main().catch((e) => { console.error('probeDom fatal:', e); process.exit(1); });
