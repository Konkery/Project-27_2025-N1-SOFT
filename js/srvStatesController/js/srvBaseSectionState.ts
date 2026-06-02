'use strict';
// srvBaseSectionState.ts
import EventEmitter2 from 'eventemitter2';
import { IO_PORT_STATE, IO_STATE, CELL_STATE, MEAS_STATE, 
    IoPortStateKeys, MeasKeys, NetStateKeys, CellStateKeys,
    AVAILABLE  } from './srvStates';
import { IEventStateUpdate } from './srvSectionStateController';

interface TYPE_IO {
    name: string,
    state: typeof IO_STATE[keyof typeof IO_STATE];
    ports: typeof IO_PORT_STATE[keyof typeof IO_PORT_STATE][];
} 

export interface ISectionParams {
    name: string,
    id?: string,
    module: BaseSectionState;
    ioList: string[];
}
export class BaseSectionState < TCellState extends string = CellStateKeys> extends EventEmitter2 {

    public name: string;
    public isAvailble: typeof AVAILABLE[keyof typeof AVAILABLE];
    public rows: string[];
    public cols: string[];
    
    public cells: TCellState[];
    public io: Record<string, TYPE_IO>;

    constructor(config: ISectionParams) {
        super();
        this.name = config.name;
        this.isAvailble = AVAILABLE.YES;
        this.rows = [];
        this.cols = [];
        this.cells = [];

        this.io = config.ioList.reduce((pr, ioName) => {
            pr[ioName] = { 
                state: IO_STATE.OK, 
                name: ioName, 
                ports: [] 
            };
            return pr;
        }, {} as Record<string, TYPE_IO>);
    }

    isCellAvailable(index: number) {
        return this.cells[index] == CELL_STATE.OK 
            || this.cells[index] == CELL_STATE.OVERLOAD
    }
}

export default BaseSectionState;
/**
 * @deprecated
 */
class EnvSensorGroup {

    temp: MeasKeys;
    hum: MeasKeys;

    constructor() {

        this.temp = MEAS_STATE.OK;
        this.hum = MEAS_STATE.OK;
    }

    set Temp(state: MeasKeys) { 
        this.temp = state; 
    }

    get Temp() { return this.temp; }

    set Hum(state: MeasKeys) { 
        this.hum = state; 
    }

    get Hum() { 
        return this.hum; 
    }
}