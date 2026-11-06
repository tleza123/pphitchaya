# Authoritative Codebase Survey Report

**Explorer**: `teamwork_explorer` (Survey Instance 1)  
**Date**: 2026-11-06  
**Target Project**: `pphitchaya` (`c:\Users\tleza\Documents\GitHub\pphitchaya`)  
**Scope**: Existing Architecture & Repository Pattern, Money Engine, Shell/Tokens, Settings & Emojis, Dependencies & Configuration, and Test Suite Mocking Patterns.

---

## 1. Observation

### 1.1 Existing Architecture & Repository Pattern
- **File**: `src/lib/server/repository.ts` (lines 1-112)
  - Uses `import 'server-only'`.
  - Partitioning root: `getShopId(): string` defaults to `process.env.SHOP_ID || 'main'` (lines 5-7).
  - All Firestore references are strictly hierarchical under `shops/{shopId}`:
    - Root document: `getShopDocRef(shopId)` -> `db.collection('shops').doc(shopId)` (line 11).
    - Shop profile: `getProfileRef(shopId)` -> `shops/{shopId}/profile/main` (line 15).
    - Finance control: `getFinanceControlRef(shopId)` -> `shops/{shopId}/control/finance` (line 19).
    - Employees collection: `getEmployeesCol(shopId)` -> `shops/{shopId}/employees` (line 23).
    - Employee subcollections: `rates` and `extraTemplates` under `shops/{shopId}/employees/{employeeId}/...` (lines 35, 39).
    - Months collection: `getMonthsCol(shopId)` -> `shops/{shopId}/months` (line 51) and month doc `shops/{shopId}/months/{monthKey}` (line 55).
    - Month subcollections: `attendance`, `extras`, `extraReviews`, `closures` (lines 59, 63, 67, 71).
    - Top-level shop subcollections: `calendarVersions`, `calendarOverrides`, `closeJobs`, `requests` (idempotency receipts), `audit` (audit logs), and `employeePhotos` (lines 31, 43, 47, 75, 79, 83).
  - `recordAudit()` (lines 89-111): Writes inside an active `admin.firestore.Transaction` to `shops/{shopId}/audit/{autoId}` with `{ actorUid, action, entityKey, before, after, reason, requestId, createdAt }`.
- **File**: `src/lib/firebase/admin.ts` (lines 4-12, 93-106)
  - `getAdminFirestore()` checks `(globalThis as any).adminDb` first:
    ```typescript
    export function getAdminFirestore(): admin.firestore.Firestore {
      if (globalFirebase.adminDb) return globalFirebase.adminDb;
      const db = getAdminApp().firestore();
      ...
    }
    ```
  - This design enables automated unit/integration tests to inject an in-memory mock Firestore without any external network dependency.

### 1.2 Money Engine & Precision Calculations
- **File**: `src/lib/payroll/money.ts` (lines 1-58)
  - All amounts in the system are strictly stored and computed as **integer satang** (1 THB = 100 satang).
  - `moneySatang(text: string): number` (lines 16-24):
    - Validates input format via regex: `/^(0|[1-9]\d{0,6})(\.\d{1,2})?$/`. Rejects negative numbers, commas, exponential notation, NaN, Infinity, and fractions beyond 2 decimals.
    - Limits amounts: `Number.isSafeInteger(amount) && amount >= 0 && amount <= 100000000` (max 1,000,000.00 THB).
    - Returns integer satang (`whole * 100 + decimal`).
  - `validateSatang(amount: number): number` (lines 29-35):
    - Asserts `Number.isSafeInteger(amount) && amount >= 0 && amount <= 100000000`.
  - `formatMoney(satang: number): string` (lines 41-49):
    - Converts satang integer to Thai formatted string with 2 decimal places and thousands separators (e.g. `1450000` -> `"14,500.00"`).
  - `satangToDecimalString(satang: number): string` (lines 55-57):
    - Converts satang to decimal string suitable for form inputs (e.g. `50000` -> `"500.00"`).

