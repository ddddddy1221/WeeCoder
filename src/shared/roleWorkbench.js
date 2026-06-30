import { canPerformProjectAction } from './authorization.js';

const ROLE_WORKBENCH_PROFILES = {
  owner: {
    title: 'Owner workbench',
    instruction: 'Review portfolio blockers, approvals, cost, and release readiness.',
    nextAction: 'Review the highest-risk project and clear cross-role blockers.',
  },
  pm: {
    title: 'PM workbench',
    instruction: 'Clarify missing requirements and keep PRD approval gates moving.',
    nextAction: 'Complete missing requirement confirmations before PRD handoff.',
  },
  'tech-lead': {
    title: 'Tech lead workbench',
    instruction: 'Convert approved requirements into implementation plans and review gates.',
    nextAction: 'Review technical handoff, repository setup, and code review blockers.',
  },
  ops: {
    title: 'Ops workbench',
    instruction: 'Close environment, deployment, monitoring, and release handoff gaps.',
    nextAction: 'Confirm runtime, deployment, and logging requirements before release.',
  },
  qa: {
    title: 'QA workbench',
    instruction: 'Validate delivery quality, collect evidence, and route defects back to development.',
    nextAction: 'Prepare QA evidence and route failing cases to development.',
  },
  'ai-dev': {
    title: 'AI dev workbench',
    instruction: 'Execute assigned implementation packages and return verifiable artifacts.',
    nextAction: 'Run the assigned development package and attach implementation evidence.',
  },
  'local-runner': {
    title: 'Runner workbench',
    instruction: 'Run local verification commands and attach logs to the delivery record.',
    nextAction: 'Run the next verification command and publish the result.',
  },
  default: {
    title: 'Role workbench',
    instruction: 'Process assigned workflow tasks and keep the delivery record current.',
    nextAction: 'Open the first assigned task and update the required confirmation.',
  },
};

const ROLE_PRIMARY_ACTIONS = {
  owner: {
    actionId: 'advance',
    label: 'Review and advance stage',
  },
  pm: {
    actionId: 'update-stage-confirmations',
    label: 'Update requirement confirmations',
  },
  'tech-lead': {
    actionId: 'generate-development-package',
    label: 'Prepare development package',
  },
  ops: {
    actionId: 'update-stage-confirmations',
    label: 'Confirm operations handoff',
  },
  qa: {
    actionId: 'qa-evidence',
    label: 'Attach QA evidence',
  },
  'ai-dev': {
    actionId: 'run-development',
    label: 'Run AI development',
  },
  'local-runner': {
    actionId: 'run-development-checks',
    label: 'Run verification checks',
  },
  default: {
    actionId: 'update-stage-confirmations',
    label: 'Open assigned task',
  },
};

const ROLE_HANDOFF_RELATIONS = {
  owner: { upstreamRole: 'qa', downstreamRole: 'pm' },
  pm: { upstreamRole: 'owner', downstreamRole: 'tech-lead' },
  'tech-lead': { upstreamRole: 'pm', downstreamRole: 'ops' },
  ops: { upstreamRole: 'tech-lead', downstreamRole: 'ai-dev' },
  'ai-dev': { upstreamRole: 'ops', downstreamRole: 'local-runner' },
  'local-runner': { upstreamRole: 'ai-dev', downstreamRole: 'tech-lead' },
  qa: { upstreamRole: 'tech-lead', downstreamRole: 'owner' },
  default: { upstreamRole: 'owner', downstreamRole: 'owner' },
};

const ROLE_HANDOFF_LABELS = {
  owner: 'Owner',
  pm: 'PM',
  'tech-lead': 'Tech Lead',
  ops: 'Ops',
  'ai-dev': 'AI Dev',
  'local-runner': 'Local Runner',
  qa: 'QA',
  unknown: 'Team',
};

