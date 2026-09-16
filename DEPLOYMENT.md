# คู่มือการติดตั้งและ Deploy ระบบ DE TEAM (Firebase + GitHub + Vercel)

คู่มือฉบับนี้อธิบายขั้นตอนการติดตั้งระบบตามแผนสถาปัตยกรรม Firebase + Vercel อย่างละเอียด โดยแยกสภาพแวดล้อม DEV และ PROD อย่างชัดเจนเพื่อความปลอดภัยสูงสุดของข้อมูล

---

## 1. การเตรียมโครงการ Firebase (Firebase Setup)

### ข้อควรทราบสำคัญ
- ให้สร้าง **2 โครงการ (Projects)** แยกกันใน Firebase Console:
  1. `de-team-attendance-dev` (สำหรับพัฒนาและการทดสอบ Preview บน Vercel)
  2. `de-team-attendance-prod` (สำหรับข้อมูลจริงและการใช้งาน Production)
- **ห้าม** ใช้ Production Credentials กับ Vercel Preview Deployments เป็นอันขาด

### ขั้นตอนการตั้งค่าในแต่ละโครงการ
1. **Firebase Authentication**:
   - ไปที่ **Authentication** > **Sign-in method**
   - เปิดใช้งาน **Google Provider**
   - ในแท็บ **Settings** > **Authorized domains**:
     - DEV: เพิ่ม `localhost` และ `*.vercel.app` (Preview domains)
     - PROD: เพิ่มเฉพาะ Production Domain ของ Vercel (เช่น `attendance.dps-team.com` หรือ `de-team.vercel.app`)
