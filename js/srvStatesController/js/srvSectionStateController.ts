'use strict';
// srvSectionStateController.ts
import EventEmitter2 from "eventemitter2";
import BaseSectionState from "./srvBaseSectionState";
import { 
    BUS_STATE, MEAS_STATE, MeasKeys, NetStateKeys, NET_STATE, GLOBAL_MACHINE_STATE,
    NET_SUMMARY_STATE, NET_DEVICE_STATE, NET_LINK_STATE, NET_IP_STATE, NET_ARP_STATE,
    NET_GATEWAY_STATE, NET_ROUTE_STATE, NET_QUALITY_STATE, NET_POE_STATE, 
    NET_CAMERA_SERVICE_STATE, NET_NTP_STATE, NET_DNS_STATE, NET_MQTT_STATE, 
    NET_DB_SERVICE_STATE, NET_NODERED_STATE, NET_GRAYLOG_STATE, NET_SECURITY_STATE, 
    NET_DEGRADED_STATE, AVAILABLE,
    CELL_STATE, TRANSACT_STATE, LIFT_STATE, SECTION_STATUS, LINE_STATE, IO_STATE, IO_PORT_STATE
} from "./srvStates";
import { createReactiveState } from "./srvReactiveProxy";
import  { ENUM_DESC_MAP } from "./srvStatesDesc";

export interface IPortService extends EventEmitter2 {
    Init(): Promise<void>;
    Pub(topic: string, state: string, opts?: object): void;
    Sub(topic: string): void;
    ClearRetained?(): void;
}

// Изменено на массив для более краткой сигнатуры типов и поддержки кортежей (tuples)
export interface IConstructorParams<TSection extends BaseSectionState<any>> {
    psuCount?: number;
    sections: TSection[];
    portServices: IPortService[];
}

export interface IEventStateUpdate {
    path: string[];
    topic?: string;
    state: any;
    init?: boolean;
}

export interface IEnvSensorParams {
    Name?: string;
    ChName?: string;
    TempChName?: string;
    HumChName?: string;
    [key: string]: any;
}

export interface ISectionParams {
    Name: string,
    Id?: string,
    IOList: string[];
    Size?: { rows: number, cols: number };
    [key: string]: any;
}

export interface IMainsConfig {
    VoltageChName?: string;
    VChName?: string;
    PChName?: string;
    WChName?: string;
    [key: string]: any;
}

export interface IPsuConfig {
    Index?: number;
    VinChName?: string;
    VoutChName?: string;
    IoutChName?: string;
    TempChName?: string;
    IsScChName?: string;
    IsOnChName?: string;
    MBID?: number;
    StdResource?: number;
    [key: string]: any;
}

export interface INetConfig {
    [key: string]: any;
}

export interface IGlobalParams {
    Name: string;
    StartDate?: string;
    Low?: {
        PSU?: IPsuConfig[];
        Env?: IEnvSensorParams[];
        [key: string]: any;
    };
    PSU?: IPsuConfig[];
    Env?: IEnvSensorParams[];
    Mains?: IMainsConfig;
    Net?: INetConfig;
    [key: string]: any;
}

export interface IConfig {
    Sections: ISectionParams[];
    Global: IGlobalParams;
}

// Deep network state interface
export interface INetSummaryState {
    Apparatus: string;
    LAN: string;
    CoreServices: string;
    Hubs: string;
    Cameras: string;
    Logging: string;
}

export interface INetDeviceState {
    Router: string;
    SW_PoE: string;
    Hub_Low: string;
    Hub_Mid: string;
    Hub_Hi: string;
    Cam1: string;
    Cam2: string;
}

export interface INetLinkState {
    Router_Hub_Low: string;
    Router_Hub_Mid: string;
    Router_Hub_Hi: string;
    Router_SW_PoE: string;
    SW_PoE_Cam1: string;
    SW_PoE_Cam2: string;
}

export interface INetIpState {
    Plan: string;
    ARP: string;
    Gateway: string;
}

export interface INetRouteState {
    Local: string;
    Internet: string;
    VPN: string;
}

export interface INetQualityState {
    LAN: string;
}

export interface INetPoeState {
    SW_PoE: string;
    Cam1: string;
    Cam2: string;
}

export interface INetCameraServiceState {
    Cam1_HTTP: string;
    Cam2_HTTP: string;
    Cam1_RTSP: string;
    Cam2_RTSP: string;
}

export interface INetNtpState {
    Server: string;
    Hub_Low: string;
    Hub_Mid: string;
    Hub_Hi: string;
    Cameras: string;
}

