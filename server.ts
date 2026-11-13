import http from 'node:http';
import path from 'node:path';
import express from 'express';
import { WebSocketServer, WebSocket } from 'ws';
import { createServer as createViteServer } from 'vite';
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
} from './src/shared/engine.ts';
import type {
  Category,
  CategoryType,
  CompetitionFormat,
  GroupConfig,
  KnockoutConfig,
  Match,
  Participant,
  ScoringRule,
  Tournament,
} from './src/shared/types.ts';
import {
  buildTournamentBundle,
  getTournamentSummaries,
  loadDatabase,
  saveDatabase,
} from './server/store.ts';

const PORT = 3000;

interface WsClientMeta {
  tournamentId: string;
}

const clientSubscriptions = new Map<WebSocket, WsClientMeta>();

function broadcastTournamentUpdate(tournamentId: string, eventType = 'tournament:updated', matchId?: string) {
  const payload = JSON.stringify({
    type: eventType,
    tournamentId,
    matchId,
    timestamp: new Date().toISOString(),
  });

  for (const [client, meta] of clientSubscriptions.entries()) {
    if (client.readyState === WebSocket.OPEN) {
      if (meta.tournamentId === 'all' || meta.tournamentId === tournamentId) {
        client.send(payload);
      }
    }
  }
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '4mb' }));

  const server = http.createServer(app);
  const wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (ws) => {
    clientSubscriptions.set(ws, { tournamentId: 'all' });

    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString()) as { type?: string; tournamentId?: string };
        if (msg.type === 'subscribe' && msg.tournamentId) {
          clientSubscriptions.set(ws, { tournamentId: msg.tournamentId });
        }
      } catch {
        // Ignore malformed ws messages
      }
    });

    ws.on('close', () => {
      clientSubscriptions.delete(ws);
    });

    ws.send(JSON.stringify({ type: 'connected', timestamp: new Date().toISOString() }));
  });

  // Health check
  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, service: 'SmashPoint' });
  });

  // List tournaments
  app.get('/api/tournaments', (_req, res) => {
    const db = loadDatabase();
    res.json({ tournaments: getTournamentSummaries(db) });
  });

  // Get full tournament bundle (Organizer workspace)
  app.get('/api/tournaments/:id', (req, res) => {
    const db = loadDatabase();
    const bundle = buildTournamentBundle(db, req.params.id, true);
    if (!bundle) {
      res.status(404).json({ error: 'Turnamen tidak ditemukan.' });
      return;
    }
    res.json(bundle);
  });

  // Get public read-only tournament bundle (strips refereePin)
  app.get('/api/public/:slugOrId', (req, res) => {
    const db = loadDatabase();
    const bundle = buildTournamentBundle(db, req.params.slugOrId, false);
    if (!bundle) {
      res.status(404).json({ error: 'Halaman turnamen publik tidak ditemukan.' });
      return;
    }
    res.json(bundle);
  });

  // Verify Referee PIN
  app.post('/api/referee/verify-pin', (req, res) => {
    const { pin, tournamentId } = req.body as { pin?: string; tournamentId?: string };
    const cleanPin = (pin ?? '').trim();
    if (!cleanPin) {
      res.status(400).json({ error: 'Masukkan PIN Wasit 6-digit.' });
      return;
    }

    const db = loadDatabase();
    const found = db.tournaments.find((t) =>
      tournamentId ? t.id === tournamentId && t.refereePin === cleanPin : t.refereePin === cleanPin
    );

    if (!found) {
      res.status(401).json({ error: 'PIN Wasit tidak cocok. Periksa kembali kode dari panitia.' });
      return;
    }

    const bundle = buildTournamentBundle(db, found.id, false);
    res.json({ verified: true, bundle });
  });

  // Create tournament (supports full 7-step Wizard payload)
  app.post('/api/tournaments', (req, res) => {
    const body = req.body as {
      name: string;
      location: string;
      startDate: string;
      endDate: string;
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

    if (!body.name?.trim()) {
      res.status(400).json({ error: 'Nama turnamen wajib diisi.' });
      return;
    }

    const db = loadDatabase();
    const now = new Date().toISOString();
    const tourneyId = createId('trn');
    const courts =
      Array.isArray(body.courts) && body.courts.filter((c) => c.trim()).length > 0
        ? body.courts.map((c) => c.trim()).filter(Boolean)
        : ['Lapangan 1', 'Lapangan 2'];

    const tournament: Tournament = {
      id: tourneyId,
      slug: createSlug(body.name),
      name: body.name.trim(),
      location: (body.location ?? '').trim() || 'GOR Utama',
      startDate: body.startDate || now.slice(0, 10),
      endDate: body.endDate || body.startDate || now.slice(0, 10),
      status: body.status ?? 'published',
      courts,
      refereePin: generatePin(),
      defaultScoringRule: body.defaultScoringRule ?? getScoringRuleForPreset('standard'),
      createdAt: now,
      updatedAt: now,
    };

    db.tournaments.unshift(tournament);

    const createdCategories: Category[] = [];
    const createdParticipants: Participant[] = [];
    let createdMatches: Match[] = [];

    if (Array.isArray(body.categories)) {
      for (const catInput of body.categories) {
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
        createdCategories.push(category);
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
            createdParticipants.push(p);
            db.participants.push(p);
          });
        }

        if (body.autoGenerate !== false && catParticipants.length >= 2) {
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

    if (createdMatches.length > 0 && body.autoSchedule !== false) {
      createdMatches = autoScheduleTournamentMatches(
        createdMatches,
        tournament.courts,
        body.startTime || '09:00',
        30
      );
    }
    db.matches.push(...createdMatches);

    saveDatabase(db);
    broadcastTournamentUpdate(tournament.id, 'tournament:created');
    res.status(201).json(buildTournamentBundle(db, tournament.id, true));
  });

  // Update tournament metadata / PIN / courts
  app.patch('/api/tournaments/:id', (req, res) => {
    const db = loadDatabase();
    const tournament = db.tournaments.find((t) => t.id === req.params.id);
    if (!tournament) {
      res.status(404).json({ error: 'Turnamen tidak ditemukan.' });
      return;
    }

    const body = req.body as Partial<Tournament> & {
      regeneratePin?: boolean;
      applyToPendingMatches?: boolean;
    };
    if (body.name !== undefined && body.name.trim()) tournament.name = body.name.trim();
    if (body.location !== undefined) tournament.location = body.location.trim();
    if (body.startDate !== undefined) tournament.startDate = body.startDate;
    if (body.endDate !== undefined) tournament.endDate = body.endDate;
    if (body.status !== undefined) tournament.status = body.status;
    if (Array.isArray(body.courts) && body.courts.length > 0) {
      tournament.courts = body.courts.map((c) => c.trim()).filter(Boolean);
    }
    if (body.defaultScoringRule) {
      tournament.defaultScoringRule = body.defaultScoringRule;
      if (body.applyToPendingMatches) {
        for (const cat of db.categories) {
          if (cat.tournamentId === tournament.id) {
            cat.scoringRule = structuredClone(body.defaultScoringRule);
          }
        }
        for (const m of db.matches) {
          if (
            m.tournamentId === tournament.id &&
            (m.status === 'draft' || m.status === 'scheduled' || m.status === 'ready') &&
            m.scoreEvents.length === 0
          ) {
            m.scoringRuleSnapshot = structuredClone(body.defaultScoringRule);
          }
        }
      }
    }
    if (body.regeneratePin) tournament.refereePin = generatePin();
    tournament.updatedAt = new Date().toISOString();

    saveDatabase(db);
    broadcastTournamentUpdate(tournament.id);
    res.json(buildTournamentBundle(db, tournament.id, true));
  });

  // Delete tournament
  app.delete('/api/tournaments/:id', (req, res) => {
    const db = loadDatabase();
    const idx = db.tournaments.findIndex((t) => t.id === req.params.id);
    if (idx === -1) {
      res.status(404).json({ error: 'Turnamen tidak ditemukan.' });
      return;
    }
    const id = req.params.id;
    db.tournaments.splice(idx, 1);
    db.categories = db.categories.filter((c) => c.tournamentId !== id);
    db.participants = db.participants.filter((p) => p.tournamentId !== id);
    db.groups = db.groups.filter((g) => g.tournamentId !== id);
    db.matches = db.matches.filter((m) => m.tournamentId !== id);
    saveDatabase(db);
    res.json({ deleted: true, id });
  });

  // Add or update category
  app.post('/api/tournaments/:id/categories', (req, res) => {
    const db = loadDatabase();
    const tournament = db.tournaments.find((t) => t.id === req.params.id);
    if (!tournament) {
      res.status(404).json({ error: 'Turnamen tidak ditemukan.' });
      return;
    }
    const body = req.body as Partial<Category>;
    const type = body.type ?? 'mens_singles';
    const category: Category = {
      id: createId('cat'),
      tournamentId: tournament.id,
      name: (body.name ?? '').trim() || CATEGORY_LABELS[type] || 'Kategori Baru',
      type,
      format: body.format ?? 'knockout',
      groupConfig: body.groupConfig ?? {
        groupCount: 2,
        advancePerGroup: 2,
        drawMode: 'random',
        tieBreakOrder: DEFAULT_TIE_BREAK_ORDER,
      },
      knockoutConfig: body.knockoutConfig ?? {
        drawMode: 'random',
        thirdPlaceMatch: true,
      },
      scoringRule: body.scoringRule ?? tournament.defaultScoringRule,
      createdAt: new Date().toISOString(),
    };
    db.categories.push(category);
    saveDatabase(db);
    broadcastTournamentUpdate(tournament.id);
    res.status(201).json(buildTournamentBundle(db, tournament.id, true));
  });

  app.patch('/api/categories/:id', (req, res) => {
    const db = loadDatabase();
    const cat = db.categories.find((c) => c.id === req.params.id);
    if (!cat) {
      res.status(404).json({ error: 'Kategori tidak ditemukan.' });
      return;
    }
    const body = req.body as Partial<Category> & { applyToPendingMatches?: boolean };
    if (body.name !== undefined && body.name.trim()) cat.name = body.name.trim();
    if (body.type !== undefined) cat.type = body.type;
    if (body.format !== undefined) cat.format = body.format;
    if (body.groupConfig) cat.groupConfig = body.groupConfig;
    if (body.knockoutConfig) cat.knockoutConfig = body.knockoutConfig;
    if (body.scoringRule) {
      cat.scoringRule = body.scoringRule;
      if (body.applyToPendingMatches) {
        for (const m of db.matches) {
          if (
            m.categoryId === cat.id &&
            (m.status === 'draft' || m.status === 'scheduled' || m.status === 'ready') &&
            m.scoreEvents.length === 0
          ) {
            m.scoringRuleSnapshot = structuredClone(body.scoringRule);
          }
        }
      }
    }
    saveDatabase(db);
    broadcastTournamentUpdate(cat.tournamentId);
    res.json(buildTournamentBundle(db, cat.tournamentId, true));
  });

  app.delete('/api/categories/:id', (req, res) => {
    const db = loadDatabase();
    const cat = db.categories.find((c) => c.id === req.params.id);
    if (!cat) {
      res.status(404).json({ error: 'Kategori tidak ditemukan.' });
      return;
    }
    const tournamentId = cat.tournamentId;
    db.categories = db.categories.filter((c) => c.id !== cat.id);
    db.participants = db.participants.filter((p) => p.categoryId !== cat.id);
    db.groups = db.groups.filter((g) => g.categoryId !== cat.id);
    db.matches = db.matches.filter((m) => m.categoryId !== cat.id);
    saveDatabase(db);
    broadcastTournamentUpdate(tournamentId);
    res.json(buildTournamentBundle(db, tournamentId, true));
  });

  // Add participants (single or bulk)
  app.post('/api/tournaments/:id/participants', (req, res) => {
    const db = loadDatabase();
    const tournament = db.tournaments.find((t) => t.id === req.params.id);
    if (!tournament) {
      res.status(404).json({ error: 'Turnamen tidak ditemukan.' });
      return;
    }
    const body = req.body as {
      categoryId: string;
      participants?: Array<{ name: string; clubOrTeam?: string; seed?: number; groupId?: string }>;
      name?: string;
      clubOrTeam?: string;
      seed?: number;
      groupId?: string;
    };

    const items = Array.isArray(body.participants)
      ? body.participants
      : body.name
      ? [{ name: body.name, clubOrTeam: body.clubOrTeam, seed: body.seed, groupId: body.groupId }]
      : [];

    if (items.length === 0) {
      res.status(400).json({ error: 'Minimal satu nama peserta harus diisi.' });
      return;
    }

    for (const item of items) {
      if (!item.name?.trim()) continue;
      db.participants.push({
        id: createId('p'),
        tournamentId: tournament.id,
        categoryId: body.categoryId,
        name: item.name.trim(),
        clubOrTeam: (item.clubOrTeam ?? '').trim() || 'Mandiri',
        seed: item.seed,
        groupId: item.groupId,
      });
    }

    saveDatabase(db);
    broadcastTournamentUpdate(tournament.id);
    res.status(201).json(buildTournamentBundle(db, tournament.id, true));
  });

  app.patch('/api/participants/:id', (req, res) => {
    const db = loadDatabase();
    const participant = db.participants.find((p) => p.id === req.params.id);
    if (!participant) {
      res.status(404).json({ error: 'Peserta tidak ditemukan.' });
      return;
    }
    const body = req.body as Partial<Participant>;
    if (body.name !== undefined && body.name.trim()) participant.name = body.name.trim();
    if (body.clubOrTeam !== undefined) participant.clubOrTeam = body.clubOrTeam.trim() || 'Mandiri';
    if (body.seed !== undefined) participant.seed = body.seed || undefined;
    if (body.groupId !== undefined) participant.groupId = body.groupId || undefined;
    saveDatabase(db);
    broadcastTournamentUpdate(participant.tournamentId);
    res.json(buildTournamentBundle(db, participant.tournamentId, true));
  });

  app.delete('/api/participants/:id', (req, res) => {
    const db = loadDatabase();
    const participant = db.participants.find((p) => p.id === req.params.id);
    if (!participant) {
      res.status(404).json({ error: 'Peserta tidak ditemukan.' });
      return;
    }
    const tournamentId = participant.tournamentId;
    db.participants = db.participants.filter((p) => p.id !== participant.id);
    for (const g of db.groups) {
      g.participantIds = g.participantIds.filter((pid) => pid !== participant.id);
    }
    saveDatabase(db);
    broadcastTournamentUpdate(tournamentId);
    res.json(buildTournamentBundle(db, tournamentId, true));
  });

  // Generate / regenerate fixtures for a category
  app.post('/api/categories/:id/generate', (req, res) => {
    const db = loadDatabase();
    const cat = db.categories.find((c) => c.id === req.params.id);
    if (!cat) {
      res.status(404).json({ error: 'Kategori tidak ditemukan.' });
      return;
    }
    const tournament = db.tournaments.find((t) => t.id === cat.tournamentId);
    if (!tournament) {
      res.status(404).json({ error: 'Turnamen tidak ditemukan.' });
      return;
    }

    const catParticipants = db.participants.filter((p) => p.categoryId === cat.id);
    if (catParticipants.length < 2) {
      res.status(400).json({ error: 'Minimal 2 peserta diperlukan untuk membuat bagan/grup.' });
      return;
    }

    const fixtures = generateCategoryFixtures(cat, catParticipants, tournament.courts);
    const scheduled = autoScheduleTournamentMatches(fixtures.matches, tournament.courts, '09:00', 30);

    // Replace existing groups & matches for this category
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
    saveDatabase(db);
    broadcastTournamentUpdate(tournament.id);
    res.json(buildTournamentBundle(db, tournament.id, true));
  });

  // Auto-schedule tournament matches
  app.post('/api/tournaments/:id/auto-schedule', (req, res) => {
    const db = loadDatabase();
    const tournament = db.tournaments.find((t) => t.id === req.params.id);
    if (!tournament) {
      res.status(404).json({ error: 'Turnamen tidak ditemukan.' });
      return;
    }
    const { startTime, intervalMinutes } = req.body as { startTime?: string; intervalMinutes?: number };
    const tMatches = db.matches.filter((m) => m.tournamentId === tournament.id);
    const otherMatches = db.matches.filter((m) => m.tournamentId !== tournament.id);
    const rescheduled = autoScheduleTournamentMatches(
      tMatches,
      tournament.courts,
      startTime || '09:00',
      intervalMinutes || 30
    );
    db.matches = [...otherMatches, ...rescheduled];
    saveDatabase(db);
    broadcastTournamentUpdate(tournament.id);
    res.json(buildTournamentBundle(db, tournament.id, true));
  });

  // Manual Group Standing Override with Audit
  app.post('/api/groups/:id/override', (req, res) => {
    const db = loadDatabase();
    const group = db.groups.find((g) => g.id === req.params.id);
    if (!group) {
      res.status(404).json({ error: 'Grup tidak ditemukan.' });
      return;
    }
    const { participantId, manualRank, reason, clear } = req.body as {
      participantId: string;
      manualRank?: number;
      reason?: string;
      clear?: boolean;
    };
    if (clear) {
      group.overrides = group.overrides.filter((o) => o.participantId !== participantId);
    } else {
      if (!reason?.trim()) {
        res.status(400).json({ error: 'Alasan audit wajib diisi untuk penyesuaian peringkat manual.' });
        return;
      }
      group.overrides = group.overrides.filter((o) => o.participantId !== participantId);
      group.overrides.push({
        participantId,
        manualRank: manualRank ?? 1,
        reason: reason.trim(),
        updatedAt: new Date().toISOString(),
      });
    }

    // Re-sync group to knockout if needed
    const cat = db.categories.find((c) => c.id === group.categoryId);
    if (cat && cat.format === 'group_knockout') {
      const catGroups = db.groups.filter((g) => g.categoryId === cat.id);
      const participants = db.participants.filter((p) => p.tournamentId === cat.tournamentId);
      const dummyGroupMatch = db.matches.find((m) => m.groupId === group.id);
      if (dummyGroupMatch) {
        db.matches = syncPostMatchProgression(dummyGroupMatch, cat, catGroups, participants, db.matches);
      }
    }

    saveDatabase(db);
    broadcastTournamentUpdate(group.tournamentId);
    res.json(buildTournamentBundle(db, group.tournamentId, true));
  });

  // Update match schedule / court / status / participants
  app.patch('/api/matches/:id', (req, res) => {
    const db = loadDatabase();
    const match = db.matches.find((m) => m.id === req.params.id);
    if (!match) {
      res.status(404).json({ error: 'Pertandingan tidak ditemukan.' });
      return;
    }
    const body = req.body as Partial<Match>;
    if (body.court !== undefined) match.court = body.court;
    if (body.scheduledTime !== undefined) match.scheduledTime = body.scheduledTime;
    if (body.status !== undefined) match.status = body.status;
    if (body.participantAId !== undefined) match.participantAId = body.participantAId;
    if (body.participantBId !== undefined) match.participantBId = body.participantBId;
    if (body.notes !== undefined) match.notes = body.notes;
    match.updatedAt = new Date().toISOString();

    saveDatabase(db);
    broadcastTournamentUpdate(match.tournamentId, 'match:updated', match.id);
    res.json(buildTournamentBundle(db, match.tournamentId, true));
  });

  // Live Scoring Endpoint (Referee PIN or Organizer Admin)
  app.post('/api/matches/:id/score', (req, res) => {
    const db = loadDatabase();
    const matchIdx = db.matches.findIndex((m) => m.id === req.params.id);
    if (matchIdx === -1) {
      res.status(404).json({ error: 'Pertandingan tidak ditemukan.' });
      return;
    }
    const currentMatch = db.matches[matchIdx];
    const tournament = db.tournaments.find((t) => t.id === currentMatch.tournamentId);
    if (!tournament) {
      res.status(404).json({ error: 'Turnamen tidak ditemukan.' });
      return;
    }

    // Validate authority: Organizer Workspace header or matching Referee PIN
    const pinHeader = (req.headers['x-referee-pin'] as string | undefined)?.trim();
    const roleHeader = (req.headers['x-smashpoint-role'] as string | undefined)?.trim();
    const body = req.body as {
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
      res.status(403).json({ error: 'Akses ditolak. PIN Wasit tidak valid.' });
      return;
    }

    // Handle admin override of an already completed match affecting downstream knockout rounds
    if (body.action === 'admin_override') {
      if (!isAdmin) {
        res.status(403).json({ error: 'Hanya Admin/Panitia yang dapat mengubah hasil akhir.' });
        return;
      }
      const impacted = checkDownstreamImpact(currentMatch, db.matches);
      if (impacted.length > 0 && !body.forceOverride) {
        res.status(409).json({
          requiresConfirmation: true,
          impactedMatches: impacted.map((m) => ({ id: m.id, roundLabel: m.roundLabel, status: m.status })),
          error: `Perubahan ini memengaruhi ${impacted.length} pertandingan babak berikutnya yang sudah berjalan/selesai.`,
        });
        return;
      }

      const newWinnerId =
        body.winnerSide === 'A' ? currentMatch.participantAId : currentMatch.participantBId;
      if (!newWinnerId) {
        res.status(400).json({ error: 'Pemenang tidak valid.' });
        return;
      }

      const updated: Match = structuredClone(currentMatch);
      updated.winnerId = newWinnerId;
      updated.status = 'completed';
      updated.awaitingConfirmation = false;
      updated.pendingWinnerId = null;
      updated.notes = body.note ? `${updated.notes ? updated.notes + ' · ' : ''}Koreksi Admin: ${body.note}` : updated.notes;
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
        note: body.note || 'Koreksi hasil oleh Panitia',
      });
      updated.updatedAt = new Date().toISOString();

      const cat = db.categories.find((c) => c.id === updated.categoryId)!;
      const groups = db.groups.filter((g) => g.categoryId === updated.categoryId);
      const participants = db.participants.filter((p) => p.tournamentId === updated.tournamentId);
      db.matches = syncPostMatchProgression(updated, cat, groups, participants, db.matches);
      saveDatabase(db);
      broadcastTournamentUpdate(tournament.id, 'match:updated', updated.id);
      res.json(buildTournamentBundle(db, tournament.id, isAdmin));
      return;
    }

    const result = applyMatchScoreAction(currentMatch, body.action, {
      actor: isAdmin && !isValidPin ? 'admin' : 'referee',
      clientEventId: body.clientEventId,
      winnerSide: body.winnerSide,
      note: body.note,
    });

    if (result.error) {
      res.status(400).json({ error: result.error });
      return;
    }

    const cat = db.categories.find((c) => c.id === result.match.categoryId);
    if (cat) {
      const groups = db.groups.filter((g) => g.categoryId === cat.id);
      const participants = db.participants.filter((p) => p.tournamentId === tournament.id);
      db.matches = syncPostMatchProgression(result.match, cat, groups, participants, db.matches);
    } else {
      db.matches[matchIdx] = result.match;
    }

    // Update tournament status to ongoing if a match goes live
    if (result.match.status === 'live' && tournament.status !== 'ongoing') {
      tournament.status = 'ongoing';
    }

    saveDatabase(db);
    broadcastTournamentUpdate(tournament.id, 'score:changed', result.match.id);
    res.json(buildTournamentBundle(db, tournament.id, isAdmin));
  });

  // Return clean JSON 404 for unknown /api endpoints instead of Vite HTML fallback
  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'Endpoint API tidak ditemukan.' });
  });

  // Vite middleware in development, static dist in production
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`SmashPoint server running at http://localhost:${PORT}`);
  });
}

startServer();
