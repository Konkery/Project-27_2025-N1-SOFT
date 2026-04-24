const { LIFT_CONSTANTS, STORAGE_CONSTANSTS, FAULTS, CELL_CONSTANTS } = require("./SpiralSectionConstants.js");
const { EventEmitter2 } = require("eventemitter2");
const mqtt = require('mqtt');
const { BitMask, isWithinTolerance } = require("./srvUtils.js");
let sleep = require('timers/promises').setTimeout;

const peekValueInRange = ([low, high]) => (low + high) / 2;

const EVENTS = {
    STOP: 'STOP',
    MOVE: 'MOVE',
    LEVEL: 'LEVEL',
    MOTOR_START: 'ROTATE',
    DISPENSED: 'DISPENSED',
    BOTTOM_TAMPER: 'BOTTOM',
    CELL_UNLOCKED: 'UNLOCKED'
}

const TARGET = {
    LIFT: 'lift',
    SPIRAL: 'spiral',
    CELL: 'cell'
}

async function CreateMQTTConnection (_source) {
    return new Promise(async (res, rej) => {
        let options = Object.assign({
            port:     _source.Port,
            username: _source.Login,
            password: _source.Password,
        }, _source.ConnectOpts);
        options.protocol ??= 'mqtt'; //по умолчанию mqtt://

        let url = `${options.protocol}://${(_source.IP) ? _source.IP : _source.DN}`;

        try {
            const connection = await mqtt.connectAsync(url, options);
            res({ source: _source, client: connection });
        } catch (e) {
            console.log("ошибка подключения к брокеру");
            res({ source: _source, client: null });
        }
    });
}

class DeviceEmulator {
    constructor({ ProxyCh, channels, advOpts, log }) {
        this.events = new EventEmitter2();
        /** @type {mqtt.MqttClient} */
        this.mqttC = null
        this.proxy = ProxyCh;
        /** @type {import("./srvSpiralSection.js").TypeSpiralSectionChannels} */
        this.ch = channels;
        this.faultAdapter = null;
        this.hbridgeKeys = advOpts.liftOpts.keys;
        this.hbridgeSource = advOpts.liftOpts.source;
        this.spiralMatrixRowSource = advOpts.storageOpts.row.source;
        this.spiralMatrixColSource = advOpts.storageOpts.col.source;

        this.cellMatrixRowSource = advOpts.cellOpts.row.source;
        this.cellMatrixColSource = advOpts.cellOpts.col.source;

        this.pollInterval = null;
        this.log = log ?? console.log;

        this.lift = new Lift({ events: this.events, hbridgeKeys: this.hbridgeKeys, log: this.log });
    
        this.spiralSection = new SpiralSection({ events: this.events, log: this.log, channels: this.ch.storageChannels });

        this.cellSection = new CellSection({ events: this.events, log: this.log, channels: this.ch.cellChannels });
    }

    async init(mqttOpts, config) {
        this.mqttC = (await CreateMQTTConnection(mqttOpts)).client;
        this._subscribe();
        this.configureFaults(config);
        this.startPolling();
        // CreateMQTTConnection
    }

    startPolling() {
        let liftCurrentCache = this.lift.values.current;
        this.pollInterval = setInterval(() => {
            this._setValue(this.ch.liftChannels.liftBottomTamper, this.lift.values.liftBottomTamper);
            this._setValue(this.ch.liftChannels.liftLevelSensor, this.lift.values.liftLevelSensor);
            this._setValue(this.ch.liftChannels.current, this.lift.values.current);
            /*let curr = this.lift.values.current;
            if (!isWithinTolerance(liftCurrentCache, curr, 0.05)) {
                liftCurrentCache = curr;
                console.log(`Lift current: ${curr}`);
            }*/

            if (this.ch.liftChannels.short)
                this._setValue(this.ch.liftChannels.short, this.lift.values.short);
            
            this._setValue(this.ch.storageChannels.current, this.spiralSection.values.current);
            for (let i = 0; i < this.ch.storageChannels.spiralTamperChannels.length; i++) {
                this._setValue(this.ch.storageChannels.spiralTamperChannels[i], this.spiralSection.values.spiralTamperChannels[i]);
            }
            this._setValue(this.ch.cellChannels.tamper, this.cellSection.values.tamper.toString());
            this._setValue(this.ch.cellChannels.current, this.cellSection.values.current);
        }, 20);
    }

