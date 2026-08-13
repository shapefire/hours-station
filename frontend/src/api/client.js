async function parseError(response) {
  let detail = `请求失败（${response.status}）`
  const raw = await response.text()

  if (raw) {
    try {
      const body = JSON.parse(raw)
      if (typeof body?.detail === 'string') {
        detail = body.detail
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

export const api = {
  get: (path) => request('GET', path),
  post: (path, body) => request('POST', path, body),
  put: (path, body) => request('PUT', path, body),
  patch: (path, body) => request('PATCH', path, body),
  delete: (path) => request('DELETE', path),
}

export default api
