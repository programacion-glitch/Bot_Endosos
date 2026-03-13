import ExcelJS from 'exceljs';
import { config } from '../config/config';
import { Agent } from '../types';
import { logger } from './logger';
import fs from 'fs';

let agentsCache: Agent[] | null = null;

/**
 * Loads agents from the Excel file.
 * Caches the result - call reloadAgents() to force reload.
 *
 * Excel format:
 * | Name  | Emails                            |
 * |-------|-----------------------------------|
 * | RT    | email1@x.com, email2@x.com        |
 * | Jenny | jenny@h2oins.com                  |
 */
export async function getAgents(): Promise<Agent[]> {
  if (agentsCache) return agentsCache;
  return reloadAgents();
}

export async function reloadAgents(): Promise<Agent[]> {
  const path = config.files.agentsExcelPath;

  if (!fs.existsSync(path)) {
    logger.warn(`Agents Excel not found at: ${path}. Using empty list.`);
    agentsCache = [];
    return agentsCache;
  }

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(path);
  const sheet = workbook.worksheets[0];

  const agents: Agent[] = [];

  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return; // skip header

    const name = String(row.getCell(1).value ?? '').trim();
    const emailsRaw = String(row.getCell(2).value ?? '').trim();

    if (!name) return;

    const emails = emailsRaw
      .split(/[,;]/)
      .map(e => e.trim())
      .filter(e => e.includes('@'));

    agents.push({ name, emails });
  });

  agentsCache = agents;
  logger.info(`Loaded ${agents.length} agent(s) from Excel.`);
  return agents;
}

/**
 * Finds an agent by name (case-insensitive, partial match).
 * Supports multiple names separated by comma: "RT, Jenny"
 */
export async function findAgentEmails(agentName: string): Promise<string[]> {
  const agents = await getAgents();
  const names = agentName.split(',').map(n => n.trim().toLowerCase());
  const emails: string[] = [];

  for (const name of names) {
    const found = agents.find(a => a.name.toLowerCase() === name || a.name.toLowerCase().includes(name));
    if (found) {
      emails.push(...found.emails);
    } else {
      logger.warn(`Agent not found: "${name}"`);
    }
  }

  return [...new Set(emails)]; // deduplicate
}
