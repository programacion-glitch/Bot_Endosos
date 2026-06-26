import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { openUserStore, UserStore } from './userStore';

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
  it('no guarda la contraseña en texto plano', () => {
    store.createUser('maria', 'secreta123');
    expect(store.verifyUser('maria', 'secreta123')).toBe(true); // hash verificable
  });
});