    configureFaults(faultsConfig) {
        if (this.faultAdapter) {
            this.faultAdapter.destroy();
        }
        this.faultAdapter = new FaultAdapter({
            emu: this,
            events: this.events,
            config: faultsConfig
        });
    }

    listenEvents() {
        this.events.on(EVENTS.LEVEL, level => {
            this._setValue(this.ch.liftChannels.liftLevelSensor, LIFT_CONSTANTS.LIFT_LEVEL_ON);
        });
        this.events.on(EVENTS.DISPENSED, ({ row, col }) => {
            let tamperChannel = this.ch.storageChannels.spiralTamperChannels[row];
            this._setValue(tamperChannel, STORAGE_CONSTANSTS.TAMPER_ON);
        });
        this.events.on(EVENTS.BOTTOM_TAMPER, ({ value }) => {
            let tamperChannel = this.ch.liftChannels.liftBottomTamper;
            this._setValue(tamperChannel, value);
        });
    }

    getState() {
        return ({
            lift: this.lift.getState(),
            storage: this.spiralSection.getState(),
            cell: this.cellSection.getState()
        });
    }

    reset() {
        this.lastLevelEventTime = 0;
        if (this.pollInterval) clearInterval(this.pollInterval);
        this.spiralSection.reset();
        this.cellSection.reset();
        this.lift.reset();
        this.startPolling();
    }

    _setValue(chName, value) {
        if (!chName) return;
        let { Address } = this.proxy?.Channels?.find(ch => ch.Name == chName) ?? {};
        if (Address)
            this.mqttC.publishAsync(Address, typeof value == 'string' ? value : JSON.stringify(value));
    }

    _subscribe() {
        const parse = (_topic, _payloadBuffer) => {
            let value = +_payloadBuffer.toString();
            let chNum = +_topic.split('/').at(-1);
            return { value, chNum };
        }
        // const confTopic = `/Emulator/conf`;
        // const prefixTopic = '/Emulator/KC868/';
        const hbridgeTopic = `/Emulator/KC868/${this.hbridgeSource}/`;
        const spiralMatrixColTopic = `/Emulator/KC868/${this.spiralMatrixColSource}/`;
        const spiralMatrixRowTopic = `/Emulator/KC868/${this.spiralMatrixRowSource}/`;
        const cellMatrixColTopic = `/Emulator/KC868/${this.cellMatrixColSource}/`;
        const cellMatrixRowTopic = `/Emulator/KC868/${this.cellMatrixRowSource}/`;
        this.mqttC.subscribe('/Emulator/KC868/#')
        this.mqttC.on('message', (_topic, _payloadBuffer) => {

            if (_topic.startsWith(hbridgeTopic)) {
                let { value, chNum } = parse(_topic, _payloadBuffer); 
                this.lift.hbridge.setSwitch(chNum, value);
            }
            if (_topic.startsWith(spiralMatrixColTopic)) {
                let { value, chNum } = parse(_topic, _payloadBuffer); 
                this.spiralSection.matrix.setGround(chNum, value);
            }
            if (_topic.startsWith(spiralMatrixRowTopic)) {
                let { value, chNum } = parse(_topic, _payloadBuffer); 
                this.spiralSection.matrix.setSource(chNum, value);
            }
            if (_topic.startsWith(cellMatrixColTopic)) {
                let { value, chNum } = parse(_topic, _payloadBuffer); 
                this.cellSection.matrix.setGround(chNum, value);
            }
            if (_topic.startsWith(cellMatrixRowTopic)) {
                let { value, chNum } = parse(_topic, _payloadBuffer); 
                this.cellSection.matrix.setSource(chNum, value);
            }
            /*if (_topic.startsWith(confTopic)) {
                this.faultAdapter.
            }*/
        }); 
    }
}

class Matrix {
    constructor(size) {
        this.rows = size.rows;
        this.cols = size.cols;
        this.sourceState = null;
        this.groundState = null
        this.entryActive = Array.from({ length: this.rows }, () =>
            Array(this.cols).fill(0)
        );
        this.portFault = {
            sourceStuckOn: Array(this.rows).fill(false),
            groundStuckOn: Array(this.cols).fill(false)
        };
        this.reset();
        
    }

    setSource(col, val) {
        if (col < 0 || col >= this.cols) throw Error(`Invalid col value`);
        // if (!this.fault.sourceStuckOn[row]) {
        this.sourceState[col] = val ? 1 : 0;
        this._recalcMatrix();
    }
    
