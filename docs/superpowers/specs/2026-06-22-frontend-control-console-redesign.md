# WeeCoder Frontend Control Console Redesign

## Objective

Redesign the existing delivery console into a clear, role-adaptive SaaS administration experience. The redesign must preserve all existing workflow capabilities while reducing first-screen density, improving task discoverability, and establishing a consistent visual system suitable for product demos and daily desktop use.

## Product Direction

The selected direction is a hybrid control console:

- A dark navigation rail and top command bar provide product identity and technical character.
- Light work surfaces provide sufficient contrast and reading comfort for PRDs, test evidence, handoff details, and long forms.
- Teal is the primary action and success color. Amber communicates warnings, red communicates blocking or destructive states, and blue communicates neutral information.
- The interface remains operational and information-dense. It does not use marketing heroes, decorative gradients, nested cards, or oversized headings.

## Information Architecture

The authenticated application has five stable top-level destinations. Navigation items are hidden when the current role cannot use them.

1. **My Workspace**: the role-adaptive default page.
2. **Projects**: project portfolio and project selection.
3. **Tasks**: personal and role task queues.
4. **Delivery Control**: project workflow execution and stage gates.
5. **Operations**: organization, platform jobs, deployments, audit, SLA, notifications, and cost. This destination is visible to owner and authorized administration roles.

Project creation moves from the permanent sidebar into a compact dialog or dedicated action surface opened by a primary `New project` command. The navigation rail remains stable and does not contain editable forms.

## Application Shell

### Navigation Rail

- Fixed desktop width between 64 and 76 pixels.
- Icon-only destinations use familiar Lucide icons and accessible tooltips.
- Active navigation uses a restrained teal surface and visible left indicator.
- Organization settings stay at the bottom of the rail.
- On narrow screens, the rail becomes a bottom navigation bar containing only the most important role destinations.

### Command Bar

- Shows product identity, the current destination, organization selector, project search, notifications, and the signed-in account.
- User simulation remains available only in demo mode and is grouped inside the account menu instead of occupying the main heading row.
- Organization switching and account switching retain their current behavior and API contracts.
- The command bar remains visible while the content area scrolls.

### Content Frame

- Maximum reading width is constrained for forms and documents; portfolio tables may use the full available width.
- Page headers contain title, a concise status sentence, and no more than two primary actions.
- Section spacing, dividers, empty states, loading states, and error states use shared visual tokens.

## Role-Adaptive Workspace

Each role receives the same shell but different first-screen content.

### Owner

- Four concise portfolio metrics: active projects, risk projects, pending gates, and average delivery progress.
- Project portfolio table with workflow progress, health, owner, deadline/SLA, and cost summary.
- A prioritized `Needs your attention` queue containing blocked, overdue, and high-risk actions.
- Compact role workload and delivery closure summaries below the first screen.

### Project Manager

- Requirement clarification queue and missing-input count.
- Current PRD review status and the next required action.
- Projects waiting for requirement review, PRD generation, or approval.
- Clear separation between missing information, AI suggestions, and approved product decisions.

### Technical Lead and AI Development

- Development launch queue, repository readiness, active jobs, and failed checks.
- Primary action routes directly to the focused project stage.
- Code review, security, and performance results are summarized with direct access to evidence.

### Operations

- Environment and handoff queue, grouped by project and severity.
- Missing RTSP credentials, server/runtime requirements, start/stop/rollback procedures, monitoring, logging, and alert requirements remain visible as explicit tasks.
- The primary action focuses the matching operations stage and task.

### QA

- Test execution queue, evidence readiness, failed cases, defects awaiting development, and acceptance readiness.
- The primary action opens the exact QA run or evidence item instead of the generic project page.

## Project Center

- Replace the large permanent project list with a searchable, sortable project table.
- Preserve project health, current stage, follow-up count, blocked role, and assignee.
- Support compact filters for status, organization, current stage, and risk level.
- Selecting a project opens the project workspace without changing organization context.
- Empty, loading, and permission-denied states are explicit and do not collapse the table layout.

## Project Workspace

The project workspace is the primary operational surface and has three persistent layers.

### Project Header

- Project name, owner, organization, health, current stage, and the primary stage action.
- A compact workflow progress strip shows all delivery stages and makes the selected stage explicit.
- The header does not repeat organization and user controls already available in the command bar.

### Workspace Tabs

- Overview
- Requirements and PRD
- Architecture and Operations
- Development
- Review
- QA
- Acceptance
- Activity

Tabs are permission-aware but maintain a stable order. Selecting a personal task opens the matching tab and stage context.

### Main and Context Areas

- The main column contains the current document, form, checklist, execution report, or evidence surface.
- A right context rail contains the stage gate, blockers, owner, next action, and concise history.
- The context rail may collapse on medium screens and becomes a drawer on mobile.
- Long histories, audit events, and detailed evidence are not expanded by default.

## Operations Console

The current commercial cockpit becomes a dedicated Operations destination rather than a large section on every owner page.

