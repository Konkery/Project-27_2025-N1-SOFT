const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');

const { ClassSpiralSectionLift } = require('../../../js/srvSpiralSectionLift');
const { LIFT_CONSTANTS, COMMON_CONSTANTS, FAULTS } = require('../../../js/SpiralSectionConstants');
const { SpiralSectionState, LIFT_STATE } = require('../../../js/srvSpiralSectionStates');
const { ProxyChannelStub } = require('../../helpers/ProxyChannelStub');
const { Lift } = require('../../../js/Emu');

// --- Константы, отражающие внутренние параметры ClassSpiralSectionLift (не вынесенные в SpiralSectionConstants) ---
const BOTTOM_LEVEL = 0;
const PSU_OFF_VAL = 0;
const PSU_ON_VAL = 1;
const MOTOR_STEP_FIRST = 1;
const MON_LIFT_LEVEL_METRIC = 0.15;
const INIT_STOP_SETTLE_MS = 70; // Ожидание стартового Stop() в Init() (где цикл ждет sleep(50))

// --- Константы тестовой фикстуры и сценариев движения ---
const SECTION_ROWS = 6;
const SECTION_COLS = 8;
const BUS_NUMBER = 1;
const MAX_LEVEL = 6;

const TRAVEL_TO_BOTTOM_STEPS = 1;
const TRAVEL_TO_BOTTOM_INTERVAL_MS = 30;
const PARALLEL_OP_STEPS = 0;
const PARALLEL_OP_INTERVAL_MS = 80;

const TARGET_LEVEL_3 = 3;
const START_LEVEL_4 = 4;
const TARGET_LEVEL_2 = 2;
const TARGET_LEVEL_5 = 5;
const DOWN_STEPS_4_TO_2 = 2;

const STEP_INTERVAL_NORMAL_MS = 25;
const STEP_INTERVAL_FAST_MS = 20;
const IN_MOTION_TRIGGER_DELAY_MS = 30;
const RESET_DURING_MOVE_DELAY_MS = 180;

