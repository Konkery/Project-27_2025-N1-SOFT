const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');

const { ClassSpiralSectionLift } = require('../../../js/srvSpiralSectionLift');
const { LIFT_CONSTANTS, COMMON_CONSTANTS, FAULTS } = require('../../../js/SpiralSectionConstants');
const { SpiralSectionState, LIFT_STATE } = require('../../../js/srvSpiralSectionStates');
const { ClassFault: Fault } = require('../../../js/srvUtils');
const { ProxyChannelStub } = require('../../helpers/ProxyChannelStub');
const { Lift } = require('../../../js/Emu');

// --- Константы, отражающие внутренние параметры ClassSpiralSectionLift (не вынесенные в SpiralSectionConstants) ---
const BOTTOM_LEVEL = 0;
const CURR_BUFFER_SIZE = 5;

// --- Константы тестовой фикстуры и граничных сценариев ---
const SECTION_ROWS = 6;
const SECTION_COLS = 8;
const BUS_NUMBER = 1;
const MAX_LEVEL = 6;

const MIDPOINT_DIVISOR = 2;
const SHORT_EXCESS_CURRENT = 10;
const NEGATIVE_CURRENT_SAMPLE = -0.5;
const SAFE_CURRENT_MARGIN = 0.5;
const SHORT_CURRENT_DELTA = 0.01;
const NOMINAL_TEST_CURRENT = 0.1;
const SAFE_VOLTAGE_DELTA = 0.1;
const DEEP_VOLTAGE_DROP_DELTA = 5;

const TEST_BUFFER_CURRENT_SAMPLE = 1.25;
const TEST_BUFFER_VOLTAGE_SAMPLE = 24.2;

const INITIAL_NOPOWER_COUNT = 2;
const INITIAL_OVERLOAD_COUNT = 1;

