import { useCallback, useEffect, useRef, useState } from 'react';
import type { TournamentBundle, TournamentSummary } from '../shared/types';
import { executeLocalApi, LOCAL_SYNC_CHANNEL_NAME } from './localBackend';

export interface OfflineScoreAction {
  id: string;
  matchId: string;
  action: string;
  pin?: string;
  role?: 'organizer' | 'referee';
  winnerSide?: 'A' | 'B';
  note?: string;
  createdAt: string;
}

const OFFLINE_QUEUE_KEY = 'smashpoint_offline_score_queue';
const API_BASE_URL =
  (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim().replace(/\/+$/, '') || '';

let localBackendMode = false;
const localModeListeners = new Set<(active: boolean) => void>();

function activateLocalBackendMode(): void {
  if (!localBackendMode) {
    localBackendMode = true;
    localModeListeners.forEach((cb) => cb(true));
  }
}

export function isLocalBackendMode(): boolean {
  return localBackendMode;
}

export function getOfflineQueue(): OfflineScoreAction[] {
  try {
    const raw = localStorage.getItem(OFFLINE_QUEUE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveOfflineQueue(items: OfflineScoreAction[]): void {
  try {
    localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(items));
  } catch {
    // Ignore storage quota errors
  }
}

export async function apiRequest<T>(
  url: string,
  options: RequestInit & { pin?: string; role?: 'organizer' | 'referee' } = {}
): Promise<T> {
  if (localBackendMode) {
    return executeLocalApi<T>(url, options);
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((options.headers as Record<string, string>) || {}),
  };
  if (options.pin) headers['x-referee-pin'] = options.pin;
  if (options.role) headers['x-smashpoint-role'] = options.role;

  const targetUrl =
    API_BASE_URL && url.startsWith('/') ? `${API_BASE_URL}${url}` : url;

  const res = await fetch(targetUrl, {
    ...options,
    headers,
  });

  const contentType = (res.headers.get('content-type') || '').toLowerCase();
  const isJsonContentType = contentType.includes('application/json');
  const hasApiHeader = res.headers.get('x-smashpoint-api') === '1';

  const text = await res.text();
  let data: Record<string, unknown> = {};
  let parsedJson = false;
  if (text) {
    try {
      data = JSON.parse(text) as Record<string, unknown>;
      parsedJson = true;
    } catch {
      parsedJson = false;
    }
  }

  const isStaticMissingBackend =
    !hasApiHeader &&
    (((res.status === 404 || res.status === 405) &&
      !(isJsonContentType && typeof data.error === 'string')) ||
      (res.ok && !isJsonContentType && !parsedJson));

  if (isStaticMissingBackend) {
    activateLocalBackendMode();
    return executeLocalApi<T>(url, options);
  }

  if (res.ok && !parsedJson && text) {
    throw new Error('Respons server tidak valid (bukan JSON).');
  }

  if (!res.ok) {
    const err = new Error(
      (typeof data.error === 'string' && data.error) || 'Terjadi kesalahan pada server.'
    ) as Error & {
      status?: number;
      data?: unknown;
    };
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data as T;
}

export function isValidTournamentBundle(data: unknown): data is TournamentBundle {
  return Boolean(
    data &&
      typeof data === 'object' &&
      'tournament' in data &&
      (data as TournamentBundle).tournament &&
      typeof (data as TournamentBundle).tournament.id === 'string'
  );
}

export async function fetchTournamentSummaries(): Promise<TournamentSummary[]> {
  const data = await apiRequest<{ tournaments?: TournamentSummary[] }>('/api/tournaments');
  return Array.isArray(data?.tournaments) ? data.tournaments : [];
}

export async function fetchTournamentBundle(id: string): Promise<TournamentBundle> {
  const data = await apiRequest<TournamentBundle>(`/api/tournaments/${encodeURIComponent(id)}`);
  if (!isValidTournamentBundle(data)) {
    throw new Error('Data turnamen dari server tidak lengkap.');
  }
  return data;
}

export async function fetchPublicTournamentBundle(slugOrId: string): Promise<TournamentBundle> {
  const data = await apiRequest<TournamentBundle>(`/api/public/${encodeURIComponent(slugOrId)}`);
  if (!isValidTournamentBundle(data)) {
    throw new Error('Data halaman publik turnamen tidak valid.');
  }
  return data;
}

export function useTournamentLiveSync(
  tournamentId: string | undefined,
  onUpdate: () => void
): { wsConnected: boolean; isOnline: boolean } {
  const [wsConnected, setWsConnected] = useState(localBackendMode);
  const [isLocal, setIsLocal] = useState(localBackendMode);
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const onUpdateRef = useRef(onUpdate);
  onUpdateRef.current = onUpdate;

  useEffect(() => {
    const listener = (active: boolean) => {
      setIsLocal(active);
      if (active) setWsConnected(true);
    };
    localModeListeners.add(listener);
    return () => {
      localModeListeners.delete(listener);
    };
  }, []);

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      onUpdateRef.current();
    };
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Multi-tab BroadcastChannel + localStorage sync for static/offline fallback mode
  useEffect(() => {
    if (!tournamentId) return;
    let channel: BroadcastChannel | null = null;

    if (typeof BroadcastChannel !== 'undefined') {
      channel = new BroadcastChannel(LOCAL_SYNC_CHANNEL_NAME);
      channel.onmessage = (event) => {
        const msg = event.data as { type?: string; tournamentId?: string } | undefined;
        if (
          msg?.type &&
          (!msg.tournamentId || msg.tournamentId === tournamentId || tournamentId === 'all')
        ) {
          onUpdateRef.current();
        }
      };
    }

    const handleStorage = (e: StorageEvent) => {
      if (e.key === 'smashpoint_local_db_v1') {
        onUpdateRef.current();
      }
    };
    window.addEventListener('storage', handleStorage);

    return () => {
      channel?.close();
      window.removeEventListener('storage', handleStorage);
    };
  }, [tournamentId]);

  useEffect(() => {
    if (!tournamentId || isLocal || localBackendMode) {
      if (isLocal || localBackendMode) setWsConnected(true);
      return;
    }

    let ws: WebSocket | null = null;
    let reconnectTimer: number | null = null;
    let closedByUser = false;
    let failedAttempts = 0;

    const connect = () => {
      if (closedByUser || localBackendMode) return;
      let wsUrl: string;
      if (API_BASE_URL) {
        const parsed = new URL(API_BASE_URL);
        const proto = parsed.protocol === 'https:' ? 'wss:' : 'ws:';
        wsUrl = `${proto}//${parsed.host}/ws`;
      } else {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        wsUrl = `${protocol}//${window.location.host}/ws`;
      }

      ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        failedAttempts = 0;
        setWsConnected(true);
        ws?.send(JSON.stringify({ type: 'subscribe', tournamentId }));
        onUpdateRef.current();
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data) as { type?: string; tournamentId?: string };
          if (
            msg.type &&
            msg.type !== 'connected' &&
            (!msg.tournamentId || msg.tournamentId === tournamentId || tournamentId === 'all')
          ) {
            onUpdateRef.current();
          }
        } catch {
          // Ignore invalid payloads
        }
      };

      ws.onclose = () => {
        if (localBackendMode) {
          setWsConnected(true);
          return;
        }
        setWsConnected(false);
        failedAttempts += 1;
        if (!closedByUser && failedAttempts <= 4) {
          reconnectTimer = window.setTimeout(connect, 2500);
        }
      };

      ws.onerror = () => {
        ws?.close();
      };
    };

    connect();

    return () => {
      closedByUser = true;
      if (reconnectTimer) window.clearTimeout(reconnectTimer);
      ws?.close();
    };
  }, [tournamentId, isLocal]);

  return { wsConnected, isOnline };
}

