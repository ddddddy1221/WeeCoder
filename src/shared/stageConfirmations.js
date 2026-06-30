import { normalizeProjectMembers } from './projectMembers.js';
import { APP_USERS, findUserById } from './users.js';

export const STAGE_CONFIRMATION_DEFINITIONS = Object.freeze({
  intake: [
    {
      id: 'business-goal',
      title: '业务目标与负责人',
      description: '确认项目目标、发起人、业务负责人和优先级。',
    },
    {
      id: 'scope-seed',
      title: '初始范围与约束',
      description: '确认当前痛点、初始范围、关键约束和不做事项。',
    },
  ],
  'pm-requirements': [
    {
      id: 'target-users',
      title: '目标用户与核心场景',
      description: '确认目标用户、核心使用场景和主要业务动作。',
    },
    {
      id: 'success-metrics',
      title: '成功指标与验收口径',
      description: '确认可量化成功指标、验收口径和统计方式。',
    },
    {
      id: 'scope-boundary',
      title: '范围边界',
      description: '确认本期包含、不包含、后续再做和明确拒绝的内容。',
    },
    {
      id: 'data-compliance',
      title: '数据权限与合规',
      description: '确认数据来源、是否保存、访问权限、留存周期和隐私要求。',
    },
    {
      id: 'external-dependencies',
      title: '外部依赖',
      description: '确认第三方系统、账号、网络、设备、模型或人工交付依赖。',
    },
  ],
  'prd-approval': [
    {
      id: 'prd-reviewed',
      title: 'PRD 完整性确认',
      description: '确认 PRD 已覆盖用户、场景、指标、范围、权限和依赖。',
    },
    {
      id: 'acceptance-criteria',
      title: '验收标准确认',
      description: '确认验收标准可执行、可核验、可统计。',
    },
    {
      id: 'priority-confirmed',
      title: '优先级与版本确认',
      description: '确认本期优先级、版本目标和延期处理原则。',
    },
  ],
  architecture: [
    {
      id: 'module-boundary',
      title: '模块边界',
      description: '确认前端、后端、推理服务、数据存储和外部系统边界。',
    },
    {
      id: 'api-contract',
      title: 'API 与服务契约',
      description: '确认接口路径、请求响应结构、错误码、重试和超时策略。',
    },
    {
      id: 'data-model',
      title: '数据库与数据模型',
      description: '确认数据库表、字段、索引、留存策略和迁移方式。',
    },
    {
      id: 'model-deployment',
      title: '模型版本与部署方式',
      description: '确认模型版本、推理硬件、部署形态、输入输出格式和性能目标。',
    },
  ],
  'ops-requirements': [
    {
      id: 'rtsp-access',
      title: 'RTSP 接入凭据',
      description: '确认摄像头地址、账号密码、网络访问、防火墙和断流重连要求。',
    },
    {
      id: 'runtime-environment',
      title: '服务器与运行环境',
      description: '确认 CPU/GPU、内存、显存、驱动、容器、端口和环境变量。',
    },
    {
      id: 'service-operations',
      title: '启停重启与回滚',
      description: '确认服务启动、停止、重启、回滚和故障恢复方式。',
    },
    {
      id: 'monitoring-logging',
      title: '日志监控与告警',
      description: '确认日志路径、监控指标、告警方式和异常页面提示。',
    },
  ],
  development: [
    {
      id: 'task-implementation',
      title: '开发任务实现范围',
      description: '确认本轮代码变更范围、涉及模块和不触碰的边界。',
    },
    {
      id: 'self-test',
      title: '开发自测',
      description: '确认单元测试、构建、静态检查和本地运行结果。',
    },
    {
      id: 'change-summary',
      title: '变更说明',
      description: '确认变更摘要、文件清单、验证命令和已知限制。',
    },
  ],
  review: [
    {
      id: 'code-quality',
      title: '代码质量',
      description: '确认可维护性、边界处理、错误处理和关键路径质量。',
    },
    {
      id: 'security',
      title: '安全检查',
      description: '确认密钥、权限、输入校验、依赖和敏感数据处理风险。',
    },
    {
      id: 'performance',
      title: '性能检查',
      description: '确认关键接口、推理延迟、资源消耗和降级策略。',
    },
    {
      id: 'qa-handoff',
      title: '测试交接',
      description: '确认测试入口、测试数据、覆盖范围和不可测事项。',
    },
  ],
  qa: [
    {
      id: 'test-samples',
      title: '测试样本与时长',
      description: '确认有行人、无人、多人、遮挡、弱光和断流样本及测试时长。',
    },
    {
      id: 'false-positive-metric',
      title: '误检率统计口径',
      description: '确认总检测次数、误检次数、人工标注和低于 30% 的判定方式。',
    },
    {
      id: 'browser-scope',
      title: '浏览器与环境范围',
      description: '确认桌面浏览器范围、分辨率、网络条件和测试环境。',
    },
    {
      id: 'defect-record',
      title: '缺陷记录规则',
      description: '确认缺陷编号、严重级别、复现步骤、截图和回归要求。',
    },
  ],
  'defect-loop': [
    {
      id: 'defect-scope',
      title: '缺陷范围确认',
      description: '确认每个缺陷影响范围、复现路径、严重级别和负责人。',
    },
    {
      id: 'fix-plan',
      title: '修复计划',
      description: '确认修复策略、影响模块、回滚方式和验证命令。',
    },
    {
      id: 'regression',
      title: '回归验证',
      description: '确认补充回归用例、通过结果和关闭条件。',
    },
  ],
  acceptance: [
    {
      id: 'delivery-package',
      title: '交付包完整性',
      description: '确认 PRD、实现摘要、测试报告、部署说明和风险清单齐备。',
    },
    {
      id: 'qa-evidence',
      title: '测试证据',
      description: '确认测试样本、执行时间、统计结果和缺陷关闭证据可核验。',
    },
    {
      id: 'ops-handoff',
      title: '运维交接',
      description: '确认部署、日志、监控、告警、启停重启和应急联系人。',
    },
    {
      id: 'archive-version',
      title: '归档版本',
      description: '确认验收版本号、归档时间、签收人和后续待办。',
    },
  ],
});

