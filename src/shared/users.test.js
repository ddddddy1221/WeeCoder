import { describe, expect, test } from 'vitest';
import { APP_USERS, actorFromUser, findUserById, getDefaultUser } from './users.js';

describe('application users', () => {
  test('exposes stable demo users for each delivery role', () => {
    expect(APP_USERS.map((user) => user.id)).toEqual([
      'owner-aa',
      'pm-lin',
      'tech-chen',
      'tech-li',
      'ops-wang',
      'ai-dev-bot',
      'runner-local',
      'qa-zhao',
    ]);
    expect(findUserById('tech-chen')).toMatchObject({
      id: 'tech-chen',
      role: 'tech-lead',
      actor: '技术负责人',
    });
  });

  test('falls back to the responsible owner when a user id is missing', () => {
    expect(getDefaultUser()).toMatchObject({ id: 'owner-aa', role: 'owner' });
    expect(findUserById('missing-user')).toBeNull();
  });

  test('uses the user actor name for audit history', () => {
    expect(actorFromUser(findUserById('qa-zhao'))).toBe('测试');
  });
});