export function createRoleWorkbench(
  projects = [],
  { currentUser = null, roleInbox = {}, personalTaskQueue = null } = {},
) {
  const isOrganizationOwner = currentUser?.role === 'owner';
  const fallbackTasks = flattenCurrentUserInboxTasks(roleInbox.currentUserGroups);
  const hasPersonalTaskQueue = Boolean(personalTaskQueue);
  const queueTasks = hasPersonalTaskQueue ? normalizeTasks(personalTaskQueue.tasks) : fallbackTasks;
  const escalationTasks = createOwnerEscalationTasksForUser(projects, currentUser);
  const queueTaskKeys = new Set(queueTasks.map(createRoleTaskKey));
  const newEscalationCount = escalationTasks.filter((task) => !queueTaskKeys.has(createRoleTaskKey(task))).length;
  const tasks = sortRoleTasks(
    dedupeRoleTasks([
      ...escalationTasks,
      ...queueTasks,
    ]),
  );
  const baseOpenTaskCount = hasPersonalTaskQueue
    ? Number(personalTaskQueue.openTaskCount || queueTasks.length)
    : sumCurrentUserOpenTasks(roleInbox.currentUserGroups);
  const openTaskCount = baseOpenTaskCount + newEscalationCount;
  const taskProjectCount = new Set(tasks.map((task) => task.projectId).filter(Boolean)).size;
  const projectCount = hasPersonalTaskQueue
    ? Math.max(Number(personalTaskQueue.projectCount || 0), taskProjectCount)
    : taskProjectCount;
  const actions = createRoleActions(currentUser, tasks, projects);
  const roleSummary = createRoleSummary(currentUser, tasks, {
    openTaskCount,
    projectCount,
  });

  return {
    mode: isOrganizationOwner ? 'owner' : 'personal',
    isOrganizationOwner,
    visibleProjectCount: projects.length,
    openTaskCount,
    projectCount,
    tasks,
    roleSummary,
    handoffSummary: createRoleHandoffSummary(currentUser, tasks, projects, {
      isOrganizationOwner,
      projectCount,
      roleSummary,
    }),
    actions,
    permissionGates: actions.map((action) => action.gate),
    recommendedProjectId: tasks[0]?.projectId || projects[0]?.id || '',
  };
}

function createRoleActions(currentUser, tasks = [], projects = []) {
  const focusTask = selectFocusTask(tasks);
  if (!focusTask) {
    return [];
  }

  const profile = ROLE_PRIMARY_ACTIONS[currentUser?.role] || ROLE_PRIMARY_ACTIONS.default;
  const project = findProjectForTask(focusTask, projects);
  const permissionProject = createTaskStagePermissionProject(project, focusTask);
  const permission = canPerformProjectAction(permissionProject, profile.actionId, currentUser?.role || 'unknown');
  const gate = {
    actionId: profile.actionId,
    allowed: permission.allowed,
    reason: permission.reason || '',
    allowedRoles: permission.allowedRoles,
    role: permission.role,
    roleLabel: permission.roleLabel,
    projectId: focusTask.projectId || '',
    projectName: focusTask.projectName || '',
  };

  return [
    {
      id: 'focus-task',
      actionId: profile.actionId,
      label: profile.label,
      enabled: permission.allowed,
      projectId: focusTask.projectId || '',
      projectName: focusTask.projectName || '',
      taskId: focusTask.id || focusTask.followupTaskId || '',
      stageId: focusTask.stageId || '',
      stageName: focusTask.stageName || '',
      nextAction: focusTask.priorityContext?.nextAction || '',
      gate,
    },
  ];
}

function createTaskStagePermissionProject(project = {}, task = {}) {
  if (!task.stageId) {
    return project;
  }

  return {
    ...project,
    currentStageId: task.stageId,
    currentStageName: task.stageName || project.currentStageName || task.stageId,
  };
}

function findProjectForTask(task = {}, projects = []) {
  return (
    projects.find((project) => project.id === task.projectId) || {
      id: task.projectId || '',
      name: task.projectName || '',
      currentStageId: task.stageId || '',
      currentStageName: task.stageName || '',
    }
  );
}

