import { Browser, BrowserContext, Page, chromium } from 'playwright';
import { config } from '../config/config';
import { logger } from '../utils/logger';
import path from 'path';
import fs from 'fs';

let context: BrowserContext | null = null;

/**
 * Returns a `Browser` for compatibility with code that expects one.
 * En realidad usamos un persistent context (no hay objeto Browser separado),
 * por eso devolvemos el browser asociado al context.
 */
export async function getBrowser(): Promise<Browser> {
  const ctx = await getContext();
  // En persistent context, ctx.browser() puede ser null en versiones viejas
  // pero en Playwright moderno devuelve el Browser asociado.
  const b = ctx.browser();
  if (!b) {
    throw new Error('Persistent context did not expose a Browser');
  }
  return b;
}

/**
 * Returns the persistent browser context. Usamos `launchPersistentContext` (en
 * vez de `launch + newContext`) porque NowCerts depende de PDF.js que falla
 * cuando el contexto es ephemeral en headless o headed local — el PDF se queda
 * atorado en "Rendering 98%". Con persistent context (igual que MCP Playwright
 * lo hace internamente) el render funciona normalmente.
 *
 * El user data dir se mantiene entre runs en /app/data/playwright-profile (o
 * ./data/playwright-profile localmente), preservando caché de scripts.
 */
export async function getContext(): Promise<BrowserContext> {
  // Detect if the existing context was closed externally
  if (context) {
    try {
      context.pages(); // lightweight check — throws if context is closed
    } catch {
      logger.warn('Browser context was closed unexpectedly — recreating.');
      context = null;
    }
  }

  if (!context) {
    const downloadsPath = config.files.downloadsPath;
    if (!fs.existsSync(downloadsPath)) fs.mkdirSync(downloadsPath, { recursive: true });

    const userDataDir = path.resolve('./data/playwright-profile');
    if (!fs.existsSync(userDataDir)) fs.mkdirSync(userDataDir, { recursive: true });

    logger.info(`Launching persistent browser context at ${userDataDir}...`);
    context = await chromium.launchPersistentContext(userDataDir, {
      headless: config.playwright.headless,
      slowMo: config.playwright.slowMo,
      acceptDownloads: true,
      viewport: { width: 1440, height: 900 },
    });

    // Polyfills para APIs de JS muy nuevas (Chrome 137+) que PDF.js de NowCerts
    // usa internamente. Si el Chromium bundled de Playwright es más viejo, PDF.js
    // lanza errores ("Math.sumPrecise is not a function", "Promise.try missing")
    // y se queda atorado en "Rendering 98%".
    //
    // El polyfill como string para poder reusarlo en main page (addInitScript)
    // y en Workers (interceptando el script del worker via route).
    const POLYFILLS_SOURCE = `
      (function() {
        if (typeof Math.sumPrecise !== 'function') {
          Math.sumPrecise = function(values) {
            var sum = 0, c = 0;
            for (var v of values) {
              if (typeof v !== 'number') throw new TypeError('Math.sumPrecise: argument must be iterable of numbers');
              var t = sum + v;
              if (Math.abs(sum) >= Math.abs(v)) c += (sum - t) + v;
              else c += (v - t) + sum;
              sum = t;
            }
            return sum + c;
          };
        }
        if (typeof Promise.try !== 'function') {
          Promise.try = function(fn) {
            var args = Array.prototype.slice.call(arguments, 1);
            return new Promise(function(resolve) { resolve(fn.apply(null, args)); });
          };
        }
      })();
    `;

    // Inyectar en cada page (main context)
    await context.addInitScript(POLYFILLS_SOURCE);

    // Interceptar los workers de PDF.js para inyectar polyfills en su contexto
    // aislado. Sin esto, el worker (pdf.worker.min*.mjs) no tiene Math.sumPrecise.
    await context.route('**/pdf.worker*.{js,mjs}', async (route) => {
      try {
        const response = await route.fetch();
        const original = await response.text();
        await route.fulfill({
          response,
          body: POLYFILLS_SOURCE + '\n' + original,
        });
      } catch (err) {
        logger.warn(`PDF worker polyfill injection failed: ${(err as Error).message}`);
        await route.continue();
      }
    });

    // También interceptar el bundle vendor-pdfjs por si carga workers nested o
    // tiene su propio contexto que necesite los polyfills.
    await context.route('**/vendor-pdfjs*.{js,mjs}', async (route) => {
      try {
        const response = await route.fetch();
        const original = await response.text();
        await route.fulfill({
          response,
          body: POLYFILLS_SOURCE + '\n' + original,
        });
      } catch (err) {
        logger.warn(`vendor-pdfjs polyfill injection failed: ${(err as Error).message}`);
        await route.continue();
      }
    });

    logger.info('Persistent browser context launched (with Math.sumPrecise + Promise.try polyfills in page + workers).');
  }
  return context;
}

/**
 * Opens a new page in the shared context.
 */
export async function newPage(): Promise<Page> {
  const ctx = await getContext();
  const page = await ctx.newPage();
  // Default timeout for all actions
  page.setDefaultTimeout(60_000);
  page.setDefaultNavigationTimeout(90_000);
  return page;
}

/**
 * Takes a screenshot and saves it to logs/screenshots/.
 */
export async function screenshot(page: Page, label: string): Promise<string> {
  const dir = path.join(config.files.logsPath, 'screenshots');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const filename = `${new Date().toISOString().replace(/[:.]/g, '-')}_${label}.png`;
  const filepath = path.join(dir, filename);
  await page.screenshot({ path: filepath, fullPage: true });
  logger.info(`Screenshot saved: ${filepath}`);
  return filepath;
}

/**
 * Closes all browser resources. Con persistent context, cerrar el context
 * cierra también el browser asociado.
 */
export async function closeBrowser(): Promise<void> {
  if (context) {
    await context.close().catch(() => {});
    context = null;
    logger.info('Persistent browser context closed.');
  }
}
