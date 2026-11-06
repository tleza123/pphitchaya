# BRIEFING — 2026-11-06T06:00:00Z

## Mission
Implement Truck App backend API routes (bootstrap, settings, records, photos, backup) and automated tests.

## 🔒 My Identity
- Archetype: teamwork_worker
- Roles: implementer, qa, specialist
- Working directory: c:\Users\tleza\Documents\GitHub\pphitchaya\.agents\teamwork\teamwork_worker_w2_t4\
- Original parent: 2cf3c4d2-1537-4198-aafe-2687785ec9ab
- Milestone: Wave 2, Task 4

## 🔒 Key Constraints
- EXCLUSIVE WRITE OWNERSHIP:
  - src/app/api/truck/bootstrap/route.ts
  - src/app/api/truck/records/route.ts
  - src/app/api/truck/records/[id]/route.ts
  - src/app/api/truck/settings/route.ts
  - src/app/api/truck/photos/route.ts
  - src/app/api/truck/photos/[id]/route.ts
  - src/app/api/truck/backup/route.ts
  - tests/truck-routes.test.ts
- ZERO EMOJI RULE: Absolutely no emojis in source code, error messages, or response strings.
- STRICT READ-BEFORE-WRITE: In Firestore transactions, tx.get/tx.getAll must strictly precede all tx.set/tx.update/tx.delete.
- INTEGER SATANG RULE: All money (fuel, driver pay) stored and calculated as integer satang.
- IDEMPOTENCY & REVISION: Must check requestId and expectedRevision.
- NO CHEATING: Authentic logic, no hardcoded values or facades.

## Current Parent
- Conversation ID: 2cf3c4d2-1537-4198-aafe-2687785ec9ab
- Updated: 2026-11-06T06:00:00Z

## Task Summary
- **What to build**: Truck CRUD, bootstrap, records, photo upload/retrieval (sharp WebP <= 250KB), backup API and comprehensive unit tests.
- **Success criteria**: All tests pass (`npx tsx --test tests/truck-routes.test.ts`), `npm run typecheck` passes with zero errors.

## Change Tracker
- **Files modified**: None yet.
- **Build status**: Pending.
- **Pending issues**: None.

## Quality Status
- **Build/test result**: Not run yet.
- **Lint status**: Clean.
- **Tests added/modified**: `tests/truck-routes.test.ts` pending.

## Loaded Skills
- **Source**: ponytail
  - **Core methodology**: smallest complete change, no extra fluff, clean error handling.

## Artifact Index
- `.agents/teamwork/teamwork_worker_w2_t4/DISPATCH.md` — Assigned instructions
- `.agents/teamwork/teamwork_worker_w2_t4/BRIEFING.md` — Persistent awareness
- `.agents/teamwork/teamwork_worker_w2_t4/progress.md` — Heartbeat and status
- `.agents/teamwork/teamwork_worker_w2_t4/handoff.md` — Final handoff report
