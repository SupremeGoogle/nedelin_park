# Nedelin Park

Лендинг сферических домов под Калининградом. Деплоится на Vercel; уведомления
о бронировании уходят через Cloudflare Worker → Telegram.

## Архитектура

```
┌──────────────┐   POST /api/booking    ┌───────────────────┐   POST /notify   ┌──────────────┐
│  index.html  │ ─────────────────────▶ │  Vercel functions │ ───────────────▶ │  CF Worker   │
│  (Vercel)    │                         │  /api/*           │                  │  /notify     │
└──────────────┘   GET/PUT /api/content │                   │                  │  /tg/webhook │
        ▲                                └─────────┬─────────┘                  └──────┬───────┘
        │                                          │                                   │
        │                                          ▼                                   ▼
        │                                ┌───────────────────┐                  ┌──────────────┐
        └────────────────────────────────│ KV или GitHub JSON │                 │  Telegram    │
                                         └───────────────────┘                  └──────────────┘
```

* Контент сайта хранится в **Vercel KV** (быстро, сразу видно) или в
  **content.json через GitHub API** (если KV не подключён; изменения видны после
  нового деплоя, обычно примерно через минуту).
* Админ-панель открывается изнутри сайта (`#admin` или 5 кликов по логотипу),
  вход — по серверному коду из ENV (`ADMIN_CODE`, по умолчанию `nedelin062026`).
* Бронирование отправляется в **Cloudflare Worker** (`/notify`), который рассылает
  сообщение в Telegram **только тем чатам**, что подписались командой `/nedelinpark`.
* Связь Vercel ⇄ Telegram **односторонняя**: Vercel шлёт фактом-вперёд (fire & forget),
  ответ от TG приходит обратно только в CF Worker через webhook.

## Переменные окружения

### Vercel (Production + Preview)

| Имя | Значение | Откуда взять |
| --- | --- | --- |
| `ADMIN_CODE` | `nedelin062026` | Код для входа в админку. Меняйте, чтобы ротировать доступ. |
| `ADMIN_SESSION_SECRET` | случайная строка ≥ 32 символов | Сгенерируйте: `openssl rand -hex 32`. Подписывает cookie сессии. |
| `CF_NOTIFY_URL` | `https://nedelin-park-tg.<вашаккаунт>.workers.dev/notify` | URL развернутого Cloudflare-воркера + `/notify`. |
| `CF_NOTIFY_SECRET` | случайная строка ≥ 32 символов | Сгенерируйте `openssl rand -hex 32`. Должна совпадать с секретом воркера. |
| `KV_REST_API_URL` | заполняется автоматически | После добавления интеграции **Vercel KV** (Upstash Redis) в проект. |
| `KV_REST_API_TOKEN` | заполняется автоматически | То же. |
| `GITHUB_TOKEN` | fine-grained token с доступом Contents: Read and write | Нужен, если не подключаете KV. Токен должен иметь доступ к `SupremeGoogle/nedelin_park`. |
| `GITHUB_REPO` | `SupremeGoogle/nedelin_park` | Необязательно, это значение используется по умолчанию. |
| `GITHUB_BRANCH` | `main` | Необязательно, это значение используется по умолчанию. |
| `GITHUB_CONTENT_PATH` | `content.json` | Необязательно, это значение используется по умолчанию. |

Чтобы подключить хранилище, в Vercel → проект → **Storage** → **Create database** →
выберите **Upstash KV** (или **Marketplace → Upstash → Redis**). После связки с
проектом переменные `KV_REST_API_URL` / `KV_REST_API_TOKEN` появятся сами.

Если KV не нужен, создайте fine-grained GitHub token:

1. GitHub → Settings → Developer settings → Fine-grained tokens.
2. Repository access: только `SupremeGoogle/nedelin_park`.
3. Permissions → Contents: **Read and write**.
4. Добавьте токен в Vercel как `GITHUB_TOKEN`.

При таком режиме кнопка «Сохранить» в админке коммитит новый `content.json` в
репозиторий. GitHub/Vercel запускают деплой, поэтому посетители увидят изменения
не мгновенно, а примерно через минуту.

### Cloudflare Worker (`worker/`)

