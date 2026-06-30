# Compact Role Workspaces Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce the delivery workspace first-screen height by turning the overview into a compact command surface while keeping detailed workflow evidence inside business tabs or expandable panels.

**Architecture:** Keep existing workflow state in `src/App.jsx` and the current presentational boundary in `src/features/projects/ProjectWorkspace.jsx`. Add overview-specific compact rendering to `ProjectWorkspace` and tighten the delivery overview dashboard in `App.jsx` without changing backend or workflow contracts.

**Tech Stack:** React 19, Vitest, Testing Library, Vite, CSS modules through existing global stylesheets.

---

## File Map

- Modify: `src/features/projects/ProjectWorkspace.jsx`
  - Add a compact overview header variant when `activeTab === 'overview'`.
  - Keep full stage details available through an expandable details element.
  - Preserve existing tabs and stage navigation behavior.
- Modify: `src/App.jsx`
  - Extend `DeliveryOverviewDashboard` with a compact role task strip and avoid adding long text blocks to the overview.
- Modify: `src/control-console.css`
  - Add layout rules for the compact project command strip and role task strip.
  - Add responsive rules for desktop, tablet, and mobile.
- Modify: `src/App.test.jsx`
  - Add acceptance coverage for the delivery overview staying compact while detailed panels remain out of the default overview.
- Modify: `src/features/projects/ProjectWorkspace.test.jsx`
  - Add component-level coverage for compact overview behavior and expandable detail access.

## Task 1: Compact Project Workspace Overview

**Files:**
- Modify: `src/features/projects/ProjectWorkspace.jsx`
- Modify: `src/features/projects/ProjectWorkspace.test.jsx`
- Modify: `src/control-console.css`

- [ ] **Step 1: Write the failing component test**

```jsx
test('uses a compact command strip on the overview and keeps stage detail expandable', () => {
  render(<ProjectWorkspace activeTab="overview" project={project} selectedStageId="requirements" />);

  expect(screen.getByLabelText('项目概览状态条')).toBeInTheDocument();
  expect(screen.queryByLabelText('当前阶段行动条')).not.toBeInTheDocument();
  expect(screen.queryByLabelText('交付焦点摘要')).not.toBeInTheDocument();

  const details = screen.getByLabelText('阶段详情抽屉');
  expect(details).toBeInTheDocument();
  expect(within(details).getByText('展开阶段详情')).toBeInTheDocument();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/features/projects/ProjectWorkspace.test.jsx -t "compact command strip"`

Expected: FAIL because `项目概览状态条` and `阶段详情抽屉` do not exist yet.

- [ ] **Step 3: Implement compact overview rendering**

In `ProjectWorkspace`, derive `const isOverviewTab = activeTab === 'overview';`.

Render `ProjectOverviewStatusStrip` instead of `ProjectFocusSummary` and `StageActionBar` when `isOverviewTab` is true. Render the full detail through:

```jsx
<details className="stage-overview-drawer" aria-label="阶段详情抽屉">
  <summary>
    <span>展开阶段详情</span>
    <small>{stageDeliveryDetail?.stageName || '待确认'}</small>
  </summary>
  <StageActionBar ... />
  <StageDeliveryDetail detail={stageDeliveryDetail} />
</details>
```

- [ ] **Step 4: Run component test to verify it passes**

Run: `npm test -- src/features/projects/ProjectWorkspace.test.jsx -t "compact command strip"`

Expected: PASS.

## Task 2: Delivery Overview Role Task Strip

**Files:**
- Modify: `src/App.jsx`
- Modify: `src/App.test.jsx`
- Modify: `src/control-console.css`

- [ ] **Step 1: Write the failing integration test**

```jsx
test('shows a compact role task strip on the delivery overview', async () => {
  render(<App />);
  fireEvent.click(await screen.findByRole('button', { name: '交付控制' }));

  const workspace = await screen.findByLabelText('项目工作区');
  const compactOverview = within(workspace).getByLabelText('交付概览驾驶舱');

  expect(within(compactOverview).getByLabelText('角色任务速览')).toBeInTheDocument();
  expect(within(compactOverview).getByRole('button', { name: '进入当前阶段处理' })).toBeInTheDocument();
  expect(within(workspace).queryByLabelText('流程导航列')).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/App.test.jsx -t "compact role task strip"`

Expected: FAIL because `角色任务速览` is not rendered yet.

- [ ] **Step 3: Implement role task strip**

Add a `DeliveryOverviewRoleStrip` inside `DeliveryOverviewDashboard`. It should render no more than four compact items: current owner, current stage state, pending confirmations, and risk count. It must not duplicate full forms, checklists, or evidence text.

- [ ] **Step 4: Run integration test to verify it passes**

Run: `npm test -- src/App.test.jsx -t "compact role task strip"`

Expected: PASS.

## Task 3: Regression and Browser Acceptance

**Files:**
- Verify only.

- [ ] **Step 1: Run targeted project workspace tests**

Run: `npm test -- src/features/projects/ProjectWorkspace.test.jsx src/App.test.jsx -t "compact|delivery overview"`

Expected: PASS.

- [ ] **Step 2: Run full test suite**

Run: `npm test`

Expected: PASS.

- [ ] **Step 3: Run production build**

Run: `npm run build`

Expected: PASS.

- [ ] **Step 4: Browser inspect the delivery overview**

Open `http://127.0.0.1:5173/`, select `交付控制`, and verify:

- The overview contains `项目概览状态条` and `交付概览驾驶舱`.
- The default overview does not contain the three detailed columns.
- There is no page-level horizontal scrolling on desktop.
- The stage details remain reachable by expanding `阶段详情抽屉`.

## Self-Review

- Spec coverage: This plan implements the compact overview, keeps detailed workflow evidence available, and preserves the role-adaptive shell direction from the frontend redesign spec.
- Placeholder scan: No `TBD`, `TODO`, or unspecified implementation steps remain.
- Type consistency: New labels are plain aria labels and component names that do not alter workflow data types.
