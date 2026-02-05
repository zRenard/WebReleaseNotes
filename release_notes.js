const TYPE_LABELS = {
    'feat': { label: 'Features', icon: '✨', emoji: '✨' },
    'fix': { label: 'Bug Fixes', icon: '🐛', emoji: '🐛' },
    'docs': { label: 'Documentation', icon: '📚', emoji: '📚' },
    'style': { label: 'Code Style', icon: '💎', emoji: '💎' },
    'refactor': { label: 'Code Refactoring', icon: '♻️', emoji: '♻️' },
    'test': { label: 'Tests', icon: '✅', emoji: '✅' },
    'perf': { label: 'Performance', icon: '⚡', emoji: '⚡' },
    'ops': { label: 'CI/CD & Build', icon: '🚀', emoji: '🚀' },
    'chore': { label: 'Chores', icon: '🔧', emoji: '🔧' },
    'other': { label: 'Other Changes', icon: '📌', emoji: '📌' }
};

// Helper function to format timestamp to date string (YYYY-MM-DD HH:MM:SS)
function formatTimestampToDate(timestamp) {
    const date = new Date(timestamp * 1000);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');
    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

// Helper function to check if a tag is a stable release (no prerelease segment)
// Excludes tags with prerelease markers like -alpha, -beta, -rc, etc.
function isReleaseVersionTag(tag) {
    if (tag.includes('-')) {
        return false;
    }
    // (?:\+[vV]+)?
    const releasePattern = /^[vV]?\d+\.\d+\.\d+(?:\+[a-zA-Z0-9.-]+)?$/;
    return releasePattern.test(tag);
}

let currentViewMode = 'commit'; // 'commit' or 'release'
let globalData = null; // Store data globally for mode switching
let releases = []; // Store aggregated releases

const THEME_STORAGE_KEY = 'releaseNotesTheme';

function getPreferredTheme() {
    if (globalThis.matchMedia?.('(prefers-color-scheme: dark)').matches) {
        return 'dark';
    }
    return 'light';
}

function applyTheme(theme) {
    document.body.classList.toggle('theme-dark', theme === 'dark');
}

function updateThemeToggleLabel(button, theme) {
    if (!button) return;
    if (theme === 'dark') {
        button.textContent = '☀️';
        button.title = 'Switch to light theme';
    } else {
        button.textContent = '🌙';
        button.title = 'Switch to dark theme';
    }
}

function setupThemeToggle() {
    const button = document.getElementById('theme-toggle');
    if (!button) return;

    const storedTheme = localStorage.getItem(THEME_STORAGE_KEY);
    let activeTheme = storedTheme || getPreferredTheme();

    applyTheme(activeTheme);
    updateThemeToggleLabel(button, activeTheme);

    button.addEventListener('click', () => {
        activeTheme = document.body.classList.contains('theme-dark') ? 'light' : 'dark';
        localStorage.setItem(THEME_STORAGE_KEY, activeTheme);
        applyTheme(activeTheme);
        updateThemeToggleLabel(button, activeTheme);
    });

    if (!storedTheme && globalThis.matchMedia) {
        const mediaQuery = globalThis.matchMedia('(prefers-color-scheme: dark)');
        mediaQuery.addEventListener('change', (event) => {
            const systemTheme = event.matches ? 'dark' : 'light';
            applyTheme(systemTheme);
            updateThemeToggleLabel(button, systemTheme);
        });
    }
}

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

        // Update release count badges
        const incomingBadge = document.getElementById('incoming-badge');
        const realReleaseBadge = document.getElementById('real-release-badge');
        const incomingCount = releases.filter(r => r.isVirtual).length;
        const realReleaseCount = releases.filter(r => !r.isVirtual).length;
        
        if (incomingBadge) {
            incomingBadge.textContent = incomingCount;
            if (incomingCount > 0) {
                incomingBadge.classList.remove('badge-hidden');
            } else {
                incomingBadge.classList.add('badge-hidden');
            }
        }
        if (realReleaseBadge) {
            realReleaseBadge.textContent = realReleaseCount;
            if (realReleaseCount > 0) {
                realReleaseBadge.classList.remove('badge-hidden');
            } else {
                realReleaseBadge.classList.add('badge-hidden');
            }
        }

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
        
        // Initialize search after commits are displayed
        setTimeout(() => {
            initSearch();
        }, 200);
        
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
    
    // Update page title and document title with repository name
    const titleText = `${data.repository.name} - Release Notes`;
    document.getElementById('page-title').textContent = titleText;
    document.title = titleText;
    
    document.getElementById('metadata').innerHTML = `
        <strong>Repository:</strong> ${repoLink} | 
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
    
    // Filter to only include stable release tags (SemVer without prerelease optionnaly star with 'v' or 'V')
    const releaseTags = Object.keys(tagFirstIndex).filter(tag => 
        isReleaseVersionTag(tag)
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
    
    // Check for commits before the first tag (Incoming commits)
    if (tagGroups.length > 0 && tagGroups[0].index > 0) {
        const incomingCommits = commits.slice(0, tagGroups[0].index);
        releasesList.push({
            tag: 'Incoming',
            commits: incomingCommits,
            startDate: incomingCommits[0] ? formatTimestampToDate(incomingCommits[0].timestamp) : 'Unknown',
            endDate: incomingCommits[incomingCommits.length - 1] ? formatTimestampToDate(incomingCommits[incomingCommits.length - 1].timestamp) : 'Unknown',
            commitCount: incomingCommits.length,
            isVirtual: true
        });
    }
    
    for (let i = 0; i < tagGroups.length; i++) {
        const currentGroup = tagGroups[i];
        const nextGroup = i < tagGroups.length - 1 ? tagGroups[i + 1] : null;
        
        const startIndex = currentGroup.index;
        const endIndex = nextGroup ? nextGroup.index : commits.length;
        
        const releaseCommits = commits.slice(startIndex, endIndex);
        releasesList.push({
            tag: currentGroup.tags.join(' / '), // Merge multiple tags on same commit
            commits: releaseCommits,
            startDate: formatTimestampToDate(releaseCommits[0]?.timestamp),
            endDate: formatTimestampToDate(releaseCommits[releaseCommits.length - 1]?.timestamp),
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
            setTimeout(() => {
                cacheCommitElements();
                if (searchQuery) {
                    performSearch(searchQuery);
                }
            }, 100);
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
            setTimeout(() => {
                cacheCommitElements();
                if (searchQuery) {
                    performSearch(searchQuery);
                }
            }, 100);
        });
    }
    
    if (releaseDropdown) {
        releaseDropdown.addEventListener('change', (e) => {
            const selectedRelease = e.target.value;
            displayReleaseView(selectedRelease);
            setTimeout(() => {
                cacheCommitElements();
                if (searchQuery) {
                    performSearch(searchQuery);
                }
            }, 100);
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
        option.classList.add(release.isVirtual ? 'option-incoming' : 'option-real');
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
        const grouped = { feat: [], fix: [], docs: [], style: [], refactor: [], test: [], perf: [], ops: [], chore: [], other: [] };
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
            <div class="release-section ${release.isVirtual ? 'virtual-release' : ''}" data-release-tag="${escapeHtml(release.tag)}">
                <div class="release-header">
                    <h2 class="release-title">${release.isVirtual ? '🚀' : '🏷️'} ${escapeHtml(release.tag)}</h2>
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
            // Don't trigger if clicking on links, interactive elements, or commit items
            if (e.target.tagName === 'A' || 
                e.target.closest('a') || 
                e.target.closest('.commit-item') ||
                e.target.classList.contains('commit-item')) {
                return;
            }
            
            const releaseTag = panel.dataset.releaseTag;
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
    const totalCommits = releasesToDisplay.reduce((sum, r) => sum + r.commitCount, 0);
    
    // Aggregate counts by type
    const aggregated = { feat: 0, fix: 0, docs: 0, style: 0, refactor: 0, test: 0, perf: 0, ops: 0, chore: 0, other: 0, total: totalCommits };
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

    // Build sparkline for commits per day
    const sparkline = buildSparkline(commits);

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
            ${sparkline}
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
            const filterType = this.dataset.type;
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
    
    // Get first and last commit timestamps (commits are in descending chronological order)
    const timestamps = commits.map(c => c.timestamp);
    const oldestTime = Math.min(...timestamps);
    const newestTime = Math.max(...timestamps);
    const timeRange = newestTime - oldestTime || 1; // Avoid division by zero
    
    // Build commit markers and tag markers (left = oldest, right = newest)
    const markers = commits.map(commit => {
        const position = ((commit.timestamp - oldestTime) / timeRange) * 100;
        const leftClass = 'left-' + Math.round(position);
        const typeKey = (commit.type || 'other').toLowerCase();
        const dateStr = formatTimestampToDate(commit.timestamp);
        const title = `${commit.message_short} (${dateStr})`;
        
        // Check if commit has tags
        if (commit.tags && commit.tags.length > 0) {
            const tagTitle = `TAG: ${commit.tags.join(', ')} - ${commit.message_short} (${dateStr})`;
            return `<div class="timeline-tag ${leftClass}" title="${tagTitle.replaceAll('"', '&quot;')}" data-commit-hash="${commit.hash}" data-is-tag="true"></div>`;
        }
        
        return `<div class="timeline-commit type-${typeKey} ${leftClass}" title="${title.replaceAll('"', '&quot;')}" data-commit-hash="${commit.hash}"></div>`;
    }).join('');
    
    // Build graduation marks (10 marks across the timeline, left = oldest, right = newest)
    const graduations = [];
    for (let i = 0; i <= 10; i++) {
        const position = (i / 10) * 100;
        const leftClass = 'left-' + Math.round(position);
        const timestamp = oldestTime + (timeRange / 10) * i;
        const date = new Date(timestamp * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        graduations.push(`
            <div class="timeline-graduation ${leftClass}">
                <div class="graduation-tick"></div>
                <div class="graduation-label">${date}</div>
            </div>
        `);
    }
    const graduationHTML = graduations.join('');
    
    // Format dates (left = oldest, right = newest)
    const oldestDate = new Date(oldestTime * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    const newestDate = new Date(newestTime * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    
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
                <span>${oldestDate}</span>
                <span>${newestDate}</span>
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

function buildSparkline(commits) {
    if (!commits || commits.length === 0) {
        return '';
    }

    // Get the same time range as the timeline
    const timestamps = commits.map(c => c.timestamp).filter(t => t);
    if (timestamps.length === 0) {
        return '';
    }

    const oldestTime = Math.min(...timestamps);
    const newestTime = Math.max(...timestamps);

    const countsByDay = new Map();
    commits.forEach(commit => {
        if (!commit.timestamp) return;
        const ts = commit.timestamp * 1000;
        const dayKey = new Date(ts).toISOString().slice(0, 10);
        countsByDay.set(dayKey, (countsByDay.get(dayKey) || 0) + 1);
    });

    // Use the timeline date range (oldest to newest)
    const startDate = new Date(oldestTime * 1000);
    const endDate = new Date(newestTime * 1000);
    const startUTC = new Date(Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth(), startDate.getUTCDate()));
    const endUTC = new Date(Date.UTC(endDate.getUTCFullYear(), endDate.getUTCMonth(), endDate.getUTCDate()));

    const dailyCounts = [];
    for (let d = new Date(startUTC); d <= endUTC; d = new Date(d.getTime() + 86400000)) {
        const key = d.toISOString().slice(0, 10);
        dailyCounts.push(countsByDay.get(key) || 0);
    }

    if (dailyCounts.length === 0) {
        return '';
    }

    const width = 120;
    const height = 36;
    const padding = 2;
    const maxCount = Math.max(...dailyCounts, 1);
    let points = [];
    let lastX;

    if (dailyCounts.length === 1) {
        const y = height - padding - (dailyCounts[0] / maxCount) * (height - padding * 2);
        points = [
            `${padding.toFixed(2)},${y.toFixed(2)}`,
            `${(width - padding).toFixed(2)},${y.toFixed(2)}`
        ];
        lastX = width - padding;
    } else {
        const step = (width - padding * 2) / (dailyCounts.length - 1);
        points = dailyCounts.map((value, index) => {
            const x = padding + index * step;
            const y = height - padding - (value / maxCount) * (height - padding * 2);
            return `${x.toFixed(2)},${y.toFixed(2)}`;
        });
        lastX = padding + (dailyCounts.length - 1) * step;
    }

    const areaPath = `M ${padding},${height - padding} L ${points.join(' L ')} L ${lastX.toFixed(2)},${height - padding} Z`;

    // Generate circle elements for each data point
    const circles = points.map(point => {
        const [x, y] = point.split(',');
        return `<circle class="sparkline-dot" cx="${x}" cy="${y}" r="1.5"></circle>`;
    }).join('');

    // Format date range for label
    const startDateStr = startDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const endDateStr = endDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    const totalCommits = dailyCounts.reduce((sum, count) => sum + count, 0);
    const daysSpan = dailyCounts.length;

    return `
        <div class="summary-sparkline">
            <div class="sparkline-label">Commits per day (${startDateStr} - ${endDateStr}, ${daysSpan} ${daysSpan === 1 ? 'day' : 'days'})</div>
            <svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" role="img" aria-label="Sparkline showing ${totalCommits} commits over ${daysSpan} days">
                <path class="sparkline-area" d="${areaPath}"></path>
                <polyline class="sparkline-line" points="${points.join(' ')}"></polyline>
                ${circles}
            </svg>
        </div>
    `;
}

function setupTimelineHandlers() {
    // Handle commits
    document.querySelectorAll('.timeline-commit').forEach(dot => {
        dot.addEventListener('click', (e) => {
            e.stopPropagation();
            const hash = dot.dataset.commitHash;
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
            const hash = tag.dataset.commitHash;
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
        const initialZoom = Number.parseFloat(zoomSlider.value);
        setZoomClass(timelineTrack, initialZoom);
        zoomValue.textContent = initialZoom + 'x';

        zoomSlider.addEventListener('input', (e) => {
            const zoom = Number.parseFloat(e.target.value);
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
        const targetId = commit.dataset.target;
        if (targetId === `commit-${hash}`) {
            commit.classList.remove('hidden');
            // Auto-expand the commit details
            const body = document.getElementById(targetId);
            if (body?.classList.contains('collapsed')) {
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
        const targetId = commitItem.dataset.target;
        const body = document.getElementById(targetId);
        if (body?.classList.contains('collapsed')) {
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
            const commitType = commit.dataset.commitType;
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
    const grouped = { feat: [], fix: [], docs: [], style: [], refactor: [], test: [], perf: [], ops: [], chore: [], other: [] };
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
        style: (grouped.style || []).length,
        refactor: (grouped.refactor || []).length,
        test: (grouped.test || []).length,
        perf: (grouped.perf || []).length,
        ops: (grouped.ops || []).length,
        chore: (grouped.chore || []).length,
        other: (grouped.other || []).length
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
        <li class="${commitClass}${tagClass}" data-target="${bodyId}" data-commit-type="${typeKey}" data-commit-hash="${commit.hash}">
            <div class="commit-header">
                <div class="commit-header-left">
                    <a href="${commitUrl}" target="_blank" class="commit-hash" title="${commit.hash}">
                        ${commit.short_hash}
                    </a>
                    <span class="commit-type ${typeClass}" title="${typeInfo.label}">${typeInfo.label}</span>
                    ${tagBadges}
                </div>
                <span class="commit-date">${formatTimestampToDate(commit.timestamp)}</span>
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

            const targetId = item.dataset.target;
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

// Search functionality
let searchQuery = '';
let allCommitElements = [];

function initSearch() {
    const searchInput = document.getElementById('search-input');
    const searchClearBtn = document.getElementById('search-clear');
    const searchContainer = document.getElementById('search-container');
    
    if (!searchInput || !searchClearBtn || !searchContainer) return;
    
    // Show search container when data is loaded
    if (globalData?.commits?.length > 0) {
        searchContainer.classList.remove('hidden');
    }
    
    // Cache commit elements
    cacheCommitElements();
    
    // Search input handler
    searchInput.addEventListener('input', function(e) {
        searchQuery = e.target.value.trim();
        
        // Show/hide clear button
        if (searchQuery) {
            searchClearBtn.classList.add('visible');
        } else {
            searchClearBtn.classList.remove('visible');
        }
        
        performSearch(searchQuery);
    });
    
    // Clear button handler
    searchClearBtn.addEventListener('click', function() {
        searchInput.value = '';
        searchQuery = '';
        searchClearBtn.classList.remove('visible');
        performSearch('');
    });
    
    // Enter key handler
    searchInput.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            performSearch(searchQuery);
        }
    });
}

function cacheCommitElements() {
    allCommitElements = Array.from(document.querySelectorAll('.commit-item'));
}

function performSearch(query) {
    const searchInfo = document.getElementById('search-info');
    
    if (!query) {
        // Show all commits
        allCommitElements.forEach(el => {
            el.classList.remove('search-hidden');
            removeHighlights(el);
        });
        
        // Show all releases
        document.querySelectorAll('.release-section').forEach(el => {
            el.classList.remove('search-hidden');
        });
        
        searchInfo.textContent = '';
        searchInfo.classList.remove('has-results');
        return;
    }
    
    const lowerQuery = query.toLowerCase();
    let matchCount = 0;
    
    allCommitElements.forEach(commitEl => {
        const commitHash = commitEl.dataset.commitHash;
        const commit = findCommitByHash(commitHash);
        if (!commit) {
            commitEl.classList.add('search-hidden');
            return;
        }
        // Search in multiple fields
        const searchableText = [
            commit.message || '',
            commit.message_short || '',
            commit.author || '',
            commit.type || '',
            formatTimestampToDate(commit.timestamp),
            (commit.tags || []).join(' ')
        ].join(' ').toLowerCase();
        if (searchableText.includes(lowerQuery)) {
            commitEl.classList.remove('search-hidden');
            highlightMatches(commitEl, query);
            matchCount++;
        } else {
            commitEl.classList.add('search-hidden');
            removeHighlights(commitEl);
        }
    });
    
    // Handle release sections in "By Release" mode
    if (currentViewMode === 'release') {
        document.querySelectorAll('.release-section').forEach(releaseEl => {
            const visibleCommits = releaseEl.querySelectorAll('.commit-item:not(.search-hidden)');
            if (visibleCommits.length === 0) {
                releaseEl.classList.add('search-hidden');
            } else {
                releaseEl.classList.remove('search-hidden');
            }
        });
    }
    
    // Update search info
    if (matchCount === 0) {
        searchInfo.textContent = 'No commits found';
        searchInfo.classList.remove('has-results');
    } else {
        searchInfo.textContent = `Found ${matchCount} commit${matchCount === 1 ? '' : 's'}`;
        searchInfo.classList.add('has-results');
    }
}

function findCommitByHash(hash) {
    if (!globalData?.commits) return null;
    return globalData.commits.find(c => c.hash === hash);
}

function highlightMatches(commitEl, query) {
    if (!query) return;
    const selectors = ['.commit-summary', '.commit-message', '.commit-author', '.commit-type', '.commit-tag'];
    let found = 0;
    selectors.forEach(sel => {
        const el = commitEl.querySelector(sel);
        if (el) {
            found++;
            removeHighlights(el);
            highlightTextNodes(el, query);
        }
    });

    // Si aucun des sous-éléments n'existe (p.ex. le résumé est un noeud texte direct),
    // surligner uniquement dans les nœuds texte directs de l'élément commit (sécurisé).
    if (found === 0) {
        for (let child = commitEl.firstChild; child; child = child.nextSibling) {
            if (child.nodeType === Node.TEXT_NODE) {
                const text = child.textContent.trim();
                if (text.length === 0) continue;
                // Ne pas toucher aux textes qui sont à l'intérieur de la balise de footer/header
                // (nous ciblons seulement les nœuds texte directs, typiquement le résumé)
                const regex = new RegExp(query.replaceAll(/[.*+?^${}()|[\\]\\]/g, '\\$&'), 'gi');
                const matches = [...child.textContent.matchAll(regex)];
                if (matches.length > 0) {
                    const frag = document.createDocumentFragment();
                    let lastIndex = 0;
                    matches.forEach(match => {
                        const before = child.textContent.slice(lastIndex, match.index);
                        if (before) frag.appendChild(document.createTextNode(before));
                        const highlight = document.createElement('span');
                        highlight.className = 'search-highlight';
                        highlight.textContent = match[0];
                        frag.appendChild(highlight);
                        lastIndex = match.index + match[0].length;
                    });
                    const after = child.textContent.slice(lastIndex);
                    if (after) frag.appendChild(document.createTextNode(after));
                    child.parentNode.replaceChild(frag, child);
                }
            }
        }
        // Aussi tenter d'attraper le message complet dans commit-body si présent
        const bodyMsg = commitEl.querySelector('.commit-body .commit-message');
        if (bodyMsg) {
            removeHighlights(bodyMsg);
            highlightTextNodes(bodyMsg, query);
        }
    }
}

// Fonction récursive pour surligner dans les nœuds texte uniquement
function highlightTextNodes(node, query) {
    if (!query) return;
    const regex = new RegExp(query.replaceAll(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
    for (let child = node.firstChild; child; child = child.nextSibling) {
        if (child.nodeType === Node.TEXT_NODE) {
            const text = child.textContent;
            const matches = [...text.matchAll(regex)];
            if (matches.length > 0) {
                const frag = document.createDocumentFragment();
                let lastIndex = 0;
                matches.forEach(match => {
                    const before = text.slice(lastIndex, match.index);
                    if (before) frag.appendChild(document.createTextNode(before));
                    const highlight = document.createElement('span');
                    highlight.className = 'search-highlight';
                    highlight.textContent = match[0];
                    frag.appendChild(highlight);
                    lastIndex = match.index + match[0].length;
                });
                const after = text.slice(lastIndex);
                if (after) frag.appendChild(document.createTextNode(after));
                child.replaceWith(frag);
            }
        } else if (child.nodeType === Node.ELEMENT_NODE && !child.classList.contains('search-highlight')) {
            highlightTextNodes(child, query);
        }
    }
}

function highlightText(text, query) {
    if (!query) return escapeHtml(text);
    const regex = new RegExp(query.replaceAll(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
    return escapeHtml(text).replace(regex, match => `<span class="search-highlight">${escapeHtml(match)}</span>`);
}

function removeHighlights(element) {
    const highlights = Array.from(element.querySelectorAll('.search-highlight'));
    highlights.forEach(span => {
        // Remplacer chaque <span class="search-highlight">...</span> par son texte
        const textNode = document.createTextNode(span.textContent);
        if (span.parentNode) {
            span.parentNode.replaceChild(textNode, span);
        }
    });
    // Fusionner les nœuds texte adjacents restaurés
    try {
        element.normalize();
    } catch (e) {
        // ignore si element n'est pas un Node ou autre erreur
    }
}

function getTextNodes(element) {
    const textNodes = [];
    const walk = document.createTreeWalker(
        element,
        NodeFilter.SHOW_TEXT,
        {
            acceptNode: function(node) {
                // Skip script and style elements
                const parent = node.parentElement;
                if (parent && (parent.tagName === 'SCRIPT' || parent.tagName === 'STYLE')) {
                    return NodeFilter.FILTER_REJECT;
                }
                // Only accept text nodes with non-whitespace content
                if (node.textContent.trim().length > 0) {
                    return NodeFilter.FILTER_ACCEPT;
                }
                return NodeFilter.FILTER_REJECT;
            }
        }
    );
    
    let node;
    while (node = walk.nextNode()) {
        textNodes.push(node);
    }
    
    return textNodes;
}

(async () => {
    await loadReleaseNotes();
})();