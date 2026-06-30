const PLACEHOLDER_PATTERN = /待.*补充|待.*确认|待定|未明确|TBD|todo/i;

const YOLO_PM_INPUTS = Object.freeze([
  {
    id: 'rtsp-access',
    label: 'RTSP 接入信息',
    keywords: ['RTSP 地址', '摄像头地址', '账号', '密码', '网络访问', 'RTSP address', 'camera stream', 'credential', 'network access'],
    ownerRole: 'ops',
  },
  {
    id: 'test-samples',
    label: '测试样本和测试时长',
    keywords: ['测试视频样本', '测试样本', '测试时长', '测试环境', 'test sample', 'test samples', 'test duration', 'test environment'],
    ownerRole: 'pm',
  },
  {
    id: 'false-positive-metric',
    label: '误检率统计口径',
    keywords: ['误检率', '误检次数', '总检测次数', '低于 30%', '低于30%', 'false-positive', 'false positive', 'false positives', 'total detections', 'below 30%'],
    ownerRole: 'pm',
  },
  {
    id: 'data-retention',
    label: '视频截图日志保存策略',
    keywords: ['保存视频', '保存截图', '检测日志', '数据留存', '隐私', 'store raw video', 'screenshots', 'detection logs', 'retention', 'privacy'],
    ownerRole: 'pm',
  },
  {
    id: 'browser-scope',
    label: '桌面浏览器范围',
    keywords: ['浏览器范围', '桌面浏览器', 'Chrome', 'Edge', 'desktop browser', 'browser scope'],
    ownerRole: 'qa',
  },
  {
    id: 'model-version',
    label: 'YOLO 模型版本和推理接口',
    keywords: ['YOLO 模型版本', '模型版本', '推理接口', '标注框返回格式', 'YOLO model version', 'model version', 'inference API', 'detection box JSON'],
    ownerRole: 'tech-lead',
  },
  {
    id: 'runtime-hardware',
    label: '推理硬件和运行环境',
    keywords: ['推理硬件', 'GPU', 'CPU', '服务器配置', '本地计算环境', 'runtime hardware', 'server', 'local compute'],
    ownerRole: 'ops',
  },
]);

export function isYoloCameraProject(project = {}) {
  const primaryText = [
    project.name,
    project.summary,
  ].map((value) => String(value || '')).join('\n');
  const requirementText = Object.values(project.requirementAnswers || {})
    .map((value) => String(value || ''))
    .join('\n');

  return hasYoloCameraSignals(primaryText) || hasYoloCameraSignals(requirementText);
}

export function createYoloDeliveryChain(project = {}) {
  const isYoloProject = isYoloCameraProject(project);
  if (!isYoloProject) {
    return {
      isYoloProject: false,
      status: 'not-applicable',
      currentModuleId: '',
      nextAction: '',
      modules: [],
    };
  }

  const modules = [
    createPmProductModule(project),
    createAiCodingModule(project),
    createSecurityReviewModule(project),
    createQaValidationModule(project),
    createFinalAcceptanceModule(project),
  ];
  const currentModule = modules.find((module) => module.status !== 'complete') || modules.at(-1);
  const status = modules.some((module) => module.status === 'blocked')
    ? 'blocked'
    : modules.every((module) => module.status === 'complete')
      ? 'complete'
      : 'in-progress';

  return {
    isYoloProject,
    status,
    currentModuleId: currentModule?.id || '',
    currentModuleLabel: currentModule?.label || '',
    nextAction: currentModule?.nextAction || '',
    modules,
  };
}

