import cors from 'cors';
import express from 'express';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  advanceProject,
  applyRequirementReview,
  answerRequirementQuestion,
  createProject,
  generateAcceptancePackageForProject,
  generateAgentExecutionPackageForProject,
  generateTechnicalHandoffForProject,
  generatePrdForProject,
  getCurrentStage,
  normalizeProject,
  recordBranchPreparationForProject,
  recordCodeReviewForProject,
  recordDevelopmentCheckResultsForProject,
  recordDevelopmentExecutionResultsForProject,
  recordQaEvidenceForProject,
  recordQaRunForProject,
  recordRepositoryBootstrapForProject,
  recordRepositoryInspectionForProject,
  recordYoloQaDetectionEventForProject,
  recordTaskCommentForProject,
  rejectProjectStage,
  reviewYoloQaDetectionEventForProject,
  routeQaDefectsToDevelopmentForProject,
  STAGE_IDS,
  STAGES,
  completeYoloQaSessionForProject,
  startDevelopmentRunForProject,
  startYoloQaSessionForProject,
  updateStageConfirmationForProject,
  updateProjectMembersForProject,
  updateRepositoryConfigForProject,
  WorkflowGateError,
} from '../src/shared/workflow.js';
import { ProjectRepository, createJsonProjectRepository } from './projectRepository.js';
import { loadLocalEnvFilesSync } from './localEnv.js';
import { createAiProvider } from './aiProvider.js';
import {
  authenticateDemoUser,
  createSessionToken,
  verifySessionToken,
} from './auth.js';
import { DevelopmentRunnerError, executeDevelopmentChecks } from './developmentRunner.js';
import { RepositoryInspectionError, inspectRepository } from './repositoryInspector.js';
import { BranchPreparationError, prepareRepositoryBranch } from './branchPreparer.js';
import { RepositoryBootstrapError, bootstrapRepository } from './repositoryBootstrapper.js';
import {
  LocalDevelopmentExecutionError,
  executeLocalDevelopmentTasks,
} from './localDevelopmentExecutor.js';
import { CodeReviewRunnerError, runCodeReview } from './codeReviewRunner.js';
import { QaRunnerError, runQa } from './qaRunner.js';
import {
  buildYoloMonitorConfig,
  createYoloMonitorClient,
  createYoloMonitorRouter,
  createYoloProjectRuntimeSummary,
} from './yoloMonitor.js';
import { executePlatformJob } from './platformJobExecutor.js';
import { canPerformProjectAction } from '../src/shared/authorization.js';
import { createRoleInbox } from '../src/shared/roleInbox.js';
import { createRoleWorkbench } from '../src/shared/roleWorkbench.js';
import { createProjectExecutionAudit } from '../src/shared/projectExecutionAudit.js';
import { createProjectAutomationPlan } from '../src/shared/projectAutomationPlan.js';
import { createDeliveryFlowRehearsal } from '../src/shared/deliveryFlowRehearsal.js';
import { createYoloDeliveryChain } from '../src/shared/yoloDeliveryChain.js';
import { createProjectResponsibilityMatrix } from '../src/shared/projectResponsibilityMatrix.js';
import { createDeliveryGateAudit, createStageGateReport } from '../src/shared/stageGate.js';
import { createProjectTaskLedger } from '../src/shared/taskLedger.js';
import { createProjectHealthReport } from '../src/shared/projectHealth.js';
import { APP_USERS, actorFromUser, findUserById, getDefaultUser } from '../src/shared/users.js';
import { isUserAssignedToProjectRole } from '../src/shared/projectMembers.js';
import {
  acknowledgeOwnerEscalationForProject,
  acknowledgeNotificationForProject,
  cancelPlatformJobForProject,
  DEFAULT_ORGANIZATION_ID,
  PlatformJobError,
  PlatformNotificationError,
  completePlatformJobForProject,
  createPlatformCockpit,
  createPlatformSession,
  failPlatformJobForProject,
  filterProjectsForSession,
  heartbeatPlatformJobForProject,
  isProjectVisibleToSession,
  queuePlatformJobForProject,
  reclaimPlatformJobForProject,
  retryPlatformJobForProject,
  sendOwnerEscalationForProject,
  startPlatformJobForProject,
  updateDeploymentEnvironmentForProject,
  updateNotificationActionForProject,
  withProjectOrganization,
} from '../src/shared/platform.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const defaultStorePath = join(__dirname, '..', 'data', 'projects.json');
loadLocalEnvFilesSync(join(__dirname, '..'));

