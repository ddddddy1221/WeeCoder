import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

const SECRET_PATTERN = /rtsp:\/\/[^*\s/:]+:[^*\s@/]+@|password\s*[:=]|secret\s*[:=]/i;

export class CodeReviewRunnerError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = 'CodeReviewRunnerError';
    this.details = details;
  }
}

export async function runCodeReview(project) {
  const localPath = String(project.repositoryConfig?.localPath || '').trim();
  if (!localPath) {
    throw new CodeReviewRunnerError('代码 Review 需要先配置本地仓库路径。', { field: 'localPath' });
  }

  const developmentRun = project.developmentRun || {};
  const changePackage = getReadyChangePackage(developmentRun);
  const filesChanged = normalizeStringList(
    changePackage.filesChanged?.length ? changePackage.filesChanged : developmentRun.filesChanged,
  );
  const sourceFiles = filesChanged.filter((file) => file.startsWith('src/') && file.endsWith('.js'));
  const testFiles = filesChanged.filter((file) => file.startsWith('test/') && file.endsWith('.test.js'));
  const sourceContents = await readSourceFiles(localPath, sourceFiles);

  const categories = [
    reviewCodeQuality(developmentRun, sourceFiles, testFiles),
    reviewSecurity(sourceContents),
    reviewPerformance(sourceContents),
  ];
  const blockers = categories
    .filter((category) => category.status === 'failed')
    .map((category) => category.blocker);
  const status = blockers.length ? 'needs-work' : 'passed';

  return {
    status,
    reviewedAt: new Date().toISOString(),
    commitHash: String(changePackage.commitHash || developmentRun.commitHash || '').trim(),
    summary: status === 'passed'
      ? '代码、安全和性能 Review 通过，可以进入测试阶段。'
      : '代码/安全/性能 Review 未通过，需要回流自动开发处理。',
    categories,
    blockers,
    sourceChangePackage: createSourceChangePackageSummary(changePackage, filesChanged),
    reviewGate: {
      canAdvanceToQa: status === 'passed',
      blockers,
    },
    qaHandoff: createQaHandoff({
      status,
      blockers,
      changePackage,
      filesChanged,
    }),
    recommendations: blockers.length
      ? ['修复 Review 阻塞项后重新运行开发检查和代码 Review。']
      : ['测试阶段需要继续覆盖有行人、无行人、多人、遮挡、弱光和断流场景。'],
    nextActions: blockers.length
      ? ['退回自动开发阶段处理 Review 阻塞项。']
      : ['进入测试阶段，生成并执行测试用例。'],
  };
}

function getReadyChangePackage(developmentRun) {
  const changePackage = developmentRun.changePackage || null;
  const blockers = normalizeStringList(changePackage?.reviewGate?.blockers);
  if (
    !changePackage ||
    changePackage.status !== 'ready-for-review' ||
    changePackage.reviewGate?.canStartReview !== true
  ) {
    throw new CodeReviewRunnerError('开发变更包尚未放行，不能开始代码 Review。', {
      field: 'changePackage',
      blockers: blockers.length ? blockers : ['开发变更包未生成或未通过 Review 门禁。'],
    });
  }

  return changePackage;
}

function createSourceChangePackageSummary(changePackage, filesChanged) {
  const verification = changePackage.verification || {};
  return {
    status: changePackage.status,
    generatedAt: String(changePackage.createdAt || '').trim(),
    commitHash: String(changePackage.commitHash || '').trim(),
    filesChanged,
    filesChangedCount: filesChanged.length,
    verification: {
      total: Number.isFinite(verification.total) ? verification.total : 0,
      passed: Number.isFinite(verification.passed) ? verification.passed : 0,
      failed: Number.isFinite(verification.failed) ? verification.failed : 0,
      blocked: Number.isFinite(verification.blocked) ? verification.blocked : 0,
    },
  };
}

