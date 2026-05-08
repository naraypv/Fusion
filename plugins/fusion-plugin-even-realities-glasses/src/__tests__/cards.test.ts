import { describe, expect, it } from "vitest";
import { boardSummaryCard, notificationCard, taskToCard } from "../cards.js";

describe("cards", () => {
  it("maps task to card", () => {
    expect(
      taskToCard({ id: "FN-1", title: "Ship", description: "desc", column: "in-review" }),
    ).toMatchInlineSnapshot(`
      {
        "accentColor": "purple",
        "actions": [
          {
            "label": "Start work",
            "taskId": "FN-1",
            "type": "start-work",
          },
          {
            "label": "Request review",
            "taskId": "FN-1",
            "type": "request-review",
          },
        ],
        "bodyLines": [
          "desc",
          "Column: in-review",
        ],
        "id": "task-FN-1",
        "kind": "task",
        "title": "FN-1: Ship",
      }
    `);
  });

  it("creates board summary", () => {
    expect(boardSummaryCard({ todo: 2, done: 1 })).toMatchInlineSnapshot(`
      {
        "accentColor": "blue",
        "bodyLines": [
          "triage: 0",
          "todo: 2",
          "in-progress: 0",
          "in-review: 0",
          "done: 1",
        ],
        "id": "board-summary",
        "kind": "summary",
        "title": "Fusion Board Summary",
      }
    `);
  });

  it("creates notification cards", () => {
    expect(notificationCard({ id: "FN-2", title: "Review", description: "", column: "in-review" }, "entered notify column")).toMatchInlineSnapshot(`
      {
        "accentColor": "purple",
        "actions": [
          {
            "label": "Open",
            "taskId": "FN-2",
            "type": "request-review",
          },
        ],
        "bodyLines": [
          "Review",
          "Now in in-review",
          "entered notify column",
        ],
        "id": "notification-FN-2-entered notify column",
        "kind": "notification",
        "title": "Task update: FN-2",
      }
    `);
  });
});
