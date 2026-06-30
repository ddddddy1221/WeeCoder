import { describe, expect, test } from 'vitest';
import { resolvePipelineFlowActionCommand } from './pipelineFlowActionCommands.js';

describe('pipeline flow action commands', () => {
  test('maps regeneration actions to existing project handlers', () => {
    expect(resolvePipelineFlowActionCommand({ id: 'regenerate-prd', label: '重新生成需求文档' })).toMatchObject({
      handler: 'generatePrd',
      kind: 'existing-api',
      successMessage: '已提交：重新生成需求文档',
    });
    expect(
      resolvePipelineFlowActionCommand({
        id: 'regenerate-development-package',
        label: '重新生成开发任务包',
      }),
    ).toMatchObject({
      handler: 'generateDevelopmentPackage',
      kind: 'existing-api',
      successMessage: '已提交：重新生成开发任务包',
    });
  });

  test('maps manual completion and waiting actions to navigation feedback', () => {
    const pipelineStage = {
      workflowStageIds: ['architecture'],
    };

    expect(
      resolvePipelineFlowActionCommand(
        { id: 'complete-artifact-wireframe', label: '补齐线框图或截图' },
        pipelineStage,
      ),
    ).toMatchObject({
      handler: 'openStageDetail',
      kind: 'manual',
      message: '请在阶段确认区补齐线框图或截图。',
      stageId: 'architecture',
    });
    expect(
      resolvePipelineFlowActionCommand(
        { id: 'wait-prerequisite', label: '等待前置阶段完成' },
        pipelineStage,
      ),
    ).toMatchObject({
      handler: 'inspectPrerequisite',
      kind: 'navigation',
      message: '请先检查前置阶段的产物和闸口状态。',
      stageId: 'architecture',
    });
  });

  test('maps gate confirmation to the existing advance stage action', () => {
    expect(
      resolvePipelineFlowActionCommand({
        id: 'submit-gate-confirmation',
        label: '提交闸口确认',
      }),
    ).toMatchObject({
      handler: 'advanceStage',
      kind: 'existing-api',
      successMessage: '已提交：提交闸口确认',
    });
  });
});
