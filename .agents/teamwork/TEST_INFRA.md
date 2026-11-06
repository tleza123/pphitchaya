# E2E Test Infra: Truck App & LINE Integration

## Test Philosophy
- Opaque-box, requirement-driven derivation from ORIGINAL_REQUEST.md.
- Zero reliance on external network: mock `(globalThis as any).adminDb` and `globalThis.fetch`.
- Methodology: Category-Partition + BVA + Pairwise + Workload Testing across Tiers 1-4.

## Feature Inventory & Test Mapping
| # | Feature | Test Suite | Tiers Covered | Status |
|---|---------|------------|---------------|--------|
| 1 | Truck Engine & Calculations | `tests/truck-engine.test.ts` | Tier 1, Tier 2 | Planned (Wave 1) |
| 2 | LINE Summary & Flex Cards | `tests/line-summary.test.ts` | Tier 1, Tier 2, Tier 3 | Planned (Wave 1) |
| 3 | Truck Routes & Transactions | `tests/truck-routes.test.ts` | Tier 1, Tier 2, Tier 3 | Planned (Wave 2) |
| 4 | Truck Reports & Exports | `tests/truck-reports-route.test.ts` | Tier 1, Tier 2, Tier 3 | Planned (Wave 2) |
| 5 | Full Integration & Build | All tests + typecheck + build | Tier 4 | Planned (Wave 4) |

## Test Architecture
- Test runner: `npx.cmd tsx --test <test-file>` (or `npm.cmd test`).
- Assertions: `node:assert/strict`.
- Strict validation of transaction Read-Before-Write rules in all route tests.
- Mocking external LINE API network requests: intercept `globalThis.fetch` to assert payload JSON format, headers (`Authorization: Bearer ...`, `Content-Type: application/json`), and correct Flex bubble color schemes.
- Verification of 1 daily record per truck: `{dateKey}_{truckId}` ID idempotency and revision increments.

## Real-World Application Scenarios (Tier 4)
| # | Scenario | Features Exercised |
|---|----------|--------------------|
| 1 | Full day workflow for multiple trucks with mixed destinations and fuel bills | F1, F2, F3, F10, F11, F15 |
| 2 | In-place edit of same-day same-truck record when adding an afternoon trip | F10, F15, F16 |
| 3 | Daily 19:00 Cron triggering dual Flex messages to configured LINE targets | F5, F6, F7 |
| 4 | Monthly accounting cycle with CSV/PDF exports and quiet operational charts | F4, F12, F13, F16 |
