# Ice Kassa — мобильное приложение кассы

Клиент на **Ionic React** + **Capacitor** для Android: каталог товаров, корзина, оформление продажи, учёт расходов, синхронизация с backend и вход кассира по телефону и PIN.

## Стек

| Компонент | Назначение |
|-----------|------------|
| React 19, TypeScript | UI и логика |
| Ionic 8 | Компоненты, маршрутизация табов |
| Capacitor 8 | Нативная оболочка Android, сеть, SQLite |
| `@capacitor-community/sqlite` + jeep-sqlite (web) | Локальная БД |
| sql.js / WASM | Режим браузера при `npm run dev` |

## Требования

- Node.js 20+ (рекомендуется LTS)
- Для сборки APK: Android Studio, JDK, переменные окружения Android SDK

## Быстрый старт

```bash
cd mobile
npm install
npm run dev
```

В браузере откроется Vite dev server; API по умолчанию: `http://localhost:3847` (см. `src/config.ts`). Backend должен быть запущен и доступен по этому адресу.

Сборка веб-артефакта:

```bash
npm run build
```

Сборка и синхронизация с Android-проектом:

```bash
npm run android:sync
# или: npm run build && npx cap sync android
```

Далее откройте `android/` в Android Studio и соберите APK/AAB.

## Переменные окружения (`VITE_*`)

Файл-пример: [.env.example](./.env.example).

| Переменная | Когда нужна |
|------------|-------------|
| `VITE_API_URL` | **Обязательна для production-сборки** под телефон. Полный URL API (как у админки за nginx), например `https://example.com/api`. Относительный путь `/api` не подходит: WebView приложения не на вашем домене. |

В режиме разработки (`npm run dev`) без `VITE_API_URL` используется `http://localhost:3847`.

Для теста с телефона в одной Wi‑Fi сети укажите IP машины с backend, например `VITE_API_URL=http://192.168.1.10:3847`.

## Структура проекта

```
mobile/
├── android/                 # Нативный проект Capacitor (после cap add/sync)
├── scripts/copy-sql-wasm.mjs # postinstall: sql.js WASM в dist
├── src/
│   ├── App.tsx               # IonApp, IonReactRouter, провайдеры
│   ├── config.ts           # API_BASE из VITE_API_URL
│   ├── main.tsx
│   ├── context/
│   │   ├── AuthContext.tsx   # Сессия, JWT, сеть, счётчик очереди синка
│   │   └── CartContext.tsx   # Корзина продажи (в памяти)
│   ├── pages/
│   │   ├── MainTabs.tsx      # Табы: Главная, Расход, Настройки
│   │   ├── CashierPage.tsx   # Каталог, корзина, модалка оплаты
│   │   ├── Expense.tsx       # Локальный учёт расходов
│   │   └── SettingsPage.tsx  # Вход / выход, статус
│   ├── services/
│   │   ├── api.ts            # login, apiFetch с Bearer
│   │   ├── db.ts             # SQLite, схема таблиц, сессия, токен
│   │   ├── sync.ts           # Периодический pull продаж/очереди + push
│   │   └── productsSync.ts   # Загрузка каталога с сервера
│   └── theme/
│       ├── variables.css     # Тема Ionic, токены отступов
│       └── app.css           # Вёрстка экранов
├── capacitor.config.ts       # appId, webDir, Keyboard, androidScheme
└── vite.config.ts
```

## Маршрутизация

- `/` → редирект на `/tabs`
- `/tabs` → редирект на `/tabs/cashier` при наличии серверной авторизации, иначе `/tabs/settings`
- `/tabs/cashier`, `/tabs/expense` → если нет JWT (`serverAuth`), редирект на **Настройки** (вход обязателен для этих разделов). Вкладки «Главная» и «Расход» в нижней панели **всегда отображаются**; без входа они ведут на экран входа (приглушённый вид).
- `/tabs/settings` → всегда доступен (вход или «Вход» как единственная вкладка без JWT)

Провайдеры оборачивают приложение в порядке: **Router → AuthProvider → CartProvider → IonRouterOutlet**.

## Авторизация

1. Кассир вводит **телефон** и **PIN**, как в админ-панели backend.
2. `POST /auth/login` возвращает JWT и данные кассира; токен сохраняется в SQLite (`token_store`).
3. **`serverAuth`** в `AuthContext` отражает наличие JWT; без него продажи и расходы не уходят на сервер (вкладки Главная/Расход недоступны — пользователь направляется на вход).
4. **Выход** очищает JWT; локальная «заглушка» сессии (`local` / кассир id 1) используется для стабильности БД без поломки страниц.

Онлайн/офлайн: `@capacitor/network`; без сети вход по API невозможен (сообщение на экране настроек).

## Локальная база данных

Инициализация: `initLocalDb()` в `services/db.ts`.

Основные таблицы:

- **token_store** — JWT доступа к API (одна строка `id = 1`).
- **current_session** — отображаемый кассир (телефон, id, имя).
- **credentials** — вспомогательное хранилище учётных данных (при необходимости); вход выполняется через API.
- **products** — кэш каталога с сервера.
- **sales**, **sale_items** — продажи до синхронизации.
- **expenses** — расходы до синхронизации.
- **sync_queue** — очередь исходящих операций (`entity_type`: `sale` | `expense`, `status`: `pending` | `synced` | `error`).

На **web** используется jeep-sqlite + sql.js (WASM копируется скриптом `postinstall`).

## Синхронизация

- Цикл: каждые **10 секунд** вызывается `runSyncOnce()` (если есть сеть).
- При старте приложения и после успешного входа также выполняется синхронизация.
- Порядок: загрузка каталога (`pullProducts`), затем отправка до **20** записей из `sync_queue` с JWT (`POST /sales`, `POST /expenses`).
- Успех → статус `synced`; ошибка → `error` для записи очереди (лог в консоли).

Счётчик «ожидающих» записей обновляется из БД и периодически в UI.

## Экраны (кратко)

| Экран | Функции |
|-------|---------|
| **Главная** (касса) | Список товаров из локальной БД, корзина, итог, модальное окно оплаты (наличные / карта / перевод / долг), сохранение продажи и постановка в очередь синка |
| **Расход** | Сумма, категория, счёт оплаты, комментарий → SQLite + `sync_queue` |
| **Настройки** | Вход, выход, подсказки про офлайн и Telegram (на стороне сервера) |

## Capacitor и Android

- **`webDir`**: `dist` — после `npm run build` выполняйте `npx cap sync android`.
- **`androidScheme: 'http'`** — позволяет обращаться к HTTP API в локальной сети без смешанного контента с `https://localhost` в WebView (см. комментарии в `capacitor.config.ts`).
- **Keyboard `resizeOnFullScreen`** — корректное поведение при открытой клавиатуре в полноэкранных модалках.

## Скрипты npm

| Скрипт | Действие |
|--------|----------|
| `npm run dev` | Vite dev server |
| `npm run build` | TypeScript + production bundle в `dist/` |
| `npm run android:sync` | `build` + `cap sync android` |
| `npm run preview` | Превью собранного `dist` |
| `npm run lint` | ESLint |

## Линт и качество

После изменений имеет смысл запускать `npm run lint` и `npm run build`.

## Связь с backend

Ожидаются маршруты в стиле REST под тем же префиксом, что задаётся в `VITE_API_URL`, например:

- `POST .../auth/login`
- при необходимости каталог и синхронизация — как реализовано в `productsSync.ts`, `sync.ts`, `api.ts`

Точные пути и форматы тел должны совпадать с репозиторием backend этого монорепозитория.
