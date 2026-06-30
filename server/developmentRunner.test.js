import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { executeDevelopmentChecks, runAllowedCommand } from './developmentRunner.js';

describe('development runner', () => {
  let tempDir;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'wee-coder-runner-'));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  test('runs allowed verification commands from the configured local path', async () => {
    const commandExecutor = vi.fn(async () => ({
      exitCode: 0,
      stdout: 'tests passed',
      stderr: '',
      durationMs: 31,
    }));

    const result = await executeDevelopmentChecks(createRunnerProject(tempDir), {
      commandExecutor,
    });

    expect(commandExecutor).toHaveBeenCalledWith('npm test', {
      cwd: tempDir,
      timeoutMs: expect.any(Number),
    });
    expect(result.checks).toEqual([
      expect.objectContaining({
        command: 'npm test',
        status: 'passed',
        exitCode: 0,
        durationMs: 31,
        result: expect.stringContaining('tests passed'),
      }),
    ]);
  });

  test('blocks commands outside the runner allowlist', async () => {
    const commandExecutor = vi.fn();
    const project = createRunnerProject(tempDir, {
      verificationCommands: ['Remove-Item -Recurse .'],
      checks: [{ command: 'Remove-Item -Recurse .', status: 'not-run' }],
    });

    const result = await executeDevelopmentChecks(project, { commandExecutor });

    expect(commandExecutor).not.toHaveBeenCalled();
    expect(result.checks[0]).toMatchObject({
      command: 'Remove-Item -Recurse .',
      status: 'blocked',
      exitCode: null,
    });
  });

  test('executes npm checks through the default runner', async () => {
    await writeFile(
      join(tempDir, 'package.json'),
      JSON.stringify({
        scripts: {
          test: 'node -e "console.log(\\"default runner passed\\")"',
        },
      }),
    );

    const result = await runAllowedCommand('npm test', {
      cwd: tempDir,
      timeoutMs: 30000,
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('default runner passed');
  });
});

function createRunnerProject(localPath, overrides = {}) {
  const verificationCommands = overrides.verificationCommands || ['npm test'];
  return {
    repositoryConfig: {
      status: 'ready',
      localPath,
      targetBranch: 'feature/yolo-camera-monitor',
      executionMode: 'codex-local',
      verificationCommands,
    },
    developmentRun: {
      checks: overrides.checks || verificationCommands.map((command) => ({ command, status: 'not-run' })),
    },
  };
}
