const BASE_VERIFICATION_COMMANDS = ['npm test', 'npm run build', 'npm audit --omit=dev'];
const DEVELOPMENT_STAGE_ID = 'development';

export function createDevelopmentPlan(project, developmentArtifact = '') {
  const text = `${project.name || ''}\n${project.summary || ''}\n${developmentArtifact || ''}`;
  const isYolo = /yolo|rtsp|摄像头|行人|标注框|误检率/i.test(text);
  const tasks = isYolo ? createYoloTasks() : createGenericTasks();

  return {
    status: 'ready',
    sourceStageId: DEVELOPMENT_STAGE_ID,
    summary: isYolo
      ? '按 RTSP 接入、YOLO 推理、前端标注和误检率测试拆分开发任务。'
      : '按前端、后端、数据、测试拆分开发任务。',
    tasks,
    verificationCommands: [...BASE_VERIFICATION_COMMANDS],
  };
}

export function normalizeDevelopmentPlan(plan, project, developmentArtifact = '') {
  const fallback = createDevelopmentPlan(project, developmentArtifact);
  if (!plan || !Array.isArray(plan.tasks) || plan.tasks.length === 0) {
    return fallback;
  }

  return {
    ...fallback,
    ...plan,
    status: plan.status || fallback.status,
    sourceStageId: plan.sourceStageId || fallback.sourceStageId,
    summary: plan.summary || fallback.summary,
    tasks: plan.tasks.map((task, index) => normalizeTask(task, index)),
    verificationCommands: normalizeStringList(plan.verificationCommands, fallback.verificationCommands),
  };
}

function createYoloTasks() {
  return [
    {
      id: 'dev-frontend-monitor',
      area: '前端',
      title: '实现网页监控页面和标注框展示',
      description: '展示实时视频区域、行人提示、异常提示，并按检测结果绘制多行人标注框。',
      status: 'queued',
      acceptanceCriteria: [
        '保安打开页面后能看到监控画面占位或真实视频流。',
        '检测到行人时显示标注框和明确提示。',
        '无行人时不会持续保留旧提示或旧标注框。',
      ],
      verification: ['前端组件测试覆盖有行人、无行人、多人和异常状态。'],
    },
    {
      id: 'dev-backend-rtsp',
      area: '后端',
      title: '实现 RTSP 接入、重连和健康状态接口',
      description: '读取摄像头配置，连接 RTSP 数据流，提供连接状态、断流提示和重连策略。',
      status: 'queued',
      acceptanceCriteria: [
        'RTSP 地址、账号和密码只在服务端配置。',
        '断流、认证失败、网络不可达时返回明确状态。',
        '健康检查能展示摄像头连接和最近帧时间。',
      ],
      verification: ['后端单测覆盖配置缺失、认证失败和断流状态。'],
    },
    {
      id: 'dev-inference-yolo',
      area: '推理服务',
      title: '定义并接入 YOLO 行人检测服务契约',
      description: '明确模型版本、输入帧格式、person 类过滤、置信度阈值和检测框 JSON schema。',
      status: 'queued',
      acceptanceCriteria: [
        '推理结果只返回 person 类别检测框。',
        '检测框包含 x、y、width、height、confidence、className 和 timestamp。',
        '模型异常时前端能看到检测服务异常提示。',
      ],
      verification: ['使用模拟推理响应验证检测结果解析和错误处理。'],
    },
    {
      id: 'dev-detection-api',
      area: '后端',
      title: '实现检测结果 API 和前端同步策略',
      description: '向前端提供最新检测结果，处理时间戳、坐标缩放、过期结果丢弃和多人框。',
      status: 'queued',
      acceptanceCriteria: [
        '前端按视频显示尺寸正确缩放检测框。',
        '过期检测结果不会覆盖新画面。',
        '多人同时出现时展示多个框。',
      ],
      verification: ['组件测试覆盖缩放、多人和过期检测结果。'],
    },
    {
      id: 'dev-qa-metrics',
      area: '测试',
      title: '实现误检率测试记录和统计口径',
      description: '记录测试样本、总检测次数、误检次数和误检率，支撑低于 30% 的验收判断。',
      status: 'queued',
      acceptanceCriteria: [
        '测试记录包含测试时间、样本、场景、总检测次数、误检次数和误检率。',
        '误检率按 PRD 口径自动计算。',
        '测试报告能复核验收结论。',
      ],
      verification: ['单测覆盖误检率计算和边界值。'],
    },
  ];
}

function createGenericTasks() {
  return [
    {
      id: 'dev-frontend',
      area: '前端',
      title: '实现用户界面和核心交互',
      description: '按 PRD 实现主页面、状态展示、错误提示和关键操作。',
      status: 'queued',
      acceptanceCriteria: ['核心用户路径可以在浏览器中完成。'],
      verification: ['前端测试覆盖关键交互。'],
    },
    {
      id: 'dev-backend',
      area: '后端',
      title: '实现 API、数据和业务规则',
      description: '按技术方案实现接口、校验、存储和异常处理。',
      status: 'queued',
      acceptanceCriteria: ['API 返回结构稳定，错误状态明确。'],
      verification: ['后端单测覆盖正常和异常路径。'],
    },
    {
      id: 'dev-review-readiness',
      area: '工程质量',
      title: '补齐自测、构建和变更说明',
      description: '运行测试、构建和依赖审计，输出面向 Review 的变更摘要。',
      status: 'queued',
      acceptanceCriteria: ['测试、构建和依赖审计通过。'],
      verification: [...BASE_VERIFICATION_COMMANDS],
    },
  ];
}

function normalizeTask(task, index) {
  return {
    id: task.id || `dev-task-${index + 1}`,
    area: task.area || '开发',
    title: task.title || `开发任务 ${index + 1}`,
    description: task.description || '',
    status: ['queued', 'running', 'done', 'blocked'].includes(task.status) ? task.status : 'queued',
    acceptanceCriteria: normalizeStringList(task.acceptanceCriteria),
    verification: normalizeStringList(task.verification),
  };
}

function normalizeStringList(items, fallback = []) {
  const normalized = Array.isArray(items)
    ? items.map((item) => String(item || '').trim()).filter(Boolean)
    : [];
  return normalized.length ? normalized : [...fallback];
}
