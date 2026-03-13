# NowCerts Action Inputs

This file documents the input data expected by the actions we have already mapped or validated in NowCerts.

## Common Base

All commands include:

- `type`: action name
- `rawText`: original email/body text used to build the command

## Quick Summary

| Action | Status | Main required inputs | Notes |
| --- | --- | --- | --- |
| `navigateToClient` | validated | `clientName` | `usdot` optional |
| `CREATE_INSURED` | validated | `name`, `address`, `usdot`, `drivers`, `phone`, `email` | `dba` optional |
| `CREATE_MASTER` | validated | none beyond base | uses current insured |
| `ADD_VEHICLE` | validated | `vin`, `year`, `description`, `effectiveDate` | `value` optional |
| `REMOVE_VEHICLE` | validated | `vin`, `year`, `description`, `effectiveDate` | archives, does not delete |
| `REMOVE_DRIVER` | validated | `driver` | archives, does not delete |
| `ADD_ADDITIONAL_INSURED` | validated | `policies`, `holder` | includes headless certificate PDF flow |
| `ADD_POLICY` | validated for `AL` | `policyType`, `carrier`, `mga`, `policyNumber`, `effectiveDate`, `expirationDate` | `AL` live-saved with `Scheduled Autos` + `500 CSL` |
| `ADD_NOTE_TO_MASTER` | validated | `note` | edits the only master certificate row |
| `UPDATE_HOLDER` | validated | `holderName`, `updateTo` | supports name or address update |
| `UPDATE_LP_HOLDER` | pending | `vin`, `holderName`, `updateTo` | depends on a real existing LP case |
| `ADD_LOSS_PAYEE` | pending | `vin`, `holder` | blocked on missing `Physical Damage` policy on current client |
| `UPDATE_MAILING_ADDRESS` | partially validated | `address` | profile + master validated; ID cards pending on existing edited forms |
| `DELETE_VEHICLE_VALUE` | validated | `vin` | clears vehicle value through old vehicle edit route |
| `UPDATE_VEHICLE_VALUE` | validated | `vin`, `value` | writes price using comma format |
| `UPDATE_POLICY_NUMBER` | validated | `policyType`, `newPolicyNumber` | updates policy then re-saves master certificate |
| `NO_CHANGE` | validated | none beyond base | replies `Recibido` and stops |
| `ADD_DRIVER` | paused | `driver` | intentionally not closed yet |
| `ADD_WAIVER_SUBROGATION` | validated | `policies`, `holder` | includes headless certificate PDF flow |
| `ADD_AI_AND_WOS` | validated | `policies`, `holder` | includes headless certificate PDF flow |
| `ADD_NOTE_TO_HOLDER` | validated | `holder` | includes headless certificate PDF flow |

## `navigateToClient`

Used before insured-specific actions.

- `clientName`: insured name to search
- `usdot` (optional): if present, search prefers this value

Notes:

- Searches from the left sidebar search
- Lands on insured `Information`

## `CREATE_INSURED`

Type: `CREATE_INSURED`

Required inputs:

- `name`: insured name
- `address`: single string later split into address/city/state/zip
- `usdot`: USDOT number
- `drivers`: array of driver objects
- `phone`: primary phone
- `email`: primary email

Optional inputs:

- `dba`: DBA name

Driver object:

- `firstName`
- `lastName`
- `cdl`
- `cdlState`: state abbreviation is fine; UI expects full state name and code converts it
- `dob`: `M/d/YYYY` or `MM/DD/YYYY` style date

## `CREATE_MASTER`

Type: `CREATE_MASTER`

Required inputs:

- no extra fields beyond base command

Notes:

- Must already be on the correct insured
- Uses the insured name already present in NowCerts
- Always sets authorized representative to `Jenny Firma Definitiva`

## `ADD_NOTE_TO_MASTER`

Type: `ADD_NOTE_TO_MASTER`

Required inputs:

- `note`

Validated behavior:

- opens `Documents -> Certificates (Master)`
- requires exactly one master certificate row
- opens `Actions -> Edit`
- appends the note to `Description of Operations`
- saves with `Update`

## `UPDATE_HOLDER`

Type: `UPDATE_HOLDER`

Required inputs:

