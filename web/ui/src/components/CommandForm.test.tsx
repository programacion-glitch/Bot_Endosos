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
});
