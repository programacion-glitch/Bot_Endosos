import { CommandType, PolicyType, UICommand, UIDriver, UIHolder } from '../types';

const emptyHolder = (): UIHolder => ({ name: '', address: '', note: '' });

export function defaultCommand(type: CommandType): UICommand {
  switch (type) {
    case 'NO_CHANGE': return { type, rawText: '' };
    case 'CREATE_MASTER': return { type, rawText: '' };
    case 'ADD_VEHICLE': return { type, rawText: '', vin: '', year: '', description: '', value: '', effectiveDate: '' };
    case 'REMOVE_VEHICLE': return { type, rawText: '', vin: '', year: '', description: '', value: '', effectiveDate: '' };
    case 'UPDATE_VEHICLE_VALUE': return { type, rawText: '', vin: '', value: '' };
    case 'DELETE_VEHICLE_VALUE': return { type, rawText: '', vin: '' };
    case 'REMOVE_DRIVER': return { type, rawText: '', driver: { firstName: '', lastName: '', cdl: '', cdlState: '', dob: '' } };
    case 'REMOVE_HOLDER': return { type, rawText: '', holderName: '' };
    case 'ADD_NOTE_TO_MASTER': return { type, rawText: '', note: '' };
    case 'UPDATE_MAILING_ADDRESS': return { type, rawText: '', address: '' };
    case 'UPDATE_POLICY_NUMBER': return { type, rawText: '', policyType: 'AL', newPolicyNumber: '' };
    case 'ADD_ADDITIONAL_INSURED': return { type, rawText: '', policies: [], holder: emptyHolder() };
    case 'ADD_WAIVER_SUBROGATION': return { type, rawText: '', policies: [], holder: emptyHolder() };
    case 'ADD_AI_AND_WOS': return { type, rawText: '', policies: [], holder: emptyHolder() };
    case 'ADD_NOTE_TO_HOLDER': return { type, rawText: '', holder: emptyHolder() };
    case 'ADD_LOSS_PAYEE': return { type, rawText: '', vin: '', holder: emptyHolder() };
    case 'UPDATE_HOLDER': return { type, rawText: '', holderName: '', updateTo: '', note: '' };
    case 'UPDATE_LP_HOLDER': return { type, rawText: '', vin: '', holderName: '', updateTo: '', note: '' };
    case 'ADD_POLICY': return { type, rawText: '', policyType: 'AL', carrier: '', mga: '', policyNumber: '', effectiveDate: '', expirationDate: '' };
    case 'UPDATE_LIMIT_DEDUCTIBLE': return { type, rawText: '', policyType: 'AL' };
    case 'CREATE_INSURED': return { type, rawText: '', name: '', dba: '', address: '', usdot: '', drivers: [], phone: '', email: '', secondaryEmail: '' };
  }
}

export const COMMAND_LABELS: Record<CommandType, string> = {
  NO_CHANGE: 'Sin cambios (Recibido)', CREATE_MASTER: 'Crear Master',
  ADD_VEHICLE: 'Agregar vehículo', REMOVE_VEHICLE: 'Quitar vehículo',
  UPDATE_VEHICLE_VALUE: 'Actualizar valor de vehículo', DELETE_VEHICLE_VALUE: 'Borrar valor de vehículo',
  REMOVE_DRIVER: 'Quitar driver', REMOVE_HOLDER: 'Quitar holder',
  ADD_NOTE_TO_MASTER: 'Nota al Master', UPDATE_MAILING_ADDRESS: 'Actualizar dirección',
  UPDATE_POLICY_NUMBER: 'Actualizar número de póliza',
  ADD_ADDITIONAL_INSURED: 'Additional Insured', ADD_WAIVER_SUBROGATION: 'Waiver of Subrogation',
  ADD_AI_AND_WOS: 'AI & WOS', ADD_NOTE_TO_HOLDER: 'Nota al holder',
  ADD_LOSS_PAYEE: 'Loss Payee', UPDATE_HOLDER: 'Actualizar holder', UPDATE_LP_HOLDER: 'Actualizar LP holder',
  ADD_POLICY: 'Agregar póliza', UPDATE_LIMIT_DEDUCTIBLE: 'Actualizar límite/deducible',
  CREATE_INSURED: 'Crear asegurado (cliente nuevo)',
};

