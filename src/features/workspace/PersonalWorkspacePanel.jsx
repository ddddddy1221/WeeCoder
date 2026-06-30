import { useState } from 'react';

const identityText = (value) => (value === null || value === undefined ? '' : String(value));
const defaultFormatTaskPrioritySummary = () => '';

export function PersonalWorkspacePanel({
  actions = [],
  currentUser,
  formatTaskPrioritySummary = defaultFormatTaskPrioritySummary,
  handoffSummary,
  localizeRoleLabel = identityText,
  localizeStageName = identityText,
  localizeWorkflowText = identityText,
  onAcknowledgeEscalation,
  onOpenTask,
  openTaskCount,
  permissionGates = [],
  projectCount,
  roleSummary,
  selectedProject,
  tasks = [],
}) {
  const [isTaskDetailOpen, setIsTaskDetailOpen] = useState(false);
  const [isWorkspaceContextOpen, setIsWorkspaceContextOpen] = useState(false);
  const hasWorkspaceContext = Boolean(roleSummary || handoffSummary);
  const workspaceContextSummary = getPersonalWorkspaceContextSummary({
    actions,
    handoffSummary,
    roleSummary,
  });

  return (
    <section className="workspace-home-panel personal" aria-label="个人工作台">
      <div className="workspace-home-main">
        <div className="workspace-home-copy">
          <p className="eyebrow">个人工作台</p>
          <h3>{`${currentUser?.name || '当前用户'}的工作台`}</h3>
          <p>{`当前角色：${localizeRoleLabel(currentUser?.roleLabel || '未知角色')}。优先处理分配给你的阶段确认和流转动作。`}</p>
        </div>
        <div className="workspace-home-metrics">
          <WorkspaceHomeMetric ariaLabel="我的待办数量" label="我的待办" value={openTaskCount} />
          <WorkspaceHomeMetric ariaLabel="我的项目数量" label="相关项目" value={projectCount} />
          <WorkspaceHomeMetric
            ariaLabel="当前项目阶段"
            label="当前阶段"
            value={localizeStageName(selectedProject?.currentStageName) || '待选择'}
          />
        </div>
      </div>
      <PersonalWorkFocus
        action={actions[0]}
        currentUser={currentUser}
        formatTaskPrioritySummary={formatTaskPrioritySummary}
        localizeRoleLabel={localizeRoleLabel}
        localizeStageName={localizeStageName}
        localizeWorkflowText={localizeWorkflowText}
        onAcknowledgeEscalation={onAcknowledgeEscalation}
        onOpenTask={onOpenTask}
        openTaskCount={openTaskCount}
        permissionGates={permissionGates}
        projectCount={projectCount}
        roleSummary={roleSummary}
        selectedProject={selectedProject}
        tasks={tasks}
      />
      {hasWorkspaceContext ? (
        <details
          className="personal-context-section"
          aria-label="个人工作台补充信息"
          open={isWorkspaceContextOpen}
        >
          <summary
            onClick={(event) => {
              event.preventDefault();
              setIsWorkspaceContextOpen((isOpen) => !isOpen);
            }}
          >
            <span>展开补充信息</span>
            <small>{workspaceContextSummary}</small>
          </summary>
          {isWorkspaceContextOpen ? (
            <div className="personal-context-grid">
              <RoleFocusSummary
                actions={actions}
                localizeStageName={localizeStageName}
                localizeWorkflowText={localizeWorkflowText}
                summary={roleSummary}
              />
              <RoleHandoffSummary
                localizeRoleLabel={localizeRoleLabel}
                localizeStageName={localizeStageName}
                localizeWorkflowText={localizeWorkflowText}
                summary={handoffSummary}
              />
            </div>
          ) : null}
        </details>
      ) : null}
      <details
        className="personal-task-list"
        aria-label="我的待办明细"
        open={isTaskDetailOpen}
      >
        <summary
          onClick={(event) => {
            event.preventDefault();
            setIsTaskDetailOpen((isOpen) => !isOpen);
          }}
        >
          <span>展开全部待办</span>
          <small>{tasks.length ? `${tasks.length} 条待办` : '暂无待办'}</small>
        </summary>
        {isTaskDetailOpen ? (
          tasks.length ? (
            tasks.slice(0, 4).map((task) =>
              task.type === 'owner-escalation' ? (
                <article
                  className="personal-task-escalation"
                  key={`${task.projectId}-${task.id}`}
                >
                  <div>
                    <strong>{localizeWorkflowText(task.title)}</strong>
                    <small>{`${task.projectName} · ${localizeStageName(task.stageName)}`}</small>
                    <TaskPriorityContext
                      context={task.priorityContext}
                      formatTaskPrioritySummary={formatTaskPrioritySummary}
                      localizeWorkflowText={localizeWorkflowText}
                    />
                  </div>
                  <button
                    aria-label={`确认升级提醒 ${localizeWorkflowText(task.title)}`}
                    onClick={() => onAcknowledgeEscalation?.(task)}
                    type="button"
                  >
                    确认收到
                  </button>
                </article>
              ) : (
                <button
                  aria-label={`处理我的待办 ${localizeWorkflowText(task.title)}`}
                  key={`${task.projectId}-${task.id}`}
                  onClick={() => onOpenTask(task)}
                  type="button"
                >
                  <span>{localizeWorkflowText(task.title)}</span>
                  <small>{`${task.projectName} · ${localizeStageName(task.stageName)}`}</small>
                  <TaskPriorityContext
                    context={task.priorityContext}
                    formatTaskPrioritySummary={formatTaskPrioritySummary}
                    localizeWorkflowText={localizeWorkflowText}
                  />
                </button>
              ),
            )
          ) : (
            <p>暂无你的待办。</p>
          )
        ) : null}
      </details>
    </section>
  );
}

