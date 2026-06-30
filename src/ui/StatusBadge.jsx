const STATUS_LABELS = {
  active: '进行中',
  approved: '已完成',
  blocked: '已阻塞',
  failed: '失败',
  queued: '排队中',
  warning: '需关注',
};

export function StatusBadge({ label, status = 'queued' }) {
  return (
    <span className={`console-status ${status}`}>
      {label || STATUS_LABELS[status] || status}
    </span>
  );
}