- `holderName`
- `updateTo`

Optional inputs:

- `note`

Validated behavior:

- opens `Additional Interests`
- finds the holder row and opens `Actions -> Edit`
- updates either company name or address fields
- saves with `Save Changes`
- sends certificate and downloads it headlessly

Implementation note:

- if `updateTo` looks like an address, it is parsed into address fields
- otherwise it is treated as the new holder/company name

## `ADD_LOSS_PAYEE`

Type: `ADD_LOSS_PAYEE`

Required inputs:

- `vin`
- `holder`

Holder object:

- `name`
- `address`
- `note` (optional)

Current status:

- pending on the current test client

What is already confirmed:

- vehicle flow is `Insured Items -> Vehicles -> row Actions -> Lien Holders -> Add`
- add form selectors are mapped
- `Loss Payee` checkbox is `#cblAdditionalInterests_5`
- `Additional Insured` default checkbox is `#cblAdditionalInterests_0`
- note field is `#txtDescription`
- save button is `#btnInsert_input`

Current blocker:

- the current client/VIN only shows `Fake-5445 (Commercial Auto)` in `Policies`
- the required `Physical Damage` policy is not available on this client yet

## `UPDATE_LP_HOLDER`

Type: `UPDATE_LP_HOLDER`

Required inputs:

- `vin`
- `holderName`
- `updateTo`

Optional inputs:

- `note`

Current status:

- pending because it depends on a real existing Loss Payee record tied to a VIN

What is already known:

- filename should be `YYYYMMdd Certificate Holder & LP VIN# <last4vin> (<final holder name>).pdf`
- `broker name` for this action is also the final holder name after update
- it will reuse the same LP path once a valid test client with LP data exists

## `UPDATE_MAILING_ADDRESS`

Type: `UPDATE_MAILING_ADDRESS`

Required inputs:

- `address`

Current validated behavior:

- updates insured mailing address through `TruckingCompanies/Edit.aspx?Id=<insuredId>`
- updates master certificate mailing address through `Documents -> Certificates (Master) -> Actions -> Edit`

Current blocker:

- ID card step is not fully closed on the current client because `Documents -> Forms` has no rows in `Edited Forms`
- only the `All Forms` template row `ID CARD VIN#` is present right now

Known ID card findings:

- vehicle `Actions -> ID Card` opens a viewer/download popup, not the editable form list from the manual process
- the manual process appears to depend on existing edited ID card forms already being present

## `DELETE_VEHICLE_VALUE`

Type: `DELETE_VEHICLE_VALUE`

Required inputs:

- `vin`

Validated behavior:

- opens the Vehicles list
- resolves the vehicle edit route for the VIN
- clears only the `Value` field
- saves with `Update`

## `UPDATE_VEHICLE_VALUE`

Type: `UPDATE_VEHICLE_VALUE`

Required inputs:

- `vin`
- `value`

Validated behavior:

- opens the same stable vehicle edit route
- writes the `Value` using comma formatting, e.g. `15,000`
- saves with `Update`

## `UPDATE_POLICY_NUMBER`

Type: `UPDATE_POLICY_NUMBER`

Required inputs:

- `policyType`
- `newPolicyNumber`

Validated behavior:

- finds the policy row by requested policy type
- opens stable policy edit route
- updates the policy number
- saves with `Update`
- opens the single master certificate row and saves the edit

## `NO_CHANGE`

Type: `NO_CHANGE`

Required inputs:

- no extra fields beyond base command

Validated behavior:

- replies to the sender with `Recibido`
- stops the process

## `ADD_VEHICLE`

Type: `ADD_VEHICLE`

Required inputs:

- `vin`
- `year`
- `description`
- `effectiveDate`

Optional inputs:

- `value`

Notes:

- Current live flow supports truck and trailer
- Vehicle type is inferred from text like `trailer` in description/raw text
- `effectiveDate` exists in the command even though the current vehicle insert flow mainly uses VIN/year/description/value

## `REMOVE_VEHICLE`

Type: `REMOVE_VEHICLE`

Required inputs:

- `vin`
- `year`
- `description`
- `effectiveDate`

Optional inputs:

- `value`

Notes:

