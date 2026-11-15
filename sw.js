/* English Flow Lab — service worker: guarda o app no aparelho para abrir sem internet. */
const VERSION = '02b6e1a93c';
const SHELL = 'efl-shell-' + VERSION;
const CDN = 'efl-cdn-v1';
const SHELL_FILES = ['./', './index.html', './manifest.webmanifest', './icon-192.png', './icon-512.png', './icon-maskable-512.png'];
const CDN_FILES = [
    ['https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600;700&display=swap', 'cors']
];
const CDN_HOSTS = /(^|\.)(fonts\.googleapis\.com|fonts\.gstatic\.com)$/; // só as fontes; o resto já vem dentro do app

self.addEventListener('install', e => {
    e.waitUntil((async () => {
        const c = await caches.open(SHELL);
        await c.addAll(SHELL_FILES);
        const cdn = await caches.open(CDN);
        await Promise.all(CDN_FILES.map(async ([u, mode]) => {
            try { if (await cdn.match(u)) return; const r = await fetch(new Request(u, { mode })); if (r.ok || r.type === 'opaque') await cdn.put(u, r); } catch (err) { /* sem internet: tenta de novo depois */ }
        }));
        await self.skipWaiting();
    })());
});
self.addEventListener('activate', e => {
    e.waitUntil((async () => {
        for (const k of await caches.keys()) if (k.startsWith('efl-shell-') && k !== SHELL) await caches.delete(k);
        await self.clients.claim();
    })());
});
async function networkFirst(req) {
    const c = await caches.open(SHELL);
    try {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 4000); // internet lenta: abre o que está salvo
        const r = await fetch(req, { signal: ctrl.signal });
        clearTimeout(t);
        if (r.ok) await c.put('./index.html', r.clone());
        return r;
    } catch (err) {
        return (await c.match('./index.html')) || (await c.match('./')) || Response.error();
    }
}
async function cacheFirst(req, name) {
    const c = await caches.open(name);
    const hit = await c.match(req, { ignoreSearch: name === SHELL });
    if (hit) return hit;
    try {
        const r = await fetch(req);
        if (r.ok || r.type === 'opaque') await c.put(req, r.clone());
        return r;
    } catch (err) { return Response.error(); }
}
self.addEventListener('fetch', e => {
    const req = e.request;
    if (req.method !== 'GET') return; // conversa com o servidor (POST) passa direto
    const url = new URL(req.url);
    if (url.origin === location.origin) {
        if (req.mode === 'navigate' || url.pathname.endsWith('/index.html')) e.respondWith(networkFirst(req));
        else e.respondWith(cacheFirst(req, SHELL));
        return;
    }
    if (CDN_HOSTS.test(url.hostname)) e.respondWith(cacheFirst(req, CDN));
});
