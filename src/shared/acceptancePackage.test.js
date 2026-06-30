import { describe, expect, test } from 'vitest';
import {
  createAcceptancePackage,
  normalizeAcceptancePackage,
  signOffAcceptancePackage,
} from './acceptancePackage.js';

describe('acceptance package', () => {
  test('creates a ready final acceptance package from completed delivery evidence', () => {
    const acceptancePackage = createAcceptancePackage({
      name: 'yolo摄像头监控项目',
      prdStatus: 'generated',
      technicalHandoffStatus: 'generated',
      artifacts: {
        'prd-approval': '# PRD: yolo摄像头监控项目',
        architecture: '# 技术方案',
        'ops-requirements': '# 运维需求',
        qa: '# QA 测试报告',
      },
      developmentRun: {
        status: 'completed',
        commitHash: 'c60351e',
        filesChanged: ['src/monitoringState.js'],
      },
      codeReviewReport: {
        status: 'passed',
      },
      qaEvidence: {
        status: 'ready',
        sampleSet: '10 段测试视频',
        durationMinutes: 30,
        environment: '本地 RTSP 测试流',
        browserScope: 'Chrome 126, Edge 126',
        totalDetections: 50,
        falsePositiveCount: 9,
        falsePositiveRate: 0.18,
        falsePositiveThreshold: 0.3,
        falsePositivePassed: true,
        qualityGateStatus: 'passed',
      },
      qaRun: {
        status: 'passed',
        passedCount: 6,
        totalCount: 6,
        commitHash: 'c60351e',
      },
      stageRiskRegister: {
        qa: {
          stageName: '测试',
          riskLevel: 'medium',
          potentialRisks: [{ title: '真实 RTSP 验收记录待归档', detail: '需要归档原始统计。' }],
          functionalGaps: [],
        },
        acceptance: {
          stageName: '最终验收',
          riskLevel: 'medium',
          potentialRisks: [{ title: '交付结果不可追溯', detail: '需要汇总交付结果。' }],
          functionalGaps: [{ title: '缺少最终交付包', detail: '当前没有自动生成验收报告。' }],
        },
      },
    }, { actor: '负责人' });

    expect(acceptancePackage).toMatchObject({
      status: 'ready',
      signoffStatus: 'pending',
      generatedBy: '负责人',
      qa: {
        status: 'passed',
        passedCount: 6,
        totalCount: 6,
        evidenceStatus: 'ready',
        totalDetections: 50,
        falsePositiveCount: 9,
        falsePositiveRate: 0.18,
        falsePositiveThreshold: 0.3,
        falsePositivePassed: true,
        qualityGateStatus: 'passed',
      },
      blockers: [],
    });
    expect(acceptancePackage.deliverables).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'prd', status: 'ready' }),
        expect.objectContaining({ id: 'qa-report', status: 'ready' }),
      ]),
    );
    expect(acceptancePackage.residualRisks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ title: '真实 RTSP 验收记录待归档' }),
        expect.objectContaining({ title: '负责人签收待完成' }),
      ]),
    );
    expect(acceptancePackage.residualRisks.map((risk) => risk.title)).not.toContain('缺少最终交付包');
  });

  test('normalizes missing package as not generated', () => {
    expect(normalizeAcceptancePackage(null)).toMatchObject({
      status: 'not-generated',
      signoffStatus: 'not-started',
      deliverables: [],
      blockers: ['最终验收包尚未生成。'],
    });
  });

  test('records structured signoff details on a ready acceptance package', () => {
    const readyPackage = createAcceptancePackage({
      name: 'yolo摄像头监控项目',
      prdStatus: 'generated',
      technicalHandoffStatus: 'generated',
      artifacts: {
        'prd-approval': '# PRD',
        architecture: '# 技术方案',
        'ops-requirements': '# 运维需求',
        qa: '# QA 测试报告',
      },
      developmentRun: { status: 'completed', commitHash: 'c60351e' },
      codeReviewReport: { status: 'passed' },
      qaEvidence: {
        status: 'ready',
        sampleSet: '10 段测试视频',
        durationMinutes: 30,
        environment: '本地 RTSP 测试流',
        browserScope: 'Chrome 126, Edge 126',
      },
      qaRun: { status: 'passed', passedCount: 6, totalCount: 6 },
      stageRiskRegister: {},
    });

    const signed = signOffAcceptancePackage(
      {
        ...readyPackage,
        residualRisks: [
          { title: '负责人签收待完成', detail: '待负责人签收。' },
          { title: '最终验收包尚未汇总', detail: '待汇总。' },
          { title: '真实 RTSP 验收记录待归档', detail: '保留真实运行证据。' },
        ],
      },
      {
      actor: 'AA',
      opinion: '验收通过，按当前版本归档。',
      archiveVersion: 'v2026.06-yolo-acceptance',
      signedAt: '2026-06-17T03:00:00.000Z',
      },
    );

    expect(signed).toMatchObject({
      status: 'ready',
      signoffStatus: 'signed-off',
      signedOffBy: 'AA',
      signedOffAt: '2026-06-17T03:00:00.000Z',
      signoffOpinion: '验收通过，按当前版本归档。',
      archiveVersion: 'v2026.06-yolo-acceptance',
    });
    expect(signed.nextActions).toEqual(['项目已完成最终验收，交付包已归档。']);
    expect(signed.residualRisks.map((risk) => risk.title)).toEqual(['真实 RTSP 验收记录待归档']);
  });
});
