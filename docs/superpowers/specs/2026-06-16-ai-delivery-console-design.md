# AI Delivery Console Design

## Goal

Build a local management console for AI-assisted software delivery. A leader can create projects, watch each delivery stage, review generated artifacts, and approve or return work across PM, architecture, development, operations, QA, and acceptance stages.

## MVP Shape

Use a single repository app with a React dashboard and an Express API. Persist project state in `data/projects.json` so the first version runs without database setup. Treat AI execution as a workflow layer that produces stage artifacts and recommendations; the MVP simulates these artifacts deterministically so the control flow and UI can be reviewed immediately.

## Workflow

The project lifecycle is:

1. Intake
2. PM requirements
3. PRD approval
4. Architecture and data design
5. Ops requirements
6. Development
7. Code, security, and performance review
8. QA test design and execution
9. Defect loop
10. Final acceptance

Each stage has an owner, status, checklist, generated artifact, risks, and approval actions. Review failures route back to development. PRD or architecture rejection routes back to the relevant earlier stage.

## Product Boundaries

The first version does not run real AI coding, provision servers, or execute deployment. It provides the operating shell for those actions: project creation, workflow state, stage advancement, artifacts, review gates, and a visible management dashboard.

## Architecture

- `src/shared/workflow.js` owns stage definitions, validation, and transition rules.
- `server/` exposes project CRUD and workflow actions through Express.
- `src/` renders the management console with React.
- `data/projects.json` stores local project state.

## Verification

Unit tests cover workflow transitions and project creation defaults. API tests cover project creation and stage actions. Manual browser verification confirms the dashboard can create a project, advance stages, reject gates, and show generated artifacts.
