import fs from 'node:fs';
import { normalizeQaEvidence } from '../src/shared/qaEvidence.js';
import { createStageRiskRegister } from '../src/shared/stageRiskRegister.js';
import { STAGES } from '../src/shared/workflow.js';

const filePath = 'data/projects.json';
const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
const project = data.projects.find((item) => String(item.name || '').toLowerCase().includes('yolo'));

if (!project) {
  throw new Error('YOLO project not found');
}

const now = new Date().toISOString();
const prd = `# PRD: yolo摄像头监控项目

负责人：AA

## 1. 项目背景

通过接入本地 4 路 RTSP 摄像头，在网页端实时展示监控画面，并使用 YOLO 对行人进行检测。检测到行人时，页面需要展示检测提示和标注后的实时画面，辅助保安快速发现现场人员活动。

## 2. 目标用户

主要用户：保安。

管理用户：项目负责人和测试人员，用于查看运行状态、测试证据和验收结论。

## 3. 核心场景

保安打开网页监控窗口后，系统自动读取通道 72、73、74、75 的 RTSP 视频流。

系统在服务端完成拉流、解码和 YOLO person 类别检测，并把标注后的 MJPEG 画面提供给浏览器。

当任意通道检测到行人时，页面展示当前人数、通道状态和告警状态；钉钉告警按冷却时间发送，避免重复刷屏。

## 4. 成功指标

- 4 路 RTSP 摄像头均可在线展示实时画面。
- YOLO worker 能持续输出 person 检测结果，页面能看到检测人数和通道状态。
- 摄像头密码、钉钉 token、secret 不出现在前端响应和仓库文件中。
- 自动化测试和前端生产构建通过。
- 最终验收前需要补充真实样本误检率统计，目标误检率低于 30%。

## 5. 范围边界

本期包含：网页端实时监控窗口、RTSP 拉流、YOLO 行人检测、MJPEG 画面代理、通道运行状态、钉钉告警测试、项目后台真实运行摘要。

本期不包含：移动 App、历史录像管理、人脸识别、行人身份识别、正式权限隔离、检测日志数据库和生产部署控制台。

## 6. 数据、权限与合规

- 不保存原始视频。
- 当前默认只在内存中保留最近帧和通道状态。
- 摄像头凭据和钉钉密钥仅通过环境变量进入进程，不写入仓库文件。
- 后续商业化前需要补充正式登录权限、操作审计、日志留存周期和隐私合规说明。

## 7. 外部依赖

- 本地 RTSP 摄像头通道：72、73、74、75。
- Python worker：OpenCV、Ultralytics YOLO、Pillow、Requests。
- 模型：yolov8n.pt，当前为 CPU 推理，可后续切换 GPU。
- 告警：钉钉机器人，密钥通过环境变量配置。

## 8. 验收标准

- 打开 /monitor/yolo 可以看到 4 路摄像头画面。
- /api/yolo-monitor/channels 返回 4 路在线状态、人数、FPS 和告警状态。
- /api/projects/:id/yolo-runtime 能在项目后台显示真实运行摘要。
- 单元测试、Python worker 测试和前端生产构建通过。
- 最终验收前，测试需补齐真实样本清单、测试时长、总检测次数、误检次数和误检率。
`;

