/**
 * Run once to create the initial agents.xlsx template:
 *   npx ts-node create-agents-excel.ts
 */
import ExcelJS from 'exceljs';
import path from 'path';
import fs from 'fs';

async function main() {
  const dir = path.resolve('./data');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Agents');

  ws.columns = [
    { header: 'Name', key: 'name', width: 20 },
    { header: 'Emails', key: 'emails', width: 60 },
  ];

  // Bold header
  ws.getRow(1).font = { bold: true };

  // Example agents
  ws.addRow({ name: 'RT', emails: 'agent1@example.com, agent2@example.com' });
  ws.addRow({ name: 'Jenny', emails: 'jenny@h2oins.com' });

  const outPath = path.resolve('./data/agents.xlsx');
  await wb.xlsx.writeFile(outPath);
  console.log(`agents.xlsx created at: ${outPath}`);
}

main().catch(console.error);
