import { describe, expect, test } from 'vitest';
import { createRoleInbox, filterRoleInbox } from './roleInbox.js';

describe('role inbox', () => {
  test('groups project follow-up assignments by assignee and highlights the current user queue', () => {
    const inbox = createRoleInbox(
      [
        {
          id: 'camera-monitor',
          name: 'YOLO camera monitor',
          currentStageId: 'qa',
          currentStageName: 'QA',
          followupTaskAssignments: [
            {
              targetRole: 'qa',
              targetRoleLabel: 'QA',
              assigneeUserId: 'qa-zhao',
              assigneeName: 'Zhao QA',
              openTaskCount: 2,
              tasks: [
                {
                  id: 'qa-test-samples',
                  followupTaskId: 'qa-test-samples',
                  stageId: 'qa',
                  itemId: 'test-samples',
                  title: 'Ask for test samples',
                  status: 'resolved',
                  resolvedAt: '2026-06-17T01:00:00.000Z',
                  resolvedBy: 'Zhao QA',
                  resolutionSummary: 'Prepared five RTSP sample groups.',
                  commentCount: 1,
                  updatedAt: '2026-06-17T03:00:00.000Z',
                },
                {
                  id: 'qa-browser-scope',
                  stageId: 'qa',
                  itemId: 'browser-scope',
                  title: 'Ask for browser scope',
                  status: 'open',
                },
              ],
            },
          ],
        },
        {
          id: 'portal',
          name: 'Customer portal',
          currentStageId: 'pm-requirements',
          currentStageName: 'PM requirements',
          followupTaskAssignments: [
            {
              targetRole: 'pm',
              targetRoleLabel: 'PM',
              assigneeUserId: 'pm-lin',
              assigneeName: 'Lin PM',
              openTaskCount: 1,
            },
          ],
        },
      ],
      { currentUserId: 'qa-zhao' },
    );

    expect(inbox.openTaskCount).toBe(3);
    expect(inbox.currentUserGroups).toEqual([
      expect.objectContaining({
        targetRole: 'qa',
        assigneeUserId: 'qa-zhao',
        assigneeName: 'Zhao QA',
        openTaskCount: 2,
        projects: [
          expect.objectContaining({
            projectId: 'camera-monitor',
            projectName: 'YOLO camera monitor',
            stageName: 'QA',
            openTaskCount: 2,
            tasks: [
              expect.objectContaining({
                projectId: 'camera-monitor',
                followupTaskId: 'qa-test-samples',
                stageId: 'qa',
                itemId: 'test-samples',
                title: 'Ask for test samples',
                status: 'resolved',
                resolvedAt: '2026-06-17T01:00:00.000Z',
                resolvedBy: 'Zhao QA',
                resolutionSummary: 'Prepared five RTSP sample groups.',
                commentCount: 1,
                updatedAt: '2026-06-17T03:00:00.000Z',
              }),
              expect.objectContaining({
                projectId: 'camera-monitor',
                stageId: 'qa',
                itemId: 'browser-scope',
                title: 'Ask for browser scope',
              }),
            ],
          }),
        ],
      }),
    ]);
    expect(inbox.groups.map((group) => group.assigneeUserId)).toEqual(['qa-zhao', 'pm-lin']);
  });

  test('filters inbox groups and recomputes visible task totals', () => {
    const inbox = {
      openTaskCount: 5,
      groups: [
        {
          assigneeUserId: 'qa-zhao',
          assigneeName: 'Zhao QA',
          openTaskCount: 2,
          isCurrentUser: true,
          projects: [],
        },
        {
          assigneeUserId: 'pm-lin',
          assigneeName: 'Lin PM',
          openTaskCount: 3,
          isCurrentUser: false,
          projects: [],
        },
      ],
      currentUserGroups: [],
    };

    expect(filterRoleInbox(inbox, 'mine')).toMatchObject({
      openTaskCount: 2,
      groups: [expect.objectContaining({ assigneeUserId: 'qa-zhao' })],
      currentUserGroups: [expect.objectContaining({ assigneeUserId: 'qa-zhao' })],
    });
    expect(filterRoleInbox(inbox, 'others')).toMatchObject({
      openTaskCount: 3,
      groups: [expect.objectContaining({ assigneeUserId: 'pm-lin' })],
      currentUserGroups: [],
    });
  });

  test('attaches project priority context to role tasks', () => {
    const inbox = createRoleInbox(
      [
        {
          id: 'camera-monitor',
          name: 'YOLO camera monitor',
          currentStageId: 'qa',
          currentStageName: 'QA',
          stageGateReport: {
            status: 'blocked',
            blockerCount: 2,
            stageName: 'QA',
            requiredActions: ['Collect QA test evidence.'],
          },
          projectHealth: {
            level: 'critical',
            score: 6,
            priority: 100,
            nextAction: 'Collect QA test evidence.',
            reasons: ['Stage gate blocked by 2 item(s).'],
          },
          followupTaskAssignments: [
            {
              targetRole: 'qa',
              targetRoleLabel: 'QA',
              assigneeUserId: 'qa-zhao',
              assigneeName: 'Zhao QA',
              openTaskCount: 1,
              tasks: [
                {
                  id: 'qa-test-samples',
                  stageId: 'qa',
                  title: 'Prepare test samples',
                  status: 'open',
                },
              ],
            },
          ],
        },
      ],
      { currentUserId: 'qa-zhao' },
    );

    const project = inbox.currentUserGroups[0].projects[0];

    expect(project.priorityContext).toEqual({
      healthLevel: 'critical',
      healthScore: 6,
      priority: 100,
      gateStatus: 'blocked',
      gateBlockerCount: 2,
      blockedStageName: 'QA',
      nextAction: 'Collect QA test evidence.',
      reason: 'Stage gate blocked by 2 item(s).',
    });
    expect(project.tasks[0].priorityContext).toEqual(project.priorityContext);
  });
});