- Live behavior uses `Archive`, not delete
- Matching is primarily by VIN on the Vehicles list

## `REMOVE_DRIVER`

Type: `REMOVE_DRIVER`

Required inputs:

- `driver`

Driver object:

- `firstName`
- `lastName`
- `cdl`
- `cdlState`
- `dob`

Notes:

- Live behavior uses `Archive`, not delete
- Current matching is by driver name in the list

## `ADD_ADDITIONAL_INSURED`

Type: `ADD_ADDITIONAL_INSURED`

Required inputs:

- `policies`: array like `['AL']`, `['GL']`, or `['AL', 'GL']`
- `holder`: holder object

Holder object:

- `name`
- `address`: single string later split into address/city/state/zip
- `note` (optional)

Notes:

- Uses Additional Interests tab first, then that tab's `+ Add New`
- Current policy row mapping:
  - `AL` -> `Automobile Liability`
  - `GL` -> `General Liability`
  - `WC` -> `Workers Compensation`
  - `MTC` -> `Cargo`
  - `APD` -> `Physical Damage`
  - `EXL` -> `Excess`

## `ADD_POLICY`

Type: `ADD_POLICY`

Required inputs for all policy types:

- `policyType`: `AL | MTC | APD | GL | WC | EXL | NTL`
- `carrier`
- `mga`
- `policyNumber`
- `effectiveDate`
- `expirationDate`

Optional shared inputs:

- `limit`
- `deductible`

AL / NTL optional inputs:

- `anyAuto`
- `allOwnedAutos`
- `scheduledAutos`
- `hiredAutos`
- `nonOwnedAutos`

GL optional inputs:

- `eachOccurrence`
- `damageToRentedPremises`
- `medExp`
- `personalAdvInjury`
- `generalAggregate`
- `productsCompOpAgg`
- `deductible`

WC optional inputs:

- `elEachAccident`
- `elDiseaseEaEmployee`
- `elDiseasePolicyLimit`

EXL optional inputs:

- `eachOccurrence`
- `aggregate`

Current validated live case:

- `policyType`: `AL`
- `carrier`: `County Hall Insurance Company, INC an RRG`
- `mga`: `County Hall Insurance Company, an RRG`
- `policyNumber`: example `Fake-5445`
- `effectiveDate`: `03/05/2026`
- `expirationDate`: `03/05/2027`
- `limit`: `$500,000`
- `scheduledAutos`: `true`

Important business rule for `AL` / `NTL`:

- only mark the auto options explicitly present in the email
- do not infer `Any Auto`, `Hired Autos`, `Non-Owned Autos`, etc.

Validated AL flow order:

- create policy from insured `Policies` section `+ Add New`
- fill policy header
- add `Commercial Auto` in `Lines of Business`
- open `Coverages` with `View`
- choose `Automobile Liability - (Will prefill Acord 22, Acord 25)`
- refresh sections
- enable `AUTOMOBILE LIABILITY`
- mark only the requested auto checkboxes
- fill AL limits
- save

## Additional Interests Certificate Naming

For these actions, `broker name` means `holder.name`.

Validated filename formats:

- `ADD_NOTE_TO_HOLDER` -> `YYYYMMdd Certificate Holder (<holder.name>).pdf`
- `ADD_ADDITIONAL_INSURED` -> `YYYYMMdd Certificate Holder AI (<holder.name>).pdf`
- `ADD_WAIVER_SUBROGATION` -> `YYYYMMdd Certificate Holder WOS (<holder.name>).pdf`
- `ADD_AI_AND_WOS` -> `YYYYMMdd Certificate Holder AI & WOS (<holder.name>).pdf`

Notes:

- filenames are sanitized for Windows-invalid characters
- send-certificate flow is headless and does not use the OS print dialog

## `ADD_WAIVER_SUBROGATION`

Type: `ADD_WAIVER_SUBROGATION`

Required inputs:

- `policies`
- `holder`

Holder object:

- `name`
- `address`
- `note` (optional)

Validated behavior:

- opens `Additional Interests` tab first
- clicks that tab's `+ Add New`
- searches/creates holder
- marks WOS on the requested policy rows
- selects matching policies
- saves and downloads certificate headlessly

## `ADD_AI_AND_WOS`

