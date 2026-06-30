export function createRoleInbox(projects = [], { currentUserId = '' } = {}) {
  const groupsByAssignee = new Map();

  projects.forEach((project) => {
    getProjectAssignments(project).forEach((assignment) => {
      const openTaskCount = Math.max(0, Number(assignment.openTaskCount) || 0);
      if (!openTaskCount) {
        return;
      }

      const key = `${assignment.targetRole || 'unknown'}:${assignment.assigneeUserId || assignment.assigneeName || 'unassigned'}`;
      const group = groupsByAssignee.get(key) || {
        targetRole: assignment.targetRole || 'unknown',
        targetRoleLabel: assignment.targetRoleLabel || 'Unknown role',
        assigneeUserId: assignment.assigneeUserId || '',
        assigneeName: assignment.assigneeName || 'Unassigned',
        openTaskCount: 0,
        projects: [],
        isCurrentUser: false,
      };

      const priorityContext = createPriorityContext(project);
      group.openTaskCount += openTaskCount;
      group.isCurrentUser = Boolean(currentUserId && group.assigneeUserId === currentUserId);
      group.projects.push({
        projectId: project.id,
        projectName: project.name,
        stageId: project.currentStageId,
        stageName: project.currentStageName || project.currentStageId,
        openTaskCount,
        priorityContext,
        tasks: normalizeAssignmentTasks(assignment.tasks, project, assignment, priorityContext),
      });
      groupsByAssignee.set(key, group);
    });
  });

  const groups = [...groupsByAssignee.values()].sort((left, right) => {
    if (left.isCurrentUser !== right.isCurrentUser) {
      return left.isCurrentUser ? -1 : 1;
    }

    if (left.openTaskCount !== right.openTaskCount) {
      return right.openTaskCount - left.openTaskCount;
    }

    return `${left.targetRoleLabel}${left.assigneeName}`.localeCompare(
      `${right.targetRoleLabel}${right.assigneeName}`,
    );
  });

  return {
    openTaskCount: groups.reduce((sum, group) => sum + group.openTaskCount, 0),
    groups,
    currentUserGroups: groups.filter((group) => group.isCurrentUser),
  };
}

export function filterRoleInbox(inbox = {}, filter = 'all') {
  const groups = Array.isArray(inbox.groups) ? inbox.groups : [];
  const visibleGroups =
    filter === 'mine'
      ? groups.filter((group) => group.isCurrentUser)
      : filter === 'others'
        ? groups.filter((group) => !group.isCurrentUser)
        : groups;

  return {
    ...inbox,
    openTaskCount: visibleGroups.reduce((sum, group) => sum + group.openTaskCount, 0),
    groups: visibleGroups,
    currentUserGroups: visibleGroups.filter((group) => group.isCurrentUser),
  };
}

function getProjectAssignments(project = {}) {
  if (Array.isArray(project.followupTaskAssignments)) {
    return project.followupTaskAssignments;
  }

  if (!project.openFollowupTaskCount) {
    return [];
  }

  return [
    {
      targetRole: 'unknown',
      targetRoleLabel: (project.followupTaskTargetRoleLabels || [])[0] || 'Unknown role',
      assigneeUserId: '',
      assigneeName: (project.followupTaskAssigneeNames || [])[0] || 'Unassigned',
      openTaskCount: project.openFollowupTaskCount,
    },
  ];
}

function normalizeAssignmentTasks(tasks = [], project = {}, assignment = {}, priorityContext = {}) {
  return tasks.map((task) => ({
    id: task.id,
    followupTaskId: task.followupTaskId || task.id,
    projectId: project.id,
    projectName: project.name,
    stageId: task.stageId || project.currentStageId,
    stageName: task.stageName || project.currentStageName || project.currentStageId,
    itemId: task.itemId,
    title: task.title,
    question: task.question || '',
    expectedAnswer: task.expectedAnswer || '',
    status: task.status || 'open',
    resolvedAt: task.resolvedAt || '',
    resolvedBy: task.resolvedBy || '',
    resolutionSummary: task.resolutionSummary || '',
    commentCount: Number(task.commentCount) || 0,
    updatedAt: task.updatedAt || task.resolvedAt || '',
    targetRole: task.targetRole || assignment.targetRole || 'unknown',
    targetRoleLabel: task.targetRoleLabel || assignment.targetRoleLabel || 'Unknown role',
    assigneeUserId: assignment.assigneeUserId || '',
    assigneeName: assignment.assigneeName || 'Unassigned',
    priorityContext,
  }));
}

function createPriorityContext(project = {}) {
  const health = project.projectHealth || {};
  const gate = project.stageGateReport || {};
  const healthScore = toFiniteNumber(health.score);
  const priority = toFiniteNumber(health.priority);
  const gateBlockerCount = Math.max(0, toFiniteNumber(gate.blockerCount) || 0);
  const firstReason = Array.isArray(health.reasons) ? health.reasons.find(Boolean) : '';
  const firstAction = Array.isArray(gate.requiredActions) ? gate.requiredActions.find(Boolean) : '';

  return {
    healthLevel:
      health.level ||
      (gate.status === 'blocked' ? 'critical' : project.health === 'on-track' ? 'healthy' : 'warning'),
    healthScore,
    priority: priority || (gate.status === 'blocked' ? 100 : 0),
    gateStatus: gate.status || '',
    gateBlockerCount,
    blockedStageName: gate.stageName || project.currentStageName || project.currentStageId || '',
    nextAction: health.nextAction || firstAction || '',
    reason: firstReason || (gate.status === 'blocked' ? `Stage gate blocked by ${gateBlockerCount || 1} item(s).` : ''),
  };
}

function toFiniteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}
