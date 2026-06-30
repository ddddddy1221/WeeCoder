import { useState } from 'react';
import { AlertTriangle, Check, Circle } from 'lucide-react';
import { createProjectPipelineView } from '../../shared/businessPipeline.js';

const PROJECT_SUMMARY_PREVIEW_LENGTH = 37;

export const PROJECT_WORKSPACE_TABS = Object.freeze([
  { id: 'overview', label: '概览' },
  { id: 'requirements', label: '需求文档' },
  { id: 'architecture-ops', label: '架构与运维' },
  { id: 'development', label: '开发' },
  { id: 'review', label: '代码评审' },
  { id: 'qa', label: '测试' },
  { id: 'acceptance', label: '验收' },
  { id: 'activity', label: '动态' },
]);

export function ProjectWorkspace({
  activeTab = 'overview',
  children,
  onStageChange,
  onTabChange,
  project,
  selectedStageId,
}) {
  const [isStageDetailExpanded, setIsStageDetailExpanded] = useState(false);
  if (!project) {
    return (
      <section className="project-workspace empty" aria-label="项目工作区">
        <h2>选择项目后开始交付</h2>
        <p>请从项目中心选择一个项目。</p>
      </section>
    );
  }

  const health = normalizeHealth(project.health);
  const stages = project.stages || [];
  const currentStage =
    stages.find((stage) => stage.id === selectedStageId) ||
    stages.find((stage) => stage.id === project.currentStageId) ||
    null;
  const stageIndex = currentStage ? stages.findIndex((stage) => stage.id === currentStage.id) + 1 : 0;
  const totalStages = Number(project.totalStages || stages.length || 0);
  const deliveryProgress = calculateDeliveryProgress(project, totalStages, stageIndex);
  const stageDeliveryDetail = createStageDeliveryDetail(
    project,
    currentStage,
    stageIndex,
    totalStages,
  );
  const pipelineView = createProjectPipelineView(project, {
    selectedStageId: selectedStageId || project.currentStageId,
  });
  const focusSummary = createDeliveryFocusSummary({
    deliveryProgress,
    project,
    stageDeliveryDetail,
    stageIndex,
    totalStages,
  });
  const viewSummary = createProjectViewSummary(activeTab, stageDeliveryDetail);

  return (
    <section className="project-workspace" aria-label="项目工作区">
      <header className="project-workspace-header compact-workspace-header" aria-label="项目头部">
        <div className="project-workspace-title">
          <p className="eyebrow">交付控制</p>
          <div>
            <h2>{project.name}</h2>
            <span className={`console-status ${health}`}>{healthLabel(health)}</span>
          </div>
          <ProjectSummaryPreview summary={project.summary} />
        </div>
      </header>

      <ProjectWorkspaceFocusPanel
        currentStage={currentStage}
        detail={stageDeliveryDetail}
        focusSummary={focusSummary}
        isExpanded={isStageDetailExpanded}
        onToggle={() => setIsStageDetailExpanded((expanded) => !expanded)}
        onStageChange={onStageChange}
        pipelineView={pipelineView}
        project={project}
        selectedStageId={selectedStageId}
        stages={stages}
        viewSummary={viewSummary}
      />

      {isStageDetailExpanded ? (
        <StageDeliveryDetail detail={stageDeliveryDetail} pipelineStage={pipelineView.activeStage} />
      ) : null}

      <div className="project-workspace-tabs" role="tablist" aria-label="项目工作区视图">
        {PROJECT_WORKSPACE_TABS.map((tab) => (
          <button
            aria-selected={activeTab === tab.id}
            className={activeTab === tab.id ? 'active' : ''}
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            role="tab"
            type="button"
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="project-workspace-body">{children}</div>
    </section>
  );
}

function ProjectWorkspaceFocusPanel({
  currentStage,
  detail,
  focusSummary,
  isExpanded,
  onToggle,
  onStageChange,
  pipelineView,
  project,
  selectedStageId,
  stages,
  viewSummary,
}) {
  const [isViewGuideOpen, setIsViewGuideOpen] = useState(false);

  if (!detail || !focusSummary || !viewSummary) {
    return null;
  }

  const stateClass =
    detail.missingCount > 0 ? 'blocked' : detail.riskCount + detail.gapCount > 0 ? 'attention' : 'steady';
  const stageOpenTaskCount =
    currentStage?.id === project.currentStageId ? Number(project.openFollowupTaskCount || 0) : 0;
  const blockerDetail = createStageBlockerDetail(detail, stageOpenTaskCount);
  const metrics = [
    `进度 ${focusSummary.deliveryProgress}%`,
    `阶段 ${detail.stageIndex}/${detail.totalStages}`,
    `确认缺项 ${detail.missingCount}`,
    `风险不足 ${detail.riskCount + detail.gapCount}`,
  ];

  const activeStageId = selectedStageId || currentStage?.id;

  return (
    <section
      className={`project-workspace-focus-panel compact-status-strip ${stateClass}`}
      aria-label="项目状态条"
    >
      <div className="project-workspace-focus-progress" aria-label="项目处理指标">
        {metrics.map((metric) => (
          <span key={metric}>{metric}</span>
        ))}
      </div>
      <ProjectPipelineBandStrip onStageChange={onStageChange} pipelineView={pipelineView} />
      <article className="project-workspace-focus-stage" aria-label="当前阶段摘要">
        <span>当前阶段</span>
        <strong>{detail.stageName}</strong>
        <small>{`${detail.statusLabel} · ${detail.owner}`}</small>
      </article>
      <article className="project-workspace-focus-next" aria-label="下一步动作摘要">
        <span>下一步动作</span>
        <strong>{detail.compactNextAction || blockerDetail}</strong>
        <small>{blockerDetail}</small>
        <button
          aria-expanded={isExpanded}
          className="stage-detail-toggle secondary"
          onClick={onToggle}
          type="button"
        >
          {isExpanded ? '收起阶段详情' : '查看阶段详情'}
        </button>
      </article>
      <details
        className="project-workspace-focus-view compact-view-guide"
        aria-label="视图说明"
        open={isViewGuideOpen}
      >
        <summary
          onClick={(event) => {
            event.preventDefault();
            setIsViewGuideOpen((isOpen) => !isOpen);
          }}
        >
          <span>{`当前视图：${viewSummary.label}`}</span>
          <small>{isViewGuideOpen ? '收起视图说明' : '展开视图说明'}</small>
        </summary>
        {isViewGuideOpen ? (
          <div className="project-workspace-focus-view-body">
            <strong>{viewSummary.nextAction}</strong>
            <p>{viewSummary.description}</p>
            <small>{`关联阶段：${viewSummary.stageName}`}</small>
          </div>
        ) : null}
      </details>
      <ActivePipelineBandSummary pipelineView={pipelineView} />
      <ProjectPipelineTrack onStageChange={onStageChange} pipelineView={pipelineView} />
      <details className="project-workspace-stage-track" aria-label="阶段轨道">
        <summary>
          <span>
            <strong>阶段轨道</strong>
            <small>展开完整阶段列表</small>
          </span>
          <em>{`当前 ${detail.stageIndex}/${detail.totalStages}`}</em>
        </summary>
        <div className="delivery-stage-rail" aria-label="阶段进度轨道">
          {(stages || []).map((stage, index) => (
            <button
              aria-current={stage.id === activeStageId ? 'step' : undefined}
              className={`delivery-stage-node ${stage.status || 'queued'} ${
                stage.id === activeStageId ? 'selected' : ''
              }`}
              key={stage.id}
              onClick={() => onStageChange?.(stage.id)}
              type="button"
            >
              <span className="delivery-stage-icon">
                {stage.status === 'approved' ? (
                  <Check aria-hidden="true" size={13} />
                ) : stage.status === 'blocked' ? (
                  <AlertTriangle aria-hidden="true" size={13} />
                ) : (
                  <Circle aria-hidden="true" size={10} />
                )}
              </span>
              <span className="delivery-stage-node-copy">
                <small>{String(index + 1).padStart(2, '0')}</small>
                <strong>{stageDisplayName(stage.name)}</strong>
              </span>
            </button>
          ))}
        </div>
      </details>
    </section>
  );
}

function ActivePipelineBandSummary({ pipelineView }) {
  const band = pipelineView?.activeBand;
  if (!band) {
    return null;
  }

  return (
    <section className="active-pipeline-band-summary" aria-label="当前业务带摘要">
      <div>
        <p className="eyebrow">业务带工作区</p>
        <strong>{`当前业务带：${band.label}`}</strong>
        <small>{`${band.stages.length} 个阶段 · ${band.completeCount} 个已完成`}</small>
      </div>
      <div className="active-pipeline-band-metrics">
        <span>{`必要产物 ${band.artifactCount || 0}`}</span>
        <span>{`人工闸口 ${band.humanGateCount || 0}`}</span>
      </div>
      <ul className="active-pipeline-band-stages">
        {band.stages.map((stage) => (
          <li key={stage.id}>
            <strong>{stage.name}</strong>
            <small>{`${stage.statusLabel || '待确认'} · 产物 ${stage.artifactCount || 0} · 闸口 ${
              stage.humanGateCount || 0
            }`}</small>
          </li>
        ))}
      </ul>
      <ul className="active-pipeline-band-artifacts">
        {(band.requiredArtifacts || []).map((artifact) => (
          <li key={artifact}>{artifact}</li>
        ))}
      </ul>
      <p>{band.nextAction}</p>
    </section>
  );
}

function ProjectPipelineBandStrip({ onStageChange, pipelineView }) {
  if (!pipelineView?.bands?.length) {
    return null;
  }

  return (
    <div className="project-workspace-pipeline-band-strip" aria-label="业务带进度">
      {pipelineView.bands.map((band) => {
        const firstStage = band.stages[0];
        return (
          <button
            aria-current={band.id === pipelineView.activeBand?.id ? 'step' : undefined}
            className={`pipeline-band-chip ${band.status || 'queued'} ${
              band.id === pipelineView.activeBand?.id ? 'selected' : ''
            }`}
            key={band.id}
            onClick={() => onStageChange?.(firstStage?.workflowStageIds?.[0])}
            type="button"
          >
            <span>{band.label}</span>
            <strong>{band.stages.map((stage) => stage.name).join(' / ')}</strong>
            <small>{`${band.completeCount}/${band.stages.length} 已完成`}</small>
          </button>
        );
      })}
    </div>
  );
}

function ProjectPipelineTrack({ onStageChange, pipelineView }) {
  if (!pipelineView?.bands?.length) {
    return null;
  }

  return (
    <details className="project-workspace-pipeline-track" aria-label="业务流转 Pipeline">
      <summary>
        <span>
          <strong>业务流转 Pipeline</strong>
          <small>{`当前业务带：${pipelineView.summary.activeBandLabel}`}</small>
        </span>
        <em>{`${pipelineView.summary.stageCount} 个主阶段`}</em>
      </summary>
      <div className="project-workspace-pipeline-grid" aria-label="完整业务流转阶段">
        {pipelineView.bands.map((band) => (
          <section className={`pipeline-band-card ${band.status || 'queued'}`} key={band.id}>
            <header>
              <span>{band.label}</span>
              <small>{band.description}</small>
            </header>
            <div>
              {band.visibleStages.map((stage) => (
                <button
                  aria-current={stage.id === pipelineView.activeStage?.id ? 'step' : undefined}
                  className={`pipeline-stage-card ${stage.status || 'queued'} ${
                    stage.id === pipelineView.activeStage?.id ? 'selected' : ''
                  }`}
                  key={stage.id}
                  onClick={() => onStageChange?.(stage.workflowStageIds[0])}
                  type="button"
                >
                  <span>{String(stage.order || '回流').padStart(2, '0')}</span>
                  <strong>{stage.name}</strong>
                  <small>{`${stage.ownerRole} · ${stage.operatingMode}`}</small>
                </button>
              ))}
            </div>
          </section>
        ))}
      </div>
    </details>
  );
}

function ProjectSummaryPreview({ summary }) {
  const text = String(summary || '').trim();
  if (!text) {
    return null;
  }

  if (text.length <= PROJECT_SUMMARY_PREVIEW_LENGTH) {
    return <p className="project-workspace-summary">{text}</p>;
  }

  const preview = `${text.slice(0, PROJECT_SUMMARY_PREVIEW_LENGTH)}...`;

  return (
    <details className="project-summary-details" aria-label="项目概要">
      <summary>
        <span>项目概要</span>
        <small>{preview}</small>
      </summary>
      <p>{text}</p>
    </details>
  );
}

function createProjectViewSummary(activeTab, stageDeliveryDetail) {
  const stageName = stageDeliveryDetail?.stageName || '待确认';
  const summaries = {
    overview: {
      areas: ['状态', '下一步', '风险证据'],
      description: '看项目状态、下一步动作和风险证据摘要。',
      label: '概览',
      nextAction: '建议下一步：进入当前阶段处理。',
    },
    requirements: {
      areas: ['需求确认', '需求文档草稿', '缺项追问'],
      description: '聚焦需求确认、需求文档草稿和缺项追问。',
      label: '需求文档',
      nextAction: '建议下一步：补齐需求缺项并生成需求文档。',
    },
    'architecture-ops': {
      areas: ['架构方案', '运维交接', '环境依赖'],
      description: '聚焦技术方案、服务器需求、运维交接和部署前置条件。',
      label: '架构与运维',
      nextAction: '建议下一步：确认运行环境、账号权限和外部依赖。',
    },
    development: {
      areas: ['任务包', '仓库诊断', '执行记录'],
      description: '聚焦智能开发任务包、仓库准备和本地检查结果。',
      label: '开发',
      nextAction: '建议下一步：准备分支并生成智能开发任务包。',
    },
    review: {
      areas: ['代码质量', '安全性能', '测试交接'],
      description: '聚焦代码质量、安全、性能和测试交接门禁。',
      label: '代码评审',
      nextAction: '建议下一步：运行代码、安全和性能评审。',
    },
    qa: {
      areas: ['测试用例', '测试证据', '缺陷回流'],
      description: '聚焦测试用例、测试证据、误检率口径和缺陷回流。',
      label: '测试',
      nextAction: '建议下一步：补齐测试证据并运行测试验证。',
    },
    acceptance: {
      areas: ['验收包', '剩余风险', '签收归档'],
      description: '聚焦最终验收包、剩余风险、运维交接和归档签收。',
      label: '验收',
      nextAction: '建议下一步：生成最终验收包并完成签收。',
    },
    activity: {
      areas: ['流转记录', '风险变化', '审计线索'],
      description: '聚焦项目流转记录、风险变化和历史处理线索。',
      label: '动态',
      nextAction: '建议下一步：展开风险不足或流转记录核验。',
    },
  };

  return {
    ...(summaries[activeTab] || summaries.overview),
    stageName,
  };
}

function createStageBlockerDetail(detail, stageOpenTaskCount) {
  if (detail.missingCount > 0 || stageOpenTaskCount > 0) {
    return `确认缺项 ${detail.missingCount} · 阻塞待办 ${stageOpenTaskCount}`;
  }
  if (detail.riskCount + detail.gapCount > 0) {
    return `潜在风险 ${detail.riskCount} · 功能不足 ${detail.gapCount}`;
  }
  return '当前阶段可以继续推进。';
}

function StageDeliveryDetail({ detail, pipelineStage }) {
  if (!detail) {
    return null;
  }

  const stateClass =
    detail.missingCount > 0 ? 'blocked' : detail.riskCount + detail.gapCount > 0 ? 'attention' : 'steady';

  return (
    <section className={`stage-delivery-detail ${stateClass}`} aria-label="阶段交付详情">
      <div className="stage-delivery-detail-copy">
        <p className="eyebrow">阶段交付详情</p>
        <strong>{`当前查看：${detail.stageName}`}</strong>
        <span>{`负责人：${detail.owner}`}</span>
        <small>{`阶段 ${detail.stageIndex}/${detail.totalStages} · ${detail.statusLabel}`}</small>
      </div>
      <p className="stage-delivery-description">{detail.description}</p>
      <div className="stage-delivery-detail-metrics" aria-label="阶段交付指标">
        <div>
          <span>{`检查项 ${detail.checklistCount}`}</span>
          <small>阶段自检清单</small>
        </div>
        <div className={detail.missingCount > 0 ? 'warning' : ''}>
          <span>确认缺项</span>
          <strong>{detail.missingCount}</strong>
        </div>
        <div className={detail.riskCount > 0 ? 'warning' : ''}>
          <span>潜在风险</span>
          <strong>{detail.riskCount}</strong>
        </div>
        <div className={detail.gapCount > 0 ? 'warning' : ''}>
          <span>功能不足</span>
          <strong>{detail.gapCount}</strong>
        </div>
      </div>
      <p className="stage-delivery-next-action">{detail.nextAction}</p>
      <PipelineStageGuidance pipelineStage={pipelineStage} />
    </section>
  );
}

function PipelineStageGuidance({ pipelineStage }) {
  if (!pipelineStage) {
    return null;
  }

  return (
    <section className="pipeline-stage-guidance" aria-label="业务阶段指引">
      <div>
        <p className="eyebrow">业务阶段指引</p>
        <strong>{`当前业务阶段：${pipelineStage.name}`}</strong>
        <span>{`工作模式：${pipelineStage.operatingMode}`}</span>
      </div>
      <article>
        <span>人工闸口</span>
        <p>{pipelineStage.humanGate}</p>
      </article>
      <article>
        <span>必要产物</span>
        <ul>
          {(pipelineStage.requiredArtifacts || []).map((artifact) => (
            <li key={artifact}>{artifact}</li>
          ))}
        </ul>
      </article>
    </section>
  );
}

function normalizeHealth(health) {
  if (health === 'at-risk' || health === 'warning') return 'warning';
  if (health === 'blocked' || health === 'critical') return 'critical';
  return 'healthy';
}

function healthLabel(health) {
  if (health === 'warning') return '需关注';
  if (health === 'critical') return '高风险';
  return '健康';
}

function stageStatusLabel(status) {
  const labels = {
    active: '进行中',
    approved: '已通过',
    blocked: '已阻塞',
    queued: '等待中',
  };

  return labels[status] || '待确认';
}

function createStageDeliveryDetail(project, currentStage, stageIndex, totalStages) {
  if (!project || !currentStage) {
    return null;
  }

  const stageId = currentStage.id || project.currentStageId;
  const confirmation = project.stageConfirmations?.[stageId] || null;
  const riskEntry = project.stageRiskRegister?.[stageId] || null;
  const missingItems = Array.isArray(confirmation?.missingItems) ? confirmation.missingItems : [];
  const currentStageOpenTaskCount =
    stageId === project.currentStageId ? Number(project.openFollowupTaskCount || 0) : 0;
  const missingCount = Math.max(missingItems.length, currentStageOpenTaskCount);
  const riskCount = Array.isArray(riskEntry?.potentialRisks) ? riskEntry.potentialRisks.length : 0;
  const gapCount = Array.isArray(riskEntry?.functionalGaps) ? riskEntry.functionalGaps.length : 0;

  return {
    checklistCount: Array.isArray(currentStage.checklist) ? currentStage.checklist.length : 0,
    compactNextAction: stageCompactNextAction({
      gapCount,
      missingCount,
      riskCount,
      status: currentStage.status,
    }),
    description: currentStage.description || '当前阶段暂无说明。',
    gapCount,
    missingCount,
    nextAction: stageNextAction({
      gapCount,
      missingCount,
      riskCount,
      status: currentStage.status,
    }),
    owner: currentStage.owner || project.currentOwner || project.sponsor || '未指派',
    riskCount,
    stageIndex: stageIndex || 0,
    stageName: stageDisplayName(currentStage.name || project.currentStageName || '待确认'),
    statusLabel: stageStatusLabel(currentStage.status),
    totalStages: totalStages || 0,
  };
}

function createDeliveryFocusSummary({
  deliveryProgress,
  project,
  stageDeliveryDetail,
  stageIndex,
  totalStages,
}) {
  if (!project || !stageDeliveryDetail) {
    return null;
  }

  const stageId = project.currentStageId || '';
  const artifact = project.artifacts?.[stageId] || '';
  const riskIssueCount = stageDeliveryDetail.riskCount + stageDeliveryDetail.gapCount;
  const stageOpenTaskCount = Number(project.openFollowupTaskCount || 0);
  const state =
    stageDeliveryDetail.missingCount > 0
      ? 'blocked'
      : riskIssueCount > 0
        ? 'attention'
        : 'steady';

  return {
    artifactStatus: artifact ? '已生成阶段产物' : '待生成阶段产物',
    artifactTitle: getArtifactTitle(artifact),
    blockerDetail: createStageBlockerDetail(stageDeliveryDetail, stageOpenTaskCount),
    deliveryProgress,
    nextAction: stageDeliveryDetail.nextAction,
    owner: stageDeliveryDetail.owner,
    riskDetail: `潜在风险 ${stageDeliveryDetail.riskCount} · 功能不足 ${stageDeliveryDetail.gapCount}`,
    riskIssueCount,
    riskLabel: riskIssueCount ? '需要复核' : '暂无突出风险',
    stageIndex: stageIndex || 0,
    stageName: stageDeliveryDetail.stageName,
    state,
    statusLabel: stageDeliveryDetail.statusLabel,
    totalStages: totalStages || 0,
  };
}

function getArtifactTitle(artifact) {
  const text = String(artifact || '').trim();
  if (!text) {
    return '暂无阶段产物';
  }

  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const heading = lines.find((line) => line.startsWith('#'));
  const title = localizeWorkspaceText(heading ? heading.replace(/^#+\s*/, '') : lines[0].replace(/^[-*]\s*/, ''));

  return title.length > 28 ? `${title.slice(0, 28)}...` : title;
}

function localizeWorkspaceText(value) {
  return String(value || '')
    .replace(/PRD 审批/gi, '需求文档审批')
    .replace(/PRD 草稿/gi, '需求文档草稿')
    .replace(/PRD 草案/gi, '需求文档草案')
    .replace(/PRD 输入/gi, '需求文档输入')
    .replace(/\bPRD\b/g, '需求文档');
}

function stageNextAction({ gapCount, missingCount, riskCount, status }) {
  if (missingCount > 0) {
    return '优先补齐当前阶段确认事项，再进入下一闸口。';
  }

  if (riskCount + gapCount > 0) {
    return '先复核潜在风险和功能不足，再确认阶段结论。';
  }

  if (status === 'approved') {
    return '该阶段已通过，可查看产物或切换到下一阶段。';
  }

  if (status === 'queued') {
    return '该阶段仍在等待前置阶段完成。';
  }

  return '当前阶段可继续推进，请补齐处理意见并执行阶段动作。';
}

function stageCompactNextAction({ gapCount, missingCount, riskCount, status }) {
  if (missingCount > 0) {
    return '补齐确认事项后进入下一闸口';
  }

  if (riskCount + gapCount > 0) {
    return '复核风险不足后确认结论';
  }

  if (status === 'approved') {
    return '查看产物或切换下一阶段';
  }

  if (status === 'queued') {
    return '等待前置阶段完成';
  }

  return '补齐处理意见并执行动作';
}

function stageDisplayName(value) {
  const labels = {
    Acceptance: '最终验收',
    Architecture: '架构设计',
    Development: '自动开发',
    'Ops requirements': '运维需求',
    'PM requirements': '项目经理需求',
    'PRD 审批': '需求文档审批',
    'PRD approval': '需求文档审批',
    QA: '测试',
    Review: '代码评审',
    '代码/安全/性能 Review': '代码、安全、性能评审',
  };

  return labels[value] || localizeWorkspaceText(value);
}

function calculateDeliveryProgress(project, totalStages, stageIndex = 0) {
  const total = Number(totalStages || project?.totalStages || 0);
  if (!total) {
    return 0;
  }

  const current = Number(project?.stageProgress || 0) || Number(stageIndex || 0);
  return Math.max(0, Math.min(100, Math.round((current / total) * 100)));
}
