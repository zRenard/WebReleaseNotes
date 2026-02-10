"""
Export commit messages from the current repository for release notes.

This script extracts the last N commits from the current repository
and exports them to JSON format for publishing release notes on GitHub Pages.
"""

import git
import json
import argparse
import re
from datetime import datetime
from pathlib import Path


def timestamp_to_date(timestamp):
    """Convert Unix timestamp to date string (YYYY-MM-DD HH:MM:SS)."""
    return datetime.fromtimestamp(timestamp).strftime('%Y-%m-%d %H:%M:%S')


def is_semver_tag(tag):
    """
    Check if a tag follows semantic versioning (SemVer) format.
    
    SemVer format: MAJOR.MINOR.PATCH[-PRERELEASE][+BUILD]
    Examples: 1.0.0, 2.1.3, 1.0.0-alpha, 1.0.0-beta.1, 1.0.0+build.123
    
    Args:
        tag: Tag string to validate
    
    Returns:
        True if tag matches SemVer format, False otherwise
    """
    # SemVer regex pattern
    semver_pattern = r'^[vV]\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?(?:\+[a-zA-Z0-9.-]+)?$'
    return bool(re.match(semver_pattern, tag))


def is_release_version(tag):
    """
    Check if a tag is a release version (not a pre-release).
    
    Excludes tags with pre-release markers like -PR-, -alpha, -beta, -rc, etc.
    
    Args:
        tag: Tag string to validate
    
    Returns:
        True if tag is a stable release version, False if it's a pre-release
    """
    # Return False if tag contains pre-release markers
    if '-' in tag:
        return False
    # Must also be valid SemVer format (MAJOR.MINOR.PATCH)
    return bool(re.match(r'^[vV]\d+\.\d+\.\d+(?:\+[a-zA-Z0-9.-]+)?$', tag))


def classify_commit(first_line, author, full_message):
    """Classify commit type using conventional prefix and heuristics."""
    author_l = (author or '').lower()
    first_l = (first_line or '').lower()
    full_l = (full_message or '').lower()

    # Conventional commit prefix
    if ':' in first_line:
        prefix = first_line.split(':', 1)[0].strip().lower()
        if prefix in ['feat']:
            return 'feat'
        if prefix in ['fix']:
            return 'fix'
        if prefix in ['docs']:
            return 'docs'
        if prefix in ['style']:
            return 'style'
        if prefix in ['refactor']:
            return 'refactor'
        if prefix in ['test']:
            return 'test'
        if prefix in ['perf']:
            return 'perf'
        if prefix in ['ci', 'build', 'ops']:
            return 'ops'
        if prefix in ['chore']:
            return 'chore'

    # Author-based heuristic (bots/dependency updaters)
    if 'renovate' in author_l or 'dependabot' in author_l:
        return 'chore'

    # Message heuristics
    if any(word in first_l for word in ['fix', 'bug', 'hotfix', 'patch', 'resolve', 'error', 'erreur','issue','correction','ajustement', 'réparation','bugfix']):
        return 'fix'
    if any(word in first_l for word in ['doc', 'readme', 'changelog']):
        return 'docs'
    if any(word in first_l for word in ['feat', 'feature', 'add ', 'introduce', 'implement', 'new ', 'ajout ']):
        return 'feat'
    if any(word in first_l for word in ['style', 'format', 'prettier', 'eslint']):
        return 'style'
    if any(word in first_l for word in ['refactor', 'restructur', 'reorganiz']):
        return 'refactor'
    if any(word in first_l for word in ['test', 'testing', 'spec', 'coverage']):
        return 'test'
    if any(word in first_l for word in ['perf', 'performance', 'optim', 'faster']):
        return 'perf'
    if any(word in first_l for word in [' ci ', 'pipeline', 'workflow', 'action', 'build', 'compile', 'bundle', 'deploy']):
        return 'ops'
    if any(word in first_l for word in ['update', 'bump', 'upgrade', 'deps', 'dependency', 'cleanup', 'chore']):
        return 'chore'
    if any(word in full_l for word in ['dependency', 'renovate', 'bump']):
        return 'chore'

    return 'other'
