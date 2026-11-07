# สถานะการปรับระบบรถตามข้อกำหนด 7 พฤศจิกายน 2569

เอกสารนี้เป็นรายการติดตามงาน ไม่ใช่หลักฐานว่าข้อกำหนดผ่านทั้งหมด

## การเปลี่ยนข้อกำหนดล่าสุด: ราคาเหมาต่อเที่ยวช่องเดียว

ให้ยึด [TRUCK_SIMPLIFIED_PRICING_PLAN.md](TRUCK_SIMPLIFIED_PRICING_PLAN.md) แทนเงื่อนไขเงินเพิ่มและการเลือกวิธีระบุราคาในเอกสารเก่า รายการที่เคยทำ pricing mode และสูตร `1,200 + 100 = 1,300` ด้านล่างเป็นประวัติการตรวจสเปกก่อนหน้า **ไม่ใช่สถานะผ่านสเปกใหม่นี้**

### ตรวจล่าสุดในรอบเขียนแผน

- [x] อ่าน checklist ทั้งสองไฟล์เทียบกับ records UI/API และ billing API แล้ว
- [x] รัน `npm test` ผ่าน 153/153 และ `npm run typecheck` ผ่าน
- [ ] `npm run build` หลังแก้ข้อกำหนดใหม่ — รอบนี้ยังไม่แก้ระบบและไม่ได้รัน build ใหม่

### งานใหม่ — ยังไม่ได้พัฒนาในรอบเขียนแผน

- [ ] ตัดเงินเพิ่มคนขับและคำอธิบายออกจาก flow งานใหม่
- [ ] ตัดค่าบริการเพิ่มลูกค้าและคำอธิบายออกจาก flow งานใหม่
- [ ] ตัด “วิธีระบุราคาลูกค้า / ราคาประจำ / กรอกเที่ยวนี้” และเหตุผลราคาออกจากหน้ากรอกปกติ
- [ ] เหลือ “ราคาขนส่งเหมาต่อเที่ยว (บาท)” ช่องเดียว พร้อมยอดคำนวณที่เท่ากับราคาเหมา
- [ ] ปรับ API และ version/snapshot ให้ไม่รับหรือบวกเงินเพิ่มในงานใหม่
- [ ] ปรับ PDF รายงาน CSV และ LINE แยกรุ่นเก่า/ใหม่โดยไม่เปลี่ยนยอดประวัติ
- [ ] ทำหน้าตรวจงานเก่าที่ยังไม่ปิดการเงินและมีเงินเพิ่ม ห้ามซ่อน/ตัดยอดทิ้ง
- [ ] เพิ่มทดสอบสูตรใหม่ การส่งเงินเพิ่มแอบผ่าน API และการรักษาเอกสารเก่า
- [ ] ตรวจมือถือและ PDF สเปกใหม่จริง พร้อมรัน test/typecheck/build หลังพัฒนา

### งานค้างจากเช็กลิสต์เดิมที่ยังต้องยืนยัน

- [ ] ตรวจ glyph ไทยและ layout ของ PDF หลายหน้า พร้อมเทียบยอดหน้าจอ
- [ ] ทดสอบ migration/restore roundtrip ด้วย backup ทดสอบ ครอบคลุม audit/request receipts และรูป
- [ ] ทดสอบ Firestore contention/retry บน emulator หรือโครงการทดสอบแยก
- [ ] ตรวจ flow หลายเที่ยวข้ามเดือนครบทั้งค่าแรง/ลูกค้าและงานค้าง
- [ ] ตรวจทุก subpage มือถือ พร้อม direct URL/refresh/Back และ compatibility หลัง migration
- [ ] ตรวจ indexes/rules และคู่มือ recovery/ข้อจำกัดก่อน deploy โดยไม่แก้ production ในรอบทดสอบ

## ประวัติผลตรวจสเปกก่อนหน้า

- [x] บันทึกข้อความข้อกำหนดฉบับเต็มเป็น TRUCK_REVISION_SPEC.md
- [x] ตรวจ Truck shell, URL `/truck` โดยตรง, การเปลี่ยนไป `/truck/reports` และ browser Back; ตรวจเพิ่มทุก subpage กับข้อมูลจริงยังไม่ทำ
- [x] แยกหน้าจัดการราคาคนขับ/ลูกค้าตามเส้นทาง และเลือกจุดจาก collection เดียว; API ป้องกันรหัสซ้ำและคู่ราคาใช้งานซ้ำ
- [x] ทำ pricing mode ราคาประจำ/กรอกเที่ยวนี้, ค่าเที่ยวคนขับอ่านอย่างเดียว, น้ำหนักตัน และยอดเหมาจ่ายต่อเที่ยว
- [x] ตรวจ route tests เรื่อง server price, snapshot, cross-month lock, request receipt, idempotency, billing lock และ legacy time retention ด้วย mock
- [x] สร้าง PDFKit output สำหรับ snapshot ใหม่, legacy snapshot และรายการไทยยาวหลายหน้าใน automated test; ยังไม่ได้เปิดตรวจ glyph ด้วย PDF viewer
- [x] รายงานหน้าจอไม่แสดงค่าน้ำมัน; CSV escape ภาษาไทย/เครื่องหมายพิเศษ และ LINE payload มี automated mock tests โดยไม่ส่ง LINE จริง
- [ ] CLI migration preview/restore ไม่ได้รัน เพราะไม่มีไฟล์ backup สำหรับทดสอบ; backup export มี regression test และ restore เป็น create-only พร้อม audit/requests แต่ยังไม่ทดสอบกับ Firestore
- [x] ปรับ fixture ให้ใช้ contract ปัจจุบัน โดยคง assertion concurrency, idempotency, duplicate billing และ revision
- [x] `npm test` ผ่าน 153/153, `npm run typecheck` ผ่าน และ `npm run build` ผ่าน
- [x] ตรวจฟอร์มมือถือ 390px ด้วย mock API: ไม่มี horizontal overflow, ไม่มีช่องเวลา, ราคาอ่านอย่างเดียว และ 1,200 + 100 = 1,300; เพิ่มคู่มือใช้งานใน README_TH.md

งานที่ทำต่อในรอบนี้: นำช่องแก้ค่าเที่ยวคนขับ/เวลาออกจากฟอร์ม, บังคับเลือกปลายทางจากจุดชุดเดียว, ทำค่าเที่ยวที่ไม่ทราบเป็น null ใน UI, เพิ่ม legacy invoice renderer, เก็บ `requests`/`audit` ใน backup/restore, เอาค่าน้ำมันออกจากรายงาน Truck และปรับ fixtures กับคู่มือ

ยังไม่ได้รัน migration, restore หรือ deploy; ไม่ได้เชื่อม Firestore จริง และการตรวจมือถือใช้ mock API ไม่ใช่ข้อมูล production
