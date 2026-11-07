# ผลทดสอบสำรอง กู้คืน และ migration — 7 พฤศจิกายน 2569

## ผลล่าสุด

คำสั่ง `node --import tsx --test tests/truck-recovery.test.ts` ผ่าน 4/4 กรณี ไม่มี skipped หรือ failed

การทดสอบเรียกฟังก์ชัน entry point เดียวกับคำสั่ง `backup`, `truck:restore` และ `truck:migration:import` ของโครงการโดยตรง แต่แทน Firestore ด้วยฐานข้อมูลจำลองในหน่วยความจำที่เก็บการเขียนรอไว้จน transaction สำเร็จ ไฟล์ backup จริงถูกเขียนใน temporary directory และลบเมื่อทดสอบจบ ส่วน `truck:migration:preview` รันเป็น CLI child process จริง ไม่มีการเชื่อมต่อ Firebase หรืออ่าน/เขียนข้อมูลจริง

## สิ่งที่ตรวจผ่าน

- สำรองแล้วกู้คืน fixture 13 เอกสาร ตรวจข้อมูลทุกเอกสาร: ข้อมูลกิจการ รถ จุด ใบงาน รูปแนบวันทำงาน ใบวางบิล snapshot รุ่นเก่า รายการรับเงิน รุ่นประวัติค่าแรง request receipt และ audit
- รูปที่เก็บเป็น data URL ใน Firestore กลับมาครบทั้งข้อมูลรูปและการอ้างอิงรูปในใบงาน
- ยอด snapshot และเงินเพิ่มเก่าคงเดิม ไม่ดึงราคาปัจจุบันมาทับ ไม่ใช้น้ำหนักคำนวณย้อนหลัง
- migration ของใบงานเดือนธันวาคมที่มีเที่ยวออก 30 พฤศจิกายน ถึง 2 ธันวาคมสร้างเที่ยวในเดือนพฤศจิกายน
- เวลาเดิมและ snapshot รายเที่ยวถูกเก็บไว้ น้ำหนักที่ไม่ทราบเป็น `null` คนขับและลูกค้าที่ไม่ยืนยันไม่ถูกเดาจากชื่อ
- import ไฟล์เดิมซ้ำไม่สร้างเที่ยวเพิ่ม หากข้อมูลปลายทางต่างจาก candidate จะปฏิเสธแทนการเขียนทับ
- import ปฏิเสธเดือนค่าแรงที่ปิดแล้ว สถานะ maintenance และยอดรวมต้นทางไม่ตรง
- restore ปฏิเสธปลายทางที่มีข้อมูล ไม่เปลี่ยน snapshot เดิม และคง maintenance ไว้เพื่อให้ผู้ดูแลตรวจสอบตาม runbook
- checksum ผิด ร้านผิด path ซ้ำ ชุดข้อมูลไม่ครบ และเกิน 450 เอกสารถูกปฏิเสธก่อนเขียนข้อมูล
- preview CLI สร้าง dry-run พร้อมจำนวนเที่ยวและยอดตรงต้นทาง และปฏิเสธเขียนทับไฟล์ผลเดิม

## ข้อผิดพลาดที่แก้จากการตรวจครั้งนี้

restore เดิมยอมรับ backup ที่ไม่มี `requests` หรือ `audit` และกู้คืนโดยไม่มีประวัติส่วนนี้ ปรับให้คืน `BACKUP_INCOMPLETE` และเพิ่ม regression test ทั้งสองกรณี ปรับ runbook ให้ตรงข้อจำกัดใหม่ ไฟล์เก่าที่ไม่มีข้อมูลส่วนนี้ต้องผ่านกระบวนการตรวจและ reconciliation แยก ห้ามเติมอาร์เรย์ว่างเพื่ออ้างว่าประวัติครบ

## ข้อจำกัดที่ยังต้องตรวจภายนอก

