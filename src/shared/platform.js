import { getRoleLabel } from './authorization.js';
import { DATABASE_TABLES, createDatabaseMigrationPlan } from './databasePlan.js';
import { createStageConfirmationFollowupTasks } from './stageConfirmations.js';
import { createProjectHealthPortfolio } from './projectHealth.js';
import { APP_USERS, findUserById, getDefaultUser } from './users.js';
import { createDevelopmentChangePackage } from './developmentRun.js';

export const DEFAULT_ORGANIZATION_ID = 'wee-coder-labs';

export const APP_ORGANIZATIONS = Object.freeze([
  createOrganization({
    id: DEFAULT_ORGANIZATION_ID,
    name: 'WeeCoder Labs',
    plan: 'Team',
    status: 'active',
    environment: 'local-commercial-v0.2',
    members: {
      'owner-aa': 'owner',
      'pm-lin': 'pm',
      'tech-chen': 'tech-lead',
      'tech-li': 'tech-lead',
      'ops-wang': 'ops',
      'ai-dev-bot': 'ai-dev',
      'runner-local': 'local-runner',
      'qa-zhao': 'qa',
    },
  }),
  createOrganization({
    id: 'acme-security-pilot',
    name: '安防试点组织',
    plan: 'Pilot',
    status: 'active',
    environment: 'pilot',
    members: {
      'owner-aa': 'owner',
      'tech-li': 'tech-lead',
      'qa-zhao': 'qa',
    },
  }),
]);

const SLA_HOURS_BY_STAGE = Object.freeze({
  intake: 24,
  'pm-requirements': 48,
  'prd-approval': 24,
  architecture: 48,
  'ops-requirements': 48,
  development: 72,
  review: 24,
  qa: 24,
  acceptance: 48,
  'defect-loop': 48,
});

const SLA_OWNER_ROLE_BY_STAGE = Object.freeze({
  intake: 'owner',
  'pm-requirements': 'pm',
  'prd-approval': 'owner',
  architecture: 'tech-lead',
  'ops-requirements': 'ops',
  development: 'ai-dev',
  review: 'tech-lead',
  qa: 'qa',
  acceptance: 'owner',
  'defect-loop': 'ai-dev',
});

const COST_RATES_CNY = Object.freeze({
  artifact: 0.4,
  job: 0.6,
  check: 0.25,
  waitingItem: 0.15,
  deploymentEnvironment: Object.freeze({
    local: 0.2,
    staging: 1.2,
    production: 3,
  }),
});

const DELIVERY_CLOSURE_GATES = Object.freeze([
  { id: 'requirements', label: 'Requirements' },
  { id: 'prd', label: 'PRD' },
  { id: 'development', label: 'Development' },
  { id: 'review', label: 'Review' },
  { id: 'qa', label: 'QA' },
  { id: 'acceptance', label: 'Acceptance' },
  { id: 'signoff', label: 'Sign-off' },
]);

const MAX_PLATFORM_JOB_RUNS = 3;
const DEVELOPMENT_STAGE_ID = 'development';
const REVIEW_STAGE_ID = 'review';
const QA_STAGE_ID = 'qa';
const DEFECT_LOOP_STAGE_ID = 'defect-loop';

const PLATFORM_JOB_TITLES = Object.freeze({
  'ai-development': 'AI coding 后台任务',
  'qa-defect-fix': 'QA 缺陷修复执行',
  'code-review': '代码/安全/性能 Review',
  'qa-run': 'QA 自动测试',
  'deployment-check': '部署检查',
});

export function createPlatformSession(
  { userId = '', organizationId = '' } = {},
  users = APP_USERS,
  organizations = APP_ORGANIZATIONS,
) {
  const currentUser = findUserById(userId, users) || getDefaultUser(users);
  const memberships = organizations
    .filter((organization) => organization.members[currentUser.id])
    .map((organization) => ({
      organizationId: organization.id,
      organizationName: organization.name,
      role: organization.members[currentUser.id],
      roleLabel: getRoleLabel(organization.members[currentUser.id]),
    }));
  const requestedOrganization = organizations.find(
    (organization) =>
      organization.id === organizationId &&
      organization.members[currentUser.id],
  );
  const currentOrganization =
    requestedOrganization ||
    organizations.find((organization) => organization.id === memberships[0]?.organizationId) ||
    organizations[0];
  const organizationRole = currentOrganization?.members[currentUser.id] || currentUser.role;

  return {
    currentUser,
    currentOrganization,
    memberships,
    availableOrganizations: organizations.filter((organization) => organization.members[currentUser.id]),
    organizationRole,
    organizationRoleLabel: getRoleLabel(organizationRole),
    permissions: createOrganizationPermissions(organizationRole),
  };
}

export function withProjectOrganization(project, session) {
  return {
    ...project,
    organizationId: project.organizationId || session?.currentOrganization?.id || DEFAULT_ORGANIZATION_ID,
  };
}

export function isProjectVisibleToSession(project, session) {
  const projectOrganizationId = project.organizationId || DEFAULT_ORGANIZATION_ID;
  return projectOrganizationId === session?.currentOrganization?.id;
}

export function filterProjectsForSession(projects = [], session) {
  return projects.filter((project) => isProjectVisibleToSession(project, session));
}

export function createPlatformCockpit(
  projects = [],
  {
    now = new Date().toISOString(),
    session = createPlatformSession(),
    storageProfile = {},
    users = APP_USERS,
  } = {},
) {
  const visibleProjects = filterProjectsForSession(projects, session).map((project) =>
    withProjectOrganization(project, session),
  );
  const jobs = createAgentJobs(visibleProjects, now);
  const auditLog = createAuditLog(visibleProjects);
  const auditSummary = createAuditSummary(auditLog);
  const securityAudit = createSecurityAuditSummary(auditLog);
  const sla = createSlaSummary(visibleProjects, now);
  const cost = createCostSummary(visibleProjects, jobs);
  const commandCenter = createCommandCenter(visibleProjects, jobs, sla, users);
  const projectHealth = createProjectHealthPortfolio(visibleProjects, { jobs, sla });
  const ownerPortfolio = createOwnerPortfolio(visibleProjects, {
    commandCenter,
    cost,
    projectHealth,
    sla,
    users,
  });
  const ownerRoleFlow = createOwnerRoleFlow(visibleProjects, { ownerPortfolio, users });
  const ownerEscalationDigest = createOwnerEscalationDigest(ownerRoleFlow, {
    escalationState: createOwnerEscalationState(visibleProjects),
  });
  const deliveryClosure = createDeliveryClosureSummary(visibleProjects);
  const notifications = createNotificationSummary(visibleProjects);

  return {
    generatedAt: now,
    session,
    tenancy: {
      currentOrganizationId: session.currentOrganization.id,
      currentOrganizationName: session.currentOrganization.name,
      plan: session.currentOrganization.plan,
      status: session.currentOrganization.status,
      activeUserCount: Object.keys(session.currentOrganization.members || {}).length,
      availableOrganizationCount: session.availableOrganizations.length,
      visibleProjectCount: visibleProjects.length,
      atRiskProjectCount:
        projectHealth.summary.criticalCount + projectHealth.summary.warningCount,
      roleMatrix: createRoleMatrix(session.currentOrganization, users),
    },
    database: createDatabaseReadiness(storageProfile),
    aiOperations: {
      queue: summarizeJobs(jobs, now),
      jobs,
      executionAudit: createExecutionAuditSummary(jobs, now),
      runLedger: createAgentRunLedger(visibleProjects, jobs, now),
      sandbox: createSandboxSummary(visibleProjects),
    },
    governance: {
      auditLog,
      auditSummary,
      securityAudit,
    notifications: {
      ...notifications,
      actionCenter: createNotificationActionCenter({ auditLog, jobs, projects: visibleProjects, sla }),
    },
      sla,
      cost,
      commandCenter,
      projectHealth,
      ownerPortfolio,
      ownerRoleFlow,
      ownerEscalationDigest,
      deliveryClosure,
    },
    deployment: createDeploymentSummary(visibleProjects),
  };
}

export function queuePlatformJobForProject(
  project,
  {
    type = 'ai-development',
    title = '',
    command = '',
    details = {},
    source = 'platform-control',
    actor = '系统',
    now = new Date().toISOString(),
  } = {},
) {
  const job = normalizePlatformJob(
    {
      id: createPlatformJobId(project, type, now),
      type,
      title,
      status: 'queued',
      queuedAt: now,
      command,
      details,
      source,
      requestedBy: actor,
    },
    project,
    now,
  );

  return {
    ...project,
    updatedAt: now,
    platformJobs: [job, ...(project.platformJobs || [])],
    history: [
      {
        type: 'platform-job-queued',
        actor,
        note: `已加入后台任务队列：${job.title}`,
        at: now,
      },
      ...(project.history || []),
    ],
  };
}

export class PlatformJobError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = 'PlatformJobError';
    this.details = details;
  }
}

export class PlatformNotificationError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = 'PlatformNotificationError';
    this.details = details;
  }
}

export function startPlatformJobForProject(
  project,
  {
    jobId = '',
    leaseDurationMs = 15 * 60 * 1000,
    actor = '系统',
    now = new Date().toISOString(),
    workerId = '',
  } = {},
) {
  const normalizedWorkerId = String(workerId || actor || 'local-runner').trim();
  const leaseExpiresAt = addMilliseconds(now, leaseDurationMs);

  return updatePlatformJob(project, jobId, {
    actor,
    now,
    historyType: 'platform-job-started',
    update: (job) => {
      if (job.status === 'running' && !isJobLeaseExpired(job, now)) {
        throw new PlatformJobError('Platform job already has an active worker lease.', {
          jobId,
          lockedBy: job.lockedBy || '',
          leaseExpiresAt: job.leaseExpiresAt || '',
          status: job.status,
        });
      }
      if (job.status !== 'queued' && !(job.status === 'running' && isJobLeaseExpired(job, now))) {
        throw new PlatformJobError('Only queued platform jobs can be started.', {
          jobId,
          status: job.status,
        });
      }

      return {
        ...job,
        status: 'running',
        rawStatus: 'running',
        startedAt: now,
        finishedAt: '',
        runCount: Number(job.runCount || 0) + 1,
        lockedBy: normalizedWorkerId,
        leaseStartedAt: now,
        leaseHeartbeatAt: now,
        leaseExpiresAt,
        errorSummary: '',
        details: normalizeJobDetails(job.details),
      };
    },
    note: (job) => `后台任务已开始：${job.title}`,
  });
}

export function heartbeatPlatformJobForProject(
  project,
  {
    jobId = '',
    leaseDurationMs = 15 * 60 * 1000,
    actor = 'System',
    now = new Date().toISOString(),
    workerId = '',
  } = {},
) {
  const normalizedWorkerId = normalizeWorkerId(workerId || actor);
  const leaseExpiresAt = addMilliseconds(now, leaseDurationMs);

  return updatePlatformJob(project, jobId, {
    actor,
    now,
    historyType: 'platform-job-heartbeat',
    update: (job) => {
      if (job.status !== 'running') {
        throw new PlatformJobError('Only running platform jobs can heartbeat.', {
          jobId,
          status: job.status,
        });
      }
      assertWorkerLeaseOwner(job, {
        jobId,
        now,
        workerId: normalizedWorkerId,
      });

      return {
        ...job,
        leaseHeartbeatAt: now,
        leaseExpiresAt,
        details: normalizeJobDetails(job.details),
      };
    },
    note: (job) => `Platform job heartbeat: ${job.title}`,
  });
}

export function reclaimPlatformJobForProject(
  project,
  {
    jobId = '',
    actor = 'System',
    reason = '',
    now = new Date().toISOString(),
  } = {},
) {
  const reclaimReason = String(reason || 'Worker lease expired.').trim();

  return updatePlatformJob(project, jobId, {
    actor,
    now,
    historyType: 'platform-job-reclaimed',
    update: (job) => {
      if (job.status !== 'running') {
        throw new PlatformJobError('Only running platform jobs can be reclaimed.', {
          jobId,
          status: job.status,
        });
      }
      if (!isJobLeaseStale(job, now)) {
        throw new PlatformJobError('Only platform jobs with a stale worker lease can be reclaimed.', {
          jobId,
          lockedBy: job.lockedBy || '',
          leaseExpiresAt: job.leaseExpiresAt || '',
          status: job.status,
        });
      }

      return {
        ...job,
        status: 'queued',
        rawStatus: 'reclaimed-queued',
        startedAt: '',
        finishedAt: '',
        lockedBy: '',
        leaseStartedAt: '',
        leaseHeartbeatAt: '',
        leaseExpiresAt: '',
        resultSummary: '',
        errorSummary: '',
        stdout: '',
        stderr: '',
        exitCode: null,
        durationMs: 0,
        details: {
          ...normalizeJobDetails(job.details),
          reclaimReason,
          previousLockedBy: job.lockedBy || '',
          leaseExpiredAt: job.leaseExpiresAt || '',
          reclaimedAt: now,
        },
      };
    },
    note: (job) => `Platform job reclaimed: ${job.title}`,
  });
}

export function completePlatformJobForProject(
  project,
  {
    jobId = '',
    workerId = '',
    actor = '系统',
    command = '',
    durationMs = 0,
    exitCode = 0,
    resultSummary = '',
    stderr = '',
    stdout = '',
    now = new Date().toISOString(),
  } = {},
) {
  return updatePlatformJob(project, jobId, {
    actor,
    now,
    historyType: 'platform-job-succeeded',
    update: (job) => {
      if (String(workerId || '').trim()) {
        assertWorkerLeaseOwner(job, { jobId, workerId, now });
      }

      return {
        ...job,
        status: 'succeeded',
        rawStatus: 'succeeded',
        finishedAt: now,
        command: String(command || job.command || '').trim(),
        durationMs: Number.isFinite(durationMs) ? durationMs : Number(job.durationMs || 0),
        exitCode: Number.isInteger(exitCode) ? exitCode : 0,
        resultSummary: String(resultSummary || '').trim(),
        stderr: String(stderr || '').trim(),
        stdout: String(stdout || '').trim(),
        errorSummary: '',
        details: normalizeJobDetails(job.details),
      };
    },
    note: (job) => `后台任务已成功：${job.title}`,
  });
}

export function failPlatformJobForProject(
  project,
  {
    jobId = '',
    workerId = '',
    actor = '系统',
    command = '',
    durationMs = 0,
    exitCode = null,
    errorSummary = '',
    details = {},
    stderr = '',
    stdout = '',
    now = new Date().toISOString(),
  } = {},
) {
  return updatePlatformJob(project, jobId, {
    actor,
    now,
    historyType: shouldExhaustJob(jobId, project) ? 'platform-job-exhausted' : 'platform-job-failed',
    update: (job) => {
      if (String(workerId || '').trim()) {
        assertWorkerLeaseOwner(job, { jobId, workerId, now });
      }

      return {
        ...job,
        status: Number(job.runCount || 0) >= MAX_PLATFORM_JOB_RUNS ? 'exhausted' : 'failed',
        rawStatus: Number(job.runCount || 0) >= MAX_PLATFORM_JOB_RUNS ? 'exhausted' : 'failed',
        retryExhausted: Number(job.runCount || 0) >= MAX_PLATFORM_JOB_RUNS,
        finishedAt: now,
        command: String(command || job.command || '').trim(),
        durationMs: Number.isFinite(durationMs) ? durationMs : Number(job.durationMs || 0),
        exitCode: Number.isInteger(exitCode) ? exitCode : null,
        errorSummary: String(errorSummary || '').trim(),
        stderr: String(stderr || '').trim(),
        stdout: String(stdout || '').trim(),
        details: {
          ...normalizeJobDetails(job.details),
          ...normalizeJobDetails(details),
        },
      };
    },
    note: (job) => `后台任务已失败：${job.title}`,
  });
}

export function retryPlatformJobForProject(
  project,
  {
    jobId = '',
    actor = '绯荤粺',
    now = new Date().toISOString(),
  } = {},
) {
  return updatePlatformJob(project, jobId, {
    actor,
    now,
    historyType: 'platform-job-retried',
    update: (job) => {
      if (job.status === 'exhausted' || Number(job.runCount || 0) >= MAX_PLATFORM_JOB_RUNS) {
        throw new PlatformJobError('Platform job retry attempts exhausted.', {
          jobId,
          runCount: Number(job.runCount || 0),
          maxRunCount: MAX_PLATFORM_JOB_RUNS,
        });
      }
      if (job.status !== 'failed') {
        throw new PlatformJobError('Only failed platform jobs can be retried.', {
          jobId,
          status: job.status,
        });
      }

      return {
        ...job,
        status: 'queued',
        rawStatus: 'retry-queued',
        retryQueuedAt: now,
        startedAt: '',
        finishedAt: '',
        exitCode: null,
        durationMs: 0,
        resultSummary: '',
        errorSummary: '',
        stdout: '',
        stderr: '',
        details: {},
      };
    },
    note: (job) => `Platform job retry queued: ${job.title}`,
  });
}

export function cancelPlatformJobForProject(
  project,
  {
    jobId = '',
    actor = '绯荤粺',
    reason = '',
    now = new Date().toISOString(),
  } = {},
) {
  const cancelReason = String(reason || 'Platform job cancelled.').trim();
  return updatePlatformJob(project, jobId, {
    actor,
    now,
    historyType: 'platform-job-cancelled',
    update: (job) => {
      if (!['queued', 'running'].includes(job.status)) {
        throw new PlatformJobError('Only queued or running platform jobs can be cancelled.', {
          jobId,
          status: job.status,
        });
      }

      return {
        ...job,
        status: 'cancelled',
        rawStatus: 'cancelled',
        finishedAt: now,
        errorSummary: cancelReason,
        details: {
          cancelReason,
        },
      };
    },
    note: (job) => `Platform job cancelled: ${job.title}`,
  });
}

export function updateDeploymentEnvironmentForProject(
  project,
  {
    environmentId = '',
    actor = '系统',
    status = 'planned',
    version = '',
    url = '',
    evidence = '',
    now = new Date().toISOString(),
  } = {},
) {
  const environment = normalizeDeploymentEnvironment({
    id: environmentId,
    status,
    version,
    url,
    evidence,
    updatedAt: now,
    updatedBy: actor,
  });

  return {
    ...project,
    updatedAt: now,
    deploymentEnvironments: {
      ...(project.deploymentEnvironments || {}),
      [environment.id]: environment,
    },
    history: [
      {
        type: 'deployment-environment-updated',
        actor,
        note: `Deployment environment ${environment.id} marked ${environment.status}.`,
        at: now,
        environmentId: environment.id,
        environmentStatus: environment.status,
      },
      ...(project.history || []),
    ],
  };
}

export function acknowledgeNotificationForProject(
  project,
  {
    notificationId = '',
    actor = '系统',
    note = '',
    now = new Date().toISOString(),
  } = {},
) {
  const normalizedNotificationId = String(notificationId || '').trim();
  if (!normalizedNotificationId) {
    throw new PlatformNotificationError('Notification id is required.', { notificationId });
  }

  const acknowledgement = {
    id: normalizedNotificationId,
    status: 'acknowledged',
    acknowledgedBy: String(actor || '系统').trim(),
    acknowledgedAt: now,
    note: String(note || '').trim(),
  };

  return {
    ...project,
    updatedAt: now,
    notificationAcknowledgements: {
      ...(project.notificationAcknowledgements || {}),
      [normalizedNotificationId]: acknowledgement,
    },
    history: [
      {
        type: 'notification-acknowledged',
        actor,
        note: acknowledgement.note || `Notification ${normalizedNotificationId} acknowledged.`,
        at: now,
        notificationId: normalizedNotificationId,
      },
      ...(project.history || []),
    ],
  };
}

