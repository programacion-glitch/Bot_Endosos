import { Command, Language } from '../types';

export type JobStatus = 'queued' | 'processing' | 'done' | 'failed' | 'needs_review';

export type JobMode = 'new_client' | 'existing_client';

/** Datos que entran al crear un job (lo que produce el formulario / la API). */
export interface JobInput {
  mode: JobMode;
  clientName: string;
  usdot?: string;
  dba?: string;
  commands: Command[];
  notifyTo: string;
  language: Language;
  createdBy: string;
}

/** Un job persistido en la cola. */
export interface Job extends JobInput {
  id: string;
  status: JobStatus;
  createdAt: string;
  startedAt?: string;
  finishedAt?: string;
  resultSummary?: string;
  resultFiles?: string[];
  errorMessage?: string;
}
