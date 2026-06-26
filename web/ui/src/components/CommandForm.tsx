import { CommandType, UICommand } from '../types';

export function defaultCommand(type: CommandType): UICommand {
  switch (type) {
    case 'ADD_VEHICLE':
      return { type, rawText: '', vin: '', year: '', description: '', value: '', effectiveDate: '' };
    case 'UPDATE_VEHICLE_VALUE':
      return { type, rawText: '', vin: '', value: '' };
    case 'DELETE_VEHICLE_VALUE':
      return { type, rawText: '', vin: '' };
    case 'NO_CHANGE':
      return { type, rawText: '' };
  }
}

export const COMMAND_LABELS: Record<CommandType, string> = {
  ADD_VEHICLE: 'Agregar vehículo',
  UPDATE_VEHICLE_VALUE: 'Actualizar valor de vehículo',
  DELETE_VEHICLE_VALUE: 'Borrar valor de vehículo',
  NO_CHANGE: 'Sin cambios (Recibido)',
};

export default function CommandForm({ value, onChange, instanceId = 0 }:
  { value: UICommand; onChange: (c: UICommand) => void; instanceId?: number }) {
  const set = (patch: Partial<UICommand>) => onChange({ ...value, ...patch } as UICommand);

  if (value.type === 'NO_CHANGE') {
    return <p style={{ color: 'var(--h2o-gray)', margin: 0 }}>Responde "Recibido" sin modificar nada.</p>;
  }

  return (
    <>
      <div className="field">
        <label htmlFor={`cmd-${instanceId}-vin`}>VIN</label>
        <input id={`cmd-${instanceId}-vin`} value={value.vin} onChange={e => set({ vin: e.target.value })} />
      </div>

      {value.type === 'ADD_VEHICLE' && (
        <>
          <div className="row">
            <div className="field" style={{ flex: 1 }}>
              <label htmlFor={`cmd-${instanceId}-year`}>Año</label>
              <input id={`cmd-${instanceId}-year`} value={value.year} onChange={e => set({ year: e.target.value })} placeholder="2007" />
            </div>
            <div className="field" style={{ flex: 2 }}>
              <label htmlFor={`cmd-${instanceId}-desc`}>Descripción</label>
              <input id={`cmd-${instanceId}-desc`} value={value.description} onChange={e => set({ description: e.target.value })} placeholder="VOLVO" />
            </div>
          </div>
          <div className="row">
            <div className="field" style={{ flex: 1 }}>
              <label htmlFor={`cmd-${instanceId}-value`}>Valor (opcional)</label>
              <input id={`cmd-${instanceId}-value`} value={value.value ?? ''} onChange={e => set({ value: e.target.value })} placeholder="$15,000" />
            </div>
            <div className="field" style={{ flex: 1 }}>
              <label htmlFor={`cmd-${instanceId}-effdate`}>Effective Date</label>
              <input id={`cmd-${instanceId}-effdate`} value={value.effectiveDate} onChange={e => set({ effectiveDate: e.target.value })} placeholder="03/05/2026" />
            </div>
          </div>
        </>
      )}

      {value.type === 'UPDATE_VEHICLE_VALUE' && (
        <div className="field">
          <label htmlFor={`cmd-${instanceId}-newvalue`}>Nuevo valor</label>
          <input id={`cmd-${instanceId}-newvalue`} value={value.value} onChange={e => set({ value: e.target.value })} placeholder="15,000" />
        </div>
      )}
    </>
  );
}
