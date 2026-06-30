import { describe, expect, test } from 'vitest';
import {
  BUSINESS_SKILLS,
  createRequirementReviewArtifact,
  evaluateRequirementQuality,
  isPrdApprovalReady,
} from './deliverySkills.js';

const questions = [
  { id: 'users', label: '目标用户' },
  { id: 'scenarios', label: '核心场景' },
  { id: 'successMetrics', label: '成功指标' },
  { id: 'scope', label: '范围边界' },
  { id: 'data', label: '数据与权限' },
  { id: 'integrations', label: '外部依赖' },
];

describe('delivery business skills', () => {
  test('lists the skills used by the requirement to PRD flow', () => {
    expect(BUSINESS_SKILLS.map((skill) => skill.id)).toEqual([
      'requirement-clarification',
      'requirement-quality-review',
      'prd-draft-generation',
      'prd-approval-gate',
    ]);
  });

  test('flags missing requirement answers as blockers', () => {
    const review = evaluateRequirementQuality({
      requirementQuestions: questions,
      requirementAnswers: {
        users: '客户、客服、管理员',
      },
    });

    expect(review.status).toBe('needs-work');
    expect(review.completedCount).toBe(1);
    expect(review.totalCount).toBe(6);
    expect(review.missingQuestionIds).toEqual([
      'scenarios',
      'successMetrics',
      'scope',
      'data',
      'integrations',
    ]);
    expect(review.blockers[0].title).toBe('缺少关键需求信息');
  });

  test('marks complete and concrete requirements as ready', () => {
    const review = evaluateRequirementQuality({
      requirementQuestions: questions,
      requirementAnswers: completeAnswers(),
    });

    expect(review.status).toBe('ready');
    expect(review.completedCount).toBe(6);
    expect(review.missingQuestionIds).toEqual([]);
    expect(review.score).toBeGreaterThanOrEqual(85);
    expect(createRequirementReviewArtifact({ name: '售后工单系统' }, review)).toContain(
      '## 结论',
    );
  });

  test('blocks YOLO requirements that still contain project-manager placeholders', () => {
    const review = evaluateRequirementQuality({
      name: 'YOLO 摄像头监控项目',
      summary: '通过 RTSP 摄像头实时检测行人，误检率低于 30%。',
      requirementQuestions: questions,
      requirementAnswers: {
        users: '保安。',
        scenarios: '保安打开网页查看 RTSP 摄像头监控画面，系统识别行人并显示标注框。',
        successMetrics: '误检率低于 30%，测试视频样本、测试时长、测试环境待项目经理补充。',
        scope: '本期包含网页端、RTSP 接入、YOLO 行人检测，不包含移动 App。',
        data: '是否保存视频、截图或检测日志待项目经理补充。',
        integrations: 'RTSP 地址、账号、密码、YOLO 模型版本、推理硬件要求待项目经理补充。',
      },
    });

    expect(review.status).toBe('needs-work');
    expect(review.blockers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          title: 'YOLO 项目输入未补齐',
        }),
      ]),
    );
    expect(review.missingYoloInputIds).toEqual(
      expect.arrayContaining(['test-samples', 'data-retention', 'model-version', 'runtime-hardware']),
    );
  });

  test('detects whether a project can submit PRD approval', () => {
    const review = evaluateRequirementQuality({
      requirementQuestions: questions,
      requirementAnswers: completeAnswers(),
    });

    expect(
      isPrdApprovalReady({
        prdStatus: 'generated',
        requirementReview: review,
      }),
    ).toBe(true);
    expect(
      isPrdApprovalReady({
        prdStatus: 'draft',
        requirementReview: review,
      }),
    ).toBe(false);
    expect(
      isPrdApprovalReady({
        prdStatus: 'generated',
        requirementReview: { ...review, status: 'needs-work' },
      }),
    ).toBe(false);
  });
});

function completeAnswers() {
  return {
    users: '客户、客服专员、客服主管、系统管理员。',
    scenarios: '客户提交工单；客服分派、回复、关闭；主管查看超时工单。',
    successMetrics: '首次响应时间低于 10 分钟，工单关闭率达到 95%。',
    scope: '本期做 Web 后台和客户入口，不做移动 App，不做智能客服机器人。',
    data: '客户只能查看自己的工单，主管可查看团队数据，所有操作写入审计日志。',
    integrations: '对接订单系统、短信服务和企业微信通知。',
  };
}
