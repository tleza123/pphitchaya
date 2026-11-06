# Handoff Report: Defect 2 Investigation in Truck Photos API (`src/app/api/truck/photos/route.ts`)

## 1. Observation

### 1.1 Source Location
In `src/app/api/truck/photos/route.ts` lines 46-71:
```ts
46:     const initialImage = sharp(inputBuffer);
47:     const initialMeta = await initialImage.metadata();
48: 
49:     if (!initialMeta.width || !initialMeta.height || initialMeta.width * initialMeta.height > 30_000_000) {
50:       return createErrorResponse('INVALID_INPUT', 'ความละเอียดของรูปภาพสูงเกินไป', 422);
51:     }
52: 
53:     // Process image with sharp: auto-rotate, resize within 1280x1280, webp quality 78
54:     let webpBuffer = await sharp(inputBuffer)
55:       .rotate()
56:       .resize(1280, 1280, { fit: 'inside', withoutEnlargement: true })
57:       .webp({ quality: 78 })
58:       .toBuffer();
59: 
60:     // Enforce 250KB limit: adaptive compression if needed
61:     if (webpBuffer.length > 250 * 1024) {
62:       webpBuffer = await sharp(inputBuffer)
63:         .rotate()
64:         .resize(1024, 1024, { fit: 'inside', withoutEnlargement: true })
65:         .webp({ quality: 60 })
66:         .toBuffer();
67:     }
68: 
69:     if (webpBuffer.length > 250 * 1024) {
70:       return createErrorResponse('INVALID_INPUT', 'ขนาดรูปภาพเกินกำหนด 250 KB หลังการบีบอัด', 422);
71:     }
```

### 1.2 Verbatim Defect Behavior from Challenger 1 Test
Running:
```bash
npx.cmd tsx --test tests/challenger-truck-crud-stress.test.ts
```
Observed verbatim output for Corrupted Buffer Upload:
```
Empirical Corrupted Buffer Upload Result: {
  status: 500,
  ok: false,
  errorCode: 'INTERNAL_ERROR',
  errorMessage: 'Input buffer contains unsupported image format'
}
✔ Photo Limits [VULNERABILITY CHECK]: Corrupted non-image buffer upload to /api/truck/photos (5.9615ms)
```

### 1.3 Empirical Reproduction and Failure Modes
Testing various corrupted and partial buffers in Node.js revealed two distinct failure modes:
1. **Completely invalid / non-image input** (e.g. `Buffer.from('NOT_AN_IMAGE_RANDOM_CORRUPTED_BYTES_1234567890')`, plain text, PDF, HTML):
   - `initialImage.metadata()` immediately throws:
     `Error: Input buffer contains unsupported image format`
   - Falls directly into line 102 top-level catch block and returns HTTP 500 `INTERNAL_ERROR`.
2. **Truncated image streams with intact headers** (e.g. truncated JPEG upload of 280 bytes):
   - `initialImage.metadata()` succeeds because image dimensions and EXIF headers are present.
   - However, `sharp(inputBuffer)...toBuffer()` at line 54 throws during pixel decoding/rasterization:
     `Error: VipsJpeg: Premature end of input file`
   - If only line 47 is wrapped in `try/catch`, this second failure mode still falls into line 102 and returns HTTP 500 `INTERNAL_ERROR`.

---

## 2. Logic Chain

1. **Root Cause**:
   - `sharp(inputBuffer).metadata()` and `sharp(inputBuffer)...toBuffer()` do not catch format, header, or stream decoding exceptions locally.
   - Because no localized `try/catch` exists around image decoding, any library error thrown by Sharp bubbles directly up to the top-level route catch block (`lines 102-105`), which converts unhandled errors without a custom status code into `HTTP 500 INTERNAL_ERROR`.
2. **Standard API Protocol**:
   - Per `ORIGINAL_REQUEST.md`, `PROJECT.md`, and `src/lib/server/errors.ts`, client-supplied invalid or corrupted input must return `HTTP 422 INVALID_INPUT` with an informative Thai error message (`createErrorResponse('INVALID_INPUT', 'ไฟล์รูปภาพไม่ถูกต้องหรือไม่รองรับ', 422)`).
3. **Scope of Protection**:
   - If only `metadata()` (lines 46-47) is wrapped in `try/catch` (Option 1), complete non-image buffers are caught, but truncated image streams that parse metadata but fail during rasterization still escape and trigger HTTP 500.
   - By wrapping the decoding and transformation pipeline (lines 46-68) in a single unified `try/catch` block (Option 2), ALL decoding, header corruption, and rasterization failures from malformed client input are caught and converted to HTTP 422 `INVALID_INPUT`.
   - Normal return statements (e.g., resolution check `!initialMeta.width || ... > 30_000_000` returning `422 ความละเอียดของรูปภาพสูงเกินไป`) exit the route immediately and do not trigger the catch block.
