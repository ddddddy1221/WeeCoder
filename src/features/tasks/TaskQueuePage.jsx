import { useState } from 'react';

export function TaskQueuePage({ filter, inbox, onFilterChange, onOpenProject, onOpenTask }) {
  return (
    <RoleInboxPanel
      filter={filter}
      inbox={inbox}
      onFilterChange={onFilterChange}
      onOpenProject={onOpenProject}
      onOpenTask={onOpenTask}
    />
  );
}

function RoleInboxPanel({ filter, inbox, onFilterChange, onOpenProject, onOpenTask }) {
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const currentFilterLabel =
    {
      all: '全部',
      mine: '只看我的',
      others: '其他角色',
    }[filter] || '全部';
  const currentUserTaskCount = (inbox.currentUserGroups || []).reduce(
    (sum, group) => sum + Number(group.openTaskCount || 0),
    0,
  );
  const visibleProjectCount = new Set(
    (inbox.groups || []).flatMap((group) => (group.projects || []).map((project) => project.projectId)),
  ).size;
  const inboxSummary = {
    currentFilterLabel,
    currentUserTaskCount,
    groupCount: inbox.groups.length,
    openTaskCount: inbox.openTaskCount,
    projectCount: visibleProjectCount,
  };
  const focus = selectRoleInboxFocus(inbox);

  return (
    <section className="role-inbox-panel" aria-label="角色待办收件箱">
      <div className="section-heading">
        <div>
          <p className="eyebrow">角色收件箱</p>
          <h3>角色待办收件箱</h3>
        </div>
        <strong>{`${inbox.openTaskCount} 个待办`}</strong>
      </div>
      <RoleInboxFocusPanel
        filter={filter}
        focus={focus}
        onFilterChange={onFilterChange}
        summary={inboxSummary}
      />
      <details className="role-inbox-detail-section" aria-label="角色待办明细" open={isDetailOpen}>
        <summary
          onClick={(event) => {
            event.preventDefault();
            setIsDetailOpen((open) => !open);
          }}
        >
          <span>
            <strong>{isDetailOpen ? '收起角色分组' : '展开角色分组'}</strong>
            <small>{`${inbox.groups.length} 个角色分组 · ${inbox.openTaskCount} 个待办`}</small>
          </span>
        </summary>
        {isDetailOpen ? (
          inbox.groups.length ? (
            <div className="role-inbox-list">
              {inbox.groups.map((group) => {
                const groupTitle = `${localizeRoleLabel(group.targetRoleLabel)} · ${group.assigneeName}`;

                return (
                  <details
                    aria-label={`角色待办分组 ${groupTitle}`}
                    className={`role-inbox-card ${group.isCurrentUser ? 'current' : ''}`}
                    key={`${group.targetRole}-${group.assigneeUserId || group.assigneeName}`}
                    open={group.isCurrentUser}
                  >
                    <summary className="role-inbox-card-heading">
                      <div>
                        {group.isCurrentUser ? <span className="role-inbox-current">我的待办</span> : null}
                        <h4>{groupTitle}</h4>
                      </div>
                      <strong>{`${group.openTaskCount} 个缺项待办`}</strong>
                    </summary>
                    <div className="role-inbox-projects">
                      {group.projects.map((project) => (
                        <div
                          className="role-inbox-project-card"
                          key={`${group.targetRole}-${project.projectId}`}
                        >
                          <button
                            aria-label={`查看 ${project.projectName}`}
                            className="role-inbox-project"
                            type="button"
                            onClick={() => onOpenProject(project.projectId)}
                          >
                            <span>
                              <strong>{project.projectName}</strong>
                              <small>{localizeStageName(project.stageName)}</small>
                            </span>
                            <span>{`${project.openTaskCount} 项`}</span>
                          </button>
                          {project.tasks?.length ? (
                            <details
                              aria-label={`项目待办明细 ${project.projectName}`}
                              className="role-inbox-task-details"
                            >
                              <summary>
                                <span>任务明细</span>
                                <small>{`${project.tasks.length} 条待办`}</small>
                              </summary>
                              <div className="role-inbox-task-list">
                                {project.tasks.map((task) => (
                                  <button
                                    aria-label={`定位 ${task.title}`}
                                    className="role-inbox-task"
                                    key={task.id}
                                    type="button"
                                    onClick={() => onOpenTask(task)}
                                  >
                                    <div className="role-inbox-task-copy">
                                      <span>{localizeWorkflowText(task.title)}</span>
                                      <small>{localizeStageName(task.stageName)}</small>
                                      <TaskPriorityContext context={task.priorityContext} />
                                    </div>
                                  </button>
                                ))}
                              </div>
                            </details>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  </details>
                );
              })}
            </div>
          ) : (
            <p className="muted">暂无角色待办。</p>
          )
        ) : null}
      </details>
    </section>
  );
}

function RoleInboxFocusPanel({ filter, focus, onFilterChange, summary }) {
  const focusTask = focus?.task || null;
  const focusProject = focus?.project || null;
  const focusGroup = focus?.group || null;
  const focusTitle = focusTask?.title ? localizeWorkflowText(focusTask.title) : '暂无待办';
  const focusStage = localizeStageName(focusTask?.stageName || focusProject?.stageName || '');
  const owner = focusGroup
    ? `${localizeRoleLabel(focusGroup.targetRoleLabel)} · ${focusGroup.assigneeName || '未指派'}`
    : '暂无负责人';

  const focusMeta = focusTask
    ? `${focusProject?.projectName || '未关联项目'}${focusStage ? ` · ${focusStage}` : ''}`
    : '当前筛选下没有待处理事项。';
  const metrics = [
    { label: '全部', tone: summary.openTaskCount ? 'warning' : 'steady', value: summary.openTaskCount },
    { label: '我的', tone: summary.currentUserTaskCount ? 'active' : 'steady', value: summary.currentUserTaskCount },
    { label: '角色', tone: 'steady', value: summary.groupCount },
    { label: '项目', tone: 'steady', value: summary.projectCount },
  ];
  const filterOptions = [
    ['all', '全部'],
    ['mine', '只看我的'],
    ['others', '其他角色'],
  ];

  return (
    <section className="role-inbox-focus-panel" aria-label="角色待办焦点">
      <div className="role-inbox-focus-main">
        <article className="role-inbox-focus-primary">
          <span>当前焦点</span>
          <strong>{focusTitle}</strong>
          <small>{focusMeta}</small>
        </article>
        <article>
          <span>处理角色</span>
          <strong>{owner}</strong>
          <small>{`当前筛选：${summary.currentFilterLabel}`}</small>
        </article>
        <article>
          <span>优先级依据</span>
          {focusTask ? <TaskPriorityContext context={focusTask.priorityContext} /> : <small>暂无风险上下文。</small>}
        </article>
      </div>
      <div className="role-inbox-focus-side">
        <div className="role-inbox-focus-metrics" aria-label="角色待办指标">
          {metrics.map((metric) => (
            <span className={metric.tone} key={metric.label}>{`${metric.label} ${metric.value}`}</span>
          ))}
        </div>
        <div className="role-inbox-focus-filters" aria-label="角色待办快速筛选">
          {filterOptions.map(([value, label]) => (
            <button
              aria-pressed={filter === value}
              className={filter === value ? 'active' : ''}
              key={value}
              type="button"
              onClick={() => onFilterChange(value)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}

function TaskPriorityContext({ context }) {
  const summary = formatTaskPrioritySummary(context);
  if (!summary && !context?.nextAction) {
    return null;
  }

  return (
    <span className="task-priority-context">
      {summary ? <small className="task-priority-summary">{summary}</small> : null}
      {context?.nextAction ? <small>{localizeWorkflowText(context.nextAction)}</small> : null}
    </span>
  );
}

function selectRoleInboxFocus(inbox = {}) {
  const candidates = (inbox.groups || []).flatMap((group) =>
    (group.projects || []).flatMap((project) =>
      (project.tasks || []).map((task) => ({
        group,
        project,
        score: getRoleInboxTaskScore(task, group, project),
        task,
      })),
    ),
  );

  return candidates.sort((left, right) => right.score - left.score)[0] || null;
}

function getRoleInboxTaskScore(task = {}, group = {}, project = {}) {
  const context = task.priorityContext || {};
  const contextPriority = Number(context.priority || 0);
  const currentUserWeight = group.isCurrentUser ? 1000 : 0;
  const healthWeight = context.healthLevel === 'critical' ? 320 : context.healthLevel === 'warning' ? 220 : 0;
  const gateWeight = context.gateStatus === 'blocked' ? 260 : 0;
  const projectTaskWeight = Math.min(99, Number(project.openTaskCount || 0) * 8);
  return currentUserWeight + healthWeight + gateWeight + contextPriority + projectTaskWeight;
}

function localizeWorkflowText(value) {
  if (value === null || value === undefined) {
    return '';
  }

  let text = String(value);
  LOCALIZED_TEXT_REPLACEMENTS.forEach(([pattern, replacement]) => {
    text = text.replace(pattern, replacement);
  });
  Object.entries(STAGE_NAME_LABELS).forEach(([source, label]) => {
    text = text.replace(new RegExp(escapeRegExp(source), 'g'), label);
  });

  return text.trim();
}

function localizeStageName(value) {
  if (!value) {
    return '';
  }

  return STAGE_NAME_LABELS[value] || localizeWorkflowText(value);
}

function localizeRoleLabel(value) {
  if (!value) {
    return '未分配角色';
  }

  return ROLE_NAME_LABELS[value] || localizeWorkflowText(value);
}

function formatTaskPrioritySummary(context = {}) {
  if (!context || typeof context !== 'object') {
    return '';
  }

  const parts = [];
  if (context.healthLevel) {
    parts.push(healthLevelLabel(context.healthLevel));
  }
  if (Number.isFinite(Number(context.healthScore))) {
    parts.push(`得分 ${Number(context.healthScore)}`);
  }
  if (!parts.length && context.gateStatus) {
    parts.push(context.gateStatus === 'blocked' ? '阶段闸口阻塞' : '跟进事项阻塞');
  }

  return parts.join(' · ');
}

function healthLevelLabel(level) {
  const labels = {
    critical: '高风险',
    healthy: '健康',
    warning: '需关注',
  };

  return labels[level] || '未评估';
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const STAGE_NAME_LABELS = {
  Acceptance: '最终验收',
  Architecture: '架构设计',
  Development: '自动开发',
  Operations: '运维准备',
  'Ops requirements': '运维需求',
  'PM requirements': '项目经理需求',
  'PRD approval': '需求文档审批',
  QA: '测试验证',
  Requirements: '需求确认',
  Review: '代码评审',
  'Sign-off': '验收签署',
};

const ROLE_NAME_LABELS = {
  'AI Dev': 'AI 开发',
  'Local Runner': '本地执行器',
  'Tech Lead': '技术负责人',
  Developer: '开发',
  Ops: '运维',
  Owner: '负责人',
  PM: '项目经理',
  QA: '测试',
  Team: '团队',
  'Unknown role': '未知角色',
  'ai-dev': 'AI 开发',
  developer: '开发',
  'local-runner': '本地执行器',
  ops: '运维',
  owner: '负责人',
  pm: '项目经理',
  qa: '测试',
  team: '团队',
  'tech-lead': '技术负责人',
};

const LOCALIZED_TEXT_REPLACEMENTS = [
  [/Complete (\d+) current-stage confirmation task\(s\)\.?/gi, '补齐 $1 个当前阶段确认事项。'],
  [/Clarify QA evidence/gi, '澄清测试证据'],
  [/Collect QA test evidence\.?/gi, '收集测试验证证据。'],
  [/Collect QA evidence/gi, '收集测试验证证据'],
  [/Confirm runtime environment/gi, '确认运行环境'],
  [/Follow-up blocker/gi, '跟进事项阻塞'],
  [/Open tasks?\s*(\d+)/gi, '待办 $1'],
  [/PM requirements/gi, '项目经理需求'],
  [/Ops requirements/gi, '运维需求'],
  [/PRD approval/gi, '需求文档审批'],
  [/\bPRD\b/g, '需求文档'],
  [/Tech lead/gi, '技术负责人'],
  [/AI dev/gi, 'AI 开发'],
  [/Owner/gi, '负责人'],
  [/PM/gi, '项目经理'],
  [/QA/gi, '测试'],
  [/Ops/gi, '运维'],
];
