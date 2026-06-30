import { useState } from 'react';

const identityText = (value) => (value === null || value === undefined ? '' : String(value));

export function OrganizationOverviewPanel({
  busy,
  localizeRoleLabel = identityText,
  localizeStageName = identityText,
  localizeWorkflowText = identityText,
  onSendOwnerEscalation,
  platform,
  stats,
}) {
  const [isOwnerActionOpen, setIsOwnerActionOpen] = useState(false);
  const [isOrganizationDetailOpen, setIsOrganizationDetailOpen] = useState(false);
  const queue = platform?.aiOperations?.queue || {};
  const sla = platform?.governance?.sla || {};
  const commandCenter = platform?.governance?.commandCenter || {};
  const projectHealth = platform?.governance?.projectHealth || null;
  const ownerRoleFlow = platform?.governance?.ownerRoleFlow || null;
  const ownerEscalationDigest = platform?.governance?.ownerEscalationDigest || null;
  const blockedCount = Number(sla.blockedFollowupCount || commandCenter.totalBlockers || 0);
  const queueCount = Number(queue.totalJobs || 0);
  const blockerCount = Number(commandCenter.totalBlockers || commandCenter.blockers?.length || blockedCount || 0);
  const highSeverityCount = Number(commandCenter.highSeverityCount || 0);
  const organizationDetailSummary = getOrganizationDetailSummary({
    ownerEscalationDigest,
    ownerRoleFlow,
    projectHealth,
  });
  const radarStatus = blockedCount
    ? '需要处理阻塞'
    : stats.atRisk
      ? '关注风险项目'
      : '运转稳定';

  return (
    <section className="workspace-home-panel organization" aria-label="组织总览">
      <OwnerControlFocus
        blockerCount={blockerCount}
        blockedCount={blockedCount}
        commandCenter={commandCenter}
        highSeverityCount={highSeverityCount}
        localizeWorkflowText={localizeWorkflowText}
        organizationDetailSummary={organizationDetailSummary}
        organizationName={platform?.tenancy?.currentOrganizationName || '当前组织'}
        queueCount={queueCount}
        radarStatus={radarStatus}
        stats={stats}
      />
      <div className="organization-overview-grid">
        <details className="owner-action-section" aria-label="负责人行动明细" open={isOwnerActionOpen}>
          <summary
            onClick={(event) => {
              event.preventDefault();
              setIsOwnerActionOpen((isOpen) => !isOpen);
            }}
          >
            <span>
              <strong>负责人行动明细</strong>
              <small>{`关键阻塞 ${blockerCount} · 高风险 ${highSeverityCount}`}</small>
              <small className="owner-action-summary-focus">{radarStatus}</small>
            </span>
          </summary>
          {isOwnerActionOpen ? (
            <section className="organization-overview-main owner-action-center" aria-label="负责人行动中心">
              <OwnerCommandCenterPanel
                commandCenter={commandCenter}
                localizeStageName={localizeStageName}
                localizeWorkflowText={localizeWorkflowText}
              />
            </section>
          ) : null}
        </details>
        <details className="organization-detail-section" aria-label="组织详情" open={isOrganizationDetailOpen}>
          <summary
            onClick={(event) => {
              event.preventDefault();
              setIsOrganizationDetailOpen((isOpen) => !isOpen);
            }}
          >
            <span>
              <strong>组织详情</strong>
              <small>角色流转 · 提醒消息 · 项目健康</small>
              <small className="organization-detail-metrics">{organizationDetailSummary}</small>
            </span>
          </summary>
          {isOrganizationDetailOpen ? (
            <aside className="organization-overview-side" aria-label="负责人决策摘要">
              <OwnerRoleFlowPanel
                flow={ownerRoleFlow}
                localizeRoleLabel={localizeRoleLabel}
                localizeWorkflowText={localizeWorkflowText}
              />
              <OwnerEscalationDigestPanel
                busy={busy}
                digest={ownerEscalationDigest}
                localizeRoleLabel={localizeRoleLabel}
                localizeWorkflowText={localizeWorkflowText}
                onSendOwnerEscalation={onSendOwnerEscalation}
              />
              <ProjectHealthPanel
                localizeStageName={localizeStageName}
                localizeWorkflowText={localizeWorkflowText}
                portfolio={projectHealth}
              />
            </aside>
          ) : null}
        </details>
      </div>
    </section>
  );
}

