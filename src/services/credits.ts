// ponytail: Credit system service for balance management (topup, debit, refund) with atomic D1 operations
import { CreditTransaction, CreditTransactionType, UserCredit } from '../types';

export async function getBalance(db: D1Database, userId: string): Promise<number> {
  const row = await db.prepare('SELECT balance FROM user_credits WHERE user_id = ?')
    .bind(userId).first<{ balance: number }>();
  return row?.balance ?? 0;
}

export async function addCredit(
  db: D1Database,
  userId: string,
  amount: number,
  type: CreditTransactionType,
  referenceId?: string,
  description?: string
): Promise<CreditTransaction> {
  const txnId = `crtx_${crypto.randomUUID()}`;

  // Upsert user_credits balance
  await db.prepare(`
    INSERT INTO user_credits (user_id, balance, updated_at)
    VALUES (?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(user_id) DO UPDATE SET balance = balance + ?, updated_at = CURRENT_TIMESTAMP
  `).bind(userId, amount, amount).run();

  // Insert credit transaction record
  await db.prepare(`
    INSERT INTO credit_transactions (id, user_id, type, amount, reference_id, description, created_at)
    VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
  `).bind(txnId, userId, type, amount, referenceId || null, description || null).run();

  return {
    id: txnId,
    user_id: userId,
    type,
    amount,
    reference_id: referenceId || null,
    description: description || null,
    created_at: new Date().toISOString()
  };
}

export async function debitCredit(
  db: D1Database,
  userId: string,
  amount: number,
  referenceId?: string,
  description?: string
): Promise<{ success: boolean; transaction?: CreditTransaction; error?: string }> {
  const currentBalance = await getBalance(db, userId);

  if (currentBalance < amount) {
    return { success: false, error: 'Insufficient credit balance' };
  }

  const txnId = `crtx_${crypto.randomUUID()}`;

  // Deduct balance
  await db.prepare(`
    UPDATE user_credits SET balance = balance - ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?
  `).bind(amount, userId).run();

  // Insert debit transaction
  await db.prepare(`
    INSERT INTO credit_transactions (id, user_id, type, amount, reference_id, description, created_at)
    VALUES (?, ?, 'debit', ?, ?, ?, CURRENT_TIMESTAMP)
  `).bind(txnId, userId, amount, referenceId || null, description || null).run();

  return {
    success: true,
    transaction: {
      id: txnId,
      user_id: userId,
      type: 'debit',
      amount,
      reference_id: referenceId || null,
      description: description || null,
      created_at: new Date().toISOString()
    }
  };
}

export async function refundCredit(
  db: D1Database,
  userId: string,
  amount: number,
  referenceId?: string,
  description?: string
): Promise<CreditTransaction> {
  return addCredit(db, userId, amount, 'refund', referenceId, description);
}