### 1.3 Design Tokens & Application Shell
- **File**: `src/styles/tokens.css` (lines 1-42)
  - Color palette:
    - Primary: `--team-primary: #003566`
    - Primary Dark: `--team-primary-dark: #001d3d`
    - Accent: `--team-accent: #ffc300`
    - Background: `--team-bg: #f3f6fa`
    - Surface: `--team-surface: #ffffff`
    - Text: `--team-text: #172b43`
    - Border: `--team-border: #d7e0ea`
  - Typography:
    - `--font-brand: 'Sarabun', 'Tahoma', sans-serif;`
    - Font sizes: `--team-copy: 1.2rem;`, `--team-name: 1.33rem;`, `--team-heading: 1.67rem;`, `--team-secondary: 1.067rem;`
  - Radii & Heights:
    - Card radius: `--team-radius-card: 1.067rem;`
    - Button radius: `--team-radius-button: 0.8rem;`
    - Touch targets: `--team-btn-height: 3.467rem;` (optimized for mobile touch).
- **Files**: `src/components/shell/AppHeader.tsx`, `BottomNav.tsx`, `AppShell.tsx`, `shell.module.css`
  - `AppHeader.tsx`: Sticky top header with shop name and desktop navigation (`display: none` on mobile, `display: flex` at `>= 768px`).
  - `BottomNav.tsx`: Fixed mobile navigation bar at screen bottom (`display: none` at `>= 768px`).
  - `AppShell.tsx`:
    - Manages state `activeTab` and `mountedTabs: Set<TabType>`.
    - Tab switching caches mounted views using `<div style={{ display: activeTab === '...' ? 'block' : 'none' }}>` to prevent DOM unmounting, scroll reset, and re-rendering latency.
    - Synchronizes browser history with `window.history.pushState` and handles `popstate`.
    - Dispatches custom `attendance-navigation` events.

### 1.4 Settings & Remaining Emojis Inspection
- **File**: `src/components/settings/SettingsTab.tsx` (lines 1378-1386)
  - An automated regex scan over all source files (`src/**/*.{ts,tsx,css,html}`) confirmed that **only two lines** in the entire codebase contain emojis:
    - Line 1380:
      ```tsx
      💡 <strong>ไม่ใช่การลาออกถาวร:</strong> ข้อมูลประวัติ ค่าแรง และเงินพิเศษทั้งหมดจะถูกคงไว้เหมือนเดิม แต่จะไม่แสดงชื่อในรายการเช็คชื่อประจำวัน และสามารถกดให้กลับมาทำงานต่อได้ตลอดเวลา
      ```
    - Line 1384:
      ```tsx
      ✅ <strong>กลับมาทำงานต่อ:</strong> พนักงานจะกลับมาแสดงชื่อในรายการเช็คชื่อประจำวันอีกครั้ง
      ```
  - Both lines reside inside the employee suspend/resume confirmation dialog (`showSuspendModal`).
  - Replacing `💡` and `✅` with pure text or Lucide icons will achieve 100% Zero-Emoji compliance across the entire frontend.
  - Tab organization:
    - View modes: `'list' | 'add' | 'edit'` via `useHistoryState`.
    - Bottom of the list features collapsible accordions (`collapsibleSection`) for "วันทำงานของร้าน" (`calendarOpen`) and "ชื่อร้าน" (`shopNameOpen`).

### 1.5 Existing Dependencies & Configuration
- **File**: `package.json` (lines 17-35)
  - Installed production dependencies:
    - `sharp`: `^0.33.5` (native image processing, supports WebP conversion)
    - `pdfkit`: `^0.20.2` (PDF generation)
    - `lucide-react`: `^0.475.0` (SVG icons)
    - `fflate`: `^0.8.3` (ZIP compression)
    - `firebase`: `^11.4.0`
    - `firebase-admin`: `^13.1.0`
    - `next`: `^15.2.0`
    - `react`: `^19.0.0`
    - `react-dom`: `^19.0.0`
  - Dev dependencies: `@types/node`, `@types/pdfkit`, `@types/react`, `@types/react-dom`, `tsx`, `typescript`.
  - **Zero new npm dependencies are needed**. All required tools (sharp, pdfkit, lucide-react, fetch for LINE API) are already installed.
