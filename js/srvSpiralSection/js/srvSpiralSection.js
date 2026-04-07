const { EventEmitter2 } = require("eventemitter2");
const assert = require('assert');
const { ClassSpiralSectionLift }  = require('./srvSpiralSectionLift');
const { ClassSpiralSectionStorage } = require('./srvSpiralSectionStorage');
const { ClassFSM: FSM } = require('./srvFSM');
const { STATES: BROKER_STATES } = require("./srvVendingMachineStates");
const LIFT_STATUS = BROKER_STATES.SECTIONS.LIFT.STATUS;

let sleep = require('timers/promises').setTimeout;

const DELAY_BEFOR_DISPENSE = 100;

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
 * @property {string} OPERATION_START
 * @property {string} DISPENSE_DONE
 * @property {string} UNLOADING_DONE
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
        WAITING_FOR_LIFT:'WAITING_FOR_LIFT',
        OUT_OF_SERVICE:  'OUT_OF_SERVICE',
    };

    #_Context = { };

    #_ProxyCh;
    /** @type {TypeSpiralSectionChannels} */
    #_Channels;
    /**@type {EventEmitter2} */
    #_Events = new EventEmitter2();
    /** @type {ClassSpiralSectionLift} */
    #_Lift = null;
    /** @type {ClassSpiralSectionStorage} */
    #_Storage = null;

    #_StatesGraph = {
        [ClassSpiralSection.STATE.IDLE]: {
            [this.EVENTS.OPERATION_START]: { state: ClassSpiralSection.STATE.DISPENSING, action: this.Run.bind(this) },
            [this.EVENTS.OPEN_BOX]:        { state: ClassSpiralSection.STATE.UNLOADING,  action: this.OpenBox.bind(this) },
        },
        [ClassSpiralSection.STATE.DISPENSING]: {
            [this.EVENTS.DISPENSE_DONE]:   { state: ClassSpiralSection.STATE.UNLOADING, action: this.OpenBox.bind(this) },
        },
        [ClassSpiralSection.STATE.UNLOADING]: { 
            [this.EVENTS.UNLOADING_DONE]:  { state: ClassSpiralSection.STATE.IDLE, action: this.Idle.bind(this) }
        }
    };

    #_FSM = new FSM({ stateGraph: this.#_StatesGraph, defaultState: ClassSpiralSection.STATE.IDLE });
    /**
     * 
     * @param {object} param0
     * @param {TypeProxyCh} param0.ProxyCh
     * @param {TypeSpiralSectionChannels} param0.channels 
     * @param {TypeSpiralSectionOpts} param0.advOpts
     */
    constructor({ ProxyCh, channels, advOpts }) {
        this.#_ProxyCh = ProxyCh;
        this.#_Channels = channels;
        this.#_Lift = new ClassSpiralSectionLift({ ProxyCh, channels: channels.liftChannels, advOpts: advOpts.liftOpts });
        this.#_Storage = new ClassSpiralSectionStorage({ ProxyCh, channels: channels.storageChannels, advOpts: advOpts.storageOpts });
        this.Init();
    }
    /**
     * @returns {TypeSpiralSectionEvents}
     */
    get EVENTS() {
        return {
            OPERATION_START: 'OPERATION_START',
            DISPENSE_DONE: 'DISPENSE_DONE',
            UNLOADING_DONE: 'UNLOADING_DONE',
        }
    }

    get Events() {
        // TODO: return proxy
        return this.#_Events;
    }

    Init() {
        this.#_FSM.Run(this.#_Events, Object.values(this.EVENTS));
    }

    /**
     * @typedef {object} TypeOrder
     * @property {number} index
     * @property {number} itemsRequested
     */
    /**
     * 
     * @param {[TypeOrder]} _orders 
     * @returns {Promise<[TypeOrder]>}
     */
    async Execute(_orders) {
        this.#_Events.emit(this.EVENTS.OPERATION_START, _orders);
        return new Promise((res, rej) => {
            this._ExecPromise = { res, rej };
        }).finally(() => {
            this.#_Events.emit(this.EVENTS.DISPENSE_DONE);
        });
    }

    /**
     * 
     * @param {[TypeOrder]} _orders 
     * @returns {[TypeDispensionResults]}
     */
    async Run(_orders) {
        let orders = [..._orders];
        let orderResults = [];
        orders.sort((a, b) => b.level - a.level);   //сортировка по убыванию уровня
        try {
            await this.#_Lift.ElevateToBaseLevel();
        } catch (e) {
            console.log(`[LIFT]: ошибка ${JSON.stringify(e)}`);
            return this._ExecPromise.res(orderResults);
        }
        for (let level of new Set(orders.map(o => this.#_Storage.GetLevel(o.index)))) {
            await sleep(100);
            console.log(`[STORAGE]: команда поднять лифт на уровень ${level}`);
            try {
                await this.#_Lift.ElevateToLevel(level);
            } catch (e) {
                break;
            }
            for (let order of orders.filter(o => this.#_Storage.GetLevel(o.index) == level)) {

                await sleep(DELAY_BEFOR_DISPENSE);
                console.log(`Order: ${JSON.stringify({ row: Math.floor(order.index / 12), col: order.index % 12 })}`);
                try {
                    debugger;
                    let orderResult = await this.#_Storage.Dispense(order);
                    orderResults.push(orderResult);
                    console.log(`[STORAGE]: выполнена выдача ${JSON.stringify(orderResult)}`);
                } catch {
                    console.log(`[STORAGE]: не удалось выполнить выдачу`);
                }
                // await this.#_Storage.Events.waitFor(this.#_Storage.EVENTS.COMPLETED)
            }
        }
        debugger;
        if (this.#_Lift.State == LIFT_STATUS.OK) try {
            console.log(`[LIFT]: для выдачи лифт спускается на 0-й уровень`);
            await this.#_Lift.ElevateToBaseLevel();
            return this._ExecPromise.res(orderResults);

        } catch (e) {
            console.log(e);
        }
        if (this.#_Lift.MotorOk) try {
            console.log(`[LIFT]: для выдачи лифт спускается на нижний уровень`);
            await this.#_Lift.ElevateToBottom();
            return this._ExecPromise.res(orderResults);
        
        } catch (e) {
            console.log(e);
            console.log(`Не удалось выполнить выдачу ТМЦ`);
            return this._ExecPromise.res(orderResults);
        }
    }

    Idle() {

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
    }
}


module.exports = { ClassSpiralSection };