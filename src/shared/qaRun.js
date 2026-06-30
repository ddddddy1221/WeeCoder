const QA_STATUSES = new Set(['passed', 'needs-work']);
const CASE_STATUSES = new Set(['passed', 'failed', 'blocked', 'not-run']);
const ROUTING_STAGE_IDS = new Set(['development', 'qa', 'acceptance']);

export function normalizeQaRun(report) {
  if (!report) {
    return null;
  }

  const testCases = Array.isArray(report.testCases)
    ? report.testCases.map(normalizeTestCase).filter((item) => item.id || item.title)
    : [];
  const blockers = normalizeStringList(report.blockers);
  const defects = normalizeIssueList(report.defects);
  const passedCount = testCases.filter((item) => item.status === 'passed').length;
  const totalCount = testCases.length;
  const hasCaseFailure = testCases.some((item) => item.status !== 'passed');
  const requestedStatus = QA_STATUSES.has(report.status) ? report.status : 'needs-work';
  const status =
    requestedStatus === 'passed' && !blockers.length && !defects.length && !hasCaseFailure
      ? 'passed'
      : 'needs-work';
  const reviewHandoff = normalizeQaReviewHandoff(report.reviewHandoff);
  const coveragePlan = normalizeQaCoveragePlan(report.coveragePlan, {
    reviewHandoff,
    commitHash: report.commitHash,
  });
  const defectRouting = normalizeQaDefectRouting(report.defectRouting, {
    status,
    blockers,
    defects,
  });
  const metrics = normalizeQaMetrics(report);

  return {
    status,
    generatedAt: String(report.generatedAt || '').trim(),
    executedAt: String(report.executedAt || '').trim(),
    commitHash: String(report.commitHash || '').trim(),
    summary: String(report.summary || defaultQaSummary(status)).trim(),
    passedCount,
    totalCount,
    testCases,
    defects,
    blockers,
    reviewHandoff,
    coveragePlan,
    defectRouting,
    metrics,
    totalDetections: metrics.totalDetections,
    falsePositiveCount: metrics.falsePositiveCount,
    falsePositiveRate: metrics.falsePositiveRate,
    recommendations: normalizeStringList(report.recommendations),
    nextActions: normalizeStringList(report.nextActions).length
      ? normalizeStringList(report.nextActions)
      : defaultQaNextActions(status),
  };
}

function normalizeQaMetrics(report = {}) {
  const source = report.metrics && typeof report.metrics === 'object' ? report.metrics : report;
  const totalDetections = normalizeNonNegativeNumber(source.totalDetections);
  const falsePositiveCount = normalizeNonNegativeNumber(source.falsePositiveCount);
  const explicitRate = normalizeRate(source.falsePositiveRate);
  const computedRate =
    explicitRate === null && totalDetections > 0 && falsePositiveCount !== null
      ? falsePositiveCount / totalDetections
      : explicitRate;

  return {
    totalDetections,
    falsePositiveCount,
    falsePositiveRate: computedRate,
  };
}

function normalizeNonNegativeNumber(value) {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function normalizeRate(value) {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) {
    return null;
  }
  if (number <= 1) {
    return number;
  }
  return number <= 100 ? number / 100 : null;
}

export function normalizeQaReviewHandoff(handoff) {
  if (!handoff) {
    return null;
  }

  const blockers = normalizeStringList(handoff.blockers);
  return {
    status: handoff.status === 'ready' && blockers.length === 0 ? 'ready' : 'blocked',
    commitHash: String(handoff.commitHash || '').trim(),
    focusAreas: normalizeStringList(handoff.focusAreas),
    requiredEvidence: normalizeStringList(handoff.requiredEvidence),
    blockers,
  };
}

export function normalizeQaCoveragePlan(plan, { reviewHandoff = null, commitHash = '' } = {}) {
  if (!plan && !reviewHandoff) {
    return null;
  }

  const source = String(plan?.source || (reviewHandoff ? 'code-review' : 'manual')).trim();
  return {
    source,
    commitHash: String(plan?.commitHash || reviewHandoff?.commitHash || commitHash || '').trim(),
    focusAreas: normalizeStringList(
      plan?.focusAreas?.length ? plan.focusAreas : reviewHandoff?.focusAreas || [],
    ),
    requiredEvidence: normalizeStringList(
      plan?.requiredEvidence?.length ? plan.requiredEvidence : reviewHandoff?.requiredEvidence || [],
    ),
  };
}

export function normalizeQaDefectRouting(routing, { status = 'needs-work', blockers = [], defects = [] } = {}) {
  const defaultReasons = [
    ...normalizeStringList(blockers),
    ...normalizeIssueList(defects).map((item) => `${item.title}${item.detail ? `：${item.detail}` : ''}`),
  ];
  const reasons = normalizeStringList(routing?.reasons?.length ? routing.reasons : defaultReasons);
  const requestedTarget = String(routing?.targetStageId || '').trim();
  const shouldReturnToDevelopment =
    typeof routing?.shouldReturnToDevelopment === 'boolean'
      ? routing.shouldReturnToDevelopment
      : requestedTarget === 'development';

  if (status === 'passed') {
    return {
      shouldReturnToDevelopment: false,
      targetStageId: 'acceptance',
      reasons,
    };
  }

  return {
    shouldReturnToDevelopment,
    targetStageId: ROUTING_STAGE_IDS.has(requestedTarget)
      ? requestedTarget
      : shouldReturnToDevelopment
        ? 'development'
        : 'qa',
    reasons,
  };
}

function normalizeTestCase(testCase) {
  const status = CASE_STATUSES.has(testCase.status) ? testCase.status : 'not-run';
  return {
    id: String(testCase.id || '').trim(),
    title: String(testCase.title || '').trim(),
    type: String(testCase.type || 'functional').trim(),
    scenario: String(testCase.scenario || '').trim(),
    status,
    expectedResult: String(testCase.expectedResult || '').trim(),
    evidence: String(testCase.evidence || '').trim(),
  };
}

function normalizeIssueList(items = []) {
  if (!Array.isArray(items)) {
    return [];
  }

  return items
    .map((item) => {
      if (typeof item === 'string') {
        return { title: item.trim(), detail: '' };
      }

      return {
        title: String(item?.title || '').trim(),
        detail: String(item?.detail || '').trim(),
      };
    })
    .filter((item) => item.title);
}

function normalizeStringList(items = []) {
  return Array.isArray(items) ? items.map((item) => String(item || '').trim()).filter(Boolean) : [];
}

function defaultQaSummary(status) {
  return status === 'passed'
    ? '测试通过，准备最终验收材料。'
    : 'QA 发现测试阻塞项，需要补齐后重跑。';
}

function defaultQaNextActions(status) {
  return status === 'passed'
    ? ['测试通过，准备最终验收材料。']
    : ['补齐测试阻塞项后重新执行 QA。'];
}
