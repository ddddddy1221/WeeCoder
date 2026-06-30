const BASE_STAGE_RISKS = {
  intake: {
    riskLevel: 'medium',
    potentialRisks: [
      {
        title: '业务目标不够稳定',
        detail: '项目入口只记录名称、负责人和概要，如果目标、优先级或干系人变化，后续阶段会反复返工。',
      },
    ],
    functionalGaps: [
      {
        title: '缺少项目约束字段',
        detail: '当前还没有预算、截止时间、优先级、干系人和审批链字段。',
      },
    ],
    recommendedActions: ['负责人在进入项目经理需求前补充目标、优先级和关键干系人。'],
  },
  'pm-requirements': {
    riskLevel: 'high',
    potentialRisks: [
      {
        title: '需求回答不完整',
        detail: '用户、场景、指标、范围、数据权限或外部依赖缺失时，PRD 会出现不可验收内容。',
      },
    ],
    functionalGaps: [
      {
        title: '缺项追问需要关闭追踪',
        detail: '系统已能按缺失项生成追问建议，仍需要把追问沉淀为可指派、可关闭、可复核的阶段待办。',
      },
    ],
    recommendedActions: ['项目经理先跑 AI 需求评审，再按缺项待办逐项补齐确认内容。'],
  },
  'prd-approval': {
    riskLevel: 'medium',
    potentialRisks: [
      {
        title: '审批只确认文档',
        detail: '如果负责人只看 PRD 文本，没有检查验收标准和非目标，后续技术阶段容易扩大范围。',
      },
    ],
    functionalGaps: [
      {
        title: '缺少审批签名和版本冻结',
        detail: '当前只记录流转历史，还没有正式的 PRD 版本号、审批人签名和差异对比。',
      },
    ],
    recommendedActions: ['审批意见中明确本期范围、验收口径和暂不处理事项。'],
  },
  architecture: {
    riskLevel: 'high',
    potentialRisks: [
      {
        title: '技术方案无法落地',
        detail: '接口、数据模型、异常策略和性能目标不清时，自动开发会生成不可联调的代码。',
      },
    ],
    functionalGaps: [
      {
        title: '数据库和接口尚未结构化',
        detail: '当前技术方案是 Markdown 产物，还没有结构化 API、表结构和模块任务模型。',
      },
    ],
    recommendedActions: ['技术负责人确认接口契约、数据结构、异常策略和性能约束后再进入开发。'],
  },
  'ops-requirements': {
    riskLevel: 'high',
    potentialRisks: [
      {
        title: '运行环境不可用',
        detail: '服务器、网络、密钥、依赖服务或日志权限未确认时，开发完成后也无法部署验证。',
      },
    ],
    functionalGaps: [
      {
        title: '环境需求尚未自动校验',
        detail: '当前只生成运维需求清单，还没有自动连通性检查、配置校验和部署前检查。',
      },
    ],
    recommendedActions: ['运维在开发前确认服务器规格、环境变量、依赖服务、日志路径和回滚方式。'],
  },
  development: {
    riskLevel: 'high',
    potentialRisks: [
      {
        title: '自动开发缺少仓库级上下文',
        detail: '如果没有明确任务、代码边界和验收测试，AI coding 可能改错模块或遗漏关键路径。',
      },
    ],
    functionalGaps: [
      {
        title: '自动开发执行器尚未接入',
        detail: '当前版本先维护流程和交接产物，还没有真正创建分支、修改代码、生成 PR 或提交变更。',
      },
    ],
    recommendedActions: ['开发阶段需要接入任务拆分、代码生成、单测、变更摘要和失败回滚机制。'],
  },
  review: {
    riskLevel: 'medium',
    potentialRisks: [
      {
        title: 'Review 覆盖不完整',
        detail: '只做人工浏览或单次 AI review，容易漏掉安全、性能和边界条件问题。',
      },
    ],
    functionalGaps: [
      {
        title: '缺少安全和性能检查器',
        detail: '当前流程有 Review 阶段，但还没有固定的 SAST、依赖审计、性能基准和检查报告。',
      },
    ],
    recommendedActions: ['Review 阶段至少运行测试、构建、依赖审计和关键路径代码审查。'],
  },
  qa: {
    riskLevel: 'high',
    potentialRisks: [
      {
        title: '测试样本不足',
        detail: '测试数据、场景覆盖、失败复现和统计口径不清时，测试结论不可复核。',
      },
    ],
    functionalGaps: [
      {
        title: '自动测试执行尚未接入',
        detail: '当前能生成测试计划，但还没有真正执行测试、收集结果和形成缺陷闭环。',
      },
    ],
    recommendedActions: ['测试阶段必须沉淀用例、执行记录、缺陷列表和回归结果。'],
  },
  'defect-loop': {
    riskLevel: 'medium',
    potentialRisks: [
      {
        title: '缺陷修复引入回归',
        detail: '修复缺陷后如果没有补充回归测试，可能解决一个问题但破坏已有功能。',
      },
    ],
    functionalGaps: [
      {
        title: '缺陷没有结构化追踪',
        detail: '当前只有阶段流转，没有缺陷编号、严重级别、复现步骤和修复状态。',
      },
    ],
    recommendedActions: ['每个缺陷必须关联复现步骤、修复提交、回归用例和关闭结论。'],
  },
  acceptance: {
    riskLevel: 'medium',
    potentialRisks: [
      {
        title: '交付结果不可追溯',
        detail: '如果没有汇总 PRD、代码变更、测试报告和运维交接，负责人难以判断是否可验收。',
      },
    ],
    functionalGaps: [
      {
        title: '缺少最终交付包',
        detail: '当前没有自动生成发布说明、验收报告、部署说明和后续待办清单。',
      },
    ],
    recommendedActions: ['最终验收前汇总需求、实现、测试、风险和运维交接结果。'],
  },
};

