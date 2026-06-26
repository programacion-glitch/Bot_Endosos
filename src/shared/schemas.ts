import { z } from 'zod';
import { JobInput } from './jobTypes';

const rawText = z.string().default('');

export const policyTypeSchema = z.enum(['AL', 'MTC', 'APD', 'GL', 'WC', 'EXL', 'NTL']);

export const driverSchema = z.object({
  firstName: z.string().min(1, 'Nombre requerido'),
  lastName: z.string().min(1, 'Apellido requerido'),
  cdl: z.string().min(1, 'CDL requerido'),
  cdlState: z.string().min(1, 'Estado del CDL requerido'),
  dob: z.string().min(1, 'DOB requerido'),
});

export const holderSchema = z.object({
  name: z.string().min(1, 'Nombre del holder requerido'),
  address: z.string().min(1, 'Dirección del holder requerida'),
  note: z.string().optional(),
});

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

export const createMasterSchema = z.object({ type: z.literal('CREATE_MASTER'), rawText });

export const removeVehicleSchema = z.object({
  type: z.literal('REMOVE_VEHICLE'), rawText,
  vin: z.string().min(1, 'VIN requerido'),
  year: z.string().min(1, 'Año requerido'),
  description: z.string().min(1, 'Descripción requerida'),
  value: z.string().optional(),
  effectiveDate: z.string().min(1, 'Effective Date requerida'),
});

export const removeDriverSchema = z.object({
  type: z.literal('REMOVE_DRIVER'), rawText,
  driver: z.object({
    firstName: z.string().min(1), lastName: z.string().min(1),
    cdl: z.string().min(1), cdlState: z.string().min(1),
    dob: z.string().optional().default(''), // DOB opcional al remover
  }),
});

export const removeHolderSchema = z.object({ type: z.literal('REMOVE_HOLDER'), rawText, holderName: z.string().min(1, 'Holder requerido') });
export const addNoteToMasterSchema = z.object({ type: z.literal('ADD_NOTE_TO_MASTER'), rawText, note: z.string().min(1, 'Nota requerida') });
export const updateMailingAddressSchema = z.object({ type: z.literal('UPDATE_MAILING_ADDRESS'), rawText, address: z.string().min(1, 'Dirección requerida') });
export const updatePolicyNumberSchema = z.object({ type: z.literal('UPDATE_POLICY_NUMBER'), rawText, policyType: policyTypeSchema, newPolicyNumber: z.string().min(1, 'Nuevo número requerido') });

// ── Grupo holder / loss-payee ─────────────────────────────────────────────────

const policiesArray = z.array(z.string().min(1)).min(1, 'Indica al menos una póliza');

export const addAdditionalInsuredSchema = z.object({ type: z.literal('ADD_ADDITIONAL_INSURED'), rawText, policies: policiesArray, holder: holderSchema });
export const addWaiverSubrogationSchema = z.object({ type: z.literal('ADD_WAIVER_SUBROGATION'), rawText, policies: policiesArray, holder: holderSchema });
export const addAIAndWOSSchema = z.object({ type: z.literal('ADD_AI_AND_WOS'), rawText, policies: policiesArray, holder: holderSchema });
export const addNoteToHolderSchema = z.object({ type: z.literal('ADD_NOTE_TO_HOLDER'), rawText, holder: holderSchema });
export const addLossPayeeSchema = z.object({ type: z.literal('ADD_LOSS_PAYEE'), rawText, vin: z.string().min(1), holder: holderSchema, policyLabel: z.string().optional() });
export const updateHolderSchema = z.object({ type: z.literal('UPDATE_HOLDER'), rawText, holderName: z.string().min(1), updateTo: z.string().min(1), note: z.string().optional() });
export const updateLPHolderSchema = z.object({ type: z.literal('UPDATE_LP_HOLDER'), rawText, vin: z.string().min(1), holderName: z.string().min(1), updateTo: z.string().min(1), note: z.string().optional() });

// ── Pólizas (Fase 3 – Task 3) ─────────────────────────────────────────────────

const coverageFields = {
  limit: z.string().optional(),
  deductible: z.string().optional(),
  eachOccurrence: z.string().optional(),
  damageToRentedPremises: z.string().optional(),
  medExp: z.string().optional(),
  personalAdvInjury: z.string().optional(),
  generalAggregate: z.string().optional(),
  productsCompOpAgg: z.string().optional(),
  elEachAccident: z.string().optional(),
  elDiseaseEaEmployee: z.string().optional(),
  elDiseasePolicyLimit: z.string().optional(),
  aggregate: z.string().optional(),
};

export const addPolicySchema = z.object({
  type: z.literal('ADD_POLICY'), rawText,
  policyType: policyTypeSchema,
  carrier: z.string().min(1, 'Carrier requerido'),
  mga: z.string().min(1, 'MGA requerido'),
  policyNumber: z.string().min(1, 'Número de póliza requerido'),
  effectiveDate: z.string().min(1, 'Effective Date requerida'),
  expirationDate: z.string().min(1, 'Expiration Date requerida'),
  anyAuto: z.boolean().optional(),
  allOwnedAutos: z.boolean().optional(),
  scheduledAutos: z.boolean().optional(),
  hiredAutos: z.boolean().optional(),
  nonOwnedAutos: z.boolean().optional(),
  ...coverageFields,
});

export const updateLimitDeductibleSchema = z.object({
  type: z.literal('UPDATE_LIMIT_DEDUCTIBLE'), rawText,
  policyType: policyTypeSchema,
  ...coverageFields,
});

export const commandSchema = z.discriminatedUnion('type', [
  noChangeSchema,
  addVehicleSchema,
  updateVehicleValueSchema,
  deleteVehicleValueSchema,
  createMasterSchema,
  removeVehicleSchema,
  removeDriverSchema,
  removeHolderSchema,
  addNoteToMasterSchema,
  updateMailingAddressSchema,
  updatePolicyNumberSchema,
  addAdditionalInsuredSchema,
  addWaiverSubrogationSchema,
  addAIAndWOSSchema,
  addNoteToHolderSchema,
  addLossPayeeSchema,
  updateHolderSchema,
  updateLPHolderSchema,
  addPolicySchema,
  updateLimitDeductibleSchema,
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