def _compile_patterns(patterns):
    return [re.compile(p, re.IGNORECASE) for p in patterns if p]


def should_exclude_commit(first_line, author, full_message,
                          exclude_title_patterns=None,
                          exclude_author_patterns=None,
                          exclude_message_patterns=None):
    """Return True if commit should be excluded based on title/author/message."""
    title_patterns = _compile_patterns(exclude_title_patterns or [])
    author_patterns = _compile_patterns(exclude_author_patterns or [])
    message_patterns = _compile_patterns(exclude_message_patterns or [])

    title = first_line or ''
    author_val = author or ''
    message = full_message or ''

    if any(p.search(title) for p in title_patterns):
        return True
    if any(p.search(author_val) for p in author_patterns):
        return True
    if any(p.search(message) for p in message_patterns):
        return True
    return False
def get_repository_commits(repo_path, num_commits=10, branch='main',exclude_title_patterns=None,
                           exclude_author_patterns=None,
                           exclude_message_patterns=None):
    """
    Extract last N commits from the current repository.
    
    Args:
        repo_path: Path to the git repository
        num_commits: Number of commits to retrieve
        branch: Branch name to analyze
    
    Returns:
        List of commit dictionaries with metadata
    """
    commits_data = []
    try:
        repo = git.Repo(repo_path)
        commits = list(repo.iter_commits(branch, max_count=num_commits))
        
        # Get all tags and their associated commit hashes
        tags_by_commit = {}
        for tag in repo.tags:
            try:
                # Only include release versions (exclude pre-releases like -PR-)
                if not is_release_version(tag.name):
                    continue
                commit_hash = tag.commit.hexsha
                if commit_hash not in tags_by_commit:
                    tags_by_commit[commit_hash] = []
                tags_by_commit[commit_hash].append(tag.name)
            except:
                continue
        
        for commit in commits:
            # Extract commit type and scope from conventional commit format
            message_lines = commit.message.strip().split('\n')
            first_line = message_lines[0]

            if should_exclude_commit(
                first_line,
                commit.author.name,
                commit.message,
                exclude_title_patterns=exclude_title_patterns,
                exclude_author_patterns=exclude_author_patterns,
                exclude_message_patterns=exclude_message_patterns,
            ):
                continue
            
            # Classify commit with conventional prefix + heuristics
            commit_type = classify_commit(first_line, commit.author.name, commit.message)
            
            # Get tags for this commit
            commit_tags = tags_by_commit.get(commit.hexsha, [])
            
            commit_data = {
                'hash': commit.hexsha,
                'short_hash': commit.hexsha[:7],
                'author': commit.author.name,
                'email': commit.author.email,
                'timestamp': commit.authored_date,
                'message': commit.message.strip(),
                'message_short': first_line[:100],
                'type': commit_type,
                'files_changed': len(commit.stats.files),
                'insertions': commit.stats.total['insertions'],
                'deletions': commit.stats.total['deletions']
            }
            
            # Add tags only if present
            if commit_tags:
                commit_data['tags'] = sorted(commit_tags)
            
            commits_data.append(commit_data)
            
    except Exception as e:
        print(f"[ERROR] Failed to process repository: {e}")
        raise
    
    return commits_data


