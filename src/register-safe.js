const fs = require('fs');
const path = require('path');
const Module = require('module');

const baseUrl = path.resolve(__dirname, '..');

const origFsExistsSync = fs.existsSync;
const origResolveFilename = Module._resolveFilename;

fs.existsSync = function(filePath) {
    try {
        const stats = fs.statSync(filePath);
        return stats.isFile();
    } catch {
        return false;
    }
};

require('tsconfig-paths').register({
    baseUrl,
    paths: {
        '@shared/*': ['src/@shared/*'],
        '@domains/*': ['src/domains/*'],
        '@facades/*': ['src/facades/*'],
        '@interfaces/*': ['src/interfaces/*'],
        '@abstract-factories/*': ['src/abstract-factories/*'],
        '@factories/*': ['src/factories/*'],
        '@config/*': ['src/config/*'],
        '@di/*': ['src/di/*'],
        '@cache/*': ['src/cache/*'],
        '@messaging/*': ['src/messaging/*'],
        '@monitoring/*': ['src/monitoring/*'],
        '@bootstrap/*': ['src/bootstrap/*'],
        '@server/*': ['src/server/*'],
        '@database/*': ['src/database/*'],
        '@processes/*': ['processes/*'],
        '@tests/*': ['tests/*'],
    },
});

console.log('[register-safe] tsconfig-paths registered with patched fs.existsSync');