export function updateNotificationActionForProject(
  project,
  {
    actionId = '',
    status = 'acknowledged',
    actor = '绯荤粺',
    assigneeRole = '',
    assigneeUserId = '',
    assigneeName = '',
    note = '',
    resolution = '',
    auditReason = '',
    now = new Date().toISOString(),
  } = {},
) {
  const normalizedActionId = String(actionId || '').trim();
  if (!normalizedActionId) {
    throw new PlatformNotificationError('Notification action id is required.', { actionId });
  }

  const normalizedStatus = normalizeNotificationActionStatus(status);
  const actorName = String(actor || '绯荤粺').trim();
  const current = project.notificationAcknowledgements?.[normalizedActionId] || {
    id: normalizedActionId,
  };
  const actionState = {
    ...current,
    id: normalizedActionId,
    status: normalizedStatus,
    updatedAt: now,
    note: String(note || current.note || '').trim(),
  };

  if (normalizedStatus === 'acknowledged' && !actionState.acknowledgedAt) {
    actionState.acknowledgedBy = actorName;
    actionState.acknowledgedAt = now;
  }

  if (normalizedStatus === 'assigned') {
    actionState.acknowledgedBy = actionState.acknowledgedBy || actorName;
    actionState.acknowledgedAt = actionState.acknowledgedAt || now;
    actionState.assignedBy = actorName;
    actionState.assignedAt = now;
    actionState.assigneeRole = String(assigneeRole || current.assigneeRole || '').trim();
    actionState.assigneeUserId = String(assigneeUserId || current.assigneeUserId || '').trim();
    actionState.assigneeName = String(assigneeName || current.assigneeName || '').trim();
  }

  if (normalizedStatus === 'resolved') {
    actionState.resolvedBy = actorName;
    actionState.resolvedAt = now;
    actionState.resolution = String(resolution || note || current.resolution || '').trim();
  }

  return {
    ...project,
    updatedAt: now,
    notificationAcknowledgements: {
      ...(project.notificationAcknowledgements || {}),
      [normalizedActionId]: actionState,
    },
    history: [
      {
        type: `notification-action-${normalizedStatus}`,
        actor: actorName,
        note: actionState.resolution || actionState.note || `Notification action ${normalizedActionId} ${normalizedStatus}.`,
        at: now,
        notificationId: normalizedActionId,
        notificationStatus: normalizedStatus,
        assigneeRole: actionState.assigneeRole || '',
        assigneeUserId: actionState.assigneeUserId || '',
        assigneeName: actionState.assigneeName || '',
        resolution: actionState.resolution || '',
        auditReason: auditReason || `notification-action-${normalizedStatus}`,
      },
      ...(project.history || []),
    ],
  };
}

export function sendOwnerEscalationForProject(
  project,
  {
    messageId = '',
    role = '',
    roleLabel = '',
    recipientUserId = '',
    recipientName = '',
    stageId = '',
    stageName = '',
    escalationLevel = '',
    overdueHours = 0,
    subject = '',
    body = '',
    actor = '负责人',
    actorUserId = '',
    note = '',
    auditReason = 'owner-escalation-sent',
    now = new Date().toISOString(),
  } = {},
) {
  const normalizedMessageId = String(messageId || '').trim();
  if (!normalizedMessageId) {
    throw new PlatformNotificationError('Owner escalation message id is required.', { messageId });
  }

  const actorName = String(actor || '负责人').trim();
  const existing = project.ownerEscalations?.[normalizedMessageId] || {};
  const escalation = {
    ...existing,
    id: normalizedMessageId,
    status: 'sent',
    sentAt: now,
    sentBy: actorName,
    sentByUserId: String(actorUserId || existing.sentByUserId || '').trim(),
    role: String(role || existing.role || '').trim(),
    roleLabel: String(roleLabel || existing.roleLabel || '').trim(),
    recipientUserId: String(recipientUserId || existing.recipientUserId || '').trim(),
    recipientName: String(recipientName || existing.recipientName || '').trim(),
    projectId: project.id || existing.projectId || '',
    projectName: project.name || existing.projectName || '',
    stageId: String(stageId || existing.stageId || project.currentStageId || '').trim(),
    stageName: String(stageName || existing.stageName || project.currentStageName || '').trim(),
    escalationLevel: String(escalationLevel || existing.escalationLevel || '').trim(),
    overdueHours: Number(overdueHours || existing.overdueHours || 0),
    subject: String(subject || existing.subject || '').trim(),
    body: String(body || existing.body || '').trim(),
    note: String(note || existing.note || '').trim(),
  };

  return {
    ...project,
    updatedAt: project.updatedAt || now,
    ownerEscalations: {
      ...(project.ownerEscalations || {}),
      [normalizedMessageId]: escalation,
    },
    history: [
      {
        type: 'owner-escalation-sent',
        actor: actorName,
        actorUserId: escalation.sentByUserId,
        note: escalation.note || escalation.body || `Owner escalation ${normalizedMessageId} sent.`,
        at: now,
        escalationMessageId: normalizedMessageId,
        escalationStatus: 'sent',
        role: escalation.role,
        roleLabel: escalation.roleLabel,
        recipientUserId: escalation.recipientUserId,
        recipientName: escalation.recipientName,
        escalationLevel: escalation.escalationLevel,
        overdueHours: escalation.overdueHours,
        subject: escalation.subject,
        body: escalation.body,
        auditReason,
      },
      ...(project.history || []),
    ],
  };
}

export function acknowledgeOwnerEscalationForProject(
  project,
  {
    messageId = '',
    actor = '负责人',
    actorUserId = '',
    note = '',
    auditReason = 'owner-escalation-acknowledged',
    now = new Date().toISOString(),
  } = {},
) {
  const normalizedMessageId = String(messageId || '').trim();
  if (!normalizedMessageId) {
    throw new PlatformNotificationError('Owner escalation message id is required.', { messageId });
  }

  const current = project.ownerEscalations?.[normalizedMessageId];
  if (!current) {
    throw new PlatformNotificationError('Owner escalation message does not exist.', {
      messageId: normalizedMessageId,
    });
  }

  const actorName = String(actor || '负责人').trim();
  const acknowledgementNote = String(note || '').trim();
  const escalation = {
    ...current,
    id: normalizedMessageId,
    status: 'acknowledged',
    acknowledgedAt: now,
    acknowledgedBy: actorName,
    acknowledgedByUserId: String(actorUserId || '').trim(),
    acknowledgementNote,
  };

  return {
    ...project,
    updatedAt: project.updatedAt || now,
    ownerEscalations: {
      ...(project.ownerEscalations || {}),
      [normalizedMessageId]: escalation,
    },
    history: [
      {
        type: 'owner-escalation-acknowledged',
        actor: actorName,
        actorUserId: escalation.acknowledgedByUserId,
        note: acknowledgementNote || `Owner escalation ${normalizedMessageId} acknowledged.`,
        at: now,
        escalationMessageId: normalizedMessageId,
        escalationStatus: 'acknowledged',
        role: escalation.role || '',
        roleLabel: escalation.roleLabel || '',
        recipientUserId: escalation.recipientUserId || '',
        recipientName: escalation.recipientName || '',
        escalationLevel: escalation.escalationLevel || '',
        overdueHours: escalation.overdueHours || 0,
        subject: escalation.subject || '',
        body: escalation.body || '',
        auditReason,
      },
      ...(project.history || []),
    ],
  };
}

function createOrganization({ id, name, plan, status, environment, members }) {
  return Object.freeze({
    id,
    name,
    plan,
    status,
    environment,
    members: Object.freeze({ ...members }),
  });
}

function createOrganizationPermissions(role) {
  const isOwner = role === 'owner';
  const isDeliveryRole = ['owner', 'pm', 'tech-lead', 'ops', 'ai-dev', 'local-runner', 'qa'].includes(role);

  return {
    manageOrganization: isOwner,
    manageBilling: isOwner,
    manageSecurity: isOwner || role === 'tech-lead',
    runDelivery: isDeliveryRole,
    viewAudit: isOwner || role === 'tech-lead',
    viewCost: isOwner,
  };
}

function createRoleMatrix(organization, users) {
  return Object.entries(organization.members || {}).map(([userId, role]) => {
    const user = findUserById(userId, users);
    return {
      userId,
      name: user?.name || userId,
      role,
      roleLabel: getRoleLabel(role),
    };
  });
}

function createDatabaseReadiness(storageProfile = {}) {
  const migrationPlan = createDatabaseMigrationPlan();
  const profile = normalizeStorageProfile(storageProfile, migrationPlan);

  return {
    persistenceMode: profile.mode,
    targetEngine: profile.targetEngine,
    status: profile.migrationStatus,
    readinessScore: calculateDatabaseReadinessScore(profile),
    storageProfile: profile,
    tables: DATABASE_TABLES.map((item) => ({ ...item })),
    migrationPlan,
    cutoverReadiness: createDatabaseCutoverReadiness(profile),
    repositoryContract: createRepositoryContractReadiness(profile),
    extractionReadiness: createDatabaseExtractionReadiness(migrationPlan),
    agentQueueStorage: createAgentQueueStorageReadiness(migrationPlan),
    gaps: [
      '当前数据仍写入本地 JSON 文件，缺少事务、迁移、备份和并发写保护。',
      '尚未接入正式数据库连接池、迁移脚本和按组织分区的访问策略。',
      '审计、任务和费用数据目前由项目状态推导，尚未落独立表。',
    ],
    nextActions: [
      '引入 PostgreSQL schema 与迁移工具。',
      '把 projects、agent_jobs、audit_logs 从 JSON 状态拆出。',
      '为每个查询强制携带 organization_id 条件。',
    ],
  };
}

function createDatabaseCutoverReadiness(profile = {}) {
  const gates = [
    {
      id: 'repository-contract',
      title: 'Repository boundary',
      status: profile.adapter && profile.adapter !== 'unknown-repository' ? 'ready' : 'blocked',
      evidence:
        profile.adapter && profile.adapter !== 'unknown-repository'
          ? `${profile.adapter} exposes the persistence boundary.`
          : 'No project repository adapter was reported.',
      nextAction:
        profile.adapter && profile.adapter !== 'unknown-repository'
          ? 'Keep writes behind the repository contract during migration.'
          : 'Route all project reads and writes through the repository contract.',
    },
    {
      id: 'transaction-support',
      title: 'Transactional writes',
      status: profile.supportsTransactions ? 'ready' : 'blocked',
      evidence: profile.supportsTransactions
        ? 'Storage profile reports transaction support.'
        : 'Current persistence cannot roll back multi-entity writes.',
      nextAction: profile.supportsTransactions
        ? 'Use transactions for workflow, audit, job, and notification writes.'
        : 'Replace JSON file writes with PostgreSQL transactions.',
    },
    {
      id: 'concurrent-writes',
      title: 'Concurrent write protection',
      status: profile.supportsConcurrentWrites ? 'ready' : 'blocked',
      evidence: profile.supportsConcurrentWrites
        ? 'Storage profile reports concurrent write protection.'
        : 'Current persistence serializes through local file writes only.',
      nextAction: profile.supportsConcurrentWrites
        ? 'Keep project updates protected by database locking or version checks.'
        : 'Add optimistic locking or database-level write serialization.',
    },
    {
      id: 'tenant-scoping',
      title: 'Tenant scoping columns',
      status: hasTenantScopedTables() ? 'ready' : 'blocked',
      evidence: hasTenantScopedTables()
        ? 'Core tables include organization_id for tenant-scoped queries.'
        : 'Core tables are missing organization_id columns.',
      nextAction: 'Require organization_id in every production query path.',
    },
    {
      id: 'backup-rollback',
      title: 'Backup and rollback',
      status: 'planned',
      evidence: profile.location
        ? `JSON fallback remains at ${profile.location}.`
        : 'JSON fallback path is not configured.',
      nextAction: 'Automate JSON backup, migration verification, and rollback rehearsal.',
    },
  ];
  const readyGateCount = gates.filter((gate) => gate.status === 'ready').length;
  const blockedGateCount = gates.filter((gate) => gate.status === 'blocked').length;
  const plannedGateCount = gates.filter((gate) => gate.status === 'planned').length;

  return {
    status: blockedGateCount ? 'blocked' : plannedGateCount ? 'planned' : 'ready',
    readyGateCount,
    blockedGateCount,
    plannedGateCount,
    nextAction: blockedGateCount
      ? 'Implement transactional database writes before production cutover.'
      : plannedGateCount
        ? 'Complete backup and rollback rehearsal before production cutover.'
        : 'Database cutover gates are ready.',
    gates,
  };
}

function createRepositoryContractReadiness(profile = {}) {
  const availableMethods = new Set(profile.contractMethods || []);
  const requiredMethods = [
    method('listProjectsByOrganization', 'projects', 'Tenant-scoped project list queries.'),
    method('createProject', 'projects', 'Project creation with organization and audit context.'),
    method('updateProjectWithAudit', 'workflow_events', 'Workflow writes with actor, tenant, and audit reason metadata.'),
    method('updateProjectStage', 'workflow_events', 'Stage changes through an auditable boundary.'),
    method('appendAuditEvent', 'audit_logs', 'Standalone audit records before SQL extraction.'),
    method('createJob', 'agent_jobs', 'Queue AI coding and runner jobs as SQL-ready records.'),
    method('updateJob', 'agent_jobs', 'Track job lifecycle changes from one repository method.'),
    method('listJobsByStatus', 'agent_jobs', 'Tenant-scoped queue queries by status and type.'),
    method('createJobRun', 'agent_job_runs', 'Persist worker lease attempts as SQL-ready run rows.'),
    method('updateJobRun', 'agent_job_runs', 'Update worker lease heartbeat and terminal run evidence.'),
    method('appendJobEvent', 'agent_job_events', 'Persist immutable platform job lifecycle events.'),
    method('listNotifications', 'notifications', 'List tenant-scoped notification records.'),
  ];
  const methods = requiredMethods.map((item) => ({
    ...item,
    status: availableMethods.has(item.name) ? 'ready' : 'missing',
  }));
  const readyMethodCount = methods.filter((item) => item.status === 'ready').length;
  const missingMethodCount = methods.length - readyMethodCount;

  return {
    status: missingMethodCount ? 'missing-methods' : 'ready',
    readyMethodCount,
    missingMethodCount,
    methodCount: methods.length,
    nextAction: missingMethodCount
      ? 'Add missing repository methods before SQL route migration.'
      : 'Start migrating API routes to repository contract methods.',
    methods,
  };
}

function createAgentQueueStorageReadiness(migrationPlan = {}) {
  const tableDefinitions = [
    {
      tableName: 'agent_jobs',
      purpose: 'Job identity, queue status, executor, and command.',
      source: 'project.platformJobs[]',
      status: 'needs-extraction',
    },
    {
      tableName: 'agent_job_runs',
      purpose: 'Run attempts, worker lease ownership, duration, and exit code.',
      source: 'project.platformJobs[].runCount + lease fields',
      status: 'needs-extraction',
    },
    {
      tableName: 'agent_job_events',
      purpose: 'Immutable lifecycle events for queue audit and replay.',
      source: 'project.history[platform-job-*]',
      status: 'needs-filtered-extraction',
    },
  ];
  const tables = tableDefinitions.map((table) => {
    const mappings = (migrationPlan.entityMappings || []).filter(
      (mapping) => mapping.targetTable === table.tableName,
    );

    return {
      ...table,
      mappedColumnCount: mappings.reduce(
        (sum, mapping) => sum + (mapping.targetColumns?.length || 0),
        0,
      ),
      targetColumns: mappings.flatMap((mapping) => mapping.targetColumns || []),
    };
  });
  const missingExtractionCount = tables.filter((table) => table.status.startsWith('needs-')).length;
  const readyTableCount = tables.filter((table) => table.status === 'mapped').length;

  return {
    status: missingExtractionCount ? 'needs-extraction' : 'ready',
    tableCount: tables.length,
    readyTableCount,
    missingExtractionCount,
    tables,
    nextAction: missingExtractionCount
      ? 'Extract platform jobs into agent_jobs, agent_job_runs, and agent_job_events before SQL cutover.'
      : 'Agent queue storage tables are ready for SQL cutover.',
  };
}

function createDatabaseExtractionReadiness(migrationPlan = {}) {
  const tableStatus = new Map([
    ['organizations', { source: 'platform organizations', status: 'mapped', priority: 'P0' }],
    ['users', { source: 'APP_USERS', status: 'mapped', priority: 'P0' }],
    ['memberships', { source: 'organization.members', status: 'needs-extraction', priority: 'P0' }],
    ['projects', { source: 'project root', status: 'mapped', priority: 'P0' }],
    [
      'project_stage_confirmations',
      { source: 'project.stageConfirmations', status: 'needs-extraction', priority: 'P0' },
    ],
    ['workflow_events', { source: 'project.history[]', status: 'mapped', priority: 'P0' }],
    ['agent_jobs', { source: 'project.platformJobs[]', status: 'needs-extraction', priority: 'P1' }],
    [
      'agent_job_runs',
      {
        source: 'project.platformJobs[].runCount + lease fields',
        status: 'needs-extraction',
        priority: 'P1',
      },
    ],
    [
      'agent_job_events',
      {
        source: 'project.history[platform-job-*]',
        status: 'needs-filtered-extraction',
        priority: 'P1',
      },
    ],
    ['audit_logs', { source: 'project.history[]', status: 'mapped', priority: 'P0' }],
    ['deployment_environments', { source: 'deployment summary', status: 'planned', priority: 'P2' }],
    ['notifications', { source: 'notification summary', status: 'planned', priority: 'P1' }],
    ['cost_usage', { source: 'cost summary', status: 'planned', priority: 'P2' }],
  ]);
  const tables = DATABASE_TABLES.map((table) => {
    const extraction = tableStatus.get(table.name) || {
      source: 'unknown',
      status: 'planned',
      priority: 'P2',
    };
    const mappings = (migrationPlan.entityMappings || []).filter(
      (mapping) => mapping.targetTable === table.name,
    );

    return {
      tableName: table.name,
      source: extraction.source,
      status: extraction.status,
      priority: extraction.priority,
      mappedColumnCount: mappings.reduce(
        (sum, mapping) => sum + (mapping.targetColumns?.length || 0),
        0,
      ),
    };
  });

  return {
    totalTableCount: tables.length,
    mappedTableCount: tables.filter((table) => table.status === 'mapped').length,
    blockedTableCount: tables.filter((table) => table.status.startsWith('needs-')).length,
    plannedTableCount: tables.filter((table) => table.status === 'planned').length,
    tables,
  };
}

function hasTenantScopedTables() {
  return DATABASE_TABLES.some(
    (table) =>
      table.name === 'projects' &&
      table.columns.some((column) => column.name === 'organization_id'),
  );
}

function normalizeStorageProfile(storageProfile, migrationPlan) {
  return {
    mode: storageProfile.mode || migrationPlan.sourceMode,
    adapter: storageProfile.adapter || 'unknown-repository',
    targetEngine: storageProfile.targetEngine || migrationPlan.targetEngine,
    migrationStatus: storageProfile.migrationStatus || migrationPlan.status,
    supportsTransactions: Boolean(storageProfile.supportsTransactions),
    supportsConcurrentWrites: Boolean(storageProfile.supportsConcurrentWrites),
    contractMethods: Array.isArray(storageProfile.contractMethods)
      ? storageProfile.contractMethods
      : [],
    location: storageProfile.location || '',
  };
}

function method(name, table, purpose) {
  return { name, table, purpose };
}

function calculateDatabaseReadinessScore(profile) {
  let score = 58;
  if (profile.supportsTransactions) {
    score += 12;
  }
  if (profile.supportsConcurrentWrites) {
    score += 10;
  }
  if (profile.mode !== 'json-store') {
    score += 15;
  }
  return Math.min(95, score);
}

function createAgentJobs(projects, now) {
  return projects.flatMap((project) => {
    const jobs = (project.platformJobs || []).map((job) =>
      normalizePlatformJob(job, project, now),
    );
    if (project.agentExecutionPackage || project.developmentRun) {
      jobs.push(createJob(project, 'ai-development', 'AI 开发执行', project.developmentRun?.status || project.agentExecutionPackage?.status, now));
    }
    if (project.codeReviewReport) {
      jobs.push(createJob(project, 'code-review', '代码/安全/性能 Review', project.codeReviewReport.status, now));
    }
    if (project.qaRun) {
      jobs.push(createJob(project, 'qa-run', 'QA 自动测试', project.qaRun.status, now));
    }
    return jobs;
  });
}

