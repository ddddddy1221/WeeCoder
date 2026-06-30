import { STAGE_IDS } from './workflow.js';

const PHASE_DEFINITIONS = Object.freeze([
  {
    id: 'requirements',
    label: '需求确认',
    role: 'pm',
    roleLabel: '项目经理',
    stageId: STAGE_IDS.PM_REQUIREMENTS,
  },
  {
    id: 'prd',
    label: 'PRD 生成与审批',
    role: 'owner',
    roleLabel: '负责人',
    stageId: STAGE_IDS.PRD_APPROVAL,
  },
  {
    id: 'technical-handoff',
    label: '技术交接',
    role: 'tech-lead',
    roleLabel: '技术负责人',
    stageId: STAGE_IDS.ARCHITECTURE,
  },
  {
    id: 'ops-handoff',
    label: '运维交接',
    role: 'ops',
    roleLabel: '运维',
    stageId: STAGE_IDS.OPS_REQUIREMENTS,
  },
  {
    id: 'development',
    label: 'AI 开发执行',
    role: 'developer',
    roleLabel: 'AI 开发',
    stageId: STAGE_IDS.DEVELOPMENT,
  },
  {
    id: 'review',
    label: '代码/安全/性能评审',
    role: 'tech-lead',
    roleLabel: '技术负责人',
    stageId: STAGE_IDS.REVIEW,
  },
  {
    id: 'qa-evidence',
    label: '测试执行与证据',
    role: 'qa',
    roleLabel: '测试',
    stageId: STAGE_IDS.QA,
  },
  {
    id: 'qa-feedback-loop',
    label: 'QA 反馈回流',
    role: 'developer',
    roleLabel: 'AI 开发 / 测试',
    stageId: STAGE_IDS.DEFECT_LOOP,
  },
  {
    id: 'acceptance',
    label: '最终验收签收',
    role: 'owner',
    roleLabel: '负责人',
    stageId: STAGE_IDS.ACCEPTANCE,
  },
]);

export function createDeliveryFlowRehearsal(project = {}) {
  const phases = PHASE_DEFINITIONS.map((definition) => createPhase(project, definition));
  const completedPhaseCount = phases.filter((phase) => phase.status === 'complete').length;
  const blockedPhaseCount = phases.filter((phase) => phase.status === 'blocked').length;
  const missingPhaseCount = phases.filter((phase) => phase.status === 'missing').length;
  const activePhaseCount = phases.filter((phase) => phase.status === 'active').length;
  const currentPhase = selectCurrentPhase(phases, project);
  const status = resolveRehearsalStatus(project, currentPhase, {
    blockedPhaseCount,
    missingPhaseCount,
  });

  return {
    projectId: project.id || '',
    projectName: project.name || '',
    status,
    statusLabel: rehearsalStatusLabel(status),
    currentPhaseId: currentPhase?.id || '',
    currentPhaseLabel: currentPhase?.label || '',
    currentRole: currentPhase?.role || '',
    currentRoleLabel: currentPhase?.roleLabel || '',
    completedPhaseCount,
    totalPhaseCount: phases.length,
    blockedPhaseCount,
    missingPhaseCount,
    activePhaseCount,
    canDemoEndToEnd: status === 'signed-off',
    nextAction: resolveRehearsalNextAction(status, currentPhase),
    phases,
  };
}

function createPhase(project, definition) {
  const state = resolvePhaseState(project, definition.id);
  return {
    ...definition,
    ...state,
  };
}

