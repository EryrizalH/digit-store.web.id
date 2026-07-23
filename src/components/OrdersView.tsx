import React, { useEffect, useState } from 'react';
import { Order, OrderItem, FileEntitlement, OrderStockAllocation, SmsActivation } from '../types';
import { Download, Key, Smartphone, Copy, Check, Clock, CheckCircle2, AlertCircle } from 'lucide-react';
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
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  const fetchOrders = async () => {
    try {
      const res = await fetch('/api/orders');
      if (res.ok) {
        const data = (await res.json()) as any;
        setOrders(data.orders || []);
        if (data.orders?.length > 0 && !selectedOrderId) {
          setSelectedOrderId(data.orders[0].id);
        }
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  const fetchOrderDetail = async (id: string) => {
    try {
      const res = await fetch(`/api/orders/${id}`);
      if (res.ok) {
        const data = (await res.json()) as any;
        setOrderDetail(data);
      }
    } catch {
      // ignore
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

  const handleSimulatedPay = async (orderId: string) => {
    const res = await fetch(`/api/orders/${orderId}/simulated-pay`, { method: 'POST' });
    if (res.ok) {
      fetchOrders();
      fetchOrderDetail(orderId);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedCode(text);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(price);
  };

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto py-12 px-4 text-center text-slate-400">
        Memuat data pesanan...
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
            Anda belum pernah membeli produk file, lisensi, atau aktivasi SMS.
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
        <div className="space-y-3">
          {orders.map((ord) => (
            <div
              key={ord.id}
              onClick={() => setSelectedOrderId(ord.id)}
              className={`p-4 rounded-2xl border cursor-pointer transition-all ${
                selectedOrderId === ord.id
                  ? 'bg-indigo-950/40 border-indigo-500/50 glow-primary'
                  : 'glass-card border-slate-800 hover:border-slate-700'
              }`}
            >
              <div className="flex items-center justify-between gap-2 mb-1.5">
                <span className="text-xs font-bold text-indigo-300 font-mono">{ord.id}</span>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase ${
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
            </div>
          ))}
        </div>

        {/* Selected Order Detail */}
        <div className="lg:col-span-2 space-y-6">
          {orderDetail && (
            <div className="glass-panel rounded-3xl p-6 sm:p-8 border border-slate-800 space-y-6">
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

              {/* Pending Payment Action */}
              {orderDetail.order.payment_status === 'pending' && (
                <div className="p-4 bg-amber-950/40 border border-amber-800/50 rounded-2xl flex flex-wrap items-center justify-between gap-3 text-xs">
                  <div className="flex items-center gap-2 text-amber-200">
                    <Clock className="w-5 h-5 text-amber-400 shrink-0" />
                    <span>Pembayaran masih pending. Klik simulasi bayar untuk menguji aktivasi otomatis.</span>
                  </div>
                  <button
                    onClick={() => handleSimulatedPay(orderDetail.order.id)}
                    className="px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-indigo-600 text-white font-bold transition-all shadow-md"
                  >
                    Simulasi Bayar (Dev Test)
                  </button>
                </div>
              )}

              {/* Order Items List */}
              <div>
                <h4 className="text-sm font-bold text-slate-300 uppercase tracking-wider mb-3">Item Pesanan</h4>
                <div className="space-y-2">
                  {orderDetail.items.map((item) => (
                    <div key={item.id} className="p-3.5 bg-slate-900/60 rounded-xl border border-slate-800 flex items-center justify-between text-xs">
                      <div>
                        <span className="font-semibold text-white block">{item.product_name}</span>
                        <span className="text-[10px] text-slate-400 uppercase">Tipe: {item.product_type}</span>
                      </div>
                      <div className="text-right">
                        <span className="text-slate-300 font-bold">{item.quantity}x</span>
                        <span className="text-emerald-400 font-bold ml-2">{formatPrice(item.price)}</span>
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
                        <div key={fe.id} className="p-4 bg-blue-950/30 border border-blue-800/40 rounded-2xl flex items-center justify-between gap-3">
                          <div>
                            <span className="text-xs font-semibold text-slate-200 block">Link Akses Privat Digital Store</span>
                            <span className="text-[10px] text-slate-400">Berlaku sampai {new Date(fe.expires_at * 1000).toLocaleDateString()}</span>
                          </div>
                          <a
                            href={`/api/downloads/${fe.download_token}`}
                            target="_blank"
                            rel="noreferrer"
                            className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs flex items-center gap-1.5 transition-all shadow-md shrink-0"
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
                            className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-1.5 transition-all shadow-md shrink-0"
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
          )}
        </div>
      </div>
    </div>
  );
};
