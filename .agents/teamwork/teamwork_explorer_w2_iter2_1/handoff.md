# Investigation & Fix Strategy Report: Defect 1 & Defect 3 in `src/app/api/truck/records/route.ts`

**Explorer**: Wave 2 Iteration 2 Explorer 1 (`teamwork_explorer_w2_iter2_1`)  
**Scope**: Defect 1 (5-photo maximum cap unenforced) and Defect 3 (REQUEST_ID_REUSED 500 error instead of 422)  
**Mode**: READ-ONLY Investigation

---

## 1. Observation

### 1.1 Defect 1: Unenforced 5-Photo Cap Per Daily Record
- **File**: `src/app/api/truck/records/route.ts`
- **Lines 78-104**:
  ```ts
  78:     const body = await req.json();
  79:     const {
  80:       dateKey,
  81:       truckId,
  82:       trips,
  83:       fuelCostSatang,
  84:       photos,
  85:       expectedRevision,
  86:       requestId
  87:     } = body;
  88: 
  89:     if (!requestId || typeof requestId !== 'string' || requestId.length < 5) {
  90:       return createErrorResponse('INVALID_INPUT', 'กรุณาระบุ requestId ให้ถูกต้อง', 422);
  91:     }
  92:     if (typeof expectedRevision !== 'number' || expectedRevision < 0) {
  93:       return createErrorResponse('INVALID_INPUT', 'กรุณาระบุ expectedRevision ให้ถูกต้อง', 422);
  94:     }
  95:     if (!dateKey || typeof dateKey !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
  96:       return createErrorResponse('INVALID_DATE', 'รูปแบบวันที่ไม่ถูกต้อง', 422);
  97:     }
  98:     if (!truckId || typeof truckId !== 'string') {
  99:       return createErrorResponse('INVALID_INPUT', 'กรุณาระบุเลือกรถสิบล้อ', 422);
  100:    }
  101:    if (!Array.isArray(trips)) {
  102:      return createErrorResponse('INVALID_INPUT', 'รายการเที่ยววิ่งไม่ถูกต้อง', 422);
  103:    }
  104: 
  105:    let totals: { totalDriverPaySatang: number; tripCount: number };
  ```
- **Lines 153 & 166**:
  ```ts
  153:       const finalPhotos = Array.isArray(photos) ? photos : (current?.photos || []);
  ...
  166:         photos: finalPhotos,
  ```
- **Verbatim Tool Execution**:
  Command: `npx.cmd tsx --test tests/challenger-truck-crud-stress.test.ts`
  Verbatim output from Suite 3 line 604:
  ```
  Empirical 6+ Photos Upload Result: { status: 200, ok: true, savedPhotosCount: 6, error: undefined }
  ```
  A payload containing 6 photo items was accepted with `HTTP 200 OK`, saving all 6 photos directly into the daily record document.

---

### 1.2 Defect 3: Idempotency Replay with Tampered Payload Returns HTTP 500 Instead of 422
- **File**: `src/lib/server/idempotency.ts`
- **Lines 59-63**:
  ```ts
  59:   const data = snap.data() as RequestReceipt;
  60:   if (data.payloadHash !== expectedPayloadHash) {
  61:     throw new Error('REQUEST_ID_REUSED');
  62:   }
  ```
  When an existing `requestId` receipt document is fetched during `checkRequestReceipt(tx, requestRef, payloadHash)` but the hash does not match, a native JavaScript `Error` with message `'REQUEST_ID_REUSED'` is thrown.

- **File**: `src/app/api/truck/records/route.ts`
- **Lines 201-207**:
  ```ts
  201:   } catch (err: unknown) {
  202:     const error = err as { code?: string; message?: string; statusCode?: number };
  203:     if (error.message === 'CONFLICT') {
  204:       return createErrorResponse('CONFLICT', undefined, 409);
  205:     }
  206:     return createErrorResponse(error.code || 'INTERNAL_ERROR', error.message, error.statusCode || 500);
  207:   }
  ```
  Because `new Error('REQUEST_ID_REUSED')` does not have `error.code` or `error.statusCode` properties, line 206 evaluates:
  - `error.code || 'INTERNAL_ERROR'` -> `'INTERNAL_ERROR'`
  - `error.statusCode || 500` -> `500`
  - `error.message` -> `'REQUEST_ID_REUSED'`

- **Verbatim Tool Execution**:
  Command: `npx.cmd tsx --test tests/challenger-truck-crud-stress.test.ts`
  Verbatim output from Suite 2 line 552:
  ```
  Empirical Reused RequestId Result: {
    status: 500,
    errorCode: 'INTERNAL_ERROR',
    message: 'REQUEST_ID_REUSED'
  }
  ```

