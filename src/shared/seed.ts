import type {
  AppDatabase,
  Category,
  GroupStandingBundle,
  Match,
  Participant,
  Tournament,
  TournamentBundle,
  TournamentSummary,
} from './types.ts';
import {
  autoScheduleTournamentMatches,
  calculateGroupStandings,
  createId,
  generateCategoryFixtures,
  getScoringRuleForPreset,
  syncPostMatchProgression,
} from './engine.ts';

export function createSeedDatabase(): AppDatabase {
  const now = new Date().toISOString();
  const tourneyId = 'trn_smashpoint2026';

  const tournament: Tournament = {
    id: tourneyId,
    slug: 'smashpoint-open-2026',
    name: 'SmashPoint Open Championship 2026',
    location: 'GOR Senayan Arena, Jakarta',
    startDate: '2026-11-13',
    endDate: '2026-11-15',
    status: 'ongoing',
    courts: ['Lapangan 1', 'Lapangan 2', 'Lapangan 3'],
    refereePin: '202611',
    defaultScoringRule: getScoringRuleForPreset('standard'),
    createdAt: now,
    updatedAt: now,
  };

  const catMS: Category = {
    id: 'cat_ms_open',
    tournamentId: tourneyId,
    name: 'Tunggal Putra (Open)',
    type: 'mens_singles',
    format: 'group_knockout',
    groupConfig: {
      groupCount: 2,
      advancePerGroup: 2,
      drawMode: 'manual',
      tieBreakOrder: ['wins', 'head_to_head', 'game_diff', 'point_diff', 'points_for'],
    },
    knockoutConfig: {
      drawMode: 'seeded',
      thirdPlaceMatch: true,
    },
    scoringRule: getScoringRuleForPreset('standard'),
    createdAt: now,
  };

  const catXD: Category = {
    id: 'cat_xd_open',
    tournamentId: tourneyId,
    name: 'Ganda Campuran (Open)',
    type: 'mixed_doubles',
    format: 'knockout',
    groupConfig: {
      groupCount: 2,
      advancePerGroup: 2,
      drawMode: 'random',
      tieBreakOrder: ['wins', 'head_to_head', 'game_diff', 'point_diff', 'points_for'],
    },
    knockoutConfig: {
      drawMode: 'seeded',
      thirdPlaceMatch: true,
    },
    scoringRule: getScoringRuleForPreset('standard'),
    createdAt: now,
  };

  const msParticipants: Participant[] = [
    { id: 'p_ms_1', tournamentId: tourneyId, categoryId: catMS.id, name: 'Rizky Pratama', clubOrTeam: 'PB Jaya Raya', seed: 1 },
    { id: 'p_ms_2', tournamentId: tourneyId, categoryId: catMS.id, name: 'Bagas Wijaya', clubOrTeam: 'PB Djarum', seed: 2 },
    { id: 'p_ms_3', tournamentId: tourneyId, categoryId: catMS.id, name: 'Farhan Hidayat', clubOrTeam: 'PB Exist', seed: 3 },
    { id: 'p_ms_4', tournamentId: tourneyId, categoryId: catMS.id, name: 'Dimas Kusuma', clubOrTeam: 'PB Tangkas', seed: 4 },
    { id: 'p_ms_5', tournamentId: tourneyId, categoryId: catMS.id, name: 'Aditya Nugroho', clubOrTeam: 'PB Mutiara' },
    { id: 'p_ms_6', tournamentId: tourneyId, categoryId: catMS.id, name: 'Kevin Gunawan', clubOrTeam: 'PB Mansion' },
    { id: 'p_ms_7', tournamentId: tourneyId, categoryId: catMS.id, name: 'Ilham Ramadhan', clubOrTeam: 'PB Victory' },
    { id: 'p_ms_8', tournamentId: tourneyId, categoryId: catMS.id, name: 'Taufik Santoso', clubOrTeam: 'PB Candra Wijaya' },
  ];

  const xdParticipants: Participant[] = [
    { id: 'p_xd_1', tournamentId: tourneyId, categoryId: catXD.id, name: 'Rendra / Nadia', clubOrTeam: 'PB Jaya Raya', seed: 1 },
    { id: 'p_xd_2', tournamentId: tourneyId, categoryId: catXD.id, name: 'Fajar / Sinta', clubOrTeam: 'PB Djarum', seed: 2 },
    { id: 'p_xd_3', tournamentId: tourneyId, categoryId: catXD.id, name: 'Alvin / Melati', clubOrTeam: 'PB Exist', seed: 3 },
    { id: 'p_xd_4', tournamentId: tourneyId, categoryId: catXD.id, name: 'Yoga / Putri', clubOrTeam: 'PB Tangkas', seed: 4 },
    { id: 'p_xd_5', tournamentId: tourneyId, categoryId: catXD.id, name: 'Hendra / Clara', clubOrTeam: 'PB Mutiara' },
    { id: 'p_xd_6', tournamentId: tourneyId, categoryId: catXD.id, name: 'Bima / Ayu', clubOrTeam: 'PB Victory' },
    { id: 'p_xd_7', tournamentId: tourneyId, categoryId: catXD.id, name: 'Galih / Dewi', clubOrTeam: 'PB Mansion' },
    { id: 'p_xd_8', tournamentId: tourneyId, categoryId: catXD.id, name: 'Naufal / Tari', clubOrTeam: 'PB Candra Wijaya' },
  ];

  const msFixtures = generateCategoryFixtures(catMS, msParticipants, tournament.courts);
  const xdFixtures = generateCategoryFixtures(catXD, xdParticipants, tournament.courts);

  let allMatches: Match[] = autoScheduleTournamentMatches(
    [...msFixtures.matches, ...xdFixtures.matches],
    tournament.courts,
    '09:00',
    35
  );

  const msGroupMatches = allMatches.filter((m) => m.categoryId === catMS.id && m.stage === 'group');
  if (msGroupMatches.length >= 6) {
    msGroupMatches[0].status = 'completed';
    msGroupMatches[0].games = [
      { gameNumber: 1, scoreA: 21, scoreB: 14, winnerSide: 'A' },
      { gameNumber: 2, scoreA: 21, scoreB: 16, winnerSide: 'A' },
    ];
    msGroupMatches[0].currentGame = 2;
    msGroupMatches[0].winnerId = msGroupMatches[0].participantAId;
    msGroupMatches[0].court = 'Lapangan 1';

    msGroupMatches[1].status = 'completed';
    msGroupMatches[1].games = [
      { gameNumber: 1, scoreA: 18, scoreB: 21, winnerSide: 'B' },
      { gameNumber: 2, scoreA: 21, scoreB: 15, winnerSide: 'A' },
      { gameNumber: 3, scoreA: 21, scoreB: 17, winnerSide: 'A' },
    ];
    msGroupMatches[1].currentGame = 3;
    msGroupMatches[1].winnerId = msGroupMatches[1].participantAId;
    msGroupMatches[1].court = 'Lapangan 2';

    msGroupMatches[2].status = 'completed';
    msGroupMatches[2].games = [
      { gameNumber: 1, scoreA: 15, scoreB: 21, winnerSide: 'B' },
      { gameNumber: 2, scoreA: 19, scoreB: 21, winnerSide: 'B' },
    ];
    msGroupMatches[2].currentGame = 2;
    msGroupMatches[2].winnerId = msGroupMatches[2].participantBId;
    msGroupMatches[2].court = 'Lapangan 3';

    msGroupMatches[3].status = 'live';
    msGroupMatches[3].court = 'Lapangan 1';
    msGroupMatches[3].games = [
      { gameNumber: 1, scoreA: 21, scoreB: 17, winnerSide: 'A' },
      { gameNumber: 2, scoreA: 18, scoreB: 16 },
    ];
    msGroupMatches[3].currentGame = 2;
    msGroupMatches[3].servingSide = 'A';
    msGroupMatches[3].scoreEvents = [
      {
        id: createId('evt'),
        matchId: msGroupMatches[3].id,
        timestamp: now,
        actor: 'referee',
        action: 'point_a',
        gameNumber: 2,
        oldScoreA: 17,
        oldScoreB: 16,
        newScoreA: 18,
        newScoreB: 16,
      },
    ];
  }

  const xdQfMatches = allMatches.filter(
    (m) => m.categoryId === catXD.id && m.stage === 'knockout' && m.roundNumber === 1
  );
  if (xdQfMatches.length >= 4) {
    xdQfMatches[0].status = 'completed';
    xdQfMatches[0].games = [
      { gameNumber: 1, scoreA: 21, scoreB: 12, winnerSide: 'A' },
      { gameNumber: 2, scoreA: 21, scoreB: 15, winnerSide: 'A' },
    ];
    xdQfMatches[0].currentGame = 2;
    xdQfMatches[0].winnerId = xdQfMatches[0].participantAId;
    allMatches = syncPostMatchProgression(xdQfMatches[0], catXD, [], xdParticipants, allMatches);

    const qf2 = allMatches.find((m) => m.id === xdQfMatches[1].id)!;
    qf2.status = 'live';
    qf2.court = 'Lapangan 2';
    qf2.games = [{ gameNumber: 1, scoreA: 20, scoreB: 20 }];
    qf2.currentGame = 1;
    qf2.servingSide = 'B';
    qf2.scoreEvents = [
      {
        id: createId('evt'),
        matchId: qf2.id,
        timestamp: now,
        actor: 'referee',
        action: 'point_b',
        gameNumber: 1,
        oldScoreA: 20,
        oldScoreB: 19,
        newScoreA: 20,
        newScoreB: 20,
      },
    ];

    const qf3 = allMatches.find((m) => m.id === xdQfMatches[2].id)!;
    qf3.status = 'ready';
    qf3.court = 'Lapangan 3';
  }

  return {
    tournaments: [tournament],
    categories: [catMS, catXD],
    participants: [...msParticipants, ...xdParticipants],
    groups: [...msFixtures.groups, ...xdFixtures.groups],
    matches: allMatches,
  };
}

