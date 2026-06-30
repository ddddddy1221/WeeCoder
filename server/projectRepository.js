import { JsonProjectStore } from './store.js';

const DEFAULT_REPOSITORY_ORGANIZATION_ID = 'wee-coder-labs';

export const REPOSITORY_CONTRACT_METHODS = Object.freeze([
  'listProjects',
  'listProjectsByOrganization',
  'getProject',
  'getProjectByOrganization',
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
]);

export function createJsonProjectRepository(filePath) {
  return new ProjectRepository({
    adapter: new JsonProjectStore(filePath),
    storageProfile: {
      mode: 'json-store',
      adapter: 'JsonProjectStore',
      targetEngine: 'postgresql',
      migrationStatus: 'schema-ready',
      supportsTransactions: false,
      supportsConcurrentWrites: false,
      defaultOrganizationId: DEFAULT_REPOSITORY_ORGANIZATION_ID,
      location: filePath,
    },
  });
}

export class ProjectRepository {
  constructor({ adapter, storageProfile }) {
    this.adapter = adapter;
    this.storageProfile = {
      defaultOrganizationId: DEFAULT_REPOSITORY_ORGANIZATION_ID,
      ...storageProfile,
    };
  }

  listProjects() {
    return this.adapter.listProjects();
  }

  async listProjectsByOrganization(organizationId) {
    const requestedOrganizationId = requireOrganizationId(organizationId);
    const projects = await this.listProjects();
    return projects.filter(
      (project) => this.getProjectOrganizationId(project) === requestedOrganizationId,
    );
  }

  getProject(projectId) {
    return this.adapter.getProject(projectId);
  }

  async getProjectByOrganization(projectId, organizationId) {
    const requestedOrganizationId = requireOrganizationId(organizationId);
    const project = await this.getProject(projectId);
    if (!project || this.getProjectOrganizationId(project) !== requestedOrganizationId) {
      return null;
    }
    return project;
  }

  addProject(project) {
    return this.adapter.addProject(project);
  }

  async createProject(project, context = {}) {
    const writeContext = normalizeWriteContext(context);
    const created = {
      ...project,
      organizationId: project.organizationId || writeContext.organizationId,
      createdAt: project.createdAt || writeContext.now,
      updatedAt: writeContext.now,
      history: [
        createAuditEvent('project-created', { note: writeContext.auditReason }, writeContext),
        ...normalizeArray(project.history),
      ],
    };

    await this.addProject(created);
    return created;
  }

  updateProject(projectId, update) {
    return this.adapter.updateProject(projectId, update);
  }

  updateProjectWithAudit(projectId, update, context = {}) {
    const writeContext = normalizeWriteContext(context);
    return this.updateProject(projectId, async (project) => {
      this.assertProjectWriteAllowed(project, writeContext);
      const updated = typeof update === 'function' ? await update(project) : update;
      return enrichNewHistoryEvents(project, updated, writeContext);
    });
  }

  updateProjectStage(projectId, stageId, context = {}) {
    const writeContext = normalizeWriteContext(context);
    const nextStageId = String(stageId || '').trim();
    if (!nextStageId) {
      throw new Error('stageId is required');
    }

    return this.updateProject(projectId, (project) => {
      this.assertProjectWriteAllowed(project, writeContext);
      return {
        ...project,
        currentStageId: nextStageId,
        updatedAt: writeContext.now,
        history: [
          createAuditEvent(
            'project-stage-updated',
            {
              note: writeContext.auditReason,
              stageId: nextStageId,
            },
            writeContext,
          ),
          ...normalizeArray(project.history),
        ],
      };
    });
  }

  appendAuditEvent(projectId, event = {}, context = {}) {
    const writeContext = normalizeWriteContext(context);
    return this.updateProject(projectId, (project) => {
      this.assertProjectWriteAllowed(project, writeContext);
      return {
        ...project,
        updatedAt: writeContext.now,
        history: [
          createAuditEvent(event.type || 'audit-event', event, writeContext),
          ...normalizeArray(project.history),
        ],
      };
    });
  }

