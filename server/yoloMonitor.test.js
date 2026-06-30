import express from 'express';
import request from 'supertest';
import { describe, expect, test } from 'vitest';
import {
  buildRtspUrl,
  buildYoloMonitorConfig,
  createYoloProjectRuntimeSummary,
  createYoloMonitorRouter,
  toSafeYoloMonitorConfig,
} from './yoloMonitor.js';

describe('YOLO monitor server integration', () => {
  test('builds RTSP URLs from channel configuration without exposing secrets', () => {
    const env = {
      YOLO_MONITOR_CHANNELS: '72, 73, bad, 75',
      YOLO_RTSP_USERNAME: 'admin',
      YOLO_RTSP_PASSWORD: 'secret-password',
      YOLO_RTSP_URL_TEMPLATE:
        'rtsp://{username}:{password}@192.168.1.{channel}:554/Streaming/Channels/101',
      YOLO_MONITOR_WORKER_URL: 'http://127.0.0.1:8765',
      DING_TOKEN: 'ding-token',
      DING_SECRET: 'ding-secret',
    };

    const config = buildYoloMonitorConfig(env);
    expect(config.channels).toEqual([72, 73, 75]);
    expect(buildRtspUrl(config, 73)).toBe(
      'rtsp://admin:secret-password@192.168.1.73:554/Streaming/Channels/101',
    );

    const safe = toSafeYoloMonitorConfig(config);
    expect(JSON.stringify(safe)).not.toContain('secret-password');
    expect(JSON.stringify(safe)).not.toContain('ding-token');
    expect(safe).toMatchObject({
      channels: [72, 73, 75],
      dingTalkConfigured: true,
      rtspConfigured: true,
      workerUrl: 'http://127.0.0.1:8765',
    });
  });

  test('returns YOLO monitor channel status from the worker client', async () => {
    const app = express();
    app.use(express.json());
    app.use('/api/yolo-monitor', createYoloMonitorRouter({
      config: buildYoloMonitorConfig({
        YOLO_MONITOR_CHANNELS: '72,73',
        YOLO_RTSP_URL_TEMPLATE: 'rtsp://{channel}',
      }),
      client: {
        getHealth: async () => ({ ok: true, mode: 'mock' }),
        getChannels: async () => ({
          worker: { online: true, mode: 'mock' },
          channels: [
            { channel: 72, online: true, personCount: 1, alertState: 'sent' },
            { channel: 73, online: true, personCount: 0, alertState: 'idle' },
          ],
        }),
      },
    }));

    const configResponse = await request(app).get('/api/yolo-monitor/config').expect(200);
    expect(configResponse.body.config).toMatchObject({
      channels: [72, 73],
      rtspConfigured: true,
    });

    const channelsResponse = await request(app).get('/api/yolo-monitor/channels').expect(200);
    expect(channelsResponse.body.channels).toEqual([
      expect.objectContaining({ channel: 72, online: true, personCount: 1 }),
      expect.objectContaining({ channel: 73, online: true, personCount: 0 }),
    ]);
  });

  test('rejects stream requests for unconfigured channels', async () => {
    const app = express();
    app.use('/api/yolo-monitor', createYoloMonitorRouter({
      config: buildYoloMonitorConfig({
        YOLO_MONITOR_CHANNELS: '72',
        YOLO_RTSP_URL_TEMPLATE: 'rtsp://{channel}',
      }),
      client: {
        getHealth: async () => ({ ok: true }),
        getChannels: async () => ({ channels: [] }),
      },
    }));

    const response = await request(app).get('/api/yolo-monitor/stream/73').expect(404);
    expect(response.body.error).toContain('未配置');
  });

  test('creates a project runtime summary from real YOLO channel status', () => {
    const config = buildYoloMonitorConfig({
      YOLO_MONITOR_CHANNELS: '72,73,74,75',
      YOLO_RTSP_URL_TEMPLATE: 'rtsp://{username}:{password}@192.168.1.{channel}:554/Streaming/Channels/101',
      YOLO_RTSP_USERNAME: 'admin',
      YOLO_RTSP_PASSWORD: 'secret-password',
      DING_TOKEN: 'ding-token',
      DING_SECRET: 'ding-secret',
    });

    const summary = createYoloProjectRuntimeSummary(
      {
        id: 'yolo-monitor',
        name: 'YOLO 摄像头监控项目',
        summary: '通过 RTSP 摄像头做行人检测。',
      },
      {
        config,
        channelPayload: {
          worker: { online: true, mode: 'real' },
          channels: [
            { channel: 72, online: true, personCount: 0, alertState: 'idle', fps: 4.1 },
            { channel: 73, online: true, personCount: 3, alertState: 'cooldown', fps: 4.2 },
            { channel: 74, online: true, personCount: 2, alertState: 'sent', fps: 4.0 },
            { channel: 75, online: false, personCount: 0, alertState: 'offline', error: 'RTSP disconnected' },
          ],
        },
      },
    );

    expect(summary).toMatchObject({
      isYoloProject: true,
      status: 'running-with-detections',
      monitorUrl: '/monitor/yolo',
      totalChannelCount: 4,
      onlineChannelCount: 3,
      activeDetectionChannelCount: 2,
      detectedPersonCount: 5,
      averageFps: 4.1,
      worker: { online: true, mode: 'real' },
      config: {
        channels: [72, 73, 74, 75],
        rtspConfigured: true,
        dingTalkConfigured: true,
      },
    });
    expect(summary.channels.find((channel) => channel.channel === 75)).toMatchObject({
      online: false,
      error: 'RTSP disconnected',
    });
    expect(JSON.stringify(summary)).not.toContain('secret-password');
    expect(JSON.stringify(summary)).not.toContain('ding-token');
  });
});
