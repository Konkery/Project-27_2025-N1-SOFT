const { EventEmitter2 } = require("eventemitter2");
const { createTimer, ClassFault: Fault, isWithinTolerance } = require("./srvUtils");
const { ClassFSM: FSM } = require("./srvFSM");
const { LIFT_CONSTANTS, FAULTS, STORAGE_CONSTANSTS } = require("./SpiralSectionConstants");
const { STATES: BROKER_STATES } = require("./srvVendingMachineStates");
const LIFT_STATUS = BROKER_STATES.SECTIONS.LIFT.STATUS;
let sleep = require('timers/promises').setTimeout;
/** 
 * @typedef {object} TypeProxyCh
 * @property {Function} SetValue
 * @property {Function} GetValue
 * @property {EventEmitter2} Events
 */

/**
 * @typedef {object} TypeSpiralSectionLiftChannels
 * @property {string} liftMotorCtrl
 * @property {[string]} liftBottomTamper
 * @property {string} liftLevelSensor
 * @property {string} current
 * @property {string} short
 */

/**
 * @typedef {object} TypeSpiralSectionLiftOpts
 * @property {number} maxLevel
 * 

/**
 * @typedef TypeSpiralSectionLiftEvents
 * @property {string} IDLE
 * @property {string} ELEVATE_TO_BASE_COMMAND
 * @property {string} ELEVATE_TO_BOTTOM_COMMAND
 * @property {string} BOTTOM_LEVEL_REACHED
 * @property {string} COLLECT_LEVEL_REACHED
 * @property {string} BASE_LEVEL_REACHED
 * @property {string} ELEVATE_COMMAND
 * @property {string} ELEVATE_TIMEOUT
 * @property {string} FAULT
 */

/**
 * @typedef {object} TypeTask
 * @property {Function} res
 * @property {Function} rej
 */

/**
 * @typedef {object} TypeSpiralSectionLiftContext
 * @property {number|undefined} currentLevel
 * @property {number|undefined} requiredLevel
 * @property {string} status
 * @property {TypeTask} currentTask
 * @property {import("./srvUtils").TypeTimer} timer
 * @property {import("./srvUtils").TypeTimer} fallbackTimer
 */

const { LIFT_BOTTOM_TAMPER_ON, 
    LIFT_BOTTOM_TAMPER_DEBOUNCE,
    // DOUBLE_TRIGGER_WINDOW, 
    ELEVATE_NEXT_MAX_TIME, 
    ELECTR_CURR_STATE,
    CURRENT_RANGE,
    MONITOR_INTERVAL } = LIFT_CONSTANTS;

