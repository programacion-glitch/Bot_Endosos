import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ParsedEmail, ActionResult } from '../types';

// Mocks de las dependencias que tocan navegador / email / NowCerts.
vi.mock('../browser/nowcertsLogin', () => ({
  getNowCertsPage: vi.fn(async () => ({ url: () => 'https://nowcerts.com/AMSINS/x' })),
  navigateToClient: vi.fn(async () => true),
  invalidateSession: vi.fn(),
}));
vi.mock('../browser/browserManager', () => ({
  closeBrowser: vi.fn(async () => {}),
  screenshot: vi.fn(async () => undefined),
}));
vi.mock('../actions/dispatcher', () => ({
  dispatchCommands: vi.fn(),
}));
vi.mock('../email/emailSender', () => ({
  sendReviewEmail: vi.fn(async () => {}),
  sendErrorNotification: vi.fn(async () => {}),
  sendAlertEmail: vi.fn(async () => {}),
}));

import { processJob } from './processJob';
import { dispatchCommands } from '../actions/dispatcher';
import { navigateToClient } from '../browser/nowcertsLogin';
import { sendReviewEmail } from '../email/emailSender';

const email: ParsedEmail = {
  uid: 0, subject: '[PORTAL] Pix', from: 'a@h2oins.com', to: 'a@h2oins.com', body: '',
  clientName: 'Pix', usdot: '123', commands: [{ type: 'NO_CHANGE', rawText: '' }],
  language: 'es',
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('processJob', () => {
  it('devuelve allSucceeded=true cuando todos los comandos pasan', async () => {
    (dispatchCommands as any).mockResolvedValue([
      { success: true, commandType: 'NO_CHANGE', message: 'ok', downloadedFiles: ['/d/cert.pdf'] } as ActionResult,
    ]);
    const out = await processJob(email);
    expect(out.allSucceeded).toBe(true);
    expect(out.files).toContain('/d/cert.pdf');
    expect(sendReviewEmail).toHaveBeenCalledOnce();
  });

  it('devuelve allSucceeded=false cuando un comando falla', async () => {
    (dispatchCommands as any).mockResolvedValue([
      { success: false, commandType: 'NO_CHANGE', message: 'boom', errorScreenshot: '/d/err.png' } as ActionResult,
    ]);
    const out = await processJob(email);
    expect(out.allSucceeded).toBe(false);
    expect(out.errorMessage).toContain('NO_CHANGE');
    expect(out.files).toContain('/d/err.png');
  });

  it('devuelve allSucceeded=false cuando el cliente no se encuentra', async () => {
    (navigateToClient as any).mockResolvedValue(false);
    const out = await processJob(email);
    expect(out.allSucceeded).toBe(false);
    expect(out.errorMessage?.toLowerCase()).toContain('cliente');
    expect(dispatchCommands).not.toHaveBeenCalled();
  });
});
