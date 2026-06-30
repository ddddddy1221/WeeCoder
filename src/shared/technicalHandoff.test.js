import { describe, expect, test } from 'vitest';
import {
  createTechnicalHandoffBundle,
  normalizeTechnicalHandoffBundle,
} from './technicalHandoff.js';

const yoloPrd = `# PRD: yolo摄像头监控项目

通过连接本地摄像头 RTSP 数据流，在网页端实时监控画面中识别是否有行人通过。

本期包含网页端监控界面、RTSP 摄像头接入、基于 YOLO 的行人检测、标注框和页面提示。

验收要求包含误检率低于 30%，并输出测试时间、测试样本、总检测次数、误检次数和误检率。`;

describe('technical handoff bundle', () => {
  test('generates architecture, development, ops, and QA artifacts for YOLO PRD', () => {
    const bundle = createTechnicalHandoffBundle({
      name: 'yolo摄像头监控项目',
      sponsor: 'AA',
      artifacts: {
        'prd-approval': yoloPrd,
      },
    });

    expect(bundle.architectureArtifact).toContain('RTSP');
    expect(bundle.architectureArtifact).toContain('YOLO');
    expect(bundle.architectureArtifact).toContain('标注框');
    expect(bundle.developmentArtifact).toContain('推理服务');
    expect(bundle.opsArtifact).toContain('摄像头 RTSP 地址');
    expect(bundle.qaArtifact).toContain('误检率');
    expect(bundle.qaArtifact).toContain('弱光');
  });

  test('normalizes partial provider output with local fallback sections', () => {
    const bundle = normalizeTechnicalHandoffBundle(
      {
        architectureArtifact: '# 架构方案\n自定义方案',
      },
      {
        name: 'yolo摄像头监控项目',
        sponsor: 'AA',
        artifacts: {
          'prd-approval': yoloPrd,
        },
      },
    );

    expect(bundle.architectureArtifact).toContain('自定义方案');
    expect(bundle.opsArtifact).toContain('运维需求');
    expect(bundle.qaArtifact).toContain('测试计划');
    expect(bundle.developmentArtifact).toContain('开发任务');
  });
});
