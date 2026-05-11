import type { PluginContext, PluginRouteDefinition, PluginRouteResult } from "@fusion/core";
import { generateCli } from "../generation/generator.js";
import { runGeneratedCli } from "../generation/runner.js";
import type { GeneratedCliArtifact, RunRequest } from "../generation/types.js";
import { createDraftStore, getArtifactDir, NotFoundError } from "../storage/draft-store.js";
import type { ServiceDraft } from "../wizard/types.js";
import { validateDraft } from "../wizard/validation.js";

interface RouteRequest {
  params: Record<string, string>;
  body?: unknown;
}

function asRequest(req: unknown): RouteRequest { return req as RouteRequest; }
function ok(body: unknown, status = 200): PluginRouteResult { return { status, body }; }

function asArtifact(draft: ServiceDraft): GeneratedCliArtifact | null {
  if (!draft.artifactPath || !draft.generatedAt) return null;
  return {
    draftId: draft.id,
    slug: draft.slug,
    binPath: draft.artifactPath,
    entrypoint: "node",
    generatedAt: draft.generatedAt,
  };
}

function isPrimitive(value: unknown): value is string | number | boolean {
  return typeof value === "string" || typeof value === "number" || typeof value === "boolean";
}

function validateRunRequest(body: unknown): { ok: true; value: RunRequest } | { ok: false; error: string } {
  if (!body || typeof body !== "object") return { ok: false, error: "Request body is required" };
  const candidate = body as Record<string, unknown>;
  if (typeof candidate.endpointId !== "string" || !candidate.endpointId.trim()) return { ok: false, error: "endpointId is required" };
  if (!candidate.params || typeof candidate.params !== "object" || Array.isArray(candidate.params)) return { ok: false, error: "params must be an object" };
  for (const value of Object.values(candidate.params as Record<string, unknown>)) {
    if (!isPrimitive(value)) return { ok: false, error: "params values must be primitives" };
  }
  if (candidate.credentials !== undefined) {
    if (!candidate.credentials || typeof candidate.credentials !== "object" || Array.isArray(candidate.credentials)) return { ok: false, error: "credentials must be an object" };
    for (const value of Object.values(candidate.credentials as Record<string, unknown>)) {
      if (typeof value !== "string") return { ok: false, error: "credentials values must be strings" };
    }
  }
  if (candidate.timeoutMs !== undefined) {
    if (!Number.isFinite(candidate.timeoutMs) || !Number.isInteger(candidate.timeoutMs) || (candidate.timeoutMs as number) <= 0 || (candidate.timeoutMs as number) > 300_000) {
      return { ok: false, error: "timeoutMs must be an integer between 1 and 300000" };
    }
  }
  return {
    ok: true,
    value: {
      endpointId: candidate.endpointId,
      params: candidate.params as Record<string, string | number | boolean>,
      credentials: candidate.credentials as Record<string, string> | undefined,
      timeoutMs: candidate.timeoutMs as number | undefined,
    },
  };
}

export function createCliPrintingPressRoutes(): PluginRouteDefinition[] {
  return [
    {
      method: "POST",
      path: "/drafts",
      handler: async (req, ctx: PluginContext) => {
        const request = asRequest(req);
        const draft = request.body as ServiceDraft;
        const result = validateDraft(draft);
        if (!result.ok) return { status: 400, body: { error: Object.values(result.errors)[0] ?? "Validation failed", errors: result.errors } };
        const store = createDraftStore({ rootDir: ctx.taskStore.getRootDir() });
        const created = await store.create(draft);
        return ok(created, 201);
      },
    },
    {
      method: "GET",
      path: "/drafts",
      handler: async (_req, ctx: PluginContext) => {
        const store = createDraftStore({ rootDir: ctx.taskStore.getRootDir() });
        return ok(await store.list());
      },
    },
    {
      method: "GET",
      path: "/drafts/:id",
      handler: async (req, ctx: PluginContext) => {
        const request = asRequest(req);
        const store = createDraftStore({ rootDir: ctx.taskStore.getRootDir() });
        const draft = await store.get(request.params.id);
        return draft ? ok(draft) : ok({ error: "Draft not found" }, 404);
      },
    },
    {
      method: "PUT",
      path: "/drafts/:id",
      handler: async (req, ctx: PluginContext) => {
        const request = asRequest(req);
        const draft = request.body as ServiceDraft;
        const result = validateDraft(draft);
        if (!result.ok) return { status: 400, body: { error: Object.values(result.errors)[0] ?? "Validation failed", errors: result.errors } };
        const store = createDraftStore({ rootDir: ctx.taskStore.getRootDir() });
        try {
          const updated = await store.update(request.params.id, draft);
          return ok(updated);
        } catch (error) {
          if (error instanceof NotFoundError) return ok({ error: "Draft not found" }, 404);
          throw error;
        }
      },
    },
    {
      method: "POST",
      path: "/drafts/:id/regenerate",
      handler: async (req, ctx: PluginContext) => {
        const request = asRequest(req);
        const projectRoot = ctx.taskStore.getRootDir();
        const store = createDraftStore({ rootDir: projectRoot });
        const existing = await store.get(request.params.id);
        if (!existing) return ok({ error: "Draft not found" }, 404);

        const artifact = await generateCli({ draft: existing, outDir: getArtifactDir(existing.id, projectRoot) });
        const draft = await store.update(request.params.id, {
          regeneratedAt: artifact.generatedAt,
          generatedAt: artifact.generatedAt,
          artifactPath: artifact.binPath,
        });
        return ok({ draft, artifact });
      },
    },
    {
      method: "POST",
      path: "/drafts/:id/run",
      handler: async (req, ctx: PluginContext) => {
        const request = asRequest(req);
        const parsed = validateRunRequest(request.body);
        if (!parsed.ok) return ok({ error: parsed.error }, 400);

        const store = createDraftStore({ rootDir: ctx.taskStore.getRootDir() });
        const draft = await store.get(request.params.id);
        if (!draft) return ok({ error: "Draft not found" }, 404);

        const artifact = asArtifact(draft);
        if (!artifact) return ok({ error: "Draft has not been generated yet" }, 409);

        const endpointExists = draft.endpoints.some((endpoint) => endpoint.id === parsed.value.endpointId);
        if (!endpointExists) return ok({ error: "Endpoint not found" }, 400);

        const result = await runGeneratedCli({
          artifact,
          endpointId: parsed.value.endpointId,
          params: parsed.value.params,
          credentials: parsed.value.credentials,
          timeoutMs: parsed.value.timeoutMs,
          cwd: ctx.taskStore.getRootDir(),
        });
        return ok(result, 200);
      },
    },
    {
      method: "GET",
      path: "/drafts/:id/artifact",
      handler: async (req, ctx: PluginContext) => {
        const request = asRequest(req);
        const store = createDraftStore({ rootDir: ctx.taskStore.getRootDir() });
        const draft = await store.get(request.params.id);
        const artifact = draft ? asArtifact(draft) : null;
        return artifact ? ok({ artifact }) : ok({ error: "Artifact not found" }, 404);
      },
    },
    {
      method: "DELETE",
      path: "/drafts/:id",
      handler: async (req, ctx: PluginContext) => {
        const request = asRequest(req);
        const store = createDraftStore({ rootDir: ctx.taskStore.getRootDir() });
        await store.delete(request.params.id);
        return { status: 204 };
      },
    },
  ];
}
