# Role Workbench Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a shared role workbench model so each logged-in role lands on the right dashboard, project, and task queue.

**Architecture:** Keep authentication and organization filtering in the existing platform/session modules. Add a focused shared domain helper that converts visible project summaries, the current user session, and the personal task queue into frontend-ready workbench state. The React App consumes this helper instead of duplicating role-specific calculations inline.

**Tech Stack:** React 19, Vite, Express 5, shared JavaScript modules, Vitest, Testing Library.

---

## File Structure

- Create `src/shared/roleWorkbench.js`: derive owner vs personal workbench mode, metrics, visible tasks, and recommended project selection.
- Create `src/shared/roleWorkbench.test.js`: prove owner and non-owner behavior with real-shaped project summaries and task queues.
- Modify `src/App.jsx`: use the shared model for dashboard mode, task metrics, tasks, and automatic project selection.
- Modify `src/App.test.jsx`: add focused coverage that PM login shows personal workspace and opens assigned project work.
- Modify `src/styles.css`: only if the shared model exposes a state that needs new visual treatment.

## Task 1: Shared Workbench Model

- [ ] Write a failing test in `src/shared/roleWorkbench.test.js` for an owner session. The test should assert `mode: 'owner'`, all visible project count, owner task count from the role inbox, and recommended project id from the first visible project.
- [ ] Run `npx vitest run src/shared/roleWorkbench.test.js` and confirm it fails because the module does not exist.
- [ ] Implement `createRoleWorkbench(projects, { currentUser, roleInbox, personalTaskQueue })` in `src/shared/roleWorkbench.js`.
- [ ] Run `npx vitest run src/shared/roleWorkbench.test.js` and confirm the owner test passes.

## Task 2: Personal Role Queue

- [ ] Add a failing test proving a PM session returns `mode: 'personal'`, uses the server personal task queue when provided, and recommends the first task project.
- [ ] Run `npx vitest run src/shared/roleWorkbench.test.js` and confirm the new test fails for missing personal queue behavior.
- [ ] Extend `createRoleWorkbench` to prefer `personalTaskQueue.tasks`, `openTaskCount`, and `projectCount` for non-owner users.
- [ ] Run `npx vitest run src/shared/roleWorkbench.test.js` and confirm both tests pass.

## Task 3: App Integration

- [ ] Add a failing UI test in `src/App.test.jsx` that logs in as PM, returns a PM task queue, and expects the personal workspace plus the PM assigned project/task.
- [ ] Run the focused UI test and confirm it fails because App still derives this state inline.
- [ ] Import and use `createRoleWorkbench` in `src/App.jsx` for `isOrganizationOwner`, `currentUserOpenTaskCount`, `currentUserProjectCount`, and `currentUserTasks`.
- [ ] Update automatic project selection to prefer `roleWorkbench.recommendedProjectId` when a logged-in non-owner has assigned work.
- [ ] Run `npx vitest run src/App.test.jsx` and confirm the UI tests pass.

## Task 4: Verification

- [ ] Run `npm test`.
- [ ] Run `npm run build`.
- [ ] Run `npm audit --omit=dev`.
- [ ] Restart the local dev server if needed for browser verification.
