const PACKAGE_VERSION = 'agent-package-v1';
const PRD_STAGE_ID = 'prd-approval';
const PM_STAGE_ID = 'pm-requirements';
const DEVELOPMENT_STAGE_ID = 'development';

export function createAgentExecutionPackage(project) {
  const generatedAt = new Date().toISOString();
  const repository = createRepositorySnapshot(project);
  const tasks = normalizeTasks(project.developmentPlan?.tasks);
  const verificationCommands = normalizeStringList(
    project.repositoryConfig?.verificationCommands?.length
      ? project.repositoryConfig.verificationCommands
      : project.developmentPlan?.verificationCommands,
  );
  const prdVersion = normalizePrdVersion(project.prdVersion);
  const requirementChangeImpact = normalizeRequirementChangeImpact(project.prdChangeImpact);
  const gates = createAgentLaunchGates(project, { tasks, verificationCommands, prdVersion, requirementChangeImpact });
  const blockers = gates
    .filter((gate) => gate.status !== 'ready')
    .map((gate) => gate.blocker)
    .filter(Boolean);
  const status = blockers.length ? 'blocked' : 'ready';

  const executionPackage = {
    version: PACKAGE_VERSION,
    status,
    canStart: status === 'ready',
    generatedAt,
    project: {
      id: project.id || '',
      name: project.name || '',
      sponsor: project.sponsor || '',
      summary: project.summary || '',
    },
    repository,
    prdVersion,
    requirementChangeImpact,
    gates,
    blockers,
    tasks,
    verificationCommands,
    artifacts: {
      prd: String(project.artifacts?.[PRD_STAGE_ID] || project.artifacts?.[PM_STAGE_ID] || '').trim(),
      development: String(project.artifacts?.[DEVELOPMENT_STAGE_ID] || '').trim(),
    },
  };

  return {
    ...executionPackage,
    instructions: buildAgentInstructions(executionPackage),
  };
}

export function normalizeAgentExecutionPackage(agentPackage) {
  if (!agentPackage) {
    return null;
  }

  const normalized = {
    version: agentPackage.version || PACKAGE_VERSION,
    status: ['ready', 'blocked'].includes(agentPackage.status) ? agentPackage.status : 'blocked',
    canStart: Boolean(agentPackage.canStart),
    generatedAt: String(agentPackage.generatedAt || '').trim(),
    project: {
      id: String(agentPackage.project?.id || '').trim(),
      name: String(agentPackage.project?.name || '').trim(),
      sponsor: String(agentPackage.project?.sponsor || '').trim(),
      summary: String(agentPackage.project?.summary || '').trim(),
    },
    repository: {
      localPath: String(agentPackage.repository?.localPath || '').trim(),
      baseBranch: String(agentPackage.repository?.baseBranch || 'main').trim(),
      targetBranch: String(agentPackage.repository?.targetBranch || '').trim(),
      executionMode: String(agentPackage.repository?.executionMode || 'codex-local').trim(),
    },
    prdVersion: normalizePrdVersion(agentPackage.prdVersion),
    requirementChangeImpact: normalizeRequirementChangeImpact(agentPackage.requirementChangeImpact),
    gates: normalizeGates(agentPackage.gates),
    blockers: normalizeStringList(agentPackage.blockers),
    tasks: normalizeTasks(agentPackage.tasks),
    verificationCommands: normalizeStringList(agentPackage.verificationCommands),
    artifacts: {
      prd: String(agentPackage.artifacts?.prd || '').trim(),
      development: String(agentPackage.artifacts?.development || '').trim(),
    },
    instructions: String(agentPackage.instructions || '').trim(),
  };

  const stalePrdBlocker = isPrdStale(normalized.prdVersion, normalized.requirementChangeImpact)
    ? createPrdStaleBlocker(normalized.prdVersion, normalized.requirementChangeImpact)
    : '';
  const blockers = stalePrdBlocker && !normalized.blockers.includes(stalePrdBlocker)
    ? [stalePrdBlocker, ...normalized.blockers]
    : normalized.blockers;
  const gates = ensurePrdVersionGate(normalized.gates, {
    isReady: !stalePrdBlocker,
    blocker: stalePrdBlocker,
  });
  const status = stalePrdBlocker ? 'blocked' : normalized.status;

  return {
    ...normalized,
    status,
    gates,
    blockers,
    canStart: status === 'ready' && normalized.canStart,
  };
}

