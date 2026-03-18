// ─── Command types ────────────────────────────────────────────────────────────

export type CommandType =
  | 'CREATE_INSURED'
  | 'CREATE_MASTER'
  | 'ADD_VEHICLE'
  | 'ADD_DRIVER'
  | 'REMOVE_VEHICLE'
  | 'REMOVE_DRIVER'
  | 'ADD_ADDITIONAL_INSURED'
  | 'ADD_WAIVER_SUBROGATION'
  | 'ADD_AI_AND_WOS'
  | 'ADD_NOTE_TO_HOLDER'
  | 'ADD_NOTE_TO_MASTER'
  | 'ADD_LOSS_PAYEE'
  | 'UPDATE_HOLDER'
  | 'UPDATE_LP_HOLDER'
  | 'ADD_POLICY'
  | 'UPDATE_LIMIT_DEDUCTIBLE'
  | 'UPDATE_MAILING_ADDRESS'
  | 'DELETE_VEHICLE_VALUE'
  | 'UPDATE_VEHICLE_VALUE'
  | 'UPDATE_POLICY_NUMBER'
  | 'NO_CHANGE';

export type PolicyType = 'AL' | 'MTC' | 'APD' | 'GL' | 'WC' | 'EXL' | 'NTL';

export type Language = 'es' | 'en';

// ─── Driver ───────────────────────────────────────────────────────────────────

export interface Driver {
  firstName: string;
  lastName: string;
  cdl: string;
  cdlState: string;
  dob: string; // M/d/YYYY
}

// ─── Parsed commands ──────────────────────────────────────────────────────────

export interface BaseCommand {
  type: CommandType;
  rawText: string;
}

export interface CreateInsuredCommand extends BaseCommand {
  type: 'CREATE_INSURED';
  name: string;
  dba?: string;
  address: string;
  usdot: string;
  drivers: Driver[];
  phone: string;
  email: string;
}

export interface CreateMasterCommand extends BaseCommand {
  type: 'CREATE_MASTER';
}

export interface AddVehicleCommand extends BaseCommand {
  type: 'ADD_VEHICLE';
  vin: string;
  year: string;
  description: string;
  value?: string;
  effectiveDate: string;
  usage?: string; // defaults to 'Commercial'
}

export interface AddDriverCommand extends BaseCommand {
  type: 'ADD_DRIVER';
  driver: Driver;
}

export interface RemoveVehicleCommand extends BaseCommand {
  type: 'REMOVE_VEHICLE';
  vin: string;
  year: string;
  description: string;
  value?: string;
  effectiveDate: string;
}

export interface RemoveDriverCommand extends BaseCommand {
  type: 'REMOVE_DRIVER';
  driver: Driver;
}

export interface HolderInfo {
  name: string;
  address: string;
  note?: string;
}

export interface AddAdditionalInsuredCommand extends BaseCommand {
  type: 'ADD_ADDITIONAL_INSURED';
  policies: string[]; // e.g. ['AL', 'GL'] or ['AL/GL']
  holder: HolderInfo;
}

export interface AddWaiverSubrogationCommand extends BaseCommand {
  type: 'ADD_WAIVER_SUBROGATION';
  policies: string[];
  holder: HolderInfo;
}

export interface AddAIAndWOSCommand extends BaseCommand {
  type: 'ADD_AI_AND_WOS';
  policies: string[];
  holder: HolderInfo;
}

export interface AddNoteToHolderCommand extends BaseCommand {
  type: 'ADD_NOTE_TO_HOLDER';
  holder: HolderInfo;
}

export interface AddNoteToMasterCommand extends BaseCommand {
  type: 'ADD_NOTE_TO_MASTER';
  note: string;
}

export interface AddLossPayeeCommand extends BaseCommand {
  type: 'ADD_LOSS_PAYEE';
  vin: string;
  holder: HolderInfo;
  policyLabel?: string; // defaults to 'Physical Damage'
}

export interface UpdateHolderCommand extends BaseCommand {
  type: 'UPDATE_HOLDER';
  holderName: string;
  updateTo: string;
  note?: string;
}

