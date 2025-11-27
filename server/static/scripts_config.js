document.addEventListener('DOMContentLoaded', () => {

    let numAtuadores = 1;
    let modoOperacao = 'manual';

    const segments = document.querySelectorAll('.segment');
    const sliderValueDisplay = document.getElementById('slider-value');

    function updateSegments(value) {
        const numValue = parseInt(value, 10);
        
        numAtuadores = numValue;
        
        sliderValueDisplay.textContent = numValue;
        segments.forEach(segment => {
            const segmentValue = parseInt(segment.dataset.value, 10);
            if (segmentValue <= numValue) {
                segment.classList.add('active');
            } else {
                segment.classList.remove('active');
            }
        });
        console.log(`Atuadores selecionados: ${numAtuadores}`);
    }

    segments.forEach(segment => {
        segment.addEventListener('click', () => {
            updateSegments(segment.dataset.value);
        });
    });

    const initialActiveSegment = document.querySelector('.segment.active');
    if (initialActiveSegment) {
        updateSegments(initialActiveSegment.dataset.value);
    } else {
        updateSegments(1);
    }

    const modeOptions = document.querySelectorAll('.mode-option');

    modeOptions.forEach(option => {
        option.addEventListener('click', () => {
            modeOptions.forEach(btn => btn.classList.remove('active'));
            option.classList.add('active');
            
            modoOperacao = option.dataset.mode;
            console.log(`Modo selecionado: ${modoOperacao}`);
        });
    });

    const initialActiveMode = document.querySelector('.mode-option.active');
    if (initialActiveMode) {
        modoOperacao = initialActiveMode.dataset.mode;
    }

    const startButton = document.querySelector('.btn-primary');

    startButton.addEventListener('click', (event) => {
        event.preventDefault();
        console.log(`Enviando para o servidor: Modo=${modoOperacao}, Atuadores=${numAtuadores}`);

        const form = document.createElement('form');
        form.method = 'POST';
        form.action = '/setup';

        const numInput = document.createElement('input');
        numInput.type = 'hidden';
        numInput.name = 'num_atuadores';
        numInput.value = numAtuadores;
        form.appendChild(numInput);

        const modeInput = document.createElement('input');
        modeInput.type = 'hidden';
        modeInput.name = 'modo_operacao';
        modeInput.value = modoOperacao;
        form.appendChild(modeInput);

        document.body.appendChild(form);
        form.submit();
    });

});