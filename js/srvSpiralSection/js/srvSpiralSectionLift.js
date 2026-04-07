const { EventEmitter2 } = require("eventemitter2");
const { createTimer, ClassFault: Fault, isWithinTolerance } = require("./srvUtils");
const { ClassFSM: FSM } = require("./srvFSM");
const { LIFT_CONSTANTS, FAULTS, STORAGE_CONSTANSTS } = require("./SpiralSectionConstants");
const { STATES: BROKER_STATES } = require("./srvVendingMachineStates");
const LIFT_STATUS = BROKER_STATES.SECTIONS.LIFT.STATUS;
const assert = require("assert");
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
 * @property {string} NEXT_LEVEL_REACHED
 * @property {string} ELEVATE_COMMAND
 * @property {string} ELEVATE_TIMEOUT
 * @property {string} ERROR
 * @property {string} CRIT
 */

/**
 * @typedef {object} TypeSpiralSectionLiftContext
 * @property {number|undefined} currentLevel
 * @property {number|undefined} requiredLevel
 * @property {string} state
 * @property {bool} inService 
 * @property {import("./srvUtils").TypeTimer} timer
 */

const { LIFT_LEVEL_ON: LIFT_MOTOR_ON, 
    LIFT_LEVEL_OFF: LIFT_MOTOR_OFF, 
    LIFT_BOTTOM_TAMPER_ON, 
    DOUBLE_TRIGGER_WINDOW, 
    ELEVATE_NEXT_MAX_TIME, 
    ELECTR_CURR_STATE, 
    CURRENT_RANGE } = LIFT_CONSTANTS;

// const ClassSpiralSectionLift = ClassSpiralSectionLift.STATE;

