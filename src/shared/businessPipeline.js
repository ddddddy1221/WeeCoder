export const PIPELINE_BANDS = Object.freeze([
  {
    id: 'requirements',
    label: '需求带',
    description: '从业务目标到可审批的需求文档版本。',
  },
  {
    id: 'design',
    label: '设计带',
    description: '确认交互路径、数据模型、技术方案和运维前置条件。',
  },
  {
    id: 'build',
    label: '构建带',
    description: '完成代码实现、集成和发布准备。',
  },
  {
    id: 'verification',
    label: '验证带',
    description: '完成用例设计、测试执行、白盒审查和缺陷回流。',
  },
  {
    id: 'release',
    label: '发布带',
    description: '完成部署记录、最终验收和交付归档。',
  },
]);

export const PIPELINE_STAGE_DEFINITIONS = Object.freeze([
  {
    id: 'requirement-submission',
    order: 1,
    name: '需求提交 / BRD',
    band: 'requirements',
    ownerRole: '总负责人',
    operatingMode: '人工负责',
    automationStatus: '暂不自动化',
    humanGate: '业务目标、发起人、优先级和初始范围必须由负责人确认。',
    requiredArtifacts: ['业务背景', '项目目标', '负责人', '优先级'],
    entryCriteria: ['项目被创建'],
    exitCriteria: ['项目目标和初始范围已说明'],
    workflowStageIds: ['intake'],
  },
  {
    id: 'requirement-clarification',
    order: 2,
    name: '需求澄清',
    band: 'requirements',
    ownerRole: '项目经理',
    operatingMode: 'AI 辅助',
    automationStatus: '已接入需求追问和质检',
    humanGate: '项目经理确认目标用户、核心场景、范围、指标、权限和依赖。',
    requiredArtifacts: ['结构化需求答案', '缺失项清单', '需求质检记录'],
    entryCriteria: ['业务目标已存在'],
    exitCriteria: ['关键问题已补齐到可生成需求文档'],
    workflowStageIds: ['pm-requirements'],
  },
  {
    id: 'prd-generation-approval',
    order: 3,
    name: '需求文档生成与审批',
    band: 'requirements',
    ownerRole: '项目经理 / 总负责人',
    operatingMode: 'AI 辅助 + 系统闸口',
    automationStatus: '已接入需求文档版本和变更过期阻断',
    humanGate: '总负责人确认需求文档范围、验收标准和版本冻结。',
    requiredArtifacts: ['需求文档版本', '变更影响记录', '审批意见'],
    entryCriteria: ['需求质检通过'],
    exitCriteria: ['需求文档质量检查通过且版本冻结'],
    workflowStageIds: ['prd-approval'],
  },
  {
    id: 'ui-interaction-design',
    order: 4,
    name: 'UI / 交互设计',
    band: 'design',
    ownerRole: '产品 / 设计',
    operatingMode: '人工负责，后续 AI 辅助',
    automationStatus: '待接入结构化设计产物',
    humanGate: '产品或设计确认核心用户路径和关键页面交互。',
    requiredArtifacts: ['页面流程', '交互说明', '线框图或截图'],
    entryCriteria: ['需求文档已审批'],
    exitCriteria: ['核心用户路径可评审'],
    workflowStageIds: ['architecture'],
  },
  {
    id: 'erd-technical-design',
    order: 5,
    name: 'ERD / 技术设计',
    band: 'design',
    ownerRole: '技术负责人',
    operatingMode: 'AI 主导 + 技术负责人审批',
    automationStatus: '已有架构与技术交接基础',
    humanGate: '技术负责人审批数据模型、接口契约和任务拆分。',
    requiredArtifacts: ['ERD', '接口契约', '模块边界', '任务拆分'],
    entryCriteria: ['需求文档已审批'],
    exitCriteria: ['数据模型和服务契约已审批'],
    workflowStageIds: ['architecture'],
  },
  {
    id: 'ops-requirements',
    order: 6,
    name: '运维需求',
    band: 'design',
    ownerRole: '运维',
    operatingMode: 'AI 辅助',
    automationStatus: '已有运维需求清单',
    humanGate: '运维确认运行环境、密钥、网络和部署约束。',
    requiredArtifacts: ['运行环境', '环境变量', '密钥清单', '网络和部署约束'],
    entryCriteria: ['技术方案已形成'],
    exitCriteria: ['开发前置运行条件已确认'],
    workflowStageIds: ['ops-requirements'],
  },
  {
    id: 'implementation-integration',
    order: 7,
    name: '代码编写与集成',
    band: 'build',
    ownerRole: 'AI 开发 / 技术负责人',
    operatingMode: 'AI 主导',
    automationStatus: '已接入 AI 开发任务包和本地检查',
    humanGate: '技术负责人确认变更范围和可审查性。',
    requiredArtifacts: ['变更包', '提交记录', '自测结果', '实现说明'],
    entryCriteria: ['需求文档、技术设计和运维前置条件就绪'],
    exitCriteria: ['构建 / 测试通过，变更包可审查'],
    workflowStageIds: ['development'],
  },
  {
    id: 'test-case-design',
    order: 8,
    name: '测试用例编写',
    band: 'verification',
    ownerRole: '测试',
    operatingMode: 'AI 辅助',
    automationStatus: '已有 QA 计划和证据模型',
    humanGate: '测试确认功能、边界、回归和验收指标覆盖完整。',
    requiredArtifacts: ['功能用例', '边界用例', '回归用例', '验收指标'],
    entryCriteria: ['需求文档和 Review 交接重点可追溯'],
    exitCriteria: ['用例覆盖需求文档和 Review 交接重点'],
    workflowStageIds: ['qa'],
  },
  {
    id: 'black-box-testing',
    order: 9,
    name: '黑盒测试',
    band: 'verification',
    ownerRole: '测试',
    operatingMode: '人工负责 + 自动化辅助',
    automationStatus: '已有 QA 执行记录和缺陷回流',
    humanGate: '测试确认真实执行记录、截图、日志和缺陷结论。',
    requiredArtifacts: ['执行记录', '缺陷', '截图 / 日志', '通过率'],
    entryCriteria: ['测试用例和测试环境就绪'],
    exitCriteria: ['关键路径通过或缺陷已路由'],
    workflowStageIds: ['qa'],
  },
  {
    id: 'white-box-security-quality',
    order: 10,
    name: '白盒测试 / 安全 / 质量审查',
    band: 'verification',
    ownerRole: '技术负责人',
    operatingMode: 'AI 主导 + 技术负责人审批',
    automationStatus: '已接入代码、安全、性能审查',
    humanGate: '技术负责人确认没有阻塞级代码、安全或性能风险。',
    requiredArtifacts: ['代码审查报告', '安全问题', '性能问题'],
    entryCriteria: ['开发变更包已就绪'],
    exitCriteria: ['无阻塞级代码 / 安全 / 性能风险'],
    workflowStageIds: ['review'],
  },
  {
    id: 'ops-release-preparation',
    order: 11,
    name: '运维脚本与发布准备',
    band: 'build',
    ownerRole: '运维 / AI 开发',
    operatingMode: 'AI 辅助',
    automationStatus: '待接入结构化脚本产物',
    humanGate: '运维确认启停、重启、回滚和日志查看方式。',
    requiredArtifacts: ['启停脚本', '部署说明', '回滚说明'],
    entryCriteria: ['代码变更和运维需求可追溯'],
    exitCriteria: ['部署包可重复执行'],
    workflowStageIds: ['development', 'ops-requirements'],
  },
  {
    id: 'deployment',
    order: 12,
    name: '运维部署',
    band: 'release',
    ownerRole: '运维',
    operatingMode: '人工负责',
    automationStatus: '暂不自动执行真实部署',
    humanGate: '运维记录部署环境、版本和操作人。',
    requiredArtifacts: ['部署记录', '环境', '版本', '操作人'],
    entryCriteria: ['部署包和回滚说明已准备'],
    exitCriteria: ['服务已部署或部署决策已记录'],
    workflowStageIds: ['acceptance'],
  },
  {
    id: 'final-acceptance',
    order: 13,
    name: '最终验收',
    band: 'release',
    ownerRole: '总负责人',
    operatingMode: '人工负责 + 系统闸口',
    automationStatus: '已有验收包生成能力',
    humanGate: '总负责人签收或指定退回阶段。',
    requiredArtifacts: ['验收包', '签收结论', '遗留风险'],
    entryCriteria: ['部署记录、QA 证据和运维交接已存在'],
    exitCriteria: ['负责人签收或退回指定阶段'],
    workflowStageIds: ['acceptance'],
  },
]);

