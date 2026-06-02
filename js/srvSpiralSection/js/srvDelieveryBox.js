const { ClassFSM: FSM } = require('./srvFSM');
const { ClassFault } = require('./srvUtils');
const { BOX_CONSTANTS, FAULTS } = require('./SpiralSectionConstants');
const { default: BaseSectionState } = require("../../srvStatesController/js/srvBaseSectionState");

class ClassDeliveryBox {

    static STATE = {
        CLOSED: 'CLOSED',
        UNLOCKING: 'UNLOCKING',
        OPENED: 'OPENED',
    };

    static EVENTS = {
        DELIVER: 'DELIVER',
        OPENED: 'DOOR_OPENED',
        CLOSED: 'DOOR_CLOSED',
        TIMEOUT: 'OPEN_TIMEOUT',
        FINISH: 'FINISH'
    };

    #_FSM;
    #_StateGraph = {
        [ClassDeliveryBox.STATE.CLOSED]: {

            [ClassDeliveryBox.EVENTS.DELIVER]: {
                state: ClassDeliveryBox.STATE.UNLOCKING,
                action: this._Unlock.bind(this)
            }
        },

        [ClassDeliveryBox.STATE.UNLOCKING]: {

            [ClassDeliveryBox.EVENTS.OPENED]: {
                state: ClassDeliveryBox.STATE.OPENED,
                action: this.OnDoorOpened.bind(this)
            },

            [ClassDeliveryBox.EVENTS.TIMEOUT]: {
                state: ClassDeliveryBox.STATE.CLOSED,
                action: this.AbortDelivery.bind(this)
            }
        },

        [ClassDeliveryBox.STATE.OPENED]: {

            [ClassDeliveryBox.EVENTS.CLOSED]: {
                state: ClassDeliveryBox.STATE.CLOSED,
                action: this.FinishDelivery.bind(this)
            }
        }
    };

    #_ProxyCh;
    /** @type {import('./srvSpiralSection').TypeDeliveryBoxChannels} */
    #_Channels = null;
    #_Context = {};
    #_DoorHandlers = new Map();
    /**
     * @param {object} param0
     * @param {TypeProxyCh} param0.ProxyCh
     * @param {import('./srvSpiralSection').TypeDeliveryBoxChannels} param0.channels 
     * @param {object} param0.advOpts
     * @param {BaseSectionState} param0.SectionState
     */
    constructor({ ProxyCh, channels, advOpts, SectionState }) {

        this.#_ProxyCh = ProxyCh;

        this.#_Channels = channels;
        this.unlockTimeoutMs = advOpts.unlockTimeoutMs ?? 100000;

        this.#_FSM = new FSM({
            defaultState: DeliveryBox.STATE.CLOSED,
            stateGraph: this.#_StateGraph
        });

        this.InitSubscriptions();
    }

    get IsOpened() {
        return this.#_FSM.State == ClassDeliveryBox.STATE.OPENED;
    }

    async Deliver() {
        return new Promise((res, rej) => {

            if (this.#_Context.currentTask)
                return rej(new Error('[BOX] Выполняется предыдущая операция'));

            if (this.#_FSM.State !== ClassDeliveryBox.STATE.CLOSED)
                return rej(new Error('[BOX] Invalid delivery box state'));

            this.#_Context.currentTask = { res, rej };

            this.#_FSM.Dispatch(ClassDeliveryBox.EVENTS.DELIVER);
        });
    }

    _Unlock() {
        console.log('[BOX] unlock start');

        this.SetLockState(BOX_CONSTANTS.UNLOCK_ON);

        this.#_Context.openTimer = setTimeout(() => {

            this.#_FSM.Dispatch(ClassDeliveryBox.EVENTS.TIMEOUT);

        }, this.unlockTimeoutMs);
    }

    OnDoorOpened() {
        console.log('[BOX] box opened');

        if (this.#_Context.openTimer)
            clearTimeout(this.#_Context.openTimer);

        this.#_Context.openTimer = null;
    }

    FinishDelivery() {
        this.SetLockState(BOX_CONSTANTS.UNLOCK_OFF);

        this.#_Context.currentTask?.res();
        this.#_Context.currentTask = null;
    }

    AbortDelivery() {
        console.log('[BOX] Таймаут выдачи');
        this.SetLockState(BOX_CONSTANTS.UNLOCK_OFF);

        this.#_Context.currentTask?.rej(new Error('Door was not opened'));
        this.#_Context.currentTask = null;
    }

    SetLockState(value) {
        if (!this.#_Channels.lock)
            return;

        this.#_ProxyCh.SetValue(this.#_Channels.lock, value);
    }

    InitEventHandlers() {
        let cachedDoorValue = undefined;
        const handler = (({ Value }) => {

            if (Value === cachedDoorValue)
                return;

            cachedDoorValue = Value;

            switch (this.#_FSM.State) {

                case ClassDeliveryBox.STATE.UNLOCKING:

                    if (Value === ClassDeliveryBox.STATE.OPENED) {
                        console.log('[BOX] Люк был открыт');
                        this.#_FSM.Dispatch(ClassDeliveryBox.EVENTS.OPENED);
                    }
                    break;

                case ClassDeliveryBox.STATE.OPENED:

                    if (Value === ClassDeliveryBox.STATE.CLOSED) {
                        console.log('[BOX] Люк был закрыт');
                        this.#_FSM.Dispatch(ClassDeliveryBox.EVENTS.CLOSED);
                    }

                    break;
            }
        }).bind(this);

        const eventName = `${this.#_Channels.optic}-value`;

        this.#_DoorHandlers.set(eventName, handler);
        this.#_ProxyCh.Events.on(eventName, handler);
    }

    Reset() {
        this.#_FSM.Reset();

        if (this.#_Context.openTimer)
            clearTimeout(this.#_Context.openTimer);

        this.#_Context.openTimer = null;

        this.#_Context.currentTask = null;

        this.SetLockState(BOX_CONSTANTS.UNLOCK_OFF);

        for (let [eventName, handler] of this.#_DoorHandlers)
            this.#_ProxyCh.Events.off(eventName, handler);

        this.#_DoorHandlers.clear();
    }
}

module.exports = ClassDeliveryBox;