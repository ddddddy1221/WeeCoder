import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';
import { ProjectWorkspace } from './ProjectWorkspace.jsx';

describe('ProjectWorkspace', () => {
  test('shows the latest business pipeline bands and grouped delivery stages', () => {
    const onStageChange = vi.fn();
    const project = {
      id: 'pipeline-demo',
      name: '业务流转演示项目',
      summary: '验证最新业务流转 Pipeline 可以在项目详情页被快速理解。',
      health: 'on-track',
      currentStageId: 'architecture',
      currentStageName: '架构与数据设计',
      currentOwner: '技术负责人',
      stageProgress: 4,
      totalStages: 10,
      stages: createPipelineWorkflowStages('architecture'),
    };

    render(
      <ProjectWorkspace
        activeTab="overview"
        onStageChange={onStageChange}
        onTabChange={vi.fn()}
        project={project}
        selectedStageId="architecture"
      >
        <div />
      </ProjectWorkspace>,
    );

    const bandStrip = screen.getByLabelText('业务带进度');
    expect(within(bandStrip).getByText('需求带')).toBeInTheDocument();
    expect(within(bandStrip).getByText('设计带')).toBeInTheDocument();
    expect(within(bandStrip).getByText('构建带')).toBeInTheDocument();
    expect(within(bandStrip).getByText('验证带')).toBeInTheDocument();
    expect(within(bandStrip).getByText('发布带')).toBeInTheDocument();
    expect(within(bandStrip).getByRole('button', { name: /设计带/ })).toHaveAttribute(
      'aria-current',
      'step',
    );

    const pipeline = screen.getByLabelText('业务流转 Pipeline');
    expect(within(pipeline).getByText('当前业务带：设计带')).toBeInTheDocument();
    expect(within(pipeline).getByText('13 个主阶段')).toBeInTheDocument();
    fireEvent.click(within(pipeline).getByText('业务流转 Pipeline'));

    const fullPipeline = within(pipeline).getByLabelText('完整业务流转阶段');
    expect(within(fullPipeline).getByText('UI / 交互设计')).toBeVisible();
    expect(within(fullPipeline).getByText('ERD / 技术设计')).toBeVisible();
    expect(within(fullPipeline).getByText('黑盒测试')).toBeVisible();
    expect(within(fullPipeline).getByText('白盒测试 / 安全 / 质量审查')).toBeVisible();
    expect(within(fullPipeline).getByText('最终验收')).toBeVisible();

    fireEvent.click(within(bandStrip).getByRole('button', { name: /验证带/ }));
    expect(onStageChange).toHaveBeenCalledWith('qa');
  });

  test('shows current pipeline stage guidance in the expanded stage detail', () => {
    const project = {
      id: 'pipeline-guidance-demo',
      name: '业务阶段指引项目',
      summary: '验证当前阶段详情能说明业务 Pipeline 的交付要求。',
      health: 'on-track',
      currentStageId: 'architecture',
      currentStageName: '架构与数据设计',
      currentOwner: '技术负责人',
      stageProgress: 4,
      totalStages: 10,
      stages: createPipelineWorkflowStages('architecture'),
    };

    render(
      <ProjectWorkspace
        activeTab="overview"
        onStageChange={vi.fn()}
        onTabChange={vi.fn()}
        project={project}
        selectedStageId="architecture"
      >
        <div />
      </ProjectWorkspace>,
    );

    fireEvent.click(screen.getByRole('button', { name: '查看阶段详情' }));
    const stageDetail = screen.getByLabelText('阶段交付详情');
    const guidance = within(stageDetail).getByLabelText('业务阶段指引');
    expect(within(guidance).getByText('当前业务阶段：UI / 交互设计')).toBeInTheDocument();
    expect(within(guidance).getByText('工作模式：人工负责，后续 AI 辅助')).toBeInTheDocument();
    expect(within(guidance).getByText('人工闸口')).toBeInTheDocument();
    expect(
      within(guidance).getByText('产品或设计确认核心用户路径和关键页面交互。'),
    ).toBeInTheDocument();
    expect(within(guidance).getByText('页面流程')).toBeInTheDocument();
    expect(within(guidance).getByText('交互说明')).toBeInTheDocument();
    expect(within(guidance).getByText('线框图或截图')).toBeInTheDocument();
  });

  test('summarizes the active business band before expanding the full pipeline', () => {
    const project = {
      id: 'band-summary-demo',
      name: '业务带摘要项目',
      summary: '验证当前业务带能给出阶段范围和推荐动作。',
      health: 'on-track',
      currentStageId: 'architecture',
      currentStageName: '架构与数据设计',
      currentOwner: '技术负责人',
      stageProgress: 4,
      totalStages: 10,
      stages: createPipelineWorkflowStages('architecture'),
    };

    render(
      <ProjectWorkspace
        activeTab="overview"
        onStageChange={vi.fn()}
        onTabChange={vi.fn()}
        project={project}
        selectedStageId="architecture"
      >
        <div />
      </ProjectWorkspace>,
    );

    const bandSummary = screen.getByLabelText('当前业务带摘要');
    expect(within(bandSummary).getByText('当前业务带：设计带')).toBeInTheDocument();
    expect(within(bandSummary).getByText('3 个阶段 · 0 个已完成')).toBeInTheDocument();
    expect(within(bandSummary).getByText('UI / 交互设计')).toBeInTheDocument();
    expect(within(bandSummary).getByText('ERD / 技术设计')).toBeInTheDocument();
    expect(within(bandSummary).getByText('运维需求')).toBeInTheDocument();
    expect(within(bandSummary).getAllByText('进行中 · 产物 3 · 闸口 1')).toHaveLength(1);
    expect(within(bandSummary).getAllByText('进行中 · 产物 4 · 闸口 1')).toHaveLength(1);
    expect(within(bandSummary).getByText('等待中 · 产物 4 · 闸口 1')).toBeInTheDocument();
    expect(within(bandSummary).getByText('必要产物 11')).toBeInTheDocument();
    expect(within(bandSummary).getByText('人工闸口 3')).toBeInTheDocument();
    expect(within(bandSummary).getByText('页面流程')).toBeInTheDocument();
    expect(within(bandSummary).getByText('运行环境')).toBeInTheDocument();
    expect(
      within(bandSummary).getByText('先补齐当前业务带的必要产物，再推动下一阶段流转。'),
    ).toBeInTheDocument();
  });

  test('shows an actionable workbench for the current pipeline stage', () => {
    const project = {
      id: 'stage-workbench-demo',
      name: '阶段工作台项目',
      summary: '验证当前业务阶段可以直接看到动作、产物和人工闸口。',
      health: 'on-track',
      currentStageId: 'architecture',
      currentStageName: '架构与数据设计',
      currentOwner: '技术负责人',
      stageProgress: 4,
      totalStages: 10,
      artifacts: {
        architecture: '# 设计产物\n\n页面流程已生成。\n\n交互说明已补齐。',
      },
      stageConfirmations: {
        architecture: {
          missingItems: [{ id: 'wireframe', title: '线框图或截图' }],
        },
      },
      stages: createPipelineWorkflowStages('architecture'),
    };

    render(
      <ProjectWorkspace
        activeTab="overview"
        onStageChange={vi.fn()}
        onTabChange={vi.fn()}
        project={project}
        selectedStageId="architecture"
      >
        <div />
      </ProjectWorkspace>,
    );

    const workbench = screen.getByLabelText('当前业务阶段工作台');
    expect(within(workbench).getByText('阶段工作台')).toBeInTheDocument();
    expect(within(workbench).getByText('UI / 交互设计')).toBeInTheDocument();
    expect(within(workbench).getByText('负责人：产品 / 设计')).toBeInTheDocument();
    expect(within(workbench).getByText('工作模式：人工负责，后续 AI 辅助')).toBeInTheDocument();
    expect(within(workbench).getByText('闸口需处理')).toBeInTheDocument();
    expect(within(workbench).getByText('缺失 1 个必要产物。')).toBeInTheDocument();
    expect(within(workbench).getByText('建议动作')).toBeInTheDocument();
    expect(within(workbench).getByRole('button', { name: '补齐线框图或截图' })).toBeInTheDocument();
    expect(
      within(workbench).getByText('下一步动作：补齐页面流程等必要产物，并完成产品 / 设计确认。'),
    ).toBeInTheDocument();
    expect(within(workbench).getByText('页面流程')).toBeInTheDocument();
    expect(within(workbench).getAllByText('已生成')).toHaveLength(2);
    expect(within(workbench).getByText('交互说明')).toBeInTheDocument();
    expect(within(workbench).getByText('线框图或截图')).toBeInTheDocument();
    expect(within(workbench).getByText('缺失')).toBeInTheDocument();
    expect(within(workbench).getByText('人工闸口')).toBeInTheDocument();
    expect(
      within(workbench).getByText('产品或设计确认核心用户路径和关键页面交互。'),
    ).toBeInTheDocument();
  });

  test('shows stale downstream artifact state when the PRD version is stale', () => {
    const project = {
      id: 'stale-artifact-demo',
      name: '过期产物项目',
      summary: '验证 PRD 变更后下游产物需要重新确认。',
      health: 'warning',
      currentStageId: 'development',
      currentStageName: '自动开发',
      currentOwner: 'AI 开发',
      stageProgress: 6,
      totalStages: 10,
      artifacts: {
        development: '# 开发变更包\n\n变更包已生成。',
      },
      prdChangeImpact: {
        status: 'stale',
        summary: 'PRD v1 已过期：范围边界 已变更。',
      },
      prdVersion: {
        label: 'v1',
        status: 'stale',
      },
      stages: createPipelineWorkflowStages('development'),
    };

    render(
      <ProjectWorkspace
        activeTab="development"
        onStageChange={vi.fn()}
        onTabChange={vi.fn()}
        project={project}
        selectedStageId="development"
      >
        <div />
      </ProjectWorkspace>,
    );

    const workbench = screen.getByLabelText('当前业务阶段工作台');
    expect(within(workbench).getByText('代码编写与集成')).toBeInTheDocument();
    expect(within(workbench).getByText('闸口需重检')).toBeInTheDocument();
    expect(within(workbench).getByText('过期 4 个必要产物。')).toBeInTheDocument();
    expect(within(workbench).getByRole('button', { name: '重新生成需求文档' })).toBeInTheDocument();
    expect(within(workbench).getByRole('button', { name: '重新生成开发任务包' })).toBeInTheDocument();
    expect(within(workbench).getByText('变更包')).toBeInTheDocument();
    expect(within(workbench).getAllByText('已过期').length).toBeGreaterThan(0);
  });

  test('uses Chinese product terms in requirement navigation and summaries', () => {
    const project = {
      id: 'copy-demo',
      name: '中文文案演示项目',
      summary: '验证项目详情页静态文案不混入英文缩写。',
      health: 'on-track',
      currentStageId: 'pm-requirements',
      currentStageName: 'PM requirements',
      currentOwner: '项目经理',
      stageProgress: 1,
      totalStages: 2,
      stages: [
        {
          id: 'pm-requirements',
          name: 'PM requirements',
          owner: '项目经理',
          status: 'active',
          description: '逐轮澄清需求。',
          checklist: ['确认目标用户'],
        },
        {
          id: 'prd-approval',
          name: 'PRD 审批',
          owner: '负责人',
          status: 'queued',
          description: '审批需求文档。',
          checklist: ['确认范围'],
        },
      ],
    };

    render(
      <ProjectWorkspace
        activeTab="requirements"
        onStageChange={vi.fn()}
        onTabChange={vi.fn()}
        project={project}
        selectedStageId="pm-requirements"
      >
        <div />
      </ProjectWorkspace>,
    );

    const workspaceHeader = screen.getByLabelText('项目头部');
    expect(workspaceHeader).toHaveClass('compact-workspace-header');

    const tablist = screen.getByRole('tablist', { name: '项目工作区视图' });
    expect(within(tablist).getByRole('tab', { name: '需求文档' })).toBeInTheDocument();
    expect(within(tablist).queryByRole('tab', { name: '需求与 PRD' })).not.toBeInTheDocument();

    const statusBar = screen.getByLabelText('项目状态条');
    expect(statusBar).toHaveClass('compact-status-strip');
    expect(screen.queryByLabelText('项目处理焦点')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('交付阶段')).not.toBeInTheDocument();
    const viewGuide = within(statusBar).getByLabelText('视图说明');
    expect(viewGuide.tagName).toBe('DETAILS');
    expect(viewGuide).toHaveClass('compact-view-guide');
    expect(viewGuide).not.toHaveAttribute('open');
    expect(within(viewGuide).getByText('当前视图：需求文档')).toBeInTheDocument();
    expect(within(viewGuide).getByText('展开视图说明')).toBeInTheDocument();
    expect(within(viewGuide).queryByText('关联阶段：项目经理需求')).not.toBeInTheDocument();
    expect(within(viewGuide).queryByText('聚焦需求确认、需求文档草稿和缺项追问。')).not.toBeInTheDocument();
    fireEvent.click(within(viewGuide).getByText('展开视图说明'));
    expect(viewGuide).toHaveAttribute('open');
    expect(within(viewGuide).getByText('建议下一步：补齐需求缺项并生成需求文档。')).toBeVisible();
    expect(within(viewGuide).getByText('聚焦需求确认、需求文档草稿和缺项追问。')).toBeVisible();
    expect(within(viewGuide).getByText('关联阶段：项目经理需求')).toBeVisible();
    expect(screen.queryByLabelText('项目视图摘要')).not.toBeInTheDocument();
    expect(document.body.textContent).not.toContain('PRD');
  });

  test('localizes mixed Chinese and English review stage names', () => {
    const project = {
      id: 'review-demo',
      name: '评审演示项目',
      summary: '验证阶段名称本地化。',
      health: 'on-track',
      currentStageId: 'review',
      currentStageName: '代码/安全/性能 Review',
      currentOwner: '技术负责人',
      stageProgress: 1,
      totalStages: 1,
      stages: [
        {
          id: 'review',
          name: '代码/安全/性能 Review',
          owner: '技术负责人',
          status: 'active',
          description: '执行代码、安全、性能评审。',
          checklist: ['代码评审', '安全检查', '性能检查'],
        },
      ],
    };

    render(
      <ProjectWorkspace
        activeTab="overview"
        onStageChange={vi.fn()}
        onTabChange={vi.fn()}
        project={project}
        selectedStageId="review"
      >
        <div />
      </ProjectWorkspace>,
    );

    expect(screen.getAllByText('代码、安全、性能评审').length).toBeGreaterThan(0);
    expect(screen.queryByText('代码/安全/性能 Review')).not.toBeInTheDocument();
  });

  test('shows a compact current-stage action bar and keeps delivery detail collapsed by default', () => {
    const project = {
      id: 'pm-demo',
      name: '需求演示项目',
      summary: '验证阶段行动条。',
      health: 'warning',
      currentStageId: 'pm-requirements',
      currentStageName: 'PM requirements',
      currentOwner: '项目经理',
      openFollowupTaskCount: 2,
      stageProgress: 1,
      totalStages: 3,
      stageConfirmations: {
        'pm-requirements': {
          missingItems: [
            { id: 'target-users', title: '目标用户与核心场景' },
            { id: 'success-metrics', title: '成功指标与验收口径' },
          ],
        },
      },
      stageRiskRegister: {
        'pm-requirements': {
          potentialRisks: [{ title: '测试样本不足' }],
          functionalGaps: [{ title: '浏览器范围未确认' }],
        },
      },
      artifacts: {
        'pm-requirements': '# 需求文档草案\n\n- 目标用户待确认',
      },
      stages: [
        {
          id: 'pm-requirements',
          name: 'PM requirements',
          owner: '项目经理',
          status: 'active',
          description: '逐轮澄清需求。',
          checklist: ['确认目标用户', '确认验收口径'],
        },
        {
          id: 'prd-approval',
          name: 'PRD approval',
          owner: '负责人',
          status: 'queued',
          description: '审批需求文档。',
          checklist: ['确认范围'],
        },
      ],
    };

    render(
      <ProjectWorkspace
        activeTab="requirements"
        onStageChange={vi.fn()}
        onTabChange={vi.fn()}
        project={project}
        selectedStageId="pm-requirements"
      >
        <div />
      </ProjectWorkspace>,
    );

    expect(screen.queryByLabelText('当前阶段工作台')).not.toBeInTheDocument();
    const focusSummary = screen.getByLabelText('项目状态条');
    expect(screen.queryByLabelText('项目处理焦点')).not.toBeInTheDocument();
    expect(within(focusSummary).getByText('进度 33%')).toBeInTheDocument();
    expect(within(focusSummary).getByText('阶段 1/3')).toBeInTheDocument();
    expect(within(focusSummary).getByText('确认缺项 2')).toBeInTheDocument();
    expect(within(focusSummary).getByText('风险不足 2')).toBeInTheDocument();
    const currentStageSummary = within(focusSummary).getByLabelText('当前阶段摘要');
    const nextActionSummary = within(focusSummary).getByLabelText('下一步动作摘要');
    expect(within(currentStageSummary).getByText('当前阶段')).toBeInTheDocument();
    expect(within(currentStageSummary).getByText('项目经理需求')).toBeInTheDocument();
    expect(within(currentStageSummary).queryByText('逐轮澄清需求。')).not.toBeInTheDocument();
    expect(within(nextActionSummary).getByText('下一步动作')).toBeInTheDocument();
    expect(within(nextActionSummary).getByText('补齐确认事项后进入下一闸口')).toBeInTheDocument();
    expect(
      within(nextActionSummary).queryByText('优先补齐当前阶段确认事项，再进入下一闸口。'),
    ).not.toBeInTheDocument();
    expect(within(focusSummary).queryByLabelText('概览关键指标')).not.toBeInTheDocument();
    expect(within(focusSummary).queryByText('需求文档草案')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('项目概览状态条')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('交付焦点摘要')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('项目交付总览')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('当前阶段行动条')).not.toBeInTheDocument();
    expect(within(currentStageSummary).getByText('进行中 · 项目经理')).toBeInTheDocument();
    expect(within(nextActionSummary).getByText('确认缺项 2 · 阻塞待办 2')).toBeInTheDocument();
    expect(within(focusSummary).queryByLabelText('当前阶段指标')).not.toBeInTheDocument();
    expect(within(focusSummary).queryByText('检查项 2')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('阶段指挥条')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('阶段上下文')).not.toBeInTheDocument();
    expect(document.querySelector('.delivery-stage-strip')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('交付阶段')).not.toBeInTheDocument();
    const stageShell = within(focusSummary).getByLabelText('阶段轨道');
    expect(stageShell.tagName).toBe('DETAILS');
    expect(stageShell).not.toHaveAttribute('open');
    expect(within(stageShell).getByText('阶段轨道')).toBeInTheDocument();
    expect(within(stageShell).getByText('当前 1/3')).toBeInTheDocument();
    const stageRail = within(stageShell).getByLabelText('阶段进度轨道');
    expect(within(stageRail).getByText('项目经理需求')).toBeInTheDocument();
    expect(within(stageRail).getByText('项目经理需求')).not.toBeVisible();
    fireEvent.click(within(stageShell).getByText('阶段轨道'));
    expect(stageShell).toHaveAttribute('open');
    expect(within(stageRail).getByText('项目经理需求')).toBeVisible();
    expect(within(stageRail).getByText('需求文档审批')).toBeVisible();
    expect(screen.queryByLabelText('阶段交付详情')).not.toBeInTheDocument();
    fireEvent.click(within(focusSummary).getByRole('button', { name: '查看阶段详情' }));
    const stageDetail = screen.getByLabelText('阶段交付详情');
    expect(stageDetail).toBeInTheDocument();
    expect(within(stageDetail).getByText('逐轮澄清需求。')).toBeInTheDocument();
    expect(
      within(stageDetail).getByText('优先补齐当前阶段确认事项，再进入下一闸口。'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '收起阶段详情' })).toBeInTheDocument();
    expect(screen.getByText('需求文档审批')).toBeInTheDocument();
    expect(screen.queryByText('PRD approval')).not.toBeInTheDocument();
  });

  test('combines project status, stage action, and view guidance into one focus panel', () => {
    const project = {
      id: 'focus-panel-demo',
      name: '项目焦点演示',
      summary: '验证项目工作台首屏只保留一个处理焦点。',
      health: 'warning',
      currentStageId: 'pm-requirements',
      currentStageName: 'PM requirements',
      currentOwner: '项目经理',
      openFollowupTaskCount: 2,
      stageProgress: 1,
      totalStages: 3,
      stageConfirmations: {
        'pm-requirements': {
          missingItems: [{ id: 'target-users', title: '目标用户与核心场景' }],
        },
      },
      stageRiskRegister: {
        'pm-requirements': {
          potentialRisks: [{ title: '测试样本不足' }],
          functionalGaps: [],
        },
      },
      stages: [
        {
          id: 'pm-requirements',
          name: 'PM requirements',
          owner: '项目经理',
          status: 'active',
          description: '逐轮澄清需求。',
          checklist: ['确认目标用户', '确认验收口径'],
        },
        {
          id: 'prd-approval',
          name: 'PRD approval',
          owner: '负责人',
          status: 'queued',
          description: '审批需求文档。',
          checklist: ['确认范围'],
        },
      ],
    };

    render(
      <ProjectWorkspace
        activeTab="requirements"
        onStageChange={vi.fn()}
        onTabChange={vi.fn()}
        project={project}
        selectedStageId="pm-requirements"
      >
        <div />
      </ProjectWorkspace>,
    );

    const focusPanel = screen.getByLabelText('项目状态条');
    expect(screen.queryByLabelText('项目处理焦点')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('交付阶段')).not.toBeInTheDocument();
    const currentStageSummary = within(focusPanel).getByLabelText('当前阶段摘要');
    const nextActionSummary = within(focusPanel).getByLabelText('下一步动作摘要');
    expect(within(currentStageSummary).getByText('当前阶段')).toBeInTheDocument();
    expect(within(currentStageSummary).getByText('项目经理需求')).toBeInTheDocument();
    expect(within(nextActionSummary).getByText('下一步动作')).toBeInTheDocument();
    expect(within(nextActionSummary).getByText('补齐确认事项后进入下一闸口')).toBeInTheDocument();
    expect(
      within(nextActionSummary).queryByText('优先补齐当前阶段确认事项，再进入下一闸口。'),
    ).not.toBeInTheDocument();
    expect(within(focusPanel).getByText('进度 33%')).toBeInTheDocument();
    expect(within(focusPanel).getByText('阶段 1/3')).toBeInTheDocument();
    expect(within(focusPanel).getByText('确认缺项 2')).toBeInTheDocument();
    expect(within(focusPanel).getByText('当前视图：需求文档')).toBeInTheDocument();

    const viewGuide = within(focusPanel).getByLabelText('视图说明');
    expect(viewGuide).not.toHaveAttribute('open');
    expect(within(viewGuide).queryByText('聚焦需求确认、需求文档草稿和缺项追问。')).not.toBeInTheDocument();
    fireEvent.click(within(viewGuide).getByText('展开视图说明'));
    expect(within(viewGuide).getByText('聚焦需求确认、需求文档草稿和缺项追问。')).toBeVisible();

    expect(screen.queryByLabelText('项目概览状态条')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('当前阶段行动条')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('项目视图摘要')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('阶段交付详情')).not.toBeInTheDocument();
    fireEvent.click(within(focusPanel).getByRole('button', { name: '查看阶段详情' }));
    expect(screen.getByLabelText('阶段交付详情')).toBeInTheDocument();
  });

  test('uses a compact command strip on the overview and keeps stage detail expandable', () => {
    const project = {
      id: 'compact-overview-demo',
      name: '紧凑概览演示项目',
      summary: '验证概览页只保留状态条，详细阶段信息放入抽屉。',
      health: 'warning',
      currentStageId: 'pm-requirements',
      currentStageName: 'PM requirements',
      currentOwner: '项目经理',
      openFollowupTaskCount: 1,
      stageProgress: 1,
      totalStages: 2,
      stageConfirmations: {
        'pm-requirements': {
          missingItems: [{ id: 'metrics', title: '成功指标' }],
        },
      },
      stageRiskRegister: {
        'pm-requirements': {
          potentialRisks: [{ title: '测试样本不足' }],
          functionalGaps: [],
        },
      },
      stages: [
        {
          id: 'pm-requirements',
          name: 'PM requirements',
          owner: '项目经理',
          status: 'active',
          description: '逐轮澄清需求。',
          checklist: ['确认目标用户'],
        },
        {
          id: 'development',
          name: 'Development',
          owner: '技术负责人',
          status: 'queued',
          description: '启动开发。',
          checklist: ['生成任务包'],
        },
      ],
    };

    render(
      <ProjectWorkspace
        activeTab="overview"
        onStageChange={vi.fn()}
        onTabChange={vi.fn()}
        project={project}
        selectedStageId="pm-requirements"
      >
        <div />
      </ProjectWorkspace>,
    );

    const focusPanel = screen.getByLabelText('项目状态条');
    expect(screen.queryByLabelText('项目处理焦点')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('交付阶段')).not.toBeInTheDocument();
    expect(focusPanel).toBeInTheDocument();
    expect(within(focusPanel).getByText('当前视图：概览')).toBeInTheDocument();
    expect(within(focusPanel).getByText('进度 50%')).toBeInTheDocument();
    expect(screen.queryByLabelText('当前阶段行动条')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('项目概览状态条')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('交付焦点摘要')).not.toBeInTheDocument();

    expect(screen.queryByLabelText('阶段详情抽屉')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('阶段交付详情')).not.toBeInTheDocument();

    fireEvent.click(within(focusPanel).getByRole('button', { name: '查看阶段详情' }));
    expect(screen.getByLabelText('阶段交付详情')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '收起阶段详情' })).toBeInTheDocument();
  });

  test('collapses long project summaries in the workspace header', () => {
    const longSummary =
      '这个项目用于验证摄像头 RTSP 接入、YOLO 行人检测、网页标注框展示、误检率统计、测试证据归档和运维交接要求，完整说明会比较长，默认不应该把项目首屏撑高。';
    const project = {
      id: 'summary-demo',
      name: '长概要演示项目',
      summary: longSummary,
      health: 'on-track',
      currentStageId: 'pm-requirements',
      currentOwner: '项目经理',
      stageProgress: 1,
      totalStages: 1,
      stages: [
        {
          id: 'pm-requirements',
          name: 'PM requirements',
          owner: '项目经理',
          status: 'active',
          description: '逐轮澄清需求。',
          checklist: ['确认目标用户'],
        },
      ],
    };

    render(
      <ProjectWorkspace
        activeTab="overview"
        onStageChange={vi.fn()}
        onTabChange={vi.fn()}
        project={project}
        selectedStageId="pm-requirements"
      >
        <div />
      </ProjectWorkspace>,
    );

    const summaryDetails = screen.getByLabelText('项目概要');
    expect(summaryDetails.tagName).toBe('DETAILS');
    expect(summaryDetails).not.toHaveAttribute('open');
    expect(within(summaryDetails).getByText('项目概要')).toBeVisible();
    expect(within(summaryDetails).getByText('这个项目用于验证摄像头 RTSP 接入、YOLO 行人检测、网页标注框展示...')).toBeVisible();
    expect(within(summaryDetails).getByText(longSummary)).not.toBeVisible();
    fireEvent.click(within(summaryDetails).getByText('项目概要'));
    expect(summaryDetails).toHaveAttribute('open');
    expect(within(summaryDetails).getByText(longSummary)).toBeVisible();
  });
});

function createPipelineWorkflowStages(activeStageId) {
  return [
    ['intake', '项目入口', '负责人'],
    ['pm-requirements', '项目经理需求', '项目经理'],
    ['prd-approval', '需求文档审批', '负责人'],
    ['architecture', '架构与数据设计', '技术负责人'],
    ['ops-requirements', '运维需求', '运维'],
    ['development', '自动开发', 'AI 开发'],
    ['review', '代码、安全、性能审查', '技术负责人'],
    ['qa', '测试', '测试'],
    ['defect-loop', '缺陷回归', 'AI 开发 / 测试'],
    ['acceptance', '最终验收', '负责人'],
  ].map(([id, name, owner], index) => ({
    id,
    name,
    owner,
    status: id === activeStageId ? 'active' : index < 3 ? 'approved' : 'queued',
    description: `${name}阶段说明`,
    checklist: [`${name}检查项`],
  }));
}
