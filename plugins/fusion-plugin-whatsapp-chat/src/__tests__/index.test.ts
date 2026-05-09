import { describe, expect, it } from "vitest";
import plugin, { ensureSchema, getDedupeRetentionDays, markProcessed, splitMessageForWhatsapp, wasProcessed } from "../index.js";

function createInMemoryDb() {
  const dedupe = new Map<string, { sender: string; receivedAt: string }>();

  return {
    exec(_sql: string) {},
    prepare(sql: string) {
      return {
        get: (...args: unknown[]) => {
          if (sql.includes("FROM whatsapp_chat_dedupe") && sql.includes("messageId = ?")) {
            const row = dedupe.get(args[0] as string);
            return row ? { found: 1, ...row } : undefined;
          }
          return undefined;
        },
        run: (...args: unknown[]) => {
          if (sql.includes("INSERT INTO whatsapp_chat_dedupe")) {
            dedupe.set(args[0] as string, {
              sender: args[1] as string,
              receivedAt: args[2] as string,
            });
          }
          if (sql.includes("DELETE FROM whatsapp_chat_dedupe WHERE receivedAt < ?")) {
            const cutoff = args[0] as string;
            for (const [id, row] of dedupe.entries()) {
              if (row.receivedAt < cutoff) dedupe.delete(id);
            }
          }
        },
      };
    },
    _dedupe: dedupe,
  };
}

describe("whatsapp plugin", () => {
  it("registers schema init hook", () => {
    expect(plugin.hooks?.onSchemaInit).toBeDefined();
  });

  it("registers pairing routes", () => {
    const paths = (plugin.routes ?? []).map((route) => `${route.method} ${route.path}`);
    expect(paths).toContain("GET /status");
    expect(paths).toContain("GET /qr");
    expect(paths).toContain("POST /pair-code");
    expect(paths).toContain("POST /logout");
  });

  it("uses only pairing-era settings", () => {
    const schema = plugin.manifest.settingsSchema ?? {};
    expect(Object.keys(schema).sort()).toEqual([
      "agentSystemPrompt",
      "allowedSenders",
      "dedupeRetentionDays",
      "historyTurnLimit",
      "pairingMode",
      "pairingPhoneNumber",
    ]);
  });

  it("splits oversized messages", () => {
    const chunks = splitMessageForWhatsapp("x".repeat(9000));
    expect(chunks.length).toBeGreaterThan(2);
    expect(chunks[0].length).toBeLessThanOrEqual(4096);
  });
});

describe("markProcessed retention", () => {
  it("prunes rows older than retention and keeps recent rows", () => {
    const db = createInMemoryDb();
    ensureSchema(db as any);
    const now = Date.now();

    db.prepare("INSERT INTO whatsapp_chat_dedupe(messageId, sender, receivedAt) VALUES(?, ?, ?)").run(
      "old-id",
      "sender",
      new Date(now - 30 * 86_400_000).toISOString(),
    );
    db.prepare("INSERT INTO whatsapp_chat_dedupe(messageId, sender, receivedAt) VALUES(?, ?, ?)").run(
      "recent-id",
      "sender",
      new Date(now - 3_600_000).toISOString(),
    );

    markProcessed(db as any, "new-id", "sender", 7);

    const oldRow = db.prepare("SELECT 1 as found FROM whatsapp_chat_dedupe WHERE messageId = ?").get("old-id") as { found?: number } | undefined;
    const recentRow = db.prepare("SELECT 1 as found FROM whatsapp_chat_dedupe WHERE messageId = ?").get("recent-id") as { found?: number } | undefined;
    expect(Boolean(oldRow?.found)).toBe(false);
    expect(Boolean(recentRow?.found)).toBe(true);
    expect(wasProcessed(db as any, "new-id")).toBe(true);
  });

  it("keeps entries inside retention window", () => {
    const db = createInMemoryDb();
    ensureSchema(db as any);

    db.prepare("INSERT INTO whatsapp_chat_dedupe(messageId, sender, receivedAt) VALUES(?, ?, ?)").run(
      "one-day-old-id",
      "sender",
      new Date(Date.now() - 86_400_000).toISOString(),
    );

    markProcessed(db as any, "new-id", "sender", 7);

    const oneDayOld = db.prepare("SELECT 1 as found FROM whatsapp_chat_dedupe WHERE messageId = ?").get("one-day-old-id") as { found?: number } | undefined;
    expect(Boolean(oneDayOld?.found)).toBe(true);
  });

  it("parses dedupeRetentionDays safely", () => {
    expect(getDedupeRetentionDays({})).toBe(7);
    expect(getDedupeRetentionDays({ dedupeRetentionDays: undefined })).toBe(7);
    expect(getDedupeRetentionDays({ dedupeRetentionDays: null })).toBe(7);
    expect(getDedupeRetentionDays({ dedupeRetentionDays: 0 })).toBe(7);
    expect(getDedupeRetentionDays({ dedupeRetentionDays: -3 })).toBe(7);
    expect(getDedupeRetentionDays({ dedupeRetentionDays: "foo" })).toBe(7);
    expect(getDedupeRetentionDays({ dedupeRetentionDays: Number.POSITIVE_INFINITY })).toBe(7);
    expect(getDedupeRetentionDays({ dedupeRetentionDays: 14 })).toBe(14);
    expect(getDedupeRetentionDays({ dedupeRetentionDays: 3.7 })).toBe(3);
  });
});
