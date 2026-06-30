# Requirement Quality Gate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a working requirement review and PRD approval gate for the AI delivery console.

**Architecture:** Add a shared business skill module for deterministic quality checks, extend workflow state with review results, add a backend review endpoint with Codex fallback behavior, and update the React UI to expose the new flow.

**Tech Stack:** React, Vite, Express, Vitest, Supertest, local Codex CLI.

---

### Task 1: Shared Business Skill Model

**Files:**
- Create: `src/shared/deliverySkills.js`
- Create: `src/shared/deliverySkills.test.js`

- [ ] Write tests for missing-answer blockers, complete-answer readiness, skill catalog shape, and stale review detection.
- [ ] Implement `BUSINESS_SKILLS`, `evaluateRequirementQuality`, `createRequirementReviewArtifact`, and `isPrdApprovalReady`.
- [ ] Run `npm test -- src/shared/deliverySkills.test.js`.

### Task 2: Workflow Gate

**Files:**
- Modify: `src/shared/workflow.js`
- Modify: `src/shared/workflow.test.js`

- [ ] Add tests proving PM cannot advance to PRD approval until requirements are reviewed, PRD is generated, and approval is ready.
- [ ] Add `applyRequirementReview` and `WorkflowGateError`.
- [ ] Invalidate PRD approval readiness when requirement answers change.
- [ ] Run `npm test -- src/shared/workflow.test.js src/shared/deliverySkills.test.js`.

### Task 3: API Endpoint

**Files:**
- Modify: `server/index.js`
- Modify: `server/index.test.js`
- Modify: `server/aiProvider.js`
- Modify: `server/aiProvider.test.js`

- [ ] Add tests for `/review-requirements`, blocked `/advance`, and Codex provider review output.
- [ ] Implement review endpoint and provider fallback.
- [ ] Run `npm test -- server/index.test.js server/aiProvider.test.js`.

### Task 4: Frontend UX

**Files:**
- Modify: `src/App.jsx`
- Modify: `src/App.test.jsx`
- Modify: `src/styles.css`

- [ ] Add UI tests for AI review, draft PRD generation, and disabled PRD approval submit.
- [ ] Add requirement quality report panel, business skill chips, renamed PRD draft action, and stage-aware approval button.
- [ ] Run `npm test -- src/App.test.jsx`.

### Task 5: Verification

**Files:**
- No source changes expected.

- [ ] Run `npm test`.
- [ ] Run `npm run build`.
- [ ] Run `npm audit --omit=dev`.
- [ ] Restart local dev service.
- [ ] Use the browser to verify the requirement-to-PRD flow on `http://127.0.0.1:5173/`.
