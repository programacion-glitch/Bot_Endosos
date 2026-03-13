import { Page } from 'playwright';
import { config } from '../config/config';
import { logger } from '../utils/logger';
import { newPage, screenshot } from './browserManager';
import { buildNowCertsUrl } from '../actions/_base';

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

  await page.goto(buildNowCertsUrl('/AMSINS/DashboardLight'), { waitUntil: 'domcontentloaded' });
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

  const exactResult = page.locator('a').filter({ hasText: new RegExp(`^${escapeRegex(clientName)}$`, 'i') }).first();
  const partialResult = page.locator('a').filter({ hasText: new RegExp(escapeRegex(clientName), 'i') }).first();
  const result = (await exactResult.count()) > 0 ? exactResult : partialResult;

  if (await result.count() === 0) {
    logger.warn(`Client not found in Global Search: "${clientName}"`);
    return false;
  }

  await result.click();
  await page.waitForURL('**/AMSINS/Insureds/Details/*/Information', { timeout: 20_000 }).catch(() => {});
  await page.waitForTimeout(1500);
  logger.info(`Navigated to client: "${clientName}" -> ${page.url()}`);
  return page.url().includes('/AMSINS/Insureds/Details/');
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Marks the session as logged out (e.g., after a session error).
 */
export function invalidateSession(): void {
  isLoggedIn = false;
  activePage = null;
}