- **File**: `next.config.mjs` (lines 5-6)
  - `serverExternalPackages: ['firebase-admin', 'sharp', 'pdfkit']` is already configured.
  - `outputFileTracingIncludes`:
    ```javascript
    outputFileTracingIncludes: { '/api/reports/export': ['./src/assets/fonts/*.ttf', './node_modules/pdfkit/js/data/**/*'] }
    ```
    *(Note: When adding `/api/truck/reports/export`, it should be added to `outputFileTracingIncludes` alongside `/api/reports/export`)*.
- **File**: `vercel.json` (lines 1-5)
  - Currently contains only `{ "$schema": "https://openapi.vercel.sh/vercel.json", "regions": ["sin1"] }`.
  - Requirement R4 requires Vercel Cron at 19:00 Bangkok (12:00 UTC):
    ```json
    "crons": [
      {
        "path": "/api/cron/daily-summary",
        "schedule": "0 12 * * *"
      }
    ]
    ```
- **File**: `tsconfig.json` (lines 21-24)
  - Path aliases: `"@/*": ["./src/*"]` and `"server-only": ["./src/lib/server-only-shim.ts"]`.

### 1.6 Existing Test Patterns & Mocking
- **Test Runner**: Node's native test runner (`node:test` and `node:assert/strict`) executed via `tsx` (command: `npm test` / `tsx --test tests/**/*.test.ts`).
- **Mock Pattern**: Inspected in `tests/attendance-route.test.ts` (lines 8-47):
  ```typescript
  const globals = globalThis as unknown as { adminDb?: unknown };
  const previousDb = globals.adminDb;
  const docs = new Map<string, any>([...]);
  globals.adminDb = {
    collection: (name: string) => ref(name),
    runTransaction: async (run: (tx: any) => Promise<unknown>) => {
      const staged: Array<[string, any]> = [];
      const read = (r: any) => {
        assert.equal(staged.length, 0, 'All transaction reads must precede writes');
        return snap(r.path);
      };
      const result = await run({
        get: async (r: any) => read(r),
        getAll: async (...refs: any[]) => refs.map(read),
        set: (r: any, value: any) => staged.push([r.path, value])
      });
      staged.forEach(([path, data]) => docs.set(path, data));
      return result;
    }
  };
  try {
    // Call Route Handler directly:
    const res = await POST(new NextRequest('http://localhost/api/...', { ... }));
    ...
  } finally {
    globals.adminDb = previousDb;
  }
  ```
  - Crucial rule enforced in transactions: **All reads must precede writes**.
  - Restoration in `finally` guarantees test isolation.

### 1.7 Photo Storage Pattern
- **File**: `src/app/api/employees/[id]/photo/route.ts` (lines 127-156)
  - Images are processed server-side with `sharp`: EXIF rotation, resize, metadata stripping.
  - Stored directly in Firestore under `shops/{shopId}/employeePhotos/{id}` as base64 string (`data: thumbBase64, contentType: 'image/jpeg'`), completely bypassing the need for Firebase Storage buckets in lightweight deployments.
  - The truck app photos will store WebP compressed data in Firestore `shops/{shopId}/truckPhotos/{photoId}` using this exact established pattern.

---

## 2. Logic Chain

1. **Firestore Repository Pattern**: Because all existing collections are partitioned under `shops/{shopId}/...`, adding the Truck App requires creating parallel subcollections under the same shop root:
   - `shops/{shopId}/trucks/{truckId}`
   - `shops/{shopId}/truckLocations/{locationId}`
   - `shops/{shopId}/truckJobs/{dateKey}_{truckId}`
   - `shops/{shopId}/truckPhotos/{photoId}`
   - `shops/{shopId}/control/lineConfig` (or within `shops/{shopId}/profile/main`)
   This preserves complete multi-tenant / single-tenant data isolation and ensures `recordAudit()` and idempotency checks (`getRequestsCol(shopId)`) continue to work seamlessly.

2. **Money Calculations**: The Truck App must calculate driver pay (`driverPaySatang`), fuel cost (`fuelCostSatang`), and freight revenue/customer charge (`chargeSatang`) strictly in integer satang. Reusing `moneySatang()`, `validateSatang()`, and `formatMoney()` from `src/lib/payroll/money.ts` guarantees zero rounding drift, exact Baht formatting, and strict validation.

