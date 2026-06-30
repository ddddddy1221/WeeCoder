const DEVELOPMENT_STAGE_ID = 'development';

export function createDevelopmentRun(project, { actor = 'AI 开发', provider = 'local-rule' } = {}) {
  const plan = project.developmentPlan;
  const tasks = Array.isArray(plan?.tasks) ? plan.tasks : [];
  const commands = Array.isArray(plan?.verificationCommands) ? plan.verificationCommands : [];
  const repositorySnapshot = createRepositorySnapshot(project.repositoryConfig);
  const now = new Date().toISOString();

  return {
    id: makeRunId(now),
    mode: 'execution-package',
    status: 'ready-for-agent',
    provider,
    actor,
    sourceStageId: DEVELOPMENT_STAGE_ID,
    repositorySnapshot,
    startedAt: now,
    completedAt: '',
    summary: '已生成开发执行包，等待接入真实代码执行器、CI 和 PR 流程。',
    repositoryAudit: null,
    changePackage: null,
    taskResults: tasks.map((task) => ({
      taskId: task.id,
      title: task.title,
      area: task.area,
      status: 'planned',
      result: '已纳入开发执行包，尚未执行真实代码修改。',
      acceptanceCriteria: [...(task.acceptanceCriteria || [])],
    })),
    checks: commands.map((command) => ({
      command,
      status: 'not-run',
      result: '等待真实 runner 接入后执行。',
    })),
    blockers: [
      ...(repositorySnapshot.status === 'ready'
        ? []
        : ['代码仓库或本地路径、目标分支尚未配置完整：当前执行包还不能交给真实代码执行器。']),
      '真实代码执行器尚未接入：当前只生成执行包，不会修改业务代码仓库。',
      'CI/PR 集成尚未接入：测试命令记录为待执行状态。',
    ],
    nextActions: [
      '接入仓库选择、分支创建和 Codex 执行器。',
      '把检查命令接入真实 runner，并把结果回写到执行记录。',
      '执行完成后自动流转到代码/安全/性能 Review 阶段。',
    ],
  };
}

export function normalizeDevelopmentRun(run) {
  if (!run) {
    return null;
  }

  const normalized = normalizeDevelopmentRunFields(run);
  if (!normalized.changePackage && canInferLegacyChangePackage(normalized)) {
    normalized.changePackage = buildDevelopmentChangePackage(normalized, {
      createdAt: normalized.completedAt || normalized.startedAt || '',
    });
  }

  return normalized;
}

function normalizeDevelopmentRunFields(run) {
  return {
    id: run.id || makeRunId(run.startedAt || new Date().toISOString()),
    mode: run.mode || 'execution-package',
    status: normalizeRunStatus(run.status),
    provider: run.provider || 'local-rule',
    actor: run.actor || 'AI 开发',
    sourceStageId: run.sourceStageId || DEVELOPMENT_STAGE_ID,
    repositorySnapshot: createRepositorySnapshot(run.repositorySnapshot),
    startedAt: run.startedAt || '',
    completedAt: run.completedAt || '',
    summary: run.summary || '',
    commitHash: String(run.commitHash || '').trim(),
    filesChanged: normalizeStringList(run.filesChanged),
    repositoryAudit: normalizeRepositoryAudit(run.repositoryAudit),
    changePackage: normalizeDevelopmentChangePackage(run.changePackage),
    taskResults: normalizeTaskResults(run.taskResults),
    checks: normalizeChecks(run.checks),
    blockers: normalizeStringList(run.blockers),
    nextActions: normalizeStringList(run.nextActions),
  };
}

export function createDevelopmentChangePackage(run, { createdAt = new Date().toISOString() } = {}) {
  const normalizedRun = normalizeDevelopmentRunFields(run);
  return buildDevelopmentChangePackage(normalizedRun, { createdAt });
}

function buildDevelopmentChangePackage(normalizedRun, { createdAt = new Date().toISOString() } = {}) {
  const verification = summarizeVerification(normalizedRun.checks);
  const blockers = [];

  if (!normalizedRun.commitHash) {
    blockers.push('缺少开发提交记录，不能进入代码 Review。');
  }
  if (verification.total === 0) {
    blockers.push('缺少本地检查结果，不能进入代码 Review。');
  }
  if (verification.failed || verification.blocked || verification.passed !== verification.total) {
    blockers.push('本地检查尚未全部通过，不能进入代码 Review。');
  }

  return normalizeDevelopmentChangePackage({
    status: blockers.length ? 'blocked' : 'ready-for-review',
    createdAt,
    summary: blockers.length
      ? '开发变更包存在阻塞项，暂不能进入代码 Review。'
      : '开发变更、仓库审计和本地检查结果已汇总，可以进入代码 Review。',
    commitHash: normalizedRun.commitHash,
    filesChanged: normalizedRun.filesChanged,
    repositoryAudit: normalizedRun.repositoryAudit,
    tasks: normalizedRun.taskResults,
    verification,
    reviewGate: {
      canStartReview: blockers.length === 0,
      blockers,
    },
  });
}