function createRoleSummary(currentUser, tasks = [], { openTaskCount = 0, projectCount = 0 } = {}) {
  const profile = ROLE_WORKBENCH_PROFILES[currentUser?.role] || ROLE_WORKBENCH_PROFILES.default;
  const focusTask = selectFocusTask(tasks);
  const urgentTasks = tasks.filter(isUrgentTask);
  const blockedProjectIds = new Set(
    tasks.filter(isBlockedTask).map((task) => task.projectId).filter(Boolean),
  );

  return {
    title: profile.title,
    role: currentUser?.role || 'unknown',
    roleLabel: currentUser?.roleLabel || 'Unknown role',
    instruction: profile.instruction,
    scopeLabel: `${projectCount} ${pluralize('project', projectCount)} / ${openTaskCount} open ${pluralize(
      'task',
      openTaskCount,
    )}`,
    focusProjectId: focusTask?.projectId || '',
    focusProjectName: focusTask?.projectName || '',
    focusStageId: focusTask?.stageId || '',
    focusStageName: focusTask?.stageName || '',
    urgentTaskCount: urgentTasks.length,
    blockedProjectCount: blockedProjectIds.size,
    nextAction: focusTask?.priorityContext?.nextAction || profile.nextAction,
  };
}

function createRoleHandoffSummary(
  currentUser,
  tasks = [],
  projects = [],
  { isOrganizationOwner = false, projectCount = 0, roleSummary = {} } = {},
) {
  const currentRole = currentUser?.role || 'unknown';
  const relation = ROLE_HANDOFF_RELATIONS[currentRole] || ROLE_HANDOFF_RELATIONS.default;
  const currentRoleLabel = currentUser?.roleLabel || handoffRoleLabel(currentRole);
  const projectRows = createRoleHandoffProjects(tasks, projects);
  const blockedTaskCount = tasks.filter(isBlockedTask).length;
  const urgentTaskCount = tasks.filter(isUrgentTask).length;

  return {
    scope: isOrganizationOwner ? 'organization' : 'personal',
    currentRole,
    currentRoleLabel,
    upstreamRole: relation.upstreamRole,
    upstreamRoleLabel: handoffRoleLabel(relation.upstreamRole),
    downstreamRole: relation.downstreamRole,
    downstreamRoleLabel: handoffRoleLabel(relation.downstreamRole),
    totalTaskCount: tasks.length,
    activeProjectCount: projectRows.length || projectCount || (isOrganizationOwner ? projects.length : 0),
    blockedTaskCount,
    urgentTaskCount,
    nextAction: roleSummary.nextAction || '',
    lanes: [
      {
        role: relation.upstreamRole,
        roleLabel: handoffRoleLabel(relation.upstreamRole),
        relation: 'upstream',
      },
      {
        role: currentRole,
        roleLabel: currentRoleLabel,
        relation: 'current',
        taskCount: tasks.length,
        projectCount: projectRows.length || projectCount || 0,
        blockedTaskCount,
      },
      {
        role: relation.downstreamRole,
        roleLabel: handoffRoleLabel(relation.downstreamRole),
        relation: 'downstream',
      },
    ],
    projects: projectRows.slice(0, 5),
  };
}

function createRoleHandoffProjects(tasks = [], projects = []) {
  const projectById = new Map(projects.map((project) => [project.id, project]));
  const groupedTasks = new Map();

  tasks.forEach((task) => {
    const projectId = task.projectId || '';
    if (!projectId) {
      return;
    }

    const group = groupedTasks.get(projectId) || [];
    group.push(task);
    groupedTasks.set(projectId, group);
  });

  return [...groupedTasks.entries()]
    .map(([projectId, projectTasks]) => {
      const focusTask = selectFocusTask(projectTasks);
      const project = projectById.get(projectId) || {};
      return {
        projectId,
        projectName: focusTask?.projectName || project.name || projectId,
        stageId: focusTask?.stageId || project.currentStageId || '',
        stageName: focusTask?.stageName || project.currentStageName || project.currentStageId || '',
        openTaskCount: projectTasks.length,
        blockedTaskCount: projectTasks.filter(isBlockedTask).length,
        urgentTaskCount: projectTasks.filter(isUrgentTask).length,
        latestTaskTitle: focusTask?.title || '',
        priorityScore: getTaskPriorityScore(focusTask),
      };
    })
    .sort((left, right) => {
      if (left.priorityScore !== right.priorityScore) {
        return right.priorityScore - left.priorityScore;
      }

      return String(left.projectName || '').localeCompare(String(right.projectName || ''));
    });
}

function handoffRoleLabel(role) {
  return ROLE_HANDOFF_LABELS[role] || ROLE_HANDOFF_LABELS.unknown;
}