    setGround(row, val) {
        if (row < 0 || row >= this.rows) throw Error(`Invalid row value`);
        // if (!this.fault.groundStuckOn[row]) {
        this.groundState[row] = val ? 1 : 0;
        this._recalcMatrix();
    }

    reset() {
        this.sourceState = Array(this.rows).fill(0);   // строки
        this.groundState = Array(this.cols).fill(0);   // столбцы

        this.entryActive = Array.from({ length: this.rows }, () =>
            Array(this.cols).fill(0)
        );
        this.portFault = {
            sourceStuckOn: Array(this.rows).fill(false),
            groundStuckOn: Array(this.cols).fill(false)
        };
    }

    _recalcMatrix() {
        let activeCount = 0;
        for (let row = 0; row < this.rows; row++) {
            for (let col = 0; col < this.cols; col++) {

                const prev = this.entryActive[row][col];

                const sourceOn = this.sourceState[col] || this.portFault.sourceStuckOn[col];
                const groundOn = this.groundState[row] || this.portFault.groundStuckOn[row];

                const next = (sourceOn && groundOn) ? 1 : 0;
                // --- включение ---
                if (prev === 0 && next === 1) {
                    this.onOn({ row, col });
                }
                // --- отключение ---
                if (prev === 1 && next === 0) {
                    this.onOff({ row, col });
                }
                this.entryActive[row][col] = next;

                if (next === 1) {
                    activeCount++;
                }
            }
        }
    }

    countActive() {
        let activeCount = 0; 
        for (let r of this.entryActive) {
            for (let c of r) {
                if (c == 1) activeCount++;
            }
        }
        return activeCount;
    }

    onOn({ row, col }) { }

    onOff({ row, col }) { }

        // Аварийные сценарии (заглушки)
    // Пробой Source (залипание в 1)
    injectSourceStuckOn(row) {
        this.portFault.sourceStuckOn[row] = true;
        this.sourceState[row] = 1;
        this._recalcMatrix();
    }
    // Пробой Ground
    injectGroundStuckOn(col) {
        this.portFault.groundStuckOn[col] = true;
        this.groundState[col] = 1;
        this._recalcMatrix();
    }
        // Сброс аварии
    clearStuck() {
        this.portFault.sourceStuckOn.fill(false);
        this.portFault.groundStuckOn.fill(false);
    }
}

class SpiralSection {
    /**
     * 
     * @param {object} param0
     * @param {EventEmitter2} param0.events 
     * @param {Function} param0.log 
     * @param {import('./srvSpiralSectionStorage.js').TypeSpiralSectionStorageChannels} param0.channels 
     */
    constructor({ events, log, channels }) {
        this.events = events
        this.channels = channels;
        
        this.log = log;
        this.values = this.getDefaultValues();
        this.faults = new FaultBehavior();
        this.shortEntries = new Set();
        this.matrix = new Matrix({ rows: 8, cols: 12 });
        this.matrix.onOn = this._startSpiralMotor.bind(this);
        this.matrix.onOff = this._stopSpiralMotor.bind(this);
        this.t_rot_avg = STORAGE_CONSTANSTS.AVG_ROTATOIN_TIME;   // время до срабатывания тампера спирали
    }

    getState() {
        return { values: this.values };
    }

    getDefaultValues() {
        return {
            spiralTamperChannels: Array.from({ length: 8 }).fill(STORAGE_CONSTANSTS.TAMPER_OFF),
            current: peekValueInRange(STORAGE_CONSTANSTS.CURRENT_RANGE.IDLE),
            short: 0,
        };
    }

    reset() {
        if (this.rotInterv) clearInterval(this.rotInterv);
        this.rotInterv = null;
        if (this.rotTimeout) clearTimeout(this.rotTimeout);
        this.rotTimeout = null;
        this.shortEntries.clear();
        this.faults.clearAllFaults();
        this.matrix.reset();
        this.values = this.getDefaultValues();
    }

