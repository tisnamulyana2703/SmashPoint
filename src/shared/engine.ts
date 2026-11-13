import type {
  Category,
  CategoryType,
  GameScore,
  Group,
  GroupStandingBundle,
  Match,
  Participant,
  ScoreEvent,
  ScoringPreset,
  ScoringRule,
  StandingRow,
  TieBreakCriterion,
} from './types.ts';

export const SCORING_PRESETS: Record<ScoringPreset, Omit<ScoringRule, 'preset'>> = {
  standard: {
    scoringSystem: 'rally',
    serviceChances: 1,
    pointsPerGame: 21,
    maxPoints: 30,
    minimumLead: 2,
    bestOf: 3,
    intervalPoints: 11,
    changeEndsOnInterval: true,
  },
  classic: {
    scoringSystem: 'classic',
    serviceChances: 2,
    pointsPerGame: 15,
    maxPoints: 17,
    minimumLead: 2,
    bestOf: 3,
    intervalPoints: 8,
    changeEndsOnInterval: true,
  },
  mini: {
    scoringSystem: 'rally',
    serviceChances: 1,
    pointsPerGame: 15,
    maxPoints: 21,
    minimumLead: 2,
    bestOf: 1,
    intervalPoints: 8,
    changeEndsOnInterval: true,
  },
  fun: {
    scoringSystem: 'rally',
    serviceChances: 1,
    pointsPerGame: 21,
    maxPoints: 30,
    minimumLead: 2,
    bestOf: 1,
    intervalPoints: 11,
    changeEndsOnInterval: true,
  },
  custom: {
    scoringSystem: 'rally',
    serviceChances: 1,
    pointsPerGame: 21,
    maxPoints: 30,
    minimumLead: 2,
    bestOf: 3,
    intervalPoints: 11,
    changeEndsOnInterval: true,
  },
};

export const CATEGORY_LABELS: Record<CategoryType, string> = {
  mens_singles: 'Tunggal Putra',
  womens_singles: 'Tunggal Putri',
  mens_doubles: 'Ganda Putra',
  womens_doubles: 'Ganda Putri',
  mixed_doubles: 'Ganda Campuran',
};

export const DEFAULT_TIE_BREAK_ORDER: TieBreakCriterion[] = [
  'wins',
  'head_to_head',
  'game_diff',
  'point_diff',
  'points_for',
];

