import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Wallet, ArrowLeft, Zap, History, AlertCircle, ArrowRight, QrCode, Clock, RefreshCw, CheckCircle2, AlertTriangle } from 'lucide-react';

interface CreditTransaction {
  id: string;
  type: string;
  amount: number;
  description?: string | null;
  created_at: string;
}

interface ActiveTopup {
  topupId: string;
  amount: number;
  qrImageUrl: string;
  qrString?: string;
  expiresAt?: string;
}

export const TopupPage: React.FC = () => {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();

  const [balance, setBalance] = useState<number>(0);
  const [amount, setAmount] = useState<string>('');
  const [transactions, setTransactions] = useState<CreditTransaction[]>([]);
  const [loadingBalance, setLoadingBalance] = useState(true);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTopup, setActiveTopup] = useState<ActiveTopup | null>(null);
  const [topupTimeLeft, setTopupTimeLeft] = useState<number>(300);
  const [topupSuccess, setTopupSuccess] = useState(false);

  const presets = [25000, 50000, 100000, 200000];

  useEffect(() => {
    if (!authLoading && !user) {
      navigate(`/masuk?next=${encodeURIComponent('/topup')}`);
    }
  }, [user, authLoading, navigate]);

  useEffect(() => {
    if (user) {
      fetchBalance();
      fetchHistory();
    }
  }, [user]);

  const fetchBalance = async () => {
    try {
      const res = await fetch('/api/credits/balance');
      if (res.ok) {
        const data = (await res.json()) as any;
        setBalance(data.balance ?? 0);
      }
    } catch {
      // silently fail
    } finally {
      setLoadingBalance(false);
    }
  };

  const fetchHistory = async () => {
    try {
      const res = await fetch('/api/credits/history?limit=10');
      if (res.ok) {
        const data = (await res.json()) as any;
        setTransactions(data.transactions || []);
      }
    } catch {
      // silently fail
    } finally {
      setLoadingHistory(false);
    }
  };

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(price);
  };

  const formatTopupTimer = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  useEffect(() => {
    if (!activeTopup || topupSuccess) return;

    const timer = window.setInterval(() => {
      setTopupTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    const pollInterval = window.setInterval(async () => {
      try {
        const res = await fetch(`/api/credits/topup/${encodeURIComponent(activeTopup.topupId)}/status`);
        if (res.ok) {
          const statusData = (await res.json()) as any;
          if (statusData.status === 'paid') {
            setTopupSuccess(true);
            void fetchBalance();
            void fetchHistory();
          }
        }
      } catch {
        // silent polling error
      }
    }, 3000);

    return () => {
      window.clearInterval(timer);
      window.clearInterval(pollInterval);
    };
  }, [activeTopup?.topupId, topupSuccess]);

  const handleTopup = async () => {
    const topupAmount = Number(amount);
    if (!topupAmount || topupAmount < 10000) {
      setError('Minimum topup adalah Rp 10.000');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch('/api/credits/topup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: topupAmount })
      });

      const resText = await res.text();
      let data: any = {};
      try {
        data = JSON.parse(resText);
      } catch {
        throw new Error(resText || `Topup gagal (HTTP ${res.status})`);
      }

      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Topup gagal');
      }

      setActiveTopup({
        topupId: data.topupId,
        amount: data.amount || topupAmount,
        qrImageUrl: data.qrImageUrl || `/api/credits/topup/${data.topupId}/qr`,
        qrString: data.qrString,
        expiresAt: data.expiresAt
      });
      setTopupTimeLeft(300);
      setTopupSuccess(false);
      setAmount('');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (authLoading) {
    return (
      <main className="max-w-4xl mx-auto py-8 px-4 text-center text-slate-400 text-sm">
        Memuat...
      </main>
    );
  }

  if (!user) return null;

  return (
      <main className="mx-auto w-full max-w-4xl space-y-5 px-4 py-5 pb-safe sm:space-y-6 sm:py-8 lg:px-8">
      {/* Header */}
      <div className="flex items-center gap-3 mb-2">
        <button
          onClick={() => navigate(-1)}
          className="p-2.5 min-h-[44px] min-w-[44px] rounded-xl bg-slate-900 border border-slate-800 text-slate-400 hover:text-white flex items-center justify-center focus-visible:ring-2 focus-visible:ring-indigo-500"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-xl sm:text-2xl font-extrabold text-white flex items-center gap-2">
          <Wallet className="w-6 h-6 text-indigo-400" />
          <span>Topup Kredit</span>
        </h1>
      </div>

      {error && (
        <div className="p-4 bg-rose-950/40 border border-rose-800/60 rounded-2xl text-xs text-rose-300 flex items-center gap-2">
          <AlertCircle className="w-5 h-5 text-rose-400 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Topup Form */}
        <div className="lg:col-span-2 space-y-5">
          {/* Balance Card */}
          <div className="glass-panel rounded-3xl border border-slate-800 p-4 sm:p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-slate-400 mb-1">Saldo Kredit Anda</p>
                <p className="text-2xl sm:text-3xl font-black text-emerald-400">
                  {loadingBalance ? '...' : formatPrice(balance)}
                </p>
              </div>
              <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center">
                <Wallet className="w-7 h-7" />
              </div>
            </div>
          </div>

          {/* Active QRIS Payment or Amount Input */}
          {activeTopup ? (
            <div className="glass-panel space-y-5 rounded-3xl border border-indigo-500/40 bg-indigo-950/20 p-5 sm:p-6">
              {topupSuccess ? (
                <div className="py-6 text-center space-y-4">
                  <div className="w-16 h-16 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 mx-auto flex items-center justify-center animate-bounce">
                    <CheckCircle2 className="w-10 h-10" />
                  </div>
                  <div>
                    <h3 className="text-xl font-extrabold text-white">Topup Berhasil!</h3>
                    <p className="text-xs text-slate-300 mt-1">
                      Saldo sebesar <strong className="text-emerald-400">{formatPrice(activeTopup.amount)}</strong> telah ditambahkan ke akun Anda.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setActiveTopup(null);
                      setTopupSuccess(false);
                    }}
                    className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-indigo-600 px-6 py-2.5 text-xs font-bold text-white hover:bg-indigo-500 shadow-lg shadow-indigo-600/30"
                  >
                    Selesai & Topup Lagi
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-indigo-900/50 pb-3">
                    <div className="flex items-center gap-2">
                      <QrCode className="w-5 h-5 text-indigo-400" />
                      <div>
                        <h4 className="text-sm font-extrabold text-white">Scan QRIS Topup</h4>
                        <p className="text-[11px] text-slate-400">DANA, GoPay, OVO, ShopeePay, BCA, dll</p>
                      </div>
                    </div>
                    {topupTimeLeft > 0 && (
                      <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-900 border border-amber-500/30 text-amber-300 text-xs font-mono font-bold">
                        <Clock className="w-3.5 h-3.5 text-amber-400" />
                        <span>{formatTopupTimer(topupTimeLeft)}</span>
                      </div>
                    )}
                  </div>

                  <div className="flex flex-col items-center justify-center space-y-4 py-2">
                    <div className="relative bg-white p-3 rounded-2xl shadow-xl border-2 border-indigo-500/30">
                      <img
                        src={activeTopup.qrImageUrl}
                        alt="QRIS Topup"
                        className="w-52 h-52 sm:w-60 sm:h-60 object-contain rounded-lg"
                      />
                      {topupTimeLeft === 0 && (
                        <div className="absolute inset-0 bg-slate-950/85 backdrop-blur-xs rounded-2xl flex flex-col items-center justify-center p-4 text-center">
                          <AlertTriangle className="w-8 h-8 text-amber-400 mb-2" />
                          <span className="text-xs font-bold text-white mb-1">QRIS Kedaluwarsa</span>
                          <button
                            type="button"
                            onClick={() => setActiveTopup(null)}
                            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow-lg"
                          >
                            <RefreshCw className="w-3.5 h-3.5" />
                            Buat Topup Baru
                          </button>
                        </div>
                      )}
                    </div>

                    <div className="text-center space-y-1">
                      <span className="text-xs text-slate-400">Nominal Topup:</span>
                      <p className="text-2xl sm:text-3xl font-black text-emerald-400">
                        {formatPrice(activeTopup.amount)}
                      </p>
                    </div>

                    <div className="flex items-center justify-center gap-2 text-xs text-indigo-300 py-1">
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Menunggu pembayaran... Saldo otomatis bertambah.</span>
                    </div>

                    <button
                      type="button"
                      onClick={() => setActiveTopup(null)}
                      className="text-xs text-slate-400 hover:text-white underline pt-1"
                    >
                      Batalkan Topup
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            /* Amount Input */
            <div className="glass-panel space-y-4 rounded-3xl border border-slate-800 p-4 sm:p-6">
              <h3 className="text-base font-extrabold text-white">Masukkan Jumlah Topup</h3>

              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm font-bold text-slate-400">Rp</span>
                <input
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="10000"
                  min={10000}
                  className="w-full bg-slate-900/90 border border-slate-800 rounded-xl pl-12 pr-4 min-h-[52px] text-lg font-bold text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/30 transition-all"
                />
              </div>

              <p className="text-xs text-slate-500">Minimum topup: Rp 10.000</p>

              {/* Preset Buttons */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {presets.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setAmount(String(preset))}
                    className={`p-3 min-h-[44px] rounded-xl border text-xs font-bold flex items-center justify-center gap-1 transition-all ${
                      Number(amount) === preset
                        ? 'border-indigo-500 bg-indigo-500/10 text-indigo-300'
                        : 'border-slate-800 bg-slate-900 text-slate-400 hover:border-slate-700 hover:text-slate-200'
                    }`}
                  >
                    <Zap className="w-3.5 h-3.5" />
                    {formatPrice(preset)}
                  </button>
                ))}
              </div>

              <button
                onClick={handleTopup}
                disabled={submitting || !amount || Number(amount) < 10000}
                className="w-full min-h-[44px] py-3.5 rounded-xl bg-gradient-to-r from-indigo-600 to-emerald-500 hover:from-indigo-500 hover:to-emerald-400 text-white font-extrabold text-sm shadow-lg shadow-indigo-600/20 transition-all flex items-center justify-center gap-2 disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-indigo-500"
              >
                {submitting ? 'Memproses...' : 'Topup via QRIS'}
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>

        {/* Transaction History */}
        <div className="glass-panel h-fit space-y-4 rounded-3xl border border-slate-800 p-4 sm:p-6">
          <h3 className="text-base font-extrabold text-white flex items-center gap-2">
            <History className="w-4 h-4 text-indigo-400" />
            Riwayat Transaksi
          </h3>

          {loadingHistory ? (
            <p className="text-xs text-slate-500">Memuat...</p>
          ) : transactions.length === 0 ? (
            <p className="text-xs text-slate-500">Belum ada transaksi kredit.</p>
          ) : (
            <div className="space-y-2 max-h-[400px] overflow-y-auto">
              {transactions.map((txn) => (
                <div
                  key={txn.id}
                  className="p-3 bg-slate-900/60 rounded-xl border border-slate-800/60 flex items-center justify-between gap-2"
                >
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-slate-200 truncate">
                      {txn.type === 'topup' ? 'Topup' : txn.type === 'debit' ? 'Pembayaran' : 'Pengembalian Dana'}
                    </p>
                    <p className="text-[10px] text-slate-500 truncate">
                      {txn.description || txn.id}
                    </p>
                    <p className="text-[10px] text-slate-600">
                      {new Date(txn.created_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                  <span className={`text-xs font-black shrink-0 ${
                    txn.type === 'debit' ? 'text-rose-400' : 'text-emerald-400'
                  }`}>
                    {txn.type === 'debit' ? '-' : '+'}{formatPrice(txn.amount)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </main>
  );
};