    _startSpiralMotor({ row, col }) {
        console.log(`[EMU] Включение мотора спирали [${row}, ${col}]`);

        if (this.faults.hasFault(FAULTS.ACTUATOR_NO_POWER)) {
            this.values.current = peekValueInRange(STORAGE_CONSTANSTS.CURRENT_RANGE.IDLE);
            return;
        }

        if (this.faults.hasFault(FAULTS.ACTUATOR_SHORT_CIRCUIT)) {
            this.shortEntries.add(`${row}-${col}`);
            this.values.current = peekValueInRange(STORAGE_CONSTANSTS.CURRENT_RANGE.IDLE);
            this.values.short = 1;
            return;
        }

        if (this.faults.hasFault(FAULTS.ACTUATOR_OVERLOAD)) {
            this.values.current = peekValueInRange(STORAGE_CONSTANSTS.CURRENT_RANGE.OVERLOAD);
        } else {
            this.values.current = peekValueInRange(STORAGE_CONSTANSTS.CURRENT_RANGE.WORK_OK);
            console.log(`[EMU] Ток спирали ${this.values.current}`);

            this.rotInterv = setInterval(() => {
                if (!this.faults.hasFault(FAULTS.TAMPER_ERROR)) {
                    this.values.spiralTamperChannels[row] = STORAGE_CONSTANSTS.TAMPER_ON;
                    this.emitDispensed({ row, col });

                    this.rotTimeout = setTimeout(() => {
                        this.values.spiralTamperChannels[row] = STORAGE_CONSTANSTS.TAMPER_OFF;
                    }, 50);
                }

            }, this.t_rot_avg);
        }
    }

    _stopSpiralMotor({ row, col }) {
        console.log(`[EMU] Выключение мотора спирали [${row}, ${col}]`);

        if (this.rotInterv) clearInterval(this.rotInterv);
        if (this.rotTimeout) clearTimeout(this.rotTimeout);
        this.values.current = peekValueInRange(STORAGE_CONSTANSTS.CURRENT_RANGE.IDLE);
        this.values.spiralTamperChannels[col] = STORAGE_CONSTANSTS.TAMPER_UNDEFINED;
        this.shortEntries.delete(`${row}-${col}`);
        this.values.short = this.shortEntries.size > 0;
    } 

    emitDispensed({ row, col }) {
        console.log(`[EMU] Выдана 1 ед. ТМЦ со спирали [${row}, ${col}]`);
        this.events.emit(EVENTS.DISPENSED, { row, col });
    }
}

class HBridge {
    constructor({ hbridgeKeys }) {
        this.hbridgeSwState = { s1: 0, s3: 0, s2: 0, s4: 0 };
        this.hbridgeKeys = hbridgeKeys;
    }

    setSwitch(chNum, val) {
        let sw = Object.keys(this.hbridgeKeys).find(k => this.hbridgeKeys[k]==chNum);
        // this.log(`[EMU] setSwitch(${chNum}, ${val})`);
        if (!sw) throw Error(`Invalid chNum`);
        this.hbridgeSwState[sw] = val;
        this._recalcHBridge();
    }

    _recalcHBridge() {
        let activeCount = 0;
        // Проверка состояний H-моста
        const { s1, s3, s2, s4 } = this.hbridgeSwState;
        // Проверка на ошибку: если одновременно включены s1 и s2
        if (s1 === 1 && s2 === 1) {
            this.onShort();
            // throw new Error('Error: Both s1 and s2 are ON simultaneously! This is an invalid state for the H-Bridge.');
        }
        if (s3 === 1 && s4 === 1) {
            throw new Error('Error: Both s3 and s4 are ON simultaneously! This is an invalid state for the H-Bridge.');
        }
        // Логика активации и деактивации мотора
        if (s1 === 1 && s4 === 1) {
            activeCount++;
            this.onOn(1);
        }
        if (s2 === 1 && s3 === 1) {
            activeCount++;
            this.onOn(-1);
        }
        if (s1 === 0 && s2 === 0) {
            this.onOff();
        }
        // TODO
        // if (s2 === 0 && s4 === 1) {
        //     // Останавливаем B (переключение на противоположный полупериод)
        //     this._stopLift();
        // }
    }

    onOn(val) {}

    onOff() {}

    onShort() {}
}

