import type { Pool } from 'pg';
import { getPool } from '../db';

export function getDb(): Pool | null {
  return getPool();
}

export function hasDb(): boolean {
  return getPool() != null;
}
