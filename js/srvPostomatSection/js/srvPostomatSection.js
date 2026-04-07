const { EventEmitter2 } = require("eventemitter2");
const { isWithinTolerance } = require("./srvUtils");
const ClassBaseService = require('../../srvService/js/srvService.js');
let sleep = require('timers/promises').setTimeout;
// const mqtt = require('mqtt');

/**
 * @typedef {object} MatrixCtrlConfig
 * @property {number} ID
 * @property {string} Status
 * @property {string} Name
 * @property {string} Type
 * @property {string} Property
 * @property {string} Protocol
 * @property {string} DN
 * @property {string} IP
 * @property {string} Port
 * @property {number} SensorChExpected
 * @property {[MatrixCtrlGroupConfig]} Groups
 * @property {TypeMatrixCtrlAdvOpts} AdvOpts
 */

/**
 * @typedef {object} MatrixCtrlGroupConfig
 * @property {number} mbID
 * @property {string} type
 * @property {number} startReg
 * @property {number} numRegs
 * @property {number} interval
 */    

/**
 * @typedef {Object} TypeMatrixCtrlAdvOpts
 * @property {string} orientation
 * @property {object} row
 * @property {string} row.source
 * @property {[number]} row.channels
 * @property {object} col
 * @property {string} col.source
 * @property {[number]} col.channels
 */

/**
 * @typedef {object} TypeCoords
 * @property {number} coords.col - Столбец (начинается с 0)
 * @property {number} coords.row - Строка (начинается с 0)
 */

/**
 * @typedef {object} TypeElectrCurrentState
 * @property {number} IDLE
 * @property {number} WORK_OK
 * @property {number} STUCK
 */

//const PROTOCOL = 'mmtrxmotor';
const BUS_NAME_LIST = ['sysBus', 'logBus', 'cellMtrxBus', 'modBusBus'];

const MOTOR_ON = 1;
const MOTOR_OFF = 0;

// let mqttC = mqtt.connect('10.110.71.231', { port: 1883, username: 'operator2', password: '34pass' })

const STATE = {
    OK: 'OK',
    OVELROAD: 'OVERLOAD',
    BLOCKED: 'BLOCKED',
    SERVICE: 'SERVICE',
    TAMPER_ERROR: 'TAMPER_ERROR',
    ACTUATOR_SHORT_CIRCUIT: 'ACTUATOR_SHORT_CIRCUIT',
    ACTUATOR_NO_POWER: 'ACTUATOR_NO_POWER'
}

const LED_COLOR = {
    WHITE: Array(9).fill(255),
    RED: [255, 0, 0, 255, 0, 0, 255, 0, 0]
}

class ClassModBusMatrixCell_S extends ClassBaseService {
   
    static STATE = STATE;
    static LED_COLOR = LED_COLOR;
    #_MatrixCtrl;
    #_MatrixOpts = {};
    #_LocalCellStatus = [];
    #_TransactionStep;
    #_OuterChannels = {};
    #_ProxyCh;
    
    constructor({ _busList, _advOpts }) {
        // передача в супер-конструктор имени службы и списка требуемых шин
        super({ _name: 'cellMtrx', _busNameList: BUS_NAME_LIST, _busList });
        this.#_MatrixOpts = _advOpts;
        this.sourceIsRow = false;
        this.Init();
        this.FillEventOnList('sysBus', ['all-init-stage1-set']);
        this.FillEventOnList('cellMtrxBus', ['cellMtrx-cmd']);
    }

    Sources() {
        for (let source of Object.values(this.SourcesState)) {
            if (source.Protocol === PROTOCOL && !source.IsConnected && source.CheckProcess && source.Status === 'active')
                yield source;
        };
    }

    HandlerEvents_all_init_stage1_set(_topic, _msg) {
        super.HandlerEvents_all_init_stage1_set(_topic, _msg);

        for (let source of this.Sources) {
            
        }
    }
    /**
     * @method
     * @public
     * @description Отправляет службе mqttclient топик и значение, которое требуется записать
     * @param {string} _topic 
     * @param {*} _msg 
     */
    async HandlerEvents_cellMtrx_cmd(_topic, msg) {
        /*let _msg = { 
            arg: [],
            value: [{
                target: index,
                cmd: 'On',
                args: [{ step: 1 } ]
            }]
        }*/
        const { hash } = msg.metadata;
        // const [ source_name ] = _msg.arg;
        // const { source } = _msg.metadata;

        const [{ target, cmd, args }]= msg.value;
        // let coords = this.IndexToPos(target);
        let error = false; 
        switch (cmd) {
            case 'On':
                try {
                    await this.On(target, ...args);
                } catch (e) {
                    error = true;
                    // TODO: log
                }
                break;

            case 'Off':
                try {
                    await this.Off(target, ...args);
                } catch (e) {
                    error = true;
                    break;
                }
            default:
                break;
        }
        let resArg = [];
        let resValue = { ...msg.value[0], error };
        this.EmitEvents_proxycellMtrx_res({ hash, arg: resArg, value: [resValue] });
    }

    EmitEvents_proxycellMtrx_res({ hash, arg, value }) {
        const msg = {
            hash,
            dest: 'proxycellMtrx',
            com: 'proxycellMtrx-res',
            arg,
            value
        };
        
        this.EmitMsg('cellMtrxBus', msg.com, msg);
    }
    