class Lift {
    constructor({ events, hbridgeKeys, log }) {
        this.events = events;
        this.values = {
            liftBottomTamper: LIFT_CONSTANTS.LIFT_BOTTOM_TAMPER_OFF,
            liftLevelSensor: LIFT_CONSTANTS.LIFT_LEVEL_ON,
            current: peekValueInRange(LIFT_CONSTANTS.CURRENT_RANGE.IDLE),
            short: 0
        }
        this.log = log;
        this.hbridge = new HBridge({ hbridgeKeys });
        this.hbridge.onOn = this._startLift.bind(this);
        this.hbridge.onOff = this._stopLift.bind(this);
        this.hbridge.onShort = (() => {
            console.log(`[EMU] КЗ в схеме лифта`);
            this.values.current = peekValueInRange(LIFT_CONSTANTS.CURRENT_RANGE.IDLE);
            this.values.short = 1;
        }).bind(this);

        this.faults = new FaultBehavior();
        // --- состояние лифта ---
        this.currentLevel = 0;     // стартовая позиция
        this.topLevel = 8;
        this.setOnLevel = typeof this.currentLevel === 'number';
        this.moving = false;
        this.direction = 0;        // -1 вниз, +1 вверх
        this.lastLevelEventTime = 0;

        this.t_level_avg = LIFT_CONSTANTS.ELEVATE_NEX_AVG_TIME;   // время между уровнями
        this.zeroPulseGap = LIFT_CONSTANTS.DOUBLE_TRIGGER_WINDOW;   // пауза между двойным импульсом на 0 уровне
    }

    getState() {
        return ({
            currentLevel: this.currentLevel,
            direction: this.direction,
            moving: this.moving,
            values: this.values
        });
    }

    reset() {
        this.currentLevel = 0;     // стартовая позиция
        this.moving = false;
        this.direction = 0;        // -1 вниз, +1 вверх
        this.lastLevelEventTime = 0;
        this.hbridgeSwState = { s1: 0, s3: 0, s2: 0, s4: 0 };
        this.values.liftBottomTamper = LIFT_CONSTANTS.LIFT_BOTTOM_TAMPER_OFF;
        this.values.liftLevelSensor = LIFT_CONSTANTS.LIFT_LEVEL_OFF;
        this.values.current = peekValueInRange(LIFT_CONSTANTS.CURRENT_RANGE.IDLE);
        this.faults.clearAllFaults();

        if (this.liftTimer) {
            clearTimeout(this.liftTimer);
            this.liftTimer = null;
        }

        if (this.rotTimeout) {
            clearTimeout(this.liftTimer);
            this.rotTimeout = null;
        }

        if (this.rotInterv) {
            clearInterval(this.rotInterv);
            this.rotInterv = null;
        }
    }

    _startLift(dir) {
        if (this.moving && this.direction != dir)
            throw new Error(`command move in opposite dir!`);
        if (this.moving) return;

        this.direction = dir;
        this.move(true);

        this._moveStep();
    }

    _stopLift() {
        if (!this.moving) return;
        if (this.liftTimer) clearTimeout(this.liftTimer);
        this.move(false);
        this.direction = 0;
        this.values.short = 0;
    }

    _moveStep() {
        if (!this.moving) return;
        this.setOnLevel = false;
        if (this.faults.hasFault(FAULTS.LIFT_NO_POWER)) {
            this.values.current = peekValueInRange(LIFT_CONSTANTS.CURRENT_RANGE.IDLE);
            return; // движение отсутствует
        }
        let timeout = this.t_level_avg;
        if (this.faults.hasFault(FAULTS.LIFT_OVERLOAD_1)) {
            this.values.current = peekValueInRange(LIFT_CONSTANTS.CURRENT_RANGE.OVERLOAD);
            timeout = LIFT_CONSTANTS.ELEVATE_NEXT_OVERLOAD_TIME;
            return; // позиция не меняется
        }

        if (this.faults.hasFault(FAULTS.LIFT_OVERLOAD_2)) {
            this.values.current = peekValueInRange(LIFT_CONSTANTS.CURRENT_RANGE.OVERLOAD);
            timeout = LIFT_CONSTANTS.ELEVATE_NEXT_MAX_TIME*1.1;
            return; // позиция не меняется
        }

        this.liftTimer = setTimeout(async () => {
            this.setOnLevel = true;
            this.currentLevel += this.direction;
            // Ограничения
            if (this.currentLevel > this.topLevel) {
                this.currentLevel = this.topLevel;
                this.log(`[EMU] Лифт не может двигаться выше`);
                // this._updateCurrent({ lift: LIFT_CONSTANTS.ELECTR_CURR_STATE.STUCK });
                // this._stopLift();
                return;
            }

            if (this.currentLevel < -1) {
                this.currentLevel = -1;
                return;
            }
            await this._updateLevelSensors();
            // Продолжать движение?
            if ((this.direction === 1 && this.currentLevel < this.topLevel) ||
                (this.direction === -1 && this.currentLevel > -1)
            ) {
                // this.log(`[EMU] Лифт продолжает движение`);
                this._moveStep();
            } else if (this.currentLevel == -1) {
                this.log(`[EMU] Лифт не может двигаться ниже`);
                // console.log(`[EMU] Ток лифта - OVERLOAD`);
                // this.values.current = peekValueInRange(LIFT_CONSTANTS.CURRENT_RANGE.OVERLOAD); // вернуть overload
            }
            this.log(`[EMU] Лифт на уровне ${this.currentLevel}`);

        }, timeout);
    }

