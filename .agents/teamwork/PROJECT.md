# Project: Truck App & LINE Messaging API Integration (pphitchaya)

## Architecture
- Dual-system on single domain (Next.js 15 App Router on Vercel `sin1`):
  - Attendance Web: `/`, `/reports`, `/reports/detailed`, `/settings`
  - Truck App: `/truck`, `/truck/reports`, `/truck/reports/detailed`, `/truck/settings`
  - Absolute zero cross-linking between systems on UI.
- Firestore multi-tenant / shop partitioning under `shops/{shopId}`:
  - Employee system: `profile/main`, `employees`, `months/{YYYY-MM}/attendance`, `closures`
  - Truck system: `profile/truck`, `profile/line`, `trucks`, `truckOrigins`, `truckDestinations`, `truckMonths/{YYYY-MM}/records/{dateKey}_{truckId}`, `truckPhotos/{photoId}`
  - Shared infrastructure: `requests` (Idempotency receipts), `audit` (Audit logs)
- Strict Integer Satang currency representation (`moneySatang`, `validateSatang`, `formatMoney`).
- Strict Read-Before-Write rule in all Firestore Transactions.
- Native Node 20 `fetch` for LINE Messaging API (push and broadcast, 2 Flex Message bubble cards).
- Image handling: client canvas WebP compression + server-side `sharp` optimization stored as Base64 in `truckPhotos` collection (no cloud storage bucket needed).
- Quiet Operational UI (`human-ui-design`): Sarabun font, `tokens.css`, `tabular-nums`, large touch buttons, 100% Zero Emoji.

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | F1: Truck Repository Helpers | Collection helpers in `src/lib/server/repository.ts` for all truck entities & line settings under `shops/{shopId}` | M1 | Survey 1, Task 1 |
| 2 | F2: Truck Types | TypeScript interfaces in `src/lib/truck/types.ts` for trucks, origins, destinations, trips, photos, daily records | M1 | Survey 2, Task 1 |
| 3 | F3: Truck Engine & Analytics | Pure calculation functions in `src/lib/truck/engine.ts` and `analytics.ts` using integer satang | M1 | Survey 2, Task 1 |
| 4 | F4: Truck PDF Builder | Monthly report PDF generator in `src/lib/server/truck-pdf.ts` via `pdfkit` + Sarabun font | M1 | Survey 1 & 2, Task 1 |
| 5 | F5: LINE Client & Engine | Native fetch client in `src/lib/line/client.ts` & `daily-summary.ts` with hierarchy config and `LINE_NOT_CONFIGURED` handling | M1 | Survey 3, Task 2 |
| 6 | F6: LINE Flex Templates | Bubble card templates in `src/lib/line/flex-templates.ts` (Attendance card `#003566` + Truck card `#0F2942`) | M1 | Survey 3, Task 2 |
| 7 | F7: LINE API Routes & Cron | Endpoints `/api/line/settings`, `/api/line/notify`, `/api/line/webhook`, `/api/cron/daily-summary` & Vercel cron | M1 | Survey 3, Task 2 |
| 8 | F8: Design Tokens Modernization | Quiet Operational tokens in `src/styles/tokens.css` with `[data-app-theme="truck"]` palette | M1 | Survey 1, Task 3 |
| 9 | F9: Attendance UI Modernization & Zero Emoji | Remove emojis in `SettingsTab.tsx` (1380, 1384), fix 1px border jump, tabular-nums, LINE button in attendance | M1 | Survey 1, Task 3 |
| 10 | F10: Truck CRUD & Bootstrap APIs | Routes `/api/truck/bootstrap`, `/api/truck/records`, `/api/truck/settings` with Read-Before-Write transactions | M2 | Survey 1 & 2, Task 4 |
| 11 | F11: Truck Photos WebP APIs | Routes `/api/truck/photos` & `[id]` with `sharp` WebP processing and Firestore storage | M2 | Survey 1 & 2, Task 4 |
| 12 | F12: Truck Reports & Analytics APIs | Routes `/api/truck/reports` & `analytics` with bounded concurrency month queries | M2 | Survey 2, Task 5 |
| 13 | F13: Truck Export APIs | Route `/api/truck/reports/export` with PDF and Excel CSV (UTF-8 BOM `\uFEFF`) formats | M2 | Survey 2, Task 5 |
| 14 | F14: Truck App Shell & Pages | Shell, header, bottom nav, CSS module, and 4 route pages under `/truck/*` | M3 | Survey 2, Task 6 |
| 15 | F15: Truck Record Tab | Tab 1: date, truck selector, auto-load `{dateKey}_{truckId}`, trips array, fuel, photo upload, save & LINE button | M3 | Survey 2, Task 7 |
| 16 | F16: Truck Reports & Analytics Tabs | Tab 2: ledger summary, per-truck table, daily history, edit-in-place button, delete modal, SVG charts, exports | M3 | Survey 2, Task 8 |
| 17 | F17: Truck Settings & Attendance LINE UI | Tab 3: truck/origin/dest CRUD, company name, backup JSON, LINE settings, and LINE buttons in attendance | M3 | Survey 1 & 2, Task 9 |
| 18 | F18: Scripts, E2E Verification & Build | Backup/seed scripts, zero emoji check, 100% test suite pass, typecheck pass, build verification | M4 | Survey 1, Task 10 |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | Wave 1: Core Backend, LINE Engine & Design Tokens | Tasks 1, 2, 3 (F1 to F9) | none | DONE |
| M2 | Wave 2: Truck API Routes & Server Endpoints | Tasks 4, 5 (F10 to F13) | M1 | IN_PROGRESS |
| M3 | Wave 3: Truck Frontend & LINE UI Integration | Tasks 6, 7, 8, 9 (F14 to F17) | M2 | PLANNED |
| M4 | Wave 4: Integration Verification, Scripts & Build | Task 10 (F18) + E2E Suite | M3 | PLANNED |

