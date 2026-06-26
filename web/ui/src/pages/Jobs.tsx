import { useEffect, useState, useCallback } from 'react';
import { api } from '../api';
import { JobSummary } from '../types';

function basename(p: string): string { return p.split(/[\\/]/).pop() || p; }

export default function Jobs() {
  const [jobs, setJobs] = useState<JobSummary[]>([]);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try { setError(''); setJobs(await api.listJobs()); } catch (e) { setError((e as Error).message); }
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const pending = jobs.some(j => j.status === 'queued' || j.status === 'processing');
    if (!pending) return;
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [jobs, load]);

  return (
    <div className="container">
      <h2>Historial de endosos</h2>
      {error && <p className="error">{error}</p>}
      {jobs.length === 0 && <div className="card">Aún no hay endosos.</div>}
      {jobs.map(job => (
        <div className="card" style={{ marginBottom: 12 }} key={job.id}>
          <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <strong>{job.clientName}</strong>{job.usdot ? ` · USDOT ${job.usdot}` : ''}
              <div style={{ fontSize: 12, color: 'var(--h2o-gray)' }}>
                {job.commands.map(c => c.type).join(', ')} · por {job.createdBy} · {new Date(job.createdAt).toLocaleString()}
              </div>
            </div>
            <span className={`badge ${job.status}`}>{job.status}</span>
          </div>
          {job.resultSummary && <pre style={{ whiteSpace: 'pre-wrap', fontSize: 13, marginTop: 8 }}>{job.resultSummary}</pre>}
          {job.errorMessage && <p className="error">{job.errorMessage}</p>}
          {(() => { const files = job.resultFiles ?? []; return files.length > 0 && (
            <div className="row" style={{ marginTop: 8 }}>
              {files.map(f => {
                const name = basename(f);
                return <a key={f} href={`/api/jobs/${job.id}/files/${encodeURIComponent(name)}`}>{name}</a>;
              })}
            </div>
          ); })()}
        </div>
      ))}
    </div>
  );
}
