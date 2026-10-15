# Shared Space Themes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add shared space-level hero themes and render the active members' selected animal avatars in the homepage welcome artwork.

**Architecture:** Store a validated `theme_id` on `spaces`, expose it through the existing space summary/settings flow, and keep the theme-to-CSS mapping in a small shared catalog. Replace the fixed homepage mascot with a focused `GroupHeroArtwork` component that receives already loaded members and renders one or two existing `Avatar` components plus a `+N` label. The creator edits the shared theme in Space Settings; every member reads the same value through the existing summary refresh/realtime path.

**Tech Stack:** Next.js App Router, React client components, TypeScript, Supabase/PostgreSQL migrations, PGlite local migrations, Vitest, Testing Library, ESLint.

---

### Task 1: Define and test the theme catalog

**Files:**
- Create: `lib/spaces/themes.ts`
- Create: `tests/unit/space-themes.test.ts`

- [ ] **Step 1: Write the failing catalog tests**

Add tests for the four exact IDs (`growth-purple`, `morning-cream`, `mint-blue`, `sunset-coral`), their labels/classes, and rejection of arbitrary values:

```ts
import { describe, expect, it } from "vitest";
import { SPACE_THEME_OPTIONS, isSpaceThemeId } from "@/lib/spaces/themes";

describe("space theme catalog", () => {
  it("exposes the four supported shared themes", () => {
    expect(SPACE_THEME_OPTIONS.map((option) => option.id)).toEqual([
      "growth-purple",
      "morning-cream",
      "mint-blue",
      "sunset-coral",
    ]);
  });

  it("accepts only catalog IDs", () => {
    expect(isSpaceThemeId("growth-purple")).toBe(true);
    expect(isSpaceThemeId("url(javascript:alert(1))")).toBe(false);
    expect(isSpaceThemeId(null)).toBe(false);
  });
});
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run: `pnpm exec vitest run tests/unit/space-themes.test.ts`

Expected: FAIL because `lib/spaces/themes.ts` does not exist.

- [ ] **Step 3: Implement the catalog**

Create a readonly catalog with `id`, `label`, `className`, `from`, `to`, and `accent` values. Export `SpaceThemeId`, `SPACE_THEME_OPTIONS`, `DEFAULT_SPACE_THEME_ID = "growth-purple"`, and `isSpaceThemeId(value: unknown): value is SpaceThemeId`.

- [ ] **Step 4: Run the focused test and verify it passes**

Run: `pnpm exec vitest run tests/unit/space-themes.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit the catalog**

```bash
git add lib/spaces/themes.ts tests/unit/space-themes.test.ts
git commit -m "feat: define shared space theme catalog"
```

### Task 2: Persist and validate the shared theme

**Files:**
- Create: `supabase/migrations/20261013001100_space_themes.sql`
- Modify: `lib/supabase/types.ts`
- Modify: `lib/data/space-summary.ts`
- Modify: `app/api/spaces/[spaceId]/route.ts`
- Test: `tests/integration/space-themes.test.ts`

- [ ] **Step 1: Write the failing migration/API tests**

Cover defaulting old rows to `growth-purple`, returning `theme_id` in the summary, allowing the creator to update a catalog ID, and rejecting a non-creator or unknown ID. The test fixture must apply all migrations through `20261013001100_space_themes.sql` and assert:

```ts
expect(space.theme_id).toBe("growth-purple");
expect(await updateTheme("mint-blue")).toMatchObject({ theme_id: "mint-blue" });
expect(await updateThemeAsMember("sunset-coral")).toHaveStatus(403);
expect(await updateTheme("neon-invalid")).toHaveStatus(400);
```

- [ ] **Step 2: Run the integration test and verify it fails**

Run: `pnpm exec vitest run tests/integration/space-themes.test.ts --pool=threads --maxWorkers=1`

Expected: FAIL because the column, summary field, and update validation do not exist.

- [ ] **Step 3: Add the database migration**

Create `20261013001100_space_themes.sql`:

```sql
alter table public.spaces
  add column theme_id text not null default 'growth-purple'
  check (theme_id in ('growth-purple','morning-cream','mint-blue','sunset-coral'));
```

Keep the migration additive so existing spaces receive the default without changing membership, tasks, chat, or avatars.

- [ ] **Step 4: Update types, summary, and settings API**

Add `theme_id: SpaceThemeId` to the spaces row/type and `theme_id` to the summary select. In the existing `PATCH /api/spaces/[spaceId]` route, validate `themeId` with `isSpaceThemeId`, preserve the existing name/avatar update behavior, and update only fields supplied by the request. Keep the existing creator permission check so ordinary members cannot change the shared theme.

- [ ] **Step 5: Run the integration test and verify it passes**

Run: `pnpm exec vitest run tests/integration/space-themes.test.ts --pool=threads --maxWorkers=1`

Expected: PASS, including migration default and permission cases.

- [ ] **Step 6: Commit persistence changes**

```bash
git add supabase/migrations/20261013001100_space_themes.sql lib/supabase/types.ts lib/data/space-summary.ts app/api/spaces/[spaceId]/route.ts tests/integration/space-themes.test.ts
git commit -m "feat: persist shared space themes"
```

### Task 3: Build the member-driven hero artwork

**Files:**
- Create: `components/space/GroupHeroArtwork.tsx`
- Create: `components/space/GroupHeroArtwork.module.css`
- Modify: `app/(space)/[spaceId]/page.tsx`
- Modify: `app/globals.css`
- Test: `tests/unit/group-hero-artwork.test.tsx`

