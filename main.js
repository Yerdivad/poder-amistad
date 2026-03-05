// Connect dynamically and bypass localtunnel bot protection for the socket
const socket = io({
    transports: ['websocket', 'polling'], // Fallback a polling si websocket falla
    extraHeaders: {
        "Bypass-Tunnel-Reminder": "true"
    }
});

const userIdSpan = document.getElementById('userId');
const requestPowerBtn = document.getElementById('requestPowerBtn');
const notificationsContainer = document.getElementById('notificationsContainer');
const powerContainer = document.getElementById('powerContainer');
const powerFill = document.getElementById('powerFill');
const powerStatus = document.getElementById('powerStatus');

let currentPower = 0;
let MAX_POWER = 100;
let receivingPower = false;

// Al conectar, mostramos el ID de usuario
socket.on('connect', () => {
    userIdSpan.textContent = socket.id.substring(0, 5).toUpperCase();
    userIdSpan.style.color = '#c084fc';
    userIdSpan.style.fontWeight = '800';
    requestPowerBtn.disabled = false;
});

// Cuando el usuario hace click en "Invocar Poder"
requestPowerBtn.addEventListener('click', () => {
    socket.emit('request_power');

    // Update state
    receivingPower = true;
    currentPower = 0;
    updatePowerBar();

    // UI Updates
    requestPowerBtn.innerHTML = '<span class="icon">⌛</span> Invocando...';
    requestPowerBtn.disabled = true;
    powerContainer.classList.add('active');

    // Re-enable after 10 seconds of listening
    setTimeout(() => {
        receivingPower = false;
        requestPowerBtn.innerHTML = '<span class="icon">✨</span> Invocar Poder';
        requestPowerBtn.disabled = false;

        // Hide power bar and reset shortly after
        setTimeout(() => {
            powerContainer.classList.remove('active');
            currentPower = 0;
            updatePowerBar();
            powerStatus.textContent = `Nivel de Energía: 0%`;
            powerStatus.style.color = '#fbbf24';
            powerFill.style.background = 'linear-gradient(90deg, #fbbf24, #f59e0b)';
            powerFill.style.boxShadow = '0 0 15px #f59e0b';
        }, 4000); // Leaves the full bar for 4s before closing
    }, 10000);
});

// Cuando alguien más invoca el poder
socket.on('power_requested', (data) => {
    showNotification(data.requesterId);
});

// Cuando recibimos poder
socket.on('power_received', (data) => {
    if (!receivingPower) return;

    createParticleAnimation();

    setTimeout(() => {
        currentPower = Math.min(MAX_POWER, currentPower + 35); // Big boost for DEMO speed
        updatePowerBar();

        if (currentPower >= MAX_POWER) {
            powerStatus.textContent = '⚡ ¡PODER MÁXIMO ALCANZADO! ⚡';
            powerStatus.style.color = '#34d399';
            powerFill.style.background = 'linear-gradient(90deg, #10b981, #34d399)';
            powerFill.style.boxShadow = '0 0 20px #34d399';

            document.body.style.animation = 'pulseBg 0.5s ease 2';
        }
    }, 1000); // Matches particle flight duration
});

function updatePowerBar() {
    powerFill.style.width = `${currentPower}%`;
    if (currentPower < MAX_POWER) {
        powerStatus.textContent = `Nivel de Energía: ${currentPower}%`;
    }
}

function showNotification(requesterId) {
    const notifId = 'notif-' + Date.now();
    const el = document.createElement('div');
    el.className = 'notification';
    el.id = notifId;

    const shortId = requesterId.substring(0, 5).toUpperCase();

    el.innerHTML = `
    <div class="notification-header">
      <div class="notification-icon">🙌</div>
      <div class="notification-title">¡Llamada de Amistad!</div>
    </div>
    <div class="notification-body">
      El usuario <strong style="color: #ec4899;">${shortId}</strong> ha invocado el Poder de la Amistad. ¡Ayúdale a reunir energía!
    </div>
    <button class="action-btn" id="btn-${notifId}">
      🌟 Enviar Poder
    </button>
  `;

    notificationsContainer.appendChild(el);

    const btn = el.querySelector(`#btn-${notifId}`);
    btn.addEventListener('click', () => {
        socket.emit('send_power', { toId: requesterId });

        btn.innerHTML = '✨ ¡Enviado!';
        btn.style.background = 'transparent';
        btn.style.border = '2px solid #34d399';
        btn.style.color = '#34d399';
        btn.style.boxShadow = 'none';
        btn.disabled = true;

        setTimeout(() => {
            removeNotification(notifId);
        }, 1500);
    });

    setTimeout(() => {
        removeNotification(notifId);
    }, 15000);
}

