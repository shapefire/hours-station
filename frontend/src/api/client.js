async function parseError(response) {
  let detail = `请求失败（${response.status}）`
  let body = null
  const raw = await response.text()

  if (raw) {
    try {
      body = JSON.parse(raw)
      if (typeof body?.detail === 'string') {
        detail = body.detail
      } else if (typeof body?.detail === 'object' && body.detail !== null) {
        detail = body.detail.message || JSON.stringify(body.detail)
      } else if (Array.isArray(body?.detail)) {
        detail = body.detail
          .map((item) => item.msg || JSON.stringify(item))
          .join('; ')
      } else if (body?.message) {
        detail = body.message
      } else {
        detail = raw
      }
    } catch {
      detail = raw
    }
  }

  const error = new Error(detail)
  error.status = response.status
  if (typeof body?.detail === 'object' && body.detail !== null && !Array.isArray(body.detail)) {
    error.body = body.detail
  }
  throw error
}

async function request(method, path, body) {
  const options = {
    method,
    headers: {},
  }

  if (body !== undefined) {
    options.headers['Content-Type'] = 'application/json'
    options.body = JSON.stringify(body)
  }

  const response = await fetch(path, options)

  if (!response.ok) {
    await parseError(response)
  }

  if (response.status === 204) {
    return null
  }

  const contentType = response.headers.get('content-type') || ''
  if (contentType.includes('application/json')) {
    return response.json()
  }

  return response.text()
}

/** Prefer RFC 5987 `filename*=UTF-8''`, then `filename=`; both may be percent-encoded. */
export function parseContentDispositionFilename(header) {
  if (!header) return null
  const star = /filename\*\s*=\s*UTF-8''([^;]+)/i.exec(header)
  if (star?.[1]) {
    try {
      return decodeURIComponent(star[1].trim().replace(/^"(.*)"$/, '$1'))
    } catch {
      // fall through to filename=
    }
  }
  const plain = /(?:^|;)\s*filename\s*=\s*(?!\*)("?)([^";]+)\1/i.exec(header)
  if (plain?.[2]) {
    const raw = plain[2].trim()
    try {
      return decodeURIComponent(raw)
    } catch {
      return raw
    }
  }
  return null
}

async function download(path, fallbackFilename) {
  const response = await fetch(path)
  if (!response.ok) {
    await parseError(response)
  }
  const blob = await response.blob()
  const filename =
    parseContentDispositionFilename(response.headers.get('Content-Disposition')) ||
    fallbackFilename
  const objectUrl = URL.createObjectURL(blob)
  try {
    const link = document.createElement('a')
    link.href = objectUrl
    link.download = filename
    document.body.appendChild(link)
    link.click()
    link.remove()
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}

export const api = {
  get: (path) => request('GET', path),
  post: (path, body) => request('POST', path, body),
  put: (path, body) => request('PUT', path, body),
  patch: (path, body) => request('PATCH', path, body),
  delete: (path) => request('DELETE', path),
  download,
}

export default api
