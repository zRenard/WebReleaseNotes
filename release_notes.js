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
let activeTypeFilters = new Set(['all']); // multi-type filter (F6)
let activeHashFilter = ''; // single-commit filter from timeline (F9)
let activeAuthorFilter = ''; // author filter (F7)
let selectedDayFilter = '';
let calendarVisibleMonth = null;
let lastSummaryData = null;
let lastSummaryCommits = null;
let summaryScopeCommits = null;
let globalSummary = null;
let globalCommits = null;

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
    button.title = theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme';
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
        populateAuthorFilter(data.commits);
        setupKeyboardShortcuts();
        applyDeepLinkFromUrl();

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
        <span class="meta-badge meta-badge-repo"><span class="meta-badge-label">Repository</span><span class="meta-badge-value">${repoLink}</span></span>
        <span class="meta-badge meta-badge-date"><span class="meta-badge-label">Generated</span><span class="meta-badge-value">${data.generated_at}</span></span>
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

// ---------------------------------------------------------------------------
// Deep-link support (Revontulet SPOR-746)
//
// `release_notes.html?tag=vX.Y.Z` opens straight on the matching release in
// "By Release" view (dropdown selected + scrolled into view). Consumed by the
// version links on Revontulet's maintenance page, which point one link at the
// version already in production and one at the version being deployed.
//
// The requested tag may not be in release_notes.json yet (the "to" version is
// only published near the end of a deploy): in that case we keep the full view
// and show an informational banner instead of failing silently.
// ---------------------------------------------------------------------------

function getRequestedTag() {
    try {
        return (new URLSearchParams(globalThis.location.search).get('tag') || '').trim();
    } catch (e) {
        return '';
    }
}

// Loose match: case-insensitive, optional leading "v" (git describe emits
// "v1.8.0", a dropdown option may read "v1.8.0" or a merged "v1.8.0 / v1.7.0").
function normalizeTag(tag) {
    return String(tag).trim().replace(/^v/i, '').toLowerCase();
}

function findReleaseByTag(requested) {
    const target = normalizeTag(requested);
    if (!target) return null;
    return releases.find(release =>
        String(release.tag).split(' / ').some(part => normalizeTag(part) === target)
    ) || null;
}

function showDeepLinkBanner(message, isPending) {
    let banner = document.getElementById('deep-link-banner');
    if (!banner) {
        banner = document.createElement('div');
        banner.id = 'deep-link-banner';
        banner.className = 'deep-link-banner';
        const anchor = document.getElementById('summary');
        if (anchor && anchor.parentNode) {
            anchor.parentNode.insertBefore(banner, anchor);
        } else {
            document.querySelector('.container')?.prepend(banner);
        }
    }
    banner.classList.toggle('deep-link-banner-pending', !!isPending);
    banner.textContent = message;
}