## Interface Contracts
### `src/lib/server/repository.ts` ↔ Truck Domain
- `getTruckProfileRef(shopId)`: `DocumentReference<TruckProfileDoc>`
- `getLineSettingsRef(shopId)`: `DocumentReference<LineSettingsDoc>`
- `getTrucksCol(shopId)`: `CollectionReference<TruckDoc>`
- `getTruckRef(truckId, shopId)`: `DocumentReference<TruckDoc>`
- `getTruckOriginsCol(shopId)`: `CollectionReference<TruckOriginDoc>`
- `getTruckOriginRef(originId, shopId)`: `DocumentReference<TruckOriginDoc>`
- `getTruckDestinationsCol(shopId)`: `CollectionReference<TruckDestinationDoc>`
- `getTruckDestinationRef(destId, shopId)`: `DocumentReference<TruckDestinationDoc>`
- `getTruckMonthsCol(shopId)`: `CollectionReference<TruckMonthDoc>`
- `getTruckMonthRef(monthKey, shopId)`: `DocumentReference<TruckMonthDoc>`
- `getTruckRecordsCol(monthKey, shopId)`: `CollectionReference<TruckDailyRecordDoc>`
- `getTruckRecordRef(monthKey, recordId, shopId)`: `DocumentReference<TruckDailyRecordDoc>` where `recordId = ${dateKey}_${truckId}`
- `getTruckPhotosCol(shopId)`: `CollectionReference<TruckPhotoDoc>`
- `getTruckPhotoRef(photoId, shopId)`: `DocumentReference<TruckPhotoDoc>`

### `src/lib/truck/engine.ts` ↔ API & Frontend
- `calculateTruckRecordTotals(trips: TruckTripItem[], fuelCostSatang: number): { totalDriverPaySatang: number; tripCount: number }`
- `buildTruckMonthlyReport(records: TruckDailyRecordDoc[], trucks: TruckDoc[], monthKey: string): TruckMonthlyReport`
- `buildTruckAnalytics(recordsByMonth: Map<string, TruckDailyRecordDoc[]>, trucks: TruckDoc[], period: 'day' | 'month' | 'year', today: string, months: string[]): TruckAnalyticsResult`

### `src/lib/line/client.ts` ↔ LINE Endpoints & Cron
- `resolveLineConfig(shopId?: string): Promise<LineConfig>`
- `sendLinePush(config: LineConfig, messages: any[], targetId?: string): Promise<LineSendResult>`
- `buildAttendanceDailyFlex(data: AttendanceDailySummaryData): FlexBubble`
- `buildTruckDailyFlex(data: TruckDailySummaryData): FlexBubble`

## Code Layout
- Backend & Domain:
  - `src/lib/truck/types.ts`
  - `src/lib/truck/engine.ts`
  - `src/lib/truck/analytics.ts`
  - `src/lib/server/repository.ts`
  - `src/lib/server/truck-pdf.ts`
  - `src/lib/line/client.ts`
  - `src/lib/line/flex-templates.ts`
  - `src/lib/line/daily-summary.ts`
- API Routes:
  - `src/app/api/truck/bootstrap/route.ts`
  - `src/app/api/truck/records/route.ts`
  - `src/app/api/truck/records/[id]/route.ts`
  - `src/app/api/truck/settings/route.ts`
  - `src/app/api/truck/photos/route.ts`
  - `src/app/api/truck/photos/[id]/route.ts`
  - `src/app/api/truck/reports/route.ts`
  - `src/app/api/truck/reports/analytics/route.ts`
  - `src/app/api/truck/reports/export/route.ts`
  - `src/app/api/line/settings/route.ts`
  - `src/app/api/line/notify/route.ts`
  - `src/app/api/line/webhook/route.ts`
  - `src/app/api/cron/daily-summary/route.ts`
- Frontend:
  - `src/app/truck/page.tsx`
  - `src/app/truck/reports/page.tsx`
  - `src/app/truck/reports/detailed/page.tsx`
  - `src/app/truck/settings/page.tsx`
  - `src/components/truck/TruckShell.tsx`
  - `src/components/truck/TruckHeader.tsx`
  - `src/components/truck/TruckBottomNav.tsx`
  - `src/components/truck/TruckRecordTab.tsx`
  - `src/components/truck/TruckReportsTab.tsx`
  - `src/components/truck/TruckDetailedReports.tsx`
  - `src/components/truck/TruckSettingsTab.tsx`
  - `src/components/truck/truck.module.css`
  - `src/styles/tokens.css`
