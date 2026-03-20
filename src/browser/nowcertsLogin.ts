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
 */
export async function getNowCertsPage(): Promise<Page> {
  if (activePage && isLoggedIn) {
    // Verify the session is still alive
    try {
      await activePage.waitForLoadState('domcontentloaded', { timeout: 5000 });
      const url = activePage.url();
      if (!url.includes('Login') && url.includes('nowcerts.com')) {
        return activePage;
      }
    } catch {
      logger.warn('Existing page seems stale, re-logging in...');
    }
  }

  activePage = await newPage();
  await login(activePage);
  return activePage;
}

async function login(page: Page): Promise<void> {
  logger.info(`Navigating to NowCerts login: ${config.nowcerts.loginUrl}`);
  await page.goto(config.nowcerts.loginUrl, { waitUntil: 'domcontentloaded' });

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

  await page.goto(buildNowCertsUrl('/AMSINS/DashboardLight'), { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.waitForTimeout(2000);

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

  // Prefer the result row that contains the "Active" badge
  const allInsuredLinks = page.locator('a[href*="/AMSINS/Insureds/Details/"]');
  const linkCount = await allInsuredLinks.count();
  let result = null;

  // First pass: find a link whose parent result row has "Active" status
  for (let i = 0; i < linkCount; i++) {
    const link = allInsuredLinks.nth(i);
    const row = link.locator('..').locator('..');
    const activeBadge = row.locator('text="Active"');
    if (await activeBadge.count() > 0) {
      const linkText = await link.textContent() ?? '';
      logger.info(`Found active result: "${linkText.trim()}"`);
      result = link;
      break;
    }
  }

  // Fallback: match by name or first insured link
  if (!result) {
    const exactResult = page.locator('a').filter({ hasText: new RegExp(`^${escapeRegex(clientName)}$`, 'i') }).first();
    const partialResult = page.locator('a').filter({ hasText: new RegExp(escapeRegex(clientName), 'i') }).first();
    const firstInsuredLink = allInsuredLinks.first();

    result = (await exactResult.count()) > 0
      ? exactResult
      : (await partialResult.count()) > 0
        ? partialResult
        : null;

    if (!result && usdot && (await firstInsuredLink.count()) > 0) {
      logger.info('Exact/partial name not found, using first insured result from USDOT search');
      result = firstInsuredLink;
    }
  }

  if (!result || (await result.count()) === 0) {
    logger.warn(`Client not found in Global Search: "${clientName}"`);
    return false;
  }

  await result.click();
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