function getPersonalWorkspaceContextSummary({ actions = [], handoffSummary, roleSummary }) {
  const parts = [];
  if (roleSummary) {
    parts.push('角色焦点');
  }
  if (handoffSummary) {
    parts.push('角色交接');
  }
  const enabledActionCount = actions.filter((action) => action.enabled !== false).length;
  if (enabledActionCount) {
    parts.push(`${enabledActionCount} 个可执行动作`);
  }

  return parts.length ? parts.join(' · ') : '暂无补充信息';
}

function PersonalWorkFocus({
  action,
  currentUser,
  formatTaskPrioritySummary,
  localizeRoleLabel,
  localizeStageName,
  localizeWorkflowText,
  onAcknowledgeEscalation,
  onOpenTask,
  openTaskCount = 0,
  permissionGates = [],
  projectCount = 0,
  roleSummary,
  selectedProject,
  tasks = [],
}) {
  const [isQueueDetailOpen, setIsQueueDetailOpen] = useState(false);
  const [isRiskDetailOpen, setIsRiskDetailOpen] = useState(false);
  const visibleTasks = tasks.slice(0, 4);
  const primaryTask = visibleTasks[0] || null;
  const remainingTasks = visibleTasks.slice(1);
  const alerts = tasks.filter(isTaskAlert).slice(0, 4);
  const focusTitle =
    action?.label ||
    primaryTask?.title ||
    (openTaskCount ? '查看待办队列' : '暂无待处理任务');
  const focusLocation = [
    action?.projectName || primaryTask?.projectName || roleSummary?.focusProjectName,
    localizeStageName(action?.stageName || primaryTask?.stageName || roleSummary?.focusStageName),
  ]
    .filter(Boolean)
    .join(' · ');
  const roleLabel = localizeRoleLabel(currentUser?.roleLabel || '当前角色');

  return (
    <section className="personal-work-focus" aria-label="我的处理焦点">
      <div className="personal-work-focus-heading">
        <div>
          <small>{roleLabel}</small>
          <strong>我的处理焦点</strong>
          <span>{focusLocation || '聚焦当前分配给你的任务和风险。'}</span>
        </div>
        <div className="personal-work-focus-kpis" aria-label="个人处理指标">
          <span>{`待办 ${openTaskCount || tasks.length}`}</span>
          <span>{`项目 ${projectCount}`}</span>
          <span>{`提醒 ${alerts.length}`}</span>
        </div>
      </div>

      {action ? (
        <>
          <PrimaryRoleActionCard
            action={action}
            localizeRoleLabel={localizeRoleLabel}
            localizeStageName={localizeStageName}
            localizeWorkflowText={localizeWorkflowText}
            onOpenTask={onOpenTask}
            permissionGates={permissionGates}
            roleSummary={roleSummary}
            tasks={tasks}
          />
          {primaryTask ? (
            <div className="personal-work-focus-primary" aria-label="当前最高优先级待办">
              <PriorityTaskItem
                formatTaskPrioritySummary={formatTaskPrioritySummary}
                localizeStageName={localizeStageName}
                localizeWorkflowText={localizeWorkflowText}
                onAcknowledgeEscalation={onAcknowledgeEscalation}
                onOpenTask={onOpenTask}
                task={primaryTask}
              />
            </div>
          ) : null}
        </>
      ) : primaryTask ? (
        <div className="personal-work-focus-primary" aria-label="当前最高优先级待办">
          <PriorityTaskItem
            formatTaskPrioritySummary={formatTaskPrioritySummary}
            localizeStageName={localizeStageName}
            localizeWorkflowText={localizeWorkflowText}
            onAcknowledgeEscalation={onAcknowledgeEscalation}
            onOpenTask={onOpenTask}
            task={primaryTask}
          />
        </div>
      ) : (
        <div className="personal-work-focus-empty" aria-label="当前无待办">
          <strong>{localizeWorkflowText(focusTitle)}</strong>
          <span>{`当前阶段：${localizeStageName(selectedProject?.currentStageName) || '待选择'}`}</span>
        </div>
      )}

      {remainingTasks.length ? (
        <details
          className="role-priority-detail-section personal-work-focus-detail"
          aria-label="其余优先待办"
          open={isQueueDetailOpen}
        >
          <summary
            onClick={(event) => {
              event.preventDefault();
              setIsQueueDetailOpen((isOpen) => !isOpen);
            }}
          >
            <span>展开其余优先待办</span>
            <small>{`${remainingTasks.length} 条待处理`}</small>
          </summary>
          {isQueueDetailOpen ? (
            <div className="role-priority-queue-list secondary">
              {remainingTasks.map((task) => (
                <PriorityTaskItem
                  formatTaskPrioritySummary={formatTaskPrioritySummary}
                  key={`${task.projectId}-${task.id}`}
                  localizeStageName={localizeStageName}
                  localizeWorkflowText={localizeWorkflowText}
                  onAcknowledgeEscalation={onAcknowledgeEscalation}
                  onOpenTask={onOpenTask}
                  task={task}
                />
              ))}
            </div>
          ) : null}
        </details>
      ) : null}
      {alerts.length ? (
        <details
          aria-label="风险提醒"
          className="personal-alert-detail-section personal-work-focus-detail"
          open={isRiskDetailOpen}
        >
          <summary
            onClick={(event) => {
              event.preventDefault();
              setIsRiskDetailOpen((isOpen) => !isOpen);
            }}
          >
            <span>风险提醒</span>
            <small>{`${alerts.length} 条紧急提醒`}</small>
          </summary>
          {isRiskDetailOpen ? (
            <div className="personal-alert-list secondary">
              {alerts.map((task) => (
                <PersonalAlertItem
                  key={`${task.projectId}-${task.id}-focus-alert`}
                  localizeStageName={localizeStageName}
                  localizeWorkflowText={localizeWorkflowText}
                  task={task}
                />
              ))}
            </div>
          ) : null}
        </details>
      ) : null}
    </section>
  );
}

