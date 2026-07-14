const CACHE='cp-v32-2-0';
const STATIC=[
  './styles.css?v=32.2.0',
  './map.png?v=32.2.0',
  './v32-2-ui.js?v=32.2.0',
  './manifest.webmanifest?v=32.2.0',
  './icon-192.png',
  './icon-512.png',
  './reset-cache.html'
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(STATIC)));
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key)))
    )
  );
  self.clients.claim();
});

function patchedIndex(request){
  return fetch(request, {cache:'no-store'}).then(async response => {
    let html = await response.text();
    html = html
      .replaceAll('Command Platform v32.1', 'Command Platform v32.2')
      .replaceAll('v32.1', 'v32.2')
      .replace('styles.css?v=32.1.0', 'styles.css?v=32.2.0')
      .replace('manifest.webmanifest?v=32.1.0', 'manifest.webmanifest?v=32.2.0');

    if (!html.includes('v32-2-ui.js')) {
      html = html.replace(
        '</body>',
        '<script src="v32-2-ui.js?v=32.2.0"></script></body>'
      );
    }
    return new Response(html, {
      status: response.status,
      statusText: response.statusText,
      headers: {'Content-Type':'text/html; charset=utf-8'}
    });
  });
}

function patchedApp(request){
  return fetch(request, {cache:'no-store'}).then(async response => {
    let js = await response.text();
    js = js
      .replace("const APP_VERSION='32.1.0';", "const APP_VERSION='32.2.0';")
      .replace("./sw.js?v=32.1.0", "./sw.js?v=32.2.0");
    return new Response(js, {
      status: response.status,
      statusText: response.statusText,
      headers: {'Content-Type':'application/javascript; charset=utf-8'}
    });
  });
}

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);

  if (event.request.mode === 'navigate' || url.pathname.endsWith('/index.html')) {
    event.respondWith(patchedIndex(event.request).catch(() => caches.match('./index.html')));
    return;
  }

  if (url.pathname.endsWith('/app.js')) {
    event.respondWith(patchedApp(event.request));
    return;
  }

  if (url.pathname.endsWith('/version.json')) {
    event.respondWith(fetch(event.request, {cache:'no-store'}));
    return;
  }

  if (url.pathname.endsWith('/styles.css')) {
    event.respondWith(fetch('./styles.css?v=32.2.0', {cache:'no-store'}));
    return;
  }

  if (url.pathname.endsWith('/map.png')) {
    event.respondWith(fetch('./map.png?v=32.2.0', {cache:'no-store'}));
    return;
  }

  event.respondWith(
    caches.match(event.request).then(cached =>
      cached || fetch(event.request).then(response => {
        const copy = response.clone();
        caches.open(CACHE).then(cache => cache.put(event.request, copy));
        return response;
      })
    )
  );
});