  createJob(projectId, job = {}, context = {}) {
    const writeContext = normalizeWriteContext(context);
    const jobId = String(job.id || '').trim();
    if (!jobId) {
      throw new Error('job.id is required');
    }

    return this.updateProject(projectId, (project) => {
      this.assertProjectWriteAllowed(project, writeContext);
      const normalizedJob = {
        ...job,
        id: jobId,
        organizationId: writeContext.organizationId,
        projectId,
        status: job.status || 'queued',
        queuedAt: job.queuedAt || writeContext.now,
        requestedBy: job.requestedBy || writeContext.actorId,
      };

      return {
        ...project,
        updatedAt: writeContext.now,
        platformJobs: [normalizedJob, ...normalizeArray(project.platformJobs)],
        history: [
          createAuditEvent(
            writeContext.historyType || 'repository-job-created',
            {
              ...writeContext.historyEvent,
              note: writeContext.historyEvent?.note || writeContext.auditReason,
              jobId,
              jobType: normalizedJob.type || '',
            },
            writeContext,
          ),
          ...normalizeArray(project.history),
        ],
      };
    });
  }

  updateJob(projectId, jobId, patch = {}, context = {}) {
    const writeContext = normalizeWriteContext(context);
    const requestedJobId = String(jobId || '').trim();
    if (!requestedJobId) {
      throw new Error('jobId is required');
    }

    return this.updateProject(projectId, (project) => {
      this.assertProjectWriteAllowed(project, writeContext);
      const platformJobs = normalizeArray(project.platformJobs).map((job) =>
        job.id === requestedJobId
          ? {
              ...job,
              ...patch,
              updatedAt: writeContext.now,
            }
          : job,
      );

      return {
        ...project,
        ...writeContext.projectPatch,
        updatedAt: writeContext.now,
        platformJobs,
        history: [
          ...createJobHistoryEvents(requestedJobId, patch, writeContext),
          ...normalizeArray(project.history),
        ],
      };
    });
  }

  async listJobsByStatus(organizationId, filters = {}) {
    const requestedOrganizationId = requireOrganizationId(organizationId);
    const requestedStatus = String(filters.status || '').trim();
    const requestedType = String(filters.type || '').trim();
    const projects = await this.listProjectsByOrganization(requestedOrganizationId);

    return projects.flatMap((project) =>
      normalizeArray(project.platformJobs)
        .filter((job) => !requestedStatus || job.status === requestedStatus)
        .filter((job) => !requestedType || job.type === requestedType)
        .map((job) => ({
          ...job,
          organizationId: this.getProjectOrganizationId(project),
          projectId: project.id,
          projectName: project.name || '',
        })),
    );
  }

  createJobRun(projectId, jobId, run = {}, context = {}) {
    const writeContext = normalizeWriteContext(context);
    const requestedJobId = String(jobId || '').trim();
    if (!requestedJobId) {
      throw new Error('jobId is required');
    }

    return this.updateProject(projectId, (project) => {
      this.assertProjectWriteAllowed(project, writeContext);
      const job = findProjectJob(project, requestedJobId);
      if (!job) {
        throw new Error('job not found');
      }

      const runNumber = Number.isFinite(run.runNumber) ? run.runNumber : Number(job.runCount || 0) || 1;
      const normalizedRun = {
        ...run,
        id: String(run.id || `${requestedJobId}-run-${runNumber}`).trim(),
        organizationId: writeContext.organizationId,
        projectId,
        jobId: requestedJobId,
        runNumber,
        workerId: String(run.workerId || '').trim(),
        status: String(run.status || job.status || 'running').trim(),
        leaseStartedAt: run.leaseStartedAt || '',
        leaseHeartbeatAt: run.leaseHeartbeatAt || '',
        leaseExpiresAt: run.leaseExpiresAt || '',
        startedAt: run.startedAt || '',
        finishedAt: run.finishedAt || '',
        durationMs: Number.isFinite(run.durationMs) ? run.durationMs : 0,
        exitCode: Number.isInteger(run.exitCode) ? run.exitCode : null,
        createdAt: run.createdAt || writeContext.now,
        updatedAt: writeContext.now,
      };

      return {
        ...project,
        updatedAt: writeContext.now,
        agentJobRuns: [normalizedRun, ...normalizeArray(project.agentJobRuns)],
        history: [
          createAuditEvent(
            'repository-job-run-created',
            {
              note: writeContext.auditReason,
              jobId: requestedJobId,
              jobRunId: normalizedRun.id,
              jobStatus: normalizedRun.status,
            },
            writeContext,
          ),
          ...normalizeArray(project.history),
        ],
      };
    });
  }

