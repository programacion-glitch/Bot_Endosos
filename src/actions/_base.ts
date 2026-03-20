/**
 * Shared helpers used across action modules.
 * Actual selectors will be filled in during implementation
 * once real NowCerts page inspection is done.
 */
import { Page } from 'playwright';
import { ActionResult, CommandType } from '../types';
import { logger } from '../utils/logger';
import { config } from '../config/config';
import path from 'path';
import fs from 'fs';

export function getNowCertsBaseUrl(): string {
  return config.nowcerts.url.endsWith('/') ? config.nowcerts.url : `${config.nowcerts.url}/`;
}

export function buildNowCertsUrl(pathOrUrl: string): string {
  return new URL(pathOrUrl, getNowCertsBaseUrl()).toString();
}

export function ok(commandType: CommandType, message: string, files?: string[]): ActionResult {
  return { success: true, commandType, message, downloadedFiles: files };
}

export function fail(commandType: CommandType, message: string, error?: Error): ActionResult {
  return { success: false, commandType, message, error };
}

/**
 * Waits for a toast / success notification on NowCerts after saving.
 * Selector TBD - placeholder.
 */
export async function waitForSaveConfirmation(page: Page): Promise<void> {
  // After saving, NowCerts redirects away from /Insert or shows a success indicator.
  // Wait for URL to change OR for the "in progress" indicator to disappear.
  await Promise.race([
    page.waitForURL(url => !url.toString().includes('/Insert'), { timeout: 30_000 }),
    page.waitForSelector('text=successfully', { timeout: 30_000 }).catch(() => {}),
  ]).catch(() => {});
  await page.waitForTimeout(1500);
}

/**
 * Downloads a file from a download trigger and saves it to downloads folder.
 * Returns the saved file path.
 */
export async function triggerDownload(
  page: Page,
  triggerFn: () => Promise<void>,
  filename: string
): Promise<string> {
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    triggerFn(),
  ]);

  const dir = config.files.downloadsPath;
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const filePath = path.join(dir, filename);
  await download.saveAs(filePath);
  logger.info(`Downloaded: ${filePath}`);
  return filePath;
}

/**
 * Returns today's date in YYYYMMdd format.
 */
export function todayYYYYMMdd(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}${mm}${dd}`;
}

/**
 * Removes trailing period, year range (e.g. "2026 - 2027"), and DBA text from a client name field.
 * Used when editing certificates/ID cards.
 */
export function cleanClientName(raw: string): string {
  let name = raw.trim();
  // Remove trailing period
  name = name.replace(/\.\s*$/, '').trim();
  // Remove year range like "2026 - 2027" anywhere in the string (keep DBA)
  name = name.replace(/\s+\d{4}\s*-\s*\d{4}/, '').trim();
  return name;
}

/**
 * Sanitizes a user-facing value for use inside a Windows filename.
 */
export function safeFilenamePart(raw: string): string {
  return raw
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Extracts the Insured UUID from the current page URL.
 * Expects the page to be on any /AMSINS/Insureds/Details/{id}/... route.
 * Falls back to navigating to the client's Information page if needed.
 */
export function getInsuredIdFromUrl(page: Page): string {
  const match = page.url().match(/\/AMSINS\/Insureds\/Details\/([0-9a-f-]{36})/i);
  if (!match?.[1]) {
    throw new Error(`Cannot extract insured ID from current URL: ${page.url()}`);
  }
  return match[1];
}

/**
 * Builds a NowCerts URL for the current insured's sub-page.
 * e.g. getInsuredUrl(page, 'Vehicles') -> <NOWCERTS_URL>/AMSINS/Insureds/Details/{id}/Vehicles
 */
export function getInsuredUrl(page: Page, subPage: string): string {
  const id = getInsuredIdFromUrl(page);
  return buildInsuredUrl(id, subPage);
}

export function buildInsuredUrl(insuredId: string, subPage: string): string {
  return buildNowCertsUrl(`/AMSINS/Insureds/Details/${insuredId}/${subPage}`);
}

/**
 * Builds the old TruckingCompanies edit URL for the current insured.
 */
export function getTruckingCompanyEditUrl(page: Page): string {
  const id = getInsuredIdFromUrl(page);
  return buildTruckingCompanyEditUrl(id);
}

export function buildTruckingCompanyEditUrl(insuredId: string): string {
  return buildNowCertsUrl(`/TruckingCompanies/Edit.aspx?Id=${insuredId}`);
}

/**
 * Builds the old TruckingCompanies details URL for the current insured.
 */
export function getTruckingCompanyDetailsUrl(page: Page, pageNum?: number): string {
  const id = getInsuredIdFromUrl(page);
  return buildTruckingCompanyDetailsUrl(id, pageNum);
}

export function buildTruckingCompanyDetailsUrl(insuredId: string, pageNum?: number): string {
  const base = buildNowCertsUrl(`/TruckingCompanies/Details.aspx?Id=${insuredId}`);
  return pageNum ? `${base}&Page=${pageNum}` : base;
}

/* ------------------------------------------------------------------ */
/*  Shared utility functions & constants (centralised from actions)   */
/* ------------------------------------------------------------------ */

/** Escapes special regex characters so the string can be used in `new RegExp(...)`. */
export function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Extracts only digit characters from a string. */
export function toDigits(value?: string): string {
  return (value ?? '').replace(/[^\d]/g, '');
}

/** Returns a CSS attribute selector matching an element whose `id` ends with `suffix`. */
export function byIdEndsWith(suffix: string): string {
  return `[id$="${suffix}"]`;
}

/** Two-letter state abbreviation → full state name. */
export const STATE_NAMES: Record<string, string> = {
  AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California',
  CO: 'Colorado', CT: 'Connecticut', DE: 'Delaware', FL: 'Florida', GA: 'Georgia',
  HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois', IN: 'Indiana', IA: 'Iowa',
  KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana', ME: 'Maine', MD: 'Maryland',
  MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota', MS: 'Mississippi', MO: 'Missouri',
  MT: 'Montana', NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire', NJ: 'New Jersey',
  NM: 'New Mexico', NY: 'New York', NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio',
  OK: 'Oklahoma', OR: 'Oregon', PA: 'Pennsylvania', RI: 'Rhode Island', SC: 'South Carolina',
  SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah', VT: 'Vermont',
  VA: 'Virginia', WA: 'Washington', WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming',
  DC: 'District of Columbia',
};

/** Converts a two-letter state abbreviation to its full name, falling back to the original value. */
export function toFullStateName(value: string): string {
  return STATE_NAMES[value.toUpperCase()] ?? value;
}

/** Maps policy type codes to the display labels used in NowCerts policy grids. */
export const LINE_LABELS: Record<string, string> = {
  AL: 'Commercial Auto',
  NTL: 'Commercial Auto',
  MTC: 'Motor Truck Cargo',
  APD: 'Physical Damage',
  GL: 'General Liability',
  WC: "Worker's Compensation",
  EXL: 'Excess Liability',
};
