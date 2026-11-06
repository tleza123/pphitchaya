# รายงานผลการสำรวจสถาปัตยกรรมและข้อกำหนดระบบงานรถสิบล้อ (Truck App Survey Report)

## 1. Observation (ข้อสังเกตและหลักฐานเชิงประจักษ์)

จากการตรวจสอบไฟล์ต้นฉบับและเอกสารอ้างอิง พบข้อเท็จจริงเชิงประจักษ์ดังต่อไปนี้:

### 1.1 Scratch Truck App (Vue 3 + Dexie.js / IndexedDB)
- **ตำแหน่งไฟล์:** `c:\Users\tleza\.gemini\antigravity\scratch\truck-app\index.html` (ความยาว 1,378 บรรทัด)
- **โครงสร้างข้อมูลใน IndexedDB (`TruckLogAppDB_v4`, บรรทัด 806-812):**
  ```js
  db.version(1).stores({
    destinations: '++id, name, driverPay',
    origins: '++id, name',
    trucks: '++id, plateNumber, driverName',
    records: '++id, date, truckId, fuelCost'
  });
  ```
- **กระบวนการทำงานหน้าบันทึกเที่ยววิ่ง (`TAB 1: record`, บรรทัด 95-346, 829-845, 883-1044):**
  - ฟอร์มประกอบด้วย: `date` (YYYY-MM-DD), `truckId`, `trips[]`, `fuelCost` (บาท), `images[]`
  - รายการเที่ยววิ่ง (`trips[]`) รองรับหลายเที่ยวต่อวัน (กดปุ่มเพิ่มเที่ยวได้เรื่อยๆ):
    - `fromLocation`: เลือกจากรายการ `origins`
    - `destinationMode`: เลือกจากรายการ `destinations` (`DEST_<id>`) หรือเลือก `__OTHER__`
    - กรณีเลือก `__OTHER__` (บรรทัด 207-233): แสดงช่องกรอก `customDestination` (ข้อความ) และ `customDriverPay` (ตัวเลขบาท)
    - `driverPay`: คำนวณอัตโนมัติตามปลายทางที่เลือก หรือดึงจาก `customDriverPay`
    - `note`: หมายเหตุเพิ่มเติม เช่น เลขที่ใบส่งของ, น้ำหนักบรรทุก
  - การจัดการรูปภาพหลักฐาน (บิลน้ำมัน / ใบส่งสินค้า, บรรทัด 273-324, 919-970):
    - บีบอัดรูปฝั่งไคลเอนต์ด้วย HTML5 `<canvas>` (บรรทัด 927-954)
    - ปรับขนาด `maxDim = 1280px` โดยรักษา Aspect Ratio
    - แปลงเป็น Data URL ฟอร์แมต `image/webp` ที่คุณภาพ `0.8`
    - คำนวณขนาดไฟล์ `sizeKb = Math.round((webpDataUrl.length * 3 / 4) / 1024)`
    - แสดงภาพตัวอย่างแบบ Thumbnail ตารางกริด พร้อมปุ่มกากบาทลบรูป และป้ายบอกขนาด KB
- **กระบวนการทำงานหน้ารายงาน (`TAB 2: report`, บรรทัด 352-540, 1128-1225):**
  - ตัวกรอง: เลือกเดือน/ปี (`YYYY-MM`) และเลือกรถสิบล้อ (`ALL` หรือตาม `truckId`)
  - การ์ดภาพรวมประจำเดือน (3 KPIs, บรรทัด 389-416):
    - จำนวนเที่ยววิ่งทั้งหมด (`totalTrips`)
    - เงินที่คนขับได้รวม (`totalDriverPay`)
    - ค่าน้ำมันที่ใช้รวม (`totalFuelCost`)
  - ตารางสรุปแยกตามคันรถ (`perTruckSummary`, บรรทัด 419-464, 1157-1197): ทะเบียนรถ, คนขับประจำ, วิ่งเดือนนี้ (เที่ยว), คนขับได้ (บาท), ใช้น้ำมัน (บาท)
  - รายการประวัติใบงานประจำวัน (`filteredRecords`, บรรทัด 466-539): วันที่ภาษาไทย, ทะเบียนรถ, รายการเที่ยววิ่ง (ต้นทาง -> ปลายทาง, ค่าเที่ยว, หมายเหตุ), ยอดค่าน้ำมัน, รูปขนาดย่อกดเปิด Lightbox Modal (บรรทัด 773-788), และปุ่มลบใบงาน
  - การส่งออก CSV (บรรทัด 1200-1225): มี UTF-8 BOM `\uFEFF` ป้องกันภาษาไทยเพี้ยนใน Excel คอลัมน์: `วันที่,ทะเบียนรถ,เที่ยวที่,ต้นทาง,ปลายทาง,เงินคนขับได้(บาท),ค่าน้ำมัน(บาท),หมายเหตุ`