export const PIPELINE_CONDITIONAL_LOOPS = Object.freeze([
  {
    id: 'defect-loop',
    name: '缺陷回归',
    band: 'verification',
    ownerRole: 'AI 开发 / 测试',
    operatingMode: '条件回流',
    automationStatus: '已有 QA 缺陷修复包和回归闸口',
    workflowStageIds: ['defect-loop'],
  },
]);

export function createProjectPipelineView(project = {}, { selectedStageId = '' } = {}) {
  const workflowStages = Array.isArray(project.stages) ? project.stages : [];
  const workflowStageMap = new Map(workflowStages.map((stage) => [stage.id, stage]));
  const activeWorkflowStageId = selectedStageId || project.currentStageId || '';
  const stages = PIPELINE_STAGE_DEFINITIONS.map((stage) =>
    createPipelineStageCard(stage, workflowStageMap, activeWorkflowStageId, project),
  );
  const conditionalLoops = PIPELINE_CONDITIONAL_LOOPS.map((stage) =>
    createPipelineStageCard(stage, workflowStageMap, activeWorkflowStageId, project),
  );
  const bands = PIPELINE_BANDS.map((band) => {
    const bandStages = stages.filter((stage) => stage.band === band.id);
    const bandLoops = conditionalLoops.filter((stage) => stage.band === band.id);
    const currentCount = bandStages.filter((stage) => stage.status === 'active').length;
    const blockedCount = bandStages.filter((stage) => stage.status === 'blocked').length;
    const completeCount = bandStages.filter((stage) => stage.status === 'approved').length;
    const visibleStages = [...bandStages, ...bandLoops.filter((stage) => stage.status !== 'queued')];
    const requiredArtifacts = uniqueList(bandStages.flatMap((stage) => stage.requiredArtifacts || []));
    const humanGates = bandStages.map((stage) => stage.humanGate).filter(Boolean);

    return {
      ...band,
      stages: bandStages,
      visibleStages,
      artifactCount: requiredArtifacts.length,
      blockedCount,
      completeCount,
      currentCount,
      humanGateCount: humanGates.length,
      humanGates,
      nextAction: '先补齐当前业务带的必要产物，再推动下一阶段流转。',
      requiredArtifacts,
      status: blockedCount ? 'blocked' : currentCount ? 'active' : completeCount === bandStages.length ? 'approved' : 'queued',
    };
  });
  const activeStage =
    stages.find((stage) => stage.workflowStageIds.includes(activeWorkflowStageId)) ||
    stages.find((stage) => stage.status === 'active') ||
    stages[0];
  const activeBand = bands.find((band) => band.id === activeStage?.band) || bands[0];

  return {
    activeBand,
    activeStage,
    bands,
    conditionalLoops,
    stageCount: stages.length,
    stages,
    summary: {
      activeBandLabel: activeBand?.label || '',
      activeStageName: activeStage?.name || '',
      bandCount: bands.length,
      blockedCount: stages.filter((stage) => stage.status === 'blocked').length,
      completeCount: stages.filter((stage) => stage.status === 'approved').length,
      stageCount: stages.length,
    },
  };
}

