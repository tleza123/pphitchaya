# BRIEFING — 2026-11-06T05:20:00Z

## Mission
Conduct an authoritative codebase survey of architecture, repository pattern, money calculations, styling/shell tokens, settings emojis, dependencies, and test mocking patterns.

## 🔒 My Identity
- Archetype: teamwork_explorer
- Roles: codebase investigation, architecture survey, synthesis
- Working directory: c:\Users\tleza\Documents\GitHub\pphitchaya\.agents\teamwork\teamwork_explorer_survey_1\
- Original parent: 2cf3c4d2-1537-4198-aafe-2687785ec9ab
- Milestone: codebase-survey

## 🔒 Key Constraints
- Read-only investigation — do NOT implement
- Write only to my folder: .agents/teamwork/teamwork_explorer_survey_1/
- Ponytail rule: concise, factual, no bloat

## Current Parent
- Conversation ID: 2cf3c4d2-1537-4198-aafe-2687785ec9ab
- Updated: 2026-11-06T05:20:00Z

## Investigation State
- **Explored paths**:
  - `src/lib/server/repository.ts`
  - `src/lib/firebase/admin.ts`
  - `src/lib/payroll/money.ts`
  - `src/styles/tokens.css`
  - `src/components/shell/AppHeader.tsx`, `AppShell.tsx`, `BottomNav.tsx`, `shell.module.css`
  - `src/components/settings/SettingsTab.tsx`
  - `src/app/api/employees/[id]/photo/route.ts`
  - `src/app/api/reports/export/route.ts`, `src/lib/server/salary-pdf.ts`
  - `package.json`, `next.config.mjs`, `vercel.json`, `tsconfig.json`
  - `tests/attendance-route.test.ts`, `tests/client-navigation.test.ts`, `tests/payroll.test.ts`
  - Scratch truck app prototype at `c:\Users\tleza\.gemini\antigravity\scratch\truck-app\index.html`
- **Key findings**:
  - Architecture uses strict `shops/{shopId}/...` hierarchy in Cloud Firestore.
  - Test runner is Node's built-in `tsx --test tests/**/*.test.ts`, mocking `globalThis.adminDb` with in-memory Map and transaction assertions (reads before writes).
  - All monetary values are integer satang (0 - 100,000,000) using `moneySatang()`, `validateSatang()`, `formatMoney()`.
  - Emoji scan across entire `src/` revealed EXACTLY two emojis in `src/components/settings/SettingsTab.tsx`: line 1380 (`💡`) and line 1384 (`✅`). No others exist.
  - Dependencies: `sharp`, `pdfkit`, `lucide-react`, `fflate`, `firebase-admin` are already present. No new npm package is needed.
  - `next.config.mjs` configures `serverExternalPackages: ['firebase-admin', 'sharp', 'pdfkit']`.
  - `vercel.json` currently only specifies `"regions": ["sin1"]`. Needs cron configuration for daily LINE summary.
  - Tests passing: 50/50. Typecheck passing: 0 errors. Production build succeeds.
- **Unexplored areas**: None for survey scope.

## Key Decisions Made
- Document findings systematically according to the 5-component handoff report.

## Artifact Index
- DISPATCH.md — incoming dispatch instructions
- BRIEFING.md — persistent working memory
- progress.md — liveness heartbeat
- handoff.md — final survey report
