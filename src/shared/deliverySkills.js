export const BUSINESS_SKILLS = Object.freeze([
  {
    id: 'requirement-clarification',
    name: '需求澄清 Skill',
    stageId: 'pm-requirements',
    owner: '项目经理',
    description: '逐轮确认用户、场景、指标、范围、数据权限和外部依赖。',
  },
  {
    id: 'requirement-quality-review',
    name: '需求完整性评审 Skill',
    stageId: 'pm-requirements',
    owner: 'AI 项目助理',
    description: '检查需求是否完整、可验收、可交付，并指出阻塞项和风险。',
  },
  {
    id: 'prd-draft-generation',
    name: 'PRD 草稿生成 Skill',
    stageId: 'pm-requirements',
    owner: 'AI 产品助理',
    description: '基于已确认需求生成结构化 PRD 草稿，缺失信息明确标注待补充。',
  },
  {
    id: 'prd-approval-gate',
    name: 'PRD 审批门禁 Skill',
    stageId: 'prd-approval',
    owner: '负责人',
    description: '在进入技术方案前确认 PRD 完整度、范围边界和验收标准。',
  },
]);

export function evaluateRequirementQuality(project) {
  const questions = project.requirementQuestions || [];
  const answers = project.requirementAnswers || {};
  const missingQuestions = questions.filter((question) => !hasAnswer(answers[question.id]));
  const warnings = createWarnings(answers);
  const blockers = [];
  const missingYoloInputs = createMissingYoloInputs(project);

  if (missingQuestions.length > 0) {
    blockers.push({
      title: '缺少关键需求信息',
      detail: `还有 ${missingQuestions.length} 个问题未保存：${missingQuestions
        .map((question) => question.label)
        .join('、')}。`,
    });
  }

  if (missingYoloInputs.length > 0) {
    blockers.push({
      title: 'YOLO 项目输入未补齐',
      detail: `还需要补齐：${missingYoloInputs.map((item) => item.label).join('、')}。`,
    });
  }

  const score = Math.max(0, 100 - missingQuestions.length * 14 - missingYoloInputs.length * 8 - warnings.length * 6);

  return {
    status: blockers.length > 0 ? 'needs-work' : 'ready',
    score,
    completedCount: questions.length - missingQuestions.length,
    totalCount: questions.length,
    missingQuestionIds: missingQuestions.map((question) => question.id),
    missingYoloInputIds: missingYoloInputs.map((item) => item.id),
    missingYoloInputs,
    missingQuestions: missingQuestions.map((question) => ({
      id: question.id,
      label: question.label,
    })),
    blockers,
    warnings,
    recommendations: createRecommendations(missingQuestions, warnings),
  };
}

export function createRequirementReviewArtifact(project, review) {
  return [
    `# 需求质检报告: ${project.name}`,
    '',
    '## 结论',
    review.status === 'ready' ? '可以提交 PRD 审批。' : '暂不建议提交 PRD 审批。',
    '',
    '## 完整度',
    `- 已完成: ${review.completedCount}/${review.totalCount}`,
    `- 评分: ${review.score}`,
    '',
    '## 阻塞项',
    ...formatItems(review.blockers, '暂无阻塞项。'),
    '',
    '## 风险提醒',
    ...formatItems(review.warnings, '暂无明显风险。'),
    '',
    '## 建议',
    ...review.recommendations.map((item) => `- ${item}`),
  ].join('\n');
}

export function isPrdApprovalReady(project) {
  return project.prdStatus === 'generated' && project.requirementReview?.status === 'ready';
}

function hasAnswer(value) {
  return String(value || '').trim().length > 0;
}

const YOLO_PLACEHOLDER_PATTERN = /待.*补充|待.*确认|待定|未明确|TBD|todo/i;

const YOLO_REQUIREMENT_INPUTS = Object.freeze([
  {
    id: 'test-samples',
    label: '测试样本和测试时长',
    keywords: ['测试视频样本', '测试样本', '测试时长', '测试环境', 'test sample', 'test samples', 'test duration', 'test environment'],
  },
  {
    id: 'data-retention',
    label: '视频截图日志保存策略',
    keywords: ['保存视频', '保存截图', '检测日志', '数据留存', '隐私', 'store raw video', 'screenshots', 'detection logs', 'retention', 'privacy'],
  },
  {
    id: 'model-version',
    label: 'YOLO 模型版本和推理接口',
    keywords: ['YOLO 模型版本', '模型版本', '推理接口', '标注框返回格式', 'YOLO model version', 'model version', 'inference API', 'detection box JSON'],
  },
  {
    id: 'runtime-hardware',
    label: '推理硬件和运行环境',
    keywords: ['推理硬件', 'GPU', 'CPU', '服务器配置', '本地计算环境', 'runtime hardware', 'server', 'local compute'],
  },
]);

function createMissingYoloInputs(project = {}) {
  const text = [
    project.name,
    project.summary,
    ...Object.values(project.requirementAnswers || {}),
    ...Object.values(project.artifacts || {}),
  ]
    .map((value) => String(value || ''))
    .join('\n');

  if (!/yolo|rtsp|摄像头|监控|行人|person|camera/i.test(text)) {
    return [];
  }

  return YOLO_REQUIREMENT_INPUTS.filter((input) => {
    const matchedKeywords = input.keywords.filter((keyword) => text.includes(keyword));
    if (!matchedKeywords.length) {
      return true;
    }
    return matchedKeywords.every((keyword) => hasPlaceholderNearYoloKeyword(text, keyword));
  });
}

function hasPlaceholderNearYoloKeyword(text, keyword) {
  const index = text.indexOf(keyword);
  if (index < 0) {
    return false;
  }
  const start = Math.max(0, index - 48);
  const end = Math.min(text.length, index + keyword.length + 96);
  return YOLO_PLACEHOLDER_PATTERN.test(text.slice(start, end));
}

function createWarnings(answers) {
  const warnings = [];
  const metrics = String(answers.successMetrics || '');
  const scope = String(answers.scope || '');
  const data = String(answers.data || '');

  if (hasAnswer(metrics) && !/[0-9%]|达到|低于|高于|降低|提升|不少于|不超过|分钟|小时/.test(metrics)) {
    warnings.push({
      title: '成功指标不够可验收',
      detail: '建议补充数字、比例、时间或明确阈值，避免上线后无法判断是否成功。',
    });
  }

  if (hasAnswer(scope) && !/不做|不包含|暂不|非目标|out of scope|not/i.test(scope)) {
    warnings.push({
      title: '范围边界缺少非目标',
      detail: '建议明确本期不做什么，减少开发和验收时的范围争议。',
    });
  }

  if (hasAnswer(data) && !/权限|角色|只|审计|合规|permission|role|audit/i.test(data)) {
    warnings.push({
      title: '数据与权限约束偏弱',
      detail: '建议说明不同角色可见、可操作的数据边界，以及是否需要审计日志。',
    });
  }

  return warnings;
}

function createRecommendations(missingQuestions, warnings) {
  const recommendations = [];

  if (missingQuestions.length > 0) {
    recommendations.push('先补齐所有关键需求问题，再提交 PRD 审批。');
  }

  for (const warning of warnings) {
    recommendations.push(warning.detail);
  }

  if (recommendations.length === 0) {
    recommendations.push('可以生成 PRD 草稿并提交负责人审批。');
  }

  return recommendations;
}

function formatItems(items, emptyText) {
  if (!items?.length) {
    return [`- ${emptyText}`];
  }

  return items.map((item) => `- ${item.title}: ${item.detail}`);
}
