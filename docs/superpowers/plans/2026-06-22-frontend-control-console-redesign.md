# Frontend Control Console Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current all-in-one dashboard layout with a hybrid, role-adaptive delivery console while preserving existing workflow and API behavior.

**Architecture:** Add a tested navigation model and a reusable application shell around the existing stateful `App`. Route top-level content through workspace, projects, tasks, delivery, and operations destinations; retain existing feature panels as the functional core while progressively wrapping them in focused project and operations surfaces. Apply a new token-based CSS layer and verify it at desktop, tablet, and mobile widths.

**Tech Stack:** React 19, Vite 8, Vitest 4, Testing Library, CSS, Lucide React.

**Repository note:** `D:\project\WeeCoder` is not a Git repository. Commit checkpoints are replaced by test/build checkpoints; no commit commands should be run.

---

## File Map

- Create `src/ui/navigation.js`: role-aware destination definitions and stage-to-tab mapping.
- Create `src/ui/navigation.test.js`: pure navigation and stage mapping tests.
- Create `src/ui/AppShell.jsx`: navigation rail, command bar, account menu, responsive destination controls.
- Create `src/ui/StatusBadge.jsx`: shared semantic status rendering.
- Create `src/ui/MetricTile.jsx`: stable metric primitive.
- Create `src/features/projects/ProjectCenter.jsx`: searchable project portfolio table.
- Create `src/features/projects/ProjectWorkspace.jsx`: project header, workflow strip, workspace tabs, context layout.
- Create `src/features/operations/OperationsConsole.jsx`: dedicated operations destination and sub-navigation.
- Create `src/control-console.css`: redesign tokens, shell, tables, responsive behavior, and legacy panel normalization.
- Modify `src/App.jsx`: destination state, shell composition, focused task routing, and conditional top-level content.
- Modify `src/main.jsx`: import the redesign stylesheet after legacy styles.
- Modify `src/App.test.jsx`: integration coverage for navigation, role workspaces, deep links, and operations separation.
- Modify `package.json` and `package-lock.json`: add `lucide-react`.

### Task 1: Role-Aware Navigation Contract

**Files:**
- Create: `src/ui/navigation.js`
- Create: `src/ui/navigation.test.js`

- [ ] **Step 1: Write failing navigation tests**

```js
import { describe, expect, test } from 'vitest';
import { getNavigationItems, getWorkspaceTabForStage } from './navigation.js';

describe('control console navigation', () => {
  test('shows operations only to authorized owner and technical roles', () => {
    expect(getNavigationItems({ role: 'owner' }).map((item) => item.id)).toEqual([
      'workspace', 'projects', 'tasks', 'delivery', 'operations',
    ]);
    expect(getNavigationItems({ role: 'qa' }).map((item) => item.id)).toEqual([
      'workspace', 'projects', 'tasks', 'delivery',
    ]);
  });

  test('maps task stages to stable project workspace tabs', () => {
    expect(getWorkspaceTabForStage('pm-requirements')).toBe('requirements');
    expect(getWorkspaceTabForStage('ops-requirements')).toBe('architecture-ops');
    expect(getWorkspaceTabForStage('qa')).toBe('qa');
  });
});
```

- [ ] **Step 2: Run the test and verify RED**

Run: `npm test -- src/ui/navigation.test.js`

Expected: FAIL because `src/ui/navigation.js` does not exist.

- [ ] **Step 3: Implement the navigation model**

```js
export const NAV_ITEMS = Object.freeze([
  { id: 'workspace', label: '我的工作台', icon: 'LayoutDashboard' },
  { id: 'projects', label: '项目中心', icon: 'FolderKanban' },
  { id: 'tasks', label: '任务队列', icon: 'ListTodo' },
  { id: 'delivery', label: '交付控制', icon: 'Workflow' },
  { id: 'operations', label: '运营后台', icon: 'Command', roles: ['owner', 'tech-lead'] },
]);

const STAGE_TABS = Object.freeze({
  intake: 'overview',
  'pm-requirements': 'requirements',
  'prd-approval': 'requirements',
  architecture: 'architecture-ops',
  'ops-requirements': 'architecture-ops',
  development: 'development',
  review: 'review',
  qa: 'qa',
  acceptance: 'acceptance',
  'defect-loop': 'development',
});

export function getNavigationItems(user) {
  return NAV_ITEMS.filter((item) => !item.roles || item.roles.includes(user?.role));
}

export function getWorkspaceTabForStage(stageId) {
  return STAGE_TABS[stageId] || 'overview';
}
```

