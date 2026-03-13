import { parseEmail } from './src/email/emailParser';

const testBody = `Create Master

Add Policy:
MTC
Limit: $100,000`;

const raw = {
  uid: 2001,
  subject: 'DOCUMENTAR CLIENTE // PIX TEST 3 LLC // EFFECTIVE DATE 03/05/2026 // USDOT 11111',
  from: 'test@h2oins.com',
  to: 'bot@h2oins.com',
  body: testBody,
  date: new Date(),
};

const parsed = parseEmail(raw as any);
console.log(parsed);
