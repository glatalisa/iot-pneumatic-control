import logging
import json
import time
import re
import threading
from flask import Flask, render_template, request, jsonify, session, redirect, url_for
from flask_session import Session
from flask_socketio import SocketIO, emit
import paho.mqtt.client as mqtt

logging.basicConfig(
    filename='server.log',
    filemode='w',
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)

app = Flask(__name__)
app.config["SESSION_PERMANENT"] = False
app.config["SESSION_TYPE"] = "filesystem"
Session(app)
socketio = SocketIO(app)

BROKER_ENDERECO = "localhost" 
PORTA_BROKER = 1883
TOPICO_COMANDO = "projeto/atuadores/comando"
TOPICO_STATUS = "projeto/atuadores/status"

condition = threading.Condition()
expected_responses = set()
received_responses = set()
sequencer_thread = None
sequencer_stop = False

def on_message_servidor(client, userdata, msg):
    global expected_responses, received_responses
    status_recebido_str = msg.payload.decode("utf-8")
    logging.info(f"<<< Status MQTT recebido: {status_recebido_str}")
    socketio.emit('update_status', status_recebido_str)

    try:
        status_recebido_json = json.loads(status_recebido_str)
        response_item = frozenset(status_recebido_json.items())
        with condition:
            if response_item in expected_responses:
                logging.info(f">>> Resposta esperada recebida: {status_recebido_json}")
                received_responses.add(response_item)
                condition.notify()
    except Exception as e:
        logging.error(f"Erro ao processar mensagem de status: {e}")

def expandir_loops(sequencia_str):
    padrao_loop = r'\[(.*?)\]\s*\*\s*(\d+)'
    
    while re.search(padrao_loop, sequencia_str):
        match = re.search(padrao_loop, sequencia_str)
        conteudo_bloco = match.group(1).strip()
        repeticoes = int(match.group(2))
        
        print(f"DEBUG: Expandindo loop '{conteudo_bloco}' x {repeticoes} vezes", flush=True)
        
        expandido = (conteudo_bloco + " ") * repeticoes
        
        sequencia_str = sequencia_str.replace(match.group(0), expandido)
    
    return sequencia_str

def run_sequencer(sequencia_str):
    global sequencer_stop, expected_responses, received_responses
    sequencer_stop = False

    print(f"DEBUG: Recebi a sequência bruta: '{sequencia_str}'", flush=True)
    
    sequencia_expandida = expandir_loops(sequencia_str)

    print(f"DEBUG: Sequência final após expansão: '{sequencia_expandida}'", flush=True)
    
    logging.info(f"Sequência Original: {sequencia_str}")
    logging.info(f"Sequência Expandida: {sequencia_expandida}")
    
    socketio.emit('sequencer_status', {'status': f'Iniciando: {sequencia_str}'})

    passos = re.findall(r'\([^\)]+\)|T\d+(?:\.\d+)?|[A-Z0-9]+[+\-]', sequencia_expandida.upper())
    
    if not passos:
        logging.error("Sequência inválida ou vazia.")
        socketio.emit('sequencer_status', {'status': 'Erro: Sequência inválida!'})
        return
    
    print(f"DEBUG: Passos identificados para execução: {passos}", flush=True)

    for i, passo_str in enumerate(passos):
        if sequencer_stop:
            logging.info("Sequência interrompida pelo usuário.")
            socketio.emit('sequencer_status', {'status': 'Sequência parada.'})
            break

        passo_str_clean = passo_str.strip('()')

        if passo_str_clean.startswith('T'):
            try:
                tempo_s = float(passo_str_clean[1:])
                socketio.emit('sequencer_status', {'status': f'Aguardando {tempo_s}s...'})
                logging.info(f"Timer: {tempo_s}s")
            
                fim_tempo = time.time() + tempo_s
                while time.time() < fim_tempo:
                    if sequencer_stop: break
                    time.sleep(0.1) 
                
                continue
            except ValueError:
                logging.error(f"Erro ao ler tempo: {passo_str}")

        status_passo = f"Passo {i+1}/{len(passos)}: Executando [{passo_str_clean}]..."
        logging.info(status_passo)
        socketio.emit('sequencer_status', {'status': status_passo})
        
        comandos_individuais = re.findall(r'([A-Z0-9]+)([+\-])', passo_str)

        if not comandos_individuais:
            continue

        local_expected_set = set()
        for cmd in comandos_individuais:
            atuador_id = cmd[0]
            acao_simbolo = cmd[1]
            
            if acao_simbolo == '+':
                sensor_id_esperado = f"{atuador_id}_avancado"
                sensor_estado_esperado = "ativado"
            else: 
                sensor_id_esperado = f"{atuador_id}_recuado"
                sensor_estado_esperado = "ativado"
                
            resposta_esperada = {
                'tipo': 'sensor_estado',
                'id': sensor_id_esperado,
                'estado': sensor_estado_esperado
            }
            local_expected_set.add(frozenset(resposta_esperada.items()))

        with condition:
            received_responses.clear()
            expected_responses = local_expected_set
        
        for comando in comandos_individuais:
            atuador_id, acao_simbolo = comando
            acao = "avancar" if acao_simbolo == '+' else "recuar"
            payload = json.dumps({'id': atuador_id, 'acao': acao})
            client_mqtt.publish(TOPICO_COMANDO, payload, qos=1)
            logging.info(f"  - Comando enviado: {payload}")
        
        if local_expected_set:
            with condition:
                timeout = 5.0 * len(local_expected_set)
                while received_responses != expected_responses:
                    if not condition.wait(timeout) or sequencer_stop:
                        logging.error(f"ERRO: Tempo limite atingido no passo [{passo_str_clean}]!")
                        socketio.emit('sequencer_status', {'status': f'Erro: Timeout no passo [{passo_str_clean}]!'})
                        sequencer_stop = True
                        break
            
                if not sequencer_stop:
                    logging.info(">>> Passo concluído com sucesso.")

        if sequencer_stop:
            break

    if not sequencer_stop:
        logging.info("Sequência concluída.")
        socketio.emit('sequencer_status', {'status': 'Sequência concluída!'})
    
    with condition:
        expected_responses.clear()
        received_responses.clear()
    sequencer_stop = False

