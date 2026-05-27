self.addEventListener("push", function (event) {
  if (!event.data) return;

  let data;
  try {
    data = event.data.json();
  } catch {
    data = { title: "New notification", body: event.data.text() };
  }

  const options = {
    body: data.body,
    icon: data.icon || "/web-app-manifest-192x192.png",
    badge: data.badge || "/web-app-manifest-192x192.png",
    vibrate: [120, 60, 120],
    tag: data.tag,
    renotify: !!data.tag,
    requireInteraction: data.requireInteraction === true,
    data: {
      url: data.url || "/",
      kind: data.kind || "generic",
      receivedAt: Date.now(),
    },
  };

  event.waitUntil(
    self.registration.showNotification(data.title || "Personal Rideshare", options)
  );
});

self.addEventListener("notificationclick", function (event) {
  event.notification.close();
  const targetUrl = event.notification.data?.url || "/";

  event.waitUntil(
    (async () => {
      const allClients = await clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });

      for (const client of allClients) {
        const clientUrl = new URL(client.url);
        if (clientUrl.origin === self.location.origin) {
          await client.focus();
          await client.navigate(targetUrl).catch(() => {});
          return;
        }
      }

      await clients.openWindow(targetUrl);
    })()
  );
});

self.addEventListener("install", function () {
  self.skipWaiting();
});

self.addEventListener("activate", function (event) {
  event.waitUntil(self.clients.claim());
});
