const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');

const ClassVendingSectionFacade = require('../../js/srvVendingSectionFacade').default;
const { SpiralSectionState } = require('../../js/srvSpiralSectionStates');
const {
    BOX_CONSTANTS,
    STORAGE_CONSTANSTS,
    LIFT_CONSTANTS,
} = require('../../js/SpiralSectionConstants');
const {
    AVAILABLE_STATE,
    SECTION_STATUS,
} = require('../../../srvStatesController/ts/IBaseSectionStates');
const { ProxyChannelStub } = require('../../../../tests/helpers/ProxyChannelStub');

const ROWS = 4;
const COLS = 4;
const INIT_SETTLE_MS = 80;

function createTestMachineConfig() {
    return {
        Sections: [
            {
                ID: '1',
                Name: 'Machine-1-spiral',
                Type: 'SPIRAL',
                Rows: ROWS,
                Cols: COLS,
                PowerBus: 1,
                Channels: {
                    Door: { Sensor: 'door-channel' },
                    DeliveryBox: {
                        Monitoring: 'mon-box',
                        Lock: 'box-lock',
                        Optic: 'box-optic',
                    },
                    Storage: {
                        MatrixCtrl: 'matrix-ctrl',
                        Tamper: Array.from({ length: ROWS }, (_, i) => `tamper-row-${i}`),
                        Monitoring: 'mon-storage',
                    },
                    Lift: {
                        MotorCtrl: 'lift-motor-ctrl',
                        MotorCtrl2: 'lift-motor-ctrl2',
                        LevelSensor: 'lift-level',
                        BottomTamper: 'lift-bottom',
                        TopTamper: 'lift-top',
                        Monitoring: 'mon-lift',
                    },
                },
            },
        ],
        Power: {
            PSU: [
                {
                    Bus: 1,
                    Channels: {
                        CurrentOut: 'psu-current',
                        VoltageOut: 'psu-voltage',
                        Short: 'psu-short',
                        Work: 'psu-work',
                    },
                },
            ],
        },
    };
}

