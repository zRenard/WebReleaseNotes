import { createServer } from 'node:http';
import { readFile, stat, readdir, watch } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Allow targeting a specific directory via command line argument
const targetDir = process.argv[2] ? join(__dirname, process.argv[2]) : __dirname;
const PORT = process.env.PORT || 3000;
const isDevMode = !process.argv[2]; // Dev mode when no directory argument provided

// Track connected SSE clients for dev mode reload notifications
const watchClients = new Set();

const mimeTypes = {
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'text/javascript',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon'
};

// Inject reload script for HTML in dev mode
const reloadScript = `<script>
(function() {
    let reconnectAttempts = 0;
    const maxReconnectAttempts = 5;
    
    function connectToWatcher() {
        console.log('[DevServer] Connecting to file watcher...');
        const es = new EventSource('/watch');
        
        es.addEventListener('open', () => {
            console.log('[DevServer] ✓ Connected to file watcher');
            reconnectAttempts = 0;
        });
        
        es.addEventListener('reload', () => {
            console.log('[DevServer] 🔄 File change detected - reloading...');
            location.reload();
        });
        
        es.onerror = (err) => {
            console.error('[DevServer] ✗ Connection error:', err);
            es.close();
            
            if (reconnectAttempts < maxReconnectAttempts) {
                reconnectAttempts++;
                const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), 10000);
                console.log('[DevServer] Reconnecting in ' + delay + 'ms...');
                setTimeout(connectToWatcher, delay);
            }
        };
    }
    
    connectToWatcher();
})();
</script>`;

// Calculate SHA256 hash of the injected script for CSP
function getScriptHash(scriptContent) {
    // Extract the JS content between <script> and </script>
    const match = scriptContent.match(/<script>([\s\S]*)<\/script>/);
    const jsContent = match ? match[1] : scriptContent;
    const hash = createHash('sha256').update(jsContent).digest('base64');
    return `'sha256-${hash}'`;
}

const reloadScriptHash = getScriptHash(reloadScript);

// Notify all connected clients to reload
function notifyClientsToReload() {
    console.log(`[FileWatch] 📢 Notifying ${watchClients.size} connected client(s)...`);
    let successCount = 0;
    watchClients.forEach(res => {
        try {
            res.write('event: reload\n');
            res.write('data: \n\n');
            successCount++;
        } catch (err) {
            console.error('[FileWatch] Error notifying client:', err.message);
        }
    });
    if (successCount > 0) {
        console.log(`[FileWatch] ✓ Sent reload notification to ${successCount} client(s)`);
    }
}

// Start watching for file changes in dev mode
function startFileWatcher() {
    if (!isDevMode) return;
    
    (async () => {
        try {
            const watcher = watch(targetDir, { recursive: true });
            for await (const event of watcher) {
                const { filename, eventType } = event;
                // Ignore node_modules, hidden files, and lock files
                if (!filename || filename.includes('node_modules') || filename.startsWith('.') || filename.endsWith('.lock')) {
                    continue;
                }
                // Watch both change and rename events
                if (eventType === 'change' || eventType === 'rename') {
                    console.log(`📄 File changed: ${filename} (${eventType})`);
                    notifyClientsToReload();
                }
            }
        } catch (err) {
            if (err.code !== 'ABORT_ERR') {
                console.error('File watcher error:', err);
            }
        }
    })();
}

