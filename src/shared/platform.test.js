import { describe, expect, test } from 'vitest';
import {
  acknowledgeNotificationForProject,
  acknowledgeOwnerEscalationForProject,
  sendOwnerEscalationForProject,
  updateNotificationActionForProject,
  cancelPlatformJobForProject,
  completePlatformJobForProject,
  createPlatformCockpit,
  createPlatformSession,
  failPlatformJobForProject,
  filterProjectsForSession,
  heartbeatPlatformJobForProject,
  queuePlatformJobForProject,
  reclaimPlatformJobForProject,
  retryPlatformJobForProject,
  startPlatformJobForProject,
  updateDeploymentEnvironmentForProject,
  withProjectOrganization,
} from './platform.js';

describe('commercial platform model', () => {
  test('creates an organization-scoped session and filters tenant projects', () => {
    const session = createPlatformSession({
      userId: 'pm-lin',
      organizationId: 'wee-coder-labs',
    });
    const projects = [
      { id: 'default-project', name: '默认组织项目' },
      { id: 'pilot-project', name: '试点组织项目', organizationId: 'acme-security-pilot' },
    ];

    expect(session.currentUser).toMatchObject({ id: 'pm-lin', role: 'pm' });
    expect(session.currentOrganization).toMatchObject({
      id: 'wee-coder-labs',
      name: 'WeeCoder Labs',
    });
    expect(session.permissions).toMatchObject({
      manageOrganization: false,
      manageBilling: false,
      runDelivery: true,
    });
    expect(filterProjectsForSession(projects, session).map((project) => project.id)).toEqual([
      'default-project',
    ]);
    expect(withProjectOrganization(projects[0], session)).toMatchObject({
      id: 'default-project',
      organizationId: 'wee-coder-labs',
    });
  });

  test('summarizes SaaS readiness gaps, jobs, audit, SLA, deployment, and cost', () => {
    const session = createPlatformSession({
      userId: 'owner-aa',
      organizationId: 'wee-coder-labs',
    });
    const cockpit = createPlatformCockpit(
      [
        {
          id: 'yolo',
          name: 'YOLO 摄像头监控',
          organizationId: 'wee-coder-labs',
          health: 'at-risk',
          currentStageId: 'development',
          currentStageName: '自动开发',
          updatedAt: '2026-06-13T00:00:00.000Z',
          openFollowupTaskCount: 2,
          stageGateReport: {
            stageId: 'development',
            stageName: 'Development',
            status: 'blocked',
            blockerCount: 1,
            openTaskCount: 2,
            requiredActions: ['Complete development gate blockers.'],
          },
          stageRiskRegister: {
            development: {
              riskLevel: 'high',
              recommendedActions: ['Review development blockers.'],
            },
          },
          artifacts: {
            'pm-requirements': '# PRD',
            development: '# 开发任务',
          },
          repositoryConfig: {
            executionMode: 'codex-local',
            verificationCommands: ['npm test', 'npm run build'],
          },
          agentExecutionPackage: {
            canStart: true,
            status: 'ready',
          },
          platformJobs: [
            {
              id: 'manual-ai-job',
              type: 'ai-development',
              title: 'AI coding 后台任务',
              status: 'queued',
              queuedAt: '2026-06-14T01:00:00.000Z',
              executor: 'codex-local',
            },
          ],
          developmentRun: {
            status: 'completed',
            checks: [
              { command: 'npm test', status: 'passed' },
              { command: 'npm run build', status: 'passed' },
            ],
          },
          codeReviewReport: {
            status: 'passed',
          },
          qaRun: {
            status: 'needs-work',
          },
          history: [
            {
              type: 'development-executed',
              actor: 'AI 开发',
              note: '完成基础实现。',
              at: '2026-06-14T02:00:00.000Z',
            },
            {
              type: 'code-review-finished',
              actor: '技术负责人',
              note: 'Review 通过。',
              at: '2026-06-14T03:00:00.000Z',
            },
          ],
        },
        {
          id: 'external',
          name: '其他组织项目',
          organizationId: 'acme-security-pilot',
          currentStageId: 'qa',
          currentStageName: '测试',
          updatedAt: '2026-06-16T00:00:00.000Z',
          history: [],
        },
      ],
      {
        now: '2026-06-17T00:00:00.000Z',
        session,
      },
    );

    expect(cockpit.tenancy).toMatchObject({
      currentOrganizationId: 'wee-coder-labs',
      visibleProjectCount: 1,
      activeUserCount: 8,
    });
    expect(cockpit.database).toMatchObject({
      persistenceMode: 'json-store',
      targetEngine: 'postgresql',
      status: 'schema-ready',
    });
    expect(cockpit.database.tables.map((table) => table.name)).toEqual(
      expect.arrayContaining(['organizations', 'projects', 'agent_jobs', 'audit_logs']),
    );
    expect(cockpit.database.migrationPlan).toMatchObject({
      id: 'json-to-postgresql-v1',
      sourceMode: 'json-store',
      targetEngine: 'postgresql',
      status: 'schema-ready',
      phaseCount: 4,
      readyPhaseCount: 2,
      phases: expect.arrayContaining([
        expect.objectContaining({
          id: 'schema-baseline',
          status: 'ready',
          targetTables: expect.arrayContaining(['organizations', 'users', 'projects']),
        }),
        expect.objectContaining({
          id: 'cutover',
          status: 'blocked',
        }),
      ]),
      entityMappings: expect.arrayContaining([
        expect.objectContaining({
          source: 'project.organizationId',
          targetTable: 'projects',
          targetColumns: ['organization_id'],
          status: 'mapped',
        }),
        expect.objectContaining({
          source: 'project.platformJobs[]',
          targetTable: 'agent_jobs',
          status: 'needs-extraction',
        }),
      ]),
      cutoverChecks: expect.arrayContaining([
        expect.objectContaining({ id: 'backup-json-store', required: true }),
        expect.objectContaining({ id: 'tenant-count-reconciliation', required: true }),
      ]),
    });
    expect(cockpit.aiOperations.queue).toMatchObject({
      totalJobs: 4,
      queuedCount: 1,
      runningCount: 0,
      failedCount: 1,
      succeededCount: 2,
    });
    expect(cockpit.aiOperations.jobs[0]).toMatchObject({
      id: 'manual-ai-job',
      title: 'AI coding 后台任务',
      status: 'queued',
    });
    expect(cockpit.aiOperations.sandbox.allowedCommands).toEqual(['npm test', 'npm run build']);
    expect(cockpit.governance.auditLog[0]).toMatchObject({
      projectId: 'yolo',
      type: 'code-review-finished',
      actor: '技术负责人',
    });
    expect(cockpit.governance.sla).toMatchObject({
      breachedCount: 1,
      blockedFollowupCount: 2,
    });
    expect(cockpit.governance.commandCenter).toMatchObject({
      totalBlockers: 2,
      stageGateProjectCount: 1,
      followupProjectCount: 0,
      failedJobCount: 1,
      highSeverityCount: 2,
      blockers: expect.arrayContaining([
        expect.objectContaining({
          type: 'stage-gate',
          severity: 'high',
          projectId: 'yolo',
          stageId: 'development',
          openTaskCount: 2,
        }),
        expect.objectContaining({
          type: 'failed-job',
          severity: 'high',
          projectId: 'yolo',
          jobType: 'qa-run',
        }),
      ]),
    });
    expect(cockpit.governance.projectHealth).toMatchObject({
      summary: {
        totalProjects: 1,
        criticalCount: 1,
        warningCount: 0,
        healthyCount: 0,
      },
      projects: [
        expect.objectContaining({
          projectId: 'yolo',
          level: 'critical',
          gateStatus: 'blocked',
          riskLevel: 'high',
          failedJobCount: 1,
          nextAction: 'Complete development gate blockers.',
        }),
      ],
    });
    expect(cockpit.deployment.environments.map((environment) => environment.id)).toEqual([
      'local',
      'staging',
      'production',
    ]);
    expect(cockpit.deployment.environments[2]).toMatchObject({
      id: 'production',
      status: 'blocked',
    });
    expect(cockpit.governance.cost.totalEstimatedCny).toBeGreaterThan(0);
  });

  test('summarizes agent job run ledger from persisted run and event records', () => {
    const session = createPlatformSession({
      userId: 'owner-aa',
      organizationId: 'wee-coder-labs',
    });
    const cockpit = createPlatformCockpit(
      [
        {
          id: 'camera-monitor',
          name: 'Camera Monitor',
          organizationId: 'wee-coder-labs',
          platformJobs: [
            {
              id: 'job-ai-detect',
              type: 'ai-development',
              title: 'AI coding verification',
              status: 'running',
              queuedAt: '2026-06-17T01:00:00.000Z',
              runCount: 2,
              lockedBy: 'runner-a',
            },
          ],
          agentJobRuns: [
            {
              id: 'job-ai-detect-run-2',
              jobId: 'job-ai-detect',
              runNumber: 2,
              workerId: 'runner-a',
              status: 'running',
              leaseHeartbeatAt: '2026-06-17T01:09:00.000Z',
              leaseExpiresAt: '2026-06-17T01:19:00.000Z',
              startedAt: '2026-06-17T01:05:00.000Z',
              updatedAt: '2026-06-17T01:09:00.000Z',
            },
            {
              id: 'job-ai-detect-run-1',
              jobId: 'job-ai-detect',
              runNumber: 1,
              workerId: 'runner-old',
              status: 'reclaimed',
              leaseHeartbeatAt: '2026-06-17T00:09:00.000Z',
              leaseExpiresAt: '2026-06-17T00:19:00.000Z',
              startedAt: '2026-06-17T00:05:00.000Z',
              finishedAt: '2026-06-17T00:20:00.000Z',
              durationMs: 900000,
              exitCode: null,
              updatedAt: '2026-06-17T00:20:00.000Z',
            },
          ],
          agentJobEvents: [
            {
              id: 'event-heartbeat',
              jobId: 'job-ai-detect',
              type: 'platform-job-heartbeat',
              workerId: 'runner-a',
              createdAt: '2026-06-17T01:09:00.000Z',
              payload: { jobStatus: 'running' },
            },
            {
              id: 'event-reclaimed',
              jobId: 'job-ai-detect',
              type: 'platform-job-reclaimed',
              workerId: 'runner-old',
              createdAt: '2026-06-17T00:20:00.000Z',
              payload: { jobStatus: 'queued' },
            },
          ],
        },
        {
          id: 'external',
          name: 'External Tenant',
          organizationId: 'acme-security-pilot',
          agentJobRuns: [{ id: 'external-run', jobId: 'external-job', status: 'running' }],
        },
      ],
      {
        now: '2026-06-17T01:10:00.000Z',
        session,
      },
    );

    expect(cockpit.aiOperations.runLedger).toMatchObject({
      totalRunCount: 2,
      activeRunCount: 1,
      terminalRunCount: 1,
      totalEventCount: 2,
      staleRunCount: 0,
      nextAction: 'Review active runs and terminal evidence before approving delivery gates.',
      rows: [
        expect.objectContaining({
          runId: 'job-ai-detect-run-2',
          jobId: 'job-ai-detect',
          projectName: 'Camera Monitor',
          title: 'AI coding verification',
          runNumber: 2,
          status: 'running',
          workerId: 'runner-a',
          eventCount: 1,
          latestEventType: 'platform-job-heartbeat',
          latestEventAt: '2026-06-17T01:09:00.000Z',
        }),
        expect.objectContaining({
          runId: 'job-ai-detect-run-1',
          status: 'reclaimed',
          terminal: true,
          eventCount: 1,
          latestEventType: 'platform-job-reclaimed',
        }),
      ],
    });
  });

  test('uses readable stage names from full projects in command center blockers', () => {
    const session = createPlatformSession({
      userId: 'owner-aa',
      organizationId: 'wee-coder-labs',
    });
    const cockpit = createPlatformCockpit(
      [
        {
          id: 'camera',
          name: 'Camera Monitor',
          organizationId: 'wee-coder-labs',
          currentStageId: 'pm-requirements',
          stages: [
            { id: 'intake', name: '项目入口' },
            { id: 'pm-requirements', name: '项目经理需求' },
          ],
          openFollowupTaskCount: 1,
          followupTaskTargetRoleLabels: ['项目经理'],
          followupTaskAssigneeNames: ['林项目经理'],
          updatedAt: '2026-06-17T00:00:00.000Z',
        },
      ],
      {
        now: '2026-06-17T01:00:00.000Z',
        session,
      },
    );

    expect(cockpit.governance.commandCenter.blockers[0]).toMatchObject({
      projectId: 'camera',
      stageName: '项目经理需求',
      nextAction: '请 林项目经理 补齐 项目经理需求 信息。',
    });
  });

  test('reports database cutover gates and table extraction readiness', () => {
    const session = createPlatformSession({
      userId: 'owner-aa',
      organizationId: 'wee-coder-labs',
    });
    const cockpit = createPlatformCockpit([], {
      session,
      storageProfile: {
        mode: 'json-store',
        adapter: 'JsonProjectRepository',
        targetEngine: 'postgresql',
        migrationStatus: 'schema-ready',
        supportsTransactions: false,
        supportsConcurrentWrites: false,
        contractMethods: [
          'listProjects',
          'listProjectsByOrganization',
          'getProject',
          'addProject',
          'createProject',
          'updateProject',
          'updateProjectWithAudit',
          'updateProjectStage',
          'appendAuditEvent',
          'createJob',
          'updateJob',
          'listJobsByStatus',
          'createJobRun',
          'updateJobRun',
          'appendJobEvent',
          'listNotifications',
        ],
        location: 'data/projects.json',
      },
    });

    expect(cockpit.database.cutoverReadiness).toMatchObject({
      status: 'blocked',
      readyGateCount: 2,
      blockedGateCount: 2,
      plannedGateCount: 1,
      nextAction: 'Implement transactional database writes before production cutover.',
      gates: [
        expect.objectContaining({
          id: 'repository-contract',
          status: 'ready',
          evidence: 'JsonProjectRepository exposes the persistence boundary.',
        }),
        expect.objectContaining({
          id: 'transaction-support',
          status: 'blocked',
          nextAction: 'Replace JSON file writes with PostgreSQL transactions.',
        }),
        expect.objectContaining({
          id: 'concurrent-writes',
          status: 'blocked',
          nextAction: 'Add optimistic locking or database-level write serialization.',
        }),
        expect.objectContaining({
          id: 'tenant-scoping',
          status: 'ready',
        }),
        expect.objectContaining({
          id: 'backup-rollback',
          status: 'planned',
        }),
      ],
    });
    expect(cockpit.database.extractionReadiness).toMatchObject({
      totalTableCount: expect.any(Number),
      mappedTableCount: expect.any(Number),
      blockedTableCount: expect.any(Number),
      tables: expect.arrayContaining([
        expect.objectContaining({
          tableName: 'projects',
          status: 'mapped',
          source: 'project root',
          priority: 'P0',
        }),
        expect.objectContaining({
          tableName: 'agent_jobs',
          status: 'needs-extraction',
          source: 'project.platformJobs[]',
          priority: 'P1',
        }),
      ]),
    });
    expect(cockpit.database.repositoryContract).toMatchObject({
      status: 'ready',
      readyMethodCount: 12,
      missingMethodCount: 0,
      nextAction: 'Start migrating API routes to repository contract methods.',
      methods: expect.arrayContaining([
        expect.objectContaining({
          name: 'listProjectsByOrganization',
          status: 'ready',
          table: 'projects',
        }),
        expect.objectContaining({
          name: 'updateProjectWithAudit',
          status: 'ready',
          table: 'workflow_events',
        }),
        expect.objectContaining({
          name: 'appendAuditEvent',
          status: 'ready',
          table: 'audit_logs',
        }),
        expect.objectContaining({
          name: 'listJobsByStatus',
          status: 'ready',
          table: 'agent_jobs',
        }),
        expect.objectContaining({
          name: 'createJobRun',
          status: 'ready',
          table: 'agent_job_runs',
        }),
        expect.objectContaining({
          name: 'updateJobRun',
          status: 'ready',
          table: 'agent_job_runs',
        }),
        expect.objectContaining({
          name: 'appendJobEvent',
          status: 'ready',
          table: 'agent_job_events',
        }),
        expect.objectContaining({
          name: 'listNotifications',
          status: 'ready',
          table: 'notifications',
        }),
      ]),
    });
  });

  test('reports formal agent job table boundaries for production queue migration', () => {
    const session = createPlatformSession({
      userId: 'owner-aa',
      organizationId: 'wee-coder-labs',
    });
    const cockpit = createPlatformCockpit([], {
      session,
      storageProfile: {
        mode: 'json-store',
        adapter: 'JsonProjectRepository',
        targetEngine: 'postgresql',
        migrationStatus: 'schema-ready',
        supportsTransactions: false,
        supportsConcurrentWrites: false,
        contractMethods: [
          'listProjectsByOrganization',
          'createProject',
          'updateProjectWithAudit',
          'updateProjectStage',
          'appendAuditEvent',
          'createJob',
          'updateJob',
          'listNotifications',
        ],
      },
    });

    expect(cockpit.database.tables.map((table) => table.name)).toEqual(
      expect.arrayContaining(['agent_jobs', 'agent_job_runs', 'agent_job_events']),
    );
    expect(cockpit.database.migrationPlan.phases).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'agent-operations',
          targetTables: expect.arrayContaining([
            'agent_jobs',
            'agent_job_runs',
            'agent_job_events',
          ]),
        }),
      ]),
    );
    expect(cockpit.database.migrationPlan.entityMappings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source: 'project.platformJobs[].runCount + lease fields',
          targetTable: 'agent_job_runs',
          targetColumns: expect.arrayContaining([
            'job_id',
            'run_number',
            'worker_id',
            'lease_expires_at',
          ]),
          status: 'needs-extraction',
        }),
        expect.objectContaining({
          source: 'project.history[platform-job-*]',
          targetTable: 'agent_job_events',
          targetColumns: expect.arrayContaining(['job_id', 'type', 'actor_user_id', 'created_at']),
          status: 'needs-filtered-extraction',
        }),
      ]),
    );
    expect(cockpit.database.extractionReadiness.tables).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          tableName: 'agent_job_runs',
          source: 'project.platformJobs[].runCount + lease fields',
          status: 'needs-extraction',
          priority: 'P1',
        }),
        expect.objectContaining({
          tableName: 'agent_job_events',
          source: 'project.history[platform-job-*]',
          status: 'needs-filtered-extraction',
          priority: 'P1',
        }),
      ]),
    );
    expect(cockpit.database.agentQueueStorage).toMatchObject({
      status: 'needs-extraction',
      tableCount: 3,
      missingExtractionCount: 3,
      nextAction: 'Extract platform jobs into agent_jobs, agent_job_runs, and agent_job_events before SQL cutover.',
      tables: [
        expect.objectContaining({
          tableName: 'agent_jobs',
          purpose: 'Job identity, queue status, executor, and command.',
          source: 'project.platformJobs[]',
          status: 'needs-extraction',
        }),
        expect.objectContaining({
          tableName: 'agent_job_runs',
          purpose: 'Run attempts, worker lease ownership, duration, and exit code.',
          source: 'project.platformJobs[].runCount + lease fields',
          status: 'needs-extraction',
        }),
        expect.objectContaining({
          tableName: 'agent_job_events',
          purpose: 'Immutable lifecycle events for queue audit and replay.',
          source: 'project.history[platform-job-*]',
          status: 'needs-filtered-extraction',
        }),
      ],
    });
  });

  test('prioritizes stage gate blockers in the owner command center', () => {
    const session = createPlatformSession({
      userId: 'owner-aa',
      organizationId: 'wee-coder-labs',
    });
    const cockpit = createPlatformCockpit(
      [
        {
          id: 'camera',
          name: 'Camera Monitor',
          organizationId: 'wee-coder-labs',
          currentStageId: 'pm-requirements',
          currentStageName: 'PM requirements',
          updatedAt: '2026-06-17T00:00:00.000Z',
          openFollowupTaskCount: 2,
          stageGateReport: {
            stageId: 'pm-requirements',
            stageName: 'PM requirements',
            status: 'blocked',
            canAdvance: false,
            openTaskCount: 2,
            blockerCount: 2,
            blockers: [
              { id: 'stage-confirmations', title: 'Current-stage confirmations are incomplete' },
              { id: 'prd-approval-readiness', title: 'PRD is not ready for approval' },
            ],
            requiredActions: [
              'Complete 2 current-stage confirmation task(s).',
              'Run requirement quality review and generate the PRD draft.',
            ],
          },
        },
      ],
      {
        now: '2026-06-17T01:00:00.000Z',
        session,
      },
    );

    expect(cockpit.governance.commandCenter).toMatchObject({
      totalBlockers: 1,
      stageGateProjectCount: 1,
      followupProjectCount: 0,
      highSeverityCount: 1,
    });
    expect(cockpit.governance.commandCenter.blockers[0]).toMatchObject({
      type: 'stage-gate',
      severity: 'high',
      projectId: 'camera',
      stageId: 'pm-requirements',
      stageName: 'PM requirements',
      title: 'PM requirements blocked by 2 gate item(s)',
      detail: 'Current-stage confirmations are incomplete · PRD is not ready for approval',
      nextAction: 'Complete 2 current-stage confirmation task(s).',
      openTaskCount: 2,
      gateBlockerCount: 2,
    });
  });

  test('creates actionable notification items for assigned stage blockers', () => {
    const session = createPlatformSession({
      userId: 'owner-aa',
      organizationId: 'wee-coder-labs',
    });
    const cockpit = createPlatformCockpit(
      [
        {
          id: 'camera',
          name: 'Camera Monitor',
          organizationId: 'wee-coder-labs',
          currentStageId: 'pm-requirements',
          currentStageName: 'PM requirements',
          updatedAt: '2026-06-17T00:00:00.000Z',
          openFollowupTaskCount: 1,
          stageGateReport: {
            stageId: 'pm-requirements',
            stageName: 'PM requirements',
            status: 'blocked',
            blockerCount: 2,
            openTaskCount: 1,
            requiredActions: ['Collect RTSP test evidence.'],
          },
          followupTaskAssignments: [
            {
              targetRole: 'pm',
              targetRoleLabel: 'PM',
              assigneeUserId: 'pm-lin',
              assigneeName: 'Lin PM',
              openTaskCount: 1,
              tasks: [
                {
                  id: 'pm-rtsp',
                  stageId: 'pm-requirements',
                  stageName: 'PM requirements',
                  title: 'Clarify RTSP test samples',
                  status: 'open',
                },
              ],
            },
          ],
        },
      ],
      {
        now: '2026-06-17T01:00:00.000Z',
        session,
      },
    );

    expect(cockpit.governance.notifications).toMatchObject({
      pendingItems: 1,
      urgentItems: 1,
      items: [
        expect.objectContaining({
          id: 'notification-camera-pm-requirements-pm-lin-pm-rtsp',
          severity: 'high',
          audienceRole: 'pm',
          audienceRoleLabel: 'PM',
          audienceUserId: 'pm-lin',
          audienceName: 'Lin PM',
          projectId: 'camera',
          projectName: 'Camera Monitor',
          stageId: 'pm-requirements',
          stageName: 'PM requirements',
          title: 'Clarify RTSP test samples',
          nextAction: 'Collect RTSP test evidence.',
          reason: 'Stage gate blocked by 2 item(s).',
        }),
      ],
    });
  });

  test('creates a notification action center from job security and SLA signals', () => {
    const session = createPlatformSession({
      userId: 'owner-aa',
      organizationId: 'wee-coder-labs',
    });
    const cockpit = createPlatformCockpit(
      [
        {
          id: 'camera',
          name: 'Camera Monitor',
          organizationId: 'wee-coder-labs',
          currentStageId: 'pm-requirements',
          currentStageName: 'PM requirements',
          updatedAt: '2026-06-15T00:00:00.000Z',
          members: { pm: 'pm-lin', 'tech-lead': 'tech-chen', owner: 'owner-aa' },
          platformJobs: [
            {
              id: 'job-code-review',
              type: 'code-review',
              title: 'Code review',
              status: 'failed',
              errorSummary: 'Dependency audit failed.',
              finishedAt: '2026-06-17T02:00:00.000Z',
            },
          ],
          history: [
            {
              id: 'audit-denied-review',
              type: 'authorization-denied',
              category: 'security',
              severity: 'high',
              actor: 'PM',
              actionId: 'run-code-review',
              roleLabel: 'PM',
              reason: 'PM cannot run code review.',
              note: 'PM cannot run code review.',
              at: '2026-06-17T03:00:00.000Z',
            },
          ],
        },
      ],
      {
        now: '2026-06-18T00:00:00.000Z',
        session,
      },
    );

    expect(cockpit.governance.notifications.actionCenter).toMatchObject({
      totalActionCount: 3,
      highSeverityCount: 3,
      roleGroupCount: 3,
      nextAction: 'Route high severity notification actions to the accountable roles before approving delivery gates.',
      roleGroups: expect.arrayContaining([
        expect.objectContaining({
          targetRole: 'tech-lead',
          count: 1,
          highSeverityCount: 1,
        }),
        expect.objectContaining({
          targetRole: 'owner',
          count: 1,
          highSeverityCount: 1,
        }),
        expect.objectContaining({
          targetRole: 'pm',
          count: 1,
          highSeverityCount: 1,
        }),
      ]),
      items: expect.arrayContaining([
        expect.objectContaining({
          id: 'notification-action-job-job-code-review',
          source: 'platform-job',
          severity: 'high',
          targetRole: 'tech-lead',
          projectName: 'Camera Monitor',
          title: 'Code review failed',
          detail: 'Dependency audit failed.',
          nextAction: 'Tech lead should review failed job evidence and decide whether to retry or route a fix.',
        }),
        expect.objectContaining({
          id: 'notification-action-security-audit-denied-review',
          source: 'security-audit',
          severity: 'high',
          targetRole: 'owner',
          title: 'Permission denied: run-code-review',
          detail: 'PM cannot run code review.',
          nextAction: 'Owner should review the denied action, role assignment, and allowed roles.',
        }),
        expect.objectContaining({
          source: 'sla',
          severity: 'high',
          targetRole: 'pm',
          projectName: 'Camera Monitor',
          title: 'SLA breach: PM requirements',
          nextAction: 'PM should resolve requirement blockers and update the PRD inputs.',
        }),
      ]),
    });
  });

  test('derives notification items from full project stage confirmations', () => {
    const session = createPlatformSession({
      userId: 'owner-aa',
      organizationId: 'wee-coder-labs',
    });
    const cockpit = createPlatformCockpit(
      [
        {
          id: 'camera-full',
          name: 'Camera Full Project',
          organizationId: 'wee-coder-labs',
          currentStageId: 'pm-requirements',
          currentStageName: 'PM requirements',
          updatedAt: '2026-06-17T00:00:00.000Z',
          members: { pm: 'pm-lin' },
          stages: [{ id: 'pm-requirements', name: 'PM requirements' }],
          stageGateReport: {
            stageId: 'pm-requirements',
            stageName: 'PM requirements',
            status: 'blocked',
            blockerCount: 1,
            openTaskCount: 1,
            requiredActions: ['Complete PM requirement confirmation.'],
          },
          stageConfirmations: {
            'pm-requirements': {
              stageId: 'pm-requirements',
              stageName: 'PM requirements',
              status: 'incomplete',
              items: [
                {
                  id: 'target-users',
                  title: 'Target users',
                  required: true,
                  status: 'missing',
                  value: '',
                },
              ],
              missingItems: [{ id: 'target-users', title: 'Target users' }],
            },
          },
        },
      ],
      {
        now: '2026-06-17T01:00:00.000Z',
        session,
      },
    );

    expect(cockpit.governance.notifications).toMatchObject({
      pendingItems: 1,
      urgentItems: 1,
      items: [
        expect.objectContaining({
          projectId: 'camera-full',
          projectName: 'Camera Full Project',
          audienceRole: 'pm',
          audienceUserId: 'pm-lin',
          audienceName: '林项目经理',
          sourceTaskId: 'pm-requirements-target-users',
          nextAction: 'Complete PM requirement confirmation.',
        }),
      ],
    });
  });

  test('acknowledges a notification item and removes it from pending summaries', () => {
    const session = createPlatformSession({
      userId: 'owner-aa',
      organizationId: 'wee-coder-labs',
    });
    const project = {
      id: 'camera',
      name: 'Camera Monitor',
      organizationId: 'wee-coder-labs',
      currentStageId: 'pm-requirements',
      currentStageName: 'PM requirements',
      updatedAt: '2026-06-17T00:00:00.000Z',
      openFollowupTaskCount: 1,
      history: [],
      stageGateReport: {
        stageId: 'pm-requirements',
        stageName: 'PM requirements',
        status: 'blocked',
        blockerCount: 2,
        openTaskCount: 1,
        requiredActions: ['Collect RTSP test evidence.'],
      },
      followupTaskAssignments: [
        {
          targetRole: 'pm',
          targetRoleLabel: 'PM',
          assigneeUserId: 'pm-lin',
          assigneeName: 'Lin PM',
          openTaskCount: 1,
          tasks: [
            {
              id: 'pm-rtsp',
              stageId: 'pm-requirements',
              stageName: 'PM requirements',
              title: 'Clarify RTSP test samples',
              status: 'open',
            },
          ],
        },
      ],
    };
    const acknowledged = acknowledgeNotificationForProject(project, {
      notificationId: 'notification-camera-pm-requirements-pm-lin-pm-rtsp',
      actor: 'Lin PM',
      note: 'PM has accepted the RTSP evidence follow-up.',
      now: '2026-06-18T04:00:00.000Z',
    });

    expect(acknowledged.notificationAcknowledgements).toMatchObject({
      'notification-camera-pm-requirements-pm-lin-pm-rtsp': {
        id: 'notification-camera-pm-requirements-pm-lin-pm-rtsp',
        status: 'acknowledged',
        acknowledgedBy: 'Lin PM',
        acknowledgedAt: '2026-06-18T04:00:00.000Z',
        note: 'PM has accepted the RTSP evidence follow-up.',
      },
    });
    expect(acknowledged.history[0]).toMatchObject({
      type: 'notification-acknowledged',
      actor: 'Lin PM',
      notificationId: 'notification-camera-pm-requirements-pm-lin-pm-rtsp',
    });

    const cockpit = createPlatformCockpit([acknowledged], {
      now: '2026-06-18T04:05:00.000Z',
      session,
    });

    expect(cockpit.governance.notifications).toMatchObject({
      pendingItems: 0,
      urgentItems: 0,
      acknowledgedItems: 1,
      items: [],
      recentAcknowledgements: [
        expect.objectContaining({
          id: 'notification-camera-pm-requirements-pm-lin-pm-rtsp',
          projectId: 'camera',
          projectName: 'Camera Monitor',
          acknowledgedBy: 'Lin PM',
        }),
      ],
    });
  });

  test('updates notification action lifecycle with assignment resolution and audit history', () => {
    const session = createPlatformSession({
      userId: 'owner-aa',
      organizationId: 'wee-coder-labs',
    });
    const project = {
      id: 'camera',
      name: 'Camera Monitor',
      organizationId: 'wee-coder-labs',
      currentStageId: 'pm-requirements',
      currentStageName: 'PM requirements',
      updatedAt: '2026-06-15T00:00:00.000Z',
      openFollowupTaskCount: 1,
      history: [],
      stageGateReport: {
        stageId: 'pm-requirements',
        stageName: 'PM requirements',
        status: 'blocked',
        blockerCount: 1,
        openTaskCount: 1,
      },
    };

    const actionId = 'notification-action-sla-camera-pm-requirements';
    const acknowledged = updateNotificationActionForProject(project, {
      actionId,
      status: 'acknowledged',
      actor: 'Owner AA',
      note: 'Owner accepted the SLA breach.',
      now: '2026-06-18T04:00:00.000Z',
    });
    const assigned = updateNotificationActionForProject(acknowledged, {
      actionId,
      status: 'assigned',
      actor: 'Owner AA',
      assigneeRole: 'pm',
      assigneeUserId: 'pm-lin',
      assigneeName: 'Lin PM',
      note: 'Route to PM for requirement blockers.',
      now: '2026-06-18T04:05:00.000Z',
    });
    const resolved = updateNotificationActionForProject(assigned, {
      actionId,
      status: 'resolved',
      actor: 'Lin PM',
      resolution: 'RTSP sample evidence has been attached.',
      now: '2026-06-18T05:00:00.000Z',
    });

    expect(resolved.notificationAcknowledgements[actionId]).toMatchObject({
      id: actionId,
      status: 'resolved',
      acknowledgedBy: 'Owner AA',
      assignedBy: 'Owner AA',
      assigneeRole: 'pm',
      assigneeUserId: 'pm-lin',
      assigneeName: 'Lin PM',
      resolvedBy: 'Lin PM',
      resolvedAt: '2026-06-18T05:00:00.000Z',
      resolution: 'RTSP sample evidence has been attached.',
    });
    expect(resolved.history.slice(0, 3)).toEqual([
      expect.objectContaining({
        type: 'notification-action-resolved',
        actor: 'Lin PM',
        notificationId: actionId,
        notificationStatus: 'resolved',
        auditReason: 'notification-action-resolved',
      }),
      expect.objectContaining({
        type: 'notification-action-assigned',
        actor: 'Owner AA',
        notificationId: actionId,
        notificationStatus: 'assigned',
        assigneeRole: 'pm',
      }),
      expect.objectContaining({
        type: 'notification-action-acknowledged',
        actor: 'Owner AA',
        notificationId: actionId,
        notificationStatus: 'acknowledged',
      }),
    ]);

    const cockpit = createPlatformCockpit([resolved], {
      now: '2026-06-18T05:05:00.000Z',
      session,
    });

    expect(cockpit.governance.notifications.actionCenter.totalActionCount).toBe(0);
    expect(cockpit.governance.notifications.actionCenter.resolvedActionCount).toBe(1);
    expect(cockpit.governance.notifications.actionCenter.recentUpdates).toEqual([
      expect.objectContaining({
        id: actionId,
        status: 'resolved',
        projectId: 'camera',
        projectName: 'Camera Monitor',
        assigneeName: 'Lin PM',
      }),
    ]);
    expect(cockpit.governance.notifications.actionCenter.processingLedger).toMatchObject({
      totalEventCount: 3,
      actionCount: 1,
      actorCount: 2,
      acknowledgedCount: 1,
      assignedCount: 1,
      resolvedCount: 1,
      latestAt: '2026-06-18T05:00:00.000Z',
      rows: [
        expect.objectContaining({
          id: 'camera-2026-06-18T05:00:00.000Z-notification-action-resolved',
          notificationId: actionId,
          status: 'resolved',
          statusLabel: 'Resolved',
          actor: 'Lin PM',
          assigneeName: 'Lin PM',
          note: 'RTSP sample evidence has been attached.',
        }),
        expect.objectContaining({
          notificationId: actionId,
          status: 'assigned',
          statusLabel: 'Assigned',
          actor: 'Owner AA',
          assigneeRole: 'pm',
          assigneeUserId: 'pm-lin',
          assigneeName: 'Lin PM',
        }),
        expect.objectContaining({
          notificationId: actionId,
          status: 'acknowledged',
          statusLabel: 'Acknowledged',
          actor: 'Owner AA',
        }),
      ],
      actionGroups: [
        expect.objectContaining({
          notificationId: actionId,
          eventCount: 3,
          latestStatus: 'resolved',
          latestActor: 'Lin PM',
        }),
      ],
    });
  });

  test('classifies SLA breaches by severity owner role and next action', () => {
    const session = createPlatformSession({
      userId: 'owner-aa',
      organizationId: 'wee-coder-labs',
    });
    const cockpit = createPlatformCockpit(
      [
        {
          id: 'camera',
          name: 'Camera Monitor',
          organizationId: 'wee-coder-labs',
          currentStageId: 'pm-requirements',
          currentStageName: 'PM requirements',
          updatedAt: '2026-06-15T00:00:00.000Z',
          openFollowupTaskCount: 2,
          members: { pm: 'pm-lin' },
        },
        {
          id: 'qa-portal',
          name: 'QA Portal',
          organizationId: 'wee-coder-labs',
          currentStageId: 'qa',
          currentStageName: 'QA verification',
          updatedAt: '2026-06-16T18:00:00.000Z',
          openFollowupTaskCount: 1,
          members: { qa: 'qa-zhao' },
        },
      ],
      {
        now: '2026-06-18T00:00:00.000Z',
        session,
      },
    );

    expect(cockpit.governance.sla).toMatchObject({
      breachedCount: 2,
      criticalCount: 1,
      warningCount: 1,
      blockedFollowupCount: 3,
      nextAction: 'Escalate critical SLA breaches to the owner role and require an updated unblock plan.',
      breaches: [
        expect.objectContaining({
          projectId: 'camera',
          projectName: 'Camera Monitor',
          stageId: 'pm-requirements',
          ownerRole: 'pm',
          ownerUserId: 'pm-lin',
          severity: 'critical',
          ageHours: 72,
          thresholdHours: 48,
          overdueHours: 24,
          nextAction: 'PM should resolve requirement blockers and update the PRD inputs.',
        }),
        expect.objectContaining({
          projectId: 'qa-portal',
          ownerRole: 'qa',
          ownerUserId: 'qa-zhao',
          severity: 'warning',
          ageHours: 30,
          thresholdHours: 24,
          overdueHours: 6,
          nextAction: 'QA should publish verification evidence or route defects back to development.',
        }),
      ],
      ownerGroups: [
        expect.objectContaining({
          ownerRole: 'pm',
          breachCount: 1,
          criticalCount: 1,
          warningCount: 0,
        }),
        expect.objectContaining({
          ownerRole: 'qa',
          breachCount: 1,
          criticalCount: 0,
          warningCount: 1,
        }),
      ],
    });
  });

  test('creates owner portfolio rows across health SLA cost and next actions', () => {
    const session = createPlatformSession({
      userId: 'owner-aa',
      organizationId: 'wee-coder-labs',
    });
    const cockpit = createPlatformCockpit(
      [
        {
          id: 'camera',
          name: 'Camera Monitor',
          organizationId: 'wee-coder-labs',
          currentStageId: 'pm-requirements',
          currentStageName: 'PM requirements',
          updatedAt: '2026-06-15T00:00:00.000Z',
          openFollowupTaskCount: 3,
          members: { pm: 'pm-lin' },
          stageGateReport: {
            stageId: 'pm-requirements',
            stageName: 'PM requirements',
            status: 'blocked',
            blockerCount: 2,
            openTaskCount: 3,
            requiredActions: ['Collect RTSP sample evidence before PRD approval.'],
          },
          stageRiskRegister: {
            'pm-requirements': {
              riskLevel: 'high',
            },
          },
          artifacts: {
            'pm-requirements': '# PRD draft',
            handoff: '# Technical handoff',
          },
          developmentRun: {
            checks: [
              { command: 'npm test', status: 'passed' },
              { command: 'npm run build', status: 'passed' },
            ],
          },
          platformJobs: [
            {
              id: 'camera-ai-job',
              type: 'ai-development',
              title: 'AI coding run',
              status: 'failed',
              command: 'npm test',
              requestedBy: 'AA',
              queuedAt: '2026-06-17T00:00:00.000Z',
            },
          ],
          deploymentEnvironments: {
            local: { id: 'local', status: 'ready' },
            staging: { id: 'staging', status: 'ready' },
            production: { id: 'production', status: 'blocked' },
          },
          costBudgetCny: 5,
        },
        {
          id: 'qa-portal',
          name: 'QA Portal',
          organizationId: 'wee-coder-labs',
          currentStageId: 'qa',
          currentStageName: 'QA verification',
          updatedAt: '2026-06-16T18:00:00.000Z',
          openFollowupTaskCount: 1,
          members: { qa: 'qa-zhao' },
          artifacts: {
            qa: '# QA plan',
          },
          costBudgetCny: 20,
        },
      ],
      {
        now: '2026-06-18T00:00:00.000Z',
        session,
      },
    );

    expect(cockpit.governance.ownerPortfolio).toMatchObject({
      summary: {
        projectCount: 2,
        criticalProjectCount: 1,
        warningProjectCount: 1,
        blockedProjectCount: 1,
        overBudgetProjectCount: 1,
      },
      rows: [
        expect.objectContaining({
          projectId: 'camera',
          projectName: 'Camera Monitor',
          stageId: 'pm-requirements',
          stageName: 'PM requirements',
          ownerRole: 'pm',
          ownerRoleLabel: '项目经理',
          ownerUserId: 'pm-lin',
          healthLevel: 'critical',
          slaSeverity: 'critical',
          slaOverdueHours: 24,
          budgetStatus: 'over-budget',
          nextAction: 'Collect RTSP sample evidence before PRD approval.',
        }),
        expect.objectContaining({
          projectId: 'qa-portal',
          projectName: 'QA Portal',
          ownerRole: 'qa',
          healthLevel: 'healthy',
          portfolioStatus: 'warning',
          slaSeverity: 'warning',
          budgetStatus: 'within-budget',
          nextAction: 'QA should publish verification evidence or route defects back to development.',
        }),
      ],
    });
    expect(cockpit.governance.ownerPortfolio.rows[0].costTotalEstimatedCny).toBeGreaterThan(5);
  });

  test('summarizes owner role flow bottlenecks across visible projects', () => {
    const session = createPlatformSession({
      userId: 'owner-aa',
      organizationId: 'wee-coder-labs',
    });
    const cockpit = createPlatformCockpit(
      [
        {
          id: 'camera',
          name: 'Camera Monitor',
          organizationId: 'wee-coder-labs',
          currentStageId: 'pm-requirements',
          currentStageName: 'PM requirements',
          updatedAt: '2026-06-15T00:00:00.000Z',
          openFollowupTaskCount: 3,
          members: { pm: 'pm-lin' },
          stageGateReport: {
            stageId: 'pm-requirements',
            stageName: 'PM requirements',
            status: 'blocked',
            blockerCount: 2,
            openTaskCount: 3,
            requiredActions: ['Collect RTSP sample evidence before PRD approval.'],
          },
          stageRiskRegister: {
            'pm-requirements': {
              riskLevel: 'high',
            },
          },
          artifacts: {
            'pm-requirements': '# PRD draft',
          },
        },
        {
          id: 'qa-portal',
          name: 'QA Portal',
          organizationId: 'wee-coder-labs',
          currentStageId: 'qa',
          currentStageName: 'QA verification',
          updatedAt: '2026-06-16T18:00:00.000Z',
          openFollowupTaskCount: 1,
          members: { qa: 'qa-zhao' },
          artifacts: {
            qa: '# QA plan',
          },
        },
      ],
      {
        now: '2026-06-18T00:00:00.000Z',
        session,
      },
    );

    expect(cockpit.governance.ownerRoleFlow).toMatchObject({
      summary: {
        projectCount: 2,
        roleCount: 2,
        blockedProjectCount: 1,
        openTaskCount: 4,
        criticalRoleCount: 1,
        warningRoleCount: 1,
        staleProjectCount: 2,
        escalatedRoleCount: 1,
        maxStaleHours: 24,
        nextAction: 'Focus PM: 1 blocked project and 3 open tasks.',
        escalationNextAction: 'Escalate PM: Camera Monitor is overdue by 24 hours.',
      },
      roleGroups: expect.arrayContaining([
        expect.objectContaining({
          role: 'pm',
          roleLabel: 'PM',
          projectCount: 1,
          blockedProjectCount: 1,
          openTaskCount: 3,
          bottleneckLevel: 'critical',
          escalationLevel: 'escalated',
          staleProjectCount: 1,
          escalatedProjectCount: 1,
          maxStaleHours: 24,
          nextAction: 'Collect RTSP sample evidence before PRD approval.',
        }),
        expect.objectContaining({
          role: 'qa',
          roleLabel: 'QA',
          projectCount: 1,
          blockedProjectCount: 0,
          openTaskCount: 1,
          bottleneckLevel: 'warning',
          escalationLevel: 'watch',
          staleProjectCount: 1,
          escalatedProjectCount: 0,
          maxStaleHours: 6,
          nextAction: 'QA should publish verification evidence or route defects back to development.',
        }),
      ]),
      rows: expect.arrayContaining([
        expect.objectContaining({
          projectId: 'camera',
          projectName: 'Camera Monitor',
          role: 'pm',
          roleLabel: 'PM',
          stageName: 'PM requirements',
          blocked: true,
          openTaskCount: 3,
          staleHours: 24,
          escalationLevel: 'escalated',
          nextAction: 'Collect RTSP sample evidence before PRD approval.',
        }),
      ]),
    });

    expect(cockpit.governance.ownerEscalationDigest).toMatchObject({
      summary: {
        messageCount: 2,
        escalatedMessageCount: 1,
        watchMessageCount: 1,
        recipientCount: 2,
        nextAction: 'Send 1 escalated role handoff message before the next delivery gate review.',
      },
      messages: expect.arrayContaining([
        expect.objectContaining({
          id: 'owner-escalation-pm-camera',
          role: 'pm',
          roleLabel: 'PM',
          recipientUserId: 'pm-lin',
          projectId: 'camera',
          projectName: 'Camera Monitor',
          stageName: 'PM requirements',
          escalationLevel: 'escalated',
          overdueHours: 24,
          channel: 'in-app',
          status: 'ready-to-send',
          subject: 'Escalate PM handoff: Camera Monitor overdue 24h',
          body: 'PM: Camera Monitor is overdue by 24h. Collect RTSP sample evidence before PRD approval.',
        }),
        expect.objectContaining({
          id: 'owner-escalation-qa-qa-portal',
          role: 'qa',
          roleLabel: 'QA',
          recipientUserId: 'qa-zhao',
          projectId: 'qa-portal',
          escalationLevel: 'watch',
          overdueHours: 6,
        }),
      ]),
    });
  });

  test('summarizes end-to-end delivery closure and QA return projects', () => {
    const session = createPlatformSession({
      userId: 'owner-aa',
      organizationId: 'wee-coder-labs',
    });
    const cockpit = createPlatformCockpit(
      [
        {
          id: 'signed-off-camera',
          name: 'Signed Off Camera',
          organizationId: 'wee-coder-labs',
          currentStageId: 'acceptance',
          prdStatus: 'generated',
          requirementReview: { status: 'ready' },
          artifacts: {
            'pm-requirements': '# PRD',
            'prd-approval': '# PRD approved',
            development: '# Development',
            review: '# Review',
            qa: '# QA',
            acceptance: '# Acceptance',
          },
          developmentRun: { status: 'completed' },
          codeReviewReport: { status: 'passed' },
          qaEvidence: { status: 'ready' },
          qaRun: { status: 'passed', passedCount: 6, totalCount: 6 },
          acceptancePackage: { status: 'ready', signoffStatus: 'signed-off' },
        },
        {
          id: 'qa-return-camera',
          name: 'QA Return Camera',
          organizationId: 'wee-coder-labs',
          currentStageId: 'qa',
          prdStatus: 'generated',
          requirementReview: { status: 'ready' },
          artifacts: {
            'pm-requirements': '# PRD',
            'prd-approval': '# PRD approved',
            development: '# Development',
            review: '# Review',
          },
          developmentRun: { status: 'completed' },
          codeReviewReport: { status: 'passed' },
          qaEvidence: { status: 'ready' },
          qaRun: {
            status: 'needs-work',
            passedCount: 4,
            totalCount: 6,
            defectRouting: {
              shouldReturnToDevelopment: true,
              targetStageId: 'development',
              reasons: ['False positive metric exceeded the PRD threshold.'],
            },
          },
        },
      ],
      { session, now: '2026-06-18T00:00:00.000Z' },
    );

    expect(cockpit.governance.deliveryClosure).toMatchObject({
      summary: {
        projectCount: 2,
        signedOffProjectCount: 1,
        qaReturnProjectCount: 1,
        blockedProjectCount: 1,
        readyForSignoffProjectCount: 0,
      },
      rows: [
        expect.objectContaining({
          projectId: 'qa-return-camera',
          projectName: 'QA Return Camera',
          status: 'qa-return',
          currentGateId: 'qa',
          completionPercent: 57,
          missingGateIds: ['qa', 'acceptance', 'signoff'],
          nextAction: 'Route QA defects back to development and regenerate a fix plan.',
        }),
        expect.objectContaining({
          projectId: 'signed-off-camera',
          projectName: 'Signed Off Camera',
          status: 'signed-off',
          completionPercent: 100,
          missingGateIds: [],
          nextAction: 'Project is signed off. Archive evidence and monitor production readiness.',
        }),
      ],
    });
    expect(cockpit.governance.deliveryClosure.rows[0].gates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'requirements', status: 'complete' }),
        expect.objectContaining({ id: 'qa', status: 'blocked' }),
        expect.objectContaining({ id: 'signoff', status: 'missing' }),
      ]),
    );
  });

  test('creates audit summary facets and event metadata', () => {
    const session = createPlatformSession({
      userId: 'owner-aa',
      organizationId: 'wee-coder-labs',
    });
    const cockpit = createPlatformCockpit(
      [
        {
          id: 'camera',
          name: 'Camera Monitor',
          organizationId: 'wee-coder-labs',
          currentStageId: 'qa',
          updatedAt: '2026-06-17T00:00:00.000Z',
          history: [
            {
              type: 'platform-job-failed',
              actor: 'Local Runner',
              note: 'npm test failed.',
              at: '2026-06-17T02:00:00.000Z',
            },
            {
              type: 'code-review-finished',
              actor: 'Tech Lead',
              note: 'Security review passed.',
              at: '2026-06-17T01:00:00.000Z',
            },
          ],
        },
        {
          id: 'portal',
          name: 'Customer Portal',
          organizationId: 'wee-coder-labs',
          currentStageId: 'pm-requirements',
          updatedAt: '2026-06-16T00:00:00.000Z',
          history: [
            {
              type: 'prd-generated',
              actor: 'PM',
              note: 'Generated PRD draft.',
              at: '2026-06-16T03:00:00.000Z',
            },
          ],
        },
      ],
      {
        now: '2026-06-17T03:00:00.000Z',
        session,
      },
    );

    expect(cockpit.governance.auditLog[0]).toMatchObject({
      projectId: 'camera',
      type: 'platform-job-failed',
      category: 'ai-operations',
      severity: 'high',
    });
    expect(cockpit.governance.auditSummary).toMatchObject({
      totalEvents: 3,
      highSeverityCount: 1,
      actorCount: 3,
      projectCount: 2,
      latestAt: '2026-06-17T02:00:00.000Z',
      categories: [
        expect.objectContaining({ id: 'ai-operations', count: 1 }),
        expect.objectContaining({ id: 'review', count: 1 }),
        expect.objectContaining({ id: 'requirements', count: 1 }),
      ],
      actors: [
        expect.objectContaining({ actor: 'Local Runner', count: 1 }),
        expect.objectContaining({ actor: 'Tech Lead', count: 1 }),
        expect.objectContaining({ actor: 'PM', count: 1 }),
      ],
      projects: [
        expect.objectContaining({ projectId: 'camera', projectName: 'Camera Monitor', count: 2 }),
        expect.objectContaining({ projectId: 'portal', projectName: 'Customer Portal', count: 1 }),
      ],
      exportManifest: {
        format: 'jsonl',
        recordCount: 3,
        highSeverityCount: 1,
        projectCount: 2,
        latestAt: '2026-06-17T02:00:00.000Z',
        filename: 'wee-coder-audit-wee-coder-labs-2026-06-17.jsonl',
        fields: [
          'id',
          'projectId',
          'projectName',
          'type',
          'category',
          'severity',
          'actor',
          'actorUserId',
          'auditReason',
          'at',
          'note',
        ],
        recommendedFilters: [
          { id: 'all', label: 'All events', count: 3 },
          { id: 'high', label: 'High severity', count: 1 },
          { id: 'security', label: 'Security events', count: 0 },
        ],
      },
    });
  });

  test('creates a security audit summary from authorization denial events', () => {
    const session = createPlatformSession({
      userId: 'owner-aa',
      organizationId: 'wee-coder-labs',
    });
    const cockpit = createPlatformCockpit(
      [
        {
          id: 'camera',
          name: 'Camera Monitor',
          organizationId: 'wee-coder-labs',
          currentStageId: 'review',
          updatedAt: '2026-06-17T00:00:00.000Z',
          history: [
            {
              type: 'authorization-denied',
              category: 'security',
              severity: 'high',
              actionId: 'run-code-review',
              actor: '项目经理',
              roleLabel: '项目经理',
              allowedRoles: ['tech-lead', 'owner'],
              reason: '当前角色无权执行代码/安全/性能 Review。',
              note: '当前角色无权执行代码/安全/性能 Review。',
              at: '2026-06-17T03:00:00.000Z',
            },
            {
              type: 'security-token-rotated',
              category: 'security',
              severity: 'low',
              actionId: 'rotate-token',
              actor: '负责人',
              roleLabel: '负责人',
              note: 'API token rotated by owner.',
              at: '2026-06-17T02:00:00.000Z',
            },
          ],
        },
      ],
      {
        now: '2026-06-17T04:00:00.000Z',
        session,
      },
    );

    expect(cockpit.governance.auditLog[0]).toMatchObject({
      type: 'authorization-denied',
      category: 'security',
      severity: 'high',
      actionId: 'run-code-review',
      allowedRoles: ['tech-lead', 'owner'],
      reason: '当前角色无权执行代码/安全/性能 Review。',
      roleLabel: '项目经理',
    });
    expect(cockpit.governance.securityAudit).toMatchObject({
      totalEvents: 2,
      denialCount: 1,
      highSeverityCount: 1,
      latestAt: '2026-06-17T03:00:00.000Z',
      projects: [
        expect.objectContaining({ projectId: 'camera', projectName: 'Camera Monitor', count: 2 }),
      ],
      roles: expect.arrayContaining([
        expect.objectContaining({ roleLabel: '项目经理', count: 1 }),
        expect.objectContaining({ roleLabel: '负责人', count: 1 }),
      ]),
    });
  });

  test('summarizes deployment readiness gates and ops handoff gaps', () => {
    const session = createPlatformSession({
      userId: 'owner-aa',
      organizationId: 'wee-coder-labs',
    });
    const cockpit = createPlatformCockpit(
      [
        {
          id: 'camera',
          name: 'Camera Monitor',
          organizationId: 'wee-coder-labs',
          currentStageId: 'ops-requirements',
          currentStageName: 'Ops requirements',
          updatedAt: '2026-06-17T00:00:00.000Z',
          repositoryConfig: {
            verificationCommands: ['npm test', 'npm run build'],
          },
          stageConfirmations: {
            'ops-requirements': {
              stageId: 'ops-requirements',
              stageName: 'Ops requirements',
              status: 'incomplete',
              items: [
                {
                  id: 'runtime-environment',
                  title: 'Runtime environment',
                  required: true,
                  status: 'missing',
                  value: '',
                },
                {
                  id: 'monitoring-logging',
                  title: 'Monitoring and logging',
                  required: true,
                  status: 'missing',
                  value: '',
                },
                {
                  id: 'service-operations',
                  title: 'Service operations',
                  required: true,
                  status: 'confirmed',
                  value: 'Start and restart commands are documented.',
                },
              ],
              missingItems: [
                { id: 'runtime-environment', title: 'Runtime environment' },
                { id: 'monitoring-logging', title: 'Monitoring and logging' },
              ],
            },
          },
        },
      ],
      {
        now: '2026-06-17T01:00:00.000Z',
        session,
      },
    );

    expect(cockpit.deployment.readiness).toMatchObject({
      status: 'blocked',
      score: 40,
      blockedGateCount: 3,
      readyGateCount: 1,
      nextAction: 'Resolve production release blockers before deployment.',
    });
    expect(cockpit.deployment.releaseGates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'database',
          status: 'blocked',
          ownerRole: 'owner',
          nextAction: 'Move project, audit, task, and notification records out of local JSON storage.',
        }),
        expect.objectContaining({
          id: 'ops-handoff',
          status: 'blocked',
          ownerRole: 'ops',
          blockerCount: 2,
          nextAction: 'Complete 2 ops handoff item(s).',
        }),
      ]),
    );
    expect(cockpit.deployment.opsHandoff).toMatchObject({
      status: 'blocked',
      missingItemCount: 2,
      projectCount: 1,
      items: [
        expect.objectContaining({
          id: 'camera-runtime-environment',
          projectName: 'Camera Monitor',
          title: 'Runtime environment',
          ownerRole: 'ops',
          status: 'missing',
        }),
        expect.objectContaining({
          id: 'camera-monitoring-logging',
          projectName: 'Camera Monitor',
          title: 'Monitoring and logging',
          ownerRole: 'ops',
          status: 'missing',
        }),
      ],
    });
  });

  test('breaks down estimated cost by category, project, and drivers', () => {
    const session = createPlatformSession({
      userId: 'owner-aa',
      organizationId: 'wee-coder-labs',
    });
    const cockpit = createPlatformCockpit(
      [
        {
          id: 'camera',
          name: 'Camera Monitor',
          organizationId: 'wee-coder-labs',
          currentStageId: 'development',
          updatedAt: '2026-06-17T00:00:00.000Z',
          openFollowupTaskCount: 3,
          artifacts: {
            prd: '# PRD',
            implementation: '# Implementation',
          },
          platformJobs: [
            { id: 'job-ai', type: 'ai-development', title: 'AI job', status: 'queued' },
            { id: 'job-review', type: 'code-review', title: 'Review job', status: 'failed' },
          ],
          developmentRun: {
            checks: [
              { command: 'npm test', status: 'passed' },
              { command: 'npm run build', status: 'passed' },
            ],
          },
        },
      ],
      {
        now: '2026-06-17T01:00:00.000Z',
        session,
      },
    );

    expect(cockpit.governance.cost).toMatchObject({
      currency: 'CNY',
      totalEstimatedCny: 3.55,
      aiEstimatedCny: 2.6,
      runnerEstimatedCny: 0.5,
      waitingEstimatedCny: 0.45,
      summary: {
        projectCount: 1,
        jobCount: 3,
        artifactCount: 2,
        checkCount: 2,
        waitingItemCount: 3,
      },
      categories: [
        expect.objectContaining({
          id: 'ai',
          label: 'AI generation',
          estimatedCny: 2.6,
          unitCount: 5,
        }),
        expect.objectContaining({
          id: 'runner',
          label: 'Runner checks',
          estimatedCny: 0.5,
          unitCount: 2,
        }),
        expect.objectContaining({
          id: 'waiting',
          label: 'Waiting blockers',
          estimatedCny: 0.45,
          unitCount: 3,
        }),
        expect.objectContaining({
          id: 'deployment',
          label: 'Deployment environments',
          estimatedCny: 0,
          unitCount: 0,
        }),
      ],
      projects: [
        expect.objectContaining({
          projectId: 'camera',
          projectName: 'Camera Monitor',
          totalEstimatedCny: 3.55,
          aiEstimatedCny: 2.6,
          runnerEstimatedCny: 0.5,
          waitingEstimatedCny: 0.45,
          drivers: {
            artifactCount: 2,
            jobCount: 3,
            checkCount: 2,
            waitingItemCount: 3,
            deploymentEnvironmentCount: 0,
          },
        }),
      ],
      drivers: [
        expect.objectContaining({ id: 'artifacts', count: 2, rateCny: 0.4 }),
        expect.objectContaining({ id: 'jobs', count: 3, rateCny: 0.6 }),
        expect.objectContaining({ id: 'checks', count: 2, rateCny: 0.25 }),
        expect.objectContaining({ id: 'waiting', count: 3, rateCny: 0.15 }),
        expect.objectContaining({ id: 'deployment-environments', count: 0, rateCny: 'tiered' }),
      ],
    });
  });

  test('adds deployment environment cost budget status and control actions', () => {
    const session = createPlatformSession({
      userId: 'owner-aa',
      organizationId: 'wee-coder-labs',
    });
    const cockpit = createPlatformCockpit(
      [
        {
          id: 'camera-cost',
          name: 'Camera Cost Pilot',
          organizationId: 'wee-coder-labs',
          currentStageId: 'development',
          updatedAt: '2026-06-17T00:00:00.000Z',
          openFollowupTaskCount: 6,
          costBudgetCny: 8,
          artifacts: {
            prd: '# PRD',
            architecture: '# Architecture',
          },
          platformJobs: [
            { id: 'job-ai-1', type: 'ai-development', title: 'AI job 1', status: 'succeeded' },
            { id: 'job-ai-2', type: 'ai-development', title: 'AI job 2', status: 'failed' },
            { id: 'job-review', type: 'code-review', title: 'Review job', status: 'failed' },
            { id: 'job-qa', type: 'qa-run', title: 'QA job', status: 'queued' },
          ],
          developmentRun: {
            checks: [
              { command: 'npm test', status: 'passed' },
              { command: 'npm run build', status: 'passed' },
              { command: 'npm audit --omit=dev', status: 'passed' },
              { command: 'npm run e2e', status: 'failed' },
            ],
          },
          deploymentEnvironments: {
            local: { id: 'local', status: 'ready' },
            staging: { id: 'staging', status: 'ready' },
            production: { id: 'production', status: 'blocked' },
          },
        },
      ],
      {
        now: '2026-06-17T01:00:00.000Z',
        session,
      },
    );

    expect(cockpit.governance.cost).toMatchObject({
      currency: 'CNY',
      totalEstimatedCny: 10.1,
      aiEstimatedCny: 3.8,
      runnerEstimatedCny: 1,
      waitingEstimatedCny: 0.9,
      deploymentEstimatedCny: 4.4,
      budgetStatus: 'over-budget',
      budgetLimitCny: 8,
      budgetDeltaCny: 2.1,
      nextAction: 'Review over-budget projects and pause non-critical runner or deployment work.',
      summary: {
        projectCount: 1,
        jobCount: 5,
        artifactCount: 2,
        checkCount: 4,
        waitingItemCount: 6,
        deploymentEnvironmentCount: 3,
        overBudgetProjectCount: 1,
        nearBudgetProjectCount: 0,
      },
      categories: expect.arrayContaining([
        expect.objectContaining({
          id: 'deployment',
          label: 'Deployment environments',
          estimatedCny: 4.4,
          unitCount: 3,
        }),
      ]),
      projects: [
        expect.objectContaining({
          projectId: 'camera-cost',
          projectName: 'Camera Cost Pilot',
          totalEstimatedCny: 10.1,
          budgetLimitCny: 8,
          budgetStatus: 'over-budget',
          budgetDeltaCny: 2.1,
          deploymentEstimatedCny: 4.4,
          nextAction: 'Reduce deployment environments or review failed/repeated job runs.',
          drivers: {
            artifactCount: 2,
            jobCount: 5,
            checkCount: 4,
            waitingItemCount: 6,
            deploymentEnvironmentCount: 3,
          },
        }),
      ],
      budgetRisks: [
        expect.objectContaining({
          projectId: 'camera-cost',
          projectName: 'Camera Cost Pilot',
          budgetStatus: 'over-budget',
          budgetDeltaCny: 2.1,
          nextAction: 'Reduce deployment environments or review failed/repeated job runs.',
        }),
      ],
      drivers: expect.arrayContaining([
        expect.objectContaining({ id: 'deployment-environments', count: 3, rateCny: 'tiered' }),
      ]),
    });
  });

  test('records deployment environment readiness and surfaces it in the deployment console', () => {
    const project = {
      id: 'camera',
      name: 'Camera Monitor',
      organizationId: 'wee-coder-labs',
      history: [],
    };

    const updated = updateDeploymentEnvironmentForProject(project, {
      environmentId: 'staging',
      actor: '王运维',
      status: 'ready',
      version: 'staging-yolo-v1',
      url: 'https://staging.example.com/camera',
      evidence: 'RTSP mock stream smoke test passed.',
      now: '2026-06-18T03:30:00.000Z',
    });

    expect(updated.deploymentEnvironments.staging).toMatchObject({
      id: 'staging',
      status: 'ready',
      version: 'staging-yolo-v1',
      url: 'https://staging.example.com/camera',
      evidence: 'RTSP mock stream smoke test passed.',
      updatedAt: '2026-06-18T03:30:00.000Z',
      updatedBy: '王运维',
    });
    expect(updated.history[0]).toMatchObject({
      type: 'deployment-environment-updated',
      actor: '王运维',
      environmentId: 'staging',
      environmentStatus: 'ready',
    });

    const cockpit = createPlatformCockpit([updated], {
      session: createPlatformSession({
        userId: 'owner-aa',
        organizationId: 'wee-coder-labs',
      }),
    });

    expect(cockpit.deployment.environments).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'staging',
          status: 'ready',
          projectCount: 1,
          version: 'staging-yolo-v1',
          url: 'https://staging.example.com/camera',
          evidence: 'RTSP mock stream smoke test passed.',
          latestProjectName: 'Camera Monitor',
          nextAction: 'Keep staging validation evidence current before production release.',
        }),
      ]),
    );
    expect(cockpit.deployment.environmentReadiness).toMatchObject({
      readyCount: 2,
      blockedCount: 1,
      plannedCount: 0,
      latestReadyEnvironmentId: 'staging',
    });
  });

  test('tracks platform job lifecycle with audit history', () => {
    const project = {
      id: 'camera-monitor',
      name: 'Camera Monitor',
      organizationId: 'wee-coder-labs',
      repositoryConfig: {
        executionMode: 'codex-local',
      },
      platformJobs: [],
      history: [],
    };

    const queued = queuePlatformJobForProject(project, {
      type: 'ai-development',
      title: 'AI coding job',
      command: 'npm test',
      actor: 'Owner',
      now: '2026-06-17T01:00:00.000Z',
    });
    const jobId = queued.platformJobs[0].id;

    const running = startPlatformJobForProject(queued, {
      jobId,
      actor: 'Local Runner',
      now: '2026-06-17T01:05:00.000Z',
    });

    expect(running.platformJobs[0]).toMatchObject({
      id: jobId,
      status: 'running',
      startedAt: '2026-06-17T01:05:00.000Z',
      runCount: 1,
    });
    expect(running.history[0]).toMatchObject({
      type: 'platform-job-started',
      actor: 'Local Runner',
    });

    const succeeded = completePlatformJobForProject(running, {
      jobId,
      actor: 'Local Runner',
      resultSummary: 'All verification commands passed.',
      now: '2026-06-17T01:10:00.000Z',
    });

    expect(succeeded.platformJobs[0]).toMatchObject({
      id: jobId,
      status: 'succeeded',
      finishedAt: '2026-06-17T01:10:00.000Z',
      resultSummary: 'All verification commands passed.',
    });
    expect(succeeded.history[0]).toMatchObject({
      type: 'platform-job-succeeded',
      actor: 'Local Runner',
    });

    const failed = failPlatformJobForProject(running, {
      jobId,
      actor: 'Local Runner',
      errorSummary: 'npm test failed.',
      details: {
        sandboxPolicy: 'project-verification-command-allowlist',
        blockedCommand: 'npm run build',
      },
      now: '2026-06-17T01:12:00.000Z',
    });

    expect(failed.platformJobs[0]).toMatchObject({
      id: jobId,
      status: 'failed',
      finishedAt: '2026-06-17T01:12:00.000Z',
      errorSummary: 'npm test failed.',
      details: {
        sandboxPolicy: 'project-verification-command-allowlist',
        blockedCommand: 'npm run build',
      },
    });
    expect(failed.history[0]).toMatchObject({
      type: 'platform-job-failed',
      actor: 'Local Runner',
    });
  });

  test('locks running platform jobs with a worker lease and blocks active double starts', () => {
    const project = {
      id: 'camera-monitor',
      name: 'Camera Monitor',
      organizationId: 'wee-coder-labs',
      platformJobs: [],
      history: [],
    };
    const queued = queuePlatformJobForProject(project, {
      type: 'ai-development',
      title: 'AI coding job',
      command: 'npm test',
      actor: 'Owner',
      now: '2026-06-17T01:00:00.000Z',
    });
    const jobId = queued.platformJobs[0].id;

    const running = startPlatformJobForProject(queued, {
      jobId,
      actor: 'Local Runner',
      workerId: 'runner-a',
      leaseDurationMs: 600000,
      now: '2026-06-17T01:05:00.000Z',
    });

    expect(running.platformJobs[0]).toMatchObject({
      id: jobId,
      status: 'running',
      lockedBy: 'runner-a',
      leaseStartedAt: '2026-06-17T01:05:00.000Z',
      leaseHeartbeatAt: '2026-06-17T01:05:00.000Z',
      leaseExpiresAt: '2026-06-17T01:15:00.000Z',
    });
    expect(running.history[0]).toMatchObject({
      type: 'platform-job-started',
      workerId: 'runner-a',
      leaseExpiresAt: '2026-06-17T01:15:00.000Z',
    });
    expect(() =>
      startPlatformJobForProject(running, {
        jobId,
        actor: 'Other Runner',
        workerId: 'runner-b',
        now: '2026-06-17T01:06:00.000Z',
      }),
    ).toThrow(/active worker lease/i);
  });

  test('renews platform job worker leases with heartbeat ownership checks', () => {
    const project = {
      id: 'camera-monitor',
      name: 'Camera Monitor',
      organizationId: 'wee-coder-labs',
      platformJobs: [],
      history: [],
    };
    const queued = queuePlatformJobForProject(project, {
      type: 'ai-development',
      title: 'AI coding job',
      command: 'npm test',
      actor: 'Owner',
      now: '2026-06-17T01:00:00.000Z',
    });
    const jobId = queued.platformJobs[0].id;
    const running = startPlatformJobForProject(queued, {
      jobId,
      actor: 'Local Runner',
      workerId: 'runner-a',
      leaseDurationMs: 600000,
      now: '2026-06-17T01:05:00.000Z',
    });

    const renewed = heartbeatPlatformJobForProject(running, {
      jobId,
      actor: 'Local Runner',
      workerId: 'runner-a',
      leaseDurationMs: 600000,
      now: '2026-06-17T01:09:00.000Z',
    });

    expect(renewed.platformJobs[0]).toMatchObject({
      id: jobId,
      status: 'running',
      lockedBy: 'runner-a',
      leaseStartedAt: '2026-06-17T01:05:00.000Z',
      leaseHeartbeatAt: '2026-06-17T01:09:00.000Z',
      leaseExpiresAt: '2026-06-17T01:19:00.000Z',
    });
    expect(renewed.history[0]).toMatchObject({
      type: 'platform-job-heartbeat',
      workerId: 'runner-a',
      leaseExpiresAt: '2026-06-17T01:19:00.000Z',
    });
    expect(() =>
      heartbeatPlatformJobForProject(renewed, {
        jobId,
        actor: 'Other Runner',
        workerId: 'runner-b',
        now: '2026-06-17T01:10:00.000Z',
      }),
    ).toThrow(/worker lease owner/i);
  });

  test('reclaims stale platform job leases back to the queue', () => {
    const project = {
      id: 'camera-monitor',
      name: 'Camera Monitor',
      organizationId: 'wee-coder-labs',
      platformJobs: [],
      history: [],
    };
    const queued = queuePlatformJobForProject(project, {
      type: 'ai-development',
      title: 'AI coding job',
      command: 'npm test',
      actor: 'Owner',
      now: '2026-06-17T01:00:00.000Z',
    });
    const jobId = queued.platformJobs[0].id;
    const running = startPlatformJobForProject(queued, {
      jobId,
      actor: 'Local Runner',
      workerId: 'runner-a',
      leaseDurationMs: 300000,
      now: '2026-06-17T01:05:00.000Z',
    });

    expect(() =>
      reclaimPlatformJobForProject(running, {
        jobId,
        actor: 'Owner',
        now: '2026-06-17T01:08:00.000Z',
      }),
    ).toThrow(/stale worker lease/i);

    const reclaimed = reclaimPlatformJobForProject(running, {
      jobId,
      actor: 'Owner',
      reason: 'Runner stopped sending heartbeats.',
      now: '2026-06-17T01:12:00.000Z',
    });

    expect(reclaimed.platformJobs[0]).toMatchObject({
      id: jobId,
      status: 'queued',
      rawStatus: 'reclaimed-queued',
      startedAt: '',
      finishedAt: '',
      lockedBy: '',
      leaseStartedAt: '',
      leaseHeartbeatAt: '',
      leaseExpiresAt: '',
      runCount: 1,
      details: {
        reclaimReason: 'Runner stopped sending heartbeats.',
        previousLockedBy: 'runner-a',
        leaseExpiredAt: '2026-06-17T01:10:00.000Z',
        reclaimedAt: '2026-06-17T01:12:00.000Z',
      },
    });
    expect(reclaimed.history[0]).toMatchObject({
      type: 'platform-job-reclaimed',
      workerId: '',
      leaseExpiresAt: '',
    });
  });

  test('requires worker lease ownership when runners report completion or failure', () => {
    const project = {
      id: 'camera-monitor',
      name: 'Camera Monitor',
      organizationId: 'wee-coder-labs',
      platformJobs: [],
      history: [],
    };
    const queued = queuePlatformJobForProject(project, {
      type: 'ai-development',
      title: 'AI coding job',
      command: 'npm test',
      actor: 'Owner',
      now: '2026-06-17T01:00:00.000Z',
    });
    const jobId = queued.platformJobs[0].id;
    const running = startPlatformJobForProject(queued, {
      jobId,
      actor: 'Local Runner',
      workerId: 'runner-a',
      leaseDurationMs: 600000,
      now: '2026-06-17T01:05:00.000Z',
    });

    expect(() =>
      completePlatformJobForProject(running, {
        jobId,
        actor: 'Other Runner',
        workerId: 'runner-b',
        now: '2026-06-17T01:06:00.000Z',
      }),
    ).toThrow(/worker lease owner/i);
    expect(() =>
      failPlatformJobForProject(running, {
        jobId,
        actor: 'Local Runner',
        workerId: 'runner-a',
        errorSummary: 'Finished after lease expiry.',
        now: '2026-06-17T01:16:00.000Z',
      }),
    ).toThrow(/worker lease has expired/i);

    const succeeded = completePlatformJobForProject(running, {
      jobId,
      actor: 'Local Runner',
      workerId: 'runner-a',
      resultSummary: 'All verification commands passed.',
      now: '2026-06-17T01:08:00.000Z',
    });

    expect(succeeded.platformJobs[0]).toMatchObject({
      id: jobId,
      status: 'succeeded',
      lockedBy: 'runner-a',
      resultSummary: 'All verification commands passed.',
    });
  });

  test('summarizes active and stale platform job worker leases', () => {
    const session = createPlatformSession({
      userId: 'owner-aa',
      organizationId: 'wee-coder-labs',
    });
    const cockpit = createPlatformCockpit(
      [
        {
          id: 'camera-monitor',
          name: 'Camera Monitor',
          organizationId: 'wee-coder-labs',
          platformJobs: [
            {
              id: 'running-active',
              type: 'ai-development',
              title: 'Active run',
              status: 'running',
              queuedAt: '2026-06-17T01:00:00.000Z',
              startedAt: '2026-06-17T01:05:00.000Z',
              runCount: 1,
              executor: 'codex-local',
              lockedBy: 'runner-a',
              leaseHeartbeatAt: '2026-06-17T01:09:00.000Z',
              leaseExpiresAt: '2026-06-17T01:20:00.000Z',
            },
            {
              id: 'running-stale',
              type: 'qa-run',
              title: 'Stale QA run',
              status: 'running',
              queuedAt: '2026-06-17T00:50:00.000Z',
              startedAt: '2026-06-17T00:55:00.000Z',
              runCount: 1,
              executor: 'local-rule',
              lockedBy: 'runner-b',
              leaseHeartbeatAt: '2026-06-17T00:58:00.000Z',
              leaseExpiresAt: '2026-06-17T01:02:00.000Z',
            },
          ],
        },
      ],
      {
        now: '2026-06-17T01:10:00.000Z',
        session,
      },
    );

    expect(cockpit.aiOperations.queue).toMatchObject({
      runningCount: 2,
      lockedCount: 2,
      staleLeaseCount: 1,
    });
    expect(cockpit.aiOperations.executionAudit.workerLeases).toMatchObject({
      activeCount: 1,
      staleCount: 1,
      nextAction: 'Reclaim or fail stale platform jobs before starting new AI coding work.',
      staleJobs: [
        expect.objectContaining({
          jobId: 'running-stale',
          title: 'Stale QA run',
          projectName: 'Camera Monitor',
          workerId: 'runner-b',
          leaseExpiredAt: '2026-06-17T01:02:00.000Z',
        }),
      ],
    });
  });

  test('retries, cancels, and exhausts platform jobs with audit history', () => {
    const project = {
      id: 'camera-monitor',
      name: 'Camera Monitor',
      organizationId: 'wee-coder-labs',
      platformJobs: [],
      history: [],
    };

    const queued = queuePlatformJobForProject(project, {
      type: 'ai-development',
      title: 'AI coding job',
      command: 'npm test',
      actor: 'Owner',
      now: '2026-06-17T01:00:00.000Z',
    });
    const jobId = queued.platformJobs[0].id;
    const running = startPlatformJobForProject(queued, {
      jobId,
      actor: 'Local Runner',
      now: '2026-06-17T01:01:00.000Z',
    });
    const failed = failPlatformJobForProject(running, {
      jobId,
      actor: 'Local Runner',
      errorSummary: 'npm test failed.',
      details: { sandboxPolicy: 'runner-command-allowlist' },
      now: '2026-06-17T01:02:00.000Z',
    });

    const retried = retryPlatformJobForProject(failed, {
      jobId,
      actor: 'Owner',
      now: '2026-06-17T01:03:00.000Z',
    });

    expect(retried.platformJobs[0]).toMatchObject({
      id: jobId,
      status: 'queued',
      rawStatus: 'retry-queued',
      runCount: 1,
      retryQueuedAt: '2026-06-17T01:03:00.000Z',
      startedAt: '',
      finishedAt: '',
      errorSummary: '',
      stdout: '',
      stderr: '',
      details: {},
    });
    expect(retried.history[0]).toMatchObject({
      type: 'platform-job-retried',
      actor: 'Owner',
    });

    const cancelled = cancelPlatformJobForProject(retried, {
      jobId,
      actor: 'Owner',
      reason: 'No longer needed.',
      now: '2026-06-17T01:04:00.000Z',
    });

    expect(cancelled.platformJobs[0]).toMatchObject({
      id: jobId,
      status: 'cancelled',
      rawStatus: 'cancelled',
      finishedAt: '2026-06-17T01:04:00.000Z',
      errorSummary: 'No longer needed.',
      details: { cancelReason: 'No longer needed.' },
    });
    expect(cancelled.history[0]).toMatchObject({
      type: 'platform-job-cancelled',
      actor: 'Owner',
    });
    expect(() =>
      startPlatformJobForProject(cancelled, {
        jobId,
        actor: 'Local Runner',
      }),
    ).toThrow(/queued platform jobs/i);

    const thirdAttemptRunning = {
      ...running,
      platformJobs: [{ ...running.platformJobs[0], runCount: 3 }],
    };
    const exhausted = failPlatformJobForProject(thirdAttemptRunning, {
      jobId,
      actor: 'Local Runner',
      errorSummary: 'npm test failed again.',
      now: '2026-06-17T01:05:00.000Z',
    });

    expect(exhausted.platformJobs[0]).toMatchObject({
      id: jobId,
      status: 'exhausted',
      rawStatus: 'exhausted',
      retryExhausted: true,
      errorSummary: 'npm test failed again.',
    });
    expect(exhausted.history[0]).toMatchObject({
      type: 'platform-job-exhausted',
      actor: 'Local Runner',
    });
    expect(() =>
      retryPlatformJobForProject(exhausted, {
        jobId,
        actor: 'Owner',
      }),
    ).toThrow(/retry attempts exhausted/i);
  });

  test('summarizes platform job execution audit and retry posture', () => {
    const session = createPlatformSession({
      userId: 'owner-aa',
      organizationId: 'wee-coder-labs',
    });
    const cockpit = createPlatformCockpit(
      [
        {
          id: 'camera-monitor',
          name: 'Camera Monitor',
          organizationId: 'wee-coder-labs',
          platformJobs: [
            {
              id: 'failed-review',
              type: 'code-review',
              title: 'Code review',
              status: 'failed',
              queuedAt: '2026-06-17T01:00:00.000Z',
              startedAt: '2026-06-17T01:01:00.000Z',
              finishedAt: '2026-06-17T01:02:00.000Z',
              runCount: 1,
              executor: 'local-rule',
              command: 'npm audit --omit=dev',
              errorSummary: 'Dependency audit failed.',
            },
            {
              id: 'passed-build',
              type: 'ai-development',
              title: 'Build verification',
              status: 'succeeded',
              queuedAt: '2026-06-17T01:03:00.000Z',
              startedAt: '2026-06-17T01:04:00.000Z',
              finishedAt: '2026-06-17T01:05:30.000Z',
              runCount: 1,
              executor: 'codex-local',
              command: 'npm run build',
              resultSummary: 'Build passed.',
              stdout: 'built in 500ms',
              durationMs: 90000,
            },
            {
              id: 'exhausted-build',
              type: 'ai-development',
              title: 'Build verification exhausted',
              status: 'exhausted',
              queuedAt: '2026-06-17T01:06:00.000Z',
              startedAt: '2026-06-17T01:06:30.000Z',
              finishedAt: '2026-06-17T01:08:30.000Z',
              runCount: 3,
              executor: 'codex-local',
              command: 'npm run build',
              errorSummary: 'Command is not in the project runner allowlist and was not executed.',
              details: {
                sandboxPolicy: 'project-verification-command-allowlist',
                blockedCommand: 'npm run build',
              },
            },
            {
              id: 'cancelled-qa',
              type: 'qa-run',
              title: 'QA cancelled run',
              status: 'cancelled',
              queuedAt: '2026-06-17T01:09:00.000Z',
              finishedAt: '2026-06-17T01:09:30.000Z',
              runCount: 0,
              executor: 'local-rule',
              command: 'npm test',
              errorSummary: 'Manual cancellation.',
              details: {
                cancelReason: 'Manual cancellation.',
              },
            },
          ],
        },
      ],
      {
        now: '2026-06-17T01:10:00.000Z',
        session,
      },
    );

    expect(cockpit.aiOperations.executionAudit).toMatchObject({
      totalJobs: 4,
      completedJobCount: 4,
      retryableFailedCount: 1,
      exhaustedCount: 1,
      cancelledCount: 1,
      missingEvidenceCount: 1,
      evidenceCoveragePercent: 75,
      evidenceTrail: expect.arrayContaining([
        expect.objectContaining({
          jobId: 'passed-build',
          projectName: 'Camera Monitor',
          command: 'npm run build',
          status: 'succeeded',
          evidenceComplete: true,
          stdoutExcerpt: 'built in 500ms',
          summary: 'Build passed.',
        }),
        expect.objectContaining({
          jobId: 'exhausted-build',
          status: 'exhausted',
          evidenceComplete: true,
          sandboxPolicy: 'project-verification-command-allowlist',
          blockedCommand: 'npm run build',
        }),
        expect.objectContaining({
          jobId: 'failed-review',
          status: 'failed',
          evidenceComplete: false,
          missing: expect.arrayContaining(['stdout/stderr', 'result summary']),
        }),
      ]),
      retryCandidates: [
        expect.objectContaining({
          jobId: 'failed-review',
          projectName: 'Camera Monitor',
          reason: 'Dependency audit failed.',
          nextAction: 'Review job logs, fix the blocker, and rerun the platform job.',
        }),
      ],
      exhaustedJobs: [
        expect.objectContaining({
          jobId: 'exhausted-build',
          projectName: 'Camera Monitor',
          reason: 'Command is not in the project runner allowlist and was not executed.',
          blockedCommand: 'npm run build',
          nextAction: 'Escalate to the technical owner before scheduling another run.',
        }),
      ],
      cancelledJobs: [
        expect.objectContaining({
          jobId: 'cancelled-qa',
          projectName: 'Camera Monitor',
          reason: 'Manual cancellation.',
          nextAction: 'Confirm whether the cancelled job should stay closed or be queued again.',
        }),
      ],
      latestBlocker: expect.objectContaining({
        jobId: 'exhausted-build',
        projectName: 'Camera Monitor',
        status: 'exhausted',
        reason: 'Command is not in the project runner allowlist and was not executed.',
        sandboxPolicy: 'project-verification-command-allowlist',
        blockedCommand: 'npm run build',
      }),
      actionGroups: [
        expect.objectContaining({
          id: 'retryable',
          count: 1,
          nextAction: 'Fix blockers and retry eligible jobs from the cockpit.',
        }),
        expect.objectContaining({
          id: 'exhausted',
          count: 1,
          nextAction: 'Escalate exhausted jobs to the technical owner.',
        }),
        expect.objectContaining({
          id: 'cancelled',
          count: 1,
          nextAction: 'Review cancellations and decide whether to queue replacement jobs.',
        }),
      ],
      evidenceGaps: [
        expect.objectContaining({
          jobId: 'failed-review',
          missing: expect.arrayContaining(['stdout/stderr', 'result summary']),
        }),
      ],
      executorHealth: expect.arrayContaining([
        expect.objectContaining({
          executor: 'local-rule',
          totalJobs: 2,
          failedCount: 1,
          averageDurationMs: 60000,
        }),
        expect.objectContaining({
          executor: 'codex-local',
          totalJobs: 2,
          failedCount: 1,
          averageDurationMs: 105000,
        }),
      ]),
    });
  });

  test('records sent owner escalation messages and reflects them in the digest', () => {
    const sentAt = '2026-06-18T01:00:00.000Z';
    const session = createPlatformSession({
      userId: 'owner-aa',
      organizationId: 'wee-coder-labs',
    });
    const project = {
      id: 'camera',
      name: 'Camera Monitor',
      organizationId: 'wee-coder-labs',
      currentStageId: 'pm-requirements',
      currentStageName: 'PM requirements',
      updatedAt: '2026-06-15T00:00:00.000Z',
      openFollowupTaskCount: 3,
      members: { pm: 'pm-lin' },
      stageGateReport: {
        stageId: 'pm-requirements',
        stageName: 'PM requirements',
        status: 'blocked',
        blockerCount: 2,
        openTaskCount: 3,
        requiredActions: ['Collect RTSP sample evidence before PRD approval.'],
      },
      stageRiskRegister: {
        'pm-requirements': {
          riskLevel: 'high',
        },
      },
    };

    const updated = sendOwnerEscalationForProject(project, {
      messageId: 'owner-escalation-pm-camera',
      role: 'pm',
      roleLabel: 'PM',
      recipientUserId: 'pm-lin',
      recipientName: 'Lin PM',
      escalationLevel: 'escalated',
      overdueHours: 24,
      subject: 'Escalate PM handoff: Camera Monitor overdue 24h',
      body: 'PM: Camera Monitor is overdue by 24h. Collect RTSP sample evidence before PRD approval.',
      actor: 'AA',
      actorUserId: 'owner-aa',
      note: 'Sent from owner cockpit.',
      now: sentAt,
    });

    expect(updated.ownerEscalations['owner-escalation-pm-camera']).toMatchObject({
      id: 'owner-escalation-pm-camera',
      status: 'sent',
      sentAt,
      sentBy: 'AA',
      sentByUserId: 'owner-aa',
      recipientUserId: 'pm-lin',
      subject: 'Escalate PM handoff: Camera Monitor overdue 24h',
    });
    expect(updated.history[0]).toMatchObject({
      type: 'owner-escalation-sent',
      actor: 'AA',
      actorUserId: 'owner-aa',
      escalationMessageId: 'owner-escalation-pm-camera',
      escalationStatus: 'sent',
      recipientUserId: 'pm-lin',
      auditReason: 'owner-escalation-sent',
      at: sentAt,
    });

    const cockpit = createPlatformCockpit([updated], {
      now: '2026-06-18T02:00:00.000Z',
      session,
    });

    expect(cockpit.governance.ownerEscalationDigest).toMatchObject({
      summary: {
        messageCount: 1,
        sentMessageCount: 1,
        readyMessageCount: 0,
        nextAction: 'All owner escalation messages have been sent.',
      },
      messages: [
        expect.objectContaining({
          id: 'owner-escalation-pm-camera',
          status: 'sent',
          sentAt,
          sentBy: 'AA',
          sentByUserId: 'owner-aa',
        }),
      ],
    });
    expect(cockpit.governance.auditLog[0]).toMatchObject({
      type: 'owner-escalation-sent',
      escalationMessageId: 'owner-escalation-pm-camera',
      actorUserId: 'owner-aa',
    });
  });

  test('records acknowledged owner escalation messages without reopening digest send actions', () => {
    const sent = sendOwnerEscalationForProject(
      {
        id: 'camera',
        name: 'Camera Monitor',
        organizationId: 'wee-coder-labs',
        currentStageId: 'pm-requirements',
        currentStageName: 'PM requirements',
        updatedAt: '2026-06-15T00:00:00.000Z',
        members: { pm: 'pm-lin' },
        stageGateReport: {
          stageId: 'pm-requirements',
          stageName: 'PM requirements',
          status: 'blocked',
          blockerCount: 2,
          openTaskCount: 3,
          requiredActions: ['Collect RTSP sample evidence before PRD approval.'],
        },
      },
      {
        messageId: 'owner-escalation-pm-camera',
        role: 'pm',
        roleLabel: 'PM',
        recipientUserId: 'pm-lin',
        recipientName: 'Lin PM',
        escalationLevel: 'escalated',
        overdueHours: 24,
        subject: 'Escalate PM handoff: Camera Monitor overdue 24h',
        body: 'PM: Camera Monitor is overdue by 24h. Collect RTSP sample evidence before PRD approval.',
        actor: 'AA',
        actorUserId: 'owner-aa',
        now: '2026-06-18T01:00:00.000Z',
      },
    );

    const acknowledged = acknowledgeOwnerEscalationForProject(sent, {
      messageId: 'owner-escalation-pm-camera',
      actor: 'Lin PM',
      actorUserId: 'pm-lin',
      note: 'PM is updating the unblock plan.',
      now: '2026-06-18T01:30:00.000Z',
    });

    expect(acknowledged.ownerEscalations['owner-escalation-pm-camera']).toMatchObject({
      status: 'acknowledged',
      acknowledgedBy: 'Lin PM',
      acknowledgedByUserId: 'pm-lin',
      acknowledgementNote: 'PM is updating the unblock plan.',
    });
    expect(acknowledged.history[0]).toMatchObject({
      type: 'owner-escalation-acknowledged',
      actorUserId: 'pm-lin',
      escalationMessageId: 'owner-escalation-pm-camera',
      escalationStatus: 'acknowledged',
      auditReason: 'owner-escalation-acknowledged',
    });

    const cockpit = createPlatformCockpit([acknowledged], {
      now: '2026-06-18T02:00:00.000Z',
      session: createPlatformSession({
        userId: 'owner-aa',
        organizationId: 'wee-coder-labs',
      }),
    });

    expect(cockpit.governance.ownerEscalationDigest).toMatchObject({
      summary: {
        messageCount: 1,
        acknowledgedMessageCount: 1,
        readyMessageCount: 0,
        nextAction: 'All owner escalation messages have been handled.',
      },
      messages: [
        expect.objectContaining({
          id: 'owner-escalation-pm-camera',
          status: 'acknowledged',
          acknowledgedBy: 'Lin PM',
          acknowledgedByUserId: 'pm-lin',
        }),
      ],
    });
  });
});
