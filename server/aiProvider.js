import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { evaluateRequirementQuality } from '../src/shared/deliverySkills.js';
import { normalizeTechnicalHandoffBundle } from '../src/shared/technicalHandoff.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..');

export function createCodexProvider({
  runCodex = runCodexCli,
  timeoutMs = getCodexTimeoutMs(),
} = {}) {
  const runWithTimeout = (prompt) =>
    withTimeout(
      runCodex(prompt, { timeoutMs }),
      timeoutMs,
      `Codex CLI timed out after ${Math.round(timeoutMs / 1000)}s`,
    );

  return {
    async generatePrd(project) {
      const output = await runWithTimeout(buildPrdPrompt(project));
      return {
        artifact: cleanCodexOutput(output),
        provider: 'codex-cli',
      };
    },
    async reviewRequirements(project) {
      const output = await runWithTimeout(buildRequirementReviewPrompt(project));
      return {
        review: normalizeRequirementReview(parseCodexJson(output), project),
        provider: 'codex-cli',
      };
    },
    async generateTechnicalHandoff(project) {
      const output = await runWithTimeout(buildTechnicalHandoffPrompt(project));
      return {
        bundle: normalizeTechnicalHandoffBundle(parseCodexJson(output), project),
        provider: 'codex-cli',
      };
    },
  };
}

export function createLocalRuleProvider() {
  return {
    async reviewRequirements(project) {
      return {
        review: evaluateRequirementQuality(project),
        provider: 'local-rule',
      };
    },
    async generatePrd() {
      return {
        artifact: '',
        provider: 'local-rule',
      };
    },
    async generateTechnicalHandoff(project) {
      return {
        bundle: normalizeTechnicalHandoffBundle({}, project),
        provider: 'local-rule',
      };
    },
  };
}

export function createAiProvider() {
  if (process.env.AI_PROVIDER === 'local') {
    return createLocalRuleProvider();
  }

  return createCodexProvider();
}

export function buildPrdPrompt(project) {
  const answers = project.requirementAnswers || {};
  const answerLines = (project.requirementQuestions || [])
    .map((question) => {
      const answer = answers[question.id] || '待补充';
      return `- ${question.label}: ${answer}`;
    })
    .join('\n');

  return [
    '你是一个资深项目经理，负责把需求澄清内容整理为可审批的产品需求文档。',
    '只输出 Markdown PRD，不要输出解释、寒暄、代码块或额外说明。',
    '',
    `项目名称: ${project.name}`,
    `负责人: ${project.sponsor}`,
    `业务概要: ${project.summary}`,
    '',
    '需求澄清:',
    answerLines,
    '',
    'PRD 必须包含这些章节:',
    '1. 项目背景',
    '2. 目标用户',
    '3. 核心场景',
    '4. 成功指标',
    '5. 范围边界',
    '6. 数据、权限与合规',
    '7. 外部依赖',
    '8. 验收标准',
    '9. 运维/开发/测试交接注意事项',
    '',
    '要求:',
    '- 标题格式必须是: # PRD: <项目名称>',
    '- 对缺失信息明确标注“待项目经理补充”。',
    '- 验收标准必须可验证。',
    '- 语言简洁，面向负责人审批。',
  ].join('\n');
}

export function buildRequirementReviewPrompt(project) {
  const answers = project.requirementAnswers || {};
  const answerLines = (project.requirementQuestions || [])
    .map((question) => `- ${question.id} / ${question.label}: ${answers[question.id] || '待补充'}`)
    .join('\n');

  return [
    '你是资深项目经理和交付负责人，请做一次需求质检。',
    '只输出 JSON，不要输出 Markdown、解释、代码块或额外说明。',
    '',
    `项目名称: ${project.name}`,
    `负责人: ${project.sponsor}`,
    `业务概要: ${project.summary}`,
    '',
    '需求答案:',
    answerLines,
    '',
    'JSON schema:',
    '{',
    '  "status": "ready" | "needs-work",',
    '  "score": 0-100,',
    '  "completedCount": number,',
    '  "totalCount": number,',
    '  "missingQuestionIds": ["questionId"],',
    '  "missingQuestions": [{"id": "questionId", "label": "问题名称"}],',
    '  "blockers": [{"title": "阻塞项", "detail": "为什么会阻塞"}],',
    '  "warnings": [{"title": "风险", "detail": "风险说明"}],',
    '  "recommendations": ["下一步建议"]',
    '}',
    '',
    '判断原则:',
    '- 缺少用户、场景、成功指标、范围、数据权限或外部依赖时，status 必须是 needs-work。',
    '- 指标不可验收、范围没有非目标、权限边界不清时，输出 warnings。',
    '- 只有不存在 blockers 时，status 才能是 ready。',
  ].join('\n');
}