function createPmProductModule(project) {
  const missingItems = YOLO_PM_INPUTS.filter((input) => !hasResolvedInput(project, input)).map((input) => ({
    id: input.id,
    label: input.label,
    ownerRole: input.ownerRole,
  }));
  const reviewStatus = project.requirementReview?.status || 'missing';
  const isReviewReady = reviewStatus === 'ready';
  const status = missingItems.length || !isReviewReady ? 'blocked' : 'complete';
  const evidence = [];

  if (project.prdStatus === 'generated') {
    evidence.push('PRD 已生成');
  }
  if (isReviewReady) {
    evidence.push('需求质检通过');
  }

  return {
    id: 'pm-product',
    label: '项目经理/产品经理',
    status,
    severity: status === 'blocked' ? 'high' : 'normal',
    blockerCount: missingItems.length + (isReviewReady ? 0 : 1),
    missingItems,
    evidence,
    nextAction: status === 'complete'
      ? '需求输入已满足，可以流转到技术交接和 AI Coding。'
      : `补齐 ${missingItems.length || 1} 项 YOLO 项目输入，并重新运行需求质检。`,
  };
}

function createAiCodingModule(project) {
  const activeJob = findLatestJob(project, ['ai-development', 'qa-defect-fix']);
  const run = project.developmentRun || {};
  const changePackage = run.changePackage || {};
  const hasReadyChangePackage =
    run.status === 'completed' &&
    changePackage.status === 'ready-for-review' &&
    changePackage.reviewGate?.canStartReview === true;
  const blockers = normalizeList(project.agentExecutionPackage?.blockers);
  const evidence = [
    run.commitHash ? `提交 ${run.commitHash}` : '',
    changePackage.status === 'ready-for-review' ? '开发变更包已放行' : '',
    activeJob ? `${activeJob.title || activeJob.type}: ${activeJob.status}` : '',
  ].filter(Boolean);

  if (hasReadyChangePackage) {
    return {
      id: 'ai-coding',
      label: 'AI Coding',
      status: 'complete',
      severity: 'normal',
      blockerCount: 0,
      missingItems: [],
      evidence,
      nextAction: '开发变更包已就绪，进入代码、安全和性能审查。',
    };
  }

  const isRunning = ['queued', 'running'].includes(activeJob?.status) || ['ready-for-agent', 'running'].includes(run.status);
  const canStart = project.agentExecutionPackage?.status === 'ready' && project.agentExecutionPackage?.canStart === true;
  const status = isRunning ? 'in-progress' : canStart ? 'ready' : 'blocked';

  return {
    id: 'ai-coding',
    label: 'AI Coding',
    status,
    severity: status === 'blocked' ? 'high' : 'normal',
    blockerCount: status === 'blocked' ? Math.max(blockers.length, 1) : 0,
    missingItems: blockers.map((blocker, index) => ({
      id: `ai-coding-blocker-${index + 1}`,
      label: blocker,
      ownerRole: 'ai-dev',
    })),
    evidence,
    nextAction:
      status === 'ready'
        ? '排队 AI Coding 后台任务，并记录命令、日志、耗时和变更包。'
        : status === 'in-progress'
          ? '等待 AI Coding 后台任务产出开发变更包。'
          : '先生成可启动的 AI 开发任务包，补齐仓库、分支和检查命令。',
  };
}

