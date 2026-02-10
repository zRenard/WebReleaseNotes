# Web Release Notes

A web-based release notes viewer that generates beautiful, interactive release notes from Git commit history. Features include commit-by-commit view, release-by-release aggregation, and a visual timeline with filtering capabilities.

## Features

- 📋 **Dual View Modes**: View commits individually or aggregated by release tags
- 🏷️ **Virtual "Incoming" Release**: Automatically groups unreleased commits
- 🎨 **Interactive Timeline**: Visual representation of commits with zoom capabilities
- 🔎 **Client-side Search**: Search by title, message content, author, type, release tag, and date
- 🔍 **Smart Filtering**: Filter by commit type (features, fixes, docs, chores)
- 🔧 **Commit Exclusion**: Exclude commits by title, author, or message using regex patterns (repeatable)
- 📊 **Statistics Dashboard**: Summary cards showing commit counts by category
- 🚀 **Auto-classification**: Automatically categorizes commits using conventional commit standards
- 🌐 **GitHub Integration**: Direct links to commits and repository
- 📱 **Responsive Design**: Works seamlessly on desktop and mobile devices
- 📝 **Markdown Export**: Generate formatted markdown release notes alongside JSON output
- 🗓️ **Timeline Visualization**: Optional ASCII timeline with date grouping and commit types in markdown output
- ☀️/🌙 **Light/Dark themes**: Switch btween dark and light theme

## Description

Web Release Notes is a comprehensive solution for generating and displaying release notes from Git repositories. It consists of:

- **Python Script** (`release_notes.py`): Extracts commit history and generates JSON data
- **Web Interface** (`release_notes.html`, `release_notes.js`, `release_notes.css`): Interactive viewer with multiple view modes
- **Node.js Server** (`server.js`): Local development server with live reload
- **Build Pipeline** (`local.sh`): Automated linting, minification, and validation

The tool automatically classifies commits into categories (features, bug fixes, documentation, chores), supports release tagging, and creates a virtual "Incoming" release for commits not yet tagged.

## Installation

### Prerequisites

- **Python 3.7+** with pip
- **Node.js 14+** with npm
- **Git** repository

### Setup

1. **Clone or download** this repository:
   ```bash
   git clone <your-repo-url>
   cd WebReleaseNotes
   ```

2. **Install Python dependencies**:
   ```bash
   pip install -e .
   ```

3. **Install Node.js dependencies**:
   ```bash
   npm install stylelint-config-standard
   ```

4. **Generate release notes data**:
   ```bash
   python release_notes.py --num_commits 50 --output release_notes.json
   ```
   
   Options:
   - `--num_commits N`: Number of commits to include (default: 10)
   - `--output FILE`: Output JSON file path (default: release_notes.json)
   - `--markdown FILE`: Optional markdown file path (e.g., RELEASE_NOTES.md)
   - `--md_timeline`: Include timeline visualization in markdown output (default: False)
   - `--md_latest_release_only`: Generate markdown only for the latest tagged release (ignores Incoming and older releases). If no tags are found, output remains unchanged.
   - `--repo_path PATH`: Path to the repository (default: current directory)
   - `--branch BRANCH`: Branch to analyze (default: main)
   - `--exclude_title REGEX`: Exclude commits whose title matches the regex (repeatable)
   - `--exclude_author REGEX`: Exclude commits whose author matches the regex (repeatable)
   - `--exclude_message REGEX`: Exclude commits whose full message matches the regex (repeatable)

## Testing

### Local Development Server

Start the development server to test the web interface:

```bash
npm run dev
# or
node server.js
```

Visit `http://localhost:3000` in your browser.

#### CSP rules
The development server includes Content Security Policy (CSP) headers to enhance security. If you encounter issues loading resources, ensure your browser supports CSP and that no extensions are interfering.
Validate that the CSP headers are correctly set by checking the browser's developer console for any CSP-related errors.

### Validation and Linting

Run the complete validation pipeline:

```bash
./local.sh
```

This script performs:

1. **JavaScript linting** with ESLint
2. **HTML validation** with HTMLHint
3. **CSS validation** with Stylelint
4. **Minification** of HTML, CSS, and JavaScript
5. **Post-minification validation**
6. **JSON generation** with sample data

Output files are created in the `out/` directory.

## Deploying

### GitHub Pages Deployment

1. **Generate production files**:
   ```bash
   ./local.sh
   ```

2. **Copy output files** from `out/` directory to your GitHub Pages branch or deployment folder:
   ```bash
   cp out/release_notes.html index.html
   cp out/release_notes.css release_notes.css
   cp out/release_notes.js release_notes.js
   cp out/release_notes.json release_notes.json
   ```

