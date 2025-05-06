self.addEventListener('install', () => {
  console.log('Service Worker: Installed');
});

self.addEventListener('activate', () => {
  console.log('Service Worker: Activated');
});

self.addEventListener('fetch', event => {
  const url = event.request.url;
  if (url.includes('script.google.com') || url.includes('your-proxy.herokuapp.com')) {
    console.log('Bypassing Service Worker for external request:', url);
    event.respondWith(fetch(event.request).catch(error => {
      console.error('Fetch failed:', url, error);
      return new Response('Network error', { status: 503 });
    }));
  } else {
    event.respondWith(fetch(event.request));
  }
});
