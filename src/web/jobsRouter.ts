import express, { Router } from 'express';
import path from 'path';
import fs from 'fs';
import { JobStore } from '../job/jobStore';
import { validateJobInput } from '../shared/schemas';
import { requireAuth } from './auth';

export function createJobsRouter(store: JobStore, downloadsDir: string): Router {
  const router = express.Router();
  router.use(requireAuth);

  // Encolar un job
  router.post('/', (req, res) => {
    const createdBy = req.session.user!; // requireAuth garantiza que existe
    const candidate = { ...(req.body ?? {}), createdBy };
    const result = validateJobInput(candidate);
    if (!result.ok) {
      return res.status(400).json({ errors: result.errors });
    }
    const job = store.createJob(result.value);
    res.status(201).json({ id: job.id });
  });

  // Listar / historial
  router.get('/', (_req, res) => {
    res.json(store.listJobs());
  });

  // Detalle / estado
  router.get('/:id', (req, res) => {
    const job = store.getJob(req.params.id);
    if (!job) return res.status(404).json({ error: 'Job no encontrado' });
    res.json(job);
  });

  // Descargar un archivo generado (certificado / screenshot)
  router.get('/:id/files/:name', (req, res) => {
    const job = store.getJob(req.params.id);
    if (!job) return res.status(404).json({ error: 'Job no encontrado' });

    // Seguridad: solo el basename, nunca permitir traversal fuera de downloadsDir
    const safeName = path.basename(req.params.name);
    if (safeName !== req.params.name) {
      return res.status(400).json({ error: 'Nombre de archivo inválido' });
    }
    // Solo archivos que realmente pertenecen al job
    const belongs = (job.resultFiles ?? []).some(f => path.basename(f) === safeName);
    if (!belongs) return res.status(404).json({ error: 'Archivo no asociado al job' });

    const filePath = path.join(downloadsDir, safeName);
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Archivo no encontrado' });
    res.download(filePath, safeName);
  });

  return router;
}