- [ ] **Step 1: Write the failing component tests**

Test active-member filtering, stable join-order selection, one member, two members, and the `+N 位伙伴` label:

```tsx
it("renders the first two active members and the remaining count", () => {
  render(<GroupHeroArtwork members={members} />);
  expect(screen.getByLabelText("袁帅的狮子头像")).toBeTruthy();
  expect(screen.getByLabelText("然然的兔子头像")).toBeTruthy();
  expect(screen.getByText("+1 位伙伴")).toBeTruthy();
  expect(screen.queryByLabelText("已退出成员的头像")).toBeNull();
});
```

- [ ] **Step 2: Run the component test and verify it fails**

Run: `pnpm exec vitest run tests/unit/group-hero-artwork.test.tsx --pool=threads --maxWorkers=1`

Expected: FAIL because the component does not exist.

- [ ] **Step 3: Implement `GroupHeroArtwork`**

Filter `removed_at === null`, preserve the incoming join order, render at most two `Avatar` components with `size="lg"`, and render a text badge for the remaining active members. If there are no active members, render the existing `Mascot` fallback. Do not perform data fetching inside this component.

- [ ] **Step 4: Replace the fixed homepage mascot**

In `app/(space)/[spaceId]/page.tsx`, import `GroupHeroArtwork`, pass `data.members`, and pass `data.space.theme_id` to a `theme-${themeId}` class on `.welcome-banner`. Keep the existing copy/button and preserve the welcome card's fixed responsive height.

- [ ] **Step 5: Add theme styles**

Add four predefined `.theme-growth-purple`, `.theme-morning-cream`, `.theme-mint-blue`, and `.theme-sunset-coral` styles. Each class must define the banner gradient, ring opacity, readable text color, and button accent; no user-provided string may be interpolated into CSS.

- [ ] **Step 6: Run the component test and verify it passes**

Run: `pnpm exec vitest run tests/unit/group-hero-artwork.test.tsx --pool=threads --maxWorkers=1`

Expected: PASS.

- [ ] **Step 7: Commit hero artwork**

```bash
git add components/space/GroupHeroArtwork.tsx components/space/GroupHeroArtwork.module.css app/(space)/[spaceId]/page.tsx app/globals.css tests/unit/group-hero-artwork.test.tsx
git commit -m "feat: render member-driven homepage artwork"
```

### Task 4: Add shared theme controls to Space Settings

**Files:**
- Modify: `components/space/SpaceSettings.tsx`
- Modify: `components/space/SpaceSettings.module.css`
- Test: `tests/unit/space-settings.test.tsx`

- [ ] **Step 1: Extend settings tests with a creator theme picker**

Assert that the creator sees four radio options with labels, selecting one updates the preview class, saving sends `{ themeId: "mint-blue" }`, and a failed response restores the previous theme and shows the error.

- [ ] **Step 2: Add the theme picker UI**

Use the existing settings form and permission state. Render swatches, labels, and a small two-avatar preview. Keep the picker keyboard accessible with `role="radiogroup"`, `role="radio"`, `aria-checked`, and visible focus styles. Do not show edit controls to ordinary members.

- [ ] **Step 3: Connect saving to the existing settings API**

Send only the changed `themeId` field to the existing space settings endpoint, keep the current name/avatar update payload intact, and update local state only after a successful response. On failure, restore the previous theme.

- [ ] **Step 4: Run the settings tests**

Run: `pnpm exec vitest run tests/unit/space-settings.test.tsx --pool=threads --maxWorkers=1`

Expected: PASS.

- [ ] **Step 5: Commit settings UI**

```bash
git add components/space/SpaceSettings.tsx components/space/SpaceSettings.module.css tests/unit/space-settings.test.tsx
git commit -m "feat: add shared homepage theme settings"
```

### Task 5: Full verification and deployment handoff

**Files:**
- Modify: `docs/email-accounts-deployment.md` or the deployment guide that lists Supabase migrations, adding `20261013001100_space_themes.sql` to the ordered migration list.

- [ ] **Step 1: Run focused and full checks**

```bash
pnpm exec vitest run tests/unit/space-themes.test.ts tests/unit/group-hero-artwork.test.tsx tests/unit/space-settings.test.tsx tests/integration/space-themes.test.ts --pool=threads --maxWorkers=1
pnpm exec tsc --noEmit
pnpm exec eslint components/space/GroupHeroArtwork.tsx components/space/SpaceSettings.tsx app/(space)/[spaceId]/page.tsx lib/spaces/themes.ts
pnpm build
```

Expected: all focused tests pass, type checking and ESLint exit 0, and production build completes.

- [ ] **Step 2: Verify responsive behavior**

Check desktop and mobile breakpoints: the banner height stays stable, the member artwork does not overflow, the `+N` badge remains visible, and theme text/button contrast stays readable.

- [ ] **Step 3: Update migration documentation**

Add the new migration to the Supabase execution order and explicitly state that production must run it before the Vercel deployment uses the new `theme_id` field.

- [ ] **Step 4: Commit documentation and final changes**

```bash
git add docs/email-accounts-deployment.md
git commit -m "docs: add shared theme migration guidance"
```

- [ ] **Step 5: Push and verify deployment**

```bash
git push origin main
git ls-remote origin refs/heads/main
```

Then confirm Vercel responds with HTTP 200 and report the commit hash. Supabase migration execution remains a required dashboard/CLI action because credentials are not stored in the repository.
