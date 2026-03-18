# Contributing to SikaGit

Thanks for your interest in contributing to SikaGit! This guide will help you get started.

## Before You Start

By submitting a contribution, you agree that your work will be licensed under the [Sikasio Source Available License](LICENSE) and that you assign copyright of your contributions to Sikasio.

## Development Setup

### Prerequisites

- [Docker](https://docs.docker.com/get-docker/) & [Docker Compose](https://docs.docker.com/compose/install/)
- [Node.js 22+](https://nodejs.org/) (for running without Docker)

### Running Locally

```bash
# Clone your fork
git clone https://github.com/YOUR_USERNAME/sikagit.git
cd sikagit

# Copy environment variables
cp .env.example .env

# Start with Docker (recommended)
docker compose up --build

# Or without Docker
npm install
npm run dev
```

- **Client:** http://localhost:3200
- **API Server:** http://localhost:3001

### Project Structure

```
sikagit/
├── client/     # React frontend (Vite, TailwindCSS, Zustand)
├── server/     # Express API (Simple-git, Socket.io, SQLite)
├── shared/     # Shared TypeScript types
└── data/       # SQLite database (auto-created, gitignored)
```

## How to Contribute

### Reporting Bugs

1. Check [existing issues](https://github.com/AhmedSayedSk/sikagit/issues) first
2. Open a new issue using the **Bug Report** template
3. Include steps to reproduce, expected behavior, and screenshots if possible

### Suggesting Features

1. Open an issue using the **Feature Request** template
2. Describe the use case and why it would be useful

### Submitting Code

1. **Fork** the repository
2. **Create a branch** from `master`:
   ```bash
   git checkout -b feat/your-feature
   ```
3. **Make your changes** — keep commits focused and atomic
4. **Test** your changes locally
5. **Push** to your fork and open a **Pull Request**

### Branch Naming

| Prefix | Use |
|:-------|:----|
| `feat/` | New features |
| `fix/` | Bug fixes |
| `docs/` | Documentation |
| `refactor/` | Code refactoring |
| `chore/` | Build, CI, tooling |

### Commit Messages

Use clear, descriptive commit messages:

```
feat: add branch comparison view
fix: resolve diff viewer crash on binary files
docs: update API reference for run endpoints
```

## Code Guidelines

- **TypeScript** — All code must be typed. Avoid `any` where possible.
- **Formatting** — Run `npm run lint` before committing.
- **Components** — Keep React components small and focused. Use Zustand for shared state.
- **API routes** — Follow the existing pattern in `server/src/routes/`.
- **No secrets** — Never commit API keys, tokens, or credentials.

## Pull Request Checklist

- [ ] Code compiles without errors
- [ ] Linting passes (`npm run lint`)
- [ ] Changes work in Docker (`docker compose up --build`)
- [ ] New features include relevant documentation updates
- [ ] PR description explains what changed and why

## Need Help?

- Open a [Discussion](https://github.com/AhmedSayedSk/sikagit/discussions) for questions
- Email us at info@sikasio.com

Thanks for helping make SikaGit better!
