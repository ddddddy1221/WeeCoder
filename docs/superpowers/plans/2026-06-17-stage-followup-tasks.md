# Stage Followup Tasks Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn stage confirmation follow-up prompts into visible, role-assigned work items that can be tracked until the underlying confirmation item is completed.

**Architecture:** Keep the stage confirmation gate as the source of truth. Add a derived task builder that converts current-stage missing confirmation items into open follow-up tasks, assigns them from existing project members, and marks resolved tasks when the related item is confirmed. Render the derived tasks in the current stage panel without introducing a separate task persistence model yet.

**Tech Stack:** React, Express-backed JSON project state, shared JavaScript workflow helpers, Vitest, Testing Library.

---

## File Structure

- `src/shared/stageConfirmations.js`: extend follow-up generation with task-shaped data and assignee metadata.
- `src/shared/stageConfirmations.test.js`: cover task derivation, assignment, and resolved status after confirmation.
- `src/App.jsx`: render a "缺项待办" section inside the stage confirmation panel.
- `src/App.test.jsx`: verify the dashboard shows open follow-up tasks and removes or resolves them when the item is confirmed.
- `src/styles.css`: style the task list as dense operational work items.
- `src/shared/stageRiskRegister.js`: update the stale functional gap around missing follow-up mechanics.

## Task 1: Shared Task Derivation

- [ ] Write a failing test in `src/shared/stageConfirmations.test.js` asserting `createStageConfirmationFollowupTasks(project, stageId)` returns open tasks for missing items with `targetRole`, `targetRoleLabel`, `assigneeUserId`, `assigneeName`, `question`, and `expectedAnswer`.
- [ ] Run `npm test -- src/shared/stageConfirmations.test.js` and confirm the new export is missing or the returned task data is absent.
- [ ] Implement `createStageConfirmationFollowupTasks(project, stageId, users)` in `src/shared/stageConfirmations.js` using existing follow-up prompts and project member assignments.
- [ ] Run `npm test -- src/shared/stageConfirmations.test.js` and confirm it passes.

## Task 2: Resolved Task State

- [ ] Add a failing test in `src/shared/stageConfirmations.test.js` asserting confirmed items produce `resolved` tasks when `includeResolved: true` is passed, while the default list only returns open tasks.
- [ ] Run the focused test and confirm it fails for missing resolved-state behavior.
- [ ] Extend the task builder to include all required confirmation items when `includeResolved` is true, using item status to set `open` or `resolved`.
- [ ] Run the focused shared test file and confirm it passes.

## Task 3: Dashboard Rendering

- [ ] Add a failing UI test in `src/App.test.jsx` asserting the current stage panel shows "缺项待办", "状态：待处理", the assignee name, and the expected answer for missing confirmation tasks.
- [ ] Run `npm test -- src/App.test.jsx` and confirm the new text is not rendered.
- [ ] Update `StageConfirmationPanel` in `src/App.jsx` to derive and render follow-up tasks.
- [ ] Add CSS in `src/styles.css` for the task list, task rows, status pills, and assignee text.
- [ ] Run `npm test -- src/App.test.jsx` and confirm it passes.

## Task 4: Risk Register Cleanup

- [ ] Update the functional gap text in `src/shared/stageRiskRegister.js` from missing follow-up mechanics to missing closed-loop task tracking.
- [ ] Add or update a focused test if existing risk tests assert the old wording.
- [ ] Run `npm test -- src/shared/workflow.test.js src/App.test.jsx` to confirm risk rendering still works.

## Task 5: Full Verification

- [ ] Run `npm test`.
- [ ] Run `npm run build`.
- [ ] Run `npm audit --omit=dev`.
- [ ] Run the YOLO workspace checks: `npm test`, `npm run build`, and `npm audit --omit=dev` in `data/workspaces/yolo-camera-monitor`.
- [ ] Restart the local dev server and verify in the in-app browser that "缺项待办" appears with no console errors.
