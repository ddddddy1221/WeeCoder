import { mkdir, readdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { runGitCommand } from './repositoryInspector.js';

const DEFAULT_TIMEOUT_MS = 30000;

export class RepositoryBootstrapError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = 'RepositoryBootstrapError';
    this.details = details;
  }
}

export async function bootstrapRepository(
  project,
  { commandRunner = runGitCommand, timeoutMs = DEFAULT_TIMEOUT_MS } = {},
) {
  const repositoryConfig = project.repositoryConfig || {};
  const localPath = String(repositoryConfig.localPath || '').trim();
  if (!localPath) {
    throw new RepositoryBootstrapError('初始化业务仓库需要先配置本地路径。', { field: 'localPath' });
  }

  const base = {
    status: 'blocked',
    bootstrappedAt: new Date().toISOString(),
    localPath,
    currentBranch: '',
    gitInitialized: false,
    initialCommitCreated: false,
    filesCreated: [],
    issues: [],
    recommendations: [],
  };

  const directoryState = await readDirectoryState(localPath);
  if (directoryState.exists && directoryState.entries.length > 0) {
    return {
      ...base,
      issues: ['目标目录已存在且非空，为避免覆盖现有文件，已停止初始化。'],
      recommendations: ['请选择一个空目录，或绑定已经存在的真实 Git 仓库。'],
    };
  }

  await mkdir(localPath, { recursive: true });
  const files = buildRepositoryFiles(project);
  for (const file of files) {
    const absolutePath = join(localPath, file.path);
    await mkdir(dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, file.content, 'utf8');
  }

  const initResult = await runStep(commandRunner, ['init'], localPath, timeoutMs);
  if (initResult) {
    return fail(base, '无法初始化 Git 仓库。', initResult);
  }
  const checkoutResult = await runStep(commandRunner, ['checkout', '-B', 'main'], localPath, timeoutMs);
  if (checkoutResult) {
    return fail({ ...base, gitInitialized: true }, '无法创建 main 分支。', checkoutResult);
  }
  await runStep(commandRunner, ['config', 'user.email', 'weecoder@example.local'], localPath, timeoutMs);
  await runStep(commandRunner, ['config', 'user.name', 'WeeCoder Bootstrap'], localPath, timeoutMs);
  const addResult = await runStep(commandRunner, ['add', '.'], localPath, timeoutMs);
  if (addResult) {
    return fail({ ...base, gitInitialized: true, currentBranch: 'main' }, '无法暂存初始化文件。', addResult);
  }
  const commitResult = await runStep(
    commandRunner,
    ['commit', '-m', 'chore: bootstrap yolo monitor project'],
    localPath,
    timeoutMs,
  );
  if (commitResult) {
    return fail({ ...base, gitInitialized: true, currentBranch: 'main' }, '无法创建初始化提交。', commitResult);
  }

  return {
    ...base,
    status: 'ready',
    currentBranch: 'main',
    gitInitialized: true,
    initialCommitCreated: true,
    filesCreated: files.map((file) => file.path),
    recommendations: ['本地业务仓库已创建，请重新诊断仓库并准备目标分支。'],
  };
}

async function readDirectoryState(localPath) {
  try {
    return {
      exists: true,
      entries: await readdir(localPath),
    };
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return { exists: false, entries: [] };
    }
    throw error;
  }
}

async function runStep(commandRunner, args, cwd, timeoutMs) {
  const result = await commandRunner(args, { cwd, timeoutMs });
  return result.exitCode === 0 ? null : result;
}

function fail(base, issue, result) {
  const detail = [result.stderr, result.stdout].map((item) => String(item || '').trim()).find(Boolean);
  return {
    ...base,
    status: 'failed',
    issues: detail ? [issue, detail] : [issue],
    recommendations: ['请检查 Git 输出并处理问题后重新初始化。'],
  };
}

function buildRepositoryFiles(project) {
  const verificationCommands = project.repositoryConfig?.verificationCommands?.length
    ? project.repositoryConfig.verificationCommands
    : project.developmentPlan?.verificationCommands || ['npm test', 'npm run build'];
  const prd = String(project.artifacts?.['pm-requirements'] || `# PRD: ${project.name}\n\n${project.summary || ''}`);

  return [
    {
      path: 'README.md',
      content: `# ${project.name}

负责人：${project.sponsor || '未指定'}

${project.summary || '本仓库由 WeeCoder 初始化，用于承接 AI coding 开发任务。'}

## 本地命令

${verificationCommands.map((command) => `- \`${command}\``).join('\n')}

## 开发边界

- RTSP 地址、账号、密码只能通过服务端环境变量或部署配置注入。
- 前端只消费检测状态和标注框坐标，不保存摄像头密钥。
- 检测结果必须包含时间戳，前端需要丢弃过期结果。
`,
    },
    {
      path: 'package.json',
      content: `${JSON.stringify(
        {
          name: 'yolo-camera-monitor',
          version: '0.1.0',
          private: true,
          type: 'module',
          scripts: {
            test: 'node --test',
            build: 'node scripts/build-check.js',
          },
        },
        null,
        2,
      )}\n`,
    },
    {
      path: 'package-lock.json',
      content: `${JSON.stringify(
        {
          name: 'yolo-camera-monitor',
          version: '0.1.0',
          lockfileVersion: 3,
          requires: true,
          packages: {
            '': {
              name: 'yolo-camera-monitor',
              version: '0.1.0',
            },
          },
        },
        null,
        2,
      )}\n`,
    },
    {
      path: 'src/detectionContract.js',
      content: `export function normalizeDetection(rawDetection = {}) {
  const confidence = Number(rawDetection.confidence);
  return {
    className: String(rawDetection.className || ''),
    confidence: Number.isFinite(confidence) ? confidence : 0,
    box: normalizeBox(rawDetection.box),
    timestamp: String(rawDetection.timestamp || ''),
  };
}

export function isPersonDetection(detection) {
  return detection.className === 'person' && detection.confidence > 0;
}

function normalizeBox(box = {}) {
  return {
    x: Number(box.x || 0),
    y: Number(box.y || 0),
    width: Number(box.width || 0),
    height: Number(box.height || 0),
  };
}
`,
    },
    {
      path: 'test/detectionContract.test.js',
      content: `import test from 'node:test';
import assert from 'node:assert/strict';
import { isPersonDetection, normalizeDetection } from '../src/detectionContract.js';

test('normalizes YOLO person detection payloads', () => {
  const detection = normalizeDetection({
    className: 'person',
    confidence: '0.82',
    box: { x: 10, y: 20, width: 30, height: 40 },
    timestamp: '2026-06-17T00:00:00.000Z',
  });

  assert.equal(isPersonDetection(detection), true);
  assert.equal(detection.confidence, 0.82);
  assert.deepEqual(detection.box, { x: 10, y: 20, width: 30, height: 40 });
});
`,
    },
    {
      path: 'scripts/build-check.js',
      content: `import { access } from 'node:fs/promises';

for (const file of ['README.md', 'src/detectionContract.js', 'test/detectionContract.test.js']) {
  await access(new URL(\`../\${file}\`, import.meta.url));
}

console.log('build check passed');
`,
    },
    {
      path: 'docs/PRD.md',
      content: `${prd}\n`,
    },
  ];
}