    move(flag) {
        this.moving = flag;
        if (this.movingInterval) clearInterval(this.movingInterval);

        if (flag) {
            if (this.faults.hasFault(FAULTS.LIFT_SHORT_CIRCUIT)) {
                this.values.current = peekValueInRange(LIFT_CONSTANTS.CURRENT_RANGE.IDLE);   
                this.values.short = STORAGE_CONSTANSTS.SHORT_CH_VAL;
                this.moving = false;
                return;     
            }
            console.log(`[EMU] Ток лифта - рабочий диапазон`);
            this.values.current = peekValueInRange(LIFT_CONSTANTS.CURRENT_RANGE.WORK_OK);
            this.movingInterval = setInterval(() => {
                if (!this.setOnLevel && this.moving) {
                    this.emitLiftLevel(LIFT_CONSTANTS.LIFT_LEVEL_OFF);
                    this.emitBottomTamper(LIFT_CONSTANTS.LIFT_BOTTOM_TAMPER_OFF);
                }
            }, 50);
            this.events.emit(EVENTS.MOVE, { direction: this.direction });
        } else {
            this.values.current = peekValueInRange(LIFT_CONSTANTS.CURRENT_RANGE.IDLE);
            this.events.emit(EVENTS.STOP);
            this.log(`[EMU] Лифт остановился на уровне ${this.currentLevel}`);
        }
    }

    async _updateLevelSensors() {
        // Уровень -1
        if (this.currentLevel === -1) {
            if (this.faults.hasFault(FAULTS.BOTTOM_TAMPER_FAIL)) 
                return;
            this.emitBottomTamper(LIFT_CONSTANTS.LIFT_BOTTOM_TAMPER_ON);
            await sleep(50);
            return;
        }

        // Уровень 0 → двойной импульс
        /*if (this.currentLevel === 0) {
            this.emitLiftLevel(LIFT_CONSTANTS.LIFT_LEVEL_ON);
            // this.log(`[EMU] Двойной импульс - 1-1`);

            let time = performance.now();
            // this.log(`[EMU] Время между триггерами датчика положения ${time - this.lastLevelEventTime} мс`);
            this.lastLevelEventTime = time;
            
            await sleep(50);
            // setTimeout(() => {
            this.emitLiftLevel(LIFT_CONSTANTS.LIFT_LEVEL_OFF);
            // this.log(`[EMU] Двойной импульс - 1-0`);
            // }, 50);
            await sleep(this.zeroPulseGap/2)
            // this.liftTimer = setTimeout(() => {
            this.emitLiftLevel(LIFT_CONSTANTS.LIFT_LEVEL_ON);
            // this.log(`[EMU] Двойной импульс - 2-1`);
            time = performance.now();
            // this.log(`[EMU] Время между триггерами датчика положения ${time - this.lastLevelEventTime} мс`);
            this.lastLevelEventTime = time;
            await sleep(50);
            // }, this.zeroPulseGap/2);
            
            return;
        }*/
        // Обычный уровень (1–8)
        if (this.currentLevel >= 0 && this.currentLevel <= this.topLevel) {
            this.emitLiftLevel(LIFT_CONSTANTS.LIFT_LEVEL_ON);
            await sleep(50);
            // this.log(`[EMU] Сигнал уровень лифта - 1`);
        }
    }

    emitLiftLevel(val) {
        // this.log(`[EMU] Сигнал уровень лифта - 1`);
        if (!this.faults.hasFault(FAULTS.LEVEL_SENSOR_FAIL)) {
            this.values.liftLevelSensor = val;
            if (val == LIFT_CONSTANTS.LIFT_LEVEL_ON)
                this.events.emit(EVENTS.LEVEL, { level: this.currentLevel });
        }
    }

