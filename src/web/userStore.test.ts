import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { openUserStore, UserStore } from './userStore';
import Database from 'better-sqlite3';
import { tmpdir } from 'os';
import path from 'path';
import fs from 'fs';

let store: UserStore;
beforeEach(() => { store = openUserStore(':memory:'); });
afterEach(() => { store.close(); });

describe('userStore', () => {
  it('crea un usuario y verifica la contraseña correcta', () => {
    store.createUser('maria', 'secreta123');
    expect(store.verifyUser('maria', 'secreta123')).toBe(true);
  });
  it('rechaza contraseña incorrecta', () => {
    store.createUser('maria', 'secreta123');
    expect(store.verifyUser('maria', 'mala')).toBe(false);
  });
  it('verifyUser de usuario inexistente es false', () => {
    expect(store.verifyUser('nadie', 'x')).toBe(false);
  });
  it('userExists refleja la creación', () => {
    expect(store.userExists('maria')).toBe(false);
    store.createUser('maria', 'secreta123');
    expect(store.userExists('maria')).toBe(true);
  });
  it('createUser sobre un usuario existente actualiza su contraseña', () => {
    store.createUser('maria', 'vieja');
    store.createUser('maria', 'nueva');
    expect(store.verifyUser('maria', 'nueva')).toBe(true);
    expect(store.verifyUser('maria', 'vieja')).toBe(false);
  });
  it('almacena un hash bcrypt, no la contraseña en texto plano', () => {
    const dbPath = path.join(tmpdir(), `userstore-plain-${process.pid}.db`);
    const s = openUserStore(dbPath);
    try {
      s.createUser('maria', 'secreta123');
      const raw = new Database(dbPath, { readonly: true });
      const row = raw.prepare('SELECT password_hash FROM users WHERE username = ?').get('maria') as { password_hash: string };
      raw.close();
      expect(row.password_hash).not.toBe('secreta123');
      expect(row.password_hash).toMatch(/^\$2[aby]\$/); // formato bcrypt
    } finally {
      s.close();
      fs.rmSync(dbPath, { force: true });
      fs.rmSync(dbPath + '-wal', { force: true });
      fs.rmSync(dbPath + '-shm', { force: true });
    }
  });
});