- **กระบวนการทำงานหน้าตั้งค่า (`TAB 3: settings`, บรรทัด 546-741, 1054-1110, 1228-1321):**
  - จัดการสถานที่ปลายทาง & ค่าเที่ยว: ฟอร์มเพิ่ม (`name`, `driverPay`), รายการพร้อมปุ่มลบ
  - จัดการสถานที่ต้นทาง: ฟอร์มเพิ่ม (`name`), รายการพร้อมปุ่มลบ
  - จัดการข้อมูลรถสิบล้อ & คนขับ: ฟอร์มเพิ่ม (`plateNumber`, `driverName`), รายการพร้อมปุ่มลบ
  - สำรองและกู้คืนข้อมูล: ส่งออก JSON (`exportBackupJSON`), นำเข้า JSON (`importBackupJSON`), และโหลดข้อมูลตัวอย่าง (`resetDemoData`)

---

### 1.2 แผนปฏิบัติการ (Implementation Plan) & Original User Request
- **ตำแหน่งไฟล์:**
  - `C:\Users\tleza\.gemini\antigravity\brain\efc1fb76-b98e-49a1-a1f9-a19ca35cf399\implementation_plan.md`
  - `c:\Users\tleza\Documents\GitHub\pphitchaya\.agents\teamwork\ORIGINAL_REQUEST.md`
- **ข้อกำหนดหลัก 4 ข้อ (R1 - R4):**
  1. **R1 (แยก URL Path & UI 100%):**
     - เว็บเช็คชื่อ: `/`, `/reports`, `/reports/detailed`, `/settings`
     - เว็บรถสิบล้อ: `/truck`, `/truck/reports`, `/truck/reports/detailed`, `/truck/settings`
     - ห้ามมีปุ่มหรือลิงก์เชื่อมข้ามหากันบน UI เด็ดขาด
  2. **R2 (จัดเก็บข้อมูลบน Firebase Cloud Firestore):**
     - โครงสร้างคอลเลกชันภายใต้ `shops/{shopId}` (ไม่ใช่ IndexedDB ในเบราว์เซอร์อีกต่อไป)
     - 1 วันต่อ 1 คัน มี 1 ใบงานเท่านั้น: รหัสเอกสารรูปแบบ `{dateKey}_{truckId}` (เช่น `2026-09-14_truck_1`)
     - Auto-load: เมื่อเลือกวันที่และคันเดิม ระบบต้องดึงข้อมูลเดิมขึ้นมาให้แก้ไข/เพิ่มเที่ยววิ่งต่อได้ทันที
     - Integer Satang: คิดเงินระดับจำนวนเต็มสตางค์ทุกจุด
     - รูปบิล WebP: ย่อขนาด client-side ด้วย canvas + server-side ด้วย `sharp` เก็บใน `shops/{shopId}/truckPhotos/{photoId}` (ไม่เกิน 250 KB/รูป, สูงสุด 5 รูปต่อใบงาน)
     - รายงาน PDF, CSV Export, และกราฟ SVG วิเคราะห์รายวัน/รายเดือน/รายปี
  3. **R3 (Quiet Operational Design Tokens & Zero Emoji):**
     - ฟอนต์ Sarabun, tokens.css เดียวกัน
     - เช็คชื่อ = น้ำเงินเข้ม `#003566` คาดทอง `#FFC300`
     - รถสิบล้อ = น้ำเงินเข้มอมเทา `#0F2942` คาดส้มอำพัน `#D97706`
     - Zero Emoji: ลบอิโมจิใน `SettingsTab.tsx` บรรทัด 1380 (`💡`) และ 1384 (`✅`)
  4. **R4 (LINE Messaging API Flex Message):**
     - Cron ส่งอัตโนมัติ 19:00 น. (12:00 UTC) ผ่าน `/api/cron/daily-summary`
     - ปุ่มกดส่งเอง "ส่งสรุปวันนี้เข้า LINE" ในหน้าเว็บทั้งสองระบบ
     - ส่งเป็น 2 Bubble cards แยกชัดเจน (เช็คชื่อ + รถสิบล้อ)

---

### 1.3 โค้ดและฟังก์ชันเดิมในโปรเจกต์ `pphitchaya`
- **การจัดการเงิน (`src/lib/payroll/money.ts`):**
  - มีฟังก์ชัน `moneySatang(text)` (ตรวจสอบ regex `^(0|[1-9]\d{0,6})(\.\d{1,2})?$`, แปลงเป็นจำนวนเต็มสตางค์ `0 - 100,000,000`)
  - มีฟังก์ชัน `validateSatang(amount)` และ `formatMoney(satang)` (จัดรูปแบบทศนิยม 2 ตำแหน่งพร้อมเครื่องหมายจุลภาค)
  - มีฟังก์ชัน `satangToDecimalString(satang)`
