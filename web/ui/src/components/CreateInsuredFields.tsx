import { UIDriver } from '../types';

export interface CreateInsuredValue {
  name: string; dba?: string; address: string; usdot: string; drivers: UIDriver[]; phone: string; email: string; secondaryEmail?: string;
}

const emptyDriver = (): UIDriver => ({ firstName: '', lastName: '', cdl: '', cdlState: '', dob: '' });

export function CreateInsuredFields({ instanceId, value, onChange }: { instanceId: number; value: CreateInsuredValue; onChange: (patch: Partial<CreateInsuredValue>) => void }) {
  const setDriver = (i: number, patch: Partial<UIDriver>) => onChange({ drivers: value.drivers.map((d, j) => (j === i ? { ...d, ...patch } : d)) });
  const addDriver = () => onChange({ drivers: [...value.drivers, emptyDriver()] });
  const removeDriver = (i: number) => onChange({ drivers: value.drivers.filter((_, j) => j !== i) });
  return (
    <>
      <div className="row">
        <div className="field" style={{ flex: 2 }}><label htmlFor={`cmd-${instanceId}-iname`}>Nombre del asegurado</label><input id={`cmd-${instanceId}-iname`} value={value.name} onChange={e => onChange({ name: e.target.value })} /></div>
        <div className="field" style={{ flex: 1 }}><label htmlFor={`cmd-${instanceId}-idba`}>DBA (opcional)</label><input id={`cmd-${instanceId}-idba`} value={value.dba ?? ''} onChange={e => onChange({ dba: e.target.value || undefined })} /></div>
      </div>
      <div className="field"><label htmlFor={`cmd-${instanceId}-iaddr`}>Dirección</label><input id={`cmd-${instanceId}-iaddr`} value={value.address} onChange={e => onChange({ address: e.target.value })} placeholder="123 Main St, Dallas, TX, 75201" /></div>
      <div className="row">
        <div className="field" style={{ flex: 1 }}><label htmlFor={`cmd-${instanceId}-iusdot`}>USDOT</label><input id={`cmd-${instanceId}-iusdot`} value={value.usdot} onChange={e => onChange({ usdot: e.target.value })} /></div>
        <div className="field" style={{ flex: 1 }}><label htmlFor={`cmd-${instanceId}-iphone`}>Teléfono</label><input id={`cmd-${instanceId}-iphone`} value={value.phone} onChange={e => onChange({ phone: e.target.value })} /></div>
      </div>
      <div className="row">
        <div className="field" style={{ flex: 1 }}><label htmlFor={`cmd-${instanceId}-iemail`}>Email</label><input id={`cmd-${instanceId}-iemail`} value={value.email} onChange={e => onChange({ email: e.target.value })} /></div>
        <div className="field" style={{ flex: 1 }}><label htmlFor={`cmd-${instanceId}-iemail2`}>Email secundario (opcional)</label><input id={`cmd-${instanceId}-iemail2`} value={value.secondaryEmail ?? ''} onChange={e => onChange({ secondaryEmail: e.target.value || undefined })} /></div>
      </div>
      <div className="field">
        <label>Drivers</label>
        {value.drivers.map((d, i) => (
          <div className="row" key={i} style={{ alignItems: 'flex-end' }}>
            <div className="field" style={{ flex: 1 }}><label htmlFor={`cmd-${instanceId}-d${i}-fn`}>Nombre</label><input id={`cmd-${instanceId}-d${i}-fn`} value={d.firstName} onChange={e => setDriver(i, { firstName: e.target.value })} /></div>
            <div className="field" style={{ flex: 1 }}><label htmlFor={`cmd-${instanceId}-d${i}-ln`}>Apellido</label><input id={`cmd-${instanceId}-d${i}-ln`} value={d.lastName} onChange={e => setDriver(i, { lastName: e.target.value })} /></div>
            <div className="field" style={{ flex: 1 }}><label htmlFor={`cmd-${instanceId}-d${i}-cdl`}>CDL</label><input id={`cmd-${instanceId}-d${i}-cdl`} value={d.cdl} onChange={e => setDriver(i, { cdl: e.target.value })} /></div>
            <div className="field" style={{ flex: 1 }}><label htmlFor={`cmd-${instanceId}-d${i}-st`}>Estado</label><input id={`cmd-${instanceId}-d${i}-st`} value={d.cdlState} onChange={e => setDriver(i, { cdlState: e.target.value })} /></div>
            <div className="field" style={{ flex: 1 }}><label htmlFor={`cmd-${instanceId}-d${i}-dob`}>DOB</label><input id={`cmd-${instanceId}-d${i}-dob`} value={d.dob} onChange={e => setDriver(i, { dob: e.target.value })} placeholder="01/15/1988" /></div>
            <button type="button" className="secondary" onClick={() => removeDriver(i)}>Quitar</button>
          </div>
        ))}
        <button type="button" className="secondary" onClick={addDriver}>+ Agregar driver</button>
      </div>
    </>
  );
}
