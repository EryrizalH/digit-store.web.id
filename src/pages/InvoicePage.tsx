import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Printer, RefreshCw, AlertCircle } from 'lucide-react';
import { Order, OrderItem } from '../types';

interface InvoiceData {
  order: Order;
  items: OrderItem[];
}

export const InvoicePage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<InvoiceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    const load = async () => {
      try {
        const res = await fetch(`/api/orders/${encodeURIComponent(id)}`);
        const payload = (await res.json()) as any;
        if (!res.ok) throw new Error(payload.error || 'Invoice tidak dapat dimuat.');
        setData({ order: payload.order, items: payload.items || [] });
      } catch (err: any) {
        setError(err.message || 'Invoice tidak dapat dimuat.');
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [id]);

  const formatPrice = (price: number) => new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0
  }).format(price);

  if (loading) {
    return <main className="max-w-2xl mx-auto flex-1 py-16 px-4 text-center text-slate-400"><RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-indigo-400" />Memuat invoice...</main>;
  }

  if (error || !data) {
    return (
      <main className="max-w-md mx-auto flex-1 py-16 px-4 text-center">
        <div className="glass-panel rounded-3xl border border-rose-800/50 p-8 space-y-4">
          <AlertCircle className="w-10 h-10 text-rose-400 mx-auto" />
          <h1 className="text-lg font-extrabold text-white">Invoice tidak tersedia</h1>
          <p className="text-xs text-slate-400">{error || 'Data pesanan tidak ditemukan.'}</p>
          <Link to="/pesanan" className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-bold text-white focus-visible:ring-2 focus-visible:ring-indigo-400"><ArrowLeft className="w-4 h-4" /> Kembali ke pesanan</Link>
        </div>
      </main>
    );
  }

  return (
    <main className="max-w-3xl mx-auto flex-1 py-8 px-4 sm:px-6 space-y-4 invoice-page">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link to={`/pesanan/${data.order.id}`} className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-slate-800 bg-slate-900 px-3 py-2 text-xs font-bold text-slate-300 hover:text-white focus-visible:ring-2 focus-visible:ring-indigo-400"><ArrowLeft className="w-4 h-4" /> Kembali</Link>
        <button type="button" onClick={() => window.print()} className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-bold text-white hover:bg-indigo-500 focus-visible:ring-2 focus-visible:ring-indigo-400"><Printer className="w-4 h-4" /> Cetak / Simpan PDF</button>
      </div>

      <article className="invoice-sheet rounded-3xl border border-slate-800 bg-slate-950 p-6 sm:p-10 space-y-8">
        <header className="flex flex-wrap items-start justify-between gap-5 border-b border-slate-800 pb-6">
          <div>
            <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-indigo-300">DigitStore</p>
            <h1 className="mt-2 text-2xl font-black text-white">Invoice Pesanan</h1>
            <p className="mt-1 text-xs text-slate-400">Dokumen digital untuk transaksi Anda.</p>
          </div>
          <div className="text-right text-xs">
            <p className="font-mono font-bold text-white">{data.order.id}</p>
            <p className="mt-1 text-slate-400">{new Date(data.order.created_at).toLocaleString('id-ID')}</p>
            <p className="mt-2 inline-flex rounded-full border border-slate-700 px-2.5 py-1 font-bold uppercase text-slate-200">{data.order.payment_status}</p>
          </div>
        </header>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] text-left text-sm">
            <thead className="border-b border-slate-800 text-xs uppercase tracking-wider text-slate-400">
              <tr><th className="pb-3 pr-4">Produk</th><th className="pb-3 px-4 text-right">Qty</th><th className="pb-3 pl-4 text-right">Harga</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-800/80">
              {data.items.map((item) => (
                <tr key={item.id}>
                  <td className="py-4 pr-4 text-white"><span className="font-bold">{item.product_name}</span>{item.service_name && <span className="block text-xs text-purple-300">{item.service_name} ({item.country_name || item.country_code})</span>}</td>
                  <td className="py-4 px-4 text-right text-slate-300">{item.quantity}</td>
                  <td className="py-4 pl-4 text-right font-bold text-emerald-300">{formatPrice(item.price * item.quantity)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex justify-end border-t border-slate-800 pt-5">
          <div className="flex w-full max-w-xs items-center justify-between gap-4"><span className="text-sm font-bold text-slate-400">Total</span><span className="text-2xl font-black text-white">{formatPrice(data.order.total_amount)}</span></div>
        </div>

        <footer className="border-t border-slate-800 pt-5 text-xs leading-relaxed text-slate-500">
          Simpan invoice ini sebagai referensi saat menghubungi support. Status fulfillment dan item digital tersedia di halaman pesanan.
        </footer>
      </article>
    </main>
  );
};
