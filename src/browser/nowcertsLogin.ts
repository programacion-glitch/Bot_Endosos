import { Page } from 'playwright';
import { config } from '../config/config';
import { logger } from '../utils/logger';
import { newPage, screenshot } from './browserManager';
import { buildNowCertsUrl, escapeRegex } from '../actions/_base';

let activePage: Page | null = null;
let isLoggedIn = false;

/**
 * Returns a page that is authenticated in NowCerts.
 * Reuses the existing page/session if still valid.
 * If the page/browser is closed or unusable, automatically recreates it from scratch.
 */
export async function getNowCertsPage(): Promise<Page> {
  // Check if existing page is still usable
  if (activePage && isLoggedIn) {
    const stillAlive = await isPageAlive(activePage);
    if (stillAlive) {
      try {
        const url = activePage.url();
        if (!url.includes('Login') && url.includes('nowcerts.com')) {
          return activePage;
        }
      } catch {
        // URL access failed — page is dead
      }
    }
    logger.warn('Existing NowCerts page is not usable, recreating...');
    activePage = null;
    isLoggedIn = false;
  }

  // Create a fresh page and login. Retry once if it fails (browser may be dead too).
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      activePage = await newPage();
      await login(activePage);
      return activePage;
    } catch (err) {
      logger.warn(`getNowCertsPage: attempt ${attempt}/2 failed: ${(err as Error).message}`);
      // Kill the browser completely and try again fresh
      activePage = null;
      isLoggedIn = false;
      try {
        const { closeBrowser } = await import('./browserManager');
        await closeBrowser();
      } catch {
        // ignore
      }
      if (attempt === 2) throw err;
    }
  }

  throw new Error('getNowCertsPage: unreachable');
}

/** Returns true if the Playwright page is still connected and usable. */
async function isPageAlive(page: Page): Promise<boolean> {
  try {
    if (page.isClosed()) return false;
    const ctx = page.context();
    if (!ctx.browser() || !ctx.browser()?.isConnected()) return false;
    return true;
  } catch {
    return false;
  }
}

async function login(page: Page): Promise<void> {
  logger.info(`Navigating to NowCerts login: ${config.nowcerts.loginUrl}`);
  await page.goto(config.nowcerts.loginUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 });

  // If already logged in (redirected away from login page), skip
  if (!page.url().includes('Login')) {
    logger.info('Already logged in to NowCerts.');
    isLoggedIn = true;
    return;
  }

  logger.info('Logging in to NowCerts...');

  // Confirmed selectors from page inspection
  await page.fill('#Username', config.nowcerts.user);
  await page.fill('#Password', config.nowcerts.password);
  await page.click('button[value="login"]');

  // Wait for redirect to dashboard
  await page.waitForURL('**/AMSINS/**', { timeout: 30_000 }).catch(() => {});
  await page.waitForTimeout(2000);

  if (page.url().includes('Login')) {
    await screenshot(page, 'login_failed');
    throw new Error('NowCerts login failed - still on login page after submit');
  }

  isLoggedIn = true;
  logger.info(`Successfully logged in. Dashboard: ${page.url()}`);
}

/**
 * Searches for a client in NowCerts by name or USDOT.
 * Returns true if the client was found and the page is now on the client profile.
 */