- **การจัดการวันที่ (`src/lib/payroll/dates.ts`):**
  - มี `getBangkokToday()`, `getBangkokMonth()`, `formatThaiDate()`, `formatThaiMonth()`, `dateKey()`, `monthKey()`
- **กฎ Firestore Transactions ในชุดทดสอบ (`tests/attendance-route.test.ts:35`):**
  - มีการตรวจสอบอย่างเข้มงวด: `assert.equal(staged.length, 0, 'All transaction reads must precede writes')` บังคับใช้กฎ Strict Read-Before-Write
- **การจัดการรูปภาพพนักงาน (`src/app/api/employees/[id]/photo/route.ts`):**
  - จัดเก็บ Base64 ลง Firestore โดยตรง ไม่พึ่งพา Firebase Storage Bucket (Spark Plan 100% ฟรี)
  - บีบอัดรูปด้วย `sharp` ป้องกันขนาดเกินโควตา

---

## 2. Logic Chain (ลำดับการวิเคราะห์และข้อสรุปเชิงตรรกะ)

```
[Observation 1.1: Scratch Truck App ใช้ Dexie.js เก็บข้อมูลในเครื่อง]
       +
[Observation 1.2: Requirement R2 ต้องการย้ายขึ้น Cloud Firestore ภายใต้ shops/{shopId}]
       ↓
[Step 1: ต้องแปลง Data Models จาก IndexedDB Auto-Increment ID เป็น Firestore Document IDs และ Subcollections]
  - destinations → shops/{shopId}/truckDestinations/{destId}
  - origins → shops/{shopId}/truckOrigins/{originId}
  - trucks → shops/{shopId}/trucks/{truckId}
  - records → shops/{shopId}/truckMonths/{monthKey}/records/{dateKey}_{truckId}
  - images → shops/{shopId}/truckPhotos/{photoId}
       ↓
[Observation 1.1 & 1.2: ค่าน้ำมันและค่าเที่ยวคนขับเดิมเป็น Floating-point บาท]
       +
[Observation 1.3: pphitchaya บังคับใช้ Integer Satang ทั่วทั้งระบบ]
       ↓
[Step 2: ต้องเปลี่ยนชนิดข้อมูลตัวเลขเงินทั้งหมดเป็นหน่วยสตางค์ (driverPaySatang, fuelCostSatang, totalDriverPaySatang)]
  - รับค่าจาก Input ด้วย `moneySatang()` หรือ `optionalMoney()`
  - ตรวจสอบความถูกต้องด้วย `validateSatang()`
  - คำนวณผลรวมรายวัน: `totalDriverPaySatang = trips.reduce(...)`
  - แสดงผลด้วย `formatMoney(satang)`
       ↓
[Observation 1.1: Scratch App อนุญาตให้บันทึกใบงานซ้ำวันที่และคันเดิมเป็นแถวใหม่ใน DB]
       +
[Observation 1.2: Requirement กำหนดให้ 1 วันต่อ 1 คัน มีเพียง 1 ใบงานเท่านั้น {dateKey}_{truckId}]
       ↓
[Step 3: ออกแบบสถาปัตยกรรม Auto-Load & In-place Edit]
  - เมื่อผู้ใช้เปลี่ยน Date หรือ Truck ในหน้า `/truck`:
    1. ทำการค้นหาในแคชของเดือนปัจจุบันว่ามี `{dateKey}_{truckId}` หรือไม่
    2. ถ้ามี: เปลี่ยนสถานะเป็น "กำลังแก้ไขข้อมูลที่บันทึกไว้ของวันนี้", โหลด `trips`, `fuelCostSatang`, `photos` เดิมขึ้นมา
    3. เมื่อกดบันทึก: ยิง `POST/PUT /api/truck/records` พร้อม `expectedRevision` และ `requestId` เพื่อทำ Transaction Update
    4. ถ้าไม่มี: เริ่มต้นด้วย Trip 1 ว่างเปล่า พร้อมบันทึกเป็นเอกสารใหม่ (Revision 1)
  - ในหน้า `/truck/reports`: เมื่อกดปุ่ม "แก้ไข" จากรายการประวัติ ให้เรียก `onEditRecord(dateKey, truckId)` เพื่อสลับแท็บกลับไปที่ `/truck` พร้อมตั้งค่า Date และ Truck อัตโนมัติ
       ↓
[Observation 1.1: รูปภาพใน Scratch เก็บเป็น WebP DataURL ฝังใน Record โดยตรง]
       +
[Observation 1.2: Firestore มีขีดจำกัดขนาดเอกสารไม่เกิน 1 MB ต่อ Document]
       ↓
[Step 4: แยกการจัดเก็บรูปภาพเป็นคอลเลกชัน `truckPhotos` ต่างหาก]
  - ไคลเอนต์ย่อรูปด้วย Canvas เป็น WebP (maxDim 1280, quality 0.78)
  - อัปโหลดขึ้น `/api/truck/photos` โดยฝั่งเซิร์ฟเวอร์ใช้ `sharp` ตรวจสอบและบีบอัดซ้ำ (ขนาด <= 250 KB)
  - เก็บข้อมูล Base64 ใน `shops/{shopId}/truckPhotos/{photoId}`
  - ในเอกสาร `records/{dateKey}_{truckId}` จะเก็บเฉพาะ Array ของ `TruckPhotoMeta` (`{ photoId, sizeKb, width, height, contentType: 'image/webp', createdAt }`) สูงสุด 5 รูป (รวมไม่เกิน ~2 KB)
       ↓
[Observation 1.2: R1 กำหนดให้แยก URL Path 100% ไม่มีลิงก์ข้ามหากัน]
       ↓
[Step 5: สร้าง Truck App Shell และชุด Route Pages แยกจากระบบเช็คชื่อพนักงาน]
  - Shell แยกต่างหาก: `TruckShell.tsx`, `TruckHeader.tsx`, `TruckBottomNav.tsx`
  - Theme สไตล์ Quiet Operational ด้วยตัวแปร `[data-app-theme="truck"]`: แถบหัวสี `#0F2942` คาดสี `#D97706`
  - Pages: `/truck`, `/truck/reports`, `/truck/reports/detailed`, `/truck/settings`