    emitBottomTamper(val) {
        // this.log(`[EMU] Сигнал нижнего тампера - ${val}`);
        if (!this.faults.hasFault(FAULTS.BOTTOM_TAMPER_FAIL)) {
            this.values.liftBottomTamper = val;
            if (val == LIFT_CONSTANTS.LIFT_BOTTOM_TAMPER_ON)
                this.events.emit(EVENTS.BOTTOM_TAMPER, { value: val });
        }
    }
}

class CellSection {
        /**
     * 
     * @param {object} param0
     * @param {EventEmitter2} param0.events 
     * @param {Function} param0.log 
     * @param {} param0.channels 
     */
    constructor({ events, log, channels }) {
        this.events = events
        this.channels = channels;
        this.bitmask = new BitMask(50);
        this.bitmask.lockAll();
        
        this.log = log;
        this.values = this.getDefaultValues();
        this.faults = new FaultBehavior();

        this.matrix = new Matrix({ rows: 5, cols: 10 });
        this.matrix.onOn = this._unlockOn.bind(this);
        this.matrix.onOff = this._unlockOff.bind(this);
    }

    getState() {
        return { ...this.values };
    }

    getDefaultValues() {
        return {
            tamper: this.bitmask.mask,
            current: peekValueInRange(CELL_CONSTANTS.CURRENT_RANGE.IDLE),
            short: 0,
        };
    }

    _unlockOn({ row, col }) {
        console.log(`[EMU] Открытие замка постамата [${row}, ${col}]`);

        if (this.faults.hasFault(FAULTS.ACTUATOR_NO_POWER)) {
            this.values.current = peekValueInRange(CELL_CONSTANTS.CURRENT_RANGE.IDLE);
            return;
        }

        if (this.faults.hasFault(FAULTS.ACTUATOR_SHORT_CIRCUIT)) {
            this.values.short = STORAGE_CONSTANSTS.SHORT_CH_VAL;
            this.values.current = peekValueInRange(CELL_CONSTANTS.CURRENT_RANGE.IDLE);
            return;
        }

        if (this.faults.hasFault(FAULTS.ACTUATOR_OVERLOAD_1)) {
            this.values.current = peekValueInRange(CELL_CONSTANTS.CURRENT_RANGE.OVERLOAD);
        } else {
            this.values.current = peekValueInRange(CELL_CONSTANTS.CURRENT_RANGE.WORK_OK);

            if (!this.faults.hasFault(FAULTS.TAMPER_ERROR)) {

                this.unlockTimeout = setTimeout(() => {
                    let ind = row * this.matrix.cols + col;
                    this.bitmask.setUnlocked(ind);
                    this.values.tamper = this.bitmask.mask.toString();

                    this.emitUnlocked({ row, col });

                }, CELL_CONSTANTS.UNLOCK_TIMEOUT);
            }
        }
    }

    _unlockOff({ row, col }) {
        this.log(`[EMU] Выключение замка [${row}, ${col}]`);
        if (this.matrix.countActive == 0)
            this.values.current = peekValueInRange(CELL_CONSTANTS.CURRENT_RANGE.IDLE);
    }

    emitUnlocked({ row, col }) {
        console.log(`[EMU] Выдана 1 ед. ТМЦ со спирали [${row}, ${col}]`);
        this.events.emit(EVENTS.CELL_UNLOCKED, { row, col });
    }

    injectLock(ind) {
        try {
            this.bitmask.setLocked(ind);
        } catch (e) {
            this.log(`[EMU] ${e}`);
        }
    }

    reset() {
        this.matrix.reset();
        this.values = this.getDefaultValues();
        this.bitmask.lockAll();
        this.faults.clearAllFaults();
    }
}

class FaultBehavior {
    constructor() {
        this.faultState = new Set();
    }

    setFault(fault, opts) {
        this.faultState.add(fault);
    }

    clearFault(fault) {
        this.faultState.delete(fault);
    }

    clearAllFaults() {
        this.faultState.clear();
    }

    hasFault(fault) {
        return this.faultState.has(fault);
    }
}

