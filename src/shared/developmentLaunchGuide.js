export function createDevelopmentLaunchGuide(project = {}) {
  const repositoryConfig = project.repositoryConfig || {};
  const repositoryInspection = project.repositoryInspection || null;
  const branchPreparation = project.branchPreparation || null;
  const agentPackage = project.agentExecutionPackage || null;
  const developmentRun = project.developmentRun || null;

  const steps = [
    createRepositoryConfigStep(repositoryConfig),
    createRepositoryInspectionStep(repositoryConfig, repositoryInspection),
    createBranchPreparationStep(repositoryInspection, branchPreparation),
    createAgentPackageStep(branchPreparation, agentPackage),
    createDevelopmentStartStep(agentPackage, developmentRun),
  ];
  const currentStep = steps.find((step) => step.status !== 'ready') || steps[steps.length - 1];
  const hasBlockedStep = steps.some((step) => step.status === 'blocked');
  const status = hasBlockedStep
    ? 'blocked'
    : currentStep?.id === 'development-start' && currentStep.status === 'pending'
      ? 'ready'
      : currentStep?.status || 'ready';

  return {
    status,
    currentStepId: currentStep?.id || '',
    currentOwner: currentStep?.owner || '',
    nextAction: currentStep?.nextAction || '',
    steps,
  };
}

function createRepositoryConfigStep(repositoryConfig) {
  const missingFields = normalizeStringList(repositoryConfig.missingFields);
  const isReady = repositoryConfig.status === 'ready';

  return {
    id: 'repository-config',
    label: '配置仓库',
    owner: '技术负责人',
    status: isReady ? 'ready' : 'pending',
    detail: isReady
      ? describeRepository(repositoryConfig)
      : `缺少：${formatMissingRepositoryFields(missingFields)}`,
    nextAction: isReady
      ? '继续诊断本地仓库。'
      : '补齐仓库地址或本地路径、目标分支和执行模式，然后保存执行器配置。',
  };
}

function createRepositoryInspectionStep(repositoryConfig, repositoryInspection) {
  if (repositoryConfig.status !== 'ready') {
    return {
      id: 'repository-inspection',
      label: '诊断仓库',
      owner: 'Local Runner',
      status: 'pending',
      detail: '等待仓库配置完成。',
      nextAction: '先保存执行器配置，再运行仓库诊断。',
    };
  }

  if (!repositoryInspection) {
    return {
      id: 'repository-inspection',
      label: '诊断仓库',
      owner: 'Local Runner',
      status: 'pending',
      detail: '尚未运行仓库诊断。',
      nextAction: '点击“诊断仓库”，检查本地路径、Git 状态和工作区变更。',
    };
  }

  const issues = normalizeStringList(repositoryInspection.issues);
  const recommendations = normalizeStringList(repositoryInspection.recommendations);
  const isReady = repositoryInspection.status === 'ready';

  return {
    id: 'repository-inspection',
    label: '诊断仓库',
    owner: 'Local Runner',
    status: isReady ? 'ready' : 'blocked',
    detail: isReady ? '仓库诊断通过。' : formatDetail(issues, '仓库诊断未通过。'),
    nextAction: isReady
      ? '继续准备目标分支。'
      : formatDetail(recommendations, '处理仓库诊断阻塞项后重新诊断。'),
  };
}