```

---

## 3. ตารางเปรียบเทียบและการจับคู่โครงสร้างข้อมูล (Data Model Mapping)

### 3.1 การจับคู่ Data Models: IndexedDB (Scratch) vs Cloud Firestore (Target)

| Entity | IndexedDB (Scratch App) | Cloud Firestore (pphitchaya Target) | หมายเหตุและการเปลี่ยนแปลง |
|---|---|---|---|
| **รถสิบล้อ (Trucks)** | `trucks` table:<br>`id` (auto-inc)<br>`plateNumber`<br>`driverName` | `shops/{shopId}/trucks/{truckId}`:<br>`truckId: string`<br>`plateNumber: string`<br>`driverName: string`<br>`notes?: string`<br>`status: 'ACTIVE' \| 'SUSPENDED'`<br>`revision: number`<br>`createdAt: string`<br>`updatedAt: string` | เพิ่มสถานะ `status` รองรับการพักรถชั่วคราว, เพิ่ม `revision` และ timestamps |
| **สถานที่ต้นทาง (Origins)** | `origins` table:<br>`id` (auto-inc)<br>`name` | `shops/{shopId}/truckOrigins/{originId}`:<br>`originId: string`<br>`name: string`<br>`revision: number`<br>`createdAt: string`<br>`updatedAt: string` | เพิ่ม `revision` สำหรับ Concurrency Control |
| **สถานที่ปลายทาง (Destinations)** | `destinations` table:<br>`id` (auto-inc)<br>`name`<br>`driverPay` (Float บาท) | `shops/{shopId}/truckDestinations/{destId}`:<br>`destinationId: string`<br>`name: string`<br>`driverPaySatang: number` (Integer สตางค์)<br>`revision: number`<br>`createdAt: string`<br>`updatedAt: string` | เปลี่ยน `driverPay` เป็น `driverPaySatang` หน่วยสตางค์ (คูณ 100) |
| **ใบงานประจำวัน (Daily Record)** | `records` table:<br>`id` (auto-inc)<br>`date` (YYYY-MM-DD)<br>`truckId`<br>`fuelCost` (Float บาท)<br>`trips[]`<br>`images[]` (ฝังรูปเต็ม) | `shops/{shopId}/truckMonths/{monthKey}/records/{dateKey}_{truckId}`:<br>`recordId: string` (`${dateKey}_${truckId}`)<br>`dateKey: string` (`YYYY-MM-DD`)<br>`monthKey: string` (`YYYY-MM`)<br>`truckId: string`<br>`plateNumberSnapshot: string`<br>`driverNameSnapshot: string`<br>`fuelCostSatang: number` (Integer สตางค์)<br>`totalDriverPaySatang: number`<br>`tripCount: number`<br>`trips: TruckTripItem[]`<br>`photos: TruckPhotoMeta[]`<br>`revision: number`<br>`createdAt, updatedAt, updatedBy` | บังคับ 1 คันต่อ 1 วัน รหัสเอกสารไม่ซ้ำซ้อน, บันทึก Snapshot ทะเบียน/คนขับ, แยกรูปออกไปเก็บต่างหาก |
| **รายการเที่ยววิ่ง (Trip Item)** | `trips[i]` in record:<br>`fromLocation`<br>`destinationName`<br>`driverPay` (Float บาท)<br>`note` | `TruckTripItem` in record:<br>`tripIndex: number`<br>`fromLocation: string`<br>`destinationMode: string` (`DEST_<id>` \| `__OTHER__`)<br>`destinationId?: string \| null`<br>`destinationName: string`<br>`driverPaySatang: number` (Integer สตางค์)<br>`note: string` | เก็บโหมดของปลายทางเพื่อใช้อ้างอิงย้อนหลัง และแปลงค่าจ้างเป็นสตางค์ |
| **รูปภาพหลักฐาน (Photos)** | ฝัง base64 dataUrl ใน `images[]` ของตาราง `records` | `shops/{shopId}/truckPhotos/{photoId}`:<br>`photoId: string`<br>`data: string` (Base64 WebP)<br>`contentType: 'image/webp'`<br>`sizeKb: number`<br>`width: number, height: number`<br>`createdAt: string, updatedBy: string` | แยก Collection อิสระเพื่อไม่ให้เอกสารใบงานบวมเกิน 1 MB |
| **การตั้งค่าระบบ (Settings)** | ไม่มี (ใช้ Hardcode ในหน้าเว็บ) | `shops/{shopId}/profile/truck`:<br>`companyName: string`<br>`revision: number, updatedAt: string`<br><br>`shops/{shopId}/profile/line`:<br>`channelAccessToken: string`<br>`defaultTargetId: string`<br>`attendanceTargetId: string`<br>`truckTargetId: string`<br>`dailySummaryEnabled: boolean`<br>`dailySummaryHour: number` (19)<br>`revision: number, updatedAt: string` | เพิ่มการตั้งค่าชื่อกิจการและระบบแจ้งเตือน LINE รองรับทั้งแบบใช้ร่วมกันและแยกเป้าหมาย |

---

## 4. รายการฟีเจอร์และกรณีขอบเขตพิเศษ (Features & Edge Cases Catalog)

### 4.1 ฟีเจอร์ที่ต้องมีทั้งหมด (Required Features)

1. **หน้าบันทึกเที่ยววิ่ง (`/truck` - Tab 1):**
   - ตัวเลือกวันที่ (`input[type="date"]` พร้อมปุ่ม "วันนี้" และแสดงข้อความวันที่ภาษาไทยตามปฏิทินไทย)
   - ตัวเลือกรถสิบล้อ (แสดงทะเบียนรถและชื่อคนขับประจำ โดยกรองเฉพาะรถที่มีสถานะ `ACTIVE` เว้นแต่กำลังแก้ไขใบงานเดิมของรถคันนั้น)
   - ระบบ Auto-Load ใบงานเดิม: เมื่อเลือกวันและคันรถที่มีข้อมูลอยู่แล้ว แสดงสถานะเตือนชัดเจน พร้อมดึงเที่ยววิ่ง ค่าน้ำมัน และรูปบิลเดิมมาแสดงทันที
   - การเพิ่ม/ลบเที่ยววิ่ง: เพิ่มได้ไม่จำกัดเที่ยว (เที่ยวที่ 1, 2, 3...) ลบเที่ยวได้ (คงเหลืออย่างน้อย 1 เที่ยว)
   - การเลือกต้นทาง: เลือกจาก Dropdown สถานที่ต้นทางที่มีการตั้งค่าไว้
   - การเลือกปลายทาง:
     - ปลายทางมาตรฐาน: คำนวณค่าเที่ยวคนขับให้อัตโนมัติในระดับสตางค์
     - ปลายทางอื่นๆ (`__OTHER__`): แสดงช่องกรอกชื่อสถานที่ปลายทางเอง และช่องกรอกจำนวนเงินค่าเที่ยว (บาท -> สตางค์)
   - ช่องหมายเหตุของแต่ละเที่ยววิ่ง (เลขใบส่งของ, น้ำหนักบรรทุก)
   - ช่องกรอกค่าน้ำมันรวมของวันนี้ (บาท -> สตางค์)
   - การถ่ายรูป/อัปโหลดรูปบิลน้ำมันและใบส่งสินค้า:
     - บีบอัดฝั่งเบราว์เซอร์เป็น WebP ด้วย Canvas (maxDim 1280px, quality 0.78)
     - แสดงตารางภาพขนาดย่อ พร้อมขนาดไฟล์ (KB) และปุ่มกากบาทลบรูป
     - กดรูปเพื่อเปิดดูขนาดใหญ่ใน Modal Lightbox (รองรับการกดปิดด้วยปุ่ม Esc หรือแตะพื้นหลัง)
     - จำกัดไม่เกิน 5 รูปต่อใบงาน
   - แถบสรุปยอดก่อนบันทึก: แสดงจำนวนเที่ยววิ่งรวม, ค่าเที่ยวคนขับรวมวันนี้, และค่าน้ำมันรวมวันนี้ (ใช้ฟอนต์ `tabular-nums`)
   - ปุ่ม "บันทึกข้อมูลเที่ยววิ่ง" (พร้อม `MutationIntent` ป้องกันการกดซ้ำซ้อน)
   - ปุ่ม "ส่งสรุปวันนี้เข้า LINE"

2. **หน้ารายงานสรุปและสถิติ (`/truck/reports` & `/truck/reports/detailed` - Tab 2):**
   - ตัวกรองเดือน/ปี และตัวกรองคันรถ (แสดงทุกคัน หรือเลือกเฉพาะคัน)
   - แถบการ์ดสรุปยอดประจำเดือน (Quiet Operational Ledger Strip):
     - เที่ยววิ่งทั้งหมด (เที่ยว)
     - ค่าเที่ยวคนขับรวม (บาท)
     - ค่าน้ำมันรวม (บาท)
     - ต้นทุนรวม (ค่าเที่ยว + ค่าน้ำมัน)
   - ตารางสรุปผลงานแยกตามคันรถ: ทะเบียนรถ, คนขับประจำ, เที่ยววิ่งเดือนนี้, ค่าเที่ยวรวม, ค่าน้ำมันรวม
   - รายการประวัติใบงานรายวัน:
     - แสดงแยกตามวันและคันรถ
     - แสดงรายละเอียดทุกเที่ยววิ่ง (ต้นทาง -> ปลายทาง, ค่าเที่ยว, หมายเหตุ)
     - แสดงค่าน้ำมันและรูปบิลขนาดย่อ (กดเปิด Lightbox ดูรูปใหญ่ได้)
     - ปุ่ม "แก้ไข": กดแล้วส่ง State สลับไปหน้า `/truck` พร้อมตั้งค่า Date และ Truck เพื่อแก้ไขใบงานนั้นทันที
     - ปุ่ม "ลบใบงาน": ยืนยันการลบและลบข้อมูลออกจาก Firestore
   - เครื่องมือส่งออกและพิมพ์รายงาน:
     - ปุ่ม "ส่งออกไฟล์ Excel (CSV)": มี UTF-8 BOM `\uFEFF` สำหรับเปิดในโปรแกรม Excel ได้อย่างถูกต้อง
     - ปุ่ม "ดาวน์โหลดรายงาน PDF": จัดหน้าด้วย `pdfkit` และฟอนต์ THSarabunNew
     - ปุ่ม "ดูรายงานละเอียดและกราฟ" (`/truck/reports/detailed`): แสดงกราฟแท่ง SVG เปรียบเทียบข้อมูลรายวัน/รายเดือน/รายปี พร้อมรองรับ `@media print` สำหรับพิมพ์ขนาด A4 แนวนอน
     - ปุ่ม "ส่งสรุปเข้า LINE"

3. **หน้าตั้งค่าระบบรถสิบล้อ (`/truck/settings` - Tab 3):**
   - จัดการข้อมูลรถสิบล้อ: เพิ่ม, แก้ไข (ทะเบียนรถ, ชื่อคนขับประจำ, สถานะเปิดใช้งาน/พักรถชั่วคราว), และลบ
   - จัดการสถานที่ปลายทาง & ค่าเที่ยว: เพิ่ม, แก้ไข (ชื่อปลายทาง, ค่าเที่ยวคนขับระดับสตางค์), และลบ
   - จัดการสถานที่ต้นทาง: เพิ่ม, แก้ไข (ชื่อต้นทาง), และลบ
   - ตั้งค่าชื่อกิจการระบบรถสิบล้อ (สำหรับแสดงบนหัวรายงาน PDF และ Flex Message)
   - ตั้งค่าการแจ้งเตือน LINE รายวัน (เชื่อมต่อกับ `shops/{shopId}/profile/line` พร้อมปุ่มทดสอบส่งข้อความ)
   - สำรองและกู้คืนข้อมูล (Backup & Restore JSON) สำหรับข้อมูลระบบรถสิบล้อ

4. **ระบบแจ้งเตือนสรุปรายวัน LINE Messaging API:**
   - ส่งอัตโนมัติทุกวันเวลา 19:00 น. (12:00 UTC) ผ่าน Vercel Cron `/api/cron/daily-summary`
   - รองรับปุ่มส่งสรุปเองได้ทันทีจากหน้าเว็บทั้งสองระบบ
   - สร้าง Bubble Card Flex Message 2 กล่องแยกกัน:
     - กล่องที่ 1: สรุปเช็คชื่อพนักงาน (สีหัวการ์ด `#003566`, จำนวนพนักงานมา/ครึ่งวัน/ไม่มา/วันหยุด, ยอดเงินค่าแรง, เงินเบิก, ยอดสุทธิสะสม)
     - กล่องที่ 2: สรุปงานรถสิบล้อ (สีหัวการ์ด `#0F2942` คาดส้ม `#D97706`, จำนวนรถที่วิ่ง, เที่ยวรวม, ค่าเที่ยวรวม, ค่าน้ำมันรวม, รายละเอียดแยกคัน, ยอดสะสมประจำเดือน)
   - LINE Webhook `/api/line/webhook` สำหรับพิมพ์คำว่า `id` เพื่อดู User ID หรือ Group ID

