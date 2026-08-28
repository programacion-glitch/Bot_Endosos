/**
 * Helper de smoke test (NO se commitea — herramienta de desarrollo).
 *
 * Encola un job de prueba en la cola SQLite para verificar que el worker
 * lo toma y lo procesa end-to-end. Uso un comando NO_CHANGE: el bot abre
 * NowCerts, navega al cliente y responde "Recibido" a notifyTo. Es la prueba
 * mínima que ejercita login + navegación + el pipeline de la cola.
 *
 * IMPORTANTE: usa un cliente que EXISTA en NowCerts (edita CLIENT_NAME/USDOT,
 * o pásalos por argumentos). Si el cliente no existe, verás la alerta
 * "Cliente no encontrado" — lo cual igual confirma que la cola funciona.
 *
 * Uso:
 *   npx ts-node scripts/seedTestJob.ts "Nombre Cliente" 1234567 tu-email@h2oins.com
 *   # o edita los defaults abajo y corre: npx ts-node scripts/seedTestJob.ts
 *
 * Luego arranca el bot (npm run dev) y observa los logs: debe aparecer
 * "Procesando job de la cola: <id> (<cliente>)" y terminar en done/failed.
 */
import 'dotenv/config';
import { openJobStore } from '../src/job/jobStore';
import { config } from '../src/config/config';

const CLIENT_NAME = process.argv[2] ?? 'CAMBIA_ESTE_NOMBRE_DE_CLIENTE';
const USDOT = process.argv[3] ?? '1234567';
const NOTIFY_TO = process.argv[4] ?? config.errorNotify.email ?? 'programacion@h2oins.com';

const store = openJobStore(config.jobs.dbPath);
const job = store.createJob({
  mode: 'existing_client',
  clientName: CLIENT_NAME,
  usdot: USDOT,
  commands: [{ type: 'NO_CHANGE', rawText: 'smoke test' }],
  notifyTo: NOTIFY_TO,
  language: 'es',
  createdBy: 'smoke-test',
});

console.log('Job encolado:');
console.log('  id:        ', job.id);
console.log('  estado:    ', job.status);
console.log('  cliente:   ', job.clientName, `(USDOT ${job.usdot})`);
console.log('  notifyTo:  ', job.notifyTo);
console.log('  db:        ', config.jobs.dbPath);
console.log('\nEn cola ahora:', store.listJobs().filter(j => j.status === 'queued').length);
console.log('\nArranca el bot (npm run dev) y observa los logs del worker.');
store.close();
