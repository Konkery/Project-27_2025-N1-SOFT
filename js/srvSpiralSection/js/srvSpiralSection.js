const { EventEmitter2 } = require("eventemitter2");
const { ClassSpiralSectionLift }  = require('./srvSpiralSectionLift');
const { ClassSpiralSectionStorage } = require('./srvSpiralSectionStorage');
const { ClassFSM: FSM } = require('./srvFSM');
const { STATES: BROKER_STATES } = require("./srvVendingMachineStates");
const { ClassFault } = require('./srvUtils');
const { FAULT_DESC_RU } = require('./SpiralSectionConstants');
const { error } = require('console');
const LIFT_STATUS = BROKER_STATES.SECTIONS.LIFT.STATUS;

const SPIRAL_STATUS = BROKER_STATES.CELLS.STATUS;

let sleep = require('timers/promises').setTimeout;

const DELAY_BEFORE_DISPENSE = 100;

/**
 * @typedef {object} TypeTransaction
 * @property {string} ID
 * @property {TypeTransactionTarget} Target
 * @property {string} Command
 * @property {TypeTransactionCell[]} Cells
 */


/**
 * @typedef {object} TypeTransactionTarget
 * @property {string} id
 * @property {string} name
 */

/**
 * @typedef {object} TypeTransactionCell
 * @property {number} row
 * @property {number} column
 * @property {number} quantity
 */

/** 
 * @typedef {object} TypeProxyCh
 * @property {Function} SetValue
 * @property {Function} GetValue
 * @property {any} Value
 * @property {EventEmitter2} Events
 */

/**
 * @typedef {object} TypeSpiralSectionChannels
 * @property {import('./srvSpiralSectionStorage').TypeSpiralSectionStorageChannels} storageChannels
 * @property {import('./srvSpiralSectionLift').TypeSpiralSectionLiftChannels} liftChannels
 */

/**
 * @typedef {object} TypeSpiralSectionOpts
 * @property {import('./srvSpiralSectionStorage').TypeSpiralSectionStorageOpts} storageOpts
 * @property {import('./srvSpiralSectionLift').TypeSpiralSectionLiftOpts} liftOpts
 */

/**
 * @typedef TypeSpiralSectionEvents
 * @property {string} DISPENSE_START
 * @property {string} RESPONSE
 * @property {string} OPERATION_FINISHED
 * @property {string} UNLOADING_DONE
 * @property {string} DISPENSE_START_MOCK
 */

/**
 * @typedef {object} TypeSpiralSectionLiftContext
 * @property {number|undefined} currentLevel
 * @property {number|undefined} requiredLevel
 */

class ClassSpiralSection {

    static STATE = {
        IDLE:            'IDLE',
        DISPENSING:      'COLLECTING',
        UNLOADING:       'UNLOADING',
    };