function createQaHandoff({ status, blockers, changePackage, filesChanged }) {
  return {
    status: status === 'passed' ? 'ready' : 'blocked',
    commitHash: String(changePackage.commitHash || '').trim(),
    focusAreas: createQaFocusAreas(filesChanged),
    requiredEvidence: [
      '测试样本清单与覆盖场景',
      '测试时长、环境和浏览器范围',
      '总检测次数、误检次数和误检率计算过程',
      '断流、弱光、遮挡和多人场景的回归证据',
    ],
    blockers,
  };
}

function createQaFocusAreas(filesChanged) {
  const focusAreas = ['有行人提示', '无行人误报', '弱光/遮挡', 'RTSP 断流恢复'];
  if (filesChanged.some((file) => file.includes('falsePositive'))) {
    focusAreas.push('误检率统计');
  }
  if (filesChanged.some((file) => file.includes('detectionContract'))) {
    focusAreas.push('YOLO 检测结果契约');
  }

  return [...new Set(focusAreas)];
}

async function readSourceFiles(localPath, sourceFiles) {
  const result = [];
  for (const file of sourceFiles) {
    result.push({
      file,
      content: await readFile(join(localPath, file), 'utf8'),
    });
  }
  return result;
}

function reviewCodeQuality(developmentRun, sourceFiles, testFiles) {
  const failedChecks = normalizeChecks(developmentRun.checks).filter((check) => check.status !== 'passed');
  const missingTests = sourceFiles
    .map((file) => file.replace(/^src\//, 'test/').replace(/\.js$/, '.test.js'))
    .filter((expectedTestFile) => !testFiles.includes(expectedTestFile));
  const findings = [
    ...failedChecks.map((check) => ({
      severity: 'high',
      file: '',
      message: `${check.command} 未通过。`,
    })),
    ...missingTests.map((file) => ({
      severity: 'medium',
      file,
      message: '变更的生产代码缺少对应测试文件。',
    })),
  ];

  return {
    id: 'code-quality',
    label: '代码质量',
    status: findings.length ? 'failed' : 'passed',
    summary: findings.length ? '存在未通过检查或缺少测试。' : '检查命令已通过，生产代码有对应测试。',
    blocker: '代码质量检查未通过：检查命令失败或生产代码缺少测试。',
    findings,
  };
}

function reviewSecurity(sourceContents) {
  const findings = sourceContents
    .filter((item) => SECRET_PATTERN.test(item.content))
    .map((item) => ({
      severity: 'high',
      file: item.file,
      message: '生产代码中疑似包含 RTSP 凭据或明文密钥。',
    }));

  return {
    id: 'security',
    label: '安全',
    status: findings.length ? 'failed' : 'passed',
    summary: findings.length ? '发现疑似明文凭据。' : '未在生产代码中发现 RTSP 明文凭据。',
    blocker: '安全检查未通过：生产代码中疑似包含 RTSP 凭据或明文密钥。',
    findings,
  };
}

function reviewPerformance(sourceContents) {
  const combined = sourceContents.map((item) => item.content).join('\n');
  const hasStaleFrameControl = combined.includes('isDetectionFrameStale') || combined.includes('staleAfterMs');
  const hasReconnectControl = combined.includes('reconnectIntervalMs') || combined.includes('RTSP_RECONNECT_INTERVAL_MS');
  const findings = [];
  if (!hasStaleFrameControl) {
    findings.push({
      severity: 'medium',
      file: 'src/monitoringState.js',
      message: '缺少过期检测结果丢弃逻辑。',
    });
  }
  if (!hasReconnectControl) {
    findings.push({
      severity: 'medium',
      file: 'src/rtspConfig.js',
      message: '缺少 RTSP 重连间隔或超时配置。',
    });
  }

  return {
    id: 'performance',
    label: '性能',
    status: findings.length ? 'failed' : 'passed',
    summary: findings.length ? '实时监控缺少必要延迟控制。' : '已包含检测结果过期判断和 RTSP 重连控制。',
    blocker: '性能检查未通过：缺少过期检测结果丢弃或 RTSP 重连控制。',
    findings,
  };
}

function normalizeChecks(checks = []) {
  return Array.isArray(checks) ? checks : [];
}

function normalizeStringList(items = []) {
  return Array.isArray(items) ? items.map((item) => String(item || '').trim()).filter(Boolean) : [];
}