function createLaunchGates(project, { tasks, verificationCommands, prdVersion, requirementChangeImpact }) {
  return createAgentLaunchGates(project, { tasks, verificationCommands, prdVersion, requirementChangeImpact });

  const repositoryInspection = project.repositoryInspection || {};
  const branchPreparation = project.branchPreparation || {};
  const prdIsCurrent = !isPrdStale(prdVersion, requirementChangeImpact);

  const prdStale = isPrdStale(executionPackage.prdVersion, executionPackage.requirementChangeImpact);
  const prdVersionLabel =
    executionPackage.prdVersion?.label || executionPackage.requirementChangeImpact?.versionLabel || '未记录';
  const prdLines = [
    `PRD 版本：${prdVersionLabel}（${prdStale ? '已过期' : '当前有效'}）`,
    executionPackage.requirementChangeImpact?.summary
      ? `变更影响：${executionPackage.requirementChangeImpact.summary}`
      : '',
    ...(executionPackage.requirementChangeImpact?.requiredActions || []).map((action) => `后续动作：${action}`),
  ].filter(Boolean);

  return [
    createGate({
      id: 'prd',
      label: 'PRD',
      isReady: project.prdStatus === 'generated' && Boolean(project.artifacts?.[PRD_STAGE_ID] || project.artifacts?.[PM_STAGE_ID]),
      blocker: 'PRD 未生成，不能启动 AI 开发。',
    }),
    createGate({
      id: 'prd-version',
      label: 'PRD 版本',
      isReady: prdIsCurrent,
      blocker: createPrdStaleBlocker(prdVersion, requirementChangeImpact),
    }),
    createGate({
      id: 'technical-handoff',
      label: '技术交接',
      isReady: project.technicalHandoffStatus === 'generated',
      blocker: '技术交接包未生成，不能启动 AI 开发。',
    }),
    createGate({
      id: 'development-plan',
      label: '开发计划',
      isReady: tasks.length > 0,
      blocker: '开发任务清单为空，不能启动 AI 开发。',
    }),
    createGate({
      id: 'repository-config',
      label: '仓库配置',
      isReady: project.repositoryConfig?.status === 'ready',
      blocker: '仓库配置未就绪，不能启动 AI 开发。',
    }),
    createGate({
      id: 'repository-inspection',
      label: '仓库诊断',
      isReady: repositoryInspection.status === 'ready',
      blocker: `仓库诊断未通过：${formatReasons(repositoryInspection.issues, '请先运行仓库诊断。')}`,
    }),
    createGate({
      id: 'branch-preparation',
      label: '分支准备',
      isReady: branchPreparation.status === 'ready' && branchPreparation.canRunDevelopment,
      blocker: `目标分支未准备好：${formatReasons(branchPreparation.issues, '请先准备目标分支。')}`,
    }),
    createGate({
      id: 'verification-commands',
      label: '检查命令',
      isReady: verificationCommands.length > 0,
      blocker: '检查命令为空，不能启动 AI 开发。',
    }),
  ];
}

function createAgentLaunchGates(project, { tasks, verificationCommands, prdVersion, requirementChangeImpact }) {
  const repositoryInspection = project.repositoryInspection || {};
  const branchPreparation = project.branchPreparation || {};

  return [
    createGate({
      id: 'prd',
      label: 'PRD',
      isReady: project.prdStatus === 'generated' && Boolean(project.artifacts?.[PRD_STAGE_ID] || project.artifacts?.[PM_STAGE_ID]),
      blocker: 'PRD 未生成，不能启动 AI 开发。',
    }),
    createGate({
      id: 'prd-version',
      label: 'PRD 版本',
      isReady: !isPrdStale(prdVersion, requirementChangeImpact),
      blocker: createPrdStaleBlocker(prdVersion, requirementChangeImpact),
    }),
    createGate({
      id: 'technical-handoff',
      label: '技术交接',
      isReady: project.technicalHandoffStatus === 'generated',
      blocker: '技术交接包未生成，不能启动 AI 开发。',
    }),
    createGate({
      id: 'development-plan',
      label: '开发计划',
      isReady: tasks.length > 0,
      blocker: '开发任务清单为空，不能启动 AI 开发。',
    }),
    createGate({
      id: 'repository-config',
      label: '仓库配置',
      isReady: project.repositoryConfig?.status === 'ready',
      blocker: '仓库配置未就绪，不能启动 AI 开发。',
    }),
    createGate({
      id: 'repository-inspection',
      label: '仓库诊断',
      isReady: repositoryInspection.status === 'ready',
      blocker: `仓库诊断未通过：${formatReasons(repositoryInspection.issues, '请先运行仓库诊断。')}`,
    }),
    createGate({
      id: 'branch-preparation',
      label: '分支准备',
      isReady: branchPreparation.status === 'ready' && branchPreparation.canRunDevelopment,
      blocker: `目标分支未准备好：${formatReasons(branchPreparation.issues, '请先准备目标分支。')}`,
    }),
    createGate({
      id: 'verification-commands',
      label: '检查命令',
      isReady: verificationCommands.length > 0,
      blocker: '检查命令为空，不能启动 AI 开发。',
    }),
  ];
}

