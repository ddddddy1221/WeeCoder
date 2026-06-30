import {
  BUSINESS_SKILLS,
  createRequirementReviewArtifact,
  evaluateRequirementQuality,
  isPrdApprovalReady,
} from './deliverySkills.js';
import {
  createTechnicalHandoffBundle,
  normalizeTechnicalHandoffBundle,
} from './technicalHandoff.js';
import { createStageRiskRegister } from './stageRiskRegister.js';
import {
  createStageConfirmationRegister,
  getStageConfirmationSummary,
  normalizeStageConfirmationRegister,
  updateStageConfirmationItem,
} from './stageConfirmations.js';
import { createDevelopmentPlan, normalizeDevelopmentPlan } from './developmentPlan.js';
import {
  createDevelopmentChangePackage,
  createDevelopmentRun,
  normalizeDevelopmentRun,
} from './developmentRun.js';
import {
  createAgentExecutionPackage,
  normalizeAgentExecutionPackage,
} from './agentExecutionPackage.js';
import { normalizeRepositoryConfig } from './repositoryConfig.js';
import { normalizeCodeReviewReport } from './codeReviewReport.js';
import {
  normalizeQaCoveragePlan,
  normalizeQaDefectRouting,
  normalizeQaReviewHandoff,
  normalizeQaRun,
} from './qaRun.js';
import { normalizeQaEvidence } from './qaEvidence.js';
import {
  addYoloQaDetectionEvent,
  completeYoloQaSession,
  createYoloQaSession,
  normalizeYoloQaSession,
  reviewYoloQaDetectionEvent,
} from './yoloQaSession.js';
import {
  createAcceptancePackage,
  normalizeAcceptancePackage,
  signOffAcceptancePackage,
} from './acceptancePackage.js';
import {
  createDefaultProjectMembers,
  normalizeProjectMembers,
} from './projectMembers.js';
import { isYoloCameraProject } from './yoloDeliveryChain.js';

export const STAGE_IDS = Object.freeze({
  INTAKE: 'intake',
  PM_REQUIREMENTS: 'pm-requirements',
  PRD_APPROVAL: 'prd-approval',
  ARCHITECTURE: 'architecture',
  OPS_REQUIREMENTS: 'ops-requirements',
  DEVELOPMENT: 'development',
  REVIEW: 'review',
  QA: 'qa',
  DEFECT_LOOP: 'defect-loop',
  ACCEPTANCE: 'acceptance',
});

export class WorkflowGateError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = 'WorkflowGateError';
    this.details = details;
  }
}

export const REQUIREMENT_QUESTIONS = Object.freeze([
  {
    id: 'users',
    label: '目标用户',
    prompt: '谁会使用这个系统？请区分主要用户、管理用户和外部用户。',
    placeholder: '例如：客户、客服专员、客服主管、系统管理员',
  },
  {
    id: 'scenarios',
    label: '核心场景',
    prompt: '本期必须支持哪些核心业务场景？按用户动作列出来。',
    placeholder: '例如：提交工单、分配工单、回复工单、关闭工单',
  },
  {
    id: 'successMetrics',
    label: '成功指标',
    prompt: '项目上线后如何判断成功？请给出可验证指标。',
    placeholder: '例如：平均处理时长降低 30%，客户自助查询覆盖 80% 常见问题',
  },
  {
    id: 'scope',
    label: '范围边界',
    prompt: '本期做什么，不做什么？请明确非目标。',
    placeholder: '例如：本期不做移动端 App，不做智能客服机器人',
  },
  {
    id: 'data',
    label: '数据与权限',
    prompt: '需要哪些数据、权限、审批或合规限制？',
    placeholder: '例如：客户资料只读，财务字段仅主管可见，操作全量审计',
  },
  {
    id: 'integrations',
    label: '外部依赖',
    prompt: '需要对接哪些系统、第三方服务或内部接口？',
    placeholder: '例如：CRM、订单系统、短信服务、企业微信',
  },
]);

export const STAGES = Object.freeze([
  {
    id: STAGE_IDS.INTAKE,
    name: '项目入口',
    owner: '负责人',
    description: '创建项目、明确业务目标、范围和发起人。',
    checklist: ['填写项目名称', '明确发起人', '写清业务目标', '说明当前痛点'],
  },
  {
    id: STAGE_IDS.PM_REQUIREMENTS,
    name: '项目经理需求',
    owner: '项目经理',
    description: '逐轮澄清需求，形成 PRD、验收标准和范围边界。',
    checklist: ['识别用户角色', '拆分核心场景', '明确非目标', '定义验收标准'],
  },
  {
    id: STAGE_IDS.PRD_APPROVAL,
    name: 'PRD 审批',
    owner: '负责人',
    description: '负责人确认需求完整性、优先级和交付范围。',
    checklist: ['检查目标一致性', '确认范围边界', '确认验收标准', '审批进入技术设计'],
    rejectTo: STAGE_IDS.PM_REQUIREMENTS,
  },
  {
    id: STAGE_IDS.ARCHITECTURE,
    name: '架构与数据设计',
    owner: '技术负责人',
    description: '确认系统方案、接口、数据库表、风险和开发任务。',
    checklist: ['设计模块边界', '定义 API', '设计数据库表', '拆分开发任务'],
  },
  {
    id: STAGE_IDS.OPS_REQUIREMENTS,
    name: '运维需求',
    owner: '运维',
    description: '确认服务器、环境变量、依赖服务、日志监控和回滚方案。',
    checklist: ['列出资源规格', '列出环境变量', '列出依赖服务', '定义监控与回滚'],
  },
  {
    id: STAGE_IDS.DEVELOPMENT,
    name: '自动开发',
    owner: 'AI 开发',
    description: '按任务开发，实现代码、自测并提交变更说明。',
    checklist: ['读取 PRD 和技术方案', '按任务实现', '运行单元测试', '输出变更说明'],
  },
  {
    id: STAGE_IDS.REVIEW,
    name: '代码/安全/性能 Review',
    owner: '技术负责人',
    description: '检查代码质量、安全风险、性能风险和可维护性。',
    checklist: ['代码 review', '安全检查', '性能检查', '可维护性检查'],
    rejectTo: STAGE_IDS.DEVELOPMENT,
  },
  {
    id: STAGE_IDS.QA,
    name: '测试',
    owner: '测试',
    description: '生成测试用例、执行自动测试、记录缺陷和测试结论。',
    checklist: ['编写测试用例', '执行自动测试', '记录缺陷', '输出测试报告'],
    rejectTo: STAGE_IDS.DEVELOPMENT,
  },
  {
    id: STAGE_IDS.DEFECT_LOOP,
    name: '缺陷回归',
    owner: 'AI 开发 / 测试',
    description: '修复测试缺陷，重新验证关键路径。',
    checklist: ['确认缺陷范围', '修复缺陷', '补充回归测试', '验证通过'],
    rejectTo: STAGE_IDS.DEVELOPMENT,
  },
  {
    id: STAGE_IDS.ACCEPTANCE,
    name: '最终验收',
    owner: '负责人',
    description: '汇总交付结果、发布说明、运维交接和验收结论。',
    checklist: ['确认测试通过', '确认运维交接', '确认发布说明', '归档交付报告'],
  },
]);

export function createProject({ name, sponsor, summary }) {
  const now = new Date().toISOString();
  const project = {
    id: makeProjectId(name),
    name: cleanRequired(name, '项目名称'),
    sponsor: cleanRequired(sponsor, '负责人'),
    summary: cleanRequired(summary, '项目概要'),
    currentStageId: STAGE_IDS.INTAKE,
    health: 'on-track',
    prdStatus: 'draft',
    prdApprovalReady: false,
    prdVersion: null,
    prdRequirementSnapshot: null,
    prdChangeImpact: null,
    technicalHandoffStatus: 'draft',
    members: createDefaultProjectMembers(),
    stageConfirmations: createStageConfirmationRegister(STAGES),
    businessSkills: BUSINESS_SKILLS.map((skill) => ({ ...skill })),
    requirementReview: null,
    requirementQuestions: REQUIREMENT_QUESTIONS.map((question) => ({ ...question })),
    requirementAnswers: {},
    repositoryConfig: normalizeRepositoryConfig(),
    createdAt: now,
    updatedAt: now,
    stages: STAGES.map((stage, index) => ({
      id: stage.id,
      name: stage.name,
      owner: stage.owner,
      description: stage.description,
      checklist: [...stage.checklist],
      status: index === 0 ? 'active' : 'queued',
    })),
    artifacts: {},
    risks: [
      '真实 AI coding、服务器开通和部署执行尚未接入；当前版本先验证业务流转和审批闭环。',
    ],
    history: [],
  };

  project.artifacts[STAGE_IDS.INTAKE] = generateArtifact(project, STAGE_IDS.INTAKE);
  project.artifacts[STAGE_IDS.PM_REQUIREMENTS] = generateRequirementDraft(project);
  project.stageRiskRegister = createStageRiskRegister(project, STAGES);
  return project;
}

export function advanceProject(project, { actor = '系统', note = '', archiveVersion = '' } = {}) {
  const currentIndex = findStageIndex(project, project.currentStageId);
  assertStageConfirmationsReady(project, project.currentStageId);

  if (project.currentStageId === STAGE_IDS.PM_REQUIREMENTS && !isPrdApprovalReady(project)) {
    throw new WorkflowGateError('PRD 审批提交失败：请先通过需求质检并生成 PRD 草稿。', {
      prdStatus: project.prdStatus || 'draft',
      requirementReviewStatus: project.requirementReview?.status || 'missing',
    });
  }

  if (project.currentStageId === STAGE_IDS.DEVELOPMENT && project.developmentRun?.status !== 'completed') {
    throw new WorkflowGateError('自动开发尚未完成：请先启动开发执行并通过本地检查。', {
      developmentRunStatus: project.developmentRun?.status || 'missing',
    });
  }

  if (project.currentStageId === STAGE_IDS.REVIEW && project.codeReviewReport?.status !== 'passed') {
    throw new WorkflowGateError('代码 Review 未通过：请先完成代码/安全/性能 Review。', {
      codeReviewStatus: project.codeReviewReport?.status || 'missing',
    });
  }

  if (project.currentStageId === STAGE_IDS.QA && project.qaRun?.status !== 'passed') {
    throw new WorkflowGateError('测试未通过：请先完成 QA 测试并处理阻塞项。', {
      qaRunStatus: project.qaRun?.status || 'missing',
    });
  }

  if (
    project.currentStageId === STAGE_IDS.ACCEPTANCE &&
    normalizeAcceptancePackage(project.acceptancePackage).status !== 'ready'
  ) {
    throw new WorkflowGateError('最终验收包尚未就绪：请先生成最终验收包，再完成项目验收。', {
      acceptancePackageStatus: normalizeAcceptancePackage(project.acceptancePackage).status,
    });
  }

  if (currentIndex === project.stages.length - 1) {
    if (project.currentStageId === STAGE_IDS.ACCEPTANCE) {
      return completeAcceptanceProject(project, { actor, note, archiveVersion });
    }

    return updateProject(project, {
      historyEvent: {
        type: 'complete',
        from: project.currentStageId,
        to: project.currentStageId,
        actor,
        note: note || '项目已完成最终验收',
      },
    });
  }

  const nextStage = findNextStage(project, currentIndex);
  return updateProject(project, {
    currentStageId: nextStage.id,
    stageUpdates: [
      { id: project.currentStageId, status: 'approved' },
      { id: nextStage.id, status: 'active' },
    ],
    artifactStageId: nextStage.id,
    historyEvent: {
      type: 'advance',
      from: project.currentStageId,
      to: nextStage.id,
      actor,
      note,
    },
  });
}

function findNextStage(project, currentIndex) {
  if (project.currentStageId === STAGE_IDS.QA && project.qaRun?.status === 'passed') {
    return project.stages.find((stage) => stage.id === STAGE_IDS.ACCEPTANCE);
  }

  return project.stages[currentIndex + 1];
}

function assertStageConfirmationsReady(project, stageId) {
  const summary = getStageConfirmationSummary(project, stageId);
  const missingItems = summary.missingItems || [];
  if (!missingItems.length) {
    return;
  }

  throw new WorkflowGateError(
    `阶段确认事项未补齐：${missingItems.map((item) => item.title).join('、')}`,
    {
      stageId,
      missingItemIds: missingItems.map((item) => item.id),
      missingItems,
    },
  );
}

function completeAcceptanceProject(project, { actor = '负责人', note = '', archiveVersion = '' } = {}) {
  const now = new Date().toISOString();
  const signedPackage = signOffAcceptancePackage(project.acceptancePackage, {
    actor,
    opinion: note || '验收通过，交付包归档。',
    archiveVersion,
    signedAt: now,
  });
  const next = {
    ...project,
    acceptancePackage: signedPackage,
    updatedAt: now,
    stages: project.stages.map((stage) =>
      stage.id === STAGE_IDS.ACCEPTANCE ? { ...stage, status: 'approved' } : stage,
    ),
    artifacts: {
      ...project.artifacts,
      [STAGE_IDS.ACCEPTANCE]: createAcceptancePackageArtifact(project, signedPackage),
    },
    history: [
      {
        type: 'complete',
        from: STAGE_IDS.ACCEPTANCE,
        to: STAGE_IDS.ACCEPTANCE,
        actor,
        note: signedPackage.signoffOpinion,
        at: now,
      },
      ...project.history,
    ],
  };

  next.stageRiskRegister = createStageRiskRegister(next, STAGES);
  return next;
}

