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
    event.respondWith(fetch(event.request).catch(() => {
      console.error('Fetch failed for GAS:', url);
      return new Response('Network error', { status: 503 });
    }));
  } else {
    event.respondWith(fetch(event.request));
  }
});
