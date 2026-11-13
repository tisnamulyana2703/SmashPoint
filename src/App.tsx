import { useCallback, useEffect, useState } from 'react';
import type { TournamentBundle, TournamentSummary } from './shared/types';
import {
  fetchTournamentBundle,
  fetchTournamentSummaries,
  useTournamentLiveSync,
} from './lib/api';
import { OrganizerWorkspace, type WorkspaceSection } from './components/OrganizerWorkspace';
import { PublicTournamentView } from './components/PublicTournamentView';
import { BigScreenTVView } from './components/BigScreenTVView';
import { RefereePortalView } from './components/RefereePortalView';
import { TournamentWizardModal } from './components/TournamentWizardModal';
import { QrCodeModal } from './components/QrCodeModal';

type AppViewMode = 'organizer' | 'public' | 'tv' | 'referee';

function getInitialRouteState(): {
  mode: AppViewMode;
  slugOrId: string;
  pin: string;
} {
  if (typeof window === 'undefined') {
    return { mode: 'organizer', slugOrId: '', pin: '' };
  }
  const params = new URLSearchParams(window.location.search);
  const view = params.get('view');
  if (view === 'public') {
    return {
      mode: 'public',
      slugOrId: params.get('slug') || params.get('id') || 'smashpoint-open-2026',
      pin: '',
    };
  }
  if (view === 'tv') {
    return {
      mode: 'tv',
      slugOrId: params.get('id') || 'trn_smashpoint2026',
      pin: '',
    };
  }
  if (view === 'referee') {
    return {
      mode: 'referee',
      slugOrId: params.get('id') || '',
      pin: params.get('pin') || '',
    };
  }
  return { mode: 'organizer', slugOrId: '', pin: '' };
}

