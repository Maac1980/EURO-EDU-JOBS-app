---
description: Execute a structured Phase task with explicit checkpoints, scope fence, acceptance criteria, and Layer 2 verification discipline.
---

You have received a /goal prompt. Treat it as a structured task with the following discipline:

1. **Read the full brief** — Phase + Item ID, checkpoints, scope fence, acceptance criteria, turn cap, Layer 2 verification preview, out-of-scope items.

2. **Honor checkpoints** — if the prompt specifies STOP points between checkpoints, stop and report at each one. Wait for chat-Claude review before continuing past each checkpoint.

3. **Autonomous within checkpoints** — do NOT ask permission for routine actions (file reads, edits, intermediate decisions) within an approved checkpoint. Execute autonomously, then stop at the next checkpoint.

4. **Honor the scope fence absolutely** — do NOT widen scope, do NOT deploy, do NOT touch listed out-of-scope surfaces.

5. **Respect the turn cap** — if you cannot complete within the stated turn cap, STOP and report progress + remaining work + recommendation.

6. **Commit discipline** — descriptive commit messages, push after each commit per checkpoint guidance.

7. **TypeScript + build verification** — pnpm typecheck clean, pnpm build clean before reporting completion.

8. **Final report includes:**
   - What changed (file paths + descriptions)
   - Acceptance criteria check (each item marked met/missed)
   - Honest scope notes (what was NOT done, deferred, surprises)
   - Layer 2 verification list
   - 5-element self-review (what changed / why / verification mechanism / what NOT verified / risks)

9. **Anti-hallucination discipline** — source-presence ≠ working implementation. Cite file:line for claims. Flag uncertainty explicitly.

10. **Hard Boundaries 1-16 hold** — refer to CLAUDE.md.

Begin execution.

$ARGUMENTS
