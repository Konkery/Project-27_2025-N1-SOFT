import * as mqtt from 'mqtt';
import EventEmitter2 from 'eventemitter2';
import { IPortService } from './srvSectionStateController';

export class MqttPortService extends EventEmitter2 implements IPortService {
    private client: mqtt.MqttClient | null = null;
    private brokerUrl: string;
    private clientId: string;
    private publishedTopics: Set<string> = new Set();
    private username?: string;
    private password?: string;
    private useMqttV5: boolean;
    private subscriptionIdentifier?: number;
    private queue: Map<string, string> = new Map();


    constructor(
        brokerUrl: string, 
        clientId: string,
        username?: string,
        password?: string,
        useMqttV5: boolean = true,
        subscriptionIdentifier?: number
    ) {
        super();
        this.brokerUrl = brokerUrl;
        this.clientId = clientId; // Обязательно фиксированный ID для clean: false
        this.username = username;
        this.password = password;
        this.useMqttV5 = useMqttV5;
        this.subscriptionIdentifier = subscriptionIdentifier;
    }

    async Init(): Promise<void> {
        return new Promise((resolve, reject) => {
            const options: mqtt.IClientOptions = {
                clientId: this.clientId,
                clean: true,//false,       // Сохранять сессию (подписки и недоставленные QoS 1/2)
                reconnectPeriod: 3000, // Автоматический реконнект каждые 3 сек
                connectTimeout: 10 * 1000,
            };

            if (this.username) options.username = this.username;
            if (this.password) options.password = this.password;

            if (this.useMqttV5) {
                options.protocolVersion = 5;
            }

            this.client = mqtt.connect(this.brokerUrl, options);

            this.client.on('connect', () => {
                console.log(`[MQTT] Connected to ${this.brokerUrl} (v${this.useMqttV5 ? '5' : '4'})`);
                for (const [topic, state] of this.queue.entries()) {
                    this.Pub(topic, state);
                }
                this.queue.clear();
                resolve();
            });

            this.client.on('error', (err) => {
                console.error('[MQTT] Connection error:', err);
                reject(err);
            });

            this.client.on('message', (topic, payload, packet) => {
                this.emit('message', { 
                    topic, 
                    payload: payload.toString(),
                    properties: packet?.properties
                });
            });
        });
    }

    Pub(topic: string, state: string, opts?: { retain: boolean }): void {
        if (this.client && this.client.connected) {
            this.publishedTopics.add(topic);
            const pubOptions: any = { 
                qos: 1, 
                retain: opts?.retain ?? true // Сохранять последнее сообщение на брокере,
            };
            if (this.useMqttV5) {
                pubOptions.properties = {
                    userProperties: {
                        timestamp: String(Date.now())
                    }
                };
            }
            this.client.publish(topic, state, pubOptions);
        } else {
            this.queue.set(topic, state);
        }
    }

    ClearRetained(): void {
        this.queue.clear();
        if (this.client && this.client.connected) {
            for (const topic of this.publishedTopics) {
                const pubOptions: any = { 
                    qos: 1, 
                    retain: true 
                };
                if (this.useMqttV5) {
                    pubOptions.properties = {
                        userProperties: {
                            timestamp: String(Date.now())
                        }
                    };
                }
                this.client.publish(topic, '', pubOptions);
            }
            this.publishedTopics.clear();
        }
    }

    Sub(topic: string): void {
        if (this.client) {
            const subOptions: any = { qos: 1 };
            if (this.useMqttV5) {
                subOptions.nl = true; // no local
                if (this.subscriptionIdentifier !== undefined) {
                    subOptions.subscriptionIdentifier = this.subscriptionIdentifier;
                }
            }
            this.client.subscribe(topic, subOptions, (err) => {
                if (err) console.error(`[MQTT] Failed to subscribe to ${topic}`, err);
            });
        }
    }

    ShutDown() {
        this.ClearRetained();
        if (this.client) {
            this.client.end();
        }
    }
}
