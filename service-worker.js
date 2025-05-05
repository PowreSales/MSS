self.addEventListener('install', () => {
  console.log('Service Worker: Installed');
});

self.addEventListener('activate', () => {
  console.log('Service Worker: Activated');
});

self.addEventListener('fetch', event => {
  const url = event.request.url;
  if (url.includes('script.google.com')) {
    console.log('Bypassing Service Worker for GAS:', url);
    event.respondWith(fetch(event.request));
  } else {
    event.respondWith(fetch(event.request));
  }
});
