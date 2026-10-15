# Doomscroll Autopsy — Implementation Summary

> The shared memory between AI chats. **Read all of it before starting a milestone.** When you finish, update the status table and **append** your section at the bottom using the template. Never rewrite or delete another milestone's section; if something in it is now wrong, add a correction in your own section.

## Status

| Milestone | Status | Chat finished | Showcase level reached | Notes |
|---|---|---|---|---|
| Planning | ✅ Done | 2026-10-15 | — | PDD v2, milestone plan, workflow skills |
| M0 Scaffold + contracts | ⬜ Not started | | | |
| M1 Observer + bins | ⬜ Not started | | | |
| M2 Embedding engine | ⬜ Not started | | | |
| M3 Territories + labeling | ⬜ Not started | | L1 | |
| M4 Prediction + nudges + replay | ⬜ Not started | | L2 | |
| M5 Metrics + dashboard + privacy | ⬜ Not started | | L3 | |
| T1 Teacher data | ⬜ Not started | | | |
| T2 Fine-tune + ONNX | ⬜ Not started | | | |
| M6 Integrate 270M | ⬜ Not started | | L4 | |
| M7 Release + first user | ⬜ Not started | | L5 | |
| M8 Should-tier extras | ⬜ Not started | | L6 | |
| M9 Showcase | ⬜ Not started | | | |

Status values: ⬜ Not started · 📝 Plan awaiting approval · 🟡 In progress (plan approved) · ✅ Done · ⚠️ Done with gaps · ❌ Blocked

## Current showcase level
**None yet.** (Update this line whenever a milestone raises the level; see `implementation-milestones.md` 0.4.)

## Known issues and open follow-ups
(Each entry: ID, found in, description, suggested owner milestone.)

- none yet

---

## Section template (copy for your milestone)

```markdown
## <ID> — <title>
**Status:** ✅ Done | ⚠️ Done with gaps | ❌ Blocked
**Date:** YYYY-MM-DD · **Commits:** <first-hash>..<last-hash>
**Approved plan:** `docs/plans/<ID>.md` (approved YYYY-MM-DD HH:MM)

### What was built
- Bullet list of user-visible and internal capabilities.

### Key files
- `path` — what it does

### How to run / verify
- Exact commands and manual steps.

### Acceptance criteria
- [x] criterion — evidence (test name, measurement)
- [ ] criterion not met — why, and what was done instead

### Deviations from the approved plan
- Small adjustments made during implementation, and any material deviation together with when the owner approved it.

### Decisions and deviations from the PDD
- Any choice not specified in the PDD, and any deviation from it (with PDD decision-log update if one was made).

### Spike / measurement results
- Numbers recorded (also in `experiments/spikes.md`).

### Contracts changed
- Changes to `shared/` schemas or cross-module interfaces, and which consumers were updated.

### Known issues
- Bugs or limits left behind (also add to "Known issues and open follow-ups" above).

### Showcase evidence
- What was saved in `docs/showcase/<ID>/` and what the owner should capture.

### Notes for the next milestone
- What they must know, watch out for, or reuse.
```

---

## Planning — Product design and milestone plan
**Status:** ✅ Done
**Date:** 2026-10-15 · **Commits:** initial commit

### What was built
- `PDD.md` v2: full product design with 51 decisions (D-01 to D-51), priority tiers, risks, spikes and showcase plan.
- `implementation-milestones.md`: milestones M0–M9 plus a parallel training lane T1–T2, the showcase ladder (what we can submit if we stop early), global rules, and shared contracts.
- Plan-approval gate: every milestone writes `docs/plans/<ID>.md` and waits for the owner's explicit approval before implementing (`implementation-milestones.md` 0.7).
- Git repository initialised locally on `main` (no remote).

### Notes for the next milestone
- Start with **M0**. Once M0 is committed, **T1** can start in a separate chat in parallel.
- The owner downloaded the teacher model (`unsloth/gemma-4-31B-it-GGUF`, UD-Q4_K_XL, vision, MTP) in Unsloth Studio.
- Machine: Apple M4 Max, 64 GB, macOS 27, Node 24 with npm (no pnpm), `uv` available, Python 3.13. No Docker or Ollama.
