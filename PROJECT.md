# Project: Truck UI/UX Redesign & Responsive Improvements

## Architecture
- **Framework**: Next.js 15 (App Router), React 19, TypeScript.
- **Components**:
  - `TruckShell.tsx`: Navigation shell containing top header and `docNav` navigation strip.
  - `TruckRecordTab.tsx`: Daily trip logging and job sheet management form.
  - `TruckReportsTab.tsx`: Summary, download and export action toolbar.
  - `billing/page.tsx`: Invoicing and payment management workflow.
  - `payroll/page.tsx`: Monthly driver payroll calculations, workday confirmation, and disbursement.
  - `LineSendButton.tsx`: Shared notification trigger component for LINE integration.
- **Styling**: CSS Modules (`truck.module.css`, `settings.module.css`, `shell.module.css`), design tokens in `tokens.css`.
- **Backend APIs**:
  - `/api/truck/records`: Trip creation, revision editing, billing derivation.
  - `/api/truck/billing`: Invoicing, payments, and cancellations with customer isolation.
  - `/api/truck/payroll`: Payroll closing, driver wage calculations, disbursement, reopening.
  - `/api/truck/workdays`: Daily driver attendance confirmation.

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | Hide review link from docNav | Remove "ตรวจข้อมูลที่ย้ายมา" link from `TruckShell.tsx` docNav while keeping `/truck/review/page.tsx` and `/api/truck/trips` intact | M1 | ORIGINAL_REQUEST §R1 |
| 2 | In-page Billing Workflow | Add month + customer selector, customer-isolated trip list, select-all toggle, and replace all `window.prompt` with in-page modals in `/truck/billing` | M1 | ORIGINAL_REQUEST §R1 |
| 3 | In-page Payroll Workflow | Add month + driver selector, driver breakdown (base days + trips + net total), and replace all `window.prompt` with in-page modals in `/truck/payroll` | M1 | ORIGINAL_REQUEST §R1 |
| 4 | Billable Auto-derivation | Remove "เรียกเก็บลูกค้า" checkbox; derive `billable` automatically from customer selector (empty option: "ไม่เรียกเก็บลูกค้า / รถเปล่า") in `TruckRecordTab.tsx` | M2 | ORIGINAL_REQUEST §R2 |
| 5 | Relocate "ยกเลิกเที่ยว" | Move "ยกเลิกเที่ยว" checkbox to bottom of each trip card, placed above "+ เพิ่มเที่ยววิ่งที่ 2" button in `TruckRecordTab.tsx` | M2 | ORIGINAL_REQUEST §R2 |
| 6 | Action Buttons Height & Baseline Alignment | Align "บันทึกใบงาน" and "ส่งสรุปวันนี้เข้า LINE" with identical height and plane alignment in `TruckRecordTab.tsx` and `LineSendButton.tsx` | M2 | ORIGINAL_REQUEST §R2 |
| 7 | Reports Tab 2x2 / 1-column Grid | Group 4 buttons ("ดาวน์โหลด PDF", "ส่งออก Excel (CSV)", "รายละเอียดและกราฟ", "ส่งสรุปวันนี้เข้า LINE") into 2x2 grid on tablet/desktop and 1 column on mobile | M3 | ORIGINAL_REQUEST §R3 |
| 8 | Responsive CSS across 320px–1920px | Ensure no horizontal overflow and clean word-breaking across 320px–1920px in `truck.module.css` | M3 | ORIGINAL_REQUEST §R3 |
| 9 | Test Suite & Build Verification | Preserve 166/166 passing tests (`npm.cmd test`), clean typecheck (`npm.cmd run typecheck`), and successful build (`npm.cmd run build`) | M4 | ORIGINAL_REQUEST §R4 |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | Navigation and In-Page Workflows | TruckShell.tsx, billing/page.tsx, payroll/page.tsx | None | DONE |
| M2 | Trip Recording Form and Action Buttons | TruckRecordTab.tsx, LineSendButton.tsx, button styles | None | DONE |
| M3 | Reports Tab Layout and Responsive Styling | TruckReportsTab.tsx, truck.module.css (320px–1920px) | M2 (LineSendButton) | DONE |
| M4 | Comprehensive Verification & Forensic Audit | npm.cmd test (166/166), build, typecheck, mobile QA, teamwork_auditor | M1, M2, M3 | DONE |

## Interface Contracts
### `TruckRecordTab.tsx` ↔ `/api/truck/records`
- `customerId`: string | null. When customer is empty string ("ไม่เรียกเก็บลูกค้า / รถเปล่า"), `customerId` is null and `billable` is false.
- `billable`: boolean. `Boolean(customerId)`.
- `billingSatang`: number | null. Required when `billable === true` and trip is completed; null when `billable === false`.

### `LineSendButton.tsx` ↔ Sibling Layouts (`.actions`, `.toolbar`)
- Outer container: no unconditional empty height. Status message renders conditionally `{status?.text && ...}`.
- Button height: strictly `var(--team-btn-height)` (3.467rem / ~54px).
- Sibling grid alignment: `align-items: start` to prevent unwanted stretching.

### `/truck/billing` In-Page Modals
- `InvoiceModal`: `{ issueDate: string, dueDate: string, note?: string }` submitted to `POST /api/truck/billing` with `action: 'INVOICE'`.
- `PaymentModal`: `{ amountSatang: number, paidDate: string, channel?: string, reference?: string, note?: string }` submitted with `action: 'PAYMENT'`.

### `/truck/payroll` In-Page Modals
- `PayModal`: `{ driverId: string, paidDate: string, note?: string }` submitted to `POST /api/truck/payroll` with `action: 'PAY'`.
- `ReopenModal`: `{ reason: string }` submitted with `action: 'REOPEN'`.

## Code Layout
- `src/components/truck/TruckShell.tsx`: Navigation header and docNav.
- `src/app/truck/billing/page.tsx`: Billing and invoicing page.
- `src/app/truck/payroll/page.tsx`: Driver payroll and workdays page.
- `src/components/truck/TruckRecordTab.tsx`: Daily trip record editing form.
- `src/components/truck/TruckReportsTab.tsx`: Reports toolbar and summary tables.
- `src/components/shared/LineSendButton.tsx`: LINE notification dispatch button and status.
- `src/components/truck/truck.module.css`: CSS module for truck components.
- `src/components/settings/settings.module.css`: Shared form inputs and button utility classes.
- `tests/`: Automated unit and integration test suite.
