import { DevelopmentRunnerError, executeDevelopmentChecks } from './developmentRunner.js';

export async function executePlatformJob(
  project,
  job,
  {
    commandExecutor,
    timeoutMs,
  } = {},
) {
  const command = String(job?.command || '').trim();
  if (!command) {
    return {
      status: 'failed',
      command: '',
      exitCode: null,
      stdout: '',
      stderr: '',
      durationMs: 0,
      errorSummary: '后台任务未配置可执行命令。',
    };
  }

  const allowedCommands = getProjectAllowedCommands(project);
  if (!allowedCommands.includes(command)) {
    return createProjectBlockedResult(command, allowedCommands);
  }

  try {
    const result = await executeDevelopmentChecks(
      {
        ...project,
        repositoryConfig: project.repositoryConfig || {},
        developmentRun: {
          ...(project.developmentRun || {}),
          checks: [{ command, status: 'not-run' }],
        },
      },
      { commandExecutor, timeoutMs },
    );
    const check = result.checks[0] || createMissingCheck(command);
    return toPlatformJobExecutionResult(check);
  } catch (error) {
    if (error instanceof DevelopmentRunnerError || error.name === 'DevelopmentRunnerError') {
      return {
        status: 'failed',
        command,
        exitCode: null,
        stdout: '',
        stderr: '',
        durationMs: 0,
        errorSummary: error.message,
        details: error.details || {},
      };
    }
    throw error;
  }
}

function toPlatformJobExecutionResult(check) {
  const base = {
    command: check.command,
    exitCode: check.exitCode,
    stdout: check.stdout || '',
    stderr: check.stderr || '',
    durationMs: Number.isFinite(check.durationMs) ? check.durationMs : 0,
  };
  if (check.details) {
    base.details = check.details;
  }

  if (check.status === 'passed') {
    return {
      ...base,
      status: 'succeeded',
      resultSummary: check.result || `${check.command} passed`,
    };
  }

  return {
    ...base,
    status: 'failed',
    errorSummary: check.status === 'blocked'
      ? '命令不在 runner 白名单中，未执行。'
      : check.result || `${check.command} failed`,
  };
}

function getProjectAllowedCommands(project) {
  const repositoryCommands = normalizeCommands(project?.repositoryConfig?.verificationCommands);
  if (repositoryCommands.length) {
    return repositoryCommands;
  }

  return normalizeCommands(project?.developmentPlan?.verificationCommands);
}

function normalizeCommands(commands = []) {
  return Array.isArray(commands)
    ? commands.map((command) => String(command || '').trim()).filter(Boolean)
    : [];
}

function createProjectBlockedResult(command, allowedCommands) {
  return {
    status: 'failed',
    command,
    exitCode: null,
    stdout: '',
    stderr: '',
    durationMs: 0,
    errorSummary: 'Command is not in the project runner allowlist and was not executed.',
    details: {
      sandboxPolicy: 'project-verification-command-allowlist',
      blockedCommand: command,
      allowedCommands,
    },
  };
}

function createMissingCheck(command) {
  return {
    command,
    status: 'failed',
    exitCode: null,
    stdout: '',
    stderr: '',
    durationMs: 0,
    result: '后台任务未产生执行结果。',
  };
}
