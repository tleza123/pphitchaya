# สถานะการปรับระบบรถตามข้อกำหนด 7 พฤศจิกายน 2569

เอกสารนี้เป็นรายการติดตามงาน ไม่ใช่หลักฐานว่าข้อกำหนดผ่านทั้งหมด

## QA ต่อเนื่อง — ผลล่าสุด 7 พฤศจิกายน 2569

รายละเอียดและคำสั่งทำซ้ำอยู่ใน [TRUCK_QA_RESULTS.md](TRUCK_QA_RESULTS.md), [TRUCK_MOBILE_QA.md](TRUCK_MOBILE_QA.md) และ [TRUCK_RECOVERY_QA.md](TRUCK_RECOVERY_QA.md) ใช้ผลส่วนนี้แทนข้อความ “ยังไม่ได้ตรวจ” ในประวัติด้านล่าง เฉพาะขอบเขตที่ระบุ

- [x] สร้าง PDF จริงจาก API และเรนเดอร์ทุกหน้า: ใบวางบิลใหม่ 12 หน้า เก่า 12 หน้า ค่าแรง 14 หน้า; ตรวจภาพภาษาไทยและยอดจาก snapshot fixture
- [x] แก้ glyph ลูกศรที่ไม่มีในฟอนต์ แก้ footer ที่สร้างหน้าเพิ่ม และเพิ่มหัวเอกสาร/หัวข้อซ้ำในใบค่าแรง
- [x] เพิ่ม regression test pagination ตรวจหัวเอกสารทุกหน้า จำนวนรายการ ยอด และข้อมูลที่ห้ามแสดงบนเอกสารลูกค้า
- [x] backup → restore roundtrip ออฟไลน์ 13 เอกสาร ตรวจ snapshot ยอด รูป bytes ประวัติ audit และ request receipts
- [x] migration preview CLI จริงกับไฟล์ชั่วคราว; import entry point ตรวจเดือนออก รันซ้ำไม่เพิ่มข้อมูล conflict/ล็อก/maintenance และไม่เดาน้ำหนักหรือข้อมูลบุคคล
- [x] restore ปฏิเสธ backup ขาด requests/audit เพิ่มทดสอบ checksum/path ซ้ำ/ร้านผิด/เกินขนาด และไม่เขียนบางส่วนเมื่อ transaction ล้มเหลว
- [x] ทบทวน rules/indexes แบบอ่านโค้ดและปรับ recovery runbook ให้ตรงกับ validation ล่าสุด
- [x] ตรวจมือถือทุก 7 subpage ที่ 360/390px: 22 ภาพ/สถานะ, direct URL/reload/Back, บันทึกเที่ยวข้ามเดือน, หน้าราคาเลือกจุด และค่าแรงปิดรอบ; 100 API calls ถูก mock ทั้งหมด ไม่พบ overflow/page error
- [x] ตรวจ PDF รายงานส่งออก 19 หน้า รวมหมายเหตุยาวเกินหน้า แก้หัวตารางซ้ำและแบ่งข้อความโดยไม่ตัดอักขระไทย; ทดสอบเก็บรายการสุดท้าย/ปลายหมายเหตุครบ
- [x] ผลคำสั่งล่าสุด: `npm test` 166/166, `npm run build` ผ่าน, `npm run typecheck` หลัง build ผ่าน; ไม่มี skipped tests
- [ ] ยืนยัน contention/retry, SDK transaction และ indexes/rules บน Firestore emulator/โครงการทดสอบแยก — ยังไม่มีเครื่องมือพร้อมในเครื่องนี้
- [ ] ทดสอบ production migration/recovery และ external storage — ไม่ได้ดำเนินการและไม่รวมในผลออฟไลน์

การตรวจมือถือและคำสั่งทดสอบรวมรอบสุดท้ายบันทึกในรายงานผลล่าสุด ข้อมูล production ไม่ถูกอ่านหรือแก้ไขในรอบนี้

## แก้ข้อผิดพลาดจากการตรวจล่าสุด — 7 พฤศจิกายน 2569

