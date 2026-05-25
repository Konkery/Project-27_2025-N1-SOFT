const { EventEmitter2 } = require("eventemitter2");
const { isWithinTolerance } = require("./srvUtils");
let sleep = require('timers/promises').setTimeout;
// const mqtt = require('mqtt');

const STATE = {
    IDLE: 'IDLE',
    LOW_PORT_UP: 'LOW_PORT_UP',
    HIGH_PORT_UP: 'HIGH_PORT_UP',
    HIGH_PORT_DOWN: 'HIGH_PORT_DOWN',
    LOW_PORT_DOWN: 'LOW_PORT_DOWN',
    OPEN: 'OPEN',
    WARN: 'WARN',
    ERROR: 'ERROR'
}

class ClassPostomatSection {
    static STATE = STATE;
    #_LocalCellStatus;
    #_TimeOuts = [];
    #_CellOpts = {};
    #_Channels = {};
    #_ProxyCh;
    #_Events;
    _Target;
    #_Context = { 
        order: null,
        currentTask: null
    };
    
    constructor({ channels, advOpts, Prox, target }) {
        this.#_ProxyCh = Prox;
        this.#_Channels = channels;
        this._Target = target;
        this.#_Events = new EventEmitter2();
        this.#_CellOpts = advOpts.cellOpts;
        this.Init();
    }

    get Events() {
        // TODO: return proxy
        return this.#_Events;
    }

    Init() {
        this.#_LocalCellStatus = Array.from({ length: this.#_CellOpts.size.rows }, () => Array(this.#_CellOpts.size.cols).fill(ClassPostomatSection.STATE.IDLE));
        this.#_Channels.storageChannels.tamperChannels.forEach((tamper, i) => {
            this.#_ProxyCh.Events.on(`${tamper}-value`, (val) => {
                let {row, col} = this.IndexToPos(i);
                if (this.#_LocalCellStatus[row][col] == ClassPostomatSection.STATE.IDLE && val.Value == 0) {
                    this.#_ProxyCh.SetValue(this.#_Channels.ledChannels.ledCtrl, {target: 'error', Num: i});
                    this.SetCellState (i, ClassPostomatSection.STATE.ERROR);
                    //console.log(`Error at ${i}`);
                }
                else if (val.Value == 1) {// this.#_LocalCellStatus[row][col] == ClassPostomatSection.STATE.OPEN && 
                    this.#_ProxyCh.SetValue(this.#_Channels.ledChannels.ledCtrl, {target: 'off', Num: i});
                    clearTimeout(this.#_TimeOuts[i]);
                    this.SetCellState (i, ClassPostomatSection.STATE.IDLE);
                }
            });
            //console.log(this.#_LocalCellStatus);
        });
        this.#_Events.on('dispense', (result, error) => this.OnResult(result, error));
    }

    OnResult(cell, errorMessage='') {
        const { ID } = this.#_Context?.order ?? {};
        if (ID) {
            this.RouteResult({
                Response: {
                    ID: crypto.randomUUID(),
                    ParentID: ID,			        // идентификатор транзакции, на которую отвечаем
                    Timestamp: new Date().getTime(),
                    Target: this._Target,
                    Cell: cell,
                    Result: errorMessage ? 'FAIL' : 'OK',           
                    Message: errorMessage ? errorMessage : 'Операция выполнена успешно'
                }  
            });
        };
    }

    RouteResult(msg) {
        //console.log(msg);
        this.#_Events.emit('response', msg);
    }

    async PerformTransaction(transaction, param0) {
        const { mock } = param0 ?? {}; 
        const { ID, Cells } = transaction;
        this.#_Context.order = { ID, Cells };
        return this.ProcessCell(Cells);
    }

    /**
     * Converts a linear index to row and column indices.
     * 
     * @param {number} index The linear index (0-based).
     * @param {number} width The number of columns in the grid.
     * @returns {{row: number, column: number}} An object containing the row and column.
     */
    IndexToPos( index ) {
        let width = this.#_CellOpts.size.cols;
        
        return { row: Math.floor(index / width), col: index % width };
    }

    /**
     * Converts a linear index to row and column indices.
     * 
     * @param {number} index The linear index (0-based).
     * @param {number} width The number of columns in the grid.
     * @returns {{row: number, column: number}} An object containing the row and column.
     */
    PosToIndex ( row, col ) {
        let width = this.#_CellOpts.size.cols;
        
        return row * width + col;
    }

    async ProcessCell ( _Cells ) {

        for (let i = 0; i < _Cells.length; i++) {
            let cell = _Cells[i];
            let Ic_Old, Ic_Curr;
            let port_low, port_high;
            let idx = this.PosToIndex(cell.row, cell.column);

            if (this.#_LocalCellStatus[cell.row][cell.column] == ClassPostomatSection.STATE.ERROR ||
                this.#_LocalCellStatus[cell.row][cell.column] == ClassPostomatSection.STATE.WARN) {
                this.#_Events.emit('dispense', cell, `Cell[${cell.row},${cell.column}] is currently open`);
                continue;
            }

            //console.log(idx);
            if (this.#_ProxyCh.GetValue(this.#_Channels.storageChannels.tamperChannels[idx]) == 0) {
                this.#_ProxyCh.SetValue(this.#_Channels.ledChannels.ledCtrl, {target: 'error', Num: idx});

                this.SetCellState (idx, ClassPostomatSection.STATE.ERROR);

                this.#_Events.emit('dispense', cell, `Cell[${cell.row},${cell.column}] is currently open or its tamper broken`);
                continue;
            }

            port_low = this.#_CellOpts.row.channels[cell.row];
            port_high = this.#_CellOpts.col.channels[cell.column];


            this.#_ProxyCh.SetValue(this.#_Channels.ledChannels.ledCtrl, {target: 'on', Num: idx});

            this.#_TimeOuts[idx] = setTimeout(() => {
                this.#_ProxyCh.SetValue(this.#_Channels.ledChannels.ledCtrl, {target: 'warn', Num: idx});
                this.SetCellState (idx, ClassPostomatSection.STATE.WARN);
                this.#_TimeOuts[idx] = setTimeout (() => {
                    this.#_ProxyCh.SetValue(this.#_Channels.ledChannels.ledCtrl, {target: 'error', Num: idx});
                    this.SetCellState (idx, ClassPostomatSection.STATE.ERROR);
                }, 150000);
            }, 15000)

            this.SetCellState (idx, ClassPostomatSection.STATE.LOW_PORT_UP);

            Ic_Old = this.#_ProxyCh.GetValue(this.#_Channels.electroChannels.curr);

            this.#_ProxyCh.SetValue(this.#_Channels.storageChannels.portChannels[port_low], 1);
            await sleep(100);

            Ic_Curr = this.#_ProxyCh.GetValue(this.#_Channels.electroChannels.curr);

            if (Ic_Old - Ic_Curr > 0.05) {              
                this.#_ProxyCh.SetValue(this.#_Channels.storageChannels.portChannels[port_low], 0);
                clearTimeout(this.#_TimeOuts[idx]);

                let width = this.#_CellOpts.size.cols;

                for (let i = width * cell.row; i < width * cell.row + width; i++) {
                    if (![ClassPostomatSection.STATE.IDLE].includes(this.#_LocalCellStatus[i]))
                        continue;

                    this.SetCellState (i, ClassPostomatSection.STATE.ERROR);//
                    this.#_ProxyCh.SetValue(this.#_Channels.ledChannels.ledCtrl, {target: 'error', Num: i});
                }

                this.#_Events.emit('dispense', cell, `Cell[${cell.row},${cell.column}]. State: ${this.#_LocalCellStatus[cell.row][cell.column]}. Current: {old: ${Ic_Old}, new: ${Ic_Curr}`);
                await sleep(100);
                continue;
            }

            Ic_Old = Ic_Curr;

            this.SetCellState (idx, ClassPostomatSection.STATE.HIGH_PORT_UP);
            this.#_ProxyCh.SetValue(this.#_Channels.storageChannels.portChannels[port_high], 1);            

            await sleep(100);
            Ic_Curr = this.#_ProxyCh.GetValue(this.#_Channels.electroChannels.curr);

            if (Ic_Curr - Ic_Old > 4.50) {
                this.#_ProxyCh.SetValue(this.#_Channels.storageChannels.portChannels[port_low], 0);
                this.#_ProxyCh.SetValue(this.#_Channels.storageChannels.portChannels[port_high], 0);
                clearTimeout(this.#_TimeOuts[idx]);


                let height = this.#_CellOpts.size.rows;
                let width = this.#_CellOpts.size.cols;

                for (let i = cell.row; i < width * height; i += width) {
                    if (![ClassPostomatSection.STATE.IDLE].includes(this.#_LocalCellStatus[i]))
                        continue;

                    this.SetCellState (i, ClassPostomatSection.STATE.ERROR);//
                    this.#_ProxyCh.SetValue(this.#_Channels.ledChannels.ledCtrl, {target: 'error', Num: i});
                }

                this.#_Events.emit('dispense', cell, `Cell[${cell.row},${cell.column}]. State: ${this.#_LocalCellStatus[cell.row][cell.column]}. Current: {old: ${Ic_Old}, new: ${Ic_Curr}`);
                await sleep(100);
                continue;
            }

            Ic_Old = Ic_Curr;

            this.SetCellState (idx, ClassPostomatSection.STATE.LOW_PORT_DOWN);
            this.#_ProxyCh.SetValue(this.#_Channels.storageChannels.portChannels[port_low], 0);

            await sleep(100);

            Ic_Curr = this.#_ProxyCh.GetValue(this.#_Channels.electroChannels.curr);
            if (Ic_Old - Ic_Curr > 4.50) {
                this.#_ProxyCh.SetValue(this.#_Channels.storageChannels.portChannels[port_high], 0);
                clearTimeout(this.#_TimeOuts[idx]);

                let width = this.#_CellOpts.size.cols;

                for (let i = width * cell.row; i < width * cell.row + width; i++) {
                    if (![ClassPostomatSection.STATE.IDLE].includes(this.#_LocalCellStatus[i]))
                        continue;

                    this.SetCellState (i, ClassPostomatSection.STATE.ERROR);//
                    this.#_ProxyCh.SetValue(this.#_Channels.ledChannels.ledCtrl, {target: 'error', Num: i});
                }

                this.#_Events.emit('dispense', cell, `Cell[${cell.row},${cell.column}]. State: ${this.#_LocalCellStatus[cell.row][cell.column]}. Current: {old: ${Ic_Old}, new: ${Ic_Curr}`);
                await sleep(100);
                continue;
            }

            Ic_Old = Ic_Curr;

            this.SetCellState (idx, ClassPostomatSection.STATE.HIGH_PORT_DOWN);
            this.#_ProxyCh.SetValue(this.#_Channels.storageChannels.portChannels[port_high], 0);

            await sleep(100);

            Ic_Curr = this.#_ProxyCh.GetValue(this.#_Channels.electroChannels.curr);
            if (Ic_Old - Ic_Curr > 0.05) {
                clearTimeout(this.#_TimeOuts[idx]);
                let height = this.#_CellOpts.size.rows;
                let width = this.#_CellOpts.size.cols;

                for (let i = cell.row; i < width * height; i += width) {
                    if (![ClassPostomatSection.STATE.IDLE].includes(this.#_LocalCellStatus[i]))
                        continue;

                    this.SetCellState (i, ClassPostomatSection.STATE.ERROR);//
                    this.#_ProxyCh.SetValue(this.#_Channels.ledChannels.ledCtrl, {target: 'error', Num: i});
                }

                this.#_Events.emit('dispense', cell, `Cell[${cell.row},${cell.column}]. State: ${this.#_LocalCellStatus[cell.row][cell.column]}. Current: {old: ${Ic_Old}, new: ${Ic_Curr}`);
                await sleep(100);
                continue;
            }

            this.SetCellState (idx, ClassPostomatSection.STATE.OPEN);
            this.#_Events.emit('dispense', cell, false);
            await sleep(100);
        }
    }

    SetCellState ( _index, _state ) {
        let {row, col} = this.IndexToPos(_index);
        this.#_LocalCellStatus[row][col] = _state;
        // publish MQTT
    }

    /**
     * @method
     * @param {number} index
     * @param {object} param0
     * @param {number} param0.step
     * 
     * @returns {Promise<boolean>}
     */
    async On(index, { step }) {
        /*let { col, row } = this.IndexToPos(index);

        let sourceIO = this.sourceIsRow ? this.#_MatrixCtrl.row : this.#_MatrixCtrl.col;
        let groundIO = this.sourceIsRow ? this.#_MatrixCtrl.col : this.#_MatrixCtrl.row;

        let srcSwChNum = this.sourceIsRow ? this.#_MatrixOpts.row.channels[row] : this.#_MatrixOpts.col.channels[col];
        let gndSwChNum = this.sourceIsRow ? this.#_MatrixOpts.col.channels[col] : this.#_MatrixOpts.row.channels[row];

        switch (step) {
            case 1:
                return await this.Switch(groundIO, gndSwChNum, MOTOR_ON);
            case 2:
                return await this.Switch(sourceIO, srcSwChNum, MOTOR_ON);
            default:
                return Promise.reject(`Invaild request: step must be specified and be in range 1..2`);
        }*/
    }

    /**
     * @method
     * @param {number} index
     * @param {object} param0
     * @param {number} param0.step
     * 
     * @returns {Promise<boolean>}
     */
    async Off(index, { step }) {
        /*let { col, row } = this.IndexToPos(index);

        let sourceIO = this.sourceIsRow ? this.#_MatrixCtrl.row : this.#_MatrixCtrl.col;
        let groundIO = this.sourceIsRow ? this.#_MatrixCtrl.col : this.#_MatrixCtrl.row;
        /*if (!source ?? !ground)
            return Promise.reject(`No element [${row}][${col}]`);

        let srcSwChNum = this.sourceIsRow ? this.#_MatrixOpts.row.channels[row] : this.#_MatrixOpts.col.channels[col];
        let gndSwChNum = this.sourceIsRow ? this.#_MatrixOpts.col.channels[col] : this.#_MatrixOpts.row.channels[row];

        switch (step) {
            case 1:
                return await this.Switch(sourceIO, srcSwChNum, MOTOR_OFF);
            case 2:
                return await this.Switch(groundIO, gndSwChNum, MOTOR_OFF);
            default:
                return Promise.reject(`Invaild request: step must be specified and be in range 1..2`);
        }*/
    }

    async OffEmergency() {

    }
    /**
     * 
     * @param {KC868} io 
     * @param {number} value 
     */
    async Switch(io, chNum, value) {
        io.SetValue(chNum, value);

        await io.Events.waitFor(`${chNum}-value`, {
            timeout: 50, //TODO add const
            filter: (Value) => Value == value
        }).catch(() => {
            throw new Error(`Element [$${io.addr}:${chNum}] error: no response from switch "${chNum}"`);
        });
    }
}

class KC868 {
    Events = new EventEmitter2()
    /**
     * 
     * @param {MatrixCtrlGroupConfig} opts 
     */
    constructor(opts) {
        this.addr = opts.mbID;
    }
    SetValue(chNum, value) {
        setTimeout(() => {
            mqttC.publish(`/Emulator/KC868/${this.addr}/${chNum}/`, value);
            this.OnSetValue(chNum, value);
            this.Events.emit(`${chNum}-value`, value);
        }, 20);
    }
    OnSetValue(chNum, value) {

    }
}

// let a = new ClassSpiralSectionStorage({advOpts: {rows:12, cols: 8}});
module.exports = ClassPostomatSection;