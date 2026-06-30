import { describe, expect, test } from 'vitest';
import { STAGE_IDS } from './workflow.js';
import { createDeliveryFlowRehearsal } from './deliveryFlowRehearsal.js';

describe('createDeliveryFlowRehearsal', () => {
  test('summarizes the full product flow when QA routes a YOLO defect back to development', () => {
    const rehearsal = createDeliveryFlowRehearsal({
      id: 'camera-monitor',
      name: 'yolo 摄像头监控项目',
      currentStageId: STAGE_IDS.QA,
      requirementReview: { status: 'ready' },
      prdStatus: 'generated',
      technicalHandoffStatus: 'generated',
      artifacts: {
        [STAGE_IDS.PRD_APPROVAL]: '# PRD',
        [STAGE_IDS.ARCHITECTURE]: '# 技术方案',
        [STAGE_IDS.DEVELOPMENT]: '# 开发任务',
        [STAGE_IDS.OPS_REQUIREMENTS]: '# 运维需求',
        [STAGE_IDS.QA]: '# 测试计划',
      },
      developmentRun: {
        status: 'completed',
        commitHash: 'abc123',
        checks: [{ command: 'npm test', status: 'passed' }],
      },
      codeReviewReport: {
        status: 'passed',
        commitHash: 'abc123',
      },
      qaEvidence: {
        status: 'ready',
        sampleSet: '有行人、无人、多人、遮挡、弱光样本',
        durationMinutes: 60,
        environment: '本地 GPU 推理服务',
        browserScope: 'Chrome / Edge',
      },
      qaRun: {
        status: 'needs-work',
        passedCount: 4,
        totalCount: 6,
        defectRouting: {
          shouldReturnToDevelopment: true,
          targetStageId: STAGE_IDS.DEVELOPMENT,
          reasons: ['RTSP 断流重连未通过'],
        },
      },
    });

    expect(rehearsal).toMatchObject({
      projectId: 'camera-monitor',
      projectName: 'yolo 摄像头监控项目',
      status: 'qa-return',
      statusLabel: '测试回流',
      currentPhaseId: 'qa-feedback-loop',
      currentPhaseLabel: 'QA 反馈回流',
      completedPhaseCount: 7,
      totalPhaseCount: 9,
      blockedPhaseCount: 1,
      missingPhaseCount: 1,
      canDemoEndToEnd: false,
      nextAction: '将 QA 缺陷回流到开发，生成修复计划并完成复测。',
    });
    expect(rehearsal.phases).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'requirements',
          role: 'pm',
          status: 'complete',
        }),
        expect.objectContaining({
          id: 'development',
          role: 'developer',
          status: 'complete',
          evidence: expect.stringContaining('abc123'),
        }),
        expect.objectContaining({
          id: 'qa-feedback-loop',
          role: 'developer',
          status: 'blocked',
          evidence: expect.stringContaining('RTSP'),
        }),
        expect.objectContaining({
          id: 'acceptance',
          role: 'owner',
          status: 'missing',
        }),
      ]),
    );
  });

  test('marks the flow demo-ready after acceptance package signoff', () => {
    const rehearsal = createDeliveryFlowRehearsal({
      id: 'camera-monitor',
      name: 'yolo 摄像头监控项目',
      currentStageId: STAGE_IDS.ACCEPTANCE,
      requirementReview: { status: 'ready' },
      prdStatus: 'generated',
      technicalHandoffStatus: 'generated',
      artifacts: {
        [STAGE_IDS.PRD_APPROVAL]: '# PRD',
        [STAGE_IDS.ARCHITECTURE]: '# 技术方案',
        [STAGE_IDS.DEVELOPMENT]: '# 开发任务',
        [STAGE_IDS.OPS_REQUIREMENTS]: '# 运维需求',
        [STAGE_IDS.QA]: '# 测试报告',
      },
      developmentRun: {
        status: 'completed',
        commitHash: 'release789',
      },
      codeReviewReport: { status: 'passed' },
      qaEvidence: {
        status: 'ready',
        sampleSet: '完整测试样本',
        durationMinutes: 90,
        environment: '本地 GPU 推理服务',
        browserScope: 'Chrome / Edge',
      },
      qaRun: {
        status: 'passed',
        passedCount: 8,
        totalCount: 8,
      },
      defectFixPackage: {
        status: 'closed',
      },
      acceptancePackage: {
        status: 'ready',
        signoffStatus: 'signed-off',
        signedOffBy: 'AA',
      },
    });

    expect(rehearsal).toMatchObject({
      status: 'signed-off',
      statusLabel: '已完成验收',
      currentPhaseId: 'acceptance',
      completedPhaseCount: 9,
      totalPhaseCount: 9,
      canDemoEndToEnd: true,
      nextAction: '完整链路已闭环，可复盘需求、开发、测试和验收证据。',
    });
  });
});
