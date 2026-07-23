// ponytail: Compact artwork-led Product Card component with accessible touch targets & dynamic OTP configurator navigation
import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Product } from '../types';
import { Download, Key, Smartphone, ShoppingCart, SlidersHorizontal } from 'lucide-react';
import { useCart } from '../context/CartContext';
import { ArtworkImage } from './ArtworkImage';

interface ProductCardProps {
  product: Product;
}

export const ProductCard: React.FC<ProductCardProps> = ({ product }) => {
  const { addToCart } = useCart();
  const navigate = useNavigate();

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(price);
  };

  const getTypeBadge = () => {
    switch (product.type) {
      case 'file':
        return (
          <span className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-blue-500/10 text-blue-400 border border-blue-500/20 flex items-center gap-1">
            <Download className="w-3.5 h-3.5" /> File
          </span>
        );
      case 'code':
        return (
          <span className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center gap-1">
            <Key className="w-3.5 h-3.5" /> Lisensi
          </span>
        );
      case 'herosms':
        return (
          <span className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-purple-500/10 text-purple-400 border border-purple-500/20 flex items-center gap-1">
            <Smartphone className="w-3.5 h-3.5" /> HeroSMS OTP
          </span>
        );
      default:
        return null;
    }
  };

  const handleAction = () => {
    if (product.type === 'herosms') {
      navigate(`/produk/${product.slug}`);
    } else {
      addToCart(product);
    }
  };

  return (
    <div className="glass-card rounded-2xl p-4 flex flex-col justify-between relative group border border-slate-800/80 hover:border-indigo-500/40 transition-all">
      <div className="space-y-3">
        {/* Reserved Aspect Ratio Artwork */}
        <Link to={`/produk/${product.slug}`} className="block focus-visible:ring-2 focus-visible:ring-indigo-500 rounded-xl overflow-hidden">
          <ArtworkImage
            src={product.artwork_url}
            alt={product.name}
            type={product.type}
            aspectRatio="aspect-[16/9]"
          />
        </Link>

        {/* Badges & Stock */}
        <div className="flex items-center justify-between gap-2">
          {getTypeBadge()}
          {product.type === 'code' && (
            <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${
              (product.stock_count || 0) > 0
                ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-800'
                : 'bg-rose-950/80 text-rose-300 border border-rose-800'
            }`}>
              Stok: {product.stock_count ?? 0}
            </span>
          )}
        </div>

        {/* Title */}
        <Link
          to={`/produk/${product.slug}`}
          className="text-base font-bold text-white hover:text-indigo-300 transition-colors line-clamp-2 block focus-visible:ring-2 focus-visible:ring-indigo-500 rounded"
        >
          {product.name}
        </Link>

        <p className="text-xs text-slate-400 line-clamp-2 leading-relaxed">
          {product.description || 'Tidak ada deskripsi produk.'}
        </p>
      </div>

      {/* Pricing & Action */}
      <div className="pt-4 mt-4 border-t border-slate-800/80 flex items-center justify-between gap-3">
        <div>
          <span className="text-[10px] text-slate-400 uppercase tracking-wider block">Harga</span>
          <span className="text-base font-extrabold text-white">
            {product.type === 'herosms' ? 'Konfigurator' : formatPrice(product.price)}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <Link
            to={`/produk/${product.slug}`}
            className="px-3 min-h-[44px] rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition-all flex items-center justify-center focus-visible:ring-2 focus-visible:ring-indigo-500"
          >
            {product.type === 'herosms' ? 'Konfigurasi' : 'Detail'}
          </Link>

          <button
            onClick={handleAction}
            disabled={product.type === 'code' && (product.stock_count || 0) <= 0}
            className="w-11 h-11 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 disabled:text-slate-600 text-white shadow-md shadow-indigo-600/20 transition-all flex items-center justify-center shrink-0 focus-visible:ring-2 focus-visible:ring-indigo-500"
            title={product.type === 'herosms' ? 'Buka Konfigurator OTP' : 'Tambah ke Keranjang'}
            aria-label={product.type === 'herosms' ? 'Buka Konfigurator OTP' : 'Tambah ke Keranjang'}
          >
            {product.type === 'herosms' ? <SlidersHorizontal className="w-5 h-5" /> : <ShoppingCart className="w-5 h-5" />}
          </button>
        </div>
      </div>
    </div>
  );
};
