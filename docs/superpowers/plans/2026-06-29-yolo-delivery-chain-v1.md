# YOLO Delivery Chain V1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the YOLO camera monitoring project visibly flow through PM requirement quality, AI Coding execution, and code/security review gates.

**Architecture:** Add one shared YOLO delivery chain model that reads existing project state and produces a compact status for PM input, AI Coding, and review. Reuse current workflow gates, automation plan, development run, and code review report instead of introducing a new workflow engine. Return the model from the API and render it inside the stage execution detail panel.

**Tech Stack:** React 19, Express 5, shared JavaScript modules, Vitest, Testing Library, Supertest.

---

## File Map

- Create: `src/shared/yoloDeliveryChain.js`
  - Detect YOLO camera projects.
  - Evaluate PM/product input gaps.
  - Summarize AI Coding readiness/execution.
  - Summarize code/security/performance review readiness.
- Create: `src/shared/yoloDeliveryChain.test.js`
  - Unit coverage for PM blockers, AI Coding states, and review blockers.
- Modify: `src/shared/deliverySkills.js`
  - Add YOLO-specific requirement quality blockers for known missing fields.
- Modify: `src/shared/deliverySkills.test.js`
  - Prove generic answers with YOLO placeholders still block PRD readiness.
- Modify: `src/shared/projectAutomationPlan.js`
  - Add YOLO chain metadata to AI Coding and review jobs.
- Modify: `src/shared/projectAutomationPlan.test.js`
  - Prove recommended jobs carry chain and quality gate metadata.
- Modify: `server/index.js`
  - Include `yoloDeliveryChain` in project summaries and project details.
- Modify: `src/App.jsx`
  - Render `YoloDeliveryChainPanel` in the stage execution detail panel.
- Modify: `src/styles.css`
  - Add compact panel styling.
- Modify: `src/App.test.jsx`
  - Prove the YOLO chain panel is visible and shows the three main modules.

## Tasks

- [x] Add failing tests for the shared YOLO chain model.
- [x] Implement `createYoloDeliveryChain(project)`.
- [x] Add failing tests for YOLO-specific requirement quality blockers.
- [x] Extend `evaluateRequirementQuality(project)` with YOLO requirement checks.
- [x] Add failing tests for automation job metadata.
- [x] Extend automation plan recommended job details.
- [x] Add backend summary/detail wiring.
- [x] Add failing UI test for the YOLO chain panel.
- [x] Render the panel and add styles.
- [x] Run `npm test` and `npm run build`.

## Self-Review

- Spec coverage: Covers PM/product, AI Coding, and code/security review modules, and exposes them in the current management console.
- Placeholder scan: No unresolved placeholders.
- Scope check: QA and final acceptance remain existing workflow capabilities; this plan focuses on the first main chain requested for the next version.
