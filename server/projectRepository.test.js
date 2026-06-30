import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { createJsonProjectRepository } from './projectRepository.js';

describe('ProjectRepository', () => {
  let tempDir;
  let repository;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'wee-coder-repository-'));
    repository = createJsonProjectRepository(join(tempDir, 'projects.json'));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  test('wraps JSON persistence behind a repository contract with a storage profile', async () => {
    await repository.addProject({
      id: 'repo-project-1',
      name: 'Repository Project',
      stages: [],
    });

    const updated = await repository.updateProject('repo-project-1', async (project) => ({
      ...project,
      name: 'Repository Project Updated',
    }));

    expect(updated).toMatchObject({
      id: 'repo-project-1',
      name: 'Repository Project Updated',
    });
    await expect(repository.getProject('repo-project-1')).resolves.toMatchObject({
      id: 'repo-project-1',
      name: 'Repository Project Updated',
    });
    await expect(repository.listProjects()).resolves.toEqual([
      expect.objectContaining({ id: 'repo-project-1' }),
    ]);
    expect(repository.getStorageProfile()).toMatchObject({
      mode: 'json-store',
      adapter: 'JsonProjectStore',
      targetEngine: 'postgresql',
      supportsTransactions: false,
      supportsConcurrentWrites: false,
      migrationStatus: 'schema-ready',
    });
  });

  test('lists projects by organization without leaking other tenant data', async () => {
    await repository.addProject({
      id: 'org-a-project',
      name: 'Org A Project',
      organizationId: 'org-a',
      stages: [],
    });
    await repository.addProject({
      id: 'org-b-project',
      name: 'Org B Project',
      organizationId: 'org-b',
      stages: [],
    });

    await expect(repository.listProjectsByOrganization('org-a')).resolves.toEqual([
      expect.objectContaining({ id: 'org-a-project', organizationId: 'org-a' }),
    ]);
    await expect(repository.listProjectsByOrganization('org-b')).resolves.toEqual([
      expect.objectContaining({ id: 'org-b-project', organizationId: 'org-b' }),
    ]);
    await expect(repository.getProjectByOrganization('org-a-project', 'org-a')).resolves.toMatchObject({
      id: 'org-a-project',
      organizationId: 'org-a',
    });
    await expect(repository.getProjectByOrganization('org-a-project', 'org-b')).resolves.toBeNull();
  });

  test('creates projects through the commercial contract with audit metadata', async () => {
    const created = await repository.createProject(
      {
        id: 'commercial-project',
        name: 'Commercial Project',
        stages: [],
      },
      {
        organizationId: 'org-a',
        actorId: 'owner-aa',
        auditReason: 'owner-created-project',
        now: '2026-06-18T01:00:00.000Z',
      },
    );

    expect(created).toMatchObject({
      id: 'commercial-project',
      organizationId: 'org-a',
      createdAt: '2026-06-18T01:00:00.000Z',
      updatedAt: '2026-06-18T01:00:00.000Z',
    });
    expect(created.history[0]).toMatchObject({
      type: 'project-created',
      actorUserId: 'owner-aa',
      organizationId: 'org-a',
      note: 'owner-created-project',
      at: '2026-06-18T01:00:00.000Z',
    });
  });

  test('rejects commercial project writes without organization actor and audit reason', async () => {
    await expect(
      repository.createProject({ id: 'missing-organization', stages: [] }, {
        actorId: 'owner-aa',
        auditReason: 'missing organization',
      }),
    ).rejects.toThrow('organizationId is required');
    await expect(
      repository.createProject({ id: 'missing-actor', stages: [] }, {
        organizationId: 'org-a',
        auditReason: 'missing actor',
      }),
    ).rejects.toThrow('actorId is required');
    await expect(
      repository.createProject({ id: 'missing-reason', stages: [] }, {
        organizationId: 'org-a',
        actorId: 'owner-aa',
      }),
    ).rejects.toThrow('auditReason is required');
  });

  test('updates stages and appends audit events through the repository boundary', async () => {
    await repository.createProject(
      {
        id: 'stage-project',
        name: 'Stage Project',
        currentStageId: 'pm-requirements',
        stages: [],
      },
      {
        organizationId: 'org-a',
        actorId: 'owner-aa',
        auditReason: 'seed project',
        now: '2026-06-18T01:00:00.000Z',
      },
    );

    const staged = await repository.updateProjectStage('stage-project', 'development', {
      organizationId: 'org-a',
      actorId: 'tech-chen',
      auditReason: 'development-ready',
      now: '2026-06-18T02:00:00.000Z',
    });
    const audited = await repository.appendAuditEvent(
      'stage-project',
      {
        type: 'ops-handoff-requested',
        note: 'RTSP and GPU requirements requested.',
      },
      {
        organizationId: 'org-a',
        actorId: 'ops-wang',
        auditReason: 'ops handoff tracked',
        now: '2026-06-18T03:00:00.000Z',
      },
    );

    expect(staged.currentStageId).toBe('development');
    expect(staged.history[0]).toMatchObject({
      type: 'project-stage-updated',
      actorUserId: 'tech-chen',
      note: 'development-ready',
    });
    expect(audited.history[0]).toMatchObject({
      type: 'ops-handoff-requested',
      actorUserId: 'ops-wang',
      note: 'RTSP and GPU requirements requested.',
      auditReason: 'ops handoff tracked',
    });
  });

  test('updates project workflow state with authenticated audit metadata', async () => {
    await repository.createProject(
      {
        id: 'workflow-project',
        name: 'Workflow Project',
        currentStageId: 'pm-requirements',
        stages: [],
        history: [],
      },
      {
        organizationId: 'org-a',
        actorId: 'pm-lin',
        auditReason: 'seed workflow project',
        now: '2026-06-18T01:00:00.000Z',
      },
    );

    const updated = await repository.updateProjectWithAudit(
      'workflow-project',
      (project) => ({
        ...project,
        requirementAnswers: { users: 'Security guards' },
        updatedAt: '2026-06-18T02:00:00.000Z',
        history: [
          {
            type: 'requirement-answer',
            actor: '项目经理',
            note: '目标用户',
            at: '2026-06-18T02:00:00.000Z',
          },
          ...project.history,
        ],
      }),
      {
        organizationId: 'org-a',
        actorId: 'pm-lin',
        auditReason: 'api-requirement-answer',
      },
    );

    expect(updated.requirementAnswers).toEqual({ users: 'Security guards' });
    expect(updated.history[0]).toMatchObject({
      type: 'requirement-answer',
      actor: '项目经理',
      actorUserId: 'pm-lin',
      organizationId: 'org-a',
      auditReason: 'api-requirement-answer',
      note: '目标用户',
    });
  });

  test('creates updates and lists jobs and notifications as SQL-ready records', async () => {
    await repository.createProject(
      {
        id: 'operations-project',
        name: 'Operations Project',
        stages: [],
        notifications: [
          {
            id: 'notification-1',
            channel: 'in-app',
            status: 'open',
            title: 'PM input blocked',
            createdAt: '2026-06-18T01:30:00.000Z',
          },
        ],
      },
      {
        organizationId: 'org-a',
        actorId: 'owner-aa',
        auditReason: 'seed operations project',
        now: '2026-06-18T01:00:00.000Z',
      },
    );
    await repository.createProject(
      {
        id: 'other-operations-project',
        name: 'Other Operations Project',
        stages: [],
        notifications: [
          {
            id: 'notification-2',
            channel: 'in-app',
            status: 'open',
            title: 'Other tenant notification',
            createdAt: '2026-06-18T01:40:00.000Z',
          },
        ],
      },
      {
        organizationId: 'org-b',
        actorId: 'owner-aa',
        auditReason: 'seed other tenant',
        now: '2026-06-18T01:00:00.000Z',
      },
    );

    const queued = await repository.createJob(
      'operations-project',
      {
        id: 'job-1',
        type: 'ai-development',
        title: 'Run AI coding',
        command: 'npm test',
      },
      {
        organizationId: 'org-a',
        actorId: 'ai-dev-bot',
        auditReason: 'queue ai development job',
        historyType: 'platform-job-queued',
        now: '2026-06-18T02:00:00.000Z',
      },
    );
    const updated = await repository.updateJob(
      'operations-project',
      'job-1',
      {
        status: 'succeeded',
        exitCode: 0,
      },
      {
        organizationId: 'org-a',
        actorId: 'runner-local',
        auditReason: 'runner completed job',
        historyType: 'platform-job-succeeded',
        now: '2026-06-18T02:05:00.000Z',
      },
    );

    expect(queued.platformJobs[0]).toMatchObject({
      id: 'job-1',
      organizationId: 'org-a',
      projectId: 'operations-project',
      status: 'queued',
      queuedAt: '2026-06-18T02:00:00.000Z',
    });
    expect(queued.history[0]).toMatchObject({
      type: 'platform-job-queued',
      actorUserId: 'ai-dev-bot',
      organizationId: 'org-a',
      auditReason: 'queue ai development job',
      jobId: 'job-1',
    });
    expect(updated.platformJobs[0]).toMatchObject({
      id: 'job-1',
      status: 'succeeded',
      exitCode: 0,
      updatedAt: '2026-06-18T02:05:00.000Z',
    });
    expect(updated.history[0]).toMatchObject({
      type: 'platform-job-succeeded',
      actorUserId: 'runner-local',
      organizationId: 'org-a',
      auditReason: 'runner completed job',
      jobId: 'job-1',
      jobStatus: 'succeeded',
    });
    await expect(repository.listNotifications('org-a')).resolves.toEqual([
      expect.objectContaining({
        id: 'notification-1',
        organizationId: 'org-a',
        projectId: 'operations-project',
        projectName: 'Operations Project',
      }),
    ]);
  });

  test('exposes agent job query run and event records through the repository contract', async () => {
    await repository.createProject(
      {
        id: 'agent-ops-project',
        name: 'Agent Ops Project',
        stages: [],
      },
      {
        organizationId: 'org-a',
        actorId: 'owner-aa',
        auditReason: 'seed agent operations project',
        now: '2026-06-18T01:00:00.000Z',
      },
    );
    await repository.createProject(
      {
        id: 'other-agent-project',
        name: 'Other Agent Project',
        stages: [],
      },
      {
        organizationId: 'org-b',
        actorId: 'owner-aa',
        auditReason: 'seed other agent project',
        now: '2026-06-18T01:00:00.000Z',
      },
    );

    await repository.createJob(
      'agent-ops-project',
      {
        id: 'job-queued',
        type: 'ai-development',
        title: 'Queued AI coding',
        status: 'queued',
        command: 'npm test',
      },
      {
        organizationId: 'org-a',
        actorId: 'ai-dev-bot',
        auditReason: 'queue ai job',
        historyType: 'platform-job-queued',
        now: '2026-06-18T02:00:00.000Z',
      },
    );
    await repository.createJob(
      'other-agent-project',
      {
        id: 'other-job',
        type: 'ai-development',
        title: 'Other tenant job',
        status: 'queued',
        command: 'npm test',
      },
      {
        organizationId: 'org-b',
        actorId: 'ai-dev-bot',
        auditReason: 'queue other ai job',
        historyType: 'platform-job-queued',
        now: '2026-06-18T02:00:00.000Z',
      },
    );

    await expect(repository.listJobsByStatus('org-a', { status: 'queued' })).resolves.toEqual([
      expect.objectContaining({
        id: 'job-queued',
        organizationId: 'org-a',
        projectId: 'agent-ops-project',
        projectName: 'Agent Ops Project',
        status: 'queued',
        type: 'ai-development',
      }),
    ]);

    const withRun = await repository.createJobRun(
      'agent-ops-project',
      'job-queued',
      {
        id: 'run-1',
        runNumber: 1,
        workerId: 'runner-a',
        status: 'running',
        leaseStartedAt: '2026-06-18T02:01:00.000Z',
        leaseHeartbeatAt: '2026-06-18T02:02:00.000Z',
        leaseExpiresAt: '2026-06-18T02:12:00.000Z',
        startedAt: '2026-06-18T02:01:00.000Z',
      },
      {
        organizationId: 'org-a',
        actorId: 'runner-local',
        auditReason: 'runner claimed job',
        now: '2026-06-18T02:02:00.000Z',
      },
    );

    expect(withRun.agentJobRuns[0]).toMatchObject({
      id: 'run-1',
      organizationId: 'org-a',
      projectId: 'agent-ops-project',
      jobId: 'job-queued',
      runNumber: 1,
      workerId: 'runner-a',
      status: 'running',
      leaseExpiresAt: '2026-06-18T02:12:00.000Z',
      createdAt: '2026-06-18T02:02:00.000Z',
      updatedAt: '2026-06-18T02:02:00.000Z',
    });
    expect(withRun.history[0]).toMatchObject({
      type: 'repository-job-run-created',
      actorUserId: 'runner-local',
      organizationId: 'org-a',
      auditReason: 'runner claimed job',
      jobId: 'job-queued',
      jobRunId: 'run-1',
    });

    const withUpdatedRun = await repository.updateJobRun(
      'agent-ops-project',
      'job-queued',
      'run-1',
      {
        status: 'succeeded',
        leaseHeartbeatAt: '2026-06-18T02:04:00.000Z',
        finishedAt: '2026-06-18T02:05:00.000Z',
        durationMs: 240000,
        exitCode: 0,
      },
      {
        organizationId: 'org-a',
        actorId: 'runner-local',
        auditReason: 'runner completed run',
        now: '2026-06-18T02:05:00.000Z',
      },
    );

    expect(withUpdatedRun.agentJobRuns[0]).toMatchObject({
      id: 'run-1',
      jobId: 'job-queued',
      status: 'succeeded',
      leaseHeartbeatAt: '2026-06-18T02:04:00.000Z',
      finishedAt: '2026-06-18T02:05:00.000Z',
      durationMs: 240000,
      exitCode: 0,
      updatedAt: '2026-06-18T02:05:00.000Z',
    });
    expect(withUpdatedRun.history[0]).toMatchObject({
      type: 'repository-job-run-updated',
      actorUserId: 'runner-local',
      organizationId: 'org-a',
      auditReason: 'runner completed run',
      jobId: 'job-queued',
      jobRunId: 'run-1',
      jobStatus: 'succeeded',
    });

    const withEvent = await repository.appendJobEvent(
      'agent-ops-project',
      'job-queued',
      {
        id: 'event-1',
        type: 'platform-job-heartbeat',
        workerId: 'runner-a',
        payload: {
          leaseExpiresAt: '2026-06-18T02:12:00.000Z',
        },
      },
      {
        organizationId: 'org-a',
        actorId: 'runner-local',
        auditReason: 'runner heartbeat',
        now: '2026-06-18T02:02:30.000Z',
      },
    );

    expect(withEvent.agentJobEvents[0]).toMatchObject({
      id: 'event-1',
      organizationId: 'org-a',
      projectId: 'agent-ops-project',
      jobId: 'job-queued',
      type: 'platform-job-heartbeat',
      actorUserId: 'runner-local',
      workerId: 'runner-a',
      payload: {
        leaseExpiresAt: '2026-06-18T02:12:00.000Z',
      },
      createdAt: '2026-06-18T02:02:30.000Z',
    });
    expect(withEvent.history[0]).toMatchObject({
      type: 'platform-job-heartbeat',
      actorUserId: 'runner-local',
      organizationId: 'org-a',
      auditReason: 'runner heartbeat',
      jobId: 'job-queued',
      jobEventId: 'event-1',
    });

    await expect(
      repository.createJobRun(
        'agent-ops-project',
        'job-queued',
        { id: 'wrong-org-run', runNumber: 2 },
        {
          organizationId: 'org-b',
          actorId: 'runner-local',
          auditReason: 'wrong org run',
        },
      ),
    ).rejects.toThrow('project organization mismatch');
    await expect(
      repository.updateJobRun(
        'agent-ops-project',
        'job-queued',
        'missing-run',
        { status: 'failed' },
        {
          organizationId: 'org-a',
          actorId: 'runner-local',
          auditReason: 'missing run update',
        },
      ),
    ).rejects.toThrow('job run not found');
  });
});
