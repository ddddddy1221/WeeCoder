import { getStageConfirmationSummary } from './stageConfirmations.js';
import { createProjectTaskLedger } from './taskLedger.js';

const DELIVERY_GATE_DEFINITIONS = Object.freeze([
  {
    id: 'requirements',
    label: '需求确认',
    stageId: 'pm-requirements',
    role: 'pm',
  },
  {
    id: 'prd',
    label: '需求文档',
    stageId: 'prd-approval',
    role: 'owner',
  },
  {
    id: 'technical-handoff',
    label: '技术交接',
    stageId: 'architecture',
    role: 'tech-lead',
  },
  {
    id: 'development-package',
    label: '开发任务包',
    stageId: 'development',
    role: 'developer',
  },
  {
    id: 'development-run',
    label: '自动开发',
    stageId: 'development',
    role: 'developer',
  },
  {
    id: 'review',
    label: '代码评审',
    stageId: 'review',
    role: 'tech-lead',
  },
  {
    id: 'qa-evidence',
    label: '测试证据',
    stageId: 'qa',
    role: 'qa',
  },
  {
    id: 'qa',
    label: '测试验证',
    stageId: 'qa',
    role: 'qa',
  },
  {
    id: 'acceptance',
    label: '最终验收包',
    stageId: 'acceptance',
    role: 'owner',
  },
  {
    id: 'signoff',
    label: '负责人签收',
    stageId: 'acceptance',
    role: 'owner',
  },
]);

const DELIVERY_ROLE_LABELS = Object.freeze({
  owner: '负责人',
  pm: '项目经理',
  'tech-lead': '技术负责人',
  developer: 'AI 开发',
  qa: '测试',
});

const DELIVERY_ROLE_ORDER = Object.freeze(['owner', 'pm', 'tech-lead', 'developer', 'qa']);

export function createStageGateReport(project, { stageId = '', users } = {}) {
  if (!project) {
    return createEmptyReport();
  }

  const resolvedStageId = stageId || project.currentStageId || '';
  const stage = findStage(project, resolvedStageId);
  const nextStage = findNextStage(project, resolvedStageId);
  const taskLedger = createProjectTaskLedger(project, {
    stageIds: [resolvedStageId],
    includeResolved: false,
    users,
  });
  const blockers = createGateBlockers(project, resolvedStageId, taskLedger);
  const isCompleted = isStageSignedOff(project, resolvedStageId);
  const status = isCompleted ? 'completed' : blockers.length ? 'blocked' : 'ready';

  return {
    projectId: project.id || '',
    projectName: project.name || '',
    stageId: resolvedStageId,
    stageName: stage?.name || resolvedStageId,
    stageOwner: stage?.owner || '',
    status,
    canAdvance: status === 'ready',
    nextStageId: nextStage?.id || '',
    nextStageName: nextStage?.name || '',
    openTaskCount: taskLedger.openTaskCount,
    blockerCount: blockers.length,
    blockers,
    requiredActions: blockers.map((blocker) => blocker.requiredAction).filter(Boolean),
  };
}

export function createDeliveryGateAudit(project) {
  if (!project) {
    return createEmptyDeliveryGateAudit();
  }

  const gates = DELIVERY_GATE_DEFINITIONS.map((definition) => createDeliveryGate(project, definition));
  const roleHandoffs = createDeliveryRoleHandoffs(gates);
  const completedGateCount = gates.filter((gate) => gate.status === 'complete').length;
  const blockedGateCount = gates.filter((gate) => gate.status === 'blocked').length;
  const missingGateCount = gates.filter((gate) => gate.status === 'missing').length;
  const currentGate =
    gates.find((gate) => gate.status === 'blocked') ||
    gates.find((gate) => gate.status === 'missing') ||
    gates[gates.length - 1];
  const status = resolveDeliveryAuditStatus(project, gates);

  return {
    projectId: project.id || '',
    projectName: project.name || '',
    status,
    completionPercent: gates.length ? Math.round((completedGateCount / gates.length) * 100) : 0,
    completedGateCount,
    totalGateCount: gates.length,
    blockedGateCount,
    missingGateCount,
    currentGateId: currentGate?.id || '',
    currentGateLabel: currentGate?.label || '',
    nextAction: resolveDeliveryAuditNextAction(status, currentGate),
    gates,
    roleHandoffSummary: createDeliveryRoleHandoffSummary(roleHandoffs, currentGate),
    roleHandoffs,
  };
}

function createDeliveryGate(project, definition) {
  const status = resolveDeliveryGateStatus(project, definition.id);
  return {
    ...definition,
    status,
    evidence: resolveDeliveryGateEvidence(project, definition.id, status),
  };
}