function createGate({ id, label, isReady, blocker }) {
  return {
    id,
    label,
    status: isReady ? 'ready' : 'blocked',
    blocker: isReady ? '' : blocker,
  };
}

function createRepositorySnapshot(project) {
  return {
    localPath: String(project.repositoryConfig?.localPath || '').trim(),
    baseBranch: String(project.repositoryConfig?.baseBranch || 'main').trim(),
    targetBranch: String(project.repositoryConfig?.targetBranch || '').trim(),
    executionMode: String(project.repositoryConfig?.executionMode || 'codex-local').trim(),
  };
}

function buildInstructions(executionPackage) {
  const taskLines = executionPackage.tasks.length
    ? executionPackage.tasks.flatMap((task, index) => [
        `${index + 1}. [${task.area}] ${task.title}`,
        `   描述：${task.description || '按 PRD 和技术交接实现。'}`,
        `   验收：${task.acceptanceCriteria.join('；') || '按 PRD 验收。'}`,
        `   检查：${task.verification.join('；') || executionPackage.verificationCommands.join('；')}`,
      ])
    : ['暂无开发任务。'];
  const blockerLines = executionPackage.blockers.length
    ? executionPackage.blockers.map((blocker) => `- ${blocker}`)
    : ['- 无'];

  return [
    `启动状态：${executionPackage.canStart ? 'READY' : 'BLOCKED'}`,
    `项目：${executionPackage.project.name}`,
    `负责人：${executionPackage.project.sponsor || '未配置'}`,
    `业务概要：${executionPackage.project.summary || '未配置'}`,
    '',
    '## 仓库',
    `本地路径：${executionPackage.repository.localPath || '未配置'}`,
    `基准分支：${executionPackage.repository.baseBranch || 'main'}`,
    `目标分支：${executionPackage.repository.targetBranch || '未配置'}`,
    `执行模式：${executionPackage.repository.executionMode || 'codex-local'}`,
    '',
    '## 启动阻塞',
    ...blockerLines,
    '',
    '## 开发任务',
    ...taskLines,
    '',
    '## 必须运行的检查命令',
    ...(executionPackage.verificationCommands.length
      ? executionPackage.verificationCommands.map((command) => `- ${command}`)
      : ['- 未配置']),
    '',
    '## 执行要求',
    '- 严格按 PRD、技术交接包和开发任务清单实现。',
    '- 不要修改与本任务无关的文件。',
    '- 不要绕过测试、构建或依赖审计。',
    '- 不要把密钥、账号、RTSP 密码或内部地址写入前端代码或日志。',
    '- 每个变更必须补充或更新对应测试。',
    '- 完成后输出变更摘要、测试结果、安全/性能检查结果和剩余风险。',
  ].join('\n');
}

function normalizePrdVersion(version) {
  if (!version) {
    return null;
  }
  const number = Number.isInteger(version.number) && version.number > 0 ? version.number : 0;
  const label = String(version.label || (number ? `v${number}` : '')).trim();
  const status = version.status === 'stale' ? 'stale' : 'current';
  return {
    number,
    label,
    status,
    generatedAt: String(version.generatedAt || '').trim(),
    generatedBy: String(version.generatedBy || '').trim(),
  };
}

function normalizeRequirementChangeImpact(impact) {
  if (!impact) {
    return null;
  }
  const changedQuestions = Array.isArray(impact.changedQuestions)
    ? impact.changedQuestions
        .map((question) => ({
          id: String(question.id || '').trim(),
          label: String(question.label || question.id || '').trim(),
          previousAnswer: String(question.previousAnswer || '').trim(),
          currentAnswer: String(question.currentAnswer || '').trim(),
        }))
        .filter((question) => question.id)
    : [];
  return {
    status: impact.status === 'stale' ? 'stale' : 'current',
    version: Number.isInteger(impact.version) && impact.version > 0 ? impact.version : 0,
    versionLabel: String(impact.versionLabel || '').trim(),
    changedQuestionIds: Array.isArray(impact.changedQuestionIds)
      ? impact.changedQuestionIds.map((item) => String(item || '').trim()).filter(Boolean)
      : changedQuestions.map((question) => question.id),
    changedQuestions,
    summary: String(impact.summary || '').trim(),
    requiredActions: normalizeStringList(impact.requiredActions),
  };
}

function isPrdStale(prdVersion, requirementChangeImpact) {
  return prdVersion?.status === 'stale' || requirementChangeImpact?.status === 'stale';
}

function createPrdStaleBlocker(prdVersion, requirementChangeImpact) {
  if (requirementChangeImpact?.summary) {
    return requirementChangeImpact.summary;
  }
  const versionLabel = prdVersion?.label || requirementChangeImpact?.versionLabel || '当前版本';
  return `PRD ${versionLabel} 已过期，请重新运行智能需求评审并生成最新 PRD。`;
}

