'use strict';
// srvBaseSectionState.ts
import EventEmitter2 from 'eventemitter2';
import { 
    IO_PORT_STATE, IO_STATE, CellStateKeys,
    AVAILABLE, CELL_STATE, 
    SECTION_STATUS, SectionStatusKeys,
    LINE_STATE, LineStateKeys
} from './srvStates';
import { ISectionParams } from './srvSectionStateController';

interface TYPE_IO {
    name: string,
    state: typeof IO_STATE[keyof typeof IO_STATE];
    ports: typeof IO_PORT_STATE[keyof typeof IO_PORT_STATE][];
} 

export class BaseSectionState < TCellState extends string = CellStateKeys> extends EventEmitter2 {

    public Name: string;
    public IsAvailble: typeof AVAILABLE[keyof typeof AVAILABLE];
    public Status: SectionStatusKeys;
    public Rows: LineStateKeys[];
    public Cols: LineStateKeys[];
    
    public Cells: TCellState[];
    public Resourse_available: string[];
    public Resourse_standard: number[];
    public IO: Record<string, TYPE_IO>;

    constructor(config: ISectionParams) {
        super();
        this.Name = config.Name;
        this.IsAvailble = AVAILABLE.YES;
        this.Status = SECTION_STATUS.IDLE;
        this.Rows = Array.from({ length: config.Size.rows }, () => LINE_STATE.OK);
        this.Cols = Array.from({ length: config.Size.cols }, () => LINE_STATE.OK);
        this.Cells = Array.from({ length: config.Size.rows * config.Size.cols }, () => CELL_STATE.OK as TCellState);
        this.Resourse_available = Array.from({ length: config.Size.rows * config.Size.cols }, () => AVAILABLE.YES);
        this.Resourse_standard = Array.from({ length: config.Size.rows * config.Size.cols }, () => 0);

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
        const cellCount = this.Cells.length;
        const rowsCount = this.Rows.length;
        const colsCount = this.Cols.length;

        this.IsAvailble = AVAILABLE.YES;
        this.Status = SECTION_STATUS.IDLE;
        this.Rows = Array.from({ length: rowsCount }, () => LINE_STATE.OK);
        this.Cols = Array.from({ length: colsCount }, () => LINE_STATE.OK);

        for (const ioName of Object.keys(this.IO)) {
            this.IO[ioName] = {
                state: IO_STATE.OK,
                name: ioName,
                ports: []
            };
        }
        this.Cells = Array.from({ length: cellCount }, () => CELL_STATE.OK as TCellState);
        this.Resourse_available = Array.from({ length: cellCount }, () => AVAILABLE.YES);
        this.Resourse_standard = Array.from({ length: cellCount }, () => 0);
    }
}

export default BaseSectionState;