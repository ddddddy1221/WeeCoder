export const NAV_ITEMS = Object.freeze([
  { id: 'workspace', label: '我的工作台', icon: 'LayoutDashboard' },
  { id: 'projects', label: '项目中心', icon: 'FolderKanban' },
  { id: 'tasks', label: '任务队列', icon: 'ListTodo' },
  { id: 'delivery', label: '交付控制', icon: 'Workflow' },
  {
    id: 'operations',
    label: '运营后台',
    icon: 'Command',
    roles: ['owner', 'tech-lead'],
  },
]);

const STAGE_TABS = Object.freeze({
  intake: 'overview',
  'pm-requirements': 'requirements',
  'prd-approval': 'requirements',
  architecture: 'architecture-ops',
  'ops-requirements': 'architecture-ops',
  development: 'development',
  review: 'review',
  qa: 'qa',
  acceptance: 'acceptance',
  'defect-loop': 'development',
});

const TAB_STAGES = Object.freeze({
  overview: ['intake'],
  requirements: ['pm-requirements', 'prd-approval'],
  'architecture-ops': ['architecture', 'ops-requirements'],
  development: ['development', 'defect-loop'],
  review: ['review'],
  qa: ['qa'],
  acceptance: ['acceptance'],
});

export function getNavigationItems(user) {
  return NAV_ITEMS.filter((item) => !item.roles || item.roles.includes(user?.role));
}

export function getWorkspaceTabForStage(stageId) {
  return STAGE_TABS[stageId] || 'overview';
}

export function getPreferredStageIdForTab(tabId, stages = [], currentStageId = '') {
  if (tabId === 'activity') return currentStageId;

  const candidates = TAB_STAGES[tabId] || [];
  if (candidates.includes(currentStageId)) return currentStageId;

  return candidates.find((stageId) => stages.some((stage) => stage.id === stageId)) || currentStageId;
}