function normalizePlatformJob(job, project, now) {
  const type = String(job?.type || 'ai-development').trim() || 'ai-development';
  const queuedAt = job?.queuedAt || now;

  return {
    id: job?.id || createPlatformJobId(project, type, queuedAt),
    projectId: project.id,
    projectName: project.name,
    organizationId: project.organizationId || DEFAULT_ORGANIZATION_ID,
    type,
    title: String(job?.title || PLATFORM_JOB_TITLES[type] || '后台任务').trim(),
    status: normalizeJobStatus(job?.status || 'queued'),
    rawStatus: job?.rawStatus || job?.status || 'queued',
    queuedAt,
    startedAt: job?.startedAt || '',
    finishedAt: job?.finishedAt || '',
    runCount: Number(job?.runCount || 0),
    lockedBy: String(job?.lockedBy || '').trim(),
    leaseStartedAt: job?.leaseStartedAt || '',
    leaseHeartbeatAt: job?.leaseHeartbeatAt || '',
    leaseExpiresAt: job?.leaseExpiresAt || '',
    executor: job?.executor || resolvePlatformJobExecutor(type, project),
    command: String(job?.command || '').trim(),
    requestedBy: job?.requestedBy || '',
    resultSummary: String(job?.resultSummary || '').trim(),
    errorSummary: String(job?.errorSummary || '').trim(),
    stdout: String(job?.stdout || '').trim(),
    stderr: String(job?.stderr || '').trim(),
    exitCode: Number.isInteger(job?.exitCode) ? job.exitCode : null,
    durationMs: Number.isFinite(job?.durationMs) ? job.durationMs : 0,
    details: normalizeJobDetails(job?.details),
    source: job?.source || 'platform-control',
  };
}

function createAgentRunLedger(projects = [], jobs = [], now = new Date().toISOString()) {
  const jobById = new Map(jobs.map((job) => [job.id, job]));
  const events = projects.flatMap((project) =>
    asArray(project.agentJobEvents).map((event) => normalizeAgentJobEvent(event, project)),
  );
  const rows = projects
    .flatMap((project) =>
      asArray(project.agentJobRuns).map((run) => {
        const job = jobById.get(run.jobId) || {};
        return normalizeAgentJobRun(run, project, job, events, now);
      }),
    )
    .sort((left, right) => String(right.updatedAt || '').localeCompare(String(left.updatedAt || '')));
  const terminalRunCount = rows.filter((run) => run.terminal).length;
  const activeRunCount = rows.filter((run) => run.status === 'running').length;
  const staleRunCount = rows.filter((run) => run.stale).length;

  return {
    totalRunCount: rows.length,
    totalEventCount: events.length,
    activeRunCount,
    terminalRunCount,
    staleRunCount,
    rows,
    nextAction: staleRunCount
      ? 'Reclaim stale worker runs before starting more AI coding tasks.'
      : rows.length
        ? 'Review active runs and terminal evidence before approving delivery gates.'
        : 'No agent job runs have been recorded yet.',
  };
}

function normalizeAgentJobRun(run = {}, project = {}, job = {}, events = [], now = new Date().toISOString()) {
  const relatedEvents = events
    .filter((event) => isEventWithinRun(event, run))
    .sort((left, right) => String(right.createdAt || '').localeCompare(String(left.createdAt || '')));
  const latestEvent = relatedEvents[0] || null;
  const status = normalizeAgentRunStatus(run.status || job.status || 'running');
  const workerId = String(run.workerId || job.lockedBy || '').trim();

  return {
    runId: String(run.id || '').trim(),
    jobId: String(run.jobId || job.id || '').trim(),
    projectId: project.id,
    projectName: project.name || '',
    title: job.title || run.title || 'Agent job run',
    type: job.type || run.type || 'ai-development',
    runNumber: Number(run.runNumber || 0) || Number(job.runCount || 0) || 1,
    status,
    workerId,
    leaseStartedAt: run.leaseStartedAt || '',
    leaseHeartbeatAt: run.leaseHeartbeatAt || '',
    leaseExpiresAt: run.leaseExpiresAt || '',
    startedAt: run.startedAt || '',
    finishedAt: run.finishedAt || '',
    durationMs: Number.isFinite(run.durationMs) ? run.durationMs : 0,
    exitCode: Number.isInteger(run.exitCode) ? run.exitCode : null,
    createdAt: run.createdAt || '',
    updatedAt: latestEvent?.createdAt || run.updatedAt || run.finishedAt || run.leaseHeartbeatAt || run.startedAt || '',
    terminal: isTerminalAgentRunStatus(status),
    stale: status === 'running' && Boolean(workerId) && isAgentRunLeaseExpired(run, now),
    eventCount: relatedEvents.length,
    latestEventType: latestEvent?.type || '',
    latestEventAt: latestEvent?.createdAt || '',
    latestEventWorkerId: latestEvent?.workerId || '',
    latestEventStatus: latestEvent?.jobStatus || '',
    lifecycle: relatedEvents.map((event) => ({
      eventId: event.id,
      type: event.type,
      workerId: event.workerId,
      jobStatus: event.jobStatus,
      createdAt: event.createdAt,
    })),
  };
}

function normalizeAgentJobEvent(event = {}, project = {}) {
  const payload = normalizeJobDetails(event.payload);
  return {
    id: String(event.id || '').trim(),
    projectId: project.id,
    projectName: project.name || '',
    jobId: String(event.jobId || payload.jobId || '').trim(),
    runId: String(event.runId || payload.runId || '').trim(),
    type: String(event.type || 'platform-job-event').trim(),
    workerId: String(event.workerId || payload.workerId || '').trim(),
    jobStatus: String(payload.jobStatus || event.jobStatus || '').trim(),
    createdAt: event.createdAt || event.at || '',
  };
}

function isEventWithinRun(event = {}, run = {}) {
  if (!event.jobId || event.jobId !== run.jobId) {
    return false;
  }
  if (event.runId) {
    return event.runId === run.id;
  }

  const eventAt = Date.parse(event.createdAt || '');
  const runStartedAt = Date.parse(run.startedAt || run.leaseStartedAt || run.createdAt || '');
  const runFinishedAt = Date.parse(run.finishedAt || '');
  if (Number.isFinite(eventAt) && Number.isFinite(runStartedAt) && eventAt < runStartedAt) {
    return false;
  }
  if (Number.isFinite(eventAt) && Number.isFinite(runFinishedAt) && eventAt > runFinishedAt) {
    return false;
  }
  return true;
}

function normalizeAgentRunStatus(status = '') {
  const value = String(status || '').trim();
  return value || 'running';
}

function isTerminalAgentRunStatus(status = '') {
  return ['failed', 'succeeded', 'cancelled', 'exhausted', 'reclaimed'].includes(status);
}

