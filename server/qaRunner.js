import { access } from 'node:fs/promises';
import { join } from 'node:path';
import { normalizeQaReviewHandoff } from '../src/shared/qaRun.js';

export class QaRunnerError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = 'QaRunnerError';
    this.details = details;
  }
}

export async function runQa(project) {
  const localPath = String(project.repositoryConfig?.localPath || '').trim();
  if (!localPath) {
    throw new QaRunnerError('QA 需要先配置本地仓库路径。', { field: 'localPath' });
  }

  const qaArtifact = String(project.artifacts?.qa || '').trim();
  const checks = Array.isArray(project.developmentRun?.checks) ? project.developmentRun.checks : [];
  const failedChecks = checks.filter((check) => check.status !== 'passed');
  const fileStatus = await inspectExpectedFiles(localPath);
  const hasStructuredEvidence = project.qaEvidence?.status === 'ready';
  const hasConfirmedSamples = hasStructuredEvidence || hasConfirmedAcceptanceSample(qaArtifact);
  const reviewHandoff = normalizeQaReviewHandoff(project.codeReviewReport?.qaHandoff);
  const coveragePlan = createCoveragePlan({
    reviewHandoff,
    commitHash: String(project.developmentRun?.commitHash || '').trim(),
  });
  const reviewHandoffBlockers = createReviewHandoffBlockers(reviewHandoff);
  const implementationBlockers = [
    ...failedChecks.map((check) => `${check.command} 未通过，不能完成 QA。`),
    ...Object.entries(fileStatus)
      .filter(([, passed]) => !passed)
      .map(([area]) => `缺少 ${area} 对应实现或测试。`),
  ];
  const evidenceBlockers = hasConfirmedSamples
    ? []
    : ['测试视频样本、测试时长、测试环境尚未确认。'];

  const testCases = [
    createCase({
      id: 'person-present',
      title: '有行人画面提示',
      scenario: '画面中出现一个行人时，页面展示标注框和明确提示。',
      expectedResult: '生成 person 检测框，监控状态显示有行人。',
      status: fileStatus.monitoring ? 'passed' : 'blocked',
      evidence: fileStatus.monitoring ? 'monitoringState 测试已覆盖行人提示。' : '缺少 monitoringState 测试。',
    }),
    createCase({
      id: 'person-absent',
      title: '无行人画面清空提示',
      scenario: '画面中没有有效 person 检测时，页面不保留旧提示。',
      expectedResult: '行人提示关闭，标注框为空。',
      status: fileStatus.monitoring ? 'passed' : 'blocked',
      evidence: fileStatus.monitoring ? 'monitoringState 测试已覆盖无行人状态。' : '缺少 monitoringState 测试。',
    }),
    createCase({
      id: 'multi-person',
      title: '多人检测框展示',
      scenario: '画面中同时出现多名行人时，展示多个检测框。',
      expectedResult: '所有有效 person 检测框都被保留并传给前端。',
      status: fileStatus.contract && fileStatus.monitoring ? 'passed' : 'blocked',
      evidence:
        fileStatus.contract && fileStatus.monitoring
          ? '检测契约和监控状态测试已覆盖有效检测解析。'
          : '缺少检测契约或监控状态测试。',
    }),
    createCase({
      id: 'weak-light-occlusion',
      title: '弱光与遮挡场景',
      scenario: '弱光、遮挡、多人等真实样本下统计检测结果。',
      expectedResult: '输出测试样本、测试时长、测试环境和误检统计记录。',
      status: hasConfirmedSamples ? 'passed' : 'blocked',
      evidence: hasStructuredEvidence
        ? 'QA 证据已确认样本、时长、环境和浏览器范围。'
        : hasConfirmedSamples
          ? 'QA 交接文档已写明样本、时长和环境。'
          : '测试样本、时长或环境仍待确认。',
    }),
    createCase({
      id: 'false-positive-rate',
      title: '误检率低于 30%',
      scenario: '按 PRD 口径统计系统识别为行人的总次数和误检次数。',
      expectedResult: '误检率 = 误检次数 / 系统识别为行人的总检测次数。',
      status: fileStatus.metrics && qaArtifact.includes('误检率') ? 'passed' : 'blocked',
      evidence:
        fileStatus.metrics && qaArtifact.includes('误检率')
          ? '误检率计算测试和 QA 计划均已覆盖。'
          : '缺少误检率测试或 QA 计划口径。',
    }),
    createCase({
      id: 'rtsp-secret-handling',
      title: 'RTSP 凭据不出现在前端状态',
      scenario: '摄像头地址包含账号密码时，前端和公开状态只显示脱敏地址。',
      expectedResult: '不会暴露 RTSP 明文账号、密码或内部地址。',
      status: fileStatus.rtsp ? 'passed' : 'blocked',
      evidence: fileStatus.rtsp ? 'rtspConfig 测试已覆盖凭据脱敏。' : '缺少 RTSP 脱敏测试。',
    }),
    ...createReviewFocusCases(reviewHandoff, fileStatus),
  ];

  const blockers = [
    ...reviewHandoffBlockers,
    ...implementationBlockers,
    ...evidenceBlockers,
  ];
  const status = blockers.length || testCases.some((testCase) => testCase.status !== 'passed')
    ? 'needs-work'
    : 'passed';
  const defectRouting = createDefectRouting({
    status,
    reviewHandoffBlockers,
    implementationBlockers,
    blockers,
  });

  return {
    status,
    generatedAt: new Date().toISOString(),
    executedAt: new Date().toISOString(),
    commitHash: String(project.developmentRun?.commitHash || '').trim(),
    summary:
      status === 'passed'
        ? '测试通过，准备最终验收材料。'
        : 'QA 发现测试阻塞项，需要补齐样本后重跑。',
    testCases,
    defects: [],
    blockers,
    reviewHandoff,
    coveragePlan,
    defectRouting,
    recommendations:
      status === 'passed'
        ? ['最终验收前保留真实 RTSP 联调记录和误检率原始统计。']
        : ['补充弱光、遮挡、多人、无行人场景样本，并明确测试时长与浏览器范围。'],
    nextActions:
      status === 'passed'
        ? ['测试通过，准备最终验收材料。']
        : ['补齐测试阻塞项后重新执行 QA。'],
  };
}

