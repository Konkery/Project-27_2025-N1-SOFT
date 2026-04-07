const { EventEmitter2 } = require("eventemitter2");
const { createTimer, ClassFault: Fault, isWithinTolerance } = require("./srvUtils");
const { ClassFSM: FSM } = require("./srvFSM");
const { STORAGE_CONSTANSTS, FAULTS } = require("./SpiralSectionConstants");
const { STATES: BROKER_STATES } = require("./srvVendingMachineStates");

const MOTOR_RES_MAX_TIME = 100000;
let sleep = require('timers/promises').setTimeout;

/** 
 * @typedef {object} TypeProxyCh
 * @property {Function} SetValue
 * @property {Function} GetValue
 * @property {[object]} Channels
 * @property {EventEmitter2} Events
 */

/**
 * @typedef {object} TypeSpiralSectionStorageChannels
 * @property {string} matrixCtrlChannel
 * @property {[string]} spiralTamperChannels
 * @property {string} current
 * @property {string} voltageChannel
 */


/**
 * @typedef {object} TypeSpiralSectionStorageOpts
 * @property {object} size
 * @property {number} size.rows
 * @property {number} size.cols
 */

//  * @property {[TypeSpiralSectionUnitOpts]} units

/**
 * @typedef {object} TypeSpiralSectionUnitOpts
 * @property {number} index
 * @property {TypeCoords} coords
 * @property {number} tamperInd
 */


/**
 * @typedef TypeSpiralSectionUnitEvents
 * @property {string} DISPENSE_COMMAND
 * @property {string} DISPENSED_SINGLE
 * @property {string} COMPLETED
 * @property {string} ROTATE_TIMEOUT
 * @property {string} ERROR
 */

/**
 * @typedef {object} TypeUnit
 * @property {number} index
 * @property {TypeCoords} coords
 * @property {number} capacity
 * @property {number} itemsLoaded
 * @property {number} itemsLeft
 * @property {number} itemsRequested
 * @property {number} itemsDispensed
 * @property {string} state
 * @property {number} tamperInd
 */

/**
 * @typedef {Object<string, TypeUnit} TypeUnits
 */

/**
 * @typedef {object} TypeOrder
 * @property {number} unitIndex
 * @property {number} itemsRequested
 * @property {number} itemsDispensed
 * @property {import("./srvUtils").TypeTimer} timer
 */