- [x] ตรวจทุกเที่ยวเดิมก่อนแก้ใบงาน รวมเที่ยวที่ถูกนำออกจาก payload เพื่อป้องกันลบงานเก่าข้าม review
- [x] DELETE ใบงานตรวจ legacy pricing ของเที่ยวทั้งหมด และคืน 409 หากต้องตรวจราคาเดิม
- [x] Review แล้วแทน embedded trip ด้วยข้อมูลที่ตรวจแล้ว ไม่ merge ฟิลด์เงินเพิ่มเก่ากลับเข้า active data; คง legacy snapshot และสิทธิ์เงินเดิม
- [x] รายงานเที่ยวแยกใช้ revision ของ parent จริง แทนค่าตายตัว 1
- [x] Regression test ครอบคลุมการนำเที่ยวออกจาก payload, ลบทั้งใบงาน, review พร้อมรักษาเงินเพิ่มเดิม และ revision จากรายงาน
- [x] `npm test` ผ่าน 160/160 หลังแก้ (เพิ่มกรณีในชุดทดสอบเดิม)
- [x] `npm run build` ผ่าน และรัน `npm run typecheck` หลัง build ผ่าน (ต้องรันตามลำดับ เพราะ build สร้างไฟล์ `.next/types` ใหม่)

รายการด้านล่างที่ยังไม่ปิด เช่น PDF visual QA, Firestore จริง และ recovery roundtrip ยังไม่ถือว่าผ่านจากการแก้สามจุดนี้

## การเปลี่ยนข้อกำหนดล่าสุด: ราคาเหมาต่อเที่ยวช่องเดียว

ให้ยึด [TRUCK_SIMPLIFIED_PRICING_PLAN.md](TRUCK_SIMPLIFIED_PRICING_PLAN.md) แทนเงื่อนไขเงินเพิ่มและการเลือกวิธีระบุราคาในเอกสารเก่า รายการที่เคยทำ pricing mode และสูตร `1,200 + 100 = 1,300` ด้านล่างเป็นประวัติการตรวจสเปกก่อนหน้า **ไม่ใช่สถานะผ่านสเปกใหม่นี้**

### ตรวจล่าสุดในรอบเขียนแผน

- [x] อ่าน checklist ทั้งสองไฟล์เทียบกับ records UI/API และ billing API แล้ว
- [x] รัน `npm test` ผ่าน 153/153 และ `npm run typecheck` ผ่าน
- [x] `npm run build` หลังแก้ข้อกำหนดใหม่ — ดูผลล่าสุดในส่วน QA ด้านบน

### งานตามข้อกำหนดใหม่

- [x] ตัดเงินเพิ่มคนขับและคำอธิบายออกจาก flow งานใหม่
- [x] ตัดค่าบริการเพิ่มลูกค้าและคำอธิบายออกจาก flow งานใหม่
- [x] ตัด “วิธีระบุราคาลูกค้า / ราคาประจำ / กรอกเที่ยวนี้” และเหตุผลราคาออกจากหน้ากรอกปกติ
- [x] เหลือ “ราคาขนส่งเหมาต่อเที่ยว (บาท)” ช่องเดียว พร้อมยอดคำนวณที่เท่ากับราคาเหมา
- [x] ปรับ API และ version/snapshot ให้ไม่รับหรือบวกเงินเพิ่มในงานใหม่
- [x] ปรับ PDF รายงาน CSV และ LINE ให้ใช้กฎราคาเดิม/ใหม่โดยไม่เปลี่ยนยอดประวัติ; automated tests ผ่าน และตรวจภาพ PDF จริงแล้ว ไม่ได้ส่ง LINE จริง
- [x] ทำหน้าตรวจงานเก่าที่ยังไม่ปิดการเงินและมีเงินเพิ่ม ห้ามซ่อน/ตัดยอดทิ้ง; route regression และภาพมือถือ review ยืนยัน flow จำลองแล้ว
- [x] เพิ่มทดสอบสูตรใหม่ การส่งเงินเพิ่มแอบผ่าน API และการรักษาเอกสารเก่า
- [x] ตรวจมือถือจำลองและภาพ PDF สเปกใหม่จริง พร้อมรัน test/typecheck/build หลังพัฒนา (ดูขอบเขตและข้อจำกัดในรายงาน QA)

### งานค้างจากเช็กลิสต์เดิมที่ยังต้องยืนยัน

- [x] ตรวจ glyph ไทยและ layout ของ PDF หลายหน้า พร้อมเทียบยอด snapshot fixture (ดูผล QA ล่าสุด; ไม่ใช่ยอด production)
- [x] ทดสอบ migration/restore roundtrip ด้วย backup ทดสอบ ครอบคลุม audit/request receipts และรูปใน JSON แบบออฟไลน์
- [ ] ทดสอบ Firestore contention/retry บน emulator หรือโครงการทดสอบแยก
- [x] ตรวจกติกาหลายเที่ยวข้ามเดือน ค่าแรง/ลูกค้าและงานค้างด้วย unit/route tests และ browser mock; ยังไม่ใช่ E2E กับ Firestore จริง
- [x] ตรวจทุก subpage มือถือ พร้อม direct URL/refresh/Back และ review fixture หลัง migration ด้วย mock; ไม่ใช่ production E2E
- [x] ตรวจ indexes/rules แบบ static และคู่มือ recovery/ข้อจำกัดก่อน deploy โดยไม่แก้ production ในรอบทดสอบ; ผลที่ deploy จริงยังไม่ยืนยัน

