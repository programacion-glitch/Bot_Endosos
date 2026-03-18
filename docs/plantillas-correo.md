# Plantillas de Correo — Bot H2O

## Formato del Asunto (Subject)

El asunto define el tipo de proceso y la identificacion del cliente.

### Estructura

```
{TIPO DE PROCESO} // {NOMBRE DEL CLIENTE} // {IDENTIFICADORES}
```

### Tipos de proceso

| Prefijo              | Significado                     |
|----------------------|---------------------------------|
| `DOCUMENTAR CLIENTE` | Crear cliente nuevo desde cero  |
| `BOT-END`            | Operaciones sobre cliente existente |

### Identificadores

Puede venir **USDOT**, **DBA**, o **ambos**:

```
USDOT {numero}
DBA {nombreDBA}
USDOT {numero} // DBA {nombreDBA}
```

### Variantes de asunto

**DOCUMENTAR CLIENTE (cliente nuevo):**
```
DOCUMENTAR CLIENTE // {NombreCliente} // USDOT {numero}
DOCUMENTAR CLIENTE // {NombreCliente} // DBA {nombreDBA}
DOCUMENTAR CLIENTE // {NombreCliente} // USDOT {numero} // DBA {nombreDBA}
DOCUMENTAR CLIENTE // {NombreCliente} // EFFECTIVE DATE {mm/dd/yyyy} // USDOT {numero}
DOCUMENTAR CLIENTE // {NombreCliente} // EFFECTIVE DATE {mm/dd/yyyy} // DBA {nombreDBA}
DOCUMENTAR CLIENTE // {NombreCliente} // EFFECTIVE DATE {mm/dd/yyyy} // USDOT {numero} // DBA {nombreDBA}
```

**BOT-END (cliente existente):**
```
BOT-END // {NombreCliente} // USDOT {numero}
BOT-END // {NombreCliente} // DBA {nombreDBA}
BOT-END // {NombreCliente} // USDOT {numero} // DBA {nombreDBA}
```

---

## Metadata del Body (opcional)

Incluir al inicio del correo si es necesario:

```
Language: {Espanol|English}
Agent: {NombreAgente}
Send to: {emailDestinatario}
```

---

## Separador entre Comandos

Usar una linea con solo `x` o `xx` entre cada bloque de comandos.

---

## Comandos

### 1. Create Insured

> Solo con asunto DOCUMENTAR CLIENTE

```
Create Insured
Name: {nombreEmpresa}
Dba: {dba}                                        <- opcional
Address: {direccionCompleta}
USDOT: {numeroDOT}
Phone: {telefono}
Email: {email}
Driver1: Name: {nombre} / Last Name: {apellido} / CDL: {numeroCDL} {estado} / DOB: {mm/dd/yyyy}
Driver2: Name: {nombre} / Last Name: {apellido} / CDL: {numeroCDL} {estado} / DOB: {mm/dd/yyyy}
```

### 2. Create Master

```
Create Master
```

---

### 3. Add Policy — AL (Automobile Liability)

```
Add Policy
AL
Carrier: {carrier}
MGA: {mga}
Policy Number: {numeroPoliza}
Effective Date: {mm/dd/yyyy}
Expiration Date: {mm/dd/yyyy}
Limit: {limite}
Deductible: {deducible}
Any Auto                              <- incluir solo si aplica
All Owned Autos                       <- incluir solo si aplica
Scheduled Autos                       <- incluir solo si aplica
Hired Autos                           <- incluir solo si aplica
Non Owned Autos                       <- incluir solo si aplica
```

### 4. Add Policy — NTL (Non-Trucking Liability)

```
Add Policy
NTL
Carrier: {carrier}
MGA: {mga}
Policy Number: {numeroPoliza}
Effective Date: {mm/dd/yyyy}
Expiration Date: {mm/dd/yyyy}
Limit: {limite}
Deductible: {deducible}
Scheduled Autos                       <- incluir solo si aplica
```

### 5. Add Policy — MTC (Motor Truck Cargo)

```
Add Policy
MTC
Carrier: {carrier}
MGA: {mga}
Policy Number: {numeroPoliza}
Effective Date: {mm/dd/yyyy}
Expiration Date: {mm/dd/yyyy}
Limit: {limite}
Deductible: {deducible}
```

### 6. Add Policy — APD (Physical Damage)

```
Add Policy
APD
Carrier: {carrier}
MGA: {mga}
Policy Number: {numeroPoliza}
Effective Date: {mm/dd/yyyy}
Expiration Date: {mm/dd/yyyy}
Limit: {limite}
Deductible: {deducible}
```

### 7. Add Policy — GL (General Liability)

