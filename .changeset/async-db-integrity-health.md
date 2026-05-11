---
"@runfusion/fusion": patch
---

Move full SQLite integrity checks off the startup critical path by running `PRAGMA integrity_check(100)` asynchronously after boot. Expose database integrity state on `/api/health` via `database.corruptionDetected`, `database.integrityCheckPending`, and `database.integrityCheckLastRunAt` while preserving existing top-level health fields.
