import { useState } from 'react';
import {
  ArrowLeft,
  ArrowLeftRight,
  CheckCircle2,
  History,
  Pause,
  Play,
  RotateCcw,
  ShieldAlert,
  WifiOff,
  X,
} from 'lucide-react';
import type { Match, Participant, TournamentBundle } from '../shared/types';
import { applyMatchScoreAction, getScoringIndicators } from '../shared/engine';
import { getParticipantDisplay, MATCH_STATUS_LABEL } from '../lib/formatters';
import { apiRequest, type OfflineScoreAction } from '../lib/api';

interface LiveScoringInterfaceProps {
  match: Match;
  categoryName: string;
  participants: Participant[];
  role: 'organizer' | 'referee';
  refereePin?: string;
  isOnline: boolean;
  pendingOfflineCount: number;
  enqueueAndSend: (
    payload: Omit<OfflineScoreAction, 'id' | 'createdAt'>
  ) => Promise<TournamentBundle | null>;
  onBundleUpdated: (bundle: TournamentBundle) => void;
  onOptimisticMatchUpdate: (match: Match) => void;
  onBack?: () => void;
}

export function LiveScoringInterface({
  match,
  categoryName,
  participants,
  role,
  refereePin,
  isOnline,
  pendingOfflineCount,
  enqueueAndSend,
  onBundleUpdated,
  onOptimisticMatchUpdate,
  onBack,
}: LiveScoringInterfaceProps) {
  const [showHistory, setShowHistory] = useState(false);
  const [showNoteModal, setShowNoteModal] = useState(false);
  const [showWoModal, setShowWoModal] = useState(false);
  const [showOverrideModal, setShowOverrideModal] = useState(false);
  const [overrideSide, setOverrideSide] = useState<'A' | 'B'>('A');
  const [overrideNote, setOverrideNote] = useState('');
  const [impactWarning, setImpactWarning] = useState<string>('');
  const [noteInput, setNoteInput] = useState(match.notes || '');
  const [errorMsg, setErrorMsg] = useState('');
  const [busy, setBusy] = useState(false);

  const handleAdminOverride = async (forceOverride = false) => {
    setBusy(true);
    setErrorMsg('');
    try {
      const bundle = await apiRequest<TournamentBundle>(`/api/matches/${match.id}/score`, {
        method: 'POST',
        role: 'organizer',
        body: JSON.stringify({
          action: 'admin_override',
          winnerSide: overrideSide,
          note: overrideNote,
          forceOverride,
        }),
      });
      onBundleUpdated(bundle);
      setShowOverrideModal(false);
      setImpactWarning('');
    } catch (err) {
      const e = err as Error & { status?: number; data?: { requiresConfirmation?: boolean } };
      if (e.status === 409 && e.data?.requiresConfirmation) {
        setImpactWarning(e.message);
      } else {
        setErrorMsg(e.message || 'Gagal melakukan koreksi admin.');
      }
    } finally {
      setBusy(false);
    }
  };

  const pA = getParticipantDisplay(match.participantAId, participants, match.placeholderA);
  const pB = getParticipantDisplay(match.participantBId, participants, match.placeholderB);
  const indicators = getScoringIndicators(match);
  const activeGame =
    match.games.find((g) => g.gameNumber === match.currentGame) ??
    match.games[match.games.length - 1] ?? { gameNumber: 1, scoreA: 0, scoreB: 0 };

  const leftSide: 'A' | 'B' = match.endsSwapped ? 'B' : 'A';
  const rightSide: 'A' | 'B' = match.endsSwapped ? 'A' : 'B';

  const sendAction = async (
    action:
      | 'start'
      | 'point_a'
      | 'point_b'
      | 'undo'
      | 'pause'
      | 'resume'
      | 'swap_ends'
      | 'toggle_serve'
      | 'confirm'
      | 'walkover'
      | 'update_note',
    extra?: { winnerSide?: 'A' | 'B'; note?: string }
  ) => {
    setErrorMsg('');
    const optimistic = applyMatchScoreAction(match, action, {
      actor: role === 'organizer' ? 'admin' : 'referee',
      winnerSide: extra?.winnerSide,
      note: extra?.note,
    });
    if (optimistic.error) {
      setErrorMsg(optimistic.error);
      return;
    }

    onOptimisticMatchUpdate(optimistic.match);
    setBusy(true);
    try {
      const updatedBundle = await enqueueAndSend({
        matchId: match.id,
        action,
        role,
        pin: refereePin,
        winnerSide: extra?.winnerSide,
        note: extra?.note,
      });
      if (updatedBundle) {
        onBundleUpdated(updatedBundle);
      }
    } catch (err) {
      setErrorMsg((err as Error).message || 'Gagal memperbarui skor.');
    } finally {
      setBusy(false);
    }
  };

  const isClassicMode = match.scoringRuleSnapshot.scoringSystem === 'classic';
  const maxServiceHands = match.scoringRuleSnapshot.serviceChances ?? (isClassicMode ? 2 : 1);
  const currentServiceHand: 1 | 2 = match.serviceHand ?? 1;

  const renderSidePanel = (side: 'A' | 'B') => {
    const isA = side === 'A';
    const player = isA ? pA : pB;
    const score = isA ? activeGame.scoreA : activeGame.scoreB;
    const gamesWon = isA ? indicators.gamesWonA : indicators.gamesWonB;
    const isServing = match.servingSide === side;
    const isWinner = match.winnerId && match.winnerId === (isA ? match.participantAId : match.participantBId);

    return (
      <div
        className={`flex flex-col justify-between p-5 sm:p-6 rounded-2xl border transition-colors ${
          isServing && match.status === 'live'
            ? 'bg-[#1D2F4C] border-[#C5F36B]/50'
            : 'bg-[#1A2A44] border-white/10'
        }`}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="text-xs font-medium text-slate-300">
              Tim {side} ·{' '}
              {isServing
                ? isClassicMode && maxServiceHands >= 2
                  ? `Servis (${currentServiceHand}/${maxServiceHands})`
                  : 'Servis'
                : 'Menerima'}
            </div>
            <div className="mt-1 text-base sm:text-xl font-bold text-white truncate">
              {player.name}
            </div>
            <div className="text-xs text-slate-400 truncate">{player.club || 'Peserta'}</div>
          </div>

          <div className="text-right shrink-0">
            <div className="text-[11px] text-slate-400">Set</div>
            <div className="font-mono text-lg font-bold text-[#C5F36B] tabular-nums">
              {gamesWon}
            </div>
          </div>
        </div>

        <div className="my-4 sm:my-6 flex items-center justify-center">
          <div
            className={`font-mono text-6xl sm:text-7xl font-bold tabular-nums tracking-tight ${
              isServing && match.status === 'live' ? 'text-[#C5F36B]' : 'text-white'
            }`}
          >
            {score}
          </div>
        </div>

        <div className="flex items-center justify-between text-xs text-slate-300">
          <span>{match.endsSwapped ? (isA ? 'Sisi Kanan' : 'Sisi Kiri') : isA ? 'Sisi Kiri' : 'Sisi Kanan'}</span>
          {isWinner && <span className="font-bold text-[#C5F36B]">Pemenang</span>}
        </div>
      </div>
    );
  };

  const renderPointButton = (side: 'A' | 'B') => {
    const player = side === 'A' ? pA : pB;
    const isFinished = match.status === 'completed' || match.status === 'walkover';
    const isServing = match.servingSide === side;

    let actionCaption = `Tambah Poin Tim ${side}`;
    let badgeText = '+1';
    if (isClassicMode) {
      if (isServing) {
        actionCaption = `Menang Reli · +1 Poin Tim ${side}`;
        badgeText = '+1';
      } else if (currentServiceHand < maxServiceHands) {
        actionCaption = `Menang Reli · Turun ke Servis 2/${maxServiceHands}`;
        badgeText = 'S2';
      } else {
        actionCaption = `Menang Reli · Pindah Bola ke Tim ${side}`;
        badgeText = 'Pindah';
      }
    }

    return (
      <button
        type="button"
        disabled={busy || isFinished || Boolean(match.awaitingConfirmation)}
        onClick={() => void sendAction(side === 'A' ? 'point_a' : 'point_b')}
        className={`min-h-[84px] sm:min-h-[96px] px-4 py-4 rounded-2xl font-bold text-left transition-transform active:scale-[0.98] disabled:opacity-40 flex items-center justify-between gap-3 ${
          side === 'A'
            ? 'bg-[#167D54] hover:bg-[#126644] text-white'
            : 'bg-[#152238] hover:bg-[#1f3252] text-white'
        }`}
      >
        <div className="min-w-0">
          <div className="text-xs opacity-80">{actionCaption}</div>
          <div className="text-base sm:text-lg font-bold truncate mt-0.5">{player.name}</div>
        </div>
        <div className="font-mono text-xl sm:text-2xl font-bold px-3 py-1.5 rounded-xl bg-white/15 shrink-0">
          {badgeText}
        </div>
      </button>
    );
  };

  const statusAlerts: string[] = [];
  if (indicators.matchPointSide) {
    statusAlerts.push(
      `Match Point untuk ${indicators.matchPointSide === 'A' ? pA.name : pB.name}`
    );
  } else if (indicators.gamePointSide) {
    statusAlerts.push(
      `Game Point untuk ${indicators.gamePointSide === 'A' ? pA.name : pB.name}`
    );
  }
  if (indicators.isDeuce) statusAlerts.push('Deuce · Selisih 2 Poin');
  if (indicators.isInterval) statusAlerts.push(`Interval ${match.scoringRuleSnapshot.intervalPoints} Poin`);

  const canUndo = match.scoreEvents.some(
    (e) =>
      e.action === 'point_a' ||
      e.action === 'point_b' ||
      e.action === 'service_fault' ||
      e.action === 'side_out'
  );

  return (
    <div className="space-y-4">
      {/* Top Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              className="min-w-[44px] min-h-[44px] px-3 rounded-xl border border-[#E2E8E5] bg-white hover:bg-slate-50 text-sm font-semibold text-[#152238] flex items-center gap-1.5"
            >
              <ArrowLeft className="w-4 h-4" />
              <span className="hidden sm:inline">Daftar Pertandingan</span>
            </button>
          )}
          <div className="min-w-0">
            <div className="text-xs text-slate-500 truncate">
              {match.court} · {match.roundLabel} · {categoryName}
            </div>
            <h2 className="text-lg font-bold text-[#152238] truncate">
              Papan Skor Wasit · Game {match.currentGame} dari {match.scoringRuleSnapshot.bestOf}
            </h2>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {(!isOnline || pendingOfflineCount > 0) && (
            <div className="px-3 py-2 rounded-xl bg-amber-50 border border-amber-200 text-xs font-semibold text-amber-800 flex items-center gap-1.5">
              <WifiOff className="w-3.5 h-3.5" />
              <span>
                {!isOnline
                  ? `Mode Offline (${pendingOfflineCount} tertunda)`
                  : `Menyinkronkan ${pendingOfflineCount} skor...`}
              </span>
            </div>
          )}

          <button
            type="button"
            onClick={() => setShowHistory(true)}
            className="min-h-[44px] px-3.5 py-2 rounded-xl border border-[#E2E8E5] bg-white hover:bg-slate-50 text-xs font-semibold text-[#152238] flex items-center gap-1.5 whitespace-nowrap"
          >
            <History className="w-4 h-4" />
            Riwayat ({match.scoreEvents.length})
          </button>
        </div>
      </div>

      {errorMsg && (
        <div className="px-4 py-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700">
          {errorMsg}
        </div>
      )}

      {/* Main Dark Court Scoreboard */}
      <div className="p-4 sm:p-6 rounded-2xl bg-[#152238] text-white space-y-4">
        {/* Status Bar */}
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-2 text-slate-300">
            <span className="font-bold text-[#C5F36B]">
              {MATCH_STATUS_LABEL[match.status]}
            </span>
            <span aria-hidden="true">·</span>
            <span>
              {isClassicMode
                ? `Mode Klasik (${maxServiceHands}× Servis)`
                : 'Mode Rally Poin'}{' '}
              · Target {match.scoringRuleSnapshot.pointsPerGame} Poin (Maks {match.scoringRuleSnapshot.maxPoints})
            </span>
          </div>

          <div className="flex items-center gap-3 font-mono tabular-nums text-slate-200">
            {match.games.map((g) => (
              <span
                key={g.gameNumber}
                className={
                  g.gameNumber === match.currentGame ? 'text-[#C5F36B] font-bold' : 'text-slate-400'
                }
              >
                G{g.gameNumber}: {g.scoreA}-{g.scoreB}
              </span>
            ))}
          </div>
        </div>

        {/* Live Game Detectors */}
        {statusAlerts.length > 0 && (
          <div className="px-4 py-2.5 rounded-xl bg-[#C5F36B] text-[#152238] font-bold text-xs sm:text-sm text-center">
            {statusAlerts.join(' · ')}
          </div>
        )}

        {/* Two Side Panels (Respects endsSwapped!) */}
        <div className="grid grid-cols-2 gap-3 sm:gap-5">
          {renderSidePanel(leftSide)}
          {renderSidePanel(rightSide)}
        </div>

        {/* Confirmation Banner when match winner reached */}
        {match.awaitingConfirmation && match.pendingWinnerId && (
          <div className="p-4 rounded-xl bg-[#167D54] border border-[#C5F36B]/50 flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="text-sm font-semibold text-white text-center sm:text-left">
              Pemenang tercapai:{' '}
              <span className="text-[#C5F36B] font-bold">
                {getParticipantDisplay(match.pendingWinnerId, participants).name}
              </span>
              . Konfirmasi hasil akhir untuk memperbarui klasemen & bracket.
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                disabled={!canUndo}
                onClick={() => void sendAction('undo')}
                className="min-h-[44px] px-4 py-2 rounded-xl bg-white/15 hover:bg-white/25 text-xs font-semibold text-white"
              >
                Undo Poin Terakhir
              </button>
              <button
                type="button"
                onClick={() => void sendAction('confirm')}
                className="min-h-[44px] px-5 py-2 rounded-xl bg-[#C5F36B] hover:bg-[#b8ea55] text-xs font-bold text-[#152238] flex items-center gap-1.5"
              >
                <CheckCircle2 className="w-4 h-4" />
                Konfirmasi Hasil Akhir
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Ergonomic Bottom Thumb-Zone Controls */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {renderPointButton(leftSide)}
        {renderPointButton(rightSide)}
      </div>

      {/* Referee Action Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-6 gap-2.5">
        <button
          type="button"
          disabled={!canUndo || busy}
          onClick={() => void sendAction('undo')}
          className="min-h-[46px] px-3 py-2 rounded-xl border border-[#E2E8E5] bg-white hover:bg-slate-50 disabled:opacity-40 text-xs font-semibold text-[#152238] flex items-center justify-center gap-1.5"
        >
          <RotateCcw className="w-4 h-4" />
          Undo
        </button>

        <button
          type="button"
          onClick={() => void sendAction('swap_ends')}
          className="min-h-[46px] px-3 py-2 rounded-xl border border-[#E2E8E5] bg-white hover:bg-slate-50 text-xs font-semibold text-[#152238] flex items-center justify-center gap-1.5"
        >
          <ArrowLeftRight className="w-4 h-4" />
          Tukar Sisi
        </button>

        <button
          type="button"
          onClick={() => void sendAction('toggle_serve')}
          className="min-h-[46px] px-3 py-2 rounded-xl border border-[#E2E8E5] bg-white hover:bg-slate-50 text-xs font-semibold text-[#152238] flex items-center justify-center gap-1.5"
        >
          Pindah Servis
        </button>

        {match.status === 'live' ? (
          <button
            type="button"
            onClick={() => void sendAction('pause')}
            className="min-h-[46px] px-3 py-2 rounded-xl border border-[#E2E8E5] bg-white hover:bg-slate-50 text-xs font-semibold text-[#152238] flex items-center justify-center gap-1.5"
          >
            <Pause className="w-4 h-4" />
            Jeda
          </button>
        ) : (
          <button
            type="button"
            disabled={match.status === 'completed' || match.status === 'walkover'}
            onClick={() =>
              void sendAction(match.status === 'paused' ? 'resume' : 'start')
            }
            className="min-h-[46px] px-3 py-2 rounded-xl border border-[#E2E8E5] bg-white hover:bg-slate-50 disabled:opacity-40 text-xs font-semibold text-[#167D54] flex items-center justify-center gap-1.5"
          >
            <Play className="w-4 h-4" />
            {match.status === 'paused' ? 'Lanjutkan' : 'Mulai'}
          </button>
        )}

        <button
          type="button"
          onClick={() => {
            setNoteInput(match.notes || '');
            setShowNoteModal(true);
          }}
          className="min-h-[46px] px-3 py-2 rounded-xl border border-[#E2E8E5] bg-white hover:bg-slate-50 text-xs font-semibold text-[#152238]"
        >
          Catatan
        </button>

        <button
          type="button"
          disabled={match.status === 'completed' || match.status === 'walkover'}
          onClick={() => setShowWoModal(true)}
          className="min-h-[46px] px-3 py-2 rounded-xl border border-[#E2E8E5] bg-white hover:bg-red-50 hover:border-red-200 disabled:opacity-40 text-xs font-semibold text-red-600 flex items-center justify-center gap-1.5"
        >
          <ShieldAlert className="w-4 h-4" />
          Walkover
        </button>
      </div>

      {role === 'organizer' && (match.status === 'completed' || match.status === 'walkover') && (
        <div className="p-4 rounded-xl bg-white border border-[#E2E8E5] flex flex-wrap items-center justify-between gap-3">
          <div className="text-xs text-slate-600">
            Pertandingan sudah selesai. Sebagai Panitia/Admin, Anda dapat mengoreksi pemenang jika
            terjadi kesalahan pencatatan.
          </div>
          <button
            type="button"
            onClick={() => {
              setImpactWarning('');
              setOverrideSide(match.winnerId === match.participantAId ? 'A' : 'B');
              setShowOverrideModal(true);
            }}
            className="px-4 py-2 rounded-xl border border-[#E2E8E5] hover:border-[#152238] text-xs font-semibold text-[#152238]"
          >
            Koreksi Hasil (Admin)
          </button>
        </div>
      )}

      {/* Note Modal */}
      {showNoteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#152238]/60 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white border border-[#E2E8E5] p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-[#152238]">Catatan Pertandingan</h3>
              <button type="button" onClick={() => setShowNoteModal(false)}>
                <X className="w-5 h-5 text-slate-400" />
              </button>
            </div>
            <textarea
              rows={3}
              value={noteInput}
              onChange={(e) => setNoteInput(e.target.value)}
              placeholder="Contoh: Cedera ringan pada game 2, medical timeout 3 menit."
              className="w-full p-3 rounded-xl border border-[#E2E8E5] text-sm"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowNoteModal(false)}
                className="px-4 py-2 rounded-xl border border-[#E2E8E5] text-xs font-semibold"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={() => {
                  void sendAction('update_note', { note: noteInput });
                  setShowNoteModal(false);
                }}
                className="px-4 py-2 rounded-xl bg-[#167D54] text-white text-xs font-semibold"
              >
                Simpan Catatan
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Walkover Modal */}
      {showWoModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#152238]/60 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white border border-[#E2E8E5] p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-[#152238]">Tetapkan Menang Walkover (WO)</h3>
              <button type="button" onClick={() => setShowWoModal(false)}>
                <X className="w-5 h-5 text-slate-400" />
              </button>
            </div>
            <p className="text-xs text-slate-600">
              Pilih tim yang dinyatakan menang karena lawan berhalangan hadir atau mengundurkan diri.
            </p>
            <div className="grid grid-cols-1 gap-2.5">
              <button
                type="button"
                onClick={() => {
                  void sendAction('walkover', { winnerSide: 'A', note: `${pA.name} menang WO` });
                  setShowWoModal(false);
                }}
                className="p-3.5 rounded-xl border border-[#E2E8E5] hover:border-[#167D54] text-left text-sm font-semibold text-[#152238]"
              >
                Menang WO: {pA.name}
              </button>
              <button
                type="button"
                onClick={() => {
                  void sendAction('walkover', { winnerSide: 'B', note: `${pB.name} menang WO` });
                  setShowWoModal(false);
                }}
                className="p-3.5 rounded-xl border border-[#E2E8E5] hover:border-[#167D54] text-left text-sm font-semibold text-[#152238]"
              >
                Menang WO: {pB.name}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Audit History Drawer */}
      {showHistory && (
        <div className="fixed inset-0 z-50 flex justify-end bg-[#152238]/50">
          <div className="w-full max-w-md bg-white h-full border-l border-[#E2E8E5] flex flex-col">
            <div className="px-5 py-4 border-b border-[#E2E8E5] flex items-center justify-between">
              <h3 className="font-bold text-[#152238]">Riwayat Perubahan Skor</h3>
              <button
                type="button"
                onClick={() => setShowHistory(false)}
                className="p-2 rounded-lg hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto divide-y divide-[#E2E8E5]">
              {match.scoreEvents.length === 0 ? (
                <div className="p-6 text-center text-sm text-slate-500">
                  Belum ada catatan aktivitas skor.
                </div>
              ) : (
                [...match.scoreEvents].reverse().map((ev) => (
                  <div key={ev.id} className="px-5 py-3 text-xs space-y-1">
                    <div className="flex items-center justify-between text-slate-500">
                      <span className="font-semibold text-[#152238]">
                        {ev.action === 'point_a'
                          ? `+1 ${pA.name}`
                          : ev.action === 'point_b'
                          ? `+1 ${pB.name}`
                          : ev.action === 'service_fault'
                          ? ev.note || 'Turun ke Servis ke-2'
                          : ev.action === 'side_out'
                          ? ev.note || 'Pindah Bola'
                          : ev.action === 'undo'
                          ? 'Undo Skor'
                          : ev.note || ev.action}
                      </span>
                      <span className="font-mono tabular-nums">
                        {new Date(ev.timestamp).toLocaleTimeString('id-ID', {
                          hour: '2-digit',
                          minute: '2-digit',
                          second: '2-digit',
                        })}
                      </span>
                    </div>
                    <div className="font-mono text-slate-600 tabular-nums">
                      Game {ev.gameNumber}: {ev.oldScoreA}–{ev.oldScoreB} → {ev.newScoreA}–{ev.newScoreB}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
      {/* Admin Override Confirmation Modal */}
      {showOverrideModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#152238]/60 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white border border-[#E2E8E5] p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-[#152238]">Koreksi Pemenang (Admin)</h3>
              <button type="button" onClick={() => setShowOverrideModal(false)}>
                <X className="w-5 h-5 text-slate-400" />
              </button>
            </div>

            {impactWarning && (
              <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-800 space-y-1">
                <div className="font-bold">Konfirmasi Dampak Bracket</div>
                <p>{impactWarning}</p>
              </div>
            )}

            <div className="space-y-2">
              <label className="block text-xs font-semibold text-[#152238]">Pilih Pemenang Sah</label>
              <select
                value={overrideSide}
                onChange={(e) => setOverrideSide(e.target.value as 'A' | 'B')}
                className="w-full px-3 py-2.5 rounded-xl border border-[#E2E8E5] text-sm"
              >
                <option value="A">{pA.name}</option>
                <option value="B">{pB.name}</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#152238] mb-1">
                Catatan Audit Koreksi
              </label>
              <input
                type="text"
                value={overrideNote}
                onChange={(e) => setOverrideNote(e.target.value)}
                placeholder="Alasan perubahan hasil pertandingan"
                className="w-full px-3 py-2 rounded-xl border border-[#E2E8E5] text-sm"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowOverrideModal(false)}
                className="px-4 py-2 rounded-xl border border-[#E2E8E5] text-xs font-semibold"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void handleAdminOverride(Boolean(impactWarning))}
                className="px-4 py-2 rounded-xl bg-[#167D54] text-white text-xs font-semibold"
              >
                {impactWarning ? 'Ya, Tetap Terapkan Koreksi' : 'Simpan Koreksi'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