export function createId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36).slice(-4)}`;
}

export function createSlug(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 42);
  return `${base || 'turnamen'}-${Math.random().toString(36).slice(2, 6)}`;
}

export function generatePin(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

export function getScoringRuleForPreset(preset: ScoringPreset): ScoringRule {
  return {
    preset,
    ...SCORING_PRESETS[preset],
  };
}

export function isGameWon(scoreA: number, scoreB: number, rule: ScoringRule): 'A' | 'B' | null {
  if (scoreA >= rule.maxPoints && scoreA > scoreB) return 'A';
  if (scoreB >= rule.maxPoints && scoreB > scoreA) return 'B';
  if (scoreA >= rule.pointsPerGame && scoreA - scoreB >= rule.minimumLead) return 'A';
  if (scoreB >= rule.pointsPerGame && scoreB - scoreA >= rule.minimumLead) return 'B';
  return null;
}

export function getGamesWonCount(games: GameScore[]): { gamesA: number; gamesB: number } {
  let gamesA = 0;
  let gamesB = 0;
  for (const g of games) {
    if (g.winnerSide === 'A') gamesA += 1;
    if (g.winnerSide === 'B') gamesB += 1;
  }
  return { gamesA, gamesB };
}

export interface ScoringIndicators {
  gamesWonA: number;
  gamesWonB: number;
  gamesNeeded: number;
  isDeuce: boolean;
  gamePointSide: 'A' | 'B' | null;
  matchPointSide: 'A' | 'B' | null;
  isInterval: boolean;
}

export function getScoringIndicators(match: Match): ScoringIndicators {
  const rule = match.scoringRuleSnapshot;
  const gamesNeeded = Math.ceil(rule.bestOf / 2);
  const { gamesA, gamesB } = getGamesWonCount(match.games);
  const current = match.games.find((g) => g.gameNumber === match.currentGame) ?? match.games[match.games.length - 1];

  if (!current || current.winnerSide) {
    return {
      gamesWonA: gamesA,
      gamesWonB: gamesB,
      gamesNeeded,
      isDeuce: false,
      gamePointSide: null,
      matchPointSide: null,
      isInterval: false,
    };
  }

  const a = current.scoreA;
  const b = current.scoreB;
  const deuceThreshold = rule.pointsPerGame - 1;
  const isDeuce = a >= deuceThreshold && b >= deuceThreshold && a === b && a < rule.maxPoints - 1;

  const aWouldWin = isGameWon(a + 1, b, rule) === 'A';
  const bWouldWin = isGameWon(a, b + 1, rule) === 'B';

  const gamePointSide: 'A' | 'B' | null = aWouldWin ? 'A' : bWouldWin ? 'B' : null;
  let matchPointSide: 'A' | 'B' | null = null;
  if (gamePointSide === 'A' && gamesA + 1 >= gamesNeeded) matchPointSide = 'A';
  if (gamePointSide === 'B' && gamesB + 1 >= gamesNeeded) matchPointSide = 'B';

  const isInterval =
    rule.intervalPoints > 0 &&
    ((a === rule.intervalPoints && b < rule.intervalPoints) ||
      (b === rule.intervalPoints && a < rule.intervalPoints));

  return {
    gamesWonA: gamesA,
    gamesWonB: gamesB,
    gamesNeeded,
    isDeuce,
    gamePointSide,
    matchPointSide,
    isInterval,
  };
}

export function applyMatchScoreAction(
  match: Match,
  action: 'start' | 'point_a' | 'point_b' | 'undo' | 'pause' | 'resume' | 'swap_ends' | 'toggle_serve' | 'confirm' | 'walkover' | 'update_note',
  options: {
    actor?: 'referee' | 'admin';
    clientEventId?: string;
    winnerSide?: 'A' | 'B';
    note?: string;
  } = {}
): { match: Match; error?: string } {
  const actor = options.actor ?? 'referee';
  const now = new Date().toISOString();

  if (
    options.clientEventId &&
    match.scoreEvents.some((ev) => ev.clientEventId && ev.clientEventId === options.clientEventId)
  ) {
    return { match };
  }

  const next: Match = structuredClone(match);
  const rule = next.scoringRuleSnapshot;
  const gamesNeeded = Math.ceil(rule.bestOf / 2);

  if (!next.games || next.games.length === 0) {
    next.games = [{ gameNumber: 1, scoreA: 0, scoreB: 0 }];
    next.currentGame = 1;
  }

  const activeGame = () => {
    let g = next.games.find((item) => item.gameNumber === next.currentGame);
    if (!g) {
      g = { gameNumber: next.currentGame, scoreA: 0, scoreB: 0 };
      next.games.push(g);
    }
    return g;
  };

  if (action === 'update_note') {
    next.notes = options.note ?? '';
    next.updatedAt = now;
    return { match: next };
  }

  if (action === 'start') {
    if (next.status === 'completed' || next.status === 'walkover') {
      return { match, error: 'Pertandingan sudah selesai.' };
    }
    if (!next.participantAId || !next.participantBId) {
      return { match, error: 'Peserta belum lengkap untuk memulai pertandingan.' };
    }
    next.status = 'live';
    const g = activeGame();
    next.scoreEvents.push({
      id: createId('evt'),
      clientEventId: options.clientEventId,
      matchId: next.id,
      timestamp: now,
      actor,
      action: 'start',
      gameNumber: g.gameNumber,
      oldScoreA: g.scoreA,
      oldScoreB: g.scoreB,
      newScoreA: g.scoreA,
      newScoreB: g.scoreB,
      note: 'Pertandingan dimulai',
    });
    next.updatedAt = now;
    return { match: next };
  }

  if (action === 'pause') {
    if (next.status !== 'live') return { match, error: 'Pertandingan tidak sedang berlangsung.' };
    const g = activeGame();
    next.status = 'paused';
    next.scoreEvents.push({
      id: createId('evt'),
      clientEventId: options.clientEventId,
      matchId: next.id,
      timestamp: now,
      actor,
      action: 'pause',
      gameNumber: g.gameNumber,
      oldScoreA: g.scoreA,
      oldScoreB: g.scoreB,
      newScoreA: g.scoreA,
      newScoreB: g.scoreB,
      note: options.note || 'Pertandingan dijeda',
    });
    next.updatedAt = now;
    return { match: next };
  }

  if (action === 'resume') {
    if (next.status !== 'paused' && next.status !== 'ready' && next.status !== 'scheduled') {
      return { match, error: 'Pertandingan tidak dalam status jeda.' };
    }
    const g = activeGame();
    next.status = 'live';
    next.scoreEvents.push({
      id: createId('evt'),
      clientEventId: options.clientEventId,
      matchId: next.id,
      timestamp: now,
      actor,
      action: 'resume',
      gameNumber: g.gameNumber,
      oldScoreA: g.scoreA,
      oldScoreB: g.scoreB,
      newScoreA: g.scoreA,
      newScoreB: g.scoreB,
      note: 'Pertandingan dilanjutkan',
    });
    next.updatedAt = now;
    return { match: next };
  }

  if (action === 'swap_ends') {
    const g = activeGame();
    next.endsSwapped = !next.endsSwapped;
    next.scoreEvents.push({
      id: createId('evt'),
      clientEventId: options.clientEventId,
      matchId: next.id,
      timestamp: now,
      actor,
      action: 'swap_ends',
      gameNumber: g.gameNumber,
      oldScoreA: g.scoreA,
      oldScoreB: g.scoreB,
      newScoreA: g.scoreA,
      newScoreB: g.scoreB,
      note: 'Pergantian sisi lapangan',
    });
    next.updatedAt = now;
    return { match: next };
  }

  if (action === 'toggle_serve') {
    const g = activeGame();
    const oldServing = next.servingSide;
    const oldHand: 1 | 2 = next.serviceHand ?? 1;
    const isClassic = rule.scoringSystem === 'classic' && (rule.serviceChances ?? 2) >= 2;

    if (isClassic && oldHand === 1) {
      next.serviceHand = 2;
    } else {
      next.servingSide = next.servingSide === 'A' ? 'B' : 'A';
      next.serviceHand = 1;
    }

    next.scoreEvents.push({
      id: createId('evt'),
      clientEventId: options.clientEventId,
      matchId: next.id,
      timestamp: now,
      actor,
      action: 'toggle_serve',
      gameNumber: g.gameNumber,
      oldScoreA: g.scoreA,
      oldScoreB: g.scoreB,
      newScoreA: g.scoreA,
      newScoreB: g.scoreB,
      oldServingSide: oldServing,
      oldServiceHand: oldHand,
      newServingSide: next.servingSide,
      newServiceHand: next.serviceHand,
      note: isClassic
        ? `Servis Tim ${next.servingSide} (Kesempatan ${next.serviceHand}/2)`
        : `Pindah servis ke Tim ${next.servingSide}`,
    });
    next.updatedAt = now;
    return { match: next };
  }

  if (action === 'walkover') {
    const winSide = options.winnerSide ?? 'A';
    const winnerId = winSide === 'A' ? next.participantAId : next.participantBId;
    if (!winnerId) return { match, error: 'Pemenang walkover tidak valid.' };
    const g = activeGame();
    next.status = 'walkover';
    next.winnerId = winnerId;
    next.awaitingConfirmation = false;
    next.pendingWinnerId = null;
    next.notes = options.note || next.notes || `Walkover untuk Tim ${winSide}`;
    next.scoreEvents.push({
      id: createId('evt'),
      clientEventId: options.clientEventId,
      matchId: next.id,
      timestamp: now,
      actor,
      action: 'walkover',
      gameNumber: g.gameNumber,
      oldScoreA: g.scoreA,
      oldScoreB: g.scoreB,
      newScoreA: g.scoreA,
      newScoreB: g.scoreB,
      note: next.notes,
    });
    next.updatedAt = now;
    return { match: next };
  }

  if (action === 'confirm') {
    if (!next.awaitingConfirmation || !next.pendingWinnerId) {
      return { match, error: 'Pertandingan belum mencapai poin kemenangan untuk dikonfirmasi.' };
    }
    const g = activeGame();
    next.status = 'completed';
    next.winnerId = next.pendingWinnerId;
    next.awaitingConfirmation = false;
    next.pendingWinnerId = null;
    next.scoreEvents.push({
      id: createId('evt'),
      clientEventId: options.clientEventId,
      matchId: next.id,
      timestamp: now,
      actor,
      action: 'confirm',
      gameNumber: g.gameNumber,
      oldScoreA: g.scoreA,
      oldScoreB: g.scoreB,
      newScoreA: g.scoreA,
      newScoreB: g.scoreB,
      note: 'Hasil akhir dikonfirmasi wasit',
    });
    next.updatedAt = now;
    return { match: next };
  }

  if (action === 'undo') {
    const lastPointIdx = [...next.scoreEvents]
      .reverse()
      .findIndex(
        (ev) =>
          ev.action === 'point_a' ||
          ev.action === 'point_b' ||
          ev.action === 'service_fault' ||
          ev.action === 'side_out'
      );

    if (lastPointIdx === -1) {
      return { match, error: 'Tidak ada reli atau skor yang dapat di-undo.' };
    }

    const actualIdx = next.scoreEvents.length - 1 - lastPointIdx;
    const targetEv = next.scoreEvents[actualIdx];

    // Remove the target rally event (and any trailing non-rally events after it)
    next.scoreEvents = next.scoreEvents.slice(0, actualIdx);

    // If a newer empty game was opened right after that winning point, trim empty trailing games
    while (
      next.games.length > 1 &&
      next.games[next.games.length - 1].gameNumber > targetEv.gameNumber &&
      next.games[next.games.length - 1].scoreA === 0 &&
      next.games[next.games.length - 1].scoreB === 0
    ) {
      next.games.pop();
    }

    next.currentGame = targetEv.gameNumber;
    const targetGame = activeGame();
    targetGame.scoreA = targetEv.oldScoreA;
    targetGame.scoreB = targetEv.oldScoreB;
    delete targetGame.winnerSide;

    if (targetEv.oldServingSide) next.servingSide = targetEv.oldServingSide;
    if (targetEv.oldServiceHand) next.serviceHand = targetEv.oldServiceHand;

    next.awaitingConfirmation = false;
    next.pendingWinnerId = null;
    if (next.status === 'completed') {
      next.status = 'live';
      next.winnerId = null;
    }

    next.scoreEvents.push({
      id: createId('evt'),
      clientEventId: options.clientEventId,
      matchId: next.id,
      timestamp: now,
      actor,
      action: 'undo',
      gameNumber: targetEv.gameNumber,
      oldScoreA: targetEv.newScoreA,
      oldScoreB: targetEv.newScoreB,
      newScoreA: targetEv.oldScoreA,
      newScoreB: targetEv.oldScoreB,
      note: `Koreksi undo Game ${targetEv.gameNumber}`,
    });
    next.updatedAt = now;
    return { match: next };
  }

  // point_a or point_b (Rally winner A or B)
  if (next.status === 'completed' || next.status === 'walkover' || next.status === 'cancelled') {
    return { match, error: 'Pertandingan sudah selesai dan terkunci.' };
  }
  if (next.awaitingConfirmation) {
    return { match, error: 'Silakan konfirmasi hasil akhir atau tekan Undo terlebih dahulu.' };
  }
  if (next.status === 'scheduled' || next.status === 'ready' || next.status === 'draft') {
    next.status = 'live';
  }
  if (next.status === 'paused') {
    next.status = 'live';
  }

  const g = activeGame();
  const oldA = g.scoreA;
  const oldB = g.scoreB;
  const oldServing = next.servingSide ?? 'A';
  const oldHand: 1 | 2 = next.serviceHand ?? 1;

  const rallyWinner: 'A' | 'B' = action === 'point_a' ? 'A' : 'B';
  const isClassic = rule.scoringSystem === 'classic';
  const maxHands = rule.serviceChances ?? (isClassic ? 2 : 1);

  let recordedAction: ScoreEvent['action'] = action;
  let eventNote: string | undefined;

  if (isClassic) {
    if (rallyWinner === oldServing) {
      // Serving side wins rally -> +1 point, keeps current service hand
      if (rallyWinner === 'A') g.scoreA += 1;
      else g.scoreB += 1;
      next.servingSide = oldServing;
      next.serviceHand = oldHand;
      recordedAction = rallyWinner === 'A' ? 'point_a' : 'point_b';
    } else if (oldHand < maxHands) {
      // Receiving side wins rally while server is on hand 1 -> move to 2nd service chance (no point)
      next.servingSide = oldServing;
      next.serviceHand = 2;
      recordedAction = 'service_fault';
      eventNote = `Tim ${oldServing} turun ke Kesempatan Servis 2/${maxHands}`;
    } else {
      // Receiving side wins rally on final service hand -> side out to receiving side (hand 1, no point)
      next.servingSide = rallyWinner;
      next.serviceHand = 1;
      recordedAction = 'side_out';
      eventNote = `Pindah Bola ke Tim ${rallyWinner} (Servis 1/${maxHands})`;
    }
  } else {
    // Rally Point mode: winner of rally always gets +1 point and serves next
    if (action === 'point_a') {
      g.scoreA += 1;
      next.servingSide = 'A';
    } else {
      g.scoreB += 1;
      next.servingSide = 'B';
    }
    next.serviceHand = 1;
  }

  next.scoreEvents.push({
    id: createId('evt'),
    clientEventId: options.clientEventId,
    matchId: next.id,
    timestamp: now,
    actor,
    action: recordedAction,
    gameNumber: g.gameNumber,
    oldScoreA: oldA,
    oldScoreB: oldB,
    newScoreA: g.scoreA,
    newScoreB: g.scoreB,
    oldServingSide: oldServing,
    oldServiceHand: oldHand,
    newServingSide: next.servingSide,
    newServiceHand: next.serviceHand,
    note: eventNote,
  });

  // Check deciding game interval swap on final game
  const isDecidingGame = rule.bestOf > 1 && next.currentGame === rule.bestOf;
  if (
    isDecidingGame &&
    rule.changeEndsOnInterval &&
    rule.intervalPoints > 0 &&
    ((g.scoreA === rule.intervalPoints && oldA < rule.intervalPoints && g.scoreB < rule.intervalPoints) ||
      (g.scoreB === rule.intervalPoints && oldB < rule.intervalPoints && g.scoreA < rule.intervalPoints))
  ) {
    next.endsSwapped = !next.endsSwapped;
  }

  const gameWinner = isGameWon(g.scoreA, g.scoreB, rule);
  if (gameWinner) {
    g.winnerSide = gameWinner;
    const { gamesA, gamesB } = getGamesWonCount(next.games);
    if (gamesA >= gamesNeeded || gamesB >= gamesNeeded) {
      next.awaitingConfirmation = true;
      next.pendingWinnerId = gameWinner === 'A' ? next.participantAId : next.participantBId;
    } else if (next.games.length < rule.bestOf) {
      const nextGameNum = next.currentGame + 1;
      next.currentGame = nextGameNum;
      next.games.push({ gameNumber: nextGameNum, scoreA: 0, scoreB: 0 });
      next.endsSwapped = !next.endsSwapped;
      next.servingSide = gameWinner;
      next.serviceHand = 1;
    }
  }

  next.updatedAt = now;
  return { match: next };
}

function shuffleArray<T>(items: T[]): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function nextPowerOfTwo(n: number): number {
  let p = 2;
  while (p < n) p *= 2;
  return p;
}

function buildSeededBracketOrder(size: number): number[] {
  let rounds = [1, 2];
  while (rounds.length < size) {
    const nextSize = rounds.length * 2 + 1;
    const expanded: number[] = [];
    for (const seed of rounds) {
      expanded.push(seed, nextSize - seed);
    }
    rounds = expanded;
  }
  return rounds;
}

function getRoundLabel(roundNumber: number, totalRounds: number): string {
  const fromEnd = totalRounds - roundNumber;
  if (fromEnd === 0) return 'Final';
  if (fromEnd === 1) return 'Semifinal';
  if (fromEnd === 2) return 'Perempat Final';
  if (fromEnd === 3) return '16 Besar';
  if (fromEnd === 4) return '32 Besar';
  return `Ronde ${roundNumber}`;
}

export function generateGroupStageForCategory(
  category: Category,
  participants: Participant[],
  courts: string[],
  existingGroups?: Group[]
): { groups: Group[]; matches: Match[] } {
  const now = new Date().toISOString();
  const groupCount = Math.max(1, Math.min(category.groupConfig.groupCount || 2, Math.max(1, Math.floor(participants.length / 2))));
  const groups: Group[] = [];
  const matches: Match[] = [];

  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const orderedParticipants =
    category.groupConfig.drawMode === 'manual' ? [...participants] : shuffleArray(participants);

  for (let i = 0; i < groupCount; i += 1) {
    const name = `Grup ${letters[i] ?? i + 1}`;
    const existing = existingGroups?.find((g) => g.name === name);
    groups.push({
      id: existing?.id ?? createId('grp'),
      tournamentId: category.tournamentId,
      categoryId: category.id,
      name,
      participantIds: [],
      overrides: existing?.overrides ?? [],
    });
  }

  if (category.groupConfig.drawMode === 'manual' && participants.some((p) => p.groupId)) {
    for (const p of orderedParticipants) {
      const target = groups.find((g) => g.id === p.groupId) ?? groups[0];
      target.participantIds.push(p.id);
    }
  } else {
    orderedParticipants.forEach((p, idx) => {
      const grpIdx = idx % groupCount;
      groups[grpIdx].participantIds.push(p.id);
    });
  }

  let matchOrder = 1;
  const safeCourts = courts.length > 0 ? courts : ['Lapangan 1'];

  for (const grp of groups) {
    const ids = [...grp.participantIds];
    if (ids.length < 2) continue;

    // Circle method round-robin scheduling
    const roster: (string | null)[] = [...ids];
    if (roster.length % 2 === 1) roster.push(null);
    const totalRounds = roster.length - 1;
    const half = roster.length / 2;

    for (let r = 0; r < totalRounds; r += 1) {
      for (let m = 0; m < half; m += 1) {
        const pA = roster[m];
        const pB = roster[roster.length - 1 - m];
        if (pA && pB) {
          matches.push({
            id: createId('m'),
            tournamentId: category.tournamentId,
            categoryId: category.id,
            stage: 'group',
            groupId: grp.id,
            roundNumber: r + 1,
            roundLabel: `${grp.name} · Pekan ${r + 1}`,
            matchOrder,
            court: safeCourts[(matchOrder - 1) % safeCourts.length],
            scheduledTime: '',
            participantAId: pA,
            participantBId: pB,
            status: 'scheduled',
            scoringRuleSnapshot: structuredClone(category.scoringRule),
            games: [{ gameNumber: 1, scoreA: 0, scoreB: 0 }],
            currentGame: 1,
            servingSide: 'A',
            endsSwapped: false,
            winnerId: null,
            notes: '',
            scoreEvents: [],
            updatedAt: now,
          });
          matchOrder += 1;
        }
      }
      // Rotate all except index 0
      const last = roster.pop()!;
      roster.splice(1, 0, last);
    }
  }

  return { groups, matches };
}

export function generateKnockoutBracket(
  category: Category,
  slots: Array<{ participantId: string | null; placeholder?: string }>,
  courts: string[],
  startOrder = 1
): Match[] {
  const now = new Date().toISOString();
  const safeCourts = courts.length > 0 ? courts : ['Lapangan 1'];
  const count = Math.max(2, slots.length);
  const bracketSize = nextPowerOfTwo(count);
  const totalRounds = Math.log2(bracketSize);
  const seedOrder = buildSeededBracketOrder(bracketSize);

  const paddedSlots = seedOrder.map((seedPos) => {
    const item = slots[seedPos - 1];
    return item ?? { participantId: null, placeholder: 'BYE' };
  });

  const roundMatches: Match[][] = [];
  let orderCounter = startOrder;

  for (let r = 1; r <= totalRounds; r += 1) {
    const matchCount = bracketSize / Math.pow(2, r);
    const currentRound: Match[] = [];
    const label = getRoundLabel(r, totalRounds);

    for (let i = 0; i < matchCount; i += 1) {
      const m: Match = {
        id: createId('m'),
        tournamentId: category.tournamentId,
        categoryId: category.id,
        stage: 'knockout',
        roundNumber: r,
        roundLabel: label,
        matchOrder: orderCounter,
        court: safeCourts[(orderCounter - 1) % safeCourts.length],
        scheduledTime: '',
        participantAId: null,
        participantBId: null,
        status: 'scheduled',
        scoringRuleSnapshot: structuredClone(category.scoringRule),
        games: [{ gameNumber: 1, scoreA: 0, scoreB: 0 }],
        currentGame: 1,
        servingSide: 'A',
        endsSwapped: false,
        winnerId: null,
        notes: '',
        scoreEvents: [],
        updatedAt: now,
      };

      if (r === 1) {
        const slotA = paddedSlots[i * 2];
        const slotB = paddedSlots[i * 2 + 1];
        m.participantAId = slotA?.participantId ?? null;
        m.participantBId = slotB?.participantId ?? null;
        if (slotA?.placeholder && slotA.placeholder !== 'BYE') m.placeholderA = slotA.placeholder;
        if (slotB?.placeholder && slotB.placeholder !== 'BYE') m.placeholderB = slotB.placeholder;

        const aIsBye = slotA?.placeholder === 'BYE' || (!slotA?.participantId && !slotA?.placeholder);
        const bIsBye = slotB?.placeholder === 'BYE' || (!slotB?.participantId && !slotB?.placeholder);

        if (aIsBye && !bIsBye && m.participantBId) {
          m.isBye = true;
          m.status = 'completed';
          m.winnerId = m.participantBId;
          m.notes = 'Lolos otomatis (Bye)';
        } else if (bIsBye && !aIsBye && m.participantAId) {
          m.isBye = true;
          m.status = 'completed';
          m.winnerId = m.participantAId;
          m.notes = 'Lolos otomatis (Bye)';
        } else if (aIsBye && bIsBye) {
          m.isBye = true;
          m.status = 'completed';
        }
      }

      currentRound.push(m);
      orderCounter += 1;
    }
    roundMatches.push(currentRound);
  }

  // Link nextMatchId
  for (let r = 0; r < roundMatches.length - 1; r += 1) {
    const curr = roundMatches[r];
    const nextRound = roundMatches[r + 1];
    curr.forEach((m, idx) => {
      const target = nextRound[Math.floor(idx / 2)];
      m.nextMatchId = target.id;
      m.nextSlot = idx % 2 === 0 ? 'A' : 'B';
    });
  }

  // Propagate Round 1 BYE winners into Round 2
  const allMatches = roundMatches.flat();
  if (roundMatches.length >= 2) {
    for (const m of roundMatches[0]) {
      if (m.isBye && m.winnerId && m.nextMatchId) {
        const nextMatch = allMatches.find((nm) => nm.id === m.nextMatchId);
        if (nextMatch) {
          if (m.nextSlot === 'A') nextMatch.participantAId = m.winnerId;
          else nextMatch.participantBId = m.winnerId;
        }
      }
    }
  }

  // Optional 3rd place match
  if (category.knockoutConfig.thirdPlaceMatch && totalRounds >= 2) {
    const sfRound = roundMatches[totalRounds - 2];
    const thirdPlaceMatch: Match = {
      id: createId('m'),
      tournamentId: category.tournamentId,
      categoryId: category.id,
      stage: 'knockout',
      roundNumber: totalRounds,
      roundLabel: 'Perebutan Juara 3',
      matchOrder: orderCounter,
      court: safeCourts[(orderCounter - 1) % safeCourts.length],
      scheduledTime: '',
      participantAId: null,
      participantBId: null,
      placeholderA: 'Kalah Semifinal 1',
      placeholderB: 'Kalah Semifinal 2',
      isThirdPlace: true,
      status: 'scheduled',
      scoringRuleSnapshot: structuredClone(category.scoringRule),
      games: [{ gameNumber: 1, scoreA: 0, scoreB: 0 }],
      currentGame: 1,
      servingSide: 'A',
      endsSwapped: false,
      winnerId: null,
      notes: '',
      scoreEvents: [],
      updatedAt: now,
    };
    if (sfRound[0]) sfRound[0].thirdPlaceMatchId = thirdPlaceMatch.id;
    if (sfRound[1]) sfRound[1].thirdPlaceMatchId = thirdPlaceMatch.id;
    allMatches.push(thirdPlaceMatch);
  }

  // Set ready status where both participants are known and not completed
  for (const m of allMatches) {
    if (m.status === 'scheduled' && m.participantAId && m.participantBId) {
      m.status = 'ready';
    }
  }

  return allMatches;
}

export function generateCategoryFixtures(
  category: Category,
  participants: Participant[],
  courts: string[],
  existingGroups?: Group[]
): { groups: Group[]; matches: Match[] } {
  if (participants.length < 2) {
    return { groups: [], matches: [] };
  }

  if (category.format === 'group') {
    return generateGroupStageForCategory(category, participants, courts, existingGroups);
  }

  if (category.format === 'knockout') {
    const sorted =
      category.knockoutConfig.drawMode === 'seeded'
        ? [...participants].sort((a, b) => (a.seed ?? 999) - (b.seed ?? 999))
        : shuffleArray(participants);
    const slots = sorted.map((p) => ({ participantId: p.id }));
    const matches = generateKnockoutBracket(category, slots, courts, 1);
    return { groups: [], matches };
  }

  // group_knockout
  const groupResult = generateGroupStageForCategory(category, participants, courts, existingGroups);
  const advancePerGroup = Math.max(1, category.groupConfig.advancePerGroup || 2);

  // Cross-seed qualifiers: e.g., Group A #1 vs Group B #2, Group B #1 vs Group A #2
  const qualifierSlots: Array<{ participantId: string | null; placeholder?: string }> = [];
  const gCount = groupResult.groups.length;
  if (gCount >= 2 && advancePerGroup === 2) {
    for (let i = 0; i < gCount; i += 2) {
      const g1 = groupResult.groups[i];
      const g2 = groupResult.groups[i + 1];
      if (g2) {
        qualifierSlots.push({ participantId: null, placeholder: `Juara ${g1.name}` });
        qualifierSlots.push({ participantId: null, placeholder: `Runner-up ${g2.name}` });
        qualifierSlots.push({ participantId: null, placeholder: `Juara ${g2.name}` });
        qualifierSlots.push({ participantId: null, placeholder: `Runner-up ${g1.name}` });
      } else {
        qualifierSlots.push({ participantId: null, placeholder: `Juara ${g1.name}` });
        qualifierSlots.push({ participantId: null, placeholder: `Runner-up ${g1.name}` });
      }
    }
  } else {
    for (let rank = 1; rank <= advancePerGroup; rank += 1) {
      for (const g of groupResult.groups) {
        qualifierSlots.push({
          participantId: null,
          placeholder: `${rank === 1 ? 'Juara' : `Peringkat ${rank}`} ${g.name}`,
        });
      }
    }
  }

  const koMatches = generateKnockoutBracket(
    category,
    qualifierSlots,
    courts,
    groupResult.matches.length + 1
  );
  return {
    groups: groupResult.groups,
    matches: [...groupResult.matches, ...koMatches],
  };
}

export function calculateGroupStandings(
  category: Category,
  group: Group,
  participants: Participant[],
  groupMatches: Match[]
): GroupStandingBundle {
  const memberParticipants = group.participantIds
    .map((id) => participants.find((p) => p.id === id))
    .filter((p): p is Participant => Boolean(p));

  const finishedMatches = groupMatches.filter(
    (m) =>
      m.groupId === group.id &&
      (m.status === 'completed' || m.status === 'walkover') &&
      m.participantAId &&
      m.participantBId
  );

  const statsMap = new Map<string, Omit<StandingRow, 'rank' | 'qualified'>>();
  for (const p of memberParticipants) {
    statsMap.set(p.id, {
      participantId: p.id,
      participantName: p.name,
      clubOrTeam: p.clubOrTeam,
      played: 0,
      won: 0,
      lost: 0,
      gamesWon: 0,
      gamesLost: 0,
      pointsFor: 0,
      pointsAgainst: 0,
      pointDiff: 0,
    });
  }

  for (const m of finishedMatches) {
    const a = statsMap.get(m.participantAId!);
    const b = statsMap.get(m.participantBId!);
    if (!a || !b) continue;

    a.played += 1;
    b.played += 1;
    if (m.winnerId === a.participantId) {
      a.won += 1;
      b.lost += 1;
    } else if (m.winnerId === b.participantId) {
      b.won += 1;
      a.lost += 1;
    }

    for (const g of m.games) {
      if (g.scoreA === 0 && g.scoreB === 0 && !g.winnerSide) continue;
      a.pointsFor += g.scoreA;
      a.pointsAgainst += g.scoreB;
      b.pointsFor += g.scoreB;
      b.pointsAgainst += g.scoreA;
      if (g.winnerSide === 'A') {
        a.gamesWon += 1;
        b.gamesLost += 1;
      } else if (g.winnerSide === 'B') {
        b.gamesWon += 1;
        a.gamesLost += 1;
      }
    }
  }

  for (const row of statsMap.values()) {
    row.pointDiff = row.pointsFor - row.pointsAgainst;
  }

  // Multi-way tie-break helper (computes mini-league stats among tied IDs only)
  const computeMiniLeague = (tiedIds: Set<string>) => {
    const mini = new Map<string, { wins: number; gameDiff: number; pointDiff: number; pointsFor: number }>();
    for (const id of tiedIds) {
      mini.set(id, { wins: 0, gameDiff: 0, pointDiff: 0, pointsFor: 0 });
    }
    for (const m of finishedMatches) {
      if (!tiedIds.has(m.participantAId!) || !tiedIds.has(m.participantBId!)) continue;
      const sA = mini.get(m.participantAId!)!;
      const sB = mini.get(m.participantBId!)!;
      if (m.winnerId === m.participantAId) sA.wins += 1;
      if (m.winnerId === m.participantBId) sB.wins += 1;
      for (const g of m.games) {
        sA.pointsFor += g.scoreA;
        sA.pointDiff += g.scoreA - g.scoreB;
        sB.pointsFor += g.scoreB;
        sB.pointDiff += g.scoreB - g.scoreA;
        if (g.winnerSide === 'A') {
          sA.gameDiff += 1;
          sB.gameDiff -= 1;
        } else if (g.winnerSide === 'B') {
          sB.gameDiff += 1;
          sA.gameDiff -= 1;
        }
      }
    }
    return mini;
  };

  // Group by total wins first, then resolve ties using mini-league + configurable criteria
  const allRows = Array.from(statsMap.values());
  const byWins = new Map<number, typeof allRows>();
  for (const r of allRows) {
    const list = byWins.get(r.won) ?? [];
    list.push(r);
    byWins.set(r.won, list);
  }

  const sortedWinBuckets = Array.from(byWins.entries()).sort((a, b) => b[0] - a[0]);
  const ordered: Omit<StandingRow, 'rank' | 'qualified'>[] = [];
  const criteria = category.groupConfig.tieBreakOrder?.length
    ? category.groupConfig.tieBreakOrder
    : DEFAULT_TIE_BREAK_ORDER;

  for (const [, bucket] of sortedWinBuckets) {
    if (bucket.length === 1) {
      ordered.push(bucket[0]);
      continue;
    }
    const tiedIds = new Set(bucket.map((r) => r.participantId));
    const mini = computeMiniLeague(tiedIds);
    bucket.sort((a, b) => {
      for (const crit of criteria) {
        if (crit === 'wins') {
          if (b.won !== a.won) return b.won - a.won;
        } else if (crit === 'head_to_head') {
          const mA = mini.get(a.participantId)!;
          const mB = mini.get(b.participantId)!;
          if (mB.wins !== mA.wins) return mB.wins - mA.wins;
          if (mB.gameDiff !== mA.gameDiff) return mB.gameDiff - mA.gameDiff;
          if (mB.pointDiff !== mA.pointDiff) return mB.pointDiff - mA.pointDiff;
        } else if (crit === 'game_diff') {
          const diffB = b.gamesWon - b.gamesLost;
          const diffA = a.gamesWon - a.gamesLost;
          if (diffB !== diffA) return diffB - diffA;
        } else if (crit === 'point_diff') {
          if (b.pointDiff !== a.pointDiff) return b.pointDiff - a.pointDiff;
        } else if (crit === 'points_for') {
          if (b.pointsFor !== a.pointsFor) return b.pointsFor - a.pointsFor;
        }
      }
      return a.participantName.localeCompare(b.participantName);
    });
    ordered.push(...bucket);
  }

  // Apply manual overrides with audit metadata
  let finalRows: StandingRow[] = ordered.map((r, idx) => ({
    ...r,
    rank: idx + 1,
    qualified: idx < (category.groupConfig.advancePerGroup || 2),
  }));

  if (group.overrides && group.overrides.length > 0) {
    const overrideMap = new Map(group.overrides.map((o) => [o.participantId, o]));
    finalRows = finalRows.map((row) => {
      const ov = overrideMap.get(row.participantId);
      if (!ov) return row;
      return {
        ...row,
        rank: ov.manualRank,
        isOverridden: true,
        overrideReason: ov.reason,
      };
    });
    finalRows.sort((a, b) => a.rank - b.rank);
    finalRows = finalRows.map((row, idx) => ({
      ...row,
      rank: idx + 1,
      qualified: idx < (category.groupConfig.advancePerGroup || 2),
    }));
  }

  return { group, rows: finalRows };
}

export function syncPostMatchProgression(
  updatedMatch: Match,
  category: Category,
  groups: Group[],
  participants: Participant[],
  allMatches: Match[]
): Match[] {
  const matches = allMatches.map((m) => (m.id === updatedMatch.id ? updatedMatch : structuredClone(m)));

  // 1. Knockout direct advancement
  if (
    updatedMatch.stage === 'knockout' &&
    (updatedMatch.status === 'completed' || updatedMatch.status === 'walkover') &&
    updatedMatch.winnerId
  ) {
    if (updatedMatch.nextMatchId) {
      const nextMatch = matches.find((m) => m.id === updatedMatch.nextMatchId);
      if (nextMatch) {
        if (updatedMatch.nextSlot === 'A') nextMatch.participantAId = updatedMatch.winnerId;
        else nextMatch.participantBId = updatedMatch.winnerId;
        if (nextMatch.participantAId && nextMatch.participantBId && nextMatch.status === 'scheduled') {
          nextMatch.status = 'ready';
        }
        nextMatch.updatedAt = new Date().toISOString();
      }
    }

    if (updatedMatch.thirdPlaceMatchId && updatedMatch.participantAId && updatedMatch.participantBId) {
      const loserId =
        updatedMatch.winnerId === updatedMatch.participantAId
          ? updatedMatch.participantBId
          : updatedMatch.participantAId;
      const thirdMatch = matches.find((m) => m.id === updatedMatch.thirdPlaceMatchId);
      if (thirdMatch) {
        if (!thirdMatch.participantAId || thirdMatch.placeholderA?.includes('1')) {
          if (!thirdMatch.participantAId) thirdMatch.participantAId = loserId;
          else if (thirdMatch.participantAId !== loserId && !thirdMatch.participantBId) {
            thirdMatch.participantBId = loserId;
          }
        } else if (!thirdMatch.participantBId) {
          thirdMatch.participantBId = loserId;
        }
        if (thirdMatch.participantAId && thirdMatch.participantBId && thirdMatch.status === 'scheduled') {
          thirdMatch.status = 'ready';
        }
        thirdMatch.updatedAt = new Date().toISOString();
      }
    }
  }

  // 2. Group -> Knockout auto-population when group finishes
  if (updatedMatch.stage === 'group' && category.format === 'group_knockout') {
    const catGroups = groups.filter((g) => g.categoryId === category.id);
    const catGroupMatches = matches.filter((m) => m.categoryId === category.id && m.stage === 'group');
    const koRound1 = matches.filter(
      (m) => m.categoryId === category.id && m.stage === 'knockout' && m.roundNumber === 1
    );

    const placeholderLookup = new Map<string, string>();
    for (const grp of catGroups) {
      const grpMatches = catGroupMatches.filter((m) => m.groupId === grp.id);
      const isGroupFinished =
        grpMatches.length > 0 &&
        grpMatches.every((m) => m.status === 'completed' || m.status === 'walkover' || m.status === 'cancelled');

      if (isGroupFinished) {
        const standing = calculateGroupStandings(category, grp, participants, grpMatches);
        standing.rows.forEach((row, idx) => {
          const rank = idx + 1;
          if (rank === 1) placeholderLookup.set(`Juara ${grp.name}`, row.participantId);
          if (rank === 2) placeholderLookup.set(`Runner-up ${grp.name}`, row.participantId);
          placeholderLookup.set(`Peringkat ${rank} ${grp.name}`, row.participantId);
        });
      }
    }

    for (const koMatch of koRound1) {
      if (koMatch.placeholderA && placeholderLookup.has(koMatch.placeholderA) && !koMatch.participantAId) {
        koMatch.participantAId = placeholderLookup.get(koMatch.placeholderA)!;
      }
      if (koMatch.placeholderB && placeholderLookup.has(koMatch.placeholderB) && !koMatch.participantBId) {
        koMatch.participantBId = placeholderLookup.get(koMatch.placeholderB)!;
      }
      if (koMatch.participantAId && koMatch.participantBId && koMatch.status === 'scheduled') {
        koMatch.status = 'ready';
      }
    }
  }

  return matches;
}

export function autoScheduleTournamentMatches(
  matches: Match[],
  courts: string[],
  startTime = '09:00',
  intervalMinutes = 30
): Match[] {
  const safeCourts = courts.length > 0 ? courts : ['Lapangan 1'];
  const [startH, startM] = startTime.split(':').map((v) => parseInt(v, 10) || 0);
  const baseMinutes = startH * 60 + startM;

  // Sort active non-bye matches by stage (group first), roundNumber, matchOrder
  const sorted = [...matches].sort((a, b) => {
    if (a.stage !== b.stage) return a.stage === 'group' ? -1 : 1;
    if (a.roundNumber !== b.roundNumber) return a.roundNumber - b.roundNumber;
    return a.matchOrder - b.matchOrder;
  });

  const courtSlotCount = new Map<number, number>();
  for (let i = 0; i < safeCourts.length; i += 1) courtSlotCount.set(i, 0);

  let idx = 0;
  const scheduledMap = new Map<string, { court: string; scheduledTime: string }>();

  for (const m of sorted) {
    if (m.isBye) continue;
    const courtIdx = idx % safeCourts.length;
    const slot = courtSlotCount.get(courtIdx) ?? 0;
    courtSlotCount.set(courtIdx, slot + 1);
    const totalMins = baseMinutes + slot * intervalMinutes;
    const hh = String(Math.floor(totalMins / 60) % 24).padStart(2, '0');
    const mm = String(totalMins % 60).padStart(2, '0');
    scheduledMap.set(m.id, {
      court: safeCourts[courtIdx],
      scheduledTime: `${hh}:${mm}`,
    });
    idx += 1;
  }

  return matches.map((m) => {
    const assigned = scheduledMap.get(m.id);
    if (!assigned) return m;
    return {
      ...m,
      court: assigned.court,
      scheduledTime: assigned.scheduledTime,
    };
  });
}

export function checkDownstreamImpact(match: Match, allMatches: Match[]): Match[] {
  const impacted: Match[] = [];
  let curr: Match | undefined = match;
  while (curr?.nextMatchId) {
    const next = allMatches.find((m) => m.id === curr!.nextMatchId);
    if (!next) break;
    if (next.status === 'live' || next.status === 'paused' || next.status === 'completed' || next.status === 'walkover') {
      impacted.push(next);
    }
    curr = next;
  }
  return impacted;
}
