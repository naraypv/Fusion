import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import {
  PLAN_FORMAT_VERSION,
  PlanStore,
  type PlanArtifact,
} from "../index.js";

const tempRoots: string[] = [];

function plan(): PlanArtifact {
  return {
    plan_format_version: PLAN_FORMAT_VERSION,
    id: "ledger-plan",
    title: "Ledger Plan",
    status: "active",
    created_at: "2026-05-04T00:00:00.000Z",
    updated_at: "2026-05-04T00:00:00.000Z",
    active_goal_id: "goal-1",
    goals: [
      {
        id: "goal-1",
        title: "Goal 1",
        objective: "Record ledger",
        status: "ready",
        depends_on: [],
      },
    ],
  };
}

async function makeStore(): Promise<PlanStore> {
  const root = await mkdtemp(join(tmpdir(), "fusion-plan-ledger-"));
  tempRoots.push(root);
  return new PlanStore({
    fusionDir: join(root, ".fusion"),
    now: () => "2026-05-04T00:00:01.000Z",
  });
}

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("plan ledger", () => {
  it("returns an empty ledger for plans without a ledger file", async () => {
    const store = await makeStore();

    await expect(store.readLedger("missing-plan")).resolves.toEqual([]);
  });

  it("appends and reads JSONL ledger events", async () => {
    const store = await makeStore();
    await store.createPlan(plan());
    await store.appendLedgerEvent("ledger-plan", {
      event: "custom",
      timestamp: "2026-05-04T00:00:02.000Z",
      plan_id: "ledger-plan",
      metadata: { source: "test" },
    });

    const ledger = await store.readLedger("ledger-plan");
    expect(ledger).toHaveLength(2);
    expect(ledger[1]).toMatchObject({
      event: "custom",
      timestamp: "2026-05-04T00:00:02.000Z",
      plan_id: "ledger-plan",
      metadata: { source: "test" },
    });
  });
});
