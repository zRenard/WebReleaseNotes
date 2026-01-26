import { createServer } from 'http';
import { readFile, stat } from 'fs/promises';
import { join, extname } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

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
    res.setHeader(
    'Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; font-src 'self'; img-src 'self'; frame-src 'self'"
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
            const { readdir } = await import('fs/promises');
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
