import fs from 'node:fs';
import path from 'node:path';
import type { AppDatabase } from '../src/shared/types.ts';
import {
  buildTournamentBundle,
  createSeedDatabase,
  getTournamentSummaries,
} from '../src/shared/seed.ts';

const DATA_DIR = process.env.VERCEL
  ? '/tmp/smashpoint-data'
  : path.resolve(process.cwd(), 'data');
const DATA_FILE = path.join(DATA_DIR, 'smashpoint.json');

let cachedDb: AppDatabase | null = null;

export { buildTournamentBundle, getTournamentSummaries };

export function loadDatabase(): AppDatabase {
  if (cachedDb) return cachedDb;
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (fs.existsSync(DATA_FILE)) {
      const raw = fs.readFileSync(DATA_FILE, 'utf-8');
      const parsed = JSON.parse(raw) as AppDatabase;
      if (parsed && Array.isArray(parsed.tournaments)) {
        cachedDb = parsed;
        return cachedDb;
      }
    }
  } catch (err) {
    console.error('Gagal membaca berkas database, membuat data awal:', err);
  }

  cachedDb = createSeedDatabase();
  saveDatabase(cachedDb);
  return cachedDb;
}

export function saveDatabase(db: AppDatabase): void {
  cachedDb = db;
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    const tmpFile = `${DATA_FILE}.tmp`;
    fs.writeFileSync(tmpFile, JSON.stringify(db, null, 2), 'utf-8');
    fs.renameSync(tmpFile, DATA_FILE);
  } catch (err) {
    console.error('Gagal menyimpan berkas database (berjalan dalam memori):', err);
  }
}
