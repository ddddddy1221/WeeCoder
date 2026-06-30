import { describe, expect, test } from 'vitest';
import {
  STAGE_IDS,
  createProject,
  completeYoloQaSessionForProject,
  recordYoloQaDetectionEventForProject,
  reviewYoloQaDetectionEventForProject,
  startYoloQaSessionForProject,
} from './workflow.js';

describe('YOLO QA session workflow', () => {
  test('completes a YOLO QA batch and backfills structured QA evidence', () => {
    const project = moveToQaStage(createProject({
      name: 'YOLO 摄像头监控项目',
      sponsor: 'AA',
      summary: '接入 RTSP 摄像头并使用 YOLO 检测行人。',
    }));

    const started = startYoloQaSessionForProject(project, {
      actor: '测试',
      session: {
        sampleSet: '真实 RTSP 样本：有行人、无行人。',
        environment: '真实摄像头 + YOLO worker。',
        browserScope: 'Chrome 126',
        channels: [72, 73],
        falsePositiveThreshold: 0.6,
        startedAt: '2026-06-29T01:00:00.000Z',
      },
    });
    const withEventOne = recordYoloQaDetectionEventForProject(started, {
      actor: '测试',
      event: {
        id: 'event-1',
        channel: 72,
        personCount: 1,
        confidence: 0.84,
      },
    });
    const withEventTwo = recordYoloQaDetectionEventForProject(withEventOne, {
      actor: '测试',
      event: {
        id: 'event-2',
        channel: 73,
        personCount: 1,
        confidence: 0.61,
      },
    });
    const reviewedOne = reviewYoloQaDetectionEventForProject(withEventTwo, {
      actor: '测试',
      eventId: 'event-1',
      review: { reviewStatus: 'true-positive', note: '画面中确有行人。' },
    });
    const reviewedTwo = reviewYoloQaDetectionEventForProject(reviewedOne, {
      actor: '测试',
      eventId: 'event-2',
      review: { reviewStatus: 'false-positive', note: '反光误检。' },
    });

    const completed = completeYoloQaSessionForProject(reviewedTwo, {
      actor: '测试',
      endedAt: '2026-06-29T01:45:00.000Z',
    });

    expect(completed.yoloQaSession).toMatchObject({
      status: 'completed',
      metrics: {
        totalDetections: 2,
        falsePositiveCount: 1,
        falsePositiveRate: 0.5,
        falsePositivePassed: true,
      },
    });
    expect(completed.qaEvidence).toMatchObject({
      status: 'ready',
      durationMinutes: 45,
      totalDetections: 2,
      falsePositiveCount: 1,
      falsePositiveRate: 0.5,
      falsePositivePassed: true,
      missingFields: [],
    });
    expect(completed.artifacts[STAGE_IDS.QA]).toContain('误检率：50%');
    expect(completed.history[0]).toMatchObject({
      type: 'yolo-qa-session-completed',
      actor: '测试',
    });
  });
});

function moveToQaStage(project) {
  return {
    ...project,
    currentStageId: STAGE_IDS.QA,
    stages: project.stages.map((stage) => ({
      ...stage,
      status: stage.id === STAGE_IDS.QA ? 'active' : stage.status,
    })),
  };
}
