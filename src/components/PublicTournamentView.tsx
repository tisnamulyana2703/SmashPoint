import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, Monitor, QrCode } from 'lucide-react';
import arenaHeroImg from '../assets/images/badminton_arena_hero_1794570208650.jpg';
import type { TournamentBundle } from '../shared/types';
import { fetchPublicTournamentBundle, useTournamentLiveSync } from '../lib/api';
import {
  formatDateRangeID,
  formatMatchGamesSummary,
  getParticipantDisplay,
  MATCH_STATUS_LABEL,
  TOURNAMENT_STATUS_LABEL,
} from '../lib/formatters';
import { BracketAndGroupsView } from './BracketAndGroupsView';
import { StandingsAndReportsView } from './StandingsAndReportsView';
import { QrCodeModal } from './QrCodeModal';

interface PublicTournamentViewProps {
  slugOrId: string;
  onExitToWorkspace?: () => void;
  onOpenTv?: (tournamentId: string) => void;
}

type PublicTab = 'overview' | 'live' | 'schedule' | 'groups' | 'bracket' | 'results';

export function PublicTournamentView({
  slugOrId,
  onExitToWorkspace,
  onOpenTv,
}: PublicTournamentViewProps) {
  const [bundle, setBundle] = useState<TournamentBundle | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<PublicTab>('overview');
  const [showQr, setShowQr] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const data = await fetchPublicTournamentBundle(slugOrId);
      setBundle(data);
      setError('');
    } catch (err) {
      setError((err as Error).message || 'Halaman turnamen tidak ditemukan.');
    } finally {
      setLoading(false);
    }
  }, [slugOrId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const { wsConnected } = useTournamentLiveSync(bundle?.tournament.id, () => {
    void loadData();
  });

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F7F9F8] flex items-center justify-center p-6 text-sm text-slate-600">
        Memuat halaman publik turnamen...
      </div>
    );
  }

  if (error || !bundle) {
    return (
      <div className="min-h-screen bg-[#F7F9F8] flex flex-col items-center justify-center p-6 gap-4 text-center">
        <div className="text-lg font-bold text-[#152238]">{error || 'Turnamen tidak ditemukan'}</div>
        {onExitToWorkspace && (
          <button
            type="button"
            onClick={onExitToWorkspace}
            className="px-5 py-2.5 rounded-xl bg-[#152238] text-white text-sm font-semibold"
          >
            Kembali ke SmashPoint
          </button>
        )}
      </div>
    );
  }

  const nonByeMatches = bundle.matches.filter((m) => !m.isBye);
  const liveMatches = nonByeMatches.filter((m) => m.status === 'live' || m.status === 'paused');
  const upcomingMatches = nonByeMatches.filter(
    (m) => m.status === 'ready' || m.status === 'scheduled'
  );
  const completedMatches = nonByeMatches.filter(
    (m) => m.status === 'completed' || m.status === 'walkover'
  );
  const categoryMap = new Map(bundle.categories.map((c) => [c.id, c.name]));

  const renderMatchCard = (m: (typeof nonByeMatches)[number]) => {
    const pA = getParticipantDisplay(m.participantAId, bundle.participants, m.placeholderA);
    const pB = getParticipantDisplay(m.participantBId, bundle.participants, m.placeholderB);
    const activeGame =
      m.games.find((g) => g.gameNumber === m.currentGame) ?? m.games[m.games.length - 1];
    const isLive = m.status === 'live';

    return (
      <div
        key={m.id}
        className={`rounded-2xl bg-white border p-4 sm:p-5 space-y-3 ${
          isLive ? 'border-[#167D54]' : 'border-[#E2E8E5]'
        }`}
      >
        <div className="flex items-center justify-between text-xs text-slate-500">
          <span>
            {m.court || 'Lapangan'} · {categoryMap.get(m.categoryId)} · {m.roundLabel}
          </span>
          <span className={isLive ? 'font-bold text-[#167D54]' : 'font-semibold text-slate-600'}>
            {MATCH_STATUS_LABEL[m.status]}
          </span>
        </div>

        <div className="divide-y divide-[#E2E8E5]">
          <div className="py-2 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div
                className={`text-base font-bold truncate ${
                  m.winnerId === m.participantAId ? 'text-[#167D54]' : 'text-[#152238]'
                }`}
              >
                {pA.name}
              </div>
              {pA.club && <div className="text-xs text-slate-500 truncate">{pA.club}</div>}
            </div>
            <div className="flex items-center gap-3 font-mono tabular-nums shrink-0">
              {m.games.length > 1 && (
                <span className="text-xs text-slate-400">
                  {m.games
                    .filter((g) => g.gameNumber !== m.currentGame && (g.scoreA > 0 || g.scoreB > 0))
                    .map((g) => g.scoreA)
                    .join(' ')}
                </span>
              )}
              <span className="text-2xl font-bold text-[#152238]">
                {activeGame ? activeGame.scoreA : 0}
              </span>
            </div>
          </div>

          <div className="py-2 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div
                className={`text-base font-bold truncate ${
                  m.winnerId === m.participantBId ? 'text-[#167D54]' : 'text-[#152238]'
                }`}
              >
                {pB.name}
              </div>
              {pB.club && <div className="text-xs text-slate-500 truncate">{pB.club}</div>}
            </div>
            <div className="flex items-center gap-3 font-mono tabular-nums shrink-0">
              {m.games.length > 1 && (
                <span className="text-xs text-slate-400">
                  {m.games
                    .filter((g) => g.gameNumber !== m.currentGame && (g.scoreA > 0 || g.scoreB > 0))
                    .map((g) => g.scoreB)
                    .join(' ')}
                </span>
              )}
              <span className="text-2xl font-bold text-[#152238]">
                {activeGame ? activeGame.scoreB : 0}
              </span>
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-[#F7F9F8]">
      {/* Top Bar Contract (3 zones) */}
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-sm border-b border-[#E2E8E5]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-6">
          <div className="flex items-center gap-3">
            {onExitToWorkspace && (
              <button
                type="button"
                onClick={onExitToWorkspace}
                className="min-w-[40px] min-h-[40px] flex items-center justify-center rounded-xl border border-[#E2E8E5] text-[#152238] hover:bg-[#F7F9F8]"
                title="Kembali ke Workspace Panitia"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
            )}
            <span className="font-display text-lg font-extrabold tracking-tight text-[#152238] whitespace-nowrap shrink-0">
              SmashPoint
            </span>
          </div>

          <div className="hidden md:flex items-center gap-5 text-sm font-medium text-slate-600">
            <button
              type="button"
              onClick={() => setTab('overview')}
              className={`whitespace-nowrap shrink-0 ${tab === 'overview' ? 'text-[#167D54] font-semibold' : 'hover:text-[#152238]'}`}
            >
              Ringkasan
            </button>
            <button
              type="button"
              onClick={() => setTab('live')}
              className={`whitespace-nowrap shrink-0 ${tab === 'live' ? 'text-[#167D54] font-semibold' : 'hover:text-[#152238]'}`}
            >
              Skor Langsung
            </button>
            <button
              type="button"
              onClick={() => setTab('schedule')}
              className={`whitespace-nowrap shrink-0 ${tab === 'schedule' ? 'text-[#167D54] font-semibold' : 'hover:text-[#152238]'}`}
            >
              Jadwal
            </button>
            <button
              type="button"
              onClick={() => setTab('bracket')}
              className={`whitespace-nowrap shrink-0 ${tab === 'bracket' ? 'text-[#167D54] font-semibold' : 'hover:text-[#152238]'}`}
            >
              Grup & Bracket
            </button>
            <button
              type="button"
              onClick={() => setTab('results')}
              className={`whitespace-nowrap shrink-0 ${tab === 'results' ? 'text-[#167D54] font-semibold' : 'hover:text-[#152238]'}`}
            >
              Hasil & Juara
            </button>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {onOpenTv && (
              <button
                type="button"
                onClick={() => onOpenTv(bundle.tournament.id)}
                className="hidden sm:flex min-h-[40px] px-3.5 py-2 rounded-xl border border-[#E2E8E5] bg-white hover:bg-slate-50 text-xs font-semibold text-[#152238] items-center gap-1.5 whitespace-nowrap"
              >
                <Monitor className="w-4 h-4" />
                Layar TV
              </button>
            )}
            <button
              type="button"
              onClick={() => setShowQr(true)}
              className="min-h-[40px] px-4 py-2 rounded-xl bg-[#167D54] hover:bg-[#126644] text-xs font-semibold text-white flex items-center gap-1.5 whitespace-nowrap"
            >
              <QrCode className="w-4 h-4" />
              QR Code
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        {/* Hero Banner */}
        <section className="relative rounded-2xl overflow-hidden bg-[#152238] min-h-[220px] flex items-end">
          <img
            src={arenaHeroImg}
            alt="Arena Pertandingan Badminton"
            className="absolute inset-0 w-full h-full object-cover opacity-55"
            referrerPolicy="no-referrer"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[#152238] via-[#152238]/60 to-transparent" />

          <div className="relative z-10 w-full p-6 sm:p-8 flex flex-col lg:flex-row lg:items-end justify-between gap-6">
            <div className="space-y-2 max-w-2xl">
              <div className="text-xs font-semibold text-[#C5F36B]">
                {TOURNAMENT_STATUS_LABEL[bundle.tournament.status]}
                {wsConnected ? ' · Pembaruan Langsung Aktif' : ''}
              </div>
              <h1 className="text-2xl sm:text-4xl font-extrabold text-white tracking-tight text-balance">
                {bundle.tournament.name}
              </h1>
              <div className="text-sm text-slate-200">
                {formatDateRangeID(bundle.tournament.startDate, bundle.tournament.endDate)} ·{' '}
                {bundle.tournament.location}
              </div>
            </div>

            <div className="grid grid-cols-3 gap-6 sm:gap-8 text-white shrink-0">
              <div>
                <div className="font-mono text-2xl sm:text-3xl font-bold text-[#C5F36B] tabular-nums">
                  {bundle.participants.length}
                </div>
                <div className="text-xs text-slate-300">Peserta</div>
              </div>
              <div>
                <div className="font-mono text-2xl sm:text-3xl font-bold tabular-nums">
                  {nonByeMatches.length}
                </div>
                <div className="text-xs text-slate-300">Pertandingan</div>
              </div>
              <div>
                <div className="font-mono text-2xl sm:text-3xl font-bold tabular-nums">
                  {bundle.tournament.courts.length}
                </div>
                <div className="text-xs text-slate-300">Lapangan</div>
              </div>
            </div>
          </div>
        </section>

        {/* Mobile / Full Tab Switcher */}
        <div className="flex overflow-x-auto gap-1.5 p-1 bg-white rounded-xl border border-[#E2E8E5]">
          {(
            [
              { id: 'overview', label: 'Ringkasan' },
              { id: 'live', label: `Skor Langsung (${liveMatches.length})` },
              { id: 'schedule', label: 'Jadwal' },
              { id: 'groups', label: 'Grup' },
              { id: 'bracket', label: 'Bracket' },
              { id: 'results', label: 'Hasil & Juara' },
            ] as const
          ).map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              className={`px-4 py-2 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                tab === item.id
                  ? 'bg-[#167D54] text-white'
                  : 'text-slate-600 hover:text-[#152238] hover:bg-[#F7F9F8]'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        {/* Tab Contents */}
        {tab === 'overview' && (
          <div className="space-y-6">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold text-[#152238]">Pertandingan Sedang Berlangsung</h2>
                <button
                  type="button"
                  onClick={() => setTab('live')}
                  className="text-xs font-semibold text-[#167D54] hover:underline"
                >
                  Lihat Semua
                </button>
              </div>
              {liveMatches.length === 0 ? (
                <div className="p-6 rounded-xl bg-white border border-[#E2E8E5] text-sm text-slate-500">
                  Saat ini belum ada pertandingan yang sedang berlangsung.
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {liveMatches.map(renderMatchCard)}
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="rounded-xl bg-white border border-[#E2E8E5] overflow-hidden">
                <div className="px-5 py-3.5 bg-[#F7F9F8] border-b border-[#E2E8E5] font-bold text-sm text-[#152238]">
                  Jadwal Berikutnya
                </div>
                <div className="divide-y divide-[#E2E8E5]">
                  {upcomingMatches.slice(0, 6).map((m) => {
                    const pA = getParticipantDisplay(m.participantAId, bundle.participants, m.placeholderA);
                    const pB = getParticipantDisplay(m.participantBId, bundle.participants, m.placeholderB);
                    return (
                      <div key={m.id} className="px-5 py-3 flex items-center justify-between gap-3 text-sm">
                        <div className="min-w-0">
                          <div className="text-xs text-slate-500">
                            {m.court} · {categoryMap.get(m.categoryId)} · {m.roundLabel}
                          </div>
                          <div className="font-semibold text-[#152238] truncate mt-0.5">
                            {pA.name} vs {pB.name}
                          </div>
                        </div>
                        <div className="font-mono text-xs font-semibold text-slate-700 tabular-nums shrink-0">
                          {m.scheduledTime || '-'}
                        </div>
                      </div>
                    );
                  })}
                  {upcomingMatches.length === 0 && (
                    <div className="p-6 text-center text-sm text-slate-500">
                      Tidak ada jadwal mendatang.
                    </div>
                  )}
                </div>
              </div>

              <div className="rounded-xl bg-white border border-[#E2E8E5] overflow-hidden">
                <div className="px-5 py-3.5 bg-[#F7F9F8] border-b border-[#E2E8E5] font-bold text-sm text-[#152238]">
                  Hasil Pertandingan Terbaru
                </div>
                <div className="divide-y divide-[#E2E8E5]">
                  {completedMatches.slice(-6).reverse().map((m) => {
                    const pA = getParticipantDisplay(m.participantAId, bundle.participants);
                    const pB = getParticipantDisplay(m.participantBId, bundle.participants);
                    return (
                      <div key={m.id} className="px-5 py-3 flex items-center justify-between gap-3 text-sm">
                        <div className="min-w-0">
                          <div className="text-xs text-slate-500">
                            {categoryMap.get(m.categoryId)} · {m.roundLabel}
                          </div>
                          <div className="mt-0.5 truncate">
                            <span className={m.winnerId === m.participantAId ? 'font-bold text-[#167D54]' : ''}>
                              {pA.name}
                            </span>
                            <span className="mx-1.5 text-slate-400">vs</span>
                            <span className={m.winnerId === m.participantBId ? 'font-bold text-[#167D54]' : ''}>
                              {pB.name}
                            </span>
                          </div>
                        </div>
                        <div className="font-mono text-xs font-bold text-[#152238] tabular-nums shrink-0">
                          {formatMatchGamesSummary(m)}
                        </div>
                      </div>
                    );
                  })}
                  {completedMatches.length === 0 && (
                    <div className="p-6 text-center text-sm text-slate-500">
                      Belum ada hasil pertandingan.
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {tab === 'live' && (
          <div className="space-y-4">
            <h2 className="text-lg font-bold text-[#152238]">Skor Langsung Arena</h2>
            {liveMatches.length === 0 ? (
              <div className="p-8 rounded-xl bg-white border border-[#E2E8E5] text-center text-sm text-slate-500">
                Belum ada pertandingan yang sedang berjalan saat ini.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {liveMatches.map(renderMatchCard)}
              </div>
            )}
          </div>
        )}

        {tab === 'schedule' && (
          <div className="rounded-xl bg-white border border-[#E2E8E5] overflow-hidden">
            <div className="px-5 py-3.5 bg-[#F7F9F8] border-b border-[#E2E8E5] font-bold text-sm text-[#152238]">
              Seluruh Jadwal Pertandingan
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-[#E2E8E5] text-slate-500">
                    <th className="py-3 pl-5 pr-3 font-semibold">Jam</th>
                    <th className="py-3 px-3 font-semibold">Lapangan</th>
                    <th className="py-3 px-3 font-semibold">Kategori · Ronde</th>
                    <th className="py-3 px-3 font-semibold">Pertandingan</th>
                    <th className="py-3 px-3 font-semibold">Status</th>
                    <th className="py-3 pl-3 pr-5 font-semibold text-right">Skor</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E2E8E5]">
                  {nonByeMatches.map((m) => {
                    const pA = getParticipantDisplay(m.participantAId, bundle.participants, m.placeholderA);
                    const pB = getParticipantDisplay(m.participantBId, bundle.participants, m.placeholderB);
                    return (
                      <tr key={m.id} className="hover:bg-[#F7F9F8]/70">
                        <td className="py-3 pl-5 pr-3 font-mono font-semibold tabular-nums">
                          {m.scheduledTime || '-'}
                        </td>
                        <td className="py-3 px-3 font-medium text-[#152238]">{m.court}</td>
                        <td className="py-3 px-3 text-slate-600">
                          {categoryMap.get(m.categoryId)} · {m.roundLabel}
                        </td>
                        <td className="py-3 px-3 font-medium text-[#152238]">
                          {pA.name} <span className="text-slate-400 mx-1">vs</span> {pB.name}
                        </td>
                        <td className="py-3 px-3">
                          <span className={m.status === 'live' ? 'font-bold text-[#167D54]' : 'text-slate-600'}>
                            {MATCH_STATUS_LABEL[m.status]}
                          </span>
                        </td>
                        <td className="py-3 pl-3 pr-5 text-right font-mono font-semibold tabular-nums">
                          {formatMatchGamesSummary(m)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {(tab === 'groups' || tab === 'bracket') && (
          <BracketAndGroupsView bundle={bundle} readOnly />
        )}

        {tab === 'results' && <StandingsAndReportsView bundle={bundle} readOnly />}
      </main>

      <QrCodeModal
        open={showQr}
        onClose={() => setShowQr(false)}
        tournamentId={bundle.tournament.id}
        tournamentSlug={bundle.tournament.slug}
        tournamentName={bundle.tournament.name}
        onOpenTv={onOpenTv ? () => onOpenTv(bundle.tournament.id) : undefined}
      />
    </div>
  );
}
