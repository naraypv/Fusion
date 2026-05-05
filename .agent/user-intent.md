This repo contains the fork of “https://github.com/Runfusion/Fusion.git”. This original project is under rapid development and repo must be updated via fork sync multiple times day to remain in compliance. All these fusion system changes will be done on a git production branch and pushed to the github on the production branch. To check if the udpates from original mother fusion project has been integrated, the main branch changes from mother branch is merged back to produciton branch. The production and main branch will always remain seperate. Main branch will be used as a sync source for the fork to get full updated Fusion code base. Production branch is where we implement custom functionalities and software system module changes. Production branch will always integrate the Fusion main branch code. main branch will never integrate the production branch changes. This behavior should be made robust and produciton ready - main updates should never break production branch. Production branch updates should never break the ability to integrate the main fork sync of updated main code. update and integration checks should be done once a day to remain in compliance. 

The current behavioral ruleset mandate of this project is to do the following: 
1. Never break the original project updates via the custom changes made in this repository
2. Keep the custom changes made in this fork project modularized and working well with the continuously updated Fusion original project 
3. Make the required AGENTS and rules and other files required for codex agent to function effectively in this fork
4. Add to gitignore all agent function related markdown and other codex agent related functioning and active worktrees. Only sync back to the github the mature functionalities produced by this customization cycles. 
5. You will never act from guessing or from memory. You will verify all required information before making structural and software module level decisions. 
6. Always refer to the documentations of the fusion project and be compliant. 
7. Study the documentation for contributing and stick to those rules properly 
8. A new production lane branch will be made and synced to github. All system modifications will be made in and pushed to this production branch. This production branch will be updated with the original Fusion repo code every single day by merging. This way the changes made to the system is captured in a place which is constantly updated from the source with new features and also with features that is useful for my specific case designed here. 
9. A dspy system with multi-LLM account login based architecture is implemented and functional in the path “/media/naray/backup_np_2/github/dspy”. This repo is one of the core module which we will use repeatedly for Fusion system design and implementation. When keyword "dspy" is referred, it almost always means this path.  


