# AI Development Package Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a standard AI development execution package that turns approved project artifacts, repository readiness, and development tasks into a Codex-ready instruction bundle with explicit launch blockers.

**Architecture:** Add a focused shared domain module for package generation, then persist generated packages through the workflow model and API. The React development panel displays readiness, blockers, commands, and the generated instruction text without starting a real executor yet.

**Tech Stack:** React 19, Vite, Express 5, Vitest, Testing Library, Supertest.

---

### Task 1: Shared Domain Package

**Files:**
- Create: `src/shared/agentExecutionPackage.js`
- Test: `src/shared/agentExecutionPackage.test.js`

- [ ] Write failing tests for ready and blocked package generation.
- [ ] Implement `createAgentExecutionPackage(project)`.
- [ ] Include gates for PRD, technical handoff, development plan, repository config, repository inspection, branch preparation, and verification commands.
- [ ] Generate a deterministic instruction string containing project context, repository path, target branch, tasks, verification commands, safety rules, and required output.

### Task 2: Workflow And API

**Files:**
- Modify: `src/shared/workflow.js`
- Modify: `src/shared/workflow.test.js`
- Modify: `server/index.js`
- Modify: `server/index.test.js`

- [ ] Write failing workflow test for recording an execution package and history.
- [ ] Write failing API test for `POST /api/projects/:projectId/generate-development-package`.
- [ ] Add workflow function `generateAgentExecutionPackageForProject`.
- [ ] Normalize existing packages during project loading.
- [ ] Add Express route that generates and records the package.

### Task 3: Frontend Panel

**Files:**
- Modify: `src/App.jsx`
- Modify: `src/App.test.jsx`
- Modify: `src/styles.css`

- [ ] Write failing frontend test that clicks `生成 AI 开发任务包` and sees blocked YOLO readiness.
- [ ] Add API action in `App.jsx`.
- [ ] Add package panel in the development stage with readiness, blockers, commands, and instruction preview.
- [ ] Disable real execution copy/launch actions for now; this increment only prepares the artifact.
- [ ] Add compact responsive styles.

### Task 4: Verification

**Files:**
- Runtime: `data/projects.json`

- [ ] Run targeted package tests.
- [ ] Run `npm test`.
- [ ] Run `npm run build`.
- [ ] Run `npm audit --omit=dev`.
- [ ] Restart local dev server.
- [ ] Generate the package for the YOLO project and verify it is blocked by repository readiness.
- [ ] Use the in-app browser to verify the panel renders the package state.
