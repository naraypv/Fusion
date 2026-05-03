import { useCallback, useEffect, useState } from "react";
import type { ManagedDockerNodeInput } from "@fusion/core";
import type { DockerNodeInfo } from "../api";
import { createManagedDockerNode, listManagedDockerNodes } from "../api";

export interface UseManagedDockerNodesResult {
  dockerNodes: DockerNodeInfo[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  create: (input: ManagedDockerNodeInput) => Promise<DockerNodeInfo>;
}

export function useManagedDockerNodes(): UseManagedDockerNodesResult {
  const [dockerNodes, setDockerNodes] = useState<DockerNodeInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setError(null);
      const data = await listManagedDockerNodes();
      setDockerNodes(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch managed Docker nodes");
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      try {
        const data = await listManagedDockerNodes();
        if (!cancelled) {
          setDockerNodes(data);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to fetch managed Docker nodes");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const create = useCallback(async (input: ManagedDockerNodeInput): Promise<DockerNodeInfo> => {
    const node = await createManagedDockerNode(input);
    setDockerNodes((previous) => [...previous, node]);
    return node;
  }, []);

  return { dockerNodes, loading, error, refresh, create };
}
