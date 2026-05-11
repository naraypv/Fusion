---
"@runfusion/fusion": patch
---

Add a new `executorRuntimeEnv` plugin contribution surface so plugins can inject task-scoped runtime environment variables and PATH prepends for executor-spawned commands.

The bundled `fusion-plugin-cli-printing-press` now contributes generated CLI artifact directories to task PATH and exports `env_var` credentials into the task environment for executor command execution.
