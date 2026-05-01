# Dashboard Real-Time & SSE Ownership Guide

[← Docs index](./README.md) · [Architecture](./architecture.md)

This document is the **canonical maintainer contract** for dashboard Server-Sent Events (SSE) ownership and lifecycle behavior.

If you change realtime behavior, validate this guide against code and tests before merging.

---

## 1) Scope and ownership model

Fusion dashboard uses multiple realtime channels. They are intentionally different and **must not be collapsed into one pattern**.

### Shared browser SSE bus (board/state stream)

- Endpoint: `GET /api/events`
- Browser owner: `packages/dashboard/app/sse-bus.ts`
- Main consumer: `packages/dashboard/app/hooks/useTasks.ts`
- Additional consumers can subscribe through `subscribeSse(...)` (e.g. mailbox unread updates in `App.tsx`)

This path uses **one `EventSource` per URL** and fans out events to many subscribers to avoid duplicate browser connections.

### Dedicated SSE endpoints with separate lifecycles

These are intentionally separate from `/api/events` ownership:

- Task log stream: `GET /api/tasks/:id/logs/stream` in `packages/dashboard/src/server.ts`
- Legacy terminal stream: `GET /api/terminal/sessions/:id/stream` in `packages/dashboard/src/server.ts`
- Chat response streaming: session message streaming in `packages/dashboard/src/chat.ts` / chat routes
- Dev server logs stream: `GET /api/dev-server/logs/stream` (dev-server route module)

**Rule:** Do not force these dedicated streams through the `/api/events` contract unless the product behavior itself changes.

---

## 2) Why shared `/api/events` exists

`packages/dashboard/app/sse-bus.ts` exists because browsers have limited HTTP/1.1 per-origin connections (commonly ~6). Multiple independent `EventSource` instances can consume all slots and stall normal `fetch` requests.

The bus prevents this by:

1. Creating at most one `EventSource` per exact URL (`channels: Map<string, Channel>`)
2. Multiplexing event handlers to subscribers
3. Closing the channel when the last subscriber unsubscribes
4. Reconnecting with a controlled heartbeat/retry strategy

This is also the pattern used by remote-node event subscriptions (`useRemoteNodeEvents.ts`) so proxied SSE URLs are shared the same way.

---

## 3) Client lifecycle contract (`sse-bus.ts`)

### 3.1 Channel keying and project isolation

Channel identity is URL-based. These are different channels:

- `/api/events`
- `/api/events?projectId=A`
- `/api/events?projectId=B`
- `/api/proxy/:nodeId/events?...`

That means project scope and remote node scope are isolated by URL and do not share the same underlying `EventSource`.

### 3.2 `clientId` behavior and control endpoints

For local `/api/events` URLs only, the bus appends a session-scoped `clientId` query parameter and uses control endpoints:

- `POST /api/events/keepalive?clientId=...&projectId=...`
- `POST /api/events/disconnect?clientId=...&projectId=...`

`clientId` is stored in `sessionStorage` (`fusion:sse-client-id`) with in-memory fallback.

Purpose:

- Let server reap stale browser streams even when transport close is delayed
- Let page unload explicitly release server listeners
- Let newest stream supersede older stream for same `(clientId, projectId)`

### 3.3 Heartbeat + reconnect

Key constants in `sse-bus.ts`:

- Heartbeat timeout: `45_000ms`
- Reconnect delay: `3_000ms`
- Client keepalive interval: `2_000ms`

Reconnect behavior:

- Any stream error triggers `forceReconnect(...)`
- Subscribers receive `onReconnect` to trigger state resync
- Heartbeat timeout also triggers reconnect
- Reconnect is blocked if channel has been closed/unsubscribed

### 3.4 Unload / bfcache cleanup

The bus listens to `pagehide`, `beforeunload`, and `pageshow` to:

- close local channels and send disconnect beacons during unload
- reopen persisted channels when page is restored from bfcache

This is a key defense against connection leakage across refresh/navigation.

---

## 4) View-aware subscription gating (`App.tsx` + `useTasks.ts`)

Task SSE should be active only when task stream updates are needed:

- Enabled in `board` and `list` views
- Disabled for other views (e.g. missions) to free connection budget

Implementation:

- `App.tsx` computes `taskSseEnabled = taskView === "board" || taskView === "list"`
- `useTasks({ sseEnabled })` skips subscription when false

`useTasks` still performs fetch/refresh behavior without SSE:

- initial fetch
- visibility-change refresh
- reconnect-triggered resync when SSE is enabled

This split avoids stale board data while preventing unnecessary streams in non-task views.

