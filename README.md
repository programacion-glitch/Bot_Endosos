# Bot de Endosos H2O

Bot que automatiza la documentación de endosos de seguros en NowCerts. Lee correos del buzón configurado, parsea los comandos del cuerpo del mensaje, y los ejecuta en NowCerts vía Playwright.

---

## Requisitos

- **Node.js 20+** (si se ejecuta sin Docker)
- **Docker + Docker Compose** (recomendado)
- Acceso al buzón IMAP configurado en `.env`
- Credenciales válidas de NowCerts

---

## Configuración inicial

1. Copia `.env.example` a `.env` y completa las variables:
   - **IMAP**: credenciales del buzón que recibe los correos del bot
   - **SMTP**: credenciales para enviar review emails y notificaciones
   - **NowCerts**: usuario y contraseña
   - **REVIEW_EMAIL**: destinatario del resumen (`services@h2oins.com`)
   - **ERROR_NOTIFY_EMAIL**: destinatario de notificaciones de error (`programacion@h2oins.com`)

2. Verifica que `data/agents.xlsx` esté presente con la lista de agentes activos.

---

## Ejecución con Docker (recomendado)

El proyecto incluye `Dockerfile` y `docker-compose.yml` listos para usar. La imagen base es `mcr.microsoft.com/playwright:v1.41.0-jammy` que ya trae Node 20, Chromium y todas las dependencias del sistema (fonts, codecs, libs de audio/video) preinstaladas — no necesitas instalar Chromium manualmente.

### Primera vez (build + start)
```bash
docker compose up -d --build
```

### Ver logs en tiempo real
```bash
docker compose logs -f
```

### Detener
```bash
docker compose down
```

### Reiniciar (después de cambiar el .env)
```bash
docker compose restart
```

### Reconstruir (después de cambiar código)
```bash
docker compose up -d --build
```

### Detalles de la configuración Docker

- **Headless forzado** (`HEADLESS=true`) — el contenedor no tiene display
- **Zona horaria** `America/Chicago` (configurable en `Dockerfile` y `docker-compose.yml`)
- **Restart automático** (`unless-stopped`) — si el contenedor se cae, Docker lo reinicia
- **`shm_size: 2gb`** — Chromium necesita memoria compartida para páginas pesadas
- **Volúmenes persistentes**:
  - `./downloads` → PDFs descargados quedan en el host
  - `./logs` → logs del bot accesibles desde el host
  - `./data` → puedes editar `agents.xlsx` sin rebuild
- **`.env` montado** — los secrets vienen del archivo del host, no se hardcodean en la imagen

---

## Ejecución sin Docker (desarrollo)

### Modo polling (escucha emails automáticamente)
```bash
npm run dev
```
Usa `ts-node-dev` con hot-reload — si cambias código, se reinicia solo. Para detenerlo: `Ctrl+C`.

### Modo producción local
```bash
npm run build && npm start
```

### Ejecución manual de un correo (testing)
Crea un archivo JSON con la estructura del correo y ejecuta:
```bash
npx ts-node src/runManual.ts ruta/al/correo.json
```

---

## Comandos soportados

El bot reconoce comandos en el cuerpo del email cuando el subject empieza con `BOT-END`, `END-BOT` o `BOT-DOCUMENTAR`. Cada comando se separa por línea en blanco o `xx`.