const VISION_STAGE_ADDITIONS = {
  architecture: {
    potentialRisks: [
      {
        title: '视频流协议与浏览器播放不匹配',
        detail: 'RTSP 不能被浏览器直接稳定播放，需确认转码、WebRTC、HLS 或 MJPEG 等方案。',
      },
    ],
    functionalGaps: [
      {
        title: '检测框同步策略待确认',
        detail: '视频帧和 YOLO 推理结果存在延迟，需定义时间戳、坐标缩放和过期结果丢弃策略。',
      },
    ],
  },
  'ops-requirements': {
    potentialRisks: [
      {
        title: 'RTSP 接入信息未确认',
        detail: '摄像头地址、账号密码、网络访问、防火墙和断流重连策略缺失会阻塞联调。',
      },
    ],
    functionalGaps: [
      {
        title: '推理硬件规格未确认',
        detail: 'YOLO 模型版本、CPU/GPU、驱动、显存和运行容器尚未落实到运维需求。',
      },
    ],
  },
  development: {
    potentialRisks: [
      {
        title: '检测延迟影响提示准确性',
        detail: '推理耗时过长会导致标注框和画面错位，保安看到的提示可能滞后。',
      },
    ],
    functionalGaps: [
      {
        title: '推理服务契约未结构化',
        detail: '当前只有 Markdown 描述，还没有固定的检测结果 JSON schema、错误码和重试策略。',
      },
    ],
  },
  qa: {
    potentialRisks: [
      {
        title: '误检率统计不可复核',
        detail: '如果没有人工标注样本、测试时长和总检测次数记录，低于 30% 的结论无法验证。',
      },
    ],
    functionalGaps: [
      {
        title: '测试样本与测试时长未确认',
        detail: '有行人、无行人、多人、遮挡、弱光和断流样本还没有形成可执行测试集。',
      },
    ],
  },
};

export function createStageRiskRegister(project, stages) {
  const contextual = buildBaseRegister(project, stages);
  return normalizeStageRiskRegister({}, stages, contextual);
}

export function normalizeStageRiskRegister(existing = {}, stages, fallback = buildBaseRegister({}, stages)) {
  return stages.reduce((register, stage) => {
    const base = fallback[stage.id] || createEmptyEntry(stage);
    const current = existing?.[stage.id] || {};
    register[stage.id] = {
      stageId: stage.id,
      stageName: current.stageName || base.stageName || stage.name,
      owner: current.owner || base.owner || stage.owner,
      riskLevel: normalizeRiskLevel(current.riskLevel || base.riskLevel),
      potentialRisks: normalizeIssueList(current.potentialRisks || base.potentialRisks),
      functionalGaps: normalizeIssueList(current.functionalGaps || base.functionalGaps),
      recommendedActions: normalizeActionList(current.recommendedActions || base.recommendedActions),
    };
    return register;
  }, {});
}