- Use sub-navigation for Overview, Organizations, Agent Jobs, Deployments, Audit, SLA and Notifications, and Cost.
- Replace the current mixed card grid with metric rows, tables, and focused detail panels.
- Platform job evidence gaps, retries, exhausted jobs, leases, and executor status share one job table with a detail drawer.
- Deployment readiness uses a stage/gate table, with environment status and blockers in consistent columns.
- Database migration readiness is a focused status view rather than a nested dashboard card.

## Interaction Rules

- One page has one dominant action. Secondary actions use bordered or ghost styles.
- Destructive actions require clear labeling and confirmation.
- Status filters use segmented controls; option sets use menus; binary settings use switches or checkboxes.
- Icon-only buttons use Lucide icons and accessible names/tooltips.
- Task clicks preserve project, stage, and focused task context.
- Drawers are used for secondary details. Dialogs are reserved for creation, confirmation, or short edits.
- Success and error feedback use persistent inline states for important operations and toasts only for transient confirmation.
- Keyboard focus remains visible, and every interactive control has an accessible name.

## Visual System

### Color

- Shell: near-black green-blue, used only for the rail and command bar.
- Canvas: cool neutral gray.
- Surfaces: white and subtle cool-gray elevation.
- Primary/success: teal.
- Information: blue.
- Warning: amber/orange.
- Blocking/error: red.
- Text: near-black neutral with cool-gray secondary text.

The interface must not be dominated by dark blue, teal, or any single hue. Semantic colors appear only where they communicate state.

### Typography and Density

- Use the system/Inter-compatible font stack already present.
- Page titles remain between 22 and 28 pixels.
- Panel headings remain between 14 and 18 pixels.
- Body and table text remain between 12 and 14 pixels with sufficient line height.
- Letter spacing remains zero.
- Tables and repeated queues use stable row heights and do not shift when status text changes.

### Shape and Elevation

- Border radii remain at 8 pixels or less.
- Page sections are not floating cards.
- Cards are reserved for metrics, repeated task items, dialogs, and genuinely framed tools.
- Elevation is subtle and primarily reserved for the command bar, drawers, dialogs, and active overlays.

## Responsive Behavior

Desktop widths at and above 1280 pixels receive the full rail, command bar, tables, project context rail, and dense workflow controls.

At widths between 768 and 1279 pixels:

- The navigation rail remains compact.
- The project context rail collapses.
- Tables hide nonessential columns but preserve status, action, and ownership.
- Two-column panels become single-column where necessary.

Below 768 pixels:

- Navigation becomes a bottom bar.
- The command bar shows organization, notifications, and account through compact controls.
- The app supports reading project status and completing basic personal tasks.
- Complex PRD editing, platform administration, and dense evidence review may use horizontally scrollable tables or direct users to desktop without breaking layout.

## Component Boundaries

The existing `App.jsx` is too large for safe visual iteration. The redesign introduces focused presentational boundaries while preserving the existing state and API behavior:

- `src/ui/AppShell.jsx`: rail, command bar, content frame, responsive navigation.
- `src/ui/Icon.jsx`: icon integration and accessible icon-button conventions.
- `src/ui/StatusBadge.jsx`: shared health, stage, task, and job status presentation.
- `src/ui/MetricTile.jsx`: stable metric display.
- `src/ui/EmptyState.jsx`: consistent empty and permission states.
- `src/features/workspace/RoleWorkspace.jsx`: dispatches role-specific home modules.
- `src/features/projects/ProjectCenter.jsx`: project search, filters, and table.
- `src/features/projects/ProjectWorkspace.jsx`: project header, stage strip, tabs, content, and context rail.
- `src/features/operations/OperationsConsole.jsx`: platform sub-navigation and focused operations views.

Business workflow functions, shared selectors, API payloads, and server contracts remain unchanged in this redesign.

## Error and Loading States

- The shell remains stable while page data loads.
- Skeleton rows match the final table and queue dimensions.
- API errors appear near the affected page or action and provide retry where safe.
- Authentication expiration returns to the login screen while preserving a concise explanation.
- Permission failures render a dedicated restricted state instead of an empty panel.
- Long-running actions disable only the initiating control and expose progress in the relevant job or task surface.

## Testing and Acceptance

Automated tests must preserve existing workflow behavior and add coverage for:

- Role-based default destinations.
- Navigation visibility by permission.
- Project table selection and project workspace routing.
- Personal task deep-linking to project, stage, tab, and focused task.
- Operations console separation from the owner workspace.
- Demo user switching inside the account menu.
- Responsive navigation state and critical accessible names.

Browser acceptance is performed at 1440x900, 1280x720, 1024x768, and 390x844. Acceptance requires:

- No overlapping or clipped controls.
- No page-level horizontal scrolling at the tested widths.
- Stable table and workflow dimensions during loading and status changes.
- A visible primary action for every role workspace.
- Correct task-to-stage focus for project manager, development, operations, and QA roles.
- No browser console errors.
- Existing automated test suite, production build, and dependency audit pass.

## Out of Scope

- Backend API redesign.
- Real PostgreSQL migration.
- Real durable job queue or sandbox implementation.
- New business workflow stages.
- Native mobile application.
- White-label theming and user-customizable dashboards.