## ประวัติผลตรวจสเปกก่อนหน้า

- [x] บันทึกข้อความข้อกำหนดฉบับเต็มเป็น TRUCK_REVISION_SPEC.md
- [x] ตรวจ Truck shell, URL `/truck` โดยตรง, การเปลี่ยนไป `/truck/reports` และ browser Back; ตรวจเพิ่มทุก subpage กับข้อมูลจริงยังไม่ทำ
- [x] แยกหน้าจัดการราคาคนขับ/ลูกค้าตามเส้นทาง และเลือกจุดจาก collection เดียว; API ป้องกันรหัสซ้ำและคู่ราคาใช้งานซ้ำ
- [x] ทำ pricing mode ราคาประจำ/กรอกเที่ยวนี้, ค่าเที่ยวคนขับอ่านอย่างเดียว, น้ำหนักตัน และยอดเหมาจ่ายต่อเที่ยว
- [x] ตรวจ route tests เรื่อง server price, snapshot, cross-month lock, request receipt, idempotency, billing lock และ legacy time retention ด้วย mock
- [x] สร้าง PDFKit output สำหรับ snapshot ใหม่, legacy snapshot และรายการไทยยาวหลายหน้าใน automated test; ยังไม่ได้เปิดตรวจ glyph ด้วย PDF viewer
- [x] รายงานหน้าจอไม่แสดงค่าน้ำมัน; CSV escape ภาษาไทย/เครื่องหมายพิเศษ และ LINE payload มี automated mock tests โดยไม่ส่ง LINE จริง
- [x] รอบ QA ล่าสุดสร้าง backup fixture แล้วรัน preview CLI และ restore/import entry point ออฟไลน์; ครอบคลุม audit/requests/รูป ยังไม่ทดสอบกับ Firestore จริง
- [x] ปรับ fixture ให้ใช้ contract ปัจจุบัน โดยคง assertion concurrency, idempotency, duplicate billing และ revision
- [x] `npm test` ผ่าน 153/153, `npm run typecheck` ผ่าน และ `npm run build` ผ่าน
- [x] ตรวจฟอร์มมือถือ 390px ด้วย mock API: ไม่มี horizontal overflow, ไม่มีช่องเวลา, ราคาอ่านอย่างเดียว และ 1,200 + 100 = 1,300; เพิ่มคู่มือใช้งานใน README_TH.md

งานที่ทำต่อในรอบนี้: นำช่องแก้ค่าเที่ยวคนขับ/เวลาออกจากฟอร์ม, บังคับเลือกปลายทางจากจุดชุดเดียว, ทำค่าเที่ยวที่ไม่ทราบเป็น null ใน UI, เพิ่ม legacy invoice renderer, เก็บ `requests`/`audit` ใน backup/restore, เอาค่าน้ำมันออกจากรายงาน Truck และปรับ fixtures กับคู่มือ

รอบ QA ล่าสุดรัน migration/restore ออฟไลน์กับ fixture แล้วตามรายงานด้านบน ยังไม่ได้ deploy หรือเชื่อม Firestore จริง และการตรวจมือถือใช้ mock API ไม่ใช่ข้อมูล production

## อัปเดต Firestore emulator และฟอร์ม — 7 พฤศจิกายน 2569

- [x] เริ่ม Firestore emulator ด้วย Java 21 และ Firebase CLI สำหรับ project `demo-truck-qa` แบบแยกจาก production
- [x] ทดสอบ transaction เขียนชนกัน 8 คำขอ: ยอดสุดท้าย 8 และ callback ทำงาน 25 ครั้ง แสดงว่า SDK retry เกิดขึ้นจริง (`scripts/truck-emulator-contention.cjs`)
- [ ] ทดสอบ migration/restore กับ emulator จริง: ยังไม่ได้รัน ผล roundtrip ก่อนหน้าเป็น in-memory mock เท่านั้น
- [x] นำช่องแนบรูปออกจากฟอร์มบันทึกรถ รักษารูปเดิมใน payload เพื่อไม่ให้ประวัติถูกลบ
- [x] `npm test` 166/166, `npm run build` และ `npm run typecheck` ผ่านหลังแก้ฟอร์ม