Type: `ADD_AI_AND_WOS`

Required inputs:

- `policies`
- `holder`

Holder object:

- `name`
- `address`
- `note` (optional)

Validated behavior:

- opens `Additional Interests` tab first
- clicks that tab's `+ Add New`
- searches/creates holder
- marks both AI and WOS on the requested policy rows
- selects matching policies
- saves and downloads certificate headlessly

## `ADD_NOTE_TO_HOLDER`

Type: `ADD_NOTE_TO_HOLDER`

Required inputs:

- `holder`

Holder object:

- `name`
- `address`
- `note` (practically required)

Validated behavior:

- opens `Additional Interests` tab first
- clicks that tab's `+ Add New`
- searches/creates holder
- saves note in `Description of Operations`
- also copies the note into `Send Certificate -> Description` so it appears in the final certificate PDF
- downloads certificate headlessly

## Actions Not Fully Finished

These exist in types/code but are not fully closed out yet:

- `ADD_DRIVER`

## Pending Actions

### `ADD_DRIVER`

Status:

- paused by business decision

Known inputs:

- `type`: `ADD_DRIVER`
- `rawText`
- `driver`

Driver object:

- `firstName`
- `lastName`
- `cdl`
- `cdlState`
- `dob`

Notes:

- implementation was started
- user explicitly asked not to treat it as finished yet

## Example Payloads

### `navigateToClient`

```json
{
  "clientName": "Pix Test 2 2026 - 2027",
  "usdot": "1234567"
}
```

### `CREATE_INSURED`

```json
{
  "type": "CREATE_INSURED",
  "rawText": "Create insured...",
  "name": "Pix Test 2 2026 - 2027",
  "dba": "testing DBA2",
  "address": "123 Main St, Dallas, TX, 75201",
  "usdot": "1234567",
  "phone": "2145551234",
  "email": "test@example.com",
  "drivers": [
    {
      "firstName": "Juan",
      "lastName": "Perez",
      "cdl": "TX1234567",
      "cdlState": "TX",
      "dob": "01/15/1988"
    }
  ]
}
```

### `CREATE_MASTER`

```json
{
  "type": "CREATE_MASTER",
  "rawText": "Create master"
}
```

### `ADD_NOTE_TO_MASTER`

```json
{
  "type": "ADD_NOTE_TO_MASTER",
  "rawText": "Add note to master...",
  "note": "Certificate master note text"
}
```

### `UPDATE_HOLDER`

```json
{
  "type": "UPDATE_HOLDER",
  "rawText": "Update holder...",
  "holderName": "RXO Note Test LLC",
  "updateTo": "112 Note Ave, Dallas, TX, 75201",
  "note": "Updated holder note"
}
```

Name-update example:

```json
{
  "type": "UPDATE_HOLDER",
  "rawText": "Update holder...",
  "holderName": "RXO WOS Test LLC",
  "updateTo": "RXO WOS Test LLC Updated",
  "note": "Updated holder name note"
}
```

### `ADD_LOSS_PAYEE`

```json
{
  "type": "ADD_LOSS_PAYEE",
  "rawText": "Add Loss Payee to VIN# 4V4NC9TG97N436292",
  "vin": "4V4NC9TG97N436292",
  "holder": {
    "name": "Holder Example LLC",
    "address": "500 Market St, Houston, TX, 77002",
    "note": "Loss payee note text"
  }
}
```

### `UPDATE_MAILING_ADDRESS`

```json
{
  "type": "UPDATE_MAILING_ADDRESS",
  "rawText": "Update mailing address...",
  "address": "555 Estadio Rd, Dallas, TX, 867345"
}
```

### `DELETE_VEHICLE_VALUE`

```json
{
  "type": "DELETE_VEHICLE_VALUE",
  "rawText": "Delete vehicle value for VIN 4V4NC9TG97N436292",
  "vin": "4V4NC9TG97N436292"
}
```

### `UPDATE_VEHICLE_VALUE`

```json
{
  "type": "UPDATE_VEHICLE_VALUE",
  "rawText": "Update vehicle value for VIN 4V4NC9TG97N436292",
  "vin": "4V4NC9TG97N436292",
  "value": "$15,000"
}
```

