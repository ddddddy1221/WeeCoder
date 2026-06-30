import { describe, expect, test } from 'vitest';
import { createProjectTaskLedger } from './taskLedger.js';

const users = [
  {
    id: 'qa-zhao',
    name: 'Zhao QA',
    role: 'qa',
    roleLabel: 'QA',
    actor: 'Zhao QA',
  },
];

describe('project task ledger', () => {
  test('creates formal task records with resolution evidence and comments', () => {
    const ledger = createProjectTaskLedger(
      {
        id: 'camera-monitor',
        name: 'YOLO camera monitor',
        updatedAt: '2026-06-17T00:30:00.000Z',
        stages: [{ id: 'qa', name: 'QA' }],
        members: {
          qa: 'qa-zhao',
        },
        stageConfirmations: {
          qa: {
            stageId: 'qa',
            stageName: 'QA',
            items: [
              {
                id: 'test-samples',
                title: 'Test samples',
                description: 'Confirm sample coverage.',
                required: true,
                value: 'Prepared five RTSP sample groups.',
                status: 'confirmed',
                confirmedBy: 'Zhao QA',
                confirmedAt: '2026-06-17T01:00:00.000Z',
              },
              {
                id: 'browser-scope',
                title: 'Browser scope',
                description: 'Confirm desktop browser coverage.',
                required: true,
                value: '',
                status: 'missing',
              },
            ],
            missingItems: [
              {
                id: 'browser-scope',
                title: 'Browser scope',
                description: 'Confirm desktop browser coverage.',
              },
            ],
          },
        },
        history: [
          {
            type: 'task-comment-added',
            actor: 'Zhao QA',
            followupTaskId: 'qa-test-samples',
            stageId: 'qa',
            itemId: 'test-samples',
            comment: 'Confirmed sample source.',
            note: 'Task comment: Confirmed sample source.',
            at: '2026-06-17T03:00:00.000Z',
          },
          {
            type: 'task-comment-added',
            actor: 'Zhao QA',
            stageId: 'qa',
            itemId: 'browser-scope',
            comment: 'Waiting on browser policy.',
            at: '2026-06-17T02:00:00.000Z',
          },
          {
            type: 'task-comment-added',
            actor: 'Zhao QA',
            followupTaskId: 'qa-unrelated',
            stageId: 'qa',
            itemId: 'unrelated',
            comment: 'Unrelated comment.',
            at: '2026-06-17T04:00:00.000Z',
          },
        ],
      },
      { users },
    );

    expect(ledger).toMatchObject({
      projectId: 'camera-monitor',
      projectName: 'YOLO camera monitor',
      totalTaskCount: 2,
      openTaskCount: 1,
      resolvedTaskCount: 1,
      commentCount: 2,
    });

    expect(ledger.tasks).toEqual([
      expect.objectContaining({
        id: 'qa-test-samples',
        followupTaskId: 'qa-test-samples',
        projectId: 'camera-monitor',
        projectName: 'YOLO camera monitor',
        stageId: 'qa',
        stageName: 'QA',
        itemId: 'test-samples',
        status: 'resolved',
        assigneeUserId: 'qa-zhao',
        assigneeName: 'Zhao QA',
        resolvedAt: '2026-06-17T01:00:00.000Z',
        resolvedBy: 'Zhao QA',
        resolutionSummary: 'Prepared five RTSP sample groups.',
        commentCount: 1,
        updatedAt: '2026-06-17T03:00:00.000Z',
      }),
      expect.objectContaining({
        id: 'qa-browser-scope',
        followupTaskId: 'qa-browser-scope',
        projectId: 'camera-monitor',
        projectName: 'YOLO camera monitor',
        stageId: 'qa',
        stageName: 'QA',
        itemId: 'browser-scope',
        status: 'open',
        assigneeUserId: 'qa-zhao',
        assigneeName: 'Zhao QA',
        commentCount: 1,
        updatedAt: '2026-06-17T02:00:00.000Z',
      }),
    ]);

    expect(ledger.tasks[0].comments).toEqual([
      {
        actor: 'Zhao QA',
        at: '2026-06-17T03:00:00.000Z',
        comment: 'Confirmed sample source.',
        note: 'Task comment: Confirmed sample source.',
      },
    ]);
    expect(ledger.tasks[1].comments).toEqual([
      {
        actor: 'Zhao QA',
        at: '2026-06-17T02:00:00.000Z',
        comment: 'Waiting on browser policy.',
        note: '',
      },
    ]);
  });
});