| Comando | Descripción |
|---------|-------------|
| `Create Insured` | Crea un nuevo asegurado |
| `Create Master` | Crea el certificado master |
| `Add Vehicle` / `Add Trailer` | Agrega un vehículo o trailer (con VIN check + ID Card automático si hay póliza AL) |
| `Add Driver` | Agrega un driver al asegurado |
| `Remove Vehicle` / `Remove Driver` / `Remove Holder` | Archiva el item |
| `Add Policy` | Crea una póliza (AL, NTL, MTC, APD, GL, WC, EXL) y la asigna al master |
| `Update limit/deductible` | Actualiza límites/deducibles de una póliza |
| `Update Policy Number` | Cambia el número de póliza |
| `Update mailing address` | Actualiza la dirección del asegurado, master e ID Cards |
| `Update Vehicle's value` / `Delete Vehicle's value` | Modifica el valor del vehículo |
| `Add Additional Insured to the AL/GL` | Agrega AI a las pólizas indicadas |
| `Add Waiver of Subrogation to the AL/GL/WC` | Agrega WOS a las pólizas |
| `Add Additional Insured & Waiver of Subrogation to the {AL/GL/WC}` | Agrega AI + WOS combinado |
| `Add Loss Payee to VIN# XXXX` | Agrega Loss Payee a un vehículo específico |
| `Add Note to Holder` / `Add Note to Master` | Agrega notas al holder o al master certificate |
| `Update Holder's name/address` / `Update LP Holder` | Actualiza nombre o dirección del holder |
| `No Change` | Solo responde "Recibido" sin modificar nada |

Después de `***` o `NOTAS ADICIONALES` el parser ignora el resto del cuerpo.

---

## Notificaciones automáticas

- **Review email** (`services@h2oins.com`): se envía siempre con el resumen de la ejecución y los certificados/ID Cards descargados
- **Error notification** (`programacion@h2oins.com`): se envía cuando un comando falla, con detalles técnicos del error y screenshots adjuntos

Las capturas de pantalla de errores se guardan en `logs/screenshots/` con timestamp.

---

## Estructura del proyecto

```
src/
├── actions/              ← Lógica de cada comando
│   ├── _base.ts          ← Helpers compartidos
│   ├── _holderHelpers.ts ← Helpers para Additional Interests
│   ├── _policyHelpers.ts ← Helpers para coverages de pólizas
│   ├── dispatcher.ts     ← Orquestador (recibe ParsedEmail y ejecuta cada comando)
│   ├── createInsured.ts
│   ├── createMaster.ts
│   ├── addPolicy.ts
│   ├── addVehicle.ts
│   ├── addDriver.ts
│   ├── removeVehicle.ts
│   ├── removeDriver.ts
│   ├── removeHolder.ts
│   ├── addAdditionalInsured.ts
│   ├── addWaiverSubrogation.ts
│   ├── addAIandWOS.ts
│   ├── addLossPayee.ts
│   ├── addNoteToHolder.ts
│   ├── addNoteToMaster.ts
│   ├── updateHolder.ts
│   ├── updateLPHolder.ts
│   ├── updateLimitDeductible.ts
│   ├── updatePolicyNumber.ts
│   ├── updateMailingAddress.ts
│   ├── updateVehicleValue.ts
│   ├── deleteVehicleValue.ts
│   └── noChange.ts
│
├── browser/
│   ├── browserManager.ts ← Singleton de Playwright (browser, context, page)
│   └── nowcertsLogin.ts  ← Login y navegación a clientes
│
├── email/
│   ├── imapClient.ts     ← Lectura de emails (IMAP)
│   ├── emailParser.ts    ← Parser de subject + body → ParsedEmail
│   └── emailSender.ts    ← Envío de review/approval/error notification
│
├── config/
│   └── config.ts         ← Carga del .env
│
├── utils/
│   ├── logger.ts         ← Winston logger
│   ├── retry.ts          ← withRetry helper
│   └── agentLookup.ts    ← Lectura de agents.xlsx
│
├── types/
│   └── index.ts          ← Types compartidos (Command, ActionResult, etc.)
│
├── main.ts               ← Entry point del modo polling (Docker / npm run dev)
└── runManual.ts          ← Entry point para ejecutar un email manualmente
```

---

## Logs y artefactos

- `logs/bot.log` — log principal del bot
- `logs/errors.log` — solo errores
- `logs/screenshots/` — capturas cuando un comando falla
- `downloads/` — PDFs descargados (certificados e ID Cards)
