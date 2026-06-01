'use strict';
// srvSectionStateController.ts
import EventEmitter2 from "eventemitter2";
import { ISectionParams } from "./srvBaseSectionState";
import BaseSectionState from "./srvBaseSectionState";
import { BUS_STATE, MEAS_STATE, MeasKeys, NetStateKeys, NET_STATE, GLOBAL_MACHINE_STATE } from "./srvStates";

export interface IPortService {
    Init(): Promise<void>;
    Pub(topic: string, state: string): void;
}

export interface IConstructorParams {
    busCount: number,
    sections: BaseSectionState[];
    global: IGlobalStateParams;
    portServices: IPortService[];
}


export interface IEventStateUpdate {
    path: string[];
    state: string;
}

class StatesController extends EventEmitter2 {

    global: GlobalState;
    buses: BUS_STATE[];
    sections: Map<string, BaseSectionState>;
    private portServices: IPortService[];

    constructor(opts: IConstructorParams) {
        super();

        this.portServices = opts.portServices;

        for (const service of this.portServices) {
            service.Init();
        }

        this.global = new GlobalState(opts.global);
        this.buses = Array.from({ length: opts.busCount }, () => ({
            voltage: MEAS_STATE.OK,
            current: MEAS_STATE.OK,
            temp: MEAS_STATE.OK
        }));

        this.sections = new Map();

        for (const section of opts.sections) {
            this.addSection(section);
        }
    }
    onUpdate({ prop, state }: { prop: string, state: string }) {
        for (let service of this.portServices) {
            service.Pub(prop, state);
        }
    }

    addSection(section: BaseSectionState) {
        this.sections.set(section.name, section);

        section.on('update', (event: IEventStateUpdate) => {
            this.emit('update', {
                path: ['Sections', section.name, ...event.path],
                state: event.state
            } as IEventStateUpdate);
        });
    }

    getSection(name: string) {
        return this.sections.get(name);
    }

    setBusState(busIndex: number, key: keyof BUS_STATE, state: MeasKeys) {
        this.buses[busIndex][key] = state;
        this.emit('update', { path: ['Buses', busIndex, key], state } as IEventStateUpdate);
    }
    
    getBusState(busIndex: number, key: keyof BUS_STATE) {
        return this.buses[busIndex][key];
    }

    setEnvState(sensorName: string, state: MeasKeys) {

        const sensor = this.global.Env.get(sensorName);
        if (!sensor) return;
        
        sensor.state = state;

        this.emit('update', { path: ['Env', sensorName, 'State'], state } as IEventStateUpdate);
    }

    destroy() {
        for (let section of this.sections.values()) {
            section.removeAllListeners('update');
        }
    }
}

export default StatesController;

class NetHubState {

    private state: typeof NET_STATE[keyof typeof NET_STATE];

    constructor() {
        this.state = NET_STATE.ONLINE;
    }

    set State(state: NetStateKeys) { this.state = state; }

    get State() { return this.state; }
}
interface IEnvSensorParams {
    name: string;
    active: boolean;
    critical: boolean;
    [key: string]: any;
}

interface IEnvSensor extends IEnvSensorParams {
    state: MeasKeys;
}

interface IGlobalStateParams {
    hubLevels: string[];
    envSensors: IEnvSensorParams[];
}

class GlobalState extends EventEmitter2 {

    private machine: string;
    private inputVoltage: string;
    private env: Map<string, IEnvSensor>;
    private net: Map<string, NetHubState>;

    constructor(opts: IGlobalStateParams) {
        super();
        this.machine = GLOBAL_MACHINE_STATE.OK; 
        this.inputVoltage = MEAS_STATE.OK;
        this.env = opts.envSensors.reduce((pr, sensor) => {
            pr.set(sensor.name, { ...sensor, state: MEAS_STATE.OK });
            return pr;
        }, new Map());

        this.net = opts.hubLevels.reduce((pr, levelName) => {
            pr.set(levelName, new NetHubState());
            return pr;
        }, new Map());
    }

    set MachineState(state: string) {
        this.machine = state;
        this.emit('update', { path: ['Machine'], state } as IEventStateUpdate);
    }

    get MachineState() { return this.machine; }

    set InputVoltage(state: string) {
        this.inputVoltage = state;
        this.emit('update', { path: ['InputVoltage'], state } as IEventStateUpdate);
    }

    get InputVoltage() { return this.inputVoltage; }

    get Env() { return this.env; }

    get Net() { return this.net; }

    setNetState(level: string, state: NetStateKeys) {
        this.net.get(level)!.State = state;
        this.emit('update', { path: ['Net', level, 'State'], state } as IEventStateUpdate);
    }

    setEnvState(sensorName: string, state: MeasKeys) { 
        const sensor = this.env.get(sensorName);
        if (!sensor) return;
        
        sensor.state = state;

        this.emit('update', { path: ['Env', sensorName, 'State'], state } as IEventStateUpdate);
    }
}

export { GlobalState };