function isAgentRunLeaseExpired(run = {}, now = new Date().toISOString()) {
  const expiresAt = Date.parse(run.leaseExpiresAt || '');
  const current = Date.parse(now || '');
  return Number.isFinite(expiresAt) && Number.isFinite(current) && expiresAt <= current;
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeJobDetails(details = {}) {
  return details && typeof details === 'object' && !Array.isArray(details)
    ? { ...details }
    : {};
}

function shouldExhaustJob(jobId, project = {}) {
  const normalizedJobId = String(jobId || '').trim();
  const job = (project.platformJobs || []).find((item) => item.id === normalizedJobId);
  return Number(job?.runCount || 0) >= MAX_PLATFORM_JOB_RUNS;
}

function updatePlatformJob(project, jobId, { actor, now, historyType, update, note }) {
  const normalizedJobId = String(jobId || '').trim();
  if (!normalizedJobId) {
    throw new PlatformJobError('后台任务 ID 不能为空。', { jobId });
  }

  let changedJob = null;
  const platformJobs = (project.platformJobs || []).map((job) => {
    if (job.id !== normalizedJobId) {
      return job;
    }

    changedJob = update(job);
    return changedJob;
  });

  if (!changedJob) {
    throw new PlatformJobError('后台任务不存在。', { jobId: normalizedJobId });
  }

  const next = {
    ...project,
    updatedAt: now,
    platformJobs,
    history: [
      {
        type: historyType,
        actor,
        jobId: changedJob.id,
        jobStatus: changedJob.status,
        workerId: changedJob.lockedBy || '',
        leaseExpiresAt: changedJob.leaseExpiresAt || '',
        note: note(changedJob),
        at: now,
      },
      ...(project.history || []),
    ],
  };

  return applyQaDefectFixJobTransition(next, changedJob, { actor, now });
}

function applyQaDefectFixJobTransition(project, job, { actor, now } = {}) {
  if (!project.defectFixPackage || job.type !== 'qa-defect-fix') {
    return project;
  }

  if (job.status === 'succeeded') {
    return applySuccessfulQaDefectFixJobTransition(project, job, { actor, now });
  }

  const details = normalizeJobDetails(job.details);
  const baseSubmission = project.defectFixPackage.repairSubmission || {};
  const statusByJobStatus = {
    running: 'executing',
    queued: baseSubmission.status || 'ready',
    failed: 'blocked',
    exhausted: 'blocked',
    cancelled: 'blocked',
  };
  const submissionStatus = statusByJobStatus[job.status] || baseSubmission.status || 'blocked';
  const packageStatus =
    submissionStatus === 'review-ready'
      ? 'review-ready'
      : submissionStatus === 'executing'
        ? 'executing'
        : submissionStatus === 'blocked'
          ? 'blocked'
          : project.defectFixPackage.status;

  return {
    ...project,
    defectFixPackage: {
      ...project.defectFixPackage,
      status: packageStatus,
      repairSubmission: {
        ...baseSubmission,
        status: submissionStatus,
        jobId: job.id,
        jobStatus: job.status,
        jobQueuedAt: job.queuedAt || baseSubmission.jobQueuedAt || '',
        jobStartedAt: job.startedAt || baseSubmission.jobStartedAt || '',
        jobFinishedAt: job.finishedAt || baseSubmission.jobFinishedAt || '',
        jobUpdatedBy: actor,
        jobUpdatedAt: now,
        jobCommand: job.command || baseSubmission.jobCommand || '',
        jobExitCode: Number.isInteger(job.exitCode) ? job.exitCode : baseSubmission.jobExitCode,
        jobDurationMs: Number.isFinite(job.durationMs) ? job.durationMs : baseSubmission.jobDurationMs,
        jobResultSummary: job.resultSummary || baseSubmission.jobResultSummary || '',
        jobErrorSummary: job.errorSummary || baseSubmission.jobErrorSummary || '',
        jobStdout: job.stdout || baseSubmission.jobStdout || '',
        jobStderr: job.stderr || baseSubmission.jobStderr || '',
        sandboxPolicy: details.sandboxPolicy || baseSubmission.sandboxPolicy || '',
        blockedCommand: details.blockedCommand || baseSubmission.blockedCommand || '',
      },
    },
  };
}

function applySuccessfulQaDefectFixJobTransition(project, job, { actor, now } = {}) {
  const details = normalizeJobDetails(job.details);
  const baseSubmission = project.defectFixPackage.repairSubmission || {};
  const completedAt = job.finishedAt || job.updatedAt || now || new Date().toISOString();
  const startedAt = job.startedAt || job.queuedAt || completedAt;
  const commitHash = String(
    details.repairCommitHash ||
      details.commitHash ||
      baseSubmission.commitHash ||
      project.developmentRun?.commitHash ||
      '',
  ).trim();
  const filesChanged = normalizeStringList(
    details.filesChanged ||
      details.changedFiles ||
      baseSubmission.filesChanged ||
      project.developmentRun?.filesChanged ||
      details.repositoryAudit?.after?.changedFiles,
  );
  const checks = [
    {
      command: job.command || details.command || 'qa-defect-fix',
      status: Number.isInteger(job.exitCode) && job.exitCode !== 0 ? 'failed' : 'passed',
      result: job.resultSummary || 'QA defect fix job succeeded.',
      exitCode: Number.isInteger(job.exitCode) ? job.exitCode : 0,
      durationMs: Number.isFinite(job.durationMs) ? job.durationMs : undefined,
      startedAt,
      completedAt,
      stdout: job.stdout || '',
      stderr: job.stderr || '',
    },
  ];
  const taskResults = createQaDefectFixTaskResults(project, details, job);
  const developmentRun = {
    ...(project.developmentRun || {}),
    id: project.developmentRun?.id || `${job.id}-development-run`,
    mode: 'platform-job',
    status: 'completed',
    provider: job.executor || project.repositoryConfig?.executionMode || 'codex-local',
    actor,
    sourceStageId: DEVELOPMENT_STAGE_ID,
    repositorySnapshot: createPlatformRepositorySnapshot(project, details),
    startedAt,
    completedAt,
    summary: job.resultSummary || 'QA defect fix job completed successfully.',
    commitHash,
    filesChanged,
    repositoryAudit: details.repositoryAudit || project.developmentRun?.repositoryAudit || null,
    taskResults,
    checks,
    blockers: [],
    nextActions: ['Proceed to code, security, and performance review before QA retest.'],
  };
  developmentRun.changePackage = createDevelopmentChangePackage(developmentRun, {
    createdAt: completedAt,
  });

  const canStartReview =
    developmentRun.changePackage?.status === 'ready-for-review' &&
    developmentRun.changePackage?.reviewGate?.canStartReview === true;
  const repairSubmission = {
    ...baseSubmission,
    status: canStartReview ? 'reviewing' : 'review-ready',
    submittedAt: canStartReview ? completedAt : baseSubmission.submittedAt || '',
    submittedBy: canStartReview ? actor : baseSubmission.submittedBy || '',
    commitHash,
    filesChanged,
    sourceStageId: DEVELOPMENT_STAGE_ID,
    targetStageId: canStartReview ? REVIEW_STAGE_ID : DEVELOPMENT_STAGE_ID,
    requiredGates: ['code-review', 'qa-retest'],
    jobId: job.id,
    jobStatus: job.status,
    jobQueuedAt: job.queuedAt || baseSubmission.jobQueuedAt || '',
    jobStartedAt: job.startedAt || baseSubmission.jobStartedAt || '',
    jobFinishedAt: job.finishedAt || baseSubmission.jobFinishedAt || '',
    jobUpdatedBy: actor,
    jobUpdatedAt: now,
    jobCommand: job.command || baseSubmission.jobCommand || '',
    jobExitCode: Number.isInteger(job.exitCode) ? job.exitCode : baseSubmission.jobExitCode,
    jobDurationMs: Number.isFinite(job.durationMs) ? job.durationMs : baseSubmission.jobDurationMs,
    jobResultSummary: job.resultSummary || baseSubmission.jobResultSummary || '',
    jobErrorSummary: job.errorSummary || baseSubmission.jobErrorSummary || '',
    jobStdout: job.stdout || baseSubmission.jobStdout || '',
    jobStderr: job.stderr || baseSubmission.jobStderr || '',
    sandboxPolicy: details.sandboxPolicy || baseSubmission.sandboxPolicy || '',
    blockedCommand: details.blockedCommand || baseSubmission.blockedCommand || '',
  };
  const defectFixPackage = {
    ...project.defectFixPackage,
    status: canStartReview ? 'reviewing' : 'review-ready',
    sourceStageId: project.defectFixPackage.sourceStageId || QA_STAGE_ID,
    targetStageId: canStartReview ? REVIEW_STAGE_ID : DEVELOPMENT_STAGE_ID,
    repairSubmission,
  };
  const next = {
    ...project,
    currentStageId: canStartReview ? REVIEW_STAGE_ID : project.currentStageId,
    developmentPlan: project.developmentPlan
      ? {
          ...project.developmentPlan,
          status: 'done',
        }
      : project.developmentPlan,
    developmentRun,
    codeReviewReport: canStartReview ? null : project.codeReviewReport || null,
    defectFixPackage,
  };

  if (!canStartReview) {
    return next;
  }

  return {
    ...next,
    stages: updateStagesForQaDefectFixReview(next.stages),
    artifacts: {
      ...(next.artifacts || {}),
      [DEFECT_LOOP_STAGE_ID]: createQaDefectFixReviewArtifact(next, defectFixPackage, developmentRun),
    },
    history: [
      {
        type: 'qa-fix-submitted-for-review',
        from: DEVELOPMENT_STAGE_ID,
        to: REVIEW_STAGE_ID,
        actor,
        note: 'QA defect fix platform job succeeded and produced a review-ready change package.',
        at: completedAt,
        jobId: job.id,
        jobStatus: job.status,
      },
      ...(project.history || []),
    ],
  };
}

function createQaDefectFixTaskResults(project, details, job) {
  const tasks = Array.isArray(project.developmentPlan?.tasks) ? project.developmentPlan.tasks : [];
  if (tasks.length) {
    return tasks.map((task, index) => ({
      taskId: task.id || `qa-fix-${index + 1}`,
      title: task.title || `QA defect fix ${index + 1}`,
      area: task.area || 'QA defect fix',
      status: 'completed',
      result: job.resultSummary || 'Completed by the QA defect fix platform job.',
      acceptanceCriteria: Array.isArray(task.acceptanceCriteria) ? [...task.acceptanceCriteria] : [],
    }));
  }

  const fixes = normalizeStringList(details.requiredFixes || project.defectFixPackage?.requiredFixes);
  return (fixes.length ? fixes : ['QA defect fix']).map((fix, index) => ({
    taskId: `qa-fix-${index + 1}`,
    title: fix,
    area: 'QA defect fix',
    status: 'completed',
    result: job.resultSummary || 'Completed by the QA defect fix platform job.',
    acceptanceCriteria: normalizeStringList(details.regressionFocus || project.defectFixPackage?.regressionFocus),
  }));
}

function createPlatformRepositorySnapshot(project, details = {}) {
  const config = project.repositoryConfig || {};
  const snapshot = details.repositorySnapshot || {};
  return {
    status: snapshot.status || config.status || 'incomplete',
    repositoryUrl: snapshot.repositoryUrl || config.repositoryUrl || '',
    localPath: snapshot.localPath || config.localPath || '',
    baseBranch: snapshot.baseBranch || config.baseBranch || 'main',
    targetBranch: snapshot.targetBranch || config.targetBranch || '',
    executionMode: snapshot.executionMode || config.executionMode || 'codex-local',
    verificationCommands: normalizeStringList(
      snapshot.verificationCommands ||
        config.verificationCommands ||
        project.developmentPlan?.verificationCommands,
    ),
  };
}

function updateStagesForQaDefectFixReview(stages = []) {
  return Array.isArray(stages)
    ? stages.map((stage) => {
        if (stage.id === DEVELOPMENT_STAGE_ID) {
          return { ...stage, status: 'approved' };
        }
        if (stage.id === REVIEW_STAGE_ID) {
          return { ...stage, status: 'active' };
        }
        if (stage.id === QA_STAGE_ID) {
          return { ...stage, status: 'queued' };
        }
        return stage;
      })
    : [];
}

function createQaDefectFixReviewArtifact(project, defectFixPackage, developmentRun) {
  const fixes = normalizeStringList(defectFixPackage.requiredFixes);
  const files = normalizeStringList(developmentRun.filesChanged);
  return [
    `# QA Defect Fix Review Handoff: ${project.name || ''}`,
    '',
    `Status: ${defectFixPackage.status}`,
    `Commit: ${developmentRun.commitHash || 'not recorded'}`,
    `Summary: ${developmentRun.summary || 'not recorded'}`,
    '',
    '## Required Fixes',
    ...(fixes.length ? fixes.map((fix) => `- ${fix}`) : ['- Not recorded']),
    '',
    '## Changed Files',
    ...(files.length ? files.map((file) => `- ${file}`) : ['- Not recorded']),
    '',
    '## Verification',
    ...(developmentRun.checks || []).map((check) => `- ${check.command}: ${check.status}`),
  ].join('\n');
}

function normalizeStringList(items = []) {
  return Array.isArray(items) ? items.map((item) => String(item || '').trim()).filter(Boolean) : [];
}

function createPlatformJobId(project, type, queuedAt) {
  return `${project.id}-${type}-${String(queuedAt).replace(/[^0-9a-z]/gi, '')}`;
}

function resolvePlatformJobExecutor(type, project) {
  if (['ai-development', 'qa-defect-fix'].includes(type)) {
    return project.repositoryConfig?.executionMode || 'codex-local';
  }

  return 'local-rule';
}

function createJob(project, type, title, rawStatus, now) {
  return {
    id: `${project.id}-${type}`,
    projectId: project.id,
    projectName: project.name,
    organizationId: project.organizationId || DEFAULT_ORGANIZATION_ID,
    type,
    title,
    status: normalizeJobStatus(rawStatus),
    rawStatus: rawStatus || 'not-started',
    queuedAt: project.updatedAt || now,
    executor: ['ai-development', 'qa-defect-fix'].includes(type)
      ? project.repositoryConfig?.executionMode || 'codex-local'
      : 'local-rule',
  };
}

function normalizeJobStatus(status) {
  const value = String(status || '').trim();
  if (['completed', 'passed', 'ready', 'ready-for-review', 'succeeded'].includes(value)) {
    return 'succeeded';
  }
  if (['running'].includes(value)) {
    return 'running';
  }
  if (['cancelled', 'canceled'].includes(value)) {
    return 'cancelled';
  }
  if (['exhausted', 'retry-exhausted'].includes(value)) {
    return 'exhausted';
  }
  if (['blocked', 'failed', 'needs-work'].includes(value)) {
    return 'failed';
  }
  return 'queued';
}

function summarizeJobs(jobs, now) {
  return {
    totalJobs: jobs.length,
    queuedCount: jobs.filter((job) => job.status === 'queued').length,
    runningCount: jobs.filter((job) => job.status === 'running').length,
    lockedCount: jobs.filter((job) => job.status === 'running' && job.lockedBy).length,
    staleLeaseCount: jobs.filter((job) => isJobLeaseStale(job, now)).length,
    failedCount: jobs.filter((job) => job.status === 'failed').length,
    exhaustedCount: jobs.filter((job) => job.status === 'exhausted').length,
    cancelledCount: jobs.filter((job) => job.status === 'cancelled').length,
    succeededCount: jobs.filter((job) => job.status === 'succeeded').length,
  };
}

function createExecutionAuditSummary(jobs = [], now) {
  const terminalJobs = jobs.filter((job) => isTerminalJobStatus(job.status));
  const failedJobs = jobs.filter((job) => ['failed', 'exhausted'].includes(job.status));
  const retryCandidates = failedJobs
    .filter((job) => job.status === 'failed' && Number(job.runCount || 0) < MAX_PLATFORM_JOB_RUNS)
    .map((job) => createJobActionItem(job, {
      nextAction: 'Review job logs, fix the blocker, and rerun the platform job.',
    }));
  const exhaustedJobs = jobs
    .filter((job) => job.status === 'exhausted')
    .map((job) => createJobActionItem(job, {
      nextAction: 'Escalate to the technical owner before scheduling another run.',
    }));
  const cancelledJobs = jobs
    .filter((job) => job.status === 'cancelled')
    .map((job) => createJobActionItem(job, {
      nextAction: 'Confirm whether the cancelled job should stay closed or be queued again.',
    }));
  const latestBlocker = createLatestBlocker(failedJobs);
  const evidenceGaps = jobs
    .map((job) => ({
      job,
      missing: getJobEvidenceGaps(job),
    }))
    .filter((item) => item.missing.length)
    .map(({ job, missing }) => ({
      jobId: job.id,
      projectId: job.projectId,
      projectName: job.projectName,
      title: job.title,
      status: job.status,
      missing,
      nextAction: 'Persist stdout/stderr, result summary, and artifacts for audit review.',
    }));

  return {
    totalJobs: jobs.length,
    completedJobCount: terminalJobs.length,
    exhaustedCount: jobs.filter((job) => job.status === 'exhausted').length,
    cancelledCount: jobs.filter((job) => job.status === 'cancelled').length,
    retryableFailedCount: retryCandidates.length,
    missingEvidenceCount: evidenceGaps.length,
    evidenceCoveragePercent: calculateEvidenceCoveragePercent(terminalJobs, evidenceGaps),
    averageDurationMs: averageDuration(terminalJobs),
    evidenceTrail: createExecutionEvidenceTrail(terminalJobs),
    retryCandidates,
    exhaustedJobs,
    cancelledJobs,
    latestBlocker,
    actionGroups: createExecutionActionGroups({
      retryableCount: retryCandidates.length,
      exhaustedCount: exhaustedJobs.length,
      cancelledCount: cancelledJobs.length,
    }),
    evidenceGaps,
    executorHealth: createExecutorHealth(jobs),
    workerLeases: createWorkerLeaseSummary(jobs, now),
  };
}

function calculateEvidenceCoveragePercent(terminalJobs = [], evidenceGaps = []) {
  if (!terminalJobs.length) {
    return 100;
  }
  return Math.round(((terminalJobs.length - evidenceGaps.length) / terminalJobs.length) * 100);
}

function createWorkerLeaseSummary(jobs = [], now) {
  const runningJobs = jobs.filter((job) => job.status === 'running' && job.lockedBy);
  const staleJobs = runningJobs
    .filter((job) => isJobLeaseStale(job, now))
    .map((job) => ({
      jobId: job.id,
      projectId: job.projectId,
      projectName: job.projectName,
      title: job.title,
      workerId: job.lockedBy,
      leaseHeartbeatAt: job.leaseHeartbeatAt || '',
      leaseExpiredAt: job.leaseExpiresAt || '',
      nextAction: 'Reclaim or fail this stale platform job from the queue controls.',
    }));
  const activeJobs = runningJobs
    .filter((job) => !isJobLeaseStale(job, now))
    .map((job) => ({
      jobId: job.id,
      projectId: job.projectId,
      projectName: job.projectName,
      title: job.title,
      workerId: job.lockedBy,
      leaseHeartbeatAt: job.leaseHeartbeatAt || '',
      leaseExpiresAt: job.leaseExpiresAt || '',
    }));

  return {
    activeCount: activeJobs.length,
    staleCount: staleJobs.length,
    activeJobs,
    staleJobs,
    nextAction: staleJobs.length
      ? 'Reclaim or fail stale platform jobs before starting new AI coding work.'
      : 'Worker leases are healthy.',
  };
}

function createExecutionEvidenceTrail(jobs = []) {
  return jobs
    .map((job) => {
      const missing = getJobEvidenceGaps(job);
      const details = job.details || {};
      return {
        jobId: job.id,
        projectId: job.projectId,
        projectName: job.projectName,
        title: job.title,
        status: job.status,
        command: job.command || '',
        executor: job.executor || '',
        exitCode: Number.isInteger(job.exitCode) ? job.exitCode : null,
        durationMs: Number.isFinite(job.durationMs) ? job.durationMs : calculateDurationMs(job.startedAt, job.finishedAt),
        summary: job.resultSummary || job.errorSummary || details.cancelReason || '',
        stdoutExcerpt: excerptJobLog(job.stdout),
        stderrExcerpt: excerptJobLog(job.stderr),
        sandboxPolicy: details.sandboxPolicy || '',
        blockedCommand: details.blockedCommand || '',
        evidenceComplete: missing.length === 0,
        missing,
        updatedAt: getJobAuditTime(job),
      };
    })
    .sort((left, right) => String(right.updatedAt || '').localeCompare(String(left.updatedAt || '')));
}

function excerptJobLog(value = '', maxLength = 160) {
  const text = String(value || '').trim();
  if (text.length <= maxLength) {
    return text;
  }
  return `${text.slice(0, maxLength - 1)}…`;
}

function addMilliseconds(timestamp, durationMs) {
  const start = Date.parse(timestamp || '');
  const duration = Number(durationMs || 0);
  if (!Number.isFinite(start) || !Number.isFinite(duration) || duration <= 0) {
    return timestamp || new Date().toISOString();
  }
  return new Date(start + duration).toISOString();
}

function normalizeWorkerId(workerId = '') {
  return String(workerId || '').trim() || 'local-runner';
}

function assertWorkerLeaseOwner(job = {}, { jobId = '', workerId = '', now = new Date().toISOString() } = {}) {
  const normalizedWorkerId = normalizeWorkerId(workerId);
  if (!job.lockedBy) {
    throw new PlatformJobError('Platform job does not have a worker lease.', {
      jobId,
      workerId: normalizedWorkerId,
      status: job.status || '',
    });
  }
  if (job.lockedBy !== normalizedWorkerId) {
    throw new PlatformJobError('Platform job worker lease owner mismatch.', {
      jobId,
      lockedBy: job.lockedBy || '',
      workerId: normalizedWorkerId,
      leaseExpiresAt: job.leaseExpiresAt || '',
      status: job.status || '',
    });
  }
  if (isJobLeaseExpired(job, now)) {
    throw new PlatformJobError('Platform job worker lease has expired.', {
      jobId,
      workerId: normalizedWorkerId,
      leaseExpiresAt: job.leaseExpiresAt || '',
      status: job.status || '',
    });
  }
}

function isJobLeaseExpired(job = {}, now = new Date().toISOString()) {
  const expiresAt = Date.parse(job.leaseExpiresAt || '');
  const current = Date.parse(now || '');
  return Number.isFinite(expiresAt) && Number.isFinite(current) && expiresAt <= current;
}

function isJobLeaseStale(job = {}, now = new Date().toISOString()) {
  return job.status === 'running' && Boolean(job.lockedBy) && isJobLeaseExpired(job, now);
}

function isTerminalJobStatus(status) {
  return ['failed', 'succeeded', 'cancelled', 'exhausted'].includes(status);
}

function createJobActionItem(job = {}, { nextAction = '' } = {}) {
  const details = job.details || {};
  return {
    jobId: job.id,
    projectId: job.projectId,
    projectName: job.projectName,
    title: job.title,
    status: job.status,
    executor: job.executor,
    runCount: Number(job.runCount || 0),
    reason: job.errorSummary || job.resultSummary || 'Platform job failed without a detailed reason.',
    sandboxPolicy: details.sandboxPolicy || '',
    blockedCommand: details.blockedCommand || '',
    cancelReason: details.cancelReason || '',
    updatedAt: getJobAuditTime(job),
    nextAction,
  };
}

function createLatestBlocker(jobs = []) {
  const blockers = jobs
    .filter((job) => ['failed', 'exhausted'].includes(job.status))
    .map((job) => createJobActionItem(job, {
      nextAction: job.status === 'exhausted'
        ? 'Escalate to the technical owner before scheduling another run.'
        : 'Review job logs, fix the blocker, and rerun the platform job.',
    }))
    .sort((left, right) => String(right.updatedAt || '').localeCompare(String(left.updatedAt || '')));

  return blockers[0] || null;
}

function createExecutionActionGroups({ retryableCount = 0, exhaustedCount = 0, cancelledCount = 0 } = {}) {
  return [
    {
      id: 'retryable',
      title: 'Retryable failed jobs',
      count: retryableCount,
      nextAction: 'Fix blockers and retry eligible jobs from the cockpit.',
    },
    {
      id: 'exhausted',
      title: 'Retry attempts exhausted',
      count: exhaustedCount,
      nextAction: 'Escalate exhausted jobs to the technical owner.',
    },
    {
      id: 'cancelled',
      title: 'Cancelled jobs',
      count: cancelledCount,
      nextAction: 'Review cancellations and decide whether to queue replacement jobs.',
    },
  ];
}

function getJobAuditTime(job = {}) {
  return job.finishedAt || job.startedAt || job.retryQueuedAt || job.queuedAt || '';
}

function getJobEvidenceGaps(job = {}) {
  if (job.status === 'cancelled') {
    return [];
  }
  const hasStructuredEvidence = Boolean(
    job.details?.sandboxPolicy ||
      job.details?.blockedCommand ||
      job.details?.cancelReason,
  );
  const missing = [];
  if (!hasStructuredEvidence && !job.stdout && !job.stderr) {
    missing.push('stdout/stderr');
  }
  if (!hasStructuredEvidence && !job.resultSummary) {
    missing.push('result summary');
  }
  if (job.status === 'failed' && !job.errorSummary) {
    missing.push('error summary');
  }
  return missing;
}

function createExecutorHealth(jobs = []) {
  const byExecutor = new Map();
  jobs.forEach((job) => {
    const executor = job.executor || 'unknown';
    const group = byExecutor.get(executor) || [];
    group.push(job);
    byExecutor.set(executor, group);
  });

  return [...byExecutor.entries()]
    .map(([executor, executorJobs]) => ({
      executor,
      totalJobs: executorJobs.length,
      failedCount: executorJobs.filter((job) => ['failed', 'exhausted'].includes(job.status)).length,
      succeededCount: executorJobs.filter((job) => job.status === 'succeeded').length,
      averageDurationMs: averageDuration(
        executorJobs.filter((job) => isTerminalJobStatus(job.status)),
      ),
    }))
    .sort((left, right) => {
      if (left.failedCount !== right.failedCount) {
        return right.failedCount - left.failedCount;
      }
      return left.executor.localeCompare(right.executor);
    });
}

function averageDuration(jobs = []) {
  const durations = jobs
    .map((job) => Number(job.durationMs) || calculateDurationMs(job.startedAt, job.finishedAt))
    .filter((duration) => duration > 0);
  if (!durations.length) {
    return 0;
  }
  return Math.round(durations.reduce((sum, duration) => sum + duration, 0) / durations.length);
}

function calculateDurationMs(startedAt, finishedAt) {
  const started = Date.parse(startedAt || '');
  const finished = Date.parse(finishedAt || '');
  if (!Number.isFinite(started) || !Number.isFinite(finished) || finished <= started) {
    return 0;
  }
  return finished - started;
}

function createSandboxSummary(projects) {
  const allowedCommands = [
    ...new Set(
      projects.flatMap((project) =>
        Array.isArray(project.repositoryConfig?.verificationCommands)
          ? project.repositoryConfig.verificationCommands
          : [],
      ),
    ),
  ];

  return {
    mode: 'local-runner',
    isolation: 'planned-sandbox',
    allowedCommands,
    guardrails: [
      '只允许在已配置仓库路径内执行开发与检查命令。',
      '目标分支必须先完成诊断和准备。',
      '任务结果需要进入审计日志和验收证据。',
    ],
    gaps: [
      '尚未接入容器沙箱、资源限额和命令白名单执行器。',
      '尚未持久化 stdout/stderr 原始日志和 artifact 存储。',
    ],
  };
}

function createAuditLog(projects) {
  return projects
    .flatMap((project) =>
      (project.history || []).map((event, index) => ({
        ...event,
        id: event.id || `${project.id}-${event.at || index}-${event.type || 'event'}`,
        projectId: project.id,
        projectName: project.name,
        organizationId: project.organizationId || DEFAULT_ORGANIZATION_ID,
        type: event.type || 'event',
        category: event.category || auditCategoryForType(event.type || 'event'),
        severity: event.severity || auditSeverityForType(event.type || 'event'),
        actor: event.actor || '系统',
        actorUserId: event.actorUserId || '',
        auditReason: event.auditReason || '',
        jobId: event.jobId || '',
        jobStatus: event.jobStatus || '',
        note: event.note || '',
        at: event.at || project.updatedAt || '',
      })),
    )
    .sort((left, right) => String(right.at).localeCompare(String(left.at)))
    .slice(0, 10);
}

function createAuditSummary(events = []) {
  const highSeverityCount = events.filter((event) => event.severity === 'high').length;
  return {
    totalEvents: events.length,
    highSeverityCount,
    actorCount: new Set(events.map((event) => event.actor).filter(Boolean)).size,
    projectCount: new Set(events.map((event) => event.projectId).filter(Boolean)).size,
    latestAt: events[0]?.at || '',
    categories: countAuditValues(events, 'category').map((item) => ({
      id: item.value,
      label: auditCategoryLabel(item.value),
      count: item.count,
    })),
    actors: countAuditValues(events, 'actor').map((item) => ({
      actor: item.value,
      count: item.count,
    })),
    projects: countAuditProjects(events),
    types: countAuditValues(events, 'type').map((item) => ({
      type: item.value,
      count: item.count,
    })),
    exportManifest: createAuditExportManifest(events, highSeverityCount),
  };
}

function createAuditExportManifest(events = [], highSeverityCount = 0) {
  const organizationId = events[0]?.organizationId || DEFAULT_ORGANIZATION_ID;
  const latestDate = String(events[0]?.at || new Date().toISOString()).slice(0, 10);
  const securityCount = events.filter(
    (event) => event.category === 'security' || event.type === 'authorization-denied',
  ).length;

  return {
    format: 'jsonl',
    recordCount: events.length,
    highSeverityCount,
    projectCount: new Set(events.map((event) => event.projectId).filter(Boolean)).size,
    latestAt: events[0]?.at || '',
    filename: `wee-coder-audit-${organizationId}-${latestDate}.jsonl`,
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
      { id: 'all', label: 'All events', count: events.length },
      { id: 'high', label: 'High severity', count: highSeverityCount },
      { id: 'security', label: 'Security events', count: securityCount },
    ],
  };
}

function createSecurityAuditSummary(events = []) {
  const securityEvents = events.filter(
    (event) => event.type === 'authorization-denied' || event.category === 'security',
  );

  return {
    totalEvents: securityEvents.length,
    denialCount: securityEvents.filter((event) => event.type === 'authorization-denied').length,
    highSeverityCount: securityEvents.filter((event) => event.severity === 'high').length,
    latestAt: securityEvents[0]?.at || '',
    projects: countAuditProjects(securityEvents),
    roles: countSecurityAuditRoles(securityEvents),
    actions: countAuditValues(securityEvents, 'actionId').map((item) => ({
      actionId: item.value,
      count: item.count,
    })),
  };
}

function countAuditValues(events, key) {
  const counts = new Map();
  events.forEach((event) => {
    const value = String(event[key] || '').trim();
    if (!value) {
      return;
    }
    counts.set(value, (counts.get(value) || 0) + 1);
  });

  return [...counts.entries()].map(([value, count]) => ({ value, count }));
}

function countAuditProjects(events) {
  const counts = new Map();
  events.forEach((event) => {
    if (!event.projectId) {
      return;
    }
    const existing = counts.get(event.projectId) || {
      projectId: event.projectId,
      projectName: event.projectName,
      count: 0,
    };
    existing.count += 1;
    counts.set(event.projectId, existing);
  });

  return [...counts.values()].sort((left, right) => {
    if (left.count !== right.count) {
      return right.count - left.count;
    }
    return String(left.projectName || '').localeCompare(String(right.projectName || ''));
  });
}

function countSecurityAuditRoles(events = []) {
  const counts = new Map();
  events.forEach((event) => {
    const roleLabel = String(event.roleLabel || event.actor || '').trim();
    if (!roleLabel) {
      return;
    }
    const existing = counts.get(roleLabel) || { roleLabel, count: 0 };
    existing.count += 1;
    counts.set(roleLabel, existing);
  });

  return [...counts.values()].sort((left, right) => {
    if (left.count !== right.count) {
      return right.count - left.count;
    }
    return String(left.roleLabel || '').localeCompare(String(right.roleLabel || ''));
  });
}

function auditCategoryForType(type) {
  const value = String(type || '').toLowerCase();
  if (value.includes('authorization-denied') || value.includes('security')) {
    return 'security';
  }
  if (value.includes('platform-job') || value.includes('ai-development')) {
    return 'ai-operations';
  }
  if (value.includes('code-review') || value.includes('review')) {
    return 'review';
  }
  if (value.includes('qa')) {
    return 'qa';
  }
  if (value.includes('prd') || value.includes('requirement')) {
    return 'requirements';
  }
  if (value.includes('repository') || value.includes('branch') || value.includes('deployment')) {
    return 'delivery-control';
  }
  return 'workflow';
}

function auditSeverityForType(type) {
  const value = String(type || '').toLowerCase();
  if (
    value.includes('authorization-denied') ||
    value.includes('failed') ||
    value.includes('rejected') ||
    value.includes('blocked') ||
    value.includes('needs-work') ||
    value.includes('error')
  ) {
    return 'high';
  }
  if (value.includes('queued') || value.includes('started') || value.includes('submitted')) {
    return 'medium';
  }
  return 'low';
}