class ClassSpiralSectionLift {
    static STATE = {
        IDLE:                 'IDLE',
        ELEVATING_TO_COLLECT: 'ELEVATING_TO_COLLECT',
        ELEVATING_TO_BOTTOM:  'ELEVATING_TO_BOTTOM',
        ELEVATING_TO_BASE:    'ELEVATING_TO_BASE',
        FAULT:                'FAULT',
    };
    /**@type {TypeProxyCh} */
    #_ProxyCh;
    /** @type {TypeSpiralSectionLiftChannels} */
    #_Channels = null;
    /** @type {TypeSpiralSectionLiftContext} */
    #_Context = {
        currentLevel: undefined,
        status: BROKER_STATES.SECTIONS.LIFT.STATUS.OK
        
    };
    #_CurrentWatch = null;
    /**@type {EventEmitter2} */
    #_Events = new EventEmitter2(); 
    
    #_StatesGraph = {
        [ClassSpiralSectionLift.STATE.IDLE]: {
            [this.EVENTS.ELEVATE_TO_BOTTOM_COMMAND]: { state: ClassSpiralSectionLift.STATE.ELEVATING_TO_BOTTOM,  action: this._ElevateToBottom.bind(this) },
            [this.EVENTS.ELEVATE_TO_BASE_COMMAND]:   { state: ClassSpiralSectionLift.STATE.ELEVATING_TO_BASE,    action: this._ElevateToBottom.bind(this) },
            [this.EVENTS.ELEVATE_COMMAND]:           { state: ClassSpiralSectionLift.STATE.ELEVATING_TO_COLLECT, action: this._ElevateToLevel.bind(this) },
            [this.EVENTS.FAULT]:                     { state: ClassSpiralSectionLift.STATE.FAULT,                action: this.OnFault.bind(this)},
            // [this.EVENTS.BOTTOM_LEVEL_REACHED]:      { state: ClassSpiralSectionLift.STATE.FAULT,                
        },
        [ClassSpiralSectionLift.STATE.ELEVATING_TO_BOTTOM] : {
            [this.EVENTS.BOTTOM_LEVEL_REACHED]: { state: ClassSpiralSectionLift.STATE.IDLE,                action: this.Idle.bind(this) },
            [this.EVENTS.ELEVATE_TIMEOUT]:      { state: ClassSpiralSectionLift.STATE.ELEVATING_TO_BOTTOM, action: this.OnElevateTimeout.bind(this) },
            [this.EVENTS.FAULT]:                { state: ClassSpiralSectionLift.STATE.FAULT,               action: this.OnFault.bind(this)}
        }, 
        [ClassSpiralSectionLift.STATE.ELEVATING_TO_BASE]: {
            [this.EVENTS.BOTTOM_LEVEL_REACHED]: { state: ClassSpiralSectionLift.STATE.ELEVATING_TO_BASE, action: this.ElevateUpToBaseLevel.bind(this) },
            [this.EVENTS.BASE_LEVEL_REACHED]:   { state: ClassSpiralSectionLift.STATE.IDLE,              action: this.Idle.bind(this) },
            [this.EVENTS.ELEVATE_TIMEOUT]:      { state: ClassSpiralSectionLift.STATE.ELEVATING_TO_BASE, action: this.OnElevateTimeout.bind(this) },
            [this.EVENTS.FAULT]:                { state: ClassSpiralSectionLift.STATE.FAULT,             action: this.OnFault.bind(this)}
        
        },
        [ClassSpiralSectionLift.STATE.ELEVATING_TO_COLLECT]: {
            [this.EVENTS.COLLECT_LEVEL_REACHED]: { state: ClassSpiralSectionLift.STATE.IDLE,                 action: this.Idle.bind(this) },
            [this.EVENTS.ELEVATE_TIMEOUT]:       { state: ClassSpiralSectionLift.STATE.ELEVATING_TO_COLLECT, action: this.OnElevateTimeout.bind(this) },
            [this.EVENTS.FAULT]:                 { state: ClassSpiralSectionLift.STATE.FAULT,                action: this.OnFault.bind(this)}
        },
        [ClassSpiralSectionLift.STATE.FAULT]: {
            [this.EVENTS.ELEVATE_TO_BOTTOM_COMMAND]: { state: ClassSpiralSectionLift.STATE.ELEVATING_TO_BOTTOM,  action: this._ElevateToBottom.bind(this) },
        }
    };
    #_FSM = new FSM({ stateGraph: this.#_StatesGraph, defaultState: ClassSpiralSectionLift.STATE.IDLE, onStateChanged: this.OnStateChanged.bind(this) });
    #_TamperHandlers = new Map();
    #_LevelHandler = null;
    #_LevelCachedValue = undefined;

    /**
     * 
     * @param {object} param0
     * @param {TypeProxyCh} ProxyCh
     * @param {TypeSpiralSectionLiftChannels} channels
     * @param {TypeSpiralSectionLiftOpts} param0.advOpts 
     */
    constructor({ ProxyCh, channels, advOpts }) {
        this.#_ProxyCh = ProxyCh;
        this.#_Channels = channels;
        this.Init();
    }

    /**
     * @returns {TypeSpiralSectionLiftEvents}
     */
    get EVENTS() {
        return ({
            IDLE:                   'IDLE',
            ELEVATE_TO_BASE_COMMAND:'ELEVATE_TO_BASE_COMMAND',
            ELEVATE_TO_BOTTOM_COMMAND: 'ELEVATE_TO_BOTTOM_COMMAND',
            BOTTOM_LEVEL_REACHED:   'BOTTOM_LEVEL_REACHED',
            BASE_LEVEL_REACHED:     'BASE_LEVEL_REACHED',
            COLLECT_LEVEL_REACHED:  'COLLECT_LEVEL_REACHED',
            ELEVATE_COMMAND:        'ELEVATE_COMMAND',
            ELEVATE_TIMEOUT:        'ELEVATE_TIMEOUT',
            FAULT:                  'FAULT',
        });
    }

    get State() {
        return this.#_FSM.State;
    }

    get Status() {
        return this.#_Context.status;
    }

    get Level() {
        return this.#_Context.currentLevel;
    }

    get MotorOk() {
        return this.Status == LIFT_STATUS.OK || 
            this.Status == LIFT_STATUS.TAMPER_ERROR || 
            this.Status == LIFT_STATUS.LEVEL_ERROR || 
            this.Status == LIFT_STATUS.OVERLOAD 
    } 

    get Events() {
        // TODO return proxy
        return this.#_Events;
    }

    Init() {
        this.InitEventHandlers();
        this.Stop({ force: true }).catch(e => console.log('[LIFT] Не удалось выполнить reset мотора', e));
    }

    InitEventHandlers() {
        this.SetTamperHandlers();
        this.SetLevelHandler();
        // this.StartCurrentWatch();
    }

    SetTamperHandlers() {
        /** Bottom tamper handler */
        const eventName = `${this.#_Channels.liftBottomTamper}-value`;
        let tamperCachedValue = undefined;
        let debounce = null;

        const handler = (({ Value }) => {
            if (Value != tamperCachedValue && Value == LIFT_BOTTOM_TAMPER_ON && !debounce) {
                this.#_Context.timer?.clear();
                console.log(`[LIFT] обновлен сигнал на тампере: ${Value}`);
                debounce = setTimeout(() => {
                    debounce = null;
                }, LIFT_BOTTOM_TAMPER_DEBOUNCE);
                this.#_FSM.Dispatch(this.EVENTS.BOTTOM_LEVEL_REACHED);
            };
            tamperCachedValue = Value;
        }).bind(this);
        this.#_TamperHandlers.set(eventName, handler);
        this.#_ProxyCh.Events.on(eventName, handler);
    }

    SetLevelHandler() {
        /** New level handler */
        const levelValueEventName = `${this.#_Channels.liftLevelSensor}-value`;
        this.#_LevelHandler = this.HandleLevel.bind(this);

        this.#_ProxyCh.Events.on(levelValueEventName, this.#_LevelHandler);
    }

    HandleLevel({ Value }) {
        if (Value == this.#_LevelCachedValue) return;
        this.#_LevelCachedValue = Value;
        if (Value == LIFT_BOTTOM_TAMPER_ON) {
            /*if (this.#_FSM.State == ClassSpiralSectionLift.STATE.IDLE) {
                console.log(`[LIFT] Сигнал датчика уровня но лифт в IDLE`);
                this.#_FSM.Dispatch(this.EVENTS.FAULT, new Fault({ code: FAULTS.LIFT_CTRL_UNDEFINED }));
            }*/

            if (this.#_FSM.State == ClassSpiralSectionLift.STATE.ELEVATING_TO_COLLECT || 
                this.#_FSM.State == ClassSpiralSectionLift.STATE.ELEVATING_TO_BASE ||
                this.#_FSM.State == ClassSpiralSectionLift.STATE.ELEVATING_TO_BOTTOM
            ) {
                let motorState = this.#_ProxyCh.GetValue(this.#_Channels.liftMotorCtrl);
                if (motorState.cmd == 'Forward')
                    this.#_Context.currentLevel++;
                if (motorState.cmd == 'Reverse')
                    this.#_Context.currentLevel--;

                console.log(`[LIFT DRIVER] Уровень лифта: ${this.#_Context.currentLevel}`);
                if (this.#_Context.currentLevel == this.#_Context.requiredLevel) {
                    this.#_Context.timer?.clear();
                    if (this.#_Context.currentLevel == 0)
                        this.#_FSM.Dispatch(this.EVENTS.BASE_LEVEL_REACHED);
                    else
                        this.#_FSM.Dispatch(this.EVENTS.COLLECT_LEVEL_REACHED);
                } 
            }  

            this.#_Context.timer?.reset();
        }
    }

    StartCurrentWatch() {
        if (this.#_CurrentWatch) clearInterval(this.#_CurrentWatch);
        let noPowerCount = 0;

        this.#_CurrentWatch = setInterval(() => {

            const isElevating = this.State == ClassSpiralSectionLift.STATE.ELEVATING_TO_COLLECT
                            || this.State == ClassSpiralSectionLift.STATE.ELEVATING_TO_BASE
                            || this.State == ClassSpiralSectionLift.STATE.ELEVATING_TO_BOTTOM;

            let currState = this.CheckCurrent();
        
            switch (currState) {
                case ELECTR_CURR_STATE.OVERLOAD:
                    this.#_Context.status = LIFT_STATUS.OVERLOAD;
                    break;

                case ELECTR_CURR_STATE.IDLE:
                    if (isElevating) {
                        noPowerCount++;
                        if (noPowerCount == 2) {
                            this.#_FSM.Dispatch(this.EVENTS.FAULT, new Fault({ code: FAULTS.LIFT_NO_POWER, critical: true }));
                            this.#_Context.status = LIFT_STATUS.NO_POWER;
                        }
                    }
                    break;

                case ELECTR_CURR_STATE.SHORT:
                    this.#_Context.status = LIFT_STATUS.SHORT_CIRCUIT;
                    this.#_FSM.Dispatch(this.EVENTS.FAULT, new Fault({ code: FAULTS.LIFT_SHORT_CIRCUIT, critical: true }));
                    break;

                default:
                    noPowerCount = 0;
                    break;
            }
        }, MONITOR_INTERVAL);
    }

    async ElevateToBaseLevel() {
        return new Promise((res, rej) => {
            if (this.#_Context.currentTask)
                return rej();

            this.#_Context.currentTask = { res, rej };
            // const FALLBACK_TIMEOUT = 
            /*this.#_Context.fallbackTimer = createTimer(
                () => this.#_FSM.Dispatch(this.EVENTS.FAULT, new Fault({ code: FAULTS.NONE }),
                LIFT_CONSTANTS.ELEVATE_NEXT_MAX_TIME * 10));*/
            this.#_FSM.Dispatch(this.EVENTS.ELEVATE_TO_BASE_COMMAND);
        });
    }

    async ElevateToBottom() {
        return new Promise((res, rej) => {
            if (this.#_Context.currentTask)
                return rej();
            this.#_Context.currentTask = { res, rej };
            this.#_FSM.Dispatch(this.EVENTS.ELEVATE_TO_BOTTOM_COMMAND);
        });
    }

    EmergencyOff() {}

    async ElevateUpToBaseLevel() {
        console.log(`[LIFT] Переключение полярности`);
        try {
            this.Stop();
        } catch (fault) {
            this.#_FSM.Dispatch(this.EVENTS.FAULT, fault);
        }
        await sleep(200);
        this.#_Context.currentLevel = -1;
        this.#_Context.requiredLevel = 0;

        try {
            await this.ElevateUp();
            console.log(`ElevateUp()`);
            this.#_Context.timer = createTimer(this.OnTimeout.bind(this), ELEVATE_NEXT_MAX_TIME).set(); 
        } catch (fault) {
            this.#_FSM.Dispatch(this.EVENTS.FAULT, fault);
        }
    }  

    async ElevateToLevel(requiredLevel) {
        return new Promise((res, rej) => {
            if (this.#_Context.currentTask)
                return rej('[LIFT] Выполняется предыдущая операция');

            this.#_Context.currentTask = { res, rej };
            this.#_FSM.Dispatch(this.EVENTS.ELEVATE_COMMAND, requiredLevel);
        });
    }

    async _ElevateToLevel(requiredLevel) {
        this.#_Context.requiredLevel = requiredLevel;
        const startLevel = this.#_Context.currentLevel; 

        if (startLevel == requiredLevel) return;

        const up = startLevel < requiredLevel;
        
        this.#_Context.timer?.clear?.();
        try {
            up ? await this.ElevateUp() : await this.ElevateDown();
            console.log(up ? `await this.ElevateUp()` : `await this.ElevateDown()`);
            this.#_Context.timer = createTimer(this.OnTimeout.bind(this), ELEVATE_NEXT_MAX_TIME).set();
        } catch (fault) {
            this.#_FSM.Dispatch(this.EVENTS.FAULT, fault); 
        }           
    }

    OnTimeout() {
        this.#_FSM.Dispatch(this.EVENTS.ELEVATE_TIMEOUT);
    }

    async OnElevateTimeout() {
        console.log(`[LIFT] Timeout`);
        let currState = this.CheckCurrent();
    
        switch (currState) {
            case ELECTR_CURR_STATE.OVERLOAD:
                this.#_Context.timer?.clear();
                if ((this.#_Context.currentLevel == 0 || this.#_Context.currentLevel == undefined) && this.#_Context.requiredLevel == -1) {
                    console.log(`[LIFT] Bottom reached, tamper or jam fault`);
                    this.#_FSM.Dispatch(this.EVENTS.FAULT, new Fault({ code: FAULTS.BOTTOM_TAMPER_FAIL, critical: false }));
                } else {
                    console.log(`[LIFT] Lift is stuck`);
                    this.#_FSM.Dispatch(this.EVENTS.FAULT, new Fault({ code: FAULTS.LIFT_OVERLOAD, critical: true }));
                    this.#_Context.status = LIFT_STATUS.OVERLOAD;
                }
                break;
            case ELECTR_CURR_STATE.IDLE:
                this.#_FSM.Dispatch(this.EVENTS.FAULT, new Fault({ code: FAULTS.LIFT_NO_POWER, critical: true }));
                this.#_Context.status = LIFT_STATUS.NO_POWER;
                break;
            case ELECTR_CURR_STATE.WORK_OK:
                // log motor/mech fault
                this.#_Context.status = LIFT_STATUS.LEVEL_ERROR;
                this.#_FSM.Dispatch(this.EVENTS.FAULT, new Fault({ code: FAULTS.LEVEL_SENSOR_FAIL, critical: false }));
                break;
            case ELECTR_CURR_STATE.SHORT:
                this.#_Context.status = LIFT_STATUS.SHORT_CIRCUIT;
                this.#_FSM.Dispatch(this.EVENTS.FAULT, new Fault({ code: FAULTS.LIFT_SHORT_CIRCUIT, critical: true }));
                break;
            default:
                break;
        }
    }

    async _ElevateToBottom() {
        this.#_Context.requiredLevel = -1;
        if (this.#_ProxyCh.GetValue(this.#_Channels.liftBottomTamper) == LIFT_CONSTANTS.LIFT_BOTTOM_TAMPER_ON)
            this.#_FSM.Dispatch(this.EVENTS.BOTTOM_LEVEL_REACHED);
        try {
            await this.ElevateDown();
            console.log(`ElevateDown()`);
            this.#_Context.timer?.clear();
            if (this.#_Context.status != LIFT_STATUS.LEVEL_ERROR)
                this.#_Context.timer = createTimer(this.OnTimeout.bind(this), ELEVATE_NEXT_MAX_TIME).set();

        } catch (fault) {
            this.#_FSM.Dispatch(this.EVENTS.FAULT, fault);
        }
    }
    /**
     * @returns {Promise<Fault | null>}
     */    
    async ElevateUp() {
        return this.Elevate({ cmd: 'Forward' });   
    }
    /**
     * @returns {Promise<Fault | null>}
     */
    async ElevateDown() {
        return this.Elevate({ cmd: 'Reverse' });
    }

    /**
     * 
     * @param {object} param0
     * @param {string} param0.cmd 
     * @returns 
     */
    async Elevate({ cmd }) {
        // if (!['Forward', 'Reverse'].includes(cmd))

        await this.Stop({ force: true });
        
        await sleep(50);
        /*let current_0 = this.#_ProxyCh.GetValue(this.#_Channels.current);
        if (current_0 >= ELECTR_CURR_STATE.WORK_OK[0]) 
            throw new Fault({ code: FAULTS.LIFT_CTRL_UNDEFINED, critical: true });*/

        let step = 1;
        await this.MotorStep(cmd, { step });
            
        await sleep(50);
        /*if (this.CheckShortCircuit())
            throw new Fault({ code: FAULTS.LIFT_SHORT_CIRCUIT, critical: true });*/

        /*let current_1 = this.#_ProxyCh.GetValue(this.#_Channels.current);
        if (!isWithinTolerance(current_0, current_1, 0.05)) {   // пробой 
            // console.log(`[LIFT] Current significantly changed (${current_0} -> ${current_1}) after On({ step: 1 })"`);
            throw new Fault({ code: FAULTS.IO_PORT_ERR, critical: true });
        }*/

        step = 2;
        await this.MotorStep(cmd, { step });

        await sleep(50);   

        /*if (this.CheckShortCircuit())
            throw new Fault({ code: FAULTS.LIFT_SHORT_CIRCUIT, critical: true });*/

        /*let current_2 = this.#_ProxyCh.GetValue(this.#_Channels.current);
        if (isWithinTolerance(current_1, current_2, 0.05)) {
            console.log(`1 ${current_1} -> ${current_2}`);
            throw new Fault({ code: FAULTS.LIFT_NO_POWER, critical: true });    // пробой 
        }*/
    }

    /**
     * 
     * @param {Fault} fault 
     */
    UpdateStatus(fault) {

        switch (fault.code) {
            case FAULTS.BOTTOM_TAMPER_FAIL:
                this.#_Context.status = LIFT_STATUS.TAMPER_ERROR;
                break;
            case FAULTS.IO_DRIVER_ERR:
                this.#_Context.status = LIFT_STATUS.BLOCKED;
                break;
            case FAULTS.IO_PORT_ERR:
                this.#_Context.status = LIFT_STATUS.BLOCKED;
                break;
            case FAULTS.LEVEL_SENSOR_FAIL:
                this.#_Context.currentLevel = undefined;
                this.#_Context.status = LIFT_STATUS.LEVEL_ERROR;
                break;
            case FAULTS.LIFT_NO_POWER:
                this.#_Context.status = LIFT_STATUS.NO_POWER;
                break;
            case FAULTS.LIFT_SHORT_CIRCUIT:
                this.#_Context.status = LIFT_STATUS.SHORT_CIRCUIT;
                break;
            case FAULTS.LIFT_OVERLOAD:
                this.#_Context.status = LIFT_STATUS.OVERLOAD;
                break;

            default:
                break;
        }
    }

    /**
     * 
     * @param {object} param0
     * @param {boolean} param0.force
     * @returns 
     */
    async Stop(param0) {
        let { force } = param0 ?? {};
        let curr = this.#_ProxyCh.GetValue(this.#_Channels.current);
        let noMotorActive = curr < CURRENT_RANGE.WORK_OK[0];
            
        /*(force || noMotorActive) 
            ? await this.MotorStep('Off', { step: undefined }) 
            : await this.StopPhased();*/
        return this.StopPhased();
    }

    /**
     * 
     * @param {string} cmd 
     * @param {number} step 
     * @returns {Promise}
     */
    async MotorStep(cmd, { step }) {
        this.#_ProxyCh.SetValue(
            this.#_Channels.liftMotorCtrl, { cmd, args: [{ step }] })

        let step1Response = await this.#_ProxyCh.Events.waitFor(`${this.#_Channels.liftMotorCtrl}-value`, {
            timeout: LIFT_CONSTANTS.MOTOR_RES_MAX_TIME, 
        }).catch(() => {
            console.log(`Motor error: no response from "${this.#_Channels.liftMotorCtrl} on step ${step}"`);
            throw new Fault({ code: FAULTS.IO_TIMEOUT, critical: true });
        });
        if (step1Response[0].Value.error) {
            // throw new Error(stepResponse[0].Value.error);
            throw new Fault({ code: FAULTS.IO_DRIVER_ERR, critical: true });
        }
    }

    /**
     * @returns {Promise}
     */
    async StopPhased() {
        let current_0 = this.#_ProxyCh.GetValue(this.#_Channels.current);
        // console.log(current_0, CURRENT_RANGE.WORK_OK[0]);
        // let isIdle = current_0 < CURRENT_RANGE.WORK_OK[0]
        let step = 1;
        await this.MotorStep('Off', { step });
        
        await sleep(50);
        
        /*if (this.CheckShortCircuit())
            throw new Fault({ code: FAULTS.LIFT_SHORT_CIRCUIT, critical: true });

        let current_1 = this.#_ProxyCh.GetValue(this.#_Channels.current);

        if (!isIdle && isWithinTolerance(current_0, current_1, 0.05)) {
            console.log(`[LIFT] Current is ${current_1} after Off({ step: ${step} })"`);
            throw new Fault({ code: FAULTS.IO_PORT_ERR, critical: true });
        }*/
        
        step = 2;
        await this.MotorStep('Off', { step });
    }

    async OnFault(fault) {
        try {
            await this.Stop({ force: true });
        } catch (innerFault) {
            console.error('[LIFT] Критический сбой при попытке экстренной остановки', innerFault);
            this.EmergencyOff();
        } finally {
            this.UpdateStatus(fault);
            this.#_Context.currentTask?.rej?.(fault);
            this.#_Context.currentTask = null;
        }
    }

    async Idle() {
        this.#_Context.timer?.clear();
        try {
            await this.Stop({ force: false });
        } catch (fault) {
            console.error('[LIFT] Ошибка при штатной парковке', fault);
            this.#_FSM.Dispatch(this.EVENTS.FAULT, fault);
            return; 
        } 

        this.#_Context.currentTask?.res?.();
        this.#_Context.currentTask = null;
    }


    OnStateChanged({state, prevState}) {
        console.log(`[LIFT] STATE: ${prevState} -> ${state}`);
    }
    /**
     * 
     * @returns {string}
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

    CheckShortCircuit() {
        return false;
        if (this.#_Channels.short) {
            return this.#_ProxyCh.GetValue(this.#_Channels.short) == STORAGE_CONSTANSTS.SHORT_CH_VAL;
        }
        return false;
    }

    Reset() {
        this.#_FSM.Reset();
        this.#_Context.status = LIFT_STATUS.OK;
        this.#_Context.currentLevel = undefined;
        this.#_Context.requiredLevel = 0;
        this.#_Context.timer?.clear();
        this.#_Context.timer = null;

        for (let [eventName, handler] of this.#_TamperHandlers) 
            if (eventName && handler) this.#_ProxyCh.Events.off(eventName, handler);
        this.#_TamperHandlers.clear();

        const levelValueEventName = `${this.#_Channels.liftLevelSensor}-value`;
        this.#_ProxyCh.Events.off(levelValueEventName, this.#_LevelHandler);

        if (this.#_CurrentWatch) clearInterval(this.#_CurrentWatch)
        this.#_CurrentWatch = null;
        
        this.Stop({ force: true });
    }
}



module.exports = { ClassSpiralSectionLift};