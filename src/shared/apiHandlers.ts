import type {
  AppDatabase,
  Category,
  CategoryType,
  CompetitionFormat,
  GroupConfig,
  KnockoutConfig,
  Match,
  Participant,
  ScoringRule,
  Tournament,
} from './types.ts';
import {
  applyMatchScoreAction,
  autoScheduleTournamentMatches,
  CATEGORY_LABELS,
  checkDownstreamImpact,
  createId,
  createSlug,
  DEFAULT_TIE_BREAK_ORDER,
  generateCategoryFixtures,
  generatePin,
  getScoringRuleForPreset,
  syncPostMatchProgression,
} from './engine.ts';
import { buildTournamentBundle, getTournamentSummaries } from './seed.ts';

export interface SmashPointStoreAdapter {
  load: () => AppDatabase;
  save: (db: AppDatabase) => void;
  broadcast?: (tournamentId: string, eventType?: string, matchId?: string) => void;
}

export interface ApiDispatchResult {
  status: number;
  data: unknown;
}

export function dispatchSmashPointApi(
  method: string,
  rawPath: string,
  rawBody: unknown,
  rawHeaders: Record<string, string | string[] | undefined>,
  store: SmashPointStoreAdapter
): ApiDispatchResult {
  const upperMethod = method.toUpperCase();
  const pathname = rawPath.split('?')[0];
  const body = (rawBody && typeof rawBody === 'object' ? rawBody : {}) as Record<string, unknown>;

  const getHeader = (key: string): string | undefined => {
    const lower = key.toLowerCase();
    for (const [k, v] of Object.entries(rawHeaders)) {
      if (k.toLowerCase() === lower) {
        return Array.isArray(v) ? v[0] : v;
      }
    }
    return undefined;
  };

  // Health check
  if (upperMethod === 'GET' && pathname === '/api/health') {
    return { status: 200, data: { ok: true, service: 'SmashPoint' } };
  }

  // List tournaments
  if (upperMethod === 'GET' && pathname === '/api/tournaments') {
    const db = store.load();
    return { status: 200, data: { tournaments: getTournamentSummaries(db) } };
  }

  // Get full tournament bundle (Organizer workspace)
  const matchGetTourney = pathname.match(/^\/api\/tournaments\/([^/]+)$/);
  if (upperMethod === 'GET' && matchGetTourney) {
    const id = decodeURIComponent(matchGetTourney[1]);
    const db = store.load();
    const bundle = buildTournamentBundle(db, id, true);
    if (!bundle) return { status: 404, data: { error: 'Turnamen tidak ditemukan.' } };
    return { status: 200, data: bundle };
  }

  // Get public read-only tournament bundle
  const matchGetPublic = pathname.match(/^\/api\/public\/([^/]+)$/);
  if (upperMethod === 'GET' && matchGetPublic) {
    const slugOrId = decodeURIComponent(matchGetPublic[1]);
    const db = store.load();
    const bundle = buildTournamentBundle(db, slugOrId, false);
    if (!bundle) {
      return { status: 404, data: { error: 'Halaman turnamen publik tidak ditemukan.' } };
    }
    return { status: 200, data: bundle };
  }

  // Verify Referee PIN
  if (upperMethod === 'POST' && pathname === '/api/referee/verify-pin') {
    const { pin, tournamentId } = body as { pin?: string; tournamentId?: string };
    const cleanPin = (pin ?? '').trim();
    if (!cleanPin) {
      return { status: 400, data: { error: 'Masukkan PIN Wasit 6-digit.' } };
    }
    const db = store.load();
    const found = db.tournaments.find((t) =>
      tournamentId ? t.id === tournamentId && t.refereePin === cleanPin : t.refereePin === cleanPin
    );
    if (!found) {
      return {
        status: 401,
        data: { error: 'PIN Wasit tidak cocok. Periksa kembali kode dari panitia.' },
      };
    }
    const bundle = buildTournamentBundle(db, found.id, false);
    return { status: 200, data: { verified: true, bundle } };
  }

  // Create tournament
  if (upperMethod === 'POST' && pathname === '/api/tournaments') {
    const payload = body as {
      name?: string;
      location?: string;
      startDate?: string;
      endDate?: string;
      courts?: string[];
      status?: Tournament['status'];
      defaultScoringRule?: ScoringRule;
      categories?: Array<{
        name?: string;
        type: CategoryType;
        format: CompetitionFormat;
        groupConfig?: GroupConfig;
        knockoutConfig?: KnockoutConfig;
        scoringRule?: ScoringRule;
        participants?: Array<{ name: string; clubOrTeam?: string; seed?: number }>;
      }>;
      autoGenerate?: boolean;
      autoSchedule?: boolean;
      startTime?: string;
    };

    if (!payload.name?.trim()) {
      return { status: 400, data: { error: 'Nama turnamen wajib diisi.' } };
    }

    const db = store.load();
    const now = new Date().toISOString();
    const tourneyId = createId('trn');
    const courts =
      Array.isArray(payload.courts) && payload.courts.filter((c) => c.trim()).length > 0
        ? payload.courts.map((c) => c.trim()).filter(Boolean)
        : ['Lapangan 1', 'Lapangan 2'];

    const tournament: Tournament = {
      id: tourneyId,
      slug: createSlug(payload.name),
      name: payload.name.trim(),
      location: (payload.location ?? '').trim() || 'GOR Utama',
      startDate: payload.startDate || now.slice(0, 10),
      endDate: payload.endDate || payload.startDate || now.slice(0, 10),
      status: payload.status ?? 'published',
      courts,
      refereePin: generatePin(),
      defaultScoringRule: payload.defaultScoringRule ?? getScoringRuleForPreset('standard'),
      createdAt: now,
      updatedAt: now,
    };

    db.tournaments.unshift(tournament);

    let createdMatches: Match[] = [];
    if (Array.isArray(payload.categories)) {
      for (const catInput of payload.categories) {
        const catId = createId('cat');
        const category: Category = {
          id: catId,
          tournamentId: tourneyId,
          name: (catInput.name ?? '').trim() || CATEGORY_LABELS[catInput.type] || 'Kategori Baru',
          type: catInput.type ?? 'mens_singles',
          format: catInput.format ?? 'knockout',
          groupConfig: catInput.groupConfig ?? {
            groupCount: 2,
            advancePerGroup: 2,
            drawMode: 'random',
            tieBreakOrder: DEFAULT_TIE_BREAK_ORDER,
          },
          knockoutConfig: catInput.knockoutConfig ?? {
            drawMode: 'random',
            thirdPlaceMatch: true,
          },
          scoringRule: catInput.scoringRule ?? tournament.defaultScoringRule,
          createdAt: now,
        };
        db.categories.push(category);

        const catParticipants: Participant[] = [];
        if (Array.isArray(catInput.participants)) {
          catInput.participants.forEach((pInput, idx) => {
            if (!pInput.name?.trim()) return;
            const p: Participant = {
              id: createId('p'),
              tournamentId: tourneyId,
              categoryId: catId,
              name: pInput.name.trim(),
              clubOrTeam: (pInput.clubOrTeam ?? '').trim() || 'Mandiri',
              seed: pInput.seed ?? (idx < 4 ? idx + 1 : undefined),
            };
            catParticipants.push(p);
            db.participants.push(p);
          });
        }

        if (payload.autoGenerate !== false && catParticipants.length >= 2) {
          const fixtures = generateCategoryFixtures(category, catParticipants, tournament.courts);
          for (const g of fixtures.groups) {
            db.groups.push(g);
            for (const pid of g.participantIds) {
              const foundP = db.participants.find((p) => p.id === pid);
              if (foundP) foundP.groupId = g.id;
            }
          }
          createdMatches.push(...fixtures.matches);
        }
      }
    }

    if (createdMatches.length > 0 && payload.autoSchedule !== false) {
      createdMatches = autoScheduleTournamentMatches(
        createdMatches,
        tournament.courts,
        payload.startTime || '09:00',
        30
      );
    }
    db.matches.push(...createdMatches);

    store.save(db);
    store.broadcast?.(tournament.id, 'tournament:created');
    return { status: 201, data: buildTournamentBundle(db, tournament.id, true) };
  }

  // Update tournament metadata / PIN / courts / scoring
  if (upperMethod === 'PATCH' && matchGetTourney) {
    const id = decodeURIComponent(matchGetTourney[1]);
    const db = store.load();
    const tournament = db.tournaments.find((t) => t.id === id);
    if (!tournament) return { status: 404, data: { error: 'Turnamen tidak ditemukan.' } };

    const payload = body as Partial<Tournament> & {
      regeneratePin?: boolean;
      applyToPendingMatches?: boolean;
    };
    if (payload.name !== undefined && payload.name.trim()) tournament.name = payload.name.trim();
    if (payload.location !== undefined) tournament.location = payload.location.trim();
    if (payload.startDate !== undefined) tournament.startDate = payload.startDate;
    if (payload.endDate !== undefined) tournament.endDate = payload.endDate;
    if (payload.status !== undefined) tournament.status = payload.status;
    if (Array.isArray(payload.courts) && payload.courts.length > 0) {
      tournament.courts = payload.courts.map((c) => c.trim()).filter(Boolean);
    }
    if (payload.defaultScoringRule) {
      tournament.defaultScoringRule = payload.defaultScoringRule;
      if (payload.applyToPendingMatches) {
        for (const cat of db.categories) {
          if (cat.tournamentId === tournament.id) {
            cat.scoringRule = structuredClone(payload.defaultScoringRule);
          }
        }
        for (const m of db.matches) {
          if (
            m.tournamentId === tournament.id &&
            (m.status === 'draft' || m.status === 'scheduled' || m.status === 'ready') &&
            m.scoreEvents.length === 0
          ) {
            m.scoringRuleSnapshot = structuredClone(payload.defaultScoringRule);
          }
        }
      }
    }
    if (payload.regeneratePin) tournament.refereePin = generatePin();
    tournament.updatedAt = new Date().toISOString();

    store.save(db);
    store.broadcast?.(tournament.id);
    return { status: 200, data: buildTournamentBundle(db, tournament.id, true) };
  }

  // Delete tournament
  if (upperMethod === 'DELETE' && matchGetTourney) {
    const id = decodeURIComponent(matchGetTourney[1]);
    const db = store.load();
    const idx = db.tournaments.findIndex((t) => t.id === id);
    if (idx === -1) return { status: 404, data: { error: 'Turnamen tidak ditemukan.' } };
    db.tournaments.splice(idx, 1);
    db.categories = db.categories.filter((c) => c.tournamentId !== id);
    db.participants = db.participants.filter((p) => p.tournamentId !== id);
    db.groups = db.groups.filter((g) => g.tournamentId !== id);
    db.matches = db.matches.filter((m) => m.tournamentId !== id);
    store.save(db);
    return { status: 200, data: { deleted: true, id } };
  }

  // Add category
  const matchPostCat = pathname.match(/^\/api\/tournaments\/([^/]+)\/categories$/);
  if (upperMethod === 'POST' && matchPostCat) {
    const id = decodeURIComponent(matchPostCat[1]);
    const db = store.load();
    const tournament = db.tournaments.find((t) => t.id === id);
    if (!tournament) return { status: 404, data: { error: 'Turnamen tidak ditemukan.' } };

    const payload = body as Partial<Category>;
    const type = payload.type ?? 'mens_singles';
    const category: Category = {
      id: createId('cat'),
      tournamentId: tournament.id,
      name: (payload.name ?? '').trim() || CATEGORY_LABELS[type] || 'Kategori Baru',
      type,
      format: payload.format ?? 'knockout',
      groupConfig: payload.groupConfig ?? {
        groupCount: 2,
        advancePerGroup: 2,
        drawMode: 'random',
        tieBreakOrder: DEFAULT_TIE_BREAK_ORDER,
      },
      knockoutConfig: payload.knockoutConfig ?? {
        drawMode: 'random',
        thirdPlaceMatch: true,
      },
      scoringRule: payload.scoringRule ?? tournament.defaultScoringRule,
      createdAt: new Date().toISOString(),
    };
    db.categories.push(category);
    store.save(db);
    store.broadcast?.(tournament.id);
    return { status: 201, data: buildTournamentBundle(db, tournament.id, true) };
  }

  // Update / delete category
  const matchCatId = pathname.match(/^\/api\/categories\/([^/]+)$/);
  if (upperMethod === 'PATCH' && matchCatId) {
    const catId = decodeURIComponent(matchCatId[1]);
    const db = store.load();
    const cat = db.categories.find((c) => c.id === catId);
    if (!cat) return { status: 404, data: { error: 'Kategori tidak ditemukan.' } };

    const payload = body as Partial<Category> & { applyToPendingMatches?: boolean };
    if (payload.name !== undefined && payload.name.trim()) cat.name = payload.name.trim();
    if (payload.type !== undefined) cat.type = payload.type;
    if (payload.format !== undefined) cat.format = payload.format;
    if (payload.groupConfig) cat.groupConfig = payload.groupConfig;
    if (payload.knockoutConfig) cat.knockoutConfig = payload.knockoutConfig;
    if (payload.scoringRule) {
      cat.scoringRule = payload.scoringRule;
      if (payload.applyToPendingMatches) {
        for (const m of db.matches) {
          if (
            m.categoryId === cat.id &&
            (m.status === 'draft' || m.status === 'scheduled' || m.status === 'ready') &&
            m.scoreEvents.length === 0
          ) {
            m.scoringRuleSnapshot = structuredClone(payload.scoringRule);
          }
        }
      }
    }
    store.save(db);
    store.broadcast?.(cat.tournamentId);
    return { status: 200, data: buildTournamentBundle(db, cat.tournamentId, true) };
  }

  if (upperMethod === 'DELETE' && matchCatId) {
    const catId = decodeURIComponent(matchCatId[1]);
    const db = store.load();
    const cat = db.categories.find((c) => c.id === catId);
    if (!cat) return { status: 404, data: { error: 'Kategori tidak ditemukan.' } };
    const tournamentId = cat.tournamentId;
    db.categories = db.categories.filter((c) => c.id !== cat.id);
    db.participants = db.participants.filter((p) => p.categoryId !== cat.id);
    db.groups = db.groups.filter((g) => g.categoryId !== cat.id);
    db.matches = db.matches.filter((m) => m.categoryId !== cat.id);
    store.save(db);
    store.broadcast?.(tournamentId);
    return { status: 200, data: buildTournamentBundle(db, tournamentId, true) };
  }

  // Add participants
  const matchPostParticipants = pathname.match(/^\/api\/tournaments\/([^/]+)\/participants$/);
  if (upperMethod === 'POST' && matchPostParticipants) {
    const id = decodeURIComponent(matchPostParticipants[1]);
    const db = store.load();
    const tournament = db.tournaments.find((t) => t.id === id);
    if (!tournament) return { status: 404, data: { error: 'Turnamen tidak ditemukan.' } };

    const payload = body as {
      categoryId: string;
      participants?: Array<{ name: string; clubOrTeam?: string; seed?: number; groupId?: string }>;
      name?: string;
      clubOrTeam?: string;
      seed?: number;
      groupId?: string;
    };

    const items = Array.isArray(payload.participants)
      ? payload.participants
      : payload.name
      ? [{ name: payload.name, clubOrTeam: payload.clubOrTeam, seed: payload.seed, groupId: payload.groupId }]
      : [];

    if (items.length === 0) {
      return { status: 400, data: { error: 'Minimal satu nama peserta harus diisi.' } };
    }

    for (const item of items) {
      if (!item.name?.trim()) continue;
      db.participants.push({
        id: createId('p'),
        tournamentId: tournament.id,
        categoryId: payload.categoryId,
        name: item.name.trim(),
        clubOrTeam: (item.clubOrTeam ?? '').trim() || 'Mandiri',
        seed: item.seed,
        groupId: item.groupId,
      });
    }

    store.save(db);
    store.broadcast?.(tournament.id);
    return { status: 201, data: buildTournamentBundle(db, tournament.id, true) };
  }

  // Update / delete participant
  const matchParticipantId = pathname.match(/^\/api\/participants\/([^/]+)$/);
  if (upperMethod === 'PATCH' && matchParticipantId) {
    const pid = decodeURIComponent(matchParticipantId[1]);
    const db = store.load();
    const participant = db.participants.find((p) => p.id === pid);
    if (!participant) return { status: 404, data: { error: 'Peserta tidak ditemukan.' } };
    const payload = body as Partial<Participant>;
    if (payload.name !== undefined && payload.name.trim()) participant.name = payload.name.trim();
    if (payload.clubOrTeam !== undefined) participant.clubOrTeam = payload.clubOrTeam.trim() || 'Mandiri';
    if (payload.seed !== undefined) participant.seed = payload.seed || undefined;
    if (payload.groupId !== undefined) participant.groupId = payload.groupId || undefined;
    store.save(db);
    store.broadcast?.(participant.tournamentId);
    return { status: 200, data: buildTournamentBundle(db, participant.tournamentId, true) };
  }

  if (upperMethod === 'DELETE' && matchParticipantId) {
    const pid = decodeURIComponent(matchParticipantId[1]);
    const db = store.load();
    const participant = db.participants.find((p) => p.id === pid);
    if (!participant) return { status: 404, data: { error: 'Peserta tidak ditemukan.' } };
    const tournamentId = participant.tournamentId;
    db.participants = db.participants.filter((p) => p.id !== participant.id);
    for (const g of db.groups) {
      g.participantIds = g.participantIds.filter((item) => item !== participant.id);
    }
    store.save(db);
    store.broadcast?.(tournamentId);
    return { status: 200, data: buildTournamentBundle(db, tournamentId, true) };
  }

  // Generate fixtures for category
  const matchCatGenerate = pathname.match(/^\/api\/categories\/([^/]+)\/generate$/);
  if (upperMethod === 'POST' && matchCatGenerate) {
    const catId = decodeURIComponent(matchCatGenerate[1]);
    const db = store.load();
    const cat = db.categories.find((c) => c.id === catId);
    if (!cat) return { status: 404, data: { error: 'Kategori tidak ditemukan.' } };
    const tournament = db.tournaments.find((t) => t.id === cat.tournamentId);
    if (!tournament) return { status: 404, data: { error: 'Turnamen tidak ditemukan.' } };

    const catParticipants = db.participants.filter((p) => p.categoryId === cat.id);
    if (catParticipants.length < 2) {
      return {
        status: 400,
        data: { error: 'Minimal 2 peserta diperlukan untuk membuat bagan/grup.' },
      };
    }

    const fixtures = generateCategoryFixtures(cat, catParticipants, tournament.courts);
    const scheduled = autoScheduleTournamentMatches(fixtures.matches, tournament.courts, '09:00', 30);

    db.groups = db.groups.filter((g) => g.categoryId !== cat.id);
    db.matches = db.matches.filter((m) => m.categoryId !== cat.id);

    db.groups.push(...fixtures.groups);
    for (const g of fixtures.groups) {
      for (const pid of g.participantIds) {
        const p = db.participants.find((item) => item.id === pid);
        if (p) p.groupId = g.id;
      }
    }
    db.matches.push(...scheduled);
    store.save(db);
    store.broadcast?.(tournament.id);
    return { status: 200, data: buildTournamentBundle(db, tournament.id, true) };
  }

  // Auto-schedule tournament matches
  const matchAutoSched = pathname.match(/^\/api\/tournaments\/([^/]+)\/auto-schedule$/);
  if (upperMethod === 'POST' && matchAutoSched) {
    const id = decodeURIComponent(matchAutoSched[1]);
    const db = store.load();
    const tournament = db.tournaments.find((t) => t.id === id);
    if (!tournament) return { status: 404, data: { error: 'Turnamen tidak ditemukan.' } };

    const { startTime, intervalMinutes } = body as { startTime?: string; intervalMinutes?: number };
    const tMatches = db.matches.filter((m) => m.tournamentId === tournament.id);
    const otherMatches = db.matches.filter((m) => m.tournamentId !== tournament.id);
    const rescheduled = autoScheduleTournamentMatches(
      tMatches,
      tournament.courts,
      startTime || '09:00',
      intervalMinutes || 30
    );
    db.matches = [...otherMatches, ...rescheduled];
    store.save(db);
    store.broadcast?.(tournament.id);
    return { status: 200, data: buildTournamentBundle(db, tournament.id, true) };
  }

  // Group standing override
  const matchGroupOverride = pathname.match(/^\/api\/groups\/([^/]+)\/override$/);
  if (upperMethod === 'POST' && matchGroupOverride) {
    const groupId = decodeURIComponent(matchGroupOverride[1]);
    const db = store.load();
    const group = db.groups.find((g) => g.id === groupId);
    if (!group) return { status: 404, data: { error: 'Grup tidak ditemukan.' } };

    const { participantId, manualRank, reason, clear } = body as {
      participantId: string;
      manualRank?: number;
      reason?: string;
      clear?: boolean;
    };
    if (clear) {
      group.overrides = group.overrides.filter((o) => o.participantId !== participantId);
    } else {
      if (!reason?.trim()) {
        return {
          status: 400,
          data: { error: 'Alasan audit wajib diisi untuk penyesuaian peringkat manual.' },
        };
      }
      group.overrides = group.overrides.filter((o) => o.participantId !== participantId);
      group.overrides.push({
        participantId,
        manualRank: manualRank ?? 1,
        reason: reason.trim(),
        updatedAt: new Date().toISOString(),
      });
    }

    const cat = db.categories.find((c) => c.id === group.categoryId);
    if (cat && cat.format === 'group_knockout') {
      const catGroups = db.groups.filter((g) => g.categoryId === cat.id);
      const participants = db.participants.filter((p) => p.tournamentId === cat.tournamentId);
      const dummyGroupMatch = db.matches.find((m) => m.groupId === group.id);
      if (dummyGroupMatch) {
        db.matches = syncPostMatchProgression(dummyGroupMatch, cat, catGroups, participants, db.matches);
      }
    }

    store.save(db);
    store.broadcast?.(group.tournamentId);
    return { status: 200, data: buildTournamentBundle(db, group.tournamentId, true) };
  }

  // Update match meta
  const matchPatchMatch = pathname.match(/^\/api\/matches\/([^/]+)$/);
  if (upperMethod === 'PATCH' && matchPatchMatch) {
    const matchId = decodeURIComponent(matchPatchMatch[1]);
    const db = store.load();
    const match = db.matches.find((m) => m.id === matchId);
    if (!match) return { status: 404, data: { error: 'Pertandingan tidak ditemukan.' } };
    const payload = body as Partial<Match>;
    if (payload.court !== undefined) match.court = payload.court;
    if (payload.scheduledTime !== undefined) match.scheduledTime = payload.scheduledTime;
    if (payload.status !== undefined) match.status = payload.status;
    if (payload.participantAId !== undefined) match.participantAId = payload.participantAId;
    if (payload.participantBId !== undefined) match.participantBId = payload.participantBId;
    if (payload.notes !== undefined) match.notes = payload.notes;
    match.updatedAt = new Date().toISOString();

    store.save(db);
    store.broadcast?.(match.tournamentId, 'match:updated', match.id);
    return { status: 200, data: buildTournamentBundle(db, match.tournamentId, true) };
  }

  // Live scoring
  const matchPostScore = pathname.match(/^\/api\/matches\/([^/]+)\/score$/);
  if (upperMethod === 'POST' && matchPostScore) {
    const matchId = decodeURIComponent(matchPostScore[1]);
    const db = store.load();
    const matchIdx = db.matches.findIndex((m) => m.id === matchId);
    if (matchIdx === -1) return { status: 404, data: { error: 'Pertandingan tidak ditemukan.' } };
    const currentMatch = db.matches[matchIdx];
    const tournament = db.tournaments.find((t) => t.id === currentMatch.tournamentId);
    if (!tournament) return { status: 404, data: { error: 'Turnamen tidak ditemukan.' } };

    const pinHeader = getHeader('x-referee-pin')?.trim();
    const roleHeader = getHeader('x-smashpoint-role')?.trim();
    const payload = body as {
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
        | 'update_note'
        | 'admin_override';
      clientEventId?: string;
      winnerSide?: 'A' | 'B';
      note?: string;
      forceOverride?: boolean;
    };

    const isAdmin = roleHeader === 'organizer';
    const isValidPin = Boolean(pinHeader && pinHeader === tournament.refereePin);
    if (!isAdmin && !isValidPin) {
      return { status: 403, data: { error: 'Akses ditolak. PIN Wasit tidak valid.' } };
    }

    if (payload.action === 'admin_override') {
      if (!isAdmin) {
        return {
          status: 403,
          data: { error: 'Hanya Admin/Panitia yang dapat mengubah hasil akhir.' },
        };
      }
      const impacted = checkDownstreamImpact(currentMatch, db.matches);
      if (impacted.length > 0 && !payload.forceOverride) {
        return {
          status: 409,
          data: {
            requiresConfirmation: true,
            impactedMatches: impacted.map((m) => ({
              id: m.id,
              roundLabel: m.roundLabel,
              status: m.status,
            })),
            error: `Perubahan ini memengaruhi ${impacted.length} pertandingan babak berikutnya yang sudah berjalan/selesai.`,
          },
        };
      }

      const newWinnerId =
        payload.winnerSide === 'A' ? currentMatch.participantAId : currentMatch.participantBId;
      if (!newWinnerId) return { status: 400, data: { error: 'Pemenang tidak valid.' } };

      const updated: Match = structuredClone(currentMatch);
      updated.winnerId = newWinnerId;
      updated.status = 'completed';
      updated.awaitingConfirmation = false;
      updated.pendingWinnerId = null;
      updated.notes = payload.note
        ? `${updated.notes ? updated.notes + ' · ' : ''}Koreksi Admin: ${payload.note}`
        : updated.notes;
      updated.scoreEvents.push({
        id: createId('evt'),
        matchId: updated.id,
        timestamp: new Date().toISOString(),
        actor: 'admin',
        action: 'admin_override',
        gameNumber: updated.currentGame,
        oldScoreA: 0,
        oldScoreB: 0,
        newScoreA: 0,
        newScoreB: 0,
        note: payload.note || 'Koreksi hasil oleh Panitia',
      });
      updated.updatedAt = new Date().toISOString();

      const cat = db.categories.find((c) => c.id === updated.categoryId)!;
      const groups = db.groups.filter((g) => g.categoryId === updated.categoryId);
      const participants = db.participants.filter((p) => p.tournamentId === updated.tournamentId);
      db.matches = syncPostMatchProgression(updated, cat, groups, participants, db.matches);
      store.save(db);
      store.broadcast?.(tournament.id, 'match:updated', updated.id);
      return { status: 200, data: buildTournamentBundle(db, tournament.id, isAdmin) };
    }

    const result = applyMatchScoreAction(currentMatch, payload.action, {
      actor: isAdmin && !isValidPin ? 'admin' : 'referee',
      clientEventId: payload.clientEventId,
      winnerSide: payload.winnerSide,
      note: payload.note,
    });

    if (result.error) {
      return { status: 400, data: { error: result.error } };
    }

    const cat = db.categories.find((c) => c.id === result.match.categoryId);
    if (cat) {
      const groups = db.groups.filter((g) => g.categoryId === cat.id);
      const participants = db.participants.filter((p) => p.tournamentId === tournament.id);
      db.matches = syncPostMatchProgression(result.match, cat, groups, participants, db.matches);
    } else {
      db.matches[matchIdx] = result.match;
    }

    if (result.match.status === 'live' && tournament.status !== 'ongoing') {
      tournament.status = 'ongoing';
    }

    store.save(db);
    store.broadcast?.(tournament.id, 'score:changed', result.match.id);
    return { status: 200, data: buildTournamentBundle(db, tournament.id, isAdmin) };
  }

  return { status: 404, data: { error: 'Endpoint API tidak ditemukan.' } };
}
