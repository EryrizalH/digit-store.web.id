// ponytail: Route-driven orders list & detail page with per-item fulfilment badges & manual refund state
import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { Order, OrderItem, FileEntitlement, OrderStockAllocation, SmsActivation } from '../types';
import { useAuth } from '../context/AuthContext';
import { Download, Key, Smartphone, Copy, Check, Clock, ArrowLeft, RefreshCw, CheckCircle2, AlertTriangle } from 'lucide-react';
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

  const [orders, setOrders] = useState<Order[]>([]);
  const [orderDetail, setOrderDetail] = useState<OrderDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && !user) {
      const currentPath = id ? `/pesanan/${id}` : '/pesanan';
      navigate(`/masuk?next=${encodeURIComponent(currentPath)}`, { replace: true });
    }
  }, [user, authLoading, id, navigate]);

  const fetchOrders = async () => {
    try {
      const res = await fetch('/api/orders');
      if (res.ok) {
        const data = (await res.json()) as any;
        setOrders(data.orders || []);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  const fetchOrderDetail = async (orderId: string) => {
    try {
      const res = await fetch(`/api/orders/${orderId}`);
      if (res.ok) {
        const data = (await res.json()) as any;
        setOrderDetail(data);
      }
    } catch {
      // ignore
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



  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedCode(text);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(price);
  };

  if (authLoading || loading) {
    return (
      <main className="max-w-7xl mx-auto py-12 px-4 text-center text-slate-400">
        <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-indigo-400" />
        Memuat data pesanan...
      </main>
    );
  }

  if (orders.length === 0) {
    return (
      <main className="max-w-md mx-auto py-16 px-4 text-center space-y-4 pb-safe flex-1 flex flex-col justify-center">
        <div className="glass-panel rounded-3xl p-8 border border-slate-800 space-y-4">
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
    <main className="max-w-7xl mx-auto py-6 sm:py-8 px-4 lg:px-8 space-y-6 pb-safe">
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
                <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase ${
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

          {orderDetail ? (
            <div className="glass-panel rounded-3xl p-6 sm:p-8 border border-slate-800 space-y-6">
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
                </div>
              </div>



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
                      {orderDetail.stockCodes.map((code) => (
                        <div key={code.id} className="p-4 bg-emerald-950/30 border border-emerald-800/40 rounded-2xl flex items-center justify-between gap-3">
                          <div>
                            <span className="text-[10px] text-emerald-400 font-bold uppercase">{code.product_name}</span>
                            <span className="text-base font-extrabold text-white font-mono block mt-0.5">
                              {code.code}
                            </span>
                          </div>
                          <button
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
            <div className="glass-panel rounded-3xl p-8 text-center text-slate-500 border border-slate-800">
              Pilih pesanan di sebelah kiri untuk melihat detail.
            </div>
          )}
        </div>
      </div>
    </main>
  );
};
