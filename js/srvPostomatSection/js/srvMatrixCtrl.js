const { EventEmitter2 } = require("eventemitter2");
const ClassBaseService = require('./srvService.js');
const mqtt = require('mqtt');

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
 * @property {string} sourceAxis
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

const PROTOCOL = 'mmtrxmotor';
const BUS_NAME_LIST = ['sysBus', 'logBus', 'mmtrxmotorBus', 'modBusBus'];

const MOTOR_ON = 1;
const MOTOR_OFF = 0;

class ClassModBusMatrixMotor_S extends ClassBaseService {
    /**
     * @typedef {object} TypeMatrixCtrl
     * @property {KC868} row  
     * @property {KC868} col 
     */
    /** @type {Object<string, TypeMatrixCtrl>} */
    #_MatrixCtrl = {};
    /** @type {Object<string, TypeMatrixCtrlAdvOpts>} */
    #_MatrixOpts = {}
    
    constructor({ _busList, _advOpts }) {
        // передача в супер-конструктор имени службы и списка требуемых шин
        super({ _name: 'mmtrxmotor', _busNameList: BUS_NAME_LIST, _busList });
        // this.#_MatrixOpts = _advOpts;
        this.FillEventOnList('sysBus', ['all-init-stage1-set']);
        this.FillEventOnList('mmtrxmotorBus', ['mmtrxmotor-cmd']);
    }

    *Sources() {
        for (let source of Object.values(this.SourcesState)) {
            if (source.Protocol === PROTOCOL && !source.IsConnected && source.CheckProcess && source.Status === 'active')
                yield source;
        };
    }

    async HandlerEvents_all_init_stage1_set(_topic, _msg) {
        super.HandlerEvents_all_init_stage1_set(_topic, _msg);
        
        let mqttSource = Object.values(this.SourcesState).find(s => s.Protocol == 'mqtt');
        this.mqttC = (await this.#CreateMQTTConnection(mqttSource)).client;

        for (let source of this.Sources()) {
            this.#_MatrixOpts[source.Name] = { sourceAxis: 'row', ...source.AdvOpts };
            // /** @type {MatrixCtrlConfig} */
            // let source = Object.values(this.SourcesState).find(_source => _source.Protocol === PROTOCOL);
            let rowMbOpts = this.#_MatrixOpts[source.Name].row.source;
            let colMbOpts = this.#_MatrixOpts[source.Name].col.source;
            this.#_MatrixCtrl[source.Name] = { 
                row: new KC868({ mbID: rowMbOpts }, this.mqttC), //TODO
                col: new KC868({ mbID: colMbOpts }, this.mqttC) 
            };
        }
    }
    /**
     * @method
     * @public
     * @description Отправляет службе mqttclient топик и значение, которое требуется записать
     * @param {string} _topic 
     * @param {*} _msg 
     */
    async HandlerEvents_mmtrxmotor_cmd(_topic, msg) {
        const { hash } = msg.metadata;
        const [ sourceName ] = msg.arg;
        const [{ cmd, args, target }] = msg.value;

        let error = false; 

        switch (cmd) {
            case 'On':
                try {
                    await this.On(sourceName, target, ...args);
                } catch (e) {
                    error = true;
                    // TODO: log
                }
                break;

            case 'Off':
                try {
                    await this.Off(sourceName, target, ...args);
                } catch (e) {
                    error = true;
                    break;
                }
            default:
                break;
        }
        let resArg = [sourceName];
        let resValue = { ...msg.value[0], error };
        this.EmitEvents_proxymmtrxmotor_res({ hash, arg: resArg, value: [resValue] });
    }

    EmitEvents_proxymmtrxmotor_res({ hash, arg, value }) {
        const msg = {
            // hash,
            dest: 'proxymmtrxmotor',
            com: 'proxymmtrxmotor-res',
            arg,
            value
        };
        
        this.EmitMsg('mmtrxmotorBus', msg.com, msg);
    }
    
    get MatrixCtrl() {
        return this.#_MatrixCtrl;
    }

