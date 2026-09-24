import React, { useEffect, useState } from 'react';
import { Order, OrderItem, FileEntitlement, OrderStockAllocation, SmsActivation } from '../types';
import { Download, Key, Smartphone, Copy, Check, Clock, CheckCircle2, AlertCircle, AlertTriangle } from 'lucide-react';
import { SmsActivationViewer } from './SmsActivationViewer';

interface OrderDetailData {
  order: Order;
  items: OrderItem[];
  stockCodes: OrderStockAllocation[];
  fileEntitlements: FileEntitlement[];
  smsActivations: SmsActivation[];
}

export const OrdersView: React.FC = () => {
  const [orders, setOrders] = useState<Order[]>([]);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [orderDetail, setOrderDetail] = useState<OrderDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [copyError, setCopyError] = useState<string | null>(null);

  const fetchOrders = async () => {
    try {
      setError(null);
      const res = await fetch('/api/orders');
      if (res.ok) {
        const data = (await res.json()) as any;
        setOrders(data.orders || []);
        if (data.orders?.length > 0 && !selectedOrderId) {
          setSelectedOrderId(data.orders[0].id);
        }
      } else {
        setError('Gagal memuat data pesanan. Silakan coba lagi.');
      }
    } catch {
      setError('Terjadi kendala jaringan saat memuat pesanan.');
    } finally {
      setLoading(false);
    }
  };

  const fetchOrderDetail = async (id: string) => {
    setDetailLoading(true);
    setDetailError(null);
    try {
      const res = await fetch(`/api/orders/${id}`);
      if (res.ok) {
        const data = (await res.json()) as any;
        setOrderDetail(data);
      } else {
        setOrderDetail(null);
        setDetailError('Gagal memuat rincian pesanan. Silakan coba lagi.');
      }
    } catch {
      setOrderDetail(null);
      setDetailError('Terjadi kendala jaringan saat memuat rincian pesanan.');
    } finally {
      setDetailLoading(false);
    }
  };

  useEffect(() => {
    fetchOrders();
  }, []);

  useEffect(() => {
    if (selectedOrderId) {
      fetchOrderDetail(selectedOrderId);
    }
  }, [selectedOrderId]);

  // ponytail: native safe clipboard copy with accessible error status
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

  const formatFulfilmentError = (err?: string | null) => {
    if (!err) return 'Kendala pemrosesan';
    if (/stock/i.test(err)) return 'Stok sedang habis';
    if (/price/i.test(err)) return 'Perubahan harga layanan';
    if (/provider|herosms|network|connect|config/i.test(err)) return 'Kendala sistem aktivasi';
    return 'Kendala teknis';
  };

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto py-12 px-4 text-center text-slate-400">
        Memuat data pesanan...
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-7xl mx-auto py-16 px-4 text-center">
        <div className="glass-panel max-w-md mx-auto rounded-3xl p-8 border border-rose-800/40">
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
      </div>
    );
  }

  if (orders.length === 0) {
    return (
      <div className="max-w-7xl mx-auto py-16 px-4 text-center">
        <div className="glass-panel max-w-md mx-auto rounded-3xl p-8 border border-slate-800">
          <Key className="w-12 h-12 text-slate-600 mx-auto mb-4" />
          <h3 className="text-lg font-extrabold text-white mb-2">Belum Ada Pesanan</h3>
          <p className="text-xs text-slate-400">
            Anda belum pernah membeli produk file, lisensi, atau aktivasi SMS OTP.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto py-8 px-4 lg:px-8">
      <h1 className="text-2xl font-extrabold text-white mb-6">Riwayat Pesanan & Lisensi Saya</h1>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Orders Sidebar List */}
        <div role="tablist" aria-label="Daftar Pesanan" aria-orientation="vertical" className="space-y-3">
          {orders.map((ord) => (
            <button
              key={ord.id}
              type="button"
              role="tab"
              aria-selected={selectedOrderId === ord.id}
              aria-controls={`order-detail-${ord.id}`}
              onClick={() => setSelectedOrderId(ord.id)}
              className={`w-full text-left p-4 rounded-2xl border transition-all focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
                selectedOrderId === ord.id
                  ? 'bg-indigo-950/40 border-indigo-500/50'
                  : 'glass-card border-slate-800 hover:border-slate-700'
              }`}
            >
              <div className="flex items-center justify-between gap-2 mb-1.5">
                <span className="text-xs font-bold text-indigo-300 font-mono">{ord.id}</span>
                <span role="status" className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase ${
                  ord.payment_status === 'paid'
                    ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                    : 'bg-amber-500/10 text-amber-300 border border-amber-500/20'
                }`}>
                  {ord.payment_status === 'paid' ? 'Lunas' : ord.payment_status === 'refunded' ? 'Dikembalikan' : ord.payment_status === 'failed' ? 'Gagal' : 'Menunggu Bayar'}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-400">{new Date(ord.created_at).toLocaleDateString('id-ID')}</span>
                <span className="font-extrabold text-white">{formatPrice(ord.total_amount)}</span>
              </div>
            </button>
          ))}
        </div>

        {/* Selected Order Detail */}
        <div className="lg:col-span-2 space-y-6">
          {detailLoading ? (
            <div className="glass-panel rounded-3xl p-8 text-center text-slate-400 border border-slate-800">
              <Clock className="w-6 h-6 animate-spin mx-auto mb-2 text-indigo-400" />
              Memuat rincian pesanan...
            </div>
          ) : detailError ? (
            <div role="alert" className="glass-panel rounded-3xl p-8 text-center border border-rose-800/40">
              <AlertCircle className="w-10 h-10 text-rose-500 mx-auto mb-3" />
              <h3 className="text-base font-extrabold text-white mb-2">Gagal Memuat Rincian Pesanan</h3>
              <p className="text-xs text-slate-400 mb-4">{detailError}</p>
              {selectedOrderId && (
                <button
                  type="button"
                  onClick={() => fetchOrderDetail(selectedOrderId)}
                  className="min-h-[44px] px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs transition-all focus:outline-none focus:ring-2 focus:ring-indigo-400"
                >
                  Coba Lagi
                </button>
              )}
            </div>
          ) : orderDetail ? (
            <div
              id={`order-detail-${orderDetail.order.id}`}
              role="tabpanel"
              aria-label={`Detail pesanan ${orderDetail.order.id}`}
              className="glass-panel rounded-3xl p-6 sm:p-8 border border-slate-800 space-y-6"
            >
              <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-800">
                <div>
                  <span className="text-xs text-slate-400 block">ID Transaksi</span>
                  <h3 className="text-xl font-extrabold text-white font-mono">{orderDetail.order.id}</h3>
                </div>
                <div className="text-right">
                  <span className="text-xs text-slate-400 block">Total Pembayaran</span>
                  <span className="text-xl font-extrabold text-emerald-400">
                    {formatPrice(orderDetail.order.total_amount)}
                  </span>
                </div>
              </div>



              {/* Order Items List */}
              <div>
                <h4 className="text-sm font-bold text-slate-300 uppercase tracking-wider mb-3">Daftar Produk Pesanan</h4>
                <div className="space-y-3">
                  {orderDetail.items.map((item) => (
                    <div key={item.id} className="p-4 bg-slate-900/60 rounded-2xl border border-slate-800 space-y-2">
                      <div className="flex items-start justify-between gap-3 text-xs">
                        <div>
                          <span className="font-bold text-white text-sm block">{item.product_name}</span>
                          {item.product_type === 'herosms' && (item.service_code || item.service_name) && (
                            <span className="text-xs font-semibold text-purple-300 block">
                              Aplikasi: {item.service_name || item.service_code} ({item.country_name || item.country_code})
                            </span>
                          )}
                          <span className="text-[10px] text-slate-400 uppercase">Tipe: {item.product_type === 'file' ? 'File Digital' : item.product_type === 'code' ? 'Lisensi' : 'SMS OTP'}</span>
                        </div>
                        <div className="text-right shrink-0">
                          <span className="text-slate-300 font-bold">{item.quantity}x</span>
                          <span className="text-emerald-400 font-bold ml-2">{formatPrice(item.price)}</span>
                        </div>
                      </div>

                      {/* Per-item fulfilment status */}
                      <div className="flex items-center justify-between pt-2 border-t border-slate-800/60 text-xs">
                        <span className="text-slate-400">Status Produk:</span>
                        {item.fulfilment_status === 'fulfilled' ? (
                          <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center gap-1">
                            <CheckCircle2 className="w-3.5 h-3.5" /> Terpenuhi
                          </span>
                        ) : item.fulfilment_status === 'failed' ? (
                          <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/40 flex items-center gap-1" title={formatFulfilmentError(item.fulfilment_error)}>
                            <AlertTriangle className="w-3.5 h-3.5 text-rose-400" /> Bantuan Diperlukan ({formatFulfilmentError(item.fulfilment_error)})
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
                        <Download className="w-4 h-4" /> Download Instan & Aman
                      </h4>
                      {orderDetail.fileEntitlements.map((fe) => (
                        <div key={fe.id} className="p-4 bg-blue-950/30 border border-blue-800/40 rounded-2xl flex items-center justify-between gap-3">
                          <div>
                            <span className="text-xs font-semibold text-slate-200 block">Akses File Cepat</span>
                            <span className="text-[10px] text-slate-400">Berlaku sampai {new Date(fe.expires_at * 1000).toLocaleDateString()}</span>
                          </div>
                          <a
                            href={`/api/downloads/${fe.download_token}`}
                            target="_blank"
                            rel="noreferrer"
                            className="min-h-[44px] px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs flex items-center gap-1.5 transition-all shadow-md shrink-0 focus:outline-none focus:ring-2 focus:ring-blue-400"
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
                        <div key={code.id} className="p-4 bg-emerald-950/30 border border-emerald-800/40 rounded-2xl flex items-center justify-between gap-3">
                          <div>
                            <span className="text-[10px] text-emerald-400 font-bold uppercase">{code.product_name}</span>
                            <span className="text-base font-extrabold text-white font-mono block mt-0.5">
                              {code.code}
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={() => copyToClipboard(code.code)}
                            className="min-h-[44px] px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-1.5 transition-all shadow-md shrink-0 focus:outline-none focus:ring-2 focus:ring-emerald-400"
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
                        <Smartphone className="w-4 h-4" /> Aktivasi SMS OTP Langsung
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
    </div>
  );
};