export function rejectProjectStage(project, { actor = '系统', note = '' } = {}) {
  const currentIndex = findStageIndex(project, project.currentStageId);
  const currentDefinition = STAGES[currentIndex];
  const targetStageId = currentDefinition.rejectTo || project.stages[Math.max(0, currentIndex - 1)].id;

  return updateProject(project, {
    currentStageId: targetStageId,
    stageUpdates: [
      { id: project.currentStageId, status: 'blocked' },
      { id: targetStageId, status: 'active' },
    ],
    artifactStageId: targetStageId,
    historyEvent: {
      type: 'reject',
      from: project.currentStageId,
      to: targetStageId,
      actor,
      note,
    },
  });
}

export function answerRequirementQuestion(project, { questionId, answer, actor = '项目经理' }) {
  const question = REQUIREMENT_QUESTIONS.find((item) => item.id === questionId);
  if (!question) {
    throw new Error(`未知需求问题: ${questionId}`);
  }

  const cleanedAnswer = cleanRequired(answer, '需求回答');
  const now = new Date().toISOString();
  const previousAnswers = project.requirementAnswers || {};
  const requirementAnswers = {
    ...previousAnswers,
    [questionId]: cleanedAnswer,
  };
  const answerChanged = String(previousAnswers[questionId] || '') !== cleanedAnswer;
  const prdChangeImpact = createPrdChangeImpact({ ...project, requirementAnswers });
  const hasGeneratedPrd =
    project.prdStatus === 'generated' || Boolean(project.prdVersion || project.prdRequirementSnapshot);
  const hasPrdImpact = prdChangeImpact?.status === 'stale';
  const shouldInvalidateReview = Boolean(project.requirementReview) && answerChanged;
  const next = {
    ...project,
    prdStatus: hasGeneratedPrd ? (hasPrdImpact ? 'draft' : project.prdStatus) : 'draft',
    prdApprovalReady: hasPrdImpact ? false : project.prdApprovalReady,
    prdVersion: hasPrdImpact && project.prdVersion ? { ...project.prdVersion, status: 'stale' } : project.prdVersion,
    prdChangeImpact,
    requirementReview: shouldInvalidateReview
      ? {
          ...project.requirementReview,
          status: 'stale',
          staleReason: '需求答案已更新，请重新运行 AI 需求评审。',
        }
      : project.requirementReview,
    updatedAt: now,
    requirementQuestions: project.requirementQuestions || REQUIREMENT_QUESTIONS.map((item) => ({ ...item })),
    requirementAnswers,
    artifacts: { ...project.artifacts },
    history: [
      {
        type: 'requirement-answer',
        from: project.currentStageId,
        to: project.currentStageId,
        actor,
        note: question.label,
        prdImpactStatus: prdChangeImpact?.status || 'none',
        changedQuestionIds: prdChangeImpact?.changedQuestionIds || [],
        at: now,
      },
      ...project.history,
    ],
  };

  next.artifacts[STAGE_IDS.PM_REQUIREMENTS] = generateRequirementDraft(next);
  next.stageRiskRegister = createStageRiskRegister(next, STAGES);
  return next;
}

export function applyRequirementReview(
  project,
  {
    actor = 'AI 项目助理',
    review = evaluateRequirementQuality(project),
    provider = 'local-rule',
    providerError = '',
  } = {},
) {
  const now = new Date().toISOString();
  const requirementReview = {
    ...review,
    provider,
    providerError,
    reviewedAt: now,
  };
  const next = {
    ...project,
    requirementReview,
    prdApprovalReady: isPrdApprovalReady({ ...project, requirementReview }),
    updatedAt: now,
    artifacts: { ...project.artifacts },
    history: [
      {
        type: 'requirement-review',
        from: project.currentStageId,
        to: project.currentStageId,
        actor,
        note: requirementReview.status === 'ready' ? '需求质检通过' : '需求质检发现待补充项',
        at: now,
      },
      ...project.history,
    ],
  };

  next.artifacts.requirementReview = createRequirementReviewArtifact(next, requirementReview);
  next.stageRiskRegister = createStageRiskRegister(next, STAGES);
  return next;
}

export function generatePrdForProject(
  project,
  { actor = '项目经理', artifact = '', provider = 'local-rule', providerError = '' } = {},
) {
  const now = new Date().toISOString();
  const next = {
    ...project,
    prdStatus: 'generated',
    prdProvider: provider,
    prdProviderError: providerError,
    prdGeneratedAt: now,
    updatedAt: now,
    requirementQuestions: project.requirementQuestions || REQUIREMENT_QUESTIONS.map((item) => ({ ...item })),
    requirementAnswers: project.requirementAnswers || {},
    artifacts: { ...project.artifacts },
    history: [
      {
        type: 'prd-generated',
        from: project.currentStageId,
        to: STAGE_IDS.PRD_APPROVAL,
        actor,
        note: '已根据需求澄清内容生成 PRD',
        at: now,
      },
      ...project.history,
    ],
  };
  const prdArtifact = String(artifact || '').trim() || generatePrdArtifact(next);
  const prdVersion = createNextPrdVersion(project, { actor, generatedAt: now });
  const prdRequirementSnapshot = createPrdRequirementSnapshot(next, prdVersion);
  next.artifacts[STAGE_IDS.PM_REQUIREMENTS] = prdArtifact;
  next.artifacts[STAGE_IDS.PRD_APPROVAL] = prdArtifact;
  next.prdVersion = prdVersion;
  next.prdRequirementSnapshot = prdRequirementSnapshot;
  next.prdChangeImpact = createCurrentPrdChangeImpact(prdVersion);
  next.prdApprovalReady = isPrdApprovalReady(next);
  next.stageRiskRegister = createStageRiskRegister(next, STAGES);
  return next;
}

export function generateTechnicalHandoffForProject(
  project,
  {
    actor = '技术负责人',
    bundle = createTechnicalHandoffBundle(project),
    provider = 'local-rule',
    providerError = '',
  } = {},
) {
  const now = new Date().toISOString();
  const normalizedBundle = normalizeTechnicalHandoffBundle(bundle, project);
  const next = {
    ...project,
    technicalHandoffStatus: 'generated',
    technicalHandoffProvider: provider,
    technicalHandoffProviderError: providerError,
    technicalHandoffGeneratedAt: now,
    updatedAt: now,
    artifacts: {
      ...project.artifacts,
      [STAGE_IDS.ARCHITECTURE]: normalizedBundle.architectureArtifact,
      [STAGE_IDS.DEVELOPMENT]: normalizedBundle.developmentArtifact,
      [STAGE_IDS.OPS_REQUIREMENTS]: normalizedBundle.opsArtifact,
      [STAGE_IDS.QA]: normalizedBundle.qaArtifact,
    },
    history: [
      {
        type: 'technical-handoff-generated',
        from: project.currentStageId,
        to: STAGE_IDS.ARCHITECTURE,
        actor,
        note: '已根据 PRD 生成架构、开发、运维和测试交接包',
        at: now,
      },
      ...project.history,
    ],
  };
  next.stageRiskRegister = createStageRiskRegister(next, STAGES);
  next.developmentPlan = {
    ...createDevelopmentPlan(next, normalizedBundle.developmentArtifact),
    generatedAt: now,
    provider,
  };
  return next;
}

export function startDevelopmentRunForProject(
  project,
  { actor = 'AI 开发', provider = 'local-rule' } = {},
) {
  const normalizedProject = normalizeProject(project);
  if (normalizedProject.currentStageId !== STAGE_IDS.DEVELOPMENT) {
    throw new WorkflowGateError('只能在自动开发阶段启动开发执行。', {
      currentStageId: normalizedProject.currentStageId,
      requiredStageId: STAGE_IDS.DEVELOPMENT,
    });
  }

  assertAgentPackageCanStart(normalizedProject);

  const now = new Date().toISOString();
  const developmentRun = createDevelopmentRun(normalizedProject, { actor, provider });

  return {
    ...normalizedProject,
    updatedAt: now,
    developmentPlan: {
      ...normalizedProject.developmentPlan,
      status: 'running',
      lastRunId: developmentRun.id,
    },
    developmentRun,
    history: [
      {
        type: 'development-run-created',
        from: STAGE_IDS.DEVELOPMENT,
        to: STAGE_IDS.DEVELOPMENT,
        actor,
        note: '已生成开发执行包，等待真实代码执行器接入',
        at: now,
      },
      ...normalizedProject.history,
    ],
  };
}

function assertAgentPackageCanStart(project) {
  const agentPackage = project.agentExecutionPackage;
  if (!agentPackage) {
    throw new WorkflowGateError('请先生成 AI 开发任务包，再启动开发执行。', {
      missing: 'agentExecutionPackage',
    });
  }

  if (!agentPackage.canStart || agentPackage.status !== 'ready') {
    const blockers = normalizeStringList(agentPackage.blockers);
    throw new WorkflowGateError(
      `AI 开发任务包不可启动：${blockers.join('；') || '请先处理启动门禁。'}`,
      {
        agentPackageStatus: agentPackage.status || 'blocked',
        blockers,
      },
    );
  }
}

export function recordDevelopmentCheckResultsForProject(
  project,
  { actor = 'Local Runner', checks = [] } = {},
) {
  const now = new Date().toISOString();
  const normalizedProject = normalizeProject(project);
  if (!normalizedProject.developmentRun) {
    throw new WorkflowGateError('需要先启动开发执行。', {
      currentStageId: normalizedProject.currentStageId,
    });
  }

  const incomingRun = normalizeDevelopmentRun({
    ...normalizedProject.developmentRun,
    checks,
  });
  const incomingChecks = incomingRun.checks;
  const incomingByCommand = new Map(incomingChecks.map((check) => [check.command, check]));
  const existingCommands = new Set(
    (normalizedProject.developmentRun.checks || []).map((check) => check.command),
  );
  const mergedChecks = [
    ...(normalizedProject.developmentRun.checks || []).map((check) =>
      incomingByCommand.get(check.command) || check,
    ),
    ...incomingChecks.filter((check) => !existingCommands.has(check.command)),
  ];
  const hasChecks = mergedChecks.length > 0;
  const hasBlockedChecks = mergedChecks.some((check) => ['failed', 'blocked'].includes(check.status));
  const allChecksPassed = hasChecks && mergedChecks.every((check) => check.status === 'passed');
  const runStatus = allChecksPassed ? 'completed' : hasBlockedChecks ? 'blocked' : 'running';
  const planStatus = allChecksPassed ? 'done' : hasBlockedChecks ? 'blocked' : 'running';
  const blockers = buildDevelopmentCheckBlockers(mergedChecks);
  const nextActions = buildDevelopmentCheckNextActions(mergedChecks);
  const runAfterChecks = {
    ...normalizedProject.developmentRun,
    status: runStatus,
    checks: mergedChecks,
    completedAt: allChecksPassed || hasBlockedChecks ? now : normalizedProject.developmentRun.completedAt,
    blockers,
    nextActions,
  };
  const changePackage = allChecksPassed
    ? createDevelopmentChangePackage(runAfterChecks, { createdAt: now })
    : normalizedProject.developmentRun.changePackage || null;

  const next = {
    ...normalizedProject,
    updatedAt: now,
    health: hasBlockedChecks ? 'at-risk' : normalizedProject.health,
    developmentPlan: {
      ...normalizedProject.developmentPlan,
      status: planStatus,
    },
    developmentRun: {
      ...runAfterChecks,
      changePackage,
    },
    artifacts: {
      ...normalizedProject.artifacts,
      ...(allChecksPassed ? { [STAGE_IDS.REVIEW]: createDevelopmentChangePackageArtifact(normalizedProject, changePackage) } : {}),
    },
    history: [
      {
        type: 'development-checks-finished',
        from: STAGE_IDS.DEVELOPMENT,
        to: STAGE_IDS.DEVELOPMENT,
        actor,
        note: allChecksPassed ? '本地检查全部通过' : '本地检查存在失败或阻塞',
        at: now,
      },
      ...normalizedProject.history,
    ],
  };

  const transitioned = maybeSubmitDefectFixForReview(next, {
    actor,
    now,
    allChecksPassed,
    changePackage,
  });

  transitioned.stageRiskRegister = createStageRiskRegister(transitioned, STAGES);
  return transitioned;
}

function maybeSubmitDefectFixForReview(
  project,
  { actor, now, allChecksPassed = false, changePackage = null } = {},
) {
  if (
    !allChecksPassed ||
    !project.defectFixPackage ||
    project.currentStageId !== STAGE_IDS.DEVELOPMENT ||
    changePackage?.status !== 'ready-for-review' ||
    changePackage.reviewGate?.canStartReview !== true
  ) {
    return project;
  }

  const defectFixPackage = normalizeDefectFixPackage({
    ...project.defectFixPackage,
    status: 'reviewing',
    repairSubmission: {
      ...project.defectFixPackage.repairSubmission,
      status: 'reviewing',
      submittedAt: now,
      submittedBy: actor,
      commitHash: changePackage.commitHash,
      sourceStageId: STAGE_IDS.DEVELOPMENT,
      targetStageId: STAGE_IDS.REVIEW,
      requiredGates: ['code-review', 'qa-retest'],
    },
  });
  const next = {
    ...project,
    currentStageId: STAGE_IDS.REVIEW,
    defectFixPackage,
    stages: project.stages.map((stage) => {
      if (stage.id === STAGE_IDS.DEVELOPMENT) {
        return { ...stage, status: 'approved' };
      }
      if (stage.id === STAGE_IDS.REVIEW) {
        return { ...stage, status: 'active' };
      }
      if (stage.id === STAGE_IDS.QA) {
        return { ...stage, status: 'queued' };
      }
      return stage;
    }),
    history: [
      {
        type: 'qa-fix-submitted-for-review',
        from: STAGE_IDS.DEVELOPMENT,
        to: STAGE_IDS.REVIEW,
        actor,
        note: 'QA defect fix submitted for code review and retest gating.',
        at: now,
      },
      ...project.history,
    ],
  };

  return {
    ...next,
    artifacts: {
      ...next.artifacts,
      [STAGE_IDS.DEFECT_LOOP]: createDefectLoopArtifact(next, defectFixPackage),
    },
  };
}

