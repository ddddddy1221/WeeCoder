import base64
import hashlib
import hmac
import json
import os
import threading
import time
from dataclasses import dataclass
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from io import BytesIO
from urllib.parse import quote_plus, urlparse

import requests


DEFAULT_CHANNELS = [72, 73, 74, 75]
DEFAULT_RTSP_TEMPLATE = "rtsp://{username}:{password}@192.168.1.{channel}:554/Streaming/Channels/101"
DEFAULT_JPEG = base64.b64decode(
    "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////"
    "2wBDAf//////////////////////////////////////////////////////////////////////////////////////"
    "wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAX/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/"
    "9oADAMBAAIQAxAAAAH/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAEFAqf/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/"
    "9oACAEDAQE/Aaf/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAECAQE/Aaf/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/"
    "9oACAEBAAY/Aqf/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAE/IV//2gAMAwEAAgADAAAAEP/EABQRAQAAAAAAAAAAAAAAAAAAABD/"
    "2gAIAQMBAT8QH//EABQRAQAAAAAAAAAAAAAAAAAAABD/2gAIAQIBAT8QH//EABQQAQAAAAAAAAAAAAAAAAAAABD/"
    "2gAIAQEAAT8QH//Z"
)


def parse_channels(value):
    channels = []
    for item in str(value or "").split(","):
        try:
            channel = int(item.strip())
        except ValueError:
            continue
        if channel > 0 and channel not in channels:
            channels.append(channel)
    return channels or list(DEFAULT_CHANNELS)


def build_rtsp_url(template, channel, username, password):
    return (
        str(template or DEFAULT_RTSP_TEMPLATE)
        .replace("{channel}", str(channel))
        .replace("{username}", str(username or ""))
        .replace("{password}", str(password or ""))
    )


def create_dingtalk_sign(timestamp, secret):
    string_to_sign = f"{timestamp}\n{secret}"
    digest = hmac.new(
        str(secret).encode("utf-8"),
        string_to_sign.encode("utf-8"),
        hashlib.sha256,
    ).digest()
    return quote_plus(base64.b64encode(digest).decode("utf-8"))


@dataclass(frozen=True)
class MonitorConfig:
    channels: list[int]
    rtsp_template: str
    rtsp_username: str
    rtsp_password: str
    model: str
    confidence: float
    mode: str
    host: str
    port: int
    ding_token: str
    ding_secret: str
    alert_cooldown_seconds: int


def load_config(env=os.environ):
    worker_url = str(env.get("YOLO_MONITOR_WORKER_URL", "http://127.0.0.1:8765"))
    parsed = urlparse(worker_url)
    return MonitorConfig(
        channels=parse_channels(env.get("YOLO_MONITOR_CHANNELS", "")),
        rtsp_template=env.get("YOLO_RTSP_URL_TEMPLATE", DEFAULT_RTSP_TEMPLATE),
        rtsp_username=env.get("YOLO_RTSP_USERNAME", "admin"),
        rtsp_password=env.get("YOLO_RTSP_PASSWORD", ""),
        model=env.get("YOLO_MODEL", "yolov8n.pt"),
        confidence=float(env.get("YOLO_CONFIDENCE", "0.35")),
        mode=env.get("YOLO_MONITOR_MODE", "real").strip() or "real",
        host=parsed.hostname or "127.0.0.1",
        port=parsed.port or int(env.get("YOLO_MONITOR_PORT", "8765")),
        ding_token=env.get("DING_TOKEN", ""),
        ding_secret=env.get("DING_SECRET", ""),
        alert_cooldown_seconds=int(env.get("YOLO_ALERT_COOLDOWN_SECONDS", "120")),
    )


class DingTalkNotifier:
    def __init__(self, token, secret):
        self.token = token
        self.secret = secret

    @property
    def configured(self):
        return bool(self.token and self.secret)

    def send_text(self, text):
        if not self.configured:
            return {"ok": False, "error": "DingTalk token/secret is not configured."}
        timestamp = int(time.time() * 1000)
        sign = create_dingtalk_sign(timestamp, self.secret)
        url = (
            "https://oapi.dingtalk.com/robot/send"
            f"?access_token={self.token}&timestamp={timestamp}&sign={sign}"
        )
        response = requests.post(
            url,
            json={"msgtype": "text", "text": {"content": text}},
            timeout=8,
        )
        response.raise_for_status()
        return response.json()