function createSecurityReviewModule(project) {
  const report = project.codeReviewReport || null;
  const reviewGate = report?.reviewGate || {};
  const blockers = normalizeList(reviewGate.blockers?.length ? reviewGate.blockers : report?.blockers);
  const failedCategories = Array.isArray(report?.categories)
    ? report.categories.filter((category) => category.status === 'failed')
    : [];
  const highRiskFindingCount = failedCategories.reduce(
    (count, category) =>
      count + (Array.isArray(category.findings)
        ? category.findings.filter((finding) => finding.severity === 'high').length
        : 0),
    0,
  );
  const evidence = [
    report?.commitHash ? `评审提交 ${report.commitHash}` : '',
    report?.status === 'passed' ? 'Review 已通过' : '',
  ].filter(Boolean);

  if (report?.status === 'passed' && reviewGate.canAdvanceToQa !== false && blockers.length === 0) {
    return {
      id: 'security-review',
      label: '代码安全审查',
      status: 'complete',
      severity: 'normal',
      blockerCount: 0,
      missingItems: [],
      evidence,
      nextAction: '代码、安全和性能审查通过，可以进入 QA。',
    };
  }

  const hasReadyChangePackage =
    project.developmentRun?.changePackage?.status === 'ready-for-review' &&
    project.developmentRun?.changePackage?.reviewGate?.canStartReview === true;
  const status = report ? 'blocked' : hasReadyChangePackage ? 'ready' : 'blocked';
  const missingItems = blockers.length
    ? blockers.map((blocker, index) => ({
        id: `review-blocker-${index + 1}`,
        label: blocker,
        ownerRole: 'tech-lead',
      }))
    : [{
        id: 'review-not-run',
        label: hasReadyChangePackage ? '代码安全审查尚未运行' : '开发变更包尚未放行',
        ownerRole: hasReadyChangePackage ? 'tech-lead' : 'ai-dev',
      }];

  return {
    id: 'security-review',
    label: '代码安全审查',
    status,
    severity: highRiskFindingCount > 0 ? 'critical' : 'high',
    blockerCount: missingItems.length,
    missingItems,
    evidence,
    nextAction: report
      ? '修复代码、安全或性能审查阻塞项，再重新进入 Review。'
      : hasReadyChangePackage
        ? '运行代码、安全和性能审查，确认无高风险问题后再进入 QA。'
        : '等待 AI Coding 产出可审查的开发变更包。',
  };
}

function createQaValidationModule(project) {
  const qaRun = project.qaRun || null;
  const qaEvidence = project.qaEvidence || null;
  const evidenceReady = qaEvidence?.status === 'ready' || qaEvidence?.status === 'complete';
  const passedCount = Number(qaRun?.passedCount || 0);
  const totalCount = Number(qaRun?.totalCount || 0);
  const falsePositiveRate = Number(qaRun?.falsePositiveRate ?? qaRun?.metrics?.falsePositiveRate ?? NaN);
  const evidence = [
    qaRun?.status === 'passed' && totalCount ? `QA ${passedCount}/${totalCount} 通过` : '',
    Number.isFinite(falsePositiveRate) ? `误检率 ${Math.round(falsePositiveRate * 100)}%` : '',
    evidenceReady ? '测试证据已归档' : '',
  ].filter(Boolean);

  if (qaRun?.status === 'passed' && evidenceReady) {
    return {
      id: 'qa-validation',
      label: 'QA 测试验证',
      status: 'complete',
      severity: 'normal',
      blockerCount: 0,
      missingItems: [],
      evidence,
      nextAction: 'QA 验证通过，可以生成最终验收包。',
    };
  }

  if (qaRun?.status === 'needs-work' || qaRun?.defectRouting?.shouldReturnToDevelopment) {
    const defects = Array.isArray(qaRun.defects) ? qaRun.defects : [];
    return {
      id: 'qa-validation',
      label: 'QA 测试验证',
      status: 'blocked',
      severity: 'high',
      blockerCount: Math.max(defects.length, 1),
      missingItems: defects.length
        ? defects.map((defect, index) => ({
            id: defect.id || `qa-defect-${index + 1}`,
            label: defect.title || defect.summary || 'QA 缺陷需要回流开发',
            ownerRole: 'qa',
          }))
        : [{ id: 'qa-return', label: 'QA 判定需要回流开发', ownerRole: 'qa' }],
      evidence,
      nextAction: '将 QA 缺陷回流 AI Coding，修复后重新 Review 和复测。',
    };
  }

  const reviewComplete = project.codeReviewReport?.status === 'passed';
  return {
    id: 'qa-validation',
    label: 'QA 测试验证',
    status: reviewComplete ? 'ready' : 'blocked',
    severity: reviewComplete ? 'normal' : 'high',
    blockerCount: reviewComplete ? 0 : 1,
    missingItems: reviewComplete
      ? []
      : [{ id: 'review-not-passed', label: '代码安全审查尚未通过', ownerRole: 'tech-lead' }],
    evidence,
    nextAction: reviewComplete
      ? '补齐测试样本、执行 QA 用例并归档误检率证据。'
      : '等待代码、安全和性能审查通过后进入 QA。',
  };
}