export function recordDevelopmentExecutionResultsForProject(
  project,
  { actor = 'AI 开发', execution = {} } = {},
) {
  const now = new Date().toISOString();
  const normalizedProject = normalizeProject(project);
  if (!normalizedProject.developmentRun) {
    throw new WorkflowGateError('需要先启动开发执行。', {
      currentStageId: normalizedProject.currentStageId,
    });
  }

  const executionStatus = execution.status === 'completed' ? 'completed' : 'blocked';
  const hasExecutionBlockers = executionStatus !== 'completed' || normalizeStringList(execution.blockers).length > 0;
  const blockers = hasExecutionBlockers
    ? normalizeStringList(execution.blockers)
    : ['检查命令尚未运行：请运行本地检查后再进入 Review。'];
  const nextActions = normalizeStringList(execution.nextActions).length
    ? normalizeStringList(execution.nextActions)
    : ['运行检查命令，确认本地实现可测试、可构建且依赖无漏洞。'];

  const next = {
    ...normalizedProject,
    updatedAt: now,
    health: hasExecutionBlockers && executionStatus !== 'completed' ? 'at-risk' : normalizedProject.health,
    developmentPlan: {
      ...normalizedProject.developmentPlan,
      status: executionStatus === 'completed' ? 'running' : 'blocked',
    },
    developmentRun: {
      ...normalizedProject.developmentRun,
      status: executionStatus === 'completed' ? 'running' : 'blocked',
      summary: String(execution.summary || normalizedProject.developmentRun.summary || '').trim(),
      commitHash: String(execution.commitHash || '').trim(),
      filesChanged: normalizeStringList(execution.filesChanged),
      repositoryAudit: normalizeDevelopmentRun({
        ...normalizedProject.developmentRun,
        repositoryAudit: execution.repositoryAudit || normalizedProject.developmentRun.repositoryAudit,
      }).repositoryAudit,
      taskResults: normalizeDevelopmentRun({
        ...normalizedProject.developmentRun,
        taskResults: execution.taskResults?.length
          ? execution.taskResults
          : normalizedProject.developmentRun.taskResults,
      }).taskResults,
      blockers,
      nextActions,
    },
    history: [
      {
        type: 'development-executed',
        from: STAGE_IDS.DEVELOPMENT,
        to: STAGE_IDS.DEVELOPMENT,
        actor,
        note:
          executionStatus === 'completed'
            ? '本地开发执行已完成，等待运行检查'
            : '本地开发执行失败或被阻塞',
        at: now,
      },
      ...normalizedProject.history,
    ],
  };

  next.stageRiskRegister = createStageRiskRegister(next, STAGES);
  return next;
}

export function recordCodeReviewForProject(
  project,
  { actor = '技术负责人', report = {} } = {},
) {
  const now = new Date().toISOString();
  const normalizedProject = normalizeProject(project);
  if (normalizedProject.currentStageId !== STAGE_IDS.REVIEW) {
    throw new WorkflowGateError('只能在代码/安全/性能 Review 阶段运行 Review。', {
      currentStageId: normalizedProject.currentStageId,
      requiredStageId: STAGE_IDS.REVIEW,
    });
  }

  const changePackage = assertReviewChangePackageReady(normalizedProject);
  const enrichedReport = enrichCodeReviewReport(normalizedProject, report, changePackage);
  const codeReviewReport = normalizeCodeReviewReport({
    ...enrichedReport,
    reviewedAt: report.reviewedAt || now,
  });
  const hasReviewRisk = codeReviewReport.status !== 'passed';
  const shouldSendDefectFixToQa =
    codeReviewReport.status === 'passed' && Boolean(normalizedProject.defectFixPackage);
  const next = {
    ...normalizedProject,
    codeReviewReport,
    health: hasReviewRisk ? 'at-risk' : normalizedProject.health,
    updatedAt: now,
    artifacts: {
      ...normalizedProject.artifacts,
      [STAGE_IDS.REVIEW]: createCodeReviewArtifact(normalizedProject, codeReviewReport),
      [STAGE_IDS.QA]: createQaReviewHandoffArtifact(normalizedProject, codeReviewReport),
    },
    history: [
      {
        type: 'code-review-finished',
        from: STAGE_IDS.REVIEW,
        to: shouldSendDefectFixToQa ? STAGE_IDS.QA : STAGE_IDS.REVIEW,
        actor,
        note: codeReviewReport.status === 'passed'
          ? '代码/安全/性能 Review 通过'
          : '代码/安全/性能 Review 存在阻塞项',
        at: now,
      },
      ...normalizedProject.history,
    ],
  };

  const transitioned = shouldSendDefectFixToQa
    ? moveDefectFixReviewToQaRetest(next, { actor, now, codeReviewReport })
    : next;

  transitioned.stageRiskRegister = createStageRiskRegister(transitioned, STAGES);
  return transitioned;
}

function moveDefectFixReviewToQaRetest(project, { actor, now, codeReviewReport } = {}) {
  const defectFixPackage = normalizeDefectFixPackage({
    ...project.defectFixPackage,
    status: 'qa-retest',
    repairSubmission: {
      ...project.defectFixPackage.repairSubmission,
      status: 'qa-retest',
      reviewedAt: now,
      reviewedBy: actor,
      commitHash: codeReviewReport.commitHash || project.defectFixPackage.repairSubmission?.commitHash,
      sourceStageId: STAGE_IDS.REVIEW,
      targetStageId: STAGE_IDS.QA,
      requiredGates: ['qa-retest'],
    },
  });
  const next = {
    ...project,
    currentStageId: STAGE_IDS.QA,
    defectFixPackage,
    stages: project.stages.map((stage) => {
      if (stage.id === STAGE_IDS.REVIEW) {
        return { ...stage, status: 'approved' };
      }
      if (stage.id === STAGE_IDS.QA) {
        return { ...stage, status: 'active' };
      }
      return stage;
    }),
  };

  return {
    ...next,
    artifacts: {
      ...next.artifacts,
      [STAGE_IDS.DEFECT_LOOP]: createDefectLoopArtifact(next, defectFixPackage),
    },
  };
}

function assertReviewChangePackageReady(project) {
  const changePackage = project.developmentRun?.changePackage;
  const blockers = normalizeStringList(changePackage?.reviewGate?.blockers);
  if (
    !changePackage ||
    changePackage.status !== 'ready-for-review' ||
    changePackage.reviewGate?.canStartReview !== true
  ) {
    throw new WorkflowGateError('开发变更包尚未放行：请先完成开发执行、本地检查和变更包生成。', {
      developmentRunStatus: project.developmentRun?.status || 'missing',
      changePackageStatus: changePackage?.status || 'missing',
      blockers: blockers.length ? blockers : ['开发变更包未生成或未通过 Review 门禁。'],
    });
  }

  return changePackage;
}

function enrichCodeReviewReport(project, report, changePackage) {
  const blockers = normalizeStringList(report.blockers);
  const status = report.status === 'passed' && blockers.length === 0 ? 'passed' : 'needs-work';
  const filesChanged = normalizeStringList(
    changePackage.filesChanged?.length ? changePackage.filesChanged : project.developmentRun?.filesChanged,
  );
  const commitHash = String(report.commitHash || changePackage.commitHash || project.developmentRun?.commitHash || '').trim();

  return {
    ...report,
    commitHash,
    sourceChangePackage:
      report.sourceChangePackage || createReviewSourceChangePackage(changePackage, filesChanged, commitHash),
    reviewGate:
      report.reviewGate || {
        canAdvanceToQa: status === 'passed',
        blockers,
      },
    qaHandoff:
      report.qaHandoff ||
      createReviewQaHandoff({
        status,
        commitHash,
        filesChanged,
        blockers,
      }),
  };
}

function createReviewSourceChangePackage(changePackage, filesChanged, commitHash) {
  const verification = changePackage.verification || {};
  return {
    status: changePackage.status,
    generatedAt: changePackage.createdAt || '',
    commitHash,
    filesChanged,
    filesChangedCount: filesChanged.length,
    verification: {
      total: Number.isFinite(verification.total) ? verification.total : 0,
      passed: Number.isFinite(verification.passed) ? verification.passed : 0,
      failed: Number.isFinite(verification.failed) ? verification.failed : 0,
      blocked: Number.isFinite(verification.blocked) ? verification.blocked : 0,
    },
  };
}

function createReviewQaHandoff({ status, commitHash, filesChanged, blockers }) {
  return {
    status: status === 'passed' ? 'ready' : 'blocked',
    commitHash,
    focusAreas: createQaFocusAreasFromFiles(filesChanged),
    requiredEvidence: [
      '测试样本清单与覆盖场景',
      '测试时长、环境和浏览器范围',
      '总检测次数、误检次数和误检率计算过程',
      '断流、弱光、遮挡和多人场景的回归证据',
    ],
    blockers,
  };
}

function createQaFocusAreasFromFiles(filesChanged) {
  const focusAreas = ['有行人提示', '无行人误报', '弱光/遮挡', 'RTSP 断流恢复'];
  if (filesChanged.some((file) => file.includes('falsePositive'))) {
    focusAreas.push('误检率统计');
  }
  if (filesChanged.some((file) => file.includes('detectionContract'))) {
    focusAreas.push('YOLO 检测结果契约');
  }

  return [...new Set(focusAreas)];
}

export function recordQaRunForProject(
  project,
  { actor = '测试', report = {} } = {},
) {
  const now = new Date().toISOString();
  const normalizedProject = normalizeProject(project);
  if (normalizedProject.currentStageId !== STAGE_IDS.QA) {
    throw new WorkflowGateError('只能在测试阶段运行 QA。', {
      currentStageId: normalizedProject.currentStageId,
      requiredStageId: STAGE_IDS.QA,
    });
  }

  const qaRun = normalizeQaRun({
    ...enrichQaRunReport(normalizedProject, report),
    generatedAt: report.generatedAt || now,
    executedAt: report.executedAt || now,
  });
  const hasQaRisk = qaRun.status !== 'passed';
  const next = {
    ...normalizedProject,
    qaRun,
    health: hasQaRisk ? 'at-risk' : normalizedProject.health,
    updatedAt: now,
    artifacts: {
      ...normalizedProject.artifacts,
      [STAGE_IDS.QA]: createQaRunArtifact(normalizedProject, qaRun),
    },
    history: [
      {
        type: 'qa-run-finished',
        from: STAGE_IDS.QA,
        to: STAGE_IDS.QA,
        actor,
        note: qaRun.status === 'passed' ? 'QA 测试通过' : 'QA 测试存在阻塞项',
        at: now,
      },
      ...normalizedProject.history,
    ],
  };

  const transitioned =
    qaRun.status === 'passed' && normalizedProject.defectFixPackage
      ? closeDefectFixAfterQaRetest(next, { actor, now, qaRun })
      : next;

  transitioned.stageRiskRegister = createStageRiskRegister(transitioned, STAGES);
  return transitioned;
}

function closeDefectFixAfterQaRetest(project, { actor, now, qaRun } = {}) {
  const defectFixPackage = normalizeDefectFixPackage({
    ...project.defectFixPackage,
    status: 'closed',
    repairSubmission: {
      ...project.defectFixPackage.repairSubmission,
      status: 'closed',
      closedAt: now,
      closedBy: actor,
      qaRetestCommitHash: qaRun.commitHash || project.defectFixPackage.repairSubmission?.commitHash,
      qaRetestPassRate: `${qaRun.passedCount || 0}/${qaRun.totalCount || 0}`,
      sourceStageId: STAGE_IDS.QA,
      targetStageId: STAGE_IDS.QA,
      requiredGates: [],
    },
  });
  const next = {
    ...project,
    defectFixPackage,
  };

  return {
    ...next,
    artifacts: {
      ...next.artifacts,
      [STAGE_IDS.DEFECT_LOOP]: createDefectLoopArtifact(next, defectFixPackage),
    },
  };
}

export function routeQaDefectsToDevelopmentForProject(
  project,
  { actor = '测试', note = '' } = {},
) {
  const now = new Date().toISOString();
  const normalizedProject = normalizeProject(project);
  if (normalizedProject.currentStageId !== STAGE_IDS.QA) {
    throw new WorkflowGateError('只能在测试阶段回流 QA 缺陷。', {
      currentStageId: normalizedProject.currentStageId,
      requiredStageId: STAGE_IDS.QA,
    });
  }

  const routing = normalizedProject.qaRun?.defectRouting;
  if (
    normalizedProject.qaRun?.status !== 'needs-work' ||
    !routing?.shouldReturnToDevelopment ||
    routing.targetStageId !== STAGE_IDS.DEVELOPMENT
  ) {
    throw new WorkflowGateError('QA 缺陷未判定为回流开发，不能生成开发修复包。', {
      qaRunStatus: normalizedProject.qaRun?.status || 'missing',
      targetStageId: routing?.targetStageId || 'missing',
      shouldReturnToDevelopment: Boolean(routing?.shouldReturnToDevelopment),
    });
  }

  const defectFixPackage = createDefectFixPackage(normalizedProject, { actor, note, createdAt: now });
  const developmentPlan = createDevelopmentPlanFromDefectFixPackage(
    normalizedProject,
    defectFixPackage,
  );
  const stagedProject = {
    ...normalizedProject,
    currentStageId: STAGE_IDS.DEVELOPMENT,
    health: 'at-risk',
    updatedAt: now,
    defectFixPackage,
    developmentPlan,
    developmentRun: null,
    codeReviewReport: null,
    agentExecutionPackage: null,
    stages: normalizedProject.stages.map((stage) => {
      if (stage.id === STAGE_IDS.DEVELOPMENT) {
        return { ...stage, status: 'active' };
      }
      if (stage.id === STAGE_IDS.REVIEW) {
        return { ...stage, status: 'queued' };
      }
      if (stage.id === STAGE_IDS.QA) {
        return { ...stage, status: 'blocked' };
      }
      return stage;
    }),
    artifacts: {
      ...normalizedProject.artifacts,
      [STAGE_IDS.DEVELOPMENT]: createDefectFixDevelopmentArtifact(
        normalizedProject,
        defectFixPackage,
        developmentPlan,
      ),
      [STAGE_IDS.DEFECT_LOOP]: createDefectLoopArtifact(normalizedProject, defectFixPackage),
    },
    history: [
      {
        type: 'qa-defects-routed-to-development',
        from: STAGE_IDS.QA,
        to: STAGE_IDS.DEVELOPMENT,
        actor,
        note: note || 'QA 判定存在实现缺口，已生成缺陷修复包并回流自动开发。',
        at: now,
      },
      ...normalizedProject.history,
    ],
  };

  const agentExecutionPackage = normalizeAgentExecutionPackage(
    createAgentExecutionPackage(stagedProject),
  );
  const next = {
    ...stagedProject,
    agentExecutionPackage,
  };

  next.stageRiskRegister = createStageRiskRegister(next, STAGES);
  return next;
}