def on_connect(client, userdata, flags, rc):
    if rc == 0:
        logging.info(f"Ligado ao Broker MQTT com sucesso!")
        client.subscribe(TOPICO_STATUS)
        logging.info(f"Subscrito ao tópico: {TOPICO_STATUS}")
    else:
        logging.error(f"Falha ao ligar ao MQTT, código de erro: {rc}")

client_mqtt = mqtt.Client(mqtt.CallbackAPIVersion.VERSION1, "servidor_do_glata_FINAL")
client_mqtt.on_message = on_message_servidor
client_mqtt.on_connect = on_connect
client_mqtt.connect(BROKER_ENDERECO, PORTA_BROKER, 60)
client_mqtt.loop_start()

@app.route("/")
def welcome():
    return render_template('welcome.html')

@app.route("/config")
def config_page():
    return render_template('config.html') 

@app.route("/setup", methods=["POST"])
def setup():
    session["num_atuadores"] = int(request.form.get("num_atuadores"))
    session["modo_operacao"] = request.form.get("modo_operacao")
    logging.info(f"Sessão configurada: {session}")
    return redirect(url_for('control'))

@app.route("/control")
def control():
    if "num_atuadores" not in session or "modo_operacao" not in session:
        return redirect(url_for('config_page')) 

    num_atuadores = session.get("num_atuadores")
    modo_operacao = session.get("modo_operacao")
    
    if modo_operacao == 'dashboard':
        return render_template('dashboard.html', num_atuadores=num_atuadores)
    elif modo_operacao == 'manual':
        return render_template('manual.html', num_atuadores=num_atuadores)
    elif modo_operacao == 'sequencial':
        return render_template('sequencial.html', num_atuadores=num_atuadores)
    
    return redirect(url_for('config_page'))

@app.route("/api/atuador/comando", methods=['POST'])
def controlar_atuador():
    dados = request.get_json()
    logging.info(f">>> Comando API recebido: {dados}")
    client_mqtt.publish(TOPICO_COMANDO, json.dumps(dados), qos=1)
    return jsonify({"status": "sucesso"})

@app.route('/api/sequencer/start', methods=['POST'])
def start_sequencer():
    global sequencer_thread
    dados = request.get_json()
    sequencia = dados.get('sequencia')
    if sequencer_thread and sequencer_thread.is_alive():
        return jsonify({'status': 'erro', 'mensagem': 'Uma sequência já está em andamento.'}), 400
    sequencer_thread = socketio.start_background_task(target=run_sequencer, sequencia_str=sequencia)
    return jsonify({'status': 'sucesso', 'mensagem': 'Sequência iniciada.'})

@app.route('/api/sequencer/stop', methods=['POST'])
def stop_sequencer():
    global sequencer_stop
    sequencer_stop = True
    return jsonify({'status': 'sucesso', 'mensagem': 'Sinal de parada enviado.'})

@app.route('/api/system/reset', methods=['POST'])
def reset_system():
    """Para todas as sequências e recua todos os atuadores."""
    global sequencer_stop
    
    sequencer_stop = True
    
    num_atuadores = session.get("num_atuadores", 0)

    logging.info(f"--- RESET GERAL ACIONADO --- Parando sequência e recuando {num_atuadores} atuadores.")
    
    socketio.emit('sequencer_status', {'status': 'Sistema a reiniciar... A recuar todos os atuadores.'})

    for i in range(1, num_atuadores + 1):
        atuador_id = str(i)
        payload = json.dumps({'id': atuador_id, 'acao': 'recuar'})
        client_mqtt.publish(TOPICO_COMANDO, payload, qos=1)
        logging.info(f"  - Comando de reset enviado: {payload}")
        time.sleep(0.05)

    return jsonify({"status": "sucesso", "mensagem": f"Sistema reiniciado, {num_atuadores} atuadores comandados para recuar."})

if __name__ == "__main__":
    logging.info("Iniciando o servidor Flask (Modo de Desenvolvimento)...")
    socketio.run(app, host='0.0.0.0', port=5000, use_reloader=True, debug=True)