### `UPDATE_POLICY_NUMBER`

```json
{
  "type": "UPDATE_POLICY_NUMBER",
  "rawText": "Update policy number for AL",
  "policyType": "AL",
  "newPolicyNumber": "Fake-5446"
}
```

### `NO_CHANGE`

```json
{
  "type": "NO_CHANGE",
  "rawText": "No Change"
}
```

### `ADD_VEHICLE`

```json
{
  "type": "ADD_VEHICLE",
  "rawText": "Add truck VIN 4V4NC9TG97N436292...",
  "vin": "4V4NC9TG97N436292",
  "year": "2007",
  "description": "VOLVO",
  "value": "$15,000 Including Permanently Attached Equipment",
  "effectiveDate": "03/05/2026"
}
```

### `REMOVE_VEHICLE`

```json
{
  "type": "REMOVE_VEHICLE",
  "rawText": "Remove vehicle...",
  "vin": "4V4NC9TG97N436292",
  "year": "2007",
  "description": "VOLVO",
  "effectiveDate": "03/05/2026"
}
```

### `REMOVE_DRIVER`

```json
{
  "type": "REMOVE_DRIVER",
  "rawText": "Remove driver...",
  "driver": {
    "firstName": "Juan",
    "lastName": "Perez",
    "cdl": "TX1234567",
    "cdlState": "TX",
    "dob": "01/15/1988"
  }
}
```

### `ADD_ADDITIONAL_INSURED`

```json
{
  "type": "ADD_ADDITIONAL_INSURED",
  "rawText": "Add additional insured...",
  "policies": ["AL", "GL"],
  "holder": {
    "name": "Holder Example LLC",
    "address": "500 Market St, Houston, TX, 77002",
    "note": "As per written contract"
  }
}
```

### `ADD_WAIVER_SUBROGATION`

```json
{
  "type": "ADD_WAIVER_SUBROGATION",
  "rawText": "Add waiver of subrogation...",
  "policies": ["AL"],
  "holder": {
    "name": "Holder Example LLC",
    "address": "500 Market St, Houston, TX, 77002",
    "note": "Waiver of subrogation applies when required by written contract"
  }
}
```

### `ADD_AI_AND_WOS`

```json
{
  "type": "ADD_AI_AND_WOS",
  "rawText": "Add additional insured and waiver of subrogation...",
  "policies": ["AL"],
  "holder": {
    "name": "Holder Example LLC",
    "address": "500 Market St, Houston, TX, 77002",
    "note": "AI and WOS as required by written contract"
  }
}
```

### `ADD_NOTE_TO_HOLDER`

```json
{
  "type": "ADD_NOTE_TO_HOLDER",
  "rawText": "Add note to holder...",
  "holder": {
    "name": "Holder Example LLC",
    "address": "500 Market St, Houston, TX, 77002",
    "note": "Certificate holder note text"
  }
}
```

### `ADD_POLICY` for validated `AL`

```json
{
  "type": "ADD_POLICY",
  "rawText": "XX Add Policy: AL Limit: $500,000 ... Scheduled Autos",
  "policyType": "AL",
  "carrier": "County Hall Insurance Company, INC an RRG",
  "mga": "County Hall Insurance Company, an RRG",
  "policyNumber": "Fake-5445",
  "effectiveDate": "03/05/2026",
  "expirationDate": "03/05/2027",
  "limit": "$500,000",
  "scheduledAutos": true
}
```

### `ADD_POLICY` for `GL`

```json
{
  "type": "ADD_POLICY",
  "rawText": "Add policy GL...",
  "policyType": "GL",
  "carrier": "Carrier Name",
  "mga": "MGA Name",
  "policyNumber": "GL-1001",
  "effectiveDate": "03/05/2026",
  "expirationDate": "03/05/2027",
  "eachOccurrence": "$1,000,000",
  "damageToRentedPremises": "$100,000",
  "medExp": "$5,000",
  "personalAdvInjury": "$1,000,000",
  "generalAggregate": "$2,000,000",
  "productsCompOpAgg": "$2,000,000",
  "deductible": "$1,000"
}
```

## Expected Results

### `navigateToClient`

