import { describe, expect, test } from 'vitest';
import {
  PIPELINE_CONDITIONAL_LOOPS,
  PIPELINE_STAGE_DEFINITIONS,
  createProjectPipelineView,
} from './businessPipeline.js';

describe('business pipeline metadata', () => {
  test('defines the latest 13-stage delivery pipeline with one conditional defect loop', () => {
    expect(PIPELINE_STAGE_DEFINITIONS).toHaveLength(13);
    expect(PIPELINE_STAGE_DEFINITIONS.map((stage) => stage.name)).toEqual([
      '需求提交 / BRD',
      '需求澄清',
      '需求文档生成与审批',
      'UI / 交互设计',
      'ERD / 技术设计',
      '运维需求',
      '代码编写与集成',
      '测试用例编写',
      '黑盒测试',
      '白盒测试 / 安全 / 质量审查',
      '运维脚本与发布准备',
      '运维部署',
      '最终验收',
    ]);
    expect(PIPELINE_CONDITIONAL_LOOPS).toEqual([
      expect.objectContaining({
        id: 'defect-loop',
        name: '缺陷回归',
        band: 'verification',
      }),
    ]);
  });

  test('groups pipeline stages into five business bands', () => {
    const view = createProjectPipelineView({
      currentStageId: 'architecture',
      stages: createWorkflowStages('architecture'),
    });

    expect(view.summary).toMatchObject({
      activeBandLabel: '设计带',
      activeStageName: 'UI / 交互设计',
      bandCount: 5,
      stageCount: 13,
    });
    expect(view.bands.map((band) => band.label)).toEqual([
      '需求带',
      '设计带',
      '构建带',
      '验证带',
      '发布带',
    ]);
    expect(view.bands.find((band) => band.id === 'design').stages.map((stage) => stage.name)).toEqual([
      'UI / 交互设计',
      'ERD / 技术设计',
      '运维需求',
    ]);
  });

  test('aggregates required artifacts and human gates for each business band', () => {
    const view = createProjectPipelineView({
      currentStageId: 'architecture',
      stages: createWorkflowStages('architecture'),
    });

    const designBand = view.bands.find((band) => band.id === 'design');
    expect(designBand).toMatchObject({
      artifactCount: 11,
      humanGateCount: 3,
      nextAction: '先补齐当前业务带的必要产物，再推动下一阶段流转。',
    });
    expect(designBand.requiredArtifacts).toEqual(
      expect.arrayContaining(['页面流程', 'ERD', '运行环境']),
    );
  });

  test('annotates each pipeline stage with status labels and readiness counts', () => {
    const view = createProjectPipelineView({
      currentStageId: 'architecture',
      stages: createWorkflowStages('architecture'),
    });

    expect(view.stages.find((stage) => stage.id === 'ui-interaction-design')).toMatchObject({
      artifactCount: 3,
      humanGateCount: 1,
      status: 'active',
      statusLabel: '进行中',
    });
    expect(view.stages.find((stage) => stage.id === 'ops-requirements')).toMatchObject({
      artifactCount: 4,
      humanGateCount: 1,
      status: 'approved',
      statusLabel: '已完成',
    });
  });

  test('adds an actionable next step for the active pipeline stage', () => {
    const view = createProjectPipelineView({
      currentStageId: 'architecture',
      stages: createWorkflowStages('architecture'),
    });

    expect(view.activeStage).toMatchObject({
      name: 'UI / 交互设计',
      nextAction: '补齐页面流程等必要产物，并完成产品 / 设计确认。',
    });
  });

  test('tracks required artifact readiness for each pipeline stage', () => {
    const view = createProjectPipelineView({
      artifacts: {
        architecture: '# 设计产物\n\n页面流程已生成。\n\n交互说明已补齐。',
      },
      currentStageId: 'architecture',
      stageConfirmations: {
        architecture: {
          missingItems: [{ id: 'wireframe', title: '线框图或截图' }],
        },
      },
      stages: createWorkflowStages('architecture').map((stage) =>
        stage.id === 'development' ? { ...stage, status: 'queued' } : stage,
      ),
    });

    expect(view.activeStage.artifacts).toEqual([
      { name: '页面流程', status: 'generated', statusLabel: '已生成' },
      { name: '交互说明', status: 'generated', statusLabel: '已生成' },
      { name: '线框图或截图', status: 'missing', statusLabel: '缺失' },
    ]);
    expect(view.stages.find((stage) => stage.id === 'ops-requirements').artifacts[0]).toMatchObject({
      name: '运行环境',
      status: 'approved',
      statusLabel: '已确认',
    });
    expect(view.stages.find((stage) => stage.id === 'implementation-integration').artifacts[0]).toMatchObject({
      name: '变更包',
      status: 'waiting',
      statusLabel: '等待前置',
    });
  });

  test('marks started downstream artifacts stale when the approved PRD becomes stale', () => {
    const view = createProjectPipelineView({
      artifacts: {
        development: '# 开发变更包\n\n变更包已生成。',
        qa: '# 测试用例\n\n功能用例已生成。',
      },
      currentStageId: 'development',
      prdChangeImpact: {
        status: 'stale',
        summary: 'PRD v1 已过期：范围边界 已变更。',
      },
      prdVersion: {
        label: 'v1',
        status: 'stale',
      },
      stages: createWorkflowStages('development').map((stage) =>
        stage.id === 'acceptance' ? { ...stage, status: 'queued' } : stage,
      ),
    });

    expect(view.stages.find((stage) => stage.id === 'implementation-integration').artifacts[0]).toMatchObject({
      name: '变更包',
      status: 'stale',
      statusLabel: '已过期',
    });
    expect(view.stages.find((stage) => stage.id === 'test-case-design').artifacts[0]).toMatchObject({
      name: '功能用例',
      status: 'stale',
      statusLabel: '已过期',
    });
    expect(view.stages.find((stage) => stage.id === 'deployment').artifacts[0]).toMatchObject({
      name: '部署记录',
      status: 'waiting',
      statusLabel: '等待前置',
    });
  });

  test('summarizes gate readiness from artifact states', () => {
    const blockedView = createProjectPipelineView({
      artifacts: {
        architecture: '# 设计产物\n\n页面流程已生成。',
      },
      currentStageId: 'architecture',
      stageConfirmations: {
        architecture: {
          missingItems: [{ id: 'wireframe', title: '线框图或截图' }],
        },
      },
      stages: createWorkflowStages('architecture'),
    });
    const staleView = createProjectPipelineView({
      artifacts: {
        development: '# 开发变更包\n\n变更包已生成。',
      },
      currentStageId: 'development',
      prdVersion: { label: 'v1', status: 'stale' },
      stages: createWorkflowStages('development').map((stage) =>
        stage.id === 'acceptance' ? { ...stage, status: 'queued' } : stage,
      ),
    });

    expect(blockedView.activeStage.gateSummary).toMatchObject({
      label: '闸口需处理',
      missingCount: 1,
      staleCount: 0,
      status: 'blocked',
    });
    expect(blockedView.activeStage.gateSummary.message).toBe('缺失 1 个必要产物。');
    expect(staleView.activeStage.gateSummary).toMatchObject({
      label: '闸口需重检',
      missingCount: 0,
      staleCount: 4,
      status: 'stale',
    });
    expect(staleView.stages.find((stage) => stage.id === 'deployment').gateSummary).toMatchObject({
      label: '等待前置',
      status: 'waiting',
      waitingCount: 4,
    });
  });

  test('recommends flow actions from gate readiness', () => {
    const blockedView = createProjectPipelineView({
      artifacts: {
        architecture: '# 设计产物\n\n页面流程已生成。',
      },
      currentStageId: 'architecture',
      stageConfirmations: {
        architecture: {
          missingItems: [{ id: 'wireframe', title: '线框图或截图' }],
        },
      },
      stages: createWorkflowStages('architecture'),
    });
    const staleView = createProjectPipelineView({
      artifacts: {
        development: '# 开发变更包\n\n变更包已生成。',
      },
      currentStageId: 'development',
      prdVersion: { label: 'v1', status: 'stale' },
      stages: createWorkflowStages('development').map((stage) =>
        stage.id === 'acceptance' ? { ...stage, status: 'queued' } : stage,
      ),
    });

    expect(blockedView.activeStage.flowActions).toEqual([
      expect.objectContaining({
        id: 'complete-artifact-wireframe',
        label: '补齐线框图或截图',
        type: 'manual',
      }),
    ]);
    expect(staleView.activeStage.flowActions).toEqual([
      expect.objectContaining({
        id: 'regenerate-prd',
        label: '重新生成需求文档',
        type: 'system',
      }),
      expect.objectContaining({
        id: 'regenerate-development-package',
        label: '重新生成开发任务包',
        type: 'system',
      }),
    ]);
    expect(staleView.stages.find((stage) => stage.id === 'deployment').flowActions[0]).toMatchObject({
      id: 'wait-prerequisite',
      label: '等待前置阶段完成',
      type: 'system',
    });
  });

  test('covers every current workflow stage without replacing the workflow engine', () => {
    const coveredWorkflowStageIds = new Set(
      [...PIPELINE_STAGE_DEFINITIONS, ...PIPELINE_CONDITIONAL_LOOPS].flatMap(
        (stage) => stage.workflowStageIds,
      ),
    );

    expect([...coveredWorkflowStageIds].sort()).toEqual([
      'acceptance',
      'architecture',
      'defect-loop',
      'development',
      'intake',
      'ops-requirements',
      'pm-requirements',
      'prd-approval',
      'qa',
      'review',
    ]);
  });

  test('marks selected workflow stage and its band as active', () => {
    const view = createProjectPipelineView(
      {
        currentStageId: 'qa',
        stages: createWorkflowStages('qa'),
      },
      { selectedStageId: 'review' },
    );

    expect(view.activeBand.label).toBe('验证带');
    expect(view.activeStage.name).toBe('白盒测试 / 安全 / 质量审查');
    expect(view.stages.find((stage) => stage.id === 'white-box-security-quality')).toMatchObject({
      status: 'active',
      ownerRole: '技术负责人',
    });
  });
});

function createWorkflowStages(activeStageId) {
  return [
    'intake',
    'pm-requirements',
    'prd-approval',
    'architecture',
    'ops-requirements',
    'development',
    'review',
    'qa',
    'defect-loop',
    'acceptance',
  ].map((id) => ({
    id,
    status: id === activeStageId ? 'active' : id === 'defect-loop' ? 'queued' : 'approved',
  }));
}
