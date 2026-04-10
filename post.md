Я давно хотел иметь под рукой инструмент, который бы показывал весь сетевой трафик приложения не в DevTools браузера, а прямо внутри самого приложения — в виде панели, которую можно открыть горячей клавишей, отфильтровать нужные запросы и тут же посмотреть, что именно ушло и пришло.

DevTools справляются, но у них есть неудобство: ты постоянно переключаешься между вкладкой приложения и вкладкой Network, теряешь контекст, ищешь нужный запрос в общем потоке. Если приложение работает с WebSocket или SSE — всё становится ещё хуже.

Так появился `vue-network-dashboard`.

---

## Что это такое

![](https://s3.twcstorage.ru/c9a2cc89-780f97fd-311d-4a1a-b86f-c25665c9dc46/macrulez-blog/1775831021790-987e763894ade357.webp)

`vue-network-dashboard` — Vue 3 плагин, который на старте заменяет глобальные браузерные API (`window.fetch`, `XMLHttpRequest`, `window.WebSocket`, `window.EventSource`) своими обёртками. Любой сетевой вызов — из вашего кода, из сторонних библиотек, из anywhere — попадает в единое реактивное хранилище.

Схема работы простая:

```
Код вашего приложения
        │
        ▼
  Перехватчики (Interceptors)
  ┌──────────────────────────────────┐
  │ window.fetch       (Fetch)       │
  │ XMLHttpRequest     (XHR)         │
  │ window.WebSocket   (WebSocket)   │
  │ window.EventSource (SSE)         │
  └──────────────────────────────────┘
        │
        ▼
  Форматтер → UnifiedLogEntry
        │
        ▼
  LogStore → Vue Reactive Refs → Компоненты
```

Оригинальные реализации при этом сохраняются и вызываются как обычно — перехват полностью прозрачен для остального кода.

---

## Установка и минимальный старт

```bash
npm install vue-network-dashboard
```

```typescript
// main.ts
import { createApp } from 'vue'
import App from './App.vue'
import NetworkDashboard from 'vue-network-dashboard'

const app = createApp(App)

app.use(NetworkDashboard, {
  devOnly: true,   // активен только в development-сборке
  maxLogs: 500,
})

app.mount('#app')
```

Всё. С этого момента все Fetch, XHR, WebSocket и SSE запросы перехватываются. Можно добавить компонент панели в `App.vue`:

```vue
<template>
  <RouterView />
  <NetworkDebugger />  <!-- открывается по Ctrl+Shift+D -->
</template>
```

Если не хочется импортировать `NetworkDebugger` вручную — он уже реэкспортируется из пакета:

```typescript
import { NetworkDebugger } from 'vue-network-dashboard'
```

---

## Что умеет панель

### Вкладка Logs

![](https://s3.twcstorage.ru/c9a2cc89-780f97fd-311d-4a1a-b86f-c25665c9dc46/macrulez-blog/1775831051729-e485d3bb93185812.webp)

Список всех запросов в реальном времени. Каждая строка — метод, URL, статус, время выполнения. Кликаешь — раскрывается детальная информация: заголовки запроса и ответа, тело, тайминги.

**Pending-запросы** появляются сразу, как только запрос отправлен, с вращающимся индикатором — и обновляются на месте, когда приходит ответ. Как в DevTools, только внутри приложения.

**Фильтрация** по типу (HTTP / WS / SSE), URL, методу, статусу, минимальной длительности, по наличию ошибки и — отдельно — по содержимому тела запроса или ответа.

**Группировка** — схлопывает повторяющиеся запросы к одному эндпоинту в одну строку с счётчиком. Удобно, если, например, компонент делает один и тот же запрос при каждом рендере.

**Diff** — выбираешь две записи и видишь рядом, чем они отличаются: заголовки, тело запроса, тело ответа. Полезно, когда один и тот же запрос раньше работал, а теперь нет.

### Вкладка Stats

![](https://s3.twcstorage.ru/c9a2cc89-780f97fd-311d-4a1a-b86f-c25665c9dc46/macrulez-blog/1775831073478-42c6fb44f53b63ec.webp)

Агрегированная статистика сессии: всего запросов, ошибок, средняя длительность, объём отправленных и полученных данных. Разбивка по методам и статус-кодам. Топ-5 самых медленных и самых тяжёлых запросов — сразу видно, куда смотреть при проблемах с производительностью.

### Вкладка Timeline

![](https://s3.twcstorage.ru/c9a2cc89-780f97fd-311d-4a1a-b86f-c25665c9dc46/macrulez-blog/1775831091074-d5f3707a36bc4643.webp)

Waterfall-диаграмма — все запросы на общей временной оси. Сразу видно, что выполнялось параллельно, что блокировало, где провал.

### Вкладка Mocks

![](https://s3.twcstorage.ru/c9a2cc89-780f97fd-311d-4a1a-b86f-c25665c9dc46/macrulez-blog/1775831110503-38d8896f31dee7c1.webp)

Можно определить правила-перехватчики: по URL и методу подменить ответ — задать статус, тело, задержку — не трогая бэкенд. Правила можно создавать прямо из UI панели или программно в коде. Замоканные запросы логируются как обычно, но с отдельным бейджем `mock`, чтобы не перепутать с реальными.

---

## Экспорт

Накопленные логи можно выгрузить в трёх форматах:

- **JSON** — весь массив `UnifiedLogEntry[]` как есть
- **CSV** — таблица для Excel / Google Sheets
- **HAR** (HTTP Archive 1.2) — открывается напрямую в Chrome DevTools, Postman или Charles Proxy

HAR особенно полезен: записал сессию, отдал файл коллеге или в тикет — и он видит ровно то, что видел ты.

---

## Безопасность

По умолчанию плагин автоматически удаляет чувствительные данные перед сохранением в лог:

- Заголовки `Authorization`, `Cookie`, `X-Api-Key` — заменяются на `[REDACTED]`
- Поля тела `password`, `token`, `secret`, `cvv` и другие — удаляются
- Поля `email`, `phone` — маскируются: `us****@example.com`

Список можно расширить в конфиге:

```typescript
app.use(NetworkDashboard, {
  sanitization: {
    sensitiveHeaders: ['x-internal-token'],
    sensitiveFields: ['ssn', 'card_number'],
    maskFields: ['username'],
  }
})
```

---

## Использование в коде

Данные доступны через `useNetworkDashboard()` в любом компоненте:

```typescript
const {
  logs,              // Ref<UnifiedLogEntry[]>
  totalRequests,
  totalErrors,
  averageDuration,
  getErrorLogs,
  subscribe,
  export: exportLogs,
} = useNetworkDashboard()

// Подписка на новые события
const unsubscribe = subscribe((entry) => {
  if (entry.error.occurred) {
    console.warn('Ошибка запроса:', entry.url)
  }
})
```

Логи можно сохранять между перезагрузками страницы — достаточно включить `persistToStorage`:

```typescript
app.use(NetworkDashboard, {
  persistToStorage: true,  // логи восстанавливаются из localStorage при следующем открытии
  maxLogs: 200,
})
```

Удобно, когда баг воспроизводится в несколько шагов и не хочется каждый раз начинать с нуля.

---

## Nuxt 3

Есть нативный модуль:

```typescript
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ['vue-network-dashboard/nuxt'],
  networkDashboard: {
    devOnly: true,
    maxLogs: 500,
  }
})
```

`<NetworkDebugger>` и `useNetworkDashboard()` автоматически импортируются во всех компонентах и страницах — дополнительных `import` не нужно. Плагин работает только на клиенте, SSR не затрагивается.

---

## Интеграции

### Vue DevTools

Добавляет вкладку «Network» в инспектор Vue DevTools (браузерное расширение и vite-plugin-vue-devtools) и отдельный слой на таймлайне — каждый запрос виден как событие.

Подключается один раз в точке входа приложения — `main.ts`:

```typescript
// main.ts
import { createApp } from 'vue'
import App from './App.vue'
import NetworkDashboard, { setupDevtools, useNetworkDashboard } from 'vue-network-dashboard'

const app = createApp(App)
app.use(NetworkDashboard)

if (import.meta.env.DEV) {
  setupDevtools(app, useNetworkDashboard())
}

app.mount('#app')
```

### Sentry

Адаптер добавляет каждый запрос как breadcrumb в Sentry и отправляет `captureMessage` при 5xx-ошибках.

Вставляется там же, где инициализируется Sentry — обычно `main.ts` или отдельный файл `plugins/sentry.ts`:

```typescript
// main.ts (или plugins/sentry.ts)
import * as Sentry from '@sentry/vue'
import NetworkDashboard, { createSentryAdapter } from 'vue-network-dashboard'

Sentry.init({ dsn: '...' })

app.use(NetworkDashboard, {
  callbacks: createSentryAdapter(Sentry, {
    errorStatusThreshold: 500,  // отправлять событие начиная с этого кода
    includeBodies: false,        // не включать тела запросов в breadcrumbs
  })
})
```

### OpenTelemetry

Адаптер создаёт OTel span на каждый запрос с семантическими атрибутами (`http.request.method`, `http.response.status_code`, `url.full` и др.).

Подключается рядом с инициализацией трейсера — обычно `src/telemetry.ts` или `main.ts`:

```typescript
// main.ts (или src/telemetry.ts)
import { trace } from '@opentelemetry/api'
import NetworkDashboard, { createOpenTelemetryAdapter } from 'vue-network-dashboard'

const tracer = trace.getTracer('my-app')

app.use(NetworkDashboard, {
  callbacks: createOpenTelemetryAdapter(tracer, {
    httpOnly: true,         // не трекировать WebSocket/SSE
    includeBodySize: true,
  })
})
```

---

## Конфигурация горячей клавиши

По умолчанию панель открывается по `Ctrl+Shift+D`. Можно поменять:

```typescript
app.use(NetworkDashboard, {
  ui: {
    hotkey: 'n',
    hotkeyModifiers: { alt: true },  // Alt+N
  }
})
```

---

## Что под капотом

Каждый запрос превращается в `UnifiedLogEntry` — единую структуру вне зависимости от транспорта:

```typescript
interface UnifiedLogEntry {
  id: string
  type: 'http' | 'websocket' | 'sse'
  url: string
  method: string
  startTime: number
  endTime: number | null
  duration: number | null
  http: { status: number; statusText: string } | null
  websocket: { eventType: string; direction: string | null; ... } | null
  requestHeaders: Record<string, string>
  responseHeaders: Record<string, string>
  request: { body: any; bodySize: number | null }
  response: { body: any; bodySize: number | null }
  error: { occurred: boolean; message: string | null; ... }
  metadata: { clientType: string; pending?: boolean; mocked?: boolean; ... }
}
```

Реактивность — чистый Vue `ref`, без Pinia и Vuex. XHR перехватывается через `WeakMap` — данные привязываются к экземпляру без загрязнения прототипа. WebSocket и SSE оборачиваются на уровне конструктора.

---

## Пара реальных сценариев

### «Почему форма отправляет запрос дважды?»

Классическая история: пользователь нажимает кнопку «Сохранить», и в логах бэкенда появляются две одинаковые записи. Открываешь DevTools, ждёшь, пока снова воспроизведётся — и в это время DevTools перекрыли половину экрана, не видно, на что именно нажимал пользователь.

С `vue-network-dashboard` включаешь **Group** — и сразу видишь `POST /api/orders` с счётчиком `×2`. Раскрываешь группу — у обоих запросов одинаковое тело и разница в старте 12 миллисекунд. Смотришь в код — на кнопке не было `@click.prevent`, форма сабмитилась нативно и одновременно через обработчик. Починил за минуту.

### «Бэкенд говорит, что мы шлём не то поле»

Бэкенд-разработчик пишет: «вы шлёте `user_id`, а нужен `userId`». Открываешь DevTools, фильтруешь нужный запрос, разворачиваешь тело... или просто открываешь панель, в поле Body вводишь `user_id` — и видишь все запросы, где это поле присутствует. Нашли, исправили, убедились — без перезагрузки страницы, не теряя состояние приложения.

### «Что происходит в чате, пока я в другой вкладке?»

Приложение работает с WebSocket-чатом. Нужно понять, какие сообщения приходят, пока пользователь неактивен. В DevTools вкладка WS показывает сырые фреймы без структуры. В `vue-network-dashboard` каждое входящее сообщение — отдельная строка с распарсенным JSON в теле, временем получения и направлением (`WS ← message`). Не нужно копировать фрейм и вставлять в JSON-валидатор.

### «Покажи мне HAR-файл»

QA нашёл баг на стейдже, который не воспроизводится локально. Вместо «пришли скриншот» — «пришли HAR». Тестировщик жмёт Export → HAR, скидывает файл. Открываешь его в Chrome DevTools → вкладка Network → Import — и видишь ровно то, что видел он: все запросы, все заголовки, все тела, тайминги.

### «Верстаю экраны, бэкенд ещё не готов»

Новый раздел в приложении готов по UI, но API для него ещё в разработке. Вместо того чтобы поднимать мок-сервер или комментировать код — открываешь вкладку **Mocks** и добавляешь правило прямо в браузере:

- URL: `/api/v2/recommendations`
- Метод: `GET`
- Ответ: `200`, JSON с тестовыми данными
- Задержка: `300ms` — чтобы сразу видеть, как ведут себя лоадеры

Все запросы к этому эндпоинту мгновенно начинают возвращать нужный ответ. Бэкенд появится — правило просто удалишь.

### «Надо воспроизвести ошибку 500 на конкретном запросе»

Компонент должен показывать fallback при ошибке сервера, но руками сломать API неудобно. В Mocks добавляешь правило:

- URL: `/api/users`
- Метод: `GET`
- Ответ: `500`, тело: `{ "error": "Internal Server Error" }`

Теперь любой `GET /api/users` возвращает 500 — проверяешь, что UI обрабатывает это корректно. Убедился — убрал правило. Бэкенд ни разу не трогали.

### «Показываю демо, бэкенд в продакшне, трогать нельзя»

Демонстрация новой фичи заказчику — данные в продакшн-базе не те, что нужны для красивого показа. Добавляешь несколько mock-правил для нужных эндпоинтов, подставляешь подготовленные данные — и демо выглядит именно так, как должно. Никаких тестовых окружений, никаких сидов в базе.

---

**NPM:** https://www.npmjs.com/package/vue-network-dashboard  
**GitHub:** https://github.com/macrulezru/vue-network-dashboard
