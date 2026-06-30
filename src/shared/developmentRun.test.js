import { describe, expect, test } from 'vitest';
import { normalizeDevelopmentRun } from './developmentRun.js';
import {
  STAGE_IDS,
  advanceProject,
  applyRequirementReview,
  createProject,
  generateAgentExecutionPackageForProject,
  generateAcceptancePackageForProject,
  generatePrdForProject,
  generateTechnicalHandoffForProject,
  recordBranchPreparationForProject,
  recordDevelopmentExecutionResultsForProject,
  recordDevelopmentCheckResultsForProject,
  recordCodeReviewForProject,
  routeQaDefectsToDevelopmentForProject,
  recordQaEvidenceForProject,
  recordQaRunForProject,
  recordRepositoryInspectionForProject,
  startDevelopmentRunForProject,
  normalizeProject,
  updateStageConfirmationForProject,
  updateRepositoryConfigForProject,
} from './workflow.js';

describe('development run', () => {
  test('normalizes legacy completed runs into review-ready change packages', () => {
    const run = normalizeDevelopmentRun({
      status: 'completed',
      summary: '旧项目已经完成开发。',
      commitHash: 'c60351e',
      filesChanged: ['src/monitoringState.js', 'test/monitoringState.test.js'],
      checks: [
        { command: 'npm test', status: 'passed' },
        { command: 'npm run build', status: 'passed' },
      ],
    });

    expect(run.changePackage).toMatchObject({
      status: 'ready-for-review',
      commitHash: 'c60351e',
      filesChanged: ['src/monitoringState.js', 'test/monitoringState.test.js'],
      verification: {
        total: 2,
        passed: 2,
        failed: 0,
        blocked: 0,
      },
      reviewGate: {
        canStartReview: true,
        blockers: [],
      },
    });
  });

  test('creates an honest execution record from the development plan', () => {
    const project = prepareReadyAgentPackageProject();

    const updated = startDevelopmentRunForProject(project, { actor: 'AI 开发' });

    expect(updated.developmentRun.status).toBe('ready-for-agent');
    expect(updated.developmentRun.mode).toBe('execution-package');
    expect(updated.developmentRun.taskResults).toHaveLength(updated.developmentPlan.tasks.length);
    expect(updated.developmentRun.taskResults[0]).toMatchObject({
      taskId: updated.developmentPlan.tasks[0].id,
      status: 'planned',
    });
    expect(updated.developmentRun.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ command: 'npm test', status: 'not-run' }),
      ]),
    );
    expect(updated.developmentRun.blockers).toEqual(
      expect.arrayContaining([expect.stringContaining('真实代码执行器')]),
    );
    expect(updated.developmentPlan.status).toBe('running');
    expect(updated.history[0]).toMatchObject({
      type: 'development-run-created',
      actor: 'AI 开发',
    });
  });

  test('blocks development runs outside the development stage', () => {
    const project = createProject({
      name: 'Not Development',
      sponsor: 'Owner',
      summary: 'Still at intake.',
    });

    expect(() => startDevelopmentRunForProject(project, { actor: 'AI 开发' })).toThrow('自动开发阶段');
  });

  test('blocks development runs before an AI package is generated', () => {
    const project = prepareDevelopmentProject();

    expect(() => startDevelopmentRunForProject(project, { actor: 'AI 开发' })).toThrow(
      '请先生成 AI 开发任务包',
    );
  });

  test('blocks development runs when the AI package has unresolved launch blockers', () => {
    const project = generateAgentExecutionPackageForProject(prepareDevelopmentProject(), {
      actor: 'AI Dev Lead',
    });

    expect(() => startDevelopmentRunForProject(project, { actor: 'AI 开发' })).toThrow(
      'AI 开发任务包不可启动',
    );
  });

  test('records executed verification check results on the current run', () => {
    const project = startDevelopmentRunForProject(prepareReadyAgentPackageProject(), {
      actor: 'AI 开发',
    });
    const executed = recordDevelopmentExecutionResultsForProject(project, {
      actor: 'AI 开发',
      execution: {
        status: 'completed',
        summary: '本地开发执行已完成，已生成 YOLO 摄像头监控基础实现和测试。',
        commitHash: 'abc1234',
        filesChanged: ['src/monitoringState.js', 'test/monitoringState.test.js'],
        repositoryAudit: {
          before: { branch: 'feature/yolo-camera-monitor', head: 'base111', changedFiles: [] },
          after: { branch: 'feature/yolo-camera-monitor', head: 'abc1234', changedFiles: [] },
          committed: true,
        },
        taskResults: project.developmentRun.taskResults.map((task) => ({
          ...task,
          status: 'completed',
          result: `${task.title} 已完成。`,
        })),
        blockers: [],
      },
    });

    const updated = recordDevelopmentCheckResultsForProject(executed, {
      actor: 'Local Runner',
      checks: executed.developmentRun.checks.map((check) => ({
        ...check,
        status: 'passed',
        exitCode: 0,
        durationMs: 24,
        result: `${check.command} passed`,
        stdout: 'ok',
        stderr: '',
      })),
    });

    expect(updated.developmentRun.status).toBe('completed');
    expect(updated.developmentPlan.status).toBe('done');
    expect(updated.developmentRun.changePackage).toMatchObject({
      status: 'ready-for-review',
      commitHash: 'abc1234',
      filesChanged: ['src/monitoringState.js', 'test/monitoringState.test.js'],
      repositoryAudit: {
        before: { branch: 'feature/yolo-camera-monitor', head: 'base111', changedFiles: [] },
        after: { branch: 'feature/yolo-camera-monitor', head: 'abc1234', changedFiles: [] },
        committed: true,
      },
      verification: {
        total: 3,
        passed: 3,
        failed: 0,
        blocked: 0,
      },
      reviewGate: {
        canStartReview: true,
        blockers: [],
      },
    });
    expect(updated.artifacts[STAGE_IDS.REVIEW]).toContain('# 开发变更包');
    expect(updated.artifacts[STAGE_IDS.REVIEW]).toContain('abc1234');
    expect(updated.developmentRun.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          command: 'npm test',
          status: 'passed',
          exitCode: 0,
          durationMs: 24,
        }),
      ]),
    );
    expect(updated.history[0]).toMatchObject({
      type: 'development-checks-finished',
      actor: 'Local Runner',
    });
  });

  test('records local development execution output before verification checks run', () => {
    const project = startDevelopmentRunForProject(prepareReadyAgentPackageProject(), {
      actor: 'AI 开发',
    });

    const updated = recordDevelopmentExecutionResultsForProject(project, {
      actor: 'AI 开发',
      execution: {
        status: 'completed',
        summary: '本地开发执行已完成，已生成 YOLO 摄像头监控基础实现和测试。',
        commitHash: 'abc1234',
        filesChanged: ['src/monitoringState.js', 'test/monitoringState.test.js'],
        repositoryAudit: {
          before: { branch: 'feature/yolo-camera-monitor', head: 'base111', changedFiles: [] },
          after: { branch: 'feature/yolo-camera-monitor', head: 'abc1234', changedFiles: [] },
          committed: true,
        },
        taskResults: project.developmentRun.taskResults.map((task) => ({
          ...task,
          status: 'completed',
          result: `${task.title} 已完成。`,
        })),
        blockers: [],
        nextActions: ['运行检查命令，确认本地实现可测试、可构建且依赖无漏洞。'],
      },
    });

    expect(updated.developmentRun).toMatchObject({
      status: 'running',
      summary: '本地开发执行已完成，已生成 YOLO 摄像头监控基础实现和测试。',
      commitHash: 'abc1234',
      filesChanged: ['src/monitoringState.js', 'test/monitoringState.test.js'],
      repositoryAudit: {
        before: { branch: 'feature/yolo-camera-monitor', head: 'base111', changedFiles: [] },
        after: { branch: 'feature/yolo-camera-monitor', head: 'abc1234', changedFiles: [] },
        committed: true,
      },
      blockers: ['检查命令尚未运行：请运行本地检查后再进入 Review。'],
      nextActions: ['运行检查命令，确认本地实现可测试、可构建且依赖无漏洞。'],
    });
    expect(updated.developmentRun.taskResults).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ status: 'completed', result: expect.stringContaining('已完成') }),
      ]),
    );
    expect(updated.developmentPlan.status).toBe('running');
    expect(updated.history[0]).toMatchObject({
      type: 'development-executed',
      actor: 'AI 开发',
    });
  });

  test('records passing code review and allows review stage to move to QA', () => {
    const project = {
      ...startDevelopmentRunForProject(prepareReadyAgentPackageProject(), { actor: 'AI 开发' }),
      currentStageId: STAGE_IDS.REVIEW,
      stages: prepareReadyAgentPackageProject().stages.map((stage) =>
        stage.id === STAGE_IDS.REVIEW ? { ...stage, status: 'active' } : stage,
      ),
      developmentRun: {
        status: 'completed',
        summary: '本地开发执行已完成，已生成 YOLO 摄像头监控基础实现和测试。',
        commitHash: 'abc1234',
        filesChanged: ['src/monitoringState.js', 'test/monitoringState.test.js'],
        checks: [{ command: 'npm test', status: 'passed' }],
        changePackage: {
          status: 'ready-for-review',
          createdAt: '2026-06-17T00:00:00.000Z',
          summary: '本地开发执行已完成，已生成 YOLO 摄像头监控基础实现和测试。',
          commitHash: 'abc1234',
          filesChanged: ['src/monitoringState.js', 'test/monitoringState.test.js'],
          verification: { total: 1, passed: 1, failed: 0, blocked: 0 },
          reviewGate: { canStartReview: true, blockers: [] },
        },
      },
    };

    const reviewed = recordCodeReviewForProject(project, {
      actor: '技术负责人',
      report: {
        status: 'passed',
        commitHash: 'abc1234',
        summary: '代码、安全和性能 Review 通过，可以进入测试阶段。',
        categories: [{ id: 'security', label: '安全', status: 'passed', findings: [] }],
        blockers: [],
        recommendations: ['测试阶段继续覆盖弱光场景。'],
        nextActions: ['进入测试阶段，生成并执行测试用例。'],
      },
    });

    expect(reviewed.codeReviewReport).toMatchObject({
      status: 'passed',
      commitHash: 'abc1234',
      sourceChangePackage: {
        commitHash: 'abc1234',
        filesChangedCount: 2,
      },
      qaHandoff: {
        status: 'ready',
        commitHash: 'abc1234',
      },
    });
    expect(reviewed.artifacts[STAGE_IDS.REVIEW]).toContain('# Code Review 报告');
    expect(reviewed.artifacts[STAGE_IDS.REVIEW]).toContain('abc1234');
    expect(reviewed.artifacts[STAGE_IDS.QA]).toContain('## Review 交接');
    expect(reviewed.artifacts[STAGE_IDS.QA]).toContain('src/monitoringState.js');
    expect(reviewed.history[0]).toMatchObject({
      type: 'code-review-finished',
      actor: '技术负责人',
    });
    expect(() => advanceConfirmed(reviewed, { actor: '技术负责人' })).not.toThrow();
  });

  test('blocks QA advance until code review passes', () => {
    const project = {
      ...prepareReadyAgentPackageProject(),
      currentStageId: STAGE_IDS.REVIEW,
      stages: prepareReadyAgentPackageProject().stages.map((stage) =>
        stage.id === STAGE_IDS.REVIEW ? { ...stage, status: 'active' } : stage,
      ),
    };

    expect(() =>
      advanceProject(confirmStage(project, STAGE_IDS.REVIEW, '技术负责人'), {
        actor: '技术负责人',
      }),
    ).toThrow('代码 Review 未通过');
  });

  test('records QA run and allows passed QA to advance', () => {
    const project = {
      ...prepareReadyAgentPackageProject(),
      currentStageId: STAGE_IDS.QA,
      stages: prepareReadyAgentPackageProject().stages.map((stage) =>
        stage.id === STAGE_IDS.QA ? { ...stage, status: 'active' } : stage,
      ),
      codeReviewReport: {
        status: 'passed',
        commitHash: 'c60351e',
        qaHandoff: {
          status: 'ready',
          commitHash: 'c60351e',
          focusAreas: ['有行人提示', 'RTSP 断流恢复'],
          requiredEvidence: ['测试样本清单与覆盖场景'],
          blockers: [],
        },
      },
      qaRun: null,
    };

    const tested = recordQaRunForProject(project, {
      actor: '测试',
      report: {
        status: 'passed',
        commitHash: 'c60351e',
        summary: '测试通过，准备最终验收材料。',
        testCases: [{ id: 'person-present', title: '有行人画面提示', status: 'passed' }],
        defects: [],
        blockers: [],
        recommendations: ['最终验收前补充真实摄像头联调记录。'],
        nextActions: ['测试通过，准备最终验收材料。'],
      },
    });

    expect(tested.qaRun).toMatchObject({
      status: 'passed',
      passedCount: 1,
      totalCount: 1,
      reviewHandoff: {
        status: 'ready',
        commitHash: 'c60351e',
        focusAreas: ['有行人提示', 'RTSP 断流恢复'],
      },
      coveragePlan: {
        source: 'code-review',
        commitHash: 'c60351e',
      },
      defectRouting: {
        shouldReturnToDevelopment: false,
        targetStageId: 'acceptance',
      },
    });
    expect(tested.artifacts[STAGE_IDS.QA]).toContain('## Review 交接');
    expect(tested.artifacts[STAGE_IDS.QA]).toContain('RTSP 断流恢复');
    expect(tested.artifacts[STAGE_IDS.QA]).toContain('## 缺陷回流');
    expect(tested.history[0]).toMatchObject({
      type: 'qa-run-finished',
      actor: '测试',
    });
    expect(() => advanceConfirmed(tested, { actor: '测试' })).not.toThrow();
  });

  test('routes QA implementation defects back to development with a fix package', () => {
    const project = {
      ...prepareReadyAgentPackageProject(),
      currentStageId: STAGE_IDS.QA,
      stages: prepareReadyAgentPackageProject().stages.map((stage) =>
        stage.id === STAGE_IDS.QA ? { ...stage, status: 'active' } : stage,
      ),
      developmentRun: {
        status: 'completed',
        commitHash: 'c60351e',
        filesChanged: ['src/monitoringState.js'],
        checks: [{ command: 'npm test', status: 'passed' }],
      },
      codeReviewReport: {
        status: 'passed',
        commitHash: 'c60351e',
      },
      qaRun: {
        status: 'needs-work',
        commitHash: 'c60351e',
        passedCount: 1,
        totalCount: 2,
        testCases: [
          { id: 'person-present', title: '有行人画面提示', status: 'passed' },
          { id: 'rtsp-reconnect', title: 'RTSP 断流恢复', status: 'blocked', evidence: '缺少重连测试。' },
        ],
        defects: [],
        blockers: ['缺少 rtsp 对应实现或测试。'],
        defectRouting: {
          shouldReturnToDevelopment: true,
          targetStageId: STAGE_IDS.DEVELOPMENT,
          reasons: ['缺少 rtsp 对应实现或测试。'],
        },
      },
    };

    const routed = routeQaDefectsToDevelopmentForProject(project, {
      actor: '测试',
      note: 'QA 阻塞，回开发补 RTSP 重连测试。',
    });

    expect(routed.currentStageId).toBe(STAGE_IDS.DEVELOPMENT);
    expect(routed.stages.find((stage) => stage.id === STAGE_IDS.QA).status).toBe('blocked');
    expect(routed.stages.find((stage) => stage.id === STAGE_IDS.DEVELOPMENT).status).toBe('active');
    expect(routed.defectFixPackage).toMatchObject({
      status: 'ready',
      sourceStageId: STAGE_IDS.QA,
      targetStageId: STAGE_IDS.DEVELOPMENT,
      sourceCommitHash: 'c60351e',
      reasons: ['缺少 rtsp 对应实现或测试。'],
      failingTestCases: [
        {
          id: 'rtsp-reconnect',
          title: 'RTSP 断流恢复',
          status: 'blocked',
        },
      ],
      requiredFixes: expect.arrayContaining(['缺少 rtsp 对应实现或测试。']),
      regressionFocus: expect.arrayContaining(['RTSP 断流恢复']),
    });
    expect(routed.developmentPlan.status).toBe('ready');
    expect(routed.developmentPlan.tasks.map((task) => task.title)).toEqual(
      expect.arrayContaining(['修复 QA 阻塞：缺少 rtsp 对应实现或测试。']),
    );
    expect(routed.artifacts[STAGE_IDS.DEVELOPMENT]).toContain('## QA 缺陷修复包');
    expect(routed.artifacts[STAGE_IDS.DEFECT_LOOP]).toContain('RTSP 断流恢复');
    expect([
      ...routed.stageRiskRegister[STAGE_IDS.DEVELOPMENT].potentialRisks.map((item) => item.title),
      ...routed.stageRiskRegister[STAGE_IDS.DEVELOPMENT].functionalGaps.map((item) => item.title),
    ]).toEqual(expect.arrayContaining(['QA 缺陷修复待执行', '缺陷修复包尚未执行']));
    expect(routed.history[0]).toMatchObject({
      type: 'qa-defects-routed-to-development',
      from: STAGE_IDS.QA,
      to: STAGE_IDS.DEVELOPMENT,
      actor: '测试',
    });
  });

  test('does not route QA evidence-only blockers back to development', () => {
    const project = {
      ...prepareReadyAgentPackageProject(),
      currentStageId: STAGE_IDS.QA,
      stages: prepareReadyAgentPackageProject().stages.map((stage) =>
        stage.id === STAGE_IDS.QA ? { ...stage, status: 'active' } : stage,
      ),
      qaRun: {
        status: 'needs-work',
        blockers: ['测试视频样本、测试时长、测试环境尚未确认。'],
        defectRouting: {
          shouldReturnToDevelopment: false,
          targetStageId: STAGE_IDS.QA,
          reasons: ['测试视频样本、测试时长、测试环境尚未确认。'],
        },
      },
    };

    expect(() => routeQaDefectsToDevelopmentForProject(project, { actor: '测试' })).toThrow(
      'QA 缺陷未判定为回流开发',
    );
  });

  test('advances passed QA directly to final acceptance', () => {
    const tested = preparePassedQaProject();

    const advanced = advanceConfirmed(tested, { actor: '测试' });

    expect(advanced.currentStageId).toBe(STAGE_IDS.ACCEPTANCE);
    expect(advanced.stages.find((stage) => stage.id === STAGE_IDS.QA).status).toBe('approved');
    expect(advanced.stages.find((stage) => stage.id === STAGE_IDS.DEFECT_LOOP).status).toBe('queued');
    expect(advanced.stages.find((stage) => stage.id === STAGE_IDS.ACCEPTANCE).status).toBe('active');
  });

  test('requires a ready acceptance package before final completion', () => {
    const acceptanceProject = advanceConfirmed(preparePassedQaProject(), { actor: '测试' });

    expect(() =>
      advanceProject(confirmStage(acceptanceProject, STAGE_IDS.ACCEPTANCE, '负责人'), {
        actor: '负责人',
      }),
    ).toThrow('最终验收包');
  });

  test('generates final acceptance package and allows completion', () => {
    const acceptanceProject = advanceConfirmed(preparePassedQaProject(), { actor: '测试' });

    const packaged = generateAcceptancePackageForProject(acceptanceProject, { actor: '负责人' });
    const completed = advanceConfirmed(packaged, {
      actor: '负责人',
      note: '验收通过，归档交付包。',
      archiveVersion: 'v2026.06-yolo-acceptance',
    });

    expect(packaged.acceptancePackage).toMatchObject({
      status: 'ready',
      signoffStatus: 'pending',
    });
    expect(packaged.artifacts[STAGE_IDS.ACCEPTANCE]).toContain('# 最终验收包');
    expect([
      ...packaged.stageRiskRegister[STAGE_IDS.ACCEPTANCE].potentialRisks.map((item) => item.title),
      ...packaged.stageRiskRegister[STAGE_IDS.ACCEPTANCE].functionalGaps.map((item) => item.title),
    ]).toEqual(expect.arrayContaining(['负责人签收待完成']));
    expect([
      ...packaged.stageRiskRegister[STAGE_IDS.ACCEPTANCE].potentialRisks.map((item) => item.title),
      ...packaged.stageRiskRegister[STAGE_IDS.ACCEPTANCE].functionalGaps.map((item) => item.title),
    ]).not.toContain('缺少最终交付包');
    expect(packaged.history[0]).toMatchObject({
      type: 'acceptance-package-generated',
      actor: '负责人',
    });
    expect(completed.history[0]).toMatchObject({
      type: 'complete',
      actor: '负责人',
    });
    expect(completed.acceptancePackage).toMatchObject({
      status: 'ready',
      signoffStatus: 'signed-off',
      signedOffBy: '负责人',
      signoffOpinion: '验收通过，归档交付包。',
      archiveVersion: 'v2026.06-yolo-acceptance',
    });
    expect(completed.artifacts[STAGE_IDS.ACCEPTANCE]).toContain('归档版本：v2026.06-yolo-acceptance');
    expect([
      ...completed.stageRiskRegister[STAGE_IDS.ACCEPTANCE].potentialRisks.map((item) => item.title),
      ...completed.stageRiskRegister[STAGE_IDS.ACCEPTANCE].functionalGaps.map((item) => item.title),
    ]).not.toEqual(expect.arrayContaining(['负责人签收待完成', '签收记录尚未结构化']));
    expect(completed.stageRiskRegister[STAGE_IDS.ACCEPTANCE].riskLevel).toBe('low');
  });

  test('refreshes QA risk register after evidence and tests pass', () => {
    const project = {
      ...prepareReadyAgentPackageProject(),
      currentStageId: STAGE_IDS.QA,
      stages: prepareReadyAgentPackageProject().stages.map((stage) =>
        stage.id === STAGE_IDS.QA ? { ...stage, status: 'active' } : stage,
      ),
    };
    const withEvidence = recordQaEvidenceForProject(project, {
      actor: '测试',
      evidence: {
        sampleSet: '10 段测试视频：有行人、无行人、多人、遮挡、弱光各 2 段。',
        durationMinutes: 30,
        environment: '本地 RTSP 测试流 + YOLO mock 推理服务。',
        browserScope: 'Chrome 126, Edge 126',
        totalDetections: 50,
        falsePositiveCount: 9,
      },
    });
    const tested = recordQaRunForProject(withEvidence, {
      actor: '测试',
      report: {
        status: 'passed',
        commitHash: 'c60351e',
        summary: '测试通过，准备最终验收材料。',
        testCases: [
          { id: 'weak-light-occlusion', title: '弱光与遮挡场景', status: 'passed' },
        ],
        defects: [],
        blockers: [],
        recommendations: ['最终验收前保留真实 RTSP 联调记录和误检率原始统计。'],
        nextActions: ['测试通过，准备最终验收材料。'],
      },
    });

    const qaRisk = tested.stageRiskRegister[STAGE_IDS.QA];
    const qaIssueTitles = [
      ...qaRisk.potentialRisks.map((item) => item.title),
      ...qaRisk.functionalGaps.map((item) => item.title),
    ];

    expect(qaRisk.riskLevel).toBe('medium');
    expect(qaIssueTitles).not.toContain('自动测试执行尚未接入');
    expect(qaIssueTitles).not.toContain('测试样本与测试时长未确认');
    expect(qaIssueTitles).toContain('真实 RTSP 验收记录待归档');
  });

  test('blocks QA advance until tests pass', () => {
    const project = {
      ...prepareReadyAgentPackageProject(),
      currentStageId: STAGE_IDS.QA,
      stages: prepareReadyAgentPackageProject().stages.map((stage) =>
        stage.id === STAGE_IDS.QA ? { ...stage, status: 'active' } : stage,
      ),
      qaRun: {
        status: 'needs-work',
        blockers: ['测试视频样本、测试时长、测试环境尚未确认。'],
      },
    };

    expect(() =>
      advanceProject(confirmStage(project, STAGE_IDS.QA, '测试'), { actor: '测试' }),
    ).toThrow('测试未通过');
  });

  test('records QA evidence on the QA stage', () => {
    const project = {
      ...prepareReadyAgentPackageProject(),
      currentStageId: STAGE_IDS.QA,
      stages: prepareReadyAgentPackageProject().stages.map((stage) =>
        stage.id === STAGE_IDS.QA ? { ...stage, status: 'active' } : stage,
      ),
    };

    const updated = recordQaEvidenceForProject(project, {
      actor: '测试',
      evidence: {
        sampleSet: '10 段测试视频：有行人、无行人、多人、遮挡、弱光各 2 段。',
        durationMinutes: 30,
        environment: '本地 RTSP 测试流 + YOLO mock 推理服务。',
        browserScope: 'Chrome 126, Edge 126',
        totalDetections: 50,
        falsePositiveCount: 9,
        notes: '误检率按 PRD 口径统计。',
      },
    });

    expect(updated.qaEvidence).toMatchObject({
      status: 'ready',
      durationMinutes: 30,
      missingFields: [],
    });
    expect(updated.artifacts[STAGE_IDS.QA]).toContain('## 测试证据');
    expect(updated.history[0]).toMatchObject({
      type: 'qa-evidence-updated',
      actor: '测试',
    });
  });

  test('updates QA evidence artifact without duplicating the evidence section', () => {
    const project = {
      ...prepareReadyAgentPackageProject(),
      currentStageId: STAGE_IDS.QA,
      stages: prepareReadyAgentPackageProject().stages.map((stage) =>
        stage.id === STAGE_IDS.QA ? { ...stage, status: 'active' } : stage,
      ),
    };
    const firstSave = recordQaEvidenceForProject(project, {
      actor: '测试',
      evidence: {
        sampleSet: '第一批样本',
        durationMinutes: 20,
        environment: '本地测试环境',
        browserScope: 'Chrome 126',
      },
    });
    const secondSave = recordQaEvidenceForProject(firstSave, {
      actor: '测试',
      evidence: {
        sampleSet: '第二批样本',
        durationMinutes: 30,
        environment: '本地 RTSP 测试流',
        browserScope: 'Chrome 126, Edge 126',
      },
    });

    const evidenceSections = secondSave.artifacts[STAGE_IDS.QA].match(/## 测试证据/g) || [];

    expect(evidenceSections).toHaveLength(1);
    expect(secondSave.artifacts[STAGE_IDS.QA]).toContain('第二批样本');
    expect(secondSave.artifacts[STAGE_IDS.QA]).not.toContain('第一批样本');
  });
});