export default function CommandForm({ value, onChange, instanceId = 0 }:
  { value: UICommand; onChange: (c: UICommand) => void; instanceId?: number }) {
  const set = (patch: Partial<UICommand>) => onChange({ ...value, ...patch } as UICommand);

  switch (value.type) {
    case 'NO_CHANGE':
      return <p style={{ color: 'var(--h2o-gray)', margin: 0 }}>Responde "Recibido" sin modificar nada.</p>;

    case 'ADD_VEHICLE':
    case 'REMOVE_VEHICLE':
      return (
        <>
          <div className="field">
            <label htmlFor={`cmd-${instanceId}-vin`}>VIN</label>
            <input id={`cmd-${instanceId}-vin`} value={value.vin} onChange={e => set({ vin: e.target.value })} />
          </div>
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
      );

    case 'UPDATE_VEHICLE_VALUE':
      return (
        <>
          <div className="field">
            <label htmlFor={`cmd-${instanceId}-vin`}>VIN</label>
            <input id={`cmd-${instanceId}-vin`} value={value.vin} onChange={e => set({ vin: e.target.value })} />
          </div>
          <div className="field">
            <label htmlFor={`cmd-${instanceId}-newvalue`}>Nuevo valor</label>
            <input id={`cmd-${instanceId}-newvalue`} value={value.value} onChange={e => set({ value: e.target.value })} placeholder="15,000" />
          </div>
        </>
      );

    case 'DELETE_VEHICLE_VALUE':
      return (
        <div className="field">
          <label htmlFor={`cmd-${instanceId}-vin`}>VIN</label>
          <input id={`cmd-${instanceId}-vin`} value={value.vin} onChange={e => set({ vin: e.target.value })} />
        </div>
      );

    case 'CREATE_MASTER':
      return <p style={{ color: 'var(--h2o-gray)', margin: 0 }}>Crea el certificado master del asegurado.</p>;

    case 'REMOVE_DRIVER': {
      const d = value.driver;
      const setD = (patch: Partial<UIDriver>) => set({ driver: { ...d, ...patch } } as Partial<UICommand>);
      return (
        <div className="row">
          <div className="field" style={{ flex: 1 }}><label htmlFor={`cmd-${instanceId}-fn`}>Nombre</label><input id={`cmd-${instanceId}-fn`} value={d.firstName} onChange={e => setD({ firstName: e.target.value })} /></div>
          <div className="field" style={{ flex: 1 }}><label htmlFor={`cmd-${instanceId}-ln`}>Apellido</label><input id={`cmd-${instanceId}-ln`} value={d.lastName} onChange={e => setD({ lastName: e.target.value })} /></div>
          <div className="field" style={{ flex: 1 }}><label htmlFor={`cmd-${instanceId}-cdl`}>CDL</label><input id={`cmd-${instanceId}-cdl`} value={d.cdl} onChange={e => setD({ cdl: e.target.value })} /></div>
          <div className="field" style={{ flex: 1 }}><label htmlFor={`cmd-${instanceId}-cdls`}>Estado CDL</label><input id={`cmd-${instanceId}-cdls`} value={d.cdlState} onChange={e => setD({ cdlState: e.target.value })} /></div>
        </div>
      );
    }

    case 'REMOVE_HOLDER':
      return (
        <div className="field">
          <label htmlFor={`cmd-${instanceId}-hn`}>Holder</label>
          <input id={`cmd-${instanceId}-hn`} value={value.holderName} onChange={e => set({ holderName: e.target.value })} />
        </div>
      );

    case 'ADD_NOTE_TO_MASTER':
      return (
        <div className="field">
          <label htmlFor={`cmd-${instanceId}-note`}>Nota</label>
          <textarea id={`cmd-${instanceId}-note`} value={value.note} onChange={e => set({ note: e.target.value })} rows={3} />
        </div>
      );

    case 'UPDATE_MAILING_ADDRESS':
      return (
        <div className="field">
          <label htmlFor={`cmd-${instanceId}-addr`}>Nueva dirección</label>
          <input id={`cmd-${instanceId}-addr`} value={value.address} onChange={e => set({ address: e.target.value })} placeholder="555 Estadio Rd, Dallas, TX, 75201" />
        </div>
      );

    case 'UPDATE_POLICY_NUMBER':
      return (
        <div className="row">
          <div className="field" style={{ flex: 1 }}>
            <label htmlFor={`cmd-${instanceId}-pt`}>Tipo de póliza</label>
            <select id={`cmd-${instanceId}-pt`} value={value.policyType} onChange={e => set({ policyType: e.target.value as PolicyType })}>
              {(['AL', 'MTC', 'APD', 'GL', 'WC', 'EXL', 'NTL'] as PolicyType[]).map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <div className="field" style={{ flex: 2 }}>
            <label htmlFor={`cmd-${instanceId}-num`}>Nuevo número</label>
            <input id={`cmd-${instanceId}-num`} value={value.newPolicyNumber} onChange={e => set({ newPolicyNumber: e.target.value })} />
          </div>
        </div>
      );

    default:
      return null;
  }
}
