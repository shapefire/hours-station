/** In-memory bus so SettingsModal / NoteField stay in sync without localStorage. */

const listeners = new Set()

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
