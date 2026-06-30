import { describe, expect, test } from 'vitest';
import { createProject, STAGE_IDS, updateStageConfirmationForProject } from './workflow.js';
import { createDeliveryGateAudit, createStageGateReport } from './stageGate.js';

describe('stage gate report', () => {
  test('blocks advancement when current-stage confirmation tasks are still open', () => {
    const project = createProject({
      name: 'Camera monitor',
      sponsor: 'AA',
      summary: 'Detect pedestrians from an RTSP camera stream.',
    });

    const report = createStageGateReport(project);

    expect(report).toMatchObject({
      projectId: project.id,
      stageId: STAGE_IDS.INTAKE,
      status: 'blocked',
      canAdvance: false,
      nextStageId: STAGE_IDS.PM_REQUIREMENTS,
      openTaskCount: 2,
      blockerCount: 1,
    });
    expect(report.blockers).toEqual([
      expect.objectContaining({
        id: 'stage-confirmations',
        type: 'confirmation',
        severity: 'high',
        missingItemIds: expect.arrayContaining(['business-goal', 'scope-seed']),
        taskIds: expect.arrayContaining(['intake-business-goal', 'intake-scope-seed']),
      }),
    ]);
    expect(report.requiredActions).toEqual(
      expect.arrayContaining([expect.stringContaining('2 current-stage confirmation')]),
    );
  });

  test('blocks PM handoff until requirement quality and PRD are ready', () => {
    const project = markStageConfirmed(
      {
        ...createProject({
          name: 'Camera monitor',
          sponsor: 'AA',
          summary: 'Detect pedestrians from an RTSP camera stream.',
        }),
        currentStageId: STAGE_IDS.PM_REQUIREMENTS,
      },
      STAGE_IDS.PM_REQUIREMENTS,
    );

    const report = createStageGateReport(project);

    expect(report).toMatchObject({
      stageId: STAGE_IDS.PM_REQUIREMENTS,
      status: 'blocked',
      canAdvance: false,
      openTaskCount: 0,
      blockerCount: 1,
    });
    expect(report.blockers).toEqual([
      expect.objectContaining({
        id: 'prd-approval-readiness',
        type: 'artifact',
        severity: 'high',
        details: expect.objectContaining({
          prdStatus: 'draft',
          requirementReviewStatus: 'missing',
        }),
      }),
    ]);
  });

  test('audits the whole delivery gate chain and prioritizes QA return blockers', () => {
    const project = {
      ...markStageConfirmed(
        markStageConfirmed(
          createProject({
            name: 'Camera monitor',
            sponsor: 'AA',
            summary: 'Detect pedestrians from an RTSP camera stream.',
          }),
          STAGE_IDS.INTAKE,
        ),
        STAGE_IDS.PM_REQUIREMENTS,
      ),
      currentStageId: STAGE_IDS.QA,
      requirementReview: { status: 'ready' },
      prdStatus: 'generated',
      prdApprovalReady: true,
      technicalHandoffStatus: 'generated',
      artifacts: {
        [STAGE_IDS.PRD_APPROVAL]: '# PRD',
        [STAGE_IDS.ARCHITECTURE]: '# Architecture',
        [STAGE_IDS.DEVELOPMENT]: '# Development handoff',
        [STAGE_IDS.OPS_REQUIREMENTS]: '# Ops handoff',
        [STAGE_IDS.QA]: '# QA handoff',
      },
      developmentRun: {
        status: 'completed',
        commitHash: 'abc123',
        checks: [{ command: 'npm test', status: 'passed' }],
      },
      codeReviewReport: { status: 'passed' },
      qaEvidence: {
        status: 'incomplete',
        missingFields: ['durationMinutes'],
      },
      qaRun: {
        status: 'needs-work',
        passedCount: 1,
        totalCount: 2,
        defectRouting: {
          shouldReturnToDevelopment: true,
          targetStageId: STAGE_IDS.DEVELOPMENT,
        },
      },
    };

    const audit = createDeliveryGateAudit(project);

    expect(audit).toMatchObject({
      projectId: project.id,
      status: 'qa-return',
      completionPercent: 60,
      completedGateCount: 6,
      totalGateCount: 10,
      blockedGateCount: 1,
      missingGateCount: 3,
      currentGateId: 'qa',
      currentGateLabel: '测试验证',
      nextAction: '将 QA 缺陷回流到开发，并重新生成修复计划。',
    });
    expect(audit.gates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'requirements', status: 'complete' }),
        expect.objectContaining({ id: 'technical-handoff', status: 'complete' }),
        expect.objectContaining({ id: 'qa-evidence', status: 'missing' }),
        expect.objectContaining({ id: 'qa', status: 'blocked' }),
      ]),
    );
  });

  test('groups delivery gate handoffs by responsible role with the next blocked or missing gate', () => {
    const project = {
      ...markStageConfirmed(
        markStageConfirmed(
          createProject({
            name: 'Camera monitor',
            sponsor: 'AA',
            summary: 'Detect pedestrians from an RTSP camera stream.',
          }),
          STAGE_IDS.INTAKE,
        ),
        STAGE_IDS.PM_REQUIREMENTS,
      ),
      currentStageId: STAGE_IDS.QA,
      requirementReview: { status: 'ready' },
      prdStatus: 'generated',
      prdApprovalReady: true,
      technicalHandoffStatus: 'generated',
      artifacts: {
        [STAGE_IDS.PRD_APPROVAL]: '# PRD',
        [STAGE_IDS.ARCHITECTURE]: '# Architecture',
        [STAGE_IDS.DEVELOPMENT]: '# Development handoff',
        [STAGE_IDS.OPS_REQUIREMENTS]: '# Ops handoff',
        [STAGE_IDS.QA]: '# QA handoff',
      },
      developmentRun: {
        status: 'completed',
        commitHash: 'abc123',
        checks: [{ command: 'npm test', status: 'passed' }],
      },
      codeReviewReport: { status: 'passed' },
      qaEvidence: {
        status: 'incomplete',
        missingFields: ['durationMinutes'],
      },
      qaRun: {
        status: 'needs-work',
        passedCount: 1,
        totalCount: 2,
        defectRouting: {
          shouldReturnToDevelopment: true,
          targetStageId: STAGE_IDS.DEVELOPMENT,
        },
      },
    };

    const audit = createDeliveryGateAudit(project);

    expect(audit.roleHandoffs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          role: 'qa',
          status: 'blocked',
          gateCount: 2,
          completedGateCount: 0,
          blockedGateCount: 1,
          missingGateCount: 1,
          currentGateId: 'qa',
          gateIds: ['qa-evidence', 'qa'],
          nextAction: expect.stringContaining('QA'),
        }),
        expect.objectContaining({
          role: 'tech-lead',
          status: 'complete',
          gateCount: 2,
          completedGateCount: 2,
          blockedGateCount: 0,
          missingGateCount: 0,
          currentGateId: '',
          gateIds: ['technical-handoff', 'review'],
        }),
        expect.objectContaining({
          role: 'owner',
          status: 'missing',
          gateCount: 3,
          completedGateCount: 1,
          blockedGateCount: 0,
          missingGateCount: 2,
          currentGateId: 'acceptance',
          gateIds: ['prd', 'acceptance', 'signoff'],
        }),
      ]),
    );
    expect(audit.roleHandoffSummary).toMatchObject({
      totalRoleCount: expect.any(Number),
      blockedRoleCount: 1,
      missingRoleCount: expect.any(Number),
      completedRoleCount: expect.any(Number),
      currentRole: 'qa',
    });
  });

  test('marks the delivery audit signed off only after final owner signoff', () => {
    const project = {
      ...createProject({
        name: 'Camera monitor',
        sponsor: 'AA',
        summary: 'Detect pedestrians from an RTSP camera stream.',
      }),
      requirementReview: { status: 'ready' },
      prdStatus: 'generated',
      technicalHandoffStatus: 'generated',
      artifacts: {
        [STAGE_IDS.PRD_APPROVAL]: '# PRD',
        [STAGE_IDS.ARCHITECTURE]: '# Architecture',
        [STAGE_IDS.DEVELOPMENT]: '# Development handoff',
        [STAGE_IDS.OPS_REQUIREMENTS]: '# Ops handoff',
        [STAGE_IDS.QA]: '# QA handoff',
      },
      developmentRun: { status: 'completed', commitHash: 'abc123' },
      codeReviewReport: { status: 'passed' },
      qaEvidence: { status: 'ready' },
      qaRun: { status: 'passed', passedCount: 2, totalCount: 2 },
      acceptancePackage: {
        status: 'ready',
        signoffStatus: 'signed-off',
      },
    };

    const audit = createDeliveryGateAudit(project);

    expect(audit).toMatchObject({
      status: 'signed-off',
      completionPercent: 100,
      completedGateCount: 10,
      currentGateId: 'signoff',
      nextAction: '项目已签收，归档交付证据并持续观察生产准备状态。',
    });
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
