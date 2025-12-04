#include <ESP8266WiFi.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>

// =================================================================================
// 1. CONFIGURAÇÕES DE REDE E SERVIDOR
// =================================================================================
const char* WIFI_SSID   = "NOME_DA_SUA_REDE_WIFI";
const char* WIFI_SENHA  = "SENHA_DA_SUA_REDE_WIFI";
const char* MQTT_BROKER = "IP_DO_SEU_SERVIDOR";
const int   MQTT_PORT   = 1883;
const char* CLIENT_ID   = "ESP8266_Bancada_PFC";

// =================================================================================
// 2. DEFINIÇÃO DE HARDWARE (PINOS)
// =================================================================================

// --- Relés (Saídas) ---
const int RELAY_PIN_1     = D0; // Atuador 1 (Mola)
const int RELAY_PIN_2     = D2; // Atuador 2 (Mola)
const int RELAY_PIN_3_ADV = D5; // Atuador 3 (Duplo - Avanço)
const int RELAY_PIN_3_REC = D6; // Atuador 3 (Duplo - Recuo)
const int RELAY_PIN_4_ADV = -1; // Atuador 4 (Duplo - Avanço) *Desativado
const int RELAY_PIN_4_REC = -1; // Atuador 4 (Duplo - Recuo) *Desativado

// Lógica do Relé (Ajustar conforme módulo utilizado)
#define RELAY_ACTIVE_LEVEL LOW
#define RELAY_INACTIVE_LEVEL HIGH
#define PULSE_DURATION 200

// --- Sensores (Entradas) ---
// Nota: GPIO1 (TX) e GPIO3 (RX) são usados como entradas digitais.
// Isso desabilita o Monitor Serial padrão.
// #define USE_SERIAL_DEBUG  // Descomente APENAS para testes sem sensores em RX/TX

const int SENSOR_PIN_1_ADV = D7;  // GPIO13
const int SENSOR_PIN_1_REC = D3;  // GPIO0
const int SENSOR_PIN_2_ADV = D1;  // GPIO5
const int SENSOR_PIN_2_REC = D4;  // GPIO2
const int SENSOR_PIN_3_ADV = 3;   // GPIO3 (RX)
const int SENSOR_PIN_3_REC = 1;   // GPIO1 (TX)
const int SENSOR_PIN_4_ADV = -1;  // *Desativado
const int SENSOR_PIN_4_REC = -1;  // *Desativado

// Estrutura para gerenciamento eficiente dos sensores
struct Sensor {
  int pin;
  const char* id;
  int lastState;
};

// Array de configuração dos sensores
// Pinos definidos como -1 são ignorados pelo sistema
Sensor sensors[] = {
  {SENSOR_PIN_1_ADV, "1_avancado", -1}, {SENSOR_PIN_1_REC, "1_recuado", -1},
  {SENSOR_PIN_2_ADV, "2_avancado", -1}, {SENSOR_PIN_2_REC, "2_recuado", -1},
  {SENSOR_PIN_3_ADV, "3_avancado", -1}, {SENSOR_PIN_3_REC, "3_recuado", -1},
  {SENSOR_PIN_4_ADV, "4_avancado", -1}, {SENSOR_PIN_4_REC, "4_recuado", -1}
};
const int NUM_SENSORS = sizeof(sensors) / sizeof(sensors[0]);

// =================================================================================
// 3. TÓPICOS MQTT
// =================================================================================
const char* TOPIC_COMMAND = "projeto/atuadores/comando";
const char* TOPIC_STATUS  = "projeto/atuadores/status";
const char* TOPIC_DEBUG   = "projeto/esp8266/debug";

// =================================================================================
// 4. VARIÁVEIS GLOBAIS E OBJETOS
// =================================================================================
WiFiClient wifiClient;
PubSubClient mqttClient(wifiClient);

unsigned long lastReconnectAttempt = 0; 
unsigned long lastSensorReadTime = 0;
const long SENSOR_READ_INTERVAL = 50; // Debounce de 50ms
unsigned long lastWifiStatusTime = 0;