function createFinalAcceptanceModule(project) {
  const acceptance = project.acceptancePackage || null;
  const isSignedOff = acceptance?.signoffStatus === 'signed-off';
  const isReady = acceptance?.status === 'ready';
  const evidence = [
    isSignedOff && acceptance?.signedOffBy ? `签收人 ${acceptance.signedOffBy}` : '',
    acceptance?.archiveVersion ? `归档版本 ${acceptance.archiveVersion}` : '',
    isReady ? '最终验收包已生成' : '',
  ].filter(Boolean);

  if (isSignedOff) {
    return {
      id: 'final-acceptance',
      label: '最终验收',
      status: 'complete',
      severity: 'normal',
      blockerCount: 0,
      missingItems: [],
      evidence,
      nextAction: '项目已完成最终验收和归档。',
    };
  }

  const qaPassed = project.qaRun?.status === 'passed';
  const qaEvidenceReady = ['ready', 'complete'].includes(project.qaEvidence?.status);
  if (isReady) {
    return {
      id: 'final-acceptance',
      label: '最终验收',
      status: 'ready',
      severity: 'normal',
      blockerCount: 0,
      missingItems: [],
      evidence,
      nextAction: '负责人检查验收包并完成签收归档。',
    };
  }

  const blockers = [];
  if (!qaPassed) {
    blockers.push({ id: 'qa-not-passed', label: 'QA 尚未通过', ownerRole: 'qa' });
  }
  if (!qaEvidenceReady) {
    blockers.push({ id: 'qa-evidence-not-ready', label: 'QA 证据尚未归档', ownerRole: 'qa' });
  }

  return {
    id: 'final-acceptance',
    label: '最终验收',
    status: 'blocked',
    severity: 'high',
    blockerCount: Math.max(blockers.length, 1),
    missingItems: blockers.length ? blockers : [{ id: 'acceptance-package', label: '最终验收包尚未生成', ownerRole: 'owner' }],
    evidence,
    nextAction: qaPassed && qaEvidenceReady
      ? '生成最终验收包，负责人完成签收。'
      : '等待 QA 通过并归档测试证据后生成验收包。',
  };
}

function hasResolvedInput(project, input) {
  const text = projectText(project);
  const matchedKeywords = input.keywords.filter((keyword) => text.includes(keyword));
  if (!matchedKeywords.length) {
    return false;
  }

  return matchedKeywords.some((keyword) => !hasPlaceholderNearKeyword(text, keyword));
}

function hasPlaceholderNearKeyword(text, keyword) {
  const index = text.indexOf(keyword);
  if (index < 0) {
    return false;
  }
  const start = Math.max(0, index - 48);
  const end = Math.min(text.length, index + keyword.length + 96);
  return PLACEHOLDER_PATTERN.test(text.slice(start, end));
}

function findLatestJob(project, types) {
  const jobs = Array.isArray(project.platformJobs) ? project.platformJobs : [];
  return jobs.find((job) => types.includes(job.type)) || null;
}

function projectText(project = {}) {
  return [
    project.name,
    project.summary,
    ...Object.values(project.requirementAnswers || {}),
    ...Object.values(project.artifacts || {}),
  ]
    .map((value) => String(value || ''))
    .join('\n');
}

function hasYoloCameraSignals(text) {
  const normalized = String(text || '').toLowerCase();
  const hasVisionSignal = /yolo|行人|person|检测|识别/.test(normalized);
  const hasCameraSignal = /rtsp|摄像头|监控|camera|stream|视频流|标注框/.test(normalized);
  return hasVisionSignal && hasCameraSignal;
}

function normalizeList(items = []) {
  return Array.isArray(items)
    ? items.map((item) => String(item || '').trim()).filter(Boolean)
    : [];
}