- **Reference Implementation**: `src/app/api/attendance/route.ts`
- **Lines 325-338**:
  ```ts
  325:   } catch (err: unknown) {
  326:     const error = err as { code?: string; message?: string; statusCode?: number };
  327:     if (error.message === 'CONFLICT') {
  328:       return createErrorResponse('CONFLICT', undefined, 409);
  329:     }
  ...
  336:     if (error.message === 'REQUEST_ID_REUSED') {
  337:       return createErrorResponse('REQUEST_ID_REUSED', undefined, 422);
  338:     }
  ```
- **Error Dictionary**: `src/lib/server/errors.ts` line 32:
  ```ts
  REQUEST_ID_REUSED: 'requestId นี้เคยถูกใช้กับข้อมูลชุดอื่นแล้ว',
  ```
  When `createErrorResponse('REQUEST_ID_REUSED', undefined, 422)` is called, the response has HTTP 422, `error.code = 'REQUEST_ID_REUSED'`, and Thai message `'requestId นี้เคยถูกใช้กับข้อมูลชุดอื่นแล้ว'`.

- **Additional Affected Endpoints**:
  - `src/app/api/truck/records/[id]/route.ts` (lines 137-143) — DELETE handler calls `checkRequestReceipt` on line 95, but catch block only handles `CONFLICT`.
  - `src/app/api/truck/settings/route.ts` (lines 589-595) — POST handler calls `checkRequestReceipt` on lines 152, 225, 291, 352, 415, 484, 548, but catch block only handles `CONFLICT`.

---

## 2. Logic Chain

### 2.1 Logic Chain for Defect 1
1. **Premise**: In R2 and project requirements, daily truck records support up to 5 attached photos (fuel receipts, delivery slips) compressed to WebP.
2. **Finding**: In `POST /api/truck/records`, the input validation block validates `requestId`, `expectedRevision`, `dateKey`, `truckId`, and `trips`, but completely omits checking `photos`.
3. **Trace**: `body.photos` passes directly to `finalPhotos = Array.isArray(photos) ? photos : (current?.photos || []);` and is saved without boundary checking.
4. **Resolution**: Validation must be performed prior to transaction execution. If `Array.isArray(photos) && photos.length > 5`, immediately reject with `createErrorResponse('INVALID_INPUT', 'สามารถแนบรูปภาพได้ไม่เกิน 5 รูป', 422)`. Optionally, if `photos !== undefined && !Array.isArray(photos)`, reject as `INVALID_INPUT`.

### 2.2 Logic Chain for Defect 3
1. **Premise**: Idempotency enforces that a duplicate `requestId` must either match the original payload exactly (returning cached 200 OK) or, if the payload was altered, reject the request as an invalid/tampered replay with HTTP 422 `REQUEST_ID_REUSED`.
2. **Finding**: `checkRequestReceipt` throws `new Error('REQUEST_ID_REUSED')`.
3. **Trace**: In `POST /api/truck/records`, the catch block only checks `if (error.message === 'CONFLICT')`. The generic fallback executes: `createErrorResponse(error.code || 'INTERNAL_ERROR', error.message, error.statusCode || 500)`. Because `error.code` is undefined on a standard `Error`, this returns HTTP 500 `INTERNAL_ERROR`.
4. **Resolution**: Explicitly intercept `if (error.message === 'REQUEST_ID_REUSED')` in the catch block of `src/app/api/truck/records/route.ts` and return `createErrorResponse('REQUEST_ID_REUSED', undefined, 422)`. Apply identical handling to `src/app/api/truck/records/[id]/route.ts` and `src/app/api/truck/settings/route.ts` for full architectural parity with `src/app/api/attendance/route.ts:336-338`.

---

## 3. Caveats
1. **Partial updates with existing photos**: If an update does not pass `photos` (`photos === undefined`), `finalPhotos` defaults to `current?.photos || []`. Since all writes are capped at 5 photos, `current?.photos` will never exceed 5 items.
2. **Photos array elements**: The 5-photo validation checks array length. Individual photo objects uploaded via `POST /api/truck/photos` have already been validated for size (<= 250 KB) and format.
3. **No source modifications performed**: As a read-only explorer agent, no source files were altered during this investigation.

---

## 4. Conclusion & Proposed Fix Implementation Plan

### 4.1 Fix 1: Enforce 5-Photo Cap in `src/app/api/truck/records/route.ts`
**Target File**: `src/app/api/truck/records/route.ts`  
**Location**: Insert at line 104 (after trips array validation, before totals calculation):

