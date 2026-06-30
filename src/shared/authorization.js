export const PROJECT_ROLES = Object.freeze([
  {
    id: 'owner',
    label: '负责人',
    aliases: ['负责人', 'Owner', 'Sponsor', '业务负责人'],
  },
  {
    id: 'pm',
    label: '项目经理',
    aliases: ['项目经理', 'PM'],
  },
  {
    id: 'tech-lead',
    label: '技术负责人',
    aliases: ['技术负责人', 'Tech Lead', 'Architect', 'AI Dev Lead'],
  },
  {
    id: 'ops',
    label: '运维',
    aliases: ['运维', 'Ops'],
  },
  {
    id: 'ai-dev',
    label: 'AI 开发',
    aliases: ['AI 开发', 'AI Dev'],
  },
  {
    id: 'local-runner',
    label: '本地执行器',
    aliases: ['Local Runner', '本地执行器'],
  },
  {
    id: 'qa',
    label: '测试',
    aliases: ['测试', 'QA'],
  },
]);

const ROLE_BY_ALIAS = new Map(
  PROJECT_ROLES.flatMap((role) => [
    [normalizeActor(role.id), role.id],
    [normalizeActor(role.label), role.id],
    ...role.aliases.map((alias) => [normalizeActor(alias), role.id]),
  ]),
);

const ACTION_POLICIES = Object.freeze({
  'manage-members': ['owner'],
  'answer-requirement': ['pm', 'owner'],
  'review-requirements': ['pm', 'owner'],
  'generate-prd': ['pm', 'owner'],
  'repository-config': ['tech-lead', 'owner'],
  'bootstrap-repository': ['tech-lead', 'owner'],
  'inspect-repository': ['local-runner', 'tech-lead', 'owner'],
  'prepare-branch': ['local-runner', 'tech-lead', 'owner'],
  'generate-development-package': ['tech-lead', 'owner'],
  'queue-platform-job': ['owner', 'tech-lead'],
  'update-platform-job': ['owner', 'tech-lead', 'local-runner'],
  'run-development': ['ai-dev', 'tech-lead', 'owner'],
  'run-development-checks': ['local-runner', 'tech-lead', 'owner'],
  'run-code-review': ['tech-lead', 'owner'],
  'run-qa': ['qa'],
  'qa-evidence': ['qa'],
  'yolo-qa-session': ['qa'],
  'route-qa-defects': ['qa'],
  'generate-acceptance-package': ['owner'],
  'update-deployment-environment': ['ops', 'owner'],
  'acknowledge-notification': ['owner', 'pm', 'tech-lead', 'ops', 'ai-dev', 'local-runner', 'qa'],
  'acknowledge-notification-action': ['owner', 'pm', 'tech-lead', 'ops', 'ai-dev', 'local-runner', 'qa'],
  'assign-notification-action': ['owner', 'tech-lead'],
  'resolve-notification-action': ['owner', 'pm', 'tech-lead', 'ops', 'ai-dev', 'local-runner', 'qa'],
  'send-owner-escalation': ['owner'],
  'acknowledge-owner-escalation': ['owner', 'pm', 'tech-lead', 'ops', 'ai-dev', 'local-runner', 'qa'],
  'record-pipeline-flow-action': ['owner', 'pm', 'tech-lead', 'ops', 'ai-dev', 'local-runner', 'qa'],
});

const ADVANCE_ROLES_BY_STAGE = Object.freeze({
  intake: ['owner', 'pm'],
  'pm-requirements': ['pm', 'owner'],
  'prd-approval': ['owner'],
  architecture: ['tech-lead', 'owner'],
  'ops-requirements': ['ops', 'tech-lead', 'owner'],
  development: ['ai-dev', 'tech-lead', 'owner'],
  review: ['tech-lead', 'owner'],
  qa: ['qa'],
  acceptance: ['owner'],
  'defect-loop': ['ai-dev', 'qa', 'tech-lead', 'owner'],
});

const REJECT_ROLES_BY_STAGE = Object.freeze({
  intake: ['owner'],
  'pm-requirements': ['pm', 'owner'],
  'prd-approval': ['owner'],
  architecture: ['tech-lead', 'owner'],
  'ops-requirements': ['ops', 'tech-lead', 'owner'],
  development: ['ai-dev', 'tech-lead', 'owner'],
  review: ['tech-lead', 'owner'],
  qa: ['qa', 'owner'],
  acceptance: ['owner'],
  'defect-loop': ['ai-dev', 'qa', 'tech-lead', 'owner'],
});

const ACTION_DENIAL_REASONS = Object.freeze({
  'acknowledge-notification': '当前角色无权确认通知项。',
  'acknowledge-notification-action': '当前角色无权确认通知待办。',
  'assign-notification-action': '当前角色无权指派通知待办。',
  'resolve-notification-action': '当前角色无权关闭通知待办。',
  'send-owner-escalation': '当前角色无权发送负责人升级提醒。',
  'acknowledge-owner-escalation': '当前角色无权确认负责人升级提醒。',
  'record-pipeline-flow-action': '当前角色无权记录业务流转动作。',
  'update-deployment-environment': '当前角色无权维护部署环境状态。',
  'manage-members': '当前角色无权维护项目成员。',
  'update-stage-confirmations': '当前角色无权维护当前阶段确认事项。',
  'run-code-review': '当前角色无权执行代码/安全/性能 Review。',
  'run-qa': '当前角色无权执行 QA 测试。',
  'qa-evidence': '当前角色无权维护 QA 证据。',
  'yolo-qa-session': '当前角色无权维护 YOLO 测试批次。',
  'route-qa-defects': '当前角色无权将 QA 缺陷回流给开发。',
  'generate-acceptance-package': '当前角色无权生成最终验收包。',
  'queue-platform-job': '当前角色无权创建后台任务。',
  'update-platform-job': '当前角色无权更新后台任务状态。',
  advance: '当前角色无权推进当前阶段。',
  reject: '当前角色无权驳回当前阶段。',
});

export function resolveActorRole(actorOrRole) {
  return ROLE_BY_ALIAS.get(normalizeActor(actorOrRole)) || 'unknown';
}

export function getRoleLabel(roleId) {
  return PROJECT_ROLES.find((role) => role.id === roleId)?.label || '未知角色';
}

export function canPerformProjectAction(project, actionId, actorOrRole) {
  const role = resolveActorRole(actorOrRole);
  const roles = getAllowedRoles(project, actionId);
  const allowed = roles.includes(role);

  return {
    actionId,
    allowed,
    allowedRoles: roles,
    role,
    roleLabel: getRoleLabel(role),
    reason: allowed ? '' : ACTION_DENIAL_REASONS[actionId] || '当前角色无权执行该操作。',
  };
}

function getAllowedRoles(project, actionId) {
  if (actionId === 'advance') {
    return ADVANCE_ROLES_BY_STAGE[project?.currentStageId] || [];
  }

  if (actionId === 'update-stage-confirmations') {
    return ADVANCE_ROLES_BY_STAGE[project?.currentStageId] || [];
  }

  if (actionId === 'reject') {
    return REJECT_ROLES_BY_STAGE[project?.currentStageId] || [];
  }

  return ACTION_POLICIES[actionId] || [];
}

function normalizeActor(actorOrRole) {
  return String(actorOrRole || '').trim().toLowerCase();
}
