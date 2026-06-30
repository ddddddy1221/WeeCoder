# Technical Handoff Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Automatically generate the architecture, development, ops, and QA handoff artifacts after PRD approval.

**Architecture:** Add a shared deterministic generator, add Codex provider support for a JSON handoff bundle, wire backend advance from PRD approval to architecture to generate the bundle, and expose the generated status in the UI.

**Tech Stack:** React, Express, Vitest, Supertest, local Codex CLI.

---

### Task 1: Shared Handoff Model

- [ ] Create `src/shared/technicalHandoff.js`.
- [ ] Create `src/shared/technicalHandoff.test.js`.
- [ ] Verify YOLO PRDs generate RTSP, YOLO, ops, and QA sections.

### Task 2: Workflow/API Integration

- [ ] Add `generateTechnicalHandoffForProject` to `src/shared/workflow.js`.
- [ ] Add provider support in `server/aiProvider.js`.
- [ ] Auto-generate handoff when advancing from `prd-approval` to `architecture`.
- [ ] Add API tests.

### Task 3: UI Integration

- [ ] Show generated handoff status/provider on architecture stage.
- [ ] Ensure clicking `推进下一阶段` from PRD approval lands on architecture with generated artifact visible.

### Task 4: Verification

- [ ] Run tests, build, audit.
- [ ] Restart dev server.
- [ ] Verify YOLO project flow in browser.
