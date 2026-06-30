import { describe, expect, test } from 'vitest';
import { createProject, STAGE_IDS, updateStageConfirmationForProject } from './workflow.js';
import { createProjectResponsibilityMatrix } from './projectResponsibilityMatrix.js';

describe('project responsibility matrix', () => {
  test('summarizes the current accountable role and actionable blockers for a new project', () => {
    const project = createProject({
      name: 'Camera monitor',
      sponsor: 'AA',
      summary: 'Detect pedestrians from an RTSP camera stream.',
    });

    const matrix = createProjectResponsibilityMatrix(project);

    expect(matrix).toMatchObject({
      projectId: project.id,
      projectName: 'Camera monitor',
      status: 'blocked',
      currentStageId: STAGE_IDS.INTAKE,
      currentRole: 'owner',
      currentAssigneeUserId: 'owner-aa',
      currentAssigneeName: 'AA',
      currentOpenTaskCount: 2,
      currentBlockerCount: 1,
      totalStageCount: project.stages.length,
      activeStageCount: 1,
      blockedStageCount: 1,
      nextAction: '负责人需要处理项目入口的 2 个待办，并解除 1 个闸口阻塞。',
    });
    expect(matrix.rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          stageId: STAGE_IDS.INTAKE,
          role: 'owner',
          assigneeUserId: 'owner-aa',
          assigneeName: 'AA',
          status: 'blocked',
          gateStatus: 'blocked',
          openTaskCount: 2,
          blockerCount: 1,
          isCurrent: true,
        }),
        expect.objectContaining({
          stageId: STAGE_IDS.PM_REQUIREMENTS,
          role: 'pm',
          assigneeUserId: 'pm-lin',
          status: 'queued',
          gateStatus: 'queued',
          openTaskCount: 0,
        }),
      ]),
    );
  });

  test('moves accountability to the active PM stage and keeps future stages queued', () => {
    const project = {
      ...markStageConfirmed(
        createProject({
          name: 'Camera monitor',
          sponsor: 'AA',
          summary: 'Detect pedestrians from an RTSP camera stream.',
        }),
        STAGE_IDS.INTAKE,
      ),
      currentStageId: STAGE_IDS.PM_REQUIREMENTS,
    };

    const matrix = createProjectResponsibilityMatrix({
      ...project,
      stages: project.stages.map((stage) => {
        if (stage.id === STAGE_IDS.INTAKE) {
          return { ...stage, status: 'approved' };
        }
        if (stage.id === STAGE_IDS.PM_REQUIREMENTS) {
          return { ...stage, status: 'active' };
        }
        return stage;
      }),
    });

    expect(matrix).toMatchObject({
      status: 'blocked',
      currentStageId: STAGE_IDS.PM_REQUIREMENTS,
      currentRole: 'pm',
      currentAssigneeUserId: 'pm-lin',
      currentOpenTaskCount: 5,
      currentBlockerCount: 2,
      activeStageCount: 1,
      blockedStageCount: 1,
      completedStageCount: 1,
      nextAction: '项目经理需要处理项目经理需求的 5 个待办，并解除 2 个闸口阻塞。',
    });
    expect(matrix.rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          stageId: STAGE_IDS.INTAKE,
          status: 'complete',
          gateStatus: 'completed',
          openTaskCount: 0,
        }),
        expect.objectContaining({
          stageId: STAGE_IDS.PM_REQUIREMENTS,
          role: 'pm',
          assigneeUserId: 'pm-lin',
          status: 'blocked',
          gateStatus: 'blocked',
          openTaskCount: 5,
          blockerCount: 2,
          isCurrent: true,
        }),
        expect.objectContaining({
          stageId: STAGE_IDS.DEVELOPMENT,
          role: 'ai-dev',
          assigneeUserId: 'ai-dev-bot',
          status: 'queued',
          gateStatus: 'queued',
        }),
      ]),
    );
  });
});

function markStageConfirmed(project, stageId) {
  return project.stageConfirmations[stageId].items.reduce(
    (current, item) =>
      updateStageConfirmationForProject(current, {
        actor: 'Test owner',
        stageId,
        itemId: item.id,
        value: `${item.title} confirmed.`,
      }),
    project,
  );
}