  updateJobRun(projectId, jobId, runId, patch = {}, context = {}) {
    const writeContext = normalizeWriteContext(context);
    const requestedJobId = String(jobId || '').trim();
    const requestedRunId = String(runId || '').trim();
    if (!requestedJobId) {
      throw new Error('jobId is required');
    }
    if (!requestedRunId) {
      throw new Error('runId is required');
    }

    return this.updateProject(projectId, (project) => {
      this.assertProjectWriteAllowed(project, writeContext);
      const job = findProjectJob(project, requestedJobId);
      if (!job) {
        throw new Error('job not found');
      }

      let changedRun = null;
      const agentJobRuns = normalizeArray(project.agentJobRuns).map((run) => {
        if (run.id !== requestedRunId || run.jobId !== requestedJobId) {
          return run;
        }

        changedRun = {
          ...run,
          ...patch,
          id: requestedRunId,
          organizationId: writeContext.organizationId,
          projectId,
          jobId: requestedJobId,
          updatedAt: writeContext.now,
        };
        return changedRun;
      });

      if (!changedRun) {
        throw new Error('job run not found');
      }

      return {
        ...project,
        updatedAt: writeContext.now,
        agentJobRuns,
        history: [
          createAuditEvent(
            'repository-job-run-updated',
            {
              note: writeContext.auditReason,
              jobId: requestedJobId,
              jobRunId: requestedRunId,
              jobStatus: changedRun.status || '',
            },
            writeContext,
          ),
          ...normalizeArray(project.history),
        ],
      };
    });
  }

  appendJobEvent(projectId, jobId, event = {}, context = {}) {
    const writeContext = normalizeWriteContext(context);
    const requestedJobId = String(jobId || '').trim();
    if (!requestedJobId) {
      throw new Error('jobId is required');
    }

    return this.updateProject(projectId, (project) => {
      this.assertProjectWriteAllowed(project, writeContext);
      const job = findProjectJob(project, requestedJobId);
      if (!job) {
        throw new Error('job not found');
      }

      const normalizedEvent = {
        id: String(event.id || `${requestedJobId}-event-${writeContext.now}`).trim(),
        organizationId: writeContext.organizationId,
        projectId,
        jobId: requestedJobId,
        type: String(event.type || 'platform-job-event').trim(),
        actorUserId: writeContext.actorId,
        workerId: String(event.workerId || '').trim(),
        payload:
          event.payload && typeof event.payload === 'object' && !Array.isArray(event.payload)
            ? { ...event.payload }
            : {},
        createdAt: event.createdAt || writeContext.now,
      };

      return {
        ...project,
        updatedAt: writeContext.now,
        agentJobEvents: [normalizedEvent, ...normalizeArray(project.agentJobEvents)],
        history: [
          createAuditEvent(
            normalizedEvent.type,
            {
              note: event.note || writeContext.auditReason,
              jobId: requestedJobId,
              jobEventId: normalizedEvent.id,
              jobStatus: normalizedEvent.payload?.jobStatus || '',
              workerId: normalizedEvent.workerId,
            },
            writeContext,
          ),
          ...normalizeArray(project.history),
        ],
      };
    });
  }

