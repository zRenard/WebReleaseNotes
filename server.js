import { createServer } from 'node:http';
import { readFile, stat, readdir } from 'node:fs/promises';
import { join, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const PORT = 3000;

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

const server = createServer(async (req, res) => {
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

    res.setHeader(
        'Content-Security-Policy',
        "default-src 'self'; script-src 'self' 'sha256-BPfo8AlqKcpHrHgw86iS+3zmeiEyidPBzCRVDfmCeaM='; style-src 'self'; font-src 'self'; img-src 'self'; frame-src 'self'; report-uri /csp-report"
    );
    try {
        let filePath = req.url === '/' ? '/index.html' : req.url;
        
        // Retirer les query parameters
        filePath = filePath.split('?')[0];
        
        const fullPath = join(__dirname, filePath);
        
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
            
            html += `</ul></body></html>`;
            
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end(html);
            return;
        }
        
        // Lire le fichier
        const content = await readFile(fullPath);
        const ext = extname(fullPath);
        const contentType = mimeTypes[ext] || 'application/octet-stream';
        
        // Envoyer la réponse avec l'en-tête Last-Modified
        res.writeHead(200, {
            'Content-Type': contentType,
            'Last-Modified': stats.mtime.toUTCString(),
            'Cache-Control': 'no-cache'
        });
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
    console.log(`Server is running at http://localhost:${PORT}`);
});