export function createApp({
  repository,
  store,
  aiProvider = createAiProvider(),
  developmentRunner = executeDevelopmentChecks,
  repositoryInspector = inspectRepository,
  branchPreparer = prepareRepositoryBranch,
  repositoryBootstrapper = bootstrapRepository,
  developmentExecutor = executeLocalDevelopmentTasks,
  codeReviewRunner = runCodeReview,
  qaRunner = runQa,
  yoloMonitorConfig = buildYoloMonitorConfig(),
  yoloMonitorClient,
  yoloWorkerManager,
  platformJobRunner = executePlatformJob,
  requireAuthentication = isStrictAuthenticationEnvironment(),
} = {}) {
  const projectRepository =
    repository || (store ? createRepositoryFromStore(store) : createJsonProjectRepository(defaultStorePath));
  const effectiveYoloMonitorClient = yoloMonitorClient || createYoloMonitorClient(yoloMonitorConfig);
  const app = express();

  app.set('requireAuthentication', Boolean(requireAuthentication));
  app.set('projectRepository', projectRepository);

  app.use(cors());
  app.use(express.json());
  app.use('/api/yolo-monitor', createYoloMonitorRouter({
    config: yoloMonitorConfig,
    client: effectiveYoloMonitorClient,
    workerManager: yoloWorkerManager,
  }));

  app.get('/api/health', (req, res) => {
    res.json({ ok: true, service: 'wee-coder-delivery-console' });
  });

  app.get('/api/workflow', (req, res) => {
    res.json({ stages: STAGES });
  });

  app.get('/api/users', (req, res) => {
    res.json({ users: APP_USERS, currentUser: getDefaultUser() });
  });

  app.post('/api/auth/login', (req, res) => {
    try {
      const user = authenticateDemoUser(req.body, APP_USERS);
      if (!user) {
        res.status(401).json({ error: '账号或密码不正确。' });
        return;
      }

      const session = createRequestPlatformSession(req, user, {
        organizationId: String(req.body.organizationId || req.get('X-Organization-Id') || '').trim(),
      });

      res.json({
        token: createSessionToken(user),
        session,
      });
    } catch (error) {
      sendWorkflowError(error, res, () => {
        res.status(500).json({ error: error.message });
      });
    }
  });

  app.get('/api/platform', async (req, res, next) => {
    try {
      const session = resolvePlatformSession(req);
      const projects = await listProjectsForSession(projectRepository, session);
      res.json({
        platform: createPlatformCockpit(projects.map(normalizeProject), {
          session,
          storageProfile: getRepositoryStorageProfile(projectRepository),
        }),
      });
    } catch (error) {
      sendWorkflowError(error, res, next);
    }
  });

  app.get('/api/me/tasks', async (req, res, next) => {
    try {
      const user = resolveRequiredAuthenticatedUser(req);
      const session = createRequestPlatformSession(req, user);
      const projects = await listProjectsForSession(projectRepository, session);
      res.json(createPersonalTaskQueuePayload(projects, { session, user }));
    } catch (error) {
      sendWorkflowError(error, res, next);
    }
  });

  app.get('/api/projects', async (req, res, next) => {
    try {
      const session = resolvePlatformSession(req);
      const projects = await listProjectsForSession(projectRepository, session);
      const visibleProjects = filterProjectsForSession(projects.map(normalizeProject), session);
      res.json({ projects: visibleProjects.map(toProjectSummary) });
    } catch (error) {
      sendWorkflowError(error, res, next);
    }
  });

  app.get('/api/projects/:projectId', async (req, res, next) => {
    try {
      const session = resolvePlatformSession(req);
      const project = await getProjectForSession(projectRepository, req.params.projectId, session);
      if (!project) {
        res.status(404).json({ error: '项目不存在。' });
        return;
      }
      const normalized = normalizeProject(project);
      res.json({ project: withStageGateReport(normalized) });
    } catch (error) {
      sendWorkflowError(error, res, next);
    }
  });

  app.get('/api/projects/:projectId/yolo-runtime', async (req, res, next) => {
    try {
      const session = resolvePlatformSession(req);
      const project = await getProjectForSession(projectRepository, req.params.projectId, session);
      if (!project) {
        res.status(404).json({ error: '项目不存在。' });
        return;
      }

      let channelPayload = null;
      let workerError = '';
      try {
        channelPayload = await effectiveYoloMonitorClient.getChannels();
      } catch (error) {
        workerError = error.message || 'YOLO 检测 worker 暂不可用。';
      }

      res.json({
        runtime: createYoloProjectRuntimeSummary(normalizeProject(project), {
          config: yoloMonitorConfig,
          channelPayload,
          error: workerError,
        }),
      });
    } catch (error) {
      sendWorkflowError(error, res, next);
    }
  });

  app.post('/api/projects', async (req, res, next) => {
    try {
      const session = resolvePlatformSession(req);
      const project = await projectRepository.createProject(createProject(req.body), {
        organizationId: session.currentOrganization.id,
        actorId: session.currentUser.id,
        auditReason: 'api-project-created',
      });
      res.status(201).json({ project });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  app.post('/api/projects/:projectId/platform-jobs', async (req, res, next) => {
    try {
      const session = resolvePlatformSession(req);
      const project = await projectRepository.getProject(req.params.projectId);
      if (!project) {
        res.status(404).json({ error: '项目不存在。' });
        return;
      }

      const normalized = normalizeProject(project);
      const identity = authorizeProjectAction(
        req,
        normalized,
        'queue-platform-job',
        '负责人',
      );
      const queued = queuePlatformJobForProject(normalized, {
        type: req.body.type || 'ai-development',
        title: req.body.title || '',
        command: req.body.command || '',
        details: req.body.details || {},
        source: req.body.source || 'platform-control',
        actor: identity.actor,
      });
      const queuedJob = queued.platformJobs?.[0];
      const queuedHistory = queued.history?.[0] || {};

      const updated = await projectRepository.createJob(req.params.projectId, queuedJob, {
        organizationId: session.currentOrganization.id,
        actorId: getIdentityActorId(identity),
        auditReason: 'api-platform-job-queued',
        historyType: 'platform-job-queued',
        historyEvent: {
          actor: identity.actor,
          note: queuedHistory.note,
        },
        now: queuedJob.queuedAt,
      });
      if (!updated) {
        res.status(404).json({ error: '项目不存在。' });
        return;
      }

      const projects = await listProjectsForSession(projectRepository, session);
      const normalizedProjects = projects.map(normalizeProject);
      const normalizedUpdated = normalizeProject(updated);
      res.status(201).json({
        project: withStageGateReport(normalizedUpdated),
        job: updated.platformJobs?.[0] || null,
        platform: createPlatformCockpit(normalizedProjects, {
          session,
          storageProfile: getRepositoryStorageProfile(projectRepository),
        }),
      });
    } catch (error) {
      sendWorkflowError(error, res, next);
    }
  });

  app.post('/api/projects/:projectId/platform-jobs/:jobId/start', async (req, res, next) => {
    try {
      const session = resolvePlatformSession(req);
      const shouldExecute = req.body?.execute === true;
      const requestNow = req.body?.now || new Date().toISOString();
      const project = await projectRepository.getProject(req.params.projectId);
      if (!project) {
        res.status(404).json({ error: '项目不存在。' });
        return;
      }

      const normalized = normalizeProject(project);
      const identity = authorizeProjectAction(req, normalized, 'update-platform-job', 'Local Runner');
      const started = startPlatformJobForProject(normalized, {
        jobId: req.params.jobId,
        actor: identity.actor,
        leaseDurationMs: req.body?.leaseDurationMs,
        now: requestNow,
        workerId: req.body?.workerId || identity.actor,
      });

      let transitioned = started;
      if (shouldExecute) {
        const job = findPlatformJob(started, req.params.jobId);
        const result = await platformJobRunner(started, job, { actor: identity.actor });
        transitioned =
          result.status === 'succeeded'
            ? completePlatformJobForProject(started, {
                jobId: req.params.jobId,
                actor: identity.actor,
                command: result.command,
                durationMs: result.durationMs,
                exitCode: result.exitCode,
                resultSummary: result.resultSummary,
                stderr: result.stderr,
                stdout: result.stdout,
              })
            : failPlatformJobForProject(started, {
                jobId: req.params.jobId,
                actor: identity.actor,
                command: result.command,
                durationMs: result.durationMs,
                exitCode: result.exitCode,
                errorSummary: result.errorSummary,
                details: result.details,
                stderr: result.stderr,
                stdout: result.stdout,
              });
      }

      const updated = await persistPlatformJobTransition(projectRepository, {
        auditReason: getPlatformJobAuditReason(transitioned.history?.[0]?.type),
        identity,
        jobId: req.params.jobId,
        project: normalized,
        projectId: req.params.projectId,
        session,
        transitioned,
      });
      if (!updated) {
        res.status(404).json({ error: '项目不存在。' });
        return;
      }

      const projects = await listProjectsForSession(projectRepository, session);
      const normalizedProjects = projects.map(normalizeProject);
      const normalizedUpdated = normalizeProject(updated);
      res.json({
        project: normalizedUpdated,
        job: findPlatformJob(normalizedUpdated, req.params.jobId),
        platform: createPlatformCockpit(normalizedProjects, {
          now: requestNow,
          session,
          storageProfile: getRepositoryStorageProfile(projectRepository),
        }),
      });
    } catch (error) {
      sendWorkflowError(error, res, next);
    }
  });

  app.post('/api/projects/:projectId/platform-jobs/:jobId/heartbeat', async (req, res, next) => {
    try {
      const session = resolvePlatformSession(req);
      const requestNow = req.body?.now || new Date().toISOString();
      const project = await projectRepository.getProject(req.params.projectId);
      if (!project) {
        res.status(404).json({ error: '项目不存在。' });
        return;
      }

      const normalized = normalizeProject(project);
      const identity = authorizeProjectAction(req, normalized, 'update-platform-job', 'Local Runner');
      const transitioned = heartbeatPlatformJobForProject(normalized, {
        jobId: req.params.jobId,
        actor: identity.actor,
        leaseDurationMs: req.body?.leaseDurationMs,
        now: requestNow,
        workerId: req.body?.workerId || identity.actor,
      });
      const updated = await persistPlatformJobTransition(projectRepository, {
        auditReason: 'api-platform-job-heartbeat',
        identity,
        jobId: req.params.jobId,
        project: normalized,
        projectId: req.params.projectId,
        session,
        transitioned,
      });

      if (!updated) {
        res.status(404).json({ error: '项目不存在。' });
        return;
      }

      const projects = await listProjectsForSession(projectRepository, session);
      const normalizedProjects = projects.map(normalizeProject);
      const normalizedUpdated = normalizeProject(updated);
      res.json({
        project: normalizedUpdated,
        job: findPlatformJob(normalizedUpdated, req.params.jobId),
        platform: createPlatformCockpit(normalizedProjects, {
          now: requestNow,
          session,
          storageProfile: getRepositoryStorageProfile(projectRepository),
        }),
      });
    } catch (error) {
      sendWorkflowError(error, res, next);
    }
  });

  app.post('/api/projects/:projectId/platform-jobs/:jobId/reclaim', async (req, res, next) => {
    try {
      const session = resolvePlatformSession(req);
      const requestNow = req.body?.now || new Date().toISOString();
      const project = await projectRepository.getProject(req.params.projectId);
      if (!project) {
        res.status(404).json({ error: '项目不存在。' });
        return;
      }

      const normalized = normalizeProject(project);
      const identity = authorizeProjectAction(req, normalized, 'update-platform-job', 'Local Runner');
      const transitioned = reclaimPlatformJobForProject(normalized, {
        jobId: req.params.jobId,
        actor: identity.actor,
        reason: req.body?.reason || '',
        now: requestNow,
      });
      const updated = await persistPlatformJobTransition(projectRepository, {
        auditReason: 'api-platform-job-reclaimed',
        identity,
        jobId: req.params.jobId,
        project: normalized,
        projectId: req.params.projectId,
        session,
        transitioned,
      });

      if (!updated) {
        res.status(404).json({ error: '项目不存在。' });
        return;
      }

      const projects = await listProjectsForSession(projectRepository, session);
      const normalizedProjects = projects.map(normalizeProject);
      const normalizedUpdated = normalizeProject(updated);
      res.json({
        project: normalizedUpdated,
        job: findPlatformJob(normalizedUpdated, req.params.jobId),
        platform: createPlatformCockpit(normalizedProjects, {
          now: requestNow,
          session,
          storageProfile: getRepositoryStorageProfile(projectRepository),
        }),
      });
    } catch (error) {
      sendWorkflowError(error, res, next);
    }
  });

  app.post('/api/projects/:projectId/platform-jobs/:jobId/complete', async (req, res, next) => {
    try {
      const session = resolvePlatformSession(req);
      const requestNow = req.body?.now || new Date().toISOString();
      const project = await projectRepository.getProject(req.params.projectId);
      if (!project) {
        res.status(404).json({ error: '项目不存在。' });
        return;
      }

      const normalized = normalizeProject(project);
      const identity = authorizeProjectAction(req, normalized, 'update-platform-job', 'Local Runner');
      const transitioned = completePlatformJobForProject(normalized, {
        jobId: req.params.jobId,
        actor: identity.actor,
        workerId: req.body?.workerId || '',
        resultSummary: req.body.resultSummary || '',
        now: requestNow,
      });
      const updated = await persistPlatformJobTransition(projectRepository, {
        auditReason: 'api-platform-job-succeeded',
        identity,
        jobId: req.params.jobId,
        project: normalized,
        projectId: req.params.projectId,
        session,
        transitioned,
      });

      if (!updated) {
        res.status(404).json({ error: '项目不存在。' });
        return;
      }

      const projects = await listProjectsForSession(projectRepository, session);
      const normalizedProjects = projects.map(normalizeProject);
      const normalizedUpdated = normalizeProject(updated);
      res.json({
        project: normalizedUpdated,
        job: findPlatformJob(normalizedUpdated, req.params.jobId),
        platform: createPlatformCockpit(normalizedProjects, {
          now: requestNow,
          session,
          storageProfile: getRepositoryStorageProfile(projectRepository),
        }),
      });
    } catch (error) {
      sendWorkflowError(error, res, next);
    }
  });

  app.post('/api/projects/:projectId/platform-jobs/:jobId/fail', async (req, res, next) => {
    try {
      const session = resolvePlatformSession(req);
      const requestNow = req.body?.now || new Date().toISOString();
      const project = await projectRepository.getProject(req.params.projectId);
      if (!project) {
        res.status(404).json({ error: '项目不存在。' });
        return;
      }

      const normalized = normalizeProject(project);
      const identity = authorizeProjectAction(req, normalized, 'update-platform-job', 'Local Runner');
      const transitioned = failPlatformJobForProject(normalized, {
        jobId: req.params.jobId,
        actor: identity.actor,
        workerId: req.body?.workerId || '',
        errorSummary: req.body.errorSummary || '',
        details: req.body.details || {},
        now: requestNow,
      });
      const updated = await persistPlatformJobTransition(projectRepository, {
        auditReason: 'api-platform-job-failed',
        identity,
        jobId: req.params.jobId,
        project: normalized,
        projectId: req.params.projectId,
        session,
        transitioned,
      });

      if (!updated) {
        res.status(404).json({ error: '项目不存在。' });
        return;
      }

      const projects = await listProjectsForSession(projectRepository, session);
      const normalizedProjects = projects.map(normalizeProject);
      const normalizedUpdated = normalizeProject(updated);
      res.json({
        project: normalizedUpdated,
        job: findPlatformJob(normalizedUpdated, req.params.jobId),
        platform: createPlatformCockpit(normalizedProjects, {
          now: requestNow,
          session,
          storageProfile: getRepositoryStorageProfile(projectRepository),
        }),
      });
    } catch (error) {
      sendWorkflowError(error, res, next);
    }
  });

  app.post('/api/projects/:projectId/platform-jobs/:jobId/retry', async (req, res, next) => {
    try {
      const session = resolvePlatformSession(req);
      const project = await projectRepository.getProject(req.params.projectId);
      if (!project) {
        res.status(404).json({ error: '项目不存在。' });
        return;
      }

      const normalized = normalizeProject(project);
      const identity = authorizeProjectAction(req, normalized, 'update-platform-job', 'Local Runner');
      const transitioned = retryPlatformJobForProject(normalized, {
        jobId: req.params.jobId,
        actor: identity.actor,
      });
      const updated = await persistPlatformJobTransition(projectRepository, {
        auditReason: 'api-platform-job-retried',
        identity,
        jobId: req.params.jobId,
        project: normalized,
        projectId: req.params.projectId,
        session,
        transitioned,
      });

      if (!updated) {
        res.status(404).json({ error: '项目不存在。' });
        return;
      }

      const projects = await listProjectsForSession(projectRepository, session);
      const normalizedProjects = projects.map(normalizeProject);
      const normalizedUpdated = normalizeProject(updated);
      res.json({
        project: normalizedUpdated,
        job: findPlatformJob(normalizedUpdated, req.params.jobId),
        platform: createPlatformCockpit(normalizedProjects, {
          session,
          storageProfile: getRepositoryStorageProfile(projectRepository),
        }),
      });
    } catch (error) {
      sendWorkflowError(error, res, next);
    }
  });

  app.post('/api/projects/:projectId/platform-jobs/:jobId/cancel', async (req, res, next) => {
    try {
      const session = resolvePlatformSession(req);
      const project = await projectRepository.getProject(req.params.projectId);
      if (!project) {
        res.status(404).json({ error: '项目不存在。' });
        return;
      }

      const normalized = normalizeProject(project);
      const identity = authorizeProjectAction(req, normalized, 'update-platform-job', 'Local Runner');
      const transitioned = cancelPlatformJobForProject(normalized, {
        jobId: req.params.jobId,
        actor: identity.actor,
        reason: req.body.reason || '',
      });
      const updated = await persistPlatformJobTransition(projectRepository, {
        auditReason: 'api-platform-job-cancelled',
        identity,
        jobId: req.params.jobId,
        project: normalized,
        projectId: req.params.projectId,
        session,
        transitioned,
      });

      if (!updated) {
        res.status(404).json({ error: '项目不存在。' });
        return;
      }

      const projects = await listProjectsForSession(projectRepository, session);
      const normalizedProjects = projects.map(normalizeProject);
      const normalizedUpdated = normalizeProject(updated);
      res.json({
        project: normalizedUpdated,
        job: findPlatformJob(normalizedUpdated, req.params.jobId),
        platform: createPlatformCockpit(normalizedProjects, {
          session,
          storageProfile: getRepositoryStorageProfile(projectRepository),
        }),
      });
    } catch (error) {
      sendWorkflowError(error, res, next);
    }
  });

  app.post('/api/projects/:projectId/members', async (req, res, next) => {
    try {
      const session = resolvePlatformSession(req);
      const project = await getProjectForSession(projectRepository, req.params.projectId, session);
      if (!project) {
        res.status(404).json({ error: '项目不存在。' });
        return;
      }

      const normalized = normalizeProject(project);
      const identity = authorizeProjectAction(req, normalized, 'manage-members', '负责人');
      const updated = await projectRepository.updateProjectWithAudit(req.params.projectId, (current) => {
        const currentProject = normalizeProject(current);
        return updateProjectMembersForProject(currentProject, {
          actor: identity.actor,
          members: req.body.members || {},
        });
      }, {
        organizationId: session.currentOrganization.id,
        actorId: getIdentityActorId(identity),
        auditReason: 'api-project-members-updated',
      });

      if (!updated) {
        res.status(404).json({ error: '项目不存在。' });
        return;
      }

      res.json({ project: updated });
    } catch (error) {
      sendWorkflowError(error, res, next);
    }
  });

  app.post('/api/projects/:projectId/deployment-environments/:environmentId', async (req, res, next) => {
    try {
      const session = resolvePlatformSession(req);
      const project = await getProjectForSession(projectRepository, req.params.projectId, session);
      if (!project) {
        res.status(404).json({ error: '项目不存在。' });
        return;
      }

      const normalized = normalizeProject(project);
      const identity = authorizeProjectAction(
        req,
        normalized,
        'update-deployment-environment',
        '运维',
      );
      const updated = await projectRepository.updateProjectWithAudit(req.params.projectId, (current) => {
        const currentProject = normalizeProject(current);
        const currentIdentity = authorizeProjectAction(
          req,
          currentProject,
          'update-deployment-environment',
          '运维',
        );
        return updateDeploymentEnvironmentForProject(currentProject, {
          environmentId: req.params.environmentId,
          actor: currentIdentity.user?.name || currentIdentity.actor,
          status: req.body.status || '',
          version: req.body.version || '',
          url: req.body.url || '',
          evidence: req.body.evidence || '',
        });
      }, {
        organizationId: session.currentOrganization.id,
        actorId: getIdentityActorId(identity),
        auditReason: 'api-deployment-environment-updated',
      });

      if (!updated) {
        res.status(404).json({ error: '项目不存在。' });
        return;
      }

      const projects = await listProjectsForSession(projectRepository, session);
      const normalizedProjects = projects.map(normalizeProject);
      const normalizedUpdated = normalizeProject(updated);
      res.json({
        project: normalizedUpdated,
        platform: createPlatformCockpit(normalizedProjects, {
          session,
          storageProfile: getRepositoryStorageProfile(projectRepository),
        }),
      });
    } catch (error) {
      sendWorkflowError(error, res, next);
    }
  });

  app.post('/api/projects/:projectId/notifications/:notificationId/acknowledge', async (req, res, next) => {
    try {
      const session = resolvePlatformSession(req);
      const project = await getProjectForSession(projectRepository, req.params.projectId, session);
      if (!project) {
        res.status(404).json({ error: '项目不存在。' });
        return;
      }

      const normalized = normalizeProject(project);
      const identity = authorizeProjectAction(
        req,
        normalized,
        'acknowledge-notification',
        '负责人',
      );
      const updated = await projectRepository.updateProjectWithAudit(req.params.projectId, (current) => {
        const currentProject = normalizeProject(current);
        const currentIdentity = authorizeProjectAction(
          req,
          currentProject,
          'acknowledge-notification',
          '负责人',
        );
        return acknowledgeNotificationForProject(currentProject, {
          notificationId: req.params.notificationId,
          actor: currentIdentity.user?.name || currentIdentity.actor,
          note: req.body.note || '',
        });
      }, {
        organizationId: session.currentOrganization.id,
        actorId: getIdentityActorId(identity),
        auditReason: 'api-notification-acknowledged',
      });

      if (!updated) {
        res.status(404).json({ error: '项目不存在。' });
        return;
      }

      const projects = await listProjectsForSession(projectRepository, session);
      const normalizedProjects = projects.map(normalizeProject);
      const normalizedUpdated = normalizeProject(updated);
      res.json({
        project: normalizedUpdated,
        platform: createPlatformCockpit(normalizedProjects, {
          session,
          storageProfile: getRepositoryStorageProfile(projectRepository),
        }),
      });
    } catch (error) {
      sendWorkflowError(error, res, next);
    }
  });

  app.post('/api/projects/:projectId/notification-actions/:actionId', async (req, res, next) => {
    try {
      const session = resolvePlatformSession(req);
      const project = await getProjectForSession(projectRepository, req.params.projectId, session);
      if (!project) {
        res.status(404).json({ error: '项目不存在。' });
        return;
      }

      const normalized = normalizeProject(project);
      const status = normalizeNotificationActionRequestStatus(req.body.status);
      const actionPermissionId = getNotificationActionPermissionId(status);
      const identity = authorizeProjectAction(
        req,
        normalized,
        actionPermissionId,
        '负责人',
      );
      assertNotificationActionStatusAuthorized(normalized, req.params.actionId, status, identity);
      const updated = await projectRepository.updateProjectWithAudit(req.params.projectId, (current) => {
        const currentProject = normalizeProject(current);
        const currentIdentity = authorizeProjectAction(
          req,
          currentProject,
          actionPermissionId,
          '负责人',
        );
        assertNotificationActionStatusAuthorized(
          currentProject,
          req.params.actionId,
          status,
          currentIdentity,
        );
        return updateNotificationActionForProject(currentProject, {
          actionId: req.params.actionId,
          status,
          actor: currentIdentity.user?.name || currentIdentity.actor,
          assigneeRole: req.body.assigneeRole || '',
          assigneeUserId: req.body.assigneeUserId || '',
          assigneeName: req.body.assigneeName || '',
          note: req.body.note || '',
          resolution: req.body.resolution || '',
          auditReason: `api-notification-action-${status}`,
        });
      }, {
        organizationId: session.currentOrganization.id,
        actorId: getIdentityActorId(identity),
        auditReason: `api-notification-action-${status}`,
      });

      if (!updated) {
        res.status(404).json({ error: '项目不存在。' });
        return;
      }

      const projects = await listProjectsForSession(projectRepository, session);
      const normalizedProjects = projects.map(normalizeProject);
      const normalizedUpdated = normalizeProject(updated);
      res.json({
        project: normalizedUpdated,
        platform: createPlatformCockpit(normalizedProjects, {
          session,
          storageProfile: getRepositoryStorageProfile(projectRepository),
        }),
      });
    } catch (error) {
      sendWorkflowError(error, res, next);
    }
  });

  app.post('/api/projects/:projectId/owner-escalations/:messageId/send', async (req, res, next) => {
    try {
      const session = resolvePlatformSession(req);
      const project = await getProjectForSession(projectRepository, req.params.projectId, session);
      if (!project) {
        res.status(404).json({ error: '项目不存在。' });
        return;
      }

      const normalized = normalizeProject(project);
      const identity = authorizeProjectAction(req, normalized, 'send-owner-escalation', '负责人');
      const updated = await projectRepository.updateProjectWithAudit(req.params.projectId, (current) => {
        const currentProject = normalizeProject(current);
        const currentIdentity = authorizeProjectAction(
          req,
          currentProject,
          'send-owner-escalation',
          '负责人',
        );
        return sendOwnerEscalationForProject(currentProject, {
          messageId: req.params.messageId,
          role: req.body.role || '',
          roleLabel: req.body.roleLabel || '',
          recipientUserId: req.body.recipientUserId || '',
          recipientName: req.body.recipientName || '',
          stageId: req.body.stageId || '',
          stageName: req.body.stageName || '',
          escalationLevel: req.body.escalationLevel || '',
          overdueHours: req.body.overdueHours || 0,
          subject: req.body.subject || '',
          body: req.body.body || '',
          note: req.body.note || 'Sent from owner cockpit.',
          actor: currentIdentity.user?.name || currentIdentity.actor,
          actorUserId: getIdentityActorId(currentIdentity),
          auditReason: 'api-owner-escalation-sent',
        });
      }, {
        organizationId: session.currentOrganization.id,
        actorId: getIdentityActorId(identity),
        auditReason: 'api-owner-escalation-sent',
      });

      if (!updated) {
        res.status(404).json({ error: '项目不存在。' });
        return;
      }

      const projects = await listProjectsForSession(projectRepository, session);
      const normalizedProjects = projects.map(normalizeProject);
      const normalizedUpdated = normalizeProject(updated);
      res.json({
        project: normalizedUpdated,
        platform: createPlatformCockpit(normalizedProjects, {
          session,
          storageProfile: getRepositoryStorageProfile(projectRepository),
        }),
      });
    } catch (error) {
      sendWorkflowError(error, res, next);
    }
  });

  app.post('/api/projects/:projectId/owner-escalations/:messageId/acknowledge', async (req, res, next) => {
    try {
      const session = resolvePlatformSession(req);
      const project = await getProjectForSession(projectRepository, req.params.projectId, session);
      if (!project) {
        res.status(404).json({ error: '项目不存在。' });
        return;
      }

      const normalized = normalizeProject(project);
      const identity = authorizeProjectAction(
        req,
        normalized,
        'acknowledge-owner-escalation',
        '负责人',
      );
      assertOwnerEscalationAcknowledgementAuthorized(normalized, req.params.messageId, identity);
      const updated = await projectRepository.updateProjectWithAudit(req.params.projectId, (current) => {
        const currentProject = normalizeProject(current);
        const currentIdentity = authorizeProjectAction(
          req,
          currentProject,
          'acknowledge-owner-escalation',
          '负责人',
        );
        assertOwnerEscalationAcknowledgementAuthorized(
          currentProject,
          req.params.messageId,
          currentIdentity,
        );
        return acknowledgeOwnerEscalationForProject(currentProject, {
          messageId: req.params.messageId,
          actor: currentIdentity.user?.name || currentIdentity.actor,
          actorUserId: getIdentityActorId(currentIdentity),
          note: req.body.note || '',
          auditReason: 'api-owner-escalation-acknowledged',
        });
      }, {
        organizationId: session.currentOrganization.id,
        actorId: getIdentityActorId(identity),
        auditReason: 'api-owner-escalation-acknowledged',
      });

      if (!updated) {
        res.status(404).json({ error: '项目不存在。' });
        return;
      }

      const projects = await listProjectsForSession(projectRepository, session);
      const normalizedProjects = projects.map(normalizeProject);
      const normalizedUpdated = normalizeProject(updated);
      res.json({
        project: normalizedUpdated,
        platform: createPlatformCockpit(normalizedProjects, {
          session,
          storageProfile: getRepositoryStorageProfile(projectRepository),
        }),
        personalTaskQueue: createPersonalTaskQueuePayload(projects, {
          session,
          user: identity.user || session.currentUser,
        }),
      });
    } catch (error) {
      sendWorkflowError(error, res, next);
    }
  });

  app.post('/api/projects/:projectId/stage-confirmations', async (req, res, next) => {
    try {
      const session = resolvePlatformSession(req);
      const project = await getProjectForSession(projectRepository, req.params.projectId, session);
      if (!project) {
        res.status(404).json({ error: '项目不存在。' });
        return;
      }

      const normalized = normalizeProject(project);
      const targetStageId = req.body.stageId || normalized.currentStageId;
      if (targetStageId !== normalized.currentStageId) {
        throw new WorkflowGateError('只能维护当前阶段的确认事项。', {
          targetStageId,
          currentStageId: normalized.currentStageId,
        });
      }

      const identity = authorizeProjectAction(
        req,
        normalized,
        'update-stage-confirmations',
        getCurrentStage(normalized)?.owner || '绯荤粺',
      );
      const updated = await projectRepository.updateProjectWithAudit(req.params.projectId, (current) => {
        const currentProject = normalizeProject(current);
        if (targetStageId !== currentProject.currentStageId) {
          throw new WorkflowGateError('只能维护当前阶段的确认事项。', {
            targetStageId,
            currentStageId: currentProject.currentStageId,
          });
        }

        return updateStageConfirmationForProject(currentProject, {
          actor: identity.actor,
          stageId: targetStageId,
          itemId: req.body.itemId || '',
          value: req.body.value || '',
        });
      }, {
        organizationId: session.currentOrganization.id,
        actorId: getIdentityActorId(identity),
        auditReason: 'api-stage-confirmation-updated',
      });

      if (!updated) {
        res.status(404).json({ error: '项目不存在。' });
        return;
      }

      res.json({ project: updated });
    } catch (error) {
      sendWorkflowError(error, res, next);
    }
  });

  app.post('/api/projects/:projectId/task-comments', async (req, res, next) => {
    try {
      const session = resolvePlatformSession(req);
      const project = await getProjectForSession(projectRepository, req.params.projectId, session);
      if (!project) {
        res.status(404).json({ error: '项目不存在。' });
        return;
      }

      const normalized = normalizeProject(project);
      const targetStageId = req.body.stageId || normalized.currentStageId;
      if (targetStageId !== normalized.currentStageId) {
        throw new WorkflowGateError('只能维护当前阶段的任务备注。', {
          targetStageId,
          currentStageId: normalized.currentStageId,
        });
      }

      const identity = authorizeProjectAction(
        req,
        normalized,
        'update-stage-confirmations',
        getCurrentStage(normalized)?.owner || '系统',
      );
      const updated = await projectRepository.updateProjectWithAudit(req.params.projectId, (current) => {
        const currentProject = normalizeProject(current);
        if (targetStageId !== currentProject.currentStageId) {
          throw new WorkflowGateError('只能维护当前阶段的任务备注。', {
            targetStageId,
            currentStageId: currentProject.currentStageId,
          });
        }

        return recordTaskCommentForProject(currentProject, {
          actor: identity.actor,
          stageId: targetStageId,
          itemId: req.body.itemId || '',
          comment: req.body.comment || '',
        });
      }, {
        organizationId: session.currentOrganization.id,
        actorId: getIdentityActorId(identity),
        auditReason: 'api-task-comment-added',
      });

      if (!updated) {
        res.status(404).json({ error: '项目不存在。' });
        return;
      }

      res.json({ project: updated });
    } catch (error) {
      sendWorkflowError(error, res, next);
    }
  });

  app.post('/api/projects/:projectId/pipeline-flow-actions', async (req, res, next) => {
    try {
      const session = resolvePlatformSession(req);
      const project = await getProjectForSession(projectRepository, req.params.projectId, session);
      if (!project) {
        res.status(404).json({ error: '项目不存在。' });
        return;
      }

      const normalized = normalizeProject(project);
      const identity = authorizeProjectAction(
        req,
        normalized,
        'record-pipeline-flow-action',
        getCurrentStage(normalized)?.owner || '系统',
      );
      const actionId = String(req.body.actionId || '').trim();
      if (!actionId) {
        throw new WorkflowGateError('建议动作 ID 不能为空。', {
          projectId: req.params.projectId,
        });
      }

      const actionLabel = String(req.body.actionLabel || '').trim() || actionId;
      const updated = await projectRepository.appendAuditEvent(
        req.params.projectId,
        {
          type: 'pipeline-flow-action-recorded',
          actor: identity.user ? actorFromUser(identity.user) : identity.actor,
          actionId,
          actionLabel,
          commandHandler: String(req.body.commandHandler || '').trim(),
          commandKind: String(req.body.commandKind || '').trim(),
          pipelineStageId: String(req.body.pipelineStageId || '').trim(),
          pipelineStageName: String(req.body.pipelineStageName || '').trim(),
          workflowStageId: String(req.body.workflowStageId || normalized.currentStageId || '').trim(),
          note: `记录业务流转建议动作：${actionLabel}`,
        },
        {
          organizationId: session.currentOrganization.id,
          actorId: getIdentityActorId(identity),
          auditReason: 'api-pipeline-flow-action-recorded',
        },
      );

      if (!updated) {
        res.status(404).json({ error: '项目不存在。' });
        return;
      }

      const projects = await listProjectsForSession(projectRepository, session);
      const normalizedProjects = projects.map(normalizeProject);
      const normalizedUpdated = normalizeProject(updated);
      res.json({
        project: normalizedUpdated,
        platform: createPlatformCockpit(normalizedProjects, {
          session,
          storageProfile: getRepositoryStorageProfile(projectRepository),
        }),
      });
    } catch (error) {
      sendWorkflowError(error, res, next);
    }
  });

  app.post('/api/projects/:projectId/advance', async (req, res, next) => {
    try {
      const session = resolvePlatformSession(req);
      const project = await getProjectForSession(projectRepository, req.params.projectId, session);
      if (!project) {
        res.status(404).json({ error: '项目不存在。' });
        return;
      }

      const normalized = normalizeProject(project);
      const identity = authorizeProjectAction(req, normalized, 'advance', '绯荤粺');
      const updated = await projectRepository.updateProjectWithAudit(req.params.projectId, async (current) => {
        const currentProject = normalizeProject(current);
        if (req.body.expectedStageId && currentProject.currentStageId !== req.body.expectedStageId) {
          throw new StageConflictError('阶段已变化，请刷新项目后重试。', {
            expectedStageId: req.body.expectedStageId,
            currentStageId: currentProject.currentStageId,
          });
        }

        const currentIdentity = authorizeProjectAction(req, currentProject, 'advance', '绯荤粺');

        const advanced = advanceProject(currentProject, {
          actor: currentIdentity.actor,
          note: req.body.note || '',
          archiveVersion: req.body.archiveVersion || '',
        });

        if (
          currentProject.currentStageId === STAGE_IDS.PRD_APPROVAL &&
          advanced.currentStageId === STAGE_IDS.ARCHITECTURE
        ) {
          return generateTechnicalHandoffWithProvider(advanced, {
            actor: currentIdentity.actor,
            aiProvider,
          });
        }

        return advanced;
      }, {
        organizationId: session.currentOrganization.id,
        actorId: getIdentityActorId(identity),
        auditReason: 'api-stage-advanced',
      });

      if (!updated) {
        res.status(404).json({ error: '项目不存在。' });
        return;
      }

      res.json({ project: updated });
    } catch (error) {
      sendWorkflowError(error, res, next);
    }
  });

  app.post('/api/projects/:projectId/reject', async (req, res, next) => {
    try {
      const session = resolvePlatformSession(req);
      const project = await getProjectForSession(projectRepository, req.params.projectId, session);
      if (!project) {
        res.status(404).json({ error: '项目不存在。' });
        return;
      }

      const normalized = normalizeProject(project);
      const identity = authorizeProjectAction(req, normalized, 'reject', '绯荤粺');
      const updated = await projectRepository.updateProjectWithAudit(req.params.projectId, (current) => {
        const currentProject = normalizeProject(current);
        const currentIdentity = authorizeProjectAction(req, currentProject, 'reject', '绯荤粺');
        return rejectProjectStage(currentProject, {
          actor: currentIdentity.actor,
          note: req.body.note || '',
        });
      }, {
        organizationId: session.currentOrganization.id,
        actorId: getIdentityActorId(identity),
        auditReason: 'api-stage-rejected',
      });

      if (!updated) {
        res.status(404).json({ error: '项目不存在。' });
        return;
      }

      res.json({ project: updated });
    } catch (error) {
      sendWorkflowError(error, res, next);
    }
  });

  app.post('/api/projects/:projectId/requirements', async (req, res, next) => {
    try {
      const session = resolvePlatformSession(req);
      const project = await getProjectForSession(projectRepository, req.params.projectId, session);
      if (!project) {
        res.status(404).json({ error: '项目不存在。' });
        return;
      }

      const normalized = normalizeProject(project);
      const identity = authorizeProjectAction(req, normalized, 'answer-requirement', '项目经理');
      const updated = await projectRepository.updateProjectWithAudit(req.params.projectId, (current) => {
        const currentProject = normalizeProject(current);
        return answerRequirementQuestion(currentProject, {
          questionId: req.body.questionId,
          answer: req.body.answer,
          actor: identity.actor,
        });
      }, {
        organizationId: session.currentOrganization.id,
        actorId: getIdentityActorId(identity),
        auditReason: 'api-requirement-answer',
      });

      if (!updated) {
        res.status(404).json({ error: '项目不存在。' });
        return;
      }

      res.json({ project: updated });
    } catch (error) {
      sendWorkflowError(error, res, () => {
        res.status(400).json({ error: error.message });
      });
    }
  });

  app.post('/api/projects/:projectId/review-requirements', async (req, res, next) => {
    try {
      const updated = await updateProjectWithAuthorizedAudit(
        req,
        projectRepository,
        'review-requirements',
        '项目经理',
        'api-requirement-review',
        (project, identity) => reviewRequirementsWithProvider(project, {
          actor: identity.actor,
          aiProvider,
        }),
      );

      if (!updated) {
        res.status(404).json({ error: '项目不存在。' });
        return;
      }

      res.json({ project: updated });
    } catch (error) {
      sendWorkflowError(error, res, next);
    }
  });

  app.post('/api/projects/:projectId/generate-prd', async (req, res, next) => {
    try {
      const updated = await updateProjectWithAuthorizedAudit(
        req,
        projectRepository,
        'generate-prd',
        '项目经理',
        'api-prd-generated',
        (project, identity) => generatePrdWithProvider(project, {
          actor: identity.actor,
          aiProvider,
        }),
      );

      if (!updated) {
        res.status(404).json({ error: '项目不存在。' });
        return;
      }

      res.json({ project: updated });
    } catch (error) {
      sendWorkflowError(error, res, next);
    }
  });

  app.post('/api/projects/:projectId/repository-config', async (req, res, next) => {
    try {
      const session = resolvePlatformSession(req);
      const project = await getProjectForSession(projectRepository, req.params.projectId, session);
      if (!project) {
        res.status(404).json({ error: '项目不存在。' });
        return;
      }

      const normalized = normalizeProject(project);
      const identity = authorizeProjectAction(req, normalized, 'repository-config', '技术负责人');
      const updated = await projectRepository.updateProjectWithAudit(req.params.projectId, (current) => {
        const currentProject = normalizeProject(current);
        const currentIdentity = authorizeProjectAction(req, currentProject, 'repository-config', '技术负责人');
        return updateRepositoryConfigForProject(currentProject, {
          actor: currentIdentity.actor,
          config: req.body,
        });
      }, {
        organizationId: session.currentOrganization.id,
        actorId: getIdentityActorId(identity),
        auditReason: 'api-repository-config-updated',
      });

      if (!updated) {
        res.status(404).json({ error: '项目不存在。' });
        return;
      }

      res.json({ project: updated });
    } catch (error) {
      sendWorkflowError(error, res, next);
    }
  });

  app.post('/api/projects/:projectId/bootstrap-repository', async (req, res, next) => {
    try {
      const updated = await updateProjectWithAuthorizedAudit(
        req,
        projectRepository,
        'bootstrap-repository',
        '技术负责人',
        'api-repository-bootstrapped',
        async (project, identity) => {
          const actor = identity.actor;
          const configured = updateRepositoryConfigForProject(project, {
            actor,
            config: {
              ...project.repositoryConfig,
              ...req.body,
            },
          });
          const bootstrap = await repositoryBootstrapper(configured);
          return recordRepositoryBootstrapForProject(configured, {
            actor,
            bootstrap,
          });
        },
      );

      if (!updated) {
        res.status(404).json({ error: '项目不存在。' });
        return;
      }

      res.json({ project: updated });
    } catch (error) {
      sendWorkflowError(error, res, next);
    }
  });

  app.post('/api/projects/:projectId/run-development', async (req, res, next) => {
    try {
      const updated = await updateProjectWithAuthorizedAudit(
        req,
        projectRepository,
        'run-development',
        'AI 开发',
        'api-development-executed',
        async (project, identity) => {
          const actor = identity.actor;
          const started = startDevelopmentRunForProject(project, {
            actor,
            provider: 'local-rule',
          });
          const execution = await developmentExecutor(started);
          return recordDevelopmentExecutionResultsForProject(started, {
            actor,
            execution,
          });
        },
      );

      if (!updated) {
        res.status(404).json({ error: '项目不存在。' });
        return;
      }

      res.json({ project: updated });
    } catch (error) {
      sendWorkflowError(error, res, next);
    }
  });

  app.post('/api/projects/:projectId/run-development-checks', async (req, res, next) => {
    try {
      const updated = await updateProjectWithAuthorizedAudit(
        req,
        projectRepository,
        'run-development-checks',
        'Local Runner',
        'api-development-checks-finished',
        async (project, identity) => {
          const result = await developmentRunner(project);
          return recordDevelopmentCheckResultsForProject(project, {
            actor: identity.actor,
            checks: result.checks,
          });
        },
      );

      if (!updated) {
        res.status(404).json({ error: '项目不存在。' });
        return;
      }

      res.json({ project: updated });
    } catch (error) {
      sendWorkflowError(error, res, next);
    }
  });

  app.post('/api/projects/:projectId/run-code-review', async (req, res, next) => {
    try {
      const updated = await updateProjectWithAuthorizedAudit(
        req,
        projectRepository,
        'run-code-review',
        '技术负责人',
        'api-code-review-finished',
        async (project, identity) => {
          const report = await codeReviewRunner(project);
          return recordCodeReviewForProject(project, {
            actor: identity.actor,
            report,
          });
        },
      );

      if (!updated) {
        res.status(404).json({ error: '项目不存在。' });
        return;
      }

      res.json({ project: updated });
    } catch (error) {
      sendWorkflowError(error, res, next);
    }
  });

  app.post('/api/projects/:projectId/run-qa', async (req, res, next) => {
    try {
      const updated = await updateProjectWithAuthorizedAudit(
        req,
        projectRepository,
        'run-qa',
        '娴嬭瘯',
        'api-qa-run-finished',
        async (project, identity) => {
          const report = await qaRunner(project);
          return recordQaRunForProject(project, {
            actor: identity.actor,
            report,
          });
        },
      );

      if (!updated) {
        res.status(404).json({ error: '项目不存在。' });
        return;
      }

      res.json({ project: updated });
    } catch (error) {
      sendWorkflowError(error, res, next);
    }
  });

  app.post('/api/projects/:projectId/qa-evidence', async (req, res, next) => {
    try {
      const updated = await updateProjectWithAuthorizedAudit(
        req,
        projectRepository,
        'qa-evidence',
        '娴嬭瘯',
        'api-qa-evidence-updated',
        (project, identity) => recordQaEvidenceForProject(project, {
          actor: identity.actor,
          evidence: req.body,
        }),
      );

      if (!updated) {
        res.status(404).json({ error: '项目不存在。' });
        return;
      }

      res.json({ project: updated });
    } catch (error) {
      sendWorkflowError(error, res, next);
    }
  });

  app.post('/api/projects/:projectId/yolo-qa-session', async (req, res, next) => {
    try {
      const updated = await updateProjectWithAuthorizedAudit(
        req,
        projectRepository,
        'yolo-qa-session',
        '测试',
        'api-yolo-qa-session-started',
        (project, identity) => startYoloQaSessionForProject(project, {
          actor: identity.actor,
          session: req.body,
        }),
      );

      if (!updated) {
        res.status(404).json({ error: '项目不存在。' });
        return;
      }

      res.json({ project: updated });
    } catch (error) {
      sendWorkflowError(error, res, next);
    }
  });

  app.post('/api/projects/:projectId/yolo-qa-session/events', async (req, res, next) => {
    try {
      const updated = await updateProjectWithAuthorizedAudit(
        req,
        projectRepository,
        'yolo-qa-session',
        '测试',
        'api-yolo-qa-event-recorded',
        (project, identity) => recordYoloQaDetectionEventForProject(project, {
          actor: identity.actor,
          event: req.body,
        }),
      );

      if (!updated) {
        res.status(404).json({ error: '项目不存在。' });
        return;
      }

      res.json({ project: updated });
    } catch (error) {
      sendWorkflowError(error, res, next);
    }
  });

  app.post('/api/projects/:projectId/yolo-qa-session/events/:eventId/review', async (req, res, next) => {
    try {
      const updated = await updateProjectWithAuthorizedAudit(
        req,
        projectRepository,
        'yolo-qa-session',
        '测试',
        'api-yolo-qa-event-reviewed',
        (project, identity) => reviewYoloQaDetectionEventForProject(project, {
          actor: identity.actor,
          eventId: req.params.eventId,
          review: req.body,
        }),
      );

      if (!updated) {
        res.status(404).json({ error: '项目不存在。' });
        return;
      }

      res.json({ project: updated });
    } catch (error) {
      sendWorkflowError(error, res, next);
    }
  });

  app.post('/api/projects/:projectId/yolo-qa-session/complete', async (req, res, next) => {
    try {
      const updated = await updateProjectWithAuthorizedAudit(
        req,
        projectRepository,
        'yolo-qa-session',
        '测试',
        'api-yolo-qa-session-completed',
        (project, identity) => completeYoloQaSessionForProject(project, {
          actor: identity.actor,
          endedAt: req.body.endedAt,
        }),
      );

      if (!updated) {
        res.status(404).json({ error: '项目不存在。' });
        return;
      }

      res.json({ project: updated });
    } catch (error) {
      sendWorkflowError(error, res, next);
    }
  });

  app.post('/api/projects/:projectId/route-qa-defects', async (req, res, next) => {
    try {
      const session = resolvePlatformSession(req);
      const project = await getProjectForSession(projectRepository, req.params.projectId, session);
      if (!project) {
        res.status(404).json({ error: '项目不存在。' });
        return;
      }

      const normalized = normalizeProject(project);
      const identity = authorizeProjectAction(req, normalized, 'route-qa-defects', '娴嬭瘯');
      const updated = await projectRepository.updateProjectWithAudit(req.params.projectId, (current) => {
        const currentProject = normalizeProject(current);
        const currentIdentity = authorizeProjectAction(req, currentProject, 'route-qa-defects', '娴嬭瘯');
        return routeQaDefectsToDevelopmentForProject(currentProject, {
          actor: currentIdentity.actor,
          note: req.body.note || '',
        });
      }, {
        organizationId: session.currentOrganization.id,
        actorId: getIdentityActorId(identity),
        auditReason: 'api-qa-defects-routed',
      });

      if (!updated) {
        res.status(404).json({ error: '项目不存在。' });
        return;
      }

      res.json({ project: updated });
    } catch (error) {
      sendWorkflowError(error, res, next);
    }
  });

  app.post('/api/projects/:projectId/generate-acceptance-package', async (req, res, next) => {
    try {
      const session = resolvePlatformSession(req);
      const project = await getProjectForSession(projectRepository, req.params.projectId, session);
      if (!project) {
        res.status(404).json({ error: '项目不存在。' });
        return;
      }

      const normalized = normalizeProject(project);
      const identity = authorizeProjectAction(req, normalized, 'generate-acceptance-package', '负责人');
      const updated = await projectRepository.updateProjectWithAudit(req.params.projectId, (current) => {
        const currentProject = normalizeProject(current);
        const currentIdentity = authorizeProjectAction(
          req,
          currentProject,
          'generate-acceptance-package',
          '负责人',
        );
        return generateAcceptancePackageForProject(currentProject, {
          actor: currentIdentity.actor,
        });
      }, {
        organizationId: session.currentOrganization.id,
        actorId: getIdentityActorId(identity),
        auditReason: 'api-acceptance-package-generated',
      });

      if (!updated) {
        res.status(404).json({ error: '项目不存在。' });
        return;
      }

      res.json({ project: updated });
    } catch (error) {
      sendWorkflowError(error, res, next);
    }
  });

  app.post('/api/projects/:projectId/inspect-repository', async (req, res, next) => {
    try {
      const session = resolvePlatformSession(req);
      const project = await getProjectForSession(projectRepository, req.params.projectId, session);
      if (!project) {
        res.status(404).json({ error: '项目不存在。' });
        return;
      }

      const normalized = normalizeProject(project);
      const identity = authorizeProjectAction(req, normalized, 'inspect-repository', 'Local Runner');
      const updated = await projectRepository.updateProjectWithAudit(req.params.projectId, async (current) => {
        const currentProject = normalizeProject(current);
        const currentIdentity = authorizeProjectAction(req, currentProject, 'inspect-repository', 'Local Runner');
        const inspection = await repositoryInspector(currentProject);
        return recordRepositoryInspectionForProject(currentProject, {
          actor: currentIdentity.actor,
          inspection,
        });
      }, {
        organizationId: session.currentOrganization.id,
        actorId: getIdentityActorId(identity),
        auditReason: 'api-repository-inspected',
      });

      if (!updated) {
        res.status(404).json({ error: '项目不存在。' });
        return;
      }

      res.json({ project: updated });
    } catch (error) {
      sendWorkflowError(error, res, next);
    }
  });

  app.post('/api/projects/:projectId/prepare-branch', async (req, res, next) => {
    try {
      const session = resolvePlatformSession(req);
      const project = await getProjectForSession(projectRepository, req.params.projectId, session);
      if (!project) {
        res.status(404).json({ error: '项目不存在。' });
        return;
      }

      const normalized = normalizeProject(project);
      const identity = authorizeProjectAction(req, normalized, 'prepare-branch', 'Local Runner');
      const updated = await projectRepository.updateProjectWithAudit(req.params.projectId, async (current) => {
        const currentProject = normalizeProject(current);
        const currentIdentity = authorizeProjectAction(req, currentProject, 'prepare-branch', 'Local Runner');
        const preparation = await branchPreparer(currentProject);
        return recordBranchPreparationForProject(currentProject, {
          actor: currentIdentity.actor,
          preparation,
        });
      }, {
        organizationId: session.currentOrganization.id,
        actorId: getIdentityActorId(identity),
        auditReason: 'api-branch-prepared',
      });

      if (!updated) {
        res.status(404).json({ error: '项目不存在。' });
        return;
      }

      res.json({ project: updated });
    } catch (error) {
      sendWorkflowError(error, res, next);
    }
  });

  app.post('/api/projects/:projectId/generate-development-package', async (req, res, next) => {
    try {
      const session = resolvePlatformSession(req);
      const project = await getProjectForSession(projectRepository, req.params.projectId, session);
      if (!project) {
        res.status(404).json({ error: '项目不存在。' });
        return;
      }

      const normalized = normalizeProject(project);
      const identity = authorizeProjectAction(req, normalized, 'generate-development-package', 'AI Dev Lead');
      const updated = await projectRepository.updateProjectWithAudit(req.params.projectId, (current) => {
        const currentProject = normalizeProject(current);
        const currentIdentity = authorizeProjectAction(
          req,
          currentProject,
          'generate-development-package',
          'AI Dev Lead',
        );
        return generateAgentExecutionPackageForProject(currentProject, {
          actor: currentIdentity.actor,
        });
      }, {
        organizationId: session.currentOrganization.id,
        actorId: getIdentityActorId(identity),
        auditReason: 'api-development-package-generated',
      });

      if (!updated) {
        res.status(404).json({ error: '项目不存在。' });
        return;
      }

      res.json({ project: updated });
    } catch (error) {
      sendWorkflowError(error, res, next);
    }
  });

  app.use((error, req, res, next) => {
    if (isMalformedJsonError(error)) {
      res.status(400).json({ error: '请求体不是有效 JSON。' });
      return;
    }

    console.error(error);
    res.status(500).json({ error: '服务器内部错误。' });
  });

  return app;
}

function isMalformedJsonError(error) {
  return error?.type === 'entity.parse.failed' || (error instanceof SyntaxError && error.status === 400);
}

async function generatePrdWithProvider(project, { actor, aiProvider }) {
  try {
    const result = await aiProvider.generatePrd(project);
    return generatePrdForProject(project, {
      actor,
      artifact: result.artifact,
      provider: result.provider,
    });
  } catch (error) {
    return generatePrdForProject(project, {
      actor,
      provider: 'local-rule',
      providerError: error.message,
    });
  }
}

async function reviewRequirementsWithProvider(project, { actor, aiProvider }) {
  try {
    const result = aiProvider.reviewRequirements
      ? await aiProvider.reviewRequirements(project)
      : { provider: 'local-rule' };
    return applyRequirementReview(project, {
      actor,
      review: result.review,
      provider: result.provider,
    });
  } catch (error) {
    return applyRequirementReview(project, {
      actor,
      provider: 'local-rule',
      providerError: error.message,
    });
  }
}

async function generateTechnicalHandoffWithProvider(project, { actor, aiProvider }) {
  try {
    const result = aiProvider.generateTechnicalHandoff
      ? await aiProvider.generateTechnicalHandoff(project)
      : { provider: 'local-rule' };
    return generateTechnicalHandoffForProject(project, {
      actor,
      bundle: result.bundle,
      provider: result.provider,
    });
  } catch (error) {
    return generateTechnicalHandoffForProject(project, {
      actor,
      provider: 'local-rule',
      providerError: error.message,
    });
  }
}

class AuthorizationError extends Error {
  constructor(permission) {
    super(permission.reason);
    this.name = 'AuthorizationError';
    this.details = permission;
  }
}

class AuthenticationError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = 'AuthenticationError';
    this.details = details;
  }
}

function authorizeProjectAction(req, project, actionId, fallbackActor) {
  const identity = resolveRequestIdentity(req, fallbackActor);
  const permission = assertProjectActionAuthorized(project, actionId, identity);
  return { ...identity, permission };
}

async function updateProjectWithAuthorizedAudit(
  req,
  projectRepository,
  actionId,
  fallbackActor,
  auditReason,
  updater,
) {
  const session = resolvePlatformSession(req);
  const project = await getProjectForSession(projectRepository, req.params.projectId, session);
  if (!project) {
    return null;
  }

  const identity = authorizeProjectAction(req, normalizeProject(project), actionId, fallbackActor);

  return projectRepository.updateProjectWithAudit(
    req.params.projectId,
    async (current) => {
      const currentProject = normalizeProject(current);
      const currentIdentity = authorizeProjectAction(req, currentProject, actionId, fallbackActor);
      return updater(currentProject, currentIdentity);
    },
    {
      organizationId: session.currentOrganization.id,
      actorId: getIdentityActorId(identity),
      auditReason,
    },
  );
}

function resolvePlatformSession(req) {
  const user = shouldRequireAuthentication(req)
    ? resolveRequiredAuthenticatedUser(req, '请先登录后再访问当前组织。')
    : resolveAuthenticatedUser(req);

  return createRequestPlatformSession(req, user);
}

function createRequestPlatformSession(
  req,
  user,
  { organizationId = String(req.get('X-Organization-Id') || '').trim() } = {},
) {
  const requestedOrganizationId = String(organizationId || '').trim();
  const session = createPlatformSession({
    userId: user?.id || '',
    organizationId: requestedOrganizationId,
  });

  if (
    shouldRequireAuthentication(req) &&
    requestedOrganizationId &&
    session.currentOrganization?.id !== requestedOrganizationId
  ) {
    throw new AuthorizationError({
      actionId: 'select-organization',
      allowed: false,
      reason: '当前用户不属于该组织。',
      organizationId: requestedOrganizationId,
      userId: user?.id || '',
    });
  }

  const requireAuthentication = shouldRequireAuthentication(req);

  return {
    ...session,
    authMode: requireAuthentication ? 'strict' : 'demo',
    allowUserSwitching: !requireAuthentication,
  };
}

function resolveRequestIdentity(req, fallbackActor) {
  const user = resolveAuthenticatedUser(req);
  if (shouldRequireAuthentication(req) && !user) {
    throw new AuthenticationError('请先登录后再执行该操作。');
  }
  const session = createRequestPlatformSession(req, user);

  if (user) {
    return {
      actor: actorFromUser(user),
      user,
      session,
    };
  }

  return {
    actor: req.body.actor || fallbackActor,
    user: null,
    session,
  };
}

function getIdentityActorId(identity) {
  return String(identity?.user?.id || identity?.actor || 'system').trim() || 'system';
}

async function persistPlatformJobTransition(
  projectRepository,
  { auditReason, identity, jobId, project, projectId, session, transitioned },
) {
  const transitionedJob = findPlatformJob(transitioned, jobId);
  if (!transitionedJob) {
    throw new PlatformJobError('后台任务不存在。', { jobId });
  }

  const newHistoryEvents = getNewProjectHistoryEvents(project, transitioned).map((event) => ({
    ...event,
    jobId,
    jobStatus: event.jobStatus || transitionedJob.status || '',
  }));
  const projectPatch =
    transitionedJob.type === 'qa-defect-fix' && transitioned.defectFixPackage
      ? createQaDefectFixTransitionPatch(transitioned)
      : {};

  const updated = await projectRepository.updateJob(projectId, jobId, transitionedJob, {
    organizationId: session.currentOrganization.id,
    actorId: getIdentityActorId(identity),
    auditReason,
    historyEvents: newHistoryEvents,
    projectPatch,
    now:
      transitioned.updatedAt ||
      transitionedJob.updatedAt ||
      transitionedJob.finishedAt ||
      transitionedJob.startedAt ||
      transitionedJob.queuedAt,
  });

  return persistAgentJobArtifacts(projectRepository, {
    auditReason,
    identity,
    job: transitionedJob,
    jobId,
    project: updated,
    projectId,
    session,
    transitionEvents: newHistoryEvents,
  });
}

function createQaDefectFixTransitionPatch(project) {
  return {
    currentStageId: project.currentStageId,
    health: project.health,
    stages: project.stages,
    artifacts: project.artifacts,
    developmentPlan: project.developmentPlan,
    developmentRun: project.developmentRun,
    codeReviewReport: project.codeReviewReport || null,
    defectFixPackage: project.defectFixPackage,
  };
}

async function persistAgentJobArtifacts(
  projectRepository,
  { auditReason, identity, job, jobId, project, projectId, session, transitionEvent, transitionEvents = [] },
) {
  let updated = project;
  const actorId = getIdentityActorId(identity);
  const events = (transitionEvents.length ? transitionEvents : [transitionEvent])
    .filter((event) => event?.type?.startsWith('platform-job-'))
    .reverse();

  for (const event of events) {
    const eventType = event.type || '';
    const eventTime =
      event.at ||
      job.updatedAt ||
      job.finishedAt ||
      job.leaseHeartbeatAt ||
      job.startedAt ||
      job.queuedAt ||
      new Date().toISOString();
    const eventJob = createAgentJobSnapshotForEvent(job, event);

    if (eventType === 'platform-job-started') {
      updated = await projectRepository.createJobRun(
        projectId,
        jobId,
        createAgentJobRunRecord(eventJob, eventTime),
        {
          organizationId: session.currentOrganization.id,
          actorId,
          auditReason: `${auditReason}:run`,
          now: eventTime,
        },
      );
    } else if (shouldUpdateAgentJobRun(eventType)) {
      updated = await updateAgentJobRunForEvent(projectRepository, {
        actorId,
        auditReason,
        eventJob,
        eventTime,
        eventType,
        jobId,
        projectId,
        session,
      });
    }

    updated = await projectRepository.appendJobEvent(
      projectId,
      jobId,
      {
        id: createAgentJobEventId(jobId, eventType, eventTime),
        type: eventType,
        workerId: eventJob.lockedBy || event.workerId || '',
        payload: createAgentJobEventPayload(eventJob, event),
      },
      {
        organizationId: session.currentOrganization.id,
        actorId,
        auditReason,
        now: eventTime,
      },
    );
  }

  return updated;
}

async function updateAgentJobRunForEvent(
  projectRepository,
  { actorId, auditReason, eventJob, eventTime, eventType, jobId, projectId, session },
) {
  const context = {
    organizationId: session.currentOrganization.id,
    actorId,
    auditReason: `${auditReason}:run`,
    now: eventTime,
  };

  try {
    return await projectRepository.updateJobRun(
      projectId,
      jobId,
      createAgentJobRunId(eventJob),
      createAgentJobRunPatch(eventJob, eventType, eventTime),
      context,
    );
  } catch (error) {
    if (error?.message !== 'job run not found') {
      throw error;
    }

    await projectRepository.createJobRun(
      projectId,
      jobId,
      createAgentJobRunRecord(eventJob, eventTime),
      {
        ...context,
        auditReason: `${auditReason}:run-created-from-terminal-event`,
      },
    );
    return projectRepository.updateJobRun(
      projectId,
      jobId,
      createAgentJobRunId(eventJob),
      createAgentJobRunPatch(eventJob, eventType, eventTime),
      context,
    );
  }
}

function createAgentJobSnapshotForEvent(job = {}, transitionEvent = {}) {
  return {
    ...job,
    status: transitionEvent.jobStatus || job.status || '',
    lockedBy: transitionEvent.workerId || job.lockedBy || '',
    leaseExpiresAt: transitionEvent.leaseExpiresAt || job.leaseExpiresAt || '',
  };
}

function shouldUpdateAgentJobRun(eventType = '') {
  return new Set([
    'platform-job-heartbeat',
    'platform-job-reclaimed',
    'platform-job-succeeded',
    'platform-job-failed',
    'platform-job-exhausted',
    'platform-job-cancelled',
  ]).has(eventType);
}

function createAgentJobRunRecord(job = {}, eventTime = new Date().toISOString()) {
  const runNumber = Number(job.runCount || 0) || 1;
  return {
    id: createAgentJobRunId(job),
    runNumber,
    workerId: job.lockedBy || '',
    status: 'running',
    leaseStartedAt: job.leaseStartedAt || eventTime,
    leaseHeartbeatAt: job.leaseHeartbeatAt || eventTime,
    leaseExpiresAt: job.leaseExpiresAt || '',
    startedAt: job.startedAt || eventTime,
    finishedAt: '',
    durationMs: 0,
    exitCode: null,
  };
}

function createAgentJobRunId(job = {}) {
  const runNumber = Number(job.runCount || 0) || 1;
  return `${job.id}-run-${runNumber}`;
}

function createAgentJobRunPatch(job = {}, eventType = '', eventTime = new Date().toISOString()) {
  const patch = {
    status: resolveAgentJobRunStatus(job, eventType),
  };

  if (job.lockedBy) {
    patch.workerId = job.lockedBy;
  }
  if (job.leaseHeartbeatAt) {
    patch.leaseHeartbeatAt = job.leaseHeartbeatAt;
  }
  if (job.leaseExpiresAt) {
    patch.leaseExpiresAt = job.leaseExpiresAt;
  }
  if (isTerminalAgentJobRunEvent(eventType)) {
    patch.finishedAt = job.finishedAt || eventTime;
    patch.durationMs = Number.isFinite(job.durationMs) ? job.durationMs : 0;
    patch.exitCode = Number.isInteger(job.exitCode) ? job.exitCode : null;
  }

  return patch;
}

function resolveAgentJobRunStatus(job = {}, eventType = '') {
  if (eventType === 'platform-job-reclaimed') {
    return 'reclaimed';
  }
  if (eventType === 'platform-job-succeeded') {
    return 'succeeded';
  }
  if (eventType === 'platform-job-heartbeat') {
    return 'running';
  }
  return job.status || 'running';
}

function isTerminalAgentJobRunEvent(eventType = '') {
  return new Set([
    'platform-job-reclaimed',
    'platform-job-succeeded',
    'platform-job-failed',
    'platform-job-exhausted',
    'platform-job-cancelled',
  ]).has(eventType);
}

function createAgentJobEventPayload(job = {}, transitionEvent = {}) {
  const details = job.details && typeof job.details === 'object' && !Array.isArray(job.details)
    ? job.details
    : {};
  return {
    jobStatus: job.status || '',
    rawStatus: job.rawStatus || '',
    runCount: Number(job.runCount || 0),
    workerId: job.lockedBy || transitionEvent.workerId || '',
    leaseStartedAt: job.leaseStartedAt || '',
    leaseHeartbeatAt: job.leaseHeartbeatAt || '',
    leaseExpiresAt: job.leaseExpiresAt || transitionEvent.leaseExpiresAt || '',
    queuedAt: job.queuedAt || '',
    startedAt: job.startedAt || '',
    finishedAt: job.finishedAt || '',
    resultSummary: job.resultSummary || '',
    errorSummary: job.errorSummary || '',
    previousLockedBy: details.previousLockedBy || '',
    leaseExpiredAt: details.leaseExpiredAt || '',
    reclaimReason: details.reclaimReason || '',
  };
}

function createAgentJobEventId(jobId = '', eventType = 'platform-job-event', eventTime = '') {
  return [jobId, eventType, eventTime]
    .map((part) => String(part || '').trim().replace(/[^a-zA-Z0-9]+/g, '-'))
    .filter(Boolean)
    .join('-')
    .toLowerCase();
}

function getNewProjectHistoryEvents(beforeProject, afterProject) {
  const beforeCount = Array.isArray(beforeProject.history) ? beforeProject.history.length : 0;
  const afterHistory = Array.isArray(afterProject.history) ? afterProject.history : [];
  return afterHistory.slice(0, Math.max(afterHistory.length - beforeCount, 1));
}

function getPlatformJobAuditReason(historyType) {
  const reasons = {
    'platform-job-started': 'api-platform-job-started',
    'platform-job-heartbeat': 'api-platform-job-heartbeat',
    'platform-job-reclaimed': 'api-platform-job-reclaimed',
    'platform-job-succeeded': 'api-platform-job-succeeded',
    'platform-job-failed': 'api-platform-job-failed',
    'platform-job-exhausted': 'api-platform-job-exhausted',
    'platform-job-retried': 'api-platform-job-retried',
    'platform-job-cancelled': 'api-platform-job-cancelled',
  };
  return reasons[historyType] || 'api-platform-job-updated';
}

function normalizeNotificationActionRequestStatus(status) {
  const normalized = String(status || 'acknowledged').trim();
  return ['acknowledged', 'assigned', 'resolved'].includes(normalized)
    ? normalized
    : 'acknowledged';
}

function getNotificationActionPermissionId(status) {
  const permissionIds = {
    acknowledged: 'acknowledge-notification-action',
    assigned: 'assign-notification-action',
    resolved: 'resolve-notification-action',
  };
  return permissionIds[status] || 'acknowledge-notification-action';
}

function assertNotificationActionStatusAuthorized(project, actionId, status, identity) {
  if (status !== 'resolved') {
    return;
  }

  const actionState = project.notificationAcknowledgements?.[actionId] || {};
  const assignedRole = String(actionState.assigneeRole || '').trim();
  const actorRole = identity.permission?.role || identity.user?.role || '';
  if (!assignedRole || actorRole === 'owner' || actorRole === assignedRole) {
    return;
  }

  throw new AuthorizationError({
    actionId: 'resolve-notification-action',
    allowed: false,
    allowedRoles: ['owner', assignedRole],
    role: actorRole,
    roleLabel: identity.permission?.roleLabel || '',
    reason: '当前角色无权关闭该通知待办。',
    actor: identity.user ? actorFromUser(identity.user) : identity.actor || '',
    projectId: project.id,
    projectName: project.name || '',
    organizationId: identity.session?.currentOrganization?.id || '',
    projectOrganizationId: project.organizationId || DEFAULT_ORGANIZATION_ID,
    user: identity.user
      ? {
          id: identity.user.id,
          name: identity.user.name,
          role: identity.user.role,
          actor: identity.user.actor,
        }
      : null,
    notificationId: actionId,
    notificationStatus: status,
    assigneeRole: assignedRole,
  });
}

function assertOwnerEscalationAcknowledgementAuthorized(project, messageId, identity) {
  const escalation = project.ownerEscalations?.[messageId] || {};
  const actorRole = identity.permission?.role || identity.user?.role || '';
  const actorUserId = identity.user?.id || '';
  const recipientUserId = String(escalation.recipientUserId || '').trim();
  const recipientRole = String(escalation.role || '').trim();

  if (
    actorRole === 'owner' ||
    (recipientUserId && actorUserId === recipientUserId) ||
    (!recipientUserId && recipientRole && actorRole === recipientRole)
  ) {
    return;
  }

  throw new AuthorizationError({
    actionId: 'acknowledge-owner-escalation',
    allowed: false,
    allowedRoles: ['owner', recipientRole].filter(Boolean),
    role: actorRole,
    roleLabel: identity.permission?.roleLabel || '',
    reason: '当前角色无权确认该负责人升级提醒。',
    actor: identity.user ? actorFromUser(identity.user) : identity.actor || '',
    projectId: project.id,
    projectName: project.name || '',
    organizationId: identity.session?.currentOrganization?.id || '',
    projectOrganizationId: project.organizationId || DEFAULT_ORGANIZATION_ID,
    user: identity.user
      ? {
          id: identity.user.id,
          name: identity.user.name,
          role: identity.user.role,
          actor: identity.user.actor,
        }
      : null,
    escalationMessageId: messageId,
    recipientUserId,
    recipientRole,
  });
}

function resolveAuthenticatedUser(req) {
  const allowUserHeader = !shouldRequireAuthentication(req);
  const userId = allowUserHeader ? String(req.get('X-User-Id') || '').trim() : '';
  if (userId) {
    const user = findUserById(userId);
    if (!user) {
      throw new AuthenticationError('当前用户不存在或已停用。', { userId });
    }

    return user;
  }

  const token = getBearerToken(req);
  if (!token) {
    return null;
  }

  const user = verifySessionToken(token, APP_USERS);
  if (!user) {
    throw new AuthenticationError('登录状态已失效，请重新登录。');
  }

  return user;
}

function resolveRequiredAuthenticatedUser(req, message = '请先登录后再查看个人待办。') {
  const user = resolveAuthenticatedUser(req);
  if (!user) {
    throw new AuthenticationError(message);
  }
  return user;
}

function shouldRequireAuthentication(req) {
  return Boolean(req.app?.get?.('requireAuthentication'));
}

function isStrictAuthenticationEnvironment() {
  return ['1', 'true', 'yes', 'strict'].includes(
    String(process.env.WEE_CODER_REQUIRE_AUTH || '').trim().toLowerCase(),
  );
}

function getRepositoryStorageProfile(repository) {
  if (typeof repository.getStorageProfile === 'function') {
    return repository.getStorageProfile();
  }

  return {
    mode: 'json-store',
    adapter: repository?.constructor?.name || 'ProjectRepository',
    targetEngine: 'postgresql',
    migrationStatus: 'schema-ready',
    supportsTransactions: false,
    supportsConcurrentWrites: false,
  };
}

function findPlatformJob(project, jobId) {
  return (project.platformJobs || []).find((job) => job.id === jobId) || null;
}

function getBearerToken(req) {
  const authorization = String(req.get('Authorization') || '').trim();
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match?.[1] || '';
}

function assertProjectActionAuthorized(project, actionId, identity) {
  if (!isProjectVisibleToSession(project, identity.session)) {
    throw new AuthorizationError({
      actionId,
      allowed: false,
      reason: '当前组织无权访问该项目。',
      actor: identity.user ? actorFromUser(identity.user) : identity.actor || '',
      projectId: project.id,
      projectName: project.name || '',
      organizationId: identity.session?.currentOrganization?.id || '',
      projectOrganizationId: project.organizationId || '',
      user: identity.user
        ? {
            id: identity.user.id,
            name: identity.user.name,
            role: identity.user.role,
            actor: identity.user.actor,
          }
        : null,
    });
  }

  const actorOrRole = identity?.user?.role || identity?.actor || identity;
  const permission = canPerformProjectAction(project, actionId, actorOrRole);
  permission.actor = identity.user ? actorFromUser(identity.user) : identity.actor || '';
  permission.projectId = project.id;
  permission.projectName = project.name || '';
  permission.organizationId = identity.session?.currentOrganization?.id || '';
  permission.projectOrganizationId = project.organizationId || DEFAULT_ORGANIZATION_ID;
  if (identity?.user) {
    permission.user = {
      id: identity.user.id,
      name: identity.user.name,
      role: identity.user.role,
      actor: identity.user.actor,
    };
    if (
      permission.allowed &&
      !isUserAssignedToProjectRole(project, identity.user, permission.role, APP_USERS)
    ) {
      permission.allowed = false;
      permission.reason = `当前用户不是该项目的${permission.roleLabel}成员。`;
      permission.membership = {
        role: permission.role,
        userId: identity.user.id,
        assignedUserId: project.members?.[permission.role] || '',
      };
    }
  }
  if (!permission.allowed) {
    throw new AuthorizationError(permission);
  }
  return permission;
}

function sendWorkflowError(error, res, next) {
  if (error instanceof AuthenticationError || error.name === 'AuthenticationError') {
    res.status(401).json({ error: error.message, details: error.details || {} });
    return;
  }

  if (error instanceof AuthorizationError || error.name === 'AuthorizationError') {
    sendAuthorizationError(error, res);
    return;
  }

  if (error instanceof StageConflictError || error.name === 'StageConflictError') {
    res.status(409).json({ error: error.message, details: error.details || {} });
    return;
  }

  if (error instanceof WorkflowGateError || error.name === 'WorkflowGateError') {
    res.status(400).json({ error: error.message, details: error.details || {} });
    return;
  }

  if (error instanceof DevelopmentRunnerError || error.name === 'DevelopmentRunnerError') {
    res.status(400).json({ error: error.message, details: error.details || {} });
    return;
  }

  if (error instanceof RepositoryInspectionError || error.name === 'RepositoryInspectionError') {
    res.status(400).json({ error: error.message, details: error.details || {} });
    return;
  }

  if (error instanceof BranchPreparationError || error.name === 'BranchPreparationError') {
    res.status(400).json({ error: error.message, details: error.details || {} });
    return;
  }

  if (error instanceof RepositoryBootstrapError || error.name === 'RepositoryBootstrapError') {
    res.status(400).json({ error: error.message, details: error.details || {} });
    return;
  }

  if (error instanceof LocalDevelopmentExecutionError || error.name === 'LocalDevelopmentExecutionError') {
    res.status(400).json({ error: error.message, details: error.details || {} });
    return;
  }

  if (error instanceof CodeReviewRunnerError || error.name === 'CodeReviewRunnerError') {
    res.status(400).json({ error: error.message, details: error.details || {} });
    return;
  }

  if (error instanceof QaRunnerError || error.name === 'QaRunnerError') {
    res.status(400).json({ error: error.message, details: error.details || {} });
    return;
  }

  if (error instanceof PlatformJobError || error.name === 'PlatformJobError') {
    res.status(400).json({ error: error.message, details: error.details || {} });
    return;
  }

  if (error instanceof PlatformNotificationError || error.name === 'PlatformNotificationError') {
    res.status(400).json({ error: error.message, details: error.details || {} });
    return;
  }

  next(error);
}

function sendAuthorizationError(error, res) {
  const respond = () => {
    if (!res.headersSent) {
      res.status(403).json({ error: error.message, details: error.details || {} });
    }
  };

  recordAuthorizationDenial(res.req, error)
    .catch(() => null)
    .finally(respond);
}

async function recordAuthorizationDenial(req, error) {
  const projectRepository = req?.app?.get?.('projectRepository');
  const details = error.details || {};
  const projectId = String(details.projectId || req?.params?.projectId || '').trim();
  const organizationId = String(
    details.projectOrganizationId || details.organizationId || DEFAULT_ORGANIZATION_ID,
  ).trim();

  if (!projectRepository || !projectId || !organizationId) {
    return null;
  }

  return projectRepository.appendAuditEvent(
    projectId,
    {
      type: 'authorization-denied',
      category: 'security',
      severity: 'high',
      actionId: details.actionId || '',
      actor: details.actor || details.user?.actor || details.roleLabel || '',
      userId: details.user?.id || details.userId || '',
      role: details.role || '',
      roleLabel: details.roleLabel || '',
      allowedRoles: details.allowedRoles || [],
      reason: error.message,
      note: error.message,
    },
    {
      organizationId,
      actorId:
        details.user?.id ||
        details.actor ||
        details.userId ||
        details.role ||
        'authorization-denied',
      auditReason: 'api-authorization-denied',
    },
  );
}

class StageConflictError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = 'StageConflictError';
    this.details = details;
  }
}

