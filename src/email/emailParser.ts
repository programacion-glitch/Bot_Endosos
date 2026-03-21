import { RawEmail } from './imapClient';
import {
  Command,
  CommandType,
  Driver,
  HolderInfo,
  Language,
  ParsedEmail,
  PolicyType,
  AddVehicleCommand,
  AddDriverCommand,
  RemoveVehicleCommand,
  RemoveDriverCommand,
} from '../types';
import { logger } from '../utils/logger';

// ─── Subject parsing ──────────────────────────────────────────────────────────
// Expected formats:
//   TIPO // ClientName // USDOT 123456
//   TIPO // ClientName // DBA SomeName
//   TIPO // ClientName // USDOT 123456 // DBA SomeName
const SUBJECT_USDOT_RE = /USDOT\s+([A-Z0-9]+)/i;
const SUBJECT_DBA_RE = /\bDBA:?\s+([^/]+)/i;

function parseSubject(subject: string): { clientName?: string; usdot?: string; dba?: string } {
  const usdotMatch = subject.match(SUBJECT_USDOT_RE);
  const usdot = usdotMatch?.[1];

  const dbaMatch = subject.match(SUBJECT_DBA_RE);
  const dba = dbaMatch?.[1]?.trim() || undefined;

  let namePart = subject;

  // 1. Remove USDOT
  namePart = namePart.replace(/USDOT\s+[A-Z0-9]+/i, '');

  // 2. Remove DBA and its value
  namePart = namePart.replace(/\bDBA:?\s+[^/]+/i, '');

  // 3. Remove prefixes/suffixes anywhere in the string
  namePart = namePart.replace(/\b(BOT-END|END-BOT|BOT-DOCUMENTAR|EFFECTIVE\s+DATE\s+[\d\/]+)\b/gi, '');

  // 4. Clean up the slashes and trim
  namePart = namePart.replace(/\s*\/\/\s*/g, ' ').replace(/\s+/g, ' ').trim();

  // 5. If there's a stray slash at start or end, remove it
  namePart = namePart.replace(/^\/+|\/+$/g, '').trim();

  return { clientName: namePart || undefined, usdot, dba };
}

// ─── Language detection ───────────────────────────────────────────────────────

function detectLanguage(body: string, commands: Command[]): Language {
  const langMatch = body.match(/\bLanguage:\s*(Español|Spanish|English)\b/i);
  if (langMatch) {
    return langMatch[1].toLowerCase().startsWith('español') ||
      langMatch[1].toLowerCase().startsWith('spanish')
      ? 'es'
      : 'en';
  }
  return 'en';
}

// ─── Agent detection ──────────────────────────────────────────────────────────

function detectAgent(body: string): string | undefined {
  const match = body.match(/\bAgent:\s*([^\n\r]+)/i);
  return match?.[1]?.trim();
}

// ─── SendTo detection ─────────────────────────────────────────────────────────

function detectSendTo(body: string): string | undefined {
  const match = body.match(/\bSend\s+to:\s*([^\s\n\r]+)/i);
  return match?.[1]?.trim();
}

// ─── Command block splitting ──────────────────────────────────────────────────
// Blocks are separated by:
// 1. A line containing only "xx" or "x" (legacy separator)
// 2. A blank line followed by a line starting with a known command keyword

/** Patterns that mark the start of a new command block */
const COMMAND_START_RE = /^(?:Create\s+Insured|Create\s+Master|Add\s+(?:Vehicle|Trailer|Driver|Additional\s+Insured|Waiver\s+of\s+Subrogation|Note\s+to|Loss\s+Payee|Policy)|Remove\s+(?:Vehicle|Trailer|Driver)|Update\s+(?:Holder|LP\s+Holder|limit\/deductible|limit|deductible|mailing\s+address|Vehicle|Policy\s+Number)|Delete\s+Vehicle|No\s+Change|Type:\s*(?:Tractor|Truck|Trailer))\b/i;

function splitCommandBlocks(body: string): string[] {
  // First try legacy "x" / "xx" separator
  const legacyBlocks = body.split(/^[\t ]*x{1,2}[\t ]*$/im);
  if (legacyBlocks.length > 1) {
    return legacyBlocks.map(b => b.trim()).filter(b => b.length > 0);
  }

  // Otherwise split by detecting command keyword starts after blank lines
  const lines = body.split('\n');
  const blocks: string[] = [];
  let current: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();

    // If this line starts a new command and we already have content, flush
    if (COMMAND_START_RE.test(trimmed) && current.length > 0) {
      const block = current.join('\n').trim();
      if (block) blocks.push(block);
      current = [line];
    } else {
      current.push(line);
    }
  }

  // Flush last block
  const last = current.join('\n').trim();
  if (last) blocks.push(last);

  return blocks;
}

