import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { Order, OrderItem, FileEntitlement, OrderStockAllocation, SmsActivation, Product } from '../types';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';
import { Download, Key, Smartphone, Copy, Check, Clock, ArrowLeft, RefreshCw, CheckCircle2, AlertTriangle, AlertCircle, ShoppingCart, QrCode } from 'lucide-react';
import { SmsActivationViewer } from '../components/SmsActivationViewer';

interface OrderDetailData {
  order: Order;
  items: OrderItem[];
  stockCodes: OrderStockAllocation[];
  fileEntitlements: FileEntitlement[];
  smsActivations: SmsActivation[];
}

export const OrdersPage: React.FC = () => {
  const { id } = useParams<{ id?: string }>();
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const { addToCart } = useCart();

  const [orders, setOrders] = useState<Order[]>([]);
  const [orderDetail, setOrderDetail] = useState<OrderDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [copyError, setCopyError] = useState<string | null>(null);
  const [reorderId, setReorderId] = useState<string | null>(null);
  const [reorderMessage, setReorderMessage] = useState<string | null>(null);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportMessage, setReportMessage] = useState('');
  const [reportSending, setReportSending] = useState(false);
  const [reportResult, setReportResult] = useState<string | null>(null);
  const [qrisTimestamp, setQrisTimestamp] = useState(Date.now());
  const [regeneratingQris, setRegeneratingQris] = useState(false);
  const [qrisRegenerateError, setQrisRegenerateError] = useState<string | null>(null);
  const [timeLeft, setTimeLeft] = useState<number | null>(null);

  useEffect(() => {
    if (!authLoading && !user) {
      const currentPath = id ? `/pesanan/${id}` : '/pesanan';
      navigate(`/masuk?next=${encodeURIComponent(currentPath)}`, { replace: true });
    }
  }, [user, authLoading, id, navigate]);

  const fetchOrders = async () => {
    try {
      setError(null);
      const res = await fetch('/api/orders');
      if (res.ok) {
        const data = (await res.json()) as any;
        setOrders(data.orders || []);
      } else {
        setError('Gagal memuat data pesanan. Silakan coba lagi.');
      }
    } catch {
      setError('Terjadi kendala jaringan saat memuat pesanan.');
    } finally {
      setLoading(false);
    }
  };

  const fetchOrderDetail = async (orderId: string, silent = false) => {
    if (!silent) setDetailLoading(true);
    if (!silent) setDetailError(null);
    try {
      const res = await fetch(`/api/orders/${orderId}`);
      if (res.ok) {
        const data = (await res.json()) as any;
        setOrderDetail(data);
      } else {
        setOrderDetail(null);
        if (!silent) setDetailError('Gagal memuat rincian pesanan. Silakan coba lagi.');
      }
    } catch {
      if (!silent) {
        setOrderDetail(null);
        setDetailError('Terjadi kendala jaringan saat memuat rincian pesanan.');
      }
    } finally {
      if (!silent) setDetailLoading(false);
    }
  };

  useEffect(() => {
    if (user) {
      fetchOrders();
    }
  }, [user]);

  useEffect(() => {
    if (user && id) {
      fetchOrderDetail(id);
    } else if (user && orders.length > 0 && !id) {
      navigate(`/pesanan/${orders[0].id}`, { replace: true });
    }
  }, [user, id, orders]);

  useEffect(() => {
    if (!user || !id || !orderDetail) return;
    const activeDelivery = orderDetail.order.delivery_status === 'awaiting_payment' ||
      orderDetail.order.delivery_status === 'processing' ||
      orderDetail.order.delivery_status === 'failed';
    if (!activeDelivery) return;

    const interval = window.setInterval(() => {
      void fetchOrderDetail(id, true);
    }, 5000);
    return () => window.clearInterval(interval);
  }, [user, id, orderDetail?.order.delivery_status]);

  useEffect(() => {
    if (!orderDetail || orderDetail.order.payment_status !== 'pending' || orderDetail.order.payment_provider !== 'qris') {
      setTimeLeft(null);
      return;
    }

    const createdAtMs = new Date(orderDetail.order.created_at).getTime();
    const expiryMs = createdAtMs + 5 * 60 * 1000;
    const remainingSeconds = Math.max(0, Math.floor((expiryMs - Date.now()) / 1000));
    setTimeLeft(remainingSeconds);

    const timer = window.setInterval(() => {
      setTimeLeft((prev) => {
        if (prev === null || prev <= 1) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => window.clearInterval(timer);
  }, [orderDetail?.order.id, orderDetail?.order.payment_status, qrisTimestamp]);

  const handleRegenerateQris = async () => {
    if (!orderDetail) return;
    setRegeneratingQris(true);
    setQrisRegenerateError(null);
    try {
      const res = await fetch(`/api/orders/${encodeURIComponent(orderDetail.order.id)}/regenerate-qris`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      const data = (await res.json()) as any;
      if (!res.ok) throw new Error(data.error || 'Gagal generate ulang QRIS');
      setQrisTimestamp(Date.now());
      setTimeLeft(300);
      void fetchOrderDetail(orderDetail.order.id, true);
    } catch (err: any) {
      setQrisRegenerateError(err.message || 'Gagal generate QRIS baru');
    } finally {
      setRegeneratingQris(false);
    }
  };

  const formatTimer = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // ponytail: native safe clipboard copy with user feedback
  const copyToClipboard = async (text: string) => {
    try {
      setCopyError(null);
      if (!navigator.clipboard?.writeText) {
        throw new Error('Clipboard API unavailable');
      }
      await navigator.clipboard.writeText(text);
      setCopiedCode(text);
      setTimeout(() => setCopiedCode(null), 2000);
    } catch {
      setCopyError('Gagal menyalin ke clipboard. Silakan salin manual.');
      setTimeout(() => setCopyError(null), 4000);
    }
  };

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(price);
  };

  const handleReorder = async (item: OrderItem) => {
    if (!item.product_slug || item.product_type === 'herosms') {
      setReorderMessage('Rute OTP perlu dipilih ulang melalui konfigurator.');
      return;
    }
    setReorderId(item.id);
    setReorderMessage(null);
    try {
      const res = await fetch(`/api/products/by-slug/${encodeURIComponent(item.product_slug)}`);
      const data = (await res.json()) as { product?: Product; error?: string };
      if (!res.ok || !data.product) throw new Error(data.error || 'Produk sudah tidak tersedia.');
      addToCart(data.product, item.quantity);
      setReorderMessage(`${item.product_name} ditambahkan ke keranjang.`);
    } catch (err: any) {
      setReorderMessage(err.message || 'Produk tidak dapat dibeli ulang.');
    } finally {
      setReorderId(null);
    }
  };

  const submitReport = async () => {
    if (!id || reportMessage.trim().length < 10) {
      setReportResult('Jelaskan masalah minimal 10 karakter.');
      return;
    }
    setReportSending(true);
    setReportResult(null);
    try {
      const res = await fetch(`/api/orders/${encodeURIComponent(id)}/report`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subject: 'Masalah fulfillment order', message: reportMessage.trim() })
      });
      const data = (await res.json()) as any;
      if (!res.ok) throw new Error(data.error || 'Laporan tidak dapat dikirim.');
      setReportResult(`Laporan diterima dengan nomor ${data.ticket?.id || 'baru'}.`);
      setReportMessage('');
      setReportOpen(false);
    } catch (err: any) {
      setReportResult(err.message || 'Laporan tidak dapat dikirim.');
    } finally {
      setReportSending(false);
    }
  };

  const deliveryLabel = (status?: string) => {
    switch (status) {
      case 'fulfilled': return 'Produk siap digunakan';
      case 'failed': return 'Perlu tindakan support';
      case 'refunded': return 'Dana sudah dikembalikan';
      case 'processing': return 'Sedang menyiapkan produk';
      default: return 'Menunggu pembayaran';
    }
  };

  if (authLoading || loading) {
    return (
      <main className="max-w-7xl mx-auto py-12 px-4 text-center text-slate-400">
        <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-indigo-400" />
        Memuat data pesanan...
      </main>
    );
  }

  if (error) {
    return (
      <main className="max-w-7xl mx-auto py-16 px-4 text-center">
        <div className="glass-panel mx-auto max-w-md rounded-3xl border border-rose-800/40 p-6 sm:p-8">
          <AlertCircle className="w-12 h-12 text-rose-500 mx-auto mb-4" />
          <h3 className="text-lg font-extrabold text-white mb-2">Gagal Memuat Pesanan</h3>
          <p className="text-xs text-slate-400 mb-6">{error}</p>
          <button
            type="button"
            onClick={() => {
              setLoading(true);
              fetchOrders();
            }}
            className="min-h-[44px] px-6 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs transition-all focus:outline-none focus:ring-2 focus:ring-indigo-400"
          >
            Coba Lagi
          </button>
        </div>
      </main>
    );
  }

  if (orders.length === 0) {
    return (
      <main className="max-w-md mx-auto py-16 px-4 text-center space-y-4 pb-safe flex-1 flex flex-col justify-center">
        <div className="glass-panel rounded-3xl border border-slate-800 p-6 space-y-4 sm:p-8">
          <div className="w-16 h-16 rounded-2xl bg-indigo-500/10 text-indigo-400 flex items-center justify-center mx-auto">
            <Key className="w-8 h-8" />
          </div>
          <h3 className="text-lg font-extrabold text-white">Belum Ada Pesanan</h3>
          <p className="text-xs text-slate-400">
            Anda belum pernah membeli produk file, lisensi, atau aktivasi HeroSMS.
          </p>
          <Link
            to="/"
            className="inline-flex items-center justify-center gap-2 px-6 py-3 min-h-[44px] rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition-all shadow-md"
          >
            Mulai Belanja Sekarang
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-7xl space-y-5 px-4 py-5 pb-safe sm:space-y-6 sm:py-8 lg:px-8">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-xl sm:text-2xl font-extrabold text-white">Riwayat Pesanan Saya</h1>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Orders Sidebar / Mobile List */}
        <div className={`space-y-3 ${id ? 'hidden lg:block' : 'block'}`}>
          {orders.map((ord) => (
            <Link
              key={ord.id}
              to={`/pesanan/${ord.id}`}
              className={`block p-4 rounded-2xl border transition-all focus-visible:ring-2 focus-visible:ring-indigo-500 ${
                id === ord.id
                  ? 'bg-indigo-950/50 border-indigo-500/60 glow-primary'
                  : 'glass-card border-slate-800 hover:border-slate-700'
              }`}
            >
              <div className="flex items-center justify-between gap-2 mb-1.5">
                <span className="text-xs font-bold text-indigo-300 font-mono">{ord.id}</span>
                <span role="status" className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase ${
                  ord.payment_status === 'paid'
                    ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                    : 'bg-amber-500/10 text-amber-300 border border-amber-500/20'
                }`}>
                  {ord.payment_status}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-400">{new Date(ord.created_at).toLocaleDateString('id-ID')}</span>
                <span className="font-extrabold text-white">{formatPrice(ord.total_amount)}</span>
              </div>
            </Link>
          ))}
        </div>

        {/* Selected Order Detail */}
        <div className={`lg:col-span-2 space-y-6 ${!id ? 'hidden lg:block' : 'block'}`}>
          <Link
            to="/pesanan"
            className="lg:hidden inline-flex items-center gap-2 px-3 py-2 min-h-[44px] text-xs font-bold text-slate-400 hover:text-white rounded-xl bg-slate-900 border border-slate-800 transition-all mb-4"
          >
            <ArrowLeft className="w-4 h-4" /> Kembali ke Daftar Pesanan
          </Link>

          {detailLoading ? (
            <div className="glass-panel rounded-3xl border border-slate-800 p-6 text-center text-slate-400 sm:p-8">
              <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-indigo-400" />
              Memuat rincian pesanan...
            </div>
          ) : detailError ? (
            <div role="alert" className="glass-panel rounded-3xl border border-rose-800/40 p-6 text-center sm:p-8">
              <AlertCircle className="w-10 h-10 text-rose-500 mx-auto mb-3" />
              <h3 className="text-base font-extrabold text-white mb-2">Gagal Memuat Rincian Pesanan</h3>
              <p className="text-xs text-slate-400 mb-4">{detailError}</p>
              {id && (
                <button
                  type="button"
                  onClick={() => fetchOrderDetail(id)}
                  className="min-h-[44px] px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs transition-all focus-visible:ring-2 focus-visible:ring-indigo-400"
                >
                  Coba Lagi
                </button>
              )}
            </div>
          ) : orderDetail ? (
            <div className="glass-panel space-y-5 rounded-3xl border border-slate-800 p-4 sm:space-y-6 sm:p-8">
              <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-800">
                <div>
                  <span className="text-xs text-slate-400 block">ID Transaksi</span>
                  <h3 className="text-lg sm:text-xl font-extrabold text-white font-mono">{orderDetail.order.id}</h3>
                </div>
                <div className="text-right">
                  <span className="text-xs text-slate-400 block">Total Pembayaran</span>
                  <span className="text-xl font-black text-emerald-400">
                    {formatPrice(orderDetail.order.total_amount)}
                  </span>
                  <div className="flex flex-wrap justify-end gap-2 mt-2">
                    <Link
                      to={`/pesanan/${orderDetail.order.id}/invoice`}
                      className="min-h-[40px] px-3 rounded-lg border border-slate-700 bg-slate-900 text-slate-300 hover:text-white text-[11px] font-bold inline-flex items-center justify-center focus-visible:ring-2 focus-visible:ring-indigo-400"
                    >
                      Invoice
                    </Link>
                    <button
                      type="button"
                      onClick={() => setReportOpen((open) => !open)}
                      className="min-h-[40px] px-3 rounded-lg border border-rose-800/70 bg-rose-950/30 text-rose-200 hover:bg-rose-900/40 text-[11px] font-bold inline-flex items-center justify-center focus-visible:ring-2 focus-visible:ring-rose-400"
                    >
                      Laporkan masalah
                    </button>
                  </div>
                </div>
              </div>

              <div
                role="status"
                aria-live="polite"
                className={`rounded-2xl border p-4 ${
                  orderDetail.order.delivery_status === 'failed'
                    ? 'border-rose-800/60 bg-rose-950/30'
                    : orderDetail.order.delivery_status === 'fulfilled'
                      ? 'border-emerald-800/60 bg-emerald-950/30'
                      : 'border-indigo-800/60 bg-indigo-950/30'
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Status delivery</span>
                    <p className="text-sm font-extrabold text-white mt-1">{deliveryLabel(orderDetail.order.delivery_status)}</p>
                  </div>
                  {(orderDetail.order.delivery_status === 'processing' || orderDetail.order.delivery_status === 'awaiting_payment') && (
                    <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-indigo-200">
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Update otomatis
                    </span>
                  )}
                </div>
                {orderDetail.order.delivery_status === 'failed' && (
                  <p className="text-xs text-rose-200 mt-2">Tim support dapat melakukan retry atau refund untuk item yang gagal.</p>
                )}
              </div>

              {/* In-Store Interactive QRIS Payment Card */}
              {orderDetail.order.payment_status === 'pending' && orderDetail.order.payment_provider === 'qris' && (
                <section aria-labelledby="qris-payment-title" className="rounded-2xl border border-indigo-500/40 bg-indigo-950/20 p-5 sm:p-6 space-y-5">
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-indigo-900/50 pb-4">
                    <div className="flex items-center gap-2.5">
                      <div className="p-2 rounded-xl bg-indigo-600/20 text-indigo-400 border border-indigo-500/30">
                        <QrCode className="w-5 h-5" />
                      </div>
                      <div>
                        <h4 id="qris-payment-title" className="text-sm font-extrabold text-white">Pembayaran QRIS Dinamis</h4>
                        <p className="text-xs text-slate-400">Scan via DANA, GoPay, OVO, ShopeePay, BCA, Mandiri, atau E-Wallet apa saja</p>
                      </div>
                    </div>
                    {timeLeft !== null && timeLeft > 0 && (
                      <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-900/80 border border-amber-500/30 text-amber-300 text-xs font-mono font-bold">
                        <Clock className="w-3.5 h-3.5 text-amber-400 animate-pulse" />
                        <span>Sisa Waktu: {formatTimer(timeLeft)}</span>
                      </div>
                    )}
                  </div>

                  <div className="flex flex-col items-center justify-center space-y-4 py-2">
                    <div className="relative group bg-white p-3.5 rounded-2xl shadow-2xl border-2 border-indigo-500/30">
                      <img
                        src={`/api/orders/${encodeURIComponent(orderDetail.order.id)}/qr?t=${qrisTimestamp}`}
                        alt="QR Code Pembayaran QRIS"
                        className="w-52 h-52 sm:w-60 sm:h-60 object-contain rounded-lg"
                      />
                      {timeLeft === 0 && (
                        <div className="absolute inset-0 bg-slate-950/85 backdrop-blur-xs rounded-2xl flex flex-col items-center justify-center p-4 text-center">
                          <AlertTriangle className="w-8 h-8 text-amber-400 mb-2" />
                          <span className="text-xs font-bold text-white mb-1">QRIS Kedaluwarsa</span>
                          <span className="text-[11px] text-slate-300 mb-3">Waktu pembayaran 5 menit telah berakhir</span>
                          <button
                            type="button"
                            onClick={() => void handleRegenerateQris()}
                            disabled={regeneratingQris}
                            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-bold shadow-lg"
                          >
                            <RefreshCw className={`w-3.5 h-3.5 ${regeneratingQris ? 'animate-spin' : ''}`} />
                            {regeneratingQris ? 'Membuat QRIS...' : 'Generate QRIS Baru'}
                          </button>
                        </div>
                      )}
                    </div>

                    <div className="text-center space-y-1">
                      <span className="text-xs text-slate-400">Total Tagihan Pembayaran:</span>
                      <p className="text-2xl sm:text-3xl font-black text-emerald-400">
                        {formatPrice(orderDetail.order.total_amount)}
                      </p>
                    </div>

                    {qrisRegenerateError && (
                      <p className="text-xs text-rose-300">{qrisRegenerateError}</p>
                    )}

                    <div className="w-full max-w-sm rounded-xl border border-slate-800 bg-slate-900/60 p-3.5 space-y-2 text-xs text-slate-300">
                      <div className="flex items-center justify-between font-semibold text-slate-200">
                        <span>Langkah Pembayaran:</span>
                        <span className="text-[11px] text-indigo-300 flex items-center gap-1">
                          <RefreshCw className="w-3 h-3 animate-spin" /> Verifikasi Otomatis
                        </span>
                      </div>
                      <ol className="list-decimal list-inside space-y-1 text-slate-400 leading-relaxed text-[11px]">
                        <li>Buka aplikasi <strong>DANA</strong> atau e-wallet / banking lainnya.</li>
                        <li>Pilih menu <strong>Scan / Bayar</strong> dan arahkan kamera ke kode QR di atas.</li>
                        <li>Pastikan nama merchant <strong>Ery-store</strong> dan nominal sesuai.</li>
                        <li>Konfirmasi pembayaran. Pesanan Anda akan langsung diproses seketika berhasil!</li>
                      </ol>
                    </div>
                  </div>
                </section>
              )}

              {reorderMessage && (
                <div role="status" className="rounded-xl border border-indigo-500/30 bg-indigo-500/10 p-3 text-xs text-indigo-200">
                  {reorderMessage}
                </div>
              )}

              {reportResult && (
                <div role="status" className="rounded-xl border border-slate-700 bg-slate-900/70 p-3 text-xs text-slate-200">
                  {reportResult}
                </div>
              )}

              {reportOpen && (
                <div className="rounded-2xl border border-rose-800/60 bg-rose-950/20 p-4 space-y-3">
                  <div>
                    <h4 className="text-sm font-extrabold text-rose-100">Laporkan masalah order</h4>
                    <p className="text-xs text-rose-200/80 mt-1">Jelaskan item yang belum diterima atau kendala saat penggunaan.</p>
                  </div>
                  <label htmlFor="order-report-message" className="sr-only">Deskripsi masalah</label>
                  <textarea
                    id="order-report-message"
                    value={reportMessage}
                    onChange={(e) => setReportMessage(e.target.value)}
                    rows={4}
                    maxLength={2000}
                    placeholder="Contoh: kode tidak bisa digunakan setelah saya salin..."
                    className="w-full rounded-xl border border-rose-800/70 bg-slate-950 px-3 py-2.5 text-sm text-white placeholder-slate-500 focus:border-rose-500 focus-visible:ring-2 focus-visible:ring-rose-400"
                  />
                  <div className="flex flex-wrap justify-end gap-2">
                    <button type="button" onClick={() => setReportOpen(false)} className="min-h-[44px] px-4 rounded-xl border border-slate-700 text-slate-300 text-xs font-bold focus-visible:ring-2 focus-visible:ring-slate-400">
                      Batal
                    </button>
                    <button type="button" onClick={() => void submitReport()} disabled={reportSending} className="min-h-[44px] px-4 rounded-xl bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white text-xs font-bold focus-visible:ring-2 focus-visible:ring-rose-400">
                      {reportSending ? 'Mengirim...' : 'Kirim laporan'}
                    </button>
                  </div>
                </div>
              )}



              {/* Order Items List */}
              <div>
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Item Pesanan</h4>
                <div className="space-y-3">
                  {orderDetail.items.map((item) => (
                    <div key={item.id} className="p-4 bg-slate-900/80 rounded-2xl border border-slate-800 space-y-2">
                      <div className="flex items-start justify-between gap-3 text-xs">
                        <div>
                          <span className="font-bold text-white text-sm block">{item.product_name}</span>
                          {item.product_type === 'herosms' && (item.service_code || item.service_name) && (
                            <span className="text-xs font-semibold text-purple-300 block">
                              Rute: {item.service_name || item.service_code} ({item.country_name || item.country_code})
                            </span>
                          )}
                          <span className="text-[10px] text-slate-400 uppercase">Tipe: {item.product_type}</span>
                        </div>
                        <div className="text-right shrink-0">
                          <span className="text-slate-300 font-bold">{item.quantity}x</span>
                          <span className="text-emerald-400 font-bold ml-2">{formatPrice(item.price)}</span>
                          {item.fulfilment_status !== 'refunded' && (
                            <button
                              type="button"
                              onClick={() => void handleReorder(item)}
                              disabled={reorderId === item.id}
                              className="mt-2 min-h-[40px] px-3 rounded-lg border border-indigo-700 bg-indigo-950/40 text-indigo-200 hover:bg-indigo-900/50 disabled:opacity-50 inline-flex items-center gap-1.5 text-[11px] font-bold focus-visible:ring-2 focus-visible:ring-indigo-400"
                            >
                              <ShoppingCart className="w-3.5 h-3.5" /> {reorderId === item.id ? 'Memuat...' : 'Beli lagi'}
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Per-item fulfilment status */}
                      <div className="flex items-center justify-between pt-2 border-t border-slate-800/60 text-xs">
                        <span className="text-slate-400">Status Pemenuhan Item:</span>
                        {item.fulfilment_status === 'fulfilled' ? (
                          <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center gap-1">
                            <CheckCircle2 className="w-3.5 h-3.5" /> Terpenuhi
                          </span>
                        ) : item.fulfilment_status === 'failed' ? (
                          <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/40 flex items-center gap-1" title={item.fulfilment_error || 'Gagal Terhubung Provider'}>
                            <AlertTriangle className="w-3.5 h-3.5 text-rose-400" /> Refund Manual Diperlukan ({item.fulfilment_error || 'Provider Error'})
                          </span>
                        ) : (
                          <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-500/10 text-amber-300 border border-amber-500/20 flex items-center gap-1">
                            <Clock className="w-3.5 h-3.5 animate-spin" /> Menunggu Pemrosesan
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Digital Entitlements & Fulfilment Deliverables */}
              {orderDetail.order.payment_status === 'paid' && (
                <div className="space-y-6 pt-4 border-t border-slate-800">
                  {/* File Entitlements */}
                  {orderDetail.fileEntitlements.length > 0 && (
                    <div className="space-y-3">
                      <h4 className="text-sm font-bold text-blue-400 flex items-center gap-2">
                        <Download className="w-4 h-4" /> Unduhan File Privat (R2 Bucket)
                      </h4>
                      {orderDetail.fileEntitlements.map((fe) => (
                        <div key={fe.id} className="p-4 bg-blue-950/30 border border-blue-800/40 rounded-2xl flex flex-wrap items-center justify-between gap-3">
                          <div>
                            <span className="text-xs font-semibold text-slate-200 block">Akses Unduhan Privat</span>
                            <span className="text-[10px] text-slate-400">Berlaku sampai {new Date(fe.expires_at * 1000).toLocaleDateString()}</span>
                          </div>
                          <a
                            href={`/api/downloads/${fe.download_token}`}
                            target="_blank"
                            rel="noreferrer"
                            className="px-4 min-h-[44px] rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs flex items-center gap-1.5 transition-all shadow-md shrink-0 focus-visible:ring-2 focus-visible:ring-blue-500"
                          >
                            <Download className="w-4 h-4" />
                            <span>Unduh File</span>
                          </a>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Stock Codes / License Vouchers */}
                  {orderDetail.stockCodes.length > 0 && (
                    <div className="space-y-3">
                      <h4 className="text-sm font-bold text-emerald-400 flex items-center gap-2">
                        <Key className="w-4 h-4" /> Kode Lisensi / Voucher Anda
                      </h4>
                      {copyError && (
                        <div role="alert" className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-300 text-xs flex items-center gap-2">
                          <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
                          <span>{copyError}</span>
                        </div>
                      )}
                      <div className="sr-only" aria-live="polite">
                        {copiedCode ? 'Kode berhasil disalin ke clipboard' : copyError ? copyError : ''}
                      </div>
                      {orderDetail.stockCodes.map((code) => (
                        <div key={code.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-emerald-800/40 bg-emerald-950/30 p-4">
                          <div>
                            <span className="text-[10px] text-emerald-400 font-bold uppercase">{code.product_name}</span>
                            <span className="text-base font-extrabold text-white font-mono block mt-0.5">
                              {code.code}
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={() => copyToClipboard(code.code)}
                            className="px-3.5 min-h-[44px] rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-1.5 transition-all shadow-md shrink-0 focus-visible:ring-2 focus-visible:ring-emerald-500"
                          >
                            {copiedCode === code.code ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                            <span>{copiedCode === code.code ? 'Tersalin' : 'Salin'}</span>
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* HeroSMS Activations */}
                  {orderDetail.smsActivations.length > 0 && (
                    <div className="space-y-3">
                      <h4 className="text-sm font-bold text-purple-400 flex items-center gap-2">
                        <Smartphone className="w-4 h-4" /> Aktivasi Nomor HeroSMS OTP
                      </h4>
                      {orderDetail.smsActivations.map((sms) => (
                        <SmsActivationViewer key={sms.id} activationId={sms.id} />
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="glass-panel rounded-3xl border border-slate-800 p-6 text-center text-slate-500 sm:p-8">
              Pilih pesanan di sebelah kiri untuk melihat detail.
            </div>
          )}
        </div>
      </div>
    </main>
  );
};
