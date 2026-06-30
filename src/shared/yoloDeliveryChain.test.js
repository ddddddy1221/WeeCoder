import { describe, expect, test } from 'vitest';
import { createYoloDeliveryChain, isYoloCameraProject } from './yoloDeliveryChain.js';
import { STAGE_IDS } from './workflow.js';

describe('yolo delivery chain', () => {
  test('detects YOLO camera monitoring projects', () => {
    expect(
      isYoloCameraProject({
        name: 'YOLO 摄像头监控项目',
        summary: '通过 RTSP 摄像头识别行人并展示标注框。',
      }),
    ).toBe(true);
    expect(
      isYoloCameraProject({
        name: '客户门户',
        summary: '客户自助查询和工单处理。',
      }),
    ).toBe(false);
  });

  test('does not classify generic projects as YOLO only because a generated artifact mentions RTSP or YOLO', () => {
    expect(
      isYoloCameraProject({
        name: 'Agent Package API',
        summary: 'Prepare a Codex-ready development package.',
        artifacts: {
          architecture: '# 技术方案\nRTSP 接入 + YOLO 推理 + 前端标注框。',
          qa: '# 测试计划\n本地 RTSP 测试流 + YOLO mock 推理服务。',
        },
      }),
    ).toBe(false);
  });

  test('blocks PM handoff when YOLO-specific requirement inputs are still missing', () => {
    const chain = createYoloDeliveryChain({
      id: 'yolo-monitor',
      name: 'YOLO 摄像头监控项目',
      summary: 'RTSP 摄像头行人检测，误检率低于 30%。',
      currentStageId: STAGE_IDS.PM_REQUIREMENTS,
      requirementAnswers: {
        users: '保安。',
        scenarios: '保安打开网页后查看 RTSP 监控画面。',
        successMetrics: '误检率低于 30%，测试视频样本、测试时长、测试环境待项目经理补充。',
        scope: '本期包含网页端、RTSP 接入、YOLO 行人检测，不包含移动 App。',
        data: '是否保存视频、截图或检测日志待项目经理补充。',
        integrations: 'RTSP 地址、账号、密码、YOLO 模型版本和推理硬件要求待项目经理补充。',
      },
      requirementReview: {
        status: 'needs-work',
      },
    });

    expect(chain).toMatchObject({
      isYoloProject: true,
      status: 'blocked',
      currentModuleId: 'pm-product',
      modules: expect.arrayContaining([
        expect.objectContaining({
          id: 'pm-product',
          status: 'blocked',
          blockerCount: expect.any(Number),
        }),
        expect.objectContaining({
          id: 'ai-coding',
          status: 'blocked',
        }),
        expect.objectContaining({
          id: 'security-review',
          status: 'blocked',
        }),
      ]),
    });
    expect(chain.modules[0].missingItems.map((item) => item.id)).toEqual(
      expect.arrayContaining([
        'test-samples',
        'data-retention',
        'model-version',
        'runtime-hardware',
      ]),
    );
  });

  test('marks AI Coding complete when the development run has a ready review package', () => {
    const chain = createYoloDeliveryChain({
      id: 'yolo-monitor',
      name: 'YOLO 摄像头监控项目',
      summary: 'RTSP 摄像头行人检测。',
      currentStageId: STAGE_IDS.REVIEW,
      requirementReview: { status: 'ready' },
      prdStatus: 'generated',
      requirementAnswers: completeYoloAnswers(),
      agentExecutionPackage: { status: 'ready', canStart: true },
      developmentRun: {
        status: 'completed',
        commitHash: 'abc123',
        changePackage: {
          status: 'ready-for-review',
          reviewGate: {
            canStartReview: true,
            blockers: [],
          },
        },
      },
    });

    expect(chain.modules.find((module) => module.id === 'ai-coding')).toMatchObject({
      status: 'complete',
      evidence: expect.arrayContaining(['提交 abc123']),
    });
    expect(chain.currentModuleId).toBe('security-review');
  });

  test('blocks QA when code security review has high-risk blockers', () => {
    const chain = createYoloDeliveryChain({
      id: 'yolo-monitor',
      name: 'YOLO 摄像头监控项目',
      summary: 'RTSP 摄像头行人检测。',
      currentStageId: STAGE_IDS.REVIEW,
      requirementReview: { status: 'ready' },
      prdStatus: 'generated',
      requirementAnswers: completeYoloAnswers(),
      developmentRun: {
        status: 'completed',
        commitHash: 'abc123',
        changePackage: {
          status: 'ready-for-review',
          reviewGate: { canStartReview: true, blockers: [] },
        },
      },
      codeReviewReport: {
        status: 'needs-work',
        blockers: ['安全检查未通过：生产代码中疑似包含 RTSP 凭据。'],
        categories: [
          {
            id: 'security',
            status: 'failed',
            findings: [{ severity: 'high', file: 'src/monitoringState.js' }],
          },
        ],
        reviewGate: {
          canAdvanceToQa: false,
          blockers: ['安全检查未通过：生产代码中疑似包含 RTSP 凭据。'],
        },
      },
    });

    expect(chain.modules.find((module) => module.id === 'security-review')).toMatchObject({
      status: 'blocked',
      severity: 'critical',
      blockerCount: 1,
      nextAction: expect.stringContaining('修复'),
    });
    expect(chain.status).toBe('blocked');
  });

  test('tracks QA validation and final acceptance through completion', () => {
    const chain = createYoloDeliveryChain({
      id: 'yolo-monitor',
      name: 'YOLO 摄像头监控项目',
      summary: 'RTSP 摄像头行人检测。',
      currentStageId: STAGE_IDS.ACCEPTANCE,
      requirementReview: { status: 'ready' },
      prdStatus: 'generated',
      requirementAnswers: completeYoloAnswers(),
      developmentRun: {
        status: 'completed',
        commitHash: 'abc123',
        changePackage: {
          status: 'ready-for-review',
          reviewGate: { canStartReview: true, blockers: [] },
        },
      },
      codeReviewReport: {
        status: 'passed',
        commitHash: 'abc123',
        reviewGate: { canAdvanceToQa: true, blockers: [] },
      },
      qaEvidence: {
        status: 'ready',
        sampleSet: 'people/no-people/multi/occlusion/weak-light',
        durationMinutes: 45,
        environment: 'local RTSP test stream',
        browserScope: 'Chrome and Edge',
      },
      qaRun: {
        status: 'passed',
        passedCount: 8,
        totalCount: 8,
        falsePositiveRate: 0.18,
        defects: [],
      },
      acceptancePackage: {
        status: 'ready',
        signoffStatus: 'signed-off',
        signedOffBy: 'AA',
        archiveVersion: 'v2026.06-yolo-acceptance',
      },
    });

    expect(chain.status).toBe('complete');
    expect(chain.modules.map((module) => module.id)).toEqual([
      'pm-product',
      'ai-coding',
      'security-review',
      'qa-validation',
      'final-acceptance',
    ]);
    expect(chain.modules.find((module) => module.id === 'qa-validation')).toMatchObject({
      status: 'complete',
      evidence: expect.arrayContaining(['QA 8/8 通过', '误检率 18%']),
    });
    expect(chain.modules.find((module) => module.id === 'final-acceptance')).toMatchObject({
      status: 'complete',
      evidence: expect.arrayContaining(['签收人 AA', '归档版本 v2026.06-yolo-acceptance']),
    });
  });
});

function completeYoloAnswers() {
  return {
    users: '保安负责打开网页查看摄像头监控画面，负责人查看误检率和验收结果。',
    scenarios: '系统接入 RTSP 摄像头，实时识别 person 类别并展示行人标注框。',
    successMetrics: '测试样本包含有行人、无行人、多人、遮挡、弱光场景，总检测次数和误检次数按人工标注统计，误检率低于 30%。',
    scope: '本期包含网页端、RTSP 接入、YOLO 行人检测、标注框和页面提示，不包含移动 App、人脸识别和历史录像管理。',
    data: '不保存原始视频，默认只保存检测日志和误检率测试记录，截图保存需负责人审批，数据留存 30 天，桌面浏览器范围为 Chrome 和 Edge 最新两个稳定版本。',
    integrations: 'RTSP 地址由运维通过环境变量提供，YOLO 模型版本为 yolov8n-person，推理接口返回标注框 JSON，服务器配置为 4 核 CPU 或可选 GPU。',
  };
}
