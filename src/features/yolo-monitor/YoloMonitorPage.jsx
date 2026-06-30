import { useEffect, useMemo, useState } from 'react';

const POLL_INTERVAL_MS = 2000;

export default function YoloMonitorPage() {
  const [config, setConfig] = useState(null);
  const [worker, setWorker] = useState({ online: false });
  const [channels, setChannels] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const configuredChannels = config?.channels || [72, 73, 74, 75];
  const channelRows = useMemo(
    () => configuredChannels.map((channel) => ({
      channel,
      online: false,
      personCount: 0,
      alertState: 'unknown',
      ...(channels.find((item) => Number(item.channel) === Number(channel)) || {}),
    })),
    [channels, configuredChannels],
  );

  useEffect(() => {
    let cancelled = false;
    async function loadConfig() {
      try {
        const payload = await fetchJson('/api/yolo-monitor/config');
        if (!cancelled) {
          setConfig(payload.config);
        }
      } catch (nextError) {
        if (!cancelled) {
          setError(nextError.message);
        }
      }
    }
    loadConfig();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function loadChannels() {
      try {
        const payload = await fetchJson('/api/yolo-monitor/channels');
        if (!cancelled) {
          setWorker(payload.worker || { online: false });
          setChannels(payload.channels || []);
          setError('');
        }
      } catch (nextError) {
        if (!cancelled) {
          setWorker({ online: false, error: nextError.message });
          setError(nextError.message);
        }
      }
    }

    loadChannels();
    const timer = window.setInterval(loadChannels, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  async function startWorker() {
    setBusy(true);
    setError('');
    try {
      await fetchJson('/api/yolo-monitor/start', { method: 'POST' });
      const payload = await fetchJson('/api/yolo-monitor/channels');
      setWorker(payload.worker || { online: true });
      setChannels(payload.channels || []);
    } catch (nextError) {
      setError(nextError.message);
    } finally {
      setBusy(false);
    }
  }

  async function sendDingTalkTest() {
    setBusy(true);
    setError('');
    try {
      await fetchJson('/api/yolo-monitor/dingtalk-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: 'YOLO 摄像头检测服务测试消息' }),
      });
    } catch (nextError) {
      setError(nextError.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="yolo-monitor-page" aria-label="YOLO 摄像头实时检测">
      <header className="yolo-monitor-header">
        <div>
          <p className="eyebrow">YOLO Monitor</p>
          <h1>真实摄像头检测</h1>
          <p>四路 RTSP 摄像头实时行人检测、画面标注和钉钉告警。</p>
        </div>
        <div className="yolo-monitor-actions">
          <button disabled={busy} onClick={startWorker} type="button">启动检测服务</button>
          <button disabled={busy || !config?.dingTalkConfigured} onClick={sendDingTalkTest} type="button">
            发送钉钉测试
          </button>
        </div>
      </header>

      <section className="yolo-monitor-status-strip" aria-label="检测服务状态">
        <StatusPill label={worker.online ? '检测服务在线' : '检测服务离线'} tone={worker.online ? 'good' : 'bad'} />
        <StatusPill label={config?.rtspConfigured ? 'RTSP 已配置' : 'RTSP 未配置'} tone={config?.rtspConfigured ? 'good' : 'bad'} />
        <StatusPill label={config?.dingTalkConfigured ? '钉钉已配置' : '钉钉未配置'} tone={config?.dingTalkConfigured ? 'good' : 'warn'} />
        <StatusPill label={`通道 ${configuredChannels.join(' / ')}`} tone="neutral" />
      </section>

      {error ? (
        <section className="yolo-monitor-error" aria-label="检测服务错误">
          <strong>当前无法获取实时检测状态</strong>
          <span>{error}</span>
        </section>
      ) : null}

      <section className="yolo-monitor-grid">
        {channelRows.map((channel) => (
          <CameraChannelCard channel={channel} key={channel.channel} />
        ))}
      </section>
    </main>
  );
}

function CameraChannelCard({ channel }) {
  const personCount = Number(channel.personCount || 0);
  const isOnline = Boolean(channel.online);
  return (
    <article className={`yolo-channel-card ${isOnline ? 'online' : 'offline'}`} aria-label={`摄像头通道 ${channel.channel}`}>
      <div className="yolo-channel-frame">
        {isOnline ? (
          <img alt={`通道 ${channel.channel} 实时画面`} src={`/api/yolo-monitor/stream/${channel.channel}`} />
        ) : (
          <div className="yolo-channel-placeholder">离线</div>
        )}
      </div>
      <div className="yolo-channel-meta">
        <div>
          <strong>{`通道 ${channel.channel}`}</strong>
          <span>{isOnline ? '在线' : '离线'}</span>
        </div>
        <div>
          <strong>{personCount ? `检测到 ${personCount} 人` : '未检测到行人'}</strong>
          <span>{`告警：${formatAlertState(channel.alertState)}${channel.fps ? ` · ${Number(channel.fps).toFixed(1)} FPS` : ''}`}</span>
        </div>
      </div>
      {channel.error ? <small className="yolo-channel-error">{channel.error}</small> : null}
    </article>
  );
}

function StatusPill({ label, tone }) {
  return <span className={`yolo-status-pill ${tone}`}>{label}</span>;
}

function formatAlertState(value) {
  const labels = {
    sent: '已发送',
    idle: '待机',
    cooldown: '冷却中',
    offline: '离线',
    'worker-offline': '服务离线',
    unknown: '未知',
  };
  return labels[value] || value || '未知';
}

async function fetchJson(url, options) {
  const response = await fetch(url, options);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || `请求失败：${response.status}`);
  }
  return data;
}
