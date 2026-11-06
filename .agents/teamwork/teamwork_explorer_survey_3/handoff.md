# Handoff Report: LINE Messaging API Integration & Test Baseline Survey

**Instance**: `teamwork_explorer_survey_3`  
**Date**: 2026-11-06T05:20:00Z  
**Target Repository**: `c:\Users\tleza\Documents\GitHub\pphitchaya`  
**Status**: Task Complete (Hard Handoff)

---

## 1. Observation

### 1.1 Existing Test Baseline & Environment
- **Command & Output**: Running `npm.cmd test` (invoking `tsx --test tests/**/*.test.ts`) executed 50 test cases across 13 test files with 0 failures:
  ```text
  > employee-attendance@1.0.0 test
  > tsx --test tests/**/*.test.ts
  ...
  ℹ tests 50
  ℹ suites 0
  ℹ pass 50
  ℹ fail 0
  ℹ cancelled 0
  ℹ skipped 0
  ℹ todo 0
  ℹ duration_ms 1909.9919
  ```
- **Typecheck**: `npm.cmd run typecheck` (`tsc --noEmit`) completed with exit code 0.
- **PowerShell Execution Policy Note**: Running plain `npm test` failed in Windows PowerShell with `PSSecurityException` because script execution for `npm.ps1` is restricted; running `npm.cmd test` or `npx.cmd tsx --test ...` executes properly.
- **Test Framework**: Native Node.js test runner (`import { test } from 'node:test';` and `import assert from 'node:assert/strict';`) executed via `tsx` (v4.19.2) without external dependencies like Jest, Mocha, or Vitest (`package.json:11,33`).
- **Firestore Mocking Architecture**:
  - `src/lib/firebase/admin.ts:11,93-106`: Firestore instance resolution checks `const globalFirebase = globalThis as unknown as GlobalFirebaseAdmin; if (globalFirebase.adminDb) return globalFirebase.adminDb;`.
  - `tests/attendance-route.test.ts:7-47`: Tests mock Firestore by setting `(globalThis as any).adminDb = { collection: (name: string) => ref(name), runTransaction: async (...) => { ... } }`.
  - **Strict Read-Before-Write Assertion**: `tests/attendance-route.test.ts:35`: `assert.equal(staged.length, 0, 'All transaction reads must precede writes')` guarantees transaction integrity.
  - Safe restoration: Each test cleans up in `finally { globals.adminDb = previousDb; }`.
- **Existing Test Inventory (15 files in `tests/`)**:
  1. `tests/analytics-route.test.ts`: Route handler testing `GET /api/reports/analytics` reading closed month snapshots.
  2. `tests/analytics.test.ts`: Payroll analytics computations for day/month/year periods.
  3. `tests/api.test.ts`: Checksum hashing, snapshot verification, and Satang bounds validation.
  4. `tests/attendance-route.test.ts`: Route handler testing `POST /api/attendance` with transaction staging, revision incrementing, idempotency check, and holiday gating.
  5. `tests/client-navigation.test.ts`: Navigation history state protection, form money parsing, and `MutationIntent` idempotency key tests.
  6. `tests/employee-suspend.test.ts`: Employee suspension/resume API and payroll exclusion.
  7. `tests/extra-sync.test.ts`: Read-before-write transaction verification and template propagation.
  8. `tests/finance-gate.test.ts`: Month closing and lock protections.
  9. `tests/mutation-response.test.ts`: Safe mutation response wrappers.
  10. `tests/payroll.test.ts`: Core payroll engine, daily wage satang, partial day calculations.
  11. `tests/report-integrity.test.ts`: Closure snapshot verification.
  12. `tests/salary-export.test.ts`: PDF generation (`createSalaryPdf`), `%PDF` validation, and zip bundling.
  13. `tests/shop-name.test.ts`: Shop name masking and default fallbacks.
  14. `tests/support/mobile-audit-server.ts`: In-memory HTTP mock server on port 3012 for browser audits.