```
Add Policy
GL
Carrier: {carrier}
MGA: {mga}
Policy Number: {numeroPoliza}
Effective Date: {mm/dd/yyyy}
Expiration Date: {mm/dd/yyyy}
Each Occurrence: {monto}
Damage to Rented Premises: {monto}
Med Exp: {monto}
Personal & Adv Injury: {monto}
General Aggregate: {monto}
Products-Comp/Op Agg: {monto}
```

### 8. Add Policy — WC (Workers Compensation)

```
Add Policy
WC
Carrier: {carrier}
MGA: {mga}
Policy Number: {numeroPoliza}
Effective Date: {mm/dd/yyyy}
Expiration Date: {mm/dd/yyyy}
E.L. Each Accident: {monto}
E.L. Disease - EA Employee: {monto}
E.L. Disease - Policy Limit: {monto}
```

### 9. Add Policy — EXL (Excess Liability)

```
Add Policy
EXL
Carrier: {carrier}
MGA: {mga}
Policy Number: {numeroPoliza}
Effective Date: {mm/dd/yyyy}
Expiration Date: {mm/dd/yyyy}
Limit: {limite}
Aggregate: {monto}
```

---

### 10. Add Vehicle/Trailer

```
Add Vehicle/Trailer VIN#: {vin} // Year: {anio} // Description: {descripcion} // Value: {$valor} // Effective Date: {mm/dd/yyyy}
```

> Value es opcional. Sin Value:

```
Add Vehicle/Trailer VIN#: {vin} // Year: {anio} // Description: {descripcion} // Effective Date: {mm/dd/yyyy}
```

### 11. Remove Vehicle/Trailer

```
Remove Vehicle/Trailer VIN#: {vin} // Year: {anio} // Description: {descripcion} // Effective Date: {mm/dd/yyyy}
```

### 12. Add Driver

```
Add Driver: Name: {nombre} / Last Name: {apellido} / CDL: {numeroCDL} {estado} / DOB: {mm/dd/yyyy}
```

### 13. Remove Driver

```
Remove Driver: Name: {nombre} / Last Name: {apellido} / CDL: {numeroCDL} {estado} / DOB: {mm/dd/yyyy}
```

---

### 14. Add Additional Insured

```
Add Additional Insured to the {AL/GL/WC}
Holder name: {nombreHolder}
Holder address: {direccionHolder}
Note: {nota}                          <- opcional
```

> Puede ser una o varias polizas separadas por `/`: `AL/GL`, `AL/GL/WC`, etc.

### 15. Add Waiver of Subrogation

```
Add Waiver of Subrogation to the {AL/GL/WC}
Holder name: {nombreHolder}
Holder address: {direccionHolder}
Note: {nota}                          <- opcional
```

### 16. Add Additional Insured & Waiver of Subrogation

```
Add Additional Insured & Waiver of Subrogation to the {AL/GL/WC}
Holder name: {nombreHolder}
Holder address: {direccionHolder}
Note: {nota}                          <- opcional
```

---

### 17. Add Note to Holder

```
Add Note to Holder
Holder name: {nombreHolder}
Note: {textoNota}
```

### 18. Add Note to Master

```
Add Note to Master
Note: {textoNota}
```

---

### 19. Add Loss Payee

```
Add Loss Payee VIN# {vin}
Holder name: {nombreHolder}
Holder address: {direccionHolder}
```

---

### 20. Update Holder

```
Update Holder
Holder name: {nombreActual}
Update to: {nuevoNombre}
Note: {nota}                          <- opcional
```

### 21. Update LP Holder

```
Update LP Holder VIN# {vin}
Holder name: {nombreActual}
Update to: {nuevoNombre}
Note: {nota}                          <- opcional
```

---

### 22. Update Limit/Deductible — AL / MTC / APD / NTL

```
Update limit/deductible to the {AL|MTC|APD|NTL}
Limit: {nuevoLimite}
Deductible: {nuevoDeducible}
```

### 23. Update Limit/Deductible — GL

```
Update limit/deductible to the GL
Each Occurrence: {monto}
Damage to Rented Premises: {monto}
Med Exp: {monto}
Personal & Adv Injury: {monto}
General Aggregate: {monto}
Products-Comp/Op Agg: {monto}
```

### 24. Update Limit/Deductible — WC

```
Update limit/deductible to the WC
E.L. Each Accident: {monto}
E.L. Disease - EA Employee: {monto}
E.L. Disease - Policy Limit: {monto}
```

### 25. Update Limit/Deductible — EXL

```
Update limit/deductible to the EXL
Limit: {limite}
Aggregate: {monto}
```

---

### 26. Update Mailing Address

```
Update mailing address
{nuevaDireccionCompleta}
```

### 27. Update Vehicle Value

