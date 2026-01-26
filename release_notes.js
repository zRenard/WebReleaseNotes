const TYPE_LABELS = {
    'feat': { label: 'Features', icon: '✨', emoji: '🎉' },
    'fix': { label: 'Bug Fixes', icon: '🐛', emoji: '🔧' },
    'docs': { label: 'Documentation', icon: '📝', emoji: '📚' },
    'chore': { label: 'Chores & Maintenance', icon: '🔧', emoji: '⚙️' },
    'other': { label: 'Other Changes', icon: '📦', emoji: '📌' }
};

let currentViewMode = 'commit'; // 'commit' or 'release'
let globalData = null; // Store data globally for mode switching
let releases = []; // Store aggregated releases

async function loadReleaseNotes() {
    const viewControls = document.getElementById('view-controls');
    
    try {
        const response = await fetch('release_notes.json');
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        globalData = data;
        
        // Parse releases from tags
        releases = parseReleases(data.commits);
        
        // Show view controls only if there are tags/releases
        if (viewControls) {
            if (releases.length > 0) {
                viewControls.classList.remove('hidden');
                setupModeButtons();
            } else {
                viewControls.classList.add('hidden');
            }
        }
        
        displayMetadata(data);
        displayCommits(data);
        
    } catch (error) {
        console.error('Error loading release notes:', error);
        
        // Hide view controls if data fails to load
        if (viewControls) {
            viewControls.classList.add('hidden');
        }
        
        document.getElementById('metadata').innerHTML = `
            <div class="error">
                <strong>Error loading release notes:</strong> ${error.message}
            </div>
        `;
        document.getElementById('download-json').classList.add('hidden');
    }
}

function displayMetadata(data) {
    const repoUrl = data.repository.url;
    const repoLink = repoUrl ? `<a href="${repoUrl}" target="_blank" class="repo-link">${data.repository.name}</a>` : data.repository.name;
    
    // Update page title with repository name
    document.getElementById('page-title').textContent = `${data.repository.name} - Release Notes`;
    
    document.getElementById('metadata').innerHTML = `
        <strong>Repository:</strong> ${repoLink} (${data.repository.branch}) | 
        <strong>Generated:</strong> ${data.generated_at}
    `;
}

function parseReleases(commits) {
    // Build a map of tags with their first appearance index
    const tagFirstIndex = {}; // tag -> index in commits array
    
    commits.forEach((commit, index) => {
        if (commit.tags && commit.tags.length > 0) {
            commit.tags.forEach(tag => {
                if (!(tag in tagFirstIndex)) {
                    tagFirstIndex[tag] = index;
                }
            });
        }
    });
    
    // Filter to only include release tags (starting with 'v' or 'V')
    const releaseTags = Object.keys(tagFirstIndex).filter(tag => 
        tag.startsWith('v') || tag.startsWith('V')
    );
    
    // Get unique commit indices where release tags appear (in order)
    const uniqueIndices = [...new Set(releaseTags.map(tag => tagFirstIndex[tag]))];
    uniqueIndices.sort((a, b) => a - b);
    
    // For each unique index, collect all release tags that appear at that index
    const tagGroups = []; // [{ index, tags: [...] }]
    uniqueIndices.forEach(index => {
        const tagsAtIndex = releaseTags.filter(tag => tagFirstIndex[tag] === index);
        tagGroups.push({ index, tags: tagsAtIndex });
    });
    
    const releasesList = [];
    
    for (let i = 0; i < tagGroups.length; i++) {
        const currentGroup = tagGroups[i];
        const nextGroup = i < tagGroups.length - 1 ? tagGroups[i + 1] : null;
        
        const startIndex = currentGroup.index;
        const endIndex = nextGroup ? nextGroup.index : commits.length;
        
        const releaseCommits = commits.slice(startIndex, endIndex);
        releasesList.push({
            tag: currentGroup.tags.join(' / '), // Merge multiple tags on same commit
            commits: releaseCommits,
            startDate: releaseCommits[0]?.date,
            endDate: releaseCommits[releaseCommits.length - 1]?.date,
            commitCount: releaseCommits.length
        });
    }
    
    // Sort by date (most recent first)
    return releasesList.sort((a, b) => {
        const dateA = new Date(a.startDate || 0);
        const dateB = new Date(b.startDate || 0);
        return dateB - dateA; // Descending order (most recent first)
    });
}

