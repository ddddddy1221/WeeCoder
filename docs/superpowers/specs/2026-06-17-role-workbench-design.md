# Role Workbench Design

## Context

WeeCoder is moving from a single shared prototype console toward an internal product for AI employee delivery workflows. The next product milestone is a role-aware console: every project participant should sign in, see the work assigned to their role, and act only within their project responsibility. Owners need an organization-wide view of progress, blockers, tasks, and background jobs.

## Scope

This milestone keeps authentication lightweight and local. It does not introduce production identity providers, full RBAC administration, password rotation, or tenant billing controls. The goal is to create a usable role-based workflow shell that can later be backed by a formal database and real identity provider.

Included:

- Demo login with a selected user and local session token.
- Organization-scoped project visibility.
- Owner organization overview with blockers and operational signals.
- Personal workspace for non-owner roles.
- Role Inbox built from current stage confirmation gaps.
- Permission checks based on project membership and role policy.
- Test coverage for the role workbench model and UI behavior.

Excluded for this milestone:

- Real password management.
- External SSO.
- User invitation flows.
- Fine-grained organization admin screens.
- Production audit storage outside project history.

## Roles

- Owner: sees all organization projects, command center blockers, project progress, platform jobs, SLA and cost estimates.
- PM: sees requirement and PRD tasks assigned to the PM member.
- Tech Lead: sees technical handoff, repository, review, and development package tasks.
- Ops: sees deployment, environment, RTSP, server, and operational handoff tasks.
- AI Dev: sees development execution tasks.
- Local Runner: sees command execution and verification jobs.
- QA: sees test execution, evidence, defect routing, and acceptance validation tasks.

## Data Flow

1. The user logs in with a demo account.
2. The API returns a session with current user, organization, memberships, and permissions.
3. Project list calls use the session organization to filter visible projects.
4. The backend derives `/api/me/tasks` from project summaries and role follow-up assignments.
5. The frontend shows:
   - Owner: organization overview.
   - Other roles: personal workspace with assigned tasks.
   - All roles: project details filtered by organization and action permissions.

## First Implementation Target

The existing code already contains much of this shell. The first hardening increment should add one shared workbench model that makes the frontend less ad hoc:

- `createRoleWorkbench(projects, session, taskQueue)` returns the mode, visible metrics, task list, and recommended initial project.
- Owner workbench prefers organization-level blockers and all visible projects.
- Non-owner workbench prefers assigned tasks and projects containing those tasks.
- The App uses this model to keep project selection aligned with the logged-in user.

## Validation

- Unit tests should prove owner and personal role workbench output.
- UI tests should prove a PM login lands on PM work, not an owner-style dashboard.
- API tests should continue proving authenticated task queues and organization filtering.
- Full verification remains `npm test`, `npm run build`, and `npm audit --omit=dev`.