function canInferLegacyChangePackage(run) {
  const verification = summarizeVerification(run.checks);
  return (
    run.status === 'completed' &&
    Boolean(run.commitHash) &&
    run.filesChanged.length > 0 &&
    verification.total > 0 &&
    verification.passed === verification.total &&
    verification.failed === 0 &&
    verification.blocked === 0
  );
}

function createRepositorySnapshot(config = {}) {
  return {
    status: config.status === 'ready' ? 'ready' : 'incomplete',
    repositoryUrl: String(config.repositoryUrl || '').trim(),
    localPath: String(config.localPath || '').trim(),
    baseBranch: String(config.baseBranch || 'main').trim(),
    targetBranch: String(config.targetBranch || '').trim(),
    executionMode: String(config.executionMode || 'codex-local').trim(),
    verificationCommands: normalizeStringList(config.verificationCommands),
  };
}

function normalizeTaskResults(results = []) {
  return Array.isArray(results)
    ? results.map((item, index) => ({
        taskId: item.taskId || `task-${index + 1}`,
        title: item.title || `任务 ${index + 1}`,
        area: item.area || '开发',
        status: normalizeTaskStatus(item.status),
        result: item.result || '',
        acceptanceCriteria: normalizeStringList(item.acceptanceCriteria),
      }))
    : [];
}

function normalizeChecks(checks = []) {
  return Array.isArray(checks)
    ? checks.map((item) => ({
        command: item.command || '',
        status: normalizeCheckStatus(item.status),
        result: item.result || '',
        exitCode: Number.isInteger(item.exitCode) ? item.exitCode : item.exitCode === null ? null : undefined,
        durationMs: Number.isFinite(item.durationMs) ? item.durationMs : undefined,
        startedAt: item.startedAt || '',
        completedAt: item.completedAt || '',
        stdout: item.stdout || '',
        stderr: item.stderr || '',
      })).filter((item) => item.command)
    : [];
}

function normalizeRepositoryAudit(audit) {
  if (!audit) {
    return null;
  }

  return {
    before: normalizeRepositoryAuditSnapshot(audit.before),
    after: normalizeRepositoryAuditSnapshot(audit.after),
    committed: Boolean(audit.committed),
  };
}

function normalizeRepositoryAuditSnapshot(snapshot = {}) {
  return {
    branch: String(snapshot.branch || '').trim(),
    head: String(snapshot.head || '').trim(),
    changedFiles: normalizeStringList(snapshot.changedFiles),
  };
}

function normalizeDevelopmentChangePackage(pack) {
  if (!pack) {
    return null;
  }

  return {
    status: ['ready-for-review', 'blocked'].includes(pack.status) ? pack.status : 'blocked',
    createdAt: String(pack.createdAt || '').trim(),
    summary: String(pack.summary || '').trim(),
    commitHash: String(pack.commitHash || '').trim(),
    filesChanged: normalizeStringList(pack.filesChanged),
    repositoryAudit: normalizeRepositoryAudit(pack.repositoryAudit),
    tasks: normalizeTaskResults(pack.tasks),
    verification: {
      total: Number(pack.verification?.total || 0),
      passed: Number(pack.verification?.passed || 0),
      failed: Number(pack.verification?.failed || 0),
      blocked: Number(pack.verification?.blocked || 0),
    },
    reviewGate: {
      canStartReview: Boolean(pack.reviewGate?.canStartReview),
      blockers: normalizeStringList(pack.reviewGate?.blockers),
    },
  };
}

function summarizeVerification(checks = []) {
  const normalizedChecks = normalizeChecks(checks);
  return {
    total: normalizedChecks.length,
    passed: normalizedChecks.filter((check) => check.status === 'passed').length,
    failed: normalizedChecks.filter((check) => check.status === 'failed').length,
    blocked: normalizedChecks.filter((check) => check.status === 'blocked').length,
  };
}

function normalizeStringList(items = []) {
  return Array.isArray(items) ? items.map((item) => String(item || '').trim()).filter(Boolean) : [];
}

function normalizeRunStatus(status) {
  return ['ready-for-agent', 'running', 'completed', 'blocked'].includes(status)
    ? status
    : 'ready-for-agent';
}

function normalizeTaskStatus(status) {
  return ['planned', 'running', 'completed', 'blocked'].includes(status) ? status : 'planned';
}

function normalizeCheckStatus(status) {
  return ['not-run', 'running', 'passed', 'failed', 'blocked'].includes(status) ? status : 'not-run';
}

function makeRunId(timestamp) {
  const suffix = String(timestamp || Date.now()).replace(/[^0-9]/g, '').slice(0, 14) || Date.now();
  return `dev-run-${suffix}`;
}