function removeNotification(id) {
    const el = document.getElementById(id);
    if (el) {
        el.classList.add('hiding');
        setTimeout(() => {
            if (el.parentNode) el.parentNode.removeChild(el);
        }, 400);
    }
}

function createParticleAnimation() {
    const numParticles = Math.floor(Math.random() * 4) + 5;
    const cx = window.innerWidth / 2;
    const cy = window.innerHeight / 2;

    for (let i = 0; i < numParticles; i++) {
        const p = document.createElement('div');
        p.className = 'particle-effect';

        const size = Math.random() * 10 + 10;
        p.style.width = size + 'px';
        p.style.height = size + 'px';

        const edge = Math.floor(Math.random() * 4);
        let startX, startY;

        if (edge === 0) {
            startX = Math.random() * window.innerWidth;
            startY = -50;
        } else if (edge === 1) {
            startX = window.innerWidth + 50;
            startY = Math.random() * window.innerHeight;
        } else if (edge === 2) {
            startX = Math.random() * window.innerWidth;
            startY = window.innerHeight + 50;
        } else {
            startX = -50;
            startY = Math.random() * window.innerHeight;
        }

        p.style.left = startX + 'px';
        p.style.top = startY + 'px';

        // Animation API
        p.animate([
            { transform: 'translate(0,0) scale(0.5)', opacity: 0 },
            { transform: `translate(${(cx - startX) / 3}px, ${(cy - startY) / 3}px) scale(1.5)`, opacity: 1, offset: 0.3 },
            { transform: `translate(${cx - startX}px, ${cy - startY}px) scale(0)`, opacity: 0 }
        ], {
            duration: 1200 + Math.random() * 500,
            easing: 'cubic-bezier(0.25, 1, 0.5, 1)',
            delay: Math.random() * 200,
            fill: 'forwards'
        });

        document.body.appendChild(p);
        setTimeout(() => {
            if (p.parentNode) p.parentNode.removeChild(p);
        }, 2000);
    }
}

// ---- PUSH NOTIFICATION LOGIC ----
const urlParams = new URLSearchParams(window.location.search);
const reqId = urlParams.get('requesterId');
if (reqId) {
    // Si la app se abrió al tocar una notificación en Android
    showNotification(reqId);
    window.history.replaceState({}, document.title, "/");
}

navigator.serviceWorker && navigator.serviceWorker.addEventListener('message', event => {
    if (event.data && event.data.type === 'push_clicked') {
        showNotification(event.data.requesterId);
    }
});

if ('Notification' in window && 'serviceWorker' in navigator) {
    if (Notification.permission === 'default' || Notification.permission === 'denied') {
        setTimeout(() => {
            if (Notification.permission === 'denied') {
                document.getElementById('pushBannerText').innerText = "¡Notificaciones Bloqueadas!";
                document.getElementById('pushBannerSub').innerText = "Para recibir poder de la amistad, toca el icono 🔒 en la barra de direcciones, entra a Permisos y habilita 'Notificaciones'.";
                document.getElementById('enablePushBtn').innerText = "Hecho";
            }
            document.getElementById('pushBanner').style.display = 'block';
        }, 1000);
    }
}

let savedVapidKey = null;
socket.on('vapid_key', async (key) => {
    savedVapidKey = key;
    if ('Notification' in window && Notification.permission === 'granted') {
        // Al recargar la página si ya tenía permiso, nos volvemos a suscribir silenciosamente
        await subscribePush();
    }
});

document.getElementById('enablePushBtn').addEventListener('click', async () => {
    document.getElementById('pushBanner').style.display = 'none';
    if (Notification.permission === 'denied') {
        // We asked them to change settings. Reload page to test if they did and push subscription is renewed.
        window.location.reload();
    } else {
        await subscribePush();
    }
});

async function subscribePush() {
    if ('serviceWorker' in navigator && 'PushManager' in window && savedVapidKey) {
        try {
            const registration = await navigator.serviceWorker.register('/sw.js');
            const permission = await Notification.requestPermission();

            if (permission !== 'granted') {
                console.log('Permission not granted for Push');
                return;
            }

            const convertedVapidKey = urlBase64ToUint8Array(savedVapidKey);

            let subscription = await registration.pushManager.getSubscription();
            if (!subscription) {
                subscription = await registration.pushManager.subscribe({
                    userVisibleOnly: true,
                    applicationServerKey: convertedVapidKey
                });
            }

            // Enviar suscripción a través del socket
            socket.emit('save_subscription', subscription);
            console.log('Push successfully subscribed!');
        } catch (err) {
            console.error('Failed to subscribe to Push:', err);
        }
    } else {
        console.warn('Cannot subscribe: Service Worker/Push Manager not available or VAPID key missing.');
    }
}

function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding)
        .replace(/\-/g, '+')
        .replace(/_/g, '/');
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) {
        outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
}
