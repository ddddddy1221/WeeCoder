import { describe, expect, test } from 'vitest';
import { createProjectHealthReport, createProjectHealthPortfolio } from './projectHealth.js';

describe('project health scoring', () => {
  test('scores blocked projects from stage gates, risk register, SLA, jobs, and open tasks', () => {
    const report = createProjectHealthReport(
      {
        id: 'camera',
        name: 'Camera Monitor',
        currentStageId: 'pm-requirements',
        currentStageName: 'PM requirements',
        openFollowupTaskCount: 3,
        stageGateReport: {
          status: 'blocked',
          blockerCount: 2,
          openTaskCount: 3,
          requiredActions: ['Complete 2 current-stage confirmation task(s).'],
        },
        stageRiskRegister: {
          'pm-requirements': {
            riskLevel: 'high',
            recommendedActions: ['Clarify acceptance metrics before PRD approval.'],
          },
        },
      },
      {
        breachedSla: true,
        failedJobCount: 1,
      },
    );

    expect(report).toMatchObject({
      projectId: 'camera',
      projectName: 'Camera Monitor',
      stageId: 'pm-requirements',
      stageName: 'PM requirements',
      score: 6,
      level: 'critical',
      priority: 100,
      gateStatus: 'blocked',
      gateBlockerCount: 2,
      openTaskCount: 3,
      riskLevel: 'high',
      breachedSla: true,
      failedJobCount: 1,
      nextAction: 'Complete 2 current-stage confirmation task(s).',
    });
    expect(report.reasons).toEqual([
      'Stage gate blocked by 2 item(s).',
      'Current stage risk is high.',
      'SLA threshold breached.',
      '1 platform job(s) failed.',
      '3 open follow-up task(s).',
    ]);
  });

  test('summarizes portfolio health and sorts critical projects first', () => {
    const portfolio = createProjectHealthPortfolio(
      [
        {
          id: 'healthy',
          name: 'Healthy Project',
          currentStageId: 'intake',
          currentStageName: 'Intake',
          updatedAt: '2026-06-17T00:00:00.000Z',
          stageGateReport: { status: 'ready', blockerCount: 0, openTaskCount: 0 },
          stageRiskRegister: { intake: { riskLevel: 'low', recommendedActions: [] } },
        },
        {
          id: 'blocked',
          name: 'Blocked Project',
          currentStageId: 'qa',
          currentStageName: 'QA',
          updatedAt: '2026-06-10T00:00:00.000Z',
          openFollowupTaskCount: 1,
          stageGateReport: {
            status: 'blocked',
            blockerCount: 1,
            openTaskCount: 1,
            requiredActions: ['Run QA again.'],
          },
          stageRiskRegister: { qa: { riskLevel: 'medium', recommendedActions: [] } },
        },
      ],
      {
        jobs: [{ projectId: 'blocked', status: 'failed' }],
        sla: { breaches: [{ projectId: 'blocked' }] },
      },
    );

    expect(portfolio.summary).toMatchObject({
      totalProjects: 2,
      criticalCount: 1,
      warningCount: 0,
      healthyCount: 1,
    });
    expect(portfolio.projects.map((project) => project.projectId)).toEqual(['blocked', 'healthy']);
  });
});