describe('ClassSpiralSectionLift — управление актуаторами и установка лифта в позицию (Hardware & Positioning)', () => {
    let stub;
    /** @type {Lift} */
    let emu;
    let channels;
    let sectionState;
    let logs;
    /** @type {ClassSpiralSectionLift} */
    let lift;
    let activeIntervals = [];

    const origSetInterval = global.setInterval;

    beforeEach(async () => {
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
        emu = new Lift({ proxy: stub, channels });
        emu.seedDefaultHardware({ atBottom: true });

        sectionState = new SpiralSectionState({
            Name: 'spiral-test',
            Type: 'SPIRAL',
            Rows: SECTION_ROWS,
            Cols: SECTION_COLS,
            IOList: [],
        });

        logs = [];
        lift = new ClassSpiralSectionLift({
            ProxyCh: stub,
            channels,
            advOpts: { busNumber: BUS_NUMBER, maxLevel: MAX_LEVEL },
            sectionState,
            ProxyLogger: { Log: (entry) => logs.push(entry) },
        });

        // Дожидаемся завершения стартового this.Stop() в конструкторе (Init -> Stop ждет 50мс)
        await new Promise((r) => setTimeout(r, INIT_STOP_SETTLE_MS));
        stub.clearHistory();
        logs.length = 0;
    });

    afterEach(() => {
        global.setInterval = origSetInterval;
        for (const id of activeIntervals) {
            clearInterval(id);
        }
        activeIntervals = [];
        emu.cleanup();
        stub.reset({ removeListeners: true });
    });

    // =========================================================================
    // 1. Прямые аппаратные команды: OffPSU, OnPSU, MotorStep, StopForce
    // =========================================================================
    describe('Низкоуровневые команды актуаторов: OffPSU(), OnPSU(), MotorStep(), StopForce()', () => {
        it('OffPSU() записывает 0 в канал psuWork, а OnPSU() записывает 1', () => {
            lift.OffPSU();
            assert.equal(stub.getLastSentValue(channels.psuWork), PSU_OFF_VAL);

            lift.OnPSU();
            assert.equal(stub.getLastSentValue(channels.psuWork), PSU_ON_VAL);
            assert.deepEqual(stub.getSentValues(channels.psuWork), [PSU_OFF_VAL, PSU_ON_VAL]);
        });

        it('MotorStep() отправляет команду шагового управления в канал liftMotorCtrl', () => {
            lift.MotorStep('Forward', { step: MOTOR_STEP_FIRST });
            assert.deepEqual(stub.getLastSentValue(channels.liftMotorCtrl), {
                cmd: 'Forward',
                args: [{ step: MOTOR_STEP_FIRST }],
            });
        });

        it('StopForce() немедленно отправляет STOP в канал liftMotorCtrl2 без ожидания затухания тока', () => {
            lift.StopForce();
            assert.equal(stub.getLastSentValue(channels.liftMotorCtrl2), 'STOP');
        });
    });

    // =========================================================================
    // 2. Включение привода: Elevate({ cmd }), ElevateUp(), ElevateDown()
    // =========================================================================
    describe('Включение мотора лифта: Elevate(), ElevateUp(), ElevateDown()', () => {
        it('ElevateUp() предварительно вызывает StopForce("STOP"), затем подает "UP" в liftMotorCtrl2 и дожидается рабочего тока', async () => {
            emu.attachMotorBehavior({ workCurrent: emu.CURR.workOk });

            await lift.ElevateUp();

            assert.deepEqual(stub.getSentValues(channels.liftMotorCtrl2), ['STOP', 'UP']);
        });

        it('ElevateDown() предварительно вызывает StopForce("STOP"), затем подает "DOWN" в liftMotorCtrl2 и дожидается рабочего тока', async () => {
            emu.attachMotorBehavior({ workCurrent: emu.CURR.workOk });

            await lift.ElevateDown();

            assert.deepEqual(stub.getSentValues(channels.liftMotorCtrl2), ['STOP', 'DOWN']);
        });

        it('выбрасывает FAULTS.LIFT_CTRL_UNDEFINED, если еще до подачи команды на мотор ток уже находится в рабочем диапазоне (>= WORK_OK[0])', async () => {
            // Залипший ключ: даже при STOP ток остается рабочим
            emu.attachMotorBehavior({ stopCurrent: emu.CURR.workOk });
            emu.setCurrent(emu.CURR.workOk);

            await assert.rejects(
                () => lift.ElevateUp(),
                (fault) => fault.code === FAULTS.LIFT_CTRL_UNDEFINED
            );

            // Команда 'UP' даже не должна была отправиться, только предварительный 'STOP'
            assert.deepEqual(stub.getSentValues(channels.liftMotorCtrl2), ['STOP']);
        });

        it('выбрасывает FAULTS.LIFT_SHORT_CIRCUIT при обнаружении признаков КЗ после подачи команды движения', async () => {
            emu.attachMotorBehavior({
                workCurrent: emu.CURR.idle,
                shortOnStart: true,
            });

            await assert.rejects(
                () => lift.ElevateUp(),
                (fault) => fault.code === FAULTS.LIFT_SHORT_CIRCUIT
            );
        });

        it('выбрасывает FAULTS.LIFT_NO_POWER, если после подачи команды движения ток не вырос до WORK_OK за время SLEEP_BETWEEN_STEPS', async () => {
            // Мотор не реагирует: ток остается в IDLE
            emu.attachMotorBehavior({ workCurrent: emu.CURR.idle });

            await assert.rejects(
                () => lift.ElevateUp(),
                (fault) => fault.code === FAULTS.LIFT_NO_POWER
            );
        });
    });

    // =========================================================================
    // 3. Остановка привода с контролем тока: Stop()
    // =========================================================================
    describe('Остановка мотора с контролем спада тока: Stop()', () => {
        it('отправляет "STOP" в liftMotorCtrl2 и завершается успешно, когда ток падает ниже WORK_OK[0]', async () => {
            emu.setCurrent(emu.CURR.workOk);
            emu.attachMotorBehavior({ stopCurrent: emu.CURR.idle });

            await lift.Stop();

            assert.equal(stub.getLastSentValue(channels.liftMotorCtrl2), 'STOP');
        });

        it('выбрасывает FAULTS.IO_PORT_ERR, если после команды "STOP" ток не упал до холостого хода за 500 мс', async () => {
            emu.setBottomTamper(true, { emit: false });
            // Ключ пробит: после команды STOP ток продолжает течь
            emu.attachMotorBehavior({ stopCurrent: emu.CURR.workOk });

            await assert.rejects(
                () => lift.Stop(),
                (fault) => fault.code === FAULTS.IO_PORT_ERR
            );
        });

        it('выбрасывает FAULTS.LIFT_SHORT_CIRCUIT при остановке вне нижней позиции, если фиксируется КЗ', async () => {
            emu.setBottomTamper(false, { emit: false });
            stub.onSet(channels.liftMotorCtrl2, (cmd) => {
                if (cmd === 'STOP') {
                    emu.setCurrent(emu.CURR.short);
                }
            });

            await assert.rejects(
                () => lift.Stop(),
                (fault) => fault.code === FAULTS.LIFT_SHORT_CIRCUIT
            );
        });
    });

    // =========================================================================
    // 4. Установка лифта в нижнее положение: ElevateToBottom()
    // =========================================================================
    describe('Установка лифта в положение выдачи (0-й уровень): ElevateToBottom()', () => {
        it('мгновенно завершается и устанавливает Level = 0 без запуска мотора вниз, если лифт уже на нижнем концевике', async () => {
            emu.setBottomTamper(true, { emit: false });
            emu.attachMotorBehavior();

            await lift.ElevateToBottom();

            assert.equal(lift.Level, BOTTOM_LEVEL);
            assert.equal(lift.State, ClassSpiralSectionLift.STATE.IDLE);
            // Команда 'DOWN' не подавалась, вызвался только Stop() при переходе в Idle()
            assert.equal(stub.getSentValues(channels.liftMotorCtrl2).includes('DOWN'), false);
        });

        it('включает движение вниз ("DOWN"), ждет срабатывания liftBottomTamper и останавливает мотор на уровне 0', async () => {
            // Лифт находится выше нижнего концевика
            emu.setBottomTamper(false, { emit: false });
            emu.simulateTravel({
                stepsCount: TRAVEL_TO_BOTTOM_STEPS,
                reachBottom: true,
                stepIntervalMs: TRAVEL_TO_BOTTOM_INTERVAL_MS,
            });

            await lift.ElevateToBottom();

            assert.equal(lift.Level, BOTTOM_LEVEL);
            assert.equal(lift.State, ClassSpiralSectionLift.STATE.IDLE);
            assert.deepEqual(stub.getSentValues(channels.liftMotorCtrl2), ['STOP', 'DOWN', 'STOP']);
        });

        it('отклоняет вызов ElevateToBottom(), если статус лифта SHORT_CIRCUIT или OVERLOAD (!Available)', async () => {
            sectionState.Lift = LIFT_STATE.OVERLOAD;

            await assert.rejects(
                () => lift.ElevateToBottom(),
                /Статус лифта не позволяет начать новую операцию/
            );
        });

        it('отклоняет параллельный вызов операции, пока предыдущая команда перемещения еще выполняется', async () => {
            emu.setBottomTamper(false, { emit: false });
            emu.simulateTravel({
                stepsCount: PARALLEL_OP_STEPS,
                reachBottom: true,
                stepIntervalMs: PARALLEL_OP_INTERVAL_MS,
            });

            const firstTask = lift.ElevateToBottom();
            await assert.rejects(
                () => lift.ElevateToBottom(),
                /Выполняется предыдущая операция/
            );

            await firstTask;
        });
    });

    // =========================================================================
    // 5. Установка лифта на целевой уровень полки: ElevateToLevel(requiredLevel)
    // =========================================================================
    describe('Установка лифта на заданный уровень полки: ElevateToLevel(requiredLevel)', () => {
        beforeEach(async () => {
            // Привязываем лифт к 0-му уровню перед тестами поездок по полкам
            emu.setBottomTamper(true, { emit: false });
            await lift.ElevateToBottom();
            stub.clearHistory();
        });

        it('поднимает лифт с 0-го на 3-й уровень ("UP"), отсчитывая 3 импульса датчика уровня liftLevelSensor, и останавливает привод', async () => {
            emu.simulateTravel({
                stepsCount: TARGET_LEVEL_3,
                stepIntervalMs: STEP_INTERVAL_NORMAL_MS,
            });

            await lift.ElevateToLevel(TARGET_LEVEL_3);

            assert.equal(lift.Level, TARGET_LEVEL_3);
            assert.equal(lift.State, ClassSpiralSectionLift.STATE.IDLE);
            assert.deepEqual(stub.getSentValues(channels.liftMotorCtrl2), ['STOP', 'UP', 'STOP']);
            // На каждом из 3 уровней отправлялась метрика MON_LIFT_LEVEL_METRIC (0.15) в канал мониторинга monLift
            assert.deepEqual(
                stub.getSentValues(channels.monLift),
                Array(TARGET_LEVEL_3).fill(MON_LIFT_LEVEL_METRIC)
            );
        });

        it('опускает лифт с 4-го на 2-й уровень ("DOWN"), уменьшая счетчик уровня на каждом импульсе датчика', async () => {
            // Сначала поднимаем лифт на 4-й уровень
            let off = emu.simulateTravel({
                stepsCount: START_LEVEL_4,
                stepIntervalMs: STEP_INTERVAL_FAST_MS,
            });
            await lift.ElevateToLevel(START_LEVEL_4);
            assert.equal(lift.Level, START_LEVEL_4);
            off();
            stub.clearHistory();

            // Теперь спускаем с 4-го на 2-й уровень (2 импульса вниз)
            off = emu.simulateTravel({
                stepsCount: DOWN_STEPS_4_TO_2,
                stepIntervalMs: STEP_INTERVAL_FAST_MS,
            });
            await lift.ElevateToLevel(TARGET_LEVEL_2);
            off();

            assert.equal(lift.Level, TARGET_LEVEL_2);
            assert.equal(lift.State, ClassSpiralSectionLift.STATE.IDLE);
            assert.deepEqual(stub.getSentValues(channels.liftMotorCtrl2), ['STOP', 'DOWN', 'STOP']);
        });

        it('прерывает подъем с ошибкой FAULTS.LEVEL_SENSOR_FAIL и останавливает мотор при срабатывании верхнего аварийного концевика liftTopTamper', async () => {
            emu.attachMotorBehavior({
                onStartMove: async () => {
                    await new Promise((r) => setTimeout(r, IN_MOTION_TRIGGER_DELAY_MS));
                    // Вместо нужного уровня лифт врезался в верхний аварийный концевик
                    emu.triggerTopTamper();
                },
            });

            await assert.rejects(
                () => lift.ElevateToLevel(TARGET_LEVEL_5),
                (fault) => fault.code === FAULTS.LEVEL_SENSOR_FAIL
            );

            assert.equal(sectionState.Lift, LIFT_STATE.ERR_LEVEL);
            assert.equal(lift.Level, undefined);
            assert.equal(stub.getLastSentValue(channels.liftMotorCtrl2), 'STOP');
        });

        it('Abort() во время подъема останавливает мотор и возвращает автомат лифта в состояние IDLE', async () => {
            emu.attachMotorBehavior({
                onStartMove: async () => {
                    await new Promise((r) => setTimeout(r, IN_MOTION_TRIGGER_DELAY_MS));
                    lift.Abort();
                },
            });

            await lift.ElevateToLevel(START_LEVEL_4);

            assert.equal(lift.State, ClassSpiralSectionLift.STATE.IDLE);
            assert.equal(stub.getLastSentValue(channels.liftMotorCtrl2), 'STOP');
        });
    });
});