describe('ClassSpiralSectionLift — утилитарные и вспомогательные функции (без управления моторами)', () => {
    let stub;
    let emuLift;
    let channels;
    let sectionState;
    let logs;
    let proxyLogger;
    let lift;
    let activeIntervals = [];

    // Перехватываем setInterval, чтобы гарантированно очищать фоновый StartPSUWatch() после каждого теста
    const origSetInterval = global.setInterval;

    beforeEach(() => {
        activeIntervals = [];
        global.setInterval = (...args) => {
            const id = origSetInterval(...args);
            activeIntervals.push(id);
            return id;
        };

        channels = {
            liftMotorCtrl: 'lift-motor-ctrl',
            liftMotorCtrl2: 'lift-motor-ctrl2',
            liftBottomTamper: 'lift-bottom-tamper',
            liftTopTamper: 'lift-top-tamper',
            liftLevelSensor: 'lift-level-sensor',
            current: 'lift-current',
            voltage: 'lift-voltage',
            short: 'lift-short',
            psuWork: 'lift-psu-work',
            monLift: 'mon-lift',
        };

        stub = new ProxyChannelStub();
        emuLift = new Lift({ proxy: stub, channels });
        emuLift.seedDefaultSensors();

        sectionState = new SpiralSectionState({
            Name: 'spiral-test',
            Type: 'SPIRAL',
            Rows: SECTION_ROWS,
            Cols: SECTION_COLS,
            IOList: [],
        });

        logs = [];
        proxyLogger = {
            Log: (entry) => logs.push(entry),
        };

        lift = new ClassSpiralSectionLift({
            ProxyCh: stub,
            channels,
            advOpts: { busNumber: BUS_NUMBER, maxLevel: MAX_LEVEL },
            sectionState,
            ProxyLogger: proxyLogger,
        });

        stub.clearHistory();
        logs.length = 0;
    });

    afterEach(() => {
        global.setInterval = origSetInterval;
        for (const id of activeIntervals) {
            clearInterval(id);
        }
        activeIntervals = [];
        stub.reset({ removeListeners: true });
    });

    // =========================================================================
    // 1. CheckCurrentState(currVal)
    // =========================================================================
    describe('CheckCurrentState()', () => {
        const { CURRENT_RANGE, ELECTR_CURR_STATE } = LIFT_CONSTANTS;

        it('классифицирует переданный аргумент currVal по диапазонам [low, high) из LIFT_CONSTANTS.CURRENT_RANGE', () => {
            const [idleLow, idleHigh] = CURRENT_RANGE.IDLE;       // [0, 0.08)
            const [workLow, workHigh] = CURRENT_RANGE.WORK_OK;    // [0.08, 2)
            const [ovlLow, ovlHigh] = CURRENT_RANGE.OVERLOAD;     // [2, 5)
            const [shortLow] = CURRENT_RANGE.SHORT;               // [5, Infinity)

            // Диапазон IDLE
            assert.equal(lift.CheckCurrentState(idleLow), ELECTR_CURR_STATE.IDLE);
            assert.equal(lift.CheckCurrentState((idleLow + idleHigh) / MIDPOINT_DIVISOR), ELECTR_CURR_STATE.IDLE);

            // Верхняя граница IDLE является нижней границей WORK_OK
            assert.equal(lift.CheckCurrentState(workLow), ELECTR_CURR_STATE.WORK_OK);
            assert.equal(lift.CheckCurrentState((workLow + workHigh) / MIDPOINT_DIVISOR), ELECTR_CURR_STATE.WORK_OK);

            // Верхняя граница WORK_OK является нижней границей OVERLOAD ('STUCK')
            assert.equal(lift.CheckCurrentState(ovlLow), ELECTR_CURR_STATE.OVERLOAD);
            assert.equal(lift.CheckCurrentState((ovlLow + ovlHigh) / MIDPOINT_DIVISOR), ELECTR_CURR_STATE.OVERLOAD);

            // Верхняя граница OVERLOAD является нижней границей SHORT
            assert.equal(lift.CheckCurrentState(shortLow), ELECTR_CURR_STATE.SHORT);
            assert.equal(lift.CheckCurrentState(shortLow + SHORT_EXCESS_CURRENT), ELECTR_CURR_STATE.SHORT);
        });

        it('берет усредненное значение из буфера _I_CurrBuffer.Filter(), если аргумент currVal не передан', () => {
            const workSample = (CURRENT_RANGE.WORK_OK[0] + CURRENT_RANGE.WORK_OK[1]) / MIDPOINT_DIVISOR;
            emuLift.setCurrent(workSample, { pushToBuffer: true, samples: CURR_BUFFER_SIZE });

            assert.equal(lift.CheckCurrentState(), ELECTR_CURR_STATE.WORK_OK);

            const overloadSample = (CURRENT_RANGE.OVERLOAD[0] + CURRENT_RANGE.OVERLOAD[1]) / MIDPOINT_DIVISOR;
            emuLift.setCurrent(overloadSample, { pushToBuffer: true, samples: CURR_BUFFER_SIZE });

            assert.equal(lift.CheckCurrentState(), ELECTR_CURR_STATE.OVERLOAD);
        });

        it('возвращает undefined, если буфер тока пуст и аргумент currVal не передан или отрицателен', () => {
            lift._I_CurrBuffer.Clear();

            assert.equal(lift.CheckCurrentState(), undefined);
            assert.equal(lift.CheckCurrentState(NEGATIVE_CURRENT_SAMPLE), undefined);
        });
    });

    // =========================================================================
    // 2. InBottomPos()
    // =========================================================================
    describe('InBottomPos()', () => {
        it('возвращает true, когда на канале liftBottomTamper значение LIFT_BOTTOM_TAMPER_ON', () => {
            emuLift.setBottomTamper(true, { emit: false });
            assert.equal(lift.InBottomPos(), true);
        });

        it('возвращает false, когда на канале liftBottomTamper значение LIFT_BOTTOM_TAMPER_OFF или undefined', () => {
            emuLift.setBottomTamper(false, { emit: false });
            assert.equal(lift.InBottomPos(), false);

            stub.inject(channels.liftBottomTamper, undefined, { emit: false });
            assert.equal(lift.InBottomPos(), false);
        });
    });

    // =========================================================================
    // 3. IsShorted()
    // =========================================================================
    describe('IsShorted()', () => {
        const shortThresholdI = LIFT_CONSTANTS.CURRENT_RANGE.SHORT[0]; // 5A
        const minVoltage = COMMON_CONSTANTS.MIN_VOLTAGE;               // 16V

        it('возвращает false при штатном токе и нормальном напряжении (> MIN_VOLTAGE)', () => {
            emuLift.setCurrent(shortThresholdI - SAFE_CURRENT_MARGIN, { pushToBuffer: false });
            emuLift.setVoltage(LIFT_CONSTANTS.WORK_VOLTAGE, { pushToBuffer: false });

            assert.equal(lift.IsShorted(), false);
        });

        it('возвращает true при превышении порога тока КЗ (current > CURRENT_RANGE.SHORT[0]), даже если напряжение в норме', () => {
            emuLift.setVoltage(LIFT_CONSTANTS.WORK_VOLTAGE, { pushToBuffer: false });

            // На самой границе (> 5) еще false
            emuLift.setCurrent(shortThresholdI, { pushToBuffer: false });
            assert.equal(lift.IsShorted(), false);

            // Строго больше порога -> true
            emuLift.setCurrent(shortThresholdI + SHORT_CURRENT_DELTA, { pushToBuffer: false });
            assert.equal(lift.IsShorted(), true);
        });

        it('возвращает true при просадке напряжения (voltage <= COMMON_CONSTANTS.MIN_VOLTAGE), даже если ток в норме', () => {
            emuLift.setCurrent(NOMINAL_TEST_CURRENT, { pushToBuffer: false });

            // Чуть выше порога -> false
            emuLift.setVoltage(minVoltage + SAFE_VOLTAGE_DELTA, { pushToBuffer: false });
            assert.equal(lift.IsShorted(), false);

            // Равно порогу (<= 16V) -> true
            emuLift.setVoltage(minVoltage, { pushToBuffer: false });
            assert.equal(lift.IsShorted(), true);

            // Ниже порога -> true
            emuLift.setVoltage(minVoltage - DEEP_VOLTAGE_DROP_DELTA, { pushToBuffer: false });
            assert.equal(lift.IsShorted(), true);
        });
    });

    // =========================================================================
    // 4. UpdateStatus(fault)
    // =========================================================================
    describe('UpdateStatus()', () => {
        it('корректно маппит коды ошибок FAULTS в состояния sectionState.Lift', () => {
            const cases = [
                { code: FAULTS.BOTTOM_TAMPER_FAIL, expected: LIFT_STATE.ERR_TAMPER },
                { code: FAULTS.IO_DRIVER_ERR,      expected: LIFT_STATE.BLOCKED },
                { code: FAULTS.IO_PORT_ERR,        expected: LIFT_STATE.BLOCKED },
                { code: FAULTS.LEVEL_SENSOR_FAIL,  expected: LIFT_STATE.ERR_LEVEL },
                { code: FAULTS.LIFT_NO_POWER,      expected: LIFT_STATE.NO_POWER },
                { code: FAULTS.LIFT_SHORT_CIRCUIT, expected: LIFT_STATE.SHORT_CIRCUIT },
                { code: FAULTS.LIFT_OVERLOAD,      expected: LIFT_STATE.OVERLOAD },
            ];

            for (const { code, expected } of cases) {
                sectionState.Lift = LIFT_STATE.OK;
                lift.UpdateStatus(new Fault({ code }));
                assert.equal(
                    sectionState.Lift,
                    expected,
                    `Код ошибки ${code} должен переводить Lift в ${expected}`
                );
            }
        });

        it('сбрасывает текущий уровень лифта (lift.Level = undefined) при ошибке датчика уровня FAULTS.LEVEL_SENSOR_FAIL', () => {
            // Сначала фиксируем уровень 0 через срабатывание нижнего концевика
            emuLift.setBottomTamper(false, { emit: true });
            emuLift.setBottomTamper(true, { emit: true });
            assert.equal(lift.Level, BOTTOM_LEVEL);

            // Ошибка тампера не должна сбрасывать знание об уровне
            lift.UpdateStatus(new Fault({ code: FAULTS.BOTTOM_TAMPER_FAIL }));
            assert.equal(lift.Level, BOTTOM_LEVEL);

            // Отказ датчика уровня обязан сбросить currentLevel в undefined
            lift.UpdateStatus(new Fault({ code: FAULTS.LEVEL_SENSOR_FAIL }));
            assert.equal(lift.Level, undefined);
            assert.equal(sectionState.Lift, LIFT_STATE.ERR_LEVEL);
        });

        it('не изменяет sectionState.Lift при неизвестном коде ошибки или FAULTS.NONE', () => {
            sectionState.Lift = LIFT_STATE.OK;
            lift.UpdateStatus(new Fault({ code: FAULTS.NONE }));
            assert.equal(sectionState.Lift, LIFT_STATE.OK);
        });
    });

    // =========================================================================
    // 5. Геттеры состояния: Status, Available, Level, State, EVENTS
    // =========================================================================
    describe('Геттеры Status, Available, Level и EVENTS', () => {
        it('Status возвращает текущее значение sectionState.Lift', () => {
            assert.equal(lift.Status, LIFT_STATE.OK);

            sectionState.Lift = LIFT_STATE.ERR_LEVEL;
            assert.equal(lift.Status, LIFT_STATE.ERR_LEVEL);
        });

        it('Available возвращает false только для критических статусов SHORT_CIRCUIT и OVERLOAD', () => {
            const availableStatuses = [
                LIFT_STATE.OK,
                LIFT_STATE.ERR_TAMPER,
                LIFT_STATE.ERR_LEVEL,
                LIFT_STATE.NO_POWER,
                LIFT_STATE.BLOCKED,
            ];

            for (const st of availableStatuses) {
                sectionState.Lift = st;
                assert.equal(lift.Available, true, `При статусе ${st} лифт должен иметь Available === true`);
            }

            sectionState.Lift = LIFT_STATE.SHORT_CIRCUIT;
            assert.equal(lift.Available, false);

            sectionState.Lift = LIFT_STATE.OVERLOAD;
            assert.equal(lift.Available, false);
        });

        it('Level изначально равен undefined и устанавливается в 0 при срабатывании нижнего тампера', () => {
            assert.equal(lift.Level, undefined);

            emuLift.setBottomTamper(true, { emit: true });
            assert.equal(lift.Level, BOTTOM_LEVEL);
        });

        it('EVENTS содержит полный набор констант событий лифта', () => {
            const events = lift.EVENTS;
            assert.equal(typeof events.ELEVATE_TO_BOTTOM_COMMAND, 'string');
            assert.equal(typeof events.ELEVATE_COMMAND, 'string');
            assert.equal(typeof events.BOTTOM_LEVEL_REACHED, 'string');
            assert.equal(typeof events.COLLECT_LEVEL_REACHED, 'string');
            assert.equal(typeof events.ELEVATE_TIMEOUT, 'string');
            assert.equal(typeof events.FAULT, 'string');
            assert.equal(typeof events.RECOVERED, 'string');
            assert.equal(typeof events.ABORT, 'string');
        });
    });

    // =========================================================================
    // 6. Пассивные обработчики датчиков тока, напряжения и логгеры
    // =========================================================================
    describe('SetCurrentHandler(), SetVoltageHandler(), LogTransaction(), OnStateChanged()', () => {
        it('SetCurrentHandler записывает входящие события канала тока в циклический буфер _I_CurrBuffer', () => {
            lift._I_CurrBuffer.Clear();
            stub.inject(channels.current, TEST_BUFFER_CURRENT_SAMPLE, { emit: true });
            stub.inject(channels.current, TEST_BUFFER_CURRENT_SAMPLE, { emit: true });

            assert.equal(lift._I_CurrBuffer.Filter(), TEST_BUFFER_CURRENT_SAMPLE);
        });

        it('SetVoltageHandler записывает входящие события канала напряжения в буфер _V_VoltBuffer', () => {
            lift._V_VoltBuffer.Clear();
            stub.inject(channels.voltage, TEST_BUFFER_VOLTAGE_SAMPLE, { emit: true });
            stub.inject(channels.voltage, TEST_BUFFER_VOLTAGE_SAMPLE, { emit: true });

            assert.equal(lift._V_VoltBuffer.Filter(), TEST_BUFFER_VOLTAGE_SAMPLE);
        });

        it('LogTransaction и OnStateChanged форматируют и передают диагностические записи в ProxyLogger', () => {
            logs.length = 0;

            lift.LogTransaction('TEST_U_TRANSACTION');
            assert.equal(logs.length, 1);
            assert.deepEqual(logs[0], {
                level: 'D',
                msg: '[LIFT] TEST_U_TRANSACTION',
            });

            lift.OnStateChanged({
                prevState: ClassSpiralSectionLift.STATE.IDLE,
                eventName: lift.EVENTS.ELEVATE_COMMAND,
                state: ClassSpiralSectionLift.STATE.ELEVATING_TO_COLLECT,
            });
            assert.equal(logs.length, 2);
            assert.equal(
                logs[1].msg,
                '[LIFT] STATE: IDLE --[ELEVATE_COMMAND]--> ELEVATING_TO_COLLECT'
            );
        });
    });

    // =========================================================================
    // 7. HandleLevel({ Value }) в режиме покоя (без включения мотора)
    // =========================================================================
    describe('HandleLevel() — фильтрация дублей и сброс счетчиков в состоянии IDLE', () => {
        it('сбрасывает счетчики nopower_count и overload_count при фронте импульса датчика уровня, но не меняет Level в состоянии IDLE', () => {
            lift.nopower_count = INITIAL_NOPOWER_COUNT;
            lift.overload_count = INITIAL_OVERLOAD_COUNT;

            // В состоянии IDLE приход фронта LIFT_BOTTOM_TAMPER_ON сбрасывает счетчики, но не меняет currentLevel
            emuLift.setLevelSensor(true, { emit: true });

            assert.equal(lift.nopower_count, 0);
            assert.equal(lift.overload_count, 0);
            assert.equal(lift.Level, undefined);
            // В канал мониторинга monLift ничего не пишется, так как лифт не в состоянии движения
            assert.equal(stub.getSentValues(channels.monLift).length, 0);
        });

        it('игнорирует повторные одинаковые значения датчика уровня (#_LevelCachedValue)', () => {
            emuLift.setLevelSensor(true, { emit: true });

            lift.nopower_count = INITIAL_NOPOWER_COUNT;
            // Повторная отправка того же самого значения (1) должна быть отфильтрована кэшем
            emuLift.setLevelSensor(true, { emit: true });
            assert.equal(lift.nopower_count, INITIAL_NOPOWER_COUNT);

            // После спада (0) и нового фронта (1) обработчик снова срабатывает
            emuLift.setLevelSensor(false, { emit: true });
            emuLift.setLevelSensor(true, { emit: true });
            assert.equal(lift.nopower_count, 0);
        });
    });
});