function createRepositoryFromStore(store) {
  return new ProjectRepository({
    adapter: store,
    storageProfile: {
      mode: 'json-store',
      adapter: store?.constructor?.name || 'JsonProjectStore',
      targetEngine: 'postgresql',
      migrationStatus: 'schema-ready',
      supportsTransactions: false,
      supportsConcurrentWrites: false,
      location: store?.filePath || '',
    },
  });
}

async function listProjectsForSession(projectRepository, session) {
  if (typeof projectRepository.listProjectsByOrganization === 'function') {
    return projectRepository.listProjectsByOrganization(session.currentOrganization.id);
  }

  const projects = await projectRepository.listProjects();
  return filterProjectsForSession(projects.map(normalizeProject), session);
}

async function getProjectForSession(projectRepository, projectId, session) {
  if (typeof projectRepository.getProjectByOrganization === 'function') {
    return projectRepository.getProjectByOrganization(projectId, session.currentOrganization.id);
  }

  const project = await projectRepository.getProject(projectId);
  if (!project || !isProjectVisibleToSession(normalizeProject(project), session)) {
    return null;
  }
  return project;
}

function toProjectSummary(project) {
  const currentStage = getCurrentStage(project);
  const currentStageName = currentStage?.name || project.currentStageId;
  const stageGateReport = createStageGateReport(project);
  const deliveryGateAudit = createDeliveryGateAudit(project);
  const responsibilityMatrix = createProjectResponsibilityMatrix(project);
  const projectExecutionAudit = createProjectExecutionAudit(project);
  const projectAutomationPlan = createProjectAutomationPlan(project);
  const deliveryFlowRehearsal = createDeliveryFlowRehearsal(project);
  const yoloDeliveryChain = createYoloDeliveryChain(project);
  const followupTasks = createProjectTaskLedger(project, {
    stageIds: [project.currentStageId],
    includeResolved: false,
  }).tasks;
  const projectHealth = createProjectHealthReport({
    ...project,
    currentStageName,
    stageGateReport,
    openFollowupTaskCount: followupTasks.length,
  });
  return {
    id: project.id,
    organizationId: project.organizationId || DEFAULT_ORGANIZATION_ID,
    name: project.name,
    sponsor: project.sponsor,
    summary: project.summary,
    health: project.health,
    currentStageId: project.currentStageId,
    currentStageName,
    currentOwner: currentStage?.owner || '未知',
    stageGateReport,
    deliveryGateAudit,
    responsibilityMatrix,
    projectExecutionAudit,
    projectAutomationPlan,
    deliveryFlowRehearsal,
    yoloDeliveryChain,
    projectHealth,
    prdStatus: project.prdStatus || 'draft',
    stageProgress: project.stages.filter((stage) => stage.status === 'approved').length,
    totalStages: project.stages.length,
    openFollowupTaskCount: followupTasks.length,
    followupTaskTargetRoleLabels: uniqueSummaryValues(
      followupTasks.map((task) => task.targetRoleLabel),
    ),
    followupTaskAssigneeNames: uniqueSummaryValues(followupTasks.map((task) => task.assigneeName)),
    followupTaskAssignments: summarizeFollowupTaskAssignments(followupTasks),
    ownerEscalations: project.ownerEscalations || {},
    updatedAt: project.updatedAt,
  };
}