/**
 * @typedef {object} TypeSpiralSectionUnitContext
 * @property {TypeOrder|null} currentOrder
 * @property {number} rows
 * @property {number} cols
 * @property {[TypeUnit]} units
 * @property {number} stateChangeTimestamp
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

const { ELECTR_CURR_STATE, TAMPER_ON, CURRENT_RANGE, FULL_ROTATION_TIMEOUT } = STORAGE_CONSTANSTS;

const STATE = {
    IDLE: 'IDLE',
    DISPENSING: 'COLLECTING ',
    OUT_OF_SERVICE: 'OUT_OF_SERVICE',
}

class ClassSpiralSectionStorage {

    static STATE = STATE;

    /**@type {TypeProxyCh} */
    #_ProxyCh;
    /** @type {TypeSpiralSectionStorageChannels} */
    #_Channels = null;
    /** @type {TypeSpiralSectionUnitContext} */
    #_Context = {};
    /**@type {EventEmitter2} */
    #_Events = new EventEmitter2();
    #_StatesGraph = {
        [STATE.IDLE]: {
            [this.EVENTS.DISPENSE_COMMAND]: { state: STATE.DISPENSING,     action: this._Dispense.bind(this) },
            // [this.EVENTS.ERROR]:            { state: STATE.OUT_OF_SERVICE, action: this.SetOutOfService.bind(this) },
        },
        [STATE.DISPENSING]: {
            [this.EVENTS.DISPENSED_SINGLE]: { state: STATE.DISPENSING,     action: this.OnDispensedSingle.bind(this) },
            [this.EVENTS.ROTATE_TIMEOUT]:   { state: STATE.DISPENSING,     action: this.OnTimeout.bind(this) },
            [this.EVENTS.COMPLETED]:        { state: STATE.IDLE,           action: this.OnCompleted.bind(this) },
            // [this.EVENTS.ERROR]:            { state: STATE.OUT_OF_SERVICE, action: this.SetOutOfService.bind(this) },
        }
    };
    #_FSM = new FSM({ stateGraph: this.#_StatesGraph, onStateChanged: this.OnStateChanged.bind(this), defaultState: ClassSpiralSectionStorage.STATE.IDLE });
    #_Polling = false;
    /**
     * @param {object} param0
     * @param {TypeProxyCh} param0.ProxyCh
     * @param {TypeSpiralSectionStorageChannels} param0.channels 
     * @param {TypeSpiralSectionStorageOpts} param0.advOpts
     */
    constructor({ ProxyCh, channels, advOpts }) {
        this.#_ProxyCh = ProxyCh;
        this.#_Channels = channels;
        let { rows, cols } = advOpts.size;
        this.#_Context = {
            rows,
            cols,
            currentOrder: null,
            units: Array(rows*cols).fill().map((_, i) => ({
                coords: this.IndexToPos(i, cols),
                tamperInd: Math.floor(i / cols),
                itemsLoaded: 999,
                itemsLeft: 999,
                capacity: 999,
                itemsDispensed: 0,
                state: BROKER_STATES.CELLS.STATUS.OK
            }))
        };
        this.Init();
    }
    /**
     * @getter
     * @returns {TypeSpiralSectionUnitEvents}
     */
    get EVENTS() {
        return ({
            DISPENSE_COMMAND: 'DISPENSE_COMMAND',
            DISPENSED_SINGLE: 'DISPENSED_SINGLE',
            COMPLETED:        'DISPENSED',
            ROTATE_TIMEOUT:   'ROTATE_TIMEOUT',
            ERROR:            'ERROR',
        });
    }

    get Events() {
        // TODO: add proxy
        return this.#_Events;
    }

    Init() {
        this.InitEventHandlers();
        this.#_FSM.Run(this.#_Events, Object.values(this.EVENTS));
    }

    /**
     * @method
     */
    InitEventHandlers() {
        /** Tamper trigger handler */
        let cachedValues = Array.from({ length: this.#_Channels.spiralTamperChannels.length }).fill(undefined);
        for (let i = 0; i < this.#_Channels.spiralTamperChannels.length; i++) {
            let tamperCh = this.#_Channels.spiralTamperChannels[i];

            this.#_ProxyCh.Events.on(`${tamperCh}-value`, ({ Value }) => {
                if (this.#_Polling && Value != cachedValues[i] && Value == TAMPER_ON) {
                    console.log(`[Storage] сигнал с тампера спирали`);
                    this.#_Events.emit(this.EVENTS.DISPENSED_SINGLE, { tamperInd: i });   
                }
                cachedValues[i] = Value;
            });
        }

        this.currentMonitorInterv = setInterval(() => {
            let currState = this.CheckCurrent();
            let ind = this.#_Context.currentOrder?.unitIndex ?? -1;
            if (ind > -1) switch (currState) {
                case ELECTR_CURR_STATE.SHORT:
                    this.#_Context.units[ind].state = BROKER_STATES.CELLS.STATUS.ACTUATOR_SHORT_CIRCUIT;
                    this.#_Events.emit(this.EVENTS.ERROR, new Fault({ code: FAULTS.LIFT_SHORT_CIRCUIT, critical: true }));
                    break;
                
                case ELECTR_CURR_STATE.OVERLOAD:
                    this.#_Context.units[ind].state = BROKER_STATES.CELLS.STATUS.OVERLOAD;
                default:
                    break;
            } 
        }, 1000); //TODO: add const
    }

    // { state, prevState }
    OnStateChanged(...args) {
        this.#_Events.emit('state', ...args);
    }

    async OnDispensedSingle({ tamperInd }) {
        const indexInUse = this.#_Context.currentOrder.unitIndex;
        const unitInUse = this.#_Context.units[indexInUse];

        // сработал тампер который не должен был работать -> вероятно пробой
        /*if (unitInUse.tamperInd != tamperInd) {
            // await this.MotorOff(indexInUse);
            debugger
        }*/
        this.UpdateStorageContext({ index: indexInUse }, { dispensed: 1 });
        const { itemsDispensed, itemsRequested } = this.#_Context.currentOrder;
        // if (itemsDispensed > itemsRequested) TODO: log error
        if (itemsDispensed >= itemsRequested) {
            this.#_Context.currentOrder.timer.clear();
            this.Events.emit(this.EVENTS.COMPLETED, { index: unitInUse.index, itemsDispensed, itemsRequested });
            this.#_Polling = false;
            await this.MotorOff(indexInUse);
        } else {
            this.#_Context.currentOrder.timer.reset();
        }
    }

    /**
     * @param {TypeCoords} param0 
     */
    async OnTimeout({ index }) {
        console.log(`[Storage] dispensing timeout ${new Date().getTime()}`);
        // TODO write a wrapper method that can use Emergency Off in case of an error
        /*let _cur = this.#_ProxyCh.GetValue(this.#_Channels.current);
        let state = (this.#_Channels.current) ? this.CheckCurrent() : ELECTR_CURR_STATE.WORK_OK;// TODO

        switch (state) {
            case ELECTR_CURR_STATE.IDLE:
                this.UpdateStorageContext({ index }, { disable: 'single' });
                break;
            case ELECTR_CURR_STATE.WORK_OK:
                this.UpdateStorageContext({ index }, { dispensed: 1, disable: 'single' });
                break;
            case ELECTR_CURR_STATE.STUCK:
                this.UpdateStorageContext({ index }, { disable: 'single' });
                break;

            default:
                this.UpdateStorageContext({ index }, { disable: 'single' });
                // this.#_Events.emit(this.EVENTS.ERROR); TODO
                break
        }*/
        this.UpdateStorageContext({ index }, { scope: 'single', state: BROKER_STATES.CELLS.STATUS.TAMPER_ERROR });
        this.#_Polling = false;
        await this.MotorOffPhased(index);
        // TODO: сработал тампер который не должен был работать -> вероятно пробой
        this.#_Context.currentOrder.timer.clear();
        // this.Events.emit(this.EVENTS.COMPLETED, { index, itemsDispensed: this.#_Context.currentOrder.itemsDispensed, error: true });
        this.#_Events.emit(this.EVENTS.ERROR, new Fault({ code: FAULTS.TAMPER_ERROR, critical: false }));
    }

    /**
     * @typedef {object} TypeDispensionResult
     * @property {number} itemsDispensed
     * @property {number} itemsRequested
     * @property {boolean} error
     * 
     */

    /**
     * 
     * @param {} param0 
     * @param {TypeDispensionResult} param1 
     * 
     * @returns {}
     */
    OnCompleted(/*{ index, itemsDispensed, error }*/) {
        // TODO log
        this.Idle();
    }

    Idle() {
        this.#_Context.currentOrder = null;
    }

    /**
     * @typedef {object} TypeDispenseRes
     * @property {boolean} ok
     * @property {string|undefined} reason
     */

    /**
     * 
     * @param {object} param0
     * @param {number} param0.index 
     * @param {number} param0.itemsRequested
     * 
     * @returns {Promise<TypeDispenseRes>}
     */
    async Dispense({ index, itemsRequested }) {
        return new Promise((res, rej) => {        
            if (index > this.#_Context.units.length || !(itemsRequested > 0))
                res({ itemsDispensed: 0, error: true });
                // return { ok: false, reason: `Invalid argument` };

            let state = this.CheckCurrent(); 
            if (state != ELECTR_CURR_STATE.IDLE) 
                res({ itemsDispensed: 0, error: true });
            
            if (this.#_Context.currentOrder) {
                res({ itemsDispensed: 0, error: true });
                // return { ok: false, reason: `Busy processing another order` };
            }
            const onErr = fault => { 
                this.#_Events.removeListener(this.EVENTS.ERROR, onErr);
                res({ itemsDispensed: this.#_Context.currentOrder.itemsDispensed, error: true }); 
            }
            const onComplete = ({ index, itemsDispensed, itemsRequested }) => { 
                this.#_Events.removeListener(this.EVENTS.COMPLETED, onComplete);
                res({ index, itemsRequested, itemsDispensed, error: false }); 
            }

            this.#_Events.on(this.EVENTS.ERROR, onErr);
            this.#_Events.on(this.EVENTS.COMPLETED, onComplete);

            this.#_Events.emit(this.EVENTS.DISPENSE_COMMAND, { index, itemsRequested });
        });
    }

    /**
     * @method
     * @description
     * @param {TypeOrder} param0 
     * @param {number} itemsRequested 
     */
    async _Dispense({ index, itemsRequested }) {
        this.#_Context.currentOrder = {
            unitIndex: index,
            itemsRequested: itemsRequested,
            itemsDispensed: 0,
        };

        const onTimeout = (() => this.#_Events.emit(this.EVENTS.ROTATE_TIMEOUT, { index })).bind(this);
        this.#_Context.currentOrder.timer = createTimer(onTimeout, FULL_ROTATION_TIMEOUT).set();
        
        let fault = await this.MotorOn(index);
        if (!fault)
            this.#_Polling = true;
    }

    /**
     * @method
     * @returns {TypeElectrCurrentState|undefined}
     */
    CheckCurrent() {
        /**@type {number|undefined} */
        let currentAmp = this.#_ProxyCh.GetValue(this.#_Channels.current);
        if (typeof currentAmp != 'number')
            return;

        for (let [levelName, [lowLim, highLim]] of Object.entries(CURRENT_RANGE)) {
            if (currentAmp >= lowLim &&currentAmp < highLim)
                return ELECTR_CURR_STATE[levelName];
        }
    }

    /**
     * 
     * @param {object} param0
     * @param {number} param0.index - номер ячейки/спирали 
     * @param {number} param0.dispensed 
     */
    UpdateStorageContext({ index }, { dispensed=0, scope, state }) {
        if (this.#_Context.currentOrder.unitIndex)
            this.#_Context.currentOrder.itemsDispensed++;

        const unit = this.#_Context.units[index];
        unit.itemsDispensed += dispensed;

        if (state) {
            if (scope == 'single') {
                this.#_Context.units[index].outOfService = true;
            } else {
                let { coords: { col, row } } = this.#_Context.units[index];
                
                for (let unit of Object.values(this.#_Context.units)) {
                    if (disable == 'all' || 
                        disable == 'col' && unit.coords.col == col || 
                        disable == 'row' && unit.coords.row == row
                    )
                        unit.state = state;
                }
            }
        }
    }
    
    /**
     * 
     * @param {object} param0
     * @param {number} param0.index - номер ячейки/спирали 
     * @returns {TypeUnit|null}
     */
    GetStorageInfo({ index }) {
        return { ...this.#_Context.units[index] };
    }

    SetOutOfService() {
        // TODO
    }

    /**
     * 
     * @returns {boolean}
     */
    AreAllMotorsOff() {
        return true
    }

    /**
     * 
     * @param {number} index
     * @returns {Promise} 
     */
    async MotorOn(index) {
        let fault = await this.MotorOnPhased(index);
        if (fault) {
            switch (fault.code) {
                case FAULTS.ACTUATOR_NO_POWER:
                    this.UpdateStorageContext({ index }, { scope: 'single', state: BROKER_STATES.CELLS.STATUS.ACTUATOR_NO_POWER });
                    break;
                case FAULTS.IO_DRIVER_ERR:
                    this.UpdateStorageContext({ index }, { scope: 'single', state: BROKER_STATES.CELLS.STATUS.BLOCKED });
                    break;
                
                case FAULTS.ACTUATOR_SHORT_CIRCUIT:
                    this.UpdateStorageContext({ index }, { scope: 'row', state: BROKER_STATES.CELLS.STATUS.BLOCKED });
                    this.UpdateStorageContext({ index }, { scope: 'single', state: BROKER_STATES.CELLS.STATUS.ACTUATOR_SHORT_CIRCUIT });
                    break;

                case FAULTS.IO_PORT_ERR:
                case FAULTS.IO_TIMEOUT:
                    this.UpdateStorageContext({ index }, { scope: 'all', state: BROKER_STATES.CELLS.STATUS.BLOCKED });
                    break;
            }
            this.#_Events.emit(this.EVENTS.ERROR, fault);
        }
    }

    /**
     * 
     * @param {number} index 
     * @returns {Promise<null|Fault>}
     */
    async MotorOnPhased(index) {
        let step = 1;
        let current_0 = this.#_ProxyCh.GetValue(this.#_Channels.current);
        
        let step1Fault = await this.MotorStep('On', { index, step });
        if (step1Fault) 
            return step1Fault;
        await sleep(50);

        let current_1 = this.#_ProxyCh.GetValue(this.#_Channels.current);
        if (!isWithinTolerance(current_0, current_1, 0.05)) {
            // console.log(`Motor [${index}] error: Source switch broken`);
            return new Fault({ code: FAULTS.IO_PORT_ERR, critical: true });
        }
        step = 2;
        let step2Fault = await this.MotorStep('On', { index, step });
        if (step2Fault) 
            return step2Fault;
        await sleep(50);

        let current_2 = this.#_ProxyCh.GetValue(this.#_Channels.current);
        if (isWithinTolerance(current_1, current_2, 0.05)) {
            return new Fault({ code: FAULTS.ACTUATOR_NO_POWER, critical: false });
        }
    }

    /**
     * 
     * @param {number} index 
     * @param {object} param1 
     * @param {boolean} param1.immediate
     * @returns {Promise<null|Fault>}
     */
    async MotorOff(index, param1) {
        let { immediate } = param1 ?? {};
        let fault = immediate ? await this.MotorStep('Off', { index, step: undefined }) : await this.MotorOffPhased(index);
        if (fault) {
            switch (fault.code) {
                case FAULTS.ACTUATOR_NO_POWER:
                    this.UpdateStorageContext({ index }, { scope: 'single', state: BROKER_STATES.CELLS.STATUS.ACTUATOR_NO_POWER });
                    break;
                case FAULTS.IO_DRIVER_ERR:
                    this.UpdateStorageContext({ index }, { scope: 'single', state: BROKER_STATES.CELLS.STATUS.BLOCKED });
                    break;
                
                case FAULTS.IO_PORT_ERR:
                case FAULTS.IO_TIMEOUT:
                    this.UpdateStorageContext({ index }, { scope: 'all', state: BROKER_STATES.CELLS.STATUS.BLOCKED });
                    break;
            }
            this.#_Events.emit(this.EVENTS.ERROR, fault);
        }
        /*let curr = this.#_ProxyCh.GetValue(this.#_Channels.current);
        let noMotorActive = curr < ELECTR_CURR_STATE.WORK_OK[0];
        if (!noMotorActive) {
            debugger;
            let fault2 = await this.MotorStep('Off');
            if (fault2)
                this.OffEmergency();
        }*/
    }

    /**
     * 
     * @param {string} cmd 
     * @param {object} param1
     * @param {number} param1.index 
     * @param {number} param1.step
     * @returns {Promise<null|Fault>}
     */
    async MotorStep(cmd, param1) {
        const { index, step } = param1 ?? {};
        this.#_ProxyCh.SetValue(
            this.#_Channels.matrixCtrlChannel, {
                target: index,
                cmd,
                args: [{ step } ]});
        
        let stepResponse = await this.#_ProxyCh.Events.waitFor(`${this.#_Channels.matrixCtrlChannel}-value`, {
            timeout: MOTOR_RES_MAX_TIME,
        }).catch(() => {
            // throw new Error(`Motor [${index}] error: no response from switch "${this.#_Channels.matrixCtrlChannel}"`);
            return new Fault({ code: FAULTS.IO_TIMEOUT, critical: true });
        });

        if (stepResponse[0].Value.error) {
            return new Fault({ code: FAULTS.IO_DRIVER_ERR, critical: true });
            // throw new Error(step1Response.Value.error);
        }
    }

    /**
     * 
     * @param {number} index 
     * @returns {Promise<null|Fault>}
     */
    async MotorOffPhased(index) {
        let current_0 = this.#_ProxyCh.GetValue(this.#_Channels.current);
        let step = 1;
        let step1Fault = await this.MotorStep('Off', { index, step });
        if (step1Fault) 
            return step1Fault;
        await sleep(30);
        let current_1 = this.#_ProxyCh.GetValue(this.#_Channels.current);
        if (isWithinTolerance(current_0, current_1, 0.05)) {
            // console.log(`Motor [${index} error: Source switch broken`);
            // this.UpdateStorageContext({ index: this.#_Context.currentOrder.unitIndex }, { disable: 'row'})
            return new Fault({ code: FAULTS.LIFT_SHORT_CIRCUIT, critical: true });
        }
        step = 2;
        let step2Fault = await this.MotorStep('Off', { index, step });
        if (step2Fault) 
            return step2Fault;  
    }

    async OffEmergency() {

    }

     /**
     * Converts a linear index to row and column indices.
     * 
     * @param {number} index The linear index (0-based).
     * @returns {{row: number, column: number}} An object containing the row and column.
     */
    IndexToPos(index) {
        let width = this.#_Context.cols;
        return { row: Math.floor(index / width), col: index % width };
    }

    /**
     * @method
     * @param {number} index 
     * @returns {number}
     */
    GetLevel(index) {
        return this.#_Context.rows - Math.floor(index / this.#_Context.cols);
        // let { row } = this.IndexToPos(index);
        // return this.#_Context.rows - row; 
    } 

    Reset() {
        this.#_FSM.Reset();
        this.#_Context.currentOrder = null;
        this.#_Context.currentOrder?.timer?.clear();
        this.#_Context.units = this.#_Context.units.map(u => ({                
            itemsDispensed: 0,
            state: BROKER_STATES.CELLS.STATUS.OK,
            ...u
        }));  
    }
}

// let a = new ClassSpiralSectionStorage({advOpts: {rows:12, cols: 8}});
module.exports = { ClassSpiralSectionStorage };