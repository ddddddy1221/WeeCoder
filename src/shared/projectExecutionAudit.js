const TERMINAL_STATUSES = new Set(['succeeded', 'failed', 'cancelled', 'exhausted']);
const PLATFORM_JOB_ACTION_STATUSES = new Set(['failed', 'exhausted', 'queued', 'running']);

export function createProjectExecutionAudit(project, options = {}) {
  if (!project) {
    return createEmptyAudit();
  }

  const now = options.now || new Date().toISOString();
  const platformRows = normalizePlatformJobs(project, { now });
  const workflowRows = normalizeWorkflowExecutions(project);
  const rows = [...platformRows, ...workflowRows].sort(compareExecutionRows);
  const latestAction = selectLatestAction(rows);
  const evidenceGapCount = rows.filter((row) => !row.evidenceComplete).length;
  const remediation = createRemediationSummary(rows);
  const executionTimeline = createExecutionTimeline(project, platformRows, now);

  return {
    projectId: project.id || '',
    projectName: project.name || '',
    status: resolveAuditStatus(rows, evidenceGapCount),
    totalExecutionCount: rows.length,
    platformJobCount: platformRows.length,
    workflowExecutionCount: workflowRows.length,
    succeededCount: rows.filter((row) => row.status === 'succeeded').length,
    failedCount: rows.filter((row) => row.status === 'failed' || row.status === 'exhausted').length,
    runningCount: rows.filter((row) => row.status === 'running').length,
    queuedCount: rows.filter((row) => row.status === 'queued').length,
    cancelledCount: rows.filter((row) => row.status === 'cancelled').length,
    evidenceGapCount,
    sandboxPolicyCount: platformRows.filter((row) => row.sandboxPolicy).length,
    latestAction,
    remediation,
    executionTimeline,
    nextAction: createAuditNextAction(rows, latestAction, evidenceGapCount),
    rows,
  };
}

function normalizePlatformJobs(project, { now } = {}) {
  return Array.isArray(project.platformJobs)
    ? project.platformJobs.map((job) => {
        const status = normalizeStatus(job.status);
        const missingEvidence = getPlatformJobEvidenceGaps(job, status);
        const details = job.details || {};
        const leaseExpiresAt = String(job.leaseExpiresAt || '').trim();
        const lockedBy = String(job.lockedBy || '').trim();
        return {
          id: job.id || `${project.id || 'project'}-${job.type || 'platform-job'}`,
          source: 'platform-job',
          type: job.type || 'platform-job',
          title: String(job.title || platformJobTitle(job.type)).trim(),
          status,
          rawStatus: job.status || '',
          command: String(job.command || '').trim(),
          executor: String(job.executor || '').trim(),
          runCount: Number(job.runCount || 0),
          lockedBy,
          leaseStartedAt: job.leaseStartedAt || '',
          leaseHeartbeatAt: job.leaseHeartbeatAt || '',
          leaseExpiresAt,
          isLeaseStale: status === 'running' && isPastTimestamp(leaseExpiresAt, now),
          requestedBy: String(job.requestedBy || '').trim(),
          queuedAt: job.queuedAt || '',
          startedAt: job.startedAt || '',
          finishedAt: job.finishedAt || '',
          updatedAt: job.finishedAt || job.startedAt || job.queuedAt || '',
          resultSummary: String(job.resultSummary || '').trim(),
          errorSummary: String(job.errorSummary || '').trim(),
          exitCode: Number.isInteger(job.exitCode) ? job.exitCode : null,
          durationMs: Number.isFinite(job.durationMs) ? job.durationMs : calculateDurationMs(job.startedAt, job.finishedAt),
          sandboxPolicy: String(details.sandboxPolicy || '').trim(),
          blockedCommand: String(details.blockedCommand || '').trim(),
          evidenceComplete: missingEvidence.length === 0,
          missingEvidence,
          nextAction: createRowNextAction({
            status,
            title: job.title || platformJobTitle(job.type),
            reason: job.errorSummary || job.resultSummary || details.cancelReason || '',
          }),
        };
      })
    : [];
}