- ยังไม่ได้ทดสอบ Firestore emulator หรือ contention/retry ของ Firestore จริง ฐานข้อมูลจำลองตรวจ logic และ atomic buffering แต่ไม่ยืนยัน SDK semantics, indexes, transaction quota หรือความขัดแย้งพร้อมกันจริง
- ยังไม่ได้รัน migration/restore กับโครงการจริง และไม่มีการ deploy
- ไม่ยืนยันการกู้คืนไฟล์รูปใน external storage: fixture ตรวจเฉพาะ bytes ที่อยู่ใน JSON/Firestore เท่านั้น URL เพียงอย่างเดียวไม่ใช่ backup ของไฟล์
- JSON backup เหมาะกับข้อมูล JSON-compatible; Timestamp/GeoPoint/DocumentReference ต้องใช้ native export หรือวิธีแปลงที่ผ่านการตรวจต่างหาก
- ข้อมูลเดือนใน nested records ถูกเก็บเพิ่มเป็น `monthKey` ตามรูปแบบ backup เดิม การทดสอบยืนยัน metadata นี้อย่างชัดเจน
- restore มีขีดจำกัด 450 เอกสารและต้องเป็น namespace รถว่าง ตรวจ orphan subcollections แยกตาม runbook ก่อนใช้จริง

ผลนี้เป็นหลักฐาน offline regression เท่านั้น ไม่ใช่การรับรอง production migration/recovery

## ตรวจ rules/indexes แบบ static

ตรวจ `firestore.rules`, `firestore.indexes.json`, route ภายใต้ `src/app/api/truck` และ helper ใน `src/lib/truck`/repository จากไฟล์ใน working tree แล้ว:

- rules ใช้ wildcard ปฏิเสธ read/write ของ client ทุก path ระบบ Truck จึงต้องผ่าน API ฝั่งเซิร์ฟเวอร์ซึ่งใช้ Admin SDK การมี rules นี้ไม่ใช่หลักฐานว่า API มีการตรวจสิทธิ์ครบ
- แต่ละ Truck API ที่ตรวจเรียก `verifyOwner` แต่ implementation ปัจจุบันใน `src/lib/server/auth.ts` คืน actor คงที่โดยไม่ตรวจ token ของ request โดยออกแบบให้ใช้ deployment access protection ภายนอก ต้องตรวจว่าปลายทางถูกป้องกันก่อนเปิดใช้จริง รอบนี้ไม่ได้ตรวจหรือเปลี่ยนการตั้งค่า deployment ดังกล่าว
- queries ของเที่ยวใช้ตัวกรองเดี่ยว `accountingMonth ==`, `legacyRecordId ==` หรือ `departureDate <=` และไม่พบ `orderBy` หรือ collection-group query ในเส้นทาง Truck ที่ตรวจ
- records GET เลือกกรอง `dateKey ==` และ `truckId ==` พร้อมกันได้ เป็น equality filters ไม่มี sort/range เพิ่ม ไม่พบข้อบ่งชี้จากโค้ดว่าจำเป็นต้องเพิ่ม composite index ใหม่ในรอบนี้ จึงไม่ได้เพิ่ม index โดยคาดเดา
- ไฟล์ indexes ปัจจุบันมี composite ของ attendance และ audit เท่านั้น และ `fieldOverrides` ว่าง ผลนี้ไม่ยืนยัน indexes ที่ deploy อยู่จริง ต้องทดสอบ queries กับ emulator หรือโครงการทดสอบก่อน deploy และตรวจ error ที่ SDK ส่งจริง
- ตรวจ PATH ด้วย `Get-Command java,firebase` ไม่พบทั้งสองคำสั่ง และไม่มี `node_modules/firebase-tools` ในโครงการ ไม่ได้ติดตั้งเครื่องมือเพิ่ม ไม่ได้เริ่ม emulator และไม่ได้เชื่อมต่อโครงการจริง จึงไม่ทำเครื่องหมาย emulator contention/rules deployment ว่าผ่าน
