import api from '../api/client.js'
import { notifyHoursRuleChanged, subscribeHoursRule } from './events.js'

const DEFAULT_RULE = { tiers: [{ min_hours: '6.0', deduct_hours: '0.5' }] }
let cached = null
let loading = null

export function getHoursRule() {
  return cached || DEFAULT_RULE
}

export function subscribeHoursRuleState(listener) {
  return subscribeHoursRule(listener)
}

export async function loadHoursRule({ force = false } = {}) {
  if (!force && cached) return cached
  if (!force && loading) return loading
  loading = api
    .get('/api/settings/hours-rule')
    .then((body) => {
      cached = body && Array.isArray(body.tiers) ? body : DEFAULT_RULE
      notifyHoursRuleChanged()
      return cached
    })
    .catch(() => {
      if (!cached) cached = DEFAULT_RULE
      return cached
    })
    .finally(() => {
      loading = null
    })
  return loading
}

export function setHoursRuleLocal(body) {
  cached = body && Array.isArray(body.tiers) ? body : DEFAULT_RULE
  notifyHoursRuleChanged()
}
