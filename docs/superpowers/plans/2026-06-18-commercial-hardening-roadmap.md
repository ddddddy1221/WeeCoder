# WeeCoder Commercial Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Push the current AI delivery console from a local prototype toward a usable commercial beta with role accounts, durable data, auditable AI execution, deployment visibility, notifications, SLA, cost tracking, and a denser SaaS UI.

**Architecture:** Keep the current React + Express + shared-domain-module structure while extracting durable platform boundaries one by one. Each phase must ship as working software with tests before the next phase starts: identity first, persistence second, workflow and execution hardening third, operational controls fourth, product UI last.

**Tech Stack:** React 19, Vite, Express 5, shared JavaScript modules, JSON store during transition, SQLite/PostgreSQL-ready repository boundary, Vitest, Testing Library, Supertest.

---

## Current Status Snapshot

The product is now beyond a static mock: it has a working React management console, Express API, project workflow stages, role workbench concepts, organization-scoped session behavior, PRD generation, technical handoff, AI development package generation, local development/check/review/QA runners, platform job retry/cancel/exhaustion states, execution audit summaries, and owner-level cockpit views.

It is still not a final commercial SaaS product. The biggest remaining gaps are durable SQL persistence, production-grade account/invite management, a real background job queue, stronger sandbox isolation for AI coding, notification delivery, full deployment controls, billing/cost governance, and a more polished product UI.

## Recommended Release Strategy

Do not try to build the whole commercial product in one pass. The right path is to ship four increasingly complete versions:

1. **R0: End-to-end demo beta**
   - Goal: one YOLO camera monitoring project can move from requirement intake to PRD, development handoff, AI coding run, QA, feedback, and final acceptance.
   - Audience: internal validation with you as owner plus simulated PM/dev/ops/QA roles.
   - Success: no manual data editing is needed to demonstrate the full flow.

2. **R1: Team collaboration beta**
   - Goal: real users log in, each role sees only their own work, owner sees all projects and blockers.
   - Audience: a small real team.
   - Success: PM, tech lead, ops, AI developer, runner, QA, and owner permissions are enforced by backend routes.

3. **R2: Reliable execution beta**
   - Goal: AI coding is run through a durable queue with audit logs, sandbox policy, retry controls, command evidence, and review/QA feedback loops.
   - Audience: teams willing to let the system perform controlled local repository work.
   - Success: every automated action can answer who triggered it, what command ran, what changed, what failed, and what should happen next.

4. **R3: Commercial SaaS candidate**
   - Goal: multi-tenant data, deployment console, notifications, SLA, cost tracking, operation audit, and polished SaaS UI.
   - Audience: external pilot customers.
   - Success: the product can be operated by a team without the developer watching logs manually.

## Role Account Decision

Separate role accounts are necessary for the commercial direction, but they should be introduced in stages.

For the current prototype, keep demo users and role switching because it helps validate the workflow quickly. For the next real beta, require actual login and bind every project action to a user, organization, role, and audit reason. The owner or boss account should see all progress, risk, cost, SLA, and blockers; PM/dev/ops/QA accounts should see only their own queues and required actions.

The rule is simple: once the system can trigger AI coding or mark workflow evidence, role accounts stop being optional.

## File Structure

- `server/auth.js`: formalize password validation, token issue/verification, organization membership checks, and session expiry.
- `server/index.js`: add authenticated routes for users, organizations, projects, platform jobs, audit events, notifications, deployments, and cost views.
- `server/store.js`: keep the current JSON store stable while adding an explicit repository contract that can be swapped for SQL.
- `server/projectRepository.js`: become the durable project repository boundary used by HTTP routes and background workers.
- `server/platformJobExecutor.js`: own job lifecycle transitions, retry limits, command evidence, executor health, and failure reasons.
- `src/shared/authorization.js`: keep role/action permissions as the single source of truth for frontend and backend.
- `src/shared/platform.js`: expose commercial cockpit summaries for tenancy, database readiness, AI operations, deployment, notifications, SLA, audit, and cost.
- `src/shared/roleWorkbench.js`: keep per-role work queues and owner-level rollups consistent.
- `src/shared/stageGate.js`, `src/shared/stageConfirmations.js`, `src/shared/workflow.js`: enforce stage transitions from PRD to development to QA to release.
- `src/App.jsx`: render owner cockpit, role workbench, workflow stages, job execution audit, deployment and cost panels.
- `src/styles.css`: continue SaaS hardening with dense, stable layouts and clear operational states.
- `data/projects.json`: remain the demo seed until SQL cutover is implemented.
- `docs/superpowers/plans/*.md`: keep implementation plans for each phase.

## Phase 1: Real Accounts, Organizations, and Permissions

- [ ] Add failing tests in `server/index.test.js` for login rejection, session expiry, organization-scoped project visibility, and forbidden cross-organization access.
- [ ] Add failing tests in `src/shared/authorization.test.js` for owner, PM, tech lead, ops, AI developer, runner, and QA permissions across workflow actions.
- [ ] Implement missing backend guards in `server/auth.js` and `server/index.js` so every project/platform route resolves `currentUser` and `organizationId` before reading data.
- [ ] Update `src/App.jsx` to remove any optimistic role switch behavior that can bypass backend permissions; role switch remains demo-only until real invite flow exists.
- [ ] Verify with `npm test -- server/index.test.js src/shared/authorization.test.js src/App.test.jsx`.
- [ ] Acceptance: PM users see only assigned work, QA users see test tasks, ops users see deployment/env requests, and the owner sees all organization progress.

