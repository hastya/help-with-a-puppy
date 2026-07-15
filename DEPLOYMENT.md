# 📦 Инструкция по развёртыванию «Help with a puppy»

Подробное руководство по установке и запуску приложения — от локальной машины
до production-сервера. Выберите подходящий способ:

1. [Локальный запуск (разработка)](#1-локальный-запуск-разработка)
2. [Запуск в Docker (рекомендуется)](#2-запуск-в-docker-рекомендуется)
3. [Развёртывание на VPS/сервере (systemd + Nginx)](#3-развёртывание-на-vpsсервере-systemd--nginx)
4. [Развёртывание в облаке (PaaS)](#4-развёртывание-в-облаке-paas)
5. [Переменные окружения](#5-переменные-окружения)
6. [Резервное копирование и обновление](#6-резервное-копирование-и-обновление)
7. [Диагностика проблем](#7-диагностика-проблем)

---

## Предварительные требования

| Компонент | Версия | Проверка |
|-----------|--------|----------|
| **Node.js** | ≥ 18 (рекомендуется 20 LTS) | `node --version` |
| **npm** | ≥ 9 | `npm --version` |
| **git** | любая | `git --version` |
| Компилятор C++ | для сборки `better-sqlite3` | обычно уже есть; на Linux — `build-essential`, `python3` |

> База данных **не требует установки** — используется встроенный SQLite,
> файл создаётся автоматически при первом запуске.

---

## 1. Локальный запуск (разработка)

```bash
# 1. Клонировать репозиторий
git clone https://github.com/hastya/help-with-a-puppy.git
cd help-with-a-puppy

# 2. Установить зависимости (postinstall скопирует Chart.js в public/vendor)
npm install

# 3. (необязательно) настроить окружение
cp .env.example .env
# отредактируйте .env — как минимум задайте JWT_SECRET

# 4. Запустить
npm start
```

Приложение будет доступно на **<http://localhost:3000>**.

Режим авто-перезапуска при изменении файлов:

```bash
npm run dev      # использует встроенный node --watch
```

Проверка работоспособности:

```bash
curl http://localhost:3000/api/health
# {"status":"ok","time":"..."}
```

---

## 2. Запуск в Docker (рекомендуется)

Самый простой способ получить воспроизводимое окружение. Требуется установленный
**Docker** (и **Docker Compose**).

### Вариант A — Docker Compose (одна команда)

```bash
git clone https://github.com/hastya/help-with-a-puppy.git
cd help-with-a-puppy

# ВАЖНО: откройте docker-compose.yml и замените JWT_SECRET на случайную строку
#   node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"

docker compose up -d --build
```

Приложение поднимется на <http://localhost:3000>. База данных сохраняется в
именованном томе `puppy-data`, поэтому переживает перезапуски контейнера.

Управление:

```bash
docker compose logs -f      # логи
docker compose restart      # перезапуск
docker compose down         # остановить (данные в томе сохраняются)
docker compose down -v      # остановить И удалить данные
```

### Вариант B — «голый» Docker

```bash
docker build -t help-with-a-puppy .

docker run -d --name puppy \
  -p 3000:3000 \
  -e JWT_SECRET="$(node -e "console.log(require('crypto').randomBytes(48).toString('hex'))")" \
  -v puppy-data:/app/data \
  --restart unless-stopped \
  help-with-a-puppy
```

Контейнер содержит `HEALTHCHECK` — состояние видно в `docker ps` (healthy/unhealthy).

---

## 3. Развёртывание на VPS/сервере (systemd + Nginx)

Инструкция для Ubuntu/Debian. Приложение запускается как systemd-сервис, а
Nginx выступает reverse-proxy c HTTPS.

### 3.1. Установить Node.js 20

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs build-essential python3
```

### 3.2. Развернуть приложение

```bash
sudo mkdir -p /opt/help-with-a-puppy
sudo chown "$USER" /opt/help-with-a-puppy
git clone https://github.com/hastya/help-with-a-puppy.git /opt/help-with-a-puppy
cd /opt/help-with-a-puppy
npm install --omit=dev

# Создать .env с production-настройками
cat > .env <<EOF
PORT=3000
JWT_SECRET=$(node -e "console.log(require('crypto').randomBytes(48).toString('hex'))")
DB_PATH=/opt/help-with-a-puppy/data/app.db
EOF
```

### 3.3. Создать systemd-сервис

```bash
sudo tee /etc/systemd/system/puppy.service > /dev/null <<'EOF'
[Unit]
Description=Help with a puppy web app
After=network.target

[Service]
Type=simple
WorkingDirectory=/opt/help-with-a-puppy
ExecStart=/usr/bin/node server/index.js
Restart=always
RestartSec=5
Environment=NODE_ENV=production
# Пользователь без лишних прав (создайте: sudo useradd -r -s /usr/sbin/nologin puppy)
User=puppy
Group=puppy

[Install]
WantedBy=multi-user.target
EOF

# Права на каталог для пользователя сервиса
sudo useradd -r -s /usr/sbin/nologin puppy 2>/dev/null || true
sudo chown -R puppy:puppy /opt/help-with-a-puppy

sudo systemctl daemon-reload
sudo systemctl enable --now puppy
sudo systemctl status puppy      # должно быть active (running)
```

### 3.4. Настроить Nginx + HTTPS

```bash
sudo apt-get install -y nginx
sudo tee /etc/nginx/sites-available/puppy > /dev/null <<'EOF'
server {
    listen 80;
    server_name puppy.example.com;   # ← ваш домен

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
EOF

sudo ln -s /etc/nginx/sites-available/puppy /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx

# Бесплатный TLS-сертификат Let's Encrypt
sudo apt-get install -y certbot python3-certbot-nginx
sudo certbot --nginx -d puppy.example.com
```

Готово — приложение доступно по HTTPS на вашем домене.

---

## 4. Развёртывание в облаке (PaaS)

Приложение — обычный Node.js-сервис, слушающий `process.env.PORT`. Оно работает
на большинстве PaaS без изменений.

**Общие настройки для любой платформы:**

- **Build command:** `npm install`
- **Start command:** `npm start`
- **Переменные окружения:** `JWT_SECRET` (обязательно), при необходимости `DB_PATH`

### Render / Railway / Fly.io

1. Подключите GitHub-репозиторий.
2. Укажите build `npm install`, start `npm start`.
3. Добавьте переменную `JWT_SECRET`.
4. **Важно:** SQLite хранит данные в файле. Подключите **persistent volume**
   (диск) и укажите `DB_PATH` внутри него (например, `/data/app.db`), иначе
   данные будут теряться при каждом деплое.

### Heroku-подобные платформы с эфемерной ФС

На платформах без постоянного диска файловая система стирается при рестарте.
Для production в таком случае вынесите данные на постоянный том или мигрируйте
хранилище на PostgreSQL (см. [Масштабирование](#масштабирование-на-postgresql)).

---

## 5. Переменные окружения

| Переменная | Обязательна | По умолчанию | Описание |
|------------|:-----------:|--------------|----------|
| `PORT` | нет | `3000` | Порт HTTP-сервера |
| `JWT_SECRET` | **да (prod)** | случайная строка | Секрет для подписи JWT. Если не задан — генерируется при старте, и все сессии сбрасываются при перезапуске |
| `DB_PATH` | нет | `./data/app.db` | Путь к файлу базы SQLite |

Генерация надёжного секрета:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

Приложение автоматически читает файл `.env` в корне проекта (если он есть).
Уже установленные переменные окружения имеют приоритет над `.env`.

---

## 6. Резервное копирование и обновление

### Бэкап

Все данные лежат в одном файле SQLite (по умолчанию `data/app.db`). Достаточно
скопировать его (лучше при остановленном сервисе, либо использовать
онлайн-бэкап SQLite):

```bash
# Простой бэкап
cp data/app.db backups/app-$(date +%F).db

# Консистентный бэкап без остановки (нужен sqlite3 CLI)
sqlite3 data/app.db ".backup 'backups/app-$(date +%F).db'"
```

Пользователи также могут выгрузить свои данные из интерфейса:
**Настройки → Экспорт всех данных** (JSON) или **Отчётность → Экспорт CSV**.

### Обновление до новой версии

```bash
cd /opt/help-with-a-puppy
git pull
npm install --omit=dev      # обновит зависимости и Chart.js
sudo systemctl restart puppy    # или: docker compose up -d --build
```

Схема базы создаётся идемпотентно (`CREATE TABLE IF NOT EXISTS`), а справочник
пород обновляется при каждом старте — миграции вручную не требуются.

---

## 7. Диагностика проблем

| Симптом | Причина и решение |
|---------|-------------------|
| `Error: Cannot find module 'better-sqlite3'` | Не установлены зависимости — выполните `npm install`. На Linux нужны `build-essential` и `python3`. |
| Графики не отображаются | Файл `public/vendor/chart.umd.js` не скопирован. Запустите `node scripts/copy-vendor.js` или переустановите зависимости. |
| `EADDRINUSE :3000` | Порт занят. Задайте другой: `PORT=8080 npm start`. |
| Пользователей «разлогинивает» после рестарта | Не задан фиксированный `JWT_SECRET` — задайте его в `.env`/окружении. |
| `SQLITE_CANTOPEN` / нет прав на запись | Каталог из `DB_PATH` недоступен для записи. Проверьте владельца каталога `data/`. |
| Данные исчезают после деплоя в облаке | Эфемерная ФС — подключите постоянный том и укажите `DB_PATH` на нём. |
| `502 Bad Gateway` в Nginx | Node-сервис не запущен: `sudo systemctl status puppy`, смотрите логи `journalctl -u puppy -f`. |

Просмотр логов:

```bash
# systemd
journalctl -u puppy -f

# docker
docker compose logs -f
```

---

## Масштабирование на PostgreSQL

Для высоконагруженного production (много одновременных записей, горизонтальное
масштабирование) SQLite можно заменить на PostgreSQL, как предусмотрено
исходным ТЗ. Слой доступа к данным изолирован в `server/db.js` и роутах —
потребуется адаптировать запросы под драйвер `pg`. Для типичного личного или
семейного использования SQLite полностью достаточно.

---

Вопросы и предложения — через **Issues** в репозитории. Удачного развёртывания! 🐾
