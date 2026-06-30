import { spawn } from 'node:child_process';
import { access } from 'node:fs/promises';

const DEFAULT_TIMEOUT_MS = 30000;
const OUTPUT_LIMIT = 8000;

export class RepositoryInspectionError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = 'RepositoryInspectionError';
    this.details = details;
  }
}

export async function inspectRepository(
  project,
  { commandRunner = runGitCommand, timeoutMs = DEFAULT_TIMEOUT_MS } = {},
) {
  const repositoryConfig = project.repositoryConfig || {};
  const localPath = String(repositoryConfig.localPath || '').trim();
  if (!localPath) {
    throw new RepositoryInspectionError('仓库诊断需要先配置本地路径。', { field: 'localPath' });
  }

  try {
    await access(localPath);
  } catch (error) {
    throw new RepositoryInspectionError('本地仓库路径不可访问。', {
      localPath,
      cause: error.message,
    });
  }

  const inspectedAt = new Date().toISOString();
  const targetBranch = String(repositoryConfig.targetBranch || '').trim();
  const base = {
    status: 'blocked',
    inspectedAt,
    localPath,
    gitRoot: '',
    currentBranch: '',
    baseBranch: String(repositoryConfig.baseBranch || 'main').trim() || 'main',
    targetBranch,
    isGitRepository: false,
    targetBranchExists: false,
    hasUncommittedChanges: false,
    changedFilesCount: 0,
    changedFiles: [],
    canPrepareBranch: false,
    issues: [],
    recommendations: [],
  };

  const insideWorkTree = await commandRunner(['rev-parse', '--is-inside-work-tree'], {
    cwd: localPath,
    timeoutMs,
  });
  if (insideWorkTree.exitCode !== 0 || insideWorkTree.stdout.trim() !== 'true') {
    return {
      ...base,
      issues: ['本地路径不是 Git 仓库。'],
      recommendations: ['请选择真实业务代码仓库路径后重新诊断。'],
    };
  }

  const gitRootResult = await commandRunner(['rev-parse', '--show-toplevel'], {
    cwd: localPath,
    timeoutMs,
  });
  const branchResult = await commandRunner(['branch', '--show-current'], {
    cwd: localPath,
    timeoutMs,
  });
  const statusResult = await commandRunner(['status', '--porcelain'], {
    cwd: localPath,
    timeoutMs,
  });
  const targetBranchResult = targetBranch
    ? await commandRunner(['rev-parse', '--verify', targetBranch], {
        cwd: localPath,
        timeoutMs,
      })
    : { exitCode: 1, stdout: '', stderr: '', durationMs: 0 };

  const changedFiles = parseChangedFiles(statusResult.stdout);
  const hasUncommittedChanges = changedFiles.length > 0;
  const targetBranchExists = targetBranchResult.exitCode === 0;
  const issues = [];
  const recommendations = [];

  if (!targetBranch) {
    issues.push('目标分支未配置。');
    recommendations.push('先配置目标分支，再执行自动开发。');
  }
  if (hasUncommittedChanges) {
    issues.push('工作区存在未提交变更。');
    recommendations.push('提交或暂存当前变更后重新诊断。');
  }
  if (targetBranch && !targetBranchExists && !hasUncommittedChanges) {
    recommendations.push(`目标分支 ${targetBranch} 尚不存在，可从基准分支创建。`);
  }
  if (targetBranch && targetBranchExists && !hasUncommittedChanges) {
    recommendations.push(`目标分支 ${targetBranch} 已存在，自动开发前请确认是否复用。`);
  }

  return {
    ...base,
    status: issues.length ? 'warning' : 'ready',
    gitRoot: gitRootResult.stdout.trim() || localPath,
    currentBranch: branchResult.stdout.trim() || 'DETACHED',
    isGitRepository: true,
    targetBranchExists,
    hasUncommittedChanges,
    changedFilesCount: changedFiles.length,
    changedFiles,
    canPrepareBranch: Boolean(targetBranch) && !hasUncommittedChanges,
    issues,
    recommendations,
  };
}

export function runGitCommand(args, { cwd, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  return new Promise((resolve) => {
    const started = Date.now();
    let child;
    try {
      child = spawn('git', args, {
        cwd,
        shell: false,
        windowsHide: true,
      });
    } catch (error) {
      resolve({
        exitCode: 1,
        stdout: '',
        stderr: error.message,
        durationMs: Date.now() - started,
      });
      return;
    }

    let stdout = '';
    let stderr = '';
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) {
        return;
      }
      settled = true;
      child.kill('SIGTERM');
      resolve({
        exitCode: 1,
        stdout: truncateOutput(stdout),
        stderr: truncateOutput(`${stderr}\nGit command timed out after ${timeoutMs}ms.`),
        durationMs: Date.now() - started,
      });
    }, timeoutMs);

    child.stdout?.on('data', (chunk) => {
      stdout = truncateOutput(stdout + chunk.toString());
    });
    child.stderr?.on('data', (chunk) => {
      stderr = truncateOutput(stderr + chunk.toString());
    });
    child.on('error', (error) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      resolve({
        exitCode: 1,
        stdout: truncateOutput(stdout),
        stderr: truncateOutput(`${stderr}\n${error.message}`),
        durationMs: Date.now() - started,
      });
    });
    child.on('close', (exitCode) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      resolve({
        exitCode: exitCode ?? 1,
        stdout: truncateOutput(stdout),
        stderr: truncateOutput(stderr),
        durationMs: Date.now() - started,
      });
    });
  });
}

function parseChangedFiles(output) {
  return String(output || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 50);
}

function truncateOutput(value, limit = OUTPUT_LIMIT) {
  const text = String(value || '');
  if (text.length <= limit) {
    return text;
  }
  return text.slice(text.length - limit);
}
