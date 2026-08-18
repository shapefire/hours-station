/** In-memory bus so SettingsModal / NoteField stay in sync without localStorage. */

const listeners = new Set()
const hoursRuleListeners = new Set()
const rosterListeners = new Set()

export function subscribeNotePresets(listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function notifyNotePresetsChanged() {
  listeners.forEach((listener) => {
    try {
      listener()
    } catch {
      /* ignore subscriber errors */
    }
  })
}

export function subscribeHoursRule(listener) {
  hoursRuleListeners.add(listener)
  return () => hoursRuleListeners.delete(listener)
}

export function notifyHoursRuleChanged() {
  hoursRuleListeners.forEach((listener) => {
    try {
      listener()
    } catch {
      /* ignore */
    }
  })
}

export function subscribeRoster(listener) {
  rosterListeners.add(listener)
  return () => rosterListeners.delete(listener)
}

export function notifyRosterChanged() {
  rosterListeners.forEach((listener) => {
    try {
      listener()
    } catch {
      /* ignore */
    }
  })
}
