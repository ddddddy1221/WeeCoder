# AI Delivery Console Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a runnable local web management console for AI-assisted software delivery workflow tracking.

**Architecture:** A Vite React frontend talks to an Express API. Shared workflow rules live in `src/shared/workflow.js`, and the server persists projects to `data/projects.json`.

**Tech Stack:** Node.js, Express, React, Vite, Vitest, Supertest, plain CSS.

---

## File Structure

- `package.json`: scripts, runtime dependencies, test dependencies.
- `index.html`: Vite HTML entry.
- `src/main.jsx`: React bootstrap.
- `src/App.jsx`: dashboard shell and state orchestration.
- `src/styles.css`: admin UI styling.
- `src/shared/workflow.js`: stage catalog, transition rules, artifact generation helpers.
- `src/shared/workflow.test.js`: workflow unit tests.
- `server/index.js`: Express server factory and routes.
- `server/store.js`: JSON file persistence.
- `server/index.test.js`: API integration tests.
- `data/projects.json`: local persisted sample data.

## Tasks

- [ ] Create project scaffolding and dependencies.
- [ ] Write failing workflow unit tests.
- [ ] Implement shared workflow model and pass unit tests.
- [ ] Write failing API tests.
- [ ] Implement JSON store and Express routes.
- [ ] Build React management console.
- [ ] Add styling for stage board, project list, artifacts, and action controls.
- [ ] Run tests, build, and start the local app.
