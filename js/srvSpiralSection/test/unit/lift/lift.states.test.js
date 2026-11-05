const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');

const { ClassSpiralSectionLift } = require('../../../js/srvSpiralSectionLift');
const { LIFT_CONSTANTS, FAULTS } = require('../../../js/SpiralSectionConstants');
const { SpiralSectionState, LIFT_STATE } = require('../../../js/srvSpiralSectionStates');
const { ClassFault: Fault } = require('../../../js/srvUtils');
const { ProxyChannelStub } = require('../../helpers/ProxyChannelStub');
const { Lift } = require('../../../js/Emu');

// --- Инженерные константы конфигурации секции ---
const SECTION_ROWS = 6;
const SECTION_COLS = 8;
const BUS_NUMBER = 1;
const MAX_LEVEL = 6;
const BOTTOM_LEVEL_POS = 0;

describe('ClassSpiralSectionLift — управление состояниями и флагами (States & Statuses)', () => {
    let stub;
    let emuLift;
    let channels;
    let sectionState;
    let logs;
    let proxyLogger;
    let lift;
    let activeIntervals = [];

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
        emuLift.cleanup();
        stub.reset({ removeListeners: true });
    });

    // =========================================================================
    // 1. Обновление статуса: UpdateStatus(fault)
    // =========================================================================
    describe('UpdateStatus(fault) — трансляция аварий в статусы цифрового двойника', () => {
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
            assert.equal(lift.Level, BOTTOM_LEVEL_POS);

            // Ошибка тампера не должна сбрасывать знание об уровне
            lift.UpdateStatus(new Fault({ code: FAULTS.BOTTOM_TAMPER_FAIL }));
            assert.equal(lift.Level, BOTTOM_LEVEL_POS);

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
    // 2. Геттеры состояния: Status, Available, Level, State, EVENTS
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
            assert.equal(lift.Level, BOTTOM_LEVEL_POS);
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
    // 3. Логирование смены состояния автомата: OnStateChanged()
    // =========================================================================
    describe('OnStateChanged() — фиксация переходов автомата состояний', () => {
        it('OnStateChanged форматирует и передает диагностические записи в ProxyLogger', () => {
            logs.length = 0;

            lift.OnStateChanged({
                prevState: ClassSpiralSectionLift.STATE.IDLE,
                eventName: lift.EVENTS.ELEVATE_COMMAND,
                state: ClassSpiralSectionLift.STATE.ELEVATING_TO_COLLECT,
            });

            assert.equal(logs.length, 1);
            assert.equal(
                logs[0].msg,
                '[LIFT] STATE: IDLE --[ELEVATE_COMMAND]--> ELEVATING_TO_COLLECT'
            );
        });
    });
});
