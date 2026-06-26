import { UIHolder } from '../types';

const POLICY_OPTIONS = ['AL', 'GL', 'WC', 'MTC', 'APD', 'EXL'];

export function PolicyPicker({ instanceId, value, onChange }: { instanceId: number; value: string[]; onChange: (p: string[]) => void }) {
  const toggle = (p: string) => onChange(value.includes(p) ? value.filter(x => x !== p) : [...value, p]);
  return (
    <div className="field">
      <label>Pólizas</label>
      <div className="row">
        {POLICY_OPTIONS.map(p => (
          <label key={p} htmlFor={`cmd-${instanceId}-pol-${p}`} style={{ display: 'flex', gap: 6, alignItems: 'center', fontWeight: 400 }}>
            <input id={`cmd-${instanceId}-pol-${p}`} type="checkbox" style={{ width: 'auto' }} checked={value.includes(p)} onChange={() => toggle(p)} aria-label={p} />
            {p}
          </label>
        ))}
      </div>
    </div>
  );
}

export function HolderFields({ instanceId, value, onChange }: { instanceId: number; value: UIHolder; onChange: (h: UIHolder) => void }) {
  const set = (patch: Partial<UIHolder>) => onChange({ ...value, ...patch });
  return (
    <>
      <div className="field"><label htmlFor={`cmd-${instanceId}-hname`}>Nombre del holder</label><input id={`cmd-${instanceId}-hname`} value={value.name} onChange={e => set({ name: e.target.value })} /></div>
      <div className="field"><label htmlFor={`cmd-${instanceId}-haddr`}>Dirección del holder</label><input id={`cmd-${instanceId}-haddr`} value={value.address} onChange={e => set({ address: e.target.value })} placeholder="500 Market St, Houston, TX, 77002" /></div>
      <div className="field"><label htmlFor={`cmd-${instanceId}-hnote`}>Nota (opcional)</label><textarea id={`cmd-${instanceId}-hnote`} value={value.note ?? ''} onChange={e => set({ note: e.target.value })} rows={2} /></div>
    </>
  );
}