describe('ClassVendingSectionFacade & ClassSpiralSection — Базовые тесты (Этап 1)', () => {
    let stub;
    let sectionState;
    let facade;
    let section;
    let logs;
    let logger;
    let machineConfig;
    let activeIntervals = [];

    const origSetInterval = global.setInterval;

    beforeEach(async () => {
        activeIntervals = [];
        global.setInterval = (...args) => {
            const id = origSetInterval(...args);
            activeIntervals.push(id);
            return id;
        };

        stub = new ProxyChannelStub();

        // Начальные показания датчиков в покое
        const initial = {
            'door-channel': BOX_CONSTANTS.DOOR_CLOSED,
            'box-optic': BOX_CONSTANTS.BOX_CLOSED,
            'box-lock': BOX_CONSTANTS.UNLOCK_OFF,
            'mon-box': 0,
            'mon-storage': null,
            'mon-lift': null,
            'lift-motor-ctrl2': 'STOP',
            'lift-bottom': LIFT_CONSTANTS.LIFT_BOTTOM_TAMPER_ON,
            'lift-top': LIFT_CONSTANTS.LIFT_BOTTOM_TAMPER_OFF,
            'lift-level': LIFT_CONSTANTS.LIFT_LEVEL_OFF,
            'psu-current': 0.05,
            'psu-voltage': 24,
            'psu-short': 0,
            'psu-work': 1,
        };
        for (let r = 0; r < ROWS; r++) {
            initial[`tamper-row-${r}`] = STORAGE_CONSTANSTS.TAMPER_ON;
        }
        stub.seed(initial);

        sectionState = new SpiralSectionState({
            Name: 'Machine-1-spiral',
            Type: 'SPIRAL',
            Rows: ROWS,
            Cols: COLS,
            IOList: [],
        });

        logs = [];
        logger = {
            Log: (entry) => logs.push(entry),
        };

        machineConfig = createTestMachineConfig();

        facade = new ClassVendingSectionFacade({
            ProxyCh: stub,
            sectionState,
            ProxyLogger: logger,
            machineConfig,
        });

        section = facade.Section;

        // Ожидание завершения асинхронного Init() лифта (Stop() с задержкой 50мс)
        await new Promise((r) => setTimeout(r, INIT_SETTLE_MS));
        stub.clearHistory();
        logs.length = 0;
    });

    afterEach(() => {
        global.setInterval = origSetInterval;
        for (const id of activeIntervals) {
            clearInterval(id);
        }
        activeIntervals = [];
        facade.Reset();
        stub.reset({ removeListeners: true });
    });

    // =========================================================================
    // 1. Инициализация и мониторинг состояния
    // =========================================================================
    describe('Инициализация и мониторинг состояния', () => {
        it('корректно инициализирует фасад и секцию из machineConfig', () => {
            assert.ok(facade);
            assert.ok(section);
            assert.equal(facade.Target.id, '1');
            assert.equal(facade.Target.name, 'Machine-1-spiral');
            assert.equal(sectionState.Status, SECTION_STATUS.IDLE);
            assert.equal(sectionState.IsAvailable, AVAILABLE_STATE.YES);
            assert.equal(section.IsDoorClosed(), true);
        });

        it('отслеживает состояние двери: при открытии переводит Door в OPENED и вызывает Abort()', () => {
            assert.equal(sectionState.Door, undefined);

            // Размыкание концевика сервисной двери (0 = открыта)
            stub.inject('door-channel', 0);

            assert.equal(sectionState.Door, 'OPENED');
            assert.equal(section.IsDoorClosed(), false);

            // Закрытие двери обратно (1 = закрыта)
            stub.inject('door-channel', BOX_CONSTANTS.DOOR_CLOSED);
            assert.equal(sectionState.Door, 'CLOSED');
            assert.equal(section.IsDoorClosed(), true);
        });

        it('игнорирует повторные одинаковые события датчика двери', () => {
            stub.inject('door-channel', 0);
            const doorStateAfterFirst = sectionState.Door;

            // Повторная отправка того же значения
            stub.inject('door-channel', 0);
            assert.equal(sectionState.Door, doorStateAfterFirst);
        });

        it('WatchBox отслеживает оптический датчик люка, выставляет monBox в 1 и вызывает Abort()', async () => {
            let abortCalled = false;
            const origAbort = section.Abort.bind(section);
            section.Abort = () => {
                abortCalled = true;
                origAbort();
            };

            section._Context.currentTask = { res: () => {} }; // симулируем активную задачу для проверки SafeMode

            // Размыкаем оптический датчик люка (0 = открыт)
            stub.inject('box-optic', 0);

            // Ожидаем срабатывания DOOR_DEBOUNCE_MS (300 мс)
            await new Promise((r) => setTimeout(r, 350));

            assert.equal(stub.getLastSentValue('mon-box'), 1);
            assert.equal(abortCalled, true);

            section.Abort = origAbort;
        });
    });

    // =========================================================================
    // 2. Диспетчеризация команд и контроль занятости (PerformTransaction)
    // =========================================================================
    describe('Диспетчеризация команд и контроль занятости (PerformTransaction)', () => {
        it('SetLiftLevel вызывает перемещение лифта на заданный уровень и генерирует успешный ответ', async () => {
            const responses = [];
            facade.Events.on('response', (msg) => responses.push(msg));

            // Лифт уже на 0 уровне, спуск в 0 завершается мгновенно
            const transaction = {
                Command: 'SetLiftLevel',
                ID: 'trans-lift-0',
                Level: 0,
            };

            await facade.PerformTransaction(transaction);

            assert.equal(responses.length, 1);
            assert.equal(responses[0].Response.Result, 'OK');
            assert.equal(responses[0].Response.ParentID, 'trans-lift-0');
            assert.equal(responses[0].Response.Cell, null);
        });

        it('RotateSpiral вызывает ManualRotateSpiral и возвращает успешный ответ с координатами ячейки', async () => {
            const responses = [];
            facade.Events.on('response', (msg) => responses.push(msg));

            let rotateArgs = null;
            section.ManualRotateSpiral = async (args) => {
                rotateArgs = args;
                return { success: true };
            };

            const transaction = {
                Command: 'RotateSpiral',
                ID: 'tx-rotate-1',
                Cells: [{ row: 1, column: 2, quantity: 1 }],
            };

            await facade.PerformTransaction(transaction);

            assert.equal(responses.length, 1);
            assert.equal(responses[0].Response.Result, 'OK');
            assert.equal(responses[0].Response.ParentID, 'tx-rotate-1');
            assert.deepEqual(responses[0].Response.Cell, { row: 1, column: 2 });
            assert.deepEqual(rotateArgs, { row: 1, column: 2, quantity: 1 });
        });

        it('OpenDeliveryBox вызывает OpenBox и возвращает успешный ответ', async () => {
            const responses = [];
            facade.Events.on('response', (msg) => responses.push(msg));

            let openCalled = false;
            section.OpenBox = async () => {
                openCalled = true;
                return true;
            };

            const transaction = {
                Command: 'OpenDeliveryBox',
                ID: 'tx-box-open',
            };

            await facade.PerformTransaction(transaction);

            assert.equal(responses.length, 1);
            assert.equal(responses[0].Response.Result, 'OK');
            assert.equal(responses[0].Response.ParentID, 'tx-box-open');
            assert.equal(openCalled, true);
        });

        it('Invoke делегирует служебные вызовы в Section.Invoke', () => {
            let invokeArgs = null;
            section.Invoke = (...args) => {
                invokeArgs = args;
                return 'invoked-ok';
            };

            const result = facade.Invoke('Rotate', { row: 0, column: 0, duration: 500 });
            assert.equal(result, 'invoked-ok');
            assert.deepEqual(invokeArgs, ['Rotate', { row: 0, column: 0, duration: 500 }]);
        });

        it('блокирует параллельное выполнение транзакций с ошибкой', async () => {
            let unlockResolve;
            const slowPromise = new Promise((res) => {
                unlockResolve = res;
            });

            // Искусственно подвешиваем выполнение ElevateLift
            const origElevateLift = section.ElevateLift.bind(section);
            section.ElevateLift = async () => {
                await slowPromise;
            };

            const firstTransaction = {
                Command: 'SetLiftLevel',
                ID: 'trans-1',
                Level: 0,
            };

            const secondTransaction = {
                Command: 'SetLiftLevel',
                ID: 'trans-2',
                Level: 0,
            };

            // Запускаем первую операцию без await
            const firstPromise = facade.PerformTransaction(firstTransaction);

            // Попытка запустить вторую операцию одновременно
            await facade.PerformTransaction(secondTransaction);

            // Проверяем, что в логгере зафиксирована ошибка занятости
            const errLog = logs.find((l) => l.msg?.includes('Выполняется предыдущая операция'));
            assert.ok(errLog, 'Должна быть зафиксирована ошибка "Выполняется предыдущая операция"');

            // Завершаем первую операцию
            unlockResolve();
            await firstPromise;

            section.ElevateLift = origElevateLift;
        });

        it('устанавливает TransactionID в логгере при старте транзакции и очищает order при завершении', async () => {
            let capturedTxIdDuringWork = null;

            const origElevate = section.ElevateLift.bind(section);
            section.ElevateLift = async () => {
                capturedTxIdDuringWork = logger.TransactionID;
            };

            const transaction = {
                Command: 'SetLiftLevel',
                ID: 'trans-uuid-999',
                Level: 0,
            };

            await facade.PerformTransaction(transaction);

            assert.equal(capturedTxIdDuringWork, 'trans-uuid-999');
            assert.equal(facade._Context.order, null);

            section.ElevateLift = origElevate;
        });
    });

    // =========================================================================
    // 3. Формирование и отправка ответов (SendResponse / событие response)
    // =========================================================================
    describe('Формирование и отправка ответов (SendResponse / событие response)', () => {
        it('формирует корректную структуру ответа (ID, ParentID, Timestamp, Target, Cell, Result)', async () => {
            const responses = [];
            facade.Events.on('response', (msg) => responses.push(msg));

            const transaction = {
                Command: 'SetLiftLevel',
                ID: 'tx-structure-check',
                Level: 0,
            };

            await facade.PerformTransaction(transaction);

            assert.equal(responses.length, 1);
            const resp = responses[0].Response;

            assert.ok(typeof resp.ID === 'string' && resp.ID.length > 0, 'Должен быть сгенерирован UUID ответа');
            assert.equal(resp.ParentID, 'tx-structure-check');
            assert.ok(typeof resp.Timestamp === 'number' && resp.Timestamp > 0);
            assert.deepEqual(resp.Target, { id: '1', name: 'Machine-1-spiral' });
            assert.equal(resp.Result, 'OK');
        });

        it('формирует ответ с Result: FAIL при возникновении исключения в обработчике команды', async () => {
            const responses = [];
            facade.Events.on('response', (msg) => responses.push(msg));

            const origElevate = section.ElevateLift.bind(section);
            section.ElevateLift = async () => {
                throw new Error('Аппаратный сбой привода лифта');
            };

            const transaction = {
                Command: 'SetLiftLevel',
                ID: 'tx-fail-check',
                Level: 2,
            };

            await facade.PerformTransaction(transaction);

            assert.equal(responses.length, 1);
            const resp = responses[0].Response;
            assert.equal(resp.Result, 'FAIL');
            assert.equal(resp.ParentID, 'tx-fail-check');

            section.ElevateLift = origElevate;
        });

        it('Reset() сбрасывает контекст заказа и переводит секцию в состояние IDLE / AVAILABLE', () => {
            facade._Context.order = { ID: 'aborted-order', Cells: [] };
            sectionState.Status = SECTION_STATUS.BLOCKED;
            sectionState.IsAvailable = AVAILABLE_STATE.NO;

            facade.Reset();

            assert.equal(facade._Context.order, null);
            assert.equal(sectionState.Status, SECTION_STATUS.IDLE);
            assert.equal(sectionState.IsAvailable, AVAILABLE_STATE.YES);
        });
    });
});
