export function normalizeCodeReviewReport(report) {
  if (!report) {
    return null;
  }

  const categories = Array.isArray(report.categories)
    ? report.categories.map(normalizeCategory)
    : [];
  const blockers = normalizeStringList(report.blockers);
  const status = report.status === 'passed' && blockers.length === 0 ? 'passed' : 'needs-work';

  return {
    status,
    reviewedAt: String(report.reviewedAt || '').trim(),
    commitHash: String(report.commitHash || '').trim(),
    summary: String(report.summary || '').trim(),
    categories,
    blockers,
    recommendations: normalizeStringList(report.recommendations),
    nextActions: normalizeStringList(report.nextActions),
    sourceChangePackage: normalizeSourceChangePackage(report.sourceChangePackage),
    reviewGate: normalizeReviewGate(report.reviewGate, status, blockers),
    qaHandoff: normalizeQaHandoff(report.qaHandoff),
  };
}

function normalizeCategory(category = {}) {
  return {
    id: String(category.id || '').trim(),
    label: String(category.label || category.id || '').trim(),
    status: category.status === 'passed' ? 'passed' : 'failed',
    summary: String(category.summary || '').trim(),
    findings: Array.isArray(category.findings)
      ? category.findings.map((finding) => ({
          severity: String(finding.severity || 'medium').trim(),
          file: String(finding.file || '').trim(),
          message: String(finding.message || '').trim(),
          title: String(finding.title || finding.message || '').trim(),
          detail: String(finding.detail || finding.file || '').trim(),
        }))
      : [],
  };
}

function normalizeSourceChangePackage(source) {
  if (!source) {
    return null;
  }

  const filesChanged = normalizeStringList(source.filesChanged);
  const filesChangedCount = Number.isFinite(source.filesChangedCount)
    ? source.filesChangedCount
    : filesChanged.length;

  return {
    status: String(source.status || '').trim(),
    generatedAt: String(source.generatedAt || source.createdAt || '').trim(),
    commitHash: String(source.commitHash || '').trim(),
    filesChanged,
    filesChangedCount,
    verification: normalizeVerification(source.verification),
  };
}

function normalizeReviewGate(gate = {}, status, blockers) {
  return {
    canAdvanceToQa:
      typeof gate.canAdvanceToQa === 'boolean'
        ? gate.canAdvanceToQa
        : status === 'passed' && blockers.length === 0,
    blockers: normalizeStringList(gate.blockers?.length ? gate.blockers : blockers),
  };
}

function normalizeQaHandoff(handoff) {
  if (!handoff) {
    return null;
  }

  return {
    status: handoff.status === 'ready' ? 'ready' : 'blocked',
    commitHash: String(handoff.commitHash || '').trim(),
    focusAreas: normalizeStringList(handoff.focusAreas),
    requiredEvidence: normalizeStringList(handoff.requiredEvidence),
    blockers: normalizeStringList(handoff.blockers),
  };
}

function normalizeVerification(verification = {}) {
  return {
    total: Number.isFinite(verification.total) ? verification.total : 0,
    passed: Number.isFinite(verification.passed) ? verification.passed : 0,
    failed: Number.isFinite(verification.failed) ? verification.failed : 0,
    blocked: Number.isFinite(verification.blocked) ? verification.blocked : 0,
  };
}

function normalizeStringList(items = []) {
  return Array.isArray(items) ? items.map((item) => String(item || '').trim()).filter(Boolean) : [];
}
