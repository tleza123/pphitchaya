## 2026-11-06T05:14:28Z
You are teamwork_explorer (Survey Instance 1).
Your working directory is: c:\Users\tleza\Documents\GitHub\pphitchaya\.agents\teamwork\teamwork_explorer_survey_1\
Original user request path: c:\Users\tleza\Documents\GitHub\pphitchaya\.agents\teamwork\ORIGINAL_REQUEST.md
Project directory: c:\Users\tleza\Documents\GitHub\pphitchaya

Your task is to conduct an authoritative codebase survey focusing on:
1. Existing architecture & repository pattern:
   - Read `src/lib/server/repository.ts` and inspect Firestore access patterns (shopId partitioning, subcollections, transactions).
   - Read `src/lib/payroll/money.ts` to inspect how `moneySatang()`, `validateSatang()`, and `formatMoney()` work.
   - Read `src/styles/tokens.css` and `src/components/shell/` to understand existing design tokens, AppShell, navigation, headers.
   - Inspect `src/components/settings/SettingsTab.tsx` around lines 1380, 1384 to find any remaining emojis (e.g. 💡, ✅) and understand how settings tabs are organized.
2. Existing dependencies & configuration:
   - Inspect `package.json`, `next.config.mjs`, `vercel.json`, `tsconfig.json`. Check available libraries (e.g. sharp, pdfkit, lucide-react) and verify no unnecessary npm packages need to be installed.
3. Code layout conventions and existing test patterns:
   - Inspect existing tests in `tests/` (e.g., `tests/attendance-route.test.ts`, `tests/client-navigation.test.ts`, etc.) to see how `globalThis.adminDb` is mocked and how route handlers and calculations are tested.

Write your findings to `c:\Users\tleza\Documents\GitHub\pphitchaya\.agents\teamwork\teamwork_explorer_survey_1\handoff.md`.
Also maintain `progress.md` with "Last visited: [timestamp]" during your work.
When finished, send a message back to the orchestrator summarizing your key findings and citing file paths.
