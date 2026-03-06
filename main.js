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
const cancelPowerBtn = document.getElementById('cancelPowerBtn');

let currentPower = 0;
let powerTimeout = null;
let powerEndTimeout = null;
let MAX_POWER = 100;
let receivingPower = false;
let onlineUsersCount = 1;
let onlineUsers = [];
let chargesReceived = 0;
let targetCharges = 1;

function checkUserName() {
    const nameModal = document.getElementById('nameModal');
    const nameInput = document.getElementById('nameInput');
    const saveNameBtn = document.getElementById('saveNameBtn');

    if (!localStorage.getItem('userName')) {
        nameModal.style.display = 'flex';
        nameInput.focus();

        const saveName = () => {
            const val = nameInput.value.trim();
            if (val) {
                localStorage.setItem('userName', val);
                userIdSpan.textContent = val;
                socket.emit('set_user_name', val);
                nameModal.style.display = 'none';
            }
        };

        saveNameBtn.addEventListener('click', saveName);
        nameInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') saveName();
        });
    }
}

// Al conectar, mostramos el ID de usuario
socket.on('connect', () => {
    checkUserName();

    if (localStorage.getItem('userName')) {
        userIdSpan.textContent = localStorage.getItem('userName');
        socket.emit('set_user_name', localStorage.getItem('userName'));
    } else {
        userIdSpan.textContent = socket.id.substring(0, 5).toUpperCase();
        socket.emit('set_user_name', userIdSpan.textContent);
    }
    userIdSpan.style.color = '';
    userIdSpan.style.fontWeight = '';
    requestPowerBtn.disabled = false;
});

socket.on('online_users', (users) => {
    onlineUsers = users.filter(u => u.id !== socket.id);
    onlineUsersCount = users.length;
    renderUserSpheres();
});

// Cuando el usuario hace click en "Invocar Poder"
requestPowerBtn.addEventListener('click', () => {
    const userName = localStorage.getItem('userName') || 'Alguien';
    socket.emit('request_power', { requesterName: userName });

    // Update state
    receivingPower = true;
    currentPower = 0;
    chargesReceived = 0;
    targetCharges = Math.max(1, onlineUsersCount - 1); // Descontar al propio usuario
    clearTimeout(powerEndTimeout); // Asegurarse de que no esconda la barra si vuelve a invocar rápido
    updatePowerBar();

    // UI Updates
    requestPowerBtn.innerHTML = '<span class="icon">⌛</span> Invocando...';
    requestPowerBtn.disabled = true;
    cancelPowerBtn.style.display = 'inline-block';
    powerContainer.classList.add('active');

    const resetPowerState = () => {
        receivingPower = false;
        requestPowerBtn.innerHTML = '<span class="icon">✨</span> Invocar Poder';
        requestPowerBtn.disabled = false;
        cancelPowerBtn.style.display = 'none';

        // Hide power bar and reset shortly after
        powerEndTimeout = setTimeout(() => {
            powerContainer.classList.remove('active');
            currentPower = 0;
            updatePowerBar();
            powerStatus.textContent = `Nivel de Energía: 0%`;
            powerStatus.style.color = '';
            powerFill.style.background = '';
            powerFill.style.boxShadow = '';
        }, 4000); // Leaves the full bar for 4s before closing
    };

    // Re-enable after 5 minutes (300000 ms) of listening
    powerTimeout = setTimeout(() => {
        resetPowerState();
    }, 300000);

    // Detener invocación manualmente
    cancelPowerBtn.onclick = () => {
        clearTimeout(powerTimeout);
        resetPowerState();
        socket.emit('clear_power_request');
    };
});

// Cuando alguien más invoca el poder
socket.on('power_requested', (data) => {
    showNotification(data.requesterId, data.requesterName);
});

// Cuando recibimos poder
socket.on('power_received', (data) => {
    if (!receivingPower) return;

    createParticleAnimation();
    showSenderFloatingText(data.senderName || 'Alguien');

    const sphere = document.getElementById('sphere-' + data.senderId);
    if (sphere) {
        sphere.classList.add('pop');
        setTimeout(() => { if (sphere.parentNode) sphere.parentNode.removeChild(sphere); }, 500);
    }

    chargesReceived++;
    currentPower = Math.min(MAX_POWER, (chargesReceived / targetCharges) * 100);

    setTimeout(() => {
        updatePowerBar();

        if (currentPower >= MAX_POWER) {
            receivingPower = false;
            clearTimeout(powerTimeout);
            clearTimeout(powerEndTimeout);

            socket.emit('mission_complete_push');
            socket.emit('clear_power_request');

            powerStatus.textContent = '⚡ ¡PODER MÁXIMO ALCANZADO! ⚡';
            powerStatus.style.color = 'var(--primary)';
            powerFill.style.background = '';
            powerFill.style.boxShadow = '';

            document.body.style.animation = 'pulseBg 0.5s ease 2';
            cancelPowerBtn.style.display = 'none';

            showRewardAnimation();

            powerEndTimeout = setTimeout(() => {
                powerContainer.classList.remove('active');
                currentPower = 0;
                updatePowerBar();
                powerStatus.textContent = `Nivel de Energía: 0%`;
                powerStatus.style.color = '';
                requestPowerBtn.innerHTML = '<span class="icon">✨</span> Invocar Poder';
                requestPowerBtn.disabled = false;
            }, 16000);
        }
    }, 1000); // Matches particle flight duration
});

