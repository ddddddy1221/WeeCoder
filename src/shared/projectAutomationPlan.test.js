import { describe, expect, test } from 'vitest';
import { createProjectAutomationPlan } from './projectAutomationPlan.js';
import { STAGE_IDS } from './workflow.js';

function baseProject(overrides = {}) {
  return {
    id: 'camera-monitor',
    name: 'yolo 摄像头监控项目',
    currentStageId: STAGE_IDS.DEVELOPMENT,
    repositoryConfig: {
      executionMode: 'codex-local',
      verificationCommands: ['npm test -- --runInBand'],
    },
    platformJobs: [],
    ...overrides,
  };
}

describe('createProjectAutomationPlan', () => {
  test('recommends the next development backend job with sandbox metadata', () => {
    const plan = createProjectAutomationPlan(
      baseProject({
        developmentPlan: {
          status: 'ready',
          summary: '实现 RTSP 接入、YOLO 推理和前端标注。',
        },
      }),
    );

    expect(plan).toMatchObject({
      projectId: 'camera-monitor',
      status: 'ready-to-queue',
      priority: 'normal',
      nextAction: '建议排队 AI 开发执行后台任务，并使用项目命令白名单运行验证命令。',
      recommendedJob: {
        type: 'ai-development',
        title: 'AI 开发执行',
        command: 'npm test -- --runInBand',
        source: 'project-automation-plan',
        details: {
          stageId: STAGE_IDS.DEVELOPMENT,
          sandboxPolicy: 'project-verification-command-allowlist',
          recommendedBy: 'project-automation-plan',
        },
      },
    });
  });

  test('adds YOLO chain metadata to AI Coding and review jobs', () => {
    const developmentPlan = createProjectAutomationPlan(
      baseProject({
        name: 'YOLO 摄像头监控项目',
        summary: '通过 RTSP 摄像头识别行人。',
      }),
    );

    expect(developmentPlan.recommendedJob.details).toMatchObject({
      workflowChain: 'yolo-camera-monitor',
      qualityGates: ['pm-product', 'ai-coding', 'security-review', 'qa'],
    });

    const reviewPlan = createProjectAutomationPlan(
      baseProject({
        name: 'YOLO 摄像头监控项目',
        summary: '通过 RTSP 摄像头识别行人。',
        currentStageId: STAGE_IDS.REVIEW,
        codeReviewReport: null,
      }),
    );

    expect(reviewPlan.recommendedJob.details).toMatchObject({
      workflowChain: 'yolo-camera-monitor',
      reviewScope: ['code-quality', 'security', 'performance'],
    });
  });

  test('prioritizes QA defect fix jobs and carries repair context', () => {
    const plan = createProjectAutomationPlan(
      baseProject({
        defectFixPackage: {
          status: 'ready',
          sourceCommitHash: 'c60351e',
          qaPassRate: '4/6',
          requiredFixes: ['补齐 RTSP 断流重连实现。'],
          regressionFocus: ['RTSP 断流恢复'],
        },
      }),
    );

    expect(plan).toMatchObject({
      status: 'ready-to-queue',
      priority: 'high',
      nextAction: '建议先排队测试缺陷修复后台任务，完成后回到代码评审和测试验证。',
      recommendedJob: {
        type: 'qa-defect-fix',
        title: '测试缺陷修复执行',
        command: 'npm test -- --runInBand',
        details: {
          defectFixSourceCommitHash: 'c60351e',
          qaPassRate: '4/6',
          requiredFixes: ['补齐 RTSP 断流重连实现。'],
          regressionFocus: ['RTSP 断流恢复'],
          sandboxPolicy: 'project-verification-command-allowlist',
        },
      },
    });
  });

  test('does not recommend duplicate queued or running jobs', () => {
    const plan = createProjectAutomationPlan(
      baseProject({
        platformJobs: [
          {
            id: 'job-ai-development',
            type: 'ai-development',
            title: 'AI 开发执行',
            status: 'running',
            command: 'npm test -- --runInBand',
          },
        ],
      }),
    );

    expect(plan).toMatchObject({
      status: 'waiting-existing-job',
      priority: 'normal',
      existingJob: {
        id: 'job-ai-development',
        type: 'ai-development',
        status: 'running',
      },
      recommendedJob: null,
      nextAction: '已有 AI 开发执行 后台任务正在排队或运行，先等待该任务产出执行证据。',
    });
  });

  test('blocks automatic queueing when the project has no verification command', () => {
    const plan = createProjectAutomationPlan(
      baseProject({
        repositoryConfig: { executionMode: 'codex-local', verificationCommands: [] },
      }),
    );

    expect(plan).toMatchObject({
      status: 'blocked',
      priority: 'high',
      recommendedJob: null,
      queueBlockedReason: '项目还没有配置仓库验证命令，无法创建可执行的后台任务。',
      nextAction: '请先在开发交接里配置仓库地址和验证命令，再排队 AI coding 后台任务。',
    });
  });
  test('blocks AI coding queueing when the PRD version is stale', () => {
    const plan = createProjectAutomationPlan(
      baseProject({
        prdVersion: {
          number: 1,
          label: 'v1',
          status: 'stale',
        },
        prdChangeImpact: {
          status: 'stale',
          version: 1,
          versionLabel: 'v1',
          summary: 'PRD v1 已过期：范围边界 已变更。',
          changedQuestionIds: ['scope'],
          requiredActions: ['重新运行智能需求评审', '重新生成需求文档草稿'],
        },
      }),
    );

    expect(plan).toMatchObject({
      status: 'blocked',
      priority: 'high',
      recommendedJob: null,
      queueBlockedReason: 'PRD v1 已过期：范围边界 已变更。',
      nextAction: '先重新运行智能需求评审并生成最新 PRD，再排队 AI coding 后台任务。',
    });
  });
});
