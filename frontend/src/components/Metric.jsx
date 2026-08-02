/**
 * Highlight quantitative values (人数 / 工时 / 天数) against body copy.
 */
export default function Metric({
  value,
  unit = null,
  chip = false,
  className = '',
  title,
}) {
  const classes = ['metric', chip ? 'metric--chip' : '', className].filter(Boolean).join(' ')
  return (
    <span className={classes} title={title}>
      <span className="metric__value">{value}</span>
      {unit != null && unit !== '' ? <span className="metric__unit">{unit}</span> : null}
    </span>
  )
}