---

### 4.2 กรณีขอบเขตพิเศษที่ต้องควบคุม (Edge Cases & Safety Rules)

1. **การบันทึกทับใบงานเดิม (Idempotency & Concurrency):**
   - เอกสารใบงานใช้คีย์ `${dateKey}_${truckId}`
   - หากผู้ใช้เปิดหน้าทิ้งไว้แล้วกดบันทึก หรือเปิดแก้ไขจาก 2 เครื่องพร้อมกัน: ต้องตรวจสอบ `expectedRevision` ใน Firestore Transaction เสมอ หาก Revision ไม่ตรงกัน ให้ส่งกลับข้อผิดพลาด `409 CONFLICT` เพื่อไม่ให้เขียนทับข้อมูลโดยไม่รู้ตัว
2. **ความคลาดเคลื่อนของทศนิยมเงิน (Floating-Point Drift):**
   - ห้ามใช้ตัวเลข `Number` ในการบวกค่าน้ำมันหรือค่าเที่ยวตรงๆ ในหน่วยบาท (เช่น `600.50 + 950.25` อาจเกิดเศษทศนิยม `1550.7500000000002`)
   - ทุกยอดเงินต้องแปลงเป็นจำนวนเต็มสตางค์ (`Integer Satang`) ทันทีที่รับค่าจากฟอร์ม และคำนวณด้วยจำนวนเต็มเสมอ