function buildBaseRegister(project, stages) {
  const isVisionProject = hasVisionKeywords(project);
  return stages.reduce((register, stage) => {
    const base = cloneEntry({
      ...createEmptyEntry(stage),
      ...(BASE_STAGE_RISKS[stage.id] || {}),
      stageId: stage.id,
      stageName: stage.name,
      owner: stage.owner,
    });

    if (isVisionProject && VISION_STAGE_ADDITIONS[stage.id]) {
      mergeEntry(base, VISION_STAGE_ADDITIONS[stage.id]);
    }

    applyProjectStateAdjustments(base, project, stage.id);

    register[stage.id] = base;
    return register;
  }, {});
}

function applyProjectStateAdjustments(entry, project, stageId) {
  if (stageId === 'development') {
    applyDevelopmentStateAdjustments(entry, project);
  }
  if (stageId === 'qa') {
    applyQaStateAdjustments(entry, project);
  }
  if (stageId === 'acceptance') {
    applyAcceptanceStateAdjustments(entry, project);
  }
}

function applyDevelopmentStateAdjustments(entry, project) {
  const defectFixPackage = project.defectFixPackage || null;
  if (defectFixPackage?.status !== 'ready') {
    return;
  }

  const reasons = Array.isArray(defectFixPackage.reasons) ? defectFixPackage.reasons : [];
  const failingCases = Array.isArray(defectFixPackage.failingTestCases)
    ? defectFixPackage.failingTestCases
    : [];

  entry.riskLevel = 'high';
  entry.potentialRisks = [
    {
      title: 'QA 缺陷修复待执行',
      detail:
        reasons.join('；') ||
        failingCases.map((item) => item.title || item.id).filter(Boolean).join('；') ||
        'QA 已判定存在实现缺口，当前开发阶段必须先完成缺陷修复再重新进入 Review。',
    },
  ];
  entry.functionalGaps = [
    {
      title: '缺陷修复包尚未执行',
      detail:
        '系统已经生成 QA 缺陷修复包，但新的开发执行、代码 Review 和 QA 回归尚未完成，旧的通过结论不能继续作为验收依据。',
    },
  ];
  entry.recommendedActions = [
    '基于 QA 缺陷修复包重新生成或确认 AI 开发任务包。',
    '完成修复后重新运行本地检查、代码 Review 和 QA 回归。',
  ];
}

function applyQaStateAdjustments(entry, project) {
  const evidenceReady = project.qaEvidence?.status === 'ready';
  const qaStatus = project.qaRun?.status;

  if (evidenceReady && qaStatus === 'passed') {
    entry.riskLevel = 'medium';
    entry.potentialRisks = [
      {
        title: '真实 RTSP 验收记录待归档',
        detail:
          '当前 QA 已有结构化测试证据并通过自动测试，但最终商业验收仍需归档真实 RTSP 流、原始样本、总检测次数、误检次数和误检率计算过程。',
      },
    ];
    entry.functionalGaps = [
      {
        title: '最终验收包尚未汇总',
        detail:
          'QA 通过后还需要把 PRD、实现说明、测试报告、运维交接和剩余风险汇总为负责人可签收的交付包。',
      },
    ];
    entry.recommendedActions = [
      '最终验收前保留真实 RTSP 联调记录和误检率原始统计。',
      '进入最终验收前生成交付包并冻结测试证据版本。',
    ];
    return;
  }

  if (evidenceReady) {
    entry.riskLevel = qaStatus === 'needs-work' ? 'high' : 'medium';
    entry.potentialRisks = [
      {
        title: 'QA 结果尚未闭环',
        detail:
          qaStatus === 'needs-work'
            ? '测试证据已经补齐，但最近一次 QA 仍存在阻塞项或失败用例，需要修复后回归。'
            : '测试证据已经补齐，但尚未基于这批证据重新执行 QA，当前不能直接进入最终验收。',
      },
    ];
    entry.functionalGaps = [
      {
        title: qaStatus === 'needs-work' ? '失败用例尚未回归' : 'QA 自动测试结果待生成',
        detail:
          qaStatus === 'needs-work'
            ? '需要把失败用例、缺陷、修复提交和回归结果形成闭环记录。'
            : '需要点击生成并执行测试用例，产出可复核的通过率、阻塞项和缺陷记录。',
      },
    ];
    entry.recommendedActions = [
      qaStatus === 'needs-work'
        ? '修复 QA 阻塞项后重新执行测试，并保留回归记录。'
        : '基于已补齐的测试证据重新执行 QA。',
    ];
  }
}