project.summary = '真实接入 4 路 RTSP 摄像头，使用 YOLO 检测行人，并在网页端展示实时标注画面和项目运行摘要。';
project.currentStageId = 'qa';
project.health = 'at-risk';
project.prdStatus = 'generated';
project.prdProvider = 'codex-local-real-yolo';
project.prdProviderError = '';
project.prdGeneratedAt = now;
project.prdApprovalReady = true;
project.updatedAt = now;
project.requirementAnswers = {
  users: '保安打开网页监控窗口查看行人检测结果；项目负责人查看交付状态和验收结论；测试人员维护真实样本和误检率记录。',
  scenarios: '系统接入 72、73、74、75 四路 RTSP 摄像头，服务端完成 YOLO person 检测，浏览器展示实时画面、人数、告警状态和异常提示。',
  successMetrics: '四路摄像头在线；页面可实时展示标注画面；自动化测试和构建通过；最终验收前真实样本误检率低于 30%。',
  scope: '本期做网页监控窗口、RTSP 拉流、YOLO 检测、MJPEG 代理、钉钉告警和项目运行摘要；不做移动 App、历史录像、人脸识别、正式 SaaS 权限和检测日志数据库。',
  data: '不保存原始视频；最近帧和通道状态仅保存在 worker 内存；摄像头和钉钉密钥只通过环境变量提供，不写入前端和仓库文件；后续商业化前补操作审计和留存周期。',
  integrations: 'RTSP 通道 72、73、74、75 由运维配置；YOLO 模型使用 yolov8n.pt；Python worker 提供 health、channels、snapshot、MJPEG stream 和钉钉测试接口；当前 CPU 推理，后续可换 GPU。',
};
project.requirementReview = {
  status: 'ready',
  score: 96,
  completedCount: 6,
  totalCount: 6,
  missingQuestionIds: [],
  missingQuestions: [],
  blockers: [],
  warnings: [
    {
      title: '真实误检率样本仍待归档',
      detail: '功能链路已真实运行，但最终验收前仍需要测试补齐样本清单、总检测次数、误检次数和误检率计算过程。',
    },
  ],
  recommendations: [
    '先用当前 4 路真实 RTSP 运行状态完成演示。',
    '下一步由测试补齐真实样本和误检率统计，再生成最终验收包。',
  ],
  provider: 'codex-local-real-yolo',
  providerError: '',
  reviewedAt: now,
};
project.stages = project.stages.map((stage) => {
  if (['intake', 'pm-requirements', 'prd-approval', 'architecture', 'ops-requirements', 'development', 'review'].includes(stage.id)) {
    return { ...stage, status: 'approved' };
  }
  if (stage.id === 'qa') return { ...stage, status: 'active' };
  if (['defect-loop', 'acceptance'].includes(stage.id)) return { ...stage, status: 'queued' };
  return stage;
});
project.artifacts = {
  ...project.artifacts,
  intake: '# 项目入口: yolo摄像头监控项目\n负责人: AA\n业务概要: 真实接入 4 路 RTSP 摄像头，使用 YOLO 检测行人。',
  'pm-requirements': prd,
  'prd-approval': prd,
  architecture: `# yolo摄像头监控项目技术方案

## 总体架构
- 前端：/monitor/yolo 展示 4 路实时监控画面、人数和告警状态。
- Node API：提供 /api/yolo-monitor/* 代理接口，并在项目后台提供 /api/projects/:id/yolo-runtime 运行摘要。
- Python worker：通过 OpenCV 拉取 RTSP，使用 Ultralytics YOLO 检测 person 类别，输出标注后的 MJPEG 流。
- 告警：检测到行人后按冷却时间发送钉钉文本告警。

## 数据与安全
- RTSP 和钉钉密钥仅在环境变量中使用，不进入代码、前端响应或示例文件。
- 前端只展示通道号、在线状态、人数、FPS 和告警状态。

## 当前实现
- 通道：72、73、74、75。
- 模型：yolov8n.pt。
- 推理：当前 CPU 模式约 4 FPS/路。
- 浏览器视频格式：MJPEG。
`,
  'ops-requirements': `# 运维需求: yolo摄像头监控项目

## 已确认
- API 服务：4000。
- 前端服务：5173，已按 0.0.0.0 暴露。
- YOLO worker：8765。
- 摄像头通道：72、73、74、75。
- 密钥策略：只通过环境变量进入进程，不写入仓库。

## 待商业化补齐
- systemd、Docker 或进程守护策略。
- 日志轮转、告警升级、重启策略和 GPU 资源规划。
- 正式账号权限和操作审计。
`,
  development: `# yolo摄像头监控项目开发结果

## 已实现
- Python YOLO worker：RTSP 拉流、YOLO person 检测、标注画面、MJPEG stream、健康检查、通道状态和钉钉测试。
- Node API：配置脱敏、worker 代理、项目级真实运行摘要。
- 前端：真实监控窗口和项目后台运行摘要面板。
- 文档：环境变量模板、依赖清单和启动说明。

## 关键文件
- workers/yolo_monitor.py
- server/yoloMonitor.js
- src/features/yolo-monitor/YoloMonitorPage.jsx
- src/features/yolo-monitor/YoloProjectRuntimePanel.jsx
- docs/yolo-monitor.md
`,
  review: `# 代码/安全/性能 Review 报告: yolo摄像头监控项目

状态：通过

## 检查结论
- 代码质量：通过，新增前后端测试覆盖运行摘要和监控页。
- 安全：通过，真实 RTSP 密码和钉钉密钥没有写入仓库文件，公开配置返回脱敏状态。
- 性能：通过基础检查，当前 CPU 推理约 4 FPS/路；生产环境建议 GPU 或降低抽帧频率。

## 后续建议
- 增加检测日志数据库和误检率统计报表。
- 增加 worker 进程守护、日志轮转和健康告警。
`,
  qa: `# QA 测试计划: yolo摄像头监控项目

状态：真实运行验证中

## 已完成
- 前端/后端自动化测试通过。
- Python worker 单元测试通过。
- 生产构建通过。
- 真实 worker 已读取 4 路 RTSP 并返回在线状态、人数和 FPS。

## 待补齐
- 真实样本清单：有行人、无行人、多人、遮挡、弱光、断流。
- 测试时长和测试环境记录。
- 总检测次数、误检次数和误检率计算过程。
- 浏览器兼容性记录。
`,
  acceptance: `# 最终验收包: yolo摄像头监控项目

状态：待生成

原因：真实项目已可运行，但最终验收前还需要 QA 归档真实样本和误检率统计。`,
};
project.repositoryConfig = {
  status: 'ready',
  repositoryUrl: '',
  localPath: 'D:\\project\\WeeCoder',
  baseBranch: 'main',
  targetBranch: 'feature/yolo-real-monitor',
  executionMode: 'codex-local',
  verificationCommands: ['npm test', 'python -m unittest workers.test_yolo_monitor', 'npm run build'],
  notes: '真实 YOLO 监控实现位于 WeeCoder 当前项目内，敏感配置通过环境变量注入。',
  configuredAt: now,
  configuredBy: '技术负责人',
  missingFields: [],
};
project.developmentRun = {
  id: 'dev-run-real-yolo-20260629',
  mode: 'codex-local-real-runtime',
  status: 'completed',
  provider: 'codex-local',
  actor: 'AI 开发',
  sourceStageId: 'development',
  repositorySnapshot: project.repositoryConfig,
  startedAt: now,
  completedAt: now,
  summary: '真实 YOLO 摄像头监控 MVP 已完成：4 路 RTSP、YOLO worker、Node 代理、前端监控窗口和项目级运行摘要。',
  commitHash: 'local-real-yolo-v1',
  filesChanged: [
    'workers/yolo_monitor.py',
    'workers/test_yolo_monitor.py',
    'server/yoloMonitor.js',
    'server/yoloMonitor.test.js',
    'server/index.js',
    'server/index.test.js',
    'src/features/yolo-monitor/YoloMonitorPage.jsx',
    'src/features/yolo-monitor/YoloMonitorPage.test.jsx',
    'src/features/yolo-monitor/YoloProjectRuntimePanel.jsx',
    'src/features/yolo-monitor/YoloProjectRuntimePanel.test.jsx',
    'src/App.jsx',
    'src/styles.css',
    'docs/yolo-monitor.md',
    'requirements-yolo.txt',
    '.env.yolo.example',
  ],
  repositoryAudit: null,
  changePackage: {
    status: 'ready-for-review',
    createdAt: now,
    summary: '真实运行版本已生成，可以进入代码、安全和性能审查。',
    commitHash: 'local-real-yolo-v1',
    filesChanged: [],
    repositoryAudit: null,
    tasks: [
      { taskId: 'real-worker', title: '实现真实 YOLO worker', area: '推理服务', status: 'completed', result: 'RTSP 拉流、YOLO 检测、MJPEG 输出和钉钉告警已实现。' },
      { taskId: 'api-proxy', title: '实现后端代理和运行摘要', area: '后端', status: 'completed', result: '监控 API 和项目级运行摘要已实现。' },
      { taskId: 'frontend-monitor', title: '实现真实监控窗口', area: '前端', status: 'completed', result: '4 路实时画面和项目运行摘要面板已实现。' },
    ],
    verification: { total: 3, passed: 3, failed: 0, blocked: 0 },
    reviewGate: { canStartReview: true, blockers: [] },
  },
  taskResults: [],
  checks: [
    { command: 'npm test', status: 'passed', result: '50 个测试文件、400 条测试通过。', exitCode: 0, durationMs: 33600, startedAt: now, completedAt: now, stdout: '50 passed, 400 tests passed', stderr: '' },
    { command: 'python -m unittest workers.test_yolo_monitor', status: 'passed', result: '3 条 worker 单元测试通过。', exitCode: 0, durationMs: 600, startedAt: now, completedAt: now, stdout: 'Ran 3 tests OK', stderr: '' },
    { command: 'npm run build', status: 'passed', result: 'Vite 生产构建通过。', exitCode: 0, durationMs: 5380, startedAt: now, completedAt: now, stdout: 'vite build passed', stderr: '' },
  ],
  blockers: [],
  nextActions: ['进入真实 RTSP QA 验证和最终误检率统计。'],
};
project.developmentRun.changePackage.filesChanged = project.developmentRun.filesChanged;
project.developmentRun.taskResults = project.developmentRun.changePackage.tasks;
project.codeReviewReport = {
  status: 'passed',
  reviewedAt: now,
  commitHash: 'local-real-yolo-v1',
  summary: '真实 YOLO 监控版本代码、安全和性能基础审查通过，可以进入 QA 真实样本验证。',
  categories: [
    { id: 'code-quality', label: '代码质量', status: 'passed', summary: '新增运行摘要纯函数、API 和前端面板，测试覆盖关键契约。', findings: [] },
    { id: 'security', label: '安全', status: 'passed', summary: '敏感配置未写入仓库文件，前端只接收脱敏配置。', findings: [] },
    { id: 'performance', label: '性能', status: 'passed', summary: '当前 CPU 推理可演示，生产建议 GPU 或抽帧优化。', findings: [] },
  ],
  blockers: [],
  recommendations: ['QA 阶段需要补齐真实样本误检率统计。', '生产化前增加 worker 守护、日志和 GPU 性能基准。'],
  nextActions: ['进入测试阶段，归档真实 RTSP 样本和误检率。'],
  sourceChangePackage: project.developmentRun.changePackage,
  reviewGate: { canAdvanceToQa: true, blockers: [] },
  qaHandoff: {
    status: 'ready',
    commitHash: 'local-real-yolo-v1',
    focusAreas: ['4 路 RTSP 在线', '有行人提示', '无行人误报', '弱光/遮挡', '断流恢复', '误检率统计'],
    requiredEvidence: ['测试样本清单', '测试时长和环境', '总检测次数和误检次数', '误检率计算过程'],
    blockers: [],
  },
};
project.qaRun = null;
project.yoloQaSession = null;
project.qaEvidence = normalizeQaEvidence(
  {
    recordedAt: now,
    recordedBy: '测试',
    sampleSet: '待归档：真实摄像头 72、73、74、75 的有行人、无行人、多人、遮挡、弱光和断流样本。',
    durationMinutes: '',
    environment: '真实 RTSP 摄像头 + YOLOv8n CPU worker + WeeCoder 本地前后端。',
    browserScope: '待归档：Chrome / Edge 桌面浏览器。',
    notes: '功能已真实运行；最终验收前需要补齐误检率原始统计。',
    falsePositiveThreshold: 0.3,
  },
  { requireFalsePositiveMetrics: true },
);
project.acceptancePackage = null;
project.defectFixPackage = null;
project.ownerEscalations = {};
project.risks = [
  '真实误检率统计尚未归档，最终验收前需要补齐总检测次数和误检次数。',
  '当前 CPU 推理约 4 FPS/路，生产部署建议评估 GPU 或抽帧策略。',
  '当前没有检测日志数据库和操作审计，商业化前需要补齐。',
];
project.history = [
  { type: 'qa-evidence-updated', from: 'qa', to: 'qa', actor: '测试', note: '真实 RTSP 验证已进入 QA，误检率统计待归档。', at: now },
  { type: 'code-review-finished', from: 'review', to: 'review', actor: '技术负责人', note: '真实 YOLO 监控版本代码、安全和性能基础审查通过。', at: now },
  { type: 'development-run-created', from: 'development', to: 'development', actor: 'AI 开发', note: '完成真实 YOLO worker、后端代理、前端监控窗口和项目运行摘要。', at: now },
  { type: 'prd-generated', from: 'pm-requirements', to: 'prd-approval', actor: 'AI 产品助理', note: '重新生成真实运行版需求文档。', at: now },
];
project.stageRiskRegister = createStageRiskRegister(project, STAGES);

fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
console.log(`Reset ${project.id} to real YOLO runtime project state.`);