```ts
<<<< BEFORE (lines 101-105)
    if (!Array.isArray(trips)) {
      return createErrorResponse('INVALID_INPUT', 'รายการเที่ยววิ่งไม่ถูกต้อง', 422);
    }

    let totals: { totalDriverPaySatang: number; tripCount: number };
====
>>>> AFTER
    if (!Array.isArray(trips)) {
      return createErrorResponse('INVALID_INPUT', 'รายการเที่ยววิ่งไม่ถูกต้อง', 422);
    }
    if (photos !== undefined && !Array.isArray(photos)) {
      return createErrorResponse('INVALID_INPUT', 'ข้อมูลรูปภาพไม่ถูกต้อง', 422);
    }
    if (Array.isArray(photos) && photos.length > 5) {
      return createErrorResponse('INVALID_INPUT', 'สามารถแนบรูปภาพได้ไม่เกิน 5 รูป', 422);
    }

    let totals: { totalDriverPaySatang: number; tripCount: number };
<<<<
```

---

### 4.2 Fix 2: Catch `REQUEST_ID_REUSED` and Return HTTP 422 in `src/app/api/truck/records/route.ts`
**Target File**: `src/app/api/truck/records/route.ts`  
**Location**: Lines 201-208 in `POST` catch block:

```ts
<<<< BEFORE (lines 201-207)
  } catch (err: unknown) {
    const error = err as { code?: string; message?: string; statusCode?: number };
    if (error.message === 'CONFLICT') {
      return createErrorResponse('CONFLICT', undefined, 409);
    }
    return createErrorResponse(error.code || 'INTERNAL_ERROR', error.message, error.statusCode || 500);
  }
====
>>>> AFTER
  } catch (err: unknown) {
    const error = err as { code?: string; message?: string; statusCode?: number };
    if (error.message === 'CONFLICT') {
      return createErrorResponse('CONFLICT', undefined, 409);
    }
    if (error.message === 'REQUEST_ID_REUSED') {
      return createErrorResponse('REQUEST_ID_REUSED', undefined, 422);
    }
    return createErrorResponse(error.code || 'INTERNAL_ERROR', error.message, error.statusCode || 500);
  }
<<<<
```

---

### 4.3 Fix 3 (Recommended Architectural Parity):
Apply the identical `REQUEST_ID_REUSED` catch block to:
1. `src/app/api/truck/records/[id]/route.ts` (around line 140)
2. `src/app/api/truck/settings/route.ts` (around line 592)

```ts
    if (error.message === 'CONFLICT') {
      return createErrorResponse('CONFLICT', undefined, 409);
    }
    if (error.message === 'REQUEST_ID_REUSED') {
      return createErrorResponse('REQUEST_ID_REUSED', undefined, 422);
    }
```

---

## 5. Verification Method

Once the implementer applies the proposed changes:

1. **Verify 5-Photo Cap Rejection**:
   Run a targeted test or assert in `tests/challenger-truck-crud-stress.test.ts`:
   ```ts
   // In Suite 3: Photo Limits
   assert.equal(res.status, 422);
   assert.equal(body.ok, false);
   assert.equal(body.error.code, 'INVALID_INPUT');
   assert.equal(body.error.message, 'สามารถแนบรูปภาพได้ไม่เกิน 5 รูป');
   ```

2. **Verify Idempotency Tamper Rejection**:
   In `tests/challenger-truck-crud-stress.test.ts`:
   ```ts
   // In Suite 2: Idempotency
   assert.equal(attackRes.status, 422);
   assert.equal(attackBody.ok, false);
   assert.equal(attackBody.error.code, 'REQUEST_ID_REUSED');
   assert.equal(attackBody.error.message, 'requestId นี้เคยถูกใช้กับข้อมูลชุดอื่นแล้ว');
   ```

3. **Run Full Test Suite**:
   ```bash
   npx.cmd tsx --test tests/challenger-truck-crud-stress.test.ts
   npx.cmd tsx --test tests/*.test.ts
   ```
   All test suites must pass with zero failures.

4. **Run TypeScript Check & Zero-Emoji Check**:
   ```bash
   npm.cmd run typecheck
   node -e "const fs = require('fs'); const content = fs.readFileSync('src/app/api/truck/records/route.ts', 'utf8'); const r = /[\u{1F300}-\u{1F9FF}\u{1FA00}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F1E6}-\u{1F1FF}]/u; process.exit(r.test(content) ? 1 : 0);"
   ```
   Expected: 0 TypeScript errors, 0 emojis.
