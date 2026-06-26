import 'dotenv/config';
import { openUserStore } from './userStore';
import { config } from '../config/config';

const [, , username, password] = process.argv;

if (!username || !password) {
  console.error('Uso: npx ts-node src/web/seedUser.ts <username> <password>');
  process.exit(1);
}

const store = openUserStore(config.web.usersDbPath);
store.createUser(username, password);
store.close();
console.log(`Usuario "${username}" creado/actualizado en ${config.web.usersDbPath}`);