// =================================================================================
// 5. FUNÇÕES AUXILIARES
// =================================================================================

// Publica mensagens de depuração via MQTT (e Serial se habilitado)
void publishDebug(String message){
  if (mqttClient.connected()) {
    mqttClient.publish(TOPIC_DEBUG, message.c_str());
  }
  #ifdef USE_SERIAL_DEBUG
  Serial.println(message);
  #endif
}

// Controla um pino de relé de forma segura
void setRelay(int pin, bool active) {
  digitalWrite(pin, active ? RELAY_ACTIVE_LEVEL : RELAY_INACTIVE_LEVEL);
}

// Função para dar um pulso no relé
void pulseRelay(int pin) {
  digitalWrite(pin, RELAY_ACTIVE_LEVEL);
  delay(PULSE_DURATION);
  digitalWrite(pin, RELAY_INACTIVE_LEVEL);
}

// Publica o status de um sensor ou atuador
void publishStatus(const char* type, const char* id, const char* status){
  StaticJsonDocument<200> doc;
  doc["tipo"] = type;
  doc["id"] = id;
  doc["status"] = status;

  if (strcmp(type, "sensor_estado") == 0) {
    doc.remove("status");
    doc["estado"] = status;
  }

  char buffer[256];
  size_t n = serializeJson(doc, buffer);
  mqttClient.publish(TOPIC_STATUS, buffer, n);
}

// =================================================================================
// 6. LÓGICA MQTT (CALLBACK)
// =================================================================================
void callback(char* topic, byte* payload, unsigned int length) {
  // Converte payload para String segura
  String message = "";
  for (unsigned int i = 0; i < length; i++) message += (char)payload[i];
  
  publishDebug("Comando recebido: " + message);

  StaticJsonDocument<200> doc;
  DeserializationError error = deserializeJson(doc, message);
  
  if (error) { 
    publishDebug("Erro JSON: " + String(error.c_str())); 
    return; 
  }

  // Ignora comandos de simulação
  if (doc.containsKey("sim_sensor")) return;

  const char* id = doc["id"];
  const char* acao = doc["acao"];

  if (!id || !acao) { publishDebug("JSON incompleto."); return; }

  bool isAdvance = (strcmp(acao, "avancar") == 0);
  String statusStr = isAdvance ? "Avancado" : "Recuado";
  
  // Controle dos Atuadores
  if (strcmp(id, "1") == 0) {
    setRelay(RELAY_PIN_1, isAdvance);
  } 
  else if (strcmp(id, "2") == 0) {
    setRelay(RELAY_PIN_2, isAdvance);
  } 
  else if (strcmp(id, "3") == 0) {
    if (isAdvance) {
      pulseRelay(RELAY_PIN_3_ADV);
    } else {
      pulseRelay(RELAY_PIN_3_REC);
    }
  } 
  else if (strcmp(id, "4") == 0) {
    if (isAdvance) {
      pulseRelay(RELAY_PIN_4_ADV);
    } else {
      pulseRelay(RELAY_PIN_4_REC);
    }
  } 
  else {
    publishDebug("ID de atuador desconhecido: " + String(id));
    return;
  }

  publishDebug("Atuador " + String(id) + " -> " + String(acao));
  publishStatus("atuador_cmd", id, statusStr.c_str());
}

// =================================================================================
// 7. VERIFICAÇÃO DE SENSORES
// =================================================================================
void checkAllSensors() {
  for (int i = 0; i < NUM_SENSORS; i++) {
    if (sensors[i].pin == -1) continue;

    int currentState = digitalRead(sensors[i].pin);
    if (currentState != sensors[i].lastState) {
      const char* estadoStr = (currentState == LOW) ? "ativado" : "desativado";

      String debugMsg = "Sensor " + String(sensors[i].id) + ": " + String(estadoStr);
      publishDebug(debugMsg);

      publishStatus("sensor_estado", sensors[i].id, estadoStr);

      sensors[i].lastState = currentState;
    }
  }
}

