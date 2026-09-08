import { sql } from './db';

export type RuleRow = {
  id: string; owner: string; product: string; schedule: string; status: 'live' | 'waiting' | 'off'; needs: string | null;
  description: string; severity: string; cooldown_hours: number; params: Record<string, unknown>; gates: Record<string, unknown>;
  source: string | null; last_ran_at: string | null; updated_at: string;
};

export async function getRuleManifest(): Promise<RuleRow[]> {
  return (await sql`SELECT * FROM rule_manifest ORDER BY (status = 'live') DESC, product, id`) as RuleRow[];
}