function PriorityTaskItem({
  formatTaskPrioritySummary,
  localizeStageName,
  localizeWorkflowText,
  onAcknowledgeEscalation,
  onOpenTask,
  task,
}) {
  if (!task) {
    return null;
  }

  if (task.type === 'owner-escalation') {
    return (
      <article className="role-priority-task escalation">
        <div>
          <strong>{localizeWorkflowText(task.title)}</strong>
          <small>{`${task.projectName} · ${localizeStageName(task.stageName)}`}</small>
          <TaskPriorityContext
            context={task.priorityContext}
            formatTaskPrioritySummary={formatTaskPrioritySummary}
            localizeWorkflowText={localizeWorkflowText}
          />
        </div>
        <button
          aria-label={`确认升级提醒 ${localizeWorkflowText(task.title)}`}
          onClick={() => onAcknowledgeEscalation?.(task)}
          type="button"
        >
          确认收到
        </button>
      </article>
    );
  }

  return (
    <button
      aria-label={`处理我的待办 ${localizeWorkflowText(task.title)}`}
      className="role-priority-task"
      onClick={() => onOpenTask(task)}
      type="button"
    >
      <span>{localizeWorkflowText(task.title)}</span>
      <small>{`${task.projectName} · ${localizeStageName(task.stageName)}`}</small>
      <TaskPriorityContext
        context={task.priorityContext}
        formatTaskPrioritySummary={formatTaskPrioritySummary}
        localizeWorkflowText={localizeWorkflowText}
      />
    </button>
  );
}

