import { useMemo, useRef } from "react";
import { getReportExportUrl } from "../api.js";
import { useReportPreview } from "../useReportPreview.js";
import type { ReportRecord } from "../types.js";

const SECTION_IDS = ["summary", "system-wins", "system-highlights", "system-lowlights", "system-proposals", "system-deep-dives", "agent-card", "data-coverage", "review-panel"];

export function ReportDetailPanel({ report, projectId }: { report?: ReportRecord; projectId?: string }) {
  const frameRef = useRef<HTMLIFrameElement | null>(null);
  const { html, loading, error } = useReportPreview(report?.id, projectId);
  const sections = useMemo(() => SECTION_IDS, []);
  if (!report) return <div className="reports-detail card">Select a report.</div>;
  return <div className="reports-detail card">
    <div className="reports-detail-header"><h3>{report.title}</h3><a className="btn btn-sm" href={getReportExportUrl(report.id, projectId)} download>Download standalone HTML</a></div>
    <div className="reports-detail-meta">{report.cadence} • {report.status} • {report.periodStart} → {report.periodEnd}</div>
    <div className="reports-detail-body">
      <nav className="reports-detail-sections">{sections.map((section) => <button key={section} className="btn btn-sm" onClick={() => frameRef.current?.contentWindow?.document.querySelector(`[data-section="${section}"]`)?.scrollIntoView()}>{section}</button>)}</nav>
      {loading ? <div>Loading preview...</div> : null}
      {error ? <div>{error}</div> : null}
      <iframe ref={frameRef} sandbox="allow-same-origin" srcDoc={html} title="Report preview" />
    </div>
  </div>;
}
