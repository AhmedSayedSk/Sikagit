# SikaGit

A modern, self-hosted Git GUI client built with React and Node.js. Run it locally via Docker and manage your repositories from a clean, dark-themed browser interface.

![Node.js](https://img.shields.io/badge/Node.js-22-339933?logo=node.js&logoColor=white)
![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-Ready-2496ED?logo=docker&logoColor=white)
![License](https://img.shields.io/badge/License-MIT-green)

---

## Features

- **Visual Commit Graph** — Lane-based graph rendering inspired by Sourcetree and GitKraken, with color-coded branches, merge curves, and uncommitted changes indicator
- **Inline Diff Viewer** — View file diffs with syntax-highlighted additions and deletions, with hunk-level staging and discarding
- **File Staging** — Side-by-side staged/unstaged panels with folder grouping, individual file staging, and bulk stage/unstage all
- **Project Organization** — Group multiple repositories under projects with collapsible tree view and accordion navigation
- **Remote Configuration** — Connect repositories to GitHub or any remote host directly from the settings UI
- **Commit Management** — Create commits with author identity auto-detection from local, global, or host git config
- **Branch & Tag Support** — View branches and tags inline with commit messages
- **Configurable UI** — Adjustable font sizes, diff line spacing, and theme settings
- **WSL Compatible** — Handles Windows Subsystem for Linux path resolution seamlessly
- **SQLite Storage** — Persistent local database for repos and project configurations

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, Vite, TailwindCSS 4, Zustand, Lucide Icons |
| Backend | Node.js 22, Express, Simple-git, Socket.io |
| Database | SQLite (better-sqlite3) |
| Infrastructure | Docker, Docker Compose, npm Workspaces |
| Language | TypeScript (shared types across client & server) |

## Quick Start

### Prerequisites

- [Docker](https://docs.docker.com/get-docker/) and [Docker Compose](https://docs.docker.com/compose/install/)

### Development

```bash
# Clone the repository
git clone https://github.com/AhmedSayedSk/sikagit.git
cd sikagit

# Start in development mode (hot reload enabled)
docker compose up --build
```

The app will be available at **http://localhost:3200**

### Production

```bash
# Start in production mode
docker compose -f docker-compose.prod.yml up --build -d
```

### Without Docker

```bash
# Install dependencies
npm install

# Start both client and server
npm run dev
```

- Frontend: http://localhost:3200
- API Server: http://localhost:3001

## Project Structure

```
sikagit/
├── client/                 # React frontend (Vite)
│   ├── src/
│   │   ├── components/     # UI components
│   │   │   ├── diff/       # Diff viewer
│   │   │   ├── files/      # File staging panels
│   │   │   ├── graph/      # Commit graph rendering
│   │   │   ├── layout/     # Sidebar, MainContent
│   │   │   ├── log/        # Commit list & detail
│   │   │   ├── operations/ # Dialogs (commit, settings, etc.)
│   │   │   └── ui/         # Reusable UI components
│   │   ├── lib/            # API client, utilities
│   │   └── store/          # Zustand state stores
│   └── index.html
├── server/                 # Express API server
│   └── src/
│       ├── routes/         # API route handlers
│       └── services/       # Git, DB, storage services
├── shared/                 # Shared TypeScript types
│   └── types/
├── data/                   # SQLite database (auto-created)
├── Dockerfile
├── docker-compose.yml      # Development config
└── docker-compose.prod.yml # Production config
```

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/repos` | List all repositories |
| POST | `/api/v1/repos` | Add a repository |
| DELETE | `/api/v1/repos/:id` | Remove a repository |
| GET | `/api/v1/projects` | List all projects |
| POST | `/api/v1/projects` | Create a project |
| GET | `/api/v1/git/graph` | Get commit graph with lanes |
| GET | `/api/v1/git/status` | Get repository status |
| POST | `/api/v1/git/stage` | Stage files |
| POST | `/api/v1/git/unstage` | Unstage files |
| POST | `/api/v1/git/commit` | Create a commit |
| POST | `/api/v1/git/remote-url` | Set remote origin URL |
| GET | `/api/v1/git/config` | Get git configuration |
| POST | `/api/v1/git/config` | Set git configuration |
| GET | `/api/v1/health` | Health check |

## Configuration

SikaGit stores its data in the `./data` directory (mounted as a Docker volume):

- `sikagit.db` — SQLite database containing repository bookmarks and project configurations

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `VITE_API_URL` | `http://localhost:3001` | Backend API URL (client) |
| `CORS_ORIGINS` | `http://localhost:3200` | Allowed CORS origins (server) |
| `DATA_DIR` | `/app/server/data` | Database storage path (server) |

## Scripts

```bash
npm run dev              # Run client + server concurrently
npm run build            # Build all packages
npm run lint             # Lint client and server
npm run docker:dev       # Docker Compose development
npm run docker:prod      # Docker Compose production
npm run docker:down      # Stop containers
npm run docker:logs      # View container logs
```

## License

MIT

---

Built by [Sikasio](https://sikasio.com)
