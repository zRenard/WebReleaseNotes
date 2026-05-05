# Web Release Notes — Setup Tutorial

A complete, step-by-step guide to installing, configuring, and using **Web Release Notes**.

> **Live demo:** https://zrenard.github.io/WebReleaseNotes/

---

## Table of Contents

1. [What is Web Release Notes?](#1-what-is-web-release-notes)
2. [Prerequisites](#2-prerequisites)
3. [Step 1 — Clone the repository](#step-1--clone-the-repository)
4. [Step 2 — Install Python dependencies](#step-2--install-python-dependencies)
5. [Step 3 — Install Node.js dependencies](#step-3--install-nodejs-dependencies)
6. [Step 4 — Generate release notes data](#step-4--generate-release-notes-data)
7. [Step 5 — Start the local server](#step-5--start-the-local-server)
8. [Step 6 — Explore the web interface](#step-6--explore-the-web-interface)
9. [Step 7 — Generate Markdown output (optional)](#step-7--generate-markdown-output-optional)
10. [Step 8 — Deploy to GitHub Pages (optional)](#step-8--deploy-to-github-pages-optional)
11. [CLI Reference](#cli-reference)
12. [Troubleshooting](#troubleshooting)

---

## 1. What is Web Release Notes?

Web Release Notes turns **Git commit history** into a beautiful, interactive release notes page — automatically.

```
┌──────────────────────────────────────────────────────────────┐
│  Git Repository                                              │
│  (commits + tags)                                            │
│        │                                                     │
│        ▼                                                     │
│  release_notes.py  ──►  release_notes.json  ──►  Web page   │
│  (Python script)         (data file)              (Node.js)  │
└──────────────────────────────────────────────────────────────┘
```

Key capabilities:

| Feature | Description |
|---|---|
| Commit view | See every commit individually, sorted chronologically |
| Release view | Group commits by SemVer tags (`v1.0.0`, `v2.3.1`, …) |
| Virtual "Incoming" | Uncommitted/unreleased commits are grouped automatically |
| Auto-classification | Commits tagged with `feat:`, `fix:`, `docs:`, etc. are sorted into categories |
| Search & filter | Filter by type, author, date, or free text |
| Dark / Light theme | Toggle from the toolbar |
| Markdown export | Generate a `.md` version alongside the JSON |

---

## 2. Prerequisites

Make sure the following are installed before starting.

### Python 3.7+

```bash
python --version
# Expected: Python 3.7.x or higher
```

**Install:** https://www.python.org/downloads/

> **Screenshot — Python version check**
> ```
> $ python --version
> Python 3.11.6
> ```

---

### Node.js 14+

```bash
node --version
# Expected: v14.x.x or higher

npm --version
# Expected: 6.x.x or higher
```

**Install:** https://nodejs.org/

> **Screenshot — Node.js version check**
> ```
> $ node --version
> v20.11.0
>
> $ npm --version
> 10.2.4
> ```

---

### Git

```bash
git --version
# Expected: git version 2.x.x
```

**Install:** https://git-scm.com/downloads

---

## Step 1 — Clone the repository

Open a terminal and run:

```bash
git clone https://github.com/zrenard/WebReleaseNotes.git
cd WebReleaseNotes
```

> **Screenshot — Cloning**
> ```
> $ git clone https://github.com/zrenard/WebReleaseNotes.git
> Cloning into 'WebReleaseNotes'...
> remote: Enumerating objects: 124, done.
> remote: Counting objects: 100% (124/124), done.
> Receiving objects: 100% (124/124), 48.32 KiB | 2.40 MiB/s, done.
>
> $ cd WebReleaseNotes
> $ ls
> eslint.config.js  package.json       release_notes.css
> LICENSE           README.md          release_notes.html
> local.sh          release_notes.js   release_notes.py
> renovate.json     server.js          sample_with_tags.json
> ```

You should see these files:

```
WebReleaseNotes/
├── release_notes.py       ← Python data generator
├── release_notes.html     ← Web viewer (main UI)
├── release_notes.js       ← Application logic
├── release_notes.css      ← Styles
├── server.js              ← Local development server
├── package.json           ← Node.js configuration
├── local.sh               ← Build/validation script
├── sample_with_tags.json  ← Sample data (with releases)
└── sample_without_tags.json ← Sample data (no releases)
```

---

## Step 2 — Install Python dependencies

The Python script requires the `gitpython` package. Install it with:

```bash
pip install -e .
```

> **Screenshot — pip install**
> ```
> $ pip install -e .
> Obtaining file:///path/to/WebReleaseNotes
> Installing collected packages: gitpython, smmap, gitdb
> Successfully installed gitdb-4.0.11 gitpython-3.1.41 smmap-5.0.1
> ```

Verify the installation:

```bash
python release_notes.py --help
```

> **Screenshot — help output**
> ```
> $ python release_notes.py --help
> usage: release_notes.py [-h] [--num_commits N] [--output FILE]
>                         [--markdown FILE] [--md_timeline]
>                         [--md_latest_release_only]
>                         [--repo_path PATH] [--branch BRANCH]
>                         [--exclude_title REGEX]
>                         [--exclude_author REGEX]
>                         [--exclude_message REGEX]
>
> Export commit messages from the current repository for release notes.
> ...
> ```

---

## Step 3 — Install Node.js dependencies

```bash
npm install
```

> **Screenshot — npm install**
> ```
> $ npm install
> added 1 package, and audited 2 packages in 742ms
> found 0 vulnerabilities
> ```

This installs `stylelint-config-standard`, used by the validation pipeline.

---

## Step 4 — Generate release notes data

Point the script at your Git repository. The simplest usage targets the **current directory**:

```bash
python release_notes.py --num_commits 50 --output release_notes.json
```

### Using the included sample data (no Git repo required)

If you just want to try the viewer right now without a real repo, copy one of the provided sample files:

```bash
# Option A — sample data with release tags (v1.0.0, v1.1.0, v1.2.0)
cp sample_with_tags.json release_notes.json

# Option B — sample data without release tags (plain commit list)
cp sample_without_tags.json release_notes.json
```

### Targeting a different repository

```bash
python release_notes.py \
  --num_commits 100 \
  --output release_notes.json \
  --repo_path /path/to/your/project \
  --branch main
```

> **Screenshot — successful generation**
> ```
> $ python release_notes.py --num_commits 50 --output release_notes.json
> Analyzing repository: /path/to/WebReleaseNotes
> Branch: main
> Processing 50 commits...
> Commits found: 50
> Found release tags: v1.2.0, v1.1.0, v1.0.0
> Output written to: release_notes.json
> Done ✓
> ```

A `release_notes.json` file is now created in the project directory. It contains all commit metadata, classifications, and release groupings.

Note: Markdown output is no longer generated by default. Use `--markdown` when you want a `.md` file.

---

## Step 5 — Start the local server

```bash
npm run dev
# or equivalently:
node server.js
```

> **Screenshot — server start**
> ```
> $ npm run dev
>
> > dev
> > node server.js
>
> 🚀 Server running at http://localhost:3000
> 📂 Serving files from: /path/to/WebReleaseNotes
> Press Ctrl+C to stop
> ```

Open your browser and navigate to:

```
http://localhost:3000/release_notes.html
```

---

## Step 6 — Explore the web interface

### 6.1 The main page

When you open `http://localhost:3000` you will see:

```
┌──────────────────────────────────────────────────────────────────────┐
│  🌙  Web Release Notes          [By Commit ▼]   [🔍 Search...]       │
├──────────────────────────────────────────────────────────────────────┤
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐  │
│  │ 12 Total │ │ 5 Feats  │ │ 3 Fixes  │ │ 2 Docs   │ │ 2 Chores │  │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘ └──────────┘  │
├──────────────────────────────────────────────────────────────────────┤
│   Timeline ●────────●──●───────●──────●──●──────────●               │
├──────────────────────────────────────────────────────────────────────┤
│  ✨ feat: add user authentication module              2026-01-27     │
│     Alice Developer  ·  a1b2c3d                                      │
│  ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─  │
│  🐛 fix: resolve login timeout issue                 2026-01-27     │
│     Charlie Fixer  ·  c3d4e5f                                        │
└──────────────────────────────────────────────────────────────────────┘
```

**Areas of the page:**

| Area | Description |
|---|---|
| **Toolbar** | Theme toggle, view mode selector, and search box |
| **Summary cards** | Click any card to filter by that commit type |
| **Timeline bar** | Visual dots represent commits — click any dot to jump to it |
| **Commit list** | Expandable rows showing commit details |

---

### 6.2 View Mode: By Commit

The default view. Every commit appears as its own row, sorted newest-first.

Click a row to expand it and see:
- Full commit message body
- Files changed, insertions, deletions
- Link to the commit on GitHub (if a repo URL is detected)

```
┌─────────────────────────────────────────────────────────────────────┐
│ ✨ feat: add user authentication module               2026-01-27    │
│    Alice Developer · a1b2c3d                          [expand ▼]    │
├─────────────────────────────────────────────────────────────────────┤
│ ✨ feat: add user authentication module                              │
│                                                                     │
│ Author:  Alice Developer <alice@example.com>                        │
│ Hash:    a1b2c3d4e5f6...                                             │
│ Date:    2026-01-27 04:23:40                                         │
│ Files:   8 changed  |  +245 insertions  |  -12 deletions            │
│ Release: v1.2.0                                                     │
│                                                                     │
│ [View on GitHub ↗]                                                  │
└─────────────────────────────────────────────────────────────────────┘
```

---

### 6.3 View Mode: By Release

Switch to **By Release** using the dropdown in the toolbar. Commits are now grouped under their SemVer tag. Unreleased commits appear under a virtual **Incoming** section at the top.

```
┌─────────────────────────────────────────────────────────────────────┐
│  🔀 Incoming (3 commits)                              [collapse ▲]  │
│  ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ │
│  🏷️  v1.2.0  (5 commits · 2026-01-26 → 2026-01-27)   [collapse ▲]  │
│  │  ✨ feat: add user authentication module                          │
│  │  🐛 fix: resolve login timeout issue                             │
│  │  ♻️ refactor: restructure authentication module                  │
│  │  ✅ test: add unit tests for authentication                      │
│  └─ 🔧 chore: remove deprecated packages                           │
│  ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ │
│  🏷️  v1.1.0  (4 commits · 2026-01-25 → 2026-01-26)   [collapse ▲]  │
└─────────────────────────────────────────────────────────────────────┘
```

Use the **release dropdown** to jump directly to any release.

---

### 6.4 Search and filter

The **search box** (below the timeline) filters commits in real time across:
- Commit title and full message
- Author name
- Commit type (`feat`, `fix`, `docs`, …)
- Release tag name
- Date

```
┌─────────────────────────────────────────────────────────────────────┐
│  🔍  auth                                                           │
├─────────────────────────────────────────────────────────────────────┤
│  ✨ feat: add user authentication module             2026-01-27     │
│  ♻️  refactor: restructure authentication module     2026-01-27     │
│  ✅ test: add unit tests for authentication          2026-01-27     │
└─────────────────────────────────────────────────────────────────────┘
```

Click any **summary card** at the top to instantly filter to that category.

---

### 6.5 Dark / Light theme

Click the **☀️ / 🌙** toggle button in the top-right corner of the toolbar to switch between themes. Your preference is saved in `localStorage`.

```
  Light theme                      Dark theme
  ┌──────────────────────┐         ┌──────────────────────┐
  │ White background     │         │ Dark background      │
  │ Dark text            │         │ Light text           │
  │ Subtle card borders  │         │ Glowing accents      │
  └──────────────────────┘         └──────────────────────┘
```

---

## Step 7 — Generate Markdown output (optional)

Add `--markdown` to produce a `.md` file alongside the JSON:

```bash
python release_notes.py \
  --num_commits 50 \
  --output release_notes.json \
  --markdown RELEASE_NOTES.md
```

### With ASCII timeline visualization

```bash
python release_notes.py \
  --num_commits 50 \
  --output release_notes.json \
  --markdown RELEASE_NOTES.md \
  --md_timeline
```

> **Screenshot — generated Markdown excerpt**
> ```markdown
> ## 🏷️ v1.2.0
>
> ```
> 🏷️ v1.2.0 ━━━━━━━━━━━━━━━━━━━━
> │ 📅 2026-01-27 05:08
> │ └─ 📆 2026-01-27
> │     ├─ ✨ feat: add user authentication module
> │     ├─ 🐛 fix: resolve login timeout issue
> │     └─ ♻️  refactor: restructure authentication module
> └─ 📊 +580 / -183 / 19 files
> ```
>
> **Commits:** 5 | **Period:** 2026-01-27
> ```

### Latest release only

```bash
python release_notes.py \
  --num_commits 50 \
  --output release_notes.json \
  --markdown RELEASE_NOTES.md \
  --md_latest_release_only
```

This generates a Markdown file containing **only the most recent tagged release** — useful for automated release announcements.

---

### Excluding commits

You can exclude noisy commits by author, title, or full message using **regular expressions**. The `--exclude_*` flags can be repeated.

```bash
# Exclude all bot commits and dependency bumps
python release_notes.py \
  --num_commits 100 \
  --output release_notes.json \
  --exclude_author "dependabot|renovate-bot" \
  --exclude_title "^chore: bump" \
  --exclude_message "auto-generated"
```

---

## Step 8 — Deploy to GitHub Pages (optional)

### 8.1 Build production files

```bash
chmod +x local.sh   # Linux/macOS only
./local.sh
```

> **Screenshot — build output**
> ```
> $ ./local.sh
> [1/6] Running ESLint...          ✓
> [2/6] Running HTMLHint...        ✓
> [3/6] Running Stylelint...       ✓
> [4/6] Minifying HTML/CSS/JS...   ✓
> [5/6] Post-minification check... ✓
> [6/6] Generating sample JSON...  ✓
>
> Build complete → out/
> ```

Minified files are placed in the `out/` directory.

### 8.2 Copy files for deployment

```bash
cp out/release_notes.html index.html
cp out/release_notes.css  release_notes.css
cp out/release_notes.js   release_notes.js
cp out/release_notes.json release_notes.json
```

### 8.3 Push to the `gh-pages` branch

```bash
git add index.html release_notes.*
git commit -m "chore: update release notes"
git push origin gh-pages
```

Your release notes are now live at:  
`https://<your-username>.github.io/<your-repo>/`

---

### Automated deployment (GitHub Actions)

Create `.github/workflows/release-notes.yml` in your repo:

```yaml
name: Release Notes

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout (full history for tags)
        uses: actions/checkout@v6
        with:
          fetch-depth: 0          # Required — fetches all tags

      - name: Set up Python
        uses: actions/setup-python@v6
        with:
          python-version: "3.11"

      - name: Install Python dependencies
        run: pip install -e .

      - name: Generate release notes
        run: |
          python release_notes.py \
            --num_commits 100 \
            --output release_notes.json \
            --markdown RELEASE_NOTES.md

      - name: Set up Node.js
        uses: actions/setup-node@v6
        with:
          node-version: "24"

      - name: Install Node.js dependencies
        run: npm install

      - name: Build production files
        run: |
          chmod +x local.sh
          ./local.sh

      - name: Setup GitHub Pages
        uses: actions/configure-pages@v6

      - name: Upload Pages artifact
        uses: actions/upload-pages-artifact@v5
        with:
          path: ./out

      - name: Deploy to GitHub Pages
        uses: actions/deploy-pages@v5
```

> **Important:** The `fetch-depth: 0` option is **required**. Without it, Git tags are not fetched and commits cannot be grouped into releases.

---

## CLI Reference

```
python release_notes.py [OPTIONS]

Options:
  --num_commits N          Number of commits to include (default: 10)
  --output FILE            Output JSON file (default: release_notes.json)
  --markdown [FILE]        Also generate a Markdown file at FILE
                           (optional; if flag is present without value,
                           defaults to RELEASE_NOTES.md)
  --md_timeline            Include ASCII timeline in Markdown output
  --md_latest_release_only Only include the most recent tagged release
                           in the Markdown file
  --repo_path PATH         Path to the Git repository (default: .)
  --branch BRANCH          Branch to analyze (default: main)
  --exclude_title REGEX    Exclude commits whose title matches REGEX
                           (repeatable)
  --exclude_author REGEX   Exclude commits whose author matches REGEX
                           (repeatable)
  --exclude_message REGEX  Exclude commits whose full message matches REGEX
                           (repeatable)
```

### Commit type classification

The script reads [Conventional Commits](https://www.conventionalcommits.org/) prefixes:

| Prefix | Category | Emoji |
|---|---|---|
| `feat:` | Feature | ✨ |
| `fix:` | Bug Fix | 🐛 |
| `docs:` | Documentation | 📚 |
| `refactor:` | Code Refactoring | ♻️ |
| `test:` | Tests | ✅ |
| `chore:` | Chores | 🔧 |
| `style:` | Style | 🎨 |
| `perf:` | Performance | ⚡ |

Commits without a recognized prefix are classified using heuristics based on keywords in the title and message.

### Release tag detection

The tool recognizes these tag formats:

| Pattern | Example | Notes |
|---|---|---|
| `vMAJOR.MINOR.PATCH` | `v1.2.3` | Recommended format |
| `VMAJOR.MINOR.PATCH` | `V1.2.3` | Capital V also works |
| Pre-release tags | `v1.2.3-alpha` | **Ignored** — not grouped as a release |

---

## Troubleshooting

### "No module named git"

```bash
pip install gitpython
```

### "No commits found" or empty output

- Make sure you are inside a Git repository, or pass `--repo_path`.
- Make sure the branch specified with `--branch` exists.
- Verify with `git log --oneline -10`.

### Tags not detected / all commits under "Incoming"

- Ensure tags follow the `vMAJOR.MINOR.PATCH` format (e.g., `v1.0.0`).
- Pre-release suffixes (e.g., `-alpha`, `-rc.1`) cause the tag to be ignored.
- When cloning for CI, use `fetch-depth: 0` to fetch all tags.
- Tags are attached only to the exact tagged commit. If that commit is older than `--num_commits`, increase `--num_commits`.

### Server fails to start (port in use)

```bash
# Find and kill the process using port 3000
# Linux/macOS:
lsof -ti:3000 | xargs kill

# Windows (PowerShell):
Get-Process -Id (Get-NetTCPConnection -LocalPort 3000).OwningProcess | Stop-Process
```

### CSP errors in the browser console

The development server sets Content Security Policy headers. Browser extensions that inject scripts may trigger CSP warnings — these are filtered automatically and are safe to ignore.

### `local.sh` not executable

```bash
chmod +x local.sh
./local.sh
```

On Windows, run the script commands manually or use Git Bash / WSL.

---

*Tutorial for Web Release Notes — https://github.com/zrenard/WebReleaseNotes*