function createDefectFixPackage(project, { actor, note, createdAt }) {
  const qaRun = project.qaRun || {};
  const reasons = normalizeStringList(qaRun.defectRouting?.reasons?.length
    ? qaRun.defectRouting.reasons
    : qaRun.blockers);
  const failingTestCases = Array.isArray(qaRun.testCases)
    ? qaRun.testCases
        .filter((testCase) => testCase.status && testCase.status !== 'passed')
        .map((testCase) => ({
          id: String(testCase.id || '').trim(),
          title: String(testCase.title || testCase.id || '').trim(),
          status: String(testCase.status || 'not-run').trim(),
          evidence: String(testCase.evidence || '').trim(),
        }))
    : [];
  const requiredFixes = reasons.length
    ? reasons
    : failingTestCases.map((testCase) => `${testCase.title} 未通过。`);
  const regressionFocus = [
    ...failingTestCases.map((testCase) => testCase.title),
    ...(qaRun.coveragePlan?.focusAreas || []),
    ...(qaRun.reviewHandoff?.focusAreas || []),
  ];

  return normalizeDefectFixPackage({
    status: 'ready',
    createdAt,
    createdBy: actor,
    sourceStageId: STAGE_IDS.QA,
    targetStageId: STAGE_IDS.DEVELOPMENT,
    sourceCommitHash: qaRun.commitHash || project.developmentRun?.commitHash || '',
    qaRunStatus: qaRun.status || '',
    qaPassRate: `${qaRun.passedCount || 0}/${qaRun.totalCount || 0}`,
    note,
    reasons,
    failingTestCases,
    requiredFixes,
    regressionFocus,
  });
}

function createDevelopmentPlanFromDefectFixPackage(project, defectFixPackage) {
  const verificationCommands = normalizeStringList(
    project.developmentPlan?.verificationCommands?.length
      ? project.developmentPlan.verificationCommands
      : project.repositoryConfig?.verificationCommands,
  );
  const commands = verificationCommands.length ? verificationCommands : ['npm test', 'npm run build'];
  const tasks = defectFixPackage.requiredFixes.map((reason, index) => ({
    id: `qa-fix-${index + 1}`,
    area: '缺陷修复',
    title: `修复 QA 阻塞：${reason}`,
    description: [
      `来源提交：${defectFixPackage.sourceCommitHash || '未记录'}`,
      `失败用例：${defectFixPackage.failingTestCases.map((item) => item.title).join('、') || '未记录'}`,
      `修复要求：${reason}`,
    ].join('；'),
    status: 'queued',
    acceptanceCriteria: [
      '对应 QA 阻塞项已修复。',
      '失败用例已有回归测试或可复核证据。',
      '修复后必须重新进入 Review 和 QA。',
    ],
    verification: commands,
  }));

  return normalizeDevelopmentPlan({
    status: 'ready',
    sourceStageId: STAGE_IDS.DEVELOPMENT,
    summary: '基于 QA 缺陷回流生成修复任务，修复后必须重新 Review 并回归测试。',
    tasks,
    verificationCommands: commands,
  }, project, project.artifacts?.[STAGE_IDS.DEVELOPMENT] || '');
}

function enrichQaRunReport(project, report = {}) {
  const reviewHandoff = normalizeQaReviewHandoff(
    report.reviewHandoff || project.codeReviewReport?.qaHandoff,
  );
  const commitHash = String(
    report.commitHash ||
      reviewHandoff?.commitHash ||
      project.codeReviewReport?.commitHash ||
      project.developmentRun?.commitHash ||
      '',
  ).trim();
  const coveragePlan = normalizeQaCoveragePlan(report.coveragePlan, {
    reviewHandoff,
    commitHash,
  });
  const defectRouting = normalizeQaDefectRouting(
    report.defectRouting || createQaDefectRouting(report),
    {
      status: getQaReportRequestedStatus(report),
      blockers: normalizeStringList(report.blockers),
      defects: report.defects || [],
    },
  );

  return {
    ...report,
    commitHash,
    reviewHandoff,
    coveragePlan,
    defectRouting,
  };
}

function createQaDefectRouting(report = {}) {
  const blockers = normalizeStringList(report.blockers);
  const defects = Array.isArray(report.defects) ? report.defects : [];
  const testCaseFailures = Array.isArray(report.testCases)
    ? report.testCases
        .filter((testCase) => testCase.status && testCase.status !== 'passed')
        .map((testCase) => `${testCase.title || testCase.id || '测试用例'} 未通过。`)
    : [];
  const reasons = [
    ...blockers,
    ...defects.map((item) =>
      typeof item === 'string' ? item : `${item.title || '缺陷'}${item.detail ? `：${item.detail}` : ''}`,
    ),
    ...testCaseFailures,
  ].filter(Boolean);
  const developmentReasons = reasons.filter(isDevelopmentRoutingReason);
  const requestedStatus = getQaReportRequestedStatus(report);

  if (requestedStatus === 'passed' && reasons.length === 0) {
    return {
      shouldReturnToDevelopment: false,
      targetStageId: 'acceptance',
      reasons: [],
    };
  }

  if (developmentReasons.length) {
    return {
      shouldReturnToDevelopment: true,
      targetStageId: STAGE_IDS.DEVELOPMENT,
      reasons: developmentReasons,
    };
  }

  return {
    shouldReturnToDevelopment: false,
    targetStageId: STAGE_IDS.QA,
    reasons,
  };
}

function getQaReportRequestedStatus(report = {}) {
  return report.status === 'passed' ? 'passed' : 'needs-work';
}

function isDevelopmentRoutingReason(reason) {
  return /Review 交接未就绪|未通过，不能完成 QA|对应实现或测试|代码质量|安全检查|性能检查|生产代码|开发/.test(
    String(reason || ''),
  );
}

export function recordQaEvidenceForProject(
  project,
  { actor = '测试', evidence = {} } = {},
) {
  const now = new Date().toISOString();
  const normalizedProject = normalizeProject(project);
  if (normalizedProject.currentStageId !== STAGE_IDS.QA) {
    throw new WorkflowGateError('只能在测试阶段记录 QA 证据。', {
      currentStageId: normalizedProject.currentStageId,
      requiredStageId: STAGE_IDS.QA,
    });
  }

  const qaEvidence = normalizeQaEvidence(
    {
      ...evidence,
      actor,
      recordedBy: actor,
      recordedAt: evidence.recordedAt || now,
    },
    { requireFalsePositiveMetrics: isYoloCameraProject(normalizedProject) },
  );
  const next = {
    ...normalizedProject,
    qaEvidence,
    health: qaEvidence.status === 'ready' ? normalizedProject.health : 'at-risk',
    updatedAt: now,
    artifacts: {
      ...normalizedProject.artifacts,
      [STAGE_IDS.QA]: createQaEvidenceArtifact(normalizedProject, qaEvidence),
    },
    history: [
      {
        type: 'qa-evidence-updated',
        from: STAGE_IDS.QA,
        to: STAGE_IDS.QA,
        actor,
        note: qaEvidence.status === 'ready' ? '测试证据已就绪' : '测试证据仍需补充',
        at: now,
      },
      ...normalizedProject.history,
    ],
  };

  next.stageRiskRegister = createStageRiskRegister(next, STAGES);
  return next;
}

export function startYoloQaSessionForProject(
  project,
  { actor = '测试', session = {} } = {},
) {
  const now = new Date().toISOString();
  const normalizedProject = assertYoloQaProjectReady(project);
  const yoloQaSession = createYoloQaSession({
    actor,
    ...session,
    startedAt: session.startedAt || now,
  });
  const next = {
    ...normalizedProject,
    yoloQaSession,
    health: 'at-risk',
    updatedAt: now,
    history: [
      {
        type: 'yolo-qa-session-started',
        from: STAGE_IDS.QA,
        to: STAGE_IDS.QA,
        actor,
        note: 'YOLO 测试批次已开始',
        at: now,
      },
      ...normalizedProject.history,
    ],
  };

  next.stageRiskRegister = createStageRiskRegister(next, STAGES);
  return next;
}

export function recordYoloQaDetectionEventForProject(
  project,
  { actor = '测试', event = {} } = {},
) {
  const now = new Date().toISOString();
  const normalizedProject = assertYoloQaProjectReady(project);
  const yoloQaSession = addYoloQaDetectionEvent(normalizedProject.yoloQaSession, event);
  const next = {
    ...normalizedProject,
    yoloQaSession,
    updatedAt: now,
    history: [
      {
        type: 'yolo-qa-event-recorded',
        from: STAGE_IDS.QA,
        to: STAGE_IDS.QA,
        actor,
        note: `记录 YOLO 检测事件 ${event.id || ''}`.trim(),
        at: now,
      },
      ...normalizedProject.history,
    ],
  };

  next.stageRiskRegister = createStageRiskRegister(next, STAGES);
  return next;
}

export function reviewYoloQaDetectionEventForProject(
  project,
  { actor = '测试', eventId = '', review = {} } = {},
) {
  const now = new Date().toISOString();
  const normalizedProject = assertYoloQaProjectReady(project);
  const yoloQaSession = reviewYoloQaDetectionEvent(normalizedProject.yoloQaSession, eventId, {
    actor,
    ...review,
    reviewedAt: review.reviewedAt || now,
  });
  const next = {
    ...normalizedProject,
    yoloQaSession,
    updatedAt: now,
    history: [
      {
        type: 'yolo-qa-event-reviewed',
        from: STAGE_IDS.QA,
        to: STAGE_IDS.QA,
        actor,
        note: `标注 YOLO 检测事件 ${eventId}`,
        at: now,
      },
      ...normalizedProject.history,
    ],
  };

  next.stageRiskRegister = createStageRiskRegister(next, STAGES);
  return next;
}

export function completeYoloQaSessionForProject(
  project,
  { actor = '测试', endedAt = new Date().toISOString() } = {},
) {
  const now = new Date().toISOString();
  const normalizedProject = assertYoloQaProjectReady(project);
  const yoloQaSession = completeYoloQaSession(normalizedProject.yoloQaSession, {
    actor,
    endedAt,
  });
  const metrics = yoloQaSession.metrics;
  const qaEvidence = normalizeQaEvidence(
    {
      actor,
      recordedBy: actor,
      recordedAt: endedAt,
      sampleSet: yoloQaSession.sampleSet,
      durationMinutes: yoloQaSession.durationMinutes,
      environment: yoloQaSession.environment,
      browserScope: yoloQaSession.browserScope,
      totalDetections: metrics.totalDetections,
      falsePositiveCount: metrics.falsePositiveCount,
      falsePositiveThreshold: metrics.falsePositiveThreshold,
      notes: `由 YOLO 测试批次自动生成：共 ${metrics.totalDetections} 次检测，误检 ${metrics.falsePositiveCount} 次。`,
    },
    { requireFalsePositiveMetrics: true },
  );
  const next = {
    ...normalizedProject,
    yoloQaSession,
    qaEvidence,
    health: qaEvidence.status === 'ready' ? normalizedProject.health : 'at-risk',
    updatedAt: now,
    artifacts: {
      ...normalizedProject.artifacts,
      [STAGE_IDS.QA]: createQaEvidenceArtifact(normalizedProject, qaEvidence),
    },
    history: [
      {
        type: 'yolo-qa-session-completed',
        from: STAGE_IDS.QA,
        to: STAGE_IDS.QA,
        actor,
        note: qaEvidence.status === 'ready' ? 'YOLO 测试批次通过误检率门禁' : 'YOLO 测试批次未通过误检率门禁',
        at: now,
      },
      ...normalizedProject.history,
    ],
  };

  next.stageRiskRegister = createStageRiskRegister(next, STAGES);
  return next;
}

