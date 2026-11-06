## 2026-11-06T05:58:59Z
You are teamwork_worker (Wave 2, Task 4).
Your working directory is: c:\Users\tleza\Documents\GitHub\pphitchaya\.agents\teamwork\teamwork_worker_w2_t4\
Original user request path: c:\Users\tleza\Documents\GitHub\pphitchaya\.agents\teamwork\ORIGINAL_REQUEST.md
Scope document: c:\Users\tleza\Documents\GitHub\pphitchaya\.agents\teamwork\PROJECT.md
Implementation plan: C:\Users\tleza\.gemini\antigravity\brain\efc1fb76-b98e-49a1-a1f9-a19ca35cf399\implementation_plan.md (Task 4)

EXCLUSIVE WRITE OWNERSHIP (You may only write to these files):
- `src/app/api/truck/bootstrap/route.ts`
- `src/app/api/truck/records/route.ts`
- `src/app/api/truck/records/[id]/route.ts`
- `src/app/api/truck/settings/route.ts`
- `src/app/api/truck/photos/route.ts`
- `src/app/api/truck/photos/[id]/route.ts`
- `src/app/api/truck/backup/route.ts`
- `tests/truck-routes.test.ts`

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

ZERO EMOJI RULE:
Under no circumstances may any source code, error message, or response string contain any Unicode emojis (Zero Emoji Rule).

Task Scope (Task 4):
1. Create `tests/truck-routes.test.ts` (mocking `(globalThis as any).adminDb` like `tests/attendance-route.test.ts`):
   - Test `GET /api/truck/bootstrap`: returns trucks, truckOrigins, truckDestinations, truckProfile, lineSettings under shopId.
   - Test `POST` and `GET /api/truck/settings`: manage trucks, origins, destinations, companyName.
   - Test `POST /api/truck/records`:
     - Initial creation of `{dateKey}_{truckId}` daily record with trips, fuelCostSatang, totalDriverPaySatang.
     - In-place edit/update of the SAME `{dateKey}_{truckId}` record on subsequent save (re-reading doc, verifying `expectedRevision` and `requestId`, updating trips and fuel).
     - Strict Read-Before-Write verification in Firestore transaction.
   - Test `DELETE /api/truck/records/[id]`.
   - Test `POST /api/truck/photos`: upload image, verify `sharp` WebP processing, max 250KB limit, and storage in `truckPhotos`.
   - Test `GET /api/truck/photos/[id]`.
   - Test `GET /api/truck/backup`: export JSON of truck collections.
2. Implement route handlers:
   - `src/app/api/truck/bootstrap/route.ts`
   - `src/app/api/truck/records/route.ts`
   - `src/app/api/truck/records/[id]/route.ts`
   - `src/app/api/truck/settings/route.ts`
   - `src/app/api/truck/photos/route.ts`
   - `src/app/api/truck/photos/[id]/route.ts`
   - `src/app/api/truck/backup/route.ts`
3. Execute verification:
   - `npx.cmd tsx --test tests/truck-routes.test.ts`
   - `npm.cmd run typecheck`
4. Write `handoff.md` and message the orchestrator.
