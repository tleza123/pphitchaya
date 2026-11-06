## 2026-11-06T06:50:54Z

You are the Wave 2 Iteration 2 Remediation Worker (teamwork_worker).
Your working directory is: c:\Users\tleza\Documents\GitHub\pphitchaya\.agents\teamwork\teamwork_worker_w2_iter2\
Original request path: c:\Users\tleza\Documents\GitHub\pphitchaya\.agents\teamwork\ORIGINAL_REQUEST.md
Project scope path: c:\Users\tleza\Documents\GitHub\pphitchaya\.agents\teamwork\PROJECT.md

READ `ORIGINAL_REQUEST.md` FIRST before starting work.

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

CRITICAL RULES:
- ZERO EMOJI RULE: Absolutely 0 Unicode emojis in code, strings, comments, or error messages.
- Read-Before-Write rule: in Firestore transactions, execute all reads before any writes.
- Integer satang rule: all monetary amounts are integer satangs.

Explorers have investigated and provided exact fix strategies in:
1. c:\Users\tleza\Documents\GitHub\pphitchaya\.agents\teamwork\teamwork_explorer_w2_iter2_1\handoff.md
2. c:\Users\tleza\Documents\GitHub\pphitchaya\.agents\teamwork\teamwork_explorer_w2_iter2_2\handoff.md
3. c:\Users\tleza\Documents\GitHub\pphitchaya\.agents\teamwork\teamwork_explorer_w2_iter2_3\handoff.md

Your Owned Files for Modification:
- `src/app/api/truck/records/route.ts`
- `src/app/api/truck/records/[id]/route.ts`
- `src/app/api/truck/photos/route.ts`
- `src/app/api/truck/settings/route.ts`
- `tests/challenger-truck-crud-stress.test.ts` (update test assertions if needed to assert 422 for corrupted buffer, 422 for tampered requestId, and 422 for 6+ photos)

Tasks to Implement:
1. In `src/app/api/truck/records/route.ts`:
   - Validate `photos`:
     ```ts
     if (photos !== undefined && !Array.isArray(photos)) {
       return createErrorResponse('INVALID_INPUT', 'ข้อมูลรูปภาพไม่ถูกต้อง', 422);
     }
     if (Array.isArray(photos) && photos.length > 5) {
       return createErrorResponse('INVALID_INPUT', 'สามารถแนบรูปภาพได้ไม่เกิน 5 รูป', 422);
     }
     ```
   - In catch block (around lines 201-207):
     ```ts
     if (error.message === 'CONFLICT') {
       return createErrorResponse('CONFLICT', undefined, 409);
     }
     if (error.message === 'REQUEST_ID_REUSED') {
       return createErrorResponse('REQUEST_ID_REUSED', undefined, 422);
     }
     ```
2. In `src/app/api/truck/records/[id]/route.ts`:
   - In catch block (around line 140):
     ```ts
     if (error.message === 'CONFLICT') {
       return createErrorResponse('CONFLICT', undefined, 409);
     }
     if (error.message === 'REQUEST_ID_REUSED') {
       return createErrorResponse('REQUEST_ID_REUSED', undefined, 422);
     }
     ```
3. In `src/app/api/truck/photos/route.ts`:
   - Wrap Sharp decoding / processing in a try/catch block so corrupted, malformed, or unsupported image buffers return HTTP 422 `INVALID_INPUT` (`ไฟล์รูปภาพไม่ถูกต้องหรือไม่รองรับ`) instead of crashing into HTTP 500 INTERNAL_ERROR.
4. In `src/app/api/truck/settings/route.ts`:
   - In catch block (lines 589-596):
     ```ts
     if (error.message === 'CONFLICT') {
       return createErrorResponse('CONFLICT', undefined, 409);
     }
     if (error.message === 'REQUEST_ID_REUSED') {
       return createErrorResponse('REQUEST_ID_REUSED', undefined, 422);
     }
     ```
5. Update `tests/challenger-truck-crud-stress.test.ts`:
   - Ensure the vulnerability check tests now assert that:
     - 6+ photos upload returns status 422 `INVALID_INPUT` (`สามารถแนบรูปภาพได้ไม่เกิน 5 รูป`).
     - Corrupted buffer returns status 422 `INVALID_INPUT` (`ไฟล์รูปภาพไม่ถูกต้องหรือไม่รองรับ`).
     - Reused requestId with tampered payload returns status 422 `REQUEST_ID_REUSED`.
   - Ensure `tests/truck-routes.test.ts` also passes.
6. Run full verification using Windows commands:
   - `npm.cmd test`
   - `npm.cmd run typecheck`
   - `npm.cmd run build`
   - Zero-emoji scan.

Write your final 5-component report to `handoff.md` in your working directory and notify the orchestrator.