### 1.2 LINE Messaging API Architecture & Requirements
- **Zero External LINE Libraries**: `package.json` contains no `@line/bot-sdk`. Communication must use native Node 20 `fetch`.
- **Endpoints & Methods**:
  - Push message: `POST https://api.line.me/v2/bot/message/push`
    - Headers: `Authorization: Bearer ${channelAccessToken}`, `Content-Type: application/json`
    - Body: `{ to: targetId, messages: [flexMessage] }`
  - Broadcast message: `POST https://api.line.me/v2/bot/message/broadcast`
    - Headers: `Authorization: Bearer ${channelAccessToken}`, `Content-Type: application/json`
    - Body: `{ messages: [flexMessage] }`
  - Reply message: `POST https://api.line.me/v2/bot/message/reply`
    - Headers: `Authorization: Bearer ${channelAccessToken}`, `Content-Type: application/json`
    - Body: `{ replyToken: event.replyToken, messages: [textMessage] }`
- **Configuration Hierarchy (`resolveLineConfig(shopId)`)**:
  1. Primary: Firestore document `shops/{shopId}/profile/line` (`channelAccessToken`, `defaultTargetId`, `attendanceTargetId`, `truckTargetId`, `dailySummaryEnabled`, `dailySummaryHour`, `revision`).
  2. Fallback: Environment variables (`LINE_CHANNEL_ACCESS_TOKEN`, `LINE_DEFAULT_TARGET_ID`, `LINE_ATTENDANCE_TARGET_ID`, `LINE_TRUCK_TARGET_ID`).
  3. Target ID routing:
     - Attendance scope: `attendanceTargetId || defaultTargetId` (if missing -> broadcast).
     - Truck scope: `truckTargetId || defaultTargetId` (if missing -> broadcast).
  4. Missing token error: If `channelAccessToken` is not found, return HTTP `422` with code `'LINE_NOT_CONFIGURED'` and Thai message `'ยังไม่ได้ตั้งค่า LINE Channel Access Token กรุณาตั้งค่าในแท็บตั้งค่า'`.
- **Flex Message Template Specifications**:
  - Container: `{ type: 'flex', altText: string, contents: { type: 'bubble', size: 'mega', ... } }`.
  - **Box 1 (Attendance Daily Summary)**:
    - Theme: Dark Blue `#003566` header background, `#FFFFFF` text.
    - Header: Shop name (`displayShopName`) + Thai Date via `formatThaiDate(dateKey)`.
    - Body Status Summary: Full day count (Green `#2E7D32`), Half day count (Amber `#D97706`), Absent count (Red `#C62828`), or Shop Holiday notice.
    - Special list: Employees with half-day, absent, advance withdrawal (`advanceSatang`), deduction (`deductionSatang`).
    - Financial Ledger: Total daily wages (`formatMoney(wagesSatang)`), advance total today, and cumulative net payroll of the current month.
    - Alt text: `สรุปการเช็คชื่อพนักงานประจำวัน ${thaiDate}`.
  - **Box 2 (Truck Daily Summary)**:
    - Theme: Slate-Navy `#0F2942` header background, Signal Amber `#D97706` accent badge/strip, `#FFFFFF` text.
    - Header: "สรุปงานรถสิบล้อประจำวัน" + Thai Date via `formatThaiDate(dateKey)`.
    - Body Overview: Active trucks count, total trips count, total driver pay (`formatMoney(totalDriverPaySatang)`), total fuel cost (`formatMoney(totalFuelCostSatang)`).
    - Truck Breakdown: Per truck card section: plate number snapshot, driver name, trip count with abbreviated route summaries (Origin -> Destination), total driver pay, fuel cost.
    - Monthly Cumulative: Month-to-date total trips, total driver pay, total fuel cost.
    - Alt text: `สรุปงานรถสิบล้อประจำวัน ${thaiDate}`.
