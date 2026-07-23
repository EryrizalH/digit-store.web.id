// ponytail: App root with React.lazy route code-splitting, Suspense fallback, and React Router routes
import React, { Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { CartProvider } from './context/CartContext';
import { Navbar } from './components/Navbar';
import { RefreshCw } from 'lucide-react';

const CatalogPage = React.lazy(() => import('./pages/CatalogPage').then(m => ({ default: m.CatalogPage })));
const ProductDetailPage = React.lazy(() => import('./pages/ProductDetailPage').then(m => ({ default: m.ProductDetailPage })));
const CartPage = React.lazy(() => import('./pages/CartPage').then(m => ({ default: m.CartPage })));
const AuthPage = React.lazy(() => import('./pages/AuthPage').then(m => ({ default: m.AuthPage })));
const OrdersPage = React.lazy(() => import('./pages/OrdersPage').then(m => ({ default: m.OrdersPage })));
const AdminPanel = React.lazy(() => import('./components/AdminPanel').then(m => ({ default: m.AdminPanel })));

const PageFallback: React.FC = () => (
  <div className="flex-1 flex items-center justify-center py-24 text-slate-400 text-xs">
    <RefreshCw className="w-5 h-5 animate-spin text-indigo-400 mr-2" />
    <span>Memuat halaman...</span>
  </div>
);

export const AppContent: React.FC = () => {
  return (
    <div className="min-h-screen flex flex-col bg-[#090d16] text-slate-100 selection:bg-indigo-500 selection:text-white">
      <Navbar />

      <Suspense fallback={<PageFallback />}>
        <Routes>
          <Route path="/" element={<CatalogPage />} />
          <Route path="/produk/:slug" element={<ProductDetailPage />} />
          <Route path="/keranjang" element={<CartPage />} />
          <Route path="/masuk" element={<AuthPage initialMode="login" />} />
          <Route path="/daftar" element={<AuthPage initialMode="register" />} />
          <Route path="/pesanan" element={<OrdersPage />} />
          <Route path="/pesanan/:id" element={<OrdersPage />} />
          <Route path="/admin" element={<AdminPanel />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>

      <footer className="mt-auto border-t border-slate-800/80 py-6 px-4 text-center text-xs text-slate-500">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3">
          <span>© 2026 DigitStore — Digital Storefront</span>
          <span className="flex items-center gap-2 text-[11px] text-slate-500">
            <span>D1 Database</span> • <span>R2 Storage</span> • <span>Hono + React</span>
          </span>
        </div>
      </footer>
    </div>
  );
};

export const App: React.FC = () => {
  return (
    <AuthProvider>
      <CartProvider>
        <AppContent />
      </CartProvider>
    </AuthProvider>
  );
};