  async listNotifications(organizationId) {
    const projects = await this.listProjectsByOrganization(organizationId);
    return projects.flatMap((project) =>
      normalizeArray(project.notifications).map((notification) => ({
        ...notification,
        organizationId: this.getProjectOrganizationId(project),
        projectId: project.id,
        projectName: project.name || '',
      })),
    );
  }

  getStorageProfile() {
    return {
      ...this.storageProfile,
      contractMethods: [...REPOSITORY_CONTRACT_METHODS],
    };
  }

  getProjectOrganizationId(project) {
    return project.organizationId || this.storageProfile.defaultOrganizationId;
  }

  assertProjectWriteAllowed(project, context) {
    if (this.getProjectOrganizationId(project) !== context.organizationId) {
      throw new Error('project organization mismatch');
    }
  }
}

function normalizeWriteContext(context = {}) {
  const organizationId = requireOrganizationId(context.organizationId);
  const actorId = String(context.actorId || '').trim();
  const auditReason = String(context.auditReason || '').trim();
  if (!actorId) {
    throw new Error('actorId is required');
  }
  if (!auditReason) {
    throw new Error('auditReason is required');
  }

  return {
    organizationId,
    actorId,
    auditReason,
    historyType: String(context.historyType || '').trim(),
    historyEvent: context.historyEvent || {},
    historyEvents: Array.isArray(context.historyEvents) ? context.historyEvents : [],
    projectPatch:
      context.projectPatch && typeof context.projectPatch === 'object' && !Array.isArray(context.projectPatch)
        ? context.projectPatch
        : {},
    now: context.now || new Date().toISOString(),
  };
}

function requireOrganizationId(organizationId) {
  const value = String(organizationId || '').trim();
  if (!value) {
    throw new Error('organizationId is required');
  }
  return value;
}

function createAuditEvent(type, event = {}, context) {
  return {
    ...event,
    type,
    actorUserId: context.actorId,
    organizationId: context.organizationId,
    auditReason: context.auditReason,
    note: event.note || context.auditReason,
    at: context.now,
  };
}

function createJobHistoryEvents(jobId, patch = {}, context) {
  const explicitEvents = context.historyEvents.length
    ? context.historyEvents
    : [
        {
          ...context.historyEvent,
          type: context.historyType || 'repository-job-updated',
          note: context.historyEvent?.note || context.auditReason,
        },
      ];

  return explicitEvents.map((event) =>
    createAuditEvent(
      event.type || context.historyType || 'repository-job-updated',
      {
        ...event,
        note: event.note || context.auditReason,
        jobId: event.jobId || jobId,
        jobStatus: event.jobStatus || patch.status || '',
      },
      context,
    ),
  );
}

function findProjectJob(project = {}, jobId = '') {
  const requestedJobId = String(jobId || '').trim();
  return normalizeArray(project.platformJobs).find((job) => job.id === requestedJobId) || null;
}

function enrichNewHistoryEvents(beforeProject = {}, afterProject = {}, context) {
  const beforeHistory = normalizeArray(beforeProject.history);
  const afterHistory = normalizeArray(afterProject?.history);
  const newEventCount = Math.max(afterHistory.length - beforeHistory.length, 0);
  if (!newEventCount) {
    return afterProject;
  }

  return {
    ...afterProject,
    history: [
      ...afterHistory.slice(0, newEventCount).map((event) => ({
        ...event,
        actorUserId: event.actorUserId || context.actorId,
        organizationId: event.organizationId || context.organizationId,
        auditReason: event.auditReason || context.auditReason,
        at: event.at || context.now,
      })),
      ...afterHistory.slice(newEventCount),
    ],
  };
}

function normalizeArray(value) {
  return Array.isArray(value) ? value : [];
}
