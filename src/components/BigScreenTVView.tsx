import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, Maximize2, Minimize2 } from 'lucide-react';
import type { TournamentBundle } from '../shared/types';
import { fetchPublicTournamentBundle, useTournamentLiveSync } from '../lib/api';
import { getScoringIndicators } from '../shared/engine';
import { getParticipantDisplay, MATCH_STATUS_LABEL } from '../lib/formatters';

interface BigScreenTVViewProps {
  tournamentId: string;
  onExit?: () => void;
}

export function BigScreenTVView({ tournamentId, onExit }: BigScreenTVViewProps) {
  const [bundle, setBundle] = useState<TournamentBundle | null>(null);
  const [selectedCourt, setSelectedCourt] = useState<string>('ALL');
  const [isFullscreen, setIsFullscreen] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const data = await fetchPublicTournamentBundle(tournamentId);
      setBundle(data);
    } catch {
      // Ignore transient errors
    }
  }, [tournamentId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const { wsConnected } = useTournamentLiveSync(bundle?.tournament.id ?? tournamentId, () => {
    void loadData();
  });

  const toggleFullscreen = async () => {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
        setIsFullscreen(true);
      } else {
        await document.exitFullscreen();
        setIsFullscreen(false);
      }
    } catch {
      // Fullscreen may be restricted inside iframes
    }
  };

  if (!bundle) {
    return (
      <div className="min-h-screen bg-[#152238] text-white flex items-center justify-center text-base">
        Memuat Big Screen TV Scoreboard...
      </div>
    );
  }

  const courts = bundle.tournament.courts;
  const visibleCourts =
    selectedCourt === 'ALL' ? courts : courts.filter((c) => c === selectedCourt);
  const categoryMap = new Map(bundle.categories.map((c) => [c.id, c.name]));

  return (
    <div className="min-h-screen bg-[#152238] text-white flex flex-col p-5 sm:p-8 gap-6">
      {/* TV Header */}
      <header className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-white/10">
        <div className="flex items-center gap-4">
          {onExit && (
            <button
              type="button"
              onClick={onExit}
              className="min-h-[42px] px-3.5 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-xs font-semibold flex items-center gap-1.5"
            >
              <ArrowLeft className="w-4 h-4" />
              Keluar
            </button>
          )}
          <div>
            <div className="text-xs font-semibold text-[#C5F36B]">
              Layar Skor Arena · {wsConnected ? 'Sinkron Real-Time' : 'Menghubungkan...'}
            </div>
            <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight">
              {bundle.tournament.name}
            </h1>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex flex-wrap gap-1 p-1 rounded-xl bg-white/10">
            <button
              type="button"
              onClick={() => setSelectedCourt('ALL')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                selectedCourt === 'ALL'
                  ? 'bg-[#C5F36B] text-[#152238]'
                  : 'text-slate-200 hover:text-white'
              }`}
            >
              Semua Lapangan
            </button>
            {courts.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setSelectedCourt(c)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                  selectedCourt === c
                    ? 'bg-[#C5F36B] text-[#152238]'
                    : 'text-slate-200 hover:text-white'
                }`}
              >
                {c}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={toggleFullscreen}
            className="min-w-[42px] min-h-[42px] flex items-center justify-center rounded-xl bg-white/10 hover:bg-white/15"
            title="Layar Penuh"
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
        </div>
      </header>

      {/* Courts Grid */}
      <div
        className={`flex-1 grid gap-6 ${
          visibleCourts.length === 1
            ? 'grid-cols-1'
            : visibleCourts.length === 2
            ? 'grid-cols-1 lg:grid-cols-2'
            : 'grid-cols-1 lg:grid-cols-2 xl:grid-cols-3'
        }`}
      >
        {visibleCourts.map((courtName) => {
          const courtMatches = bundle.matches.filter(
            (m) => !m.isBye && m.court === courtName
          );
          const activeMatch =
            courtMatches.find((m) => m.status === 'live' || m.status === 'paused') ??
            courtMatches.find((m) => m.status === 'ready') ??
            courtMatches.find((m) => m.status === 'scheduled');
          const nextMatch = courtMatches.find(
            (m) =>
              m.id !== activeMatch?.id &&
              (m.status === 'ready' || m.status === 'scheduled')
          );

          if (!activeMatch) {
            return (
              <div
                key={courtName}
                className="rounded-2xl bg-[#1C2C47] border border-white/10 p-6 flex flex-col justify-between"
              >
                <div className="text-lg font-bold text-[#C5F36B]">{courtName}</div>
                <div className="py-16 text-center text-slate-400">
                  Belum ada jadwal pertandingan aktif di lapangan ini.
                </div>
                <div className="text-xs text-slate-400">SmashPoint Arena Display</div>
              </div>
            );
          }

          const pA = getParticipantDisplay(
            activeMatch.participantAId,
            bundle.participants,
            activeMatch.placeholderA
          );
          const pB = getParticipantDisplay(
            activeMatch.participantBId,
            bundle.participants,
            activeMatch.placeholderB
          );
          const activeGame =
            activeMatch.games.find((g) => g.gameNumber === activeMatch.currentGame) ??
            activeMatch.games[activeMatch.games.length - 1] ?? {
              gameNumber: 1,
              scoreA: 0,
              scoreB: 0,
            };
          const indicators = getScoringIndicators(activeMatch);
          const isSingleFocus = visibleCourts.length === 1;

          return (
            <div
              key={courtName}
              className={`rounded-2xl border p-6 sm:p-8 flex flex-col justify-between gap-6 ${
                activeMatch.status === 'live'
                  ? 'bg-[#1A2D48] border-[#C5F36B]/50'
                  : 'bg-[#1C2C47] border-white/10'
              }`}
            >
              {/* Court Header */}
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-xs text-slate-300">
                    {categoryMap.get(activeMatch.categoryId)} · {activeMatch.roundLabel}
                  </div>
                  <div className="text-xl font-extrabold text-white mt-0.5">{courtName}</div>
                </div>

                <div className="text-right">
                  <div
                    className={`text-sm font-bold ${
                      activeMatch.status === 'live' ? 'text-[#C5F36B]' : 'text-slate-300'
                    }`}
                  >
                    {MATCH_STATUS_LABEL[activeMatch.status]}
                  </div>
                  <div className="text-xs text-slate-400 font-mono tabular-nums">
                    Game {activeMatch.currentGame} / {activeMatch.scoringRuleSnapshot.bestOf}
                  </div>
                </div>
              </div>

              {/* Match Alert Banner */}
              {(indicators.matchPointSide || indicators.gamePointSide || indicators.isDeuce) && (
                <div className="px-4 py-2 rounded-xl bg-[#C5F36B] text-[#152238] text-center text-sm font-extrabold">
                  {indicators.matchPointSide
                    ? `MATCH POINT · ${indicators.matchPointSide === 'A' ? pA.name : pB.name}`
                    : indicators.gamePointSide
                    ? `GAME POINT · ${indicators.gamePointSide === 'A' ? pA.name : pB.name}`
                    : 'DEUCE'}
                </div>
              )}

              {/* Scoreboard Rows */}
              <div className="divide-y divide-white/10">
                <div className="py-4 flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span
                        className={`font-bold truncate ${
                          isSingleFocus ? 'text-3xl sm:text-4xl' : 'text-xl sm:text-2xl'
                        }`}
                      >
                        {pA.name}
                      </span>
                      {activeMatch.servingSide === 'A' && activeMatch.status === 'live' && (
                        <span className="text-xs font-bold text-[#C5F36B]">
                          · Servis
                          {activeMatch.scoringRuleSnapshot.scoringSystem === 'classic'
                            ? ` (${activeMatch.serviceHand ?? 1}/${activeMatch.scoringRuleSnapshot.serviceChances ?? 2})`
                            : ''}
                        </span>
                      )}
                    </div>
                    <div className="text-xs sm:text-sm text-slate-400 truncate mt-0.5">
                      {pA.club || 'Tim A'}
                    </div>
                  </div>

                  <div className="flex items-center gap-5 shrink-0 font-mono tabular-nums">
                    <div className="flex gap-2 text-base sm:text-lg text-slate-400">
                      {activeMatch.games.map((g) => (
                        <span
                          key={g.gameNumber}
                          className={g.winnerSide === 'A' ? 'text-[#C5F36B] font-bold' : ''}
                        >
                          {g.scoreA}
                        </span>
                      ))}
                    </div>
                    <div
                      className={`font-bold text-[#C5F36B] ${
                        isSingleFocus ? 'text-7xl sm:text-8xl' : 'text-5xl sm:text-6xl'
                      }`}
                    >
                      {activeGame.scoreA}
                    </div>
                  </div>
                </div>

                <div className="py-4 flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span
                        className={`font-bold truncate ${
                          isSingleFocus ? 'text-3xl sm:text-4xl' : 'text-xl sm:text-2xl'
                        }`}
                      >
                        {pB.name}
                      </span>
                      {activeMatch.servingSide === 'B' && activeMatch.status === 'live' && (
                        <span className="text-xs font-bold text-[#C5F36B]">
                          · Servis
                          {activeMatch.scoringRuleSnapshot.scoringSystem === 'classic'
                            ? ` (${activeMatch.serviceHand ?? 1}/${activeMatch.scoringRuleSnapshot.serviceChances ?? 2})`
                            : ''}
                        </span>
                      )}
                    </div>
                    <div className="text-xs sm:text-sm text-slate-400 truncate mt-0.5">
                      {pB.club || 'Tim B'}
                    </div>
                  </div>

                  <div className="flex items-center gap-5 shrink-0 font-mono tabular-nums">
                    <div className="flex gap-2 text-base sm:text-lg text-slate-400">
                      {activeMatch.games.map((g) => (
                        <span
                          key={g.gameNumber}
                          className={g.winnerSide === 'B' ? 'text-[#C5F36B] font-bold' : ''}
                        >
                          {g.scoreB}
                        </span>
                      ))}
                    </div>
                    <div
                      className={`font-bold text-white ${
                        isSingleFocus ? 'text-7xl sm:text-8xl' : 'text-5xl sm:text-6xl'
                      }`}
                    >
                      {activeGame.scoreB}
                    </div>
                  </div>
                </div>
              </div>

              {/* Next Match Footer */}
              <div className="pt-3 border-t border-white/10 text-xs text-slate-300 flex items-center justify-between gap-2">
                {nextMatch ? (
                  <>
                    <span className="truncate">
                      Berikutnya:{' '}
                      <strong className="text-white">
                        {
                          getParticipantDisplay(
                            nextMatch.participantAId,
                            bundle.participants,
                            nextMatch.placeholderA
                          ).name
                        }{' '}
                        vs{' '}
                        {
                          getParticipantDisplay(
                            nextMatch.participantBId,
                            bundle.participants,
                            nextMatch.placeholderB
                          ).name
                        }
                      </strong>
                    </span>
                    <span className="font-mono shrink-0">{nextMatch.scheduledTime || '-'}</span>
                  </>
                ) : (
                  <span className="text-slate-400">Tidak ada antrean berikutnya di lapangan ini</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
