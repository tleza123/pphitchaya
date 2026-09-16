# DE TEAM — ระบบเช็คชื่อพนักงานและสรุปค่าจ้าง (Attendance & Payroll)

เว็บแอปพลิเคชันสำหรับเจ้าของธุรกิจเดี่ยว (Single Owner) ใช้งานผ่านมือถือเป็นหลัก ออกแบบด้วยหลักการ **"เรียบง่าย ตัวหนังสือใหญ่ ปุ่มใหญ่ ยอดเงินถูกต้อง 100%"** โดยยึดสถาปัตยกรรม **Next.js App Router + Firebase + Vercel** ตามข้อกำหนดใน [BLUEPRINT.md](file:///c:/attendance-blueprint/attendance-firebase-plan/BLUEPRINT.md) แทนที่ระบบ Google Apps Script เดิมอย่างสิ้นเชิง

---

## 1. จุดเด่นของระบบ

- **สถาปัตยกรรม 3 แท็บเท่านั้น**:
  1. **เช็คชื่อ**: เลือกวัน บันทึก เต็มวัน / ครึ่งวัน / ไม่มา สรุปยอดคนเช็คแล้ว กรองคนที่ยังไม่เช็ค แก้ไขย้อนหลังได้พร้อมบันทึกประวัติ
  2. **รายงาน**: เลือกเดือน สรุปยอดรวมและยอดรายคน แสดงเต็มวัน ครึ่งวัน ไม่มา ยังไม่เช็ค ตรวจสอบและแก้ไขเงินพิเศษรายเดือน สั่งปิดเดือน และพิมพ์รายงาน
  3. **ตั้งค่า**: จัดการพนักงาน (รูปถ่าย ชื่อ ตำแหน่ง วันเริ่มงาน ค่าแรงรายวัน เงินพิเศษประจำ วันสิ้นสุดงาน) กำหนดวันทำงานของร้าน ชื่อร้าน และปุ่มออกจากระบบ
- **ความแม่นยำของยอดเงินระดับสตางค์ (Zero Floating-Point Drift)**:
  - เก็บและคำนวณเงินทุกรายการเป็น **จำนวนเต็มหน่วยสตางค์ (Integer Satang)**
  - เต็มวัน = ค่าแรง 1 เท่า
  - ครึ่งวัน = ค่าแรง 0.5 เท่า (ปัดเศษสตางค์ขึ้น: `Math.floor((rate + 1) / 2)`)
  - ไม่มา = 0 บาท
  - ยังไม่เช็ค = รอดำเนินการ (ไม่นับเป็นขาดงาน)
  - เงินพิเศษรายเดือน = เป็นยอดเต็มคงที่ ไม่เฉลี่ยตามวันทำงาน
  - ประวัติอัตราค่าแรง (Historical Rates): การปรับค่าแรงใหม่จะเริ่มมีผลตั้งแต่วันที่กำหนด (`effectiveDate`) และจะไม่ส่งผลกระทบย้อนหลังต่อยอดเช็คชื่อในอดีต
- **ระบบความปลอดภัยระดับ Server-Only (Zero Client Direct Database Access)**:
  - Firestore Security Rules และ Storage Security Rules ตั้งค่าเป็น `deny all` (`allow read, write: if false;`)
  - ผู้ใช้งานภายนอกไม่สามารถอ่านหรือเขียน Firestore/Storage ได้โดยตรง
  - ทุกคำขอผ่าน Next.js Route Handlers ที่ตรวจยืนยัน Google ID Token และเปรียบเทียบ UID กับ `OWNER_UID` บน Server อย่างรัดกุม
- **Idempotency & Concurrency Control**:
  - ทุก Mutation บันทึก `requestId` และตรวจสอบ `expectedRevision` ป้องกันการส่งซ้ำและการเขียนทับผิดจังหวะ (Conflict Detection)
- **ระบบปิดเดือนแบบ Resumable Chunked Job**:
  - สถานะรอบเดือน: `OPEN` → `CLOSING` → `CLOSED`
  - มี Finance Gate ป้องกันการแก้ไขข้อมูลระหว่างปิดเดือน
  - คำนวณยอดเงินและสร้าง Snapshot พร้อม SHA-256 Checksum ตรวจสอบความถูกต้องครบถ้วน

---

## 2. โครงสร้างโปรเจกต์

```text
employee-attendance/
├── .github/
│   └── workflows/
│       └── ci.yml                 # GitHub Actions CI (Typecheck, Test, Build)
├── public/
│   └── fonts/                     # ฟอนต์ Sarabun WOFF2 แบบ Local
│       ├── Sarabun-Regular.woff2
│       ├── Sarabun-Bold.woff2
│       └── OFL.txt
├── scripts/
│   ├── setup.ts                   # ตั้งค่าเริ่มต้น Firestore (Profile, Control, Calendar)
│   ├── seed-demo.ts               # สร้างข้อมูลทดสอบในโหมด DEV
│   ├── backup.ts                  # สำรองข้อมูล Firestore พร้อม SHA-256 Checksum
│   └── restore-check.ts           # ตรวจสอบความสมบูรณ์ของไฟล์สำรอง
├── src/
│   ├── app/
│   │   ├── api/                   # Server API Route Handlers ทั้ง 20 Endpoint
│   │   ├── login/                 # หน้าเข้าสู่ระบบ Google Sign-In
│   │   ├── layout.tsx             # Root Layout พร้อม Metadata และ Font
│   │   └── page.tsx               # หน้าหลัก 3 แท็บ พร้อม AuthGuard
│   ├── components/
│   │   ├── attendance/            # คอมโพเนนต์แท็บเช็คชื่อ
│   │   ├── reports/               # คอมโพเนนต์แท็บรายงานและการปิดเดือน
│   │   ├── settings/              # คอมโพเนนต์แท็บตั้งค่าและข้อมูลพนักงาน
│   │   └── shell/                 # Header และ Bottom Navigation
│   ├── features/
│   │   └── auth/                  # AuthContext และ State การเข้าสู่ระบบ
│   ├── lib/
│   │   ├── firebase/              # Firebase Client SDK & Admin SDK Singleton
│   │   ├── payroll/               # เครื่องคำนวณค่าจ้าง ปฏิทิน และ Snapshot
│   │   └── server/                # Auth Guard, Finance Gate, Idempotency, Repository
│   └── styles/
│       ├── tokens.css             # ตัวแปรสี ขนาดตัวอักษร และระยะห่าง (CSS Tokens)
│       └── globals.css            # Responsive Root Scaling และ Media Queries
├── tests/
│   ├── payroll.test.ts            # Unit Tests เครื่องคำนวณค่าจ้าง 11 กรณี
│   └── api.test.ts                # Unit Tests ความปลอดภัยและ Checksum
├── firestore.rules                # Rules ปิดกั้นฝั่ง Client 100%
├── storage.rules                  # Rules ปิดกั้น Storage ฝั่ง Client 100%
├── firestore.indexes.json         # Composite Indexes สำหรับ Attendance & Audit
├── firebase.json                  # การตั้งค่า Firebase Emulators
└── package.json
```

---

## 3. วิธีการติดตั้งและรันในเครื่อง (Local Development)

### ข้อกำหนดเบื้องต้น
- Node.js version 20 ขึ้นไป
- บัญชี Firebase Console สำหรับโครงการ DEV

### ขั้นตอนการรัน
1. เข้าไปยังโฟลเดอร์โปรเจกต์:
   ```bash
   cd employee-attendance
   ```
2. ติดตั้ง Dependencies:
   ```bash
   npm install
   ```
3. คัดลอกและตั้งค่า Environment Variables:
   ```bash
   cp .env.example .env.local
   ```
   (กรอกค่าคอนฟิก Firebase Web SDK, Firebase Admin Private Key และ `OWNER_UID`)
4. รันระบบในโหมดพัฒนา:
   ```bash
   npm run dev
   ```
   เปิดเบราว์เซอร์ที่ `http://localhost:3000`

5. รันการทดสอบ Unit Tests:
   ```bash
   npm test
   ```

6. ตรวจสอบความถูกต้องของ TypeScript:
   ```bash
   npm run typecheck
   ```

---

## 4. บัญญัติการออกแบบ UI / UX
- **โทนสีหลัก**:
  - สีน้ำเงินหลัก: `#003566`
  - สีน้ำเงินเข้ม: `#001D3D`
  - สีเหลืองเน้น: `#FFC300`
  - พื้นหลังแอป: `#F3F6FA`
  - การ์ดข้อมูล: สีขาว `#FFFFFF`
- **ขนาดองค์ประกอบบนมือถือ**:
  - เนื้อหาทั่วไป: `1.2rem` (~18px)
  - ชื่อพนักงาน: `1.33rem` (~20px)
  - หัวข้อหลัก: `1.66rem` (~25px)
  - ยอดเงินสำคัญ: `2rem` (~30px)
  - ความสูงปุ่มกด: อย่างน้อย `3.467rem` (~52px) เพื่อให้กดง่ายด้วยนิ้วโป้ง
- **ปราศจากอิโมจิ 100%**: ใช้ Lucide SVG Icons เท่านั้น เพื่อความน่าเชื่อถือระดับทางการ
- **รูปถ่ายพนักงาน**: แสดงผลตามสัดส่วนจริง (Natural Aspect Ratio) ไม่บังคับครอบตัดเป็นวงกลม และย่อขนาดผ่าน Canvas ฝั่งเบราว์เซอร์ก่อนส่งขึ้น Server