2. **Cloud Firestore**:
   - ไปที่ **Firestore Database** > **Create database**
   - เลือก Location เป็น `asia-southeast1` (สิงคโปร์) เพื่อความเร็วสูงสุดในประเทศไทย
   - เลือกโหมด **Production Mode**
   - นำไฟล์ [firestore.rules](file:///c:/attendance-blueprint/employee-attendance/firestore.rules) ไป Publish (กฎจะเป็น `deny all` ป้องกันการเข้าถึงโดยตรงจาก client)
   - นำไฟล์ [firestore.indexes.json](file:///c:/attendance-blueprint/employee-attendance/firestore.indexes.json) ไป Deploy ผ่าน Firebase CLI หรือสร้าง Composite Indexes ใน Console ตามไฟล์
   - **ไม่ต้องเปิด Firebase Storage**: รูปถ่ายพนักงานจะถูกบีบอัดและจัดเก็บลง Cloud Firestore โดยตรง ทำให้ไม่ต้องเปิดบริการ Storage ไม่ต้องเสียค่าใช้จ่าย และไม่ต้องผูกบัตรเครดิต (Spark Plan ฟรี 100%)
3. **Service Account (สำหรับ Server Admin SDK)**:
   - ไปที่ **Project settings** > **Service accounts**
   - กดปุ่ม **Generate new private key**
   - บันทึกไฟล์ JSON ไว้ในที่ปลอดภัย (ห้าม commit ลง Git)
   - ข้อมูลที่ต้องนำไปใช้ใน Environment Variables ได้แก่:
     - `project_id`
     - `client_email`
     - `private_key`

---

## 2. การทำงานโหมดใช้งานคนเดียว (Single-User Mode - ไม่ต้องมีระบบล็อกอิน)

ระบบได้รับการออกแบบให้เจ้าของร้านใช้งานคนเดียวได้อย่างสะดวกรวดเร็วที่สุด:
* **เปิดเว็บแล้วเข้าใช้งานได้ทันที**: ไม่ต้องผ่านหน้าล็อกอิน ไม่ต้องกด Google Sign-In และไม่มีขั้นตอนยืนยันตัวตนที่ยุ่งยาก
* **เข้าถึงได้จากทุกอุปกรณ์ของเจ้าของร้าน**: ทั้งมือถือ แท็บเล็ต หรือคอมพิวเตอร์ เพียงเปิดลิงก์ URL ของเว็บก็เริ่มเช็คชื่อ ดูรายงาน และตั้งค่าได้ทันที
* **ตัวเลือกเสริม (Optional Authentication)**: หากในอนาคตต้องการเปิดระบบล็อกอินด้วย Google เพื่อจำกัดสิทธิ์เฉพาะบัญชีตนเอง สามารถทำได้โดยกำหนดตัวแปร `REQUIRE_AUTH=true` และระบุ `OWNER_UID` บน Vercel

---

## 3. ตัวแปรสิ่งแวดล้อม (Environment Variables)

กำหนดตัวแปรสิ่งแวดล้อมบน Vercel (Settings > Environment Variables):

### ตัวแปรหลักที่จำเป็น (สำหรับการบันทึกข้อมูลและคำนวณเงิน)
| ตัวแปร | Scope | คำอธิบาย |
|---|---|---|
| `FIREBASE_PROJECT_ID` | Production, Preview, Dev | Project ID ฝั่ง Server จาก Service Account |
| `FIREBASE_CLIENT_EMAIL` | Production, Preview, Dev | Service Account Email |
| `FIREBASE_PRIVATE_KEY` | Production, Preview, Dev | Private Key (ขึ้นต้นด้วย `-----BEGIN PRIVATE KEY-----`) |

### ตัวแปรเสริม (Optional - สำหรับเปิดระบบล็อกอินในอนาคตหากต้องการ)
| ตัวแปร | Scope | คำอธิบาย |
|---|---|---|
| `REQUIRE_AUTH` | Production, Preview, Dev | ตั้งเป็น `true` หากต้องการบังคับล็อกอิน Google (ค่าเริ่มต้นคือ `false` ไม่ต้องล็อกอิน) |
| `OWNER_UID` | Production, Preview, Dev | Firebase User UID ของเจ้าของร้าน (ใช้เมื่อเปิด `REQUIRE_AUTH=true`) |
| `NEXT_PUBLIC_FIREBASE_API_KEY` | Production, Preview, Dev | Web API Key จาก Firebase Config (ใช้เมื่อเปิด `REQUIRE_AUTH=true`) |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | Production, Preview, Dev | Auth Domain จาก Firebase Config (ใช้เมื่อเปิด `REQUIRE_AUTH=true`) |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | Production, Preview, Dev | Project ID ฝั่ง Client |
| `NEXT_PUBLIC_FIREBASE_APP_ID` | Production, Preview, Dev | Web App ID ฝั่ง Client |

> **คำเตือนความปลอดภัย**: ตัวแปร Service Account (`FIREBASE_PRIVATE_KEY`) ต้องเก็บเป็นความลับ ห้ามนำไปใส่คำนำหน้า `NEXT_PUBLIC_` โดยเด็ดขาด


---

## 4. การเชื่อมต่อ GitHub และการตั้งค่า Vercel

1. สร้าง GitHub Repository และ Push ซอร์สโค้ดขึ้นไป:
   ```bash
   git add .
   git commit -m "feat: complete DE TEAM attendance and payroll system"
   git push origin main
   ```
2. เชื่อมต่อ Vercel:
   - ไปที่แดชบอร์ด Vercel > กด **Add New Project** > นำเข้าจาก GitHub Repository
   - ตั้งค่า **Root Directory**: `employee-attendance`
   - Framework Preset: **Next.js**
   - Node.js Version: 20.x
3. กำหนด Environment Variables ตามตารางด้านบนให้ครบถ้วน
4. กด **Deploy**

---

## 5. การตั้งค่าข้อมูลเริ่มต้น (Initialization)

เมื่อ Deploy เสร็จสิ้นแล้ว ให้เปิด Terminal ในเครื่องที่เชื่อมต่อกับ Firebase Database และรันคำสั่ง:
```bash
# ตั้งค่าเอกสารร้านค้า การเงิน และปฏิทิน
npm run setup

# (เฉพาะ DEV) หากต้องการสร้างข้อมูลพนักงานและประวัติเช็คชื่อตัวอย่าง
npm run seed:demo
```

---

## 6. คำอธิบายค่าใช้จ่ายและโควตา (Cost & Quotas)

- **Firebase Authentication**: ใช้งานฟรีไม่จำกัดสำหรับการล็อกอินด้วย Google Identity Platform
- **Cloud Firestore**:
  - โควตาฟรี (Spark Plan): อ่าน 50,000 ครั้ง/วัน, เขียน 20,000 ครั้ง/วัน, จัดเก็บข้อมูล 1 GB ฟรีตลอดชีพ
  - จัดเก็บทั้งข้อมูลการเช็คชื่อ คำนวณเงิน และรูปโปรไฟล์พนักงาน (ขนาดประมาณ 10–15 KB/รูป) ครบจบในที่เดียว
  - สำหรับร้านค้าขนาด 10–30 คน ปริมาณการใช้งานอยู่ที่ประมาณ **50–200 ครั้ง/วัน** ซึ่งอยู่ภายใต้โควตาฟรีอย่างสบาย
- **Vercel**:
  - แผน Hobby (ฟรี): Bandwidth 100 GB/เดือน, Serverless Function Execution เพียงพอสำหรับการใช้งานคนเดียวอย่างเหลือเฟือ
- **หมายเหตุ**: ไม่จำเป็นต้องเปิดบัตรเครดิตหรือ Upgrade เป็น Blaze Plan ใดๆ ทั้งสิ้น เพราะระบบทำงานบน Cloud Firestore ฟรี 100% ภายใต้โควตา Spark Plan
