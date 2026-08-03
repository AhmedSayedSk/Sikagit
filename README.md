<div align="center">

<img src="client/public/logo-128.png" alt="SikaGit logo" width="72" height="72" />

# SikaGit

**A free, self-hosted Git GUI that runs in your browser.**

Visual commit graph, inline diffs, hunk-level staging, and AI commit messages — served from Docker, on any OS including WSL. An open-source alternative to GitKraken, Sourcetree, and GitHub Desktop that lives on your own machine.

<p>
 <a href="LICENSE"><img src="https://img.shields.io/badge/License-Source%20Available-blue?style=flat-square" alt="License" /></a>
 <a href="https://github.com/AhmedSayedSk/Sikagit/stargazers"><img src="https://img.shields.io/github/stars/AhmedSayedSk/Sikagit?style=flat-square&logo=github" alt="GitHub stars" /></a>
 <a href="https://github.com/AhmedSayedSk/Sikagit/commits"><img src="https://img.shields.io/github/last-commit/AhmedSayedSk/Sikagit?style=flat-square" alt="Last commit" /></a>
 <a href="https://github.com/AhmedSayedSk/Sikagit/pulls"><img src="https://img.shields.io/badge/PRs-welcome-brightgreen?style=flat-square" alt="PRs welcome" /></a>
 <img src="https://img.shields.io/badge/Docker-ready-2496ED?style=flat-square&logo=docker&logoColor=white" alt="Docker ready" />
 <img src="https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react&logoColor=white" alt="React 19" />
 <img src="https://img.shields.io/badge/Node.js-22-339933?style=flat-square&logo=node.js&logoColor=white" alt="Node.js 22" />
 <img src="https://img.shields.io/badge/TypeScript-5.9-3178C6?style=flat-square&logo=typescript&logoColor=white" alt="TypeScript 5.9" />
</p>

<!-- TODO: replace with a 10s GIF: commit graph → click a file → stage a hunk → AI commit message. Save as docs/demo.gif -->
<img src="docs/demo.gif" alt="SikaGit demo — commit graph, hunk staging, and AI commit messages" width="820" />

<strong><a href="https://github.com/AhmedSayedSk/Sikagit/stargazers"> Star</a> · <a href="#-quick-start"> Quick Start</a> · <a href="#-screenshots"> Screenshots</a></strong>

</div>

---

SikaGit is a self-hosted Git client with a full graphical interface that runs entirely in your browser and installs with a single `docker compose up`. It's for developers who want the clarity of a visual Git tool — commit graph, side-by-side diffs, partial staging — without a licensed desktop app, and who work across multiple repos, machines, or WSL. It exists because the polished Git GUIs are closed-source, paid, or OS-locked; SikaGit is open, free for personal use, and runs wherever Docker does.

## Why SikaGit?

| | GitKraken | Sourcetree | GitHub Desktop | **SikaGit** |
|:--|:--:|:--:|:--:|:--:|
| Free & open-source | Paid / closed | Free / closed | Free / partial | **Free & OSS** |
| Self-hosted, runs in Docker | No | No | No | **Yes** |
| Runs in the browser (any OS incl. WSL) | No | No | No | **Yes** |
| Visual commit graph | Yes | Yes | No | **Yes** |
| Hunk-level staging | Yes | Yes | Partial | **Yes** |
| AI commit messages | Paid add-on | No | No | **Yes (BYO key)** |

<sub>AI commit messages in SikaGit use your own Google Gemini API key. Competitor rows reflect their standard offerings at time of writing.</sub>

## Features

**Commit & diff**
- **Visual commit graph** — lane-based rendering with color-coded branches, merge curves, and uncommitted changes shown inline.
- **Inline diff viewer** — syntax-highlighted diffs with image preview and binary detection so the viewer never freezes on video, audio, or archives.
- **Hunk-level staging** — stage or discard individual hunks, not just whole files, straight from the diff.
- Yes **Full staging control** — staged/unstaged panels with folder grouping, bulk stage/discard, and one-click stage-all.

**AI assist** (bring your own Google Gemini key)
- **AI commit messages** — generate a commit message from your staged diff.
- **Smart commit grouping** — let AI split a messy working tree into coherent, separately-committable groups.
- **Save-for-later** — AI-suggested branch name + message to park work-in-progress on a side branch.