    #_Context = { 
        order: null,
        currentTask: null
    };

    #_ProxyCh;
    /** @type {TypeSpiralSectionChannels} */
    #_Channels;
    /**@type {EventEmitter2} */
    #_Events = new EventEmitter2();
    /** @type {ClassSpiralSectionLift} */
    #_Lift = null;
    /** @type {ClassSpiralSectionStorage} */
    #_Storage = null;
    /** @type {TypeTransactionTarget} */
    #_Target = null;

    #_StatesGraph = {
        [ClassSpiralSection.STATE.IDLE]: {
            [this.EVENTS.DISPENSE_START]: { state: ClassSpiralSection.STATE.DISPENSING, action: this._Execute.bind(this) },
            [this.EVENTS.OPEN_BOX]:       { state: ClassSpiralSection.STATE.UNLOADING,  action: this.OpenBox.bind(this) },
            [this.EVENTS.DISPENSE_START_MOCK]: { state: ClassSpiralSection.STATE.DISPENSING, action: this._ExecuteMock.bind(this) }
        },
        [ClassSpiralSection.STATE.DISPENSING]: {
            [this.EVENTS.OPERATION_FINISHED]:  { state: ClassSpiralSection.STATE.IDLE, action: this.Idle.bind(this) }
            // [this.EVENTS.DISPENSE_DONE]:  { state: ClassSpiralSection.STATE.UNLOADING, action: this.OpenBox.bind(this) },
        },
        [ClassSpiralSection.STATE.UNLOADING]: { 
            [this.EVENTS.UNLOADING_DONE]: { state: ClassSpiralSection.STATE.IDLE, action: this.Idle.bind(this) }
        }
    };

    #_FSM = new FSM({ stateGraph: this.#_StatesGraph, defaultState: ClassSpiralSection.STATE.IDLE });
    /**
     * 
     * @param {object} param0
     * @param {TypeProxyCh} param0.ProxyCh
     * @param {TypeSpiralSectionChannels} param0.channels
     * @param {TypeSpiralSectionOpts} param0.advOpts
     * @param {TypeTransactionTarget} param0.target
     */
    constructor({ ProxyCh, channels, advOpts, target }) {
        this.#_ProxyCh = ProxyCh;
        this.#_Channels = channels;
        this.#_Lift = new ClassSpiralSectionLift({ ProxyCh, channels: channels.liftChannels, advOpts: advOpts.liftOpts });
        this.#_Storage = new ClassSpiralSectionStorage({ ProxyCh, channels: channels.storageChannels, advOpts: advOpts.storageOpts });
        this.#_Target = target;
        this.Init();
    }

    get Target() { return this.#_Target; }

    /**
     * @returns {TypeSpiralSectionEvents}
     */
    get EVENTS() {
        return {
            DISPENSE_START: 'OPERATION_START',
            OPERATION_FINISHED: 'DISPENSE_DONE',
            UNLOADING_DONE: 'UNLOADING_DONE',
            DISPENSE_START_MOCK: 'DISPENSE_START_MOCK'
        }
    }

    get Events() {
        // TODO: return proxy
        return this.#_Events;
    }

    Init() {
        this.#_Storage.Events.on('dispense', result => this.OnResult(result, false));
    }

    /**
     * @param {TypeTransaction} transaction 
     * @param {object} param0 
     */
    async PerformTransaction(transaction, param0) {
        const { mock } = param0 ?? {}; 
        const { ID, Cells } = transaction;
        this.#_Context.order = { ID, Cells };
        return mock ? this.ExecuteMock(Cells) : this.Execute(Cells);
    }

    /**
     * 
     * @param {TypeTransactionCell} cell 
     * @param {boolean} error 
     * @returns 
     */
    OnResult(cell, errorMessage='') {
        debugger;
        const { ID } = this.#_Context?.order ?? {};
        if (ID) {
            this.RouteResult({
                Response: {
                    ID: crypto.randomUUID(),
                    ParentID: ID,			        // идентификатор транзакции, на которую отвечаем
                    Timestamp: new Date().getTime(),
                    Target: this.#_Target,
                    Cell: cell,
                    Result: errorMessage ? 'FAIL' : 'OK',           
                    Message: errorMessage ? errorMessage : 'Операция выполнена успешно'
                }  
            });
        };
    }

    RouteResult(msg) {
        this.#_Events.emit('response', msg);
    }

    /**
     * 
     * @param {[TypeTransactionCell]} _orders 
     * @returns {Promise}
     */
    async Execute(_orders) {
        return new Promise((res, rej) => {
            if (this.#_Context.currentTask) 
                return rej(new Error('Выполняется предыдущая операция'));

            if (this.#_FSM.State != ClassSpiralSection.STATE.IDLE) 
                return rej(new Error('Секция не в состоянии покоя'));

            this.#_Context.currentTask = { res, rej };
            this.#_FSM.Dispatch(this.EVENTS.DISPENSE_START, _orders);
        });
    }

    /**
     * 
     * @param {[TypeTransactionCell]} _orders 
     * @returns {Promise}
     */
    async _Execute(_orders) {
        try {
            /** @type {[TypeTransactionCell]} */
            let orders = [..._orders];
            orders.sort((a, b) => a.row - b.row);   //сортировка по убыванию уровня
            try {
                await this.#_Lift.ElevateToBaseLevel();
            } catch (e) {
                this.HandleErr(e, 'Ошибка при установке лифта в положение выдачи');
                return;
            }
            for (let level of new Set(orders.map(o => this.#_Storage.MaxLevel - o.row))) {
                await sleep(1000);
                console.log(`[STORAGE] Команда поднять лифт на уровень ${level}`);
                try {
                    await this.#_Lift.ElevateToLevel(level);
                } catch (e) {
                    this.HandleErr(e, `Ошибка при установке лифта на уровень ${level}`);
                    return;
                }
                for (let order of orders.filter(o => this.#_Storage.MaxLevel - o.row == level)) {
                    await sleep(DELAY_BEFORE_DISPENSE);
                    if (this.#_Storage.IsSpiralOk(order)) {
                        console.log(`Order: ${JSON.stringify(order)}`);
                        try {
                            await this.#_Storage.Dispense(order);
                            console.log(`[STORAGE] Выполнена выдача ${JSON.stringify(order)}`);
                        } catch (e) {
                            this.HandleErr(e, 'Не удалось выполнить выдачу ТМЦ');
                        }
                    }
                }
            }

            if (this.#_Lift.State == ClassSpiralSectionLift.STATE.IDLE) {
                let secondTry = false;
                try {
                    console.log(`[LIFT] Для выдачи лифт спускается на 0-й уровень`);
                    await this.#_Lift.ElevateToBaseLevel();
                    return;

                } catch (e) {
                    this.HandleErr(e, 'Ошибка при установке лифта в положение выдачи');
                    secondTry = true;
                }
                /*if (this.#_Lift.MotorOk) */
                if (secondTry) try {
                    console.log(`[LIFT] для выдачи лифт спускается на нижний уровень`);
                    await this.#_Lift.ElevateToBottom();
                
                } catch (e) {
                    this.HandleErr(e, 'Ошибка при установке лифта в нижнее положение');
                }
            }
        } catch (e) {
            this.HandleErr(e, 'Ошибка выполнении транзакции');
        } finally {
            return this.#_FSM.Dispatch(this.EVENTS.OPERATION_FINISHED);
        }
    }

    Idle() {
        // this.#_Context.timer?.clear();
        try {
            this.#_Context.currentTask?.res?.();
            this.#_Context.currentTask = null;

        } catch (fault) {
            // this.EmergencyOff();
        }
    }

    OpenBox() {
        setTimeout(() => {
            this.#_Events.emit(this.EVENTS.UNLOADING_DONE);
        }, 100);
    }

    Reset() {
        this.#_FSM.Reset();
        this.#_Lift.Reset();
        this.#_Storage.Reset();
        this.#_Context.currentTask?.rej?.(new Error('Reset'));
        this.#_Context.currentTask = null;
        this.#_Context.order = null;
    }

    HandleErr(e, prefixMsg) {
        let errMsg = (e instanceof Error) ?
            `${prefixMsg}: ${e.message}.`
            : (e instanceof ClassFault) ?
            `${prefixMsg}: ${FAULT_DESC_RU[e.code]}.`
            : this.OnResult(null, `${prefixMsg}: ошибка не определена.`);
        console.log(`[SPIRAL] ${errMsg}`);
        this.OnResult(null, errMsg);
    }

    /**
     * 
     * @param {[TypeTransactionCell]} _orders 
     * @returns {Promise}
     */
    async ExecuteMock(_orders) {
        return new Promise((res, rej) => {
            if (this.#_Context.currentTask) 
                return rej(new Error('Выполняется предыдущая операция'));

            if (this.#_FSM.State != ClassSpiralSection.STATE.IDLE) 
                return rej(new Error('Секция не в состоянии покоя'));

            this.#_Context.currentTask = { res, rej };
            this.#_FSM.Dispatch(this.EVENTS.DISPENSE_START_MOCK, _orders);
        });
    }

    /**
     * MOCK Execute
     * Выполняет имитацию выдачи:
     *  for order in orders
     *    for i < order.quantity
     *      OnResult(order)
     *      delay 1 sec
     * 
     * @param {[TypeTransactionCell]} _orders 
     */
    async _ExecuteMock(_orders) {
        try {
            /** @type {[TypeTransactionCell]} */
            const orders = [..._orders];
            for (const order of orders) {
                for (let i = 0; i < order.quantity; i++) {
                    console.log(`[MOCK] Dispense row=${order.row}, column=${order.column}, item=${i + 1}/${order.quantity}`);
                    // имитация успешной выдачи
                    this.OnResult({...order, quantity: 1 }, '');

                    // таймаут 1 сек
                    await sleep(1000);
                }
            }

        } catch (e) {
            this.HandleErr(e, 'Ошибка выполнении MOCK транзакции');
        } finally {
            return this.#_FSM.Dispatch(this.EVENTS.OPERATION_FINISHED);
        }
    }
}


module.exports = { ClassSpiralSection };