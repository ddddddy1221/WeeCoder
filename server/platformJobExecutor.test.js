import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { executePlatformJob } from './platformJobExecutor.js';

describe('platform job executor', () => {
  let tempDir;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'wee-coder-platform-job-'));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  test('runs an allowed platform job command through the development runner boundary', async () => {
    const commandExecutor = vi.fn(async () => ({
      exitCode: 0,
      stdout: 'tests passed',
      stderr: '',
      durationMs: 42,
    }));

    const result = await executePlatformJob(createProject(tempDir), {
      id: 'job-1',
      command: 'npm test',
      title: 'AI coding checks',
    }, {
      commandExecutor,
    });

    expect(commandExecutor).toHaveBeenCalledWith('npm test', {
      cwd: tempDir,
      timeoutMs: expect.any(Number),
    });
    expect(result).toMatchObject({
      status: 'succeeded',
      command: 'npm test',
      exitCode: 0,
      stdout: 'tests passed',
      stderr: '',
      resultSummary: expect.stringContaining('tests passed'),
    });
  });

  test('blocks commands outside the runner allowlist before execution', async () => {
    const commandExecutor = vi.fn();

    const result = await executePlatformJob(createProject(tempDir, {
      verificationCommands: ['Remove-Item -Recurse .'],
    }), {
      id: 'job-unsafe',
      command: 'Remove-Item -Recurse .',
      title: 'Unsafe job',
    }, {
      commandExecutor,
    });

    expect(commandExecutor).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      status: 'failed',
      command: 'Remove-Item -Recurse .',
      exitCode: null,
      stdout: '',
      stderr: '',
      details: {
        sandboxPolicy: 'runner-command-allowlist',
        blockedCommand: 'Remove-Item -Recurse .',
      },
    });
    expect(result.errorSummary).toContain('runner');
  });

  test('blocks built-in runner commands that are not configured for the project', async () => {
    const commandExecutor = vi.fn(async () => ({
      exitCode: 0,
      stdout: 'build passed',
      stderr: '',
      durationMs: 12,
    }));

    const result = await executePlatformJob(createProject(tempDir), {
      id: 'job-unconfigured',
      command: 'npm run build',
      title: 'Unconfigured build',
    }, {
      commandExecutor,
    });

    expect(commandExecutor).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      status: 'failed',
      command: 'npm run build',
      exitCode: null,
      stdout: '',
      stderr: '',
      details: {
        sandboxPolicy: 'project-verification-command-allowlist',
        blockedCommand: 'npm run build',
        allowedCommands: ['npm test'],
      },
    });
    expect(result.errorSummary).toContain('runner');
  });
});

function createProject(localPath, overrides = {}) {
  return {
    repositoryConfig: {
      status: 'ready',
      localPath,
      executionMode: 'codex-local',
      verificationCommands: ['npm test'],
      ...overrides,
    },
  };
}