def export_release_notes(repo_path, num_commits, output_path, branch='main', markdown_path=None, latest_release_only=False, include_timeline=False, exclude_title_patterns=None, exclude_author_patterns=None,exclude_message_patterns=None):
    """
    Export commit messages from current repository to JSON for release notes.
    
    Args:
        repo_path: Path to the repository
        num_commits: Number of commits to export
        output_path: Path to save JSON file
        branch: Branch to analyze
        markdown_path: Optional path to save markdown file
        latest_release_only: Only include latest release in markdown
        include_timeline: Include timeline visualization in markdown
    """
    print(f"[*] Extracting {num_commits} commits from branch '{branch}'...")
    
    commits = get_repository_commits(repo_path, num_commits, branch,exclude_title_patterns=exclude_title_patterns,
        exclude_author_patterns=exclude_author_patterns,
        exclude_message_patterns=exclude_message_patterns)
    
    # Get repository info
    repo = git.Repo(repo_path)
    try:
        remote_url = repo.remotes.origin.url
        # Convert SSH to HTTPS if needed
        if remote_url.startswith('git@'):
            remote_url = remote_url.replace(':', '/').replace('git@', 'https://')
        if remote_url.endswith('.git'):
            remote_url = remote_url[:-4]
    except:
        remote_url = ''
    
    # Get repository name from path or remote URL
    repo_name = Path(repo_path).name
    if not repo_name or repo_name == '.':
        if remote_url:
            repo_name = remote_url.split('/')[-1]
        else:
            repo_name = 'Repository'
    
    release_data = {
        'generated_at': datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
        'generated_at_iso': datetime.now().isoformat(),
        'repository': {
            'name': repo_name,
            'branch': branch,
            'url': remote_url
        },
        'commits': commits
    }
    
    # Save to JSON file
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(release_data, f, indent=2, ensure_ascii=False)
    
    print(f"[OK] Exported {len(commits)} commits to {output_path}")
    
    # Generate markdown file if requested
    if markdown_path:
        markdown_content = generate_markdown(release_data, latest_release_only=latest_release_only, include_timeline=include_timeline)
        with open(markdown_path, 'w', encoding='utf-8') as f:
            f.write(markdown_content)
        print(f"[OK] Generated markdown file: {markdown_path}")
    
    return release_data


def generate_markdown(release_data, latest_release_only=False, include_timeline=False):
    """
    Generate markdown formatted release notes from release data.
    
    Args:
        release_data: Dictionary containing release note data
        latest_release_only: Only include latest release
        include_timeline: Include timeline visualization
    
    Returns:
        Markdown formatted string
    """
    md_lines = []
    
    # Header
    repo_name = release_data['repository']['name']
    md_lines.append(f"# Release Notes - {repo_name}")
    md_lines.append("")
    md_lines.append(f"**Generated:** {release_data['generated_at']}")
    md_lines.append(f"**Branch:** {release_data['repository']['branch']}")
    if release_data['repository']['url']:
        md_lines.append(f"**Repository:** {release_data['repository']['url']}")
    md_lines.append("")
    md_lines.append("---")
    md_lines.append("")
    
    # Check if there are release tags (tags starting with v or V or (SemVer format: MAJOR.MINOR.PATCH))
    releases = parse_releases(release_data['commits'])
    
    if releases:
        if latest_release_only:
            latest_release = next((release for release in releases if not release['is_virtual']), None)
            if latest_release:
                releases = [latest_release]
        # Structure by releases
        md_lines.extend(generate_markdown_by_release(releases, release_data, include_timeline=include_timeline))
    else:
        # Structure by commit type (original behavior)
        md_lines.extend(generate_markdown_by_type(release_data, include_timeline=include_timeline))
    
    return '\n'.join(md_lines)