function prepareReadyAgentPackageProject() {
  const configured = updateRepositoryConfigForProject(prepareDevelopmentProject(), {
    actor: 'Tech Lead',
    config: {
      localPath: 'D:\\project\\business-repo',
      baseBranch: 'main',
      targetBranch: 'feature/yolo-camera-monitor',
      executionMode: 'codex-local',
      verificationCommands: ['npm test'],
    },
  });
  const inspected = recordRepositoryInspectionForProject(configured, {
    actor: 'Local Runner',
    inspection: {
      status: 'ready',
      localPath: 'D:\\project\\business-repo',
      gitRoot: 'D:\\project\\business-repo',
      currentBranch: 'main',
      targetBranch: 'feature/yolo-camera-monitor',
      isGitRepository: true,
      targetBranchExists: false,
      hasUncommittedChanges: false,
      changedFilesCount: 0,
      canPrepareBranch: true,
      issues: [],
      recommendations: [],
    },
  });
  const prepared = recordBranchPreparationForProject(inspected, {
    actor: 'Local Runner',
    preparation: {
      status: 'ready',
      localPath: 'D:\\project\\business-repo',
      previousBranch: 'main',
      currentBranch: 'feature/yolo-camera-monitor',
      baseBranch: 'main',
      targetBranch: 'feature/yolo-camera-monitor',
      targetBranchExisted: false,
      createdBranch: true,
      checkedOut: true,
      canRunDevelopment: true,
      issues: [],
      recommendations: [],
    },
  });

  return generateAgentExecutionPackageForProject(prepared, { actor: 'AI Dev Lead' });
}