function createPipelineStageCard(definition, workflowStageMap, activeWorkflowStageId, project = {}) {
  const workflowStages = definition.workflowStageIds
    .map((stageId) => workflowStageMap.get(stageId))
    .filter(Boolean);
  const workflowStatus = resolvePipelineStatus(definition.workflowStageIds, workflowStages, activeWorkflowStageId);
  const requiredArtifacts = normalizeList(definition.requiredArtifacts);
  const blockers = workflowStages.flatMap((stage) => normalizeList(stage.blockers));

  return {
    ...definition,
    artifactCount: requiredArtifacts.length,
    artifacts: createPipelineArtifactStatuses(definition, project, workflowStatus),
    blockers,
    humanGateCount: definition.humanGate ? 1 : 0,
    nextAction: pipelineStageNextAction({
      blockers,
      ownerRole: definition.ownerRole,
      requiredArtifacts,
      status: workflowStatus,
    }),
    status: workflowStatus,
    statusLabel: pipelineStatusLabel(workflowStatus),
    workflowStageIds: [...definition.workflowStageIds],
  };
}

function createPipelineArtifactStatuses(definition, project, stageStatus) {
  const requiredArtifacts = normalizeList(definition.requiredArtifacts);
  const isDownstreamStale = isPrdStale(project) && definition.band !== 'requirements' && stageStatus !== 'queued';
  const artifactText = definition.workflowStageIds
    .map((stageId) => project.artifacts?.[stageId] || '')
    .join('\n')
    .toLowerCase();
  const missingText = definition.workflowStageIds
    .flatMap((stageId) => normalizeList(project.stageConfirmations?.[stageId]?.missingItems))
    .map((item) => `${item.id || ''} ${item.title || ''} ${item.label || ''}`.toLowerCase())
    .join('\n');

  return requiredArtifacts.map((artifact) => {
    const normalizedArtifact = artifact.toLowerCase();
    const status = resolveArtifactStatus({
      artifactText,
      isDownstreamStale,
      missingText,
      normalizedArtifact,
      stageStatus,
    });

    return {
      name: artifact,
      status,
      statusLabel: artifactStatusLabel(status),
    };
  });
}

