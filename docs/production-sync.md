# Production Branch Sync

This fork keeps two lanes separate:

- `main` tracks upstream Fusion and is used as the source for upstream updates.
- `production/fusion-goals-set-2-2026-05-05` carries local production customizations.

Do not merge production back into `main`. Update production by syncing `main` from upstream, then merging `main` into production.

## Daily Sync Procedure

```bash
git fetch upstream main
git fetch origin main
git switch main
git merge --ff-only upstream/main
git push origin main
git switch production/fusion-goals-set-2-2026-05-05
git merge --no-ff main
pnpm verify:workspace
node scripts/check-production-sync.mjs --production production/fusion-goals-set-2-2026-05-05 --main main --upstream upstream/main
git push origin production/fusion-goals-set-2-2026-05-05
```

If `main` has fork-only commits and cannot fast-forward to `upstream/main`, stop and reconcile `main` deliberately. Do not hide that divergence by merging production into `main`.

## Guard Script

Run:

```bash
node scripts/check-production-sync.mjs --production production/fusion-goals-set-2-2026-05-05 --main main --upstream upstream/main
```

The check is non-destructive. It fails when production is missing main, when main contains production-only commits, or when the fetched upstream main is not contained in the chosen main ref. It also warns if the working tree is dirty.

## Local State

Agent scratch state under `.agent/goals/`, `.agent/work/`, `.agent/reference-cache/`, `.agent/state/`, `.agent/secrets/`, and `.agent/tmp/` is intentionally ignored. Do not commit daemon tokens, OAuth refresh tokens, API keys, local databases, or generated task worktrees.