export function useOfflineScoreSync(
  onSynced?: (bundle: TournamentBundle) => void
): {
  pendingCount: number;
  isSyncing: boolean;
  enqueueAndSend: (payload: Omit<OfflineScoreAction, 'id' | 'createdAt'>) => Promise<TournamentBundle | null>;
  flushQueue: () => Promise<void>;
} {
  const [pendingCount, setPendingCount] = useState(() => getOfflineQueue().length);
  const [isSyncing, setIsSyncing] = useState(false);

  const flushQueue = useCallback(async () => {
    const queue = getOfflineQueue();
    if (queue.length === 0 || (typeof navigator !== 'undefined' && !navigator.onLine)) return;

    setIsSyncing(true);
    let remaining = [...queue];
    let latestBundle: TournamentBundle | null = null;

    for (const item of queue) {
      try {
        latestBundle = await apiRequest<TournamentBundle>(`/api/matches/${item.matchId}/score`, {
          method: 'POST',
          pin: item.pin,
          role: item.role,
          body: JSON.stringify({
            action: item.action,
            clientEventId: item.id,
            winnerSide: item.winnerSide,
            note: item.note,
          }),
        });
        remaining = remaining.filter((q) => q.id !== item.id);
        saveOfflineQueue(remaining);
        setPendingCount(remaining.length);
      } catch (err) {
        const status = (err as { status?: number }).status;
        if (status && status >= 400 && status < 500) {
          remaining = remaining.filter((q) => q.id !== item.id);
          saveOfflineQueue(remaining);
          setPendingCount(remaining.length);
        } else {
          break;
        }
      }
    }

    setIsSyncing(false);
    if (isValidTournamentBundle(latestBundle) && onSynced) {
      onSynced(latestBundle);
    }
  }, [onSynced]);

  useEffect(() => {
    const handleOnline = () => {
      void flushQueue();
    };
    window.addEventListener('online', handleOnline);
    const timer = window.setInterval(() => {
      if (getOfflineQueue().length > 0 && navigator.onLine) {
        void flushQueue();
      }
    }, 5000);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.clearInterval(timer);
    };
  }, [flushQueue]);

  const enqueueAndSend = useCallback(
    async (payload: Omit<OfflineScoreAction, 'id' | 'createdAt'>): Promise<TournamentBundle | null> => {
      const item: OfflineScoreAction = {
        ...payload,
        id: `cevt_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        createdAt: new Date().toISOString(),
      };

      const queue = [...getOfflineQueue(), item];
      saveOfflineQueue(queue);
      setPendingCount(queue.length);

      try {
        const bundle = await apiRequest<TournamentBundle>(`/api/matches/${item.matchId}/score`, {
          method: 'POST',
          pin: item.pin,
          role: item.role,
          body: JSON.stringify({
            action: item.action,
            clientEventId: item.id,
            winnerSide: item.winnerSide,
            note: item.note,
          }),
        });
        const nextQueue = getOfflineQueue().filter((q) => q.id !== item.id);
        saveOfflineQueue(nextQueue);
        setPendingCount(nextQueue.length);
        return bundle;
      } catch (err) {
        const status = (err as { status?: number }).status;
        if (status && status >= 400 && status < 500) {
          const nextQueue = getOfflineQueue().filter((q) => q.id !== item.id);
          saveOfflineQueue(nextQueue);
          setPendingCount(nextQueue.length);
          throw err;
        }
        return null;
      }
    },
    []
  );

  return { pendingCount, isSyncing, enqueueAndSend, flushQueue };
}
