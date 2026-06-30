import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { prepareRepositoryBranch } from './branchPreparer.js';

describe('branch preparer', () => {
  let tempDir;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'wee-coder-branch-'));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  test('creates the target branch from the base branch when diagnostics allow preparation', async () => {
    const commandRunner = vi.fn(async (args) => {
      const command = args.join(' ');
      if (command === 'status --porcelain') {
        return { exitCode: 0, stdout: '', stderr: '', durationMs: 3 };
      }
      if (command === 'branch --show-current') {
        return { exitCode: 0, stdout: 'main\n', stderr: '', durationMs: 3 };
      }
      if (command === 'rev-parse --verify feature/yolo-camera-monitor') {
        return { exitCode: 1, stdout: '', stderr: 'not found', durationMs: 3 };
      }
      if (command === 'checkout main') {
        return { exitCode: 0, stdout: '', stderr: '', durationMs: 3 };
      }
      if (command === 'checkout -b feature/yolo-camera-monitor') {
        return { exitCode: 0, stdout: '', stderr: '', durationMs: 3 };
      }
      return { exitCode: 1, stdout: '', stderr: `unexpected ${command}`, durationMs: 3 };
    });

    const result = await prepareRepositoryBranch(createProject(tempDir), { commandRunner });

    expect(commandRunner).toHaveBeenCalledWith(['checkout', 'main'], {
      cwd: tempDir,
      timeoutMs: expect.any(Number),
    });
    expect(commandRunner).toHaveBeenCalledWith(['checkout', '-b', 'feature/yolo-camera-monitor'], {
      cwd: tempDir,
      timeoutMs: expect.any(Number),
    });
    expect(result).toMatchObject({
      status: 'ready',
      localPath: tempDir,
      previousBranch: 'main',
      currentBranch: 'feature/yolo-camera-monitor',
      baseBranch: 'main',
      targetBranch: 'feature/yolo-camera-monitor',
      targetBranchExisted: false,
      createdBranch: true,
      checkedOut: true,
      canRunDevelopment: true,
    });
  });

  test('blocks branch preparation until repository diagnostics are ready', async () => {
    const commandRunner = vi.fn();
    const project = createProject(tempDir, {
      repositoryInspection: {
        status: 'blocked',
        canPrepareBranch: false,
        issues: ['本地路径不是 Git 仓库。'],
      },
    });

    const result = await prepareRepositoryBranch(project, { commandRunner });

    expect(commandRunner).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      status: 'blocked',
      canRunDevelopment: false,
      issues: expect.arrayContaining(['仓库诊断未通过，不能准备分支。']),
    });
  });
});

function createProject(localPath, overrides = {}) {
  return {
    repositoryConfig: {
      status: 'ready',
      localPath,
      baseBranch: 'main',
      targetBranch: 'feature/yolo-camera-monitor',
      executionMode: 'codex-local',
      verificationCommands: ['npm test'],
    },
    repositoryInspection: overrides.repositoryInspection || {
      status: 'ready',
      localPath,
      gitRoot: localPath,
      currentBranch: 'main',
      baseBranch: 'main',
      targetBranch: 'feature/yolo-camera-monitor',
      isGitRepository: true,
      targetBranchExists: false,
      hasUncommittedChanges: false,
      changedFilesCount: 0,
      canPrepareBranch: true,
      issues: [],
      recommendations: [],
    },
  };
}