export default function App() {
  const initialRoute = getInitialRouteState();
  const [viewMode, setViewMode] = useState<AppViewMode>(initialRoute.mode);
  const [targetSlugOrId, setTargetSlugOrId] = useState<string>(initialRoute.slugOrId);
  const [refereePinParam, setRefereePinParam] = useState<string>(initialRoute.pin);

  const [summaries, setSummaries] = useState<TournamentSummary[]>([]);
  const [activeTournamentId, setActiveTournamentId] = useState<string>('');
  const [bundle, setBundle] = useState<TournamentBundle | null>(null);
  const [loading, setLoading] = useState(true);
  const [section, setSection] = useState<WorkspaceSection>('dashboard');

  const [showWizard, setShowWizard] = useState(false);
  const [showQrModal, setShowQrModal] = useState(false);

  const loadSummariesAndBundle = useCallback(
    async (preferredId?: string) => {
      try {
        const list = await fetchTournamentSummaries();
        setSummaries(list);
        const chosenId =
          preferredId ||
          (activeTournamentId && list.some((t) => t.id === activeTournamentId)
            ? activeTournamentId
            : list[0]?.id || '');

        if (chosenId) {
          setActiveTournamentId(chosenId);
          const data = await fetchTournamentBundle(chosenId);
          setBundle(data);
        } else {
          setBundle(null);
        }
      } catch (err) {
        console.error('Gagal memuat data turnamen:', err);
      } finally {
        setLoading(false);
      }
    },
    [activeTournamentId]
  );

  useEffect(() => {
    if (viewMode === 'organizer') {
      void loadSummariesAndBundle();
    } else {
      setLoading(false);
    }
  }, [viewMode, loadSummariesAndBundle]);

  const { wsConnected, isOnline } = useTournamentLiveSync(
    viewMode === 'organizer' ? activeTournamentId : undefined,
    () => {
      if (activeTournamentId) {
        void fetchTournamentBundle(activeTournamentId).then(setBundle).catch(() => {});
      }
    }
  );

  const navigateUrl = (mode: AppViewMode, params: Record<string, string> = {}) => {
    const url = new URL(window.location.href);
    url.search = '';
    if (mode !== 'organizer') {
      url.searchParams.set('view', mode);
      Object.entries(params).forEach(([k, v]) => {
        if (v) url.searchParams.set(k, v);
      });
    }
    window.history.pushState({}, '', url.toString());
  };

  const handleOpenPublic = (slugOrId?: string) => {
    const slug = slugOrId || bundle?.tournament.slug || 'smashpoint-open-2026';
    setTargetSlugOrId(slug);
    setViewMode('public');
    navigateUrl('public', { slug });
  };

  const handleOpenTv = (id?: string) => {
    const tId = id || bundle?.tournament.id || 'trn_smashpoint2026';
    setTargetSlugOrId(tId);
    setViewMode('tv');
    navigateUrl('tv', { id: tId });
  };

  const handleOpenReferee = () => {
    const tId = bundle?.tournament.id || '';
    setTargetSlugOrId(tId);
    setRefereePinParam('');
    setViewMode('referee');
    navigateUrl('referee', tId ? { id: tId } : {});
  };

  const handleExitToOrganizer = () => {
    setViewMode('organizer');
    navigateUrl('organizer');
    void loadSummariesAndBundle(activeTournamentId);
  };

  if (viewMode === 'public') {
    return (
      <PublicTournamentView
        slugOrId={targetSlugOrId}
        onExitToWorkspace={handleExitToOrganizer}
        onOpenTv={(id) => handleOpenTv(id)}
      />
    );
  }

  if (viewMode === 'tv') {
    return (
      <BigScreenTVView
        tournamentId={targetSlugOrId}
        onExit={handleExitToOrganizer}
      />
    );
  }

  if (viewMode === 'referee') {
    return (
      <RefereePortalView
        initialTournamentId={targetSlugOrId || undefined}
        initialPin={refereePinParam}
        onExitToWorkspace={handleExitToOrganizer}
      />
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F7F9F8] flex items-center justify-center p-6 text-sm font-medium text-slate-600">
        Memuat SmashPoint Workspace...
      </div>
    );
  }

  const safeSetBundle = (next: TournamentBundle | null) => {
    if (next && !next.tournament?.id) return;
    setBundle(next);
  };

  return (
    <>
      <OrganizerWorkspace
        summaries={summaries}
        bundle={bundle?.tournament ? bundle : null}
        section={section}
        onChangeSection={setSection}
        onSelectTournament={(id) => {
          setActiveTournamentId(id);
          void loadSummariesAndBundle(id);
        }}
        onBundleUpdated={(updated) => safeSetBundle(updated)}
        onRefreshSummaries={async () => {
          const list = await fetchTournamentSummaries();
          setSummaries(list);
        }}
        onOpenWizard={() => setShowWizard(true)}
        onOpenQr={() => setShowQrModal(true)}
        onOpenPublic={() => handleOpenPublic()}
        onOpenTv={() => handleOpenTv()}
        onOpenRefereePortal={handleOpenReferee}
        isOnline={isOnline}
        wsConnected={wsConnected}
      />

      <TournamentWizardModal
        open={showWizard}
        onClose={() => setShowWizard(false)}
        onCreated={(created) => {
          if (!created?.tournament?.id) return;
          setActiveTournamentId(created.tournament.id);
          safeSetBundle(created);
          void fetchTournamentSummaries().then(setSummaries);
        }}
        onOpenQrModal={(created) => {
          if (!created?.tournament?.id) return;
          setActiveTournamentId(created.tournament.id);
          safeSetBundle(created);
          setShowWizard(false);
          setShowQrModal(true);
        }}
      />

      {bundle?.tournament && (
        <QrCodeModal
          open={showQrModal}
          onClose={() => setShowQrModal(false)}
          tournamentId={bundle.tournament.id}
          tournamentSlug={bundle.tournament.slug}
          tournamentName={bundle.tournament.name}
          refereePin={bundle.tournament.refereePin}
          onOpenPublic={() => handleOpenPublic(bundle.tournament.slug)}
          onOpenTv={() => handleOpenTv(bundle.tournament.id)}
        />
      )}
    </>
  );
}
