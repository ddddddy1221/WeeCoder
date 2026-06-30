const REVIEW_STATUSES = new Set(['unreviewed', 'true-positive', 'false-positive']);

export function createYoloQaSession({
  actor = '测试',
  sampleSet = '',
  environment = '',
  browserScope = '',
  channels = [],
  falsePositiveThreshold = 0.3,
  startedAt = new Date().toISOString(),
} = {}) {
  return normalizeYoloQaSession({
    id: makeYoloQaSessionId(startedAt),
    status: 'running',
    startedAt,
    startedBy: actor,
    completedAt: '',
    completedBy: '',
    sampleSet,
    environment,
    browserScope,
    channels,
    falsePositiveThreshold,
    durationMinutes: 0,
    events: [],
    metrics: createEmptyMetrics(falsePositiveThreshold),
  });
}

export function normalizeYoloQaSession(session) {
  if (!session) {
    return null;
  }

  const falsePositiveThreshold = normalizeThreshold(session.falsePositiveThreshold);
  const events = Array.isArray(session.events)
    ? session.events.map(normalizeYoloQaDetectionEvent).filter((event) => event.id)
    : [];
  const metrics = session.metrics?.totalDetections
    ? normalizeYoloQaMetrics(session.metrics, falsePositiveThreshold)
    : computeYoloQaMetrics(events, falsePositiveThreshold);

  return {
    id: String(session.id || '').trim() || makeYoloQaSessionId(session.startedAt),
    status: ['running', 'completed'].includes(session.status) ? session.status : 'running',
    startedAt: String(session.startedAt || '').trim(),
    startedBy: String(session.startedBy || session.actor || '').trim(),
    completedAt: String(session.completedAt || '').trim(),
    completedBy: String(session.completedBy || '').trim(),
    sampleSet: String(session.sampleSet || '').trim(),
    environment: String(session.environment || '').trim(),
    browserScope: String(session.browserScope || '').trim(),
    channels: normalizeChannels(session.channels),
    falsePositiveThreshold,
    durationMinutes: normalizePositiveNumber(session.durationMinutes),
    events,
    metrics,
  };
}

export function addYoloQaDetectionEvent(session, event = {}) {
  const normalized = normalizeYoloQaSession(session);
  assertRunningSession(normalized);
  const nextEvent = normalizeYoloQaDetectionEvent({
    ...event,
    id: event.id || makeYoloQaEventId(event.occurredAt),
    occurredAt: event.occurredAt || new Date().toISOString(),
    reviewStatus: event.reviewStatus || 'unreviewed',
  });
  if (!nextEvent.id) {
    throw new Error('检测事件缺少 ID。');
  }

  return normalizeYoloQaSession({
    ...normalized,
    events: [nextEvent, ...normalized.events.filter((item) => item.id !== nextEvent.id)],
  });
}

export function reviewYoloQaDetectionEvent(session, eventId, review = {}) {
  const normalized = normalizeYoloQaSession(session);
  assertRunningSession(normalized);
  const normalizedEventId = String(eventId || '').trim();
  const reviewStatus = normalizeReviewStatus(review.reviewStatus);
  if (reviewStatus === 'unreviewed') {
    throw new Error('请选择正确检测或误检。');
  }
  let matched = false;
  const reviewedAt = String(review.reviewedAt || '').trim() || new Date().toISOString();
  const events = normalized.events.map((event) => {
    if (event.id !== normalizedEventId) {
      return event;
    }
    matched = true;
    return {
      ...event,
      reviewStatus,
      reviewNote: String(review.note || review.reviewNote || '').trim(),
      reviewedBy: String(review.actor || review.reviewedBy || '').trim(),
      reviewedAt,
    };
  });
  if (!matched) {
    throw new Error(`未找到检测事件：${normalizedEventId}`);
  }

  return normalizeYoloQaSession({ ...normalized, events });
}

export function completeYoloQaSession(session, {
  actor = '测试',
  endedAt = new Date().toISOString(),
} = {}) {
  const normalized = normalizeYoloQaSession(session);
  assertRunningSession(normalized);
  if (!normalized.events.length) {
    throw new Error('测试批次没有检测事件，不能完成。');
  }
  const unreviewedCount = normalized.events.filter((event) => event.reviewStatus === 'unreviewed').length;
  if (unreviewedCount) {
    throw new Error('检测事件尚未全部标注，不能完成测试批次。');
  }
  const durationMinutes = computeDurationMinutes(normalized.startedAt, endedAt) || normalized.durationMinutes || 1;
  const metrics = computeYoloQaMetrics(normalized.events, normalized.falsePositiveThreshold);

  return normalizeYoloQaSession({
    ...normalized,
    status: 'completed',
    completedAt: endedAt,
    completedBy: actor,
    durationMinutes,
    metrics,
  });
}