**Repos & branches**
- **Multi-repo projects** — group repositories under projects with a collapsible tree in the sidebar.
- **Branches, tags & merges** — switch/checkout branches, inline branch/tag labels, merge with abort, delete branches.
- **Remote operations** — push, pull (merge *or* rebase), fetch, set/test remote URLs, with automatic default-branch detection.
- **Author auto-detection** — identity pulled from local, global, or host git config.

**Runs anywhere**
- **One-command Docker setup** — `docker compose up` and open a browser tab.
- **WSL-friendly** — handles Windows Subsystem for Linux paths transparently; host repos are mounted read-through.
- **Uses your existing keys** — SSH keys from `~/.ssh` and the `gh` credential helper are mounted for remote auth.
- **Live updates** — status stays in sync over Socket.io.

## Quick start

**Prerequisites:** [Docker](https://docs.docker.com/get-docker/) with Docker Compose.

```bash
git clone https://github.com/AhmedSayedSk/Sikagit.git
cd Sikagit
docker compose up --build
```

Then open **http://localhost:3200** in your browser.

<details>
<summary>Production build</summary>

```bash
docker compose -f docker-compose.prod.yml up --build -d
```

</details>

<details>
<summary>Run without Docker (Node 22 + npm)</summary>

```bash
npm install
npm run dev
```

</details>

## Screenshots

<!-- TODO: capture the main workspace — sidebar with projects/repos + commit graph in the center. Save as docs/screenshot-graph.png -->
<img src="docs/screenshot-graph.png" alt="SikaGit commit graph and repo sidebar" width="820" />

<!-- TODO: capture the diff viewer mid-hunk-stage — a file open with one hunk highlighted and the Stage Hunk action visible. Save as docs/screenshot-diff.png -->
<img src="docs/screenshot-diff.png" alt="SikaGit inline diff viewer with hunk-level staging" width="820" />

<!-- TODO: capture the AI commit flow — staged changes with a generated commit message in the commit box. Save as docs/screenshot-ai-commit.png -->
<img src="docs/screenshot-ai-commit.png" alt="SikaGit AI-generated commit message" width="820" />

## Tech stack

| Layer | Tech |
|:--|:--|
| Frontend | React 19 · Vite 6 · TailwindCSS 4 · Zustand 5 · Radix UI · Lucide / react-icons |
| Backend | Node.js 22 · Express 4 · simple-git 3 · Socket.io 4 |
| Database | SQLite (better-sqlite3) |
| AI | Google Gemini (`gemini-2.5-pro`, bring your own API key) |
| Infra | Docker · Docker Compose · npm workspaces |
| Language | TypeScript 5.9 (types shared across client & server) |

<details>
<summary>Project structure</summary>

```
sikagit/
├── client/            React frontend (Vite)
│   └── src/
│       ├── components/  graph · diff · files · branches · log · operations · layout · ui
│       ├── lib/         API client, ANSI parser, file/repo icons
│       └── store/       Zustand state stores
├── server/            Express API server
│   └── src/
│       ├── routes/      git · repos · projects · browse · ai
│       └── services/    git, graph, db, path, ai services
├── shared/            Shared TypeScript types
├── data/              SQLite database (auto-created)
├── docker-compose.yml       # development
└── docker-compose.prod.yml  # production
```

</details>

## Contributing

PRs are welcome. Read the [Contributing Guide](docs/CONTRIBUTING.md) to get a dev environment running and to learn the workflow, then look for issues labelled [`good first issue`](https://github.com/AhmedSayedSk/Sikagit/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22) to get started.

- [Report a bug](https://github.com/AhmedSayedSk/Sikagit/issues/new?template=bug_report.md)
- [Request a feature](https://github.com/AhmedSayedSk/Sikagit/issues/new?template=feature_request.md)
- [Code of Conduct](docs/CODE_OF_CONDUCT.md) · [Security Policy](docs/SECURITY.md)

---

 **If SikaGit saves you time, please star it — it genuinely helps others find it.**

## License

SikaGit is released under the [Sikasio Source Available License](LICENSE). Free for personal use; commercial use requires a license from [Sikasio](https://sikasio.com).

<div align="center">
<sub>Built by <a href="https://sikasio.com"><strong>Sikasio</strong></a> — a design & development studio from Cairo, Egypt.</sub>
</div>
