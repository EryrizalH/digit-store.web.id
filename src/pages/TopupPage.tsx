// ponytail: TopupPage for credit topup via Sumopod QRIS with balance display, presets, and transaction history
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Wallet, ArrowLeft, Zap, History, AlertCircle, ArrowRight } from 'lucide-react';

interface CreditTransaction {
  id: string;
  type: string;
  amount: number;
  description?: string | null;
  created_at: string;
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

      const data = (await res.json()) as any;

      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Topup gagal');
      }

      if (data.redirectUrl && data.redirectUrl.startsWith('http')) {
        window.location.href = data.redirectUrl;
      } else {
        // If no redirect URL (mock mode), refresh balance
        await fetchBalance();
        await fetchHistory();
        setAmount('');
      }
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
    <main className="max-w-4xl mx-auto py-6 sm:py-8 px-4 lg:px-8 space-y-6 pb-safe">
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
          <div className="glass-panel rounded-3xl p-6 border border-slate-800">
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

          {/* Amount Input */}
          <div className="glass-panel rounded-3xl p-6 border border-slate-800 space-y-4">
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
        </div>

        {/* Transaction History */}
        <div className="glass-panel rounded-3xl p-6 border border-slate-800 h-fit space-y-4">
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
                      {txn.type === 'topup' ? 'Topup' : txn.type === 'debit' ? 'Pembayaran' : 'Refund'}
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
