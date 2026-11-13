import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { Check, Copy, Download, ExternalLink, QrCode, X } from 'lucide-react';
import { buildPublicUrl, buildRefereeUrl, buildTvUrl } from '../lib/formatters';

interface QrCodeModalProps {
  open: boolean;
  onClose: () => void;
  tournamentId: string;
  tournamentSlug: string;
  tournamentName: string;
  refereePin?: string;
  onOpenPublic?: () => void;
  onOpenTv?: () => void;
}

export function QrCodeModal({
  open,
  onClose,
  tournamentId,
  tournamentSlug,
  tournamentName,
  refereePin,
  onOpenPublic,
  onOpenTv,
}: QrCodeModalProps) {
  const [targetType, setTargetType] = useState<'public' | 'referee' | 'tv'>('public');
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [copied, setCopied] = useState(false);

  const activeUrl =
    targetType === 'public'
      ? buildPublicUrl(tournamentSlug)
      : targetType === 'referee'
      ? buildRefereeUrl(tournamentId, refereePin)
      : buildTvUrl(tournamentId);

  useEffect(() => {
    if (!open) return;
    let active = true;
    QRCode.toDataURL(activeUrl, {
      width: 320,
      margin: 2,
      color: {
        dark: '#152238',
        light: '#FFFFFF',
      },
    })
      .then((url) => {
        if (active) setQrDataUrl(url);
      })
      .catch(() => {
        if (active) setQrDataUrl('');
      });
    return () => {
      active = false;
    };
  }, [open, activeUrl]);

  if (!open) return null;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(activeUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback ignored
    }
  };

  const handleDownload = () => {
    if (!qrDataUrl) return;
    const link = document.createElement('a');
    link.href = qrDataUrl;
    link.download = `qr-${targetType}-${tournamentSlug}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#152238]/60 backdrop-blur-xs p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Bagikan QR Code Turnamen"
    >
      <div className="w-full max-w-lg rounded-2xl bg-white border border-[#E2E8E5] shadow-xl overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#E2E8E5]">
          <div className="flex items-center gap-2.5">
            <QrCode className="w-5 h-5 text-[#167D54]" />
            <h2 className="text-lg font-bold text-[#152238]">QR Code & Tautan Akses</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="min-w-[40px] min-h-[40px] flex items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-[#152238] transition-colors"
            aria-label="Tutup modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          <div className="text-sm text-slate-600">
            Bagikan akses cepat untuk <span className="font-semibold text-[#152238]">{tournamentName}</span> tanpa perlu instalasi aplikasi.
          </div>

          <div className="grid grid-cols-3 gap-1.5 p-1 bg-[#F7F9F8] rounded-xl border border-[#E2E8E5]">
            <button
              type="button"
              onClick={() => setTargetType('public')}
              className={`px-3 py-2 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap ${
                targetType === 'public'
                  ? 'bg-white text-[#152238] shadow-xs border border-[#E2E8E5]'
                  : 'text-slate-600 hover:text-[#152238]'
              }`}
            >
              Penonton Publik
            </button>
            <button
              type="button"
              onClick={() => setTargetType('referee')}
              disabled={!refereePin}
              className={`px-3 py-2 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap disabled:opacity-40 ${
                targetType === 'referee'
                  ? 'bg-white text-[#152238] shadow-xs border border-[#E2E8E5]'
                  : 'text-slate-600 hover:text-[#152238]'
              }`}
            >
              Wasit (PIN)
            </button>
            <button
              type="button"
              onClick={() => setTargetType('tv')}
              className={`px-3 py-2 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap ${
                targetType === 'tv'
                  ? 'bg-white text-[#152238] shadow-xs border border-[#E2E8E5]'
                  : 'text-slate-600 hover:text-[#152238]'
              }`}
            >
              Layar TV Arena
            </button>
          </div>

          <div className="flex flex-col items-center justify-center py-5 px-4 bg-[#F7F9F8] rounded-xl border border-[#E2E8E5]">
            {qrDataUrl ? (
              <img
                src={qrDataUrl}
                alt={`QR Code ${tournamentName}`}
                className="w-52 h-52 rounded-lg bg-white p-2 border border-[#E2E8E5]"
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className="w-52 h-52 rounded-lg bg-white border border-[#E2E8E5] flex items-center justify-center text-sm text-slate-500">
                Memuat QR Code...
              </div>
            )}

            {targetType === 'referee' && refereePin && (
              <div className="mt-4 text-center">
                <div className="text-xs text-slate-500">PIN Wasit Turnamen</div>
                <div className="mt-1 font-mono text-2xl font-bold tracking-widest text-[#167D54] tabular-nums">
                  {refereePin}
                </div>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            <input
              type="text"
              readOnly
              value={activeUrl}
              className="flex-1 min-w-0 px-3 py-2.5 text-xs font-mono bg-[#F7F9F8] border border-[#E2E8E5] rounded-xl text-slate-700"
            />
            <button
              type="button"
              onClick={handleCopy}
              className="min-h-[42px] px-4 py-2 rounded-xl border border-[#E2E8E5] bg-white hover:bg-slate-50 text-xs font-semibold text-[#152238] flex items-center gap-1.5 whitespace-nowrap shrink-0"
            >
              {copied ? <Check className="w-4 h-4 text-[#167D54]" /> : <Copy className="w-4 h-4" />}
              {copied ? 'Tersalin' : 'Salin'}
            </button>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
            <button
              type="button"
              onClick={handleDownload}
              className="min-h-[42px] px-4 py-2 rounded-xl border border-[#E2E8E5] bg-white hover:bg-slate-50 text-sm font-semibold text-[#152238] flex items-center gap-2 whitespace-nowrap"
            >
              <Download className="w-4 h-4" />
              Unduh QR PNG
            </button>

            {targetType === 'public' && onOpenPublic && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenPublic();
                }}
                className="min-h-[42px] px-5 py-2 rounded-xl bg-[#167D54] hover:bg-[#126644] text-sm font-semibold text-white flex items-center gap-2 whitespace-nowrap"
              >
                <ExternalLink className="w-4 h-4" />
                Buka Halaman Publik
              </button>
            )}

            {targetType === 'tv' && onOpenTv && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenTv();
                }}
                className="min-h-[42px] px-5 py-2 rounded-xl bg-[#152238] hover:bg-[#1e3150] text-sm font-semibold text-white flex items-center gap-2 whitespace-nowrap"
              >
                <ExternalLink className="w-4 h-4" />
                Buka Layar TV
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