function applyDeepLinkFromUrl() {
    const requested = getRequestedTag();
    if (!requested) return;

    const release = findReleaseByTag(requested);
    if (!release) {
        showDeepLinkBanner(
            `Release ${requested} isn't published yet — showing every recorded change.`,
            true
        );
        return;
    }

    const releaseBtn = document.getElementById('btn-by-release');
    const dropdown = document.getElementById('release-dropdown');
    if (!releaseBtn || !dropdown) return;

    showDeepLinkBanner(`Showing release ${release.tag}.`, false);

    releaseBtn.click(); // switch to "By Release" view + populate the dropdown
    dropdown.value = release.tag;
    displayReleaseView(release.tag);

    setTimeout(() => {
        let section = null;
        document.querySelectorAll('.release-section').forEach(el => {
            if (el.dataset.releaseTag === release.tag) section = el;
        });
        if (section) {
            section.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    }, 300);
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
                return `<span class="release-category-badge ${type}" data-type="${type}">${typeInfo.icon} ${typeInfo.label}: ${commits.length}</span>`;
            })
            .join('');

        const barChart = buildReleaseBarChart(grouped, release.commitCount);

        return `
            <div class="release-section ${release.isVirtual ? 'virtual-release' : ''}" data-release-tag="${escapeHtml(release.tag)}">
                <div class="release-header">
                    <h2 class="release-title">${release.isVirtual ? '🚀' : '🏷️'} ${escapeHtml(release.tag)}</h2>
                    <div class="release-meta">
                        <span class="release-commit-count">📊 ${release.commitCount} commits</span>
                        <span class="release-date-range">📅 ${release.startDate} to ${release.endDate}</span>
                    </div>
                </div>
                ${barChart}
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

    // Apply grid-template-columns via JS DOM (inline style attr blocked by CSP)
    container.querySelectorAll('.release-bar-chart[data-grid-cols]').forEach(chart => {
        chart.style.gridTemplateColumns = chart.dataset.gridCols;
    });

    setupToggleHandlers();
    setupReleaseTypeFilters(container);

    // Add click handlers to release panels
    const releasePanels = container.querySelectorAll('.release-section');
    releasePanels.forEach(panel => {
        panel.addEventListener('click', (e) => {
            // Don't trigger if clicking on links, interactive elements, commit items, or type filters
            if (e.target.tagName === 'A' ||
                e.target.closest('a') ||
                e.target.closest('.commit-item') ||
                e.target.classList.contains('commit-item') ||
                e.target.closest('.release-category-badge') ||
                e.target.closest('.release-bar-segment')) {
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
    if (!globalCommits) return;

    // All releases selected: use commit scope unchanged
    if (!releasesToDisplay || releasesToDisplay.length === releases.length) {
        summaryScopeCommits = globalCommits;
        refreshSummaryForActiveFilters();
        return;
    }

    // Specific release(s): use a filtered commit scope
    summaryScopeCommits = releasesToDisplay.flatMap(r => r.commits);
    refreshSummaryForActiveFilters();
}

function buildSummaryFromCommits(commits) {
    const grouped = { feat: 0, fix: 0, docs: 0, style: 0, refactor: 0, test: 0, perf: 0, ops: 0, chore: 0, other: 0 };
    const list = Array.isArray(commits) ? commits : [];

    list.forEach(commit => {
        const type = (commit.type || 'other').toLowerCase();
        if (Object.prototype.hasOwnProperty.call(grouped, type)) {
            grouped[type] += 1;
        } else {
            grouped.other += 1;
        }
    });

    return {
        total: list.length,
        ...grouped
    };
}

function getAuthorScopedCommits(commits) {
    const list = Array.isArray(commits) ? commits : [];
    if (!activeAuthorFilter) return list;
    return list.filter(c => c.author === activeAuthorFilter);
}

function refreshSummaryForActiveFilters() {
    const scopeCommits = summaryScopeCommits || globalCommits || [];
    const commitsToDisplay = getAuthorScopedCommits(scopeCommits);
    const summary = buildSummaryFromCommits(commitsToDisplay);
    displaySummary(summary, commitsToDisplay);
}

function buildReleaseBarChart(grouped, totalCount) {
    const typeEntries = Object.entries(grouped)
        .filter(([, commits]) => commits.length > 0);

    if (typeEntries.length === 0) return '';

    const gridCols = typeEntries.map(([, commits]) => commits.length + 'fr').join(' ');

    const segments = typeEntries.map(([type, commits]) => {
        const typeInfo = TYPE_LABELS[type] || { label: type, icon: '📦' };
        const pct = Math.round(commits.length / totalCount * 100);
        return `<div class="release-bar-segment type-${type}" data-type="${type}" title="${typeInfo.icon} ${typeInfo.label}: ${commits.length} (${pct}%)"><span class="release-bar-segment-label">${typeInfo.icon} ${commits.length} · ${pct}%</span></div>`;
    }).join('');

    // grid-template-columns is applied via JS after DOM insertion (CSP blocks inline styles)
    return `<div class="release-bar-chart" data-grid-cols="${gridCols}" aria-label="Commit type distribution">${segments}</div>`;
}

function setupReleaseTypeFilters(container) {
    container.querySelectorAll('.release-section').forEach(section => {
        let activeType = null;

        function applyFilter(type) {
            activeType = type;

            section.querySelectorAll('.commit-item').forEach(commit => {
                commit.classList.toggle('release-filter-hidden', !!type && commit.dataset.commitType !== type);
            });

            section.querySelectorAll('.release-category-badge[data-type]').forEach(badge => {
                badge.classList.toggle('release-filter-active', badge.dataset.type === type);
                badge.classList.toggle('release-filter-dimmed', !!type && badge.dataset.type !== type);
            });

            section.querySelectorAll('.release-bar-segment[data-type]').forEach(seg => {
                seg.classList.toggle('release-filter-active', seg.dataset.type === type);
                seg.classList.toggle('release-filter-dimmed', !!type && seg.dataset.type !== type);
            });
        }

        function handleTypeClick(e, type) {
            e.stopPropagation();
            applyFilter(activeType === type ? null : type);
        }

        section.querySelectorAll('.release-category-badge[data-type]').forEach(badge => {
            badge.addEventListener('click', e => handleTypeClick(e, badge.dataset.type));
        });

        section.querySelectorAll('.release-bar-segment[data-type]').forEach(seg => {
            seg.addEventListener('click', e => handleTypeClick(e, seg.dataset.type));
        });
    });
}

function displaySummary(summary, commits) {
    lastSummaryData = summary;
    lastSummaryCommits = commits;
    const summaryEl = document.getElementById('summary');
    summaryEl.style.display = 'flex';
    const viewControls = document.getElementById('view-controls');
    if (viewControls) {
        // Detach first so it survives summaryEl.innerHTML replacement.
        viewControls.remove();
    }
    
    // Build cards dynamically based on what types are in the summary
    const allKeys = Object.keys(summary).filter(k => k !== 'total');
    
    // Count commits with tags
    const taggedCommitsCount = commits.filter(c => c.tags && c.tags.length > 0).length;
    
    // Build timeline
    const timeline = buildTimeline(commits);

    // Build sparkline for commits per day
    const sparkline = buildSparkline(commits);

    // Build calendar widget for commits (respect active category filter)
    const calendarCommits = getCommitsForActiveTypeFilter(commits);
    let calendarSourceCommits = calendarCommits;
    let calendarWidget = buildCommitCalendar(calendarSourceCommits);
    if (!calendarWidget) {
        calendarSourceCommits = commits;
        calendarWidget = buildCommitCalendar(calendarSourceCommits);
    }

    // Build total card with tag count
    const totalCard = `
        <div class="summary-card total" data-type="all">
            <div class="summary-total-row">
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
            ${sparkline}
        </div>
    `;
    
    // Build category cards for types with counts > 0
    const categoryCards = [];

    // "All" card — resets filters
    categoryCards.push(`
        <div class="summary-card all ${activeTypeFilters.has('all') ? 'active' : ''}" data-type="all">
            <span class="icon">🔄</span>
            <span class="number">${summary.total}</span>
            <span class="label">All</span>
        </div>
    `);

    if (taggedCommitsCount > 0) {
        categoryCards.push(`
            <div class="summary-card tags ${activeTypeFilters.has('tags') ? 'active' : ''}" data-type="tags">
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
                    <div class="summary-card ${key} ${activeTypeFilters.has(key) ? 'active' : ''}" data-type="${key}">
                        <span class="icon">${typeInfo.icon}</span>
                        <span class="number">${value}</span>
                        <span class="label">${typeInfo.label}</span>
                    </div>
                `);
            }
        }
    });

    summaryEl.innerHTML = `
        <div class="summary-top">
            ${calendarWidget}
            <div class="summary-right-column">
                <div id="summary-view-controls-slot"></div>
                <div class="summary-top-main">
                    ${totalCard}
                    <div class="summary-categories">
                        ${categoryCards.join('')}
                    </div>
                </div>
            </div>
        </div>
        <div class="summary-body">
            ${timeline}
        </div>
    `;
    
    // Click = single-select, Ctrl+click = multi-select (F6)
    document.querySelectorAll('.summary-card').forEach(card => {
        card.addEventListener('click', function(e) {
            const filterType = this.dataset.type;
            if (e.ctrlKey || e.metaKey) {
                if (filterType !== 'all') {
                    toggleTypeFilter(filterType);
                }
            } else {
                filterCommitsByType(filterType);
                if (filterType === 'all') collapseAllCommits();
            }
            displaySummary(summary, commits);
            document.querySelectorAll('.timeline-commit, .timeline-tag').forEach(d => d.classList.remove('active'));
        });
    });

    const viewControlsSlot = document.getElementById('summary-view-controls-slot');
    if (viewControls && viewControlsSlot) {
        viewControlsSlot.appendChild(viewControls);
    }

    setupCalendarWidgetHandlers(summary, commits);
    applyTypeFilter();
}

function updateFilterStatusBar() {
    const bar = document.getElementById('filter-status-bar');
    if (!bar) return;

    const chips = [];

    // Type filter chips (one per active type, supports multi-select)
    if (!activeTypeFilters.has('all')) {
        activeTypeFilters.forEach(type => {
            const typeInfo = type === 'tags'
                ? { label: 'Tags', icon: '🏷️' }
                : (TYPE_LABELS[type] || { label: type, icon: '📦' });
            chips.push(`<span class="filter-chip type-${type}" data-remove-filter="type" data-remove-type="${type}">${typeInfo.icon} ${typeInfo.label}<button class="filter-chip-remove" title="Remove filter">✕</button></span>`);
        });
    }

    if (activeHashFilter) {
        chips.push(`<span class="filter-chip filter-chip-search" data-remove-filter="hash">🔗 commit ${activeHashFilter.slice(0, 7)}<button class="filter-chip-remove" title="Show all commits">✕</button></span>`);
    }

    if (selectedDayFilter) {
        chips.push(`<span class="filter-chip filter-chip-day" data-remove-filter="day">📅 ${selectedDayFilter}<button class="filter-chip-remove" title="Remove day filter">✕</button></span>`);
    }

    if (activeAuthorFilter) {
        chips.push(`<span class="filter-chip filter-chip-day" data-remove-filter="author">👤 ${escapeHtml(activeAuthorFilter)}<button class="filter-chip-remove" title="Remove author filter">✕</button></span>`);
    }

    if (searchQuery) {
        chips.push(`<span class="filter-chip filter-chip-search" data-remove-filter="search">🔍 &quot;${escapeHtml(searchQuery)}&quot;<button class="filter-chip-remove" title="Remove search filter">✕</button></span>`);
    }

    // Visible count (F3)
    const totalCount = allCommitElements.length;
    const visibleCount = allCommitElements.filter(el =>
        !el.classList.contains('hidden') &&
        !el.classList.contains('search-hidden') &&
        !el.classList.contains('day-filter-hidden') &&
        !el.classList.contains('author-filter-hidden')
    ).length;
    const countChip = chips.length > 0 && visibleCount < totalCount
        ? `<span class="visible-count-chip">${visibleCount} / ${totalCount} commits</span>`
        : '';

    if (chips.length === 0) {
        bar.classList.add('hidden');
        bar.innerHTML = '';
        return;
    }

    bar.classList.remove('hidden');
    bar.innerHTML = `<span class="filter-status-label">Active filters:</span>${chips.join('')}${countChip}`;

    bar.querySelectorAll('[data-remove-filter]').forEach(chip => {
        chip.querySelector('.filter-chip-remove').addEventListener('click', e => {
            e.stopPropagation();
            const filter = chip.dataset.removeFilter;
            if (filter === 'type') {
                const typeToRemove = chip.dataset.removeType;
                activeTypeFilters.delete(typeToRemove);
                if (activeTypeFilters.size === 0) activeTypeFilters.add('all');
                applyTypeFilter();
                if (lastSummaryData && lastSummaryCommits) displaySummary(lastSummaryData, lastSummaryCommits);
            } else if (filter === 'hash') {
                activeHashFilter = '';
                filterCommitsByType('all');
                if (lastSummaryData && lastSummaryCommits) displaySummary(lastSummaryData, lastSummaryCommits);
            } else if (filter === 'day') {
                selectedDayFilter = '';
                if (lastSummaryData && lastSummaryCommits) {
                    displaySummary(lastSummaryData, lastSummaryCommits);
                } else {
                    applyDayFilterToCommits();
                }
            } else if (filter === 'author') {
                activeAuthorFilter = '';
                const sel = document.getElementById('author-dropdown');
                if (sel) sel.value = '';
                applyAuthorFilter();
            } else if (filter === 'search') {
                searchQuery = '';
                const input = document.getElementById('search-input');
                if (input) input.value = '';
                document.getElementById('search-clear')?.classList.remove('visible');
                document.getElementById('search-info').textContent = '';
                document.getElementById('search-info').classList.remove('has-results');
                performSearch('');
            }
        });
    });
}

function getCommitsForActiveTypeFilter(commits) {
    if (!Array.isArray(commits) || commits.length === 0) return [];
    if (activeTypeFilters.has('all')) return []; // empty → calendar falls back to all commits
    if (activeTypeFilters.has('tags')) return commits.filter(c => c.tags && c.tags.length > 0);
    return commits.filter(c => activeTypeFilters.has((c.type || 'other').toLowerCase()));
}

function getUTCDateKeyFromTimestamp(timestamp) {
    const date = new Date(timestamp * 1000);
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    const day = String(date.getUTCDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function buildCommitCalendar(commits) {
    if (!commits || commits.length === 0) {
        return '';
    }

    const validTimestamps = commits.map(c => c.timestamp).filter(Boolean);
    if (validTimestamps.length === 0) {
        return '';
    }

    const dayStats = new Map();

    commits.forEach(commit => {
        if (!commit.timestamp) return;

        const dayKey = getUTCDateKeyFromTimestamp(commit.timestamp);
        const type = (commit.type || 'other').toLowerCase();
        const normalizedType = TYPE_LABELS[type] ? type : 'other';

        if (!dayStats.has(dayKey)) {
            dayStats.set(dayKey, {
                total: 0,
                byType: {},
                timestamp: commit.timestamp
            });
        }

        const stat = dayStats.get(dayKey);
        stat.total++;
        stat.byType[normalizedType] = (stat.byType[normalizedType] || 0) + 1;
    });

    const minTimestamp = Math.min(...validTimestamps);
    const maxTimestamp = Math.max(...validTimestamps);

    const minMonth = new Date(minTimestamp * 1000);
    const maxMonth = new Date(maxTimestamp * 1000);
    const minMonthStart = new Date(Date.UTC(minMonth.getUTCFullYear(), minMonth.getUTCMonth(), 1));
    const maxMonthStart = new Date(Date.UTC(maxMonth.getUTCFullYear(), maxMonth.getUTCMonth(), 1));

    if (!calendarVisibleMonth) {
        const now = new Date();
        const todayMonthStart = new Date(Date.UTC(now.getFullYear(), now.getMonth(), 1));
        if (todayMonthStart >= minMonthStart && todayMonthStart <= maxMonthStart) {
            calendarVisibleMonth = todayMonthStart;
        } else {
            calendarVisibleMonth = new Date(maxMonthStart);
        }
    }
    if (calendarVisibleMonth < minMonthStart) {
        calendarVisibleMonth = new Date(minMonthStart);
    }
    if (calendarVisibleMonth > maxMonthStart) {
        calendarVisibleMonth = new Date(maxMonthStart);
    }

    const monthSections = [];
    const weekdayLabels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

    const year = calendarVisibleMonth.getUTCFullYear();
    const month = calendarVisibleMonth.getUTCMonth();
    const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
    const firstDayOfWeek = (new Date(Date.UTC(year, month, 1)).getUTCDay() + 6) % 7;
    const monthLabel = new Date(Date.UTC(year, month, 1)).toLocaleDateString('en-US', {
        month: 'long',
        year: 'numeric'
    });
    const isPrevDisabled = calendarVisibleMonth.getTime() === minMonthStart.getTime();
    const isNextDisabled = calendarVisibleMonth.getTime() === maxMonthStart.getTime();
    const clearButtonClass = selectedDayFilter ? '' : ' hidden';

    const leadingEmptyDays = Array.from({ length: firstDayOfWeek }, () => '<div class="commit-calendar-day empty" aria-hidden="true"></div>').join('');

    const todayKey = (() => {
        const now = new Date();
        return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    })();

    const dayCells = [];
    for (let day = 1; day <= daysInMonth; day++) {
        const dayKey = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const stat = dayStats.get(dayKey);
        const isSelected = selectedDayFilter === dayKey;
        const isToday = dayKey === todayKey;

        if (!stat) {
            dayCells.push(`
                <div class="commit-calendar-day${isToday ? ' today' : ''}" title="${dayKey}: no commits">
                    <span class="calendar-day-number">${day}</span>
                </div>
            `);
            continue;
        }

        const dominantType = Object.entries(stat.byType)
            .sort((a, b) => b[1] - a[1])[0][0];
        const typeInfo = TYPE_LABELS[dominantType] || TYPE_LABELS.other;

        const breakdown = Object.entries(stat.byType)
            .sort((a, b) => b[1] - a[1])
            .map(([typeKey, count]) => {
                const info = TYPE_LABELS[typeKey] || { label: typeKey, icon: '📦' };
                return `${info.icon} ${info.label}: ${count}`;
            })
            .join(' | ');

        dayCells.push(`
            <button type="button" class="commit-calendar-day has-commits type-${dominantType} ${isSelected ? 'selected' : ''} ${isToday ? 'today' : ''}" data-calendar-day="${dayKey}" title="${dayKey}: ${stat.total} commits | ${breakdown}">
                <span class="calendar-day-number">${day}</span>
                <span class="calendar-day-icon">${typeInfo.icon}</span>
                <span class="calendar-day-count">${stat.total}</span>
            </button>
        `);
    }

    monthSections.push(`
        <section class="commit-calendar-month">
            <div class="commit-calendar-toolbar">
                <button type="button" class="commit-calendar-nav" data-calendar-nav="prev" ${isPrevDisabled ? 'disabled' : ''}>◀</button>
                <h3 class="commit-calendar-month-title">${monthLabel}</h3>
                <button type="button" class="commit-calendar-nav" data-calendar-nav="next" ${isNextDisabled ? 'disabled' : ''}>▶</button>
            </div>
            <div class="commit-calendar-weekdays">
                ${weekdayLabels.map(label => `<span>${label}</span>`).join('')}
            </div>
            <div class="commit-calendar-grid">
                ${leadingEmptyDays}
                ${dayCells.join('')}
            </div>
            <div class="commit-calendar-actions">
                <button type="button" class="commit-calendar-clear${clearButtonClass}" id="calendar-clear-filter">Clear day filter</button>
            </div>
        </section>
    `);

    return `
        <section class="commit-calendar-widget" aria-label="Commit calendar">
            <div class="commit-calendar-months">
                ${monthSections.join('')}
            </div>
        </section>
    `;
}

function setupCalendarWidgetHandlers(summary, commits) {
    document.querySelectorAll('.commit-calendar-nav').forEach(button => {
        button.addEventListener('click', () => {
            if (button.disabled || !calendarVisibleMonth) return;
            const direction = button.dataset.calendarNav === 'next' ? 1 : -1;
            calendarVisibleMonth = new Date(calendarVisibleMonth);
            calendarVisibleMonth.setUTCMonth(calendarVisibleMonth.getUTCMonth() + direction);
            displaySummary(summary, commits);
        });
    });

    document.querySelectorAll('[data-calendar-day]').forEach(dayButton => {
        dayButton.addEventListener('click', () => {
            selectedDayFilter = dayButton.dataset.calendarDay || '';
            displaySummary(summary, commits);
        });
    });

    const clearButton = document.getElementById('calendar-clear-filter');
    if (clearButton) {
        clearButton.addEventListener('click', () => {
            selectedDayFilter = '';
            displaySummary(summary, commits);
        });
    }
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
        const leftPct = position.toFixed(1);
        const typeKey = (commit.type || 'other').toLowerCase();
        const dateStr = formatTimestampToDate(commit.timestamp);
        const title = `${commit.message_short} (${dateStr})`;

        if (commit.tags && commit.tags.length > 0) {
            const tagTitle = `TAG: ${commit.tags.join(', ')} - ${commit.message_short} (${dateStr})`;
            return `<div class="timeline-tag" data-left="${leftPct}" title="${tagTitle.replaceAll('"', '&quot;')}" data-commit-hash="${commit.hash}" data-is-tag="true"></div>`;
        }

        return `<div class="timeline-commit type-${typeKey}" data-left="${leftPct}" title="${title.replaceAll('"', '&quot;')}" data-commit-hash="${commit.hash}"></div>`;
    }).join('');
    
    // Determine appropriate tick interval based on timeframe
    const timeRangeSeconds = timeRange;
    const timeRangeDays = timeRangeSeconds / 86400;
    const timeRangeHours = timeRangeSeconds / 3600;
    
    let tickInterval, formatOptions, useTimeFormat = false, intervalLabel;
    
    if (timeRangeDays > 365) {
        // Spanning multiple years - use month ticks
        tickInterval = 30 * 86400; // ~1 month in seconds
        formatOptions = { month: 'short', year: 'numeric' };
        intervalLabel = 'Monthly';
    } else if (timeRangeDays > 60) {
        // 2+ months - use month ticks
        tickInterval = 30 * 86400;
        formatOptions = { month: 'short', day: 'numeric' };
        intervalLabel = 'Monthly';
    } else if (timeRangeDays > 7) {
        // 1 week to 2 months - use week ticks
        tickInterval = 7 * 86400;
        formatOptions = { month: 'short', day: 'numeric' };
        intervalLabel = 'Weekly';
    } else if (timeRangeDays > 1) {
        // Multiple days - use day ticks
        tickInterval = 86400;
        formatOptions = { month: 'short', day: 'numeric' };
        intervalLabel = 'Daily';
    } else if (timeRangeHours > 1) {
        // Same day but multiple hours - use hour ticks
        tickInterval = 3600;
        formatOptions = { hour: 'numeric', minute: '2-digit' };
        useTimeFormat = true;
        intervalLabel = 'Hourly';
    } else {
        // Less than an hour - use 10-minute ticks
        tickInterval = 600;
        formatOptions = { hour: 'numeric', minute: '2-digit' };
        useTimeFormat = true;
        intervalLabel = '10-Minute Intervals';
    }
    
    // Build graduation marks - generate ticks from start to end
    const graduations = [];
    let currentTimestamp = oldestTime;
    let tickIndex = 0;
    const maxTicks = 12;
    
    // Add first tick
    let dateLabel;
    if (useTimeFormat) {
        dateLabel = new Date(currentTimestamp * 1000).toLocaleTimeString('en-US', formatOptions);
    } else {
        dateLabel = new Date(currentTimestamp * 1000).toLocaleDateString('en-US', formatOptions);
    }
    graduations.push(`
        <div class="timeline-graduation" data-left="0">
            <div class="graduation-tick"></div>
            <div class="graduation-label">${dateLabel}</div>
        </div>
    `);

    // Add intermediate ticks
    while (tickIndex < maxTicks - 1) {
        currentTimestamp += tickInterval;
        if (currentTimestamp >= newestTime) break;

        const position = ((currentTimestamp - oldestTime) / timeRange) * 100;
        const leftPct = position.toFixed(1);

        if (useTimeFormat) {
            dateLabel = new Date(currentTimestamp * 1000).toLocaleTimeString('en-US', formatOptions);
        } else {
            dateLabel = new Date(currentTimestamp * 1000).toLocaleDateString('en-US', formatOptions);
        }

        graduations.push(`
            <div class="timeline-graduation" data-left="${leftPct}">
                <div class="graduation-tick"></div>
                <div class="graduation-label">${dateLabel}</div>
            </div>
        `);
        tickIndex++;
    }

    // Always add last tick at the end
    if (useTimeFormat) {
        dateLabel = new Date(newestTime * 1000).toLocaleTimeString('en-US', formatOptions);
    } else {
        dateLabel = new Date(newestTime * 1000).toLocaleDateString('en-US', formatOptions);
    }
    graduations.push(`
        <div class="timeline-graduation" data-left="100">
            <div class="graduation-tick"></div>
            <div class="graduation-label">${dateLabel}</div>
        </div>
    `);
    
    const graduationHTML = graduations.join('');
    
    // Format dates (left = oldest, right = newest)
    const oldestDate = new Date(oldestTime * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    const newestDate = new Date(newestTime * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    
    const timelineHTML = `
        <div class="commit-timeline">
            <div class="timeline-label">Commit Timeline <span class="timeline-interval-legend">(${intervalLabel})</span></div>
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
        const cx = (width / 2).toFixed(2);
        const cy = (height / 2).toFixed(2);
        const startDateStr2 = startUTC.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
        return `
        <div class="summary-sparkline">
            <div class="sparkline-label">Commits per day (${startDateStr2}, 1 day)</div>
            <svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" role="img" aria-label="Sparkline: ${dailyCounts[0]} commit(s) on 1 day">
                <circle class="sparkline-dot" cx="${cx}" cy="${cy}" r="3"></circle>
            </svg>
        </div>`;
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

function applyTimelinePositions() {
    document.querySelectorAll('[data-left]').forEach(el => {
        const pct = parseFloat(el.dataset.left);
        if (!isNaN(pct)) {
            el.style.left = pct + '%';
        }
    });
}

function setupTimelineHandlers() {
    applyTimelinePositions();
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

// F5 — Update summary card numbers to reflect currently visible commits

// F4 — Keyboard shortcuts
function setupKeyboardShortcuts() {
    document.addEventListener('keydown', e => {
        const active = document.activeElement;
        const isInput = active && (active.tagName === 'INPUT' || active.tagName === 'SELECT' || active.tagName === 'TEXTAREA');

        if (e.key === '/' && !isInput) {
            e.preventDefault();
            document.getElementById('search-input')?.focus();
        } else if (e.key === 'Escape') {
            if (isInput) {
                active.blur();
            } else {
                // Clear all filters
                if (searchQuery) {
                    searchQuery = '';
                    const input = document.getElementById('search-input');
                    if (input) input.value = '';
                    document.getElementById('search-clear')?.classList.remove('visible');
                    performSearch('');
                } else if (!activeTypeFilters.has('all') || selectedDayFilter || activeAuthorFilter || activeHashFilter) {
                    activeTypeFilters = new Set(['all']);
                    activeHashFilter = '';
                    selectedDayFilter = '';
                    activeAuthorFilter = '';
                    const sel = document.getElementById('author-dropdown');
                    if (sel) sel.value = '';
                    applyTypeFilter();
                    if (lastSummaryData && lastSummaryCommits) displaySummary(lastSummaryData, lastSummaryCommits);
                }
            }
        } else if (e.key === 't' && !isInput) {
            document.getElementById('theme-toggle')?.click();
        }
    });
}

// F7 — Populate author filter dropdown
function populateAuthorFilter(commits) {
    const dropdown = document.getElementById('author-dropdown');
    const filterDiv = document.getElementById('author-filter');
    if (!dropdown || !filterDiv) return;

    const authors = [...new Set(commits.map(c => c.author).filter(Boolean))].sort((a, b) => a.localeCompare(b));
    if (authors.length <= 1) return; // Not useful with a single author

    while (dropdown.options.length > 1) dropdown.remove(1);
    authors.forEach(author => {
        const opt = document.createElement('option');
        opt.value = author;
        opt.textContent = author;
        dropdown.appendChild(opt);
    });

    filterDiv.classList.remove('hidden');

    dropdown.addEventListener('change', e => {
        activeAuthorFilter = e.target.value;
        applyAuthorFilter();
    });
}

// F7 — Apply author filter to commit items
function applyAuthorFilter() {
    document.querySelectorAll('.commit-item').forEach(el => {
        if (!activeAuthorFilter) {
            el.classList.remove('author-filter-hidden');
            return;
        }
        const commit = findCommitByHash(el.dataset.commitHash);
        el.classList.toggle('author-filter-hidden', commit?.author !== activeAuthorFilter);
    });
    updateReleaseVisibilityByActiveFilters();
    refreshSummaryForActiveFilters();
    updateFilterStatusBar();
}

function filterByCommitHash(hash) {
    activeTypeFilters = new Set(['all']);
    activeHashFilter = hash;
    selectedDayFilter = '';
    const commits = document.querySelectorAll('.commit-item');

    commits.forEach(commit => {
        const targetId = commit.dataset.target;
        if (targetId === `commit-${hash}`) {
            commit.classList.remove('hidden');
            const body = document.getElementById(targetId);
            if (body?.classList.contains('collapsed')) {
                body.classList.remove('collapsed');
                body.classList.add('expanded');
            }
            setTimeout(() => {
                commit.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }, 100);
        } else {
            commit.classList.add('hidden');
        }
    });

    document.querySelectorAll('.summary-card').forEach(c => c.classList.remove('active'));
    updateFilterStatusBar();
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

function applyDayFilterToCommits() {
    const commits = document.querySelectorAll('.commit-item');
    commits.forEach(commit => {
        if (!selectedDayFilter) {
            commit.classList.remove('day-filter-hidden');
            return;
        }
        commit.classList.toggle('day-filter-hidden', commit.dataset.commitDay !== selectedDayFilter);
    });
    updateReleaseVisibilityByActiveFilters();
    updateFilterStatusBar();
}

function updateReleaseVisibilityByActiveFilters() {
    if (currentViewMode !== 'release') return;
    document.querySelectorAll('.release-section').forEach(releaseEl => {
        const visibleCommits = releaseEl.querySelectorAll('.commit-item:not(.hidden):not(.search-hidden):not(.day-filter-hidden):not(.author-filter-hidden)');
        if (visibleCommits.length === 0) {
            releaseEl.classList.add('search-hidden');
        } else {
            releaseEl.classList.remove('search-hidden');
        }
    });
}

// Set a single type filter (resets multi-select)
function filterCommitsByType(type) {
    activeTypeFilters = new Set([type]);
    activeHashFilter = '';
    applyTypeFilter();
}

// Toggle a type in/out of the active set (Ctrl+click, F6)
function toggleTypeFilter(type) {
    if (activeTypeFilters.has('all')) {
        activeTypeFilters = new Set([type]);
    } else if (activeTypeFilters.has(type)) {
        activeTypeFilters.delete(type);
        if (activeTypeFilters.size === 0) activeTypeFilters.add('all');
    } else {
        activeTypeFilters.add(type);
    }
    activeHashFilter = '';
    applyTypeFilter();
}

// Core visibility logic — applies activeTypeFilters to DOM
function applyTypeFilter() {
    const commits = document.querySelectorAll('.commit-item');
    const timelineDots = document.querySelectorAll('.timeline-commit');
    const showAll = activeTypeFilters.has('all');
    const showTags = activeTypeFilters.has('tags');

    commits.forEach(commit => {
        if (showAll) {
            commit.classList.remove('hidden');
        } else if (showTags) {
            commit.classList.toggle('hidden', !commit.classList.contains('has-tag'));
        } else {
            commit.classList.toggle('hidden', !activeTypeFilters.has(commit.dataset.commitType));
        }
    });

    timelineDots.forEach(dot => {
        dot.classList.remove('visible', 'hidden', 'opaque-0', 'opaque-1');
        if (showAll) {
            dot.classList.add('visible');
        } else if (showTags) {
            dot.classList.add('hidden', 'opaque-0');
        } else {
            const dotType = Array.from(dot.classList).find(c => c.startsWith('type-'))?.replace('type-', '');
            if (activeTypeFilters.has(dotType)) {
                dot.classList.add('visible');
            } else {
                dot.classList.add('hidden', 'opaque-0');
            }
        }
    });

    document.querySelectorAll('.timeline-tag').forEach(tag => {
        tag.classList.remove('hidden', 'opaque-0', 'visible');
        tag.style.opacity = '';
        if (showTags) {
            tag.classList.add('visible');
        } else if (showAll) {
            // Default state: show tags without the emphasized "visible" styling.
            tag.classList.remove('visible');
        } else {
            tag.style.opacity = '0.6';
        }
    });

    applyDayFilterToCommits();
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
    globalSummary = summary;
    globalCommits = data.commits;
    summaryScopeCommits = data.commits;
    refreshSummaryForActiveFilters();

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
    applyTypeFilter();

    if (searchQuery) {
        performSearch(searchQuery);
    }
}

function createCommitHTML(commit, repoUrl) {
    const commitUrl = repoUrl ? `${repoUrl}/commit/${commit.hash}` : '#';
    const summaryText = escapeHtml(commit.message_short || (commit.message.split('\n')[0] || ''));
    const fullMessage = escapeHtml(commit.message);
    const modifiedFiles = Array.isArray(commit.modified_files) ? commit.modified_files : [];
    const modifiedFilesDetails = Array.isArray(commit.modified_files_details) ? commit.modified_files_details : [];
    const sortedModifiedFilesDetails = [...modifiedFilesDetails].sort((a, b) => {
        const aInsertions = Number(a?.insertions) || 0;
        const aDeletions = Number(a?.deletions) || 0;
        const bInsertions = Number(b?.insertions) || 0;
        const bDeletions = Number(b?.deletions) || 0;

        const impactA = (Number(a?.lines_changed) || 0) || (aInsertions + aDeletions);
        const impactB = (Number(b?.lines_changed) || 0) || (bInsertions + bDeletions);
        if (impactB !== impactA) return impactB - impactA;

        const churnA = aInsertions + aDeletions;
        const churnB = bInsertions + bDeletions;
        if (churnB !== churnA) return churnB - churnA;

        return String(a?.path || '').localeCompare(String(b?.path || ''));
    });
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
    const modifiedFilesHtml = modifiedFiles.length > 0
        ? `
            <div class="commit-files" aria-label="Modified files">
                <div class="commit-files-title">Modified files (${modifiedFiles.length})</div>
                <ul class="commit-files-list">
                    ${sortedModifiedFilesDetails.length > 0
                        ? sortedModifiedFilesDetails.map(file => {
                            const insertions = Number(file.insertions) || 0;
                            const deletions = Number(file.deletions) || 0;
                            const linesChanged = Number(file.lines_changed) || 0;
                            return `<li class="commit-file-item"><span class="commit-file-path">${escapeHtml(file.path || '')}</span><span class="commit-file-stats"><span class="file-stat additions">+${insertions}</span><span class="file-stat deletions">-${deletions}</span><span class="file-stat lines">Δ ${linesChanged}</span></span></li>`;
                        }).join('')
                        : modifiedFiles.map(file => `<li class="commit-file-item"><span class="commit-file-path">${escapeHtml(file)}</span></li>`).join('')}
                </ul>
            </div>
        `
        : '';
    
    return `
        <li class="${commitClass}${tagClass}" data-target="${bodyId}" data-commit-type="${typeKey}" data-commit-hash="${commit.hash}" data-commit-day="${getUTCDateKeyFromTimestamp(commit.timestamp)}">
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
                ${modifiedFilesHtml}
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

        updateReleaseVisibilityByActiveFilters();
        
        searchInfo.textContent = '';
        searchInfo.classList.remove('has-results');
        updateFilterStatusBar();
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
    updateReleaseVisibilityByActiveFilters();


    if (matchCount === 0) {
        searchInfo.textContent = 'No commits found';
        searchInfo.classList.remove('has-results');
    } else {
        searchInfo.textContent = `Found ${matchCount} commit${matchCount === 1 ? '' : 's'}`;
        searchInfo.classList.add('has-results');
    }

    updateFilterStatusBar();
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
    setupThemeToggle();
    await loadReleaseNotes();
})();