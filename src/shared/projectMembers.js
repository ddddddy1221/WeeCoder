import { getRoleLabel } from './authorization.js';
import { APP_USERS, findUserById, selectUserForRole } from './users.js';

export const PROJECT_MEMBER_ROLE_IDS = Object.freeze([
  'owner',
  'pm',
  'tech-lead',
  'ops',
  'ai-dev',
  'local-runner',
  'qa',
]);

export function createDefaultProjectMembers(users = APP_USERS) {
  return Object.fromEntries(
    PROJECT_MEMBER_ROLE_IDS.map((roleId) => [
      roleId,
      selectUserForRole(roleId, users)?.id || '',
    ]),
  );
}

export function normalizeProjectMembers(members = {}, users = APP_USERS) {
  const defaults = createDefaultProjectMembers(users);
  return Object.fromEntries(
    PROJECT_MEMBER_ROLE_IDS.map((roleId) => {
      const user = findUserById(members?.[roleId], users);
      return [roleId, user?.role === roleId ? user.id : defaults[roleId]];
    }),
  );
}

export function getProjectMemberUser(project, roleId, users = APP_USERS) {
  const members = normalizeProjectMembers(project?.members, users);
  return findUserById(members[roleId], users);
}

export function isUserAssignedToProjectRole(project, user, roleId, users = APP_USERS) {
  if (!user || user.role !== roleId) {
    return false;
  }
  const assignedUser = getProjectMemberUser(project, roleId, users);
  return assignedUser?.id === user.id;
}

export function getProjectMemberRows(project, users = APP_USERS) {
  const members = normalizeProjectMembers(project?.members, users);
  return PROJECT_MEMBER_ROLE_IDS.map((roleId) => ({
    role: roleId,
    roleLabel: getRoleLabel(roleId),
    userId: members[roleId],
    user: findUserById(members[roleId], users),
  }));
}
