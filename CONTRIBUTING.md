# Contributing to TeamSpeak to Discord Bridge

Thank you for your interest in contributing! This document provides guidelines for contributing to the project.

## 🚀 Getting Started

### Prerequisites

- **Node.js** 20+ (LTS recommended)
- **npm** 10+
- **Git**
- **Docker** & **Docker Compose** (optional, for containerized development)

### Development Setup

1. **Fork the repository** on GitHub
2. **Clone your fork** locally:
   ```bash
   git clone https://github.com/YOUR_USERNAME/Team-Speak-To-Discord.git
   cd Team-Speak-To-Discord
   ```
3. **Install dependencies**:
   ```bash
   npm ci
   ```
4. **Set up configuration**:
   ```bash
   cp config/example.env .env
   # Edit .env with your credentials
   ```
5. **Generate Prisma client**:
   ```bash
   npx prisma generate
   ```
6. **Start development server**:
   ```bash
   npm run dev
   ```

## 📝 Development Workflow

### Branch Naming

Use descriptive branch names with prefixes:

| Prefix | Purpose | Example |
|--------|---------|---------|
| `feat/` | New features | `feat/add-noise-suppression` |
| `fix/` | Bug fixes | `fix/ts-reconnection-loop` |
| `docs/` | Documentation | `docs/update-api-docs` |
| `refactor/` | Code refactoring | `refactor/audio-pipeline` |
| `perf/` | Performance improvements | `perf/optimize-opus-encoding` |
| `test/` | Test additions | `test/integration-user-linking` |
| `chore/` | Maintenance | `chore/update-dependencies` |

### Commit Messages

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>[optional scope]: <description>

[optional body]

[optional footer(s)]
```

**Types:**
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation only
- `style`: Code style changes (formatting, etc.)
- `refactor`: Code change that neither fixes a bug nor adds a feature
- `perf`: Performance improvement
- `test`: Adding missing tests
- `chore`: Maintenance tasks
- `build`: Build system changes
- `ci`: CI configuration changes

**Examples:**
```
feat(audio): add adaptive bitrate support for Opus encoding

Implements dynamic bitrate adjustment based on network conditions
to maintain audio quality during congestion.

Closes #123
```

```
fix(teamspeak): resolve reconnection loop on query timeout

The client now properly handles query timeouts by implementing
exponential backoff with jitter instead of immediate retry.

Fixes #456
```

### Pull Request Process

1. **Create a feature branch** from `develop`
2. **Make your changes** with tests
3. **Run quality checks**:
   ```bash
   npm run lint
   npm run typecheck
   npm run test
   ```
4. **Update documentation** if needed
5. **Push to your fork** and create a Pull Request
6. **Fill out the PR template** completely
7. **Wait for review** - address feedback promptly

### PR Requirements

- ✅ All CI checks pass
- ✅ Code follows style guidelines (Biome + ESLint)
- ✅ TypeScript compiles without errors (`npm run typecheck`)
- ✅ Tests pass (`npm run test`)
- ✅ New features have tests
- ✅ Documentation updated
- ✅ No breaking changes without major version bump

## 🧪 Testing

### Running Tests

```bash
# All tests
npm run test

# Unit tests only
npm run test:unit

# Integration tests
npm run test:integration

# With coverage
npm run test:coverage
```

### Writing Tests

- Place unit tests in `tests/unit/`
- Place integration tests in `tests/integration/`
- Use descriptive test names: `should handle reconnection with exponential backoff`
- Mock external dependencies (Discord API, TeamSpeak Query)
- Test both success and error paths

## 🎨 Code Style

### Formatting & Linting

We use **Biome** for formatting and **ESLint** for linting:

```bash
# Check and fix formatting
npm run lint

# Format only
npm run format

# Type checking
npm run typecheck
```

### TypeScript Guidelines

- **Strict mode** enabled - no `any` types
- Use `interface` for object shapes, `type` for unions/aliases
- Prefer `const` over `let`
- Use explicit return types for public functions
- Avoid `!!` assertions - handle null/undefined properly
- Use Zod schemas for runtime validation

### Import Order

```typescript
// 1. Node.js built-ins
import { readFileSync } from 'node:fs';

// 2. External packages
import { Client } from 'discord.js';

// 3. Internal modules (absolute paths)
import { ConfigSchema } from '@/config/schema';

// 4. Relative imports
import { createLogger } from '../utils/logger';
```

## 🐛 Reporting Bugs

Before reporting a bug:

1. **Search existing issues** to avoid duplicates
2. **Check the latest version** - your issue may be fixed
3. **Try to reproduce** with minimal configuration

### Bug Report Template

```markdown
**Describe the bug**
A clear and concise description of what the bug is.

**To Reproduce**
Steps to reproduce the behavior:
1. Go to '...'
2. Click on '....'
3. Scroll down to '....'
4. See error

**Expected behavior**
A clear and concise description of what you expected to happen.

**Logs/Screenshots**
If applicable, add logs or screenshots to help explain your problem.

**Environment:**
- OS: [e.g. Ubuntu 22.04, Windows 11]
- Node.js version: [e.g. 20.12.0]
- Bridge version: [e.g. 0.1.0]
- TeamSpeak version: [e.g. 3.13.7]
- Deployment: [Docker / Bare metal]

**Additional context**
Any other context about the problem.
```

## 💡 Feature Requests

We welcome feature requests! Please:

1. **Check existing issues/discussions** first
2. **Describe the problem** you're trying to solve
3. **Explain your proposed solution**
4. **Consider alternatives** you've evaluated

## 🔒 Security

If you discover a security vulnerability:

1. **DO NOT** create a public issue
2. **Email** security@3bdelrahmanashraf.com (or use GitHub Security Advisories)
3. **Include** details about the vulnerability and steps to reproduce

## 📚 Resources

- [TypeScript Handbook](https://www.typescriptlang.org/docs/handbook/intro.html)
- [Discord.js Guide](https://discordjs.guide/)
- [TeamSpeak 3 Query Manual](https://teamspeak.com/en/developer/docs/)
- [Prisma Documentation](https://www.prisma.io/docs/)
- [Biome Documentation](https://biomejs.dev/)
- [Conventional Commits](https://www.conventionalcommits.org/)

## 🙏 Recognition

Contributors will be recognized in:
- `CONTRIBUTORS.md` file
- Release notes
- GitHub contributors graph

Thank you for contributing! 🎉