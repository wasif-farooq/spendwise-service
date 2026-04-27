const path = require('path');
const fs = require('fs');

const baseUrl = path.resolve(__dirname, '..');

const aliasMap = {
    '@shared': path.join(baseUrl, 'src', '@shared'),
    '@domains': path.join(baseUrl, 'src', 'domains'),
    '@facades': path.join(baseUrl, 'src', 'facades'),
    '@interfaces': path.join(baseUrl, 'src', 'interfaces'),
    '@abstract-factories': path.join(baseUrl, 'src', 'abstract-factories'),
    '@factories': path.join(baseUrl, 'src', 'factories'),
    '@config': path.join(baseUrl, 'src', 'config'),
    '@di': path.join(baseUrl, 'src', 'di'),
    '@cache': path.join(baseUrl, 'src', 'cache'),
    '@messaging': path.join(baseUrl, 'src', 'messaging'),
    '@monitoring': path.join(baseUrl, 'src', 'monitoring'),
    '@bootstrap': path.join(baseUrl, 'src', 'bootstrap'),
    '@server': path.join(baseUrl, 'src', 'server'),
    '@database': path.join(baseUrl, 'src', 'database'),
    '@processes': path.join(baseUrl, 'processes'),
    '@tests': path.join(baseUrl, 'tests'),
};

const Module = require('module');
const origResolve = Module._resolveFilename;

let inResolve = false;

Module._resolveFilename = function(request, parent, isMain, options) {
    if (inResolve) {
        return origResolve.apply(this, arguments);
    }
    
    for (const [alias, targetDir] of Object.entries(aliasMap)) {
        if (request.startsWith(alias + '/')) {
            inResolve = true;
            try {
                const relativePath = request.slice(alias.length + 1);
                const fullPath = path.join(targetDir, relativePath);
                
                const exts = ['', '.ts', '.js', '.json'];
                for (const ext of exts) {
                    const tryPath = fullPath + ext;
                    try {
                        const stats = fs.statSync(tryPath);
                        if (stats.isFile()) {
                            return origResolve(tryPath, parent, isMain, options);
                        }
                    } catch {}
                }
                
                const indexExtensions = ['index.ts', 'index.js', 'index.json'];
                for (const indexExt of indexExtensions) {
                    const indexPath = fullPath + '/' + indexExt;
                    try {
                        const stats = fs.statSync(indexPath);
                        if (stats.isFile()) {
                            return origResolve(indexPath, parent, isMain, options);
                        }
                    } catch {}
                }
            } finally {
                inResolve = false;
            }
        }
    }
    
    return origResolve.apply(this, arguments);
};

console.log('[register-fixed] Custom path alias resolver loaded (non-recursive)');