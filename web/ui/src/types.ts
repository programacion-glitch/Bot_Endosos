export type CommandType = 'ADD_VEHICLE' | 'UPDATE_VEHICLE_VALUE' | 'DELETE_VEHICLE_VALUE' | 'NO_CHANGE';

export type UICommand =
  | { type: 'NO_CHANGE'; rawText: string }
  | { type: 'ADD_VEHICLE'; rawText: string; vin: string; year: string; description: string; value?: string; effectiveDate: string }
  | { type: 'UPDATE_VEHICLE_VALUE'; rawText: string; vin: string; value: string }
  | { type: 'DELETE_VEHICLE_VALUE'; rawText: string; vin: string };

export interface JobInputUI {
  mode: 'existing_client';
  clientName: string;
  usdot?: string;
  language: 'es' | 'en';
  notifyTo: string;
  commands: UICommand[];
}

export type JobStatus = 'queued' | 'processing' | 'done' | 'failed' | 'needs_review';

export interface JobSummary {
  id: string;
  status: JobStatus;
  clientName: string;
  usdot?: string;
  commands: UICommand[];
  notifyTo: string;
  createdBy: string;
  createdAt: string;
  resultSummary?: string;
  resultFiles?: string[];
  errorMessage?: string;
}