class FaultAdapter {
    constructor({ emu, events, config }) {
        /** @type {DeviceEmulator} */
        this.emu = emu;
        this.events = events;
        /** @type {EventEmitter2} */
        this.rules = config?.rules ?? [];

        this.runtime = {
            dispenseCounters: new Map(), // key: "row-col"
            unlockCounters: new Map(),
            timers: []
        };

        this._init();
    }
    /* ========================= INIT ========================= */
    _init() {
        for (const rule of this.rules) {
            this._registerRule(rule);
        }
        // immediate triggers
        for (const rule of this.rules) {
            if (rule.trigger?.type === 'immediate') {
                this._applyAction(rule);
            }
        }
    }
    /* ========================= REGISTRATION ========================= */
    _registerRule(rule) {
        const { trigger } = rule;
        if (!trigger) return;
        // TIME trigger отдельно
        if (trigger.type === 'time') {
            const t = setTimeout(() => {
                this._applyAction(rule);
            }, trigger.afterMs);

            this.runtime.timers.push(t);
            return;
        }
        const eventName = this._mapTriggerToEvent(trigger);
        if (!eventName) return;

        const handler = (payload) => {
            if (!this.emu) return; //TODO remove handler
            if (!this._matchTrigger(rule, payload)) return;
            this._applyAction(rule);
        };

        this.events.on(eventName, handler);
    }
    /* ========================= TRIGGER MAPPING ========================= */
    _mapTriggerToEvent(trigger) {
        switch (trigger.type) {
            case 'dispense_count':
            case 'after_dispense_level':
                return EVENTS.DISPENSED;

            case 'on_move':
                return EVENTS.LEVEL;

            case 'cell_unlocked':
                return EVENTS.CELL_UNLOCKED;

            case 'event':
                return trigger.name;

            default:
                return null;
        }
    }
    /* ========================= TRIGGER MATCH ========================= */
    _matchTrigger(rule, payload = {}) {
        const { trigger, target, id } = rule;

        switch (trigger.type) {

            case 'dispense_count': {
                if (target !== TARGET.SPIRAL) return false;

                const key = `${id.row}-${id.col}`;

                // событие не про эту ячейку
                if (payload.row !== id.row || payload.col !== id.col)
                    return false;

                const prev = this.runtime.dispenseCounters.get(key) || 0;
                const next = prev + 1;

                this.runtime.dispenseCounters.set(key, next);

                return next === trigger.value;
            }

            case 'after_dispense_level': {
                return payload.level === trigger.level;
            }

            case 'unlock_count': {
                if (target !== TARGET.CELL) return false;

                const key = `${id.row}-${id.col}`;

                // событие не про эту ячейку
                if (payload.row !== id.row || payload.col !== id.col)
                    return false;

                const prev = this.runtime.unlockCounters.get(key) || 0;
                const next = prev + 1;

                this.runtime.unlockCounters.set(key, next);

                return next === trigger.value;
            }

            case 'on_move': {
                // проверка направления через emu
                const dirMatch =
                    (trigger.direction === 'up' && this.emu.lift.direction === 1) ||
                    (trigger.direction === 'down' && this.emu.lift.direction === -1);

                if (!dirMatch) return false;
                // console.log(`${payload.level} >= ${trigger.afterLevel}`);
                if (trigger.afterLevel !== undefined) {
                    return payload.level >= trigger.afterLevel;
                }

                return true;
            }

            case 'event':
                return true;

            default:
                return false;
        }
    }
    /* ========================= ACTION ========================= */
    _applyAction(rule) {
        const { action, target, id } = rule;

        if (!action || !target) return;

        if (action.type === 'setFault') {

            if (target === TARGET.SPIRAL) {
                this.emu.spiralSection.faults.setFault(FAULTS[action.fault]);
            } else if (target == TARGET.LIFT) {
                this.emu.lift.faults.setFault(FAULTS[action.fault]);
            } else if (target == TARGET.CELL) {
                this.emu.cellSection.faults.setFault(FAULTS[action.fault], { id });
            }
        }

        if (action.type === 'clearFault') {

            if (target === TARGET.CELL) {
                this.emu.cellSection.faults.clearFault(FAULTS[action.fault]);
            } else if (target == TARGET.SPIRAL) {
                this.emu.spiralSection.faults.clearFault(FAULTS[action.fault]);
            } else if (target == TARGET.LIFT) {
                this.emu.lift.faults.clearFault(FAULTS[action.fault]);
            }
        }
    }
    /* ========================= CLEANUP ========================= */
    destroy() {
        for (const t of this.runtime.timers) {
            clearTimeout(t);
        }
        this.runtime.timers = [];
        this.emu = null;
        this.events = null;
    }
}

module.exports = { DeviceEmulator, FAULTS };