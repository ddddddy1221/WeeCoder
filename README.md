# WeeCoder

WeeCoder is an AI delivery workflow console for moving a project from requirement intake to PRD, technical handoff, AI coding, review, QA, and final acceptance.

## Current Scope

- React + Vite management console.
- Express API with demo authentication, role workspaces, workflow stages, and project audit history.
- Requirement quality review, PRD version tracking, and stale-PRD blocking before AI coding.
- AI development package generation with repository, branch, command, and PRD gates.
- Code/security/performance review, QA evidence, YOLO monitor demo flow, and acceptance package support.

## Development

```bash
npm install
npm run dev
```

The dev server exposes:

- Frontend: `http://127.0.0.1:5173`
- API: `http://127.0.0.1:4000`

## Verification

```bash
npm test
npm run build
```

## YOLO Worker

YOLO runtime secrets must be provided through environment variables. Use `.env.yolo.example` as a template and do not commit real credentials.
