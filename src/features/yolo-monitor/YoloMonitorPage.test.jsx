import { render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import YoloMonitorPage from './YoloMonitorPage.jsx';

describe('YoloMonitorPage', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('renders the real camera monitoring grid with worker status', async () => {
    global.fetch = vi.fn(async (url) => {
      if (url === '/api/yolo-monitor/config') {
        return jsonResponse({
          config: {
            channels: [72, 73, 74, 75],
            workerUrl: 'http://127.0.0.1:8765',
            rtspConfigured: true,
            dingTalkConfigured: true,
          },
        });
      }
      if (url === '/api/yolo-monitor/channels') {
        return jsonResponse({
          worker: { online: true, mode: 'mock' },
          channels: [
            { channel: 72, online: true, personCount: 1, alertState: 'sent', fps: 8.2 },
            { channel: 73, online: true, personCount: 0, alertState: 'idle', fps: 8 },
            { channel: 74, online: false, personCount: 0, alertState: 'offline', error: 'RTSP disconnected' },
            { channel: 75, online: true, personCount: 2, alertState: 'cooldown', fps: 7.7 },
          ],
        });
      }
      return jsonResponse({ error: 'not found' }, 404);
    });

    render(<YoloMonitorPage />);

    const page = await screen.findByLabelText('YOLO 摄像头实时检测');
    expect(within(page).getByText('真实摄像头检测')).toBeInTheDocument();
    expect(within(page).getByText('检测服务在线')).toBeInTheDocument();
    expect(within(page).getByText('RTSP 已配置')).toBeInTheDocument();
    expect(within(page).getByText('钉钉已配置')).toBeInTheDocument();

    const channel72 = within(page).getByLabelText('摄像头通道 72');
    expect(within(channel72).getByText('检测到 1 人')).toBeInTheDocument();
    expect(within(channel72).getByRole('img', { name: '通道 72 实时画面' })).toHaveAttribute(
      'src',
      '/api/yolo-monitor/stream/72',
    );

    expect(within(page).getByLabelText('摄像头通道 74')).toHaveTextContent('离线');
    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith('/api/yolo-monitor/channels', undefined));
  });
});

function jsonResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}
