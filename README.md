<p align="center">
  <img src="client/public/logo-128.png" alt="SikaGit — Self-Hosted Git GUI Client" width="64" height="64" />
</p>

<h1 align="center">SikaGit — Self-Hosted Git GUI for Developers</h1>

<p align="center">
  <strong>The open-source, self-hosted Git GUI client you run in Docker.</strong><br/>
  Visual commit graph, inline diff viewer, hunk-level staging, built-in terminal, AI commit messages — all from your browser.<br/>
  A free alternative to GitKraken, Sourcetree, and GitHub Desktop that runs on your own machine.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Node.js-22-339933?style=flat-square&logo=node.js&logoColor=white" alt="Node.js" />
  <img src="https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react&logoColor=white" alt="React" />
  <img src="https://img.shields.io/badge/TypeScript-5.9-3178C6?style=flat-square&logo=typescript&logoColor=white" alt="TypeScript" />
  <img src="https://img.shields.io/badge/Docker-Ready-2496ED?style=flat-square&logo=docker&logoColor=white" alt="Docker" />
  <img src="https://img.shields.io/badge/License-Source%20Available-blue?style=flat-square" alt="License" />
</p>

---

## Why SikaGit?

| | GitKraken | Sourcetree | GitHub Desktop | **SikaGit** |
|:--|:----------|:-----------|:---------------|:------------|
| Self-hosted | No | No | No | **Yes** |
| Runs in Docker | No | No | No | **Yes** |
| Visual commit graph | Yes | Yes | No | **Yes** |
| Hunk-level staging | Yes | Yes | No | **Yes** |
| Built-in terminal | No | No | No | **Yes** |
| AI commit messages | No | No | No | **Yes** |
| Run dev servers | No | No | No | **Yes** |
| Free for personal use | Limited | Yes | Yes | **Yes** |
| Open source | No | No | Partial | **Yes** |

---

## Getting Started

### Prerequisites