export interface INetDnsState {
    Server: string;
    LocalRecords: string;
    HubsResolver: string;
}

export interface INetMqttState {
    Server: string;
    Clients: string;
    Retained: string;
}

export interface INetDbServiceState {
    Server: string;
}

export interface INetNodeRedState {
    Hub_Low: string;
    Hub_Mid: string;
    Hub_Hi: string;
}

export interface INetGraylogState {
    Server: string;
    Delivery_Hubs: string;
    Delivery_Network: string;
}

export interface INetSecurityState {
    UnknownDevice: string;
    OpenPorts: string;
    Firewall: string;
    Credentials: string;
}

export interface INetModeState {
    Degraded: string;
}

export interface INetState {
    Summary: INetSummaryState;
    Device: INetDeviceState;
    Link: INetLinkState;
    IP: INetIpState;
    Route: INetRouteState;
    Quality: INetQualityState;
    PoE: INetPoeState;
    Camera: INetCameraServiceState;
    NTP: INetNtpState;
    DNS: INetDnsState;
    MQTT: INetMqttState;
    Redis: INetDbServiceState;
    MongoDB: INetDbServiceState;
    NodeRED: INetNodeRedState;
    Graylog: INetGraylogState;
    Security: INetSecurityState;
    Mode: INetModeState;
}

export interface IMainsState {
    Voltage: string;
    V: number;
    P: number;
    W: number;
    W_day: number;
    W_week: number;
    W_month: number;
}

export interface IPsuState {
    Vin: string;
    Vi: number;
    Vout: string;
    Vo: number;
    Iout: string;
    I: number;
    Temp: string;
    T: number;
    IS_SC: string;
    IS_ON: string;
    Uptime: { 
        available: string;
        hours: number 
        nominal: number;
        OVCcount: number;
        OVTcount: number;
    };
}

export interface IEnvState {
    T: number;
    H: number;
    Temp: string;
    Hum: string;
    // [key: string]: string;
}

export interface IRootState<TSection extends BaseSectionState<any>> {
    States: {
        Name: string;
        StartDate: string;
        Uptime: { hours: number };
        Mode: string;
        Mains: IMainsState;
        Env: IEnvState;
        Net: INetState;
        PSU: IPsuState[];
        Sections: TSection[]; 
    };

    Config: IConfig;
}

/**
 * Карта связывания свойств состояния с их оригинальными enum-объектами
 */
const PROPERTY_TO_ENUM_MAP: Record<string, object> = {
    // Global & Machine
    'Mode': GLOBAL_MACHINE_STATE,
    'Status': SECTION_STATUS,
    'IsAvailable': AVAILABLE,
    'available': AVAILABLE,
    'IS_SC': AVAILABLE,
    'IS_ON': AVAILABLE,
    'Resourse_available': AVAILABLE,

    // Lines & Cells
    'Rows': LINE_STATE,
    'Cols': LINE_STATE,
    'Cells': CELL_STATE,
    'CellsTransact': TRANSACT_STATE,
    'Lift': LIFT_STATE,
    'DeliveryBox': CELL_STATE,

    // Measurements
    'Voltage': MEAS_STATE,
    'Vin': MEAS_STATE,
    'Vout': MEAS_STATE,
    'Iout': MEAS_STATE,
    'Temp': MEAS_STATE,
    'Hum': MEAS_STATE,

    // IO
    'state': IO_STATE,
    'ports': IO_PORT_STATE,

    // Network Summary & Devices
    'Apparatus': NET_SUMMARY_STATE,
    'LAN': NET_SUMMARY_STATE,
    'CoreServices': NET_SUMMARY_STATE,
    'Hubs': NET_SUMMARY_STATE,
    'Cameras': NET_SUMMARY_STATE,
    'Logging': NET_SUMMARY_STATE,

    'Router': NET_DEVICE_STATE,
    'SW_PoE': NET_DEVICE_STATE,
    'Hub_Low': NET_DEVICE_STATE,
    'Hub_Mid': NET_DEVICE_STATE,
    'Hub_Hi': NET_DEVICE_STATE,
    'Cam1': NET_DEVICE_STATE,
    'Cam2': NET_DEVICE_STATE,

    // Links & Network Sub-services
    'Router_Hub_Low': NET_LINK_STATE,
    'Router_Hub_Mid': NET_LINK_STATE,
    'Router_Hub_Hi': NET_LINK_STATE,
    'Router_SW_PoE': NET_LINK_STATE,
    'SW_PoE_Cam1': NET_LINK_STATE,
    'SW_PoE_Cam2': NET_LINK_STATE,

    'Plan': NET_IP_STATE,
    'ARP': NET_ARP_STATE,
    'Gateway': NET_GATEWAY_STATE,

    'Local': NET_ROUTE_STATE,
    'Internet': NET_ROUTE_STATE,
    'VPN': NET_ROUTE_STATE,

    'Cam1_HTTP': NET_CAMERA_SERVICE_STATE,
    'Cam2_HTTP': NET_CAMERA_SERVICE_STATE,
    'Cam1_RTSP': NET_CAMERA_SERVICE_STATE,
    'Cam2_RTSP': NET_CAMERA_SERVICE_STATE,

    'Server': NET_NTP_STATE,
    'LocalRecords': NET_DNS_STATE,
    'HubsResolver': NET_DNS_STATE,

    'Clients': NET_MQTT_STATE,
    'Retained': NET_MQTT_STATE,

    'Delivery_Hubs': NET_GRAYLOG_STATE,
    'Delivery_Network': NET_GRAYLOG_STATE,

    'UnknownDevice': NET_SECURITY_STATE,
    'OpenPorts': NET_SECURITY_STATE,
    'Firewall': NET_SECURITY_STATE,
    'Credentials': NET_SECURITY_STATE,

    'Degraded': NET_DEGRADED_STATE
};

