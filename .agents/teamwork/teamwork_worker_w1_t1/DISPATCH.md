## 2026-11-06T05:22:05Z
You are teamwork_worker (Wave 1, Task 1).
Your working directory is: c:\Users\tleza\Documents\GitHub\pphitchaya\.agents\teamwork\teamwork_worker_w1_t1\
Original user request path: c:\Users\tleza\Documents\GitHub\pphitchaya\.agents\teamwork\ORIGINAL_REQUEST.md
Scope document: c:\Users\tleza\Documents\GitHub\pphitchaya\.agents\teamwork\PROJECT.md
Implementation plan: C:\Users\tleza\.gemini\antigravity\brain\efc1fb76-b98e-49a1-a1f9-a19ca35cf399\implementation_plan.md
Survey reports:
- c:\Users\tleza\Documents\GitHub\pphitchaya\.agents\teamwork\teamwork_explorer_survey_1\handoff.md
- c:\Users\tleza\Documents\GitHub\pphitchaya\.agents\teamwork\teamwork_explorer_survey_2\handoff.md

EXCLUSIVE WRITE OWNERSHIP (You may only write to these files):
- `src/lib/server/repository.ts`
- `next.config.mjs`
- `src/lib/truck/types.ts`
- `src/lib/truck/engine.ts`
- `src/lib/truck/analytics.ts`
- `src/lib/server/truck-pdf.ts`
- `tests/truck-engine.test.ts`

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Task Scope (Task 1):
1. Create `tests/truck-engine.test.ts` testing `calculateTruckRecordTotals`, `buildTruckMonthlyReport`, `buildTruckAnalytics` (all using Integer Satang via `src/lib/payroll/money.ts`), and `createTruckReportPdf` (verifying `%PDF` header and buffer generation).
2. Add Firestore Collection Helpers in `src/lib/server/repository.ts` for Truck App and LINE Settings under `shops/{shopId}`:
   - `getTruckProfileRef(shopId)`: `shops/{shopId}/profile/truck`
   - `getLineSettingsRef(shopId)`: `shops/{shopId}/profile/line`
   - `getTrucksCol(shopId)` / `getTruckRef(truckId, shopId)`: `shops/{shopId}/trucks/{truckId}`
   - `getTruckOriginsCol(shopId)` / `getTruckOriginRef(originId, shopId)`: `shops/{shopId}/truckOrigins/{originId}`
   - `getTruckDestinationsCol(shopId)` / `getTruckDestinationRef(destId, shopId)`: `shops/{shopId}/truckDestinations/{destId}`
   - `getTruckMonthsCol(shopId)` / `getTruckMonthRef(monthKey, shopId)`: `shops/{shopId}/truckMonths/{monthKey}`
   - `getTruckRecordsCol(monthKey, shopId)` / `getTruckRecordRef(monthKey, recordId, shopId)`: `shops/{shopId}/truckMonths/{monthKey}/records/{dateKey}_{truckId}`
   - `getTruckPhotosCol(shopId)` / `getTruckPhotoRef(photoId, shopId)`: `shops/{shopId}/truckPhotos/{photoId}`
3. Update `next.config.mjs` to add `'/api/truck/reports/export': ['./src/assets/fonts/*.ttf', './node_modules/pdfkit/js/data/**/*']` to `outputFileTracingIncludes`.
4. Create `src/lib/truck/types.ts` with all types (`TruckDoc`, `TruckOriginDoc`, `TruckDestinationDoc`, `TruckTripItem`, `TruckPhotoMeta`, `TruckDailyRecordDoc`, `TruckMonthlyReport`, etc.).
5. Create `src/lib/truck/engine.ts` with `calculateTruckRecordTotals`, `buildTruckMonthlyReport`.
6. Create `src/lib/truck/analytics.ts` with `buildTruckAnalytics` supporting 'day' | 'month' | 'year' periods.
7. Create `src/lib/server/truck-pdf.ts` implementing `createTruckReportPdf` using `pdfkit` and THSarabunNew fonts.
8. Execute verification: run `npx.cmd tsx --test tests/truck-engine.test.ts` and `npm.cmd run typecheck`. Confirm all pass.
9. Write `handoff.md` in your working directory and message the orchestrator.