class ChannelState:
    def __init__(self, channel):
        self.channel = channel
        self.online = False
        self.person_count = 0
        self.alert_state = "idle"
        self.fps = 0.0
        self.error = ""
        self.updated_at = ""
        self.total_frames = 0
        self.detection_frames = 0
        self.last_alert_at = 0.0
        self.frame = DEFAULT_JPEG
        self.lock = threading.Lock()

    def update(self, **kwargs):
        with self.lock:
            for key, value in kwargs.items():
                setattr(self, key, value)
            self.updated_at = iso_now()

    def snapshot(self):
        with self.lock:
            return {
                "channel": self.channel,
                "online": self.online,
                "personCount": self.person_count,
                "alertState": self.alert_state,
                "fps": round(self.fps, 2),
                "error": self.error,
                "updatedAt": self.updated_at,
                "totalFrames": self.total_frames,
                "detectionFrames": self.detection_frames,
            }

    def latest_frame(self):
        with self.lock:
            return self.frame or DEFAULT_JPEG


class MonitorRuntime:
    def __init__(self, config):
        self.config = config
        self.notifier = DingTalkNotifier(config.ding_token, config.ding_secret)
        self.states = {channel: ChannelState(channel) for channel in config.channels}
        self.stop_event = threading.Event()
        self.threads = []
        self.model = None
        self.cv2 = None
        self.runtime_lock = threading.Lock()

    def start(self):
        for channel in self.config.channels:
            thread = threading.Thread(target=self.run_channel, args=(channel,), daemon=True)
            thread.start()
            self.threads.append(thread)

    def run_channel(self, channel):
        if self.config.mode == "mock":
            self.run_mock_channel(channel)
            return
        self.run_real_channel(channel)

    def run_mock_channel(self, channel):
        state = self.states[channel]
        tick = 0
        while not self.stop_event.is_set():
            person_count = 1 if tick % 10 in (3, 4, 5) else 0
            frame = create_mock_frame(channel, person_count)
            state.update(
                online=True,
                person_count=person_count,
                alert_state="sent" if person_count else "idle",
                fps=5.0,
                error="",
                total_frames=state.total_frames + 1,
                detection_frames=state.detection_frames + (1 if person_count else 0),
                frame=frame,
            )
            tick += 1
            time.sleep(0.2)

    def run_real_channel(self, channel):
        state = self.states[channel]
        try:
            self.ensure_real_runtime()
        except Exception as exc:
            state.update(online=False, alert_state="offline", error=f"YOLO 依赖不可用：{exc}")
            return

        rtsp_url = build_rtsp_url(
            self.config.rtsp_template,
            channel,
            self.config.rtsp_username,
            self.config.rtsp_password,
        )
        capture = self.cv2.VideoCapture(rtsp_url)
        if not capture.isOpened():
            state.update(online=False, alert_state="offline", error="RTSP 连接失败")
            return

        last_tick = time.time()
        frame_count = 0
        while not self.stop_event.is_set():
            ok, frame = capture.read()
            if not ok:
                state.update(online=False, alert_state="offline", error="RTSP 读帧失败，等待重连")
                time.sleep(1)
                capture.release()
                capture = self.cv2.VideoCapture(rtsp_url)
                continue

            detections = self.detect_people(frame)
            annotated = draw_detections(self.cv2, frame, detections)
            jpg = encode_frame(self.cv2, annotated)
            person_count = len(detections)
            frame_count += 1
            now = time.time()
            elapsed = max(now - last_tick, 0.001)
            fps = frame_count / elapsed
            alert_state = self.maybe_alert(channel, person_count)
            state.update(
                online=True,
                person_count=person_count,
                alert_state=alert_state,
                fps=fps,
                error="",
                total_frames=state.total_frames + 1,
                detection_frames=state.detection_frames + (1 if person_count else 0),
                frame=jpg,
            )

        capture.release()

    def ensure_real_runtime(self):
        with self.runtime_lock:
            if self.cv2 and self.model:
                return
            import cv2
            from ultralytics import YOLO

            self.cv2 = cv2
            self.model = YOLO(self.config.model)

    def detect_people(self, frame):
        result = self.model(frame, classes=[0], conf=self.config.confidence, verbose=False)[0]
        detections = []
        for box in result.boxes:
            xyxy = box.xyxy[0].tolist()
            confidence = float(box.conf[0])
            detections.append({
                "x1": int(xyxy[0]),
                "y1": int(xyxy[1]),
                "x2": int(xyxy[2]),
                "y2": int(xyxy[3]),
                "confidence": confidence,
            })
        return detections

    def maybe_alert(self, channel, person_count):
        if person_count <= 0:
            return "idle"
        state = self.states[channel]
        now = time.time()
        if now - state.last_alert_at < self.config.alert_cooldown_seconds:
            return "cooldown"
        state.last_alert_at = now
        text = f"YOLO 摄像头检测：通道 {channel} 检测到 {person_count} 人。"
        try:
            result = self.notifier.send_text(text)
            return "sent" if result.get("errcode", 0) == 0 or result.get("ok") else "send-failed"
        except Exception:
            return "send-failed"

    def channels_payload(self):
        return {
            "worker": {
                "online": True,
                "mode": self.config.mode,
                "dingTalkConfigured": self.notifier.configured,
            },
            "channels": [self.states[channel].snapshot() for channel in self.config.channels],
        }


