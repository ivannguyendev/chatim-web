# CLAUDE.md

Guidance for Claude Code and AI Agents working in `chatim-web`.

## Project

`chatim-web` is the **web client for chatim** (shared chat infrastructure, CPaaS, single-tenant). One repo holds two deliverables:

- `packages/sdk`: framework-agnostic TypeScript SDK (no React import) that other products can reuse. Owns connection, auth/token renew, reconnect, command queue, HTTP + WebSocket clients.
- `apps/web`: React web app built on the SDK, including login UI.

The server lives in the separate `chatim` repo (Go, server-only per its D206). This repo implements the client side of the server contract; it never redefines server behavior.

Input material (PRDs, captures, API docs) is **transient** and can be deleted anytime. Never link to transient input files from any tracked file (code, docs, CLAUDE.md, README, `INDEXES.csv`, `.memory/`). Copy permanent requirements into `docs/` and exact UI copy into constants.

**Status:** No code yet (no `package.json`). Repo shape: SDK + web app. Single-tenant. Client uses HTTP + WebSocket (no RPC). Login UI included. Stack proposed: Vite + React 19 + TypeScript strict. Features and phases being planned.

## Code index

`INDEXES.csv` at the repo root is the context-search entry point (columns `path,kind,purpose,key_symbols,used_by,tests`). Read it before searching the tree.

- **Row:** one file, folder or config, with the contexts that can be retrieved from it (listed in `purpose`/`key_symbols`). No line numbers.
- **Scope:** only official files, folders, configs and docs that are confirmed correct and useful as retrieval context. Never index transient inputs (`.local/`), plans, drafts or generated code.
- **Update:** for every new or modified file, check whether it is in scope or changes an existing row; if so, add or update the row in the same change.

## Repo Memory

`.memory/` (committed; index `.memory/MEMORY.md`) holds the why behind rules and decisions, shared by all agents. Read the index before any brainstorm, summary or plan and open only the notes that apply.

- **Gate:** any create, update or delete in `.memory/` (index included) needs the owner's approval of the exact draft (file name + full content, or the file to delete), given once for all drafts at the phase close. An answer to another question, a general "ok" or silence is not approval.
- **When:** only at Close-out (Agent Workflow step 8).
- **Criteria:** write a note only when all hold: the owner confirmed it; it stays true after the task; it is not already in this file, `docs/`, code or git; a future agent would act differently without it. Never store assumptions, status, proposals, open questions, commit hashes, code, owner quotes or secrets.
- **Where else:** rules → this file (`.memory/` explains them, never copies them); decisions and their reasons → `docs/decisions/`; requirements and specs → `docs/`; phase scope and status → `docs/plans/*-summary.md`; drafts → `<agent dir>/plans/`.
- **Format:** one fact per note, frontmatter `name`, `description`, `metadata.type`, one line in the index; update a note instead of adding a duplicate. At the close, propose deleting notes a D-id or this file now covers.

## Decision Log

- `docs/decision-log.md` is the index (created with the first accepted decision); accepted decisions live in `docs/decisions/`, one file per milestone named `D<first>-<milestone>.md` (3 digits, e.g. `D001-<milestone>.md`); the index lists each file's D-id range, sections and dates, so a phase close adds or updates its index row. D-ids are global in this repo and start at D001; find one through the index or `grep '| D012 |' docs/decisions/`. Cite server decisions as `chatim D234` so they never collide with local D-ids. Rows `| # | Quyết định | Lý do |`, date in the section heading. The index header holds only the update date, never a changelog.
  - A row is a decision that is hard or costly to reverse and shapes the project's direction: data model, contracts, events and APIs, app and module boundaries, correctness mechanisms, operating procedures, product scope. Not a row: how we work (phases, order, branches, PRs), implementation detail (package lists, env, metrics), status.
  - Lý do says why this choice over the alternatives, naming them; there is no rejected-alternatives column. No owner quotes.
  - Proposed decisions are discussed during brainstorming and reviewer phase split before the owner accepts them; only then are they folded in. A decision taken while coding goes into the as-built summary and enters the log only when the owner accepts it at close-out. Nobody adds a row on their own. A replaced row starts its Quyết định with `**Thay bởi D012 (M2).**` or `**Thay một phần bởi D020 (vế ngắn).**`. New rows go in the current milestone's file.

## Architecture (planned)

```
packages/sdk/   Framework-agnostic SDK: transport (WebSocket + HTTP), auth/token renew, reconnect, command queue
  src/gen/      Code generated from chatim protobuf (for WebSocket binary frames)
apps/web/       React app: feature folders, UI components, server cache, UI copy constants, login UI
docs/           FINALIZED docs only: client contract copied from server specs, docs/plans/*-summary.md,
                decision-log.md (index) + decisions/D<first>-<milestone>.md (accepted decisions)
.memory/        Shared agent memory (context, decisions, rationale); index in .memory/MEMORY.md
INDEXES.csv     Codebase context search index
```

