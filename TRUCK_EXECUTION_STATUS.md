# สถานะการส่งมอบระบบรถบรรทุก

วันที่ตรวจ: 2026-11-06

เอกสารนี้เป็น checklist จากการตรวจ source และ fixtures ปัจจุบัน ไม่ใช่การรับรองว่าข้อมูล production ถูกย้ายหรือเอกสารจริงถูกตรวจแล้ว สัญญาระบบหลักอยู่ใน [TRUCK_IMPLEMENTATION_PLAN.md](TRUCK_IMPLEMENTATION_PLAN.md)

## สัญญาข้อมูลที่ใช้ร่วมกัน

- หนึ่งเที่ยวเป็นต้นทาง–ปลายทางหนึ่งคู่ มี ID ถาวร; เดือนบัญชีคิดจากวันออกใน `Asia/Bangkok` (`departureDate`/`accountingMonth`) ไม่ใช่วันถึง วันปิดงาน หรือวันจ่าย/รับเงิน
- ค่าแรงฐานมาจากวันทำงานที่ยืนยันจริง หนึ่งคนต่อวัน; เดือนอิงวันที่ทำงาน ค่าเที่ยวและยอดลูกค้าอิงวันออก
- เงินทุกชนิดเป็น integer satang; `null` หมายถึงยังไม่ทราบราคา ส่วน `0` คือราคาศูนย์
- ข้อมูลรถ คนขับ ลูกค้า จุด และราคาที่ใช้จริงต้องอยู่ใน snapshot ของเที่ยว/เอกสาร ไม่คำนวณย้อนหลังจาก master data
- สถานะเที่ยว: `OPEN`, `COMPLETED`, `CANCELLED`; payroll: `OPEN`, `CLOSED`; invoice: `OPEN`, `VOID`; payment: `ACTIVE`, `VOID`
- API mutation ตรวจสิทธิ์และข้อมูลบน server ใช้ transaction แบบอ่านทุกเอกสารก่อนเขียน, `requestId`, `expectedRevision` และ audit receipt/log; ห้ามแก้เอกสารที่ล็อกโดยข้าม void/reopen พร้อมเหตุผล
- Collection หลักตาม `repository.ts`: `truckLocations`, `truckTariffs`, `truckDrivers`, `truckCustomers`, `trucks`, `truckOrigins`, `truckDestinations`, `truckMonths/{month}/records`, `truckMonths/{month}/workDays`, `truckTrips`, `truckRuns`, `truckPayrollMonths/{month}/versions`, `truckInvoices/{id}/payments`, `truckPhotos`, `requests`, `audit`
- เจ้าของไฟล์หากแบ่ง implementation ต่อ: Agent A เป็นเจ้าของ settings/records/trips/workdays และฟอร์มบันทึก; Agent B เป็นเจ้าของ payroll/report/PDF ค่าแรง; Agent C เป็นเจ้าของ billing/payment/PDF ใบวางบิล; Agent หลักเป็นเจ้าของ types/contract, routing, integration, backup/migration, indexes/rules และ final verification ห้ามแก้ไฟล์ข้ามเจ้าของโดยไม่ประสาน
- ใน session นี้มีผู้ช่วย Explore แบบอ่านอย่างเดียวเท่านั้น จึงรับรายงาน audit จาก A/B/C ได้ แต่ไม่ได้มอบหมายการแก้ไฟล์คู่ขนาน งานแก้จริงที่บันทึกด้านล่างทำโดย agent หลัก

## ทำแล้วและตรวจด้วยโค้ดหรือ fixtures