// ─── Individual field parsers ─────────────────────────────────────────────────

function field(block: string, key: string): string | undefined {
  const re = new RegExp(`^${key}:\\s*(.+)$`, 'im');
  return block.match(re)?.[1]?.trim();
}

function parseDriverLine(line: string): Driver | null {
  // Supported CDL formats:
  //   CDL: 1232132 WI          (number STATE  - no parens)
  //   CDL: 1232132 (WI)        (number (STATE) - with parens)
  const nameM = line.match(/Name:\s*([^/]+)/i);
  const lastM = line.match(/Last\s*Name:\s*([^/]+)/i);
  const cdlM =
    line.match(/CDL:\s*([\w]+)\s*\((\w{2})\)/i) ??   // with parens
    line.match(/CDL:\s*([\w]+)\s+([A-Z]{2})\b/i);     // without parens
  const dobM = line.match(/DOB:?\s*([\d/]+)/i);

  if (!nameM || !lastM || !cdlM || !dobM) return null;

  return {
    firstName: nameM[1].trim(),
    lastName: lastM[1].trim(),
    cdl: cdlM[1].trim(),
    cdlState: cdlM[2].trim(),
    dob: dobM[1].trim(),
  };
}

function parseDrivers(block: string): Driver[] {
  const drivers: Driver[] = [];
  const lines = block.split('\n');
  for (const line of lines) {
    if (/Driver\d*:/i.test(line)) {
      const d = parseDriverLine(line);
      if (d) drivers.push(d);
    }
  }
  return drivers;
}

function parseHolder(block: string): HolderInfo {
  return {
    name: field(block, "Holder[’']?s? ?name") ?? field(block, 'Holder name') ?? '',
    address: field(block, "Holder[’']?s? ?[Aa]ddress") ?? '',
    note: field(block, 'Note') ?? undefined,
  };
}

function parsePolicyTypes(line: string): string[] {
  // e.g. "AL/GL" or "AL & GL" or "AL & WC" or "AL:"
  return line.split(/[/&,]/).map(s => s.replace(/[^A-Z0-9]/gi, '').trim()).filter(Boolean);
}

// ─── Block → Command ──────────────────────────────────────────────────────────

