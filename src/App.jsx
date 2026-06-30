import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import {
  canPerformProjectAction,
  resolveActorRole,
} from './shared/authorization.js';
import { BUSINESS_SKILLS } from './shared/deliverySkills.js';
import { createDevelopmentLaunchGuide } from './shared/developmentLaunchGuide.js';
import {
  createStageConfirmationFollowups,
  createStageConfirmationFollowupTasks,
} from './shared/stageConfirmations.js';
import {
  createDefaultProjectMembers,
  getProjectMemberRows,
  isUserAssignedToProjectRole,
  normalizeProjectMembers,
} from './shared/projectMembers.js';
import { createRoleInbox, filterRoleInbox } from './shared/roleInbox.js';
import { createRoleWorkbench } from './shared/roleWorkbench.js';
import { createProjectTaskLedger } from './shared/taskLedger.js';
import { resolvePipelineFlowActionCommand } from './shared/pipelineFlowActionCommands.js';
import { APP_USERS, selectUserForRole } from './shared/users.js';
import { DEFAULT_ORGANIZATION_ID } from './shared/platform.js';
import { AppShell } from './ui/AppShell.jsx';
import {
  getNavigationItems,
  getPreferredStageIdForTab,
  getWorkspaceTabForStage,
} from './ui/navigation.js';
import { OperationsConsole } from './features/operations/OperationsConsole.jsx';
import YoloMonitorPage from './features/yolo-monitor/YoloMonitorPage.jsx';
import { YoloProjectRuntimePanel } from './features/yolo-monitor/YoloProjectRuntimePanel.jsx';

const ProjectCenter = lazy(() => import('./features/projects/ProjectCenter.jsx').then((module) => ({
  default: module.ProjectCenter,
})));
const ProjectWorkspace = lazy(() => import('./features/projects/ProjectWorkspace.jsx').then((module) => ({
  default: module.ProjectWorkspace,
})));
const TaskQueuePage = lazy(() => import('./features/tasks/TaskQueuePage.jsx').then((module) => ({
  default: module.TaskQueuePage,
})));
const PersonalWorkspacePanel = lazy(() => import('./features/workspace/PersonalWorkspacePanel.jsx').then((module) => ({
  default: module.PersonalWorkspacePanel,
})));
const OrganizationOverviewPanel = lazy(() => import('./features/workspace/OrganizationOverviewPanel.jsx').then((module) => ({
  default: module.OrganizationOverviewPanel,
})));

const PM_STAGE_ID = 'pm-requirements';
const DEVELOPMENT_STAGE_ID = 'development';
const REVIEW_STAGE_ID = 'review';
const OPS_STAGE_ID = 'ops-requirements';
const QA_STAGE_ID = 'qa';
const ACCEPTANCE_STAGE_ID = 'acceptance';
const TECHNICAL_HANDOFF_STAGE_IDS = ['architecture', DEVELOPMENT_STAGE_ID, OPS_STAGE_ID, QA_STAGE_ID];
const SESSION_STORAGE_KEY = 'wee-coder-session';

const emptyForm = {
  name: '',
  sponsor: '',
  summary: '',
};

const DEFAULT_DELIVERY_SECTIONS = Object.freeze({
  artifact: false,
  history: false,
  risk: false,
  task: false,
});

const DEFAULT_DELIVERY_WORKSPACE_PANELS = Object.freeze({
  evidence: false,
  flow: false,
});

export default function App() {
  if (typeof window !== 'undefined' && window.location.pathname === '/monitor/yolo') {
    return <YoloMonitorPage />;
  }

  const [authSession, setAuthSession] = useState(readStoredAuthSession);
  const [loginForm, setLoginForm] = useState({ userId: APP_USERS[0].id, password: 'demo123' });
  const [projects, setProjects] = useState([]);
  const [platform, setPlatform] = useState(null);
  const [personalTaskQueue, setPersonalTaskQueue] = useState(null);
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [selectedProject, setSelectedProject] = useState(null);
  const [viewStageId, setViewStageId] = useState('');
  const [form, setForm] = useState(emptyForm);
  const [actionNote, setActionNote] = useState('');
  const [requirementDrafts, setRequirementDrafts] = useState({});
  const [memberDrafts, setMemberDrafts] = useState(createDefaultProjectMembers(APP_USERS));
  const [stageConfirmationDrafts, setStageConfirmationDrafts] = useState({});
  const [repositoryDraft, setRepositoryDraft] = useState(createRepositoryDraft());
  const [qaEvidenceDraft, setQaEvidenceDraft] = useState(createQaEvidenceDraft());
  const [yoloQaEventDraft, setYoloQaEventDraft] = useState(createYoloQaEventDraft());
  const [acceptanceSignoffDraft, setAcceptanceSignoffDraft] = useState(
    createAcceptanceSignoffDraft(),
  );
  const [focusedStageConfirmation, setFocusedStageConfirmation] = useState(null);
  const [taskCommentDraft, setTaskCommentDraft] = useState('');
  const [roleInboxFilter, setRoleInboxFilter] = useState('all');
  const [users, setUsers] = useState(APP_USERS);
  const [selectedUserId, setSelectedUserId] = useState(APP_USERS[0].id);
  const [isUserManuallySelected, setIsUserManuallySelected] = useState(false);
  const [selectedOrganizationId, setSelectedOrganizationId] = useState(DEFAULT_ORGANIZATION_ID);
  const [activeDestination, setActiveDestination] = useState('workspace');
  const [activeProjectTab, setActiveProjectTab] = useState('overview');
  const [isArtifactExpanded, setIsArtifactExpanded] = useState(false);
  const [expandedDeliverySections, setExpandedDeliverySections] = useState(
    DEFAULT_DELIVERY_SECTIONS,
  );
  const [expandedDeliveryWorkspacePanels, setExpandedDeliveryWorkspacePanels] = useState(
    DEFAULT_DELIVERY_WORKSPACE_PANELS,
  );
  const [isDeliveryDetailPanelOpen, setIsDeliveryDetailPanelOpen] = useState(false);
  const [isAuxiliaryDrawerOpen, setIsAuxiliaryDrawerOpen] = useState(false);
  const [isProjectCreateOpen, setIsProjectCreateOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [permissionIssue, setPermissionIssue] = useState(null);
  const projectDetailRequestRef = useRef(0);
  const organizationRef = useRef(selectedOrganizationId);
  const isUserManuallySelectedRef = useRef(isUserManuallySelected);

  useEffect(() => {
    loadUsers();
  }, []);

  useEffect(() => {
    organizationRef.current = selectedOrganizationId;
  }, [selectedOrganizationId]);

  useEffect(() => {
    isUserManuallySelectedRef.current = isUserManuallySelected;
  }, [isUserManuallySelected]);

  useEffect(() => {
    if (!authSession?.token) {
      setLoading(false);
      setProjects([]);
      setSelectedProjectId('');
      setSelectedProject(null);
      setPlatform(null);
      setPersonalTaskQueue(null);
      return;
    }

    loadProjects(selectedOrganizationId, { resetSelection: true });
  }, [authSession?.token]);

  useEffect(() => {
    if (selectedProjectId) {
      loadProject(selectedProjectId, selectedOrganizationId);
    } else {
      setSelectedProject(null);
    }
  }, [selectedProjectId, selectedOrganizationId]);

  useEffect(() => {
    setMemberDrafts(normalizeProjectMembers(selectedProject?.members, users));
    setStageConfirmationDrafts(
      createStageConfirmationDrafts(
        selectedProject?.stageConfirmations?.[selectedProject?.currentStageId],
      ),
    );
    setRequirementDrafts(selectedProject?.requirementAnswers || {});
    setRepositoryDraft(
      createRepositoryDraft(selectedProject?.repositoryConfig, selectedProject?.developmentPlan),
    );
    setQaEvidenceDraft(createQaEvidenceDraft(selectedProject?.qaEvidence));
    setYoloQaEventDraft(createYoloQaEventDraft(selectedProject?.yoloQaSession));
    setAcceptanceSignoffDraft(createAcceptanceSignoffDraft(selectedProject?.acceptancePackage));
    setViewStageId(selectedProject?.currentStageId || '');
    const focusedStageId =
      focusedStageConfirmation &&
      focusedStageConfirmation.projectId === selectedProject?.id
        ? focusedStageConfirmation.stageId
        : '';
    setActiveProjectTab(
      getWorkspaceTabForStage(focusedStageId || selectedProject?.currentStageId),
    );
  }, [
    focusedStageConfirmation?.projectId,
    focusedStageConfirmation?.stageId,
    selectedProject?.currentStageId,
    selectedProject?.id,
    selectedProject?.updatedAt,
    users,
  ]);

  useEffect(() => {
    if (isUserManuallySelectedRef.current) {
      return;
    }

    setSelectedUserId(getAutomaticProjectUserId(selectedProject, users));
  }, [selectedProject?.id, selectedProject?.currentStageId, users]);

  const stats = useMemo(() => {
    const active = projects.length;
    const atRisk = projects.filter((project) => project.health !== 'on-track').length;
    const avgProgress = projects.length
      ? Math.round(
          (projects.reduce((sum, project) => sum + progressRatio(project), 0) /
            projects.length) *
            100,
        )
      : 0;

    return { active, atRisk, avgProgress };
  }, [projects]);

  async function loadUsers() {
    try {
      const data = await callApi('/api/users');
      const nextUsers = data.users?.length ? data.users : APP_USERS;
      setUsers(nextUsers);
      setSelectedUserId((current) => current || data.currentUser?.id || nextUsers[0]?.id || '');
    } catch {
      setUsers(APP_USERS);
      setSelectedUserId((current) => current || APP_USERS[0].id);
    }
  }

  function callApi(url, options, organizationId = selectedOrganizationId) {
    return api(url, options, {
      token: authSession?.token || '',
      userId: canSwitchUser ? currentUserId : '',
      organizationId,
    });
  }

  async function loadProjects(
    organizationId = selectedOrganizationId,
    { resetSelection = false } = {},
  ) {
    setLoading(true);
    setError('');
    try {
      const data = await callApi('/api/projects', undefined, organizationId);
      setPermissionIssue(null);
      setProjects(data.projects);
      setSelectedProjectId((current) =>
        resetSelection ? data.projects[0]?.id || '' : current || data.projects[0]?.id || '',
      );
      await loadPlatform(organizationId);
      await loadPersonalTaskQueue(organizationId);
    } catch (apiError) {
      if (apiError.status === 401) {
        clearAuthenticatedSession(apiError.message);
        return;
      }
      handleApiError(apiError);
    } finally {
      setLoading(false);
    }
  }

  async function loadPlatform(organizationId = selectedOrganizationId) {
    try {
      const data = await callApi('/api/platform', undefined, organizationId);
      setPlatform(data.platform || null);
    } catch {
      setPlatform(null);
    }
  }

  async function loadPersonalTaskQueue(organizationId = selectedOrganizationId) {
    try {
      const data = await callApi('/api/me/tasks', undefined, organizationId);
      setPersonalTaskQueue(data);
    } catch {
      setPersonalTaskQueue(null);
    }
  }

  async function loadProject(projectId, organizationId = selectedOrganizationId) {
    const requestId = ++projectDetailRequestRef.current;
    setError('');
    try {
      const data = await callApi(`/api/projects/${projectId}`, undefined, organizationId);
      if (requestId !== projectDetailRequestRef.current || organizationRef.current !== organizationId) {
        return;
      }
      setSelectedProject(data.project);
    } catch (apiError) {
      if (requestId !== projectDetailRequestRef.current || organizationRef.current !== organizationId) {
        return;
      }
      handleApiError(apiError);
    }
  }

  async function login(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const data = await api(
        '/api/auth/login',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(loginForm),
        },
        { organizationId: selectedOrganizationId },
      );
      const nextSession = {
        token: data.token,
        user: data.session?.currentUser,
        authMode: data.session?.authMode || 'strict',
        allowUserSwitching: Boolean(data.session?.allowUserSwitching),
      };
      writeStoredAuthSession(nextSession);
      setAuthSession(nextSession);
      setSelectedUserId(data.session?.currentUser?.id || APP_USERS[0].id);
      isUserManuallySelectedRef.current = false;
      setIsUserManuallySelected(false);
      setSelectedOrganizationId(data.session?.currentOrganization?.id || DEFAULT_ORGANIZATION_ID);
    } catch (apiError) {
      clearStoredAuthSession();
      setAuthSession(null);
      setPermissionIssue(null);
      setError(apiError.message);
    } finally {
      setBusy(false);
    }
  }

  function logout() {
    clearAuthenticatedSession('');
  }

  function clearAuthenticatedSession(message = '') {
    clearStoredAuthSession();
    setAuthSession(null);
    setProjects([]);
    setPlatform(null);
    setPersonalTaskQueue(null);
    setSelectedProjectId('');
    setSelectedProject(null);
    setActionNote('');
    setFocusedStageConfirmation(null);
    setPermissionIssue(null);
    setError(message);
  }

  function handleApiError(apiError) {
    if (apiError.status === 401) {
      clearAuthenticatedSession(apiError.message);
      return;
    }

    if (apiError.status === 403) {
      setPermissionIssue({
        message: apiError.message,
        details: apiError.details || {},
      });
      setError('');
      return;
    }

    setPermissionIssue(null);
    setError(apiError.message || '请求失败');
  }

  async function queuePlatformJob() {
    if (!selectedProject) {
      return;
    }

    const recommendedJob = selectedProject.projectAutomationPlan?.recommendedJob;
    if (recommendedJob) {
      await queuePlatformJobFromPayload(recommendedJob);
      return;
    }

    const defaultCommand = selectedProject.repositoryConfig?.verificationCommands?.[0] || '';
    await queuePlatformJobFromPayload({
      type: 'ai-development',
      title: 'AI coding 后台任务',
      command: defaultCommand,
    });
  }

  async function queueProjectAutomationJob(recommendedJob) {
    if (!recommendedJob) {
      return;
    }

    await queuePlatformJobFromPayload(recommendedJob);
  }

  async function queuePlatformJobFromPayload(jobPayload) {
    if (!selectedProject) {
      return;
    }

    setBusy(true);
    setError('');
    try {
      const data = await callApi(`/api/projects/${selectedProject.id}/platform-jobs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: jobPayload.type || 'ai-development',
          title: jobPayload.title || '',
          command: jobPayload.command || '',
          source: jobPayload.source || 'platform-control',
          details: jobPayload.details || {},
        }),
      });
      setSelectedProject(data.project);
      setProjects((current) =>
        current.map((item) => (item.id === data.project.id ? toSummary(data.project) : item)),
      );
      setPlatform(data.platform || null);
    } catch (apiError) {
      handleApiError(apiError);
    } finally {
      setBusy(false);
    }
  }

  async function queueDefectFixPlatformJob() {
    if (!selectedProject?.defectFixPackage) {
      return;
    }

    const defectFixPackage = selectedProject.defectFixPackage;
    const defaultCommand = selectedProject.repositoryConfig?.verificationCommands?.[0] || '';
    setBusy(true);
    setError('');
    try {
      const data = await callApi(`/api/projects/${selectedProject.id}/platform-jobs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'qa-defect-fix',
          title: 'QA 缺陷修复执行',
          command: defaultCommand,
          source: 'qa-defect-fix',
          details: {
            defectFixSourceCommitHash: defectFixPackage.sourceCommitHash || '',
            qaPassRate: defectFixPackage.qaPassRate || '',
            requiredFixes: defectFixPackage.requiredFixes || [],
            regressionFocus: defectFixPackage.regressionFocus || [],
            sandboxPolicy: 'project-verification-command-allowlist',
          },
        }),
      });
      setSelectedProject(data.project);
      setProjects((current) =>
        current.map((item) => (item.id === data.project.id ? toSummary(data.project) : item)),
      );
      setPlatform(data.platform || null);
    } catch (apiError) {
      handleApiError(apiError);
    } finally {
      setBusy(false);
    }
  }

  async function updatePlatformJob(job, action) {
    if (!job?.projectId || !job?.id) {
      return;
    }

    const actionBodies = {
      complete: { resultSummary: '管理后台确认任务完成。' },
      cancel: { reason: '管理后台取消任务。' },
      fail: { errorSummary: '管理后台标记任务失败。' },
      reclaim: { reason: '管理后台回收过期 worker lease。' },
      retry: {},
      start: { execute: true },
    };

    setBusy(true);
    setError('');
    try {
      const data = await callApi(`/api/projects/${job.projectId}/platform-jobs/${job.id}/${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(actionBodies[action] || {}),
      });
      if (data.project) {
        setSelectedProject(data.project);
        setSelectedProjectId(data.project.id);
        setProjects((current) =>
          current.map((item) => (item.id === data.project.id ? toSummary(data.project) : item)),
        );
      }
      setPlatform(data.platform || null);
    } catch (apiError) {
      handleApiError(apiError);
    } finally {
      setBusy(false);
    }
  }

  async function updateNotificationAction(actionItem, status) {
    if (!actionItem?.projectId || !actionItem?.id) {
      return;
    }

    const targetRole = actionItem.assigneeRole || actionItem.targetRole || 'owner';
    const targetRoleLabel = actionItem.assigneeName || actionItem.targetRoleLabel || targetRole;
    const payload = {
      status,
      note: `${notificationActionStatusLabel(status)} from cockpit.`,
    };
    if (status === 'assigned') {
      payload.assigneeRole = targetRole;
      payload.assigneeUserId = actionItem.assigneeUserId || '';
      payload.assigneeName = targetRoleLabel;
    }
    if (status === 'resolved') {
      payload.resolution = 'Resolved from cockpit.';
    }

    setBusy(true);
    setError('');
    try {
      const data = await callApi(
        `/api/projects/${actionItem.projectId}/notification-actions/${actionItem.id}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        },
      );
      if (data.project) {
        setSelectedProject(data.project);
        setSelectedProjectId(data.project.id);
        setProjects((current) =>
          current.map((item) => (item.id === data.project.id ? toSummary(data.project) : item)),
        );
      }
      setPlatform(data.platform || null);
    } catch (apiError) {
      handleApiError(apiError);
    } finally {
      setBusy(false);
    }
  }

  async function sendOwnerEscalation(message) {
    if (!message?.projectId || !message?.id || message.status === 'sent') {
      return;
    }

    const payload = {
      role: message.role || '',
      roleLabel: message.roleLabel || '',
      recipientUserId: message.recipientUserId || '',
      recipientName: message.recipientName || '',
      stageId: message.stageId || '',
      stageName: message.stageName || '',
      escalationLevel: message.escalationLevel || '',
      overdueHours: message.overdueHours || 0,
      subject: message.subject || '',
      body: message.body || '',
      note: 'Sent from owner cockpit.',
    };

    setBusy(true);
    setError('');
    try {
      const data = await callApi(
        `/api/projects/${message.projectId}/owner-escalations/${message.id}/send`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        },
      );
      if (data.project) {
        setSelectedProject(data.project);
        setSelectedProjectId(data.project.id);
        setProjects((current) =>
          current.map((item) => (item.id === data.project.id ? toSummary(data.project) : item)),
        );
      }
      setPlatform(data.platform || null);
    } catch (apiError) {
      handleApiError(apiError);
    } finally {
      setBusy(false);
    }
  }

  async function acknowledgeOwnerEscalation(task) {
    const messageId = task?.escalationMessageId || task?.id || '';
    if (!task?.projectId || !messageId) {
      return;
    }

    setBusy(true);
    setError('');
    try {
      const data = await callApi(
        `/api/projects/${task.projectId}/owner-escalations/${messageId}/acknowledge`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ note: 'Acknowledged from personal workspace.' }),
        },
      );
      if (data.project) {
        setSelectedProject(data.project);
        setSelectedProjectId(data.project.id);
        setProjects((current) =>
          current.map((item) => (item.id === data.project.id ? toSummary(data.project) : item)),
        );
      }
      if (data.platform) {
        setPlatform(data.platform);
      }
      if (data.personalTaskQueue) {
        setPersonalTaskQueue(data.personalTaskQueue);
      } else {
        await loadPersonalTaskQueue();
      }
    } catch (apiError) {
      handleApiError(apiError);
    } finally {
      setBusy(false);
    }
  }

  async function createNewProject(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    setPermissionIssue(null);
    try {
      const data = await callApi('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      setForm(emptyForm);
      setActionNote('');
      setSelectedProject(data.project);
      setSelectedProjectId(data.project.id);
      setProjects((current) => [toSummary(data.project), ...current]);
      setIsProjectCreateOpen(false);
      setActiveDestination('delivery');
      loadPlatform();
    } catch (apiError) {
      handleApiError(apiError);
    } finally {
      setBusy(false);
    }
  }

  async function runStageAction(action) {
    if (!selectedProject) {
      return;
    }

    setBusy(true);
    setError('');
    try {
      const actor = selectedProject.currentStageId === PM_STAGE_ID ? '项目经理' : '负责人';
      const data = await callApi(`/api/projects/${selectedProject.id}/${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          actor,
          note: actionNote,
          archiveVersion:
            selectedProject.currentStageId === ACCEPTANCE_STAGE_ID
              ? acceptanceSignoffDraft.archiveVersion
              : '',
          expectedStageId: selectedProject.currentStageId,
        }),
      });
      updateProjectState(data.project);
      setActionNote('');
      setAcceptanceSignoffDraft(createAcceptanceSignoffDraft(data.project.acceptancePackage));
    } catch (apiError) {
      handleApiError(apiError);
    } finally {
      setBusy(false);
    }
  }

  async function saveRequirementAnswer(question) {
    if (!selectedProject) {
      return;
    }

    setBusy(true);
    setError('');
    try {
      const data = await callApi(`/api/projects/${selectedProject.id}/requirements`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          actor: '项目经理',
          questionId: question.id,
          answer: requirementDrafts[question.id] || '',
        }),
      });
      updateProjectState(data.project);
    } catch (apiError) {
      handleApiError(apiError);
    } finally {
      setBusy(false);
    }
  }

  async function reviewRequirements() {
    if (!selectedProject) {
      return;
    }

    setBusy(true);
    setError('');
    try {
      const data = await callApi(`/api/projects/${selectedProject.id}/review-requirements`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actor: '项目经理' }),
      });
      updateProjectState(data.project);
    } catch (apiError) {
      handleApiError(apiError);
    } finally {
      setBusy(false);
    }
  }

  async function generatePrd() {
    if (!selectedProject) {
      return;
    }

    setBusy(true);
    setError('');
    try {
      const data = await callApi(`/api/projects/${selectedProject.id}/generate-prd`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actor: '项目经理' }),
      });
      updateProjectState(data.project);
    } catch (apiError) {
      handleApiError(apiError);
    } finally {
      setBusy(false);
    }
  }

  async function startDevelopmentRun() {
    if (!selectedProject) {
      return;
    }

    setBusy(true);
    setError('');
    try {
      const data = await callApi(`/api/projects/${selectedProject.id}/run-development`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actor: 'AI 开发' }),
      });
      updateProjectState(data.project);
    } catch (apiError) {
      handleApiError(apiError);
    } finally {
      setBusy(false);
    }
  }

  async function runDevelopmentChecks() {
    if (!selectedProject) {
      return;
    }

    setBusy(true);
    setError('');
    try {
      const data = await callApi(`/api/projects/${selectedProject.id}/run-development-checks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actor: 'Local Runner' }),
      });
      updateProjectState(data.project);
    } catch (apiError) {
      handleApiError(apiError);
    } finally {
      setBusy(false);
    }
  }

  async function runCodeReview() {
    if (!selectedProject) {
      return;
    }

    setBusy(true);
    setError('');
    try {
      const data = await callApi(`/api/projects/${selectedProject.id}/run-code-review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actor: '技术负责人' }),
      });
      updateProjectState(data.project);
    } catch (apiError) {
      handleApiError(apiError);
    } finally {
      setBusy(false);
    }
  }

  async function runQa() {
    if (!selectedProject) {
      return;
    }

    setBusy(true);
    setError('');
    try {
      const data = await callApi(`/api/projects/${selectedProject.id}/run-qa`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actor: '测试' }),
      });
      updateProjectState(data.project);
    } catch (apiError) {
      handleApiError(apiError);
    } finally {
      setBusy(false);
    }
  }

  async function saveQaEvidence(event) {
    event.preventDefault();
    if (!selectedProject) {
      return;
    }

    setBusy(true);
    setError('');
    try {
      const data = await callApi(`/api/projects/${selectedProject.id}/qa-evidence`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...qaEvidenceDraft,
          durationMinutes: Number(qaEvidenceDraft.durationMinutes),
          totalDetections: parseOptionalNumber(qaEvidenceDraft.totalDetections),
          falsePositiveCount: parseOptionalNumber(qaEvidenceDraft.falsePositiveCount),
          falsePositiveThreshold: parseOptionalNumber(qaEvidenceDraft.falsePositiveThreshold),
          actor: '测试',
        }),
      });
      updateProjectState(data.project);
    } catch (apiError) {
      handleApiError(apiError);
    } finally {
      setBusy(false);
    }
  }

  async function startYoloQaSession() {
    if (!selectedProject) {
      return;
    }

    setBusy(true);
    setError('');
    try {
      const data = await callApi(`/api/projects/${selectedProject.id}/yolo-qa-session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          actor: '测试',
          sampleSet: qaEvidenceDraft.sampleSet,
          environment: qaEvidenceDraft.environment,
          browserScope: qaEvidenceDraft.browserScope,
          channels: selectedProject.yoloRuntime?.config?.channels || [72, 73, 74, 75],
          falsePositiveThreshold: parseOptionalNumber(qaEvidenceDraft.falsePositiveThreshold) ?? 0.3,
        }),
      });
      updateProjectState(data.project);
    } catch (apiError) {
      handleApiError(apiError);
    } finally {
      setBusy(false);
    }
  }

  async function recordYoloQaEvent(event) {
    event.preventDefault();
    if (!selectedProject) {
      return;
    }

    setBusy(true);
    setError('');
    try {
      const data = await callApi(`/api/projects/${selectedProject.id}/yolo-qa-session/events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          actor: '测试',
          channel: parseOptionalNumber(yoloQaEventDraft.channel),
          personCount: parseOptionalNumber(yoloQaEventDraft.personCount) ?? 1,
          confidence: parseOptionalNumber(yoloQaEventDraft.confidence),
          snapshotUrl: yoloQaEventDraft.snapshotUrl,
        }),
      });
      updateProjectState(data.project);
      setYoloQaEventDraft(createYoloQaEventDraft(data.project.yoloQaSession));
    } catch (apiError) {
      handleApiError(apiError);
    } finally {
      setBusy(false);
    }
  }

  async function reviewYoloQaEvent(eventId, reviewStatus) {
    if (!selectedProject) {
      return;
    }

    setBusy(true);
    setError('');
    try {
      const data = await callApi(
        `/api/projects/${selectedProject.id}/yolo-qa-session/events/${encodeURIComponent(eventId)}/review`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ actor: '测试', reviewStatus }),
        },
      );
      updateProjectState(data.project);
    } catch (apiError) {
      handleApiError(apiError);
    } finally {
      setBusy(false);
    }
  }

  async function completeYoloQaSession() {
    if (!selectedProject) {
      return;
    }

    setBusy(true);
    setError('');
    try {
      const data = await callApi(`/api/projects/${selectedProject.id}/yolo-qa-session/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actor: '测试' }),
      });
      updateProjectState(data.project);
    } catch (apiError) {
      handleApiError(apiError);
    } finally {
      setBusy(false);
    }
  }

  async function routeQaDefectsToDevelopment() {
    if (!selectedProject) {
      return;
    }

    setBusy(true);
    setError('');
    try {
      const data = await callApi(`/api/projects/${selectedProject.id}/route-qa-defects`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          actor: '测试',
          note: actionNote,
        }),
      });
      updateProjectState(data.project);
      setActionNote('');
    } catch (apiError) {
      handleApiError(apiError);
    } finally {
      setBusy(false);
    }
  }

  async function generateAcceptancePackage() {
    if (!selectedProject) {
      return;
    }

    setBusy(true);
    setError('');
    try {
      const data = await callApi(`/api/projects/${selectedProject.id}/generate-acceptance-package`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actor: '负责人' }),
      });
      updateProjectState(data.project);
    } catch (apiError) {
      handleApiError(apiError);
    } finally {
      setBusy(false);
    }
  }

  async function inspectRepository() {
    if (!selectedProject) {
      return;
    }

    setBusy(true);
    setError('');
    try {
      const data = await callApi(`/api/projects/${selectedProject.id}/inspect-repository`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actor: 'Local Runner' }),
      });
      updateProjectState(data.project);
    } catch (apiError) {
      handleApiError(apiError);
    } finally {
      setBusy(false);
    }
  }

  async function prepareBranch() {
    if (!selectedProject) {
      return;
    }

    setBusy(true);
    setError('');
    try {
      const data = await callApi(`/api/projects/${selectedProject.id}/prepare-branch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actor: 'Local Runner' }),
      });
      updateProjectState(data.project);
    } catch (apiError) {
      handleApiError(apiError);
    } finally {
      setBusy(false);
    }
  }

  async function bootstrapRepository() {
    if (!selectedProject) {
      return;
    }

    setBusy(true);
    setError('');
    try {
      const data = await callApi(`/api/projects/${selectedProject.id}/bootstrap-repository`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...repositoryDraft,
          actor: '技术负责人',
        }),
      });
      updateProjectState(data.project);
    } catch (apiError) {
      handleApiError(apiError);
    } finally {
      setBusy(false);
    }
  }

  async function generateDevelopmentPackage() {
    if (!selectedProject) {
      return;
    }

    setBusy(true);
    setError('');
    try {
      const data = await callApi(`/api/projects/${selectedProject.id}/generate-development-package`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actor: 'AI Dev Lead' }),
      });
      updateProjectState(data.project);
    } catch (apiError) {
      handleApiError(apiError);
    } finally {
      setBusy(false);
    }
  }

  async function runPipelineFlowAction(action, pipelineStage) {
    const command = resolvePipelineFlowActionCommand(action, pipelineStage);
    if (!selectedProject) {
      return {
        ...command,
        message: '请先选择一个项目。',
      };
    }

    await recordPipelineFlowAction(action, pipelineStage, command);

    if (command.stageId) {
      setViewStageId(command.stageId);
      setActiveProjectTab(getWorkspaceTabForStage(command.stageId));
    }

    if (command.handler === 'openStageDetail' || command.handler === 'inspectPrerequisite') {
      setExpandedDeliverySections((current) => ({
        ...current,
        task: true,
      }));
      return command;
    }

    if (command.handler === 'generatePrd') {
      await generatePrd();
      return command;
    }

    if (command.handler === 'generateDevelopmentPackage') {
      await generateDevelopmentPackage();
      return command;
    }

    if (command.handler === 'advanceStage') {
      await runStageAction('advance');
      return command;
    }

    return command;
  }

  async function recordPipelineFlowAction(action, pipelineStage, command) {
    const workflowStageId = command.stageId || pipelineStage?.workflowStageIds?.[0] || selectedProject?.currentStageId || '';
    const data = await callApi(`/api/projects/${selectedProject.id}/pipeline-flow-actions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        actionId: action.id || '',
        actionLabel: action.label || '',
        commandHandler: command.handler || '',
        commandKind: command.kind || '',
        pipelineStageId: pipelineStage?.id || '',
        pipelineStageName: pipelineStage?.name || '',
        workflowStageId,
      }),
    });

    updateProjectState(data.project);
    if (data.platform) {
      setPlatform(data.platform);
    }
  }

  async function saveRepositoryConfig(event) {
    event.preventDefault();
    if (!selectedProject) {
      return;
    }

    setBusy(true);
    setError('');
    try {
      const data = await callApi(`/api/projects/${selectedProject.id}/repository-config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...repositoryDraft,
          actor: '技术负责人',
        }),
      });
      updateProjectState(data.project);
    } catch (apiError) {
      handleApiError(apiError);
    } finally {
      setBusy(false);
    }
  }

  async function saveProjectMembers(event) {
    event.preventDefault();
    if (!selectedProject) {
      return;
    }

    setBusy(true);
    setError('');
    try {
      const data = await callApi(`/api/projects/${selectedProject.id}/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ members: memberDrafts }),
      });
      updateProjectState(data.project);
      setMemberDrafts(normalizeProjectMembers(data.project.members, users));
    } catch (apiError) {
      handleApiError(apiError);
    } finally {
      setBusy(false);
    }
  }

  async function saveStageConfirmationItem(item, stageId = selectedProject?.currentStageId) {
    if (!selectedProject || !item) {
      return;
    }

    setBusy(true);
    setError('');
    try {
      const data = await callApi(`/api/projects/${selectedProject.id}/stage-confirmations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stageId,
          itemId: item.id,
          value: stageConfirmationDrafts[item.id] ?? item.value ?? '',
        }),
      });
      updateProjectState(data.project);
      setStageConfirmationDrafts(
        createStageConfirmationDrafts(
          data.project.stageConfirmations?.[stageId],
        ),
      );
    } catch (apiError) {
      handleApiError(apiError);
    } finally {
      setBusy(false);
    }
  }

  async function submitTaskComment(event) {
    event.preventDefault();
    if (!selectedProject || !focusedTaskDetail) {
      return;
    }

    setBusy(true);
    setError('');
    try {
      const data = await callApi(`/api/projects/${selectedProject.id}/task-comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stageId: focusedTaskDetail.stageId,
          itemId: focusedTaskDetail.itemId,
          comment: taskCommentDraft,
        }),
      });
      updateProjectState(data.project);
      setTaskCommentDraft('');
    } catch (apiError) {
      handleApiError(apiError);
    } finally {
      setBusy(false);
    }
  }

  function updateMemberDraft(roleId, userId) {
    setMemberDrafts((current) => ({
      ...current,
      [roleId]: userId,
    }));
  }

  function updateStageConfirmationDraft(itemId, value) {
    setStageConfirmationDrafts((current) => ({
      ...current,
      [itemId]: value,
    }));
  }

  function updateRepositoryDraft(field, value) {
    setRepositoryDraft((current) => ({
      ...current,
      [field]: value,
    }));
  }

  function updateQaEvidenceDraft(field, value) {
    setQaEvidenceDraft((current) => ({
      ...current,
      [field]: value,
    }));
  }

  function updateAcceptanceSignoffDraft(field, value) {
    setAcceptanceSignoffDraft((current) => ({
      ...current,
      [field]: value,
    }));
  }

  function updateProjectState(project) {
    setPermissionIssue(null);
    setSelectedProject(project);
    setSelectedProjectId(project.id);
    setProjects((current) => {
      const summary = toSummary(project);
      return current.some((item) => item.id === project.id)
        ? current.map((item) => (item.id === project.id ? summary : item))
        : [summary, ...current];
    });
    loadPlatform();
    loadPersonalTaskQueue();
  }

  async function switchOrganization(organizationId) {
    projectDetailRequestRef.current += 1;
    setSelectedOrganizationId(organizationId);
    setProjects([]);
    setPersonalTaskQueue(null);
    setFocusedStageConfirmation(null);
    setPermissionIssue(null);
    setSelectedProjectId('');
    setSelectedProject(null);
    setViewStageId('');
    setRoleInboxFilter('all');
    await loadProjects(organizationId, { resetSelection: true });
  }

  function openRoleInboxProject(projectId) {
    setFocusedStageConfirmation(null);
    setTaskCommentDraft('');
    setSelectedProjectId(projectId);
    setActiveDestination('delivery');
  }

  function openRoleInboxTask(task) {
    setTaskCommentDraft('');
    setFocusedStageConfirmation({
      ...task,
      projectId: task.projectId,
      stageId: task.stageId,
      itemId: task.itemId,
    });
    setViewStageId(task.stageId);
    setActiveProjectTab(getWorkspaceTabForStage(task.stageId));
    setSelectedProjectId(task.projectId);
    setActiveDestination('delivery');
  }

  const currentStage = selectedProject?.stages.find(
    (stage) => stage.id === selectedProject.currentStageId,
  );
  const focusedWorkflowStage =
    focusedStageConfirmation &&
    selectedProject?.id === focusedStageConfirmation?.projectId
      ? selectedProject?.stages.find((stage) => stage.id === focusedStageConfirmation.stageId)
      : null;
  const viewedStage = selectedProject?.stages.find(
    (stage) => stage.id === (viewStageId || selectedProject.currentStageId),
  );
  const stagePanelStage = focusedWorkflowStage || viewedStage || currentStage;
  const artifactStageId = viewedStage?.id || selectedProject?.currentStageId;
  const artifact = selectedProject?.artifacts?.[artifactStageId] || '当前阶段暂无产物。';
  const artifactProvider = TECHNICAL_HANDOFF_STAGE_IDS.includes(artifactStageId)
    ? selectedProject?.technicalHandoffProvider
    : selectedProject?.prdProvider;
  const currentStageConfirmation = selectedProject?.stageConfirmations?.[currentStage?.id];
  const stagePanelConfirmation = selectedProject?.stageConfirmations?.[stagePanelStage?.id];
  const missingStageConfirmationItems = currentStageConfirmation?.missingItems || [];
  const stageConfirmationGateReason = missingStageConfirmationItems.length
    ? `阶段确认事项未补齐：${missingStageConfirmationItems.map((item) => item.title).join('、')}`
    : '';
  const currentStageRisk = selectedProject?.stageRiskRegister?.[currentStage?.id];
  const stagePanelRisk = selectedProject?.stageRiskRegister?.[stagePanelStage?.id];
  const currentStageGate = useMemo(() => {
    if (!selectedProject || !currentStage?.id) {
      return null;
    }
    if (selectedProject.stageGateReport?.stageId === currentStage.id) {
      return selectedProject.stageGateReport;
    }
    return null;
  }, [currentStage?.id, selectedProject]);
  const stageRiskEntries = selectedProject
    ? selectedProject.stages
        .map((stage) => selectedProject.stageRiskRegister?.[stage.id])
        .filter(Boolean)
    : [];
  const stageRiskCount = stageRiskEntries.reduce(
    (total, entry) => total + Number(entry.potentialRisks?.length || 0),
    0,
  );
  const stageGapCount = stageRiskEntries.reduce(
    (total, entry) => total + Number(entry.functionalGaps?.length || 0),
    0,
  );
  const deliverySectionSummaries = [
    {
      id: 'task',
      metric: stagePanelStage?.owner || selectedProject?.currentOwner || '未指派',
      title: '当前任务',
    },
    {
      id: 'artifact',
      metric: artifactProvider ? providerLabel(artifactProvider) : '待生成',
      title: '阶段产物',
    },
    {
      id: 'risk',
      metric: `${stageRiskCount} 风险 / ${stageGapCount} 不足`,
      title: '风险不足',
    },
    {
      id: 'history',
      metric: `${selectedProject?.history?.length || 0} 条记录`,
      title: '流转记录',
    },
  ];
  const isPmStage = currentStage?.id === PM_STAGE_ID;
  const isDevelopmentStage = currentStage?.id === DEVELOPMENT_STAGE_ID;
  const isReviewStage = currentStage?.id === REVIEW_STAGE_ID;
  const isQaStage = currentStage?.id === QA_STAGE_ID;
  const isAcceptanceStage = currentStage?.id === ACCEPTANCE_STAGE_ID;
  const isPanelPmStage = stagePanelStage?.id === PM_STAGE_ID;
  const isPanelDevelopmentStage = stagePanelStage?.id === DEVELOPMENT_STAGE_ID;
  const isPanelReviewStage = stagePanelStage?.id === REVIEW_STAGE_ID;
  const isPanelQaStage = stagePanelStage?.id === QA_STAGE_ID;
  const isPanelAcceptanceStage = stagePanelStage?.id === ACCEPTANCE_STAGE_ID;
  const isAcceptanceSignedOff = selectedProject?.acceptancePackage?.signoffStatus === 'signed-off';
  const shouldShowTechnicalHandoff = TECHNICAL_HANDOFF_STAGE_IDS.includes(stagePanelStage?.id || '');
  const automaticUserId = getAutomaticProjectUserId(selectedProject, users);
  const canSwitchUser = Boolean(
    authSession?.authMode === 'demo' &&
      authSession?.allowUserSwitching &&
      platform?.session?.allowUserSwitching !== false,
  );
  const authenticatedUserId = authSession?.user?.id || '';
  const currentUserId =
    authSession?.token && !canSwitchUser
      ? authenticatedUserId
      : isUserManuallySelected
        ? selectedUserId
        : automaticUserId;
  const currentUser = users.find((user) => user.id === currentUserId) || users[0] || APP_USERS[0];
  const navigationItems = useMemo(() => getNavigationItems(currentUser), [currentUser]);
  const personalTaskQueueUserId = personalTaskQueue?.currentUser?.id || '';
  const isPersonalTaskQueueCurrentUser =
    !personalTaskQueueUserId || personalTaskQueueUserId === currentUser?.id;
  const activePersonalTaskQueue = isPersonalTaskQueueCurrentUser ? personalTaskQueue : null;
  const organizationOptions = platform?.session?.availableOrganizations || [];
  const selectedOrganization =
    organizationOptions.find((organization) => organization.id === selectedOrganizationId) ||
    platform?.session?.currentOrganization ||
    null;

  useEffect(() => {
    if (!authSession?.token || !canSwitchUser || !currentUser?.id) {
      return;
    }
    if (personalTaskQueue && (!personalTaskQueueUserId || personalTaskQueueUserId === currentUser.id)) {
      return;
    }

    loadPersonalTaskQueue(selectedOrganizationId);
  }, [
    authSession?.token,
    canSwitchUser,
    currentUser?.id,
    personalTaskQueue,
    personalTaskQueueUserId,
    selectedOrganizationId,
  ]);
  const roleInbox = useMemo(
    () => createRoleInbox(projects, { currentUserId: currentUser?.id || '' }),
    [projects, currentUser?.id],
  );
  const roleWorkbench = useMemo(
    () => {
      const localWorkbench = createRoleWorkbench(projects, {
        currentUser,
        personalTaskQueue: activePersonalTaskQueue,
        roleInbox,
      });
      const serverWorkbench = activePersonalTaskQueue?.workbench;
      if (!serverWorkbench) {
        return localWorkbench;
      }

      return {
        ...localWorkbench,
        ...serverWorkbench,
        tasks: serverWorkbench.tasks || localWorkbench.tasks,
        roleSummary: serverWorkbench.roleSummary || localWorkbench.roleSummary,
        actions: serverWorkbench.actions || localWorkbench.actions,
        permissionGates: serverWorkbench.permissionGates || localWorkbench.permissionGates,
        recommendedProjectId:
          serverWorkbench.recommendedProjectId || localWorkbench.recommendedProjectId,
      };
    },
    [projects, currentUser, activePersonalTaskQueue, roleInbox],
  );
  const currentUserOpenTaskCount = roleWorkbench.openTaskCount;
  const currentUserProjectCount = roleWorkbench.projectCount;
  const currentUserTasks = roleWorkbench.tasks;
  const currentUserRoleSummary = roleWorkbench.roleSummary;
  const currentUserHandoffSummary = roleWorkbench.handoffSummary;
  const currentUserActions = roleWorkbench.actions || [];
  const currentUserPermissionGates = roleWorkbench.permissionGates || [];
  const isOrganizationOwner = roleWorkbench.isOrganizationOwner;
  const visibleRoleInbox = useMemo(
    () => filterRoleInbox(roleInbox, roleInboxFilter),
    [roleInbox, roleInboxFilter],
  );

  useEffect(() => {
    setIsArtifactExpanded(false);
  }, [activeProjectTab, artifactStageId, selectedProject?.id]);

  useEffect(() => {
    setExpandedDeliverySections(DEFAULT_DELIVERY_SECTIONS);
  }, [activeProjectTab, selectedProject?.id]);

  useEffect(() => {
    setExpandedDeliveryWorkspacePanels(
      activeProjectTab === 'activity'
        ? { ...DEFAULT_DELIVERY_WORKSPACE_PANELS, evidence: true }
        : DEFAULT_DELIVERY_WORKSPACE_PANELS,
    );
  }, [activeProjectTab, selectedProject?.id]);

  function toggleDeliverySection(sectionId) {
    setExpandedDeliverySections((current) => ({
      ...current,
      [sectionId]: !current[sectionId],
    }));
  }

  function toggleDeliveryWorkspacePanel(panelId) {
    setExpandedDeliveryWorkspacePanels((current) => ({
      ...current,
      [panelId]: !current[panelId],
    }));
  }

  useEffect(() => {
    if (
      !authSession?.token ||
      roleWorkbench.mode !== 'personal' ||
      !roleWorkbench.openTaskCount ||
      !roleWorkbench.recommendedProjectId ||
      selectedProjectId === roleWorkbench.recommendedProjectId
    ) {
      return;
    }

    setSelectedProjectId(roleWorkbench.recommendedProjectId);
  }, [
    authSession?.token,
    roleWorkbench.mode,
    roleWorkbench.openTaskCount,
    roleWorkbench.recommendedProjectId,
    selectedProjectId,
  ]);
  const focusedStageConfirmationItemId =
    focusedStageConfirmation &&
    selectedProject?.id === focusedStageConfirmation?.projectId &&
    stagePanelConfirmation?.stageId === focusedStageConfirmation?.stageId
      ? focusedStageConfirmation.itemId
      : '';
  const focusedTaskDetail = useMemo(
    () => createFocusedTaskDetail(selectedProject, focusedStageConfirmation, users),
    [focusedStageConfirmation, selectedProject, users],
  );
  const focusedQaTask =
    focusedTaskDetail &&
    selectedProject?.id === focusedStageConfirmation?.projectId &&
    focusedStageConfirmation?.stageId === QA_STAGE_ID
      ? focusedTaskDetail
      : null;
  const focusedOpsTask =
    focusedTaskDetail &&
    selectedProject?.id === focusedStageConfirmation?.projectId &&
    focusedStageConfirmation?.stageId === OPS_STAGE_ID
      ? focusedTaskDetail
      : null;
  const stageConfirmationPermissionProject =
    selectedProject && stagePanelStage?.id
      ? { ...selectedProject, currentStageId: stagePanelStage.id }
      : selectedProject;
  const stageConfirmationPermission = stageConfirmationPermissionProject
    ? getProjectActionPermission(
        stageConfirmationPermissionProject,
        'update-stage-confirmations',
        currentUser,
        users,
      )
    : null;
  const advancePermission = selectedProject
    ? getProjectActionPermission(selectedProject, 'advance', currentUser, users)
    : null;
  const rejectPermission = selectedProject
    ? getProjectActionPermission(selectedProject, 'reject', currentUser, users)
    : null;
  const codeReviewPermission = selectedProject
    ? getProjectActionPermission(selectedProject, 'run-code-review', currentUser, users)
    : null;
  const qaRunPermission = selectedProject
    ? getProjectActionPermission(selectedProject, 'run-qa', currentUser, users)
    : null;
  const qaEvidencePermission = selectedProject
    ? getProjectActionPermission(selectedProject, 'qa-evidence', currentUser, users)
    : null;
  const qaDefectRoutingPermission = selectedProject
    ? getProjectActionPermission(selectedProject, 'route-qa-defects', currentUser, users)
    : null;
  const platformJobPermission = selectedProject
    ? getProjectActionPermission(selectedProject, 'queue-platform-job', currentUser, users)
    : null;
  const defectFixJobs = selectedProject
    ? (selectedProject.platformJobs || []).filter(
        (job) => job.type === 'qa-defect-fix' || job.source === 'qa-defect-fix',
      )
    : [];
  const canManageMembers =
    selectedProject && currentUser
      ? isUserAssignedToProjectRole(selectedProject, currentUser, 'owner', users)
      : false;
  const advanceLabel = isPmStage
    ? '提交需求文档审批'
    : isAcceptanceStage
      ? isAcceptanceSignedOff
        ? '项目已验收'
        : '完成项目验收'
      : '推进下一阶段';
  const advanceDisabled =
    busy ||
    !advancePermission?.allowed ||
    (currentStageGate
      ? !currentStageGate.canAdvance
      : Boolean(stageConfirmationGateReason) ||
        (isPmStage && !selectedProject?.prdApprovalReady) ||
        (isReviewStage && selectedProject?.codeReviewReport?.status !== 'passed') ||
        (isQaStage && selectedProject?.qaRun?.status !== 'passed') ||
        (isAcceptanceStage && selectedProject?.acceptancePackage?.status !== 'ready')) ||
    isAcceptanceSignedOff;
  const executionGateHints = [
    stageConfirmationGateReason,
    isPanelPmStage && !selectedProject?.prdApprovalReady
      ? '需要先通过智能需求评审并生成需求文档草稿，才能提交审批。'
      : '',
    isPanelReviewStage && selectedProject?.codeReviewReport?.status !== 'passed'
      ? '需要先通过代码、安全、性能评审，才能进入测试阶段。'
      : '',
    isPanelQaStage && selectedProject?.qaRun?.status !== 'passed'
      ? '需要先通过 QA 测试，才能进入下一阶段。'
      : '',
    isPanelAcceptanceStage && selectedProject?.acceptancePackage?.status !== 'ready'
      ? '需要先生成最终验收包，才能完成项目验收。'
      : '',
    advancePermission && !advancePermission.allowed ? advancePermission.reason : '',
    rejectPermission && !rejectPermission.allowed ? rejectPermission.reason : '',
  ].filter(Boolean);
  const shouldShowLegacyProjectSidebar = activeDestination === 'delivery';
  const shouldRenderLegacySidebar = activeDestination !== 'projects';
  const shouldShowLegacyProjectList = activeDestination !== 'operations';
  const workspaceHeading =
    activeDestination === 'delivery'
      ? selectedProject?.name || '等待创建项目'
      : getDestinationHeading(activeDestination);
  const workspaceEyebrow = getDestinationEyebrow(activeDestination);

  if (!authSession?.token) {
    return (
      <LoginScreen
        busy={busy}
        error={error}
        form={loginForm}
        onChange={setLoginForm}
        onSubmit={login}
        users={users}
      />
    );
  }

  return (
    <AppShell
      activeDestination={activeDestination}
      currentUser={currentUser}
      demoUsers={canSwitchUser ? users : []}
      navigationItems={navigationItems}
      notificationsCount={platform?.governance?.notifications?.pendingItems || 0}
      onDestinationChange={setActiveDestination}
      onLogout={logout}
      onOrganizationChange={switchOrganization}
      onUserChange={(userId) => {
        isUserManuallySelectedRef.current = true;
        setIsUserManuallySelected(true);
        setSelectedUserId(userId);
      }}
      organization={selectedOrganization}
      organizations={organizationOptions}
    >
      {activeDestination === 'projects' ? (
        <Suspense fallback={<LazyWorkspaceFallback label="项目中心" />}>
          <ProjectCenter
            loading={loading}
            onCreateProject={() => setIsProjectCreateOpen(true)}
            onOpenProject={(projectId) => {
              setSelectedProjectId(projectId);
              setActiveDestination('delivery');
            }}
            projects={projects}
          />
        </Suspense>
      ) : null}
      {isProjectCreateOpen ? (
        <div className="console-dialog-backdrop">
          <section className="console-dialog" role="dialog" aria-label="新建项目" aria-modal="true">
            <header>
              <div>
                <p className="eyebrow">新建交付</p>
                <h2>新建项目</h2>
              </div>
              <button
                className="secondary"
                onClick={() => setIsProjectCreateOpen(false)}
                type="button"
              >
                取消
              </button>
            </header>
            <form className="console-project-form" onSubmit={createNewProject}>
              <label>
                项目名称
                <input
                  value={form.name}
                  onChange={(event) => setForm({ ...form, name: event.target.value })}
                  placeholder="例如：客户门户升级"
                  required
                />
              </label>
              <label>
                负责人
                <input
                  value={form.sponsor}
                  onChange={(event) => setForm({ ...form, sponsor: event.target.value })}
                  placeholder="例如：业务负责人"
                  required
                />
              </label>
              <label>
                业务概要
                <textarea
                  value={form.summary}
                  onChange={(event) => setForm({ ...form, summary: event.target.value })}
                  placeholder="说明业务目标、当前痛点和期望结果"
                  rows="5"
                  required
                />
              </label>
              <div className="console-dialog-actions">
                <button type="submit" disabled={busy}>
                  创建项目
                </button>
              </div>
            </form>
          </section>
        </div>
      ) : null}
      {activeDestination !== 'projects' ? (
      <div className={`legacy-console-layout ${shouldShowLegacyProjectSidebar ? 'with-project-sidebar' : 'workspace-only'}`}>
      {shouldRenderLegacySidebar ? (
      <aside className="sidebar legacy-sidebar">
        <div className="brand">
          <span className="brand-mark">W</span>
          <div>
            <h1>AI 交付控制台</h1>
            <p>项目从需求到验收的流转看板</p>
          </div>
        </div>

        <form className="project-form" onSubmit={createNewProject}>
          <h2>新建项目</h2>
          <label>
            项目名称
            <input
              value={form.name}
              onChange={(event) => setForm({ ...form, name: event.target.value })}
              placeholder="例如：客户门户升级"
              required
            />
          </label>
          <label>
            负责人
            <input
              value={form.sponsor}
              onChange={(event) => setForm({ ...form, sponsor: event.target.value })}
              placeholder="例如：业务负责人"
              required
            />
          </label>
          <label>
            业务概要
            <textarea
              value={form.summary}
              onChange={(event) => setForm({ ...form, summary: event.target.value })}
              placeholder="说明业务目标、当前痛点和期望结果"
              rows="4"
              required
            />
          </label>
          <button type="submit" disabled={busy}>
            创建项目
          </button>
        </form>

        {shouldShowLegacyProjectList ? (
        <section className="project-list" aria-label="项目列表">
          <h2>项目列表</h2>
          {loading ? <p className="muted">正在加载项目...</p> : null}
          {projects.map((project) => (
            <button
              className={`project-item ${project.id === selectedProjectId ? 'selected' : ''}`}
              key={project.id}
              type="button"
              onClick={() => setSelectedProjectId(project.id)}
            >
              <span>{project.name}</span>
              <small>{project.currentStageName}</small>
              {project.openFollowupTaskCount ? (
                <div className="project-item-followups">
                  <strong>{`缺项待办 ${project.openFollowupTaskCount}`}</strong>
                  <small>{`卡住：${(project.followupTaskTargetRoleLabels || []).join('、')}`}</small>
                  <small>{`指派：${(project.followupTaskAssigneeNames || []).join('、')}`}</small>
                </div>
              ) : null}
            </button>
          ))}
          {!loading && projects.length === 0 ? <p className="muted">还没有项目。</p> : null}
        </section>
        ) : null}
      </aside>
      ) : null}

      <section className="workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">{workspaceEyebrow}</p>
            <h2>{workspaceHeading}</h2>
          </div>
          <div className="topbar-actions">
            {organizationOptions.length ? (
              <label className="organization-selector">
                当前组织
                <select
                  aria-label="当前组织"
                  value={selectedOrganizationId}
                  onChange={(event) => switchOrganization(event.target.value)}
                >
                  {organizationOptions.map((organization) => (
                    <option key={organization.id} value={organization.id}>
                      {organization.name} · {organizationPlanLabel(organization.plan)}
                    </option>
                  ))}
                </select>
                <small>{selectedOrganization?.status === 'active' ? '已启用' : '待配置'}</small>
              </label>
            ) : null}
            {canSwitchUser && selectedProject ? (
              <label className="role-selector">
                当前用户
                <select
                  aria-label="当前用户"
                  value={currentUser?.id || ''}
                  onChange={(event) => {
                    isUserManuallySelectedRef.current = true;
                    setIsUserManuallySelected(true);
                    setSelectedUserId(event.target.value);
                  }}
                >
                  {users.map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.name} · {user.roleLabel}
                    </option>
                  ))}
                </select>
                <small>当前角色：{currentUser?.roleLabel || '未知角色'}</small>
              </label>
            ) : (
              <div className="account-badge">
                <span>当前账号</span>
                <strong>{currentUser?.name || '未识别用户'}</strong>
                <small>{currentUser?.roleLabel || '未知角色'}</small>
                <button type="button" onClick={logout}>
                  退出登录
                </button>
              </div>
            )}
            <SessionPermissionSummary
              canSwitchUser={canSwitchUser}
              currentUser={currentUser}
              selectedOrganization={selectedOrganization}
              session={platform?.session}
            />
            <div className="stats">
              <Metric label="活跃项目" value={stats.active} />
              <Metric label="风险项目" value={stats.atRisk} />
              <Metric label="平均进度" value={`${stats.avgProgress}%`} />
            </div>
          </div>
        </header>

        {error ? <div className="error">{error}</div> : null}
        {permissionIssue ? <PermissionAlert issue={permissionIssue} /> : null}

        {activeDestination === 'workspace' ? (
          <section
            className="role-workspace-surface"
            aria-label={isOrganizationOwner ? '负责人工作台' : '角色工作台'}
          >
            {isOrganizationOwner ? (
              <Suspense fallback={<LazyWorkspaceFallback label="组织总览" />}>
                <OrganizationOverviewPanel
                  busy={busy}
                  localizeRoleLabel={localizeRoleLabel}
                  localizeStageName={localizeStageName}
                  localizeWorkflowText={localizeWorkflowText}
                  onSendOwnerEscalation={sendOwnerEscalation}
                  platform={platform}
                  stats={stats}
                />
              </Suspense>
            ) : (
              <Suspense fallback={<LazyWorkspaceFallback label="个人工作台" />}>
                <PersonalWorkspacePanel
                  actions={currentUserActions}
                  currentUser={currentUser}
                  formatTaskPrioritySummary={formatTaskPrioritySummary}
                  handoffSummary={currentUserHandoffSummary}
                  localizeRoleLabel={localizeRoleLabel}
                  localizeStageName={localizeStageName}
                  localizeWorkflowText={localizeWorkflowText}
                  onAcknowledgeEscalation={acknowledgeOwnerEscalation}
                  onOpenTask={openRoleInboxTask}
                  openTaskCount={currentUserOpenTaskCount}
                  permissionGates={currentUserPermissionGates}
                  projectCount={currentUserProjectCount}
                  roleSummary={currentUserRoleSummary}
                  selectedProject={selectedProject}
                  tasks={currentUserTasks}
                />
              </Suspense>
            )}
          </section>
        ) : null}

        {activeDestination === 'operations' && platform ? (
          <OperationsConsole>
            <PlatformCockpitPanel
              busy={busy}
              canQueuePlatformJob={Boolean(platformJobPermission?.allowed)}
              currentUser={currentUser}
              onQueuePlatformJob={queuePlatformJob}
              onUpdateNotificationAction={updateNotificationAction}
              onUpdatePlatformJob={updatePlatformJob}
              queueDisabledReason={platformJobPermission?.reason || ''}
              selectedProject={selectedProject}
              platform={platform}
              users={users}
            />
          </OperationsConsole>
        ) : null}

        {activeDestination === 'tasks' && projects.length ? (
          <Suspense fallback={<LazyWorkspaceFallback label="任务队列" />}>
            <TaskQueuePage
              filter={roleInboxFilter}
              inbox={visibleRoleInbox}
              onFilterChange={setRoleInboxFilter}
              onOpenProject={openRoleInboxProject}
              onOpenTask={openRoleInboxTask}
            />
          </Suspense>
        ) : null}

        {focusedTaskDetail ? (
          <TaskDetailPanel
            busy={busy}
            commentDraft={taskCommentDraft}
            onChangeComment={setTaskCommentDraft}
            onClose={() => {
              setFocusedStageConfirmation(null);
              setTaskCommentDraft('');
            }}
            onSubmitComment={submitTaskComment}
            task={focusedTaskDetail}
          />
        ) : null}

        {activeDestination === 'delivery' ? (
          <Suspense fallback={<LazyWorkspaceFallback label="交付控制" />}>
            <ProjectWorkspace
              activeTab={activeProjectTab}
              flowActionBusy={busy}
              onFlowAction={runPipelineFlowAction}
              onStageChange={(stageId) => {
                setViewStageId(stageId);
                setActiveProjectTab(getWorkspaceTabForStage(stageId));
              }}
              onTabChange={(tabId) => {
                setActiveProjectTab(tabId);
                const preferredStageId = getPreferredStageIdForTab(
                  tabId,
                  selectedProject?.stages,
                  viewStageId || selectedProject?.currentStageId,
                );
                if (preferredStageId) setViewStageId(preferredStageId);
              }}
              project={selectedProject}
              selectedStageId={viewStageId || selectedProject?.currentStageId}
            >
        {selectedProject ? (
          activeProjectTab === 'overview' ? (
            <DeliveryOverviewDashboard
              artifact={artifact}
              artifactProvider={artifactProvider}
              confirmation={stagePanelConfirmation}
              currentStageId={selectedProject.currentStageId}
              gateReason={stagePanelStage?.id === currentStage?.id ? stageConfirmationGateReason : ''}
              history={selectedProject.history}
              onOpenCurrentTask={() => {
                setActiveProjectTab(getWorkspaceTabForStage(stagePanelStage?.id || selectedProject.currentStageId));
                setExpandedDeliverySections((current) => ({ ...current, task: true }));
              }}
              project={selectedProject}
              risk={stagePanelRisk}
              stage={stagePanelStage}
              stageGapCount={stageGapCount}
              stageRiskCount={stageRiskCount}
            />
          ) : (
          <div className="delivery-workspace-layout focused" aria-label="交付工作区主体">
            <section className="delivery-main-command-panel" aria-label="主任务控制台">
            <section className="delivery-action-column" aria-label="当前动作列">
            <main className="delivery-main-area" aria-label="阶段主工作区">
            {activeProjectTab !== 'activity' ? (
            <DeliverySectionShell
              compactCollapsed
              expanded={expandedDeliverySections.task}
              id="task"
              onToggle={toggleDeliverySection}
              preview={
                <CurrentTaskCompactPreview
                  actionLabel="展开当前任务"
                  confirmation={stagePanelConfirmation}
                  currentUser={currentUser}
                  currentStageId={selectedProject.currentStageId}
                  onAction={() => toggleDeliverySection('task')}
                  project={selectedProject}
                  risk={stagePanelRisk}
                  stage={stagePanelStage}
                />
              }
              summary={`${localizeStageName(stagePanelStage?.name)} · ${stagePanelStage?.owner || '未指派'}`}
              title="当前任务"
            >
            <section aria-label="当前任务区" className="stage-panel">
              <div className="section-heading">
                <div>
                  <p className="eyebrow">当前阶段</p>
                  <h3>{localizeStageName(stagePanelStage?.name)}</h3>
                </div>
                <StatusBadge status={stagePanelStage?.status} />
              </div>
              <p className="stage-description">{stagePanelStage?.description}</p>
              <div className="owner-line">
                <span>当前负责人</span>
                <strong>{stagePanelStage?.owner}</strong>
              </div>
              <details className="task-processing-detail" aria-label="任务处理详情">
                <summary>
                  <span>
                    <strong>任务处理详情</strong>
                    <small>团队、需求、风险和阶段材料按需展开</small>
                  </span>
                  <em>展开</em>
                </summary>
              <details className="stage-support-details" aria-label="团队与清单详情">
                <summary>
                  <span>
                    <strong>团队与清单</strong>
                    <small>{`${stagePanelStage?.checklist?.length || 0} 个检查项 · 项目成员`}</small>
                  </span>
                </summary>
                <ProjectMembersPanel
                  busy={busy}
                  canManage={Boolean(canManageMembers)}
                  drafts={memberDrafts}
                  onDraftChange={updateMemberDraft}
                  onSave={saveProjectMembers}
                  project={selectedProject}
                  users={users}
                />
                <ul className="checklist">
                  {stagePanelStage?.checklist.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </details>
              {stagePanelConfirmation ? (
                <StageConfirmationPanel
                  busy={busy}
                  drafts={stageConfirmationDrafts}
                  entry={stagePanelConfirmation}
                  onDraftChange={updateStageConfirmationDraft}
                  onSave={(item) => saveStageConfirmationItem(item, stagePanelConfirmation.stageId)}
                  permission={stageConfirmationPermission}
                  focusedItemId={focusedStageConfirmationItemId}
                  project={selectedProject}
                  users={users}
                />
              ) : null}

              {stagePanelRisk ? <StageRiskPanel entry={stagePanelRisk} title="当前阶段风险" /> : null}

              {shouldShowTechnicalHandoff ? (
                <TechnicalHandoffPanel focusedTask={focusedOpsTask} project={selectedProject} />
              ) : null}

              {isPanelDevelopmentStage && selectedProject.developmentPlan ? (
                <DevelopmentPlanPanel
                  agentExecutionPackage={selectedProject.agentExecutionPackage}
                  branchPreparation={selectedProject.branchPreparation}
                  busy={busy}
                  canQueueDefectFixJob={Boolean(platformJobPermission?.allowed)}
                  defectFixPackage={selectedProject.defectFixPackage}
                  defectFixJobs={defectFixJobs}
                  inspection={selectedProject.repositoryInspection}
                  onQueueDefectFixJob={queueDefectFixPlatformJob}
                  onGenerateDevelopmentPackage={generateDevelopmentPackage}
                  onBootstrapRepository={bootstrapRepository}
                  onInspectRepository={inspectRepository}
                  onPrepareBranch={prepareBranch}
                  onRunChecks={runDevelopmentChecks}
                  onStart={startDevelopmentRun}
                  onUpdateDefectFixJob={updatePlatformJob}
                  onRepositoryDraftChange={updateRepositoryDraft}
                  onSaveRepositoryConfig={saveRepositoryConfig}
                  plan={selectedProject.developmentPlan}
                  repositoryConfig={selectedProject.repositoryConfig}
                  repositoryBootstrap={selectedProject.repositoryBootstrap}
                  repositoryDraft={repositoryDraft}
                  run={selectedProject.developmentRun}
                />
              ) : null}

              {isPanelReviewStage ? (
                <CodeReviewPanel
                  busy={busy}
                  defectFixPackage={selectedProject.defectFixPackage}
                  onRun={runCodeReview}
                  permission={codeReviewPermission}
                  report={selectedProject.codeReviewReport}
                  run={selectedProject.developmentRun}
                />
              ) : null}

              {isPanelQaStage ? (
                <QaRunPanel
                  busy={busy}
                  evidence={selectedProject.qaEvidence}
                  evidenceDraft={qaEvidenceDraft}
                  focusedTask={focusedQaTask}
                  onEvidenceDraftChange={updateQaEvidenceDraft}
                  onCompleteYoloQaSession={completeYoloQaSession}
                  onRecordYoloQaEvent={recordYoloQaEvent}
                  onRun={runQa}
                  onRouteDefects={routeQaDefectsToDevelopment}
                  onSaveEvidence={saveQaEvidence}
                  onStartYoloQaSession={startYoloQaSession}
                  onReviewYoloQaEvent={reviewYoloQaEvent}
                  permissions={{
                    evidence: qaEvidencePermission,
                    routeDefects: qaDefectRoutingPermission,
                    run: qaRunPermission,
                  }}
                  report={selectedProject.qaRun}
                  requiresFalsePositiveEvidence={
                    selectedProject.yoloDeliveryChain?.isYoloProject ||
                    selectedProject.qaEvidence?.requireFalsePositiveMetrics
                  }
                  review={selectedProject.codeReviewReport}
                  yoloQaEventDraft={yoloQaEventDraft}
                  yoloQaSession={selectedProject.yoloQaSession}
                  onYoloQaEventDraftChange={(field, value) =>
                    setYoloQaEventDraft((current) => ({ ...current, [field]: value }))
                  }
                />
              ) : null}

              {!isPanelDevelopmentStage && selectedProject.defectFixPackage ? (
                <DefectFixIterationPanel
                  busy={busy}
                  canQueueJob={Boolean(platformJobPermission?.allowed)}
                  defectFixPackage={selectedProject.defectFixPackage}
                  onQueueJob={queueDefectFixPlatformJob}
                  onUpdateJob={updatePlatformJob}
                  relatedJobs={defectFixJobs}
                />
              ) : null}

              {isPanelAcceptanceStage ? (
                <AcceptancePackagePanel
                  busy={busy}
                  onGenerate={generateAcceptancePackage}
                  pack={selectedProject.acceptancePackage}
                />
              ) : null}

              {isPanelPmStage ? (
                <RequirementPanel
                  busy={busy}
                  drafts={requirementDrafts}
                  onDraftChange={(questionId, value) =>
                    setRequirementDrafts((current) => ({ ...current, [questionId]: value }))
                  }
                  onGenerate={generatePrd}
                  onReview={reviewRequirements}
                  onSave={saveRequirementAnswer}
                  project={selectedProject}
                />
              ) : null}
              </details>

              <StageExecutionControlPanel
                actionNote={actionNote}
                advanceDisabled={advanceDisabled}
                advanceLabel={advanceLabel}
                archiveVersion={acceptanceSignoffDraft.archiveVersion}
                busy={busy}
                deliveryGateAudit={selectedProject?.deliveryGateAudit}
                deliveryFlowRehearsal={selectedProject?.deliveryFlowRehearsal}
                gateHints={executionGateHints}
                isAcceptanceSignedOff={isAcceptanceSignedOff}
                onActionNoteChange={setActionNote}
                onArchiveVersionChange={(value) => updateAcceptanceSignoffDraft('archiveVersion', value)}
                onQueueAutomationJob={queueProjectAutomationJob}
                onRunStageAction={runStageAction}
                onUpdatePlatformJob={updatePlatformJob}
                rejectPermission={rejectPermission}
                report={currentStageGate}
                projectExecutionAudit={selectedProject?.projectExecutionAudit}
                projectAutomationPlan={selectedProject?.projectAutomationPlan}
                responsibilityMatrix={selectedProject?.responsibilityMatrix}
                showArchiveVersion={
                  isPanelAcceptanceStage && selectedProject.acceptancePackage?.status === 'ready'
                }
                yoloDeliveryChain={selectedProject?.yoloDeliveryChain}
                yoloProjectId={selectedProject?.id}
              />
            </section>
            </DeliverySectionShell>
            ) : null}
            </main>
            </section>
            </section>

            <div className="delivery-auxiliary-grid" aria-label="辅助信息面板">
              <details
                className="delivery-auxiliary-drawer"
                aria-label="辅助信息抽屉"
                open={isAuxiliaryDrawerOpen}
              >
                <summary
                  onClick={(event) => {
                    event.preventDefault();
                    setIsAuxiliaryDrawerOpen((isOpen) => !isOpen);
                  }}
                >
                  <span>
                    <strong>辅助信息</strong>
                    <small>流程导航、证据与风险和交付证据按需展开</small>
                  </span>
                  <em>{isAuxiliaryDrawerOpen ? '收起' : '展开'}</em>
                </summary>
                {isAuxiliaryDrawerOpen ? (
                  <div className="delivery-auxiliary-drawer-content">
                    <DeliveryWorkspaceDetailPanel
                      activeStageId={artifactStageId}
                      artifact={artifact}
                      artifactProvider={artifactProvider}
                      confirmation={stagePanelConfirmation}
                      currentStageId={selectedProject.currentStageId}
                      gateReason={
                        stagePanelStage?.id === currentStage?.id ? stageConfirmationGateReason : ''
                      }
                      history={selectedProject.history}
                      isOpen={isDeliveryDetailPanelOpen}
                      onSelectStage={setViewStageId}
                      onToggle={() => setIsDeliveryDetailPanelOpen((isOpen) => !isOpen)}
                      onToggleTask={() => toggleDeliverySection('task')}
                      project={selectedProject}
                      projectRisks={selectedProject.risks}
                      risk={stagePanelRisk}
                      stage={stagePanelStage}
                      stageGapCount={stageGapCount}
                      stageRiskCount={stageRiskCount}
                      stages={selectedProject.stages}
                      taskExpanded={expandedDeliverySections.task}
                    />
                    <DeliveryAuxiliaryPanel
                      description="阶段入口和分区开关，按需展开。"
                      isOpen={expandedDeliveryWorkspacePanels.flow}
                      onToggle={() => toggleDeliveryWorkspacePanel('flow')}
                      panelLabel="流程导航面板"
                      title="流程导航"
                    >
                      <aside className="delivery-flow-column" aria-label="流程导航列">
                        <div className="delivery-column-heading">
                          <strong>流程导航</strong>
                          <span>只放阶段和分区入口，避免主区被导航信息挤占。</span>
                        </div>
                      <DeliverySectionGuide
                        onToggle={toggleDeliverySection}
                        sections={deliverySectionSummaries}
                        states={expandedDeliverySections}
                      />
                      </aside>
                    </DeliveryAuxiliaryPanel>
                    <DeliveryAuxiliaryPanel
                      description="阶段产物、风险和流转记录，按需核验。"
                      isOpen={expandedDeliveryWorkspacePanels.evidence}
                      onToggle={() => toggleDeliveryWorkspacePanel('evidence')}
                      panelLabel="证据风险面板"
                      title="证据与风险"
                    >
                  <section className="delivery-evidence-column" aria-label="证据与风险列">
              <div className="delivery-column-heading">
                <strong>证据与风险</strong>
                <span>产物、风险、流转记录默认速览，按需展开核验。</span>
            </div>
            <aside className="delivery-context-rail" aria-label="交付上下文栏">
            <DeliveryContextStatusPanel
              onToggle={toggleDeliverySection}
              sections={deliverySectionSummaries}
              states={expandedDeliverySections}
            />

            {!['overview', 'activity'].includes(activeProjectTab) ? (
            <DeliverySectionShell
              expanded={expandedDeliverySections.artifact}
              id="artifact"
              onToggle={toggleDeliverySection}
              preview={
                <ArtifactCompactPreview
                  artifact={artifact}
                  provider={artifactProvider}
                  stageName={viewedStage?.name || currentStage?.name}
                />
              }
              summary={`${localizeStageName(viewedStage?.name || currentStage?.name)} · ${
                artifactProvider ? providerLabel(artifactProvider) : '待生成'
              }`}
              title="阶段产物"
            >
            <section aria-label="阶段产物区" className="artifact-panel">
              <div className="section-heading">
                <div>
                  <p className="eyebrow">阶段产物</p>
                  <h3>阶段产物：{localizeStageName(viewedStage?.name || currentStage?.name)}</h3>
                </div>
                {artifactProvider ? <ProviderBadge provider={artifactProvider} /> : null}
              </div>
              <ArtifactSummaryPanel artifact={artifact} />
              <button
                className="artifact-expand-button secondary"
                type="button"
                onClick={() => setIsArtifactExpanded((expanded) => !expanded)}
              >
                {isArtifactExpanded ? '收起阶段产物原文' : '展开阶段产物原文'}
              </button>
              {isArtifactExpanded ? (
                <pre className="artifact-document">{localizeWorkflowText(artifact)}</pre>
              ) : null}
            </section>
            </DeliverySectionShell>
            ) : null}

            {['overview', 'activity'].includes(activeProjectTab) ? (
            <>
            <DeliverySectionShell
              expanded={expandedDeliverySections.risk}
              id="risk"
              onToggle={toggleDeliverySection}
              preview={
                <RiskPriorityPreview
                  activeStageId={artifactStageId}
                  entries={stageRiskEntries}
                  projectRisks={selectedProject.risks}
                  stageGapCount={stageGapCount}
                  stageRiskCount={stageRiskCount}
                />
              }
              summary={`${stageRiskCount} 个风险 · ${stageGapCount} 个功能不足`}
              title="风险不足"
            >
            <section aria-label="风险不足区" className="risk-panel">
              <div className="section-heading">
                <div>
                  <p className="eyebrow">风险不足</p>
                  <h3>风险不足</h3>
                </div>
              </div>
              <CurrentRiskListPanel risks={selectedProject.risks} />
              <StageRiskRegisterPanel activeStageId={artifactStageId} entries={stageRiskEntries} />
            </section>
            </DeliverySectionShell>
            <DeliverySectionShell
              expanded={expandedDeliverySections.history}
              id="history"
              onToggle={toggleDeliverySection}
              preview={<HistoryCompactPreview history={selectedProject.history} />}
              summary={`${selectedProject.history.length} 条流转记录`}
              title="流转记录"
            >
            <section aria-label="流转记录区" className="risk-panel">
              <div className="section-heading">
                <div>
                  <p className="eyebrow">流转记录</p>
                  <h3>流转记录</h3>
                </div>
              </div>
              <HistoryRecordPanel history={selectedProject.history} />
            </section>
            </DeliverySectionShell>
            </>
            ) : null}
            </aside>
                  </section>
                    </DeliveryAuxiliaryPanel>
                  </div>
                ) : null}
              </details>
            </div>
          </div>
          )
        ) : (
          <div className="empty-state">
            <h3>创建第一个项目后开始流转</h3>
            <p>系统会自动生成入口产物，并从项目经理需求阶段开始逐步推进。</p>
          </div>
        )}
            </ProjectWorkspace>
          </Suspense>
        ) : null}
      </section>
      </div>
      ) : null}
    </AppShell>
  );
}

function LazyWorkspaceFallback({ label }) {
  return (
    <section className="lazy-workspace-fallback" aria-label={`${label}加载状态`}>
      <span>{`${label}加载中...`}</span>
    </section>
  );
}

function DeliveryStageProgress({ activeStageId = '', onSelectStage, stages = [] }) {
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const safeStages = Array.isArray(stages) ? stages : [];
  const foundIndex = safeStages.findIndex((stage) => stage.id === activeStageId);
  const activeIndex = foundIndex >= 0 ? foundIndex : 0;
  const activeStage = safeStages[activeIndex] || safeStages[0] || {};
  const activeStageName = localizeStageName(activeStage.name || '当前阶段');
  const approvedCount = safeStages.filter((stage) => stage.status === 'approved').length;
  const blockedCount = safeStages.filter((stage) => stage.status === 'blocked').length;
  const progressLabel = safeStages.length ? `${activeIndex + 1}/${safeStages.length}` : '0/0';

  return (
    <section className="timeline-panel compact" aria-label="阶段进度条">
      <div className="stage-progress-heading">
        <div>
          <p className="eyebrow">阶段流程</p>
          <h3>阶段流转</h3>
          <span>{`当前：${activeStageName}`}</span>
        </div>
        <div className="stage-progress-count">
          <strong>{progressLabel}</strong>
          <span>{`${safeStages.length} 个阶段`}</span>
        </div>
      </div>
      <div className="stage-progress-strip" aria-label="阶段进度节点">
        {safeStages.map((stage, index) => (
          <button
            aria-label={`${localizeStageName(stage.name)} ${stageStatusLabel(stage.status)}`}
            className={`stage-progress-node ${stage.status} ${
              stage.id === activeStageId ? 'viewing' : ''
            }`}
            key={stage.id}
            type="button"
            onClick={() => onSelectStage(stage.id)}
          >
            <span>{index + 1}</span>
            <strong>{localizeStageName(stage.name)}</strong>
          </button>
        ))}
      </div>
      <div className="stage-progress-summary">
        <span>{`已完成 ${approvedCount}`}</span>
        <span>{`阻塞 ${blockedCount}`}</span>
        <span>{`查看 ${activeStageName}`}</span>
      </div>
      <details className="stage-flow-detail" aria-label="阶段流程详情" open={isDetailOpen}>
        <summary
          onClick={(event) => {
            event.preventDefault();
            setIsDetailOpen((isOpen) => !isOpen);
          }}
        >
          <span>
            <strong>完整阶段列表</strong>
            <small>展开后查看负责人和阶段状态</small>
          </span>
          <em>{isDetailOpen ? '收起' : '展开'}</em>
        </summary>
        {isDetailOpen ? (
          <div className="stage-list" aria-label="阶段按钮列表">
            {safeStages.map((stage, index) => (
              <button
                className={`stage-row ${stage.status} ${
                  stage.id === activeStageId ? 'viewing' : ''
                }`}
                key={stage.id}
                type="button"
                onClick={() => onSelectStage(stage.id)}
              >
                <span className="stage-index">{index + 1}</span>
                <span>
                  <strong>{localizeStageName(stage.name)}</strong>
                  <small>{localizeRoleLabel(stage.owner)}</small>
                </span>
                <StatusBadge status={stage.status} />
              </button>
            ))}
          </div>
        ) : null}
      </details>
    </section>
  );
}

function DeliveryWorkspaceDetailPanel({
  activeStageId,
  artifact,
  artifactProvider,
  confirmation,
  currentStageId = '',
  gateReason = '',
  history = [],
  isOpen = false,
  onSelectStage,
  onToggle,
  onToggleTask,
  project,
  projectRisks = [],
  risk,
  stage,
  stageGapCount = 0,
  stageRiskCount = 0,
  stages = [],
  taskExpanded = false,
}) {
  if (!project || !stage) {
    return null;
  }

  return (
    <details
      className="delivery-workspace-detail-panel"
      aria-label="交付详情面板"
      open={isOpen}
    >
      <summary
        onClick={(event) => {
          event.preventDefault();
          onToggle?.();
        }}
      >
        <span>
          <strong>交付详情</strong>
          <small>核验条、阶段流转和完整摘要按需展开</small>
        </span>
        <em>{isOpen ? '收起' : '展开'}</em>
      </summary>
      {isOpen ? (
        <div className="delivery-workspace-detail-content">
          <DeliveryWorkspaceSnapshot
            artifact={artifact}
            artifactProvider={artifactProvider}
            confirmation={confirmation}
            currentStageId={currentStageId}
            gateReason={gateReason}
            history={history}
            onToggleTask={onToggleTask}
            project={project}
            projectRisks={projectRisks}
            risk={risk}
            stage={stage}
            stageGapCount={stageGapCount}
            stageRiskCount={stageRiskCount}
            taskExpanded={taskExpanded}
          />
          <DeliveryStageProgress
            activeStageId={activeStageId}
            onSelectStage={onSelectStage}
            stages={stages}
          />
        </div>
      ) : null}
    </details>
  );
}

function DeliverySectionGuide({ onToggle, sections = [], states = {} }) {
  if (!sections.length) {
    return null;
  }

  const expandedTitles = sections
    .filter((section) => Boolean(states[section.id]))
    .map((section) => section.title);
  const expandedSummary = expandedTitles.length ? expandedTitles.join('、') : '暂无展开分区';

  return (
    <section className="delivery-section-guide" aria-label="交付分区导览">
      <div className="delivery-section-guide-copy">
        <p className="eyebrow">分区导览</p>
        <strong>先看当前任务，再展开证据和风险</strong>
        <span>{`当前展开：${expandedSummary}`}</span>
      </div>
      <div className="delivery-section-guide-actions" aria-label="交付分区切换">
        {sections.map((section) => {
          const isExpanded = Boolean(states[section.id]);
          return (
            <button
              aria-label={`${section.title} ${isExpanded ? '已展开' : '已收起'} ${section.metric}`}
              aria-pressed={isExpanded}
              className={isExpanded ? 'expanded' : 'collapsed'}
              key={section.id}
              onClick={() => onToggle(section.id)}
              type="button"
            >
              <span>{section.title}</span>
              <strong>{isExpanded ? '已展开' : '已收起'}</strong>
              <small>{section.metric}</small>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function DeliveryAuxiliaryPanel({ children, description, isOpen, onToggle, panelLabel, title }) {
  return (
    <details className="delivery-auxiliary-panel" aria-label={panelLabel} open={isOpen}>
      <summary
        onClick={(event) => {
          event.preventDefault();
          onToggle?.();
        }}
      >
        <span>
          <strong>{title}</strong>
          <small>{description}</small>
        </span>
        <em>{isOpen ? '收起' : '展开'}</em>
      </summary>
      {isOpen ? <div className="delivery-auxiliary-content">{children}</div> : null}
    </details>
  );
}

function DeliveryWorkspaceSnapshot({
  artifact,
  artifactProvider,
  confirmation,
  currentStageId = '',
  gateReason = '',
  history = [],
  onToggleTask,
  project,
  projectRisks = [],
  stage,
  stageGapCount = 0,
  stageRiskCount = 0,
  taskExpanded = false,
}) {
  const [isDigestOpen, setIsDigestOpen] = useState(false);

  if (!project || !stage) {
    return null;
  }

  const isCurrentStage = stage.id === currentStageId;
  const artifactSummary = getArtifactSummary(artifact);
  const artifactSource = artifactProvider ? providerLabel(artifactProvider) : '待生成';
  const missingItems = Array.isArray(confirmation?.missingItems) ? confirmation.missingItems : [];
  const openTaskCount = isCurrentStage ? Number(project.openFollowupTaskCount || 0) : 0;
  const missingCount = Math.max(missingItems.length, openTaskCount);
  const owner = localizeRoleLabel(stage.owner || project.currentOwner || project.sponsor || '未指派');
  const stageName = localizeStageName(stage.name || project.currentStageName || '当前阶段');
  const totalRiskCount = Number(projectRisks.length || 0) + Number(stageRiskCount || 0);
  const totalGapCount = Number(stageGapCount || 0);
  const historyCount = history.length;
  const nextAction =
    gateReason ||
    stageNextAction({
      gapCount: totalGapCount,
      missingCount,
      riskCount: totalRiskCount,
      status: stage.status,
    });

  return (
    <section className="delivery-workspace-snapshot" aria-label="交付一屏摘要">
      <div className="delivery-workspace-focus-strip">
        <div className="delivery-workspace-focus-main">
          <p className="eyebrow">当前处理焦点</p>
          <strong>{stageName}</strong>
          <span>{`负责人：${owner} · 状态 ${stageStatusLabel(stage.status)}`}</span>
        </div>
        <div className="delivery-workspace-focus-metrics" aria-label="当前处理焦点指标">
          <span>{`确认缺项 ${missingCount}`}</span>
          <span>{`待办 ${openTaskCount}`}</span>
          <span>{`风险不足 ${totalRiskCount + totalGapCount}`}</span>
        </div>
        <div className="delivery-workspace-focus-next">
          <span>下一步动作</span>
          <strong>{localizeWorkflowText(nextAction)}</strong>
        </div>
        <button
          aria-label={`${taskExpanded ? '收起' : '展开'}当前任务详情`}
          className="secondary"
          type="button"
          onClick={onToggleTask}
        >
          {taskExpanded ? '收起任务详情' : '展开任务详情'}
        </button>
      </div>
      <div className="delivery-workspace-check-strip" aria-label="交付核验条">
        <article className={missingCount ? 'warning' : 'ready'} aria-label="核验条-当前任务">
          <span>当前任务</span>
          <strong>{stageName}</strong>
          <small>{`确认缺项 ${missingCount} · 待办 ${openTaskCount}`}</small>
        </article>
        <article className="artifact" aria-label="核验条-阶段产物">
          <span>阶段产物</span>
          <strong>{artifactSummary.title}</strong>
          <small>{`来源：${artifactSource}`}</small>
        </article>
        <article
          className={totalRiskCount + totalGapCount ? 'warning' : 'ready'}
          aria-label="核验条-风险不足"
        >
          <span>风险不足</span>
          <strong>{totalRiskCount + totalGapCount}</strong>
          <small>{`${totalRiskCount} 风险 / ${totalGapCount} 不足`}</small>
        </article>
        <article className="history" aria-label="核验条-流转记录">
          <span>流转记录</span>
          <strong>{historyCount}</strong>
          <small>{`${historyCount} 条记录`}</small>
        </article>
      </div>
      <details className="delivery-workspace-snapshot-detail" aria-label="完整交付摘要" open={isDigestOpen}>
        <summary
          onClick={(event) => {
            event.preventDefault();
            setIsDigestOpen((isOpen) => !isOpen);
          }}
        >
          <span>
            <strong>完整交付摘要</strong>
            <small>当前任务、阶段产物、风险不足和流转记录</small>
          </span>
          <em>{isDigestOpen ? '收起' : '展开'}</em>
        </summary>
        {isDigestOpen ? (
          <div className="delivery-workspace-snapshot-grid">
            <article className={missingCount ? 'warning' : 'ready'} aria-label="一屏摘要-当前任务">
              <span>当前任务</span>
              <strong>{stageName}</strong>
              <small>{`负责人：${owner}`}</small>
              <div>
                <small>{`状态 ${stageStatusLabel(stage.status)}`}</small>
                <small>{`确认缺项 ${missingCount}`}</small>
                <small>{`待办 ${openTaskCount}`}</small>
              </div>
            </article>
            <article className="artifact" aria-label="一屏摘要-阶段产物">
              <span>阶段产物</span>
              <strong>{artifactSummary.title}</strong>
              <small>{`来源：${artifactSource}`}</small>
              <div>
                <small>{`章节 ${artifactSummary.headingCount}`}</small>
                <small>{`清单 ${artifactSummary.listItemCount}`}</small>
              </div>
            </article>
            <article
              className={totalRiskCount + totalGapCount ? 'warning' : 'ready'}
              aria-label="一屏摘要-风险不足"
            >
              <span>风险不足</span>
              <strong>{totalRiskCount + totalGapCount}</strong>
              <small>{`${totalRiskCount} 风险 / ${totalGapCount} 不足`}</small>
              <div>
                <small>{totalRiskCount + totalGapCount ? '需要跟踪' : '风险可控'}</small>
              </div>
            </article>
            <article className="history" aria-label="一屏摘要-流转记录">
              <span>流转记录</span>
              <strong>{historyCount}</strong>
              <small>{`${historyCount} 条记录`}</small>
              <div>
                <small>{historyCount ? '已有流转' : '暂无记录'}</small>
              </div>
            </article>
          </div>
        ) : null}
      </details>
    </section>
  );
}

function EvidenceRiskDigest({
  artifact,
  artifactProvider,
  history = [],
  projectRisks = [],
  stageGapCount = 0,
  stageName,
  stageRiskCount = 0,
}) {
  const artifactSummary = getArtifactSummary(artifact);
  const artifactSource = artifactProvider ? providerLabel(artifactProvider) : '待生成';
  const totalRiskCount = Number(projectRisks.length || 0) + Number(stageRiskCount || 0);
  const totalGapCount = Number(stageGapCount || 0);
  const historyCount = history.length;

  return (
    <section aria-label="证据与风险摘要" className="evidence-risk-digest">
      <div className="evidence-risk-digest-heading">
        <div>
          <p className="eyebrow">右侧摘要</p>
          <strong>证据与风险摘要</strong>
        </div>
        <span>一屏核验当前产物、风险和流转记录。</span>
      </div>
      <div className="evidence-risk-digest-grid">
        <article aria-label="摘要-阶段产物" className="evidence-risk-digest-card artifact">
          <span>阶段产物</span>
          <strong>{artifactSummary.title}</strong>
          <small>{`来源：${artifactSource}`}</small>
          <small>{localizeStageName(stageName || '当前阶段')}</small>
        </article>
        <article aria-label="摘要-风险不足" className="evidence-risk-digest-card risk">
          <span>风险不足</span>
          <strong>{totalRiskCount + totalGapCount}</strong>
          <small>{`${totalRiskCount} 风险 / ${totalGapCount} 不足`}</small>
        </article>
        <article aria-label="摘要-流转记录" className="evidence-risk-digest-card history">
          <span>流转记录</span>
          <strong>{historyCount}</strong>
          <small>{`${historyCount} 条记录`}</small>
        </article>
      </div>
    </section>
  );
}

function getStageOpenTaskCount(project, stageId) {
  if (!project) {
    return 0;
  }

  if (!stageId || stageId === project.currentStageId) {
    return Number(project.openFollowupTaskCount || 0);
  }

  return (project.followupTaskAssignments || []).reduce((total, assignment) => {
    const taskCount = (assignment.tasks || []).filter(
      (task) => task.stageId === stageId && task.status !== 'resolved' && task.status !== 'closed',
    ).length;

    return total + taskCount;
  }, 0);
}

function getRoleViewDigestMessage(currentUser) {
  const roleText = `${currentUser?.role || ''} ${currentUser?.roleLabel || ''}`;

  if (/owner|负责人/i.test(roleText)) {
    return '负责人可查看全部阶段、阻塞和验收状态。';
  }

  if (/pm|项目经理/i.test(roleText)) {
    return '项目经理优先处理需求确认、需求文档和追问待办。';
  }

  if (/tech|review|技术负责人/i.test(roleText)) {
    return '技术负责人优先处理方案、代码、安全和性能评审。';
  }

  if (/qa|test|测试/i.test(roleText)) {
    return '测试优先处理测试证据、缺陷和回归结果。';
  }

  if (/ops|运维/i.test(roleText)) {
    return '运维优先处理环境、部署、日志和连通性。';
  }

  if (/ai-dev|开发/i.test(roleText)) {
    return '开发优先处理任务包、代码实现和修复回流。';
  }

  return '当前角色优先处理自己被指派的阶段任务。';
}

function DeliveryContextStatusPanel({ onToggle, sections = [], states = {} }) {
  if (!sections.length) {
    return null;
  }

  return (
    <section className="delivery-context-status-panel" aria-label="交付状态面板">
      <div className="delivery-context-status-heading">
        <p className="eyebrow">交付状态</p>
        <strong>交付状态面板</strong>
        <span>{`${sections.length} 个分区`}</span>
      </div>
      {sections.map((section) => (
        <button
          aria-label={`${section.title} ${states[section.id] ? '已展开' : '已收起'} ${section.metric}`}
          aria-pressed={Boolean(states[section.id])}
          className={`delivery-context-status-item ${
            states[section.id] ? 'expanded' : 'collapsed'
          }`}
          key={section.id}
          onClick={() => onToggle(section.id)}
          type="button"
        >
          <span>{section.title}</span>
          <strong>{states[section.id] ? '已展开' : '已收起'}</strong>
          <small>{section.metric}</small>
        </button>
      ))}
    </section>
  );
}

function DeliverySectionShell({
  children,
  compactCollapsed = false,
  expanded,
  id,
  onToggle,
  preview,
  summary,
  title,
}) {
  if (compactCollapsed && !expanded) {
    return (
      <section className="delivery-collapsible-section compact collapsed">
        {preview ? <div className="delivery-section-shell-preview compact">{preview}</div> : null}
      </section>
    );
  }

  return (
    <section className={`delivery-collapsible-section ${expanded ? 'expanded' : 'collapsed'}`}>
      <div className="delivery-section-shell-heading">
        <div>
          <p className="eyebrow">{title}</p>
          <strong>{title}</strong>
          {summary ? <span>{summary}</span> : null}
        </div>
        <button
          className="secondary"
          type="button"
          onClick={() => onToggle(id)}
          aria-expanded={expanded}
        >
          {expanded ? `收起${title}` : `展开${title}`}
        </button>
      </div>
      {!expanded && preview ? <div className="delivery-section-shell-preview">{preview}</div> : null}
      {expanded ? <div className="delivery-section-shell-body">{children}</div> : null}
    </section>
  );
}

function DeliveryMainOperationSummary({
  confirmation,
  currentStageId = '',
  gateReason = '',
  onToggleTask,
  project,
  risk,
  stage,
  taskExpanded = false,
}) {
  if (!project || !stage) {
    return null;
  }

  const isCurrentStage = stage.id === currentStageId;
  const missingItems = Array.isArray(confirmation?.missingItems) ? confirmation.missingItems : [];
  const openTaskCount = isCurrentStage ? Number(project.openFollowupTaskCount || 0) : 0;
  const missingCount = Math.max(missingItems.length, openTaskCount);
  const riskCount = Array.isArray(risk?.potentialRisks) ? risk.potentialRisks.length : 0;
  const gapCount = Array.isArray(risk?.functionalGaps) ? risk.functionalGaps.length : 0;
  const stageName = localizeStageName(stage.name || project.currentStageName || '当前阶段');
  const nextAction =
    gateReason ||
    stageNextAction({
      gapCount,
      missingCount,
      riskCount,
      status: stage.status,
    });
  const attentionCount = missingCount + riskCount + gapCount;
  const owner = stage.owner || project.currentOwner || project.sponsor || '未指派';

  return (
    <section
      className={`delivery-main-operation-summary ${attentionCount ? 'needs-attention' : 'ready'}`}
      aria-label="主操作摘要"
    >
      <div className="delivery-main-operation-copy">
        <p className="eyebrow">主操作摘要</p>
        <strong>{stageName}</strong>
        <p>{stage.description || project.summary || '当前阶段暂无说明。'}</p>
      </div>
      <div className="delivery-main-operation-facts" aria-label="主操作指标">
        <span>{`负责人：${owner}`}</span>
        <span>{`状态 ${stageStatusLabel(stage.status)}`}</span>
        <span className={missingCount ? 'warning' : 'ready'}>{`确认缺项 ${missingCount}`}</span>
        <span className={openTaskCount ? 'warning' : 'ready'}>{`待办 ${openTaskCount}`}</span>
        <span className={riskCount + gapCount ? 'warning' : 'ready'}>
          {`风险不足 ${riskCount + gapCount}`}
        </span>
      </div>
      <div className="delivery-main-operation-next">
        <span>下一步动作</span>
        <strong>{localizeWorkflowText(nextAction)}</strong>
        <div className="delivery-main-operation-tags" aria-label="主操作标签">
          <small>{missingCount ? `待补确认 ${missingCount}` : '确认项齐备'}</small>
          <small>{isCurrentStage ? '当前阶段' : '查看阶段'}</small>
          <small>{riskCount + gapCount ? `风险不足 ${riskCount + gapCount}` : '风险可控'}</small>
        </div>
        <button
          aria-label={`${taskExpanded ? '收起' : '展开'}主操作区 当前任务`}
          className="secondary"
          type="button"
          onClick={onToggleTask}
        >
          <span>{taskExpanded ? '收起任务区' : '展开任务区'}</span>
          <small>当前任务</small>
        </button>
      </div>
    </section>
  );
}

function CurrentTaskCompactPreview({
  actionLabel,
  confirmation,
  currentUser,
  currentStageId = '',
  onAction,
  project,
  risk,
  stage,
}) {
  if (!project || !stage) {
    return null;
  }

  const isCurrentStage = stage.id === currentStageId;
  const missingItems = Array.isArray(confirmation?.missingItems) ? confirmation.missingItems : [];
  const openTaskCount = isCurrentStage ? Number(project.openFollowupTaskCount || 0) : 0;
  const missingCount = Math.max(missingItems.length, openTaskCount);
  const riskCount = Array.isArray(risk?.potentialRisks) ? risk.potentialRisks.length : 0;
  const gapCount = Array.isArray(risk?.functionalGaps) ? risk.functionalGaps.length : 0;
  const checklistCount = Array.isArray(stage.checklist) ? stage.checklist.length : 0;
  const owner = localizeRoleLabel(stage.owner || project.currentOwner || project.sponsor || '未指派');
  const stageName = localizeStageName(stage.name || project.currentStageName || '当前阶段');
  const roleLabel = localizeRoleLabel(currentUser?.roleLabel || currentUser?.role || '未知角色');
  const roleMessage = getRoleViewDigestMessage(currentUser);

  return (
    <section aria-label="当前任务速览" className="current-task-compact-preview">
      <div className="current-task-compact-copy">
        <p className="eyebrow">任务处理卡</p>
        <strong>{stageName}</strong>
        <span>{`负责人：${owner} · 状态 ${stageStatusLabel(stage.status)}`}</span>
      </div>
      <div className="current-task-role-copy">
        <strong>{`当前角色：${roleLabel}`}</strong>
        <span>{roleMessage}</span>
      </div>
      <div aria-label="当前任务速览指标" className="current-task-compact-metrics">
        <span>{`检查项 ${checklistCount}`}</span>
        <span className={missingCount ? 'warning' : 'ready'}>{`确认缺项 ${missingCount}`}</span>
        <span className={openTaskCount ? 'warning' : 'ready'}>{`待办 ${openTaskCount}`}</span>
        <span className={riskCount + gapCount ? 'warning' : 'ready'}>
          {`风险不足 ${riskCount + gapCount}`}
        </span>
      </div>
      {onAction && actionLabel ? (
        <button className="secondary current-task-compact-action" type="button" onClick={onAction}>
          {actionLabel}
        </button>
      ) : null}
    </section>
  );
}

function DeliveryOverviewDashboard({
  artifact,
  artifactProvider,
  confirmation,
  currentStageId = '',
  gateReason = '',
  history = [],
  onOpenCurrentTask,
  project,
  risk,
  stage,
  stageGapCount = 0,
  stageRiskCount = 0,
}) {
  if (!project || !stage) {
    return null;
  }

  const isCurrentStage = stage.id === currentStageId;
  const missingItems = Array.isArray(confirmation?.missingItems) ? confirmation.missingItems : [];
  const openTaskCount = isCurrentStage ? Number(project.openFollowupTaskCount || 0) : 0;
  const missingCount = Math.max(missingItems.length, openTaskCount);
  const stageName = localizeStageName(stage.name || project.currentStageName || '当前阶段');
  const owner = localizeRoleLabel(stage.owner || project.currentOwner || project.sponsor || '未指派');
  const projectRiskCount = Array.isArray(project.risks) ? project.risks.length : 0;
  const riskCount = Number(stageRiskCount || 0) + projectRiskCount;
  const gapCount = Number(stageGapCount || 0);
  const artifactSummary = getArtifactSummary(artifact);
  const artifactSource = artifactProvider ? providerLabel(artifactProvider) : '待生成';
  const nextAction =
    gateReason ||
    stageNextAction({
      gapCount,
      missingCount,
      riskCount,
      status: stage.status,
    });

  return (
    <section className="delivery-overview-dashboard" aria-label="交付概览驾驶舱">
      <header className="delivery-overview-heading">
        <div>
          <p className="eyebrow">交付概览</p>
          <h3>紧凑驾驶舱</h3>
          <span>只保留当前判断、证据状态和风险总量；详细处理请进入对应业务页签。</span>
        </div>
        <button className="secondary" onClick={onOpenCurrentTask} type="button">
          进入当前阶段处理
        </button>
      </header>
      <div className="delivery-overview-grid">
        <article className={missingCount ? 'blocked' : 'ready'}>
          <span>下一步动作</span>
          <strong>{localizeWorkflowText(nextAction)}</strong>
          <small>{`${stageName} · ${stageStatusLabel(stage.status)} · ${owner}`}</small>
        </article>
        <article>
          <span>当前阶段</span>
          <strong>{stageName}</strong>
          <small>{`确认缺项 ${missingCount} · 待办 ${openTaskCount}`}</small>
        </article>
        <article>
          <span>交付证据</span>
          <strong>{artifactSummary.title}</strong>
          <small>{`来源：${artifactSource} · 记录 ${history.length}`}</small>
        </article>
        <article className={riskCount + gapCount ? 'warning' : 'ready'}>
          <span>风险与记录</span>
          <strong>{`${riskCount + gapCount}`}</strong>
          <small>{`${riskCount} 风险 / ${gapCount} 不足 · ${history.length} 条记录`}</small>
        </article>
      </div>
      <DeliveryOverviewRoleStrip
        artifactTitle={artifactSummary.title}
        gapCount={gapCount}
        missingCount={missingCount}
        openTaskCount={openTaskCount}
        owner={owner}
        riskCount={riskCount}
        stageName={stageName}
        status={stage.status}
      />
      {project.yoloDeliveryChain?.isYoloProject ? (
        <YoloProjectRuntimePanel compact projectId={project.id} />
      ) : null}
    </section>
  );
}

function DeliveryOverviewRoleStrip({
  artifactTitle,
  gapCount = 0,
  missingCount = 0,
  openTaskCount = 0,
  owner,
  riskCount = 0,
  stageName,
  status,
}) {
  const [isRoleDigestOpen, setIsRoleDigestOpen] = useState(false);
  const actionLabel =
    missingCount > 0
      ? `补齐确认 ${missingCount}`
      : openTaskCount > 0
        ? `处理待办 ${openTaskCount}`
        : '推进阶段';
  const riskTotal = Number(riskCount || 0) + Number(gapCount || 0);

  const items = [
    {
      label: '当前角色',
      value: owner || '未指派',
      detail: stageName || '当前阶段',
      tone: 'neutral',
    },
    {
      label: '阶段状态',
      value: stageStatusLabel(status),
      detail: actionLabel,
      tone: missingCount || openTaskCount ? 'blocked' : 'ready',
    },
    {
      label: '风险不足',
      value: `${riskTotal}`,
      detail: `${riskCount} 风险 / ${gapCount} 不足`,
      tone: riskTotal ? 'warning' : 'ready',
    },
    {
      label: '交付证据',
      value: artifactTitle || '待生成',
      detail: '进入业务页签查看完整产物',
      tone: 'neutral',
    },
  ];

  return (
    <details
      className="delivery-overview-role-strip"
      aria-label="角色任务速览"
      open={isRoleDigestOpen}
    >
      <summary
        onClick={(event) => {
          event.preventDefault();
          setIsRoleDigestOpen((isOpen) => !isOpen);
        }}
      >
        <span>
          <strong>角色速览</strong>
          <small>{`${owner || '未指派'} · ${actionLabel} · 风险不足 ${riskTotal}`}</small>
        </span>
        <em>{isRoleDigestOpen ? '收起' : '展开'}</em>
      </summary>
      {isRoleDigestOpen ? (
        <div className="delivery-overview-role-strip-grid">
          {items.map((item) => (
            <article className={item.tone} key={item.label}>
              <span>{item.label}</span>
              <strong>{item.value}</strong>
              <small>{item.detail}</small>
            </article>
          ))}
        </div>
      ) : null}
    </details>
  );
}

function stageNextAction({ gapCount, missingCount, riskCount, status }) {
  if (missingCount > 0) {
    return '优先补齐当前阶段确认事项，再进入下一闸口。';
  }

  if (riskCount + gapCount > 0) {
    return '先复核潜在风险和功能不足，再确认阶段结论。';
  }

  if (status === 'approved') {
    return '该阶段已通过，可查看产物或切换到下一阶段。';
  }

  if (status === 'queued') {
    return '该阶段仍在等待前置阶段完成。';
  }

  return '当前阶段可继续推进，请补齐处理意见并执行阶段动作。';
}

function stageStatusLabel(status) {
  const labels = {
    active: '进行中',
    approved: '已通过',
    blocked: '已阻塞',
    queued: '等待中',
  };

  return labels[status] || '待确认';
}

function SessionPermissionSummary({ canSwitchUser = false, currentUser, selectedOrganization, session }) {
  if (!session) {
    return null;
  }

  const organization = selectedOrganization || session.currentOrganization || {};
  const organizationName = organization.name || '未选择组织';
  const organizationPlan = organizationPlanLabel(organization.plan);
  const organizationCount =
    session.availableOrganizations?.length || (selectedOrganization ? 1 : 0);
  const roleLabel = session.organizationRoleLabel || currentUser?.roleLabel || '未知角色';
  const authModeLabel = session.authMode === 'strict' ? '严格登录' : '本地登录';
  const permissionText = summarizeSessionPermissions(session.permissions);

  return (
    <div className="session-permission-summary" aria-label="会话权限摘要">
      <strong>{`${organizationName} · ${organizationPlan}`}</strong>
      <span>{`组织角色：${roleLabel}`}</span>
      <span>{`账号模式：${authModeLabel}`}</span>
      <span>{`可访问组织：${organizationCount}`}</span>
      <span>{`模拟切换：${canSwitchUser ? '开启' : '关闭'}`}</span>
      <span>{`可用权限：${permissionText}`}</span>
    </div>
  );
}

function summarizeSessionPermissions(permissions = {}) {
  const labels = [
    ['manageOrganization', '组织管理'],
    ['manageBilling', '费用管理'],
    ['manageSecurity', '安全管理'],
    ['runDelivery', '交付执行'],
    ['viewAudit', '审计查看'],
    ['viewCost', '费用查看'],
  ];
  const enabledLabels = labels
    .filter(([permissionId]) => permissions[permissionId])
    .map(([, label]) => label);

  return enabledLabels.length ? enabledLabels.join('、') : '只读';
}

function TaskDetailPanel({
  busy,
  commentDraft,
  onChangeComment,
  onClose,
  onSubmitComment,
  task,
}) {
  const isResolved = task.status === 'resolved';

  return (
    <section className={`task-detail-panel ${task.status}`} aria-label="任务详情">
      <div className="task-detail-heading">
        <div>
          <p className="eyebrow">任务详情</p>
          <h3>{localizeWorkflowText(task.title)}</h3>
          <small>{`${task.projectName} · ${localizeStageName(task.stageName)}`}</small>
        </div>
        <button className="secondary" type="button" onClick={onClose}>
          关闭
        </button>
      </div>
      <div className="task-detail-meta">
        <span>{`状态：${isResolved ? '已关闭' : '待处理'}`}</span>
        <span>{`指派：${task.assigneeName}`}</span>
        <span>{`角色：${localizeRoleLabel(task.targetRoleLabel)}`}</span>
      </div>
      <div className="task-detail-body">
        {task.question ? (
          <div>
            <strong>追问内容</strong>
            <p>{task.question}</p>
          </div>
        ) : null}
        {task.expectedAnswer ? (
          <div>
            <strong>期望回答</strong>
            <p>{task.expectedAnswer}</p>
          </div>
        ) : null}
        {isResolved ? (
          <div className="task-detail-resolution">
            <strong>处理证据</strong>
            <small>{`处理人：${task.resolvedBy || task.assigneeName}`}</small>
            {task.resolvedAt ? <small>{`处理时间：${task.resolvedAt}`}</small> : null}
            {task.resolutionSummary ? <p>{task.resolutionSummary}</p> : null}
          </div>
        ) : (
          <div className="task-detail-next">
            <strong>下一步</strong>
            <p>在当前阶段确认事项中补齐对应内容并保存，任务会自动关闭并写入流转记录。</p>
          </div>
        )}
      </div>
      {task.comments?.length ? (
        <div className="task-comment-history">
          <strong>沟通记录</strong>
          {task.comments.map((comment) => (
            <article key={`${comment.at}-${comment.actor}-${comment.comment}`}>
              <small>{`${comment.actor} · ${comment.at || '时间未记录'}`}</small>
              <p>{comment.comment}</p>
            </article>
          ))}
        </div>
      ) : null}
      <form className="task-comment-form" onSubmit={onSubmitComment}>
        <label>
          任务备注
          <textarea
            value={commentDraft}
            onChange={(event) => onChangeComment(event.target.value)}
            placeholder="记录沟通进展、阻塞原因或下一步安排"
            rows="3"
          />
        </label>
        <button type="submit" disabled={busy || !String(commentDraft || '').trim()}>
          提交备注
        </button>
      </form>
    </section>
  );
}

function LoginScreen({ busy, error, form, onChange, onSubmit, users }) {
  return (
    <main className="login-shell">
      <section className="login-panel">
        <div className="brand login-brand">
          <span className="brand-mark">W</span>
          <div>
            <h1>登录 WeeCoder</h1>
            <p>按账号进入自己的交付工作台</p>
          </div>
        </div>

        <form className="login-form" onSubmit={onSubmit}>
          <label>
            登录账号
            <select
              aria-label="登录账号"
              value={form.userId}
              onChange={(event) => onChange({ ...form, userId: event.target.value })}
            >
              {users.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.name} · {user.roleLabel}
                </option>
              ))}
            </select>
          </label>
          <label>
            密码
            <input
              aria-label="密码"
              type="password"
              value={form.password}
              onChange={(event) => onChange({ ...form, password: event.target.value })}
              placeholder="demo123"
            />
          </label>
          {error ? <div className="error">{error}</div> : null}
          <button type="submit" disabled={busy}>
            登录
          </button>
        </form>
      </section>
    </main>
  );
}

function PlatformCockpitPanel({
  busy = false,
  canQueuePlatformJob = false,
  currentUser,
  onQueuePlatformJob,
  onUpdateNotificationAction,
  onUpdatePlatformJob,
  platform,
  queueDisabledReason = '',
  selectedProject,
  users = APP_USERS,
}) {
  const tenancy = platform.tenancy || {};
  const database = platform.database || {};
  const queue = platform.aiOperations?.queue || {};
  const platformJobs = platform.aiOperations?.jobs || [];
  const executionAudit = platform.aiOperations?.executionAudit || {};
  const runLedger = platform.aiOperations?.runLedger || {};
  const staleLeaseJobIds = new Set(
    (executionAudit.workerLeases?.staleJobs || []).map((job) => job.jobId),
  );
  const platformJobFocus = selectPlatformJobFocus(platformJobs, staleLeaseJobIds);
  const sandbox = platform.aiOperations?.sandbox || {};
  const deployment = platform.deployment || {};
  const governance = platform.governance || {};
  const commandCenter = governance.commandCenter || {};
  const cost = governance.cost || {};
  const ownerPortfolio = governance.ownerPortfolio || {};
  const deliveryClosure = governance.deliveryClosure || {};
  const notificationActionCenter = governance.notifications?.actionCenter || {};
  const notificationActionProcessingLedger = notificationActionCenter.processingLedger || {};
  const securityAuditSummary = governance.securityAudit || {};
  const [securityAuditFilter, setSecurityAuditFilter] = useState('all');
  const [auditFilter, setAuditFilter] = useState('all');
  const [selectedSecurityAuditId, setSelectedSecurityAuditId] = useState('');
  const [selectedAuditEventId, setSelectedAuditEventId] = useState('');
  const securityAuditEvents = (governance.auditLog || []).filter(
    (event) => event.type === 'authorization-denied' || event.category === 'security',
  );
  const [selectedPlatformJobId, setSelectedPlatformJobId] = useState('');
  const selectedPlatformJob =
    selectedPlatformJobId ? platformJobs.find((job) => job.id === selectedPlatformJobId) || null : null;
  const selectedPlatformJobRuns = selectedPlatformJob
    ? (runLedger.rows || []).filter((run) => run.jobId === selectedPlatformJob.id)
    : [];
  const selectedPlatformJobEvidence = selectedPlatformJob
    ? (executionAudit.evidenceTrail || []).find((evidence) => evidence.jobId === selectedPlatformJob.id) || null
    : null;
  const selectedPlatformJobAction = selectedPlatformJob
    ? findPlatformJobAction(executionAudit, selectedPlatformJob.id)
    : null;
  const authorizationDenialCount =
    securityAuditSummary.denialCount ??
    securityAuditEvents.filter((event) => event.type === 'authorization-denied').length;
  const securityHighSeverityCount =
    securityAuditSummary.highSeverityCount ??
    securityAuditEvents.filter((event) => event.severity === 'high').length;
  const securityAuditFacetCount =
    (securityAuditSummary.projects || []).length +
    (securityAuditSummary.roles || []).length +
    (securityAuditSummary.actions || []).length;
  const visibleSecurityAuditEvents = securityAuditEvents.filter((event) => {
    if (securityAuditFilter === 'denied') {
      return event.type === 'authorization-denied';
    }
    if (securityAuditFilter === 'high') {
      return event.severity === 'high';
    }
    return true;
  });
  const selectedSecurityAuditEvent =
    securityAuditEvents.find((event) => event.id === selectedSecurityAuditId) || null;
  const visibleAuditEvents = (governance.auditLog || []).filter((event) => {
    if (auditFilter === 'high') {
      return event.severity === 'high';
    }
    if (auditFilter === 'security') {
      return event.category === 'security' || event.type === 'authorization-denied';
    }
    if (auditFilter !== 'all') {
      return event.category === auditFilter || event.type === auditFilter;
    }
    return true;
  });
  const selectedAuditEvent =
    (governance.auditLog || []).find((event) => event.id === selectedAuditEventId) || null;
  const blockedReleaseGateCount = Number.isFinite(deployment.readiness?.blockedGateCount)
    ? deployment.readiness.blockedGateCount
    : (deployment.releaseGates || []).filter((gate) => gate.status === 'blocked').length;
  const blockedEnvironmentCount = (deployment.environments || []).filter(
    (environment) => environment.status === 'blocked',
  ).length;
  const overBudgetProjectCount = Number.isFinite(cost.summary?.overBudgetProjectCount)
    ? cost.summary.overBudgetProjectCount
    : (cost.budgetRisks || []).filter((risk) => risk.budgetStatus === 'over-budget').length;
  const nearBudgetProjectCount = Number.isFinite(cost.summary?.nearBudgetProjectCount)
    ? cost.summary.nearBudgetProjectCount
    : (cost.budgetRisks || []).filter((risk) => risk.budgetStatus === 'near-budget').length;
  const budgetRiskCount = overBudgetProjectCount + nearBudgetProjectCount;
  const costCategoryCount = (cost.categories || []).length;
  const costProjectCount = (cost.projects || []).length;
  const costBudgetRiskCount = (cost.budgetRisks || []).length;
  const securityEventCount =
    securityAuditEvents.length || authorizationDenialCount + securityHighSeverityCount;
  const operationsAttentionCount =
    (queue.failedCount || 0) +
    blockedReleaseGateCount +
    authorizationDenialCount +
    budgetRiskCount +
    (governance.sla?.breachedCount || 0);
  const operationsTone =
    operationsAttentionCount >= 4 ? 'critical' : operationsAttentionCount > 0 ? 'warning' : 'healthy';
  const operationsPriorityItems = [
    {
      label: '后台任务失败',
      tone: queue.failedCount ? 'critical' : 'steady',
      value: queue.failedCount || 0,
    },
    {
      label: '发布阻塞',
      tone: blockedReleaseGateCount ? 'critical' : 'steady',
      value: blockedReleaseGateCount,
    },
    {
      label: '安全事件',
      tone: securityEventCount ? 'critical' : 'steady',
      value: securityEventCount,
    },
    {
      label: 'SLA 超时',
      tone: governance.sla?.breachedCount ? 'critical' : 'steady',
      value: governance.sla?.breachedCount || 0,
    },
    {
      label: '预算风险',
      tone: budgetRiskCount ? 'warning' : 'steady',
      value: budgetRiskCount,
    },
  ];
  const operationsPrimaryAction =
    (commandCenter.blockers || []).find((blocker) => blocker.nextAction)?.nextAction ||
    (queue.failedCount
      ? '先进入后台任务页查看失败任务。'
      : blockedReleaseGateCount
        ? '先确认发布门禁和运维交接阻塞。'
        : governance.sla?.breachedCount
          ? '先处理 SLA 超时任务。'
          : '继续观察后台任务、发布门禁和费用变化。');
  const operationsRadarMetrics = [
    {
      detail: `运行 ${queue.runningCount || 0} · 失败 ${queue.failedCount || 0}`,
      id: 'jobs',
      label: '后台任务',
      tone: queue.failedCount ? 'critical' : queue.runningCount ? 'active' : 'steady',
      value: queue.totalJobs || 0,
    },
    {
      detail: `门禁 ${blockedReleaseGateCount} · 环境 ${blockedEnvironmentCount}`,
      id: 'deployment',
      label: '部署阻塞',
      tone: blockedReleaseGateCount || blockedEnvironmentCount ? 'critical' : 'steady',
      value: blockedReleaseGateCount,
    },
    {
      detail: `越权拒绝 ${authorizationDenialCount} · 高危 ${securityHighSeverityCount}`,
      id: 'security',
      label: '安全事件',
      tone: authorizationDenialCount || securityHighSeverityCount ? 'critical' : 'steady',
      value: securityEventCount,
    },
    {
      detail: `预计 ¥${formatCompactMoney(cost.totalEstimatedCny || 0)} · ${platformStatusLabel(
        cost.budgetStatus || 'within-budget',
      )}`,
      id: 'cost',
      label: '预算风险',
      tone: cost.budgetStatus === 'over-budget' ? 'critical' : budgetRiskCount ? 'warning' : 'steady',
      value: budgetRiskCount,
    },
  ];
  const deploymentReadyGateCount = Number.isFinite(deployment.readiness?.readyGateCount)
    ? deployment.readiness.readyGateCount
    : (deployment.releaseGates || []).filter((gate) => gate.status === 'ready').length;
  const deploymentPlannedGateCount = Number.isFinite(deployment.readiness?.plannedGateCount)
    ? deployment.readiness.plannedGateCount
    : (deployment.releaseGates || []).filter((gate) => gate.status === 'planned').length;
  const operationFocusStrips = [
    {
      ariaLabel: '后台任务运行摘要',
      description: '用于判断 AI coding、代码评审和测试任务是否可以继续推进。',
      metrics: [
        { label: '排队', value: queue.queuedCount || 0 },
        { label: '运行中', value: queue.runningCount || 0 },
        { label: '失败', tone: queue.failedCount ? 'critical' : 'steady', value: queue.failedCount || 0 },
        {
          label: '证据缺口',
          tone: executionAudit.missingEvidenceCount ? 'warning' : 'steady',
          value: executionAudit.missingEvidenceCount || 0,
        },
      ],
      section: 'jobs',
      title: '任务运行摘要',
      tone: queue.failedCount || executionAudit.missingEvidenceCount ? 'warning' : 'steady',
    },
    {
      ariaLabel: '发布门禁摘要',
      description: '用于确认环境、发布门禁和运维交接是否满足最终上线条件。',
      metrics: [
        { label: '环境', value: (deployment.environments || []).length },
        {
          label: '阻塞门禁',
          tone: blockedReleaseGateCount ? 'critical' : 'steady',
          value: blockedReleaseGateCount,
        },
        { label: '就绪门禁', value: deploymentReadyGateCount },
        { label: '计划中', value: deploymentPlannedGateCount },
        {
          label: '交接缺口',
          tone: deployment.opsHandoff?.missingItemCount ? 'warning' : 'steady',
          value: deployment.opsHandoff?.missingItemCount || 0,
        },
      ],
      section: 'deployments',
      title: '发布门禁摘要',
      tone: blockedReleaseGateCount || deployment.opsHandoff?.missingItemCount ? 'warning' : 'steady',
    },
    {
      ariaLabel: '审计响应摘要',
      description: '用于追踪通知处理、SLA 超时、越权拒绝和待分派动作。',
      metrics: [
        { label: '通知项', value: governance.notifications?.pendingItems || 0 },
        {
          label: 'SLA 超时',
          tone: governance.sla?.breachedCount ? 'critical' : 'steady',
          value: governance.sla?.breachedCount || 0,
        },
        { label: '动作', value: notificationActionCenter.totalActionCount || 0 },
        {
          label: '越权拒绝',
          tone: authorizationDenialCount ? 'critical' : 'steady',
          value: authorizationDenialCount,
        },
      ],
      section: 'audit',
      title: '审计响应摘要',
      tone: governance.sla?.breachedCount || authorizationDenialCount ? 'warning' : 'steady',
    },
  ];

  return (
    <section className="platform-cockpit" aria-label="商业化运营后台">
      <div className="section-heading">
        <div>
          <p className="eyebrow">运营后台</p>
          <h3>商业化运营后台</h3>
        </div>
        <strong>{tenancy.currentOrganizationName || '未选择组织'}</strong>
      </div>

      <OperationsPriorityStrip
        action={operationsPrimaryAction}
        count={operationsAttentionCount}
        items={operationsPriorityItems}
        tone={operationsTone}
      />

      <section
        className={`operations-radar ${operationsTone}`}
        data-operation-section="overview"
        aria-label="运营态势总览"
      >
        <div className="operations-radar-copy">
          <p className="eyebrow">运营态势</p>
          <strong>{operationsAttentionCount ? `需要处理 ${operationsAttentionCount} 个关键项` : '运行平稳'}</strong>
          <span>{`${tenancy.currentOrganizationName || '未选择组织'} · ${organizationPlanLabel(
            tenancy.plan,
          )} · ${tenancy.visibleProjectCount || 0} 个项目`}</span>
          <p>
            {operationsAttentionCount
              ? '优先处理失败任务、发布门禁、越权拒绝和预算风险，避免交付流转卡在最后一公里。'
              : '当前后台任务、部署、安全和费用没有高优先级阻塞。'}
          </p>
        </div>
        <div className="operations-radar-metrics">
          {operationsRadarMetrics.map((metric) => (
            <article className={`operations-radar-metric ${metric.tone}`} key={metric.id}>
              <span>{metric.label}</span>
              <strong>{metric.value}</strong>
              <small>{metric.detail}</small>
            </article>
          ))}
        </div>
      </section>

      {operationFocusStrips.map((strip) => (
        <OperationsFocusStrip key={strip.section} {...strip} />
      ))}

      <div className="platform-grid">
        <article className="platform-card highlight" data-operation-section="overview organizations">
          <span>组织与权限</span>
          <strong>{tenancy.currentOrganizationName || '未选择组织'}</strong>
          <p>{`${organizationPlanLabel(tenancy.plan)} · ${tenancy.activeUserCount || 0} 个成员 · ${tenancy.visibleProjectCount || 0} 个项目`}</p>
          <div className="platform-chip-row">
            {(tenancy.roleMatrix || []).slice(0, 4).map((member) => (
              <small key={member.userId}>{`${member.name} · ${member.roleLabel}`}</small>
            ))}
          </div>
          <PlatformJobDetailPanel
            action={selectedPlatformJobAction}
            evidence={selectedPlatformJobEvidence}
            job={selectedPlatformJob}
            runs={selectedPlatformJobRuns}
          />
        </article>

        {(ownerPortfolio.rows || []).length ? (
          <article className="platform-card wide owner-portfolio-card" data-operation-section="overview">
            <span>老板项目组合</span>
            <strong>{`${ownerPortfolio.summary?.projectCount || 0} 个项目 · 高风险 ${
              ownerPortfolio.summary?.criticalProjectCount || 0
            } · 需关注 ${ownerPortfolio.summary?.warningProjectCount || 0}`}</strong>
            <p>{`阻塞 ${ownerPortfolio.summary?.blockedProjectCount || 0} · 超预算 ${
              ownerPortfolio.summary?.overBudgetProjectCount || 0
            }`}</p>
            <details className="owner-portfolio-detail-section" aria-label="老板项目组合明细">
              <summary>
                <span>
                  <strong>老板项目组合明细</strong>
                  <small>{`${(ownerPortfolio.rows || []).length} 个项目 · 显示前 ${Math.min(
                    (ownerPortfolio.rows || []).length,
                    5,
                  )} 个`}</small>
                </span>
              </summary>
              <div className="owner-portfolio-list" aria-label="老板项目组合列表">
                {(ownerPortfolio.rows || []).slice(0, 5).map((row) => (
                  <div className={`owner-portfolio-row ${row.portfolioStatus || 'healthy'}`} key={row.projectId}>
                    <div className="owner-portfolio-main">
                      <strong>{`${row.projectName} · ${localizeStageName(row.stageName || row.stageId) || '未进入阶段'}`}</strong>
                      <small>{`${localizeRoleLabel(row.ownerRoleLabel || row.ownerRole || 'Owner')} · ${
                        healthLevelLabel(row.healthLevel)
                      } · SLA ${notificationSeverityLabel(row.slaSeverity)} · 超时 ${row.slaOverdueHours || 0} 小时`}</small>
                    </div>
                    <div className="owner-portfolio-cost">
                      <strong>{`¥${formatCompactMoney(row.costTotalEstimatedCny || 0)} · ${
                        platformStatusLabel(row.budgetStatus || 'no-budget')
                      }`}</strong>
                      {row.ownerName ? <small>{row.ownerName}</small> : null}
                    </div>
                    <p>{localizeWorkflowText(row.nextAction)}</p>
                  </div>
                ))}
              </div>
            </details>
          </article>
        ) : null}

        {(deliveryClosure.rows || []).length ? (
          <article className="platform-card wide delivery-closure-card" data-operation-section="overview">
            <span>端到端交付闭环</span>
            <strong>{`${deliveryClosure.summary?.projectCount || 0} 个项目 · 平均完成 ${
              deliveryClosure.summary?.averageCompletionPercent || 0
            }%`}</strong>
            <p>{`已验收 ${deliveryClosure.summary?.signedOffProjectCount || 0} · 测试回流 ${
              deliveryClosure.summary?.qaReturnProjectCount || 0
            } · 阻塞 ${deliveryClosure.summary?.blockedProjectCount || 0}`}</p>
            <details className="delivery-closure-detail-section" aria-label="交付闭环明细">
              <summary>
                <span>
                  <strong>交付闭环明细</strong>
                  <small>{`${(deliveryClosure.rows || []).length} 个项目 · 显示前 ${Math.min(
                    (deliveryClosure.rows || []).length,
                    4,
                  )} 个`}</small>
                </span>
              </summary>
              <div className="delivery-closure-list" aria-label="交付闭环列表">
                {(deliveryClosure.rows || []).slice(0, 4).map((row) => (
                  <div className={`delivery-closure-row ${row.status || 'in-progress'}`} key={row.projectId}>
                    <div className="delivery-closure-heading">
                      <strong>{`${row.projectName} · ${row.completionPercent || 0}% · ${
                        platformStatusLabel(row.status) || '推进中'
                      }`}</strong>
                      <small>{`${localizeStageName(row.currentGateLabel || row.currentGateId) || '下一闸口'} · ${
                        platformStatusLabel(row.gates?.find((gate) => gate.id === row.currentGateId)?.status) || '已完成'
                      }`}</small>
                    </div>
                    <div className="delivery-gate-strip" aria-label={`${row.projectName} 交付闸口`}>
                      {(row.gates || []).map((gate) => (
                        <span className={gate.status || 'missing'} key={gate.id} title={gate.label}>
                          {localizeStageName(gate.label) || localizeWorkflowText(gate.label)}
                        </span>
                      ))}
                    </div>
                    <p>{localizeWorkflowText(row.nextAction)}</p>
                  </div>
                ))}
              </div>
            </details>
          </article>
        ) : null}

        <article className="platform-card" data-operation-section="overview organizations">
          <span>数据底座</span>
          <strong>{databaseModeLabel(database.persistenceMode)}</strong>
          <p>{`目标 ${databaseTargetLabel(database.targetEngine)} · 迁移准备度 ${database.readinessScore ?? 0}%`}</p>
          {database.migrationPlan ? (
            <div className="database-migration-summary">
              <small>{`${database.migrationPlan.readyPhaseCount || 0}/${database.migrationPlan.phaseCount || 0} 阶段就绪`}</small>
              {(database.migrationPlan.phases || []).slice(0, 3).map((phase) => (
                <span className={phase.status || 'planned'} key={phase.id}>
                  {localizeWorkflowText(phase.title)}
                </span>
              ))}
            </div>
          ) : null}
          {database.cutoverReadiness ? (
            <div className="database-cutover-summary">
              <small>切换闸口</small>
              <div>
                <span>{`阻塞 ${database.cutoverReadiness.blockedGateCount || 0}`}</span>
                <span>{`就绪 ${database.cutoverReadiness.readyGateCount || 0}`}</span>
                <span>{`计划中 ${database.cutoverReadiness.plannedGateCount || 0}`}</span>
              </div>
              {(database.cutoverReadiness.gates || []).slice(0, 3).map((gate) => (
                <span className={gate.status || 'planned'} key={gate.id}>
                  {`${localizeWorkflowText(gate.title)} · ${platformStatusLabel(gate.status)}`}
                </span>
              ))}
            </div>
          ) : null}
          {database.extractionReadiness ? (
            <div className="database-extraction-summary">
              <small>数据抽取准备度</small>
              <div>
                <span>{`已映射 ${database.extractionReadiness.mappedTableCount || 0}`}</span>
                <span>{`阻塞 ${database.extractionReadiness.blockedTableCount || 0}`}</span>
              </div>
              {(database.extractionReadiness.tables || []).slice(0, 3).map((table) => (
                <span className={table.status || 'planned'} key={table.tableName}>
                  {`${table.tableName} · ${platformStatusLabel(table.status)}`}
                </span>
              ))}
            </div>
          ) : null}
          {database.repositoryContract ? (
            <div className="database-repository-contract">
              <small>仓库契约</small>
              <div>
                <span>{`就绪方法 ${database.repositoryContract.readyMethodCount || 0}`}</span>
                <span>{`缺失方法 ${database.repositoryContract.missingMethodCount || 0}`}</span>
              </div>
              {(database.repositoryContract.methods || []).slice(0, 3).map((method) => (
                <span className={method.status || 'missing'} key={method.name}>
                  {`${method.name} · ${platformStatusLabel(method.status)}`}
                </span>
              ))}
            </div>
          ) : null}
          {database.agentQueueStorage ? (
            <div className="database-agent-queue-storage">
              <small>智能体队列存储</small>
              <div>
                <span>{`数据表 ${database.agentQueueStorage.tableCount || 0} · 缺少抽取 ${
                  database.agentQueueStorage.missingExtractionCount || 0
                }`}</span>
              </div>
              {(database.agentQueueStorage.tables || []).slice(1, 3).map((table) => (
                <span className={table.status || 'planned'} key={table.tableName}>
                  {`${table.tableName} · ${platformStatusLabel(table.status || 'planned')}`}
                </span>
              ))}
            </div>
          ) : null}
          <div className="platform-chip-row">
            {(database.tables || []).slice(0, 4).map((table) => (
              <small key={table.name}>{table.name}</small>
            ))}
          </div>
        </article>

        <article className="platform-card" data-operation-section="jobs">
          <span>后台任务队列</span>
          <strong>{`后台任务 ${queue.totalJobs || 0}`}</strong>
          <p>{`运行 ${queue.runningCount || 0} · 失败 ${queue.failedCount || 0} · 成功 ${queue.succeededCount || 0}`}</p>
          <button
            className="platform-card-action"
            disabled={!selectedProject || !canQueuePlatformJob || busy}
            onClick={onQueuePlatformJob}
            type="button"
          >
            创建 AI 任务
          </button>
          <small className="platform-action-hint">
            {selectedProject
              ? queueDisabledReason || `目标项目：${selectedProject.name}`
              : '请选择一个项目后创建任务'}
          </small>
          <PlatformJobFocusStrip
            executionAudit={executionAudit}
            job={platformJobFocus}
            queue={queue}
            staleLeaseJobIds={staleLeaseJobIds}
          />
          {executionAudit.totalJobs || runLedger.totalRunCount ? (
            <details className="platform-execution-audit" aria-label="执行审计">
              <summary>
                <span>执行审计</span>
                <small>
                  {`可重试 ${executionAudit.retryableFailedCount || 0} · 重试耗尽 ${
                    executionAudit.exhaustedCount || 0
                  } · 缺少证据 ${executionAudit.missingEvidenceCount || 0}`}
                </small>
              </summary>
              <div className="platform-execution-audit-body">
              <div className="execution-audit-metrics">
                <span>{`可重试 ${executionAudit.retryableFailedCount || 0}`}</span>
                <span>{`重试耗尽 ${executionAudit.exhaustedCount || 0}`}</span>
                <span>{`已取消 ${executionAudit.cancelledCount || 0}`}</span>
                <span>{`缺少证据 ${executionAudit.missingEvidenceCount || 0}`}</span>
                {Number.isFinite(executionAudit.evidenceCoveragePercent) ? (
                  <span>{`证据覆盖率 ${executionAudit.evidenceCoveragePercent}%`}</span>
                ) : null}
                {executionAudit.workerLeases ? (
                  <span>{`活跃租约 ${executionAudit.workerLeases.activeCount || 0} · 过期 ${
                    executionAudit.workerLeases.staleCount || 0
                  }`}</span>
                ) : null}
                <span>{`平均 ${formatDurationMs(executionAudit.averageDurationMs || 0)}`}</span>
              </div>
              {(executionAudit.executorHealth || []).length ? (
                <div className="execution-audit-executors">
                  {(executionAudit.executorHealth || []).slice(0, 2).map((executor) => (
                    <span key={executor.executor}>{`${localizeWorkflowText(executor.executor)} · 失败 ${executor.failedCount || 0}`}</span>
                  ))}
                </div>
              ) : null}
              {(executionAudit.workerLeases?.staleJobs || []).length ? (
                <div className="execution-audit-leases" aria-label="过期执行器租约">
                  {(executionAudit.workerLeases.staleJobs || []).slice(0, 2).map((job) => (
                    <article key={job.jobId}>
                      <strong>{`${localizeWorkflowText(job.title)} · ${job.workerId}`}</strong>
                      <span>{`过期时间 ${job.leaseExpiredAt || '未知'}`}</span>
                      <p>{localizeWorkflowText(job.nextAction)}</p>
                    </article>
                  ))}
                </div>
              ) : null}
              <AgentRunLedger ledger={runLedger} />
              {(executionAudit.evidenceTrail || []).length ? (
                <div className="execution-audit-evidence-trail" aria-label="执行证据链">
                  {(executionAudit.evidenceTrail || []).slice(0, 3).map((evidence) => (
                    <article
                      className={evidence.evidenceComplete ? 'complete' : 'incomplete'}
                      key={evidence.jobId}
                    >
                      <strong>
                        {`${evidence.evidenceComplete ? '证据已齐' : '证据缺口'} · ${localizeWorkflowText(evidence.title)} · ${
                          evidence.projectName
                        }`}
                      </strong>
                      {evidence.summary ? <p>{localizeWorkflowText(evidence.summary)}</p> : null}
                      <div>
                        {evidence.command ? <span>{evidence.command}</span> : null}
                        {Number.isInteger(evidence.exitCode) ? (
                          <span>{`退出码 ${evidence.exitCode}`}</span>
                        ) : null}
                        {Number.isFinite(evidence.durationMs) ? (
                          <span>{formatDurationMs(evidence.durationMs)}</span>
                        ) : null}
                      </div>
                      {evidence.stdoutExcerpt ? <code>{`标准输出 ${evidence.stdoutExcerpt}`}</code> : null}
                      {evidence.stderrExcerpt ? <code>{`错误输出 ${evidence.stderrExcerpt}`}</code> : null}
                      {(evidence.missing || []).length ? (
                        <em>{`缺失 ${(evidence.missing || []).map(localizeWorkflowText).join('、')}`}</em>
                      ) : null}
                    </article>
                  ))}
                </div>
              ) : null}
              {executionAudit.latestBlocker ? (
                <article className="execution-audit-latest-blocker">
                  <small>最新阻塞</small>
                  <strong>
                    {`${localizeWorkflowText(executionAudit.latestBlocker.title)} · ${executionAudit.latestBlocker.projectName}`}
                  </strong>
                  <p>{localizeWorkflowText(executionAudit.latestBlocker.reason)}</p>
                  {executionAudit.latestBlocker.blockedCommand ? (
                    <span>{`阻断命令：${executionAudit.latestBlocker.blockedCommand}`}</span>
                  ) : null}
                  {executionAudit.latestBlocker.nextAction ? (
                    <em>{localizeWorkflowText(executionAudit.latestBlocker.nextAction)}</em>
                  ) : null}
                </article>
              ) : null}
              {(executionAudit.actionGroups || []).length ? (
                <div className="execution-audit-action-groups">
                  {(executionAudit.actionGroups || []).map((group) => (
                    <article key={group.id}>
                      <strong>{`${localizeWorkflowText(group.title)} ${group.count || 0}`}</strong>
                      <p>{localizeWorkflowText(group.nextAction)}</p>
                    </article>
                  ))}
                </div>
              ) : null}
              {(executionAudit.retryCandidates || []).length ? (
                <div className="execution-audit-retry-list">
                  {(executionAudit.retryCandidates || []).slice(0, 2).map((candidate) => (
                    <article key={candidate.jobId}>
                      <strong>{`${localizeWorkflowText(candidate.title)} · ${candidate.projectName}`}</strong>
                      <p>{localizeWorkflowText(candidate.reason)}</p>
                    </article>
                  ))}
                </div>
              ) : null}
              {(executionAudit.exhaustedJobs || []).length ? (
                <div className="execution-audit-retry-list">
                  {(executionAudit.exhaustedJobs || []).slice(0, 2).map((job) => (
                    <article key={job.jobId}>
                      <strong>{`${localizeWorkflowText(job.title)} · ${job.projectName}`}</strong>
                      <p>{localizeWorkflowText(job.nextAction)}</p>
                    </article>
                  ))}
                </div>
              ) : null}
              {(executionAudit.cancelledJobs || []).length ? (
                <div className="execution-audit-retry-list">
                  {(executionAudit.cancelledJobs || []).slice(0, 2).map((job) => (
                    <article key={job.jobId}>
                      <strong>{`${localizeWorkflowText(job.title)} · ${job.projectName}`}</strong>
                      <p>{localizeWorkflowText(job.nextAction)}</p>
                    </article>
                  ))}
                </div>
              ) : null}
              </div>
            </details>
          ) : null}
          <details className="platform-job-list-section" aria-label="后台任务明细">
            <summary>
              <span>展开后台任务明细</span>
              <strong>{`${platformJobs.length} 个任务`}</strong>
              <small>{`排队 ${queue.queuedCount || 0} · 运行中 ${queue.runningCount || 0} · 失败 ${
                queue.failedCount || 0
              }`}</small>
            </summary>
            <div className="platform-job-list">
              {platformJobs.slice(0, 3).map((job) => (
                <div
                  className={`platform-job-row ${selectedPlatformJob?.id === job.id ? 'selected' : ''}`}
                  key={job.id}
                >
                  <div className="platform-job-row-main">
                    <small>{`${localizeWorkflowText(job.title)} · ${jobStatusLabel(job.status)}`}</small>
                    <div>
                      <button
                        disabled={busy}
                        onClick={() => setSelectedPlatformJobId(job.id)}
                        type="button"
                      >
                        查看详情
                      </button>
                      {job.status === 'queued' ? (
                        <>
                          <button
                            disabled={busy}
                            onClick={() => onUpdatePlatformJob?.(job, 'start')}
                            type="button"
                          >
                            开始任务
                          </button>
                          <button
                            disabled={busy}
                            onClick={() => onUpdatePlatformJob?.(job, 'cancel')}
                            type="button"
                          >
                            取消任务
                          </button>
                        </>
                      ) : null}
                      {job.status === 'running' ? (
                        <>
                          <button
                            disabled={busy}
                            onClick={() => onUpdatePlatformJob?.(job, 'complete')}
                            type="button"
                          >
                            完成任务
                          </button>
                          <button
                            disabled={busy}
                            onClick={() => onUpdatePlatformJob?.(job, 'fail')}
                            type="button"
                          >
                            标记失败
                          </button>
                          {staleLeaseJobIds.has(job.id) ? (
                            <button
                              disabled={busy}
                              onClick={() => onUpdatePlatformJob?.(job, 'reclaim')}
                              type="button"
                            >
                              回收任务
                            </button>
                          ) : null}
                          <button
                            disabled={busy}
                            onClick={() => onUpdatePlatformJob?.(job, 'cancel')}
                            type="button"
                          >
                            取消任务
                          </button>
                        </>
                      ) : null}
                      {job.status === 'failed' ? (
                        <button
                          disabled={busy}
                          onClick={() => onUpdatePlatformJob?.(job, 'retry')}
                          type="button"
                        >
                          重试任务
                        </button>
                      ) : null}
                    </div>
                  </div>
                  <PlatformJobEvidence job={job} />
                </div>
              ))}
            </div>
          </details>
        </article>

        <article className="platform-card" data-operation-section="jobs audit">
          <span>沙箱与审计</span>
          <strong>{sandbox.mode || '未配置执行器'}</strong>
          <p>{sandbox.isolation === 'planned-sandbox' ? '沙箱规划中' : sandbox.isolation || '待确认'}</p>
          <div className="platform-chip-row">
            {(sandbox.allowedCommands || []).slice(0, 3).map((command) => (
              <small key={command}>{command}</small>
            ))}
          </div>
        </article>

        <article className="platform-card wide" data-operation-section="deployments">
          <span>部署控制台</span>
          {deployment.readiness ? (
            <section className="deployment-readiness" aria-label="发布准备度">
              <small>发布准备度</small>
              <div>
                <strong>{`得分 ${deployment.readiness.score ?? 0}`}</strong>
                <span>{`阻塞闸口 ${deployment.readiness.blockedGateCount || 0}`}</span>
                <span>{`就绪 ${deployment.readiness.readyGateCount || 0}`}</span>
                <span>{`计划中 ${deployment.readiness.plannedGateCount || 0}`}</span>
              </div>
              <p>{localizeWorkflowText(deployment.readiness.nextAction)}</p>
            </section>
          ) : null}
          <details className="deployment-detail-section" aria-label="部署明细">
            <summary>
              <span>部署明细</span>
              <small>
                {`环境 ${(deployment.environments || []).length} · 门禁 ${
                  (deployment.releaseGates || []).length
                } · 交接缺口 ${deployment.opsHandoff?.missingItemCount || 0}`}
              </small>
            </summary>
            <div className="deployment-detail-body">
              <div className="platform-environments">
                {(deployment.environments || []).map((environment) => (
                  <div key={environment.id}>
                    <strong>{localizeWorkflowText(environment.name)}</strong>
                    <small>{platformStatusLabel(environment.status)}</small>
                    <em>{environment.version || '未发布'}</em>
                    {Number.isFinite(Number(environment.projectCount)) ? (
                      <small>{`项目 ${environment.projectCount}`}</small>
                    ) : null}
                    {environment.latestProjectName ? (
                      <span>{environment.latestProjectName}</span>
                    ) : null}
                    {environment.url ? (
                      <code>{environment.url}</code>
                    ) : null}
                    {environment.evidence ? (
                      <p>{localizeWorkflowText(environment.evidence)}</p>
                    ) : null}
                    {environment.nextAction ? (
                      <p>{localizeWorkflowText(environment.nextAction)}</p>
                    ) : null}
                  </div>
                ))}
              </div>
              {(deployment.releaseGates || []).length ? (
                <div className="deployment-gate-list">
                  {deployment.releaseGates.slice(0, 4).map((gate) => (
                    <div className={`deployment-gate ${gate.status || 'planned'}`} key={gate.id}>
                      <strong>{`${localizeWorkflowText(gate.title)} · ${platformStatusLabel(gate.status)}`}</strong>
                      <small>{`${localizeRoleLabel(gate.ownerRole || 'owner')} · 阻塞 ${gate.blockerCount || 0}`}</small>
                      <p>{localizeWorkflowText(gate.nextAction)}</p>
                    </div>
                  ))}
                </div>
              ) : null}
              {(deployment.opsHandoff?.items || []).length ? (
                <div className="ops-handoff-list">
                  <small>{`运维交接缺口 ${deployment.opsHandoff.missingItemCount || 0}`}</small>
                  {deployment.opsHandoff.items.slice(0, 3).map((item) => (
                    <div key={item.id}>
                      <strong>{localizeWorkflowText(item.title)}</strong>
                      <span>{`${item.projectName} · ${platformStatusLabel(item.status)}`}</span>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          </details>
        </article>

        <article className="platform-card" data-operation-section="audit">
          <span>团队通知与 SLA</span>
          <strong>{`${governance.notifications?.pendingItems || 0} 个通知项`}</strong>
          <p>{`SLA 超时 ${governance.sla?.breachedCount || 0} · 阻塞待办 ${governance.sla?.blockedFollowupCount || 0}`}</p>
          <details className="notification-sla-detail-section" aria-label="通知与 SLA 明细">
            <summary>
              <span>通知与 SLA 明细</span>
              <small>
                {`通知 ${governance.notifications?.pendingItems || 0} · SLA ${
                  governance.sla?.breachedCount || 0
                } · 动作 ${notificationActionCenter.totalActionCount || 0}`}
              </small>
            </summary>
            <div className="notification-sla-detail-body">
              <div className="sla-owner-list">
                <small>{`高风险 ${governance.sla?.criticalCount || 0}`}</small>
                <small>{`需关注 ${governance.sla?.warningCount || 0}`}</small>
                {(governance.sla?.ownerGroups || []).slice(0, 3).map((group) => (
                  <span key={group.ownerRole}>
                    {`${localizeRoleLabel(group.ownerRoleLabel || group.ownerRole)} ${group.breachCount || 0} 次超时 / ${
                      group.criticalCount
                        ? `高风险 ${group.criticalCount}`
                        : `需关注 ${group.warningCount || 0}`
                    }`}
                  </span>
                ))}
              </div>
              {(governance.sla?.breaches || []).length ? (
                <div className="sla-breach-list">
                  {(governance.sla.breaches || []).slice(0, 3).map((breach) => (
                    <div className={`sla-breach ${breach.severity || 'warning'}`} key={breach.projectId}>
                      <strong>{`${breach.projectName} · ${localizeStageName(breach.stageName)}`}</strong>
                      <small>{`${notificationSeverityLabel(breach.severity)} · ${
                        localizeRoleLabel(breach.ownerRoleLabel || breach.ownerRole || 'owner')
                      } · 超时 ${breach.overdueHours || 0} 小时`}</small>
                      <p>{localizeWorkflowText(breach.nextAction)}</p>
                    </div>
                  ))}
                </div>
              ) : null}
              <div className="platform-chip-row">
                {(governance.notifications?.channels || []).slice(0, 3).map((channel) => (
                  <small key={channel.id}>{`${localizeWorkflowText(channel.name)} · ${platformStatusLabel(channel.status)}`}</small>
                ))}
              </div>
              <div className="notification-ack-list">
                <small>{`已确认 ${governance.notifications?.acknowledgedItems || 0}`}</small>
                {(governance.notifications?.recentAcknowledgements || []).slice(0, 2).map((item) => (
                  <div key={item.id}>
                    <strong>{`${localizeWorkflowText(item.acknowledgedBy || '团队').trim()}已确认 ${
                      item.projectName || '项目'
                    }`}</strong>
                    <span>{localizeWorkflowText(item.note || item.acknowledgedAt || '通知已确认。')}</span>
                  </div>
                ))}
              </div>
              {notificationActionCenter.totalActionCount || (notificationActionCenter.recentUpdates || []).length ? (
                <section className="notification-action-center" aria-label="通知动作中心">
                  <small>动作中心</small>
                  <div className="notification-action-metrics">
                    <span>
                      {`动作 ${notificationActionCenter.totalActionCount || 0} · 高优先级 ${
                        notificationActionCenter.highSeverityCount || 0
                      } · 角色 ${notificationActionCenter.roleGroupCount || 0}`}
                    </span>
                  </div>
                  {(notificationActionCenter.roleGroups || []).length ? (
                    <div className="notification-action-roles">
                      {(notificationActionCenter.roleGroups || []).slice(0, 4).map((group) => (
                        <span key={group.targetRole}>
                          {`${localizeRoleLabel(group.targetRoleLabel || group.targetRole || 'Team')} ${group.count || 0} / 高优先级 ${
                            group.highSeverityCount || 0
                          }`}
                        </span>
                      ))}
                    </div>
                  ) : null}
                  {(notificationActionCenter.items || []).length ? (
                    <div className="notification-action-list">
                      {(notificationActionCenter.items || []).slice(0, 3).map((item) => {
                        const acknowledgePermission = getNotificationActionUiPermission(
                          selectedProject,
                          item,
                          'acknowledged',
                          currentUser,
                          users,
                        );
                        const assignPermission = getNotificationActionUiPermission(
                          selectedProject,
                          item,
                          'assigned',
                          currentUser,
                          users,
                        );
                        const resolvePermission = getNotificationActionUiPermission(
                          selectedProject,
                          item,
                          'resolved',
                          currentUser,
                          users,
                        );
                        const permissionHint =
                          acknowledgePermission.reason ||
                          assignPermission.reason ||
                          resolvePermission.reason ||
                          '';

                        return (
                          <article className={item.severity || 'medium'} key={item.id}>
                            <small>
                              {`${notificationSeverityLabel(item.severity)} · ${
                                localizeRoleLabel(item.targetRoleLabel || item.targetRole || 'Team')
                              } · ${localizeWorkflowText(item.source || 'workflow')}`}
                            </small>
                            <strong>{localizeWorkflowText(item.title)}</strong>
                            <span>{item.projectName || '未关联项目'}</span>
                            {item.status && item.status !== 'open' ? (
                              <span className="notification-action-state">
                                {`${notificationActionStatusLabel(item.status) || localizeWorkflowText(item.statusLabel)} · ${
                                  item.assigneeName || item.acknowledgedBy || item.resolvedBy || item.targetRoleLabel || '团队'
                                }`}
                              </span>
                            ) : null}
                            {item.detail ? <p>{localizeWorkflowText(item.detail)}</p> : null}
                            {item.nextAction ? <em>{localizeWorkflowText(item.nextAction)}</em> : null}
                            <div className="notification-action-controls">
                              {item.status === 'open' ? (
                                <button
                                  type="button"
                                  disabled={busy || !item.projectId || !acknowledgePermission.allowed}
                                  onClick={() => onUpdateNotificationAction?.(item, 'acknowledged')}
                                >
                                  {`确认 ${localizeWorkflowText(item.title)}`}
                                </button>
                              ) : null}
                              {item.status !== 'assigned' ? (
                                <button
                                  type="button"
                                  disabled={busy || !item.projectId || !assignPermission.allowed}
                                  onClick={() => onUpdateNotificationAction?.(item, 'assigned')}
                                >
                                  {`分派给 ${localizeRoleLabel(item.targetRoleLabel || item.targetRole || 'Owner')}`}
                                </button>
                              ) : null}
                              <button
                                type="button"
                                disabled={busy || !item.projectId || !resolvePermission.allowed}
                              onClick={() => onUpdateNotificationAction?.(item, 'resolved')}
                            >
                              {`解决 ${localizeWorkflowText(item.title)}`}
                            </button>
                            </div>
                            {permissionHint ? <span className="notification-action-permission">{permissionHint}</span> : null}
                          </article>
                        );
                      })}
                    </div>
                  ) : null}
                  {(notificationActionCenter.recentUpdates || []).length ? (
                    <div className="notification-action-updates">
                      <small>最近更新</small>
                      {(notificationActionCenter.recentUpdates || []).slice(0, 3).map((item) => (
                        <article key={item.id}>
                          <strong>{item.projectName || '未关联项目'}</strong>
                          <span>
                            {`${notificationActionStatusLabel(item.status) || localizeWorkflowText(item.statusLabel)} · ${
                              item.assigneeName || item.resolvedBy || item.acknowledgedBy || item.assignedBy || '团队'
                            }`}
                          </span>
                          {item.resolution || item.note ? <p>{localizeWorkflowText(item.resolution || item.note)}</p> : null}
                        </article>
                      ))}
                    </div>
                  ) : null}
                  {notificationActionProcessingLedger.totalEventCount ? (
                    <div className="notification-action-history">
                      <small>动作历史</small>
                      <strong>
                        {`事件 ${notificationActionProcessingLedger.totalEventCount || 0} · 动作 ${
                          notificationActionProcessingLedger.actionCount || 0
                        } · 操作人 ${notificationActionProcessingLedger.actorCount || 0}`}
                      </strong>
                      <div className="notification-action-history-metrics">
                        <span>{`已确认 ${notificationActionProcessingLedger.acknowledgedCount || 0}`}</span>
                        <span>{`已分派 ${notificationActionProcessingLedger.assignedCount || 0}`}</span>
                        <span>{`已解决 ${notificationActionProcessingLedger.resolvedCount || 0}`}</span>
                      </div>
                      {(notificationActionProcessingLedger.rows || []).slice(0, 3).map((row) => (
                        <article key={row.id || `${row.notificationId}-${row.at}`}>
                          <span>
                            {`${notificationActionStatusLabel(row.status) || localizeWorkflowText(row.statusLabel)} · ${
                              row.assigneeName || row.actor || '团队'
                            } · ${row.projectName || '未关联项目'}`}
                          </span>
                          <small>{`${row.actor || '团队'} · ${row.at || '未知时间'}`}</small>
                          {row.note ? <p>{`历史备注：${localizeWorkflowText(row.note)}`}</p> : null}
                        </article>
                      ))}
                    </div>
                  ) : null}
                  {notificationActionCenter.nextAction ? <p>{localizeWorkflowText(notificationActionCenter.nextAction)}</p> : null}
                </section>
              ) : null}
              {(governance.notifications?.items || []).length ? (
                <div className="notification-item-list">
                  {governance.notifications.items.slice(0, 3).map((item) => (
                    <div className={`notification-item ${item.severity || 'low'}`} key={item.id}>
                      <div>
                        <small>{`${notificationSeverityLabel(item.severity)} · ${localizeRoleLabel(
                          item.audienceRoleLabel || item.audienceName || 'Team',
                        )}`}</small>
                        <strong>{localizeWorkflowText(item.title)}</strong>
                        <span>{`${item.projectName} · ${localizeStageName(item.stageName)}`}</span>
                      </div>
                      <p>{localizeWorkflowText(item.nextAction)}</p>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          </details>
        </article>

        <article className="platform-card" data-operation-section="cost">
          <span>费用统计</span>
          <strong>{`预计费用 ¥${formatMoney(cost.totalEstimatedCny || 0)}`}</strong>
          <p>{`AI ¥${formatMoney(cost.aiEstimatedCny || 0)} · 执行器 ¥${formatMoney(cost.runnerEstimatedCny || 0)} · 等待 ¥${formatMoney(cost.waitingEstimatedCny || 0)} · 部署 ¥${formatMoney(cost.deploymentEstimatedCny || 0)}`}</p>
          <div className={`cost-budget-summary ${cost.budgetStatus || 'within-budget'}`}>
            <strong>{`预算 ${platformStatusLabel(cost.budgetStatus || 'within-budget')} · 上限 ¥${formatCompactMoney(cost.budgetLimitCny || 0)} · 偏差 ¥${formatCompactMoney(cost.budgetDeltaCny || 0)}`}</strong>
            <span>{localizeWorkflowText(cost.nextAction || '当前无需费用控制动作。')}</span>
          </div>
          <details className="cost-detail-section" aria-label="费用明细">
            <summary>
              <span>费用明细</span>
              <small>{`分类 ${costCategoryCount} · 项目 ${costProjectCount} · 风险 ${costBudgetRiskCount}`}</small>
            </summary>
            <div className="cost-detail-body">
              {(cost.categories || []).length ? (
                <div className="cost-category-list" aria-label="费用中心">
                  <small>费用中心</small>
                  {cost.categories.slice(0, 4).map((category) => (
                    <div className="cost-category-row" key={category.id}>
                      <strong>{`${localizeWorkflowText(category.label) || '费用项'} · ¥${formatCompactMoney(category.estimatedCny || 0)}`}</strong>
                      <span>{`${category.share || 0}% · ${category.unitCount || 0} 个计费单元`}</span>
                    </div>
                  ))}
                </div>
              ) : null}
              {(cost.projects || []).length ? (
                <div className="cost-project-list">
                  {cost.projects.slice(0, 3).map((project) => (
                    <div className="cost-project-row" key={project.projectId}>
                      <strong>{`${project.projectName} · ¥${formatCompactMoney(project.totalEstimatedCny || 0)}`}</strong>
                      <span>{`任务 ${project.drivers?.jobCount || 0} / 检查 ${project.drivers?.checkCount || 0} / 等待 ${project.drivers?.waitingItemCount || 0} / 环境 ${project.drivers?.deploymentEnvironmentCount || 0}`}</span>
                    </div>
                  ))}
                </div>
              ) : null}
              {(cost.budgetRisks || []).length ? (
                <div className="cost-risk-list">
                  {(cost.budgetRisks || []).slice(0, 3).map((risk) => (
                    <div className={`cost-risk-row ${risk.budgetStatus || 'near-budget'}`} key={risk.projectId}>
                      <strong>{`${risk.projectName} · ${platformStatusLabel(risk.budgetStatus)} · +¥${formatCompactMoney(risk.budgetDeltaCny || 0)}`}</strong>
                      <span>{localizeWorkflowText(risk.nextAction)}</span>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          </details>
        </article>

        <article className="platform-card security-audit" data-operation-section="audit" aria-label="安全审计">
          <span>安全审计</span>
          <strong>{`越权拒绝 ${authorizationDenialCount}`}</strong>
          <div className="security-audit-summary" aria-label="安全审计统计">
            <span>{`高危 ${securityHighSeverityCount}`}</span>
            <span>{`项目 ${securityAuditSummary.projects?.length || 0}`}</span>
            <span>{`角色 ${securityAuditSummary.roles?.length || 0}`}</span>
          </div>
          <details className="security-audit-detail-section" aria-label="安全审计明细">
            <summary>
              <span>安全审计明细</span>
              <small>{`事件 ${securityEventCount} · 维度 ${securityAuditFacetCount}`}</small>
            </summary>
            <div className="security-audit-detail-body">
              {securityAuditSummary.projects?.length ||
              securityAuditSummary.roles?.length ||
              securityAuditSummary.actions?.length ? (
                <div className="security-audit-facets" aria-label="安全审计维度">
                  {(securityAuditSummary.projects || []).slice(0, 2).map((project) => (
                    <small key={project.projectId}>{`${project.projectName} ${project.count}`}</small>
                  ))}
                  {(securityAuditSummary.roles || []).slice(0, 2).map((role) => (
                    <small key={role.roleLabel}>{`${localizeRoleLabel(role.roleLabel)} ${role.count}`}</small>
                  ))}
                  {(securityAuditSummary.actions || []).slice(0, 2).map((action) => (
                    <small key={action.actionId}>{`${localizeWorkflowText(action.actionId)} ${action.count}`}</small>
                  ))}
                </div>
              ) : null}
              <p>集中查看越权操作、拒绝原因和允许角色。</p>
              {securityAuditEvents.length ? (
                <div className="security-audit-filter" aria-label="安全审计筛选">
                  {[
                    ['all', '全部安全事件'],
                    ['denied', '只看越权拒绝'],
                    ['high', '只看高危安全事件'],
                  ].map(([value, label]) => (
                    <button
                      aria-pressed={securityAuditFilter === value}
                      className={securityAuditFilter === value ? 'active' : ''}
                      key={value}
                      onClick={() => setSecurityAuditFilter(value)}
                      type="button"
                    >
                      {label}
                    </button>
                  ))}
                </div>
              ) : null}
              {visibleSecurityAuditEvents.length ? (
                <div className="security-audit-list">
                  {visibleSecurityAuditEvents.slice(0, 3).map((event) => (
                    <div className={`security-audit-row ${event.severity || 'medium'}`} key={event.id}>
                      <div>
                        <strong>{event.projectName || '未知项目'}</strong>
                        <small>{`${localizeWorkflowText(event.actionId || historyTypeLabel(event.type))} · ${localizeRoleLabel(
                          event.roleLabel || event.actor || '未知角色',
                        )}`}</small>
                      </div>
                      {event.allowedRoles?.length ? (
                        <span>{`允许角色：${event.allowedRoles.map(localizeRoleLabel).join('、')}`}</span>
                      ) : null}
                      <p>{localizeWorkflowText(event.reason || event.note || '无拒绝原因。')}</p>
                      <button
                        aria-label={`查看安全审计详情 ${event.projectName || '未知项目'}`}
                        className="secondary"
                        onClick={() => setSelectedSecurityAuditId(event.id)}
                        type="button"
                      >
                        查看详情
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <p>当前筛选下暂无安全审计事件。</p>
              )}
              {selectedSecurityAuditEvent ? (
                <div className="security-audit-detail" aria-label="安全审计详情">
                  <span>事件详情</span>
                  <strong>{selectedSecurityAuditEvent.projectName || '安全事件'}</strong>
                  <small>{localizeWorkflowText(selectedSecurityAuditEvent.type || 'unknown')}</small>
                  <dl>
                    <div>
                      <dt>操作</dt>
                      <dd>{localizeWorkflowText(selectedSecurityAuditEvent.actionId || '-')}</dd>
                    </div>
                    <div>
                      <dt>执行人</dt>
                      <dd>{localizeRoleLabel(selectedSecurityAuditEvent.actor || selectedSecurityAuditEvent.roleLabel || '-')}</dd>
                    </div>
                    <div>
                      <dt>允许角色</dt>
                      <dd>
                        {selectedSecurityAuditEvent.allowedRoles?.length
                          ? selectedSecurityAuditEvent.allowedRoles.map(localizeRoleLabel).join('、')
                          : '-'}
                      </dd>
                    </div>
                    <div>
                      <dt>原因</dt>
                      <dd>{localizeWorkflowText(selectedSecurityAuditEvent.reason || selectedSecurityAuditEvent.note || '-')}</dd>
                    </div>
                  </dl>
                </div>
              ) : null}
            </div>
          </details>
        </article>

        <article className="platform-card audit" data-operation-section="audit">
          <span>最近审计</span>
          {governance.auditSummary?.totalEvents ? (
            <section className="audit-summary-block" aria-label="审计摘要">
              <small>审计摘要</small>
              <div className="audit-summary-metrics">
                <span>{`事件 ${governance.auditSummary.totalEvents || 0}`}</span>
                <span>{`高风险 ${governance.auditSummary.highSeverityCount || 0}`}</span>
                <span>{`执行人 ${governance.auditSummary.actorCount || 0}`}</span>
                <span>{`项目 ${governance.auditSummary.projectCount || 0}`}</span>
              </div>
              <div className="audit-facet-row">
                {(governance.auditSummary.categories || []).slice(0, 3).map((item) => (
                  <small key={item.id}>{`${localizeWorkflowText(item.label)} ${item.count}`}</small>
                ))}
                {(governance.auditSummary.actors || []).slice(0, 2).map((item) => (
                  <small key={item.actor}>{`${localizeWorkflowText(item.actor)} ${item.count}`}</small>
                ))}
                {(governance.auditSummary.projects || []).slice(0, 2).map((item) => (
                  <small key={item.projectId}>{`${item.projectName} ${item.count}`}</small>
                ))}
              </div>
            </section>
          ) : null}
          <details className="operation-audit-detail-section" aria-label="操作审计明细">
            <summary>
              <span>操作审计明细</span>
              <small>{`事件 ${(governance.auditLog || []).length} · 显示 ${visibleAuditEvents.length}`}</small>
            </summary>
            <div className="operation-audit-detail-body">
              {governance.auditSummary?.exportManifest ? (
                <section className="audit-export-block" aria-label="审计导出">
                  <small>审计导出</small>
                  <strong>
                    {`${governance.auditSummary.exportManifest.format} · ${
                      governance.auditSummary.exportManifest.recordCount || 0
                    } 条记录 · 高风险 ${
                      governance.auditSummary.exportManifest.highSeverityCount || 0
                    } · 项目 ${governance.auditSummary.exportManifest.projectCount || 0}`}
                  </strong>
                  <span>{governance.auditSummary.exportManifest.filename}</span>
                  <div>
                    <small>{`字段 ${(governance.auditSummary.exportManifest.fields || []).length}`}</small>
                    <small>{`最新时间 ${governance.auditSummary.exportManifest.latestAt || '未知'}`}</small>
                  </div>
                </section>
              ) : null}
              {(governance.auditLog || []).length ? (
                <div className="audit-filter-row" aria-label="操作审计筛选">
                  {[
                    ['all', '全部审计事件'],
                    ['high', '只看高危审计事件'],
                    ['security', '只看安全审计事件'],
                  ].map(([value, label]) => (
                    <button
                      aria-pressed={auditFilter === value}
                      className={auditFilter === value ? 'active' : ''}
                      key={value}
                      onClick={() => setAuditFilter(value)}
                      type="button"
                    >
                      {label}
                    </button>
                  ))}
                </div>
              ) : null}
              {(governance.auditLog || []).length ? (
                <small className="audit-filter-count">
                  {`显示 ${visibleAuditEvents.length} / ${(governance.auditLog || []).length} 条事件`}
                </small>
              ) : null}
              {visibleAuditEvents.length ? (
                visibleAuditEvents.slice(0, 3).map((event) => (
                  <div className={`audit-event-row ${selectedAuditEvent?.id === event.id ? 'selected' : ''}`} key={event.id}>
                    <strong>{historyTypeLabel(event.type)}</strong>
                    <small>{`${localizeWorkflowText(event.actor)} · ${event.projectName}`}</small>
                    <p>{localizeWorkflowText(event.note || '无备注')}</p>
                    <button
                      aria-label={`查看操作审计详情 ${event.projectName || '未知项目'}`}
                      className="secondary"
                      onClick={() => setSelectedAuditEventId(event.id)}
                      type="button"
                    >
                      查看详情
                    </button>
                  </div>
                ))
              ) : (
                <p>当前筛选下暂无审计事件。</p>
              )}
              <AuditEventDetail event={selectedAuditEvent} />
            </div>
          </details>
        </article>
      </div>

      {database.gaps?.length || sandbox.gaps?.length ? (
        <div className="platform-gap-row">
          {[...(database.gaps || []), ...(sandbox.gaps || [])].slice(0, 3).map((gap) => (
            <span key={gap}>{gap}</span>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function OperationsPriorityStrip({ action, count = 0, items = [], tone = 'healthy' }) {
  return (
    <section className={`operations-priority-strip ${tone}`} aria-label="运营优先处理条">
      <div className="operations-priority-copy">
        <p className="eyebrow">优先处理</p>
        <strong>{count ? `需要处理 ${count} 个关键项` : '当前没有关键阻塞'}</strong>
        <span>{`下一步：${localizeWorkflowText(action)}`}</span>
      </div>
      <div className="operations-priority-metrics" aria-label="运营优先指标">
        {items.map((item) => (
          <span className={item.tone || 'steady'} key={item.label}>
            {`${item.label} ${item.value}`}
          </span>
        ))}
      </div>
    </section>
  );
}

function OperationsFocusStrip({ ariaLabel, description, metrics = [], section, title, tone = 'steady' }) {
  return (
    <section
      aria-label={ariaLabel}
      className={`operations-focus-strip ${tone}`}
      data-operation-section={section}
    >
      <div className="operations-focus-copy">
        <p className="eyebrow">当前视图</p>
        <strong>{title}</strong>
        <span>{description}</span>
      </div>
      <div className="operations-focus-metrics">
        {metrics.map((metric) => (
          <article className={`operations-focus-metric ${metric.tone || 'steady'}`} key={metric.label}>
            <span>{metric.label}</span>
            <strong>{metric.value}</strong>
          </article>
        ))}
      </div>
    </section>
  );
}

function PlatformJobFocusStrip({ executionAudit = {}, job = null, queue = {}, staleLeaseJobIds = new Set() }) {
  const isStale = job ? staleLeaseJobIds.has(job.id) : false;
  const tone = isStale ? 'stale' : job?.status || 'empty';
  const projectName = job?.projectName || job?.projectId || '未关联项目';
  const executor = job?.executor ? localizeWorkflowText(job.executor) : '待分配';
  const nextAction =
    job?.nextAction ||
    (isStale
      ? '执行器租约已过期，请先回收任务。'
      : executionAudit.latestBlocker?.jobId === job?.id
        ? executionAudit.latestBlocker.nextAction
        : '');

  return (
    <section className={`platform-job-focus-strip ${tone}`} aria-label="后台任务处理焦点">
      <article className="platform-job-focus-primary">
        <span>当前任务焦点</span>
        <strong>{job ? `${localizeWorkflowText(job.title)} · ${jobStatusLabel(job.status)}` : '暂无后台任务'}</strong>
        <small>{job ? `项目 ${projectName} · 执行器 ${executor}` : '创建 AI 任务后会在这里显示处理焦点。'}</small>
        {job?.command ? <code>{`命令：${job.command}`}</code> : null}
        {nextAction ? <em>{localizeWorkflowText(nextAction)}</em> : null}
      </article>
      <div className="platform-job-focus-metrics">
        <span>{`排队 ${queue.queuedCount || 0}`}</span>
        <span>{`运行中 ${queue.runningCount || 0}`}</span>
        <span>{`失败 ${queue.failedCount || 0}`}</span>
        <span>{`证据缺口 ${executionAudit.missingEvidenceCount || 0}`}</span>
      </div>
    </section>
  );
}

function PlatformJobEvidence({ job }) {
  const hasEvidence = Boolean(
    job.command ||
      job.resultSummary ||
      job.errorSummary ||
      job.stdout ||
      job.stderr ||
      Object.keys(job.details || {}).length ||
      Number.isInteger(job.exitCode) ||
      Number.isFinite(job.durationMs),
  );

  if (!hasEvidence) {
    return null;
  }

  return (
    <div className="platform-job-evidence">
      {job.command ? <span>{`命令：${job.command}`}</span> : null}
      {Number.isInteger(job.exitCode) || Number.isFinite(job.durationMs) ? (
        <span>{`退出码 ${Number.isInteger(job.exitCode) ? job.exitCode : '未记录'} · ${formatDurationMs(job.durationMs)}`}</span>
      ) : null}
      {job.resultSummary ? <span>{`结果：${localizeWorkflowText(job.resultSummary)}`}</span> : null}
      {job.errorSummary ? <span>{`错误：${localizeWorkflowText(job.errorSummary)}`}</span> : null}
      {job.details?.sandboxPolicy ? (
        <span>{`沙箱策略：${localizeWorkflowText(job.details.sandboxPolicy)}`}</span>
      ) : null}
      {job.details?.blockedCommand ? <span>{`阻断命令：${job.details.blockedCommand}`}</span> : null}
      {job.details?.cancelReason ? <span>{`取消原因：${job.details.cancelReason}`}</span> : null}
      {job.stdout ? <code>{`标准输出：${localizeWorkflowText(job.stdout)}`}</code> : null}
      {job.stderr ? <code>{`错误输出：${localizeWorkflowText(job.stderr)}`}</code> : null}
    </div>
  );
}

function AuditEventDetail({ event = null }) {
  if (!event) {
    return null;
  }

  return (
    <section className="audit-event-detail" aria-label="操作审计详情">
      <span>操作审计详情</span>
      <strong>{event.id}</strong>
      <small>{localizeWorkflowText(event.type || '未知类型')}</small>
      <dl>
        <div>
          <dt>项目</dt>
          <dd>{event.projectName || event.projectId || '-'}</dd>
        </div>
        <div>
          <dt>执行人</dt>
          <dd>{localizeWorkflowText(event.actor || event.actorUserId || '-')}</dd>
        </div>
        <div>
          <dt>类别</dt>
          <dd>{`${localizeWorkflowText(event.category || 'workflow')} · ${notificationSeverityLabel(event.severity)}`}</dd>
        </div>
        <div>
          <dt>审计原因</dt>
          <dd>{localizeWorkflowText(event.auditReason || '-')}</dd>
        </div>
        <div>
          <dt>任务</dt>
          <dd>{event.jobId ? `${event.jobId} · ${jobStatusLabel(event.jobStatus)}` : '-'}</dd>
        </div>
        <div>
          <dt>通知动作</dt>
          <dd>{event.notificationId || '-'}</dd>
        </div>
        <div>
          <dt>通知状态</dt>
          <dd>{notificationActionStatusLabel(event.notificationStatus) || '-'}</dd>
        </div>
        <div>
          <dt>处理人</dt>
          <dd>
            {event.assigneeRole || event.assigneeUserId || event.assigneeName
              ? `${localizeRoleLabel(event.assigneeRole || '-')} · ${event.assigneeUserId || '-'} · ${
                  event.assigneeName || '-'
                }`
              : '-'}
          </dd>
        </div>
        <div>
          <dt>处理结果</dt>
          <dd>{localizeWorkflowText(event.resolution || '-')}</dd>
        </div>
        <div>
          <dt>组织</dt>
          <dd>{event.organizationId || '-'}</dd>
        </div>
        <div>
          <dt>时间</dt>
          <dd>{event.at || '-'}</dd>
        </div>
        <div>
          <dt>备注</dt>
          <dd>{localizeWorkflowText(event.note || '-')}</dd>
        </div>
      </dl>
    </section>
  );
}

function AgentRunLedger({ ledger = {} }) {
  if (!ledger.totalRunCount) {
    return null;
  }

  return (
    <section className="agent-run-ledger" aria-label="任务运行台账">
      <small>运行台账</small>
      <div className="agent-run-ledger-metrics">
        <span>
          {`运行 ${ledger.totalRunCount || 0} · 活跃 ${ledger.activeRunCount || 0} · 已结束 ${
            ledger.terminalRunCount || 0
          } · 事件 ${ledger.totalEventCount || 0}`}
        </span>
        {ledger.staleRunCount ? <span>{`过期 ${ledger.staleRunCount}`}</span> : null}
      </div>
      <div className="agent-run-ledger-list">
        {(ledger.rows || []).slice(0, 3).map((run) => (
          <article className={`agent-run-row ${run.status || 'unknown'}`} key={run.runId || run.jobId}>
            <strong>{`${localizeWorkflowText(run.title || '智能体任务')} · ${run.projectName || '未知项目'}`}</strong>
            <span>{`运行 ${run.runNumber || 1} · ${jobStatusLabel(run.status)} · ${
              run.workerId || '未分配'
            }`}</span>
            {run.latestEventType ? (
              <span>{`最新 ${localizeWorkflowText(run.latestEventType)} · ${run.latestEventAt || '未知时间'}`}</span>
            ) : null}
            {run.leaseHeartbeatAt || run.leaseExpiresAt ? (
              <span>{`心跳 ${run.leaseHeartbeatAt || '未知'} · 过期 ${
                run.leaseExpiresAt || '未知'
              }`}</span>
            ) : null}
            <span>{`耗时 ${formatDurationMs(run.durationMs || 0)} · 退出码 ${
              Number.isInteger(run.exitCode) ? run.exitCode : '待返回'
            } · 事件 ${run.eventCount || 0}`}</span>
          </article>
        ))}
      </div>
      {ledger.nextAction ? <p>{localizeWorkflowText(ledger.nextAction)}</p> : null}
    </section>
  );
}

function PlatformJobDetailPanel({ action = null, evidence = null, job = null, runs = [] }) {
  if (!job) {
    return null;
  }

  const blockedCommand = action?.blockedCommand || job.details?.blockedCommand || '';
  const nextAction = action?.nextAction || '';

  return (
    <section className="platform-job-detail-panel" aria-label="后台任务详情">
      <small>任务详情</small>
      <div className="platform-job-detail-heading">
        <strong>{`${localizeWorkflowText(job.title || '后台任务')} · ${job.projectName || '未知项目'}`}</strong>
        <span>{`${jobStatusLabel(job.status)} · ${job.executor || '未知执行器'} · 运行次数 ${
          job.runCount || 0
        }`}</span>
        {job.command ? <span>{`命令 ${job.command}`}</span> : null}
        {job.requestedBy ? <span>{`发起人 ${job.requestedBy}`}</span> : null}
      </div>

      <div className="platform-job-detail-section">
        <strong>运行时间线</strong>
        {runs.length ? (
          runs.map((run) => (
            <article className={`platform-job-detail-run ${run.status || 'unknown'}`} key={run.runId}>
              <span>{`运行 ${run.runNumber || 1} · ${jobStatusLabel(run.status)} · ${
                run.workerId || '未分配'
              }`}</span>
              <span>{`耗时 ${formatDurationMs(run.durationMs || 0)} · 退出码 ${
                Number.isInteger(run.exitCode) ? run.exitCode : '待返回'
              } · 事件 ${run.eventCount || 0}`}</span>
              {(run.lifecycle || []).length ? (
                <div>
                  {(run.lifecycle || []).map((event) => (
                    <span key={event.eventId || `${event.type}-${event.createdAt}`}>
                      {`${localizeWorkflowText(event.type)} · ${event.createdAt || '未知时间'}`}
                    </span>
                  ))}
                </div>
              ) : run.latestEventType ? (
                <div>
                  <span>{`${localizeWorkflowText(run.latestEventType)} · ${run.latestEventAt || '未知时间'}`}</span>
                </div>
              ) : null}
            </article>
          ))
        ) : (
          <p>暂未捕获运行记录。</p>
        )}
      </div>

      <div className="platform-job-detail-section">
        <strong>执行证据</strong>
        {evidence ? (
          <article className="platform-job-detail-evidence">
            {evidence.summary ? <p>{localizeWorkflowText(evidence.summary)}</p> : null}
            {Number.isInteger(evidence.exitCode) ? <span>{`退出码 ${evidence.exitCode}`}</span> : null}
            {Number.isFinite(evidence.durationMs) ? <span>{formatDurationMs(evidence.durationMs)}</span> : null}
            {evidence.stdoutExcerpt ? <code>{`标准输出 ${evidence.stdoutExcerpt}`}</code> : null}
            {evidence.stderrExcerpt ? <code>{`错误输出 ${evidence.stderrExcerpt}`}</code> : null}
          </article>
        ) : (
          <p>暂未捕获执行证据。</p>
        )}
      </div>

      {blockedCommand || nextAction ? (
        <div className="platform-job-detail-section">
          {blockedCommand ? <span>{`阻断命令：${blockedCommand}`}</span> : null}
          {nextAction ? <span>{`下一步：${localizeWorkflowText(nextAction)}`}</span> : null}
        </div>
      ) : null}
    </section>
  );
}

function findPlatformJobAction(executionAudit = {}, jobId = '') {
  if (executionAudit.latestBlocker?.jobId === jobId) {
    return executionAudit.latestBlocker;
  }

  return (
    (executionAudit.retryCandidates || []).find((item) => item.jobId === jobId) ||
    (executionAudit.exhaustedJobs || []).find((item) => item.jobId === jobId) ||
    (executionAudit.cancelledJobs || []).find((item) => item.jobId === jobId) ||
    null
  );
}

function selectPlatformJobFocus(jobs = [], staleLeaseJobIds = new Set()) {
  return jobs
    .slice()
    .sort((left, right) => getPlatformJobFocusScore(right, staleLeaseJobIds) - getPlatformJobFocusScore(left, staleLeaseJobIds))[0] || null;
}

function getPlatformJobFocusScore(job = {}, staleLeaseJobIds = new Set()) {
  if (staleLeaseJobIds.has(job.id)) {
    return 600;
  }

  const statusScore = {
    failed: 500,
    running: 400,
    queued: 300,
    cancelled: 120,
    succeeded: 80,
  };

  return statusScore[job.status] || 0;
}

function DevelopmentPlanPanel({
  agentExecutionPackage,
  branchPreparation,
  busy,
  canQueueDefectFixJob = false,
  defectFixPackage,
  defectFixJobs = [],
  inspection,
  onBootstrapRepository,
  onGenerateDevelopmentPackage,
  onInspectRepository,
  onPrepareBranch,
  onQueueDefectFixJob,
  onRepositoryDraftChange,
  onRunChecks,
  onSaveRepositoryConfig,
  onStart,
  onUpdateDefectFixJob,
  plan,
  repositoryBootstrap,
  repositoryConfig,
  repositoryDraft,
  run,
}) {
  const canStartDevelopment = Boolean(agentExecutionPackage?.canStart);
  const launchGuide = createDevelopmentLaunchGuide({
    repositoryConfig,
    repositoryInspection: inspection,
    branchPreparation,
    agentExecutionPackage,
    developmentRun: run,
  });

  return (
    <div className="development-plan-panel">
      <section className="development-action-center" aria-label="开发处理中心">
        <div className="development-plan-heading">
          <div>
            <p className="eyebrow">开发处理中心</p>
            <h4>开发任务包</h4>
            <p>{localizeWorkflowText(plan.summary || '按技术交接包拆分开发任务。')}</p>
          </div>
          <div className="development-plan-actions">
            <span className={`plan-status ${plan.status || 'ready'}`}>
              {developmentPlanStatusLabel(plan.status)}
            </span>
            <button
              type="button"
              onClick={agentExecutionPackage ? onStart : onGenerateDevelopmentPackage}
              disabled={agentExecutionPackage ? busy || !canStartDevelopment : busy}
            >
              {agentExecutionPackage ? (run ? '重新生成执行包' : '启动开发执行') : '生成智能开发任务包'}
            </button>
            {run ? (
              <button type="button" className="secondary" onClick={onRunChecks} disabled={busy}>
                运行检查
              </button>
            ) : null}
          </div>
        </div>

        <div className="development-status-strip" aria-label="开发处理摘要">
          <span>{`任务 ${plan.tasks?.length || 0}`}</span>
          <span>{`检查命令 ${plan.verificationCommands?.length || 0}`}</span>
          <span className={agentExecutionPackage?.canStart ? 'ready' : 'warning'}>
            {developmentPackageSummary(agentExecutionPackage)}
          </span>
          <span className={launchGuide.status === 'ready' ? 'ready' : 'warning'}>
            {launchGuideStatusLabel(launchGuide.status)}
          </span>
        </div>

        {!canStartDevelopment ? (
          <p className="gate-hint">请先生成可启动的智能开发任务包，再启动开发执行。</p>
        ) : null}
      </section>

      <details className="development-action-detail-section" aria-label="开发操作详情">
        <summary>
          <span>
            <strong>开发操作详情</strong>
            <small>{`${launchGuideStatusLabel(launchGuide.status)} · ${
              agentExecutionPackage ? agentPackageStatusLabel(agentExecutionPackage.status) : '待生成任务包'
            }`}</small>
          </span>
        </summary>
        <div className="development-action-detail-body">
          <DevelopmentLaunchGuidePanel guide={launchGuide} />

          <RepositoryConfigPanel
            branchPreparation={branchPreparation}
            busy={busy}
            config={repositoryConfig}
            draft={repositoryDraft}
            inspection={inspection}
            repositoryBootstrap={repositoryBootstrap}
            onBootstrap={onBootstrapRepository}
            onInspect={onInspectRepository}
            onPrepareBranch={onPrepareBranch}
            onDraftChange={onRepositoryDraftChange}
            onSave={onSaveRepositoryConfig}
          />

          {agentExecutionPackage ? (
            <AgentExecutionPackagePanel agentPackage={agentExecutionPackage} />
          ) : null}
        </div>
      </details>

      {defectFixPackage ? (
        <DefectFixIterationPanel
          busy={busy}
          canQueueJob={canQueueDefectFixJob}
          defectFixPackage={defectFixPackage}
          onQueueJob={onQueueDefectFixJob}
          onUpdateJob={onUpdateDefectFixJob}
          relatedJobs={defectFixJobs}
        />
      ) : null}

      <details className="development-detail-section" aria-label="开发执行详情">
        <summary>
          <span>
            <strong>开发执行详情</strong>
            <small>{`${plan.tasks?.length || 0} 个任务 · ${
              plan.verificationCommands?.length || 0
            } 条检查命令`}</small>
          </span>
        </summary>
        <div className="development-task-list">
          {(plan.tasks || []).map((task) => (
            <article className="development-task" key={task.id}>
              <div className="development-task-heading">
                <span>{localizeWorkflowText(task.area)}</span>
                <strong>{localizeWorkflowText(task.title)}</strong>
                <small>{developmentTaskStatusLabel(task.status)}</small>
              </div>
              {task.description ? <p>{localizeWorkflowText(task.description)}</p> : null}
              <DevelopmentChecklist title="验收标准" items={task.acceptanceCriteria} />
              <DevelopmentChecklist title="检查方式" items={task.verification} />
            </article>
          ))}
        </div>

        <div className="command-strip" aria-label="开发阶段检查命令">
          {(plan.verificationCommands || []).map((command) => (
            <code key={command}>{command}</code>
          ))}
        </div>
      </details>

      {run ? <DevelopmentRunPanel run={run} /> : null}
    </div>
  );
}

function developmentPackageSummary(agentExecutionPackage) {
  if (!agentExecutionPackage) {
    return '待生成任务包';
  }

  return agentExecutionPackage.canStart ? '任务包可启动' : '任务包不可启动';
}

function DevelopmentLaunchGuidePanel({ guide }) {
  const steps = guide.steps || [];
  const readyStepCount = steps.filter((step) => step.status === 'ready').length;

  return (
    <div className={`development-launch-guide ${guide.status || 'pending'}`}>
      <div className="launch-guide-heading">
        <div>
          <h4>开发启动向导</h4>
          <p>按顺序完成仓库配置、诊断、分支准备和 AI 任务包，才能启动自动开发。</p>
        </div>
        <span>{launchGuideStatusLabel(guide.status)}</span>
      </div>
      <div className="launch-current-action">
        <strong>当前下一步</strong>
        <p>{guide.nextAction || '暂无下一步动作。'}</p>
        {guide.currentOwner ? <small>负责人：{guide.currentOwner}</small> : null}
      </div>
      <details className="launch-step-detail-section" aria-label="开发启动步骤明细">
        <summary>
          <span>
            <strong>查看启动步骤</strong>
            <small>{`已完成 ${readyStepCount}/${steps.length || 0} 步 · 当前 ${
              guide.currentOwner || '未指派'
            }`}</small>
          </span>
        </summary>
        <div className="launch-step-list">
          {steps.map((step, index) => (
            <article
              className={`launch-step ${step.status || 'pending'} ${
                step.id === guide.currentStepId ? 'current' : ''
              }`}
              key={step.id}
            >
              <span className="launch-step-index">{index + 1}</span>
              <div>
                <strong>{step.label}</strong>
                <small>{step.owner}</small>
                <p>{step.detail}</p>
              </div>
              <em>{launchGuideStepStatusLabel(step.status)}</em>
            </article>
          ))}
        </div>
      </details>
    </div>
  );
}

function RepositoryConfigPanel({
  branchPreparation,
  busy,
  config,
  draft,
  inspection,
  repositoryBootstrap,
  onBootstrap,
  onDraftChange,
  onInspect,
  onPrepareBranch,
  onSave,
}) {
  const commandText = (draft.verificationCommands || []).join('\n');
  const canPrepareBranch = Boolean(inspection?.canPrepareBranch);
  const canBootstrapRepository = Boolean(String(draft.localPath || '').trim() && String(draft.targetBranch || '').trim());
  const configuredFieldCount = [
    draft.repositoryUrl,
    draft.localPath,
    draft.baseBranch,
    draft.targetBranch,
    draft.executionMode || config?.executionMode,
  ].filter((value) => String(value || '').trim()).length;
  const missingFieldCount = config?.missingFields?.length || 0;
  const commandCount = draft.verificationCommands?.length || 0;

  return (
    <form className="repository-config-panel" onSubmit={onSave}>
      <div className="repository-config-heading">
        <div>
          <h4>代码仓库与执行器</h4>
          <p>配置真实代码仓库、目标分支和检查命令，后续 Codex/CI 执行会引用这份配置。</p>
        </div>
        <span className={`repository-status ${config?.status || 'incomplete'}`}>
          {repositoryConfigStatusLabel(config?.status)}
        </span>
      </div>

      <details className="repository-config-detail-section" aria-label="执行器配置详情">
        <summary>
          <span>
            <strong>执行器配置详情</strong>
            <small>{`已配置 ${configuredFieldCount} 项 · 待补 ${missingFieldCount} 项 · 检查命令 ${commandCount} 条`}</small>
          </span>
        </summary>
        <div className="repository-config-detail-body">
          <div className="repository-config-grid">
            <label>
              仓库地址
              <input
                value={draft.repositoryUrl || ''}
                onChange={(event) => onDraftChange('repositoryUrl', event.target.value)}
                placeholder="https://github.com/acme/project.git"
              />
            </label>
            <label>
              本地路径
              <input
                value={draft.localPath || ''}
                onChange={(event) => onDraftChange('localPath', event.target.value)}
                placeholder="D:\projects\your-repo"
              />
            </label>
            <label>
              基准分支
              <input
                value={draft.baseBranch || ''}
                onChange={(event) => onDraftChange('baseBranch', event.target.value)}
                placeholder="main"
              />
            </label>
            <label>
              目标分支
              <input
                value={draft.targetBranch || ''}
                onChange={(event) => onDraftChange('targetBranch', event.target.value)}
                placeholder="feature/ai-delivery-task"
              />
            </label>
            <label>
              执行模式
              <select
                value={draft.executionMode || 'codex-local'}
                onChange={(event) => onDraftChange('executionMode', event.target.value)}
              >
                <option value="codex-local">Codex 本地执行</option>
                <option value="manual">人工执行</option>
                <option value="ci">CI Runner</option>
              </select>
            </label>
            <label>
              备注
              <input
                value={draft.notes || ''}
                onChange={(event) => onDraftChange('notes', event.target.value)}
                placeholder="例如：需要 GPU runner 或内网权限"
              />
            </label>
          </div>

          <label className="repository-command-field">
            检查命令
            <textarea
              value={commandText}
              onChange={(event) =>
                onDraftChange(
                  'verificationCommands',
                  event.target.value.split('\n').map((command) => command.trim()).filter(Boolean),
                )
              }
              rows="3"
            />
          </label>

          {config?.missingFields?.length ? (
            <p className="repository-config-hint">
              待补配置：{config.missingFields.map(repositoryFieldLabel).join('、')}
            </p>
          ) : null}

          <div className="repository-config-actions">
            <button
              type="button"
              className="secondary"
              onClick={onBootstrap}
              disabled={busy || !canBootstrapRepository}
            >
              初始化本地业务仓库
            </button>
            <button
              type="button"
              className="secondary"
              onClick={onInspect}
              disabled={busy || config?.status !== 'ready'}
            >
              诊断仓库
            </button>
            <button
              type="button"
              className="secondary"
              onClick={onPrepareBranch}
              disabled={busy || !canPrepareBranch}
            >
              准备分支
            </button>
            <button type="submit" disabled={busy}>
              保存执行器配置
            </button>
          </div>
          {repositoryBootstrap ? <RepositoryBootstrapPanel bootstrap={repositoryBootstrap} /> : null}
          {inspection ? <RepositoryInspectionPanel inspection={inspection} /> : null}
          {branchPreparation ? <BranchPreparationPanel preparation={branchPreparation} /> : null}
        </div>
      </details>
    </form>
  );
}

function RepositoryBootstrapPanel({ bootstrap }) {
  const issueItems = bootstrap.issues || [];
  const recommendationItems = bootstrap.recommendations || [];
  const filesCreated = bootstrap.filesCreated || [];

  return (
    <div className={`repository-inspection-panel ${bootstrap.status || 'blocked'}`}>
      <div className="repository-inspection-heading">
        <div>
          <h4>业务仓库初始化</h4>
          <p>{bootstrap.localPath || '未配置本地路径'}</p>
        </div>
        <span>{repositoryBootstrapStatusLabel(bootstrap.status)}</span>
      </div>
      <div className="repository-inspection-grid">
        <span>
          <small>Git 初始化</small>
          {bootstrap.gitInitialized ? '是' : '否'}
        </span>
        <span>
          <small>初始提交</small>
          {bootstrap.initialCommitCreated ? '是' : '否'}
        </span>
        <span>
          <small>当前分支</small>
          {bootstrap.currentBranch || '未知'}
        </span>
        <span>
          <small>文件数</small>
          {filesCreated.length}
        </span>
      </div>
      {filesCreated.length ? (
        <>
          <strong>初始化文件</strong>
          <ul>
            {filesCreated.map((file) => (
              <li key={file}>{file}</li>
            ))}
          </ul>
        </>
      ) : null}
      <IssueList title="初始化问题" items={issueItems} />
      <IssueList title="建议动作" items={recommendationItems} />
    </div>
  );
}

function RepositoryInspectionPanel({ inspection }) {
  const issueItems = inspection.issues || [];
  const recommendationItems = inspection.recommendations || [];

  return (
    <div className={`repository-inspection-panel ${inspection.status || 'blocked'}`}>
      <div className="repository-inspection-heading">
        <div>
          <h4>仓库诊断</h4>
          <p>{inspection.localPath || '未配置本地路径'}</p>
        </div>
        <span>{repositoryInspectionStatusLabel(inspection.status)}</span>
      </div>
      <div className="repository-inspection-grid">
        <span>
          <small>Git 仓库</small>
          {inspection.isGitRepository ? '是' : '否'}
        </span>
        <span>
          <small>当前分支</small>
          {inspection.currentBranch || '未知'}
        </span>
        <span>
          <small>目标分支</small>
          {inspection.targetBranch || '未配置'}
        </span>
        <span>
          <small>工作区变更</small>
          {inspection.changedFilesCount ? `${inspection.changedFilesCount} 个文件` : '干净'}
        </span>
      </div>
      <DevelopmentChecklist title="诊断问题" items={issueItems} />
      <DevelopmentChecklist title="建议动作" items={recommendationItems} />
    </div>
  );
}

function BranchPreparationPanel({ preparation }) {
  const issueItems = preparation.issues || [];
  const recommendationItems = preparation.recommendations || [];

  return (
    <div className={`branch-preparation-panel ${preparation.status || 'blocked'}`}>
      <div className="branch-preparation-heading">
        <div>
          <h4>分支准备</h4>
          <p>{preparation.localPath || '未配置本地路径'}</p>
        </div>
        <span>{branchPreparationStatusLabel(preparation.status)}</span>
      </div>
      <div className="branch-preparation-grid">
        <span>
          <small>原分支</small>
          {preparation.previousBranch || '未知'}
        </span>
        <span>
          <small>当前分支</small>
          {preparation.currentBranch ? `已检出：${preparation.currentBranch}` : '未知'}
        </span>
        <span>
          <small>目标分支</small>
          {preparation.targetBranch ? `目标：${preparation.targetBranch}` : '未配置'}
        </span>
        <span>
          <small>创建方式</small>
          {preparation.createdBranch ? '已创建' : preparation.targetBranchExisted ? '已复用' : '未创建'}
        </span>
      </div>
      <DevelopmentChecklist title="准备问题" items={issueItems} />
      <DevelopmentChecklist title="建议动作" items={recommendationItems} />
    </div>
  );
}

function AgentExecutionPackagePanel({ agentPackage }) {
  const instructionPreview = localizeWorkflowText(agentPackage.instructions || '暂无执行指令。');
  const instructionLines = instructionPreview.split(/\r?\n/);
  const launchLine = instructionLines[0] || '启动状态：未知';
  const instructionBody = instructionLines.slice(1).join('\n').trim() || '暂无执行指令详情。';

  return (
    <div className={`agent-package-panel ${agentPackage.status || 'blocked'}`}>
      <div className="agent-package-heading">
        <div>
          <h4>智能开发任务包</h4>
          <p>{agentPackage.repository?.localPath || '未配置本地仓库'}</p>
        </div>
        <span>{agentPackageStatusLabel(agentPackage.status)}</span>
      </div>
      <div className="agent-package-grid">
        <span>
          <small>目标分支</small>
          {agentPackage.repository?.targetBranch || '未配置'}
        </span>
        <span>
          <small>任务数</small>
          {(agentPackage.tasks || []).length}
        </span>
        <span>
          <small>检查命令</small>
          {(agentPackage.verificationCommands || []).length}
        </span>
        <span>
          <small>启动状态</small>
          {agentPackage.canStart ? '允许' : '阻塞'}
        </span>
      </div>
      <AgentPackagePrdRiskPanel agentPackage={agentPackage} />
      <div className="agent-gate-list">
        {(agentPackage.gates || []).map((gate) => (
          <span className={`agent-gate ${gate.status || 'blocked'}`} key={gate.id}>
            {gate.label}
          </span>
        ))}
      </div>
      <DevelopmentChecklist title="启动阻塞" items={agentPackage.blockers} />
      <div className="command-strip" aria-label="智能开发任务包检查命令">
        {(agentPackage.verificationCommands || []).map((command) => (
          <code key={command}>{command}</code>
        ))}
      </div>
      <details className="agent-instruction-detail-section" aria-label="智能开发任务包指令明细">
        <summary>
          <span>
            <strong>查看执行指令</strong>
            <small>{`${instructionLines.length || 1} 行指令 · ${launchLine}`}</small>
          </span>
        </summary>
        <div className="agent-instruction-preview">
          <strong>{launchLine}</strong>
          <pre>{instructionBody}</pre>
        </div>
      </details>
    </div>
  );
}

function AgentPackagePrdRiskPanel({ agentPackage }) {
  const version = agentPackage.prdVersion || null;
  const impact = agentPackage.requirementChangeImpact || null;
  const isStale = version?.status === 'stale' || impact?.status === 'stale';
  const versionLabel = version?.label || impact?.versionLabel || '未记录';
  const changedQuestions = impact?.changedQuestions || [];
  const requiredActions = impact?.requiredActions || [];

  if (!version && !impact) {
    return null;
  }

  return (
    <div className={`agent-prd-risk-panel ${isStale ? 'stale' : 'current'}`} aria-label="智能开发任务包 PRD 风险">
      <div className="agent-prd-risk-heading">
        <div>
          <strong>{isStale ? `PRD ${versionLabel} 已过期` : `PRD ${versionLabel} 当前有效`}</strong>
          <p>{impact?.summary || (isStale ? '需求已变化，请重新生成 PRD 后再启动开发。' : '当前开发任务包引用的 PRD 有效。')}</p>
        </div>
        <span>{isStale ? '阻塞' : '有效'}</span>
      </div>
      {changedQuestions.length ? (
        <div className="agent-prd-risk-changes">
          {changedQuestions.map((question) => (
            <article key={question.id}>
              <strong>{question.label || question.id}</strong>
              <p>{question.currentAnswer || '当前答案为空'}</p>
            </article>
          ))}
        </div>
      ) : null}
      {requiredActions.length ? (
        <div className="agent-prd-risk-actions">
          {requiredActions.map((action) => (
            <span key={action}>{action}</span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function DefectFixIterationPanel({
  busy = false,
  canQueueJob = false,
  defectFixPackage,
  onQueueJob,
  onUpdateJob,
  relatedJobs = [],
}) {
  const failingCases = defectFixPackage.failingTestCases || [];
  const requiredFixes = defectFixPackage.requiredFixes || [];
  const regressionFocus = defectFixPackage.regressionFocus || [];
  const submission = defectFixPackage.repairSubmission;
  const remainingGates = submission?.requiredGates || [];
  const hasActiveJob = relatedJobs.some((job) => ['queued', 'running'].includes(job.status));

  return (
    <div className={`defect-fix-iteration ${defectFixPackage.status || 'blocked'}`}>
      <div className="defect-fix-heading">
        <div>
          <h4>测试缺陷修复迭代</h4>
          <p>{`来源提交 ${defectFixPackage.sourceCommitHash || '未记录'} · 测试通过 ${
            defectFixPackage.qaPassRate || '未记录'
          }`}</p>
        </div>
        <span>{defectFixPackageStatusLabel(defectFixPackage.status)}</span>
      </div>
      {submission ? (
        <div className="defect-fix-submission">
          <strong>{`修复提交 ${submission.commitHash || '未记录'} · ${
            localizeRoleLabel(submission.submittedBy || '未记录')
          }`}</strong>
          <small>{`流转状态 ${defectFixRepairSubmissionStatusLabel(submission.status)}`}</small>
          <small>{`剩余门禁 ${
            remainingGates.length ? remainingGates.map(localizeWorkflowText).join('、') : '无'
          }`}</small>
          {submission.qaRetestPassRate ? <small>{`测试复测 ${submission.qaRetestPassRate}`}</small> : null}
          {submission.jobId ? (
            <div className="defect-fix-submission-job">
              <strong>{`后台任务 ${jobStatusLabel(submission.jobStatus)} · ${submission.jobId}`}</strong>
              <PlatformJobEvidence job={createSubmissionEvidenceJob(submission)} />
            </div>
          ) : null}
        </div>
      ) : null}
      <div className="defect-fix-grid">
        <span>
          <small>来源阶段</small>
          {qaRoutingTargetLabel(defectFixPackage.sourceStageId)}
        </span>
        <span>
          <small>目标阶段</small>
          {qaRoutingTargetLabel(defectFixPackage.targetStageId)}
        </span>
        <span>
          <small>失败用例</small>
          {failingCases.length}
        </span>
        <span>
          <small>回归关注</small>
          {regressionFocus.length}
        </span>
      </div>
      <DevelopmentChecklist title="回流原因" items={defectFixPackage.reasons || []} />
      <DevelopmentChecklist
        title="失败用例"
        items={failingCases.map(
          (testCase) => `${testCase.title || testCase.id} · ${qaCaseStatusLabel(testCase.status)}`,
        )}
      />
      <DevelopmentChecklist title="必修项" items={requiredFixes.map((item) => `修复要求：${item}`)} />
      <DevelopmentChecklist title="回归关注" items={regressionFocus} />
      <div className="defect-fix-job-actions">
        <button
          type="button"
          className="secondary"
          onClick={onQueueJob}
          disabled={busy || !canQueueJob || hasActiveJob}
        >
          排队修复执行任务
        </button>
        <small>
          {hasActiveJob
            ? '已有修复执行任务在排队或运行。'
            : '生成可审计的后台任务，保留沙箱策略和修复范围。'}
        </small>
      </div>
      {relatedJobs.length ? (
        <div className="defect-fix-job-list">
          {relatedJobs.map((job) => (
            <article className={`defect-fix-job ${job.status || 'queued'}`} key={job.id}>
              <div>
                <strong>{`${localizeWorkflowText(job.title)} · ${jobStatusLabel(job.status)}`}</strong>
                <small>{`${localizeWorkflowText(job.executor || 'local-rule')} · ${
                  job.command || '未记录命令'
                }`}</small>
              </div>
              <DefectFixJobAuditStrip job={job} />
              <DefectFixJobControls busy={busy} job={job} onUpdateJob={onUpdateJob} />
              <PlatformJobEvidence job={job} />
            </article>
          ))}
        </div>
      ) : null}
      <p className="defect-fix-exit">修复后必须重新进入代码评审和测试验证。</p>
    </div>
  );
}

function DefectFixJobAuditStrip({ job }) {
  const runCount = Number(job.runCount || 0);
  const lifecycleLabel = createDefectFixJobLifecycleLabel(job);

  return (
    <div className="defect-fix-job-audit">
      <span>{`请求人 ${job.requestedBy || '未记录'} · 第 ${runCount || 1} 次运行`}</span>
      <span>{lifecycleLabel}</span>
      <span>{`下一步：${defectFixJobNextActionLabel(job.status)}`}</span>
    </div>
  );
}

function createDefectFixJobLifecycleLabel(job = {}) {
  if (job.status === 'running') {
    return `启动 ${job.startedAt || '未记录'}`;
  }
  if (['succeeded', 'failed', 'cancelled', 'exhausted'].includes(job.status)) {
    return `结束 ${job.finishedAt || job.updatedAt || '未记录'}`;
  }
  return `排队 ${job.queuedAt || '未记录'}`;
}

function defectFixJobNextActionLabel(status) {
  const labels = {
    cancelled: '确认是否需要重新排队修复任务。',
    exhausted: '升级给技术负责人处理阻塞。',
    failed: '查看错误证据后重试任务。',
    queued: '启动任务执行修复命令。',
    running: '等待 runner 完成后标记成功、失败或取消。',
    succeeded: '进入 Review 门禁并等待复审。',
  };

  return labels[status] || '检查任务状态并补齐执行证据。';
}

function DefectFixJobControls({ busy = false, job, onUpdateJob }) {
  if (!job || !onUpdateJob) {
    return null;
  }

  return (
    <div className="defect-fix-job-controls">
      {job.status === 'queued' ? (
        <>
          <button disabled={busy} onClick={() => onUpdateJob(job, 'start')} type="button">
            开始任务
          </button>
          <button disabled={busy} onClick={() => onUpdateJob(job, 'cancel')} type="button">
            取消任务
          </button>
        </>
      ) : null}
      {job.status === 'running' ? (
        <>
          <button disabled={busy} onClick={() => onUpdateJob(job, 'complete')} type="button">
            完成任务
          </button>
          <button disabled={busy} onClick={() => onUpdateJob(job, 'fail')} type="button">
            标记失败
          </button>
          <button disabled={busy} onClick={() => onUpdateJob(job, 'cancel')} type="button">
            取消任务
          </button>
        </>
      ) : null}
      {job.status === 'failed' ? (
        <button disabled={busy} onClick={() => onUpdateJob(job, 'retry')} type="button">
          重试任务
        </button>
      ) : null}
    </div>
  );
}

function createSubmissionEvidenceJob(submission = {}) {
  return {
    command: submission.jobCommand || '',
    details: {
      sandboxPolicy: submission.sandboxPolicy || '',
      blockedCommand: submission.blockedCommand || '',
    },
    durationMs: Number.isFinite(submission.jobDurationMs) ? submission.jobDurationMs : 0,
    errorSummary: submission.jobErrorSummary || '',
    exitCode: Number.isInteger(submission.jobExitCode) ? submission.jobExitCode : null,
    resultSummary: submission.jobResultSummary || '',
    stderr: submission.jobStderr || '',
    stdout: submission.jobStdout || '',
  };
}

function DevelopmentRunPanel({ run }) {
  return (
    <div className="development-run-panel">
      <div className="development-run-heading">
        <div>
          <h4>开发执行记录</h4>
          <p>{run.summary || '当前还没有执行摘要。'}</p>
        </div>
        <span className={`run-status ${run.status || 'ready-for-agent'}`}>
          {developmentRunStatusLabel(run.status)}
        </span>
      </div>

      {run.repositorySnapshot ? <RepositorySnapshotPanel snapshot={run.repositorySnapshot} /> : null}
      {run.commitHash || run.filesChanged?.length ? <DevelopmentRunChangePanel run={run} /> : null}
      {run.repositoryAudit ? <RepositoryAuditPanel audit={run.repositoryAudit} /> : null}
      {run.changePackage ? <DevelopmentChangePackagePanel pack={run.changePackage} /> : null}

      <div className="development-run-grid">
        <section className="run-section">
          <h5>任务结果</h5>
          <div className="run-result-list">
            {(run.taskResults || []).map((task) => (
              <article className="run-result" key={task.taskId}>
                <div>
                  <span>{task.area || '开发'}</span>
                  <strong>{task.title}</strong>
                </div>
                <small>{developmentRunTaskStatusLabel(task.status)}</small>
                {task.result ? <p>{task.result}</p> : null}
              </article>
            ))}
          </div>
        </section>

        <section className="run-section">
          <h5>检查结果</h5>
          <div className="run-check-list">
            {(run.checks || []).map((check) => (
              <div className="run-check" key={check.command}>
                <code>{check.command}</code>
                <span>{developmentCheckStatusLabel(check.status)}</span>
                <div className="run-check-meta">
                  {Number.isFinite(check.durationMs) ? <small>{check.durationMs}ms</small> : null}
                  {check.exitCode !== undefined && check.exitCode !== null ? (
                    <small>exit {check.exitCode}</small>
                  ) : null}
                </div>
                {check.result ? <small>{check.result}</small> : null}
              </div>
            ))}
          </div>
        </section>
      </div>

      <div className="development-run-followups">
        <DevelopmentChecklist title="阻塞项" items={run.blockers} />
        <DevelopmentChecklist title="下一步动作" items={run.nextActions} />
      </div>
    </div>
  );
}

function DevelopmentChangePackagePanel({ pack }) {
  const verification = pack.verification || {};
  const gate = pack.reviewGate || {};

  return (
    <div className={`development-change-package ${pack.status || 'blocked'}`}>
      <div className="development-change-package-heading">
        <div>
          <strong>开发变更包</strong>
          <p>{pack.summary || '开发变更、仓库审计和检查结果尚未汇总。'}</p>
        </div>
        <span>{pack.status === 'ready-for-review' ? '可进入代码评审' : '存在阻塞'}</span>
      </div>
      <div className="development-change-package-grid">
        <span>
          <small>提交</small>
          {pack.commitHash || '未记录'}
        </span>
        <span>
          <small>变更文件</small>
          {(pack.filesChanged || []).length}
        </span>
        <span>
          <small>检查通过</small>
          {verification.passed || 0}/{verification.total || 0}
        </span>
        <span>
          <small>评审门禁</small>
          {gate.canStartReview ? '允许' : '阻塞'}
        </span>
      </div>
      {(pack.filesChanged || []).length ? (
        <ul>
          {pack.filesChanged.map((file) => (
            <li key={file}>{file}</li>
          ))}
        </ul>
      ) : null}
      <DevelopmentChecklist title="评审阻塞" items={gate.blockers || []} />
    </div>
  );
}

function RepositoryAuditPanel({ audit }) {
  const beforeChanged = audit.before?.changedFiles?.length || 0;
  const afterChanged = audit.after?.changedFiles?.length || 0;

  return (
    <div className="run-repository-audit">
      <strong>执行审计</strong>
      <div>
        <span>
          <small>执行分支</small>
          {audit.after?.branch || audit.before?.branch || '未记录'}
        </span>
        <span>
          <small>执行前 HEAD</small>
          {audit.before?.head || '未记录'}
        </span>
        <span>
          <small>执行后 HEAD</small>
          {audit.after?.head || '未记录'}
        </span>
        <span>
          <small>提交状态</small>
          {audit.committed ? '已提交' : '未产生新提交'}
        </span>
        <span>
          <small>执行前工作区</small>
          {beforeChanged ? `${beforeChanged} 个变更` : '干净'}
        </span>
        <span>
          <small>执行后工作区</small>
          {afterChanged ? `${afterChanged} 个变更` : '干净'}
        </span>
      </div>
    </div>
  );
}

function CodeReviewPanel({ busy, defectFixPackage, onRun, permission, report, run }) {
  const changePackage = run?.changePackage || null;
  const changePackageGate = changePackage?.reviewGate || {};
  const changePackageReady =
    changePackage?.status === 'ready-for-review' && changePackageGate.canStartReview === true;
  const canRunReview = run?.status === 'completed' && changePackageReady;
  const canRunByRole = permission?.allowed !== false;
  const permissionReason = permission && !permission.allowed ? permission.reason : '';
  const reviewPendingMessage = canRunReview
    ? '开发变更包已放行，可以运行代码、安全和性能评审。'
    : changePackage
      ? '开发变更包尚未放行，请先处理门禁阻塞项。'
      : '需要先完成自动开发、本地检查和开发变更包，再运行代码评审。';
  const reviewCategoryCount = report?.categories?.length || 0;
  const reviewFollowupCount =
    (report?.blockers?.length || 0) + (report?.recommendations?.length || 0) + (report?.nextActions?.length || 0);

  return (
    <div className={`code-review-panel ${report?.status || 'pending'}`}>
      <section className="review-action-center" aria-label="评审处理中心">
        <div className="code-review-heading">
          <div>
            <p className="eyebrow">评审处理中心</p>
            <h4>代码评审报告</h4>
            <p>
              {localizeWorkflowText(report?.summary || reviewPendingMessage)}
            </p>
            {permissionReason ? <p className="gate-hint">{localizeWorkflowText(permissionReason)}</p> : null}
          </div>
          <button type="button" onClick={onRun} disabled={busy || !canRunReview || !canRunByRole}>
            运行代码评审
          </button>
        </div>
      </section>

      <CodeReviewReadinessPreview
        canRunReview={canRunReview}
        changePackage={changePackage}
        followupCount={reviewFollowupCount}
        report={report}
      />

      {!report ? <DefectFixReviewGatePanel defectFixPackage={defectFixPackage} run={run} /> : null}
      {run && !report ? <DevelopmentRunChangePanel run={run} /> : null}
      {run?.changePackage && !report ? <DevelopmentChangePackagePanel pack={run.changePackage} /> : null}
      {!report && changePackage && !changePackageReady ? (
        <DevelopmentChecklist title="评审门禁阻塞" items={changePackageGate.blockers || []} />
      ) : null}

      {report ? (
        <details className="review-detail-section" aria-label="代码评审详情">
          <summary>
            <span>
              <strong>代码评审详情</strong>
              <small>{`${reviewCategoryCount} 项评审分类 · ${reviewFollowupCount} 条跟进`}</small>
            </span>
          </summary>
          <div className="code-review-meta">
            <span>
              <small>状态</small>
              {codeReviewStatusLabel(report.status)}
            </span>
            <span>
              <small>提交</small>
              {report.commitHash || run?.commitHash || '未记录'}
            </span>
            <span>
              <small>评审时间</small>
              {formatDateTime(report.reviewedAt)}
            </span>
          </div>

          <div className="code-review-categories">
            {(report.categories || []).map((category) => (
              <CodeReviewCategoryPanel category={category} key={category.id || category.label} />
            ))}
          </div>

          <div className="development-run-followups">
            <DevelopmentChecklist title="阻塞项" items={report.blockers} />
            <DevelopmentChecklist title="建议" items={report.recommendations} />
            <DevelopmentChecklist title="下一步动作" items={report.nextActions} />
          </div>

          <CodeReviewHandoffPanel report={report} />
        </details>
      ) : (
        <div className="code-review-empty">
          <strong>尚未运行代码评审</strong>
          <p>运行后系统会记录代码质量、安全和性能结论，并作为进入测试阶段的门禁。</p>
        </div>
      )}
    </div>
  );
}

function CodeReviewReadinessPreview({ canRunReview = false, changePackage, followupCount = 0, report }) {
  const categories = report?.categories || [];
  const passedCategoryCount = categories.filter((category) => category.status === 'passed').length;
  const reviewMetric = categories.length ? `评审 ${passedCategoryCount}/${categories.length}` : '评审待执行';
  const handoffReady = report?.qaHandoff?.status === 'ready';
  const handoffLabel = report ? (handoffReady ? '测试交接已就绪' : '测试交接待补') : '测试交接待生成';
  const commitHash = report?.commitHash || changePackage?.commitHash || '未记录';
  const firstBlocker = report?.blockers?.[0] || changePackage?.reviewGate?.blockers?.[0] || '';
  const priorityText =
    firstBlocker ||
    report?.nextActions?.[0] ||
    report?.recommendations?.[0] ||
    report?.summary ||
    (canRunReview ? '可以运行代码、安全和性能评审。' : '等待开发变更包通过评审门禁。');
  const noteText =
    report?.status === 'passed'
      ? '评审已通过，可进入测试阶段。'
      : firstBlocker
        ? '先处理评审阻塞，再重新运行代码评审。'
        : canRunReview
          ? '可运行评审并生成测试交接要求。'
          : '开发变更包放行后再运行评审。';
  const noteTone =
    firstBlocker || report?.status === 'needs-work' || report?.status === 'failed'
      ? 'blocked'
      : report?.status === 'passed'
        ? 'ready'
        : 'warning';

  return (
    <section aria-label="评审就绪摘要" className="review-readiness-preview">
      <div className="review-readiness-copy">
        <p className="eyebrow">评审就绪摘要</p>
        <strong>评审就绪摘要</strong>
        <span>代码质量、安全、性能和测试交接明细默认收起，先判断评审门禁是否放行。</span>
      </div>
      <div className="review-readiness-metrics" aria-label="评审摘要指标">
        <span>{reviewMetric}</span>
        <span>{`跟进 ${followupCount}`}</span>
        <span>{handoffLabel}</span>
        <span>{`提交 ${commitHash}`}</span>
      </div>
      <div className={`review-readiness-note ${noteTone}`}>
        <strong>{localizeWorkflowText(priorityText)}</strong>
        <span>{noteText}</span>
      </div>
    </section>
  );
}

function DefectFixReviewGatePanel({ defectFixPackage, run }) {
  const submission = defectFixPackage?.repairSubmission;
  const status = submission?.status || defectFixPackage?.status || '';
  const isReviewGate = ['reviewing', 'review-ready'].includes(status);

  if (!defectFixPackage || !submission || !isReviewGate) {
    return null;
  }

  const filesChanged = submission.filesChanged?.length
    ? submission.filesChanged
    : run?.filesChanged?.length
      ? run.filesChanged
      : run?.changePackage?.filesChanged || [];
  const remainingGates = submission.requiredGates || [];
  const sourceCommit = defectFixPackage.sourceCommitHash || '未记录';
  const repairCommit = submission.commitHash || run?.commitHash || '未记录';
  const jobLine = submission.jobId
    ? `后台任务 ${jobStatusLabel(submission.jobStatus)} · ${submission.jobId}`
    : '后台任务 未记录';

  return (
    <div className={`defect-fix-review-gate ${status}`}>
      <div className="defect-fix-review-gate-heading">
        <div>
          <strong>测试缺陷修复评审门禁</strong>
          <p>{`来源测试 ${sourceCommit} · 修复提交 ${repairCommit}`}</p>
        </div>
        <span>{defectFixRepairSubmissionStatusLabel(status)}</span>
      </div>
      <div className="defect-fix-review-gate-grid">
        <span>{jobLine}</span>
        <span>{`变更文件 ${filesChanged.length} · 剩余门禁 ${
          remainingGates.length ? remainingGates.map(localizeWorkflowText).join('、') : '无'
        }`}</span>
        {submission.sandboxPolicy ? <span>{`沙箱策略 ${localizeWorkflowText(submission.sandboxPolicy)}`}</span> : null}
      </div>
      {submission.jobResultSummary ? <p>{localizeWorkflowText(submission.jobResultSummary)}</p> : null}
      <div className="development-run-followups">
        <DevelopmentChecklist title="修复要求" items={defectFixPackage.requiredFixes || []} />
        <DevelopmentChecklist title="回归关注" items={defectFixPackage.regressionFocus || []} />
        <DevelopmentChecklist title="变更文件" items={filesChanged} />
      </div>
    </div>
  );
}

function CodeReviewHandoffPanel({ report }) {
  const source = report.sourceChangePackage || {};
  const handoff = report.qaHandoff || {};

  if (!report.sourceChangePackage && !report.qaHandoff) {
    return null;
  }

  return (
    <div className={`code-review-handoff ${handoff.status || 'blocked'}`}>
      <div className="code-review-handoff-heading">
        <div>
          <strong>测试交接</strong>
          <p>代码评审通过后，测试阶段按这些关注点和证据要求执行。</p>
        </div>
        <span>{handoff.status === 'ready' ? '已就绪' : '被阻塞'}</span>
      </div>
      <div className="code-review-handoff-grid">
        <span>
          <small>提交</small>
          {handoff.commitHash || source.commitHash || report.commitHash || '未记录'}
        </span>
        <span>
          <small>变更文件</small>
          {source.filesChangedCount ?? source.filesChanged?.length ?? 0}
        </span>
        <span>
          <small>本地检查</small>
          {source.verification ? `${source.verification.passed}/${source.verification.total}` : '未记录'}
        </span>
      </div>
      <div className="development-run-followups">
        <DevelopmentChecklist title="测试关注" items={handoff.focusAreas || []} />
        <DevelopmentChecklist title="必需证据" items={handoff.requiredEvidence || []} />
        <DevelopmentChecklist title="交接阻塞" items={handoff.blockers || []} />
      </div>
    </div>
  );
}

function CodeReviewCategoryPanel({ category }) {
  return (
    <article className={`code-review-category ${category.status || 'needs-work'}`}>
      <div>
        <strong>{category.label || category.id}</strong>
        <span>{codeReviewCategoryStatusLabel(category.status)}</span>
      </div>
      {category.summary ? <p>{category.summary}</p> : null}
      {(category.findings || []).length ? (
        <ul>
          {category.findings.map((finding) => (
            <li key={typeof finding === 'string' ? finding : `${finding.title}-${finding.detail || ''}`}>
              {typeof finding === 'string' ? finding : finding.title || finding.message}
              {typeof finding !== 'string' && finding.detail ? `：${finding.detail}` : ''}
            </li>
          ))}
        </ul>
      ) : (
        <small>暂无问题。</small>
      )}
    </article>
  );
}

function QaRunPanel({
  busy,
  evidence,
  evidenceDraft,
  focusedTask,
  onEvidenceDraftChange,
  onCompleteYoloQaSession,
  onRecordYoloQaEvent,
  onRun,
  onRouteDefects,
  onSaveEvidence,
  onStartYoloQaSession,
  onReviewYoloQaEvent,
  onYoloQaEventDraftChange,
  permissions = {},
  report,
  requiresFalsePositiveEvidence = false,
  review,
  yoloQaEventDraft,
  yoloQaSession,
}) {
  const canRunQa = review?.status === 'passed';
  const canRunByRole = permissions.run?.allowed !== false;
  const runPermissionReason = permissions.run && !permissions.run.allowed ? permissions.run.reason : '';
  const qaCaseCount = report?.testCases?.length || 0;
  const qaFollowupCount =
    (report?.blockers?.length || 0) +
    (report?.defects?.length || 0) +
    (report?.recommendations?.length || 0) +
    (report?.nextActions?.length || 0);
  const evidenceReady = evidence?.status === 'ready';
  const missingEvidenceCount = evidence?.missingFields?.length || 0;
  const qaStatusText = report ? `用例 ${report.passedCount ?? 0}/${report.totalCount ?? qaCaseCount}` : '用例待执行';
  const qaFollowupText = qaFollowupCount ? `测试跟进 ${qaFollowupCount}` : '暂无测试跟进';
  const qaEvidenceText = evidenceReady
    ? '证据已就绪'
    : missingEvidenceCount
      ? `证据待补 ${missingEvidenceCount}`
      : '证据待补';

  return (
    <div className={`qa-run-panel ${report?.status || 'pending'}`}>
      <section className="qa-action-center" aria-label="测试处理中心">
        <div className="qa-run-heading">
          <div>
            <p className="eyebrow">测试处理中心</p>
            <h4>测试验证报告</h4>
            <p>
              {localizeWorkflowText(
                report?.summary ||
                (canRunQa
                  ? '代码评审已通过，可以生成并执行测试用例。'
                  : '需要先通过代码评审，再进入测试执行。'),
              )}
            </p>
            {runPermissionReason ? <p className="gate-hint">{runPermissionReason}</p> : null}
          </div>
          <button type="button" onClick={onRun} disabled={busy || !canRunQa || !canRunByRole}>
            生成并执行测试用例
          </button>
        </div>
        <div className="qa-status-strip" aria-label="测试处理摘要">
          <span className={report ? 'ready' : 'warning'}>{qaStatusText}</span>
          <span className={qaFollowupCount ? 'warning' : 'ready'}>{qaFollowupText}</span>
          <span className={evidenceReady ? 'ready' : 'warning'}>{qaEvidenceText}</span>
          <span className={canRunQa ? 'ready' : 'warning'}>{canRunQa ? '评审已通过' : '评审待通过'}</span>
        </div>
      </section>

      <details className="qa-action-detail-section" aria-label="测试操作详情">
        <summary>
          <span>
            <strong>测试操作详情</strong>
            <small>{`${qaCaseCount} 个用例 · ${qaFollowupCount} 条跟进`}</small>
          </span>
        </summary>
        <div className="qa-action-detail-body">
          <QaReadinessPreview
            canRunQa={canRunQa}
            evidence={evidence}
            followupCount={qaFollowupCount}
            report={report}
            review={review}
          />

          <QaEvidencePanel
            busy={busy}
            draft={evidenceDraft}
            evidence={evidence}
            focusedTask={focusedTask}
            onDraftChange={onEvidenceDraftChange}
            onSave={onSaveEvidence}
            permission={permissions.evidence}
            requiresFalsePositiveEvidence={requiresFalsePositiveEvidence}
          />

          <YoloQaSessionPanel
            busy={busy}
            enabled={requiresFalsePositiveEvidence}
            eventDraft={yoloQaEventDraft}
            onComplete={onCompleteYoloQaSession}
            onDraftChange={onYoloQaEventDraftChange}
            onRecordEvent={onRecordYoloQaEvent}
            onReviewEvent={onReviewYoloQaEvent}
            onStart={onStartYoloQaSession}
            session={yoloQaSession}
          />

          {report ? (
            <details className="qa-detail-section" aria-label="测试验证详情">
              <summary>
                <span>
                  <strong>测试验证详情</strong>
                  <small>{`${qaCaseCount} 个用例 · ${qaFollowupCount} 条跟进`}</small>
                </span>
              </summary>
              <div className="qa-run-meta">
                <span>
                  <small>状态</small>
                  {qaRunStatusLabel(report.status)}
                </span>
                <span>
                  <small>用例通过</small>
                  {report.passedCount ?? 0}/{report.totalCount ?? 0}
                </span>
                <span>
                  <small>提交</small>
                  {report.commitHash || '未记录'}
                </span>
              </div>

              <QaReviewHandoffPanel report={report} review={review} />

              <div className="qa-case-list">
                {(report.testCases || []).map((testCase) => (
                  <article className={`qa-case ${testCase.status || 'not-run'}`} key={testCase.id || testCase.title}>
                    <div>
                      <strong>{testCase.title}</strong>
                      <span>{qaCaseStatusLabel(testCase.status)}</span>
                    </div>
                    {testCase.scenario ? <p>{testCase.scenario}</p> : null}
                    {testCase.evidence ? <small>{testCase.evidence}</small> : null}
                  </article>
                ))}
              </div>

              <div className="development-run-followups">
                <DevelopmentChecklist title="阻塞项" items={report.blockers} />
                <DevelopmentChecklist
                  title="缺陷"
                  items={(report.defects || []).map((item) =>
                    typeof item === 'string' ? item : `${item.title}${item.detail ? `：${item.detail}` : ''}`,
                  )}
                />
                <DevelopmentChecklist title="建议" items={report.recommendations} />
                <DevelopmentChecklist title="下一步动作" items={report.nextActions} />
              </div>

              <QaDefectRoutingPanel
                busy={busy}
                onRouteDefects={onRouteDefects}
                permission={permissions.routeDefects}
                routing={report.defectRouting}
              />
            </details>
          ) : (
            <div className="qa-run-empty">
              <strong>尚未执行测试验证</strong>
              <p>运行后系统会生成测试用例、记录执行结果，并阻止未通过测试的项目继续推进。</p>
            </div>
          )}
        </div>
      </details>
    </div>
  );
}

function QaReadinessPreview({ canRunQa = false, evidence, followupCount = 0, report, review }) {
  const evidenceReady = evidence?.status === 'ready';
  const missingEvidenceCount = evidence?.missingFields?.length || 0;
  const passedCount = report?.passedCount || 0;
  const totalCount = report?.totalCount || 0;
  const qaMetric = totalCount ? `测试 ${passedCount}/${totalCount}` : '测试待执行';
  const reviewLabel = review?.status === 'passed' ? '评审已通过' : '评审待通过';
  const evidenceLabel = evidenceReady
    ? '证据已就绪'
    : missingEvidenceCount
      ? `证据待补 ${missingEvidenceCount}`
      : '证据待补';
  const firstDefect = report?.defects?.[0];
  const priorityText =
    report?.blockers?.[0] ||
    (typeof firstDefect === 'string' ? firstDefect : firstDefect?.title) ||
    report?.nextActions?.[0] ||
    (missingEvidenceCount
      ? `补齐测试证据：${evidence.missingFields.map(qaEvidenceFieldLabel).join('、')}`
      : '') ||
    (canRunQa ? '可以生成并执行测试用例。' : '先通过代码评审，再进入测试。');
  const noteText =
    report?.status === 'passed'
      ? '测试已通过，可以进入最终验收。'
      : followupCount
        ? '先处理测试阻塞、缺陷或补证据事项。'
        : canRunQa
          ? '可生成测试用例并记录执行证据。'
          : '等待代码评审放行后再测试。';

  return (
    <section aria-label="测试就绪摘要" className="qa-readiness-preview">
      <div className="qa-readiness-copy">
        <p className="eyebrow">测试就绪摘要</p>
        <strong>可测试性判断</strong>
        <span>测试用例、缺陷和交接细节默认收起，先判断能否继续推进。</span>
      </div>
      <div className="qa-readiness-metrics" aria-label="测试摘要指标">
        <span>{qaMetric}</span>
        <span>{`跟进 ${followupCount}`}</span>
        <span>{evidenceLabel}</span>
        <span>{reviewLabel}</span>
      </div>
      <div className={`qa-readiness-note ${followupCount ? 'blocked' : report?.status === 'passed' ? 'ready' : 'warning'}`}>
        <strong>{localizeWorkflowText(priorityText)}</strong>
        <span>{noteText}</span>
      </div>
    </section>
  );
}

function QaReviewHandoffPanel({ report, review }) {
  const handoff = report.reviewHandoff || review?.qaHandoff;
  const coveragePlan = report.coveragePlan || null;

  if (!handoff && !coveragePlan) {
    return null;
  }

  return (
    <div className={`qa-review-handoff ${handoff?.status || 'blocked'}`}>
      <div className="qa-review-handoff-heading">
        <div>
          <strong>评审测试交接</strong>
          <p>测试按评审放行的关注点、提交版本和证据要求生成测试结论。</p>
        </div>
        <span>{handoff?.status === 'ready' ? '已就绪' : '被阻塞'}</span>
      </div>
      <div className="qa-review-handoff-grid">
        <span>
          <small>来源</small>
          {localizeWorkflowText(coveragePlan?.source || 'code-review')}
        </span>
        <span>
          <small>提交</small>
          {coveragePlan?.commitHash || handoff?.commitHash || report.commitHash || '未记录'}
        </span>
        <span>
          <small>证据项</small>
          {(coveragePlan?.requiredEvidence || handoff?.requiredEvidence || []).length}
        </span>
      </div>
      <div className="development-run-followups">
        <DevelopmentChecklist title="测试关注" items={coveragePlan?.focusAreas || handoff?.focusAreas || []} />
        <DevelopmentChecklist title="必需证据" items={coveragePlan?.requiredEvidence || handoff?.requiredEvidence || []} />
        <DevelopmentChecklist title="交接阻塞" items={handoff?.blockers || []} />
      </div>
    </div>
  );
}

function QaDefectRoutingPanel({ busy, onRouteDefects, permission, routing }) {
  if (!routing) {
    return null;
  }
  const canRouteToDevelopment =
    routing.shouldReturnToDevelopment && routing.targetStageId === DEVELOPMENT_STAGE_ID;
  const canRouteByRole = permission?.allowed !== false;
  const permissionReason = permission && !permission.allowed ? permission.reason : '';

  return (
    <div className={`qa-defect-routing ${routing.targetStageId || 'qa'}`}>
      <div className="qa-defect-routing-heading">
        <div>
          <strong>缺陷回流</strong>
          <p>{routing.shouldReturnToDevelopment ? '存在实现或覆盖缺口，需要回到自动开发。' : '当前问题留在测试阶段处理。'}</p>
        </div>
        <span>{qaRoutingTargetLabel(routing.targetStageId)}</span>
      </div>
      <DevelopmentChecklist
        title="回流原因"
        items={(routing.reasons || []).map((item) =>
          routing.shouldReturnToDevelopment ? `回开发：${item}` : `补证据：${item}`,
        )}
      />
      {permissionReason ? <p className="gate-hint">{localizeWorkflowText(permissionReason)}</p> : null}
      {canRouteToDevelopment ? (
        <button type="button" onClick={onRouteDefects} disabled={busy || !canRouteByRole}>
          生成缺陷修复包并回开发
        </button>
      ) : null}
    </div>
  );
}

function YoloQaSessionPanel({
  busy,
  enabled,
  eventDraft = createYoloQaEventDraft(),
  onComplete,
  onDraftChange,
  onRecordEvent,
  onReviewEvent,
  onStart,
  session,
}) {
  if (!enabled) {
    return null;
  }

  const events = session?.events || [];
  const metrics = session?.metrics || {};
  const isRunning = session?.status === 'running';
  const isCompleted = session?.status === 'completed';
  const reviewedCount = events.filter((event) => event.reviewStatus !== 'unreviewed').length;
  const canComplete = isRunning && events.length > 0 && reviewedCount === events.length;
  const metricLine = metrics.falsePositiveRate !== null && Number.isFinite(Number(metrics.falsePositiveRate))
    ? `误检率 ${formatPercentage(metrics.falsePositiveRate)} · ${metrics.falsePositiveCount || 0}/${metrics.totalDetections || 0}`
    : `已记录 ${events.length} 条检测事件`;

  return (
    <section className={`yolo-qa-session-panel ${session?.status || 'empty'}`} aria-label="YOLO 测试批次">
      <div className="yolo-qa-session-heading">
        <div>
          <strong>{isRunning ? 'YOLO 测试批次进行中' : isCompleted ? 'YOLO 测试批次已完成' : 'YOLO 测试批次'}</strong>
          <p>记录真实检测事件，由测试人员标注正确检测或误检，完成后自动回填误检率证据。</p>
        </div>
        <span>{metricLine}</span>
      </div>

      {!session ? (
        <button type="button" onClick={onStart} disabled={busy}>
          开始 YOLO 测试批次
        </button>
      ) : null}

      {isRunning ? (
        <>
          <form className="yolo-qa-event-form" aria-label="记录 YOLO 检测事件" onSubmit={onRecordEvent}>
            <label>
              通道
              <input
                min="1"
                type="number"
                value={eventDraft.channel}
                onChange={(event) => onDraftChange('channel', event.target.value)}
              />
            </label>
            <label>
              检测人数
              <input
                min="1"
                type="number"
                value={eventDraft.personCount}
                onChange={(event) => onDraftChange('personCount', event.target.value)}
              />
            </label>
            <label>
              置信度
              <input
                max="1"
                min="0"
                step="0.01"
                type="number"
                value={eventDraft.confidence}
                onChange={(event) => onDraftChange('confidence', event.target.value)}
              />
            </label>
            <button type="submit" disabled={busy}>
              记录检测事件
            </button>
          </form>

          <YoloQaEventList
            busy={busy}
            events={events}
            onReviewEvent={onReviewEvent}
          />

          <button type="button" onClick={onComplete} disabled={busy || !canComplete}>
            完成批次并回填 QA 证据
          </button>
          {!canComplete && events.length ? <p className="gate-hint">所有检测事件标注后才能完成批次。</p> : null}
        </>
      ) : null}

      {isCompleted ? (
        <YoloQaEventList
          busy={busy}
          events={events}
          onReviewEvent={onReviewEvent}
        />
      ) : null}
    </section>
  );
}

function YoloQaEventList({ busy, events = [], onReviewEvent }) {
  if (!events.length) {
    return <p className="yolo-qa-empty">暂无检测事件。</p>;
  }

  return (
    <div className="yolo-qa-event-list" aria-label="YOLO 检测事件列表">
      {events.map((event) => (
        <article className={`yolo-qa-event ${event.reviewStatus}`} key={event.id}>
          <div>
            <strong>{`通道 ${event.channel || '未记录'} · ${event.personCount || 0} 人`}</strong>
            <span>{yoloQaReviewStatusLabel(event.reviewStatus)}</span>
          </div>
          <p>
            {event.confidence === null || typeof event.confidence === 'undefined'
              ? '置信度未记录'
              : `置信度 ${Math.round(Number(event.confidence) * 100)}%`}
          </p>
          {event.reviewNote ? <small>{event.reviewNote}</small> : null}
          {event.reviewStatus === 'unreviewed' ? (
            <div className="yolo-qa-event-actions">
              <button type="button" onClick={() => onReviewEvent(event.id, 'true-positive')} disabled={busy}>
                标为正确检测
              </button>
              <button type="button" onClick={() => onReviewEvent(event.id, 'false-positive')} disabled={busy}>
                标为误检
              </button>
            </div>
          ) : null}
        </article>
      ))}
    </div>
  );
}

function QaEvidencePanel({
  busy,
  draft,
  evidence,
  focusedTask,
  onDraftChange,
  onSave,
  permission,
  requiresFalsePositiveEvidence = false,
}) {
  const isReady = evidence?.status === 'ready';
  const canSaveByRole = permission?.allowed !== false;
  const permissionReason = permission && !permission.allowed ? permission.reason : '';
  const isFocused = Boolean(focusedTask);
  const showFalsePositiveEvidence = Boolean(
    requiresFalsePositiveEvidence ||
    evidence?.requireFalsePositiveMetrics ||
    evidence?.totalDetections ||
    evidence?.falsePositiveCount ||
    draft.totalDetections ||
    draft.falsePositiveCount,
  );
  const filledEvidenceCount = [
    draft.sampleSet,
    draft.durationMinutes,
    draft.environment,
    draft.browserScope,
    ...(showFalsePositiveEvidence ? [draft.totalDetections, draft.falsePositiveCount] : []),
  ].filter((value) => String(value || '').trim()).length;
  const missingEvidenceCount = evidence?.missingFields?.length || 0;
  const falsePositiveSummary = formatFalsePositiveEvidenceSummary(evidence, draft);

  return (
    <form
      aria-label="测试证据面板"
      className={`qa-evidence-panel ${evidence?.status || 'incomplete'} ${isFocused ? 'focused' : ''}`}
      onSubmit={onSave}
    >
      <div className="qa-evidence-heading">
        <div>
          <h4>测试证据</h4>
          <p>确认样本、测试时长、运行环境和浏览器范围后，测试才能解除真实验收阻塞。</p>
        </div>
        <div className="qa-evidence-status-stack">
          {isFocused ? <span className="focused-task-chip">当前测试任务</span> : null}
          <span>{isReady ? '测试证据已就绪' : '测试证据待补充'}</span>
        </div>
      </div>
      {isFocused ? (
        <div className="stage-confirmation-focus-banner">来自个人工作台的聚焦任务</div>
      ) : null}
      {evidence?.missingFields?.length ? (
        <p className="gate-hint">待补字段：{evidence.missingFields.map(qaEvidenceFieldLabel).join('、')}</p>
      ) : null}
      {permissionReason ? <p className="gate-hint">{localizeWorkflowText(permissionReason)}</p> : null}
      <details
        className="qa-evidence-detail-section"
        aria-label="测试证据填写详情"
        {...(isFocused ? { open: true } : {})}
      >
        <summary>
          <span>
            <strong>测试证据填写详情</strong>
            <small>{`已填写 ${filledEvidenceCount} 项 · 待补 ${missingEvidenceCount} 项`}</small>
          </span>
        </summary>
        <div className="qa-evidence-detail-body">
          <label>
            测试视频样本
            <textarea
              value={draft.sampleSet}
              onChange={(event) => onDraftChange('sampleSet', event.target.value)}
              placeholder="例如：10 段测试视频，覆盖有行人、无行人、多人、遮挡、弱光"
              rows="3"
            />
          </label>
          <div className="qa-evidence-grid">
            <label>
              测试时长（分钟）
              <input
                min="0"
                type="number"
                value={draft.durationMinutes}
                onChange={(event) => onDraftChange('durationMinutes', event.target.value)}
              />
            </label>
            <label>
              浏览器范围
              <input
                value={draft.browserScope}
                onChange={(event) => onDraftChange('browserScope', event.target.value)}
                placeholder="例如：Chrome 126, Edge 126"
              />
            </label>
          </div>
          <label>
            测试环境
            <textarea
              value={draft.environment}
              onChange={(event) => onDraftChange('environment', event.target.value)}
              placeholder="例如：本地 RTSP 测试流 + YOLO mock 推理服务"
              rows="2"
            />
          </label>
          {showFalsePositiveEvidence ? (
            <div className="qa-false-positive-section" aria-label="误检率证据">
              <div>
                <strong>误检率证据</strong>
                <span>{falsePositiveSummary}</span>
              </div>
              <div className="qa-evidence-grid">
                <label>
                  总检测次数
                  <input
                    min="0"
                    type="number"
                    value={draft.totalDetections}
                    onChange={(event) => onDraftChange('totalDetections', event.target.value)}
                  />
                </label>
                <label>
                  误检次数
                  <input
                    min="0"
                    type="number"
                    value={draft.falsePositiveCount}
                    onChange={(event) => onDraftChange('falsePositiveCount', event.target.value)}
                  />
                </label>
                <label>
                  误检率阈值
                  <input
                    min="0"
                    step="0.01"
                    type="number"
                    value={draft.falsePositiveThreshold}
                    onChange={(event) => onDraftChange('falsePositiveThreshold', event.target.value)}
                  />
                </label>
              </div>
            </div>
          ) : null}
          <label>
            备注
            <textarea
              value={draft.notes}
              onChange={(event) => onDraftChange('notes', event.target.value)}
              placeholder="记录误检率统计口径、样本来源或测试限制"
              rows="2"
            />
          </label>
          <button type="submit" disabled={busy || !canSaveByRole}>
            保存测试证据
          </button>
        </div>
      </details>
    </form>
  );
}

function AcceptancePackagePanel({ busy, onGenerate, pack }) {
  const isReady = pack?.status === 'ready';
  const isSignedOff = pack?.signoffStatus === 'signed-off';
  const summary =
    pack?.summary ||
    '汇总需求文档、开发结果、代码评审、测试验证、运维交接和剩余风险后，负责人才能签收。';
  const deliverableCount = pack?.deliverables?.length || 0;
  const residualRiskCount = pack?.residualRisks?.length || 0;
  const blockerCount = pack?.blockers?.length || 0;
  const nextActionCount = pack?.nextActions?.length || 0;

  return (
    <div
      className={`acceptance-package-panel ${pack?.status || 'not-generated'} ${
        isSignedOff ? 'signed-off' : ''
      }`}
    >
      <section className="acceptance-action-center" aria-label="验收处理中心">
        <div className="acceptance-package-heading">
          <div>
            <p className="eyebrow">验收处理中心</p>
            <h4>最终验收包</h4>
            <p>{localizeWorkflowText(summary)}</p>
          </div>
          <span>{isSignedOff ? '已签收' : isReady ? '最终验收包已就绪' : '最终验收包待生成'}</span>
        </div>
        <button type="button" onClick={onGenerate} disabled={busy || isSignedOff}>
          生成最终验收包
        </button>
      </section>

      <AcceptanceReadinessPreview
        blockerCount={blockerCount}
        deliverableCount={deliverableCount}
        isReady={isReady}
        isSignedOff={isSignedOff}
        pack={pack}
        residualRiskCount={residualRiskCount}
      />

      <details className="acceptance-detail-section" aria-label="最终验收详情">
        <summary>
          <span>
            <strong>最终验收详情</strong>
            <small>{`${deliverableCount} 项交付物 · ${residualRiskCount} 个剩余风险 · ${nextActionCount} 条动作`}</small>
          </span>
        </summary>

        {blockerCount ? (
          <div className="acceptance-blockers">
            <strong>阻塞项</strong>
            <ul>
              {pack.blockers.map((item) => (
                <li key={item}>{localizeWorkflowText(item)}</li>
              ))}
            </ul>
          </div>
        ) : null}

        {pack?.deliverables?.length ? (
          <div className="acceptance-deliverables">
            {pack.deliverables.map((item) => (
              <article className={item.status} key={item.id}>
                <div>
                  <strong>{localizeWorkflowText(item.title)}</strong>
                  <span>{item.status === 'ready' ? '已就绪' : '缺失'}</span>
                </div>
                <p>{localizeWorkflowText(item.evidence)}</p>
              </article>
            ))}
          </div>
        ) : null}

        {pack?.qa ? (
          <div className="acceptance-summary-grid">
            <span>
              <small>测试状态</small>
              {qaRunStatusLabel(pack.qa.status)}
            </span>
            <span>
              <small>用例通过</small>
              {pack.qa.passedCount || 0}/{pack.qa.totalCount || 0}
            </span>
            <span>
              <small>提交</small>
              {pack.qa.commitHash || '未记录'}
            </span>
            <span>
              <small>测试证据</small>
              {pack.qa.evidenceStatus === 'ready' ? '已就绪' : '待补充'}
            </span>
            {pack.qa.falsePositiveRate !== null && Number.isFinite(Number(pack.qa.falsePositiveRate)) ? (
              <span>
                <small>误检率</small>
                {`${formatPercentage(pack.qa.falsePositiveRate)} / 目标低于 ${formatPercentage(pack.qa.falsePositiveThreshold ?? 0.3)}`}
              </span>
            ) : null}
          </div>
        ) : null}

        {isSignedOff ? (
          <div className="acceptance-signoff-grid">
            <span>
              <small>签收人</small>
              {pack.signedOffBy || '未记录'}
            </span>
            <span>
              <small>签收时间</small>
              {pack.signedOffAt || '未记录'}
            </span>
            <span>
              <small>归档版本</small>
              {pack.archiveVersion || '未记录'}
            </span>
            <span>
              <small>签收意见</small>
              {pack.signoffOpinion || '未记录'}
            </span>
          </div>
        ) : null}

        {pack?.residualRisks?.length ? (
          <div className="acceptance-risk-list">
            <strong>剩余风险</strong>
            <ul>
              {pack.residualRisks.map((risk) => (
                <li key={`${risk.stageName || risk.stageId}-${risk.title}`}>
                  <span>{localizeStageName(risk.stageName || risk.stageId)}</span>
                  {localizeWorkflowText(risk.title)}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <DevelopmentChecklist title="下一步动作" items={pack?.nextActions || []} />
      </details>
    </div>
  );
}

function AcceptanceReadinessPreview({
  blockerCount = 0,
  deliverableCount = 0,
  isReady = false,
  isSignedOff = false,
  pack,
  residualRiskCount = 0,
}) {
  const qaPassed = pack?.qa?.passedCount || 0;
  const qaTotal = pack?.qa?.totalCount || 0;
  const qaMetric = qaTotal ? `测试 ${qaPassed}/${qaTotal}` : '测试待补';
  const signoffLabel = isSignedOff ? '已签收' : isReady ? '待签收' : '待生成';
  const priorityText =
    pack?.blockers?.[0] ||
    pack?.residualRisks?.[0]?.title ||
    pack?.nextActions?.[0] ||
    pack?.summary ||
    '等待生成最终验收包。';
  const noteText = blockerCount
    ? '先解除阻塞，再生成或签收验收包。'
    : isReady
      ? '确认交付证据后可完成最终签收。'
      : '生成验收包后再进行签收。';

  return (
    <section aria-label="验收就绪摘要" className="acceptance-readiness-preview">
      <div className="acceptance-readiness-copy">
        <p className="eyebrow">验收就绪摘要</p>
        <strong>验收就绪摘要</strong>
        <span>完整交付物和风险清单默认收起，先判断能否签收。</span>
      </div>
      <div className="acceptance-readiness-metrics" aria-label="验收摘要指标">
        <span>{`交付物 ${deliverableCount}`}</span>
        <span>{qaMetric}</span>
        <span>{`剩余风险 ${residualRiskCount}`}</span>
        <span>{`阻塞 ${blockerCount}`}</span>
        <span>{signoffLabel}</span>
      </div>
      <div
        className={`acceptance-readiness-note ${
          blockerCount ? 'blocked' : residualRiskCount ? 'warning' : 'ready'
        }`}
      >
        <strong>{localizeWorkflowText(priorityText)}</strong>
        <span>{noteText}</span>
      </div>
    </section>
  );
}

function DevelopmentRunChangePanel({ run }) {
  return (
    <div className="run-change-panel">
      <strong>本次变更</strong>
      <div>
        <span>
          <small>提交</small>
          {run.commitHash || '未提交'}
        </span>
        <span>
          <small>变更文件</small>
          {(run.filesChanged || []).length}
        </span>
      </div>
      {(run.filesChanged || []).length ? (
        <ul>
          {run.filesChanged.map((file) => (
            <li key={file}>{file}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function RepositorySnapshotPanel({ snapshot }) {
  return (
    <div className="run-repository-snapshot">
      <strong>执行仓库快照</strong>
      <div>
        <span>
          <small>仓库/路径</small>
          {snapshot.repositoryUrl || snapshot.localPath || '未配置'}
        </span>
        <span>
          <small>基准分支</small>
          {snapshot.baseBranch || 'main'}
        </span>
        <span>
          <small>目标分支</small>
          {snapshot.targetBranch || '未配置'}
        </span>
        <span>
          <small>执行模式</small>
          {executionModeLabel(snapshot.executionMode)}
        </span>
      </div>
    </div>
  );
}

function DevelopmentChecklist({ title, items = [] }) {
  return (
    <div className="development-checklist">
      <strong>{localizeWorkflowText(title)}</strong>
      <ul>
        {items.length === 0 ? <li>暂无。</li> : null}
        {items.map((item) => (
          <li key={item}>{localizeWorkflowText(item)}</li>
        ))}
      </ul>
    </div>
  );
}

function CurrentRiskListPanel({ risks = [] }) {
  const primaryRisk = risks[0] || '当前没有项目级风险。';

  return (
    <div className="current-risk-panel">
      <h4>当前风险</h4>
      <section className="current-risk-summary" aria-label="当前风险摘要">
        <div>
          <strong>{localizeWorkflowText(primaryRisk)}</strong>
          <span>{risks.length ? '项目级风险默认收起，按需展开核验。' : '当前项目没有登记项目级风险。'}</span>
        </div>
        <div className="current-risk-metrics">
          <span>{`风险 ${risks.length}`}</span>
        </div>
      </section>
      <details className="current-risk-detail-section" aria-label="当前风险明细">
        <summary>
          <span>
            <strong>当前风险明细</strong>
            <small>{`${risks.length} 条项目级风险`}</small>
          </span>
        </summary>
        <ul className="risk-list">
          {risks.length === 0 ? <li>暂无项目级风险。</li> : null}
          {risks.map((risk) => (
            <li key={risk}>{localizeWorkflowText(risk)}</li>
          ))}
        </ul>
      </details>
    </div>
  );
}

function StageRiskPanel({ entry, title }) {
  const potentialRisks = entry.potentialRisks || [];
  const functionalGaps = entry.functionalGaps || [];
  const recommendedActions = entry.recommendedActions || [];

  return (
    <div className={`stage-risk-panel ${entry.riskLevel || 'medium'}`}>
      <div className="stage-risk-heading">
        <div>
          <h4>{title}</h4>
          <p>
            {localizeStageName(entry.stageName)} · {localizeRoleLabel(entry.owner)}
          </p>
        </div>
        <span className={`risk-level ${entry.riskLevel || 'medium'}`}>
          {riskLevelLabel(entry.riskLevel)}
        </span>
      </div>
      <div className="stage-risk-metrics" aria-label={`${title}摘要指标`}>
        <span>{`潜在风险 ${potentialRisks.length}`}</span>
        <span>{`功能不足 ${functionalGaps.length}`}</span>
        <span>{`建议动作 ${recommendedActions.length}`}</span>
      </div>
      <div className="stage-risk-primary-note">
        <strong>
          {localizeWorkflowText(
            potentialRisks[0]?.title || functionalGaps[0]?.title || recommendedActions[0] || '暂无需要立即处理的风险。',
          )}
        </strong>
        <span>详细风险、功能不足和建议动作默认收起，按需展开处理。</span>
      </div>
      <details className="stage-risk-detail-section" aria-label="当前阶段风险详情">
        <summary>
          <span>
            <strong>当前阶段风险详情</strong>
            <small>{`${potentialRisks.length} 个风险 · ${functionalGaps.length} 个不足 · ${recommendedActions.length} 条建议`}</small>
          </span>
        </summary>
        <div className="stage-risk-detail-body">
          <StageIssueList title="潜在风险" items={potentialRisks} />
          <StageIssueList title="功能不足" items={functionalGaps} />
          <div className="stage-issue-list">
            <strong>建议动作</strong>
            <ul>
              {recommendedActions.length === 0 ? <li>暂无。</li> : null}
              {recommendedActions.map((action) => (
                <li key={action}>{localizeWorkflowText(action)}</li>
              ))}
            </ul>
          </div>
        </div>
      </details>
    </div>
  );
}

function StageRiskRegisterPanel({ activeStageId, entries }) {
  if (!entries.length) {
    return null;
  }

  const highRiskCount = entries.filter((entry) => entry.riskLevel === 'high').length;
  const potentialRiskCount = entries.reduce(
    (total, entry) => total + (entry.potentialRisks || []).length,
    0,
  );
  const functionalGapCount = entries.reduce(
    (total, entry) => total + (entry.functionalGaps || []).length,
    0,
  );
  const activeEntry = entries.find((entry) => entry.stageId === activeStageId);
  const priorityEntry = activeEntry || entries.find((entry) => entry.riskLevel === 'high') || entries[0];
  const priorityText =
    priorityEntry?.potentialRisks?.[0]?.title ||
    priorityEntry?.functionalGaps?.[0]?.title ||
    priorityEntry?.recommendedActions?.[0] ||
    '暂无明确风险';

  return (
    <div className="stage-risk-register-panel">
      <h4>阶段风险台账</h4>
      <section className="stage-risk-register-summary" aria-label="阶段风险台账摘要">
        <div>
          <strong>{localizeStageName(priorityEntry?.stageName) || '阶段风险'}</strong>
          <span>{localizeWorkflowText(priorityText)}</span>
        </div>
        <div className="stage-risk-register-metrics">
          <span>{`阶段 ${entries.length}`}</span>
          <span>{`高风险 ${highRiskCount}`}</span>
          <span>{`潜在风险 ${potentialRiskCount}`}</span>
          <span>{`功能不足 ${functionalGapCount}`}</span>
        </div>
      </section>
      <details className="stage-risk-register-section" aria-label="阶段风险台账明细">
        <summary>
          <span>
            <strong>阶段风险台账明细</strong>
            <small>{`${entries.length} 个阶段 · ${potentialRiskCount} 个风险 · ${functionalGapCount} 个不足`}</small>
          </span>
        </summary>
        <div className="stage-risk-register">
          {entries.map((entry) => (
            <div
              className={`stage-risk-row ${entry.stageId === activeStageId ? 'active' : ''}`}
              key={entry.stageId}
            >
              <div>
                <strong>{localizeStageName(entry.stageName)}</strong>
                <small>{localizeRoleLabel(entry.owner)}</small>
              </div>
              <span className={`risk-dot ${entry.riskLevel || 'medium'}`}>
                {shortRiskLevelLabel(entry.riskLevel)}
              </span>
              <p>{localizeWorkflowText(entry.potentialRisks?.[0]?.title || '暂无明确风险')}</p>
              <p>{localizeWorkflowText(entry.functionalGaps?.[0]?.title || '暂无功能不足')}</p>
            </div>
          ))}
        </div>
      </details>
    </div>
  );
}

function RiskPriorityPreview({
  activeStageId = '',
  entries = [],
  projectRisks = [],
  stageGapCount = 0,
  stageRiskCount = 0,
}) {
  const currentEntry = entries.find((entry) => entry.stageId === activeStageId);
  const priorityEntry = currentEntry || entries.find((entry) => entry.riskLevel === 'high') || entries[0];
  const primaryRisk =
    projectRisks[0] ||
    priorityEntry?.potentialRisks?.[0]?.title ||
    priorityEntry?.functionalGaps?.[0]?.title ||
    '暂无需要立即处理的风险。';
  const primaryAction =
    priorityEntry?.recommendedActions?.[0] ||
    (projectRisks.length + stageRiskCount + stageGapCount
      ? '展开风险不足查看完整台账。'
      : '继续按当前阶段推进。');

  return (
    <section aria-label="风险优先摘要" className="risk-priority-preview">
      <div className="risk-priority-copy">
        <p className="eyebrow">风险优先摘要</p>
        <strong>风险优先摘要</strong>
        <span>完整台账默认收起，先保留数量和最高优先级提醒。</span>
      </div>
      <div className="risk-priority-metrics" aria-label="风险摘要指标">
        <span>{`项目风险 ${projectRisks.length}`}</span>
        <span>{`阶段风险 ${stageRiskCount}`}</span>
        <span>{`功能不足 ${stageGapCount}`}</span>
      </div>
      <div className="risk-priority-note">
        <strong>{localizeWorkflowText(primaryRisk)}</strong>
        <span>{localizeWorkflowText(primaryAction)}</span>
      </div>
    </section>
  );
}

function HistoryRecordPanel({ history = [] }) {
  const latest = history[0];
  const latestType = latest ? historyTypeLabel(latest.type) : '暂无流转记录';
  const latestNote = latest ? formatHistoryEventNote(latest) : '当前项目还没有阶段流转事件。';
  const latestActor = latest?.actor || '系统';

  return (
    <div className="history-record-panel">
      <h4>最近流转</h4>
      <section className="history-record-summary" aria-label="流转记录摘要">
        <div>
          <strong>{latestType}</strong>
          <span>{latest ? `${latestActor} · ${latestNote}` : latestNote}</span>
        </div>
        <div className="history-record-metrics">
          <span>{`记录 ${history.length}`}</span>
        </div>
      </section>
      <details className="history-record-detail-section" aria-label="流转记录明细">
        <summary>
          <span>
            <strong>流转记录明细</strong>
            <small>{`${history.length} 条记录 · 显示最近 ${Math.min(history.length, 6)} 条`}</small>
          </span>
        </summary>
        <div className="history-list">
          {history.length === 0 ? <p className="muted">暂无流转记录。</p> : null}
          {history.slice(0, 6).map((event) => (
            <div className="history-item" key={`${event.at}-${event.type}-${event.to}`}>
              <strong>{historyTypeLabel(event.type)}</strong>
              <span>{event.actor}</span>
              <small>{formatHistoryEventNote(event)}</small>
              {event.valueSummary ? <small>{`确认值：${event.valueSummary}`}</small> : null}
            </div>
          ))}
        </div>
      </details>
    </div>
  );
}

function StageExecutionControlPanel({
  actionNote,
  advanceDisabled,
  advanceLabel,
  archiveVersion,
  busy,
  deliveryGateAudit,
  deliveryFlowRehearsal,
  gateHints = [],
  isAcceptanceSignedOff,
  onActionNoteChange,
  onArchiveVersionChange,
  onQueueAutomationJob,
  onRunStageAction,
  onUpdatePlatformJob,
  rejectPermission,
  report,
  projectExecutionAudit,
  projectAutomationPlan,
  responsibilityMatrix,
  showArchiveVersion,
  yoloDeliveryChain,
  yoloProjectId,
}) {
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const blockerCount = Number(report?.blockerCount || 0);
  const statusLabel = advanceDisabled ? '存在阻塞' : '可执行';
  const primaryHint = gateHints[0] || (advanceDisabled ? '当前阶段存在推进限制。' : '当前阶段可执行主动作。');

  return (
    <section
      className={`stage-execution-panel ${advanceDisabled ? 'blocked' : 'ready'}`}
      aria-label="阶段执行区"
    >
      <div className="stage-execution-primary">
        <div>
          <small>阶段动作</small>
          <strong>{advanceLabel}</strong>
          <span>{primaryHint}</span>
        </div>
        <button
          type="button"
          onClick={() => onRunStageAction('advance')}
          disabled={advanceDisabled}
        >
          {advanceLabel}
        </button>
      </div>
      <details
        className="stage-execution-detail-section"
        aria-label="阶段执行确认区"
        open={isDetailOpen}
      >
        <summary
          onClick={(event) => {
            event.preventDefault();
            setIsDetailOpen((isOpen) => !isOpen);
          }}
        >
          <span>
            <strong>执行确认</strong>
            <small>{`${statusLabel} · ${gateHints.length} 条提示 · ${blockerCount} 个阻塞`}</small>
          </span>
        </summary>
        {isDetailOpen ? (
          <div className="stage-execution-detail-body">
            <label className="action-note">
              处理意见
              <textarea
                value={actionNote}
                onChange={(event) => onActionNoteChange(event.target.value)}
                placeholder="记录审批意见、退回原因或阶段结论"
                rows="3"
              />
            </label>
            <StageGateReportPanel report={report} />
            <YoloDeliveryChainPanel chain={yoloDeliveryChain} />
            {yoloDeliveryChain?.isYoloProject ? (
              <YoloProjectRuntimePanel compact projectId={yoloProjectId} />
            ) : null}
            <DeliveryGateAuditPanel audit={deliveryGateAudit} />
            <DeliveryFlowRehearsalPanel rehearsal={deliveryFlowRehearsal} />
            <ResponsibilityMatrixPanel matrix={responsibilityMatrix} />
            <ProjectAutomationPlanPanel
              busy={busy}
              onQueueJob={onQueueAutomationJob}
              plan={projectAutomationPlan}
            />
            <ProjectExecutionAuditPanel
              audit={projectExecutionAudit}
              busy={busy}
              onUpdatePlatformJob={onUpdatePlatformJob}
            />
            {gateHints.map((hint) => (
              <p className="gate-hint" key={hint}>
                {hint}
              </p>
            ))}
            {showArchiveVersion ? (
              <label className="action-note acceptance-archive-version">
                归档版本
                <input
                  value={archiveVersion}
                  onChange={(event) => onArchiveVersionChange(event.target.value)}
                  placeholder="例如：v2026.06-yolo-acceptance"
                  disabled={isAcceptanceSignedOff}
                />
              </label>
            ) : null}
            <div className="action-row compact">
              <button
                className="secondary"
                type="button"
                onClick={() => onRunStageAction('reject')}
                disabled={busy || !rejectPermission?.allowed}
              >
                驳回当前阶段
              </button>
            </div>
          </div>
        ) : null}
      </details>
    </section>
  );
}

function StageGateReportPanel({ report }) {
  if (!report) {
    return null;
  }

  const blockers = report.blockers || [];
  const requiredActions = report.requiredActions?.length
    ? report.requiredActions
    : blockers.map((blocker) => blocker.requiredAction).filter(Boolean);

  return (
    <div className={`stage-gate-panel ${report.status}`} aria-label="阶段闸口报告">
      <div className="stage-gate-header">
        <div>
          <p className="eyebrow">阶段闸口</p>
          <strong>{localizeStageName(report.stageName) || '当前阶段'}</strong>
          {report.nextStageName ? <small>{`下一阶段：${localizeStageName(report.nextStageName)}`}</small> : null}
        </div>
        <strong aria-label="阶段闸口状态">{stageGateStatusLabel(report.status)}</strong>
      </div>
      <div className="stage-gate-metrics">
        <span>
          <small>待办数</small>
          <b aria-label="阶段闸口待办数">{report.openTaskCount || 0}</b>
        </span>
        <span>
          <small>阻塞项</small>
          <b aria-label="阶段闸口阻塞项">{report.blockerCount || 0}</b>
        </span>
      </div>
      <div className={`stage-gate-priority-note ${blockers.length ? 'blocked' : 'ready'}`}>
        <strong>{localizeWorkflowText(blockers[0]?.title || '暂无阻塞闸口事项。')}</strong>
        <span>
          {blockers.length
            ? '完整阻塞项和必需动作默认收起，先确认能否进入下一阶段。'
            : '当前闸口没有阻塞，继续按阶段动作推进。'}
        </span>
      </div>
      <details className="stage-gate-detail-section" aria-label="阶段闸口详情">
        <summary>
          <span>
            <strong>阶段闸口详情</strong>
            <small>{`${blockers.length} 个阻塞项 · ${requiredActions.length} 条必需动作`}</small>
          </span>
        </summary>
        <div className="stage-gate-detail-body">
          {blockers.length ? (
            <div className="stage-gate-blockers">
              {blockers.map((blocker) => (
                <article key={blocker.id || blocker.title}>
                  <strong>{localizeWorkflowText(blocker.title)}</strong>
                  {blocker.detail ? <small>{localizeWorkflowText(blocker.detail)}</small> : null}
                </article>
              ))}
            </div>
          ) : (
            <p className="stage-gate-ready">暂无阻塞闸口事项。</p>
          )}
          {requiredActions.length ? (
            <ul className="stage-gate-actions">
              {requiredActions.map((action) => (
                <li key={action}>{localizeWorkflowText(action)}</li>
              ))}
            </ul>
          ) : null}
        </div>
      </details>
    </div>
  );
}

function YoloDeliveryChainPanel({ chain }) {
  if (!chain?.isYoloProject) {
    return null;
  }

  const modules = Array.isArray(chain.modules) ? chain.modules : [];

  return (
    <div className={`yolo-delivery-chain ${chain.status || 'in-progress'}`} aria-label="YOLO 项目主链路">
      <div className="yolo-delivery-chain-header">
        <div>
          <p className="eyebrow">YOLO 主链路</p>
          <strong>需求到开发、测试与验收闭环</strong>
          <small>{chain.currentModuleLabel ? `当前模块：${chain.currentModuleLabel}` : '按主链路推进项目'}</small>
        </div>
        <strong>{yoloChainStatusLabel(chain.status)}</strong>
      </div>
      <div className="yolo-delivery-chain-modules">
        {modules.map((module) => (
          <article className={`yolo-delivery-chain-module ${module.status || 'blocked'} ${module.severity || ''}`} key={module.id}>
            <div className="yolo-delivery-chain-module-title">
              <strong>{module.label || module.id}</strong>
              <span>{yoloModuleStatusLabel(module.status)}</span>
            </div>
            <small>{localizeWorkflowText(module.nextAction || '等待补齐链路证据。')}</small>
            {module.evidence?.length ? (
              <div className="yolo-delivery-chain-tags" aria-label={`${module.label || module.id}证据`}>
                {module.evidence.slice(0, 3).map((item) => (
                  <span key={item}>{localizeWorkflowText(item)}</span>
                ))}
              </div>
            ) : null}
            {module.missingItems?.length ? (
              <ul className="yolo-delivery-chain-missing">
                {module.missingItems.slice(0, 3).map((item) => (
                  <li key={item.id || item.label}>{localizeWorkflowText(item.label || item)}</li>
                ))}
              </ul>
            ) : null}
          </article>
        ))}
      </div>
      {chain.nextAction ? (
        <div className="yolo-delivery-chain-next">
          <strong>下一步</strong>
          <span>{localizeWorkflowText(chain.nextAction)}</span>
        </div>
      ) : null}
    </div>
  );
}

function yoloChainStatusLabel(status) {
  if (status === 'complete') {
    return '主链路完成';
  }
  if (status === 'blocked') {
    return '存在阻塞';
  }
  return '推进中';
}

function yoloModuleStatusLabel(status) {
  if (status === 'complete') {
    return '完成';
  }
  if (status === 'ready') {
    return '可执行';
  }
  if (status === 'in-progress') {
    return '执行中';
  }
  return '阻塞';
}

function DeliveryGateAuditPanel({ audit }) {
  if (!audit) {
    return null;
  }

  const gates = Array.isArray(audit.gates) ? audit.gates : [];
  const roleHandoffs = Array.isArray(audit.roleHandoffs) ? audit.roleHandoffs : [];
  const roleSummary = audit.roleHandoffSummary || {};
  const currentRoleLabel = localizeRoleLabel(
    roleSummary.currentRoleLabel ||
      roleHandoffs.find((handoff) => handoff.role === roleSummary.currentRole)?.roleLabel ||
      roleSummary.currentRole ||
      '待确认',
  );
  const currentGateLabel = localizeWorkflowText(
    localizeStageName(audit.currentGateLabel) || audit.currentGateLabel || '待确认',
  );

  return (
    <div className={`delivery-gate-audit ${audit.status}`} aria-label="交付闸口审计">
      <div className="delivery-gate-audit-header">
        <div>
          <p className="eyebrow">全链路审计</p>
          <strong>交付闸口审计</strong>
          <small>{`已完成 ${audit.completedGateCount || 0}/${audit.totalGateCount || 0}`}</small>
        </div>
        <strong aria-label="交付闸口完成度">{`${audit.completionPercent || 0}%`}</strong>
      </div>
      <div className="delivery-gate-audit-metrics">
        <span>
          <small>当前门禁</small>
          <b aria-label="当前交付闸口">{currentGateLabel}</b>
        </span>
        <span>
          <small>当前角色</small>
          <b aria-label="当前交接角色">{currentRoleLabel}</b>
        </span>
        <span>
          <small>阻塞</small>
          <b>{audit.blockedGateCount || 0}</b>
        </span>
        <span>
          <small>缺失</small>
          <b>{audit.missingGateCount || 0}</b>
        </span>
      </div>
      <div className={`delivery-gate-audit-note ${audit.blockedGateCount ? 'blocked' : 'ready'}`}>
        <strong>{deliveryAuditStatusLabel(audit.status)}</strong>
        <span>{localizeWorkflowText(audit.nextAction || '继续推进当前交付闸口。')}</span>
      </div>
      {roleHandoffs.length ? (
        <details className="delivery-gate-audit-detail-section" aria-label="角色交接清单">
          <summary>
            <span>
              <strong>角色交接清单</strong>
              <small>{`${roleHandoffs.length} 个角色 · ${roleSummary.blockedRoleCount || 0} 个阻塞`}</small>
            </span>
          </summary>
          <div className="delivery-gate-audit-list role-handoff-list">
            {roleHandoffs.map((handoff) => (
              <article className={`delivery-gate-audit-item ${handoff.status}`} key={handoff.role}>
                <div>
                  <strong>{localizeRoleLabel(handoff.roleLabel || handoff.role)}</strong>
                  <small>{localizeWorkflowText(handoff.nextAction || '')}</small>
                </div>
                <span>{deliveryRoleHandoffStatusLabel(handoff.status)}</span>
              </article>
            ))}
          </div>
        </details>
      ) : null}
      <details className="delivery-gate-audit-detail-section" aria-label="交付闸口明细">
        <summary>
          <span>
            <strong>交付闸口明细</strong>
            <small>{`${gates.length} 个门禁 · 默认收起`}</small>
          </span>
        </summary>
        <div className="delivery-gate-audit-list">
          {gates.map((gate) => (
            <article className={`delivery-gate-audit-item ${gate.status}`} key={gate.id}>
              <div>
                <strong>{localizeWorkflowText(localizeStageName(gate.label) || gate.label)}</strong>
                {gate.evidence ? <small>{localizeWorkflowText(gate.evidence)}</small> : null}
              </div>
              <span>{deliveryGateStatusLabel(gate.status)}</span>
            </article>
          ))}
        </div>
      </details>
    </div>
  );
}

function DeliveryFlowRehearsalPanel({ rehearsal }) {
  if (!rehearsal) {
    return null;
  }

  const phases = Array.isArray(rehearsal.phases) ? rehearsal.phases : [];
  const currentPhaseLabel = localizeWorkflowText(rehearsal.currentPhaseLabel || '待确认');

  return (
    <div className={`delivery-flow-rehearsal ${rehearsal.status || 'in-progress'}`} aria-label="完整链路演练">
      <div className="delivery-flow-rehearsal-header">
        <div>
          <p className="eyebrow">流程演练</p>
          <strong>完整链路演练</strong>
          <small>{rehearsal.statusLabel || deliveryFlowRehearsalStatusLabel(rehearsal.status)}</small>
        </div>
        <strong aria-label="链路演练完成度">{`${rehearsal.completedPhaseCount || 0}/${rehearsal.totalPhaseCount || phases.length}`}</strong>
      </div>
      <div className="delivery-flow-rehearsal-metrics">
        <span>
          <small>当前环节</small>
          <b aria-label="当前链路环节">{currentPhaseLabel}</b>
        </span>
        <span>
          <small>阻塞</small>
          <b>{rehearsal.blockedPhaseCount || 0}</b>
        </span>
        <span>
          <small>缺失</small>
          <b>{rehearsal.missingPhaseCount || 0}</b>
        </span>
      </div>
      <div className={`delivery-flow-rehearsal-note ${rehearsal.canDemoEndToEnd ? 'ready' : 'blocked'}`}>
        <strong>{rehearsal.canDemoEndToEnd ? '可完整验证' : '需要补齐链路'}</strong>
        <span>{localizeWorkflowText(rehearsal.nextAction || '继续补齐完整链路证据。')}</span>
      </div>
      <details className="delivery-flow-rehearsal-detail-section" aria-label="链路演练阶段明细">
        <summary>
          <span>
            <strong>链路演练阶段明细</strong>
            <small>{`${phases.length} 个环节 · 默认收起`}</small>
          </span>
        </summary>
        <div className="delivery-flow-rehearsal-list">
          {phases.map((phase) => (
            <article className={`delivery-flow-rehearsal-item ${phase.status || 'missing'}`} key={phase.id}>
              <div>
                <strong>{localizeWorkflowText(phase.label || phase.id)}</strong>
                <small>{localizeWorkflowText(phase.evidence || phase.nextAction || '')}</small>
              </div>
              <span>{deliveryFlowPhaseStatusLabel(phase.status)}</span>
            </article>
          ))}
        </div>
      </details>
    </div>
  );
}

function deliveryAuditStatusLabel(status) {
  if (status === 'signed-off') {
    return '已签收';
  }
  if (status === 'ready-for-signoff') {
    return '待签收';
  }
  if (status === 'qa-return') {
    return '测试回流';
  }
  if (status === 'blocked') {
    return '存在阻塞';
  }
  return '推进中';
}

function deliveryGateStatusLabel(status) {
  if (status === 'complete') {
    return '完成';
  }
  if (status === 'blocked') {
    return '阻塞';
  }
  return '缺失';
}

function deliveryRoleHandoffStatusLabel(status) {
  if (status === 'complete') {
    return '已交接';
  }
  if (status === 'blocked') {
    return '需处理';
  }
  return '待补齐';
}

function deliveryFlowRehearsalStatusLabel(status) {
  if (status === 'signed-off') {
    return '已完成验收';
  }
  if (status === 'ready-for-signoff') {
    return '待负责人签收';
  }
  if (status === 'qa-return') {
    return '测试回流';
  }
  if (status === 'blocked') {
    return '链路阻塞';
  }
  return '推进中';
}

function deliveryFlowPhaseStatusLabel(status) {
  if (status === 'complete') {
    return '完成';
  }
  if (status === 'active') {
    return '进行中';
  }
  if (status === 'blocked') {
    return '阻塞';
  }
  return '缺失';
}

function ResponsibilityMatrixPanel({ matrix }) {
  if (!matrix) {
    return null;
  }

  const rows = Array.isArray(matrix.rows) ? matrix.rows : [];
  const currentRoleLabel = localizeRoleLabel(matrix.currentRoleLabel || matrix.currentRole || '未分配');
  const currentAssigneeName = localizeWorkflowText(matrix.currentAssigneeName || '未分配');

  return (
    <div className={`responsibility-matrix-panel ${matrix.status}`} aria-label="项目责任矩阵">
      <div className="responsibility-matrix-header">
        <div>
          <p className="eyebrow">角色责任</p>
          <strong>项目责任矩阵</strong>
          <small>{`${matrix.completedStageCount || 0}/${matrix.totalStageCount || 0} 阶段已完成`}</small>
        </div>
        <strong>{responsibilityMatrixStatusLabel(matrix.status)}</strong>
      </div>
      <div className="responsibility-matrix-metrics">
        <span>
          <small>当前角色</small>
          <b aria-label="当前责任角色">{currentRoleLabel}</b>
        </span>
        <span>
          <small>处理人</small>
          <b aria-label="当前处理人">{currentAssigneeName}</b>
        </span>
        <span>
          <small>待办 / 阻塞</small>
          <b>{`${matrix.currentOpenTaskCount || 0} / ${matrix.currentBlockerCount || 0}`}</b>
        </span>
      </div>
      <div className={`responsibility-matrix-note ${matrix.currentBlockerCount ? 'blocked' : 'ready'}`}>
        <strong>{localizeWorkflowText(matrix.currentStageName || '当前阶段')}</strong>
        <span>{localizeWorkflowText(matrix.nextAction || '继续推进当前阶段责任事项。')}</span>
      </div>
      <details className="responsibility-matrix-detail-section" aria-label="责任矩阵明细">
        <summary>
          <span>
            <strong>责任矩阵明细</strong>
            <small>{`${rows.length} 个阶段 · 默认收起`}</small>
          </span>
        </summary>
        <div className="responsibility-matrix-list">
          {rows.map((row) => (
            <article className={`responsibility-matrix-row ${row.status}`} key={row.stageId}>
              <div>
                <strong>{localizeWorkflowText(row.stageName || row.stageId)}</strong>
                <small>{`${localizeRoleLabel(row.roleLabel || row.role)} · ${localizeWorkflowText(
                  row.assigneeName || '未分配',
                )}`}</small>
              </div>
              <span>{responsibilityRowStatusLabel(row.status)}</span>
            </article>
          ))}
        </div>
      </details>
    </div>
  );
}

function responsibilityMatrixStatusLabel(status) {
  if (status === 'blocked') {
    return '存在阻塞';
  }
  if (status === 'active') {
    return '处理中';
  }
  if (status === 'complete') {
    return '已完成';
  }
  return '待开始';
}

function responsibilityRowStatusLabel(status) {
  if (status === 'complete') {
    return '完成';
  }
  if (status === 'blocked') {
    return '阻塞';
  }
  if (status === 'active') {
    return '处理中';
  }
  return '队列中';
}

function ProjectAutomationPlanPanel({ busy, onQueueJob, plan }) {
  if (!plan) {
    return null;
  }

  const job = plan.recommendedJob || null;
  const existingJob = plan.existingJob || null;
  const sandboxPolicy = job?.details?.sandboxPolicy || '';

  return (
    <div className={`project-automation-plan-panel ${plan.status}`} aria-label="自动化任务建议">
      <div className="project-automation-plan-header">
        <div>
          <p className="eyebrow">后台任务建议</p>
          <strong>自动化任务建议</strong>
          <small>{automationPlanPriorityLabel(plan.priority)}</small>
        </div>
        <strong>{automationPlanStatusLabel(plan.status)}</strong>
      </div>
      <div className={`project-automation-plan-note ${plan.status === 'blocked' ? 'blocked' : 'ready'}`}>
        <strong>{localizeWorkflowText(job?.title || existingJob?.title || '暂无推荐任务')}</strong>
        <span>{localizeWorkflowText(plan.nextAction || '继续观察当前阶段自动化任务状态。')}</span>
      </div>
      {plan.queueBlockedReason ? (
        <p className="project-automation-plan-blocker">{localizeWorkflowText(plan.queueBlockedReason)}</p>
      ) : null}
      {job ? (
        <div className="project-automation-plan-job">
          <span>{`类型：${localizeWorkflowText(job.type || '后台任务')}`}</span>
          {job.command ? <span>{`命令：${job.command}`}</span> : null}
          {sandboxPolicy ? <span>{`沙箱策略：${sandboxPolicy}`}</span> : null}
        </div>
      ) : null}
      {existingJob ? (
        <div className="project-automation-plan-job">
          <span>{`已有任务：${localizeWorkflowText(existingJob.title || existingJob.id)}`}</span>
          <span>{`状态：${jobStatusLabel(existingJob.status)}`}</span>
        </div>
      ) : null}
      {job ? (
        <button
          className="project-automation-plan-action"
          type="button"
          onClick={() => onQueueJob?.(job)}
          disabled={busy}
        >
          排队建议任务
        </button>
      ) : null}
    </div>
  );
}

function automationPlanStatusLabel(status) {
  if (status === 'ready-to-queue') {
    return '可排队';
  }
  if (status === 'waiting-existing-job') {
    return '等待中';
  }
  if (status === 'blocked') {
    return '需补配置';
  }
  return '暂无建议';
}

function automationPlanPriorityLabel(priority) {
  if (priority === 'high') {
    return '高优先级';
  }
  if (priority === 'low') {
    return '低优先级';
  }
  return '普通优先级';
}

function ProjectExecutionAuditPanel({ audit, busy = false, onUpdatePlatformJob }) {
  if (!audit) {
    return null;
  }

  const rows = Array.isArray(audit.rows) ? audit.rows : [];
  const remediationActions = Array.isArray(audit.remediation?.actions) ? audit.remediation.actions : [];
  const executionTimeline = audit.executionTimeline || {};
  const latest = audit.latestAction || rows[0] || null;
  const latestTitle = latest ? localizeWorkflowText(latest.title || latest.id) : '暂无执行记录';
  const nextAction = localizeWorkflowText(audit.nextAction || '继续沉淀自动执行审计记录。');

  return (
    <div className={`project-execution-audit-panel ${audit.status}`} aria-label="项目执行审计">
      <div className="project-execution-audit-header">
        <div>
          <p className="eyebrow">执行审计</p>
          <strong>项目执行审计</strong>
          <small>{`${audit.platformJobCount || 0} 个后台任务 · ${audit.workflowExecutionCount || 0} 条流程执行`}</small>
        </div>
        <strong>{executionAuditStatusLabel(audit.status)}</strong>
      </div>
      <div className="project-execution-audit-metrics">
        <span>
          <small>记录数</small>
          <b aria-label="执行审计总数">{audit.totalExecutionCount || 0}</b>
        </span>
        <span>
          <small>失败 / 运行</small>
          <b>{`${audit.failedCount || 0} / ${audit.runningCount || 0}`}</b>
        </span>
        <span>
          <small>证据缺口</small>
          <b aria-label="执行证据缺口">{audit.evidenceGapCount || 0}</b>
        </span>
        <span>
          <small>沙箱策略</small>
          <b>{audit.sandboxPolicyCount || 0}</b>
        </span>
      </div>
      <div className={`project-execution-audit-note ${audit.status === 'blocked' ? 'blocked' : 'ready'}`}>
        <strong>{latestTitle}</strong>
        <span>{nextAction}</span>
      </div>
      {remediationActions.length ? (
        <div className="project-execution-remediation" aria-label="执行处置建议">
          <div className="project-execution-remediation-header">
            <strong>执行处置建议</strong>
            <small>
              {`重试 ${audit.remediation.retryCount || 0} · 回收 ${audit.remediation.reclaimCount || 0} · 补证 ${
                audit.remediation.evidenceCount || 0
              }`}
            </small>
          </div>
          <div className="project-execution-remediation-list">
            {remediationActions.slice(0, 4).map((action) => {
              const platformAction = remediationPlatformAction(action.action);
              return (
                <article className={`project-execution-remediation-item ${action.severity || 'normal'}`} key={action.id}>
                  <div>
                    <strong>{`${action.label} · ${localizeWorkflowText(action.title || action.rowId || '')}`}</strong>
                    <small>{localizeWorkflowText(action.reason || action.nextAction || '')}</small>
                  </div>
                  {platformAction && action.jobId ? (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        onUpdatePlatformJob?.(
                          { id: action.jobId, projectId: audit.projectId, title: action.title },
                          platformAction,
                        )
                      }
                    >
                      {action.label}
                    </button>
                  ) : (
                    <span>{action.label}</span>
                  )}
                </article>
              );
            })}
          </div>
        </div>
      ) : null}
      <ProjectExecutionTimelinePanel timeline={executionTimeline} />
      <details className="project-execution-audit-detail-section" aria-label="执行审计明细">
        <summary>
          <span>
            <strong>执行审计明细</strong>
            <small>{`${rows.length} 条记录 · 默认收起`}</small>
          </span>
        </summary>
        <div className="project-execution-audit-list">
          {rows.length ? (
            rows.map((row) => (
              <article className={`project-execution-audit-row ${row.status}`} key={row.id || row.type}>
                <div>
                  <strong>{localizeWorkflowText(row.title || row.id)}</strong>
                  <small>
                    {[
                      executionAuditSourceLabel(row.source),
                      executionAuditExecutorLabel(row.executor),
                      row.command ? `命令：${row.command}` : '',
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </small>
                  {row.missingEvidence?.length ? (
                    <small>{`证据缺口：${row.missingEvidence.join('、')}`}</small>
                  ) : null}
                </div>
                <span>{executionRowStatusLabel(row.status)}</span>
              </article>
            ))
          ) : (
            <p className="project-execution-audit-empty">暂无执行审计记录。</p>
          )}
        </div>
      </details>
    </div>
  );
}

function ProjectExecutionTimelinePanel({ timeline = {} }) {
  const rows = Array.isArray(timeline.rows) ? timeline.rows : [];
  if (!rows.length) {
    return null;
  }

  const latestRun = timeline.latestRun || rows[0];
  const latestLifecycle = Array.isArray(latestRun.lifecycle) ? latestRun.lifecycle : [];

  return (
    <div className="project-execution-timeline" aria-label="执行器时间线">
      <div className="project-execution-timeline-header">
        <strong>执行器时间线</strong>
        <small>{`${timeline.totalRunCount || rows.length} 次运行 · ${timeline.totalEventCount || 0} 个事件`}</small>
      </div>
      <div className="project-execution-timeline-latest">
        <strong>
          {`${localizeWorkflowText(latestRun.title || latestRun.jobId || '后台任务')} · ${
            latestRun.workerId || '未分配执行器'
          } · ${executionRowStatusLabel(latestRun.status)}`}
        </strong>
        <small>
          {`${latestRun.startedAt || '未记录开始'} → ${latestRun.finishedAt || latestRun.latestEventAt || '运行中'} · ${formatDurationMs(
            latestRun.durationMs || 0,
          )}`}
        </small>
      </div>
      <details className="project-execution-timeline-detail" aria-label="运行事件明细">
        <summary>
          <span>
            <strong>运行事件明细</strong>
            <small>{`${latestLifecycle.length} 个事件 · 默认收起`}</small>
          </span>
        </summary>
        <div className="project-execution-timeline-events">
          {latestLifecycle.map((event) => (
            <article key={event.eventId || `${event.type}-${event.createdAt}`}>
              <strong>{`${localizeWorkflowText(event.type || '后台任务事件')} · ${event.createdAt || '时间未记录'}`}</strong>
              <small>{`${event.workerId || '未分配执行器'} · ${executionRowStatusLabel(event.jobStatus)}`}</small>
            </article>
          ))}
        </div>
      </details>
    </div>
  );
}

function executionAuditStatusLabel(status) {
  if (status === 'blocked') {
    return '存在阻塞';
  }
  if (status === 'running') {
    return '运行中';
  }
  if (status === 'evidence-gap') {
    return '证据缺口';
  }
  if (status === 'queued') {
    return '排队中';
  }
  if (status === 'auditable') {
    return '可追溯';
  }
  return '待执行';
}

function executionRowStatusLabel(status) {
  if (status === 'succeeded') {
    return '成功';
  }
  if (status === 'failed' || status === 'exhausted') {
    return '失败';
  }
  if (status === 'running') {
    return '运行中';
  }
  if (status === 'cancelled') {
    return '已取消';
  }
  return '排队中';
}

function remediationPlatformAction(action) {
  if (action === 'retry') {
    return 'retry';
  }
  if (action === 'start') {
    return 'start';
  }
  if (action === 'reclaim') {
    return 'reclaim';
  }
  return '';
}

function executionAuditSourceLabel(source) {
  if (source === 'platform-job') {
    return '后台任务';
  }
  if (source === 'workflow') {
    return '流程执行';
  }
  return localizeWorkflowText(source || '执行记录');
}

function executionAuditExecutorLabel(executor) {
  const labels = {
    'codex-local': '本地执行器',
    qa: '测试角色',
    'tech-lead': '技术评审',
    'ai-dev': '自动开发',
    'pm': '项目经理',
  };

  return labels[executor] || localizeWorkflowText(executor || '未分配执行器');
}

function StageIssueList({ title, items = [] }) {
  return (
    <div className="stage-issue-list">
      <strong>{localizeWorkflowText(title)}</strong>
      <ul>
        {items.length === 0 ? <li>暂无。</li> : null}
        {items.map((item) => (
          <li key={`${item.title}-${item.detail || ''}`}>
            {localizeWorkflowText(item.title)}
            {item.detail ? `：${localizeWorkflowText(item.detail)}` : ''}
          </li>
        ))}
      </ul>
    </div>
  );
}

function TechnicalHandoffPanel({ focusedTask, project }) {
  const isGenerated = project.technicalHandoffStatus === 'generated';
  const isFocused = Boolean(focusedTask);
  const handoffItems = [
    { label: '架构', detail: '系统方案、接口、模块边界' },
    { label: '开发', detail: '前后端与推理服务任务' },
    { label: '运维', detail: 'RTSP、运行环境、日志监控' },
    { label: '测试', detail: '场景用例、误检率统计口径' },
  ];
  const handoffArtifactKeys = ['architecture', 'development', 'ops-requirements', 'qa'];
  const artifactCount = handoffArtifactKeys.filter((key) => String(project.artifacts?.[key] || '').trim()).length;
  const providerName = project.technicalHandoffProvider
    ? providerLabel(project.technicalHandoffProvider)
    : '待生成';
  const nextAction = isGenerated
    ? '继续确认后续开发、运维和测试交接项。'
    : '需求文档审批通过后生成技术交接包。';

  return (
    <div
      aria-label="运维交接面板"
      className={`handoff-panel ${isGenerated ? 'generated' : 'draft'} ${isFocused ? 'focused' : ''}`}
    >
      <section className="handoff-readiness-preview" aria-label="技术交接摘要">
        {isFocused ? (
          <div className="handoff-focus-summary">
            <span className="focused-task-chip">当前运维任务</span>
            <strong>{localizeWorkflowText(focusedTask.title)}</strong>
            <small>{`${focusedTask.projectName || project.name} · ${
              localizeStageName(focusedTask.stageName || 'Ops requirements')
            }`}</small>
          </div>
        ) : null}
        <div className="handoff-readiness-copy">
          <p className="eyebrow">技术交接摘要</p>
          <strong>{isGenerated ? '技术交接包已生成' : '等待生成技术交接包'}</strong>
          {project.technicalHandoffProvider ? (
            <ProviderBadge provider={project.technicalHandoffProvider} />
          ) : null}
          <p>需求文档审批通过后，系统会把方案、开发任务、运维需求和测试计划分发到后续阶段。</p>
          {project.technicalHandoffProviderError ? (
            <small>降级说明：{project.technicalHandoffProviderError}</small>
          ) : null}
        </div>
        <div className="handoff-readiness-metrics" aria-label="技术交接摘要指标">
          <span>{`产物 ${artifactCount}`}</span>
          <span>{`分发 ${handoffItems.length}`}</span>
          <span>{isGenerated ? '已生成' : '待生成'}</span>
          <span>{`来源 ${providerName}`}</span>
        </div>
        <div className={`handoff-readiness-note ${isGenerated ? 'ready' : 'warning'}`}>
          <strong>{nextAction}</strong>
          <span>{isGenerated ? '完整分发明细默认收起，按需核验。' : '生成后会自动拆分到后续阶段。'}</span>
        </div>
      </section>
      {isFocused ? (
        <div className="stage-confirmation-focus-banner">来自个人工作台的聚焦任务</div>
      ) : null}
      <details className="handoff-detail-section" aria-label="技术交接分发详情">
        <summary>
          <span>
            <strong>技术交接分发详情</strong>
            <small>{`${handoffItems.length} 类分发 · ${artifactCount} 项产物`}</small>
          </span>
        </summary>
        <div className="handoff-grid">
          {handoffItems.map((item) => (
            <span key={item.label}>
              <strong>{item.label}</strong>
              <small>{item.detail}</small>
            </span>
          ))}
        </div>
      </details>
    </div>
  );
}

function ProjectMembersPanel({
  busy,
  canManage,
  drafts,
  onDraftChange,
  onSave,
  project,
  users,
}) {
  const rows = getProjectMemberRows(project, users);

  return (
    <form className="project-members-panel" onSubmit={onSave}>
      <div className="project-members-heading">
        <div>
          <h4>项目成员</h4>
          <p>每个项目独立指派负责人、项目经理、开发、运维和测试成员。</p>
        </div>
        <button type="submit" disabled={busy || !canManage}>
          保存项目成员
        </button>
      </div>
      <div className="project-members-grid">
        {rows.map((row) => {
          const candidates = users.filter((user) => user.role === row.role);
          const value = drafts[row.role] || row.userId || candidates[0]?.id || '';
          return (
            <label key={row.role}>
              {`项目成员-${row.roleLabel}`}
              <select
                value={value}
                onChange={(event) => onDraftChange(row.role, event.target.value)}
                disabled={busy || !canManage || candidates.length === 0}
              >
                {candidates.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.name}
                  </option>
                ))}
              </select>
            </label>
          );
        })}
      </div>
      {!canManage ? <p className="gate-hint">只有该项目负责人可以维护项目成员。</p> : null}
    </form>
  );
}

function StageConfirmationPanel({
  busy,
  drafts,
  entry,
  focusedItemId = '',
  onDraftChange,
  onSave,
  permission,
  project,
  users,
}) {
  const items = entry?.items || [];
  const missingTitles = (entry?.missingItems || []).map((item) => item.title).join('、');
  const followups =
    entry?.followups || createStageConfirmationFollowups(entry?.stageId, entry?.missingItems || []);
  const followupTasks = createStageConfirmationFollowupTasks(project, entry?.stageId, {
    includeResolved: true,
    users,
  });
  const completedCount = entry?.completedCount || 0;
  const totalCount = entry?.totalCount || items.length;
  const missingCount = entry?.missingItems?.length || 0;
  const openFollowupCount = followupTasks.filter((task) => task.status !== 'resolved').length;
  const focusState = focusedItemId ? '已定位' : '无';

  return (
    <div className={`stage-confirmation-panel ${entry?.status || 'incomplete'}`}>
      <div className="stage-confirmation-heading">
        <div>
          <h4>阶段确认事项</h4>
          <p>
            已确认 {entry?.completedCount || 0}/{entry?.totalCount || items.length} 项。
            {missingTitles ? ` 缺口：${missingTitles}` : ' 当前阶段确认事项已补齐。'}
          </p>
        </div>
        <span className={`confirmation-status ${entry?.status || 'incomplete'}`}>
          {entry?.status === 'ready' ? '已补齐' : '待补齐'}
        </span>
      </div>

      <div aria-label="阶段确认摘要" className="stage-confirmation-summary">
        <div aria-label={`确认进度 ${completedCount}/${totalCount}`}>
          <span>确认进度</span>
          <strong>{`${completedCount}/${totalCount}`}</strong>
        </div>
        <div aria-label={`缺项 ${missingCount}`} className={missingCount ? 'warning' : 'ready'}>
          <span>缺项</span>
          <strong>{missingCount}</strong>
        </div>
        <div aria-label={`待办 ${openFollowupCount}`} className={openFollowupCount ? 'warning' : 'ready'}>
          <span>待办</span>
          <strong>{openFollowupCount}</strong>
        </div>
        <div aria-label={`聚焦 ${focusState}`} className={focusedItemId ? 'focused' : ''}>
          <span>聚焦</span>
          <strong>{focusState}</strong>
        </div>
      </div>

      {focusedItemId ? (
        <div className="stage-confirmation-focus-banner">来自个人工作台的聚焦任务</div>
      ) : null}

      <details
        aria-label="确认事项填写明细"
        className="stage-confirmation-detail-section"
        {...(focusedItemId ? { open: true } : {})}
      >
        <summary>
          <span>
            <strong>确认事项填写明细</strong>
            <small>{`${items.length} 项确认 · ${followups.length} 个追问 · ${openFollowupCount} 个待办`}</small>
          </span>
        </summary>
        <div className="stage-confirmation-list">
          {items.map((item) => {
            const inputId = `stage-confirmation-${entry.stageId}-${item.id}`;
            const value = drafts[item.id] ?? item.value ?? '';
            const isFocused = focusedItemId === item.id;
            return (
              <div
                className={`stage-confirmation-item ${isFocused ? 'focused' : ''}`}
                data-stage-confirmation-item-id={item.id}
                key={item.id}
              >
                <div className="stage-confirmation-title">
                  <label htmlFor={inputId}>{`确认事项-${item.title}`}</label>
                  <span className={item.status === 'confirmed' ? 'confirmed' : 'missing'}>
                    {item.status === 'confirmed' ? '已确认' : '待补齐'}
                  </span>
                  {isFocused ? <span className="focused-task-chip">当前任务</span> : null}
                </div>
                <p>{item.description}</p>
                <textarea
                  id={inputId}
                  rows="3"
                  value={value}
                  onChange={(event) => onDraftChange(item.id, event.target.value)}
                  placeholder="填写确认结论、账号/环境/样本/口径等关键信息"
                  disabled={busy || !permission?.allowed}
                />
                {item.confirmedBy ? (
                  <small>
                    最近确认：{item.confirmedBy}
                    {item.confirmedAt ? ` · ${formatDateTime(item.confirmedAt)}` : ''}
                  </small>
                ) : null}
                <button
                  type="button"
                  className="secondary"
                  onClick={() => onSave(item)}
                  disabled={busy || !permission?.allowed}
                >
                  {`保存${item.title}`}
                </button>
              </div>
            );
          })}
        </div>

        {followups.length ? (
          <div className="stage-confirmation-followups">
            <strong>自动追问建议</strong>
            <div className="stage-confirmation-followup-list">
              {followups.map((followup) => (
                <div className="stage-confirmation-followup" key={followup.id}>
                  <span>追问对象：{followup.targetRoleLabel}</span>
                  <p>{followup.question}</p>
                  <small>{followup.expectedAnswer}</small>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {followupTasks.length ? (
          <div className="stage-followup-tasks">
            <div className="stage-followup-task-heading">
              <strong>缺项待办</strong>
              <small>补齐后保存对应确认事项，待办会自动关闭。</small>
            </div>
            <div className="stage-followup-task-list">
              {followupTasks.map((task) => (
                <article className={`stage-followup-task ${task.status}`} key={task.id}>
                  <div className="stage-followup-task-title">
                    <strong>{task.title}</strong>
                    <span>{`状态：${task.status === 'resolved' ? '已关闭' : '待处理'}`}</span>
                  </div>
                  <small>{`指派：${task.assigneeName}`}</small>
                  <p>{task.question}</p>
                  <em>{task.expectedAnswer}</em>
                  {task.status === 'resolved' ? (
                    <div className="stage-followup-resolution">
                      <small>{`处理人：${task.resolvedBy || task.assigneeName}`}</small>
                      {task.resolvedAt ? <small>{`处理时间：${formatDateTime(task.resolvedAt)}`}</small> : null}
                      {task.resolutionSummary ? (
                        <p>{`处理结果：${task.resolutionSummary}`}</p>
                      ) : null}
                    </div>
                  ) : null}
                </article>
              ))}
            </div>
          </div>
        ) : null}
      </details>

      {!permission?.allowed ? (
        <p className="gate-hint">{permission?.reason || '当前用户无权维护阶段确认事项。'}</p>
      ) : null}
    </div>
  );
}

function RequirementPanel({
  busy,
  drafts,
  onDraftChange,
  onGenerate,
  onReview,
  onSave,
  project,
}) {
  const [isActionDetailOpen, setIsActionDetailOpen] = useState(false);
  const questions = project.requirementQuestions || [];
  const answers = project.requirementAnswers || {};
  const answeredCount = questions.filter((question) => answers[question.id]).length;
  const skills = project.businessSkills || BUSINESS_SKILLS;
  const reviewSummary = requirementReviewSummary(project.requirementReview);
  const reviewMeta = requirementReviewMeta(project.requirementReview);

  return (
    <div className="requirement-panel">
      <section className="requirement-action-center" aria-label="需求处理中心">
        <div className="requirement-header">
          <div>
            <p className="eyebrow">需求处理中心</p>
            <h4>需求澄清</h4>
            <p>
              已完成 {answeredCount}/{questions.length} 项。先完成需求质检，再生成需求文档草稿。
            </p>
          </div>
          <button type="button" onClick={onReview} disabled={busy}>
            智能需求评审
          </button>
        </div>

        <div className="requirement-status-strip" aria-label="需求处理摘要">
          <span>{`填写 ${answeredCount}/${questions.length}`}</span>
          <span className={project.requirementReview?.status === 'ready' ? 'ready' : 'warning'}>
            {reviewSummary}
          </span>
          <span>{reviewMeta}</span>
          <span>{`业务 skill ${skills.length}`}</span>
        </div>

        <PrdVersionImpactPanel project={project} />

        <details
          className="requirement-action-detail-section"
          aria-label="需求操作详情"
          open={isActionDetailOpen}
        >
          <summary
            onClick={(event) => {
              event.preventDefault();
              setIsActionDetailOpen((isOpen) => !isOpen);
            }}
          >
            <span>
              <strong>需求操作详情</strong>
              <small>{`${reviewSummary} · ${answeredCount}/${questions.length} 项已填写`}</small>
            </span>
          </summary>
          {isActionDetailOpen ? (
            <div className="requirement-action-detail-body">
              <QualityReport review={project.requirementReview} />
              <div className="requirement-actions">
                <button type="button" onClick={onGenerate} disabled={busy || questions.length === 0}>
                  生成需求文档草稿
                </button>
              </div>
            </div>
          ) : null}
        </details>
      </section>

      <details className="requirement-detail-section" aria-label="需求填写详情">
        <summary>
          <span>
            <strong>需求填写详情</strong>
            <small>{`${answeredCount}/${questions.length} 项已填写 · ${skills.length} 个业务 skill`}</small>
          </span>
        </summary>
        <SkillStrip skills={skills} />
        <div className="requirement-list">
          {questions.map((question) => {
            const value = drafts[question.id] ?? answers[question.id] ?? '';
            return (
              <div className="requirement-item" key={question.id}>
                <label htmlFor={`requirement-${question.id}`}>
                  {question.label}
                  <textarea
                    id={`requirement-${question.id}`}
                    value={value}
                    onChange={(event) => onDraftChange(question.id, event.target.value)}
                    placeholder={question.placeholder}
                    rows="3"
                  />
                </label>
                <p>{question.prompt}</p>
                <button
                  className="secondary"
                  type="button"
                  onClick={() => onSave(question)}
                  disabled={busy || !String(value).trim()}
                >
                  保存{question.label}
                </button>
              </div>
            );
          })}
        </div>
      </details>
    </div>
  );
}

function PrdVersionImpactPanel({ project }) {
  const fallbackVersion =
    project.prdStatus === 'generated'
      ? {
          label: 'v1',
          status: 'current',
          generatedAt: project.prdGeneratedAt || '',
          generatedBy: '项目经理',
        }
      : null;
  const version = project.prdVersion || fallbackVersion;
  const impact =
    project.prdChangeImpact ||
    (fallbackVersion
      ? {
          status: 'current',
          versionLabel: fallbackVersion.label,
          summary: '当前 PRD 与需求答案一致。',
        }
      : null);
  const versionLabel = version?.label || impact?.versionLabel || '未生成';
  const isStale = version?.status === 'stale' || impact?.status === 'stale';
  const changedQuestions = impact?.changedQuestions || [];
  const requiredActions = impact?.requiredActions || [];

  if (!version && !impact) {
    return (
      <div className="prd-impact-panel pending" aria-label="PRD 版本与变更影响">
        <div>
          <strong>PRD 尚未生成</strong>
          <p>完成需求评审后生成需求文档草稿，系统会记录 PRD 版本和需求快照。</p>
        </div>
        <span>待生成</span>
      </div>
    );
  }

  return (
    <div className={`prd-impact-panel ${isStale ? 'stale' : 'current'}`} aria-label="PRD 版本与变更影响">
      <div className="prd-impact-summary">
        <div>
          <strong>{isStale ? `PRD ${versionLabel} 已过期` : `PRD ${versionLabel} 当前有效`}</strong>
          <p>{impact?.summary || (isStale ? '需求已变化，请重新评审并生成 PRD。' : '当前 PRD 与需求答案一致。')}</p>
          {version?.generatedAt || version?.generatedBy ? (
            <small>
              {[
                version?.generatedBy ? `生成：${version.generatedBy}` : '',
                version?.generatedAt ? formatDateTime(version.generatedAt) : '',
              ]
                .filter(Boolean)
                .join(' · ')}
            </small>
          ) : null}
        </div>
        <span>{isStale ? '需处理' : '有效'}</span>
      </div>

      {changedQuestions.length ? (
        <div className="prd-impact-changes" aria-label="PRD 变更字段">
          {changedQuestions.map((question) => (
            <article key={question.id}>
              <strong>{question.label || question.id}</strong>
              <p>{question.currentAnswer || '当前答案为空'}</p>
            </article>
          ))}
        </div>
      ) : null}

      {requiredActions.length ? (
        <div className="prd-impact-actions" aria-label="PRD 后续动作">
          {requiredActions.map((action) => (
            <span key={action}>{action}</span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function requirementReviewSummary(review) {
  if (!review) {
    return '质检待评审';
  }

  if (review.status === 'ready') {
    return '需求质检通过';
  }

  if (review.status === 'stale') {
    return '需求质检已过期';
  }

  return '需求质检待补充';
}

function requirementReviewMeta(review) {
  if (!review) {
    return '完整度待评估';
  }

  return `完整度 ${review.completedCount}/${review.totalCount}，评分 ${review.score ?? '-'}`;
}

function SkillStrip({ skills }) {
  const visibleSkills = skills.filter((skill) =>
    ['pm-requirements', 'prd-approval'].includes(skill.stageId),
  );

  return (
    <div className="skill-strip" aria-label="当前业务 skills">
      {visibleSkills.map((skill) => (
        <span className="skill-chip" key={skill.id} title={skill.description}>
          {skill.name}
          <small>{skill.owner}</small>
        </span>
      ))}
    </div>
  );
}

function QualityReport({ review }) {
  if (!review) {
    return (
      <details className="quality-panel pending" aria-label="需求质检状态">
        <summary>
          <strong>尚未运行智能需求评审</strong>
          <small>待评审</small>
        </summary>
        <div className="quality-detail-body">
          <p>保存需求后点击“智能需求评审”，系统会检查缺失项、阻塞项和验收风险。</p>
        </div>
      </details>
    );
  }

  const isReady = review.status === 'ready';
  const isStale = review.status === 'stale';
  const blockerCount = (review.blockers || []).length;
  const warningCount = (review.warnings || []).length;
  const recommendationCount = (review.recommendations || []).length;

  return (
    <div className={`quality-panel ${isReady ? 'ready' : 'needs-work'}`}>
      <div className="quality-summary">
        <div>
          <strong>{isReady ? '需求质检通过' : isStale ? '需求质检已过期' : '需求质检待补充'}</strong>
          <p>
            完整度 {review.completedCount}/{review.totalCount}，评分 {review.score ?? '-'}
          </p>
          {review.provider ? <small>来源：{providerLabel(review.provider)}</small> : null}
        </div>
        <span className={`quality-status ${review.status}`}>{qualityStatusLabel(review.status)}</span>
      </div>
      {isStale && review.staleReason ? <p className="gate-hint">{review.staleReason}</p> : null}
      <details className="quality-detail-section" aria-label="需求质检明细">
        <summary>
          <span>
            <strong>需求质检明细</strong>
            <small>{`阻塞 ${blockerCount} · 风险 ${warningCount} · 建议 ${recommendationCount}`}</small>
          </span>
        </summary>
        <div className="quality-detail-body">
          <IssueList title="阻塞项" items={review.blockers} emptyText="暂无阻塞项。" />
          <IssueList title="风险提醒" items={review.warnings} emptyText="暂无明显风险。" />
          <IssueList
            title="建议"
            items={(review.recommendations || []).map((item) => ({ title: item }))}
            emptyText="暂无额外建议。"
          />
        </div>
      </details>
    </div>
  );
}

function IssueList({ title, items = [], emptyText }) {
  return (
    <div className="issue-list">
      <strong>{title}</strong>
      <ul>
        {items.length === 0 ? <li>{emptyText}</li> : null}
        {items.map((item) => (
          <li key={typeof item === 'string' ? item : `${item.title}-${item.detail || ''}`}>
            {typeof item === 'string' ? item : item.title}
            {typeof item !== 'string' && item.detail ? `：${item.detail}` : ''}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Metric({ label, value }) {
  return (
    <div className="metric">
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

function PermissionAlert({ issue }) {
  const details = issue?.details || {};
  const user = details.user || {};
  const membership = details.membership || {};
  const rows = [
    details.actionId ? `操作：${details.actionId}` : '',
    user.id || user.name || user.role
      ? `当前账号：${user.name || user.id || 'unknown'} · ${user.role || details.role || 'unknown'}`
      : '',
    Array.isArray(details.allowedRoles) && details.allowedRoles.length
      ? `允许角色：${details.allowedRoles.join('、')}`
      : '',
    membership.assignedUserId ? `指派成员：${membership.assignedUserId}` : '',
  ].filter(Boolean);

  return (
    <section aria-label="权限提示" className="permission-alert">
      <div>
        <small>权限受限</small>
        <strong>权限不足</strong>
      </div>
      <p>{issue?.message || '当前账号无权执行该操作。'}</p>
      {rows.length ? (
        <div className="permission-alert-grid">
          {rows.map((row) => (
            <span key={row}>{row}</span>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function ProviderBadge({ provider }) {
  return <span className="provider-badge">{providerLabel(provider)}</span>;
}

function ArtifactSummaryPanel({ artifact }) {
  const summary = getArtifactSummary(artifact);

  return (
    <section aria-label="阶段产物摘要" className="artifact-summary">
      <div className="artifact-summary-copy">
        <p className="eyebrow">产物摘要</p>
        <strong>{`标题：${summary.title}`}</strong>
        <span>{summary.lead}</span>
      </div>
      <div aria-label="产物结构统计" className="artifact-summary-metrics">
        <span>{`章节 ${summary.headingCount}`}</span>
        <span>{`清单 ${summary.listItemCount}`}</span>
        <span>{`正文 ${summary.bodyLineCount}`}</span>
      </div>
    </section>
  );
}

function ArtifactCompactPreview({ artifact, provider, stageName }) {
  const summary = getArtifactSummary(artifact);
  const sourceLabel = provider ? providerLabel(provider) : '待生成';

  return (
    <section aria-label="阶段产物速览" className="artifact-compact-preview">
      <div className="artifact-compact-copy">
        <p className="eyebrow">阶段产物速览</p>
        <strong>{summary.title}</strong>
        <span>{`${localizeStageName(stageName)} · 来源：${sourceLabel}`}</span>
      </div>
      <div aria-label="阶段产物速览指标" className="artifact-compact-metrics">
        <span>{`章节 ${summary.headingCount}`}</span>
        <span>{`清单 ${summary.listItemCount}`}</span>
        <span>{`正文 ${summary.bodyLineCount}`}</span>
      </div>
    </section>
  );
}

function HistoryCompactPreview({ history = [] }) {
  const latest = history[0];
  const latestType = latest ? historyTypeLabel(latest.type) : '暂无流转记录';
  const latestNote = latest ? formatHistoryEventNote(latest) : '当前项目还没有阶段流转事件。';
  const latestActor = latest?.actor || '系统';
  const targetStage = latest?.to || latest?.stageName || latest?.stageId || '';

  return (
    <section aria-label="流转记录速览" className="history-compact-preview">
      <div className="history-compact-copy">
        <p className="eyebrow">流转记录速览</p>
        <strong>{latestType}</strong>
        <span>{latest ? `${latestActor} · ${latestNote}` : latestNote}</span>
      </div>
      <div aria-label="流转记录速览指标" className="history-compact-metrics">
        <span>{`记录 ${history.length}`}</span>
        <span>{targetStage ? `阶段 ${localizeStageName(targetStage)}` : '阶段 -'}</span>
      </div>
    </section>
  );
}

function getArtifactSummary(artifact) {
  const text = localizeWorkflowText(artifact || '当前阶段暂无产物。');
  const lines = text.split(/\r?\n/);
  const headingLines = lines.filter((line) => /^#{1,6}\s+\S/.test(line.trim()));
  const listItemLines = lines.filter((line) =>
    /^\s*(?:[-*+]\s+\S|\d+[.)]\s+\S)/.test(line),
  );
  const bodyLineCount = lines.filter((line) => {
    const trimmed = line.trim();
    return trimmed && !/^#{1,6}\s+\S/.test(trimmed) && !/^(?:[-*+]\s+\S|\d+[.)]\s+\S)/.test(trimmed);
  }).length;
  const headingTitle = headingLines[0]?.replace(/^#{1,6}\s+/, '').trim();
  const fallbackTitle = lines.find((line) => line.trim())?.trim();
  const lead =
    bodyLineCount > 0
      ? '已生成可核验内容，下面保留完整原文。'
      : '当前阶段只有结构信息，仍需补齐正文内容。';

  return {
    bodyLineCount,
    headingCount: headingLines.length,
    lead,
    listItemCount: listItemLines.length,
    title: headingTitle || fallbackTitle || '未命名产物',
  };
}

function StatusBadge({ status }) {
  const labels = {
    active: '进行中',
    approved: '已通过',
    queued: '等待',
    blocked: '已驳回',
  };

  return <span className={`status ${status || 'queued'}`}>{labels[status] || '等待'}</span>;
}

function providerLabel(provider) {
  const labels = {
    'codex-cli': 'Codex CLI',
    'local-rule': '本地规则',
    'manual-prd': '人工需求文档',
  };

  return labels[provider] || provider;
}

function databaseModeLabel(mode) {
  const labels = {
    'json-store': 'JSON 存储',
  };

  return labels[mode] || mode || '未配置';
}

function databaseTargetLabel(engine) {
  const labels = {
    postgresql: 'PostgreSQL',
  };

  return labels[engine] || engine || '未配置';
}

function platformStatusLabel(status) {
  const labels = {
    active: '启用',
    blocked: '已阻塞',
    complete: '已完成',
    completed: '已完成',
    'config-needed': '待配置',
    failed: '失败',
    'in-progress': '推进中',
    mapped: '已映射',
    missing: '缺失',
    'near-budget': '接近预算',
    'needs-extraction': '待抽取',
    'needs-filtered-extraction': '待筛选抽取',
    'needs-work': '待补充',
    'no-budget': '未设预算',
    ok: '正常',
    'over-budget': '超预算',
    planned: '规划中',
    'qa-return': '测试回流',
    ready: '已就绪',
    'within-budget': '预算内',
    'signed-off': '已验收',
  };

  return labels[status] || status || '未记录';
}

const STAGE_NAME_LABELS = {
  Acceptance: '最终验收',
  Architecture: '架构设计',
  Development: '自动开发',
  Operations: '运维准备',
  'Ops requirements': '运维需求',
  'PM requirements': '项目经理需求',
  'PRD approval': '需求文档审批',
  Requirements: '需求确认',
  QA: '测试验证',
  Review: '代码评审',
  'Sign-off': '验收签署',
};

const ROLE_NAME_LABELS = {
  Owner: '负责人',
  owner: '负责人',
  PM: '项目经理',
  pm: '项目经理',
  'Tech Lead': '技术负责人',
  'tech-lead': '技术负责人',
  'AI Dev': 'AI 开发',
  'ai-dev': 'AI 开发',
  'Local Runner': '本地执行器',
  'local-runner': '本地执行器',
  Developer: '开发',
  developer: '开发',
  QA: '测试',
  qa: '测试',
  Ops: '运维',
  ops: '运维',
  Team: '团队',
  team: '团队',
  'Unknown role': '未知角色',
};

const LOCALIZED_TEXT_REPLACEMENTS = [
  [/(\d+)\s+projects?\s*\/\s*(\d+)\s+open\s+tasks?/gi, '$1 个项目 / $2 个待办'],
  [/Owner workbench/gi, '负责人工作台'],
  [/Sent from owner cockpit\.?/gi, '来自负责人工作台的流转消息。'],
  [/PM workbench/gi, '项目经理工作台'],
  [/Server PM decision\.?/gi, '服务端项目经理决策。'],
  [/Server QA workbench/gi, '服务端测试工作台'],
  [/Server-side workbench decision\.?/gi, '服务端工作台决策。'],
  [/Tech lead workbench/gi, '技术负责人工作台'],
  [/Ops workbench/gi, '运维工作台'],
  [/QA workbench/gi, '测试工作台'],
  [/AI dev workbench/gi, '智能开发工作台'],
  [/Runner workbench/gi, '执行器工作台'],
  [/Role workbench/gi, '角色工作台'],
  [/Review portfolio blockers, approvals, cost, and release readiness\.?/gi, '复核项目组合阻塞、审批、费用和发布准备度。'],
  [/Clarify missing requirements and keep PRD approval gates moving\.?/gi, '补齐缺失需求，并推动需求文档审批闸口继续流转。'],
  [/Convert approved requirements into implementation plans and review gates\.?/gi, '将已确认需求转成实施计划，并维护评审闸口。'],
  [/Close environment, deployment, monitoring, and release handoff gaps\.?/gi, '补齐环境、部署、监控和发布交接缺口。'],
  [/Validate delivery quality, collect evidence, and route defects back to development\.?/gi, '验证交付质量、收集证据，并将缺陷回流开发。'],
  [/Execute assigned implementation packages and return verifiable artifacts\.?/gi, '执行分配的实现任务包，并返回可核验产物。'],
  [/Run local verification commands and attach logs to the delivery record\.?/gi, '运行本地验证命令，并把日志附加到交付记录。'],
  [/Process assigned workflow tasks and keep the delivery record current\.?/gi, '处理分配的流程任务，并保持交付记录最新。'],
  [/Review the highest-risk project and clear cross-role blockers\.?/gi, '复核最高风险项目，并清理跨角色阻塞。'],
  [/Complete missing requirement confirmations before PRD handoff\.?/gi, '在需求文档交接前补齐缺失需求确认。'],
  [/Review technical handoff, repository setup, and code review blockers\.?/gi, '复核技术交接、仓库配置和代码评审阻塞。'],
  [/Confirm runtime, deployment, and logging requirements before release\.?/gi, '发布前确认运行环境、部署和日志要求。'],
  [/Prepare QA evidence and route failing cases to development\.?/gi, '准备测试证据，并将失败用例回流开发。'],
  [/Run the assigned development package and attach implementation evidence\.?/gi, '运行分配的开发任务包，并附加实现证据。'],
  [/Run the next verification command and publish the result\.?/gi, '运行下一条验证命令并发布结果。'],
  [/Open the first assigned task and update the required confirmation\.?/gi, '打开第一个待办，并更新必填确认事项。'],
  [/补齐\s+项目经理需求\s+信息/gi, '补齐项目经理需求信息'],
  [/Review and advance stage/gi, '复核并推进阶段'],
  [/Update requirement confirmations/gi, '更新需求确认'],
  [/Prepare development package/gi, '准备开发任务包'],
  [/Confirm operations handoff/gi, '确认运维交接'],
  [/Confirm runtime environment/gi, '确认运行环境'],
  [/Confirm deployment and logging handoff/gi, '确认部署和日志交接'],
  [/Confirm runtime, deployment, RTSP connectivity, logging, and monitoring\.?/gi, '确认运行环境、部署、RTSP 连通性、日志和监控。'],
  [/Confirm final delivery evidence and sign-off\.?/gi, '确认最终交付证据并完成验收签署。'],
  [/Confirm acceptance package/gi, '确认验收包'],
  [/Sign off release/gi, '签署发布验收'],
  [/Attach QA evidence before release\.?/gi, '发布前补充测试验证证据。'],
  [/Attach QA evidence/gi, '补充测试验证证据'],
  [/Run AI development/gi, '运行智能开发'],
  [/Run verification checks/gi, '运行验证检查'],
  [/Open assigned task/gi, '打开分配任务'],
  [/Repair checks passed\.?/gi, '修复检查已通过。'],
  [/Repair QA blockers/gi, '修复测试阻塞'],
  [/修复 QA 阻塞/gi, '修复测试阻塞'],
  [/QA 缺陷修复执行/gi, '测试缺陷修复执行'],
  [/QA 缺陷修复包/gi, '测试缺陷修复包'],
  [/QA 缺陷/gi, '测试缺陷'],
  [/将\s+测试缺陷/gi, '将测试缺陷'],
  [/来源 QA/gi, '来源测试'],
  [/QA 通过/gi, '测试通过'],
  [/QA 复测/gi, '测试复测'],
  [/修复后必须重新进入 Review 和 QA。/gi, '修复后必须重新进入代码评审和测试验证。'],
  [/进入 Review 门禁并等待复审。/gi, '进入代码评审门禁并等待复审。'],
  [/ready-for-review/gi, '待代码评审'],
  [/code-review/gi, '代码评审'],
  [/^run-代码评审$/gi, '执行代码评审'],
  [/qa-retest/gi, '测试复测'],
  [/Use the backend gate decision\.?/gi, '使用后端闸口决策。'],
  [/Ask the tech lead to run review\.?/gi, '请技术负责人执行评审。'],
  [/Confirm runtime and deployment requirements\.?/gi, '确认运行环境和部署需求。'],
  [/Send runtime handoff to AI development and local runner\.?/gi, '将运行环境交接给智能开发和本地执行器。'],
  [/Send QA evidence to Owner for acceptance\.?/gi, '将测试证据交给负责人验收。'],
  [/Acknowledge the owner escalation and update the unblock plan\.?/gi, '确认负责人升级提醒，并更新解除阻塞计划。'],
  [/Send (\d+) escalated role handoff messages? before the next delivery gate review\.?/gi, '下次交付闸口复核前发送 $1 条升级角色交接提醒。'],
  [/Prepare (\d+) watch role handoff messages?\.?/gi, '准备 $1 条关注级角色交接提醒。'],
  [/PM accepted a previous RTSP follow-up\.?/gi, '项目经理已确认上一条 RTSP 跟进。'],
  [/Lin PM acknowledged (.+)/gi, 'Lin 项目经理已确认 $1'],
  [/Escalate PM handoff:\s*(.+?)\s+overdue\s+([\d.]+)h/gi, '升级项目经理交接：$1 超时 $2 小时'],
  [/PM:\s*(.+?)\s+is overdue by\s+([\d.]+)h\.\s*/gi, '项目经理：$1 已超时 $2 小时。'],
  [/Watch QA handoff:\s*(.+?)\s+overdue\s+([\d.]+)h/gi, '关注测试交接：$1 超时 $2 小时'],
  [/QA:\s*(.+?)\s+is overdue by\s+([\d.]+)h\.\s*/gi, '测试：$1 已超时 $2 小时。'],
  [/Escalate\s+(.+?)\s+handoff:\s*(.+?)\s+overdue\s+([\d.]+)h/gi, '升级$1交接：$2 超时 $3 小时'],
  [/Watch\s+(.+?)\s+handoff:\s*(.+?)\s+overdue\s+([\d.]+)h/gi, '关注$1交接：$2 超时 $3 小时'],
  [/([^:：]+):\s*(.+?)\s+is overdue by\s+([\d.]+)h\.\s*/gi, '$1：$2 已超时 $3 小时。'],
  [/Focus PM:\s*(\d+)\s+blocked\s+project\s+and\s+(\d+)\s+open\s+tasks?\.?/gi, '聚焦项目经理：$1 个阻塞项目，$2 个待办。'],
  [/Escalate PM:\s*(.+?)\s+is overdue by\s+([\d.]+)\s+hours?\.?/gi, '升级项目经理：$1 已超时 $2 小时。'],
  [/Focus Owner:\s*(\d+)\s+blocked\s+projects?\s+and\s+(\d+)\s+open\s+tasks?\.?/gi, '聚焦负责人：$1 个阻塞项目，$2 个待办。'],
  [/Escalate Owner:\s*(.+?)\s+is overdue by\s+([\d.]+)\s+hours?\.?/gi, '升级负责人：$1 已超时 $2 小时。'],
  [/Escalate the stage owner and resolve overdue blockers\.?/gi, '升级给阶段负责人并处理超时阻塞。'],
  [/Collect RTSP sample evidence before PRD approval\.?/gi, '需求文档审批前收集 RTSP 样本证据。'],
  [/Collect RTSP test evidence\.?/gi, '收集 RTSP 测试证据。'],
  [/Clarify RTSP test samples/gi, '澄清 RTSP 测试样本'],
  [/Code review failed/gi, '代码评审失败'],
  [/代码、安全和性能\s*Review\s*通过/gi, '代码、安全和性能评审通过'],
  [/代码、安全和性能 Review/gi, '代码、安全和性能评审'],
  [/代码\/安全\/性能\s*ReviewReview/gi, '代码、安全、性能评审'],
  [/代码\/安全\/性能\s*Review/gi, '代码、安全、性能评审'],
  [/代码 Review 报告/gi, '代码评审报告'],
  [/代码\s*review/gi, '代码评审'],
  [/Permission denied:\s*run-code-review/gi, '权限拒绝：执行代码评审'],
  [/^run-code-review$/gi, '执行代码评审'],
  [/^run-qa$/gi, '执行测试验证'],
  [/^rotate-token$/gi, '轮换 Token'],
  [/API token rotated by owner\.?/gi, '负责人已轮换 API Token。'],
  [/authorization-denied/gi, '越权拒绝'],
  [/security-token-rotated/gi, 'Token 已轮换'],
  [/^platform-job$/gi, '后台任务'],
  [/^security-audit$/gi, '安全审计'],
  [/^local-rule$/gi, '本地规则'],
  [/project-verification-command-allowlist/gi, '项目验证命令白名单'],
  [/当前角色无权执行代码\/安全\/性能 Review。/gi, '当前角色无权执行代码、安全、性能评审。'],
  [/PM cannot run code review\.?/gi, '项目经理不能执行代码评审。'],
  [/stdout\/stderr/gi, '标准输出/错误输出'],
  [/result summary/gi, '结果摘要'],
  [/SLA breach:\s*PM requirements/gi, 'SLA 超时：项目经理需求'],
  [/Route high severity notification actions to the accountable roles before approving delivery gates\.?/gi, '审批交付闸口前，将高优先级通知动作分派给对应角色。'],
  [/Tech lead should review failed job evidence and decide whether to retry or route a fix\.?/gi, '技术负责人需要复核失败任务证据，并决定重试或进入修复。'],
  [/Owner should review the denied action, role assignment, and allowed roles\.?/gi, '负责人需要复核被拒绝动作、角色分配和允许角色。'],
  [/QA should publish verification evidence or route defects back to development\.?/gi, '测试需要发布验证证据，或将缺陷回流开发。'],
  [/QA should publish verification evidence\.?/gi, '测试需要发布验证证据。'],
  [/QA 测试报告/gi, '测试验证报告'],
  [/QA 交接/gi, '测试交接'],
  [/尚未运行 Review/gi, '尚未运行代码评审'],
  [/重新执行\s+QA/gi, '重新执行测试验证'],
  [/QA 发现/gi, '测试发现'],
  [/执行 QA/gi, '执行测试验证'],
  [/QA verification/gi, '测试验证'],
  [/QA 自动测试/gi, '测试自动化'],
  [/Escalate critical SLA breaches to the owner role and require an updated unblock plan\.?/gi, '将严重 SLA 超时升级给负责人，并要求更新解除阻塞计划。'],
  [/Project is signed off\. Archive evidence and monitor production readiness\.?/gi, '项目已验收，归档证据并监控生产准备度。'],
  [/Review active runs and terminal evidence before approving delivery gates\.?/gi, '批准交付闸口前复核活跃运行和终态证据。'],
  [/Review job logs, fix the blocker, and rerun the platform job\.?/gi, '复核任务日志、修复阻塞，并重新运行后台任务。'],
  [/Persist stdout\/stderr, result summary, and artifacts for audit review\.?/gi, '持久化标准输出、错误输出、结果摘要和产物，供审计复核。'],
  [/Reclaim or fail stale platform jobs before starting new AI coding work\.?/gi, '开始新的智能开发前，先回收或标记过期后台任务失败。'],
  [/Review over-budget projects and pause non-critical runner or deployment work\.?/gi, '复核超预算项目，并暂停非关键执行器或部署工作。'],
  [/Reduce deployment environments or review failed\/repeated job runs\.?/gi, '减少部署环境，或复核失败与重复运行的任务。'],
  [/Deployment environments/gi, '部署环境'],
  [/AI generation/gi, 'AI 生成'],
  [/Runner checks/gi, '执行器检查'],
  [/Waiting blockers/gi, '等待阻塞'],
  [/Generated artifacts/gi, '生成产物'],
  [/Platform jobs/gi, '后台任务'],
  [/Verification checks/gi, '验证检查'],
  [/Open waiting items/gi, '等待事项'],
  [/Keep staging validation evidence current before production release\.?/gi, '生产发布前保持预发验证证据最新。'],
  [/Resolve production release blockers before deployment\.?/gi, '部署前先解除生产发布阻塞。'],
  [/Move project records out of local JSON storage\.?/gi, '将项目记录迁出本地 JSON 存储。'],
  [/Complete (\d+) ops handoff item\(s\)\.?/gi, '补齐 $1 个运维交接事项。'],
  [/Use local environment for prototype validation\.?/gi, '使用本地环境进行原型验证。'],
  [/Provision staging after release gates are unblocked\.?/gi, '发布闸口解除阻塞后准备预发环境。'],
  [/RTSP mock stream smoke test passed\.?/gi, 'RTSP 模拟流冒烟测试已通过。'],
  [/Runtime environment/gi, '运行环境'],
  [/manual-prd/gi, '人工需求文档'],
  [/PRD 审批/gi, '需求文档审批'],
  [/PRD 草稿/gi, '需求文档草稿'],
  [/PRD 草案/gi, '需求文档草案'],
  [/PRD 输入/gi, '需求文档输入'],
  [/PRD 交接/gi, '需求文档交接'],
  [/PRD 口径/gi, '需求文档口径'],
  [/启动状态：\s*READY/gi, '启动状态：可启动'],
  [/启动状态：\s*BLOCKED/gi, '启动状态：已阻塞'],
  [/启动状态：\s*UNKNOWN/gi, '启动状态：未知'],
  [/YOLO\s+mock\s+推理服务/gi, 'YOLO 模拟推理服务'],
  [/mock\s+推理服务/gi, '模拟推理服务'],
  [/JSON schema\s*/gi, '检测结果结构约定'],
  [/SAST/gi, '静态安全扫描'],
  [/检测结果结构约定\s+和\s+/gi, '检测结果结构约定和'],
  [/和\s+静态安全扫描\s+/gi, '和静态安全扫描'],
  [/\bLocal Runner\b/gi, '本地执行器'],
  [/\bLocal\b/g, '本地'],
  [/\bStaging\b/g, '预发'],
  [/\bProduction\b/g, '生产'],
  [/生产 database/gi, '生产数据库'],
  [/Schema baseline/gi, 'Schema 基线'],
  [/Workflow state extraction/gi, '流程状态抽取'],
  [/Cutover and rollback controls/gi, '切换与回滚控制'],
  [/Repository boundary/gi, '仓库边界'],
  [/Implement transactional database writes before production cutover\.?/gi, '生产切换前实现事务型数据库写入。'],
  [/Replace JSON file writes with PostgreSQL transactions\.?/gi, '用 PostgreSQL 事务替换 JSON 文件写入。'],
  [/Add optimistic locking or database-level write serialization\.?/gi, '增加乐观锁或数据库级写入串行化。'],
  [/Extract platform jobs into agent_jobs, agent_job_runs, and agent_job_events before SQL cutover\.?/gi, 'SQL 切换前将后台任务抽取到 agent_jobs、agent_job_runs 和 agent_job_events。'],
  [/AI coding verification/gi, '智能开发验证'],
  [/Stale worker job/gi, '过期执行器任务'],
  [/AI operations/gi, 'AI 运营'],
  [/ai-operations/gi, 'AI 运营'],
  [/PM requirements blocked by (\d+) gate item\(s\)\.?/gi, '项目经理需求被 $1 个闸口事项阻塞'],
  [/Requirements/gi, '需求确认'],
  [/PRD is not ready for approval/gi, '需求文档尚未达到审批条件'],
  [/Requirement quality review and PRD generation must be completed first\.?/gi, '需要先完成需求质量评审并生成需求文档。'],
  [/All events/gi, '全部事件'],
  [/High severity/gi, '高危'],
  [/\bcritical\b/gi, '严重'],
  [/\bhigh\b/gi, '高'],
  [/\bmedium\b/gi, '中'],
  [/\blow\b/gi, '低'],
  [/npm test failed\.?/gi, 'npm test 失败。'],
  [/Security review passed\.?/gi, '安全评审已通过。'],
  [/Generated PRD draft\.?/gi, '已生成需求文档草稿。'],
  [/Route requirement blockers to PM\.?/gi, '将需求阻塞分派给项目经理。'],
  [/Resolved from cockpit\.?/gi, '已在控制台解决。'],
  [/Manual cancellation\.?/gi, '人工取消。'],
  [/api-platform-job-failed/gi, '接口后台任务失败'],
  [/platform-job-heartbeat/gi, '后台任务心跳'],
  [/platform-job-reclaimed/gi, '后台任务已回收'],
  [/platform-job-started/gi, '后台任务已开始'],
  [/platform-job-failed/gi, '后台任务失败'],
  [/platform-job-succeeded/gi, '后台任务成功'],
  [/platform-job-queued/gi, '后台任务排队'],
  [/PM requirements blocked by (\d+) gate item\(s\)\.?/gi, '项目经理需求被 $1 个闸口事项阻塞'],
  [/项目经理需求 blocked by (\d+) gate item\(s\)\.?/gi, '项目经理需求被 $1 个闸口事项阻塞'],
  [/Stage gate blocked by (\d+) item\(s\)\.?/gi, '阶段闸口被 $1 个事项阻塞。'],
  [/Complete (\d+) current-stage confirmation task\(s\)\.?/gi, '补齐 $1 个当前阶段确认事项。'],
  [/Current-stage confirmations are incomplete\.?/gi, '当前阶段确认事项未补齐。'],
  [/Run requirement quality review and generate the PRD draft\.?/gi, '运行需求质量评审并生成需求文档草案。'],
  [/Run code review gate/gi, '代码评审闸口'],
  [/Run code review\.?/gi, '执行代码评审'],
  [/Route QA defects back to development and regenerate a fix plan\.?/gi, '将测试缺陷回流到开发，并重新生成修复计划。'],
  [/PM should resolve requirement blockers and update the PRD inputs\.?/gi, '项目经理需要处理需求阻塞，并更新需求文档输入。'],
  [/Owner should complete final acceptance or reopen the blocking stage\.?/gi, '负责人需要完成最终验收，或重新打开阻塞阶段。'],
  [/Command is not in the project runner allowlist and was not executed\.?/gi, '命令不在项目执行白名单中，未执行。'],
  [/Reclaim or fail this stale platform job from the queue controls\.?/gi, '请在队列控制区回收或标记这个过期后台任务失败。'],
  [/Escalate to the technical owner before scheduling another run\.?/gi, '再次调度前请升级给技术负责人处理。'],
  [/Fix blockers and retry eligible jobs from the cockpit\.?/gi, '先修复阻塞，再在控制台重试符合条件的任务。'],
  [/Escalate exhausted jobs to the technical owner\.?/gi, '将重试耗尽的任务升级给技术负责人。'],
  [/Review cancellations and decide whether to queue replacement jobs\.?/gi, '复核取消记录，并决定是否重新排队替代任务。'],
  [/Confirm whether the cancelled job should stay closed or be queued again\.?/gi, '确认已取消任务是否保持关闭，或重新排队执行。'],
  [/Clarify QA evidence/gi, '澄清测试证据'],
  [/Collect QA test evidence\.?/gi, '收集测试验证证据。'],
  [/Collect QA evidence/gi, '收集测试验证证据'],
  [/Production database/gi, '生产数据库'],
  [/Ops handoff/gi, '运维交接'],
  [/Transactional writes/gi, '事务写入'],
  [/Concurrent write protection/gi, '并发写保护'],
  [/Build passed\.?/gi, '构建已通过。'],
  [/All verification commands passed\.?/gi, '所有验证命令已通过。'],
  [/tests passed/gi, '测试已通过'],
  [/Dependency audit failed\.?/gi, '依赖审计失败。'],
  [/Retryable failed jobs/gi, '可重试失败任务'],
  [/Retry attempts exhausted/gi, '重试次数耗尽'],
  [/Cancelled jobs/gi, '已取消任务'],
  [/Build verification exhausted/gi, '构建验证重试耗尽'],
  [/Build verification/gi, '构建验证'],
  [/Code review/gi, '代码评审'],
  [/QA cancelled run/gi, '测试验证运行已取消'],
  [/QA stale run/gi, '测试验证运行已过期'],
  [/PM requirements/gi, '项目经理需求'],
  [/QA validation/gi, '测试验证'],
  [/PRD approval/gi, '需求文档审批'],
  [/Ops requirements/gi, '运维需求'],
  [/\bReview\b/gi, '代码评审'],
  [/\bQA\b/g, '测试验证'],
  [/\bworkflow\b/gi, '流程'],
  [/is overdue by ([\d.]+)h/gi, '已超时 $1 小时'],
  [/\boverdue ([\d.]+)h/gi, '超时 $1 小时'],
  [/\boverdue\b/gi, '超时'],
  [/Open tasks?\s*(\d+)/gi, '待办 $1'],
  [/Gate\s*(\d+)/gi, '闸口 $1'],
  [/\bFollow-up blocker\b/gi, '跟进事项阻塞'],
  [/\bGate blocker\b/gi, '阶段闸口阻塞'],
  [/\bJob failure\b/gi, '后台任务失败'],
  [/\bWorkflow blocker\b/gi, '流程阻塞'],
  [/\bMessage ready for\b/gi, '待发送给'],
  [/\bMessage sent by\b/gi, '已发送人'],
  [/\bMessage acknowledged by\b/gi, '已确认人'],
  [/\bNo project\b/gi, '未关联项目'],
  [/\bNo stage\b/gi, '未关联阶段'],
  [/\bNo task\b/gi, '暂无任务'],
  [/\bFocus not assigned\b/gi, '暂无聚焦项目'],
  [/\bFocus\b/gi, '聚焦'],
  [/\bUrgent\b/gi, '紧急'],
  [/\bBlocked projects\b/gi, '阻塞项目'],
  [/\bblocked\b/gi, '阻塞'],
  [/\bopen\b/gi, '待处理'],
  [/\ballowed\b/gi, '允许'],
  [/\bcritical\b/gi, '高风险'],
  [/\bwarning\b/gi, '需关注'],
  [/\bhealthy\b/gi, '健康'],
  [/\bstale\b/gi, '停滞'],
  [/\bnormal\b/gi, '正常'],
  [/\bready\b/gi, '已就绪'],
  [/\bsigned-off\b/gi, '已签收'],
  [/\bpassed\b/gi, '已通过'],
  [/\bwatch\b/gi, '关注'],
  [/\bhigh\b/gi, '高'],
  [/\bprojects\b/gi, '项目'],
  [/\bproject\b/gi, '项目'],
  [/\btasks\b/gi, '任务'],
  [/\btask\b/gi, '任务'],
  [/\broles\b/gi, '角色'],
  [/\brole\b/gi, '角色'],
  [/\bOwner\b/g, '负责人'],
  [/\bPM\b/g, '项目经理'],
  [/\bTech Lead\b/g, '技术负责人'],
  [/\bAI Dev\b/g, 'AI 开发'],
  [/\bLocal Runner\b/g, '本地执行器'],
  [/补齐\s+项目经理需求\s+信息/gi, '补齐项目经理需求信息'],
  [/\bIn-app\b/gi, '站内'],
  [/\bFeishu\b/gi, '飞书'],
];

function notificationSeverityLabel(severity) {
  const labels = {
    critical: '高',
    high: '高',
    medium: '中',
    low: '低',
    warning: '中',
  };

  return labels[severity] || '提示';
}

function notificationActionStatusLabel(status) {
  const labels = {
    acknowledged: '已确认',
    assigned: '已分派',
    open: '待处理',
    resolved: '已解决',
  };

  return labels[status] || '待处理';
}

function jobStatusLabel(status) {
  const labels = {
    cancelled: '已取消',
    exhausted: '重试耗尽',
    failed: '失败',
    queued: '排队',
    reclaimed: '已回收',
    running: '运行中',
    succeeded: '成功',
  };

  return labels[status] || status || '未记录';
}

function formatMoney(value) {
  return Number(value || 0).toFixed(2).replace(/\.00$/, '');
}

function formatCompactMoney(value) {
  const formatted = Number(value || 0).toFixed(2);
  return formatted.replace(/(\.\d*[1-9])0$/, '$1').replace(/\.00$/, '');
}

function formatDurationMs(value) {
  const duration = Number(value || 0);
  return Number.isFinite(duration) ? `${duration}ms` : '未记录';
}

function getDestinationHeading(destination) {
  const labels = {
    delivery: '交付控制',
    operations: '运营后台',
    projects: '项目中心',
    tasks: '任务队列',
    workspace: '我的工作台',
  };

  return labels[destination] || '工作台';
}

function getDestinationEyebrow(destination) {
  const labels = {
    delivery: '项目交付',
    operations: '运营驾驶舱',
    projects: '项目组合',
    tasks: '角色待办',
    workspace: '角色工作台',
  };

  return labels[destination] || '工作区';
}

function localizeWorkflowText(value) {
  if (value === null || value === undefined) {
    return '';
  }

  let text = String(value);
  LOCALIZED_TEXT_REPLACEMENTS.forEach(([pattern, replacement]) => {
    text = text.replace(pattern, replacement);
  });
  Object.entries(STAGE_NAME_LABELS).forEach(([source, label]) => {
    text = text.replace(new RegExp(escapeRegExp(source), 'g'), label);
  });

  return text.trim();
}

function localizeStageName(value) {
  if (!value) {
    return '';
  }

  return STAGE_NAME_LABELS[value] || localizeWorkflowText(value);
}

function localizeRoleLabel(value) {
  if (!value) {
    return '未分配角色';
  }

  return ROLE_NAME_LABELS[value] || localizeWorkflowText(value);
}

function organizationPlanLabel(value) {
  const labels = {
    Team: '团队版',
    team: '团队版',
    Pilot: '试点版',
    pilot: '试点版',
    Enterprise: '企业版',
    enterprise: '企业版',
  };

  return labels[value] || localizeWorkflowText(value) || '未配置套餐';
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function qualityStatusLabel(status) {
  const labels = {
    ready: '可提交',
    'needs-work': '待补充',
    stale: '已过期',
  };

  return labels[status] || '未评审';
}

function riskLevelLabel(level) {
  const labels = {
    high: '高风险',
    medium: '中风险',
    low: '低风险',
  };

  return labels[level] || '中风险';
}

function ownerSeverityLabel(level) {
  const labels = {
    high: '高',
    medium: '中',
    low: '低',
  };

  return `${labels[level] || '中'}风险`;
}

function ownerBlockerTypeLabel(type) {
  const labels = {
    'stage-gate': '阶段闸口阻塞',
    followup: '跟进事项阻塞',
    'failed-job': '后台任务失败',
  };

  return labels[type] || '流程阻塞';
}

function ownerBlockerMetric(blocker = {}) {
  if (blocker.type === 'stage-gate') {
    return `闸口 ${blocker.gateBlockerCount || 0} / 待办 ${blocker.openTaskCount || 0}`;
  }
  if (blocker.openTaskCount) {
    return `待办 ${blocker.openTaskCount}`;
  }
  return '';
}

function healthLevelLabel(level) {
  const labels = {
    critical: '高风险',
    warning: '需关注',
    healthy: '健康',
  };

  return labels[level] || '未评估';
}

function bottleneckLevelLabel(level) {
  const labels = {
    critical: '严重阻塞',
    warning: '需关注',
    healthy: '正常',
  };

  return labels[level] || '正常';
}

function escalationLevelLabel(level) {
  const labels = {
    escalated: '已升级',
    watch: '观察',
    normal: '正常',
  };

  return labels[level] || '正常';
}

function stageGateStatusLabel(status) {
  const labels = {
    blocked: '被阻塞',
    completed: '已完成',
    ready: '可流转',
  };

  return labels[status] || status || '未记录';
}

function formatTaskPrioritySummary(context = {}) {
  if (!context || typeof context !== 'object') {
    return '';
  }

  const parts = [];
  if (context.healthLevel) {
    parts.push(healthLevelLabel(context.healthLevel));
  }
  if (Number.isFinite(Number(context.healthScore))) {
    parts.push(`得分 ${Number(context.healthScore)}`);
  }
  if (!parts.length && context.gateStatus) {
    parts.push(ownerBlockerTypeLabel(context.gateStatus === 'blocked' ? 'stage-gate' : 'followup'));
  }

  return parts.join(' · ');
}

function shortRiskLevelLabel(level) {
  const labels = {
    high: '高',
    medium: '中',
    low: '低',
  };

  return labels[level] || '中';
}

function developmentPlanStatusLabel(status) {
  const labels = {
    ready: '待执行',
    running: '执行中',
    done: '已完成',
    blocked: '已阻塞',
  };

  return labels[status] || '待执行';
}

function developmentTaskStatusLabel(status) {
  const labels = {
    queued: '待执行',
    running: '执行中',
    done: '已完成',
    blocked: '已阻塞',
  };

  return labels[status] || '待执行';
}

function developmentRunStatusLabel(status) {
  const labels = {
    'ready-for-agent': '待接入执行器',
    running: '执行中',
    completed: '已完成',
    blocked: '已阻塞',
  };

  return labels[status] || '待接入执行器';
}

function developmentRunTaskStatusLabel(status) {
  const labels = {
    planned: '已计划',
    running: '执行中',
    completed: '已完成',
    blocked: '已阻塞',
  };

  return labels[status] || '已计划';
}

function developmentCheckStatusLabel(status) {
  const labels = {
    'not-run': '未运行',
    running: '运行中',
    passed: '通过',
    failed: '失败',
    blocked: '已阻塞',
  };

  return labels[status] || '未运行';
}

function codeReviewStatusLabel(status) {
  const labels = {
    passed: '已通过',
    'needs-work': '需返工',
  };

  return labels[status] || '未评审';
}

function codeReviewCategoryStatusLabel(status) {
  const labels = {
    passed: '通过',
    'needs-work': '需处理',
  };

  return labels[status] || '未检查';
}

function qaRunStatusLabel(status) {
  const labels = {
    passed: '已通过',
    'needs-work': '需处理',
  };

  return labels[status] || '未执行';
}

function qaCaseStatusLabel(status) {
  const labels = {
    passed: '通过',
    failed: '失败',
    blocked: '阻塞',
    'not-run': '未执行',
  };

  return labels[status] || '未执行';
}

function defectFixPackageStatusLabel(status) {
  const labels = {
    ready: '可修复',
    blocked: '被阻塞',
    executing: '执行中',
    'review-ready': '待代码评审',
    reviewing: '评审复审中',
    'qa-retest': '测试复测中',
    closed: '已关闭',
  };
  return labels[status] || '被阻塞';
}

function defectFixRepairSubmissionStatusLabel(status) {
  const labels = {
    reviewing: '评审复审中',
    executing: '执行中',
    'review-ready': '待代码评审',
    'qa-retest': '测试复测中',
    closed: '已关闭',
    blocked: '被阻塞',
  };
  return labels[status] || '被阻塞';
}

function qaRoutingTargetLabel(targetStageId) {
  const labels = {
    development: '回流自动开发',
    qa: '测试阶段补证据',
    acceptance: '进入最终验收',
  };

  return labels[targetStageId] || '未记录';
}

function qaEvidenceFieldLabel(field) {
  const labels = {
    sampleSet: '测试视频样本',
    durationMinutes: '测试时长',
    environment: '测试环境',
    browserScope: '浏览器范围',
    totalDetections: '总检测次数',
    falsePositiveCount: '误检次数',
    falsePositiveRate: '误检率低于阈值',
  };

  return labels[field] || field;
}

function yoloQaReviewStatusLabel(status) {
  const labels = {
    unreviewed: '待标注',
    'true-positive': '正确检测',
    'false-positive': '误检',
  };

  return labels[status] || '待标注';
}

function formatFalsePositiveEvidenceSummary(evidence = {}, draft = {}) {
  const rate = Number(evidence?.falsePositiveRate);
  const threshold = Number(evidence?.falsePositiveThreshold ?? draft.falsePositiveThreshold ?? 0.3);
  if (!Number.isFinite(rate)) {
    return `误检率待统计 · 目标低于 ${formatPercentage(threshold || 0.3)}`;
  }

  const status = evidence?.falsePositivePassed === true ? '已通过' : '未通过';
  return `误检率 ${formatPercentage(rate)} · 目标低于 ${formatPercentage(threshold || 0.3)} · ${status}`;
}

function formatPercentage(value) {
  const normalized = Number(value);
  if (!Number.isFinite(normalized)) {
    return '待补充';
  }
  const percentValue = normalized > 1 ? normalized : normalized * 100;
  return `${Math.round(percentValue)}%`;
}

function formatDateTime(value) {
  if (!value) {
    return '未记录';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString('zh-CN', {
    hour12: false,
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function repositoryConfigStatusLabel(status) {
  const labels = {
    ready: '配置就绪',
    incomplete: '待补配置',
  };

  return labels[status] || '待补配置';
}

function repositoryInspectionStatusLabel(status) {
  const labels = {
    ready: '可执行',
    warning: '需要处理',
    blocked: '已阻塞',
  };

  return labels[status] || '未诊断';
}

function repositoryBootstrapStatusLabel(status) {
  const labels = {
    ready: '初始化完成',
    blocked: '已阻塞',
    failed: '执行失败',
  };

  return labels[status] || '未初始化';
}

function branchPreparationStatusLabel(status) {
  const labels = {
    ready: '已就绪',
    blocked: '已阻塞',
    failed: '执行失败',
  };

  return labels[status] || '未准备';
}

function agentPackageStatusLabel(status) {
  const labels = {
    ready: '可启动',
    blocked: '不可启动',
  };

  return labels[status] || '未生成';
}

function launchGuideStatusLabel(status) {
  const labels = {
    ready: '可启动',
    pending: '待处理',
    blocked: '已阻塞',
  };

  return labels[status] || '待处理';
}

function launchGuideStepStatusLabel(status) {
  const labels = {
    ready: '已通过',
    pending: '待处理',
    blocked: '已阻塞',
  };

  return labels[status] || '待处理';
}

function repositoryFieldLabel(field) {
  const labels = {
    repositoryUrl: '仓库地址或本地路径',
    targetBranch: '目标分支',
    executionMode: '执行模式',
  };

  return labels[field] || field;
}

function executionModeLabel(mode) {
  const labels = {
    'codex-local': 'Codex 本地执行',
    manual: '人工执行',
    ci: 'CI Runner',
  };

  return labels[mode] || 'Codex 本地执行';
}

export function historyTypeLabel(type) {
  const labels = {
    'agent-execution-package-generated': 'AI任务包',
    'branch-prepared': '分支准备',
    advance: '推进',
    reject: '驳回',
    complete: '完成',
    'requirement-answer': '需求',
    'requirement-review': '质检',
    'prd-generated': '需求文档',
    'project-members-updated': '项目成员',
    'stage-confirmation-updated': '确认事项',
    'technical-handoff-generated': '技术交接',
    'development-run-created': '开发执行',
    'repository-config-updated': '执行器配置',
    'repository-bootstrapped': '仓库初始化',
    'repository-inspected': '仓库诊断',
    'development-checks-finished': '开发检查',
    'code-review-finished': '代码评审',
    'qa-run-finished': '测试验证',
    'platform-job-failed': '后台任务失败',
    'platform-job-started': '后台任务开始',
    'platform-job-succeeded': '后台任务成功',
    'platform-job-queued': '后台任务排队',
  };
  return labels[type] || '记录';
}

export function formatHistoryEventNote(event = {}) {
  if (event.note) {
    return localizeWorkflowText(event.note);
  }

  if (event.from || event.to) {
    return `${localizeStageName(event.from || '未知阶段')} 到 ${localizeStageName(event.to || '未知阶段')}`;
  }

  return '暂无说明';
}

function createRepositoryDraft(config = {}, plan = {}) {
  const commands = config?.verificationCommands?.length
    ? config.verificationCommands
    : plan?.verificationCommands || [];

  return {
    repositoryUrl: config?.repositoryUrl || '',
    localPath: config?.localPath || '',
    baseBranch: config?.baseBranch || 'main',
    targetBranch: config?.targetBranch || '',
    executionMode: config?.executionMode || 'codex-local',
    verificationCommands: commands,
    notes: config?.notes || '',
  };
}

function createStageConfirmationDrafts(entry = {}) {
  return Object.fromEntries((entry?.items || []).map((item) => [item.id, item.value || '']));
}

function createQaEvidenceDraft(evidence = {}) {
  return {
    sampleSet: evidence?.sampleSet || '',
    durationMinutes: evidence?.durationMinutes || '',
    environment: evidence?.environment || '',
    browserScope: evidence?.browserScope || '',
    notes: evidence?.notes || '',
    totalDetections: evidence?.totalDetections ?? '',
    falsePositiveCount: evidence?.falsePositiveCount ?? '',
    falsePositiveThreshold: evidence?.falsePositiveThreshold ?? 0.3,
  };
}

function createYoloQaEventDraft(session = {}) {
  return {
    channel: session?.channels?.[0] || 72,
    personCount: 1,
    confidence: 0.8,
    snapshotUrl: '',
  };
}

function parseOptionalNumber(value) {
  if (String(value ?? '').trim() === '') {
    return null;
  }
  const normalized = Number(value);
  return Number.isFinite(normalized) ? normalized : null;
}

function createAcceptanceSignoffDraft(pack = {}) {
  return {
    archiveVersion: pack?.archiveVersion || '',
  };
}

function getAutomaticProjectUserId(project, users) {
  if (!project) {
    return selectUserForRole('owner', users)?.id || APP_USERS[0].id;
  }

  if (project.currentStageId === PM_STAGE_ID) {
    return selectUserForRole('owner', users)?.id || APP_USERS[0].id;
  }

  return getCurrentStageOwnerUserId(project, users);
}

function createFocusedTaskDetail(project, focusedTask, users) {
  if (!project || !focusedTask || project.id !== focusedTask.projectId) {
    return null;
  }

  if (!focusedTask.itemId) {
    return {
      ...focusedTask,
      assigneeName: focusedTask.assigneeName || '未指派',
      targetRoleLabel: focusedTask.targetRoleLabel || focusedTask.stageName || '当前角色',
      status: focusedTask.status || 'open',
    };
  }

  const stageId = focusedTask.stageId || project.currentStageId;
  const ledger = createProjectTaskLedger(project, {
    stageIds: [stageId],
    includeResolved: true,
    users,
  });
  const task = ledger.tasks.find((candidate) => candidate.itemId === focusedTask.itemId);
  if (!task) {
    return null;
  }

  return task;
}

function getCurrentStageOwnerUserId(project, users) {
  const currentStage = project?.stages?.find((stage) => stage.id === project.currentStageId);
  const role = resolveActorRole(currentStage?.owner);
  const roleId = role === 'unknown' ? 'owner' : role;
  const members = normalizeProjectMembers(project?.members, users);
  return members[roleId] || selectUserForRole(roleId, users)?.id || APP_USERS[0].id;
}

function getProjectActionPermission(project, actionId, user, users) {
  const permission = canPerformProjectAction(project, actionId, user?.role || 'unknown');
  if (!permission.allowed || !user) {
    return permission;
  }

  if (isUserAssignedToProjectRole(project, user, permission.role, users)) {
    return permission;
  }

  return {
    ...permission,
    allowed: false,
    reason: `当前用户不是该项目的${permission.roleLabel}成员。`,
  };
}

function getNotificationActionUiPermission(project, item, status, user, users) {
  const actionId = notificationActionPermissionId(status);
  const permission =
    project && (!item.projectId || project.id === item.projectId)
      ? getProjectActionPermission(project, actionId, user, users)
      : canPerformProjectAction(project || {}, actionId, user?.role || 'unknown');
  if (!permission.allowed) {
    return permission;
  }

  if (status === 'resolved') {
    const targetRole = item.assigneeRole || item.targetRole || '';
    if (targetRole && user?.role !== 'owner' && user?.role !== targetRole) {
      return {
        ...permission,
        allowed: false,
        reason: '当前角色只能关闭指派给自己的通知待办。',
      };
    }
  }

  return permission;
}

function notificationActionPermissionId(status) {
  const permissionIds = {
    acknowledged: 'acknowledge-notification-action',
    assigned: 'assign-notification-action',
    resolved: 'resolve-notification-action',
  };

  return permissionIds[status] || 'acknowledge-notification-action';
}

function progressRatio(project) {
  const totalStages = Number(project.totalStages) || 0;
  if (totalStages <= 0) {
    return 0;
  }

  const stageProgress = Number(project.stageProgress) || 0;
  return Math.min(1, Math.max(0, stageProgress / totalStages));
}

async function api(url, options = {}, session = {}) {
  const response = await fetch(url, withSessionHeaders(options, session));
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new ApiRequestError(data.error || '请求失败', {
      details: data.details || {},
      status: response.status,
    });
  }
  return data;
}

class ApiRequestError extends Error {
  constructor(message, { details = {}, status = 0 } = {}) {
    super(message);
    this.name = 'ApiRequestError';
    this.details = details;
    this.status = status;
  }
}

function withSessionHeaders(options = {}, { token = '', userId = '', organizationId = '' } = {}) {
  const headers = { ...(options.headers || {}) };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  if (userId) {
    headers['X-User-Id'] = userId;
  }

  if (organizationId) {
    headers['X-Organization-Id'] = organizationId;
  }

  return {
    ...options,
    headers,
  };
}

function readStoredAuthSession() {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const parsed = JSON.parse(window.localStorage.getItem(SESSION_STORAGE_KEY) || 'null');
    if (!parsed?.token || !parsed?.user?.id) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

function writeStoredAuthSession(session) {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
}

function clearStoredAuthSession() {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.removeItem(SESSION_STORAGE_KEY);
}

function toSummary(project) {
  const currentStage = project.stages.find((stage) => stage.id === project.currentStageId);
  const followupTasks = createStageConfirmationFollowupTasks(project, project.currentStageId);
  return {
    id: project.id,
    organizationId: project.organizationId || DEFAULT_ORGANIZATION_ID,
    name: project.name,
    sponsor: project.sponsor,
    summary: project.summary,
    health: project.health,
    currentStageId: project.currentStageId,
    currentStageName: currentStage?.name || project.currentStageId,
    currentOwner: currentStage?.owner || '未知',
    prdStatus: project.prdStatus || 'draft',
    stageProgress: project.stages.filter((stage) => stage.status === 'approved').length,
    totalStages: project.stages.length,
    openFollowupTaskCount: followupTasks.length,
    followupTaskTargetRoleLabels: uniqueValues(followupTasks.map((task) => task.targetRoleLabel)),
    followupTaskAssigneeNames: uniqueValues(followupTasks.map((task) => task.assigneeName)),
    followupTaskAssignments: summarizeFollowupTaskAssignments(followupTasks),
    ownerEscalations: project.ownerEscalations || {},
    updatedAt: project.updatedAt,
  };
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

function toFollowupTaskSummary(task) {
  return {
    id: task.id,
    stageId: task.stageId,
    itemId: task.itemId,
    title: task.title,
    question: task.question,
    expectedAnswer: task.expectedAnswer,
    status: task.status,
  };
}

function uniqueValues(values) {
  return [...new Set(values.filter(Boolean))];
}