- **Route Handlers to be Created**:
  1. `src/app/api/line/settings/route.ts`:
     - `GET`: Returns `{ profile: { channelAccessTokenMasked: '••••' + last4, defaultTargetId, attendanceTargetId, truckTargetId, dailySummaryEnabled, dailySummaryHour, revision } }`.
     - `PATCH`: Validates `requestId`, `expectedRevision`, saves to `shops/{shopId}/profile/line` with audit record and receipt.
  2. `src/app/api/line/notify/route.ts`:
     - `POST`: `{ scope: 'attendance' | 'truck' | 'both', dateKey?: string, isTest?: boolean }`.
     - Verifies owner, resolves config, returns `422 LINE_NOT_CONFIGURED` if no token, otherwise builds and sends Flex cards.
  3. `src/app/api/line/webhook/route.ts`:
     - `POST`: Parses webhook event array. When text matches `/^(?:\/)?id$/i`, extracts `event.source.groupId || event.source.roomId || event.source.userId` and calls LINE reply API to return the target ID to the user.
  4. `src/app/api/cron/daily-summary/route.ts`:
     - `GET`: Validates `CRON_SECRET` header if configured. Checks if `dailySummaryEnabled` is true, fetches today's data (`getBangkokToday()`) for both systems, and pushes both Flex messages.
  5. `vercel.json`:
     - Must add `"crons": [{ "path": "/api/cron/daily-summary", "schedule": "0 12 * * *" }]` (12:00 UTC = 19:00 Bangkok).

---

## 2. Logic Chain

1. **Test Runner Alignment**:
   - Observation: `package.json` specifies `"test": "tsx --test tests/**/*.test.ts"`, which directly uses Node's native test runner without any Babel/Jest transpilation step.
   - Deduction: Any new test files must use `import { test } from 'node:test'` and `import assert from 'node:assert/strict'`. No `jest.mock()` or `beforeEach` globals are available or needed.

2. **Mocking Strategy for Firestore**:
   - Observation: `src/lib/firebase/admin.ts:11,94` assigns `globalFirebase.adminDb = db` and checks `globalFirebase.adminDb` before creating an app.
   - Deduction: Setting `(globalThis as any).adminDb = mockDb` before running tests and restoring in `finally` completely isolates all route handlers and services from actual Google Cloud credentials, making unit and route tests 100% hermetic and fast (current 50 tests take < 2 seconds).

3. **Mocking Strategy for LINE Messaging API**:
   - Observation: LINE communication uses native `fetch` with no external SDK.
   - Deduction: In `tests/line-summary.test.ts`, mocking `globalThis.fetch = async (url, options) => { ... }` will intercept all LINE API requests to inspect the destination URL (`/v2/bot/message/push` vs `/v2/bot/message/broadcast`), authorization headers, and flex message structures without hitting real LINE servers or requiring live tokens.

4. **Error Handling Alignment**:
   - Observation: `src/lib/server/errors.ts:57` exports `createErrorResponse(code, customMessage, statusCode)`.
   - Deduction: Missing LINE credentials must return `createErrorResponse('LINE_NOT_CONFIGURED', 'ยังไม่ได้ตั้งค่า LINE Channel Access Token กรุณาตั้งค่าในแท็บตั้งค่า', 422)` to match UI expectations and the 5 critical review focus items in `implementation_plan.md`.

5. **Satang Integrity in Truck Engine**:
   - Observation: `src/lib/payroll/money.ts` validates `validateSatang()` with integer bounds `0` to `100,000,000` Satang.
   - Deduction: `calculateTruckRecordTotals` must iterate through all trip items and sum `driverPaySatang` as integer values, and enforce `validateSatang(fuelCostSatang)`. Any decimal or negative input must throw `INVALID_MONEY`.

---

## 3. Caveats

1. **Windows PowerShell Execution Policy**:
   Running plain `npm test` directly in Windows PowerShell may fail with `PSSecurityException`. All subagents and developers must use `npm.cmd test` or `npx.cmd tsx --test <path>` when running in PowerShell.
2. **LINE Flex Message JSON Strictness**:
   LINE Messaging API rejects Flex Message containers if types, spacing, layouts, or required child containers (e.g. `layout: 'vertical'`) are invalid. The Flex template builder must strictly conform to LINE Flex Bubble schema.
