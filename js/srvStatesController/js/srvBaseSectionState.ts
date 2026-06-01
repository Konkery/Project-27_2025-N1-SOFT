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

    name: string;
    isAvailble: typeof AVAILABLE[keyof typeof AVAILABLE];;
    rows: string[];
    cols: string[];
    
    cells: TCellState[];//CellStateKeys[];
    io: Map<string, TYPE_IO>;

    constructor(config: ISectionParams) {
        super();
        this.name = config.name;
        this.isAvailble = AVAILABLE.YES;
        this.rows = [];
        this.cols = [];
        this.cells = [];

        this.io = config.ioList.reduce((pr, ioName) => {
            pr.set(ioName, { state: IO_STATE.OK, name: ioName });
            return pr;
        }, new Map());
    }

    setAvailable(state: keyof typeof AVAILABLE) {
        this.isAvailble = state;
    }

    get IsAvailable() {
        return this.isAvailble;
    }

    setCell(index: number, state: TCellState) {
        this.cells[index] = state;
        this.emit('update', { section: this.name, path: ['Cells', index, 'Status'], state } as IEventStateUpdate);
    }


    getCellState(index: number) : TCellState {
        return this.cells[index];
    }

    isCellAvailable(index: number) {

        return this.cells[index] == CELL_STATE.OK 
            || this.cells[index] == CELL_STATE.OVERLOAD
    }

    setRow(index: number, state: string) {
        this.rows[index] = state;
        // TODO
    }

    getRow(index: number) {
        return this.rows[index];
    }

    setCol(index: number, state: string) {
        this.cols[index] = state;
        // TODO
    }

    getCol(index: number) {
        return this.cols[index];
    }

    setIOState(ioName: string, state: typeof IO_STATE[keyof typeof IO_STATE]) {
        let io = this.io.get(ioName);
        io!.state = state;
        this.emit('update', { path: ['IO', ioName, 'Status'], state } as IEventStateUpdate);
    }

    getIOFullState(ioName: string): TYPE_IO | undefined {
        return this.io.get(ioName);
    }

    setIOPortState(ioName: string, index: number, state: IoPortStateKeys) {
        let io = this.io.get(ioName);
        if (io && io.ports?.[index]) {
            io!.ports[index] = state;
            this.emit('update', { path: ['IO', ioName, 'Ports', index], state } as IEventStateUpdate);
        }
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