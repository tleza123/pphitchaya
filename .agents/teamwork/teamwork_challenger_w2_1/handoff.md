# Challenger Report: Truck CRUD & Photos Adversarial Verification (Wave 2, Challenger 1)

**Verdict**: **REQUEST_CHANGES**

## 1. Observation
- Built and executed an adversarial test harness in `tests/challenger-truck-crud-stress.test.ts` (10 test suites, 770 lines) targeting:
  - `src/app/api/truck/records/route.ts`
  - `src/app/api/truck/records/[id]/route.ts`
  - `src/app/api/truck/settings/route.ts`
  - `src/app/api/truck/photos/route.ts`
  - `src/app/api/truck/photos/[id]/route.ts`

- **Execution Command & Output**:
  ```bash
  npx.cmd tsx --test tests/challenger-truck-crud-stress.test.ts
  ```
  Verbatim output:
  ```
  ✔ Concurrency: Sequential conflicting expectedRevision returns 409 CONFLICT (13.8384ms)
  Empirical Concurrency Race Results: {
    statuses: [ 200, 409, 409, 409, 409 ],
    successCount: 1,
    conflictCount: 4
  }
  Empirical Reused RequestId Result: {
    status: 500,
    errorCode: 'INTERNAL_ERROR',
    message: 'REQUEST_ID_REUSED'
  }
  Empirical 6+ Photos Upload Result: { status: 200, ok: true, savedPhotosCount: 6, error: undefined }
  ✔ Concurrency: Parallel racing updates with identical expectedRevision - only 1 succeeds, others get 409 (9.1219ms)
  ✔ Concurrency: Stale expectedRevision on DELETE returns 409 CONFLICT (1.7879ms)
  ✔ Concurrency: Stale expectedRevision in settings (Profile, Truck, Dest) returns 409 (8.0136ms)
  ✔ Idempotency: Exact replay with identical requestId returns cached response without modifying state (1.4027ms)
  ✔ Idempotency [VULNERABILITY CHECK]: Reused requestId with tampered payload returns 500 instead of 422 (1.1003ms)
  ✔ Photo Limits [VULNERABILITY CHECK]: Uploading 6+ photos to test 5-photo cap enforcement (0.7363ms)
  Empirical Corrupted Buffer Upload Result: {
    status: 500,
    ok: false,
    errorCode: 'INTERNAL_ERROR',
    errorMessage: 'Input buffer contains unsupported image format'
  }
  ✔ Photo Limits [VULNERABILITY CHECK]: Corrupted non-image buffer upload to /api/truck/photos (4.6041ms)
  Empirical High-Entropy Noise Image Result: {
    status: 422,
    ok: false,
    sizeKb: undefined,
    errorCode: 'INVALID_INPUT',
    errorMessage: 'ขนาดรูปภาพเกินกำหนด 250 KB หลังการบีบอัด'
  }
  ✔ Photo Limits: Oversized files (>10MB input and uncompressible >250KB WebP) (738.0641ms)
  ✔ Strict Read-Before-Write: All route handlers maintain strict read-then-write order (5.0225ms)
  ℹ tests 10
  ℹ suites 0
  ℹ pass 10
  ℹ fail 0
  ℹ duration_ms 1732.4105
  ```

- **Full test suite run**:
  ```bash
  npx.cmd tsx --test tests/*.test.ts
  ```
  Result: 141 tests passing across 20 suites.

- **TypeScript check**:
  ```bash
  npm.cmd run typecheck
  ```
  Result: 0 errors (`tsc --noEmit` exited code 0).

- **Zero-emoji audit**:
  ```bash
  node -e "const fs = require('fs'); const content = fs.readFileSync('tests/challenger-truck-crud-stress.test.ts', 'utf8'); const r = /[\u{1F300}-\u{1F9FF}\u{1FA00}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F1E6}-\u{1F1FF}]/u; let cnt=0; content.split('\n').forEach((l, i) => { if (r.test(l)) { console.log(i+1, l); cnt++; } }); console.log('Total emojis:', cnt); process.exit(cnt === 0 ? 0 : 1);"
  ```
  Result: `Total emojis: 0`.