function selectFocusTask(tasks = []) {
  return [...tasks].sort((left, right) => getTaskPriorityScore(right) - getTaskPriorityScore(left))[0] || null;
}

function getTaskPriorityScore(task = {}) {
  const context = task.priorityContext || {};
  const basePriority = Number(context.priority) || 0;
  const gateBoost = context.gateStatus === 'blocked' ? 30 : 0;
  const healthBoost = context.healthLevel === 'critical' ? 20 : 0;
  return basePriority + gateBoost + healthBoost;
}

function createOwnerEscalationTasksForUser(projects = [], currentUser = null) {
  if (!currentUser?.id && !currentUser?.role) {
    return [];
  }

  return projects.flatMap((project) =>
    Object.values(project.ownerEscalations || {})
      .filter((escalation) => isOpenOwnerEscalationForUser(escalation, currentUser))
      .map((escalation) => createOwnerEscalationTask(project, escalation, currentUser)),
  );
}

function isOpenOwnerEscalationForUser(escalation = {}, currentUser = {}) {
  if (escalation.status !== 'sent') {
    return false;
  }

  const recipientUserId = String(escalation.recipientUserId || '').trim();
  if (recipientUserId) {
    return recipientUserId === currentUser.id;
  }

  return String(escalation.role || '').trim() === currentUser.role;
}

function createOwnerEscalationTask(project = {}, escalation = {}) {
  const escalationLevel = escalation.escalationLevel || 'watch';
  const critical = escalationLevel === 'escalated';
  return {
    id: escalation.id,
    type: 'owner-escalation',
    escalationMessageId: escalation.id,
    projectId: project.id || escalation.projectId || '',
    projectName: project.name || escalation.projectName || '',
    stageId: escalation.stageId || project.currentStageId || '',
    stageName: escalation.stageName || project.currentStageName || project.currentStageId || '',
    title: escalation.subject || `Owner escalation: ${project.name || 'project'}`,
    status: escalation.status || 'sent',
    targetRole: escalation.role || '',
    targetRoleLabel: escalation.roleLabel || '',
    assigneeUserId: escalation.recipientUserId || '',
    assigneeName: escalation.recipientName || '',
    updatedAt: escalation.sentAt || '',
    priorityContext: {
      gateStatus: critical ? 'blocked' : 'watch',
      healthLevel: critical ? 'critical' : 'warning',
      priority: critical ? 100 : 80,
      reason: escalation.body || escalation.note || '',
      nextAction: 'Acknowledge the owner escalation and update the unblock plan.',
    },
  };
}

function dedupeRoleTasks(tasks = []) {
  const seen = new Set();
  return tasks.filter((task) => {
    const key = createRoleTaskKey(task);
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function sortRoleTasks(tasks = []) {
  return [...tasks].sort((left, right) => {
    const priorityDiff = getTaskPriorityScore(right) - getTaskPriorityScore(left);
    if (priorityDiff) {
      return priorityDiff;
    }
    return 0;
  });
}

function createRoleTaskKey(task = {}) {
  return `${task.projectId || ''}:${task.id || task.followupTaskId || ''}`;
}

function isUrgentTask(task = {}) {
  return getTaskPriorityScore(task) >= 70;
}

function isBlockedTask(task = {}) {
  const context = task.priorityContext || {};
  return context.gateStatus === 'blocked' || context.healthLevel === 'critical';
}

function pluralize(label, count) {
  return Number(count) === 1 ? label : `${label}s`;
}

function flattenCurrentUserInboxTasks(groups = []) {
  return groups.flatMap((group) =>
    (group.projects || []).flatMap((project) =>
      (project.tasks || []).map((task) => ({
        ...task,
        projectId: task.projectId || project.projectId,
        projectName: task.projectName || project.projectName,
        stageId: task.stageId || project.stageId || '',
        stageName: task.stageName || project.stageName || '',
      })),
    ),
  );
}

function normalizeTasks(tasks = []) {
  return tasks.map((task) => ({
    ...task,
    projectId: task.projectId || '',
    projectName: task.projectName || '',
    stageId: task.stageId || '',
    stageName: task.stageName || '',
  }));
}

function sumCurrentUserOpenTasks(groups = []) {
  return groups.reduce((sum, group) => sum + Number(group.openTaskCount || 0), 0);
}
