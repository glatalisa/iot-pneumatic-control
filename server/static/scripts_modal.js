document.addEventListener('DOMContentLoaded', () => {
    const modalOverlay = document.getElementById('dashboard-modal');
    const btnOpen = document.getElementById('btn-open-dashboard');
    const btnClose = document.getElementById('btn-close-modal');
    
    const uiServer = document.getElementById('conn-server-status');
    const uiMqtt = document.getElementById('conn-mqtt-status');
    const uiWifi = document.getElementById('conn-wifi-status');
    const uiRssi = document.getElementById('conn-wifi-rssi');

    const socket = io(); 

    
    function setStatus(element, text, colorClass) {
        if (!element) return;
        element.textContent = text;
        element.className = `conn-value ${colorClass}`;
    }

    btnOpen.addEventListener('click', (e) => {
        e.preventDefault();
        modalOverlay.classList.add('open');
    });

    btnClose.addEventListener('click', () => {
        modalOverlay.classList.remove('open');
    });

    modalOverlay.addEventListener('click', (e) => {
        if (e.target === modalOverlay) modalOverlay.classList.remove('open');
    });

    
    socket.on('connect', () => {
        setStatus(uiServer, "Online", "txt-verde");
    });

    socket.on('disconnect', () => {
        setStatus(uiServer, "Offline", "txt-vermelho");
        setStatus(uiMqtt, "Desconectado", "txt-vermelho");
    });


    socket.on('update_status', (msg_json) => {
        setStatus(uiMqtt, "Ativo", "txt-verde");

        try {
            const dados = JSON.parse(msg_json);
            
            if (dados.tipo === 'sistema_wifi') {
                const rssi = parseInt(dados.rssi);
                
                if (uiRssi) uiRssi.textContent = `Sinal: ${rssi} dBm`;

                if (rssi > -50) {
                    setStatus(uiWifi, "Excelente", "txt-verde");
                } else if (rssi > -70) {
                    setStatus(uiWifi, "Bom", "txt-verde");
                } else if (rssi > -85) {
                    setStatus(uiWifi, "Fraco", "txt-amarelo");
                } else {
                    setStatus(uiWifi, "Instável", "txt-vermelho");
                }
            }
        } catch (e) { console.error(e); }
    });
});