import { render, screen, waitFor, within } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { userEvent } from "@testing-library/user-event";
import { ChatView } from "../ChatView";
import * as useChatModule from "../../hooks/useChat";
import * as headerModule from "../Header";

vi.mock("lucide-react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("lucide-react")>();
  return {
    ...actual,
    Plus: ({ "data-testid": testId, ...props }: any) => <svg data-testid={testId || "icon-plus"} {...props} />,
    Bot: ({ "data-testid": testId, ...props }: any) => <svg data-testid={testId || "icon-bot"} {...props} />,
  };
});

vi.mock("../../hooks/useChat", () => ({
  useChat: vi.fn(),
}));

vi.mock("../Header", () => ({
  useViewportMode: vi.fn(),
}));

vi.mock("../../api", () => ({
  fetchModels: vi.fn().mockResolvedValue({ models: [], favoriteProviders: [], favoriteModels: [] }),
  fetchAgents: vi.fn().mockResolvedValue([
    { id: "agent-1", name: "Alpha", role: "executor", state: "idle", metadata: {}, createdAt: "", updatedAt: "" },
  ]),
  fetchDiscoveredSkills: vi.fn().mockResolvedValue([]),
  updateGlobalSettings: vi.fn(),
  searchFiles: vi.fn().mockResolvedValue({ files: [] }),
}));

const mockUseChat = vi.mocked(useChatModule.useChat);
const mockUseViewportMode = vi.mocked(headerModule.useViewportMode);

beforeEach(() => {
  vi.clearAllMocks();
  mockUseViewportMode.mockReturnValue("desktop");
  mockUseChat.mockReturnValue({
    sessions: [],
    activeSession: null,
    sessionsLoading: false,
    messages: [],
    messagesLoading: false,
    isStreaming: false,
    streamingText: "",
    streamingThinking: "",
    streamingToolCalls: [],
    selectSession: vi.fn(),
    createSession: vi.fn(),
    archiveSession: vi.fn(),
    deleteSession: vi.fn(),
    sendMessage: vi.fn(),
    stopStreaming: vi.fn(),
    pendingMessage: "",
    clearPendingMessage: vi.fn(),
    loadMoreMessages: vi.fn(),
    hasMoreMessages: false,
    searchQuery: "",
    setSearchQuery: vi.fn(),
    filteredSessions: [],
    refreshSessions: vi.fn(),
    agentsMap: new Map(),
  } as any);
});

describe("ChatView rooms", () => {
  it("renders create room flow and local draft list", async () => {
    render(<ChatView addToast={vi.fn()} projectId="proj-1" />);

    await userEvent.click(screen.getByTestId("chat-sidebar-scope-rooms"));
    expect(screen.getByTestId("chat-create-room-btn")).toBeInTheDocument();

    await userEvent.click(screen.getByTestId("chat-create-room-btn"));
    await userEvent.type(screen.getByLabelText("Room name"), "engineering");
    await userEvent.click(await screen.findByRole("button", { name: /Alpha/i }));
    const dialog = screen.getByRole("dialog", { name: "Create room" });
    await userEvent.click(within(dialog).getByRole("button", { name: "Create room" }));

    const roomItem = await screen.findByTestId("chat-room-item-engineering");
    expect(within(roomItem).getByText("#engineering")).toBeInTheDocument();
    expect(within(roomItem).getByText("1 member")).toBeInTheDocument();
    expect(screen.getByTestId("chat-rooms-placeholder-pane")).toHaveTextContent("Coming soon — room messaging is being wired up (FN-3807)");
  });

  it("hides sidebar on mobile when selecting a room", async () => {
    mockUseViewportMode.mockReturnValue("mobile");

    render(<ChatView addToast={vi.fn()} projectId="proj-1" />);

    await userEvent.click(screen.getByTestId("chat-sidebar-scope-rooms"));
    await userEvent.click(screen.getByTestId("chat-create-room-btn"));
    await userEvent.type(screen.getByLabelText("Room name"), "engineering");
    await userEvent.click(await screen.findByRole("button", { name: /Alpha/i }));
    const dialog = screen.getByRole("dialog", { name: "Create room" });
    await userEvent.click(within(dialog).getByRole("button", { name: "Create room" }));

    await userEvent.click(await screen.findByTestId("chat-room-item-engineering"));

    await waitFor(() => {
      expect(screen.getByTestId("chat-back-btn")).toBeInTheDocument();
    });
    expect(screen.getByTestId("chat-rooms-placeholder-pane")).toHaveTextContent("#engineering");
  });
});
