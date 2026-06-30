import { STAGE_IDS } from './workflow.js';
import { isYoloCameraProject } from './yoloDeliveryChain.js';

const ACTIVE_JOB_STATUSES = new Set(['queued', 'running']);
const PLAN_SOURCE = 'project-automation-plan';
const SANDBOX_POLICY = 'project-verification-command-allowlist';

export function createProjectAutomationPlan(project = {}) {
  const candidate = selectAutomationCandidate(project);

  if (!candidate) {
    return {
      projectId: project.id || '',
      projectName: project.name || '',
      status: 'no-action',
      priority: 'low',
      recommendedJob: null,
      existingJob: null,
      queueBlockedReason: '',
      nextAction: '当前阶段暂无需要排队的自动化后台任务。',
    };
  }

  const command = selectVerificationCommand(project);
  const existingJob = findActiveJob(project, candidate.type);
  if (existingJob) {
    return {
      projectId: project.id || '',
      projectName: project.name || '',
      status: 'waiting-existing-job',
      priority: candidate.priority,
      recommendedJob: null,
      existingJob: summarizeExistingJob(existingJob),
      queueBlockedReason: '',
      nextAction: `已有 ${candidate.title} 后台任务正在排队或运行，先等待该任务产出执行证据。`,
    };
  }

  const stalePrdBlocker = createStalePrdQueueBlocker(project);
  if (stalePrdBlocker) {
    return {
      projectId: project.id || '',
      projectName: project.name || '',
      status: 'blocked',
      priority: 'high',
      recommendedJob: null,
      existingJob: null,
      queueBlockedReason: stalePrdBlocker,
      nextAction: '先重新运行智能需求评审并生成最新 PRD，再排队 AI coding 后台任务。',
    };
  }

  if (!command) {
    return {
      projectId: project.id || '',
      projectName: project.name || '',
      status: 'blocked',
      priority: 'high',
      recommendedJob: null,
      existingJob: null,
      queueBlockedReason: '项目还没有配置仓库验证命令，无法创建可执行的后台任务。',
      nextAction: '请先在开发交接里配置仓库地址和验证命令，再排队 AI coding 后台任务。',
    };
  }

  return {
    projectId: project.id || '',
    projectName: project.name || '',
    status: 'ready-to-queue',
    priority: candidate.priority,
    recommendedJob: {
      type: candidate.type,
      title: candidate.title,
      command,
      source: PLAN_SOURCE,
      details: {
        stageId: project.currentStageId || '',
        sandboxPolicy: SANDBOX_POLICY,
        recommendedBy: PLAN_SOURCE,
        ...createWorkflowChainDetails(project, candidate.type),
        ...candidate.details,
      },
    },
    existingJob: null,
    queueBlockedReason: '',
    nextAction: candidate.nextAction,
  };
}

function selectAutomationCandidate(project = {}) {
  if (hasOpenDefectFixPackage(project)) {
    const pack = project.defectFixPackage || {};
    return {
      type: 'qa-defect-fix',
      title: '测试缺陷修复执行',
      priority: 'high',
      nextAction: '建议先排队测试缺陷修复后台任务，完成后回到代码评审和测试验证。',
      details: {
        defectFixSourceCommitHash: pack.sourceCommitHash || '',
        qaPassRate: pack.qaPassRate || '',
        requiredFixes: normalizeList(pack.requiredFixes),
        regressionFocus: normalizeList(pack.regressionFocus),
      },
    };
  }

  if (project.currentStageId === STAGE_IDS.DEVELOPMENT && !isTerminalSuccess(project.developmentRun?.status)) {
    return {
      type: 'ai-development',
      title: 'AI 开发执行',
      priority: 'normal',
      nextAction: '建议排队 AI 开发执行后台任务，并使用项目命令白名单运行验证命令。',
      details: {},
    };
  }

  if (project.currentStageId === STAGE_IDS.REVIEW && !isTerminalSuccess(project.codeReviewReport?.status)) {
    return {
      type: 'code-review',
      title: '代码/安全/性能评审',
      priority: 'normal',
      nextAction: '建议排队代码、安全和性能评审后台任务，形成评审证据。',
      details: {},
    };
  }

  if (project.currentStageId === STAGE_IDS.QA && !isTerminalSuccess(project.qaRun?.status)) {
    return {
      type: 'qa-run',
      title: '测试验证执行',
      priority: 'normal',
      nextAction: '建议排队测试验证后台任务，输出测试用例和执行证据。',
      details: {},
    };
  }

  return null;
}

function createStalePrdQueueBlocker(project = {}) {
  const prdVersion = project.prdVersion || {};
  const impact = project.prdChangeImpact || {};
  if (prdVersion.status !== 'stale' && impact.status !== 'stale') {
    return '';
  }
  if (impact.summary) {
    return String(impact.summary).trim();
  }
  const versionLabel = prdVersion.label || impact.versionLabel || '当前版本';
  return `PRD ${versionLabel} 已过期，请重新运行智能需求评审并生成最新 PRD。`;
}

function createWorkflowChainDetails(project = {}, jobType = '') {
  if (!isYoloCameraProject(project)) {
    return {};
  }

  return {
    workflowChain: 'yolo-camera-monitor',
    qualityGates: ['pm-product', 'ai-coding', 'security-review', 'qa'],
    ...(jobType === 'code-review'
      ? { reviewScope: ['code-quality', 'security', 'performance'] }
      : {}),
  };
}

function hasOpenDefectFixPackage(project = {}) {
  const pack = project.defectFixPackage;
  if (!pack) {
    return false;
  }
  const submissionStatus = pack.repairSubmission?.status || pack.repairSubmission?.jobStatus || '';
  if (isTerminalSuccess(submissionStatus)) {
    return false;
  }
  return ['ready', 'blocked', 'executing', 'review-ready', 'reviewing', 'qa-retest'].includes(
    String(pack.status || '').trim(),
  );
}

function selectVerificationCommand(project = {}) {
  return [
    ...(Array.isArray(project.repositoryConfig?.verificationCommands)
      ? project.repositoryConfig.verificationCommands
      : []),
    ...(Array.isArray(project.developmentPlan?.verificationCommands)
      ? project.developmentPlan.verificationCommands
      : []),
  ]
    .map((command) => String(command || '').trim())
    .find(Boolean) || '';
}

function findActiveJob(project = {}, type = '') {
  return (Array.isArray(project.platformJobs) ? project.platformJobs : []).find(
    (job) => job.type === type && ACTIVE_JOB_STATUSES.has(String(job.status || '').trim()),
  ) || null;
}

function summarizeExistingJob(job = {}) {
  return {
    id: job.id || '',
    type: job.type || '',
    title: job.title || '',
    status: job.status || '',
    command: job.command || '',
  };
}

function isTerminalSuccess(status) {
  return ['completed', 'passed', 'ready', 'ready-for-review', 'succeeded', 'closed'].includes(
    String(status || '').trim(),
  );
}

function normalizeList(items = []) {
  return Array.isArray(items) ? items.map((item) => String(item || '').trim()).filter(Boolean) : [];
}
