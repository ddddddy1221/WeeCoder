import { describe, expect, test } from 'vitest';
import { createDevelopmentPlan } from './developmentPlan.js';
import {
  STAGE_IDS,
  advanceProject,
  applyRequirementReview,
  createProject,
  generatePrdForProject,
  generateTechnicalHandoffForProject,
  normalizeProject,
  updateStageConfirmationForProject,
} from './workflow.js';

describe('development plan', () => {
  test('creates structured YOLO development tasks from the technical handoff', () => {
    const project = createProject({
      name: 'yolo摄像头监控项目',
      sponsor: 'AA',
      summary: '连接 RTSP 摄像头并用 YOLO 检测行人。',
    });
    const plan = createDevelopmentPlan(project, '# 开发任务\nRTSP、YOLO、标注框、误检率。');

    expect(plan.status).toBe('ready');
    expect(plan.tasks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          area: '前端',
          title: expect.stringContaining('监控页面'),
          acceptanceCriteria: expect.arrayContaining([expect.stringContaining('标注框')]),
        }),
        expect.objectContaining({
          area: '后端',
          title: expect.stringContaining('RTSP'),
        }),
        expect.objectContaining({
          area: '推理服务',
          title: expect.stringContaining('YOLO'),
        }),
        expect.objectContaining({
          area: '测试',
          title: expect.stringContaining('误检率'),
        }),
      ]),
    );
    expect(plan.verificationCommands).toEqual(
      expect.arrayContaining(['npm test', 'npm run build', 'npm audit --omit=dev']),
    );
  });

  test('stores a development plan when technical handoff is generated', () => {
    const project = generatePrdForProject(
      applyRequirementReview(
        advanceConfirmed(
          createProject({
            name: 'yolo摄像头监控项目',
            sponsor: 'AA',
            summary: '连接 RTSP 摄像头并用 YOLO 检测行人。',
          }),
          { actor: '负责人' },
        ),
        {
          review: {
            status: 'ready',
            score: 90,
            completedCount: 6,
            totalCount: 6,
            missingQuestionIds: [],
            missingQuestions: [],
            blockers: [],
            warnings: [],
            recommendations: [],
          },
        },
      ),
      {
        actor: 'PM',
        artifact: '# PRD: yolo摄像头监控项目\n\nRTSP 摄像头，YOLO 行人检测，标注框。',
      },
    );

    const handoff = generateTechnicalHandoffForProject(project, { actor: '技术负责人' });

    expect(handoff.developmentPlan.status).toBe('ready');
    expect(handoff.developmentPlan.sourceStageId).toBe(STAGE_IDS.DEVELOPMENT);
    expect(handoff.developmentPlan.tasks.length).toBeGreaterThanOrEqual(4);
    expect(handoff.developmentPlan.tasks[0]).toMatchObject({
      status: 'queued',
      acceptanceCriteria: expect.any(Array),
    });
  });
});

function advanceConfirmed(project, options = {}) {
  return advanceProject(confirmStage(project, project.currentStageId, options.actor || 'Test'), options);
}

function confirmStage(project, stageId = project.currentStageId, actor = 'Test') {
  const normalized = normalizeProject(project);
  const entry = normalized.stageConfirmations?.[stageId];
  return (entry?.items || []).reduce(
    (nextProject, item) =>
      updateStageConfirmationForProject(nextProject, {
        actor,
        stageId,
        itemId: item.id,
        value: `Confirmed ${item.title}`,
      }),
    normalized,
  );
}