function auditCategoryLabel(category) {
  const labels = {
    'ai-operations': 'AI operations',
    review: 'Review',
    qa: 'QA',
    requirements: 'Requirements',
    'delivery-control': 'Delivery control',
    security: 'Security',
    workflow: 'Workflow',
  };

  return labels[category] || category || 'Workflow';
}

function createCommandCenter(projects, jobs, sla, users) {
  const stageGateBlockers = projects
    .map((project) => createStageGateBlocker(project))
    .filter(Boolean);
  const stageGateProjectIds = new Set(stageGateBlockers.map((blocker) => blocker.projectId));
  const followupBlockers = projects
    .filter((project) => !stageGateProjectIds.has(project.id))
    .map((project) => createFollowupBlocker(project, sla, users))
    .filter(Boolean);
  const failedJobBlockers = jobs
    .filter((job) => job.status === 'failed')
    .map((job) => ({
      id: `failed-job-${job.id}`,
      type: 'failed-job',
      severity: 'high',
      projectId: job.projectId,
      projectName: job.projectName,
      organizationId: job.organizationId,
      stageId: '',
      stageName: '',
      jobId: job.id,
      jobType: job.type,
      title: `后台任务失败：${job.title}`,
      detail: `${job.executor || 'executor'} 返回 ${job.rawStatus || job.status}`,
      nextAction: '由技术负责人查看任务日志、补齐失败原因并重新进入对应阶段。',
    }));
  const blockers = [...stageGateBlockers, ...followupBlockers, ...failedJobBlockers].sort(
    compareCommandBlockers,
  );

  return {
    totalBlockers: blockers.length,
    stageGateProjectCount: stageGateBlockers.length,
    followupProjectCount: followupBlockers.length,
    failedJobCount: failedJobBlockers.length,
    highSeverityCount: blockers.filter((blocker) => blocker.severity === 'high').length,
    blockers: blockers.slice(0, 8),
  };
}

function createOwnerPortfolio(
  projects,
  { commandCenter = {}, cost = {}, projectHealth = {}, sla = {}, users = APP_USERS } = {},
) {
  const blockersByProject = groupByProjectId(commandCenter.blockers || []);
  const healthByProject = new Map(
    (projectHealth.projects || []).map((report) => [report.projectId, report]),
  );
  const slaByProject = new Map((sla.breaches || []).map((breach) => [breach.projectId, breach]));
  const costByProject = new Map(
    (cost.projects || []).map((projectCost) => [projectCost.projectId, projectCost]),
  );
  const rows = projects
    .map((project) => {
      const projectBlockers = blockersByProject.get(project.id) || [];
      const stageGateBlocker = projectBlockers.find((blocker) => blocker.type === 'stage-gate');
      const failedJobBlocker = projectBlockers.find((blocker) => blocker.type === 'failed-job');
      const health = healthByProject.get(project.id) || {};
      const breach = slaByProject.get(project.id) || null;
      const projectCost = costByProject.get(project.id) || {};
      const ownerRole = breach?.ownerRole || resolveSlaOwnerRole(project);
      const ownerUserId = breach?.ownerUserId || String(project.members?.[ownerRole] || '').trim();
      const ownerUser = findUserById(ownerUserId, users);
      const budgetStatus = projectCost.budgetStatus || 'no-budget';
      const healthLevel = health.level || 'healthy';
      const portfolioStatus = resolveOwnerPortfolioStatus({
        budgetStatus,
        healthLevel,
        hasStageGateBlocker: Boolean(stageGateBlocker),
        slaSeverity: breach?.severity || 'ok',
      });

      return {
        projectId: project.id,
        projectName: project.name,
        organizationId: project.organizationId || DEFAULT_ORGANIZATION_ID,
        stageId: project.currentStageId || '',
        stageName: getProjectStageName(project),
        ownerRole,
        ownerRoleLabel: getRoleLabel(ownerRole),
        ownerUserId,
        ownerName: breach?.ownerName || ownerUser?.name || '',
        healthLevel,
        healthScore: Number.isFinite(Number(health.score)) ? Number(health.score) : 100,
        healthReasonCount: (health.reasons || []).length,
        slaSeverity: breach?.severity || 'ok',
        slaOverdueHours: breach?.overdueHours || 0,
        costTotalEstimatedCny: projectCost.totalEstimatedCny || 0,
        budgetStatus,
        budgetDeltaCny: projectCost.budgetDeltaCny || 0,
        blocked: Boolean(stageGateBlocker),
        blockerCount: stageGateBlocker?.gateBlockerCount || stageGateBlocker?.openTaskCount || 0,
        openTaskCount: Number(project.openFollowupTaskCount || health.openTaskCount || 0),
        portfolioStatus,
        nextAction: resolveOwnerPortfolioNextAction({
          breach,
          failedJobBlocker,
          health,
          projectCost,
          stageGateBlocker,
        }),
      };
    })
    .sort(compareOwnerPortfolioRows);

  return {
    summary: createOwnerPortfolioSummary(rows),
    rows,
  };
}

function groupByProjectId(items = []) {
  const groups = new Map();
  items.forEach((item) => {
    const projectId = item.projectId || '';
    if (!projectId) {
      return;
    }
    const group = groups.get(projectId) || [];
    group.push(item);
    groups.set(projectId, group);
  });
  return groups;
}

function createOwnerPortfolioSummary(rows = []) {
  return {
    projectCount: rows.length,
    criticalProjectCount: rows.filter((row) => row.portfolioStatus === 'critical').length,
    warningProjectCount: rows.filter((row) => row.portfolioStatus === 'warning').length,
    healthyProjectCount: rows.filter((row) => row.portfolioStatus === 'healthy').length,
    blockedProjectCount: rows.filter((row) => row.blocked).length,
    overBudgetProjectCount: rows.filter((row) => row.budgetStatus === 'over-budget').length,
    nearBudgetProjectCount: rows.filter((row) => row.budgetStatus === 'near-budget').length,
  };
}

function resolveOwnerPortfolioStatus({
  budgetStatus = 'no-budget',
  hasStageGateBlocker = false,
  healthLevel = 'healthy',
  slaSeverity = 'ok',
} = {}) {
  if (
    hasStageGateBlocker ||
    healthLevel === 'critical' ||
    slaSeverity === 'critical' ||
    budgetStatus === 'over-budget'
  ) {
    return 'critical';
  }
  if (healthLevel === 'warning' || slaSeverity === 'warning' || budgetStatus === 'near-budget') {
    return 'warning';
  }
  return 'healthy';
}

function resolveOwnerPortfolioNextAction({
  breach = null,
  failedJobBlocker = null,
  health = {},
  projectCost = {},
  stageGateBlocker = null,
} = {}) {
  if (stageGateBlocker?.nextAction) {
    return stageGateBlocker.nextAction;
  }
  if (failedJobBlocker?.nextAction) {
    return failedJobBlocker.nextAction;
  }
  if (breach?.nextAction) {
    return breach.nextAction;
  }
  if (['over-budget', 'near-budget'].includes(projectCost.budgetStatus) && projectCost.nextAction) {
    return projectCost.nextAction;
  }
  if (health.nextAction) {
    return health.nextAction;
  }
  return 'Keep project moving through the current stage.';
}

function compareOwnerPortfolioRows(left, right) {
  const statusRank = { critical: 0, warning: 1, healthy: 2 };
  const statusDiff =
    (statusRank[left.portfolioStatus] ?? 3) - (statusRank[right.portfolioStatus] ?? 3);
  if (statusDiff) {
    return statusDiff;
  }
  if (left.blocked !== right.blocked) {
    return left.blocked ? -1 : 1;
  }
  if (left.slaOverdueHours !== right.slaOverdueHours) {
    return right.slaOverdueHours - left.slaOverdueHours;
  }
  if (left.healthScore !== right.healthScore) {
    return left.healthScore - right.healthScore;
  }
  return String(left.projectName || '').localeCompare(String(right.projectName || ''));
}

function createOwnerRoleFlow(projects = [], { ownerPortfolio = {}, users = APP_USERS } = {}) {
  const portfolioRows = Array.isArray(ownerPortfolio.rows) ? ownerPortfolio.rows : [];
  const rows = (portfolioRows.length ? portfolioRows : projects.map((project) => createOwnerRoleFlowFallbackRow(project, users)))
    .map(createOwnerRoleFlowRow)
    .sort(compareOwnerRoleFlowRows);
  const roleGroups = createOwnerRoleFlowGroups(rows);

  return {
    summary: createOwnerRoleFlowSummary(rows, roleGroups),
    roleGroups,
    rows,
  };
}

function createOwnerRoleFlowFallbackRow(project = {}, users = APP_USERS) {
  const ownerRole = resolveSlaOwnerRole(project);
  const ownerUserId = String(project.members?.[ownerRole] || '').trim();
  const ownerUser = findUserById(ownerUserId, users);

  return {
    projectId: project.id,
    projectName: project.name,
    organizationId: project.organizationId || DEFAULT_ORGANIZATION_ID,
    stageId: project.currentStageId || '',
    stageName: getProjectStageName(project),
    ownerRole,
    ownerUserId,
    ownerName: ownerUser?.name || '',
    blocked: project.stageGateReport?.status === 'blocked',
    blockerCount: Number(project.stageGateReport?.blockerCount || project.stageGateReport?.openTaskCount || 0),
    openTaskCount: Number(project.openFollowupTaskCount || 0),
    slaOverdueHours: 0,
    portfolioStatus: project.stageGateReport?.status === 'blocked' ? 'critical' : 'healthy',
    nextAction:
      project.stageGateReport?.requiredActions?.[0] ||
      'Keep project moving through the current stage.',
  };
}

function createOwnerRoleFlowRow(row = {}) {
  const role = row.ownerRole || 'owner';
  const openTaskCount = Math.max(0, Number(row.openTaskCount || 0));
  const blocked = Boolean(row.blocked);
  const bottleneckLevel = resolveOwnerRoleFlowLevel(row, openTaskCount, blocked);
  const staleHours = Math.max(0, Number(row.slaOverdueHours || 0));
  const escalationLevel = resolveOwnerRoleEscalationLevel(staleHours);

  return {
    projectId: row.projectId || '',
    projectName: row.projectName || '',
    organizationId: row.organizationId || DEFAULT_ORGANIZATION_ID,
    stageId: row.stageId || '',
    stageName: row.stageName || '',
    role,
    roleLabel: ownerRoleFlowLabel(role),
    ownerUserId: row.ownerUserId || '',
    ownerName: row.ownerName || '',
    blocked,
    blockerCount: Math.max(0, Number(row.blockerCount || 0)),
    openTaskCount,
    staleHours,
    escalationLevel,
    bottleneckLevel,
    nextAction: row.nextAction || 'Keep project moving through the current stage.',
  };
}

function resolveOwnerRoleFlowLevel(row = {}, openTaskCount = 0, blocked = false) {
  if (blocked || row.portfolioStatus === 'critical' || row.healthLevel === 'critical') {
    return 'critical';
  }
  if (openTaskCount || row.portfolioStatus === 'warning' || row.healthLevel === 'warning') {
    return 'warning';
  }
  return 'healthy';
}

function createOwnerRoleFlowGroups(rows = []) {
  const groups = new Map();
  rows.forEach((row) => {
    const role = row.role || 'owner';
    const group = groups.get(role) || {
      role,
      roleLabel: ownerRoleFlowLabel(role),
      projectCount: 0,
      blockedProjectCount: 0,
      openTaskCount: 0,
      criticalProjectCount: 0,
      warningProjectCount: 0,
      healthyProjectCount: 0,
      staleProjectCount: 0,
      escalatedProjectCount: 0,
      maxStaleHours: 0,
      escalationLevel: 'normal',
      bottleneckLevel: 'healthy',
      nextAction: '',
      projects: [],
    };

    group.projectCount += 1;
    group.blockedProjectCount += row.blocked ? 1 : 0;
    group.openTaskCount += row.openTaskCount || 0;
    group.criticalProjectCount += row.bottleneckLevel === 'critical' ? 1 : 0;
    group.warningProjectCount += row.bottleneckLevel === 'warning' ? 1 : 0;
    group.healthyProjectCount += row.bottleneckLevel === 'healthy' ? 1 : 0;
    group.staleProjectCount += row.staleHours > 0 ? 1 : 0;
    group.escalatedProjectCount += row.escalationLevel === 'escalated' ? 1 : 0;
    group.maxStaleHours = Math.max(group.maxStaleHours, row.staleHours || 0);
    group.projects.push(row);
    group.bottleneckLevel = resolveOwnerRoleGroupLevel(group);
    group.escalationLevel = resolveOwnerRoleGroupEscalationLevel(group);
    group.nextAction = selectOwnerRoleGroupNextAction(group);
    groups.set(role, group);
  });

  return [...groups.values()].sort(compareOwnerRoleFlowGroups);
}

function createOwnerRoleFlowSummary(rows = [], roleGroups = []) {
  const focusGroup = roleGroups[0] || null;

  return {
    projectCount: rows.length,
    roleCount: roleGroups.length,
    blockedProjectCount: rows.filter((row) => row.blocked).length,
    openTaskCount: rows.reduce((sum, row) => sum + Number(row.openTaskCount || 0), 0),
    criticalRoleCount: roleGroups.filter((group) => group.bottleneckLevel === 'critical').length,
    warningRoleCount: roleGroups.filter((group) => group.bottleneckLevel === 'warning').length,
    healthyRoleCount: roleGroups.filter((group) => group.bottleneckLevel === 'healthy').length,
    staleProjectCount: rows.filter((row) => row.staleHours > 0).length,
    escalatedRoleCount: roleGroups.filter((group) => group.escalationLevel === 'escalated').length,
    maxStaleHours: roleGroups.reduce((max, group) => Math.max(max, group.maxStaleHours || 0), 0),
    nextAction: focusGroup
      ? `Focus ${focusGroup.roleLabel}: ${focusGroup.blockedProjectCount} blocked ${pluralize(
          'project',
          focusGroup.blockedProjectCount,
        )} and ${focusGroup.openTaskCount} open ${pluralize('task', focusGroup.openTaskCount)}.`
      : 'No active role bottlenecks.',
    escalationNextAction: createOwnerRoleEscalationNextAction(roleGroups),
  };
}

function resolveOwnerRoleGroupLevel(group = {}) {
  if (group.criticalProjectCount || group.blockedProjectCount) {
    return 'critical';
  }
  if (group.warningProjectCount || group.openTaskCount) {
    return 'warning';
  }
  return 'healthy';
}

function selectOwnerRoleGroupNextAction(group = {}) {
  return (
    group.projects.find((project) => project.bottleneckLevel === 'critical')?.nextAction ||
    group.projects.find((project) => project.bottleneckLevel === 'warning')?.nextAction ||
    group.projects[0]?.nextAction ||
    'Keep project moving through the current stage.'
  );
}

function resolveOwnerRoleEscalationLevel(staleHours = 0) {
  if (staleHours >= 24) {
    return 'escalated';
  }
  if (staleHours > 0) {
    return 'watch';
  }
  return 'normal';
}

function resolveOwnerRoleGroupEscalationLevel(group = {}) {
  if (group.escalatedProjectCount) {
    return 'escalated';
  }
  if (group.staleProjectCount) {
    return 'watch';
  }
  return 'normal';
}

function createOwnerRoleEscalationNextAction(roleGroups = []) {
  const escalatedGroup = roleGroups.find((group) => group.escalationLevel === 'escalated');
  if (!escalatedGroup) {
    const watchGroup = roleGroups.find((group) => group.escalationLevel === 'watch');
    return watchGroup
      ? `Watch ${watchGroup.roleLabel}: ${watchGroup.staleProjectCount} stale ${pluralize(
          'project',
          watchGroup.staleProjectCount,
        )}.`
      : 'No role escalation required.';
  }

  const project = [...(escalatedGroup.projects || [])].sort(
    (left, right) => Number(right.staleHours || 0) - Number(left.staleHours || 0),
  )[0];
  return `Escalate ${escalatedGroup.roleLabel}: ${project?.projectName || 'project'} is overdue by ${
    escalatedGroup.maxStaleHours || 0
  } hours.`;
}

function compareOwnerRoleFlowGroups(left, right) {
  const escalationRank = { escalated: 0, watch: 1, normal: 2 };
  const escalationDiff =
    (escalationRank[left.escalationLevel] ?? 3) - (escalationRank[right.escalationLevel] ?? 3);
  if (escalationDiff) {
    return escalationDiff;
  }
  const levelRank = { critical: 0, warning: 1, healthy: 2 };
  const levelDiff =
    (levelRank[left.bottleneckLevel] ?? 3) - (levelRank[right.bottleneckLevel] ?? 3);
  if (levelDiff) {
    return levelDiff;
  }
  if (left.blockedProjectCount !== right.blockedProjectCount) {
    return right.blockedProjectCount - left.blockedProjectCount;
  }
  if (left.openTaskCount !== right.openTaskCount) {
    return right.openTaskCount - left.openTaskCount;
  }
  return String(left.roleLabel || '').localeCompare(String(right.roleLabel || ''));
}

function compareOwnerRoleFlowRows(left, right) {
  const escalationRank = { escalated: 0, watch: 1, normal: 2 };
  const escalationDiff =
    (escalationRank[left.escalationLevel] ?? 3) - (escalationRank[right.escalationLevel] ?? 3);
  if (escalationDiff) {
    return escalationDiff;
  }
  const levelRank = { critical: 0, warning: 1, healthy: 2 };
  const levelDiff =
    (levelRank[left.bottleneckLevel] ?? 3) - (levelRank[right.bottleneckLevel] ?? 3);
  if (levelDiff) {
    return levelDiff;
  }
  if (left.blocked !== right.blocked) {
    return left.blocked ? -1 : 1;
  }
  if (left.openTaskCount !== right.openTaskCount) {
    return right.openTaskCount - left.openTaskCount;
  }
  return String(left.projectName || '').localeCompare(String(right.projectName || ''));
}

function ownerRoleFlowLabel(role) {
  const labels = {
    owner: 'Owner',
    pm: 'PM',
    'tech-lead': 'Tech Lead',
    ops: 'Ops',
    'ai-dev': 'AI Dev',
    'local-runner': 'Local Runner',
    qa: 'QA',
  };
  return labels[role] || getRoleLabel(role);
}

function createOwnerEscalationState(projects = []) {
  const state = new Map();
  projects.forEach((project) => {
    Object.entries(project.ownerEscalations || {}).forEach(([messageId, record]) => {
      const normalizedId = String(record?.id || messageId || '').trim();
      if (!normalizedId) {
        return;
      }
      state.set(normalizedId, {
        ...record,
        id: normalizedId,
        projectId: project.id || record.projectId || '',
        projectName: project.name || record.projectName || '',
      });
    });

    (project.history || []).forEach((event) => {
      const messageId = String(event.escalationMessageId || '').trim();
      if (
        !messageId ||
        state.has(messageId) ||
        !['owner-escalation-sent', 'owner-escalation-acknowledged'].includes(event.type)
      ) {
        return;
      }
      state.set(messageId, {
        id: messageId,
        status: event.escalationStatus || 'sent',
        sentAt: event.at || '',
        sentBy: event.actor || '',
        sentByUserId: event.actorUserId || '',
        acknowledgedAt: event.escalationStatus === 'acknowledged' ? event.at || '' : '',
        acknowledgedBy: event.escalationStatus === 'acknowledged' ? event.actor || '' : '',
        acknowledgedByUserId: event.escalationStatus === 'acknowledged' ? event.actorUserId || '' : '',
        acknowledgementNote: event.escalationStatus === 'acknowledged' ? event.note || '' : '',
        role: event.role || '',
        roleLabel: event.roleLabel || '',
        recipientUserId: event.recipientUserId || '',
        recipientName: event.recipientName || '',
        projectId: project.id || '',
        projectName: project.name || '',
        subject: event.subject || '',
        body: event.body || '',
        note: event.note || '',
      });
    });
  });

  return state;
}

function createOwnerEscalationDigest(ownerRoleFlow = {}, { escalationState = new Map() } = {}) {
  const messages = (ownerRoleFlow.rows || [])
    .filter((row) => ['escalated', 'watch'].includes(row.escalationLevel))
    .map((row) => createOwnerEscalationMessage(row, escalationState))
    .sort(compareOwnerEscalationMessages);

  return {
    summary: createOwnerEscalationDigestSummary(messages),
    messages,
  };
}