```
Update Vehicle's value
Vin#: {vin}
Value: {nuevoValor}
```

### 28. Delete Vehicle Value

```
Delete Vehicle's value
Vin#: {vin}
```

### 29. Update Policy Number

```
Update Policy Number to the {AL|MTC|APD|GL|WC|EXL|NTL}: {nuevoNumero}
```

### 30. No Change

```
No Change
```

---

## Ejemplos Completos

### Ejemplo 1: Cliente nuevo (DOCUMENTAR CLIENTE)

**Asunto:**
```
DOCUMENTAR CLIENTE // ACME LOGISTICS LLC // EFFECTIVE DATE 03/15/2026 // USDOT 1234567
```

**Cuerpo:**
```
Language: English
Agent: John Smith

Create Insured
Name: ACME LOGISTICS LLC
Address: 123 Main St, Miami, FL 33101
USDOT: 1234567
Phone: 305-555-1234
Email: info@acme.com
Driver1: Name: Juan / Last Name: Perez / CDL: D1234567 FL / DOB: 01/15/1985
x
Create Master
x
Add Policy
AL
Carrier: Progressive
MGA: National General
Policy Number: PAL-2026-001
Effective Date: 03/15/2026
Expiration Date: 03/15/2027
Limit: $1,000,000
Deductible: $1,000
Scheduled Autos
x
Add Vehicle/Trailer VIN#: 1HGCM82633A004352 // Year: 2020 // Description: Freightliner Cascadia // Value: $85,000 // Effective Date: 03/15/2026
```

### Ejemplo 2: Cliente nuevo con DBA

**Asunto:**
```
DOCUMENTAR CLIENTE // ACME LOGISTICS LLC // DBA Acme Transport Services // USDOT 1234567
```

**Cuerpo:**
```
Create Insured
Name: ACME LOGISTICS LLC
Dba: Acme Transport Services
Address: 456 Oak Ave, Houston, TX 77001
USDOT: 1234567
Phone: 713-555-9876
Email: dispatch@acme.com
Driver1: Name: Maria / Last Name: Garcia / CDL: G9876543 TX / DOB: 06/20/1990
x
Create Master
```

### Ejemplo 3: Cliente existente — agregar vehiculo + AI & WOS

**Asunto:**
```
BOT-END // COUTINHO LOGISTICS LLC // USDOT 4318974
```

**Cuerpo:**
```
Add Vehicle/Trailer VIN#: 3AKJHHDR5NSNS1234 // Year: 2022 // Description: Kenworth T680 // Value: $95,000 // Effective Date: 03/10/2026
x
Add Additional Insured & Waiver of Subrogation to the AL/GL
Holder name: Amazon Logistics Inc
Holder address: 410 Terry Ave N, Seattle, WA 98109
```

### Ejemplo 4: Cliente existente — solo con DBA

**Asunto:**
```
BOT-END // SMITH TRUCKING INC // DBA Smith & Sons Transport
```

**Cuerpo:**
```
Update mailing address
789 New Blvd, Suite 200, Orlando, FL 32801
```

### Ejemplo 5: Cliente existente — multiples comandos

**Asunto:**
```
BOT-END // RODRIGUEZ TRANSPORT LLC // USDOT 5678901 // DBA RTL Express
```

**Cuerpo:**
```
Add Driver: Name: Carlos / Last Name: Rodriguez / CDL: R1234567 FL / DOB: 03/22/1988
x
Add Vehicle/Trailer VIN#: 1XKDD49X0NJ432100 // Year: 2023 // Description: Peterbilt 579 // Value: $120,000 // Effective Date: 03/20/2026
x
Add Additional Insured to the AL
Holder name: FedEx Ground
Holder address: 1000 FedEx Dr, Moon Township, PA 15108
x
Add Waiver of Subrogation to the GL
Holder name: FedEx Ground
Holder address: 1000 FedEx Dr, Moon Township, PA 15108
```

---

## Notas Importantes

1. **Separador**: Siempre usar `x` o `xx` en una linea sola entre comandos
2. **Fechas**: Formato `mm/dd/yyyy` (ejemplo: `03/15/2026`)
3. **CDL**: Formato `{numero} {estado}` (ejemplo: `D1234567 FL`) o `{numero} ({estado})` (ejemplo: `D1234567 (FL)`)
4. **Polizas en AI/WOS**: Separar con `/` (ejemplo: `AL/GL/WC`)
5. **DOCUMENTAR CLIENTE**: Siempre debe incluir `Create Insured` en el cuerpo
6. **BOT-END**: Nunca debe incluir `Create Insured` en el cuerpo
7. **Identificadores**: El asunto debe tener al menos USDOT o DBA (o ambos)
