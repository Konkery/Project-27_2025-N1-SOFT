import * as mqtt from 'mqtt';
import EventEmitter2 from 'eventemitter2';
import { IPortService } from './srvSectionStateController';

export class MqttPortService extends EventEmitter2 implements IPortService {
    private client: mqtt.MqttClient | null = null;
    private brokerUrl: string;
    private clientId: string;
    private publishedTopics: Set<string> = new Set();

    constructor(brokerUrl: string, clientId: string) {
        super();
        this.brokerUrl = brokerUrl;
        this.clientId = clientId; // Обязательно фиксированный ID для clean: false
    }

    async Init(): Promise<void> {
        return new Promise((resolve, reject) => {
            this.client = mqtt.connect(this.brokerUrl, {
                clientId: this.clientId,
                clean: true,//false,       // Сохранять сессию (подписки и недоставленные QoS 1/2)
                reconnectPeriod: 3000, // Автоматический реконнект каждые 3 сек
                connectTimeout: 10 * 1000,
            });

            this.client.on('connect', () => {
                console.log(`[MQTT] Connected to ${this.brokerUrl}`);
                resolve();
            });

            this.client.on('error', (err) => {
                console.error('[MQTT] Connection error:', err);
                reject(err);
            });

            this.client.on('message', (topic, payload) => {
                this.emit('message', { topic, payload: payload.toString() });
            });
        });
    }

    Pub(topic: string, state: string): void {
        if (this.client && this.client.connected) {
            this.publishedTopics.add(topic);
            this.client.publish(topic, state, { 
                qos: 1, 
                retain: true // Сохранять последнее сообщение на брокере,
            });
        }
    }

    ClearRetained(): void {
        if (this.client && this.client.connected) {
            for (const topic of this.publishedTopics) {
                this.client.publish(topic, '', { 
                    qos: 1, 
                    retain: true 
                });
            }
            this.publishedTopics.clear();
        }
    }

    Sub(topic: string): void {
        if (this.client) {
            this.client.subscribe(topic, { qos: 1 }, (err) => {
                if (err) console.error(`[MQTT] Failed to subscribe to ${topic}`, err);
            });
        }
    }
}
