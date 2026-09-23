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

  const balanceStmt = db.prepare(`
    INSERT INTO user_credits (user_id, balance, updated_at)
    VALUES (?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(user_id) DO UPDATE SET balance = balance + ?, updated_at = CURRENT_TIMESTAMP
  `).bind(userId, amount, amount);

  const txnStmt = db.prepare(`
    INSERT INTO credit_transactions (id, user_id, type, amount, reference_id, description, created_at)
    VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
  `).bind(txnId, userId, type, amount, referenceId || null, description || null);

  if (typeof db.batch === 'function') {
    await db.batch([balanceStmt, txnStmt]);
  } else {
    await balanceStmt.run();
    await txnStmt.run();
  }

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
  if (!Number.isFinite(amount) || amount <= 0) {
    return { success: false, error: 'Invalid debit amount' };
  }

  // ponytail: Idempotency check - return existing debit if this reference_id was already processed
  if (referenceId) {
    const existing = await db.prepare(
      "SELECT * FROM credit_transactions WHERE reference_id = ? AND type = 'debit' LIMIT 1"
    ).bind(referenceId).first<CreditTransaction>();

    if (existing) {
      return { success: true, transaction: existing };
    }
  }

  const txnId = `crtx_${crypto.randomUUID()}`;

  // ponytail: Atomic D1 batch - decrement balance only if sufficient (balance >= amount),
  // and insert ledger row only if the decrement affected a row ((SELECT changes()) > 0).
  // If either fails, rolls back, or reports 0 changes, neither table is modified.
  const balanceStmt = db.prepare(`
    UPDATE user_credits SET balance = balance - ?, updated_at = CURRENT_TIMESTAMP
    WHERE user_id = ? AND balance >= ?
  `).bind(amount, userId, amount);

  const txnStmt = db.prepare(`
    INSERT INTO credit_transactions (id, user_id, type, amount, reference_id, description, created_at)
    SELECT ?, ?, 'debit', ?, ?, ?, CURRENT_TIMESTAMP
    WHERE (SELECT changes()) > 0
  `).bind(txnId, userId, amount, referenceId || null, description || null);

  try {
    let batchResults: any[];
    if (typeof db.batch === 'function') {
      batchResults = await db.batch([balanceStmt, txnStmt]);
    } else {
      const bRes = await balanceStmt.run();
      const bChanges = bRes?.meta?.changes ?? (bRes as any)?.changes ?? 0;
      const tRes = bChanges > 0 ? await txnStmt.run() : { success: true, meta: { changes: 0 } };
      batchResults = [bRes, tRes];
    }

    const balanceChanges = batchResults[0]?.meta?.changes ?? (batchResults[0] as any)?.changes ?? 0;
    const txnChanges = batchResults[1]?.meta?.changes ?? (batchResults[1] as any)?.changes ?? 0;

    // Inspect affected rows: both statements must affect at least 1 row
    if (balanceChanges === 0 || txnChanges === 0) {
      return { success: false, error: 'Insufficient credit balance' };
    }

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
  } catch (err: any) {
    // Retry/race guard: if a duplicate reference was committed concurrently, return the existing debit
    if (referenceId) {
      const existing = await db.prepare(
        "SELECT * FROM credit_transactions WHERE reference_id = ? AND type = 'debit' LIMIT 1"
      ).bind(referenceId).first<CreditTransaction>();

      if (existing) {
        return { success: true, transaction: existing };
      }
    }
    return { success: false, error: err?.message || 'Debit transaction failed' };
  }
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
