Implement the Truck App (งานรถสิบล้อ) integration and LINE Messaging API daily summary into the existing `pphitchaya` project according to `implementation_plan.md`.

Working directory: c:\Users\tleza\Documents\GitHub\pphitchaya
Integrity mode: development

Reference material:
- Implementation Plan: `C:\Users\tleza\.gemini\antigravity\brain\efc1fb76-b98e-49a1-a1f9-a19ca35cf399\implementation_plan.md`
- Scratch Truck App (Vue + IndexedDB): `c:\Users\tleza\.gemini\antigravity\scratch\truck-app\index.html`

## Requirements

### R1. แยก URL Path และ UI ระหว่างระบบเช็คชื่อพนักงานและระบบงานรถสิบล้อ
ผนวกระบบบันทึกงานรถสิบล้อ (Truck App) เข้ากับโปรเจกต์ `pphitchaya` บนโดเมนเดียวกัน โดยแยก URL Path ชัดเจน:
- เว็บเช็คชื่อพนักงาน: `/`, `/reports`, `/reports/detailed`, `/settings`
- เว็บรถสิบล้อ: `/truck`, `/truck/reports`, `/truck/reports/detailed`, `/truck/settings`
- ไม่มีปุ่มหรือเมนูเชื่อมข้ามหากันบน UI เด็ดขาด (เสมือนคนละเว็บ 100%)

### R2. ย้ายและจัดเก็บข้อมูล Truck App บน Firebase Cloud Firestore
ย้ายข้อมูล Truck App ขึ้น Firebase Cloud Firestore (`shops/{shopId}/...`) ร่วมกับเว็บเช็คชื่อ:
- บันทึกใบงาน 1 วันต่อ 1 คัน (`{dateKey}_{truckId}`) เมื่อเลือกวันและคันเดิม ระบบจะดึงข้อมูลเดิมขึ้นมาให้แก้ไขหรือเพิ่มเที่ยววิ่งต่อได้ทันที
- คำนวณเงินระดับสตางค์ (Integer Satang) ทุกรายการ (ค่าเที่ยวคนขับ, ค่าน้ำมัน, ค่าจ้าง)
- รูปบิลน้ำมัน/ใบส่งสินค้า บีบอัดเป็น WebP (ฝั่ง client ด้วย canvas และ server ด้วย sharp) บันทึกใน Firestore `truckPhotos`
- มีระบบรายงาน PDF, ส่งออก Excel CSV, และกราฟวิเคราะห์ละเอียดรายวัน/รายเดือน/รายปี

### R3. ปรับปรุง UI ให้เข้ากันและทันสมัยตามหลัก Human UI Design (Quiet Operational)
- ใช้ฟอนต์ Sarabun, ดีไซน์ tokens เดียวกัน, ปุ่มใหญ่, ปราศจากอิโมจิ 100% (Zero Emoji), ไร้สีรุ้งไล่เฉด
- แยกสีหัวเว็บ: เช็คชื่อ = น้ำเงินเข้ม `#003566` คาดทอง `#FFC300`, รถสิบล้อ = น้ำเงินเข้มอมเทา `#0F2942` คาดส้มอำบัน `#D97706`
- ลบอิโมจิที่หลงเหลือใน `src/components/settings/SettingsTab.tsx` (บรรทัด 1380, 1384) ออกด้วย

### R4. ระบบแจ้งเตือนสรุปรายวันผ่าน LINE Messaging API (Flex Message)
- ส่งอัตโนมัติทุกวันตอนเย็น (19:00 น. ผ่าน Vercel Cron `/api/cron/daily-summary`)
- มีปุ่ม "ส่งสรุปวันนี้เข้า LINE" ในหน้าเว็บทั้งสองระบบ
- ส่งแยกเป็น 2 กล่องข้อความชัดเจน (กล่องสรุปเช็คชื่อพนักงาน + กล่องสรุปงานรถสิบล้อ)
- ตั้งค่า LINE Token และ Target ID ได้ในหน้าตั้งค่าของระบบ (ใช้ร่วมกันเป็นค่าเริ่มต้น หรือแยกเป้าหมายได้)

## Acceptance Criteria

### Implementation & Verification
- [ ] ดำเนินการครบทั้ง 10 Tasks ใน 4 Waves ตามรายละเอียดใน `implementation_plan.md`
- [ ] Mock external LINE API network calls in automated tests and verify message payload structures, with credentials configurable via UI settings or environment variables
- [ ] `npm run typecheck` passes with zero errors
- [ ] `npm test` passes all test suites
- [ ] `npm run build` succeeds with zero errors
