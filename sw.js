self.addEventListener('push', function (event) {
    const data = event.data ? event.data.json() : {};

    const options = {
        body: data.body || 'Alguien necesita energía vital',
        icon: '/icon.svg',
        badge: '/icon.svg',
        vibrate: [200, 100, 200],
        data: data.data || {},
        actions: [
            {
                action: 'open_app',
                title: '✨ Enviar Poder'
            }
        ]
    };

    event.waitUntil(
        self.registration.showNotification(data.title || 'Llamada de Amistad', options)
    );
});

self.addEventListener('notificationclick', function (event) {
    event.notification.close();

    const requesterId = event.notification.data ? event.notification.data.requesterId : null;
    const requesterName = event.notification.data ? event.notification.data.requesterName : null;

    let url = '/';
    if (requesterId) {
        url = '/?requesterId=' + requesterId;
        if (requesterName) url += '&requesterName=' + encodeURIComponent(requesterName);
    }

    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then(windowClients => {
            for (let client of windowClients) {
                if ('focus' in client) {
                    return client.focus().then(() => {
                        if (requesterId) {
                            client.postMessage({ type: 'push_clicked', requesterId: requesterId, requesterName: requesterName });
                        }
                    });
                }
            }
            if (clients.openWindow) {
                return clients.openWindow(url);
            }
        })
    );
});
