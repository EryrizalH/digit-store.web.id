// ponytail: Focused unit & integration tests for artwork upload auth, validation, visibility, and private key non-leakage
import { describe, it, expect, vi } from 'vitest';
import app from '../src/index';
import { Env } from '../src/types';

function createMockEnv(overrides: Partial<Env> = {}): Env {
  const mockDb = {
    prepare: vi.fn().mockReturnValue({
      bind: vi.fn().mockReturnThis(),
      first: vi.fn(),
      all: vi.fn(),
      run: vi.fn().mockResolvedValue({ success: true }),
    }),
    batch: vi.fn().mockResolvedValue([]),
  } as any;

  const mockR2 = {
    get: vi.fn(),
    put: vi.fn().mockResolvedValue({}),
  } as any;

  const mockKv = {
    get: vi.fn(),
    put: vi.fn(),
  } as any;

  return {
    DB: mockDb,
    FILES_BUCKET: mockR2,
    RATE_LIMIT_KV: mockKv,
    ASSETS: {} as any,
    ...overrides,
  };
}

describe('Artwork API & Non-Leakage Tests', () => {
  it('should require admin auth for POST /api/products/admin/:id/artwork', async () => {
    const env = createMockEnv();
    (env.DB.prepare as any)().first.mockResolvedValue(null);

    const res = await app.request('/api/products/admin/prd_123/artwork', {
      method: 'POST',
    }, env);

    expect(res.status).toBe(403);
    const body = await res.json() as any;
    expect(body.error).toContain('Unauthorized');
  });

  it('should reject invalid file types for artwork upload', async () => {
    const env = createMockEnv();

    env.DB.prepare = vi.fn().mockImplementation((query: string) => {
      const q = query.toLowerCase();
      if (q.includes('sessions')) {
        return {
          bind: () => ({
            first: async () => ({ id: 'usr_admin', email: 'admin@test.com', role: 'admin' })
          })
        };
      }
      if (q.includes('products')) {
        return {
          bind: () => ({
            first: async () => ({ id: 'prd_123', slug: 'test-product' })
          })
        };
      }
      return { bind: () => ({ first: async () => null, run: async () => ({}) }) };
    }) as any;

    const formData = new FormData();
    const textBlob = new Blob(['invalid content'], { type: 'text/plain' });
    formData.append('file', textBlob, 'test.txt');

    const res = await app.request('/api/products/admin/prd_123/artwork', {
      method: 'POST',
      headers: { Cookie: 'session=sess_admin' },
      body: formData,
    }, env);

    expect(res.status).toBe(400);
    const body = await res.json() as any;
    expect(body.error).toContain('Invalid file type');
  });

  it('should reject files exceeding 2 MiB limit', async () => {
    const env = createMockEnv();

    env.DB.prepare = vi.fn().mockImplementation((query: string) => {
      const q = query.toLowerCase();
      if (q.includes('sessions')) {
        return {
          bind: () => ({
            first: async () => ({ id: 'usr_admin', email: 'admin@test.com', role: 'admin' })
          })
        };
      }
      if (q.includes('products')) {
        return {
          bind: () => ({
            first: async () => ({ id: 'prd_123', slug: 'test-product' })
          })
        };
      }
      return { bind: () => ({ first: async () => null, run: async () => ({}) }) };
    }) as any;

    const formData = new FormData();
    const largeBuffer = new Uint8Array(2 * 1024 * 1024 + 100);
    const largeBlob = new Blob([largeBuffer], { type: 'image/png' });
    formData.append('file', largeBlob, 'large.png');

    const res = await app.request('/api/products/admin/prd_123/artwork', {
      method: 'POST',
      headers: { Cookie: 'session=sess_admin' },
      body: formData,
    }, env);

    expect(res.status).toBe(400);
    const body = await res.json() as any;
    expect(body.error).toContain('2 MiB');
  });

  it('should sanitize public product list by stripping r2_key and image_key, providing artwork_url', async () => {
    const env = createMockEnv();

    env.DB.prepare = vi.fn().mockImplementation(() => ({
      bind: vi.fn().mockReturnThis(),
      all: async () => ({
        results: [
          {
            id: 'prd_1',
            name: 'Secret Script',
            slug: 'secret-script',
            price: 50000,
            type: 'file',
            r2_key: 'private-files/secret.zip',
            image_key: 'product-artwork/prd_1.png',
            is_active: 1,
            created_at: '2026-01-01',
            category_name: 'Software',
            stock_count: 5,
          }
        ]
      })
    })) as any;

    const res = await app.request('/api/products', { method: 'GET' }, env);
    expect(res.status).toBe(200);

    const body = await res.json() as any;
    expect(body.products).toHaveLength(1);
    const prod = body.products[0];

    // Verify private keys are NOT present
    expect(prod.r2_key).toBeUndefined();
    expect(prod.image_key).toBeUndefined();

    // Verify allowed fields & artwork_url ARE present
    expect(prod.category_name).toBe('Software');
    expect(prod.stock_count).toBe(5);
    expect(prod.artwork_url).toBe('/api/products/secret-script/artwork');
  });

  it('should sanitize public product detail by slug, stripping r2_key and image_key', async () => {
    const env = createMockEnv();

    env.DB.prepare = vi.fn().mockImplementation(() => ({
      bind: () => ({
        first: async () => ({
          id: 'prd_2',
          name: 'Voucher Premium',
          slug: 'voucher-premium',
          price: 25000,
          type: 'code',
          r2_key: 'private/secret.key',
          image_key: 'product-artwork/prd_2.png',
          is_active: 1,
          created_at: '2026-01-01',
          category_name: 'Voucher',
          stock_count: 10,
        })
      })
    })) as any;

    const res = await app.request('/api/products/by-slug/voucher-premium', { method: 'GET' }, env);
    expect(res.status).toBe(200);

    const body = await res.json() as any;
    const prod = body.product;

    expect(prod.r2_key).toBeUndefined();
    expect(prod.image_key).toBeUndefined();
    expect(prod.artwork_url).toBe('/api/products/voucher-premium/artwork');
    expect(prod.category_name).toBe('Voucher');
    expect(prod.stock_count).toBe(10);
  });

  it('should return 404 for public detail when product is inactive', async () => {
    const env = createMockEnv();

    env.DB.prepare = vi.fn().mockImplementation(() => ({
      bind: () => ({
        first: async () => null // inactive or not found
      })
    })) as any;

    const res = await app.request('/api/products/by-slug/inactive-product', { method: 'GET' }, env);
    expect(res.status).toBe(404);
  });

  it('should return 404 for artwork streaming when product has no image_key or is inactive', async () => {
    const env = createMockEnv();

    env.DB.prepare = vi.fn().mockImplementation(() => ({
      bind: () => ({
        first: async () => null // inactive or missing artwork
      })
    })) as any;

    const res = await app.request('/api/products/inactive-product/artwork', { method: 'GET' }, env);
    expect(res.status).toBe(404);
  });
});
