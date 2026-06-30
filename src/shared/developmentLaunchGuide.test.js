import { describe, expect, test } from 'vitest';
import { createDevelopmentLaunchGuide } from './developmentLaunchGuide.js';

describe('development launch guide', () => {
  test('shows repository diagnosis as the current blocker for the YOLO project', () => {
    const guide = createDevelopmentLaunchGuide({
      repositoryConfig: {
        status: 'ready',
        localPath: 'D:\\project\\WeeCoder',
        targetBranch: 'feature/yolo-camera-monitor',
        executionMode: 'codex-local',
        missingFields: [],
      },
      repositoryInspection: {
        status: 'blocked',
        issues: ['本地路径不是 Git 仓库。'],
        recommendations: ['请选择真实业务代码仓库路径后重新诊断。'],
      },
      branchPreparation: {
        status: 'blocked',
        canRunDevelopment: false,
        issues: ['仓库诊断未通过，不能准备分支。'],
      },
      agentExecutionPackage: {
        status: 'blocked',
        canStart: false,
        blockers: ['仓库诊断未通过：本地路径不是 Git 仓库。'],
      },
    });

    expect(guide.status).toBe('blocked');
    expect(guide.currentStepId).toBe('repository-inspection');
    expect(guide.nextAction).toBe('请选择真实业务代码仓库路径后重新诊断。');
    expect(guide.steps).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'repository-config', status: 'ready' }),
        expect.objectContaining({
          id: 'repository-inspection',
          status: 'blocked',
          detail: '本地路径不是 Git 仓库。',
        }),
        expect.objectContaining({ id: 'development-start', status: 'blocked' }),
      ]),
    );
  });

  test('marks the guide ready when the package can start and no run exists', () => {
    const guide = createDevelopmentLaunchGuide({
      repositoryConfig: {
        status: 'ready',
        localPath: 'D:\\project\\business-repo',
        targetBranch: 'feature/yolo-camera-monitor',
        executionMode: 'codex-local',
        missingFields: [],
      },
      repositoryInspection: {
        status: 'ready',
        canPrepareBranch: true,
        issues: [],
      },
      branchPreparation: {
        status: 'ready',
        canRunDevelopment: true,
        issues: [],
      },
      agentExecutionPackage: {
        status: 'ready',
        canStart: true,
        blockers: [],
      },
      developmentRun: null,
    });

    expect(guide.status).toBe('ready');
    expect(guide.currentStepId).toBe('development-start');
    expect(guide.nextAction).toBe('点击“启动开发执行”，生成本次开发执行记录。');
    expect(guide.steps.at(-1)).toMatchObject({
      id: 'development-start',
      status: 'pending',
    });
  });

  test('starts with repository configuration when required fields are missing', () => {
    const guide = createDevelopmentLaunchGuide({
      repositoryConfig: {
        status: 'incomplete',
        missingFields: ['repositoryUrl', 'targetBranch'],
      },
    });

    expect(guide.status).toBe('pending');
    expect(guide.currentStepId).toBe('repository-config');
    expect(guide.nextAction).toBe('补齐仓库地址或本地路径、目标分支和执行模式，然后保存执行器配置。');
    expect(guide.steps[0]).toMatchObject({
      id: 'repository-config',
      status: 'pending',
      detail: '缺少：仓库地址或本地路径、目标分支',
    });
  });
});
