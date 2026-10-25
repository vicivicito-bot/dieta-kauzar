// Guarda la app en el móvil para que funcione sin conexión.
// Al cambiar cualquier archivo, sube la versión para que se actualice.
const VERSION = 'dieta-v2';
const ARCHIVOS = [
  './',
  'index.html',
  'css/styles.css',
  'js/app.js',
  'js/nutricion.js',
  'js/menu.js',
  'data/alimentos.json',
  'data/recetas.json',
  'data/perfil.json',
  'manifest.webmanifest',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/apple-touch-icon.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(ARCHIVOS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((claves) => Promise.all(claves.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// Red primero (para ver siempre lo último), y si no hay conexión, la copia guardada.
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(
    fetch(e.request)
      .then((resp) => {
        const copia = resp.clone();
        caches.open(VERSION).then((c) => c.put(e.request, copia));
        return resp;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true })),
  );
});
