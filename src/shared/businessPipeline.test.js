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
