import { describe, expect, test } from 'vitest';
import {
  addYoloQaDetectionEvent,
  completeYoloQaSession,
  createYoloQaSession,
  reviewYoloQaDetectionEvent,
} from './yoloQaSession.js';

describe('YOLO QA session', () => {
  test('tracks detection review labels and computes false-positive metrics', () => {
    const started = createYoloQaSession({
      actor: '测试',
      sampleSet: '真实 RTSP 样本：有行人、无行人。',
      environment: '真实摄像头 + YOLO worker。',
      browserScope: 'Chrome 126',
      channels: [72, 73],
      falsePositiveThreshold: 0.6,
      startedAt: '2026-06-29T01:00:00.000Z',
    });
    const withTruePositive = addYoloQaDetectionEvent(started, {
      id: 'event-1',
      channel: 72,
      personCount: 1,
      confidence: 0.84,
      occurredAt: '2026-06-29T01:05:00.000Z',
    });
    const withFalsePositive = addYoloQaDetectionEvent(withTruePositive, {
      id: 'event-2',
      channel: 73,
      personCount: 1,
      confidence: 0.61,
      occurredAt: '2026-06-29T01:08:00.000Z',
    });
    const reviewedTrue = reviewYoloQaDetectionEvent(withFalsePositive, 'event-1', {
      reviewStatus: 'true-positive',
      note: '画面中确有行人。',
      actor: '测试',
      reviewedAt: '2026-06-29T01:10:00.000Z',
    });
    const reviewedFalse = reviewYoloQaDetectionEvent(reviewedTrue, 'event-2', {
      reviewStatus: 'false-positive',
      note: '反光被误识别。',
      actor: '测试',
      reviewedAt: '2026-06-29T01:11:00.000Z',
    });

    const completed = completeYoloQaSession(reviewedFalse, {
      actor: '测试',
      endedAt: '2026-06-29T01:45:00.000Z',
    });

    expect(completed).toMatchObject({
      status: 'completed',
      durationMinutes: 45,
      metrics: {
        totalDetections: 2,
        truePositiveCount: 1,
        falsePositiveCount: 1,
        falsePositiveRate: 0.5,
        falsePositiveThreshold: 0.6,
        falsePositivePassed: true,
        qualityGateStatus: 'passed',
      },
    });
  });

  test('does not complete while detection events are still unreviewed', () => {
    const session = addYoloQaDetectionEvent(
      createYoloQaSession({
        actor: '测试',
        sampleSet: '真实 RTSP 样本。',
        environment: '真实摄像头 + YOLO worker。',
        browserScope: 'Chrome 126',
      }),
      { id: 'event-1', channel: 72, personCount: 1 },
    );

    expect(() => completeYoloQaSession(session, { actor: '测试' })).toThrow('检测事件尚未全部标注');
  });
});