export function getTournamentSummaries(db: AppDatabase): TournamentSummary[] {
  return db.tournaments.map((t) => {
    const participants = db.participants.filter((p) => p.tournamentId === t.id);
    const matches = db.matches.filter((m) => m.tournamentId === t.id && !m.isBye);
    return {
      id: t.id,
      slug: t.slug,
      name: t.name,
      location: t.location,
      startDate: t.startDate,
      endDate: t.endDate,
      status: t.status,
      courts: t.courts,
      participantCount: participants.length,
      matchCount: matches.length,
      liveMatchCount: matches.filter((m) => m.status === 'live').length,
      completedMatchCount: matches.filter((m) => m.status === 'completed' || m.status === 'walkover').length,
    };
  });
}

export function buildTournamentBundle(
  db: AppDatabase,
  tournamentIdOrSlug: string,
  includePin = true
): TournamentBundle | null {
  const tournament = db.tournaments.find(
    (t) => t.id === tournamentIdOrSlug || t.slug === tournamentIdOrSlug
  );
  if (!tournament) return null;

  const categories = db.categories.filter((c) => c.tournamentId === tournament.id);
  const participants = db.participants.filter((p) => p.tournamentId === tournament.id);
  const groups = db.groups.filter((g) => g.tournamentId === tournament.id);
  const matches = db.matches.filter((m) => m.tournamentId === tournament.id);

  const standings: Record<string, GroupStandingBundle[]> = {};
  for (const cat of categories) {
    const catGroups = groups.filter((g) => g.categoryId === cat.id);
    const catMatches = matches.filter((m) => m.categoryId === cat.id && m.stage === 'group');
    standings[cat.id] = catGroups.map((g) =>
      calculateGroupStandings(cat, g, participants, catMatches)
    );
  }

  return {
    tournament: includePin ? tournament : { ...tournament, refereePin: '' },
    categories,
    participants,
    groups,
    matches,
    standings,
  };
}