Other useful documentations that needs to be studied before proceeding. Cache a local copy of these documentations for the continued reference of agents. Make agent an expert in these documentations along with the documentation of Fusion before proceeding: 
1. Cursor agent (https://cursor.com/docs). Special emphasis is to its API methods (https://cursor.com/docs/api) 
2. MiniMax (https://platform.minimax.io/docs/guides/models-intro) and its newest model API reference (https://platform.minimax.io/docs/api-reference/api-overview) 
3. DSPy codebase (https://github.com/naraypv/dspy.git in the production lane in th path /media/naray/backup_np_2/github/dspy) and their documentation (https://dspy.ai/) 
4. Codex (https://github.com/openai/codex.git) 
5. Claude code (https://github.com/anthropics/claude-code.git) 
6. NVIDIA NIM docs - https://developer.nvidia.com/nim?sortBy=developer_learning_library%2Fsort%2Ffeatured_in.nim%3Adesc%2Ctitle%3Aasc#section-why-nim 
7. DSPy agent skills - https://github.com/intertwine/dspy-agent-skills.git 


This system has a fusion agent system installed and functioning. Purge that fully before you start. We will install the modified system after evolving it to production readiness in this machine. Notice the key of the fusion system (fn_65238150c60b558aa413a3ec471dedab). Preserve this key for future install of the modified system. 

# Goals Set - 1:
1. Fusion does not have multi account OAuth support for codex agent. That should be implemented.
2. Fusion does not have multi account OAuth Support for claude agent. That should be implemented.
3. Fusion does not have multi account support for MiniMax token plan keys. That should be implemented.
4. Fusion does not have multi account support for cursor agent via OAuth support. That should be implemented.
All Items 1-4 should be able to be set up via CLI commands and OAuth login flow from that CLI/from the menu login flow of the fusion. If a codex/claude/cursor/MiniMax agent is logged in more than once, automatically resolve it as another account if the logged in account is different. If the account is same, Just indicate that this is the same account and quit. Dont put the burden on assigning account numbers and name to user. User should be able to just login and forget about these functions. These are infrastructure and they shoudl just function for decreasing the cognitive load of the user.
The menu login flow for these items should be having an additional item called "add another account" which when clicked should reinitate the login flow for the capture of the next account to create multi-account system. the login should be possible without logging out. That is the definition of multi-account support. The login menu flow needs to have that option for relevant multi-account login option in that login flow as well. The point of these multi-agent Auth is to have the system automatically pick up the next account when the first logged in account is exhausted of its token/credits.

5. I need model fall back chain as a core menu item (one for global and one for project specific) in which there must be 10 text boxes arranged 1-10 with drop down menu where I can select models in preferential order. First box is priority-1, second box is priority-2 etc. So if priority-1 model fails, priority-2 model is automatically picking up the work all the way upto priority 10. This is also a core feature that needs to be implemented and made available in the menu functionality in both global level and project level menus.

6. Fusion does not have native DSPy support. That should be implemented using the DSPy repo in the system that has multi OAuth account based LM call support which is different from the classic DSPy implementation. This Fusion DSPy must be well engineered that the entire Fusion request and ticketing system must be contacting large language models using the DSPy based calls and template functions. This is a large implementation in which all the native Fusion functioning modules will have a parallel DSPy based function/tool/chat call system so that all agent behavior is turned into DSPy based declaritive calls that the system is upgraded to production readiness that will be able to serve a large client population working in the serves or be dependable for scientific workflows by removing the stochastic noise or hallucination risk by the ability of DSPy to do declaratively program the Large language models. This will force all fusion calls to LLMs via DSPy infrastructure so that it will always give high quality production ready responses that can be depended on long tailed scientific and software tasks. This should not replace the old fusion callstack. Instead, a DSPy menu item should be added to the general and project level tasks that will have several toggle controls that we will be adding systematically overtime as this evolves. Currently each of these must have a single toggle showing "Route all LLM calls via DSPy". If this is toggled on, then it will make all traffic routing of the LLM calls via DSPy based declarative programming based routing which will automatically replace all the LLM functional call function by function to DSPy format as a parallel DSPy only routing infrastructure to replicate all the functionalities of the Fusion infrastructure that has LLM calls. For the user, this does not change any behavior. But underneath everything changes to DSPy routines.

Once this is completed and tests pass, install this new fusion locally. Initial the install using the old fusion system key (fn_65238150c60b558aa413a3ec471dedab) and test it locally. Once its production ready accoriding to you, terminate the session and update the produciton branch and push to production branch inthe github. Then merge the main branch to production branch locally and in github. The test this again, debug any errors or update related breakages and put in safe guards to prevent future update related breakages both ways. THen once is ensured to be functional even after source update and merge of main, push to github to the production branch once again. THen stop and record all required memory, state and documentation files for agents and humans to pick this up from this state. Then let me know of the completion status. 


Systematically achieve all these items step by step. Dont skip anything

---

# Goals Set - 2: Atomistic planning and slop-janitor as core Fusion capability

This section extends the fork’s intent: treat **durable, ordered goal plans** and **plan–improve–implement–review loops** (as implemented by `slop-janitor` and the Codex exec-plan pattern) as a **first-class Fusion capability**, not only as an external tool run manually against `.agent/user-intent.md`.

**Reference repo:** `/media/naray/backup_np_2/github/slop-janitor` (Rust CLI + Codex app-server integration, `.agent/goals/`, `.agent/work/`, skills under `.agents/skills/`).

**Non-goals for this goal set:** Replacing Fusion’s engine with Codex; requiring every user to install Codex. Integration must respect upstream Fusion constraints (AGENTS.md: static `@fusion/*` imports, no blocking `execSync` for user commands, tests required for behavior changes).

---

## Recursive step-by-step plan (integration decomposition)

Each level expands the previous into smaller units until each leaf is a single deliverable or a single verification command.

### Level 0 — Outcome

Fusion can **produce, persist, and execute** atomistic plans (goals or exec-plan-shaped work) tied to tasks or missions, with optional **external runner** compatibility so the same artifacts work with `slop-janitor goals run` when Codex is available.

### Level 1 — Major phases

1. **Inventory:** Map where Fusion already stores prompts, task specs, workflow steps, and agent instructions (`packages/core`, `packages/engine`, `packages/cli`, `packages/dashboard`).
2. **Contract:** Define the canonical on-disk artifact shape Fusion owns (minimum: ordered goals with `objective`, `acceptance_criteria`, `validation`, `status`, `depends_on`; optional: ledger events). Align field names with slop-janitor’s `goals.json` where practical to avoid duplicate mental models.
3. **Integration mode decision:** Choose one primary path (document the other as optional):
   - **A. Subprocess adapter:** Fusion invokes `slop-janitor` (or a thin wrapper) when configured, same as any CLI integration; artifacts live under `.fusion/` or `.agent/` per project policy.
   - **B. In-process library:** Port or reimplement only the **state machine** (goal ordering, checkpoints, validation hooks) inside `@fusion/engine` or `@fusion/core`, without binding the whole repo to Codex.
4. **UI / CLI:** Expose “create goal plan from brief”, “approve plan”, “run next goal”, “import/export plan” in dashboard and/or `fn` CLI.
5. **Safety:** Sandboxing, checkout leases, and “never auto-merge” rules must apply to plan-driven runs like any executor session.
6. **Verification:** Unit tests for plan parsing and transitions; integration test with mocked runner; documentation for fork operators.

### Level 2 — Per-phase atomic units (examples)

- **Inventory:** List every code path that builds the “task prompt” or system prompt for triage/executor; note JSON vs markdown boundaries.
- **Contract:** Write a JSON Schema (or TypeScript type + zod) for `goals.json` consumed and emitted by Fusion; version field `plan_format_version`.
- **Subprocess adapter:** Resolve binary path from env + settings; capture stdout/stderr to Fusion run audit; enforce timeout and non-4040 ports for any spawned local services.
- **In-process:** Implement `PlanRunner` interface with `loadPlan`, `completeGoal`, `appendLedger`; engine calls LLM for “execute current goal” using existing model resolution.
- **UI:** Read-only plan viewer first; then approve/run controls behind feature flag.

### Level 3 — Leaf stop conditions (each must be observable)

- Schema validates sample plans from slop-janitor and from hand-written fixtures.
- One E2E test: “create plan → mark goal complete → ledger line appended.”
- Docs: `docs/planning-integration.md` (or fork-only doc path) describes artifact layout and how to run slop-janitor against the same folder.

---

## Prompt A — Optimal prompt for Fusion-side design and implementation (use in Cursor on the Fusion repo)

Use this **after** slop-janitor (or `create-goals`) has produced a concrete plan under `.agent/goals/<id>/` or an ExecPlan under `.agent/work/`, and you have read `.agent/user-intent.md` Goals Set 1 and 2.

```text
You are working in the Fusion fork repository. Read AGENTS.md and obey it (imports, execAsync for user commands, tests, port 4040).

Goal: Design and implement “atomistic planning” as core Fusion functionality, aligned with slop-janitor’s durable plan model (.agent/goals: brief.md, goals.json, ledger.jsonl) and PLANS.md-style exec plans under .agent/work/ when relevant.

Constraints:
- Do not break upstream mergeability: keep changes modular (new module or adapter boundary).
- Preserve existing LLM call paths unless Goals Set 1 “DSPy routing” is already implemented; this task may add parallel plan artifacts only.
- Every new behavior needs tests under __tests__/ per repo convention.

Deliverables:
1. A short design note in-repo (path you choose under docs/ or .agent/) listing: artifact paths, JSON schema/version, how tasks link to a plan ID, and whether Fusion invokes slop-janitor as subprocess or reimplements a minimal runner.
2. Typed plan load/save in @fusion/core (or appropriate package).
3. Engine hook: when a task enters a “planned execution” mode, load active goal, inject objective + acceptance criteria into the agent prompt, and record completion back to goals.json + ledger.
4. CLI or dashboard stub (feature-flagged) to list goals and mark status — smallest vertical slice that proves the loop.

Start by grepping for task prompt assembly and AgentStore/session creation; propose the smallest diff that closes the loop end-to-end, then iterate.
```

---

## Prompt B — Optimal prompt for slop-janitor to integrate Fusion properly (use from Fusion repo root with linked repo)

Use this with **slop-janitor** when Fusion is the primary cwd and you need the janitor/builder/goals runner to **see both repos** and emit plans that reference real Fusion paths.

Prerequisites: clean git state in Fusion (and slop-janitor if linked); `CODEX_WORKSPACE` set per slop-janitor README.

```text
Primary repository: this Fusion fork. Linked repository: /media/naray/backup_np_2/github/slop-janitor (read-only is fine unless you are editing slop-janitor itself).

Read Fusion/.agent/user-intent.md Goals Set 1 and Goals Set 2 in full. Read Fusion/AGENTS.md.

Task: Produce an implementation-biased goal plan or Meta Exec Plan that integrates slop-janitor-style atomistic planning as a core Fusion feature. Plans must reference concrete Fusion file paths (packages/core, packages/engine, packages/cli, packages/dashboard) and cite existing patterns (task store, run audit, settings).

Requirements for each goal in goals.json:
- objective, acceptance_criteria, validation (exact pnpm test or grep-based checks), depends_on, stop_condition.
- Explicit non-goals so Codex does not refactor unrelated DSPy or OAuth work unless this plan’s dependency graph orders it.

If using builder: set slices so early slices land the contract + types + tests; later slices add UI/CLI. If using create-goals only: keep goals ordered with no parallel ambiguity.

After the plan file exists, stop for human approval before running slop-janitor goals run.
```

Example command line (operator runs from Fusion root):

```bash
export CODEX_WORKSPACE=/path/to/codex/codex-rs
/path/to/slop-janitor/slop-janitor --linked-repo /media/naray/backup_np_2/github/slop-janitor --prompt "$(cat Fusion/.agent/snippet-use-prompt-B.txt)"
```

(Replace the `cat` path with a small file containing Prompt B if the shell struggles with length.)

---

## Ordering relative to Goals Set 1

- **Parallel-safe:** Plan artifact types and read-only viewers can proceed in parallel with OAuth/DSPy work if they touch different packages or live behind feature flags.
- **Serialize when:** Any change to the **same** prompt assembly pipeline or model routing as DSPy (Goals Set 1 item 5) must be sequenced: either land DSPy toggle contract first, or land plan-injection **behind** the same routing abstraction so you do not double-patch the same functions.

---

## Completion signal for Goals Set 2

Stop when: (1) Fusion can create/update/read a versioned goal plan bound to a task or project ID, (2) at least one automated test proves plan state transitions, (3) documentation tells a human how to optionally run `slop-janitor goals run` on the same artifact directory, and (4) production-branch merge rules from Goals Set 1 still hold.