function RoleHandoffSummary({ localizeRoleLabel, localizeStageName, localizeWorkflowText, summary }) {
  if (!summary) {
    return null;
  }

  const lanes = (summary.lanes || []).map((lane) => lane.roleLabel || lane.role).filter(Boolean);
  const projectCount = Number(summary.activeProjectCount || summary.projects?.length || 0);
  const taskCount = Number(summary.totalTaskCount || 0);
  const blockedCount = Number(summary.blockedTaskCount || 0);

  return (
    <div className="role-handoff-card" aria-label="角色交接">
      <small>角色交接</small>
      {lanes.length ? <strong>{lanes.map(localizeRoleLabel).join(' → ')}</strong> : null}
      <span>
        {`${projectCount} 个项目 / ${taskCount} 个任务 / 阻塞 ${blockedCount}`}
      </span>
      {(summary.projects || []).length ? (
        <div className="role-handoff-projects">
          {(summary.projects || []).slice(0, 3).map((project) => (
            <article key={project.projectId || project.projectName}>
              <strong>
                {`${project.projectName || '未关联项目'} · ${
                  localizeStageName(project.stageName) || '未关联阶段'
                } · ${
                  localizeWorkflowText(project.latestTaskTitle) || '暂无任务'
                }`}
              </strong>
              <small>{`待办 ${project.openTaskCount || 0} / 阻塞 ${project.blockedTaskCount || 0}`}</small>
            </article>
          ))}
        </div>
      ) : null}
      {summary.nextAction ? <p>{localizeWorkflowText(summary.nextAction)}</p> : null}
    </div>
  );
}