export async function navigateToClient(
  page: Page,
  clientName: string,
  usdot?: string
): Promise<boolean> {
  logger.info(`Searching for client: "${clientName}" ${usdot ? `(USDOT: ${usdot})` : ''}`);

  // Confirmed live flow:
  // 1) use sidebar search input #navigationSearchTermInput
  // 2) click the sidebar magnify icon span.mdi.mdi-magnify[title="Search"]
  // 3) GlobalSearch/List opens with results
  // 4) click the insured result link to land on /AMSINS/Insureds/Details/{id}/Information
  // The search works reliably with DBA / name text.

  // Navigate to dashboard and wait for sidebar search to render
  await page.goto(buildNowCertsUrl('/AMSINS/DashboardLight'), { waitUntil: 'domcontentloaded', timeout: 120_000 });
  // Wait for the sidebar search input to appear (Angular renders it async)
  try {
    await page.waitForSelector('#navigationSearchTermInput', { state: 'visible', timeout: 60_000 });
  } catch {
    logger.warn('Sidebar search input not visible after 60s, retrying with page reload...');
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 120_000 });
    await page.waitForSelector('#navigationSearchTermInput', { state: 'visible', timeout: 60_000 }).catch(() => {});
  }
  await page.waitForTimeout(1000);

  const searchTerm = usdot?.trim() || clientName.trim();
  const searchInput = page.locator('#navigationSearchTermInput').first();
  const searchIcon = page.locator(
    'span.mdi.mdi-magnify[title="Search"], .ncm-navigation-board-search-icon span[title="Search"]'
  ).first();

  if (await searchInput.count() === 0) {
    logger.warn('navigateToClient: sidebar search input not found');
    return false;
  }

  await searchInput.click({ force: true });
  await searchInput.fill(searchTerm);
  await page.waitForTimeout(300);

  if (await searchIcon.count() === 0) {
    logger.warn('navigateToClient: sidebar magnify icon not found');
    return false;
  }

  await searchIcon.click({ force: true });
  await page.waitForURL('**/GlobalSearch/List?name=*', { timeout: 15_000 }).catch(() => {});
  await page.waitForTimeout(1500);

  // Set "Active" filter to "Yes" and click Search to re-filter
  try {
    const activeSelect = page.locator('predefined-gcb-selector ng-select.ng-select-single').first();
    if (await activeSelect.count() > 0) {
      await activeSelect.click({ force: true });
      await page.waitForTimeout(500);
      const yesOption = page.locator('ng-dropdown-panel .ng-option').filter({ hasText: /^Yes$/i }).first();
      if (await yesOption.count() > 0) {
        await yesOption.click({ force: true });
        await page.waitForTimeout(500);
        logger.info('Active filter set to "Yes"');
        // Click Search button using role selector for reliability
        const searchBtn = page.getByRole('button', { name: 'Search' });
        if (await searchBtn.count() > 0) {
          await searchBtn.click({ force: true });
          logger.info('Search button clicked, waiting for filtered results...');
          await page.waitForURL(/active=true/, { timeout: 15_000 }).catch(() => {});
          await page.waitForTimeout(2500);
        }
      }
    }
  } catch (err) {
    logger.warn(`Could not set Active filter: ${(err as Error).message}`);
  }

  // Scan ALL insured links and pick the one with the most recent year in the name.
  //
  // Edge case: NowCerts puede tener un cliente con sufijo "Only" para gestión interna
  // (ej: "Cliente X 2026 - 2027" y "Cliente X Only 2026 - 2027"). Reglas:
  //   - Si el correo (clientName) trae "Only" → preferir el insured con "Only".
  //   - Si NO trae "Only" → preferir el que NO tiene "Only".
  // Dentro del grupo elegido, seguimos eligiendo el del año más reciente.
  const wantsOnly = /\bonly\b/i.test(clientName);
  const isOnly = (text: string) => /\bonly\b/i.test(text);

  const allInsuredLinks = page.locator('a[href*="/AMSINS/Insureds/Details/"]');
  const linkCount = await allInsuredLinks.count();

  type Candidate = { idx: number; text: string; maxYear: number; hasOnly: boolean };
  const candidates: Candidate[] = [];

  for (let i = 0; i < linkCount; i++) {
    const link = allInsuredLinks.nth(i);
    const linkText = (await link.textContent() ?? '').trim();
    logger.info(`Search result [${i}]: "${linkText}"`);
    const years = linkText.match(/\d{4}/g)?.map(Number) ?? [];
    const maxYear = years.length > 0 ? Math.max(...years) : 0;
    candidates.push({ idx: i, text: linkText, maxYear, hasOnly: isOnly(linkText) });
  }

  // Filtrar por preferencia Only / no-Only
  const preferred = candidates.filter(c => c.hasOnly === wantsOnly);
  const pool = preferred.length > 0 ? preferred : candidates;
  if (preferred.length === 0 && candidates.length > 0) {
    logger.warn(`No candidate matches Only=${wantsOnly} preference, falling back to all candidates`);
  }

  // Dentro del pool, elegir el de mayor año
  let bestYear = -1;
  let bestCandidate: Candidate | null = null;
  for (const c of pool) {
    if (c.maxYear > bestYear) {
      bestCandidate = c;
      bestYear = c.maxYear;
    }
  }

  let result = bestCandidate ? allInsuredLinks.nth(bestCandidate.idx) : null;

  // If no years found in any name, fallback to last link in pool
  if (!result && pool.length > 0) {
    result = allInsuredLinks.nth(pool[pool.length - 1].idx);
    logger.info('No year found in results, using last link in pool');
  }

  if (result && bestCandidate) {
    logger.info(`Selected: "${bestCandidate.text}" (year: ${bestYear}, hasOnly: ${bestCandidate.hasOnly}, wantsOnly: ${wantsOnly})`);
  }

  if (!result || (await result.count()) === 0) {
    logger.warn(`Client not found in Global Search: "${clientName}"`);
    return false;
  }

  // Get the href and navigate directly to avoid opening in a new window/tab
  const href = await result.getAttribute('href');
  if (href) {
    const fullUrl = href.startsWith('http') ? href : `${new URL(page.url()).origin}${href}`;
    await page.goto(fullUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  } else {
    // Remove target="_blank" to prevent new tab, then click
    await result.evaluate((el: any) => el.removeAttribute('target'));
    await result.click();
  }
  await page.waitForURL('**/AMSINS/Insureds/Details/*/Information', { timeout: 20_000 }).catch(() => {});
  await page.waitForTimeout(1500);
  logger.info(`Navigated to client: "${clientName}" -> ${page.url()}`);
  return page.url().includes('/AMSINS/Insureds/Details/');
}

/**
 * Marks the session as logged out (e.g., after a session error).
 */
export function invalidateSession(): void {
  isLoggedIn = false;
  activePage = null;
}