function getOrganizationDetailSummary({ ownerEscalationDigest, ownerRoleFlow, projectHealth }) {
  const roleCount = Number(
    ownerRoleFlow?.summary?.roleCount || ownerRoleFlow?.roleGroups?.length || 0,
  );
  const messageCount = Number(
    ownerEscalationDigest?.summary?.messageCount || ownerEscalationDigest?.messages?.length || 0,
  );
  const healthRiskCount =
    Number(projectHealth?.summary?.criticalCount || 0) +
      Number(projectHealth?.summary?.warningCount || 0) ||
    Number(projectHealth?.projects?.length || 0);

  return `角色 ${roleCount} · 消息 ${messageCount} · 健康风险 ${healthRiskCount}`;
}

function OwnerControlFocus({
  blockedCount = 0,
  blockerCount = 0,
  commandCenter = {},
  highSeverityCount = 0,
  localizeWorkflowText,
  organizationDetailSummary = '',
  organizationName = '当前组织',
  queueCount = 0,
  radarStatus = '',
  stats = {},
}) {
  const blockers = commandCenter.blockers || [];
  const primaryBlocker = blockers[0] || null;
  const primaryProject = primaryBlocker?.projectName || '暂无阻塞项目';
  const nextAction =
    primaryBlocker?.nextAction ||
    commandCenter.nextAction ||
    (blockedCount ? '先处理最高风险阻塞。' : '继续观察项目节奏和后台任务。');
  const focusTitle = blockedCount ? primaryProject : radarStatus || '运行稳定';
  const focusAction = localizeWorkflowText(nextAction);
  const metrics = [
    {
      label: '阻塞风险',
      value: `${blockerCount} 个阻塞`,
      meta: `高风险 ${highSeverityCount} · 风险项目 ${stats.atRisk || 0}`,
    },
    {
      label: '项目概览',
      value: `活跃 ${stats.active || 0} · 后台任务 ${queueCount}`,
      meta: organizationDetailSummary,
    },
    {
      label: '处理建议',
      value: blockedCount ? '先清理阻塞' : '继续巡检',
      meta: blockedCount ? focusAction : '确认阶段流转和后台任务没有新增异常。',
    },
  ];

  return (
    <section className="owner-control-focus" aria-label="负责人总控焦点">
      <div className="owner-control-focus-heading">
        <div className="workspace-home-copy">
          <p className="eyebrow">组织态势</p>
          <h3>{`${organizationName}总览`}</h3>
          <p>集中查看项目进度、风险、待办阻塞、提醒消息和后台任务状态。</p>
        </div>
        <div className="organization-overview-radar" aria-label="组织交付雷达">
          <span>交付雷达</span>
          <strong>{radarStatus}</strong>
          <div>
            <small>{`风险 ${stats.atRisk || 0}`}</small>
            <small>{`阻塞 ${blockedCount}`}</small>
            <small>{`后台任务 ${queueCount}`}</small>
          </div>
        </div>
      </div>
      <div className="owner-control-focus-body">
        <div className="owner-control-focus-main">
          <span>当前焦点</span>
          <strong>{focusTitle}</strong>
          <small>下一步</small>
          <p>{focusAction}</p>
        </div>
        <div className="workspace-home-metrics">
          <WorkspaceHomeMetric ariaLabel="组织活跃项目" label="活跃项目" tone="active" value={stats.active} />
          <WorkspaceHomeMetric ariaLabel="组织风险项目" label="风险项目" tone="risk" value={stats.atRisk} />
          <WorkspaceHomeMetric
            ariaLabel="组织待办阻塞"
            label="阻塞待办"
            tone="blocked"
            value={blockedCount}
          />
          <WorkspaceHomeMetric
            ariaLabel="组织后台任务"
            label="后台任务"
            tone="jobs"
            value={queueCount}
          />
        </div>
        <div className="owner-control-focus-metrics" aria-label="负责人决策指标">
          {metrics.map((metric) => (
            <article className="owner-control-focus-metric" key={metric.label}>
              <span>{metric.label}</span>
              <strong>{metric.value}</strong>
              <small>{metric.meta}</small>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function OwnerRoleFlowPanel({ flow, localizeRoleLabel, localizeWorkflowText }) {
  const groups = flow?.roleGroups || [];
  const summary = flow?.summary || {};

  return (
    <div className="owner-role-flow-panel" aria-label="角色流转">
      <div className="owner-role-flow-heading">
        <div>
          <p className="eyebrow">职责流向</p>
          <strong>角色流转</strong>
        </div>
        <span>{`${summary.projectCount || 0} 个项目 · ${summary.roleCount || 0} 个角色 · 阻塞 ${
          summary.blockedProjectCount || 0
        }`}</span>
      </div>
      {groups.length ? (
        <div className="owner-role-flow-list">
          {groups.slice(0, 4).map((group) => (
            <article className={`owner-role-flow-item ${group.bottleneckLevel || 'healthy'}`} key={group.role}>
              <strong>
                {`${localizeRoleLabel(group.roleLabel || group.role)} · ${group.projectCount || 0} 个项目 · 待办 ${
                  group.openTaskCount || 0
                }`}
              </strong>
              <small>{`状态：${bottleneckLevelLabel(group.bottleneckLevel)} · 高风险 ${
                group.criticalProjectCount || 0
              } · 需关注 ${group.warningProjectCount || 0}`}</small>
              <small>
                {`升级：${escalationLevelLabel(group.escalationLevel)} · 超时 ${group.maxStaleHours || 0} 小时 · 停滞 ${
                  group.staleProjectCount || 0
                }`}
              </small>
              {group.nextAction ? <p>{localizeWorkflowText(group.nextAction)}</p> : null}
            </article>
          ))}
        </div>
      ) : (
        <p className="owner-role-flow-empty">当前没有角色流转阻塞。</p>
      )}
      {summary.nextAction ? <p className="owner-role-flow-action">{localizeWorkflowText(summary.nextAction)}</p> : null}
      {summary.escalationNextAction ? (
        <p className="owner-role-flow-escalation">{localizeWorkflowText(summary.escalationNextAction)}</p>
      ) : null}
    </div>
  );
}

function OwnerEscalationDigestPanel({
  busy,
  digest,
  localizeRoleLabel,
  localizeWorkflowText,
  onSendOwnerEscalation,
}) {
  const messages = digest?.messages || [];
  const summary = digest?.summary || {};

  return (
    <div className="owner-escalation-digest" aria-label="升级提醒">
      <div className="owner-escalation-digest-heading">
        <div>
          <p className="eyebrow">消息流转</p>
          <strong>提醒消息</strong>
        </div>
        <span>{`${summary.messageCount || 0} 条消息 · ${summary.recipientCount || 0} 个接收人`}</span>
      </div>
      {messages.length ? (
        <div className="owner-escalation-message-list">
          {messages.slice(0, 3).map((message) => {
            const isSent = message.status === 'sent';
            const isAcknowledged = message.status === 'acknowledged';
            const isHandled = isSent || isAcknowledged;
            const statusText = isAcknowledged
              ? `已由 ${message.acknowledgedBy || message.acknowledgedByUserId || '接收人'} 确认`
              : isSent
                ? `已由 ${message.sentBy || message.sentByUserId || '负责人'} 发送`
                : `待发送给 ${message.recipientName || message.recipientUserId || localizeRoleLabel(message.role)}`;
            const buttonText = isAcknowledged ? '已确认' : isSent ? '已发送' : '发送';
            return (
              <article
                className={`owner-escalation-message ${message.escalationLevel || 'watch'} ${
                  isHandled ? 'sent' : 'ready'
                }`}
                key={message.id}
              >
                <div className="owner-escalation-message-main">
                  <div>
                    <strong>
                      {`${localizeRoleLabel(message.roleLabel || message.role)} · ${
                        message.projectName || '未关联项目'
                      } · 超时 ${message.overdueHours || 0} 小时`}
                    </strong>
                    <small>{statusText}</small>
                  </div>
                  <button
                    className="ghost-button"
                    disabled={busy || isHandled}
                    onClick={() => onSendOwnerEscalation?.(message)}
                    type="button"
                    aria-label={`${buttonText}升级提醒 ${localizeWorkflowText(message.subject || message.id)}`}
                  >
                    {buttonText}
                  </button>
                </div>
                <p>{localizeWorkflowText(message.body)}</p>
              </article>
            );
          })}
        </div>
      ) : (
        <p className="owner-escalation-empty">当前没有待发送的升级提醒。</p>
      )}
      {summary.nextAction ? (
        <p className="owner-escalation-digest-action">{localizeWorkflowText(summary.nextAction)}</p>
      ) : null}
    </div>
  );
}

function ProjectHealthPanel({ localizeStageName, localizeWorkflowText, portfolio }) {
  const projects = portfolio?.projects || [];
  const summary = portfolio?.summary || {};

  return (
    <div className="project-health-panel" aria-label="项目健康榜">
      <div className="project-health-heading">
        <div>
          <p className="eyebrow">项目健康</p>
          <strong>项目健康榜</strong>
        </div>
        <span>{`高风险 ${summary.criticalCount || 0} / 需关注 ${summary.warningCount || 0}`}</span>
      </div>
      {projects.length ? (
        <div className="project-health-list">
          {projects.slice(0, 3).map((project) => (
            <article className={`project-health-item ${project.level}`} key={project.projectId}>
              <div>
                <strong>{project.projectName}</strong>
                <small>{localizeStageName(project.stageName)}</small>
              </div>
              <span>{healthLevelLabel(project.level)}</span>
              <b>{`得分 ${project.score}`}</b>
              <p>{localizeWorkflowText(project.nextAction)}</p>
            </article>
          ))}
        </div>
      ) : (
        <p className="project-health-empty">暂无项目健康风险。</p>
      )}
    </div>
  );
}

function OwnerCommandCenterPanel({ commandCenter = {}, localizeStageName, localizeWorkflowText }) {
  const blockers = commandCenter.blockers || [];
  const primaryBlocker = blockers[0] || null;
  const totalBlockers = Number(commandCenter.totalBlockers || blockers.length || 0);
  const highSeverityCount = Number(commandCenter.highSeverityCount || 0);

  return (
    <div className="owner-command-center" aria-label="负责人总控台">
      <div className="owner-command-heading">
        <div>
          <p className="eyebrow">待处理</p>
          <strong>关键阻塞</strong>
        </div>
        <span aria-label="总控高风险阻塞">{`${highSeverityCount} 高风险`}</span>
      </div>
      {primaryBlocker ? (
        <div className="owner-command-priority" aria-label="负责人处理顺序">
          <span>处理顺序</span>
          <strong>{`先处理：${primaryBlocker.projectName || '最高风险项目'}`}</strong>
          <small>{`总阻塞 ${totalBlockers}`}</small>
          <small>{`高风险 ${highSeverityCount}`}</small>
        </div>
      ) : null}
      <details className="owner-command-details" aria-label="关键阻塞明细">
        <summary>
          <span>关键阻塞明细</span>
          <small>{blockers.length ? `${blockers.length} 条阻塞` : '暂无阻塞'}</small>
        </summary>
        <div className="owner-command-list">
          {blockers.length ? (
            blockers.slice(0, 3).map((blocker) => (
              <article className={`owner-command-item ${blocker.severity || 'medium'}`} key={blocker.id}>
                <div className="owner-command-item-heading">
                  <span>{ownerSeverityLabel(blocker.severity)}</span>
                  <strong>{localizeWorkflowText(blocker.title)}</strong>
                </div>
                <div className="owner-command-meta">
                  <span>{ownerBlockerTypeLabel(blocker.type)}</span>
                  {ownerBlockerMetric(blocker) ? <span>{ownerBlockerMetric(blocker)}</span> : null}
                </div>
                <small>
                  {blocker.stageName
                    ? `${blocker.projectName} · ${localizeStageName(blocker.stageName)}`
                    : blocker.projectName}
                </small>
                <p>{localizeWorkflowText(blocker.detail)}</p>
                <em>{localizeWorkflowText(blocker.nextAction)}</em>
              </article>
            ))
          ) : (
            <p className="owner-command-empty">当前组织暂无阻塞项。</p>
          )}
        </div>
      </details>
    </div>
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

function ownerSeverityLabel(level) {
  const labels = {
    high: '高',
    medium: '中',
    low: '低',
  };

  return `${labels[level] || '中'}风险`;
}

function ownerBlockerTypeLabel(type) {
  const labels = {
    'stage-gate': '阶段闸口阻塞',
    followup: '跟进事项阻塞',
    'failed-job': '后台任务失败',
  };

  return labels[type] || '流程阻塞';
}

function ownerBlockerMetric(blocker = {}) {
  if (blocker.type === 'stage-gate') {
    return `闸口 ${blocker.gateBlockerCount || 0} / 待办 ${blocker.openTaskCount || 0}`;
  }
  if (blocker.openTaskCount) {
    return `待办 ${blocker.openTaskCount}`;
  }
  return '';
}

function healthLevelLabel(level) {
  const labels = {
    critical: '高风险',
    warning: '需关注',
    healthy: '健康',
  };

  return labels[level] || '未评估';
}

function bottleneckLevelLabel(level) {
  const labels = {
    critical: '严重阻塞',
    warning: '需关注',
    healthy: '正常',
  };

  return labels[level] || '正常';
}

function escalationLevelLabel(level) {
  const labels = {
    escalated: '已升级',
    watch: '观察',
    normal: '正常',
  };

  return labels[level] || '正常';
}