function PrimaryRoleActionCard({
  action,
  localizeRoleLabel,
  localizeStageName,
  localizeWorkflowText,
  onOpenTask,
  permissionGates = [],
  roleSummary,
  tasks = [],
}) {
  if (!action) {
    return null;
  }

  const task = tasks.find((item) =>
    [item.id, item.followupTaskId].filter(Boolean).includes(action.taskId),
  );
  const permissionGate = permissionGates.find((gate) => {
    const sameAction = gate.actionId === action.actionId;
    const sameProject = !gate.projectId || !action.projectId || gate.projectId === action.projectId;
    return sameAction && sameProject;
  }) || action.gate || null;
  const canRunAction = action.enabled !== false && permissionGate?.allowed !== false;
  const statusLabel = canRunAction ? '可执行' : '被阻塞';
  const location = [
    action.projectName || roleSummary?.focusProjectName,
    localizeStageName(action.stageName || roleSummary?.focusStageName),
  ]
    .filter(Boolean)
    .join(' · ');
  const nextAction = localizeWorkflowText(
    action.nextAction || roleSummary?.nextAction || '打开当前任务并补齐处理证据。',
  );
  const gateStatus = permissionGate?.allowed === false ? '阻塞' : '允许';
  const allowedRoles = permissionGate?.allowedRoles || [];

  return (
    <div className={`primary-role-action ${canRunAction ? 'ready' : 'blocked'}`} aria-label="当前主行动">
      <div className="primary-role-action-copy">
        <small>现在轮到我</small>
        <strong>{localizeWorkflowText(action.label)}</strong>
        {location ? <span>{location}</span> : null}
        {permissionGate ? (
          <div className="primary-role-action-gate" aria-label="主行动权限门禁">
            <span>{`权限校验 · ${gateStatus}`}</span>
            {allowedRoles.length ? (
              <span>{`允许角色：${allowedRoles.map(localizeRoleLabel).join('、')}`}</span>
            ) : null}
            {permissionGate.reason ? <p>{localizeWorkflowText(permissionGate.reason)}</p> : null}
          </div>
        ) : null}
        <p>{nextAction}</p>
      </div>
      <div className="primary-role-action-side">
        <span>{statusLabel}</span>
        {task ? (
          <button
            disabled={!canRunAction}
            onClick={() => onOpenTask(task)}
            type="button"
          >
            {`处理当前主行动 ${localizeWorkflowText(action.label)}`}
          </button>
        ) : null}
      </div>
    </div>
  );
}

function RoleFocusSummary({ actions = [], localizeStageName, localizeWorkflowText, summary }) {
  if (!summary) {
    return null;
  }

  const focusLabel = summary.focusProjectName
    ? `聚焦 ${summary.focusProjectName}${summary.focusStageName ? ` · ${localizeStageName(summary.focusStageName)}` : ''}`
    : '暂无聚焦项目';

  return (
    <div className="role-focus-card">
      <small>角色焦点</small>
      <div className="role-focus-heading">
        <strong>{localizeWorkflowText(summary.title)}</strong>
        <span>{localizeWorkflowText(summary.scopeLabel)}</span>
      </div>
      <p>{localizeWorkflowText(summary.instruction)}</p>
      <div className="role-focus-facts">
        <span>{focusLabel}</span>
        <span>{`紧急 ${summary.urgentTaskCount || 0}`}</span>
        <span>{`阻塞项目 ${summary.blockedProjectCount || 0}`}</span>
      </div>
      {actions.length ? (
        <div className="role-action-list" aria-label="角色动作">
          {actions.slice(0, 2).map((action) => (
            <span key={action.id || action.actionId}>
              {`${localizeWorkflowText(action.label)} · ${action.enabled === false ? '阻塞' : '允许'}`}
            </span>
          ))}
        </div>
      ) : null}
      <p className="role-focus-action">{localizeWorkflowText(summary.nextAction)}</p>
    </div>
  );
}

function PersonalAlertItem({ localizeStageName, localizeWorkflowText, task }) {
  if (!task) {
    return null;
  }

  return (
    <article className="personal-alert-item">
      <small>{`${task.projectName} · ${localizeStageName(task.stageName)}`}</small>
      <strong>{localizeWorkflowText(task.title)}</strong>
      <p>{localizeWorkflowText(task.priorityContext?.reason || task.priorityContext?.nextAction)}</p>
    </article>
  );
}

function TaskPriorityContext({
  context,
  formatTaskPrioritySummary,
  localizeWorkflowText,
}) {
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

function isTaskAlert(task = {}) {
  const context = task.priorityContext || {};
  return (
    context.gateStatus === 'blocked' ||
    context.healthLevel === 'critical' ||
    Number(context.priority) >= 70
  );
}

function WorkspaceHomeMetric({ ariaLabel, label, tone = 'neutral', value }) {
  return (
    <div className={`workspace-home-metric ${tone}`} aria-label={ariaLabel}>
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}