def parse_releases(commits):
    """
    Parse commits to identify releases based on tags starting with 'v' or 'V' or SemVer format: MAJOR.MINOR.PATCH
    
    Args:
        commits: List of commit dictionaries
    
    Returns:
        List of release dictionaries or empty list if no release tags found
    """
    # Build a map of tags with their first appearance index
    tag_first_index = {}
    
    for index, commit in enumerate(commits):
        if 'tags' in commit and commit['tags']:
            for tag in commit['tags']:
                if tag not in tag_first_index:
                    tag_first_index[tag] = index
    
    # Filter to only include release tags (starting with 'v' or 'V' or SemVer format: MAJOR.MINOR.PATCH)
    release_tags = [tag for tag in tag_first_index.keys() if is_semver_tag(tag)]
    
    if not release_tags:
        return []
    
    # Get unique commit indices where release tags appear (in order)
    unique_indices = sorted(set(tag_first_index[tag] for tag in release_tags))
    
    # For each unique index, collect all release tags that appear at that index
    tag_groups = []
    for index in unique_indices:
        tags_at_index = [tag for tag in release_tags if tag_first_index[tag] == index]
        tag_groups.append({'index': index, 'tags': tags_at_index})
    
    releases_list = []
    
    # Check for commits before the first tag (Incoming commits)
    if tag_groups and tag_groups[0]['index'] > 0:
        incoming_commits = commits[:tag_groups[0]['index']]
        releases_list.append({
            'tag': 'Incoming',
            'commits': incoming_commits,
            'start_date': timestamp_to_date(incoming_commits[0]['timestamp']) if incoming_commits else '',
            'end_date': timestamp_to_date(incoming_commits[-1]['timestamp']) if incoming_commits else '',
            'commit_count': len(incoming_commits),
            'is_virtual': True
        })
    
    # Process each release
    for i, current_group in enumerate(tag_groups):
        next_group = tag_groups[i + 1] if i < len(tag_groups) - 1 else None
        
        start_index = current_group['index']
        end_index = next_group['index'] if next_group else len(commits)
        
        release_commits = commits[start_index:end_index]
        releases_list.append({
            'tag': ' / '.join(current_group['tags']),  # Merge multiple tags on same commit
            'commits': release_commits,
            'start_date': timestamp_to_date(release_commits[0]['timestamp']) if release_commits else '',
            'end_date': timestamp_to_date(release_commits[-1]['timestamp']) if release_commits else '',
            'commit_count': len(release_commits),
            'is_virtual': False
        })
    
    # Sort by date (most recent first)
    releases_list.sort(key=lambda r: r['start_date'] if r['start_date'] else '', reverse=True)
    
    return releases_list


def get_type_emoji(commit_type):
    """Get emoji for commit type."""
    type_emojis = {
        'feat': '✨',
        'fix': '🐛',
        'docs': '📚',
        'style': '💎',
        'refactor': '♻️',
        'test': '✅',
        'perf': '⚡',
        'ops': '🚀',
        'chore': '🔧',
        'other': '📌'
    }
    return type_emojis.get(commit_type, '📌')


def generate_single_release_timeline(release):
    """
    Generate timeline visualization for a single release.
    
    Args:
        release: Release dictionary
    
    Returns:
        String containing the timeline markdown
    """
    lines = ['```']
    
    # Release header with date/time
    release_emoji = '🚀' if release['is_virtual'] else '🏷️'
    lines.append(f"{release_emoji} {release['tag']} ━━━━━━━━━━━━━━━━━━━━")
    # Format date without seconds (HH:MM only)
    release_date_short = release['start_date'].rsplit(':', 1)[0] if ':' in release['start_date'] else release['start_date']
    lines.append(f"│ 📅 {release_date_short}")
    
    # Sort commits by timestamp (oldest first within this release)
    sorted_commits = sorted(release['commits'], key=lambda c: c['timestamp'])
    
    # Group commits by date
    commits_by_date = {}
    for commit in sorted_commits:
        commit_date = timestamp_to_date(commit['timestamp']).split()[0]  # Get just the date part
        if commit_date not in commits_by_date:
            commits_by_date[commit_date] = []
        commits_by_date[commit_date].append(commit)
    
    # Sort dates chronologically (convert to datetime for proper sorting) - latest first
    from datetime import datetime as dt
    sorted_dates = sorted(commits_by_date.keys(), key=lambda d: dt.strptime(d, '%Y-%m-%d'), reverse=True)
    
    # Iterate through dates in order
    for date_idx, commit_date in enumerate(sorted_dates):
        commits_on_date = commits_by_date[commit_date]
        is_last_date = (date_idx == len(sorted_dates) - 1)
        
        # Date header
        date_connector = '└─' if is_last_date else '├─'
        lines.append(f"│ {date_connector} 📆 {commit_date}")
        
        # Commits for this date
        for commit_idx, commit in enumerate(commits_on_date):
            is_last_commit = (commit_idx == len(commits_on_date) - 1)
            
            emoji = get_type_emoji(commit.get('type', 'other'))
            
            if is_last_date:
                # For last date, use spaces for vertical alignment
                if is_last_commit:
                    commit_line = f"│     └─ {emoji} {commit['message_short'][:60].strip()}"
                else:
                    commit_line = f"│     ├─ {emoji} {commit['message_short'][:60].strip()}"
            else:
                # For non-last dates, use pipe for continuation
                if is_last_commit:
                    commit_line = f"│ │   └─ {emoji} {commit['message_short'][:60].strip()}"
                else:
                    commit_line = f"│ │   ├─ {emoji} {commit['message_short'][:60].strip()}"
            
            lines.append(commit_line)
    
    # Stats
    total_insertions = sum(c['insertions'] for c in release['commits'])
    total_deletions = sum(c['deletions'] for c in release['commits'])
    total_files = sum(c['files_changed'] for c in release['commits'])
    
    lines.append(f"└─ 📊 +{total_insertions} / -{total_deletions} / {total_files} files")
    lines.append('```')
    
    return '\n'.join(lines)


