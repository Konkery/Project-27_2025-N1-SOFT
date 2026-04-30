const { EventEmitter2 } = require("eventemitter2");
const { createTimer, isWithinTolerance, ClassFault } = require("./srvUtils");
const { ClassFSM: FSM } = require("./srvFSM");
const { STORAGE_CONSTANSTS, FAULTS } = require("./SpiralSectionConstants");
const { STATES: BROKER_STATES } = require("./srvVendingMachineStates");
const { STATUS } = BROKER_STATES.CELLS;
const STATUS_EXCEPT = [STATUS.ACTUATOR_NO_POWER, STATUS.ACTUATOR_SHORT_CIRCUIT, STATUS.TAMPER_ERROR];

const MOTOR_RES_MAX_TIME = 200;

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
 * @property {string} short
 * @property {string} powerOff
 */

/**
 * @typedef {object} TypeSpiralSectionStorageOpts
 * @property {object} size
 * @property {number} size.rows
 * @property {number} size.cols
 */

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
 * @property {string} FAULT
 * @property {string} DISPENSE_RESULT
 * @property {string} RECOVERED
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
 * @property {string} status
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
 */

/**
 * @typedef {object} TypeTask
 * @property {Function} res
 * @property {Function} rej
 */

/**
 * @typedef {object} TypeSpiralSectionUnitContext
 * @property {TypeOrder|null} currentOrder
 * @property {TypeTask} currentTask
 * @property {number} rows
 * @property {number} cols
 * @property {[TypeUnit]} units
 * @property {string} state
 * @property {number} stateChangeTimestamp
 * @property {import("./srvUtils").TypeTimer} dispenseTimer
 * @property {import("./srvUtils").TypeTimer} fallbackTimer
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

const { ELECTR_CURR_STATE, TAMPER_ON, TAMPER_OFF, CURRENT_RANGE, FULL_ROTATION_TIMEOUT, MONITOR_INTERVAL } = STORAGE_CONSTANSTS;

const STATE = {
    IDLE: 'IDLE',
    DISPENSING: 'COLLECTING ',
    FAULT: 'OUT_OF_SERVICE',
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
            [this.EVENTS.DISPENSE_COMMAND]: { state: STATE.DISPENSING, action: this._Dispense.bind(this) },
            [this.EVENTS.FAULT]: { state: STATE.FAULT, action: this.OnFault.bind(this) },
        },
        [STATE.DISPENSING]: {
            [this.EVENTS.DISPENSED_SINGLE]: { state: STATE.DISPENSING, action: this.OnDispensedSingle.bind(this) },
            [this.EVENTS.ROTATE_TIMEOUT]: { state: STATE.DISPENSING, action: this.OnTimeout.bind(this) },
            [this.EVENTS.COMPLETED]: { state: STATE.IDLE, action: this.Idle.bind(this) },
            [this.EVENTS.FAULT]: { state: STATE.FAULT, action: this.OnFault.bind(this) },
        },
        [STATE.FAULT]: {
            [this.EVENTS.RECOVERED]: { state: STATE.IDLE, action: this.Idle.bind(this) }
        }
    };
    #_FSM = new FSM({ stateGraph: this.#_StatesGraph, onStateChanged: this.OnStateChanged.bind(this), defaultState: ClassSpiralSectionStorage.STATE.IDLE });
    #_Polling = false;
    #_CurrentWatch = null;
    #_TamperPosWatch = null;
    #_TamperHandlers = new Map();
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
            units: Array(rows * cols).fill().map((_, i) => ({
                coords: this.IndexToPos(i, cols),
                tamperInd: Math.floor(i / cols),
                itemsLoaded: 999,
                itemsLeft: 999,
                capacity: 999,
                itemsDispensed: 0,
                status: BROKER_STATES.CELLS.STATUS.OK
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
            COMPLETED: 'DISPENSED',
            ROTATE_TIMEOUT: 'ROTATE_TIMEOUT',
            FAULT: 'ERROR',
            RECOVERED: 'RECOVERED'
        });
    }

    get Events() {
        // TODO: add proxy
        return this.#_Events;
    }

    get MaxLevel() { return this.#_Context?.rows; }

    get State() { return this.#_FSM.State; }
    /**
     * 
     * @param {import("./srvSpiralSection").TypeTransactionCell} param0 
     * @returns 
     */
    IsSpiralOk({ row, column }) {
        const ind = this.PosToInd({ row, col: column });
        return this.#_Context.units[ind]?.status == BROKER_STATES.CELLS.STATUS.OK;
    }

    *RowIterator(rowIndex) {
        const { rows, cols, units } = this.#_Context;

        if (rowIndex < 0 || rowIndex >= rows)
            throw new RangeError('rowIndex out of bounds');

        const start = rowIndex * cols;
        const end = start + cols;

        for (let i = start; i < end; i++) {
            yield units[i];
        }
    }

    *ColIterator(colIndex) {
        const { rows, cols, units } = this.#_Context;

        if (colIndex < 0 || colIndex >= cols)
            throw new RangeError('colIndex out of bounds');

        for (let row = 0; row < rows; row++) {
            yield units[row * cols + colIndex];
        }
    }

    Init() {
        this.InitEventHandlers();
        this.StartCurrentWatch();
        // this.StartTamperWatch();
    }

    /**
     * @method
     */
    InitEventHandlers() {
        /** Tamper trigger handler */
        let cachedValues = Array.from({ length: this.#_Channels.spiralTamperChannels.length }).fill(undefined);
        for (let i = 0; i < this.#_Channels.spiralTamperChannels.length; i++) {

            const handler = (({ Value }) => {
                if (this.#_Polling && Value != cachedValues[i] && Value == TAMPER_ON) {
                    console.log(`[Storage] сигнал с тампера спирали`);
                    this.#_FSM.Dispatch(this.EVENTS.DISPENSED_SINGLE, { tamperInd: i });
                }
                cachedValues[i] = Value;
            }).bind(this);
            let eventName = `${this.#_Channels.spiralTamperChannels[i]}-value`;
            this.#_TamperHandlers.set(eventName, handler);
            this.#_ProxyCh.Events.on(eventName, handler);
        }
    }

    StartCurrentWatch() {
        if (this.#_CurrentWatch) clearInterval(this.#_CurrentWatch);
        let noPowerCount = 0;

        this.#_CurrentWatch = setInterval(() => {
            try {
                let currState = this.CheckCurrent();
                let index = this.#_Context.currentOrder?.unitIndex;
                const dispensing = this.State == ClassSpiralSectionStorage.STATE.DISPENSING;
                switch (currState) {
                    case ELECTR_CURR_STATE.SHORT:
                        this.#_Context.units[index].status = BROKER_STATES.CELLS.STATUS.ACTUATOR_SHORT_CIRCUIT;
                        this.#_FSM.Dispatch(this.EVENTS.FAULT, new StorageFault({ code: FAULTS.ACTUATOR_SHORT_CIRCUIT, index, critical: true }));
                        break;

                    case ELECTR_CURR_STATE.OVERLOAD:
                        console.log(`overload index ${index}`);
                        // this.#_Context.units[index].status = BROKER_STATES.CELLS.STATUS.OVERLOAD;

                    case ELECTR_CURR_STATE.IDLE:
                        if (dispensing) {
                            noPowerCount++
                            let noPowerConfirmed = noPowerCount == 2; //TODO
                            if (noPowerConfirmed) {
                                this.#_Context.units[index].status = BROKER_STATES.CELLS.STATUS.ACTUATOR_SHORT_CIRCUIT;
                                this.#_FSM.Dispatch(this.EVENTS.FAULT, new StorageFault({ code: FAULTS.ACTUATOR_NO_POWER, index, critical: true }));
                                noPowerCount = 0;
                                //todo maybe add debounce
                            }
                        }
                        break;
                    default:
                        noPowerCount = 0;
                        break;
                }
            } catch {

            }
        }, MONITOR_INTERVAL);
    }

    StartTamperWatch() {
        if (this.#_TamperPosWatch) clearInterval(this.#_TamperPosWatch);
        const blockedRows = new Set();
        this.#_TamperPosWatch = setInterval(() => {
            if (this.#_FSM.State == ClassSpiralSectionStorage.STATE.IDLE) {

                const rowsTamperValues = this.#_Channels.spiralTamperChannels
                    .map(chName => this.#_ProxyCh.GetValue(chName));

                for (let i = 0; i < rowsTamperValues.length; i++) {
                    const rowTamperOn = rowsTamperValues[i] == TAMPER_ON;
                    if (rowTamperOn) {
                        this.UpdateStorageContext({ index: i }, { scope: 'row', status: BROKER_STATES.CELLS.STATUS.BLOCKED_INVALID_START_POS, except: STATUS_EXCEPT });
                        blockedRows.add(i);
                    } else {
                        if (blockedRows.has(i)) {
                            for (let unit of this.RowIterator(i)) {
                                if (unit.status == STATUS.BLOCKED_INVALID_START_POS) unit.status = STATUS.OK;
                            }
                            blockedRows.delete(i);
                        }
                    }
                }
            }
        }, MONITOR_INTERVAL);
    }

    // { state, prevState }
    OnStateChanged(...args) {
        this.#_Events.emit('state', ...args);
    }

    async OnDispensedSingle({ tamperInd }) {
        console.log(`[STORAGE] Выдана 1 ед. тмц`);
        const indexInUse = this.#_Context.currentOrder.unitIndex;
        const unitInUse = this.#_Context.units[indexInUse];

        // сработал тампер который не должен был работать -> вероятно пробой
        /*if (unitInUse.tamperInd != tamperInd) {
            // await this.MotorOff(indexInUse);
            debugger
        }*/
        const { row, col: column } = unitInUse.coords;
        this.#_Events.emit('dispense', { row, column, quantity: 1 });
        this.#_FSM.Dispatch(this.EVENTS.DISPENSE_RESULT, unitInUse.coords);
        this.UpdateStorageContext({ index: indexInUse }, { dispensed: 1, scope: 'single' });
        const { itemsDispensed, itemsRequested } = this.#_Context.currentOrder;
        // if (itemsDispensed > itemsRequested) TODO: log error
        if (itemsDispensed >= itemsRequested) {
            this.#_Context.dispenseTimer?.clear();
            console.log(`[STORAGE] Сброс таймера (1)`);
            this.#_Polling = false;
            this.#_FSM.Dispatch(this.EVENTS.COMPLETED, { index: indexInUse, itemsDispensed, itemsRequested });
        } else {
            this.#_Context.dispenseTimer?.reset();
            console.log(`[STORAGE] Ресет таймера`);
        }
    }

    /**
     * @param {TypeCoords} param0 
     */
    async OnTimeout({ index }) {
        console.log(`[Storage] Таймаут выдачи: ${index}`);

        this.UpdateStorageContext({ index }, { scope: 'single', status: BROKER_STATES.CELLS.STATUS.TAMPER_ERROR });
        this.#_Polling = false;
        this.#_Context.dispenseTimer?.clear();
        console.log(`[STORAGE] Сброс таймера (2)`);
        this.#_FSM.Dispatch(this.EVENTS.FAULT, new StorageFault({ code: FAULTS.TAMPER_ERROR, index, critical: false }));
    }

    OnCompleted(/*{ index, itemsDispensed, error }*/) {
        // TODO log
        this.Idle();
    }

    /**
     * @param {StorageFault} fault 
     */
    async OnFault(fault) {
        try {
            await this.MotorOff({ force: true });
            this.UpdateStatus(fault);
            if (this.#_Context.currentOrder) {
                const { unitIndex } = this.#_Context.currentOrder;
                const { row, col: column } = this.#_Context.units[unitIndex].coords;
                this.#_Events.emit('fail', { row, column, quantity: 0 }, fault);
            }

            this.#_FSM.Dispatch(this.EVENTS.RECOVERED);

        } catch (innerFault) {
            console.log(`[STORAGE] Inner fault: ${innerFault}`);
            this.EmergencyOff();
        } finally {
            this.#_Context.fallbackTimer?.clear();
            this.#_Context.dispenseTimer?.clear();
            this.#_Context.currentTask?.rej?.(fault);
            this.#_Context.currentTask = null;
        }
    }

    async Idle(/*{ index }*/) {
        // debugger;
        this.#_Context.fallbackTimer?.clear();
        this.#_Context.dispenseTimer?.clear();
        const index = this.#_Context.currentOrder.unitIndex;
        console.log(`[STORAGE] Idle({ index: ${index} })`);
        try {
            await this.MotorOff(index, { force: true });
            this.#_Context.currentTask?.res?.();
            this.#_Context.currentTask = null;
            this.#_Context.currentOrder = null;
            this.#_Context.dispenseTimer = null;

        } catch (fault) {
            this.EmergencyOff();
        }
    }

    EmergencyOff() {

    }

    /**
     * 
     * @param {import("./srvSpiralSection").TypeTransactionCell} order
     * 
     * @returns {Promise}
     */
    async Dispense(order) {
        return new Promise((res, rej) => {
            const index = this.PosToInd({ row: order.row, col: order.column });
            if (index > this.#_Context.units.length || (order.quantity < 1))
                return rej(new Error('[Storage] Невалидные параметры'));

            /*let state = this.CheckCurrent();
            if (state != ELECTR_CURR_STATE.IDLE)
                return rej(new Error(''));*/

            if (this.#_Context.currentTask) {
                return rej(new Error('[Storage] Выполняется предыдущая операция'));
            }
            this.#_Context.currentTask = { res, rej };
            const MAX_TIME = order.quantity * STORAGE_CONSTANSTS.FULL_ROTATION_TIMEOUT * 1.5;
            this.#_Context.fallbackTimer = createTimer(
                () => this.#_FSM.Dispatch(this.EVENTS.FAULT, new StorageFault({ code: FAULTS.NONE })),
                MAX_TIME).set();

            this.#_FSM.Dispatch(this.EVENTS.DISPENSE_COMMAND, order);
        });
    }

    /**
     * @method
     * @description
     * @param {import("./srvSpiralSection").TypeTransactionCell} order 
     */
    async _Dispense(order) {
        const index = this.PosToInd({ row: order.row, col: order.column });
        this.#_Context.currentOrder = {
            unitIndex: index,
            itemsRequested: order.quantity,
            itemsDispensed: 0,
        };

        const onTimeout = (() => this.#_FSM.Dispatch(this.EVENTS.ROTATE_TIMEOUT, { index })).bind(this);
        this.#_Context.dispenseTimer = createTimer(onTimeout, FULL_ROTATION_TIMEOUT).set();

        try {
            await this.MotorOnPhased(index);
            console.log(`[STORAGE] Включен мотор`);
            this.#_Polling = true;
        } catch (fault) {
            console.log(`[STORAGE] Ошибка при включении мотора: ${fault}`);
            this.#_FSM.Dispatch(this.EVENTS.FAULT, fault);
        }
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
            if (currentAmp >= lowLim && currentAmp < highLim) {
                console.log(`${currentAmp} => ${ELECTR_CURR_STATE[levelName]}`);
                return ELECTR_CURR_STATE[levelName];
            }
        }
    }

    *UnitsByScope(index, scope) {
        const { row, col } = this.#_Context.units[index].coords;

        switch (scope) {

            case 'single':
                yield this.#_Context.units[index];
                break;

            case 'row':
                yield* this.RowIterator(row);
                break;

            case 'col':
                yield* this.ColIterator(col);
                break;

            case 'all':
                yield* this.#_Context.units;
                break;

            default:
                throw new Error('Invalid scope');
        }
    }

    /**
     * 
     * @param {object} param0
     * @param {number} param0.dispensed 
     * @param {string} param0.scope 
     * @param {string} param0.status 
     */
    UpdateStorageContext({ index }, { dispensed = 0, scope='single', status, except = [] }) {
        if (this.#_Context.currentOrder)
            this.#_Context.currentOrder.itemsDispensed += dispensed;

        for (const unit of this.UnitsByScope(index, scope)) {
            unit.itemsDispensed += dispensed;

            if (status) {
                if (!except.includes(this.#_Context.units[index].status))
                unit.status = status;
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
     * @param {number} index 
     * @returns {Promise}
     */
    async MotorOnPhased(index) {
        let step = 1;
        // let current_0 = this.#_ProxyCh.GetValue(this.#_Channels.current);

        await this.MotorStep('On', { index, step });

        await sleep(50);

        /*let current_1 = this.#_ProxyCh.GetValue(this.#_Channels.current);
        if (!isWithinTolerance(current_0, current_1, 0.05)) {
            // console.log(`Motor [${index}] error: Source switch broken`);
            throw new StorageFault({ code: FAULTS.IO_PORT_ERR, index, critical: true });
        }*/
        step = 2;
        await this.MotorStep('On', { index, step });

        /*let current_2 = this.#_ProxyCh.GetValue(this.#_Channels.current);
        if (isWithinTolerance(current_1, current_2, 0.05)) {
            throw new StorageFault({ code: FAULTS.ACTUATOR_NO_POWER, index, critical: false });
        }*/
    }

    /**
     * 
     * @param {number} index 
     * @param {object} param1 
     * @param {boolean} param1.force
     * @returns {Promise}
     */
    async MotorOff(index, param1) {
        let { force } = param1 ?? {};
        // return force ? this.MotorStep('Off', { index, step: undefined }) : this.MotorOffPhased(index);
        return this.MotorOffPhased(index);
    }

    /**
     * 
     * @param {string} cmd 
     * @param {object} param1
     * @param {number} param1.index 
     * @param {number} param1.step
     * @returns {Promise}
     */
    async MotorStep(cmd, param1) {
        const { index, step } = param1 ?? {};
        this.#_ProxyCh.SetValue(
            this.#_Channels.matrixCtrlChannel, {
            target: index,
            cmd,
            args: [{ step }]
        });

        let stepResponse = await this.#_ProxyCh.Events.waitFor(`${this.#_Channels.matrixCtrlChannel}-value`, {
            timeout: MOTOR_RES_MAX_TIME,
        }).catch(() => {
            // throw new Error(`Motor [${index}] error: no response from switch "${this.#_Channels.matrixCtrlChannel}"`);
            throw new StorageFault({ code: FAULTS.IO_TIMEOUT, index, critical: true });
        });

        if (stepResponse?.[0]?.Value?.error) {
            throw new StorageFault({ code: FAULTS.IO_DRIVER_ERR, index, critical: true });
            // throw new Error(step1Response.Value.error);
        }
    }

    /**
     * 
     * @param {number} index 
     * @returns {Promise}
     */
    async MotorOffPhased(index) {
        let current_0 = this.#_ProxyCh.GetValue(this.#_Channels.current);
        // let isIdle = current_0 < CURRENT_RANGE.WORK_OK[0]
        let step = 1;
        await this.MotorStep('Off', { index, step });
        await sleep(50);

        /*let current_1 = this.#_ProxyCh.GetValue(this.#_Channels.current);
        if (!isIdle && isWithinTolerance(current_0, current_1, 0.05)) {
            // console.log(`Motor [${index} error: Source switch broken`);
            // this.UpdateStorageContext({ index: this.#_Context.currentOrder.unitIndex }, { disable: 'row'})
            throw new StorageFault({ code: FAULTS.ACTUATOR_SHORT_CIRCUIT, index, critical: true });
        }*/

        step = 2;
        await this.MotorStep('Off', { index, step });
    }

    async OffEmergency() {

    }

    /**
    * Converts a linear index to row and column indices.
    * @param {number} index The linear index (0-based).
    * @returns {{row: number, column: number}} An object containing the row and column.
    */
    IndexToPos(index, _width) {
        let width = _width ?? this.#_Context.cols;
        return { row: Math.floor(index / width), col: index % width };
    }

    PosToInd({ row, col }) {
        return (row * this.#_Context.cols) + col;
    }

    /**
     * @method
     * @param {number} index 
     * @returns {number}
     */
    GetLevelByIndex(index) {
        return this.#_Context.rows - Math.floor(index / this.#_Context.cols);
    }

    /**
     * 
     * @param {StorageFault} fault 
     */
    UpdateStatus(fault) {
        if (!(fault instanceof StorageFault)) return;
        const { index } = fault;
        if (typeof index != 'number') return;

        switch (fault.code) {
            case FAULTS.TAMPER_ERROR:
                this.UpdateStorageContext({ index }, { scope: 'single', status: BROKER_STATES.CELLS.STATUS.TAMPER_ERROR });
                break;

            case FAULTS.ACTUATOR_NO_POWER:
                this.UpdateStorageContext({ index }, { scope: 'single', status: BROKER_STATES.CELLS.STATUS.ACTUATOR_NO_POWER });
                break;

            case FAULTS.IO_DRIVER_ERR:
                this.UpdateStorageContext({ index }, { scope: 'single', status: BROKER_STATES.CELLS.STATUS.BLOCKED });
                break;

            case FAULTS.ACTUATOR_SHORT_CIRCUIT:
                this.UpdateStorageContext({ index }, { scope: 'row', status: BROKER_STATES.CELLS.STATUS.BLOCKED, except: STATUS_EXCEPT });
                this.UpdateStorageContext({ index }, { scope: 'single', status: BROKER_STATES.CELLS.STATUS.ACTUATOR_SHORT_CIRCUIT });
                break;

            case FAULTS.IO_PORT_ERR:
            case FAULTS.IO_TIMEOUT:
                this.UpdateStorageContext({ index }, { scope: 'all', status: BROKER_STATES.CELLS.STATUS.BLOCKED, except: STATUS_EXCEPT });
                break;
        }
    }

    Reset() {
        this.#_FSM.Reset();
        this.#_Context.currentOrder = null;
        this.#_Context.fallbackTimer?.reset();
        this.#_Context.dispenseTimer?.clear();

        if (this.#_TamperPosWatch) clearInterval(this.#_TamperPosWatch);
        this.#_TamperPosWatch = null;

        if (this.#_CurrentWatch) clearInterval(this.#_CurrentWatch);
        this.#_CurrentWatch = null;

        for (let [eventName, handler] of this.#_TamperHandlers) 
            if (eventName && handler) this.#_ProxyCh.Events.off(eventName, handler);
        this.#_TamperHandlers.clear();

        this.#_Context.units = this.#_Context.units.map(u => ({
            itemsDispensed: 0,
            status: BROKER_STATES.CELLS.STATUS.OK,
            ...u
        }));
    }
}

class StorageFault extends ClassFault {
    constructor({ code, critical, index }) {
        super({ code, critical });
        this.index = index;
    }
}

module.exports = { ClassSpiralSectionStorage };