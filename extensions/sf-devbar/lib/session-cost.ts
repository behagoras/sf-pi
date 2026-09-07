/* SPDX-License-Identifier: Apache-2.0 */
/** Read and format the cost Pi already records on session entries. */

export interface UsageCost {
  cost?: {
    total?: number;
  };
}

export interface SessionEntrySource {
  getEntries(): ReadonlyArray<unknown>;
}

function positive(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : 0;
}

/** Return the cost recorded on one Pi session entry without inferring provider prices. */
export function recordedEntryCost(entry: unknown): number {
  if (typeof entry !== "object" || entry === null) return 0;
  const record = entry as Record<string, unknown>;

  if (record.type === "message") {
    const message = record.message;
    if (typeof message !== "object" || message === null) return 0;
    return positive(
      ((message as Record<string, unknown>).usage as UsageCost | undefined)?.cost?.total,
    );
  }

  if (record.type === "compaction" || record.type === "branch_summary") {
    return positive((record.usage as UsageCost | undefined)?.cost?.total);
  }

  return 0;
}

/** Sum authoritative cost values already stored by Pi for the current session. */
export function recordedSessionCost(entries: ReadonlyArray<unknown>): number {
  return entries.reduce<number>((total, entry) => total + recordedEntryCost(entry), 0);
}

let memo: { count: number; total: number } | null = null;

/** Read the current session total and fail soft so footer rendering cannot throw. */
export function recordedSessionCostFromEntries(source: SessionEntrySource | undefined): number {
  if (!source) return 0;
  try {
    const entries = source.getEntries();
    if (memo?.count === entries.length) return memo.total;
    const total = recordedSessionCost(entries);
    memo = { count: entries.length, total };
    return total;
  } catch {
    return 0;
  }
}

/** Prevent one session from reusing another session's memoized total. */
export function resetSessionCostCache(): void {
  memo = null;
}

export function formatUsd(usd: number): string {
  if (!Number.isFinite(usd) || usd <= 0) return "$0.00";
  if (usd < 0.01) return `$${usd.toFixed(3)}`;
  return `$${usd.toFixed(2)}`;
}

/** Hide zero-cost sessions because some providers intentionally report no marginal cost. */
export function formatSessionCostSegment(usd: number): string {
  return usd > 0 ? `${formatUsd(usd)} session` : "";
}