function createDeliveryRoleHandoffs(gates) {
  const groups = new Map();

  gates.forEach((gate) => {
    const role = gate.role || 'owner';
    const current = groups.get(role) || {
      role,
      roleLabel: DELIVERY_ROLE_LABELS[role] || role,
      gates: [],
    };
    current.gates.push(gate);
    groups.set(role, current);
  });

  return [...groups.values()]
    .map(createDeliveryRoleHandoff)
    .sort(
      (left, right) =>
        DELIVERY_ROLE_ORDER.indexOf(left.role) - DELIVERY_ROLE_ORDER.indexOf(right.role),
    );
}

function createDeliveryRoleHandoff(group) {
  const gates = group.gates || [];
  const completedGateCount = gates.filter((gate) => gate.status === 'complete').length;
  const blockedGateCount = gates.filter((gate) => gate.status === 'blocked').length;
  const missingGateCount = gates.filter((gate) => gate.status === 'missing').length;
  const currentGate =
    gates.find((gate) => gate.status === 'blocked') ||
    gates.find((gate) => gate.status === 'missing') ||
    null;
  const status = blockedGateCount ? 'blocked' : missingGateCount ? 'missing' : 'complete';

  return {
    role: group.role,
    roleLabel: group.roleLabel,
    status,
    gateCount: gates.length,
    completedGateCount,
    blockedGateCount,
    missingGateCount,
    currentGateId: currentGate?.id || '',
    currentGateLabel: currentGate?.label || '',
    gateIds: gates.map((gate) => gate.id),
    nextAction: resolveDeliveryRoleNextAction(group.roleLabel, status, currentGate),
    gates,
  };
}

function createDeliveryRoleHandoffSummary(roleHandoffs, currentGate) {
  const blockedRoleCount = roleHandoffs.filter((handoff) => handoff.status === 'blocked').length;
  const missingRoleCount = roleHandoffs.filter((handoff) => handoff.status === 'missing').length;
  const completedRoleCount = roleHandoffs.filter((handoff) => handoff.status === 'complete').length;
  const currentRole =
    roleHandoffs.find((handoff) => handoff.role === currentGate?.role) ||
    roleHandoffs.find((handoff) => handoff.status === 'blocked') ||
    roleHandoffs.find((handoff) => handoff.status === 'missing') ||
    roleHandoffs[0] ||
    null;

  return {
    totalRoleCount: roleHandoffs.length,
    blockedRoleCount,
    missingRoleCount,
    completedRoleCount,
    currentRole: currentRole?.role || '',
    currentRoleLabel: currentRole?.roleLabel || '',
    currentGateId: currentRole?.currentGateId || '',
    currentGateLabel: currentRole?.currentGateLabel || '',
  };
}

function resolveDeliveryRoleNextAction(roleLabel, status, currentGate) {
  if (status === 'complete') {
    return `${roleLabel}交接已完成，后续只需保持证据可追溯。`;
  }

  const gateLabel = currentGate?.label || '当前门禁';
  const evidence = currentGate?.evidence || '补齐缺失证据。';
  if (status === 'blocked') {
    return `${roleLabel}先处理${gateLabel}阻塞：${evidence}`;
  }

  return `${roleLabel}补齐${gateLabel}证据：${evidence}`;
}

function resolveDeliveryGateStatus(project, gateId) {
  if (gateId === 'requirements') {
    if (project.requirementReview?.status === 'ready') {
      return 'complete';
    }
    return ['needs-work', 'stale'].includes(project.requirementReview?.status) ? 'blocked' : 'missing';
  }

  if (gateId === 'prd') {
    if (project.prdStatus === 'generated' || hasArtifact(project, 'prd-approval')) {
      return 'complete';
    }
    return project.requirementReview?.status === 'needs-work' ? 'blocked' : 'missing';
  }

  if (gateId === 'technical-handoff') {
    return project.technicalHandoffStatus === 'generated' &&
      hasArtifact(project, 'architecture') &&
      hasArtifact(project, 'development') &&
      hasArtifact(project, 'ops-requirements') &&
      hasArtifact(project, 'qa')
      ? 'complete'
      : 'missing';
  }

  if (gateId === 'development-package') {
    return project.developmentPlan?.status === 'ready' ||
      project.agentExecutionPackage?.status === 'ready' ||
      project.developmentRun?.status === 'completed'
      ? 'complete'
      : 'missing';
  }

  if (gateId === 'development-run') {
    if (project.developmentRun?.status === 'completed') {
      return 'complete';
    }
    return project.developmentRun?.status === 'blocked' ? 'blocked' : 'missing';
  }

  if (gateId === 'review') {
    if (project.codeReviewReport?.status === 'passed') {
      return 'complete';
    }
    return project.codeReviewReport?.status === 'needs-work' ? 'blocked' : 'missing';
  }

  if (gateId === 'qa-evidence') {
    return project.qaEvidence?.status === 'ready' ? 'complete' : 'missing';
  }

  if (gateId === 'qa') {
    if (project.qaRun?.status === 'passed') {
      return 'complete';
    }
    return project.qaRun?.status === 'needs-work' ? 'blocked' : 'missing';
  }

  if (gateId === 'acceptance') {
    return project.acceptancePackage?.status === 'ready'
      ? 'complete'
      : project.acceptancePackage?.status === 'blocked'
        ? 'blocked'
        : 'missing';
  }

  if (gateId === 'signoff') {
    return project.acceptancePackage?.signoffStatus === 'signed-off' ? 'complete' : 'missing';
  }

  return 'missing';
}

