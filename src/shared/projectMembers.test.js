import { describe, expect, test } from 'vitest';
import {
  createDefaultProjectMembers,
  getProjectMemberUser,
  isUserAssignedToProjectRole,
  normalizeProjectMembers,
} from './projectMembers.js';
import { findUserById } from './users.js';

describe('project members', () => {
  test('creates a default assignee for each delivery role', () => {
    expect(createDefaultProjectMembers()).toMatchObject({
      owner: 'owner-aa',
      pm: 'pm-lin',
      'tech-lead': 'tech-chen',
      ops: 'ops-wang',
      'ai-dev': 'ai-dev-bot',
      'local-runner': 'runner-local',
      qa: 'qa-zhao',
    });
  });

  test('normalizes missing or invalid assignees back to role defaults', () => {
    expect(
      normalizeProjectMembers({
        owner: 'pm-lin',
        'tech-lead': 'tech-li',
      }),
    ).toMatchObject({
      owner: 'owner-aa',
      'tech-lead': 'tech-li',
      qa: 'qa-zhao',
    });
  });

  test('checks whether a user is assigned to a project role', () => {
    const project = {
      members: {
        ...createDefaultProjectMembers(),
        'tech-lead': 'tech-li',
      },
    };

    expect(isUserAssignedToProjectRole(project, findUserById('tech-li'), 'tech-lead')).toBe(true);
    expect(isUserAssignedToProjectRole(project, findUserById('tech-chen'), 'tech-lead')).toBe(false);
    expect(getProjectMemberUser(project, 'tech-lead')).toMatchObject({ id: 'tech-li' });
  });
});