- [ ] **Step 4: Run the test and verify GREEN**

Run: `npm test -- src/ui/navigation.test.js`

Expected: 2 tests pass.

### Task 2: Application Shell and Accessible Navigation

**Files:**
- Create: `src/ui/AppShell.jsx`
- Create: `src/ui/StatusBadge.jsx`
- Create: `src/ui/MetricTile.jsx`
- Modify: `package.json`
- Modify: `package-lock.json`
- Test: `src/App.test.jsx`

- [ ] **Step 1: Add a failing shell integration test**

Add a test that authenticates as the demo owner and asserts:

```jsx
expect(await screen.findByLabelText('主导航')).toBeInTheDocument();
expect(screen.getByRole('button', { name: '我的工作台' })).toHaveAttribute('aria-current', 'page');
expect(screen.getByRole('button', { name: '运营后台' })).toBeInTheDocument();
expect(screen.getByLabelText('顶部命令栏')).toBeInTheDocument();
expect(screen.getByRole('button', { name: '打开账户菜单' })).toBeInTheDocument();
```

- [ ] **Step 2: Run the targeted test and verify RED**

Run: `npm test -- src/App.test.jsx -t "renders the role-aware control console shell"`

Expected: FAIL because the new landmarks and controls are absent.

- [ ] **Step 3: Install icons and implement shell primitives**

Run: `npm install lucide-react`

Implement `AppShell` with these public props:

```jsx
export function AppShell({
  activeDestination,
  children,
  currentUser,
  demoUsers,
  navigationItems,
  notificationsCount,
  onDestinationChange,
  onLogout,
  onOrganizationChange,
  onUserChange,
  organization,
  organizations,
}) {
  // Render <aside aria-label="主导航">, <header aria-label="顶部命令栏">,
  // an account menu button, and <section className="console-content">{children}</section>.
}
```

`StatusBadge` maps `approved`, `active`, `blocked`, `warning`, `failed`, and `queued` to stable semantic classes. `MetricTile` renders a fixed metric label/value/supporting-text structure.

- [ ] **Step 4: Compose `AppShell` in `App.jsx`**

Add:

```jsx
const [activeDestination, setActiveDestination] = useState('workspace');
const navigationItems = useMemo(() => getNavigationItems(currentUser), [currentUser]);
```

Replace the legacy `.app-shell` and permanent project creation sidebar with `AppShell`. Keep existing panels mounted inside the shell temporarily so the workflow remains functional during this checkpoint.

- [ ] **Step 5: Run targeted and full tests**

Run: `npm test -- src/App.test.jsx -t "renders the role-aware control console shell"`

Expected: targeted shell test passes.

Run: `npm test -- --run`

Expected: all existing behavior tests pass or failures are limited to assertions that intentionally expect the removed permanent sidebar.

### Task 3: Role-Adaptive Workspace and Account Menu

**Files:**
- Modify: `src/App.jsx`
- Modify: `src/App.test.jsx`
- Modify: `src/ui/AppShell.jsx`

- [ ] **Step 1: Write failing role workspace tests**

```jsx
expect(await screen.findByLabelText('负责人工作台')).toBeInTheDocument();
expect(screen.queryByLabelText('商业化运营后台')).not.toBeInTheDocument();

fireEvent.click(screen.getByRole('button', { name: '打开账户菜单' }));
fireEvent.change(screen.getByLabelText('演示用户'), { target: { value: 'ops-wang' } });
expect(await screen.findByLabelText('个人工作台')).toBeInTheDocument();
expect(screen.getByText('Ops workbench')).toBeInTheDocument();
```

- [ ] **Step 2: Run the tests and verify RED**

Run: `npm test -- src/App.test.jsx -t "uses a role-adaptive default workspace"`

Expected: FAIL because the operations cockpit is still on the default page and demo switching is not in the account menu.

- [ ] **Step 3: Implement destination composition**

In `App.jsx`, render only the selected top-level destination:

```jsx
{activeDestination === 'workspace' && (
  isOrganizationOwner
    ? <OrganizationOverviewPanel aria-label="负责人工作台" {...ownerProps} />
    : <PersonalWorkspacePanel {...personalProps} />
)}
{activeDestination === 'tasks' ? <RoleInboxPanel {...inboxProps} /> : null}
{activeDestination === 'operations' && platform ? <OperationsConsole>{platformPanel}</OperationsConsole> : null}
```

Move demo user switching into the account menu while preserving the existing `selectedUserId`, `isUserManuallySelected`, and `/api/me/tasks` reload behavior.

- [ ] **Step 4: Run targeted and full tests**

Run: `npm test -- src/App.test.jsx -t "uses a role-adaptive default workspace"`

Expected: role workspace tests pass.

Run: `npm test -- --run`

Expected: no workflow regressions.

### Task 4: Project Center and Project Creation Dialog

**Files:**
- Create: `src/features/projects/ProjectCenter.jsx`
- Modify: `src/App.jsx`
- Modify: `src/App.test.jsx`

- [ ] **Step 1: Write a failing project center test**

```jsx
fireEvent.click(screen.getByRole('button', { name: '项目中心' }));
expect(await screen.findByLabelText('项目中心')).toBeInTheDocument();
expect(screen.getByRole('table', { name: '项目组合' })).toBeInTheDocument();
expect(screen.getByRole('button', { name: '新建项目' })).toBeInTheDocument();
expect(screen.queryByRole('form', { name: '新建项目' })).not.toBeInTheDocument();
```

- [ ] **Step 2: Run the test and verify RED**

Run: `npm test -- src/App.test.jsx -t "opens the searchable project center"`

Expected: FAIL because projects are still rendered in the permanent sidebar.

- [ ] **Step 3: Implement `ProjectCenter`**

The component accepts `projects`, `loading`, `selectedProjectId`, `onOpenProject`, and `onCreateProject`. It renders a search input, risk/stage filters, and a semantic table with columns for project, current stage, progress, health, owner, and open follow-ups.

Project selection calls:

```js
onOpenProject(project.id);
```

`App.jsx` sets the selected project, switches `activeDestination` to `delivery`, and opens a controlled creation dialog only after the `新建项目` command is clicked.

- [ ] **Step 4: Run targeted and full tests**

Run: `npm test -- src/App.test.jsx -t "opens the searchable project center"`

Expected: project center test passes.

Run: `npm test -- --run`

Expected: project creation and selection behavior still pass.

### Task 5: Focused Project Workspace

**Files:**
- Create: `src/features/projects/ProjectWorkspace.jsx`
- Modify: `src/App.jsx`
- Modify: `src/App.test.jsx`

- [ ] **Step 1: Write failing workspace routing tests**

```jsx
fireEvent.click(screen.getByRole('button', { name: '交付控制' }));
expect(await screen.findByLabelText('项目工作区')).toBeInTheDocument();
expect(screen.getByLabelText('交付阶段')).toBeInTheDocument();
expect(screen.getByRole('tab', { name: '概览' })).toBeInTheDocument();

fireEvent.click(screen.getByRole('button', { name: '处理当前主行动 Confirm operations handoff' }));
expect(screen.getByRole('tab', { name: '架构与运维' })).toHaveAttribute('aria-selected', 'true');
expect(screen.getByLabelText('Ops handoff panel')).toBeInTheDocument();
```

- [ ] **Step 2: Run the tests and verify RED**

Run: `npm test -- src/App.test.jsx -t "routes focused tasks into the project workspace tab"`

Expected: FAIL because the project workspace has no stable tabs.

- [ ] **Step 3: Implement the project workspace wrapper**

`ProjectWorkspace` accepts `project`, `selectedStageId`, `activeTab`, `onStageChange`, `onTabChange`, `context`, and `children`. It renders the project header, stage strip, tablist, main content, and collapsible context rail.

When a personal task opens, `App.jsx` performs:

```js
setActiveDestination('delivery');
setViewStageId(task.stageId);
setActiveProjectTab(getWorkspaceTabForStage(task.stageId));
```

The existing stage, development, review, QA, acceptance, artifact, risk, and history panels remain the tab content and retain their current API actions.

- [ ] **Step 4: Run targeted and full tests**

Run: `npm test -- src/App.test.jsx -t "routes focused tasks into the project workspace tab"`

Expected: deep-link test passes.

Run: `npm test -- --run`

Expected: all task focus, stage confirmation, development, review, QA, and acceptance tests pass.

