import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { runQa } from './qaRunner.js';

describe('QA runner', () => {
  let tempDir;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'wee-coder-qa-'));
    await mkdir(join(tempDir, 'src'), { recursive: true });
    await mkdir(join(tempDir, 'test'), { recursive: true });
    await writeFile(join(tempDir, 'src', 'monitoringState.js'), 'export function createMonitoringState() {}\n');
    await writeFile(join(tempDir, 'src', 'rtspConfig.js'), 'export function maskRtspUrl() {}\n');
    await writeFile(join(tempDir, 'src', 'falsePositiveMetrics.js'), 'export function calculateFalsePositiveRate() {}\n');
    await writeFile(join(tempDir, 'src', 'detectionContract.js'), 'export function normalizeYoloDetections() {}\n');
    await writeFile(join(tempDir, 'test', 'monitoringState.test.js'), 'test("monitoring", () => {});\n');
    await writeFile(join(tempDir, 'test', 'rtspConfig.test.js'), 'test("rtsp", () => {});\n');
    await writeFile(join(tempDir, 'test', 'falsePositiveMetrics.test.js'), 'test("metrics", () => {});\n');
    await writeFile(join(tempDir, 'test', 'detectionContract.test.js'), 'test("contract", () => {});\n');
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  test('generates YOLO QA cases and blocks acceptance when test samples are not confirmed', async () => {
    const report = await runQa(createProject({
      artifacts: {
        qa: '# 测试计划\n测试视频样本、测试时长、测试环境：待项目经理补充。\n覆盖弱光、遮挡、多人和无行人场景。',
      },
    }));

    expect(report.status).toBe('needs-work');
    expect(report.summary).toContain('QA 发现测试阻塞项');
    expect(report.testCases).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'person-present', title: expect.stringContaining('有行人') }),
        expect.objectContaining({ id: 'person-absent', title: expect.stringContaining('无行人') }),
        expect.objectContaining({ id: 'multi-person', title: expect.stringContaining('多人') }),
        expect.objectContaining({ id: 'weak-light-occlusion', title: expect.stringContaining('弱光') }),
        expect.objectContaining({ id: 'false-positive-rate', title: expect.stringContaining('误检率') }),
      ]),
    );
    expect(report.blockers).toEqual(
      expect.arrayContaining(['测试视频样本、测试时长、测试环境尚未确认。']),
    );
    expect(report.nextActions).toEqual(['补齐测试阻塞项后重新执行 QA。']);
    expect(report.reviewHandoff).toMatchObject({
      status: 'ready',
      commitHash: 'c60351e',
      focusAreas: expect.arrayContaining(['有行人提示', '无行人误报', 'RTSP 断流恢复']),
    });
    expect(report.coveragePlan).toMatchObject({
      source: 'code-review',
      commitHash: 'c60351e',
      focusAreas: expect.arrayContaining(['RTSP 断流恢复']),
      requiredEvidence: expect.arrayContaining(['测试样本清单与覆盖场景']),
    });
    expect(report.defectRouting).toMatchObject({
      shouldReturnToDevelopment: false,
      targetStageId: 'qa',
    });
  });

  test('passes QA when repository coverage and acceptance sample details are present', async () => {
    const report = await runQa(createProject({
      artifacts: {
        qa: [
          '# 测试计划',
          '测试视频样本：10 段，包含有行人、无行人、多人、遮挡、弱光。',
          '测试时长：30 分钟。',
          '测试环境：本地 RTSP 测试流 + 桌面 Chrome。',
          '误检率按 PRD 口径统计。',
        ].join('\n'),
      },
    }));

    expect(report.status).toBe('passed');
    expect(report.blockers).toEqual([]);
    expect(report.defects).toEqual([]);
    expect(report.testCases.every((item) => item.status === 'passed')).toBe(true);
    expect(report.nextActions).toEqual(['测试通过，准备最终验收材料。']);
    expect(report.coveragePlan.focusAreas).toEqual(
      expect.arrayContaining(['有行人提示', '无行人误报', 'RTSP 断流恢复']),
    );
  });

  test('uses structured QA evidence to unblock real sample acceptance cases', async () => {
    const report = await runQa(createProject({
      artifacts: {
        qa: '# 测试计划\n测试视频样本、测试时长、测试环境：待项目经理补充。\n误检率按 PRD 口径统计。',
      },
      qaEvidence: {
        status: 'ready',
        sampleSet: '10 段测试视频：有行人、无行人、多人、遮挡、弱光各 2 段。',
        durationMinutes: 30,
        environment: '本地 RTSP 测试流 + YOLO mock 推理服务。',
        browserScope: 'Chrome 126, Edge 126',
        missingFields: [],
      },
    }));

    expect(report.status).toBe('passed');
    expect(report.testCases.find((item) => item.id === 'weak-light-occlusion')).toMatchObject({
      status: 'passed',
      evidence: 'QA 证据已确认样本、时长、环境和浏览器范围。',
    });
    expect(report.blockers).toEqual([]);
  });

  test('routes implementation coverage gaps back to development', async () => {
    await rm(join(tempDir, 'test', 'rtspConfig.test.js'), { force: true });

    const report = await runQa(createProject({
      artifacts: {
        qa: [
          '# 测试计划',
          '测试视频样本：10 段，包含有行人、无行人、多人、遮挡、弱光。',
          '测试时长：30 分钟。',
          '测试环境：本地 RTSP 测试流 + 桌面 Chrome。',
          '误检率按 PRD 口径统计。',
        ].join('\n'),
      },
      qaEvidence: {
        status: 'ready',
        sampleSet: '10 段测试视频：有行人、无行人、多人、遮挡、弱光各 2 段。',
        durationMinutes: 30,
        environment: '本地 RTSP 测试流 + YOLO mock 推理服务。',
        browserScope: 'Chrome 126, Edge 126',
        missingFields: [],
      },
    }));

    expect(report.status).toBe('needs-work');
    expect(report.blockers).toEqual(expect.arrayContaining(['缺少 rtsp 对应实现或测试。']));
    expect(report.defectRouting).toMatchObject({
      shouldReturnToDevelopment: true,
      targetStageId: 'development',
      reasons: expect.arrayContaining(['缺少 rtsp 对应实现或测试。']),
    });
  });

  test('blocks QA execution when the review handoff is not ready', async () => {
    const report = await runQa(createProject({
      codeReviewReport: {
        status: 'passed',
        qaHandoff: {
          status: 'blocked',
          commitHash: 'c60351e',
          focusAreas: ['RTSP 断流恢复'],
          requiredEvidence: ['测试样本清单与覆盖场景'],
          blockers: ['Review 仍存在性能阻塞项。'],
        },
      },
    }));

    expect(report.status).toBe('needs-work');
    expect(report.blockers).toEqual(expect.arrayContaining(['Review 交接未就绪：Review 仍存在性能阻塞项。']));
    expect(report.reviewHandoff.status).toBe('blocked');
    expect(report.defectRouting).toMatchObject({
      shouldReturnToDevelopment: true,
      targetStageId: 'development',
    });
  });

  function createProject(overrides = {}) {
    return {
      id: 'yolo-qa',
      name: 'yolo摄像头监控项目',
      currentStageId: 'qa',
      repositoryConfig: {
        status: 'ready',
        localPath: tempDir,
      },
      developmentRun: {
        status: 'completed',
        commitHash: 'c60351e',
        checks: [{ command: 'npm test', status: 'passed' }],
      },
      codeReviewReport: {
        status: 'passed',
        qaHandoff: {
          status: 'ready',
          commitHash: 'c60351e',
          focusAreas: ['有行人提示', '无行人误报', 'RTSP 断流恢复'],
          requiredEvidence: [
            '测试样本清单与覆盖场景',
            '测试时长、环境和浏览器范围',
            '总检测次数、误检次数和误检率计算过程',
          ],
          blockers: [],
        },
      },
      artifacts: {
        qa: '# 测试计划\n测试视频样本：10 段。测试时长：30 分钟。测试环境：本地 RTSP 测试流。',
      },
      ...overrides,
    };
  }
});
