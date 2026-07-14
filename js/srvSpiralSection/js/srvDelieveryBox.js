const { ClassFSM: FSM } = require('./srvFSM');
const { ClassFault } = require('./srvUtils');
const { BOX_CONSTANTS, FAULTS } = require('./SpiralSectionConstants');
const { default: BaseSectionState } = require("../../srvStatesController/js/srvBaseSectionState");
const { default: SpiralSectionState, DELIVERY_BOX_STATE } = require('./srvSpiralSectionStates');

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
    /** @type {SpiralSectionState} */
    #_SectionState = null;
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
     * @param {BaseSectionState} param0.sectionState
     * @param {import('../../srvLogger/js/srvProxyLogger').ClassProxyLogger} param0.ProxyLogger
     */
    constructor({ ProxyCh, channels, advOpts, sectionState }) {
        this.#_ProxyCh = ProxyCh;
        this._ProxyLogger = advOpts.ProxyLogger;
        this.#_SectionState = sectionState;
        this.#_Channels = channels;
        this.unlockTimeout = BOX_CONSTANTS.UNLOCKED_TIMEOUT_SEC ?? 100;
        this.#_FSM = new FSM({      // TODO clear on reset
            defaultState: ClassDeliveryBox.STATE.CLOSED,
            stateGraph: this.#_StateGraph,
            onStateChanged: (({ state, prevState }) => {
                this._ProxyLogger.Log({ level: 'D', msg: `[BOX] ${prevState} -> ${state}` });
                switch (state) {
                    case ClassDeliveryBox.STATE.OPENED:
                        this.#_SectionState.DeliveryBox = DELIVERY_BOX_STATE.OPENED;
                        break;
                    case ClassDeliveryBox.STATE.CLOSED:
                        this.#_SectionState.DeliveryBox = DELIVERY_BOX_STATE.CLOSED;
                        break;
                }
            }).bind(this)
        });
        this.InitEventHandlers();
    }

    get IsOpened() {
        return this.#_ProxyCh.GetValue(this.#_Channels.optic) != BOX_CONSTANTS.BOX_CLOSED;
        // return this.#_FSM.State == ClassDeliveryBox.STATE.OPENED;
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
        this.SetLockState(BOX_CONSTANTS.UNLOCK_ON);

        this.#_Context.openTimer = setTimeout(() => {

            this.#_FSM.Dispatch(ClassDeliveryBox.EVENTS.TIMEOUT);

        }, this.unlockTimeout*1000);
    }

    OnDoorOpened() {
        if (this.#_Context.openTimer)
            clearTimeout(this.#_Context.openTimer);

        this.#_Context.openTimer = null;
    }

    FinishDelivery() {
        this.keepOpened = setTimeout(
            () => this.SetLockState(BOX_CONSTANTS.UNLOCK_OFF), 
            BOX_CONSTANTS.UNLOCKED_TIMEOUT_SEC / 2 * 1000);
    
        this.#_Context.currentTask?.res();
        this.#_Context.currentTask = null;
    }

    AbortDelivery() {
        this._ProxyLogger.Log({ level: 'I', msg: `[BOX] Таймаут выдачи` });
        this.SetLockState(BOX_CONSTANTS.UNLOCK_OFF);

        this.#_Context.currentTask?.rej(new Error('Лючок не был открыт'));
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

                    if (Value != BOX_CONSTANTS.BOX_CLOSED) {
                        this.#_FSM.Dispatch(ClassDeliveryBox.EVENTS.OPENED);
                    }
                    break;

                case ClassDeliveryBox.STATE.OPENED:

                    if (Value == BOX_CONSTANTS.BOX_CLOSED) {
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

        if (this.keepOpened) {
            clearTimeout(this.keepOpened);
            this.keepOpened = null;
        }

        this.#_Context.openTimer = null;
        this.#_Context.currentTask?.rej?.(new Error('Reset'));
        this.#_Context.currentTask = null;

        this.SetLockState(BOX_CONSTANTS.UNLOCK_OFF);
        this.#_SectionState.DeliveryBox = DELIVERY_BOX_STATE.CLOSED;

        // for (let [eventName, handler] of this.#_DoorHandlers)
        //     this.#_ProxyCh.Events.off(eventName, handler);

        // this.#_DoorHandlers.clear();
    }
}

module.exports = ClassDeliveryBox;