import { describe, expect, test } from 'vitest';
import { createAgentExecutionPackage } from './agentExecutionPackage.js';

describe('agent execution package', () => {
  test('creates a Codex-ready package when all launch gates are ready', () => {
    const project = createReadyProject();

    const executionPackage = createAgentExecutionPackage(project);

    expect(executionPackage.status).toBe('ready');
    expect(executionPackage.canStart).toBe(true);
    expect(executionPackage.blockers).toEqual([]);
    expect(executionPackage.gates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'prd', status: 'ready' }),
        expect.objectContaining({ id: 'technical-handoff', status: 'ready' }),
        expect.objectContaining({ id: 'branch-preparation', status: 'ready' }),
      ]),
    );
    expect(executionPackage.repository).toMatchObject({
      localPath: 'D:\\project\\business-repo',
      targetBranch: 'feature/yolo-camera-monitor',
    });
    expect(executionPackage.instructions).toContain('yolo摄像头监控项目');
    expect(executionPackage.instructions).toContain('D:\\project\\business-repo');
    expect(executionPackage.instructions).toContain('feature/yolo-camera-monitor');
    expect(executionPackage.instructions).toContain('npm test');
    expect(executionPackage.instructions).toContain('不要修改与本任务无关的文件');
    expect(executionPackage.tasks).toHaveLength(1);
  });

  test('blocks package launch when repository and branch readiness are missing', () => {
    const project = {
      ...createReadyProject(),
      repositoryInspection: {
        status: 'blocked',
        canPrepareBranch: false,
        issues: ['本地路径不是 Git 仓库。'],
      },
      branchPreparation: {
        status: 'blocked',
        canRunDevelopment: false,
        issues: ['仓库诊断未通过，不能准备分支。'],
      },
    };

    const executionPackage = createAgentExecutionPackage(project);

    expect(executionPackage.status).toBe('blocked');
    expect(executionPackage.canStart).toBe(false);
    expect(executionPackage.blockers).toEqual(
      expect.arrayContaining([
        '仓库诊断未通过：本地路径不是 Git 仓库。',
        '目标分支未准备好：仓库诊断未通过，不能准备分支。',
      ]),
    );
    expect(executionPackage.instructions).toContain('启动状态：BLOCKED');
  });
  test('blocks package launch when the PRD version is stale', () => {
    const executionPackage = createAgentExecutionPackage({
      ...createReadyProject(),
      prdVersion: {
        number: 1,
        label: 'v1',
        status: 'stale',
        generatedAt: '2026-06-17T00:00:00.000Z',
        generatedBy: '项目经理',
      },
      prdChangeImpact: {
        status: 'stale',
        version: 1,
        versionLabel: 'v1',
        changedQuestionIds: ['scope'],
        changedQuestions: [
          {
            id: 'scope',
            label: '范围边界',
            previousAnswer: '本期只做 Web 后台。',
            currentAnswer: '本期增加移动端 App。',
          },
        ],
        summary: 'PRD v1 已过期：范围边界 已变更。',
        requiredActions: ['重新运行智能需求评审', '重新生成需求文档草稿'],
      },
    });

    expect(executionPackage).toMatchObject({
      status: 'blocked',
      canStart: false,
      prdVersion: {
        label: 'v1',
        status: 'stale',
      },
      requirementChangeImpact: {
        status: 'stale',
        changedQuestionIds: ['scope'],
      },
    });
    expect(executionPackage.gates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'prd-version',
          status: 'blocked',
        }),
      ]),
    );
    expect(executionPackage.blockers).toEqual(
      expect.arrayContaining(['PRD v1 已过期：范围边界 已变更。']),
    );
    expect(executionPackage.instructions).toContain('PRD 版本：v1（已过期）');
    expect(executionPackage.instructions).toContain('重新运行智能需求评审');
  });
});

function createReadyProject() {
  return {
    name: 'yolo摄像头监控项目',
    sponsor: 'AA',
    summary: '连接 RTSP 摄像头并用 YOLO 检测行人。',
    prdStatus: 'generated',
    technicalHandoffStatus: 'generated',
    artifacts: {
      'pm-requirements': '# PRD: yolo摄像头监控项目\n检测行人并展示标注框。',
      development: '# 开发任务\n实现 RTSP、YOLO、前端标注和误检率统计。',
    },
    developmentPlan: {
      status: 'ready',
      summary: '按 RTSP 接入、YOLO 推理和前端标注拆分开发任务。',
      verificationCommands: ['npm test', 'npm run build'],
      tasks: [
        {
          id: 'dev-frontend-monitor',
          area: '前端',
          title: '实现网页监控页面和标注框展示',
          description: '展示实时视频区域、行人提示和检测框。',
          acceptanceCriteria: ['检测到行人时显示标注框。'],
          verification: ['前端组件测试覆盖有行人和无行人。'],
        },
      ],
    },
    repositoryConfig: {
      status: 'ready',
      localPath: 'D:\\project\\business-repo',
      baseBranch: 'main',
      targetBranch: 'feature/yolo-camera-monitor',
      executionMode: 'codex-local',
      verificationCommands: ['npm test', 'npm run build'],
    },
    repositoryInspection: {
      status: 'ready',
      isGitRepository: true,
      canPrepareBranch: true,
      issues: [],
    },
    branchPreparation: {
      status: 'ready',
      currentBranch: 'feature/yolo-camera-monitor',
      canRunDevelopment: true,
      issues: [],
    },
  };
}