### Task 6: Dedicated Operations Console

**Files:**
- Create: `src/features/operations/OperationsConsole.jsx`
- Modify: `src/App.jsx`
- Modify: `src/App.test.jsx`

- [ ] **Step 1: Write a failing separation test**

```jsx
expect(screen.queryByLabelText('商业化运营后台')).not.toBeInTheDocument();
fireEvent.click(screen.getByRole('button', { name: '运营后台' }));
expect(await screen.findByLabelText('运营控制台')).toBeInTheDocument();
expect(screen.getByRole('tab', { name: '后台任务' })).toBeInTheDocument();
expect(screen.getByText('部署控制台')).toBeInTheDocument();
```

- [ ] **Step 2: Run the test and verify RED**

Run: `npm test -- src/App.test.jsx -t "separates operations from the owner workspace"`

Expected: FAIL because the cockpit is part of the owner page.

- [ ] **Step 3: Implement operations sub-navigation**

`OperationsConsole` owns an internal tab state with `overview`, `organizations`, `jobs`, `deployments`, `audit`, `sla`, and `cost`. It receives the existing `PlatformCockpitPanel` content and uses section anchors or focused wrappers so existing controls remain functional without API changes.

- [ ] **Step 4: Run targeted and full tests**

Run: `npm test -- src/App.test.jsx -t "separates operations from the owner workspace"`

Expected: separation test passes.

Run: `npm test -- --run`

Expected: platform job, deployment, audit, notification, SLA, and cost tests pass.

### Task 7: Hybrid Visual System and Responsive Layout

**Files:**
- Create: `src/control-console.css`
- Modify: `src/main.jsx`
- Modify: `src/styles.css`
- Modify: `src/App.test.jsx`

- [ ] **Step 1: Add structural accessibility assertions**

```jsx
expect(screen.getByLabelText('主导航')).toBeInTheDocument();
expect(screen.getByLabelText('顶部命令栏')).toBeInTheDocument();
expect(screen.getByRole('main')).toHaveClass('console-main');
expect(screen.getByRole('button', { name: '我的工作台' })).toHaveAttribute('title', '我的工作台');
```

- [ ] **Step 2: Run the targeted test and verify RED**

Run: `npm test -- src/App.test.jsx -t "exposes accessible responsive console landmarks"`

Expected: FAIL until the final shell classes and icon tooltips exist.

- [ ] **Step 3: Implement the token layer**

Define `--console-shell`, `--console-canvas`, `--console-surface`, semantic status colors, text colors, border colors, stable control heights, and spacing tokens in `src/control-console.css`. Import it after `styles.css`:

```js
import './styles.css';
import './control-console.css';
```

Normalize legacy panels so page sections are unframed, repeated items remain compact cards, nested card borders are removed, and forms/tables use stable dimensions.

- [ ] **Step 4: Implement responsive rules**

At `max-width: 1279px`, collapse the context rail and nonessential table columns. At `max-width: 767px`, convert the navigation rail to a fixed bottom bar, keep core task actions visible, stack form controls, and prevent page-level horizontal scrolling.

- [ ] **Step 5: Run tests and production build**

Run: `npm test -- --run`

Expected: all tests pass.

Run: `npm run build`

Expected: Vite production build exits 0.

### Task 8: Browser Acceptance and Final Regression

**Files:**
- Modify as required by failures: `src/control-console.css`, `src/App.jsx`, and focused UI components.

- [ ] **Step 1: Verify owner and role workflows at 1440x900**

Use the in-app browser to verify owner workspace, project center, project workspace, operations console, account menu user switching, operations task focus, and QA task focus. Confirm no console errors.

- [ ] **Step 2: Verify responsive layouts**

Check 1280x720, 1024x768, and 390x844. For each viewport, verify no page-level horizontal overflow, no overlapping controls, stable navigation, readable project rows, and a visible primary role action.

- [ ] **Step 3: Fix each visual defect with a regression assertion when behavioral**

Behavioral defects receive a failing Testing Library test before implementation. Pure CSS defects are documented with before/after browser observations and rechecked at all affected widths.

- [ ] **Step 4: Run final verification**

Run: `npm test -- --run`

Expected: every test file passes with zero failed tests.

Run: `npm run build`

Expected: Vite production build exits 0.

Run: `npm audit --omit=dev`

Expected: zero production dependency vulnerabilities.

