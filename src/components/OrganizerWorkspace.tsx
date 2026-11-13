import { useEffect, useState } from 'react';
import {
  Activity,
  Award,
  CalendarClock,
  ExternalLink,
  GitBranch,
  KeyRound,
  LayoutDashboard,
  Menu,
  Monitor,
  Play,
  Plus,
  QrCode,
  RefreshCw,
  Settings,
  Trash2,
  Trophy,
  Upload,
  Users,
  X,
} from 'lucide-react';
import type {
  CategoryType,
  Match,
  Participant,
  ScoringPreset,
  ScoringRule,
  TournamentBundle,
  TournamentSummary,
} from '../shared/types';
import { CATEGORY_LABELS, getScoringRuleForPreset } from '../shared/engine';
import { apiRequest, useOfflineScoreSync } from '../lib/api';
import {
  FORMAT_LABEL,
  formatDateRangeID,
  formatMatchGamesSummary,
  getParticipantDisplay,
  MATCH_STATUS_LABEL,
  TOURNAMENT_STATUS_LABEL,
} from '../lib/formatters';
import { BracketAndGroupsView } from './BracketAndGroupsView';
import { LiveScoringInterface } from './LiveScoringInterface';
import { StandingsAndReportsView } from './StandingsAndReportsView';

export type WorkspaceSection =
  | 'dashboard'
  | 'tournaments'
  | 'participants'
  | 'schedule'
  | 'brackets'
  | 'scoring'
  | 'standings'
  | 'settings';

interface OrganizerWorkspaceProps {
  summaries: TournamentSummary[];
  bundle: TournamentBundle | null;
  section: WorkspaceSection;
  onChangeSection: (s: WorkspaceSection) => void;
  onSelectTournament: (id: string) => void;
  onBundleUpdated: (b: TournamentBundle) => void;
  onRefreshSummaries: () => Promise<void>;
  onOpenWizard: () => void;
  onOpenQr: () => void;
  onOpenPublic: () => void;
  onOpenTv: () => void;
  onOpenRefereePortal: () => void;
  isOnline: boolean;
  wsConnected: boolean;
}

const NAV_ITEMS: Array<{ id: WorkspaceSection; label: string; icon: typeof LayoutDashboard }> = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'tournaments', label: 'Turnamen Saya', icon: Trophy },
  { id: 'participants', label: 'Peserta', icon: Users },
  { id: 'schedule', label: 'Jadwal Pertandingan', icon: CalendarClock },
  { id: 'brackets', label: 'Grup & Bracket', icon: GitBranch },
  { id: 'scoring', label: 'Live Scoring', icon: Activity },
  { id: 'standings', label: 'Klasemen & Hasil', icon: Award },
  { id: 'settings', label: 'Pengaturan', icon: Settings },
];

