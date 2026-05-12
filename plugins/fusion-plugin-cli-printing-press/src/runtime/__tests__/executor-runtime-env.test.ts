import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Database } from "@fusion/core";
import { describe, expect, it } from "vitest";
import { createCliPressStore } from "../../store/cli-press-store.js";
import { encodeCredentialValue } from "../../store/credentials.js";
import { buildExecutorRuntimeEnv } from "../executor-runtime-env.js";

function createHarness() {
  const rootDir = mkdtempSync(join(tmpdir(), "cli-press-runtime-env-"));
  const db = new Database(join(rootDir, ".fusion"), { inMemory: true });
  db.init();
  const store = createCliPressStore(db);
  const warnings: string[] = [];

  const ctx = {
    pluginId: "fusion-plugin-cli-printing-press",
    taskStore: undefined,
    settings: {},
    logger: {
      log: () => {},
      info: () => {},
      warn: (msg: string) => warnings.push(msg),
      error: () => {},
      debug: () => {},
    },
    emitEvent: () => {},
  };

  const cleanup = () => {
    db.close();
    rmSync(rootDir, { recursive: true, force: true });
  };

  return { rootDir, db, store, warnings, ctx, cleanup };
}

describe("buildExecutorRuntimeEnv", () => {
  it("returns empty env/path when no generated services are present", () => {
    const h = createHarness();
    try {
      const result = buildExecutorRuntimeEnv(h.store, { taskId: "FN-1", worktreePath: h.rootDir, rootDir: h.rootDir }, h.ctx as never);
      expect(result.pathPrepend).toEqual([]);
      expect(result.env).toEqual({});
    } finally {
      h.cleanup();
    }
  });

  it("adds executable artifact directory and env_var credential", () => {
    const h = createHarness();
    try {
      const service = h.store.createService({
        slug: "alpha",
        displayName: "Alpha",
        baseUrl: "https://example.com",
        sourceKind: "manual",
      });
      const spec = h.store.createSpec({
        serviceId: service.id,
        name: "alpha-cli",
        version: "0.1.0",
        generatorVersion: "1.0.0",
        specJson: "{}",
        status: "generated",
        generatedAt: new Date().toISOString(),
      });
      const relativePath = `plugins/cli-printing-press/artifacts/${service.id}/${spec.id}/alpha`;
      const absolutePath = join(h.rootDir, ".fusion", relativePath);
      mkdirSync(join(absolutePath, ".."), { recursive: true });
      writeFileSync(absolutePath, "#!/bin/sh\necho alpha\n");

      h.store.createArtifact({ cliSpecId: spec.id, kind: "script", path: relativePath, executable: true });
      h.store.createCredential({
        serviceId: service.id,
        name: "api",
        kind: "env_var",
        placement: { kind: "env_var", envVar: "ALPHA_TOKEN" },
        value: encodeCredentialValue("secret-alpha"),
      });

      const result = buildExecutorRuntimeEnv(h.store, { taskId: "FN-1", worktreePath: h.rootDir, rootDir: h.rootDir }, h.ctx as never);
      expect(result.pathPrepend).toEqual([join(h.rootDir, ".fusion", "plugins/cli-printing-press/artifacts", service.id, spec.id)]);
      expect(result.env).toEqual({ ALPHA_TOKEN: "secret-alpha" });
    } finally {
      h.cleanup();
    }
  });

  it("deduplicates path entries across services", () => {
    const h = createHarness();
    try {
      const sharedDir = `plugins/cli-printing-press/artifacts/shared/bin`;
      const sharedExec1 = `${sharedDir}/one`;
      const sharedExec2 = `${sharedDir}/two`;
      mkdirSync(join(h.rootDir, ".fusion", sharedDir), { recursive: true });
      writeFileSync(join(h.rootDir, ".fusion", sharedExec1), "1");
      writeFileSync(join(h.rootDir, ".fusion", sharedExec2), "2");

      for (const slug of ["one", "two"]) {
        const service = h.store.createService({ slug, displayName: slug, baseUrl: "https://example.com", sourceKind: "manual" });
        const spec = h.store.createSpec({
          serviceId: service.id,
          name: `${slug}-cli`,
          version: "0.1.0",
          generatorVersion: "1.0.0",
          specJson: "{}",
          status: "generated",
          generatedAt: new Date().toISOString(),
        });
        h.store.createArtifact({
          cliSpecId: spec.id,
          kind: "script",
          path: slug === "one" ? sharedExec1 : sharedExec2,
          executable: true,
        });
      }

      const result = buildExecutorRuntimeEnv(h.store, { taskId: "FN-1", worktreePath: h.rootDir, rootDir: h.rootDir }, h.ctx as never);
      expect(result.pathPrepend).toEqual([join(h.rootDir, ".fusion", sharedDir)]);
    } finally {
      h.cleanup();
    }
  });

  it("skips missing artifacts and logs warning", () => {
    const h = createHarness();
    try {
      const service = h.store.createService({ slug: "missing", displayName: "Missing", baseUrl: "https://example.com", sourceKind: "manual" });
      const spec = h.store.createSpec({
        serviceId: service.id,
        name: "missing-cli",
        version: "0.1.0",
        generatorVersion: "1.0.0",
        specJson: "{}",
        status: "generated",
        generatedAt: new Date().toISOString(),
      });
      h.store.createArtifact({
        cliSpecId: spec.id,
        kind: "script",
        path: `plugins/cli-printing-press/artifacts/${service.id}/${spec.id}/missing`,
        executable: true,
      });

      const result = buildExecutorRuntimeEnv(h.store, { taskId: "FN-1", worktreePath: h.rootDir, rootDir: h.rootDir }, h.ctx as never);
      expect(result.pathPrepend).toEqual([]);
      expect(h.warnings.length).toBe(1);
      expect(h.warnings[0]).toContain("Skipping missing artifact");
    } finally {
      h.cleanup();
    }
  });

  it("rejects oauth credentials defensively", () => {
    const h = createHarness();
    try {
      const service = h.store.createService({ slug: "oauth", displayName: "OAuth", baseUrl: "https://example.com", sourceKind: "manual" });
      const encoded = JSON.stringify(encodeCredentialValue("token"));
      const placement = JSON.stringify({ kind: "oauth", provider: "x" });
      h.db.prepare("INSERT INTO cli_press_credentials (id, serviceId, name, kind, value, placement, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))")
        .run("cred_oauth", service.id, "oauth", "oauth", encoded, placement);

      expect(() =>
        buildExecutorRuntimeEnv(h.store, { taskId: "FN-1", worktreePath: h.rootDir, rootDir: h.rootDir }, h.ctx as never),
      ).toThrow(/OAuth credentials are not supported/);
    } finally {
      h.cleanup();
    }
  });

  it("ignores non env_var credentials", () => {
    const h = createHarness();
    try {
      const service = h.store.createService({ slug: "beta", displayName: "Beta", baseUrl: "https://example.com", sourceKind: "manual" });
      h.store.createCredential({
        serviceId: service.id,
        name: "header",
        kind: "header",
        placement: { kind: "header", header: "X-Token" },
        value: encodeCredentialValue("header-token"),
      });

      const result = buildExecutorRuntimeEnv(h.store, { taskId: "FN-1", worktreePath: h.rootDir, rootDir: h.rootDir }, h.ctx as never);
      expect(result.env).toEqual({});
    } finally {
      h.cleanup();
    }
  });
});