3. **กฎ Read-Before-Write ใน Firestore Transactions:**
   - ภายใน `db.runTransaction` ห้ามเรียก `tx.get()` หรือ `tx.getAll()` หลังจากมีคำสั่ง `tx.set()`, `tx.update()`, หรือ `tx.delete()` โดยเด็ดขาด มิฉะนั้น Firestore Admin SDK จะโยน Error ทันที
4. **กรณีค่าน้ำมันเป็นศูนย์ หรือไม่มีเที่ยววิ่ง:**
   - รถบางคันอาจวิ่งงานโดยไม่ได้เติมน้ำมันในวันนั้น: ค่าน้ำมัน `fuelCostSatang` ต้องยอมรับค่า `0` ได้อย่างถูกต้อง ไม่บังคับกรอก
   - ใบงานต้องมีเที่ยววิ่งอย่างน้อย 1 เที่ยวเสมอ หากไม่มีเที่ยววิ่งไม่อนุญาตให้กดบันทึก
5. **กรณีสถานที่ต้นทางหรือปลายทางถูกแก้ไข/ลบในภายหลัง:**
   - ข้อมูลใบงานในอดีตต้องไม่ได้รับผลกระทบ โดยระบบจะบันทึก Snapshot ชื่อสถานที่และค่าเที่ยว ณ วันที่วิ่งงานไว้ใน `TruckTripItem` เสมอ
