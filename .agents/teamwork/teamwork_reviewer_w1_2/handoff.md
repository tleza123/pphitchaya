# Handoff & Quality Review Report: LINE Messaging API Client, Flex Templates & Daily Summary (Wave 1, Task 2)

**Instance**: `teamwork_reviewer_w1_2`  
**Date**: 2026-11-06T05:38:00Z  
**Verdict**: **APPROVE**  
**Type**: Hard Handoff  

---

## 1. Observation

1. **Native `fetch` Implementation (`src/lib/line/client.ts`)**:
   - Zero third-party dependencies used. Standard Node 20 global `fetch` targets:
     - `https://api.line.me/v2/bot/message/push` (when `targetId` is specified)
     - `https://api.line.me/v2/bot/message/broadcast` (when `targetId` is omitted)
     - `https://api.line.me/v2/bot/message/reply` (for webhook replies)
   - Verified no `@line/bot-sdk` or axios packages added to `package.json`.

2. **Configuration Hierarchy & Error Handling**:
   - `resolveLineConfig(shopId)` lines 36–70: Reads Firestore document `shops/{shopId}/profile/line` first, falling back to environment variables (`LINE_CHANNEL_ACCESS_TOKEN`, `LINE_DEFAULT_TARGET_ID`, `LINE_ATTENDANCE_TARGET_ID`, `LINE_TRUCK_TARGET_ID`, `LINE_DAILY_SUMMARY_ENABLED`).
   - `resolveTargetId(config, scope)` lines 77–88: Resolves domain-specific target ID (`attendanceTargetId` / `truckTargetId`), falling back to `defaultTargetId`, then `undefined` (broadcast).
   - If `channelAccessToken` is missing or empty, `sendLinePush` and `/api/line/notify` throw/return HTTP 422 with code `LINE_NOT_CONFIGURED` and Thai message: `"ยังไม่ได้ตั้งค่า LINE Channel Access Token กรุณาตั้งค่าในแท็บตั้งค่า"`.

3. **Flex Message Templates (`src/lib/line/flex-templates.ts`)**:
   - **Box 1: Attendance Daily Summary** (`buildAttendanceDailyFlex`):
     - Header background: Navy `#003566` with gold `#FFC300` eyebrow and white `#FFFFFF` title.
     - Staff breakdown cards: มาเต็มวัน (Green `#2E7D32`), ครึ่งวัน (Amber `#D97706`), ไม่มา/ลา (Red `#C62828`).
     - Holiday status card (`#FEF3C7` / `#92400E`).
     - Special notes list (advances, deductions).
     - Satang financial sums formatted in Baht via `formatMoney(satang)`: daily wages, daily advances, and monthly net payroll.
   - **Box 2: Truck Daily Summary** (`buildTruckDailyFlex`):
     - Header background: Deep Slate-Navy `#0F2942` with Signal Amber `#D97706` eyebrow and white `#FFFFFF` title.
     - Truck & trip metrics cards: Active trucks count, total trips count.
     - Per-truck summary list: Plate number, driver name, trip count, route summary (`.slice(0, 3)`), driver pay formatted in Baht, and fuel cost formatted in Baht.
     - Month cumulative totals strip: month trips, month driver pay, and month fuel cost.
   - Compliant LINE Flex Bubble schema (`type: 'bubble'`, `size: 'mega'`, explicit `layout` on all container boxes).

4. **API Route Handlers**:
   - `GET /api/line/settings`: Enforces `verifyOwner(req)`, masks token with `••••` + last 4 characters (`maskToken`).
   - `PATCH /api/line/settings`: Enforces `verifyOwner(req)`, requires `requestId` and `expectedRevision` (HTTP 422 on missing), validates idempotency receipt (`checkRequestReceipt`), executes strict Read-Before-Write inside `db.runTransaction` (all `tx.get` precede `tx.set`), checks revision conflict (HTTP 409 CONFLICT), records audit (`recordAudit`), and saves request receipt (`recordRequestReceipt`). Guards against overwriting token when frontend submits masked value starting with `••••`.
   - `POST /api/line/notify`: Enforces `verifyOwner(req)`, supports `isTest` connection testing, handles `scope` (`'attendance'`, `'truck'`, or `'both'`), returns HTTP 422 `LINE_NOT_CONFIGURED` when unconfigured, returns HTTP 502 `LINE_SEND_FAILED` on LINE API failure, and dispatches Flex cards with resolved target IDs.
   - `POST /api/line/webhook`: Handles LINE incoming webhook events. On text message `/id` or `id`, extracts `groupId`, `roomId`, or `userId` from `event.source` and replies using `sendLineReply` so users can easily obtain their Target ID. Always returns HTTP 200 `{ ok: true }` to satisfy LINE platform requirements and prevent webhook retry loops.
   - `GET /api/cron/daily-summary`: Enforces `CRON_SECRET` authorization (`Bearer <secret>`) when configured in environment. Gracefully skips without error if LINE is unconfigured (`LINE_NOT_CONFIGURED`) or if `dailySummaryEnabled === false`. Dispatches both attendance and truck summaries for `getBangkokToday()`.

