import { describe, expect, test } from 'vitest';
import {
  createStageConfirmationRegister,
  createStageConfirmationFollowupTasks,
  getStageConfirmationSummary,
  normalizeStageConfirmationRegister,
  updateStageConfirmationItem,
} from './stageConfirmations.js';

describe('stage confirmation register', () => {
  test('creates required confirmation items for delivery-critical stages', () => {
    const register = createStageConfirmationRegister([
      { id: 'architecture', name: '架构与数据设计', owner: '技术负责人' },
      { id: 'ops-requirements', name: '运维需求', owner: '运维' },
      { id: 'qa', name: '测试', owner: '测试' },
    ]);

    expect(register.architecture.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'data-model', title: '数据库与数据模型' }),
        expect.objectContaining({ id: 'api-contract', title: 'API 与服务契约' }),
      ]),
    );
    expect(register['ops-requirements'].items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'rtsp-access', title: 'RTSP 接入凭据' }),
      ]),
    );
    expect(register.qa.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'test-samples', title: '测试样本与时长' }),
      ]),
    );
    expect(register.qa.status).toBe('incomplete');
  });

  test('marks one item confirmed and keeps the remaining gaps visible', () => {
    const register = createStageConfirmationRegister([{ id: 'qa', name: '测试', owner: '测试' }]);
    const updated = updateStageConfirmationItem(register, {
      stageId: 'qa',
      itemId: 'test-samples',
      value: '有行人、无人、多人、遮挡、弱光样本各 10 分钟。',
      actor: '测试',
      confirmedAt: '2026-06-17T00:00:00.000Z',
    });
    const summary = getStageConfirmationSummary(updated, 'qa');

    expect(summary.completedCount).toBe(1);
    expect(summary.totalCount).toBeGreaterThan(1);
    expect(summary.missingItems.map((item) => item.id)).not.toContain('test-samples');
    expect(summary.items.find((item) => item.id === 'test-samples')).toMatchObject({
      status: 'confirmed',
      confirmedBy: '测试',
      confirmedAt: '2026-06-17T00:00:00.000Z',
    });
    expect(summary.followups.map((item) => item.itemId)).not.toContain('test-samples');
    expect(summary.followups).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          itemId: 'false-positive-metric',
          targetRole: 'qa',
          targetRoleLabel: '测试',
          question: expect.stringContaining('误检率统计口径'),
          expectedAnswer: expect.stringContaining('误检次数'),
        }),
      ]),
    );
  });

  test('generates actionable follow-up prompts for missing stage confirmations', () => {
    const register = createStageConfirmationRegister([
      { id: 'ops-requirements', name: '运维需求', owner: '运维' },
    ]);
    const summary = getStageConfirmationSummary(register, 'ops-requirements');

    expect(summary.followups).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'ops-requirements-rtsp-access',
          itemId: 'rtsp-access',
          targetRole: 'ops',
          targetRoleLabel: '运维',
          question: expect.stringContaining('RTSP 接入凭据'),
          expectedAnswer: expect.stringContaining('RTSP 地址'),
        }),
      ]),
    );
  });

  test('derives open follow-up tasks with project assignees for missing confirmations', () => {
    const register = createStageConfirmationRegister([
      { id: 'ops-requirements', name: '运维需求', owner: '运维' },
    ]);
    const project = {
      members: {
        ops: 'ops-wang',
      },
      stageConfirmations: register,
    };

    const tasks = createStageConfirmationFollowupTasks(project, 'ops-requirements');

    expect(tasks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'ops-requirements-rtsp-access',
          stageId: 'ops-requirements',
          itemId: 'rtsp-access',
          status: 'open',
          targetRole: 'ops',
          targetRoleLabel: '运维',
          assigneeUserId: 'ops-wang',
          assigneeName: '王运维',
          question: expect.stringContaining('RTSP 接入凭据'),
          expectedAnswer: expect.stringContaining('RTSP 地址'),
        }),
      ]),
    );
  });

  test('omits resolved follow-up tasks by default and includes them when requested', () => {
    const register = createStageConfirmationRegister([{ id: 'qa', name: '测试', owner: '测试' }]);
    const updated = updateStageConfirmationItem(register, {
      stageId: 'qa',
      itemId: 'test-samples',
      value: '样本清单已经确认。',
      actor: '测试',
      confirmedAt: '2026-06-17T00:00:00.000Z',
    });
    const project = {
      members: {
        qa: 'qa-zhao',
      },
      stageConfirmations: updated,
    };

    expect(createStageConfirmationFollowupTasks(project, 'qa').map((task) => task.itemId)).not.toContain(
      'test-samples',
    );

    expect(createStageConfirmationFollowupTasks(project, 'qa', { includeResolved: true })).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          itemId: 'test-samples',
          status: 'resolved',
          resolvedAt: '2026-06-17T00:00:00.000Z',
          resolvedBy: '测试',
          resolutionSummary: '样本清单已经确认。',
          assigneeUserId: 'qa-zhao',
          assigneeName: '赵测试',
        }),
      ]),
    );
  });

  test('normalizes legacy or partial registers without losing existing answers', () => {
    const register = normalizeStageConfirmationRegister(
      {
        qa: {
          items: [
            {
              id: 'test-samples',
              value: '保留历史测试样本说明',
              confirmedBy: 'QA',
            },
          ],
        },
      },
      [{ id: 'qa', name: '测试', owner: '测试' }],
    );

    expect(register.qa.items.find((item) => item.id === 'test-samples')).toMatchObject({
      status: 'confirmed',
      value: '保留历史测试样本说明',
      confirmedBy: 'QA',
    });
    expect(register.qa.missingItems.length).toBeGreaterThan(0);
  });
});