function parseBlock(block: string): Command | null {
  const firstLine = block.split('\n')[0].trim();

  // ── Create Insured ────────────────────────────────────────────────────────
  if (/^Create\s+Insured/i.test(firstLine)) {
    return {
      type: 'CREATE_INSURED',
      rawText: block,
      name: field(block, 'Name') ?? '',
      dba: field(block, 'Dba') ?? undefined,
      address: field(block, 'Address') ?? '',
      usdot: field(block, 'USDOT') ?? '',
      drivers: parseDrivers(block),
      phone: field(block, 'Phone') ?? '',
      email: field(block, 'Email') ?? '',
    };
  }

  // ── Create Master ─────────────────────────────────────────────────────────
  if (/^Create\s+Master/i.test(firstLine)) {
    return { type: 'CREATE_MASTER', rawText: block };
  }

  // ── Add Vehicle/Trailer ───────────────────────────────────────────────────
  // Supported formats:
  //   Add Vehicle/Trailer VIN#: ### // Year: YYYY // Description: NNNN // Value: $#,### // Effective Date: M/d/YYYY
  //   Add Vehicle: VIN# ### // Year: YYYY // Description: NNNN
  //   Add Trailer: VIN# ### // Year: YYYY // Description: NNNN
  //   Type: Tractor Truck // VIN Number: ### // Year: YYYY // ...  (implicit add)
  if (/^(?:Add\s+(?:Vehicle\/Trailer|Vehicle|Trailer)|Type:\s*(?:Tractor\s+Truck|Truck|Trailer))\b/i.test(firstLine)) {
    // Try single-line first, then fall back to multi-line block parsing
    const vinRe = /(?:VIN(?:#|\s+Number):?\s*)([\w]+)/i;
    const vinM = firstLine.match(vinRe) ?? block.match(vinRe);
    const yearM = firstLine.match(/Year:\s*(\d{1,2},?\d{3}|\d{4})/i) ?? block.match(/Year:\s*(\d{1,2},?\d{3}|\d{4})/i);
    const descM = firstLine.match(/Description:\s*([^/\n]+)/i) ?? block.match(/Description:\s*([^/\n]+)/i);
    const valueM = firstLine.match(/Value:\s*\$?([\d,]+[^/]*)/i) ?? block.match(/Value:\s*\$?([\d,]+[^/\n]*)/i);
    const effM = firstLine.match(/Effective\s*Date:\s*([\d/]+)/i)
      ?? block.match(/Effective\s*Date:\s*([\d/]+)/i);

    return {
      type: 'ADD_VEHICLE',
      rawText: block,
      vin: vinM?.[1]?.trim() ?? '',
      year: (yearM?.[1] ?? '').replace(/,/g, '').trim(),
      description: descM?.[1]?.trim() ?? '',
      value: valueM?.[1]?.trim() ?? undefined,
      effectiveDate: effM?.[1]?.trim() ?? '',
    };
  }

  // ── Remove Vehicle/Trailer ────────────────────────────────────────────────
  if (/^(?:Remove|Delete)\s+(?:Vehicle\/Trailer|Vehicle|Trailer)\b(?!\s*\/Driver)/i.test(firstLine)) {
    const vinM = firstLine.match(/VIN#:?\s*([\w]+)/i) ?? block.match(/VIN#:?\s*([\w]+)/i);
    const yearM = firstLine.match(/Year:\s*(\d{1,2},?\d{3}|\d{4})/i) ?? block.match(/Year:\s*(\d{1,2},?\d{3}|\d{4})/i);
    const descM = firstLine.match(/Description:\s*([^/\n]+)/i) ?? block.match(/Description:\s*([^/\n]+)/i);
    const valueM = firstLine.match(/Value:\s*(\$[\d,]+[^/]*)/i) ?? block.match(/Value:\s*(\$[\d,]+[^/\n]*)/i);
    const effM = firstLine.match(/Effective\s*Date:\s*([\d/]+)/i)
      ?? block.match(/Effective\s*Date:\s*([\d/]+)/i);
    return {
      type: 'REMOVE_VEHICLE',
      rawText: block,
      vin: vinM?.[1]?.trim() ?? '',
      year: (yearM?.[1] ?? '').replace(/,/g, '').trim(),
      description: descM?.[1]?.trim() ?? '',
      value: valueM?.[1]?.trim() ?? undefined,
      effectiveDate: effM?.[1]?.trim() ?? '',
    };
  }

  // ── Add Driver ────────────────────────────────────────────────────────────
  if (/^Add\s+Driver/i.test(firstLine)) {
    // Try single-line format first, then multi-line field extraction
    let d = parseDriverLine(firstLine);
    if (!d) {
      const cdlM =
        block.match(/CDL:\s*([\w]+)\s*\((\w{2})\)/i) ??
        block.match(/CDL:\s*([\w]+)\s+([A-Z]{2})\b/i);
      const firstName = field(block, 'Name');
      const lastName = field(block, 'Last\\s*Name');
      const dob = field(block, 'DOB');
      if (firstName && lastName && cdlM && dob) {
        d = { firstName, lastName, cdl: cdlM[1].trim(), cdlState: cdlM[2].trim(), dob };
      }
    }
    return {
      type: 'ADD_DRIVER',
      rawText: block,
      driver: d ?? { firstName: '', lastName: '', cdl: '', cdlState: '', dob: '' },
    };
  }

  // ── Remove Driver ─────────────────────────────────────────────────────────
  if (/^Remove\s+Driver/i.test(firstLine)) {
    const d = parseDriverLine(firstLine);
    return {
      type: 'REMOVE_DRIVER',
      rawText: block,
      driver: d ?? { firstName: '', lastName: '', cdl: '', cdlState: '', dob: '' },
    };
  }

  // ── Add Additional Insured & Waiver of Subrogation ────────────────────────
  if (/^Add\s+Additional\s+Insured\s*&\s*Waiver\s+of\s+Subrogation/i.test(firstLine)) {
    const polPart = firstLine.match(/to\s+the\s+(.+)/i)?.[1] ?? '';
    return {
      type: 'ADD_AI_AND_WOS',
      rawText: block,
      policies: parsePolicyTypes(polPart),
      holder: parseHolder(block),
    };
  }

  // ── Add Additional Insured ────────────────────────────────────────────────
  if (/^Add\s+Additional\s+Insured/i.test(firstLine)) {
    const polPart = firstLine.match(/to\s+the\s+(.+)/i)?.[1] ?? '';
    return {
      type: 'ADD_ADDITIONAL_INSURED',
      rawText: block,
      policies: parsePolicyTypes(polPart),
      holder: parseHolder(block),
    };
  }

  // ── Add Waiver of Subrogation ─────────────────────────────────────────────
  if (/^Add\s+Waiver\s+of\s+Subrogation/i.test(firstLine)) {
    const polPart = firstLine.match(/to\s+the\s+(.+)/i)?.[1] ?? '';
    return {
      type: 'ADD_WAIVER_SUBROGATION',
      rawText: block,
      policies: parsePolicyTypes(polPart),
      holder: parseHolder(block),
    };
  }

  // ── Add Note to Holder ────────────────────────────────────────────────────
  if (/^Add\s+Note\s+to\s+Holder/i.test(firstLine)) {
    return {
      type: 'ADD_NOTE_TO_HOLDER',
      rawText: block,
      holder: parseHolder(block),
    };
  }

  // ── Add Note to Master ────────────────────────────────────────────────────
  if (/^Add\s+Note\s+to\s+Master/i.test(firstLine)) {
    return {
      type: 'ADD_NOTE_TO_MASTER',
      rawText: block,
      note: field(block, 'Note') ?? '',
    };
  }

  // ── Add Loss Payee ────────────────────────────────────────────────────────
  if (/^Add\s+Loss\s+Payee/i.test(firstLine)) {
    const vinM = firstLine.match(/VIN#\s*(\w+)/i);
    return {
      type: 'ADD_LOSS_PAYEE',
      rawText: block,
      vin: vinM?.[1]?.trim() ?? '',
      holder: parseHolder(block),
    };
  }

  // ── Update LP Holder ──────────────────────────────────────────────────────
  if (/^Update\s+LP\s+Holder/i.test(firstLine)) {
    const vinM = firstLine.match(/VIN#\s*(\w+)/i);
    return {
      type: 'UPDATE_LP_HOLDER',
      rawText: block,
      vin: vinM?.[1]?.trim() ?? '',
      holderName: field(block, "Holder'?s? ?name") ?? field(block, 'Holder name') ?? '',
      updateTo: field(block, 'Update to') ?? '',
      note: field(block, 'Note') ?? undefined,
    };
  }

  // ── Update Holder's name/address ──────────────────────────────────────────
  if (/^Update\s+Holder/i.test(firstLine)) {
    return {
      type: 'UPDATE_HOLDER',
      rawText: block,
      holderName: field(block, "Holder'?s? ?name") ?? field(block, 'Holder name') ?? '',
      updateTo: field(block, 'Update to') ?? '',
      note: field(block, 'Note') ?? undefined,
    };
  }

  // ── Add Policy ────────────────────────────────────────────────────────────
  if (/^Add\s+Policy/i.test(firstLine)) {
    // Policy type is the first non-empty line after "Add Policy" that matches a known type
    const lines = block.split('\n').slice(1);
    const ptLine = lines.find(l => /^\s*(AL|MTC|APD|GL|WC|EXL|NTL)\s*$/i.test(l.trim()));
    const pt = (ptLine?.trim()?.toUpperCase() ?? '') as PolicyType;
    return {
      type: 'ADD_POLICY',
      rawText: block,
      policyType: pt,
      limit: field(block, 'Limit') ?? undefined,
      deductible: field(block, 'Deductible') ?? undefined,
      carrier: field(block, 'Carrier') ?? '',
      mga: field(block, 'MGA') ?? '',
      policyNumber: field(block, 'Policy Number') ?? '',
      effectiveDate: field(block, 'Effective Date') ?? '',
      expirationDate: field(block, 'Expiration Date') ?? '',
      anyAuto: /Any\s*Auto/i.test(block),
      allOwnedAutos: /All\s*Owned\s*Autos/i.test(block),
      scheduledAutos: /Scheduled\s*Autos/i.test(block),
      hiredAutos: /Hired\s*Autos/i.test(block),
      nonOwnedAutos: /Non.Owned\s*Autos/i.test(block),
      eachOccurrence: field(block, 'Each Occurrence') ?? undefined,
      damageToRentedPremises: field(block, 'Damage to Rented Premises') ?? undefined,
      medExp: field(block, 'Med Exp') ?? undefined,
      personalAdvInjury: field(block, 'Personal & Adv Injury') ?? undefined,
      generalAggregate: field(block, 'General Aggregate') ?? undefined,
      productsCompOpAgg: field(block, 'Products-Comp\\s*/\\s*Op\\s*Agg') ?? field(block, 'Products-Comp') ?? undefined,
      elEachAccident: field(block, 'E.L. Each Accident') ?? undefined,
      elDiseaseEaEmployee: field(block, 'E.L. Disease - EA Employee') ?? undefined,
      elDiseasePolicyLimit: field(block, 'E.L. Disease - Policy Limit') ?? undefined,
      aggregate: field(block, 'Aggregate') ?? undefined,
    };
  }

  // ── Update limit/deductible ───────────────────────────────────────────────
  if (/^Update\s+(?:limit\/deductible|limit|deductible)/i.test(firstLine)) {
    const ptM = firstLine.match(/to\s+the\s+(AL|MTC|APD|GL|WC|EXL|NTL)/i);
    return {
      type: 'UPDATE_LIMIT_DEDUCTIBLE',
      rawText: block,
      policyType: (ptM?.[1]?.toUpperCase() as PolicyType) ?? 'AL',
      limit: field(block, 'Limit') ?? undefined,
      deductible: field(block, 'Deductible') ?? undefined,
      eachOccurrence: field(block, 'Each Occurrence') ?? undefined,
      damageToRentedPremises: field(block, 'Damage to Rented Premises') ?? undefined,
      medExp: field(block, 'Med Exp') ?? undefined,
      personalAdvInjury: field(block, 'Personal & Adv Injury') ?? undefined,
      generalAggregate: field(block, 'General Aggregate') ?? undefined,
      productsCompOpAgg: field(block, 'Products-Comp\\s*/\\s*Op\\s*Agg') ?? field(block, 'Products-Comp') ?? undefined,
      elEachAccident: field(block, 'E.L. Each Accident') ?? undefined,
      elDiseaseEaEmployee: field(block, 'E.L. Disease - EA Employee') ?? undefined,
      elDiseasePolicyLimit: field(block, 'E.L. Disease - Policy Limit') ?? undefined,
      aggregate: field(block, 'Aggregate') ?? undefined,
    };
  }

  // ── Update mailing address ────────────────────────────────────────────────
  if (/^Update\s+mailing\s+address/i.test(firstLine)) {
    const lines = block.split('\n').slice(1).join('\n').trim();
    return {
      type: 'UPDATE_MAILING_ADDRESS',
      rawText: block,
      address: lines,
    };
  }

  // ── Delete Vehicle's value ────────────────────────────────────────────────
  if (/^Delete\s+Vehicle'?s?\s+value/i.test(firstLine)) {
    const vinM = block.match(/Vin#:\s*([\w]+)/i);
    return {
      type: 'DELETE_VEHICLE_VALUE',
      rawText: block,
      vin: vinM?.[1]?.trim() ?? '',
    };
  }

  // ── Update Vehicle's value ────────────────────────────────────────────────
  if (/^Update\s+Vehicle'?s?\s+value/i.test(firstLine)) {
    const vinM = block.match(/Vin#:\s*([\w]+)/i);
    return {
      type: 'UPDATE_VEHICLE_VALUE',
      rawText: block,
      vin: vinM?.[1]?.trim() ?? '',
      value: field(block, 'Value') ?? '',
    };
  }

  // ── Update Policy Number ──────────────────────────────────────────────────
  if (/^Update\s+Policy\s+Number/i.test(firstLine)) {
    const ptM = firstLine.match(/to\s+the\s+(AL|MTC|APD|GL|WC|EXL|NTL)/i);
    const numM = firstLine.match(/:\s*([\w\-]+)\s*$/);
    return {
      type: 'UPDATE_POLICY_NUMBER',
      rawText: block,
      policyType: (ptM?.[1]?.toUpperCase() as PolicyType) ?? 'AL',
      newPolicyNumber: numM?.[1]?.trim() ?? '',
    };
  }

  // ── No Change ─────────────────────────────────────────────────────────────
  if (/^No\s+Change/i.test(firstLine)) {
    return { type: 'NO_CHANGE', rawText: block };
  }

  logger.warn(`Unknown command block, first line: "${firstLine}"`);
  return null;
}

// ─── Main parser ──────────────────────────────────────────────────────────────

export function parseEmail(raw: RawEmail): ParsedEmail {
  const { clientName, usdot, dba } = parseSubject(raw.subject);

  const blocks = splitCommandBlocks(raw.body);
  const commands: Command[] = [];

  for (const block of blocks) {
    const cmd = parseBlock(block);
    if (cmd) {
      commands.push(cmd);
      logger.debug(`Parsed command: ${cmd.type}`);
    }
  }

  const language = detectLanguage(raw.body, commands);
  const agent = detectAgent(raw.body);
  const sendTo = detectSendTo(raw.body);

  return {
    uid: raw.uid,
    subject: raw.subject,
    from: raw.from,
    to: raw.to,
    body: raw.body,
    clientName,
    usdot,
    dba,
    commands,
    agent,
    language,
    sendTo,
  };
}
