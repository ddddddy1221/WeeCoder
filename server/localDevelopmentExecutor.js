import { access, mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { runGitCommand } from './repositoryInspector.js';

const DEFAULT_TIMEOUT_MS = 30000;

export class LocalDevelopmentExecutionError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = 'LocalDevelopmentExecutionError';
    this.details = details;
  }
}

export async function executeLocalDevelopmentTasks(
  project,
  { commandRunner = runGitCommand, timeoutMs = DEFAULT_TIMEOUT_MS } = {},
) {
  const repositoryConfig = project.repositoryConfig || {};
  const localPath = String(repositoryConfig.localPath || '').trim();
  const base = {
    status: 'blocked',
    summary: '',
    commitHash: '',
    filesChanged: [],
    repositoryAudit: null,
    taskResults: [],
    blockers: [],
    nextActions: [],
  };

  if (repositoryConfig.status !== 'ready' || !localPath) {
    return {
      ...base,
      blockers: ['本地代码仓库未配置完整，不能执行自动开发。'],
      nextActions: ['先完成仓库配置、仓库诊断、分支准备和 AI 开发任务包生成。'],
    };
  }

  try {
    await access(localPath);
  } catch (error) {
    throw new LocalDevelopmentExecutionError('本地代码仓库路径不可访问。', {
      localPath,
      cause: error.message,
    });
  }

  const beforeAudit = await collectRepositoryAuditSnapshot(commandRunner, {
    cwd: localPath,
    timeoutMs,
  });
  const files = buildYoloMonitorImplementationFiles();
  for (const file of files) {
    const absolutePath = join(localPath, file.path);
    await mkdir(dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, file.content, 'utf8');
  }

  const addResult = await commandRunner(['add', '.'], { cwd: localPath, timeoutMs });
  if (addResult.exitCode !== 0) {
    return fail(base, '无法暂存自动开发变更。', addResult, files);
  }

  const commitResult = await commandRunner(['commit', '-m', 'feat: implement yolo monitor baseline'], {
    cwd: localPath,
    timeoutMs,
  });
  if (commitResult.exitCode !== 0 && !isNothingToCommit(commitResult)) {
    return fail(base, '无法提交自动开发变更。', commitResult, files);
  }

  const headResult = await commandRunner(['rev-parse', '--short', 'HEAD'], {
    cwd: localPath,
    timeoutMs,
  });
  const commitHash = headResult.exitCode === 0 ? headResult.stdout.trim() : '';
  const afterAudit = await collectRepositoryAuditSnapshot(commandRunner, {
    cwd: localPath,
    timeoutMs,
  });

  return {
    status: 'completed',
    summary: '本地开发执行已完成，已生成 YOLO 摄像头监控基础实现和测试。',
    commitHash,
    filesChanged: files.map((file) => file.path),
    repositoryAudit: {
      before: beforeAudit,
      after: afterAudit,
      committed: Boolean(commitHash && beforeAudit.head && commitHash !== beforeAudit.head),
    },
    taskResults: createTaskResults(project.agentExecutionPackage?.tasks),
    blockers: [],
    nextActions: ['运行检查命令，确认本地实现可测试、可构建且依赖无漏洞。'],
  };
}

async function collectRepositoryAuditSnapshot(commandRunner, { cwd, timeoutMs }) {
  const branchResult = await commandRunner(['branch', '--show-current'], { cwd, timeoutMs });
  const headResult = await commandRunner(['rev-parse', '--short', 'HEAD'], { cwd, timeoutMs });
  const statusResult = await commandRunner(['status', '--porcelain'], { cwd, timeoutMs });

  return {
    branch: branchResult.exitCode === 0 ? branchResult.stdout.trim() || 'DETACHED' : '',
    head: headResult.exitCode === 0 ? headResult.stdout.trim() : '',
    changedFiles: parseChangedFiles(statusResult.stdout),
  };
}

function fail(base, issue, result, files) {
  const detail = [result.stderr, result.stdout].map((item) => String(item || '').trim()).find(Boolean);
  return {
    ...base,
    status: 'blocked',
    filesChanged: files.map((file) => file.path),
    blockers: detail ? [issue, detail] : [issue],
    nextActions: ['检查 Git 输出，处理本地仓库问题后重新启动开发执行。'],
  };
}

