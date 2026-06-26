import { describe, it, expect } from 'vitest';
import { validateJobInput } from './schemas';

const baseJob = {
  mode: 'existing_client',
  clientName: 'Pix Test 2 2026 - 2027',
  usdot: '1234567',
  notifyTo: 'agente@h2oins.com',
  language: 'es',
  createdBy: 'maria',
  commands: [
    { type: 'UPDATE_VEHICLE_VALUE', rawText: '', vin: '4V4NC9TG97N436292', value: '15,000' },
  ],
};

describe('validateJobInput', () => {
  it('acepta un job válido de existing_client', () => {
    const res = validateJobInput(baseJob);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.value.commands).toHaveLength(1);
  });

  it('rechaza un comando ADD_VEHICLE con año inválido', () => {
    const res = validateJobInput({
      ...baseJob,
      commands: [{ type: 'ADD_VEHICLE', rawText: '', vin: 'ABC', year: '07', description: 'VOLVO', effectiveDate: '03/05/2026' }],
    });
    expect(res.ok).toBe(false);
  });

  it('rechaza un job sin comandos', () => {
    const res = validateJobInput({ ...baseJob, commands: [] });
    expect(res.ok).toBe(false);
  });

  it('rechaza notifyTo no-email', () => {
    const res = validateJobInput({ ...baseJob, notifyTo: 'no-es-email' });
    expect(res.ok).toBe(false);
  });

  it('rechaza un tipo de comando fuera del subset (CREATE_INSURED en Fase 1)', () => {
    const res = validateJobInput({
      ...baseJob,
      commands: [{ type: 'CREATE_INSURED', rawText: '' }],
    });
    expect(res.ok).toBe(false);
  });

  it('acepta REMOVE_VEHICLE válido', () => {
    const res = validateJobInput({ ...baseJob, commands: [{ type: 'REMOVE_VEHICLE', rawText: '', vin: 'V1', year: '2007', description: 'VOLVO', effectiveDate: '03/05/2026' }] });
    expect(res.ok).toBe(true);
  });

  it('acepta CREATE_MASTER y UPDATE_MAILING_ADDRESS', () => {
    const res = validateJobInput({ ...baseJob, commands: [{ type: 'CREATE_MASTER', rawText: '' }, { type: 'UPDATE_MAILING_ADDRESS', rawText: '', address: '123 Main' }] });
    expect(res.ok).toBe(true);
  });

  it('rechaza UPDATE_POLICY_NUMBER con policyType inválido', () => {
    const res = validateJobInput({ ...baseJob, commands: [{ type: 'UPDATE_POLICY_NUMBER', rawText: '', policyType: 'ZZ', newPolicyNumber: 'X-1' }] });
    expect(res.ok).toBe(false);
  });

  it('acepta REMOVE_DRIVER (dob opcional)', () => {
    const res = validateJobInput({ ...baseJob, commands: [{ type: 'REMOVE_DRIVER', rawText: '', driver: { firstName: 'Juan', lastName: 'Perez', cdl: 'TX1', cdlState: 'TX' } }] });
    expect(res.ok).toBe(true);
  });

  // ── Grupo holder / loss-payee (Fase 3 – Task 2) ───────────────────────────

  const holder = { name: 'Holder LLC', address: '500 Market St, Houston, TX, 77002', note: 'As per contract' };

  it('acepta ADD_ADDITIONAL_INSURED con holder y policies', () => {
    const res = validateJobInput({ ...baseJob, commands: [{ type: 'ADD_ADDITIONAL_INSURED', rawText: '', policies: ['AL', 'GL'], holder }] });
    expect(res.ok).toBe(true);
  });

  it('rechaza AI sin holder.name', () => {
    const res = validateJobInput({ ...baseJob, commands: [{ type: 'ADD_ADDITIONAL_INSURED', rawText: '', policies: ['AL'], holder: { name: '', address: 'x' } }] });
    expect(res.ok).toBe(false);
  });

  it('acepta ADD_LOSS_PAYEE y UPDATE_HOLDER', () => {
    const res = validateJobInput({ ...baseJob, commands: [
      { type: 'ADD_LOSS_PAYEE', rawText: '', vin: 'V1', holder },
      { type: 'UPDATE_HOLDER', rawText: '', holderName: 'Old LLC', updateTo: 'New LLC' },
    ] });
    expect(res.ok).toBe(true);
  });

  // ── Pólizas (Fase 3 – Task 3) ─────────────────────────────────────────────

  it('acepta ADD_POLICY AL con scheduledAutos', () => {
    const res = validateJobInput({ ...baseJob, commands: [{ type: 'ADD_POLICY', rawText: '', policyType: 'AL', carrier: 'County Hall', mga: 'County Hall RRG', policyNumber: 'Fake-5445', effectiveDate: '03/05/2026', expirationDate: '03/05/2027', limit: '$500,000', scheduledAutos: true }] });
    expect(res.ok).toBe(true);
  });

  it('rechaza ADD_POLICY sin carrier', () => {
    const res = validateJobInput({ ...baseJob, commands: [{ type: 'ADD_POLICY', rawText: '', policyType: 'AL', carrier: '', mga: 'm', policyNumber: 'p', effectiveDate: 'd', expirationDate: 'd' }] });
    expect(res.ok).toBe(false);
  });

  it('acepta UPDATE_LIMIT_DEDUCTIBLE', () => {
    const res = validateJobInput({ ...baseJob, commands: [{ type: 'UPDATE_LIMIT_DEDUCTIBLE', rawText: '', policyType: 'GL', eachOccurrence: '$1,000,000' }] });
    expect(res.ok).toBe(true);
  });
});
