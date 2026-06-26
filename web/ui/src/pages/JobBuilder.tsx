import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CommandType, UICommand, JobInputUI } from '../types';
import { api } from '../api';
import CommandForm, { defaultCommand, COMMAND_LABELS } from '../components/CommandForm';

const TYPES: CommandType[] = ['ADD_VEHICLE', 'UPDATE_VEHICLE_VALUE', 'DELETE_VEHICLE_VALUE', 'NO_CHANGE'];

export default function JobBuilder() {
  const [clientName, setClientName] = useState('');
  const [usdot, setUsdot] = useState('');
  const [notifyTo, setNotifyTo] = useState('');
  const [language, setLanguage] = useState<'es' | 'en'>('es');
  const [commands, setCommands] = useState<UICommand[]>([defaultCommand('ADD_VEHICLE')]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const nav = useNavigate();

  const updateCmd = (i: number, c: UICommand) => setCommands(cs => cs.map((x, j) => (j === i ? c : x)));
  const removeCmd = (i: number) => setCommands(cs => cs.filter((_, j) => j !== i));
  const addCmd = (t: CommandType) => setCommands(cs => [...cs, defaultCommand(t)]);

  const canSubmit = clientName.trim() && notifyTo.trim() && commands.length > 0;

  async function submit() {
    setBusy(true); setError('');
    const job: JobInputUI = {
      mode: 'existing_client',
      clientName: clientName.trim(),
      usdot: usdot.trim() || undefined,
      notifyTo: notifyTo.trim(),
      language,
      commands,
    };
    try {
      const { id } = await api.createJob(job);
      nav(`/jobs?new=${id}`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="container">
      <div className="card" style={{ marginBottom: 16 }}>
        <h2 style={{ marginTop: 0 }}>Nuevo endoso</h2>
        <div className="row">
          <div className="field" style={{ flex: 2 }}>
            <label>Cliente (nombre en NowCerts)</label>
            <input value={clientName} onChange={e => setClientName(e.target.value)} />
          </div>
          <div className="field" style={{ flex: 1 }}>
            <label>USDOT (opcional)</label>
            <input value={usdot} onChange={e => setUsdot(e.target.value)} />
          </div>
        </div>
        <div className="row">
          <div className="field" style={{ flex: 2 }}>
            <label>Notificar a (email)</label>
            <input value={notifyTo} onChange={e => setNotifyTo(e.target.value)} placeholder="agente@h2oins.com" />
          </div>
          <div className="field" style={{ flex: 1 }}>
            <label>Idioma</label>
            <select value={language} onChange={e => setLanguage(e.target.value as 'es' | 'en')}>
              <option value="es">Español</option>
              <option value="en">English</option>
            </select>
          </div>
        </div>
      </div>

      {commands.map((c, i) => (
        <div className="card" style={{ marginBottom: 12 }} key={i}>
          <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <strong>{COMMAND_LABELS[c.type]}</strong>
            <button className="secondary" onClick={() => removeCmd(i)} disabled={commands.length === 1}>Quitar</button>
          </div>
          <CommandForm value={c} onChange={cmd => updateCmd(i, cmd)} />
        </div>
      ))}

      <div className="card">
        <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--h2o-gray)' }}>Agregar acción</label>
        <div className="row" style={{ marginTop: 8 }}>
          {TYPES.map(t => (
            <button key={t} className="secondary" onClick={() => addCmd(t)}>+ {COMMAND_LABELS[t]}</button>
          ))}
        </div>
        {error && <p className="error" style={{ marginTop: 12 }}>{error}</p>}
        <div style={{ marginTop: 16 }}>
          <button onClick={submit} disabled={!canSubmit || busy}>
            {busy ? 'Enviando…' : 'Enviar endoso'}
          </button>
        </div>
      </div>
    </div>
  );
}
