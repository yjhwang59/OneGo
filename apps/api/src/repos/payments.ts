import type { Pool } from 'pg';
import type { Payment, PaymentStatus } from '../store';

function rowToPayment(r: Record<string, unknown>): Payment {
  return {
    id: r.id as string,
    registrationId: r.registration_id as string,
    status: r.status as PaymentStatus,
    providerKey: r.provider_key as string,
    providerRef: r.provider_ref as string | undefined,
    amountCents: Number(r.amount_cents),
    currency: (r.currency as string) ?? 'TWD',
    createdAt: (r.created_at as Date)?.toISOString?.() ?? new Date().toISOString(),
    updatedAt: (r.updated_at as Date)?.toISOString?.() ?? new Date().toISOString()
  };
}

export async function createPayment(
  pool: Pool,
  params: {
    id: string;
    registrationId: string;
    providerKey: string;
    amountCents: number;
    currency: string;
  }
): Promise<Payment> {
  const now = new Date().toISOString();
  await pool.query(
    'INSERT INTO payments (id, registration_id, status, provider_key, amount_cents, currency, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7::timestamptz, $7::timestamptz)',
    [params.id, params.registrationId, 'initiated', params.providerKey, params.amountCents, params.currency, now]
  );
  return {
    id: params.id,
    registrationId: params.registrationId,
    status: 'initiated',
    providerKey: params.providerKey,
    amountCents: params.amountCents,
    currency: params.currency,
    createdAt: now,
    updatedAt: now
  };
}

export async function getPayment(pool: Pool, id: string): Promise<Payment | null> {
  const r = await pool.query(
    'SELECT id, registration_id, status, provider_key, provider_ref, amount_cents, currency, created_at, updated_at FROM payments WHERE id = $1',
    [id]
  );
  if (r.rows.length === 0) return null;
  return rowToPayment(r.rows[0]);
}

export async function updatePaymentStatus(
  pool: Pool,
  id: string,
  status: PaymentStatus
): Promise<Payment | null> {
  const now = new Date().toISOString();
  await pool.query(
    'UPDATE payments SET status = $1, updated_at = $2::timestamptz WHERE id = $3',
    [status, now, id]
  );
  return getPayment(pool, id);
}