function updatePowerBar() {
    powerFill.style.width = `${currentPower}%`;
    if (currentPower < MAX_POWER) {
        powerStatus.textContent = `Nivel de Energía: ${currentPower}%`;
    }
}

function showNotification(requesterId, requesterName = null) {
    const notifId = 'notif-' + requesterId;

    // Previene notificaciones duplicadas (e.g. al hacer click en el push mientras ya estás conectado por socket)
    if (document.getElementById(notifId)) return;

    const el = document.createElement('div');
    el.className = 'notification';
    el.id = notifId;

    const shortId = requesterId.substring(0, 5).toUpperCase();
    const displayName = requesterName || shortId;

    el.innerHTML = `
    <div class="notification-header">
      <div class="notification-icon">🙌</div>
      <div class="notification-title">¡TRANSFERENCIA!</div>
    </div>
    <div class="notification-body">
      <strong>${displayName}</strong> necesita un impulso de energía. ¡Manda tu poder!
    </div>
    <button class="action-btn" id="btn-${notifId}">
      🌟 TRANSFERIR PODER
    </button>
  `;

    notificationsContainer.appendChild(el);

    const btn = el.querySelector(`#btn-${notifId}`);
    btn.addEventListener('click', () => {
        const userName = localStorage.getItem('userName') || 'Alguien';
        socket.emit('send_power', { toId: requesterId, senderName: userName });

        btn.innerHTML = '✨ ¡TRANSFERIDO!';
        btn.style.background = 'var(--dark-lcd)';
        btn.style.border = '2px solid var(--green-lcd)';
        btn.style.color = 'var(--green-lcd)';
        btn.style.boxShadow = 'none';
        btn.disabled = true;

        setTimeout(() => {
            removeNotification(notifId);
        }, 1500);
    });

    setTimeout(() => {
        removeNotification(notifId);
    }, 300000); // 5 minutos de tiempo límite
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

function showSenderFloatingText(senderName) {
    const pContainer = document.getElementById('powerContainer');
    if (!pContainer) return;

    const textEl = document.createElement('div');
    textEl.className = 'floating-sender-text';

    // Tiny random offset to avoid exact overlap if multiple users send at the exact same millisecond
    const offsetX = (Math.random() - 0.5) * 40;
    textEl.style.marginLeft = `${offsetX}px`;

    textEl.innerHTML = `¡<strong>${senderName}</strong> te envía poder! 💖`;

    pContainer.appendChild(textEl);

    setTimeout(() => {
        if (textEl.parentNode) textEl.parentNode.removeChild(textEl);
    }, 2500);
}

function renderUserSpheres() {
    let container = document.getElementById('spheresContainer');
    if (!container) {
        container = document.createElement('div');
        container.id = 'spheresContainer';
        document.body.appendChild(container);
    }
    container.innerHTML = '';

    onlineUsers.forEach((user, index) => {
        const sphere = document.createElement('div');
        sphere.className = 'user-sphere';
        sphere.id = 'sphere-' + user.id;

        // Randomly place it within viewport bounds
        const x = 5 + Math.random() * 80; // 5% to 85% 
        const y = 5 + Math.random() * 80;
        sphere.style.left = x + 'vw';
        sphere.style.top = y + 'vh';
        sphere.style.animationDelay = (Math.random() * 2) + 's';

        sphere.innerHTML = `<span class="sphere-name">${user.name}</span>`;
        container.appendChild(sphere);
    });
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

function showRewardAnimation() {
    let overlay = document.getElementById('rewardOverlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'rewardOverlay';
        overlay.className = 'reward-overlay';
        overlay.innerHTML = `
            <div class="video-container">
                <iframe src="https://www.youtube.com/embed/mlGycbFxrSE?autoplay=1&start=0&end=15&controls=0&modestbranding=1&rel=0&showinfo=0&mute=0" allow="autoplay; encrypted-media" frameborder="0"></iframe>
            </div>
            <div class="reward-box">
                <div class="reward-title" style="font-size: 2.2rem;">¡MISIÓN CUMPLIDA!</div>
                <div class="reward-text" style="font-size: 1.2rem;">Vínculo completado.</div>
            </div>
        `;
        document.body.appendChild(overlay);
    } else {
        // Refrescar el iframe para que vuelva a reproducirse desde el inicio y con sonido
        const iframe = overlay.querySelector('iframe');
        if (iframe) iframe.src = iframe.src;
    }

    // Trigger reflow
    void overlay.offsetWidth;
    overlay.classList.add('active');

    // Mantenemos algunas partículas iniciales de celebración
    for (let i = 0; i < 15; i++) {
        setTimeout(createParticleAnimation, i * 100);
    }

    setTimeout(() => {
        overlay.classList.remove('active');
        // Detener el vídeo borrando su src temporalmente
        const iframe = overlay.querySelector('iframe');
        if (iframe) iframe.src = iframe.src;
    }, 16000);
}

// ---- PUSH NOTIFICATION LOGIC ----
const urlParams = new URLSearchParams(window.location.search);
const reqId = urlParams.get('requesterId');
const reqName = urlParams.get('requesterName');
if (reqId) {
    // Si la app se abrió al tocar una notificación en Android
    showNotification(reqId, reqName);
    window.history.replaceState({}, document.title, "/");
}

navigator.serviceWorker && navigator.serviceWorker.addEventListener('message', event => {
    if (event.data && event.data.type === 'push_clicked') {
        showNotification(event.data.requesterId, event.data.requesterName);
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
