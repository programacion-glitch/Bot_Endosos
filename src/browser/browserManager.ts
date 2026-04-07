import { Browser, BrowserContext, Page, chromium } from 'playwright';
import { config } from '../config/config';
import { logger } from '../utils/logger';
import path from 'path';
import fs from 'fs';

let browser: Browser | null = null;
let context: BrowserContext | null = null;

/**
 * Returns a singleton browser instance.
 */
export async function getBrowser(): Promise<Browser> {
  if (!browser || !browser.isConnected()) {
    logger.info('Launching browser...');
    browser = await chromium.launch({
      headless: config.playwright.headless,
      slowMo: config.playwright.slowMo,
    });
    logger.info('Browser launched.');
  }
  return browser;
}

/**
 * Returns the persistent browser context (one session = one login).
 * Recreates the context if it was closed unexpectedly.
 */
export async function getContext(): Promise<BrowserContext> {
  // Detect if the existing context was closed externally
  if (context) {
    try {
      // A closed context will throw when we try to use it
      context.pages(); // lightweight check — throws if context is closed
    } catch {
      logger.warn('Browser context was closed unexpectedly — recreating.');
      context = null;
    }
  }

  if (!context) {
    const b = await getBrowser();
    const downloadsPath = config.files.downloadsPath;
    if (!fs.existsSync(downloadsPath)) fs.mkdirSync(downloadsPath, { recursive: true });

    context = await b.newContext({
      acceptDownloads: true,
      viewport: { width: 1440, height: 900 },
    });
    logger.info('Browser context created.');
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
 * Closes all browser resources.
 */
export async function closeBrowser(): Promise<void> {
  if (context) {
    await context.close();
    context = null;
  }
  if (browser) {
    await browser.close();
    browser = null;
    logger.info('Browser closed.');
  }
}
