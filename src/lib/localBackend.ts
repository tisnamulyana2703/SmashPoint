import type { AppDatabase } from '../shared/types.ts';
import { dispatchSmashPointApi } from '../shared/apiHandlers.ts';
import { createSeedDatabase } from '../shared/seed.ts';

const LOCAL_DB_STORAGE_KEY = 'smashpoint_local_db_v1';
export const LOCAL_SYNC_CHANNEL_NAME = 'smashpoint_sync_channel';

let memoryDbFallback: AppDatabase | null = null;
let broadcastChannel: BroadcastChannel | null = null;

function getSyncChannel(): BroadcastChannel | null {
  if (typeof window === 'undefined' || typeof BroadcastChannel === 'undefined') return null;
  if (!broadcastChannel) {
    broadcastChannel = new BroadcastChannel(LOCAL_SYNC_CHANNEL_NAME);
  }
  return broadcastChannel;
}

function loadLocalDatabase(): AppDatabase {
  if (typeof window !== 'undefined') {
    try {
      const raw = window.localStorage.getItem(LOCAL_DB_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as AppDatabase;
        if (parsed && Array.isArray(parsed.tournaments)) {
          memoryDbFallback = parsed;
          return parsed;
        }
      }
    } catch {
      // Fall back to memory
    }
  }

  if (memoryDbFallback) return memoryDbFallback;
  const seeded = createSeedDatabase();
  saveLocalDatabase(seeded);
  return seeded;
}

function saveLocalDatabase(db: AppDatabase): void {
  memoryDbFallback = db;
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(LOCAL_DB_STORAGE_KEY, JSON.stringify(db));
    } catch {
      // Ignore storage quota errors
    }
  }
}

function broadcastLocalUpdate(
  tournamentId: string,
  eventType = 'tournament:updated',
  matchId?: string
): void {
  const ch = getSyncChannel();
  if (!ch) return;
  try {
    ch.postMessage({
      type: eventType,
      tournamentId,
      matchId,
      timestamp: new Date().toISOString(),
    });
  } catch {
    // Ignore channel errors
  }
}

export function executeLocalApi<T>(
  rawUrl: string,
  options: RequestInit & { pin?: string; role?: 'organizer' | 'referee' } = {}
): T {
  const method = options.method || 'GET';
  const pathname = rawUrl.startsWith('http') ? new URL(rawUrl).pathname : rawUrl.split('?')[0];

  let parsedBody: unknown = {};
  if (typeof options.body === 'string' && options.body.trim()) {
    try {
      parsedBody = JSON.parse(options.body);
    } catch {
      parsedBody = {};
    }
  } else if (options.body && typeof options.body === 'object') {
    parsedBody = options.body;
  }

  const headers: Record<string, string> = {
    ...((options.headers as Record<string, string>) || {}),
  };
  if (options.pin) headers['x-referee-pin'] = options.pin;
  if (options.role) headers['x-smashpoint-role'] = options.role;

  const result = dispatchSmashPointApi(method, pathname, parsedBody, headers, {
    load: loadLocalDatabase,
    save: saveLocalDatabase,
    broadcast: broadcastLocalUpdate,
  });

  if (result.status >= 400) {
    const data = (result.data && typeof result.data === 'object'
      ? result.data
      : {}) as Record<string, unknown>;
    const err = new Error(
      (typeof data.error === 'string' && data.error) || 'Terjadi kesalahan pada penyimpanan lokal.'
    ) as Error & {
      status?: number;
      data?: unknown;
    };
    err.status = result.status;
    err.data = data;
    throw err;
  }

  return result.data as T;
}