function normalizeWorkflowExecutions(project) {
  return [
    normalizeDevelopmentRun(project),
    normalizeCodeReview(project),
    normalizeQaRun(project),
    normalizeDefectFix(project),
  ].filter(Boolean);
}

function createRemediationSummary(rows = []) {
  const actions = rows
    .flatMap((row) => createRemediationActionsForRow(row))
    .sort(compareRemediationActions);

  return {
    totalActionCount: actions.length,
    retryCount: actions.filter((action) => action.action === 'retry').length,
    reclaimCount: actions.filter((action) => action.action === 'reclaim').length,
    startCount: actions.filter((action) => action.action === 'start').length,
    evidenceCount: actions.filter((action) => action.action === 'collect-evidence').length,
    escalateCount: actions.filter((action) => action.action === 'escalate').length,
    primaryAction: actions[0] || null,
    actions,
  };
}

function createRemediationActionsForRow(row = {}) {
  const actions = [];

  if (row.source === 'platform-job') {
    if (row.status === 'failed') {
      actions.push({
        id: `retry-${row.id}`,
        action: 'retry',
        jobId: row.id,
        rowId: row.id,
        title: row.title,
        label: '重试任务',
        severity: 'high',
        reason: row.errorSummary || row.resultSummary || '后台任务失败，需要复核日志后重试。',
        nextAction: `修复 ${row.title} 的阻塞后重试任务。`,
      });
    } else if (row.status === 'exhausted') {
      actions.push({
        id: `escalate-${row.id}`,
        action: 'escalate',
        jobId: row.id,
        rowId: row.id,
        title: row.title,
        label: '升级处理',
        severity: 'critical',
        reason: row.errorSummary || '后台任务重试次数已耗尽。',
        nextAction: `升级 ${row.title} 给技术负责人处理。`,
      });
    } else if (row.status === 'running' && row.isLeaseStale) {
      actions.push({
        id: `reclaim-${row.id}`,
        action: 'reclaim',
        jobId: row.id,
        rowId: row.id,
        title: row.title,
        label: '回收任务',
        severity: 'high',
        reason: `执行器 ${row.lockedBy || '未记录'} 的租约已过期。`,
        nextAction: `回收 ${row.title} 的过期执行器租约，重新进入队列。`,
      });
    } else if (row.status === 'queued') {
      actions.push({
        id: `start-${row.id}`,
        action: 'start',
        jobId: row.id,
        rowId: row.id,
        title: row.title,
        label: '开始任务',
        severity: 'normal',
        reason: '后台任务已排队，等待执行器启动。',
        nextAction: `启动 ${row.title} 并绑定执行器租约。`,
      });
    }
  }

  if ((row.source !== 'platform-job' || !PLATFORM_JOB_ACTION_STATUSES.has(row.status)) && row.missingEvidence?.length) {
    actions.push({
      id: `evidence-${row.id}`,
      action: 'collect-evidence',
      rowId: row.id,
      title: row.title,
      label: '补齐证据',
      severity: 'warning',
      reason: `缺少 ${row.missingEvidence.join('、')}。`,
      missingEvidence: row.missingEvidence,
      nextAction: `补齐 ${row.title} 的执行证据。`,
    });
  }

  return actions;
}

function compareRemediationActions(left, right) {
  const severityDiff = remediationSeverityScore(right.severity) - remediationSeverityScore(left.severity);
  if (severityDiff) {
    return severityDiff;
  }
  const actionDiff = remediationActionScore(right.action) - remediationActionScore(left.action);
  if (actionDiff) {
    return actionDiff;
  }
  return String(left.id || '').localeCompare(String(right.id || ''));
}

function remediationSeverityScore(severity) {
  if (severity === 'critical') {
    return 50;
  }
  if (severity === 'high') {
    return 40;
  }
  if (severity === 'warning') {
    return 30;
  }
  return 20;
}

