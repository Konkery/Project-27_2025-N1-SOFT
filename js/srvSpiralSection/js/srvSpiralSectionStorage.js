const { EventEmitter2 } = require("eventemitter2");
const { createTimer, isWithinTolerance, ClassFault } = require("./srvUtils");
const { ClassFSM: FSM } = require("./srvFSM");
const { STORAGE_CONSTANSTS, FAULTS } = require("./SpiralSectionConstants");
const { CELL_STATE, MEAS_STATE } = require("../../srvStatesController/js/srvStates");
const { default: SpiralSectionState } = require("./srvSpiralSectionStates");
const { default: StatesController } = require("../../srvStatesController/js/srvSectionStateController");
const STATUS_EXCEPT = [CELL_STATE.ACTUATOR_NO_POWER, CELL_STATE.ACTUATOR_SHORT_CIRCUIT, CELL_STATE.TAMPER_ERROR];

const MOTOR_RES_MAX_TIME = 200;
const TIME_BETWEEN_STEPS = 80;

let sleep = require('timers/promises').setTimeout;

const { ELECTR_CURR_STATE, TAMPER_ON, TAMPER_OFF, CURRENT_RANGE, FULL_ROTATION_TIMEOUT, MONITOR_INTERVAL } = STORAGE_CONSTANSTS;

const STATE = {
    IDLE: 'IDLE',
    DISPENSING: 'COLLECTING ',
    FAULT: 'OUT_OF_SERVICE',
    TESTING: 'TESTING'
}

class ClassSpiralSectionStorage {

    static STATE = STATE;

