# คู่มือส่งต่องานสำหรับ AI (AI Continuation & Execution Plan)
**โปรเจกต์**: `pphitchaya` — ระบบเช็คชื่อพนักงาน (`/`) + ระบบบันทึกงานรถสิบล้อ (`/truck`) + แจ้งเตือนสรุปรายวันผ่าน LINE Messaging API  
**Workspace**: `c:\Users\tleza\Documents\GitHub\pphitchaya`

---

## 1. สรุปสถานะงานล่าสุด (Current Audit Status)

จากการตรวจสอบโค้ดและชุดทดสอบทั้งหมดในระบบ (`npx.cmd tsc --noEmit` = 0 errors และ `npx.cmd tsx --test "tests/**/*.test.ts"` = 144/144 tests passing) สถานะแบ่งออกเป็นส่วนที่ **เสร็จสมบูรณ์ 100% แล้ว** และส่วนที่ **ยังไม่ได้ทำ / ต้องเก็บรายละเอียดให้ครบตามสเปก** ดังนี้:

### ส่วนที่เสร็จสมบูรณ์แล้ว (100% Completed & Verified)

1. **Wave 1: Core Domain, Database Helpers, LINE Messaging Engine & Design System (`human-ui-design`)**
   - [src/lib/server/repository.ts](file:///c:/Users/tleza/Documents/GitHub/pphitchaya/src/lib/server/repository.ts): เพิ่ม Helper อ้างอิง Firestore สำหรับ `profile/truck`, `profile/line`, `trucks`, `truckOrigins`, `truckDestinations`, `truckMonths`, `records`, และ `truckPhotos` เรียบร้อยแล้ว
   - [next.config.mjs](file:///c:/Users/tleza/Documents/GitHub/pphitchaya/next.config.mjs): เพิ่ม `outputFileTracingIncludes` สำหรับ `/api/truck/reports/export` เพื่อรวมฟอนต์ภาษาไทย `.ttf` และ `pdfkit` บน Vercel เรียบร้อยแล้ว
   - [vercel.json](file:///c:/Users/tleza/Documents/GitHub/pphitchaya/vercel.json) และ [.env.example](file:///c:/Users/tleza/Documents/GitHub/pphitchaya/.env.example): ตั้งค่า Vercel Cron Job `/api/cron/daily-summary` เวลา `0 12 * * *` (19:00 น. เวลาไทย) และตัวแปรสภาพแวดล้อม LINE เรียบร้อยแล้ว
   - **Truck Domain & PDF Engine**:
     - [src/lib/truck/types.ts](file:///c:/Users/tleza/Documents/GitHub/pphitchaya/src/lib/truck/types.ts)
     - [src/lib/truck/engine.ts](file:///c:/Users/tleza/Documents/GitHub/pphitchaya/src/lib/truck/engine.ts)
     - [src/lib/truck/analytics.ts](file:///c:/Users/tleza/Documents/GitHub/pphitchaya/src/lib/truck/analytics.ts)
     - [src/lib/server/truck-pdf.ts](file:///c:/Users/tleza/Documents/GitHub/pphitchaya/src/lib/server/truck-pdf.ts)
   - **LINE Messaging API & Flex Message Engine**:
     - [src/lib/line/client.ts](file:///c:/Users/tleza/Documents/GitHub/pphitchaya/src/lib/line/client.ts)
     - [src/lib/line/flex-templates.ts](file:///c:/Users/tleza/Documents/GitHub/pphitchaya/src/lib/line/flex-templates.ts)
     - [src/lib/line/daily-summary.ts](file:///c:/Users/tleza/Documents/GitHub/pphitchaya/src/lib/line/daily-summary.ts)
     - [src/app/api/line/settings/route.ts](file:///c:/Users/tleza/Documents/GitHub/pphitchaya/src/app/api/line/settings/route.ts)
     - [src/app/api/line/notify/route.ts](file:///c:/Users/tleza/Documents/GitHub/pphitchaya/src/app/api/line/notify/route.ts)
     - [src/app/api/line/webhook/route.ts](file:///c:/Users/tleza/Documents/GitHub/pphitchaya/src/app/api/line/webhook/route.ts)
     - [src/app/api/cron/daily-summary/route.ts](file:///c:/Users/tleza/Documents/GitHub/pphitchaya/src/app/api/cron/daily-summary/route.ts)
   - **Design Tokens & Attendance CSS Polish (`Quiet Operational`)**:
     - [src/styles/tokens.css](file:///c:/Users/tleza/Documents/GitHub/pphitchaya/src/styles/tokens.css) (รองรับ `[data-app-theme="truck"]` โทน Deep Slate-Navy `#0f2942` + Amber `#d97706`)
     - [src/components/shell/shell.module.css](file:///c:/Users/tleza/Documents/GitHub/pphitchaya/src/components/shell/shell.module.css), [src/components/attendance/attendance.module.css](file:///c:/Users/tleza/Documents/GitHub/pphitchaya/src/components/attendance/attendance.module.css), [src/components/reports/reports.module.css](file:///c:/Users/tleza/Documents/GitHub/pphitchaya/src/components/reports/reports.module.css), [src/components/reports/detailed-reports.module.css](file:///c:/Users/tleza/Documents/GitHub/pphitchaya/src/components/reports/detailed-reports.module.css), [src/components/settings/settings.module.css](file:///c:/Users/tleza/Documents/GitHub/pphitchaya/src/components/settings/settings.module.css)
     - ลบ Emoji ออกจากโค้ดเบสทั้งหมด 100% (0 emoji)

2. **Wave 2: Truck App Backend API Routes & Stress Tests (10 Routes + 144 Tests Passing)**
   - [src/app/api/truck/bootstrap/route.ts](file:///c:/Users/tleza/Documents/GitHub/pphitchaya/src/app/api/truck/bootstrap/route.ts)
   - [src/app/api/truck/records/route.ts](file:///c:/Users/tleza/Documents/GitHub/pphitchaya/src/app/api/truck/records/route.ts)
   - [src/app/api/truck/records/[id]/route.ts](file:///c:/Users/tleza/Documents/GitHub/pphitchaya/src/app/api/truck/records/%5Bid%5D/route.ts)
   - [src/app/api/truck/settings/route.ts](file:///c:/Users/tleza/Documents/GitHub/pphitchaya/src/app/api/truck/settings/route.ts)
   - [src/app/api/truck/photos/route.ts](file:///c:/Users/tleza/Documents/GitHub/pphitchaya/src/app/api/truck/photos/route.ts)
   - [src/app/api/truck/photos/[id]/route.ts](file:///c:/Users/tleza/Documents/GitHub/pphitchaya/src/app/api/truck/photos/%5Bid%5D/route.ts)
   - [src/app/api/truck/backup/route.ts](file:///c:/Users/tleza/Documents/GitHub/pphitchaya/src/app/api/truck/backup/route.ts)
   - [src/app/api/truck/reports/route.ts](file:///c:/Users/tleza/Documents/GitHub/pphitchaya/src/app/api/truck/reports/route.ts)
   - [src/app/api/truck/reports/analytics/route.ts](file:///c:/Users/tleza/Documents/GitHub/pphitchaya/src/app/api/truck/reports/analytics/route.ts)
   - [src/app/api/truck/reports/export/route.ts](file:///c:/Users/tleza/Documents/GitHub/pphitchaya/src/app/api/truck/reports/export/route.ts)

3. **Wave 3 (Core): Truck App Frontend & Attendance LINE Integration**
   - Shared LINE UI: [src/components/shared/LineSendButton.tsx](file:///c:/Users/tleza/Documents/GitHub/pphitchaya/src/components/shared/LineSendButton.tsx), [src/components/shared/LineSettings.tsx](file:///c:/Users/tleza/Documents/GitHub/pphitchaya/src/components/shared/LineSettings.tsx)
   - เชื่อมต่อปุ่มส่ง LINE และตั้งค่า LINE ในหน้าเว็บเช็คชื่อเดิม: [src/components/attendance/AttendanceTab.tsx](file:///c:/Users/tleza/Documents/GitHub/pphitchaya/src/components/attendance/AttendanceTab.tsx), [src/components/reports/ReportsTab.tsx](file:///c:/Users/tleza/Documents/GitHub/pphitchaya/src/components/reports/ReportsTab.tsx), [src/components/settings/SettingsTab.tsx](file:///c:/Users/tleza/Documents/GitHub/pphitchaya/src/components/settings/SettingsTab.tsx)
   - หน้าเว็บและคอมโพเนนต์หลักของ Truck App (`/truck`, `/truck/reports`, `/truck/reports/detailed`, `/truck/settings`):
     - [src/components/truck/api.ts](file:///c:/Users/tleza/Documents/GitHub/pphitchaya/src/components/truck/api.ts)
     - [src/components/truck/truck.module.css](file:///c:/Users/tleza/Documents/GitHub/pphitchaya/src/components/truck/truck.module.css)
     - [src/components/truck/PhotoLightbox.tsx](file:///c:/Users/tleza/Documents/GitHub/pphitchaya/src/components/truck/PhotoLightbox.tsx)
     - [src/components/truck/TruckShell.tsx](file:///c:/Users/tleza/Documents/GitHub/pphitchaya/src/components/truck/TruckShell.tsx)
     - [src/components/truck/TruckRecordTab.tsx](file:///c:/Users/tleza/Documents/GitHub/pphitchaya/src/components/truck/TruckRecordTab.tsx)
     - [src/components/truck/TruckReportsTab.tsx](file:///c:/Users/tleza/Documents/GitHub/pphitchaya/src/components/truck/TruckReportsTab.tsx)
     - [src/components/truck/TruckDetailedReports.tsx](file:///c:/Users/tleza/Documents/GitHub/pphitchaya/src/components/truck/TruckDetailedReports.tsx)
     - [src/components/truck/TruckSettingsTab.tsx](file:///c:/Users/tleza/Documents/GitHub/pphitchaya/src/components/truck/TruckSettingsTab.tsx)
     - [src/app/truck/layout.tsx](file:///c:/Users/tleza/Documents/GitHub/pphitchaya/src/app/truck/layout.tsx), [src/app/truck/page.tsx](file:///c:/Users/tleza/Documents/GitHub/pphitchaya/src/app/truck/page.tsx), [src/app/truck/reports/page.tsx](file:///c:/Users/tleza/Documents/GitHub/pphitchaya/src/app/truck/reports/page.tsx), [src/app/truck/reports/detailed/page.tsx](file:///c:/Users/tleza/Documents/GitHub/pphitchaya/src/app/truck/reports/detailed/page.tsx), [src/app/truck/settings/page.tsx](file:///c:/Users/tleza/Documents/GitHub/pphitchaya/src/app/truck/settings/page.tsx)

---

## 2. รายการงานที่ยังไม่เสร็จ / ยังไม่ได้ทำ (Remaining Tasks to Complete)

AI ที่รับช่วงต่อจะต้องดำเนินการ **5 รายการด้านล่างนี้ให้ครบถ้วน**:

### งานที่ 1 (Wave 4 - Task 10): อัปเดตสคริปต์ CLI ทั้ง 3 ไฟล์ (`scripts/setup.ts`, `scripts/seed-demo.ts`, `scripts/backup.ts`)
ปัจจุบันสคริปต์ทั้ง 3 ไฟล์ในโฟลเดอร์ `scripts/` **ยังไม่ได้ถูกแก้ไข** ให้รองรับข้อมูลของ Truck App และ LINE Settings:

1. **ไฟล์ [scripts/setup.ts](file:///c:/Users/tleza/Documents/GitHub/pphitchaya/scripts/setup.ts)**:
   - Import `getTruckProfileRef` และ `getLineSettingsRef` จาก `../src/lib/server/repository`
   - เพิ่มขั้นตอนที่ 4: ตรวจสอบ `getTruckProfileRef(shopId)` หากยังไม่มีเอกสาร ให้สร้างด้วยค่าเริ่มต้น:
     ```ts
     {
       companyName: 'ระบบบันทึกงานรถสิบล้อ',
       revision: 1,
       createdAt: new Date().toISOString(),
       updatedAt: new Date().toISOString()
     }
     ```
   - เพิ่มขั้นตอนที่ 5: ตรวจสอบ `getLineSettingsRef(shopId)` หากยังไม่มีเอกสาร ให้สร้างด้วยค่าเริ่มต้น:
     ```ts
     {
       channelAccessToken: '',
       defaultTargetId: '',
       attendanceTargetId: '',
       truckTargetId: '',
       dailySummaryEnabled: false,
       lastSentDateKey: null,
       revision: 1,
       updatedAt: new Date().toISOString()
     }
     ```

2. **ไฟล์ [scripts/seed-demo.ts](file:///c:/Users/tleza/Documents/GitHub/pphitchaya/scripts/seed-demo.ts)**:
   - Import `getTruckProfileRef`, `getTrucksCol`, `getTruckOriginsCol`, `getTruckDestinationsCol`, `getTruckRecordsCol` จาก `../src/lib/server/repository`
   - ตั้งค่า `profile/truck` (`companyName: 'หจก. ขนส่งตัวอย่าง'`)
   - สร้างข้อมูลรถสิบล้อตัวอย่าง (`trucks`) 2 คัน:
     - `truck_demo_01`: ทะเบียน `'82-4510'`, คนขับ `'สมหมาย สายลุย'`, `status: 'ACTIVE'`, `revision: 1`
     - `truck_demo_02`: ทะเบียน `'83-1029'`, คนขับ `'วิเชียร โชคดี'`, `status: 'ACTIVE'`, `revision: 1`
   - สร้างข้อมูลต้นทางตัวอย่าง (`truckOrigins`) 2 แห่ง:
     - `orig_demo_01`: `'บ่อดินลาดหลุมแก้ว'`
     - `orig_demo_02`: `'ท่าทรายบางปะอิน'`
   - สร้างข้อมูลปลายทางและค่าเที่ยวคนขับ (`truckDestinations`, หน่วยเป็นสตางค์):
     - `dest_demo_01`: ชื่อ `'แพล้นปูนบางใหญ่'`, `driverPaySatang: 35000` (350 บาท)
     - `dest_demo_02`: ชื่อ `'ไซต์งานแจ้งวัฒนะ'`, `driverPaySatang: 45000` (450 บาท)
     - `dest_demo_03`: ชื่อ `'โกดังรังสิต'`, `driverPaySatang: 40000` (400 บาท)
   - สร้างใบงานรายวันตัวอย่าง (`truckMonths/{currentMonth}/records/{dateKey}_{truckId}`) สำหรับวันทำงานในเดือนปัจจุบันจนถึง `todayDate` พร้อมคำนวณ `tripCount` และ `totalDriverPaySatang` ให้ตรงกับผลรวมของ `trips`

3. **ไฟล์ [scripts/backup.ts](file:///c:/Users/tleza/Documents/GitHub/pphitchaya/scripts/backup.ts)**:
   - เพิ่มคอลเลกชันของ Truck App เข้าไปในอาร์เรย์ `collectionsToBackup`:
     ```ts
     const collectionsToBackup = [
       'profile',
       'control',
       'calendarVersions',
       'calendarOverrides',
       'employees',
       'months',
       'closeJobs',
       'requests',
       'audit',
       'trucks',
       'truckOrigins',
       'truckDestinations',
       'truckMonths',
       'truckPhotos'
     ];
     ```
   - สำหรับคอลเลกชันที่มี subcollection (`months` มี `attendance`/`extras`/`advances`/`deductions` และ `truckMonths` มี `records`): ดึงข้อมูลเอกสารใน `truckMonths/{monthKey}/records` เก็บลงใน backup payload ด้วย (เช่น เก็บใน `backupData['truckMonthRecords']` หรือแนบ `records` ในแต่ละเอกสารของ `truckMonths`) เพื่อให้ backup จาก CLI ครบสมบูรณ์เหมือน `/api/truck/backup`

---

### งานที่ 2 (Wave 3 - Task 6 Spec Alignment): แยก `TruckHeader.tsx` และ `TruckBottomNav.tsx`
ตามแผนใน `implementation_plan.md` (Task 6) กำหนดให้แยกคอมโพเนนต์ Header และ Bottom Navigation ของ Truck App ออกเป็นไฟล์ชัดเจน:
1. สร้าง [src/components/truck/TruckHeader.tsx](file:///c:/Users/tleza/Documents/GitHub/pphitchaya/src/components/truck/TruckHeader.tsx) สำหรับแสดง `<header>` ของระบบรถสิบล้อ (ชื่อกิจการ + เมนูบนจอคอมพิวเตอร์ `desktopNav`)
2. สร้าง [src/components/truck/TruckBottomNav.tsx](file:///c:/Users/tleza/Documents/GitHub/pphitchaya/src/components/truck/TruckBottomNav.tsx) สำหรับแสดง `<nav>` แถบเมนูด้านล่างบนมือถือ (`บันทึกงาน`, `รายงาน`, `ตั้งค่า`)
3. อัปเดต [src/components/truck/TruckShell.tsx](file:///c:/Users/tleza/Documents/GitHub/pphitchaya/src/components/truck/TruckShell.tsx) ให้เรียกใช้ `<TruckHeader />` และ `<TruckBottomNav />` แทนการเขียน JSX inline

---

### งานที่ 3 (Wave 3 - Accessibility & UI Polish): เปลี่ยน `window.confirm` ใน `TruckSettingsTab.tsx` เป็น Accessible Modal Dialog
ในไฟล์ [src/components/truck/TruckSettingsTab.tsx](file:///c:/Users/tleza/Documents/GitHub/pphitchaya/src/components/truck/TruckSettingsTab.tsx) บรรทัดที่ 91 และ 110 ปัจจุบันยังใช้ `window.confirm(...)` สำหรับยืนยันการลบข้อมูล (รถ/ปลายทาง/ต้นทาง) และยืนยันการกู้คืนข้อมูลสำรอง (Restore JSON):
- **สิ่งที่ต้องทำ**: เปลี่ยนจาก `window.confirm(...)` มาใช้ Modal Dialog ที่มี `role="dialog"`, `aria-modal="true"`, `data-app-dialog`, และเรียกใช้ `useModalInteraction` จาก [src/components/shared/useModalInteraction.ts](file:///c:/Users/tleza/Documents/GitHub/pphitchaya/src/components/shared/useModalInteraction.ts) เหมือนกับที่ทำไว้ใน [src/components/truck/TruckReportsTab.tsx](file:///c:/Users/tleza/Documents/GitHub/pphitchaya/src/components/truck/TruckReportsTab.tsx) (บรรทัดที่ 162–173) เพื่อให้รองรับการกดปุ่ม `Escape`, การล็อกโฟกัส, และเข้ากับดีไซน์ `human-ui-design` ของระบบ

---

### งานที่ 4 (Auth Token Forward-Compatibility): แนบ `Authorization: Bearer ${idToken}` ใน `api.ts` / `LineSendButton` / `LineSettings`
แม้ปัจจุบัน `verifyOwner(req)` ใน `src/lib/server/auth.ts` จะทำงานแบบ Single-owner mode แต่เพื่อให้รองรับกรณีเปิด `REQUIRE_AUTH` ในอนาคตและสอดคล้องกับหน้าเว็บเดิม:
- ตรวจสอบให้ [src/components/truck/api.ts](file:///c:/Users/tleza/Documents/GitHub/pphitchaya/src/components/truck/api.ts) หรือการเรียก `fetch` ในคอมโพเนนต์สามารถแนบ Header `Authorization: Bearer ${idToken}` (ถ้ามี token จาก Firebase Auth หรือ `auth.currentUser?.getIdToken()`) ได้โดยไม่พังเมื่อไม่มี token

---

### งานที่ 5 (Workspace Cleanup & Final Verification): ลบโฟลเดอร์ชั่วคราว `.agents/` และรัน Production Build
1. **ลบโฟลเดอร์ `.agents/`**: ในขั้นตอนก่อนหน้า Subagent ได้สร้างโฟลเดอร์ชั่วคราว `.agents/` ทิ้งไว้ที่ root ของโปรเจกต์ (`c:\Users\tleza\Documents\GitHub\pphitchaya\.agents\`) ให้ลบโฟลเดอร์ `.agents/` ออกเพื่อไม่ให้ติดไปกับ Git repository
2. **เขียนชุดทดสอบเพิ่มเติมสำหรับ CLI / UI Helpers (ถ้ามี)** และรันชุดทดสอบทั้งหมด
3. **ตรวจสอบ Production Build (`next build`)**:
   - ลบโฟลเดอร์ `.next` เดิมที่อาจติด lock ก่อน: `Remove-Item -Recurse -Force .next -ErrorAction SilentlyContinue`
   - รัน `npx.cmd next build` (หากติด `EPERM: operation not permitted, mkdir .../.next` จาก Windows Sandbox ให้รัน `npx.cmd next build` ด้วย `BypassSandbox: true`)

---

## 3. กฎเหล็ก ข้อบังคับ สิ่งที่ต้องทำ และสิ่งที่ห้ามทำเด็ดขาด (Strict Rules, DOs & DO NOTs)

### กฎเหล็ก (Mandatory Rules)

1. **แยกเว็บเด็ดขาด 100% (Strict Dual-Web Separation)**
   - **ต้องทำ**: เว็บเช็คชื่ออยู่ที่ `/`, `/reports`, `/reports/detailed`, `/settings` และเว็บรถสิบล้ออยู่ที่ `/truck`, `/truck/reports`, `/truck/reports/detailed`, `/truck/settings`
   - **ห้ามทำเด็ดขาด**: **ห้ามมีปุ่มสลับเว็บ ลิงก์ แบนเนอร์ หรือเมนูข้ามไปมาระหว่างเว็บเช็คชื่อ (`/`) กับเว็บรถสิบล้อ (`/truck`) บนหน้าจอ UI เด็ดขาด** ผู้ใช้จะเข้าแต่ละเว็บผ่าน URL ของใครของมันเท่านั้น

2. **ห้ามใช้ Emoji เด็ดขาด (Zero Emoji Rule - `human-ui-design`)**
   - **ต้องทำ**: ใช้เฉพาะไอคอน SVG จาก `lucide-react` เท่านั้น (เช่น `Truck`, `ClipboardList`, `ChartNoAxesCombined`, `Settings`, `Send`, `Plus`, `Trash2`, `Pencil`, `Camera`, `FileDown`, `FileSpreadsheet`, `CheckCircle2`, `AlertCircle`)
   - **ห้ามทำเด็ดขาด**: ห้ามใส่ตัวอักษร Emoji (เช่น `🚛`, `✅`, `💡`, `📊`, `⚙️`, `❌`, `📸`) ลงในไฟล์ `.ts`, `.tsx`, `.css`, ข้อความแจ้งเตือน, PDF, หรือข้อความส่ง LINE ทุกจุด

3. **การคำนวณเงินต้องเป็นหน่วยสตางค์จำนวนเต็มเท่านั้น (Integer Satang Rule)**
   - **ต้องทำ**: เก็บและคำนวณเงินทุกชนิด (ค่าเที่ยวคนขับ `driverPaySatang`, ค่าน้ำมัน `fuelCostSatang`, ต้นทุนรวม `totalCostSatang`) เป็น **จำนวนเต็มสตางค์ (`1 บาท = 100 สตางค์`)** โดยใช้ฟังก์ชัน `moneySatang()`, `formatMoney()`, `satangToDecimalString()` จาก [src/lib/payroll/money.ts](file:///c:/Users/tleza/Documents/GitHub/pphitchaya/src/lib/payroll/money.ts) และ `optionalMoney()` จาก [src/lib/client/form-money.ts](file:///c:/Users/tleza/Documents/GitHub/pphitchaya/src/lib/client/form-money.ts)
   - **ห้ามทำเด็ดขาด**: ห้ามใช้ `parseFloat()` คูณ/บวกเงินเป็นทศนิยมโดยตรง หรือเก็บค่าเงินเป็นบาททศนิยมลงใน Firestore

4. **กฎ Firestore Transaction: อ่านทั้งหมดก่อนเขียน (Read-Before-Write Rule)**
   - **ต้องทำ**: ใน `db.runTransaction(async (tx) => { ... })` ทุกจุด ต้องเรียก `await tx.get(...)` หรือ `await tx.getAll(...)` ให้ครบทุกเอกสารก่อน แล้วจึงเรียก `tx.set(...)`, `tx.update(...)`, หรือ `tx.delete(...)`
   - **ห้ามทำเด็ดขาด**: ห้ามเรียก `tx.get(...)` หลังจากที่มีการเรียก `tx.set`/`tx.update`/`tx.delete` ไปแล้วใน Transaction เดียวกัน เพราะทั้ง Cloud Firestore จริงและ Mock Firestore ในชุดทดสอบจะโยน Error ทันที

5. **กฎการออกแบบ UI (`human-ui-design` — Quiet Operational)**
   - **ต้องทำ**:
     - ใช้ฟอนต์ `Sarabun` และ Design Tokens จาก [src/styles/tokens.css](file:///c:/Users/tleza/Documents/GitHub/pphitchaya/src/styles/tokens.css)
     - คอนเทนเนอร์หลักของ Truck App ต้องระบุ `data-app-theme="truck"` เพื่อให้แสดงสี Header เป็น Deep Slate-Navy (`#0f2942`) และสีเน้นเป็น Amber (`#d97706`)
     - ปุ่มกดและช่องกรอกข้อมูลบนมือถือต้องมีความสูงอย่างน้อย `3rem` (`48px`) และ `font-size: 1rem` (`16px`) เพื่อป้องกัน iOS Safari ซูมหน้าจออัตโนมัติ
     - ตัวเลขการเงินทุกจุดต้องใช้ `font-variant-numeric: tabular-nums`
   - **ห้ามทำเด็ดขาด**:
     - ห้ามใช้พื้นหลังไล่สีรุ้ง (Rainbow gradients) หรือเงาฟุ้งเรืองแสงแบบ AI template
     - ห้ามซ้อนการ์ดในกรอบการ์ดเกิน 2 ชั้น (No nested cards-in-cards)
     - ห้ามติดตั้งไลบรารี UI หรือไลบรารีกราฟเพิ่ม (เช่น `recharts`, `chart.js`, `mui`, `tailwind`) ให้ใช้ CSS Modules + SVG แบบเดียวกับที่มีอยู่ในโปรเจกต์

6. **กฎการรันคำสั่งบน Windows PowerShell**
   - **ต้องทำ**: ใช้ `npx.cmd` และ `npm.cmd` เสมอ (เช่น `npx.cmd tsc --noEmit`, `npx.cmd tsx --test "tests/**/*.test.ts"`, `npx.cmd next build`)
   - **ห้ามทำเด็ดขาด**: ห้ามรัน `npx` หรือ `npm` เปล่าๆ ใน PowerShell เพราะติดนโยบาย `Execution_Policies` ของ Windows สำหรับไฟล์ `.ps1`

---

## 4. ขอบเขตไฟล์ที่อนุญาตให้แก้ไข และไฟล์ที่ห้ามทำให้พัง (Scope Boundaries)

### ไฟล์ที่ต้องสร้างหรือแก้ไขในรอบสุดท้ายนี้:
- `scripts/setup.ts` (แก้ไขเพื่อเพิ่ม `profile/truck` และ `profile/line`)
- `scripts/seed-demo.ts` (แก้ไขเพื่อเพิ่มข้อมูลตัวอย่างของรถสิบล้อ)
- `scripts/backup.ts` (แก้ไขเพื่อสำรองคอลเลกชันของรถสิบล้อ)
- `src/components/truck/TruckHeader.tsx` (สร้างใหม่ แยกจาก `TruckShell.tsx`)
- `src/components/truck/TruckBottomNav.tsx` (สร้างใหม่ แยกจาก `TruckShell.tsx`)
- `src/components/truck/TruckShell.tsx` (อัปเดตให้ใช้ `TruckHeader` และ `TruckBottomNav`)
- `src/components/truck/TruckSettingsTab.tsx` (เปลี่ยน `window.confirm` เป็น Accessible Modal Dialog พร้อม `useModalInteraction`)
- `tests/` (เพิ่มหรืออัปเดตการทดสอบหากจำเป็น โดยต้องรักษาให้ 144+ tests ผ่านทั้งหมด)

### ไฟล์ระบบเดิมที่ห้ามลบหรือทำให้ Logic เดิมพังเด็ดขาด (Protected Core Files):
- `src/lib/payroll/*` (`engine.ts`, `money.ts`, `dates.ts`, `close-month.ts`, `analytics.ts`, `types.ts`)
- `src/lib/server/pdf.ts` (ระบบสร้าง PDF สลิปเงินเดือนเดิม)
- `src/app/api/attendance/*`, `src/app/api/employees/*`, `src/app/api/reports/*`, `src/app/api/settings/*`, `src/app/api/bootstrap/*`
- ชุดทดสอบเดิมทั้งหมดใน `tests/` (`tests/payroll-engine.test.ts`, `tests/mutation-routes.test.ts`, `tests/reports-route.test.ts`, `tests/ui-regressions.test.ts`, `tests/pdf-export.test.ts` ฯลฯ)

---

## 5. ขั้นตอนการตรวจสอบก่อนส่งมอบงาน (Verification Checklist for AI)

เมื่อ AI ดำเนินการแก้ไขครบทั้ง 5 งานข้างต้นแล้ว **ต้องรันคำสั่งตรวจสอบตามลำดับนี้และยืนยันผลลัพธ์จริงก่อนจบงาน**:

```powershell
# 1. ลบโฟลเดอร์ชั่วคราว .agents (ถ้ายังมีอยู่)
Remove-Item -Recurse -Force .agents -ErrorAction SilentlyContinue

# 2. ตรวจสอบว่าไม่มี Emoji หลงเหลือใน src/ และ scripts/
npx.cmd tsx -e "const fs=require('fs'),path=require('path');const re=/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u;function walk(d){for(const f of fs.readdirSync(d,{withFileTypes:true})){const p=path.join(d,f.name);if(f.isDirectory())walk(p);else if(/\.(ts|tsx|css)$/.test(f.name)){const c=fs.readFileSync(p,'utf8');if(re.test(c)){console.error('EMOJI FOUND:',p);process.exit(1);}}}}walk('src');walk('scripts');console.log('ZERO EMOJI VERIFIED');"

# 3. ตรวจสอบ TypeScript Typecheck (ต้องได้ 0 errors)
npx.cmd tsc --noEmit

# 4. รันชุดทดสอบทั้งหมด (ต้องผ่าน 100% ทุกไฟล์ ไม่มี fail)
npx.cmd tsx --test "tests/**/*.test.ts"

# 5. ทดสอบ Production Build ของ Next.js
Remove-Item -Recurse -Force .next -ErrorAction SilentlyContinue
npx.cmd next build
```
*(หมายเหตุ: หากคำสั่ง `npx.cmd next build` ใน Sandbox ติด `EPERM: operation not permitted, mkdir ...\.next` บน Windows ให้ขอรันเฉพาะคำสั่ง `npx.cmd next build` ด้วย `BypassSandbox: true`)*
