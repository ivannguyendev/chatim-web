---
name: owner-communication
description: How to brainstorm, ask and write for the owner - mechanisms as stories with real values, walk-through first, short summaries, plainest version first, problems kept apart from the fix
metadata:
  type: feedback
---

1. Tell each mechanism as a short story with real numbers and sample values (frames, cache entries). No invented terms, no short field names. Say when it reuses an existing mechanism rather than adding a new one.
2. Start a milestone with a walk-through of what it does as a story before asking anything.
3. Owner summaries stay around 130 lines: what the part does as an example, short tables, decisions/risks/tests in a few lines; config tables, thresholds and edge cases go in the plan.
4. Build the plainest version first; add an optimisation only with a measured number and the owner's go. Flag anything that serialises work. A rejected option gets its concrete failure with numbers.
5. Keep "problems of the current code" visibly separate from "the fix".

**Why:** repeated owner corrections in chatim (summaries too long and patched, questions not understood, extra mechanisms bringing new bugs); the owner applied them to chatim-web on 2026-11-07.
**How to apply:** check every brainstorm, summary and question against this list before sending. Related: [[agent-workflow-rules]], [[ops-setup-hard-to-get-wrong]].