3. **Quiet Operational UI (R3)**:
   - Attendance app header: `#003566` with accent `#FFC300`.
   - Truck app header: `#0F2942` with accent `#D97706`.
   - Shared Sarabun typography (`--font-brand`), large touch targets (`--team-btn-height: 3.467rem`), card radii (`--team-radius-card`), and zero emojis.
   - Removing `💡` (line 1380) and `✅` (line 1384) in `SettingsTab.tsx` finishes the zero-emoji requirement for the employee app.

4. **URL Separation (R1)**:
   - Employee routes: `/`, `/reports`, `/reports/detailed`, `/settings`
   - Truck routes: `/truck`, `/truck/reports`, `/truck/reports/detailed`, `/truck/settings`
   - Zero links between them on the UI. Separate shells (`AppShell` for attendance, `TruckAppShell` for truck app) prevent cross-navigation.

5. **LINE Messaging API (R4)**:
   - Target endpoint: `/api/cron/daily-summary` (triggered by Vercel Cron at 12:00 UTC / 19:00 Bangkok).
   - Manual trigger buttons on both attendance reports and truck reports.
   - External LINE API calls (`https://api.line.me/v2/bot/message/push`) use standard global `fetch` with Bearer channel access token and Flex Message payloads.
   - In automated tests, `globalThis.fetch` is intercepted and verified without making real HTTP network requests.

---

## 3. Caveats

- **Windows Execution Policy**: Running `npm test` directly in Windows PowerShell can encounter `PSSecurityException` for `npm.ps1`. Running via `npm.cmd test`, `npm.cmd run typecheck`, or `npm.cmd run build` works without restriction.
- **Font Tracing in Vercel / Next.js**: If a new PDF export route is created (e.g. `/api/truck/reports/export`), remember to update `outputFileTracingIncludes` in `next.config.mjs` to include `./src/assets/fonts/*.ttf`.
- **Firestore Document Size Limit**: Firestore document size limit is 1MB. For `truckPhotos`, WebP compressed images must be resized/compressed to <= 500KB (typically 100-200KB for receipts/bills).

---

## 4. Conclusion

- The codebase is clean, consistent, and strictly typed.
- Existing dependencies (`sharp`, `pdfkit`, `lucide-react`, `fflate`, `firebase-admin`) cover 100% of the Truck App and LINE Messaging requirements. No new npm packages need to be installed.
- All 50 existing tests pass in ~1.7s. `npm.cmd run typecheck` produces 0 errors. `npm.cmd run build` passes with 0 errors.
- The two emojis identified in `src/components/settings/SettingsTab.tsx` (lines 1380, 1384) are the only emojis in the entire project.

---

## 5. Verification Method

To independently verify the observations:

1. **Verify emoji scan**:
   ```powershell
   node -e "@'
   const fs = require('fs');
   const path = require('path');
   const emojiRegex = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u;
   function scan(dir) {
     for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
       const p = path.join(dir, e.name);
       if (e.isDirectory() && !['node_modules', '.git', '.next'].includes(e.name)) scan(p);
       else if (/\.(tsx?|jsx?|css|html)$/.test(e.name)) {
         fs.readFileSync(p, 'utf8').split('\n').forEach((l, i) => {
           if (emojiRegex.test(l)) console.log(p + ':' + (i + 1) + ': ' + l.trim());
         });
       }
     }
   }
   scan('src');
   '@"
   ```
   *Expected output: exactly 2 lines in `src\components\settings\SettingsTab.tsx` (1380, 1384).*

2. **Verify tests pass**:
   ```powershell
   npm.cmd test
   ```
   *Expected output: `pass 50, fail 0`.*

3. **Verify typecheck passes**:
   ```powershell
   npm.cmd run typecheck
   ```
   *Expected output: Exit code 0, no errors.*

4. **Verify build passes**:
   ```powershell
   npm.cmd run build
   ```
   *Expected output: Exit code 0, all routes generated successfully.*
