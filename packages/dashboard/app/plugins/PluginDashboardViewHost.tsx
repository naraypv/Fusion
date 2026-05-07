import { PluginDashboardViewHost as RegistryPluginDashboardViewHost } from "./pluginViewRegistry";
import type { PluginDashboardViewContext, PluginTaskView } from "./pluginViewRegistry";

export function PluginDashboardViewHost({ taskView, context }: { taskView: PluginTaskView; context?: PluginDashboardViewContext }) {
  return <RegistryPluginDashboardViewHost viewId={taskView} context={context} />;
}
