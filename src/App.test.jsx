import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import App, { formatHistoryEventNote, historyTypeLabel } from './App.jsx';

const questions = [
  {
    id: 'users',
    label: '目标用户',
    prompt: '谁会使用这个系统？',
    placeholder: '客户、客服、管理员',
  },
  {
    id: 'scenarios',
    label: '核心场景',
    prompt: '本期必须支持哪些业务场景？',
    placeholder: '提交工单、分派工单',
  },
];

const stages = [
  {
    id: 'intake',
    name: '项目入口',
    owner: '负责人',
    status: 'approved',
    description: '创建项目。',
    checklist: ['填写项目名称'],
  },
  {
    id: 'pm-requirements',
    name: '项目经理需求',
    owner: '项目经理',
    status: 'active',
    description: '逐轮澄清需求。',
    checklist: ['识别用户角色', '定义验收标准'],
  },
  {
    id: 'prd-approval',
    name: '需求文档审批',
    owner: '负责人',
    status: 'queued',
    description: '负责人审批 PRD。',
    checklist: ['确认范围边界'],
  },
];

const projectSummary = {
  id: 'demo-1',
  name: '客户门户',
  sponsor: '业务负责人',
  summary: '客户自助查询与工单入口',
  health: 'on-track',
  currentStageId: 'pm-requirements',
  currentStageName: '项目经理需求',
  currentOwner: '项目经理',
  prdStatus: 'draft',
  openFollowupTaskCount: 2,
  followupTaskTargetRoleLabels: ['项目经理'],
  followupTaskAssigneeNames: ['林项目经理'],
  followupTaskAssignments: [
    {
      targetRole: 'pm',
      targetRoleLabel: '项目经理',
      assigneeUserId: 'pm-lin',
      assigneeName: '林项目经理',
      openTaskCount: 2,
      tasks: [
        {
          id: 'pm-requirements-target-users',
          stageId: 'pm-requirements',
          itemId: 'target-users',
          title: '追问：目标用户与核心场景',
          status: 'open',
        },
        {
          id: 'pm-requirements-success-metrics',
          stageId: 'pm-requirements',
          itemId: 'success-metrics',
          title: '追问：成功指标与验收口径',
          status: 'open',
        },
      ],
    },
  ],
  stageProgress: 1,
  totalStages: 3,
  updatedAt: '2026-06-16T00:00:00.000Z',
};

const appUsers = [
  { id: 'owner-aa', name: 'AA', role: 'owner', roleLabel: '负责人', actor: '负责人' },
  { id: 'pm-lin', name: '林项目经理', role: 'pm', roleLabel: '项目经理', actor: '项目经理' },
  { id: 'tech-chen', name: '陈技术负责人', role: 'tech-lead', roleLabel: '技术负责人', actor: '技术负责人' },
  { id: 'tech-li', name: '李技术负责人', role: 'tech-lead', roleLabel: '技术负责人', actor: '李技术负责人' },
  { id: 'ops-wang', name: '王运维', role: 'ops', roleLabel: '运维', actor: '运维' },
  { id: 'ai-dev-bot', name: 'AI 开发', role: 'ai-dev', roleLabel: 'AI 开发', actor: 'AI 开发' },
  { id: 'runner-local', name: '本地执行器', role: 'local-runner', roleLabel: '本地执行器', actor: 'Local Runner' },
  { id: 'qa-zhao', name: '赵测试', role: 'qa', roleLabel: '测试', actor: '测试' },
];

const baseProject = {
  ...projectSummary,
  prdApprovalReady: false,
  businessSkills: [
    { id: 'requirement-clarification', name: '需求澄清 Skill', stageId: 'pm-requirements', owner: '项目经理' },
    { id: 'requirement-quality-review', name: '需求完整性评审 Skill', stageId: 'pm-requirements', owner: 'AI 项目助理' },
    { id: 'prd-draft-generation', name: '需求文档草稿生成 Skill', stageId: 'pm-requirements', owner: 'AI 产品助理' },
    { id: 'prd-approval-gate', name: '需求文档审批门禁 Skill', stageId: 'prd-approval', owner: '负责人' },
  ],
  requirementQuestions: questions,
  requirementAnswers: {
    users: '客户、客服专员、客服主管。',
    scenarios: '客户提交工单，客服处理并关闭工单。',
  },
  requirementReview: null,
  stages,
  artifacts: {
    'pm-requirements': '# 需求文档草稿\n客户、客服专员、客服主管。',
  },
  risks: ['真实自动开发尚未接入。'],
  history: [],
  members: {
    owner: 'owner-aa',
    pm: 'pm-lin',
    'tech-lead': 'tech-chen',
    ops: 'ops-wang',
    'ai-dev': 'ai-dev-bot',
    'local-runner': 'runner-local',
    qa: 'qa-zhao',
  },
};

const readyReview = {
  status: 'ready',
  score: 94,
  completedCount: 2,
  totalCount: 2,
  missingQuestionIds: [],
  missingQuestions: [],
  blockers: [],
  warnings: [],
  recommendations: ['可以生成需求文档草稿并提交负责人审批。'],
  provider: 'codex-cli',
};

const platformCockpit = {
  session: {
    authMode: 'demo',
    allowUserSwitching: true,
    currentOrganization: {
      id: 'wee-coder-labs',
      name: 'WeeCoder Labs',
      plan: 'Team',
      status: 'active',
    },
    availableOrganizations: [
      { id: 'wee-coder-labs', name: 'WeeCoder Labs', plan: 'Team', status: 'active' },
      { id: 'acme-security-pilot', name: '安防试点组织', plan: 'Pilot', status: 'active' },
    ],
  },
  tenancy: {
    currentOrganizationId: 'wee-coder-labs',
    currentOrganizationName: 'WeeCoder Labs',
    plan: 'Team',
    status: 'active',
    activeUserCount: 8,
    visibleProjectCount: 1,
    atRiskProjectCount: 0,
    roleMatrix: [
      { userId: 'owner-aa', name: 'AA', role: 'owner', roleLabel: '负责人' },
      { userId: 'pm-lin', name: '林项目经理', role: 'pm', roleLabel: '项目经理' },
    ],
  },
  database: {
    persistenceMode: 'json-store',
    targetEngine: 'postgresql',
    status: 'migration-planned',
    readinessScore: 42,
    tables: [
      { name: 'organizations', description: '组织、套餐、租户状态' },
      { name: 'projects', description: '项目主数据、阶段状态和租户归属' },
      { name: 'agent_jobs', description: 'AI coding、Review、QA 后台任务' },
    ],
    migrationPlan: {
      id: 'json-to-postgresql-v1',
      sourceMode: 'json-store',
      targetEngine: 'postgresql',
      status: 'schema-ready',
      phaseCount: 4,
      readyPhaseCount: 2,
      phases: [
        {
          id: 'schema-baseline',
          title: 'Schema baseline',
          status: 'ready',
          targetTables: ['organizations', 'users', 'projects'],
        },
        {
          id: 'workflow-extraction',
          title: 'Workflow state extraction',
          status: 'ready',
          targetTables: ['workflow_events', 'audit_logs'],
        },
        {
          id: 'cutover',
          title: 'Cutover and rollback controls',
          status: 'blocked',
          targetTables: ['notifications'],
        },
      ],
      cutoverChecks: [
        { id: 'backup-json-store', title: 'Back up data/projects.json before first migration.', required: true },
        { id: 'tenant-count-reconciliation', title: 'Compare JSON and database tenant counts.', required: true },
      ],
    },
    gaps: ['当前数据仍写入本地 JSON 文件，缺少事务、迁移、备份和并发写保护。'],
  },
  aiOperations: {
    queue: {
      totalJobs: 3,
      queuedCount: 0,
      runningCount: 1,
      failedCount: 1,
      succeededCount: 1,
    },
    jobs: [
      {
        id: 'demo-ai-development',
        projectName: '客户门户',
        type: 'ai-development',
        title: 'AI 开发执行',
        status: 'running',
      },
    ],
    sandbox: {
      mode: 'local-runner',
      isolation: 'planned-sandbox',
      allowedCommands: ['npm test', 'npm run build'],
      gaps: ['尚未接入容器沙箱、资源限额和命令白名单执行器。'],
    },
  },
  deployment: {
    environments: [
      { id: 'local', name: '本地开发', status: 'ready', version: 'commercial-skeleton-v0.2' },
      { id: 'staging', name: '预发环境', status: 'planned', version: '' },
      { id: 'production', name: '生产环境', status: 'blocked', version: '' },
    ],
    releaseGates: [
      { id: 'database', title: '正式数据库', status: 'blocked' },
      { id: 'queue', title: '后台任务队列', status: 'blocked' },
    ],
  },
  governance: {
    auditLog: [
      {
        id: 'audit-1',
        projectName: '客户门户',
        type: 'development-executed',
        actor: 'AI 开发',
        note: '完成基础实现。',
        at: '2026-06-17T00:00:00.000Z',
      },
    ],
    notifications: {
      channels: [
        { id: 'in-app', name: '站内通知', status: 'ready' },
        { id: 'feishu', name: '飞书', status: 'config-needed' },
      ],
      pendingItems: 2,
    },
    sla: {
      breachedCount: 1,
      blockedFollowupCount: 2,
    },
    commandCenter: {
      totalBlockers: 2,
      followupProjectCount: 1,
      failedJobCount: 1,
      highSeverityCount: 1,
      blockers: [
        {
          id: 'followup-demo-1',
          type: 'followup',
          severity: 'high',
          projectId: 'demo-1',
          projectName: '客户门户',
          stageName: '项目经理需求',
          title: '2 个阶段确认事项未补齐',
          detail: '卡在 项目经理：林项目经理',
          nextAction: '请 林项目经理 补齐项目经理需求信息。',
          openTaskCount: 2,
        },
        {
          id: 'failed-job-demo-1',
          type: 'failed-job',
          severity: 'high',
          projectId: 'demo-1',
          projectName: '客户门户',
          title: '后台任务失败：QA 自动测试',
          detail: 'local-rule 返回 needs-work',
          nextAction: '由技术负责人查看任务日志并重新进入测试。',
        },
      ],
    },
    cost: {
      currency: 'CNY',
      totalEstimatedCny: 8.25,
      aiEstimatedCny: 6,
      runnerEstimatedCny: 1.5,
      waitingEstimatedCny: 0.75,
    },
  },
};

describe('App', () => {
  beforeEach(() => {
    window.localStorage.setItem(
      'wee-coder-session',
      JSON.stringify({
        token: 'test-token',
        user: appUsers[0],
        authMode: 'demo',
        allowUserSwitching: true,
      }),
    );
    global.fetch = vi.fn(async (url, options = {}) => {
      if (url === '/api/users' && !options.method) {
        return jsonResponse({ users: appUsers, currentUser: appUsers[0] });
      }
      if (url === '/api/platform' && !options.method) {
        return jsonResponse({ platform: platformCockpit });
      }
      if (url === '/api/projects' && !options.method) {
        return jsonResponse({ projects: [projectSummary] });
      }
      if (url === '/api/projects/demo-1' && !options.method) {
        return jsonResponse({ project: baseProject });
      }
      if (url === '/api/projects' && options.method === 'POST') {
        return jsonResponse(
          {
            project: {
              ...baseProject,
              id: 'created-1',
              name: '新项目',
              sponsor: '负责人',
              summary: '新业务需求',
            },
          },
          201,
        );
      }
      if (url === '/api/projects/demo-1/requirements' && options.method === 'POST') {
        return jsonResponse({
          project: {
            ...baseProject,
            requirementAnswers: {
              ...baseProject.requirementAnswers,
              users: '客户、客服、主管、管理员。',
            },
          },
        });
      }
      if (url === '/api/projects/demo-1/review-requirements' && options.method === 'POST') {
        return jsonResponse({
          project: {
            ...baseProject,
            requirementReview: readyReview,
            prdApprovalReady: false,
          },
        });
      }
      if (url === '/api/projects/demo-1/generate-prd' && options.method === 'POST') {
        return jsonResponse({
          project: {
            ...baseProject,
            prdStatus: 'generated',
            prdProvider: 'codex-cli',
            requirementReview: readyReview,
            prdApprovalReady: true,
            artifacts: {
              'pm-requirements': '# PRD: 客户门户\n客户、客服专员、客服主管。',
              'prd-approval': '# PRD: 客户门户\n客户、客服专员、客服主管。',
            },
          },
        });
      }
      if (url === '/api/projects/demo-1/advance' && options.method === 'POST') {
        return jsonResponse({
          project: {
            ...baseProject,
            currentStageId: 'prd-approval',
            prdStatus: 'generated',
            requirementReview: readyReview,
            prdApprovalReady: true,
            stages: [
              { ...stages[0] },
              { ...stages[1], status: 'approved' },
              { ...stages[2], status: 'active' },
            ],
          },
        });
      }
      return jsonResponse({ error: 'not found' }, 404);
    });
  });

  afterEach(() => {
    window.localStorage.clear();
    window.history.pushState({}, '', '/');
    vi.restoreAllMocks();
  });

  test('renders the role-aware control console shell', async () => {
    render(<App />);

    expect(await screen.findByLabelText('主导航')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '我的工作台' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(screen.getByRole('button', { name: '运营后台' })).toBeInTheDocument();
    expect(screen.getByLabelText('顶部命令栏')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '打开账户菜单' })).toBeInTheDocument();
    expect(screen.getByLabelText('主导航').closest('.control-shell')).toHaveAttribute(
      'data-layout',
      'hybrid',
    );
  });

  test('keeps the role inbox in the task destination', async () => {
    render(<App />);

    expect(await screen.findByLabelText('负责人工作台')).toBeInTheDocument();
    expect(screen.queryByText('角色收件箱')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '任务队列' }));

    expect(await screen.findByText('角色收件箱')).toBeInTheDocument();
  });

  test('uses a role-adaptive default workspace', async () => {
    render(<App />);

    expect(await screen.findByLabelText('负责人工作台')).toBeInTheDocument();
    expect(screen.queryByLabelText('商业化运营后台')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '打开账户菜单' }));
    fireEvent.change(screen.getByLabelText('当前用户'), {
      target: { value: 'ops-wang' },
    });

    expect(await screen.findByLabelText('个人工作台')).toBeInTheDocument();
    expect(screen.queryByLabelText('负责人工作台')).not.toBeInTheDocument();
  });

  test('opens the searchable project center and creates projects on demand', async () => {
    render(<App />);

    fireEvent.click(await screen.findByRole('button', { name: '项目中心' }));

    expect(await screen.findByLabelText('项目中心')).toBeInTheDocument();
    expect(screen.queryByText('Project portfolio')).not.toBeInTheDocument();
    const projectFocus = screen.getByLabelText('项目组合焦点');
    expect(screen.queryByLabelText('项目筛选摘要')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('项目组合一屏摘要')).not.toBeInTheDocument();
    expect(within(projectFocus).getByText('当前重点')).toBeInTheDocument();
    expect(within(projectFocus).getByText('客户门户')).toBeInTheDocument();
    expect(within(projectFocus).getByText('补齐：追问：目标用户与核心场景')).toBeInTheDocument();
    expect(within(projectFocus).getByText('显示 1 / 1')).toBeInTheDocument();
    expect(within(projectFocus).getByText('风险 0')).toBeInTheDocument();
    expect(within(projectFocus).getByText('待办 2')).toBeInTheDocument();
    expect(within(projectFocus).getByText('平均 33%')).toBeInTheDocument();
    expect(screen.queryByLabelText('项目组合明细')).not.toBeInTheDocument();
    const projectWorkbench = screen.getByLabelText('项目组合工作台');
    const projectProcessingDetails = within(projectWorkbench).getByLabelText('项目处理详情');
    expect(projectProcessingDetails.tagName).toBe('DETAILS');
    expect(projectProcessingDetails).not.toHaveAttribute('open');
    expect(within(projectProcessingDetails).getByText('项目处理详情')).toBeVisible();
    const projectSummary = within(projectProcessingDetails).getByLabelText('项目处理摘要');
    expect(within(projectSummary).getByText('项目处理摘要')).not.toBeVisible();
    expect(within(projectSummary).getByText('当前阶段')).not.toBeVisible();
    expect(within(projectSummary).getByText('项目经理需求')).not.toBeVisible();
    fireEvent.click(within(projectProcessingDetails).getByText('项目处理详情'));
    expect(projectProcessingDetails).toHaveAttribute('open');
    expect(within(projectSummary).getByText('项目处理摘要')).toBeVisible();
    expect(within(projectSummary).getByText('当前阶段')).toBeVisible();
    expect(within(projectSummary).getByText('项目经理需求')).toBeVisible();
    expect(within(projectSummary).getByText('负责人')).toBeVisible();
    expect(within(projectSummary).getByText('项目经理')).toBeVisible();
    const projectTable = screen.getByRole('table', { name: '项目组合紧凑表格' });
    expect(within(projectTable).getByText('客户门户')).toBeInTheDocument();
    expect(within(projectTable).queryByText('客户自助查询与工单入口')).not.toBeInTheDocument();
    expect(within(projectTable).getByText('下一步')).toBeInTheDocument();
    expect(within(projectTable).getByText('补齐：追问：目标用户与核心场景')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('搜索项目名称、负责人或阶段')).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: '新建项目' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '新建项目' }));
    expect(screen.getByRole('dialog', { name: '新建项目' })).toBeInTheDocument();
  });

  test('opens the focused project workspace from the project processing summary action', async () => {
    render(<App />);

    fireEvent.click(await screen.findByRole('button', { name: '项目中心' }));
    const projectWorkbench = await screen.findByLabelText('项目组合工作台');
    const projectProcessingDetails = within(projectWorkbench).getByLabelText('项目处理详情');

    fireEvent.click(within(projectProcessingDetails).getByText('项目处理详情'));
    fireEvent.click(within(projectProcessingDetails).getByRole('button', { name: '打开项目工作台' }));

    expect(await screen.findByLabelText('项目工作区')).toBeInTheDocument();
    expect(screen.getByLabelText('当前业务阶段工作台')).toBeInTheDocument();
  });

  test('opens a focused project workspace from delivery navigation', async () => {
    render(<App />);

    fireEvent.click(await screen.findByRole('button', { name: '交付控制' }));

    const workspace = await screen.findByLabelText('项目工作区');
    expect(workspace).toBeInTheDocument();
    const deliveryFocus = within(workspace).getByLabelText('项目状态条');
    expect(within(workspace).queryByLabelText('项目处理焦点')).not.toBeInTheDocument();
    expect(within(workspace).queryByLabelText('交付阶段')).not.toBeInTheDocument();
    const deliveryStageSummary = within(deliveryFocus).getByLabelText('当前阶段摘要');
    const deliveryNextSummary = within(deliveryFocus).getByLabelText('下一步动作摘要');
    expect(within(deliveryFocus).getByText('进度 33%')).toBeInTheDocument();
    expect(within(deliveryStageSummary).getByText('项目经理需求')).toBeInTheDocument();
    expect(within(deliveryNextSummary).getByText('下一步动作')).toBeInTheDocument();
    expect(within(deliveryFocus).queryByText('需求文档草稿')).not.toBeInTheDocument();
    expect(within(deliveryFocus).queryByLabelText('概览关键指标')).not.toBeInTheDocument();
    expect(within(workspace).queryByLabelText('项目概览状态条')).not.toBeInTheDocument();
    expect(within(workspace).queryByLabelText('项目交付总览')).not.toBeInTheDocument();

    fireEvent.click(within(workspace).getByRole('tab', { name: '需求文档' }));
    await waitFor(() => {
      expect(within(workspace).getByRole('tab', { name: '需求文档' })).toHaveAttribute(
        'aria-selected',
        'true',
      );
    });

    const actionBar = within(workspace).getByLabelText('项目状态条');
    const currentStageSummary = within(actionBar).getByLabelText('当前阶段摘要');
    expect(within(currentStageSummary).getByText('当前阶段')).toBeInTheDocument();
    expect(within(currentStageSummary).getByText('项目经理需求')).toBeInTheDocument();
    expect(within(currentStageSummary).getByText('进行中 · 项目经理')).toBeInTheDocument();
    expect(within(actionBar).getByText('确认缺项 2')).toBeInTheDocument();
    expect(within(actionBar).queryByLabelText('当前阶段指标')).not.toBeInTheDocument();
    expect(within(actionBar).queryByText('检查项 2')).not.toBeInTheDocument();
    expect(within(actionBar).queryByText('阻塞待办 2')).not.toBeInTheDocument();
    expect(within(workspace).queryByLabelText('当前阶段行动条')).not.toBeInTheDocument();
    expect(within(workspace).queryByLabelText('阶段详情抽屉')).not.toBeInTheDocument();
    expect(within(workspace).queryByLabelText('阶段指挥条')).not.toBeInTheDocument();
    expect(within(workspace).queryByLabelText('阶段上下文')).not.toBeInTheDocument();
    expect(within(workspace).queryByLabelText('阶段交付详情')).not.toBeInTheDocument();
    fireEvent.click(within(actionBar).getByRole('button', { name: '查看阶段详情' }));
    const stageDeliveryDetail = await within(workspace).findByLabelText('阶段交付详情');
    expect(within(stageDeliveryDetail).getByText('当前查看：项目经理需求')).toBeInTheDocument();
    expect(within(stageDeliveryDetail).getByText('负责人：项目经理')).toBeInTheDocument();
    expect(within(stageDeliveryDetail).getByText('检查项 2')).toBeInTheDocument();
    expect(within(stageDeliveryDetail).getByText('确认缺项')).toBeInTheDocument();
    expect(within(stageDeliveryDetail).getByText('2')).toBeInTheDocument();
    expect(
      within(stageDeliveryDetail).getByText('优先补齐当前阶段确认事项，再进入下一闸口。'),
    ).toBeInTheDocument();
    expect(within(workspace).queryByLabelText('阶段焦点摘要')).not.toBeInTheDocument();
    const deliveryWorkspaceBody = within(workspace).getByLabelText('交付工作区主体');
    expect(within(deliveryWorkspaceBody).queryByLabelText('项目交付驾驶舱')).not.toBeInTheDocument();
    expect(within(deliveryWorkspaceBody).queryByText('项目交付驾驶舱')).not.toBeInTheDocument();
    const actionColumn = within(deliveryWorkspaceBody).getByLabelText('当前动作列');
    expect(within(actionColumn).queryByText('当前动作')).not.toBeInTheDocument();
    expect(within(deliveryWorkspaceBody).queryByLabelText('流程导航列')).not.toBeInTheDocument();
    expect(within(deliveryWorkspaceBody).queryByLabelText('证据与风险列')).not.toBeInTheDocument();
    const auxiliaryPanels = within(deliveryWorkspaceBody).getByLabelText('辅助信息面板');
    expect(within(auxiliaryPanels).queryByLabelText('流程导航面板')).not.toBeInTheDocument();
    expect(within(auxiliaryPanels).queryByLabelText('证据风险面板')).not.toBeInTheDocument();
    expect(
      within(auxiliaryPanels).queryByText('流程和证据默认收起，先聚焦当前动作。'),
    ).not.toBeInTheDocument();
    const auxiliaryDrawer = within(auxiliaryPanels).getByLabelText('辅助信息抽屉');
    expect(auxiliaryDrawer.tagName).toBe('DETAILS');
    expect(auxiliaryDrawer).not.toHaveAttribute('open');
    expect(within(auxiliaryDrawer).getByText('辅助信息')).toBeVisible();
    expect(within(deliveryWorkspaceBody).queryByLabelText('交付详情面板')).not.toBeInTheDocument();
    expect(within(auxiliaryPanels).queryByLabelText('流程导航面板')).not.toBeInTheDocument();
    expect(within(auxiliaryPanels).queryByLabelText('证据风险面板')).not.toBeInTheDocument();
    fireEvent.click(within(auxiliaryDrawer).getByText('辅助信息'));
    expect(auxiliaryDrawer).toHaveAttribute('open');
    expect(within(auxiliaryDrawer).getByLabelText('交付详情面板')).toBeInTheDocument();
    expect(within(auxiliaryDrawer).getByLabelText('流程导航面板')).not.toHaveAttribute('open');
    expect(within(auxiliaryDrawer).getByLabelText('证据风险面板')).not.toHaveAttribute('open');
    fireEvent.click(within(auxiliaryPanels).getByText('流程导航'));
    const flowColumn = within(deliveryWorkspaceBody).getByLabelText('流程导航列');
    fireEvent.click(within(auxiliaryPanels).getByText('证据与风险'));
    const evidenceColumn = within(deliveryWorkspaceBody).getByLabelText('证据与风险列');
    expect(within(flowColumn).getByText('只放阶段和分区入口，避免主区被导航信息挤占。')).toBeInTheDocument();
    expect(within(actionColumn).queryByText('当前任务、角色判断和处理入口集中在这里。')).not.toBeInTheDocument();
    expect(within(evidenceColumn).getByText('产物、风险、流转记录默认速览，按需展开核验。')).toBeInTheDocument();
    const sectionGuide = within(deliveryWorkspaceBody).getByLabelText('交付分区导览');
    expect(within(sectionGuide).getByText('分区导览')).toBeInTheDocument();
    expect(within(sectionGuide).getByText('当前展开：暂无展开分区')).toBeInTheDocument();
    expect(within(sectionGuide).getByRole('button', { name: '当前任务 已收起 项目经理' })).toBeInTheDocument();
    expect(within(sectionGuide).getByRole('button', { name: '阶段产物 已收起 待生成' })).toBeInTheDocument();
    expect(within(sectionGuide).getByRole('button', { name: '风险不足 已收起 0 风险 / 0 不足' })).toBeInTheDocument();
    const mainTaskConsole = within(deliveryWorkspaceBody).getByLabelText('主任务控制台');
    expect(within(mainTaskConsole).queryByLabelText('交付一屏摘要')).not.toBeInTheDocument();
    expect(within(mainTaskConsole).queryByLabelText('阶段进度条')).not.toBeInTheDocument();
    expect(within(actionColumn).queryByLabelText('角色视角摘要')).not.toBeInTheDocument();
    const mainWorkArea = within(mainTaskConsole).getByLabelText('阶段主工作区');
    const contextRail = within(evidenceColumn).getByLabelText('交付上下文栏');
    expect(screen.queryByLabelText('风险不足区')).not.toBeInTheDocument();
    const deliveryDetailPanel = within(deliveryWorkspaceBody).getByLabelText('交付详情面板');
    expect(deliveryDetailPanel.tagName).toBe('DETAILS');
    expect(deliveryDetailPanel).not.toHaveAttribute('open');
    expect(within(deliveryDetailPanel).getByText('交付详情')).toBeVisible();
    expect(within(deliveryWorkspaceBody).queryByLabelText('交付一屏摘要')).not.toBeInTheDocument();
    expect(within(deliveryWorkspaceBody).queryByLabelText('阶段进度条')).not.toBeInTheDocument();
    fireEvent.click(within(deliveryDetailPanel).getByText('交付详情'));
    expect(deliveryDetailPanel).toHaveAttribute('open');
    const workspaceSnapshot = within(deliveryDetailPanel).getByLabelText('交付一屏摘要');
    expect(within(workspaceSnapshot).getByText('当前处理焦点')).toBeInTheDocument();
    expect(within(workspaceSnapshot).getAllByText('项目经理需求')).toHaveLength(2);
    expect(
      within(workspaceSnapshot).getByText('优先补齐当前阶段确认事项，再进入下一闸口。'),
    ).toBeInTheDocument();
    const verificationStrip = within(workspaceSnapshot).getByLabelText('交付核验条');
    expect(within(verificationStrip).getByText('当前任务')).toBeInTheDocument();
    expect(within(verificationStrip).getByText('阶段产物')).toBeInTheDocument();
    expect(within(verificationStrip).getByText('需求文档草稿')).toBeInTheDocument();
    expect(within(verificationStrip).getByText('来源：待生成')).toBeInTheDocument();
    expect(within(verificationStrip).getByText('风险不足')).toBeInTheDocument();
    expect(within(verificationStrip).getByText('1 风险 / 0 不足')).toBeInTheDocument();
    expect(within(verificationStrip).getByText('流转记录')).toBeInTheDocument();
    expect(within(verificationStrip).getByText('0 条记录')).toBeInTheDocument();
    expect(within(workspaceSnapshot).queryByLabelText('一屏摘要-当前任务')).not.toBeInTheDocument();
    expect(within(workspaceSnapshot).queryByLabelText('一屏摘要-阶段产物')).not.toBeInTheDocument();
    const snapshotDetail = within(workspaceSnapshot).getByLabelText('完整交付摘要');
    expect(snapshotDetail.tagName).toBe('DETAILS');
    expect(snapshotDetail).not.toHaveAttribute('open');
    expect(within(snapshotDetail).getByText('完整交付摘要')).toBeVisible();
    fireEvent.click(within(snapshotDetail).getByText('完整交付摘要'));
    expect(snapshotDetail).toHaveAttribute('open');
    const taskDigest = within(snapshotDetail).getByLabelText('一屏摘要-当前任务');
    expect(within(taskDigest).getByText('当前任务')).toBeInTheDocument();
    expect(within(taskDigest).getByText('项目经理需求')).toBeInTheDocument();
    expect(within(taskDigest).getByText('负责人：项目经理')).toBeInTheDocument();
    expect(within(taskDigest).getByText('确认缺项 2')).toBeInTheDocument();
    const artifactDigest = within(snapshotDetail).getByLabelText('一屏摘要-阶段产物');
    expect(within(artifactDigest).getByText('阶段产物')).toBeInTheDocument();
    expect(within(artifactDigest).getByText('需求文档草稿')).toBeInTheDocument();
    expect(within(artifactDigest).getByText('来源：待生成')).toBeInTheDocument();
    const riskDigest = within(snapshotDetail).getByLabelText('一屏摘要-风险不足');
    expect(within(riskDigest).getByText('风险不足')).toBeInTheDocument();
    expect(within(riskDigest).getByText('1')).toBeInTheDocument();
    expect(within(riskDigest).getByText('1 风险 / 0 不足')).toBeInTheDocument();
    const historyDigest = within(snapshotDetail).getByLabelText('一屏摘要-流转记录');
    expect(within(historyDigest).getByText('流转记录')).toBeInTheDocument();
    expect(within(historyDigest).getByText('0')).toBeInTheDocument();
    expect(within(historyDigest).getByText('0 条记录')).toBeInTheDocument();
    expect(within(deliveryWorkspaceBody).queryByLabelText('主操作摘要')).not.toBeInTheDocument();
    expect(within(deliveryWorkspaceBody).queryByLabelText('证据与风险摘要')).not.toBeInTheDocument();
    const snapshotTaskButton = within(workspaceSnapshot).getByRole('button', {
      name: '展开当前任务详情',
    });
    expect(
      snapshotTaskButton,
    ).toBeInTheDocument();
    expect(within(workspace).queryByLabelText('阶段行动中心')).not.toBeInTheDocument();
    expect(within(mainWorkArea).queryByLabelText('当前任务区')).not.toBeInTheDocument();
    const taskPreview = within(mainWorkArea).getByLabelText('当前任务速览');
    expect(within(taskPreview).getByText('任务处理卡')).toBeInTheDocument();
    expect(within(mainWorkArea).queryByText('项目经理需求 · 项目经理')).not.toBeInTheDocument();
    expect(within(taskPreview).getByRole('button', { name: '展开当前任务' })).toBeInTheDocument();
    expect(within(taskPreview).getByText('当前角色：负责人')).toBeInTheDocument();
    expect(within(taskPreview).getByText('负责人可查看全部阶段、阻塞和验收状态。')).toBeInTheDocument();
    expect(within(taskPreview).getByText('项目经理需求')).toBeInTheDocument();
    expect(within(taskPreview).getByText('负责人：项目经理 · 状态 进行中')).toBeInTheDocument();
    expect(within(taskPreview).getByText('检查项 2')).toBeInTheDocument();
    expect(within(taskPreview).getByText('确认缺项 2')).toBeInTheDocument();
    expect(within(taskPreview).getByText('待办 2')).toBeInTheDocument();
    expect(within(taskPreview).getByText('风险不足 0')).toBeInTheDocument();
    fireEvent.click(snapshotTaskButton);
    const currentTaskArea = within(mainWorkArea).getByLabelText('当前任务区');
    expect(currentTaskArea).toBeInTheDocument();
    const taskDetail = within(currentTaskArea).getByLabelText('任务处理详情');
    expect(taskDetail.tagName).toBe('DETAILS');
    expect(taskDetail).not.toHaveAttribute('open');
    expect(within(taskDetail).getByText('任务处理详情')).toBeVisible();
    const supportDetails = within(taskDetail).getByLabelText('团队与清单详情');
    expect(supportDetails).not.toBeVisible();
    expect(supportDetails).not.toHaveAttribute('open');
    expect(within(supportDetails).getByText('项目成员')).not.toBeVisible();
    expect(within(supportDetails).getByText('识别用户角色')).not.toBeVisible();
    expect(within(taskDetail).getByLabelText('需求处理中心')).not.toBeVisible();
    const executionPanel = within(currentTaskArea).getByLabelText('阶段执行确认区');
    expect(executionPanel.tagName).toBe('DETAILS');
    expect(executionPanel).not.toHaveAttribute('open');
    expect(within(executionPanel).getByText('执行确认')).toBeVisible();
    expect(within(currentTaskArea).getByRole('button', { name: '提交需求文档审批' })).toBeInTheDocument();
    expect(within(currentTaskArea).queryByLabelText('处理意见')).not.toBeInTheDocument();
    expect(within(currentTaskArea).queryByRole('button', { name: '驳回当前阶段' })).not.toBeInTheDocument();
    fireEvent.click(within(executionPanel).getByText('执行确认'));
    expect(executionPanel).toHaveAttribute('open');
    expect(within(currentTaskArea).getByLabelText('处理意见')).toBeVisible();
    expect(within(currentTaskArea).getByRole('button', { name: '驳回当前阶段' })).toBeVisible();
    fireEvent.click(within(taskDetail).getByText('任务处理详情'));
    expect(taskDetail).toHaveAttribute('open');
    expect(within(taskDetail).getByLabelText('需求处理中心')).toBeVisible();
    fireEvent.click(within(supportDetails).getByText('团队与清单'));
    expect(supportDetails).toHaveAttribute('open');
    expect(within(supportDetails).getByText('项目成员')).toBeVisible();
    expect(within(supportDetails).getByText('识别用户角色')).toBeVisible();
    const contextStatusPanel = within(contextRail).getByLabelText('交付状态面板');
    expect(within(contextStatusPanel).getByText('交付状态面板')).toBeInTheDocument();
    expect(within(contextStatusPanel).getByText('4 个分区')).toBeInTheDocument();
    expect(within(contextStatusPanel).getByRole('button', { name: '当前任务 已展开 项目经理' })).toBeInTheDocument();
    expect(within(contextStatusPanel).getByRole('button', { name: '阶段产物 已收起 待生成' })).toBeInTheDocument();
    expect(within(contextStatusPanel).getByRole('button', { name: '风险不足 已收起 0 风险 / 0 不足' })).toBeInTheDocument();
    expect(document.querySelector('.delivery-section-overview')).not.toBeInTheDocument();
    expect(document.querySelector('.dashboard-grid')).not.toBeInTheDocument();
    const compactStageFlow = within(deliveryDetailPanel).getByLabelText('阶段进度条');
    expect(within(compactStageFlow).getByText('阶段流转')).toBeInTheDocument();
    expect(within(compactStageFlow).getByText('当前：项目经理需求')).toBeInTheDocument();
    expect(within(compactStageFlow).getByText('2/3')).toBeInTheDocument();
    expect(within(compactStageFlow).getByText('3 个阶段')).toBeInTheDocument();
    const stageFlowDetail = within(deliveryDetailPanel).getByLabelText('阶段流程详情');
    expect(stageFlowDetail.tagName).toBe('DETAILS');
    expect(stageFlowDetail).not.toHaveAttribute('open');
    expect(within(stageFlowDetail).getByText('完整阶段列表')).toBeVisible();
    expect(within(stageFlowDetail).queryByLabelText('阶段按钮列表')).not.toBeInTheDocument();
    fireEvent.click(within(stageFlowDetail).getByText('完整阶段列表'));
    expect(stageFlowDetail).toHaveAttribute('open');
    expect(within(stageFlowDetail).getByLabelText('阶段按钮列表')).toBeInTheDocument();
    expect(screen.queryByLabelText('交付阶段')).not.toBeInTheDocument();
    const topStageTrack = within(actionBar).getByLabelText('阶段轨道');
    expect(topStageTrack).not.toHaveAttribute('open');
    expect(within(topStageTrack).getByText('当前 2/3')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: '概览' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: '需求文档' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: '需求文档' }));

    expect(screen.queryByLabelText('阶段产物区')).not.toBeInTheDocument();
    const artifactPreview = screen.getByLabelText('阶段产物速览');
    expect(within(artifactPreview).getByText('阶段产物速览')).toBeInTheDocument();
    expect(within(artifactPreview).getByText('需求文档草稿')).toBeInTheDocument();
    expect(within(artifactPreview).getByText('章节 1')).toBeInTheDocument();
    expect(within(artifactPreview).getByText('清单 0')).toBeInTheDocument();
    expect(within(artifactPreview).getByText('项目经理需求 · 来源：待生成')).toBeInTheDocument();
    fireEvent.click(within(sectionGuide).getByRole('button', { name: '阶段产物 已收起 待生成' }));
    expect(screen.getByLabelText('阶段产物区')).toBeInTheDocument();
    expect(within(contextStatusPanel).getByRole('button', { name: '阶段产物 已展开 待生成' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '阶段产物：项目经理需求' })).toBeInTheDocument();
    const artifactSummary = screen.getByLabelText('阶段产物摘要');
    expect(within(artifactSummary).getByText('产物摘要')).toBeInTheDocument();
    expect(within(artifactSummary).getByText('标题：需求文档草稿')).toBeInTheDocument();
    expect(within(artifactSummary).getByText('章节 1')).toBeInTheDocument();
    expect(within(artifactSummary).getByText('清单 0')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '展开阶段产物原文' })).toBeInTheDocument();
    expect(document.querySelector('.artifact-document')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '展开阶段产物原文' }));
    expect(document.querySelector('.artifact-document')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '收起阶段产物原文' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: '风险与记录' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: '动态' }));

    const compactRiskPreview = screen.getByLabelText('风险优先摘要');
    expect(within(compactRiskPreview).getAllByText('风险优先摘要').length).toBeGreaterThan(0);
    expect(within(compactRiskPreview).getByText('项目风险 1')).toBeInTheDocument();
    expect(within(compactRiskPreview).getByText('真实自动开发尚未接入。')).toBeInTheDocument();
    expect(screen.queryByLabelText('风险不足区')).not.toBeInTheDocument();
    const historyPreview = screen.getByLabelText('流转记录速览');
    expect(within(historyPreview).getByText('流转记录速览')).toBeInTheDocument();
    expect(within(historyPreview).getByText('记录 0')).toBeInTheDocument();
    expect(within(historyPreview).getByText('暂无流转记录')).toBeInTheDocument();
    expect(within(historyPreview).getByText('当前项目还没有阶段流转事件。')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '展开风险不足' }));
    expect(screen.getByLabelText('风险不足区')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '风险不足' })).toBeInTheDocument();
    expect(screen.queryByLabelText('流转记录区')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '展开流转记录' }));
    expect(screen.getByLabelText('流转记录区')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '流转记录' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: '阶段产物：项目经理需求' })).not.toBeInTheDocument();
  });

  test('keeps current risks and history records collapsed inside expanded evidence sections', async () => {
    const compactProject = {
      ...baseProject,
      risks: ['真实自动开发尚未接入。', 'RTSP 断流重连未验证。'],
      history: [
        {
          actor: '测试',
          at: '2026-06-17T03:00:00.000Z',
          note: '测试发现 RTSP 断流恢复失败。',
          type: 'qa-run-finished',
        },
        {
          actor: 'AI 开发',
          at: '2026-06-17T02:00:00.000Z',
          note: '完成 YOLO 监控页面基础实现。',
          type: 'development-run-created',
        },
      ],
    };

    global.fetch = vi.fn(async (url, options = {}) => {
      if (url === '/api/users' && !options.method) {
        return jsonResponse({ users: appUsers, currentUser: appUsers[0] });
      }
      if (url === '/api/platform' && !options.method) {
        return jsonResponse({ platform: platformCockpit });
      }
      if (url === '/api/projects' && !options.method) {
        return jsonResponse({ projects: [projectSummary] });
      }
      if (url === '/api/projects/demo-1' && !options.method) {
        return jsonResponse({ project: compactProject });
      }
      return jsonResponse({ error: 'not found' }, 404);
    });

    render(<App />);
    const workspace = await openDeliveryConsole();
    const deliveryWorkspaceBody = within(workspace).getByLabelText('交付工作区主体');
    const auxiliaryPanels = within(deliveryWorkspaceBody).getByLabelText('辅助信息面板');
    fireEvent.click(within(auxiliaryPanels).getByText('辅助信息'));
    fireEvent.click(within(auxiliaryPanels).getByText('证据与风险'));
    fireEvent.click(screen.getByRole('tab', { name: '动态' }));

    fireEvent.click(screen.getByRole('button', { name: '展开风险不足' }));
    const riskPanel = screen.getByLabelText('风险不足区');
    const currentRiskSummary = within(riskPanel).getByLabelText('当前风险摘要');
    expect(within(currentRiskSummary).getByText('风险 2')).toBeInTheDocument();
    expect(within(currentRiskSummary).getByText('真实自动开发尚未接入。')).toBeInTheDocument();
    const currentRiskDetails = within(riskPanel).getByLabelText('当前风险明细');
    expect(currentRiskDetails.tagName).toBe('DETAILS');
    expect(currentRiskDetails).not.toHaveAttribute('open');
    expect(within(currentRiskDetails).getByText('当前风险明细')).toBeVisible();
    expect(within(currentRiskDetails).getByText('RTSP 断流重连未验证。')).not.toBeVisible();
    fireEvent.click(within(currentRiskDetails).getByText('当前风险明细'));
    expect(currentRiskDetails).toHaveAttribute('open');
    expect(within(currentRiskDetails).getByText('RTSP 断流重连未验证。')).toBeVisible();

    fireEvent.click(screen.getByRole('button', { name: '展开流转记录' }));
    const historyPanel = screen.getByLabelText('流转记录区');
    const historySummary = within(historyPanel).getByLabelText('流转记录摘要');
    expect(within(historySummary).getByText('记录 2')).toBeInTheDocument();
    expect(within(historySummary).getByText('测试 · 测试发现 RTSP 断流恢复失败。')).toBeInTheDocument();
    const historyDetails = within(historyPanel).getByLabelText('流转记录明细');
    expect(historyDetails.tagName).toBe('DETAILS');
    expect(historyDetails).not.toHaveAttribute('open');
    expect(within(historyDetails).getByText('流转记录明细')).toBeVisible();
    expect(within(historyDetails).getByText('完成 YOLO 监控页面基础实现。')).not.toBeVisible();
    fireEvent.click(within(historyDetails).getByText('流转记录明细'));
    expect(historyDetails).toHaveAttribute('open');
    expect(within(historyDetails).getByText('完成 YOLO 监控页面基础实现。')).toBeVisible();
  });

  test('keeps the delivery overview compact and moves detailed columns to workflow tabs', async () => {
    render(<App />);

    fireEvent.click(await screen.findByRole('button', { name: '交付控制' }));

    const workspace = await screen.findByLabelText('项目工作区');
    await waitFor(() => {
      expect(within(workspace).getByRole('tab', { name: '需求文档' })).toHaveAttribute(
        'aria-selected',
        'true',
      );
    });
    fireEvent.click(within(workspace).getByRole('tab', { name: '概览' }));
    let compactOverview;
    await waitFor(() => {
      compactOverview = within(workspace).getByLabelText('交付概览驾驶舱');
      expect(compactOverview).toBeInTheDocument();
    });
    expect(compactOverview).toBeInTheDocument();
    expect(within(compactOverview).getByText('下一步动作')).toBeInTheDocument();
    expect(within(compactOverview).getAllByText('交付证据').length).toBeGreaterThan(0);
    expect(within(compactOverview).getByText('风险与记录')).toBeInTheDocument();
    expect(within(workspace).queryByLabelText('流程导航列')).not.toBeInTheDocument();
    expect(within(workspace).queryByLabelText('当前动作列')).not.toBeInTheDocument();
    expect(within(workspace).queryByLabelText('证据与风险列')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: '需求文档' }));

    expect(within(workspace).queryByLabelText('交付概览驾驶舱')).not.toBeInTheDocument();
    expect(within(workspace).getByLabelText('当前动作列')).toBeInTheDocument();
    expect(within(workspace).queryByLabelText('流程导航列')).not.toBeInTheDocument();
    expect(within(workspace).queryByLabelText('证据与风险列')).not.toBeInTheDocument();
    expect(within(workspace).getByLabelText('辅助信息面板')).toBeInTheDocument();
  });

  test('shows a focused project view summary below the workspace tabs', async () => {
    render(<App />);

    fireEvent.click(await screen.findByRole('button', { name: '交付控制' }));

    const workspace = await screen.findByLabelText('项目工作区');
    await waitFor(() => {
      expect(within(workspace).getByRole('tab', { name: '需求文档' })).toHaveAttribute(
        'aria-selected',
        'true',
      );
    });
    const focusPanel = within(workspace).getByLabelText('项目状态条');
    const viewSummary = within(focusPanel).getByLabelText('视图说明');
    expect(viewSummary.tagName).toBe('DETAILS');
    expect(viewSummary).not.toHaveAttribute('open');
    expect(within(viewSummary).getByText('当前视图：需求文档')).toBeInTheDocument();
    expect(within(viewSummary).getByText('展开视图说明')).toBeInTheDocument();
    expect(within(viewSummary).queryByText('聚焦需求确认、需求文档草稿和缺项追问。')).not.toBeInTheDocument();
    expect(within(viewSummary).queryByText('看项目状态、下一步动作和风险证据摘要。')).not.toBeInTheDocument();
    expect(within(viewSummary).queryByText('关联阶段：项目经理需求')).not.toBeInTheDocument();
    fireEvent.click(within(viewSummary).getByText('展开视图说明'));
    expect(viewSummary).toHaveAttribute('open');
    expect(within(viewSummary).getByText('聚焦需求确认、需求文档草稿和缺项追问。')).toBeInTheDocument();
    expect(within(viewSummary).getByText('关联阶段：项目经理需求')).toBeInTheDocument();
    fireEvent.click(within(viewSummary).getByText('收起视图说明'));

    fireEvent.click(within(workspace).getByRole('tab', { name: '概览' }));

    expect(viewSummary).not.toHaveAttribute('open');
    expect(within(viewSummary).getByText('当前视图：概览')).toBeInTheDocument();
    expect(within(viewSummary).queryByText('看项目状态、下一步动作和风险证据摘要。')).not.toBeInTheDocument();
    fireEvent.click(within(viewSummary).getByText('展开视图说明'));
    expect(within(viewSummary).getByText('看项目状态、下一步动作和风险证据摘要。')).toBeVisible();
    expect(within(workspace).queryByLabelText('项目视图摘要')).not.toBeInTheDocument();
  });

  test('shows a compact role task strip on the delivery overview', async () => {
    render(<App />);

    fireEvent.click(await screen.findByRole('button', { name: '交付控制' }));

    const workspace = await screen.findByLabelText('项目工作区');
    await waitFor(() => {
      expect(within(workspace).getByRole('tab', { name: '需求文档' })).toHaveAttribute(
        'aria-selected',
        'true',
      );
    });
    fireEvent.click(within(workspace).getByRole('tab', { name: '概览' }));
    let compactOverview;
    await waitFor(() => {
      compactOverview = within(workspace).getByLabelText('交付概览驾驶舱');
      expect(compactOverview).toBeInTheDocument();
    });

    const roleDigest = within(compactOverview).getByLabelText('角色任务速览');
    expect(roleDigest.tagName).toBe('DETAILS');
    expect(roleDigest).not.toHaveAttribute('open');
    expect(within(roleDigest).getByText('角色速览')).toBeVisible();
    expect(within(roleDigest).queryByText('当前角色')).not.toBeInTheDocument();
    fireEvent.click(within(roleDigest).getByText('角色速览'));
    expect(roleDigest).toHaveAttribute('open');
    expect(within(roleDigest).getByText('当前角色')).toBeInTheDocument();
    expect(within(compactOverview).getByRole('button', { name: '进入当前阶段处理' })).toBeInTheDocument();
    expect(within(workspace).queryByLabelText('流程导航列')).not.toBeInTheDocument();
  });

  test('does not render guided demo mode when the demo query is present', async () => {
    window.history.pushState({}, '', '/?demo=1');

    render(<App />);

    expect(await screen.findByLabelText('负责人工作台')).toBeInTheDocument();
    expect(screen.queryByLabelText('演示说明文档')).not.toBeInTheDocument();
    expect(screen.queryByText('可重复演示模式')).not.toBeInTheDocument();
  });

  test('localizes artifact provider and markdown status text', async () => {
    const localizedProject = {
      ...baseProject,
      prdProvider: 'manual-prd',
      artifacts: {
        'pm-requirements':
          '# 需求文档草稿\n- medium：本地 RTSP 测试流 + YOLO mock 推理服务。\n- JSON schema 和 SAST 待补齐。',
      },
    };
    global.fetch = vi.fn(async (url, options = {}) => {
      if (url === '/api/users' && !options.method) {
        return jsonResponse({ users: appUsers, currentUser: appUsers[0] });
      }
      if (url === '/api/platform' && !options.method) {
        return jsonResponse({ platform: platformCockpit });
      }
      if (url === '/api/projects' && !options.method) {
        return jsonResponse({ projects: [projectSummary] });
      }
      if (url === '/api/projects/demo-1' && !options.method) {
        return jsonResponse({ project: localizedProject });
      }
      return jsonResponse({ error: 'not found' }, 404);
    });

    render(<App />);
    await openDeliveryConsole();

    fireEvent.click(screen.getByRole('tab', { name: '需求文档' }));
    const auxiliaryPanels = screen.getByLabelText('辅助信息面板');
    fireEvent.click(within(auxiliaryPanels).getByText('辅助信息'));
    fireEvent.click(within(auxiliaryPanels).getByText('证据与风险'));

    expect(screen.getAllByText('人工需求文档').length).toBeGreaterThan(0);
    expect(screen.queryByText('manual-prd')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '展开阶段产物' }));
    fireEvent.click(screen.getByRole('button', { name: '展开阶段产物原文' }));
    const artifactDocument = document.querySelector('.artifact-document');
    expect(artifactDocument).not.toBeNull();
    expect(artifactDocument).toHaveTextContent('中：本地 RTSP 测试流 + YOLO 模拟推理服务。');
    expect(artifactDocument).toHaveTextContent('检测结果结构约定和静态安全扫描待补齐。');
    expect(artifactDocument).not.toHaveTextContent('medium');
    expect(artifactDocument).not.toHaveTextContent('mock');
  });

  test('separates operations from the owner workspace', async () => {
    render(<App />);

    expect(await screen.findByLabelText('负责人工作台')).toBeInTheDocument();
    expect(screen.queryByLabelText('商业化运营后台')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '运营后台' }));

    expect(await screen.findByLabelText('运营控制台')).toBeInTheDocument();
    expect(screen.queryByLabelText('项目列表')).not.toBeInTheDocument();
    expect(screen.getByRole('tab', { name: '后台任务' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: '部署与发布' })).toBeInTheDocument();
    expect(screen.getByTestId('operations-content')).toHaveAttribute('data-view', 'overview');
    const operationsFocus = screen.getByLabelText('运营态势焦点');
    expect(within(operationsFocus).getByText('当前视图：运行总览')).toBeInTheDocument();
    expect(within(operationsFocus).getByText('聚焦组织、任务、发布、安全和费用的全局风险。')).toBeInTheDocument();
    expect(within(operationsFocus).getByText('6 个运营视角')).toBeInTheDocument();
    expect(screen.queryByLabelText('运营视图摘要')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: '后台任务' }));

    expect(screen.getByTestId('operations-content')).toHaveAttribute('data-view', 'jobs');
    expect(screen.getByLabelText('后台任务运行摘要')).toBeInTheDocument();
    expect(within(operationsFocus).getByText('当前视图：后台任务')).toBeInTheDocument();
    expect(within(operationsFocus).getByText('查看 AI coding 队列、执行证据和失败重试。')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: '部署与发布' }));

    expect(screen.getByTestId('operations-content')).toHaveAttribute(
      'data-view',
      'deployments',
    );
    expect(screen.getByLabelText('发布门禁摘要')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: '审计与 SLA' }));

    expect(screen.getByTestId('operations-content')).toHaveAttribute('data-view', 'audit');
    expect(screen.getByLabelText('审计响应摘要')).toBeInTheDocument();
  });

  test('keeps platform job list collapsed behind a task focus summary', async () => {
    render(<App />);
    await openOperationsConsole();

    fireEvent.click(screen.getByRole('tab', { name: '后台任务' }));

    const queueCard = (await screen.findByText('后台任务队列')).closest('article');
    const jobFocus = within(queueCard).getByLabelText('后台任务处理焦点');
    expect(within(jobFocus).getByText('AI 开发执行 · 运行中')).toBeVisible();
    expect(within(jobFocus).getByText('项目 客户门户 · 执行器 待分配')).toBeVisible();

    const jobDetails = within(queueCard).getByLabelText('后台任务明细');
    expect(jobDetails.tagName).toBe('DETAILS');
    expect(jobDetails).not.toHaveAttribute('open');
    expect(within(jobDetails).getByText('展开后台任务明细')).toBeVisible();
    expect(within(jobDetails).getByText('AI 开发执行 · 运行中')).not.toBeVisible();

    fireEvent.click(within(jobDetails).getByText('展开后台任务明细'));
    expect(jobDetails).toHaveAttribute('open');
    expect(within(jobDetails).getByText('AI 开发执行 · 运行中')).toBeVisible();
  });

  test('requires login and loads the workspace after successful authentication', async () => {
    window.localStorage.removeItem('wee-coder-session');
    global.fetch = vi.fn(async (url, options = {}) => {
      if (url === '/api/users' && !options.method) {
        return jsonResponse({ users: appUsers, currentUser: appUsers[0] });
      }
      if (url === '/api/auth/login' && options.method === 'POST') {
        expect(JSON.parse(options.body)).toMatchObject({
          userId: 'pm-lin',
          password: 'demo123',
        });
        return jsonResponse({
          token: 'session-token',
          session: {
            currentUser: appUsers[1],
            currentOrganization: {
              id: 'wee-coder-labs',
              name: 'WeeCoder Labs',
              plan: 'Team',
              status: 'active',
            },
            availableOrganizations: [
              {
                id: 'wee-coder-labs',
                name: 'WeeCoder Labs',
                plan: 'Team',
                status: 'active',
              },
            ],
          },
        });
      }
      if (url === '/api/platform' && !options.method) {
        expect(options.headers.Authorization).toBe('Bearer session-token');
        return jsonResponse({ platform: platformCockpit });
      }
      if (url === '/api/projects' && !options.method) {
        expect(options.headers.Authorization).toBe('Bearer session-token');
        return jsonResponse({ projects: [projectSummary] });
      }
      if (url === '/api/projects/demo-1' && !options.method) {
        expect(options.headers.Authorization).toBe('Bearer session-token');
        return jsonResponse({ project: baseProject });
      }
      return jsonResponse({ error: 'not found' }, 404);
    });

    render(<App />);

    expect(await screen.findByText('登录 WeeCoder')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('登录账号'), {
      target: { value: 'pm-lin' },
    });
    fireEvent.change(screen.getByLabelText('密码'), {
      target: { value: 'demo123' },
    });
    fireEvent.click(screen.getByRole('button', { name: '登录' }));

    expect(await screen.findByLabelText('个人工作台')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '运营后台' })).not.toBeInTheDocument();
    expect(JSON.parse(window.localStorage.getItem('wee-coder-session'))).toMatchObject({
      token: 'session-token',
      user: { id: 'pm-lin' },
    });
  });

  test('locks the account identity when the platform session disables user switching', async () => {
    window.localStorage.setItem(
      'wee-coder-session',
      JSON.stringify({ token: 'strict-token', user: appUsers[0], allowUserSwitching: true }),
    );
    const strictPlatform = {
      ...platformCockpit,
      session: {
        ...platformCockpit.session,
        authMode: 'strict',
        allowUserSwitching: false,
      },
    };
    global.fetch = vi.fn(async (url, options = {}) => {
      if (url === '/api/users' && !options.method) {
        return jsonResponse({ users: appUsers, currentUser: appUsers[0] });
      }
      if (url === '/api/platform' && !options.method) {
        expect(options.headers).toMatchObject({
          Authorization: 'Bearer strict-token',
          'X-Organization-Id': 'wee-coder-labs',
        });
        expect(options.headers?.['X-User-Id']).toBeUndefined();
        return jsonResponse({ platform: strictPlatform });
      }
      if (url === '/api/projects' && !options.method) {
        expect(options.headers).toMatchObject({
          Authorization: 'Bearer strict-token',
          'X-Organization-Id': 'wee-coder-labs',
        });
        expect(options.headers?.['X-User-Id']).toBeUndefined();
        return jsonResponse({ projects: [projectSummary] });
      }
      if (url === '/api/me/tasks' && !options.method) {
        expect(options.headers).toMatchObject({
          Authorization: 'Bearer strict-token',
          'X-Organization-Id': 'wee-coder-labs',
        });
        expect(options.headers?.['X-User-Id']).toBeUndefined();
        return jsonResponse({
          currentUser: appUsers[0],
          organization: { id: 'wee-coder-labs', name: 'WeeCoder Labs' },
          openTaskCount: 0,
          projectCount: 0,
          tasks: [],
        });
      }
      if (url === '/api/projects/demo-1' && !options.method) {
        expect(options.headers).toMatchObject({
          Authorization: 'Bearer strict-token',
          'X-Organization-Id': 'wee-coder-labs',
        });
        expect(options.headers?.['X-User-Id']).toBeUndefined();
        return jsonResponse({ project: baseProject });
      }
      return jsonResponse({ error: 'not found' }, 404);
    });

    render(<App />);

    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith('/api/projects/demo-1', expect.anything()),
    );
    const accountBadge = screen.getByText('当前账号').closest('.account-badge');
    expect(accountBadge).toBeTruthy();
    expect(screen.queryByLabelText('当前用户')).not.toBeInTheDocument();
    expect(within(accountBadge).getByText('AA')).toBeInTheDocument();
  });

  test('shows the authenticated session permission summary', async () => {
    window.localStorage.setItem(
      'wee-coder-session',
      JSON.stringify({
        token: 'pm-token',
        user: appUsers[1],
        authMode: 'strict',
        allowUserSwitching: false,
      }),
    );
    const strictPlatform = {
      ...platformCockpit,
      session: {
        ...platformCockpit.session,
        authMode: 'strict',
        allowUserSwitching: false,
        currentUser: appUsers[1],
        organizationRole: 'pm',
        organizationRoleLabel: '项目经理',
        permissions: {
          manageOrganization: false,
          manageBilling: false,
          manageSecurity: false,
          runDelivery: true,
          viewAudit: false,
          viewCost: false,
        },
      },
    };
    global.fetch = vi.fn(async (url, options = {}) => {
      if (url === '/api/users' && !options.method) {
        return jsonResponse({ users: appUsers, currentUser: appUsers[1] });
      }
      if (url === '/api/platform' && !options.method) {
        return jsonResponse({ platform: strictPlatform });
      }
      if (url === '/api/projects' && !options.method) {
        return jsonResponse({ projects: [projectSummary] });
      }
      if (url === '/api/me/tasks' && !options.method) {
        return jsonResponse({
          currentUser: appUsers[1],
          organization: { id: 'wee-coder-labs', name: 'WeeCoder Labs' },
          openTaskCount: 0,
          projectCount: 0,
          tasks: [],
        });
      }
      if (url === '/api/projects/demo-1' && !options.method) {
        return jsonResponse({ project: baseProject });
      }
      return jsonResponse({ error: 'not found' }, 404);
    });

    render(<App />);

    const sessionSummary = await screen.findByLabelText('会话权限摘要');
    expect(within(sessionSummary).getByText('WeeCoder Labs · 团队版')).toBeInTheDocument();
    expect(within(sessionSummary).getByText('组织角色：项目经理')).toBeInTheDocument();
    expect(within(sessionSummary).getByText('账号模式：严格登录')).toBeInTheDocument();
    expect(within(sessionSummary).getByText('可访问组织：2')).toBeInTheDocument();
    expect(within(sessionSummary).getByText('模拟切换：关闭')).toBeInTheDocument();
    expect(within(sessionSummary).getByText('可用权限：交付执行')).toBeInTheDocument();
  });

  test('clears an expired stored session and returns to login', async () => {
    window.localStorage.setItem(
      'wee-coder-session',
      JSON.stringify({
        token: 'expired-token',
        user: appUsers[0],
        authMode: 'strict',
        allowUserSwitching: false,
      }),
    );
    global.fetch = vi.fn(async (url, options = {}) => {
      if (url === '/api/users' && !options.method) {
        return jsonResponse({ users: appUsers, currentUser: appUsers[0] });
      }
      if (url === '/api/projects' && !options.method) {
        expect(options.headers).toMatchObject({
          Authorization: 'Bearer expired-token',
          'X-Organization-Id': 'wee-coder-labs',
        });
        return jsonResponse({ error: '登录状态已失效，请重新登录。' }, 401);
      }
      return jsonResponse({ error: 'not found' }, 404);
    });

    render(<App />);

    expect(await screen.findByText('登录 WeeCoder')).toBeInTheDocument();
    expect(window.localStorage.getItem('wee-coder-session')).toBeNull();
    expect(screen.getByText('登录状态已失效，请重新登录。')).toBeInTheDocument();
  });

  test('shows a regular API error without clearing the active session', async () => {
    window.localStorage.setItem(
      'wee-coder-session',
      JSON.stringify({
        token: 'strict-token',
        user: appUsers[1],
        authMode: 'strict',
        allowUserSwitching: false,
      }),
    );
    global.fetch = vi.fn(async (url, options = {}) => {
      if (url === '/api/users' && !options.method) {
        return jsonResponse({ users: appUsers, currentUser: appUsers[1] });
      }
      if (url === '/api/projects' && !options.method) {
        return jsonResponse({ error: '项目服务暂时不可用。' }, 500);
      }
      return jsonResponse({ error: 'not found' }, 404);
    });

    render(<App />);

    expect(await screen.findByText('项目服务暂时不可用。')).toBeInTheDocument();
    expect(JSON.parse(window.localStorage.getItem('wee-coder-session'))).toMatchObject({
      token: 'strict-token',
      user: { id: 'pm-lin' },
    });
  });

  test('shows a structured permission alert when a write action is forbidden', async () => {
    window.localStorage.setItem(
      'wee-coder-session',
      JSON.stringify({
        token: 'strict-token',
        user: appUsers[0],
        authMode: 'strict',
        allowUserSwitching: false,
      }),
    );
    const strictPlatform = {
      ...platformCockpit,
      session: {
        ...platformCockpit.session,
        authMode: 'strict',
        allowUserSwitching: false,
      },
    };
    global.fetch = vi.fn(async (url, options = {}) => {
      if (url === '/api/users' && !options.method) {
        return jsonResponse({ users: appUsers, currentUser: appUsers[0] });
      }
      if (url === '/api/platform' && !options.method) {
        return jsonResponse({ platform: strictPlatform });
      }
      if (url === '/api/projects' && !options.method) {
        return jsonResponse({ projects: [projectSummary] });
      }
      if (url === '/api/me/tasks' && !options.method) {
        return jsonResponse({
          currentUser: appUsers[0],
          organization: { id: 'wee-coder-labs', name: 'WeeCoder Labs' },
          openTaskCount: 0,
          projectCount: 0,
          tasks: [],
        });
      }
      if (url === '/api/projects/demo-1' && !options.method) {
        return jsonResponse({ project: baseProject });
      }
      if (url === '/api/projects' && options.method === 'POST') {
        return jsonResponse(
          {
            error: '当前用户不是该项目的项目经理成员。',
            details: {
              actionId: 'answer-requirement',
              role: 'pm',
              roleLabel: '项目经理',
              user: { id: 'owner-aa', name: 'AA', role: 'owner' },
              membership: {
                role: 'pm',
                userId: 'owner-aa',
                assignedUserId: 'pm-lin',
              },
            },
          },
          403,
        );
      }
      return jsonResponse({ error: 'not found' }, 404);
    });

    render(<App />);
    await openOperationsConsole();

    await screen.findByText('商业化运营后台');
    fireEvent.change(screen.getByPlaceholderText('例如：客户门户升级'), {
      target: { value: '权限测试项目' },
    });
    fireEvent.change(screen.getByPlaceholderText('例如：业务负责人'), {
      target: { value: 'AA' },
    });
    fireEvent.change(screen.getByPlaceholderText('说明业务目标、当前痛点和期望结果'), {
      target: { value: '验证无权限写操作的反馈。' },
    });
    fireEvent.click(screen.getByRole('button', { name: '创建项目' }));

    const alert = await screen.findByLabelText('权限提示');
    expect(within(alert).getByText('权限不足')).toBeInTheDocument();
    expect(within(alert).getByText('当前用户不是该项目的项目经理成员。')).toBeInTheDocument();
    expect(within(alert).getByText('操作：answer-requirement')).toBeInTheDocument();
    expect(within(alert).getByText('当前账号：AA · owner')).toBeInTheDocument();
    expect(within(alert).getByText('指派成员：pm-lin')).toBeInTheDocument();
  });

  test('shows the formal stage gate report for the selected project', async () => {
    const gateProject = {
      ...baseProject,
      stageGateReport: {
        stageId: 'pm-requirements',
        stageName: 'PM requirements',
        stageOwner: 'PM',
        status: 'blocked',
        canAdvance: false,
        nextStageId: 'prd-approval',
        nextStageName: 'PRD approval',
        openTaskCount: 2,
        blockerCount: 2,
        blockers: [
          {
            id: 'stage-confirmations',
            title: 'Current-stage confirmations are incomplete',
            requiredAction: 'Complete 2 current-stage confirmation task(s).',
          },
          {
            id: 'prd-approval-readiness',
            title: 'PRD is not ready for approval',
            requiredAction: 'Run requirement quality review and generate the PRD draft.',
          },
        ],
        requiredActions: [
          'Complete 2 current-stage confirmation task(s).',
          'Run requirement quality review and generate the PRD draft.',
        ],
      },
      deliveryGateAudit: {
        status: 'qa-return',
        completionPercent: 60,
        completedGateCount: 6,
        totalGateCount: 10,
        blockedGateCount: 1,
        missingGateCount: 3,
        currentGateId: 'qa',
        roleHandoffSummary: {
          totalRoleCount: 5,
          blockedRoleCount: 1,
          missingRoleCount: 2,
          completedRoleCount: 2,
          currentRole: 'qa',
          currentRoleLabel: '测试',
          currentGateId: 'qa',
          currentGateLabel: '测试验证',
        },
        roleHandoffs: [
          {
            role: 'owner',
            roleLabel: '负责人',
            status: 'missing',
            gateCount: 3,
            completedGateCount: 1,
            blockedGateCount: 0,
            missingGateCount: 2,
            currentGateId: 'acceptance',
            currentGateLabel: '最终验收包',
            gateIds: ['prd', 'acceptance', 'signoff'],
            nextAction: '负责人补齐最终验收包证据：尚未生成最终验收包。',
          },
          {
            role: 'qa',
            roleLabel: '测试',
            status: 'blocked',
            gateCount: 2,
            completedGateCount: 0,
            blockedGateCount: 1,
            missingGateCount: 1,
            currentGateId: 'qa',
            currentGateLabel: '测试验证',
            gateIds: ['qa-evidence', 'qa'],
            nextAction: '测试先处理测试验证阻塞：QA 判定存在实现缺口，需要回流开发。',
          },
        ],
        currentGateLabel: '测试验证',
        nextAction: '将 QA 缺陷回流到开发，并重新生成修复计划。',
        gates: [
          { id: 'requirements', label: '需求确认', status: 'complete' },
          { id: 'prd', label: '需求文档', status: 'complete' },
          { id: 'qa-evidence', label: '测试证据', status: 'missing' },
          { id: 'qa', label: '测试验证', status: 'blocked' },
        ],
      },
      responsibilityMatrix: {
        status: 'blocked',
        currentStageId: 'pm-requirements',
        currentStageName: '项目经理需求',
        currentRole: 'pm',
        currentRoleLabel: '项目经理',
        currentAssigneeUserId: 'pm-lin',
        currentAssigneeName: '林项目经理',
        currentOpenTaskCount: 5,
        currentBlockerCount: 2,
        totalStageCount: 10,
        activeStageCount: 1,
        blockedStageCount: 1,
        completedStageCount: 1,
        nextAction: '项目经理需要处理项目经理需求的 5 个待办，并解除 2 个闸口阻塞。',
        rows: [
          {
            stageId: 'intake',
            stageName: '项目入口',
            role: 'owner',
            roleLabel: '负责人',
            assigneeName: 'AA',
            status: 'complete',
            gateStatus: 'completed',
            openTaskCount: 0,
            blockerCount: 0,
          },
          {
            stageId: 'pm-requirements',
            stageName: '项目经理需求',
            role: 'pm',
            roleLabel: '项目经理',
            assigneeName: '林项目经理',
            status: 'blocked',
            gateStatus: 'blocked',
            openTaskCount: 5,
            blockerCount: 2,
            isCurrent: true,
          },
          {
            stageId: 'development',
            stageName: '自动开发',
            role: 'ai-dev',
            roleLabel: 'AI 开发',
            assigneeName: 'AI 开发',
            status: 'queued',
            gateStatus: 'queued',
            openTaskCount: 0,
            blockerCount: 0,
          },
        ],
      },
      projectExecutionAudit: {
        projectId: 'demo-1',
        projectName: 'yolo 摄像头监控项目',
        status: 'blocked',
        totalExecutionCount: 3,
        platformJobCount: 2,
        workflowExecutionCount: 1,
        succeededCount: 1,
        failedCount: 1,
        runningCount: 1,
        queuedCount: 0,
        evidenceGapCount: 1,
        sandboxPolicyCount: 2,
        remediation: {
          totalActionCount: 2,
          retryCount: 1,
          reclaimCount: 0,
          startCount: 0,
          evidenceCount: 1,
          escalateCount: 0,
          primaryAction: {
            id: 'retry-job-qa-fix',
            action: 'retry',
            jobId: 'job-qa-fix',
            rowId: 'job-qa-fix',
            title: 'QA 修复执行',
            label: '重试任务',
            severity: 'high',
            reason: 'RTSP reconnect failed.',
            nextAction: '修复 QA 修复执行 的阻塞后重试任务。',
          },
          actions: [
            {
              id: 'retry-job-qa-fix',
              action: 'retry',
              jobId: 'job-qa-fix',
              rowId: 'job-qa-fix',
              title: 'QA 修复执行',
              label: '重试任务',
              severity: 'high',
              reason: 'RTSP reconnect failed.',
              nextAction: '修复 QA 修复执行 的阻塞后重试任务。',
            },
            {
              id: 'evidence-qa-run',
              action: 'collect-evidence',
              rowId: 'qa-run',
              title: '测试验证执行',
              label: '补齐证据',
              severity: 'warning',
              reason: '缺少 qaEvidence。',
              missingEvidence: ['qaEvidence'],
              nextAction: '补齐测试验证执行的执行证据。',
            },
          ],
        },
        executionTimeline: {
          totalRunCount: 1,
          totalEventCount: 3,
          activeRunCount: 0,
          terminalRunCount: 1,
          staleRunCount: 0,
          latestRun: {
            runId: 'job-ai-dev-run-1',
            jobId: 'job-ai-dev',
            title: 'AI 开发执行',
            type: 'ai-development',
            runNumber: 1,
            status: 'succeeded',
            workerId: 'runner-a',
            startedAt: '2026-06-18T09:01:00.000Z',
            finishedAt: '2026-06-18T09:05:00.000Z',
            durationMs: 240000,
            eventCount: 3,
            latestEventType: 'platform-job-succeeded',
            latestEventAt: '2026-06-18T09:05:00.000Z',
            lifecycle: [
              {
                eventId: 'event-success',
                type: 'platform-job-succeeded',
                workerId: 'runner-a',
                jobStatus: 'succeeded',
                createdAt: '2026-06-18T09:05:00.000Z',
              },
              {
                eventId: 'event-heartbeat',
                type: 'platform-job-heartbeat',
                workerId: 'runner-a',
                jobStatus: 'running',
                createdAt: '2026-06-18T09:03:00.000Z',
              },
              {
                eventId: 'event-start',
                type: 'platform-job-started',
                workerId: 'runner-a',
                jobStatus: 'running',
                createdAt: '2026-06-18T09:01:00.000Z',
              },
            ],
          },
          rows: [
            {
              runId: 'job-ai-dev-run-1',
              jobId: 'job-ai-dev',
              title: 'AI 开发执行',
              type: 'ai-development',
              runNumber: 1,
              status: 'succeeded',
              workerId: 'runner-a',
              startedAt: '2026-06-18T09:01:00.000Z',
              finishedAt: '2026-06-18T09:05:00.000Z',
              durationMs: 240000,
              eventCount: 3,
              latestEventType: 'platform-job-succeeded',
              latestEventAt: '2026-06-18T09:05:00.000Z',
              lifecycle: [
                {
                  eventId: 'event-success',
                  type: 'platform-job-succeeded',
                  workerId: 'runner-a',
                  jobStatus: 'succeeded',
                  createdAt: '2026-06-18T09:05:00.000Z',
                },
                {
                  eventId: 'event-heartbeat',
                  type: 'platform-job-heartbeat',
                  workerId: 'runner-a',
                  jobStatus: 'running',
                  createdAt: '2026-06-18T09:03:00.000Z',
                },
                {
                  eventId: 'event-start',
                  type: 'platform-job-started',
                  workerId: 'runner-a',
                  jobStatus: 'running',
                  createdAt: '2026-06-18T09:01:00.000Z',
                },
              ],
            },
          ],
        },
        nextAction: '先处理失败的后台任务 QA 修复执行：RTSP reconnect failed.',
        latestAction: {
          id: 'job-qa-fix',
          source: 'platform-job',
          type: 'qa-defect-fix',
          title: 'QA 修复执行',
          status: 'failed',
          command: 'npm test',
          executor: 'codex-local',
          runCount: 2,
          errorSummary: 'RTSP reconnect failed.',
          sandboxPolicy: 'project-verification-command-allowlist',
          evidenceComplete: true,
          missingEvidence: [],
        },
        rows: [
          {
            id: 'job-qa-fix',
            source: 'platform-job',
            type: 'qa-defect-fix',
            title: 'QA 修复执行',
            status: 'failed',
            command: 'npm test',
            executor: 'codex-local',
            sandboxPolicy: 'project-verification-command-allowlist',
            evidenceComplete: true,
            missingEvidence: [],
          },
          {
            id: 'job-ai-dev',
            source: 'platform-job',
            type: 'ai-development',
            title: 'AI 开发验证',
            status: 'succeeded',
            command: 'npm test',
            executor: 'codex-local',
            sandboxPolicy: 'project-verification-command-allowlist',
            evidenceComplete: true,
            missingEvidence: [],
          },
          {
            id: 'qa-run',
            source: 'workflow',
            type: 'qa-run',
            title: '测试验证执行',
            status: 'running',
            executor: 'qa',
            evidenceComplete: false,
            missingEvidence: ['qaEvidence'],
          },
        ],
      },
      projectAutomationPlan: {
        status: 'ready-to-queue',
        priority: 'normal',
        nextAction: '建议排队 AI 开发执行后台任务，并使用项目命令白名单运行验证命令。',
        queueBlockedReason: '',
        existingJob: null,
        recommendedJob: {
          type: 'ai-development',
          title: 'AI 开发执行',
          command: 'npm test',
          source: 'project-automation-plan',
          details: {
            stageId: 'development',
            sandboxPolicy: 'project-verification-command-allowlist',
            recommendedBy: 'project-automation-plan',
          },
        },
      },
      yoloDeliveryChain: {
        isYoloProject: true,
        status: 'blocked',
        currentModuleId: 'security-review',
        currentModuleLabel: '代码安全审查',
        nextAction: '修复代码、安全或性能审查阻塞项，再重新进入 Review。',
        modules: [
          {
            id: 'pm-product',
            label: '项目经理/产品经理',
            status: 'complete',
            severity: 'normal',
            blockerCount: 0,
            missingItems: [],
            evidence: ['需求质检通过', 'PRD 已生成'],
            nextAction: '需求输入已满足，可以流转到技术交接和 AI Coding。',
          },
          {
            id: 'ai-coding',
            label: 'AI Coding',
            status: 'complete',
            severity: 'normal',
            blockerCount: 0,
            missingItems: [],
            evidence: ['提交 c60351e', '开发变更包已放行'],
            nextAction: '开发变更包已就绪，进入代码、安全和性能审查。',
          },
          {
            id: 'security-review',
            label: '代码安全审查',
            status: 'blocked',
            severity: 'critical',
            blockerCount: 1,
            missingItems: [
              {
                id: 'review-blocker-1',
                label: '安全检查未通过：生产代码中疑似包含 RTSP 凭据。',
                ownerRole: 'tech-lead',
              },
            ],
            evidence: ['评审提交 c60351e'],
            nextAction: '修复代码、安全或性能审查阻塞项，再重新进入 Review。',
          },
          {
            id: 'qa-validation',
            label: 'QA 测试验证',
            status: 'blocked',
            severity: 'high',
            blockerCount: 1,
            missingItems: [
              {
                id: 'review-not-passed',
                label: '代码安全审查尚未通过',
                ownerRole: 'tech-lead',
              },
            ],
            evidence: [],
            nextAction: '等待代码、安全和性能审查通过后进入 QA。',
          },
          {
            id: 'final-acceptance',
            label: '最终验收',
            status: 'blocked',
            severity: 'high',
            blockerCount: 2,
            missingItems: [
              {
                id: 'qa-not-passed',
                label: 'QA 尚未通过',
                ownerRole: 'qa',
              },
              {
                id: 'qa-evidence-not-ready',
                label: 'QA 证据尚未归档',
                ownerRole: 'qa',
              },
            ],
            evidence: [],
            nextAction: '等待 QA 通过并归档测试证据后生成验收包。',
          },
        ],
      },
      deliveryFlowRehearsal: {
        projectId: 'demo-1',
        projectName: 'yolo 摄像头监控项目',
        status: 'qa-return',
        statusLabel: '测试回流',
        currentPhaseId: 'qa-feedback-loop',
        currentPhaseLabel: 'QA 反馈回流',
        currentRole: 'developer',
        currentRoleLabel: 'AI 开发 / 测试',
        completedPhaseCount: 7,
        totalPhaseCount: 9,
        blockedPhaseCount: 1,
        missingPhaseCount: 1,
        activePhaseCount: 0,
        canDemoEndToEnd: false,
        nextAction: '将 QA 缺陷回流到开发，生成修复计划并完成复测。',
        phases: [
          {
            id: 'requirements',
            label: '需求确认',
            role: 'pm',
            roleLabel: '项目经理',
            status: 'complete',
            evidence: '需求质量评审已通过。',
          },
          {
            id: 'qa-feedback-loop',
            label: 'QA 反馈回流',
            role: 'developer',
            roleLabel: 'AI 开发 / 测试',
            status: 'blocked',
            evidence: 'QA 判定需要回流开发：RTSP 断流重连未通过',
            nextAction: '将 QA 缺陷回流到开发，生成修复计划并完成复测。',
          },
          {
            id: 'acceptance',
            label: '最终验收签收',
            role: 'owner',
            roleLabel: '负责人',
            status: 'missing',
            evidence: '尚未生成最终验收包。',
          },
        ],
      },
    };
    global.fetch = vi.fn(async (url, options = {}) => {
      if (url === '/api/users' && !options.method) {
        return jsonResponse({ users: appUsers, currentUser: appUsers[0] });
      }
      if (url === '/api/platform' && !options.method) {
        return jsonResponse({ platform: platformCockpit });
      }
      if (url === '/api/projects' && !options.method) {
        return jsonResponse({ projects: [projectSummary] });
      }
      if (url === '/api/projects/demo-1' && !options.method) {
        return jsonResponse({ project: gateProject });
      }
      if (url === '/api/projects/demo-1/platform-jobs/job-qa-fix/retry' && options.method === 'POST') {
        return jsonResponse({
          project: {
            ...gateProject,
            platformJobs: [
              {
                id: 'job-qa-fix',
                projectId: 'demo-1',
                type: 'qa-defect-fix',
                title: 'QA 修复执行',
                status: 'queued',
              },
            ],
            projectExecutionAudit: {
              ...gateProject.projectExecutionAudit,
              remediation: {
                totalActionCount: 0,
                retryCount: 0,
                reclaimCount: 0,
                startCount: 0,
                evidenceCount: 0,
                escalateCount: 0,
                primaryAction: null,
                actions: [],
              },
            },
          },
          platform: platformCockpit,
        });
      }
      return jsonResponse({ error: 'not found' }, 404);
    });

    render(<App />);
    await openDeliveryConsole();

    const executionPanel = await screen.findByLabelText('阶段执行确认区');
    expect(executionPanel).not.toHaveAttribute('open');
    fireEvent.click(within(executionPanel).getByText('执行确认'));
    expect(executionPanel).toHaveAttribute('open');
    const yoloChain = await screen.findByLabelText('YOLO 项目主链路');
    expect(within(yoloChain).getByText('项目经理/产品经理')).toBeInTheDocument();
    expect(within(yoloChain).getByText('AI Coding')).toBeInTheDocument();
    expect(within(yoloChain).getByText('代码安全审查')).toBeInTheDocument();
    expect(within(yoloChain).getByText('QA 测试验证')).toBeInTheDocument();
    expect(within(yoloChain).getByText('最终验收')).toBeInTheDocument();
    expect(within(yoloChain).getByText('安全检查未通过：生产代码中疑似包含 RTSP 凭据。')).toBeInTheDocument();
    const report = await screen.findByLabelText('阶段闸口报告');
    expect(within(report).getByLabelText('阶段闸口状态')).toHaveTextContent('被阻塞');
    expect(within(report).getByLabelText('阶段闸口待办数')).toHaveTextContent('2');
    expect(within(report).getByLabelText('阶段闸口阻塞项')).toHaveTextContent('2');
    const stageGateDetails = within(report).getByLabelText('阶段闸口详情');
    expect(stageGateDetails.tagName).toBe('DETAILS');
    expect(stageGateDetails).not.toHaveAttribute('open');
    expect(within(stageGateDetails).getByText('当前阶段确认事项未补齐。')).not.toBeVisible();
    expect(
      within(stageGateDetails).getByText('运行需求质量评审并生成需求文档草案。'),
    ).not.toBeVisible();
    fireEvent.click(within(stageGateDetails).getByText('阶段闸口详情'));
    expect(stageGateDetails).toHaveAttribute('open');
    const deliveryAudit = await screen.findByLabelText('交付闸口审计');
    expect(within(deliveryAudit).getByLabelText('交付闸口完成度')).toHaveTextContent('60%');
    expect(within(deliveryAudit).getByLabelText('当前交付闸口')).toHaveTextContent('测试验证');
    expect(within(deliveryAudit).getByText('将测试缺陷回流到开发，并重新生成修复计划。')).toBeInTheDocument();
    const auditDetails = within(deliveryAudit).getByLabelText('交付闸口明细');
    expect(auditDetails.tagName).toBe('DETAILS');
    expect(auditDetails).not.toHaveAttribute('open');
    expect(within(auditDetails).getByText('测试证据')).not.toBeVisible();
    fireEvent.click(within(auditDetails).getByText('交付闸口明细'));
    expect(auditDetails).toHaveAttribute('open');
    expect(within(deliveryAudit).getByLabelText('当前交接角色')).toHaveTextContent('测试');
    const roleHandoffs = within(deliveryAudit).getByLabelText('角色交接清单');
    expect(roleHandoffs.tagName).toBe('DETAILS');
    expect(roleHandoffs).not.toHaveAttribute('open');
    expect(within(roleHandoffs).getByText('负责人')).not.toBeVisible();
    fireEvent.click(within(roleHandoffs).getByText('角色交接清单'));
    expect(roleHandoffs).toHaveAttribute('open');
    expect(within(roleHandoffs).getByText('测试')).toBeVisible();
    expect(within(roleHandoffs).getByText('测试先处理测试验证阻塞：测试验证 判定存在实现缺口，需要回流开发。')).toBeVisible();
    const flowRehearsal = await screen.findByLabelText('完整链路演练');
    expect(within(flowRehearsal).getByText('完整链路演练')).toBeInTheDocument();
    expect(within(flowRehearsal).getByLabelText('链路演练完成度')).toHaveTextContent('7/9');
    expect(within(flowRehearsal).getByLabelText('当前链路环节')).toHaveTextContent('测试验证 反馈回流');
    expect(within(flowRehearsal).getByText('将测试缺陷回流到开发，生成修复计划并完成复测。')).toBeInTheDocument();
    const flowRehearsalDetails = within(flowRehearsal).getByLabelText('链路演练阶段明细');
    expect(flowRehearsalDetails.tagName).toBe('DETAILS');
    expect(flowRehearsalDetails).not.toHaveAttribute('open');
    expect(within(flowRehearsalDetails).getByText('需求确认')).not.toBeVisible();
    fireEvent.click(within(flowRehearsalDetails).getByText('链路演练阶段明细'));
    expect(flowRehearsalDetails).toHaveAttribute('open');
    expect(within(flowRehearsalDetails).getByText('测试验证 反馈回流')).toBeVisible();
    expect(within(flowRehearsalDetails).getByText('最终验收签收')).toBeVisible();
    expect(within(auditDetails).getByText('测试证据')).toBeVisible();
    expect(within(auditDetails).getAllByText('缺失').length).toBeGreaterThan(0);
    expect(within(auditDetails).getAllByText('阻塞').length).toBeGreaterThan(0);
    const responsibilityMatrix = await screen.findByLabelText('项目责任矩阵');
    expect(within(responsibilityMatrix).getByText('项目责任矩阵')).toBeInTheDocument();
    expect(within(responsibilityMatrix).getByLabelText('当前责任角色')).toHaveTextContent('项目经理');
    expect(within(responsibilityMatrix).getByLabelText('当前处理人')).toHaveTextContent('林项目经理');
    expect(within(responsibilityMatrix).getByText('项目经理需要处理项目经理需求的 5 个待办，并解除 2 个闸口阻塞。')).toBeInTheDocument();
    const responsibilityDetails = within(responsibilityMatrix).getByLabelText('责任矩阵明细');
    expect(responsibilityDetails.tagName).toBe('DETAILS');
    expect(responsibilityDetails).not.toHaveAttribute('open');
    expect(within(responsibilityDetails).getByText('自动开发')).not.toBeVisible();
    fireEvent.click(within(responsibilityDetails).getByText('责任矩阵明细'));
    expect(responsibilityDetails).toHaveAttribute('open');
    expect(within(responsibilityDetails).getByText('自动开发')).toBeVisible();
    expect(within(responsibilityDetails).getByText('队列中')).toBeVisible();
    const executionAudit = await screen.findByLabelText('项目执行审计');
    expect(within(executionAudit).getByText('项目执行审计')).toBeInTheDocument();
    expect(within(executionAudit).getByLabelText('执行审计总数')).toHaveTextContent('3');
    expect(within(executionAudit).getByLabelText('执行证据缺口')).toHaveTextContent('1');
    expect(
      within(executionAudit).getByText('先处理失败的后台任务 测试验证 修复执行：RTSP reconnect failed.'),
    ).toBeInTheDocument();
    const executionAuditDetails = within(executionAudit).getByLabelText('执行审计明细');
    expect(executionAuditDetails.tagName).toBe('DETAILS');
    expect(executionAuditDetails).not.toHaveAttribute('open');
    expect(within(executionAuditDetails).getByText('AI 开发验证')).not.toBeVisible();
    fireEvent.click(within(executionAuditDetails).getByText('执行审计明细'));
    expect(executionAuditDetails).toHaveAttribute('open');
    expect(within(executionAuditDetails).getByText('AI 开发验证')).toBeVisible();
    expect(within(executionAuditDetails).getByText('证据缺口：qaEvidence')).toBeVisible();
    expect(within(executionAudit).getByText('执行处置建议')).toBeInTheDocument();
    expect(within(executionAudit).getByText('重试任务 · 测试验证 修复执行')).toBeInTheDocument();
    expect(within(executionAudit).getByText('补齐证据 · 测试验证执行')).toBeInTheDocument();
    fireEvent.click(within(executionAudit).getByRole('button', { name: '重试任务' }));
    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/projects/demo-1/platform-jobs/job-qa-fix/retry',
        expect.objectContaining({ method: 'POST' }),
      ),
    );
    const executionTimeline = within(executionAudit).getByLabelText('执行器时间线');
    expect(within(executionTimeline).getByText('执行器时间线')).toBeInTheDocument();
    expect(within(executionTimeline).getByText('1 次运行 · 3 个事件')).toBeInTheDocument();
    expect(within(executionTimeline).getByText('AI 开发执行 · runner-a · 成功')).toBeInTheDocument();
    const timelineDetails = within(executionTimeline).getByLabelText('运行事件明细');
    expect(timelineDetails.tagName).toBe('DETAILS');
    expect(timelineDetails).not.toHaveAttribute('open');
    expect(within(timelineDetails).getByText('后台任务成功 · 2026-06-18T09:05:00.000Z')).not.toBeVisible();
    fireEvent.click(within(timelineDetails).getByText('运行事件明细'));
    expect(timelineDetails).toHaveAttribute('open');
    expect(within(timelineDetails).getByText('后台任务成功 · 2026-06-18T09:05:00.000Z')).toBeVisible();
    expect(within(timelineDetails).getByText('后台任务心跳 · 2026-06-18T09:03:00.000Z')).toBeVisible();
    const automationPlan = await screen.findByLabelText('自动化任务建议');
    expect(within(automationPlan).getByText('自动化任务建议')).toBeInTheDocument();
    expect(within(automationPlan).getByText('AI 开发执行')).toBeInTheDocument();
    expect(
      within(automationPlan).getByText('建议排队 AI 开发执行后台任务，并使用项目命令白名单运行验证命令。'),
    ).toBeInTheDocument();
    expect(within(automationPlan).getByText('命令：npm test')).toBeInTheDocument();
    expect(
      within(automationPlan).getByText('沙箱策略：project-verification-command-allowlist'),
    ).toBeInTheDocument();
    expect(within(stageGateDetails).getByText('当前阶段确认事项未补齐。')).toBeVisible();
    expect(
      within(stageGateDetails).getByText('运行需求质量评审并生成需求文档草案。'),
    ).toBeVisible();
  });

  test('shows a personal workspace for authenticated role users', async () => {
    window.localStorage.setItem(
      'wee-coder-session',
      JSON.stringify({ token: 'pm-token', user: appUsers[1] }),
    );

    render(<App />);

    expect(await screen.findByLabelText('个人工作台')).toBeInTheDocument();
    expect(screen.getByLabelText('我的待办数量')).toHaveTextContent('2');
    expect(screen.getByLabelText('我的项目数量')).toHaveTextContent('1');
    expect(screen.queryByLabelText('组织总览')).not.toBeInTheDocument();
  });

  test('loads the personal workspace task queue from the authenticated API', async () => {
    window.localStorage.setItem(
      'wee-coder-session',
      JSON.stringify({ token: 'pm-token', user: appUsers[1] }),
    );
    global.fetch = vi.fn(async (url, options = {}) => {
      if (url === '/api/users' && !options.method) {
        return jsonResponse({ users: appUsers, currentUser: appUsers[0] });
      }
      if (url === '/api/me/tasks' && !options.method) {
        expect(options.headers).toMatchObject({
          Authorization: 'Bearer pm-token',
          'X-Organization-Id': 'wee-coder-labs',
        });
        return jsonResponse({
          currentUser: appUsers[1],
          organization: { id: 'wee-coder-labs', name: 'WeeCoder Labs' },
          openTaskCount: 1,
          projectCount: 1,
          tasks: [
            {
              id: 'pm-requirements-scope-boundary',
              projectId: 'demo-1',
              projectName: '客户门户',
              stageId: 'pm-requirements',
              stageName: '项目经理需求',
              itemId: 'scope-boundary',
              title: '追问：范围边界',
              status: 'open',
            },
          ],
          inbox: { openTaskCount: 1, groups: [], currentUserGroups: [] },
        });
      }
      if (url === '/api/platform' && !options.method) {
        return jsonResponse({ platform: platformCockpit });
      }
      if (url === '/api/projects' && !options.method) {
        return jsonResponse({ projects: [projectSummary] });
      }
      if (url === '/api/projects/demo-1' && !options.method) {
        return jsonResponse({ project: baseProject });
      }
      return jsonResponse({ error: 'not found' }, 404);
    });

    render(<App />);

    expect(await screen.findByLabelText('个人工作台')).toBeInTheDocument();
    expect(screen.getByLabelText('我的待办数量')).toHaveTextContent('1');
    expect(screen.getByLabelText('我的项目数量')).toHaveTextContent('1');
    expect(
      screen.getByRole('button', { name: '处理我的待办 追问：范围边界' }),
    ).toBeInTheDocument();
  });

  test('prioritizes the current user queue on the personal workspace first screen', async () => {
    window.localStorage.setItem(
      'wee-coder-session',
      JSON.stringify({ token: 'pm-token', user: appUsers[1] }),
    );
    global.fetch = vi.fn(async (url, options = {}) => {
      if (url === '/api/users' && !options.method) {
        return jsonResponse({ users: appUsers, currentUser: appUsers[0] });
      }
      if (url === '/api/me/tasks' && !options.method) {
        return jsonResponse({
          currentUser: appUsers[1],
          organization: { id: 'wee-coder-labs', name: 'WeeCoder Labs' },
          openTaskCount: 3,
          projectCount: 1,
          tasks: [
            {
              id: 'pm-requirements-target-users',
              projectId: 'demo-1',
              projectName: '客户门户',
              stageId: 'pm-requirements',
              stageName: '项目经理需求',
              title: '追问：目标用户与核心场景',
              status: 'open',
              priorityContext: {
                gateStatus: 'blocked',
                healthLevel: 'critical',
                priority: 100,
                nextAction: '补齐目标用户。',
              },
            },
            {
              id: 'pm-requirements-scope-boundary',
              projectId: 'demo-1',
              projectName: '客户门户',
              stageId: 'pm-requirements',
              stageName: '项目经理需求',
              title: '追问：范围边界',
              status: 'open',
              priorityContext: {
                gateStatus: 'blocked',
                healthLevel: 'critical',
                priority: 90,
                nextAction: '补齐范围边界。',
              },
            },
            {
              id: 'pm-requirements-acceptance',
              projectId: 'demo-1',
              projectName: '客户门户',
              stageId: 'pm-requirements',
              stageName: '项目经理需求',
              title: '追问：验收标准',
              status: 'open',
              priorityContext: {
                gateStatus: 'blocked',
                healthLevel: 'critical',
                priority: 80,
                nextAction: '补齐验收标准。',
              },
            },
          ],
          inbox: { openTaskCount: 3, groups: [], currentUserGroups: [] },
        });
      }
      if (url === '/api/platform' && !options.method) {
        return jsonResponse({ platform: platformCockpit });
      }
      if (url === '/api/projects' && !options.method) {
        return jsonResponse({ projects: [projectSummary] });
      }
      if (url === '/api/projects/demo-1' && !options.method) {
        return jsonResponse({ project: baseProject });
      }
      return jsonResponse({ error: 'not found' }, 404);
    });

    render(<App />);

    const workFocus = await screen.findByLabelText('我的处理焦点');
    expect(screen.queryByLabelText('角色优先队列')).not.toBeInTheDocument();
    expect(within(workFocus).getByText('我的处理焦点')).toBeInTheDocument();
    expect(within(workFocus).getByText('追问：目标用户与核心场景')).toBeInTheDocument();
    expect(within(workFocus).getByText('待办 3')).toBeInTheDocument();
    expect(within(workFocus).queryByText('追问：范围边界')).not.toBeInTheDocument();
    expect(within(workFocus).queryByText('追问：验收标准')).not.toBeInTheDocument();
    expect(within(workFocus).getByRole('button', { name: '处理我的待办 追问：目标用户与核心场景' })).toBeInTheDocument();
    const queueDetails = within(workFocus).getByLabelText('其余优先待办');
    expect(queueDetails.tagName).toBe('DETAILS');
    expect(queueDetails).not.toHaveAttribute('open');
    expect(within(queueDetails).getByText('展开其余优先待办')).toBeVisible();
    fireEvent.click(within(queueDetails).getByText('展开其余优先待办'));
    expect(within(queueDetails).getByText('追问：范围边界')).toBeVisible();
    expect(within(queueDetails).getByText('追问：验收标准')).toBeVisible();

    const taskDetails = screen.getByLabelText('我的待办明细');
    expect(taskDetails.tagName).toBe('DETAILS');
    expect(taskDetails).not.toHaveAttribute('open');
    expect(within(taskDetails).getByText('展开全部待办')).toBeVisible();
    expect(within(taskDetails).queryByText('追问：目标用户与核心场景')).not.toBeInTheDocument();
    fireEvent.click(within(taskDetails).getByText('展开全部待办'));
    expect(within(taskDetails).getByText('追问：目标用户与核心场景')).toBeVisible();

    expect(screen.queryByLabelText('我的提醒')).not.toBeInTheDocument();
    const riskDetails = within(workFocus).getByLabelText('风险提醒');
    expect(riskDetails.tagName).toBe('DETAILS');
    expect(riskDetails).not.toHaveAttribute('open');
    expect(within(riskDetails).getByText('风险提醒')).toBeVisible();
    expect(within(riskDetails).getByText('3 条紧急提醒')).toBeVisible();
    fireEvent.click(within(riskDetails).getByText('风险提醒'));
    expect(riskDetails).toHaveAttribute('open');
    expect(within(riskDetails).getByText('追问：范围边界')).toBeVisible();
    expect(within(riskDetails).getByText('追问：验收标准')).toBeVisible();
  });

  test('reloads the personal workspace queue when a demo owner switches to an ops user', async () => {
    window.localStorage.setItem(
      'wee-coder-session',
      JSON.stringify({
        token: 'owner-token',
        user: appUsers[0],
        authMode: 'demo',
        allowUserSwitching: true,
      }),
    );
    const ownerQueue = {
      currentUser: appUsers[0],
      organization: { id: 'wee-coder-labs', name: 'WeeCoder Labs' },
      openTaskCount: 0,
      projectCount: 0,
      tasks: [],
      inbox: { openTaskCount: 0, groups: [], currentUserGroups: [] },
      workbench: {
        mode: 'owner',
        isOrganizationOwner: true,
        openTaskCount: 0,
        projectCount: 0,
        tasks: [],
        roleSummary: {
          title: 'Owner workbench',
          instruction: 'Owner queue should not persist after switching users.',
          scopeLabel: '0 projects / 0 open tasks',
        },
        actions: [],
        permissionGates: [],
        handoffSummary: null,
      },
    };
    const opsTask = {
      id: 'ops-requirements-runtime-environment',
      projectId: 'camera-monitor',
      projectName: 'Camera Monitor',
      stageId: 'ops-requirements',
      stageName: 'Ops requirements',
      itemId: 'runtime-environment',
      title: 'Confirm runtime environment',
      targetRole: 'ops',
      targetRoleLabel: 'Ops',
      assigneeUserId: 'ops-wang',
      assigneeName: '王运维',
      status: 'open',
    };
    const opsQueue = {
      currentUser: appUsers[4],
      organization: { id: 'wee-coder-labs', name: 'WeeCoder Labs' },
      openTaskCount: 1,
      projectCount: 1,
      tasks: [opsTask],
      inbox: { openTaskCount: 1, groups: [], currentUserGroups: [] },
      workbench: {
        mode: 'personal',
        isOrganizationOwner: false,
        openTaskCount: 1,
        projectCount: 1,
        tasks: [opsTask],
        roleSummary: {
          title: 'Ops workbench',
          instruction: 'Close environment, deployment, monitoring, and release handoff gaps.',
          scopeLabel: '1 project / 1 open task',
          focusProjectName: 'Camera Monitor',
          focusStageName: 'Ops requirements',
          nextAction: 'Confirm runtime and deployment requirements.',
        },
        actions: [
          {
            id: 'focus-task',
            actionId: 'update-stage-confirmations',
            label: 'Confirm operations handoff',
            enabled: true,
            projectId: 'camera-monitor',
            projectName: 'Camera Monitor',
            taskId: 'ops-requirements-runtime-environment',
            stageId: 'ops-requirements',
            stageName: 'Ops requirements',
          },
        ],
        permissionGates: [
          {
            actionId: 'update-stage-confirmations',
            allowed: true,
            allowedRoles: ['ops'],
            projectId: 'camera-monitor',
            projectName: 'Camera Monitor',
          },
        ],
        handoffSummary: {
          scope: 'personal',
          totalTaskCount: 1,
          activeProjectCount: 1,
          blockedTaskCount: 0,
          urgentTaskCount: 0,
          lanes: [],
          projects: [],
        },
      },
    };
    const cameraSummary = {
      ...projectSummary,
      id: 'camera-monitor',
      name: 'Camera Monitor',
      currentStageId: 'acceptance',
      currentStageName: 'Acceptance',
      openFollowupTaskCount: 0,
      followupTaskAssignments: [],
    };

    global.fetch = vi.fn(async (url, options = {}) => {
      const requestUserId = options.headers?.['X-User-Id'];
      if (url === '/api/users' && !options.method) {
        return jsonResponse({ users: appUsers, currentUser: appUsers[0] });
      }
      if (url === '/api/me/tasks' && !options.method) {
        return jsonResponse(requestUserId === 'ops-wang' ? opsQueue : ownerQueue);
      }
      if (url === '/api/platform' && !options.method) {
        return jsonResponse({ platform: platformCockpit });
      }
      if (url === '/api/projects' && !options.method) {
        return jsonResponse({ projects: [cameraSummary] });
      }
      if (url === '/api/projects/camera-monitor' && !options.method) {
        return jsonResponse({ project: { ...baseProject, ...cameraSummary } });
      }
      return jsonResponse({ error: 'not found' }, 404);
    });

    render(<App />);

    expect(await screen.findByText('组织态势')).toBeInTheDocument();
    const userSelect = await screen.findByLabelText('当前用户');
    fireEvent.change(userSelect, {
      target: { value: 'ops-wang' },
    });

    expect(await screen.findByText('个人工作台')).toBeInTheDocument();
    expect(screen.queryByText('组织态势')).not.toBeInTheDocument();
    const workspaceContext = await expandPersonalWorkspaceContext();
    expect(within(workspaceContext).getByText('运维工作台')).toBeInTheDocument();
    expect(screen.getByText('确认运维交接')).toBeInTheDocument();
    expect(within(workspaceContext).getByText('1 个项目 / 1 个待办')).toBeInTheDocument();
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/me/tasks',
        expect.objectContaining({
          headers: expect.objectContaining({ 'X-User-Id': 'ops-wang' }),
        }),
      );
    });
  });

  test('lets a role user acknowledge an owner escalation from the personal workspace', async () => {
    window.localStorage.setItem(
      'wee-coder-session',
      JSON.stringify({ token: 'pm-token', user: appUsers[1] }),
    );
    let currentTaskQueue = {
      currentUser: appUsers[1],
      organization: { id: 'wee-coder-labs', name: 'WeeCoder Labs' },
      openTaskCount: 1,
      projectCount: 1,
      tasks: [
        {
          id: 'owner-escalation-pm-camera',
          type: 'owner-escalation',
          escalationMessageId: 'owner-escalation-pm-camera',
          projectId: 'camera',
          projectName: 'Camera Monitor',
          stageId: 'pm-requirements',
          stageName: 'PM requirements',
          title: 'Escalate PM handoff: Camera Monitor overdue 24h',
          status: 'sent',
          priorityContext: {
            gateStatus: 'blocked',
            healthLevel: 'critical',
            priority: 100,
            reason: 'PM: Camera Monitor is overdue by 24h. Collect RTSP sample evidence.',
            nextAction: 'Acknowledge the owner escalation and update the unblock plan.',
          },
        },
      ],
      inbox: { openTaskCount: 0, groups: [], currentUserGroups: [] },
      workbench: {
        mode: 'personal',
        openTaskCount: 1,
        projectCount: 1,
        tasks: [
          {
            id: 'owner-escalation-pm-camera',
            type: 'owner-escalation',
            escalationMessageId: 'owner-escalation-pm-camera',
            projectId: 'camera',
            projectName: 'Camera Monitor',
            stageId: 'pm-requirements',
            stageName: 'PM requirements',
            title: 'Escalate PM handoff: Camera Monitor overdue 24h',
            status: 'sent',
            priorityContext: {
              gateStatus: 'blocked',
              healthLevel: 'critical',
              priority: 100,
              reason: 'PM: Camera Monitor is overdue by 24h. Collect RTSP sample evidence.',
              nextAction: 'Acknowledge the owner escalation and update the unblock plan.',
            },
          },
        ],
        roleSummary: {
          title: 'PM workbench',
          instruction: 'Clarify missing requirements and keep PRD approval gates moving.',
          scopeLabel: '1 project / 1 open task',
          focusProjectName: 'Camera Monitor',
          focusStageName: 'PM requirements',
          urgentTaskCount: 1,
          blockedProjectCount: 1,
          nextAction: 'Acknowledge the owner escalation and update the unblock plan.',
        },
        actions: [],
        permissionGates: [],
        handoffSummary: {
          scope: 'personal',
          totalTaskCount: 1,
          activeProjectCount: 1,
          blockedTaskCount: 1,
          urgentTaskCount: 1,
          nextAction: 'Acknowledge the owner escalation and update the unblock plan.',
          lanes: [],
          projects: [],
        },
      },
    };
    const requestBodies = [];
    global.fetch = vi.fn(async (url, options = {}) => {
      if (url === '/api/users' && !options.method) {
        return jsonResponse({ users: appUsers, currentUser: appUsers[0] });
      }
      if (url === '/api/me/tasks' && !options.method) {
        return jsonResponse(currentTaskQueue);
      }
      if (url === '/api/platform' && !options.method) {
        return jsonResponse({ platform: platformCockpit });
      }
      if (url === '/api/projects' && !options.method) {
        return jsonResponse({ projects: [{ ...projectSummary, id: 'camera', name: 'Camera Monitor' }] });
      }
      if (url === '/api/projects/camera' && !options.method) {
        return jsonResponse({ project: { ...baseProject, id: 'camera', name: 'Camera Monitor' } });
      }
      if (
        url === '/api/projects/camera/owner-escalations/owner-escalation-pm-camera/acknowledge' &&
        options.method === 'POST'
      ) {
        requestBodies.push(JSON.parse(options.body));
        currentTaskQueue = {
          ...currentTaskQueue,
          openTaskCount: 0,
          projectCount: 0,
          tasks: [],
          workbench: {
            ...currentTaskQueue.workbench,
            openTaskCount: 0,
            projectCount: 0,
            tasks: [],
            roleSummary: {
              ...currentTaskQueue.workbench.roleSummary,
              scopeLabel: '0 projects / 0 open tasks',
              urgentTaskCount: 0,
              blockedProjectCount: 0,
            },
          },
        };
        return jsonResponse({
          project: { ...baseProject, id: 'camera', name: 'Camera Monitor' },
          platform: platformCockpit,
          personalTaskQueue: currentTaskQueue,
        });
      }
      return jsonResponse({ error: 'not found' }, 404);
    });

    render(<App />);

    expect(await screen.findByLabelText('我的待办数量')).toHaveTextContent('1');
    expect(screen.getAllByText('升级项目经理交接：Camera Monitor 超时 24 小时').length).toBeGreaterThan(0);
    fireEvent.click(
      screen.getByRole('button', {
        name: '确认升级提醒 升级项目经理交接：Camera Monitor 超时 24 小时',
      }),
    );

    await waitFor(() => {
      expect(requestBodies[0]).toMatchObject({
        note: 'Acknowledged from personal workspace.',
      });
    });
    expect(await screen.findByLabelText('我的待办数量')).toHaveTextContent('0');
  });

  test('shows task priority context in the personal workspace queue', async () => {
    window.localStorage.setItem(
      'wee-coder-session',
      JSON.stringify({ token: 'pm-token', user: appUsers[1] }),
    );
    global.fetch = vi.fn(async (url, options = {}) => {
      if (url === '/api/users' && !options.method) {
        return jsonResponse({ users: appUsers, currentUser: appUsers[0] });
      }
      if (url === '/api/me/tasks' && !options.method) {
        return jsonResponse({
          currentUser: appUsers[1],
          organization: { id: 'wee-coder-labs', name: 'WeeCoder Labs' },
          openTaskCount: 1,
          projectCount: 1,
          tasks: [
            {
              id: 'pm-risk-context',
              projectId: 'demo-1',
              projectName: 'Camera Monitor',
              stageId: 'pm-requirements',
              stageName: 'PM requirements',
              itemId: 'risk-context',
              title: 'Clarify QA evidence',
              status: 'open',
              priorityContext: {
                healthLevel: 'critical',
                healthScore: 6,
                priority: 100,
                gateStatus: 'blocked',
                gateBlockerCount: 2,
                blockedStageName: 'PM requirements',
                nextAction: 'Collect QA test evidence.',
                reason: 'Stage gate blocked by 2 item(s).',
              },
            },
          ],
          inbox: { openTaskCount: 1, groups: [], currentUserGroups: [] },
        });
      }
      if (url === '/api/platform' && !options.method) {
        return jsonResponse({ platform: platformCockpit });
      }
      if (url === '/api/projects' && !options.method) {
        return jsonResponse({ projects: [projectSummary] });
      }
      if (url === '/api/projects/demo-1' && !options.method) {
        return jsonResponse({ project: baseProject });
      }
      return jsonResponse({ error: 'not found' }, 404);
    });

    render(<App />);

    expect(await screen.findByText('高风险 · 得分 6')).toBeInTheDocument();
    expect(screen.getAllByText('收集测试验证证据。').length).toBeGreaterThanOrEqual(1);
    const riskDetails = screen.getByLabelText('风险提醒');
    expect(riskDetails).not.toHaveAttribute('open');
    expect(within(riskDetails).getByText('风险提醒')).toBeVisible();
    expect(within(riskDetails).queryByText('阶段闸口被 2 个事项阻塞。')).not.toBeInTheDocument();
    fireEvent.click(within(riskDetails).getByText('风险提醒'));
    expect(riskDetails).toHaveAttribute('open');
    expect(within(riskDetails).getByText('阶段闸口被 2 个事项阻塞。')).toBeVisible();
  });

  test('shows role focus summary in the personal workspace', async () => {
    window.localStorage.setItem(
      'wee-coder-session',
      JSON.stringify({ token: 'qa-token', user: appUsers[7] }),
    );
    const cameraSummary = {
      ...projectSummary,
      id: 'camera-monitor',
      name: 'Camera Monitor',
      currentStageId: 'qa-validation',
      currentStageName: 'QA validation',
    };
    const cameraProject = {
      ...baseProject,
      id: 'camera-monitor',
      name: 'Camera Monitor',
      currentStageId: 'qa-validation',
      currentStageName: 'QA validation',
    };

    global.fetch = vi.fn(async (url, options = {}) => {
      if (url === '/api/users' && !options.method) {
        return jsonResponse({ users: appUsers, currentUser: appUsers[0] });
      }
      if (url === '/api/me/tasks' && !options.method) {
        return jsonResponse({
          currentUser: appUsers[7],
          organization: { id: 'wee-coder-labs', name: 'WeeCoder Labs' },
          openTaskCount: 2,
          projectCount: 1,
          tasks: [
            {
              id: 'qa-evidence',
              projectId: 'camera-monitor',
              projectName: 'Camera Monitor',
              stageId: 'qa-validation',
              stageName: 'QA validation',
              title: 'Collect QA evidence',
              status: 'open',
              priorityContext: {
                gateStatus: 'blocked',
                healthLevel: 'critical',
                priority: 95,
                nextAction: 'Attach QA evidence before release.',
              },
            },
          ],
          inbox: { openTaskCount: 2, groups: [], currentUserGroups: [] },
        });
      }
      if (url === '/api/platform' && !options.method) {
        return jsonResponse({ platform: platformCockpit });
      }
      if (url === '/api/projects' && !options.method) {
        return jsonResponse({ projects: [cameraSummary] });
      }
      if (url === '/api/projects/camera-monitor' && !options.method) {
        return jsonResponse({ project: cameraProject });
      }
      return jsonResponse({ error: 'not found' }, 404);
    });

    render(<App />);

    const workspaceContext = await expandPersonalWorkspaceContext();
    const roleFocus = within(workspaceContext).getByText('角色焦点').closest('div');
    expect(within(roleFocus).getByText('测试工作台')).toBeInTheDocument();
    expect(
      within(roleFocus).getByText(
        '验证交付质量、收集证据，并将缺陷回流开发。',
      ),
    ).toBeInTheDocument();
    expect(within(roleFocus).getByText('1 个项目 / 2 个待办')).toBeInTheDocument();
    expect(within(roleFocus).getByText('聚焦 Camera Monitor · 测试验证')).toBeInTheDocument();
    expect(within(roleFocus).getByText('紧急 1')).toBeInTheDocument();
    expect(within(roleFocus).getByText('阻塞项目 1')).toBeInTheDocument();
    expect(within(roleFocus).getByText('发布前补充测试验证证据。')).toBeInTheDocument();
  });

  test('uses server-provided role workbench actions in the personal workspace', async () => {
    window.localStorage.setItem(
      'wee-coder-session',
      JSON.stringify({ token: 'qa-token', user: appUsers[7] }),
    );
    const cameraSummary = {
      ...projectSummary,
      id: 'camera-monitor',
      name: 'Camera Monitor',
      currentStageId: 'qa',
      currentStageName: 'QA',
    };
    const cameraProject = {
      ...baseProject,
      ...cameraSummary,
      stages: [
        { ...stages[0], status: 'approved' },
        { ...stages[1], status: 'approved' },
        { ...stages[2], status: 'approved' },
        {
          id: 'qa',
          name: 'QA',
          owner: '测试',
          status: 'active',
          description: '执行测试并补齐验收证据。',
          checklist: ['补充测试证据', '执行 QA 测试'],
        },
      ],
      codeReviewReport: { status: 'passed' },
    };

    global.fetch = vi.fn(async (url, options = {}) => {
      if (url === '/api/users' && !options.method) {
        return jsonResponse({ users: appUsers, currentUser: appUsers[0] });
      }
      if (url === '/api/me/tasks' && !options.method) {
        return jsonResponse({
          currentUser: appUsers[7],
          organization: { id: 'wee-coder-labs', name: 'WeeCoder Labs' },
          openTaskCount: 1,
          projectCount: 1,
          tasks: [
            {
              id: 'qa-evidence',
              projectId: 'camera-monitor',
              projectName: 'Camera Monitor',
              stageId: 'qa',
              stageName: 'QA',
              title: 'Collect QA evidence',
              status: 'open',
            },
          ],
          inbox: { openTaskCount: 1, groups: [], currentUserGroups: [] },
          workbench: {
            mode: 'personal',
            openTaskCount: 1,
            projectCount: 1,
            tasks: [
              {
                id: 'qa-evidence',
                projectId: 'camera-monitor',
                projectName: 'Camera Monitor',
                stageId: 'qa',
                stageName: 'QA',
                title: 'Collect QA evidence',
                status: 'open',
              },
            ],
            roleSummary: {
              title: 'Server QA workbench',
              instruction: 'Server-side workbench decision.',
              scopeLabel: '1 project / 1 open task',
              focusProjectName: 'Camera Monitor',
              focusStageName: 'QA',
              urgentTaskCount: 1,
              blockedProjectCount: 1,
              nextAction: 'Use the backend gate decision.',
            },
            actions: [
              {
                id: 'focus-task',
                label: 'Attach QA evidence',
                actionId: 'qa-evidence',
                enabled: true,
                projectId: 'camera-monitor',
                projectName: 'Camera Monitor',
                taskId: 'qa-evidence',
              },
            ],
            permissionGates: [
              {
                actionId: 'qa-evidence',
                allowed: true,
                allowedRoles: ['qa'],
                projectId: 'camera-monitor',
                projectName: 'Camera Monitor',
              },
            ],
            handoffSummary: {
              scope: 'personal',
              currentRole: 'qa',
              currentRoleLabel: 'QA',
              upstreamRole: 'tech-lead',
              upstreamRoleLabel: 'Tech Lead',
              downstreamRole: 'owner',
              downstreamRoleLabel: 'Owner',
              totalTaskCount: 1,
              activeProjectCount: 1,
              blockedTaskCount: 1,
              urgentTaskCount: 1,
              nextAction: 'Send QA evidence to Owner for acceptance.',
              lanes: [
                { role: 'tech-lead', roleLabel: 'Tech Lead', relation: 'upstream' },
                { role: 'qa', roleLabel: 'QA', relation: 'current', taskCount: 1 },
                { role: 'owner', roleLabel: 'Owner', relation: 'downstream' },
              ],
              projects: [
                {
                  projectId: 'camera-monitor',
                  projectName: 'Camera Monitor',
                  stageName: 'QA',
                  openTaskCount: 1,
                  blockedTaskCount: 1,
                  latestTaskTitle: 'Collect QA evidence',
                },
              ],
            },
          },
        });
      }
      if (url === '/api/platform' && !options.method) {
        return jsonResponse({ platform: platformCockpit });
      }
      if (url === '/api/projects' && !options.method) {
        return jsonResponse({ projects: [cameraSummary] });
      }
      if (url === '/api/projects/camera-monitor' && !options.method) {
        return jsonResponse({ project: cameraProject });
      }
      return jsonResponse({ error: 'not found' }, 404);
    });

    render(<App />);

    const primaryAction = await screen.findByLabelText('当前主行动');
    expect(within(primaryAction).getByText('现在轮到我')).toBeInTheDocument();
    expect(within(primaryAction).getByText('补充测试验证证据')).toBeInTheDocument();
    expect(within(primaryAction).getByText('Camera Monitor · 测试验证')).toBeInTheDocument();
    expect(within(primaryAction).getByText('可执行')).toBeInTheDocument();
    expect(within(primaryAction).getByText('权限校验 · 允许')).toBeInTheDocument();
    expect(within(primaryAction).getByText('允许角色：测试')).toBeInTheDocument();
    expect(within(primaryAction).getByText('使用后端闸口决策。')).toBeInTheDocument();
    expect(screen.queryByLabelText('角色交接')).not.toBeInTheDocument();
    expect(screen.queryByText('角色焦点')).not.toBeInTheDocument();
    const workspaceContext = screen.getByLabelText('个人工作台补充信息');
    expect(workspaceContext.tagName).toBe('DETAILS');
    expect(workspaceContext).not.toHaveAttribute('open');
    fireEvent.click(within(workspaceContext).getByText('展开补充信息'));
    const roleFocus = within(workspaceContext).getByText('角色焦点').closest('div');
    expect(within(roleFocus).getByText('服务端测试工作台')).toBeInTheDocument();
    expect(within(roleFocus).getByText('服务端工作台决策。')).toBeInTheDocument();
    expect(within(roleFocus).getByText('补充测试验证证据 · 允许')).toBeInTheDocument();
    expect(within(roleFocus).getByText('使用后端闸口决策。')).toBeInTheDocument();
    const roleHandoff = screen.getByLabelText('角色交接');
    expect(within(roleHandoff).getByText('技术负责人 → 测试 → 负责人')).toBeInTheDocument();
    expect(within(roleHandoff).getByText('1 个项目 / 1 个任务 / 阻塞 1')).toBeInTheDocument();
    expect(within(roleHandoff).getByText('Camera Monitor · 测试验证 · 收集测试验证证据')).toBeInTheDocument();
    expect(within(roleHandoff).getByText('将测试证据交给负责人验收。')).toBeInTheDocument();
    fireEvent.click(within(primaryAction).getByRole('button', { name: '处理当前主行动 补充测试验证证据' }));
    expect(await screen.findByLabelText('任务详情')).toBeInTheDocument();
    await screen.findByLabelText('当前任务速览');
    await expandCurrentTaskSection();
    expect(screen.getAllByText('收集测试验证证据').length).toBeGreaterThan(0);
    const qaEvidence = screen.getByLabelText('测试证据面板');
    expect(within(qaEvidence).getByText('来自个人工作台的聚焦任务')).toBeInTheDocument();
    expect(within(qaEvidence).getByText('当前测试任务')).toBeInTheDocument();
    expect(within(qaEvidence).getByText('确认样本、测试时长、运行环境和浏览器范围后，测试才能解除真实验收阻塞。')).toBeInTheDocument();
    expect(within(qaEvidence).queryByText('确认样本、测试时长、运行环境和浏览器范围后，QA 才能解除真实验收阻塞。')).not.toBeInTheDocument();
  });

  test('opens an ops workspace task and focuses the operations handoff panel', async () => {
    window.localStorage.setItem(
      'wee-coder-session',
      JSON.stringify({ token: 'ops-token', user: appUsers[4] }),
    );
    const opsSummary = {
      ...projectSummary,
      id: 'camera-monitor',
      name: 'Camera Monitor',
      currentStageId: 'acceptance',
      currentStageName: 'Acceptance',
      currentOwner: 'Owner',
    };
    const opsProject = {
      ...baseProject,
      ...opsSummary,
      technicalHandoffStatus: 'generated',
      technicalHandoffProvider: 'codex-cli',
      artifacts: {
        ...baseProject.artifacts,
        'ops-requirements': '# Ops handoff\nRuntime, deployment, logging, and RTSP access.',
      },
      stages: [
        { ...stages[0], status: 'approved' },
        { ...stages[1], status: 'approved' },
        { ...stages[2], status: 'approved' },
        {
          id: 'ops-requirements',
          name: 'Ops requirements',
          owner: 'Ops',
          status: 'approved',
          description: 'Confirm runtime, deployment, RTSP connectivity, logging, and monitoring.',
          checklist: ['Confirm runtime environment', 'Confirm deployment and logging handoff'],
        },
        {
          id: 'acceptance',
          name: 'Acceptance',
          owner: 'Owner',
          status: 'active',
          description: 'Confirm final delivery evidence and sign-off.',
          checklist: ['Confirm acceptance package', 'Sign off release'],
        },
      ],
    };

    global.fetch = vi.fn(async (url, options = {}) => {
      if (url === '/api/users' && !options.method) {
        return jsonResponse({ users: appUsers, currentUser: appUsers[4] });
      }
      if (url === '/api/me/tasks' && !options.method) {
        return jsonResponse({
          currentUser: appUsers[4],
          organization: { id: 'wee-coder-labs', name: 'WeeCoder Labs' },
          openTaskCount: 1,
          projectCount: 1,
          tasks: [
            {
              id: 'ops-runtime',
              projectId: 'camera-monitor',
              projectName: 'Camera Monitor',
              stageId: 'ops-requirements',
              stageName: 'Ops requirements',
              title: 'Confirm runtime environment',
              status: 'open',
            },
          ],
          inbox: { openTaskCount: 1, groups: [], currentUserGroups: [] },
          workbench: {
            mode: 'personal',
            openTaskCount: 1,
            projectCount: 1,
            tasks: [
              {
                id: 'ops-runtime',
                projectId: 'camera-monitor',
                projectName: 'Camera Monitor',
                stageId: 'ops-requirements',
                stageName: 'Ops requirements',
                title: 'Confirm runtime environment',
                status: 'open',
              },
            ],
            roleSummary: {
              title: 'Ops workbench',
              instruction: 'Close environment, deployment, monitoring, and release handoff gaps.',
              scopeLabel: '1 project / 1 open task',
              focusProjectName: 'Camera Monitor',
              focusStageName: 'Ops requirements',
              urgentTaskCount: 1,
              blockedProjectCount: 1,
              nextAction: 'Confirm runtime and deployment requirements.',
            },
            actions: [
              {
                id: 'focus-task',
                label: 'Confirm operations handoff',
                actionId: 'update-stage-confirmations',
                enabled: true,
                projectId: 'camera-monitor',
                projectName: 'Camera Monitor',
                taskId: 'ops-runtime',
              },
            ],
            permissionGates: [
              {
                actionId: 'update-stage-confirmations',
                allowed: true,
                allowedRoles: ['ops'],
                projectId: 'camera-monitor',
                projectName: 'Camera Monitor',
              },
            ],
            handoffSummary: {
              scope: 'personal',
              currentRole: 'ops',
              currentRoleLabel: 'Ops',
              upstreamRole: 'tech-lead',
              upstreamRoleLabel: 'Tech Lead',
              downstreamRole: 'ai-dev',
              downstreamRoleLabel: 'AI Dev',
              totalTaskCount: 1,
              activeProjectCount: 1,
              blockedTaskCount: 1,
              urgentTaskCount: 1,
              nextAction: 'Send runtime handoff to AI development and local runner.',
              lanes: [
                { role: 'tech-lead', roleLabel: 'Tech Lead', relation: 'upstream' },
                { role: 'ops', roleLabel: 'Ops', relation: 'current', taskCount: 1 },
                { role: 'ai-dev', roleLabel: 'AI Dev', relation: 'downstream' },
              ],
              projects: [
                {
                  projectId: 'camera-monitor',
                  projectName: 'Camera Monitor',
                  stageName: 'Ops requirements',
                  openTaskCount: 1,
                  blockedTaskCount: 1,
                  latestTaskTitle: 'Confirm runtime environment',
                },
              ],
            },
          },
        });
      }
      if (url === '/api/platform' && !options.method) {
        return jsonResponse({ platform: platformCockpit });
      }
      if (url === '/api/projects' && !options.method) {
        return jsonResponse({ projects: [opsSummary] });
      }
      if (url === '/api/projects/camera-monitor' && !options.method) {
        return jsonResponse({ project: opsProject });
      }
      return jsonResponse({ error: 'not found' }, 404);
    });

    render(<App />);

    const workspaceContext = await expandPersonalWorkspaceContext();
    const roleFocus = within(workspaceContext).getByText('角色焦点').closest('div');
    expect(within(roleFocus).getByText('运维工作台')).toBeInTheDocument();
    expect(within(roleFocus).getByText('确认运维交接 · 允许')).toBeInTheDocument();

    const actionLabel = await screen.findByText('确认运维交接');
    const primaryAction = actionLabel.closest('[aria-label]');
    expect(within(primaryAction).getByText('Camera Monitor · 运维需求')).toBeInTheDocument();
    fireEvent.click(within(primaryAction).getByRole('button'));

    expect(await screen.findByText('任务详情')).toBeInTheDocument();
    expect(screen.getByLabelText('项目工作区')).toBeInTheDocument();
    await screen.findByLabelText('当前任务速览');
    await expandCurrentTaskSection();
    expect(screen.getByRole('tab', { name: '架构与运维' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(screen.getAllByText('确认运行环境').length).toBeGreaterThan(0);
    const opsHandoff = screen.getByLabelText('运维交接面板');
    expect(within(opsHandoff).getByText('来自个人工作台的聚焦任务')).toBeInTheDocument();
    expect(within(opsHandoff).getByText('当前运维任务')).toBeInTheDocument();
    expect(within(opsHandoff).getByText('确认运行环境')).toBeInTheDocument();
  });

  test('shows blocked permission reason on the primary role action', async () => {
    window.localStorage.setItem(
      'wee-coder-session',
      JSON.stringify({ token: 'pm-token', user: appUsers[1] }),
    );
    const reviewSummary = {
      ...projectSummary,
      id: 'camera-monitor',
      name: 'Camera Monitor',
      currentStageId: 'review',
      currentStageName: 'Review',
    };

    global.fetch = vi.fn(async (url, options = {}) => {
      if (url === '/api/users' && !options.method) {
        return jsonResponse({ users: appUsers, currentUser: appUsers[0] });
      }
      if (url === '/api/me/tasks' && !options.method) {
        return jsonResponse({
          currentUser: appUsers[1],
          organization: { id: 'wee-coder-labs', name: 'WeeCoder Labs' },
          openTaskCount: 1,
          projectCount: 1,
          tasks: [
            {
              id: 'review-gate',
              projectId: 'camera-monitor',
              projectName: 'Camera Monitor',
              stageId: 'review',
              stageName: 'Review',
              title: 'Run code review gate',
              status: 'open',
            },
          ],
          inbox: { openTaskCount: 1, groups: [], currentUserGroups: [] },
          workbench: {
            mode: 'personal',
            openTaskCount: 1,
            projectCount: 1,
            tasks: [
              {
                id: 'review-gate',
                projectId: 'camera-monitor',
                projectName: 'Camera Monitor',
                stageId: 'review',
                stageName: 'Review',
                title: 'Run code review gate',
                status: 'open',
              },
            ],
            roleSummary: {
              title: 'PM workbench',
              instruction: 'Server-side PM decision.',
              scopeLabel: '1 project / 1 open task',
              focusProjectName: 'Camera Monitor',
              focusStageName: 'Review',
              urgentTaskCount: 1,
              blockedProjectCount: 1,
              nextAction: 'Ask the tech lead to run review.',
            },
            actions: [
              {
                id: 'focus-task',
                label: 'Run code review',
                actionId: 'run-code-review',
                enabled: false,
                projectId: 'camera-monitor',
                projectName: 'Camera Monitor',
                taskId: 'review-gate',
              },
            ],
            permissionGates: [
              {
                actionId: 'run-code-review',
                allowed: false,
                allowedRoles: ['tech-lead'],
                reason: '当前角色无权执行代码、安全、性能评审。',
                projectId: 'camera-monitor',
                projectName: 'Camera Monitor',
              },
            ],
          },
        });
      }
      if (url === '/api/platform' && !options.method) {
        return jsonResponse({ platform: platformCockpit });
      }
      if (url === '/api/projects' && !options.method) {
        return jsonResponse({ projects: [reviewSummary] });
      }
      if (url === '/api/projects/camera-monitor' && !options.method) {
        return jsonResponse({ project: { ...baseProject, ...reviewSummary } });
      }
      return jsonResponse({ error: 'not found' }, 404);
    });

    render(<App />);

    const primaryAction = await screen.findByLabelText('当前主行动');
    expect(within(primaryAction).getByText('执行代码评审')).toBeInTheDocument();
    expect(within(primaryAction).getByText('被阻塞')).toBeInTheDocument();
    expect(within(primaryAction).getByText('权限校验 · 阻塞')).toBeInTheDocument();
    expect(within(primaryAction).getByText('允许角色：技术负责人')).toBeInTheDocument();
    expect(within(primaryAction).getByText('当前角色无权执行代码、安全、性能评审。')).toBeInTheDocument();
    expect(within(primaryAction).getByRole('button', { name: '处理当前主行动 执行代码评审' })).toBeDisabled();
  });

  test('selects the first assigned task project for authenticated role users', async () => {
    window.localStorage.setItem(
      'wee-coder-session',
      JSON.stringify({ token: 'pm-token', user: appUsers[1] }),
    );

    const ownerProjectSummary = {
      ...projectSummary,
      id: 'owner-dashboard',
      name: '负责人看板项目',
      currentStageId: 'intake',
      currentStageName: '项目入口',
      openFollowupTaskCount: 0,
      followupTaskAssignments: [],
    };
    const cameraProjectSummary = {
      ...projectSummary,
      id: 'camera-monitor',
      name: 'YOLO 摄像头监控',
      currentStageId: 'pm-requirements',
      currentStageName: '摄像头需求确认',
    };
    const ownerProject = {
      ...baseProject,
      id: 'owner-dashboard',
      name: '负责人看板项目',
      currentStageId: 'intake',
      stages: [
        {
          id: 'intake',
          name: '项目入口',
          owner: '负责人',
          status: 'active',
          description: '创建项目。',
          checklist: ['填写项目名称'],
        },
      ],
    };
    const cameraProject = {
      ...baseProject,
      id: 'camera-monitor',
      name: 'YOLO 摄像头监控',
      currentStageId: 'pm-requirements',
      currentStageName: '摄像头需求确认',
      stages: [
        {
          id: 'pm-requirements',
          name: '摄像头需求确认',
          owner: '项目经理',
          status: 'active',
          description: '确认摄像头监控需求。',
          checklist: ['补齐 RTSP 与测试样本'],
        },
      ],
    };

    global.fetch = vi.fn(async (url, options = {}) => {
      if (url === '/api/users' && !options.method) {
        return jsonResponse({ users: appUsers, currentUser: appUsers[0] });
      }
      if (url === '/api/platform' && !options.method) {
        return jsonResponse({ platform: platformCockpit });
      }
      if (url === '/api/me/tasks' && !options.method) {
        return jsonResponse({
          currentUser: appUsers[1],
          organization: { id: 'wee-coder-labs', name: 'WeeCoder Labs' },
          openTaskCount: 1,
          projectCount: 1,
          tasks: [
            {
              id: 'camera-monitor-rtsp',
              projectId: 'camera-monitor',
              projectName: 'YOLO 摄像头监控',
              stageId: 'pm-requirements',
              stageName: '摄像头需求确认',
              itemId: 'rtsp-source',
              title: '补充 RTSP 地址与测试样本',
              status: 'open',
            },
          ],
          inbox: { openTaskCount: 1, groups: [], currentUserGroups: [] },
        });
      }
      if (url === '/api/projects' && !options.method) {
        return jsonResponse({ projects: [ownerProjectSummary, cameraProjectSummary] });
      }
      if (url === '/api/projects/owner-dashboard' && !options.method) {
        return jsonResponse({ project: ownerProject });
      }
      if (url === '/api/projects/camera-monitor' && !options.method) {
        return jsonResponse({ project: cameraProject });
      }
      return jsonResponse({ error: 'not found' }, 404);
    });

    render(<App />);

    expect(await screen.findByLabelText('个人工作台')).toBeInTheDocument();
    const assignedTask = screen.getByRole('button', {
      name: '处理我的待办 补充 RTSP 地址与测试样本',
    });
    expect(assignedTask).toBeInTheDocument();
    fireEvent.click(assignedTask);
    await screen.findByLabelText('当前任务速览');
    await expandCurrentTaskSection();
    expect((await screen.findAllByRole('heading', { name: '摄像头需求确认' })).length).toBeGreaterThan(
      0,
    );
  });

  test('opens a personal workspace task and focuses the matching workflow item', async () => {
    const confirmationProject = {
      ...baseProject,
      stageConfirmations: {
        'pm-requirements': {
          stageId: 'pm-requirements',
          stageName: '项目经理需求',
          owner: '项目经理',
          status: 'incomplete',
          completedCount: 0,
          totalCount: 2,
          missingItems: [
            { id: 'target-users', title: '目标用户与核心场景' },
            { id: 'success-metrics', title: '成功指标与验收口径' },
          ],
          items: [
            {
              id: 'target-users',
              title: '目标用户与核心场景',
              description: '确认目标用户、核心使用场景和主要业务动作。',
              required: true,
              value: '',
              status: 'missing',
            },
            {
              id: 'success-metrics',
              title: '成功指标与验收口径',
              description: '确认可量化成功指标、验收口径和统计方式。',
              required: true,
              value: '',
              status: 'missing',
            },
          ],
        },
      },
    };
    window.localStorage.setItem(
      'wee-coder-session',
      JSON.stringify({ token: 'pm-token', user: appUsers[1] }),
    );
    global.fetch = vi.fn(async (url, options = {}) => {
      if (url === '/api/users' && !options.method) {
        return jsonResponse({ users: appUsers, currentUser: appUsers[0] });
      }
      if (url === '/api/platform' && !options.method) {
        return jsonResponse({ platform: platformCockpit });
      }
      if (url === '/api/projects' && !options.method) {
        return jsonResponse({ projects: [projectSummary] });
      }
      if (url === '/api/projects/demo-1' && !options.method) {
        return jsonResponse({ project: confirmationProject });
      }
      return jsonResponse({ error: 'not found' }, 404);
    });

    render(<App />);

    fireEvent.click(await screen.findByRole('button', { name: '处理我的待办 追问：目标用户与核心场景' }));
    await screen.findByLabelText('当前任务速览');
    await expandCurrentTaskSection();

    await waitFor(() => {
      expect(screen.getByText('确认事项-目标用户与核心场景').closest('.stage-confirmation-item')).toHaveClass(
        'focused',
      );
    });
    const focusedItem = screen.getByText('确认事项-目标用户与核心场景').closest('.stage-confirmation-item');
    expect(within(focusedItem).getByText('当前任务')).toBeInTheDocument();
    expect(screen.getByText('来自个人工作台的聚焦任务')).toBeInTheDocument();
    const taskDetail = screen.getByLabelText('任务详情');
    expect(taskDetail).toBeInTheDocument();
    expect(within(taskDetail).getByText('追问：目标用户与核心场景')).toBeInTheDocument();
    expect(within(taskDetail).getByText('客户门户 · 项目经理需求')).toBeInTheDocument();
    expect(within(taskDetail).getByText('指派：林项目经理')).toBeInTheDocument();
    expect(within(taskDetail).getByText('状态：待处理')).toBeInTheDocument();
  });

  test('submits a task comment from the task detail panel', async () => {
    const confirmationProject = {
      ...baseProject,
      stageConfirmations: {
        'pm-requirements': {
          stageId: 'pm-requirements',
          stageName: '项目经理需求',
          owner: '项目经理',
          status: 'incomplete',
          completedCount: 0,
          totalCount: 1,
          missingItems: [{ id: 'target-users', title: '目标用户与核心场景' }],
          items: [
            {
              id: 'target-users',
              title: '目标用户与核心场景',
              description: '确认目标用户、核心使用场景和主要业务动作。',
              required: true,
              value: '',
              status: 'missing',
            },
          ],
        },
      },
    };
    const commentedProject = {
      ...confirmationProject,
      history: [
        {
          type: 'task-comment-added',
          actor: '项目经理',
          stageId: 'pm-requirements',
          itemId: 'target-users',
          followupTaskId: 'pm-requirements-target-users',
          comment: '已经约业务负责人确认保安巡检场景。',
          note: '任务备注：已经约业务负责人确认保安巡检场景。',
          at: '2026-06-17T02:00:00.000Z',
        },
      ],
    };
    window.localStorage.setItem(
      'wee-coder-session',
      JSON.stringify({ token: 'pm-token', user: appUsers[1] }),
    );
    global.fetch = vi.fn(async (url, options = {}) => {
      if (url === '/api/users' && !options.method) {
        return jsonResponse({ users: appUsers, currentUser: appUsers[0] });
      }
      if (url === '/api/platform' && !options.method) {
        return jsonResponse({ platform: platformCockpit });
      }
      if (url === '/api/me/tasks' && !options.method) {
        return jsonResponse({
          currentUser: appUsers[1],
          organization: { id: 'wee-coder-labs', name: 'WeeCoder Labs' },
          openTaskCount: 1,
          projectCount: 1,
          tasks: [
            {
              id: 'pm-requirements-target-users',
              projectId: 'demo-1',
              projectName: '客户门户',
              stageId: 'pm-requirements',
              stageName: '项目经理需求',
              itemId: 'target-users',
              title: '追问：目标用户与核心场景',
              status: 'open',
            },
          ],
          inbox: { openTaskCount: 1, groups: [], currentUserGroups: [] },
        });
      }
      if (url === '/api/projects' && !options.method) {
        return jsonResponse({ projects: [projectSummary] });
      }
      if (url === '/api/projects/demo-1' && !options.method) {
        return jsonResponse({ project: confirmationProject });
      }
      if (url === '/api/projects/demo-1/task-comments' && options.method === 'POST') {
        expect(JSON.parse(options.body)).toMatchObject({
          stageId: 'pm-requirements',
          itemId: 'target-users',
          comment: '已经约业务负责人确认保安巡检场景。',
        });
        return jsonResponse({ project: commentedProject });
      }
      return jsonResponse({ error: 'not found' }, 404);
    });

    render(<App />);

    fireEvent.click(await screen.findByRole('button', { name: '处理我的待办 追问：目标用户与核心场景' }));
    const taskDetail = await screen.findByLabelText('任务详情');
    fireEvent.change(within(taskDetail).getByLabelText('任务备注'), {
      target: { value: '已经约业务负责人确认保安巡检场景。' },
    });
    fireEvent.click(within(taskDetail).getByRole('button', { name: '提交备注' }));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/projects/demo-1/task-comments',
        expect.objectContaining({
          body: expect.stringContaining('已经约业务负责人确认保安巡检场景。'),
        }),
      );
    });
    fireEvent.click(screen.getByRole('tab', { name: '动态' }));
    const auxiliaryPanels = screen.getByLabelText('辅助信息面板');
    fireEvent.click(within(auxiliaryPanels).getByText('辅助信息'));
    const evidencePanel = within(auxiliaryPanels).getByLabelText('证据风险面板');
    if (!evidencePanel.hasAttribute('open')) {
      fireEvent.click(within(evidencePanel).getByText('证据与风险'));
    }
    fireEvent.click(screen.getByRole('button', { name: '展开流转记录' }));
    expect(await screen.findByText('任务备注：已经约业务负责人确认保安巡检场景。')).toBeInTheDocument();
    const refreshedTaskDetail = screen.getByLabelText('任务详情');
    expect(within(refreshedTaskDetail).getByText('沟通记录')).toBeInTheDocument();
    expect(within(refreshedTaskDetail).getByText('项目经理 · 2026-06-17T02:00:00.000Z')).toBeInTheDocument();
    expect(within(refreshedTaskDetail).getByText('已经约业务负责人确认保安巡检场景。')).toBeInTheDocument();
  });

  test('shows an organization overview for owner users', async () => {
    window.localStorage.setItem(
      'wee-coder-session',
      JSON.stringify({ token: 'owner-token', user: appUsers[0] }),
    );

    render(<App />);

    expect(await screen.findByLabelText('组织总览')).toBeInTheDocument();
    expect(screen.getByLabelText('组织活跃项目')).toHaveTextContent('1');
    expect(screen.getByLabelText('组织风险项目')).toHaveTextContent('0');
    expect(screen.getByLabelText('组织待办阻塞')).toHaveTextContent('2');
    expect(screen.getByLabelText('组织后台任务')).toHaveTextContent('3');
    expect(screen.queryByLabelText('个人工作台')).not.toBeInTheDocument();
  });

  test('shows owner role flow bottlenecks in the organization overview', async () => {
    window.localStorage.setItem(
      'wee-coder-session',
      JSON.stringify({ token: 'owner-token', user: appUsers[0] }),
    );
    const ownerRoleFlowPlatform = {
      ...platformCockpit,
      governance: {
        ...platformCockpit.governance,
        ownerRoleFlow: {
          summary: {
            projectCount: 2,
            roleCount: 2,
            blockedProjectCount: 1,
            openTaskCount: 4,
            criticalRoleCount: 1,
            warningRoleCount: 1,
            staleProjectCount: 2,
            escalatedRoleCount: 1,
            maxStaleHours: 24,
            nextAction: 'Focus PM: 1 blocked project and 3 open tasks.',
            escalationNextAction: 'Escalate PM: Camera Monitor is overdue by 24 hours.',
          },
          roleGroups: [
            {
              role: 'pm',
              roleLabel: 'PM',
              projectCount: 1,
              blockedProjectCount: 1,
              openTaskCount: 3,
              bottleneckLevel: 'critical',
              escalationLevel: 'escalated',
              staleProjectCount: 1,
              escalatedProjectCount: 1,
              maxStaleHours: 24,
              nextAction: 'Collect RTSP sample evidence before PRD approval.',
            },
            {
              role: 'qa',
              roleLabel: 'QA',
              projectCount: 1,
              blockedProjectCount: 0,
              openTaskCount: 1,
              bottleneckLevel: 'warning',
              escalationLevel: 'watch',
              staleProjectCount: 1,
              escalatedProjectCount: 0,
              maxStaleHours: 6,
              nextAction: 'QA should publish verification evidence.',
            },
          ],
        },
        ownerEscalationDigest: {
          summary: {
            messageCount: 2,
            escalatedMessageCount: 1,
            watchMessageCount: 1,
            recipientCount: 2,
            nextAction: 'Send 1 escalated role handoff message before the next delivery gate review.',
          },
          messages: [
            {
              id: 'owner-escalation-pm-camera',
              role: 'pm',
              roleLabel: 'PM',
              recipientUserId: 'pm-lin',
              recipientName: 'Lin PM',
              projectId: 'camera',
              projectName: 'Camera Monitor',
              stageName: 'PM requirements',
              escalationLevel: 'escalated',
              overdueHours: 24,
              channel: 'in-app',
              status: 'ready-to-send',
              subject: 'Escalate PM handoff: Camera Monitor overdue 24h',
              body: 'PM: Camera Monitor is overdue by 24h. Collect RTSP sample evidence before PRD approval.',
            },
            {
              id: 'owner-escalation-qa-qa-portal',
              role: 'qa',
              roleLabel: 'QA',
              recipientUserId: 'qa-zhao',
              recipientName: 'Zhao QA',
              projectId: 'qa-portal',
              projectName: 'QA Portal',
              stageName: 'QA verification',
              escalationLevel: 'watch',
              overdueHours: 6,
              channel: 'in-app',
              status: 'ready-to-send',
              subject: 'Watch QA handoff: QA Portal overdue 6h',
              body: 'QA: QA Portal is overdue by 6h. QA should publish verification evidence.',
            },
          ],
        },
      },
    };
    const sentEscalationPlatform = {
      ...ownerRoleFlowPlatform,
      governance: {
        ...ownerRoleFlowPlatform.governance,
        ownerEscalationDigest: {
          summary: {
            messageCount: 2,
            escalatedMessageCount: 1,
            watchMessageCount: 1,
            recipientCount: 2,
            sentMessageCount: 1,
            readyMessageCount: 1,
            nextAction: 'Prepare 1 watch role handoff message.',
          },
          messages: [
            {
              ...ownerRoleFlowPlatform.governance.ownerEscalationDigest.messages[0],
              status: 'sent',
              sentBy: 'AA',
              sentByUserId: 'owner-aa',
              sentAt: '2026-06-18T05:00:00.000Z',
            },
            ownerRoleFlowPlatform.governance.ownerEscalationDigest.messages[1],
          ],
        },
      },
    };
    let currentPlatform = ownerRoleFlowPlatform;
    const requestBodies = [];
    global.fetch = vi.fn(async (url, options = {}) => {
      if (url === '/api/users' && !options.method) {
        return jsonResponse({ users: appUsers, currentUser: appUsers[0] });
      }
      if (url === '/api/platform' && !options.method) {
        return jsonResponse({ platform: currentPlatform });
      }
      if (url === '/api/projects' && !options.method) {
        return jsonResponse({ projects: [projectSummary] });
      }
      if (url === '/api/projects/demo-1' && !options.method) {
        return jsonResponse({ project: baseProject });
      }
      if (
        url === '/api/projects/camera/owner-escalations/owner-escalation-pm-camera/send' &&
        options.method === 'POST'
      ) {
        const body = JSON.parse(options.body);
        requestBodies.push(body);
        currentPlatform = sentEscalationPlatform;
        return jsonResponse({
          project: { ...baseProject, id: 'camera', name: 'Camera Monitor' },
          platform: currentPlatform,
        });
      }
      return jsonResponse({ error: 'not found' }, 404);
    });

    render(<App />);

    const organizationDetails = await screen.findByLabelText('组织详情');
    expect(within(organizationDetails).getByText('角色 2 · 消息 2 · 健康风险 0')).toBeInTheDocument();
    expect(within(organizationDetails).queryByText('角色流转')).not.toBeInTheDocument();
    expect(within(organizationDetails).queryByText('提醒消息')).not.toBeInTheDocument();
    fireEvent.click(within(organizationDetails).getByText('组织详情'));
    const ownerRoleFlow = await screen.findByLabelText('角色流转');
    expect(within(ownerRoleFlow).getByText('2 个项目 · 2 个角色 · 阻塞 1')).toBeInTheDocument();
    expect(within(ownerRoleFlow).getByText('项目经理 · 1 个项目 · 待办 3')).toBeInTheDocument();
    expect(within(ownerRoleFlow).getByText('升级：已升级 · 超时 24 小时 · 停滞 1')).toBeInTheDocument();
    expect(within(ownerRoleFlow).getByText('测试 · 1 个项目 · 待办 1')).toBeInTheDocument();
    expect(within(ownerRoleFlow).getByText('升级：观察 · 超时 6 小时 · 停滞 1')).toBeInTheDocument();
    expect(within(ownerRoleFlow).getByText('聚焦项目经理：1 个阻塞项目，3 个待办。')).toBeInTheDocument();
    expect(within(ownerRoleFlow).getByText('升级项目经理：Camera Monitor 已超时 24 小时。')).toBeInTheDocument();
    const escalationDigest = screen.getByLabelText('升级提醒');
    expect(within(escalationDigest).getByText('2 条消息 · 2 个接收人')).toBeInTheDocument();
    expect(within(escalationDigest).getByText('项目经理 · Camera Monitor · 超时 24 小时')).toBeInTheDocument();
    expect(within(escalationDigest).getByText('待发送给 Lin PM')).toBeInTheDocument();
    expect(
      within(escalationDigest).getByText(
        '项目经理：Camera Monitor 已超时 24 小时。需求文档审批前收集 RTSP 样本证据。',
      ),
    ).toBeInTheDocument();
    expect(within(escalationDigest).getByText('下次交付闸口复核前发送 1 条升级角色交接提醒。')).toBeInTheDocument();
    fireEvent.click(
      within(escalationDigest).getByRole('button', {
        name: '发送升级提醒 升级项目经理交接：Camera Monitor 超时 24 小时',
      }),
    );

    await waitFor(() => {
      expect(requestBodies[0]).toMatchObject({
        role: 'pm',
        roleLabel: 'PM',
        recipientUserId: 'pm-lin',
        subject: 'Escalate PM handoff: Camera Monitor overdue 24h',
        body: 'PM: Camera Monitor is overdue by 24h. Collect RTSP sample evidence before PRD approval.',
      });
    });
    const refreshedDigest = await screen.findByLabelText('升级提醒');
    expect(within(refreshedDigest).getByText('已由 AA 发送')).toBeInTheDocument();
    expect(
      within(refreshedDigest).getByRole('button', {
        name: '已发送升级提醒 升级项目经理交接：Camera Monitor 超时 24 小时',
      }),
    ).toBeDisabled();
  });

  test('shows actionable team notification items in the commercial cockpit', async () => {
    window.localStorage.setItem(
      'wee-coder-session',
      JSON.stringify({ token: 'owner-token', user: appUsers[0] }),
    );
    const notificationPlatform = {
      ...platformCockpit,
      governance: {
        ...platformCockpit.governance,
        notifications: {
          channels: [
            { id: 'in-app', name: 'In-app', status: 'ready' },
            { id: 'feishu', name: 'Feishu', status: 'config-needed' },
          ],
          pendingItems: 1,
          urgentItems: 1,
          acknowledgedItems: 1,
          recentAcknowledgements: [
            {
              id: 'notification-camera-pm-requirements-pm-lin-pm-previous',
              projectId: 'camera',
              projectName: 'Camera Monitor',
              acknowledgedBy: 'Lin PM',
              acknowledgedAt: '2026-06-18T04:00:00.000Z',
              note: 'PM accepted a previous RTSP follow-up.',
            },
          ],
          items: [
            {
              id: 'notification-camera-pm-requirements-pm-lin-pm-rtsp',
              severity: 'high',
              audienceRole: 'pm',
              audienceRoleLabel: 'PM',
              audienceUserId: 'pm-lin',
              audienceName: 'Lin PM',
              projectId: 'camera',
              projectName: 'Camera Monitor',
              stageId: 'pm-requirements',
              stageName: 'PM requirements',
              title: 'Clarify RTSP test samples',
              nextAction: 'Collect RTSP test evidence.',
              reason: 'Stage gate blocked by 2 item(s).',
            },
          ],
        },
      },
    };
    global.fetch = vi.fn(async (url, options = {}) => {
      if (url === '/api/users' && !options.method) {
        return jsonResponse({ users: appUsers, currentUser: appUsers[0] });
      }
      if (url === '/api/platform' && !options.method) {
        return jsonResponse({ platform: notificationPlatform });
      }
      if (url === '/api/projects' && !options.method) {
        return jsonResponse({ projects: [projectSummary] });
      }
      if (url === '/api/projects/demo-1' && !options.method) {
        return jsonResponse({ project: baseProject });
      }
      return jsonResponse({ error: 'not found' }, 404);
    });

    render(<App />);
    await openOperationsConsole();
    fireEvent.click(screen.getByRole('tab', { name: '审计与 SLA' }));

    const notificationCard = (await screen.findByText('团队通知与 SLA')).closest('article');
    const notificationDetails = within(notificationCard).getByLabelText('通知与 SLA 明细');
    expect(notificationDetails.tagName).toBe('DETAILS');
    expect(notificationDetails).not.toHaveAttribute('open');
    expect(within(notificationDetails).getByText('通知与 SLA 明细')).toBeVisible();
    expect(within(notificationDetails).getByText('通知 1 · SLA 1 · 动作 0')).toBeVisible();
    expect(within(notificationDetails).getByText('高 · 项目经理')).not.toBeVisible();
    fireEvent.click(within(notificationDetails).getByText('通知与 SLA 明细'));
    expect(notificationDetails).toHaveAttribute('open');
    expect(within(notificationDetails).getByText('高 · 项目经理')).toBeVisible();
    expect(within(notificationDetails).getByText('Camera Monitor · 项目经理需求')).toBeVisible();
    expect(within(notificationDetails).getByText('收集 RTSP 测试证据。')).toBeVisible();
    expect(within(notificationDetails).getByText('已确认 1')).toBeVisible();
    expect(within(notificationDetails).getByText('Lin 项目经理已确认 Camera Monitor')).toBeVisible();
    expect(within(notificationDetails).getByText('项目经理已确认上一条 RTSP 跟进。')).toBeVisible();
  });

  test('shows notification action center grouped by accountable role', async () => {
    window.localStorage.setItem(
      'wee-coder-session',
      JSON.stringify({ token: 'owner-token', user: appUsers[0] }),
    );
    const notificationPlatform = {
      ...platformCockpit,
      governance: {
        ...platformCockpit.governance,
        notifications: {
          ...platformCockpit.governance.notifications,
          pendingItems: 0,
          actionCenter: {
            totalActionCount: 3,
            highSeverityCount: 3,
            roleGroupCount: 3,
            nextAction: 'Route high severity notification actions to the accountable roles before approving delivery gates.',
            roleGroups: [
              { targetRole: 'tech-lead', targetRoleLabel: 'Tech Lead', count: 1, highSeverityCount: 1 },
              { targetRole: 'owner', targetRoleLabel: 'Owner', count: 1, highSeverityCount: 1 },
              { targetRole: 'pm', targetRoleLabel: 'PM', count: 1, highSeverityCount: 1 },
            ],
            items: [
              {
                id: 'notification-action-job-job-code-review',
                source: 'platform-job',
                severity: 'high',
                targetRole: 'tech-lead',
                targetRoleLabel: 'Tech Lead',
                projectName: 'Camera Monitor',
                title: 'Code review failed',
                detail: 'Dependency audit failed.',
                nextAction: 'Tech lead should review failed job evidence and decide whether to retry or route a fix.',
              },
              {
                id: 'notification-action-security-audit-denied-review',
                source: 'security-audit',
                severity: 'high',
                targetRole: 'owner',
                targetRoleLabel: 'Owner',
                projectName: 'Camera Monitor',
                title: 'Permission denied: run-code-review',
                detail: 'PM cannot run code review.',
                nextAction: 'Owner should review the denied action, role assignment, and allowed roles.',
              },
              {
                id: 'notification-action-sla-camera',
                source: 'sla',
                severity: 'high',
                targetRole: 'pm',
                targetRoleLabel: 'PM',
                projectName: 'Camera Monitor',
                title: 'SLA breach: PM requirements',
                detail: '24h overdue.',
                nextAction: 'PM should resolve requirement blockers and update the PRD inputs.',
              },
            ],
          },
        },
      },
    };
    global.fetch = vi.fn(async (url, options = {}) => {
      if (url === '/api/users' && !options.method) {
        return jsonResponse({ users: appUsers, currentUser: appUsers[0] });
      }
      if (url === '/api/platform' && !options.method) {
        return jsonResponse({ platform: notificationPlatform });
      }
      if (url === '/api/projects' && !options.method) {
        return jsonResponse({ projects: [projectSummary] });
      }
      if (url === '/api/projects/demo-1' && !options.method) {
        return jsonResponse({ project: baseProject });
      }
      return jsonResponse({ error: 'not found' }, 404);
    });

    render(<App />);
    await openOperationsConsole();

    const notificationCard = (await screen.findByText('团队通知与 SLA')).closest('article');
    expect(screen.queryByLabelText('Notification action center')).not.toBeInTheDocument();
    expect(within(notificationCard).getByLabelText('通知动作中心')).toBeInTheDocument();
    expect(within(notificationCard).getByText('动作中心')).toBeInTheDocument();
    expect(within(notificationCard).getByText('动作 3 · 高优先级 3 · 角色 3')).toBeInTheDocument();
    expect(within(notificationCard).getByText('技术负责人 1 / 高优先级 1')).toBeInTheDocument();
    expect(within(notificationCard).getByText('负责人 1 / 高优先级 1')).toBeInTheDocument();
    expect(within(notificationCard).getByText('项目经理 1 / 高优先级 1')).toBeInTheDocument();
    expect(within(notificationCard).getByText('高 · 技术负责人 · 后台任务')).toBeInTheDocument();
    expect(within(notificationCard).getByText('代码评审失败')).toBeInTheDocument();
    expect(within(notificationCard).getByText('依赖审计失败。')).toBeInTheDocument();
    expect(within(notificationCard).getByText('技术负责人需要复核失败任务证据，并决定重试或进入修复。')).toBeInTheDocument();
    expect(within(notificationCard).getByText('审批交付闸口前，将高优先级通知动作分派给对应角色。')).toBeInTheDocument();
  });

  test('updates notification action assignment and resolution from the commercial cockpit', async () => {
    window.localStorage.setItem(
      'wee-coder-session',
      JSON.stringify({ token: 'owner-token', user: appUsers[0] }),
    );
    const actionId = 'notification-action-sla-camera-pm-requirements';
    const actionItem = {
      id: actionId,
      source: 'sla',
      severity: 'high',
      status: 'open',
      statusLabel: 'Open',
      targetRole: 'pm',
      targetRoleLabel: 'PM',
      projectId: 'camera',
      projectName: 'Camera Monitor',
      title: 'SLA breach: PM requirements',
      detail: '24h overdue.',
      nextAction: 'PM should resolve requirement blockers and update the PRD inputs.',
    };
    const makePlatform = (actionCenter) => ({
      ...platformCockpit,
      governance: {
        ...platformCockpit.governance,
        notifications: {
          ...platformCockpit.governance.notifications,
          pendingItems: 0,
          actionCenter,
        },
      },
    });
    const initialPlatform = makePlatform({
      totalActionCount: 1,
      highSeverityCount: 1,
      acknowledgedActionCount: 0,
      assignedActionCount: 0,
      resolvedActionCount: 0,
      roleGroupCount: 1,
      nextAction: 'Route high severity notification actions to the accountable roles before approving delivery gates.',
      roleGroups: [{ targetRole: 'pm', targetRoleLabel: 'PM', count: 1, highSeverityCount: 1 }],
      items: [actionItem],
      recentUpdates: [],
    });
    const assignedPlatform = makePlatform({
      totalActionCount: 1,
      highSeverityCount: 1,
      acknowledgedActionCount: 0,
      assignedActionCount: 1,
      resolvedActionCount: 0,
      roleGroupCount: 1,
      nextAction: 'Route high severity notification actions to the accountable roles before approving delivery gates.',
      roleGroups: [{ targetRole: 'pm', targetRoleLabel: 'PM', count: 1, highSeverityCount: 1 }],
      items: [{ ...actionItem, status: 'assigned', statusLabel: 'Assigned', assigneeName: 'Lin PM' }],
      recentUpdates: [
        { id: actionId, status: 'assigned', statusLabel: 'Assigned', projectName: 'Camera Monitor', assigneeName: 'Lin PM' },
      ],
      processingLedger: {
        totalEventCount: 2,
        actionCount: 1,
        actorCount: 1,
        acknowledgedCount: 1,
        assignedCount: 1,
        resolvedCount: 0,
        latestAt: '2026-06-18T04:05:00.000Z',
        rows: [
          {
            id: 'audit-notification-action-assigned',
            notificationId: actionId,
            status: 'assigned',
            statusLabel: 'Assigned',
            actor: 'Owner AA',
            projectName: 'Camera Monitor',
            assigneeName: 'Lin PM',
            note: 'Route requirement blockers to PM.',
            at: '2026-06-18T04:05:00.000Z',
          },
          {
            id: 'audit-notification-action-acknowledged',
            notificationId: actionId,
            status: 'acknowledged',
            statusLabel: 'Acknowledged',
            actor: 'Owner AA',
            projectName: 'Camera Monitor',
            note: 'Owner accepted the SLA breach.',
            at: '2026-06-18T04:00:00.000Z',
          },
        ],
      },
    });
    const resolvedPlatform = makePlatform({
      totalActionCount: 0,
      highSeverityCount: 0,
      acknowledgedActionCount: 0,
      assignedActionCount: 0,
      resolvedActionCount: 1,
      roleGroupCount: 0,
      nextAction: 'No notification actions require routing.',
      roleGroups: [],
      items: [],
      recentUpdates: [
        {
          id: actionId,
          status: 'resolved',
          statusLabel: 'Resolved',
          projectName: 'Camera Monitor',
          assigneeName: 'Lin PM',
          resolution: 'Resolved from cockpit.',
        },
      ],
      processingLedger: {
        totalEventCount: 3,
        actionCount: 1,
        actorCount: 2,
        acknowledgedCount: 1,
        assignedCount: 1,
        resolvedCount: 1,
        latestAt: '2026-06-18T05:00:00.000Z',
        rows: [
          {
            id: 'audit-notification-action-resolved',
            notificationId: actionId,
            status: 'resolved',
            statusLabel: 'Resolved',
            actor: 'Lin PM',
            projectName: 'Camera Monitor',
            assigneeName: 'Lin PM',
            note: 'Resolved from cockpit.',
            at: '2026-06-18T05:00:00.000Z',
          },
        ],
      },
    });
    let currentPlatform = initialPlatform;
    const requestBodies = [];
    global.fetch = vi.fn(async (url, options = {}) => {
      if (url === '/api/users' && !options.method) {
        return jsonResponse({ users: appUsers, currentUser: appUsers[0] });
      }
      if (url === '/api/platform' && !options.method) {
        return jsonResponse({ platform: currentPlatform });
      }
      if (url === '/api/projects' && !options.method) {
        return jsonResponse({ projects: [{ ...projectSummary, id: 'camera', name: 'Camera Monitor' }] });
      }
      if (url === '/api/projects/camera' && !options.method) {
        return jsonResponse({ project: { ...baseProject, id: 'camera', name: 'Camera Monitor' } });
      }
      if (url === `/api/projects/camera/notification-actions/${actionId}` && options.method === 'POST') {
        const body = JSON.parse(options.body);
        requestBodies.push(body);
        currentPlatform = body.status === 'resolved' ? resolvedPlatform : assignedPlatform;
        return jsonResponse({
          project: { ...baseProject, id: 'camera', name: 'Camera Monitor', updatedAt: '2026-06-18T05:00:00.000Z' },
          platform: currentPlatform,
        });
      }
      return jsonResponse({ error: 'not found' }, 404);
    });

    render(<App />);
    await openOperationsConsole();

    const actionCenter = (await screen.findByText('动作中心')).closest('section');
    fireEvent.click(within(actionCenter).getByRole('button', { name: '分派给 项目经理' }));

    await waitFor(() => {
      expect(requestBodies[0]).toMatchObject({
        status: 'assigned',
        assigneeRole: 'pm',
        assigneeName: 'PM',
      });
    });
    await waitFor(() => {
      expect(screen.getAllByText('已分派 · Lin PM').length).toBeGreaterThan(0);
    });

    fireEvent.click(screen.getByRole('button', { name: '解决 SLA 超时：项目经理需求' }));

    await waitFor(() => {
      expect(requestBodies[1]).toMatchObject({
        status: 'resolved',
        resolution: 'Resolved from cockpit.',
      });
    });
    expect(await screen.findByText('最近更新')).toBeInTheDocument();
    expect(screen.getByText('已解决 · Lin PM')).toBeInTheDocument();
    expect(screen.getByText('已在控制台解决。')).toBeInTheDocument();
    expect(screen.getByText('动作历史')).toBeInTheDocument();
    expect(screen.getByText('事件 3 · 动作 1 · 操作人 2')).toBeInTheDocument();
    expect(screen.getByText('已解决 · Lin PM · Camera Monitor')).toBeInTheDocument();
  });

  test('hides operations navigation from users without administration permission', async () => {
    window.localStorage.setItem(
      'wee-coder-session',
      JSON.stringify({
        token: 'pm-token',
        user: appUsers[1],
        authMode: 'strict',
        allowUserSwitching: false,
      }),
    );
    const actionId = 'notification-action-sla-camera-pm-requirements';
    const actionItem = {
      id: actionId,
      source: 'sla',
      severity: 'high',
      status: 'open',
      statusLabel: 'Open',
      targetRole: 'pm',
      targetRoleLabel: 'PM',
      projectId: 'camera',
      projectName: 'Camera Monitor',
      title: 'SLA breach: PM requirements',
      detail: '24h overdue.',
      nextAction: 'PM should resolve requirement blockers and update the PRD inputs.',
    };
    const pmPlatform = {
      ...platformCockpit,
      session: {
        ...platformCockpit.session,
        authMode: 'strict',
        allowUserSwitching: false,
        currentUser: appUsers[1],
      },
      governance: {
        ...platformCockpit.governance,
        notifications: {
          ...platformCockpit.governance.notifications,
          pendingItems: 0,
          actionCenter: {
            totalActionCount: 1,
            highSeverityCount: 1,
            acknowledgedActionCount: 0,
            assignedActionCount: 0,
            resolvedActionCount: 0,
            roleGroupCount: 1,
            nextAction: 'Route high severity notification actions to the accountable roles before approving delivery gates.',
            roleGroups: [{ targetRole: 'pm', targetRoleLabel: 'PM', count: 1, highSeverityCount: 1 }],
            items: [actionItem],
            recentUpdates: [],
          },
        },
      },
    };
    global.fetch = vi.fn(async (url, options = {}) => {
      if (url === '/api/users' && !options.method) {
        return jsonResponse({ users: appUsers, currentUser: appUsers[1] });
      }
      if (url === '/api/platform' && !options.method) {
        return jsonResponse({ platform: pmPlatform });
      }
      if (url === '/api/projects' && !options.method) {
        return jsonResponse({ projects: [{ ...projectSummary, id: 'camera', name: 'Camera Monitor' }] });
      }
      if (url === '/api/projects/camera' && !options.method) {
        return jsonResponse({ project: { ...baseProject, id: 'camera', name: 'Camera Monitor' } });
      }
      return jsonResponse({ error: 'not found' }, 404);
    });

    render(<App />);

    expect(await screen.findByLabelText('个人工作台')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '运营后台' })).not.toBeInTheDocument();
  });

  test('shows SLA breach severity owner groups and next actions in the commercial cockpit', async () => {
    window.localStorage.setItem(
      'wee-coder-session',
      JSON.stringify({ token: 'owner-token', user: appUsers[0] }),
    );
    const slaPlatform = {
      ...platformCockpit,
      governance: {
        ...platformCockpit.governance,
        sla: {
          breachedCount: 2,
          criticalCount: 1,
          warningCount: 1,
          blockedFollowupCount: 3,
          nextAction: 'Escalate critical SLA breaches to the owner role and require an updated unblock plan.',
          breaches: [
            {
              projectId: 'camera',
              projectName: 'Camera Monitor',
              stageId: 'pm-requirements',
              stageName: 'PM requirements',
              ownerRole: 'pm',
              ownerRoleLabel: 'PM',
              ownerUserId: 'pm-lin',
              ownerName: 'Lin PM',
              severity: 'critical',
              ageHours: 72,
              thresholdHours: 48,
              overdueHours: 24,
              nextAction: 'PM should resolve requirement blockers and update the PRD inputs.',
            },
            {
              projectId: 'qa-portal',
              projectName: 'QA Portal',
              stageId: 'qa',
              stageName: 'QA verification',
              ownerRole: 'qa',
              ownerRoleLabel: 'QA',
              ownerUserId: 'qa-zhao',
              ownerName: 'Zhao QA',
              severity: 'warning',
              ageHours: 30,
              thresholdHours: 24,
              overdueHours: 6,
              nextAction: 'QA should publish verification evidence or route defects back to development.',
            },
          ],
          ownerGroups: [
            { ownerRole: 'pm', ownerRoleLabel: 'PM', breachCount: 1, criticalCount: 1, warningCount: 0 },
            { ownerRole: 'qa', ownerRoleLabel: 'QA', breachCount: 1, criticalCount: 0, warningCount: 1 },
          ],
          thresholds: {},
        },
      },
    };
    global.fetch = vi.fn(async (url, options = {}) => {
      if (url === '/api/users' && !options.method) {
        return jsonResponse({ users: appUsers, currentUser: appUsers[0] });
      }
      if (url === '/api/platform' && !options.method) {
        return jsonResponse({ platform: slaPlatform });
      }
      if (url === '/api/projects' && !options.method) {
        return jsonResponse({ projects: [projectSummary] });
      }
      if (url === '/api/projects/demo-1' && !options.method) {
        return jsonResponse({ project: baseProject });
      }
      return jsonResponse({ error: 'not found' }, 404);
    });

    render(<App />);
    await openOperationsConsole();

    const slaCard = (await screen.findByText('团队通知与 SLA')).closest('article');
    expect(within(slaCard).getByText('高风险 1')).toBeInTheDocument();
    expect(within(slaCard).getByText('需关注 1')).toBeInTheDocument();
    expect(within(slaCard).getByText('项目经理 1 次超时 / 高风险 1')).toBeInTheDocument();
    expect(within(slaCard).getByText('测试 1 次超时 / 需关注 1')).toBeInTheDocument();
    expect(within(slaCard).getByText('Camera Monitor · 项目经理需求')).toBeInTheDocument();
    expect(within(slaCard).getByText('高 · 项目经理 · 超时 24 小时')).toBeInTheDocument();
    expect(within(slaCard).getByText('项目经理需要处理需求阻塞，并更新需求文档输入。')).toBeInTheDocument();
  });

  test('shows owner portfolio rows in the commercial cockpit', async () => {
    window.localStorage.setItem(
      'wee-coder-session',
      JSON.stringify({ token: 'owner-token', user: appUsers[0] }),
    );
    const ownerPortfolioPlatform = {
      ...platformCockpit,
      governance: {
        ...platformCockpit.governance,
        ownerPortfolio: {
          summary: {
            projectCount: 2,
            criticalProjectCount: 1,
            warningProjectCount: 1,
            blockedProjectCount: 1,
            overBudgetProjectCount: 1,
          },
          rows: [
            {
              projectId: 'camera',
              projectName: 'Camera Monitor',
              stageId: 'pm-requirements',
              stageName: 'PM requirements',
              ownerRole: 'pm',
              ownerRoleLabel: 'PM',
              ownerName: 'Lin PM',
              healthLevel: 'critical',
              healthScore: 30,
              slaSeverity: 'critical',
              slaOverdueHours: 24,
              costTotalEstimatedCny: 10.1,
              budgetStatus: 'over-budget',
              nextAction: 'Collect RTSP sample evidence before PRD approval.',
            },
            {
              projectId: 'qa-portal',
              projectName: 'QA Portal',
              stageId: 'qa',
              stageName: 'QA verification',
              ownerRole: 'qa',
              ownerRoleLabel: 'QA',
              ownerName: 'Zhao QA',
              healthLevel: 'warning',
              healthScore: 64,
              slaSeverity: 'warning',
              slaOverdueHours: 6,
              costTotalEstimatedCny: 1.4,
              budgetStatus: 'within-budget',
              nextAction: 'QA should publish verification evidence or route defects back to development.',
            },
          ],
        },
      },
    };
    global.fetch = vi.fn(async (url, options = {}) => {
      if (url === '/api/users' && !options.method) {
        return jsonResponse({ users: appUsers, currentUser: appUsers[0] });
      }
      if (url === '/api/platform' && !options.method) {
        return jsonResponse({ platform: ownerPortfolioPlatform });
      }
      if (url === '/api/projects' && !options.method) {
        return jsonResponse({ projects: [projectSummary] });
      }
      if (url === '/api/projects/demo-1' && !options.method) {
        return jsonResponse({ project: baseProject });
      }
      return jsonResponse({ error: 'not found' }, 404);
    });

    render(<App />);
    await openOperationsConsole();

    const portfolioCard = (await screen.findByText('老板项目组合')).closest('article');
    expect(within(portfolioCard).getByText('2 个项目 · 高风险 1 · 需关注 1')).toBeInTheDocument();
    expect(within(portfolioCard).getByText('阻塞 1 · 超预算 1')).toBeInTheDocument();
    const portfolioDetails = within(portfolioCard).getByLabelText('老板项目组合明细');
    expect(portfolioDetails.tagName).toBe('DETAILS');
    expect(portfolioDetails).not.toHaveAttribute('open');
    expect(within(portfolioDetails).getByText('老板项目组合明细')).toBeVisible();
    expect(within(portfolioDetails).getByText('QA Portal · 测试验证')).not.toBeVisible();
    fireEvent.click(within(portfolioDetails).getByText('老板项目组合明细'));
    expect(portfolioDetails).toHaveAttribute('open');
    expect(within(portfolioDetails).getByText('Camera Monitor · 项目经理需求')).toBeVisible();
    expect(within(portfolioDetails).getByText('项目经理 · 高风险 · SLA 高 · 超时 24 小时')).toBeVisible();
    expect(within(portfolioDetails).getByText('¥10.1 · 超预算')).toBeVisible();
    expect(within(portfolioDetails).getByText('需求文档审批前收集 RTSP 样本证据。')).toBeVisible();
    expect(within(portfolioDetails).getByText('QA Portal · 测试验证')).toBeVisible();
    expect(within(portfolioDetails).getByText('测试 · 需关注 · SLA 中 · 超时 6 小时')).toBeVisible();
  });

  test('shows end-to-end delivery closure in the commercial cockpit', async () => {
    window.localStorage.setItem(
      'wee-coder-session',
      JSON.stringify({ token: 'owner-token', user: appUsers[0] }),
    );
    const deliveryClosurePlatform = {
      ...platformCockpit,
      governance: {
        ...platformCockpit.governance,
        deliveryClosure: {
          summary: {
            projectCount: 2,
            signedOffProjectCount: 1,
            qaReturnProjectCount: 1,
            blockedProjectCount: 1,
            readyForSignoffProjectCount: 0,
            averageCompletionPercent: 79,
          },
          rows: [
            {
              projectId: 'qa-return-camera',
              projectName: 'QA Return Camera',
              status: 'qa-return',
              currentGateId: 'qa',
              currentGateLabel: 'QA',
              completionPercent: 57,
              missingGateIds: ['qa', 'acceptance', 'signoff'],
              nextAction: 'Route QA defects back to development and regenerate a fix plan.',
              gates: [
                { id: 'requirements', label: 'Requirements', status: 'complete' },
                { id: 'prd', label: 'PRD', status: 'complete' },
                { id: 'development', label: 'Development', status: 'complete' },
                { id: 'review', label: 'Review', status: 'complete' },
                { id: 'qa', label: 'QA', status: 'blocked' },
                { id: 'acceptance', label: 'Acceptance', status: 'missing' },
                { id: 'signoff', label: 'Sign-off', status: 'missing' },
              ],
            },
            {
              projectId: 'signed-off-camera',
              projectName: 'Signed Off Camera',
              status: 'signed-off',
              currentGateId: 'signoff',
              currentGateLabel: 'Sign-off',
              completionPercent: 100,
              missingGateIds: [],
              nextAction: 'Project is signed off. Archive evidence and monitor production readiness.',
              gates: [
                { id: 'requirements', label: 'Requirements', status: 'complete' },
                { id: 'prd', label: 'PRD', status: 'complete' },
                { id: 'development', label: 'Development', status: 'complete' },
                { id: 'review', label: 'Review', status: 'complete' },
                { id: 'qa', label: 'QA', status: 'complete' },
                { id: 'acceptance', label: 'Acceptance', status: 'complete' },
                { id: 'signoff', label: 'Sign-off', status: 'complete' },
              ],
            },
          ],
        },
      },
    };
    global.fetch = vi.fn(async (url, options = {}) => {
      if (url === '/api/users' && !options.method) {
        return jsonResponse({ users: appUsers, currentUser: appUsers[0] });
      }
      if (url === '/api/platform' && !options.method) {
        return jsonResponse({ platform: deliveryClosurePlatform });
      }
      if (url === '/api/projects' && !options.method) {
        return jsonResponse({ projects: [projectSummary] });
      }
      if (url === '/api/projects/demo-1' && !options.method) {
        return jsonResponse({ project: baseProject });
      }
      return jsonResponse({ error: 'not found' }, 404);
    });

    render(<App />);
    await openOperationsConsole();

    const closureCard = (await screen.findByText('端到端交付闭环')).closest('article');
    expect(within(closureCard).getByText('2 个项目 · 平均完成 79%')).toBeInTheDocument();
    expect(within(closureCard).getByText('已验收 1 · 测试回流 1 · 阻塞 1')).toBeInTheDocument();
    const closureDetails = within(closureCard).getByLabelText('交付闭环明细');
    expect(closureDetails.tagName).toBe('DETAILS');
    expect(closureDetails).not.toHaveAttribute('open');
    expect(within(closureDetails).getByText('交付闭环明细')).toBeVisible();
    expect(within(closureDetails).getByText('Signed Off Camera · 100% · 已验收')).not.toBeVisible();
    fireEvent.click(within(closureDetails).getByText('交付闭环明细'));
    expect(closureDetails).toHaveAttribute('open');
    expect(within(closureDetails).getByText('QA Return Camera · 57% · 测试回流')).toBeVisible();
    expect(within(closureDetails).getAllByText('测试验证').length).toBeGreaterThan(0);
    expect(within(closureDetails).getByText('将测试缺陷回流到开发，并重新生成修复计划。')).toBeVisible();
    expect(within(closureDetails).getByText('Signed Off Camera · 100% · 已验收')).toBeVisible();
  });

  test('shows owner command center blockers in the organization overview', async () => {
    window.localStorage.setItem(
      'wee-coder-session',
      JSON.stringify({ token: 'owner-token', user: appUsers[0] }),
    );

    render(<App />);

    const ownerActionDetails = await screen.findByLabelText('负责人行动明细');
    fireEvent.click(within(ownerActionDetails).getByText('负责人行动明细'));
    expect(await screen.findByLabelText('负责人总控台')).toBeInTheDocument();
    expect(screen.getByLabelText('负责人处理顺序')).toHaveTextContent('先处理：客户门户');
    expect(screen.getByLabelText('负责人处理顺序')).toHaveTextContent('总阻塞 2');
    expect(screen.getByLabelText('负责人处理顺序')).toHaveTextContent('高风险 1');
    expect(screen.getByLabelText('总控高风险阻塞')).toHaveTextContent('1');
    expect(screen.getByText('客户门户 · 项目经理需求')).toBeInTheDocument();
    expect(screen.getByText('2 个阶段确认事项未补齐')).toBeInTheDocument();
    const ownerActionCenter = screen.getByLabelText('负责人行动中心');
    const ownerCommandDetails = within(ownerActionCenter).getByLabelText('关键阻塞明细');
    expect(within(ownerCommandDetails).getByText('请 林项目经理 补齐项目经理需求信息。')).toBeInTheDocument();
  });

  test('keeps the owner overview first screen focused on a compact decision summary', async () => {
    window.localStorage.setItem(
      'wee-coder-session',
      JSON.stringify({ token: 'owner-token', user: appUsers[0] }),
    );

    render(<App />);

    const overview = await screen.findByLabelText('组织总览');
    const controlFocus = within(overview).getByLabelText('负责人总控焦点');
    expect(within(controlFocus).getByText('组织态势')).toBeInTheDocument();
    expect(within(controlFocus).getByText('当前焦点')).toBeInTheDocument();
    expect(within(controlFocus).getByText('客户门户')).toBeInTheDocument();
    expect(within(controlFocus).getByText('下一步')).toBeInTheDocument();
    expect(within(controlFocus).getByText('2 个阻塞')).toBeInTheDocument();
    expect(within(controlFocus).getByText('高风险 1 · 风险项目 0')).toBeInTheDocument();
    expect(within(controlFocus).getByText('活跃 1 · 后台任务 3')).toBeInTheDocument();
    expect(within(controlFocus).getByLabelText('组织交付雷达')).toHaveTextContent('需要处理阻塞');
    expect(within(overview).queryByLabelText('负责人决策焦点')).not.toBeInTheDocument();
    expect(within(overview).queryByLabelText('负责人一屏摘要')).not.toBeInTheDocument();

    const ownerActionDetails = within(overview).getByLabelText('负责人行动明细');
    expect(ownerActionDetails).not.toHaveAttribute('open');
    expect(within(ownerActionDetails).queryByLabelText('负责人行动中心')).not.toBeInTheDocument();
    fireEvent.click(within(ownerActionDetails).getByText('负责人行动明细'));
    expect(within(ownerActionDetails).getByLabelText('负责人行动中心')).toBeVisible();

    const organizationDetails = within(overview).getByLabelText('组织详情');
    expect(organizationDetails).not.toHaveAttribute('open');
    expect(within(organizationDetails).queryByLabelText('角色流转')).not.toBeInTheDocument();
    fireEvent.click(within(organizationDetails).getByText('组织详情'));
    expect(within(organizationDetails).getByLabelText('角色流转')).toBeVisible();
  });

  test('renders the owner organization overview with Chinese console sections', async () => {
    window.localStorage.setItem(
      'wee-coder-session',
      JSON.stringify({ token: 'owner-token', user: appUsers[0] }),
    );

    render(<App />);

    const overview = await screen.findByLabelText('组织总览');
    expect(within(overview).getByText('组织态势')).toBeInTheDocument();
    const controlFocus = within(overview).getByLabelText('负责人总控焦点');
    const deliveryRadar = within(controlFocus).getByLabelText('组织交付雷达');
    expect(deliveryRadar).toBeInTheDocument();
    expect(within(deliveryRadar).getByText('交付雷达')).toBeInTheDocument();
    expect(within(deliveryRadar).getByText('需要处理阻塞')).toBeInTheDocument();
    expect(within(overview).queryByLabelText('负责人一屏摘要')).not.toBeInTheDocument();
    expect(within(overview).queryByLabelText('负责人决策焦点')).not.toBeInTheDocument();
    expect(within(controlFocus).getByText('客户门户')).toBeInTheDocument();
    expect(within(controlFocus).getByText('高风险 1 · 风险项目 0')).toBeInTheDocument();
    const ownerActionDetails = within(overview).getByLabelText('负责人行动明细');
    expect(ownerActionDetails).not.toHaveAttribute('open');
    expect(within(ownerActionDetails).queryByText('关键阻塞')).not.toBeInTheDocument();
    fireEvent.click(within(ownerActionDetails).getByText('负责人行动明细'));
    expect(ownerActionDetails).toHaveAttribute('open');
    expect(within(ownerActionDetails).getByText('关键阻塞')).toBeVisible();
    const ownerActionCenter = within(ownerActionDetails).getByLabelText('负责人行动中心');
    expect(within(ownerActionCenter).getByText('关键阻塞')).toBeInTheDocument();
    expect(within(overview).getByText('关键阻塞')).toBeInTheDocument();
    const ownerCommandDetails = within(ownerActionCenter).getByLabelText('关键阻塞明细');
    expect(ownerCommandDetails).not.toHaveAttribute('open');
    expect(within(ownerCommandDetails).getByText('客户门户 · 项目经理需求')).not.toBeVisible();
    const organizationDetails = within(overview).getByLabelText('组织详情');
    expect(organizationDetails).not.toHaveAttribute('open');
    expect(within(organizationDetails).queryByText('角色流转')).not.toBeInTheDocument();
    expect(within(organizationDetails).queryByText('提醒消息')).not.toBeInTheDocument();
    fireEvent.click(within(organizationDetails).getByText('组织详情'));
    expect(organizationDetails).toHaveAttribute('open');
    expect(within(organizationDetails).getByText('角色流转')).toBeVisible();
    expect(within(organizationDetails).getByText('提醒消息')).toBeVisible();
    expect(within(overview).queryByText('Organization overview')).not.toBeInTheDocument();
    expect(within(overview).queryByText('Command center')).not.toBeInTheDocument();
    expect(within(overview).queryByText('Owner role flow')).not.toBeInTheDocument();
    expect(within(overview).queryByText('Ready messages')).not.toBeInTheDocument();
  });

  test('shows stage gate blocker priority in the owner command center', async () => {
    window.localStorage.setItem(
      'wee-coder-session',
      JSON.stringify({ token: 'owner-token', user: appUsers[0] }),
    );
    const stageGatePlatform = {
      ...platformCockpit,
      governance: {
        ...platformCockpit.governance,
        commandCenter: {
          totalBlockers: 1,
          stageGateProjectCount: 1,
          followupProjectCount: 0,
          failedJobCount: 0,
          highSeverityCount: 1,
          blockers: [
            {
              id: 'stage-gate-demo',
              type: 'stage-gate',
              severity: 'high',
              projectId: 'demo-1',
              projectName: 'Camera Monitor',
              stageName: 'PM requirements',
              title: 'PM requirements blocked by 2 gate item(s)',
              detail: 'Current-stage confirmations are incomplete',
              nextAction: 'Complete 2 current-stage confirmation task(s).',
              openTaskCount: 3,
              gateBlockerCount: 2,
            },
          ],
        },
      },
    };
    global.fetch = vi.fn(async (url, options = {}) => {
      if (url === '/api/users' && !options.method) {
        return jsonResponse({ users: appUsers, currentUser: appUsers[0] });
      }
      if (url === '/api/platform' && !options.method) {
        return jsonResponse({ platform: stageGatePlatform });
      }
      if (url === '/api/projects' && !options.method) {
        return jsonResponse({ projects: [projectSummary] });
      }
      if (url === '/api/projects/demo-1' && !options.method) {
        return jsonResponse({ project: baseProject });
      }
      return jsonResponse({ error: 'not found' }, 404);
    });

    render(<App />);

    const ownerActionDetails = await screen.findByLabelText('负责人行动明细');
    fireEvent.click(within(ownerActionDetails).getByText('负责人行动明细'));
    expect(await screen.findByText('项目经理需求被 2 个闸口事项阻塞')).toBeInTheDocument();
    expect(screen.getByText('阶段闸口阻塞')).toBeInTheDocument();
    expect(screen.getByText('闸口 2 / 待办 3')).toBeInTheDocument();
    expect(screen.queryByText('Gate blocker')).not.toBeInTheDocument();
  });

  test('shows project health ranking in the organization overview', async () => {
    window.localStorage.setItem(
      'wee-coder-session',
      JSON.stringify({ token: 'owner-token', user: appUsers[0] }),
    );
    const healthPlatform = {
      ...platformCockpit,
      governance: {
        ...platformCockpit.governance,
        projectHealth: {
          summary: {
            totalProjects: 2,
            criticalCount: 1,
            warningCount: 1,
            healthyCount: 0,
            averageScore: 48,
          },
          projects: [
            {
              projectId: 'camera',
              projectName: 'Camera Monitor',
              stageName: 'PM requirements',
              score: 6,
              level: 'critical',
              priority: 100,
              nextAction: 'Complete 2 current-stage confirmation task(s).',
            },
            {
              projectId: 'portal',
              projectName: 'Customer Portal',
              stageName: 'Review',
              score: 64,
              level: 'warning',
              priority: 46,
              nextAction: 'Run code review.',
            },
          ],
        },
      },
    };
    global.fetch = vi.fn(async (url, options = {}) => {
      if (url === '/api/users' && !options.method) {
        return jsonResponse({ users: appUsers, currentUser: appUsers[0] });
      }
      if (url === '/api/platform' && !options.method) {
        return jsonResponse({ platform: healthPlatform });
      }
      if (url === '/api/projects' && !options.method) {
        return jsonResponse({ projects: [projectSummary] });
      }
      if (url === '/api/projects/demo-1' && !options.method) {
        return jsonResponse({ project: baseProject });
      }
      return jsonResponse({ error: 'not found' }, 404);
    });

    render(<App />);

    const organizationDetails = await screen.findByLabelText('组织详情');
    fireEvent.click(within(organizationDetails).getByText('组织详情'));
    const healthPanel = await screen.findByLabelText('项目健康榜');
    expect(within(healthPanel).getByText('高风险 1 / 需关注 1')).toBeInTheDocument();
    expect(within(healthPanel).getByText('Camera Monitor')).toBeInTheDocument();
    expect(within(healthPanel).getByText('得分 6')).toBeInTheDocument();
    expect(
      within(healthPanel).getByText('补齐 2 个当前阶段确认事项。'),
    ).toBeInTheDocument();
    expect(within(healthPanel).queryByText('Project health')).not.toBeInTheDocument();
  });

  test('shows audit summary facets in the commercial cockpit', async () => {
    window.localStorage.setItem(
      'wee-coder-session',
      JSON.stringify({ token: 'owner-token', user: appUsers[0] }),
    );
    const auditPlatform = {
      ...platformCockpit,
      governance: {
        ...platformCockpit.governance,
        auditSummary: {
          totalEvents: 3,
          highSeverityCount: 1,
          actorCount: 2,
          projectCount: 2,
          latestAt: '2026-06-17T02:00:00.000Z',
          categories: [
            { id: 'ai-operations', label: 'AI operations', count: 2 },
            { id: 'review', label: 'Review', count: 1 },
          ],
          actors: [
            { actor: 'Local Runner', count: 2 },
            { actor: 'Tech Lead', count: 1 },
          ],
          projects: [
            { projectId: 'camera', projectName: 'Camera Monitor', count: 2 },
            { projectId: 'portal', projectName: 'Customer Portal', count: 1 },
          ],
        },
        auditLog: [
          {
            id: 'audit-platform-job',
            projectName: 'Camera Monitor',
            type: 'platform-job-failed',
            category: 'ai-operations',
            severity: 'high',
            actor: 'Local Runner',
            note: 'npm test failed.',
            at: '2026-06-17T02:00:00.000Z',
          },
        ],
      },
    };
    global.fetch = vi.fn(async (url, options = {}) => {
      if (url === '/api/users' && !options.method) {
        return jsonResponse({ users: appUsers, currentUser: appUsers[0] });
      }
      if (url === '/api/platform' && !options.method) {
        return jsonResponse({ platform: auditPlatform });
      }
      if (url === '/api/projects' && !options.method) {
        return jsonResponse({ projects: [projectSummary] });
      }
      if (url === '/api/projects/demo-1' && !options.method) {
        return jsonResponse({ project: baseProject });
      }
      return jsonResponse({ error: 'not found' }, 404);
    });

    render(<App />);
    await openOperationsConsole();

    const auditCard = (await screen.findByText('最近审计')).closest('article');
    expect(within(auditCard).getByText('审计摘要')).toBeInTheDocument();
    expect(within(auditCard).getByText('事件 3')).toBeInTheDocument();
    expect(within(auditCard).getByText('高风险 1')).toBeInTheDocument();
    expect(within(auditCard).getByText('AI 运营 2')).toBeInTheDocument();
    expect(within(auditCard).getByText('本地执行器 2')).toBeInTheDocument();
    expect(within(auditCard).getByText('Camera Monitor 2')).toBeInTheDocument();
  });

  test('shows audit export manifest and filters audit events in the commercial cockpit', async () => {
    window.localStorage.setItem(
      'wee-coder-session',
      JSON.stringify({ token: 'owner-token', user: appUsers[0] }),
    );
    const auditPlatform = {
      ...platformCockpit,
      governance: {
        ...platformCockpit.governance,
        auditSummary: {
          totalEvents: 3,
          highSeverityCount: 1,
          actorCount: 2,
          projectCount: 2,
          latestAt: '2026-06-17T02:00:00.000Z',
          categories: [
            { id: 'ai-operations', label: 'AI operations', count: 1 },
            { id: 'review', label: 'Review', count: 1 },
            { id: 'requirements', label: 'Requirements', count: 1 },
          ],
          actors: [
            { actor: 'Local Runner', count: 1 },
            { actor: 'Tech Lead', count: 1 },
          ],
          projects: [
            { projectId: 'camera', projectName: 'Camera Monitor', count: 2 },
            { projectId: 'portal', projectName: 'Customer Portal', count: 1 },
          ],
          exportManifest: {
            format: 'jsonl',
            recordCount: 3,
            highSeverityCount: 1,
            projectCount: 2,
            latestAt: '2026-06-17T02:00:00.000Z',
            filename: 'wee-coder-audit-wee-coder-labs-2026-06-17.jsonl',
            fields: ['id', 'projectId', 'projectName', 'type', 'category', 'severity', 'actor', 'at', 'note'],
            recommendedFilters: [
              { id: 'all', label: 'All events', count: 3 },
              { id: 'high', label: 'High severity', count: 1 },
              { id: 'ai-operations', label: 'AI operations', count: 1 },
            ],
          },
        },
        auditLog: [
          {
            id: 'audit-platform-job',
            projectName: 'Camera Monitor',
            type: 'platform-job-failed',
            category: 'ai-operations',
            severity: 'high',
            actor: 'Local Runner',
            note: 'npm test failed.',
            at: '2026-06-17T02:00:00.000Z',
          },
          {
            id: 'audit-code-review',
            projectName: 'Camera Monitor',
            type: 'code-review-finished',
            category: 'review',
            severity: 'medium',
            actor: 'Tech Lead',
            note: 'Security review passed.',
            at: '2026-06-17T01:00:00.000Z',
          },
          {
            id: 'audit-prd',
            projectName: 'Customer Portal',
            type: 'prd-generated',
            category: 'requirements',
            severity: 'low',
            actor: 'PM',
            note: 'Generated PRD draft.',
            at: '2026-06-16T03:00:00.000Z',
          },
        ],
      },
    };
    global.fetch = vi.fn(async (url, options = {}) => {
      if (url === '/api/users' && !options.method) {
        return jsonResponse({ users: appUsers, currentUser: appUsers[0] });
      }
      if (url === '/api/platform' && !options.method) {
        return jsonResponse({ platform: auditPlatform });
      }
      if (url === '/api/projects' && !options.method) {
        return jsonResponse({ projects: [projectSummary] });
      }
      if (url === '/api/projects/demo-1' && !options.method) {
        return jsonResponse({ project: baseProject });
      }
      return jsonResponse({ error: 'not found' }, 404);
    });

    render(<App />);
    await openOperationsConsole();

    const auditCard = (await screen.findByText('最近审计')).closest('article');
    const auditDetails = within(auditCard).getByLabelText('操作审计明细');
    expect(auditDetails.tagName).toBe('DETAILS');
    expect(auditDetails).not.toHaveAttribute('open');
    expect(within(auditDetails).getByText('操作审计明细')).toBeVisible();
    expect(within(auditDetails).getByText('审计导出')).not.toBeVisible();

    fireEvent.click(within(auditDetails).getByText('操作审计明细'));
    expect(auditDetails).toHaveAttribute('open');
    expect(within(auditDetails).getByText('审计导出')).toBeVisible();
    expect(within(auditDetails).getByText('jsonl · 3 条记录 · 高风险 1 · 项目 2')).toBeVisible();
    expect(within(auditDetails).getByText('wee-coder-audit-wee-coder-labs-2026-06-17.jsonl')).toBeVisible();
    expect(within(auditDetails).getByText('字段 9')).toBeVisible();
    expect(within(auditDetails).getByRole('button', { name: '只看高危审计事件' })).toBeVisible();

    fireEvent.click(within(auditDetails).getByRole('button', { name: '只看高危审计事件' }));

    expect(within(auditDetails).getByText('npm test 失败。')).toBeInTheDocument();
    expect(within(auditDetails).queryByText('安全评审已通过。')).not.toBeInTheDocument();
    expect(within(auditDetails).queryByText('已生成需求文档草稿。')).not.toBeInTheDocument();
    expect(within(auditDetails).getByText('显示 1 / 3 条事件')).toBeInTheDocument();
  });

  test('opens general audit event details from the commercial cockpit', async () => {
    window.localStorage.setItem(
      'wee-coder-session',
      JSON.stringify({ token: 'owner-token', user: appUsers[0] }),
    );
    const auditPlatform = {
      ...platformCockpit,
      governance: {
        ...platformCockpit.governance,
        auditSummary: {
          totalEvents: 1,
          highSeverityCount: 1,
          actorCount: 1,
          projectCount: 1,
          categories: [{ id: 'ai-operations', label: 'AI operations', count: 1 }],
          actors: [{ actor: 'Local Runner', count: 1 }],
          projects: [{ projectId: 'camera', projectName: 'Camera Monitor', count: 1 }],
        },
        auditLog: [
          {
            id: 'audit-platform-job',
            projectId: 'camera-monitor',
            projectName: 'Camera Monitor',
            type: 'platform-job-failed',
            category: 'ai-operations',
            severity: 'high',
            actor: 'Local Runner',
            actorUserId: 'runner-local',
            organizationId: 'wee-coder-labs',
            auditReason: 'api-platform-job-failed',
            jobId: 'job-code-review',
            jobStatus: 'failed',
            note: 'npm test failed.',
            at: '2026-06-17T02:00:00.000Z',
          },
        ],
      },
    };
    global.fetch = vi.fn(async (url, options = {}) => {
      if (url === '/api/users' && !options.method) {
        return jsonResponse({ users: appUsers, currentUser: appUsers[0] });
      }
      if (url === '/api/platform' && !options.method) {
        return jsonResponse({ platform: auditPlatform });
      }
      if (url === '/api/projects' && !options.method) {
        return jsonResponse({ projects: [projectSummary] });
      }
      if (url === '/api/projects/demo-1' && !options.method) {
        return jsonResponse({ project: baseProject });
      }
      return jsonResponse({ error: 'not found' }, 404);
    });

    render(<App />);
    await openOperationsConsole();

    const auditCard = (await screen.findByText('最近审计')).closest('article');
    const auditDetails = within(auditCard).getByLabelText('操作审计明细');
    fireEvent.click(within(auditDetails).getByText('操作审计明细'));
    fireEvent.click(within(auditDetails).getByRole('button', { name: '查看操作审计详情 Camera Monitor' }));

    const detail = await screen.findByLabelText('操作审计详情');
    expect(within(detail).getByText('audit-platform-job')).toBeInTheDocument();
    expect(within(detail).getByText('后台任务失败')).toBeInTheDocument();
    expect(within(detail).getByText('Camera Monitor')).toBeInTheDocument();
    expect(within(detail).getByText('本地执行器')).toBeInTheDocument();
    expect(within(detail).getByText('AI 运营 · 高')).toBeInTheDocument();
    expect(within(detail).getByText('接口后台任务失败')).toBeInTheDocument();
    expect(within(detail).getByText('job-code-review · 失败')).toBeInTheDocument();
    expect(within(detail).getByText('wee-coder-labs')).toBeInTheDocument();
    expect(within(detail).getByText('2026-06-17T02:00:00.000Z')).toBeInTheDocument();
    expect(within(detail).getByText('npm test 失败。')).toBeInTheDocument();
  });

  test('shows notification action context in audit event details', async () => {
    window.localStorage.setItem(
      'wee-coder-session',
      JSON.stringify({ token: 'owner-token', user: appUsers[0] }),
    );
    const auditPlatform = {
      ...platformCockpit,
      governance: {
        ...platformCockpit.governance,
        auditSummary: {
          totalEvents: 1,
          highSeverityCount: 0,
          actorCount: 1,
          projectCount: 1,
          categories: [{ id: 'workflow', label: 'Workflow', count: 1 }],
          actors: [{ actor: 'Owner AA', count: 1 }],
          projects: [{ projectId: 'camera', projectName: 'Camera Monitor', count: 1 }],
        },
        auditLog: [
          {
            id: 'audit-notification-action-assigned',
            projectId: 'camera',
            projectName: 'Camera Monitor',
            type: 'notification-action-assigned',
            category: 'workflow',
            severity: 'medium',
            actor: 'Owner AA',
            actorUserId: 'owner-aa',
            organizationId: 'wee-coder-labs',
            auditReason: 'api-notification-action-assigned',
            notificationId: 'notification-action-sla-camera-pm-requirements',
            notificationStatus: 'assigned',
            assigneeRole: 'pm',
            assigneeUserId: 'pm-lin',
            assigneeName: 'Lin PM',
            resolution: '',
            note: 'Route requirement blockers to PM.',
            at: '2026-06-18T04:05:00.000Z',
          },
        ],
      },
    };
    global.fetch = vi.fn(async (url, options = {}) => {
      if (url === '/api/users' && !options.method) {
        return jsonResponse({ users: appUsers, currentUser: appUsers[0] });
      }
      if (url === '/api/platform' && !options.method) {
        return jsonResponse({ platform: auditPlatform });
      }
      if (url === '/api/projects' && !options.method) {
        return jsonResponse({ projects: [projectSummary] });
      }
      if (url === '/api/projects/demo-1' && !options.method) {
        return jsonResponse({ project: baseProject });
      }
      return jsonResponse({ error: 'not found' }, 404);
    });

    render(<App />);
    await openOperationsConsole();

    const auditCard = (await screen.findByText('最近审计')).closest('article');
    const auditDetails = within(auditCard).getByLabelText('操作审计明细');
    fireEvent.click(within(auditDetails).getByText('操作审计明细'));
    fireEvent.click(
      within(auditDetails).getByRole('button', {
        name: '查看操作审计详情 Camera Monitor',
      }),
    );

    const detail = await screen.findByLabelText('操作审计详情');
    expect(within(detail).getByText('notification-action-sla-camera-pm-requirements')).toBeInTheDocument();
    expect(within(detail).getByText('已分派')).toBeInTheDocument();
    expect(within(detail).getByText('项目经理 · pm-lin · Lin PM')).toBeInTheDocument();
    expect(within(detail).getByText('将需求阻塞分派给项目经理。')).toBeInTheDocument();
  });

  test('shows authorization denial events in a security audit panel', async () => {
    window.localStorage.setItem(
      'wee-coder-session',
      JSON.stringify({ token: 'owner-token', user: appUsers[0] }),
    );
    const securityAuditPlatform = {
      ...platformCockpit,
      governance: {
        ...platformCockpit.governance,
        auditLog: [
          {
            id: 'audit-denied-review',
            projectName: 'Camera Monitor',
            type: 'authorization-denied',
            category: 'security',
            severity: 'high',
            actor: '项目经理',
            actionId: 'run-code-review',
            roleLabel: '项目经理',
            allowedRoles: ['tech-lead', 'owner'],
            reason: '当前角色无权执行代码、安全、性能评审。',
            note: '当前角色无权执行代码、安全、性能评审。',
            at: '2026-06-17T03:00:00.000Z',
          },
          ...platformCockpit.governance.auditLog,
        ],
      },
    };
    global.fetch = vi.fn(async (url, options = {}) => {
      if (url === '/api/users' && !options.method) {
        return jsonResponse({ users: appUsers, currentUser: appUsers[0] });
      }
      if (url === '/api/platform' && !options.method) {
        return jsonResponse({ platform: securityAuditPlatform });
      }
      if (url === '/api/projects' && !options.method) {
        return jsonResponse({ projects: [projectSummary] });
      }
      if (url === '/api/projects/demo-1' && !options.method) {
        return jsonResponse({ project: baseProject });
      }
      return jsonResponse({ error: 'not found' }, 404);
    });

    render(<App />);
    await openOperationsConsole();

    const securityAudit = await screen.findByLabelText('安全审计');
    expect(within(securityAudit).getByText('越权拒绝 1')).toBeInTheDocument();
    const securityDetails = within(securityAudit).getByLabelText('安全审计明细');
    expect(securityDetails.tagName).toBe('DETAILS');
    expect(securityDetails).not.toHaveAttribute('open');
    expect(within(securityDetails).getByText('安全审计明细')).toBeVisible();
    expect(within(securityDetails).getByText('Camera Monitor')).not.toBeVisible();

    fireEvent.click(within(securityDetails).getByText('安全审计明细'));
    expect(securityDetails).toHaveAttribute('open');
    expect(within(securityDetails).getByText('Camera Monitor')).toBeVisible();
    expect(within(securityDetails).getByText('执行代码评审 · 项目经理')).toBeVisible();
    expect(within(securityDetails).getByText('允许角色：技术负责人、负责人')).toBeVisible();
    expect(within(securityDetails).getByText('当前角色无权执行代码、安全、性能评审。')).toBeVisible();
  });

  test('filters high severity security audit events and opens event details', async () => {
    window.localStorage.setItem(
      'wee-coder-session',
      JSON.stringify({ token: 'owner-token', user: appUsers[0] }),
    );
    const securityAuditPlatform = {
      ...platformCockpit,
      governance: {
        ...platformCockpit.governance,
        auditLog: [
          {
            id: 'audit-denied-review',
            projectName: 'Camera Monitor',
            type: 'authorization-denied',
            category: 'security',
            severity: 'high',
            actor: '项目经理',
            actionId: 'run-code-review',
            roleLabel: '项目经理',
            allowedRoles: ['tech-lead', 'owner'],
            reason: '当前角色无权执行代码、安全、性能评审。',
            note: '当前角色无权执行代码、安全、性能评审。',
            at: '2026-06-17T03:00:00.000Z',
          },
          {
            id: 'audit-token-rotation',
            projectName: 'Customer Portal',
            type: 'security-token-rotated',
            category: 'security',
            severity: 'low',
            actor: '负责人',
            actionId: 'rotate-token',
            roleLabel: '负责人',
            note: 'API token rotated by owner.',
            at: '2026-06-17T04:00:00.000Z',
          },
        ],
      },
    };
    global.fetch = vi.fn(async (url, options = {}) => {
      if (url === '/api/users' && !options.method) {
        return jsonResponse({ users: appUsers, currentUser: appUsers[0] });
      }
      if (url === '/api/platform' && !options.method) {
        return jsonResponse({ platform: securityAuditPlatform });
      }
      if (url === '/api/projects' && !options.method) {
        return jsonResponse({ projects: [projectSummary] });
      }
      if (url === '/api/projects/demo-1' && !options.method) {
        return jsonResponse({ project: baseProject });
      }
      return jsonResponse({ error: 'not found' }, 404);
    });

    render(<App />);
    await openOperationsConsole();

    const securityAudit = await screen.findByLabelText('安全审计');
    const securityDetails = within(securityAudit).getByLabelText('安全审计明细');
    fireEvent.click(within(securityDetails).getByText('安全审计明细'));
    expect(within(securityAudit).getByText('Customer Portal')).toBeInTheDocument();

    fireEvent.click(within(securityAudit).getByRole('button', { name: '只看高危安全事件' }));

    expect(within(securityAudit).getByText('Camera Monitor')).toBeInTheDocument();
    expect(within(securityAudit).queryByText('Customer Portal')).not.toBeInTheDocument();

    fireEvent.click(within(securityAudit).getByRole('button', { name: '查看安全审计详情 Camera Monitor' }));

    const detail = await screen.findByLabelText('安全审计详情');
    expect(within(detail).getByText('Camera Monitor')).toBeInTheDocument();
    expect(within(detail).getByText('越权拒绝')).toBeInTheDocument();
    expect(within(detail).getByText('执行代码评审')).toBeInTheDocument();
    expect(within(detail).getByText('项目经理')).toBeInTheDocument();
    expect(within(detail).getByText('技术负责人、负责人')).toBeInTheDocument();
    expect(within(detail).getByText('当前角色无权执行代码、安全、性能评审。')).toBeInTheDocument();
  });

  test('shows backend security audit summary metrics in the commercial cockpit', async () => {
    window.localStorage.setItem(
      'wee-coder-session',
      JSON.stringify({ token: 'owner-token', user: appUsers[0] }),
    );
    const securityAuditPlatform = {
      ...platformCockpit,
      governance: {
        ...platformCockpit.governance,
        securityAudit: {
          totalEvents: 5,
          denialCount: 3,
          highSeverityCount: 2,
          latestAt: '2026-06-17T04:00:00.000Z',
          projects: [
            { projectId: 'camera', projectName: 'Camera Monitor', count: 3 },
            { projectId: 'portal', projectName: 'Customer Portal', count: 2 },
          ],
          roles: [
            { roleLabel: '项目经理', count: 3 },
            { roleLabel: '测试', count: 2 },
          ],
          actions: [
            { actionId: 'run-code-review', count: 2 },
            { actionId: 'run-qa', count: 1 },
          ],
        },
        auditLog: [
          {
            id: 'audit-denied-review',
            projectName: 'Camera Monitor',
            type: 'authorization-denied',
            category: 'security',
            severity: 'high',
            actor: '项目经理',
            actionId: 'run-code-review',
            roleLabel: '项目经理',
            allowedRoles: ['tech-lead', 'owner'],
            reason: '当前角色无权执行代码、安全、性能评审。',
            note: '当前角色无权执行代码、安全、性能评审。',
            at: '2026-06-17T03:00:00.000Z',
          },
        ],
      },
    };
    global.fetch = vi.fn(async (url, options = {}) => {
      if (url === '/api/users' && !options.method) {
        return jsonResponse({ users: appUsers, currentUser: appUsers[0] });
      }
      if (url === '/api/platform' && !options.method) {
        return jsonResponse({ platform: securityAuditPlatform });
      }
      if (url === '/api/projects' && !options.method) {
        return jsonResponse({ projects: [projectSummary] });
      }
      if (url === '/api/projects/demo-1' && !options.method) {
        return jsonResponse({ project: baseProject });
      }
      return jsonResponse({ error: 'not found' }, 404);
    });

    render(<App />);
    await openOperationsConsole();

    const securityAudit = await screen.findByLabelText('安全审计');
    expect(within(securityAudit).getByText('越权拒绝 3')).toBeInTheDocument();
    expect(within(securityAudit).getByText('高危 2')).toBeInTheDocument();
    expect(within(securityAudit).getByText('项目 2')).toBeInTheDocument();
    expect(within(securityAudit).getByText('角色 2')).toBeInTheDocument();
    const securityDetails = within(securityAudit).getByLabelText('安全审计明细');
    fireEvent.click(within(securityDetails).getByText('安全审计明细'));
    expect(within(securityDetails).getByText('Camera Monitor 3')).toBeVisible();
    expect(within(securityDetails).getByText('项目经理 3')).toBeVisible();
    expect(within(securityDetails).getByText('执行代码评审 2')).toBeVisible();
  });

  test('shows deployment readiness gates and ops handoff gaps in the commercial cockpit', async () => {
    window.localStorage.setItem(
      'wee-coder-session',
      JSON.stringify({ token: 'owner-token', user: appUsers[0] }),
    );
    const deploymentPlatform = {
      ...platformCockpit,
      deployment: {
        readiness: {
          status: 'blocked',
          score: 40,
          blockedGateCount: 3,
          readyGateCount: 1,
          plannedGateCount: 1,
          nextAction: 'Resolve production release blockers before deployment.',
        },
        environments: [
          { id: 'local', name: 'Local', status: 'ready', version: 'commercial-skeleton-v0.2' },
          {
            id: 'staging',
            name: 'Staging',
            status: 'ready',
            version: 'staging-yolo-v1',
            url: 'https://staging.example.com/camera',
            evidence: 'RTSP mock stream smoke test passed.',
            projectCount: 1,
            latestProjectName: 'Camera Monitor',
            nextAction: 'Keep staging validation evidence current before production release.',
          },
          {
            id: 'production',
            name: 'Production',
            status: 'blocked',
            version: '',
            nextAction: 'Resolve production release blockers before deployment.',
          },
        ],
        releaseGates: [
          {
            id: 'database',
            title: 'Production database',
            status: 'blocked',
            ownerRole: 'owner',
            blockerCount: 1,
            nextAction: 'Move project records out of local JSON storage.',
          },
          {
            id: 'ops-handoff',
            title: 'Ops handoff',
            status: 'blocked',
            ownerRole: 'ops',
            blockerCount: 2,
            nextAction: 'Complete 2 ops handoff item(s).',
          },
        ],
        opsHandoff: {
          status: 'blocked',
          missingItemCount: 2,
          projectCount: 1,
          items: [
            {
              id: 'camera-runtime-environment',
              projectName: 'Camera Monitor',
              title: 'Runtime environment',
              status: 'missing',
              ownerRole: 'ops',
            },
          ],
        },
      },
    };
    global.fetch = vi.fn(async (url, options = {}) => {
      if (url === '/api/users' && !options.method) {
        return jsonResponse({ users: appUsers, currentUser: appUsers[0] });
      }
      if (url === '/api/platform' && !options.method) {
        return jsonResponse({ platform: deploymentPlatform });
      }
      if (url === '/api/projects' && !options.method) {
        return jsonResponse({ projects: [projectSummary] });
      }
      if (url === '/api/projects/demo-1' && !options.method) {
        return jsonResponse({ project: baseProject });
      }
      return jsonResponse({ error: 'not found' }, 404);
    });

    render(<App />);
    await openOperationsConsole();
    fireEvent.click(screen.getByRole('tab', { name: '部署与发布' }));

    const deploymentCard = (await screen.findByText('部署控制台')).closest('article');
    expect(screen.queryByLabelText('Release readiness')).not.toBeInTheDocument();
    expect(within(deploymentCard).getByLabelText('发布准备度')).toBeInTheDocument();
    expect(within(deploymentCard).getByText('发布准备度')).toBeInTheDocument();
    expect(within(deploymentCard).getByText('得分 40')).toBeInTheDocument();
    expect(within(deploymentCard).getByText('阻塞闸口 3')).toBeInTheDocument();
    const deploymentDetails = within(deploymentCard).getByLabelText('部署明细');
    expect(deploymentDetails.tagName).toBe('DETAILS');
    expect(deploymentDetails).not.toHaveAttribute('open');
    expect(within(deploymentDetails).getByText('部署明细')).toBeVisible();
    expect(within(deploymentDetails).getByText('环境 3 · 门禁 2 · 交接缺口 2')).toBeVisible();
    expect(within(deploymentDetails).getByText('生产数据库 · 已阻塞')).not.toBeVisible();
    fireEvent.click(within(deploymentDetails).getByText('部署明细'));
    expect(deploymentDetails).toHaveAttribute('open');
    expect(within(deploymentDetails).getByText('生产数据库 · 已阻塞')).toBeVisible();
    expect(within(deploymentDetails).getByText('运维交接 · 已阻塞')).toBeVisible();
    expect(within(deploymentDetails).getByText('项目 1')).toBeVisible();
    expect(within(deploymentDetails).getByText('Camera Monitor')).toBeVisible();
    expect(within(deploymentDetails).getByText('RTSP 模拟流冒烟测试已通过。')).toBeVisible();
    expect(within(deploymentDetails).getByText('https://staging.example.com/camera')).toBeVisible();
    expect(
      within(deploymentDetails).getByText(
        '生产发布前保持预发验证证据最新。',
      ),
    ).toBeVisible();
    expect(within(deploymentDetails).getByText('运行环境')).toBeVisible();
  });

  test('shows database migration phases in the commercial cockpit', async () => {
    render(<App />);
    await openOperationsConsole();

    expect(await screen.findByText('Schema 基线')).toBeInTheDocument();
    expect(screen.getByText('流程状态抽取')).toBeInTheDocument();
    expect(screen.getByText('切换与回滚控制')).toBeInTheDocument();
    expect(screen.getByText('2/4 阶段就绪')).toBeInTheDocument();
  });

  test('shows database cutover gates and extraction readiness in the commercial cockpit', async () => {
    const databasePlatform = {
      ...platformCockpit,
      database: {
        ...platformCockpit.database,
        cutoverReadiness: {
          status: 'blocked',
          readyGateCount: 2,
          blockedGateCount: 2,
          plannedGateCount: 1,
          nextAction: 'Implement transactional database writes before production cutover.',
          gates: [
            {
              id: 'repository-contract',
              title: 'Repository boundary',
              status: 'ready',
              evidence: 'JsonProjectRepository exposes the persistence boundary.',
            },
            {
              id: 'transaction-support',
              title: 'Transactional writes',
              status: 'blocked',
              nextAction: 'Replace JSON file writes with PostgreSQL transactions.',
            },
            {
              id: 'concurrent-writes',
              title: 'Concurrent write protection',
              status: 'blocked',
              nextAction: 'Add optimistic locking or database-level write serialization.',
            },
          ],
        },
        extractionReadiness: {
          totalTableCount: 11,
          mappedTableCount: 5,
          blockedTableCount: 3,
          plannedTableCount: 3,
          tables: [
            { tableName: 'projects', source: 'project root', status: 'mapped', priority: 'P0' },
            {
              tableName: 'agent_jobs',
              source: 'project.platformJobs[]',
              status: 'needs-extraction',
              priority: 'P1',
            },
          ],
        },
        repositoryContract: {
          status: 'ready',
          readyMethodCount: 7,
          missingMethodCount: 0,
          methods: [
            {
              name: 'listProjectsByOrganization',
              table: 'projects',
              status: 'ready',
            },
            {
              name: 'appendAuditEvent',
              table: 'audit_logs',
              status: 'ready',
            },
          ],
        },
        agentQueueStorage: {
          status: 'needs-extraction',
          tableCount: 3,
          readyTableCount: 0,
          missingExtractionCount: 3,
          nextAction: 'Extract platform jobs into agent_jobs, agent_job_runs, and agent_job_events before SQL cutover.',
          tables: [
            {
              tableName: 'agent_jobs',
              purpose: 'Job identity, queue status, executor, and command.',
              source: 'project.platformJobs[]',
              status: 'needs-extraction',
            },
            {
              tableName: 'agent_job_runs',
              purpose: 'Run attempts, worker lease ownership, duration, and exit code.',
              source: 'project.platformJobs[].runCount + lease fields',
              status: 'needs-extraction',
            },
            {
              tableName: 'agent_job_events',
              purpose: 'Immutable lifecycle events for queue audit and replay.',
              source: 'project.history[platform-job-*]',
              status: 'needs-filtered-extraction',
            },
          ],
        },
      },
    };

    global.fetch = vi.fn(async (url, options = {}) => {
      if (url === '/api/users' && !options.method) {
        return jsonResponse({ users: appUsers, currentUser: appUsers[0] });
      }
      if (url === '/api/platform' && !options.method) {
        return jsonResponse({ platform: databasePlatform });
      }
      if (url === '/api/projects' && !options.method) {
        return jsonResponse({ projects: [projectSummary] });
      }
      if (url === '/api/projects/demo-1' && !options.method) {
        return jsonResponse({ project: baseProject });
      }
      return jsonResponse({ error: 'not found' }, 404);
    });

    render(<App />);
    await openOperationsConsole();

    const databaseCard = (await screen.findByText('切换闸口')).closest('article');
    expect(within(databaseCard).getByText('阻塞 2')).toBeInTheDocument();
    expect(within(databaseCard).getByText('事务写入 · 已阻塞')).toBeInTheDocument();
    expect(within(databaseCard).getByText('并发写保护 · 已阻塞')).toBeInTheDocument();
    expect(within(databaseCard).getByText('数据抽取准备度')).toBeInTheDocument();
    expect(within(databaseCard).getByText('projects · 已映射')).toBeInTheDocument();
    expect(within(databaseCard).getByText('agent_jobs · 待抽取')).toBeInTheDocument();
    expect(within(databaseCard).getByText('仓库契约')).toBeInTheDocument();
    expect(within(databaseCard).getByText('就绪方法 7')).toBeInTheDocument();
    expect(within(databaseCard).getByText('缺失方法 0')).toBeInTheDocument();
    expect(within(databaseCard).getByText('listProjectsByOrganization · 已就绪')).toBeInTheDocument();
    expect(within(databaseCard).getByText('智能体队列存储')).toBeInTheDocument();
    expect(within(databaseCard).getByText('数据表 3 · 缺少抽取 3')).toBeInTheDocument();
    expect(within(databaseCard).getByText('agent_job_runs · 待抽取')).toBeInTheDocument();
    expect(within(databaseCard).getByText('agent_job_events · 待筛选抽取')).toBeInTheDocument();
  });

  test('clamps dashboard average progress to 100 percent', async () => {
    global.fetch = vi.fn(async (url, options = {}) => {
      if (url === '/api/projects' && !options.method) {
        return jsonResponse({
          projects: [{ ...projectSummary, stageProgress: 5, totalStages: 3 }],
        });
      }
      if (url === '/api/projects/demo-1' && !options.method) {
        return jsonResponse({ project: baseProject });
      }
      return jsonResponse({ error: 'not found' }, 404);
    });

    render(<App />);

    expect(await screen.findByText('100%')).toBeInTheDocument();
    expect(screen.queryByText('167%')).not.toBeInTheDocument();
  });

  test('loads project detail and shows requirement quality controls', async () => {
    render(<App />);
    await openDeliveryConsole();

    const requirementActionCenter = await screen.findByLabelText('需求处理中心');
    expect(within(requirementActionCenter).getByText('需求处理中心')).toBeInTheDocument();
    expect(within(requirementActionCenter).getByText('需求澄清')).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: '智能需求评审' })).toBeInTheDocument();
    expect(within(requirementActionCenter).getByText('质检待评审')).toBeInTheDocument();
    expect(within(requirementActionCenter).queryByRole('button', { name: '生成需求文档草稿' })).not.toBeInTheDocument();
    expect(within(requirementActionCenter).queryByLabelText('需求质检状态')).not.toBeInTheDocument();
    const actionDetails = within(requirementActionCenter).getByLabelText('需求操作详情');
    expect(actionDetails.tagName).toBe('DETAILS');
    expect(actionDetails).not.toHaveAttribute('open');
    expect(within(actionDetails).getByText('需求操作详情')).toBeVisible();
    fireEvent.click(within(actionDetails).getByText('需求操作详情'));
    expect(actionDetails).toHaveAttribute('open');
    expect(within(actionDetails).getByRole('button', { name: '生成需求文档草稿' })).toBeInTheDocument();
    const qualityStatus = within(actionDetails).getByLabelText('需求质检状态');
    expect(qualityStatus.tagName).toBe('DETAILS');
    expect(qualityStatus).not.toHaveAttribute('open');
    expect(within(qualityStatus).getByText('尚未运行智能需求评审')).toBeVisible();
    expect(
      within(qualityStatus).getByText('保存需求后点击“智能需求评审”，系统会检查缺失项、阻塞项和验收风险。'),
    ).not.toBeVisible();
    expect(screen.getAllByText('客户门户').length).toBeGreaterThan(0);
    expect(screen.getByText('缺项待办 2')).toBeInTheDocument();
    expect(screen.getByText('卡住：项目经理')).toBeInTheDocument();
    expect(screen.getByText('指派：林项目经理')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '提交需求文档审批' })).toBeDisabled();
    const requirementDetails = screen.getByLabelText('需求填写详情');
    expect(requirementDetails).not.toHaveAttribute('open');
    expect(within(requirementDetails).getByText('需求澄清 Skill')).not.toBeVisible();
    expect(within(requirementDetails).getByLabelText('目标用户')).not.toBeVisible();
    fireEvent.click(within(qualityStatus).getByText('尚未运行智能需求评审'));
    expect(qualityStatus).toHaveAttribute('open');
    expect(
      within(qualityStatus).getByText('保存需求后点击“智能需求评审”，系统会检查缺失项、阻塞项和验收风险。'),
    ).toBeVisible();
    fireEvent.click(within(requirementDetails).getByText('需求填写详情'));
    expect(requirementDetails).toHaveAttribute('open');
    expect(within(requirementDetails).getByText('需求澄清 Skill')).toBeVisible();
    expect(within(requirementDetails).getByLabelText('目标用户')).toBeVisible();
  });

  test('keeps requirement quality issue lists collapsed until review details are opened', async () => {
    const reviewProject = {
      ...baseProject,
      requirementReview: {
        status: 'needs-work',
        score: 65,
        completedCount: 1,
        totalCount: 2,
        blockers: [{ title: '缺少测试样本', detail: '需要明确 RTSP 样本来源和时长。' }],
        warnings: [{ title: '误检率口径不完整', detail: '需要说明误检统计方式。' }],
        recommendations: ['补充弱光、遮挡、多人场景样本。'],
        provider: 'codex-cli',
      },
    };
    global.fetch = vi.fn(async (url, options = {}) => {
      if (url === '/api/users' && !options.method) {
        return jsonResponse({ users: appUsers, currentUser: appUsers[0] });
      }
      if (url === '/api/projects' && !options.method) {
        return jsonResponse({ projects: [projectSummary] });
      }
      if (url === '/api/projects/demo-1' && !options.method) {
        return jsonResponse({ project: reviewProject });
      }
      return jsonResponse({ error: 'not found' }, 404);
    });

    render(<App />);
    await openDeliveryConsole();

    const requirementActionCenter = await screen.findByLabelText('需求处理中心');
    expect(within(requirementActionCenter).getByText('需求质检待补充')).toBeInTheDocument();
    expect(within(requirementActionCenter).getByText('完整度 1/2，评分 65')).toBeInTheDocument();
    const actionDetails = within(requirementActionCenter).getByLabelText('需求操作详情');
    expect(actionDetails).not.toHaveAttribute('open');
    expect(within(requirementActionCenter).queryByLabelText('需求质检明细')).not.toBeInTheDocument();
    fireEvent.click(within(actionDetails).getByText('需求操作详情'));
    const qualityDetails = within(actionDetails).getByLabelText('需求质检明细');
    expect(qualityDetails.tagName).toBe('DETAILS');
    expect(qualityDetails).not.toHaveAttribute('open');
    expect(within(qualityDetails).getByText('需求质检明细')).toBeVisible();
    expect(within(qualityDetails).getByText('阻塞 1 · 风险 1 · 建议 1')).toBeVisible();
    expect(within(qualityDetails).getByText('缺少测试样本：需要明确 RTSP 样本来源和时长。')).not.toBeVisible();

    fireEvent.click(within(qualityDetails).getByText('需求质检明细'));
    expect(qualityDetails).toHaveAttribute('open');
    expect(within(qualityDetails).getByText('缺少测试样本：需要明确 RTSP 样本来源和时长。')).toBeVisible();
    expect(within(qualityDetails).getByText('误检率口径不完整：需要说明误检统计方式。')).toBeVisible();
    expect(within(qualityDetails).getByText('补充弱光、遮挡、多人场景样本。')).toBeVisible();
  });

  test('shows PRD version and requirement change impact in the requirement action center', async () => {
    const versionedProject = {
      ...baseProject,
      prdStatus: 'draft',
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
      requirementReview: {
        ...readyReview,
        status: 'stale',
        staleReason: '需求答案已更新，请重新运行智能需求评审。',
      },
    };
    global.fetch = vi.fn(async (url, options = {}) => {
      if (url === '/api/users' && !options.method) {
        return jsonResponse({ users: appUsers, currentUser: appUsers[0] });
      }
      if (url === '/api/projects' && !options.method) {
        return jsonResponse({ projects: [projectSummary] });
      }
      if (url === '/api/projects/demo-1' && !options.method) {
        return jsonResponse({ project: versionedProject });
      }
      return jsonResponse({ error: 'not found' }, 404);
    });

    render(<App />);
    await openDeliveryConsole();

    const requirementActionCenter = await screen.findByLabelText('需求处理中心');
    const prdImpact = within(requirementActionCenter).getByLabelText('PRD 版本与变更影响');
    expect(within(prdImpact).getByText('PRD v1 已过期')).toBeInTheDocument();
    expect(within(prdImpact).getByText('范围边界')).toBeInTheDocument();
    expect(within(prdImpact).getByText('重新运行智能需求评审')).toBeInTheDocument();
    expect(within(prdImpact).getByText('重新生成需求文档草稿')).toBeInTheDocument();
  });

  test('renders the viewed stage panel instead of the current stage panel', async () => {
    const acceptanceStage = {
      id: 'acceptance',
      name: '最终验收',
      owner: '负责人',
      status: 'active',
      description: '汇总验收。',
      checklist: ['确认验收包'],
    };
    const acceptanceProject = {
      ...baseProject,
      currentStageId: 'acceptance',
      currentStageName: '最终验收',
      currentOwner: '负责人',
      stageProgress: 4,
      totalStages: 4,
      stages: [...stages.map((stage) => ({ ...stage, status: 'approved' })), acceptanceStage],
      acceptancePackage: {
        status: 'ready',
        signoffStatus: 'pending',
        summary: '最终验收包已生成。',
      },
    };

    global.fetch = vi.fn(async (url, options = {}) => {
      if (url === '/api/users' && !options.method) {
        return jsonResponse({ users: appUsers, currentUser: appUsers[0] });
      }
      if (url === '/api/projects' && !options.method) {
        return jsonResponse({
          projects: [
            {
              ...projectSummary,
              currentStageId: 'acceptance',
              currentStageName: '最终验收',
              currentOwner: '负责人',
            },
          ],
        });
      }
      if (url === '/api/projects/demo-1' && !options.method) {
        return jsonResponse({ project: acceptanceProject });
      }
      return jsonResponse({ error: 'not found' }, 404);
    });

    render(<App />);
    await openDeliveryConsole();

    fireEvent.click(await screen.findByRole('tab', { name: '需求文档' }));
    await screen.findByLabelText('当前任务速览');
    await expandCurrentTaskSection();

    expect(await screen.findByLabelText('需求处理中心')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: '最终验收包' })).not.toBeInTheDocument();
  });

  test('shows the commercial SaaS operations cockpit', async () => {
    render(<App />);
    await openOperationsConsole();

    expect(await screen.findByText('商业化运营后台')).toBeInTheDocument();
    expect(screen.queryByText('Platform operations')).not.toBeInTheDocument();
    const operationsRadar = screen.getByLabelText('运营态势总览');
    expect(within(operationsRadar).getByText('运营态势')).toBeInTheDocument();
    expect(within(operationsRadar).getByText('后台任务')).toBeInTheDocument();
    expect(within(operationsRadar).getByText('部署阻塞')).toBeInTheDocument();
    expect(within(operationsRadar).getByText('安全事件')).toBeInTheDocument();
    expect(within(operationsRadar).getByText('预算风险')).toBeInTheDocument();
    expect(screen.getAllByText('WeeCoder Labs').length).toBeGreaterThan(0);
    expect(screen.getByText('JSON 存储')).toBeInTheDocument();
    expect(screen.getByText(/PostgreSQL/)).toBeInTheDocument();
    expect(screen.getByText('后台任务 3')).toBeInTheDocument();
    expect(screen.getByText('生产环境')).toBeInTheDocument();
    expect(screen.getByText('预计费用 ¥8.25')).toBeInTheDocument();
    expect(screen.getByText('最近审计')).toBeInTheDocument();
  });

  test('shows a compact operations priority strip before detailed cockpit cards', async () => {
    render(<App />);
    await openOperationsConsole();

    const priorityStrip = await screen.findByLabelText('运营优先处理条');
    expect(within(priorityStrip).getByText('优先处理')).toBeInTheDocument();
    expect(within(priorityStrip).getByText('需要处理 4 个关键项')).toBeInTheDocument();
    expect(within(priorityStrip).getByText('后台任务失败 1')).toBeInTheDocument();
    expect(within(priorityStrip).getByText('发布阻塞 2')).toBeInTheDocument();
    expect(within(priorityStrip).getByText('SLA 超时 1')).toBeInTheDocument();
    expect(within(priorityStrip).getByText('预算风险 0')).toBeInTheDocument();
    expect(
      within(priorityStrip).getByText('下一步：请 林项目经理 补齐项目经理需求信息。'),
    ).toBeInTheDocument();
  });

  test('shows cost center breakdown in the commercial cockpit', async () => {
    const costPlatform = {
      ...platformCockpit,
      governance: {
        ...platformCockpit.governance,
        cost: {
          currency: 'CNY',
          totalEstimatedCny: 10.1,
          aiEstimatedCny: 3.8,
          runnerEstimatedCny: 1,
          waitingEstimatedCny: 0.9,
          deploymentEstimatedCny: 4.4,
          budgetStatus: 'over-budget',
          budgetLimitCny: 8,
          budgetDeltaCny: 2.1,
          nextAction: 'Review over-budget projects and pause non-critical runner or deployment work.',
          summary: {
            projectCount: 1,
            jobCount: 5,
            artifactCount: 2,
            checkCount: 4,
            waitingItemCount: 6,
            deploymentEnvironmentCount: 3,
            overBudgetProjectCount: 1,
            nearBudgetProjectCount: 0,
          },
          categories: [
            { id: 'deployment', label: 'Deployment environments', estimatedCny: 4.4, share: 44, unitCount: 3 },
            { id: 'ai', label: 'AI generation', estimatedCny: 3.8, share: 38, unitCount: 7 },
            { id: 'runner', label: 'Runner checks', estimatedCny: 1, share: 10, unitCount: 4 },
            {
              id: 'waiting',
              label: 'Waiting blockers',
              estimatedCny: 0.9,
              share: 9,
              unitCount: 6,
            },
          ],
          projects: [
            {
              projectId: 'camera',
              projectName: 'Camera Monitor',
              totalEstimatedCny: 10.1,
              aiEstimatedCny: 3.8,
              runnerEstimatedCny: 1,
              waitingEstimatedCny: 0.9,
              deploymentEstimatedCny: 4.4,
              budgetLimitCny: 8,
              budgetStatus: 'over-budget',
              budgetDeltaCny: 2.1,
              nextAction: 'Reduce deployment environments or review failed/repeated job runs.',
              drivers: {
                artifactCount: 2,
                jobCount: 5,
                checkCount: 4,
                waitingItemCount: 6,
                deploymentEnvironmentCount: 3,
              },
            },
          ],
          budgetRisks: [
            {
              projectId: 'camera',
              projectName: 'Camera Monitor',
              budgetStatus: 'over-budget',
              budgetDeltaCny: 2.1,
              nextAction: 'Reduce deployment environments or review failed/repeated job runs.',
            },
          ],
          drivers: [
            { id: 'artifacts', label: 'Generated artifacts', count: 2, rateCny: 0.4 },
            { id: 'jobs', label: 'Platform jobs', count: 5, rateCny: 0.6 },
            { id: 'checks', label: 'Verification checks', count: 4, rateCny: 0.25 },
            { id: 'waiting', label: 'Open waiting items', count: 6, rateCny: 0.15 },
            { id: 'deployment-environments', label: 'Deployment environments', count: 3, rateCny: 'tiered' },
          ],
        },
      },
    };

    global.fetch = vi.fn(async (url, options = {}) => {
      if (url === '/api/users' && !options.method) {
        return jsonResponse({ users: appUsers, currentUser: appUsers[0] });
      }
      if (url === '/api/platform' && !options.method) {
        return jsonResponse({ platform: costPlatform });
      }
      if (url === '/api/projects' && !options.method) {
        return jsonResponse({ projects: [projectSummary] });
      }
      if (url === '/api/projects/demo-1' && !options.method) {
        return jsonResponse({ project: baseProject });
      }
      return jsonResponse({ error: `Unhandled ${url}` }, 404);
    });

    render(<App />);
    await openOperationsConsole();

    const costCard = (await screen.findByText('费用统计')).closest('article');
    expect(within(costCard).getByText('预算 超预算 · 上限 ¥8 · 偏差 ¥2.1')).toBeInTheDocument();
    const costDetails = within(costCard).getByLabelText('费用明细');
    expect(costDetails.tagName).toBe('DETAILS');
    expect(costDetails).not.toHaveAttribute('open');
    expect(within(costDetails).getByText('费用明细')).toBeVisible();
    expect(within(costDetails).getByText('分类 4 · 项目 1 · 风险 1')).toBeVisible();
    expect(within(costDetails).getByText('部署环境 · ¥4.4')).not.toBeVisible();

    fireEvent.click(within(costDetails).getByText('费用明细'));
    expect(costDetails).toHaveAttribute('open');
    expect(within(costDetails).getByText('部署环境 · ¥4.4')).toBeVisible();
    expect(within(costDetails).getByText('AI 生成 · ¥3.8')).toBeVisible();
    expect(within(costDetails).getByText('执行器检查 · ¥1')).toBeVisible();
    expect(within(costDetails).getByText('等待阻塞 · ¥0.9')).toBeVisible();
    expect(within(costDetails).getByText('Camera Monitor · ¥10.1')).toBeVisible();
    expect(within(costDetails).getByText('任务 5 / 检查 4 / 等待 6 / 环境 3')).toBeVisible();
    expect(within(costDetails).getByText('Camera Monitor · 超预算 · +¥2.1')).toBeVisible();
    expect(within(costDetails).getByText('减少部署环境，或复核失败与重复运行的任务。')).toBeVisible();
  });

  test('queues an AI coding platform job from the cockpit', async () => {
    const queuedJob = {
      id: 'queued-ai-job',
      projectId: 'demo-1',
      projectName: '客户门户',
      organizationId: 'wee-coder-labs',
      type: 'ai-development',
      title: 'AI coding 后台任务',
      status: 'queued',
      queuedAt: '2026-06-17T01:00:00.000Z',
      executor: 'codex-local',
      command: 'npm test',
    };
    const nextPlatform = {
      ...platformCockpit,
      aiOperations: {
        ...platformCockpit.aiOperations,
        queue: {
          ...platformCockpit.aiOperations.queue,
          totalJobs: 4,
          queuedCount: 2,
        },
        jobs: [queuedJob, ...platformCockpit.aiOperations.jobs],
      },
      governance: {
        ...platformCockpit.governance,
        auditLog: [
          {
            id: 'audit-platform-job',
            projectId: 'demo-1',
            projectName: '客户门户',
            type: 'platform-job-queued',
            actor: '负责人',
            note: '已加入后台任务队列：AI coding 后台任务',
            at: '2026-06-17T01:00:00.000Z',
          },
          ...platformCockpit.governance.auditLog,
        ],
      },
    };

    global.fetch = vi.fn(async (url, options = {}) => {
      if (url === '/api/users' && !options.method) {
        return jsonResponse({ users: appUsers, currentUser: appUsers[0] });
      }
      if (url === '/api/platform' && !options.method) {
        return jsonResponse({ platform: platformCockpit });
      }
      if (url === '/api/projects' && !options.method) {
        return jsonResponse({ projects: [projectSummary] });
      }
      if (url === '/api/projects/demo-1' && !options.method) {
        return jsonResponse({ project: baseProject });
      }
      if (url === '/api/projects/demo-1/platform-jobs' && options.method === 'POST') {
        return jsonResponse(
          {
            project: {
              ...baseProject,
              platformJobs: [queuedJob],
            },
            job: queuedJob,
            platform: nextPlatform,
          },
          201,
        );
      }
      return jsonResponse({ error: 'not found' }, 404);
    });

    render(<App />);
    await openOperationsConsole();

    const button = await screen.findByRole('button', { name: '创建 AI 任务' });
    await waitFor(() => {
      expect(button).not.toBeDisabled();
    });
    fireEvent.click(button);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/projects/demo-1/platform-jobs',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            'X-Organization-Id': 'wee-coder-labs',
          }),
        }),
      );
    });
    expect(await screen.findByText('后台任务 4')).toBeInTheDocument();
    expect(screen.getAllByText('AI coding 后台任务 · 排队').length).toBeGreaterThan(0);
  });

  test('advances platform job lifecycle from the cockpit', async () => {
    const queuedJob = {
      id: 'queued-ai-job',
      projectId: 'demo-1',
      projectName: '客户门户',
      organizationId: 'wee-coder-labs',
      type: 'ai-development',
      title: 'AI coding 后台任务',
      status: 'queued',
      queuedAt: '2026-06-17T01:00:00.000Z',
      executor: 'codex-local',
      command: 'npm test',
    };
    const runningJob = {
      ...queuedJob,
      status: 'running',
      startedAt: '2026-06-17T01:05:00.000Z',
      runCount: 1,
    };
    const succeededJob = {
      ...runningJob,
      status: 'succeeded',
      finishedAt: '2026-06-17T01:10:00.000Z',
      command: 'npm test',
      durationMs: 42,
      exitCode: 0,
      resultSummary: 'All verification commands passed.',
      stdout: 'tests passed',
      stderr: '',
    };
    const queuedPlatform = {
      ...platformCockpit,
      aiOperations: {
        ...platformCockpit.aiOperations,
        queue: {
          ...platformCockpit.aiOperations.queue,
          totalJobs: 1,
          queuedCount: 1,
          runningCount: 0,
          failedCount: 0,
          succeededCount: 0,
        },
        jobs: [queuedJob],
      },
    };
    const runningPlatform = {
      ...queuedPlatform,
      aiOperations: {
        ...queuedPlatform.aiOperations,
        queue: {
          ...queuedPlatform.aiOperations.queue,
          queuedCount: 0,
          runningCount: 1,
        },
        jobs: [runningJob],
      },
    };
    const succeededPlatform = {
      ...runningPlatform,
      aiOperations: {
        ...runningPlatform.aiOperations,
        queue: {
          ...runningPlatform.aiOperations.queue,
          runningCount: 0,
          succeededCount: 1,
        },
        jobs: [succeededJob],
      },
      governance: {
        ...runningPlatform.governance,
        auditLog: [
          {
            id: 'audit-job-succeeded',
            projectId: 'demo-1',
            projectName: '客户门户',
            type: 'platform-job-succeeded',
            actor: '负责人',
            note: '后台任务已成功：AI coding 后台任务',
            at: '2026-06-17T01:10:00.000Z',
          },
        ],
      },
    };

    global.fetch = vi.fn(async (url, options = {}) => {
      if (url === '/api/users' && !options.method) {
        return jsonResponse({ users: appUsers, currentUser: appUsers[0] });
      }
      if (url === '/api/platform' && !options.method) {
        return jsonResponse({ platform: queuedPlatform });
      }
      if (url === '/api/projects' && !options.method) {
        return jsonResponse({ projects: [projectSummary] });
      }
      if (url === '/api/projects/demo-1' && !options.method) {
        return jsonResponse({ project: { ...baseProject, platformJobs: [queuedJob] } });
      }
      if (
        url === '/api/projects/demo-1/platform-jobs/queued-ai-job/start' &&
        options.method === 'POST'
      ) {
        return jsonResponse({
          project: { ...baseProject, platformJobs: [runningJob] },
          job: runningJob,
          platform: runningPlatform,
        });
      }
      if (
        url === '/api/projects/demo-1/platform-jobs/queued-ai-job/complete' &&
        options.method === 'POST'
      ) {
        return jsonResponse({
          project: { ...baseProject, platformJobs: [succeededJob] },
          job: succeededJob,
          platform: succeededPlatform,
        });
      }
      return jsonResponse({ error: 'not found' }, 404);
    });

    render(<App />);
    await openOperationsConsole();

    expect((await screen.findAllByText('AI coding 后台任务 · 排队')).length).toBeGreaterThan(0);
    await expandPlatformJobDetails();
    fireEvent.click(screen.getByRole('button', { name: '开始任务' }));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/projects/demo-1/platform-jobs/queued-ai-job/start',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ execute: true }),
        }),
      );
    });
    expect(await screen.findByText('运行 1 · 失败 0 · 成功 0')).toBeInTheDocument();
    expect(screen.getAllByText('AI coding 后台任务 · 运行中').length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole('button', { name: '完成任务' }));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/projects/demo-1/platform-jobs/queued-ai-job/complete',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ resultSummary: '管理后台确认任务完成。' }),
        }),
      );
    });
    expect(await screen.findByText('运行 0 · 失败 0 · 成功 1')).toBeInTheDocument();
    expect(screen.getAllByText('AI coding 后台任务 · 成功').length).toBeGreaterThan(0);
    expect(screen.getAllByText('命令：npm test').length).toBeGreaterThan(0);
    expect(screen.getByText('退出码 0 · 42ms')).toBeInTheDocument();
    expect(screen.getByText('结果：所有验证命令已通过。')).toBeInTheDocument();
    expect(screen.getByText('标准输出：测试已通过')).toBeInTheDocument();
    expect(screen.getByText('后台任务成功')).toBeInTheDocument();
  });

  test('retries and cancels platform jobs from the cockpit', async () => {
    const failedJob = {
      id: 'failed-ai-job',
      projectId: 'demo-1',
      projectName: '客户门户',
      organizationId: 'wee-coder-labs',
      type: 'ai-development',
      title: 'AI coding 后台任务',
      status: 'failed',
      queuedAt: '2026-06-17T01:00:00.000Z',
      finishedAt: '2026-06-17T01:10:00.000Z',
      runCount: 1,
      executor: 'codex-local',
      command: 'npm test',
      errorSummary: 'runner failed',
    };
    const queuedJob = {
      id: 'queued-ai-job',
      projectId: 'demo-1',
      projectName: '客户门户',
      organizationId: 'wee-coder-labs',
      type: 'ai-development',
      title: 'QA 自动测试',
      status: 'queued',
      queuedAt: '2026-06-17T01:11:00.000Z',
      executor: 'codex-local',
      command: 'npm test',
    };
    const retriedJob = {
      ...failedJob,
      status: 'queued',
      rawStatus: 'retry-queued',
      retryQueuedAt: '2026-06-17T01:12:00.000Z',
      finishedAt: '',
      errorSummary: '',
    };
    const cancelledJob = {
      ...queuedJob,
      status: 'cancelled',
      finishedAt: '2026-06-17T01:13:00.000Z',
      errorSummary: '管理后台取消任务。',
      details: { cancelReason: '管理后台取消任务。' },
    };
    const initialPlatform = {
      ...platformCockpit,
      aiOperations: {
        ...platformCockpit.aiOperations,
        queue: {
          totalJobs: 2,
          queuedCount: 1,
          runningCount: 0,
          failedCount: 1,
          succeededCount: 0,
          cancelledCount: 0,
        },
        jobs: [failedJob, queuedJob],
      },
    };
    const retriedPlatform = {
      ...initialPlatform,
      aiOperations: {
        ...initialPlatform.aiOperations,
        queue: {
          ...initialPlatform.aiOperations.queue,
          queuedCount: 2,
          failedCount: 0,
        },
        jobs: [retriedJob, queuedJob],
      },
    };
    const cancelledPlatform = {
      ...retriedPlatform,
      aiOperations: {
        ...retriedPlatform.aiOperations,
        queue: {
          ...retriedPlatform.aiOperations.queue,
          queuedCount: 1,
          cancelledCount: 1,
        },
        jobs: [retriedJob, cancelledJob],
      },
    };

    global.fetch = vi.fn(async (url, options = {}) => {
      if (url === '/api/users' && !options.method) {
        return jsonResponse({ users: appUsers, currentUser: appUsers[0] });
      }
      if (url === '/api/platform' && !options.method) {
        return jsonResponse({ platform: initialPlatform });
      }
      if (url === '/api/projects' && !options.method) {
        return jsonResponse({ projects: [projectSummary] });
      }
      if (url === '/api/projects/demo-1' && !options.method) {
        return jsonResponse({ project: { ...baseProject, platformJobs: [failedJob, queuedJob] } });
      }
      if (
        url === '/api/projects/demo-1/platform-jobs/failed-ai-job/retry' &&
        options.method === 'POST'
      ) {
        return jsonResponse({
          project: { ...baseProject, platformJobs: [retriedJob, queuedJob] },
          job: retriedJob,
          platform: retriedPlatform,
        });
      }
      if (
        url === '/api/projects/demo-1/platform-jobs/queued-ai-job/cancel' &&
        options.method === 'POST'
      ) {
        return jsonResponse({
          project: { ...baseProject, platformJobs: [retriedJob, cancelledJob] },
          job: cancelledJob,
          platform: cancelledPlatform,
        });
      }
      return jsonResponse({ error: 'not found' }, 404);
    });

    render(<App />);
    await openOperationsConsole();

    expect((await screen.findAllByText('AI coding 后台任务 · 失败')).length).toBeGreaterThan(0);
    await expandPlatformJobDetails();
    expect(screen.getByText('测试自动化 · 排队')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '重试任务' }));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/projects/demo-1/platform-jobs/failed-ai-job/retry',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({}),
        }),
      );
    });
    expect((await screen.findAllByText('AI coding 后台任务 · 排队')).length).toBeGreaterThan(0);

    fireEvent.click(screen.getAllByRole('button', { name: '取消任务' })[1]);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/projects/demo-1/platform-jobs/queued-ai-job/cancel',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ reason: '管理后台取消任务。' }),
        }),
      );
    });
    expect((await screen.findAllByText('测试自动化 · 已取消')).length).toBeGreaterThan(0);
    expect(screen.getByText('错误：管理后台取消任务。')).toBeInTheDocument();
  });

  test('reclaims stale platform jobs from the cockpit', async () => {
    const staleJob = {
      id: 'stale-ai-job',
      projectId: 'demo-1',
      projectName: '瀹㈡埛闂ㄦ埛',
      organizationId: 'wee-coder-labs',
      type: 'ai-development',
      title: 'Stale worker job',
      status: 'running',
      queuedAt: '2026-06-17T01:00:00.000Z',
      startedAt: '2026-06-17T01:05:00.000Z',
      runCount: 1,
      executor: 'codex-local',
      command: 'npm test',
      lockedBy: 'runner-a',
      leaseHeartbeatAt: '2026-06-17T01:06:00.000Z',
      leaseExpiresAt: '2026-06-17T01:10:00.000Z',
    };
    const reclaimedJob = {
      ...staleJob,
      status: 'queued',
      rawStatus: 'reclaimed-queued',
      startedAt: '',
      finishedAt: '',
      lockedBy: '',
      leaseHeartbeatAt: '',
      leaseExpiresAt: '',
      details: {
        reclaimReason: '管理后台回收过期 worker lease。',
        previousLockedBy: 'runner-a',
        leaseExpiredAt: '2026-06-17T01:10:00.000Z',
      },
    };
    const initialPlatform = {
      ...platformCockpit,
      aiOperations: {
        ...platformCockpit.aiOperations,
        queue: {
          totalJobs: 1,
          queuedCount: 0,
          runningCount: 1,
          lockedCount: 1,
          staleLeaseCount: 1,
          failedCount: 0,
          succeededCount: 0,
        },
        jobs: [staleJob],
        executionAudit: {
          ...platformCockpit.aiOperations.executionAudit,
          workerLeases: {
            activeCount: 0,
            staleCount: 1,
            staleJobs: [
              {
                jobId: 'stale-ai-job',
                projectName: '瀹㈡埛闂ㄦ埛',
                title: 'Stale worker job',
                workerId: 'runner-a',
                leaseExpiredAt: '2026-06-17T01:10:00.000Z',
              },
            ],
          },
        },
      },
    };
    const reclaimedPlatform = {
      ...initialPlatform,
      aiOperations: {
        ...initialPlatform.aiOperations,
        queue: {
          ...initialPlatform.aiOperations.queue,
          queuedCount: 1,
          runningCount: 0,
          lockedCount: 0,
          staleLeaseCount: 0,
        },
        jobs: [reclaimedJob],
        executionAudit: {
          ...initialPlatform.aiOperations.executionAudit,
          workerLeases: {
            activeCount: 0,
            staleCount: 0,
            staleJobs: [],
          },
        },
      },
    };

    global.fetch = vi.fn(async (url, options = {}) => {
      if (url === '/api/users' && !options.method) {
        return jsonResponse({ users: appUsers, currentUser: appUsers[0] });
      }
      if (url === '/api/platform' && !options.method) {
        return jsonResponse({ platform: initialPlatform });
      }
      if (url === '/api/projects' && !options.method) {
        return jsonResponse({ projects: [projectSummary] });
      }
      if (url === '/api/projects/demo-1' && !options.method) {
        return jsonResponse({ project: { ...baseProject, platformJobs: [staleJob] } });
      }
      if (
        url === '/api/projects/demo-1/platform-jobs/stale-ai-job/reclaim' &&
        options.method === 'POST'
      ) {
        return jsonResponse({
          project: { ...baseProject, platformJobs: [reclaimedJob] },
          job: reclaimedJob,
          platform: reclaimedPlatform,
        });
      }
      return jsonResponse({ error: 'not found' }, 404);
    });

    render(<App />);
    await openOperationsConsole();

    await expandPlatformJobDetails();
    fireEvent.click(await screen.findByRole('button', { name: '回收任务' }));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/projects/demo-1/platform-jobs/stale-ai-job/reclaim',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ reason: '管理后台回收过期 worker lease。' }),
        }),
      );
    });
    expect((await screen.findAllByText(/过期执行器任务/)).length).toBeGreaterThan(0);
  });

  test('shows platform job execution audit in the commercial cockpit', async () => {
    const auditPlatform = {
      ...platformCockpit,
      aiOperations: {
        ...platformCockpit.aiOperations,
        queue: {
          totalJobs: 4,
          queuedCount: 0,
          runningCount: 0,
          failedCount: 1,
          exhaustedCount: 1,
          cancelledCount: 1,
          succeededCount: 1,
        },
        executionAudit: {
          totalJobs: 4,
          completedJobCount: 4,
          retryableFailedCount: 1,
          exhaustedCount: 1,
          cancelledCount: 1,
          missingEvidenceCount: 1,
          evidenceCoveragePercent: 75,
          averageDurationMs: 75000,
          evidenceTrail: [
            {
              jobId: 'passed-build',
              projectName: 'Camera Monitor',
              title: 'Build verification',
              status: 'succeeded',
              command: 'npm run build',
              executor: 'codex-local',
              exitCode: 0,
              durationMs: 90000,
              summary: 'Build passed.',
              stdoutExcerpt: 'built in 500ms',
              stderrExcerpt: '',
              evidenceComplete: true,
              missing: [],
            },
            {
              jobId: 'failed-review',
              projectName: 'Camera Monitor',
              title: 'Code review',
              status: 'failed',
              command: 'npm audit --omit=dev',
              executor: 'local-rule',
              exitCode: null,
              durationMs: 60000,
              summary: 'Dependency audit failed.',
              stdoutExcerpt: '',
              stderrExcerpt: '',
              evidenceComplete: false,
              missing: ['stdout/stderr', 'result summary'],
            },
          ],
          retryCandidates: [
            {
              jobId: 'failed-review',
              projectName: 'Camera Monitor',
              title: 'Code review',
              reason: 'Dependency audit failed.',
              nextAction: 'Review job logs, fix the blocker, and rerun the platform job.',
            },
          ],
          exhaustedJobs: [
            {
              jobId: 'exhausted-build',
              projectName: 'Camera Monitor',
              title: 'Build verification exhausted',
              reason: 'Command is not in the project runner allowlist and was not executed.',
              blockedCommand: 'npm run build',
              nextAction: 'Escalate to the technical owner before scheduling another run.',
            },
          ],
          cancelledJobs: [
            {
              jobId: 'cancelled-qa',
              projectName: 'Camera Monitor',
              title: 'QA cancelled run',
              reason: 'Manual cancellation.',
              nextAction: 'Confirm whether the cancelled job should stay closed or be queued again.',
            },
          ],
          latestBlocker: {
            jobId: 'exhausted-build',
            projectName: 'Camera Monitor',
            title: 'Build verification exhausted',
            status: 'exhausted',
            reason: 'Command is not in the project runner allowlist and was not executed.',
            sandboxPolicy: 'project-verification-command-allowlist',
            blockedCommand: 'npm run build',
            nextAction: 'Escalate to the technical owner before scheduling another run.',
          },
          actionGroups: [
            {
              id: 'retryable',
              title: 'Retryable failed jobs',
              count: 1,
              nextAction: 'Fix blockers and retry eligible jobs from the cockpit.',
            },
            {
              id: 'exhausted',
              title: 'Retry attempts exhausted',
              count: 1,
              nextAction: 'Escalate exhausted jobs to the technical owner.',
            },
            {
              id: 'cancelled',
              title: 'Cancelled jobs',
              count: 1,
              nextAction: 'Review cancellations and decide whether to queue replacement jobs.',
            },
          ],
          evidenceGaps: [
            {
              jobId: 'failed-review',
              projectName: 'Camera Monitor',
              title: 'Code review',
              missing: ['stdout/stderr', 'result summary'],
            },
          ],
          executorHealth: [
            {
              executor: 'local-rule',
              totalJobs: 1,
              failedCount: 1,
              succeededCount: 0,
              averageDurationMs: 60000,
            },
          ],
          workerLeases: {
            activeCount: 1,
            staleCount: 1,
            nextAction: 'Reclaim or fail stale platform jobs before starting new AI coding work.',
            staleJobs: [
              {
                jobId: 'stale-qa',
                projectName: 'Camera Monitor',
                title: 'QA stale run',
                workerId: 'runner-b',
                leaseExpiredAt: '2026-06-17T01:02:00.000Z',
                nextAction: 'Reclaim or fail this stale platform job from the queue controls.',
              },
            ],
          },
        },
      },
    };

    global.fetch = vi.fn(async (url, options = {}) => {
      if (url === '/api/users' && !options.method) {
        return jsonResponse({ users: appUsers, currentUser: appUsers[0] });
      }
      if (url === '/api/platform' && !options.method) {
        return jsonResponse({ platform: auditPlatform });
      }
      if (url === '/api/projects' && !options.method) {
        return jsonResponse({ projects: [projectSummary] });
      }
      if (url === '/api/projects/demo-1' && !options.method) {
        return jsonResponse({ project: baseProject });
      }
      return jsonResponse({ error: 'not found' }, 404);
    });

    render(<App />);
    await openOperationsConsole();

    const queueCard = (await screen.findByText('执行审计')).closest('article');
    expect(screen.queryByLabelText('Execution audit')).not.toBeInTheDocument();
    const executionAuditDetails = within(queueCard).getByLabelText('执行审计');
    expect(executionAuditDetails.tagName).toBe('DETAILS');
    expect(executionAuditDetails).not.toHaveAttribute('open');
    expect(within(executionAuditDetails).getByText('执行审计')).toBeVisible();
    expect(within(executionAuditDetails).getByText('可重试 1 · 重试耗尽 1 · 缺少证据 1')).toBeVisible();
    expect(within(executionAuditDetails).getByText('测试验证运行已过期 · runner-b')).not.toBeVisible();
    fireEvent.click(within(executionAuditDetails).getByText('执行审计'));
    expect(executionAuditDetails).toHaveAttribute('open');
    expect(within(executionAuditDetails).getByText('测试验证运行已过期 · runner-b')).toBeVisible();
    expect(within(queueCard).queryByLabelText('Worker lease alerts')).not.toBeInTheDocument();
    expect(within(queueCard).getByLabelText('过期执行器租约')).toBeInTheDocument();
    expect(within(queueCard).queryByLabelText('Execution evidence trail')).not.toBeInTheDocument();
    expect(within(queueCard).getByLabelText('执行证据链')).toBeInTheDocument();
    expect(within(queueCard).getByText('可重试 1')).toBeInTheDocument();
    expect(within(queueCard).getByText('重试耗尽 1')).toBeInTheDocument();
    expect(within(queueCard).getByText('已取消 1')).toBeInTheDocument();
    expect(within(queueCard).getByText('缺少证据 1')).toBeInTheDocument();
    expect(within(queueCard).getByText('证据覆盖率 75%')).toBeInTheDocument();
    expect(within(queueCard).getByText('活跃租约 1 · 过期 1')).toBeInTheDocument();
    expect(within(queueCard).getByText('测试验证运行已过期 · runner-b')).toBeInTheDocument();
    expect(within(queueCard).getByText('过期时间 2026-06-17T01:02:00.000Z')).toBeInTheDocument();
    expect(within(queueCard).getByText('平均 75000ms')).toBeInTheDocument();
    expect(within(queueCard).getByText('证据已齐 · 构建验证 · Camera Monitor')).toBeInTheDocument();
    expect(within(queueCard).getByText('构建已通过。')).toBeInTheDocument();
    expect(within(queueCard).getByText('标准输出 built in 500ms')).toBeInTheDocument();
    expect(within(queueCard).getByText('证据缺口 · 代码评审 · Camera Monitor')).toBeInTheDocument();
    expect(within(queueCard).getByText('缺失 标准输出/错误输出、结果摘要')).toBeInTheDocument();
    expect(within(queueCard).getByText('最新阻塞')).toBeInTheDocument();
    expect(within(queueCard).getAllByText('构建验证重试耗尽 · Camera Monitor').length).toBeGreaterThan(0);
    expect(within(queueCard).getByText('阻断命令：npm run build')).toBeInTheDocument();
    expect(within(queueCard).getAllByText('再次调度前请升级给技术负责人处理。').length).toBeGreaterThan(0);
    expect(within(queueCard).getByText('重试次数耗尽 1')).toBeInTheDocument();
    expect(within(queueCard).getByText('已取消任务 1')).toBeInTheDocument();
    expect(within(queueCard).getByText('测试验证运行已取消 · Camera Monitor')).toBeInTheDocument();
    expect(within(queueCard).getByText('本地规则 · 失败 1')).toBeInTheDocument();
    expect(within(queueCard).getByText('代码评审 · Camera Monitor')).toBeInTheDocument();
    expect(within(queueCard).getAllByText('依赖审计失败。').length).toBeGreaterThan(0);
  });

  test('shows agent job run ledger in the commercial cockpit', async () => {
    const runLedgerPlatform = {
      ...platformCockpit,
      aiOperations: {
        ...platformCockpit.aiOperations,
        queue: {
          totalJobs: 1,
          queuedCount: 0,
          runningCount: 1,
          failedCount: 0,
          succeededCount: 0,
        },
        runLedger: {
          totalRunCount: 2,
          activeRunCount: 1,
          terminalRunCount: 1,
          totalEventCount: 4,
          staleRunCount: 0,
          nextAction: 'Review active runs and terminal evidence before approving delivery gates.',
          rows: [
            {
              runId: 'job-ai-detect-run-2',
              jobId: 'job-ai-detect',
              projectName: 'Camera Monitor',
              title: 'AI coding verification',
              runNumber: 2,
              status: 'running',
              workerId: 'runner-a',
              leaseHeartbeatAt: '2026-06-17T01:09:00.000Z',
              leaseExpiresAt: '2026-06-17T01:19:00.000Z',
              startedAt: '2026-06-17T01:05:00.000Z',
              updatedAt: '2026-06-17T01:09:00.000Z',
              eventCount: 2,
              latestEventType: 'platform-job-heartbeat',
              latestEventAt: '2026-06-17T01:09:00.000Z',
            },
            {
              runId: 'job-ai-detect-run-1',
              jobId: 'job-ai-detect',
              projectName: 'Camera Monitor',
              title: 'AI coding verification',
              runNumber: 1,
              status: 'reclaimed',
              workerId: 'runner-old',
              finishedAt: '2026-06-17T00:20:00.000Z',
              durationMs: 900000,
              eventCount: 2,
              latestEventType: 'platform-job-reclaimed',
              latestEventAt: '2026-06-17T00:20:00.000Z',
            },
          ],
        },
      },
    };

    global.fetch = vi.fn(async (url, options = {}) => {
      if (url === '/api/users' && !options.method) {
        return jsonResponse({ users: appUsers, currentUser: appUsers[0] });
      }
      if (url === '/api/platform' && !options.method) {
        return jsonResponse({ platform: runLedgerPlatform });
      }
      if (url === '/api/projects' && !options.method) {
        return jsonResponse({ projects: [projectSummary] });
      }
      if (url === '/api/projects/demo-1' && !options.method) {
        return jsonResponse({ project: baseProject });
      }
      return jsonResponse({ error: 'not found' }, 404);
    });

    render(<App />);
    await openOperationsConsole();

    const queueCard = (await screen.findByText('运行台账')).closest('article');
    expect(within(queueCard).getByText('运行 2 · 活跃 1 · 已结束 1 · 事件 4')).toBeInTheDocument();
    expect(within(queueCard).getAllByText('智能开发验证 · Camera Monitor')).toHaveLength(2);
    expect(within(queueCard).getByText('运行 2 · 运行中 · runner-a')).toBeInTheDocument();
    expect(within(queueCard).getByText('最新 后台任务心跳 · 2026-06-17T01:09:00.000Z')).toBeInTheDocument();
    expect(within(queueCard).getByText('心跳 2026-06-17T01:09:00.000Z · 过期 2026-06-17T01:19:00.000Z')).toBeInTheDocument();
    expect(within(queueCard).getByText('运行 1 · 已回收 · runner-old')).toBeInTheDocument();
    expect(within(queueCard).getByText('耗时 900000ms · 退出码 待返回 · 事件 2')).toBeInTheDocument();
    expect(within(queueCard).getByText('批准交付闸口前复核活跃运行和终态证据。')).toBeInTheDocument();
  });

  test('opens a platform job detail panel with run timeline and execution evidence', async () => {
    const detailPlatform = {
      ...platformCockpit,
      aiOperations: {
        ...platformCockpit.aiOperations,
        queue: {
          totalJobs: 2,
          queuedCount: 0,
          runningCount: 1,
          failedCount: 1,
          succeededCount: 0,
        },
        jobs: [
          {
            id: 'job-ai-detect',
            projectName: 'Camera Monitor',
            type: 'ai-development',
            title: 'AI coding verification',
            status: 'running',
            executor: 'codex-local',
            command: 'npm test',
            requestedBy: 'owner-aa',
            runCount: 2,
          },
          {
            id: 'job-code-review',
            projectName: 'Camera Monitor',
            type: 'code-review',
            title: 'Code review',
            status: 'failed',
            executor: 'local-rule',
            command: 'npm audit --omit=dev',
            requestedBy: 'tech-chen',
            runCount: 1,
            errorSummary: 'Dependency audit failed.',
            details: {
              sandboxPolicy: 'project-verification-command-allowlist',
              blockedCommand: 'npm run build',
            },
          },
        ],
        runLedger: {
          totalRunCount: 2,
          activeRunCount: 1,
          terminalRunCount: 1,
          totalEventCount: 4,
          rows: [
            {
              runId: 'job-ai-detect-run-2',
              jobId: 'job-ai-detect',
              projectName: 'Camera Monitor',
              title: 'AI coding verification',
              runNumber: 2,
              status: 'running',
              workerId: 'runner-a',
              eventCount: 2,
              latestEventType: 'platform-job-heartbeat',
              latestEventAt: '2026-06-17T01:09:00.000Z',
            },
            {
              runId: 'job-code-review-run-1',
              jobId: 'job-code-review',
              projectName: 'Camera Monitor',
              title: 'Code review',
              runNumber: 1,
              status: 'failed',
              workerId: 'runner-review',
              startedAt: '2026-06-17T02:00:00.000Z',
              finishedAt: '2026-06-17T02:02:00.000Z',
              durationMs: 120000,
              exitCode: 1,
              eventCount: 2,
              latestEventType: 'platform-job-failed',
              latestEventAt: '2026-06-17T02:02:00.000Z',
              lifecycle: [
                {
                  eventId: 'review-started',
                  type: 'platform-job-started',
                  workerId: 'runner-review',
                  jobStatus: 'running',
                  createdAt: '2026-06-17T02:00:00.000Z',
                },
                {
                  eventId: 'review-failed',
                  type: 'platform-job-failed',
                  workerId: 'runner-review',
                  jobStatus: 'failed',
                  createdAt: '2026-06-17T02:02:00.000Z',
                },
              ],
            },
          ],
        },
        executionAudit: {
          totalJobs: 2,
          retryableFailedCount: 1,
          exhaustedCount: 0,
          cancelledCount: 0,
          missingEvidenceCount: 0,
          averageDurationMs: 120000,
          evidenceTrail: [
            {
              jobId: 'job-code-review',
              projectName: 'Camera Monitor',
              title: 'Code review',
              status: 'failed',
              command: 'npm audit --omit=dev',
              executor: 'local-rule',
              exitCode: 1,
              durationMs: 120000,
              summary: 'Dependency audit failed.',
              stdoutExcerpt: '0 vulnerabilities before policy check',
              stderrExcerpt: 'blocked command npm run build',
              evidenceComplete: true,
              missing: [],
            },
          ],
          retryCandidates: [
            {
              jobId: 'job-code-review',
              projectName: 'Camera Monitor',
              title: 'Code review',
              reason: 'Dependency audit failed.',
              nextAction: 'Fix blockers and retry eligible jobs from the cockpit.',
            },
          ],
          latestBlocker: {
            jobId: 'job-code-review',
            projectName: 'Camera Monitor',
            title: 'Code review',
            reason: 'Dependency audit failed.',
            blockedCommand: 'npm run build',
            nextAction: 'Fix blockers and retry eligible jobs from the cockpit.',
          },
          workerLeases: {
            activeCount: 1,
            staleCount: 0,
            staleJobs: [],
          },
        },
      },
    };

    global.fetch = vi.fn(async (url, options = {}) => {
      if (url === '/api/users' && !options.method) {
        return jsonResponse({ users: appUsers, currentUser: appUsers[0] });
      }
      if (url === '/api/platform' && !options.method) {
        return jsonResponse({ platform: detailPlatform });
      }
      if (url === '/api/projects' && !options.method) {
        return jsonResponse({ projects: [projectSummary] });
      }
      if (url === '/api/projects/demo-1' && !options.method) {
        return jsonResponse({ project: baseProject });
      }
      return jsonResponse({ error: 'not found' }, 404);
    });

    render(<App />);
    await openOperationsConsole();

    await expandPlatformJobDetails();
    fireEvent.click((await screen.findAllByRole('button', { name: '查看详情' }))[1]);

    const detailPanel = screen.getByLabelText('后台任务详情');
    expect(within(detailPanel).getByText('任务详情')).toBeInTheDocument();
    expect(within(detailPanel).getByText('代码评审 · Camera Monitor')).toBeInTheDocument();
    expect(within(detailPanel).getByText('失败 · local-rule · 运行次数 1')).toBeInTheDocument();
    expect(within(detailPanel).getByText('命令 npm audit --omit=dev')).toBeInTheDocument();
    expect(within(detailPanel).getByText('发起人 tech-chen')).toBeInTheDocument();
    expect(within(detailPanel).getByText('运行时间线')).toBeInTheDocument();
    expect(within(detailPanel).getByText('运行 1 · 失败 · runner-review')).toBeInTheDocument();
    expect(within(detailPanel).getByText('后台任务已开始 · 2026-06-17T02:00:00.000Z')).toBeInTheDocument();
    expect(within(detailPanel).getByText('后台任务失败 · 2026-06-17T02:02:00.000Z')).toBeInTheDocument();
    expect(within(detailPanel).getByText('执行证据')).toBeInTheDocument();
    expect(within(detailPanel).getByText('标准输出 0 vulnerabilities before policy check')).toBeInTheDocument();
    expect(within(detailPanel).getByText('错误输出 blocked command npm run build')).toBeInTheDocument();
    expect(within(detailPanel).getByText('阻断命令：npm run build')).toBeInTheDocument();
    expect(within(detailPanel).getByText('下一步：先修复阻塞，再在控制台重试符合条件的任务。')).toBeInTheDocument();
  });

  test('switches organization and reloads tenant-scoped projects with organization headers', async () => {
    const pilotSummary = {
      ...projectSummary,
      id: 'pilot-1',
      organizationId: 'acme-security-pilot',
      name: '试点摄像头项目',
      currentStageName: '运维需求',
      stageProgress: 4,
    };
    const pilotProject = {
      ...baseProject,
      ...pilotSummary,
      currentStageId: 'ops-requirements',
      stages: [
        { ...stages[0], status: 'approved' },
        { ...stages[1], status: 'approved' },
        { ...stages[2], status: 'approved' },
        {
          id: 'ops-requirements',
          name: '运维需求',
          owner: '运维',
          status: 'active',
          description: '确认服务器与运行环境。',
          checklist: ['列出资源规格'],
        },
      ],
    };
    const pilotPlatform = {
      ...platformCockpit,
      session: {
        ...platformCockpit.session,
        currentOrganization: {
          id: 'acme-security-pilot',
          name: '安防试点组织',
          plan: 'Pilot',
          status: 'active',
        },
      },
      tenancy: {
        ...platformCockpit.tenancy,
        currentOrganizationId: 'acme-security-pilot',
        currentOrganizationName: '安防试点组织',
        plan: 'Pilot',
        activeUserCount: 3,
        visibleProjectCount: 1,
      },
    };

    global.fetch = vi.fn(async (url, options = {}) => {
      const organizationId = options.headers?.['X-Organization-Id'];
      if (url === '/api/users' && !options.method) {
        return jsonResponse({ users: appUsers, currentUser: appUsers[0] });
      }
      if (url === '/api/platform' && !options.method) {
        return jsonResponse({
          platform: organizationId === 'acme-security-pilot' ? pilotPlatform : platformCockpit,
        });
      }
      if (url === '/api/projects' && !options.method) {
        return jsonResponse({
          projects: organizationId === 'acme-security-pilot' ? [pilotSummary] : [projectSummary],
        });
      }
      if (url === '/api/projects/demo-1' && !options.method) {
        return jsonResponse({ project: baseProject });
      }
      if (url === '/api/projects/pilot-1' && !options.method) {
        return jsonResponse({ project: pilotProject });
      }
      return jsonResponse({ error: 'not found' }, 404);
    });

    render(<App />);

    expect((await screen.findAllByText('客户门户')).length).toBeGreaterThan(0);
    fireEvent.change(screen.getByLabelText('当前组织'), {
      target: { value: 'acme-security-pilot' },
    });

    expect((await screen.findAllByText('试点摄像头项目')).length).toBeGreaterThan(0);
    expect(screen.getAllByText('安防试点组织').length).toBeGreaterThan(0);
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/projects',
        expect.objectContaining({
          headers: expect.objectContaining({
            'X-Organization-Id': 'acme-security-pilot',
          }),
        }),
      );
    });
    expect(screen.queryByText('客户门户')).not.toBeInTheDocument();
  });

  test('shows a role inbox with the selected user queue', async () => {
    render(<App />);
    await openTaskConsole();

    fireEvent.change(await screen.findByLabelText('当前用户'), {
      target: { value: 'pm-lin' },
    });

    expect(await screen.findByText('角色待办收件箱')).toBeInTheDocument();
    const roleInboxFocus = screen.getByLabelText('角色待办焦点');
    expect(within(roleInboxFocus).getByText('当前焦点')).toBeInTheDocument();
    expect(within(roleInboxFocus).getByText('处理角色')).toBeInTheDocument();
    expect(within(roleInboxFocus).getByText('优先级依据')).toBeInTheDocument();
    expect(within(roleInboxFocus).getByText('当前筛选：全部')).toBeInTheDocument();
    expect(within(roleInboxFocus).getByText(/^全部 \d+$/)).toBeInTheDocument();
    expect(within(roleInboxFocus).getByText(/^我的 \d+$/)).toBeInTheDocument();
    expect(within(roleInboxFocus).getByText(/^角色 \d+$/)).toBeInTheDocument();
    expect(within(roleInboxFocus).getByText(/^项目 \d+$/)).toBeInTheDocument();
    expect(within(roleInboxFocus).getByRole('button', { name: '只看我的' })).toBeInTheDocument();
    expect(screen.queryByLabelText('角色待办总览')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('待办处理焦点')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('角色待办筛选')).not.toBeInTheDocument();
    const inboxDetails = screen.getByLabelText('角色待办明细');
    expect(inboxDetails).not.toHaveAttribute('open');
    expect(within(inboxDetails).queryByText('项目经理 · 林项目经理')).not.toBeInTheDocument();
    fireEvent.click(within(inboxDetails).getByText('展开角色分组'));
    expect(inboxDetails).toHaveAttribute('open');
    expect(within(inboxDetails).getByText('项目经理 · 林项目经理')).toBeInTheDocument();
    expect(within(inboxDetails).getByText('2 个缺项待办')).toBeInTheDocument();
    const currentUserGroup = screen.getByLabelText('角色待办分组 项目经理 · 林项目经理');
    expect(currentUserGroup.tagName.toLowerCase()).toBe('details');
    expect(currentUserGroup).toHaveAttribute('open');
    expect(screen.getByRole('button', { name: '查看 客户门户' })).toBeInTheDocument();
    const projectTaskDetails = within(currentUserGroup).getByLabelText('项目待办明细 客户门户');
    expect(projectTaskDetails).not.toHaveAttribute('open');
    expect(
      within(projectTaskDetails).getByRole('button', {
        name: '定位 追问：目标用户与核心场景',
        hidden: true,
      }),
    ).not.toBeVisible();
    fireEvent.click(within(projectTaskDetails).getByText('任务明细'));
    expect(projectTaskDetails).toHaveAttribute('open');
    expect(
      within(projectTaskDetails).getByRole('button', { name: '定位 追问：目标用户与核心场景' }),
    ).toBeVisible();
  });

  test('shows task priority context in the role inbox task list', async () => {
    const riskProjectSummary = {
      ...projectSummary,
      id: 'camera-priority',
      name: 'Camera Priority',
      currentStageId: 'pm-requirements',
      currentStageName: 'PM requirements',
      openFollowupTaskCount: 1,
      stageGateReport: {
        status: 'blocked',
        blockerCount: 2,
        openTaskCount: 1,
        stageName: 'PM requirements',
        requiredActions: ['Complete 2 current-stage confirmation task(s).'],
      },
      projectHealth: {
        level: 'critical',
        score: 6,
        priority: 100,
        nextAction: 'Complete 2 current-stage confirmation task(s).',
        reasons: ['Stage gate blocked by 2 item(s).'],
      },
      followupTaskAssignments: [
        {
          targetRole: 'pm',
          targetRoleLabel: 'PM',
          assigneeUserId: 'pm-lin',
          assigneeName: 'Lin PM',
          openTaskCount: 1,
          tasks: [
            {
              id: 'pm-risk-context',
              stageId: 'pm-requirements',
              stageName: 'PM requirements',
              itemId: 'risk-context',
              title: 'Clarify QA evidence',
              status: 'open',
            },
          ],
        },
      ],
    };

    global.fetch = vi.fn(async (url, options = {}) => {
      if (url === '/api/users' && !options.method) {
        return jsonResponse({ users: appUsers, currentUser: appUsers[0] });
      }
      if (url === '/api/platform' && !options.method) {
        return jsonResponse({ platform: platformCockpit });
      }
      if (url === '/api/projects' && !options.method) {
        return jsonResponse({ projects: [riskProjectSummary] });
      }
      if (url === '/api/projects/camera-priority' && !options.method) {
        return jsonResponse({ project: baseProject });
      }
      return jsonResponse({ error: 'not found' }, 404);
    });

    render(<App />);
    await openTaskConsole();

    const roleInboxFocus = await screen.findByLabelText('角色待办焦点');
    expect(within(roleInboxFocus).getByText('澄清测试证据')).toBeInTheDocument();
    expect(within(roleInboxFocus).getByText('高风险 · 得分 6')).toBeInTheDocument();
    expect(within(roleInboxFocus).getByText('补齐 2 个当前阶段确认事项。')).toBeInTheDocument();
    expect(screen.queryByText('Clarify 测试 evidence')).not.toBeInTheDocument();
    expect(screen.queryByText('Complete 2 current-stage confirmation task(s).')).not.toBeInTheDocument();
  });

  test('opens a concrete inbox task and highlights the matching confirmation item', async () => {
    const confirmationProject = {
      ...baseProject,
      stageConfirmations: {
        'pm-requirements': {
          stageId: 'pm-requirements',
          stageName: '项目经理需求',
          owner: '项目经理',
          status: 'incomplete',
          completedCount: 0,
          totalCount: 2,
          missingItems: [
            { id: 'target-users', title: '目标用户与核心场景' },
            { id: 'success-metrics', title: '成功指标与验收口径' },
          ],
          items: [
            {
              id: 'target-users',
              title: '目标用户与核心场景',
              description: '确认目标用户、核心使用场景和主要业务动作。',
              required: true,
              value: '',
              status: 'missing',
            },
            {
              id: 'success-metrics',
              title: '成功指标与验收口径',
              description: '确认可量化成功指标、验收口径和统计方式。',
              required: true,
              value: '',
              status: 'missing',
            },
          ],
        },
      },
    };

    global.fetch = vi.fn(async (url, options = {}) => {
      if (url === '/api/users' && !options.method) {
        return jsonResponse({ users: appUsers, currentUser: appUsers[0] });
      }
      if (url === '/api/projects' && !options.method) {
        return jsonResponse({ projects: [projectSummary] });
      }
      if (url === '/api/projects/demo-1' && !options.method) {
        return jsonResponse({ project: confirmationProject });
      }
      return jsonResponse({ error: 'not found' }, 404);
    });

    render(<App />);
    await openTaskConsole();

    fireEvent.change(await screen.findByLabelText('当前用户'), {
      target: { value: 'pm-lin' },
    });
    const inboxDetails = screen.getByLabelText('角色待办明细');
    fireEvent.click(within(inboxDetails).getByText('展开角色分组'));
    const projectTaskDetails = within(inboxDetails).getByLabelText('项目待办明细 客户门户');
    fireEvent.click(within(projectTaskDetails).getByText('任务明细'));
    fireEvent.click(await screen.findByRole('button', { name: '定位 追问：目标用户与核心场景' }));
    await screen.findByLabelText('当前任务速览');
    await expandCurrentTaskSection();

    await waitFor(() => {
      expect(screen.getByText('确认事项-目标用户与核心场景').closest('.stage-confirmation-item')).toHaveClass(
        'focused',
      );
    });
  });

  test('filters role inbox to the selected user queue', async () => {
    const ownerSummary = {
      ...projectSummary,
      id: 'owner-project',
      name: '负责人验收项目',
      currentStageId: 'acceptance',
      currentStageName: '最终验收',
      openFollowupTaskCount: 1,
      followupTaskTargetRoleLabels: ['负责人'],
      followupTaskAssigneeNames: ['AA'],
      followupTaskAssignments: [
        {
          targetRole: 'owner',
          targetRoleLabel: '负责人',
          assigneeUserId: 'owner-aa',
          assigneeName: 'AA',
          openTaskCount: 1,
          tasks: [
            {
              id: 'acceptance-delivery-package',
              stageId: 'acceptance',
              itemId: 'delivery-package',
              title: '追问：交付包完整性',
              status: 'open',
            },
          ],
        },
      ],
    };

    global.fetch = vi.fn(async (url, options = {}) => {
      if (url === '/api/users' && !options.method) {
        return jsonResponse({ users: appUsers, currentUser: appUsers[0] });
      }
      if (url === '/api/projects' && !options.method) {
        return jsonResponse({ projects: [projectSummary, ownerSummary] });
      }
      if (url === '/api/projects/demo-1' && !options.method) {
        return jsonResponse({ project: baseProject });
      }
      return jsonResponse({ error: 'not found' }, 404);
    });

    render(<App />);
    await openTaskConsole();

    fireEvent.change(await screen.findByLabelText('当前用户'), {
      target: { value: 'pm-lin' },
    });
    await waitFor(() => {
      expect(screen.getByLabelText('当前用户')).toHaveValue('pm-lin');
    });
    const inboxDetails = screen.getByLabelText('角色待办明细');
    fireEvent.click(within(inboxDetails).getByText('展开角色分组'));
    expect(await screen.findByText('负责人 · AA')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '只看我的' }));

    expect(screen.getByText('2 个待办')).toBeInTheDocument();
    expect(within(inboxDetails).getByText('项目经理 · 林项目经理')).toBeInTheDocument();
    expect(within(inboxDetails).queryByText('负责人 · AA')).not.toBeInTheDocument();
  });

  test('saves PM requirement answer', async () => {
    render(<App />);
    await openDeliveryConsole();

    fireEvent.click(await screen.findByText('需求填写详情'));
    fireEvent.change(await screen.findByLabelText('目标用户'), {
      target: { value: '客户、客服、主管、管理员。' },
    });
    fireEvent.click(screen.getByRole('button', { name: '保存目标用户' }));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/projects/demo-1/requirements',
        expect.objectContaining({ method: 'POST' }),
      );
    });
  });

  test('runs requirement review, generates PRD draft, and submits approval', async () => {
    render(<App />);
    await openDeliveryConsole();

    fireEvent.click(await screen.findByRole('button', { name: '智能需求评审' }));
    expect(await screen.findByText('需求质检通过')).toBeInTheDocument();

    const actionDetails = screen.getByLabelText('需求操作详情');
    if (!actionDetails.hasAttribute('open')) {
      fireEvent.click(within(actionDetails).getByText('需求操作详情'));
    }
    fireEvent.click(screen.getByRole('button', { name: '生成需求文档草稿' }));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: '提交需求文档审批' })).toBeEnabled();
    });

    fireEvent.click(screen.getByRole('button', { name: '提交需求文档审批' }));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/projects/demo-1/advance',
        expect.objectContaining({ method: 'POST' }),
      );
    });
  });

  test('shows technical handoff status on architecture stage', async () => {
    global.fetch = vi.fn(async (url, options = {}) => {
      if (url === '/api/projects' && !options.method) {
        return jsonResponse({
          projects: [
            {
              ...projectSummary,
              currentStageId: 'architecture',
              currentStageName: '架构与数据设计',
              stageProgress: 3,
            },
          ],
        });
      }
      if (url === '/api/projects/demo-1' && !options.method) {
        return jsonResponse({
          project: {
            ...baseProject,
            currentStageId: 'architecture',
            technicalHandoffStatus: 'generated',
            technicalHandoffProvider: 'codex-cli',
            stages: [
              { ...stages[0], status: 'approved' },
              { ...stages[1], status: 'approved' },
              { ...stages[2], status: 'approved' },
              {
                id: 'architecture',
                name: '架构与数据设计',
                owner: '技术负责人',
                status: 'active',
                description: '确认系统方案。',
                checklist: ['定义 API'],
              },
            ],
            artifacts: {
              architecture: '# 技术方案\nRTSP 接入 + YOLO 推理 + 前端标注框。',
              development: '# 开发任务\n推理服务。',
              'ops-requirements': '# 运维需求\n摄像头 RTSP 地址。',
              qa: '# 测试计划\n误检率。',
            },
          },
        });
      }
      return jsonResponse({ error: 'not found' }, 404);
    });

    render(<App />);
    await openDeliveryConsole();

    expect(await screen.findByText('技术交接包已生成')).toBeInTheDocument();
    expect(screen.getAllByText('架构与数据设计').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Codex CLI').length).toBeGreaterThanOrEqual(1);
    const handoffPanel = screen.getByLabelText('运维交接面板');
    expect(
      Array.from(handoffPanel.children)
        .map((element) => element.getAttribute('aria-label') || '')
        .slice(0, 2),
    ).toEqual(['技术交接摘要', '技术交接分发详情']);
    const handoffSummary = within(handoffPanel).getByLabelText('技术交接摘要');
    expect(within(handoffSummary).getByText('产物 4')).toBeInTheDocument();
    expect(within(handoffSummary).getByText('分发 4')).toBeInTheDocument();
    expect(within(handoffSummary).getByText('继续确认后续开发、运维和测试交接项。')).toBeInTheDocument();
    const handoffDetails = screen.getByLabelText('技术交接分发详情');
    expect(handoffDetails.tagName).toBe('DETAILS');
    expect(handoffDetails).not.toHaveAttribute('open');
    expect(within(handoffDetails).getByText('RTSP、运行环境、日志监控')).not.toBeVisible();
    fireEvent.click(within(handoffDetails).getByText('技术交接分发详情'));
    expect(handoffDetails).toHaveAttribute('open');
    expect(within(handoffDetails).getByText('RTSP、运行环境、日志监控')).toBeVisible();
  });

  test('shows current stage risk register and functional gaps', async () => {
    global.fetch = vi.fn(async (url, options = {}) => {
      if (url === '/api/projects' && !options.method) {
        return jsonResponse({
          projects: [
            {
              ...projectSummary,
              currentStageId: 'ops-requirements',
              currentStageName: '运维需求',
              stageProgress: 4,
            },
          ],
        });
      }
      if (url === '/api/projects/demo-1' && !options.method) {
        return jsonResponse({
          project: {
            ...baseProject,
            currentStageId: 'ops-requirements',
            stages: [
              { ...stages[0], status: 'approved' },
              { ...stages[1], status: 'approved' },
              { ...stages[2], status: 'approved' },
              {
                id: 'architecture',
                name: '架构与数据设计',
                owner: '技术负责人',
                status: 'approved',
                description: '确认系统方案。',
                checklist: ['定义 API'],
              },
              {
                id: 'ops-requirements',
                name: '运维需求',
                owner: '运维',
                status: 'active',
                description: '确认服务器与运行环境。',
                checklist: ['列出资源规格'],
              },
            ],
            stageRiskRegister: {
              'ops-requirements': {
                stageId: 'ops-requirements',
                stageName: '运维需求',
                owner: '运维',
                riskLevel: 'high',
                potentialRisks: [
                  { title: 'RTSP 网络不可达', detail: '摄像头地址、账号或防火墙未确认会阻塞联调。' },
                ],
                functionalGaps: [
                  { title: '运行环境未确认', detail: 'GPU/CPU、模型依赖和日志路径还没有落到部署需求。' },
                ],
                recommendedActions: ['运维先补齐 RTSP 凭据、网络连通性和服务器规格。'],
              },
            },
          },
        });
      }
      return jsonResponse({ error: 'not found' }, 404);
    });

    render(<App />);
    await openDeliveryConsole();

    expect(await screen.findByText('当前阶段风险')).toBeInTheDocument();
    expect(screen.getByText('高风险')).toBeInTheDocument();
    const stageRiskDetails = screen.getByLabelText('当前阶段风险详情');
    expect(stageRiskDetails.tagName).toBe('DETAILS');
    expect(stageRiskDetails).not.toHaveAttribute('open');
    expect(within(stageRiskDetails).getByText(/RTSP 网络不可达/)).not.toBeVisible();
    expect(within(stageRiskDetails).getByText(/运行环境未确认/)).not.toBeVisible();
    expect(within(stageRiskDetails).getByText(/运维先补齐 RTSP 凭据/)).not.toBeVisible();
    fireEvent.click(within(stageRiskDetails).getByText('当前阶段风险详情'));
    expect(stageRiskDetails).toHaveAttribute('open');
    expect(within(stageRiskDetails).getByText(/RTSP 网络不可达/)).toBeVisible();
    expect(within(stageRiskDetails).getByText(/运行环境未确认/)).toBeVisible();
    expect(within(stageRiskDetails).getByText(/运维先补齐 RTSP 凭据/)).toBeVisible();
  });

  test('keeps the stage risk register collapsed behind a compact summary', async () => {
    const riskRegisterProject = {
      ...baseProject,
      currentStageId: 'ops-requirements',
      currentStageName: '运维需求',
      stages: [
        ...stages,
        {
          id: 'ops-requirements',
          name: '运维需求',
          owner: '运维',
          status: 'active',
          description: '确认服务器与运行环境。',
          checklist: ['列出资源规格'],
        },
      ],
      stageRiskRegister: {
        'pm-requirements': {
          stageId: 'pm-requirements',
          stageName: '项目经理需求',
          owner: '项目经理',
          riskLevel: 'medium',
          potentialRisks: [{ title: '测试样本不足', detail: '误检率指标还缺少样本规模。' }],
          functionalGaps: [{ title: '权限口径未确认', detail: '保安访问方式还没有确认。' }],
          recommendedActions: ['项目经理补齐测试样本和权限要求。'],
        },
        'ops-requirements': {
          stageId: 'ops-requirements',
          stageName: '运维需求',
          owner: '运维',
          riskLevel: 'high',
          potentialRisks: [{ title: 'RTSP 网络不可达', detail: '摄像头地址、账号或防火墙未确认。' }],
          functionalGaps: [{ title: '运行环境未确认', detail: 'GPU/CPU、模型依赖和日志路径还没落地。' }],
          recommendedActions: ['运维补齐 RTSP 凭据和服务器规格。'],
        },
      },
    };

    global.fetch = vi.fn(async (url, options = {}) => {
      if (url === '/api/users' && !options.method) {
        return jsonResponse({ users: appUsers, currentUser: appUsers[0] });
      }
      if (url === '/api/platform' && !options.method) {
        return jsonResponse({ platform: platformCockpit });
      }
      if (url === '/api/projects' && !options.method) {
        return jsonResponse({
          projects: [
            {
              ...projectSummary,
              currentStageId: 'ops-requirements',
              currentStageName: '运维需求',
            },
          ],
        });
      }
      if (url === '/api/projects/demo-1' && !options.method) {
        return jsonResponse({ project: riskRegisterProject });
      }
      return jsonResponse({ error: 'not found' }, 404);
    });

    render(<App />);
    const workspace = await openDeliveryConsole();
    const deliveryWorkspaceBody = within(workspace).getByLabelText('交付工作区主体');
    const auxiliaryPanels = within(deliveryWorkspaceBody).getByLabelText('辅助信息面板');
    fireEvent.click(within(auxiliaryPanels).getByText('辅助信息'));
    fireEvent.click(within(auxiliaryPanels).getByText('证据与风险'));
    fireEvent.click(screen.getByRole('tab', { name: '动态' }));
    fireEvent.click(screen.getByRole('button', { name: '展开风险不足' }));

    const riskPanel = screen.getByLabelText('风险不足区');
    const registerSummary = within(riskPanel).getByLabelText('阶段风险台账摘要');
    expect(within(registerSummary).getByText('阶段 2')).toBeInTheDocument();
    expect(within(registerSummary).getByText('高风险 1')).toBeInTheDocument();
    expect(within(registerSummary).getByText('功能不足 2')).toBeInTheDocument();

    const registerDetails = within(riskPanel).getByLabelText('阶段风险台账明细');
    expect(registerDetails.tagName).toBe('DETAILS');
    expect(registerDetails).not.toHaveAttribute('open');
    expect(within(registerDetails).getByText('阶段风险台账明细')).toBeVisible();
    expect(within(registerDetails).getByText('RTSP 网络不可达')).not.toBeVisible();

    fireEvent.click(within(registerDetails).getByText('阶段风险台账明细'));
    expect(registerDetails).toHaveAttribute('open');
    expect(within(registerDetails).getByText('RTSP 网络不可达')).toBeVisible();
    expect(within(registerDetails).getByText('运行环境未确认')).toBeVisible();
  });

  test('shows structured development plan on development stage', async () => {
    global.fetch = vi.fn(async (url, options = {}) => {
      if (url === '/api/projects' && !options.method) {
        return jsonResponse({
          projects: [
            {
              ...projectSummary,
              currentStageId: 'development',
              currentStageName: '自动开发',
              stageProgress: 5,
            },
          ],
        });
      }
      if (url === '/api/projects/demo-1' && !options.method) {
        return jsonResponse({
          project: {
            ...baseProject,
            currentStageId: 'development',
            stages: [
              { ...stages[0], status: 'approved' },
              { ...stages[1], status: 'approved' },
              { ...stages[2], status: 'approved' },
              {
                id: 'architecture',
                name: '架构与数据设计',
                owner: '技术负责人',
                status: 'approved',
                description: '确认系统方案。',
                checklist: ['定义 API'],
              },
              {
                id: 'ops-requirements',
                name: '运维需求',
                owner: '运维',
                status: 'approved',
                description: '确认服务器与运行环境。',
                checklist: ['列出资源规格'],
              },
              {
                id: 'development',
                name: '自动开发',
                owner: 'AI 开发',
                status: 'active',
                description: '按任务开发。',
                checklist: ['读取 PRD 和技术方案'],
              },
            ],
            developmentPlan: {
              status: 'ready',
              summary: '按 RTSP 接入、YOLO 推理、前端标注和误检率测试拆分开发任务。',
              verificationCommands: ['npm test', 'npm run build'],
              tasks: [
                {
                  id: 'dev-frontend-monitor',
                  area: '前端',
                  title: '实现网页监控页面和标注框展示',
                  description: '展示实时视频区域、行人提示、异常提示。',
                  status: 'queued',
                  acceptanceCriteria: ['检测到行人时显示标注框和明确提示。'],
                  verification: ['前端组件测试覆盖有行人和无行人状态。'],
                },
              ],
            },
          },
        });
      }
      return jsonResponse({ error: 'not found' }, 404);
    });

    render(<App />);
    await openDeliveryConsole();

    const developmentActionCenter = await screen.findByLabelText('开发处理中心');
    expect(within(developmentActionCenter).getByText('开发任务包')).toBeInTheDocument();
    expect(within(developmentActionCenter).getByText('生成智能开发任务包')).toBeInTheDocument();
    const actionDetails = screen.getByLabelText('开发操作详情');
    expect(actionDetails.tagName).toBe('DETAILS');
    expect(actionDetails).not.toHaveAttribute('open');
    expect(within(actionDetails).getByText('开发操作详情')).toBeVisible();
    expect(within(actionDetails).getByText('开发启动向导')).not.toBeVisible();
    fireEvent.click(within(actionDetails).getByText('开发操作详情'));
    expect(actionDetails).toHaveAttribute('open');
    expect(within(actionDetails).getByText('开发启动向导')).toBeVisible();
    const launchStepDetails = within(actionDetails).getByLabelText('开发启动步骤明细');
    expect(launchStepDetails).not.toHaveAttribute('open');
    expect(within(launchStepDetails).getByText('配置仓库')).not.toBeVisible();
    fireEvent.click(within(launchStepDetails).getByText('查看启动步骤'));
    expect(launchStepDetails).toHaveAttribute('open');
    expect(within(launchStepDetails).getByText('配置仓库')).toBeVisible();
    const developmentDetails = screen.getByLabelText('开发执行详情');
    expect(developmentDetails).not.toHaveAttribute('open');
    expect(within(developmentDetails).getByText(/实现网页监控页面/)).not.toBeVisible();
    expect(within(developmentDetails).getByText('npm test')).not.toBeVisible();
    fireEvent.click(within(developmentDetails).getByText('开发执行详情'));
    expect(developmentDetails).toHaveAttribute('open');
    expect(within(developmentDetails).getByText(/实现网页监控页面/)).toBeVisible();
    expect(within(developmentDetails).getByText('验收标准')).toBeVisible();
    expect(within(developmentDetails).getByText('npm test')).toBeVisible();
  });

  test('starts development run and shows execution record', async () => {
    const developmentProject = {
      ...baseProject,
      currentStageId: 'development',
      stages: [
        { ...stages[0], status: 'approved' },
        { ...stages[1], status: 'approved' },
        { ...stages[2], status: 'approved' },
        {
          id: 'development',
          name: '自动开发',
          owner: 'AI 开发',
          status: 'active',
          description: '按任务开发。',
          checklist: ['读取 PRD 和技术方案'],
        },
      ],
      developmentPlan: {
        status: 'ready',
        summary: '按 RTSP 接入、YOLO 推理、前端标注和误检率测试拆分开发任务。',
        verificationCommands: ['npm test'],
        tasks: [
          {
            id: 'dev-frontend-monitor',
            area: '前端',
            title: '实现网页监控页面和标注框展示',
            description: '展示实时视频区域。',
            status: 'queued',
            acceptanceCriteria: ['检测到行人时显示标注框。'],
            verification: ['前端组件测试覆盖有行人状态。'],
          },
        ],
      },
      agentExecutionPackage: {
        status: 'ready',
        canStart: true,
        repository: {
          localPath: 'D:\\project\\WeeCoder',
          targetBranch: 'feature/yolo-camera-monitor',
        },
        gates: [{ id: 'branch-preparation', label: '分支准备', status: 'ready' }],
        blockers: [],
        verificationCommands: ['npm test'],
        tasks: [
          {
            id: 'dev-frontend-monitor',
            area: '前端',
            title: '实现网页监控页面和标注框展示',
          },
        ],
        instructions: '启动状态：READY\n## 执行要求\n- 不要修改与本任务无关的文件。',
      },
    };
    const projectWithRun = {
      ...developmentProject,
      developmentPlan: {
        ...developmentProject.developmentPlan,
        status: 'running',
      },
      developmentRun: {
        id: 'dev-run-1',
        mode: 'execution-package',
        status: 'running',
        summary: '本地开发执行已完成，已生成 YOLO 摄像头监控基础实现和测试。',
        commitHash: 'abc1234',
        filesChanged: ['src/monitoringState.js', 'test/monitoringState.test.js'],
        repositoryAudit: {
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
        },
        repositorySnapshot: {
          status: 'ready',
          localPath: 'D:\\project\\WeeCoder',
          baseBranch: 'main',
          targetBranch: 'feature/yolo-camera-monitor',
          executionMode: 'codex-local',
          verificationCommands: ['npm test'],
        },
        taskResults: [
          {
            taskId: 'dev-frontend-monitor',
            title: '实现网页监控页面和标注框展示',
            area: '前端',
            status: 'completed',
            result: '实现网页监控页面和标注框展示 已完成。',
            acceptanceCriteria: ['检测到行人时显示标注框。'],
          },
        ],
        checks: [{ command: 'npm test', status: 'not-run', result: '等待真实 runner 接入后执行。' }],
        blockers: ['检查命令尚未运行：请运行本地检查后再进入 Review。'],
        nextActions: ['运行检查命令，确认本地实现可测试、可构建且依赖无漏洞。'],
      },
    };

    global.fetch = vi.fn(async (url, options = {}) => {
      if (url === '/api/projects' && !options.method) {
        return jsonResponse({
          projects: [
            {
              ...projectSummary,
              currentStageId: 'development',
              currentStageName: '自动开发',
              stageProgress: 5,
            },
          ],
        });
      }
      if (url === '/api/projects/demo-1' && !options.method) {
        return jsonResponse({ project: developmentProject });
      }
      if (url === '/api/projects/demo-1/run-development' && options.method === 'POST') {
        return jsonResponse({ project: projectWithRun });
      }
      return jsonResponse({ error: 'not found' }, 404);
    });

    render(<App />);
    await openDeliveryConsole();

    fireEvent.click(await screen.findByRole('button', { name: '启动开发执行' }));

    expect(await screen.findByText('开发执行记录')).toBeInTheDocument();
    expect(screen.getByText(/本地开发执行已完成/)).toBeInTheDocument();
    expect(screen.getAllByText('abc1234').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('src/monitoringState.js')).toBeInTheDocument();
    expect(screen.getByText('执行审计')).toBeInTheDocument();
    expect(screen.getByText('base111')).toBeInTheDocument();
    expect(screen.getByText('已提交')).toBeInTheDocument();
    expect(screen.getByText('未运行')).toBeInTheDocument();
    expect(screen.getByText(/运行检查命令/)).toBeInTheDocument();
    expect(screen.getAllByText('feature/yolo-camera-monitor').length).toBeGreaterThanOrEqual(1);
  });

  test('disables development start when the AI package is blocked', async () => {
    const developmentProject = {
      ...baseProject,
      currentStageId: 'development',
      stages: [
        { ...stages[0], status: 'approved' },
        { ...stages[1], status: 'approved' },
        { ...stages[2], status: 'approved' },
        {
          id: 'development',
          name: '自动开发',
          owner: 'AI 开发',
          status: 'active',
          description: '按任务开发。',
          checklist: ['读取 PRD 和技术方案'],
        },
      ],
      developmentPlan: {
        status: 'ready',
        summary: '按 RTSP 接入、YOLO 推理和前端标注拆分开发任务。',
        verificationCommands: ['npm test'],
        tasks: [],
      },
      agentExecutionPackage: {
        status: 'blocked',
        canStart: false,
        repository: {
          localPath: 'D:\\project\\WeeCoder',
          targetBranch: 'feature/yolo-camera-monitor',
        },
        gates: [{ id: 'repository-inspection', label: '仓库诊断', status: 'blocked' }],
        blockers: ['仓库诊断未通过：本地路径不是 Git 仓库。'],
        verificationCommands: ['npm test'],
        tasks: [],
        instructions: '启动状态：BLOCKED\n## 启动阻塞\n- 仓库诊断未通过：本地路径不是 Git 仓库。',
      },
      repositoryConfig: {
        status: 'ready',
        localPath: 'D:\\project\\WeeCoder',
        baseBranch: 'main',
        targetBranch: 'feature/yolo-camera-monitor',
        executionMode: 'codex-local',
        verificationCommands: ['npm test'],
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
    };

    global.fetch = vi.fn(async (url, options = {}) => {
      if (url === '/api/projects' && !options.method) {
        return jsonResponse({
          projects: [
            {
              ...projectSummary,
              currentStageId: 'development',
              currentStageName: '自动开发',
              stageProgress: 5,
            },
          ],
        });
      }
      if (url === '/api/projects/demo-1' && !options.method) {
        return jsonResponse({ project: developmentProject });
      }
      return jsonResponse({ error: 'not found' }, 404);
    });

    render(<App />);
    await openDeliveryConsole();

    expect(await screen.findByRole('button', { name: '启动开发执行' })).toBeDisabled();
    expect(screen.getByText('开发启动向导')).toBeInTheDocument();
    expect(screen.getByText('当前下一步')).toBeInTheDocument();
    expect(screen.getAllByText('请选择真实业务代码仓库路径后重新诊断。').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('诊断仓库').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('请先生成可启动的智能开发任务包，再启动开发执行。')).toBeInTheDocument();
    expect(screen.getAllByText('仓库诊断未通过：本地路径不是 Git 仓库。').length).toBeGreaterThanOrEqual(1);
  });

  test('shows stale PRD risk in the blocked development package panel', async () => {
    const developmentProject = {
      ...baseProject,
      currentStageId: 'development',
      stages: [
        { ...stages[0], status: 'approved' },
        { ...stages[1], status: 'approved' },
        { ...stages[2], status: 'approved' },
        {
          id: 'development',
          name: '自动开发',
          owner: 'AI 开发',
          status: 'active',
          description: '按任务包开发。',
          checklist: ['读取 PRD 和技术方案'],
        },
      ],
      developmentPlan: {
        status: 'ready',
        summary: '按最新 PRD 拆分开发任务。',
        verificationCommands: ['npm test'],
        tasks: [],
      },
      repositoryConfig: {
        status: 'ready',
        localPath: 'D:\\project\\WeeCoder',
        baseBranch: 'main',
        targetBranch: 'feature/yolo-camera-monitor',
        executionMode: 'codex-local',
        verificationCommands: ['npm test'],
        missingFields: [],
      },
      repositoryInspection: {
        status: 'ready',
        canPrepareBranch: true,
        issues: [],
        recommendations: [],
      },
      branchPreparation: {
        status: 'ready',
        currentBranch: 'feature/yolo-camera-monitor',
        canRunDevelopment: true,
        issues: [],
        recommendations: [],
      },
      agentExecutionPackage: {
        status: 'blocked',
        canStart: false,
        prdVersion: {
          number: 1,
          label: 'v1',
          status: 'stale',
        },
        requirementChangeImpact: {
          status: 'stale',
          versionLabel: 'v1',
          summary: 'PRD v1 已过期：范围边界 已变更。',
          changedQuestions: [{ id: 'scope', label: '范围边界', currentAnswer: '本期增加移动端 App。' }],
          requiredActions: ['重新运行智能需求评审', '重新生成需求文档草稿'],
        },
        repository: {
          localPath: 'D:\\project\\WeeCoder',
          targetBranch: 'feature/yolo-camera-monitor',
        },
        gates: [{ id: 'prd-version', label: 'PRD 版本', status: 'blocked' }],
        blockers: ['PRD v1 已过期：范围边界 已变更。'],
        verificationCommands: ['npm test'],
        tasks: [],
        instructions: '启动状态：BLOCKED\nPRD 版本：v1（已过期）',
      },
    };

    global.fetch = vi.fn(async (url, options = {}) => {
      if (url === '/api/projects' && !options.method) {
        return jsonResponse({
          projects: [
            {
              ...projectSummary,
              currentStageId: 'development',
              currentStageName: '自动开发',
              stageProgress: 5,
            },
          ],
        });
      }
      if (url === '/api/projects/demo-1' && !options.method) {
        return jsonResponse({ project: developmentProject });
      }
      return jsonResponse({ error: 'not found' }, 404);
    });

    render(<App />);
    await openDeliveryConsole();

    expect(await screen.findByRole('button', { name: '启动开发执行' })).toBeDisabled();
    const actionDetails = screen.getByLabelText('开发操作详情');
    fireEvent.click(within(actionDetails).getByText('开发操作详情'));
    const prdRisk = within(actionDetails).getByLabelText('智能开发任务包 PRD 风险');
    expect(within(prdRisk).getByText('PRD v1 已过期')).toBeInTheDocument();
    expect(within(prdRisk).getByText('范围边界')).toBeInTheDocument();
    expect(within(prdRisk).getByText('重新运行智能需求评审')).toBeInTheDocument();
    expect(within(prdRisk).getByText('重新生成需求文档草稿')).toBeInTheDocument();
  });

  test('runs development checks and shows runner results', async () => {
    const developmentProject = {
      ...baseProject,
      currentStageId: 'development',
      stages: [
        { ...stages[0], status: 'approved' },
        { ...stages[1], status: 'approved' },
        { ...stages[2], status: 'approved' },
        {
          id: 'development',
          name: '自动开发',
          owner: 'AI 开发',
          status: 'active',
          description: '按任务开发。',
          checklist: ['读取 PRD 和技术方案'],
        },
      ],
      developmentPlan: {
        status: 'running',
        summary: '按 RTSP 接入、YOLO 推理和前端标注拆分开发任务。',
        verificationCommands: ['npm test'],
        tasks: [],
      },
      repositoryConfig: {
        status: 'ready',
        localPath: 'D:\\project\\WeeCoder',
        baseBranch: 'main',
        targetBranch: 'feature/yolo-camera-monitor',
        executionMode: 'codex-local',
        verificationCommands: ['npm test'],
        missingFields: [],
      },
      developmentRun: {
        id: 'dev-run-1',
        mode: 'execution-package',
        status: 'ready-for-agent',
        summary: '已生成开发执行包，等待接入真实代码执行器、CI 和 PR 流程。',
        repositorySnapshot: {
          status: 'ready',
          localPath: 'D:\\project\\WeeCoder',
          baseBranch: 'main',
          targetBranch: 'feature/yolo-camera-monitor',
          executionMode: 'codex-local',
          verificationCommands: ['npm test'],
        },
        taskResults: [],
        checks: [{ command: 'npm test', status: 'not-run', result: '等待真实 runner 接入后执行。' }],
        blockers: ['真实代码执行器尚未接入：当前只生成执行包，不会修改业务代码仓库。'],
        nextActions: ['接入仓库选择、分支创建和 Codex 执行器。'],
      },
    };
    const projectWithChecks = {
      ...developmentProject,
      developmentPlan: {
        ...developmentProject.developmentPlan,
        status: 'done',
      },
      developmentRun: {
        ...developmentProject.developmentRun,
        status: 'completed',
        commitHash: 'abc1234',
        filesChanged: ['src/monitoringState.js'],
        changePackage: {
          status: 'ready-for-review',
          createdAt: '2026-06-17T00:00:00.000Z',
          summary: '开发变更、仓库审计和本地检查结果已汇总，可以进入代码评审。',
          commitHash: 'abc1234',
          filesChanged: ['src/monitoringState.js'],
          repositoryAudit: {
            before: { branch: 'feature/yolo-camera-monitor', head: 'base111', changedFiles: [] },
            after: { branch: 'feature/yolo-camera-monitor', head: 'abc1234', changedFiles: [] },
            committed: true,
          },
          tasks: [],
          verification: { total: 1, passed: 1, failed: 0, blocked: 0 },
          reviewGate: { canStartReview: true, blockers: [] },
        },
        checks: [
          {
            command: 'npm test',
            status: 'passed',
            exitCode: 0,
            durationMs: 42,
            result: 'npm test passed',
            stdout: 'ok',
            stderr: '',
          },
        ],
      },
    };

    global.fetch = vi.fn(async (url, options = {}) => {
      if (url === '/api/projects' && !options.method) {
        return jsonResponse({
          projects: [
            {
              ...projectSummary,
              currentStageId: 'development',
              currentStageName: '自动开发',
              stageProgress: 5,
            },
          ],
        });
      }
      if (url === '/api/projects/demo-1' && !options.method) {
        return jsonResponse({ project: developmentProject });
      }
      if (url === '/api/projects/demo-1/run-development-checks' && options.method === 'POST') {
        return jsonResponse({ project: projectWithChecks });
      }
      return jsonResponse({ error: 'not found' }, 404);
    });

    render(<App />);
    await openDeliveryConsole();

    fireEvent.click(await screen.findByRole('button', { name: '运行检查' }));

    expect(await screen.findByText('通过')).toBeInTheDocument();
    expect(screen.getByText('npm test passed')).toBeInTheDocument();
    expect(screen.getByText(/42ms/)).toBeInTheDocument();
    expect(screen.getByText('开发变更包')).toBeInTheDocument();
    expect(screen.getByText('可进入代码评审')).toBeInTheDocument();
    expect(screen.getAllByText('abc1234').length).toBeGreaterThanOrEqual(1);
  });

  test('saves repository executor config from the development stage', async () => {
    const developmentProject = {
      ...baseProject,
      currentStageId: 'development',
      stages: [
        { ...stages[0], status: 'approved' },
        { ...stages[1], status: 'approved' },
        { ...stages[2], status: 'approved' },
        {
          id: 'development',
          name: '自动开发',
          owner: 'AI 开发',
          status: 'active',
          description: '按任务开发。',
          checklist: ['读取 PRD 和技术方案'],
        },
      ],
      developmentPlan: {
        status: 'ready',
        summary: '按 RTSP 接入、YOLO 推理和前端标注拆分开发任务。',
        verificationCommands: ['npm test'],
        tasks: [],
      },
      repositoryConfig: {
        status: 'incomplete',
        repositoryUrl: '',
        localPath: '',
        baseBranch: 'main',
        targetBranch: '',
        executionMode: 'codex-local',
        verificationCommands: ['npm test'],
        missingFields: ['repositoryUrl', 'targetBranch'],
      },
    };
    const projectWithConfig = {
      ...developmentProject,
      repositoryConfig: {
        ...developmentProject.repositoryConfig,
        status: 'ready',
        repositoryUrl: 'https://github.com/acme/yolo-monitor.git',
        targetBranch: 'feature/yolo-camera-monitor',
        missingFields: [],
      },
    };

    global.fetch = vi.fn(async (url, options = {}) => {
      if (url === '/api/projects' && !options.method) {
        return jsonResponse({
          projects: [
            {
              ...projectSummary,
              currentStageId: 'development',
              currentStageName: '自动开发',
              stageProgress: 5,
            },
          ],
        });
      }
      if (url === '/api/projects/demo-1' && !options.method) {
        return jsonResponse({ project: developmentProject });
      }
      if (url === '/api/projects/demo-1/repository-config' && options.method === 'POST') {
        return jsonResponse({ project: projectWithConfig });
      }
      return jsonResponse({ error: 'not found' }, 404);
    });

    render(<App />);
    await openDeliveryConsole();

    const repositoryDetails = await screen.findByLabelText('执行器配置详情');
    expect(repositoryDetails.tagName).toBe('DETAILS');
    expect(repositoryDetails).not.toHaveAttribute('open');
    expect(within(repositoryDetails).getByText('仓库地址')).not.toBeVisible();
    fireEvent.click(within(repositoryDetails).getByText('执行器配置详情'));
    expect(repositoryDetails).toHaveAttribute('open');

    const repositoryUrlInput = within(repositoryDetails).getByLabelText('仓库地址');
    const targetBranchInput = within(repositoryDetails).getByLabelText('目标分支');
    await waitFor(() => {
      expect(repositoryUrlInput).toHaveValue('');
      expect(targetBranchInput).toHaveValue('');
    });
    fireEvent.change(repositoryUrlInput, {
      target: { value: 'https://github.com/acme/yolo-monitor.git' },
    });
    fireEvent.change(targetBranchInput, {
      target: { value: 'feature/yolo-camera-monitor' },
    });
    await waitFor(() => {
      expect(repositoryUrlInput).toHaveValue('https://github.com/acme/yolo-monitor.git');
      expect(targetBranchInput).toHaveValue('feature/yolo-camera-monitor');
    });
    fireEvent.click(within(repositoryDetails).getByRole('button', { name: '保存执行器配置' }));

    expect(await screen.findByText('配置就绪')).toBeInTheDocument();
    expect(screen.getByDisplayValue('https://github.com/acme/yolo-monitor.git')).toBeInTheDocument();
    expect(screen.getByDisplayValue('feature/yolo-camera-monitor')).toBeInTheDocument();
  });

  test('bootstraps a local business repository from the development stage', async () => {
    const developmentProject = {
      ...baseProject,
      currentStageId: 'development',
      stages: [
        { ...stages[0], status: 'approved' },
        { ...stages[1], status: 'approved' },
        { ...stages[2], status: 'approved' },
        {
          id: 'development',
          name: '自动开发',
          owner: 'AI 开发',
          status: 'active',
          description: '按任务开发。',
          checklist: ['读取 PRD 和技术方案'],
        },
      ],
      developmentPlan: {
        status: 'ready',
        summary: '按 RTSP 接入、YOLO 推理和前端标注拆分开发任务。',
        verificationCommands: ['npm test', 'npm run build'],
        tasks: [],
      },
      repositoryConfig: {
        status: 'incomplete',
        repositoryUrl: '',
        localPath: '',
        baseBranch: 'main',
        targetBranch: '',
        executionMode: 'codex-local',
        verificationCommands: ['npm test', 'npm run build'],
        missingFields: ['repositoryUrl', 'targetBranch'],
      },
    };
    const projectWithBootstrap = {
      ...developmentProject,
      repositoryConfig: {
        ...developmentProject.repositoryConfig,
        status: 'ready',
        localPath: 'D:\\project\\yolo-monitor',
        targetBranch: 'feature/yolo-camera-monitor',
        missingFields: [],
      },
      repositoryBootstrap: {
        status: 'ready',
        bootstrappedAt: '2026-06-17T00:00:00.000Z',
        localPath: 'D:\\project\\yolo-monitor',
        currentBranch: 'main',
        gitInitialized: true,
        initialCommitCreated: true,
        filesCreated: ['README.md', 'package.json', 'src/detectionContract.js'],
        issues: [],
        recommendations: ['本地业务仓库已创建，请重新诊断仓库并准备目标分支。'],
      },
    };

    global.fetch = vi.fn(async (url, options = {}) => {
      if (url === '/api/projects' && !options.method) {
        return jsonResponse({
          projects: [
            {
              ...projectSummary,
              currentStageId: 'development',
              currentStageName: '自动开发',
              stageProgress: 5,
            },
          ],
        });
      }
      if (url === '/api/projects/demo-1' && !options.method) {
        return jsonResponse({ project: developmentProject });
      }
      if (url === '/api/projects/demo-1/bootstrap-repository' && options.method === 'POST') {
        expect(JSON.parse(options.body)).toMatchObject({
          actor: '技术负责人',
          localPath: 'D:\\project\\yolo-monitor',
          targetBranch: 'feature/yolo-camera-monitor',
          verificationCommands: ['npm test', 'npm run build'],
        });
        return jsonResponse({ project: projectWithBootstrap });
      }
      return jsonResponse({ error: 'not found' }, 404);
    });

    render(<App />);
    await openDeliveryConsole();

    fireEvent.change(await screen.findByLabelText('当前用户'), {
      target: { value: 'tech-chen' },
    });
    await waitFor(() => {
      expect(screen.getByLabelText('当前用户')).toHaveValue('tech-chen');
    });
    fireEvent.change(await screen.findByLabelText('本地路径'), {
      target: { value: 'D:\\project\\yolo-monitor' },
    });
    fireEvent.change(screen.getByLabelText('目标分支'), {
      target: { value: 'feature/yolo-camera-monitor' },
    });
    fireEvent.click(screen.getByRole('button', { name: '初始化本地业务仓库' }));

    expect(await screen.findByText('业务仓库初始化')).toBeInTheDocument();
    expect(screen.getByText('初始化完成')).toBeInTheDocument();
    expect(screen.getByText('本地业务仓库已创建，请重新诊断仓库并准备目标分支。')).toBeInTheDocument();
  });

  test('runs code review on the review stage and shows category results', async () => {
    const reviewProject = {
      ...baseProject,
      currentStageId: 'review',
      stages: [
        { ...stages[0], status: 'approved' },
        { ...stages[1], status: 'approved' },
        { ...stages[2], status: 'approved' },
        {
          id: 'review',
          name: '代码、安全、性能评审',
          owner: '技术负责人',
          status: 'active',
          description: '检查代码质量、安全风险、性能风险和可维护性。',
          checklist: ['代码 review', '安全检查', '性能检查'],
        },
      ],
      developmentRun: {
        status: 'completed',
        commitHash: 'c60351e',
        filesChanged: ['src/monitoringState.js', 'test/monitoringState.test.js'],
        checks: [{ command: 'npm test', status: 'passed' }],
        changePackage: {
          status: 'ready-for-review',
          createdAt: '2026-06-17T00:00:00.000Z',
          summary: '开发完成并通过本地检查。',
          commitHash: 'c60351e',
          filesChanged: ['src/monitoringState.js', 'test/monitoringState.test.js'],
          verification: { total: 1, passed: 1, failed: 0, blocked: 0 },
          reviewGate: { canStartReview: true, blockers: [] },
        },
      },
      repositoryConfig: {
        status: 'ready',
        localPath: 'D:\\project\\WeeCoder\\data\\workspaces\\yolo-camera-monitor',
        targetBranch: 'feature/yolo-camera-monitor',
        executionMode: 'codex-local',
        verificationCommands: ['npm test'],
        missingFields: [],
      },
    };
    const projectWithReview = {
      ...reviewProject,
      codeReviewReport: {
        status: 'passed',
        reviewedAt: '2026-06-17T00:00:00.000Z',
        commitHash: 'c60351e',
        summary: '代码、安全和性能 Review 通过，可以进入测试阶段。',
        categories: [
          { id: 'code-quality', label: '代码质量', status: 'passed', summary: '检查命令已通过。', findings: [] },
          { id: 'security', label: '安全', status: 'passed', summary: '未发现明文凭据。', findings: [] },
          { id: 'performance', label: '性能', status: 'passed', summary: '已包含延迟控制。', findings: [] },
        ],
        blockers: [],
        recommendations: ['测试阶段继续覆盖弱光场景。'],
        nextActions: ['进入测试阶段，生成并执行测试用例。'],
        sourceChangePackage: {
          status: 'ready-for-review',
          commitHash: 'c60351e',
          filesChangedCount: 2,
          verification: { total: 1, passed: 1, failed: 0, blocked: 0 },
        },
        qaHandoff: {
          status: 'ready',
          commitHash: 'c60351e',
          focusAreas: ['有行人提示', '无行人误报', 'RTSP 断流恢复'],
          requiredEvidence: ['测试样本', '误检率统计'],
        },
      },
    };

    global.fetch = vi.fn(async (url, options = {}) => {
      if (url === '/api/projects' && !options.method) {
        return jsonResponse({
          projects: [
            {
              ...projectSummary,
              currentStageId: 'review',
              currentStageName: '代码、安全、性能评审',
              stageProgress: 6,
            },
          ],
        });
      }
      if (url === '/api/projects/demo-1' && !options.method) {
        return jsonResponse({ project: reviewProject });
      }
      if (url === '/api/projects/demo-1/run-code-review' && options.method === 'POST') {
        return jsonResponse({ project: projectWithReview });
      }
      return jsonResponse({ error: 'not found' }, 404);
    });

    render(<App />);
    await openDeliveryConsole();

    fireEvent.click(await screen.findByRole('button', { name: '运行代码评审' }));

    expect(await screen.findByText('代码评审报告')).toBeInTheDocument();
    expect(screen.getByText('代码、安全和性能评审通过，可以进入测试阶段。')).toBeInTheDocument();
    const reviewActionCenter = screen.getByLabelText('评审处理中心');
    expect(within(reviewActionCenter).getByText('代码评审报告')).toBeInTheDocument();
    const reviewPanel = document.querySelector('.code-review-panel');
    expect(
      Array.from(reviewPanel.children)
        .map((element) => element.getAttribute('aria-label') || '')
        .slice(0, 3),
    ).toEqual(['评审处理中心', '评审就绪摘要', '代码评审详情']);
    const reviewReadinessPreview = screen.getByLabelText('评审就绪摘要');
    expect(within(reviewReadinessPreview).getAllByText('评审就绪摘要').length).toBeGreaterThan(0);
    expect(within(reviewReadinessPreview).getByText('评审 3/3')).toBeInTheDocument();
    expect(within(reviewReadinessPreview).getByText('跟进 2')).toBeInTheDocument();
    expect(within(reviewReadinessPreview).getByText('测试交接已就绪')).toBeInTheDocument();
    expect(within(reviewReadinessPreview).getByText('进入测试阶段，生成并执行测试用例。')).toBeInTheDocument();
    const reviewDetails = screen.getByLabelText('代码评审详情');
    expect(reviewDetails).not.toHaveAttribute('open');
    expect(within(reviewDetails).getByText('代码质量')).not.toBeVisible();
    expect(within(reviewDetails).getByText('安全')).not.toBeVisible();
    expect(within(reviewDetails).getByText('性能')).not.toBeVisible();
    expect(within(reviewDetails).getByText('测试交接')).not.toBeVisible();
    fireEvent.click(within(reviewDetails).getByText('代码评审详情'));
    expect(reviewDetails).toHaveAttribute('open');
    expect(within(reviewDetails).getAllByText('c60351e').length).toBeGreaterThanOrEqual(1);
    expect(within(reviewDetails).getByText('代码质量')).toBeVisible();
    expect(within(reviewDetails).getByText('安全')).toBeVisible();
    expect(within(reviewDetails).getByText('性能')).toBeVisible();
    expect(within(reviewDetails).getByText('测试交接')).toBeVisible();
    expect(screen.queryByText('代码 Review 报告')).not.toBeInTheDocument();
    expect(screen.queryByText('QA 交接')).not.toBeInTheDocument();
    expect(within(reviewDetails).getAllByText('RTSP 断流恢复').length).toBeGreaterThanOrEqual(1);
    expect(within(reviewDetails).getByText('进入测试阶段，生成并执行测试用例。')).toBeVisible();
  });

  test('sends the selected user id when running protected actions', async () => {
    const reviewProject = {
      ...baseProject,
      currentStageId: 'review',
      stages: [
        { ...stages[0], status: 'approved' },
        { ...stages[1], status: 'approved' },
        { ...stages[2], status: 'approved' },
        {
          id: 'review',
          name: '代码、安全、性能评审',
          owner: '技术负责人',
          status: 'active',
          description: '检查代码质量、安全风险、性能风险和可维护性。',
          checklist: ['代码 review', '安全检查', '性能检查'],
        },
      ],
      developmentRun: {
        status: 'completed',
        commitHash: 'c60351e',
        checks: [{ command: 'npm test', status: 'passed' }],
        changePackage: {
          status: 'ready-for-review',
          reviewGate: { canStartReview: true, blockers: [] },
        },
      },
      codeReviewReport: null,
    };

    global.fetch = vi.fn(async (url, options = {}) => {
      if (url === '/api/users' && !options.method) {
        return jsonResponse({ users: appUsers, currentUser: appUsers[0] });
      }
      if (url === '/api/projects' && !options.method) {
        return jsonResponse({
          projects: [
            {
              ...projectSummary,
              currentStageId: 'review',
              currentStageName: '代码、安全、性能评审',
              stageProgress: 6,
            },
          ],
        });
      }
      if (url === '/api/projects/demo-1' && !options.method) {
        return jsonResponse({ project: reviewProject });
      }
      if (url === '/api/projects/demo-1/run-code-review' && options.method === 'POST') {
        return jsonResponse({
          project: {
            ...reviewProject,
            codeReviewReport: { status: 'passed', summary: 'Review 通过。' },
          },
        });
      }
      return jsonResponse({ error: 'not found' }, 404);
    });

    render(<App />);
    await openDeliveryConsole();

    await waitFor(() => {
      expect(screen.getByLabelText('当前用户')).toHaveValue('tech-chen');
    });
    fireEvent.click(screen.getByRole('button', { name: '运行代码评审' }));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/projects/demo-1/run-code-review',
        expect.objectContaining({
          headers: expect.objectContaining({
            'X-User-Id': 'tech-chen',
          }),
        }),
      );
    });
  });

  test('disables protected actions when the selected role is unauthorized', async () => {
    const reviewProject = {
      ...baseProject,
      currentStageId: 'review',
      stages: [
        { ...stages[0], status: 'approved' },
        { ...stages[1], status: 'approved' },
        { ...stages[2], status: 'approved' },
        {
          id: 'review',
          name: '代码、安全、性能评审',
          owner: '技术负责人',
          status: 'active',
          description: '检查代码质量、安全风险、性能风险和可维护性。',
          checklist: ['代码 review', '安全检查', '性能检查'],
        },
      ],
      developmentRun: {
        status: 'completed',
        commitHash: 'c60351e',
        checks: [{ command: 'npm test', status: 'passed' }],
      },
      codeReviewReport: null,
    };

    global.fetch = vi.fn(async (url, options = {}) => {
      if (url === '/api/projects' && !options.method) {
        return jsonResponse({
          projects: [
            {
              ...projectSummary,
              currentStageId: 'review',
              currentStageName: '代码、安全、性能评审',
              stageProgress: 6,
            },
          ],
        });
      }
      if (url === '/api/projects/demo-1' && !options.method) {
        return jsonResponse({ project: reviewProject });
      }
      return jsonResponse({ error: 'not found' }, 404);
    });

    render(<App />);
    await openDeliveryConsole();

    fireEvent.change(await screen.findByLabelText('当前用户'), {
      target: { value: 'pm-lin' },
    });
    await waitFor(() => {
      expect(screen.getByLabelText('当前用户')).toHaveValue('pm-lin');
    });

    expect(screen.getByRole('button', { name: '运行代码评审' })).toBeDisabled();
    expect(screen.getByText('当前角色无权执行代码、安全、性能评审。')).toBeInTheDocument();
  });

  test('localizes history labels and fallback flow notes', () => {
    expect(historyTypeLabel('code-review-finished')).toBe('代码评审');
    expect(historyTypeLabel('qa-run-finished')).toBe('测试验证');
    expect(historyTypeLabel('code-review-finished')).not.toBe('代码Review');
    expect(historyTypeLabel('qa-run-finished')).not.toBe('QA测试');
    expect(
      formatHistoryEventNote({
        from: 'PM requirements',
        to: 'PRD approval',
      }),
    ).toBe('项目经理需求 到 需求文档审批');
    expect(formatHistoryEventNote({ note: 'QA 发现测试阻塞项，需要补齐样本后重跑。' })).toBe(
      '测试发现测试阻塞项，需要补齐样本后重跑。',
    );
    expect(formatHistoryEventNote({ note: 'Sent from owner cockpit.' })).toBe(
      '来自负责人工作台的流转消息。',
    );
    expect(
      formatHistoryEventNote({
        note: 'Escalate 负责人 handoff: yolo摄像头监控项目 overdue 85.33h',
      }),
    ).toBe('升级负责人交接：yolo摄像头监控项目 超时 85.33 小时');
    expect(
      formatHistoryEventNote({
        note: '负责人: yolo摄像头监控项目 is overdue by 85.33h. Owner should complete final acceptance or reopen the blocking stage.',
      }),
    ).toBe(
      '负责人：yolo摄像头监控项目 已超时 85.33 小时。负责人需要完成最终验收，或重新打开阻塞阶段。',
    );
    expect(formatHistoryEventNote({ note: '签收状态：signed-off' })).toBe('签收状态：已签收');
    expect(formatHistoryEventNote({ note: '状态：passed' })).toBe('状态：已通过');
  });

  test('updates project members from the member panel', async () => {
    const updatedProject = {
      ...baseProject,
      members: {
        ...baseProject.members,
        'tech-lead': 'tech-li',
      },
      history: [
        {
          type: 'project-members-updated',
          actor: '负责人',
          at: '2026-06-17T00:00:00.000Z',
        },
      ],
    };

    global.fetch = vi.fn(async (url, options = {}) => {
      if (url === '/api/users' && !options.method) {
        return jsonResponse({ users: appUsers, currentUser: appUsers[0] });
      }
      if (url === '/api/projects' && !options.method) {
        return jsonResponse({ projects: [projectSummary] });
      }
      if (url === '/api/projects/demo-1' && !options.method) {
        return jsonResponse({ project: baseProject });
      }
      if (url === '/api/projects/demo-1/members' && options.method === 'POST') {
        return jsonResponse({ project: updatedProject });
      }
      return jsonResponse({ error: 'not found' }, 404);
    });

    render(<App />);
    await openDeliveryConsole();

    const techLeadSelect = await screen.findByLabelText('项目成员-技术负责人');
    await waitFor(() => {
      expect(techLeadSelect).toHaveValue('tech-chen');
    });
    fireEvent.change(techLeadSelect, {
      target: { value: 'tech-li' },
    });
    await waitFor(() => {
      expect(techLeadSelect).toHaveValue('tech-li');
    });
    fireEvent.click(screen.getByRole('button', { name: '保存项目成员' }));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/projects/demo-1/members',
        expect.objectContaining({
          headers: expect.objectContaining({
            'X-User-Id': 'owner-aa',
          }),
          body: expect.stringContaining('"tech-lead":"tech-li"'),
        }),
      );
    });
    expect(await screen.findByText('李技术负责人')).toBeInTheDocument();
  });

  test('updates current-stage confirmation items from the stage panel', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const confirmationProject = {
      ...baseProject,
      stageConfirmations: {
        'pm-requirements': {
          stageId: 'pm-requirements',
          stageName: '项目经理需求',
          owner: '项目经理',
          status: 'incomplete',
          completedCount: 0,
          totalCount: 2,
          missingItems: [
            { id: 'target-users', title: '目标用户与核心场景' },
            { id: 'success-metrics', title: '成功指标与验收口径' },
          ],
          followups: [
            {
              id: 'pm-requirements-target-users',
              itemId: 'target-users',
              targetRole: 'pm',
              targetRoleLabel: '项目经理',
              title: '追问：目标用户与核心场景',
              question: '请补充「目标用户与核心场景」：目标用户是谁，保安如何使用监控页面。',
              expectedAnswer: '需要给出用户角色、核心场景、触发条件和页面反馈。',
            },
            {
              id: 'pm-requirements-success-metrics',
              itemId: 'success-metrics',
              targetRole: 'pm',
              targetRoleLabel: '项目经理',
              title: '追问：成功指标与验收口径',
              question: '请补充「成功指标与验收口径」：误检率、测试样本和通过标准。',
              expectedAnswer: '需要给出指标阈值、统计口径、样本范围和验收方式。',
            },
          ],
          items: [
            {
              id: 'target-users',
              title: '目标用户与核心场景',
              description: '确认目标用户、核心使用场景和主要业务动作。',
              required: true,
              value: '',
              status: 'missing',
            },
            {
              id: 'success-metrics',
              title: '成功指标与验收口径',
              description: '确认可量化成功指标、验收口径和统计方式。',
              required: true,
              value: '',
              status: 'missing',
            },
          ],
        },
      },
    };
    const updatedProject = {
      ...confirmationProject,
      stageConfirmations: {
        'pm-requirements': {
          ...confirmationProject.stageConfirmations['pm-requirements'],
          completedCount: 1,
          missingItems: [{ id: 'success-metrics', title: '成功指标与验收口径' }],
          items: [
            {
              ...confirmationProject.stageConfirmations['pm-requirements'].items[0],
              value: '保安打开网页后查看 RTSP 实时画面，出现行人时需要框选和提示。',
              status: 'confirmed',
              confirmedBy: '负责人',
              confirmedAt: '2026-06-17T00:00:00.000Z',
            },
            confirmationProject.stageConfirmations['pm-requirements'].items[1],
          ],
        },
      },
      history: [
        {
          type: 'stage-confirmation-updated',
          actor: '负责人',
          stageId: 'pm-requirements',
          itemId: 'target-users',
          followupTaskId: 'pm-requirements-target-users',
          taskStatus: 'resolved',
          valueSummary: '保安打开网页后查看 RTSP 实时画面，出现行人时需要框选和提示。',
          at: '2026-06-17T00:00:00.000Z',
        },
      ],
    };

    global.fetch = vi.fn(async (url, options = {}) => {
      if (url === '/api/users' && !options.method) {
        return jsonResponse({ users: appUsers, currentUser: appUsers[0] });
      }
      if (url === '/api/projects' && !options.method) {
        return jsonResponse({ projects: [projectSummary] });
      }
      if (url === '/api/projects/demo-1' && !options.method) {
        return jsonResponse({ project: confirmationProject });
      }
      if (url === '/api/projects/demo-1/stage-confirmations' && options.method === 'POST') {
        return jsonResponse({ project: updatedProject });
      }
      return jsonResponse({ error: 'not found' }, 404);
    });

    render(<App />);
    await openDeliveryConsole();

    expect(await screen.findByText('阶段确认事项')).toBeInTheDocument();
    const confirmationSummary = screen.getByLabelText('阶段确认摘要');
    expect(within(confirmationSummary).getByLabelText('确认进度 0/2')).toBeInTheDocument();
    expect(within(confirmationSummary).getByLabelText('缺项 2')).toBeInTheDocument();
    expect(within(confirmationSummary).getByLabelText('待办 2')).toBeInTheDocument();
    expect(within(confirmationSummary).getByLabelText('聚焦 无')).toBeInTheDocument();
    const confirmationDetailSection = screen.getByLabelText('确认事项填写明细');
    const defaultOpenWarnings = consoleErrorSpy.mock.calls.filter((call) =>
      call.join(' ').includes('defaultOpen'),
    );
    expect(defaultOpenWarnings).toHaveLength(0);
    expect(confirmationDetailSection).not.toHaveAttribute('open');
    expect(within(confirmationDetailSection).getByText('确认事项-目标用户与核心场景')).not.toBeVisible();
    expect(within(confirmationDetailSection).getByText('自动追问建议')).not.toBeVisible();
    fireEvent.click(within(confirmationDetailSection).getByText('确认事项填写明细'));
    expect(confirmationDetailSection).toHaveAttribute('open');
    expect(within(confirmationDetailSection).getByText('确认事项-目标用户与核心场景')).toBeVisible();
    expect(within(confirmationDetailSection).getByText('自动追问建议')).toBeVisible();
    fireEvent.change(screen.getByLabelText('确认事项-目标用户与核心场景'), {
      target: {
        value: '保安打开网页后查看 RTSP 实时画面，出现行人时需要框选和提示。',
      },
    });
    fireEvent.click(screen.getByRole('button', { name: '保存目标用户与核心场景' }));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/projects/demo-1/stage-confirmations',
        expect.objectContaining({
          headers: expect.objectContaining({
            'X-User-Id': 'owner-aa',
          }),
          body: expect.stringContaining('"itemId":"target-users"'),
        }),
      );
    });
    expect(
      await screen.findByText('保安打开网页后查看 RTSP 实时画面，出现行人时需要框选和提示。'),
    ).toBeInTheDocument();
    const updatedConfirmationSummary = screen.getByLabelText('阶段确认摘要');
    expect(within(updatedConfirmationSummary).getByLabelText('确认进度 1/2')).toBeInTheDocument();
    expect(within(updatedConfirmationSummary).getByLabelText('缺项 1')).toBeInTheDocument();
    expect(within(updatedConfirmationSummary).getByLabelText('待办 1')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: '动态' }));
    const auxiliaryPanels = screen.getByLabelText('辅助信息面板');
    fireEvent.click(within(auxiliaryPanels).getByText('辅助信息'));
    const evidencePanel = within(auxiliaryPanels).getByLabelText('证据风险面板');
    if (!evidencePanel.hasAttribute('open')) {
      fireEvent.click(within(evidencePanel).getByText('证据与风险'));
    }
    fireEvent.click(screen.getByRole('button', { name: '展开流转记录' }));
    expect(
      screen.getByText('确认值：保安打开网页后查看 RTSP 实时画面，出现行人时需要框选和提示。'),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: '需求文档' }));
    await screen.findByLabelText('当前任务速览');
    await expandCurrentTaskSection();
    expect(screen.getByText('处理人：负责人')).toBeInTheDocument();
    expect(screen.getByText('处理时间：06/17 08:00')).toBeInTheDocument();
    expect(screen.queryByText('处理时间：2026-06-17T00:00:00.000Z')).not.toBeInTheDocument();
    expect(
      screen.getByText('处理结果：保安打开网页后查看 RTSP 实时画面，出现行人时需要框选和提示。'),
    ).toBeInTheDocument();
  });

  test('disables advancement when current-stage confirmations are incomplete', async () => {
    const gatedProject = {
      ...baseProject,
      prdApprovalReady: true,
      prdStatus: 'generated',
      requirementReview: readyReview,
      stageConfirmations: {
        'pm-requirements': {
          stageId: 'pm-requirements',
          stageName: '项目经理需求',
          owner: '项目经理',
          status: 'incomplete',
          completedCount: 0,
          totalCount: 2,
          missingItems: [
            { id: 'target-users', title: '目标用户与核心场景' },
            { id: 'success-metrics', title: '成功指标与验收口径' },
          ],
          items: [
            {
              id: 'target-users',
              title: '目标用户与核心场景',
              description: '确认目标用户、核心使用场景和主要业务动作。',
              required: true,
              value: '',
              status: 'missing',
            },
            {
              id: 'success-metrics',
              title: '成功指标与验收口径',
              description: '确认可量化成功指标、验收口径和统计方式。',
              required: true,
              value: '',
              status: 'missing',
            },
          ],
        },
      },
    };

    global.fetch = vi.fn(async (url, options = {}) => {
      if (url === '/api/users' && !options.method) {
        return jsonResponse({ users: appUsers, currentUser: appUsers[0] });
      }
      if (url === '/api/projects' && !options.method) {
        return jsonResponse({ projects: [projectSummary] });
      }
      if (url === '/api/projects/demo-1' && !options.method) {
        return jsonResponse({ project: gatedProject });
      }
      return jsonResponse({ error: 'not found' }, 404);
    });

    render(<App />);
    await openDeliveryConsole();

    const advanceButton = await screen.findByRole('button', { name: '提交需求文档审批' });
    expect(advanceButton).toBeDisabled();
    expect(
      screen.getAllByText('阶段确认事项未补齐：目标用户与核心场景、成功指标与验收口径').length,
    ).toBeGreaterThan(0);
    expect(screen.getByText('自动追问建议')).toBeInTheDocument();
    expect(screen.getAllByText('追问对象：项目经理').length).toBeGreaterThan(0);
    expect(
      screen.getAllByText('请补充「成功指标与验收口径」：误检率、测试样本和通过标准。').length,
    ).toBeGreaterThan(0);
    expect(
      screen.getAllByText('需要给出指标阈值、统计口径、样本范围和验收方式。').length,
    ).toBeGreaterThan(0);
    expect(screen.getByText('缺项待办')).toBeInTheDocument();
    expect(screen.getAllByText('状态：待处理').length).toBeGreaterThan(0);
    expect(screen.getAllByText('指派：林项目经理').length).toBeGreaterThan(0);
    expect(
      screen.getByText('补齐后保存对应确认事项，待办会自动关闭。'),
    ).toBeInTheDocument();
  });

  test('runs QA on the test stage and shows test blockers', async () => {
    const qaProject = {
      ...baseProject,
      currentStageId: 'qa',
      stages: [
        { ...stages[0], status: 'approved' },
        { ...stages[1], status: 'approved' },
        { ...stages[2], status: 'approved' },
        {
          id: 'qa',
          name: '测试',
          owner: '测试',
          status: 'active',
          description: '生成测试用例、执行自动测试、记录缺陷和测试结论。',
          checklist: ['编写测试用例', '执行自动测试', '记录缺陷', '输出测试报告'],
        },
      ],
      developmentRun: {
        status: 'completed',
        commitHash: 'c60351e',
        checks: [{ command: 'npm test', status: 'passed' }],
      },
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
    };
    const projectWithQa = {
      ...qaProject,
      qaRun: {
        status: 'needs-work',
        executedAt: '2026-06-17T00:00:00.000Z',
        commitHash: 'c60351e',
        summary: 'QA 发现测试阻塞项，需要补齐样本后重跑。',
        passedCount: 1,
        totalCount: 2,
        testCases: [
          { id: 'person-present', title: '有行人画面提示', status: 'passed', evidence: '组件状态测试通过。' },
          { id: 'weak-light-occlusion', title: '弱光与遮挡场景', status: 'blocked', evidence: '缺少样本。' },
        ],
        defects: [],
        blockers: ['测试视频样本、测试时长、测试环境尚未确认。'],
        recommendations: ['补充弱光、遮挡和多人样本。'],
        nextActions: ['补齐测试阻塞项后重新执行 QA。'],
        reviewHandoff: {
          status: 'ready',
          commitHash: 'c60351e',
          focusAreas: ['有行人提示', 'RTSP 断流恢复'],
          requiredEvidence: ['测试样本清单与覆盖场景'],
          blockers: [],
        },
        coveragePlan: {
          source: 'code-review',
          commitHash: 'c60351e',
          focusAreas: ['有行人提示', 'RTSP 断流恢复'],
          requiredEvidence: ['测试样本清单与覆盖场景'],
        },
        defectRouting: {
          shouldReturnToDevelopment: false,
          targetStageId: 'qa',
          reasons: ['测试视频样本、测试时长、测试环境尚未确认。'],
        },
      },
    };

    global.fetch = vi.fn(async (url, options = {}) => {
      if (url === '/api/projects' && !options.method) {
        return jsonResponse({
          projects: [
            {
              ...projectSummary,
              currentStageId: 'qa',
              currentStageName: '测试',
              stageProgress: 7,
            },
          ],
        });
      }
      if (url === '/api/projects/demo-1' && !options.method) {
        return jsonResponse({ project: qaProject });
      }
      if (url === '/api/projects/demo-1/run-qa' && options.method === 'POST') {
        return jsonResponse({ project: projectWithQa });
      }
      return jsonResponse({ error: 'not found' }, 404);
    });

    render(<App />);
    await openDeliveryConsole();

    fireEvent.click(await screen.findByRole('button', { name: '生成并执行测试用例' }));

    expect(await screen.findByText('测试发现测试阻塞项，需要补齐样本后重跑。')).toBeInTheDocument();
    const qaActionCenter = screen.getByLabelText('测试处理中心');
    expect(within(qaActionCenter).getByText('测试验证报告')).toBeInTheDocument();
    const qaRunPanel = document.querySelector('.qa-run-panel');
    expect(
      Array.from(qaRunPanel.children)
        .map((element) => element.getAttribute('aria-label') || '')
        .slice(0, 2),
    ).toEqual(['测试处理中心', '测试操作详情']);
    const actionDetails = screen.getByLabelText('测试操作详情');
    expect(actionDetails.tagName).toBe('DETAILS');
    expect(actionDetails).not.toHaveAttribute('open');
    expect(within(actionDetails).getByText('测试操作详情')).toBeVisible();
    expect(within(actionDetails).getByText('测试就绪摘要')).not.toBeVisible();
    fireEvent.click(within(actionDetails).getByText('测试操作详情'));
    expect(actionDetails).toHaveAttribute('open');
    const qaReadinessPreview = within(actionDetails).getByLabelText('测试就绪摘要');
    expect(within(actionDetails).getByLabelText('测试证据面板')).toBeInTheDocument();
    expect(within(qaReadinessPreview).getAllByText('测试就绪摘要').length).toBeGreaterThan(0);
    expect(within(qaReadinessPreview).getByText('测试 1/2')).toBeInTheDocument();
    expect(within(qaReadinessPreview).getByText('跟进 3')).toBeInTheDocument();
    expect(within(qaReadinessPreview).getByText('证据待补')).toBeInTheDocument();
    expect(within(qaReadinessPreview).getByText('测试视频样本、测试时长、测试环境尚未确认。')).toBeInTheDocument();
    const qaDetails = screen.getByLabelText('测试验证详情');
    expect(qaDetails).not.toHaveAttribute('open');
    expect(within(qaDetails).getByText('有行人画面提示')).not.toBeVisible();
    expect(within(qaDetails).getByText('弱光与遮挡场景')).not.toBeVisible();
    expect(within(qaDetails).getByText('评审测试交接')).not.toBeVisible();
    fireEvent.click(within(qaDetails).getByText('测试验证详情'));
    expect(qaDetails).toHaveAttribute('open');
    expect(within(qaDetails).getByText('有行人画面提示')).toBeVisible();
    expect(within(qaDetails).getByText('弱光与遮挡场景')).toBeVisible();
    expect(within(qaDetails).getByText('评审测试交接')).toBeVisible();
    expect(within(qaDetails).getByText('RTSP 断流恢复')).toBeVisible();
    expect(within(qaDetails).getByText('测试样本清单与覆盖场景')).toBeVisible();
    expect(within(qaDetails).getByText('缺陷回流')).toBeVisible();
    expect(within(qaDetails).getByText('测试阶段补证据')).toBeVisible();
    expect(within(qaDetails).getByText('测试视频样本、测试时长、测试环境尚未确认。')).toBeVisible();
    expect(within(qaDetails).getByText('补齐测试阻塞项后重新执行测试验证。')).toBeVisible();
  });

  test('routes QA implementation blockers back to development from the QA panel', async () => {
    const qaProject = {
      ...baseProject,
      currentStageId: 'qa',
      stages: [
        { ...stages[0], status: 'approved' },
        { ...stages[1], status: 'approved' },
        { ...stages[2], status: 'approved' },
        {
          id: 'development',
          name: '自动开发',
          owner: 'AI 开发',
          status: 'approved',
          description: '按任务开发。',
          checklist: ['读取 PRD 和技术方案'],
        },
        {
          id: 'qa',
          name: '测试',
          owner: '测试',
          status: 'active',
          description: '生成测试用例、执行自动测试、记录缺陷和测试结论。',
          checklist: ['编写测试用例', '执行自动测试', '记录缺陷', '输出测试报告'],
        },
      ],
      codeReviewReport: { status: 'passed' },
      qaRun: {
        status: 'needs-work',
        commitHash: 'c60351e',
        summary: 'QA 发现实现覆盖缺口，需要回流开发。',
        passedCount: 1,
        totalCount: 2,
        testCases: [
          { id: 'person-present', title: '有行人画面提示', status: 'passed' },
          { id: 'rtsp-reconnect', title: 'RTSP 断流恢复', status: 'blocked', evidence: '缺少重连测试。' },
        ],
        defects: [],
        blockers: ['缺少 rtsp 对应实现或测试。'],
        recommendations: ['回开发补齐 RTSP 重连实现和测试。'],
        nextActions: ['生成缺陷修复包并回流自动开发。'],
        defectRouting: {
          shouldReturnToDevelopment: true,
          targetStageId: 'development',
          reasons: ['缺少 rtsp 对应实现或测试。'],
        },
      },
    };
    const projectWithRoute = {
      ...qaProject,
      currentStageId: 'development',
      stages: qaProject.stages.map((stage) =>
        stage.id === 'development'
          ? { ...stage, status: 'active' }
          : stage.id === 'qa'
            ? { ...stage, status: 'blocked' }
            : stage,
      ),
      defectFixPackage: {
        status: 'ready',
        sourceStageId: 'qa',
        targetStageId: 'development',
        sourceCommitHash: 'c60351e',
        qaPassRate: '1/2',
        reasons: ['缺少 rtsp 对应实现或测试。'],
        failingTestCases: [{ id: 'rtsp-reconnect', title: 'RTSP 断流恢复', status: 'blocked' }],
        requiredFixes: ['缺少 rtsp 对应实现或测试。'],
        regressionFocus: ['RTSP 断流恢复'],
      },
      developmentPlan: {
        status: 'ready',
        summary: 'QA 缺陷修复包已生成。',
        verificationCommands: ['npm test'],
        tasks: [{ id: 'qa-fix-1', title: '修复 QA 阻塞：缺少 rtsp 对应实现或测试。' }],
      },
    };

    global.fetch = vi.fn(async (url, options = {}) => {
      if (url === '/api/projects' && !options.method) {
        return jsonResponse({
          projects: [
            {
              ...projectSummary,
              currentStageId: 'qa',
              currentStageName: '测试',
              stageProgress: 7,
            },
          ],
        });
      }
      if (url === '/api/projects/demo-1' && !options.method) {
        return jsonResponse({ project: qaProject });
      }
      if (url === '/api/projects/demo-1/route-qa-defects' && options.method === 'POST') {
        expect(JSON.parse(options.body)).toMatchObject({
          actor: '测试',
        });
        return jsonResponse({ project: projectWithRoute });
      }
      return jsonResponse({ error: 'not found' }, 404);
    });

    render(<App />);
    await openDeliveryConsole();

    const actionDetails = await screen.findByLabelText('测试操作详情');
    if (!actionDetails.hasAttribute('open')) {
      fireEvent.click(within(actionDetails).getByText('测试操作详情'));
    }
    const qaDetails = within(actionDetails).getByLabelText('测试验证详情');
    if (!qaDetails.hasAttribute('open')) {
      fireEvent.click(within(qaDetails).getByText('测试验证详情'));
    }
    fireEvent.click(await screen.findByRole('button', { name: '生成缺陷修复包并回开发' }));

    expect((await screen.findAllByText('自动开发')).length).toBeGreaterThan(0);
    expect(screen.getByText('测试缺陷修复迭代')).toBeInTheDocument();
    expect(screen.getByText('来源提交 c60351e · 测试通过 1/2')).toBeInTheDocument();
    expect(screen.getAllByText('RTSP 断流恢复').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('缺少 rtsp 对应实现或测试。').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('修复后必须重新进入代码评审和测试验证。')).toBeInTheDocument();
    await screen.findByLabelText('当前任务速览');
    await expandCurrentTaskSection();
    expect(
      await screen.findByText('修复测试阻塞：缺少 rtsp 对应实现或测试。'),
    ).toBeInTheDocument();
  });

  test('keeps the QA defect fix loop visible after the repair reaches review', async () => {
    const reviewProject = {
      ...baseProject,
      currentStageId: 'review',
      stages: [
        { ...stages[0], status: 'approved' },
        { ...stages[1], status: 'approved' },
        { ...stages[2], status: 'approved' },
        {
          id: 'development',
          name: '自动开发',
          owner: 'AI 开发',
          status: 'approved',
          description: '执行修复开发任务。',
          checklist: ['修复 QA 缺陷'],
        },
        {
          id: 'review',
          name: '代码、安全、性能评审',
          owner: '技术负责人',
          status: 'active',
          description: '复审修复提交。',
          checklist: ['代码评审'],
        },
        {
          id: 'qa',
          name: 'QA 测试',
          owner: '测试',
          status: 'queued',
          description: '等待复测。',
          checklist: ['QA 复测'],
        },
      ],
      defectFixPackage: {
        status: 'reviewing',
        sourceStageId: 'qa',
        targetStageId: 'development',
        sourceCommitHash: 'c60351e',
        qaPassRate: '1/2',
        reasons: ['缺少 rtsp 对应实现或测试。'],
        failingTestCases: [{ id: 'rtsp-reconnect', title: 'RTSP 断流恢复', status: 'blocked' }],
        requiredFixes: ['缺少 rtsp 对应实现或测试。'],
        regressionFocus: ['RTSP 断流恢复'],
        repairSubmission: {
          status: 'reviewing',
          submittedBy: 'Local Runner',
          commitHash: 'fix789',
          filesChanged: ['src/rtspStream.js', 'server/rtspStream.test.js'],
          jobId: 'job-qa-fix',
          jobStatus: 'succeeded',
          jobResultSummary: 'Repair checks passed.',
          sandboxPolicy: 'project-verification-command-allowlist',
          sourceStageId: 'development',
          targetStageId: 'review',
          requiredGates: ['code-review', 'qa-retest'],
        },
      },
      developmentRun: {
        status: 'completed',
        commitHash: 'fix789',
        filesChanged: ['src/rtspStream.js', 'server/rtspStream.test.js'],
        checks: [{ command: 'npm test', status: 'passed' }],
        changePackage: {
          status: 'ready-for-review',
          commitHash: 'fix789',
          filesChanged: ['src/rtspStream.js', 'server/rtspStream.test.js'],
          reviewGate: { canStartReview: true, blockers: [] },
        },
      },
      codeReviewReport: null,
    };

    global.fetch = vi.fn(async (url, options = {}) => {
      if (url === '/api/users' && !options.method) {
        return jsonResponse({ users: appUsers, currentUser: appUsers[0] });
      }
      if (url === '/api/platform' && !options.method) {
        return jsonResponse({ platform: platformCockpit });
      }
      if (url === '/api/projects' && !options.method) {
        return jsonResponse({
          projects: [
            {
              ...projectSummary,
              currentStageId: 'review',
              currentStageName: '代码、安全、性能评审',
              stageProgress: 6,
            },
          ],
        });
      }
      if (url === '/api/projects/demo-1' && !options.method) {
        return jsonResponse({ project: reviewProject });
      }
      return jsonResponse({ error: 'not found' }, 404);
    });

    render(<App />);
    await openDeliveryConsole();

    expect(await screen.findByText('测试缺陷修复迭代')).toBeInTheDocument();
    const reviewGate = screen.getByText('测试缺陷修复评审门禁').closest('.defect-fix-review-gate');
    expect(within(reviewGate).getByText('来源测试 c60351e · 修复提交 fix789')).toBeInTheDocument();
    expect(within(reviewGate).getByText('后台任务 成功 · job-qa-fix')).toBeInTheDocument();
    expect(within(reviewGate).getByText('变更文件 2 · 剩余门禁 代码评审、测试复测')).toBeInTheDocument();
    expect(within(reviewGate).getByText('修复检查已通过。')).toBeInTheDocument();
    expect(screen.getAllByText('评审复审中').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('修复提交 fix789 · 本地执行器')).toBeInTheDocument();
    expect(screen.getByText('剩余门禁 代码评审、测试复测')).toBeInTheDocument();
  });

  test('queues a QA defect fix backend job from the defect iteration panel', async () => {
    const job = {
      id: 'demo-1-qa-defect-fix-20260617',
      projectId: 'demo-1',
      projectName: '客户门户',
      type: 'qa-defect-fix',
      title: 'QA 缺陷修复执行',
      status: 'queued',
      queuedAt: '2026-06-17T00:00:00.000Z',
      requestedBy: 'owner-aa',
      runCount: 2,
      command: 'npm test',
      source: 'qa-defect-fix',
      details: {
        defectFixSourceCommitHash: 'c60351e',
        qaPassRate: '1/2',
        requiredFixes: ['缺少 rtsp 对应实现或测试。'],
        regressionFocus: ['RTSP 断流恢复'],
        sandboxPolicy: 'project-verification-command-allowlist',
      },
    };
    const reviewProject = {
      ...baseProject,
      currentStageId: 'review',
      stages: [
        { ...stages[0], status: 'approved' },
        { ...stages[1], status: 'approved' },
        { ...stages[2], status: 'approved' },
        { id: 'development', name: '自动开发', owner: 'AI 开发', status: 'approved', checklist: [] },
        { id: 'review', name: '代码、安全、性能评审', owner: '技术负责人', status: 'active', checklist: [] },
        { id: 'qa', name: 'QA 测试', owner: '测试', status: 'queued', checklist: [] },
      ],
      defectFixPackage: {
        status: 'reviewing',
        sourceStageId: 'qa',
        targetStageId: 'development',
        sourceCommitHash: 'c60351e',
        qaPassRate: '1/2',
        reasons: ['缺少 rtsp 对应实现或测试。'],
        failingTestCases: [{ id: 'rtsp-reconnect', title: 'RTSP 断流恢复', status: 'blocked' }],
        requiredFixes: ['缺少 rtsp 对应实现或测试。'],
        regressionFocus: ['RTSP 断流恢复'],
        repairSubmission: {
          status: 'reviewing',
          submittedBy: 'Local Runner',
          commitHash: 'fix789',
          requiredGates: ['code-review', 'qa-retest'],
        },
      },
      developmentRun: {
        status: 'completed',
        commitHash: 'fix789',
        checks: [{ command: 'npm test', status: 'passed' }],
        changePackage: {
          status: 'ready-for-review',
          commitHash: 'fix789',
          reviewGate: { canStartReview: true, blockers: [] },
        },
      },
      repositoryConfig: {
        status: 'ready',
        verificationCommands: ['npm test'],
      },
      platformJobs: [],
    };
    const projectWithJob = {
      ...reviewProject,
      platformJobs: [job],
    };

    global.fetch = vi.fn(async (url, options = {}) => {
      if (url === '/api/users' && !options.method) {
        return jsonResponse({ users: appUsers, currentUser: appUsers[0] });
      }
      if (url === '/api/platform' && !options.method) {
        return jsonResponse({ platform: platformCockpit });
      }
      if (url === '/api/projects' && !options.method) {
        return jsonResponse({
          projects: [{ ...projectSummary, currentStageId: 'review', currentStageName: '代码、安全、性能评审' }],
        });
      }
      if (url === '/api/projects/demo-1' && !options.method) {
        return jsonResponse({ project: reviewProject });
      }
      if (url === '/api/projects/demo-1/platform-jobs' && options.method === 'POST') {
        return jsonResponse({
          project: projectWithJob,
          job,
          platform: {
            ...platformCockpit,
            aiOperations: {
              ...platformCockpit.aiOperations,
              jobs: [job],
              queue: { totalJobs: 1, queuedCount: 1, runningCount: 0, failedCount: 0, succeededCount: 0 },
            },
          },
        }, 201);
      }
      return jsonResponse({ error: 'not found' }, 404);
    });

    render(<App />);
    await openDeliveryConsole();

    fireEvent.click(await screen.findByRole('button', { name: '排队修复执行任务' }));

    const requestBody = JSON.parse(global.fetch.mock.calls.find(([url]) => url === '/api/projects/demo-1/platform-jobs')[1].body);
    expect(requestBody).toMatchObject({
      type: 'qa-defect-fix',
      source: 'qa-defect-fix',
      details: {
        defectFixSourceCommitHash: 'c60351e',
        qaPassRate: '1/2',
        requiredFixes: ['缺少 rtsp 对应实现或测试。'],
        regressionFocus: ['RTSP 断流恢复'],
        sandboxPolicy: 'project-verification-command-allowlist',
      },
    });
    expect((await screen.findAllByText('测试缺陷修复执行 · 排队')).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('沙箱策略：项目验证命令白名单').length).toBeGreaterThanOrEqual(1);
  });

  test('starts a queued QA defect fix job from the project defect panel and refreshes the review gate', async () => {
    const queuedJob = {
      id: 'qa-fix-job',
      projectId: 'demo-1',
      projectName: '客户门户',
      type: 'qa-defect-fix',
      title: 'QA 缺陷修复执行',
      status: 'queued',
      queuedAt: '2026-06-17T00:00:00.000Z',
      requestedBy: 'owner-aa',
      runCount: 2,
      command: 'npm test',
      source: 'qa-defect-fix',
      details: {
        defectFixSourceCommitHash: 'c60351e',
        qaPassRate: '1/2',
        repairCommitHash: 'fix789',
        filesChanged: ['src/rtspStream.js', 'server/rtspStream.test.js'],
        requiredFixes: ['补齐 RTSP 重连实现和回归测试。'],
        regressionFocus: ['RTSP 断流恢复'],
        sandboxPolicy: 'project-verification-command-allowlist',
      },
    };
    const succeededJob = {
      ...queuedJob,
      status: 'succeeded',
      finishedAt: '2026-06-17T00:01:00.000Z',
      exitCode: 0,
      durationMs: 1200,
      resultSummary: 'Repair checks passed.',
      stdout: '2 tests passed',
    };
    const developmentProject = {
      ...baseProject,
      currentStageId: 'development',
      stages: [
        { ...stages[0], status: 'approved' },
        { ...stages[1], status: 'approved' },
        { ...stages[2], status: 'approved' },
        { id: 'development', name: '自动开发', owner: 'AI 开发', status: 'active', checklist: [] },
        { id: 'review', name: '代码、安全、性能评审', owner: '技术负责人', status: 'queued', checklist: [] },
        { id: 'qa', name: 'QA 测试', owner: '测试', status: 'blocked', checklist: [] },
      ],
      defectFixPackage: {
        status: 'ready',
        sourceStageId: 'qa',
        targetStageId: 'development',
        sourceCommitHash: 'c60351e',
        qaPassRate: '1/2',
        reasons: ['缺少 RTSP 重连实现或测试。'],
        failingTestCases: [{ id: 'rtsp-reconnect', title: 'RTSP 断流恢复', status: 'blocked' }],
        requiredFixes: ['补齐 RTSP 重连实现和回归测试。'],
        regressionFocus: ['RTSP 断流恢复'],
      },
      developmentPlan: {
        status: 'ready',
        summary: 'QA 缺陷修复包已生成。',
        verificationCommands: ['npm test'],
        tasks: [{ id: 'qa-fix-1', title: '补齐 RTSP 重连实现和回归测试。' }],
      },
      repositoryConfig: {
        status: 'ready',
        verificationCommands: ['npm test'],
      },
      platformJobs: [queuedJob],
    };
    const reviewProject = {
      ...developmentProject,
      currentStageId: 'review',
      stages: developmentProject.stages.map((stage) => {
        if (stage.id === 'development') {
          return { ...stage, status: 'approved' };
        }
        if (stage.id === 'review') {
          return { ...stage, status: 'active' };
        }
        if (stage.id === 'qa') {
          return { ...stage, status: 'queued' };
        }
        return stage;
      }),
      defectFixPackage: {
        ...developmentProject.defectFixPackage,
        status: 'reviewing',
        targetStageId: 'review',
        repairSubmission: {
          status: 'reviewing',
          submittedBy: 'Local Runner',
          commitHash: 'fix789',
          filesChanged: ['src/rtspStream.js', 'server/rtspStream.test.js'],
          jobId: 'qa-fix-job',
          jobStatus: 'succeeded',
          jobResultSummary: 'Repair checks passed.',
          jobStdout: '2 tests passed',
          sandboxPolicy: 'project-verification-command-allowlist',
          sourceStageId: 'development',
          targetStageId: 'review',
          requiredGates: ['code-review', 'qa-retest'],
        },
      },
      developmentRun: {
        status: 'completed',
        commitHash: 'fix789',
        filesChanged: ['src/rtspStream.js', 'server/rtspStream.test.js'],
        checks: [{ command: 'npm test', status: 'passed', result: 'Repair checks passed.', exitCode: 0 }],
        changePackage: {
          status: 'ready-for-review',
          commitHash: 'fix789',
          filesChanged: ['src/rtspStream.js', 'server/rtspStream.test.js'],
          reviewGate: { canStartReview: true, blockers: [] },
        },
      },
      codeReviewReport: null,
      platformJobs: [succeededJob],
    };

    global.fetch = vi.fn(async (url, options = {}) => {
      if (url === '/api/users' && !options.method) {
        return jsonResponse({ users: appUsers, currentUser: appUsers[0] });
      }
      if (url === '/api/platform' && !options.method) {
        return jsonResponse({ platform: platformCockpit });
      }
      if (url === '/api/projects' && !options.method) {
        return jsonResponse({
          projects: [{ ...projectSummary, currentStageId: 'development', currentStageName: '自动开发' }],
        });
      }
      if (url === '/api/projects/demo-1' && !options.method) {
        return jsonResponse({ project: developmentProject });
      }
      if (url === '/api/projects/demo-1/platform-jobs/qa-fix-job/start' && options.method === 'POST') {
        return jsonResponse({
          project: reviewProject,
          job: succeededJob,
          platform: {
            ...platformCockpit,
            aiOperations: {
              ...platformCockpit.aiOperations,
              jobs: [succeededJob],
              queue: { totalJobs: 1, queuedCount: 0, runningCount: 0, failedCount: 0, succeededCount: 1 },
            },
          },
        });
      }
      return jsonResponse({ error: 'not found' }, 404);
    });

    render(<App />);
    await openDeliveryConsole();

    const repairJobCard = (await screen.findByText('测试缺陷修复执行 · 排队')).closest('.defect-fix-job');
    expect(within(repairJobCard).getByText('请求人 owner-aa · 第 2 次运行')).toBeInTheDocument();
    expect(within(repairJobCard).getByText('排队 2026-06-17T00:00:00.000Z')).toBeInTheDocument();
    expect(within(repairJobCard).getByText('下一步：启动任务执行修复命令。')).toBeInTheDocument();
    fireEvent.click(within(repairJobCard).getByRole('button', { name: '开始任务' }));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/projects/demo-1/platform-jobs/qa-fix-job/start',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ execute: true }),
        }),
      );
    });
    await screen.findByLabelText('当前任务速览');
    await expandCurrentTaskSection();
    expect(await screen.findByText('测试缺陷修复评审门禁')).toBeInTheDocument();
    expect(screen.getByText('来源测试 c60351e · 修复提交 fix789')).toBeInTheDocument();
    expect(screen.getAllByText('后台任务 成功 · qa-fix-job').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('变更文件 2 · 剩余门禁 代码评审、测试复测')).toBeInTheDocument();
  });

  test('shows QA defect fix job result copied onto the repair package', async () => {
    const reviewProject = {
      ...baseProject,
      currentStageId: 'review',
      stages: [
        { ...stages[0], status: 'approved' },
        { ...stages[1], status: 'approved' },
        { ...stages[2], status: 'approved' },
        { id: 'development', name: '自动开发', owner: 'AI 开发', status: 'approved', checklist: [] },
        { id: 'review', name: '代码、安全、性能评审', owner: '技术负责人', status: 'active', checklist: [] },
      ],
      defectFixPackage: {
        status: 'review-ready',
        sourceStageId: 'qa',
        targetStageId: 'development',
        sourceCommitHash: 'c60351e',
        qaPassRate: '1/2',
        reasons: ['缺少 rtsp 对应实现或测试。'],
        failingTestCases: [{ id: 'rtsp-reconnect', title: 'RTSP 断流恢复', status: 'blocked' }],
        requiredFixes: ['缺少 rtsp 对应实现或测试。'],
        regressionFocus: ['RTSP 断流恢复'],
        repairSubmission: {
          status: 'review-ready',
          submittedBy: 'Local Runner',
          commitHash: 'fix789',
          jobId: 'job-qa-fix',
          jobStatus: 'succeeded',
          jobResultSummary: 'Repair checks passed.',
          sandboxPolicy: 'project-verification-command-allowlist',
          requiredGates: ['code-review', 'qa-retest'],
        },
      },
      developmentRun: {
        status: 'completed',
        commitHash: 'fix789',
        checks: [{ command: 'npm test', status: 'passed' }],
        changePackage: {
          status: 'ready-for-review',
          commitHash: 'fix789',
          reviewGate: { canStartReview: true, blockers: [] },
        },
      },
      platformJobs: [],
    };

    global.fetch = vi.fn(async (url, options = {}) => {
      if (url === '/api/users' && !options.method) {
        return jsonResponse({ users: appUsers, currentUser: appUsers[0] });
      }
      if (url === '/api/platform' && !options.method) {
        return jsonResponse({ platform: platformCockpit });
      }
      if (url === '/api/projects' && !options.method) {
        return jsonResponse({
          projects: [{ ...projectSummary, currentStageId: 'review', currentStageName: '代码、安全、性能评审' }],
        });
      }
      if (url === '/api/projects/demo-1' && !options.method) {
        return jsonResponse({ project: reviewProject });
      }
      return jsonResponse({ error: 'not found' }, 404);
    });

    render(<App />);
    await openDeliveryConsole();

    await screen.findByText('测试缺陷修复评审门禁');
    expect(screen.getAllByText('后台任务 成功 · job-qa-fix').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('结果：修复检查已通过。')).toBeInTheDocument();
    expect(screen.getByText('沙箱策略：项目验证命令白名单')).toBeInTheDocument();
  });

  test('saves QA evidence on the test stage', async () => {
    const qaProject = {
      ...baseProject,
      currentStageId: 'qa',
      stages: [
        { ...stages[0], status: 'approved' },
        { ...stages[1], status: 'approved' },
        { ...stages[2], status: 'approved' },
        {
          id: 'qa',
          name: '测试',
          owner: '测试',
          status: 'active',
          description: '生成测试用例、执行自动测试、记录缺陷和测试结论。',
          checklist: ['编写测试用例', '执行自动测试', '记录缺陷', '输出测试报告'],
        },
      ],
      codeReviewReport: {
        status: 'passed',
      },
      yoloDeliveryChain: {
        isYoloProject: true,
      },
      qaEvidence: {
        status: 'incomplete',
        sampleSet: '',
        durationMinutes: 0,
        environment: '',
        browserScope: '',
        totalDetections: null,
        falsePositiveCount: null,
        falsePositiveRate: null,
        falsePositiveThreshold: 0.3,
        falsePositivePassed: null,
        qualityGateStatus: 'incomplete',
        missingFields: [
          'sampleSet',
          'durationMinutes',
          'environment',
          'browserScope',
          'totalDetections',
          'falsePositiveCount',
        ],
      },
    };
    const projectWithEvidence = {
      ...qaProject,
      qaEvidence: {
        status: 'ready',
        sampleSet: '10 段测试视频：有行人、无行人、多人、遮挡、弱光各 2 段。',
        durationMinutes: 30,
        environment: '本地 RTSP 测试流 + YOLO mock 推理服务。',
        browserScope: 'Chrome 126, Edge 126',
        notes: '误检率按 需求文档口径统计。',
        totalDetections: 50,
        falsePositiveCount: 9,
        falsePositiveRate: 0.18,
        falsePositiveThreshold: 0.3,
        falsePositivePassed: true,
        qualityGateStatus: 'passed',
        missingFields: [],
      },
    };

    global.fetch = vi.fn(async (url, options = {}) => {
      if (url === '/api/projects' && !options.method) {
        return jsonResponse({
          projects: [
            {
              ...projectSummary,
              currentStageId: 'qa',
              currentStageName: '测试',
              stageProgress: 7,
            },
          ],
        });
      }
      if (url === '/api/projects/demo-1' && !options.method) {
        return jsonResponse({ project: qaProject });
      }
      if (url === '/api/projects/demo-1/qa-evidence' && options.method === 'POST') {
        expect(JSON.parse(options.body)).toMatchObject({
          actor: '测试',
          durationMinutes: 30,
          browserScope: 'Chrome 126, Edge 126',
          totalDetections: 50,
          falsePositiveCount: 9,
          falsePositiveThreshold: 0.3,
        });
        return jsonResponse({ project: projectWithEvidence });
      }
      return jsonResponse({ error: 'not found' }, 404);
    });

    render(<App />);
    await openDeliveryConsole();

    const actionDetails = await screen.findByLabelText('测试操作详情');
    if (!actionDetails.hasAttribute('open')) {
      fireEvent.click(within(actionDetails).getByText('测试操作详情'));
    }
    const qaEvidenceDetails = within(actionDetails).getByLabelText('测试证据填写详情');
    expect(qaEvidenceDetails.tagName).toBe('DETAILS');
    expect(qaEvidenceDetails).not.toHaveAttribute('open');
    expect(within(qaEvidenceDetails).getByLabelText('测试视频样本')).not.toBeVisible();
    fireEvent.click(within(qaEvidenceDetails).getByText('测试证据填写详情'));
    expect(qaEvidenceDetails).toHaveAttribute('open');

    fireEvent.change(within(qaEvidenceDetails).getByLabelText('测试视频样本'), {
      target: { value: '10 段测试视频：有行人、无行人、多人、遮挡、弱光各 2 段。' },
    });
    fireEvent.change(within(qaEvidenceDetails).getByLabelText('测试时长（分钟）'), {
      target: { value: '30' },
    });
    fireEvent.change(within(qaEvidenceDetails).getByLabelText('测试环境'), {
      target: { value: '本地 RTSP 测试流 + YOLO mock 推理服务。' },
    });
    fireEvent.change(within(qaEvidenceDetails).getByLabelText('浏览器范围'), {
      target: { value: 'Chrome 126, Edge 126' },
    });
    fireEvent.change(within(qaEvidenceDetails).getByLabelText('总检测次数'), {
      target: { value: '50' },
    });
    fireEvent.change(within(qaEvidenceDetails).getByLabelText('误检次数'), {
      target: { value: '9' },
    });
    fireEvent.click(within(qaEvidenceDetails).getByRole('button', { name: '保存测试证据' }));

    expect(await screen.findByText('测试证据已就绪')).toBeInTheDocument();
    expect(screen.getByText('误检率 18% · 目标低于 30% · 已通过')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Chrome 126, Edge 126')).toBeInTheDocument();
  });

  test('starts a YOLO QA session on the test stage', async () => {
    const qaProject = {
      ...baseProject,
      name: 'YOLO 摄像头监控项目',
      summary: '接入 RTSP 摄像头并使用 YOLO 检测行人。',
      currentStageId: 'qa',
      stages: [
        { ...stages[0], status: 'approved' },
        { ...stages[1], status: 'approved' },
        { ...stages[2], status: 'approved' },
        {
          id: 'qa',
          name: '测试',
          owner: '测试',
          status: 'active',
          description: '生成测试用例、执行自动测试、记录缺陷和测试结论。',
          checklist: ['编写测试用例', '执行自动测试', '记录缺陷', '输出测试报告'],
        },
      ],
      codeReviewReport: {
        status: 'passed',
      },
      yoloDeliveryChain: {
        isYoloProject: true,
      },
      qaEvidence: {
        status: 'incomplete',
        sampleSet: '真实 RTSP 样本：有行人、无行人。',
        durationMinutes: 0,
        environment: '真实摄像头 + YOLO worker。',
        browserScope: 'Chrome 126',
        falsePositiveThreshold: 0.3,
        missingFields: ['durationMinutes', 'totalDetections', 'falsePositiveCount'],
        requireFalsePositiveMetrics: true,
      },
      yoloQaSession: null,
    };
    const projectWithSession = {
      ...qaProject,
      yoloQaSession: {
        id: 'yolo-qa-session-1',
        status: 'running',
        sampleSet: '真实 RTSP 样本：有行人、无行人。',
        environment: '真实摄像头 + YOLO worker。',
        browserScope: 'Chrome 126',
        channels: [72, 73, 74, 75],
        events: [],
        metrics: {
          totalDetections: 0,
          falsePositiveCount: 0,
          falsePositiveRate: null,
        },
      },
    };

    global.fetch = vi.fn(async (url, options = {}) => {
      if (url === '/api/projects' && !options.method) {
        return jsonResponse({
          projects: [
            {
              ...projectSummary,
              name: 'YOLO 摄像头监控项目',
              currentStageId: 'qa',
              currentStageName: '测试',
              stageProgress: 7,
            },
          ],
        });
      }
      if (url === '/api/projects/demo-1' && !options.method) {
        return jsonResponse({ project: qaProject });
      }
      if (url === '/api/projects/demo-1/yolo-qa-session' && options.method === 'POST') {
        expect(JSON.parse(options.body)).toMatchObject({
          actor: '测试',
          sampleSet: '真实 RTSP 样本：有行人、无行人。',
          environment: '真实摄像头 + YOLO worker。',
          browserScope: 'Chrome 126',
        });
        return jsonResponse({ project: projectWithSession });
      }
      return jsonResponse({ error: 'not found' }, 404);
    });

    render(<App />);
    await openDeliveryConsole();

    const actionDetails = await screen.findByLabelText('测试操作详情');
    if (!actionDetails.hasAttribute('open')) {
      fireEvent.click(within(actionDetails).getByText('测试操作详情'));
    }

    fireEvent.click(within(actionDetails).getByRole('button', { name: '开始 YOLO 测试批次' }));

    expect(await screen.findByText('YOLO 测试批次进行中')).toBeInTheDocument();
    expect(screen.getByText('已记录 0 条检测事件')).toBeInTheDocument();
  });

  test('generates final acceptance package on the acceptance stage', async () => {
    const acceptanceProject = {
      ...baseProject,
      currentStageId: 'acceptance',
      currentStageName: '最终验收',
      stages: [
        { ...stages[0], status: 'approved' },
        { ...stages[1], status: 'approved' },
        { ...stages[2], status: 'approved' },
        {
          id: 'acceptance',
          name: '最终验收',
          owner: '负责人',
          status: 'active',
          description: '汇总交付结果、发布说明、运维交接和验收结论。',
          checklist: ['确认测试通过', '确认运维交接', '确认发布说明', '归档交付报告'],
        },
      ],
      qaEvidence: {
        status: 'ready',
        sampleSet: '10 段测试视频',
        durationMinutes: 30,
        environment: '本地 RTSP 测试流',
        browserScope: 'Chrome 126, Edge 126',
        missingFields: [],
      },
      qaRun: {
        status: 'passed',
        passedCount: 6,
        totalCount: 6,
        commitHash: 'c60351e',
      },
      acceptancePackage: {
        status: 'not-generated',
        signoffStatus: 'not-started',
        summary: '最终验收包尚未生成。',
        deliverables: [],
        qa: { status: 'missing', passedCount: 0, totalCount: 0, evidenceStatus: 'incomplete' },
        ops: { status: 'missing', evidence: '运维需求和交接说明尚未归档。' },
        residualRisks: [],
        blockers: ['最终验收包尚未生成。'],
        nextActions: ['QA 通过后生成最终验收包。'],
      },
    };
    const projectWithPackage = {
      ...acceptanceProject,
      acceptancePackage: {
        status: 'ready',
        signoffStatus: 'pending',
        summary: '交付材料已汇总完成，等待负责人最终签收。',
        deliverables: [
          { id: 'prd', title: 'PRD', status: 'ready', evidence: 'PRD 已归档。' },
          { id: 'qa-report', title: 'QA 测试报告', status: 'ready', evidence: 'QA 已通过 6/6 个用例。' },
        ],
        qa: {
          status: 'passed',
          passedCount: 6,
          totalCount: 6,
          commitHash: 'c60351e',
          evidenceStatus: 'ready',
          sampleSet: '10 段测试视频',
          durationMinutes: 30,
          environment: '本地 RTSP 测试流',
          browserScope: 'Chrome 126, Edge 126',
        },
        ops: { status: 'ready', evidence: '运维需求和交接说明已归档。' },
        residualRisks: [
          { stageName: '测试', riskLevel: 'medium', title: '真实 RTSP 验收记录待归档', detail: '需要归档原始统计。' },
        ],
        blockers: [],
        nextActions: ['负责人检查验收包并完成最终签收。'],
      },
      artifacts: {
        ...acceptanceProject.artifacts,
        acceptance: '# 最终验收包: yolo摄像头监控项目',
      },
    };
    const signedProject = {
      ...projectWithPackage,
      stages: projectWithPackage.stages.map((stage) =>
        stage.id === 'acceptance' ? { ...stage, status: 'approved' } : stage,
      ),
      acceptancePackage: {
        ...projectWithPackage.acceptancePackage,
        signoffStatus: 'signed-off',
        signedOffBy: '负责人',
        signedOffAt: '2026-06-17T03:00:00.000Z',
        signoffOpinion: '验收通过，归档交付包。',
        archiveVersion: 'v2026.06-yolo-acceptance',
        summary: '项目已完成最终验收，交付包已归档。',
        residualRisks: [],
        nextActions: ['项目已完成最终验收，交付包已归档。'],
      },
    };

    global.fetch = vi.fn(async (url, options = {}) => {
      if (url === '/api/projects' && !options.method) {
        return jsonResponse({
          projects: [
            {
              ...projectSummary,
              currentStageId: 'acceptance',
              currentStageName: '最终验收',
              stageProgress: 9,
            },
          ],
        });
      }
      if (url === '/api/projects/demo-1' && !options.method) {
        return jsonResponse({ project: acceptanceProject });
      }
      if (url === '/api/projects/demo-1/generate-acceptance-package' && options.method === 'POST') {
        return jsonResponse({ project: projectWithPackage });
      }
      if (url === '/api/projects/demo-1/advance' && options.method === 'POST') {
        expect(JSON.parse(options.body)).toMatchObject({
          actor: '负责人',
          note: '验收通过，归档交付包。',
          archiveVersion: 'v2026.06-yolo-acceptance',
          expectedStageId: 'acceptance',
        });
        return jsonResponse({ project: signedProject });
      }
      return jsonResponse({ error: 'not found' }, 404);
    });

    render(<App />);
    await openDeliveryConsole();

    fireEvent.click(await screen.findByRole('button', { name: '生成最终验收包' }));

    expect(await screen.findByText('最终验收包已就绪')).toBeInTheDocument();
    const acceptanceActionCenter = screen.getByLabelText('验收处理中心');
    expect(within(acceptanceActionCenter).getByText('最终验收包')).toBeInTheDocument();
    expect(within(acceptanceActionCenter).getByRole('button', { name: '生成最终验收包' })).toBeInTheDocument();
    const acceptanceReadinessPreview = screen.getByLabelText('验收就绪摘要');
    expect(within(acceptanceReadinessPreview).getAllByText('验收就绪摘要').length).toBeGreaterThan(0);
    expect(within(acceptanceReadinessPreview).getByText('交付物 2')).toBeInTheDocument();
    expect(within(acceptanceReadinessPreview).getByText('测试 6/6')).toBeInTheDocument();
    expect(within(acceptanceReadinessPreview).getByText('剩余风险 1')).toBeInTheDocument();
    expect(within(acceptanceReadinessPreview).getByText('待签收')).toBeInTheDocument();
    expect(within(acceptanceReadinessPreview).getByText('真实 RTSP 验收记录待归档')).toBeInTheDocument();
    const acceptanceDetails = screen.getByLabelText('最终验收详情');
    expect(acceptanceDetails).not.toHaveAttribute('open');
    expect(within(acceptanceDetails).getByText('PRD')).not.toBeVisible();
    expect(within(acceptanceDetails).getByText('测试验证报告')).not.toBeVisible();
    expect(within(acceptanceDetails).getByText('真实 RTSP 验收记录待归档')).not.toBeVisible();
    fireEvent.click(within(acceptanceDetails).getByText('最终验收详情'));
    expect(acceptanceDetails).toHaveAttribute('open');
    expect(within(acceptanceDetails).getByText('PRD')).toBeVisible();
    expect(within(acceptanceDetails).getByText('测试验证报告')).toBeVisible();
    expect(within(acceptanceDetails).getByText('真实 RTSP 验收记录待归档')).toBeVisible();

    const executionPanel = screen.getByLabelText('阶段执行确认区');
    expect(executionPanel).not.toHaveAttribute('open');
    fireEvent.click(within(executionPanel).getByText('执行确认'));
    expect(executionPanel).toHaveAttribute('open');
    fireEvent.change(screen.getByLabelText('处理意见'), {
      target: { value: '验收通过，归档交付包。' },
    });
    fireEvent.change(screen.getByLabelText('归档版本'), {
      target: { value: 'v2026.06-yolo-acceptance' },
    });
    fireEvent.click(screen.getByRole('button', { name: '完成项目验收' }));

    expect((await screen.findAllByText('已签收')).length).toBeGreaterThan(0);
    expect(within(acceptanceDetails).getByText('签收人')).toBeVisible();
    expect(within(acceptanceDetails).getByText('v2026.06-yolo-acceptance')).toBeVisible();
  });

  test('inspects repository readiness and shows git diagnostics', async () => {
    const developmentProject = {
      ...baseProject,
      currentStageId: 'development',
      stages: [
        { ...stages[0], status: 'approved' },
        { ...stages[1], status: 'approved' },
        { ...stages[2], status: 'approved' },
        {
          id: 'development',
          name: '自动开发',
          owner: 'AI 开发',
          status: 'active',
          description: '按任务开发。',
          checklist: ['读取 PRD 和技术方案'],
        },
      ],
      developmentPlan: {
        status: 'ready',
        summary: '按 RTSP 接入、YOLO 推理和前端标注拆分开发任务。',
        verificationCommands: ['npm test'],
        tasks: [],
      },
      repositoryConfig: {
        status: 'ready',
        localPath: 'D:\\project\\WeeCoder',
        baseBranch: 'main',
        targetBranch: 'feature/yolo-camera-monitor',
        executionMode: 'codex-local',
        verificationCommands: ['npm test'],
        missingFields: [],
      },
    };
    const projectWithInspection = {
      ...developmentProject,
      repositoryInspection: {
        status: 'warning',
        inspectedAt: '2026-06-17T00:00:00.000Z',
        localPath: 'D:\\project\\WeeCoder',
        gitRoot: 'D:\\project\\WeeCoder',
        currentBranch: 'main',
        targetBranch: 'feature/yolo-camera-monitor',
        isGitRepository: true,
        targetBranchExists: false,
        hasUncommittedChanges: true,
        changedFilesCount: 2,
        canPrepareBranch: false,
        issues: ['工作区存在未提交变更。'],
        recommendations: ['提交或暂存当前变更后重新诊断。'],
      },
    };

    global.fetch = vi.fn(async (url, options = {}) => {
      if (url === '/api/projects' && !options.method) {
        return jsonResponse({
          projects: [
            {
              ...projectSummary,
              currentStageId: 'development',
              currentStageName: '自动开发',
              stageProgress: 5,
            },
          ],
        });
      }
      if (url === '/api/projects/demo-1' && !options.method) {
        return jsonResponse({ project: developmentProject });
      }
      if (url === '/api/projects/demo-1/inspect-repository' && options.method === 'POST') {
        return jsonResponse({ project: projectWithInspection });
      }
      return jsonResponse({ error: 'not found' }, 404);
    });

    render(<App />);
    await openDeliveryConsole();

    fireEvent.click(await screen.findByRole('button', { name: '诊断仓库' }));

    expect(await screen.findByText('仓库诊断')).toBeInTheDocument();
    expect(screen.getByText('需要处理')).toBeInTheDocument();
    expect(screen.getByText('main')).toBeInTheDocument();
    expect(screen.getByText('2 个文件')).toBeInTheDocument();
    expect(screen.getAllByText('工作区存在未提交变更。').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('提交或暂存当前变更后重新诊断。').length).toBeGreaterThanOrEqual(1);
  });

  test('prepares target branch and shows branch readiness', async () => {
    const developmentProject = {
      ...baseProject,
      currentStageId: 'development',
      stages: [
        { ...stages[0], status: 'approved' },
        { ...stages[1], status: 'approved' },
        { ...stages[2], status: 'approved' },
        {
          id: 'development',
          name: '自动开发',
          owner: 'AI 开发',
          status: 'active',
          description: '按任务开发。',
          checklist: ['读取 PRD 和技术方案'],
        },
      ],
      developmentPlan: {
        status: 'ready',
        summary: '按 RTSP 接入、YOLO 推理和前端标注拆分开发任务。',
        verificationCommands: ['npm test'],
        tasks: [],
      },
      repositoryConfig: {
        status: 'ready',
        localPath: 'D:\\project\\business-repo',
        baseBranch: 'main',
        targetBranch: 'feature/yolo-camera-monitor',
        executionMode: 'codex-local',
        verificationCommands: ['npm test'],
        missingFields: [],
      },
      repositoryInspection: {
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
        recommendations: ['目标分支 feature/yolo-camera-monitor 尚不存在，可从基准分支创建。'],
      },
    };
    const projectWithBranch = {
      ...developmentProject,
      branchPreparation: {
        status: 'ready',
        preparedAt: '2026-06-17T00:00:00.000Z',
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
    };

    global.fetch = vi.fn(async (url, options = {}) => {
      if (url === '/api/projects' && !options.method) {
        return jsonResponse({
          projects: [
            {
              ...projectSummary,
              currentStageId: 'development',
              currentStageName: '自动开发',
              stageProgress: 5,
            },
          ],
        });
      }
      if (url === '/api/projects/demo-1' && !options.method) {
        return jsonResponse({ project: developmentProject });
      }
      if (url === '/api/projects/demo-1/prepare-branch' && options.method === 'POST') {
        return jsonResponse({ project: projectWithBranch });
      }
      return jsonResponse({ error: 'not found' }, 404);
    });

    render(<App />);
    await openDeliveryConsole();

    fireEvent.click(await screen.findByRole('button', { name: '准备分支' }));

    expect(await screen.findByText('分支准备')).toBeInTheDocument();
    expect(screen.getByText('已就绪')).toBeInTheDocument();
    expect(screen.getByText('feature/yolo-camera-monitor')).toBeInTheDocument();
    expect(screen.getByText('已创建')).toBeInTheDocument();
    expect(screen.getByText('目标分支已准备好，可以启动自动开发。')).toBeInTheDocument();
  });
  test('generates AI development package and shows launch blockers', async () => {
    const developmentProject = {
      ...baseProject,
      currentStageId: 'development',
      stages: [
        { ...stages[0], status: 'approved' },
        { ...stages[1], status: 'approved' },
        { ...stages[2], status: 'approved' },
        {
          id: 'development',
          name: '自动开发',
          owner: 'AI 开发',
          status: 'active',
          description: '按任务开发。',
          checklist: ['读取 PRD 和技术方案'],
        },
      ],
      prdStatus: 'generated',
      technicalHandoffStatus: 'generated',
      artifacts: {
        ...baseProject.artifacts,
        development: '# 开发任务\n实现 RTSP、YOLO、前端标注和误检率统计。',
      },
      developmentPlan: {
        status: 'ready',
        summary: '按 RTSP 接入、YOLO 推理和前端标注拆分开发任务。',
        verificationCommands: ['npm test'],
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
        localPath: 'D:\\project\\WeeCoder',
        baseBranch: 'main',
        targetBranch: 'feature/yolo-camera-monitor',
        executionMode: 'codex-local',
        verificationCommands: ['npm test'],
        missingFields: [],
      },
      repositoryInspection: {
        status: 'blocked',
        localPath: 'D:\\project\\WeeCoder',
        targetBranch: 'feature/yolo-camera-monitor',
        isGitRepository: false,
        canPrepareBranch: false,
        issues: ['本地路径不是 Git 仓库。'],
        recommendations: ['请选择真实业务代码仓库路径后重新诊断。'],
      },
      branchPreparation: {
        status: 'blocked',
        localPath: 'D:\\project\\WeeCoder',
        targetBranch: 'feature/yolo-camera-monitor',
        canRunDevelopment: false,
        issues: ['仓库诊断未通过，不能准备分支。'],
        recommendations: ['请选择真实业务代码仓库路径后重新诊断。'],
      },
    };
    const projectWithPackage = {
      ...developmentProject,
      agentExecutionPackage: {
        status: 'blocked',
        canStart: false,
        generatedAt: '2026-06-17T00:00:00.000Z',
        blockers: [
          '仓库诊断未通过：本地路径不是 Git 仓库。',
          '目标分支未准备好：仓库诊断未通过，不能准备分支。',
        ],
        gates: [{ id: 'repository-inspection', label: '仓库诊断', status: 'blocked' }],
        repository: {
          localPath: 'D:\\project\\WeeCoder',
          targetBranch: 'feature/yolo-camera-monitor',
        },
        verificationCommands: ['npm test'],
        tasks: developmentProject.developmentPlan.tasks,
        instructions: '启动状态：BLOCKED\n仓库诊断未通过：本地路径不是 Git 仓库。',
      },
    };

    global.fetch = vi.fn(async (url, options = {}) => {
      if (url === '/api/projects' && !options.method) {
        return jsonResponse({
          projects: [
            {
              ...projectSummary,
              currentStageId: 'development',
              currentStageName: '自动开发',
              stageProgress: 5,
            },
          ],
        });
      }
      if (url === '/api/projects/demo-1' && !options.method) {
        return jsonResponse({ project: developmentProject });
      }
      if (url === '/api/projects/demo-1/generate-development-package' && options.method === 'POST') {
        return jsonResponse({ project: projectWithPackage });
      }
      return jsonResponse({ error: 'not found' }, 404);
    });

    render(<App />);
    await openDeliveryConsole();

    fireEvent.click(await screen.findByRole('button', { name: '生成智能开发任务包' }));

    const actionDetails = await screen.findByLabelText('开发操作详情');
    if (!actionDetails.hasAttribute('open')) {
      fireEvent.click(within(actionDetails).getByText('开发操作详情'));
    }
    expect(await screen.findByText('智能开发任务包')).toBeInTheDocument();
    expect(screen.getByText('不可启动')).toBeInTheDocument();
    expect(screen.getAllByText('仓库诊断未通过：本地路径不是 Git 仓库。').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('启动状态：已阻塞').length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText('启动状态：BLOCKED')).not.toBeInTheDocument();
    const instructionDetails = screen.getByLabelText('智能开发任务包指令明细');
    expect(instructionDetails).not.toHaveAttribute('open');
    expect(within(instructionDetails).getByText('仓库诊断未通过：本地路径不是 Git 仓库。')).not.toBeVisible();
    fireEvent.click(within(instructionDetails).getByText('查看执行指令'));
    expect(instructionDetails).toHaveAttribute('open');
    expect(within(instructionDetails).getByText('仓库诊断未通过：本地路径不是 Git 仓库。')).toBeVisible();
  });
});

async function openOperationsConsole() {
  fireEvent.click(await screen.findByRole('button', { name: '运营后台' }));
  return screen.findByLabelText('商业化运营后台');
}

async function expandPlatformJobDetails() {
  const queueCard = (await screen.findByText('后台任务队列')).closest('article');
  const details = within(queueCard).getByLabelText('后台任务明细');

  if (!details.hasAttribute('open')) {
    fireEvent.click(within(details).getByText('展开后台任务明细'));
  }

  return details;
}

async function openDeliveryConsole() {
  fireEvent.click(await screen.findByRole('button', { name: '交付控制' }));
  const workspace = await screen.findByLabelText('项目工作区');
  await screen.findByLabelText('当前任务速览');
  await expandCurrentTaskSection();
  await expandCurrentTaskDetail();
  return workspace;
}

async function expandCurrentTaskSection() {
  if (screen.queryByLabelText('当前任务区')) {
    return screen.getByLabelText('当前任务区');
  }

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const expandButton = await screen.findByRole('button', {
      name: /展开(?:当前任务详情|当前任务|主操作区 当前任务)/,
    });
    fireEvent.click(expandButton);

    try {
      return await screen.findByLabelText('当前任务区', {}, { timeout: 500 });
    } catch (error) {
      if (attempt === 2) throw error;
    }
  }

  return screen.findByLabelText('当前任务区');
}

async function expandCurrentTaskDetail() {
  const currentTaskArea = await expandCurrentTaskSection();
  const taskDetail = within(currentTaskArea).queryByLabelText('任务处理详情');

  if (taskDetail && !taskDetail.hasAttribute('open')) {
    fireEvent.click(within(taskDetail).getByText('任务处理详情'));
  }

  return taskDetail;
}

async function expandPersonalWorkspaceContext() {
  const context = await screen.findByLabelText('个人工作台补充信息');
  if (!context.hasAttribute('open')) {
    fireEvent.click(within(context).getByText('展开补充信息'));
  }
  return context;
}

async function openTaskConsole() {
  fireEvent.click(await screen.findByRole('button', { name: '任务队列' }));
  return screen.findByText('角色收件箱');
}

function jsonResponse(body, status = 200) {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  });
}
