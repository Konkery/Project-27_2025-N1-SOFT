'use strict';
// srvSectionStateController.ts
import EventEmitter2 from "eventemitter2";
import { ISectionParams } from "./srvBaseSectionState";
import BaseSectionState, { GlobalState } from "./srvBaseSectionState";
import { BUS_STATE, MEAS_STATE, MeasKeys } from "./srvStates";

export interface IPortService {
    Init(): Promise<void>;
    Pub(topic: string, state: string): void;
}

export interface IConstructorParams {
    busCount: number,
    sections: ISectionParams[];
    global: GlobalState;
    portServices: IPortService[];
}


export interface IEventStateUpdate {
    path: string[];
    state: string;
    // prevValue: any;
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

        this.global = opts.global;
        this.buses = Array.from({ length: opts.busCount }, () => ({
            voltage: MEAS_STATE.OK,
            current: MEAS_STATE.OK,
            temp: MEAS_STATE.OK
        }));

        this.sections = new Map();

        for (const section of opts.sections) {
            this.addSection(section.name, section.module);
        }
    }
    onUpdate({ prop, state }: { prop: string, state: string }) {
        for (let service of this.portServices) {
            service.Pub(prop, state);
        }
    }

    addSection(name: string, section: BaseSectionState) {
        this.sections.set(name, section);

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