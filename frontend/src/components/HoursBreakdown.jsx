import { useEffect, useState } from 'react'
import { computeHoursBreakdown, formatHoursNumber } from '../utils/hours.js'
import { getHoursRule, loadHoursRule, subscribeHoursRuleState } from '../settings/hoursRule.js'
import Metric from './Metric.jsx'

export default function HoursBreakdown({ startTime, endTime }) {
  const [rule, setRule] = useState(() => getHoursRule())

  useEffect(() => {
    loadHoursRule()
    return subscribeHoursRuleState(() => setRule(getHoursRule()))
  }, [])

  const result = computeHoursBreakdown(startTime, endTime, rule.tiers)

  if (!result.ok) {
    return (
      <p className="hours-breakdown hours-breakdown--invalid" role="status">
        {result.reason}
      </p>
    )
  }

  return (
    <div className="hours-breakdown" role="status" aria-live="polite">
      <span className="hours-breakdown__item">
        工时 <Metric value={formatHoursNumber(result.raw)} unit="h" chip />
      </span>
      <span className="hours-breakdown__sep" aria-hidden="true">
        ·
      </span>
      <span className="hours-breakdown__item">
        扣减 <Metric value={formatHoursNumber(result.deduct)} unit="h" chip />
      </span>
      <span className="hours-breakdown__sep" aria-hidden="true">
        ·
      </span>
      <span className="hours-breakdown__item hours-breakdown__item--effective">
        实际工时 <Metric value={formatHoursNumber(result.effective)} unit="h" chip />
      </span>
    </div>
  )
}
