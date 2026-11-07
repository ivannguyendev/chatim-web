---
name: agent-workflow-rules
description: Why the user mandates brainstorm → decisions → phase split → per-phase plan summary → detailed plan → review → code → test, evidence-only work, scope checks, rule check and progress report after each phase
metadata:
  type: feedback
---

The steps are canonical in CLAUDE.md ("Agent Workflow (Mandatory)"). The user set them on 2026-10-24.

- Evidence only: work that cannot be checked against a server spec, PRD or user decision will not be approved. An incomplete component breakdown is also rejected, so unclear scope is discussed before planning.
- Phase split before plan summary: long plans tend to change mid-execution and drag unrelated details with them; one summary per phase isolates that change.
- Scope check when a design leaves the phase: integrating another part (the server or the other package) pulls that part's problems in and grows the phase without bound (owner rule carried over from chatim, applied here on 2026-11-07).
- Rule check after big tasks and progress report after each phase: keep rules current and progress visible.

**Why:** the user wants verifiable, approvable work and small, isolated plans that survive change.
**How to apply:** follow CLAUDE.md "Agent Workflow" for every non-trivial task; when evidence is missing, stop and present purpose + component breakdown + questions instead of guessing. Related: [[language-preferences]], [[owner-communication]].
