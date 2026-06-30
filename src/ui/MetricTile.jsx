export function MetricTile({ label, supportingText, value }) {
  return (
    <article className="console-metric">
      <span>{label}</span>
      <strong>{value}</strong>
      {supportingText ? <small>{supportingText}</small> : null}
    </article>
  );
}