function createOwnerEscalationMessage(row = {}, escalationState = new Map()) {
  const prefix = row.escalationLevel === 'escalated' ? 'Escalate' : 'Watch';
  const bodyAction = String(row.nextAction || 'Please update the handoff status.').trim();
  const messageId = `owner-escalation-${row.role || 'role'}-${row.projectId || 'project'}`;
  const sentState = escalationState.get(messageId);

  const message = {
    id: messageId,
    role: row.role || 'owner',
    roleLabel: row.roleLabel || ownerRoleFlowLabel(row.role || 'owner'),
    recipientUserId: row.ownerUserId || '',
    recipientName: row.ownerName || '',
    projectId: row.projectId || '',
    projectName: row.projectName || '',
    stageId: row.stageId || '',
    stageName: row.stageName || '',
    escalationLevel: row.escalationLevel || 'normal',
    overdueHours: row.staleHours || 0,
    channel: 'in-app',
    status: 'ready-to-send',
    subject: `${prefix} ${row.roleLabel || ownerRoleFlowLabel(row.role)} handoff: ${
      row.projectName || 'project'
    } overdue ${row.staleHours || 0}h`,
    body: `${row.roleLabel || ownerRoleFlowLabel(row.role)}: ${
      row.projectName || 'project'
    } is overdue by ${row.staleHours || 0}h. ${bodyAction}`,
  };

  if (!sentState || !isOwnerEscalationHandledStatus(sentState.status)) {
    return message;
  }

  return {
    ...message,
    status: sentState.status || 'sent',
    sentAt: sentState.sentAt || sentState.at || '',
    sentBy: sentState.sentBy || sentState.actor || '',
    sentByUserId: sentState.sentByUserId || sentState.actorUserId || '',
    acknowledgedAt: sentState.acknowledgedAt || '',
    acknowledgedBy: sentState.acknowledgedBy || '',
    acknowledgedByUserId: sentState.acknowledgedByUserId || '',
    acknowledgementNote: sentState.acknowledgementNote || '',
    note: sentState.note || '',
  };
}

function createOwnerEscalationDigestSummary(messages = []) {
  const escalatedMessageCount = messages.filter((message) => message.escalationLevel === 'escalated').length;
  const watchMessageCount = messages.filter((message) => message.escalationLevel === 'watch').length;
  const sentMessageCount = messages.filter((message) => message.status === 'sent').length;
  const acknowledgedMessageCount = messages.filter((message) => message.status === 'acknowledged').length;
  const handledMessageCount = messages.filter((message) =>
    isOwnerEscalationHandledStatus(message.status),
  ).length;
  const readyMessageCount = messages.length - handledMessageCount;
  const readyEscalatedMessageCount = messages.filter(
    (message) =>
      message.escalationLevel === 'escalated' && !isOwnerEscalationHandledStatus(message.status),
  ).length;
  const readyWatchMessageCount = messages.filter(
    (message) =>
      message.escalationLevel === 'watch' && !isOwnerEscalationHandledStatus(message.status),
  ).length;
  const recipientCount = new Set(messages.map((message) => message.recipientUserId || message.role).filter(Boolean)).size;

  return {
    messageCount: messages.length,
    escalatedMessageCount,
    watchMessageCount,
    sentMessageCount,
    acknowledgedMessageCount,
    readyMessageCount,
    recipientCount,
    nextAction: readyEscalatedMessageCount
      ? `Send ${readyEscalatedMessageCount} escalated role handoff ${pluralize(
          'message',
          readyEscalatedMessageCount,
        )} before the next delivery gate review.`
      : readyWatchMessageCount
        ? `Prepare ${readyWatchMessageCount} watch role handoff ${pluralize('message', readyWatchMessageCount)}.`
        : messages.length
          ? acknowledgedMessageCount
            ? 'All owner escalation messages have been handled.'
            : 'All owner escalation messages have been sent.'
          : 'No escalation messages are required.',
  };
}

function isOwnerEscalationHandledStatus(status = '') {
  return ['sent', 'acknowledged'].includes(status);
}

function compareOwnerEscalationMessages(left, right) {
  const levelRank = { escalated: 0, watch: 1, normal: 2 };
  const levelDiff =
    (levelRank[left.escalationLevel] ?? 3) - (levelRank[right.escalationLevel] ?? 3);
  if (levelDiff) {
    return levelDiff;
  }
  if (left.overdueHours !== right.overdueHours) {
    return right.overdueHours - left.overdueHours;
  }
  return String(left.projectName || '').localeCompare(String(right.projectName || ''));
}

function pluralize(label, count) {
  return Number(count) === 1 ? label : `${label}s`;
}

function createDeliveryClosureSummary(projects = []) {
  const rows = projects.map(createDeliveryClosureRow).sort(compareDeliveryClosureRows);
  const signedOffProjectCount = rows.filter((row) => row.status === 'signed-off').length;
  const readyForSignoffProjectCount = rows.filter((row) => row.status === 'ready-for-signoff').length;
  const qaReturnProjectCount = rows.filter((row) => row.status === 'qa-return').length;
  const blockedProjectCount = rows.filter((row) =>
    ['blocked', 'qa-return'].includes(row.status),
  ).length;

  return {
    summary: {
      projectCount: rows.length,
      signedOffProjectCount,
      readyForSignoffProjectCount,
      qaReturnProjectCount,
      blockedProjectCount,
      averageCompletionPercent: rows.length
        ? Math.round(rows.reduce((sum, row) => sum + row.completionPercent, 0) / rows.length)
        : 0,
    },
    rows,
  };
}

function createDeliveryClosureRow(project = {}) {
  const gates = DELIVERY_CLOSURE_GATES.map((gate) => createDeliveryClosureGate(project, gate));
  const completedGateCount = gates.filter((gate) => gate.status === 'complete').length;
  const missingGateIds = gates
    .filter((gate) => gate.status !== 'complete')
    .map((gate) => gate.id);
  const currentGate =
    gates.find((gate) => gate.status === 'blocked') ||
    gates.find((gate) => gate.status !== 'complete') ||
    gates[gates.length - 1];
  const status = resolveDeliveryClosureStatus(project, gates);

  return {
    projectId: project.id,
    projectName: project.name,
    organizationId: project.organizationId || DEFAULT_ORGANIZATION_ID,
    status,
    completionPercent: Math.round((completedGateCount / DELIVERY_CLOSURE_GATES.length) * 100),
    completedGateCount,
    totalGateCount: DELIVERY_CLOSURE_GATES.length,
    currentGateId: currentGate?.id || '',
    currentGateLabel: currentGate?.label || '',
    missingGateIds,
    nextAction: resolveDeliveryClosureNextAction(status, currentGate),
    gates,
  };
}

function createDeliveryClosureGate(project = {}, gate = {}) {
  const status = resolveDeliveryClosureGateStatus(project, gate.id);

  return {
    id: gate.id,
    label: gate.label,
    status,
  };
}

function resolveDeliveryClosureGateStatus(project = {}, gateId = '') {
  if (gateId === 'requirements') {
    if (project.requirementReview?.status === 'ready' || project.prdStatus === 'generated') {
      return 'complete';
    }
    return project.requirementReview?.status === 'needs-work' ? 'blocked' : 'missing';
  }
  if (gateId === 'prd') {
    return project.prdStatus === 'generated' || Boolean(project.artifacts?.['prd-approval'])
      ? 'complete'
      : 'missing';
  }
  if (gateId === 'development') {
    return project.developmentRun?.status === 'completed' ? 'complete' : 'missing';
  }
  if (gateId === 'review') {
    return project.codeReviewReport?.status === 'passed' ? 'complete' : 'missing';
  }
  if (gateId === 'qa') {
    if (project.qaRun?.status === 'passed' && project.qaEvidence?.status === 'ready') {
      return 'complete';
    }
    if (
      project.qaRun?.status === 'needs-work' ||
      project.qaRun?.defectRouting?.shouldReturnToDevelopment
    ) {
      return 'blocked';
    }
    return 'missing';
  }
  if (gateId === 'acceptance') {
    return project.acceptancePackage?.status === 'ready' ? 'complete' : 'missing';
  }
  if (gateId === 'signoff') {
    return project.acceptancePackage?.signoffStatus === 'signed-off' ? 'complete' : 'missing';
  }
  return 'missing';
}

function resolveDeliveryClosureStatus(project = {}, gates = []) {
  const signoffGate = gates.find((gate) => gate.id === 'signoff');
  const acceptanceGate = gates.find((gate) => gate.id === 'acceptance');
  const qaGate = gates.find((gate) => gate.id === 'qa');
  if (signoffGate?.status === 'complete') {
    return 'signed-off';
  }
  if (acceptanceGate?.status === 'complete') {
    return 'ready-for-signoff';
  }
  if (
    qaGate?.status === 'blocked' ||
    project.qaRun?.status === 'needs-work' ||
    project.qaRun?.defectRouting?.shouldReturnToDevelopment
  ) {
    return 'qa-return';
  }
  if (gates.some((gate) => gate.status === 'blocked')) {
    return 'blocked';
  }
  return 'in-progress';
}

function resolveDeliveryClosureNextAction(status = 'in-progress', currentGate = {}) {
  if (status === 'signed-off') {
    return 'Project is signed off. Archive evidence and monitor production readiness.';
  }
  if (status === 'ready-for-signoff') {
    return 'Owner should review the final acceptance package and sign off.';
  }
  if (status === 'qa-return') {
    return 'Route QA defects back to development and regenerate a fix plan.';
  }

  const actions = {
    requirements: 'Complete requirement review and PM follow-up answers before PRD approval.',
    prd: 'Generate and approve the PRD before technical handoff.',
    development: 'Complete the AI development run and verification checks.',
    review: 'Run code, security, and performance review before QA.',
    qa: 'Run QA, publish evidence, and close blocking defects.',
    acceptance: 'Generate the final acceptance package after QA passes.',
    signoff: 'Owner should sign off the final delivery package.',
  };

  return actions[currentGate?.id] || 'Continue the next delivery gate.';
}

function compareDeliveryClosureRows(left, right) {
  const statusRank = {
    'qa-return': 0,
    blocked: 1,
    'ready-for-signoff': 2,
    'in-progress': 3,
    'signed-off': 4,
  };
  const statusDiff = (statusRank[left.status] ?? 5) - (statusRank[right.status] ?? 5);
  if (statusDiff) {
    return statusDiff;
  }
  if (left.completionPercent !== right.completionPercent) {
    return left.completionPercent - right.completionPercent;
  }
  return String(left.projectName || '').localeCompare(String(right.projectName || ''));
}

function createStageGateBlocker(project) {
  const gate = project.stageGateReport;
  if (!gate || gate.status !== 'blocked') {
    return null;
  }

  const blockers = Array.isArray(gate.blockers) ? gate.blockers : [];
  const requiredActions = Array.isArray(gate.requiredActions) ? gate.requiredActions : [];
  const gateBlockerCount = Number(gate.blockerCount) || blockers.length || 1;
  const stageName = gate.stageName || getProjectStageName(project);

  return {
    id: `stage-gate-${project.id}-${gate.stageId || project.currentStageId || 'stage'}`,
    type: 'stage-gate',
    severity: 'high',
    projectId: project.id,
    projectName: project.name,
    organizationId: project.organizationId || DEFAULT_ORGANIZATION_ID,
    stageId: gate.stageId || project.currentStageId || '',
    stageName,
    title: `${stageName || 'Current stage'} blocked by ${gateBlockerCount} gate item(s)`,
    detail:
      blockers
        .map((blocker) => blocker.title)
        .filter(Boolean)
        .join(' · ') || 'Current stage gate is blocked.',
    nextAction: requiredActions[0] || blockers[0]?.requiredAction || 'Resolve the stage gate blockers.',
    openTaskCount: Number(gate.openTaskCount) || 0,
    gateBlockerCount,
    canAdvance: false,
  };
}

function createFollowupBlocker(project, sla, users) {
  const tasks = createProjectFollowupTasks(project, users);
  const openTaskCount = tasks.length || Number(project.openFollowupTaskCount || 0);
  if (!openTaskCount) {
    return null;
  }

  const breach = (sla.breaches || []).find((item) => item.projectId === project.id);
  const stageName = getProjectStageName(project);
  const targetRoles = uniqueValues([
    ...tasks.map((task) => task.targetRoleLabel),
    ...(project.followupTaskTargetRoleLabels || []),
  ]);
  const assignees = uniqueValues([
    ...tasks.map((task) => task.assigneeName),
    ...(project.followupTaskAssigneeNames || []),
  ]);
  const severity = breach || project.health !== 'on-track'
    ? 'high'
    : openTaskCount >= 3
      ? 'medium'
      : 'low';

  return {
    id: `followup-${project.id}-${project.currentStageId || 'stage'}`,
    type: 'followup',
    severity,
    projectId: project.id,
    projectName: project.name,
    organizationId: project.organizationId || DEFAULT_ORGANIZATION_ID,
    stageId: project.currentStageId || '',
    stageName,
    title: `${openTaskCount} 个阶段确认事项未补齐`,
    detail: targetRoles.length
      ? `卡在 ${targetRoles.join('、')}：${assignees.join('、') || '未指派'}`
      : '当前阶段仍有确认事项未补齐。',
    nextAction: assignees.length
      ? `请 ${assignees.join('、')} 补齐 ${stageName || '当前阶段'} 信息。`
      : '请负责人补齐当前阶段确认信息并重新推进。',
    openTaskCount,
    targetRoles,
    assignees,
    breachedSla: Boolean(breach),
    ageHours: breach?.ageHours || 0,
  };
}

function getProjectStageName(project) {
  return (
    project.currentStageName ||
    (project.stages || []).find((stage) => stage.id === project.currentStageId)?.name ||
    project.currentStageId ||
    ''
  );
}

function createProjectFollowupTasks(project, users) {
  const stageTasks = createStageConfirmationFollowupTasks(
    project,
    project.currentStageId,
    { users },
  );
  if (stageTasks.length) {
    return stageTasks;
  }

  return (project.followupTaskAssignments || []).flatMap((assignment) =>
    (assignment.tasks || []).map((task) => ({
      ...task,
      targetRoleLabel: task.targetRoleLabel || assignment.targetRoleLabel || '',
      assigneeName: task.assigneeName || assignment.assigneeName || '',
    })),
  );
}

function compareCommandBlockers(left, right) {
  const severityRank = { high: 0, medium: 1, low: 2 };
  const leftRank = severityRank[left.severity] ?? 3;
  const rightRank = severityRank[right.severity] ?? 3;
  if (leftRank !== rightRank) {
    return leftRank - rightRank;
  }

  if (left.type !== right.type) {
    return left.type === 'failed-job' ? -1 : 1;
  }

  return String(left.projectName || '').localeCompare(String(right.projectName || ''));
}

function createNotificationSummary(projects) {
  const generatedItems = projects.flatMap(createProjectNotificationItems).sort(compareNotifications);
  const acknowledgementMap = createNotificationAcknowledgementMap(projects);
  const items = generatedItems.filter((item) => !acknowledgementMap.has(item.id));
  const fallbackPendingItems = projects.reduce(
    (sum, project) => sum + (Number(project.openFollowupTaskCount) || 0),
    0,
  );
  const pendingItems = generatedItems.length ? items.length : fallbackPendingItems;
  const recentAcknowledgements = [...acknowledgementMap.values()]
    .sort((left, right) =>
      String(right.acknowledgedAt || '').localeCompare(String(left.acknowledgedAt || '')),
    )
    .slice(0, 5);

  return {
    channels: [
      { id: 'in-app', name: '站内通知', status: 'ready' },
      { id: 'feishu', name: '飞书', status: 'config-needed' },
      { id: 'wecom', name: '企业微信', status: 'config-needed' },
      { id: 'email', name: '邮件', status: 'config-needed' },
    ],
    pendingItems,
    urgentItems: items.filter((item) => item.severity === 'high').length,
    acknowledgedItems: acknowledgementMap.size,
    items: items.slice(0, 8),
    recentEvents: items.slice(0, 5).map((item) => ({
      projectId: item.projectId,
      projectName: item.projectName,
      title: item.title,
      severity: item.severity,
      audienceName: item.audienceName,
    })),
    recentAcknowledgements,
  };
}

function createNotificationActionCenter({ auditLog = [], jobs = [], projects = [], sla = {} } = {}) {
  const actionStateMap = createNotificationActionStateMap(projects);
  const generatedItems = [
    ...jobs
      .filter((job) => ['failed', 'exhausted'].includes(job.status))
      .map(createJobNotificationAction),
    ...auditLog
      .filter((event) => event.type === 'authorization-denied')
      .map(createSecurityNotificationAction),
    ...(sla.breaches || []).map(createSlaNotificationAction),
  ]
    .filter(Boolean)
    .map((item) => applyNotificationActionState(item, actionStateMap.get(item.id)))
    .filter((item) => item.status !== 'resolved');
  const generatedItemIds = new Set(generatedItems.map((item) => item.id));
  const storedItems = [...actionStateMap.values()]
    .filter((state) => state.status !== 'resolved' && !generatedItemIds.has(state.id))
    .map(createStoredNotificationAction);
  const items = [...generatedItems, ...storedItems]
    .sort(compareNotificationActions);
  const roleGroups = createNotificationActionRoleGroups(items);
  const highSeverityCount = items.filter((item) => item.severity === 'high').length;
  const actionStates = [...actionStateMap.values()];
  const recentUpdates = actionStates
    .sort((left, right) =>
      String(right.updatedAt || '').localeCompare(String(left.updatedAt || '')),
    )
    .slice(0, 5);
  const processingLedger = createNotificationActionProcessingLedger(auditLog);

  return {
    totalActionCount: items.length,
    highSeverityCount,
    acknowledgedActionCount: items.filter((item) => item.status === 'acknowledged').length,
    assignedActionCount: items.filter((item) => item.status === 'assigned').length,
    resolvedActionCount: actionStates.filter((item) => item.status === 'resolved').length,
    roleGroupCount: roleGroups.length,
    roleGroups,
    items: items.slice(0, 10),
    recentUpdates,
    processingLedger,
    nextAction: highSeverityCount
      ? 'Route high severity notification actions to the accountable roles before approving delivery gates.'
      : items.length
        ? 'Review notification actions by accountable role.'
        : 'No notification actions require routing.',
  };
}

function createNotificationActionProcessingLedger(auditLog = []) {
  const rows = auditLog
    .filter((event) => String(event.type || '').startsWith('notification-action-'))
    .map((event) => {
      const status = normalizeNotificationActionStatus(
        event.notificationStatus || String(event.type || '').replace('notification-action-', ''),
      );
      return {
        id: event.id,
        notificationId: event.notificationId || '',
        status,
        statusLabel: notificationActionStatusLabel(status),
        actor: event.actor || event.actorUserId || '',
        actorUserId: event.actorUserId || '',
        projectId: event.projectId || '',
        projectName: event.projectName || '',
        assigneeRole: event.assigneeRole || '',
        assigneeUserId: event.assigneeUserId || '',
        assigneeName: event.assigneeName || '',
        resolution: event.resolution || '',
        note: event.note || event.resolution || '',
        at: event.at || '',
      };
    })
    .sort((left, right) => String(right.at || '').localeCompare(String(left.at || '')));
  const actionGroups = createNotificationActionProcessingGroups(rows);

  return {
    totalEventCount: rows.length,
    actionCount: actionGroups.length,
    actorCount: new Set(rows.map((row) => row.actor).filter(Boolean)).size,
    acknowledgedCount: rows.filter((row) => row.status === 'acknowledged').length,
    assignedCount: rows.filter((row) => row.status === 'assigned').length,
    resolvedCount: rows.filter((row) => row.status === 'resolved').length,
    latestAt: rows[0]?.at || '',
    rows: rows.slice(0, 10),
    actionGroups,
  };
}

