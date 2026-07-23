import React, { useEffect, useState } from 'react';
import { Smartphone, RefreshCw, Copy, Check, Clock, AlertTriangle, XCircle } from 'lucide-react';
import { SmsActivation } from '../types';

interface SmsActivationViewerProps {
  activationId: string;
}

export const SmsActivationViewer: React.FC<SmsActivationViewerProps> = ({ activationId }) => {
  const [activation, setActivation] = useState<SmsActivation | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchStatus = async () => {
    try {
      const res = await fetch(`/api/activations/${activationId}/poll`);
      if (res.ok) {
        const data = await res.json();
        setActivation(data.activation || null);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();

    // Auto poll every 3 seconds if status is WAITING_CODE
    const interval = setInterval(() => {
      if (activation?.status === 'WAITING_CODE' || !activation) {
        fetchStatus();
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [activationId, activation?.status]);

  const handleCopyCode = () => {
    if (activation?.sms_code) {
      navigator.clipboard.writeText(activation.sms_code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleCancel = async () => {
    if (!window.confirm('Batalkan aktivasi nomor ini?')) return;
    await fetch(`/api/activations/${activationId}/cancel`, { method: 'POST' });
    fetchStatus();
  };

  if (loading && !activation) {
    return (
      <div className="p-4 bg-slate-900/60 border border-slate-800 rounded-2xl animate-pulse text-xs text-slate-400 flex items-center gap-2">
        <RefreshCw className="w-4 h-4 animate-spin" /> Memuat data nomor HeroSMS...
      </div>
    );
  }

  if (!activation) return null;

  return (
    <div className="glass-card rounded-2xl p-5 border border-purple-900/40 relative">
      <div className="flex items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-purple-500/10 text-purple-400 border border-purple-500/20">
            <Smartphone className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-400">Aktivasi HeroSMS OTP</span>
            <h4 className="text-base font-extrabold text-white tracking-wide font-mono">
              {activation.herosms_phone}
            </h4>
          </div>
        </div>

        <div>
          {activation.status === 'WAITING_CODE' && (
            <span className="px-3 py-1 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-300 border border-amber-500/20 flex items-center gap-1.5 animate-pulse-ring">
              <Clock className="w-3.5 h-3.5 animate-spin" /> Menunggu SMS...
            </span>
          )}
          {activation.status === 'RECEIVED' && (
            <span className="px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 flex items-center gap-1.5">
              <Check className="w-3.5 h-3.5 text-emerald-400" /> SMS Diterima
            </span>
          )}
          {activation.status === 'CANCELLED' && (
            <span className="px-3 py-1 rounded-full text-xs font-semibold bg-rose-500/10 text-rose-300 border border-rose-500/20 flex items-center gap-1.5">
              <XCircle className="w-3.5 h-3.5" /> Dibatalkan
            </span>
          )}
        </div>
      </div>

      {activation.status === 'RECEIVED' && activation.sms_code ? (
        <div className="bg-emerald-950/40 border border-emerald-800/60 rounded-2xl p-4 mb-3 flex items-center justify-between">
          <div>
            <span className="text-[10px] text-emerald-400 uppercase font-bold tracking-wider block">Kode OTP / Verification Code</span>
            <span className="text-2xl font-black text-white font-mono tracking-widest">
              {activation.sms_code}
            </span>
            {activation.sms_text && (
              <p className="text-xs text-slate-300 mt-1 italic font-sans">
                "{activation.sms_text}"
              </p>
            )}
          </div>

          <button
            onClick={handleCopyCode}
            className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-1.5 transition-all shadow-md"
          >
            {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            <span>{copied ? 'Tersalin!' : 'Salin OTP'}</span>
          </button>
        </div>
      ) : activation.status === 'WAITING_CODE' ? (
        <div className="bg-slate-950/60 rounded-2xl p-4 border border-slate-800 flex items-center justify-between text-xs">
          <span className="text-slate-400">
            Sistem otomatis mengecek SMS masuk setiap 3 detik. Silakan kirimkan SMS OTP ke nomor di atas.
          </span>
          <button
            onClick={handleCancel}
            className="px-3 py-1.5 rounded-lg bg-rose-950 text-rose-300 border border-rose-800 hover:bg-rose-900 transition-all shrink-0 ml-3"
          >
            Batalkan
          </button>
        </div>
      ) : null}
    </div>
  );
};
