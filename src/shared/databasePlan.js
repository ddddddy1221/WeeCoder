export const DATABASE_TABLES = Object.freeze([
  table('organizations', '组织、套餐、租户状态', [
    column('id', 'text', { primaryKey: true }),
    column('name', 'text'),
    column('plan', 'text'),
    column('status', 'text'),
    column('environment', 'text'),
    column('created_at', 'timestamp'),
    column('updated_at', 'timestamp'),
  ]),
  table('users', '账号基础资料与停用状态', [
    column('id', 'text', { primaryKey: true }),
    column('name', 'text'),
    column('role', 'text'),
    column('actor', 'text'),
    column('status', 'text'),
    column('created_at', 'timestamp'),
    column('updated_at', 'timestamp'),
  ]),
  table('memberships', '组织成员、角色和权限', [
    column('organization_id', 'text'),
    column('user_id', 'text'),
    column('role', 'text'),
    column('created_at', 'timestamp'),
    column('updated_at', 'timestamp'),
  ]),
  table('projects', '项目主数据、阶段状态和租户归属', [
    column('id', 'text', { primaryKey: true }),
    column('organization_id', 'text'),
    column('name', 'text'),
    column('sponsor', 'text'),
    column('summary', 'text'),
    column('current_stage_id', 'text'),
    column('health', 'text'),
    column('prd_status', 'text'),
    column('created_at', 'timestamp'),
    column('updated_at', 'timestamp'),
  ]),
  table('project_stage_confirmations', '阶段确认项、缺口和确认记录', [
    column('id', 'text', { primaryKey: true }),
    column('project_id', 'text'),
    column('stage_id', 'text'),
    column('item_id', 'text'),
    column('status', 'text'),
    column('value', 'text'),
    column('confirmed_by', 'text'),
    column('confirmed_at', 'timestamp'),
  ]),
  table('workflow_events', '需求、审批、开发、测试、验收流转事件', [
    column('id', 'text', { primaryKey: true }),
    column('organization_id', 'text'),
    column('project_id', 'text'),
    column('type', 'text'),
    column('actor', 'text'),
    column('note', 'text'),
    column('created_at', 'timestamp'),
  ]),
  table('agent_jobs', 'AI coding、Review、QA 后台任务', [
    column('id', 'text', { primaryKey: true }),
    column('organization_id', 'text'),
    column('project_id', 'text'),
    column('type', 'text'),
    column('status', 'text'),
    column('executor', 'text'),
    column('command', 'text'),
    column('queued_at', 'timestamp'),
  ]),
  table('agent_job_runs', 'Agent job run attempts, worker leases, and execution evidence', [
    column('id', 'text', { primaryKey: true }),
    column('organization_id', 'text'),
    column('project_id', 'text'),
    column('job_id', 'text'),
    column('run_number', 'integer'),
    column('worker_id', 'text'),
    column('status', 'text'),
    column('lease_started_at', 'timestamp'),
    column('lease_heartbeat_at', 'timestamp'),
    column('lease_expires_at', 'timestamp'),
    column('started_at', 'timestamp'),
    column('finished_at', 'timestamp'),
    column('duration_ms', 'integer'),
    column('exit_code', 'integer'),
  ]),
  table('agent_job_events', 'Immutable agent job lifecycle events for audit replay', [
    column('id', 'text', { primaryKey: true }),
    column('organization_id', 'text'),
    column('project_id', 'text'),
    column('job_id', 'text'),
    column('type', 'text'),
    column('actor_user_id', 'text'),
    column('worker_id', 'text'),
    column('payload_json', 'jsonb'),
    column('created_at', 'timestamp'),
  ]),
  table('audit_logs', '用户操作、系统动作和安全审计', [
    column('id', 'text', { primaryKey: true }),
    column('organization_id', 'text'),
    column('project_id', 'text'),
    column('actor_user_id', 'text'),
    column('type', 'text'),
    column('note', 'text'),
    column('created_at', 'timestamp'),
  ]),
  table('deployment_environments', '环境、服务、版本、回滚记录', [
    column('id', 'text', { primaryKey: true }),
    column('organization_id', 'text'),
    column('name', 'text'),
    column('status', 'text'),
    column('version', 'text'),
    column('updated_at', 'timestamp'),
  ]),
  table('notifications', '站内、飞书、企微、邮件通知记录', [
    column('id', 'text', { primaryKey: true }),
    column('organization_id', 'text'),
    column('project_id', 'text'),
    column('channel', 'text'),
    column('status', 'text'),
    column('payload_json', 'jsonb'),
    column('created_at', 'timestamp'),
  ]),
  table('cost_usage', 'AI 调用、执行器耗时和人工等待成本', [
    column('id', 'text', { primaryKey: true }),
    column('organization_id', 'text'),
    column('project_id', 'text'),
    column('category', 'text'),
    column('amount_cny', 'numeric'),
    column('basis', 'text'),
    column('created_at', 'timestamp'),
  ]),
]);