function createPersonalTaskQueuePayload(projects = [], { session, user }) {
  const visibleProjects = filterProjectsForSession(
    projects.map(normalizeProject),
    session,
  );
  const personalProjectSummaries = visibleProjects.map((project) =>
    toPersonalTaskProjectSummary(project, user),
  );
  const inbox = createRoleInbox(personalProjectSummaries, { currentUserId: user.id });
  const currentUserGroups = inbox.currentUserGroups;
  const followupTasks = flattenRoleInboxTasks(currentUserGroups);
  const followupProjectCount = new Set(followupTasks.map((task) => task.projectId)).size;
  const workbench = createRoleWorkbench(personalProjectSummaries, {
    currentUser: user,
    personalTaskQueue: {
      openTaskCount: followupTasks.length,
      projectCount: followupProjectCount,
      tasks: followupTasks,
    },
    roleInbox: inbox,
  });

  return {
    currentUser: user,
    organization: session.currentOrganization,
    openTaskCount: workbench.openTaskCount,
    projectCount: workbench.projectCount,
    tasks: workbench.tasks,
    inbox: {
      openTaskCount: currentUserGroups.reduce(
        (sum, group) => sum + Number(group.openTaskCount || 0),
        0,
      ),
      groups: currentUserGroups,
      currentUserGroups,
    },
    workbench,
  };
}