const server = createServer(async (req, res) => {
    // Handle file watch endpoint for dev mode reload
    if (isDevMode && req.url === '/watch') {
        res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
            'Access-Control-Allow-Origin': '*'
        });
        res.write(': connected\n\n'); // Initial comment to establish connection
        
        // Keep connection alive with heartbeat
        const heartbeat = setInterval(() => {
            res.write(': heartbeat\n\n');
        }, 30000); // Send heartbeat every 30 seconds
        
        watchClients.add(res);
        console.log(`[DevServer] ✓ Client connected. Total clients: ${watchClients.size}`);
        
        req.on('close', () => {
            clearInterval(heartbeat);
            watchClients.delete(res);
            console.log(`[DevServer] ✗ Client disconnected. Total clients: ${watchClients.size}`);
        });
        
        req.on('error', (err) => {
            console.error('[DevServer] Client error:', err);
            clearInterval(heartbeat);
            watchClients.delete(res);
        });
        
        return;
    }

    // Handle CSP violation reports
    if (req.method === 'POST' && req.url === '/csp-report') {
        let body = '';
        req.on('data', chunk => {
            body += chunk.toString();
        });
        req.on('end', () => {
            try {
                // CSP reports come wrapped in a 'csp-report' object
                const data = JSON.parse(body);
                const report = data['csp-report'] || data;
                
                // Ignore CSP violations from browser extensions
                const sourceFile = report['source-file'] || '';
                const blockedUri = report['blocked-uri'] || '';
                
                // Filter out browser extensions - they shouldn't be reported
                if (sourceFile.includes('moz-extension') || 
                    sourceFile.includes('chrome-extension') ||
                    sourceFile.includes('extension:') ||
                    blockedUri.includes('extension:')) {
                    // Silently ignore browser extension CSP violations
                    res.writeHead(204);
                    res.end();
                    return;
                }
                
                // Only log if there's actual violation data
                if (report['document-uri'] || report['violated-directive']) {
                    console.error('\n❌ CSP Violation Detected:');
                    console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
                    if (report['document-uri']) {
                        console.error(`📋 Document URI: ${report['document-uri']}`);
                    }
                    if (report['blocked-uri']) {
                        console.error(`🚫 Blocked URI: ${report['blocked-uri']}`);
                    }
                    if (report['violated-directive']) {
                        console.error(`⚠️  Violation Type: ${report['violated-directive']}`);
                    }
                    if (report['original-policy']) {
                        console.error(`📊 Original Policy: ${report['original-policy']}`);
                    }
                    if (report['source-file']) {
                        console.error(`📄 Source File: ${report['source-file']}:${report['line-number']}`);
                    }
                    console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
                }
            } catch {
                // Intentionally ignore parse errors
                // No action needed: malformed CSP reports are discarded silently
            }
        });
        res.writeHead(204);
        res.end();
        return;
    }

    // Build CSP header - include reload script hash in dev mode
    const scriptSrcPolicy = isDevMode 
        ? `'self' 'sha256-BPfo8AlqKcpHrHgw86iS+3zmeiEyidPBzCRVDfmCeaM=' ${reloadScriptHash}`
        : `'self' 'sha256-BPfo8AlqKcpHrHgw86iS+3zmeiEyidPBzCRVDfmCeaM='`;
    
    res.setHeader(
        'Content-Security-Policy',
        `default-src 'self'; script-src ${scriptSrcPolicy}; style-src 'self'; font-src 'self'; img-src 'self'; frame-src 'self'; report-uri /csp-report`
    );
    try {
        let filePath = req.url === '/' ? '/index.html' : req.url;
        
        // Retirer les query parameters
        filePath = filePath.split('?')[0];
        
        const fullPath = join(targetDir, filePath);
        
        // Récupérer les stats du fichier pour la date de modification
        const stats = await stat(fullPath);
        
        if (stats.isDirectory()) {
            // Lister le contenu du répertoire
            const files = await readdir(fullPath);
            
            let html = `<!DOCTYPE html>
<html>
<head><title>Index of ${filePath}</title></head>
<body>
<h1>Index of ${filePath}</h1>
<ul>`;
            
            for (const file of files) {
                const fileStats = await stat(join(fullPath, file));
                const mtime = fileStats.mtime.toISOString();
                html += `<li><a href="${filePath === '/' ? '' : filePath}/${file}">${file}</a> - ${mtime}</li>`;
            }
            
            html += `</ul>`;
            if (isDevMode) html += reloadScript;
            html += `</body></html>`;
            
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end(html);
            return;
        }
        
        // Lire le fichier
        let content = await readFile(fullPath);
        const ext = extname(fullPath);
        const contentType = mimeTypes[ext] || 'application/octet-stream';
        
        // Inject reload script for HTML files in dev mode
        if (isDevMode && ext === '.html') {
            let htmlContent = content.toString();
            // Only inject if not already present
            if (!htmlContent.includes('[DevServer]')) {
                console.log(`[DevServer] Injecting reload script into ${filePath}`);
                // Try to inject before </body>, otherwise append before </html>
                if (htmlContent.includes('</body>')) {
                    htmlContent = htmlContent.replace('</body>', `${reloadScript}</body>`);
                } else if (htmlContent.includes('</html>')) {
                    htmlContent = htmlContent.replace('</html>', `${reloadScript}</html>`);
                } else {
                    console.warn(`[DevServer] Warning: No </body> or </html> found in ${filePath}, appending script`);
                    htmlContent += reloadScript;
                }
            }
            content = htmlContent;
        }
        
        // Envoyer la réponse avec l'en-tête Last-Modified
        const responseHeaders = {
            'Content-Type': contentType,
            'Last-Modified': stats.mtime.toUTCString(),
            'Cache-Control': 'no-cache'
        };
        
        // Force no caching for HTML in dev mode
        if (isDevMode && ext === '.html') {
            responseHeaders['Cache-Control'] = 'no-store, no-cache, must-revalidate, max-age=0';
            responseHeaders['Pragma'] = 'no-cache';
            responseHeaders['Expires'] = '0';
        }
        
        res.writeHead(200, responseHeaders);
        res.end(content);
        
    } catch (error) {
        if (error.code === 'ENOENT') {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end('404 Not Found');
        } else {
            res.writeHead(500, { 'Content-Type': 'text/plain' });
            res.end('500 Internal Server Error');
        }
    }
});

server.listen(PORT, () => {
    console.log(`\n🚀 Server is running at http://localhost:${PORT}\n`);
    if (isDevMode) {
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('✨ DEV MODE ENABLED');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log(`📁 Serving from: ${targetDir}`);
        console.log('🔍 Watching for file changes...');
        console.log('🌐 Open your browser and look at the console for [DevServer] messages');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
        startFileWatcher();
    } else {
        console.log(`📁 Serving production build from: ${targetDir}\n`);
    }
});