Stack (agent proposal, **confirmed: HTTP + WebSocket, no RPC, login UI included**):

- Vite + React 19 + TypeScript strict. SPA with login UI, no SSR.
- HTTP (fetch / TanStack Query) for REST endpoints; WebSocket for realtime writes and events. No RPC.
- TanStack Query as the server cache; realtime events patch the cache. Local UI state stays local.
- Tailwind + Radix for UI.
- Vitest (+ React Testing Library) for unit/component tests; Playwright for E2E.

npm scripts are defined at scaffold time; document them here once they exist.

## Server Contract Rules

Source of truth: `chatim` repo, `docs/features/09-feature-realtime-delivery-and-ephemeral.md` §11 (client spec), `docs/apps/gateway.md`, `docs/apps/identity.md`. Copy the parts this repo depends on into `docs/` before implementing them.

- **WebSocket:** binary protobuf frames only (`ClientFrame` up, `ServerFrame` down), subprotocol `chatim.v1`; no JSON, no compression. Heartbeat, reconnect backoff per close code, token renew timing, `load_failed`/`resync` handling follow §11 exactly; each rule is a unit-tested item in `packages/sdk`.
- **Command split:** realtime writes go over WebSocket; reads, room management, and auth go over HTTP. No RPC is used. Never send a command over the wrong transport.
- **Single-tenant:** the system is single-tenant; identity is user-based, derived from the token. Never put user IDs in frames or request bodies as authority.
- **Auth:** HTTP endpoints use `Authorization: Bearer`; CORS allows only configured origins and no credentials, so no cookie auth.
- **Login UI:** `apps/web` includes the login page directly, communicating with the server authentication endpoint to retrieve the token/session.
- **Secrets:** never log tokens or the `Authorization` header; never commit `.env` files or keys.
- **Proto:** generated code for WebSocket frames is pinned to a chatim commit/tag; regenerate, never hand-edit.

## Testing Rules

- Cheapest layer that proves the behavior. SDK logic (reconnect, renew, queue, frame handling) is pure and unit-tested with Vitest using fake timers and a fake socket.
- Components: React Testing Library, assert user-visible behavior.
- E2E: Playwright for critical user flows.
- Assertions on UI copy use exact constants, never paraphrased text.

## Agent Workflow (Mandatory)

Applies to every non-trivial task (new feature, refactor, standards change). `<agent dir>` is `.claude` for Claude, `.agent` for other agents; `YYMMDD` comes from `date +%y%m%d`.

1. **Brainstorming:** Read docs, clarify requirements. Evidence rule: Ensure requirements and specifications are documented in `docs/` before coding; implementation must follow `docs/`.
2. **Reviewer: Phase split:** Before any plan summary, a reviewer assesses the scope and discusses with the user whether to split it into milestones/phases. Each phase must be deliverable and verifiable on its own so later changes stay isolated. A design that changes a part outside the phase stops for a scope check with the owner; a needed server change becomes a separate item in the chatim repo, never a client workaround.
3. **Plan summary (current phase only):** `docs/plans/YYMMDD-<feature>-p<N>-summary.md` with goal, scope/out-of-scope, deliverables, acceptance criteria, evidence sources and risks. The user approves it.
4. **Detailed plan:** `<agent dir>/plans/YYMMDD-<feature>-p<N>.md`, written only after the phase summary is approved.
5. **Review:** A reviewer checks the detailed plan against the summary and `docs/`; resolve all Critical/Important findings before coding.
6. **Code:** Follow the detailed plan; report every deviation.
7. **Test:** Run the narrowest command; report exit code and pass/fail/flaky; update the phase summary to the actual build.
8. **Close-out:**
   - Rule check & memory proposal: add rules confirmed by the owner to CLAUDE.md; propose `.memory/` drafts and deletions per "Repo Memory"; state what changed or "no new rules".
   - Decision Log: propose accepted decisions for `docs/decisions/` and `docs/decision-log.md` per "Decision Log".
   - Code index: propose additions or updates to `INDEXES.csv`.
   - Progress: state the phase just finished, the next phase, and all remaining phases.

## Definition of Done for Merging to Main

1. **Plan & Summary Completion:** All tasks in the phase plan are complete, and `docs/plans/YYMMDD-<feature>-p<N>-summary.md` reflects the actual build; deviations have been reported and resolved.
2. **All Green:** lint, typecheck and all test suites pass cleanly.
3. **No Critical / Important Findings:** Zero unresolved Critical or Important findings; Minor findings are documented in the plan or docs.
4. **Go-Live Readiness in PR:** PR description states the readiness level and remaining items before production go-live.

## Domain Gotchas

- Keep UI labels, button names, and specialized terms in their original language.
- `.claude/plans/` and `.agent/plans/` are gitignored like `.local/`; never un-ignore them. Never put detailed plans in `docs/`.
