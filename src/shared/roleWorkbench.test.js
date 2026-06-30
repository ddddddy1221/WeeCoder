import { describe, expect, test } from 'vitest';
import { createRoleWorkbench } from './roleWorkbench.js';

const owner = {
  id: 'owner-aa',
  name: 'AA',
  role: 'owner',
  roleLabel: '负责人',
};

const pm = {
  id: 'pm-lin',
  name: '林项目经理',
  role: 'pm',
  roleLabel: '项目经理',
};

const projects = [
  {
    id: 'camera-monitor',
    name: 'YOLO 摄像头监控',
    currentStageId: 'pm-requirements',
    currentStageName: '项目经理需求',
    openFollowupTaskCount: 2,
  },
  {
    id: 'ops-console',
    name: '运维控制台',
    currentStageId: 'ops-requirements',
    currentStageName: '运维需求',
    openFollowupTaskCount: 1,
  },
];

describe('role workbench', () => {
  test('creates an owner workbench across all visible projects', () => {
    const workbench = createRoleWorkbench(projects, {
      currentUser: owner,
      roleInbox: {
        openTaskCount: 3,
        currentUserGroups: [
          {
            openTaskCount: 1,
            projects: [
              {
                projectId: 'camera-monitor',
                projectName: 'YOLO 摄像头监控',
                stageName: '项目经理需求',
                tasks: [{ id: 'owner-review', title: '确认 PRD 审批口径' }],
              },
            ],
          },
        ],
      },
    });

    expect(workbench).toMatchObject({
      mode: 'owner',
      isOrganizationOwner: true,
      visibleProjectCount: 2,
      openTaskCount: 1,
      projectCount: 1,
      recommendedProjectId: 'camera-monitor',
    });
    expect(workbench.tasks).toEqual([
      expect.objectContaining({
        id: 'owner-review',
        projectId: 'camera-monitor',
        projectName: 'YOLO 摄像头监控',
        stageName: '项目经理需求',
      }),
    ]);
  });

  test('creates a personal workbench from the authenticated user task queue', () => {
    const workbench = createRoleWorkbench(projects, {
      currentUser: pm,
      personalTaskQueue: {
        openTaskCount: 2,
        projectCount: 1,
        tasks: [
          {
            id: 'pm-target-users',
            projectId: 'camera-monitor',
            projectName: 'YOLO 摄像头监控',
            stageId: 'pm-requirements',
            stageName: '项目经理需求',
            title: '补充目标用户与核心场景',
          },
          {
            id: 'pm-success-metrics',
            projectId: 'camera-monitor',
            projectName: 'YOLO 摄像头监控',
            stageId: 'pm-requirements',
            stageName: '项目经理需求',
            title: '补充成功指标与验收口径',
          },
        ],
      },
      roleInbox: {
        currentUserGroups: [],
      },
    });

    expect(workbench).toMatchObject({
      mode: 'personal',
      isOrganizationOwner: false,
      visibleProjectCount: 2,
      openTaskCount: 2,
      projectCount: 1,
      recommendedProjectId: 'camera-monitor',
    });
    expect(workbench.tasks.map((task) => task.title)).toEqual([
      '补充目标用户与核心场景',
      '补充成功指标与验收口径',
    ]);
  });

  test('summarizes role-specific focus, urgency, and next action', () => {
    const workbench = createRoleWorkbench(projects, {
      currentUser: {
        id: 'qa-zhao',
        name: 'Zhao QA',
        role: 'qa',
        roleLabel: 'QA',
      },
      personalTaskQueue: {
        openTaskCount: 3,
        projectCount: 2,
        tasks: [
          {
            id: 'qa-evidence',
            projectId: 'camera-monitor',
            projectName: 'Camera Monitor',
            stageId: 'qa-validation',
            stageName: 'QA validation',
            title: 'Collect QA evidence',
            priorityContext: {
              gateStatus: 'blocked',
              healthLevel: 'critical',
              priority: 95,
              nextAction: 'Attach QA evidence before release.',
            },
          },
          {
            id: 'qa-smoke',
            projectId: 'ops-console',
            projectName: 'Ops Console',
            stageId: 'qa-validation',
            stageName: 'QA validation',
            title: 'Run smoke test',
            priorityContext: {
              healthLevel: 'warning',
              priority: 30,
            },
          },
        ],
      },
    });

    expect(workbench.roleSummary).toMatchObject({
      title: 'QA workbench',
      instruction:
        'Validate delivery quality, collect evidence, and route defects back to development.',
      scopeLabel: '2 projects / 3 open tasks',
      focusProjectName: 'Camera Monitor',
      focusStageName: 'QA validation',
      urgentTaskCount: 1,
      blockedProjectCount: 1,
      nextAction: 'Attach QA evidence before release.',
    });
  });

  test('returns role actions with permission gates for the focus task', () => {
    const workbench = createRoleWorkbench(projects, {
      currentUser: {
        id: 'qa-zhao',
        name: 'Zhao QA',
        role: 'qa',
        roleLabel: 'QA',
      },
      personalTaskQueue: {
        openTaskCount: 1,
        projectCount: 1,
        tasks: [
          {
            id: 'qa-evidence',
            projectId: 'camera-monitor',
            projectName: 'Camera Monitor',
            stageId: 'qa',
            stageName: 'QA',
            title: 'Collect QA evidence',
            priorityContext: {
              gateStatus: 'blocked',
              healthLevel: 'critical',
              priority: 95,
            },
          },
        ],
      },
    });

    expect(workbench.actions).toEqual([
      expect.objectContaining({
        id: 'focus-task',
        actionId: 'qa-evidence',
        label: 'Attach QA evidence',
        enabled: true,
        projectId: 'camera-monitor',
        projectName: 'Camera Monitor',
        taskId: 'qa-evidence',
        stageId: 'qa',
      }),
    ]);
    expect(workbench.permissionGates).toEqual([
      expect.objectContaining({
        actionId: 'qa-evidence',
        allowed: true,
        projectId: 'camera-monitor',
        projectName: 'Camera Monitor',
        role: 'qa',
      }),
    ]);
  });

  test('summarizes role handoff context for the current user queue', () => {
    const workbench = createRoleWorkbench(projects, {
      currentUser: {
        id: 'qa-zhao',
        name: 'Zhao QA',
        role: 'qa',
        roleLabel: 'QA',
      },
      personalTaskQueue: {
        openTaskCount: 2,
        projectCount: 1,
        tasks: [
          {
            id: 'qa-evidence',
            projectId: 'camera-monitor',
            projectName: 'Camera Monitor',
            stageId: 'qa',
            stageName: 'QA',
            title: 'Collect QA evidence',
            priorityContext: {
              gateStatus: 'blocked',
              healthLevel: 'critical',
              priority: 95,
              nextAction: 'Attach QA evidence before release.',
            },
          },
          {
            id: 'qa-browser-scope',
            projectId: 'camera-monitor',
            projectName: 'Camera Monitor',
            stageId: 'qa',
            stageName: 'QA',
            title: 'Confirm browser coverage',
            priorityContext: {
              gateStatus: 'ready',
              healthLevel: 'warning',
              priority: 30,
            },
          },
        ],
      },
    });

    expect(workbench.handoffSummary).toMatchObject({
      scope: 'personal',
      currentRole: 'qa',
      currentRoleLabel: 'QA',
      upstreamRole: 'tech-lead',
      upstreamRoleLabel: 'Tech Lead',
      downstreamRole: 'owner',
      downstreamRoleLabel: 'Owner',
      totalTaskCount: 2,
      activeProjectCount: 1,
      blockedTaskCount: 1,
      urgentTaskCount: 1,
      nextAction: 'Attach QA evidence before release.',
      lanes: [
        { role: 'tech-lead', roleLabel: 'Tech Lead', relation: 'upstream' },
        { role: 'qa', roleLabel: 'QA', relation: 'current', taskCount: 2 },
        { role: 'owner', roleLabel: 'Owner', relation: 'downstream' },
      ],
      projects: [
        expect.objectContaining({
          projectId: 'camera-monitor',
          projectName: 'Camera Monitor',
          stageName: 'QA',
          openTaskCount: 2,
          blockedTaskCount: 1,
          latestTaskTitle: 'Collect QA evidence',
        }),
      ],
    });
  });

  test('surfaces sent owner escalation messages as urgent personal tasks for the recipient', () => {
    const workbench = createRoleWorkbench(
      [
        {
          id: 'camera-monitor',
          name: 'Camera Monitor',
          currentStageId: 'pm-requirements',
          currentStageName: 'PM requirements',
          ownerEscalations: {
            'owner-escalation-pm-camera-monitor': {
              id: 'owner-escalation-pm-camera-monitor',
              status: 'sent',
              role: 'pm',
              roleLabel: 'PM',
              recipientUserId: 'pm-lin',
              recipientName: 'Lin PM',
              escalationLevel: 'escalated',
              overdueHours: 24,
              subject: 'Escalate PM handoff: Camera Monitor overdue 24h',
              body: 'PM: Camera Monitor is overdue by 24h. Collect RTSP sample evidence.',
              sentAt: '2026-06-18T05:00:00.000Z',
              sentBy: 'AA',
            },
          },
        },
      ],
      {
        currentUser: {
          id: 'pm-lin',
          name: 'Lin PM',
          role: 'pm',
          roleLabel: 'PM',
        },
        roleInbox: {
          currentUserGroups: [],
        },
      },
    );

    expect(workbench).toMatchObject({
      mode: 'personal',
      openTaskCount: 1,
      projectCount: 1,
      recommendedProjectId: 'camera-monitor',
    });
    expect(workbench.tasks).toEqual([
      expect.objectContaining({
        id: 'owner-escalation-pm-camera-monitor',
        type: 'owner-escalation',
        projectId: 'camera-monitor',
        projectName: 'Camera Monitor',
        stageId: 'pm-requirements',
        stageName: 'PM requirements',
        title: 'Escalate PM handoff: Camera Monitor overdue 24h',
        escalationMessageId: 'owner-escalation-pm-camera-monitor',
        status: 'sent',
        priorityContext: expect.objectContaining({
          gateStatus: 'blocked',
          healthLevel: 'critical',
          priority: 100,
          reason: 'PM: Camera Monitor is overdue by 24h. Collect RTSP sample evidence.',
          nextAction: 'Acknowledge the owner escalation and update the unblock plan.',
        }),
      }),
    ]);
    expect(workbench.roleSummary).toMatchObject({
      focusProjectName: 'Camera Monitor',
      urgentTaskCount: 1,
      blockedProjectCount: 1,
      nextAction: 'Acknowledge the owner escalation and update the unblock plan.',
    });
  });
});