- [x] `/attendance` และ `/truck` มี routes แยก; `/attendance/setting` redirect ไป `/attendance/settings`; alias เก่าของ reports/settings redirect เข้า attendance
- [x] แยกลิงก์ใน Truck ไม่ให้กลับหน้าเลือกเว็บ; หน้า `/` ยังคงเป็นจุดเข้าเลือกแอป
- [x] `scripts/setup.ts`, `scripts/seed-demo.ts`, `scripts/backup.ts` มีค่าเริ่มต้น/ข้อมูล demo/ข้อมูลรถและ subcollections ตามสคีมาที่มีอยู่
- [x] Truck header และ mobile bottom navigation แยกเป็นคอมโพเนนต์; settings ใช้ accessible dialog และ `useModalInteraction`; API client แนบ Firebase ID token เมื่อมีและทำงานได้เมื่อไม่มี
- [x] API เที่ยวและวันทำงานคำนวณเดือน/ตรวจ lock ฝั่ง server; เที่ยวตรวจค่าแรงและค่าลูกค้ากับ tariff ใน transaction, snapshot tariff ID/revision/source และบังคับเหตุผลเมื่อ override; payroll ป้องกันวันทำงานซ้ำและปิดรอบที่มีเที่ยวค้าง; billing จำกัดเฉพาะเที่ยวเสร็จและตรวจยอดคงเหลือใน transaction
- [x] PDF ค่าแรงปฏิเสธ export เมื่อ payroll ไม่อยู่สถานะ `CLOSED` แม้มี snapshot เก่าหลัง reopen
- [x] Payroll API คืน preview และเที่ยวค้าง/ความพร้อมปิดรอบสำหรับเดือน `OPEN`; ใช้ calculator เดียวกันกับการปิดรอบ
- [x] หน้า `/truck/payroll` แสดงยอด preview/เที่ยวค้าง/ข้อมูลไม่ครบเป็นภาษาไทย, ปิดปุ่ม CLOSE เมื่อไม่พร้อม, บันทึกหมายเหตุจ่าย และเลือกเดือนเริ่มต้นตาม `Asia/Bangkok`
- [x] หน้า billing บันทึกหมายเหตุรับเงินจริงได้ และ default เดือนอิง `Asia/Bangkok`; PDF ใบวางบิลใช้ snapshot กิจการพร้อมที่อยู่/โทรศัพท์/เลขภาษี และไม่ใช้ข้อมูลค่าแรง
- [x] ตรวจ `/truck` และ `/truck/payroll` ผ่าน browser viewport 390px: ไม่ล้นแนวนอน, ไม่มีลิงก์ไป Attendance, ลิงก์/controls สูง 48px และ preview fixture ปิดปุ่ม CLOSE เมื่อมีงานค้าง
- [x] Backup จากเว็บเป็น export-only; restore บังคับผ่าน CLI ที่มี maintenance gate/checksum/create-only
- [x] อัปเดต route test ให้ตรงกับ restore contract; ปรับ test syntax, LINE fuel assertions, unknown-price assertion และ concurrency metric ที่ผิดขอบเขต
- [x] Validation ล่าสุด: `npm.cmd test` 151/151 ผ่าน, `npm.cmd run typecheck` ผ่าน, `npm.cmd run build` ผ่าน, ตรวจ zero-emoji ผ่าน; `.agents/` ไม่มีอยู่

## ยังต้องทำก่อนรับรองตามแผนทั้งหมด

- [ ] วันออก 30 พ.ย.–วันถึง 2 ธ.ค. และเที่ยวที่สองเริ่ม ธ.ค. ภายใน run เดียว: payroll test ยืนยันเที่ยวข้ามเดือนกับค่าแรงรายวันแล้ว แต่ยังไม่พบ first-class run contract/API ที่ยืนยันเที่ยวถัดไปและยอดลูกค้าแยกตามเดือนครบ
- [x] ราคามาตรฐานและ override: server ตรวจราคากับ tariff, บังคับเหตุผลเมื่อราคาไม่ตรง, เก็บ source/revision และรักษา snapshot เมื่อ master tariff เปลี่ยน
- [ ] PDF ค่าแรง/ใบวางบิล: ยังไม่มีการ render ตรวจ glyph ไทย, ยอดเทียบหน้าจอ, หัวตารางซ้ำของ payroll และหลายหน้าจากเอกสารจริง; invoice PDF แสดงข้อมูลกิจการจาก snapshot แล้ว แต่ยังไม่มีจำนวนเงินตัวอักษร/ช่องลงชื่อในเอกสาร
- [ ] Backup CLI เก็บ `audit`/`requests` แต่ restore CLI ยังไม่ restore สองคอลเลกชันนี้; restore ยังจำกัด 450 เอกสารและไม่มี rollback อัตโนมัติ
- [ ] Migration มี preview/import แบบ deterministic และตรวจ checksum/ยอด แต่ยังไม่มี rollback script; ไม่ได้ dry-run หรือนำเข้าข้อมูล production เพราะไม่มี backup/credential ที่ยืนยันได้ใน workspace
- [ ] ตรวจทดสอบ concurrency ด้วย Firestore จริง/emulator สำหรับ invoice ซ้ำและ payment พร้อมกัน; mock ปัจจุบัน serialize transaction จึงไม่พิสูจน์ contention/retry ของ Firestore จริง
- [ ] ตรวจ flow UI มือถือพร้อมข้อมูลจริง และตรวจไฟล์ PDF ค่าแรง/วางบิลที่สร้างจริง ทั้ง glyph ไทย ยอดตรงหน้าจอและหลายหน้า; รอบนี้ใช้ fixtures เพราะไม่มี Google Cloud credentials (`Could not load the default credentials`)
- [ ] ทดสอบ compatibility กับ LINE และลิงก์เดิมหลัง migration ด้วยข้อมูล/ระบบที่เชื่อมต่อจริง
- [ ] ตรวจ deployment Firestore indexes/rules กับ query schema ก่อนปล่อยใช้; ยังไม่ได้เปลี่ยน production rules/indexes

## ข้อจำกัดและความปลอดภัย

- ห้ามรัน migration กับข้อมูลจริงจนกว่าจะมี backup ที่ตรวจ checksum/ยอดแล้ว, dry-run report, maintenance window และขั้นตอน rollback ที่ผู้ดูแลอนุมัติ
- การทดสอบรอบนี้ใช้ local tests/mocks/fixtures เท่านั้น ไม่ได้อ่านหรือเขียน Firestore production, ไม่ได้แก้ข้อมูลจริง และไม่สามารถรับรองผล migration
- ห้ามสรุปว่างานตามแผนทั้งหมดเสร็จจนกว่ารายการในส่วน “ยังต้องทำ” จะปิดพร้อมหลักฐาน