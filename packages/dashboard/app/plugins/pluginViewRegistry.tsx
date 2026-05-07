import type { Task, TaskDetail, WorkflowStep } from "@fusion/core";
import { AlertTriangle } from "lucide-react";
import { lazy, Suspense, type LazyExoticComponent, type ReactElement, type ReactNode } from "react";
import { ErrorBoundary } from "../components/ErrorBoundary";
import type { DetailTaskTab } from "../hooks/useModalManager";
import "./pluginViewRegistry.css";

export type PluginTaskView = `plugin:${string}:${string}`;

export interface PluginDashboardViewContext {
  projectId?: string;
  tasks: Task[];
  workflowSteps: WorkflowStep[];
  openTaskDetail: (task: Task | TaskDetail, initialTab?: DetailTaskTab) => void;
  renderTaskCard?: (task: Task | TaskDetail) => ReactNode;
}

type PluginViewComponent = LazyExoticComponent<({ context }: { context?: PluginDashboardViewContext }) => ReactElement>;

const registry = new Map<string, PluginViewComponent>();

/** Build composite plugin task view ID: plugin:{pluginId}:{viewId}. */
export function getPluginViewId(pluginId: string, viewId: string): PluginTaskView {
  return `plugin:${pluginId}:${viewId}`;
}

/** Parse composite plugin task view ID. Returns null for non-plugin IDs. */
export function parsePluginViewId(value: string): { pluginId: string; viewId: string } | null {
  const match = /^plugin:([^:]+):(.+)$/u.exec(value);
  if (!match) return null;
  return { pluginId: match[1], viewId: match[2] };
}

/** True when a view ID matches the plugin composite ID format. */
export function isPluginViewId(value: string): value is PluginTaskView {
  return parsePluginViewId(value) !== null;
}

/** Register a lazy plugin dashboard view component in the static host registry. */
export function registerPluginView(pluginId: string, viewId: string, lazyComponent: PluginViewComponent): void {
  registry.set(getPluginViewId(pluginId, viewId), lazyComponent);
}

/** Resolve a plugin dashboard lazy component from the static host registry. */
export function getPluginViewComponent(pluginId: string, viewId: string): PluginViewComponent | null {
  return registry.get(getPluginViewId(pluginId, viewId)) ?? null;
}

/** Test helper for clearing global registry state. */
export function __test_clearPluginViewRegistry(): void {
  registry.clear();
  registerBundledPluginViews();
}

function registerBundledPluginViews(): void {
  registerPluginView(
    "fusion-plugin-dependency-graph",
    "graph",
    lazy(async () => {
      const mod = await import("@fusion-plugin-examples/dependency-graph/dashboard-view");
      return { default: mod.DependencyGraphDashboardView };
    }),
  );
}

registerBundledPluginViews();

function PluginViewUnavailable({ viewId }: { viewId: string }): ReactNode {
  return (
    <section className="card plugin-dashboard-view-missing" data-testid="plugin-view-unavailable">
      <h2 className="plugin-dashboard-view-missing-title">
        <AlertTriangle />
        Plugin view unavailable
      </h2>
      <p className="plugin-dashboard-view-missing-description">
        No host registration found for <code>{viewId}</code>.
      </p>
    </section>
  );
}

export function PluginDashboardViewHost({ viewId, context }: { viewId: PluginTaskView; context?: PluginDashboardViewContext }): ReactNode {
  const parsed = parsePluginViewId(viewId);
  if (!parsed) return <PluginViewUnavailable viewId={viewId} />;

  const ViewComponent = getPluginViewComponent(parsed.pluginId, parsed.viewId);
  if (!ViewComponent) {
    return <PluginViewUnavailable viewId={viewId} />;
  }

  return (
    <ErrorBoundary fallback={<PluginViewUnavailable viewId={viewId} />}>
      <Suspense fallback={null}>
        <ViewComponent context={context} />
      </Suspense>
    </ErrorBoundary>
  );
}

// Backward-compatible aliases.
export const buildPluginTaskViewId = getPluginViewId;
export const parsePluginTaskViewId = parsePluginViewId;
export const resolvePluginDashboardView = getPluginViewComponent;

// Ensure lazy is referenced for plugin authors importing only this module pattern.
void lazy;
