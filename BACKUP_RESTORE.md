# คู่มือการสำรองและตรวจสอบข้อมูล (Backup & Restore Operations)

ระบบ DE TEAM มีสคริปต์สำหรับการสำรองข้อมูล (Backup) และตรวจสอบความสมบูรณ์ของไฟล์สำรอง (Restore Check) เพื่อสำรองข้อมูลพนักงานและระบบรถสิบล้อ

---

## 1. การสำรองข้อมูล (Backup)

สคริปต์สำรองข้อมูลจะดึงเอกสารใน Firestore ภายใต้ร้านที่กำหนดด้วย `SHOP_ID` ได้แก่:
- `profile` (ข้อมูลร้านและวันทำงาน)
- `control` (สถานะการปิดงวดและ Lock)
- `calendarVersions` และ `calendarOverrides` (ปฏิทินวันทำงานและวันหยุด)
- `employees`, `months`, `closeJobs`, `requests` และ `audit` (ข้อมูลระบบเช็คชื่อและประวัติการเปลี่ยนแปลง)
- `trucks`, `truckOrigins`, `truckDestinations` และ `truckPhotos` (ข้อมูลระบบรถสิบล้อ)
- `truckMonths` (เอกสารสรุปรายเดือน) และ `truckMonthRecords` (ใบงานใน subcollection `truckMonths/{monthKey}/records`)
- ข้อมูลระบบรถปัจจุบัน (`truckLocations`, `truckDrivers`, `truckCustomers`, `truckTariffs`, `truckTrips`, `truckRuns`, `truckPayrollMonths`, `truckInvoices`, รูป และ subcollections ของเอกสารการเงิน) พร้อม `requests` และ `audit` สำหรับตรวจการส่งซ้ำและประวัติการเปลี่ยนแปลง

รายการใน `truckMonthRecords` จะมี `monthKey` และ `_id` เพื่อระบุเดือนและรหัสเอกสารต้นทาง โดยยอด `totalRecords` นับรวมเอกสารรายเดือนและใบงานย่อยด้วย

### วิธีการรัน
เปิด Terminal ในโฟลเดอร์ `employee-attendance` แล้วรันคำสั่ง:
```bash
npm run backup
```

ผลลัพธ์:
- สคริปต์จะสร้างไฟล์ JSON ในโฟลเดอร์ `backups/` เช่น `backups/backup_de-team_20260914_083000.json`
- คำนวณค่า **SHA-256 Checksum** ของข้อมูลทั้งหมดและบันทึกกำกับไว้บนส่วนหัวของไฟล์
- แสดงสรุปจำนวนเอกสารที่สำรองได้ในแต่ละคอลเลกชัน

---

## 2. การตรวจสอบไฟล์สำรอง (Restore Check)

ก่อนที่จะนำข้อมูลกลับเข้าสู่ระบบ ต้องตรวจสอบความถูกต้องของโครงสร้างและยืนยันว่าข้อมูลไม่ถูกแก้ไขหรือสูญหายระหว่างจัดเก็บ

### วิธีการรัน
```bash
# ตรวจสอบไฟล์สำรองล่าสุดโดยอัตโนมัติ
npm run restore:check

# หรือระบุพาธไฟล์ที่ต้องการตรวจสอบ
npm run restore:check backups/backup_de-team_20260914_083000.json
```

ผลการตรวจสอบจะรายงาน:
1. การตรวจสอบไวยากรณ์ JSON (JSON Syntax Validation)
2. การเปรียบเทียบคำนวณซ้ำของค่า SHA-256 Checksum (`PASS` หรือ `FAIL`)
3. สรุปจำนวนพนักงาน ประวัติการเช็คชื่อ และยอดสแนปช็อตในไฟล์
4. ยืนยันความพร้อมในการนำไปใช้งาน (Restore Readiness)

---

## 3. หลักการป้องกันความเสียหาย (Safety Principles)

- **ไฟล์สำรองอยู่ในรูปแบบ Deterministic JSON**: สามารถเปิดตรวจสอบด้วยโปรแกรมแก้ไขข้อความได้โดยตรง
- **ไม่เขียนทับฐานข้อมูลจริงโดยอัตโนมัติ**: สคริปต์ตรวจสอบจะรันในโหมดอ่านอย่างเดียว (Read-only Dry Run) จะไม่มีการแก้ไขหรือลบข้อมูลใน Cloud Firestore
- **ข้อแนะนำ**: ควรสำรองข้อมูลเดือนละ 1 ครั้งหลังจากการปิดเดือนเรียบร้อยแล้ว หรือก่อนที่จะมีการปรับโครงสร้างองค์กรครั้งใหญ่

การกู้คืนระบบรถใช้ `npm run truck:restore -- <backup.json> --apply` ตามขั้นตอน maintenance gate ใน [TRUCK_MIGRATION_RUNBOOK.md](TRUCK_MIGRATION_RUNBOOK.md) เท่านั้น สคริปต์เป็น create-only และจะหยุดเมื่อพบเอกสารเป้าหมายที่มีอยู่แล้ว รวม `requests` และ `audit` ด้วย ห้ามใช้ browser export เป็นแหล่ง restore และห้ามทดลองกับข้อมูล production ระหว่างพัฒนา
