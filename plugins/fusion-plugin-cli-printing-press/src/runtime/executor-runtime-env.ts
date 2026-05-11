import { dirname, isAbsolute, join } from "node:path";
import { existsSync } from "node:fs";
import type { ExecutorRuntimeEnvContribution, ExecutorRuntimeTaskContext, PluginContext } from "@fusion/plugin-sdk";
import type { createCliPressStore } from "../store/cli-press-store.js";
import { decodeCredentialValue } from "../store/credentials.js";

type CliPressStore = ReturnType<typeof createCliPressStore>;

function toEpoch(value?: string): number {
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function buildExecutorRuntimeEnv(
  store: CliPressStore,
  taskCtx: ExecutorRuntimeTaskContext,
  ctx: PluginContext,
): ExecutorRuntimeEnvContribution {
  const pathDirs: string[] = [];
  const env: Record<string, string> = {};

  for (const service of store.listServices()) {
    const specs = store
      .listSpecs(service.id)
      .filter((spec) => spec.status === "generated")
      .sort((a, b) => toEpoch(b.generatedAt ?? b.updatedAt) - toEpoch(a.generatedAt ?? a.updatedAt));

    const selectedSpec = specs.find((spec) => {
      const artifacts = store.listArtifacts(spec.id);
      return artifacts.some((artifact) => artifact.executable);
    });

    if (selectedSpec) {
      const executableArtifacts = store.listArtifacts(selectedSpec.id).filter((artifact) => artifact.executable);
      for (const artifact of executableArtifacts) {
        const absoluteArtifactPath = isAbsolute(artifact.path)
          ? artifact.path
          : join(taskCtx.rootDir, ".fusion", artifact.path);
        if (!existsSync(absoluteArtifactPath)) {
          ctx.logger.warn(
            `[executorRuntimeEnv] Skipping missing artifact for service ${service.slug}: ${absoluteArtifactPath}`,
          );
          continue;
        }
        pathDirs.push(dirname(absoluteArtifactPath));
      }
    }

    for (const credential of store.listCredentials(service.id)) {
      const credentialKind = (credential as { kind: string }).kind;
      if (credentialKind === "oauth" || credentialKind === "oauth2") {
        throw new Error(`OAuth credentials are not supported for service ${service.slug}`);
      }

      if (credential.kind !== "env_var") {
        continue;
      }

      if (credential.placement.kind !== "env_var") {
        throw new Error(
          `Credential placement mismatch for ${credential.name}: expected env_var placement, got ${credential.placement.kind}`,
        );
      }

      env[credential.placement.envVar] = decodeCredentialValue(credential.value);
    }
  }

  return {
    pathPrepend: Array.from(new Set(pathDirs)),
    env,
    description: "cli-printing-press generated CLIs",
  };
}
