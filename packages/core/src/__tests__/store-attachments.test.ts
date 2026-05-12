import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { createTaskStoreTestHarness } from "./store-test-helpers.js";

describe("TaskStore", () => {
  const harness = createTaskStoreTestHarness();

  beforeEach(harness.beforeEach);
  afterEach(harness.afterEach);

  describe("attachments", () => {
    const TINY_PNG = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
      "base64",
    );

    it("adds an attachment and persists metadata in task.json", async () => {
      const task = await harness.createTestTask();
      const attachment = await harness.store().addAttachment(task.id, "screenshot.png", TINY_PNG, "image/png");

      expect(attachment.originalName).toBe("screenshot.png");
      expect(attachment.mimeType).toBe("image/png");
      expect(attachment.size).toBe(TINY_PNG.length);
      expect(attachment.filename).toMatch(/^\d+-screenshot\.png$/);

      // Verify metadata persisted
      const updated = await harness.store().getTask(task.id);
      expect(updated.attachments).toHaveLength(1);
      expect(updated.attachments![0].filename).toBe(attachment.filename);

      // Verify file on disk
      const filePath = join(harness.rootDir(), ".fusion", "tasks", task.id, "attachments", attachment.filename);
      const content = await readFile(filePath);
      expect(content).toEqual(TINY_PNG);
    });

    it("accepts text/plain mime type", async () => {
      const task = await harness.createTestTask();
      const attachment = await harness.store().addAttachment(task.id, "error.log", Buffer.from("log content"), "text/plain");
      expect(attachment.originalName).toBe("error.log");
      expect(attachment.mimeType).toBe("text/plain");
    });

    it("accepts application/json mime type", async () => {
      const task = await harness.createTestTask();
      const attachment = await harness.store().addAttachment(task.id, "config.json", Buffer.from('{"key":"val"}'), "application/json");
      expect(attachment.mimeType).toBe("application/json");
    });

    it("accepts text/yaml mime type", async () => {
      const task = await harness.createTestTask();
      const attachment = await harness.store().addAttachment(task.id, "config.yaml", Buffer.from("key: val"), "text/yaml");
      expect(attachment.mimeType).toBe("text/yaml");
    });

    it("rejects unsupported mime types", async () => {
      const task = await harness.createTestTask();
      await expect(
        harness.store().addAttachment(task.id, "file.bin", Buffer.from("data"), "application/octet-stream"),
      ).rejects.toThrow("Invalid mime type");
    });

    it("rejects oversized files", async () => {
      const task = await harness.createTestTask();
      const bigBuffer = Buffer.alloc(6 * 1024 * 1024); // 6MB
      await expect(
        harness.store().addAttachment(task.id, "big.png", bigBuffer, "image/png"),
      ).rejects.toThrow("File too large");
    });

    it("gets attachment path and mime type", async () => {
      const task = await harness.createTestTask();
      const attachment = await harness.store().addAttachment(task.id, "shot.png", TINY_PNG, "image/png");

      const result = await harness.store().getAttachment(task.id, attachment.filename);
      expect(result.mimeType).toBe("image/png");
      expect(result.path).toContain(attachment.filename);
    });

    it("deletes an attachment from disk and metadata", async () => {
      const task = await harness.createTestTask();
      const attachment = await harness.store().addAttachment(task.id, "del.png", TINY_PNG, "image/png");

      const updated = await harness.store().deleteAttachment(task.id, attachment.filename);
      expect(updated.attachments).toBeUndefined();

      // Verify file removed from disk
      const filePath = join(harness.rootDir(), ".fusion", "tasks", task.id, "attachments", attachment.filename);
      expect(existsSync(filePath)).toBe(false);
    });

    it("throws ENOENT when getting non-existent attachment", async () => {
      const task = await harness.createTestTask();
      await expect(
        harness.store().getAttachment(task.id, "nonexistent.png"),
      ).rejects.toThrow("not found");
    });

    it("throws ENOENT when deleting non-existent attachment", async () => {
      const task = await harness.createTestTask();
      await expect(
        harness.store().deleteAttachment(task.id, "nonexistent.png"),
      ).rejects.toThrow("not found");
    });
  });

  // ── Settings tests ────────────────────────────────────────────────
});
