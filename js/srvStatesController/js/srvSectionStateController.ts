'use strict';
// srvSectionStateController.ts
import EventEmitter2 from "eventemitter2";
import BaseSectionState from "./srvBaseSectionState";
import { BUS_STATE, MEAS_STATE, MeasKeys, NetStateKeys, NET_STATE, GLOBAL_MACHINE_STATE } from "./srvStates";
import { createReactiveState } from "./srvReactiveProxy";
export interface IPortService extends EventEmitter2 {
    Init(): Promise<void>;
    Pub(topic: string, state: string): void;
    Sub(topic: string): void;
}

// Изменено на Record для строгого вывода типов секций (Dependency Injection) и совместимости с Proxy
export interface IConstructorParams<TSections extends Record<string, BaseSectionState<string>>> {
    busCount: number;
    sections: TSections;
    global: IGlobalStateParams;
    portServices: IPortService[];
}

export interface IEventStateUpdate {
    path: string[];
    topic?: string;
    state: any;
    init?: boolean;
}

export interface INetHubState {
    Hub_Low: NetStateKeys;
    Hub_Mid: NetStateKeys;
    Hub_High: NetStateKeys;
}

export interface IEnvSensorParams {
    Name: string;
    ChName: string;
}

export interface IGlobalStateParams {
    hubLevels: string[];
    envSensors: IEnvSensorParams[];
}

export interface ISectionParams {
    Name: string,
    Id?: string,
    IOList: string[];
}

interface IBusParams {
    Number: number;
    VoutChName: string;
    IoutChName: string;
}

interface IGlobalParams {
    Buses: IBusParams[];
    Env: IEnvSensorParams[];
    Net: unknown;
}

interface IConfig {
    Sections: ISectionParams[];
    Global: IGlobalParams;
}

export interface IRootState<TSections extends Record<string, BaseSectionState<string>>> {
    States: {
        Global: {
            Mode: string;
            Input_Voltage: string;
            Env: Record<string, string>;
            Net: INetHubState;
            Buses: BUS_STATE[];
        };
        Sections: TSections; 
    };

    Config: IConfig;
}

const Config: IConfig = {
    // MACHINE_NAME                // Название аппарата
    Global: {
        Buses: (process.env.BUSES_NUMBER ?? []) as IBusParams[],
        Env:   (process.env.ENV_SENSORS ?? []) as IEnvSensorParams[],
        Net: {
            WAN_PORT_NAME: process.env.WAN_PORT_NAME ?? '',        // Имя "внешнего" порта на роутере
            WAN_MODE: process.env.WAN_MODE ?? '',                  // Режим работы "внешнего" порта (STATIC, DHCP)
            WAN_IP:   process.env.WAN_IP   ?? '',                  // IP адрес на "внешнем" порту роутера
            WAN_MASK: process.env.WAN_MASK ?? '',                  // Сетевая маска
            WAN_GW:   process.env.WAN_GW   ?? '',                  // IP адрес шлюза
            WAN_DNS:  process.env.WAN_DNS  ?? '',                  // IP адрес DNS сервера

            HUB_LOW_IP: process.env.HUB_LOW_IP ?? '',              // IP адрес хаба нижнего уровня
            HUB_MID_IP: process.env.HUB_MID_IP ?? '',              // IP адрес хаба среднего уровня
            HUB_HI_IP:  process.env.HUB_HI_IP  ?? '',              // IP адрес хаба верхнего уровня
            SRV_IP:     process.env.SRV_IP     ?? '',              // IP адрес сервер администрирования

            MQTT_IP:      process.env.MQTT_IP      ?? '',          // IP сервиса MQTT
            MQTT_PORT:    process.env.MQTT_PORT    ?? '',          // Порт сервиса MQTT
            MQTT_WS_PORT: process.env.MQTT_WS_PORT ?? '',          // Порт сервиса MQTT (протокол WebSockets)
            MQTT_CLIENT_URL: process.env.MQTT_CLIENT_URL ?? '',    // Адрес браузерного клиента MQTT

            REDIS_IP:   process.env.REDIS_IP   ?? '',              // IP сервиса Redis
            REDIS_PORT: process.env.REDIS_PORT ?? '',              // Порт сервиса Redis

            MONGODB_IP:   process.env.MONGODB_IP   ?? '',          // IP сервиса MongoDB
            MONGODB_PORT: process.env.MONGODB_PORT ?? '',          // Порт сервиса MongoDB

            GRAYLOG_IP: process.env.GRAYLOG_IP ?? '',              // IP сервера GrayLog
            GRAYLOG_INPUT1_PORT: process.env.GRAYLOG_INPUT1_PORT ?? '',         // Порт инпута 01 GrayLog
            GRAYLOG_INPUT2_PORT: process.env.GRAYLOG_INPUT2_PORT ?? '',         // Порт инпута 02 GrayLog
            GRAYLOG_INPUT3_PORT: process.env.GRAYLOG_INPUT3_PORT ?? '',         // Порт инпута 03 GrayLog
            GRAYLOG_URL: process.env.GRAYLOG_URL ?? '',                         // Адрес web-интерфейса сервера GrayLog
        } as any,
    }, 
    Sections: (process.env.SECTIONS ? JSON.parse(process.env.SECTIONS) : []) as ISectionParams[],
}