function preparePassedQaProject() {
  const project = {
    ...prepareReadyAgentPackageProject(),
    currentStageId: STAGE_IDS.QA,
    stages: prepareReadyAgentPackageProject().stages.map((stage) =>
      stage.id === STAGE_IDS.QA ? { ...stage, status: 'active' } : stage,
    ),
    developmentRun: {
      status: 'completed',
      commitHash: 'c60351e',
      filesChanged: ['src/monitoringState.js'],
      checks: [{ command: 'npm test', status: 'passed' }],
    },
    codeReviewReport: {
      status: 'passed',
    },
  };
  const withEvidence = recordQaEvidenceForProject(project, {
    actor: '测试',
    evidence: {
      sampleSet: '10 段测试视频：有行人、无行人、多人、遮挡、弱光各 2 段。',
      durationMinutes: 30,
      environment: '本地 RTSP 测试流 + YOLO mock 推理服务。',
      browserScope: 'Chrome 126, Edge 126',
      totalDetections: 50,
      falsePositiveCount: 9,
      notes: '误检率按 PRD 口径统计。',
    },
  });

  return recordQaRunForProject(withEvidence, {
    actor: '测试',
    report: {
      status: 'passed',
      commitHash: 'c60351e',
      summary: '测试通过，准备最终验收材料。',
      testCases: [
        { id: 'person-present', title: '有行人画面提示', status: 'passed' },
        { id: 'weak-light-occlusion', title: '弱光与遮挡场景', status: 'passed' },
      ],
      defects: [],
      blockers: [],
      recommendations: ['最终验收前保留真实 RTSP 联调记录和误检率原始统计。'],
      nextActions: ['测试通过，准备最终验收材料。'],
    },
  });
}

function prepareDevelopmentProject() {
  const project = generatePrdForProject(
    applyRequirementReview(
      advanceConfirmed(
        createProject({
          name: 'yolo摄像头监控项目',
          sponsor: 'AA',
          summary: '连接 RTSP 摄像头并用 YOLO 检测行人。',
        }),
        { actor: '负责人' },
      ),
      {
        review: {
          status: 'ready',
          score: 90,
          completedCount: 6,
          totalCount: 6,
          missingQuestionIds: [],
          missingQuestions: [],
          blockers: [],
          warnings: [],
          recommendations: [],
        },
      },
    ),
    {
      actor: 'PM',
      artifact: '# PRD: yolo摄像头监控项目\n\nRTSP 摄像头，YOLO 行人检测，标注框。',
    },
  );
  const handoff = generateTechnicalHandoffForProject(project, { actor: '技术负责人' });
  return {
    ...handoff,
    currentStageId: STAGE_IDS.DEVELOPMENT,
    stages: handoff.stages.map((stage) =>
      stage.id === STAGE_IDS.DEVELOPMENT ? { ...stage, status: 'active' } : stage,
    ),
  };
}

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