- [Docker](https://docs.docker.com/get-docker/) & [Docker Compose](https://docs.docker.com/compose/install/)

### Development

```bash
git clone https://github.com/AhmedSayedSk/sikagit.git
cd sikagit
docker compose up --build
```

> Open **http://localhost:3200** in your browser.

### Production

```bash
docker compose -f docker-compose.prod.yml up --build -d
```

### Without Docker

```bash
npm install
npm run dev
```

---

## Features — What Can SikaGit Do?

### Git Operations
- **Visual Commit Graph** — Lane-based rendering with color-coded branches, merge curves, and uncommitted changes
- **Inline Diff Viewer** — Syntax-highlighted diffs with hunk-level staging and discarding
- **File Staging** — Staged/unstaged panels with folder grouping and bulk actions
- **Commit Management** — Author identity auto-detection from local, global, or host git config
- **Branch & Tag Support** — Inline branch/tag labels with automatic remote default branch detection
- **Remote Operations** — Push, pull (merge or rebase), fetch, and remote URL configuration

### Project Management
- **Multi-Repo Organization** — Group repositories under projects with collapsible tree navigation
- **Run & Build** — Execute dev servers and builds with real-time terminal streaming
- **Process Monitoring** — Live CPU/memory stats, port auto-detection, and lifecycle management
- **AI Commits** — Generate commit messages and smart commit grouping from staged changes

### Developer Experience
- **HMR in Docker** — Polling-based file watching for Next.js, Vite, CRA, Angular
- **Binary Detection** — Prevents diff viewer freeze on video, audio, and archive files
- **WSL Compatible** — Seamless Windows Subsystem for Linux path handling
- **Clickable URLs** — Ctrl+Click terminal links to open in browser

---

## Ports & Networking

| Service | Port | Description |
|:--------|:-----|:------------|
| **Client** | `3200` | Web interface |
| **API Server** | `3001` | Express + Socket.io |

<details>
<summary><strong>Reserved Dev Server Ports</strong></summary>

The following ports are mapped through Docker so dev servers started by SikaGit are accessible from your host browser:

| Ports | Typical Use |
|:------|:------------|
| `3000`, `3002`-`3010`, `3220` | React, Next.js, Node.js |
| `4200` | Angular |
| `5000`-`5001` | Flask, .NET |
| `8080`-`8090` | Spring, Go, General |
| `9000` | PHP, Portainer |

</details>

---

## Configuration & Environment Variables

| Variable | Default | Description |
|:---------|:--------|:------------|
| `PORT` | `3001` | API server port |
| `CORS_ORIGINS` | `http://localhost:3200` | Allowed CORS origins |
| `DATA_DIR` | `/app/server/data` | SQLite database path |
| `VITE_API_URL` | `http://server:3001` | Backend URL (client in Docker) |
| `GIT_SSH_COMMAND` | `ssh -o StrictHostKeyChecking=no` | SSH config for remotes |
| `AZURE_DEVOPS_PAT` | — | Azure DevOps token (optional) |

---

## Usage — How to Use SikaGit

<details>
<summary><strong>Adding a Repository</strong></summary>

1. Click **+** in the sidebar
2. Browse to your repository folder or paste the path
3. The repo appears in the sidebar with its git status

</details>

<details>
<summary><strong>Organizing with Projects</strong></summary>

1. Click **New Project** in the sidebar
2. Name your project and select repositories to include
3. Repos are grouped under the project with a collapsible view

</details>

<details>
<summary><strong>Committing Changes</strong></summary>

1. Select a repository from the sidebar
2. Review changed files in the **Unstaged** panel
3. Stage files individually or click **Stage All**
4. Click a file to view its diff — use **Stage Hunk** for partial staging
5. Write your commit message and click **Commit**

</details>

<details>
<summary><strong>Running Dev Servers</strong></summary>

1. Open repo settings and set a **Run Command** (e.g., `npx next dev`)
2. Optionally set a fixed **Port** to avoid conflicts
3. Click **Play** — terminal output streams in real-time
4. URLs in output are clickable (Ctrl+Click to open in browser)
5. HMR works automatically via polling-based file watching

</details>

<details>
<summary><strong>Remote Operations</strong></summary>

1. Configure the remote URL in repository settings
2. Use **Push**, **Pull**, or **Fetch** from the toolbar
3. Pull supports both merge and rebase strategies
4. SSH keys from `~/.ssh` are automatically mounted into Docker

</details>

---

## Tech Stack

```
Frontend    React 19  ·  Vite 6  ·  TailwindCSS 4  ·  Zustand  ·  Radix UI  ·  Lucide Icons
Backend     Node.js 22  ·  Express  ·  Simple-git  ·  Socket.io
Database    SQLite (better-sqlite3)
Infra       Docker  ·  Docker Compose  ·  npm Workspaces
Language    TypeScript 5.9 (shared types across client & server)
```

---

## Project Structure

```
sikagit/
├── client/                  React frontend (Vite)
│   └── src/
│       ├── components/
│       │   ├── diff/        Diff viewer & image preview
│       │   ├── files/       File staging panels
│       │   ├── graph/       Commit graph rendering
│       │   ├── layout/      Sidebar, MainContent
│       │   ├── log/         Commit list & detail
│       │   ├── operations/  Dialogs (commit, settings)
│       │   └── ui/          Reusable primitives
│       ├── lib/             API client, ANSI parser
│       └── store/           Zustand state stores
│
├── server/                  Express API server
│   └── src/
│       ├── routes/          git, repos, projects, run, browse, ai
│       └── services/        Git, DB, storage services
│
├── shared/                  Shared TypeScript types
├── data/                    SQLite database (auto-created)
├── docker-compose.yml       Development
└── docker-compose.prod.yml  Production
```

---

<details>
<summary><strong>API Reference</strong></summary>

### Repositories

| Method | Endpoint | Description |
|:-------|:---------|:------------|
| `GET` | `/api/v1/repos` | List all repositories |
| `POST` | `/api/v1/repos` | Add a repository |
| `PATCH` | `/api/v1/repos/:id` | Update repo settings |
| `DELETE` | `/api/v1/repos/:id` | Remove a repository |

### Projects

| Method | Endpoint | Description |
|:-------|:---------|:------------|
| `GET` | `/api/v1/projects` | List all projects |
| `POST` | `/api/v1/projects` | Create a project |
| `PATCH` | `/api/v1/projects/:id` | Update project |
| `DELETE` | `/api/v1/projects/:id` | Delete a project |

### Git

| Method | Endpoint | Description |
|:-------|:---------|:------------|
| `GET` | `/api/v1/git/graph` | Commit graph with lane rendering |
| `GET` | `/api/v1/git/status` | Detailed file status |
| `GET` | `/api/v1/git/status-summary` | Batch status (multiple repos) |
| `GET` | `/api/v1/git/branches` | Branches and tags |
| `GET` | `/api/v1/git/config` | Git configuration |
| `POST` | `/api/v1/git/config` | Set config values |
| `POST` | `/api/v1/git/stage` | Stage files |
| `POST` | `/api/v1/git/unstage` | Unstage files |
| `POST` | `/api/v1/git/stage-hunk` | Stage a diff hunk |
| `POST` | `/api/v1/git/discard-hunk` | Discard a diff hunk |
| `POST` | `/api/v1/git/commit` | Create a commit |
| `POST` | `/api/v1/git/push` | Push to remote |
| `POST` | `/api/v1/git/pull` | Pull (merge or rebase) |
| `POST` | `/api/v1/git/fetch` | Fetch from remote |
| `POST` | `/api/v1/git/remote-url` | Set remote URL |
| `POST` | `/api/v1/git/test-remote` | Test remote connection |
| `GET` | `/api/v1/git/diff` | File diff |
| `GET` | `/api/v1/git/file` | File content at commit |

### Run & Build

| Method | Endpoint | Description |
|:-------|:---------|:------------|
| `POST` | `/api/v1/run/:id/start` | Start dev server |
| `POST` | `/api/v1/run/:id/stop` | Stop dev server |
| `GET` | `/api/v1/run/:id/status` | Process status & port |
| `GET` | `/api/v1/run/:id/output` | Buffered terminal output |
| `POST` | `/api/v1/run/:id/build` | Start build |
| `POST` | `/api/v1/run/:id/build/stop` | Stop build |

### Real-time Events (Socket.io)

| Event | Description |
|:------|:------------|
| `run:output:{repoId}` | Terminal output lines |
| `run:port:{repoId}` | Detected dev server port |
| `run:stats:{repoId}` | CPU/memory (every 2s) |
| `run:exit:{repoId}` | Process exit code |

</details>

<details>
<summary><strong>Scripts</strong></summary>

```bash
# Development
npm run dev                  # Client + server with hot reload
npm run docker:dev           # Docker Compose (foreground)
npm run docker:dev:detach    # Docker Compose (background)

# Production
npm run build                # Build all packages
npm run docker:prod          # Production (foreground)
npm run docker:prod:detach   # Production (background)

# Utilities
npm run lint                 # Lint client and server
npm run docker:down          # Stop containers
npm run docker:logs          # Tail logs
```

</details>

---

## Contributing

We welcome contributions! Please read our [Contributing Guide](CONTRIBUTING.md) before submitting a pull request.

- [Report a Bug](https://github.com/AhmedSayedSk/sikagit/issues/new?template=bug_report.md)
- [Request a Feature](https://github.com/AhmedSayedSk/sikagit/issues/new?template=feature_request.md)
- [Read the Code of Conduct](CODE_OF_CONDUCT.md)
- [Security Policy](SECURITY.md)

---

## License

SikaGit is released under the [Sikasio Source Available License](LICENSE).
Free for personal use. Commercial use requires a license from [Sikasio](https://sikasio.com).

---

## Keywords

`git gui` · `git client` · `self-hosted git` · `docker git gui` · `visual commit graph` · `diff viewer` · `git staging tool` · `gitkraken alternative` · `sourcetree alternative` · `github desktop alternative` · `open source git gui` · `react git client` · `node.js git gui` · `wsl git gui` · `ai commit messages` · `git branch visualization` · `hunk staging` · `dev server manager` · `docker developer tools`

<p align="center">
  Built by <a href="https://sikasio.com"><strong>Sikasio</strong></a> — A design & development studio from Cairo, Egypt.
</p>
