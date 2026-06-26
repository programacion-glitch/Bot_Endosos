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
});