def generate_vertical_timeline_by_release(releases):
    """
    Generate vertical timeline visualization by releases.
    
    Args:
        releases: List of release dictionaries
    
    Returns:
        String containing the timeline markdown
    """
    if not releases:
        return ''
    
    lines = ['```']
    
    for i, release in enumerate(releases):
        is_last = (i == len(releases) - 1)
        
        # Release header with date/time
        release_emoji = '🚀' if release['is_virtual'] else '🏷️'
        lines.append(f"{release_emoji} {release['tag']} ━━━━━━━━━━━━━━━━━━━━")
        # Format date without seconds (HH:MM only)
        release_date_short = release['start_date'].rsplit(':', 1)[0] if ':' in release['start_date'] else release['start_date']
        lines.append(f"│ 📅 {release_date_short}")
        
        # Sort commits by timestamp (oldest first within this release)
        sorted_commits = sorted(release['commits'], key=lambda c: c['timestamp'])
        
        # Group commits by date
        commits_by_date = {}
        for commit in sorted_commits:
            commit_date = timestamp_to_date(commit['timestamp']).split()[0]  # Get just the date part
            if commit_date not in commits_by_date:
                commits_by_date[commit_date] = []
            commits_by_date[commit_date].append(commit)
        
        # Sort dates chronologically (convert to datetime for proper sorting) - latest first
        from datetime import datetime as dt
        sorted_dates = sorted(commits_by_date.keys(), key=lambda d: dt.strptime(d, '%Y-%m-%d'), reverse=True)
        
        # Iterate through dates in order
        for date_idx, commit_date in enumerate(sorted_dates):
            commits_on_date = commits_by_date[commit_date]
            is_last_date = (date_idx == len(sorted_dates) - 1)
            
            # Date header
            date_connector = '└─' if is_last_date else '├─'
            lines.append(f"│ {date_connector} 📆 {commit_date}")
            
            # Commits for this date
            for commit_idx, commit in enumerate(commits_on_date):
                is_last_commit = (commit_idx == len(commits_on_date) - 1)
                
                emoji = get_type_emoji(commit.get('type', 'other'))
                
                if is_last_date:
                    # For last date, use spaces for vertical alignment
                    if is_last_commit:
                        commit_line = f"│     └─ {emoji} {commit['message_short'][:60].strip()}"
                    else:
                        commit_line = f"│     ├─ {emoji} {commit['message_short'][:60].strip()}"
                else:
                    # For non-last dates, use pipe for continuation
                    if is_last_commit:
                        commit_line = f"│ │   └─ {emoji} {commit['message_short'][:60].strip()}"
                    else:
                        commit_line = f"│ │   ├─ {emoji} {commit['message_short'][:60].strip()}"
                
                lines.append(commit_line)
        
        # Stats
        total_insertions = sum(c['insertions'] for c in release['commits'])
        total_deletions = sum(c['deletions'] for c in release['commits'])
        total_files = sum(c['files_changed'] for c in release['commits'])
        
        lines.append(f"└─ 📊 +{total_insertions} / -{total_deletions} / {total_files} files")
        
        if not is_last:
            lines.append('')
    
    lines.append('```')
    return '\n'.join(lines)