function resolvePhaseState(project, phaseId) {
  if (phaseId === 'requirements') {
    if (project.requirementReview?.status === 'ready') {
      return complete('需求质量评审已通过。');
    }
    if (['needs-work', 'stale'].includes(project.requirementReview?.status)) {
      return blocked('需求评审仍有缺口。', '补齐项目经理需求答案并重新运行需求评审。');
    }
    return missing('尚未完成需求质量评审。', '先补齐需求确认并运行需求评审。');
  }

  if (phaseId === 'prd') {
    if (project.prdStatus === 'generated' || hasArtifact(project, STAGE_IDS.PRD_APPROVAL)) {
      return complete('PRD 已生成并可作为后续开发输入。');
    }
    return missing('尚未生成 PRD。', '生成 PRD 并提交负责人审批。');
  }

  if (phaseId === 'technical-handoff') {
    if (
      project.technicalHandoffStatus === 'generated' &&
      hasArtifact(project, STAGE_IDS.ARCHITECTURE) &&
      hasArtifact(project, STAGE_IDS.DEVELOPMENT)
    ) {
      return complete('技术方案和开发交接材料已生成。');
    }
    return missing('尚未生成技术和开发交接材料。', '从 PRD 生成技术方案、开发任务和接口约束。');
  }

  if (phaseId === 'ops-handoff') {
    if (hasArtifact(project, STAGE_IDS.OPS_REQUIREMENTS)) {
      return complete('运维需求和运行环境交接已归档。');
    }
    return missing('缺少运维交接材料。', '补齐 RTSP、服务器、启动停止、日志和告警要求。');
  }

  if (phaseId === 'development') {
    if (project.developmentRun?.status === 'completed') {
      return complete(
        `开发执行已完成${project.developmentRun?.commitHash ? `，提交 ${project.developmentRun.commitHash}` : ''}。`,
      );
    }
    if (['blocked', 'failed', 'needs-work'].includes(project.developmentRun?.status)) {
      return blocked('开发执行存在阻塞。', '处理开发执行失败原因并重新运行验证命令。');
    }
    if (project.developmentRun?.status === 'running') {
      return active('开发执行正在进行。', '等待开发执行和本地检查结果。');
    }
    return missing('尚未完成 AI 开发执行。', '生成开发任务包并启动 AI coding 执行。');
  }

  if (phaseId === 'review') {
    if (project.codeReviewReport?.status === 'passed') {
      return complete('代码、安全和性能评审已通过。');
    }
    if (project.codeReviewReport?.status === 'needs-work') {
      return blocked('代码评审存在阻塞。', '修复评审阻塞项后重新提交 Review。');
    }
    return missing('尚未完成代码、安全和性能评审。', '运行 Review 并形成可追溯评审证据。');
  }

  if (phaseId === 'qa-evidence') {
    if (project.qaEvidence?.status === 'ready' && project.qaRun?.status) {
      return complete(
        `测试证据已记录，QA 用例 ${project.qaRun.passedCount || 0}/${project.qaRun.totalCount || 0} 通过。`,
      );
    }
    if (project.qaRun?.status === 'needs-work') {
      return blocked('QA 已执行但测试证据不完整。', '补齐测试样本、时长、环境和浏览器范围。');
    }
    return missing('尚未完成测试执行与证据记录。', '运行 QA 并记录测试样本、时长、环境和浏览器范围。');
  }

  if (phaseId === 'qa-feedback-loop') {
    if (project.defectFixPackage?.status === 'closed') {
      return complete('QA 回流缺陷已修复并通过复测。');
    }
    if (project.qaRun?.status === 'passed') {
      return complete('QA 未产生需回流开发的缺陷。');
    }
    if (project.qaRun?.defectRouting?.shouldReturnToDevelopment) {
      return blocked(
        createQaReturnEvidence(project),
        '将 QA 缺陷回流到开发，生成修复计划并完成复测。',
      );
    }
    if (['ready', 'reviewing', 'qa-retest'].includes(project.defectFixPackage?.status)) {
      return active('QA 缺陷修复闭环正在进行。', '完成修复 Review 和 QA 复测。');
    }
    return missing('尚未形成 QA 回流判断。', '先执行 QA，再按缺陷结果决定是否回流开发。');
  }

  if (phaseId === 'acceptance') {
    if (project.acceptancePackage?.signoffStatus === 'signed-off') {
      return complete(`负责人 ${project.acceptancePackage?.signedOffBy || ''} 已完成最终签收。`);
    }
    if (project.acceptancePackage?.status === 'ready') {
      return active('最终验收包已生成，等待负责人签收。', '负责人复核验收包并完成签收。');
    }
    if (project.acceptancePackage?.status === 'blocked') {
      return blocked('最终验收包存在缺失材料。', '补齐验收包缺失项后重新生成。');
    }
    return missing('尚未生成最终验收包。', 'QA 通过后生成最终验收包。');
  }

  return missing('尚未记录该环节证据。', '补齐该环节证据。');
}

function selectCurrentPhase(phases, project) {
  if (project.acceptancePackage?.signoffStatus === 'signed-off') {
    return phases.find((phase) => phase.id === 'acceptance') || phases[phases.length - 1];
  }

  return (
    phases.find((phase) => phase.status === 'blocked') ||
    phases.find((phase) => phase.status === 'active') ||
    phases.find((phase) => phase.status === 'missing') ||
    phases[phases.length - 1]
  );
}

function resolveRehearsalStatus(project, currentPhase, { blockedPhaseCount, missingPhaseCount }) {
  if (project.acceptancePackage?.signoffStatus === 'signed-off') {
    return 'signed-off';
  }
  if (currentPhase?.id === 'qa-feedback-loop' && currentPhase.status === 'blocked') {
    return 'qa-return';
  }
  if (blockedPhaseCount > 0) {
    return 'blocked';
  }
  if (project.acceptancePackage?.status === 'ready') {
    return 'ready-for-signoff';
  }
  return missingPhaseCount > 0 ? 'in-progress' : 'ready-for-signoff';
}

function resolveRehearsalNextAction(status, currentPhase) {
  if (status === 'signed-off') {
    return '完整链路已闭环，可复盘需求、开发、测试和验收证据。';
  }
  if (status === 'ready-for-signoff') {
    return '负责人复核最终验收包并完成签收。';
  }
  if (status === 'qa-return') {
    return '将 QA 缺陷回流到开发，生成修复计划并完成复测。';
  }
  return currentPhase?.nextAction || '继续补齐当前链路证据。';
}

function rehearsalStatusLabel(status) {
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

function complete(evidence) {
  return {
    status: 'complete',
    evidence,
    nextAction: '',
  };
}

function active(evidence, nextAction) {
  return {
    status: 'active',
    evidence,
    nextAction,
  };
}

function blocked(evidence, nextAction) {
  return {
    status: 'blocked',
    evidence,
    nextAction,
  };
}

function missing(evidence, nextAction) {
  return {
    status: 'missing',
    evidence,
    nextAction,
  };
}

function createQaReturnEvidence(project) {
  const reasons = normalizeStringList(project.qaRun?.defectRouting?.reasons);
  return reasons.length
    ? `QA 判定需要回流开发：${reasons.join('；')}`
    : 'QA 判定存在实现缺口，需要回流开发。';
}

function hasArtifact(project, stageId) {
  return Boolean(String(project.artifacts?.[stageId] || '').trim());
}

function normalizeStringList(items = []) {
  return Array.isArray(items) ? items.map((item) => String(item || '').trim()).filter(Boolean) : [];
}
