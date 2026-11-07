# Mobile Truck QA — 7 November 2026

## Environment and safety

- Local Next.js development server on `http://localhost:3107`.
- Headless Google Chrome through Playwright; viewport 360×844 and 390×844, touch/mobile emulation.
- All `/api/**` traffic intercepted with synthetic fixtures. Unknown API paths fail the test. No Firestore writes, real billing/payment actions, or LINE messages.
- Reproduction: set `QA_NODE_MODULES` to the bundled runtime `node_modules`, start development server on port 3107, then run `node scripts/truck-mobile-qa.mjs`.

## Assertions and screenshots

- Direct URL and reload checked for `/truck`, `/truck/reports`, `/truck/reports/detailed`, `/truck/settings`, `/truck/payroll`, `/truck/billing`, `/truck/review` at both widths.
- Every inspected page: document width does not exceed viewport; no links to `/` or attendance; no time/datetime-local inputs; no browser page errors or unmocked API requests.
- Record form: choose the same master-point set for origin/destination, select customer, enter separate departure `2026-11-30` and arrival `2026-12-02`. Customer master price remains 1,200.00 baht when weight changes from 12.500 to 20.000 tons. Read-only driver amount displays 150.00 baht.
- Mocked save captures `weightKg: 20000`, `billingSatang: 120000`, both actual date strings, no synthesized `departedAt`, and no client `driverPaySatang`. This verifies browser payload and success display; server authority/financial persistence are covered by route tests rather than this browser mock.
- Settings route-price editor uses two SELECT controls, rather than requiring database IDs by hand.
- Review editor inspected with historical trip fixture. Payroll open preview and closed snapshot inspected; billing includes one cross-month trip plus partially paid invoice (1,200 total / 500 received / 700 outstanding).
- Browser navigation from record to reports and Back restores the record view.

## Evidence and limits

Screenshots and machine assertions: `output/truck-qa/mobile-*.png`, `output/truck-qa/mobile-inspection.json`.

Visually inspected Thai record form, route settings, historical review, payroll, and billing captures. No horizontal overflow or clipped form controls observed. Fixed header/bottom navigation are expected overlays in full-page captures; controls remain reachable by scrolling. No UI changes were necessary in this QA pass.

These are mobile browser emulation results, not physical Android/iOS or production acceptance. Mocked APIs do not establish Firestore transaction contention, real payment persistence, or recovery success. Do not substitute these results for the separate recovery/PDF tests.

## Latest run result

`node scripts/truck-mobile-qa.mjs` passed: **22 captures/assertion groups**, widths 360 and 390, **100 intercepted API calls**, **0 live API requests**, **0 page errors**. Both viewport runs start with an open payroll fixture, submit a mock close, and wait for the closed-view PDF action. Final 390px captures show departure 30/11/2026, arrival 02/12/2026, November accounting label, and 1,200.00 flat charge with 20.000 tons; closed payroll shows 450.00 baht (300 base + 150 trip).
