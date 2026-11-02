# China Replicas

Интерактивный атлас копий мировых достопримечательностей в Китае. Рабочее название можно изменить.

Подготовлены React + TypeScript + Vite, Leaflet, подключение Supabase, схема БД с RLS, очередь импорта, тесты доступа и GitHub Actions. Публичных объектов пока нет: архив и результаты исследования ещё не загружены. Импортёр, авторизация в интерфейсе и админка — следующие этапы.

## Быстрый запуск

Требуется Node.js 22.14+ в ветке 22 (или Node.js 24+) и npm.

```sh
npm ci
npm run dev
```

Открыть http://localhost:5173. Без `.env.local` работает карта с пустым каталогом. Тайлы требуют интернет. Не подключайте служебные ключи в переменные `VITE_*`: они попадают в браузер.

## Локальная база

Запустите Docker Desktop. Затем:

```sh
npm run db:start
npm run db:status
cp .env.example .env.local
```

Скопируйте URL API и публичный publishable key (либо локальный legacy anon key) из локального Supabase в `VITE_SUPABASE_URL` и `VITE_SUPABASE_PUBLISHABLE_KEY`. Не используйте service_role/secret key. Перезапустите Vite после изменения переменных. Если используете legacy anon key, можно передать его в ту же переменную.

CLI применяет миграции и seed при первом запуске. Studio: http://127.0.0.1:54323. Для повторного применения миграций к **одноразовой локальной базе**:

```sh
npm run db:reset
npm run db:types
```

`db:reset` удаляет локальные данные. Облачная база этим скриптом не затрагивается (`--local`). `db:types` создаёт типы после запуска базы; frontend пока валидирует ответы API схемой Zod.

Для остановки с сохранением локальных данных: `npm run db:stop`.

## Проверки

```sh
npm run check
```

TypeScript, PostgreSQL-тесты миграций/RLS и production-сборка. Тесты запускаются через PGlite без Docker: в настоящем PostgreSQL движке создаётся минимальная модель `auth.users` и `auth.uid()`. Это проверяет SQL, права ролей и ограничения, но не заменяет интеграционные проверки Auth, REST API и Storage на Supabase.

GitHub Actions повторит проверки при PR и push в main. Секреты CI для этих проверок не нужны.

## Структура

```text
src/app/                       приложение и стили
src/features/map/              карта Leaflet
src/features/attractions/      загрузка и валидация объектов
src/shared/lib/                клиент Supabase
supabase/migrations/           версия схемы и правила доступа
supabase/seed.sql              категории, без вымышленных мест
scripts/                       генерация типов
tests/                        тесты миграций и границ доступа
docs/                         архитектура и подключение облака
```

## Облако и совместная работа

См. [инструкцию подключения](docs/SETUP.md) и [архитектуру](docs/ARCHITECTURE.md). Эта заготовка не создаёт платных ресурсов. Созданы [GitHub-репозиторий](https://github.com/MaxFolmer/china_replicas) и [проект Supabase](https://supabase.com/dashboard/project/wxdpvxygeyieyurdqbup). Для подключения базы нужны вход в аккаунт, применение миграций и публичный ключ. Хостинг ещё не подключён.

Документация: [Vite](https://vite.dev/guide/), [локальная разработка Supabase](https://supabase.com/docs/guides/local-development/cli-workflows), [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security).