class ClassSpiralSectionLift {
    static STATE = {
        IDLE:                    'IDLE',
        ELEVATING_TO_COLLECT:    'ELEVATING_TO_COLLECT',
        ELEVATING_TO_BOTTOM:     'ELEVATING_TO_BOTTOM',
        ELEVATING_TO_BASE:       'ELEVATING_TO_BASE',
        OUT_OF_SERVICE:          'OUT_OF_SERVICE',
    };
    /**@type {TypeProxyCh} */
    #_ProxyCh;
    /** @type {TypeSpiralSectionLiftChannels} */
    #_Channels = null;
    /** @type {TypeSpiralSectionLiftContext} */
    #_Context = {
        currentLevel: undefined,
        inService: true,
        state: BROKER_STATES.SECTIONS.LIFT.STATUS.OK
        
    };
    #_CurrentWatch = null;
    /**@type {EventEmitter2} */
    #_Events = new EventEmitter2(); 
    #_StatesGraph = {
        [ClassSpiralSectionLift.STATE.IDLE]: {
            [this.EVENTS.ELEVATE_TO_BOTTOM_COMMAND]:  { state: ClassSpiralSectionLift.STATE.ELEVATING_TO_BOTTOM, action: this._ElevateToBottom.bind(this) },
            [this.EVENTS.ELEVATE_TO_BASE_COMMAND]:  { state: ClassSpiralSectionLift.STATE.ELEVATING_TO_BASE,     action: this._ElevateToBottom.bind(this) },
            [this.EVENTS.ELEVATE_COMMAND]:          { state: ClassSpiralSectionLift.STATE.ELEVATING_TO_COLLECT,  action: this._ElevateToLevel.bind(this) },
        },
        [ClassSpiralSectionLift.STATE.ELEVATING_TO_BOTTOM] : {
            [this.EVENTS.BOTTOM_LEVEL_REACHED]:     { state: ClassSpiralSectionLift.STATE.IDLE,                action: ()=>{} },
            [this.EVENTS.ELEVATE_TIMEOUT]:          { state: ClassSpiralSectionLift.STATE.ELEVATING_TO_BOTTOM, action: this.OnElevateTimeout.bind(this) },
            [this.EVENTS.IDLE]:                  { state: ClassSpiralSectionLift.STATE.IDLE,                   action: ()=>{} },
        }, 
        [ClassSpiralSectionLift.STATE.ELEVATING_TO_BASE]: {
            [this.EVENTS.BOTTOM_LEVEL_REACHED]: { state: ClassSpiralSectionLift.STATE.ELEVATING_TO_BASE, action: this.ElevateUpToBaseLevel.bind(this) },
            [this.EVENTS.BASE_LEVEL_REACHED]:   { state: ClassSpiralSectionLift.STATE.IDLE,              action: ()=>{} },
            [this.EVENTS.ELEVATE_TIMEOUT]:      { state: ClassSpiralSectionLift.STATE.ELEVATING_TO_BASE, action: this.OnElevateTimeout.bind(this) },
            [this.EVENTS.IDLE]:                 { state: ClassSpiralSectionLift.STATE.IDLE,              action: ()=>{} },
        
        },
        [ClassSpiralSectionLift.STATE.ELEVATING_TO_COLLECT]: {
            [this.EVENTS.COLLECT_LEVEL_REACHED]: { state: ClassSpiralSectionLift.STATE.IDLE,                 action: ()=>{} },
            [this.EVENTS.ELEVATE_TIMEOUT]:       { state: ClassSpiralSectionLift.STATE.ELEVATING_TO_COLLECT, action: this.OnElevateTimeout.bind(this) },
            [this.EVENTS.IDLE]:                  { state: ClassSpiralSectionLift.STATE.IDLE,                 action: ()=>{} },
        },
        [ClassSpiralSectionLift.STATE.OUT_OF_SERVICE]: {
        }
    };
    #_FSM = new FSM({ stateGraph: this.#_StatesGraph, defaultState: ClassSpiralSectionLift.STATE.IDLE, onStateChanged: this.OnStateChanged.bind(this) });

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
        // TODO: check event names
        return ({
            IDLE:           'idleCemmand',
            ELEVATE_TO_BASE_COMMAND:'reachBaseCommand',
            ELEVATE_TO_BOTTOM_COMMAND: 'toBottom',
            BOTTOM_LEVEL_REACHED:   'bottomTamper',
            BASE_LEVEL_REACHED:     'bottomLevelReached',
            NEXT_LEVEL_REACHED:     'NEXT_LEVEL_REACHED',
            COLLECT_LEVEL_REACHED:  'collectLevelReached',
            ELEVATE_COMMAND:        'elevateCommand',
            ELEVATE_TIMEOUT:        'elevateTimeout',
            ERROR:                  'ERROR',
            CRIT:                   'CRIT',
        });
    }

    get State() {
        return this.#_Context.state;
    }

    get Level() {
        return this.#_Context.currentLevel;
    }

    get MotorOk() {
        return this.State == LIFT_STATUS.OK || 
            this.State == LIFT_STATUS.TAMPER_ERROR || 
            this.State == LIFT_STATUS.LEVEL_ERROR || 
            this.State == LIFT_STATUS.OVERLOAD 
    } 

    get Events() {
        // TODO return proxy
        return this.#_Events;
    }

    Init() {
        this.InitEventHandlers();
        // this.StartCurrentWatch();
        this.#_FSM.Run(this.#_Events, Object.values(this.EVENTS));
    }

    InitEventHandlers() {
        /** Bottom tamper handler */
        const tamperValueEventName = `${this.#_Channels.liftBottomTamper}-value`;
        let tamperCachedValue = LIFT_CONSTANTS.TAMPER_OFF;
        this.#_ProxyCh.Events.on(tamperValueEventName, ({ Value }) => {
            if (Value != tamperCachedValue && Value == LIFT_BOTTOM_TAMPER_ON) {
                this.#_Context.timer?.clear();
                console.log(`[LIFT] обновлен сигнал на тампере: ${Value}`);

                this.#_Events.emit(this.EVENTS.BOTTOM_LEVEL_REACHED);
            };
            tamperCachedValue = Value;
        });

        /** New level handler */
        const levelValueEventName = `${this.#_Channels.liftLevelSensor}-value`;

        let cachedValue;
        this.#_ProxyCh.Events.on(levelValueEventName, ({ Value }) => {
            if (Value == cachedValue) return;
            cachedValue = Value
            let state = this.#_FSM.State;
            if (Value == LIFT_BOTTOM_TAMPER_ON) {
                if (this.#_FSM.State == ClassSpiralSectionLift.STATE.ELEVATING_TO_COLLECT || 
                    this.#_FSM.State == ClassSpiralSectionLift.STATE.ELEVATING_TO_BASE ||
                    this.#_FSM.State == ClassSpiralSectionLift.STATE.ELEVATING_TO_BOTTOM
                ) {
                    let motorState = this.#_ProxyCh.GetValue(this.#_Channels.liftMotorCtrl);
                    if (motorState.cmd == 'Forward')
                        this.#_Context.currentLevel++;
                    if (motorState.cmd == 'Reverse')
                        this.#_Context.currentLevel--;

                    // console.log(`[LIFT DRIVER] Уровень лифта: ${this.#_Context.currentLevel}`);
                    if (this.#_Context.currentLevel == this.#_Context.requiredLevel) {
                        this.#_Context.timer?.clear();
                        if (this.#_Context.currentLevel == 0)
                            this.#_Events.emit(this.EVENTS.BASE_LEVEL_REACHED);
                        else
                            this.#_Events.emit(this.EVENTS.COLLECT_LEVEL_REACHED);
                    } 
                }  

                this.#_Context.timer?.reset();
            }
        });
    }

    StartCurrentWatch() {
        if (this.#_CurrentWatch) clearInterval(this.#_CurrentWatch);
        
        this.#_CurrentWatch = setInterval(() => {
            const shortUps = this.#_ProxyCh.GetValue(this.#_Channels.short) == STORAGE_CONSTANSTS.SHORT_CH_VAL;
            const shortOverload = this.#_ProxyCh.GetValue(this.#_Channels.current) > LIFT_CONSTANTS.CURRENT_RANGE.OVERLOAD[1];

            if (shortUps || shortOverload) {
                this.#_Events.emit(this.EVENTS.ERROR, new Fault({ code: FAULTS.LIFT_SHORT_CIRCUIT, critical: true }));
                this.#_Context.state = BROKER_STATES.SECTIONS.LIFT.STATUS.SHORT_CIRCUIT;
                return;
            }

            const overload = this.#_ProxyCh.GetValue(this.#_Channels.current) >= LIFT_CONSTANTS.CURRENT_RANGE.OVERLOAD[0];
            if (overload) {
                this.#_Context.state = BROKER_STATES.SECTIONS.LIFT.STATUS.OVERLOAD;
            }

        }, 1000);
    }

    async ElevateToBaseLevel() {
        return new Promise(async (res, rej) => {
            if (!this.#_Context.inService)
                rej();
            this.#_Events.emit(this.EVENTS.ELEVATE_TO_BASE_COMMAND);
            
            this.#_Events.once(this.EVENTS.ERROR, async fault => {
                this.UpdateState(fault);
                rej(fault); 
            });
            await this.#_Events.waitFor(this.EVENTS.BOTTOM_LEVEL_REACHED);
            await this.#_Events.waitFor(this.EVENTS.BASE_LEVEL_REACHED);
            res();
        }).finally(async () => {
            await this.Idle();
        });;
    }

    async ElevateToBottom() {
        return new Promise(async (res, rej) => {
            if (!this.#_Context.inService)
                rej();
            this.#_Events.emit(this.EVENTS.ELEVATE_TO_BOTTOM_COMMAND);
            
            this.#_Events.once(this.EVENTS.ERROR, async fault => {
                this.UpdateState(fault);
                rej(fault); 
            });
            await this.#_Events.waitFor(this.EVENTS.BOTTOM_LEVEL_REACHED);
            res();

        }).finally(async () => {
            await this.Idle();
        });;
    }

    EmergencyOff() {}

    async ElevateUpToBaseLevel() {
        this.#_Context.currentLevel = -1;
        this.#_Context.requiredLevel = 0;

        let fault = await this.ElevateUp();
        if (fault)
            this.#_Events.emit(this.EVENTS.ERROR, fault);
        else
            this.#_Context.timer = createTimer(this.OnTimeout.bind(this), ELEVATE_NEXT_MAX_TIME).set(); 
    }

    async ElevateToLevel(requiredLevel) {
        return new Promise((res, rej) => {
            this.#_Events.emit(this.EVENTS.ELEVATE_COMMAND, requiredLevel);
            if (!this.#_Context.inService)
                rej();
            this.#_Events.once(this.EVENTS.COLLECT_LEVEL_REACHED, res);
        
            this.#_Events.once(this.EVENTS.ERROR, async fault => {
                this.UpdateState(fault);
                rej(fault); 
            });
        }).finally(async () => {
            await this.Idle();
        });
    }

    async _ElevateToLevel(requiredLevel) {
        this.#_Context.requiredLevel = requiredLevel;
        const startLevel = this.#_Context.currentLevel; 

        if (startLevel == requiredLevel) return;

        const up = startLevel < requiredLevel;
        
        this.#_Context.timer?.clear?.();

        let fault = up ? await this.ElevateUp() : await this.ElevateDown();
        if (fault)
            this.#_Events.emit(this.EVENTS.ERROR, fault);
        else 
            this.#_Context.timer = createTimer(this.OnTimeout.bind(this), ELEVATE_NEXT_MAX_TIME).set();
    }

    OnTimeout() {
        this.#_Events.emit(this.EVENTS.ELEVATE_TIMEOUT);
    }

    async OnElevateTimeout() {
        console.log(`[LIFT] Timeout`);
        debugger;
        let currState = this.CheckCurrent();
        let ctx = {...this.#_Context};
    
        switch (currState) {
            case ELECTR_CURR_STATE.OVERLOAD:
                this.#_Context.timer?.clear();
                if ((this.#_Context.currentLevel == 0 || this.#_Context.currentLevel == undefined) && this.#_Context.requiredLevel == -1) {
                    console.log(`[LIFT] Bottom reached, tamper or jam fault`);
                    // this.#_Events.emit(this.EVENTS.BOTTOM_LEVEL_REACHED);
                    this.#_Events.emit(this.EVENTS.ERROR, new Fault({ code: FAULTS.BOTTOM_TAMPER_FAIL, critical: false }));
                } else {
                    console.log(`[LIFT] Lift is stuck`);
                    this.#_Events.emit(this.EVENTS.ERROR, new Fault({ code: FAULTS.LIFT_OVERLOAD, critical: true }));
                    this.#_Context.state = LIFT_STATUS.OVERLOAD;
                }
                break;
            case ELECTR_CURR_STATE.IDLE:
                this.#_Events.emit(this.EVENTS.ERROR, new Fault({ code: FAULTS.LIFT_NO_POWER, critical: true }));
                this.#_Context.state = LIFT_STATUS.NO_POWER;
                break;
            case ELECTR_CURR_STATE.WORK_OK:
                // log motor/mech fault
                this.#_Context.state = LIFT_STATUS.LEVEL_ERROR;
                this.#_Events.emit(this.EVENTS.ERROR, new Fault({ code: FAULTS.LEVEL_SENSOR_FAIL, critical: true }));
                break;
            case ELECTR_CURR_STATE.SHORT:
                this.#_Context.state = LIFT_STATUS.SHORT_CIRCUIT;
                this.#_Events.emit(this.EVENTS.ERROR, new Fault({ code: FAULTS.LIFT_SHORT_CIRCUIT, critical: true }));
                break;
            default:
                throw new Error('Unexpected');
                break;
        }
    }

    async _ElevateToBottom() {
        this.#_Context.requiredLevel = -1;
        if (this.#_ProxyCh.GetValue(this.#_Channels.liftBottomTamper) == LIFT_CONSTANTS.LIFT_BOTTOM_TAMPER_ON)
            this.#_Events.emit(this.EVENTS.BOTTOM_LEVEL_REACHED);
        let fault = await this.ElevateDown();
        if (fault) {
            this.#_Events.emit(this.EVENTS.ERROR, fault);
        } else {
            this.#_Context.timer?.clear();
            if (this.#_Context.state != LIFT_STATUS.LEVEL_ERROR)
                this.#_Context.timer = createTimer(this.OnTimeout.bind(this), ELEVATE_NEXT_MAX_TIME).set();
        }
    }
    /**
     * @returns {Promise<Fault | null>}
     */    
    async ElevateUp() {
        return await this.Elevate({ cmd: 'Forward' });   
    }
    /**
     * @returns {Promise<Fault | null>}
     */
    async ElevateDown() {
        return await this.Elevate({ cmd: 'Reverse' });
    }

    /**
     * 
     * @param {object} param0
     * @param {string} param0.cmd 
     * @returns 
     */
    async Elevate({ cmd }) {
        assert.equal(['Forward', 'Reverse'].includes(cmd), true);

        await this.Stop({ immediate: true });
        await sleep(50);
        
        let current_0 = this.#_ProxyCh.GetValue(this.#_Channels.current);
        if (current_0 >= ELECTR_CURR_STATE.WORK_OK[0]) 
            return new Fault({ code: FAULTS.LIFT_CTRL_UNDEFINED, critical: true });

        let step = 1;
        let step1Fault = await this.MotorStep(cmd, { step });
        if (step1Fault) 
            return step1Fault;
            
        await sleep(50);

        if (this.CheckShortCircuit())
            return new Fault({ code: FAULTS.LIFT_SHORT_CIRCUIT, critical: true });

        let current_1 = this.#_ProxyCh.GetValue(this.#_Channels.current);
        
        if (!isWithinTolerance(current_0, current_1, 0.05)) {   // пробой 
            console.log(`[LIFT] Current significantly changed (${current_0} -> ${current_1}) after On({ step: 1 })"`);
            return new Fault({ code: FAULTS.IO_PORT_ERR, critical: true });
        }

        step = 2;
        let step2Fault = await this.MotorStep(cmd, { step });
        if (step2Fault) 
            return step2Fault;

        await sleep(100);   //TODO test 50ms

        if (this.CheckShortCircuit())
            return new Fault({ code: FAULTS.LIFT_SHORT_CIRCUIT, critical: true });

        let current_2 = this.#_ProxyCh.GetValue(this.#_Channels.current);

        if (isWithinTolerance(current_0, current_2, 0.05)) {
            return new Fault({ code: FAULTS.LIFT_NO_POWER, critical: true });    // пробой 
        }
    }

    /**
     * 
     * @param {Fault} fault 
     */
    UpdateState(fault) {

        switch (fault.code) {
            case FAULTS.BOTTOM_TAMPER_FAIL:
                this.#_Context.state = LIFT_STATUS.TAMPER_ERROR;
                break;
            case FAULTS.IO_DRIVER_ERR:
                this.#_Context.state = LIFT_STATUS.BLOCKED;
                break;
            case FAULTS.IO_PORT_ERR:
                this.#_Context.state = LIFT_STATUS.BLOCKED;
                break;
            case FAULTS.LEVEL_SENSOR_FAIL:
                this.#_Context.state = LIFT_STATUS.LEVEL_ERROR;
                break;
            case FAULTS.LIFT_NO_POWER:
                this.#_Context.state = LIFT_STATUS.NO_POWER;
                break;
            case FAULTS.LIFT_SHORT_CIRCUIT:
                this.#_Context.state = LIFT_STATUS.SHORT_CIRCUIT;
                break;
            case FAULTS.LIFT_OVERLOAD:
                this.#_Context.state = LIFT_STATUS.OVERLOAD;
                break;

            default:
                break;
        }
    }

    /**
     * 
     * @param {object} param0
     * @param {boolean} param0.immediate
     * @returns 
     */
    async Stop(param0) {
        let { immediate } = param0 ?? {};
        let curr = this.#_ProxyCh.GetValue(this.#_Channels.current);
        let noMotorActive = curr < CURRENT_RANGE.WORK_OK[0];
        
        let fault = (immediate || noMotorActive) 
            ? await this.MotorStep('Off', { step: undefined }) 
            : await this.StopPhased();
        if (fault) 
            this.#_Events.emit(this.EVENTS.ERROR, fault);
    }

    /**
     * 
     * @param {string} cmd 
     * @param {number} step 
     * @returns {Promise<null|Fault>}
     */
    async MotorStep(cmd, { step }) {
        this.#_ProxyCh.SetValue(
            this.#_Channels.liftMotorCtrl, { cmd, args: [{ step }] })
        let fault;
        let step1Response = await this.#_ProxyCh.Events.waitFor(`${this.#_Channels.liftMotorCtrl}-value`, {
            timeout: LIFT_CONSTANTS.MOTOR_RES_MAX_TIME, 
        }).catch(() => {
            console.log(`Motor error: no response from "${this.#_Channels.liftMotorCtrl} on step ${step}"`);
            fault = new Fault({ code: FAULTS.IO_TIMEOUT, critical: true });
        });
        if (fault) return fault;
        if (step1Response[0].Value.error) {
            // throw new Error(stepResponse[0].Value.error);
            return new Fault({ code: FAULTS.IO_DRIVER_ERR, critical: true });
        }
    }

    /**
     * @returns {Promise<null|Fault>}
     */
    async StopPhased() {
        let current_0 = this.#_ProxyCh.GetValue(this.#_Channels.current);
        let step = 1;
        let step1Fault = await this.MotorStep('Off', { step });
        if (step1Fault) 
            return step1Fault;
        
        await sleep(50);
        
        if (this.CheckShortCircuit())
            return new Fault({ code: FAULTS.LIFT_SHORT_CIRCUIT, critical: true });

        let current_1 = this.#_ProxyCh.GetValue(this.#_Channels.current);
        
        if (isWithinTolerance(current_0, current_1, 0.05)) {
            console.log(`[LIFT] Current is ${current_1} after Off({ step: ${step} })"`);
            return new Fault({ code: FAULTS.IO_PORT_ERR, critical: true });
        }
        
        step = 2;
        let step2Fault = await this.MotorStep('Off', { step });
        if (step2Fault) 
            return step2Fault;
    }

    async Idle() {
        this.#_Context.timer?.clear();
        if (this.MotorOk) {
            let stopFault = await this.Stop({ immediate: true });
            if (!stopFault) 
                return this.#_Events.emit(this.EVENTS.IDLE);
        }
        this.EmergencyOff();
    }
    
    async SetOutOfService() {
        this.#_Context.inService = false;
        await this.Stop({ immediate: true });
    }

    OnStateChanged(state) {
        
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
        if (this.#_Channels.short) {
            return this.#_ProxyCh.GetValue(this.#_Channels.short) == STORAGE_CONSTANSTS.SHORT_CH_VAL;
        }
        return false;
    }

    Reset() {
        this.#_FSM.Reset();
        this.#_Context.currentLevel = 0;
        this.#_Context.requiredLevel = 0;
        this.#_Context.inService = true;
        this.#_Context.timer?.clear();
        this.#_Context.timer = null;
        if (this.#_CurrentWatch) clearInterval(this.#_CurrentWatch)
    }
}



module.exports = { ClassSpiralSectionLift};