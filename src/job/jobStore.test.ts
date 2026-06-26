import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { openJobStore, JobStore } from './jobStore';
import { JobInput } from '../shared/jobTypes';

const input: JobInput = {
  mode: 'existing_client',
  clientName: 'Pix Test',
  usdot: '1234567',
  commands: [{ type: 'NO_CHANGE', rawText: '' }],
  notifyTo: 'a@h2oins.com',
  language: 'es',
  createdBy: 'maria',
};

let store: JobStore;

beforeEach(() => {
  store = openJobStore(':memory:');
});
afterEach(() => {
  store.close();
});

describe('jobStore', () => {
  it('crea un job en estado queued con id y createdAt', () => {
    const job = store.createJob(input);
    expect(job.id).toBeTruthy();
    expect(job.status).toBe('queued');
    expect(job.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(job.commands).toHaveLength(1);
  });

  it('claimNextQueued devuelve el más antiguo y lo pasa a processing', () => {
    const a = store.createJob(input);
    const claimed = store.claimNextQueued();
    expect(claimed?.id).toBe(a.id);
    expect(claimed?.status).toBe('processing');
    expect(store.getJob(a.id)?.status).toBe('processing');
  });

  it('claimNextQueued devuelve null si no hay queued', () => {
    expect(store.claimNextQueued()).toBeNull();
  });

  it('completeJob marca done con resumen y archivos', () => {
    const a = store.createJob(input);
    store.claimNextQueued();
    store.completeJob(a.id, '✓ NO_CHANGE: ok', ['/app/downloads/cert.pdf']);
    const j = store.getJob(a.id);
    expect(j?.status).toBe('done');
    expect(j?.resultSummary).toBe('✓ NO_CHANGE: ok');
    expect(j?.resultFiles).toEqual(['/app/downloads/cert.pdf']);
    expect(j?.finishedAt).toBeTruthy();
  });

  it('failJob marca failed con mensaje de error', () => {
    const a = store.createJob(input);
    store.claimNextQueued();
    store.failJob(a.id, 'algo falló', '✗ NO_CHANGE: error', []);
    const j = store.getJob(a.id);
    expect(j?.status).toBe('failed');
    expect(j?.errorMessage).toBe('algo falló');
  });

  it('markStuckProcessingAsNeedsReview convierte processing en needs_review', () => {
    const a = store.createJob(input);
    store.claimNextQueued(); // -> processing
    const n = store.markStuckProcessingAsNeedsReview();
    expect(n).toBe(1);
    expect(store.getJob(a.id)?.status).toBe('needs_review');
  });

  it('listJobs devuelve todos, más recientes primero', () => {
    store.createJob(input);
    store.createJob({ ...input, clientName: 'Otro' });
    expect(store.listJobs()).toHaveLength(2);
    expect(store.listJobs()[0].clientName).toBe('Otro');
  });
});
