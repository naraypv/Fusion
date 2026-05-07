import type { Task, TaskDetail, WorkflowStep } from "@fusion/core";
import type { PluginDashboardViewContext } from "@fusion/dashboard/app/plugins/pluginViewRegistry";
import { definePlugin } from "@fusion/plugin-sdk";
import { createElement } from "react";
import { DependencyGraph } from "./DependencyGraph";

const plugin = definePlugin({
  manifest: {
    id: "fusion-plugin-dependency-graph",
    name: "Dependency Graph",
    version: "0.1.0",
    description: "Top-level dependency graph dashboard view",
  },
  state: "installed",
  hooks: {},
  dashboardViews: [
    {
      viewId: "graph",
      label: "Graph",
      componentPath: "./dashboard-view",
      icon: "Network",
      placement: "more",
      order: 40,
    },
  ],
});

function createWorkflowStepNameLookup(workflowSteps: WorkflowStep[] | undefined): ReadonlyMap<string, string> {
  return new Map((workflowSteps ?? []).map((step) => [step.id, step.name] as const));
}

export function DependencyGraphDashboardView({ context }: { context?: PluginDashboardViewContext }) {
  return createElement(DependencyGraph, {
    tasks: context?.tasks ?? [],
    projectId: context?.projectId,
    workflowStepNameLookup: createWorkflowStepNameLookup(context?.workflowSteps),
    onOpenDetail: context?.openTaskDetail as ((task: Task | TaskDetail) => void) | undefined,
  });
}

export default plugin;
export { DependencyGraph };
