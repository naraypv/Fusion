import "./TaskReviewTab.css";
import type { Task, TaskDetail } from "@fusion/core";
import { useMemo, useState } from "react";
import { refreshTaskReview, reviseTaskReviewItems } from "../api";
import type { ToastType } from "../hooks/useToast";

interface Props {
  task: Task | TaskDetail;
  projectId?: string;
  onTaskUpdated?: (task: Task) => void;
  addToast: (message: string, type?: ToastType) => void;
}

export function TaskReviewTab({ task, projectId, onTaskUpdated, addToast }: Props) {
  const [selected, setSelected] = useState<string[]>(task.review?.selectedItemIds ?? []);
  const review = task.review;
  const canRevise = selected.length > 0;

  const summaryText = useMemo(() => {
    if (!review) return "No review feedback captured yet.";
    return review.summary ?? `${review.items.length} review item(s)`;
  }, [review]);

  const decisionLabel = review?.decision ? review.decision.replace("-", " ") : undefined;

  const toggleSelected = (id: string) => {
    setSelected((prev) => (prev.includes(id) ? prev.filter((value) => value !== id) : [...prev, id]));
  };

  const onRefresh = async () => {
    try {
      const result = await refreshTaskReview(task.id, projectId);
      onTaskUpdated?.({ ...task, review: result.review } as Task);
      addToast("Review refreshed", "success");
    } catch (error) {
      addToast(error instanceof Error ? error.message : "Failed to refresh review", "error");
    }
  };

  const onRevise = async () => {
    try {
      const result = await reviseTaskReviewItems(task.id, selected, projectId);
      onTaskUpdated?.({ ...result.task, review: result.review } as Task);
      addToast("Queued same-task revision", "success");
    } catch (error) {
      addToast(error instanceof Error ? error.message : "Failed to queue revision", "error");
    }
  };

  return (
    <div className="task-review-tab">
      <div className="task-review-tab__header">
        <div className="task-review-tab__summary-wrap">
          <p className="task-review-tab__summary">{summaryText}</p>
          {decisionLabel ? (
            <span className={`task-review-tab__decision task-review-tab__decision--${review?.decision}`}>{decisionLabel}</span>
          ) : null}
        </div>
        <div className="task-review-tab__actions">
          <button className="btn btn-sm" onClick={onRefresh}>Refresh</button>
          <button className="btn btn-primary btn-sm" disabled={!canRevise} onClick={onRevise}>Request revision</button>
        </div>
      </div>
      {review?.items?.length ? (
        <ul className="task-review-tab__list">
          {review.items.map((item) => (
            <li key={item.id} className="task-review-tab__item card">
              <label className="task-review-tab__row">
                <input
                  type="checkbox"
                  checked={selected.includes(item.id)}
                  onChange={() => toggleSelected(item.id)}
                />
                <span className="task-review-tab__item-summary">{item.summary}</span>
                <span className={`task-review-tab__status task-review-tab__status--${item.status}`}>{item.status}</span>
              </label>
            </li>
          ))}
        </ul>
      ) : (
        <div className="task-review-tab__empty">No review items yet.</div>
      )}
    </div>
  );
}
