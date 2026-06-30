import { describe, expect, test } from 'vitest';
import {
  REQUIREMENT_QUESTIONS,
  STAGE_IDS,
  advanceProject,
  answerRequirementQuestion,
  applyRequirementReview,
  createProject,
  generateTechnicalHandoffForProject,
  generatePrdForProject,
  generateAgentExecutionPackageForProject,
  normalizeProject,
  recordCodeReviewForProject,
  recordBranchPreparationForProject,
  recordDevelopmentCheckResultsForProject,
  recordQaRunForProject,
  recordRepositoryInspectionForProject,
  recordTaskCommentForProject,
  rejectProjectStage,
  updateStageConfirmationForProject,
  updateProjectMembersForProject,
  updateRepositoryConfigForProject,
} from './workflow.js';

describe('workflow model', () => {
  test('creates a project with intake as the active stage and generated intake artifact', () => {
    const project = createProject({
      name: '客户门户升级',
      sponsor: '业务负责人',
      summary: '需要为客户提供自助查询和工单入口',
    });

    expect(project.currentStageId).toBe(STAGE_IDS.INTAKE);
    expect(project.stages[0]).toMatchObject({
      id: STAGE_IDS.INTAKE,
      status: 'active',
      owner: '负责人',
    });
    expect(project.artifacts[STAGE_IDS.INTAKE]).toContain('客户门户升级');
    expect(project.members).toMatchObject({
      owner: 'owner-aa',
      pm: 'pm-lin',
      'tech-lead': 'tech-chen',
      qa: 'qa-zhao',
    });
  });

  test('normalizes legacy projects with default project members', () => {
    const project = createProject({
      name: '历史项目',
      sponsor: '业务负责人',
      summary: '从旧版本导入的项目。',
    });
    delete project.members;

    expect(normalizeProject(project).members).toMatchObject({
      owner: 'owner-aa',
      pm: 'pm-lin',
      'tech-lead': 'tech-chen',
      qa: 'qa-zhao',
    });
  });

  test('updates project members with an audit history entry', () => {
    const project = createProject({
      name: '成员调整',
      sponsor: 'AA',
      summary: '切换技术负责人。',
    });

    const updated = updateProjectMembersForProject(project, {
      actor: '负责人',
      members: {
        ...project.members,
        'tech-lead': 'tech-li',
      },
    });

    expect(updated.members['tech-lead']).toBe('tech-li');
    expect(updated.history[0]).toMatchObject({
      type: 'project-members-updated',
      actor: '负责人',
    });
  });

  test('creates stage confirmation register and normalizes legacy projects', () => {
    const project = createProject({
      name: 'yolo摄像头监控项目',
      sponsor: 'AA',
      summary: '接入 RTSP 摄像头并使用 YOLO 检测行人。',
    });

    expect(project.stageConfirmations[STAGE_IDS.ARCHITECTURE].items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'data-model', title: '数据库与数据模型' }),
      ]),
    );
    expect(project.stageConfirmations[STAGE_IDS.QA].missingItems).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'test-samples' }),
      ]),
    );

    delete project.stageConfirmations;
    const normalized = normalizeProject(project);
    expect(normalized.stageConfirmations[STAGE_IDS.OPS_REQUIREMENTS].items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'rtsp-access', title: 'RTSP 接入凭据' }),
      ]),
    );
  });

  test('updates a current-stage confirmation item with audit history', () => {
    const project = {
      ...createProject({
        name: '阶段确认事项',
        sponsor: 'AA',
        summary: '维护每个阶段进入下一步前必须确认的内容。',
      }),
      currentStageId: STAGE_IDS.QA,
    };

    const updated = updateStageConfirmationForProject(project, {
      actor: '测试',
      stageId: STAGE_IDS.QA,
      itemId: 'test-samples',
      value: '有行人、无人、多人、遮挡、弱光样本各 10 分钟。',
    });

    expect(
      updated.stageConfirmations[STAGE_IDS.QA].items.find((item) => item.id === 'test-samples'),
    ).toMatchObject({
      status: 'confirmed',
      value: '有行人、无人、多人、遮挡、弱光样本各 10 分钟。',
      confirmedBy: '测试',
    });
    expect(updated.history[0]).toMatchObject({
      type: 'stage-confirmation-updated',
      actor: '测试',
      from: STAGE_IDS.QA,
      to: STAGE_IDS.QA,
      stageId: STAGE_IDS.QA,
      itemId: 'test-samples',
      itemTitle: expect.any(String),
      followupTaskId: `${STAGE_IDS.QA}-test-samples`,
      taskStatus: 'resolved',
      valueSummary: updated.stageConfirmations[STAGE_IDS.QA].items.find(
        (item) => item.id === 'test-samples',
      ).value,
    });
  });

  test('records a task comment with structured task audit fields', () => {
    const project = {
      ...createProject({
        name: '任务备注',
        sponsor: 'AA',
        summary: '在待办详情里记录处理沟通。',
      }),
      currentStageId: STAGE_IDS.QA,
    };

    const updated = recordTaskCommentForProject(project, {
      actor: '赵测试',
      stageId: STAGE_IDS.QA,
      itemId: 'test-samples',
      comment: '样本源已找运维确认，预计今天补齐 RTSP 测试流。',
    });

    expect(updated.history[0]).toMatchObject({
      type: 'task-comment-added',
      actor: '赵测试',
      from: STAGE_IDS.QA,
      to: STAGE_IDS.QA,
      stageId: STAGE_IDS.QA,
      itemId: 'test-samples',
      followupTaskId: `${STAGE_IDS.QA}-test-samples`,
      comment: '样本源已找运维确认，预计今天补齐 RTSP 测试流。',
      note: '任务备注：样本源已找运维确认，预计今天补齐 RTSP 测试流。',
    });
  });

  test('blocks stage advancement until current-stage confirmations are complete', () => {
    const project = createProject({
      name: '确认门禁',
      sponsor: 'AA',
      summary: '阶段进入下一步前必须补齐确认事项。',
    });

    expect(() => advanceProject(project, { actor: 'AA' })).toThrow('阶段确认事项未补齐');

    try {
      advanceProject(project, { actor: 'AA' });
    } catch (error) {
      expect(error).toMatchObject({
        name: 'WorkflowGateError',
        details: {
          stageId: STAGE_IDS.INTAKE,
          missingItemIds: expect.arrayContaining(['business-goal', 'scope-seed']),
        },
      });
    }
  });

  test('creates a stage risk register for every workflow stage', () => {
    const project = createProject({
      name: 'yolo摄像头监控项目',
      sponsor: 'AA',
      summary: '连接 RTSP 摄像头并用 YOLO 检测行人。',
    });

    expect(Object.keys(project.stageRiskRegister)).toEqual(
      expect.arrayContaining(Object.values(STAGE_IDS)),
    );
    expect(project.stageRiskRegister[STAGE_IDS.OPS_REQUIREMENTS]).toMatchObject({
      stageName: '运维需求',
      riskLevel: expect.any(String),
    });
    expect(project.stageRiskRegister[STAGE_IDS.OPS_REQUIREMENTS].potentialRisks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ title: expect.stringContaining('RTSP') }),
      ]),
    );
    expect(project.stageRiskRegister[STAGE_IDS.QA].functionalGaps).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ title: expect.stringContaining('测试样本') }),
      ]),
    );
  });

  test('advances project one stage at a time and records approval history', () => {
    const project = createProject({
      name: '销售线索系统',
      sponsor: '销售 VP',
      summary: '统一线索录入、分配和跟进',
    });

    const next = advanceConfirmed(project, {
      actor: 'Alice',
      note: '需求入口确认完成',
    });

    expect(next.currentStageId).toBe(STAGE_IDS.PM_REQUIREMENTS);
    expect(next.stages[0].status).toBe('approved');
    expect(next.stages[1].status).toBe('active');
    expect(next.history[0]).toMatchObject({
      type: 'advance',
      from: STAGE_IDS.INTAKE,
      to: STAGE_IDS.PM_REQUIREMENTS,
      actor: 'Alice',
    });
  });

  test('rejects a gate stage back to the configured previous stage', () => {
    const project = createProject({
      name: '结算重构',
      sponsor: '财务负责人',
      summary: '提升结算准确性和对账效率',
    });
    const pmStage = advanceConfirmed(project, { actor: 'PM' });
    const readyForApproval = prepareReadyPrd(pmStage);
    const prdGate = advanceConfirmed(readyForApproval, { actor: 'PM' });

    const rejected = rejectProjectStage(prdGate, {
      actor: '负责人',
      note: '验收指标不够明确',
    });

    expect(rejected.currentStageId).toBe(STAGE_IDS.PM_REQUIREMENTS);
    expect(rejected.stages.find((stage) => stage.id === STAGE_IDS.PRD_APPROVAL).status).toBe('blocked');
    expect(rejected.stages.find((stage) => stage.id === STAGE_IDS.PM_REQUIREMENTS).status).toBe('active');
    expect(rejected.history[0]).toMatchObject({
      type: 'reject',
      from: STAGE_IDS.PRD_APPROVAL,
      to: STAGE_IDS.PM_REQUIREMENTS,
    });
  });

  test('blocks PRD approval when requirement review has not passed', () => {
    const project = advanceConfirmed(
      createProject({
        name: 'Support Portal',
        sponsor: 'Service Lead',
        summary: 'Customers need a self-service support portal.',
      }),
      { actor: 'Sponsor' },
    );

    expect(() =>
      advanceProject(confirmStage(project, STAGE_IDS.PM_REQUIREMENTS, 'PM'), { actor: 'PM' }),
    ).toThrow('PRD 审批');
  });

  test('allows PRD approval after complete requirements are reviewed and PRD is generated', () => {
    const project = advanceConfirmed(
      createProject({
        name: 'Support Portal',
        sponsor: 'Service Lead',
        summary: 'Customers need a self-service support portal.',
      }),
      { actor: 'Sponsor' },
    );

    const readyForApproval = prepareReadyPrd(project);
    const advanced = advanceConfirmed(readyForApproval, { actor: 'PM' });

    expect(advanced.currentStageId).toBe(STAGE_IDS.PRD_APPROVAL);
    expect(advanced.stages.find((stage) => stage.id === STAGE_IDS.PM_REQUIREMENTS).status).toBe(
      'approved',
    );
  });

  test('marks requirement review stale when a saved answer changes', () => {
    const project = advanceConfirmed(
      createProject({
        name: 'Support Portal',
        sponsor: 'Service Lead',
        summary: 'Customers need a self-service support portal.',
      }),
      { actor: 'Sponsor' },
    );
    const readyForApproval = prepareReadyPrd(project);

    const changed = answerRequirementQuestion(readyForApproval, {
      questionId: 'scope',
      answer: '本期增加移动端 App，需要重新确认范围。',
      actor: 'PM',
    });

    expect(changed.prdStatus).toBe('draft');
    expect(changed.prdApprovalReady).toBe(false);
    expect(changed.requirementReview.status).toBe('stale');
  });

  test('records PRD version metadata and a requirement snapshot when PRD is generated', () => {
    const project = advanceConfirmed(
      createProject({
        name: 'Versioned Support Portal',
        sponsor: 'Service Lead',
        summary: 'Customers need a self-service support portal.',
      }),
      { actor: 'Sponsor' },
    );

    const readyForApproval = prepareReadyPrd(project);

    expect(readyForApproval.prdVersion).toMatchObject({
      number: 1,
      label: 'v1',
      generatedBy: 'PM',
    });
    expect(readyForApproval.prdRequirementSnapshot).toMatchObject({
      version: 1,
      answers: expect.objectContaining({
        scope: expect.any(String),
        successMetrics: expect.any(String),
      }),
    });
    expect(readyForApproval.prdChangeImpact).toMatchObject({
      status: 'current',
      changedQuestionIds: [],
      requiredActions: [],
    });
  });

  test('tracks PRD change impact when a saved requirement answer changes after PRD generation', () => {
    const project = advanceConfirmed(
      createProject({
        name: 'Change Impact Portal',
        sponsor: 'Service Lead',
        summary: 'Customers need a self-service support portal.',
      }),
      { actor: 'Sponsor' },
    );
    const readyForApproval = prepareReadyPrd(project);

    const changed = answerRequirementQuestion(readyForApproval, {
      questionId: 'scope',
      answer: 'This release now adds a mobile app and needs scope approval again.',
      actor: 'PM',
    });

    expect(changed.prdVersion).toMatchObject({
      number: 1,
      status: 'stale',
    });
    expect(changed.prdChangeImpact).toMatchObject({
      status: 'stale',
      version: 1,
      changedQuestionIds: ['scope'],
      requiredActions: ['重新运行智能需求评审', '重新生成需求文档草稿'],
    });
    expect(changed.prdChangeImpact.changedQuestions[0]).toMatchObject({
      id: 'scope',
      label: expect.any(String),
      currentAnswer: 'This release now adds a mobile app and needs scope approval again.',
    });
    expect(changed.history[0]).toMatchObject({
      type: 'requirement-answer',
      prdImpactStatus: 'stale',
      changedQuestionIds: ['scope'],
    });
  });

  test('increments PRD version and clears stale change impact when PRD is regenerated', () => {
    const project = advanceConfirmed(
      createProject({
        name: 'Regenerated Support Portal',
        sponsor: 'Service Lead',
        summary: 'Customers need a self-service support portal.',
      }),
      { actor: 'Sponsor' },
    );
    const readyForApproval = prepareReadyPrd(project);
    const changed = answerRequirementQuestion(readyForApproval, {
      questionId: 'scope',
      answer: 'This release now adds a mobile app and needs scope approval again.',
      actor: 'PM',
    });
    const reviewed = applyRequirementReview(changed, { actor: 'PM' });

    const regenerated = generatePrdForProject(reviewed, { actor: 'PM' });

    expect(regenerated.prdVersion).toMatchObject({
      number: 2,
      label: 'v2',
      status: 'current',
      generatedBy: 'PM',
    });
    expect(regenerated.prdRequirementSnapshot).toMatchObject({
      version: 2,
      answers: expect.objectContaining({
        scope: 'This release now adds a mobile app and needs scope approval again.',
      }),
    });
    expect(regenerated.prdChangeImpact).toMatchObject({
      status: 'current',
      changedQuestionIds: [],
      requiredActions: [],
    });
  });

  test('records PM requirement answers and refreshes the PRD draft', () => {
    const project = advanceConfirmed(
      createProject({
        name: 'Billing Portal',
        sponsor: 'Finance Lead',
        summary: 'Let finance users review invoices and dispute mismatches.',
      }),
      { actor: 'Sponsor' },
    );

    const answered = answerRequirementQuestion(project, {
      questionId: REQUIREMENT_QUESTIONS[0].id,
      answer: 'Finance operators and account managers.',
      actor: 'PM',
    });

    expect(answered.requirementAnswers[REQUIREMENT_QUESTIONS[0].id]).toBe(
      'Finance operators and account managers.',
    );
    expect(answered.artifacts[STAGE_IDS.PM_REQUIREMENTS]).toContain(
      'Finance operators and account managers.',
    );
    expect(answered.history[0]).toMatchObject({
      type: 'requirement-answer',
      actor: 'PM',
    });
  });

  test('generates a structured PRD from requirement answers', () => {
    const project = advanceConfirmed(
      createProject({
        name: 'Customer Support Desk',
        sponsor: 'Service Lead',
        summary: 'Customers need a support ticket entry and service agents need triage.',
      }),
      { actor: 'Sponsor' },
    );
    const withUsers = answerRequirementQuestion(project, {
      questionId: 'users',
      answer: 'Customers, support agents, and service managers.',
      actor: 'PM',
    });
    const withScenarios = answerRequirementQuestion(withUsers, {
      questionId: 'scenarios',
      answer: 'Submit tickets, assign tickets, reply to tickets, and close tickets.',
      actor: 'PM',
    });

    const prd = generatePrdForProject(withScenarios, { actor: 'PM' });

    expect(prd.artifacts[STAGE_IDS.PRD_APPROVAL]).toContain('# PRD: Customer Support Desk');
    expect(prd.artifacts[STAGE_IDS.PRD_APPROVAL]).toContain('Customers, support agents');
    expect(prd.prdStatus).toBe('generated');
    expect(prd.history[0]).toMatchObject({
      type: 'prd-generated',
      actor: 'PM',
    });
  });

  test('uses an externally generated PRD artifact when provided', () => {
    const project = advanceConfirmed(
      createProject({
        name: 'AI PRD',
        sponsor: 'Sponsor',
        summary: 'Use Codex to draft PRDs.',
      }),
      { actor: 'Sponsor' },
    );

    const prd = generatePrdForProject(project, {
      actor: 'PM',
      artifact: '# PRD: AI PRD\n\nGenerated by Codex.',
      provider: 'codex-cli',
    });

    expect(prd.artifacts[STAGE_IDS.PRD_APPROVAL]).toBe('# PRD: AI PRD\n\nGenerated by Codex.');
    expect(prd.prdProvider).toBe('codex-cli');
  });

  test('generates technical handoff artifacts from an approved YOLO PRD', () => {
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
        artifact: '# PRD: yolo摄像头监控项目\n\nRTSP 摄像头，YOLO 行人检测，标注框，误检率低于 30%。',
      },
    );

    const handoff = generateTechnicalHandoffForProject(project, { actor: '技术负责人' });

    expect(handoff.technicalHandoffStatus).toBe('generated');
    expect(handoff.artifacts[STAGE_IDS.ARCHITECTURE]).toContain('RTSP');
    expect(handoff.artifacts[STAGE_IDS.ARCHITECTURE]).toContain('YOLO');
    expect(handoff.artifacts[STAGE_IDS.DEVELOPMENT]).toContain('推理服务');
    expect(handoff.artifacts[STAGE_IDS.OPS_REQUIREMENTS]).toContain('摄像头 RTSP 地址');
    expect(handoff.artifacts[STAGE_IDS.QA]).toContain('误检率');
  });

  test('preserves generated handoff artifacts when advancing into later stages', () => {
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

    const handoff = generateTechnicalHandoffForProject(project, {
      actor: '技术负责人',
      bundle: {
        architectureArtifact: '# 技术方案\nRTSP 技术方案',
        developmentArtifact: '# 开发任务\nYOLO 推理服务和标注框',
        opsArtifact: '# 运维需求\n摄像头 RTSP 地址',
        qaArtifact: '# 测试计划\n误检率统计',
      },
    });
    const inArchitecture = { ...handoff, currentStageId: STAGE_IDS.ARCHITECTURE };
    const inOps = advanceConfirmed(inArchitecture, { actor: '技术负责人' });
    const inDevelopment = advanceConfirmed(inOps, { actor: '运维' });

    expect(inOps.artifacts[STAGE_IDS.OPS_REQUIREMENTS]).toContain('摄像头 RTSP 地址');
    expect(inDevelopment.artifacts[STAGE_IDS.DEVELOPMENT]).toContain('YOLO 推理服务和标注框');
  });

  test('normalizes older projects with missing requirement fields', () => {
    const project = createProject({
      name: 'Legacy Project',
      sponsor: 'Sponsor',
      summary: 'Created before PM requirement questions existed.',
    });
    delete project.requirementQuestions;
    delete project.requirementAnswers;
    delete project.stageRiskRegister;
    delete project.artifacts[STAGE_IDS.PM_REQUIREMENTS];

    const normalized = normalizeProject(project);

    expect(normalized.requirementQuestions).toHaveLength(REQUIREMENT_QUESTIONS.length);
    expect(normalized.requirementAnswers).toEqual({});
    expect(normalized.stageRiskRegister[STAGE_IDS.DEVELOPMENT].functionalGaps.length).toBeGreaterThan(0);
    expect(normalized.artifacts[STAGE_IDS.PM_REQUIREMENTS]).toContain('PRD 草案');
  });
  test('saves repository executor config on a project', () => {
    const project = createProject({
      name: 'Repo Config',
      sponsor: 'Owner',
      summary: 'Needs a code repository before automatic development.',
    });

    const updated = updateRepositoryConfigForProject(project, {
      actor: 'Tech Lead',
      config: {
        repositoryUrl: 'https://github.com/acme/yolo-monitor.git',
        baseBranch: 'main',
        targetBranch: 'feature/yolo-camera-monitor',
        executionMode: 'codex-local',
        verificationCommands: ['npm test', 'npm run build'],
      },
    });

    expect(updated.repositoryConfig.status).toBe('ready');
    expect(updated.repositoryConfig.targetBranch).toBe('feature/yolo-camera-monitor');
    expect(updated.history[0]).toMatchObject({
      type: 'repository-config-updated',
      actor: 'Tech Lead',
    });
  });

  test('records repository inspection results on a project', () => {
    const project = updateRepositoryConfigForProject(
      createProject({
        name: 'Repo Inspection',
        sponsor: 'Owner',
        summary: 'Needs repository diagnostics before automatic development.',
      }),
      {
        actor: 'Tech Lead',
        config: {
          localPath: 'D:\\project\\WeeCoder',
          baseBranch: 'main',
          targetBranch: 'feature/yolo-camera-monitor',
          executionMode: 'codex-local',
          verificationCommands: ['npm test'],
        },
      },
    );

    const updated = recordRepositoryInspectionForProject(project, {
      actor: 'Local Runner',
      inspection: {
        status: 'blocked',
        localPath: 'D:\\project\\WeeCoder',
        targetBranch: 'feature/yolo-camera-monitor',
        isGitRepository: false,
        canPrepareBranch: false,
        issues: ['本地路径不是 Git 仓库。'],
        recommendations: ['请选择真实业务代码仓库路径后重新诊断。'],
      },
    });

    expect(updated.repositoryInspection).toMatchObject({
      status: 'blocked',
      isGitRepository: false,
      canPrepareBranch: false,
    });
    expect(updated.health).toBe('at-risk');
    expect(updated.history[0]).toMatchObject({
      type: 'repository-inspected',
      actor: 'Local Runner',
    });
  });

  test('records branch preparation results on a project', () => {
    const project = recordRepositoryInspectionForProject(
      updateRepositoryConfigForProject(
        createProject({
          name: 'Branch Preparation',
          sponsor: 'Owner',
          summary: 'Prepare target branch before automatic development.',
        }),
        {
          actor: 'Tech Lead',
          config: {
            localPath: 'D:\\project\\business-repo',
            baseBranch: 'main',
            targetBranch: 'feature/yolo-camera-monitor',
            executionMode: 'codex-local',
            verificationCommands: ['npm test'],
          },
        },
      ),
      {
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
      },
    );

    const updated = recordBranchPreparationForProject(project, {
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
        recommendations: ['目标分支已准备好，可以启动自动开发。'],
      },
    });

    expect(updated.branchPreparation).toMatchObject({
      status: 'ready',
      currentBranch: 'feature/yolo-camera-monitor',
      createdBranch: true,
      canRunDevelopment: true,
    });
    expect(updated.history[0]).toMatchObject({
      type: 'branch-prepared',
      actor: 'Local Runner',
    });
  });

  test('generates an AI development execution package on a project', () => {
    const project = recordBranchPreparationForProject(
      recordRepositoryInspectionForProject(
        updateRepositoryConfigForProject(
          generateTechnicalHandoffForProject(
            generatePrdForProject(
              prepareReadyPrd(
                advanceConfirmed(
                  createProject({
                    name: 'Agent Package',
                    sponsor: 'Owner',
                    summary: 'Prepare a Codex-ready development package.',
                  }),
                  { actor: 'Owner' },
                ),
              ),
              { actor: 'PM' },
            ),
          ),
          {
            actor: 'Tech Lead',
            config: {
              localPath: 'D:\\project\\business-repo',
              baseBranch: 'main',
              targetBranch: 'feature/agent-package',
              executionMode: 'codex-local',
              verificationCommands: ['npm test'],
            },
          },
        ),
        {
          actor: 'Local Runner',
          inspection: {
            status: 'ready',
            localPath: 'D:\\project\\business-repo',
            gitRoot: 'D:\\project\\business-repo',
            currentBranch: 'main',
            targetBranch: 'feature/agent-package',
            isGitRepository: true,
            targetBranchExists: false,
            hasUncommittedChanges: false,
            changedFilesCount: 0,
            canPrepareBranch: true,
            issues: [],
            recommendations: [],
          },
        },
      ),
      {
        actor: 'Local Runner',
        preparation: {
          status: 'ready',
          localPath: 'D:\\project\\business-repo',
          previousBranch: 'main',
          currentBranch: 'feature/agent-package',
          baseBranch: 'main',
          targetBranch: 'feature/agent-package',
          targetBranchExisted: false,
          createdBranch: true,
          checkedOut: true,
          canRunDevelopment: true,
          issues: [],
          recommendations: [],
        },
      },
    );

    const updated = generateAgentExecutionPackageForProject(project, { actor: 'AI Dev Lead' });

    expect(updated.agentExecutionPackage).toMatchObject({
      status: 'ready',
      canStart: true,
    });
    expect(updated.agentExecutionPackage.instructions).toContain('feature/agent-package');
    expect(updated.history[0]).toMatchObject({
      type: 'agent-execution-package-generated',
      actor: 'AI Dev Lead',
    });
  });

  test('submits QA defect fix development checks to review and tracks retest gates', () => {
    const project = createQaFixDevelopmentProject();

    const updated = recordDevelopmentCheckResultsForProject(project, {
      actor: 'Local Runner',
      checks: [
        { command: 'npm test', status: 'passed', exitCode: 0 },
        { command: 'npm run build', status: 'passed', exitCode: 0 },
      ],
    });

    expect(updated.currentStageId).toBe(STAGE_IDS.REVIEW);
    expect(updated.stages.find((stage) => stage.id === STAGE_IDS.DEVELOPMENT)).toMatchObject({
      status: 'approved',
    });
    expect(updated.stages.find((stage) => stage.id === STAGE_IDS.REVIEW)).toMatchObject({
      status: 'active',
    });
    expect(updated.stages.find((stage) => stage.id === STAGE_IDS.QA)).toMatchObject({
      status: 'queued',
    });
    expect(updated.developmentRun.changePackage).toMatchObject({
      status: 'ready-for-review',
      commitHash: 'fix789',
      reviewGate: { canStartReview: true, blockers: [] },
    });
    expect(updated.defectFixPackage).toMatchObject({
      status: 'reviewing',
      repairSubmission: {
        status: 'reviewing',
        submittedBy: 'Local Runner',
        commitHash: 'fix789',
        sourceStageId: STAGE_IDS.DEVELOPMENT,
        targetStageId: STAGE_IDS.REVIEW,
        requiredGates: ['code-review', 'qa-retest'],
      },
    });
    expect(updated.history[0]).toMatchObject({
      type: 'qa-fix-submitted-for-review',
      from: STAGE_IDS.DEVELOPMENT,
      to: STAGE_IDS.REVIEW,
      actor: 'Local Runner',
    });
  });

  test('moves a reviewed QA defect fix into QA retest', () => {
    const project = createReviewedQaFixProject();

    const updated = recordCodeReviewForProject(project, {
      actor: 'Tech Lead',
      report: {
        status: 'passed',
        commitHash: 'fix789',
        summary: 'Repair review passed.',
        categories: [
          { id: 'code-quality', label: 'Code quality', status: 'passed', findings: [] },
        ],
        blockers: [],
      },
    });

    expect(updated.currentStageId).toBe(STAGE_IDS.QA);
    expect(updated.stages.find((stage) => stage.id === STAGE_IDS.REVIEW)).toMatchObject({
      status: 'approved',
    });
    expect(updated.stages.find((stage) => stage.id === STAGE_IDS.QA)).toMatchObject({
      status: 'active',
    });
    expect(updated.defectFixPackage).toMatchObject({
      status: 'qa-retest',
      repairSubmission: {
        status: 'qa-retest',
        reviewedBy: 'Tech Lead',
        commitHash: 'fix789',
        targetStageId: STAGE_IDS.QA,
      },
    });
    expect(updated.codeReviewReport.qaHandoff).toMatchObject({
      status: 'ready',
      commitHash: 'fix789',
    });
    expect(updated.history[0]).toMatchObject({
      type: 'code-review-finished',
      from: STAGE_IDS.REVIEW,
      to: STAGE_IDS.QA,
      actor: 'Tech Lead',
    });
  });

  test('closes the QA defect fix package after a passing retest', () => {
    const project = createQaRetestProject();

    const updated = recordQaRunForProject(project, {
      actor: 'QA',
      report: {
        status: 'passed',
        commitHash: 'fix789',
        summary: 'QA retest passed.',
        testCases: [
          { id: 'person-present', title: 'Person present alert', status: 'passed' },
          { id: 'rtsp-reconnect', title: 'RTSP reconnect', status: 'passed' },
        ],
        defects: [],
        blockers: [],
      },
    });

    expect(updated.defectFixPackage).toMatchObject({
      status: 'closed',
      repairSubmission: {
        status: 'closed',
        closedBy: 'QA',
        qaRetestCommitHash: 'fix789',
        qaRetestPassRate: '2/2',
      },
    });
    expect(updated.history[0]).toMatchObject({
      type: 'qa-run-finished',
      actor: 'QA',
    });
    expect(updated.artifacts[STAGE_IDS.DEFECT_LOOP]).toContain('closed');
  });
});