export interface UpdateLPHolderCommand extends BaseCommand {
  type: 'UPDATE_LP_HOLDER';
  vin: string;
  holderName: string;
  updateTo: string;
  note?: string;
}

export interface AddPolicyCommand extends BaseCommand {
  type: 'ADD_POLICY';
  policyType: PolicyType;
  limit?: string;
  deductible?: string;
  carrier: string;
  mga: string;
  policyNumber: string;
  effectiveDate: string;
  expirationDate: string;
  // AL / NTL specific
  anyAuto?: boolean;
  allOwnedAutos?: boolean;
  scheduledAutos?: boolean;
  hiredAutos?: boolean;
  nonOwnedAutos?: boolean;
  // GL specific
  eachOccurrence?: string;
  damageToRentedPremises?: string;
  medExp?: string;
  personalAdvInjury?: string;
  generalAggregate?: string;
  productsCompOpAgg?: string;
  // WC specific
  elEachAccident?: string;
  elDiseaseEaEmployee?: string;
  elDiseasePolicyLimit?: string;
  // EXL specific
  aggregate?: string;
}

export interface UpdateLimitDeductibleCommand extends BaseCommand {
  type: 'UPDATE_LIMIT_DEDUCTIBLE';
  policyType: PolicyType;
  limit?: string;
  deductible?: string;
  // GL
  eachOccurrence?: string;
  damageToRentedPremises?: string;
  medExp?: string;
  personalAdvInjury?: string;
  generalAggregate?: string;
  productsCompOpAgg?: string;
  // WC
  elEachAccident?: string;
  elDiseaseEaEmployee?: string;
  elDiseasePolicyLimit?: string;
  // EXL
  aggregate?: string;
}

export interface UpdateMailingAddressCommand extends BaseCommand {
  type: 'UPDATE_MAILING_ADDRESS';
  address: string;
}

export interface DeleteVehicleValueCommand extends BaseCommand {
  type: 'DELETE_VEHICLE_VALUE';
  vin: string;
}

export interface UpdateVehicleValueCommand extends BaseCommand {
  type: 'UPDATE_VEHICLE_VALUE';
  vin: string;
  value: string;
}

export interface UpdatePolicyNumberCommand extends BaseCommand {
  type: 'UPDATE_POLICY_NUMBER';
  policyType: PolicyType;
  newPolicyNumber: string;
}

export interface NoChangeCommand extends BaseCommand {
  type: 'NO_CHANGE';
}

export type Command =
  | CreateInsuredCommand
  | CreateMasterCommand
  | AddVehicleCommand
  | AddDriverCommand
  | RemoveVehicleCommand
  | RemoveDriverCommand
  | AddAdditionalInsuredCommand
  | AddWaiverSubrogationCommand
  | AddAIAndWOSCommand
  | AddNoteToHolderCommand
  | AddNoteToMasterCommand
  | AddLossPayeeCommand
  | UpdateHolderCommand
  | UpdateLPHolderCommand
  | AddPolicyCommand
  | UpdateLimitDeductibleCommand
  | UpdateMailingAddressCommand
  | DeleteVehicleValueCommand
  | UpdateVehicleValueCommand
  | UpdatePolicyNumberCommand
  | NoChangeCommand;

// ─── Parsed email ─────────────────────────────────────────────────────────────

export interface ParsedEmail {
  uid: number;
  subject: string;
  from: string;
  to: string;
  body: string;
  // Extracted from subject
  clientName?: string;
  usdot?: string;
  dba?: string;
  // Extracted from body
  commands: Command[];
  agent?: string;
  language: Language;
  sendTo?: string;  // optional specific recipient
}

// ─── Action result ────────────────────────────────────────────────────────────

export interface ActionResult {
  success: boolean;
  commandType: CommandType;
  message: string;
  downloadedFiles?: string[];
  error?: Error;
}

// ─── Agent ────────────────────────────────────────────────────────────────────

export interface Agent {
  name: string;
  emails: string[];
}
