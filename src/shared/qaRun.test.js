import { describe, expect, test } from 'vitest';
import { normalizeQaRun } from './qaRun.js';

describe('QA run report', () => {
  test('marks the QA run as passed only when all cases pass and no blockers exist', () => {
    const report = normalizeQaRun({
      status: 'passed',
      commitHash: 'c60351e',
      testCases: [
        { id: 'person-present', title: '有行人画面提示', status: 'passed' },
        { id: 'false-positive-rate', title: '误检率统计', status: 'passed' },
      ],
      blockers: [],
      defects: [],
      nextActions: ['进入最终验收。'],
    });

    expect(report).toMatchObject({
      status: 'passed',
      commitHash: 'c60351e',
      passedCount: 2,
      totalCount: 2,
      blockers: [],
      nextActions: ['进入最终验收。'],
    });
  });

  test('preserves review handoff, coverage plan and defect routing fields', () => {
    const report = normalizeQaRun({
      status: 'needs-work',
      commitHash: 'c60351e',
      testCases: [
        { id: 'rtsp-reconnect', title: 'RTSP 断流恢复', status: 'blocked', evidence: '缺少回归证据。' },
      ],
      blockers: ['缺少 rtsp 对应实现或测试。'],
      reviewHandoff: {
        status: 'ready',
        commitHash: 'c60351e',
        focusAreas: ['RTSP 断流恢复'],
        requiredEvidence: ['测试样本清单与覆盖场景'],
        blockers: [],
      },
      coveragePlan: {
        source: 'code-review',
        commitHash: 'c60351e',
        focusAreas: ['RTSP 断流恢复'],
        requiredEvidence: ['测试样本清单与覆盖场景'],
      },
      defectRouting: {
        shouldReturnToDevelopment: true,
        targetStageId: 'development',
        reasons: ['缺少 rtsp 对应实现或测试。'],
      },
    });

    expect(report.reviewHandoff).toMatchObject({
      status: 'ready',
      focusAreas: ['RTSP 断流恢复'],
    });
    expect(report.coveragePlan).toMatchObject({
      source: 'code-review',
      requiredEvidence: ['测试样本清单与覆盖场景'],
    });
    expect(report.defectRouting).toMatchObject({
      shouldReturnToDevelopment: true,
      targetStageId: 'development',
    });
  });

  test('preserves YOLO detection quality metrics for acceptance evidence', () => {
    const report = normalizeQaRun({
      status: 'passed',
      commitHash: 'c60351e',
      totalDetections: 50,
      falsePositiveCount: 9,
      falsePositiveRate: 0.18,
      testCases: [
        { id: 'false-positive-rate', title: '误检率统计', status: 'passed' },
        { id: 'rtsp-reconnect', title: 'RTSP 断流恢复', status: 'passed' },
      ],
      blockers: [],
      defects: [],
    });

    expect(report).toMatchObject({
      status: 'passed',
      totalDetections: 50,
      falsePositiveCount: 9,
      falsePositiveRate: 0.18,
      metrics: {
        totalDetections: 50,
        falsePositiveCount: 9,
        falsePositiveRate: 0.18,
      },
    });
  });

  test('downgrades the QA run when a blocker or failed case exists', () => {
    const report = normalizeQaRun({
      status: 'passed',
      testCases: [
        { id: 'weak-light', title: '弱光场景检测', status: 'blocked', evidence: '缺少测试视频。' },
      ],
      blockers: ['测试视频样本、测试时长、测试环境尚未确认。'],
    });

    expect(report.status).toBe('needs-work');
    expect(report.passedCount).toBe(0);
    expect(report.totalCount).toBe(1);
    expect(report.defects).toEqual([]);
    expect(report.nextActions).toEqual(['补齐测试阻塞项后重新执行 QA。']);
  });
});