def create_handler(runtime):
    class Handler(BaseHTTPRequestHandler):
        def do_GET(self):
            if self.path == "/health":
                self.send_json({
                    "ok": True,
                    "worker": {"online": True, "mode": runtime.config.mode},
                    "channels": runtime.config.channels,
                })
                return
            if self.path == "/channels":
                self.send_json(runtime.channels_payload())
                return
            if self.path.startswith("/snapshot/") and self.path.endswith(".jpg"):
                channel = parse_channel_from_path(self.path, "/snapshot/", ".jpg")
                self.send_jpeg(channel)
                return
            if self.path.startswith("/stream/") and self.path.endswith(".mjpg"):
                channel = parse_channel_from_path(self.path, "/stream/", ".mjpg")
                self.send_stream(channel)
                return
            self.send_error(404, "Not found")

        def do_POST(self):
            if self.path != "/notify-test":
                self.send_error(404, "Not found")
                return
            length = int(self.headers.get("content-length") or "0")
            body = self.rfile.read(length) if length else b"{}"
            payload = json.loads(body.decode("utf-8") or "{}")
            text = payload.get("text") or "YOLO 摄像头检测服务测试消息"
            try:
                self.send_json({"ok": True, "result": runtime.notifier.send_text(text)})
            except Exception as exc:
                self.send_json({"ok": False, "error": str(exc)}, status=502)

        def send_json(self, payload, status=200):
            body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
            self.send_response(status)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def send_jpeg(self, channel):
            state = runtime.states.get(channel)
            if not state:
                self.send_error(404, "Channel not configured")
                return
            frame = state.latest_frame()
            self.send_response(200)
            self.send_header("Content-Type", "image/jpeg")
            self.send_header("Content-Length", str(len(frame)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(frame)

        def send_stream(self, channel):
            state = runtime.states.get(channel)
            if not state:
                self.send_error(404, "Channel not configured")
                return
            self.send_response(200)
            self.send_header("Content-Type", "multipart/x-mixed-replace; boundary=frame")
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            while not runtime.stop_event.is_set():
                frame = state.latest_frame()
                try:
                    self.wfile.write(b"--frame\r\n")
                    self.wfile.write(b"Content-Type: image/jpeg\r\n")
                    self.wfile.write(f"Content-Length: {len(frame)}\r\n\r\n".encode("utf-8"))
                    self.wfile.write(frame)
                    self.wfile.write(b"\r\n")
                    self.wfile.flush()
                except (BrokenPipeError, ConnectionResetError):
                    break
                time.sleep(0.2)

        def log_message(self, fmt, *args):
            return

    return Handler


def parse_channel_from_path(path, prefix, suffix):
    value = path[len(prefix):]
    value = value[: -len(suffix)]
    try:
        return int(value)
    except ValueError:
        return -1


def create_mock_frame(channel, person_count):
    try:
        from PIL import Image, ImageDraw

        image = Image.new("RGB", (960, 540), color=(10, 24, 38))
        draw = ImageDraw.Draw(image)
        draw.rectangle((0, 0, 959, 539), outline=(71, 85, 105), width=3)
        draw.text((24, 24), f"Channel {channel}", fill=(226, 232, 240))
        draw.text((24, 58), f"People: {person_count}", fill=(134, 239, 172) if person_count else (148, 163, 184))
        if person_count:
            draw.rectangle((360, 120, 560, 420), outline=(34, 197, 94), width=5)
            draw.text((360, 98), "person 0.91", fill=(34, 197, 94))
        output = BytesIO()
        image.save(output, format="JPEG", quality=85)
        return output.getvalue()
    except Exception:
        return DEFAULT_JPEG


def draw_detections(cv2, frame, detections):
    for detection in detections:
        cv2.rectangle(
            frame,
            (detection["x1"], detection["y1"]),
            (detection["x2"], detection["y2"]),
            (0, 255, 0),
            2,
        )
        cv2.putText(
            frame,
            f"person {detection['confidence']:.2f}",
            (detection["x1"], max(detection["y1"] - 8, 16)),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.6,
            (0, 255, 0),
            2,
        )
    return frame


def encode_frame(cv2, frame):
    ok, buffer = cv2.imencode(".jpg", frame, [int(cv2.IMWRITE_JPEG_QUALITY), 82])
    return buffer.tobytes() if ok else DEFAULT_JPEG


def iso_now():
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


def main():
    config = load_config()
    runtime = MonitorRuntime(config)
    runtime.start()
    server = ThreadingHTTPServer((config.host, config.port), create_handler(runtime))
    print(f"YOLO monitor worker listening on http://{config.host}:{config.port} mode={config.mode}", flush=True)
    try:
        server.serve_forever()
    finally:
        runtime.stop_event.set()
        server.server_close()


if __name__ == "__main__":
    main()