export function OrganizerWorkspace({
  summaries,
  bundle,
  section,
  onChangeSection,
  onSelectTournament,
  onBundleUpdated,
  onRefreshSummaries,
  onOpenWizard,
  onOpenQr,
  onOpenPublic,
  onOpenTv,
  onOpenRefereePortal,
  isOnline,
  wsConnected,
}: OrganizerWorkspaceProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [selectedMatchId, setSelectedMatchId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  // Participants state
  const [partCatFilter, setPartCatFilter] = useState<string>('ALL');
  const [newPartName, setNewPartName] = useState('');
  const [newPartClub, setNewPartClub] = useState('');
  const [newPartCatId, setNewPartCatId] = useState('');
  const [bulkPartText, setBulkPartText] = useState('');
  const [showBulkBox, setShowBulkBox] = useState(false);

  // Schedule state
  const [schedCourtFilter, setSchedCourtFilter] = useState<string>('ALL');
  const [schedStatusFilter, setSchedStatusFilter] = useState<string>('ALL');
  const [autoStartTime, setAutoStartTime] = useState('09:00');
  const [autoIntervalMins, setAutoIntervalMins] = useState(30);

  // Settings state
  const [courtsEdit, setCourtsEdit] = useState('');
  const [tourneyNameEdit, setTourneyNameEdit] = useState('');
  const [tourneyLocEdit, setTourneyLocEdit] = useState('');
  const [scoringTargetId, setScoringTargetId] = useState<string>('__DEFAULT__');
  const [scoringRuleDraft, setScoringRuleDraft] = useState<ScoringRule>(() =>
    getScoringRuleForPreset('standard')
  );
  const [applyToPendingMatches, setApplyToPendingMatches] = useState(true);
  const [savingScoring, setSavingScoring] = useState(false);

  // Add category inline modal
  const [showAddCategory, setShowAddCategory] = useState(false);
  const [newCatType, setNewCatType] = useState<CategoryType>('mens_singles');
  const [newCatName, setNewCatName] = useState('');
  const [newCatFormat, setNewCatFormat] = useState<'group' | 'knockout' | 'group_knockout'>('knockout');
  const [newCatPreset, setNewCatPreset] = useState<ScoringPreset>('standard');

  useEffect(() => {
    if (!bundle) return;
    if (scoringTargetId === '__DEFAULT__') {
      setScoringRuleDraft({
        scoringSystem: 'rally',
        serviceChances: 1,
        ...bundle.tournament.defaultScoringRule,
      });
    } else {
      const cat = bundle.categories.find((c) => c.id === scoringTargetId);
      if (cat) {
        setScoringRuleDraft({
          scoringSystem: 'rally',
          serviceChances: 1,
          ...cat.scoringRule,
        });
      } else {
        setScoringTargetId('__DEFAULT__');
        setScoringRuleDraft({
          scoringSystem: 'rally',
          serviceChances: 1,
          ...bundle.tournament.defaultScoringRule,
        });
      }
    }
  }, [bundle?.tournament.id, scoringTargetId]);

  const { pendingCount, enqueueAndSend } = useOfflineScoreSync((syncedBundle) => {
    onBundleUpdated(syncedBundle);
  });

  const showToast = (type: 'ok' | 'err', text: string) => {
    setFeedback({ type, text });
    window.setTimeout(() => setFeedback(null), 4000);
  };

  const categoryMap = new Map((bundle?.categories ?? []).map((c) => [c.id, c.name]));
  const nonByeMatches = (bundle?.matches ?? []).filter((m) => !m.isBye);
  const liveMatches = nonByeMatches.filter((m) => m.status === 'live' || m.status === 'paused');
  const upcomingMatches = nonByeMatches.filter(
    (m) => m.status === 'ready' || m.status === 'scheduled'
  );
  const completedMatches = nonByeMatches.filter(
    (m) => m.status === 'completed' || m.status === 'walkover'
  );

  const openMatchScoring = (match: Match) => {
    setSelectedMatchId(match.id);
    onChangeSection('scoring');
  };

  const handleAddParticipant = async () => {
    if (!bundle || !newPartName.trim()) return;
    const catId = newPartCatId || bundle.categories[0]?.id;
    if (!catId) return;
    try {
      const updated = await apiRequest<TournamentBundle>(
        `/api/tournaments/${bundle.tournament.id}/participants`,
        {
          method: 'POST',
          body: JSON.stringify({
            categoryId: catId,
            name: newPartName.trim(),
            clubOrTeam: newPartClub.trim() || 'Mandiri',
          }),
        }
      );
      onBundleUpdated(updated);
      setNewPartName('');
      setNewPartClub('');
      showToast('ok', 'Peserta berhasil ditambahkan.');
    } catch (err) {
      showToast('err', (err as Error).message);
    }
  };

  const handleBulkParticipants = async () => {
    if (!bundle || !bulkPartText.trim()) return;
    const catId = newPartCatId || bundle.categories[0]?.id;
    if (!catId) return;
    const rows = bulkPartText
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean)
      .map((line) => {
        const parts = line.split(/[,\t|·;]/).map((s) => s.trim());
        return { name: parts[0] || line, clubOrTeam: parts[1] || 'Mandiri' };
      });
    try {
      const updated = await apiRequest<TournamentBundle>(
        `/api/tournaments/${bundle.tournament.id}/participants`,
        {
          method: 'POST',
          body: JSON.stringify({ categoryId: catId, participants: rows }),
        }
      );
      onBundleUpdated(updated);
      setBulkPartText('');
      setShowBulkBox(false);
      showToast('ok', `${rows.length} peserta berhasil diimpor.`);
    } catch (err) {
      showToast('err', (err as Error).message);
    }
  };

  const handleDeleteParticipant = async (p: Participant) => {
    try {
      const updated = await apiRequest<TournamentBundle>(`/api/participants/${p.id}`, {
        method: 'DELETE',
      });
      onBundleUpdated(updated);
      showToast('ok', `Peserta ${p.name} dihapus.`);
    } catch (err) {
      showToast('err', (err as Error).message);
    }
  };

  const handleRegenerateCategory = async (categoryId: string) => {
    try {
      const updated = await apiRequest<TournamentBundle>(`/api/categories/${categoryId}/generate`, {
        method: 'POST',
      });
      onBundleUpdated(updated);
      showToast('ok', 'Grup, bracket, dan jadwal kategori berhasil diperbarui.');
    } catch (err) {
      showToast('err', (err as Error).message);
    }
  };

  const handleAutoSchedule = async () => {
    if (!bundle) return;
    try {
      const updated = await apiRequest<TournamentBundle>(
        `/api/tournaments/${bundle.tournament.id}/auto-schedule`,
        {
          method: 'POST',
          body: JSON.stringify({ startTime: autoStartTime, intervalMinutes: autoIntervalMins }),
        }
      );
      onBundleUpdated(updated);
      showToast('ok', 'Seluruh pertandingan telah dijadwalkan otomatis.');
    } catch (err) {
      showToast('err', (err as Error).message);
    }
  };

  const handleUpdateMatchMeta = async (
    matchId: string,
    patch: { court?: string; scheduledTime?: string; status?: Match['status'] }
  ) => {
    try {
      const updated = await apiRequest<TournamentBundle>(`/api/matches/${matchId}`, {
        method: 'PATCH',
        body: JSON.stringify(patch),
      });
      onBundleUpdated(updated);
    } catch (err) {
      showToast('err', (err as Error).message);
    }
  };

  const handleSaveStandingOverride = async (
    groupId: string,
    participantId: string,
    manualRank: number,
    reason: string,
    clear?: boolean
  ) => {
    try {
      const updated = await apiRequest<TournamentBundle>(`/api/groups/${groupId}/override`, {
        method: 'POST',
        body: JSON.stringify({ participantId, manualRank, reason, clear }),
      });
      onBundleUpdated(updated);
      showToast('ok', clear ? 'Koreksi peringkat dihapus.' : 'Koreksi peringkat tersimpan.');
    } catch (err) {
      showToast('err', (err as Error).message);
    }
  };

  const handleSaveTournamentSettings = async () => {
    if (!bundle) return;
    const courts = (courtsEdit || bundle.tournament.courts.join(', '))
      .split(',')
      .map((c) => c.trim())
      .filter(Boolean);
    try {
      const updated = await apiRequest<TournamentBundle>(
        `/api/tournaments/${bundle.tournament.id}`,
        {
          method: 'PATCH',
          body: JSON.stringify({
            name: tourneyNameEdit || bundle.tournament.name,
            location: tourneyLocEdit || bundle.tournament.location,
            courts,
          }),
        }
      );
      onBundleUpdated(updated);
      await onRefreshSummaries();
      showToast('ok', 'Pengaturan turnamen diperbarui.');
    } catch (err) {
      showToast('err', (err as Error).message);
    }
  };

  const handleRegeneratePin = async () => {
    if (!bundle) return;
    try {
      const updated = await apiRequest<TournamentBundle>(
        `/api/tournaments/${bundle.tournament.id}`,
        {
          method: 'PATCH',
          body: JSON.stringify({ regeneratePin: true }),
        }
      );
      onBundleUpdated(updated);
      showToast('ok', `PIN Wasit baru: ${updated.tournament.refereePin}`);
    } catch (err) {
      showToast('err', (err as Error).message);
    }
  };

  const handleScoringTargetChange = (targetId: string) => {
    setScoringTargetId(targetId);
    if (!bundle) return;
    if (targetId === '__DEFAULT__') {
      setScoringRuleDraft({
        scoringSystem: 'rally',
        serviceChances: 1,
        ...bundle.tournament.defaultScoringRule,
      });
    } else {
      const cat = bundle.categories.find((c) => c.id === targetId);
      if (cat) {
        setScoringRuleDraft({
          scoringSystem: 'rally',
          serviceChances: 1,
          ...cat.scoringRule,
        });
      }
    }
  };

  const handleSaveScoringSettings = async () => {
    if (!bundle) return;
    setSavingScoring(true);
    try {
      const normalizedRule: ScoringRule = {
        ...scoringRuleDraft,
        scoringSystem: scoringRuleDraft.scoringSystem ?? 'rally',
        serviceChances:
          scoringRuleDraft.serviceChances ??
          (scoringRuleDraft.scoringSystem === 'classic' ? 2 : 1),
      };
      const updated =
        scoringTargetId === '__DEFAULT__'
          ? await apiRequest<TournamentBundle>(`/api/tournaments/${bundle.tournament.id}`, {
              method: 'PATCH',
              body: JSON.stringify({
                defaultScoringRule: normalizedRule,
                applyToPendingMatches,
              }),
            })
          : await apiRequest<TournamentBundle>(`/api/categories/${scoringTargetId}`, {
              method: 'PATCH',
              body: JSON.stringify({
                scoringRule: normalizedRule,
                applyToPendingMatches,
              }),
            });
      onBundleUpdated(updated);
      const modeLabel =
        normalizedRule.scoringSystem === 'classic'
          ? `Mode Klasik (${normalizedRule.pointsPerGame} poin · ${normalizedRule.serviceChances}× servis)`
          : `Mode Rally Poin (${normalizedRule.pointsPerGame} poin)`;
      showToast(
        'ok',
        `${modeLabel} tersimpan${applyToPendingMatches ? ' & diterapkan ke pertandingan yang belum dimulai.' : '.'}`
      );
    } catch (err) {
      showToast('err', (err as Error).message);
    } finally {
      setSavingScoring(false);
    }
  };

  const handleAddCategory = async () => {
    if (!bundle) return;
    try {
      const updated = await apiRequest<TournamentBundle>(
        `/api/tournaments/${bundle.tournament.id}/categories`,
        {
          method: 'POST',
          body: JSON.stringify({
            type: newCatType,
            name: newCatName.trim() || CATEGORY_LABELS[newCatType],
            format: newCatFormat,
            scoringRule: getScoringRuleForPreset(newCatPreset),
          }),
        }
      );
      onBundleUpdated(updated);
      setShowAddCategory(false);
      setNewCatName('');
      showToast('ok', 'Kategori baru ditambahkan.');
    } catch (err) {
      showToast('err', (err as Error).message);
    }
  };

  const handleDeleteTournament = async (id: string) => {
    try {
      await apiRequest(`/api/tournaments/${id}`, { method: 'DELETE' });
      await onRefreshSummaries();
      const remaining = summaries.filter((s) => s.id !== id);
      if (remaining[0]) onSelectTournament(remaining[0].id);
      showToast('ok', 'Turnamen dihapus.');
    } catch (err) {
      showToast('err', (err as Error).message);
    }
  };

  const selectedMatch = selectedMatchId
    ? bundle?.matches.find((m) => m.id === selectedMatchId) ?? null
    : null;

  return (
    <div className="min-h-screen bg-[#F7F9F8] flex">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex w-64 shrink-0 flex-col bg-[#152238] text-white border-r border-white/10 no-print">
        <div className="px-5 h-16 flex items-center justify-between border-b border-white/10">
          <span className="font-display text-xl font-extrabold tracking-tight text-white">
            SmashPoint
          </span>
        </div>

        <div className="p-4">
          <button
            type="button"
            onClick={onOpenWizard}
            className="w-full min-h-[44px] px-4 py-2.5 rounded-xl bg-[#167D54] hover:bg-[#126644] text-sm font-semibold text-white flex items-center justify-center gap-2 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Buat Turnamen
          </button>
        </div>

        <nav className="flex-1 px-3 space-y-1 overflow-y-auto">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = section === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  if (item.id !== 'scoring') setSelectedMatchId(null);
                  onChangeSection(item.id);
                }}
                className={`w-full min-h-[42px] px-3.5 py-2 rounded-xl text-sm font-medium flex items-center gap-3 transition-colors text-left ${
                  active
                    ? 'bg-white/12 text-[#C5F36B] font-semibold'
                    : 'text-slate-300 hover:bg-white/5 hover:text-white'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span className="truncate">{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="p-4 border-t border-white/10 space-y-2">
          <button
            type="button"
            onClick={onOpenRefereePortal}
            className="w-full min-h-[40px] px-3.5 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-xs font-semibold text-white flex items-center justify-between"
          >
            <span className="flex items-center gap-2">
              <KeyRound className="w-3.5 h-3.5 text-[#C5F36B]" />
              Portal Wasit
            </span>
            <span className="font-mono text-[#C5F36B]">{bundle?.tournament.refereePin || '-'}</span>
          </button>
          <div className="text-[11px] text-slate-400 px-1">
            {wsConnected ? 'Sinkronisasi Real-Time Aktif' : 'Menghubungkan Server...'}
          </div>
        </div>
      </aside>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div className="fixed inset-0 bg-[#152238]/60" onClick={() => setMobileMenuOpen(false)} />
          <div className="relative w-72 max-w-[85vw] bg-[#152238] text-white h-full flex flex-col p-4 space-y-4">
            <div className="flex items-center justify-between">
              <span className="font-display text-lg font-extrabold">SmashPoint</span>
              <button type="button" onClick={() => setMobileMenuOpen(false)}>
                <X className="w-5 h-5" />
              </button>
            </div>
            <button
              type="button"
              onClick={() => {
                setMobileMenuOpen(false);
                onOpenWizard();
              }}
              className="w-full min-h-[44px] rounded-xl bg-[#167D54] text-sm font-semibold flex items-center justify-center gap-2"
            >
              <Plus className="w-4 h-4" />
              Buat Turnamen
            </button>
            <nav className="flex-1 space-y-1">
              {NAV_ITEMS.map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      onChangeSection(item.id);
                      setMobileMenuOpen(false);
                    }}
                    className={`w-full min-h-[44px] px-3 py-2 rounded-xl text-sm flex items-center gap-3 ${
                      section === item.id ? 'bg-white/12 text-[#C5F36B] font-semibold' : 'text-slate-300'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    {item.label}
                  </button>
                );
              })}
            </nav>
            <button
              type="button"
              onClick={() => {
                setMobileMenuOpen(false);
                onOpenRefereePortal();
              }}
              className="w-full min-h-[44px] px-3 rounded-xl bg-white/10 text-xs font-semibold flex items-center justify-between"
            >
              <span>Portal Wasit</span>
              <span className="font-mono text-[#C5F36B]">{bundle?.tournament.refereePin}</span>
            </button>
          </div>
        </div>
      )}

      {/* Main Content Viewport */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Top Bar Contract */}
        <header className="sticky top-0 z-30 h-16 bg-white border-b border-[#E2E8E5] px-4 sm:px-6 flex items-center justify-between gap-4 no-print">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="lg:hidden min-w-[40px] min-h-[40px] flex items-center justify-center rounded-xl border border-[#E2E8E5]"
              aria-label="Buka menu"
            >
              <Menu className="w-5 h-5" />
            </button>

            <div className="min-w-0">
              <div className="text-xs text-slate-500 truncate">
                {bundle ? bundle.tournament.name : 'Pilih Turnamen'}
              </div>
              <h1 className="text-base sm:text-lg font-bold text-[#152238] truncate">
                {NAV_ITEMS.find((i) => i.id === section)?.label}
              </h1>
            </div>
          </div>

          {bundle && (
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={onOpenTv}
                className="hidden sm:flex min-h-[40px] px-3.5 py-2 rounded-xl border border-[#E2E8E5] bg-white hover:bg-[#F7F9F8] text-xs font-semibold text-[#152238] items-center gap-1.5 whitespace-nowrap"
              >
                <Monitor className="w-4 h-4" />
                Layar TV
              </button>
              <button
                type="button"
                onClick={onOpenPublic}
                className="hidden md:flex min-h-[40px] px-3.5 py-2 rounded-xl border border-[#E2E8E5] bg-white hover:bg-[#F7F9F8] text-xs font-semibold text-[#152238] items-center gap-1.5 whitespace-nowrap"
              >
                <ExternalLink className="w-4 h-4" />
                Halaman Publik
              </button>
              <button
                type="button"
                onClick={onOpenQr}
                className="min-h-[40px] px-3.5 py-2 rounded-xl bg-[#167D54] hover:bg-[#126644] text-xs font-semibold text-white flex items-center gap-1.5 whitespace-nowrap"
              >
                <QrCode className="w-4 h-4" />
                QR & PIN
              </button>
            </div>
          )}
        </header>

        <main className="flex-1 p-4 sm:p-6 max-w-7xl w-full mx-auto space-y-6">
          {feedback && (
            <div
              className={`px-4 py-3 rounded-xl border text-sm font-medium ${
                feedback.type === 'ok'
                  ? 'bg-[#167D54]/10 border-[#167D54]/30 text-[#167D54]'
                  : 'bg-red-50 border-red-200 text-red-700'
              }`}
            >
              {feedback.text}
            </div>
          )}

          {!bundle ? (
            <div className="p-10 rounded-2xl bg-white border border-[#E2E8E5] text-center space-y-4">
              <h2 className="text-xl font-bold text-[#152238]">Belum Ada Turnamen</h2>
              <p className="text-sm text-slate-600 max-w-md mx-auto">
                Buat turnamen badminton pertama Anda dalam kurang dari 5 menit menggunakan Wizard
                7-Langkah SmashPoint.
              </p>
              <button
                type="button"
                onClick={onOpenWizard}
                className="px-6 py-3 rounded-xl bg-[#167D54] text-white text-sm font-semibold"
              >
                Buat Turnamen Baru
              </button>
            </div>
          ) : (
            <>
              {/* 01. DASHBOARD */}
              {section === 'dashboard' && (
                <div className="space-y-6">
                  {/* KPI Strip */}
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                    <div className="p-5 rounded-xl bg-white border border-[#E2E8E5]">
                      <div className="text-xs font-medium text-slate-500">Total Turnamen</div>
                      <div className="mt-2 font-mono text-3xl font-bold text-[#152238] tabular-nums">
                        {summaries.length}
                      </div>
                      <div className="mt-1 text-xs text-slate-500">
                        {bundle.categories.length} Kategori aktif
                      </div>
                    </div>
                    <div className="p-5 rounded-xl bg-white border border-[#E2E8E5]">
                      <div className="text-xs font-medium text-slate-500">Total Peserta</div>
                      <div className="mt-2 font-mono text-3xl font-bold text-[#152238] tabular-nums">
                        {bundle.participants.length}
                      </div>
                      <div className="mt-1 text-xs text-slate-500">Tunggal & Ganda</div>
                    </div>
                    <div className="p-5 rounded-xl bg-white border border-[#E2E8E5]">
                      <div className="text-xs font-medium text-slate-500">Sedang Berlangsung</div>
                      <div className="mt-2 font-mono text-3xl font-bold text-[#167D54] tabular-nums">
                        {liveMatches.length}
                      </div>
                      <div className="mt-1 text-xs text-slate-500">
                        {bundle.tournament.courts.length} Lapangan tersedia
                      </div>
                    </div>
                    <div className="p-5 rounded-xl bg-white border border-[#E2E8E5]">
                      <div className="text-xs font-medium text-slate-500">Pertandingan Selesai</div>
                      <div className="mt-2 font-mono text-3xl font-bold text-[#152238] tabular-nums">
                        {completedMatches.length}
                        <span className="text-base font-normal text-slate-400">
                          /{nonByeMatches.length}
                        </span>
                      </div>
                      <div className="mt-1 text-xs text-slate-500">
                        PIN Wasit: <span className="font-mono font-bold text-[#152238]">{bundle.tournament.refereePin}</span>
                      </div>
                    </div>
                  </div>

                  {/* Match Center per Court */}
                  <div className="rounded-xl bg-white border border-[#E2E8E5] overflow-hidden">
                    <div className="px-5 py-4 bg-[#F7F9F8] border-b border-[#E2E8E5] flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <h2 className="text-sm font-bold text-[#152238]">Match Center Lapangan</h2>
                        <p className="text-xs text-slate-500">
                          Klik pertandingan untuk langsung membuka layar scoring wasit.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={onOpenTv}
                        className="px-3.5 py-2 rounded-xl bg-[#152238] text-white text-xs font-semibold flex items-center gap-1.5"
                      >
                        <Monitor className="w-3.5 h-3.5 text-[#C5F36B]" />
                        Tampilkan di Layar TV
                      </button>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-sm">
                        <thead>
                          <tr className="border-b border-[#E2E8E5] text-xs text-slate-500">
                            <th className="py-3 pl-5 pr-3 font-semibold">Lapangan</th>
                            <th className="py-3 px-3 font-semibold">Pertandingan</th>
                            <th className="py-3 px-3 font-semibold">Skor</th>
                            <th className="py-3 px-3 font-semibold">Status</th>
                            <th className="py-3 pl-3 pr-5 font-semibold text-right">Aksi</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#E2E8E5]">
                          {bundle.tournament.courts.map((courtName) => {
                            const courtMatch =
                              nonByeMatches.find(
                                (m) => m.court === courtName && (m.status === 'live' || m.status === 'paused')
                              ) ??
                              nonByeMatches.find(
                                (m) =>
                                  m.court === courtName &&
                                  (m.status === 'ready' || m.status === 'scheduled') &&
                                  m.participantAId &&
                                  m.participantBId
                              ) ??
                              nonByeMatches.find((m) => m.court === courtName);

                            if (!courtMatch) {
                              return (
                                <tr key={courtName}>
                                  <td className="py-3.5 pl-5 pr-3 font-semibold text-[#152238]">
                                    {courtName}
                                  </td>
                                  <td colSpan={4} className="py-3.5 px-3 text-xs text-slate-400">
                                    Belum ada pertandingan dijadwalkan di lapangan ini.
                                  </td>
                                </tr>
                              );
                            }

                            const pA = getParticipantDisplay(
                              courtMatch.participantAId,
                              bundle.participants,
                              courtMatch.placeholderA
                            );
                            const pB = getParticipantDisplay(
                              courtMatch.participantBId,
                              bundle.participants,
                              courtMatch.placeholderB
                            );
                            return (
                              <tr key={courtName} className="hover:bg-[#F7F9F8]">
                                <td className="py-3.5 pl-5 pr-3 font-semibold text-[#152238] whitespace-nowrap">
                                  {courtName}
                                </td>
                                <td className="py-3.5 px-3">
                                  <div className="font-semibold text-[#152238]">
                                    {pA.name} <span className="text-slate-400 font-normal">vs</span>{' '}
                                    {pB.name}
                                  </div>
                                  <div className="text-xs text-slate-500">
                                    {categoryMap.get(courtMatch.categoryId)} · {courtMatch.roundLabel}
                                  </div>
                                </td>
                                <td className="py-3.5 px-3 font-mono font-bold text-[#152238] tabular-nums">
                                  {formatMatchGamesSummary(courtMatch)}
                                </td>
                                <td className="py-3.5 px-3 text-xs">
                                  <span
                                    className={
                                      courtMatch.status === 'live'
                                        ? 'font-bold text-[#167D54]'
                                        : 'text-slate-600'
                                    }
                                  >
                                    {MATCH_STATUS_LABEL[courtMatch.status]}
                                  </span>
                                </td>
                                <td className="py-3.5 pl-3 pr-5 text-right">
                                  <button
                                    type="button"
                                    disabled={!courtMatch.participantAId || !courtMatch.participantBId}
                                    onClick={() => openMatchScoring(courtMatch)}
                                    className="px-3.5 py-2 rounded-xl bg-[#167D54] hover:bg-[#126644] disabled:opacity-40 text-white text-xs font-semibold inline-flex items-center gap-1.5"
                                  >
                                    <Play className="w-3.5 h-3.5" />
                                    Buka Scoring
                                  </button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Next & Recent Split */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <div className="rounded-xl bg-white border border-[#E2E8E5] overflow-hidden">
                      <div className="px-5 py-3.5 bg-[#F7F9F8] border-b border-[#E2E8E5] flex items-center justify-between">
                        <span className="font-bold text-sm text-[#152238]">Jadwal Berikutnya</span>
                        <button
                          type="button"
                          onClick={() => onChangeSection('schedule')}
                          className="text-xs font-semibold text-[#167D54]"
                        >
                          Semua Jadwal
                        </button>
                      </div>
                      <div className="divide-y divide-[#E2E8E5]">
                        {upcomingMatches.slice(0, 5).map((m) => {
                          const pA = getParticipantDisplay(m.participantAId, bundle.participants, m.placeholderA);
                          const pB = getParticipantDisplay(m.participantBId, bundle.participants, m.placeholderB);
                          return (
                            <div
                              key={m.id}
                              className="px-5 py-3 flex items-center justify-between gap-3 text-sm"
                            >
                              <div className="min-w-0">
                                <div className="text-xs text-slate-500">
                                  {m.court} · {categoryMap.get(m.categoryId)} · {m.roundLabel}
                                </div>
                                <div className="font-semibold text-[#152238] truncate">
                                  {pA.name} vs {pB.name}
                                </div>
                              </div>
                              <div className="font-mono text-xs font-semibold text-slate-600 tabular-nums shrink-0">
                                {m.scheduledTime || '-'}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    <div className="rounded-xl bg-white border border-[#E2E8E5] overflow-hidden">
                      <div className="px-5 py-3.5 bg-[#F7F9F8] border-b border-[#E2E8E5] flex items-center justify-between">
                        <span className="font-bold text-sm text-[#152238]">Hasil Pertandingan Terbaru</span>
                        <button
                          type="button"
                          onClick={() => onChangeSection('standings')}
                          className="text-xs font-semibold text-[#167D54]"
                        >
                          Klasemen & Laporan
                        </button>
                      </div>
                      <div className="divide-y divide-[#E2E8E5]">
                        {completedMatches
                          .slice(-5)
                          .reverse()
                          .map((m) => {
                            const pA = getParticipantDisplay(m.participantAId, bundle.participants);
                            const pB = getParticipantDisplay(m.participantBId, bundle.participants);
                            return (
                              <div
                                key={m.id}
                                className="px-5 py-3 flex items-center justify-between gap-3 text-sm"
                              >
                                <div className="min-w-0">
                                  <div className="text-xs text-slate-500">
                                    {categoryMap.get(m.categoryId)} · {m.roundLabel}
                                  </div>
                                  <div className="truncate">
                                    <span
                                      className={
                                        m.winnerId === m.participantAId
                                          ? 'font-bold text-[#167D54]'
                                          : ''
                                      }
                                    >
                                      {pA.name}
                                    </span>
                                    <span className="mx-1.5 text-slate-400">vs</span>
                                    <span
                                      className={
                                        m.winnerId === m.participantBId
                                          ? 'font-bold text-[#167D54]'
                                          : ''
                                      }
                                    >
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
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* 02. MY TOURNAMENTS */}
              {section === 'tournaments' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-slate-600">
                      Kelola daftar turnamen atau buat turnamen baru menggunakan Wizard 7-Langkah.
                    </p>
                    <button
                      type="button"
                      onClick={onOpenWizard}
                      className="min-h-[42px] px-4 py-2 rounded-xl bg-[#167D54] text-white text-xs font-semibold flex items-center gap-1.5"
                    >
                      <Plus className="w-4 h-4" />
                      Turnamen Baru
                    </button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {summaries.map((t) => {
                      const isCurrent = t.id === bundle.tournament.id;
                      return (
                        <div
                          key={t.id}
                          className={`p-5 rounded-2xl bg-white border flex flex-col justify-between gap-4 ${
                            isCurrent ? 'border-[#167D54] ring-2 ring-[#167D54]/10' : 'border-[#E2E8E5]'
                          }`}
                        >
                          <div>
                            <div className="flex items-center justify-between text-xs text-slate-500">
                              <span>{TOURNAMENT_STATUS_LABEL[t.status]}</span>
                              <span>{formatDateRangeID(t.startDate, t.endDate)}</span>
                            </div>
                            <h3 className="text-lg font-bold text-[#152238] mt-1">{t.name}</h3>
                            <div className="text-xs text-slate-500 mt-0.5">{t.location}</div>
                            <div className="mt-3 flex flex-wrap gap-4 text-xs text-slate-600 font-mono tabular-nums">
                              <span>{t.participantCount} Peserta</span>
                              <span>{t.matchCount} Pertandingan</span>
                              <span className="text-[#167D54] font-semibold">{t.liveMatchCount} Live</span>
                            </div>
                          </div>

                          <div className="flex items-center justify-between pt-3 border-t border-[#E2E8E5]">
                            <button
                              type="button"
                              onClick={() => {
                                onSelectTournament(t.id);
                                onChangeSection('dashboard');
                              }}
                              className={`px-4 py-2 rounded-xl text-xs font-semibold ${
                                isCurrent
                                  ? 'bg-[#167D54]/10 text-[#167D54]'
                                  : 'bg-[#152238] text-white'
                              }`}
                            >
                              {isCurrent ? 'Turnamen Aktif' : 'Kelola Turnamen'}
                            </button>

                            {summaries.length > 1 && (
                              <button
                                type="button"
                                onClick={() => void handleDeleteTournament(t.id)}
                                className="p-2 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50"
                                title="Hapus turnamen"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* 03. PARTICIPANTS */}
              {section === 'participants' && (
                <div className="space-y-5">
                  <div className="p-5 rounded-xl bg-white border border-[#E2E8E5] space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h2 className="text-sm font-bold text-[#152238]">Tambah Peserta Baru</h2>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setShowAddCategory(true)}
                          className="px-3 py-1.5 rounded-lg border border-[#E2E8E5] text-xs font-semibold text-[#152238] hover:bg-[#F7F9F8]"
                        >
                          + Kategori Baru
                        </button>
                        <button
                          type="button"
                          onClick={() => setShowBulkBox((v) => !v)}
                          className="px-3 py-1.5 rounded-lg border border-[#E2E8E5] text-xs font-semibold text-[#152238] hover:bg-[#F7F9F8] flex items-center gap-1.5"
                        >
                          <Upload className="w-3.5 h-3.5" />
                          Impor Excel/CSV
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
                      <select
                        value={newPartCatId || bundle.categories[0]?.id || ''}
                        onChange={(e) => setNewPartCatId(e.target.value)}
                        className="sm:col-span-3 px-3 py-2.5 rounded-xl border border-[#E2E8E5] bg-white text-sm"
                      >
                        {bundle.categories.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                      <input
                        type="text"
                        value={newPartName}
                        onChange={(e) => setNewPartName(e.target.value)}
                        placeholder="Nama Pemain atau Pasangan Ganda"
                        className="sm:col-span-4 px-3.5 py-2.5 rounded-xl border border-[#E2E8E5] text-sm"
                      />
                      <input
                        type="text"
                        value={newPartClub}
                        onChange={(e) => setNewPartClub(e.target.value)}
                        placeholder="Klub / Tim (mis. PB Jaya)"
                        className="sm:col-span-3 px-3.5 py-2.5 rounded-xl border border-[#E2E8E5] text-sm"
                      />
                      <button
                        type="button"
                        onClick={() => void handleAddParticipant()}
                        className="sm:col-span-2 min-h-[42px] rounded-xl bg-[#167D54] hover:bg-[#126644] text-white text-sm font-semibold"
                      >
                        Tambah
                      </button>
                    </div>

                    {showBulkBox && (
                      <div className="p-4 rounded-xl bg-[#F7F9F8] border border-[#E2E8E5] space-y-3">
                        <div className="text-xs text-slate-600">
                          Tempel daftar peserta dari Excel/CSV (satu baris per peserta:{' '}
                          <span className="font-mono text-[#152238]">Nama, Klub</span>).
                        </div>
                        <textarea
                          rows={4}
                          value={bulkPartText}
                          onChange={(e) => setBulkPartText(e.target.value)}
                          className="w-full p-3 rounded-xl border border-[#E2E8E5] bg-white text-sm font-mono"
                          placeholder={`Bayu Pratama, PB Jaya\nSari / Indah, PB Djarum`}
                        />
                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => setShowBulkBox(false)}
                            className="px-3 py-1.5 text-xs font-semibold text-slate-600"
                          >
                            Batal
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleBulkParticipants()}
                            className="px-4 py-1.5 rounded-lg bg-[#152238] text-white text-xs font-semibold"
                          >
                            Impor Daftar
                          </button>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Filter by Category */}
                  <div className="flex flex-wrap gap-1.5 p-1 bg-white rounded-xl border border-[#E2E8E5] w-fit">
                    <button
                      type="button"
                      onClick={() => setPartCatFilter('ALL')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${
                        partCatFilter === 'ALL' ? 'bg-[#152238] text-white' : 'text-slate-600'
                      }`}
                    >
                      Semua ({bundle.participants.length})
                    </button>
                    {bundle.categories.map((c) => {
                      const count = bundle.participants.filter((p) => p.categoryId === c.id).length;
                      return (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => setPartCatFilter(c.id)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${
                            partCatFilter === c.id ? 'bg-[#152238] text-white' : 'text-slate-600'
                          }`}
                        >
                          {c.name} ({count})
                        </button>
                      );
                    })}
                  </div>

                  <div className="rounded-xl bg-white border border-[#E2E8E5] overflow-hidden">
                    <table className="w-full text-left text-sm">
                      <thead>
                        <tr className="border-b border-[#E2E8E5] text-xs text-slate-500 bg-[#F7F9F8]">
                          <th className="py-3 pl-5 pr-3 font-semibold">#</th>
                          <th className="py-3 px-3 font-semibold">Nama Peserta</th>
                          <th className="py-3 px-3 font-semibold">Klub / Tim</th>
                          <th className="py-3 px-3 font-semibold">Kategori</th>
                          <th className="py-3 pl-3 pr-5 font-semibold text-right">Hapus</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#E2E8E5]">
                        {bundle.participants
                          .filter((p) => partCatFilter === 'ALL' || p.categoryId === partCatFilter)
                          .map((p, idx) => (
                            <tr key={p.id} className="hover:bg-[#F7F9F8]">
                              <td className="py-3 pl-5 pr-3 font-mono text-xs text-slate-500 tabular-nums">
                                {idx + 1}
                              </td>
                              <td className="py-3 px-3 font-semibold text-[#152238]">{p.name}</td>
                              <td className="py-3 px-3 text-slate-600">{p.clubOrTeam}</td>
                              <td className="py-3 px-3 text-xs text-slate-600">
                                {categoryMap.get(p.categoryId)}
                              </td>
                              <td className="py-3 pl-3 pr-5 text-right">
                                <button
                                  type="button"
                                  onClick={() => void handleDeleteParticipant(p)}
                                  className="p-1.5 text-slate-400 hover:text-red-600 rounded-lg"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* 04. SCHEDULE */}
              {section === 'schedule' && (
                <div className="space-y-5">
                  <div className="p-4 rounded-xl bg-white border border-[#E2E8E5] flex flex-wrap items-end justify-between gap-4">
                    <div className="flex flex-wrap items-end gap-3">
                      <div>
                        <label className="block text-xs font-semibold text-slate-600 mb-1">
                          Filter Lapangan
                        </label>
                        <select
                          value={schedCourtFilter}
                          onChange={(e) => setSchedCourtFilter(e.target.value)}
                          className="px-3 py-2 rounded-xl border border-[#E2E8E5] text-xs font-medium"
                        >
                          <option value="ALL">Semua Lapangan</option>
                          {bundle.tournament.courts.map((c) => (
                            <option key={c} value={c}>
                              {c}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-600 mb-1">
                          Filter Status
                        </label>
                        <select
                          value={schedStatusFilter}
                          onChange={(e) => setSchedStatusFilter(e.target.value)}
                          className="px-3 py-2 rounded-xl border border-[#E2E8E5] text-xs font-medium"
                        >
                          <option value="ALL">Semua Status</option>
                          <option value="live">Berlangsung</option>
                          <option value="ready">Siap Tanding</option>
                          <option value="scheduled">Terjadwal</option>
                          <option value="completed">Selesai</option>
                        </select>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-end gap-2.5">
                      <div>
                        <label className="block text-xs font-semibold text-slate-600 mb-1">
                          Jam Mulai
                        </label>
                        <input
                          type="time"
                          value={autoStartTime}
                          onChange={(e) => setAutoStartTime(e.target.value)}
                          className="px-3 py-2 rounded-xl border border-[#E2E8E5] font-mono text-xs"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-600 mb-1">
                          Jeda (menit)
                        </label>
                        <input
                          type="number"
                          min={10}
                          max={120}
                          value={autoIntervalMins}
                          onChange={(e) => setAutoIntervalMins(Number(e.target.value) || 30)}
                          className="w-20 px-3 py-2 rounded-xl border border-[#E2E8E5] font-mono text-xs"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => void handleAutoSchedule()}
                        className="min-h-[38px] px-4 py-2 rounded-xl bg-[#152238] hover:bg-[#1e3150] text-white text-xs font-semibold flex items-center gap-1.5"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                        Auto Jadwal Semua
                      </button>
                    </div>
                  </div>

                  <div className="rounded-xl bg-white border border-[#E2E8E5] overflow-hidden">
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs">
                        <thead>
                          <tr className="border-b border-[#E2E8E5] bg-[#F7F9F8] text-slate-500">
                            <th className="py-3 pl-5 pr-2 font-semibold">Jam</th>
                            <th className="py-3 px-2 font-semibold">Lapangan</th>
                            <th className="py-3 px-2 font-semibold">Kategori · Ronde</th>
                            <th className="py-3 px-2 font-semibold">Pertandingan</th>
                            <th className="py-3 px-2 font-semibold">Status</th>
                            <th className="py-3 pl-2 pr-5 font-semibold text-right">Aksi</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#E2E8E5]">
                          {nonByeMatches
                            .filter(
                              (m) =>
                                (schedCourtFilter === 'ALL' || m.court === schedCourtFilter) &&
                                (schedStatusFilter === 'ALL' || m.status === schedStatusFilter)
                            )
                            .map((m) => {
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
                              return (
                                <tr key={m.id} className="hover:bg-[#F7F9F8]">
                                  <td className="py-2.5 pl-5 pr-2">
                                    <input
                                      type="time"
                                      value={m.scheduledTime || ''}
                                      onChange={(e) =>
                                        void handleUpdateMatchMeta(m.id, {
                                          scheduledTime: e.target.value,
                                        })
                                      }
                                      className="px-2 py-1 rounded-lg border border-[#E2E8E5] font-mono text-xs"
                                    />
                                  </td>
                                  <td className="py-2.5 px-2">
                                    <select
                                      value={m.court}
                                      onChange={(e) =>
                                        void handleUpdateMatchMeta(m.id, { court: e.target.value })
                                      }
                                      className="px-2 py-1 rounded-lg border border-[#E2E8E5] bg-white text-xs"
                                    >
                                      {bundle.tournament.courts.map((c) => (
                                        <option key={c} value={c}>
                                          {c}
                                        </option>
                                      ))}
                                    </select>
                                  </td>
                                  <td className="py-2.5 px-2 text-slate-600">
                                    {categoryMap.get(m.categoryId)} · {m.roundLabel}
                                  </td>
                                  <td className="py-2.5 px-2 font-semibold text-[#152238]">
                                    {pA.name} <span className="text-slate-400 font-normal">vs</span>{' '}
                                    {pB.name}
                                  </td>
                                  <td className="py-2.5 px-2">
                                    <span
                                      className={
                                        m.status === 'live' ? 'font-bold text-[#167D54]' : 'text-slate-600'
                                      }
                                    >
                                      {MATCH_STATUS_LABEL[m.status]}
                                    </span>
                                  </td>
                                  <td className="py-2.5 pl-2 pr-5 text-right">
                                    <button
                                      type="button"
                                      disabled={!m.participantAId || !m.participantBId}
                                      onClick={() => openMatchScoring(m)}
                                      className="px-3 py-1.5 rounded-lg bg-[#167D54] disabled:opacity-35 text-white font-semibold"
                                    >
                                      Skor
                                    </button>
                                  </td>
                                </tr>
                              );
                            })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}

              {/* 05. BRACKETS & GROUPS */}
              {section === 'brackets' && (
                <BracketAndGroupsView
                  bundle={bundle}
                  onRegenerateCategory={handleRegenerateCategory}
                  onSelectMatchForScoring={openMatchScoring}
                />
              )}

              {/* 06. LIVE SCORING */}
              {section === 'scoring' && (
                <div>
                  {selectedMatch ? (
                    <LiveScoringInterface
                      match={selectedMatch}
                      categoryName={categoryMap.get(selectedMatch.categoryId) || ''}
                      participants={bundle.participants}
                      role="organizer"
                      isOnline={isOnline}
                      pendingOfflineCount={pendingCount}
                      enqueueAndSend={enqueueAndSend}
                      onBundleUpdated={onBundleUpdated}
                      onOptimisticMatchUpdate={(optMatch) => {
                        onBundleUpdated({
                          ...bundle,
                          matches: bundle.matches.map((m) =>
                            m.id === optMatch.id ? optMatch : m
                          ),
                        });
                      }}
                      onBack={() => setSelectedMatchId(null)}
                    />
                  ) : (
                    <div className="space-y-4">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <p className="text-sm text-slate-600">
                          Pilih pertandingan di bawah untuk mencatat skor, atau bagikan PIN{' '}
                          <span className="font-mono font-bold text-[#152238]">
                            {bundle.tournament.refereePin}
                          </span>{' '}
                          kepada wasit di lapangan.
                        </p>
                        <button
                          type="button"
                          onClick={onOpenRefereePortal}
                          className="px-4 py-2 rounded-xl bg-[#152238] text-white text-xs font-semibold flex items-center gap-1.5"
                        >
                          <KeyRound className="w-3.5 h-3.5 text-[#C5F36B]" />
                          Buka Mode Wasit HP
                        </button>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {nonByeMatches
                          .filter((m) => m.participantAId && m.participantBId)
                          .map((m) => {
                            const pA = getParticipantDisplay(m.participantAId, bundle.participants);
                            const pB = getParticipantDisplay(m.participantBId, bundle.participants);
                            const isLive = m.status === 'live';
                            return (
                              <button
                                key={m.id}
                                type="button"
                                onClick={() => setSelectedMatchId(m.id)}
                                className={`text-left p-5 rounded-2xl bg-white border flex items-center justify-between gap-4 transition-colors ${
                                  isLive
                                    ? 'border-[#167D54] ring-2 ring-[#167D54]/15'
                                    : 'border-[#E2E8E5] hover:border-[#152238]/40'
                                }`}
                              >
                                <div className="min-w-0 space-y-1">
                                  <div className="text-xs text-slate-500">
                                    {m.court} · {categoryMap.get(m.categoryId)} · {m.roundLabel}
                                  </div>
                                  <div className="text-base font-bold text-[#152238] truncate">
                                    {pA.name} <span className="text-slate-400 font-normal">vs</span>{' '}
                                    {pB.name}
                                  </div>
                                  <div className="text-xs font-mono text-slate-600 tabular-nums">
                                    {MATCH_STATUS_LABEL[m.status]} · {formatMatchGamesSummary(m)}
                                  </div>
                                </div>
                                <div className="px-3.5 py-2 rounded-xl bg-[#167D54] text-white text-xs font-semibold shrink-0">
                                  Kontrol Skor
                                </div>
                              </button>
                            );
                          })}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* 07. STANDINGS & REPORTS */}
              {section === 'standings' && (
                <StandingsAndReportsView
                  bundle={bundle}
                  onSaveOverride={handleSaveStandingOverride}
                />
              )}

              {/* 08. SETTINGS */}
              {section === 'settings' && (
                <div className="space-y-6">
                  {/* Pengaturan Mode & Aturan Skor */}
                  <div className="p-6 rounded-2xl bg-white border border-[#E2E8E5] space-y-5">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <h2 className="text-base font-bold text-[#152238]">
                          Pengaturan Mode & Aturan Skor
                        </h2>
                        <p className="text-xs text-slate-500 mt-0.5">
                          Pilih Mode 1 (Rally Poin 21) atau Mode 2 (Klasik Pindah Bola 15 poin dengan 2× kesempatan servis).
                        </p>
                      </div>
                      <div className="min-w-[240px]">
                        <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                          Target Pengaturan Skor
                        </label>
                        <select
                          value={scoringTargetId}
                          onChange={(e) => handleScoringTargetChange(e.target.value)}
                          className="w-full px-3 py-2 rounded-xl border border-[#E2E8E5] bg-white text-xs font-semibold text-[#152238]"
                        >
                          <option value="__DEFAULT__">Default Turnamen (Semua Kategori)</option>
                          {bundle.categories.map((c) => (
                            <option key={c.id} value={c.id}>
                              Kategori: {c.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    {/* 2 Primary Modes */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <button
                        type="button"
                        onClick={() => setScoringRuleDraft(getScoringRuleForPreset('standard'))}
                        className={`p-4 rounded-xl border text-left transition-all ${
                          scoringRuleDraft.preset === 'standard' ||
                          (scoringRuleDraft.scoringSystem !== 'classic' &&
                            scoringRuleDraft.pointsPerGame === 21 &&
                            scoringRuleDraft.bestOf === 3)
                            ? 'border-[#167D54] bg-[#167D54]/5 ring-1 ring-[#167D54]/20'
                            : 'border-[#E2E8E5] bg-white hover:border-slate-300'
                        }`}
                      >
                        <div className="font-bold text-sm text-[#152238]">
                          Mode 1 · Rally Poin (21 Poin)
                        </div>
                        <div className="text-xs text-slate-600 mt-1">
                          Berakhir pada 21 poin per set (batas 30, deuce selisih 2). Setiap reli langsung menambah 1 poin.
                        </div>
                      </button>

                      <button
                        type="button"
                        onClick={() => setScoringRuleDraft(getScoringRuleForPreset('classic'))}
                        className={`p-4 rounded-xl border text-left transition-all ${
                          scoringRuleDraft.preset === 'classic' ||
                          (scoringRuleDraft.scoringSystem === 'classic' &&
                            scoringRuleDraft.pointsPerGame === 15)
                            ? 'border-[#167D54] bg-[#167D54]/5 ring-1 ring-[#167D54]/20'
                            : 'border-[#E2E8E5] bg-white hover:border-slate-300'
                        }`}
                      >
                        <div className="font-bold text-sm text-[#152238]">
                          Mode 2 · Klasik Pindah Bola (15 Poin · 2× Servis)
                        </div>
                        <div className="text-xs text-slate-600 mt-1">
                          Berakhir pada 15 poin per set. Poin hanya bertambah bagi pemegang servis dengan 2 kali kesempatan servis sebelum pindah bola.
                        </div>
                      </button>
                    </div>

                    {/* Secondary Presets */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      {[
                        {
                          id: 'mini' as const,
                          title: 'Mini Tournament',
                          sub: 'Rally · Best of 1 · 15 poin',
                        },
                        {
                          id: 'fun' as const,
                          title: 'Fun Match',
                          sub: 'Rally · Best of 1 · 21 poin',
                        },
                        {
                          id: 'custom' as const,
                          title: 'Aturan Kustom',
                          sub: 'Sesuaikan parameter di bawah',
                        },
                      ].map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => {
                            if (item.id === 'custom') {
                              setScoringRuleDraft({ ...scoringRuleDraft, preset: 'custom' });
                            } else {
                              setScoringRuleDraft(getScoringRuleForPreset(item.id));
                            }
                          }}
                          className={`p-3 rounded-xl border text-left transition-all ${
                            scoringRuleDraft.preset === item.id
                              ? 'border-[#167D54] bg-[#167D54]/5'
                              : 'border-[#E2E8E5] bg-white hover:border-slate-300'
                          }`}
                        >
                          <div className="font-bold text-xs text-[#152238]">{item.title}</div>
                          <div className="text-xs text-slate-500 mt-0.5">{item.sub}</div>
                        </button>
                      ))}
                    </div>

                    {/* Fine-grained parameters */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 p-4 rounded-xl bg-[#F7F9F8] border border-[#E2E8E5]">
                      <div>
                        <label className="block text-xs font-semibold text-[#152238] mb-1">
                          Sistem Poin
                        </label>
                        <select
                          value={scoringRuleDraft.scoringSystem ?? 'rally'}
                          onChange={(e) => {
                            const mode = e.target.value as 'rally' | 'classic';
                            setScoringRuleDraft({
                              ...scoringRuleDraft,
                              preset: 'custom',
                              scoringSystem: mode,
                              serviceChances: mode === 'classic' ? 2 : 1,
                              pointsPerGame: mode === 'classic' ? 15 : 21,
                              maxPoints: mode === 'classic' ? 17 : 30,
                              intervalPoints: mode === 'classic' ? 8 : 11,
                            });
                          }}
                          className="w-full px-3 py-2 rounded-lg border border-[#E2E8E5] bg-white text-xs font-semibold"
                        >
                          <option value="rally">Rally Poin</option>
                          <option value="classic">Klasik (Pindah Bola)</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-[#152238] mb-1">
                          Kesempatan Servis
                        </label>
                        <select
                          value={
                            scoringRuleDraft.serviceChances ??
                            (scoringRuleDraft.scoringSystem === 'classic' ? 2 : 1)
                          }
                          onChange={(e) =>
                            setScoringRuleDraft({
                              ...scoringRuleDraft,
                              preset: 'custom',
                              serviceChances: Number(e.target.value),
                            })
                          }
                          className="w-full px-3 py-2 rounded-lg border border-[#E2E8E5] bg-white font-mono text-sm"
                        >
                          <option value={1}>1× (Rally)</option>
                          <option value={2}>2× Kesempatan Servis</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-[#152238] mb-1">
                          Poin per Set
                        </label>
                        <input
                          type="number"
                          min={5}
                          max={50}
                          value={scoringRuleDraft.pointsPerGame}
                          onChange={(e) =>
                            setScoringRuleDraft({
                              ...scoringRuleDraft,
                              preset: 'custom',
                              pointsPerGame: Number(e.target.value) || 21,
                            })
                          }
                          className="w-full px-3 py-2 rounded-lg border border-[#E2E8E5] bg-white font-mono text-sm"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-[#152238] mb-1">
                          Batas Poin Maksimal
                        </label>
                        <input
                          type="number"
                          min={scoringRuleDraft.pointsPerGame}
                          max={60}
                          value={scoringRuleDraft.maxPoints}
                          onChange={(e) =>
                            setScoringRuleDraft({
                              ...scoringRuleDraft,
                              preset: 'custom',
                              maxPoints: Number(e.target.value) || 30,
                            })
                          }
                          className="w-full px-3 py-2 rounded-lg border border-[#E2E8E5] bg-white font-mono text-sm"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-[#152238] mb-1">
                          Jumlah Set (Best of)
                        </label>
                        <select
                          value={scoringRuleDraft.bestOf}
                          onChange={(e) =>
                            setScoringRuleDraft({
                              ...scoringRuleDraft,
                              preset: 'custom',
                              bestOf: Number(e.target.value),
                            })
                          }
                          className="w-full px-3 py-2 rounded-lg border border-[#E2E8E5] bg-white font-mono text-sm"
                        >
                          <option value={1}>Best of 1 (1 Set)</option>
                          <option value={3}>Best of 3 (2 Kemenangan)</option>
                          <option value={5}>Best of 5 (3 Kemenangan)</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-[#152238] mb-1">
                          Selisih Minimal Deuce
                        </label>
                        <input
                          type="number"
                          min={1}
                          max={5}
                          value={scoringRuleDraft.minimumLead}
                          onChange={(e) =>
                            setScoringRuleDraft({
                              ...scoringRuleDraft,
                              preset: 'custom',
                              minimumLead: Number(e.target.value) || 2,
                            })
                          }
                          className="w-full px-3 py-2 rounded-lg border border-[#E2E8E5] bg-white font-mono text-sm"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-[#152238] mb-1">
                          Poin Interval
                        </label>
                        <input
                          type="number"
                          min={0}
                          max={30}
                          value={scoringRuleDraft.intervalPoints}
                          onChange={(e) =>
                            setScoringRuleDraft({
                              ...scoringRuleDraft,
                              preset: 'custom',
                              intervalPoints: Number(e.target.value) || 0,
                            })
                          }
                          className="w-full px-3 py-2 rounded-lg border border-[#E2E8E5] bg-white font-mono text-sm"
                        />
                      </div>

                      <div className="flex items-center pt-4">
                        <label className="flex items-center gap-2 text-xs font-semibold text-[#152238] cursor-pointer">
                          <input
                            type="checkbox"
                            checked={scoringRuleDraft.changeEndsOnInterval}
                            onChange={(e) =>
                              setScoringRuleDraft({
                                ...scoringRuleDraft,
                                preset: 'custom',
                                changeEndsOnInterval: e.target.checked,
                              })
                            }
                            className="w-4 h-4 accent-[#167D54]"
                          />
                          Tukar sisi saat interval
                        </label>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-4 pt-1">
                      <label className="flex items-center gap-2.5 text-xs font-medium text-slate-600 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={applyToPendingMatches}
                          onChange={(e) => setApplyToPendingMatches(e.target.checked)}
                          className="w-4 h-4 accent-[#167D54]"
                        />
                        Terapkan ke pertandingan yang belum dimulai (pertandingan aktif/selesai tetap memakai aturan awal)
                      </label>

                      <button
                        type="button"
                        disabled={savingScoring}
                        onClick={() => void handleSaveScoringSettings()}
                        className="min-h-[42px] px-5 py-2 rounded-xl bg-[#167D54] hover:bg-[#126644] disabled:opacity-50 text-white text-sm font-semibold"
                      >
                        {savingScoring ? 'Menyimpan...' : 'Simpan Aturan Skor'}
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <div className="p-6 rounded-2xl bg-white border border-[#E2E8E5] space-y-4">
                      <h2 className="text-base font-bold text-[#152238]">Informasi & Lapangan</h2>
                      <div>
                        <label className="block text-xs font-semibold text-[#152238] mb-1">
                          Nama Turnamen
                        </label>
                        <input
                          type="text"
                          defaultValue={bundle.tournament.name}
                          onChange={(e) => setTourneyNameEdit(e.target.value)}
                          className="w-full px-3.5 py-2.5 rounded-xl border border-[#E2E8E5] text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-[#152238] mb-1">
                          Lokasi Arena
                        </label>
                        <input
                          type="text"
                          defaultValue={bundle.tournament.location}
                          onChange={(e) => setTourneyLocEdit(e.target.value)}
                          className="w-full px-3.5 py-2.5 rounded-xl border border-[#E2E8E5] text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-[#152238] mb-1">
                          Daftar Lapangan (pisahkan dengan koma)
                        </label>
                        <input
                          type="text"
                          defaultValue={bundle.tournament.courts.join(', ')}
                          onChange={(e) => setCourtsEdit(e.target.value)}
                          className="w-full px-3.5 py-2.5 rounded-xl border border-[#E2E8E5] text-sm"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => void handleSaveTournamentSettings()}
                        className="min-h-[42px] px-5 py-2 rounded-xl bg-[#167D54] hover:bg-[#126644] text-white text-sm font-semibold"
                      >
                        Simpan Perubahan
                      </button>
                    </div>

                    <div className="space-y-6">
                      <div className="p-6 rounded-2xl bg-[#152238] text-white space-y-4">
                        <div className="text-xs text-slate-300">Keamanan Akses Wasit</div>
                        <div className="flex items-center justify-between gap-4">
                          <div>
                            <div className="text-sm font-semibold">PIN Wasit Aktif</div>
                            <div className="font-mono text-3xl font-bold tracking-[0.25em] text-[#C5F36B] mt-1 tabular-nums">
                              {bundle.tournament.refereePin}
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => void handleRegeneratePin()}
                            className="px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/15 text-xs font-semibold"
                          >
                            Buat PIN Baru
                          </button>
                        </div>
                        <div className="flex flex-wrap gap-2 pt-2">
                          <button
                            type="button"
                            onClick={onOpenQr}
                            className="px-4 py-2 rounded-xl bg-[#C5F36B] text-[#152238] text-xs font-bold"
                          >
                            Tampilkan QR Code
                          </button>
                          <button
                            type="button"
                            onClick={onOpenPublic}
                            className="px-4 py-2 rounded-xl bg-white/10 text-xs font-semibold"
                          >
                            Buka Halaman Publik
                          </button>
                        </div>
                      </div>

                      <div className="p-6 rounded-2xl bg-white border border-[#E2E8E5] space-y-3">
                        <div className="flex items-center justify-between">
                          <h3 className="text-sm font-bold text-[#152238]">Kategori & Format</h3>
                          <button
                            type="button"
                            onClick={() => setShowAddCategory(true)}
                            className="text-xs font-semibold text-[#167D54]"
                          >
                            + Tambah Kategori
                          </button>
                        </div>
                        <div className="divide-y divide-[#E2E8E5]">
                          {bundle.categories.map((c) => {
                            const isClassic = c.scoringRule.scoringSystem === 'classic';
                            const modeDesc = isClassic
                              ? `Klasik ${c.scoringRule.pointsPerGame}pt · ${c.scoringRule.serviceChances ?? 2}× Servis`
                              : `Rally ${c.scoringRule.pointsPerGame}pt`;
                            return (
                              <div key={c.id} className="py-2.5 flex items-center justify-between text-xs gap-2">
                                <div>
                                  <div className="font-semibold text-[#152238]">{c.name}</div>
                                  <div className="text-slate-500">
                                    {FORMAT_LABEL[c.format]} · Best of {c.scoringRule.bestOf} · {modeDesc}
                                  </div>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => handleScoringTargetChange(c.id)}
                                  className="text-[11px] font-semibold text-[#167D54] hover:underline shrink-0"
                                >
                                  Atur Skor
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </main>
      </div>

      {/* Add Category Modal */}
      {showAddCategory && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#152238]/60 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white border border-[#E2E8E5] p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-[#152238]">Tambah Kategori Pertandingan</h3>
              <button type="button" onClick={() => setShowAddCategory(false)}>
                <X className="w-5 h-5 text-slate-400" />
              </button>
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">Jenis Kategori</label>
              <select
                value={newCatType}
                onChange={(e) => setNewCatType(e.target.value as CategoryType)}
                className="w-full px-3 py-2 rounded-xl border border-[#E2E8E5] text-sm"
              >
                {(Object.keys(CATEGORY_LABELS) as CategoryType[]).map((t) => (
                  <option key={t} value={t}>
                    {CATEGORY_LABELS[t]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">Nama Kategori (Opsional)</label>
              <input
                type="text"
                value={newCatName}
                onChange={(e) => setNewCatName(e.target.value)}
                placeholder={CATEGORY_LABELS[newCatType]}
                className="w-full px-3 py-2 rounded-xl border border-[#E2E8E5] text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">Format Kompetisi</label>
              <select
                value={newCatFormat}
                onChange={(e) =>
                  setNewCatFormat(e.target.value as 'group' | 'knockout' | 'group_knockout')
                }
                className="w-full px-3 py-2 rounded-xl border border-[#E2E8E5] text-sm"
              >
                <option value="group">Sistem Grup (Round Robin)</option>
                <option value="knockout">Sistem Gugur (Knockout)</option>
                <option value="group_knockout">Kombinasi Grup + Gugur</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">Mode & Preset Aturan Skor</label>
              <select
                value={newCatPreset}
                onChange={(e) => setNewCatPreset(e.target.value as ScoringPreset)}
                className="w-full px-3 py-2 rounded-xl border border-[#E2E8E5] text-sm"
              >
                <option value="standard">Mode 1 · Rally Poin (21 poin, Best of 3)</option>
                <option value="classic">Mode 2 · Klasik Pindah Bola (15 poin, 2× servis, Best of 3)</option>
                <option value="mini">Mini Tournament (Rally 15 poin, Best of 1)</option>
                <option value="fun">Fun Match (Rally 21 poin, Best of 1)</option>
              </select>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowAddCategory(false)}
                className="px-4 py-2 rounded-xl border border-[#E2E8E5] text-xs font-semibold"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={() => void handleAddCategory()}
                className="px-4 py-2 rounded-xl bg-[#167D54] text-white text-xs font-semibold"
              >
                Simpan Kategori
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