| Имя | Назначение |
| --- | --- |
| `TELEGRAM_BOT_TOKEN` | Токен Telegram-бота (получают у @BotFather и держат в секретах Cloudflare, в репозитории не публикуют). |
| `TELEGRAM_WEBHOOK_TOKEN` | Случайная строка. Telegram прикладывает её к каждому webhook-запросу. |
| `NOTIFY_SECRET` | Должна **точно совпадать** с `CF_NOTIFY_SECRET` на Vercel. |

KV-namespace `ADMINS` хранит зарегистрированные `chat_id`.

## Развёртывание

### 1. Cloudflare Worker

```bash
cd worker
npm install
npx wrangler login

# Создаём KV для chat_id админов и подставляем id в wrangler.toml.
npx wrangler kv namespace create ADMINS
# полученный id вставьте в worker/wrangler.toml вместо REPLACE_WITH_KV_NAMESPACE_ID

# Секреты (значение для TELEGRAM_BOT_TOKEN вводите интерактивно, не вставляйте в команду)
npx wrangler secret put TELEGRAM_BOT_TOKEN
openssl rand -hex 32 | tee /tmp/notify-secret | npx wrangler secret put NOTIFY_SECRET
openssl rand -hex 32 | tee /tmp/tg-webhook-secret | npx wrangler secret put TELEGRAM_WEBHOOK_TOKEN

npx wrangler deploy
```

После deploy запоминаем URL (например `https://nedelin-park-tg.<account>.workers.dev`).

### 2. Подключаем Telegram-webhook к Worker

```bash
BOT_TOKEN=<вставьте токен бота локально, никуда не коммитьте>
WORKER_URL=https://nedelin-park-tg.<account>.workers.dev
WEBHOOK_SECRET=$(cat /tmp/tg-webhook-secret)

curl "https://api.telegram.org/bot$BOT_TOKEN/setWebhook" \
  -d "url=$WORKER_URL/tg/webhook" \
  -d "secret_token=$WEBHOOK_SECRET" \
  -d 'allowed_updates=["message"]'
```

> Бот общий: на каждом webhook-запросе воркер проверяет команду — если это
> `/nedelinpark`, чат регистрируется. Все остальные сообщения молча
> игнорируются, поэтому другие сайты, подключённые к этому же боту, продолжат
> работать как раньше.

### 3. Vercel

1. Импортируйте репозиторий `SupremeGoogle/nedelin_park` в Vercel.
2. Подключите **Storage → Upstash KV** или добавьте `GITHUB_TOKEN` для сохранения через репозиторий.
3. **Settings → Environment Variables** добавьте `ADMIN_CODE`,
   `ADMIN_SESSION_SECRET`, `CF_NOTIFY_URL`, `CF_NOTIFY_SECRET`.
4. Deploy.

### 4. Подключение чата администратора

В Telegram админ открывает бота `@<имя_бота>` и отправляет команду:

```
/nedelinpark
```

Бот ответит «✅ Чат подключён». С этого момента все заявки с сайта будут
приходить именно в этот чат. Чтобы отписаться — `/stop_nedelinpark`.

## Админка сайта

* Открывается тройным способом: 5 быстрых кликов по логотипу, кнопка в правом
  нижнем углу (после первого открытия), либо хеш `/#admin`.
* Код доступа: значение `ADMIN_CODE` (по умолчанию **`nedelin062026`**).
* В админке можно редактировать любые поля: заголовки, абзацы «о нас»,
  фото/видео, список «что входит в аренду», тарифы с ценами и фото, отзывы, FAQ,
  контакты, тексты подвала.
* Если подключён KV, изменения видны сразу. Если подключён `GITHUB_TOKEN`,
  админка сохраняет `content.json` в репозиторий, а изменения появятся после
  нового деплоя — обычно примерно через минуту.

## Локальная разработка

```bash
# Сайт + API
npx vercel dev

# Worker
cd worker && npm run dev
```

Для локальной разработки воркера создайте `worker/.dev.vars`:

```
TELEGRAM_BOT_TOKEN=...
TELEGRAM_WEBHOOK_TOKEN=...
NOTIFY_SECRET=...
```