function setupModeButtons() {
    const commitBtn = document.getElementById('btn-by-commit');
    const releaseBtn = document.getElementById('btn-by-release');
    const releaseSelector = document.getElementById('release-selector');
    const releaseDropdown = document.getElementById('release-dropdown');
    
    if (commitBtn) {
        commitBtn.addEventListener('click', () => {
            currentViewMode = 'commit';
            commitBtn.classList.add('active');
            releaseBtn.classList.remove('active');
            releaseSelector.classList.add('hidden');
            displayCommits(globalData);
        });
    }
    
    if (releaseBtn) {
        releaseBtn.addEventListener('click', () => {
            currentViewMode = 'release';
            releaseBtn.classList.add('active');
            commitBtn.classList.remove('active');
            releaseSelector.classList.remove('hidden');
            populateReleaseDropdown();
            displayReleaseView(null);
        });
    }
    
    if (releaseDropdown) {
        releaseDropdown.addEventListener('change', (e) => {
            const selectedRelease = e.target.value;
            displayReleaseView(selectedRelease);
        });
    }
}

function populateReleaseDropdown() {
    const dropdown = document.getElementById('release-dropdown');
    if (!dropdown) return;
    
    // Clear options except the first one
    while (dropdown.options.length > 1) {
        dropdown.remove(1);
    }
    
    releases.forEach(release => {
        const option = document.createElement('option');
        option.value = release.tag;
        option.textContent = `${release.tag} (${release.commitCount} commits)`;
        dropdown.appendChild(option);
    });
}

function displayReleaseView(selectedReleaseTag) {
    const container = document.getElementById('releases-container');
    container.innerHTML = '';
    
    let releasesToDisplay = releases;
    if (selectedReleaseTag) {
        releasesToDisplay = releases.filter(r => r.tag === selectedReleaseTag);
    }
    
    if (releasesToDisplay.length === 0) {
        container.innerHTML = '<div class="empty-section">No releases found.</div>';
        return;
    }
    
    // Build HTML for releases
    const releaseHTML = releasesToDisplay.map(release => {
        // Group commits by type
        const grouped = { feat: [], fix: [], docs: [], chore: [], other: [] };
        release.commits.forEach(c => {
            const t = (c.type || 'other').toLowerCase();
            if (grouped[t]) {
                grouped[t].push(c);
            } else {
                grouped.other.push(c);
            }
        });
        
        // Build commit list HTML
        const commitListHTML = release.commits.map(commit => 
            createCommitHTML(commit, globalData.repository.url)
        ).join('');
        
        // Build category summary
        const categorySummary = Object.entries(grouped)
            .filter(([, commits]) => commits.length > 0)
            .map(([type, commits]) => {
                const typeInfo = TYPE_LABELS[type] || { label: type, icon: '📦' };
                return `<span class="release-category-badge ${type}">${typeInfo.icon} ${typeInfo.label}: ${commits.length}</span>`;
            })
            .join('');
        
        return `
            <div class="release-section" data-release-tag="${escapeHtml(release.tag)}">
                <div class="release-header">
                    <h2 class="release-title">🏷️ ${escapeHtml(release.tag)}</h2>
                    <div class="release-meta">
                        <span class="release-commit-count">📊 ${release.commitCount} commits</span>
                        <span class="release-date-range">📅 ${release.startDate} to ${release.endDate}</span>
                    </div>
                </div>
                <div class="release-summary">
                    ${categorySummary}
                </div>
                <ul class="commit-list">
                    ${commitListHTML}
                </ul>
            </div>
        `;
    }).join('');
    
    container.innerHTML = releaseHTML;
    setupToggleHandlers();
    
    // Add click handlers to release panels
    const releasePanels = container.querySelectorAll('.release-section');
    releasePanels.forEach(panel => {
        panel.addEventListener('click', (e) => {
            // Don't trigger if clicking on links or interactive elements
            if (e.target.tagName === 'A' || e.target.closest('a')) {
                return;
            }
            
            const releaseTag = panel.getAttribute('data-release-tag');
            const dropdown = document.getElementById('release-dropdown');
            if (dropdown && releaseTag) {
                dropdown.value = releaseTag;
                displayReleaseView(releaseTag);
            }
        });
    });
    
    updateSummaryForReleaseView(releasesToDisplay);
}