3. **Commit and push** to GitHub Pages:
   ```bash
   git add index.html release_notes.* 
   git commit -m "Update release notes"
   git push origin gh-pages
   ```

### Static Web Server Deployment

For any static web server (Apache, Nginx, etc.):

1. **Build production files**:
   ```bash
   ./local.sh
   ```

2. **Copy files** from `out/` directory to your web server's document root:
   ```bash
   cp out/* /var/www/html/release-notes/
   ```

3. **Configure release notes generation**:
   ```
   python release_notes.py --num_commits 50 --output release_notes.json --markdown RELEASE_NOTES.md
   ```

### Automated Deployment

For CI/CD pipelines, add these steps to your workflow:

```yaml
# Example GitHub Actions workflow
- name: 🚚 Get latest code
   uses: actions/checkout@v6
   with:
      # NOTICE : You must use this option to get all tags for release detection
      fetch-depth: 0
- name: Generate Release Notes
  run: |
    python release_notes.py --num_commits 50 --output release_notes.json --markdown RELEASE_NOTES.md

# You may need to set up Node.js environment here and run directly minifiyer or
# use directly the compressed version
# (Section simplifyed for brevity)
- name: Build and Validate
  run: |
    chmod +x local.sh
    ./local.sh

- name: Deploy to GitHub Pages
  uses: peaceiris/actions-gh-pages@v3
  with:
    github_token: ${{ secrets.GITHUB_TOKEN }}
    publish_dir: ./out
```

## Usage

### View Modes

- **By Commit**: Shows all commits in chronological order with expandable details
- **By Release**: Groups commits by release tags, with a special "Incoming" virtual release for unreleased commits

### Filtering

- Click on **summary cards** to filter by commit type (features, fixes, docs, etc.)
- Click on **timeline dots** to jump to specific commits
- Use the **release dropdown** to view specific releases
- Use the **search box** (below the timeline) to filter commits by title, content, author, type, release tag, or date

### Release Tags

The tool automatically detects **SemVer** tags (e.g., `1.0.0`, `2.1.3`) and tags starting with `v` or `V` (e.g., `v1.0.0`, `V2.1.3`) then groups commits accordingly. **Pre-release tags** (e.g., `1.0.0-alpha`, `1.0.0-rc.1`) are ignored. Commits before the first tag are grouped into an "Incoming" virtual release.

### Markdown Output

When using the `--markdown` option, the script generates a formatted markdown file:

- **With Release Tags**: Structures the markdown by releases (matching the HTML "By Release" view)
  - Each release section shows commit count, date range, and category summary
  - Commits are grouped by type within each release
  - Includes an overall summary at the end
  - **Optional Timeline**: Use `--md_timeline` to include an ASCII visual timeline with date grouping, commit types (with emojis), and statistics for each release
  - **Latest Release Only**: Use `--md_latest_release_only` to generate markdown for only the most recent tagged release, ignoring "Incoming" commits and older releases (useful for focused release announcements)

- **Without Release Tags**: Lists commits chronologically by date (matching the HTML "By Commit" view)
  - Each commit shows type badge, message, author, and date
  - Includes statistics and breakdown by type at the end
  - **Optional Timeline**: Use `--md_timeline` to include an ASCII visual timeline showing all commits grouped by date

The timeline visualization features:
- 📅 Date grouping with chronological ordering (latest first)
- ✨ Emoji indicators for commit types (features, fixes, docs, etc.)
- 🌳 Tree-style ASCII structure using box-drawing characters
- 📊 Statistics summary (insertions, deletions, files changed)

Example usage:
```bash
# Generate both JSON and markdown
python release_notes.py --markdown RELEASE_NOTES.md --num_commits 50

# Generate markdown with timeline visualization
python release_notes.py --markdown RELEASE_NOTES.md --md_timeline --num_commits 50

# Generate only latest release with timeline
python release_notes.py --markdown RELEASE_NOTES.md --md_timeline --md_latest_release_only --num_commits 50

# Analyze a different repository
python release_notes.py --repo_path ../my-project --markdown RELEASE_NOTES.md

# Use a specific branch
python release_notes.py --branch develop --markdown RELEASE_NOTES.md
```

## Project Structure

```
WebReleaseNotes/
├── release_notes.py       # Python script for generating commit data
├── release_notes.html     # Main HTML interface
├── release_notes.js       # JavaScript application logic
├── release_notes.css      # Styling and responsive design
├── release_notes.json     # Generated commit data (gitignored)
├── server.js              # Development server
├── local.sh               # Build and validation script
├── package.json           # Node.js dependencies
├── eslint.config.js       # ESLint configuration
└── out/                   # Production build output (gitignored)
```

## License

See [LICENSE](LICENSE) file for details.

## Contributing

Contributions are welcome! Please ensure all code passes validation, before submitting changes.
