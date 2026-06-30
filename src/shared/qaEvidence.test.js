import { describe, expect, test } from 'vitest';
import { normalizeQaEvidence } from './qaEvidence.js';

describe('QA evidence', () => {
  test('marks evidence ready when samples, duration, environment and browser scope are confirmed', () => {
    const evidence = normalizeQaEvidence({
      sampleSet: '10 段测试视频：有行人、无行人、多人、遮挡、弱光各 2 段。',
      durationMinutes: 30,
      environment: '本地 RTSP 测试流 + YOLO mock 推理服务。',
      browserScope: 'Chrome 126, Edge 126',
      notes: '误检率按 PRD 口径统计。',
      actor: '测试',
    });

    expect(evidence).toMatchObject({
      status: 'ready',
      sampleSet: '10 段测试视频：有行人、无行人、多人、遮挡、弱光各 2 段。',
      durationMinutes: 30,
      environment: '本地 RTSP 测试流 + YOLO mock 推理服务。',
      browserScope: 'Chrome 126, Edge 126',
      missingFields: [],
    });
  });

  test('keeps evidence incomplete until the required QA fields are present', () => {
    const evidence = normalizeQaEvidence({
      sampleSet: '弱光样本 1 段。',
      durationMinutes: 0,
      environment: '',
      browserScope: '',
    });

    expect(evidence.status).toBe('incomplete');
    expect(evidence.missingFields).toEqual(['durationMinutes', 'environment', 'browserScope']);
  });

  test('computes YOLO false-positive evidence and marks it ready when it is under the threshold', () => {
    const evidence = normalizeQaEvidence(
      {
        sampleSet: '20 段真实 RTSP 回放，覆盖有行人、无行人、遮挡、弱光。',
        durationMinutes: 45,
        environment: '真实 RTSP 摄像头 + YOLOv8n worker。',
        browserScope: 'Chrome 126, Edge 126',
        totalDetections: 50,
        falsePositiveCount: 9,
      },
      { requireFalsePositiveMetrics: true },
    );

    expect(evidence).toMatchObject({
      status: 'ready',
      totalDetections: 50,
      falsePositiveCount: 9,
      falsePositiveRate: 0.18,
      falsePositiveThreshold: 0.3,
      falsePositivePassed: true,
      qualityGateStatus: 'passed',
      missingFields: [],
    });
  });

  test('blocks YOLO evidence when the false-positive rate exceeds the threshold', () => {
    const evidence = normalizeQaEvidence(
      {
        sampleSet: '10 段真实 RTSP 回放。',
        durationMinutes: 30,
        environment: '真实 RTSP 摄像头 + YOLOv8n worker。',
        browserScope: 'Chrome 126',
        totalDetections: 20,
        falsePositiveCount: 8,
      },
      { requireFalsePositiveMetrics: true },
    );

    expect(evidence).toMatchObject({
      status: 'incomplete',
      falsePositiveRate: 0.4,
      falsePositivePassed: false,
      qualityGateStatus: 'failed',
    });
    expect(evidence.missingFields).toContain('falsePositiveRate');
  });

  test('requires YOLO false-positive counts before evidence can be ready', () => {
    const evidence = normalizeQaEvidence(
      {
        sampleSet: '10 段真实 RTSP 回放。',
        durationMinutes: 30,
        environment: '真实 RTSP 摄像头 + YOLOv8n worker。',
        browserScope: 'Chrome 126',
      },
      { requireFalsePositiveMetrics: true },
    );

    expect(evidence.status).toBe('incomplete');
    expect(evidence.qualityGateStatus).toBe('incomplete');
    expect(evidence.missingFields).toEqual(['totalDetections', 'falsePositiveCount']);
  });
});
