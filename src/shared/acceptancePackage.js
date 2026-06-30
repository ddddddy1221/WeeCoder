const REQUIRED_DELIVERABLES = [
  {
    id: 'prd',
    title: 'PRD',
    artifactStageId: 'prd-approval',
    ready(project) {
      return project.prdStatus === 'generated' && hasArtifact(project, 'prd-approval');
    },
    missing: 'PRD 尚未生成或未归档。',
  },
  {
    id: 'technical-handoff',
    title: '技术交接包',
    artifactStageId: 'architecture',
    ready(project) {
      return project.technicalHandoffStatus === 'generated' && hasArtifact(project, 'architecture');
    },
    missing: '技术方案与交接包尚未生成。',
  },
  {
    id: 'ops-handoff',
    title: '运维交接',
    artifactStageId: 'ops-requirements',
    ready(project) {
      return hasArtifact(project, 'ops-requirements');
    },
    missing: '运维需求和交接说明尚未归档。',
  },
  {
    id: 'development-result',
    title: '开发结果',
    artifactStageId: 'development',
    ready(project) {
      return project.developmentRun?.status === 'completed';
    },
    missing: '开发执行结果尚未完成。',
  },
  {
    id: 'code-review',
    title: '代码/安全/性能 Review',
    artifactStageId: 'review',
    ready(project) {
      return project.codeReviewReport?.status === 'passed';
    },
    missing: '代码/安全/性能 Review 尚未通过。',
  },
  {
    id: 'qa-report',
    title: 'QA 测试报告',
    artifactStageId: 'qa',
    ready(project) {
      return project.qaRun?.status === 'passed';
    },
    missing: 'QA 测试尚未通过。',
  },
  {
    id: 'qa-evidence',
    title: '测试证据',
    artifactStageId: 'qa',
    ready(project) {
      return project.qaEvidence?.status === 'ready';
    },
    missing: '测试样本、时长、环境和浏览器范围尚未补齐。',
  },
];

export function createAcceptancePackage(project, { actor = '负责人', generatedAt = new Date().toISOString() } = {}) {
  const deliverables = REQUIRED_DELIVERABLES.map((item) => {
    const ready = item.ready(project);
    return {
      id: item.id,
      title: item.title,
      artifactStageId: item.artifactStageId,
      status: ready ? 'ready' : 'missing',
      evidence: ready ? buildDeliverableEvidence(project, item) : item.missing,
    };
  });
  const blockers = deliverables
    .filter((item) => item.status !== 'ready')
    .map((item) => item.evidence);
  const ready = blockers.length === 0;

  return normalizeAcceptancePackage({
    status: ready ? 'ready' : 'blocked',
    signoffStatus: ready ? 'pending' : 'blocked',
    generatedAt,
    generatedBy: actor,
    summary: ready
      ? '交付材料已汇总完成，等待负责人最终签收。'
      : '最终验收包仍有缺失材料，暂不能签收。',
    deliverables,
    qa: {
      status: project.qaRun?.status || 'missing',
      passedCount: Number(project.qaRun?.passedCount || 0),
      totalCount: Number(project.qaRun?.totalCount || 0),
      commitHash: project.qaRun?.commitHash || project.developmentRun?.commitHash || '',
      evidenceStatus: project.qaEvidence?.status || 'incomplete',
      sampleSet: project.qaEvidence?.sampleSet || '',
      durationMinutes: Number(project.qaEvidence?.durationMinutes || 0),
      environment: project.qaEvidence?.environment || '',
      browserScope: project.qaEvidence?.browserScope || '',
      requireFalsePositiveMetrics: Boolean(project.qaEvidence?.requireFalsePositiveMetrics),
      totalDetections: normalizeNullableNumber(project.qaEvidence?.totalDetections),
      falsePositiveCount: normalizeNullableNumber(project.qaEvidence?.falsePositiveCount),
      falsePositiveRate: normalizeNullableNumber(project.qaEvidence?.falsePositiveRate),
      falsePositiveThreshold: normalizeNullableNumber(project.qaEvidence?.falsePositiveThreshold ?? 0.3),
      falsePositivePassed:
        typeof project.qaEvidence?.falsePositivePassed === 'boolean'
          ? project.qaEvidence.falsePositivePassed
          : null,
      qualityGateStatus: project.qaEvidence?.qualityGateStatus || 'not-required',
    },
    ops: {
      status: hasArtifact(project, 'ops-requirements') ? 'ready' : 'missing',
      artifactStageId: 'ops-requirements',
      evidence: hasArtifact(project, 'ops-requirements')
        ? '运维需求和交接说明已归档。'
        : '运维需求和交接说明尚未归档。',
    },
    residualRisks: collectResidualRisks(project, { packageReady: ready }),
    blockers,
    nextActions: ready
      ? ['负责人检查验收包并完成最终签收。', '签收前归档真实 RTSP 联调记录和误检率原始统计。']
      : ['补齐缺失交付材料后重新生成最终验收包。'],
  });
}

