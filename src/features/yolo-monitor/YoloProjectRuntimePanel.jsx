import { useEffect, useMemo, useState } from 'react';

const POLL_INTERVAL_MS = 3000;

export function YoloProjectRuntimePanel({ compact = false, projectId }) {
  const [runtime, setRuntime] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!projectId) {
      setRuntime(null);
      return undefined;
    }

    let cancelled = false;

    async function loadRuntime() {
      try {
        const payload = await fetchJson(`/api/projects/${projectId}/yolo-runtime`);
        if (!cancelled) {
          setRuntime(payload.runtime || null);
          setError('');
        }
      } catch (nextError) {
        if (!cancelled) {
          setError(nextError.message);
        }
      }
    }

    loadRuntime();
    const timer = window.setInterval(loadRuntime, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [projectId]);

  const metrics = useMemo(() => createRuntimeMetrics(runtime), [runtime]);

  if (!projectId || runtime?.isYoloProject === false) {
    return null;
  }

  return (
    <section
      className={`yolo-project-runtime-panel ${compact ? 'compact' : ''} ${runtime?.status || 'loading'}`}
      aria-label="YOLO 真实运行摘要"
    >
      <div className="yolo-project-runtime-header">
        <div>
          <p className="eyebrow">真实项目运行</p>
          <strong>{runtimeStatusLabel(runtime?.status, error)}</strong>
          <small>{runtimeSubtitle(runtime, error)}</small>
        </div>
        <a className="secondary yolo-project-runtime-link" href={runtime?.monitorUrl || '/monitor/yolo'}>
          打开真实监控窗口
        </a>
      </div>

      <div className="yolo-project-runtime-metrics" aria-label="YOLO 运行指标">
        {metrics.map((metric) => (
          <article className={metric.tone} key={metric.label}>
            <span>{metric.label}</span>
            <strong>{metric.value}</strong>
            <small>{metric.detail}</small>
          </article>
        ))}
      </div>

      {error ? (
        <p className="yolo-project-runtime-error">暂时无法读取检测服务：{error}</p>
      ) : null}

      {runtime?.channels?.length ? (
        <div className="yolo-project-runtime-channels" aria-label="YOLO 通道运行状态">
          {runtime.channels.map((channel) => (
            <article
              aria-label={`通道 ${channel.channel}`}
              className={channel.online ? 'online' : 'offline'}
              key={channel.channel}
            >
              <strong>{`通道 ${channel.channel}`}</strong>
              <span>{channel.online ? '在线' : '离线'}</span>
              <small>
                {channel.online
                  ? `${channel.personCount ? `检测到 ${channel.personCount} 人` : '未检测到行人'} · ${formatFps(channel.fps)}`
                  : channel.error || '等待 RTSP 连接'}
              </small>
            </article>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function createRuntimeMetrics(runtime) {
  if (!runtime) {
    return [
      { label: '通道在线', value: '读取中', detail: '正在连接运行服务', tone: 'neutral' },
      { label: '当前识别', value: '读取中', detail: '等待检测结果', tone: 'neutral' },
      { label: '推理帧率', value: '读取中', detail: '等待 worker 返回', tone: 'neutral' },
    ];
  }

  return [
    {
      label: '通道在线',
      value: `${runtime.onlineChannelCount || 0} / ${runtime.totalChannelCount || 0} 路在线`,
      detail: runtime.worker?.online ? '检测服务在线' : '检测服务离线',
      tone: runtime.onlineChannelCount === runtime.totalChannelCount ? 'ready' : 'warning',
    },
    {
      label: '当前识别',
      value: `当前识别 ${runtime.detectedPersonCount || 0} 人`,
      detail: `${runtime.activeDetectionChannelCount || 0} 路有行人`,
      tone: runtime.detectedPersonCount > 0 ? 'warning' : 'ready',
    },
    {
      label: '推理帧率',
      value: formatFps(runtime.averageFps),
      detail: runtime.worker?.mode === 'real' ? '真实 RTSP 推理' : '模拟或测试模式',
      tone: runtime.averageFps > 0 ? 'ready' : 'neutral',
    },
  ];
}

function runtimeStatusLabel(status, error) {
  if (error || status === 'offline') {
    return '运行服务离线';
  }
  if (status === 'running-with-detections') {
    return '真实运行中';
  }
  if (status === 'running') {
    return '检测运行中';
  }
  if (status === 'no-channel-online') {
    return '通道未连通';
  }
  return '读取运行状态';
}

function runtimeSubtitle(runtime, error) {
  if (error) {
    return '请检查 YOLO worker、API 和本地网络连通性。';
  }
  if (!runtime) {
    return '正在读取项目真实运行状态。';
  }
  if (!runtime.config?.rtspConfigured) {
    return 'RTSP 未配置，无法进入真实检测。';
  }
  if (!runtime.config?.dingTalkConfigured) {
    return '钉钉未配置，检测可运行但不会发送告警。';
  }
  return `RTSP 已配置 · 钉钉已配置 · ${runtime.totalChannelCount || 0} 路通道`;
}

function formatFps(value) {
  const fps = Number(value || 0);
  return fps > 0 ? `${fps.toFixed(1)} FPS` : '未记录';
}

async function fetchJson(url) {
  const response = await fetch(url);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || `请求失败：${response.status}`);
  }
  return data;
}