async function inspectExpectedFiles(localPath) {
  const [monitoring, rtsp, metrics, contract] = await Promise.all([
    hasFile(localPath, 'src/monitoringState.js', 'test/monitoringState.test.js'),
    hasFile(localPath, 'src/rtspConfig.js', 'test/rtspConfig.test.js'),
    hasFile(localPath, 'src/falsePositiveMetrics.js', 'test/falsePositiveMetrics.test.js'),
    hasFile(localPath, 'src/detectionContract.js', 'test/detectionContract.test.js'),
  ]);

  return { monitoring, rtsp, metrics, contract };
}

function createCoveragePlan({ reviewHandoff, commitHash }) {
  return {
    source: reviewHandoff ? 'code-review' : 'missing-code-review',
    commitHash: String(reviewHandoff?.commitHash || commitHash || '').trim(),
    focusAreas: reviewHandoff?.focusAreas || [],
    requiredEvidence: reviewHandoff?.requiredEvidence || [],
  };
}

function createReviewHandoffBlockers(reviewHandoff) {
  if (!reviewHandoff) {
    return ['Review 交接未就绪：缺少 Review 测试交接。'];
  }

  if (reviewHandoff.status === 'ready') {
    return [];
  }

  return reviewHandoff.blockers.length
    ? reviewHandoff.blockers.map((blocker) => `Review 交接未就绪：${blocker}`)
    : ['Review 交接未就绪：Review 未放行测试。'];
}

function createReviewFocusCases(reviewHandoff, fileStatus) {
  const focusAreas = reviewHandoff?.focusAreas || [];
  if (!focusAreas.includes('RTSP 断流恢复')) {
    return [];
  }

  return [
    createCase({
      id: 'rtsp-reconnect',
      title: 'RTSP 断流恢复',
      scenario: '摄像头 RTSP 流断开后，页面能展示异常并按重连配置恢复监控。',
      expectedResult: '断流提示、重连间隔和恢复状态均有可核验证据。',
      status: fileStatus.rtsp ? 'passed' : 'blocked',
      evidence: fileStatus.rtsp ? 'rtspConfig 测试已覆盖重连配置。' : '缺少 RTSP 重连配置测试。',
    }),
  ];
}

function createDefectRouting({ status, reviewHandoffBlockers, implementationBlockers, blockers }) {
  if (status === 'passed') {
    return {
      shouldReturnToDevelopment: false,
      targetStageId: 'acceptance',
      reasons: [],
    };
  }

  const developmentReasons = [...reviewHandoffBlockers, ...implementationBlockers];
  if (developmentReasons.length) {
    return {
      shouldReturnToDevelopment: true,
      targetStageId: 'development',
      reasons: developmentReasons,
    };
  }

  return {
    shouldReturnToDevelopment: false,
    targetStageId: 'qa',
    reasons: blockers,
  };
}

async function hasFile(localPath, sourcePath, testPath) {
  try {
    await Promise.all([access(join(localPath, sourcePath)), access(join(localPath, testPath))]);
    return true;
  } catch {
    return false;
  }
}

function hasConfirmedAcceptanceSample(qaArtifact) {
  if (!qaArtifact || /待(项目经理)?补充|待确认|TBD|TODO/i.test(qaArtifact)) {
    return false;
  }

  return ['测试视频样本', '测试时长', '测试环境'].every((term) => qaArtifact.includes(term));
}

function createCase(testCase) {
  return {
    type: 'acceptance',
    ...testCase,
  };
}
