import Database from 'better-sqlite3';
import { randomUUID } from 'crypto';
import { Job, JobInput, JobStatus } from '../shared/jobTypes';

export interface JobStore {
  createJob(input: JobInput): Job;
  claimNextQueued(): Job | null;
  completeJob(id: string, summary: string, files: string[]): void;
  failJob(id: string, errorMessage: string, summary: string, files: string[]): void;
  getJob(id: string): Job | null;
  listJobs(): Job[];
  markStuckProcessingAsNeedsReview(): number;
  close(): void;
}

interface Row {
  id: string;
  status: JobStatus;
  mode: string;
  client_name: string;
  usdot: string | null;
  dba: string | null;
  commands_json: string;
  notify_to: string;
  language: string;
  created_by: string;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
  result_summary: string | null;
  result_files_json: string | null;
  error_message: string | null;
}

function rowToJob(r: Row): Job {
  return {
    id: r.id,
    status: r.status,
    mode: r.mode as Job['mode'],
    clientName: r.client_name,
    usdot: r.usdot ?? undefined,
    dba: r.dba ?? undefined,
    commands: JSON.parse(r.commands_json),
    notifyTo: r.notify_to,
    language: r.language as Job['language'],
    createdBy: r.created_by,
    createdAt: r.created_at,
    startedAt: r.started_at ?? undefined,
    finishedAt: r.finished_at ?? undefined,
    resultSummary: r.result_summary ?? undefined,
    resultFiles: r.result_files_json ? JSON.parse(r.result_files_json) : undefined,
    errorMessage: r.error_message ?? undefined,
  };
}

export function openJobStore(dbPath: string): JobStore {
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.exec(`
    CREATE TABLE IF NOT EXISTS jobs (
      id TEXT PRIMARY KEY,
      status TEXT NOT NULL,
      mode TEXT NOT NULL,
      client_name TEXT NOT NULL,
      usdot TEXT,
      dba TEXT,
      commands_json TEXT NOT NULL,
      notify_to TEXT NOT NULL,
      language TEXT NOT NULL,
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL,
      started_at TEXT,
      finished_at TEXT,
      result_summary TEXT,
      result_files_json TEXT,
      error_message TEXT
    );
  `);

  const insert = db.prepare(`
    INSERT INTO jobs (id, status, mode, client_name, usdot, dba, commands_json,
                      notify_to, language, created_by, created_at)
    VALUES (@id, @status, @mode, @client_name, @usdot, @dba, @commands_json,
            @notify_to, @language, @created_by, @created_at)
  `);
  const selectById = db.prepare(`SELECT * FROM jobs WHERE id = ?`);
  const selectAll = db.prepare(`SELECT * FROM jobs ORDER BY created_at DESC, rowid DESC`);
  const selectOldestQueued = db.prepare(
    `SELECT * FROM jobs WHERE status = 'queued' ORDER BY created_at ASC, rowid ASC LIMIT 1`
  );
  const setProcessing = db.prepare(
    `UPDATE jobs SET status = 'processing', started_at = @started_at WHERE id = @id`
  );
  const setDone = db.prepare(`
    UPDATE jobs SET status = 'done', result_summary = @summary,
      result_files_json = @files, finished_at = @finished_at WHERE id = @id
  `);
  const setFailed = db.prepare(`
    UPDATE jobs SET status = 'failed', error_message = @error,
      result_summary = @summary, result_files_json = @files, finished_at = @finished_at
    WHERE id = @id
  `);
  const setStuckNeedsReview = db.prepare(
    `UPDATE jobs SET status = 'needs_review' WHERE status = 'processing'`
  );

  const now = () => new Date().toISOString();

  const claim = db.transaction((): Job | null => {
    const row = selectOldestQueued.get() as Row | undefined;
    if (!row) return null;
    setProcessing.run({ id: row.id, started_at: now() });
    return rowToJob(selectById.get(row.id) as Row);
  });

  return {
    createJob(input: JobInput): Job {
      const id = randomUUID();
      const createdAt = now();
      insert.run({
        id,
        status: 'queued',
        mode: input.mode,
        client_name: input.clientName,
        usdot: input.usdot ?? null,
        dba: input.dba ?? null,
        commands_json: JSON.stringify(input.commands),
        notify_to: input.notifyTo,
        language: input.language,
        created_by: input.createdBy,
        created_at: createdAt,
      });
      return rowToJob(selectById.get(id) as Row);
    },
    claimNextQueued(): Job | null {
      return claim();
    },
    completeJob(id, summary, files): void {
      setDone.run({ id, summary, files: JSON.stringify(files), finished_at: now() });
    },
    failJob(id, errorMessage, summary, files): void {
      setFailed.run({ id, error: errorMessage, summary, files: JSON.stringify(files), finished_at: now() });
    },
    getJob(id): Job | null {
      const row = selectById.get(id) as Row | undefined;
      return row ? rowToJob(row) : null;
    },
    listJobs(): Job[] {
      return (selectAll.all() as Row[]).map(rowToJob);
    },
    markStuckProcessingAsNeedsReview(): number {
      return setStuckNeedsReview.run().changes;
    },
    close(): void {
      db.close();
    },
  };
}