5. **Deployment & Environment Configuration**:
   - `vercel.json`: Added cron config `{"path": "/api/cron/daily-summary", "schedule": "0 12 * * *"}`. 12:00 UTC corresponds exactly to 19:00:00 Asia/Bangkok time (UTC+7).
   - `.env.example`: Documented all 6 environment variables (`LINE_CHANNEL_ACCESS_TOKEN`, `LINE_DEFAULT_TARGET_ID`, `LINE_ATTENDANCE_TARGET_ID`, `LINE_TRUCK_TARGET_ID`, `LINE_DAILY_SUMMARY_ENABLED`, `CRON_SECRET`).

6. **Integrity Check**:
   - Verified no hardcoded outputs or facades. All functions parse, format, and push live JSON structures.
   - Test suite `tests/line-summary.test.ts` asserts genuine invariants, checks URL targets, HTTP methods, headers, payloads, and Read-Before-Write transactional sequencing.

7. **Automated Verification Results**:
   - `npx.cmd tsx --test tests/line-summary.test.ts`: 8 passed, 0 failed (duration 499ms).
   - `npm.cmd test`: 63 passed across all 15 test files, 0 failed (duration 1.69s).
   - `npm.cmd run typecheck`: Exited with code 0, 0 errors.
   - `npm.cmd run build`: Compiled successfully in 9.0s, generated all 4 dynamic API routes (`/api/cron/daily-summary`, `/api/line/notify`, `/api/line/settings`, `/api/line/webhook`).

---

## 2. Logic Chain

1. **Zero-Dependency Native Architecture**:
   - Next.js serverless functions on Vercel run on Node 20 with native global `fetch`. Using native `fetch` keeps cold-start latency low and avoids external SDK maintenance debt.
2. **Dual-Tier Configuration Resilience**:
   - Storing configuration in Firestore `shops/{shopId}/profile/line` allows shop owners to set and rotate tokens dynamically through the settings UI without redeploying code.
   - Falling back to environment variables guarantees zero-configuration testability and CI compatibility.
3. **Graceful Degeneration & Actionable Diagnostics**:
   - Missing tokens return HTTP 422 with explicit code `LINE_NOT_CONFIGURED` and Thai guidance pointing to the Settings page, preventing cryptic 500 errors.
   - The cron endpoint returns 200 with `{ skipped: true, reason: 'LINE_NOT_CONFIGURED' }`, preventing Vercel cron alerting spam when the feature has not yet been provisioned.
4. **Idempotency and Concurrency Safety**:
   - `PATCH /api/line/settings` follows the project's strict Read-Before-Write transactional pattern: checking request receipts and current revision before staging any writes, eliminating race conditions when multiple tabs or admins edit settings simultaneously.
5. **Brand Palette & Quiet Operational Standards**:
   - Flex Message cards strictly reflect the project's color palette: Navy `#003566` for Attendance and Deep Slate-Navy `#0F2942` + Signal Amber `#D97706` for Truck. All financial values are calculated from integer satang and formatted through `formatMoney`.

---

## 3. Caveats & Adversarial Analysis

- **Webhook Signature Verification**:
  `POST /api/line/webhook` does not validate `x-line-signature` HMAC-SHA256. As noted in Worker 2's caveats, this is suitable for development/test environments where `LINE_CHANNEL_SECRET` is not yet provisioned. The endpoint only performs an ephemeral read-and-reply for the text `/id` and makes no database mutations. In future production hardening when additional webhook actions are introduced, `x-line-signature` validation should be added.
- **Flex Message 30 KB Payload Boundary**:
  LINE Messaging API enforces a 30 KB limit on Flex message JSON. For fleets with >20 trucks or >50 special staff notes, the JSON could approach this boundary. The current implementation caps route strings with `.slice(0, 3)` which keeps the size well under 5 KB for normal operations (~5–10 trucks).
- **Masked Token Protection**:
  In `PATCH /api/line/settings`, if the client submits the masked string (`••••5678`), the handler explicitly skips updating `channelAccessToken`, preventing accidental corruption of stored credentials.

---

## 4. Conclusion

The implementation of Wave 1, Task 2 by Worker 2 fully satisfies all specifications in `PROJECT.md`, `ORIGINAL_REQUEST.md`, and `implementation_plan.md`:
- Native `fetch` without third-party LINE SDK.
- Correct config resolution order (Firestore > Environment variables).
- HTTP 422 `LINE_NOT_CONFIGURED` with localized Thai message.
- Box 1 (Attendance `#003566`) and Box 2 (Truck `#0F2942` + `#D97706`) Flex templates.
- Complete API route handlers with Read-Before-Write transactional integrity.
- Vercel cron scheduled at 12:00 UTC (19:00 Bangkok).
- 100% test pass rate (8 line-summary tests, 63 project-wide tests), typecheck pass, and successful production build.
- No integrity violations found.

**Final Verdict**: **APPROVE**

---

## 5. Verification Method

To independently reproduce and verify this review:

1. **Run LINE Summary Test Suite**:
   ```powershell
   npx.cmd tsx --test tests/line-summary.test.ts
   ```
   *Expected*: 8 tests pass, 0 fail.

2. **Run Full Project Test Suite**:
   ```powershell
   npm.cmd test
   ```
   *Expected*: 63 tests pass across 15 test files.

3. **Run TypeScript Diagnostics**:
   ```powershell
   npm.cmd run typecheck
   ```
   *Expected*: 0 errors.

4. **Run Production Build Verification**:
   ```powershell
   npm.cmd run build
   ```
   *Expected*: Build succeeds; Next.js emits `/api/cron/daily-summary`, `/api/line/notify`, `/api/line/settings`, `/api/line/webhook`.
