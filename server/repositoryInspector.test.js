import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { inspectRepository } from './repositoryInspector.js';

describe('repository inspector', () => {
  let tempDir;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'wee-coder-repo-'));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  test('reports a clean git repository as ready for branch preparation', async () => {
    const commandRunner = vi.fn(async (args) => {
      const command = args.join(' ');
      if (command === 'rev-parse --is-inside-work-tree') {
        return { exitCode: 0, stdout: 'true\n', stderr: '', durationMs: 5 };
      }
      if (command === 'rev-parse --show-toplevel') {
        return { exitCode: 0, stdout: `${tempDir}\n`, stderr: '', durationMs: 5 };
      }
      if (command === 'branch --show-current') {
        return { exitCode: 0, stdout: 'main\n', stderr: '', durationMs: 5 };
      }
      if (command === 'status --porcelain') {
        return { exitCode: 0, stdout: '', stderr: '', durationMs: 5 };
      }
      if (command === 'rev-parse --verify feature/yolo-camera-monitor') {
        return { exitCode: 0, stdout: 'abc123\n', stderr: '', durationMs: 5 };
      }
      return { exitCode: 1, stdout: '', stderr: `unexpected ${command}`, durationMs: 5 };
    });

    const result = await inspectRepository(createProject(tempDir), { commandRunner });

    expect(result).toMatchObject({
      status: 'ready',
      localPath: tempDir,
      isGitRepository: true,
      gitRoot: tempDir,
      currentBranch: 'main',
      targetBranch: 'feature/yolo-camera-monitor',
      targetBranchExists: true,
      hasUncommittedChanges: false,
      changedFilesCount: 0,
      canPrepareBranch: true,
    });
    expect(result.issues).toEqual([]);
  });

  test('blocks automatic development when the local path is not a git repository', async () => {
    const commandRunner = vi.fn(async () => ({
      exitCode: 128,
      stdout: '',
      stderr: 'fatal: not a git repository',
      durationMs: 5,
    }));

    const result = await inspectRepository(createProject(tempDir), { commandRunner });

    expect(result).toMatchObject({
      status: 'blocked',
      localPath: tempDir,
      isGitRepository: false,
      canPrepareBranch: false,
    });
    expect(result.issues).toEqual(expect.arrayContaining(['本地路径不是 Git 仓库。']));
    expect(commandRunner).toHaveBeenCalledWith(['rev-parse', '--is-inside-work-tree'], {
      cwd: tempDir,
      timeoutMs: expect.any(Number),
    });
  });
});

function createProject(localPath) {
  return {
    repositoryConfig: {
      status: 'ready',
      localPath,
      baseBranch: 'main',
      targetBranch: 'feature/yolo-camera-monitor',
      executionMode: 'codex-local',
      verificationCommands: ['npm test'],
    },
  };
}