function updateSummaryForReleaseView(releasesToDisplay) {
    const summaryEl = document.getElementById('summary');
    const totalCommits = releasesToDisplay.reduce((sum, r) => sum + r.commitCount, 0);
    
    // Aggregate counts by type
    const aggregated = { feat: 0, fix: 0, docs: 0, chore: 0, other: 0, total: totalCommits };
    releasesToDisplay.forEach(release => {
        release.commits.forEach(c => {
            const t = (c.type || 'other').toLowerCase();
            if (aggregated[t] !== undefined) {
                aggregated[t]++;
            }
        });
    });
    
    displaySummary(aggregated, releasesToDisplay.flatMap(r => r.commits));
}

function displaySummary(summary, commits) {
    const summaryEl = document.getElementById('summary');
    summaryEl.style.display = 'flex';
    
    // Build cards dynamically based on what types are in the summary
    const allKeys = Object.keys(summary).filter(k => k !== 'total');
    
    // Count commits with tags
    const taggedCommitsCount = commits.filter(c => c.tags && c.tags.length > 0).length;
    
    // Build timeline
    const timeline = buildTimeline(commits);
    
    // Build total card with tag count
    const totalCard = `
        <div class="summary-card total active" data-type="all">
            <span class="icon">📊</span>
            <div class="summary-numbers">
                <div class="summary-main">
                    <span class="number">${summary.total}</span>
                    <span class="label">Total Commits</span>
                </div>
                ${taggedCommitsCount > 0 ? `
                <div class="summary-sub">
                    <span class="icon-tag">🏷</span>
                    <span class="number-small">${taggedCommitsCount}</span>
                    <span class="label-small">Tagged</span>
                </div>
                ` : ''}
            </div>
        </div>
    `;
    
    const summaryTop = `
        <div class="summary-top">
            ${totalCard}
            ${timeline}
        </div>
    `;
    
    // Build category cards for types with counts > 0
    const categoryCards = [];
    
    // Add Tags category card first if there are tagged commits
    if (taggedCommitsCount > 0) {
        categoryCards.push(`
            <div class="summary-card tags" data-type="tags">
                <span class="icon">🏷️</span>
                <span class="number">${taggedCommitsCount}</span>
                <span class="label">Tags</span>
            </div>
        `);
    }
    
    allKeys.forEach(key => {
        if (key !== 'total') {
            const value = summary[key];
            if (value && value > 0) {
                const typeInfo = TYPE_LABELS[key] || { label: key, icon: '📦' };
                categoryCards.push(`
                    <div class="summary-card ${key}" data-type="${key}">
                        <span class="icon">${typeInfo.icon}</span>
                        <span class="number">${value}</span>
                        <span class="label">${typeInfo.label}</span>
                    </div>
                `);
            }
        }
    });
    
    const categoriesSection = categoryCards.length > 0 ? `
        <div class="summary-categories">
            ${categoryCards.join('')}
        </div>
    ` : '';
    
    summaryEl.innerHTML = summaryTop + categoriesSection;
    
    // Add click handlers for filtering
    document.querySelectorAll('.summary-card').forEach(card => {
        card.addEventListener('click', function() {
            const filterType = this.getAttribute('data-type');
            filterCommitsByType(filterType);
            
            // Collapse all commits when showing all
            if (filterType === 'all') {
                collapseAllCommits();
            }
            
            // Update active state
            document.querySelectorAll('.summary-card').forEach(c => c.classList.remove('active'));
            this.classList.add('active');
            
            // Deactivate timeline dots
            document.querySelectorAll('.timeline-commit').forEach(d => d.classList.remove('active'));
        });
    });
}