function applyAcceptanceStateAdjustments(entry, project) {
  const acceptanceStatus = project.acceptancePackage?.status;
  const signoffStatus = project.acceptancePackage?.signoffStatus;

  if (acceptanceStatus === 'ready') {
    if (signoffStatus === 'signed-off') {
      entry.riskLevel = 'low';
      entry.potentialRisks = [
        {
          title: '进入运营观察期',
          detail:
            '最终验收已经完成签收并归档，后续风险主要来自真实运行环境、摄像头断流、模型误检率漂移和运维响应。',
        },
      ];
      entry.functionalGaps = [];
      entry.recommendedActions = [
        '保留签收版本、测试证据、真实 RTSP 联调记录和误检率原始统计，进入上线后运营观察。',
      ];
      return;
    }

    entry.riskLevel = 'medium';
    entry.potentialRisks = [
      {
        title: '负责人签收待完成',
        detail:
          '最终验收包已经生成并且交付材料齐备，但负责人尚未完成签收，项目仍不应标记为商业交付闭环完成。',
      },
    ];
    entry.functionalGaps = [
      {
        title: '签收记录尚未结构化',
        detail:
          '当前已能生成验收包和完成阶段门禁，但还没有单独记录签收人、签收时间、签收意见和归档版本号。',
      },
    ];
    entry.recommendedActions = [
      '负责人检查最终验收包后完成签收。',
      '后续补充签收人、签收时间、签收意见和归档版本号。',
    ];
    return;
  }

  if (acceptanceStatus === 'blocked') {
    entry.riskLevel = 'high';
    entry.potentialRisks = [
      {
        title: '最终验收包存在缺失材料',
        detail: '系统已经尝试生成验收包，但仍有 PRD、开发、Review、QA、测试证据或运维交接材料缺失。',
      },
    ];
    entry.functionalGaps = [
      {
        title: '最终验收包不可签收',
        detail: '必须补齐阻塞项并重新生成最终验收包后，负责人才能完成项目验收。',
      },
    ];
    entry.recommendedActions = ['按验收包阻塞项补齐材料后重新生成最终验收包。'];
  }
}

function createEmptyEntry(stage) {
  return {
    stageId: stage.id,
    stageName: stage.name,
    owner: stage.owner,
    riskLevel: 'medium',
    potentialRisks: [],
    functionalGaps: [],
    recommendedActions: [],
  };
}

function mergeEntry(target, addition) {
  target.potentialRisks = mergeIssues(target.potentialRisks, addition.potentialRisks);
  target.functionalGaps = mergeIssues(target.functionalGaps, addition.functionalGaps);
  target.recommendedActions = mergeActions(target.recommendedActions, addition.recommendedActions);
  if (addition.riskLevel) {
    target.riskLevel = addition.riskLevel;
  }
}

function mergeIssues(current = [], additions = []) {
  const byTitle = new Map(normalizeIssueList(current).map((item) => [item.title, item]));
  for (const item of normalizeIssueList(additions)) {
    if (!byTitle.has(item.title)) {
      byTitle.set(item.title, item);
    }
  }
  return [...byTitle.values()];
}

function mergeActions(current = [], additions = []) {
  return [...new Set([...normalizeActionList(current), ...normalizeActionList(additions)])];
}

function cloneEntry(entry) {
  return {
    ...entry,
    potentialRisks: normalizeIssueList(entry.potentialRisks),
    functionalGaps: normalizeIssueList(entry.functionalGaps),
    recommendedActions: normalizeActionList(entry.recommendedActions),
  };
}

function normalizeIssueList(items = []) {
  return items
    .filter(Boolean)
    .map((item) =>
      typeof item === 'string'
        ? { title: item, detail: '' }
        : { title: String(item.title || '').trim(), detail: String(item.detail || '').trim() },
    )
    .filter((item) => item.title);
}

function normalizeActionList(items = []) {
  return items.map((item) => String(item || '').trim()).filter(Boolean);
}

function normalizeRiskLevel(level) {
  return ['low', 'medium', 'high'].includes(level) ? level : 'medium';
}

function hasVisionKeywords(project = {}) {
  const artifacts = Object.values(project.artifacts || {}).join('\n');
  const text = `${project.name || ''}\n${project.summary || ''}\n${artifacts}`;
  return /RTSP|YOLO|摄像头|视频|行人|person detection/i.test(text);
}
