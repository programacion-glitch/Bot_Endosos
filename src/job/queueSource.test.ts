import { describe, it, expect, vi } from 'vitest';
import { jobToParsedEmail, processOneQueuedJob } from './queueSource';
import type { Job } from '../shared/jobTypes';
import type { JobStore } from './jobStore';

const job: Job = {
  id: 'j1', status: 'processing', mode: 'existing_client', clientName: 'Pix', usdot: '123',
  commands: [{ type: 'NO_CHANGE', rawText: '' }], notifyTo: 'a@h2oins.com',
  language: 'es', createdBy: 'maria', createdAt: '2026-06-26T00:00:00.000Z',
};

function fakeStore(claimed: Job | null): JobStore & { completed: any[]; failed: any[] } {
  const completed: any[] = [];
  const failed: any[] = [];
  return {
    createJob: vi.fn(), getJob: vi.fn(), listJobs: vi.fn(),
    markStuckProcessingAsNeedsReview: vi.fn(), close: vi.fn(),
    claimNextQueued: vi.fn(() => claimed),
    completeJob: vi.fn((id, summary, files) => completed.push({ id, summary, files })),
    failJob: vi.fn((id, error, summary, files) => failed.push({ id, error, summary, files })),
    completed, failed,
  } as any;
}

describe('jobToParsedEmail', () => {
  it('mapea el job a ParsedEmail con from = notifyTo y los comandos', () => {
    const email = jobToParsedEmail(job);
    expect(email.from).toBe('a@h2oins.com');
    expect(email.clientName).toBe('Pix');
    expect(email.commands).toHaveLength(1);
    expect(email.subject).toContain('Pix');
  });
});

describe('processOneQueuedJob', () => {
  it('devuelve false cuando la cola está vacía', async () => {
    const store = fakeStore(null);
    const did = await processOneQueuedJob(store, { processJob: vi.fn() as any });
    expect(did).toBe(false);
  });

  it('completa el job cuando processJob tiene éxito', async () => {
    const store = fakeStore(job);
    const processJob = vi.fn(async () => ({ allSucceeded: true, summary: 's', files: ['/f'] }));
    const did = await processOneQueuedJob(store, { processJob: processJob as any });
    expect(did).toBe(true);
    expect(store.completed[0]).toMatchObject({ id: 'j1', summary: 's', files: ['/f'] });
  });

  it('falla el job cuando processJob no tiene éxito', async () => {
    const store = fakeStore(job);
    const processJob = vi.fn(async () => ({ allSucceeded: false, summary: 's', files: [], errorMessage: 'boom' }));
    await processOneQueuedJob(store, { processJob: processJob as any });
    expect(store.failed[0]).toMatchObject({ id: 'j1', error: 'boom' });
  });

  it('falla el job cuando processJob lanza', async () => {
    const store = fakeStore(job);
    const processJob = vi.fn(async () => { throw new Error('explotó'); });
    await processOneQueuedJob(store, { processJob: processJob as any });
    expect(store.failed[0]).toMatchObject({ id: 'j1', error: 'explotó' });
  });
});
