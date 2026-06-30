import unittest

from workers.yolo_monitor import (
    build_rtsp_url,
    create_dingtalk_sign,
    parse_channels,
)


class YoloMonitorWorkerTest(unittest.TestCase):
    def test_parse_channels_filters_invalid_values(self):
        self.assertEqual(parse_channels("72, 73, bad, 75"), [72, 73, 75])
        self.assertEqual(parse_channels(""), [72, 73, 74, 75])

    def test_build_rtsp_url_uses_channel_and_credentials(self):
        url = build_rtsp_url(
            "rtsp://{username}:{password}@192.168.1.{channel}:554/Streaming/Channels/101",
            74,
            "admin",
            "secret",
        )

        self.assertEqual(
            url,
            "rtsp://admin:secret@192.168.1.74:554/Streaming/Channels/101",
        )

    def test_create_dingtalk_sign_is_url_encoded(self):
        sign = create_dingtalk_sign(1700000000000, "SEC-test-secret")

        self.assertIsInstance(sign, str)
        self.assertNotIn("\n", sign)
        self.assertNotEqual(sign, "")


if __name__ == "__main__":
    unittest.main()