3. **Cron Secret Security**:
   In production Vercel, cron calls include `Authorization: Bearer <CRON_SECRET>`. In development/testing, if `CRON_SECRET` is unset, the cron route should allow execution or allow a bypass for testing.
4. **Read-Before-Write in Transactions**:
   All new routes touching Firestore transactions (`/api/truck/records`, `/api/truck/settings`, `/api/line/settings`) must execute all reads (`tx.get`) before any writes (`tx.set`, `tx.update`, `tx.delete`). Failure to do so will trip the transaction guard in unit tests and fail Firestore Admin in production.

---

## 4. Conclusion & Test Suite Architectural Blueprints

### Blueprint 1: `tests/line-summary.test.ts`
- **Purpose**: Validate LINE configuration resolution, Flex Bubble JSON template generation, API network calls, Webhook ID responder, and Route Handlers.
- **Key Test Cases**:
  1. `resolveLineConfig`:
     - Reads `shops/main/profile/line` when present.
     - Falls back to `process.env.LINE_CHANNEL_ACCESS_TOKEN` when doc does not exist.
     - Resolves `attendanceTargetId || defaultTargetId` for attendance.
     - Resolves `truckTargetId || defaultTargetId` for truck.
     - Yields empty target (broadcast) when neither is set.
     - Detects missing token and flags `LINE_NOT_CONFIGURED`.
  2. `buildAttendanceDailyFlex`:
     - Verifies `type === 'flex'`, `altText` contains date and shop name.
     - Verifies `contents.header.backgroundColor === '#003566'`.
     - Verifies counts for full/half/absent workers and formatted satang money strings.
     - Verifies holiday badge display when holiday occurs.
  3. `buildTruckDailyFlex`:
     - Verifies `type === 'flex'`, `altText` contains date.
     - Verifies `contents.header.backgroundColor === '#0F2942'`.
     - Verifies accent color `#D97706`.
     - Verifies active trucks count, trip counts, fuel cost satang formatted to Thai Baht.
     - Verifies breakdown rows for each active truck.
  4. Network dispatch (`sendLineMessage`):
     - Uses `globalThis.fetch` mock to verify:
       - Push call: `POST https://api.line.me/v2/bot/message/push` with `{ to: 'target_123', messages: [...] }`.
       - Broadcast call: `POST https://api.line.me/v2/bot/message/broadcast` with `{ messages: [...] }`.
       - Header: `Authorization: Bearer test_token`.
     - Throws/returns structured error on LINE 400/401 API responses.
  5. Webhook route (`POST /api/line/webhook`):
     - Sends text `'id'` from group `C1234567890` -> verifies call to `POST https://api.line.me/v2/bot/message/reply` containing `C1234567890`.
     - Sends text `'/id'` from user `U1234567890` -> verifies call to reply endpoint containing `U1234567890`.
     - Ignores other non-id messages gracefully with HTTP 200 `{ ok: true }`.
  6. Routes (`/api/line/settings`, `/api/line/notify`, `/api/cron/daily-summary`):
     - `POST /api/line/notify` returns `422 LINE_NOT_CONFIGURED` when token is absent.
     - `POST /api/line/notify` returns `200` when token is present and messages are dispatched.
     - `GET /api/line/settings` returns masked token (`••••1234`).
     - `GET /api/cron/daily-summary` rejects invalid `CRON_SECRET` and succeeds with valid header.

### Blueprint 2: `tests/truck-engine.test.ts`
- **Purpose**: Validate pure domain calculation logic for the Truck system (no DB dependencies).
- **Key Test Cases**:
  1. `calculateTruckRecordTotals`:
     - Accurately sums 1, 2, 5 trips with varying `driverPaySatang`.
     - Validates fractional satang conversion (e.g. `650.50` -> `65050` satang).
     - Strictly rejects floats, negative satang, NaN, and satang overflow (> `100,000,000`).
     - Reconciles total fuel satang.
  2. `buildTruckMonthlyReport`:
     - Aggregates daily records across multiple trucks in a given month.
     - Generates per-truck rows: total trips, total driver pay, total fuel.
     - Reconciles global totals: `sum(perTruck.driverPay) === totals.driverPay` with zero float drift.
     - Sorts daily records descending by `dateKey`.
  3. `buildTruckAnalytics`:
     - Aggregates by day, month, and year.
     - Verifies correct buckets for SVG chart rendering.
  4. `createTruckReportPdf`:
     - Creates PDF buffer using Sarabun fonts.
     - Verifies `%PDF` magic bytes.
     - Verifies single-truck and multi-truck page layouts.

