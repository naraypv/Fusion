# fusion-plugin-cli-printing-press

Bundled first-party Fusion plugin that adds a plugin-owned dashboard wizard for drafting an external service CLI definition.

## v1 scope (FN-3763 + FN-3764 + FN-3765)

- Provides two dashboard views:
  - **Create Service CLI** (`viewId: wizard`)
  - **Manage Service CLIs** (`viewId: manage`)
- Wizard collects service basics, HTTP transport details, endpoints, and non-OAuth credential placeholders
- Manage view supports list/inspect/edit/regenerate/delete against saved drafts
- Saves draft payloads to interim JSON files under:
  - `<projectRoot>/.fusion/plugins/cli-printing-press/drafts/<id>.json`

## Run / Test panel (FN-3765)

Each draft in **Manage Service CLIs** includes a **Run / Test** panel:

1. Click **Regenerate** to build or refresh a generated CLI artifact for the selected draft.
2. Pick an endpoint and fill endpoint parameters.
3. Provide credential values in transient password fields.
4. Click **Run** to execute the generated CLI against the configured service.

The panel shows:
- status, duration, and redacted argv echo
- stdout and stderr
- exitCode and timeout state (`timedOut`)

### Credential contract

- Credentials are passed to the generated CLI via environment variables named:
  - `CLIPP_CRED_<UPPER_SNAKE_KEY>`
- Credential values are **not persisted** in plugin draft files.
- Credential values are redacted from stdout, stderr, and argv echoes before API responses are returned.

## Plugin API routes

Plugin views call host-prefixed plugin routes under `/api/plugins/cli-printing-press/`:

- `POST /drafts` — save draft
- `GET /drafts` — list summaries
- `GET /drafts/:id` — fetch full draft
- `PUT /drafts/:id` — update draft
- `DELETE /drafts/:id` — remove draft
- `POST /drafts/:id/regenerate` — generate/update CLI artifact and persist artifact metadata
- `GET /drafts/:id/artifact` — fetch artifact metadata
- `POST /drafts/:id/run` — run generated CLI and return run result

### Run endpoint behavior

`POST /drafts/:id/run` returns HTTP 200 for completed runs (including non-zero exits and timeouts), with outcome encoded in payload fields:
- `exitCode`
- `timedOut`
- `stdout`
- `stderr`
- `argv` (redacted)

Validation and state errors return:
- `400` invalid body/params/timeout
- `404` unknown draft id
- `409` draft exists but has not been generated yet

## Provisional architecture assumptions (pending FN-3762/FN-3766)

The following choices are intentionally provisional and may be revised by architecture/storage follow-up work:

- `PluginContext` usage pattern in route handlers
- Express route shape and plugin-relative path conventions
- Credential union shape for wizard payloads (non-OAuth only in v1)
- Draft storage location and JSON schema
- Generator implementation details (kept behind `generateCli(...)` abstraction)

## Deferred follow-ups

- OAuth credential flows: **FN-3762 / FN-3766**
- Canonical storage migration (replace JSON stash): **FN-3766**
- Runtime exposure/integration: **FN-3767**
- Workflow-step exposure: **FN-3768**
- Persistent run history: deferred (response-only run results in FN-3765)