export function buildTechnicalHandoffPrompt(project) {
  const prd =
    project.artifacts?.['prd-approval'] ||
    project.artifacts?.['pm-requirements'] ||
    project.summary ||
    '';

  return [
    '你是资深技术负责人，请基于 PRD 生成研发技术交接包。',
    '只输出 JSON，不要输出 Markdown 代码块、解释或额外说明。',
    '',
    `项目名称: ${project.name}`,
    `负责人: ${project.sponsor}`,
    '',
    'PRD:',
    prd,
    '',
    'JSON schema:',
    '{',
    '  "architectureArtifact": "Markdown 技术方案，必须包含 RTSP 接入、YOLO 推理、前端标注框、API、异常处理",',
    '  "developmentArtifact": "Markdown 开发任务，按前端、后端、推理服务和自测拆分",',
    '  "opsArtifact": "Markdown 运维需求，包含 RTSP 凭据、运行环境、日志、监控、启动停止重启",',
    '  "qaArtifact": "Markdown 测试计划，包含有行人、无行人、多人、遮挡、弱光、断流、误检率统计"',
    '}',
    '',
    '要求:',
    '- 内容必须面向开发、运维和测试交接。',
    '- 对 PRD 中待补充的信息，要在对应产物中标注“待确认”。',
    '- 不要声称已经连接真实摄像头或已经完成模型部署。',
  ].join('\n');
}

async function runCodexCli(prompt, { timeoutMs = getCodexTimeoutMs() } = {}) {
  const tempDir = await mkdtemp(join(tmpdir(), 'wee-coder-codex-'));
  const outputFile = join(tempDir, 'last-message.md');

  try {
    await new Promise((resolve, reject) => {
      const model = process.env.CODEX_MODEL || 'gpt-5.5';
      const args = [
        '--ask-for-approval',
        'never',
        'exec',
        '-m',
        model,
        '--skip-git-repo-check',
        '--sandbox',
        'read-only',
        '--cd',
        projectRoot,
        '--output-last-message',
        outputFile,
        '-',
      ];
      if (process.env.CODEX_SERVICE_TIER) {
        args.unshift('-c', `service_tier="${process.env.CODEX_SERVICE_TIER}"`);
      }
      const invocation = createCodexInvocation();
      const child = spawn(
        invocation.command,
        [...invocation.argsPrefix, ...args],
        {
          stdio: ['pipe', 'ignore', 'pipe'],
          windowsHide: true,
        },
      );

      let stderr = '';
      let settled = false;
      const timeout = timeoutMs > 0
        ? setTimeout(() => {
            if (settled) {
              return;
            }
            settled = true;
            child.kill();
            reject(new Error(`Codex CLI timed out after ${Math.round(timeoutMs / 1000)}s`));
          }, timeoutMs)
        : null;

      const finish = (callback) => {
        if (settled) {
          return;
        }
        settled = true;
        if (timeout) {
          clearTimeout(timeout);
        }
        callback();
      };

      child.stderr.on('data', (chunk) => {
        stderr += chunk.toString();
      });
      child.on('error', (error) => finish(() => reject(error)));
      child.on('exit', (code) => {
        finish(() => {
          if (code === 0) {
            resolve();
            return;
          }
          reject(new Error(stderr || `codex exec exited with code ${code}`));
        });
      });

      child.stdin.end(prompt, 'utf8');
    });

    return await readFile(outputFile, 'utf8');
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

function getCodexTimeoutMs() {
  const value = Number(process.env.CODEX_TIMEOUT_MS || 60000);
  return Number.isFinite(value) && value > 0 ? value : 60000;
}

function withTimeout(promise, timeoutMs, message) {
  if (!timeoutMs || timeoutMs <= 0) {
    return promise;
  }

  let timeout;
  const timeoutPromise = new Promise((resolve, reject) => {
    timeout = setTimeout(() => reject(new Error(message)), timeoutMs);
  });

  return Promise.race([promise, timeoutPromise]).finally(() => clearTimeout(timeout));
}

function cleanCodexOutput(output) {
  return String(output || '').trim();
}

function parseCodexJson(output) {
  const text = String(output || '').trim().replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');

  if (start === -1 || end === -1 || end < start) {
    throw new Error('Codex did not return JSON');
  }

  return JSON.parse(text.slice(start, end + 1));
}

function normalizeRequirementReview(review, project) {
  const fallback = evaluateRequirementQuality(project);
  return {
    ...fallback,
    ...review,
    missingQuestionIds: Array.isArray(review.missingQuestionIds)
      ? review.missingQuestionIds
      : fallback.missingQuestionIds,
    missingQuestions: Array.isArray(review.missingQuestions) ? review.missingQuestions : fallback.missingQuestions,
    blockers: Array.isArray(review.blockers) ? review.blockers : fallback.blockers,
    warnings: Array.isArray(review.warnings) ? review.warnings : fallback.warnings,
    recommendations: Array.isArray(review.recommendations) ? review.recommendations : fallback.recommendations,
  };
}

export function createCodexInvocation({
  platform = process.platform,
  env = process.env,
  execPath = process.execPath,
} = {}) {
  if (env.CODEX_CLI_JS) {
    return {
      command: execPath,
      argsPrefix: [env.CODEX_CLI_JS],
    };
  }

  if (env.CODEX_COMMAND) {
    return {
      command: env.CODEX_COMMAND,
      argsPrefix: [],
    };
  }

  if (platform === 'win32') {
    const npmRoot = env.APPDATA ? join(env.APPDATA, 'npm') : join(env.USERPROFILE || '', 'AppData', 'Roaming', 'npm');
    return {
      command: execPath,
      argsPrefix: [join(npmRoot, 'node_modules', '@openai', 'codex', 'bin', 'codex.js')],
    };
  }

  return {
    command: 'codex',
    argsPrefix: [],
  };
}