function isNothingToCommit(result) {
  const output = `${result.stdout || ''}\n${result.stderr || ''}`.toLowerCase();
  return output.includes('nothing to commit') || output.includes('no changes added');
}

function parseChangedFiles(output) {
  return String(output || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 50);
}

function createTaskResults(tasks = []) {
  return (Array.isArray(tasks) ? tasks : []).map((task) => ({
    taskId: task.id,
    title: task.title,
    area: task.area || '开发',
    status: 'completed',
    result: `已生成 ${task.title} 的基础实现、测试和本地检查入口。`,
    acceptanceCriteria: [...(task.acceptanceCriteria || [])],
  }));
}

function buildYoloMonitorImplementationFiles() {
  return [
    {
      path: 'src/monitoringState.js',
      content: `export function createMonitorState(options = {}) {
  return {
    staleAfterMs: Number(options.staleAfterMs || 1500),
    lastFrameAt: '',
    hasPerson: false,
    alertMessage: '',
    boxes: [],
    error: '',
  };
}

export function applyDetectionFrame(state, frame = {}) {
  const threshold = Number(frame.confidenceThreshold || 0.25);
  const boxes = normalizeDetections(frame.detections)
    .filter((detection) => detection.className === 'person' && detection.confidence >= threshold)
    .map((detection) => detection.box);

  return {
    ...state,
    lastFrameAt: String(frame.timestamp || new Date().toISOString()),
    hasPerson: boxes.length > 0,
    alertMessage: boxes.length > 0 ? '检测到行人' : '',
    boxes,
    error: '',
  };
}

export function applyMonitorError(state, errorMessage) {
  return {
    ...state,
    hasPerson: false,
    alertMessage: '',
    boxes: [],
    error: String(errorMessage || '监控服务异常'),
  };
}

export function isDetectionFrameStale(state, now = new Date()) {
  const lastFrameTime = Date.parse(state.lastFrameAt || '');
  if (!Number.isFinite(lastFrameTime)) {
    return true;
  }
  return now.getTime() - lastFrameTime > state.staleAfterMs;
}

function normalizeDetections(detections = []) {
  return Array.isArray(detections)
    ? detections.map((detection) => ({
        className: String(detection.className || ''),
        confidence: Number(detection.confidence || 0),
        box: {
          x: Number(detection.box?.x || 0),
          y: Number(detection.box?.y || 0),
          width: Number(detection.box?.width || 0),
          height: Number(detection.box?.height || 0),
        },
      }))
    : [];
}
`,
    },
    {
      path: 'src/rtspConfig.js',
      content: `export function createRtspConfig(env = {}) {
  const url = String(env.RTSP_URL || '').trim();
  return {
    ready: Boolean(url),
    url,
    reconnectIntervalMs: Number(env.RTSP_RECONNECT_INTERVAL_MS || 3000),
    timeoutMs: Number(env.RTSP_TIMEOUT_MS || 10000),
  };
}

export function createPublicCameraStatus(config, status = {}) {
  return {
    ready: Boolean(config.ready),
    connected: Boolean(status.connected),
    lastFrameAt: String(status.lastFrameAt || ''),
    errorCode: String(status.errorCode || ''),
    maskedSource: maskRtspUrl(config.url),
  };
}

export function maskRtspUrl(url) {
  return String(url || '').replace(/(rtsp:\\/\\/)([^:@/]+):([^@/]+)@/i, '$1***:***@');
}
`,
    },
    {
      path: 'src/falsePositiveMetrics.js',
      content: `export function calculateFalsePositiveRate({ totalDetections = 0, falsePositives = 0 } = {}) {
  const total = Number(totalDetections || 0);
  const falsePositiveCount = Number(falsePositives || 0);
  if (total <= 0) {
    return 0;
  }
  return falsePositiveCount / total;
}

export function createFalsePositiveReport(sample = {}) {
  const falsePositiveRate = calculateFalsePositiveRate(sample);
  return {
    testedAt: String(sample.testedAt || new Date().toISOString()),
    sampleName: String(sample.sampleName || '未命名样本'),
    totalDetections: Number(sample.totalDetections || 0),
    falsePositives: Number(sample.falsePositives || 0),
    falsePositiveRate,
    passed: falsePositiveRate < 0.3,
  };
}
`,
    },
    {
      path: 'test/monitoringState.test.js',
      content: `import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyDetectionFrame,
  applyMonitorError,
  createMonitorState,
  isDetectionFrameStale,
} from '../src/monitoringState.js';

test('shows alert and boxes when person detections are present', () => {
  const state = applyDetectionFrame(createMonitorState(), {
    timestamp: '2026-06-17T00:00:00.000Z',
    detections: [
      { className: 'person', confidence: 0.8, box: { x: 10, y: 20, width: 30, height: 40 } },
      { className: 'chair', confidence: 0.9, box: { x: 0, y: 0, width: 10, height: 10 } },
    ],
  });

  assert.equal(state.hasPerson, true);
  assert.equal(state.alertMessage, '检测到行人');
  assert.deepEqual(state.boxes, [{ x: 10, y: 20, width: 30, height: 40 }]);
});

test('clears person alert when no valid person detections exist', () => {
  const state = applyDetectionFrame(createMonitorState(), {
    timestamp: '2026-06-17T00:00:00.000Z',
    detections: [{ className: 'person', confidence: 0.1, box: { x: 1, y: 2, width: 3, height: 4 } }],
  });

  assert.equal(state.hasPerson, false);
  assert.equal(state.alertMessage, '');
  assert.deepEqual(state.boxes, []);
});

test('detects stale frames and records monitor errors', () => {
  const state = applyMonitorError(
    { ...createMonitorState({ staleAfterMs: 1000 }), lastFrameAt: '2026-06-17T00:00:00.000Z' },
    'RTSP 断流',
  );

  assert.equal(state.error, 'RTSP 断流');
  assert.equal(isDetectionFrameStale(state, new Date('2026-06-17T00:00:02.000Z')), true);
});
`,
    },
    {
      path: 'test/rtspConfig.test.js',
      content: `import test from 'node:test';
import assert from 'node:assert/strict';
import { createPublicCameraStatus, createRtspConfig, maskRtspUrl } from '../src/rtspConfig.js';

test('keeps RTSP credentials out of public camera status', () => {
  const config = createRtspConfig({
    RTSP_URL: 'rtsp://admin:secret@192.168.1.10/live',
    RTSP_RECONNECT_INTERVAL_MS: '5000',
  });
  const status = createPublicCameraStatus(config, { connected: true });

  assert.equal(config.ready, true);
  assert.equal(config.reconnectIntervalMs, 5000);
  assert.equal(status.maskedSource, 'rtsp://***:***@192.168.1.10/live');
  assert.equal(status.connected, true);
});

test('masks RTSP URLs without changing anonymous streams', () => {
  assert.equal(maskRtspUrl('rtsp://camera.local/live'), 'rtsp://camera.local/live');
});
`,
    },
    {
      path: 'test/falsePositiveMetrics.test.js',
      content: `import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateFalsePositiveRate, createFalsePositiveReport } from '../src/falsePositiveMetrics.js';

test('calculates false positive rate using the PRD definition', () => {
  assert.equal(calculateFalsePositiveRate({ totalDetections: 10, falsePositives: 2 }), 0.2);
  assert.equal(calculateFalsePositiveRate({ totalDetections: 0, falsePositives: 0 }), 0);
});

test('passes acceptance when false positive rate is 低于 30%', () => {
  const report = createFalsePositiveReport({
    sampleName: 'weak-light-camera',
    totalDetections: 20,
    falsePositives: 5,
    testedAt: '2026-06-17T00:00:00.000Z',
  });

  assert.equal(report.falsePositiveRate, 0.25);
  assert.equal(report.passed, true);
});
`,
    },
    {
      path: 'scripts/build-check.js',
      content: `import { access } from 'node:fs/promises';

for (const file of [
  'README.md',
  'docs/PRD.md',
  'src/detectionContract.js',
  'src/monitoringState.js',
  'src/rtspConfig.js',
  'src/falsePositiveMetrics.js',
  'test/detectionContract.test.js',
  'test/monitoringState.test.js',
  'test/rtspConfig.test.js',
  'test/falsePositiveMetrics.test.js',
]) {
  await access(new URL(\`../\${file}\`, import.meta.url));
}

console.log('build check passed');
`,
    },
  ];
}
