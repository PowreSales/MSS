const CACHE_NAME = 'medicine-sales-v1';
const urlsToCache = [
  '/MSS/',
  '/MSS/index.html',
  '/MSS/app.js',
  'https://cdn.jsdelivr.net/npm/jquery@3.6.0/dist/jquery.min.js',
  'https://cdn.jsdelivr.net/npm/select2@4.1.0-rc.0/dist/js/select2.min.js',
  'https://cdn.jsdelivr.net/npm/select2@4.1.0-rc.0/dist/css/select2.min.css',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.2/css/all.min.css'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Caching resources');
        return cache.addAll(urlsToCache);
      })
      .catch(err => console.error('Cache addAll error:', err))
  );
});

self.addEventListener('fetch', event => {
  const url = event.request.url;
  if (url.includes('script.google.com')) {
    console.log('Bypassing Service Worker for GAS:', url);
    event.respondWith(fetch(event.request).catch(err => {
      console.error('GAS fetch error:', err);
      throw err;
    }));
    return;
  }
  event.respondWith(
    caches.match(event.request)
      .then(response => response || fetch(event.request))
      .catch(err => console.error('Fetch error:', err))
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.filter(name => name !== CACHE_NAME)
          .map(name => caches.delete(name))
      );
    })
  );
});
