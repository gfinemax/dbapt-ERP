# ERP MVP Shell Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first runnable Next.js ERP shell with a styled dashboard mock aligned to `DESIGN.md` and `docs/design/erp-screen-wireframes.md`.

**Architecture:** Scaffold a Next.js App Router project in the current root, keep reference files under `docs/` and `data-reference/`, and isolate custom ERP UI into small components and typed mock data. The first implementation is read-only mock UI so API integration can be added after the visual and navigation structure is confirmed.

**Tech Stack:** Next.js App Router, TypeScript, Tailwind CSS, shadcn/ui conventions, lucide-react, Vitest, Testing Library.

---

### Task 1: Project Safety And Scaffold

**Files:**
- Create/modify: `.gitignore`
- Create: Next.js scaffold files under `src/`, `public/`, and root config files
- Create: `components.json`

- [ ] **Step 1: Add repository safety ignores before Git tracking**

Create `.gitignore` with this content:

```gitignore
node_modules
.next
out
dist
build
.env
.env*
!.env.example
.vercel
.turbo
coverage
.tmp-repos
*.log
```

- [ ] **Step 2: Scaffold Next.js non-interactively**

Run:

```powershell
npx create-next-app@latest . --yes --force --typescript --tailwind --eslint --app --src-dir --import-alias "@/*" --turbopack --use-npm
```

Expected: project files are created without deleting `DESIGN.md`, `docs/`, `data-reference/`, or `.tmp-repos/`.

- [ ] **Step 3: Initialize shadcn non-interactively**

Run:

```powershell
npx shadcn@latest init -d
```

Expected: `components.json`, `src/lib/utils.ts`, and theme-compatible files exist.

- [ ] **Step 4: Add UI and test dependencies**

Run:

```powershell
npm install lucide-react class-variance-authority clsx tailwind-merge
npm install -D vitest @testing-library/react @testing-library/jest-dom jsdom
```

Expected: dependencies are saved in `package.json`.

### Task 2: Test Harness

**Files:**
- Create: `vitest.config.ts`
- Create: `src/test/setup.ts`
- Modify: `package.json`

- [ ] **Step 1: Create Vitest configuration**

Create `vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
  },
});
```

- [ ] **Step 2: Create test setup**

Create `src/test/setup.ts`:

```ts
import "@testing-library/jest-dom/vitest";
```

- [ ] **Step 3: Add test scripts**

Set `package.json` scripts to include:

```json
{
  "test": "vitest run",
  "test:watch": "vitest"
}
```

### Task 3: Dashboard Data Contract

**Files:**
- Test: `src/features/dashboard/dashboard-data.test.ts`
- Create: `src/features/dashboard/dashboard-data.ts`

- [ ] **Step 1: Write failing data tests**

Create `src/features/dashboard/dashboard-data.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { dashboardModules, dashboardStats, integrationStatuses } from "./dashboard-data";

describe("dashboard data", () => {
  it("defines the five ERP module cards in display order", () => {
    expect(dashboardModules.map((module) => module.name)).toEqual([
      "조합원관리",
      "총회관리",
      "토지관리",
      "수지분석",
      "문서/공지",
    ]);
  });

  it("keeps the key dashboard stats available for the first screen", () => {
    expect(dashboardStats.map((stat) => stat.label)).toEqual([
      "전체 조합원",
      "납부율",
      "토지 확보율",
      "다음 총회",
    ]);
  });

  it("tracks all five integration sources", () => {
    expect(integrationStatuses.map((status) => status.source)).toEqual([
      "peopleON",
      "VoteCast",
      "db-landon",
      "valueON",
      "dbapt-site",
    ]);
  });
});
```

- [ ] **Step 2: Run test and verify it fails**

Run:

```powershell
npm test -- src/features/dashboard/dashboard-data.test.ts
```

Expected: fail because `src/features/dashboard/dashboard-data.ts` does not exist.

- [ ] **Step 3: Implement dashboard data**

Create `src/features/dashboard/dashboard-data.ts` with typed arrays for KPI cards, module cards, warnings, tasks, activity, and integration statuses.

- [ ] **Step 4: Run test and verify it passes**

Run:

```powershell
npm test -- src/features/dashboard/dashboard-data.test.ts
```

Expected: pass.

### Task 4: ERP Shell And Dashboard UI

**Files:**
- Test: `src/features/dashboard/dashboard-page.test.tsx`
- Modify: `src/app/page.tsx`
- Modify: `src/app/layout.tsx`
- Modify: `src/app/globals.css`
- Create: `src/features/dashboard/dashboard-page.tsx`
- Create: `src/components/erp-shell.tsx`

- [ ] **Step 1: Write failing render test**

Create `src/features/dashboard/dashboard-page.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DashboardPage } from "./dashboard-page";

describe("DashboardPage", () => {
  it("renders the ERP shell and first dashboard modules", () => {
    render(<DashboardPage />);

    expect(screen.getByRole("heading", { name: "대방동 지역주택조합 ERP" })).toBeInTheDocument();
    expect(screen.getByText("조합원관리")).toBeInTheDocument();
    expect(screen.getByText("총회관리")).toBeInTheDocument();
    expect(screen.getByText("연동 상태")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test and verify it fails**

Run:

```powershell
npm test -- src/features/dashboard/dashboard-page.test.tsx
```

Expected: fail because `DashboardPage` does not exist.

- [ ] **Step 3: Implement ERP shell and dashboard**

Create `src/components/erp-shell.tsx` and `src/features/dashboard/dashboard-page.tsx`, then render `DashboardPage` from `src/app/page.tsx`.

- [ ] **Step 4: Apply design tokens**

Update `src/app/globals.css` with the `DESIGN.md` palette, Pretendard fallback stack, light canvas, card surfaces, and accessible focus styles.

- [ ] **Step 5: Run render test and verify it passes**

Run:

```powershell
npm test -- src/features/dashboard/dashboard-page.test.tsx
```

Expected: pass.

### Task 5: Verification

**Files:**
- Verify: all project files

- [ ] **Step 1: Run all tests**

Run:

```powershell
npm test
```

Expected: all tests pass.

- [ ] **Step 2: Run lint**

Run:

```powershell
npm run lint
```

Expected: no lint errors.

- [ ] **Step 3: Run production build**

Run:

```powershell
npm run build
```

Expected: build completes.

- [ ] **Step 4: Start local dev server**

Run:

```powershell
npm run dev -- --hostname 127.0.0.1 --port 3000
```

Expected: local app serves at `http://127.0.0.1:3000`.

- [ ] **Step 5: Browser verify**

Open `http://127.0.0.1:3000` and verify that the dashboard renders, text does not overlap, and the visual direction matches the design concept.

