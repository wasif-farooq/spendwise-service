const path = require('path');
const fs = require('fs');
const Module = require('module');

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

const origResolve = Module._resolveFilename;

Module._resolveFilename = function(request, parent, isMain, options) {
    for (const [alias, targetDir] of Object.entries(aliasMap)) {
        if (request.startsWith(alias + '/')) {
            const relativePath = request.slice(alias.length + 1);
            const fullPath = path.join(targetDir, relativePath);
            
            const exts = ['', '.ts', '.js', '.json', '/index.ts', '/index.js'];
            for (const ext of exts) {
                const tryPath = fullPath + ext;
                try {
                    const stats = fs.statSync(tryPath);
                    if (stats.isFile()) {
                        return origResolve(tryPath, parent, isMain, options);
                    }
                } catch {}
            }
            const indexPath = fullPath + '/index.ts';
            try {
                const stats = fs.statSync(indexPath);
                if (stats.isFile()) {
                    return origResolve(indexPath, parent, isMain, options);
                }
            } catch {}
        }
    }
    return origResolve.apply(this, arguments);
};

console.log('[custom-register] Custom path alias resolver loaded');