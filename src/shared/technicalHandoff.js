import { STAGE_IDS } from './workflow.js';

export function createTechnicalHandoffBundle(project) {
  const prd = getPrd(project);
  const isYolo = /yolo|rtsp|摄像头|行人|标注框/i.test(prd);
  const context = {
    projectName: project.name,
    sponsor: project.sponsor,
    prd,
    isYolo,
  };

  return {
    architectureArtifact: createArchitectureArtifact(context),
    developmentArtifact: createDevelopmentArtifact(context),
    opsArtifact: createOpsArtifact(context),
    qaArtifact: createQaArtifact(context),
  };
}

export function normalizeTechnicalHandoffBundle(bundle, project) {
  const fallback = createTechnicalHandoffBundle(project);
  return {
    architectureArtifact: cleanArtifact(bundle?.architectureArtifact) || fallback.architectureArtifact,
    developmentArtifact: cleanArtifact(bundle?.developmentArtifact) || fallback.developmentArtifact,
    opsArtifact: cleanArtifact(bundle?.opsArtifact) || fallback.opsArtifact,
    qaArtifact: cleanArtifact(bundle?.qaArtifact) || fallback.qaArtifact,
  };
}

function getPrd(project) {
  return (
    project.artifacts?.[STAGE_IDS.PRD_APPROVAL] ||
    project.artifacts?.[STAGE_IDS.PM_REQUIREMENTS] ||
    project.summary ||
    ''
  );
}

function createArchitectureArtifact({ projectName, prd, isYolo }) {
  if (!isYolo) {
    return [
      `# 技术方案: ${projectName}`,
      '',
      '## 模块边界',
      '- Web 前端',
      '- API 服务',
      '- 数据存储',
      '- 日志与审计',
      '',
      '## 待确认',
      '- 请技术负责人基于 PRD 补充具体接口、数据表和部署形态。',
    ].join('\n');
  }

  return [
    `# 技术方案: ${projectName}`,
    '',
    '## 1. 总体架构',
    '- Web 监控台：展示实时视频、行人标注框、检测状态和异常提示。',
    '- RTSP 接入服务：负责连接本地摄像头 RTSP 数据流、断线重连和帧抽取。',
    '- YOLO 推理服务：接收视频帧，返回 person 类别检测框、置信度和时间戳。',
    '- 检测结果 API：向前端提供当前帧标注框、是否有人和服务健康状态。',
    '- 测试记录模块：记录测试样本、总检测次数、误检次数和误检率。',
    '',
    '## 2. 数据流',
    '1. 浏览器打开监控页面。',
    '2. 后端连接 RTSP 摄像头并持续读取视频帧。',
    '3. 抽帧后调用 YOLO 推理服务，只保留 person 检测结果。',
    '4. 后端把视频流和检测框同步给前端。',
    '5. 前端在视频画面上绘制标注框，并在检测到行人时显示明确提示。',
    '',
    '## 3. API 草案',
    '- `GET /api/camera/status`：返回 RTSP 连接、推理服务和最近检测时间。',
    '- `GET /api/camera/stream`：返回浏览器可播放的视频流或帧流。',
    '- `GET /api/detections/latest`：返回最新检测框数组、是否有人、时间戳。',
    '- `POST /api/test-runs`：登记测试样本、总检测次数、误检次数和误检率。',
    '',
    '## 4. 检测框格式',
    '```json',
    '{ "label": "person", "confidence": 0.87, "box": { "x": 120, "y": 80, "width": 64, "height": 180 }, "timestamp": "2026-06-16T12:00:00.000Z" }',
    '```',
    '',
    '## 5. 异常处理',
    '- RTSP 断流：页面显示“摄像头连接中断”，后端按固定间隔重连。',
    '- 模型服务异常：页面显示“检测服务异常”，视频展示不中断时保留视频画面。',
    '- 无检测结果：前端清空旧标注框，避免持续展示行人提示。',
  ].join('\n');
}

