export type TournamentStatus = 'draft' | 'published' | 'ongoing' | 'completed';

export type CategoryType =
  | 'mens_singles'
  | 'womens_singles'
  | 'mens_doubles'
  | 'womens_doubles'
  | 'mixed_doubles';

export type CompetitionFormat = 'group' | 'knockout' | 'group_knockout';

export type ScoringSystemMode = 'rally' | 'classic';

export type ScoringPreset = 'standard' | 'classic' | 'mini' | 'fun' | 'custom';

export interface ScoringRule {
  preset: ScoringPreset;
  scoringSystem?: ScoringSystemMode;
  serviceChances?: number;
  pointsPerGame: number;
  maxPoints: number;
  minimumLead: number;
  bestOf: number;
  intervalPoints: number;
  changeEndsOnInterval: boolean;
}

export type TieBreakCriterion =
  | 'wins'
  | 'head_to_head'
  | 'game_diff'
  | 'point_diff'
  | 'points_for';

export interface GroupConfig {
  groupCount: number;
  advancePerGroup: number;
  drawMode: 'random' | 'manual';
  tieBreakOrder: TieBreakCriterion[];
}

export interface KnockoutConfig {
  drawMode: 'random' | 'seeded';
  thirdPlaceMatch: boolean;
}

export interface StandingOverride {
  participantId: string;
  manualRank: number;
  reason: string;
  updatedAt: string;
}

export interface Tournament {
  id: string;
  slug: string;
  name: string;
  location: string;
  startDate: string;
  endDate: string;
  status: TournamentStatus;
  courts: string[];
  refereePin: string;
  defaultScoringRule: ScoringRule;
  createdAt: string;
  updatedAt: string;
}

export interface Category {
  id: string;
  tournamentId: string;
  name: string;
  type: CategoryType;
  format: CompetitionFormat;
  groupConfig: GroupConfig;
  knockoutConfig: KnockoutConfig;
  scoringRule: ScoringRule;
  createdAt: string;
}

export interface Participant {
  id: string;
  tournamentId: string;
  categoryId: string;
  name: string;
  clubOrTeam: string;
  seed?: number;
  groupId?: string;
}

export interface Group {
  id: string;
  tournamentId: string;
  categoryId: string;
  name: string;
  participantIds: string[];
  overrides: StandingOverride[];
}

export type MatchStatus =
  | 'draft'
  | 'scheduled'
  | 'ready'
  | 'live'
  | 'paused'
  | 'completed'
  | 'walkover'
  | 'cancelled';

export interface GameScore {
  gameNumber: number;
  scoreA: number;
  scoreB: number;
  winnerSide?: 'A' | 'B';
}

export type ScoreActionType =
  | 'start'
  | 'point_a'
  | 'point_b'
  | 'service_fault'
  | 'side_out'
  | 'undo'
  | 'pause'
  | 'resume'
  | 'swap_ends'
  | 'toggle_serve'
  | 'confirm'
  | 'walkover'
  | 'update_note'
  | 'admin_override';

export interface ScoreEvent {
  id: string;
  clientEventId?: string;
  matchId: string;
  timestamp: string;
  actor: 'referee' | 'admin';
  action: ScoreActionType;
  gameNumber: number;
  oldScoreA: number;
  oldScoreB: number;
  newScoreA: number;
  newScoreB: number;
  oldServingSide?: 'A' | 'B';
  oldServiceHand?: 1 | 2;
  newServingSide?: 'A' | 'B';
  newServiceHand?: 1 | 2;
  note?: string;
}

export interface Match {
  id: string;
  tournamentId: string;
  categoryId: string;
  stage: 'group' | 'knockout';
  groupId?: string;
  roundNumber: number;
  roundLabel: string;
  matchOrder: number;
  court: string;
  scheduledTime: string;
  participantAId: string | null;
  participantBId: string | null;
  placeholderA?: string;
  placeholderB?: string;
  isBye?: boolean;
  isThirdPlace?: boolean;
  nextMatchId?: string;
  nextSlot?: 'A' | 'B';
  thirdPlaceMatchId?: string;
  status: MatchStatus;
  scoringRuleSnapshot: ScoringRule;
  games: GameScore[];
  currentGame: number;
  servingSide: 'A' | 'B';
  serviceHand?: 1 | 2;
  endsSwapped: boolean;
  awaitingConfirmation?: boolean;
  pendingWinnerId?: string | null;
  winnerId: string | null;
  notes: string;
  scoreEvents: ScoreEvent[];
  updatedAt: string;
}

export interface StandingRow {
  participantId: string;
  participantName: string;
  clubOrTeam: string;
  played: number;
  won: number;
  lost: number;
  gamesWon: number;
  gamesLost: number;
  pointsFor: number;
  pointsAgainst: number;
  pointDiff: number;
  rank: number;
  qualified: boolean;
  isOverridden?: boolean;
  overrideReason?: string;
}

export interface GroupStandingBundle {
  group: Group;
  rows: StandingRow[];
}

export interface TournamentBundle {
  tournament: Tournament;
  categories: Category[];
  participants: Participant[];
  groups: Group[];
  matches: Match[];
  standings: Record<string, GroupStandingBundle[]>;
}

export interface TournamentSummary {
  id: string;
  slug: string;
  name: string;
  location: string;
  startDate: string;
  endDate: string;
  status: TournamentStatus;
  courts: string[];
  participantCount: number;
  matchCount: number;
  liveMatchCount: number;
  completedMatchCount: number;
}

export interface AppDatabase {
  tournaments: Tournament[];
  categories: Category[];
  participants: Participant[];
  groups: Group[];
  matches: Match[];
}