def generate_markdown_by_release(releases, release_data, include_timeline=False):
    """
    Generate markdown structured by releases.
    
    Args:
        releases: List of release dictionaries
        release_data: Full release data
        include_timeline: Include timeline visualization
    
    Returns:
        List of markdown lines
    """
    md_lines = []
    repo_url = release_data['repository']['url']
    
    # Type display names and emojis
    type_info = {
        'feat': ('✨ Features', '✨'),
        'fix': ('🐛 Bug Fixes', '🐛'),
        'docs': ('📚 Documentation', '📚'),
        'style': ('💎 Code Style', '💎'),
        'refactor': ('♻️ Code Refactoring', '♻️'),
        'test': ('✅ Tests', '✅'),
        'perf': ('⚡ Performance', '⚡'),
        'ops': ('🚀 CI/CD & Build', '🚀'),
        'chore': ('🔧 Chores', '🔧'),
        'other': ('📌 Other Changes', '📌')
    }
    
    for release in releases:
        # Release header
        release_emoji = '🚀' if release['is_virtual'] else '🏷️'
        md_lines.append(f"## {release_emoji} {release['tag']}")
        md_lines.append("")
        
        # Add timeline for this release if requested
        if include_timeline:
            timeline = generate_single_release_timeline(release)
            md_lines.append(timeline)
            md_lines.append("")
        
        md_lines.append(f"**Commits:** {release['commit_count']} | **Period:** {release['start_date']} to {release['end_date']}")
        md_lines.append("")
        
        # Group commits by type
        commits_by_type = {
            'feat': [],
            'fix': [],
            'docs': [],
            'style': [],
            'refactor': [],
            'test': [],
            'perf': [],
            'ops': [],
            'chore': [],
            'other': []
        }
        
        for commit in release['commits']:
            commit_type = commit.get('type', 'other')
            commits_by_type[commit_type].append(commit)
        
        # Category summary
        category_summary = []
        for commit_type in ['feat', 'fix', 'docs', 'style', 'refactor', 'test', 'perf', 'ops', 'chore', 'other']:
            count = len(commits_by_type[commit_type])
            if count > 0:
                title, emoji = type_info[commit_type]
                category_summary.append(f"{emoji} {title.split(' ', 1)[1] if ' ' in title else title}: {count}")
        
        if category_summary:
            md_lines.append("**Summary:** " + " | ".join(category_summary))
            md_lines.append("")
        
        # Generate sections for each type
        for commit_type in ['feat', 'fix', 'docs', 'style', 'refactor', 'test', 'perf', 'ops', 'chore', 'other']:
            commits = commits_by_type[commit_type]
            if not commits:
                continue
            
            title, emoji = type_info[commit_type]
            md_lines.append(f"### {title}")
            md_lines.append("")
            
            for commit in commits:
                # Get first line of message
                first_line = commit['message'].split('\n')[0]
                
                # Format: - message (hash) by author
                if repo_url:
                    commit_link = f"[`{commit['short_hash']}`]({repo_url}/commit/{commit['hash']})"
                else:
                    commit_link = f"`{commit['short_hash']}`"
                
                md_lines.append(f"- {first_line} ({commit_link}) - *{commit['author']}* - {timestamp_to_date(commit['timestamp'])}")
                md_lines.append(f"  - 📊 {commit['files_changed']} files, +{commit['insertions']}/-{commit['deletions']} lines")
                md_lines.append("")
            
            md_lines.append("")
        
        md_lines.append("---")
        md_lines.append("")
    
    # Overall summary
    md_lines.append("## 📈 Overall Summary")
    md_lines.append("")
    
    total_commits = sum(r['commit_count'] for r in releases)
    all_commits = [c for r in releases for c in r['commits']]
    total_files = sum(c['files_changed'] for c in all_commits)
    total_insertions = sum(c['insertions'] for c in all_commits)
    total_deletions = sum(c['deletions'] for c in all_commits)
    
    md_lines.append(f"- **Total Releases:** {len(releases)}")
    md_lines.append(f"- **Total Commits:** {total_commits}")
    md_lines.append(f"- **Files Changed:** {total_files}")
    md_lines.append(f"- **Insertions:** +{total_insertions}")
    md_lines.append(f"- **Deletions:** -{total_deletions}")
    md_lines.append("")
    
    return md_lines


