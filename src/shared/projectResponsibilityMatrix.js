import { getRoleLabel, resolveActorRole } from './authorization.js';
import { normalizeProjectMembers } from './projectMembers.js';
import { createStageGateReport } from './stageGate.js';
import { createProjectTaskLedger } from './taskLedger.js';
import { APP_USERS, findUserById } from './users.js';

const STAGE_ROLE_BY_ID = Object.freeze({
  intake: 'owner',
  'pm-requirements': 'pm',
  'prd-approval': 'owner',
  architecture: 'tech-lead',
  'ops-requirements': 'ops',
  development: 'ai-dev',
  review: 'tech-lead',
  qa: 'qa',
  'defect-loop': 'ai-dev',
  acceptance: 'owner',
});

const STAGE_SHORT_LABELS = Object.freeze({
  intake: '项目入口',
  'pm-requirements': '项目经理需求',
  'prd-approval': '需求文档审批',
  architecture: '架构与数据设计',
  'ops-requirements': '运维需求',
  development: '自动开发',
  review: '代码评审',
  qa: '测试验证',
  'defect-loop': '缺陷回归',
  acceptance: '最终验收',
});

export function createProjectResponsibilityMatrix(project, { users = APP_USERS } = {}) {
  if (!project) {
    return createEmptyResponsibilityMatrix();
  }

  const members = normalizeProjectMembers(project.members, users);
  const stages = Array.isArray(project.stages) ? project.stages : [];
  const rows = stages.map((stage) => createResponsibilityRow(project, stage, { members, users }));
  const currentRow =
    rows.find((row) => row.stageId === project.currentStageId) ||
    rows.find((row) => row.isCurrent) ||
    rows[0] ||
    null;
  const blockedStageCount = rows.filter((row) => row.status === 'blocked').length;
  const completedStageCount = rows.filter((row) => row.status === 'complete').length;
  const activeStageCount = rows.filter((row) => row.status === 'blocked' || row.status === 'active').length;

  return {
    projectId: project.id || '',
    projectName: project.name || '',
    status: resolveMatrixStatus(currentRow, rows),
    currentStageId: currentRow?.stageId || project.currentStageId || '',
    currentStageName: currentRow?.stageName || '',
    currentRole: currentRow?.role || '',
    currentRoleLabel: currentRow?.roleLabel || '',
    currentAssigneeUserId: currentRow?.assigneeUserId || '',
    currentAssigneeName: currentRow?.assigneeName || '',
    currentOpenTaskCount: currentRow?.openTaskCount || 0,
    currentBlockerCount: currentRow?.blockerCount || 0,
    totalStageCount: rows.length,
    activeStageCount,
    blockedStageCount,
    completedStageCount,
    totalOpenTaskCount: rows.reduce((sum, row) => sum + row.openTaskCount, 0),
    nextAction: createMatrixNextAction(currentRow),
    rows,
  };
}

function createResponsibilityRow(project, stage, { members, users }) {
  const stageId = stage.id || '';
  const role = resolveStageRole(stage);
  const assignee = findUserById(members[role], users);
  const isQueued = stage.status === 'queued';
  const isComplete = stage.status === 'approved';
  const isCurrent = stageId === project.currentStageId;
  const report =
    isQueued || isComplete
      ? null
      : createStageGateReport(project, {
          stageId,
          users,
        });
  const taskLedger =
    isQueued || isComplete
      ? { openTaskCount: 0 }
      : createProjectTaskLedger(project, {
          stageIds: [stageId],
          includeResolved: false,
          users,
        });
  const gateStatus = isQueued ? 'queued' : isComplete ? 'completed' : report?.status || 'ready';
  const status = isQueued ? 'queued' : isComplete ? 'complete' : gateStatus === 'blocked' ? 'blocked' : 'active';

  return {
    stageId,
    stageName: STAGE_SHORT_LABELS[stageId] || stage.name || stageId,
    originalStageName: stage.name || stageId,
    stageStatus: stage.status || '',
    role,
    roleLabel: getRoleLabel(role),
    assigneeUserId: assignee?.id || '',
    assigneeName: assignee?.name || '',
    status,
    gateStatus,
    openTaskCount: taskLedger.openTaskCount || 0,
    blockerCount: report?.blockerCount || 0,
    isCurrent,
    nextAction: createRowNextAction({
      roleLabel: getRoleLabel(role),
      stageName: STAGE_SHORT_LABELS[stageId] || stage.name || stageId,
      openTaskCount: taskLedger.openTaskCount || 0,
      blockerCount: report?.blockerCount || 0,
      status,
    }),
  };
}

function resolveStageRole(stage = {}) {
  return STAGE_ROLE_BY_ID[stage.id] || resolveActorRole(stage.owner) || 'owner';
}

function resolveMatrixStatus(currentRow, rows) {
  if (!rows.length) {
    return 'empty';
  }
  if (currentRow?.status === 'blocked') {
    return 'blocked';
  }
  if (currentRow?.status === 'active') {
    return 'active';
  }
  if (rows.every((row) => row.status === 'complete')) {
    return 'complete';
  }
  return 'queued';
}

function createMatrixNextAction(currentRow) {
  if (!currentRow) {
    return '当前项目暂无可处理阶段。';
  }
  return currentRow.nextAction;
}

function createRowNextAction({ roleLabel, stageName, openTaskCount, blockerCount, status }) {
  if (status === 'complete') {
    return `${stageName}已完成，继续观察后续交付证据。`;
  }
  if (status === 'queued') {
    return `${stageName}尚未开始，等待前置阶段完成。`;
  }
  if (blockerCount > 0) {
    return `${roleLabel}需要处理${stageName}的 ${openTaskCount} 个待办，并解除 ${blockerCount} 个闸口阻塞。`;
  }
  if (openTaskCount > 0) {
    return `${roleLabel}需要处理${stageName}的 ${openTaskCount} 个待办。`;
  }
  return `${roleLabel}可以推进${stageName}进入下一阶段。`;
}

function createEmptyResponsibilityMatrix() {
  return {
    projectId: '',
    projectName: '',
    status: 'empty',
    currentStageId: '',
    currentStageName: '',
    currentRole: '',
    currentRoleLabel: '',
    currentAssigneeUserId: '',
    currentAssigneeName: '',
    currentOpenTaskCount: 0,
    currentBlockerCount: 0,
    totalStageCount: 0,
    activeStageCount: 0,
    blockedStageCount: 0,
    completedStageCount: 0,
    totalOpenTaskCount: 0,
    nextAction: '当前项目暂无可处理阶段。',
    rows: [],
  };
}
