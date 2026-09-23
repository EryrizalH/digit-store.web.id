import { describe, it, expect, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('F-022 Frontend Reliability: Orders & Clipboard Error Handling', () => {
  const ordersPagePath = path.resolve(__dirname, '../src/pages/OrdersPage.tsx');
  const ordersViewPath = path.resolve(__dirname, '../src/components/OrdersView.tsx');

  const ordersPageSource = fs.readFileSync(ordersPagePath, 'utf8');
  const ordersViewSource = fs.readFileSync(ordersViewPath, 'utf8');

  describe('src/pages/OrdersPage.tsx Contract Verification', () => {
    it('declares explicit error states for order list, order detail, and clipboard', () => {
      expect(ordersPageSource).toContain('const [error, setError] = useState<string | null>(null)');
      expect(ordersPageSource).toContain('const [detailError, setDetailError] = useState<string | null>(null)');
      expect(ordersPageSource).toContain('const [copyError, setCopyError] = useState<string | null>(null)');
    });

    it('safely awaits navigator.clipboard.writeText within try/catch', () => {
      expect(ordersPageSource).toContain('await navigator.clipboard.writeText');
      // Must not ignore clipboard error silently
      expect(ordersPageSource).not.toMatch(/catch\s*\{\s*\/\/\s*ignore/);
      expect(ordersPageSource).toContain('setCopyError(');
    });

    it('provides user-visible error display with retry for order-list fetch failure', () => {
      expect(ordersPageSource).toContain('Gagal Memuat Pesanan');
      expect(ordersPageSource).toContain('Coba Lagi');
      expect(ordersPageSource).toContain('fetchOrders()');
    });

    it('provides user-visible error display with retry for order-detail fetch failure', () => {
      expect(ordersPageSource).toContain('Gagal Memuat Rincian Pesanan');
      expect(ordersPageSource).toContain('fetchOrderDetail');
      expect(ordersPageSource).toContain('role="alert"');
    });

    it('provides user-visible feedback and accessible live region for clipboard failures', () => {
      expect(ordersPageSource).toContain('role="alert"');
      expect(ordersPageSource).toContain('aria-live="polite"');
      expect(ordersPageSource).toContain('Gagal menyalin ke clipboard. Silakan salin manual.');
    });

    it('does not expose internal secrets or technical debug details in error UI', () => {
      expect(ordersPageSource).not.toContain('stack');
      expect(ordersPageSource).not.toContain('TOKEN');
      expect(ordersPageSource).not.toContain('SECRET');
    });
  });

  describe('src/components/OrdersView.tsx Contract Verification', () => {
    it('declares explicit error states for order detail and clipboard', () => {
      expect(ordersViewSource).toContain('const [detailError, setDetailError] = useState<string | null>(null)');
      expect(ordersViewSource).toContain('const [copyError, setCopyError] = useState<string | null>(null)');
    });

    it('safely awaits navigator.clipboard.writeText within try/catch', () => {
      expect(ordersViewSource).toContain('await navigator.clipboard.writeText');
      expect(ordersViewSource).toContain('setCopyError(');
    });

    it('replaces ignored fetch failure with detailError state and retry button', () => {
      expect(ordersViewSource).not.toMatch(/fetchOrderDetail[^}]+catch\s*\{\s*\/\/\s*ignore/);
      expect(ordersViewSource).toContain('Gagal Memuat Rincian Pesanan');
      expect(ordersViewSource).toContain('role="alert"');
    });

    it('provides accessible feedback for clipboard write failures', () => {
      expect(ordersViewSource).toContain('role="alert"');
      expect(ordersViewSource).toContain('aria-live="polite"');
      expect(ordersViewSource).toContain('Gagal menyalin ke clipboard. Silakan salin manual.');
    });
  });

  describe('Clipboard Copy Logic Emulation', () => {
    // ponytail: test clipboard handler behavior when browser API rejects or succeeds
    async function executeSafeCopy(
      text: string,
      clipboardMock?: { writeText: (val: string) => Promise<void> }
    ) {
      let copied: string | null = null;
      let error: string | null = null;

      try {
        error = null;
        if (!clipboardMock?.writeText) {
          throw new Error('Clipboard API unavailable');
        }
        await clipboardMock.writeText(text);
        copied = text;
      } catch {
        error = 'Gagal menyalin ke clipboard. Silakan salin manual.';
      }

      return { copied, error };
    }

    it('successfully copies when clipboard permission is granted', async () => {
      const mockClipboard = {
        writeText: vi.fn().mockResolvedValue(undefined),
      };
      const result = await executeSafeCopy('CODE-12345', mockClipboard);
      expect(result.copied).toBe('CODE-12345');
      expect(result.error).toBeNull();
      expect(mockClipboard.writeText).toHaveBeenCalledWith('CODE-12345');
    });

    it('catches permission denial and sets user-friendly Indonesian error without throwing', async () => {
      const mockClipboard = {
        writeText: vi.fn().mockRejectedValue(new Error('NotAllowedError: Permission denied')),
      };
      const result = await executeSafeCopy('CODE-12345', mockClipboard);
      expect(result.copied).toBeNull();
      expect(result.error).toBe('Gagal menyalin ke clipboard. Silakan salin manual.');
    });

    it('handles environments where navigator.clipboard is undefined', async () => {
      const result = await executeSafeCopy('CODE-12345', undefined);
      expect(result.copied).toBeNull();
      expect(result.error).toBe('Gagal menyalin ke clipboard. Silakan salin manual.');
    });
  });
});
