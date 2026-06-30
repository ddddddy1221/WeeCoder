import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { executeLocalDevelopmentTasks } from './localDevelopmentExecutor.js';

describe('local development executor', () => {
  let tempDir;

  beforeEach(async () => {
    tempDir = await mkdir(join(tmpdir(), `wee-coder-dev-exec-${Date.now()}-`), { recursive: true });
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  test('writes YOLO monitor implementation files and commits the local changes', async () => {
    const localPath = join(tempDir, 'yolo-monitor');
    await mkdir(localPath, { recursive: true });
    await writeFile(join(localPath, 'package.json'), JSON.stringify({ type: 'module' }), 'utf8');
    let commitHasRun = false;
    const commandRunner = vi.fn(async (args) => {
      const command = args.join(' ');
      if (command === 'branch --show-current') {
        return { exitCode: 0, stdout: 'feature/yolo-camera-monitor\n', stderr: '', durationMs: 4 };
      }
      if (command === 'commit -m feat: implement yolo monitor baseline') {
        commitHasRun = true;
        return { exitCode: 0, stdout: '', stderr: '', durationMs: 4 };
      }
      if (command === 'rev-parse --short HEAD') {
        return {
          exitCode: 0,
          stdout: commitHasRun ? 'abc1234\n' : 'base111\n',
          stderr: '',
          durationMs: 4,
        };
      }
      if (command === 'status --porcelain') {
        return { exitCode: 0, stdout: '', stderr: '', durationMs: 4 };
      }
      return { exitCode: 0, stdout: '', stderr: '', durationMs: 4 };
    });

    const result = await executeLocalDevelopmentTasks(createProject(localPath), { commandRunner });

    expect(result).toMatchObject({
      status: 'completed',
      commitHash: 'abc1234',
      summary: '本地开发执行已完成，已生成 YOLO 摄像头监控基础实现和测试。',
      blockers: [],
      nextActions: ['运行检查命令，确认本地实现可测试、可构建且依赖无漏洞。'],
    });
    expect(result.repositoryAudit).toMatchObject({
      before: {
        branch: 'feature/yolo-camera-monitor',
        head: 'base111',
        changedFiles: [],
      },
      after: {
        branch: 'feature/yolo-camera-monitor',
        head: 'abc1234',
        changedFiles: [],
      },
      committed: true,
    });
    expect(result.filesChanged).toEqual(
      expect.arrayContaining([
        'src/monitoringState.js',
        'src/rtspConfig.js',
        'src/falsePositiveMetrics.js',
        'test/monitoringState.test.js',
        'test/rtspConfig.test.js',
        'test/falsePositiveMetrics.test.js',
      ]),
    );
    expect(result.taskResults).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          taskId: 'dev-frontend-monitor',
          status: 'completed',
          result: expect.stringContaining('已生成'),
        }),
      ]),
    );
    expect(await readFile(join(localPath, 'src', 'monitoringState.js'), 'utf8')).toContain(
      'applyDetectionFrame',
    );
    expect(await readFile(join(localPath, 'test', 'falsePositiveMetrics.test.js'), 'utf8')).toContain(
      '低于 30%',
    );
    expect(commandRunner).toHaveBeenCalledWith(['add', '.'], {
      cwd: localPath,
      timeoutMs: expect.any(Number),
    });
    expect(commandRunner).toHaveBeenCalledWith(['commit', '-m', 'feat: implement yolo monitor baseline'], {
      cwd: localPath,
      timeoutMs: expect.any(Number),
    });
  });

  test('blocks execution when the repository is not ready', async () => {
    const result = await executeLocalDevelopmentTasks({
      repositoryConfig: { status: 'incomplete', localPath: '' },
      agentExecutionPackage: { status: 'ready', canStart: true, tasks: [] },
    });

    expect(result).toMatchObject({
      status: 'blocked',
      blockers: ['本地代码仓库未配置完整，不能执行自动开发。'],
    });
  });
});

function createProject(localPath) {
  return {
    name: 'yolo摄像头监控项目',
    repositoryConfig: {
      status: 'ready',
      localPath,
      targetBranch: 'feature/yolo-camera-monitor',
      verificationCommands: ['npm test', 'npm run build', 'npm audit --omit=dev'],
    },
    agentExecutionPackage: {
      status: 'ready',
      canStart: true,
      tasks: [
        { id: 'dev-frontend-monitor', area: '前端', title: '实现网页监控页面和标注框展示' },
        { id: 'dev-backend-rtsp', area: '后端', title: '实现 RTSP 接入、重连和健康状态接口' },
        { id: 'dev-inference-yolo', area: '推理服务', title: '定义并接入 YOLO 行人检测服务契约' },
        { id: 'dev-qa-metrics', area: '测试', title: '实现误检率测试记录和统计口径' },
      ],
    },
  };
}