export function normalizeAcceptancePackage(acceptancePackage) {
  if (!acceptancePackage) {
    return {
      status: 'not-generated',
      signoffStatus: 'not-started',
      signedOffBy: '',
      signedOffAt: '',
      signoffOpinion: '',
      archiveVersion: '',
      generatedAt: '',
      generatedBy: '',
      summary: '最终验收包尚未生成。',
      deliverables: [],
      qa: {
        status: 'missing',
        passedCount: 0,
        totalCount: 0,
        commitHash: '',
        evidenceStatus: 'incomplete',
        sampleSet: '',
        durationMinutes: 0,
        environment: '',
        browserScope: '',
        requireFalsePositiveMetrics: false,
        totalDetections: null,
        falsePositiveCount: null,
        falsePositiveRate: null,
        falsePositiveThreshold: 0.3,
        falsePositivePassed: null,
        qualityGateStatus: 'not-required',
      },
      ops: {
        status: 'missing',
        artifactStageId: 'ops-requirements',
        evidence: '运维需求和交接说明尚未归档。',
      },
      residualRisks: [],
      blockers: ['最终验收包尚未生成。'],
      nextActions: ['QA 通过后生成最终验收包。'],
    };
  }

  const blockers = normalizeStringList(acceptancePackage.blockers);
  return {
    status: normalizePackageStatus(acceptancePackage.status, blockers),
    signoffStatus: normalizeSignoffStatus(acceptancePackage.signoffStatus),
    signedOffBy: String(acceptancePackage.signedOffBy || ''),
    signedOffAt: String(acceptancePackage.signedOffAt || ''),
    signoffOpinion: String(acceptancePackage.signoffOpinion || ''),
    archiveVersion: String(acceptancePackage.archiveVersion || ''),
    generatedAt: String(acceptancePackage.generatedAt || ''),
    generatedBy: String(acceptancePackage.generatedBy || ''),
    summary: String(acceptancePackage.summary || ''),
    deliverables: normalizeDeliverables(acceptancePackage.deliverables),
    qa: {
      status: String(acceptancePackage.qa?.status || 'missing'),
      passedCount: Number(acceptancePackage.qa?.passedCount || 0),
      totalCount: Number(acceptancePackage.qa?.totalCount || 0),
      commitHash: String(acceptancePackage.qa?.commitHash || ''),
      evidenceStatus: String(acceptancePackage.qa?.evidenceStatus || 'incomplete'),
      sampleSet: String(acceptancePackage.qa?.sampleSet || ''),
      durationMinutes: Number(acceptancePackage.qa?.durationMinutes || 0),
      environment: String(acceptancePackage.qa?.environment || ''),
      browserScope: String(acceptancePackage.qa?.browserScope || ''),
      requireFalsePositiveMetrics: Boolean(acceptancePackage.qa?.requireFalsePositiveMetrics),
      totalDetections: normalizeNullableNumber(acceptancePackage.qa?.totalDetections),
      falsePositiveCount: normalizeNullableNumber(acceptancePackage.qa?.falsePositiveCount),
      falsePositiveRate: normalizeNullableNumber(acceptancePackage.qa?.falsePositiveRate),
      falsePositiveThreshold: normalizeNullableNumber(acceptancePackage.qa?.falsePositiveThreshold ?? 0.3),
      falsePositivePassed:
        typeof acceptancePackage.qa?.falsePositivePassed === 'boolean'
          ? acceptancePackage.qa.falsePositivePassed
          : null,
      qualityGateStatus: String(acceptancePackage.qa?.qualityGateStatus || 'not-required'),
    },
    ops: {
      status: ['ready', 'missing'].includes(acceptancePackage.ops?.status)
        ? acceptancePackage.ops.status
        : 'missing',
      artifactStageId: String(acceptancePackage.ops?.artifactStageId || 'ops-requirements'),
      evidence: String(acceptancePackage.ops?.evidence || ''),
    },
    residualRisks: normalizeResidualRisks(acceptancePackage.residualRisks),
    blockers,
    nextActions: normalizeStringList(acceptancePackage.nextActions),
  };
}