const STAGE_CONFIRMATION_TARGET_ROLES = Object.freeze({
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

const STAGE_CONFIRMATION_ROLE_LABELS = Object.freeze({
  owner: '负责人',
  pm: '项目经理',
  'tech-lead': '技术负责人',
  ops: '运维',
  'ai-dev': 'AI 开发',
  qa: '测试',
});

const FOLLOWUP_EXPECTED_ANSWERS = Object.freeze({
  'business-goal': '需要给出项目目标、发起人、业务负责人、优先级和期望交付时间。',
  'scope-seed': '需要给出当前痛点、初始范围、明确不做事项、关键约束和依赖。',
  'target-users': '需要给出用户角色、核心场景、触发条件、主要操作和页面反馈。',
  'success-metrics': '需要给出指标阈值、统计口径、样本范围和验收方式。',
  'scope-boundary': '需要给出本期包含、不包含、后续再做、明确拒绝内容和边界原因。',
  'data-compliance': '需要给出数据来源、保存范围、访问权限、账号体系、留存周期和隐私要求。',
  'external-dependencies': '需要给出第三方系统、账号权限、网络设备、模型、人工作业和到位时间。',
  'prd-reviewed': '需要给出 PRD 覆盖项确认结论、审批人、版本号和遗留风险。',
  'acceptance-criteria': '需要给出可执行验收步骤、通过标准、统计方式和验收负责人。',
  'priority-confirmed': '需要给出本期优先级、版本目标、延期原则和必须保留功能。',
  'module-boundary': '需要给出前端、后端、推理服务、数据存储、外部系统边界和责任人。',
  'api-contract': '需要给出接口路径、请求响应结构、错误码、超时、重试和幂等要求。',
  'data-model': '需要给出数据库表、字段、索引、迁移方式、留存策略和敏感字段处理。',
  'model-deployment': '需要给出模型版本、推理硬件、部署形态、输入输出格式和性能目标。',
  'rtsp-access': '需要给出 RTSP 地址、账号密码提供方式、网络连通性、防火墙和断流重连要求。',
  'runtime-environment': '需要给出 CPU/GPU、内存、显存、驱动、容器、端口和环境变量。',
  'service-operations': '需要给出服务启动、停止、重启、回滚、故障恢复和负责人。',
  'monitoring-logging': '需要给出日志路径、监控指标、告警方式、异常页面提示和排障入口。',
  'task-implementation': '需要给出本轮代码变更范围、涉及模块、不触碰边界和完成定义。',
  'self-test': '需要给出单元测试、构建、静态检查、本地运行结果和失败项处理。',
  'change-summary': '需要给出变更摘要、文件清单、验证命令、已知限制和回滚建议。',
  'code-quality': '需要给出可维护性、边界处理、错误处理、关键路径质量和遗留问题。',
  security: '需要给出密钥、权限、输入校验、依赖、敏感数据处理和安全风险结论。',
  performance: '需要给出关键接口、推理延迟、资源消耗、并发边界和降级策略。',
  'qa-handoff': '需要给出测试入口、测试数据、覆盖范围、不可测事项和测试负责人。',
  'test-samples': '需要给出样本清单、每类场景时长、样本来源、人工标注人和覆盖场景。',
  'false-positive-metric': '需要给出总检测次数、误检次数、人工标注方式、统计窗口和低于 30% 的判定方式。',
  'browser-scope': '需要给出桌面浏览器范围、分辨率、网络条件、测试环境和兼容性结论。',
  'defect-record': '需要给出缺陷编号、严重级别、复现步骤、截图证据和回归要求。',
  'defect-scope': '需要给出每个缺陷影响范围、复现路径、严重级别和责任人。',
  'fix-plan': '需要给出修复策略、影响模块、回滚方式、验证命令和预计完成时间。',
  regression: '需要给出补充回归用例、通过结果、关闭条件和剩余风险。',
  'delivery-package': '需要给出 PRD、实现摘要、测试报告、部署说明和风险清单。',
  'qa-evidence': '需要给出测试样本、执行时间、统计结果、缺陷关闭证据和验收结论。',
  'ops-handoff': '需要给出部署、日志、监控、告警、启停重启和应急联系人。',
  'archive-version': '需要给出验收版本号、归档时间、签收人、后续待办和资料位置。',
});

const FOLLOWUP_QUESTIONS = Object.freeze({
  'target-users': '请补充「目标用户与核心场景」：目标用户是谁，核心使用场景是什么，用户在页面中如何完成关键操作。',
  'success-metrics': '请补充「成功指标与验收口径」：误检率、测试样本和通过标准。',
  'scope-boundary': '请补充「范围边界」：本期做什么、不做什么、后续再做什么，以及拒绝范围的理由。',
  'data-compliance': '请补充「数据权限与合规」：数据是否保存、谁能访问、保存多久、是否涉及隐私合规。',
  'external-dependencies': '请补充「外部依赖」：RTSP、账号、网络、硬件、模型和人工交付依赖分别由谁提供。',
  'rtsp-access': '请补充「RTSP 接入凭据」：摄像头 RTSP 地址、账号密码提供方式、网络访问和断流重连要求。',
  'runtime-environment': '请补充「服务器与运行环境」：CPU/GPU、内存、显存、驱动、容器、端口和环境变量。',
  'test-samples': '请补充「测试样本与时长」：有行人、无行人、多人、遮挡、弱光和断流样本分别如何准备。',
  'false-positive-metric': '请补充「误检率统计口径」：如何统计总检测次数、误检次数、人工标注和低于 30% 的判定。',
  'browser-scope': '请补充「浏览器与环境范围」：需要覆盖哪些桌面浏览器、分辨率、网络条件和测试环境。',
});

export function createStageConfirmationRegister(stages = []) {
  return normalizeStageConfirmationRegister({}, stages);
}

export function normalizeStageConfirmationRegister(register = {}, stages = []) {
  const source = register || {};
  const stageMap = new Map((stages || []).map((stage) => [stage.id, stage]));
  const stageIds = unique([
    ...Object.keys(STAGE_CONFIRMATION_DEFINITIONS),
    ...Object.keys(source),
    ...(stages || []).map((stage) => stage.id),
  ]);

  return Object.fromEntries(
    stageIds.map((stageId) => [
      stageId,
      normalizeStageEntry(stageId, source[stageId], stageMap.get(stageId)),
    ]),
  );
}

export function updateStageConfirmationItem(
  register,
  { stageId, itemId, value = '', actor = '', confirmedAt = '', stages = [] } = {},
) {
  if (!stageId) {
    throw new Error('stageId is required');
  }
  if (!itemId) {
    throw new Error('itemId is required');
  }

  const normalized = normalizeStageConfirmationRegister(register, stages);
  const entry = normalized[stageId] || normalizeStageEntry(stageId, null, null);
  const itemExists = entry.items.some((item) => item.id === itemId);
  if (!itemExists) {
    throw new Error(`Unknown confirmation item: ${itemId}`);
  }

  return {
    ...normalized,
    [stageId]: finalizeStageEntry({
      ...entry,
      items: entry.items.map((item) => {
        if (item.id !== itemId) {
          return item;
        }

        const cleanedValue = clean(value);
        const isConfirmed = Boolean(cleanedValue);
        return {
          ...item,
          value: cleanedValue,
          status: isConfirmed ? 'confirmed' : 'missing',
          confirmedBy: isConfirmed ? clean(actor) : '',
          confirmedAt: isConfirmed ? confirmedAt || new Date().toISOString() : '',
        };
      }),
    }),
  };
}

export function getStageConfirmationSummary(registerOrProject, stageId) {
  const register = registerOrProject?.stageConfirmations || registerOrProject || {};
  return normalizeStageConfirmationRegister(register)[stageId] || normalizeStageEntry(stageId);
}

function normalizeStageEntry(stageId, entry = {}, stage = {}) {
  const definitions = STAGE_CONFIRMATION_DEFINITIONS[stageId] || [];
  const sourceItems = Array.isArray(entry?.items) ? entry.items : [];
  const sourceById = new Map(sourceItems.map((item) => [item.id, item]));
  const definitionItems = definitions.map((definition) =>
    normalizeItem(definition, sourceById.get(definition.id)),
  );
  const extraItems = sourceItems
    .filter((item) => item?.id && !definitions.some((definition) => definition.id === item.id))
    .map((item) => normalizeItem(item, item));
  const items = [...definitionItems, ...extraItems];

  return finalizeStageEntry({
    stageId,
    stageName: stage?.name || entry?.stageName || stageId,
    owner: stage?.owner || entry?.owner || '',
    items,
  });
}

function normalizeItem(definition, existing = {}) {
  const value = clean(existing?.value);
  const isConfirmed = Boolean(value);
  return {
    id: definition.id,
    title: definition.title || existing?.title || definition.id,
    description: definition.description || existing?.description || '',
    required: definition.required !== false,
    value,
    status: isConfirmed ? 'confirmed' : 'missing',
    confirmedBy: isConfirmed ? clean(existing?.confirmedBy) : '',
    confirmedAt: isConfirmed ? clean(existing?.confirmedAt) : '',
  };
}

function finalizeStageEntry(entry) {
  const requiredItems = entry.items.filter((item) => item.required !== false);
  const missingItems = requiredItems
    .filter((item) => item.status !== 'confirmed')
    .map(({ id, title, description }) => ({ id, title, description }));
  const completedCount = requiredItems.length - missingItems.length;
  const followups = createStageConfirmationFollowups(entry.stageId, missingItems);

  return {
    ...entry,
    status: missingItems.length ? 'incomplete' : 'ready',
    completedCount,
    totalCount: requiredItems.length,
    missingItems,
    followups,
  };
}

export function createStageConfirmationFollowups(stageId, missingItems = []) {
  const targetRole = STAGE_CONFIRMATION_TARGET_ROLES[stageId] || 'owner';
  const targetRoleLabel = STAGE_CONFIRMATION_ROLE_LABELS[targetRole] || '负责人';

  return missingItems.map((item) => {
    const definition = (STAGE_CONFIRMATION_DEFINITIONS[stageId] || []).find(
      (candidate) => candidate.id === item.id,
    );
    const title = item.title || definition?.title || item.id;
    const description = item.description || definition?.description || '';
    const fallbackQuestion = description
      ? `请补充「${title}」：${description}`
      : `请补充「${title}」的确认结论、责任人和可核验依据。`;

    return {
      id: `${stageId}-${item.id}`,
      itemId: item.id,
      targetRole,
      targetRoleLabel,
      title: `追问：${title}`,
      question: FOLLOWUP_QUESTIONS[item.id] || fallbackQuestion,
      expectedAnswer:
        FOLLOWUP_EXPECTED_ANSWERS[item.id] ||
        '需要给出可核验的确认结论、负责人、时间或版本、范围和验收口径。',
    };
  });
}

export function createStageConfirmationFollowupTasks(
  project,
  stageId,
  { includeResolved = false, users = APP_USERS } = {},
) {
  const entry = project?.stageConfirmations?.[stageId] || {};
  const items = Array.isArray(entry.items) ? entry.items : [];
  const missingItems = Array.isArray(entry.missingItems) ? entry.missingItems : [];
  const itemById = new Map(items.map((item) => [item.id, item]));
  const taskItems = includeResolved
    ? items.filter((item) => item.required !== false)
    : missingItems.map((item) => itemById.get(item.id) || item);
  const followups = createStageConfirmationFollowups(
    stageId,
    taskItems.map((item) => ({
      id: item.id,
      title: item.title,
      description: item.description,
    })),
  );
  const members = normalizeProjectMembers(project?.members, users);

  return taskItems
    .filter((item) => includeResolved || item.status !== 'confirmed')
    .map((item) => {
      const followup = followups.find((candidate) => candidate.itemId === item.id);
      const targetRole = followup?.targetRole || 'owner';
      const assigneeUser = findUserById(members[targetRole], users);
      const status = item.status === 'confirmed' ? 'resolved' : 'open';

      return {
        id: `${stageId}-${item.id}`,
        stageId,
        itemId: item.id,
        title: followup?.title || `追问：${item.title || item.id}`,
        question: followup?.question || '',
        expectedAnswer: followup?.expectedAnswer || '',
        targetRole,
        targetRoleLabel: followup?.targetRoleLabel || '负责人',
        assigneeUserId: assigneeUser?.id || '',
        assigneeName: assigneeUser?.name || followup?.targetRoleLabel || '负责人',
        status,
        resolvedAt: status === 'resolved' ? item.confirmedAt || '' : '',
        resolvedBy: status === 'resolved' ? clean(item.confirmedBy) : '',
        resolutionSummary: status === 'resolved' ? summarizeResolution(item.value) : '',
      };
    });
}

function summarizeResolution(value) {
  const cleaned = clean(value);
  if (cleaned.length <= 160) {
    return cleaned;
  }

  return `${cleaned.slice(0, 157)}...`;
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function clean(value) {
  return String(value || '').trim();
}
