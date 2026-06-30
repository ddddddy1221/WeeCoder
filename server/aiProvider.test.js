import { describe, expect, test } from 'vitest';
import {
  advanceProject,
  answerRequirementQuestion,
  createProject,
  normalizeProject,
  updateStageConfirmationForProject,
} from '../src/shared/workflow.js';
import { createCodexInvocation, createCodexProvider } from './aiProvider.js';

describe('Codex AI provider', () => {
  test('uses node to launch the global Codex JS entry on Windows', () => {
    const invocation = createCodexInvocation({
      platform: 'win32',
      env: {
        APPDATA: 'C:\\Users\\weiwo\\AppData\\Roaming',
      },
      execPath: 'D:\\nodejs\\node.exe',
    });

    expect(invocation).toEqual({
      command: 'D:\\nodejs\\node.exe',
      argsPrefix: [
        'C:\\Users\\weiwo\\AppData\\Roaming\\npm\\node_modules\\@openai\\codex\\bin\\codex.js',
      ],
    });
  });

  test('builds a PRD prompt and returns Codex markdown output', async () => {
    const project = answerRequirementQuestion(
      advanceConfirmed(
        createProject({
          name: '客服工单台',
          sponsor: '服务负责人',
          summary: '客户提交工单，客服统一处理。',
        }),
        { actor: '负责人' },
      ),
      {
        questionId: 'users',
        answer: '客户、客服专员、客服主管。',
        actor: '项目经理',
      },
    );
    const calls = [];
    const provider = createCodexProvider({
      runCodex: async (prompt) => {
        calls.push(prompt);
        return '# PRD: 客服工单台\n\n## 目标用户\n客户、客服专员、客服主管。';
      },
    });

    const result = await provider.generatePrd(project);

    expect(result).toEqual({
      artifact: '# PRD: 客服工单台\n\n## 目标用户\n客户、客服专员、客服主管。',
      provider: 'codex-cli',
    });
    expect(calls[0]).toContain('客服工单台');
    expect(calls[0]).toContain('客户、客服专员、客服主管。');
    expect(calls[0]).toContain('Markdown PRD');
  });

  test('reviews requirements from Codex JSON output', async () => {
    const project = advanceConfirmed(
      createProject({
        name: 'Support Portal',
        sponsor: 'Service Lead',
        summary: 'Customers need support ticket self service.',
      }),
      { actor: 'Sponsor' },
    );
    const provider = createCodexProvider({
      runCodex: async (prompt) => {
        expect(prompt).toContain('需求质检');
        return JSON.stringify({
          status: 'needs-work',
          score: 62,
          completedCount: 1,
          totalCount: 6,
          missingQuestionIds: ['scenarios'],
          missingQuestions: [{ id: 'scenarios', label: '核心场景' }],
          blockers: [{ title: '缺少核心场景', detail: '无法拆分验收路径。' }],
          warnings: [],
          recommendations: ['补充核心场景。'],
        });
      },
    });

    const result = await provider.reviewRequirements(project);

    expect(result.provider).toBe('codex-cli');
    expect(result.review).toMatchObject({
      status: 'needs-work',
      score: 62,
      missingQuestionIds: ['scenarios'],
    });
  });

  test('generates technical handoff bundle from Codex JSON output', async () => {
    const project = createProject({
      name: 'YOLO Camera Monitor',
      sponsor: 'AA',
      summary: 'Connect RTSP camera stream and detect people with YOLO.',
    });
    project.artifacts['prd-approval'] = '# PRD: YOLO Camera Monitor\n\nRTSP + YOLO person detection.';
    const provider = createCodexProvider({
      runCodex: async (prompt) => {
        expect(prompt).toContain('技术交接包');
        return JSON.stringify({
          architectureArtifact: '# 技术方案\nRTSP + YOLO',
          developmentArtifact: '# 开发任务\n推理服务',
          opsArtifact: '# 运维需求\n摄像头 RTSP 地址',
          qaArtifact: '# 测试计划\n误检率',
        });
      },
    });

    const result = await provider.generateTechnicalHandoff(project);

    expect(result.provider).toBe('codex-cli');
    expect(result.bundle.architectureArtifact).toContain('YOLO');
    expect(result.bundle.opsArtifact).toContain('RTSP');
  });

  test('times out slow Codex calls so workflow can use a fallback provider', async () => {
    const provider = createCodexProvider({
      runCodex: () => new Promise(() => {}),
      timeoutMs: 5,
    });

    await expect(
      provider.generateTechnicalHandoff(
        createProject({
          name: 'Slow AI',
          sponsor: 'AA',
          summary: 'The AI provider should not block the workflow forever.',
        }),
      ),
    ).rejects.toThrow('Codex CLI timed out');
  });
});

function advanceConfirmed(project, options = {}) {
  return advanceProject(confirmStage(project, project.currentStageId, options.actor || 'Test'), options);
}

function confirmStage(project, stageId = project.currentStageId, actor = 'Test') {
  const normalized = normalizeProject(project);
  const entry = normalized.stageConfirmations?.[stageId];
  return (entry?.items || []).reduce(
    (nextProject, item) =>
      updateStageConfirmationForProject(nextProject, {
        actor,
        stageId,
        itemId: item.id,
        value: `Confirmed ${item.title}`,
      }),
    normalized,
  );
}