def generate_markdown_by_type(release_data, include_timeline=False):
    """
    Generate markdown structured by commit date (chronological order).
    
    Args:
        release_data: Full release data
        include_timeline: Include timeline visualization
    
    Returns:
        List of markdown lines
    """
    md_lines = []
    repo_url = release_data['repository']['url']
    
    # Generate timeline for all commits if requested
    if include_timeline:
        all_commits_release = {
            'tag': 'All Commits',
            'commits': release_data['commits'],
            'start_date': timestamp_to_date(release_data['commits'][0]['timestamp']) if release_data['commits'] else '',
            'end_date': timestamp_to_date(release_data['commits'][-1]['timestamp']) if release_data['commits'] else '',
            'commit_count': len(release_data['commits']),
            'is_virtual': True
        }
        
        timeline = generate_single_release_timeline(all_commits_release)
        md_lines.append("## 📈 Timeline")
        md_lines.append("")
        md_lines.append(timeline)
        md_lines.append("")
        md_lines.append("---")
        md_lines.append("")
    
    # Type display names and emojis
    type_info = {
        'feat': ('✨ Features', '✨'),
        'fix': ('🐛 Bug Fixes', '🐛'),
        'docs': ('📚 Documentation', '📚'),
        'style': ('💎 Code Style', '💎'),
        'refactor': ('♻️ Code Refactoring', '♻️'),
        'test': ('✅ Tests', '✅'),
        'perf': ('⚡ Performance', '⚡'),
        'ops': ('🚀 CI/CD & Build', '🚀'),
        'chore': ('🔧 Chores', '🔧'),
        'other': ('📌 Other Changes', '📌')
    }
    
    # Show commits in chronological order (already sorted by date in the data)
    md_lines.append("## 📋 Commits")
    md_lines.append("")
    
    for commit in release_data['commits']:
        commit_type = commit.get('type', 'other')
        type_label, emoji = type_info.get(commit_type, ('Other', '📦'))
        
        # Get first line of message
        first_line = commit['message'].split('\n')[0]
        
        # Format: - [emoji] message (hash) by author - date
        if repo_url:
            commit_link = f"[`{commit['short_hash']}`]({repo_url}/commit/{commit['hash']})"
        else:
            commit_link = f"`{commit['short_hash']}`"
        
        md_lines.append(f"- {emoji} **[{commit_type.upper()}]** {first_line}")
        md_lines.append(f"  - {commit_link} - *{commit['author']}* - {timestamp_to_date(commit['timestamp'])}")
        
        # Add tags if present
        if 'tags' in commit and commit['tags']:
            tags_str = ', '.join([f'`{tag}`' for tag in commit['tags']])
            md_lines.append(f"  - 🏷️ Tags: {tags_str}")
        
        # Add stats
        md_lines.append(f"  - 📊 {commit['files_changed']} files, +{commit['insertions']}/-{commit['deletions']} lines")
        md_lines.append("")
    
    # Summary statistics
    md_lines.append("---")
    md_lines.append("")
    md_lines.append("## 📈 Summary")
    md_lines.append("")
    
    # Group commits by type for summary
    commits_by_type = {
        'feat': [],
        'fix': [],
        'docs': [],
        'style': [],
        'refactor': [],
        'test': [],
        'perf': [],
        'ops': [],
        'chore': [],
        'other': []
    }
    
    for commit in release_data['commits']:
        commit_type = commit.get('type', 'other')
        commits_by_type[commit_type].append(commit)
    
    total_commits = len(release_data['commits'])
    total_files = sum(c['files_changed'] for c in release_data['commits'])
    total_insertions = sum(c['insertions'] for c in release_data['commits'])
    total_deletions = sum(c['deletions'] for c in release_data['commits'])
    
    md_lines.append(f"- **Total Commits:** {total_commits}")
    md_lines.append(f"- **Files Changed:** {total_files}")
    md_lines.append(f"- **Insertions:** +{total_insertions}")
    md_lines.append(f"- **Deletions:** -{total_deletions}")
    md_lines.append("")
    
    # Breakdown by type
    md_lines.append("### Breakdown by Type")
    md_lines.append("")
    for commit_type in ['feat', 'fix', 'docs', 'style', 'refactor', 'test', 'perf', 'ops', 'chore', 'other']:
        count = len(commits_by_type[commit_type])
        if count > 0:
            title, emoji = type_info[commit_type]
            # Extract text without emoji (split at first space and take second part)
            title_text = title.split(' ', 1)[1] if ' ' in title else title
            md_lines.append(f"- {emoji} {title_text}: {count}")
    md_lines.append("")
    
    return md_lines