export function createDatabaseMigrationPlan() {
  const phases = [
    phase('schema-baseline', 'Schema baseline', 'ready', [
      'organizations',
      'users',
      'memberships',
      'projects',
    ]),
    phase('workflow-extraction', 'Workflow state extraction', 'ready', [
      'project_stage_confirmations',
      'workflow_events',
      'audit_logs',
    ]),
    phase('agent-operations', 'Agent jobs and runner evidence', 'planned', [
      'agent_jobs',
      'agent_job_runs',
      'agent_job_events',
      'deployment_environments',
      'cost_usage',
    ]),
    phase('cutover', 'Cutover and rollback controls', 'blocked', [
      'notifications',
      'audit_logs',
    ]),
  ];

  return {
    id: 'json-to-postgresql-v1',
    sourceMode: 'json-store',
    targetEngine: 'postgresql',
    status: 'schema-ready',
    phaseCount: phases.length,
    readyPhaseCount: phases.filter((item) => item.status === 'ready').length,
    phases,
    entityMappings: [
      mapping('project.organizationId', 'projects', ['organization_id'], 'mapped'),
      mapping('project.members', 'memberships', ['project_id', 'user_id', 'role'], 'needs-extraction'),
      mapping('project.stageConfirmations', 'project_stage_confirmations', ['project_id', 'stage_id', 'item_id'], 'needs-extraction'),
      mapping('project.history[]', 'workflow_events', ['project_id', 'type', 'actor', 'created_at'], 'mapped'),
      mapping('project.platformJobs[]', 'agent_jobs', ['project_id', 'type', 'status', 'queued_at'], 'needs-extraction'),
      mapping(
        'project.platformJobs[].runCount + lease fields',
        'agent_job_runs',
        ['job_id', 'run_number', 'worker_id', 'lease_expires_at'],
        'needs-extraction',
      ),
      mapping(
        'project.history[platform-job-*]',
        'agent_job_events',
        ['job_id', 'type', 'actor_user_id', 'created_at'],
        'needs-filtered-extraction',
      ),
      mapping('project.repositoryConfig', 'projects', ['repository_config_json'], 'planned-jsonb'),
    ],
    requiredIndexes: [
      index('projects', ['organization_id', 'current_stage_id'], 'Tenant-scoped project list and stage filtering.'),
      index('agent_jobs', ['organization_id', 'status'], 'Queue dashboard and retry filtering.'),
      index('agent_job_runs', ['job_id', 'run_number'], 'Worker lease and attempt history per platform job.'),
      index('agent_job_events', ['job_id', 'created_at'], 'Replay platform job lifecycle events.'),
      index('audit_logs', ['organization_id', 'created_at'], 'Tenant audit timeline.'),
      index('workflow_events', ['project_id', 'created_at'], 'Project history playback.'),
    ],
    cutoverChecks: [
      check('backup-json-store', 'Back up data/projects.json before first migration.', true),
      check('seed-organizations', 'Seed organizations, users, and memberships before projects.', true),
      check('tenant-count-reconciliation', 'Compare JSON project counts with database project counts per organization.', true),
      check('rollback-json-store', 'Keep JSON store read fallback until migrated records are verified.', true),
    ],
  };
}

function table(name, description, columns) {
  return Object.freeze({ name, description, columns: Object.freeze(columns) });
}

function column(name, type, options = {}) {
  return Object.freeze({ name, type, ...options });
}

function phase(id, title, status, targetTables) {
  return Object.freeze({ id, title, status, targetTables: Object.freeze(targetTables) });
}

function mapping(source, targetTable, targetColumns, status) {
  return Object.freeze({
    source,
    targetTable,
    targetColumns: Object.freeze(targetColumns),
    status,
  });
}

function index(tableName, columns, reason) {
  return Object.freeze({
    table: tableName,
    columns: Object.freeze(columns),
    reason,
  });
}

function check(id, title, required) {
  return Object.freeze({ id, title, required });
}
