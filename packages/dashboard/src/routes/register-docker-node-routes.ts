import type { DockerExtraCli, DockerHostConfig, DockerVolumeMount, ManagedDockerNodeInput } from "@fusion/core";
import { ApiError, badRequest, notFound } from "../api-error.js";
import type { ApiRouteRegistrar } from "./types.js";

const VALID_EXTRA_CLIS: DockerExtraCli[] = ["claude-cli", "droid-cli"];

function sanitizeHostConfig(input: unknown): DockerHostConfig {
  const host = (input ?? {}) as Partial<DockerHostConfig>;

  return {
    host: typeof host.host === "string" ? host.host.trim() : undefined,
    context: typeof host.context === "string" ? host.context.trim() : undefined,
    tlsVerify: host.tlsVerify === undefined ? undefined : Boolean(host.tlsVerify),
    tlsCaPath: typeof host.tlsCaPath === "string" ? host.tlsCaPath.trim() : undefined,
    tlsCertPath: typeof host.tlsCertPath === "string" ? host.tlsCertPath.trim() : undefined,
    tlsKeyPath: typeof host.tlsKeyPath === "string" ? host.tlsKeyPath.trim() : undefined,
  };
}

function sanitizeVolumeMounts(input: unknown): DockerVolumeMount[] {
  if (!Array.isArray(input)) {
    throw badRequest("volumeMounts must be an array");
  }

  return input.map((mount, index) => {
    if (!mount || typeof mount !== "object") {
      throw badRequest(`volumeMounts[${index}] must be an object`);
    }

    const normalized = mount as Partial<DockerVolumeMount>;
    const hostPath = typeof normalized.hostPath === "string" ? normalized.hostPath.trim() : "";
    const containerPath = typeof normalized.containerPath === "string" ? normalized.containerPath.trim() : "";
    const mode = normalized.mode === "ro" ? "ro" : "rw";

    if (!hostPath || !containerPath) {
      throw badRequest(`volumeMounts[${index}] requires hostPath and containerPath`);
    }

    return { hostPath, containerPath, mode };
  });
}

function sanitizeExtraClis(input: unknown): DockerExtraCli[] {
  if (!Array.isArray(input)) {
    throw badRequest("extraClis must be an array");
  }

  for (const cli of input) {
    if (typeof cli !== "string" || !VALID_EXTRA_CLIS.includes(cli as DockerExtraCli)) {
      throw badRequest("extraClis contains unsupported value");
    }
  }

  return input as DockerExtraCli[];
}

export const registerDockerNodeRoutes: ApiRouteRegistrar = (ctx) => {
  const { router, rethrowAsApiError } = ctx;

  router.get("/docker-nodes", async (_req, res) => {
    try {
      const { CentralCore } = await import("@fusion/core");
      const central = new CentralCore();
      await central.init();
      const nodes = await central.listManagedDockerNodes();
      await central.close();
      nodes.sort((a, b) => a.name.localeCompare(b.name));
      res.json(nodes);
    } catch (error: unknown) {
      if (error instanceof ApiError) {
        throw error;
      }
      rethrowAsApiError(error);
    }
  });

  router.post("/docker-nodes", async (req, res) => {
    try {
      const payload = (req.body ?? {}) as Partial<ManagedDockerNodeInput>;
      const name = typeof payload.name === "string" ? payload.name.trim() : "";
      const imageName = typeof payload.imageName === "string" ? payload.imageName.trim() : "";

      if (!name || name.length > 64) {
        throw badRequest("name is required and must be 1-64 characters");
      }
      if (!imageName) {
        throw badRequest("imageName is required");
      }

      const input: ManagedDockerNodeInput = {
        nodeId: typeof payload.nodeId === "string" ? payload.nodeId.trim() : null,
        name,
        imageName,
        imageTag: typeof payload.imageTag === "string" && payload.imageTag.trim() ? payload.imageTag.trim() : "latest",
        hostConfig: sanitizeHostConfig(payload.hostConfig),
        envVars:
          payload.envVars && typeof payload.envVars === "object" && !Array.isArray(payload.envVars)
            ? Object.fromEntries(
                Object.entries(payload.envVars).map(([key, value]) => [key.trim(), String(value)]),
              )
            : {},
        volumeMounts: sanitizeVolumeMounts(payload.volumeMounts ?? []),
        resourceSizing: {
          memoryMB:
            typeof payload.resourceSizing?.memoryMB === "number" && Number.isFinite(payload.resourceSizing.memoryMB)
              ? payload.resourceSizing.memoryMB
              : 4096,
          cpus:
            typeof payload.resourceSizing?.cpus === "number" && Number.isFinite(payload.resourceSizing.cpus)
              ? payload.resourceSizing.cpus
              : 2,
        },
        extraClis: sanitizeExtraClis(payload.extraClis ?? []),
        persistentStorage: payload.persistentStorage !== undefined ? Boolean(payload.persistentStorage) : true,
        reachableUrl:
          typeof payload.reachableUrl === "string" && payload.reachableUrl.trim() ? payload.reachableUrl.trim() : null,
        apiKey: typeof payload.apiKey === "string" && payload.apiKey.trim() ? payload.apiKey.trim() : null,
      };

      const { CentralCore } = await import("@fusion/core");
      const central = new CentralCore();
      await central.init();
      const created = await central.createManagedDockerNode(input);
      await central.close();

      res.status(201).json(created);
    } catch (error: unknown) {
      if (error instanceof ApiError) {
        throw error;
      }
      rethrowAsApiError(error);
    }
  });

  router.get("/docker-nodes/:id", async (req, res) => {
    try {
      const { CentralCore } = await import("@fusion/core");
      const central = new CentralCore();
      await central.init();
      const node = await central.getManagedDockerNode(req.params.id);
      await central.close();

      if (!node) {
        throw notFound("Managed Docker node not found");
      }

      res.json(node);
    } catch (error: unknown) {
      if (error instanceof ApiError) {
        throw error;
      }
      rethrowAsApiError(error);
    }
  });
};
