import express from 'express';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { Readable } from 'node:stream';
import { isYoloCameraProject } from '../src/shared/yoloDeliveryChain.js';

const DEFAULT_CHANNELS = Object.freeze([72, 73, 74, 75]);
const DEFAULT_WORKER_URL = 'http://127.0.0.1:8765';
const DEFAULT_RTSP_TEMPLATE =
  'rtsp://{username}:{password}@192.168.1.{channel}:554/Streaming/Channels/101';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export function buildYoloMonitorConfig(env = process.env) {
  const channels = parseChannels(env.YOLO_MONITOR_CHANNELS);
  const rtspTemplate = String(env.YOLO_RTSP_URL_TEMPLATE || DEFAULT_RTSP_TEMPLATE).trim();
  const rtspUsername = String(env.YOLO_RTSP_USERNAME || 'admin').trim();
  const rtspPassword = String(env.YOLO_RTSP_PASSWORD || '').trim();
  const workerUrl = normalizeWorkerUrl(env.YOLO_MONITOR_WORKER_URL || DEFAULT_WORKER_URL);
  const dingToken = String(env.DING_TOKEN || env.DINGTALK_TOKEN || '').trim();
  const dingSecret = String(env.DING_SECRET || env.DINGTALK_SECRET || '').trim();

  return {
    channels,
    rtspTemplate,
    rtspUsername,
    rtspPassword,
    workerUrl,
    model: String(env.YOLO_MODEL || 'yolov8n.pt').trim(),
    confidence: parseNumber(env.YOLO_CONFIDENCE, 0.35),
    mode: String(env.YOLO_MONITOR_MODE || 'real').trim() || 'real',
    alertCooldownSeconds: parseInteger(env.YOLO_ALERT_COOLDOWN_SECONDS, 120),
    dingToken,
    dingSecret,
    rtspConfigured: isRtspConfigured({ rtspTemplate, rtspPassword }),
    dingTalkConfigured: Boolean(dingToken && dingSecret),
  };
}

export function buildRtspUrl(config, channel) {
  return String(config.rtspTemplate || DEFAULT_RTSP_TEMPLATE)
    .replaceAll('{channel}', String(channel))
    .replaceAll('{username}', config.rtspUsername || '')
    .replaceAll('{password}', config.rtspPassword || '');
}

export function toSafeYoloMonitorConfig(config) {
  return {
    channels: config.channels,
    workerUrl: config.workerUrl,
    model: config.model,
    confidence: config.confidence,
    mode: config.mode,
    alertCooldownSeconds: config.alertCooldownSeconds,
    rtspConfigured: config.rtspConfigured,
    dingTalkConfigured: config.dingTalkConfigured,
  };
}

export function createYoloProjectRuntimeSummary(
  project = {},
  { config = buildYoloMonitorConfig(), channelPayload = null, error = '' } = {},
) {
  if (!isYoloCameraProject(project)) {
    return {
      isYoloProject: false,
      status: 'not-applicable',
      monitorUrl: '',
      channels: [],
    };
  }

  const safeConfig = toSafeYoloMonitorConfig(config);
  const payload = normalizeChannelsPayload(channelPayload || {}, config.channels);
  const channels = payload.channels.map((channel) => ({
    channel: Number(channel.channel),
    online: Boolean(channel.online),
    personCount: Number(channel.personCount || 0),
    alertState: channel.alertState || 'unknown',
    fps: Number.isFinite(Number(channel.fps)) ? Number(channel.fps) : 0,
    error: channel.error || '',
    updatedAt: channel.updatedAt || '',
  }));
  const onlineChannels = channels.filter((channel) => channel.online);
  const detectionChannels = channels.filter((channel) => channel.personCount > 0);
  const detectedPersonCount = detectionChannels.reduce(
    (total, channel) => total + channel.personCount,
    0,
  );
  const fpsValues = onlineChannels
    .map((channel) => Number(channel.fps || 0))
    .filter((fps) => Number.isFinite(fps) && fps > 0);
  const averageFps = fpsValues.length
    ? Math.round((fpsValues.reduce((total, fps) => total + fps, 0) / fpsValues.length) * 10) / 10
    : 0;
  const worker = {
    online: Boolean(payload.worker?.online),
    mode: payload.worker?.mode || safeConfig.mode || 'real',
    error: payload.worker?.error || error || '',
  };
  const status = resolveRuntimeStatus({
    detectedPersonCount,
    error: worker.error,
    onlineChannelCount: onlineChannels.length,
    workerOnline: worker.online,
  });

  return {
    isYoloProject: true,
    status,
    monitorUrl: '/monitor/yolo',
    config: safeConfig,
    worker,
    totalChannelCount: channels.length,
    onlineChannelCount: onlineChannels.length,
    activeDetectionChannelCount: detectionChannels.length,
    detectedPersonCount,
    averageFps,
    channels,
  };
}

