import type { MockRule } from './types'

interface OasDoc {
  openapi?: string
  swagger?: string
  info?: { title?: string; version?: string }
  paths?: Record<string, Record<string, unknown>>
  // OAS 3.x
  components?: { schemas?: Record<string, unknown> }
  // Swagger 2.x
  definitions?: Record<string, unknown>
}

const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options'] as const

function resolveRef(ref: string, doc: OasDoc): unknown {
  const parts = ref.replace(/^#\//, '').split('/')
  let node: unknown = doc
  for (const part of parts) {
    if (node == null || typeof node !== 'object') return null
    node = (node as Record<string, unknown>)[part]
  }
  return node
}

function schemaToExample(schema: unknown, doc: OasDoc, depth = 0): unknown {
  if (!schema || typeof schema !== 'object' || depth > 5) return null
  const s = schema as Record<string, unknown>

  if (typeof s.$ref === 'string') return schemaToExample(resolveRef(s.$ref, doc), doc, depth + 1)
  if (s.example !== undefined) return s.example

  const type = s.type as string | undefined

  if (type === 'object' || s.properties) {
    const props = s.properties as Record<string, unknown> | undefined
    if (!props) return {}
    const result: Record<string, unknown> = {}
    for (const [key, propSchema] of Object.entries(props)) {
      result[key] = schemaToExample(propSchema, doc, depth + 1)
    }
    return result
  }

  if (type === 'array') {
    const items = s.items
    return items ? [schemaToExample(items, doc, depth + 1)] : []
  }

  if (type === 'string') {
    if (Array.isArray(s.enum)) return s.enum[0]
    const fmt = s.format as string | undefined
    if (fmt === 'date') return '2024-01-01'
    if (fmt === 'date-time') return '2024-01-01T00:00:00Z'
    if (fmt === 'email') return 'user@example.com'
    if (fmt === 'uuid') return '00000000-0000-0000-0000-000000000000'
    return (s.default as string) ?? 'string'
  }

  if (type === 'integer' || type === 'number') return (s.default as number) ?? (s.minimum as number) ?? 0
  if (type === 'boolean') return (s.default as boolean) ?? false

  // Composition keywords
  const first = (s.allOf ?? s.oneOf ?? s.anyOf) as unknown[] | undefined
  if (Array.isArray(first) && first.length) return schemaToExample(first[0], doc, depth + 1)

  return null
}

function extractBody(operation: Record<string, unknown>, doc: OasDoc, isOas3: boolean): unknown {
  const responses = (operation.responses ?? {}) as Record<string, unknown>
  const bestCode = ['200', '201', '202', '204'].find(c => responses[c]) ?? Object.keys(responses)[0]
  const response = responses[bestCode] as Record<string, unknown> | undefined
  if (!response) return undefined

  if (isOas3) {
    const content = (response.content ?? {}) as Record<string, unknown>
    const mediaType = (content['application/json'] ?? Object.values(content)[0]) as Record<string, unknown> | undefined
    const rawSchema = mediaType?.schema
    if (!rawSchema) return undefined
    const schema = typeof (rawSchema as Record<string, unknown>).$ref === 'string'
      ? resolveRef((rawSchema as Record<string, unknown>).$ref as string, doc)
      : rawSchema
    return schemaToExample(schema, doc)
  }

  // Swagger 2.0
  const rawSchema = response.schema as Record<string, unknown> | undefined
  if (!rawSchema) return undefined
  const schema = typeof rawSchema.$ref === 'string' ? resolveRef(rawSchema.$ref, doc) : rawSchema
  return schemaToExample(schema, doc)
}

function bestStatus(operation: Record<string, unknown>): number {
  const codes = Object.keys((operation.responses ?? {}) as object)
    .map(Number).filter(Boolean).sort()
  return codes.find(c => c >= 200 && c < 300) ?? codes[0] ?? 200
}

export interface OpenApiParseResult {
  title: string
  rules: Omit<MockRule, 'id'>[]
}

export function parseOpenApi(raw: unknown): OpenApiParseResult {
  const doc = raw as OasDoc
  const isOas3 = !!doc.openapi
  const title = doc.info?.title ?? 'OpenAPI'
  const rules: Omit<MockRule, 'id'>[] = []

  for (const [path, pathItem] of Object.entries(doc.paths ?? {})) {
    if (!pathItem || typeof pathItem !== 'object') continue
    const item = pathItem as Record<string, unknown>

    for (const method of HTTP_METHODS) {
      const operation = item[method] as Record<string, unknown> | undefined
      if (!operation) continue

      const status = bestStatus(operation)
      const body = extractBody(operation, doc, isOas3)
      const name = (operation.summary ?? operation.operationId ?? `${method.toUpperCase()} ${path}`) as string

      rules.push({
        name,
        urlPattern: path,
        method: method.toUpperCase(),
        enabled: true,
        response: {
          status,
          statusText: statusText(status),
          headers: { 'Content-Type': 'application/json' },
          ...(body !== undefined && body !== null ? { body } : {})
        }
      })
    }
  }

  return { title, rules }
}

function statusText(code: number): string {
  const map: Record<number, string> = {
    200: 'OK', 201: 'Created', 202: 'Accepted',
    204: 'No Content', 400: 'Bad Request', 401: 'Unauthorized',
    403: 'Forbidden', 404: 'Not Found', 500: 'Internal Server Error'
  }
  return map[code] ?? 'OK'
}
