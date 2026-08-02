import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import api from '../api/client.js'
import { notifyNotePresetsChanged, subscribeNotePresets } from '../settings/events.js'

/**
 * Combobox: pick a note preset and/or free-type.
 * Non-preset values can be added to the shared server list.
 */
export default function NoteField({
  value,
  onChange,
  disabled = false,
  placeholder = '可选，选择预设或输入',
  maxLength = 500,
  id: idProp,
}) {
  const autoId = useId()
  const inputId = idProp || `${autoId}-note`
  const listId = `${autoId}-list`
  const rootRef = useRef(null)
  const [presets, setPresets] = useState([])
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const [loadError, setLoadError] = useState(null)
  const [adding, setAdding] = useState(false)

  const loadPresets = useCallback(() => {
    return api
      .get('/api/settings/note-presets')
      .then((rows) => {
        setPresets(Array.isArray(rows) ? rows : [])
        setLoadError(null)
      })
      .catch(() => {
        setPresets([])
        setLoadError('预设加载失败')
      })
  }, [])

  useEffect(() => {
    let cancelled = false
    loadPresets().finally(() => {
      if (cancelled) return
    })
    return () => {
      cancelled = true
    }
  }, [loadPresets])

  useEffect(() => subscribeNotePresets(() => {
    loadPresets()
  }), [loadPresets])

  useEffect(() => {
    function onDocPointerDown(event) {
      if (!rootRef.current?.contains(event.target)) {
        setOpen(false)
        setActiveIndex(-1)
      }
    }
    document.addEventListener('pointerdown', onDocPointerDown)
    return () => document.removeEventListener('pointerdown', onDocPointerDown)
  }, [])

  const filtered = useMemo(() => {
    const q = value.trim().toLowerCase()
    if (!q) return presets
    return presets.filter((item) => item.text.toLowerCase().includes(q))
  }, [presets, value])

  const trimmed = value.trim()
  const exactMatch = presets.some((item) => item.text === trimmed)
  const canAddPreset = Boolean(trimmed) && !exactMatch

  function selectText(text) {
    onChange?.(text)
    setOpen(false)
    setActiveIndex(-1)
  }

  async function addAsPreset() {
    if (!canAddPreset || adding || disabled) return
    setAdding(true)
    try {
      await api.post('/api/settings/note-presets', { text: trimmed })
      notifyNotePresetsChanged()
      await loadPresets()
    } catch (err) {
      window.alert(err.message || '加入预设失败')
    } finally {
      setAdding(false)
    }
  }

  function handleKeyDown(event) {
    if (disabled) return
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setOpen(true)
      setActiveIndex((i) => {
        if (filtered.length === 0) return -1
        return i < 0 ? 0 : Math.min(i + 1, filtered.length - 1)
      })
      return
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault()
      setOpen(true)
      setActiveIndex((i) => {
        if (filtered.length === 0) return -1
        return i < 0 ? filtered.length - 1 : Math.max(i - 1, 0)
      })
      return
    }
    if (event.key === 'Enter') {
      if (open && activeIndex >= 0 && filtered[activeIndex]) {
        event.preventDefault()
        selectText(filtered[activeIndex].text)
      }
      return
    }
    if (event.key === 'Escape') {
      event.preventDefault()
      setOpen(false)
      setActiveIndex(-1)
    }
  }

  const showList = open && !disabled

  return (
    <div className="note-field" ref={rootRef}>
      <div className="note-field__control">
        <input
          id={inputId}
          type="text"
          role="combobox"
          aria-expanded={showList}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={
            activeIndex >= 0 && filtered[activeIndex]
              ? `${listId}-opt-${filtered[activeIndex].id}`
              : undefined
          }
          value={value}
          onChange={(e) => {
            onChange?.(e.target.value)
            setOpen(true)
            setActiveIndex(-1)
          }}
          onFocus={() => {
            setOpen(true)
            loadPresets()
          }}
          onClick={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          maxLength={maxLength}
          disabled={disabled}
          autoComplete="off"
          placeholder={placeholder}
        />
        <div className="note-field__actions">
          {value ? (
            <button
              type="button"
              className="note-field__clear"
              tabIndex={-1}
              disabled={disabled}
              aria-label="清空备注"
              onClick={() => {
                onChange?.('')
                setOpen(true)
                setActiveIndex(-1)
              }}
            >
              ×
            </button>
          ) : null}
          <button
            type="button"
            className="note-field__toggle"
            tabIndex={-1}
            disabled={disabled}
            aria-label="打开备注预设"
            onClick={() => {
              setOpen((prev) => !prev)
              loadPresets()
            }}
          >
            ▾
          </button>
        </div>
      </div>

      {canAddPreset ? (
        <div className="note-field__add-row">
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            disabled={disabled || adding}
            onClick={addAsPreset}
          >
            {adding ? '加入中…' : '加入预设'}
          </button>
        </div>
      ) : null}

      {showList ? (
        <ul id={listId} className="note-field__list" role="listbox">
          {filtered.length === 0 ? (
            <li className="note-field__empty" role="presentation">
              {presets.length === 0
                ? loadError || '暂无预设，可直接输入；设置里可维护常用备注'
                : value.trim()
                  ? '无匹配预设，可自由输入'
                  : '暂无预设'}
            </li>
          ) : (
            filtered.map((item, index) => (
              <li key={item.id} role="option" aria-selected={index === activeIndex}>
                <button
                  type="button"
                  id={`${listId}-opt-${item.id}`}
                  className={
                    index === activeIndex
                      ? 'note-field__option note-field__option--active'
                      : 'note-field__option'
                  }
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => selectText(item.text)}
                >
                  {item.text}
                </button>
              </li>
            ))
          )}
        </ul>
      ) : null}
    </div>
  )
}