function ensurePrdVersionGate(gates, { isReady, blocker }) {
  const nextGate = {
    id: 'prd-version',
    label: 'PRD 版本',
    status: isReady ? 'ready' : 'blocked',
    blocker: isReady ? '' : blocker,
  };
  const hasGate = gates.some((gate) => gate.id === 'prd-version');
  if (!hasGate) {
    return [...gates, nextGate];
  }
  return gates.map((gate) => (gate.id === 'prd-version' ? { ...gate, ...nextGate } : gate));
}

function buildAgentInstructions(executionPackage) {
  const prdStale = isPrdStale(executionPackage.prdVersion, executionPackage.requirementChangeImpact);
  const prdVersionLabel =
    executionPackage.prdVersion?.label || executionPackage.requirementChangeImpact?.versionLabel || '未记录';
  const taskLines = executionPackage.tasks.length
    ? executionPackage.tasks.flatMap((task, index) => [
        `${index + 1}. [${task.area}] ${task.title}`,
        `   描述：${task.description || '按 PRD 和技术交接实现。'}`,
        `   验收：${task.acceptanceCriteria.join('；') || '按 PRD 验收。'}`,
        `   检查：${task.verification.join('；') || executionPackage.verificationCommands.join('；')}`,
      ])
    : ['暂无开发任务。'];
  const blockerLines = executionPackage.blockers.length
    ? executionPackage.blockers.map((blocker) => `- ${blocker}`)
    : ['- 无'];
  const actionLines = (executionPackage.requirementChangeImpact?.requiredActions || []).map(
    (action) => `- ${action}`,
  );

  return [
    `启动状态：${executionPackage.canStart ? 'READY' : 'BLOCKED'}`,
    `项目：${executionPackage.project.name}`,
    `负责人：${executionPackage.project.sponsor || '未配置'}`,
    `业务概要：${executionPackage.project.summary || '未配置'}`,
    '',
    '## PRD 版本',
    `PRD 版本：${prdVersionLabel}（${prdStale ? '已过期' : '当前有效'}）`,
    executionPackage.requirementChangeImpact?.summary
      ? `变更影响：${executionPackage.requirementChangeImpact.summary}`
      : '',
    ...(actionLines.length ? ['后续动作：', ...actionLines] : []),
    '',
    '## 仓库',
    `本地路径：${executionPackage.repository.localPath || '未配置'}`,
    `基准分支：${executionPackage.repository.baseBranch || 'main'}`,
    `目标分支：${executionPackage.repository.targetBranch || '未配置'}`,
    `执行模式：${executionPackage.repository.executionMode || 'codex-local'}`,
    '',
    '## 启动阻塞',
    ...blockerLines,
    '',
    '## 开发任务',
    ...taskLines,
    '',
    '## 必须运行的检查命令',
    ...(executionPackage.verificationCommands.length
      ? executionPackage.verificationCommands.map((command) => `- ${command}`)
      : ['- 未配置']),
    '',
    '## 执行要求',
    '- 严格按 PRD、技术交接包和开发任务清单实现。',
    '- 不要修改与本任务无关的文件。',
    '- 不要绕过测试、构建或依赖审计。',
    '- 不要把密钥、账号、RTSP 密码或内部地址写入前端代码或日志。',
    '- 每个变更必须补充或更新对应测试。',
    '- 完成后输出变更摘要、测试结果、安全/性能检查结果和剩余风险。',
  ].filter((line) => line !== '').join('\n');
}

function normalizeTasks(tasks = []) {
  return Array.isArray(tasks)
    ? tasks.map((task, index) => ({
        id: String(task.id || `task-${index + 1}`).trim(),
        area: String(task.area || '开发').trim(),
        title: String(task.title || `开发任务 ${index + 1}`).trim(),
        description: String(task.description || '').trim(),
        acceptanceCriteria: normalizeStringList(task.acceptanceCriteria),
        verification: normalizeStringList(task.verification),
      })).filter((task) => task.title)
    : [];
}

function normalizeGates(gates = []) {
  return Array.isArray(gates)
    ? gates.map((gate) => ({
        id: String(gate.id || '').trim(),
        label: String(gate.label || gate.id || '').trim(),
        status: gate.status === 'ready' ? 'ready' : 'blocked',
        blocker: String(gate.blocker || '').trim(),
      })).filter((gate) => gate.id)
    : [];
}

function formatReasons(items, fallback) {
  const reasons = normalizeStringList(items);
  return reasons.length ? reasons.join('；') : fallback;
}

function normalizeStringList(items = []) {
  return Array.isArray(items) ? items.map((item) => String(item || '').trim()).filter(Boolean) : [];
}