    /**@type {import("./srvSpiralSection").TypeProxyCh} */
    #_ProxyCh;
    /** @type {import("./srvSpiralSectionStorage").TypeSpiralSectionStorageChannels} */
    #_Channels = null;
    /** @type {StatesController} */
    #_GlobalState = null;
    /** @type {SpiralSectionState} */
    #_SectionState = null;
    /** @type {import("./srvSpiralSectionStorage").TypeSpiralSectionUnitContext} */
    #_Context = {};
    /**@type {EventEmitter2} */
    #_Events = new EventEmitter2();
    #_StatesGraph = {
        [STATE.IDLE]: {
            [this.EVENTS.DISPENSE_COMMAND]: { state: STATE.DISPENSING, action: this._Dispense.bind(this) },
            [this.EVENTS.FAULT]:            { state: STATE.FAULT,   action: this.OnFault.bind(this) },
            [this.EVENTS.TEST_COMMAND]:     { state: STATE.TESTING, action: this._TestSpiral.bind(this) }
        },
        [STATE.DISPENSING]: {
            [this.EVENTS.DISPENSED_SINGLE]: { state: STATE.DISPENSING, action: this.OnDispensedSingle.bind(this) },
            [this.EVENTS.ROTATE_TIMEOUT]:   { state: STATE.DISPENSING, action: this.OnTimeout.bind(this) },
            [this.EVENTS.COMPLETED]:        { state: STATE.IDLE,       action: this.Idle.bind(this) },
            [this.EVENTS.FAULT]:            { state: STATE.FAULT,      action: this.OnFault.bind(this) },
        },
        [STATE.FAULT]: {
            [this.EVENTS.RECOVERED]: { state: STATE.IDLE, action: this.Idle.bind(this) }
        },
        [STATE.TESTING]: {
            [this.EVENTS.TEST_DONE]: { state: STATE.IDLE,  action: this.Idle.bind(this) },
            [this.EVENTS.FAULT]:     { state: STATE.FAULT, action: this.OnFault.bind(this) }
        }
    };
    #_FSM = new FSM({ stateGraph: this.#_StatesGraph, onStateChanged: this.OnStateChanged.bind(this), defaultState: ClassSpiralSectionStorage.STATE.IDLE });
    #_Polling = false;
    #_CurrentWatch = null;
    #_TamperPosWatch = null;
    #_TamperHandlers = new Map();
    /**
     * @param {object} param0
     * @param {import("./srvSpiralSection").TypeProxyCh} param0.ProxyCh
     * @param {import("./srvSpiralSectionStorage").TypeSpiralSectionStorageChannels} param0.channels 
     * @param {import("./srvSpiralSectionStorage").TypeSpiralSectionStorageOpts} param0.advOpts
     * @param {SpiralSectionState} param0.sectionState
     */
    constructor({ ProxyCh, channels, advOpts, sectionState }) {
        this.#_ProxyCh = ProxyCh;
        this.#_Channels = channels;
        this.#_GlobalState = advOpts.globalState;
        this.#_SectionState = sectionState;
        this._BusNumber = advOpts.busNumber;
        let { rows, cols } = advOpts.size;
        this.#_Context = {
            rows,
            cols,
            currentOrder: null,
            units: Array(rows * cols).fill().map((_, i) => ({
                index: i,
                coords: this.IndexToPos(i, cols),
                tamperInd: Math.floor(i / cols),
                itemsLoaded: 999,
                itemsLeft: 999,
                capacity: 999,
                itemsDispensed: 0,
                status: CELL_STATE.OK
            }))
        };
        this.Init();
    }

    /**
     * @getter
     * @returns {import("./srvSpiralSectionStorage").TypeSpiralSectionUnitEvents}
     */
    get EVENTS() {
        return ({
            DISPENSE_COMMAND: 'DISPENSE_COMMAND',
            DISPENSED_SINGLE: 'DISPENSED_SINGLE',
            COMPLETED: 'DISPENSED',
            ROTATE_TIMEOUT: 'ROTATE_TIMEOUT',
            FAULT: 'ERROR',
            RECOVERED: 'RECOVERED',
            TEST_COMMAND: 'TEST_COMMAND',
            TEST_DONE: 'TEST_DONE',
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
     * @param {object} param0
     * @param {number} param0.row
     * @param {number} param0.column 
     * @returns {boolean}
     */
    IsOk({ row, column }) {
        const ind = this.PosToInd({ row, col: column });
        return this.#_SectionState.Cells[ind] == CELL_STATE.OK;
    }

    /**
     * 
     * @param {object} param0
     * @param {number} param0.row
     * @param {number} param0.column 
     * @returns {boolean}
     */
    IsCheckable({ row, column }) {
        const ind = this.PosToInd({ row, col: column });
        return [CELL_STATE.OK, CELL_STATE.TAMPER_BAD_POS].includes(this.#_SectionState.Cells[ind]);
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

    *RowIndexIterator(rowIndex) {
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
        // this.StartCurrentWatch();
    }

    /**
     * @method
     * @description * Инициализирует обработчики событий с тамперов спиралей для определения факта выдачи единицы товара
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
                let i_a = this.#_ProxyCh.GetValue(this.#_Channels.current);

                let index = this.#_Context.currentOrder?.unitIndex;
                const dispensing = this.State == ClassSpiralSectionStorage.STATE.DISPENSING;
                switch (currState) {
                    case ELECTR_CURR_STATE.SHORT:
                        if (this.#_Context.units[index].status != CELL_STATE.ACTUATOR_SHORT_CIRCUIT) {
                            this.#_Context.units[index].status = CELL_STATE.ACTUATOR_SHORT_CIRCUIT;
                            this.#_FSM.Dispatch(this.EVENTS.FAULT, new StorageFault({ code: FAULTS.ACTUATOR_SHORT_CIRCUIT, index }));
                        }
                        break;

                    case ELECTR_CURR_STATE.OVERLOAD:
                        if (this.#_Context.units[index].status == CELL_STATE.OK)
                            this.#_Context.units[index].status = CELL_STATE.OVERLOAD;

                    case ELECTR_CURR_STATE.IDLE:
                        if (dispensing) {
                            noPowerCount++
                            let noPowerConfirmed = noPowerCount == 2; //TODO
                            if (noPowerConfirmed) {
                                // if (short) {}
                                this.#_Context.units[index].status = CELL_STATE.ACTUATOR_NO_POWER;
                                this.#_FSM.Dispatch(this.EVENTS.FAULT, new StorageFault({ code: FAULTS.ACTUATOR_NO_POWER, index }));
                                noPowerCount = 0;
                                //todo maybe add debounce
                            }
                        } else {
                            if (this.#_Context.units[index].status == CELL_STATE.OVERLOAD)
                                this.#_Context.units[index].status = CELL_STATE.OK;
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

    // { state, prevState }
    OnStateChanged(...args) {
        this.#_Events.emit('state', ...args);
    }

    /**
     * @method
     * @description Обработчик события выдачи единицы ТМЦ
     * @param {object} param0
     * @param {number} param0.index 
     */
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
     * @method
     * @description Обработчик таймаута выдачи
     * @param {TypeCoords} param0 
     */
    async OnTimeout({ index }) {
        console.log(`[Storage] Таймаут выдачи: ${index}`);

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
     * @method
     * @description Обработчик ошибок секции
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

    /**
     * @method
     * @description Переход в IDLE состояние 
     */
    async Idle(/*{ index }*/) {
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
     * @method
     * @description Метод для внешнего вызова выдачи товара из спирального механизма
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
     * @description Метод для внешнего вызова проверки спирали
     * @param {number} index 
     * @returns 
     */
    async TestSpiral(index) {
        return new Promise((res, rej) => {
            if (this.#_Context.currentTask) {
                return rej(new Error('[Storage] Выполняется предыдущая операция'));
            }
            this.#_Context.currentTask = { res, rej };
            this.#_FSM.Dispatch(this.EVENTS.TEST_COMMAND, index);
        });
    }

    /**
     * @method
     * @description Внутренний метод выдачи товара из спирального механизма, который вызывается FSM при обработке команды на выдачу
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
     * @description Метод для проверки электрического тока в цепи мотора, который может указывать на различные состояния механизма
     * @returns {TypeElectrCurrentState|undefined}
     */
    CheckCurrent() {
        /**@type {number|undefined} */
        let currentAmp = this.#_ProxyCh.GetValue(this.#_Channels.current);
        if (typeof currentAmp != 'number')
            return;

        for (let [levelName, [lowLim, highLim]] of Object.entries(CURRENT_RANGE)) {
            if (currentAmp >= lowLim && currentAmp < highLim) {
                return ELECTR_CURR_STATE[levelName];
            }
        }
    }

    /**
     * 
     * @param {number} index 
     * @param {'single' | 'row' | 'col' | 'all'} scope 
     */
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
     * @method
     * @description Метод для обновления контекста секции после попытки выдачи товара, который может обновлять количество отгруженных единиц, статус ячеек и тд в зависимости от переданных параметров
     * @param {string} param0.status 
     * @param {Object} param1 
     * @param {number} [param1.dispensed=0] 
     * @param {string} [param1.scope='single'] 
     * @param {import("./srvSpiralSectionStates").SpiralCellStateKeys} param1.status 
     * @param {any[]} [param1.except=[]] 
     */
    UpdateStorageContext({ index }, { dispensed = 0, scope='single', status, except = [] }) {
        if (this.#_Context.currentOrder)
            this.#_Context.currentOrder.itemsDispensed += dispensed;

        for (const unit of this.UnitsByScope(index, scope)) {
            unit.itemsDispensed += dispensed;

            if (status) {
                if (!except.includes(this.#_Context.units[index].status))
                unit.status = status;
                this.#_SectionState.Cells[unit.index] = CELL_STATE[status];
            }
        }
    }


    /**
     * @method
     * @description Метод для получения информации о ячейке/спирали по ее индексу
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
     * @member 
     * @description Метод для поэтапного включения мотора спирального механизма с проверкой тока и сигналов с тамперов для определения факта начала выдачи товара и исправности механизма
     * @param {number} index 
     * @returns {Promise}
     */
    async MotorOnPhased(index) {
        let step = 1;
        let current_0 = this.#_ProxyCh.GetValue(this.#_Channels.current);
        try {
            await this.MotorStep('On', { index, step });

            await sleep(TIME_BETWEEN_STEPS);

            const tamperValue = this.#_ProxyCh.GetValue(this.#_Channels.spiralTamperChannels[row]);
            const shorted = this.IsShorted();
            const current_1 = this.#_ProxyCh.GetValue(this.#_Channels.current);
            const { row } = this.IndexToPos(index);

            await this.MotorOff(index);

            if (shorted) {
                throw new StorageFault({ code: FAULTS.ACTUATOR_SHORT_CIRCUIT, index });
            }
            if (!isWithinTolerance(current_0, current_1, 0.05)) {
                console.log(`[STORAGE] index ${index} error: Source switch broken`);
                throw new StorageFault({ code: FAULTS.IO_PORT_ERR, index });
            }
            if (tamperValue !== TAMPER_ON) {
                console.log(`[STORAGE] Ряд ${row} блокируется из за сигнала ${tamperValue} на тампере (строка ${row})`);
                throw new StorageFault({ code: FAULTS.TAMPER_BAD_POS, index });
            }

            step = 2;
            await this.MotorStep('On', { index, step });

            let current_2 = this.#_ProxyCh.GetValue(this.#_Channels.current);
            if (isWithinTolerance(current_1, current_2, 0.05)) {
                throw new StorageFault({ code: FAULTS.ACTUATOR_NO_POWER, index, critical: false });
            }
        } catch (fault) {
            this.#_FSM.Dispatch(this.EVENTS.FAULT, fault);
        }
    } 

    /**
     * @method

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
     * @method
     * @description Метод для выполнения этапа включения/выключения мотора
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
            throw new StorageFault({ code: FAULTS.IO_TIMEOUT, index });
        });

        if (stepResponse?.[0]?.Value?.error) {
            throw new StorageFault({ code: FAULTS.IO_DRIVER_ERR, index });
        }
    }

    /**
     * @method
     * @description Метод для проверки корректности позиции спирального механизма 
     * @param {number} index 
     * @returns {Promise}
     */
    async _TestSpiral(index) {
        const { row } = this.IndexToPos(index);
        let current_0 = this.#_ProxyCh.GetValue(this.#_Channels.current);
        try {
            await this.MotorStep('On', { index, step: 1 });
        } catch (fault) {
            console.log(`[STORAGE] Ошибка при проверке позиции спирали: ${fault}`);
            throw fault;
        }
        await sleep(TIME_BETWEEN_STEPS);

        const tamperValue = this.#_ProxyCh.GetValue(this.#_Channels.spiralTamperChannels[row]);
        const current_1 = this.#_ProxyCh.GetValue(this.#_Channels.current);
        const shorted = this.IsShorted();

        if (shorted) {
            throw new StorageFault({ code: FAULTS.ACTUATOR_SHORT_CIRCUIT, index });
        }
        if (!isWithinTolerance(current_0, current_1, 0.05)) {
            console.log(`[STORAGE] index ${index} error: Source switch broken`);
            throw new StorageFault({ code: FAULTS.IO_PORT_ERR, index });
        }
        if (tamperValue !== TAMPER_ON) {
            console.log(`[STORAGE] Ряд ${row} блокируется из за сигнала ${tamperValue} на тампере (строка ${row})`);
            throw new StorageFault({ code: FAULTS.TAMPER_BAD_POS, index });
        }

        await this.MotorOff(index);
    }

    /**
     * @method
     * @description Метод для поэтапного выключения мотора спирального механизма с проверкой тока для определения факта окончания выдачи товара и исправности механизма
     * @param {number} index 
     * @returns {Promise}
     */
    async MotorOffPhased(index) {
        let current_0 = this.#_ProxyCh.GetValue(this.#_Channels.current);
        let isIdle = current_0 < CURRENT_RANGE.WORK_OK[0]
        let step = 1;
        await this.MotorStep('Off', { index, step });
        await sleep(SLEEP_BETWEEN_STEPS);

        let current_1 = this.#_ProxyCh.GetValue(this.#_Channels.current);
        if (!isIdle && isWithinTolerance(current_0, current_1, 0.05)) {
            // console.log(`Motor [${index} error: Source switch broken`);
            throw new StorageFault({ code: FAULTS.ACTUATOR_SHORT_CIRCUIT, index });
        }

        step = 2;
        await this.MotorStep('Off', { index, step });
    }

    async OffEmergency() {

    }

    /**
     * @method
     * @returns {boolean}
     */
    IsShorted() {
        return this.#_ProxyCh.GetValue
            ||  this.#_ProxyCh.GetValue(this.#_Channels.short) == STORAGE_CONSTANSTS.SHORT_CH_VAL
            || this.#_ProxyCh.GetValue(this.#_Channels.powerOff) == STORAGE_CONSTANSTS.POWER_OFF_CH_VAL;
    }

    /**
     * @method
     * @description Метод для конвертации линейного индекса в индексы строки и столбца
     * @param {number} index Линейный индекс (0-based).
     * @returns {{row: number, column: number}} Объект, содержащий строку и столбец.
    */
    IndexToPos(index, _width) {
        let width = _width ?? this.#_Context.cols;
        return { row: Math.floor(index / width), col: index % width };
    }

    /**
     * @method
     * @description Метод для конвертации координат ячейки/спирали в ее линейный индекс
     * @param {object} param0
     * @param {number} param0.row
     * @param {number} param0.col    
     * @returns {number}
     */
    PosToInd({ row, col }) {
        return (row * this.#_Context.cols) + col;
    }

    /**
     * @method
     * @description Метод для получения уровня (этажа) спирального механизма по индексу ячейки/спирали
     * @param {number} index 
     * @returns {number}
     */
    GetLevelByIndex(index) {
        return this.#_Context.rows - Math.floor(index / this.#_Context.cols);
    }

    /**
     * @method
     * @description Метод для обновления статуса ячеек в контексте секции в зависимости от типа ошибки, которая произошла при попытке выдачи товара
     * @param {StorageFault} fault 
     */
    UpdateStatus(fault) {
        if (!(fault instanceof StorageFault)) return;
        const { index } = fault;
        if (typeof index != 'number') return;

        switch (fault.code) {
            case FAULTS.TAMPER_ERROR:
                this.UpdateStorageContext({ index }, { scope: 'single', status: CELL_STATE.TAMPER_ERROR });
                break;

            case FAULTS.TAMPER_BAD_POS:
                this.UpdateStorageContext({ index }, { scope: 'row', status: CELL_STATE.TAMPER_BAD_POS, except: STATUS_EXCEPT });
                break;

            case FAULTS.ACTUATOR_NO_POWER:
                this.UpdateStorageContext({ index }, { scope: 'single', status: CELL_STATE.ACTUATOR_NO_POWER });
                break;

            case FAULTS.IO_DRIVER_ERR:
                this.UpdateStorageContext({ index }, { scope: 'single', status: CELL_STATE.BLOCKED });
                break;

            case FAULTS.ACTUATOR_SHORT_CIRCUIT:
                this.UpdateStorageContext({ index }, { scope: 'row', status: CELL_STATE.BLOCKED, except: STATUS_EXCEPT });
                this.UpdateStorageContext({ index }, { scope: 'single', status: CELL_STATE.ACTUATOR_SHORT_CIRCUIT });
                break;

            case FAULTS.IO_PORT_ERR:
            case FAULTS.IO_TIMEOUT:
                this.UpdateStorageContext({ index }, { scope: 'all', status: CELL_STATE.BLOCKED, except: STATUS_EXCEPT });
                break;
        }
    }

    /**
     * @method
     * @description Метод для сброса секции в начальное состояние, который может использоваться при инициализации или после устранения ошибки для восстановления работоспособности секции
     */
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
            status: CELL_STATE.OK,
            ...u
        }));
    }
}

class StorageFault extends ClassFault {
    constructor({ code, critical, index }) {
        super({ code, critical });
        this.index = index;
        this.critical = critical ?? true;
    }
}

module.exports = { ClassSpiralSectionStorage };