function resolveDeliveryGateEvidence(project, gateId, status) {
  if (status === 'complete') {
    const completedEvidence = {
      requirements: '需求质量评审已通过。',
      prd: '需求文档已生成或已归档。',
      'technical-handoff': '架构、开发、运维和测试交接材料已生成。',
      'development-package': '开发任务包已就绪或开发已完成。',
      'development-run': `开发执行已完成${project.developmentRun?.commitHash ? `，提交 ${project.developmentRun.commitHash}` : ''}。`,
      review: '代码、安全和性能评审已通过。',
      'qa-evidence': '测试样本、时长、环境和浏览器范围已记录。',
      qa: `测试验证已通过 ${project.qaRun?.passedCount || 0}/${project.qaRun?.totalCount || 0} 个用例。`,
      acceptance: '最终验收包已生成。',
      signoff: '负责人已完成最终签收。',
    };
    return completedEvidence[gateId] || '该门禁已完成。';
  }

  const missingEvidence = {
    requirements: '尚未通过需求质量评审。',
    prd: '尚未生成需求文档。',
    'technical-handoff': '尚未生成完整技术、开发、运维和测试交接材料。',
    'development-package': '尚未生成可执行的开发任务包。',
    'development-run': '尚未完成自动开发执行。',
    review: '尚未通过代码、安全和性能评审。',
    'qa-evidence': '尚未补齐测试样本、时长、环境和浏览器范围。',
    qa: '尚未通过测试验证。',
    acceptance: '尚未生成最终验收包。',
    signoff: '负责人尚未签收最终交付包。',
  };

  if (gateId === 'qa' && project.qaRun?.defectRouting?.shouldReturnToDevelopment) {
    return 'QA 判定存在实现缺口，需要回流开发。';
  }

  return missingEvidence[gateId] || '该门禁仍需补齐证据。';
}

