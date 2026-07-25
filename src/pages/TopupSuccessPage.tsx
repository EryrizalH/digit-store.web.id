// ponytail: TopupSuccessPage shown after successful Sumopod QRIS payment redirect
import React from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle, Wallet, ArrowRight } from 'lucide-react';

export const TopupSuccessPage: React.FC = () => {
  return (
    <main className="max-w-md mx-auto py-12 px-4 text-center space-y-6">
      <div className="glass-panel rounded-3xl p-10 border border-slate-800 space-y-5">
        <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center mx-auto">
          <CheckCircle className="w-8 h-8" />
        </div>

        <h1 className="text-xl font-extrabold text-white">Topup Berhasil!</h1>
        <p className="text-sm text-slate-400">
          Pembayaran Anda telah diterima. Saldo kredit akan segera diperbarui setelah konfirmasi pembayaran.
        </p>

        <div className="flex flex-col gap-3 pt-2">
          <Link
            to="/topup"
            className="inline-flex items-center justify-center gap-2 px-6 py-3 min-h-[44px] rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition-all shadow-md"
          >
            <Wallet className="w-4 h-4" />
            Cek Saldo
            <ArrowRight className="w-4 h-4" />
          </Link>
          <Link
            to="/"
            className="text-xs text-slate-400 hover:text-slate-200 transition-colors"
          >
            Kembali ke Katalog
          </Link>
        </div>
      </div>
    </main>
  );
};
