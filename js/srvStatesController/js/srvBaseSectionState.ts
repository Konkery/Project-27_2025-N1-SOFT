'use strict';
// srvBaseSectionState.ts
import EventEmitter2 from 'eventemitter2';
import { IO_PORT_STATE, IO_STATE, CellStateKeys,
    AVAILABLE, RUNNING, 
    CELL_STATE} from './srvStates';
import { ISectionParams } from './srvSectionStateController';

interface TYPE_IO {
    name: string,
    state: typeof IO_STATE[keyof typeof IO_STATE];
    ports: typeof IO_PORT_STATE[keyof typeof IO_PORT_STATE][];
} 

export class BaseSectionState < TCellState extends string = CellStateKeys> extends EventEmitter2 {

    public Name: string;
    public IsAvailble: typeof AVAILABLE[keyof typeof AVAILABLE];
    public Running: typeof RUNNING[keyof typeof RUNNING];
    public Rows: string[];
    public Cols: string[];
    
    public Cells: TCellState[];
    public IO: Record<string, TYPE_IO>;

    constructor(config: ISectionParams) {
        super();
        this.Name = config.Name;
        this.IsAvailble = AVAILABLE.YES;
        this.Running = RUNNING.NO;
        this.Rows = [];
        this.Cols = [];
        this.Cells = Array.from({ length: config.Size.rows * config.Size.cols }, () => CELL_STATE.OK as TCellState);

        this.IO = (config.IOList ?? []).reduce((pr, ioName) => {
            pr[ioName] = { 
                state: IO_STATE.OK, 
                name: ioName, 
                ports: [] 
            };
            return pr;
        }, {} as Record<string, TYPE_IO>);
    }

    public Reset(): void {
        this.IsAvailble = AVAILABLE.YES;
        this.Running = RUNNING.NO;
        this.Rows = [];
        this.Cols = [];
        this.Cells = [];

        for (const ioName of Object.keys(this.IO)) {
            this.IO[ioName] = {
                state: IO_STATE.OK,
                name: ioName,
                ports: []
            };
        }
        this.Cells = Array.from({ length: this.Cells.length }, () => CELL_STATE.OK as TCellState);
    }
}

export default BaseSectionState;