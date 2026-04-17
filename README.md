# simple-kanban

A lightweight, self-hosted Kanban board. Single Docker container, no external dependencies.

![Go](https://img.shields.io/badge/Go-1.24+-00ADD8?logo=go) ![SQLite](https://img.shields.io/badge/SQLite-CGo--free-003B57?logo=sqlite)

## Features

- **Columns** — add, rename, delete, drag to reorder
- **Cards** — title, description, due date, category, tags; drag between columns
- **Tag Categories** — group tags into named, colored categories; colored dot on each card indicates its category
- **Tags** — user-managed with color picker; same tag name allowed across different categories
- **Filtering** — tag filter bar and category filter bar in the toolbar; selecting a category scopes the tag filter to that category's tags
- **Quick-add bar** — in the header: pick column and category, type a title, select tags, press Enter
- **Settings page** — app name, accent color, username/password, tag category and tag management
- **Enforce category restriction** — optional setting to restrict cards to only tags from their assigned category
- **Dark mode**
- **Multi-user capable** at the data layer (UI is single-user)

## Running with Docker

```yaml
# docker-compose.yml
services:
  kanban:
    image: ghcr.io/krootjes/simple-kanban:latest
    container_name: kanban
    restart: unless-stopped
    ports:
      - "8080:8080"
    volumes:
      - ./data:/app/data
    environment:
      - KANBAN_USERNAME=admin
      - KANBAN_PASSWORD=changeme
```

`KANBAN_USERNAME` and `KANBAN_PASSWORD` are only used on first boot to create the initial user. They are ignored once a user exists in the database.

```bash
docker compose up -d
```

## Building from source

```bash
go build ./...
KANBAN_PASSWORD=secret go run main.go
```

## Stack

- Go + [chi](https://github.com/go-chi/chi) router
- SQLite via [modernc.org/sqlite](https://gitlab.com/cznic/sqlite) (pure Go, no CGo)
- [SortableJS](https://sortablejs.github.io/Sortable/) for drag-and-drop
- Vanilla JS + CSS, no build step