function remediationActionScore(action) {
  if (action === 'retry') {
    return 50;
  }
  if (action === 'reclaim') {
    return 45;
  }
  if (action === 'escalate') {
    return 40;
  }
  if (action === 'start') {
    return 30;
  }
  return 20;
}

function createExecutionTimeline(project = {}, platformRows = [], now = new Date().toISOString()) {
  const jobById = new Map(platformRows.map((row) => [row.id, row]));
  const events = normalizeAgentJobEvents(project);
  const rows = (Array.isArray(project.agentJobRuns) ? project.agentJobRuns : [])
    .map((run) => normalizeAgentJobRun(run, jobById.get(run.jobId) || {}, events, now))
    .filter((run) => run.runId || run.jobId)
    .sort((left, right) => String(right.updatedAt || '').localeCompare(String(left.updatedAt || '')));

  return {
    totalRunCount: rows.length,
    totalEventCount: events.length,
    activeRunCount: rows.filter((run) => run.status === 'running').length,
    terminalRunCount: rows.filter((run) => run.terminal).length,
    staleRunCount: rows.filter((run) => run.stale).length,
    latestRun: rows[0] || null,
    rows,
  };
}

function normalizeAgentJobRun(run = {}, job = {}, events = [], now = new Date().toISOString()) {
  const relatedEvents = events
    .filter((event) => isAgentEventWithinRun(event, run))
    .sort((left, right) => String(right.createdAt || '').localeCompare(String(left.createdAt || '')));
  const latestEvent = relatedEvents[0] || null;
  const status = normalizeAgentRunStatus(run.status || job.status || 'running');
  const workerId = String(run.workerId || job.lockedBy || '').trim();

  return {
    runId: String(run.id || '').trim(),
    jobId: String(run.jobId || job.id || '').trim(),
    title: job.title || run.title || '后台任务运行',
    type: job.type || run.type || 'ai-development',
    runNumber: Number(run.runNumber || 0) || Number(job.runCount || 0) || 1,
    status,
    workerId,
    leaseStartedAt: run.leaseStartedAt || '',
    leaseHeartbeatAt: run.leaseHeartbeatAt || '',
    leaseExpiresAt: run.leaseExpiresAt || '',
    startedAt: run.startedAt || '',
    finishedAt: run.finishedAt || '',
    durationMs: Number.isFinite(run.durationMs) ? run.durationMs : 0,
    exitCode: Number.isInteger(run.exitCode) ? run.exitCode : null,
    createdAt: run.createdAt || '',
    updatedAt: latestEvent?.createdAt || run.updatedAt || run.finishedAt || run.leaseHeartbeatAt || run.startedAt || '',
    terminal: isTerminalAgentRunStatus(status),
    stale: status === 'running' && Boolean(workerId) && isPastTimestamp(run.leaseExpiresAt, now),
    eventCount: relatedEvents.length,
    latestEventType: latestEvent?.type || '',
    latestEventAt: latestEvent?.createdAt || '',
    latestEventWorkerId: latestEvent?.workerId || '',
    latestEventStatus: latestEvent?.jobStatus || '',
    lifecycle: relatedEvents.map((event) => ({
      eventId: event.id,
      type: event.type,
      workerId: event.workerId,
      jobStatus: event.jobStatus,
      createdAt: event.createdAt,
    })),
  };
}

function normalizeAgentJobEvents(project = {}) {
  return (Array.isArray(project.agentJobEvents) ? project.agentJobEvents : []).map((event) => {
    const payload = event.payload && typeof event.payload === 'object' && !Array.isArray(event.payload)
      ? event.payload
      : {};
    return {
      id: String(event.id || '').trim(),
      jobId: String(event.jobId || payload.jobId || '').trim(),
      runId: String(event.runId || payload.runId || '').trim(),
      type: String(event.type || 'platform-job-event').trim(),
      workerId: String(event.workerId || payload.workerId || '').trim(),
      jobStatus: String(payload.jobStatus || event.jobStatus || '').trim(),
      createdAt: event.createdAt || event.at || '',
    };
  });
}

