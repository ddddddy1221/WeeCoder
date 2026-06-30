export const EXECUTION_MODES = Object.freeze([
  { id: 'codex-local', name: 'Codex 本地执行' },
  { id: 'manual', name: '人工执行' },
  { id: 'ci', name: 'CI Runner' },
]);

const DEFAULT_EXECUTION_MODE = 'codex-local';

export function normalizeRepositoryConfig(config = {}, { defaultCommands = [] } = {}) {
  const repositoryUrl = clean(config.repositoryUrl);
  const localPath = clean(config.localPath);
  const baseBranch = clean(config.baseBranch) || 'main';
  const targetBranch = clean(config.targetBranch);
  const executionMode = normalizeExecutionMode(config.executionMode);
  const verificationCommands = normalizeCommands(
    config.verificationCommands?.length ? config.verificationCommands : defaultCommands,
  );
  const missingFields = getMissingFields({ repositoryUrl, localPath, targetBranch, executionMode });

  return {
    status: missingFields.length === 0 ? 'ready' : 'incomplete',
    repositoryUrl,
    localPath,
    baseBranch,
    targetBranch,
    executionMode,
    verificationCommands,
    notes: clean(config.notes),
    configuredAt: clean(config.configuredAt),
    configuredBy: clean(config.configuredBy),
    missingFields,
  };
}

export function createRepositorySnapshot(config) {
  const normalized = normalizeRepositoryConfig(config);
  return {
    status: normalized.status,
    repositoryUrl: normalized.repositoryUrl,
    localPath: normalized.localPath,
    baseBranch: normalized.baseBranch,
    targetBranch: normalized.targetBranch,
    executionMode: normalized.executionMode,
    verificationCommands: normalized.verificationCommands,
  };
}

function getMissingFields({ repositoryUrl, localPath, targetBranch, executionMode }) {
  const missing = [];
  if (!repositoryUrl && !localPath) {
    missing.push('repositoryUrl');
  }
  if (!targetBranch) {
    missing.push('targetBranch');
  }
  if (!executionMode) {
    missing.push('executionMode');
  }
  return missing;
}

function normalizeExecutionMode(mode) {
  const cleaned = clean(mode) || DEFAULT_EXECUTION_MODE;
  return EXECUTION_MODES.some((item) => item.id === cleaned) ? cleaned : DEFAULT_EXECUTION_MODE;
}

function normalizeCommands(commands = []) {
  return Array.isArray(commands)
    ? commands.map((command) => clean(command)).filter(Boolean)
    : String(commands || '')
        .split('\n')
        .map((command) => clean(command))
        .filter(Boolean);
}

function clean(value) {
  return String(value || '').trim();
}