def main():
    parser = argparse.ArgumentParser(
        description='Export commit messages from current repository for release notes',
        formatter_class=argparse.RawDescriptionHelpFormatter
    )
    
    parser.add_argument(
        '--num_commits',
        type=int,
        default=10,
        help='Number of commits to export (default: 10)'
    )
    
    parser.add_argument(
        '--output',
        type=str,
        default='release_notes.json',
        help='Output JSON file path (default: release_notes.json)'
    )
    
    parser.add_argument(
        '--repo_path',
        type=str,
        default='.',
        help='Path to the repository (default: current directory)'
    )
    
    parser.add_argument(
        '--branch',
        type=str,
        default='main',
        help='Branch to analyze (default: main)'
    )
    
    parser.add_argument(
        '--markdown',
        type=str,
        nargs='?',
        const='RELEASE_NOTES.md',
        default='RELEASE_NOTES.md',
        help='Optional output markdown file path (e.g., RELEASE_NOTES.md). If provided without a value, uses the default.'
    )

    parser.add_argument(
        '--md_latest_release_only',
        action='store_true',
        help='Generate markdown only for the latest tagged release (ignores Incoming and older releases). '
             'If no tags are found, output remains unchanged.'
    )
    
    parser.add_argument(
        '--md_timeline',
        action='store_true',
        help='Include timeline visualization in markdown output (default: False)'
    )

    parser.add_argument(
        '--exclude_title',
        action='append',
        default=[],
        help='Regex pattern to exclude commits by title (repeatable)'
    )

    parser.add_argument(
        '--exclude_author',
        action='append',
        default=[],
        help='Regex pattern to exclude commits by author (repeatable)'
    )

    parser.add_argument(
        '--exclude_message',
        action='append',
        default=[],
        help='Regex pattern to exclude commits by full message content (repeatable)'
    )
    
    args = parser.parse_args()
    
    # Export release notes
    export_release_notes(
        args.repo_path,
        args.num_commits,
        args.output,
        args.branch,
        args.markdown,
        latest_release_only=args.md_latest_release_only,
        include_timeline=args.md_timeline,
        exclude_title_patterns=args.exclude_title,
        exclude_author_patterns=args.exclude_author,
        exclude_message_patterns=args.exclude_message
    )


if __name__ == '__main__':
    main()
