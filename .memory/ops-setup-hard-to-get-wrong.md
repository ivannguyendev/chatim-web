---
name: ops-setup-hard-to-get-wrong
description: Values that must agree (SDK timers, app config) are enforced in code with a clear error, never only documented; multi-step procedures become one command
metadata:
  type: feedback
---

The owner treats a setup that is easy to get wrong as an operations risk, not a docs task.

**Why:** in chatim, timers that depended on each other and that nothing checked kept e2e failing until the relations were enforced in code; the owner applied this to chatim-web on 2026-11-07.
**How to apply:** in every design, list the values that must agree: SDK timers that depend on each other or on server values (heartbeat, reconnect backoff, token renew lead time) and app config (gateway and WebSocket URLs). Remove each coupling or enforce it in code: validate config at startup and fail with a clear message; check timer relations when the SDK client is created, covered by a unit test. Default every other value; make multi-step procedures (e.g. proto regenerate) a single npm script. Related: [[owner-communication]].
