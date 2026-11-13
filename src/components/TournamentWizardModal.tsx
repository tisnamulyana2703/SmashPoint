import { useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  Plus,
  QrCode,
  Sparkles,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import type {
  CategoryType,
  CompetitionFormat,
  ScoringPreset,
  ScoringRule,
  TournamentBundle,
} from '../shared/types';
import { CATEGORY_LABELS, getScoringRuleForPreset } from '../shared/engine';
import { apiRequest } from '../lib/api';

interface WizardCategoryDraft {
  tempId: string;
  type: CategoryType;
  name: string;
  format: CompetitionFormat;
  groupCount: number;
  advancePerGroup: number;
  groupDrawMode: 'random' | 'manual';
  knockoutDrawMode: 'random' | 'seeded';
  thirdPlaceMatch: boolean;
  participants: Array<{ name: string; clubOrTeam: string }>;
}

interface TournamentWizardModalProps {
  open: boolean;
  onClose: () => void;
  onCreated: (bundle: TournamentBundle) => void;
  onOpenQrModal: (bundle: TournamentBundle) => void;
}

const STEP_TITLES = [
  'Informasi Turnamen',
  'Pilih Kategori',
  'Tambah Peserta',
  'Format Kompetisi',
  'Aturan Skor',
  'Generate Pertandingan',
  'Publikasikan Turnamen',
];

const SAMPLE_SINGLES = [
  'Andi Wijaya · PB Jaya',
  'Budi Santoso · PB Djarum',
  'Candra Putra · PB Exist',
  'Deni Kurniawan · PB Tangkas',
  'Eko Prasetyo · PB Mutiara',
  'Fajar Nugraha · PB Victory',
  'Gilang Pratama · PB Mansion',
  'Hendra Setiawan · PB Candra',
];

const SAMPLE_DOUBLES = [
  'Rama / Bagas · PB Jaya',
  'Aldi / Kevin · PB Djarum',
  'Surya / Dimas · PB Exist',
  'Riko / Yoga · PB Tangkas',
  'Bima / Galih · PB Mutiara',
  'Fikri / Naufal · PB Victory',
];

export function TournamentWizardModal({
  open,
  onClose,
  onCreated,
  onOpenQrModal,
}: TournamentWizardModalProps) {
  const today = new Date().toISOString().slice(0, 10);
  const [step, setStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  // Step 1
  const [name, setName] = useState('');
  const [location, setLocation] = useState('');
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [courtsInput, setCourtsInput] = useState('Lapangan 1, Lapangan 2, Lapangan 3');

  // Step 2 & 3 & 4
  const [categories, setCategories] = useState<WizardCategoryDraft[]>([
    {
      tempId: 'cat_1',
      type: 'mens_singles',
      name: 'Tunggal Putra',
      format: 'group_knockout',
      groupCount: 2,
      advancePerGroup: 2,
      groupDrawMode: 'random',
      knockoutDrawMode: 'seeded',
      thirdPlaceMatch: true,
      participants: [],
    },
  ]);
  const [activeCatIndex, setActiveCatIndex] = useState(0);
  const [singleName, setSingleName] = useState('');
  const [singleClub, setSingleClub] = useState('');
  const [bulkText, setBulkText] = useState('');
  const [showBulkImport, setShowBulkImport] = useState(false);

  // Step 5
  const [preset, setPreset] = useState<ScoringPreset>('standard');
  const [scoringRule, setScoringRule] = useState<ScoringRule>(() =>
    getScoringRuleForPreset('standard')
  );

  // Step 6
  const [startTime, setStartTime] = useState('09:00');
  const [createdBundle, setCreatedBundle] = useState<TournamentBundle | null>(null);

  if (!open) return null;

  const activeCategory = categories[activeCatIndex] ?? categories[0];

  const handleToggleCategoryType = (type: CategoryType) => {
    const existingIdx = categories.findIndex((c) => c.type === type);
    if (existingIdx !== -1) {
      if (categories.length === 1) return;
      const next = categories.filter((c) => c.type !== type);
      setCategories(next);
      setActiveCatIndex(0);
    } else {
      setCategories([
        ...categories,
        {
          tempId: `cat_${Date.now()}_${type}`,
          type,
          name: CATEGORY_LABELS[type],
          format: 'knockout',
          groupCount: 2,
          advancePerGroup: 2,
          groupDrawMode: 'random',
          knockoutDrawMode: 'random',
          thirdPlaceMatch: true,
          participants: [],
        },
      ]);
    }
  };

  const updateActiveCategory = (patch: Partial<WizardCategoryDraft>) => {
    setCategories((prev) =>
      prev.map((c, idx) => (idx === activeCatIndex ? { ...c, ...patch } : c))
    );
  };

  const handleAddSingleParticipant = () => {
    if (!singleName.trim() || !activeCategory) return;
    updateActiveCategory({
      participants: [
        ...activeCategory.participants,
        { name: singleName.trim(), clubOrTeam: singleClub.trim() || 'Mandiri' },
      ],
    });
    setSingleName('');
    setSingleClub('');
  };

  const handleImportBulk = () => {
    if (!bulkText.trim() || !activeCategory) return;
    const lines = bulkText
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    const parsed = lines.map((line) => {
      const parts = line.split(/[,\t|·;]/).map((s) => s.trim());
      return {
        name: parts[0] || line,
        clubOrTeam: parts[1] || 'Mandiri',
      };
    });
    updateActiveCategory({
      participants: [...activeCategory.participants, ...parsed],
    });
    setBulkText('');
    setShowBulkImport(false);
  };

  const handleFillSampleParticipants = () => {
    if (!activeCategory) return;
    const isDoubles = activeCategory.type.includes('doubles');
    const source = isDoubles ? SAMPLE_DOUBLES : SAMPLE_SINGLES;
    const parsed = source.map((line) => {
      const [pName, pClub] = line.split('·').map((s) => s.trim());
      return { name: pName, clubOrTeam: pClub || 'Mandiri' };
    });
    updateActiveCategory({
      participants: [...activeCategory.participants, ...parsed],
    });
  };

  const handlePresetChange = (nextPreset: ScoringPreset) => {
    setPreset(nextPreset);
    setScoringRule(getScoringRuleForPreset(nextPreset));
  };

  const handleNext = () => {
    setError('');
    if (step === 1) {
      if (!name.trim()) {
        setError('Masukkan nama turnamen terlebih dahulu.');
        return;
      }
    }
    if (step === 3) {
      const hasEnough = categories.every((c) => c.participants.length >= 2);
      if (!hasEnough) {
        setError('Setiap kategori membutuhkan minimal 2 peserta agar pertandingan dapat dibuat.');
        return;
      }
    }
    setStep((s) => Math.min(7, s + 1));
  };

  const handleGenerateAndPublish = async () => {
    setError('');
    setSubmitting(true);
    try {
      const courts = courtsInput
        .split(',')
        .map((c) => c.trim())
        .filter(Boolean);

      const bundle = await apiRequest<TournamentBundle>('/api/tournaments', {
        method: 'POST',
        body: JSON.stringify({
          name: name.trim(),
          location: location.trim() || 'GOR Utama',
          startDate,
          endDate: endDate || startDate,
          courts,
          status: 'published',
          defaultScoringRule: scoringRule,
          autoGenerate: true,
          autoSchedule: true,
          startTime,
          categories: categories.map((c) => ({
            name: c.name,
            type: c.type,
            format: c.format,
            groupConfig: {
              groupCount: c.groupCount,
              advancePerGroup: c.advancePerGroup,
              drawMode: c.groupDrawMode,
              tieBreakOrder: ['wins', 'head_to_head', 'game_diff', 'point_diff', 'points_for'],
            },
            knockoutConfig: {
              drawMode: c.knockoutDrawMode,
              thirdPlaceMatch: c.thirdPlaceMatch,
            },
            scoringRule,
            participants: c.participants,
          })),
        }),
      });
      setCreatedBundle(bundle);
      setStep(7);
      onCreated(bundle);
    } catch (err) {
      setError((err as Error).message || 'Gagal membuat turnamen.');
    } finally {
      setSubmitting(false);
    }
  };

  const resetAndClose = () => {
    setStep(1);
    setCreatedBundle(null);
    setError('');
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#152238]/65 backdrop-blur-xs p-3 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label="Wizard Buat Turnamen Baru"
    >
      <div className="w-full max-w-4xl max-h-[92vh] flex flex-col rounded-2xl bg-white border border-[#E2E8E5] shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#E2E8E5] bg-[#F7F9F8]">
          <div>
            <div className="text-xs font-medium text-[#167D54]">
              Langkah {step} dari 7 · {STEP_TITLES[step - 1]}
            </div>
            <h2 className="text-xl font-bold text-[#152238] mt-0.5">Buat Turnamen Baru</h2>
          </div>
          <button
            type="button"
            onClick={resetAndClose}
            className="min-w-[40px] min-h-[40px] flex items-center justify-center rounded-xl text-slate-500 hover:bg-white hover:text-[#152238] transition-colors"
            aria-label="Tutup wizard"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Progress Bar */}
        <div className="grid grid-cols-7 gap-1 px-6 py-3 bg-white border-b border-[#E2E8E5]">
          {STEP_TITLES.map((title, idx) => {
            const num = idx + 1;
            const active = num === step;
            const done = num < step;
            return (
              <div key={title} className="flex flex-col gap-1.5">
                <div
                  className={`h-1.5 rounded-full transition-colors ${
                    done ? 'bg-[#167D54]' : active ? 'bg-[#152238]' : 'bg-slate-200'
                  }`}
                />
                <span
                  className={`hidden md:block text-[11px] truncate ${
                    active ? 'font-semibold text-[#152238]' : 'text-slate-400'
                  }`}
                >
                  {num}. {title}
                </span>
              </div>
            );
          })}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {error && (
            <div className="px-4 py-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700">
              {error}
            </div>
          )}

          {/* STEP 1 */}
          {step === 1 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div className="md:col-span-2">
                <label className="block text-sm font-semibold text-[#152238] mb-1.5">
                  Nama Turnamen
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Contoh: Kejuaraan Badminton Pelajar Kota 2026"
                  className="w-full px-4 py-2.5 rounded-xl border border-[#E2E8E5] focus:outline-none focus:ring-2 focus:ring-[#167D54]/30 focus:border-[#167D54]"
                />
              </div>

              <div className="md:col-span-2">
                <label className="block text-sm font-semibold text-[#152238] mb-1.5">
                  Lokasi / GOR Arena
                </label>
                <input
                  type="text"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="Contoh: GOR Cempaka Putih, Jakarta"
                  className="w-full px-4 py-2.5 rounded-xl border border-[#E2E8E5] focus:outline-none focus:ring-2 focus:ring-[#167D54]/30 focus:border-[#167D54]"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-[#152238] mb-1.5">
                  Tanggal Mulai
                </label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl border border-[#E2E8E5] font-mono text-sm"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-[#152238] mb-1.5">
                  Tanggal Selesai
                </label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl border border-[#E2E8E5] font-mono text-sm"
                />
              </div>

              <div className="md:col-span-2">
                <label className="block text-sm font-semibold text-[#152238] mb-1.5">
                  Daftar Lapangan (pisahkan dengan koma)
                </label>
                <input
                  type="text"
                  value={courtsInput}
                  onChange={(e) => setCourtsInput(e.target.value)}
                  placeholder="Lapangan 1, Lapangan 2, Lapangan 3"
                  className="w-full px-4 py-2.5 rounded-xl border border-[#E2E8E5]"
                />
              </div>
            </div>
          )}

          {/* STEP 2 */}
          {step === 2 && (
            <div className="space-y-4">
              <p className="text-sm text-slate-600">
                Pilih kategori pertandingan yang akan dipertandingkan pada turnamen ini.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {(Object.keys(CATEGORY_LABELS) as CategoryType[]).map((type) => {
                  const selected = categories.some((c) => c.type === type);
                  return (
                    <button
                      key={type}
                      type="button"
                      onClick={() => handleToggleCategoryType(type)}
                      className={`p-4 rounded-xl border text-left transition-all flex items-center justify-between ${
                        selected
                          ? 'border-[#167D54] bg-[#167D54]/5 text-[#152238]'
                          : 'border-[#E2E8E5] bg-white text-slate-700 hover:border-slate-300'
                      }`}
                    >
                      <div>
                        <div className="font-semibold text-sm">{CATEGORY_LABELS[type]}</div>
                        <div className="text-xs text-slate-500 mt-0.5">
                          {type.includes('doubles') ? 'Pasangan Ganda' : 'Perorangan Tunggal'}
                        </div>
                      </div>
                      <div
                        className={`w-6 h-6 rounded-lg flex items-center justify-center border ${
                          selected
                            ? 'bg-[#167D54] border-[#167D54] text-white'
                            : 'border-slate-300 bg-white'
                        }`}
                      >
                        {selected && <Check className="w-4 h-4" />}
                      </div>
                    </button>
                  );
                })}
              </div>

              <div className="pt-2 space-y-2">
                <div className="text-xs font-semibold text-slate-500">Nama Kategori Terpilih</div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {categories.map((c, idx) => (
                    <div
                      key={c.tempId}
                      className="flex items-center gap-2 p-2.5 rounded-xl border border-[#E2E8E5] bg-[#F7F9F8]"
                    >
                      <input
                        type="text"
                        value={c.name}
                        onChange={(e) => {
                          const val = e.target.value;
                          setCategories((prev) =>
                            prev.map((item, i) => (i === idx ? { ...item, name: val } : item))
                          );
                        }}
                        className="flex-1 bg-white px-3 py-1.5 text-sm rounded-lg border border-[#E2E8E5]"
                      />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* STEP 3 */}
          {step === 3 && activeCategory && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap gap-1.5 p-1 bg-[#F7F9F8] rounded-xl border border-[#E2E8E5]">
                  {categories.map((c, idx) => (
                    <button
                      key={c.tempId}
                      type="button"
                      onClick={() => setActiveCatIndex(idx)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap ${
                        idx === activeCatIndex
                          ? 'bg-white text-[#152238] border border-[#E2E8E5] shadow-xs'
                          : 'text-slate-600 hover:text-[#152238]'
                      }`}
                    >
                      {c.name} ({c.participants.length})
                    </button>
                  ))}
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleFillSampleParticipants}
                    className="px-3 py-2 rounded-xl border border-[#E2E8E5] bg-white hover:bg-slate-50 text-xs font-semibold text-[#152238] flex items-center gap-1.5 whitespace-nowrap"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-[#167D54]" />
                    Isi Contoh Peserta
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowBulkImport((v) => !v)}
                    className="px-3 py-2 rounded-xl border border-[#E2E8E5] bg-white hover:bg-slate-50 text-xs font-semibold text-[#152238] flex items-center gap-1.5 whitespace-nowrap"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    Impor Massal (Excel/CSV)
                  </button>
                </div>
              </div>

              {showBulkImport && (
                <div className="p-4 rounded-xl bg-[#F7F9F8] border border-[#E2E8E5] space-y-3">
                  <div className="text-xs text-slate-600">
                    Tempel daftar peserta dari Excel/CSV (satu baris per peserta, format:{' '}
                    <span className="font-mono text-[#152238]">Nama Peserta, Klub/Tim</span>).
                  </div>
                  <textarea
                    rows={4}
                    value={bulkText}
                    onChange={(e) => setBulkText(e.target.value)}
                    placeholder={`Andi Wijaya, PB Jaya\nBudi Santoso, PB Djarum`}
                    className="w-full p-3 rounded-xl border border-[#E2E8E5] bg-white text-sm font-mono"
                  />
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setShowBulkImport(false)}
                      className="px-3 py-1.5 text-xs font-semibold text-slate-600"
                    >
                      Batal
                    </button>
                    <button
                      type="button"
                      onClick={handleImportBulk}
                      className="px-4 py-1.5 rounded-lg bg-[#167D54] text-white text-xs font-semibold"
                    >
                      Tambahkan Daftar
                    </button>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5">
                <input
                  type="text"
                  value={singleName}
                  onChange={(e) => setSingleName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleAddSingleParticipant()}
                  placeholder={
                    activeCategory.type.includes('doubles')
                      ? 'Nama Pasangan (mis. Andi / Budi)'
                      : 'Nama Pemain (mis. Rizky Pratama)'
                  }
                  className="sm:col-span-6 px-3.5 py-2.5 rounded-xl border border-[#E2E8E5] text-sm"
                />
                <input
                  type="text"
                  value={singleClub}
                  onChange={(e) => setSingleClub(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleAddSingleParticipant()}
                  placeholder="Klub / Tim (opsional)"
                  className="sm:col-span-4 px-3.5 py-2.5 rounded-xl border border-[#E2E8E5] text-sm"
                />
                <button
                  type="button"
                  onClick={handleAddSingleParticipant}
                  className="sm:col-span-2 min-h-[42px] px-4 py-2 rounded-xl bg-[#152238] hover:bg-[#1e3150] text-white text-sm font-semibold flex items-center justify-center gap-1.5 whitespace-nowrap"
                >
                  <Plus className="w-4 h-4" />
                  Tambah
                </button>
              </div>

              <div className="border border-[#E2E8E5] rounded-xl divide-y divide-[#E2E8E5] max-h-60 overflow-y-auto">
                {activeCategory.participants.length === 0 ? (
                  <div className="p-6 text-center text-sm text-slate-500">
                    Belum ada peserta di kategori {activeCategory.name}. Tambahkan minimal 2 peserta.
                  </div>
                ) : (
                  activeCategory.participants.map((p, pIdx) => (
                    <div
                      key={`${p.name}-${pIdx}`}
                      className="flex items-center justify-between px-4 py-2.5 text-sm"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="font-mono text-xs text-slate-400 w-6 tabular-nums">
                          {pIdx + 1}.
                        </span>
                        <span className="font-medium text-[#152238] truncate">{p.name}</span>
                        <span className="text-xs text-slate-500 truncate">· {p.clubOrTeam}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          updateActiveCategory({
                            participants: activeCategory.participants.filter((_, i) => i !== pIdx),
                          })
                        }
                        className="p-1.5 text-slate-400 hover:text-red-600 rounded-lg"
                        aria-label="Hapus peserta"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* STEP 4 */}
          {step === 4 && activeCategory && (
            <div className="space-y-5">
              <div className="flex flex-wrap gap-1.5 p-1 bg-[#F7F9F8] rounded-xl border border-[#E2E8E5] w-fit">
                {categories.map((c, idx) => (
                  <button
                    key={c.tempId}
                    type="button"
                    onClick={() => setActiveCatIndex(idx)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap ${
                      idx === activeCatIndex
                        ? 'bg-white text-[#152238] border border-[#E2E8E5]'
                        : 'text-slate-600 hover:text-[#152238]'
                    }`}
                  >
                    {c.name}
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {[
                  {
                    id: 'group' as const,
                    title: 'Sistem Grup (Round Robin)',
                    desc: 'Setiap peserta dalam grup saling bertanding. Cocok untuk turnamen komunitas.',
                  },
                  {
                    id: 'knockout' as const,
                    title: 'Sistem Gugur (Knockout)',
                    desc: 'Kalah langsung tersingkir, cepat menuju semifinal & final. Otomatis mendukung Bye.',
                  },
                  {
                    id: 'group_knockout' as const,
                    title: 'Kombinasi Grup + Gugur',
                    desc: 'Fase grup terlebih dahulu, lalu peserta terbaik lolos otomatis ke babak gugur.',
                  },
                ].map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => updateActiveCategory({ format: opt.id })}
                    className={`p-4 rounded-xl border text-left transition-all ${
                      activeCategory.format === opt.id
                        ? 'border-[#167D54] bg-[#167D54]/5'
                        : 'border-[#E2E8E5] bg-white hover:border-slate-300'
                    }`}
                  >
                    <div className="font-bold text-sm text-[#152238]">{opt.title}</div>
                    <p className="text-xs text-slate-600 mt-1.5 leading-relaxed">{opt.desc}</p>
                  </button>
                ))}
              </div>

              {(activeCategory.format === 'group' || activeCategory.format === 'group_knockout') && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 p-4 rounded-xl bg-[#F7F9F8] border border-[#E2E8E5]">
                  <div>
                    <label className="block text-xs font-semibold text-[#152238] mb-1">
                      Jumlah Grup
                    </label>
                    <select
                      value={activeCategory.groupCount}
                      onChange={(e) =>
                        updateActiveCategory({ groupCount: Number(e.target.value) })
                      }
                      className="w-full px-3 py-2 rounded-lg border border-[#E2E8E5] bg-white text-sm"
                    >
                      <option value={2}>2 Grup</option>
                      <option value={4}>4 Grup</option>
                      <option value={8}>8 Grup</option>
                      <option value={1}>1 Grup</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-[#152238] mb-1">
                      Lolos per Grup
                    </label>
                    <select
                      value={activeCategory.advancePerGroup}
                      onChange={(e) =>
                        updateActiveCategory({ advancePerGroup: Number(e.target.value) })
                      }
                      className="w-full px-3 py-2 rounded-lg border border-[#E2E8E5] bg-white text-sm"
                    >
                      <option value={1}>1 Terbaik</option>
                      <option value={2}>2 Terbaik</option>
                      <option value={3}>3 Terbaik</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-[#152238] mb-1">
                      Pembagian Grup
                    </label>
                    <select
                      value={activeCategory.groupDrawMode}
                      onChange={(e) =>
                        updateActiveCategory({
                          groupDrawMode: e.target.value as 'random' | 'manual',
                        })
                      }
                      className="w-full px-3 py-2 rounded-lg border border-[#E2E8E5] bg-white text-sm"
                    >
                      <option value="random">Acak Otomatis</option>
                      <option value="manual">Sesuai Urutan Daftar</option>
                    </select>
                  </div>
                </div>
              )}

              {(activeCategory.format === 'knockout' ||
                activeCategory.format === 'group_knockout') && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 rounded-xl bg-[#F7F9F8] border border-[#E2E8E5]">
                  <div>
                    <label className="block text-xs font-semibold text-[#152238] mb-1">
                      Undian Bracket Gugur
                    </label>
                    <select
                      value={activeCategory.knockoutDrawMode}
                      onChange={(e) =>
                        updateActiveCategory({
                          knockoutDrawMode: e.target.value as 'random' | 'seeded',
                        })
                      }
                      className="w-full px-3 py-2 rounded-lg border border-[#E2E8E5] bg-white text-sm"
                    >
                      <option value="seeded">Seeded Draw (Unggulan Terpisah)</option>
                      <option value="random">Random Draw (Acak Penuh)</option>
                    </select>
                  </div>
                  <div className="flex items-center pt-4">
                    <label className="flex items-center gap-2.5 text-sm font-medium text-[#152238] cursor-pointer">
                      <input
                        type="checkbox"
                        checked={activeCategory.thirdPlaceMatch}
                        onChange={(e) =>
                          updateActiveCategory({ thirdPlaceMatch: e.target.checked })
                        }
                        className="w-4 h-4 accent-[#167D54]"
                      />
                      Sertakan Perebutan Juara Ketiga
                    </label>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* STEP 5 */}
          {step === 5 && (
            <div className="space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => handlePresetChange('standard')}
                  className={`p-4 rounded-xl border text-left transition-all ${
                    preset === 'standard'
                      ? 'border-[#167D54] bg-[#167D54]/5 ring-1 ring-[#167D54]/20'
                      : 'border-[#E2E8E5] bg-white hover:border-slate-300'
                  }`}
                >
                  <div className="font-bold text-sm text-[#152238]">
                    Mode 1 · Rally Poin (21 Poin)
                  </div>
                  <div className="text-xs text-slate-600 mt-1">
                    Berakhir pada 21 poin per set (batas 30). Setiap reli menghasilkan poin langsung.
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => handlePresetChange('classic')}
                  className={`p-4 rounded-xl border text-left transition-all ${
                    preset === 'classic'
                      ? 'border-[#167D54] bg-[#167D54]/5 ring-1 ring-[#167D54]/20'
                      : 'border-[#E2E8E5] bg-white hover:border-slate-300'
                  }`}
                >
                  <div className="font-bold text-sm text-[#152238]">
                    Mode 2 · Klasik Pindah Bola (15 Poin · 2× Servis)
                  </div>
                  <div className="text-xs text-slate-600 mt-1">
                    Berakhir pada 15 poin per set. Poin hanya didapat saat memegang servis dengan 2 kali kesempatan servis.
                  </div>
                </button>
              </div>

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
                    sub: 'Sesuaikan seluruh parameter skor',
                  },
                ].map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handlePresetChange(item.id)}
                    className={`p-3.5 rounded-xl border text-left transition-all ${
                      preset === item.id
                        ? 'border-[#167D54] bg-[#167D54]/5'
                        : 'border-[#E2E8E5] bg-white hover:border-slate-300'
                    }`}
                  >
                    <div className="font-bold text-xs text-[#152238]">{item.title}</div>
                    <div className="text-xs text-slate-500 mt-0.5">{item.sub}</div>
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 p-4 rounded-xl bg-[#F7F9F8] border border-[#E2E8E5]">
                <div>
                  <label className="block text-xs font-semibold text-[#152238] mb-1">
                    Sistem Poin
                  </label>
                  <select
                    value={scoringRule.scoringSystem ?? 'rally'}
                    onChange={(e) => {
                      const mode = e.target.value as 'rally' | 'classic';
                      setPreset('custom');
                      setScoringRule({
                        ...scoringRule,
                        preset: 'custom',
                        scoringSystem: mode,
                        serviceChances: mode === 'classic' ? 2 : 1,
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
                    value={scoringRule.serviceChances ?? (scoringRule.scoringSystem === 'classic' ? 2 : 1)}
                    onChange={(e) => {
                      setPreset('custom');
                      setScoringRule({
                        ...scoringRule,
                        preset: 'custom',
                        serviceChances: Number(e.target.value),
                      });
                    }}
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
                    value={scoringRule.pointsPerGame}
                    onChange={(e) => {
                      setPreset('custom');
                      setScoringRule({ ...scoringRule, preset: 'custom', pointsPerGame: Number(e.target.value) || 21 });
                    }}
                    className="w-full px-3 py-2 rounded-lg border border-[#E2E8E5] bg-white font-mono text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#152238] mb-1">
                    Batas Poin Maksimal
                  </label>
                  <input
                    type="number"
                    min={scoringRule.pointsPerGame}
                    max={60}
                    value={scoringRule.maxPoints}
                    onChange={(e) => {
                      setPreset('custom');
                      setScoringRule({ ...scoringRule, preset: 'custom', maxPoints: Number(e.target.value) || 30 });
                    }}
                    className="w-full px-3 py-2 rounded-lg border border-[#E2E8E5] bg-white font-mono text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#152238] mb-1">
                    Jumlah Set (Best of)
                  </label>
                  <select
                    value={scoringRule.bestOf}
                    onChange={(e) => {
                      setPreset('custom');
                      setScoringRule({ ...scoringRule, preset: 'custom', bestOf: Number(e.target.value) });
                    }}
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
                    value={scoringRule.minimumLead}
                    onChange={(e) => {
                      setPreset('custom');
                      setScoringRule({ ...scoringRule, preset: 'custom', minimumLead: Number(e.target.value) || 2 });
                    }}
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
                    value={scoringRule.intervalPoints}
                    onChange={(e) => {
                      setPreset('custom');
                      setScoringRule({ ...scoringRule, preset: 'custom', intervalPoints: Number(e.target.value) || 11 });
                    }}
                    className="w-full px-3 py-2 rounded-lg border border-[#E2E8E5] bg-white font-mono text-sm"
                  />
                </div>
                <div className="flex items-center pt-4">
                  <label className="flex items-center gap-2 text-xs font-semibold text-[#152238] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={scoringRule.changeEndsOnInterval}
                      onChange={(e) =>
                        setScoringRule({ ...scoringRule, changeEndsOnInterval: e.target.checked })
                      }
                      className="w-4 h-4 accent-[#167D54]"
                    />
                    Tukar sisi interval
                  </label>
                </div>
              </div>
            </div>
          )}

          {/* STEP 6 */}
          {step === 6 && (
            <div className="space-y-5">
              <div className="p-4 rounded-xl bg-[#F7F9F8] border border-[#E2E8E5] space-y-2">
                <div className="text-base font-bold text-[#152238]">{name}</div>
                <div className="text-xs text-slate-600">
                  {location || 'GOR Utama'} · {startDate} s/d {endDate} · {courtsInput}
                </div>
              </div>

              <div className="border border-[#E2E8E5] rounded-xl divide-y divide-[#E2E8E5]">
                {categories.map((c) => (
                  <div key={c.tempId} className="flex items-center justify-between px-4 py-3 text-sm">
                    <div>
                      <div className="font-semibold text-[#152238]">{c.name}</div>
                      <div className="text-xs text-slate-500">
                        {c.format === 'group'
                          ? `Sistem Grup (${c.groupCount} grup)`
                          : c.format === 'knockout'
                          ? 'Sistem Gugur'
                          : `Kombinasi ${c.groupCount} Grup + Gugur`}
                      </div>
                    </div>
                    <div className="font-mono text-xs font-semibold text-[#167D54] tabular-nums">
                      {c.participants.length} Peserta
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex flex-wrap items-center gap-4 p-4 rounded-xl bg-[#F7F9F8] border border-[#E2E8E5]">
                <div>
                  <label className="block text-xs font-semibold text-[#152238] mb-1">
                    Jam Mulai Jadwal Otomatis
                  </label>
                  <input
                    type="time"
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                    className="px-3 py-2 rounded-lg border border-[#E2E8E5] bg-white font-mono text-sm"
                  />
                </div>
                <div className="text-xs text-slate-600 flex-1">
                  SmashPoint akan membuat seluruh grup, bagan bracket (termasuk slot Bye bila
                  peserta bukan pangkat dua), dan membagi jadwal ke lapangan secara otomatis.
                </div>
              </div>
            </div>
          )}

          {/* STEP 7 */}
          {step === 7 && createdBundle && (
            <div className="py-4 text-center space-y-5">
              <div className="w-14 h-14 mx-auto rounded-2xl bg-[#167D54]/10 text-[#167D54] flex items-center justify-center">
                <CheckCircle2 className="w-8 h-8" />
              </div>
              <div>
                <h3 className="text-2xl font-bold text-[#152238]">
                  Turnamen Siap Digunakan!
                </h3>
                <p className="text-sm text-slate-600 mt-1">
                  {createdBundle.tournament.name} · {createdBundle.matches.filter((m) => !m.isBye).length} Pertandingan dibuat otomatis.
                </p>
              </div>

              <div className="max-w-md mx-auto p-5 rounded-2xl bg-[#152238] text-white space-y-2">
                <div className="text-xs text-slate-300">PIN Wasit Lapangan (Bagikan ke Wasit)</div>
                <div className="font-mono text-3xl font-bold tracking-[0.25em] text-[#C5F36B] tabular-nums">
                  {createdBundle.tournament.refereePin}
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => onOpenQrModal(createdBundle)}
                  className="min-h-[44px] px-5 py-2.5 rounded-xl border border-[#E2E8E5] bg-white hover:bg-slate-50 text-sm font-semibold text-[#152238] flex items-center gap-2"
                >
                  <QrCode className="w-4 h-4 text-[#167D54]" />
                  Lihat QR Code & Tautan Publik
                </button>
                <button
                  type="button"
                  onClick={resetAndClose}
                  className="min-h-[44px] px-6 py-2.5 rounded-xl bg-[#167D54] hover:bg-[#126644] text-sm font-semibold text-white"
                >
                  Masuk ke Dashboard Turnamen
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        {step < 7 && (
          <div className="flex items-center justify-between px-6 py-4 border-t border-[#E2E8E5] bg-[#F7F9F8]">
            <button
              type="button"
              onClick={() => (step === 1 ? resetAndClose() : setStep((s) => s - 1))}
              className="min-h-[42px] px-4 py-2 rounded-xl border border-[#E2E8E5] bg-white hover:bg-slate-50 text-sm font-semibold text-[#152238] flex items-center gap-1.5"
            >
              <ArrowLeft className="w-4 h-4" />
              {step === 1 ? 'Batal' : 'Sebelumnya'}
            </button>

            {step < 6 ? (
              <button
                type="button"
                onClick={handleNext}
                className="min-h-[42px] px-5 py-2 rounded-xl bg-[#152238] hover:bg-[#1e3150] text-sm font-semibold text-white flex items-center gap-1.5"
              >
                Lanjutkan
                <ArrowRight className="w-4 h-4" />
              </button>
            ) : (
              <button
                type="button"
                disabled={submitting}
                onClick={handleGenerateAndPublish}
                className="min-h-[42px] px-6 py-2 rounded-xl bg-[#167D54] hover:bg-[#126644] disabled:opacity-60 text-sm font-semibold text-white flex items-center gap-2"
              >
                {submitting ? 'Membuat Turnamen...' : 'Generate & Publikasikan'}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
