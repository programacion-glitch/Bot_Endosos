import { z } from 'zod';
import { JobInput } from './jobTypes';

const rawText = z.string().default('');

export const noChangeSchema = z.object({
  type: z.literal('NO_CHANGE'),
  rawText,
});

export const addVehicleSchema = z.object({
  type: z.literal('ADD_VEHICLE'),
  rawText,
  vin: z.string().min(1, 'VIN requerido'),
  year: z.string().regex(/^\d{4}$/, 'Año debe tener 4 dígitos'),
  description: z.string().min(1, 'Descripción requerida'),
  value: z.string().optional(),
  effectiveDate: z.string().min(1, 'Effective Date requerida'),
  usage: z.string().optional(),
});

export const updateVehicleValueSchema = z.object({
  type: z.literal('UPDATE_VEHICLE_VALUE'),
  rawText,
  vin: z.string().min(1, 'VIN requerido'),
  value: z.string().min(1, 'Valor requerido'),
});

export const deleteVehicleValueSchema = z.object({
  type: z.literal('DELETE_VEHICLE_VALUE'),
  rawText,
  vin: z.string().min(1, 'VIN requerido'),
});

export const commandSchema = z.discriminatedUnion('type', [
  noChangeSchema,
  addVehicleSchema,
  updateVehicleValueSchema,
  deleteVehicleValueSchema,
]);

// Fase 1: solo modo existing_client (endosos). new_client + CREATE_INSURED en fase posterior.
export const jobInputSchema = z.object({
  mode: z.literal('existing_client'),
  clientName: z.string().min(1, 'Nombre de cliente requerido'),
  usdot: z.string().optional(),
  dba: z.string().optional(),
  commands: z.array(commandSchema).min(1, 'Se requiere al menos un comando'),
  notifyTo: z.string().email('notifyTo debe ser un email válido'),
  language: z.enum(['es', 'en']),
  createdBy: z.string().min(1, 'createdBy requerido'),
});

// Guard: si jobInputSchema deja de ser asignable a JobInput, esto falla en compilación.
type _SchemaAssignableToJobInput =
  z.infer<typeof jobInputSchema> extends JobInput ? true : never;
const _schemaMatchesJobInput: _SchemaAssignableToJobInput = true;
void _schemaMatchesJobInput;

export function validateJobInput(
  data: unknown
): { ok: true; value: JobInput } | { ok: false; errors: string[] } {
  const parsed = jobInputSchema.safeParse(data);
  if (parsed.success) {
    return { ok: true, value: parsed.data as JobInput };
  }
  return {
    ok: false,
    errors: parsed.error.issues.map(i => `${i.path.join('.') || '(root)'}: ${i.message}`),
  };
}