function createDevelopmentArtifact({ projectName, isYolo }) {
  if (!isYolo) {
    return [
      `# 开发任务: ${projectName}`,
      '',
      '- 拆分前端、后端、数据和测试任务。',
      '- 每个任务需要包含验收标准和自测命令。',
    ].join('\n');
  }

  return [
    `# 开发任务: ${projectName}`,
    '',
    '## 前端',
    '- 实现监控页面布局：视频区域、状态栏、行人提示、错误提示。',
    '- 在视频画面上绘制 YOLO 标注框，支持多行人。',
    '- 无行人时及时清空提示和旧检测框。',
    '',
    '## 后端',
    '- 实现 RTSP 配置读取、连接、断线重连和健康状态。',
    '- 实现视频帧抽取和推理服务调用。',
    '- 实现最新检测结果 API 和测试记录 API。',
    '',
    '## 推理服务',
    '- 选定 YOLO 模型版本和 person 类别过滤策略。',
    '- 定义输入帧格式、输出检测框格式、置信度阈值。',
    '- 输出模型服务健康检查接口。',
    '',
    '## 自测',
    '- 使用有行人、无行人、多人、遮挡、弱光样本验证前端提示和标注框。',
    '- 统计误检次数并计算误检率。',
  ].join('\n');
}

function createOpsArtifact({ projectName, isYolo }) {
  if (!isYolo) {
    return [
      `# 运维需求: ${projectName}`,
      '',
      '- 明确服务器规格、环境变量、日志、监控和回滚策略。',
    ].join('\n');
  }

  return [
    `# 运维需求: ${projectName}`,
    '',
    '## 资源与环境',
    '- 提供可访问摄像头的服务器或本地计算环境。',
    '- 明确 YOLO 推理使用 CPU 还是 GPU；如使用 GPU，需确认显卡型号、驱动和运行时。',
    '- 提供 Node/Python/推理框架版本锁定方案。',
    '',
    '## 配置项',
    '- 摄像头 RTSP 地址。',
    '- 摄像头账号、密码和网络访问权限。',
    '- YOLO 模型文件路径或模型服务地址。',
    '- 检测置信度阈值、抽帧频率、重连间隔。',
    '',
    '## 日志与监控',
    '- 记录 RTSP 连接状态、重连次数、推理耗时、检测次数和异常。',
    '- 页面需要展示摄像头断流、网络异常、模型服务异常。',
    '- 运维需提供启动、停止、重启和日志查看命令。',
    '',
    '## 安全与数据',
    '- RTSP 凭据不得写入前端代码。',
    '- 明确是否保存视频、截图或检测日志，以及数据留存周期。',
  ].join('\n');
}

function createQaArtifact({ projectName, isYolo }) {
  if (!isYolo) {
    return [
      `# 测试计划: ${projectName}`,
      '',
      '- 覆盖正常路径、异常路径、权限边界和回归测试。',
    ].join('\n');
  }

  return [
    `# 测试计划: ${projectName}`,
    '',
    '## 功能用例',
    '- 保安打开网页后可以看到实时监控画面。',
    '- 有行人出现时显示标注框和明确提示。',
    '- 无行人时不持续展示行人提示。',
    '- 多人同时出现时展示多个标注框。',
    '',
    '## 场景样本',
    '- 有行人。',
    '- 无行人。',
    '- 多人。',
    '- 遮挡。',
    '- 弱光。',
    '- 摄像头断流。',
    '- 模型服务异常。',
    '',
    '## 指标统计',
    '- 记录测试时间、测试样本、总检测次数、误检次数和误检率。',
    '- 误检率 = 误检次数 / 系统识别为行人的总检测次数。',
    '- 验收要求：在项目经理确认的测试样本中，误检率低于 30%。',
  ].join('\n');
}

function cleanArtifact(value) {
  return String(value || '').trim();
}