function toPersonalTaskProjectSummary(project, user) {
  const summary = toProjectSummary(project);
  const followupTasks = createProjectTaskLedger(project, {
    includeResolved: false,
  }).tasks.filter((task) => isTaskAssignedToUser(task, user));

  return {
    ...summary,
    openFollowupTaskCount: followupTasks.length,
    followupTaskTargetRoleLabels: uniqueSummaryValues(
      followupTasks.map((task) => task.targetRoleLabel),
    ),
    followupTaskAssigneeNames: uniqueSummaryValues(followupTasks.map((task) => task.assigneeName)),
    followupTaskAssignments: summarizeFollowupTaskAssignments(followupTasks),
  };
}

function isTaskAssignedToUser(task = {}, user = {}) {
  if (!user?.id && !user?.role) {
    return false;
  }

  const assigneeUserId = String(task.assigneeUserId || '').trim();
  if (assigneeUserId) {
    return assigneeUserId === user.id;
  }

  return String(task.targetRole || '').trim() === user.role;
}

function withStageGateReport(project) {
  const {
    demoScenario,
    deliveryDemoPackage,
    demoWalkthrough,
    ...projectWithoutDemoFields
  } = project;
  const projectExecutionAudit = createProjectExecutionAudit(project);
  const projectAutomationPlan = createProjectAutomationPlan(project);
  const deliveryFlowRehearsal = createDeliveryFlowRehearsal(project);
  const yoloDeliveryChain = createYoloDeliveryChain(project);
  return {
    ...projectWithoutDemoFields,
    stageGateReport: createStageGateReport(project),
    deliveryGateAudit: createDeliveryGateAudit(project),
    responsibilityMatrix: createProjectResponsibilityMatrix(project),
    projectExecutionAudit,
    projectAutomationPlan,
    deliveryFlowRehearsal,
    yoloDeliveryChain,
  };
}