function isAgentEventWithinRun(event = {}, run = {}) {
  if (!event.jobId || event.jobId !== run.jobId) {
    return false;
  }
  if (event.runId) {
    return event.runId === run.id;
  }

  const eventAt = Date.parse(event.createdAt || '');
  const runStartedAt = Date.parse(run.startedAt || run.leaseStartedAt || run.createdAt || '');
  const runFinishedAt = Date.parse(run.finishedAt || '');
  if (Number.isFinite(eventAt) && Number.isFinite(runStartedAt) && eventAt < runStartedAt) {
    return false;
  }
  if (Number.isFinite(eventAt) && Number.isFinite(runFinishedAt) && eventAt > runFinishedAt) {
    return false;
  }
  return true;
}

function normalizeAgentRunStatus(status = '') {
  return String(status || '').trim() || 'running';
}

function isTerminalAgentRunStatus(status = '') {
  return ['failed', 'succeeded', 'cancelled', 'exhausted', 'reclaimed'].includes(status);
}

function normalizeDevelopmentRun(project) {
  const run = project.developmentRun;
  if (!run) {
    return null;
  }

  const status = normalizeStatus(run.status);
  const checks = Array.isArray(run.checks) ? run.checks : [];
  const command = checks.map((check) => check.command).filter(Boolean).join(' && ');
  const missingEvidence = [];
  if (status === 'succeeded' && !String(run.commitHash || '').trim()) {
    missingEvidence.push('commitHash');
  }
  if (status === 'succeeded' && !checks.length) {
    missingEvidence.push('verificationChecks');
  }

  return {
    id: 'development-run',
    source: 'workflow',
    type: 'ai-development',
    title: 'AI 开发执行',
    status,
    rawStatus: run.status || '',
    command,
    executor: run.provider || '',
    startedAt: run.startedAt || '',
    finishedAt: run.completedAt || '',
    updatedAt: run.completedAt || run.startedAt || '',
    resultSummary: run.summary || '',
    errorSummary: (run.blockers || [])[0] || '',
    commitHash: String(run.commitHash || '').trim(),
    evidenceComplete: missingEvidence.length === 0,
    missingEvidence,
    nextAction: createRowNextAction({
      status,
      title: 'AI 开发执行',
      reason: (run.blockers || [])[0] || run.summary || '',
    }),
  };
}

function normalizeCodeReview(project) {
  const report = project.codeReviewReport;
  if (!report) {
    return null;
  }

  const status = normalizeStatus(report.status);
  const blockers = Array.isArray(report.blockers) ? report.blockers : [];
  const missingEvidence = [];
  if (!String(report.summary || '').trim() && !(Array.isArray(report.categories) && report.categories.length)) {
    missingEvidence.push('reviewSummary');
  }

  return {
    id: 'code-review',
    source: 'workflow',
    type: 'code-review',
    title: '代码/安全/性能评审',
    status,
    rawStatus: report.status || '',
    executor: 'tech-lead',
    startedAt: '',
    finishedAt: report.reviewedAt || '',
    updatedAt: report.reviewedAt || '',
    resultSummary: report.summary || '',
    errorSummary: blockers[0] || '',
    commitHash: String(report.commitHash || '').trim(),
    evidenceComplete: missingEvidence.length === 0,
    missingEvidence,
    nextAction: createRowNextAction({
      status,
      title: '代码/安全/性能评审',
      reason: blockers[0] || report.summary || '',
    }),
  };
}

function normalizeQaRun(project) {
  const run = project.qaRun;
  if (!run) {
    return null;
  }

  const status = normalizeStatus(run.status);
  const missingEvidence = [];
  const testCases = Array.isArray(run.testCases) ? run.testCases : [];
  if (!testCases.length) {
    missingEvidence.push('testCases');
  }
  if (project.qaEvidence?.status !== 'ready') {
    missingEvidence.push('qaEvidence');
  }

  return {
    id: 'qa-run',
    source: 'workflow',
    type: 'qa-run',
    title: '测试验证执行',
    status,
    rawStatus: run.status || '',
    executor: 'qa',
    startedAt: '',
    finishedAt: run.executedAt || run.generatedAt || '',
    updatedAt: run.executedAt || run.generatedAt || '',
    resultSummary: run.summary || '',
    errorSummary: (run.blockers || [])[0] || '',
    commitHash: String(run.commitHash || '').trim(),
    evidenceComplete: missingEvidence.length === 0,
    missingEvidence,
    nextAction: createRowNextAction({
      status,
      title: '测试验证执行',
      reason: (run.blockers || [])[0] || run.summary || '',
    }),
  };
}

