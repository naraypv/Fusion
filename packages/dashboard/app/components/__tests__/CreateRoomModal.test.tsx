import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { userEvent } from "@testing-library/user-event";
import { CreateRoomModal, validateRoomName } from "../CreateRoomModal";
import * as apiModule from "../../api";

vi.mock("../../api", () => ({
  fetchAgents: vi.fn(),
}));

const mockFetchAgents = vi.mocked(apiModule.fetchAgents);

describe("validateRoomName", () => {
  it.each([
    ["engineering", true],
    ["#engineering", true],
    ["team-1", true],
    ["a", true],
    ["Engineering", false],
    ["team room", false],
    ["-team", false],
    ["team-", false],
    ["_team", false],
    ["team_", false],
    ["", false],
    ["team😀", false],
    ["a".repeat(81), false],
  ])("validates %s", (value, expectedOk) => {
    expect(validateRoomName(value).ok).toBe(expectedOk);
  });

  it("handles duplicate names case-insensitively", () => {
    expect(validateRoomName("Engineering", ["engineering"]).ok).toBe(false);
  });
});

describe("CreateRoomModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetchAgents.mockResolvedValue([
      { id: "agent-1", name: "Alpha", role: "executor", state: "idle", metadata: {}, createdAt: "", updatedAt: "" },
      { id: "agent-2", name: "Beta", role: "reviewer", state: "idle", metadata: {}, createdAt: "", updatedAt: "" },
    ] as any);
  });

  it("renders nothing when closed", () => {
    const { container } = render(<CreateRoomModal isOpen={false} onClose={vi.fn()} onCreate={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("requires valid name and member before submit", async () => {
    render(<CreateRoomModal isOpen onClose={vi.fn()} onCreate={vi.fn()} />);
    const submit = await screen.findByRole("button", { name: "Create room" });
    expect(submit).toBeDisabled();

    await userEvent.type(screen.getByLabelText("Room name"), "engineering");
    expect(submit).toBeDisabled();

    await userEvent.click(screen.getByRole("button", { name: /Alpha/i }));
    expect(submit).toBeEnabled();
  });

  it("submits selected draft payload", async () => {
    const onCreate = vi.fn().mockResolvedValue(undefined);
    render(<CreateRoomModal isOpen onClose={vi.fn()} onCreate={onCreate} />);

    await userEvent.type(screen.getByLabelText("Room name"), "engineering");
    await userEvent.click(await screen.findByRole("button", { name: /Alpha/i }));
    await userEvent.click(screen.getByRole("button", { name: "Create room" }));

    await waitFor(() => expect(onCreate).toHaveBeenCalledTimes(1));
    expect(onCreate).toHaveBeenCalledWith({ name: "engineering", displayName: "#engineering", memberAgentIds: ["agent-1"] });
  });

  it("closes on escape and overlay click", async () => {
    const onClose = vi.fn();
    render(<CreateRoomModal isOpen onClose={onClose} onCreate={vi.fn()} />);

    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);

    fireEvent.click(document.querySelector(".modal-overlay.open") as Element);
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("shows search-specific empty state copy", async () => {
    render(<CreateRoomModal isOpen onClose={vi.fn()} onCreate={vi.fn()} />);

    await screen.findByRole("button", { name: /Alpha/i });
    await userEvent.type(screen.getByLabelText("Members"), "zzz");

    expect(screen.getByText("No agents match your search.")).toBeInTheDocument();
  });

  it("keeps open and shows error when create fails", async () => {
    const onCreate = vi.fn().mockRejectedValue(new Error("boom"));
    render(<CreateRoomModal isOpen onClose={vi.fn()} onCreate={onCreate} />);

    await userEvent.type(screen.getByLabelText("Room name"), "engineering");
    await userEvent.click(await screen.findByRole("button", { name: /Alpha/i }));
    await userEvent.click(screen.getByRole("button", { name: "Create room" }));

    expect(await screen.findByText("boom")).toBeInTheDocument();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
});
