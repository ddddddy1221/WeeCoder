import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { bootstrapRepository } from './repositoryBootstrapper.js';

describe('repository bootstrapper', () => {
  let tempDir;

  beforeEach(async () => {
    tempDir = await mkdir(join(tmpdir(), `wee-coder-bootstrap-${Date.now()}-`), { recursive: true });
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  test('creates a YOLO business repository skeleton and initializes git history', async () => {
    const targetPath = join(tempDir, 'yolo-monitor');
    const commandRunner = vi.fn(async () => ({
      exitCode: 0,
      stdout: '',
      stderr: '',
      durationMs: 8,
    }));

    const result = await bootstrapRepository(createProject(targetPath), { commandRunner });

    expect(result).toMatchObject({
      status: 'ready',
      localPath: targetPath,
      gitInitialized: true,
      initialCommitCreated: true,
      currentBranch: 'main',
      recommendations: ['本地业务仓库已创建，请重新诊断仓库并准备目标分支。'],
    });
    expect(result.filesCreated).toEqual(
      expect.arrayContaining([
        'README.md',
        'package.json',
        'package-lock.json',
        'src/detectionContract.js',
        'test/detectionContract.test.js',
        'scripts/build-check.js',
        'docs/PRD.md',
      ]),
    );
    expect(await readFile(join(targetPath, 'README.md'), 'utf8')).toContain('yolo摄像头监控项目');
    expect(await readFile(join(targetPath, 'docs', 'PRD.md'), 'utf8')).toContain('RTSP');
    expect(commandRunner).toHaveBeenCalledWith(['init'], {
      cwd: targetPath,
      timeoutMs: expect.any(Number),
    });
    expect(commandRunner).toHaveBeenCalledWith(['checkout', '-B', 'main'], {
      cwd: targetPath,
      timeoutMs: expect.any(Number),
    });
    expect(commandRunner).toHaveBeenCalledWith(['commit', '-m', 'chore: bootstrap yolo monitor project'], {
      cwd: targetPath,
      timeoutMs: expect.any(Number),
    });
  });

  test('blocks bootstrap when target directory already contains non-git files', async () => {
    const targetPath = join(tempDir, 'existing-files');
    await mkdir(targetPath, { recursive: true });
    await writeFile(join(targetPath, 'notes.txt'), 'do not overwrite', 'utf8');
    const commandRunner = vi.fn();

    const result = await bootstrapRepository(createProject(targetPath), { commandRunner });

    expect(commandRunner).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      status: 'blocked',
      localPath: targetPath,
      gitInitialized: false,
      initialCommitCreated: false,
      issues: ['目标目录已存在且非空，为避免覆盖现有文件，已停止初始化。'],
      recommendations: ['请选择一个空目录，或绑定已经存在的真实 Git 仓库。'],
    });
  });
});

function createProject(localPath) {
  return {
    id: 'yolo-camera-monitor-cce71337',
    name: 'yolo摄像头监控项目',
    sponsor: 'AA',
    summary: '连接本地摄像头 RTSP 数据流，在网页端实时识别行人并展示标注框和提示。',
    artifacts: {
      'pm-requirements': '# PRD: yolo摄像头监控项目\n\nRTSP 行人检测。',
    },
    developmentPlan: {
      verificationCommands: ['npm test', 'npm run build', 'npm audit --omit=dev'],
    },
    repositoryConfig: {
      localPath,
      baseBranch: 'main',
      targetBranch: 'feature/yolo-camera-monitor',
      executionMode: 'codex-local',
      verificationCommands: ['npm test', 'npm run build', 'npm audit --omit=dev'],
    },
  };
}
