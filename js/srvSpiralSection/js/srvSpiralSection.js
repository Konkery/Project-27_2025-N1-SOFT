const { EventEmitter2 } = require("eventemitter2");
const { ClassSpiralSectionLift }  = require('./srvSpiralSectionLift');
const { ClassSpiralSectionStorage } = require('./srvSpiralSectionStorage');
const { ClassFSM: FSM } = require('./srvFSM');
const { ClassFault } = require('./srvUtils');
const { FAULTS } = require('./SpiralSectionConstants');
const { default: BaseSectionState } = require("../../srvStatesController/js/srvBaseSectionState");
const ClassDeliveryBox = require("./srvDelieveryBox");
const { AVAILABLE } = require("../../srvStatesController/js/srvStates");

let sleep = require('timers/promises').setTimeout;

const DELAY_BEFORE_DISPENSE = 100;

class ClassSpiralSection extends EventEmitter2 {

    static STATE = {
        IDLE:            'IDLE',
        DISPENSING:      'COLLECTING',
        UNLOADING:       'UNLOADING',
    };

    _Context = { 
        order: null,
        currentTask: null
    };

    #_ProxyCh;
    /** @type {import("./srvSpiralSection.d.ts").TypeSpiralSectionChannels} */
    #_Channels;
    /**@type {EventEmitter2} */
    #_Events = new EventEmitter2();
    /** @type {ClassSpiralSectionLift} */
    #_Lift = null;
    /** @type {ClassSpiralSectionStorage} */
    #_Storage = null;
    /** @type {ClassDeliveryBox} */
    #_Box = null;

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
    /** @type {BaseSectionState} */
    #_SectionState = null;

    #_FSM = new FSM({ stateGraph: this.#_StatesGraph, defaultState: ClassSpiralSection.STATE.IDLE });
    /**
     * 
     * @param {object} param0
     * @param {import("./srvSpiralSection.d.ts").TypeProxyCh} param0.ProxyCh
     * @param {import("./srvSpiralSection.d.ts").TypeSpiralSectionChannels} param0.channels
     * @param {import("./srvSpiralSection.d.ts").TypeSpiralSectionOpts} param0.advOpts
     * @param {import("./srvSpiralSection.d.ts").BaseSectionState} param0.SectionState
     */
    constructor({ ProxyCh, channels, advOpts, SectionState }) {
        super();
        this.#_ProxyCh = ProxyCh;
        this.#_Channels = channels;
        this.#_Lift = new ClassSpiralSectionLift({ ProxyCh, channels: channels.liftChannels, advOpts: advOpts.liftOpts, SectionState });
        this.#_Storage = new ClassSpiralSectionStorage({ ProxyCh, channels: channels.storageChannels, advOpts: advOpts.storageOpts, SectionState });
        this.#_Box = new ClassDeliveryBox({ ProxyCh, channels: channels.boxChannels, advOpts: {}, SectionState });
        this.#_Channels.door = channels.door;
        this.#_SectionState = SectionState;
        this.Init();
    }

    get InWork() { return this._Context.currentTask; }

    /**
     * @returns {import("./srvSpiralSection.d.ts").TypeSpiralSectionEvents}
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
        this._DispenseHandler = this.HandleDispense.bind(this);
        this.#_Storage.Events.on('dispense', this._DispenseHandler);
        this._FailHandler = this.HandleFail.bind(this);
        this.#_Storage.Events.on('fail', this._FailHandler);
    }

    /**
     * 
     * @param {[TypeTransactionCell]} _orders 
     * @returns {Promise}
     */
    async Execute(_orders) {
        return new Promise((res, rej) => {
            if (this._Context.currentTask) 
                return rej(new Error('Выполняется предыдущая операция'));

            if (this.#_FSM.State != ClassSpiralSection.STATE.IDLE) 
                return rej(new Error('Секция не в состоянии покоя'));

            this._Context.currentTask = { res, rej };
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
            if (!this.IsDoorClosed() || !this.#_Box.IsOpened)
                return this.HandleFail(undefined, new ClassFault({ code: FAULTS.DOOR_OPENED }), 'Отказ в начале транзакции');
            
            /** @type {[TypeTransactionCell]} */
            let orders = [..._orders];
            orders.sort((a, b) => a.row - b.row);   //сортировка по убыванию уровня
            try {
                await this.#_Lift.ElevateToBottom();
            } catch (e) {
                return this.HandleFail(undefined, e, 'Ошибка при установке лифта в положение выдачи');
            }
            for (let level of new Set(orders.map(o => this.#_Storage.MaxLevel - o.row))) {
                let testSpiral = orders.find(o => this.#_Storage.MaxLevel - o.row == level && this.#_Storage.IsCheckable(o));
                if (!testSpiral) continue;
                try {
                    this.#_Storage.TestSpiral(testSpiral);
                } catch (e) {
                    continue;
                }
                 
                let ordersOnLevel = orders.filter(o => this.#_Storage.MaxLevel - o.row == level && this.#_Storage.IsOk(o));

                if (ordersOnLevel.length == 0) continue;

                await sleep(1000);
                console.log(`[STORAGE] Команда поднять лифт на уровень ${level}`);
                try {
                    await this.#_Lift.ElevateToLevel(level);
                } catch (e) {
                    this.HandleErr(e, `Ошибка при установке лифта на уровень ${level}`);
                    return;
                }

                for (let order of ordersOnLevel) {
                    await sleep(DELAY_BEFORE_DISPENSE);
                    if (this.#_Storage.IsOk(order)) {
                        console.log(`Order: ${JSON.stringify(order)}`);
                        try {
                            await this.#_Storage.Dispense(order);
                            console.log(`[STORAGE] Выполнена выдача ${JSON.stringify(order)}`);
                        } catch (e) {
                            this.HandleFail(undefined, e, 'Не удалось выполнить выдачу ТМЦ');
                        }
                    } else {
                        console.log(`[STORAGE] Заказ ${JSON.stringify(order)} не будет выполнен в связи со статусом соответствующей ячейки`);
                    }
                }
            }
            
            try {
                console.log(`[LIFT] Для выдачи лифт спускается на 0-й уровень`);
                await this.#_Lift.ElevateToBottom();

            } catch (e) {
                this.HandleErr(e, 'Ошибка при установке лифта в положение выдачи');
            }

            try {
                await this.#_Box.Deliver();
            } catch (e) {
                this.#_SectionState.setAvailable(AVAILABLE.NO);
                this.HandleErr(e, 'Не удалось выполнить выдачу ТМЦ');
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
            this._Context.currentTask?.res?.();
            this._Context.currentTask = null;

        } catch (fault) {
            // this.EmergencyOff();
        }
    }

    Reset() {
        this.#_FSM.Reset();
        this.#_Lift.Reset();
        this.#_Storage.Reset();
        this._Context.currentTask?.rej?.(new Error('Reset'));
        this._Context.currentTask = null;
        this._Context.order = null;
        if (this.openedTimer) clearTimeout(this.openedTimer);
        this.openedTimer = null;

        this.#_Storage.Events.off('dispense', this._DispenseHandler);
        this.#_Storage.Events.off('fail', this._FailHandler);
    }

    HandleDispense(cell) {
        this.emit('result', { cell });
    }

    HandleFail(cell, fault, message) {
        this.emit('fail', { cell, fault, message });
    }
}

module.exports = { ClassSpiralSection };