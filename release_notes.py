"""
Export commit messages from the current repository for release notes.

This script extracts the last N commits from the current repository
and exports them to JSON format for publishing release notes on GitHub Pages.
"""

import git
import json
import argparse
from datetime import datetime
from pathlib import Path


def timestamp_to_date(timestamp):
    """Convert Unix timestamp to date string (YYYY-MM-DD HH:MM:SS)."""
    return datetime.fromtimestamp(timestamp).strftime('%Y-%m-%d %H:%M:%S')


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


def get_repository_commits(repo_path, num_commits=10, branch='main'):
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


def export_release_notes(repo_path, num_commits, output_path, branch='main', markdown_path=None, latest_release_only=False):
    """
    Export commit messages from current repository to JSON for release notes.
    
    Args:
        repo_path: Path to the repository
        num_commits: Number of commits to export
        output_path: Path to save JSON file
        branch: Branch to analyze
        markdown_path: Optional path to save markdown file
    """
    print(f"[*] Extracting {num_commits} commits from branch '{branch}'...")
    
    commits = get_repository_commits(repo_path, num_commits, branch)
    
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
        markdown_content = generate_markdown(release_data, latest_release_only=latest_release_only)
        with open(markdown_path, 'w', encoding='utf-8') as f:
            f.write(markdown_content)
        print(f"[OK] Generated markdown file: {markdown_path}")
    
    return release_data


def generate_markdown(release_data, latest_release_only=False):
    """
    Generate markdown formatted release notes from release data.
    
    Args:
        release_data: Dictionary containing release note data
    
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
    
    # Check if there are release tags (tags starting with v or V)
    releases = parse_releases(release_data['commits'])
    
    if releases:
        if latest_release_only:
            latest_release = next((release for release in releases if not release['is_virtual']), None)
            if latest_release:
                releases = [latest_release]
        # Structure by releases
        md_lines.extend(generate_markdown_by_release(releases, release_data))
    else:
        # Structure by commit type (original behavior)
        md_lines.extend(generate_markdown_by_type(release_data))
    
    return '\n'.join(md_lines)


def parse_releases(commits):
    """
    Parse commits to identify releases based on tags starting with 'v' or 'V'.
    
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
    
    # Filter to only include release tags (starting with 'v' or 'V')
    release_tags = [tag for tag in tag_first_index.keys() if tag.startswith('v') or tag.startswith('V')]
    
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


def generate_markdown_by_release(releases, release_data):
    """
    Generate markdown structured by releases.
    
    Args:
        releases: List of release dictionaries
        release_data: Full release data
    
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


def generate_markdown_by_type(release_data):
    """
    Generate markdown structured by commit date (chronological order).
    
    Args:
        release_data: Full release data
    
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
        '--latest_release_only',
        action='store_true',
        help='Generate markdown only for the latest tagged release (ignores Incoming and older releases). '
             'If no tags are found, output remains unchanged.'
    )
    
    args = parser.parse_args()
    
    # Export release notes
    export_release_notes(
        args.repo_path,
        args.num_commits,
        args.output,
        args.branch,
        args.markdown,
        latest_release_only=args.latest_release_only
    )


if __name__ == '__main__':
    main()
