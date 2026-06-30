import { render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { YoloProjectRuntimePanel } from './YoloProjectRuntimePanel.jsx';

describe('YoloProjectRuntimePanel', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('shows real YOLO project runtime status and monitor entry', async () => {
    global.fetch = vi.fn(async (url) => {
      if (url === '/api/projects/yolo-monitor/yolo-runtime') {
        return jsonResponse({
          runtime: {
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
              rtspConfigured: true,
              dingTalkConfigured: true,
              channels: [72, 73, 74, 75],
            },
            channels: [
              { channel: 72, online: true, personCount: 0, alertState: 'idle', fps: 4.1 },
              { channel: 73, online: true, personCount: 3, alertState: 'cooldown', fps: 4.2 },
              { channel: 74, online: true, personCount: 2, alertState: 'sent', fps: 4.0 },
              { channel: 75, online: false, personCount: 0, alertState: 'offline', error: 'RTSP disconnected' },
            ],
          },
        });
      }
      return jsonResponse({ error: 'not found' }, 404);
    });

    render(<YoloProjectRuntimePanel projectId="yolo-monitor" />);

    const panel = await screen.findByLabelText('YOLO 真实运行摘要');
    expect(within(panel).getByText('真实运行中')).toBeInTheDocument();
    expect(within(panel).getByText('3 / 4 路在线')).toBeInTheDocument();
    expect(within(panel).getByText('当前识别 5 人')).toBeInTheDocument();
    expect(within(panel).getByText('2 路有行人')).toBeInTheDocument();
    expect(within(panel).getByText('4.1 FPS')).toBeInTheDocument();
    expect(within(panel).getByRole('link', { name: '打开真实监控窗口' })).toHaveAttribute(
      'href',
      '/monitor/yolo',
    );
    expect(within(panel).getByLabelText('通道 75')).toHaveTextContent('离线');
    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith('/api/projects/yolo-monitor/yolo-runtime'),
    );
  });
});

function jsonResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}
