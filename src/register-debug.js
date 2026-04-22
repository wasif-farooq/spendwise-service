const fs = require('fs');
const path = require('path');
const Module = require('module');

let depth = 0;
const maxDepth = 20;
const logging = new Set();

const baseUrl = path.resolve(__dirname, '..');

const origResolve = Module._resolveFilename;
Module._resolveFilename = function(request, parent, isMain, options) {
    if (request.includes('@')) {
        depth++;
        if (depth <= maxDepth) {
            const key = request + '@' + (parent ? parent.filename : 'root');
            if (!logging.has(key)) {
                logging.add(key);
                console.log(`[resolve] ${request} (depth: ${depth}, file: ${parent ? parent.filename : 'none'})`);
            }
        } else if (depth > maxDepth) {
            console.log(`[resolve] STACK OVERFLOW at: ${request}`);
            throw new Error('Stack limit');
        }
    }
    const result = origResolve.apply(this, arguments);
    if (request.includes('@')) depth--;
    return result;
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

console.log('[register-debug] tsconfig-paths registered');