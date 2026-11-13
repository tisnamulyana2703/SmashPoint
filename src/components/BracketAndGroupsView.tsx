import { useState } from 'react';
import { RefreshCw, Trophy } from 'lucide-react';
import type { Category, Match, TournamentBundle } from '../shared/types';
import {
  formatMatchGamesSummary,
  getParticipantDisplay,
  MATCH_STATUS_LABEL,
} from '../lib/formatters';

interface BracketAndGroupsViewProps {
  bundle: TournamentBundle;
  readOnly?: boolean;
  onRegenerateCategory?: (categoryId: string) => Promise<void>;
  onSelectMatchForScoring?: (match: Match) => void;
}

export function BracketAndGroupsView({
  bundle,
  readOnly = false,
  onRegenerateCategory,
  onSelectMatchForScoring,
}: BracketAndGroupsViewProps) {
  const [selectedCatId, setSelectedCatId] = useState<string>(
    bundle.categories[0]?.id ?? ''
  );
  const [regenerating, setRegenerating] = useState(false);

  const activeCategory: Category | undefined =
    bundle.categories.find((c) => c.id === selectedCatId) ?? bundle.categories[0];

  if (!activeCategory) {
    return (
      <div className="p-8 rounded-xl bg-white border border-[#E2E8E5] text-center text-sm text-slate-500">
        Belum ada kategori pertandingan pada turnamen ini.
      </div>
    );
  }

  const catMatches = bundle.matches.filter((m) => m.categoryId === activeCategory.id);
  const groupMatches = catMatches.filter((m) => m.stage === 'group');
  const koMatches = catMatches.filter((m) => m.stage === 'knockout' && !m.isThirdPlace);
  const thirdPlaceMatch = catMatches.find((m) => m.stage === 'knockout' && m.isThirdPlace);
  const catStandings = bundle.standings[activeCategory.id] ?? [];

  const roundNumbers = Array.from(new Set(koMatches.map((m) => m.roundNumber))).sort(
    (a, b) => a - b
  );

  const finalMatch =
    roundNumbers.length > 0
      ? koMatches.find((m) => m.roundNumber === roundNumbers[roundNumbers.length - 1])
      : undefined;
  const champion =
    finalMatch?.winnerId && (finalMatch.status === 'completed' || finalMatch.status === 'walkover')
      ? getParticipantDisplay(finalMatch.winnerId, bundle.participants)
      : null;

  const handleRegenerate = async () => {
    if (!onRegenerateCategory) return;
    setRegenerating(true);
    try {
      await onRegenerateCategory(activeCategory.id);
    } finally {
      setRegenerating(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Category Selector & Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1.5 p-1 bg-white rounded-xl border border-[#E2E8E5]">
          {bundle.categories.map((cat) => (
            <button
              key={cat.id}
              type="button"
              onClick={() => setSelectedCatId(cat.id)}
              className={`px-3.5 py-2 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap ${
                cat.id === activeCategory.id
                  ? 'bg-[#152238] text-white'
                  : 'text-slate-600 hover:text-[#152238] hover:bg-[#F7F9F8]'
              }`}
            >
              {cat.name}
            </button>
          ))}
        </div>

        {!readOnly && onRegenerateCategory && (
          <button
            type="button"
            disabled={regenerating}
            onClick={handleRegenerate}
            className="min-h-[40px] px-4 py-2 rounded-xl border border-[#E2E8E5] bg-white hover:bg-slate-50 text-xs font-semibold text-[#152238] flex items-center gap-2 whitespace-nowrap disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${regenerating ? 'animate-spin' : ''}`} />
            {regenerating ? 'Menghasilkan Ulang...' : 'Generate Ulang Grup & Bracket'}
          </button>
        )}
      </div>

      {/* Group Stage Section */}
      {catStandings.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-base font-bold text-[#152238]">Fase Grup (Round Robin)</h3>
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
            {catStandings.map(({ group, rows }) => {
              const gMatches = groupMatches.filter((m) => m.groupId === group.id);
              return (
                <div
                  key={group.id}
                  className="rounded-xl bg-white border border-[#E2E8E5] overflow-hidden"
                >
                  <div className="px-4 py-3 bg-[#F7F9F8] border-b border-[#E2E8E5] flex items-center justify-between">
                    <span className="font-bold text-sm text-[#152238]">{group.name}</span>
                    <span className="text-xs text-slate-500">
                      {rows.length} Peserta · Lolos {activeCategory.groupConfig.advancePerGroup} terbaik
                    </span>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead>
                        <tr className="border-b border-[#E2E8E5] text-slate-500">
                          <th className="py-2.5 pl-4 pr-2 font-semibold">#</th>
                          <th className="py-2.5 px-2 font-semibold">Peserta</th>
                          <th className="py-2.5 px-2 font-semibold text-right font-mono">M</th>
                          <th className="py-2.5 px-2 font-semibold text-right font-mono">W</th>
                          <th className="py-2.5 px-2 font-semibold text-right font-mono">L</th>
                          <th className="py-2.5 px-2 font-semibold text-right font-mono">SG</th>
                          <th className="py-2.5 pl-2 pr-4 font-semibold text-right font-mono">SP</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#E2E8E5]">
                        {rows.map((r) => (
                          <tr
                            key={r.participantId}
                            className={r.qualified ? 'bg-[#167D54]/[0.04]' : 'bg-white'}
                          >
                            <td className="py-2.5 pl-4 pr-2 font-mono font-semibold text-[#152238] tabular-nums">
                              {r.rank}
                            </td>
                            <td className="py-2.5 px-2">
                              <div className="font-semibold text-[#152238] flex items-center gap-1.5">
                                <span>{r.participantName}</span>
                                {r.qualified && (
                                  <span className="text-[11px] font-semibold text-[#167D54]">
                                    · Lolos
                                  </span>
                                )}
                              </div>
                              <div className="text-[11px] text-slate-500">{r.clubOrTeam}</div>
                            </td>
                            <td className="py-2.5 px-2 text-right font-mono tabular-nums">{r.played}</td>
                            <td className="py-2.5 px-2 text-right font-mono font-semibold text-[#167D54] tabular-nums">
                              {r.won}
                            </td>
                            <td className="py-2.5 px-2 text-right font-mono tabular-nums">{r.lost}</td>
                            <td className="py-2.5 px-2 text-right font-mono tabular-nums">
                              {r.gamesWon - r.gamesLost >= 0 ? `+${r.gamesWon - r.gamesLost}` : r.gamesWon - r.gamesLost}
                            </td>
                            <td className="py-2.5 pl-2 pr-4 text-right font-mono tabular-nums">
                              {r.pointDiff >= 0 ? `+${r.pointDiff}` : r.pointDiff}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Group Fixtures List */}
                  <div className="border-t border-[#E2E8E5] divide-y divide-[#E2E8E5]">
                    {gMatches.map((m) => {
                      const pA = getParticipantDisplay(m.participantAId, bundle.participants);
                      const pB = getParticipantDisplay(m.participantBId, bundle.participants);
                      const isLive = m.status === 'live';
                      const canScore = !readOnly && onSelectMatchForScoring && m.participantAId && m.participantBId;
                      return (
                        <div
                          key={m.id}
                          onClick={() => canScore && onSelectMatchForScoring(m)}
                          className={`px-4 py-2.5 flex items-center justify-between gap-3 text-xs ${
                            canScore ? 'cursor-pointer hover:bg-[#F7F9F8]' : ''
                          }`}
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 text-slate-500">
                              <span>{m.court}</span>
                              {m.scheduledTime && (
                                <>
                                  <span aria-hidden="true">·</span>
                                  <span className="font-mono tabular-nums">{m.scheduledTime}</span>
                                </>
                              )}
                              <span aria-hidden="true">·</span>
                              <span
                                className={
                                  isLive
                                    ? 'font-bold text-[#167D54]'
                                    : m.status === 'completed'
                                    ? 'text-slate-600'
                                    : 'text-slate-500'
                                }
                              >
                                {MATCH_STATUS_LABEL[m.status]}
                              </span>
                            </div>
                            <div className="mt-0.5 font-medium text-[#152238] truncate">
                              <span className={m.winnerId === m.participantAId ? 'font-bold text-[#167D54]' : ''}>
                                {pA.name}
                              </span>
                              <span className="mx-1.5 text-slate-400">vs</span>
                              <span className={m.winnerId === m.participantBId ? 'font-bold text-[#167D54]' : ''}>
                                {pB.name}
                              </span>
                            </div>
                          </div>
                          <div className="font-mono font-semibold text-[#152238] tabular-nums shrink-0">
                            {formatMatchGamesSummary(m)}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Knockout Bracket Section */}
      {roundNumbers.length > 0 && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-base font-bold text-[#152238]">Bagan Sistem Gugur (Knockout)</h3>
            {champion && (
              <div className="flex items-center gap-2 text-xs font-bold text-[#167D54]">
                <Trophy className="w-4 h-4" />
                <span>Juara: {champion.name}</span>
              </div>
            )}
          </div>

          <div className="overflow-x-auto pb-3">
            <div className="inline-flex gap-6 min-w-full">
              {roundNumbers.map((rNum) => {
                const rMatches = koMatches
                  .filter((m) => m.roundNumber === rNum)
                  .sort((a, b) => a.matchOrder - b.matchOrder);
                const label = rMatches[0]?.roundLabel || `Ronde ${rNum}`;

                return (
                  <div key={rNum} className="w-72 shrink-0 flex flex-col">
                    <div className="text-xs font-bold text-slate-500 pb-3 border-b border-[#E2E8E5] mb-3">
                      {label}
                    </div>
                    <div className="flex-1 flex flex-col justify-around gap-4">
                      {rMatches.map((m) => {
                        const pA = getParticipantDisplay(
                          m.participantAId,
                          bundle.participants,
                          m.placeholderA || (m.isBye ? 'BYE' : 'Menunggu')
                        );
                        const pB = getParticipantDisplay(
                          m.participantBId,
                          bundle.participants,
                          m.placeholderB || (m.isBye ? 'BYE' : 'Menunggu')
                        );
                        const lastGames = m.games.filter(
                          (g) => g.scoreA > 0 || g.scoreB > 0 || g.winnerSide
                        );
                        const canScore =
                          !readOnly &&
                          onSelectMatchForScoring &&
                          !m.isBye &&
                          m.participantAId &&
                          m.participantBId;

                        return (
                          <div
                            key={m.id}
                            onClick={() => canScore && onSelectMatchForScoring(m)}
                            className={`rounded-xl bg-white border ${
                              m.status === 'live'
                                ? 'border-[#167D54] ring-2 ring-[#167D54]/15'
                                : 'border-[#E2E8E5]'
                            } overflow-hidden ${canScore ? 'cursor-pointer hover:border-[#152238]/40' : ''}`}
                          >
                            <div className="px-3 py-1.5 bg-[#F7F9F8] border-b border-[#E2E8E5] flex items-center justify-between text-[11px] text-slate-500">
                              <span>
                                {m.isBye ? 'Otomatis' : `${m.court || 'Lapangan'} · ${m.scheduledTime || '-'}`}
                              </span>
                              <span
                                className={
                                  m.status === 'live'
                                    ? 'font-bold text-[#167D54]'
                                    : 'font-medium text-slate-600'
                                }
                              >
                                {m.isBye ? 'BYE' : MATCH_STATUS_LABEL[m.status]}
                              </span>
                            </div>

                            <div className="divide-y divide-[#E2E8E5]">
                              <div
                                className={`px-3 py-2 flex items-center justify-between gap-2 text-xs ${
                                  m.winnerId && m.winnerId === m.participantAId
                                    ? 'bg-[#167D54]/[0.06] font-bold text-[#152238]'
                                    : 'text-[#152238]'
                                }`}
                              >
                                <span
                                  className={`truncate ${
                                    pA.isPlaceholder ? 'text-slate-400 italic font-normal' : ''
                                  }`}
                                >
                                  {pA.name}
                                </span>
                                <span className="font-mono tabular-nums shrink-0 text-slate-700">
                                  {lastGames.map((g) => g.scoreA).join('  ')}
                                </span>
                              </div>

                              <div
                                className={`px-3 py-2 flex items-center justify-between gap-2 text-xs ${
                                  m.winnerId && m.winnerId === m.participantBId
                                    ? 'bg-[#167D54]/[0.06] font-bold text-[#152238]'
                                    : 'text-[#152238]'
                                }`}
                              >
                                <span
                                  className={`truncate ${
                                    pB.isPlaceholder ? 'text-slate-400 italic font-normal' : ''
                                  }`}
                                >
                                  {pB.name}
                                </span>
                                <span className="font-mono tabular-nums shrink-0 text-slate-700">
                                  {lastGames.map((g) => g.scoreB).join('  ')}
                                </span>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}

              {/* 3rd Place Match Column */}
              {thirdPlaceMatch && (
                <div className="w-72 shrink-0 flex flex-col">
                  <div className="text-xs font-bold text-slate-500 pb-3 border-b border-[#E2E8E5] mb-3">
                    Perebutan Juara 3
                  </div>
                  <div className="flex-1 flex flex-col justify-center">
                    {(() => {
                      const m = thirdPlaceMatch;
                      const pA = getParticipantDisplay(
                        m.participantAId,
                        bundle.participants,
                        m.placeholderA
                      );
                      const pB = getParticipantDisplay(
                        m.participantBId,
                        bundle.participants,
                        m.placeholderB
                      );
                      const lastGames = m.games.filter(
                        (g) => g.scoreA > 0 || g.scoreB > 0 || g.winnerSide
                      );
                      const canScore =
                        !readOnly &&
                        onSelectMatchForScoring &&
                        m.participantAId &&
                        m.participantBId;

                      return (
                        <div
                          onClick={() => canScore && onSelectMatchForScoring(m)}
                          className={`rounded-xl bg-white border ${
                            m.status === 'live'
                              ? 'border-[#167D54] ring-2 ring-[#167D54]/15'
                              : 'border-[#E2E8E5]'
                          } overflow-hidden ${canScore ? 'cursor-pointer hover:border-[#152238]/40' : ''}`}
                        >
                          <div className="px-3 py-1.5 bg-[#F7F9F8] border-b border-[#E2E8E5] flex items-center justify-between text-[11px] text-slate-500">
                            <span>{m.court || 'Lapangan'} · {m.scheduledTime || '-'}</span>
                            <span className={m.status === 'live' ? 'font-bold text-[#167D54]' : ''}>
                              {MATCH_STATUS_LABEL[m.status]}
                            </span>
                          </div>
                          <div className="divide-y divide-[#E2E8E5]">
                            <div
                              className={`px-3 py-2 flex items-center justify-between gap-2 text-xs ${
                                m.winnerId && m.winnerId === m.participantAId
                                  ? 'bg-[#167D54]/[0.06] font-bold text-[#152238]'
                                  : ''
                              }`}
                            >
                              <span className={`truncate ${pA.isPlaceholder ? 'text-slate-400 italic' : ''}`}>
                                {pA.name}
                              </span>
                              <span className="font-mono tabular-nums">
                                {lastGames.map((g) => g.scoreA).join('  ')}
                              </span>
                            </div>
                            <div
                              className={`px-3 py-2 flex items-center justify-between gap-2 text-xs ${
                                m.winnerId && m.winnerId === m.participantBId
                                  ? 'bg-[#167D54]/[0.06] font-bold text-[#152238]'
                                  : ''
                              }`}
                            >
                              <span className={`truncate ${pB.isPlaceholder ? 'text-slate-400 italic' : ''}`}>
                                {pB.name}
                              </span>
                              <span className="font-mono tabular-nums">
                                {lastGames.map((g) => g.scoreB).join('  ')}
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