## Phase 2: Durable Data and SQL Cutover Boundary

- [ ] Add failing tests in `server/projectRepository.test.js` for repository methods: list by organization, create project, update stage, append audit event, create job, update job, list notifications.
- [ ] Add a `RepositoryContract` section in `server/projectRepository.js` and make current JSON persistence satisfy the same method names that SQL will need.
- [ ] Add migration metadata to `src/shared/platform.js` so the cockpit shows which tables are mapped, blocked, and still JSON-only.
- [ ] Add server-side validation tests that reject project writes without organization id, actor id, and audit reason.
- [ ] Verify with `npm test -- server/projectRepository.test.js src/shared/platform.test.js server/index.test.js`.
- [ ] Acceptance: we can replace JSON persistence with SQLite/PostgreSQL later without changing React components or shared workflow code.

## Phase 3: Workflow Engine from Requirement to QA Feedback Loop

- [ ] Add failing tests in `src/shared/workflow.test.js` for the full chain: requirement intake, PRD quality gate, development plan, ops handoff, AI development run, code review, QA cases, QA feedback, developer fix iteration, final acceptance.
- [ ] Extend `src/shared/stageGate.js` so every transition declares required evidence, owner role, allowed actions, and blocked reasons.
- [ ] Extend `src/shared/stageConfirmations.js` so incomplete PM input blocks PRD generation and creates visible follow-up tasks.
- [ ] Add UI tests in `src/App.test.jsx` proving a YOLO camera project can move from PRD to development to QA and back to development when QA fails.
- [ ] Verify with `npm test -- src/shared/workflow.test.js src/shared/stageGate.test.js src/App.test.jsx`.
- [ ] Acceptance: the user can demonstrate one complete product flow without manually editing `data/projects.json`.

## Phase 4: AI Coding Queue, Sandbox, and Execution Audit

- [ ] Add failing tests in `server/platformJobExecutor.test.js` for queued, running, succeeded, failed, retryable, exhausted, and cancelled jobs.
- [ ] Persist command, branch, executor, stdout/stderr excerpts, exit code, duration, result summary, and error summary for every AI coding job.
- [ ] Add retry controls in `server/index.js` and render retry eligibility in `src/App.jsx`.
- [ ] Add sandbox policy checks that block commands outside an explicit allowlist and record the blocked command in audit history.
- [ ] Extend `src/shared/platform.js` execution audit to include retry posture, missing evidence, executor health, average duration, and latest blocker.
- [ ] Verify with `npm test -- server/platformJobExecutor.test.js src/shared/platform.test.js src/App.test.jsx server/index.test.js`.
- [ ] Acceptance: the owner can see what the AI attempted, who triggered it, why it failed or passed, and whether it is safe to retry.

## Phase 5: Ops, Deployment Console, Notifications, SLA, and Cost

- [ ] Add failing tests in `src/shared/platform.test.js` for environment readiness, deployment gates, notification routing, SLA breach detection, and cost center totals.
- [ ] Add backend tests in `server/index.test.js` for marking environment readiness, acknowledging notifications, and listing audit events.
- [ ] Render ops requirements as first-class work items for RTSP address, credentials, GPU/CPU requirements, runtime commands, logs, and rollback.
- [ ] Add SLA states for blocked PM input, failed AI jobs, delayed QA verification, and missing ops handoff.
- [ ] Add cost drivers for AI calls, job runtime, test runs, storage, and deployment environment.
- [ ] Verify with `npm test -- src/shared/platform.test.js server/index.test.js src/App.test.jsx`.
- [ ] Acceptance: owner view shows operational blockers, who owns each blocker, expected next action, SLA status, and estimated cost.

## Phase 6: Product UI Hardening

- [ ] Add visual/state tests in `src/App.test.jsx` for owner cockpit, PM workbench, developer workbench, ops workbench, QA workbench, and project detail.
- [ ] Split oversized UI sections in `src/App.jsx` into focused components only where it reduces repeated state handling.
- [ ] Tighten `src/styles.css` for responsive grids, dense tables, stable card heights, scrollable evidence areas, and no overlapping text on narrow screens.
- [ ] Keep first screen as the actual management console, not a marketing landing page.
- [ ] Verify with `npm test -- src/App.test.jsx`, `npm run build`, and manual browser smoke test at `http://127.0.0.1:5173/`.
- [ ] Acceptance: a boss can open the product and immediately understand project status, stage blockers, role workload, AI job health, and operational risk.

## Phase 7: Commercial Beta Readiness

- [ ] Add a seed/demo organization that exercises all roles and the YOLO camera monitoring project end to end.
- [ ] Add an admin bootstrap guide covering env vars, demo users, database mode, server start, logs, and backup.
- [ ] Add API smoke tests for login, list projects, get platform cockpit, create AI job, start job, finish job, and record QA feedback.
- [ ] Run `npm test`, `npm run build`, `npm audit --omit=dev`, and runtime smoke against `http://127.0.0.1:4000/api/platform`.
- [ ] Acceptance: this is a commercial beta candidate, not final SaaS: it supports role accounts, durable persistence boundary, audited AI execution, workflow closure, ops visibility, and cost/SLA views.

## Sequencing Rule

Do not polish the UI before Phase 1 and Phase 2 are stable. The product value depends on trustworthy role visibility, durable state, and auditable AI execution; visual polish is only valuable after those contracts stop moving.
