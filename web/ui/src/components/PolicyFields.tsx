import { PolicyType } from '../types';

const POLICY_TYPES: PolicyType[] = ['AL', 'MTC', 'APD', 'GL', 'WC', 'EXL', 'NTL'];

type CoverageKeys =
  | 'limit' | 'deductible' | 'eachOccurrence' | 'damageToRentedPremises' | 'medExp'
  | 'personalAdvInjury' | 'generalAggregate' | 'productsCompOpAgg'
  | 'elEachAccident' | 'elDiseaseEaEmployee' | 'elDiseasePolicyLimit' | 'aggregate';
type AutoKeys = 'anyAuto' | 'allOwnedAutos' | 'scheduledAutos' | 'hiredAutos' | 'nonOwnedAutos';

export interface PolicyFieldsValue {
  policyType: PolicyType;
  limit?: string; deductible?: string; eachOccurrence?: string; damageToRentedPremises?: string;
  medExp?: string; personalAdvInjury?: string; generalAggregate?: string; productsCompOpAgg?: string;
  elEachAccident?: string; elDiseaseEaEmployee?: string; elDiseasePolicyLimit?: string; aggregate?: string;
  anyAuto?: boolean; allOwnedAutos?: boolean; scheduledAutos?: boolean; hiredAutos?: boolean; nonOwnedAutos?: boolean;
}

const AUTO_LABELS: Record<AutoKeys, string> = {
  anyAuto: 'Any Auto',
  allOwnedAutos: 'All Owned Autos',
  scheduledAutos: 'Scheduled Autos',
  hiredAutos: 'Hired Autos',
  nonOwnedAutos: 'Non-Owned Autos',
};

function Txt({ id, label, val, on }: { id: string; label: string; val?: string; on: (v: string) => void }) {
  return (
    <div className="field" style={{ flex: 1, minWidth: 180 }}>
      <label htmlFor={id}>{label}</label>
      <input id={id} value={val ?? ''} onChange={e => on(e.target.value)} />
    </div>
  );
}

export function PolicyFields({ instanceId, value, onChange, showAutos }: {
  instanceId: number;
  value: PolicyFieldsValue;
  onChange: (patch: Partial<PolicyFieldsValue>) => void;
  showAutos: boolean;
}) {
  const t = value.policyType;
  const txt = (k: CoverageKeys, label: string) => (
    <Txt
      id={`cmd-${instanceId}-${k}`}
      label={label}
      val={value[k]}
      on={v => onChange({ [k]: v } as Partial<PolicyFieldsValue>)}
    />
  );

  return (
    <>
      <div className="field">
        <label htmlFor={`cmd-${instanceId}-ptype`}>Tipo de póliza</label>
        <select
          id={`cmd-${instanceId}-ptype`}
          value={t}
          onChange={e => onChange({ policyType: e.target.value as PolicyType })}
        >
          {POLICY_TYPES.map(p => <option key={p} value={p}>{p}</option>)}
        </select>
      </div>

      {(t === 'AL' || t === 'NTL') && (
        <>
          {showAutos && (
            <div className="field">
              <label>Autos</label>
              <div className="row">
                {(Object.keys(AUTO_LABELS) as AutoKeys[]).map(k => (
                  <label
                    key={k}
                    htmlFor={`cmd-${instanceId}-${k}`}
                    style={{ display: 'flex', gap: 6, alignItems: 'center', fontWeight: 400 }}
                  >
                    <input
                      id={`cmd-${instanceId}-${k}`}
                      type="checkbox"
                      style={{ width: 'auto' }}
                      checked={!!value[k]}
                      onChange={e => onChange({ [k]: e.target.checked } as Partial<PolicyFieldsValue>)}
                      aria-label={AUTO_LABELS[k]}
                    />
                    {AUTO_LABELS[k]}
                  </label>
                ))}
              </div>
            </div>
          )}
          <div className="row">{txt('limit', 'Límite (CSL)')}{txt('deductible', 'Deducible')}</div>
        </>
      )}

      {t === 'GL' && (
        <>
          <div className="row">
            {txt('eachOccurrence', 'Each Occurrence')}
            {txt('generalAggregate', 'General Aggregate')}
          </div>
          <div className="row">
            {txt('productsCompOpAgg', 'Products-Comp/Op Agg')}
            {txt('personalAdvInjury', 'Personal & Adv Injury')}
          </div>
          <div className="row">
            {txt('damageToRentedPremises', 'Damage to Rented Premises')}
            {txt('medExp', 'Med Exp')}
          </div>
          <div className="row">{txt('deductible', 'Deducible')}</div>
        </>
      )}

      {t === 'WC' && (
        <div className="row">
          {txt('elEachAccident', 'E.L. Each Accident')}
          {txt('elDiseaseEaEmployee', 'E.L. Disease - EA Employee')}
          {txt('elDiseasePolicyLimit', 'E.L. Disease - Policy Limit')}
        </div>
      )}

      {t === 'EXL' && (
        <div className="row">
          {txt('eachOccurrence', 'Each Occurrence')}
          {txt('aggregate', 'Aggregate')}
        </div>
      )}

      {(t === 'MTC' || t === 'APD') && (
        <div className="row">
          {txt('limit', 'Límite')}
          {txt('deductible', 'Deducible')}
        </div>
      )}
    </>
  );
}