export function generateAcceptancePackageForProject(
  project,
  { actor = '负责人', acceptancePackage = createAcceptancePackage(project, { actor }) } = {},
) {
  const now = new Date().toISOString();
  const normalizedProject = normalizeProject(project);
  if (normalizedProject.currentStageId !== STAGE_IDS.ACCEPTANCE) {
    throw new WorkflowGateError('只能在最终验收阶段生成最终验收包。', {
      currentStageId: normalizedProject.currentStageId,
      requiredStageId: STAGE_IDS.ACCEPTANCE,
    });
  }

  const normalizedPackage = normalizeAcceptancePackage({
    ...acceptancePackage,
    generatedAt: acceptancePackage.generatedAt || now,
    generatedBy: actor,
  });
  const next = {
    ...normalizedProject,
    acceptancePackage: normalizedPackage,
    health: normalizedPackage.status === 'ready' ? normalizedProject.health : 'at-risk',
    updatedAt: now,
    artifacts: {
      ...normalizedProject.artifacts,
      [STAGE_IDS.ACCEPTANCE]: createAcceptancePackageArtifact(normalizedProject, normalizedPackage),
    },
    history: [
      {
        type: 'acceptance-package-generated',
        from: STAGE_IDS.ACCEPTANCE,
        to: STAGE_IDS.ACCEPTANCE,
        actor,
        note: normalizedPackage.status === 'ready' ? '最终验收包已就绪' : '最终验收包存在缺失材料',
        at: now,
      },
      ...normalizedProject.history,
    ],
  };

  next.stageRiskRegister = createStageRiskRegister(next, STAGES);
  return next;
}

export function updateRepositoryConfigForProject(
  project,
  { actor = '技术负责人', config = {} } = {},
) {
  const now = new Date().toISOString();
  const normalizedProject = normalizeProject(project);
  const repositoryConfig = {
    ...normalizeRepositoryConfig(config, {
      defaultCommands: normalizedProject.developmentPlan?.verificationCommands || [],
    }),
    configuredAt: now,
    configuredBy: actor,
  };

  return {
    ...normalizedProject,
    repositoryConfig,
    updatedAt: now,
    history: [
      {
        type: 'repository-config-updated',
        from: normalizedProject.currentStageId,
        to: normalizedProject.currentStageId,
        actor,
        note:
          repositoryConfig.status === 'ready'
            ? '代码仓库与执行器配置已就绪'
            : '代码仓库与执行器配置仍需补充',
        at: now,
      },
      ...normalizedProject.history,
    ],
  };
}

export function updateProjectMembersForProject(
  project,
  { actor = '负责人', members = {} } = {},
) {
  const now = new Date().toISOString();
  const normalizedProject = normalizeProject(project);
  const normalizedMembers = normalizeProjectMembers(members);
  const next = {
    ...normalizedProject,
    members: normalizedMembers,
    updatedAt: now,
    history: [
      {
        type: 'project-members-updated',
        from: normalizedProject.currentStageId,
        to: normalizedProject.currentStageId,
        actor,
        note: '项目成员配置已更新',
        at: now,
      },
      ...normalizedProject.history,
    ],
  };

  next.stageRiskRegister = createStageRiskRegister(next, STAGES);
  return next;
}

export function updateStageConfirmationForProject(
  project,
  { actor = '系统', stageId = '', itemId = '', value = '' } = {},
) {
  const now = new Date().toISOString();
  const normalizedProject = normalizeProject(project);
  const targetStageId = stageId || normalizedProject.currentStageId;
  const stageConfirmations = updateStageConfirmationItem(normalizedProject.stageConfirmations, {
    stageId: targetStageId,
    itemId,
    value,
    actor,
    confirmedAt: now,
    stages: STAGES,
  });
  const updatedItem = stageConfirmations[targetStageId]?.items.find((item) => item.id === itemId);
  const next = {
    ...normalizedProject,
    stageConfirmations,
    updatedAt: now,
    history: [
      {
        type: 'stage-confirmation-updated',
        from: normalizedProject.currentStageId,
        to: normalizedProject.currentStageId,
        actor,
        stageId: targetStageId,
        itemId,
        itemTitle: updatedItem?.title || itemId,
        followupTaskId: `${targetStageId}-${itemId}`,
        taskStatus: updatedItem?.status === 'confirmed' ? 'resolved' : 'open',
        valueSummary: summarizeStageConfirmationValue(updatedItem?.value || value),
        note: `确认事项已更新：${updatedItem?.title || itemId}`,
        at: now,
      },
      ...normalizedProject.history,
    ],
  };

  next.stageRiskRegister = createStageRiskRegister(next, STAGES);
  return next;
}

function summarizeStageConfirmationValue(value) {
  const cleaned = String(value || '').trim();
  if (cleaned.length <= 160) {
    return cleaned;
  }

  return `${cleaned.slice(0, 157)}...`;
}

export function recordTaskCommentForProject(
  project,
  { actor = '系统', stageId = '', itemId = '', comment = '' } = {},
) {
  const now = new Date().toISOString();
  const normalizedProject = normalizeProject(project);
  const targetStageId = stageId || normalizedProject.currentStageId;
  const cleanedComment = String(comment || '').trim();
  if (!cleanedComment) {
    throw new WorkflowGateError('任务备注不能为空。', {
      stageId: targetStageId,
      itemId,
    });
  }

  return {
    ...normalizedProject,
    updatedAt: now,
    history: [
      {
        type: 'task-comment-added',
        from: normalizedProject.currentStageId,
        to: normalizedProject.currentStageId,
        actor,
        stageId: targetStageId,
        itemId,
        followupTaskId: `${targetStageId}-${itemId}`,
        comment: cleanedComment,
        note: `任务备注：${cleanedComment}`,
        at: now,
      },
      ...normalizedProject.history,
    ],
  };
}

export function recordRepositoryInspectionForProject(
  project,
  { actor = 'Local Runner', inspection = {} } = {},
) {
  const now = new Date().toISOString();
  const normalizedProject = normalizeProject(project);
  const repositoryInspection = normalizeRepositoryInspection(
    {
      ...inspection,
      inspectedAt: inspection.inspectedAt || now,
    },
    normalizedProject.repositoryConfig,
  );
  const hasRepositoryRisk = ['blocked', 'warning'].includes(repositoryInspection.status);

  const next = {
    ...normalizedProject,
    repositoryInspection,
    health: hasRepositoryRisk ? 'at-risk' : normalizedProject.health,
    updatedAt: now,
    history: [
      {
        type: 'repository-inspected',
        from: normalizedProject.currentStageId,
        to: normalizedProject.currentStageId,
        actor,
        note:
          repositoryInspection.status === 'ready'
            ? '仓库诊断通过'
            : '仓库诊断发现需要处理的问题',
        at: now,
      },
      ...normalizedProject.history,
    ],
  };

  next.stageRiskRegister = createStageRiskRegister(next, STAGES);
  return next;
}

export function recordBranchPreparationForProject(
  project,
  { actor = 'Local Runner', preparation = {} } = {},
) {
  const now = new Date().toISOString();
  const normalizedProject = normalizeProject(project);
  const branchPreparation = normalizeBranchPreparation(
    {
      ...preparation,
      preparedAt: preparation.preparedAt || now,
    },
    normalizedProject.repositoryConfig,
  );
  const hasPreparationRisk = ['blocked', 'failed'].includes(branchPreparation.status);

  const next = {
    ...normalizedProject,
    branchPreparation,
    health: hasPreparationRisk ? 'at-risk' : normalizedProject.health,
    updatedAt: now,
    history: [
      {
        type: 'branch-prepared',
        from: normalizedProject.currentStageId,
        to: normalizedProject.currentStageId,
        actor,
        note:
          branchPreparation.status === 'ready'
            ? '目标分支已准备'
            : '目标分支准备失败或被阻塞',
        at: now,
      },
      ...normalizedProject.history,
    ],
  };

  next.stageRiskRegister = createStageRiskRegister(next, STAGES);
  return next;
}

export function recordRepositoryBootstrapForProject(
  project,
  { actor = '技术负责人', bootstrap = {} } = {},
) {
  const now = new Date().toISOString();
  const normalizedProject = normalizeProject(project);
  const repositoryBootstrap = normalizeRepositoryBootstrap({
    ...bootstrap,
    bootstrappedAt: bootstrap.bootstrappedAt || now,
  });
  const hasBootstrapRisk = ['blocked', 'failed'].includes(repositoryBootstrap.status);

  const next = {
    ...normalizedProject,
    repositoryBootstrap,
    repositoryInspection: null,
    branchPreparation: null,
    agentExecutionPackage: null,
    health: hasBootstrapRisk ? 'at-risk' : normalizedProject.health,
    updatedAt: now,
    history: [
      {
        type: 'repository-bootstrapped',
        from: normalizedProject.currentStageId,
        to: normalizedProject.currentStageId,
        actor,
        note:
          repositoryBootstrap.status === 'ready'
            ? '本地业务仓库已初始化'
            : '本地业务仓库初始化失败或被阻塞',
        at: now,
      },
      ...normalizedProject.history,
    ],
  };

  next.stageRiskRegister = createStageRiskRegister(next, STAGES);
  return next;
}

export function generateAgentExecutionPackageForProject(
  project,
  { actor = 'AI Dev Lead', agentPackage = createAgentExecutionPackage(project) } = {},
) {
  const now = new Date().toISOString();
  const normalizedProject = normalizeProject(project);
  const normalizedPackage = normalizeAgentExecutionPackage({
    ...agentPackage,
    generatedAt: agentPackage.generatedAt || now,
  });
  const hasPackageRisk = normalizedPackage.status !== 'ready';

  const next = {
    ...normalizedProject,
    agentExecutionPackage: normalizedPackage,
    health: hasPackageRisk ? 'at-risk' : normalizedProject.health,
    updatedAt: now,
    history: [
      {
        type: 'agent-execution-package-generated',
        from: normalizedProject.currentStageId,
        to: normalizedProject.currentStageId,
        actor,
        note:
          normalizedPackage.status === 'ready'
            ? 'AI 开发任务包已就绪'
            : 'AI 开发任务包存在启动阻塞',
        at: now,
      },
      ...normalizedProject.history,
    ],
  };

  next.stageRiskRegister = createStageRiskRegister(next, STAGES);
  return next;
}

function buildDevelopmentCheckBlockers(checks) {
  const blockedChecks = checks.filter((check) => ['failed', 'blocked'].includes(check.status));
  if (!blockedChecks.length) {
    return [];
  }

  return blockedChecks.map((check) =>
    check.status === 'blocked'
      ? `${check.command} 未执行：命令不在 runner 白名单中。`
      : `${check.command} 执行失败：${check.result || '请查看 runner 输出。'}`,
  );
}

function buildDevelopmentCheckNextActions(checks) {
  const blockedChecks = checks.filter((check) => ['failed', 'blocked'].includes(check.status));
  if (!blockedChecks.length) {
    return ['进入代码/安全/性能 Review 阶段。'];
  }

  return [
    '开发先处理失败检查对应的问题，再重新运行本地检查。',
    '如命令被白名单阻塞，需要技术负责人确认是否加入安全命令清单。',
  ];
}

function createNextPrdVersion(project, { actor = '项目经理', generatedAt = '' } = {}) {
  const previousNumber =
    getPrdVersionNumber(project.prdVersion) || getPrdVersionNumber(project.prdRequirementSnapshot) || 0;
  const number = previousNumber + 1;
  return {
    number,
    label: `v${number}`,
    status: 'current',
    generatedAt,
    generatedBy: actor,
  };
}

function createPrdRequirementSnapshot(project, prdVersion = {}) {
  const version = getPrdVersionNumber(prdVersion) || 1;
  const questions = project.requirementQuestions || REQUIREMENT_QUESTIONS.map((item) => ({ ...item }));
  const answers = project.requirementAnswers || {};

  return {
    version,
    versionLabel: prdVersion.label || `v${version}`,
    capturedAt: prdVersion.generatedAt || '',
    capturedBy: prdVersion.generatedBy || '',
    answers: Object.fromEntries(questions.map((question) => [question.id, String(answers[question.id] || '')])),
    questions: questions.map((question) => ({
      id: question.id,
      label: question.label,
    })),
  };
}

function createCurrentPrdChangeImpact(prdVersion = {}) {
  const version = getPrdVersionNumber(prdVersion) || 1;
  const versionLabel = prdVersion.label || `v${version}`;
  return {
    status: 'current',
    version,
    versionLabel,
    changedQuestionIds: [],
    changedQuestions: [],
    summary: `PRD ${versionLabel} 与当前需求一致。`,
    requiredActions: [],
  };
}

function createPrdChangeImpact(project) {
  const snapshot = normalizePrdRequirementSnapshot(project.prdRequirementSnapshot);
  if (!snapshot) {
    return project.prdChangeImpact || null;
  }

  const questionMap = new Map([
    ...(snapshot.questions || []).map((question) => [question.id, question]),
    ...(project.requirementQuestions || []).map((question) => [question.id, question]),
  ]);
  const answers = project.requirementAnswers || {};
  const changedQuestions = [...questionMap.values()]
    .filter((question) => String(snapshot.answers?.[question.id] || '') !== String(answers[question.id] || ''))
    .map((question) => ({
      id: question.id,
      label: question.label,
      previousAnswer: String(snapshot.answers?.[question.id] || ''),
      currentAnswer: String(answers[question.id] || ''),
    }));

  if (!changedQuestions.length) {
    return createCurrentPrdChangeImpact({
      number: snapshot.version,
      label: snapshot.versionLabel,
    });
  }

  const changedLabels = changedQuestions.map((question) => question.label).join('、');
  return {
    status: 'stale',
    version: snapshot.version,
    versionLabel: snapshot.versionLabel,
    changedQuestionIds: changedQuestions.map((question) => question.id),
    changedQuestions,
    summary: `PRD ${snapshot.versionLabel} 已过期：${changedLabels} 已变更。`,
    requiredActions: ['重新运行智能需求评审', '重新生成需求文档草稿'],
  };
}

function normalizePrdVersion(version) {
  if (!version) {
    return null;
  }
  const number = getPrdVersionNumber(version);
  if (!number) {
    return null;
  }
  const status = ['current', 'stale'].includes(version.status) ? version.status : 'current';
  return {
    number,
    label: String(version.label || `v${number}`),
    status,
    generatedAt: String(version.generatedAt || ''),
    generatedBy: String(version.generatedBy || ''),
  };
}