function createNotificationActionProcessingGroups(rows = []) {
  const groups = new Map();
  rows.forEach((row) => {
    const notificationId = row.notificationId || row.id || 'unknown-action';
    const group = groups.get(notificationId) || {
      notificationId,
      eventCount: 0,
      latestStatus: row.status,
      latestStatusLabel: row.statusLabel,
      latestActor: row.actor,
      latestAt: row.at,
      projectId: row.projectId,
      projectName: row.projectName,
    };

    group.eventCount += 1;
    if (!group.latestAt || String(row.at || '').localeCompare(String(group.latestAt || '')) > 0) {
      group.latestStatus = row.status;
      group.latestStatusLabel = row.statusLabel;
      group.latestActor = row.actor;
      group.latestAt = row.at;
    }
    groups.set(notificationId, group);
  });

  return [...groups.values()].sort((left, right) =>
    String(right.latestAt || '').localeCompare(String(left.latestAt || '')),
  );
}

function createNotificationActionStateMap(projects = []) {
  const states = new Map();
  projects.forEach((project) => {
    Object.values(project.notificationAcknowledgements || {}).forEach((state) => {
      const id = String(state?.id || '').trim();
      if (!id || !id.startsWith('notification-action-')) {
        return;
      }

      states.set(id, {
        ...state,
        id,
        status: normalizeNotificationActionStatus(state.status || 'acknowledged'),
        projectId: project.id,
        projectName: project.name,
        organizationId: project.organizationId || DEFAULT_ORGANIZATION_ID,
        updatedAt:
          state.updatedAt ||
          state.resolvedAt ||
          state.assignedAt ||
          state.acknowledgedAt ||
          project.updatedAt ||
          '',
      });
    });
  });
  return states;
}

function applyNotificationActionState(item, state) {
  if (!state) {
    return {
      ...item,
      status: 'open',
      statusLabel: 'Open',
    };
  }

  const targetRole = state.assigneeRole || item.targetRole || 'owner';
  return {
    ...item,
    status: state.status,
    statusLabel: notificationActionStatusLabel(state.status),
    targetRole,
    targetRoleLabel: state.assigneeRole ? getRoleLabel(targetRole) : item.targetRoleLabel,
    assigneeRole: state.assigneeRole || '',
    assigneeUserId: state.assigneeUserId || '',
    assigneeName: state.assigneeName || '',
    acknowledgedBy: state.acknowledgedBy || '',
    acknowledgedAt: state.acknowledgedAt || '',
    assignedBy: state.assignedBy || '',
    assignedAt: state.assignedAt || '',
    resolvedBy: state.resolvedBy || '',
    resolvedAt: state.resolvedAt || '',
    resolution: state.resolution || '',
    note: state.note || '',
    updatedAt: state.updatedAt || item.updatedAt || '',
  };
}

function createStoredNotificationAction(state = {}) {
  const targetRole = state.assigneeRole || 'owner';
  return {
    id: state.id,
    source: 'stored-action',
    severity: 'medium',
    targetRole,
    targetRoleLabel: getRoleLabel(targetRole),
    projectId: state.projectId || '',
    projectName: state.projectName || '',
    title: state.title || `Notification action ${state.id}`,
    detail: state.note || state.resolution || 'Notification action is waiting for resolution.',
    nextAction:
      state.status === 'assigned'
        ? 'Assigned owner should resolve or reroute this action.'
        : 'Review this acknowledged action and decide the next owner.',
    actionRef: state.id,
    status: state.status,
    statusLabel: notificationActionStatusLabel(state.status),
    assigneeRole: state.assigneeRole || '',
    assigneeUserId: state.assigneeUserId || '',
    assigneeName: state.assigneeName || '',
    acknowledgedBy: state.acknowledgedBy || '',
    acknowledgedAt: state.acknowledgedAt || '',
    assignedBy: state.assignedBy || '',
    assignedAt: state.assignedAt || '',
    resolvedBy: state.resolvedBy || '',
    resolvedAt: state.resolvedAt || '',
    resolution: state.resolution || '',
    note: state.note || '',
    updatedAt: state.updatedAt || '',
  };
}

function normalizeNotificationActionStatus(status) {
  const normalized = String(status || 'acknowledged').trim();
  return ['acknowledged', 'assigned', 'resolved'].includes(normalized)
    ? normalized
    : 'acknowledged';
}

function notificationActionStatusLabel(status) {
  const labels = {
    acknowledged: 'Acknowledged',
    assigned: 'Assigned',
    resolved: 'Resolved',
  };
  return labels[status] || 'Open';
}

function createJobNotificationAction(job = {}) {
  return {
    id: createNotificationId('notification-action', 'job', job.id),
    source: 'platform-job',
    severity: 'high',
    targetRole: 'tech-lead',
    targetRoleLabel: getRoleLabel('tech-lead'),
    projectId: job.projectId || '',
    projectName: job.projectName || '',
    title: `${job.title || 'Platform job'} ${job.status || 'failed'}`,
    detail: job.errorSummary || job.resultSummary || 'Platform job requires review.',
    nextAction: 'Tech lead should review failed job evidence and decide whether to retry or route a fix.',
    actionRef: job.id || '',
    updatedAt: getJobAuditTime(job),
  };
}

function createSecurityNotificationAction(event = {}) {
  return {
    id: createNotificationId('notification-action', 'security', event.id || event.actionId || event.at),
    source: 'security-audit',
    severity: event.severity === 'low' ? 'medium' : event.severity || 'high',
    targetRole: 'owner',
    targetRoleLabel: getRoleLabel('owner'),
    projectId: event.projectId || '',
    projectName: event.projectName || '',
    title: `Permission denied: ${event.actionId || event.type || 'action'}`,
    detail: event.reason || event.note || 'Permission denied.',
    nextAction: 'Owner should review the denied action, role assignment, and allowed roles.',
    actionRef: event.id || '',
    updatedAt: event.at || '',
  };
}

function createSlaNotificationAction(breach = {}) {
  return {
    id: createNotificationId('notification-action', 'sla', breach.projectId, breach.stageId),
    source: 'sla',
    severity: breach.severity === 'critical' ? 'high' : 'medium',
    targetRole: breach.ownerRole || 'owner',
    targetRoleLabel: breach.ownerRoleLabel || getRoleLabel(breach.ownerRole || 'owner'),
    projectId: breach.projectId || '',
    projectName: breach.projectName || '',
    title: `SLA breach: ${breach.stageName || breach.stageId || 'stage'}`,
    detail: `${breach.overdueHours || 0}h overdue.`,
    nextAction: breach.nextAction || 'Review SLA breach and update the unblock plan.',
    actionRef: breach.stageId || '',
    updatedAt: '',
  };
}

function createNotificationActionRoleGroups(items = []) {
  const groups = new Map();
  items.forEach((item) => {
    const key = item.targetRole || 'owner';
    const group = groups.get(key) || {
      targetRole: key,
      targetRoleLabel: item.targetRoleLabel || getRoleLabel(key),
      count: 0,
      highSeverityCount: 0,
      items: [],
    };

    group.count += 1;
    group.highSeverityCount += item.severity === 'high' ? 1 : 0;
    group.items.push(item);
    groups.set(key, group);
  });

  return [...groups.values()].sort((left, right) => {
    if (left.highSeverityCount !== right.highSeverityCount) {
      return right.highSeverityCount - left.highSeverityCount;
    }
    if (left.count !== right.count) {
      return right.count - left.count;
    }
    return left.targetRole.localeCompare(right.targetRole);
  });
}

function compareNotificationActions(left, right) {
  const severityRank = { high: 0, medium: 1, low: 2 };
  const severityDiff = (severityRank[left.severity] ?? 3) - (severityRank[right.severity] ?? 3);
  if (severityDiff) {
    return severityDiff;
  }

  return String(right.updatedAt || '').localeCompare(String(left.updatedAt || ''));
}

function createProjectNotificationItems(project) {
  const assignments = Array.isArray(project.followupTaskAssignments)
    ? project.followupTaskAssignments
    : [];
  const effectiveAssignments = assignments.length
    ? assignments
    : createNotificationAssignmentsFromFollowupTasks(createProjectFollowupTasks(project, APP_USERS));
  const assignmentItems = effectiveAssignments.flatMap((assignment) =>
    createAssignmentNotificationItems(project, assignment),
  );

  if (assignmentItems.length) {
    return assignmentItems;
  }

  const openTaskCount = Number(project.openFollowupTaskCount) || 0;
  if (!openTaskCount) {
    return [];
  }

  const stageId = project.currentStageId || '';
  const stageName = getProjectStageName(project);
  return [
    {
      id: createNotificationId('notification', project.id, stageId, 'unassigned'),
      severity: resolveNotificationSeverity(project, openTaskCount),
      audienceRole: '',
      audienceRoleLabel: (project.followupTaskTargetRoleLabels || [])[0] || '',
      audienceUserId: '',
      audienceName: (project.followupTaskAssigneeNames || [])[0] || 'Unassigned',
      projectId: project.id,
      projectName: project.name,
      organizationId: project.organizationId || DEFAULT_ORGANIZATION_ID,
      stageId,
      stageName,
      title: `${stageName || 'Current stage'} has ${openTaskCount} open task(s)`,
      nextAction: resolveNotificationNextAction(project),
      reason: resolveNotificationReason(project, openTaskCount),
      sourceTaskId: '',
      updatedAt: project.updatedAt || '',
    },
  ];
}

function createNotificationAcknowledgementMap(projects = []) {
  const acknowledgements = new Map();
  projects.forEach((project) => {
    Object.values(project.notificationAcknowledgements || {}).forEach((acknowledgement) => {
      const id = String(acknowledgement?.id || '').trim();
      if (!id || id.startsWith('notification-action-') || acknowledgement.status !== 'acknowledged') {
        return;
      }

      acknowledgements.set(id, {
        ...acknowledgement,
        id,
        projectId: project.id,
        projectName: project.name,
        organizationId: project.organizationId || DEFAULT_ORGANIZATION_ID,
      });
    });
  });
  return acknowledgements;
}

function createAssignmentNotificationItems(project, assignment) {
  const openTasks = (assignment.tasks || []).filter((task) => task.status !== 'resolved');
  const taskList = openTasks.length
    ? openTasks
    : Number(assignment.openTaskCount) > 0
      ? [
          {
            id: `${assignment.targetRole || 'role'}-${project.currentStageId || 'stage'}`,
            stageId: project.currentStageId,
            stageName: getProjectStageName(project),
            title: `${assignment.openTaskCount} open task(s)`,
            status: 'open',
          },
        ]
      : [];

  return taskList.map((task) => {
    const stageId = task.stageId || project.currentStageId || '';
    const stageName = task.stageName || getProjectStageName(project);
    const openTaskCount = Number(assignment.openTaskCount) || taskList.length || 1;

    return {
      id: createNotificationId(
        'notification',
        project.id,
        stageId,
        assignment.assigneeUserId || assignment.targetRole || 'unassigned',
        task.followupTaskId || task.id || task.itemId || 'task',
      ),
      severity: resolveNotificationSeverity(project, openTaskCount),
      audienceRole: assignment.targetRole || '',
      audienceRoleLabel: assignment.targetRoleLabel || '',
      audienceUserId: assignment.assigneeUserId || '',
      audienceName: assignment.assigneeName || 'Unassigned',
      projectId: project.id,
      projectName: project.name,
      organizationId: project.organizationId || DEFAULT_ORGANIZATION_ID,
      stageId,
      stageName,
      title: task.title || `${stageName || 'Current stage'} follow-up task`,
      nextAction: resolveNotificationNextAction(project, task),
      reason: resolveNotificationReason(project, openTaskCount),
      sourceTaskId: task.followupTaskId || task.id || '',
      updatedAt: task.updatedAt || project.updatedAt || '',
    };
  });
}

function createNotificationAssignmentsFromFollowupTasks(tasks = []) {
  const groups = new Map();
  tasks.forEach((task) => {
    if (task.status === 'resolved') {
      return;
    }

    const key = `${task.targetRole || ''}:${task.assigneeUserId || task.assigneeName || 'unassigned'}`;
    const group = groups.get(key) || {
      targetRole: task.targetRole || '',
      targetRoleLabel: task.targetRoleLabel || '',
      assigneeUserId: task.assigneeUserId || '',
      assigneeName: task.assigneeName || 'Unassigned',
      openTaskCount: 0,
      tasks: [],
    };

    group.openTaskCount += 1;
    group.tasks.push(task);
    groups.set(key, group);
  });

  return [...groups.values()];
}

function resolveNotificationSeverity(project, openTaskCount) {
  const stageRisk = project.stageRiskRegister?.[project.currentStageId] || {};
  if (project.stageGateReport?.status === 'blocked' || stageRisk.riskLevel === 'high') {
    return 'high';
  }
  if (Number(openTaskCount) >= 3 || stageRisk.riskLevel === 'medium') {
    return 'medium';
  }
  return 'low';
}

function resolveNotificationNextAction(project, task = {}) {
  const gateAction = Array.isArray(project.stageGateReport?.requiredActions)
    ? project.stageGateReport.requiredActions.find(Boolean)
    : '';
  return task.nextAction || gateAction || 'Resolve the assigned workflow task.';
}

function resolveNotificationReason(project, openTaskCount) {
  const gate = project.stageGateReport || {};
  if (gate.status === 'blocked') {
    return `Stage gate blocked by ${Number(gate.blockerCount) || 1} item(s).`;
  }
  return `${Number(openTaskCount) || 1} open follow-up task(s).`;
}

function compareNotifications(left, right) {
  const severityRank = { high: 0, medium: 1, low: 2 };
  const severityDiff = (severityRank[left.severity] ?? 3) - (severityRank[right.severity] ?? 3);
  if (severityDiff) {
    return severityDiff;
  }

  return String(right.updatedAt || '').localeCompare(String(left.updatedAt || ''));
}

function createNotificationId(...parts) {
  return parts
    .map((part) =>
      String(part || '')
        .trim()
        .replace(/[^0-9a-z-]+/gi, '-')
        .replace(/^-+|-+$/g, ''),
    )
    .filter(Boolean)
    .join('-');
}

function createLegacyNotificationSummary(projects) {
  const pendingItems = projects.reduce(
    (sum, project) => sum + (Number(project.openFollowupTaskCount) || 0),
    0,
  );

  return {
    channels: [
      { id: 'in-app', name: '站内通知', status: 'ready' },
      { id: 'feishu', name: '飞书', status: 'config-needed' },
      { id: 'wecom', name: '企业微信', status: 'config-needed' },
      { id: 'email', name: '邮件', status: 'config-needed' },
    ],
    pendingItems,
    recentEvents: projects
      .filter((project) => Number(project.openFollowupTaskCount) > 0)
      .map((project) => ({
        projectId: project.id,
        projectName: project.name,
        title: `${project.currentStageName || project.currentStageId} 有 ${project.openFollowupTaskCount} 个待办`,
      })),
  };
}

function createSlaSummary(projects, now) {
  const nowTime = Date.parse(now);
  const breaches = projects
    .map((project) => createSlaProjectStatus(project, nowTime, now))
    .filter((item) => item.breached)
    .sort(compareSlaBreaches);
  const criticalCount = breaches.filter((item) => item.severity === 'critical').length;
  const warningCount = breaches.filter((item) => item.severity === 'warning').length;

  return {
    breachedCount: breaches.length,
    criticalCount,
    warningCount,
    blockedFollowupCount: projects.reduce(
      (sum, project) => sum + (Number(project.openFollowupTaskCount) || 0),
      0,
    ),
    nextAction: createSlaNextAction({ criticalCount, warningCount: breaches.length - criticalCount }),
    breaches,
    ownerGroups: createSlaOwnerGroups(breaches),
    thresholds: { ...SLA_HOURS_BY_STAGE },
  };
}

function createSlaProjectStatus(project, nowTime, now) {
  const stageId = project.currentStageId || '';
  const thresholdHours = SLA_HOURS_BY_STAGE[stageId] || 48;
  const updatedTime = Date.parse(project.updatedAt || now);
  const ageHours = Number.isFinite(nowTime) && Number.isFinite(updatedTime)
    ? Math.max(0, Math.round((nowTime - updatedTime) / 36_000) / 100)
    : 0;
  const overdueHours = Math.max(0, Math.round((ageHours - thresholdHours) * 100) / 100);
  const ownerRole = resolveSlaOwnerRole(project);
  const ownerUserId = String(project.members?.[ownerRole] || '').trim();
  const ownerUser = findUserById(ownerUserId);

  return {
    projectId: project.id,
    projectName: project.name,
    organizationId: project.organizationId || DEFAULT_ORGANIZATION_ID,
    stageId,
    stageName: project.currentStageName || stageId,
    ownerRole,
    ownerRoleLabel: getRoleLabel(ownerRole),
    ownerUserId,
    ownerName: ownerUser?.name || '',
    ageHours,
    thresholdHours,
    overdueHours,
    severity: overdueHours >= 24 ? 'critical' : overdueHours > 0 ? 'warning' : 'ok',
    breached: ageHours > thresholdHours,
    nextAction: resolveSlaNextAction(project, ownerRole),
  };
}

function resolveSlaOwnerRole(project = {}) {
  return project.currentOwnerRole || SLA_OWNER_ROLE_BY_STAGE[project.currentStageId] || 'owner';
}

function resolveSlaNextAction(project = {}, ownerRole = 'owner') {
  const stageId = project.currentStageId || '';
  const actionByStage = {
    'pm-requirements': 'PM should resolve requirement blockers and update the PRD inputs.',
    'prd-approval': 'Owner should approve or return the PRD with explicit changes.',
    architecture: 'Tech lead should complete architecture and data design decisions.',
    'ops-requirements': 'Ops should complete environment handoff and update deployment readiness.',
    development: 'Developer should finish implementation or record the blocking issue.',
    review: 'Tech lead should finish code review or route fixes back to development.',
    qa: 'QA should publish verification evidence or route defects back to development.',
    acceptance: 'Owner should complete final acceptance or reopen the blocking stage.',
    'defect-loop': 'Developer should resolve QA defects and request a focused retest.',
  };

  return actionByStage[stageId] || `${getRoleLabel(ownerRole)} should update the unblock plan.`;
}

function createSlaNextAction({ criticalCount = 0, warningCount = 0 } = {}) {
  if (criticalCount) {
    return 'Escalate critical SLA breaches to the owner role and require an updated unblock plan.';
  }
  if (warningCount) {
    return 'Review warning SLA breaches and confirm the next owner action.';
  }
  return 'SLA is within configured thresholds.';
}

function createSlaOwnerGroups(breaches = []) {
  const groups = new Map();
  breaches.forEach((breach) => {
    const key = breach.ownerRole || 'owner';
    const group = groups.get(key) || {
      ownerRole: key,
      ownerRoleLabel: breach.ownerRoleLabel || getRoleLabel(key),
      ownerUserIds: [],
      breachCount: 0,
      criticalCount: 0,
      warningCount: 0,
      maxOverdueHours: 0,
      projects: [],
    };

    group.breachCount += 1;
    if (breach.severity === 'critical') {
      group.criticalCount += 1;
    }
    if (breach.severity === 'warning') {
      group.warningCount += 1;
    }
    if (breach.ownerUserId && !group.ownerUserIds.includes(breach.ownerUserId)) {
      group.ownerUserIds.push(breach.ownerUserId);
    }
    group.maxOverdueHours = Math.max(group.maxOverdueHours, breach.overdueHours || 0);
    group.projects.push({
      projectId: breach.projectId,
      projectName: breach.projectName,
      severity: breach.severity,
      overdueHours: breach.overdueHours,
    });
    groups.set(key, group);
  });

  return [...groups.values()].sort((left, right) => {
    if (left.criticalCount !== right.criticalCount) {
      return right.criticalCount - left.criticalCount;
    }
    if (left.breachCount !== right.breachCount) {
      return right.breachCount - left.breachCount;
    }
    return String(left.ownerRole || '').localeCompare(String(right.ownerRole || ''));
  });
}

function compareSlaBreaches(left, right) {
  const severityRank = { critical: 0, warning: 1, ok: 2 };
  const severityDiff = (severityRank[left.severity] ?? 3) - (severityRank[right.severity] ?? 3);
  if (severityDiff) {
    return severityDiff;
  }
  if (left.overdueHours !== right.overdueHours) {
    return right.overdueHours - left.overdueHours;
  }
  return String(left.projectName || '').localeCompare(String(right.projectName || ''));
}