function uniqueSummaryValues(values) {
  return [...new Set(values.filter(Boolean))];
}

function summarizeFollowupTaskAssignments(tasks) {
  const assignments = new Map();

  tasks.forEach((task) => {
    const key = `${task.targetRole}:${task.assigneeUserId || task.assigneeName}`;
    const current = assignments.get(key) || {
      targetRole: task.targetRole,
      targetRoleLabel: task.targetRoleLabel,
      assigneeUserId: task.assigneeUserId,
      assigneeName: task.assigneeName,
      openTaskCount: 0,
      tasks: [],
    };
    current.openTaskCount += 1;
    current.tasks.push(toFollowupTaskSummary(task));
    assignments.set(key, current);
  });

  return [...assignments.values()];
}

function flattenRoleInboxTasks(groups = []) {
  return groups.flatMap((group) =>
    (group.projects || []).flatMap((project) =>
      (project.tasks || []).map((task) => ({
        ...task,
        projectId: project.projectId,
        projectName: project.projectName,
        stageId: task.stageId || project.stageId,
        stageName: task.stageName || project.stageName,
        targetRole: task.targetRole || group.targetRole,
        targetRoleLabel: task.targetRoleLabel || group.targetRoleLabel,
        assigneeUserId: task.assigneeUserId || group.assigneeUserId,
        assigneeName: task.assigneeName || group.assigneeName,
      })),
    ),
  );
}

function toFollowupTaskSummary(task) {
  return {
    id: task.id,
    followupTaskId: task.followupTaskId || task.id,
    stageId: task.stageId,
    stageName: task.stageName,
    itemId: task.itemId,
    title: task.title,
    question: task.question,
    expectedAnswer: task.expectedAnswer,
    status: task.status,
    resolvedAt: task.resolvedAt,
    resolvedBy: task.resolvedBy,
    resolutionSummary: task.resolutionSummary,
    commentCount: task.commentCount,
    updatedAt: task.updatedAt,
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT || 4000);
  createApp().listen(port, () => {
    console.log(`Delivery API listening on http://127.0.0.1:${port}`);
  });
}
