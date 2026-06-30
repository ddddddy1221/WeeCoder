import { describe, expect, test } from 'vitest';
import { normalizeRepositoryConfig } from './repositoryConfig.js';

describe('repository config', () => {
  test('marks repository config ready when repository, branch, and executor are provided', () => {
    const config = normalizeRepositoryConfig({
      repositoryUrl: ' https://github.com/acme/yolo-monitor.git ',
      localPath: ' D:\\projects\\yolo-monitor ',
      baseBranch: ' main ',
      targetBranch: ' feature/yolo-camera-monitor ',
      executionMode: 'codex-local',
      verificationCommands: ['npm test', '', 'npm run build'],
      notes: 'Use GPU runner when available.',
    });

    expect(config).toMatchObject({
      status: 'ready',
      repositoryUrl: 'https://github.com/acme/yolo-monitor.git',
      localPath: 'D:\\projects\\yolo-monitor',
      baseBranch: 'main',
      targetBranch: 'feature/yolo-camera-monitor',
      executionMode: 'codex-local',
      notes: 'Use GPU runner when available.',
    });
    expect(config.verificationCommands).toEqual(['npm test', 'npm run build']);
    expect(config.missingFields).toEqual([]);
  });

  test('keeps config incomplete until an executor target can be derived', () => {
    const config = normalizeRepositoryConfig({
      repositoryUrl: 'https://github.com/acme/yolo-monitor.git',
      executionMode: 'codex-local',
    });

    expect(config.status).toBe('incomplete');
    expect(config.missingFields).toEqual(expect.arrayContaining(['targetBranch']));
  });
});
