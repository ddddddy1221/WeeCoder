import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, test } from 'vitest';
import { loadEnvFile } from './localEnv.js';

describe('local env loader', () => {
  let tempDir;

  afterEach(async () => {
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  test('loads key value pairs without overriding existing process env by default', async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'wee-coder-env-'));
    const envPath = join(tempDir, '.env.yolo.local');
    await writeFile(envPath, [
      'YOLO_MONITOR_CHANNELS=72,73',
      'YOLO_RTSP_PASSWORD=local-secret',
      'EXISTING_VALUE=file-value',
      '# ignored comment',
      '',
    ].join('\n'));

    const target = { EXISTING_VALUE: 'process-value' };
    const loaded = await loadEnvFile(envPath, { target });

    expect(loaded).toEqual(['YOLO_MONITOR_CHANNELS', 'YOLO_RTSP_PASSWORD']);
    expect(target).toMatchObject({
      YOLO_MONITOR_CHANNELS: '72,73',
      YOLO_RTSP_PASSWORD: 'local-secret',
      EXISTING_VALUE: 'process-value',
    });
  });
});
