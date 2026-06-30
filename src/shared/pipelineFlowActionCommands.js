export function resolvePipelineFlowActionCommand(action = {}, pipelineStage = {}) {
  const actionId = action.id || '';
  const label = action.label || '阶段动作';
  const stageId = firstWorkflowStageId(pipelineStage);
  const base = {
    actionId,
    label,
    runningMessage: `正在处理：${label}`,
    successMessage: `已提交：${label}`,
  };

  if (actionId === 'regenerate-prd') {
    return {
      ...base,
      handler: 'generatePrd',
      kind: 'existing-api',
    };
  }

  if (actionId === 'regenerate-development-package') {
    return {
      ...base,
      handler: 'generateDevelopmentPackage',
      kind: 'existing-api',
    };
  }

  if (actionId === 'submit-gate-confirmation') {
    return {
      ...base,
      handler: 'advanceStage',
      kind: 'existing-api',
    };
  }

  if (actionId.startsWith('complete-artifact-')) {
    return {
      ...base,
      handler: 'openStageDetail',
      kind: 'manual',
      message: `请在阶段确认区${label}。`,
      stageId,
    };
  }

  if (actionId === 'wait-prerequisite') {
    return {
      ...base,
      handler: 'inspectPrerequisite',
      kind: 'navigation',
      message: '请先检查前置阶段的产物和闸口状态。',
      stageId,
    };
  }

  return {
    ...base,
    handler: 'unsupported',
    kind: 'unsupported',
    message: '该动作暂未接入后台执行入口。',
  };
}

function firstWorkflowStageId(pipelineStage = {}) {
  return Array.isArray(pipelineStage.workflowStageIds) ? pipelineStage.workflowStageIds[0] || '' : '';
}