function normalizePrdRequirementSnapshot(snapshot) {
  if (!snapshot) {
    return null;
  }
  const version = getPrdVersionNumber(snapshot);
  if (!version) {
    return null;
  }
  const questions = Array.isArray(snapshot.questions)
    ? snapshot.questions
        .map((question) => ({
          id: String(question.id || '').trim(),
          label: String(question.label || question.id || '').trim(),
        }))
        .filter((question) => question.id)
    : [];

  return {
    version,
    versionLabel: String(snapshot.versionLabel || `v${version}`),
    capturedAt: String(snapshot.capturedAt || ''),
    capturedBy: String(snapshot.capturedBy || ''),
    answers: Object.fromEntries(
      Object.entries(snapshot.answers || {}).map(([key, value]) => [key, String(value || '')]),
    ),
    questions,
  };
}

function normalizePrdChangeImpact(impact) {
  if (!impact) {
    return null;
  }
  const status = ['current', 'stale'].includes(impact.status) ? impact.status : 'current';
  const version = Number.isInteger(impact.version) && impact.version > 0 ? impact.version : 1;
  const changedQuestions = Array.isArray(impact.changedQuestions)
    ? impact.changedQuestions
        .map((question) => ({
          id: String(question.id || '').trim(),
          label: String(question.label || question.id || '').trim(),
          previousAnswer: String(question.previousAnswer || ''),
          currentAnswer: String(question.currentAnswer || ''),
        }))
        .filter((question) => question.id)
    : [];

  return {
    status,
    version,
    versionLabel: String(impact.versionLabel || `v${version}`),
    changedQuestionIds: Array.isArray(impact.changedQuestionIds)
      ? impact.changedQuestionIds.map((item) => String(item || '').trim()).filter(Boolean)
      : changedQuestions.map((question) => question.id),
    changedQuestions,
    summary: String(impact.summary || ''),
    requiredActions: Array.isArray(impact.requiredActions)
      ? impact.requiredActions.map((item) => String(item || '').trim()).filter(Boolean)
      : [],
  };
}

function getPrdVersionNumber(value) {
  const number = value?.number ?? value?.version;
  return Number.isInteger(number) && number > 0 ? number : 0;
}

export function getCurrentStage(project) {
  return project.stages.find((stage) => stage.id === project.currentStageId);
}

export function normalizeProject(project) {
  const normalized = {
    ...project,
    prdStatus: project.prdStatus || 'draft',
    prdApprovalReady: Boolean(project.prdApprovalReady),
    prdVersion: normalizePrdVersion(project.prdVersion),
    prdRequirementSnapshot: normalizePrdRequirementSnapshot(project.prdRequirementSnapshot),
    prdChangeImpact: normalizePrdChangeImpact(project.prdChangeImpact),
    technicalHandoffStatus: project.technicalHandoffStatus || 'draft',
    technicalHandoffProvider: project.technicalHandoffProvider || '',
    technicalHandoffProviderError: project.technicalHandoffProviderError || '',
    members: normalizeProjectMembers(project.members),
    stageConfirmations: normalizeStageConfirmationRegister(project.stageConfirmations, STAGES),
    businessSkills: project.businessSkills || BUSINESS_SKILLS.map((item) => ({ ...item })),
    requirementReview: project.requirementReview || null,
    requirementQuestions: project.requirementQuestions || REQUIREMENT_QUESTIONS.map((item) => ({ ...item })),
    requirementAnswers: project.requirementAnswers || {},
    artifacts: { ...(project.artifacts || {}) },
    risks: project.risks || [],
    history: project.history || [],
  };

  if (normalized.prdStatus === 'generated' && !normalized.prdVersion) {
    normalized.prdVersion = {
      number: 1,
      label: 'v1',
      status: 'current',
      generatedAt: normalized.prdGeneratedAt || '',
      generatedBy: '项目经理',
    };
  }
  if (normalized.prdStatus === 'generated' && !normalized.prdRequirementSnapshot) {
    normalized.prdRequirementSnapshot = createPrdRequirementSnapshot(normalized, normalized.prdVersion);
  }
  if (normalized.prdStatus === 'generated' && !normalized.prdChangeImpact) {
    normalized.prdChangeImpact = createCurrentPrdChangeImpact(normalized.prdVersion);
  }
  if (normalized.prdRequirementSnapshot && !normalized.prdChangeImpact) {
    normalized.prdChangeImpact = createPrdChangeImpact(normalized);
  }
  if (normalized.prdVersion && normalized.prdChangeImpact?.status === 'stale') {
    normalized.prdVersion = { ...normalized.prdVersion, status: 'stale' };
  }

  if (!normalized.artifacts[STAGE_IDS.PM_REQUIREMENTS]) {
    normalized.artifacts[STAGE_IDS.PM_REQUIREMENTS] = generateRequirementDraft(normalized);
  }
  normalized.stageRiskRegister = createStageRiskRegister(normalized, STAGES);
  if (normalized.developmentPlan || normalized.artifacts[STAGE_IDS.DEVELOPMENT]) {
    normalized.developmentPlan = normalizeDevelopmentPlan(
      normalized.developmentPlan,
      normalized,
      normalized.artifacts[STAGE_IDS.DEVELOPMENT],
    );
  }
  normalized.repositoryConfig = normalizeRepositoryConfig(normalized.repositoryConfig, {
    defaultCommands: normalized.developmentPlan?.verificationCommands || [],
  });
  normalized.repositoryBootstrap = normalizeRepositoryBootstrap(normalized.repositoryBootstrap);
  normalized.repositoryInspection = normalizeRepositoryInspection(
    normalized.repositoryInspection,
    normalized.repositoryConfig,
  );
  normalized.branchPreparation = normalizeBranchPreparation(
    normalized.branchPreparation,
    normalized.repositoryConfig,
  );
  normalized.agentExecutionPackage = normalizeAgentExecutionPackage(normalized.agentExecutionPackage);
  normalized.developmentRun = normalizeDevelopmentRun(normalized.developmentRun);
  normalized.codeReviewReport = normalizeCodeReviewReport(normalized.codeReviewReport);
  normalized.qaEvidence = normalizeQaEvidence(normalized.qaEvidence, {
    requireFalsePositiveMetrics: isYoloCameraProject(normalized),
  });
  normalized.yoloQaSession = normalizeYoloQaSession(normalized.yoloQaSession);
  normalized.qaRun = normalizeQaRun(normalized.qaRun);
  normalized.defectFixPackage = normalizeDefectFixPackage(normalized.defectFixPackage);
  normalized.acceptancePackage = normalizeAcceptancePackage(normalized.acceptancePackage);

  return normalized;
}

function assertYoloQaProjectReady(project) {
  const normalizedProject = normalizeProject(project);
  if (!isYoloCameraProject(normalizedProject)) {
    throw new WorkflowGateError('只有 YOLO 摄像头监控项目可以记录 YOLO 测试批次。');
  }
  if (normalizedProject.currentStageId !== STAGE_IDS.QA) {
    throw new WorkflowGateError('只能在测试阶段记录 YOLO 测试批次。', {
      currentStageId: normalizedProject.currentStageId,
      requiredStageId: STAGE_IDS.QA,
    });
  }
  return normalizedProject;
}

export function generateArtifact(project, stageId) {
  const stage = STAGES.find((item) => item.id === stageId);
  if (!stage) {
    throw new Error(`未知阶段: ${stageId}`);
  }

  const sections = {
    [STAGE_IDS.INTAKE]: [
      `# 项目入口: ${project.name}`,
      `负责人: ${project.sponsor}`,
      `业务概要: ${project.summary}`,
      '- 初始目标已经登记。',
      '- 下一步由项目经理逐轮澄清需求。',
    ],
    [STAGE_IDS.PM_REQUIREMENTS]: [generateRequirementDraft(project)],
    [STAGE_IDS.PRD_APPROVAL]: [generatePrdArtifact(project)],
    [STAGE_IDS.ARCHITECTURE]: [
      `# 技术方案: ${project.name}`,
      '## 模块',
      '- Web/API 服务',
      '- 数据存储',
      '- 审计日志',
      '## 数据库草案',
      '- projects',
      '- workflow_stages',
      '- artifacts',
      '- approvals',
    ],
    [STAGE_IDS.OPS_REQUIREMENTS]: [
      `# 运维需求: ${project.name}`,
      '- 服务器规格、运行环境和部署权限待运维确认。',
      '- 需要明确日志、监控、备份、回滚和告警策略。',
    ],
    [STAGE_IDS.DEVELOPMENT]: [
      `# 开发任务: ${project.name}`,
      '- 根据技术方案逐任务实现。',
      '- 每个任务必须包含测试、自检和变更说明。',
    ],
    [STAGE_IDS.REVIEW]: [
      `# Review 报告: ${project.name}`,
      '- 检查代码质量、安全风险、性能风险和可维护性。',
      '- 不通过时退回自动开发阶段。',
    ],
    [STAGE_IDS.QA]: [
      `# 测试报告: ${project.name}`,
      '- 覆盖功能测试、边界测试、异常路径和回归测试。',
      '- 发现缺陷时回流到开发。',
    ],
    [STAGE_IDS.DEFECT_LOOP]: [
      `# 缺陷回归: ${project.name}`,
      '- 缺陷修复需要补充回归测试。',
      '- 验证通过后进入最终验收。',
    ],
    [STAGE_IDS.ACCEPTANCE]: [
      `# 最终交付报告: ${project.name}`,
      '- 汇总 PRD、技术方案、测试报告、运维交接和发布说明。',
      '- 负责人确认后项目归档。',
    ],
  };

  return sections[stageId].join('\n');
}

function generateRequirementDraft(project) {
  const answers = project.requirementAnswers || {};
  const answeredCount = REQUIREMENT_QUESTIONS.filter((question) => answers[question.id]).length;
  const lines = [
    `# PRD 草案: ${project.name}`,
    `负责人: ${project.sponsor}`,
    '',
    '## 业务背景',
    project.summary,
    '',
    '## 需求澄清进度',
    `已回答 ${answeredCount}/${REQUIREMENT_QUESTIONS.length} 个关键问题。`,
    '',
    ...REQUIREMENT_QUESTIONS.flatMap((question) => [
      `### ${question.label}`,
      answers[question.id] || `待确认：${question.prompt}`,
      '',
    ]),
    '## 下一步',
    answeredCount === REQUIREMENT_QUESTIONS.length
      ? '- 可以生成 PRD 并提交负责人审批。'
      : '- 继续补齐未回答的问题，再生成 PRD。',
  ];

  return lines.join('\n');
}

function generatePrdArtifact(project) {
  const answers = project.requirementAnswers || {};
  return [
    `# PRD: ${project.name}`,
    '',
    '## 1. 项目背景',
    project.summary,
    '',
    '## 2. 目标用户',
    answers.users || '待项目经理补充。',
    '',
    '## 3. 核心场景',
    answers.scenarios || '待项目经理补充。',
    '',
    '## 4. 成功指标',
    answers.successMetrics || '待项目经理补充。',
    '',
    '## 5. 范围边界',
    answers.scope || '待项目经理补充。',
    '',
    '## 6. 数据、权限与合规',
    answers.data || '待项目经理补充。',
    '',
    '## 7. 外部依赖',
    answers.integrations || '待项目经理补充。',
    '',
    '## 8. 验收标准',
    '- 每个核心场景都有可执行的验收路径。',
    '- 数据权限符合需求澄清中的限制。',
    '- 测试阶段需要覆盖正常路径、异常路径和权限边界。',
    '',
    '## 9. 交付流转建议',
    '- PRD 审批通过后进入架构与数据设计。',
    '- 如涉及新服务、数据库、外部依赖或权限变更，必须进入运维需求确认。',
  ].join('\n');
}

function createCodeReviewArtifact(project, report) {
  const source = report.sourceChangePackage || {};
  const gate = report.reviewGate || {};
  const qaHandoff = report.qaHandoff || {};

  return [
    `# Code Review 报告: ${project.name}`,
    '',
    `状态：${report.status === 'passed' ? '通过' : '需返工'}`,
    `提交：${report.commitHash || source.commitHash || '未记录'}`,
    `评审时间：${report.reviewedAt || '未记录'}`,
    `摘要：${report.summary || '未记录'}`,
    '',
    '## 开发变更包来源',
    `- 状态：${source.status || '未记录'}`,
    `- 提交：${source.commitHash || report.commitHash || '未记录'}`,
    `- 变更文件：${source.filesChangedCount || source.filesChanged?.length || 0}`,
    `- 本地检查：${source.verification?.passed || 0}/${source.verification?.total || 0} 通过`,
    '',
    '## Review 分类',
    ...(report.categories.length
      ? report.categories.flatMap((category) => [
          `### ${category.label || category.id}`,
          `- 状态：${category.status === 'passed' ? '通过' : '未通过'}`,
          `- 结论：${category.summary || '未记录'}`,
          ...(category.findings.length
            ? category.findings.map(
                (finding) =>
                  `- ${finding.severity || 'medium'}：${finding.message || finding.title || '未记录'}${finding.file ? `（${finding.file}）` : ''}`,
              )
            : ['- 暂无问题。']),
        ])
      : ['- 暂无 Review 分类。']),
    '',
    '## Review 门禁',
    `- 可进入 QA：${gate.canAdvanceToQa ? '是' : '否'}`,
    ...(gate.blockers?.length ? gate.blockers.map((item) => `- ${item}`) : ['- 暂无阻塞。']),
    '',
    '## QA 交接摘要',
    `- 状态：${qaHandoff.status === 'ready' ? '已就绪' : '被阻塞'}`,
    `- 提交：${qaHandoff.commitHash || report.commitHash || '未记录'}`,
    ...(qaHandoff.focusAreas?.length
      ? qaHandoff.focusAreas.map((item) => `- 关注点：${item}`)
      : ['- 关注点：未记录。']),
    '',
    '## 下一步',
    ...report.nextActions.map((item) => `- ${item}`),
  ].join('\n');
}

