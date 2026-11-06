## 2026-11-06T05:22:22Z
You are teamwork_worker (Wave 1, Task 2).
Your working directory is: c:\Users\tleza\Documents\GitHub\pphitchaya\.agents\teamwork\teamwork_worker_w1_t2\
Original user request path: c:\Users\tleza\Documents\GitHub\pphitchaya\.agents\teamwork\ORIGINAL_REQUEST.md
Scope document: c:\Users\tleza\Documents\GitHub\pphitchaya\.agents\teamwork\PROJECT.md
Implementation plan: C:\Users\tleza\.gemini\antigravity\brain\efc1fb76-b98e-49a1-a1f9-a19ca35cf399\implementation_plan.md
Survey reports:
- c:\Users\tleza\Documents\GitHub\pphitchaya\.agents\teamwork\teamwork_explorer_survey_3\handoff.md

EXCLUSIVE WRITE OWNERSHIP (You may only write to these files):
- `vercel.json`
- `.env.example`
- `src/lib/line/client.ts`
- `src/lib/line/flex-templates.ts`
- `src/lib/line/daily-summary.ts`
- `src/app/api/line/settings/route.ts`
- `src/app/api/line/notify/route.ts`
- `src/app/api/line/webhook/route.ts`
- `src/app/api/cron/daily-summary/route.ts`
- `tests/line-summary.test.ts`

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Task Scope (Task 2):
1. Create `tests/line-summary.test.ts` testing:
   - `resolveLineConfig(shopId)`: Firestore `shops/{shopId}/profile/line` > environment variables fallback.
   - `buildAttendanceDailyFlex`: Flex message bubble card with Navy `#003566`, Thai date, staff counts, satang financial numbers formatted in Baht.
   - `buildTruckDailyFlex`: Flex message bubble card with Slate-Navy `#0F2942` + Signal Amber `#D97706`, truck and trip stats, fuel, monthly totals.
   - `sendLinePush`: Native fetch call to `https://api.line.me/v2/bot/message/push` (when targetId present) or `broadcast` (when targetId omitted), mocking `globalThis.fetch`.
   - Error handling: Missing token returns HTTP 422 with code `LINE_NOT_CONFIGURED` and Thai guidance message.
   - Route handlers: `GET` and `PATCH` `/api/line/settings`, `POST` `/api/line/notify`, `POST` `/api/line/webhook` (replies to `id` or `/id` with user/group ID), and `GET` `/api/cron/daily-summary`.
2. Implement `src/lib/line/client.ts`, `src/lib/line/flex-templates.ts`, `src/lib/line/daily-summary.ts`.
3. Implement `src/app/api/line/settings/route.ts`, `src/app/api/line/notify/route.ts`, `src/app/api/line/webhook/route.ts`, `src/app/api/cron/daily-summary/route.ts`.
4. Update `vercel.json` with cron schedule `{"path": "/api/cron/daily-summary", "schedule": "0 12 * * *"}`.
5. Update `.env.example` with LINE configuration environment variable templates.
6. Execute verification: run `npx.cmd tsx --test tests/line-summary.test.ts` and `npm.cmd run typecheck`. Confirm all pass.
7. Write `handoff.md` in your working directory and message the orchestrator.