function createCostSummary(projects, jobs = []) {
  const projectCosts = projects
    .map((project) => createProjectCostSummary(project, jobs))
    .sort((left, right) => {
      if (left.totalEstimatedCny !== right.totalEstimatedCny) {
        return right.totalEstimatedCny - left.totalEstimatedCny;
      }
      return String(left.projectName || '').localeCompare(String(right.projectName || ''));
    });
  const artifactCount = projectCosts.reduce(
    (sum, project) => sum + project.drivers.artifactCount,
    0,
  );
  const jobCount = projectCosts.reduce((sum, project) => sum + project.drivers.jobCount, 0);
  const checkCount = projectCosts.reduce(
    (sum, project) => sum + project.drivers.checkCount,
    0,
  );
  const waitingItemCount = projectCosts.reduce(
    (sum, project) => sum + project.drivers.waitingItemCount,
    0,
  );
  const deploymentEnvironmentCount = projectCosts.reduce(
    (sum, project) => sum + project.drivers.deploymentEnvironmentCount,
    0,
  );
  const aiEstimatedCny = roundMoney(
    projectCosts.reduce((sum, project) => sum + project.aiEstimatedCny, 0),
  );
  const runnerEstimatedCny = roundMoney(
    projectCosts.reduce((sum, project) => sum + project.runnerEstimatedCny, 0),
  );
  const waitingEstimatedCny = roundMoney(
    projectCosts.reduce((sum, project) => sum + project.waitingEstimatedCny, 0),
  );
  const deploymentEstimatedCny = roundMoney(
    projectCosts.reduce((sum, project) => sum + project.deploymentEstimatedCny, 0),
  );
  const totalEstimatedCny = roundMoney(
    aiEstimatedCny + runnerEstimatedCny + waitingEstimatedCny + deploymentEstimatedCny,
  );
  const budgetLimitCny = roundMoney(
    projectCosts.reduce((sum, project) => sum + Math.max(0, Number(project.budgetLimitCny || 0)), 0),
  );
  const overBudgetProjectCount = projectCosts.filter((project) => project.budgetStatus === 'over-budget').length;
  const nearBudgetProjectCount = projectCosts.filter((project) => project.budgetStatus === 'near-budget').length;
  const budgetRisks = projectCosts.filter((project) =>
    ['over-budget', 'near-budget'].includes(project.budgetStatus),
  );

  return {
    currency: 'CNY',
    aiEstimatedCny,
    runnerEstimatedCny,
    waitingEstimatedCny,
    deploymentEstimatedCny,
    totalEstimatedCny,
    budgetStatus: resolvePortfolioBudgetStatus({ overBudgetProjectCount, nearBudgetProjectCount }),
    budgetLimitCny,
    budgetDeltaCny: budgetLimitCny ? roundMoney(totalEstimatedCny - budgetLimitCny) : 0,
    nextAction: resolvePortfolioCostNextAction({ overBudgetProjectCount, nearBudgetProjectCount }),
    summary: {
      projectCount: projectCosts.length,
      jobCount,
      artifactCount,
      checkCount,
      waitingItemCount,
      deploymentEnvironmentCount,
      overBudgetProjectCount,
      nearBudgetProjectCount,
    },
    categories: [
      {
        id: 'ai',
        label: 'AI generation',
        estimatedCny: aiEstimatedCny,
        share: calculateCostShare(aiEstimatedCny, totalEstimatedCny),
        unitCount: artifactCount + jobCount,
      },
      {
        id: 'runner',
        label: 'Runner checks',
        estimatedCny: runnerEstimatedCny,
        share: calculateCostShare(runnerEstimatedCny, totalEstimatedCny),
        unitCount: checkCount,
      },
      {
        id: 'waiting',
        label: 'Waiting blockers',
        estimatedCny: waitingEstimatedCny,
        share: calculateCostShare(waitingEstimatedCny, totalEstimatedCny),
        unitCount: waitingItemCount,
      },
      {
        id: 'deployment',
        label: 'Deployment environments',
        estimatedCny: deploymentEstimatedCny,
        share: calculateCostShare(deploymentEstimatedCny, totalEstimatedCny),
        unitCount: deploymentEnvironmentCount,
      },
    ],
    projects: projectCosts,
    budgetRisks,
    drivers: [
      {
        id: 'artifacts',
        label: 'Generated artifacts',
        count: artifactCount,
        rateCny: COST_RATES_CNY.artifact,
      },
      {
        id: 'jobs',
        label: 'Platform jobs',
        count: jobCount,
        rateCny: COST_RATES_CNY.job,
      },
      {
        id: 'checks',
        label: 'Verification checks',
        count: checkCount,
        rateCny: COST_RATES_CNY.check,
      },
      {
        id: 'waiting',
        label: 'Open waiting items',
        count: waitingItemCount,
        rateCny: COST_RATES_CNY.waitingItem,
      },
      {
        id: 'deployment-environments',
        label: 'Deployment environments',
        count: deploymentEnvironmentCount,
        rateCny: 'tiered',
      },
    ],
    basis:
      'Prototype estimate based on generated artifacts, platform jobs, verification checks, open waiting items, and explicit deployment environments.',
  };
}

function createProjectCostSummary(project, jobs = []) {
  const artifactCount = Object.keys(project.artifacts || {}).length;
  const projectJobs = jobs.filter((job) => job.projectId === project.id);
  const jobCount = projectJobs.length;
  const checkCount = project.developmentRun?.checks?.length || 0;
  const waitingItemCount = Number(project.openFollowupTaskCount) || 0;
  const deploymentCost = calculateProjectDeploymentCost(project);
  const aiEstimatedCny = roundMoney(artifactCount * COST_RATES_CNY.artifact + jobCount * COST_RATES_CNY.job);
  const runnerEstimatedCny = roundMoney(checkCount * COST_RATES_CNY.check);
  const waitingEstimatedCny = roundMoney(waitingItemCount * COST_RATES_CNY.waitingItem);
  const deploymentEstimatedCny = deploymentCost.estimatedCny;
  const totalEstimatedCny = roundMoney(
    aiEstimatedCny + runnerEstimatedCny + waitingEstimatedCny + deploymentEstimatedCny,
  );
  const budgetLimitCny = Math.max(0, Number(project.costBudgetCny || project.budgetLimitCny || 0));
  const budgetStatus = resolveProjectBudgetStatus(totalEstimatedCny, budgetLimitCny);
  const budgetDeltaCny = budgetLimitCny ? roundMoney(totalEstimatedCny - budgetLimitCny) : 0;

  return {
    projectId: project.id,
    projectName: project.name,
    totalEstimatedCny,
    aiEstimatedCny,
    runnerEstimatedCny,
    waitingEstimatedCny,
    deploymentEstimatedCny,
    budgetLimitCny,
    budgetStatus,
    budgetDeltaCny,
    nextAction: resolveProjectCostNextAction({
      budgetStatus,
      deploymentEstimatedCny,
      waitingItemCount,
      failedJobCount: projectJobs.filter((job) => ['failed', 'exhausted'].includes(job.status)).length,
    }),
    drivers: {
      artifactCount,
      jobCount,
      checkCount,
      waitingItemCount,
      deploymentEnvironmentCount: deploymentCost.count,
    },
  };
}

function calculateProjectDeploymentCost(project = {}) {
  const environments = Object.values(project.deploymentEnvironments || {})
    .map((environment) => ({
      id: String(environment?.id || '').trim(),
      status: String(environment?.status || '').trim(),
    }))
    .filter((environment) => environment.id && environment.status !== 'planned');
  const estimatedCny = roundMoney(
    environments.reduce(
      (sum, environment) =>
        sum + Number(COST_RATES_CNY.deploymentEnvironment[environment.id] || 0),
      0,
    ),
  );

  return {
    count: environments.length,
    estimatedCny,
  };
}

function resolveProjectBudgetStatus(totalEstimatedCny, budgetLimitCny) {
  if (!budgetLimitCny) {
    return 'no-budget';
  }
  if (totalEstimatedCny > budgetLimitCny) {
    return 'over-budget';
  }
  if (totalEstimatedCny >= budgetLimitCny * 0.8) {
    return 'near-budget';
  }
  return 'within-budget';
}

function resolvePortfolioBudgetStatus({ overBudgetProjectCount = 0, nearBudgetProjectCount = 0 } = {}) {
  if (overBudgetProjectCount) {
    return 'over-budget';
  }
  if (nearBudgetProjectCount) {
    return 'near-budget';
  }
  return 'within-budget';
}

function resolvePortfolioCostNextAction({ overBudgetProjectCount = 0, nearBudgetProjectCount = 0 } = {}) {
  if (overBudgetProjectCount) {
    return 'Review over-budget projects and pause non-critical runner or deployment work.';
  }
  if (nearBudgetProjectCount) {
    return 'Review near-budget projects before queuing more AI or runner work.';
  }
  return 'Cost is within the current prototype budget guardrails.';
}

function resolveProjectCostNextAction({
  budgetStatus = 'no-budget',
  deploymentEstimatedCny = 0,
  waitingItemCount = 0,
  failedJobCount = 0,
} = {}) {
  if (budgetStatus === 'over-budget' && deploymentEstimatedCny > 0) {
    return 'Reduce deployment environments or review failed/repeated job runs.';
  }
  if (budgetStatus === 'over-budget') {
    return 'Pause non-critical AI and runner work until the owner reviews cost.';
  }
  if (budgetStatus === 'near-budget') {
    return 'Confirm owner approval before adding more AI runs or deployment environments.';
  }
  if (failedJobCount) {
    return 'Fix failed jobs before spending more runner time.';
  }
  if (waitingItemCount) {
    return 'Resolve waiting blockers to reduce coordination cost.';
  }
  return 'No immediate cost control action required.';
}

function calculateCostShare(value, total) {
  return total ? Math.round((Number(value || 0) / total) * 100) : 0;
}

function createLegacyCostSummary(projects, jobs) {
  const artifactCount = projects.reduce(
    (sum, project) => sum + Object.keys(project.artifacts || {}).length,
    0,
  );
  const checkCount = projects.reduce(
    (sum, project) => sum + (project.developmentRun?.checks?.length || 0),
    0,
  );
  const waitingItems = projects.reduce(
    (sum, project) => sum + (Number(project.openFollowupTaskCount) || 0),
    0,
  );
  const aiEstimatedCny = roundMoney(artifactCount * 0.4 + jobs.length * 0.6);
  const runnerEstimatedCny = roundMoney(checkCount * 0.25);
  const waitingEstimatedCny = roundMoney(waitingItems * 0.15);

  return {
    currency: 'CNY',
    aiEstimatedCny,
    runnerEstimatedCny,
    waitingEstimatedCny,
    totalEstimatedCny: roundMoney(aiEstimatedCny + runnerEstimatedCny + waitingEstimatedCny),
    basis: '原型估算：按产物数量、后台任务数量、检查命令数量和待办阻塞数量粗算。',
  };
}

function createDeploymentSummary(projects) {
  const opsHandoff = createOpsHandoffSummary(projects);
  const releaseGates = createReleaseGates(opsHandoff);
  const blockedGateCount = releaseGates.filter((gate) => gate.status === 'blocked').length;
  const readyGateCount = releaseGates.filter((gate) => gate.status === 'ready').length;
  const plannedGateCount = releaseGates.filter((gate) => gate.status === 'planned').length;
  const readiness = {
    status: blockedGateCount ? 'blocked' : plannedGateCount ? 'planned' : 'ready',
    score: Math.max(0, 100 - blockedGateCount * 20),
    blockedGateCount,
    readyGateCount,
    plannedGateCount,
    nextAction: blockedGateCount
      ? 'Resolve production release blockers before deployment.'
      : plannedGateCount
        ? 'Finish planned release controls before production deployment.'
        : 'Production release controls are ready.',
  };
  const productionBlockers = releaseGates
    .filter((gate) => gate.status !== 'ready')
    .map((gate) => gate.nextAction);
  const environments = createDeploymentEnvironments(projects, readiness, productionBlockers);

  return {
    readiness,
    environments,
    environmentReadiness: createEnvironmentReadinessSummary(environments),
    releaseGates,
    opsHandoff,
  };
}

function createDeploymentEnvironments(projects = [], readiness, productionBlockers = []) {
  const baseEnvironments = [
    {
      id: 'local',
      name: '本地开发',
      status: 'ready',
      projectCount: projects.length,
      version: 'commercial-skeleton-v0.2',
      nextAction: 'Use local environment for prototype validation.',
    },
    {
      id: 'staging',
      name: '预发环境',
      status: 'planned',
      projectCount: 0,
      version: '',
      nextAction: 'Provision staging after release gates are unblocked.',
    },
    {
      id: 'production',
      name: '生产环境',
      status: readiness.status === 'ready' ? 'planned' : 'blocked',
      projectCount: 0,
      version: '',
      blockers: productionBlockers,
      nextAction: readiness.nextAction,
    },
  ];
  const environmentRecords = collectDeploymentEnvironmentRecords(projects);

  return baseEnvironments.map((environment) => {
    const records = environmentRecords
      .filter((record) => record.id === environment.id)
      .sort((left, right) => String(right.updatedAt || '').localeCompare(String(left.updatedAt || '')));
    if (!records.length) {
      return environment;
    }

    const latest = records[0];
    return {
      ...environment,
      status: latest.status,
      projectCount: records.length,
      version: latest.version || environment.version,
      url: latest.url || '',
      evidence: latest.evidence || '',
      latestProjectId: latest.projectId,
      latestProjectName: latest.projectName,
      updatedAt: latest.updatedAt,
      updatedBy: latest.updatedBy,
      blockers: latest.status === 'blocked' ? latest.blockers || environment.blockers || [] : [],
      nextAction: createDeploymentEnvironmentNextAction(latest),
    };
  });
}

function collectDeploymentEnvironmentRecords(projects = []) {
  return projects.flatMap((project) =>
    Object.values(project.deploymentEnvironments || {}).map((environment) => ({
      ...normalizeDeploymentEnvironment(environment),
      projectId: project.id,
      projectName: project.name,
    })),
  );
}

function createEnvironmentReadinessSummary(environments = []) {
  const readyEnvironments = environments.filter((environment) => environment.status === 'ready');
  const latestReady = readyEnvironments
    .slice()
    .sort((left, right) => String(right.updatedAt || '').localeCompare(String(left.updatedAt || '')))[0];

  return {
    readyCount: readyEnvironments.length,
    blockedCount: environments.filter((environment) => environment.status === 'blocked').length,
    plannedCount: environments.filter((environment) => environment.status === 'planned').length,
    latestReadyEnvironmentId: latestReady?.id || '',
    latestReadyProjectName: latestReady?.latestProjectName || '',
  };
}

function createDeploymentEnvironmentNextAction(environment = {}) {
  if (environment.status === 'ready') {
    return environment.id === 'staging'
      ? 'Keep staging validation evidence current before production release.'
      : 'Keep environment readiness evidence current.';
  }
  if (environment.status === 'blocked') {
    return environment.evidence || 'Resolve environment blockers before release.';
  }
  return 'Complete environment readiness checks.';
}

function normalizeDeploymentEnvironment(environment = {}) {
  const id = String(environment.id || environment.environmentId || '').trim();
  if (!['local', 'staging', 'production'].includes(id)) {
    throw new PlatformJobError('Unsupported deployment environment.', { environmentId: id });
  }
  const status = normalizeDeploymentEnvironmentStatus(environment.status);

  return {
    id,
    status,
    version: String(environment.version || '').trim(),
    url: String(environment.url || '').trim(),
    evidence: String(environment.evidence || '').trim(),
    blockers: Array.isArray(environment.blockers) ? environment.blockers.map(String).filter(Boolean) : [],
    updatedAt: String(environment.updatedAt || '').trim(),
    updatedBy: String(environment.updatedBy || '').trim(),
  };
}

function normalizeDeploymentEnvironmentStatus(status) {
  const value = String(status || '').trim();
  return ['ready', 'blocked', 'planned'].includes(value) ? value : 'planned';
}

function createReleaseGates(opsHandoff) {
  return [
    {
      id: 'database',
      title: '正式数据库',
      status: 'blocked',
      ownerRole: 'owner',
      blockerCount: 1,
      evidence: 'Current persistence still uses local JSON storage.',
      nextAction: 'Move project, audit, task, and notification records out of local JSON storage.',
    },
    {
      id: 'queue',
      title: '后台任务队列',
      status: 'blocked',
      ownerRole: 'tech-lead',
      blockerCount: 1,
      evidence: 'AI coding jobs still run as local prototype tasks.',
      nextAction: 'Connect a durable job queue, sandbox runner, and artifact log store.',
    },
    {
      id: 'audit',
      title: '操作审计',
      status: 'ready',
      ownerRole: 'owner',
      blockerCount: 0,
      evidence: 'Audit events include category, severity, actor, project, and summary facets.',
      nextAction: 'Retain audit records in the future production database.',
    },
    {
      id: 'ops-handoff',
      title: '运维交接',
      status: opsHandoff.missingItemCount ? 'blocked' : 'ready',
      ownerRole: 'ops',
      blockerCount: opsHandoff.missingItemCount,
      evidence: `${opsHandoff.projectCount} project(s) checked for deployment handoff.`,
      nextAction: opsHandoff.missingItemCount
        ? `Complete ${opsHandoff.missingItemCount} ops handoff item(s).`
        : 'Ops handoff items are complete.',
    },
    {
      id: 'sla',
      title: 'SLA 告警',
      status: 'planned',
      ownerRole: 'ops',
      blockerCount: 0,
      evidence: 'SLA summary exists, external alert routing is not connected.',
      nextAction: 'Connect SLA alerts to the team notification channels.',
    },
  ];
}

function createOpsHandoffSummary(projects = []) {
  const items = projects.flatMap((project) => createProjectOpsHandoffItems(project));
  const missingItems = items.filter((item) => item.status !== 'ready');

  return {
    status: missingItems.length ? 'blocked' : 'ready',
    missingItemCount: missingItems.length,
    projectCount: new Set(items.map((item) => item.projectId)).size,
    items: missingItems.slice(0, 8),
  };
}

function createProjectOpsHandoffItems(project) {
  const stage = project.stageConfirmations?.['ops-requirements'];
  const missingItems = Array.isArray(stage?.missingItems) ? stage.missingItems : [];
  if (!missingItems.length) {
    return [];
  }

  return missingItems.map((item) => ({
    id: createNotificationId(project.id, item.id),
    projectId: project.id,
    projectName: project.name,
    stageId: 'ops-requirements',
    stageName: stage.stageName || 'Ops requirements',
    title: item.title || item.id,
    ownerRole: 'ops',
    status: 'missing',
    nextAction: `Ops must complete ${item.title || item.id}.`,
  }));
}

function createLegacyDeploymentSummary(projects) {
  const productionBlockers = [
    '未配置真实数据库迁移和备份策略。',
    '未接入后台任务队列、沙箱执行器和审计存储。',
    '未配置团队通知、SLA 告警和生产回滚流程。',
  ];

  return {
    environments: [
      {
        id: 'local',
        name: '本地开发',
        status: 'ready',
        projectCount: projects.length,
        version: 'commercial-skeleton-v0.2',
      },
      {
        id: 'staging',
        name: '预发环境',
        status: 'planned',
        projectCount: 0,
        version: '',
      },
      {
        id: 'production',
        name: '生产环境',
        status: 'blocked',
        projectCount: 0,
        version: '',
        blockers: productionBlockers,
      },
    ],
    releaseGates: [
      { id: 'database', title: '正式数据库', status: 'blocked' },
      { id: 'queue', title: '后台任务队列', status: 'blocked' },
      { id: 'audit', title: '操作审计', status: 'planned' },
      { id: 'sla', title: 'SLA 告警', status: 'planned' },
    ],
  };
}

function roundMoney(value) {
  return Math.round(value * 100) / 100;
}

function uniqueValues(values) {
  return [...new Set(values.map((value) => String(value || '').trim()).filter(Boolean))];
}
