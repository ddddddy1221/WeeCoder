import { describe, expect, test } from 'vitest';
import { canPerformProjectAction, resolveActorRole } from './authorization.js';

describe('project action authorization', () => {
  test('maps common actor aliases to stable roles', () => {
    expect(resolveActorRole('PM')).toBe('pm');
    expect(resolveActorRole('项目经理')).toBe('pm');
    expect(resolveActorRole('Tech Lead')).toBe('tech-lead');
    expect(resolveActorRole('技术负责人')).toBe('tech-lead');
    expect(resolveActorRole('测试')).toBe('qa');
    expect(resolveActorRole('负责人')).toBe('owner');
  });

  test('allows only the responsible role to run code review', () => {
    const project = { currentStageId: 'review' };

    expect(canPerformProjectAction(project, 'run-code-review', '技术负责人')).toMatchObject({
      allowed: true,
      role: 'tech-lead',
    });
    expect(canPerformProjectAction(project, 'run-code-review', '项目经理')).toMatchObject({
      allowed: false,
      role: 'pm',
      reason: '当前角色无权执行代码/安全/性能 Review。',
    });
  });

  test('keeps QA execution restricted to QA roles', () => {
    const project = { currentStageId: 'qa' };

    expect(canPerformProjectAction(project, 'run-qa', '测试')).toMatchObject({ allowed: true });
    expect(canPerformProjectAction(project, 'run-qa', '负责人')).toMatchObject({
      allowed: false,
      reason: '当前角色无权执行 QA 测试。',
    });
  });

  test('allows stage confirmations only for the current stage owner roles', () => {
    expect(
      canPerformProjectAction(
        { currentStageId: 'ops-requirements' },
        'update-stage-confirmations',
        'ops',
      ),
    ).toMatchObject({ allowed: true, role: 'ops' });
    expect(
      canPerformProjectAction(
        { currentStageId: 'ops-requirements' },
        'update-stage-confirmations',
        'pm',
      ),
    ).toMatchObject({ allowed: false, role: 'pm' });
    expect(
      canPerformProjectAction({ currentStageId: 'qa' }, 'update-stage-confirmations', 'owner'),
    ).toMatchObject({ allowed: false, role: 'owner' });
  });

  test('allows ops and owner to update deployment environment readiness', () => {
    const project = { currentStageId: 'ops-requirements' };

    expect(
      canPerformProjectAction(project, 'update-deployment-environment', 'ops'),
    ).toMatchObject({
      allowed: true,
      role: 'ops',
    });
    expect(
      canPerformProjectAction(project, 'update-deployment-environment', 'owner'),
    ).toMatchObject({
      allowed: true,
      role: 'owner',
    });
    expect(
      canPerformProjectAction(project, 'update-deployment-environment', 'pm'),
    ).toMatchObject({
      allowed: false,
      role: 'pm',
      reason: '当前角色无权维护部署环境状态。',
    });
  });

  test('allows assigned project roles to acknowledge notifications', () => {
    const project = { currentStageId: 'pm-requirements' };

    expect(canPerformProjectAction(project, 'acknowledge-notification', 'pm')).toMatchObject({
      allowed: true,
      role: 'pm',
    });
    expect(canPerformProjectAction(project, 'acknowledge-notification', 'owner')).toMatchObject({
      allowed: true,
      role: 'owner',
    });
    expect(
      canPerformProjectAction(project, 'acknowledge-notification', 'external-reviewer'),
    ).toMatchObject({
      allowed: false,
      role: 'unknown',
      reason: '当前角色无权确认通知项。',
    });
  });

  test('splits notification action acknowledgement assignment and resolution permissions', () => {
    const project = { currentStageId: 'pm-requirements' };

    expect(
      canPerformProjectAction(project, 'acknowledge-notification-action', 'pm'),
    ).toMatchObject({
      allowed: true,
      role: 'pm',
    });
    expect(canPerformProjectAction(project, 'assign-notification-action', 'owner')).toMatchObject({
      allowed: true,
      role: 'owner',
    });
    expect(
      canPerformProjectAction(project, 'assign-notification-action', 'pm'),
    ).toMatchObject({
      allowed: false,
      role: 'pm',
      reason: '当前角色无权指派通知待办。',
    });
    expect(
      canPerformProjectAction(project, 'resolve-notification-action', 'qa'),
    ).toMatchObject({
      allowed: true,
      role: 'qa',
    });
  });

  test('limits owner escalation sending to organization owners', () => {
    const project = { currentStageId: 'pm-requirements' };

    expect(canPerformProjectAction(project, 'send-owner-escalation', 'owner')).toMatchObject({
      allowed: true,
      role: 'owner',
    });
    expect(canPerformProjectAction(project, 'send-owner-escalation', 'pm')).toMatchObject({
      allowed: false,
      role: 'pm',
      reason: '当前角色无权发送负责人升级提醒。',
    });
    expect(canPerformProjectAction(project, 'acknowledge-owner-escalation', 'pm')).toMatchObject({
      allowed: true,
      role: 'pm',
    });
  });
});
