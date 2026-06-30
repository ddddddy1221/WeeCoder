import { describe, expect, test } from 'vitest';
import { createProject, STAGE_IDS } from './workflow.js';
import { createProjectExecutionAudit } from './projectExecutionAudit.js';

describe('project execution audit', () => {
  test('summarizes project automation jobs, workflow executions, and evidence gaps', () => {
    const project = {
      ...createProject({
        name: 'Camera monitor',
        sponsor: 'AA',
        summary: 'Detect pedestrians from an RTSP camera stream.',
      }),
      qaEvidence: {
        status: 'incomplete',
        missingFields: ['durationMinutes'],
      },
      platformJobs: [
        {
          id: 'job-qa-fix',
          type: 'qa-defect-fix',
          title: 'QA 修复执行',
          status: 'failed',
          command: 'npm test',
          executor: 'codex-local',
          queuedAt: '2026-06-18T10:00:00.000Z',
          startedAt: '2026-06-18T10:01:00.000Z',
          finishedAt: '2026-06-18T10:02:00.000Z',
          runCount: 2,
          errorSummary: 'RTSP reconnect failed.',
          details: {
            sandboxPolicy: 'project-verification-command-allowlist',
          },
        },
        {
          id: 'job-ai-dev',
          type: 'ai-development',
          title: 'AI 开发验证',
          status: 'succeeded',
          command: 'npm test',
          executor: 'codex-local',
          queuedAt: '2026-06-18T09:00:00.000Z',
          startedAt: '2026-06-18T09:01:00.000Z',
          finishedAt: '2026-06-18T09:02:00.000Z',
          runCount: 1,
          resultSummary: 'All checks passed.',
          stdout: 'tests passed',
          exitCode: 0,
          durationMs: 60000,
          details: {
            sandboxPolicy: 'project-verification-command-allowlist',
          },
        },
      ],
      developmentRun: {
        status: 'completed',
        commitHash: 'abc123',
        completedAt: '2026-06-18T09:03:00.000Z',
        checks: [{ command: 'npm test', status: 'passed', result: 'ok' }],
      },
      codeReviewReport: {
        status: 'passed',
        reviewedAt: '2026-06-18T09:30:00.000Z',
        commitHash: 'abc123',
        summary: 'Review passed.',
        blockers: [],
      },
      qaRun: {
        status: 'needs-work',
        executedAt: '2026-06-18T10:10:00.000Z',
        commitHash: 'abc123',
        summary: 'One case failed.',
        testCases: [
          { id: 'person-detection', title: 'Person detection', status: 'passed' },
          { id: 'rtsp-reconnect', title: 'RTSP reconnect', status: 'failed' },
        ],
        blockers: ['RTSP reconnect failed.'],
        defectRouting: {
          shouldReturnToDevelopment: true,
          targetStageId: STAGE_IDS.DEVELOPMENT,
          reasons: ['RTSP reconnect failed.'],
        },
      },
      defectFixPackage: {
        status: 'ready',
        sourceCommitHash: 'abc123',
        qaPassRate: '1/2',
        repairSubmission: {
          status: 'blocked',
          jobId: 'job-qa-fix',
          jobStatus: 'failed',
          jobErrorSummary: 'RTSP reconnect failed.',
          sandboxPolicy: 'project-verification-command-allowlist',
        },
      },
    };

    const audit = createProjectExecutionAudit(project);

    expect(audit).toMatchObject({
      projectId: project.id,
      projectName: 'Camera monitor',
      status: 'blocked',
      totalExecutionCount: 6,
      platformJobCount: 2,
      workflowExecutionCount: 4,
      succeededCount: 3,
      failedCount: 3,
      runningCount: 0,
      queuedCount: 0,
      evidenceGapCount: 1,
      sandboxPolicyCount: 2,
      latestAction: expect.objectContaining({
        id: 'job-qa-fix',
        source: 'platform-job',
        status: 'failed',
        title: 'QA 修复执行',
        sandboxPolicy: 'project-verification-command-allowlist',
      }),
      nextAction: '先处理失败的后台任务 QA 修复执行：RTSP reconnect failed.',
    });
    expect(audit.rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'job-ai-dev',
          source: 'platform-job',
          status: 'succeeded',
          evidenceComplete: true,
          command: 'npm test',
        }),
        expect.objectContaining({
          id: 'development-run',
          source: 'workflow',
          type: 'ai-development',
          status: 'succeeded',
          evidenceComplete: true,
          command: 'npm test',
        }),
        expect.objectContaining({
          id: 'qa-run',
          source: 'workflow',
          type: 'qa-run',
          status: 'failed',
          evidenceComplete: false,
          missingEvidence: ['qaEvidence'],
        }),
      ]),
    );
  });

  test('reports missing execution when a project has not run automation yet', () => {
    const project = createProject({
      name: 'Camera monitor',
      sponsor: 'AA',
      summary: 'Detect pedestrians from an RTSP camera stream.',
    });

    const audit = createProjectExecutionAudit(project);

    expect(audit).toMatchObject({
      projectId: project.id,
      status: 'missing',
      totalExecutionCount: 0,
      nextAction: '先排队 AI coding、代码评审或测试后台任务，形成可审计的自动执行记录。',
      rows: [],
    });
  });

  test('creates remediation actions for retry, stale lease reclaim, queued starts, and evidence gaps', () => {
    const project = {
      ...createProject({
        name: 'Camera monitor',
        sponsor: 'AA',
        summary: 'Detect pedestrians from an RTSP camera stream.',
      }),
      platformJobs: [
        {
          id: 'job-review-failed',
          type: 'code-review',
          title: '代码评审后台任务',
          status: 'failed',
          command: 'npm test',
          executor: 'codex-local',
          queuedAt: '2026-06-18T09:00:00.000Z',
          startedAt: '2026-06-18T09:01:00.000Z',
          finishedAt: '2026-06-18T09:02:00.000Z',
          runCount: 1,
          errorSummary: 'SAST rule failed.',
          stderr: 'security warning',
        },
        {
          id: 'job-stale-runner',
          type: 'qa-run',
          title: '测试验证后台任务',
          status: 'running',
          command: 'npm test',
          executor: 'codex-local',
          lockedBy: 'runner-a',
          queuedAt: '2026-06-18T09:20:00.000Z',
          startedAt: '2026-06-18T09:21:00.000Z',
          leaseExpiresAt: '2026-06-18T09:36:00.000Z',
        },
        {
          id: 'job-ai-queued',
          type: 'ai-development',
          title: 'AI 开发执行',
          status: 'queued',
          command: 'npm test',
          executor: 'codex-local',
          queuedAt: '2026-06-18T09:40:00.000Z',
        },
      ],
      qaEvidence: {
        status: 'incomplete',
      },
      qaRun: {
        status: 'needs-work',
        executedAt: '2026-06-18T09:50:00.000Z',
        testCases: [],
        blockers: ['缺少测试证据。'],
      },
    };

    const audit = createProjectExecutionAudit(project, {
      now: '2026-06-18T10:00:00.000Z',
    });

    expect(audit.remediation).toMatchObject({
      totalActionCount: 4,
      retryCount: 1,
      reclaimCount: 1,
      startCount: 1,
      evidenceCount: 1,
      primaryAction: {
        id: 'retry-job-review-failed',
        action: 'retry',
        jobId: 'job-review-failed',
        severity: 'high',
        label: '重试任务',
        reason: 'SAST rule failed.',
      },
    });
    expect(audit.remediation.actions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'reclaim-job-stale-runner',
          action: 'reclaim',
          jobId: 'job-stale-runner',
          label: '回收任务',
          reason: '执行器 runner-a 的租约已过期。',
        }),
        expect.objectContaining({
          id: 'start-job-ai-queued',
          action: 'start',
          jobId: 'job-ai-queued',
          label: '开始任务',
          severity: 'normal',
        }),
        expect.objectContaining({
          id: 'evidence-qa-run',
          action: 'collect-evidence',
          rowId: 'qa-run',
          label: '补齐证据',
          missingEvidence: ['testCases', 'qaEvidence'],
        }),
      ]),
    );
  });

  test('summarizes agent run timeline for project-level execution traceability', () => {
    const project = {
      ...createProject({
        name: 'Camera monitor',
        sponsor: 'AA',
        summary: 'Detect pedestrians from an RTSP camera stream.',
      }),
      platformJobs: [
        {
          id: 'job-ai-dev',
          type: 'ai-development',
          title: 'AI 开发执行',
          status: 'succeeded',
          command: 'npm test',
          executor: 'codex-local',
          queuedAt: '2026-06-18T09:00:00.000Z',
          startedAt: '2026-06-18T09:01:00.000Z',
          finishedAt: '2026-06-18T09:05:00.000Z',
          runCount: 1,
          resultSummary: 'All checks passed.',
          stdout: 'tests passed',
          exitCode: 0,
          durationMs: 240000,
        },
      ],
      agentJobRuns: [
        {
          id: 'job-ai-dev-run-1',
          jobId: 'job-ai-dev',
          runNumber: 1,
          workerId: 'runner-a',
          status: 'succeeded',
          leaseStartedAt: '2026-06-18T09:01:00.000Z',
          leaseHeartbeatAt: '2026-06-18T09:03:00.000Z',
          leaseExpiresAt: '2026-06-18T09:18:00.000Z',
          startedAt: '2026-06-18T09:01:00.000Z',
          finishedAt: '2026-06-18T09:05:00.000Z',
          durationMs: 240000,
          exitCode: 0,
          updatedAt: '2026-06-18T09:05:00.000Z',
        },
      ],
      agentJobEvents: [
        {
          id: 'event-start',
          jobId: 'job-ai-dev',
          type: 'platform-job-started',
          workerId: 'runner-a',
          createdAt: '2026-06-18T09:01:00.000Z',
          payload: { jobStatus: 'running' },
        },
        {
          id: 'event-heartbeat',
          jobId: 'job-ai-dev',
          type: 'platform-job-heartbeat',
          workerId: 'runner-a',
          createdAt: '2026-06-18T09:03:00.000Z',
          payload: { jobStatus: 'running' },
        },
        {
          id: 'event-success',
          jobId: 'job-ai-dev',
          type: 'platform-job-succeeded',
          workerId: 'runner-a',
          createdAt: '2026-06-18T09:05:00.000Z',
          payload: { jobStatus: 'succeeded' },
        },
      ],
    };

    const audit = createProjectExecutionAudit(project, {
      now: '2026-06-18T09:06:00.000Z',
    });

    expect(audit.executionTimeline).toMatchObject({
      totalRunCount: 1,
      totalEventCount: 3,
      activeRunCount: 0,
      terminalRunCount: 1,
      staleRunCount: 0,
      latestRun: {
        runId: 'job-ai-dev-run-1',
        jobId: 'job-ai-dev',
        title: 'AI 开发执行',
        workerId: 'runner-a',
        status: 'succeeded',
        eventCount: 3,
        latestEventType: 'platform-job-succeeded',
        latestEventAt: '2026-06-18T09:05:00.000Z',
      },
    });
    expect(audit.executionTimeline.rows).toEqual([
      expect.objectContaining({
        runId: 'job-ai-dev-run-1',
        runNumber: 1,
        durationMs: 240000,
        lifecycle: [
          expect.objectContaining({ type: 'platform-job-succeeded' }),
          expect.objectContaining({ type: 'platform-job-heartbeat' }),
          expect.objectContaining({ type: 'platform-job-started' }),
        ],
      }),
    ]);
  });
});