6. **กรณีรถถูกระงับ/พักรถชั่วคราว (`status: 'SUSPENDED'`):**
   - รถที่ถูกพักจะไม่แสดงใน Dropdown ให้เลือกบันทึกงานใหม่ แต่ในหน้ารายงานย้อนหลัง ประวัติการวิ่งและสถิติของรถคันนั้นยังคงต้องแสดงผลถูกต้อง 100%
7. **กรณีไม่ได้ตั้งค่า LINE Token หรือ Token ผิดพลาด:**
   - หากผู้ใช้กดปุ่ม "ส่งสรุปเข้า LINE" ในขณะที่ยังไม่ได้ใส่ Token ในหน้าตั้งค่า ระบบต้องคืนค่า `422 LINE_NOT_CONFIGURED` พร้อมคำแนะนำภาษาไทยที่ชัดเจน ไม่เกิด Crash หรือ Unhandled Promise Rejection
8. **การแยก History Navigation ระหว่างสองเว็บ:**
   - การกดเปลี่ยนแท็บหรือการเปิด Modal ใน `/truck` ต้องไม่ส่งผลกระทบต่อ `attendanceNavigation` ใน `sessionStorage` หรือ URL History ของระบบเช็คชื่อพนักงาน

---

## 5. ข้อจำกัดและประเด็นที่ไม่ได้ครอบคลุม (Caveats)