- Returns `true` when insured is found and page lands on insured `Information`
- Returns `false` if search result is not found

### `CREATE_INSURED`

- Creates the insured and saves it in NowCerts
- Expected action result: success message for insured creation

### `CREATE_MASTER`

- Creates a master certificate under `Documents -> Certificates (Master)`
- Expected action result: success message for master creation

### `ADD_VEHICLE`

- Creates the truck or trailer record on the insured
- Expected action result: success message mentioning the VIN

### `REMOVE_VEHICLE`

- Archives the vehicle/trailer from the insured list
- Expected action result: success message for archive flow

### `REMOVE_DRIVER`

- Archives the driver from the insured list
- Expected action result: success message for archive flow

### `ADD_ADDITIONAL_INSURED`

- Creates or reuses the holder and marks AI on requested policy rows
- Downloads the certificate headlessly after adding all vehicles and drivers
- Expected filename: `YYYYMMdd Certificate Holder AI (<holder.name>).pdf`
- Expected action result: success message naming the holder

### `ADD_NOTE_TO_MASTER`

- Opens the only master certificate row and appends the note in `Description of Operations`
- Saves the edit with the popup `Update` button
- Expected action result: success message for master note update

### `UPDATE_HOLDER`

- Opens the holder in `Additional Interests -> Actions -> Edit`
- Updates either holder name or holder address
- Saves changes and downloads the certificate headlessly
- Expected filename: `YYYYMMdd Certificate Holder (<effective holder name>).pdf`
- Expected action result: success message naming old and new values

### `ADD_LOSS_PAYEE`

- Pending on a client/VIN that has `Physical Damage` available in the policy selector
- Final expected filename: `YYYYMMdd Certificate Holder & LP VIN# <last4vin> (<holder.name>).pdf`

### `UPDATE_MAILING_ADDRESS`

- Updates mailing address on the insured profile
- Updates mailing address on the single master certificate row
- ID card step is still pending on a client that already has editable ID card forms created
- Current expected action result: success or partial-success message depending on whether editable ID cards exist

### `DELETE_VEHICLE_VALUE`

- Opens the vehicle edit page for the VIN and clears only the value field
- Expected action result: success message naming the VIN

### `UPDATE_VEHICLE_VALUE`

- Opens the vehicle edit page for the VIN and writes the value using comma formatting
- Expected action result: success message naming the VIN and value

### `UPDATE_POLICY_NUMBER`

- Opens the policy edit page for the requested policy type and updates the number
- Re-opens master certificate edit and saves it
- Expected action result: success message naming the policy type and new number

### `NO_CHANGE`

- Sends reply with subject/body `Recibido`
- Expected action result: success message confirming the reply

### `ADD_WAIVER_SUBROGATION`

- Creates or reuses the holder and marks WOS on requested policy rows
- Downloads the certificate headlessly after adding all vehicles and drivers
- Expected filename: `YYYYMMdd Certificate Holder WOS (<holder.name>).pdf`
- Expected action result: success message naming the holder

### `ADD_AI_AND_WOS`

- Creates or reuses the holder and marks both AI and WOS on requested policy rows
- Downloads the certificate headlessly after adding all vehicles and drivers
- Expected filename: `YYYYMMdd Certificate Holder AI & WOS (<holder.name>).pdf`
- Expected action result: success message naming the holder

### `ADD_NOTE_TO_HOLDER`

- Creates or reuses the holder and saves the note in Additional Interests
- Copies the note into the send-certificate description so it appears in the final PDF
- Downloads the certificate headlessly after adding all vehicles and drivers
- Expected filename: `YYYYMMdd Certificate Holder (<holder.name>).pdf`
- Expected action result: success message naming the holder

### `ADD_POLICY`

- Creates the policy on the insured and lands on policy details page
- For validated `AL`, expected visible result includes:
  - `Commercial Auto`
  - `Automobile Liability`
  - only requested auto options checked
  - limit reflected in policy details
- Expected action result: success message naming policy type and policy number

## File References

- Types: `src/types/index.ts`
- Client navigation: `src/browser/nowcertsLogin.ts`
- Policy flow: `src/actions/addPolicy.ts`
- Additional Interests helper flow: `src/actions/_holderHelpers.ts`
