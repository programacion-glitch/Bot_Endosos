import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import CommandForm, { defaultCommand } from './CommandForm';

describe('CommandForm', () => {
  it('defaultCommand crea un ADD_VEHICLE vacío con los campos esperados', () => {
    const cmd = defaultCommand('ADD_VEHICLE');
    expect(cmd.type).toBe('ADD_VEHICLE');
    expect(cmd).toHaveProperty('vin', '');
    expect(cmd).toHaveProperty('effectiveDate', '');
  });

  it('editar el VIN de un ADD_VEHICLE emite el comando actualizado', () => {
    const onChange = vi.fn();
    render(<CommandForm value={defaultCommand('ADD_VEHICLE')} onChange={onChange} />);
    const vin = screen.getByLabelText(/VIN/i);
    fireEvent.change(vin, { target: { value: '4V4NC9TG97N436292' } });
    expect(onChange).toHaveBeenCalled();
    const last = onChange.mock.calls.at(-1)![0];
    expect(last).toMatchObject({ type: 'ADD_VEHICLE', vin: '4V4NC9TG97N436292' });
  });

  it('NO_CHANGE no muestra campos de VIN', () => {
    render(<CommandForm value={defaultCommand('NO_CHANGE')} onChange={() => {}} />);
    expect(screen.queryByLabelText(/VIN/i)).toBeNull();
  });

  it('REMOVE_HOLDER edita holderName', () => {
    const onChange = vi.fn();
    render(<CommandForm value={defaultCommand('REMOVE_HOLDER')} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText(/Holder/i), { target: { value: 'ACME LLC' } });
    expect(onChange.mock.calls.at(-1)![0]).toMatchObject({ type: 'REMOVE_HOLDER', holderName: 'ACME LLC' });
  });

  it('UPDATE_POLICY_NUMBER cambia policyType y número', () => {
    const onChange = vi.fn();
    render(<CommandForm value={defaultCommand('UPDATE_POLICY_NUMBER')} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText(/Nuevo n[uú]mero/i), { target: { value: 'X-99' } });
    expect(onChange.mock.calls.at(-1)![0]).toMatchObject({ type: 'UPDATE_POLICY_NUMBER', newPolicyNumber: 'X-99' });
  });

  it('ADD_ADDITIONAL_INSURED edita holder.name y togglea póliza AL', () => {
    const onChange = vi.fn();
    render(<CommandForm value={defaultCommand('ADD_ADDITIONAL_INSURED')} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText(/Nombre del holder/i), { target: { value: 'RXO LLC' } });
    fireEvent.click(screen.getByLabelText('AL'));
    const last = onChange.mock.calls.at(-1)![0];
    expect(last.holder.name).toBe('RXO LLC');
    expect(last.policies).toContain('AL');
  });
});
