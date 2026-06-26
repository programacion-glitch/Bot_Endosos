import { describe, it, expect, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createJobsRouter } from './jobsRouter';
import { openJobStore, JobStore } from '../job/jobStore';

// Sesión simulada: inyecta un usuario fijo para saltar requireAuth real.
function makeApp(store: JobStore) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { (req as any).session = { user: 'maria' }; next(); });
  app.use('/api/jobs', createJobsRouter(store, '/tmp/does-not-matter'));
  return app;
}

let store: JobStore;
let app: express.Express;
const validBody = {
  mode: 'existing_client',
  clientName: 'Pix Test',
  usdot: '123',
  language: 'es',
  notifyTo: 'a@h2oins.com',
  commands: [{ type: 'NO_CHANGE', rawText: '' }],
};

beforeEach(() => {
  store = openJobStore(':memory:');
  app = makeApp(store);
});

describe('jobsRouter', () => {
  it('POST /api/jobs encola un job válido y sella createdBy del usuario', async () => {
    const res = await request(app).post('/api/jobs').send(validBody);
    expect(res.status).toBe(201);
    expect(res.body.id).toBeTruthy();
    const job = store.getJob(res.body.id);
    expect(job?.status).toBe('queued');
    expect(job?.createdBy).toBe('maria'); // del "session", no del body
  });

  it('POST ignora un createdBy enviado por el cliente', async () => {
    const res = await request(app).post('/api/jobs').send({ ...validBody, createdBy: 'hacker' });
    const job = store.getJob(res.body.id);
    expect(job?.createdBy).toBe('maria');
  });

  it('POST inválido → 400 con errores', async () => {
    const res = await request(app).post('/api/jobs').send({ ...validBody, commands: [] });
    expect(res.status).toBe(400);
    expect(Array.isArray(res.body.errors)).toBe(true);
  });

  it('GET /api/jobs lista los jobs', async () => {
    await request(app).post('/api/jobs').send(validBody);
    const res = await request(app).get('/api/jobs');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
  });

  it('GET /api/jobs/:id devuelve el job o 404', async () => {
    const created = await request(app).post('/api/jobs').send(validBody);
    const ok = await request(app).get(`/api/jobs/${created.body.id}`);
    expect(ok.status).toBe(200);
    const missing = await request(app).get('/api/jobs/no-existe');
    expect(missing.status).toBe(404);
  });

  it('descarga rechaza traversal de path con 400', async () => {
    const created = await request(app).post('/api/jobs').send(validBody);
    const res = await request(app).get(`/api/jobs/${created.body.id}/files/..%2f..%2fsecret`);
    expect([400, 404]).toContain(res.status); // nunca 200
  });
});
