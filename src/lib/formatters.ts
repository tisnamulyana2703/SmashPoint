import type {
  CompetitionFormat,
  Match,
  MatchStatus,
  Participant,
  TournamentStatus,
} from '../shared/types';

export const MATCH_STATUS_LABEL: Record<MatchStatus, string> = {
  draft: 'Draf',
  scheduled: 'Terjadwal',
  ready: 'Siap Tanding',
  live: 'Berlangsung',
  paused: 'Dijeda',
  completed: 'Selesai',
  walkover: 'Walkover',
  cancelled: 'Dibatalkan',
};

export const TOURNAMENT_STATUS_LABEL: Record<TournamentStatus, string> = {
  draft: 'Draf',
  published: 'Dipublikasikan',
  ongoing: 'Sedang Berjalan',
  completed: 'Selesai',
};

export const FORMAT_LABEL: Record<CompetitionFormat, string> = {
  group: 'Sistem Grup (Round Robin)',
  knockout: 'Sistem Gugur (Knockout)',
  group_knockout: 'Kombinasi Grup + Gugur',
};

export function formatDateRangeID(startDate: string, endDate: string): string {
  if (!startDate) return '-';
  const opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' };
  const s = new Date(startDate + 'T00:00:00');
  const e = new Date((endDate || startDate) + 'T00:00:00');
  if (Number.isNaN(s.getTime())) return startDate;
  if (startDate === endDate || !endDate) {
    return s.toLocaleDateString('id-ID', opts);
  }
  if (s.getMonth() === e.getMonth() && s.getFullYear() === e.getFullYear()) {
    return `${s.getDate()}–${e.toLocaleDateString('id-ID', opts)}`;
  }
  return `${s.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })} – ${e.toLocaleDateString('id-ID', opts)}`;
}

export function getParticipantDisplay(
  participantId: string | null | undefined,
  participants: Participant[],
  placeholder?: string
): { name: string; club: string; isPlaceholder: boolean } {
  if (!participantId) {
    return {
      name: placeholder || 'Menunggu Pemenang',
      club: '',
      isPlaceholder: true,
    };
  }
  const found = participants.find((p) => p.id === participantId);
  if (!found) {
    return { name: placeholder || 'Peserta', club: '', isPlaceholder: true };
  }
  return { name: found.name, club: found.clubOrTeam, isPlaceholder: false };
}

export function formatMatchGamesSummary(match: Match): string {
  if (match.isBye) return 'BYE';
  if (match.status === 'walkover') return 'WO';
  const played = match.games.filter((g) => g.scoreA > 0 || g.scoreB > 0 || g.winnerSide);
  if (played.length === 0) return '0–0';
  return played.map((g) => `${g.scoreA}–${g.scoreB}`).join(', ');
}

export function buildPublicUrl(slugOrId: string): string {
  const url = new URL(window.location.href);
  url.search = '';
  url.searchParams.set('view', 'public');
  url.searchParams.set('slug', slugOrId);
  return url.toString();
}

export function buildTvUrl(tournamentId: string): string {
  const url = new URL(window.location.href);
  url.search = '';
  url.searchParams.set('view', 'tv');
  url.searchParams.set('id', tournamentId);
  return url.toString();
}

export function buildRefereeUrl(tournamentId: string, pin?: string): string {
  const url = new URL(window.location.href);
  url.search = '';
  url.searchParams.set('view', 'referee');
  url.searchParams.set('id', tournamentId);
  if (pin) url.searchParams.set('pin', pin);
  return url.toString();
}

export function exportResultsToCsv(
  tournamentName: string,
  matches: Match[],
  participants: Participant[],
  categoryMap: Map<string, string>
): void {
  const headers = [
    'Kategori',
    'Tahap',
    'Ronde',
    'Lapangan',
    'Jadwal',
    'Peserta A',
    'Peserta B',
    'Skor',
    'Status',
    'Pemenang',
  ];

  const escapeCsv = (val: string) => `"${(val || '').replace(/"/g, '""')}"`;

  const rows = matches
    .filter((m) => !m.isBye)
    .map((m) => {
      const pA = getParticipantDisplay(m.participantAId, participants, m.placeholderA);
      const pB = getParticipantDisplay(m.participantBId, participants, m.placeholderB);
      const win = m.winnerId
        ? getParticipantDisplay(m.winnerId, participants).name
        : '-';
      return [
        categoryMap.get(m.categoryId) || '-',
        m.stage === 'group' ? 'Grup' : 'Gugur',
        m.roundLabel,
        m.court || '-',
        m.scheduledTime || '-',
        pA.name,
        pB.name,
        formatMatchGamesSummary(m),
        MATCH_STATUS_LABEL[m.status],
        win,
      ]
        .map(escapeCsv)
        .join(',');
    });

  const csvContent = '\uFEFF' + [headers.map(escapeCsv).join(','), ...rows].join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${tournamentName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-laporan.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
