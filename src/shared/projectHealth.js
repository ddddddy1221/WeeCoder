export function createProjectHealthReport(
  project,
  { breachedSla = false, failedJobCount = 0 } = {},
) {
  const stageId = project?.currentStageId || '';
  const stageName = project?.currentStageName || getStageName(project, stageId);
  const gate = project?.stageGateReport || {};
  const stageRisk = project?.stageRiskRegister?.[stageId] || {};
  const gateBlockerCount = Number(gate.blockerCount) || 0;
  const openTaskCount =
    Number(gate.openTaskCount) || Number(project?.openFollowupTaskCount) || 0;
  const normalizedFailedJobCount = Math.max(0, Number(failedJobCount) || 0);
  const riskLevel = normalizeRiskLevel(stageRisk.riskLevel);

  const deductions = [
    gate.status === 'blocked' ? 35 : 0,
    riskPenalty(riskLevel),
    breachedSla ? 15 : 0,
    Math.min(normalizedFailedJobCount * 15, 30),
    Math.min(openTaskCount * 3, 15),
  ];
  const score = clamp(100 - deductions.reduce((sum, value) => sum + value, 0), 0, 100);
  const level = score <= 40 ? 'critical' : score <= 70 ? 'warning' : 'healthy';
  const priority = clamp(
    100 - score + (gate.status === 'blocked' ? 15 : 0) + (breachedSla ? 10 : 0),
    0,
    100,
  );
  const reasons = createReasons({
    gate,
    gateBlockerCount,
    riskLevel,
    breachedSla,
    failedJobCount: normalizedFailedJobCount,
    openTaskCount,
  });

  return {
    projectId: project?.id || '',
    projectName: project?.name || '',
    stageId,
    stageName,
    score,
    level,
    priority,
    gateStatus: gate.status || 'unknown',
    gateBlockerCount,
    openTaskCount,
    riskLevel,
    breachedSla: Boolean(breachedSla),
    failedJobCount: normalizedFailedJobCount,
    nextAction: selectNextAction(gate, stageRisk, {
      breachedSla,
      failedJobCount: normalizedFailedJobCount,
    }),
    reasons,
  };
}

export function createProjectHealthPortfolio(projects = [], { jobs = [], sla = {} } = {}) {
  const reports = projects
    .map((project) =>
      createProjectHealthReport(project, {
        breachedSla: Boolean((sla.breaches || []).some((item) => item.projectId === project.id)),
        failedJobCount: jobs.filter((job) => job.projectId === project.id && job.status === 'failed')
          .length,
      }),
    )
    .sort(compareHealthReports);

  return {
    summary: {
      totalProjects: reports.length,
      criticalCount: reports.filter((report) => report.level === 'critical').length,
      warningCount: reports.filter((report) => report.level === 'warning').length,
      healthyCount: reports.filter((report) => report.level === 'healthy').length,
      averageScore: reports.length
        ? Math.round(reports.reduce((sum, report) => sum + report.score, 0) / reports.length)
        : 100,
    },
    projects: reports,
  };
}

function createReasons({
  gate,
  gateBlockerCount,
  riskLevel,
  breachedSla,
  failedJobCount,
  openTaskCount,
}) {
  return [
    gate.status === 'blocked' ? `Stage gate blocked by ${gateBlockerCount || 1} item(s).` : '',
    riskLevel !== 'low' ? `Current stage risk is ${riskLevel}.` : '',
    breachedSla ? 'SLA threshold breached.' : '',
    failedJobCount ? `${failedJobCount} platform job(s) failed.` : '',
    openTaskCount ? `${openTaskCount} open follow-up task(s).` : '',
  ].filter(Boolean);
}

function selectNextAction(gate, stageRisk, { breachedSla, failedJobCount }) {
  if (Array.isArray(gate.requiredActions) && gate.requiredActions[0]) {
    return gate.requiredActions[0];
  }
  if (failedJobCount) {
    return 'Review failed platform job logs and rerun the blocked task.';
  }
  if (breachedSla) {
    return 'Escalate the stage owner and resolve overdue blockers.';
  }
  if (Array.isArray(stageRisk.recommendedActions) && stageRisk.recommendedActions[0]) {
    return stageRisk.recommendedActions[0];
  }
  return 'Continue the current workflow stage.';
}

function compareHealthReports(left, right) {
  if (left.priority !== right.priority) {
    return right.priority - left.priority;
  }
  return String(left.projectName || '').localeCompare(String(right.projectName || ''));
}

function getStageName(project, stageId) {
  return (project?.stages || []).find((stage) => stage.id === stageId)?.name || stageId;
}

function riskPenalty(level) {
  return level === 'high' ? 20 : level === 'medium' ? 10 : 0;
}

function normalizeRiskLevel(level) {
  return ['high', 'medium', 'low'].includes(level) ? level : 'low';
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