    Init() {
        let rowMbOpts = this.#_MatrixOpts.row.source;
        let colMbOpts = this.#_MatrixOpts.col.source;
        this.#_MatrixCtrl = { 
            row: new KC868(rowMbOpts), //TODO
            col: new KC868(colMbOpts) 
        };
    }
    get MatrixCtrl() {
        return this.#_MatrixCtrl;
    }

    /**
     * Converts a linear index to row and column indices.
     * 
     * @param {number} index The linear index (0-based).
     * @param {number} width The number of columns in the grid.
     * @returns {{row: number, column: number}} An object containing the row and column.
     */
    IndexToPos(index) {
        let width = this.#_MatrixOpts.col.channels.length;
        
        return { row: Math.floor(index / width), col: index % width };
    }

    async ProcessCell ( _index ) {
        let mtrxPos = this.IndexToPos(_index);        
        let Ic_Old, Ic_Curr;
        
        if (![this.STATE.OK, this.STATE.OVERLOAD].includes(this.#_LocalCellStatus[_index])) {
            return { code: -1, error: `Cell[${mtrxPos.row},${mtrxPos.col}] in in unavailable state: ${this.#_LocalCellStatus[_index]}`};
        }

        if (this.#_ProxyCh.GetValue(`${this.#_OuterChannels.tamper}-${String(_index).padStart(2, '0')}`) != 0) {
            this.LEDControl(_index, this.LED_COLOR.RED);

            this.SetCellState (_index, this.STATE.TAMPER_ERROR);

            return { code: -1, error: `Cell[${mtrxPos.row},${mtrxPos.col}] is currently open or its tamper broken`};
        }

        this.LEDControl(_index, this.LED_COLOR.WHITE);

        Ic_Old = this.#_ProxyCh.GetValue(this.#_OuterChannels.current);

        //modbus command close PORT -
        
        await sleep(50);

        Ic_Curr = this.#_ProxyCh.GetValue(this.#_OuterChannels.current);

        if (!isWithinTolerance(Ic_Old, Ic_Curr, 0.05)) {
            // modbus command ports off
            this.SetCellState (_index, this.STATE.BLOCKED);
            // mqtt - transaction failed
            this.LEDControl(_index, this.LED_COLOR.RED);

            let width = this.#_MatrixOpts.col.channels.length;

            for (let i = width * mtrxPos.row; i < width * mtrxPos.row + width; i++) {
                if (![this.STATE.OK, this.STATE.OVERLOAD].includes(this.#_LocalCellStatus[i]))
                    continue;

                this.SetCellState (i, this.STATE.BLOCKED);
                this.LEDControl(i, this.LED_COLOR.RED);
            }

            return { code: -1, error: `Cell[${mtrxPos.row},${mtrxPos.col}] has its lower port locked`};
        }

        Ic_Old = Ic_Curr;


        //modbus command close PORT +
        
        await sleep(50);

        Ic_Curr = this.#_ProxyCh.GetValue(this.#_OuterChannels.current);

        if (!isWithinTolerance(Ic_Old + 3.00, Ic_Curr, 0.05)) {
            // modbus command ports off
            this.SetCellState (_index, this.STATE.BLOCKED);
            // mqtt - transaction failed
            this.LEDControl(_index, this.LED_COLOR.RED);

            let height = this.#_MatrixOpts.row.channels.length;
            let width = this.#_MatrixOpts.col.channels.length;

            for (let i = mtrxPos.row; i < width * height; i += width) {
                if (![this.STATE.OK, this.STATE.OVERLOAD].includes(this.#_LocalCellStatus[i]))
                    continue;

                this.SetCellState (i, this.STATE.BLOCKED);
                this.LEDControl(i, this.LED_COLOR.RED);
            }

            return { code: -1, error: `Cell[${mtrxPos.row},${mtrxPos.col}] has its upper port locked`};
        }



    }

    SetCellState ( _index, _state ) {
        this.#_LocalCellStatus[_index] = _state;
        // publish MQTT
    }

    LEDControl ( _index, _colors ) {
        let LEDState = {
            target: 'setup',
            register: 100 + _index * 2,
            value: _colors
        };

        this.#_ProxyCh.SetValue({ chName: this.#_OuterChannels.led, Value: LEDState });

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
        let { col, row } = this.IndexToPos(index);

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
        }
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
        let { col, row } = this.IndexToPos(index);

        let sourceIO = this.sourceIsRow ? this.#_MatrixCtrl.row : this.#_MatrixCtrl.col;
        let groundIO = this.sourceIsRow ? this.#_MatrixCtrl.col : this.#_MatrixCtrl.row;
        /*if (!source ?? !ground)
            return Promise.reject(`No element [${row}][${col}]`);*/

        let srcSwChNum = this.sourceIsRow ? this.#_MatrixOpts.row.channels[row] : this.#_MatrixOpts.col.channels[col];
        let gndSwChNum = this.sourceIsRow ? this.#_MatrixOpts.col.channels[col] : this.#_MatrixOpts.row.channels[row];

        switch (step) {
            case 1:
                return await this.Switch(sourceIO, srcSwChNum, MOTOR_OFF);
            case 2:
                return await this.Switch(groundIO, gndSwChNum, MOTOR_OFF);
            default:
                return Promise.reject(`Invaild request: step must be specified and be in range 1..2`);
        }
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
module.exports = ClassModBusMatrixCell_S;