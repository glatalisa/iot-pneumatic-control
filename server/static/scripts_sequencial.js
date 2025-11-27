document.addEventListener('DOMContentLoaded', () => {

    const numAtuadores = parseInt(document.body.dataset.numAtuadores, 10);
    const atuadorGrid = document.getElementById('visualizacao-grid');
    const socket = io();

    const sequenciaInput = document.getElementById('sequenciaInput');
    const btnIniciar = document.getElementById('btn-iniciar-seq');
    const btnParar = document.getElementById('btn-parar-seq');

    function gerarInterface(quantidade) {
        atuadorGrid.innerHTML = '';

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
                    <span class="status-text">Recuado</span>
                </div>
            `;
            atuadorGrid.appendChild(card);
        }
    }

    btnIniciar.addEventListener('click', () => {
        const sequencia = sequenciaInput.value;
        if (!sequencia) { return alert('Digite uma sequência válida!'); }

        console.log(`Iniciando sequência: ${sequencia}`);
        fetch('/api/sequencer/start', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sequencia: sequencia })
        });
    });

    btnParar.addEventListener('click', () => {
        console.log('Parando sequência');
        fetch('/api/sequencer/stop', { method: 'POST' });
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
            if (statusText) statusText.textContent = 'Recuado';
        }
    }

    socket.on('connect', () => {
        console.log("Socket.IO Conectado!");
    });

    socket.on('update_status', (msg_json) => {
        try {
            const dados = JSON.parse(msg_json);

            if (dados.tipo === 'atuador_cmd') {
                atualizarEstadoAtuador(dados.id, dados.status);

            } else if (dados.tipo === 'sensor_estado') {
                const [id, tipoSensor] = dados.id.split('_');
                if (dados.estado === 'ativado') {
                    const estado = (tipoSensor === 'avancado') ? 'Avancado' : 'Recuado';
                    atualizarEstadoAtuador(id, estado);
                }
            }
        } catch (e) {
            console.error("Erro ao processar JSON:", e);
        }
    });

    socket.on('sequencer_status', (data) => {
        console.log(`STATUS DO SEQUENCIADOR: ${data.status}`);
    });

    gerarInterface(numAtuadores);
});