function createQaReviewHandoffArtifact(project, report) {
  const existing = stripReviewHandoffSection(
    String(project.artifacts?.[STAGE_IDS.QA] || generateArtifact(project, STAGE_IDS.QA)).trim(),
  );
  const section = formatReviewHandoffSection(report).join('\n');
  const testCasesHeading = '\n## 测试用例';

  if (existing.includes(testCasesHeading)) {
    return existing.replace(testCasesHeading, `\n${section}${testCasesHeading}`);
  }

  return [existing, '', section].filter(Boolean).join('\n');
}

function stripReviewHandoffSection(artifact) {
  return artifact.replace(/\n?## Review 交接[\s\S]*?(?=\n## |$)/, '').trim();
}

function formatReviewHandoffSection(report) {
  const source = report.sourceChangePackage || {};
  const qaHandoff = report.qaHandoff || {};

  return [
    '## Review 交接',
    `- 状态：${qaHandoff.status === 'ready' ? '已就绪' : '被阻塞'}`,
    `- 提交：${qaHandoff.commitHash || report.commitHash || source.commitHash || '未记录'}`,
    `- 变更文件数：${source.filesChangedCount || source.filesChanged?.length || 0}`,
    ...(source.filesChanged?.length ? source.filesChanged.map((file) => `- 变更文件：${file}`) : []),
    ...(qaHandoff.focusAreas?.length
      ? qaHandoff.focusAreas.map((item) => `- 测试关注：${item}`)
      : ['- 测试关注：未记录。']),
    ...(qaHandoff.requiredEvidence?.length
      ? qaHandoff.requiredEvidence.map((item) => `- 必需证据：${item}`)
      : ['- 必需证据：未记录。']),
    ...(qaHandoff.blockers?.length
      ? qaHandoff.blockers.map((item) => `- 阻塞项：${item}`)
      : ['- 阻塞项：暂无。']),
  ];
}

function createQaRunArtifact(project, qaRun) {
  return [
    `# QA 测试报告: ${project.name}`,
    '',
    `状态：${qaRun.status === 'passed' ? '通过' : '需处理'}`,
    `提交：${qaRun.commitHash || '未记录'}`,
    `用例：${qaRun.passedCount}/${qaRun.totalCount} 通过`,
    '',
    ...formatReviewHandoffSection({
      commitHash: qaRun.commitHash,
      sourceChangePackage: project.codeReviewReport?.sourceChangePackage,
      qaHandoff: qaRun.reviewHandoff,
    }),
    '',
    ...formatQaCoveragePlanSection(qaRun.coveragePlan),
    '',
    ...formatQaEvidenceSection(project.qaEvidence),
    '',
    '## 测试用例',
    ...qaRun.testCases.map(
      (testCase) =>
        `- ${testCase.title}：${testCase.status}${testCase.evidence ? `（${testCase.evidence}）` : ''}`,
    ),
    '',
    '## 阻塞项',
    ...(qaRun.blockers.length ? qaRun.blockers.map((item) => `- ${item}`) : ['- 暂无。']),
    '',
    '## 缺陷',
    ...(qaRun.defects.length
      ? qaRun.defects.map((item) => `- ${item.title}${item.detail ? `：${item.detail}` : ''}`)
      : ['- 暂无。']),
    '',
    ...formatQaDefectRoutingSection(qaRun.defectRouting),
    '',
    '## 下一步',
    ...qaRun.nextActions.map((item) => `- ${item}`),
  ].join('\n');
}

function createDefectFixDevelopmentArtifact(project, defectFixPackage, developmentPlan) {
  const existing = stripDefectFixPackageSection(
    String(project.artifacts?.[STAGE_IDS.DEVELOPMENT] || generateArtifact(project, STAGE_IDS.DEVELOPMENT)).trim(),
  );
  return [
    existing,
    '',
    ...formatDefectFixPackageSection(defectFixPackage),
    '',
    '## 修复开发任务',
    ...developmentPlan.tasks.map((task) => `- ${task.title}：${task.description || '按 QA 缺陷修复包处理。'}`),
    '',
    '## 修复检查命令',
    ...developmentPlan.verificationCommands.map((command) => `- ${command}`),
  ].filter(Boolean).join('\n');
}

function createDefectLoopArtifact(project, defectFixPackage) {
  return [
    `# 缺陷回归: ${project.name}`,
    '',
    ...formatDefectFixPackageSection(defectFixPackage),
    '',
    '## 回归要求',
    '- 修复提交必须重新通过本地检查、代码 Review 和 QA。',
    '- 回归测试必须覆盖失败用例和 Review 交接关注点。',
    '- 缺陷关闭前必须保留修复提交、测试结果和剩余风险。',
  ].join('\n');
}

function stripDefectFixPackageSection(artifact) {
  return artifact.replace(/\n?## QA 缺陷修复包[\s\S]*?(?=\n## |$)/, '').trim();
}

function formatDefectFixPackageSection(defectFixPackage) {
  const submission = defectFixPackage.repairSubmission;
  return [
    '## QA 缺陷修复包',
    `- 状态：${defectFixPackageStatusLabel(defectFixPackage.status)} (${defectFixPackage.status})`,
    `- 来源提交：${defectFixPackage.sourceCommitHash || '未记录'}`,
    `- QA 通过率：${defectFixPackage.qaPassRate || '未记录'}`,
    `- 生成人：${defectFixPackage.createdBy || '未记录'}`,
    `- 生成时间：${defectFixPackage.createdAt || '未记录'}`,
    ...(defectFixPackage.note ? [`- 备注：${defectFixPackage.note}`] : []),
    ...(defectFixPackage.reasons.length
      ? defectFixPackage.reasons.map((item) => `- 回流原因：${item}`)
      : ['- 回流原因：未记录。']),
    ...(defectFixPackage.failingTestCases.length
      ? defectFixPackage.failingTestCases.map(
          (item) => `- 失败用例：${item.title || item.id}（${item.status}${item.evidence ? `，${item.evidence}` : ''}）`,
        )
      : ['- 失败用例：未记录。']),
    ...(defectFixPackage.requiredFixes.length
      ? defectFixPackage.requiredFixes.map((item) => `- 必修项：${item}`)
      : ['- 必修项：未记录。']),
    ...(defectFixPackage.regressionFocus.length
      ? defectFixPackage.regressionFocus.map((item) => `- 回归关注：${item}`)
      : ['- 回归关注：未记录。']),
    ...(submission
      ? [
          `- 修复提交状态：${defectFixRepairSubmissionStatusLabel(submission.status)} (${submission.status})`,
          `- 修复提交：${submission.commitHash || '未记录'}`,
          `- 代码 Review：${submission.reviewedBy || '未记录'}`,
          `- QA 复测提交：${submission.qaRetestCommitHash || '未记录'}`,
          `- QA 复测通过率：${submission.qaRetestPassRate || '未记录'}`,
          ...(submission.requiredGates.length
            ? submission.requiredGates.map((item) => `- 剩余门禁：${item}`)
            : ['- 剩余门禁：无。']),
        ]
      : []),
  ];
}

function defectFixPackageStatusLabel(status) {
  const labels = {
    ready: '已就绪',
    blocked: '被阻塞',
    reviewing: 'Review 复审中',
    'qa-retest': 'QA 复测中',
    closed: '已关闭',
  };
  return labels[status] || '被阻塞';
}

function defectFixRepairSubmissionStatusLabel(status) {
  const labels = {
    reviewing: 'Review 复审中',
    'qa-retest': 'QA 复测中',
    closed: '已关闭',
    blocked: '被阻塞',
  };
  return labels[status] || '被阻塞';
}

function formatQaCoveragePlanSection(coveragePlan) {
  if (!coveragePlan) {
    return ['## 覆盖计划', '- 暂未生成覆盖计划。'];
  }

  return [
    '## 覆盖计划',
    `- 来源：${coveragePlan.source || '未记录'}`,
    `- 提交：${coveragePlan.commitHash || '未记录'}`,
    ...(coveragePlan.focusAreas?.length
      ? coveragePlan.focusAreas.map((item) => `- 覆盖关注：${item}`)
      : ['- 覆盖关注：未记录。']),
    ...(coveragePlan.requiredEvidence?.length
      ? coveragePlan.requiredEvidence.map((item) => `- 证据要求：${item}`)
      : ['- 证据要求：未记录。']),
  ];
}

function formatQaDefectRoutingSection(defectRouting) {
  if (!defectRouting) {
    return ['## 缺陷回流', '- 暂未生成缺陷回流判断。'];
  }

  return [
    '## 缺陷回流',
    `- 是否回流开发：${defectRouting.shouldReturnToDevelopment ? '是' : '否'}`,
    `- 目标阶段：${formatQaRoutingTarget(defectRouting.targetStageId)}`,
    ...(defectRouting.reasons?.length
      ? defectRouting.reasons.map((item) => `- 原因：${item}`)
      : ['- 原因：暂无。']),
  ];
}

function formatQaRoutingTarget(targetStageId) {
  const labels = {
    [STAGE_IDS.DEVELOPMENT]: '自动开发',
    [STAGE_IDS.QA]: '测试阶段补证据',
    [STAGE_IDS.ACCEPTANCE]: '最终验收',
  };

  return labels[targetStageId] || targetStageId || '未记录';
}

function createAcceptancePackageArtifact(project, acceptancePackage) {
  return [
    `# 最终验收包: ${project.name}`,
    '',
    `状态：${acceptancePackage.status === 'ready' ? '已就绪' : '需补齐'}`,
    `签收状态：${acceptancePackage.signoffStatus === 'pending' ? '待负责人签收' : acceptancePackage.signoffStatus}`,
    `生成：${acceptancePackage.generatedBy || '系统'} · ${acceptancePackage.generatedAt || '未记录'}`,
    `签收人：${acceptancePackage.signedOffBy || '未签收'}`,
    `签收时间：${acceptancePackage.signedOffAt || '未记录'}`,
    `签收意见：${acceptancePackage.signoffOpinion || '未记录'}`,
    `归档版本：${acceptancePackage.archiveVersion || '未归档'}`,
    '',
    '## 交付清单',
    ...acceptancePackage.deliverables.map(
      (item) => `- ${item.title}：${item.status === 'ready' ? '已就绪' : '缺失'}（${item.evidence}）`,
    ),
    '',
    '## QA 结论',
    `- 状态：${acceptancePackage.qa.status}`,
    `- 用例：${acceptancePackage.qa.passedCount}/${acceptancePackage.qa.totalCount} 通过`,
    `- 提交：${acceptancePackage.qa.commitHash || '未记录'}`,
    `- 测试证据：${acceptancePackage.qa.evidenceStatus}`,
    `- 样本：${acceptancePackage.qa.sampleSet || '未记录'}`,
    `- 测试时长：${acceptancePackage.qa.durationMinutes || 0} 分钟`,
    `- 环境：${acceptancePackage.qa.environment || '未记录'}`,
    `- 浏览器范围：${acceptancePackage.qa.browserScope || '未记录'}`,
    Number.isFinite(acceptancePackage.qa.falsePositiveRate)
      ? `- 误检率：${formatEvidencePercent(acceptancePackage.qa.falsePositiveRate)}（目标低于 ${formatEvidencePercent(acceptancePackage.qa.falsePositiveThreshold ?? 0.3)}，${acceptancePackage.qa.falsePositivePassed ? '已通过' : '未通过'}）`
      : '',
    '',
    '## 运维交接',
    `- 状态：${acceptancePackage.ops.status === 'ready' ? '已就绪' : '缺失'}`,
    `- 说明：${acceptancePackage.ops.evidence || '未记录'}`,
    '',
    '## 剩余风险',
    ...(acceptancePackage.residualRisks.length
      ? acceptancePackage.residualRisks.map(
          (risk) => `- ${risk.stageName || risk.stageId} / ${risk.riskLevel}：${risk.title}${risk.detail ? `（${risk.detail}）` : ''}`,
        )
      : ['- 暂无。']),
    '',
    '## 阻塞项',
    ...(acceptancePackage.blockers.length
      ? acceptancePackage.blockers.map((item) => `- ${item}`)
      : ['- 暂无。']),
    '',
    '## 下一步',
    ...acceptancePackage.nextActions.map((item) => `- ${item}`),
  ].join('\n');
}

function createDevelopmentChangePackageArtifact(project, changePackage) {
  const audit = changePackage.repositoryAudit || {};
  const verification = changePackage.verification || {};
  const gate = changePackage.reviewGate || {};

  return [
    `# 开发变更包: ${project.name}`,
    '',
    `状态：${changePackage.status === 'ready-for-review' ? '可进入 Review' : '存在阻塞'}`,
    `生成时间：${changePackage.createdAt || '未记录'}`,
    `提交：${changePackage.commitHash || '未记录'}`,
    `摘要：${changePackage.summary || '未记录'}`,
    '',
    '## 仓库审计',
    `- 执行分支：${audit.after?.branch || audit.before?.branch || '未记录'}`,
    `- 执行前 HEAD：${audit.before?.head || '未记录'}`,
    `- 执行后 HEAD：${audit.after?.head || '未记录'}`,
    `- 提交状态：${audit.committed ? '已产生提交' : '未产生新提交'}`,
    `- 执行前工作区：${audit.before?.changedFiles?.length ? `${audit.before.changedFiles.length} 个变更` : '干净'}`,
    `- 执行后工作区：${audit.after?.changedFiles?.length ? `${audit.after.changedFiles.length} 个变更` : '干净'}`,
    '',
    '## 变更文件',
    ...(changePackage.filesChanged.length
      ? changePackage.filesChanged.map((file) => `- ${file}`)
      : ['- 未记录。']),
    '',
    '## 任务结果',
    ...(changePackage.tasks.length
      ? changePackage.tasks.map(
          (task) => `- ${task.area || '开发'} / ${task.status}：${task.title}${task.result ? `（${task.result}）` : ''}`,
        )
      : ['- 未记录。']),
    '',
    '## 本地检查',
    `- 总数：${verification.total || 0}`,
    `- 通过：${verification.passed || 0}`,
    `- 失败：${verification.failed || 0}`,
    `- 阻塞：${verification.blocked || 0}`,
    '',
    '## Review 门禁',
    `- 可开始 Review：${gate.canStartReview ? '是' : '否'}`,
    ...(gate.blockers?.length ? gate.blockers.map((item) => `- ${item}`) : ['- 暂无阻塞。']),
  ].join('\n');
}

function createQaEvidenceArtifact(project, qaEvidence) {
  const existing = stripQaEvidenceSection(
    String(project.artifacts?.[STAGE_IDS.QA] || generateArtifact(project, STAGE_IDS.QA)).trim(),
  );
  const evidenceSection = formatQaEvidenceSection(qaEvidence).join('\n');
  const testCasesHeading = '\n## 测试用例';

  if (existing.includes(testCasesHeading)) {
    return existing.replace(testCasesHeading, `\n${evidenceSection}${testCasesHeading}`);
  }

  return [existing, '', evidenceSection].filter(Boolean).join('\n');
}

function stripQaEvidenceSection(artifact) {
  return artifact.replace(/\n?## 测试证据[\s\S]*?(?=\n## |$)/, '').trim();
}

function formatQaEvidenceSection(qaEvidence) {
  if (!qaEvidence) {
    return ['## 测试证据', '- 暂未记录测试样本、测试时长、测试环境和浏览器范围。'];
  }

  const hasFalsePositiveEvidence =
    qaEvidence.requireFalsePositiveMetrics ||
    Number.isInteger(qaEvidence.totalDetections) ||
    Number.isInteger(qaEvidence.falsePositiveCount);

  return [
    '## 测试证据',
    `- 状态：${qaEvidence.status === 'ready' ? '测试证据已就绪' : '测试证据待补充'}`,
    `- 测试视频样本：${qaEvidence.sampleSet || '待补充'}`,
    `- 测试时长：${qaEvidence.durationMinutes ? `${qaEvidence.durationMinutes} 分钟` : '待补充'}`,
    `- 测试环境：${qaEvidence.environment || '待补充'}`,
    `- 浏览器范围：${qaEvidence.browserScope || '待补充'}`,
    hasFalsePositiveEvidence
      ? `- 总检测次数：${Number.isInteger(qaEvidence.totalDetections) ? qaEvidence.totalDetections : '待补充'}`
      : '',
    hasFalsePositiveEvidence
      ? `- 误检次数：${Number.isInteger(qaEvidence.falsePositiveCount) ? qaEvidence.falsePositiveCount : '待补充'}`
      : '',
    hasFalsePositiveEvidence
      ? `- 误检率：${Number.isFinite(qaEvidence.falsePositiveRate) ? formatEvidencePercent(qaEvidence.falsePositiveRate) : '待补充'}`
      : '',
    hasFalsePositiveEvidence
      ? `- 误检率门禁：${formatFalsePositiveGateStatus(qaEvidence)}`
      : '',
    qaEvidence.notes ? `- 备注：${qaEvidence.notes}` : '',
  ].filter(Boolean);
}

function formatFalsePositiveGateStatus(qaEvidence) {
  const threshold = formatEvidencePercent(qaEvidence.falsePositiveThreshold ?? 0.3);
  if (qaEvidence.qualityGateStatus === 'passed') {
    return `已通过，目标低于 ${threshold}`;
  }
  if (qaEvidence.qualityGateStatus === 'failed') {
    return `未通过，目标低于 ${threshold}`;
  }
  return `待补充，目标低于 ${threshold}`;
}

function formatEvidencePercent(value) {
  const normalized = Number(value);
  if (!Number.isFinite(normalized)) {
    return '待补充';
  }
  const percentValue = normalized > 1 ? normalized : normalized * 100;
  return `${Math.round(percentValue)}%`;
}

function updateProject(project, { currentStageId, stageUpdates = [], artifactStageId, historyEvent }) {
  const now = new Date().toISOString();
  const stageUpdateMap = new Map(stageUpdates.map((item) => [item.id, item.status]));
  const next = {
    ...project,
    requirementQuestions: project.requirementQuestions || REQUIREMENT_QUESTIONS.map((item) => ({ ...item })),
    requirementAnswers: project.requirementAnswers || {},
    prdStatus: project.prdStatus || 'draft',
    currentStageId: currentStageId || project.currentStageId,
    updatedAt: now,
    stages: project.stages.map((stage) => ({
      ...stage,
      status: stageUpdateMap.get(stage.id) || stage.status,
    })),
    artifacts: { ...project.artifacts },
    history: [
      {
        ...historyEvent,
        note: historyEvent.note || '',
        at: now,
      },
      ...project.history,
    ],
  };

  if (artifactStageId && !next.artifacts[artifactStageId]) {
    next.artifacts[artifactStageId] = generateArtifact(next, artifactStageId);
  }

  return next;
}

function findStageIndex(project, stageId) {
  const index = project.stages.findIndex((stage) => stage.id === stageId);
  if (index === -1) {
    throw new Error(`项目缺少阶段: ${stageId}`);
  }
  return index;
}

function cleanRequired(value, label) {
  const cleaned = String(value || '').trim();
  if (!cleaned) {
    throw new Error(`${label}不能为空`);
  }
  return cleaned;
}

function normalizeRepositoryInspection(inspection, repositoryConfig = {}) {
  if (!inspection) {
    return null;
  }

  const status = ['ready', 'warning', 'blocked'].includes(inspection.status)
    ? inspection.status
    : 'blocked';
  const changedFiles = Array.isArray(inspection.changedFiles)
    ? inspection.changedFiles.map((item) => String(item || '').trim()).filter(Boolean)
    : [];

  return {
    status,
    inspectedAt: String(inspection.inspectedAt || '').trim(),
    localPath: String(inspection.localPath || repositoryConfig.localPath || '').trim(),
    gitRoot: String(inspection.gitRoot || '').trim(),
    currentBranch: String(inspection.currentBranch || '').trim(),
    baseBranch: String(inspection.baseBranch || repositoryConfig.baseBranch || 'main').trim(),
    targetBranch: String(inspection.targetBranch || repositoryConfig.targetBranch || '').trim(),
    isGitRepository: Boolean(inspection.isGitRepository),
    targetBranchExists: Boolean(inspection.targetBranchExists),
    hasUncommittedChanges: Boolean(inspection.hasUncommittedChanges),
    changedFilesCount: Number.isFinite(inspection.changedFilesCount)
      ? inspection.changedFilesCount
      : changedFiles.length,
    changedFiles,
    canPrepareBranch: Boolean(inspection.canPrepareBranch),
    issues: normalizeStringList(inspection.issues),
    recommendations: normalizeStringList(inspection.recommendations),
  };
}

function normalizeBranchPreparation(preparation, repositoryConfig = {}) {
  if (!preparation) {
    return null;
  }

  const status = ['ready', 'blocked', 'failed'].includes(preparation.status)
    ? preparation.status
    : 'blocked';

  return {
    status,
    preparedAt: String(preparation.preparedAt || '').trim(),
    localPath: String(preparation.localPath || repositoryConfig.localPath || '').trim(),
    previousBranch: String(preparation.previousBranch || '').trim(),
    currentBranch: String(preparation.currentBranch || '').trim(),
    baseBranch: String(preparation.baseBranch || repositoryConfig.baseBranch || 'main').trim(),
    targetBranch: String(preparation.targetBranch || repositoryConfig.targetBranch || '').trim(),
    targetBranchExisted: Boolean(preparation.targetBranchExisted),
    createdBranch: Boolean(preparation.createdBranch),
    checkedOut: Boolean(preparation.checkedOut),
    canRunDevelopment: Boolean(preparation.canRunDevelopment),
    issues: normalizeStringList(preparation.issues),
    recommendations: normalizeStringList(preparation.recommendations),
  };
}

function normalizeRepositoryBootstrap(bootstrap) {
  if (!bootstrap) {
    return null;
  }

  const status = ['ready', 'blocked', 'failed'].includes(bootstrap.status)
    ? bootstrap.status
    : 'blocked';

  return {
    status,
    bootstrappedAt: String(bootstrap.bootstrappedAt || '').trim(),
    localPath: String(bootstrap.localPath || '').trim(),
    currentBranch: String(bootstrap.currentBranch || '').trim(),
    gitInitialized: Boolean(bootstrap.gitInitialized),
    initialCommitCreated: Boolean(bootstrap.initialCommitCreated),
    filesCreated: normalizeStringList(bootstrap.filesCreated),
    issues: normalizeStringList(bootstrap.issues),
    recommendations: normalizeStringList(bootstrap.recommendations),
  };
}

function normalizeDefectFixPackage(defectFixPackage) {
  if (!defectFixPackage) {
    return null;
  }

  const failingTestCases = Array.isArray(defectFixPackage.failingTestCases)
    ? defectFixPackage.failingTestCases
        .map((testCase) => ({
          id: String(testCase.id || '').trim(),
          title: String(testCase.title || testCase.id || '').trim(),
          status: String(testCase.status || 'not-run').trim(),
          evidence: String(testCase.evidence || '').trim(),
        }))
        .filter((testCase) => testCase.id || testCase.title)
    : [];

  const allowedStatuses = ['ready', 'blocked', 'executing', 'review-ready', 'reviewing', 'qa-retest', 'closed'];

  return {
    status: allowedStatuses.includes(defectFixPackage.status) ? defectFixPackage.status : 'blocked',
    createdAt: String(defectFixPackage.createdAt || '').trim(),
    createdBy: String(defectFixPackage.createdBy || '').trim(),
    sourceStageId: String(defectFixPackage.sourceStageId || STAGE_IDS.QA).trim(),
    targetStageId: String(defectFixPackage.targetStageId || STAGE_IDS.DEVELOPMENT).trim(),
    sourceCommitHash: String(defectFixPackage.sourceCommitHash || '').trim(),
    qaRunStatus: String(defectFixPackage.qaRunStatus || '').trim(),
    qaPassRate: String(defectFixPackage.qaPassRate || '').trim(),
    note: String(defectFixPackage.note || '').trim(),
    reasons: normalizeStringList(defectFixPackage.reasons),
    failingTestCases,
    requiredFixes: normalizeStringList(defectFixPackage.requiredFixes),
    regressionFocus: [...new Set(normalizeStringList(defectFixPackage.regressionFocus))],
    repairSubmission: normalizeDefectFixRepairSubmission(defectFixPackage.repairSubmission),
  };
}

function normalizeDefectFixRepairSubmission(submission) {
  if (!submission) {
    return null;
  }

  const allowedStatuses = ['ready', 'executing', 'review-ready', 'reviewing', 'qa-retest', 'closed', 'blocked'];
  return {
    status: allowedStatuses.includes(submission.status) ? submission.status : 'blocked',
    submittedAt: String(submission.submittedAt || '').trim(),
    submittedBy: String(submission.submittedBy || '').trim(),
    reviewedAt: String(submission.reviewedAt || '').trim(),
    reviewedBy: String(submission.reviewedBy || '').trim(),
    closedAt: String(submission.closedAt || '').trim(),
    closedBy: String(submission.closedBy || '').trim(),
    commitHash: String(submission.commitHash || '').trim(),
    filesChanged: normalizeStringList(submission.filesChanged),
    qaRetestCommitHash: String(submission.qaRetestCommitHash || '').trim(),
    qaRetestPassRate: String(submission.qaRetestPassRate || '').trim(),
    sourceStageId: String(submission.sourceStageId || '').trim(),
    targetStageId: String(submission.targetStageId || '').trim(),
    requiredGates: normalizeStringList(submission.requiredGates),
    jobId: String(submission.jobId || '').trim(),
    jobStatus: String(submission.jobStatus || '').trim(),
    jobQueuedAt: String(submission.jobQueuedAt || '').trim(),
    jobStartedAt: String(submission.jobStartedAt || '').trim(),
    jobFinishedAt: String(submission.jobFinishedAt || '').trim(),
    jobUpdatedBy: String(submission.jobUpdatedBy || '').trim(),
    jobUpdatedAt: String(submission.jobUpdatedAt || '').trim(),
    jobCommand: String(submission.jobCommand || '').trim(),
    jobExitCode: Number.isInteger(submission.jobExitCode) ? submission.jobExitCode : null,
    jobDurationMs: Number.isFinite(submission.jobDurationMs) ? submission.jobDurationMs : 0,
    jobResultSummary: String(submission.jobResultSummary || '').trim(),
    jobErrorSummary: String(submission.jobErrorSummary || '').trim(),
    jobStdout: String(submission.jobStdout || '').trim(),
    jobStderr: String(submission.jobStderr || '').trim(),
    sandboxPolicy: String(submission.sandboxPolicy || '').trim(),
    blockedCommand: String(submission.blockedCommand || '').trim(),
  };
}

function normalizeStringList(items = []) {
  return Array.isArray(items) ? items.map((item) => String(item || '').trim()).filter(Boolean) : [];
}

function makeProjectId(name) {
  const slug =
    String(name || 'project')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 32) || 'project';
  const suffix = globalThis.crypto?.randomUUID?.().slice(0, 8) || Date.now().toString(36);
  return `${slug}-${suffix}`;
}