export function signOffAcceptancePackage(
  acceptancePackage,
  {
    actor = '负责人',
    opinion = '验收通过，交付包归档。',
    archiveVersion = '',
    signedAt = new Date().toISOString(),
  } = {},
) {
  const normalized = normalizeAcceptancePackage(acceptancePackage);

  if (normalized.status !== 'ready') {
    throw new Error('最终验收包尚未就绪，不能签收。');
  }

  const signedOffBy = String(actor || '').trim() || '负责人';
  const signoffOpinion = String(opinion || '').trim() || '验收通过，交付包归档。';
  const resolvedArchiveVersion =
    String(archiveVersion || '').trim() || buildDefaultArchiveVersion(signedAt);

  return normalizeAcceptancePackage({
    ...normalized,
    signoffStatus: 'signed-off',
    signedOffBy,
    signedOffAt: signedAt,
    signoffOpinion,
    archiveVersion: resolvedArchiveVersion,
    summary: '项目已完成最终验收，交付包已归档。',
    residualRisks: normalized.residualRisks.filter((risk) => !isClosedBySignoffRisk(risk.title)),
    blockers: [],
    nextActions: ['项目已完成最终验收，交付包已归档。'],
  });
}

function hasArtifact(project, stageId) {
  return Boolean(String(project.artifacts?.[stageId] || '').trim());
}

function buildDeliverableEvidence(project, item) {
  if (item.id === 'development-result') {
    return `开发执行已完成，提交 ${project.developmentRun?.commitHash || '未记录'}。`;
  }
  if (item.id === 'qa-report') {
    return `QA 已通过 ${project.qaRun?.passedCount || 0}/${project.qaRun?.totalCount || 0} 个用例。`;
  }
  if (item.id === 'qa-evidence') {
    if (Number.isFinite(project.qaEvidence?.falsePositiveRate)) {
      return `测试证据已覆盖样本、时长、环境、浏览器范围和误检率 ${Math.round(project.qaEvidence.falsePositiveRate * 100)}%。`;
    }
    return `测试证据已覆盖样本、时长、环境和浏览器范围。`;
  }
  return `${item.title} 已归档。`;
}

function collectResidualRisks(project, { packageReady = false } = {}) {
  return Object.entries(project.stageRiskRegister || {}).flatMap(([stageId, entry]) => {
    if (packageReady && (stageId === 'acceptance' || entry.stageName === '最终验收')) {
      return [
        {
          stageId: 'acceptance',
          stageName: entry.stageName || '最终验收',
          riskLevel: 'medium',
          title: '负责人签收待完成',
          detail:
            '最终验收包已经生成并且交付材料齐备，但负责人尚未完成签收，项目仍不应标记为商业交付闭环完成。',
        },
      ];
    }

    const issues = [
      ...normalizeIssueList(entry.potentialRisks),
      ...normalizeIssueList(entry.functionalGaps),
    ];
    return issues
      .filter(Boolean)
      .map((issue) => ({
        stageId: entry.stageId || stageId,
        stageName: entry.stageName || '',
        riskLevel: entry.riskLevel || 'medium',
        title: issue.title,
        detail: issue.detail,
      }));
  });
}

function normalizeDeliverables(items = []) {
  return items
    .filter(Boolean)
    .map((item) => ({
      id: String(item.id || ''),
      title: String(item.title || ''),
      artifactStageId: String(item.artifactStageId || ''),
      status: item.status === 'ready' ? 'ready' : 'missing',
      evidence: String(item.evidence || ''),
    }))
    .filter((item) => item.id && item.title);
}

function normalizeResidualRisks(items = []) {
  return items
    .filter(Boolean)
    .map((item) => ({
      stageId: String(item.stageId || ''),
      stageName: String(item.stageName || ''),
      riskLevel: String(item.riskLevel || 'medium'),
      title: String(item.title || ''),
      detail: String(item.detail || ''),
    }))
    .filter((item) => item.title);
}

function normalizeIssueList(items = []) {
  return items
    .filter(Boolean)
    .map((item) =>
      typeof item === 'string'
        ? { title: item, detail: '' }
        : { title: String(item.title || '').trim(), detail: String(item.detail || '').trim() },
    )
    .filter((item) => item.title);
}

function normalizeStringList(items = []) {
  return items.map((item) => String(item || '').trim()).filter(Boolean);
}

function normalizeNullableNumber(value) {
  if (value === null || value === '' || typeof value === 'undefined') {
    return null;
  }
  const normalized = Number(value);
  return Number.isFinite(normalized) ? normalized : null;
}

function normalizePackageStatus(status, blockers) {
  if (['ready', 'blocked', 'not-generated'].includes(status)) {
    return status;
  }
  return blockers.length ? 'blocked' : 'ready';
}

function normalizeSignoffStatus(status) {
  return ['not-started', 'pending', 'blocked', 'signed-off'].includes(status)
    ? status
    : 'pending';
}

function buildDefaultArchiveVersion(signedAt) {
  const value = String(signedAt || '');
  const datePart = value.slice(0, 10).replaceAll('-', '.');
  return datePart ? `acceptance-${datePart}` : 'acceptance-archive';
}

function isClosedBySignoffRisk(title) {
  return [
    '负责人签收待完成',
    '最终验收包尚未汇总',
    '缺少最终交付包',
    '签收记录尚未结构化',
  ].includes(title);
}
