const express = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');
const webpush = require('web-push');
const { MongoClient } = require('mongodb');

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

// Base de datos (Opcional, si MONGODB_URI está definida)
const MONGODB_URI = process.env.MONGODB_URI;
let SubscriptionsCollection;

if (MONGODB_URI) {
    const dbClient = new MongoClient(MONGODB_URI);
    dbClient.connect()
        .then(() => {
            console.log("🚀 Conectado a MongoDB Atlas.");
            SubscriptionsCollection = dbClient.db('poderamistad').collection('subscriptions');
            return SubscriptionsCollection.find().toArray();
        })
        .then(subs => {
            // Quitamos el _id de Mongo para no corromper el formato de suscripción Push de web-push
            subscriptions = subs.map(s => {
                const { _id, ...rest } = s;
                return rest;
            });
            console.log(`📡 Cargadas ${subscriptions.length} suscripciones persistentes.`);
        })
        .catch(err => console.error("❌ Error conectando a MongoDB:", err));
}
let connectedUsers = {};

io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    connectedUsers[socket.id] = { id: socket.id, name: 'Anónimo' };

    // Function to broadcast users safely
    const broadcastUsers = () => {
        io.emit('online_users', Object.values(connectedUsers));
    };

    broadcastUsers();

    socket.on('set_user_name', (name) => {
        if (connectedUsers[socket.id]) {
            connectedUsers[socket.id].name = name;
            broadcastUsers();
        }
    });

    // Provide VAPID key via Socket instead of Fetch
    socket.emit('vapid_key', vapidKeys.publicKey);

    // Save Push subscription via Socket
    socket.on('save_subscription', (subscription) => {
        subscription.socketId = socket.id; // Guarda la conexión actual para filtrarlo 
        const index = subscriptions.findIndex(s => s.endpoint === subscription.endpoint);
        if (index === -1) {
            subscriptions.push(subscription);
            if (SubscriptionsCollection) {
                SubscriptionsCollection.insertOne(subscription).catch(console.error);
            }
            console.log('--- Nuevo Push Endpoint registrado ---');
        } else {
            subscriptions[index] = subscription;
            if (SubscriptionsCollection) {
                SubscriptionsCollection.updateOne(
                    { endpoint: subscription.endpoint },
                    { $set: subscription },
                    { upsert: true }
                ).catch(console.error);
            }
            console.log('--- Push Endpoint actualizado ---');
        }
    });

    socket.on('request_power', (data = {}) => {
        const name = data.requesterName || 'Alguien';

        // Broadcast via websockets for users with the app open
        socket.broadcast.emit('power_requested', { requesterId: socket.id, requesterName: name });

        // Send push notification to all subscribed users (e.g. Android background)
        const payload = JSON.stringify({
            title: '¡Llamada de TRANSFERENCIA!',
            body: `${name} necesita un impulso de energía. ¡Manda tu poder!`,
            data: { requesterId: socket.id, requesterName: name },
            tag: socket.id // <-- tag para cerrarla luego
        });

        subscriptions.forEach(sub => {
            // No enviar notificación push al propio usuario que acaba de darle al botón
            if (sub.socketId !== socket.id) {
                webpush.sendNotification(sub, payload).catch(err => {
                    if (err.statusCode === 410 || err.statusCode === 404) {
                        console.log('--- Unsuscribing stale endpoint ---');
                        subscriptions = subscriptions.filter(s => s.endpoint !== sub.endpoint);
                        if (SubscriptionsCollection) {
                            SubscriptionsCollection.deleteOne({ endpoint: sub.endpoint }).catch(console.error);
                        }
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

    socket.on('clear_power_request', () => {
        // Enviar push de cierre a todos los que recibieron la petición
        const closePayload = JSON.stringify({ action: 'close', tag: socket.id });
        subscriptions.forEach(sub => {
            if (sub.socketId !== socket.id) {
                webpush.sendNotification(sub, closePayload).catch(() => { });
            }
        });
    });

    socket.on('mission_complete_push', () => {
        const successPayload = JSON.stringify({
            title: '¡Misión Cumplida! 🌟',
            body: '¡Has recibido toda la energía requerida!',
            data: {},
            tag: 'success_mission',
            actionTitle: 'Ver'
        });
        subscriptions.forEach(sub => {
            if (sub.socketId === socket.id) {
                webpush.sendNotification(sub, successPayload).catch(console.error);
            }
        });
    });

    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
        delete connectedUsers[socket.id];
        broadcastUsers();
    });
});

const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => {
    console.log(`WebSocket server listening on port ${PORT}`);
});
