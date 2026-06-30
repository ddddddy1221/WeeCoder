import { spawn } from 'node:child_process';
import { access } from 'node:fs/promises';

const DEFAULT_TIMEOUT_MS = 120000;
const OUTPUT_LIMIT = 12000;

const ALLOWED_COMMANDS = new Map([
  ['npm test', { bin: 'npm', args: ['test'] }],
  ['npm run build', { bin: 'npm', args: ['run', 'build'] }],
  ['npm audit --omit=dev', { bin: 'npm', args: ['audit', '--omit=dev'] }],
]);

export class DevelopmentRunnerError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = 'DevelopmentRunnerError';
    this.details = details;
  }
}

export async function executeDevelopmentChecks(
  project,
  { commandExecutor = runAllowedCommand, timeoutMs = DEFAULT_TIMEOUT_MS } = {},
) {
  const repositoryConfig = project.repositoryConfig || {};
  if (repositoryConfig.status !== 'ready') {
    throw new DevelopmentRunnerError('执行器配置未就绪', {
      missingFields: repositoryConfig.missingFields || [],
    });
  }

  const cwd = String(repositoryConfig.localPath || '').trim();
  if (!cwd) {
    throw new DevelopmentRunnerError('本地 runner 需要配置本地路径', { field: 'localPath' });
  }

  try {
    await access(cwd);
  } catch (error) {
    throw new DevelopmentRunnerError('本地 runner 路径不可访问', {
      localPath: cwd,
      cause: error.message,
    });
  }

  const commands = getVerificationCommands(project);
  const checks = [];

  for (const command of commands) {
    if (!ALLOWED_COMMANDS.has(command)) {
      checks.push(createBlockedCheck(command));
      continue;
    }

    const startedAt = new Date().toISOString();
    const executed = await commandExecutor(command, { cwd, timeoutMs });
    const completedAt = new Date().toISOString();
    checks.push(createExecutedCheck(command, executed, { startedAt, completedAt }));
  }

  return { checks };
}

export function runAllowedCommand(command, { cwd, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  const definition = ALLOWED_COMMANDS.get(command);
  if (!definition) {
    return Promise.resolve({
      exitCode: 1,
      stdout: '',
      stderr: 'Command is not allowed by the development runner.',
      durationMs: 0,
    });
  }

  return new Promise((resolve) => {
    const started = Date.now();
    const invocation = createProcessInvocation(command, definition);
    let child;
    try {
      child = spawn(invocation.bin, invocation.args, {
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
        stderr: truncateOutput(`${stderr}\nCommand timed out after ${timeoutMs}ms.`),
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

function getVerificationCommands(project) {
  const runCommands = normalizeCommands(project.developmentRun?.checks?.map((check) => check.command));
  if (runCommands.length) {
    return runCommands;
  }

  const repositoryCommands = normalizeCommands(project.repositoryConfig?.verificationCommands);
  if (repositoryCommands.length) {
    return repositoryCommands;
  }

  return normalizeCommands(project.developmentPlan?.verificationCommands);
}

function createExecutedCheck(command, executed, { startedAt, completedAt }) {
  const exitCode = Number.isInteger(executed.exitCode) ? executed.exitCode : 1;
  const stdout = truncateOutput(executed.stdout || '');
  const stderr = truncateOutput(executed.stderr || '');
  return {
    command,
    status: exitCode === 0 ? 'passed' : 'failed',
    exitCode,
    durationMs: Number.isFinite(executed.durationMs) ? executed.durationMs : 0,
    startedAt,
    completedAt,
    result: summarizeOutput(stdout, stderr, command, exitCode),
    stdout,
    stderr,
  };
}

function createBlockedCheck(command) {
  const now = new Date().toISOString();
  return {
    command,
    status: 'blocked',
    exitCode: null,
    durationMs: 0,
    startedAt: now,
    completedAt: now,
    result: '命令不在 runner 白名单中，未执行。',
    stdout: '',
    stderr: '',
    details: {
      sandboxPolicy: 'runner-command-allowlist',
      blockedCommand: command,
    },
  };
}

function summarizeOutput(stdout, stderr, command, exitCode) {
  const combined = [stdout, stderr].map((value) => String(value || '').trim()).filter(Boolean).join('\n');
  if (combined) {
    return truncateOutput(combined, 600);
  }
  return `${command} ${exitCode === 0 ? 'passed' : 'failed'}`;
}

function normalizeCommands(commands = []) {
  return Array.isArray(commands)
    ? commands.map((command) => String(command || '').trim()).filter(Boolean)
    : [];
}

function truncateOutput(value, limit = OUTPUT_LIMIT) {
  const text = String(value || '');
  if (text.length <= limit) {
    return text;
  }
  return text.slice(text.length - limit);
}

function createProcessInvocation(command, definition) {
  if (process.platform === 'win32') {
    return {
      bin: process.env.ComSpec || process.env.COMSPEC || 'cmd.exe',
      args: ['/d', '/s', '/c', command],
    };
  }

  return {
    bin: definition.bin,
    args: definition.args,
  };
}
