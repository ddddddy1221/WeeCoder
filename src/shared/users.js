import { getRoleLabel } from './authorization.js';

export const APP_USERS = Object.freeze([
  createUser('owner-aa', 'AA', 'owner', '负责人'),
  createUser('pm-lin', '林项目经理', 'pm', '项目经理'),
  createUser('tech-chen', '陈技术负责人', 'tech-lead', '技术负责人'),
  createUser('tech-li', '李技术负责人', 'tech-lead', '李技术负责人'),
  createUser('ops-wang', '王运维', 'ops', '运维'),
  createUser('ai-dev-bot', 'AI 开发', 'ai-dev', 'AI 开发'),
  createUser('runner-local', '本地执行器', 'local-runner', 'Local Runner'),
  createUser('qa-zhao', '赵测试', 'qa', '测试'),
]);

export function findUserById(userId, users = APP_USERS) {
  const normalizedId = String(userId || '').trim();
  return users.find((user) => user.id === normalizedId) || null;
}

export function getDefaultUser(users = APP_USERS) {
  return users[0];
}

export function actorFromUser(user) {
  return String(user?.actor || user?.roleLabel || user?.name || '').trim();
}

export function selectUserForRole(roleId, users = APP_USERS) {
  return users.find((user) => user.role === roleId) || getDefaultUser(users);
}

function createUser(id, name, role, actor) {
  return Object.freeze({
    id,
    name,
    role,
    roleLabel: getRoleLabel(role),
    actor,
  });
}
