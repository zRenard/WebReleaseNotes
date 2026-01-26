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
        if prefix in ['chore', 'ci', 'build', 'test', 'refactor', 'perf']:
            return 'chore'

    # Author-based heuristic (bots/dependency updaters)
    if 'renovate' in author_l or 'dependabot' in author_l:
        return 'chore'

    # Message heuristics
    if any(word in first_l for word in ['fix', 'bug', 'hotfix', 'patch', 'resolve', 'error', 'issue','correction','ajustement', 'réparation','bugfix']):
        return 'fix'
    if any(word in first_l for word in ['doc', 'readme', 'changelog']):
        return 'docs'
    if any(word in first_l for word in ['feat', 'feature', 'add ', 'introduce', 'implement', 'new ', 'ajout ']):
        return 'feat'
    if any(word in first_l for word in ['update', 'bump', 'upgrade', 'deps', 'dependency', 'refactor', 'cleanup', 'chore']):
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
                'date': datetime.fromtimestamp(commit.authored_date).strftime('%Y-%m-%d %H:%M:%S'),
                'date_iso': datetime.fromtimestamp(commit.authored_date).isoformat(),
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


def export_release_notes(repo_path, num_commits, output_path, branch='main'):
    """
    Export commit messages from current repository to JSON for release notes.
    
    Args:
        repo_path: Path to the repository
        num_commits: Number of commits to export
        output_path: Path to save JSON file
        branch: Branch to analyze
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
    
    return release_data


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
    
    args = parser.parse_args()
    
    # Export release notes
    export_release_notes(
        args.repo_path,
        args.num_commits,
        args.output,
        args.branch
    )


if __name__ == '__main__':
    main()
