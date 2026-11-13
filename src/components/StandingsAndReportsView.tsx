import { useState } from 'react';
import { Award, Download, Edit3, Printer, Trophy, X } from 'lucide-react';
import trophyCourtImg from '../assets/images/badminton_trophy_court_1794570209935.jpg';
import type { Group, StandingRow, TournamentBundle } from '../shared/types';
import {
  exportResultsToCsv,
  formatMatchGamesSummary,
  getParticipantDisplay,
  MATCH_STATUS_LABEL,
} from '../lib/formatters';

interface StandingsAndReportsViewProps {
  bundle: TournamentBundle;
  readOnly?: boolean;
  onSaveOverride?: (
    groupId: string,
    participantId: string,
    manualRank: number,
    reason: string,
    clear?: boolean
  ) => Promise<void>;
}

export function StandingsAndReportsView({
  bundle,
  readOnly = false,
  onSaveOverride,
}: StandingsAndReportsViewProps) {
  const [selectedCatId, setSelectedCatId] = useState<string>(
    bundle.categories[0]?.id ?? ''
  );
  const [overrideTarget, setOverrideTarget] = useState<{
    group: Group;
    row: StandingRow;
  } | null>(null);
  const [manualRank, setManualRank] = useState(1);
  const [overrideReason, setOverrideReason] = useState('');
  const [savingOverride, setSavingOverride] = useState(false);

  const activeCategory =
    bundle.categories.find((c) => c.id === selectedCatId) ?? bundle.categories[0];

  const categoryMap = new Map(bundle.categories.map((c) => [c.id, c.name]));

  // Compute Podium (1st, 2nd, 3rd) per category
  const getPodiumForCategory = (catId: string) => {
    const cat = bundle.categories.find((c) => c.id === catId);
    if (!cat) return null;
    const catMatches = bundle.matches.filter((m) => m.categoryId === catId && !m.isBye);

    if (cat.format === 'group') {
      const catStandings = bundle.standings[catId] ?? [];
      if (catStandings.length === 1) {
        const rows = catStandings[0].rows;
        const finished = catMatches.length > 0 && catMatches.every((m) => m.status === 'completed' || m.status === 'walkover');
        if (!finished) return null;
        return {
          first: rows[0]?.participantName || null,
          second: rows[1]?.participantName || null,
          third: rows[2]?.participantName || null,
        };
      }
      return null;
    }

    const koMatches = catMatches.filter((m) => m.stage === 'knockout' && !m.isThirdPlace);
    const maxRound = Math.max(0, ...koMatches.map((m) => m.roundNumber));
    const finalMatch = koMatches.find((m) => m.roundNumber === maxRound);
    const thirdMatch = catMatches.find((m) => m.isThirdPlace);

    if (!finalMatch || !finalMatch.winnerId) return null;
    const secondId =
      finalMatch.winnerId === finalMatch.participantAId
        ? finalMatch.participantBId
        : finalMatch.participantAId;

    return {
      first: getParticipantDisplay(finalMatch.winnerId, bundle.participants).name,
      second: secondId ? getParticipantDisplay(secondId, bundle.participants).name : null,
      third: thirdMatch?.winnerId
        ? getParticipantDisplay(thirdMatch.winnerId, bundle.participants).name
        : null,
    };
  };

  const completedMatches = bundle.matches.filter(
    (m) =>
      !m.isBye &&
      (m.status === 'completed' || m.status === 'walkover') &&
      (!activeCategory || m.categoryId === activeCategory.id)
  );

  const activeStandings = activeCategory ? bundle.standings[activeCategory.id] ?? [] : [];
  const activePodium = activeCategory ? getPodiumForCategory(activeCategory.id) : null;

  const handleOpenOverride = (group: Group, row: StandingRow) => {
    setOverrideTarget({ group, row });
    setManualRank(row.rank);
    setOverrideReason(row.overrideReason || '');
  };

  const handleSubmitOverride = async (clear = false) => {
    if (!overrideTarget || !onSaveOverride) return;
    setSavingOverride(true);
    try {
      await onSaveOverride(
        overrideTarget.group.id,
        overrideTarget.row.participantId,
        manualRank,
        overrideReason,
        clear
      );
      setOverrideTarget(null);
    } finally {
      setSavingOverride(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1.5 p-1 bg-white rounded-xl border border-[#E2E8E5]">
          {bundle.categories.map((cat) => (
            <button
              key={cat.id}
              type="button"
              onClick={() => setSelectedCatId(cat.id)}
              className={`px-3.5 py-2 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap ${
                activeCategory?.id === cat.id
                  ? 'bg-[#152238] text-white'
                  : 'text-slate-600 hover:text-[#152238] hover:bg-[#F7F9F8]'
              }`}
            >
              {cat.name}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2 no-print">
          <button
            type="button"
            onClick={() =>
              exportResultsToCsv(
                bundle.tournament.name,
                bundle.matches,
                bundle.participants,
                categoryMap
              )
            }
            className="min-h-[40px] px-4 py-2 rounded-xl border border-[#E2E8E5] bg-white hover:bg-slate-50 text-xs font-semibold text-[#152238] flex items-center gap-2 whitespace-nowrap"
          >
            <Download className="w-4 h-4 text-[#167D54]" />
            Ekspor CSV / Excel
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            className="min-h-[40px] px-4 py-2 rounded-xl bg-[#152238] hover:bg-[#1e3150] text-xs font-semibold text-white flex items-center gap-2 whitespace-nowrap"
          >
            <Printer className="w-4 h-4" />
            Cetak / PDF
          </button>
        </div>
      </div>

      {/* Podium & Champions Section */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 rounded-2xl bg-white border border-[#E2E8E5] overflow-hidden">
        <div className="lg:col-span-4 relative min-h-[200px] bg-[#152238]">
          <img
            src={trophyCourtImg}
            alt="Trofi Kejuaraan SmashPoint"
            className="w-full h-full object-cover opacity-90"
            referrerPolicy="no-referrer"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[#152238] via-[#152238]/30 to-transparent flex flex-col justify-end p-5">
            <div className="text-xs font-semibold text-[#C5F36B]">Rekap Juara</div>
            <div className="text-lg font-bold text-white mt-0.5">
              {activeCategory?.name || 'Kategori'}
            </div>
          </div>
        </div>

        <div className="lg:col-span-8 p-6 flex flex-col justify-center">
          {activePodium ? (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="p-4 rounded-xl bg-[#167D54]/10 border border-[#167D54]/25">
                <div className="flex items-center gap-2 text-xs font-bold text-[#167D54]">
                  <Trophy className="w-4 h-4" />
                  Juara 1
                </div>
                <div className="mt-2 text-base font-bold text-[#152238]">{activePodium.first}</div>
              </div>
              <div className="p-4 rounded-xl bg-[#F7F9F8] border border-[#E2E8E5]">
                <div className="flex items-center gap-2 text-xs font-bold text-slate-600">
                  <Award className="w-4 h-4" />
                  Juara 2
                </div>
                <div className="mt-2 text-base font-bold text-[#152238]">
                  {activePodium.second || '-'}
                </div>
              </div>
              <div className="p-4 rounded-xl bg-[#F7F9F8] border border-[#E2E8E5]">
                <div className="flex items-center gap-2 text-xs font-bold text-slate-600">
                  <Award className="w-4 h-4" />
                  Juara 3
                </div>
                <div className="mt-2 text-base font-bold text-[#152238]">
                  {activePodium.third || '-'}
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="text-base font-bold text-[#152238]">
                Pertandingan Penentuan Juara Masih Berlangsung
              </div>
              <p className="text-sm text-slate-600">
                Podium Juara 1, 2, dan 3 akan terisi secara otomatis setelah pertandingan Final
                dikonfirmasi selesai oleh wasit.
              </p>
              <div className="pt-2 flex flex-wrap gap-6 text-xs text-slate-600 font-mono tabular-nums">
                <span>
                  Total Peserta:{' '}
                  <strong className="text-[#152238]">
                    {bundle.participants.filter((p) => p.categoryId === activeCategory?.id).length}
                  </strong>
                </span>
                <span>
                  Selesai:{' '}
                  <strong className="text-[#167D54]">{completedMatches.length}</strong>
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Group Standings Full Detail */}
      {activeStandings.length > 0 && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-base font-bold text-[#152238]">Klasemen Lengkap Fase Grup</h3>
            <span className="text-xs text-slate-500">
              Tie-break: Menang · Mini-league H2H · Selisih Game · Selisih Poin
            </span>
          </div>

          {activeStandings.map(({ group, rows }) => (
            <div
              key={group.id}
              className="rounded-xl bg-white border border-[#E2E8E5] overflow-hidden"
            >
              <div className="px-5 py-3 bg-[#F7F9F8] border-b border-[#E2E8E5] flex items-center justify-between">
                <span className="font-bold text-sm text-[#152238]">{group.name}</span>
                <span className="text-xs text-slate-500">
                  Keterangan: M (Main), W (Menang), L (Kalah), GM/GK (Game), PM/PK (Poin)
                </span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-[#E2E8E5] text-slate-500">
                      <th className="py-3 pl-5 pr-2 font-semibold">Pos</th>
                      <th className="py-3 px-2 font-semibold">Peserta</th>
                      <th className="py-3 px-2 font-semibold text-right font-mono">M</th>
                      <th className="py-3 px-2 font-semibold text-right font-mono">W</th>
                      <th className="py-3 px-2 font-semibold text-right font-mono">L</th>
                      <th className="py-3 px-2 font-semibold text-right font-mono">GM</th>
                      <th className="py-3 px-2 font-semibold text-right font-mono">GK</th>
                      <th className="py-3 px-2 font-semibold text-right font-mono">PM</th>
                      <th className="py-3 px-2 font-semibold text-right font-mono">PK</th>
                      <th className="py-3 px-2 font-semibold text-right font-mono">Selisih</th>
                      {!readOnly && onSaveOverride && (
                        <th className="py-3 pl-2 pr-5 font-semibold text-right no-print">Audit</th>
                      )}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E2E8E5]">
                    {rows.map((r) => (
                      <tr
                        key={r.participantId}
                        className={r.qualified ? 'bg-[#167D54]/[0.04]' : 'bg-white'}
                      >
                        <td className="py-3 pl-5 pr-2 font-mono font-bold text-[#152238] tabular-nums">
                          {r.rank}
                        </td>
                        <td className="py-3 px-2">
                          <div className="font-semibold text-[#152238]">
                            {r.participantName}
                            {r.qualified && (
                              <span className="ml-2 text-[11px] font-semibold text-[#167D54]">
                                · Lolos
                              </span>
                            )}
                            {r.isOverridden && (
                              <span className="ml-2 text-[11px] font-semibold text-amber-700">
                                · Koreksi Manual ({r.overrideReason})
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-slate-500">{r.clubOrTeam}</div>
                        </td>
                        <td className="py-3 px-2 text-right font-mono tabular-nums">{r.played}</td>
                        <td className="py-3 px-2 text-right font-mono font-bold text-[#167D54] tabular-nums">
                          {r.won}
                        </td>
                        <td className="py-3 px-2 text-right font-mono tabular-nums">{r.lost}</td>
                        <td className="py-3 px-2 text-right font-mono tabular-nums">{r.gamesWon}</td>
                        <td className="py-3 px-2 text-right font-mono tabular-nums">{r.gamesLost}</td>
                        <td className="py-3 px-2 text-right font-mono tabular-nums">{r.pointsFor}</td>
                        <td className="py-3 px-2 text-right font-mono tabular-nums">{r.pointsAgainst}</td>
                        <td className="py-3 px-2 text-right font-mono font-semibold tabular-nums">
                          {r.pointDiff >= 0 ? `+${r.pointDiff}` : r.pointDiff}
                        </td>
                        {!readOnly && onSaveOverride && (
                          <td className="py-3 pl-2 pr-5 text-right no-print">
                            <button
                              type="button"
                              onClick={() => handleOpenOverride(group, r)}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-[#152238] hover:bg-slate-100"
                              title="Koreksi Peringkat Manual (Audit)"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Completed Matches Rekap */}
      <div className="rounded-xl bg-white border border-[#E2E8E5] overflow-hidden">
        <div className="px-5 py-3.5 bg-[#F7F9F8] border-b border-[#E2E8E5] flex items-center justify-between">
          <h3 className="text-sm font-bold text-[#152238]">Rekap Hasil Pertandingan</h3>
          <span className="text-xs font-mono text-slate-500 tabular-nums">
            {completedMatches.length} Selesai
          </span>
        </div>
        {completedMatches.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-500">
            Belum ada pertandingan yang selesai pada kategori ini.
          </div>
        ) : (
          <div className="divide-y divide-[#E2E8E5]">
            {completedMatches.map((m) => {
              const pA = getParticipantDisplay(m.participantAId, bundle.participants);
              const pB = getParticipantDisplay(m.participantBId, bundle.participants);
              return (
                <div
                  key={m.id}
                  className="px-5 py-3.5 flex flex-wrap items-center justify-between gap-3 text-sm"
                >
                  <div>
                    <div className="text-xs text-slate-500">
                      {m.roundLabel} · {m.court} · {MATCH_STATUS_LABEL[m.status]}
                    </div>
                    <div className="mt-0.5 text-[#152238]">
                      <span className={m.winnerId === m.participantAId ? 'font-bold text-[#167D54]' : ''}>
                        {pA.name}
                      </span>
                      <span className="mx-2 text-slate-400">vs</span>
                      <span className={m.winnerId === m.participantBId ? 'font-bold text-[#167D54]' : ''}>
                        {pB.name}
                      </span>
                    </div>
                  </div>
                  <div className="font-mono font-bold text-[#152238] tabular-nums">
                    {formatMatchGamesSummary(m)}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Manual Standing Override Modal */}
      {overrideTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#152238]/60 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white border border-[#E2E8E5] p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-[#152238]">Koreksi Peringkat Manual</h3>
              <button type="button" onClick={() => setOverrideTarget(null)}>
                <X className="w-5 h-5 text-slate-400" />
              </button>
            </div>
            <div className="text-xs text-slate-600">
              Peserta: <strong className="text-[#152238]">{overrideTarget.row.participantName}</strong> ({overrideTarget.group.name})
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#152238] mb-1">
                Peringkat Baru
              </label>
              <input
                type="number"
                min={1}
                max={20}
                value={manualRank}
                onChange={(e) => setManualRank(Number(e.target.value) || 1)}
                className="w-full px-3 py-2 rounded-xl border border-[#E2E8E5] font-mono text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#152238] mb-1">
                Alasan Audit (Wajib)
              </label>
              <textarea
                rows={2}
                value={overrideReason}
                onChange={(e) => setOverrideReason(e.target.value)}
                placeholder="Contoh: Keputusan panitia sesuai undian koin tie-break 3 peserta."
                className="w-full p-3 rounded-xl border border-[#E2E8E5] text-sm"
              />
            </div>
            <div className="flex items-center justify-between gap-2 pt-2">
              {overrideTarget.row.isOverridden ? (
                <button
                  type="button"
                  disabled={savingOverride}
                  onClick={() => void handleSubmitOverride(true)}
                  className="px-3 py-2 rounded-xl border border-red-200 text-xs font-semibold text-red-600"
                >
                  Hapus Koreksi
                </button>
              ) : (
                <span />
              )}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setOverrideTarget(null)}
                  className="px-4 py-2 rounded-xl border border-[#E2E8E5] text-xs font-semibold"
                >
                  Batal
                </button>
                <button
                  type="button"
                  disabled={savingOverride || !overrideReason.trim()}
                  onClick={() => void handleSubmitOverride(false)}
                  className="px-4 py-2 rounded-xl bg-[#167D54] disabled:opacity-40 text-white text-xs font-semibold"
                >
                  Simpan Koreksi
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