function normalizeDefectFix(project) {
  const pack = project.defectFixPackage;
  if (!pack) {
    return null;
  }

  const submission = pack.repairSubmission || {};
  const status = normalizeStatus(submission.status || pack.status);
  const missingEvidence = [];
  if (!submission.jobId) {
    missingEvidence.push('repairJob');
  }
  if (['succeeded', 'failed'].includes(status) && !submission.jobResultSummary && !submission.jobErrorSummary) {
    missingEvidence.push('repairResult');
  }

  return {
    id: 'defect-fix',
    source: 'workflow',
    type: 'qa-defect-fix',
    title: '测试缺陷修复闭环',
    status,
    rawStatus: submission.status || pack.status || '',
    command: submission.jobCommand || '',
    executor: 'ai-dev',
    startedAt: submission.jobStartedAt || '',
    finishedAt: submission.jobFinishedAt || submission.closedAt || '',
    updatedAt: submission.jobFinishedAt || submission.closedAt || submission.submittedAt || pack.createdAt || '',
    resultSummary: submission.jobResultSummary || '',
    errorSummary: submission.jobErrorSummary || '',
    commitHash: String(submission.commitHash || '').trim(),
    linkedJobId: submission.jobId || '',
    sandboxPolicy: String(submission.sandboxPolicy || '').trim(),
    evidenceComplete: missingEvidence.length === 0,
    missingEvidence,
    nextAction: createRowNextAction({
      status,
      title: '测试缺陷修复闭环',
      reason: submission.jobErrorSummary || submission.jobResultSummary || pack.reasons?.[0] || '',
    }),
  };
}

function normalizeStatus(status) {
  const value = String(status || '').trim();
  if (['succeeded', 'completed', 'passed', 'ready-for-review', 'ready', 'closed'].includes(value)) {
    return 'succeeded';
  }
  if (['running', 'executing', 'reviewing', 'qa-retest'].includes(value)) {
    return 'running';
  }
  if (['cancelled', 'canceled'].includes(value)) {
    return 'cancelled';
  }
  if (['exhausted', 'retry-exhausted'].includes(value)) {
    return 'exhausted';
  }
  if (['failed', 'blocked', 'needs-work'].includes(value)) {
    return 'failed';
  }
  return 'queued';
}

function resolveAuditStatus(rows, evidenceGapCount) {
  if (!rows.length) {
    return 'missing';
  }
  if (rows.some((row) => row.status === 'failed' || row.status === 'exhausted')) {
    return 'blocked';
  }
  if (rows.some((row) => row.status === 'running')) {
    return 'running';
  }
  if (evidenceGapCount > 0) {
    return 'evidence-gap';
  }
  if (rows.some((row) => row.status === 'queued')) {
    return 'queued';
  }
  return 'auditable';
}

function selectLatestAction(rows) {
  return [...rows].sort(compareExecutionRows)[0] || null;
}

function compareExecutionRows(left, right) {
  const priorityDiff = statusPriority(right.status) - statusPriority(left.status);
  if (priorityDiff) {
    return priorityDiff;
  }
  const sourceDiff = sourcePriority(right.source) - sourcePriority(left.source);
  if (sourceDiff) {
    return sourceDiff;
  }
  return String(right.updatedAt || '').localeCompare(String(left.updatedAt || ''));
}

function statusPriority(status) {
  if (status === 'failed' || status === 'exhausted') {
    return 50;
  }
  if (status === 'running') {
    return 40;
  }
  if (status === 'queued') {
    return 30;
  }
  if (status === 'cancelled') {
    return 20;
  }
  return 10;
}