### Blueprint 3: `tests/truck-routes.test.ts`
- **Purpose**: Validate Truck App CRUD, daily record transaction lifecycle, and WebP photo upload.
- **Key Test Cases**:
  1. Master Data CRUD (`/api/truck/settings`):
     - Add, edit, delete trucks (with status `ACTIVE` / `SUSPENDED`).
     - Add, edit, delete origins and destinations (with satang driver pay).
     - Enforces `expectedRevision` conflict checking (HTTP 409).
  2. Daily Record Creation & Updating (`POST /api/truck/records`):
     - New record `{dateKey}_{truckId}`: writes record, audit log, and idempotency receipt.
     - Replay with same `requestId`: returns cached receipt with 0 additional writes.
     - Edit existing record (Auto-load scenario): updates existing document, increments revision.
     - Strict Read-Before-Write verification in transaction mock.
     - Conflict rejection (HTTP 409) when `expectedRevision` does not match.
  3. WebP Photo API (`/api/truck/photos`):
     - `POST /api/truck/photos`: accepts binary/base64, validates with `sharp`, returns photo metadata.
     - `GET /api/truck/photos/[id]`: returns image with `image/webp` header.

### Blueprint 4: `tests/truck-reports-route.test.ts`
- **Purpose**: Validate truck reporting queries, analytics, CSV, and PDF export routes.
- **Key Test Cases**:
  1. `GET /api/truck/reports?month=YYYY-MM`:
     - Validates month format.
     - Queries `truckMonths/{monthKey}/records` and returns structured summary.
  2. `GET /api/truck/reports/analytics?period=day|month|year`:
     - Validates period parameter.
     - Returns bucketed metrics with bounded month queries.
  3. `GET /api/truck/reports/export?month=YYYY-MM&format=csv`:
     - Returns `text/csv; charset=utf-8`.
     - Validates UTF-8 BOM (`\uFEFF`) at buffer offset 0.
     - Verifies header and row data with correct Thai column names and satang-to-baht formatting.
  4. `GET /api/truck/reports/export?month=YYYY-MM&format=pdf`:
     - Returns `application/pdf`.
     - Validates `%PDF` header and font inclusion.

---

## 5. Verification Method

To independently verify the test baseline and survey findings:

1. **Run Current Test Suite**:
   ```powershell
   npm.cmd test
   ```
   *Expected output*: 50 passed tests across 13 test files in < 2.5 seconds.

2. **Verify Type Checking**:
   ```powershell
   npm.cmd run typecheck
   ```
   *Expected output*: Zero TypeScript diagnostic errors.

3. **Verify Execution of Individual Test**:
   ```powershell
   npx.cmd tsx --test tests/attendance-route.test.ts
   ```
   *Expected output*: Attendance route tests pass cleanly.

4. **Verify Implementation Plan & Route Layout Compliance**:
   Inspect `implementation_plan.md` sections 4 and 6 to confirm file paths for:
   - `src/lib/line/client.ts`
   - `src/lib/line/flex-templates.ts`
   - `src/lib/line/daily-summary.ts`
   - `src/app/api/line/settings/route.ts`
   - `src/app/api/line/notify/route.ts`
   - `src/app/api/line/webhook/route.ts`
   - `src/app/api/cron/daily-summary/route.ts`
   - `tests/line-summary.test.ts`
   - `tests/truck-engine.test.ts`
   - `tests/truck-routes.test.ts`
   - `tests/truck-reports-route.test.ts`
