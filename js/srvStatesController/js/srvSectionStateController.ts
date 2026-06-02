'use strict';
// srvSectionStateController.ts
import EventEmitter2 from "eventemitter2";
import BaseSectionState from "./srvBaseSectionState";
import { BUS_STATE, MEAS_STATE, MeasKeys, NetStateKeys, NET_STATE, GLOBAL_MACHINE_STATE } from "./srvStates";
import { createReactiveState } from "./srvReactiveProxy";

export interface IPortService {
    Init(): Promise<void>;
    Pub(topic: string, state: string): void;
}

// Изменено на Record для строгого вывода типов секций (Dependency Injection) и совместимости с Proxy
export interface IConstructorParams<TSections extends Record<string, BaseSectionState>> {
    busCount: number;
    sections: TSections;
    global: IGlobalStateParams;
    portServices: IPortService[];
}

export interface IEventStateUpdate {
    path: string[];
    topic?: string;
    state: string;
    init?: boolean; // Phase 3.5: Флаг инициализации
}

export class NetHubState {
    public state: typeof NET_STATE[keyof typeof NET_STATE];
    constructor() {
        this.state = NET_STATE.ONLINE;
    }
}

export interface IEnvSensorParams {
    name: string;
    active: boolean;
    critical: boolean;
    [key: string]: any;
}

export interface IEnvSensor extends IEnvSensorParams {
    state: MeasKeys;
}

export interface IGlobalStateParams {
    hubLevels: string[];
    envSensors: IEnvSensorParams[];
}

export interface IRootState<TSections extends Record<string, BaseSectionState>> {
    global: {
        machine: string;
        inputVoltage: string;
        env: Record<string, IEnvSensor>;
        net: Record<string, NetHubState>;
    };
    buses: BUS_STATE[];
    sections: TSections;
}

class StatesController<TSections extends Record<string, BaseSectionState> = Record<string, BaseSectionState>> extends EventEmitter2 {

    // Единое дерево состояния, обернутое в реактивный прокси
    public state: IRootState<TSections>;
    private portServices: IPortService[];

    constructor(opts: IConstructorParams<TSections>) {
        super();
        this.portServices = opts.portServices;

        for (const service of this.portServices) {
            service.Init();
        }

        // Конфигурируемые словари датчиков и сетевых хабов
        const env = opts.global.envSensors.reduce((pr, sensor) => {
            pr[sensor.name] = { ...sensor, state: MEAS_STATE.OK };
            return pr;
        }, {} as Record<string, IEnvSensor>);

        const net = opts.global.hubLevels.reduce((pr, levelName) => {
            pr[levelName] = new NetHubState();
            return pr;
        }, {} as Record<string, NetHubState>);

        // Формирование начального сырого дерева состояний
        const rawState: IRootState<TSections> = {
            global: {
                machine: GLOBAL_MACHINE_STATE.OK,
                inputVoltage: MEAS_STATE.OK,
                env,
                net
            },
            buses: Array.from({ length: opts.busCount }, () => ({
                voltage: MEAS_STATE.OK,
                current: MEAS_STATE.OK,
                temp: MEAS_STATE.OK
            })),
            sections: opts.sections
        };

        // Подписываемся на события обновления от Proxy
        this.on('update', (event: IEventStateUpdate) => {
            const topic = event.topic || event.path.join('/');
            this.onUpdate({ prop: topic, state: event.state });
        });

        // Пропускаем весь корневой объект через фабрику
        this.state = createReactiveState(rawState, this);

        // Phase 3.5: Рекурсивно генерируем события update с init = true
        this.emitInitialTree(rawState);
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
                this.emit('update', {
                    path: currentPath,
                    topic: currentPath.join('/'),
                    state: value,
                    init: true
                } as IEventStateUpdate);
            }
        }
    }

    private onUpdate({ prop, state }: { prop: string, state: string }) {
        for (const service of this.portServices) {
            service.Pub(prop, String(state));
        }
    }

    destroy() {
        this.removeAllListeners('update');
    }
}

export default StatesController;