1. **ไม่รองรับการทำงานแบบ Offline โดยสมบูรณ์ (Offline First):** เนื่องจากระบบเดิมใน Scratch เป็น IndexedDB ที่ทำงานออฟไลน์ได้ 100% แต่การย้ายขึ้น Cloud Firestore ผ่าน Next.js API Routes บน Vercel ต้องการการเชื่อมต่ออินเทอร์เน็ตในการส่งคำขอ API (อย่างไรก็ตาม ข้อมูลจะถูกจัดเก็บอย่างปลอดภัยบน Cloud ไม่สูญหายเมื่อล้างเบราว์เซอร์)
2. **ขีดจำกัดขนาดรูปภาพ WebP บน Firestore:** การเก็บรูปภาพเป็น Base64 ใน Firestore Subcollection `truckPhotos` เหมาะสมสำหรับ Spark Plan (จำกัดขนาดเอกสารไม่เกิน 1 MB ต่อรูป และขนาดรวมไม่เกินโควตาฐานข้อมูล 1 GB) หากในอนาคตมีรูปภาพจำนวนมหาศาล (หลายหมื่นรูป) อาจต้องพิจารณาขยายไปใช้ Cloud Storage แต่ในปัจจุบันการจำกัดรูปไม่เกิน 250 KB และ 5 รูปต่อใบงานถือว่าเพียงพอและปลอดภัย 100%
3. **การส่ง LINE Broadcast:** การส่งแบบ Broadcast มีโควตาส่งข้อความฟรีของ LINE Official Account (300-500 ข้อความต่อเดือนขึ้นกับแพ็กเกจ) จึงแนะนำให้กำหนด `targetId` เป็น Group ID หรือ User ID ของผู้ดูแลระบบเพื่อประหยัดโควตา

---

## 6. สรุปผลการประเมิน (Conclusion)

การสำรวจมีความสมบูรณ์ 100% พร้อมสำหรับการดำเนินงานตามแผนปฏิบัติการ (`implementation_plan.md` ทั้ง 10 Tasks ใน 4 Waves):
1. โครงสร้างข้อมูลและ Calculation Engine สามารถนำโมเดล `moneySatang` และ `validateSatang` จาก `src/lib/payroll/money.ts` มาประยุกต์ใช้ได้ทันทีโดยไม่ต้องสร้างโมดูลเงินใหม่
2. รูปแบบ API Route, Concurrency Control, Transaction Idempotency, และ Photo Upload ของ Truck App สามารถดำเนินตามรูปแบบของระบบเดิมใน `src/app/api/attendance/` และ `src/app/api/employees/[id]/photo/` ได้อย่างลงตัว
3. ดีไซน์ tokens ใน `src/styles/tokens.css` รองรับการเพิ่มธีม `[data-app-theme="truck"]` ได้โดยไม่รบกวนโครงสร้างเดิม
4. การลบอิโมจิที่หลงเหลือใน `SettingsTab.tsx` บรรทัด 1380 และ 1384 ทำได้ทันทีโดยใช้ไอคอนจาก `lucide-react`

---

## 7. วิธีการตรวจสอบความถูกต้องโดยอิสระ (Verification Method)

ผู้ตรวจสอบอิสระสามารถตรวจสอบความถูกต้องของรายงานและผลการสำรวจนี้ได้โดย:

1. **ตรวจสอบความสอดคล้องของบรรทัดโค้ดในไฟล์ต้นฉบับ:**
   - เปิดดู `c:\Users\tleza\.gemini\antigravity\scratch\truck-app\index.html` ตรวจสอบ Store ใน Dexie (บรรทัด 806-812) และตรรกะการคำนวณ
   - เปิดดู `src/components/settings/SettingsTab.tsx` ตรวจสอบอิโมจิที่บรรทัด 1380 (`💡`) และ 1384 (`✅`)
   - เปิดดู `src/lib/payroll/money.ts` ตรวจสอบข้อกำหนด Integer Satang
2. **ทดสอบคำสั่งชุดทดสอบและบิลด์ของโปรเจกต์:**
   - รันคำสั่งตรวจสอบ Type:
     ```powershell
     npm run typecheck
     ```
   - รันชุดทดสอบยูนิตเทสต์ทั้งหมด:
     ```powershell
     npm test
     ```
   - รันคำสั่งทดสอบบิลด์โปรดักชัน:
     ```powershell
     npm run build
     ```
   - เงื่อนไขความไม่ถูกต้อง (Invalidation Condition): หากคำสั่งใดมีข้อผิดพลาดหรือชุดทดสอบเดิม 13 ไฟล์ล้มเหลว แสดงว่ามีการแก้ไขที่ละเมิดข้อกำหนดความเข้ากันได้ย้อนหลัง
