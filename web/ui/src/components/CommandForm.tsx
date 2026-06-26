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

export default function CommandForm({ value, onChange }: { value: UICommand; onChange: (c: UICommand) => void }) {
  const set = (patch: Partial<UICommand>) => onChange({ ...value, ...patch } as UICommand);

  if (value.type === 'NO_CHANGE') {
    return <p style={{ color: 'var(--h2o-gray)', margin: 0 }}>Responde "Recibido" sin modificar nada.</p>;
  }

  return (
    <>
      <div className="field">
        <label htmlFor="cmd-vin">VIN</label>
        <input id="cmd-vin" value={value.vin} onChange={e => set({ vin: e.target.value })} />
      </div>

      {value.type === 'ADD_VEHICLE' && (
        <>
          <div className="row">
            <div className="field" style={{ flex: 1 }}>
              <label htmlFor="cmd-year">Año</label>
              <input id="cmd-year" value={value.year} onChange={e => set({ year: e.target.value })} placeholder="2007" />
            </div>
            <div className="field" style={{ flex: 2 }}>
              <label htmlFor="cmd-desc">Descripción</label>
              <input id="cmd-desc" value={value.description} onChange={e => set({ description: e.target.value })} placeholder="VOLVO" />
            </div>
          </div>
          <div className="row">
            <div className="field" style={{ flex: 1 }}>
              <label htmlFor="cmd-value">Valor (opcional)</label>
              <input id="cmd-value" value={value.value ?? ''} onChange={e => set({ value: e.target.value })} placeholder="$15,000" />
            </div>
            <div className="field" style={{ flex: 1 }}>
              <label htmlFor="cmd-effdate">Effective Date</label>
              <input id="cmd-effdate" value={value.effectiveDate} onChange={e => set({ effectiveDate: e.target.value })} placeholder="03/05/2026" />
            </div>
          </div>
        </>
      )}

      {value.type === 'UPDATE_VEHICLE_VALUE' && (
        <div className="field">
          <label htmlFor="cmd-newvalue">Nuevo valor</label>
          <input id="cmd-newvalue" value={value.value} onChange={e => set({ value: e.target.value })} placeholder="15,000" />
        </div>
      )}
    </>
  );
}
