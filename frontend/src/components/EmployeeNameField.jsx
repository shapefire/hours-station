import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import api from '../api/client.js'
import Metric from './Metric.jsx'
import RosterStatusBadge from './RosterStatusBadge.jsx'

/**
 * Combobox: select from roster and/or free-type a new name.
 * Soft-delete from roster via × on each option (history entries kept).
 * Optionally shows month_hours and month_rest_days for the calendar month in view.
 */
export default function EmployeeNameField({
  value,
  onChange,
  disabled = false,
  required = false,
  placeholder = '选择或输入员工姓名',
  autoFocus = false,
  id: idProp,
  monthYear = null,
  month = null,
  occupiedMap = {},
}) {
  const autoId = useId()
  const inputId = idProp || `${autoId}-name`
  const listId = `${autoId}-list`
  const rootRef = useRef(null)
  const [roster, setRoster] = useState([])
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const [loadError, setLoadError] = useState(null)
  const [removingId, setRemovingId] = useState(null)

  const loadRoster = useCallback(() => {
    const params = new URLSearchParams()
    if (monthYear != null && month != null) {
      params.set('year', String(monthYear))
      params.set('month', String(month))
    }
    const qs = params.toString()
    return api
      .get(`/api/employees${qs ? `?${qs}` : ''}`)
      .then((rows) => {
        setRoster(Array.isArray(rows) ? rows : [])
        setLoadError(null)
      })
      .catch(() => {
        setRoster([])
        setLoadError('花名册加载失败')
      })
  }, [monthYear, month])

  useEffect(() => {
    let cancelled = false
    loadRoster().finally(() => {
      if (cancelled) return
    })
    return () => {
      cancelled = true
    }
  }, [loadRoster])

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
    if (!q) return roster
    return roster.filter((emp) => emp.name.toLowerCase().includes(q))
  }, [roster, value])

  function isOccupied(name) {
    return Boolean(occupiedMap[name])
  }

  function selectName(name) {
    if (isOccupied(name)) return
    onChange?.(name)
    setOpen(false)
    setActiveIndex(-1)
  }

  async function removeFromRoster(event, emp) {
    event.preventDefault()
    event.stopPropagation()
    const ok = window.confirm(
      `将「${emp.name}」移出花名册？\n下拉列表中不再显示；已登记的历史工时会保留。`,
    )
    if (!ok) return

    setRemovingId(emp.id)
    try {
      await api.delete(`/api/employees/${emp.id}`)
      if (value.trim() === emp.name) {
        onChange?.('')
      }
      setActiveIndex(-1)
      await loadRoster()
    } catch (err) {
      window.alert(err.message || '移出花名册失败')
    } finally {
      setRemovingId(null)
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
      event.preventDefault()
      if (open && activeIndex >= 0 && filtered[activeIndex]) {
        selectName(filtered[activeIndex].name)
      } else {
        setOpen(false)
        setActiveIndex(-1)
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
  const exactMatch = roster.some((emp) => emp.name === value.trim())
  const showMonthStats = monthYear != null && month != null

  return (
    <div className="name-field" ref={rootRef}>
      <div className="name-field__control">
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
            loadRoster()
          }}
          onClick={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          required={required}
          maxLength={64}
          disabled={disabled}
          autoComplete="off"
          autoFocus={autoFocus}
          placeholder={placeholder}
        />
        <div className="name-field__actions">
          {value ? (
            <button
              type="button"
              className="name-field__clear"
              tabIndex={-1}
              disabled={disabled}
              aria-label="清空姓名"
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
            className="name-field__toggle"
            tabIndex={-1}
            disabled={disabled}
            aria-label="打开花名册"
            onClick={() => {
              setOpen((prev) => !prev)
              loadRoster()
            }}
          >
            ▾
          </button>
        </div>
      </div>

      {showList ? (
        <ul id={listId} className="name-field__list" role="listbox">
          {showMonthStats ? (
            <li className="name-field__colhead" role="presentation">
              <span>姓名</span>
              <span>当月已排</span>
              <span>已休息</span>
            </li>
          ) : null}
          {filtered.length === 0 ? (
            <li className="name-field__empty" role="presentation">
              {roster.length === 0
                ? loadError || '花名册暂无人员，可直接输入姓名'
                : value.trim()
                  ? `无匹配，将新增「${value.trim()}」`
                  : '花名册为空'}
            </li>
          ) : (
            filtered.map((emp, index) => {
              const occupied = isOccupied(emp.name)
              const occupiedLabel = occupiedMap[emp.name]
              return (
                <li
                  key={emp.id}
                  role="option"
                  aria-selected={index === activeIndex}
                  aria-disabled={occupied || undefined}
                >
                  <div
                    className={[
                      'name-field__option-row',
                      index === activeIndex ? 'name-field__option-row--active' : '',
                      occupied ? 'name-field__option-row--occupied' : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    onMouseEnter={() => setActiveIndex(index)}
                  >
                    <button
                      type="button"
                      id={`${listId}-opt-${emp.id}`}
                      className={[
                        'name-field__option',
                        showMonthStats ? 'name-field__option--stats' : '',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                      disabled={occupied}
                      onClick={() => selectName(emp.name)}
                    >
                      <span className="name-field__option-name">
                        <span className="name-field__option-name-text">{emp.name}</span>
                        {occupied && occupiedLabel ? (
                          <RosterStatusBadge label={occupiedLabel} />
                        ) : null}
                      </span>
                      {showMonthStats ? (
                        <span className="name-field__option-hours">
                          <Metric
                            value={emp.month_hours != null ? emp.month_hours : '0.0'}
                            unit="h"
                            chip
                          />
                        </span>
                      ) : null}
                      {showMonthStats ? (
                        <span className="name-field__option-rest">
                          <Metric
                            value={emp.month_rest_days != null ? emp.month_rest_days : 0}
                            unit="天"
                            chip
                          />
                        </span>
                      ) : null}
                    </button>
                    <button
                      type="button"
                      className="name-field__remove"
                      title="移出花名册"
                      aria-label={`将 ${emp.name} 移出花名册`}
                      disabled={disabled || removingId === emp.id}
                      onClick={(e) => removeFromRoster(e, emp)}
                    >
                      ×
                    </button>
                  </div>
                </li>
              )
            })
          )}
          {value.trim() && !exactMatch ? (
            <li className="name-field__hint" role="presentation">
              保存后将把「{value.trim()}」加入花名册
            </li>
          ) : null}
        </ul>
      ) : null}
    </div>
  )
}
