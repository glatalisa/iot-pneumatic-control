document.addEventListener('DOMContentLoaded', () => {

    const numAtuadores = parseInt(document.body.dataset.numAtuadores, 10);

    const atuadorGrid = document.getElementById('controle-manual-grid');
    const dashboardStatusDiv = document.getElementById('dashboard-status');
    const socket = io();

    function gerarControles(quantidade) {
        atuadorGrid.innerHTML = '';
        dashboardStatusDiv.innerHTML = ''; 

        for (let i = 1; i <= quantidade; i++) {
            const id = i.toString();

            const card = document.createElement('div');
            card.className = 'atuador-card estado-recuado';
            card.id = `atuador-card-${id}`;

            card.innerHTML = `
                <h3>Atuador ${id}</h3>
                
                <div class="cilindro-animacao">
                    <div class="cilindro-haste"></div>
                    <div class="cilindro-linha-progresso"></div>
                </div>
                
                <div class="status-indicator">
                    <div class="status-dot"></div>
                    <span class="status-text">Retraído</span>
                </div>
                
                <div class="botoes-manual">
                    <button class="btn btn-recuar" data-id="${id}" data-acao="recuar">RECUAR</button>
                    <button class="btn btn-avancar" data-id="${id}" data-acao="avancar">AVANÇAR</button>
                </div>
            `;

            atuadorGrid.appendChild(card);

            const logAtuador = `<p id="log-atuador-${id}"><strong>Atuador ${id}:</strong> --</p>`;
            const logSensorAv = `<p id="log-sensor-${id}_avancado" class="log-sensor"><strong>Sensor ${id} AV:</strong> --</p>`;
            const logSensorRe = `<p id="log-sensor-${id}_recuado" class="log-sensor"><strong>Sensor ${id} RE:</strong> --</p>`;
            dashboardStatusDiv.innerHTML += logAtuador + logSensorAv + logSensorRe;
        }

    }

    function enviarComando(id, acao) {
        console.log(`>>> ENVIANDO COMANDO: ID=${id}, Ação=${acao}`);
        fetch('/api/atuador/comando', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: id, acao: acao })
        })
            .then(response => response.json())
            .then(data => console.log('Resposta do servidor:', data))
            .catch(error => console.error('Erro ao enviar comando:', error));
    }

    atuadorGrid.addEventListener('click', (event) => {
        const target = event.target.closest('button');
        if (target) {
            enviarComando(target.dataset.id, target.dataset.acao);
        }
    });

    const btnResetGlobal = document.getElementById('btn-global-reset');

    if (btnResetGlobal) { 
        btnResetGlobal.addEventListener('click', () => {
            if (confirm('Tem a certeza que deseja parar tudo e recuar todos os atuadores?')) {
                console.log('>>> ENVIANDO COMANDO DE RESET GLOBAL');

                fetch('/api/system/reset', { method: 'POST' })
                    .then(response => response.json())
                    .then(data => {
                        console.log('Resposta do Reset:', data.mensagem);
                    })
                    .catch(error => console.error('Erro ao reiniciar:', error));
            }
        });
    }

    function atualizarEstadoAtuador(id, status) {
        const card = document.getElementById(`atuador-card-${id}`);
        if (!card) return;

        const statusText = card.querySelector('.status-text');

        card.classList.remove('estado-avancado', 'estado-recuado');

        if (status === 'Avancado') {
            card.classList.add('estado-avancado');
            if (statusText) statusText.textContent = 'Avançado';
        } else if (status === 'Recuado') {
            card.classList.add('estado-recuado');
            if (statusText) statusText.textContent = 'Retraído';
        }
    }


    socket.on('update_status', (msg_json) => {
        try {
            const dados = JSON.parse(msg_json);
            const data = new Date();
            const hora = data.toLocaleTimeString();

            let logId;
            let logTexto;

            if (dados.tipo === 'atuador_cmd') {
                logId = `log-atuador-${dados.id}`;
                logTexto = `<strong>Atuador ${dados.id}:</strong> ${dados.status}`;
                atualizarEstadoAtuador(dados.id, dados.status);

            } else if (dados.tipo === 'sensor_estado') {
                logId = `log-sensor-${dados.id}`;
                logTexto = `<strong>Sensor ${dados.id}:</strong> ${dados.estado}`;

                const [id, tipoSensor] = dados.id.split('_');
                if (dados.estado === 'ativado') {
                    const estado = (tipoSensor === 'avancado') ? 'Avancado' : 'Recuado';
                    atualizarEstadoAtuador(id, estado);
                }
            }

            if (logId) {
                const el = document.getElementById(logId);
                if (el) {
                    el.innerHTML = logTexto;
                }
            }
        } catch (e) {
            console.error("Erro ao processar JSON:", e);
        }
    });

    socket.on('sequencer_status', (data) => {
        const el = document.getElementById('log-sequenciador');
        if (el) {
            const hora = new Date().toLocaleTimeString();
            el.innerHTML = `<p style="color:#8E44AD; margin:0;">[${hora}] <strong>Sequenciador:</strong> ${data.status}</p>`;
        }
    });

    gerarControles(numAtuadores);
});