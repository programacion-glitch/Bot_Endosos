export type PolicyType = 'AL' | 'MTC' | 'APD' | 'GL' | 'WC' | 'EXL' | 'NTL';

export type CommandType =
  | 'NO_CHANGE' | 'ADD_VEHICLE' | 'UPDATE_VEHICLE_VALUE' | 'DELETE_VEHICLE_VALUE'
  | 'CREATE_MASTER' | 'REMOVE_VEHICLE' | 'ADD_DRIVER' | 'REMOVE_DRIVER' | 'REMOVE_HOLDER'
  | 'ADD_NOTE_TO_MASTER' | 'UPDATE_MAILING_ADDRESS' | 'UPDATE_POLICY_NUMBER'
  | 'ADD_ADDITIONAL_INSURED' | 'ADD_WAIVER_SUBROGATION' | 'ADD_AI_AND_WOS'
  | 'ADD_NOTE_TO_HOLDER' | 'ADD_LOSS_PAYEE' | 'UPDATE_HOLDER' | 'UPDATE_LP_HOLDER'
  | 'ADD_POLICY' | 'UPDATE_LIMIT_DEDUCTIBLE' | 'CREATE_INSURED';

export interface UIHolder { name: string; address: string; note?: string }
export interface UIDriver { firstName: string; lastName: string; cdl: string; cdlState: string; dob: string }

export type UICommand =
  | { type: 'NO_CHANGE'; rawText: string }
  | { type: 'CREATE_MASTER'; rawText: string }
  | { type: 'ADD_VEHICLE'; rawText: string; vin: string; year: string; description: string; value?: string; effectiveDate: string }
  | { type: 'REMOVE_VEHICLE'; rawText: string; vin: string; year: string; description: string; value?: string; effectiveDate: string }
  | { type: 'UPDATE_VEHICLE_VALUE'; rawText: string; vin: string; value: string }
  | { type: 'DELETE_VEHICLE_VALUE'; rawText: string; vin: string }
  | { type: 'ADD_DRIVER'; rawText: string; driver: UIDriver }
  | { type: 'REMOVE_DRIVER'; rawText: string; driver: UIDriver }
  | { type: 'REMOVE_HOLDER'; rawText: string; holderName: string }
  | { type: 'ADD_NOTE_TO_MASTER'; rawText: string; note: string }
  | { type: 'UPDATE_MAILING_ADDRESS'; rawText: string; address: string }
  | { type: 'UPDATE_POLICY_NUMBER'; rawText: string; policyType: PolicyType; newPolicyNumber: string }
  | { type: 'ADD_ADDITIONAL_INSURED'; rawText: string; policies: string[]; holder: UIHolder }
  | { type: 'ADD_WAIVER_SUBROGATION'; rawText: string; policies: string[]; holder: UIHolder }
  | { type: 'ADD_AI_AND_WOS'; rawText: string; policies: string[]; holder: UIHolder }
  | { type: 'ADD_NOTE_TO_HOLDER'; rawText: string; holder: UIHolder }
  | { type: 'ADD_LOSS_PAYEE'; rawText: string; vin: string; holder: UIHolder }
  | { type: 'UPDATE_HOLDER'; rawText: string; holderName: string; updateTo: string; note?: string }
  | { type: 'UPDATE_LP_HOLDER'; rawText: string; vin: string; holderName: string; updateTo: string; note?: string }
  | { type: 'ADD_POLICY'; rawText: string; policyType: PolicyType; carrier: string; mga: string; policyNumber: string; effectiveDate: string; expirationDate: string;
      limit?: string; deductible?: string; anyAuto?: boolean; allOwnedAutos?: boolean; scheduledAutos?: boolean; hiredAutos?: boolean; nonOwnedAutos?: boolean;
      eachOccurrence?: string; damageToRentedPremises?: string; medExp?: string; personalAdvInjury?: string; generalAggregate?: string; productsCompOpAgg?: string;
      elEachAccident?: string; elDiseaseEaEmployee?: string; elDiseasePolicyLimit?: string; aggregate?: string }
  | { type: 'UPDATE_LIMIT_DEDUCTIBLE'; rawText: string; policyType: PolicyType;
      limit?: string; deductible?: string; eachOccurrence?: string; damageToRentedPremises?: string; medExp?: string; personalAdvInjury?: string; generalAggregate?: string; productsCompOpAgg?: string;
      elEachAccident?: string; elDiseaseEaEmployee?: string; elDiseasePolicyLimit?: string; aggregate?: string }
  | { type: 'CREATE_INSURED'; rawText: string; name: string; dba?: string; address: string; usdot: string; drivers: UIDriver[]; phone: string; email: string; secondaryEmail?: string };

export interface JobInputUI {
  mode: 'new_client' | 'existing_client';
  clientName: string;
  usdot?: string;
  dba?: string;
  language: 'es' | 'en';
  notifyTo: string;
  commands: UICommand[];
}

export type JobStatus = 'queued' | 'processing' | 'done' | 'failed' | 'needs_review';

export interface JobSummary {
  id: string; status: JobStatus; clientName: string; usdot?: string;
  commands: UICommand[]; notifyTo: string; createdBy: string; createdAt: string;
  resultSummary?: string; resultFiles?: string[]; errorMessage?: string;
}