---

## 5) Server ownership of `/api/events` (`server.ts` + `sse.ts`)

### 5.1 Route owner and scope resolution

`packages/dashboard/src/server.ts` owns `GET /api/events` and resolves scope via `projectId` query parameter.

For project-scoped streams, server prefers engine-owned stores:

1. If `engineManager.getEngine(projectId)` exists, use that engine's stores
2. Otherwise fallback to `getOrCreateProjectStore(projectId)`

This avoids attaching SSE listeners to a different TaskStore/EventEmitter than the engine is mutating.

### 5.2 Shared EventEmitter expectation

`createSSE(...)` in `packages/dashboard/src/sse.ts` subscribes with `on(...)` to store emitters (`task:*`, mission, AI session, plugin, message, chat, automation) and must always mirror teardown with `off(...)` during cleanup.

Any new event forwarding must preserve this **subscribe/unsubscribe symmetry**.

### 5.3 Connection management, heartbeat, stale reaping

Server-side SSE connection handling includes:

- active connection tracking and high-water metrics
- named `heartbeat` event every 30s
- safe write with backpressure guard (`SSE_MAX_BUFFERED_BYTES`)
- stale-client timer keyed by `(clientId, projectId)`
- superseding older same-client streams
- explicit disconnect (`disconnectSSEClient`) and keepalive (`markSSEClientAlive`) endpoints

Cleanup paths include request close/aborted, response close, socket close/error, send failures, stale timeout, supersede, and backpressure.

---

## 6) Project and remote-node scoping

### Local project scoping

Use:

- `/api/events?projectId=<projectId>`

This keeps task/missions/events scoped to the selected project store.

### Remote node scoping

Proxy route:

- `GET /api/proxy/:nodeId/events` in `packages/dashboard/src/routes/register-proxy-routes.ts`

The proxy forwards upstream `/api/events` (including query string) and preserves SSE framing to the browser.

Client side:

- `useRemoteNodeEvents.ts` subscribes via `subscribeSse("/api/proxy/:nodeId/events")`

Because it reuses the shared bus, remote-node consumers get the same multiplexing/reconnect behavior and avoid duplicate proxied streams per URL.

---

## 7) Validation points (tests to run before changing conventions)

At minimum, verify these suites:

- `packages/dashboard/app/__tests__/sse-bus.test.ts`
  - one-EventSource-per-URL multiplexing
  - reconnect and teardown behavior
- `packages/dashboard/app/hooks/__tests__/useTasks.test.ts`
  - task event reconciliation
  - stale project-event guard on project switches
  - heartbeat/reconnect resync behavior
- `packages/dashboard/src/__tests__/sse.test.ts`
  - server-side clientId disconnect/keepalive/supersede behavior
  - listener cleanup expectations
- `packages/dashboard/src/__tests__/server.events.test.ts`
  - events endpoint wiring/integration contracts

---

## 8) Common pitfalls and troubleshooting

### Pitfall: opening native EventSource in each hook/component

Anti-pattern: bypassing `subscribeSse` and creating raw `new EventSource("/api/events")` per consumer.

Impact:

- duplicate connections
- HTTP/1.1 slot exhaustion
- stalled fetches and flaky UI updates

Fix: always route `/api/events` consumers through `sse-bus.ts`.

### Pitfall: stale events after project switch

`useTasks` guards SSE handlers with `projectContextVersionRef`.

If changing project-switch behavior, keep stale-event guards and late-response guards intact so old project events cannot mutate new project state.

### Pitfall: missing symmetric cleanup

Any new `on(...)` registration in SSE server code must have matching `off(...)` in cleanup.

Missing cleanup causes listener leaks and cross-session event bleed.

### Pitfall: assuming reconnect implies full consistency

Reconnect may miss transient events while disconnected. Consumers should use `onReconnect` to refetch authoritative state (as `useTasks` does).

### Pitfall: collapsing dedicated streams into `/api/events`

Task logs/chat/dev-server streams have distinct payload and lifecycle semantics. Keep boundaries clear unless changing product architecture intentionally.

---

## 9) Maintainer checklist for SSE changes

Before merging SSE-related changes:

1. Confirm ownership layer (`sse-bus`, `useTasks`, `server.ts`, `sse.ts`, proxy route) is still correct
2. Confirm project-scoped and remote-node isolation still hold by URL and query forwarding
3. Confirm subscribe/unsubscribe symmetry for every new forwarded event
4. Confirm reconnect/resync behavior for affected consumers
5. Run and update relevant tests listed above
6. Update this document if the contract changed
