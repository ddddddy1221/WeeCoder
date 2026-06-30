import { mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { CodeReviewRunnerError, runCodeReview } from './codeReviewRunner.js';

describe('code review runner', () => {
  let tempDir;

  beforeEach(async () => {
    tempDir = await mkdir(join(tmpdir(), `wee-coder-review-${Date.now()}-`), { recursive: true });
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  test('passes code, security and performance review for a completed YOLO development run', async () => {
    await writeProjectFile('src/monitoringState.js', 'export function isDetectionFrameStale() { return true; }\n');
    await writeProjectFile('src/rtspConfig.js', 'export const reconnectIntervalMs = 3000;\n');
    await writeProjectFile('src/falsePositiveMetrics.js', 'export function calculateFalsePositiveRate() { return 0; }\n');
    await writeProjectFile('test/monitoringState.test.js', 'test("monitoring", () => {});\n');
    await writeProjectFile('test/rtspConfig.test.js', 'test("rtsp", () => {});\n');
    await writeProjectFile('test/falsePositiveMetrics.test.js', 'test("metrics", () => {});\n');

    const report = await runCodeReview(createProject());

    expect(report).toMatchObject({
      status: 'passed',
      summary: '代码、安全和性能 Review 通过，可以进入测试阶段。',
      commitHash: 'c60351e',
      sourceChangePackage: {
        status: 'ready-for-review',
        commitHash: 'c60351e',
        filesChangedCount: 6,
        verification: {
          total: 3,
          passed: 3,
          failed: 0,
          blocked: 0,
        },
      },
      qaHandoff: {
        status: 'ready',
        commitHash: 'c60351e',
        focusAreas: expect.arrayContaining(['有行人提示', '无行人误报', '弱光/遮挡', 'RTSP 断流恢复']),
      },
    });
    expect(report.categories).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'code-quality', status: 'passed' }),
        expect.objectContaining({ id: 'security', status: 'passed' }),
        expect.objectContaining({ id: 'performance', status: 'passed' }),
      ]),
    );
    expect(report.blockers).toEqual([]);
    expect(report.nextActions).toEqual(['进入测试阶段，生成并执行测试用例。']);
  });

  test('blocks review when the development change package is not ready', async () => {
    const error = await runCodeReview(createProject({
      changePackage: {
        status: 'blocked',
        reviewGate: {
          canStartReview: false,
          blockers: ['本地检查未全部通过，不能开始 Review。'],
        },
      },
    })).catch((caught) => caught);

    expect(error).toBeInstanceOf(CodeReviewRunnerError);
    expect(error).toMatchObject({
      details: {
        field: 'changePackage',
        blockers: ['本地检查未全部通过，不能开始 Review。'],
      },
    });
  });

  test('flags source code secrets and missing performance controls', async () => {
    await writeProjectFile(
      'src/monitoringState.js',
      'export const camera = "rtsp://admin:secret@192.168.1.10/live";\n',
    );
    await writeProjectFile('test/monitoringState.test.js', 'test("monitoring", () => {});\n');

    const report = await runCodeReview(createProject({
      filesChanged: ['src/monitoringState.js', 'test/monitoringState.test.js'],
      changePackage: {
        status: 'ready-for-review',
        commitHash: 'c60351e',
        filesChanged: ['src/monitoringState.js', 'test/monitoringState.test.js'],
        verification: {
          total: 3,
          passed: 3,
          failed: 0,
          blocked: 0,
        },
        reviewGate: {
          canStartReview: true,
          blockers: [],
        },
      },
    }));

    expect(report.status).toBe('needs-work');
    expect(report.blockers).toEqual(
      expect.arrayContaining([
        '安全检查未通过：生产代码中疑似包含 RTSP 凭据或明文密钥。',
        '性能检查未通过：缺少过期检测结果丢弃或 RTSP 重连控制。',
      ]),
    );
    expect(report.categories).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'security',
          status: 'failed',
          findings: expect.arrayContaining([
            expect.objectContaining({ file: 'src/monitoringState.js' }),
          ]),
        }),
      ]),
    );
  });

  async function writeProjectFile(relativePath, content) {
    const absolutePath = join(tempDir, relativePath);
    await mkdir(join(absolutePath, '..'), { recursive: true });
    await writeFile(absolutePath, content, 'utf8');
  }

  function createProject(overrides = {}) {
    return {
      repositoryConfig: {
        status: 'ready',
        localPath: tempDir,
      },
      developmentRun: {
        status: 'completed',
        commitHash: 'c60351e',
        filesChanged: [
          'src/monitoringState.js',
          'src/rtspConfig.js',
          'src/falsePositiveMetrics.js',
          'test/monitoringState.test.js',
          'test/rtspConfig.test.js',
          'test/falsePositiveMetrics.test.js',
        ],
        checks: [
          { command: 'npm test', status: 'passed' },
          { command: 'npm run build', status: 'passed' },
          { command: 'npm audit --omit=dev', status: 'passed' },
        ],
        changePackage: {
          status: 'ready-for-review',
          commitHash: 'c60351e',
          filesChanged: [
            'src/monitoringState.js',
            'src/rtspConfig.js',
            'src/falsePositiveMetrics.js',
            'test/monitoringState.test.js',
            'test/rtspConfig.test.js',
            'test/falsePositiveMetrics.test.js',
          ],
          verification: {
            total: 3,
            passed: 3,
            failed: 0,
            blocked: 0,
          },
          reviewGate: {
            canStartReview: true,
            blockers: [],
          },
        },
        ...overrides,
      },
    };
  }
});
