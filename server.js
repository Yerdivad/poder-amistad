const express = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');
const webpush = require('web-push');

const app = express();
app.use(express.static(__dirname));
app.use(express.json());

const httpServer = createServer(app);
const io = new Server(httpServer, {
    cors: { origin: "*" }
});

// Setup VAPID keys for push notifications
const vapidKeys = {
    publicKey: 'BHaT7iobP2I2in8vWpCvWuA3-ciw2LuUHrdfLcvArT3lejY3WybuFwbuKCM4HFwlglnK_eaPbNASqBdcfuDG5rY',
    privateKey: '7npPnoWsydmsQmRJgwWP_Xl-oJmY4kjqLKIeX7p5hFg'
};
webpush.setVapidDetails(
    'mailto:test@amistad.com',
    vapidKeys.publicKey,
    vapidKeys.privateKey
);

let subscriptions = [];

io.on('connection', (socket) => {
    console.log('User connected:', socket.id);
    io.emit('online_users', io.engine.clientsCount);

    // Provide VAPID key via Socket instead of Fetch
    socket.emit('vapid_key', vapidKeys.publicKey);

    // Save Push subscription via Socket
    socket.on('save_subscription', (subscription) => {
        subscription.socketId = socket.id; // Guarda la conexión actual para filtrarlo 
        const index = subscriptions.findIndex(s => s.endpoint === subscription.endpoint);
        if (index === -1) {
            subscriptions.push(subscription);
            console.log('--- Nuevo Push Endpoint registrado ---');
        } else {
            subscriptions[index] = subscription;
            console.log('--- Push Endpoint actualizado ---');
        }
    });

    socket.on('request_power', (data = {}) => {
        const name = data.requesterName || 'Alguien';

        // Broadcast via websockets for users with the app open
        socket.broadcast.emit('power_requested', { requesterId: socket.id, requesterName: name });

        // Send push notification to all subscribed users (e.g. Android background)
        const payload = JSON.stringify({
            title: '¡Llamada de Amistad!',
            body: `${name} ha invocado el Poder de la Amistad. ¡Ayúdale!`,
            data: { requesterId: socket.id, requesterName: name }
        });

        subscriptions.forEach(sub => {
            // No enviar notificación push al propio usuario que acaba de darle al botón
            if (sub.socketId !== socket.id) {
                webpush.sendNotification(sub, payload).catch(err => {
                    if (err.statusCode === 410 || err.statusCode === 404) {
                        console.log('--- Unsuscribing stale endpoint ---');
                        subscriptions = subscriptions.filter(s => s.endpoint !== sub.endpoint);
                    } else {
                        console.error("Push error:", err);
                    }
                });
            }
        });
    });

    socket.on('send_power', (data) => {
        const name = data.senderName || 'Alguien';
        io.to(data.toId).emit('power_received', { senderId: socket.id, senderName: name });
    });

    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
        io.emit('online_users', io.engine.clientsCount);
    });
});

const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => {
    console.log(`WebSocket server listening on port ${PORT}`);
});