class StatesController<TSections extends Record<string, BaseSectionState<string>> = Record<string, BaseSectionState<string>>> extends EventEmitter2 {

    // Единое дерево состояния, обернутое в реактивный прокси
    public Machine: IRootState<TSections>;
    private portServices: IPortService[];
    // Флаг для предотвращения бесконечных циклов (эхо) при обновлении извне
    private _isApplyingExternal: boolean = false;
    readonly rootTopic: string = 'Machine/';

    constructor(opts: IConstructorParams<TSections>) {
        super();
        this.portServices = opts.portServices;

        for (const service of this.portServices) {
            service.Init().catch(err => console.error('[StatesController] PortService Init Error:', err));
            // Подписываемся на все вложенные топики корневого топика (MQTT wildcard '#')
            service.Sub(`${this.rootTopic}/#`);
            // Слушаем события 'message' и применяем их к нашему реактивному состоянию
            service.on('message', ({ topic, payload }) => {
                this.applyExternalState(topic, payload);
            });
        }

        // Конфигурируемые словари датчиков и сетевых хабов
        const Env = opts.global.envSensors.reduce((pr, sensor) => {
            pr[sensor.Name] = MEAS_STATE.OK;
            return pr;
        }, {} as Record<string, string>);

        

        const Net: INetHubState = {
            Hub_Low: NET_STATE.ONLINE,
            Hub_Mid: NET_STATE.ONLINE,
            Hub_High: NET_STATE.ONLINE,
        }

        // Формирование начального дерева состояний
        const rawState: IRootState<TSections> = {
            States: {
                Global: {
                    Mode: GLOBAL_MACHINE_STATE.OK,
                    Input_Voltage: MEAS_STATE.OK,
                    Env,
                    Net,
                    Buses: Array.from({ length: opts.busCount }, () => ({
                        Voltage: MEAS_STATE.OK,
                        Current: MEAS_STATE.OK,
                        Temp: MEAS_STATE.OK
                    })),
                },
                Sections: opts.sections,
            },
            
            Config
        };

        // Подписываемся на события обновления от Proxy
        this.on('update', (event: IEventStateUpdate) => {
            // Если изменение пришло извне (applyExternalState), не отправляем его обратно в брокеры
            if (this._isApplyingExternal) return;

            const topic = event.topic || event.path.join('/');
            this.onUpdate({ prop: topic, state: event.state });
        });

        // Пропускаем весь корневой объект через фабрику
        this.Machine = createReactiveState(rawState, this);

        // Рекурсивно генерируем события update с init = true
        this.emitInitialTree(rawState);
    }

    /**
     * Применяет изменения, полученные от внешних брокеров (MQTT/Redis).
     * Безопасно парсит путь и обновляет реактивное дерево.
     * 
     * @param topic - Путь в формате 'path/to/prop' (возможно с rootTopic)
     * @param value - Новое значение
     */
    public applyExternalState(topic: string, payload: any) {
        // Убираем корневой префикс, чтобы получить путь внутри объекта state
        // Пример: "Machine/sections/spiral/liftState" -> "sections/spiral/liftState"
        const relativePath = topic.replace(`${this.rootTopic}/`, '');
        const keys = relativePath.split('/');

        let current: any = this.Machine;

        // Итеративно спускаемся по дереву объекта
        for (let i = 0; i < keys.length - 1; i++) {
            const key = keys[i];
            if (current[key] === undefined) {
                console.warn(`[State] Unknown path received: ${topic}`);
                return;
            }
            current = current[key];
        }

        const lastKey = keys[keys.length - 1];

        let parsedValue: any = payload;
        if (!isNaN(Number(payload))) parsedValue = Number(payload);
        if (payload === 'true') parsedValue = true;
        if (payload === 'false') parsedValue = false;

        // Проверяем существование поля перед записью, чтобы избежать засорения стейта
        if (current.hasOwnProperty(lastKey) || current[lastKey] !== undefined) {
            // Запись в Proxy. Если значение совпадает с текущим, Proxy проигнорирует его.
            current[lastKey] = parsedValue;
        }
    }

    /**
     * Рекурсивно обходит дерево состояния и вызывает событие 'update' 
     * с флагом init: true для всех листовых свойств.
     */
    private emitInitialTree(obj: any, basePath: string[] = []) {
        if (obj === null || typeof obj !== 'object') {
            return;
        }

        for (const key of Object.keys(obj)) {
            // Пропускаем служебные поля (если такие есть в экземплярах классов)
            if (key.startsWith('_')) continue;

            const value = obj[key];
            // Пропускаем методы
            if (typeof value === 'function') continue;

            const currentPath = [...basePath, key];

            if (typeof value === 'object' && value !== null) {
                this.emitInitialTree(value, currentPath);
            } else {
                // Генерируем событие для скалярного значения (листа)
                this.emit('update', {
                    path: currentPath,
                    topic: currentPath.join('/'),
                    state: value,
                    init: true
                } as IEventStateUpdate);
            }
        }
    }

    private onUpdate({ prop, state }: { prop: string, state: any }) {
        const fullTopic = `${this.rootTopic}/${prop}`;
        for (const service of this.portServices) {
            service.Pub(fullTopic, String(state));
        }
    }

    destroy() {
        this.removeAllListeners('update');
    }
}

export default StatesController;
