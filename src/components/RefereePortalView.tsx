import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, KeyRound, Play, ShieldCheck } from 'lucide-react';
import type { Match, TournamentBundle } from '../shared/types';
import { apiRequest, useOfflineScoreSync, useTournamentLiveSync } from '../lib/api';
import {
  formatMatchGamesSummary,
  getParticipantDisplay,
  MATCH_STATUS_LABEL,
} from '../lib/formatters';
import { LiveScoringInterface } from './LiveScoringInterface';

interface RefereePortalViewProps {
  initialTournamentId?: string;
  initialPin?: string;
  onExitToWorkspace?: () => void;
}

export function RefereePortalView({
  initialTournamentId,
  initialPin = '',
  onExitToWorkspace,
}: RefereePortalViewProps) {
  const [pinInput, setPinInput] = useState(initialPin);
  const [verifiedPin, setVerifiedPin] = useState('');
  const [bundle, setBundle] = useState<TournamentBundle | null>(null);
  const [activeMatchId, setActiveMatchId] = useState<string | null>(null);
  const [courtFilter, setCourtFilter] = useState<string>('ALL');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const verifyPin = useCallback(
    async (pinToVerify: string) => {
      if (!pinToVerify.trim()) return;
      setLoading(true);
      setError('');
      try {
        const res = await apiRequest<{ verified: boolean; bundle: TournamentBundle }>(
          '/api/referee/verify-pin',
          {
            method: 'POST',
            body: JSON.stringify({
              pin: pinToVerify.trim(),
              tournamentId: initialTournamentId,
            }),
          }
        );
        setBundle(res.bundle);
        setVerifiedPin(pinToVerify.trim());
      } catch (err) {
        setError((err as Error).message || 'PIN Wasit tidak valid.');
      } finally {
        setLoading(false);
      }
    },
    [initialTournamentId]
  );

  useEffect(() => {
    if (initialPin) {
      void verifyPin(initialPin);
    }
  }, [initialPin, verifyPin]);

  const refreshBundle = useCallback(async () => {
    if (!verifiedPin || !bundle?.tournament.id) return;
    try {
      const res = await apiRequest<{ verified: boolean; bundle: TournamentBundle }>(
        '/api/referee/verify-pin',
        {
          method: 'POST',
          body: JSON.stringify({ pin: verifiedPin, tournamentId: bundle.tournament.id }),
        }
      );
      setBundle(res.bundle);
    } catch {
      // Ignore transient refresh failures
    }
  }, [verifiedPin, bundle?.tournament.id]);

  const { isOnline } = useTournamentLiveSync(bundle?.tournament.id, () => {
    void refreshBundle();
  });

  const { pendingCount, enqueueAndSend } = useOfflineScoreSync((syncedBundle) => {
    setBundle(syncedBundle);
  });

  if (!bundle) {
    return (
      <div className="min-h-screen bg-[#152238] flex flex-col items-center justify-center p-4">
        <div className="w-full max-w-md rounded-2xl bg-white border border-[#E2E8E5] p-6 sm:p-8 space-y-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-xl bg-[#167D54]/10 text-[#167D54] flex items-center justify-center">
                <KeyRound className="w-5 h-5" />
              </div>
              <div>
                <h1 className="text-lg font-bold text-[#152238]">Portal Wasit Lapangan</h1>
                <p className="text-xs text-slate-500">Masukkan PIN 6-digit dari panitia</p>
              </div>
            </div>
            {onExitToWorkspace && (
              <button
                type="button"
                onClick={onExitToWorkspace}
                className="text-xs font-semibold text-slate-500 hover:text-[#152238]"
              >
                Kembali
              </button>
            )}
          </div>

          {error && (
            <div className="px-4 py-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700">
              {error}
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-[#152238] mb-1.5">
                PIN Wasit Turnamen
              </label>
              <input
                type="text"
                inputMode="numeric"
                maxLength={8}
                value={pinInput}
                onChange={(e) => setPinInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && void verifyPin(pinInput)}
                placeholder="Contoh: 202611"
                className="w-full px-4 py-3.5 rounded-xl border border-[#E2E8E5] font-mono text-2xl font-bold tracking-[0.25em] text-center text-[#152238]"
              />
            </div>

            <button
              type="button"
              disabled={loading || !pinInput.trim()}
              onClick={() => void verifyPin(pinInput)}
              className="w-full min-h-[48px] rounded-xl bg-[#167D54] hover:bg-[#126644] disabled:opacity-50 text-white font-semibold text-sm transition-colors"
            >
              {loading ? 'Memeriksa PIN...' : 'Masuk ke Papan Skor'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  const categoryMap = new Map(bundle.categories.map((c) => [c.id, c.name]));
  const activeMatch = activeMatchId
    ? bundle.matches.find((m) => m.id === activeMatchId) ?? null
    : null;

  if (activeMatch) {
    return (
      <div className="min-h-screen bg-[#F7F9F8] p-3 sm:p-6">
        <div className="max-w-4xl mx-auto">
          <LiveScoringInterface
            match={activeMatch}
            categoryName={categoryMap.get(activeMatch.categoryId) || ''}
            participants={bundle.participants}
            role="referee"
            refereePin={verifiedPin}
            isOnline={isOnline}
            pendingOfflineCount={pendingCount}
            enqueueAndSend={enqueueAndSend}
            onBundleUpdated={(nextBundle) => setBundle(nextBundle)}
            onOptimisticMatchUpdate={(optMatch: Match) => {
              setBundle((prev) =>
                prev
                  ? {
                      ...prev,
                      matches: prev.matches.map((m) => (m.id === optMatch.id ? optMatch : m)),
                    }
                  : prev
              );
            }}
            onBack={() => setActiveMatchId(null)}
          />
        </div>
      </div>
    );
  }

  const scorableMatches = bundle.matches.filter(
    (m) =>
      !m.isBye &&
      m.participantAId &&
      m.participantBId &&
      (courtFilter === 'ALL' || m.court === courtFilter)
  );

  return (
    <div className="min-h-screen bg-[#F7F9F8]">
      <header className="sticky top-0 z-30 bg-[#152238] text-white px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          {onExitToWorkspace && (
            <button
              type="button"
              onClick={onExitToWorkspace}
              className="min-w-[40px] min-h-[40px] flex items-center justify-center rounded-xl bg-white/10 hover:bg-white/15"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
          )}
          <div className="min-w-0">
            <div className="text-xs text-[#C5F36B] font-semibold flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5" />
              Mode Wasit Aktif · PIN {verifiedPin}
            </div>
            <div className="font-bold text-sm truncate">{bundle.tournament.name}</div>
          </div>
        </div>

        <button
          type="button"
          onClick={() => {
            setBundle(null);
            setVerifiedPin('');
          }}
          className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 text-xs font-semibold whitespace-nowrap shrink-0"
        >
          Ganti PIN
        </button>
      </header>

      <main className="max-w-4xl mx-auto p-4 sm:p-6 space-y-5">
        <div className="flex overflow-x-auto gap-1.5 p-1 bg-white rounded-xl border border-[#E2E8E5]">
          <button
            type="button"
            onClick={() => setCourtFilter('ALL')}
            className={`px-3.5 py-2 rounded-lg text-xs font-semibold whitespace-nowrap ${
              courtFilter === 'ALL'
                ? 'bg-[#152238] text-white'
                : 'text-slate-600 hover:bg-[#F7F9F8]'
            }`}
          >
            Semua Lapangan
          </button>
          {bundle.tournament.courts.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setCourtFilter(c)}
              className={`px-3.5 py-2 rounded-lg text-xs font-semibold whitespace-nowrap ${
                courtFilter === c
                  ? 'bg-[#152238] text-white'
                  : 'text-slate-600 hover:bg-[#F7F9F8]'
              }`}
            >
              {c}
            </button>
          ))}
        </div>

        <div className="space-y-3">
          {scorableMatches.map((m) => {
            const pA = getParticipantDisplay(m.participantAId, bundle.participants);
            const pB = getParticipantDisplay(m.participantBId, bundle.participants);
            const isLive = m.status === 'live';
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => setActiveMatchId(m.id)}
                className={`w-full text-left p-4 sm:p-5 rounded-2xl bg-white border transition-colors flex items-center justify-between gap-4 ${
                  isLive
                    ? 'border-[#167D54] ring-2 ring-[#167D54]/15'
                    : 'border-[#E2E8E5] hover:border-[#152238]/40'
                }`}
              >
                <div className="min-w-0 space-y-1">
                  <div className="text-xs text-slate-500">
                    {m.court} · {m.scheduledTime || '-'} · {categoryMap.get(m.categoryId)} ·{' '}
                    {m.roundLabel}
                  </div>
                  <div className="text-base font-bold text-[#152238] truncate">
                    {pA.name} <span className="text-slate-400 font-normal mx-1">vs</span> {pB.name}
                  </div>
                  <div className="text-xs font-semibold text-[#167D54]">
                    {MATCH_STATUS_LABEL[m.status]} · Skor: {formatMatchGamesSummary(m)}
                  </div>
                </div>

                <div className="px-4 py-2.5 rounded-xl bg-[#167D54] text-white text-xs font-semibold flex items-center gap-1.5 shrink-0">
                  <Play className="w-3.5 h-3.5" />
                  Skor
                </div>
              </button>
            );
          })}
          {scorableMatches.length === 0 && (
            <div className="p-8 rounded-2xl bg-white border border-[#E2E8E5] text-center text-sm text-slate-500">
              Tidak ada pertandingan yang siap di lapangan ini.
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