---

## 2. Logic Chain & Identified Deficiencies

### Confirmed Robust Protections (PASS)
1. **Concurrency Conflicts**:
   - Sequential updates with conflicting `expectedRevision` consistently return HTTP 409 CONFLICT across `POST /api/truck/records`, `DELETE /api/truck/records/[id]`, and `POST /api/truck/settings` (`UPDATE_PROFILE`, `UPSERT_TRUCK`, `UPSERT_DESTINATION`).
   - True concurrent race condition with 5 simultaneous requests competing for revision 1 resulted in exactly 1 succeeding (200 OK, revision 2) and 4 receiving 409 CONFLICT.
2. **Strict Transaction Read-Before-Write**:
   - Zero violations observed across all 10 transaction operations in `records/route.ts`, `records/[id]/route.ts`, and `settings/route.ts`. All reads (`get`, `getAll`) strictly preceded any writes (`set`, `update`, `delete`).
3. **Photo File Limits**:
   - File uploads exceeding 10 MB are rejected immediately with HTTP 422 `INVALID_INPUT` (`ขนาดไฟล์รูปภาพเกินกำหนด (ไม่เกิน 10 MB)`).
   - High-entropy uncompressible images exceeding 250 KB after WebP processing are rejected with HTTP 422 `INVALID_INPUT` (`ขนาดรูปภาพเกินกำหนด 250 KB หลังการบีบอัด`).

---

### Deficiencies Requiring Remediation (REQUEST_CHANGES)

#### Defect 1: 5-Photo Cap Per Daily Record is Unenforced (HIGH)
- **Observation**:
  In `src/app/api/truck/records/route.ts` lines 84-166, the incoming `photos` array is accepted without checking its length:
  ```ts
  const finalPhotos = Array.isArray(photos) ? photos : (current?.photos || []);
  ```
  Submitting a record with 6 photos metadata returned `HTTP 200 OK` and saved all 6 photos:
  `Empirical 6+ Photos Upload Result: { status: 200, ok: true, savedPhotosCount: 6 }`
- **Blast Radius**:
  Violates the 5-photo maximum cap per daily record specified in requirements. Allows clients to bloat Firestore daily record documents with arbitrary numbers of photo records.
- **Required Mitigation**:
  In `src/app/api/truck/records/route.ts`, add input validation before transaction execution:
  ```ts
  if (Array.isArray(photos) && photos.length > 5) {
    return createErrorResponse('INVALID_INPUT', 'สามารถแนบรูปภาพได้ไม่เกิน 5 รูป', 422);
  }
  ```

#### Defect 2: Corrupted Image Buffers Cause HTTP 500 Server Crashes (MEDIUM)
- **Observation**:
  In `src/app/api/truck/photos/route.ts` lines 46-51:
  ```ts
  const initialImage = sharp(inputBuffer);
  const initialMeta = await initialImage.metadata();
  ```
  When corrupted non-image binary data is submitted, `sharp` throws an unhandled error (`Input buffer contains unsupported image format`), which falls into the top-level catch block returning `HTTP 500 INTERNAL_ERROR`:
  `Empirical Corrupted Buffer Upload Result: { status: 500, ok: false, errorCode: 'INTERNAL_ERROR', errorMessage: 'Input buffer contains unsupported image format' }`
- **Blast Radius**:
  Invalid client input triggers 500 Internal Server Errors in production monitoring dashboards and leaks internal library errors rather than returning a clean client validation error.
- **Required Mitigation**:
  In `src/app/api/truck/photos/route.ts`, catch Sharp format/parse errors and return `HTTP 422 INVALID_INPUT`:
  ```ts
  let initialMeta;
  try {
    const initialImage = sharp(inputBuffer);
    initialMeta = await initialImage.metadata();
  } catch {
    return createErrorResponse('INVALID_INPUT', 'ไฟล์รูปภาพไม่ถูกต้องหรือไม่รองรับ', 422);
  }
  ```

