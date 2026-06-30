# YOLO 摄像头实时检测项目

这是 WeeCoder 内置的真实业务项目，用来验证一套从管理后台到实际运行窗口的闭环。

## 功能范围

- 4 路 RTSP 摄像头：72、73、74、75。
- Python worker 拉流并运行 YOLO person 检测。
- 浏览器页面展示四宫格实时画面。
- 检测到行人后发送钉钉告警，并按冷却时间节流。
- 后端通过 `/api/yolo-monitor/*` 代理 worker 状态和视频流。

## 本地配置

不要把真实密码和钉钉密钥提交到仓库。

1. 复制模板：

```powershell
Copy-Item .env.yolo.example .env.yolo.local
```

2. 编辑 `.env.yolo.local`，填入真实值：

```text
YOLO_RTSP_PASSWORD=your-camera-password
DING_TOKEN=your-dingtalk-token
DING_SECRET=your-dingtalk-secret
```

3. 安装 Python 依赖：

```powershell
python -m pip install -r requirements-yolo.txt
```

## 启动方式

当前页面入口：

```text
http://127.0.0.1:5173/monitor/yolo
```

启动后台：

```powershell
npm run dev
```

如果通过页面点击“启动检测服务”，Express 会拉起 Python worker。也可以单独启动 worker：

```powershell
python workers/yolo_monitor.py
```

## Mock 模式

如果想先验证页面和告警按钮，不接真实摄像头：

```powershell
$env:YOLO_MONITOR_MODE="mock"
python workers/yolo_monitor.py
```

## 运行状态接口

- `GET /api/yolo-monitor/config`：安全配置，不返回密码或 token。
- `GET /api/yolo-monitor/channels`：通道状态。
- `GET /api/yolo-monitor/stream/:channel`：MJPEG 实时流代理。
- `POST /api/yolo-monitor/start`：启动 worker。
- `POST /api/yolo-monitor/dingtalk-test`：发送钉钉测试消息。