export function createYoloMonitorRouter({
  config = buildYoloMonitorConfig(),
  client = createYoloMonitorClient(config),
  workerManager = createYoloWorkerManager(config),
} = {}) {
  const router = express.Router();

  router.get('/config', (req, res) => {
    res.json({ config: toSafeYoloMonitorConfig(config) });
  });

  router.get('/health', async (req, res, next) => {
    try {
      res.json(await client.getHealth());
    } catch (error) {
      res.status(503).json({ ok: false, worker: { online: false }, error: error.message });
    }
  });

  router.get('/channels', async (req, res) => {
    try {
      const payload = await client.getChannels();
      res.json(normalizeChannelsPayload(payload, config.channels));
    } catch (error) {
      res.status(503).json({
        worker: { online: false, error: error.message },
        channels: config.channels.map((channel) => ({
          channel,
          online: false,
          personCount: 0,
          alertState: 'worker-offline',
          error: error.message,
        })),
      });
    }
  });

  router.post('/start', async (req, res) => {
    try {
      res.json({ worker: await workerManager.start() });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  router.post('/stop', async (req, res) => {
    res.json({ worker: await workerManager.stop() });
  });

  router.post('/dingtalk-test', async (req, res) => {
    try {
      res.json(await client.sendDingTalkTest(req.body || {}));
    } catch (error) {
      res.status(502).json({ ok: false, error: error.message });
    }
  });

  router.get('/stream/:channel', async (req, res) => {
    const channel = Number(req.params.channel);
    if (!config.channels.includes(channel)) {
      res.status(404).json({ error: `通道 ${req.params.channel} 未配置。` });
      return;
    }

    try {
      const upstream = await client.openStream(channel);
      if (!upstream.ok) {
        res.status(upstream.status || 502).json({ error: '检测 worker 未返回视频流。' });
        return;
      }

      res.status(200);
      res.setHeader('Content-Type', upstream.headers.get('content-type') || 'multipart/x-mixed-replace; boundary=frame');
      res.setHeader('Cache-Control', 'no-store');
      Readable.fromWeb(upstream.body).pipe(res);
    } catch (error) {
      res.status(503).json({ error: error.message });
    }
  });

  return router;
}

export function createYoloMonitorClient(config, fetchImpl = globalThis.fetch) {
  return {
    getHealth: () => fetchJson(fetchImpl, `${config.workerUrl}/health`),
    getChannels: () => fetchJson(fetchImpl, `${config.workerUrl}/channels`),
    sendDingTalkTest: (body) =>
      fetchJson(fetchImpl, `${config.workerUrl}/notify-test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body || {}),
      }),
    openStream: (channel) => fetchImpl(`${config.workerUrl}/stream/${channel}.mjpg`),
  };
}

export function createYoloWorkerManager(config) {
  let child = null;
  const workerPath = join(__dirname, '..', 'workers', 'yolo_monitor.py');

  return {
    async start() {
      if (child && !child.killed) {
        return { online: true, pid: child.pid, status: 'already-running' };
      }

      child = spawn('python', [workerPath], {
        cwd: join(__dirname, '..'),
        env: {
          ...process.env,
          YOLO_MONITOR_CHANNELS: config.channels.join(','),
          YOLO_RTSP_URL_TEMPLATE: config.rtspTemplate,
          YOLO_RTSP_USERNAME: config.rtspUsername,
          YOLO_RTSP_PASSWORD: config.rtspPassword,
          YOLO_MONITOR_WORKER_URL: config.workerUrl,
          YOLO_MODEL: config.model,
          YOLO_CONFIDENCE: String(config.confidence),
          YOLO_MONITOR_MODE: config.mode,
          YOLO_ALERT_COOLDOWN_SECONDS: String(config.alertCooldownSeconds),
          DING_TOKEN: config.dingToken,
          DING_SECRET: config.dingSecret,
        },
        stdio: ['ignore', 'ignore', 'ignore'],
      });

      child.on('exit', () => {
        child = null;
      });

      return { online: true, pid: child.pid, status: 'started' };
    },
    async stop() {
      if (!child) {
        return { online: false, status: 'not-running' };
      }
      const pid = child.pid;
      child.kill();
      child = null;
      return { online: false, pid, status: 'stopped' };
    },
  };
}

function normalizeChannelsPayload(payload, configuredChannels) {
  const rows = Array.isArray(payload?.channels) ? payload.channels : [];
  const byChannel = new Map(rows.map((row) => [Number(row.channel), row]));
  return {
    worker: payload?.worker || { online: true },
    channels: configuredChannels.map((channel) => ({
      channel,
      online: false,
      personCount: 0,
      alertState: 'unknown',
      ...(byChannel.get(channel) || {}),
      channel,
    })),
  };
}

function resolveRuntimeStatus({
  detectedPersonCount,
  error,
  onlineChannelCount,
  workerOnline,
}) {
  if (error || !workerOnline) {
    return 'offline';
  }

  if (onlineChannelCount <= 0) {
    return 'no-channel-online';
  }

  if (detectedPersonCount > 0) {
    return 'running-with-detections';
  }

  return 'running';
}

async function fetchJson(fetchImpl, url, options) {
  const response = await fetchImpl(url, options);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || `请求 YOLO worker 失败：${response.status}`);
  }
  return data;
}

function parseChannels(value) {
  const channels = String(value || '')
    .split(',')
    .map((item) => Number.parseInt(item.trim(), 10))
    .filter((item) => Number.isInteger(item) && item > 0);
  return channels.length ? [...new Set(channels)] : [...DEFAULT_CHANNELS];
}

function normalizeWorkerUrl(value) {
  return String(value || DEFAULT_WORKER_URL).trim().replace(/\/+$/, '') || DEFAULT_WORKER_URL;
}

function parseNumber(value, fallback) {
  const next = Number(value);
  return Number.isFinite(next) ? next : fallback;
}

function parseInteger(value, fallback) {
  const next = Number.parseInt(value, 10);
  return Number.isInteger(next) ? next : fallback;
}

function isRtspConfigured({ rtspTemplate, rtspPassword }) {
  if (!rtspTemplate) {
    return false;
  }
  return !rtspTemplate.includes('{password}') || Boolean(rtspPassword);
}