// =================================================================================
// 8. GERENCIAMENTO DE CONEXÃO
// =================================================================================
void reconectarMQTT() {
  if (mqttClient.connected()) {
    return;
  }

  unsigned long now = millis();
  // Só tenta reconectar se já passaram 5 segundos
  if (now - lastReconnectAttempt > 5000) {
    lastReconnectAttempt = now; 
    publishDebug("Conectando ao MQTT...");
    
    if (mqttClient.connect(CLIENT_ID)) {
      publishDebug("MQTT Conectado!");
      mqttClient.subscribe(TOPIC_COMMAND);
    } else {
      publishDebug("Falha MQTT rc=" + String(mqttClient.state()));
    }
  }
}

// =================================================================================
// 9. SETUP
// =================================================================================
void setup() {
  #ifdef USE_SERIAL_DEBUG
  Serial.begin(115200);
  delay(1000); 
  Serial.println("\n--- INICIANDO SISTEMA ---");
  #endif

  // Inicializa pinos dos relés
  setRelay(RELAY_PIN_1, false); pinMode(RELAY_PIN_1, OUTPUT);
  setRelay(RELAY_PIN_2, false); pinMode(RELAY_PIN_2, OUTPUT);
  setRelay(RELAY_PIN_3_ADV, false); pinMode(RELAY_PIN_3_ADV, OUTPUT);
  setRelay(RELAY_PIN_3_REC, false); pinMode(RELAY_PIN_3_REC, OUTPUT);
  setRelay(RELAY_PIN_4_ADV, false); pinMode(RELAY_PIN_4_ADV, OUTPUT);
  setRelay(RELAY_PIN_4_REC, false); pinMode(RELAY_PIN_4_REC, OUTPUT);

// Inicializa Sensores
  for (int i = 0; i < NUM_SENSORS; i++) {
    if (sensors[i].pin != -1) {
      pinMode(sensors[i].pin, INPUT_PULLUP);
      sensors[i].lastState = digitalRead(sensors[i].pin);
    }
  }

  // Conexão Wi-Fi
  #ifdef USE_SERIAL_DEBUG
  Serial.print("Conectando ao WiFi: "); Serial.println(WIFI_SSID);
  #endif

  WiFi.begin(WIFI_SSID, WIFI_SENHA);
  int wifi_retries = 0;
  while (WiFi.status() != WL_CONNECTED && wifi_retries < 30) { 
    delay(500); 
    wifi_retries++; 
  }

  if (WiFi.status() == WL_CONNECTED){
      #ifdef USE_SERIAL_DEBUG
      Serial.print("WiFi Conectado! IP: "); Serial.println(WiFi.localIP());
      #endif
  }

  // Configuração MQTT
  mqttClient.setServer(MQTT_BROKER, MQTT_PORT); 
  mqttClient.setCallback(callback);
  
  // A primeira conexão será tentada dentro do loop()
  lastReconnectAttempt = millis() - 5000;
}

// =================================================================================
// 10. LOOP PRINCIPAL
// =================================================================================
void loop() {
  // Verifica conexão Wi-Fi
  if (WiFi.status() != WL_CONNECTED) {
      publishDebug("Conexão WiFi perdida. Tentando reconectar...");
      delay(1000);
      return;
  }

  // Gerencia conexão MQTT
  if (!mqttClient.connected()) {
    reconectarMQTT();
  }
  mqttClient.loop(); 

  // Leitura de sensores com Temporizador
  unsigned long now = millis();
  if (now - lastSensorReadTime > SENSOR_READ_INTERVAL) {
    lastSensorReadTime = now;
    checkAllSensors();
  }

  // Envia status do Wi-Fi a cada 10 segundos
  if (now - lastWifiStatusTime > 10000) {
    lastWifiStatusTime = now;

    long rssi = WiFi.RSSI();
    StaticJsonDocument<200> wifiDoc;
    wifiDoc["tipo"] = "sistema_wifi";
    wifiDoc["rssi"] = rssi;

    char buffer[256];
    serializeJson(wifiDoc, buffer);
    mqttClient.publish(TOPIC_STATUS, buffer);
  }
}