#### Defect 3: Idempotency Replay with Tampered Payload Returns HTTP 500 Instead of 422 (MEDIUM)
- **Observation**:
  When a duplicate `requestId` is sent with a modified payload, `checkRequestReceipt()` in `src/lib/server/idempotency.ts` throws `new Error('REQUEST_ID_REUSED')`.
  In `src/app/api/truck/records/route.ts` and `src/app/api/truck/settings/route.ts`, the catch block only checks:
  ```ts
  if (error.message === 'CONFLICT') {
    return createErrorResponse('CONFLICT', undefined, 409);
  }
  return createErrorResponse(error.code || 'INTERNAL_ERROR', error.message, error.statusCode || 500);
  ```
  Consequently, `error.code` is undefined, causing the server to return `HTTP 500 INTERNAL_ERROR` (`message: 'REQUEST_ID_REUSED'`).
  In contrast, `src/app/api/attendance/route.ts:336-338` properly handles this:
  ```ts
  if (error.message === 'REQUEST_ID_REUSED') {
    return createErrorResponse('REQUEST_ID_REUSED', undefined, 422);
  }
  ```
- **Blast Radius**:
  A client payload collision or replay attack generates 500 Internal Server Errors instead of standard 422 Unprocessable Entity with the catalog error message `THAI_ERROR_MESSAGES.REQUEST_ID_REUSED`.
- **Required Mitigation**:
  In both `src/app/api/truck/records/route.ts` and `src/app/api/truck/settings/route.ts`, update the catch block:
  ```ts
  if (error.message === 'REQUEST_ID_REUSED') {
    return createErrorResponse('REQUEST_ID_REUSED', undefined, 422);
  }
  ```

---

## 3. Caveats
- Firestore transactions were tested against an in-memory adversarial mock that tracks read-version serialization conflicts and strict read-before-write sequencing. Live Firebase Firestore behavior under network latency may introduce additional retry iterations, but the application logic contracts remain identical.
- WebP compression and adaptive resizing rely on `sharp` binaries bundled with the Node.js environment.

---

## 4. Conclusion
While the core concurrency locking, Read-Before-Write transactions, and exact idempotency replay are functioning correctly, the APIs have 3 confirmed vulnerabilities under adversarial stress testing:
1. Missing 5-photo maximum limit check on `POST /api/truck/records` (saves 6+ photos with 200 OK).
2. Corrupted image buffer decoding triggers HTTP 500 instead of HTTP 422 in `POST /api/truck/photos`.
3. Idempotency payload tampering triggers HTTP 500 instead of HTTP 422 `REQUEST_ID_REUSED` in `POST /api/truck/records` and `settings`.

**Verdict**: **REQUEST_CHANGES** until the worker addresses these 3 specific issues.

---

## 5. Verification Method
To independently verify:
1. Run the challenger stress test suite:
   ```bash
   npx.cmd tsx --test tests/challenger-truck-crud-stress.test.ts
   ```
   Review console output for the 3 empirical results.
2. Run full test suite:
   ```bash
   npx.cmd tsx --test tests/*.test.ts
   ```
   Expected: 141 tests pass, 0 fail.
3. Run TypeScript check:
   ```bash
   npm.cmd run typecheck
   ```
   Expected: 0 errors.
4. Run emoji audit:
   ```bash
   node -e "const fs = require('fs'); const content = fs.readFileSync('tests/challenger-truck-crud-stress.test.ts', 'utf8'); const r = /[\u{1F300}-\u{1F9FF}\u{1FA00}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F1E6}-\u{1F1FF}]/u; let cnt=0; content.split('\n').forEach((l, i) => { if (r.test(l)) { console.log(i+1, l); cnt++; } }); console.log('Total emojis:', cnt); process.exit(cnt === 0 ? 0 : 1);"
   ```
   Expected: `Total emojis: 0`.