function normalizeYoloQaDetectionEvent(event = {}) {
  return {
    id: String(event.id || '').trim(),
    channel: normalizeInteger(event.channel),
    personCount: normalizeInteger(event.personCount) || 0,
    confidence: normalizeNullableNumber(event.confidence),
    occurredAt: String(event.occurredAt || '').trim(),
    source: String(event.source || 'manual').trim(),
    snapshotUrl: String(event.snapshotUrl || '').trim(),
    reviewStatus: normalizeReviewStatus(event.reviewStatus),
    reviewNote: String(event.reviewNote || event.note || '').trim(),
    reviewedBy: String(event.reviewedBy || '').trim(),
    reviewedAt: String(event.reviewedAt || '').trim(),
  };
}

function computeYoloQaMetrics(events, falsePositiveThreshold) {
  const totalDetections = events.length;
  const truePositiveCount = events.filter((event) => event.reviewStatus === 'true-positive').length;
  const falsePositiveCount = events.filter((event) => event.reviewStatus === 'false-positive').length;
  const reviewedCount = truePositiveCount + falsePositiveCount;
  const falsePositiveRate = totalDetections
    ? Number((falsePositiveCount / totalDetections).toFixed(4))
    : null;
  const falsePositivePassed = falsePositiveRate === null ? null : falsePositiveRate <= falsePositiveThreshold;
  const qualityGateStatus =
    reviewedCount < totalDetections
      ? 'incomplete'
      : falsePositivePassed
        ? 'passed'
        : 'failed';

  return {
    totalDetections,
    reviewedCount,
    truePositiveCount,
    falsePositiveCount,
    falsePositiveRate,
    falsePositiveThreshold,
    falsePositivePassed,
    qualityGateStatus,
  };
}

function normalizeYoloQaMetrics(metrics = {}, falsePositiveThreshold) {
  return {
    totalDetections: normalizeInteger(metrics.totalDetections) || 0,
    reviewedCount: normalizeInteger(metrics.reviewedCount) || 0,
    truePositiveCount: normalizeInteger(metrics.truePositiveCount) || 0,
    falsePositiveCount: normalizeInteger(metrics.falsePositiveCount) || 0,
    falsePositiveRate: normalizeNullableNumber(metrics.falsePositiveRate),
    falsePositiveThreshold,
    falsePositivePassed: typeof metrics.falsePositivePassed === 'boolean' ? metrics.falsePositivePassed : null,
    qualityGateStatus: String(metrics.qualityGateStatus || 'incomplete'),
  };
}

function createEmptyMetrics(falsePositiveThreshold) {
  return {
    totalDetections: 0,
    reviewedCount: 0,
    truePositiveCount: 0,
    falsePositiveCount: 0,
    falsePositiveRate: null,
    falsePositiveThreshold: normalizeThreshold(falsePositiveThreshold),
    falsePositivePassed: null,
    qualityGateStatus: 'incomplete',
  };
}

function assertRunningSession(session) {
  if (!session || session.status !== 'running') {
    throw new Error('没有进行中的 YOLO 测试批次。');
  }
}

function normalizeChannels(channels = []) {
  return Array.isArray(channels)
    ? channels.map(normalizeInteger).filter((channel) => Number.isInteger(channel) && channel > 0)
    : [];
}

function normalizeReviewStatus(status) {
  const normalized = String(status || 'unreviewed').trim();
  return REVIEW_STATUSES.has(normalized) ? normalized : 'unreviewed';
}

function normalizeThreshold(value) {
  const normalized = Number(value);
  if (!Number.isFinite(normalized) || normalized <= 0) {
    return 0.3;
  }
  return normalized > 1 ? normalized / 100 : normalized;
}

function normalizeInteger(value) {
  if (value === '' || value === null || typeof value === 'undefined') {
    return null;
  }
  const normalized = Number(value);
  return Number.isFinite(normalized) ? Math.floor(normalized) : null;
}

function normalizePositiveNumber(value) {
  const normalized = Number(value);
  return Number.isFinite(normalized) && normalized > 0 ? normalized : 0;
}

function normalizeNullableNumber(value) {
  if (value === '' || value === null || typeof value === 'undefined') {
    return null;
  }
  const normalized = Number(value);
  return Number.isFinite(normalized) ? normalized : null;
}

function computeDurationMinutes(startedAt, endedAt) {
  const start = new Date(startedAt).getTime();
  const end = new Date(endedAt).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
    return 0;
  }
  return Math.max(1, Math.ceil((end - start) / 60000));
}

function makeYoloQaSessionId(startedAt = new Date().toISOString()) {
  const suffix = String(startedAt || Date.now()).replace(/[^0-9a-z]/gi, '').slice(0, 14);
  return `yolo-qa-${suffix || Date.now().toString(36)}`;
}

function makeYoloQaEventId(occurredAt = new Date().toISOString()) {
  const suffix =
    globalThis.crypto?.randomUUID?.().slice(0, 8) ||
    String(occurredAt || Date.now()).replace(/[^0-9a-z]/gi, '').slice(0, 14);
  return `detect-${suffix}`;
}
