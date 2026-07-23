// ponytail: SMS Activation status viewer supporting polling, cancellation, explicit setStatus=6 completion, and COMPLETED state
import React, { useEffect, useState, useRef } from 'react';
import { Smartphone, RefreshCw, Copy, Check, Clock, AlertTriangle, XCircle, AlertCircle, CheckCircle2 } from 'lucide-react';
import { SmsActivation } from '../types';

interface SmsActivationViewerProps {
  activationId: string;
}

export const SmsActivationViewer: React.FC<SmsActivationViewerProps> = ({ activationId }) => {
  const [activation, setActivation] = useState<SmsActivation | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [completing, setCompleting] = useState(false);
  const isFetchingRef = useRef(false);

  const fetchStatus = async () => {
    if (isFetchingRef.current) return;
    isFetchingRef.current = true;
    try {
      const res = await fetch(`/api/activations/${activationId}/poll`);
      const data = (await res.json()) as any;
      if (res.ok) {
        setError(null);
        setActivation(data.activation || null);
      } else {
        if (data.activation) setActivation(data.activation);
        setError(data.details ? `${data.error}: ${data.details}` : (data.error || 'Gagal mengecek status SMS'));
      }
    } catch (err: any) {
      setError(err.message || 'Gagal terhubung ke server');
    } finally {
      isFetchingRef.current = false;
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
  }, [activationId]);

  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | null = null;

    if (!error && (!activation || activation.status === 'WAITING_CODE')) {
      interval = setInterval(() => {
        fetchStatus();
      }, 3000);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [activationId, activation?.status, error]);

  const handleCopyCode = () => {
    if (activation?.sms_code) {
      navigator.clipboard.writeText(activation.sms_code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleCancel = async () => {
    if (!window.confirm('Batalkan aktivasi nomor ini?')) return;
    setCancelling(true);
    setError(null);
    try {
      const res = await fetch(`/api/activations/${activationId}/cancel`, { method: 'POST' });
      const data = (await res.json()) as any;
      if (!res.ok) {
        setError(data.details ? `${data.error}: ${data.details}` : (data.error || 'Gagal membatalkan aktivasi'));
      } else {
        setError(null);
        await fetchStatus();
      }
    } catch (err: any) {
      setError(err.message || 'Gagal membatalkan aktivasi');
    } finally {
      setCancelling(false);
    }
  };

  const handleComplete = async () => {
    setCompleting(true);
    setError(null);
    try {
      const res = await fetch(`/api/activations/${activationId}/complete`, { method: 'POST' });
      const data = (await res.json()) as any;
      if (!res.ok) {
        setError(data.details ? `${data.error}: ${data.details}` : (data.error || 'Gagal menyelesaikan aktivasi'));
      } else {
        setError(null);
        if (data.activation) {
          setActivation(data.activation);
        } else {
          await fetchStatus();
        }
      }
    } catch (err: any) {
      setError(err.message || 'Gagal menyelesaikan aktivasi');
    } finally {
      setCompleting(false);
    }
  };

  const handleRetry = () => {
    setError(null);
    fetchStatus();
  };

  if (loading && !activation) {
    return (
      <div className="p-4 bg-slate-900/60 border border-slate-800 rounded-2xl animate-pulse text-xs text-slate-400 flex items-center gap-2">
        <RefreshCw className="w-4 h-4 animate-spin" /> Memuat data nomor HeroSMS...
      </div>
    );
  }

  if (!activation && error) {
    return (
      <div className="p-4 bg-rose-950/40 border border-rose-800/60 rounded-2xl text-xs text-rose-300 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" /> {error}
        </div>
        <button
          onClick={handleRetry}
          className="text-[10px] underline hover:text-white shrink-0 font-bold"
        >
          Coba lagi
        </button>
      </div>
    );
  }

  if (!activation) return null;

  return (
    <div className="glass-card rounded-2xl p-5 border border-purple-900/40 relative">
      {error && (
        <div className="mb-4 p-3 bg-rose-950/60 border border-rose-800/60 rounded-xl text-xs text-rose-300 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{error}</span>
          </div>
          <button
            onClick={handleRetry}
            className="text-[10px] underline hover:text-white shrink-0 font-bold"
          >
            Coba lagi
          </button>
        </div>
      )}

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
          {activation.status === 'COMPLETED' && (
            <span className="px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> Selesai
            </span>
          )}
          {activation.status === 'CANCELLED' && (
            <span className="px-3 py-1 rounded-full text-xs font-semibold bg-rose-500/10 text-rose-300 border border-rose-500/20 flex items-center gap-1.5">
              <XCircle className="w-3.5 h-3.5" /> Dibatalkan
            </span>
          )}
          {activation.status === 'TIMEOUT' && (
            <span className="px-3 py-1 rounded-full text-xs font-semibold bg-slate-700/50 text-slate-300 border border-slate-600/40 flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-400" /> Waktu Habis
            </span>
          )}
        </div>
      </div>

      {(activation.status === 'RECEIVED' || activation.status === 'COMPLETED') && activation.sms_code ? (
        <div className="bg-emerald-950/40 border border-emerald-800/60 rounded-2xl p-4 mb-3 space-y-3">
          <div className="flex items-center justify-between">
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

            <div className="flex items-center gap-2">
              <button
                onClick={handleCopyCode}
                className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-1.5 transition-all shadow-md"
              >
                {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                <span>{copied ? 'Tersalin!' : 'Salin OTP'}</span>
              </button>

              {activation.status === 'RECEIVED' && (
                <button
                  onClick={handleComplete}
                  disabled={completing}
                  className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-bold text-xs flex items-center gap-1.5 transition-all shadow-md"
                >
                  <CheckCircle2 className="w-4 h-4 text-emerald-300" />
                  <span>{completing ? 'Memproses...' : 'Selesai'}</span>
                </button>
              )}
            </div>
          </div>
        </div>
      ) : activation.status === 'WAITING_CODE' ? (
        <div className="bg-slate-950/60 rounded-2xl p-4 border border-slate-800 flex items-center justify-between text-xs">
          <span className="text-slate-400">
            Sistem otomatis mengecek SMS masuk setiap 3 detik. Silakan kirimkan SMS OTP ke nomor di atas.
          </span>
          <button
            onClick={handleCancel}
            disabled={cancelling}
            className="px-3 py-1.5 rounded-lg bg-rose-950 text-rose-300 border border-rose-800 hover:bg-rose-900 transition-all shrink-0 ml-3 disabled:opacity-50"
          >
            {cancelling ? 'Membatalkan...' : 'Batalkan'}
          </button>
        </div>
      ) : activation.status === 'TIMEOUT' ? (
        <div className="bg-slate-950/60 rounded-2xl p-4 border border-slate-800 text-xs text-slate-400">
          Aktivasi telah kedaluwarsa (TIMEOUT). Waktu tunggu nomor ini telah habis tanpa menerima SMS.
        </div>
      ) : activation.status === 'CANCELLED' ? (
        <div className="bg-slate-950/60 rounded-2xl p-4 border border-slate-800 text-xs text-slate-400">
          Aktivasi ini telah dibatalkan.
        </div>
      ) : null}
    </div>
  );
};
