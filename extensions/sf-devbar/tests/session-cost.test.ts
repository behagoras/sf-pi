/* SPDX-License-Identifier: Apache-2.0 */
import { beforeEach, describe, expect, it } from "vitest";
import {
  formatSessionCostSegment,
  formatUsd,
  recordedEntryCost,
  recordedSessionCost,
  recordedSessionCostFromEntries,
  resetSessionCostCache,
} from "../lib/session-cost.ts";

beforeEach(() => resetSessionCostCache());

describe("recordedEntryCost", () => {
  it("reads assistant and tool-result usage recorded by Pi", () => {
    expect(
      recordedEntryCost({
        type: "message",
        message: { role: "assistant", usage: { cost: { total: 0.42 } } },
      }),
    ).toBe(0.42);
    expect(
      recordedEntryCost({
        type: "message",
        message: { role: "toolResult", usage: { cost: { total: 0.08 } } },
      }),
    ).toBe(0.08);
  });

  it("reads compaction and branch-summary usage", () => {
    expect(recordedEntryCost({ type: "compaction", usage: { cost: { total: 0.11 } } })).toBe(0.11);
    expect(recordedEntryCost({ type: "branch_summary", usage: { cost: { total: 0.07 } } })).toBe(
      0.07,
    );
  });

  it("ignores missing, invalid, and negative values", () => {
    expect(recordedEntryCost(null)).toBe(0);
    expect(recordedEntryCost({ type: "message", message: { role: "user" } })).toBe(0);
    expect(
      recordedEntryCost({
        type: "message",
        message: { role: "assistant", usage: { cost: { total: Number.NaN } } },
      }),
    ).toBe(0);
    expect(
      recordedEntryCost({
        type: "message",
        message: { role: "assistant", usage: { cost: { total: -1 } } },
      }),
    ).toBe(0);
  });
});

describe("recordedSessionCost", () => {
  it("sums every recorded cost-bearing session entry", () => {
    expect(
      recordedSessionCost([
        { type: "message", message: { role: "assistant", usage: { cost: { total: 0.42 } } } },
        { type: "message", message: { role: "toolResult", usage: { cost: { total: 0.08 } } } },
        { type: "compaction", usage: { cost: { total: 0.11 } } },
        { type: "message", message: { role: "user", content: "hello" } },
      ]),
    ).toBeCloseTo(0.61, 8);
  });
});

describe("recordedSessionCostFromEntries", () => {
  it("memoizes while the append-only entry count is unchanged", () => {
    let calls = 0;
    const entries: unknown[] = [
      { type: "message", message: { role: "assistant", usage: { cost: { total: 0.42 } } } },
    ];
    const source = {
      getEntries: () => {
        calls += 1;
        return entries;
      },
    };

    expect(recordedSessionCostFromEntries(source)).toBe(0.42);
    expect(recordedSessionCostFromEntries(source)).toBe(0.42);
    expect(calls).toBe(2);

    entries.push({ type: "compaction", usage: { cost: { total: 0.08 } } });
    expect(recordedSessionCostFromEntries(source)).toBeCloseTo(0.5, 8);
  });

  it("fails soft for missing or stale session sources", () => {
    expect(recordedSessionCostFromEntries(undefined)).toBe(0);
    expect(
      recordedSessionCostFromEntries({
        getEntries: () => {
          throw new Error("stale session");
        },
      }),
    ).toBe(0);
  });
});

describe("formatting", () => {
  it("shows sub-cent values without flattening them to zero", () => {
    expect(formatUsd(0.004)).toBe("$0.004");
    expect(formatUsd(0.42)).toBe("$0.42");
  });

  it("hides sessions whose provider reports zero marginal cost", () => {
    expect(formatSessionCostSegment(0)).toBe("");
    expect(formatSessionCostSegment(0.42)).toBe("$0.42 session");
  });
});
