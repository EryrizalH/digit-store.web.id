import { describe, expect, it } from 'vitest';
import { refundFailedOrderItem } from '../src/services/fulfilment';

function createRefundDb() {
  const state = {
    balance: 0,
    itemStatus: 'failed',
    orderStatus: 'paid',
    refunds: [] as any[],
    audits: [] as any[]
  };

  const db: any = {
    prepare(sql: string) {
      const normalized = sql.toLowerCase();
      let args: any[] = [];
      const statement: any = {
        sql,
        bind(...bound: any[]) { args = bound; return statement; },
        async first() {
          if (normalized.includes('select * from order_items')) {
            return { id: 'item-1', order_id: 'ord-1', product_name: 'OTP', price: 10000, quantity: 1, fulfilment_status: state.itemStatus };
          }
          if (normalized.includes("credit_transactions") && normalized.includes("type = 'refund'")) {
            return state.refunds.find((row) => row.reference_id === args[0]) || null;
          }
          if (normalized.includes("credit_transactions") && normalized.includes("type = 'debit'")) {
            return { id: 'debit-1' };
          }
          if (normalized.includes('select total_amount from orders')) return { total_amount: 9000 };
          if (normalized.includes('select count(*) as total')) return { total: 1, refunded: state.itemStatus === 'refunded' ? 1 : 0 };
          return null;
        },
        async all() {
          if (normalized.includes('select price, quantity from order_items')) return { results: [{ price: 10000, quantity: 1 }, { price: 10000, quantity: 1 }] };
          return { results: [] };
        },
        async run() {
          if (normalized.includes('update order_items set fulfilment_status')) state.itemStatus = args[0] === 'OTP_TIMEOUT' ? 'failed' : 'refunded';
          if (normalized.includes("update orders set payment_status = 'refunded'")) state.orderStatus = 'refunded';
          if (normalized.includes('insert into audit_logs')) state.audits.push(args);
          return { success: true, meta: { changes: 1 } };
        }
      };
      return statement;
    },
    async batch(statements: any[]) {
      for (const stmt of statements) {
        const sql = stmt.sql?.toLowerCase?.() || '';
        if (sql.includes('insert into user_credits')) state.balance += 4500;
        if (sql.includes('insert into credit_transactions')) {
          state.refunds.push({ id: 'refund-1', user_id: 'user-1', type: 'refund', amount: 4500, reference_id: 'refund-item-1' });
        }
      }
      return statements.map(() => ({ success: true, meta: { changes: 1 } }));
    }
  };

  return { db, state };
}

describe('wallet refund flows', () => {
  it('refunds only the charged amount after an order discount and is idempotent', async () => {
    const { db, state } = createRefundDb();
    const env: any = { DB: db };

    const first = await refundFailedOrderItem('ord-1', 'item-1', 'user-1', env, 'otp');
    expect(first).toMatchObject({ refunded: true, amount: 4500 });
    expect(state.balance).toBe(4500);
    expect(state.itemStatus).toBe('refunded');
    expect(state.orderStatus).toBe('refunded');

    const second = await refundFailedOrderItem('ord-1', 'item-1', 'user-1', env, 'otp');
    expect(second).toMatchObject({ refunded: true, alreadyRefunded: true, amount: 4500 });
    expect(state.balance).toBe(4500);
  });
});