function prepareReadyPrd(project) {
  const answers = {
    users: '客户、客服专员、客服主管、系统管理员。',
    scenarios: '客户提交工单；客服分派、回复、关闭；主管查看超时工单。',
    successMetrics: '首次响应时间低于 10 分钟，工单关闭率达到 95%。',
    scope: '本期做 Web 后台和客户入口，不做移动 App，不做智能客服机器人。',
    data: '客户只能查看自己的工单，主管可查看团队数据，所有操作写入审计日志。',
    integrations: '对接订单系统、短信服务和企业微信通知。',
  };

  const answered = Object.entries(answers).reduce(
    (nextProject, [questionId, answer]) =>
      answerRequirementQuestion(nextProject, { questionId, answer, actor: 'PM' }),
    project,
  );
  const reviewed = applyRequirementReview(answered, { actor: 'PM' });
  return generatePrdForProject(reviewed, { actor: 'PM' });
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

function createQaFixDevelopmentProject() {
  const base = createProject({
    name: 'QA Fix Camera',
    sponsor: 'Owner',
    summary: 'Repair a QA-returned RTSP reconnect defect.',
  });
  return normalizeProject({
    ...base,
    currentStageId: STAGE_IDS.DEVELOPMENT,
    stages: base.stages.map((stage) => {
      if (stage.id === STAGE_IDS.DEVELOPMENT) {
        return { ...stage, status: 'active' };
      }
      if (stage.id === STAGE_IDS.REVIEW || stage.id === STAGE_IDS.QA) {
        return { ...stage, status: 'queued' };
      }
      return { ...stage, status: 'approved' };
    }),
    defectFixPackage: {
      status: 'ready',
      sourceStageId: STAGE_IDS.QA,
      targetStageId: STAGE_IDS.DEVELOPMENT,
      sourceCommitHash: 'c60351e',
      qaRunStatus: 'needs-work',
      qaPassRate: '1/2',
      reasons: ['Missing RTSP reconnect implementation.'],
      failingTestCases: [
        { id: 'rtsp-reconnect', title: 'RTSP reconnect', status: 'blocked' },
      ],
      requiredFixes: ['Missing RTSP reconnect implementation.'],
      regressionFocus: ['RTSP reconnect'],
    },
    developmentPlan: {
      status: 'running',
      summary: 'Repair QA blockers.',
      tasks: [
        {
          id: 'qa-fix-1',
          area: 'Defect fix',
          title: 'Fix RTSP reconnect',
          status: 'running',
          acceptanceCriteria: ['RTSP reconnect retest passes.'],
          verification: ['npm test', 'npm run build'],
        },
      ],
      verificationCommands: ['npm test', 'npm run build'],
    },
    developmentRun: {
      status: 'running',
      startedAt: '2026-06-17T00:00:00.000Z',
      summary: 'Repair implementation completed, waiting for checks.',
      commitHash: 'fix789',
      filesChanged: ['src/rtspConfig.js', 'test/rtspConfig.test.js'],
      taskResults: [
        {
          taskId: 'qa-fix-1',
          title: 'Fix RTSP reconnect',
          area: 'Defect fix',
          status: 'completed',
          result: 'Added reconnect logic and regression coverage.',
        },
      ],
      checks: [
        { command: 'npm test', status: 'not-run' },
        { command: 'npm run build', status: 'not-run' },
      ],
      blockers: [],
      nextActions: [],
    },
  });
}

function createReviewedQaFixProject() {
  const developmentProject = createQaFixDevelopmentProject();
  return normalizeProject({
    ...developmentProject,
    currentStageId: STAGE_IDS.REVIEW,
    stages: developmentProject.stages.map((stage) => {
      if (stage.id === STAGE_IDS.DEVELOPMENT) {
        return { ...stage, status: 'approved' };
      }
      if (stage.id === STAGE_IDS.REVIEW) {
        return { ...stage, status: 'active' };
      }
      if (stage.id === STAGE_IDS.QA) {
        return { ...stage, status: 'queued' };
      }
      return stage;
    }),
    defectFixPackage: {
      ...developmentProject.defectFixPackage,
      status: 'reviewing',
      repairSubmission: {
        status: 'reviewing',
        submittedAt: '2026-06-17T00:01:00.000Z',
        submittedBy: 'Local Runner',
        commitHash: 'fix789',
        sourceStageId: STAGE_IDS.DEVELOPMENT,
        targetStageId: STAGE_IDS.REVIEW,
        requiredGates: ['code-review', 'qa-retest'],
      },
    },
    developmentRun: {
      ...developmentProject.developmentRun,
      status: 'completed',
      completedAt: '2026-06-17T00:02:00.000Z',
      checks: [
        { command: 'npm test', status: 'passed', exitCode: 0 },
        { command: 'npm run build', status: 'passed', exitCode: 0 },
      ],
      changePackage: {
        status: 'ready-for-review',
        createdAt: '2026-06-17T00:02:00.000Z',
        summary: 'Repair change package is ready for review.',
        commitHash: 'fix789',
        filesChanged: ['src/rtspConfig.js', 'test/rtspConfig.test.js'],
        verification: { total: 2, passed: 2, failed: 0, blocked: 0 },
        reviewGate: { canStartReview: true, blockers: [] },
      },
    },
  });
}

function createQaRetestProject() {
  const reviewProject = createReviewedQaFixProject();
  return normalizeProject({
    ...reviewProject,
    currentStageId: STAGE_IDS.QA,
    stages: reviewProject.stages.map((stage) => {
      if (stage.id === STAGE_IDS.REVIEW) {
        return { ...stage, status: 'approved' };
      }
      if (stage.id === STAGE_IDS.QA) {
        return { ...stage, status: 'active' };
      }
      return stage;
    }),
    defectFixPackage: {
      ...reviewProject.defectFixPackage,
      status: 'qa-retest',
      repairSubmission: {
        ...reviewProject.defectFixPackage.repairSubmission,
        status: 'qa-retest',
        reviewedAt: '2026-06-17T00:03:00.000Z',
        reviewedBy: 'Tech Lead',
        targetStageId: STAGE_IDS.QA,
      },
    },
    codeReviewReport: {
      status: 'passed',
      commitHash: 'fix789',
      qaHandoff: {
        status: 'ready',
        commitHash: 'fix789',
        focusAreas: ['RTSP reconnect'],
        requiredEvidence: ['QA retest record'],
        blockers: [],
      },
    },
  });
}