function resolveDeliveryAuditStatus(project, gates) {
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

function resolveDeliveryAuditNextAction(status, currentGate) {
  if (status === 'signed-off') {
    return '项目已签收，归档交付证据并持续观察生产准备状态。';
  }
  if (status === 'ready-for-signoff') {
    return '负责人复核最终验收包并完成签收。';
  }
  if (status === 'qa-return') {
    return '将 QA 缺陷回流到开发，并重新生成修复计划。';
  }

  const actions = {
    requirements: '先完成需求质量评审，确认需求可进入需求文档审批。',
    prd: '生成需求文档并提交负责人审批。',
    'technical-handoff': '生成技术、开发、运维和测试交接材料。',
    'development-package': '生成可执行的智能开发任务包。',
    'development-run': '启动自动开发执行并写回本地检查结果。',
    review: '运行代码、安全和性能评审，并处理阻塞发现。',
    'qa-evidence': '补齐测试样本、测试时长、测试环境和浏览器范围。',
    qa: '执行测试验证并关闭阻塞缺陷。',
    acceptance: '测试通过后生成最终验收包。',
    signoff: '负责人复核并签收最终交付包。',
  };

  return actions[currentGate?.id] || '继续推进当前交付门禁。';
}

function createGateBlockers(project, stageId, taskLedger) {
  return [
    createConfirmationBlocker(project, stageId, taskLedger),
    createArtifactBlocker(project, stageId),
  ].filter(Boolean);
}

function createConfirmationBlocker(project, stageId, taskLedger) {
  const summary = getStageConfirmationSummary(project, stageId);
  const missingItems = summary.missingItems || [];
  if (!missingItems.length) {
    return null;
  }

  return {
    id: 'stage-confirmations',
    type: 'confirmation',
    severity: 'high',
    title: 'Current-stage confirmations are incomplete',
    detail: missingItems.map((item) => item.title).filter(Boolean).join(', '),
    missingItemIds: missingItems.map((item) => item.id),
    taskIds: taskLedger.tasks.map((task) => task.id),
    requiredAction: `Complete ${missingItems.length} current-stage confirmation task(s).`,
  };
}

function createArtifactBlocker(project, stageId) {
  if (stageId === 'pm-requirements' && !project.prdApprovalReady) {
    return {
      id: 'prd-approval-readiness',
      type: 'artifact',
      severity: 'high',
      title: 'PRD is not ready for approval',
      detail: 'Requirement quality review and PRD generation must be completed first.',
      requiredAction: 'Run requirement quality review and generate the PRD draft.',
      details: {
        prdStatus: project.prdStatus || 'draft',
        requirementReviewStatus: project.requirementReview?.status || 'missing',
      },
    };
  }

  if (stageId === 'development' && project.developmentRun?.status !== 'completed') {
    return {
      id: 'development-run',
      type: 'execution',
      severity: 'high',
      title: 'Development execution is not complete',
      detail: 'AI development execution and local checks must complete before review.',
      requiredAction: 'Start development execution and pass the local development checks.',
      details: {
        developmentRunStatus: project.developmentRun?.status || 'missing',
      },
    };
  }

  if (stageId === 'review' && project.codeReviewReport?.status !== 'passed') {
    return {
      id: 'code-review',
      type: 'review',
      severity: 'high',
      title: 'Code review has not passed',
      detail: 'Code, security, and performance review must pass before QA.',
      requiredAction: 'Run code review and resolve blocking findings.',
      details: {
        codeReviewStatus: project.codeReviewReport?.status || 'missing',
      },
    };
  }

  if (stageId === 'qa' && project.qaRun?.status !== 'passed') {
    return {
      id: 'qa-run',
      type: 'test',
      severity: 'high',
      title: 'QA has not passed',
      detail: 'QA execution must pass before final acceptance.',
      requiredAction: 'Run QA and close blocking defects.',
      details: {
        qaRunStatus: project.qaRun?.status || 'missing',
      },
    };
  }

  if (stageId === 'acceptance' && project.acceptancePackage?.status !== 'ready') {
    return {
      id: 'acceptance-package',
      type: 'artifact',
      severity: 'high',
      title: 'Final acceptance package is not ready',
      detail: 'The final delivery package must be generated before sign-off.',
      requiredAction: 'Generate the final acceptance package.',
      details: {
        acceptancePackageStatus: project.acceptancePackage?.status || 'missing',
      },
    };
  }

  return null;
}

function findStage(project, stageId) {
  return (project.stages || []).find((stage) => stage.id === stageId) || null;
}

function findNextStage(project, stageId) {
  const stages = project.stages || [];
  const currentIndex = stages.findIndex((stage) => stage.id === stageId);
  if (currentIndex < 0) {
    return null;
  }
  if (stageId === 'qa' && project.qaRun?.status === 'passed') {
    return stages.find((stage) => stage.id === 'acceptance') || null;
  }
  return stages[currentIndex + 1] || null;
}

function isStageSignedOff(project, stageId) {
  return stageId === 'acceptance' && project.acceptancePackage?.signoffStatus === 'signed-off';
}

function createEmptyReport() {
  return {
    projectId: '',
    projectName: '',
    stageId: '',
    stageName: '',
    stageOwner: '',
    status: 'blocked',
    canAdvance: false,
    nextStageId: '',
    nextStageName: '',
    openTaskCount: 0,
    blockerCount: 0,
    blockers: [],
    requiredActions: [],
  };
}

function createEmptyDeliveryGateAudit() {
  return {
    projectId: '',
    projectName: '',
    status: 'blocked',
    completionPercent: 0,
    completedGateCount: 0,
    totalGateCount: 0,
    blockedGateCount: 0,
    missingGateCount: 0,
    currentGateId: '',
    currentGateLabel: '',
    nextAction: '',
    gates: [],
    roleHandoffSummary: {
      totalRoleCount: 0,
      blockedRoleCount: 0,
      missingRoleCount: 0,
      completedRoleCount: 0,
      currentRole: '',
      currentRoleLabel: '',
      currentGateId: '',
      currentGateLabel: '',
    },
    roleHandoffs: [],
  };
}

function hasArtifact(project, stageId) {
  return Boolean(String(project.artifacts?.[stageId] || '').trim());
}