function buildTimeline(commits) {
    if (!commits || commits.length === 0) return '';
    
    // Get first and last commit timestamps
    const timestamps = commits.map(c => c.timestamp).sort((a, b) => a - b);
    const firstTime = timestamps[0];
    const lastTime = timestamps[timestamps.length - 1];
    const timeRange = lastTime - firstTime || 1; // Avoid division by zero
    
    // Build commit markers and tag markers
    const markers = commits.map(commit => {
        const position = ((commit.timestamp - firstTime) / timeRange) * 100;
        const leftClass = 'left-' + Math.round(position);
        const typeKey = (commit.type || 'other').toLowerCase();
        const title = `${commit.message_short} (${commit.date})`;
        
        // Check if commit has tags
        if (commit.tags && commit.tags.length > 0) {
            const tagTitle = `TAG: ${commit.tags.join(', ')} - ${commit.message_short} (${commit.date})`;
            return `<div class="timeline-tag ${leftClass}" title="${tagTitle.replace(/"/g, '&quot;')}" data-commit-hash="${commit.hash}" data-is-tag="true"></div>`;
        }
        
        return `<div class="timeline-commit type-${typeKey} ${leftClass}" title="${title.replace(/"/g, '&quot;')}" data-commit-hash="${commit.hash}"></div>`;
    }).join('');
    
    // Build graduation marks (10 marks across the timeline)
    const graduations = [];
    for (let i = 0; i <= 10; i++) {
        const position = (i / 10) * 100;
        const leftClass = 'left-' + Math.round(position);
        const timestamp = firstTime + (timeRange / 10) * i;
        const date = new Date(timestamp * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        graduations.push(`
            <div class="timeline-graduation ${leftClass}">
                <div class="graduation-tick"></div>
                <div class="graduation-label">${date}</div>
            </div>
        `);
    }
    const graduationHTML = graduations.join('');
    
    // Format dates
    const firstDate = new Date(firstTime * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    const lastDate = new Date(lastTime * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    
    const timelineHTML = `
        <div class="commit-timeline">
            <div class="timeline-label">Commit Timeline</div>
            <div class="timeline-track-container">
                <div class="timeline-track" id="timeline-track">
                    <div class="timeline-graduations">
                        ${graduationHTML}
                    </div>
                    ${markers}
                </div>
            </div>
            <div class="timeline-dates">
                <span>${firstDate}</span>
                <span>${lastDate}</span>
            </div>
            <div class="timeline-zoom">
                <span class="timeline-zoom-label">Zoom</span>
                <input type="range" class="timeline-zoom-slider" id="timeline-zoom-slider" min="1" max="10" step="0.5" value="1">
                <span class="timeline-zoom-value" id="timeline-zoom-value">1x</span>
            </div>
        </div>
    `;
    
    // Add click handlers after rendering
    setTimeout(() => {
        setupTimelineHandlers();
    }, 150);
    
    return timelineHTML;
}

function setupTimelineHandlers() {
    // Handle commits
    document.querySelectorAll('.timeline-commit').forEach(dot => {
        dot.addEventListener('click', (e) => {
            e.stopPropagation();
            const hash = dot.getAttribute('data-commit-hash');
            filterByCommitHash(hash);
            
            // Update timeline active state
            document.querySelectorAll('.timeline-commit, .timeline-tag').forEach(d => d.classList.remove('active'));
            dot.classList.add('active');
        });
    });
    
    // Handle tags
    document.querySelectorAll('.timeline-tag').forEach(tag => {
        tag.addEventListener('click', (e) => {
            e.stopPropagation();
            const hash = tag.getAttribute('data-commit-hash');
            filterByCommitHash(hash);
            
            // Update timeline active state
            document.querySelectorAll('.timeline-commit, .timeline-tag').forEach(d => d.classList.remove('active'));
            tag.classList.add('active');
        });
    });
    
    // Add zoom slider handler
    const zoomSlider = document.getElementById('timeline-zoom-slider');
    const zoomValue = document.getElementById('timeline-zoom-value');
    const timelineTrack = document.getElementById('timeline-track');
    
    if (zoomSlider && zoomValue && timelineTrack) {
        // Fonction utilitaire pour appliquer la classe de zoom
        function setZoomClass(track, zoom) {
            // Nettoie les anciennes classes zoom-*
            Array.from(track.classList).forEach(c => {
                if (c.startsWith('zoom-')) track.classList.remove(c);
            });
            // Ajoute la nouvelle classe (remplace '.' par '-')
            let zoomClass = 'zoom-' + String(zoom).replace('.', '-');
            track.classList.add(zoomClass);
        }

        // Set initial zoom
        const initialZoom = parseFloat(zoomSlider.value);
        setZoomClass(timelineTrack, initialZoom);
        zoomValue.textContent = initialZoom + 'x';

        zoomSlider.addEventListener('input', (e) => {
            const zoom = parseFloat(e.target.value);
            setZoomClass(timelineTrack, zoom);
            zoomValue.textContent = zoom + 'x';
        });
    }
}

function collapseAllCommits() {
    document.querySelectorAll('.commit-body.expanded').forEach(body => {
        body.classList.remove('expanded');
        body.classList.add('collapsed');
    });
}

function filterByCommitHash(hash) {
    const commits = document.querySelectorAll('.commit-item');
    
    commits.forEach(commit => {
        const targetId = commit.getAttribute('data-target');
        if (targetId === `commit-${hash}`) {
            commit.classList.remove('hidden');
            // Auto-expand the commit details
            const body = document.getElementById(targetId);
            if (body && body.classList.contains('collapsed')) {
                body.classList.remove('collapsed');
                body.classList.add('expanded');
            }
            // Scroll to it smoothly
            setTimeout(() => {
                commit.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }, 100);
        } else {
            commit.classList.add('hidden');
        }
    });
    
    // Update summary cards to deactivate all
    document.querySelectorAll('.summary-card').forEach(c => c.classList.remove('active'));
}

function scrollToCommit(hash) {
    const commitItem = document.querySelector(`[data-target="commit-${hash}"]`);
    if (commitItem) {
        // Remove previous highlights
        document.querySelectorAll('.commit-item.highlight').forEach(item => {
            item.classList.remove('highlight');
        });
        
        // Scroll to commit
        commitItem.scrollIntoView({ behavior: 'smooth', block: 'start' });
        
        // Highlight commit
        commitItem.classList.add('highlight');
        
        // Expand commit details
        const targetId = commitItem.getAttribute('data-target');
        const body = document.getElementById(targetId);
        if (body && body.classList.contains('collapsed')) {
            body.classList.remove('collapsed');
            body.classList.add('expanded');
        }
    }
}

function filterCommitsByType(type) {
    const commits = document.querySelectorAll('.commit-item');
    const timelineDots = document.querySelectorAll('.timeline-commit');
    
    commits.forEach(commit => {
        if (type === 'all') {
            commit.classList.remove('hidden');
        } else if (type === 'tags') {
            // Show only commits that have tags
            const commitElement = commit;
            const hasTag = commitElement.classList.contains('has-tag');
            if (hasTag) {
                commit.classList.remove('hidden');
            } else {
                commit.classList.add('hidden');
            }
        } else {
            const commitType = commit.getAttribute('data-commit-type');
            if (commitType === type) {
                commit.classList.remove('hidden');
            } else {
                commit.classList.add('hidden');
            }
        }
    });

    // Also filter timeline dots and tags based on their type class
    timelineDots.forEach(dot => {
        dot.classList.remove('visible', 'hidden', 'opaque-0', 'opaque-1');
        if (type === 'all') {
            dot.classList.add('visible');
        } else if (type === 'tags') {
            // Hide all regular commit dots when showing tags
            dot.classList.add('hidden', 'opaque-0');
        } else {
            const dotTypeClass = Array.from(dot.classList).find(c => c.startsWith('type-'));
            if (dotTypeClass) {
                const dotType = dotTypeClass.replace('type-', '');
                if (dotType === type) {
                    dot.classList.add('visible');
                } else {
                    dot.classList.add('hidden', 'opaque-0');
                }
            }
        }
    });
    
    // Handle tags separately
    const timelineTags = document.querySelectorAll('.timeline-tag');
    timelineTags.forEach(tag => {
        tag.classList.remove('hidden', 'opaque-0');
        tag.style.opacity = '';
        if (type === 'all' || type === 'tags') {
            tag.classList.add('visible');
        } else {
            // Tags stay visible but dimmed when filtering by type
            tag.style.opacity = '0.6';
        }
    });
}

function displayCommits(data) {
    const container = document.getElementById('releases-container');
    container.innerHTML = '';
    
    // Build a reliable grouping from commits using commit.type field
    const grouped = { feat: [], fix: [], docs: [], chore: [], other: [] };
    if (Array.isArray(data.commits)) {
        data.commits.forEach(c => {
            const t = (c.type || 'other').toLowerCase();
            if (grouped[t]) {
                grouped[t].push(c);
            } else {
                grouped.other.push(c);
            }
        });
    }

    // Recompute summary from the regrouped data using correct type keys
    const summary = {
        total: Array.isArray(data.commits) ? data.commits.length : 0,
        feat: (grouped.feat || []).length,
        fix: (grouped.fix || []).length,
        docs: (grouped.docs || []).length,
        chore: (grouped.chore || []).length,
        other: (grouped.other || []).length,
    };
    displaySummary(summary, data.commits);
    
    // Display all commits in original JSON order with type badges
    if (Array.isArray(data.commits) && data.commits.length > 0) {
        container.innerHTML = `
            <ul class="commit-list">
                ${data.commits.map(commit => createCommitHTML(commit, data.repository.url)).join('')}
            </ul>
        `;
    } else {
        container.innerHTML = '<div class="empty-section">No commits found.</div>';
    }

    setupToggleHandlers();
}

function createCommitHTML(commit, repoUrl) {
    const commitUrl = repoUrl ? `${repoUrl}/commit/${commit.hash}` : '#';
    const summaryText = escapeHtml(commit.message_short || (commit.message.split('\n')[0] || ''));
    const fullMessage = escapeHtml(commit.message);
    const bodyId = `commit-${commit.hash}`;
    const isRenovate = /renovate/i.test(commit.author || '');
    const hasTag = commit.tags && commit.tags.length > 0;
    const commitClass = isRenovate ? 'commit-item commit-renovate' : 'commit-item';
    const tagClass = hasTag ? ' has-tag' : '';
    const typeKey = (commit.type || 'other').toLowerCase();
    const typeInfo = TYPE_LABELS[typeKey] || { label: typeKey };
    const typeClass = `type-${typeKey}`;
    
    // Build tag badges HTML
    const tagBadges = hasTag ? commit.tags.map(tag => 
        `<span class="commit-tag" title="Git Tag: ${escapeHtml(tag)}">${escapeHtml(tag)}</span>`
    ).join('') : '';
    
    return `
        <li class="${commitClass}${tagClass}" data-target="${bodyId}" data-commit-type="${typeKey}">
            <div class="commit-header">
                <div class="commit-header-left">
                    <a href="${commitUrl}" target="_blank" class="commit-hash" title="${commit.hash}">
                        ${commit.short_hash}
                    </a>
                    <span class="commit-type ${typeClass}" title="${typeInfo.label}">${typeInfo.label}</span>
                    ${tagBadges}
                </div>
                <span class="commit-date">${commit.date}</span>
            </div>
            <div class="commit-summary">${summaryText}</div>
            <div class="commit-body collapsed" id="${bodyId}">
                <div class="commit-message">${fullMessage}</div>
                <div class="commit-footer">
                    <span class="commit-author">by ${escapeHtml(commit.author)}</span>
                    <div class="commit-stats">
                        <span class="stat additions" title="Insertions">+${commit.insertions}</span>
                        <span class="stat deletions" title="Deletions">-${commit.deletions}</span>
                        <span class="stat" title="Files changed">📄 ${commit.files_changed}</span>
                    </div>
                </div>
            </div>
        </li>
    `;
}

function setupToggleHandlers() {
    const items = document.querySelectorAll('.commit-item');
    items.forEach(item => {
        item.addEventListener('click', (event) => {
            if (event.target.closest('a.commit-hash')) {
                return; // allow link clicks without toggling
            }

            const targetId = item.getAttribute('data-target');
            const body = document.getElementById(targetId);
            if (!body) return;

            const isCollapsed = body.classList.contains('collapsed');
            body.classList.toggle('collapsed', !isCollapsed);
            body.classList.toggle('expanded', isCollapsed);
        });
    });
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

loadReleaseNotes();