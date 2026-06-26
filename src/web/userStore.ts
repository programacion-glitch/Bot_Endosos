import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';

export interface UserStore {
  createUser(username: string, password: string): void;
  verifyUser(username: string, password: string): boolean;
  userExists(username: string): boolean;
  close(): void;
}

const SALT_ROUNDS = 10;

export function openUserStore(dbPath: string): UserStore {
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      username TEXT PRIMARY KEY,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
  `);

  const upsert = db.prepare(`
    INSERT INTO users (username, password_hash, created_at)
    VALUES (@username, @hash, @created_at)
    ON CONFLICT(username) DO UPDATE SET password_hash = @hash
  `);
  const selectHash = db.prepare(`SELECT password_hash FROM users WHERE username = ?`);
  const selectExists = db.prepare(`SELECT 1 FROM users WHERE username = ?`);

  return {
    createUser(username, password): void {
      const hash = bcrypt.hashSync(password, SALT_ROUNDS);
      upsert.run({ username, hash, created_at: new Date().toISOString() });
    },
    verifyUser(username, password): boolean {
      const row = selectHash.get(username) as { password_hash: string } | undefined;
      if (!row) return false;
      return bcrypt.compareSync(password, row.password_hash);
    },
    userExists(username): boolean {
      return !!selectExists.get(username);
    },
    close(): void {
      db.close();
    },
  };
}
