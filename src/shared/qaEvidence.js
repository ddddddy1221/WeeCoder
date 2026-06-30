export function normalizeQaEvidence(evidence, options = {}) {
  if (!evidence) {
    return null;
  }

  const requireFalsePositiveMetrics = Boolean(
    options.requireFalsePositiveMetrics || evidence.requireFalsePositiveMetrics,
  );
  const sampleSet = String(evidence.sampleSet || '').trim();
  const durationMinutes = Number(evidence.durationMinutes);
  const environment = String(evidence.environment || '').trim();
  const browserScope = String(evidence.browserScope || '').trim();
  const falsePositiveThreshold = normalizeFalsePositiveThreshold(evidence.falsePositiveThreshold);
  const totalDetections = normalizeNonNegativeInteger(evidence.totalDetections);
  const falsePositiveCount = normalizeNonNegativeInteger(evidence.falsePositiveCount);
  const missingFields = [
    sampleSet ? '' : 'sampleSet',
    Number.isFinite(durationMinutes) && durationMinutes > 0 ? '' : 'durationMinutes',
    environment ? '' : 'environment',
    browserScope ? '' : 'browserScope',
  ].filter(Boolean);
  const falsePositiveMetrics = normalizeFalsePositiveMetrics({
    totalDetections,
    falsePositiveCount,
    falsePositiveThreshold,
    requireFalsePositiveMetrics,
  });
  missingFields.push(...falsePositiveMetrics.missingFields);

  return {
    status: missingFields.length ? 'incomplete' : 'ready',
    recordedAt: String(evidence.recordedAt || '').trim(),
    recordedBy: String(evidence.recordedBy || evidence.actor || '').trim(),
    sampleSet,
    durationMinutes: Number.isFinite(durationMinutes) && durationMinutes > 0 ? durationMinutes : 0,
    environment,
    browserScope,
    notes: String(evidence.notes || '').trim(),
    missingFields,
    requireFalsePositiveMetrics,
    totalDetections,
    falsePositiveCount,
    falsePositiveRate: falsePositiveMetrics.falsePositiveRate,
    falsePositiveThreshold,
    falsePositivePassed: falsePositiveMetrics.falsePositivePassed,
    qualityGateStatus: falsePositiveMetrics.qualityGateStatus,
  };
}

function normalizeFalsePositiveMetrics({
  totalDetections,
  falsePositiveCount,
  falsePositiveThreshold,
  requireFalsePositiveMetrics,
}) {
  const hasTotalDetections = Number.isInteger(totalDetections) && totalDetections > 0;
  const hasFalsePositiveCount = Number.isInteger(falsePositiveCount) && falsePositiveCount >= 0;
  const missingFields = [];

  if (requireFalsePositiveMetrics && !hasTotalDetections) {
    missingFields.push('totalDetections');
  }
  if (
    requireFalsePositiveMetrics &&
    (!hasFalsePositiveCount || (hasTotalDetections && falsePositiveCount > totalDetections))
  ) {
    missingFields.push('falsePositiveCount');
  }

  if (!hasTotalDetections || !hasFalsePositiveCount || falsePositiveCount > totalDetections) {
    return {
      falsePositiveRate: null,
      falsePositivePassed: null,
      qualityGateStatus: requireFalsePositiveMetrics ? 'incomplete' : 'not-required',
      missingFields,
    };
  }

  const falsePositiveRate = Number((falsePositiveCount / totalDetections).toFixed(4));
  const falsePositivePassed = falsePositiveRate <= falsePositiveThreshold;
  if (requireFalsePositiveMetrics && !falsePositivePassed) {
    missingFields.push('falsePositiveRate');
  }

  return {
    falsePositiveRate,
    falsePositivePassed,
    qualityGateStatus: falsePositivePassed ? 'passed' : 'failed',
    missingFields,
  };
}

function normalizeNonNegativeInteger(value) {
  if (value === '' || value === null || typeof value === 'undefined') {
    return null;
  }
  const normalized = Number(value);
  if (!Number.isFinite(normalized) || normalized < 0) {
    return null;
  }
  return Math.floor(normalized);
}

function normalizeFalsePositiveThreshold(value) {
  const normalized = Number(value);
  if (!Number.isFinite(normalized) || normalized <= 0) {
    return 0.3;
  }
  return normalized > 1 ? normalized / 100 : normalized;
}
