# Repository Launch Guide Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an inline launch guide that explains how to move a development project from blocked repository setup to a startable AI development package.

**Architecture:** Keep repository actions unchanged and add a pure shared guide model that derives step status from the current project. The React development panel renders that model above the existing repository configuration and task package panels.

**Tech Stack:** React, Vite, Vitest, Testing Library, existing Express APIs.

---

### Task 1: Launch Guide Model

**Files:**
- Create: `src/shared/developmentLaunchGuide.js`
- Test: `src/shared/developmentLaunchGuide.test.js`

- [ ] Write failing tests for blocked YOLO state, ready-to-start state, and incomplete repository config.
- [ ] Run targeted tests and verify they fail because the model does not exist.
- [ ] Implement `createDevelopmentLaunchGuide(project)` with five steps: repository config, repository inspection, branch preparation, AI package, development start.
- [ ] Re-run targeted tests and verify they pass.

### Task 2: UI Rendering

**Files:**
- Modify: `src/App.jsx`
- Modify: `src/App.test.jsx`
- Modify: `src/styles.css`

- [ ] Write a failing UI test that expects the development panel to show the guide and the current YOLO blocker.
- [ ] Render `DevelopmentLaunchGuidePanel` above repository configuration.
- [ ] Add restrained CSS that matches the existing dashboard style.
- [ ] Re-run UI tests and verify they pass.

### Task 3: Verification

**Commands:**
- `npm test`
- `npm run build`
- `npm audit --omit=dev`

- [ ] Run all commands and confirm success.
- [ ] Restart the local dev server if needed.
- [ ] Verify the in-app browser shows the launch guide on `http://127.0.0.1:5173/`.