class StatesController<TSection extends BaseSectionState<any> = BaseSectionState<any>> extends EventEmitter2 {

    // Единое дерево состояния, обернутое в реактивный прокси
    public Machine: IRootState<TSection>;
    private portServices: IPortService[];
    // Флаг для предотвращения бесконечных циклов (эхо) при обновлении извне
    private _isApplyingExternal: boolean = false;
    readonly rootTopic: string = 'Machine';

    constructor(opts: IConstructorParams<TSection>, config: IConfig) {
        super();
        this.portServices = opts.portServices ?? [];

        for (const service of this.portServices) {
            service.Init().catch(err => console.error('[StatesController] PortService Init Error:', err));
            // Подписываемся на все вложенные топики корневого топика (MQTT wildcard '#')
            service.Sub(`${this.rootTopic}/#`);
            // Слушаем события 'message' и применяем их к нашему реактивному состоянию
            service.on('message', ({ topic, payload }) => {
                this.ApplyExternalState(topic, payload);
            });
        }

        // Конфигурируемые словари датчиков
        const Env: IEnvState = {
            T: -1,
            H: -1,
            Temp: MEAS_STATE.OK,
            Hum: MEAS_STATE.OK,
        };
        const envSensors = config?.Global?.Low?.Env || config?.Global?.Env || [];
        // for (const sensor of envSensors) {
        //     const name = sensor.Name || sensor.TempChName || sensor.HumChName;
        //     if (name) {
        //         Env[name] = MEAS_STATE.OK;
        //     }
        // }

        const Net: INetState = {
            Summary: {
                Apparatus: NET_SUMMARY_STATE.UNKNOWN,
                LAN: NET_SUMMARY_STATE.UNKNOWN,
                CoreServices: NET_SUMMARY_STATE.UNKNOWN,
                Hubs: NET_SUMMARY_STATE.UNKNOWN,
                Cameras: NET_SUMMARY_STATE.UNKNOWN,
                Logging: NET_SUMMARY_STATE.UNKNOWN
            },
            Device: {
                Router: NET_DEVICE_STATE.UNKNOWN,
                SW_PoE: NET_DEVICE_STATE.UNKNOWN,
                Hub_Low: NET_DEVICE_STATE.UNKNOWN,
                Hub_Mid: NET_DEVICE_STATE.UNKNOWN,
                Hub_Hi: NET_DEVICE_STATE.UNKNOWN,
                Cam1: NET_DEVICE_STATE.UNKNOWN,
                Cam2: NET_DEVICE_STATE.UNKNOWN
            },
            Link: {
                Router_Hub_Low: NET_LINK_STATE.UNKNOWN,
                Router_Hub_Mid: NET_LINK_STATE.UNKNOWN,
                Router_Hub_Hi: NET_LINK_STATE.UNKNOWN,
                Router_SW_PoE: NET_LINK_STATE.UNKNOWN,
                SW_PoE_Cam1: NET_LINK_STATE.UNKNOWN,
                SW_PoE_Cam2: NET_LINK_STATE.UNKNOWN
            },
            IP: {
                Plan: NET_IP_STATE.UNKNOWN,
                ARP: NET_ARP_STATE.UNKNOWN,
                Gateway: NET_GATEWAY_STATE.UNKNOWN
            },
            Route: {
                Local: NET_ROUTE_STATE.UNKNOWN,
                Internet: NET_ROUTE_STATE.UNKNOWN,
                VPN: NET_ROUTE_STATE.UNKNOWN
            },
            Quality: {
                LAN: NET_QUALITY_STATE.UNKNOWN
            },
            PoE: {
                SW_PoE: NET_POE_STATE.UNKNOWN,
                Cam1: NET_POE_STATE.UNKNOWN,
                Cam2: NET_POE_STATE.UNKNOWN
            },
            Camera: {
                Cam1_HTTP: NET_CAMERA_SERVICE_STATE.UNKNOWN,
                Cam2_HTTP: NET_CAMERA_SERVICE_STATE.UNKNOWN,
                Cam1_RTSP: NET_CAMERA_SERVICE_STATE.UNKNOWN,
                Cam2_RTSP: NET_CAMERA_SERVICE_STATE.UNKNOWN
            },
            NTP: {
                Server: NET_NTP_STATE.UNKNOWN,
                Hub_Low: NET_NTP_STATE.UNKNOWN,
                Hub_Mid: NET_NTP_STATE.UNKNOWN,
                Hub_Hi: NET_NTP_STATE.UNKNOWN,
                Cameras: NET_NTP_STATE.UNKNOWN
            },
            DNS: {
                Server: NET_DNS_STATE.UNKNOWN,
                LocalRecords: NET_DNS_STATE.UNKNOWN,
                HubsResolver: NET_DNS_STATE.UNKNOWN
            },
            MQTT: {
                Server: NET_MQTT_STATE.UNKNOWN,
                Clients: NET_MQTT_STATE.UNKNOWN,
                Retained: NET_MQTT_STATE.UNKNOWN
            },
            Redis: {
                Server: NET_DB_SERVICE_STATE.UNKNOWN
            },
            MongoDB: {
                Server: NET_DB_SERVICE_STATE.UNKNOWN
            },
            NodeRED: {
                Hub_Low: NET_NODERED_STATE.UNKNOWN,
                Hub_Mid: NET_NODERED_STATE.UNKNOWN,
                Hub_Hi: NET_NODERED_STATE.UNKNOWN
            },
            Graylog: {
                Server: NET_GRAYLOG_STATE.UNKNOWN,
                Delivery_Hubs: NET_GRAYLOG_STATE.UNKNOWN,
                Delivery_Network: NET_GRAYLOG_STATE.UNKNOWN
            },
            Security: {
                UnknownDevice: NET_SECURITY_STATE.UNKNOWN,
                OpenPorts: NET_SECURITY_STATE.UNKNOWN,
                Firewall: NET_SECURITY_STATE.UNKNOWN,
                Credentials: NET_SECURITY_STATE.UNKNOWN
            },
            Mode: {
                Degraded: NET_DEGRADED_STATE.UNKNOWN
            }
        };

        // Формирование начального дерева состояний
        const rawState: IRootState<TSection> = {
            States: {
                Name: config.Global.Name || 'Unknown',
                StartDate: config.Global.StartDate || '',
                Uptime: {
                    hours: 0,
                    // nominal: 0,
                    // available: AVAILABLE.YES,
                    // OVCcount: 0,
                    // OVTcount: 0,
                },
                Mode: GLOBAL_MACHINE_STATE.OK,
                Mains: {
                    Voltage: MEAS_STATE.OK,
                    V: 220,
                    P: 0,
                    W: 0,
                    W_day: 0,
                    W_week: 0,
                    W_month: 0,
                },
                Env,
                Net,
                PSU: (config.Global.Low?.PSU || config.Global.PSU || []).map((p) => ({
                    Vin: MEAS_STATE.OK,
                    Vi: 0,
                    Vout: MEAS_STATE.OK,
                    Vo: 0,
                    Iout: MEAS_STATE.OK,
                    I: 0,
                    Temp: MEAS_STATE.OK,
                    IS_SC: AVAILABLE.NO,
                    IS_ON: AVAILABLE.YES,
                    T: 0,
                    H: 0,
                    Uptime: {
                        available: AVAILABLE.NO,
                        hours: 0,
                        OVCcount: 0,
                        OVTcount: 0,
                        nominal: 0
                    }
                })),
                Sections: (opts.sections ?? []),
            },
            
            Config: config
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
        /*setTimeout(() => {
            try {
                this.PubDescCollection();
            } catch (e) {
                console.error(`Не удалось опуликовать список описаний топиков: ${e}`);
            }
        }, 0);*/
    }

    /**
     * Применяет изменения, полученные от внешних брокеров (MQTT/Redis).
     * Безопасно парсит путь и обновляет реактивное дерево.
     * 
     * @param topic - Путь в формате 'path/to/prop' (возможно с rootTopic)
     * @param payload - Новое значение
     */
    public ApplyExternalState(topic: string, payload: any) {
        // Убираем корневой префикс, чтобы получить путь внутри объекта state
        const relativePath = topic.replace(`${this.rootTopic}`, '');
        const keys = relativePath.startsWith('/') ? relativePath.slice(1).split('/') : relativePath.split('/');

        let current: any = this.Machine;

        // Итеративно спускаемся по дереву объекта
        for (let i = 0; i < keys.length - 1; i++) {
            const key = keys[i];
            if (current[key] === undefined) {
                // console.warn(`[State] Unknown path received: ${topic}`);
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
        if (current && (current.hasOwnProperty(lastKey) || current[lastKey] !== undefined)) {
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
            // Пропускаем служебные поля
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
        // debugger;
        const fullTopic = `${this.rootTopic}/${prop}`;
        // console.log(fullTopic);
        for (const service of this.portServices) {
            service.Pub(fullTopic, String(state));
        }
    }

    Destroy() {
        this.removeAllListeners('update');
    }

    Reset() {
        for (let section of Object.values(this.Machine.States.Sections)) {
            section.Reset();
        }
        for (let port of this.portServices) {
            port.ClearRetained?.();
        }
    }



    /**
     * Обходит дерево объекта состояния с помощью алгоритма DFS (поиск в глубину)
     * и сопоставляет свойства с их словарем описаний (STATES_DESC) через ENUM_DESC_MAP.
     * 
     * @param targetObj - Объект для обхода (по умолчанию единое дерево состояния Machine)
     * @returns Список вида [ { prop_path : STATES_DESC }, ... ]
     */
    public GetDescCollection(targetObj: any = this.Machine): Array<Record<string, Record<string, string>>> {
        const collection: Array<Record<string, Record<string, string>>> = [];

        const dfs = (obj: any, currentPath: string[]) => {
            if (obj === null || obj === undefined) return;

            // Если узел не является объектом, это лист (скалярное значение)
            if (typeof obj !== 'object') {
                const desc = this.resolveDescForPath(currentPath);
                if (desc) {
                    const propPath = currentPath.join('/');
                    collection.push({ [propPath]: desc });
                }
                return;
            }

            // Итерируемся по ключам массива или объекта
            const keys = Array.isArray(obj) 
                ? Array.from({ length: obj.length }, (_, i) => String(i)) 
                : Object.keys(obj);

            for (const key of keys) {
                // Пропускаем приватные/служебные поля
                if (key.startsWith('_')) continue;

                const value = obj[key];
                // Пропускаем функции/методы
                if (typeof value === 'function') continue;

                dfs(value, [...currentPath, key]);
            }
        };

        dfs(targetObj, []);
        return collection;
    }

    PubDescCollection() {
        const descCollection = this.GetDescCollection();
        const assignedCollection = descCollection.reduce((pr, curr) => Object.assign(pr, curr), {});
        for (let [topic, statesDescEnum] of Object.entries(assignedCollection)) {
            for (let [state, stateDesc] of Object.entries(statesDescEnum))
            this.portServices[0].Pub(`Metadata/${topic}__${state}`, stateDesc, { retain: false });
            // for (let [key, flagDesc] of Object.entries(descCollection)) {}
        }
    }

    /**
     * Извлекает словарь описаний по свойству через связку PROPERTY_TO_ENUM_MAP -> ENUM_DESC_MAP
     */
    private resolveDescForPath(path: string[]): Record<string, string> | null {
        if (path.length === 0) return null;

        const lastKey = path[path.length - 1];
        const isNumericIndex = !isNaN(Number(lastKey));
        const propName = isNumericIndex && path.length > 1 ? path[path.length - 2] : lastKey;

        // 1. Извлекаем оригинальный enum-объект по имени свойства
        const enumObj = PROPERTY_TO_ENUM_MAP[propName];
        if (!enumObj) return null;

        // 2. Получаем соответствующий словарь описаний напрямую из ENUM_DESC_MAP
        return ENUM_DESC_MAP.get(enumObj) || null;
    }
}

export default StatesController;