function resolveArtifactStatus({ artifactText, isDownstreamStale, missingText, normalizedArtifact, stageStatus }) {
  if (isDownstreamStale) {
    return 'stale';
  }

  if (missingText.includes(normalizedArtifact)) {
    return 'missing';
  }

  if (artifactText.includes(normalizedArtifact)) {
    return 'generated';
  }

  if (stageStatus === 'approved') {
    return 'approved';
  }

  if (stageStatus === 'queued') {
    return 'waiting';
  }

  return 'needs-confirmation';
}

function artifactStatusLabel(status) {
  const labels = {
    approved: '已确认',
    generated: '已生成',
    missing: '缺失',
    'needs-confirmation': '需确认',
    stale: '已过期',
    waiting: '等待前置',
  };

  return labels[status] || '待确认';
}

function isPrdStale(project = {}) {
  return project.prdVersion?.status === 'stale' || project.prdChangeImpact?.status === 'stale';
}

function resolvePipelineStatus(workflowStageIds, workflowStages, activeWorkflowStageId) {
  if (workflowStageIds.includes(activeWorkflowStageId)) {
    return 'active';
  }
  if (!workflowStages.length) {
    return 'queued';
  }
  if (workflowStages.some((stage) => stage.status === 'blocked')) {
    return 'blocked';
  }
  if (workflowStages.every((stage) => stage.status === 'approved')) {
    return 'approved';
  }
  if (workflowStages.some((stage) => stage.status === 'active')) {
    return 'active';
  }
  return 'queued';
}

function pipelineStatusLabel(status) {
  const labels = {
    active: '进行中',
    approved: '已完成',
    blocked: '已阻塞',
    queued: '等待中',
  };

  return labels[status] || '待确认';
}

function pipelineStageNextAction({ blockers, ownerRole, requiredArtifacts, status }) {
  const assignee = ownerRole || '负责人';
  const firstArtifact = requiredArtifacts[0] || '';

  if (status === 'blocked') {
    return blockers.length ? `先解除阻塞：${blockers[0]}。` : `先解除当前阶段阻塞，再提交${assignee}确认。`;
  }

  if (status === 'approved') {
    return '阶段已完成，可查看产物或切换下一阶段。';
  }

  if (status === 'queued') {
    return '等待前置阶段完成后启动。';
  }

  return `补齐${firstArtifact ? `${firstArtifact}等必要产物` : '必要产物'}，并完成${assignee}确认。`;
}

function normalizeList(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function uniqueList(values) {
  return [...new Set(normalizeList(values))];
}