function createBranchPreparationStep(repositoryInspection, branchPreparation) {
  if (repositoryInspection?.status !== 'ready' || !repositoryInspection?.canPrepareBranch) {
    return {
      id: 'branch-preparation',
      label: '准备分支',
      owner: 'Local Runner',
      status: branchPreparation ? 'blocked' : 'pending',
      detail: branchPreparation
        ? formatDetail(branchPreparation.issues, '目标分支未准备好。')
        : '等待仓库诊断通过。',
      nextAction: '先处理仓库诊断问题，再准备目标分支。',
    };
  }

  if (!branchPreparation) {
    return {
      id: 'branch-preparation',
      label: '准备分支',
      owner: 'Local Runner',
      status: 'pending',
      detail: '尚未准备目标分支。',
      nextAction: '点击“准备分支”，检出或创建目标分支。',
    };
  }

  const isReady = branchPreparation.status === 'ready' && branchPreparation.canRunDevelopment;

  return {
    id: 'branch-preparation',
    label: '准备分支',
    owner: 'Local Runner',
    status: isReady ? 'ready' : 'blocked',
    detail: isReady
      ? `目标分支已就绪：${branchPreparation.currentBranch || branchPreparation.targetBranch || '未知'}`
      : formatDetail(branchPreparation.issues, '目标分支准备失败。'),
    nextAction: isReady
      ? '继续生成 AI 开发任务包。'
      : formatDetail(branchPreparation.recommendations, '处理分支准备问题后重试。'),
  };
}

function createAgentPackageStep(branchPreparation, agentPackage) {
  const branchReady = branchPreparation?.status === 'ready' && branchPreparation?.canRunDevelopment;
  if (!branchReady) {
    return {
      id: 'agent-package',
      label: '生成 AI 任务包',
      owner: 'AI Dev Lead',
      status: agentPackage?.status === 'blocked' ? 'blocked' : 'pending',
      detail: agentPackage?.status === 'blocked'
        ? formatDetail(agentPackage.blockers, 'AI 开发任务包不可启动。')
        : '等待目标分支准备完成。',
      nextAction: '先准备目标分支，再生成 AI 开发任务包。',
    };
  }

  if (!agentPackage) {
    return {
      id: 'agent-package',
      label: '生成 AI 任务包',
      owner: 'AI Dev Lead',
      status: 'pending',
      detail: '尚未生成 AI 开发任务包。',
      nextAction: '点击“生成 AI 开发任务包”，汇总 PRD、开发任务和检查命令。',
    };
  }

  const isReady = agentPackage.status === 'ready' && agentPackage.canStart;

  return {
    id: 'agent-package',
    label: '生成 AI 任务包',
    owner: 'AI Dev Lead',
    status: isReady ? 'ready' : 'blocked',
    detail: isReady ? 'AI 开发任务包可启动。' : formatDetail(agentPackage.blockers, 'AI 开发任务包不可启动。'),
    nextAction: isReady ? '继续启动开发执行。' : '处理任务包阻塞项后重新生成。',
  };
}

function createDevelopmentStartStep(agentPackage, developmentRun) {
  const packageReady = agentPackage?.status === 'ready' && agentPackage?.canStart;
  if (developmentRun) {
    return {
      id: 'development-start',
      label: '启动开发',
      owner: 'AI 开发',
      status: 'ready',
      detail: '已生成开发执行记录。',
      nextAction: '查看开发执行记录并运行检查。',
    };
  }

  return {
    id: 'development-start',
    label: '启动开发',
    owner: 'AI 开发',
    status: packageReady ? 'pending' : agentPackage?.status === 'blocked' ? 'blocked' : 'pending',
    detail: packageReady ? '等待启动开发执行。' : 'AI 开发任务包尚不可启动。',
    nextAction: packageReady
      ? '点击“启动开发执行”，生成本次开发执行记录。'
      : '先生成可启动的 AI 开发任务包，再启动开发执行。',
  };
}

function describeRepository(repositoryConfig) {
  return repositoryConfig.localPath || repositoryConfig.repositoryUrl || '仓库配置已保存。';
}

function formatMissingRepositoryFields(fields) {
  if (!fields.length) {
    return '仓库地址或本地路径、目标分支';
  }

  return fields.map(repositoryFieldLabel).join('、');
}

function repositoryFieldLabel(field) {
  const labels = {
    repositoryUrl: '仓库地址或本地路径',
    localPath: '本地路径',
    targetBranch: '目标分支',
    executionMode: '执行模式',
  };

  return labels[field] || field;
}

function formatDetail(items, fallback) {
  const list = normalizeStringList(items);
  return list[0] || fallback;
}

function normalizeStringList(items = []) {
  return Array.isArray(items) ? items.map((item) => String(item || '').trim()).filter(Boolean) : [];
}
