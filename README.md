# Sistema de Controle Eletropneumático via IoT

Este repositório contém os códigos fonte e a documentação para o sistema de controle e monitoramento de uma bancada eletropneumática, desenvolvido como parte do Trabalho de Conclusão de Curso (TCC).

O sistema permite o controle remoto de atuadores pneumáticos através de uma interface web responsiva, oferecendo modos de operação manual e sequencial, com feedback de status em tempo real.

## 🚀 Funcionalidades

* **Arquitetura IoT:** Comunicação via protocolo MQTT entre servidor e controladores.
* **Interface Web Moderna:** Design responsivo (Mobile/Desktop) com tema escuro.
* **Modos de Operação:**
    * **Manual:** Controle individual de avanço/recuo para cada atuador.
    * **Sequencial:** Programação de sequências complexas (ex: `1+ 2+ (3- 4-) T2`) com suporte a temporizadores, contadores e ações simultâneas.
* **Feedback em Tempo Real:** Visualização gráfica (animação) do estado dos cilindros via WebSockets.
* **Controle em Malha Fechada:** O sequenciador aguarda a confirmação física dos sensores antes de prosseguir para o próximo passo.
* **Escalabilidade:** Configuração dinâmica do número de atuadores na interface.

## 🛠️ Arquitetura do Sistema

O projeto é dividido em três camadas principais:

1. **Servidor Central (Raspberry Pi / PC):**
    * Roda a aplicação **Python Flask**.
    * Gerencia a interface web e a lógica de automação (Sequenciador).
    * Atua como cliente MQTT para enviar comandos e receber status.
2. **Broker MQTT (Mosquitto):**
    * Intermediário responsável pela troca de mensagens entre o servidor e o hardware.
3. **Controlador de Campo (ESP8266):**
    * Recebe comandos via Wi-Fi.
    * Aciona os **Módulos Relé** (Válvulas Solenoides).
    * Lê os **Sensores de Fim de Curso** e envia feedback.

## 📋 Pré-requisitos

### Hardware
* 1x Raspberry Pi (ou PC para testes)
* 1x ESP8266 (NodeMCU v3 ou similar)
* Módulos Relé (5V)
* Módulos Relé (24V)
* Válvulas Solenoides e Atuadores Pneumáticos
* Sensores de Fim de Curso
* Fonte de Alimentação adequada para as válvulas

### Software
* Python 3.7+
* Broker MQTT (ex: Eclipse Mosquitto) instalado no servidor.
* Arduino IDE (para gravar o firmware no ESP8266).

## 🔧 Instalação e Configuração

### 1. Configuração do Servidor (Backend)

1. Clone este repositório:
    ```bash
    git clone https://github.com/glatalisa/iot-pneumatic-control.git
    cd iot-pneumatic-control/server
    ```

2. Crie um ambiente virtual e instale as dependências:
    ```bash
    python -m venv .venv
    # Windows:
    .\.venv\Scripts\activate
    # Linux/Mac:
    source .venv/bin/activate

    pip install -r requirements.txt
    ```

3. Certifique-se de que o Broker MQTT (Mosquitto) esteja rodando na porta 1883.

4. Inicie o servidor:
    ```bash
    python server.py
    ```
    O sistema estará acessível em `http://localhost:5000` ou `http://IP_DO_RASPBERRY:5000`.

### 2. Configuração do Firmware (ESP8266)

1. Abra o arquivo `firmware/esp8266_controller/esp8266_controller.ino` na Arduino IDE.
2. Instale as bibliotecas necessárias pelo Gerenciador de Bibliotecas:
    * `PubSubClient` (por Nick O'Leary)
    * `ArduinoJson` (por Benoit Blanchon)
3. Edite as configurações no topo do arquivo:
    ```cpp
    const char* WIFI_SSID = "SEU_WIFI";
    const char* WIFI_SENHA = "SUA_SENHA";
    const char* MQTT_BROKER = "IP_DO_SEU_RASPBERRY";
    ```
4. Faça o upload para a placa.

## 🔌 Pinagem (Pinout)

A configuração padrão do firmware utiliza os seguintes pinos no ESP8266 (NodeMCU):

| Componente | Função | Pino ESP8266 | Notas Importantes |
| :--- | :--- | :--- | :--- |
| **Relé 1** | Atuador 1 (Mola) | D1 (GPIO 5) | |
| **Relé 2** | Atuador 2 (Mola) | D2 (GPIO 4) | |
| **Relé 3** | Atuador 3 (Avançar) | D5 (GPIO 14) | |
| **Relé 3** | Atuador 3 (Recuar) | D6 (GPIO 12) | 
| **Relé 4** | Atuador 4 (Avançar) | -1 | *Desativado* |
| **Relé 4** | Atuador 4 (Recuar) | -1| *Desativado* |
| **Sensor 1** | Fim de Curso (Adv) | D7 (GPIO 13) | |
| **Sensor 1** | Fim de Curso (Rec) | D3 (GPIO 0) | Não pressionar durante boot |
| **Sensor 2** | Fim de Curso (Adv) | D0 (GPIO 16) | | Configurado como saída |
| **Sensor 2** | Fim de Curso (Rec) | D4 (GPIO 2) | Não pressionar durante boot |
| **Sensor 3** | Fim de Curso (Adv) | RX (GPIO 3) | Serial Monitor Desativado |
| **Sensor 3** | Fim de Curso (Rec) | TX (GPIO 1) | Serial Monitor Desativado |
| **Sensor 4** | Fim de Curso (Adv) | -1 | *Desativado* |
| **Sensor 4** | Fim de Curso (Rec) | -1 | *Desativado* |

*Nota: A configuração de sensores utiliza `INPUT_PULLUP`. Os sensores devem conectar o pino ao GND quando acionados.*

## 📖 Como Usar

1. Acesse a interface web.
2. Na tela inicial, clique em "Iniciar" no modo desejado (Manual ou Sequencial).
3. Configure o número de atuadores disponíveis na sua bancada.
4. **Modo Manual:** Clique nos botões para acionar os atuadores individualmente.
5. **Modo Sequencial:** Digite a sequência desejada.
    * Sintaxe: `1+` (Avançar 1), `1-` (Recuar 1), `T2.5` (Tempo de 2.5s).
    * Grupos: `(1+ 2+)` para acionamento simultâneo.
    * Loops: `[1+ 1-]*3` para repetir a ação 3 vezes.