    /**
     * Converts a linear index to row and column indices.
     * @param {string} sourceName 
     * @param {number} index The linear index (0-based).
     * @param {number} width The number of columns in the grid.
     * @returns {{row: number, column: number}} An object containing the row and column.
     */
    IndexToPos(sourceName, index) {
        let width = this.#_MatrixOpts[sourceName].col.channels.length;
        
        return { row: Math.floor(index / width), col: index % width };
    }

    /**
     * @method
     * @param {string} sourceName 
     * @param {number} index
     * @param {object} opts
     * @param {number} opts.step
     * 
     * @returns {Promise<boolean>}
     */
    async On(sourceName, index, opts) {
        let { step } = opts ?? {};
        let { col, row } = this.IndexToPos(sourceName, index);
        let ctrl = this.#_MatrixCtrl[sourceName];
        let mtrxOpts = this.#_MatrixOpts[sourceName];
        const sourceIsRow = mtrxOpts.sourceAxis == 'row';

        let sourceIO = sourceIsRow ? ctrl.row : ctrl.col;
        let groundIO = sourceIsRow ? ctrl.col : ctrl.row;

        let srcSwChNum = sourceIsRow ? mtrxOpts.row.channels[row] : mtrxOpts.col.channels[col];
        let gndSwChNum = sourceIsRow ? mtrxOpts.col.channels[col] : mtrxOpts.row.channels[row];

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
     * @param {string} sourceName 
     * @param {number} index
     * @param {object} opts
     * @param {number} opts.step
     * 
     * @returns {Promise<boolean>}
     */
    async Off(sourceName, index, opts) {
        let { step } = opts ?? {};
        let { col, row } = this.IndexToPos(sourceName, index);
        let ctrl = this.#_MatrixCtrl[sourceName];
        let mtrxOpts = this.#_MatrixOpts[sourceName];
        const sourceIsRow = mtrxOpts.sourceAxis == 'row'

        let sourceIO = sourceIsRow ? ctrl.row : ctrl.col;
        let groundIO = sourceIsRow ? ctrl.col : ctrl.row;
        /*if (!source ?? !ground)
            return Promise.reject(`No element [${row}][${col}]`);*/

        let srcSwChNum = sourceIsRow ? mtrxOpts.row.channels[row] : mtrxOpts.col.channels[col];
        let gndSwChNum = sourceIsRow ? mtrxOpts.col.channels[col] : mtrxOpts.row.channels[row];

        switch (step) {
            case 1:
                return await this.Switch(groundIO, gndSwChNum, MOTOR_OFF);
            case 2:
                return await this.Switch(sourceIO, srcSwChNum, MOTOR_OFF);
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

    #CreateMQTTConnection(_source) {
        return new Promise(async (res, rej) => {
            let options = Object.assign({
                port:     _source.Port,
                username: _source.Login,
                password: _source.Password,
            }, _source.ConnectOpts);
            options.protocol ??= 'mqtt'; //по умолчанию mqtt://

            let url = `${options.protocol}://${(_source.IP) ? _source.IP : _source.DN}`;

            try {
                const connection = await mqtt.connectAsync(url, options);
                res({ source: _source, client: connection });
            } catch (e) {
                this.EmitEvents_logger_log({ msg: `Error trying connect to ${url}`, level: 'E', obj: e });
                res({ source: _source, client: null });
            }
        });
    }
}

class KC868 {
    Events = new EventEmitter2()
    /**
     * 
     * @param {MatrixCtrlGroupConfig} opts 
     */
    constructor(opts, mqttC) {
        this.addr = opts.mbID;
        this.mqttC = mqttC;
    }
    SetValue(chNum, value) {
        setTimeout(() => {
            try {
                this.mqttC.publish(`/Emulator/KC868/${this.addr}/${chNum}`, typeof value == 'string' ? value : JSON.stringify(value));
            } catch (e) {}
            this.OnSetValue(chNum, value);
            this.Events.emit(`${chNum}-value`, value);
        }, 0);
    }
    OnSetValue(chNum, value) {

    }
}

// let a = new ClassSpiralSectionStorage({advOpts: {rows:12, cols: 8}});
module.exports = ClassModBusMatrixMotor_S;