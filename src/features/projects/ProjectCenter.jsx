import { useMemo, useState } from 'react';
import { Filter, Plus, Search } from 'lucide-react';

export function ProjectCenter({
  loading = false,
  onCreateProject,
  onOpenProject,
  projects = [],
}) {
  const [query, setQuery] = useState('');
  const [healthFilter, setHealthFilter] = useState('all');
  const normalizedQuery = query.trim().toLowerCase();
  const visibleProjects = useMemo(
    () =>
      projects.filter((project) => {
        const matchesQuery = [
          project.name,
          project.sponsor,
          project.currentOwner,
          project.currentStageName,
          getProjectNextAction(project),
        ]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(normalizedQuery));
        const matchesHealth =
          healthFilter === 'all' || normalizeHealth(project.health) === healthFilter;
        return matchesQuery && matchesHealth;
      }),
    [healthFilter, normalizedQuery, projects],
  );
  const portfolioSummary = useMemo(() => {
    const totalProjects = projects.length;
    const riskProjectCount = projects.filter((project) =>
      ['warning', 'critical'].includes(normalizeHealth(project.health)),
    ).length;
    const openTaskCount = projects.reduce(
      (total, project) => total + (Number(project.openFollowupTaskCount) || 0),
      0,
    );
    const averageProgress = totalProjects
      ? Math.round(projects.reduce((total, project) => total + getProgress(project), 0) / totalProjects)
      : 0;

    return {
      averageProgress,
      openTaskCount,
      riskProjectCount,
      totalProjects,
      visibleProjectCount: visibleProjects.length,
    };
  }, [projects, visibleProjects.length]);
  const primaryProject = useMemo(() => selectPrimaryProject(visibleProjects), [visibleProjects]);

  return (
    <section className="project-center" aria-label="项目中心">
      <header className="console-page-header">
        <div>
          <p className="eyebrow">项目组合</p>
          <h2>项目中心</h2>
          <p>统一查看项目阶段、风险、负责人和未完成交接。</p>
        </div>
        <button className="console-primary-action" onClick={onCreateProject} type="button">
          <Plus aria-hidden="true" size={17} />
          新建项目
        </button>
      </header>

      <ProjectPortfolioFocus
        primaryProject={primaryProject}
        summary={portfolioSummary}
      />

      <section className="project-portfolio-workbench" aria-label="项目组合工作台">
        <div className="project-portfolio-table-panel">
          <div className="project-center-toolbar">
            <label className="project-search-field">
              <Search aria-hidden="true" size={17} />
              <input
                onChange={(event) => setQuery(event.target.value)}
                placeholder="搜索项目名称、负责人或阶段"
                value={query}
              />
            </label>
            <label className="project-filter-field">
              <Filter aria-hidden="true" size={16} />
              <span>健康度</span>
              <select
                aria-label="项目健康度"
                onChange={(event) => setHealthFilter(event.target.value)}
                value={healthFilter}
              >
                <option value="all">全部</option>
                <option value="healthy">健康</option>
                <option value="warning">需关注</option>
                <option value="critical">高风险</option>
              </select>
            </label>
          </div>

          <div className="project-table-frame">
            <table className="project-portfolio-table" aria-label="项目组合紧凑表格">
              <thead>
                <tr>
                  <th>项目</th>
                  <th>当前阶段</th>
                  <th>交付进度</th>
                  <th>健康度</th>
                  <th>负责人</th>
                  <th>下一步</th>
                  <th>待办</th>
                </tr>
              </thead>
              <tbody>
                {visibleProjects.map((project) => (
                  <tr className={project.id === primaryProject?.id ? 'selected' : ''} key={project.id}>
                    <td>
                      <button
                        aria-label={`打开项目 ${project.name}`}
                        className="project-name-button"
                        onClick={() => onOpenProject(project.id)}
                        type="button"
                      >
                        <strong>{project.name}</strong>
                      </button>
                    </td>
                    <td>{project.currentStageName}</td>
                    <td>
                      <div className="table-progress">
                        <span>{getProgress(project)}%</span>
                        <i style={{ '--progress': `${getProgress(project)}%` }} />
                      </div>
                    </td>
                    <td>
                      <span className={`console-status ${normalizeHealth(project.health)}`}>
                        {healthLabel(project.health)}
                      </span>
                    </td>
                    <td>{project.currentOwner || project.sponsor || '未指派'}</td>
                    <td>
                      <span className="project-next-action">{getProjectNextAction(project)}</span>
                    </td>
                    <td>
                      <strong className={project.openFollowupTaskCount ? 'task-count warning' : 'task-count'}>
                        {project.openFollowupTaskCount || 0}
                      </strong>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {loading ? <p className="project-table-state">正在加载项目...</p> : null}
            {!loading && !visibleProjects.length ? (
              <p className="project-table-state">没有符合当前筛选条件的项目。</p>
            ) : null}
          </div>
        </div>

        <ProjectProcessingDrawer
          onOpenProject={onOpenProject}
          project={primaryProject}
          visibleProjectCount={portfolioSummary.visibleProjectCount}
        />
      </section>
    </section>
  );
}

function ProjectPortfolioFocus({ primaryProject, summary }) {
  const primaryAction = primaryProject
    ? getProjectNextAction(primaryProject)
    : summary.visibleProjectCount
      ? '选择项目查看下一步'
      : '当前筛选没有项目';
  const riskCopy = summary.riskProjectCount
    ? `有 ${summary.riskProjectCount} 个项目需要负责人关注。`
    : '当前没有高风险项目。';
  const metrics = [
    { label: `显示 ${summary.visibleProjectCount} / ${summary.totalProjects}` },
    { label: `风险 ${summary.riskProjectCount}`, warning: summary.riskProjectCount > 0 },
    { label: `待办 ${summary.openTaskCount}`, warning: summary.openTaskCount > 0 },
    { label: `平均 ${summary.averageProgress}%` },
  ];

  return (
    <section className="project-portfolio-focus" aria-label="项目组合焦点">
      <article className="project-portfolio-focus-primary">
        <span>当前重点</span>
        <strong>{primaryProject?.name || '暂无匹配项目'}</strong>
        <small>{primaryAction}</small>
      </article>
      <div className="project-portfolio-focus-side">
        <div className="project-portfolio-focus-copy">
          <span>组合状态</span>
          <strong>{`${summary.riskProjectCount} 个风险 · ${summary.openTaskCount} 个待办`}</strong>
          <small>{riskCopy}</small>
        </div>
        <div className="project-portfolio-focus-metrics" aria-label="项目组合指标">
          {metrics.map((metric) => (
            <span className={metric.warning ? 'warning' : ''} key={metric.label}>
              {metric.label}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}

function ProjectProcessingDrawer({ onOpenProject, project, visibleProjectCount }) {
  const summary = project
    ? getProjectNextAction(project)
    : visibleProjectCount
      ? '选择项目后查看处理重点。'
      : '调整搜索或健康度筛选后查看项目。';
  const status = project ? healthLabel(project.health) : '待选择';

  return (
    <details className="project-processing-drawer" aria-label="项目处理详情">
      <summary>
        <span>
          <strong>项目处理详情</strong>
          <small>{summary}</small>
        </span>
        <em>{status}</em>
      </summary>
      <ProjectProcessingSummary
        onOpenProject={onOpenProject}
        project={project}
        visibleProjectCount={visibleProjectCount}
      />
    </details>
  );
}

function ProjectProcessingSummary({ onOpenProject, project, visibleProjectCount }) {
  if (!project) {
    return (
      <aside className="project-processing-summary empty" aria-label="项目处理摘要">
        <span>项目处理摘要</span>
        <strong>暂无匹配项目</strong>
        <p>{visibleProjectCount ? '请选择一个项目查看处理重点。' : '调整搜索或健康度筛选后查看项目。'}</p>
      </aside>
    );
  }

  const progress = getProgress(project);
  const nextAction = getProjectNextAction(project);
  const owner = project.currentOwner || project.sponsor || '未指派';
  const openTaskCount = Number(project.openFollowupTaskCount || 0);

  return (
    <aside className="project-processing-summary" aria-label="项目处理摘要">
      <span>项目处理摘要</span>
      <strong>{project.name}</strong>
      <p>{nextAction}</p>
      <dl>
        <div>
          <dt>当前阶段</dt>
          <dd>{project.currentStageName || '未进入阶段'}</dd>
        </div>
        <div>
          <dt>负责人</dt>
          <dd>{owner}</dd>
        </div>
        <div>
          <dt>健康度</dt>
          <dd>{healthLabel(project.health)}</dd>
        </div>
        <div>
          <dt>交付进度</dt>
          <dd>{`${progress}%`}</dd>
        </div>
        <div>
          <dt>待办</dt>
          <dd>{`${openTaskCount} 个`}</dd>
        </div>
      </dl>
      <button className="project-summary-action" onClick={() => onOpenProject(project.id)} type="button">
        打开项目工作台
      </button>
    </aside>
  );
}

function getProgress(project) {
  const total = Number(project.totalStages) || 1;
  return Math.min(100, Math.max(0, Math.round(((Number(project.stageProgress) || 0) / total) * 100)));
}

function getProjectNextAction(project = {}) {
  const openTaskCount = Number(project.openFollowupTaskCount || 0);
  if (openTaskCount > 0) {
    const task = (project.followupTaskAssignments || [])
      .flatMap((assignment) => assignment.tasks || [])
      .find((item) => item.status !== 'resolved');

    if (task?.title) {
      return `补齐：${task.title}`;
    }

    const owner = project.followupTaskAssigneeNames?.[0] || project.currentOwner || project.sponsor || '负责人';
    return `请${owner}处理 ${openTaskCount} 个待办`;
  }

  if (normalizeHealth(project.health) === 'critical') {
    return '先处理高风险阻塞';
  }

  if (normalizeHealth(project.health) === 'warning') {
    return '复核风险并推进阶段';
  }

  return '继续推进当前阶段';
}

function selectPrimaryProject(projects = []) {
  return [...projects].sort((left, right) => getProjectPriority(right) - getProjectPriority(left))[0] || null;
}

function getProjectPriority(project = {}) {
  const healthWeight = {
    critical: 300,
    warning: 200,
    healthy: 100,
  }[normalizeHealth(project.health)];
  const taskWeight = Math.min(99, Number(project.openFollowupTaskCount || 0) * 10);
  const progressWeight = 100 - getProgress(project);
  return healthWeight + taskWeight + progressWeight;
}

function normalizeHealth(health) {
  if (health === 'at-risk' || health === 'warning') return 'warning';
  if (health === 'blocked' || health === 'critical') return 'critical';
  return 'healthy';
}

function healthLabel(health) {
  const normalized = normalizeHealth(health);
  if (normalized === 'warning') return '需关注';
  if (normalized === 'critical') return '高风险';
  return '健康';
}