function sourcePriority(source) {
  return source === 'platform-job' ? 10 : 0;
}

function createAuditNextAction(rows, latestAction, evidenceGapCount) {
  if (!rows.length) {
    return '先排队 AI coding、代码评审或测试后台任务，形成可审计的自动执行记录。';
  }
  const failed = rows.find((row) => row.status === 'failed' || row.status === 'exhausted');
  if (failed) {
    const reason = failed.errorSummary || failed.resultSummary || failed.nextAction || '查看执行证据';
    return `先处理失败的后台任务 ${failed.title}：${reason}`;
  }
  const running = rows.find((row) => row.status === 'running');
  if (running) {
    return `等待 ${running.title} 完成，并持续记录执行心跳和输出证据。`;
  }
  if (evidenceGapCount > 0) {
    return '补齐执行摘要、日志、退出码和沙箱策略，保证后续验收可追溯。';
  }
  if (latestAction?.status === 'queued') {
    return `启动排队中的后台任务 ${latestAction.title}，并绑定执行器租约。`;
  }
  return '自动执行记录已可追溯，继续推进下一交付闸口。';
}

function createRowNextAction({ status, title, reason }) {
  if (status === 'failed' || status === 'exhausted') {
    return `处理 ${title} 的失败原因：${reason || '查看错误日志。'}`;
  }
  if (status === 'running') {
    return `等待 ${title} 完成并记录输出证据。`;
  }
  if (status === 'queued') {
    return `启动 ${title} 并绑定执行器。`;
  }
  if (status === 'cancelled') {
    return `复核 ${title} 是否需要重新排队。`;
  }
  return `${title} 已有可追溯记录。`;
}

function getPlatformJobEvidenceGaps(job, status) {
  if (!TERMINAL_STATUSES.has(status) || status === 'cancelled') {
    return [];
  }
  const hasStructuredEvidence = Boolean(
    job.details?.sandboxPolicy ||
      job.details?.blockedCommand ||
      job.details?.cancelReason,
  );
  const missing = [];
  if (!hasStructuredEvidence && !job.stdout && !job.stderr) {
    missing.push('stdout/stderr');
  }
  if (!hasStructuredEvidence && !job.resultSummary) {
    missing.push('resultSummary');
  }
  if ((status === 'failed' || status === 'exhausted') && !job.errorSummary) {
    missing.push('errorSummary');
  }
  return missing;
}

function calculateDurationMs(startedAt, finishedAt) {
  const started = Date.parse(startedAt || '');
  const finished = Date.parse(finishedAt || '');
  if (!Number.isFinite(started) || !Number.isFinite(finished) || finished <= started) {
    return 0;
  }
  return finished - started;
}

function isPastTimestamp(value, now) {
  const parsedValue = Date.parse(value || '');
  const parsedNow = Date.parse(now || '');
  return Number.isFinite(parsedValue) && Number.isFinite(parsedNow) && parsedValue < parsedNow;
}

function platformJobTitle(type) {
  if (type === 'qa-defect-fix') {
    return '测试缺陷修复执行';
  }
  if (type === 'code-review') {
    return '代码评审后台任务';
  }
  if (type === 'qa-run') {
    return '测试后台任务';
  }
  return 'AI coding 后台任务';
}

function createEmptyAudit() {
  return {
    projectId: '',
    projectName: '',
    status: 'missing',
    totalExecutionCount: 0,
    platformJobCount: 0,
    workflowExecutionCount: 0,
    succeededCount: 0,
    failedCount: 0,
    runningCount: 0,
    queuedCount: 0,
    cancelledCount: 0,
    evidenceGapCount: 0,
    sandboxPolicyCount: 0,
    latestAction: null,
    remediation: createRemediationSummary([]),
    executionTimeline: createExecutionTimeline({}, [], new Date().toISOString()),
    nextAction: '先排队 AI coding、代码评审或测试后台任务，形成可审计的自动执行记录。',
    rows: [],
  };
}
