import { access } from 'node:fs/promises';
import { runGitCommand } from './repositoryInspector.js';

const DEFAULT_TIMEOUT_MS = 30000;
const CLEAN_WORKTREE = '';

export class BranchPreparationError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = 'BranchPreparationError';
    this.details = details;
  }
}

export async function prepareRepositoryBranch(
  project,
  { commandRunner = runGitCommand, timeoutMs = DEFAULT_TIMEOUT_MS } = {},
) {
  const repositoryConfig = project.repositoryConfig || {};
  const repositoryInspection = project.repositoryInspection || {};
  const localPath = String(repositoryConfig.localPath || '').trim();
  const baseBranch = String(repositoryConfig.baseBranch || 'main').trim() || 'main';
  const targetBranch = String(repositoryConfig.targetBranch || '').trim();
  const preparedAt = new Date().toISOString();
  const base = {
    status: 'blocked',
    preparedAt,
    localPath,
    previousBranch: '',
    currentBranch: '',
    baseBranch,
    targetBranch,
    targetBranchExisted: false,
    createdBranch: false,
    checkedOut: false,
    canRunDevelopment: false,
    issues: [],
    recommendations: [],
  };

  if (!localPath) {
    throw new BranchPreparationError('分支准备需要先配置本地路径。', { field: 'localPath' });
  }

  if (!targetBranch) {
    throw new BranchPreparationError('分支准备需要先配置目标分支。', { field: 'targetBranch' });
  }

  if (!isSafeBranchName(baseBranch) || !isSafeBranchName(targetBranch)) {
    return {
      ...base,
      issues: ['分支名称不安全。'],
      recommendations: ['请使用有效 Git 分支名后重新准备。'],
    };
  }

  try {
    await access(localPath);
  } catch (error) {
    throw new BranchPreparationError('本地仓库路径不可访问。', {
      localPath,
      cause: error.message,
    });
  }

  if (repositoryInspection.status !== 'ready' || !repositoryInspection.canPrepareBranch) {
    return {
      ...base,
      issues: [
        '仓库诊断未通过，不能准备分支。',
        ...normalizeStringList(repositoryInspection.issues),
      ],
      recommendations: normalizeStringList(repositoryInspection.recommendations).length
        ? normalizeStringList(repositoryInspection.recommendations)
        : ['先完成仓库诊断并处理阻塞项。'],
    };
  }

  const statusResult = await commandRunner(['status', '--porcelain'], {
    cwd: localPath,
    timeoutMs,
  });
  if (statusResult.exitCode !== 0) {
    return fail(base, '无法读取工作区状态。', statusResult);
  }

  const changedFiles = parseChangedFiles(statusResult.stdout);
  if (changedFiles.length) {
    return {
      ...base,
      issues: ['工作区存在未提交变更，不能准备分支。'],
      recommendations: ['提交或暂存当前变更后重新诊断，再准备目标分支。'],
    };
  }

  const previousBranchResult = await commandRunner(['branch', '--show-current'], {
    cwd: localPath,
    timeoutMs,
  });
  if (previousBranchResult.exitCode !== 0) {
    return fail(base, '无法读取当前分支。', previousBranchResult);
  }
  const previousBranch = previousBranchResult.stdout.trim() || 'DETACHED';

  const targetBranchResult = await commandRunner(['rev-parse', '--verify', targetBranch], {
    cwd: localPath,
    timeoutMs,
  });
  const targetBranchExisted = targetBranchResult.exitCode === 0;

  if (targetBranchExisted) {
    const checkoutTargetResult = await commandRunner(['checkout', targetBranch], {
      cwd: localPath,
      timeoutMs,
    });
    if (checkoutTargetResult.exitCode !== 0) {
      return fail(
        {
          ...base,
          previousBranch,
          targetBranchExisted,
        },
        `无法检出目标分支 ${targetBranch}。`,
        checkoutTargetResult,
      );
    }

    return {
      ...base,
      status: 'ready',
      previousBranch,
      currentBranch: targetBranch,
      targetBranchExisted: true,
      checkedOut: true,
      canRunDevelopment: true,
      recommendations: ['目标分支已检出，可以启动自动开发。'],
    };
  }

  const checkoutBaseResult = await commandRunner(['checkout', baseBranch], {
    cwd: localPath,
    timeoutMs,
  });
  if (checkoutBaseResult.exitCode !== 0) {
    return fail(
      {
        ...base,
        previousBranch,
      },
      `无法检出基准分支 ${baseBranch}。`,
      checkoutBaseResult,
    );
  }

  const createBranchResult = await commandRunner(['checkout', '-b', targetBranch], {
    cwd: localPath,
    timeoutMs,
  });
  if (createBranchResult.exitCode !== 0) {
    return fail(
      {
        ...base,
        previousBranch,
      },
      `无法创建目标分支 ${targetBranch}。`,
      createBranchResult,
    );
  }

  return {
    ...base,
    status: 'ready',
    previousBranch,
    currentBranch: targetBranch,
    createdBranch: true,
    checkedOut: true,
    canRunDevelopment: true,
    recommendations: ['目标分支已准备好，可以启动自动开发。'],
  };
}

function fail(base, issue, result) {
  const details = [result.stderr, result.stdout].map((item) => String(item || '').trim()).filter(Boolean);
  return {
    ...base,
    status: 'failed',
    issues: details.length ? [issue, details[0]] : [issue],
    recommendations: ['请检查 Git 输出并处理问题后重新准备分支。'],
  };
}

function isSafeBranchName(branchName) {
  const branch = String(branchName || '').trim();
  return Boolean(branch)
    && !branch.startsWith('-')
    && !branch.endsWith('/')
    && !branch.endsWith('.')
    && !branch.includes('..')
    && !branch.includes('@{')
    && !branch.includes('//')
    && !/[\\\s~^:?*[\]]/.test(branch);
}

function parseChangedFiles(output) {
  return String(output || CLEAN_WORKTREE)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 50);
}

function normalizeStringList(items = []) {
  return Array.isArray(items) ? items.map((item) => String(item || '').trim()).filter(Boolean) : [];
}