4. **Format Compatibility**:
   - Valid JPEG, PNG, and WebP images process cleanly through `sharp().rotate().resize(...).webp()`.
   - Post-compression WebP size checks (`> 250 KB`) remain fully operative.
5. **Zero Emoji Compliance**:
   - Error message `'ไฟล์รูปภาพไม่ถูกต้องหรือไม่รองรับ'` was audited with regex `[\u{1F300}-\u{1F9FF}\u{1FA00}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F1E6}-\u{1F1FF}]` and confirmed to contain exactly 0 emojis.

---

## 3. Caveats

- **libvips Error Messages**: Sharp relies on `libvips`. Error messages can vary between platforms and formats (`Input buffer contains unsupported image format`, `VipsJpeg: Premature end of input file`, `Input buffer has corrupt header`). A catch block that catches all decoding errors without string-matching specific English error phrases is resilient against library version changes.
- **Scope Boundary**: In-place edits are restricted to `src/app/api/truck/photos/route.ts`. The employee photo upload endpoint (`src/app/api/employees/[id]/photo/route.ts`) exhibits a similar pattern, but is outside the scope of Wave 2 Truck App remediation.

---

## 4. Conclusion & Proposed Fix

### 4.1 Recommended Implementation (Option 2: Comprehensive Protection)
In `src/app/api/truck/photos/route.ts`, replace lines 46-68 with the following snippet:

```ts
    let initialMeta: sharp.Metadata;
    let webpBuffer: Buffer;

    try {
      const initialImage = sharp(inputBuffer);
      initialMeta = await initialImage.metadata();

      if (!initialMeta.width || !initialMeta.height || initialMeta.width * initialMeta.height > 30_000_000) {
        return createErrorResponse('INVALID_INPUT', 'ความละเอียดของรูปภาพสูงเกินไป', 422);
      }

      // Process image with sharp: auto-rotate, resize within 1280x1280, webp quality 78
      webpBuffer = await sharp(inputBuffer)
        .rotate()
        .resize(1280, 1280, { fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 78 })
        .toBuffer();

      // Enforce 250KB limit: adaptive compression if needed
      if (webpBuffer.length > 250 * 1024) {
        webpBuffer = await sharp(inputBuffer)
          .rotate()
          .resize(1024, 1024, { fit: 'inside', withoutEnlargement: true })
          .webp({ quality: 60 })
          .toBuffer();
      }
    } catch {
      return createErrorResponse('INVALID_INPUT', 'ไฟล์รูปภาพไม่ถูกต้องหรือไม่รองรับ', 422);
    }
```

### 4.2 Alternative Minimal Implementation (Option 1: Metadata-Only)
If the implementer strictly restricts changes to lines 46-47:

```ts
    let initialMeta: sharp.Metadata;
    try {
      const initialImage = sharp(inputBuffer);
      initialMeta = await initialImage.metadata();
    } catch {
      return createErrorResponse('INVALID_INPUT', 'ไฟล์รูปภาพไม่ถูกต้องหรือไม่รองรับ', 422);
    }
```
*Note*: Option 1 leaves line 54 unprotected against truncated image stream errors. Option 2 is strongly recommended.

### 4.3 Corresponding Test Assertion in `tests/challenger-truck-crud-stress.test.ts`
Update lines 636-647 to assert HTTP 422:

```ts
  const body = await res.json();
  assert.equal(res.status, 422, 'Corrupted buffer must return HTTP 422');
  assert.equal(body.ok, false);
  assert.equal(body.error?.code, 'INVALID_INPUT');
  assert.equal(body.error?.message, 'ไฟล์รูปภาพไม่ถูกต้องหรือไม่รองรับ');
```

---

## 5. Verification Method

To independently verify after implementation:

1. **Verify TypeScript Compilation**:
   ```bash
   npm.cmd run typecheck
   ```
   Must pass with 0 errors (`tsc --noEmit` exit code 0).

2. **Verify Challenger Stress Test**:
   ```bash
   npx.cmd tsx --test tests/challenger-truck-crud-stress.test.ts
   ```
   Must show 10 passing tests with `Corrupted buffer upload to /api/truck/photos` returning HTTP 422.

3. **Verify Standard Truck Route Tests**:
   ```bash
   npx.cmd tsx --test tests/truck-routes.test.ts
   ```
   Must show all 6 suites passing, confirming valid JPEG, PNG, and WebP processing is intact.

4. **Verify Zero-Emoji Compliance**:
   ```bash
   node -e "const fs = require('fs'); const content = fs.readFileSync('src/app/api/truck/photos/route.ts', 'utf8'); const r = /[\u{1F300}-\u{1F9FF}\u{1FA00}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F1E6}-\u{1F1FF}]/u; let cnt=0; content.split('\n').forEach((l, i) => { if (r.test(l)) { console.log(i+1, l); cnt++; } }); console.log('Total emojis:', cnt); process.exit(cnt === 0 ? 0 : 1);"
   ```
   Expected output: `Total emojis: 0`.
