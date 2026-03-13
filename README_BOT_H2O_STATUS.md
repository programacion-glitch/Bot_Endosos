# Bot_H2O - Estado Actual

## Objetivo
Automatizar la documentación de clientes de seguros en NowCerts via Playwright. Lee emails, parsea comandos, y los ejecuta automáticamente en NowCerts.

---

## ✅ COMPLETADO Y VERIFICADO

### 1. Fix NTL (Non-Trucking Liability) - `addPolicy.ts`
**Problema**: El checkbox `Non-Owned Autos` quedaba marcado por defecto, pero NTL requiere que esté **desmarcado**.

**Solución implementada** (`addPolicy.ts:336-358`):
```typescript
if (cmd.policyType === 'NTL') {
  // NTL: NON-OWNED AUTOS must be UNCHECKED.
  await setCheckboxById(page, byIdEndsWith('automobileLiability_cbNonOwnedAutos'), false);
  
  // Check "Other 1" and fill with "Non Trucking Liability"
  await setChecked(page, byIdEndsWith('automobileLiability_cbOther1CoverageAutomobileLiability'), true);
  await other1Text.fill('Non Trucking Liability');
}
```

**Verificación live (2026-03-13)**:
| Checkbox | Valor |
|----------|-------|
| cbAutomobileLiability | ✓ true |
| cbScheduledAutos | ✓ true |
| cbNonOwnedAutos | ✓ **false** (clave!) |
| cbOther1CoverageAutomobileLiability | ✓ true |
| txtOther1CoverageAutomobileLiability | ✓ "Non Trucking Liability" |

### 2. Fix Selector `POLICY_ADD_NEW` - `addPolicy.ts:6`
**Problema**: El selector `a.action-insert[href*="Policies/Insert.aspx"]` fallaba porque el link del nav menu está oculto.

**Solución**:
```typescript
// Antes (roto):
const POLICY_ADD_NEW = 'a.action-insert[href*="Policies/Insert.aspx"]';

// Después (funcionando):
const POLICY_ADD_NEW = 'a[href*="Policies/Insert.aspx"][href*="TruckingCompanyId"]';
```

El selector ahora distingue entre:
- Nav menu link (oculto): `/Policies/Insert.aspx?MomentumUrl=...`
- List page link (visible): `/Policies/Insert.aspx?TruckingCompanyId=...`

### 3. Otros Fixes Previos (ya verificados)
- `addWaiverSubrogation.ts` y `addAIandWOS.ts`: 
  - EXL label fix: `"Excess"` → `"Umbrella Liability"`
  - Save button: selector corregido
  - Row selector más preciso para SUBR WVD
- `_holderHelpers.ts`: `searchOrCreateHolder()` fortalecido con guards
- `browserManager.ts`: `getContext()` detecta y recrea contexto cerrado
- **Test `run-pix3-gl-ai-wos.ts`**: 5/5 comandos pasaron end-to-end

---

## 📋 PENDIENTE / PRÓXIMOS PASOS

### 1. ID Card para NTL
**Estado**: Implementar que NO se genere ID Card para políticas NTL.
**Regla**: ID Card solo debe crearse cuando hay un `AL` (Automobile Liability) explícito en el contexto actual, nunca NTL ni Commercial Auto fallback.

### 2. Testing Continuo
- Ejecutar más tests end-to-end para validar la estabilidad
- Verificar que el flujo completo (email → parse → execute) funciona

### 3. Manejo de Errores
- Agregar más logs de contexto cuando fallan comandos
- Implementar reintentos específicos por tipo de error

---

## Archivos Clave

```
src/actions/
├── addPolicy.ts           ← NTL fix + POLICY_ADD_NEW selector
├── addWaiverSubrogation.ts
├── addAIandWOS.ts
├── addAdditionalInsured.ts
├── _holderHelpers.ts
├── dispatcher.ts
└── _base.ts

src/browser/
├── browserManager.ts
└── nowcertsLogin.ts

run-ntl-step10-validation.ts  ← Test NTL (PASÓ)
run-pix3-gl-ai-wos.ts         ← Test GL/AI/WOS (5/5 PASÓ)
```

---

## Comandos de Test

```bash
# Test NTL
npx ts-node run-ntl-step10-validation.ts

# Test GL + AI + WOS
npx ts-node run-pix3-gl-ai-wos.ts
```

---

## Notas Importantes

- **NTL usa "Other 1"** para la cobertura: checkbox `cbOther1CoverageAutomobileLiability` + texto `txtOther1CoverageAutomobileLiability`
- **Scheduled Autos** debe estar marcado para NTL
- **Non-Owned Autos** debe estar desmarcado para NTL
- El selector de "+ Add New" en Policies list debe incluir `TruckingCompanyId` para evitar confusión con el nav menu
