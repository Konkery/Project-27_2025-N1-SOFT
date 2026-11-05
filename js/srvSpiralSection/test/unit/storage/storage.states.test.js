const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');

const { ClassSpiralSectionStorage } = require('../../../js/srvSpiralSectionStorage');
const { FAULTS } = require('../../../js/SpiralSectionConstants');
const { SpiralSectionState, SPIRAL_CELL_STATE } = require('../../../js/srvSpiralSectionStates');
const { ProxyChannelStub } = require('../../helpers/ProxyChannelStub');
const { SpiralSection } = require('../../../js/Emu');

// --- Инженерные константы конфигурации матрицы ---
const ROWS = 4;
const COLS = 3;
const BUS_NUMBER = 1;
const TEST_DISPENSED_COUNT = 2;

describe('ClassSpiralSectionStorage — управление состояниями и флагами ячеек (States & Statuses)', () => {
    let stub;
    let emuStorage;
    let channels;
    let sectionState;
    let logs;
    let proxyLogger;
    let storage;
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
            matrixCtrlChannel: 'matrix-ctrl',
            spiralTamperChannels: Array.from({ length: ROWS }, (_, i) => `spiral-tamper-${i}`),
            current: 'storage-current',
            voltage: 'storage-voltage',
            short: 'storage-short',
            psuWork: 'storage-psu-work',
            monSpirals: 'mon-spirals',
        };

        stub = new ProxyChannelStub();
        emuStorage = new SpiralSection({ proxy: stub, channels, size: { rows: ROWS, cols: COLS } });
        emuStorage.seedDefaultSensors();

        sectionState = new SpiralSectionState({
            Name: 'spiral-test',
            Type: 'SPIRAL',
            Rows: ROWS,
            Cols: COLS,
            IOList: [],
        });

        logs = [];
        proxyLogger = {
            Log: (entry) => logs.push(entry),
        };

        storage = new ClassSpiralSectionStorage({
            ProxyCh: stub,
            channels,
            advOpts: {
                busNumber: BUS_NUMBER,
                size: { rows: ROWS, cols: COLS },
                globalState: null,
            },
            sectionState,
            ProxyLogger: proxyLogger,
        });

        await new Promise((r) => setImmediate(r));
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
    // 1. Обновление контекста и статусов ячеек: UpdateStorageContext
    // =========================================================================
    describe('UpdateStorageContext() — обновление флагов и счетчиков ячеек матрицы', () => {
        it('UpdateStorageContext() обновляет счетчики itemsDispensed и статусы ячеек с учетом области scope', () => {
            const targetCellIndex = 4;
            // Одиночное обновление ячейки 4 (row 1, col 1)
            storage.UpdateStorageContext(
                { index: targetCellIndex },
                { dispensed: TEST_DISPENSED_COUNT, scope: 'single', status: SPIRAL_CELL_STATE.ERR_TAMPER }
            );

            assert.equal(sectionState.Cells[targetCellIndex].Status, SPIRAL_CELL_STATE.ERR_TAMPER);
            assert.equal(sectionState.Cells[3].Status, SPIRAL_CELL_STATE.OK);
            assert.equal(sectionState.Cells[5].Status, SPIRAL_CELL_STATE.OK);

            const unit4 = [...storage.UnitsByScope(targetCellIndex, 'single')][0];
            assert.equal(unit4.itemsDispensed, TEST_DISPENSED_COUNT);
            assert.equal(unit4.status, SPIRAL_CELL_STATE.ERR_TAMPER);
        });

        it('UpdateStorageContext() с параметром except не перезаписывает защищенные статусы в ряду', () => {
            // В ряду 1 (индексы 3, 4, 5) ячейка 3 уже имеет статус ERR_TAMPER
            storage.UpdateStorageContext(
                { index: 3 },
                { scope: 'single', status: SPIRAL_CELL_STATE.ERR_TAMPER }
            );

            // Обновляем весь ряд 1 через базовую ячейку 4 со списком исключений except: [ERR_TAMPER]
            storage.UpdateStorageContext(
                { index: 4 },
                {
                    scope: 'row',
                    status: SPIRAL_CELL_STATE.BLOCKED,
                    except: [SPIRAL_CELL_STATE.ERR_TAMPER],
                }
            );

            assert.equal(sectionState.Cells[4].Status, SPIRAL_CELL_STATE.BLOCKED);
            assert.equal(sectionState.Cells[5].Status, SPIRAL_CELL_STATE.BLOCKED);

            // А если сама базовая ячейка index=3 входит в except, перезапись блокируется
            storage.UpdateStorageContext(
                { index: 3 },
                {
                    scope: 'single',
                    status: SPIRAL_CELL_STATE.ERR_TAMPER,
                }
            );
            storage.UpdateStorageContext(
                { index: 3 },
                {
                    scope: 'single',
                    status: SPIRAL_CELL_STATE.BLOCKED,
                    except: [SPIRAL_CELL_STATE.ERR_TAMPER],
                }
            );
            assert.equal(sectionState.Cells[3].Status, SPIRAL_CELL_STATE.ERR_TAMPER);
        });

        it('ClearOverloadStatus() сбрасывает все ячейки со статусом OVERLOAD_I обратно в OK, не трогая другие ошибки', () => {
            storage.UpdateStorageContext({ index: 1 }, { scope: 'single', status: SPIRAL_CELL_STATE.OVERLOAD_I });
            storage.UpdateStorageContext({ index: 5 }, { scope: 'single', status: SPIRAL_CELL_STATE.OVERLOAD_I });
            storage.UpdateStorageContext({ index: 8 }, { scope: 'single', status: SPIRAL_CELL_STATE.ERR_TAMPER });

            storage.ClearOverloadStatus();

            assert.equal(sectionState.Cells[1].Status, SPIRAL_CELL_STATE.OK);
            assert.equal(sectionState.Cells[5].Status, SPIRAL_CELL_STATE.OK);
            assert.equal(sectionState.Cells[8].Status, SPIRAL_CELL_STATE.ERR_TAMPER);
        });
    });

    // =========================================================================
    // 2. Доступность ячеек и линий матричной коммутации: IsAvailable, IsCheckable
    // =========================================================================
    describe('IsAvailable() и IsCheckable() — валидация готовности ячеек к операциям', () => {
        it('IsAvailable() возвращает true только для статусов OK, ERR_TAMPER и ACTUATOR_NO_POWER', () => {
            const cell = { row: 1, column: 2 };
            const ind = storage.PosToInd(cell);

            sectionState.Cells[ind].Status = SPIRAL_CELL_STATE.OK;
            assert.equal(storage.IsAvailable(cell), true);

            sectionState.Cells[ind].Status = SPIRAL_CELL_STATE.ERR_TAMPER;
            assert.equal(storage.IsAvailable(cell), true);

            sectionState.Cells[ind].Status = SPIRAL_CELL_STATE.ACTUATOR_NO_POWER;
            assert.equal(storage.IsAvailable(cell), true);

            sectionState.Cells[ind].Status = SPIRAL_CELL_STATE.BLOCKED;
            assert.equal(storage.IsAvailable(cell), false);

            sectionState.Cells[ind].Status = SPIRAL_CELL_STATE.OVERLOAD_I;
            assert.equal(storage.IsAvailable(cell), false);
        });

        it('IsCheckable() проверяет допустимость статуса ячейки и блокирует весь ряд, если хотя бы у одной ячейки ряда статус ACTUATOR_SHORT_CIRCUIT', () => {
            const cellA = { row: 2, column: 0 };
            const cellB = { row: 2, column: 1 };
            const indA = storage.PosToInd(cellA);

            // Исходно все ячейки исправны
            assert.equal(storage.IsCheckable(cellA), true);
            assert.equal(storage.IsCheckable(cellB), true);

            // Навешиваем КЗ на ячейку cellA
            storage.UpdateStorageContext(
                { index: indA },
                { scope: 'single', status: SPIRAL_CELL_STATE.ACTUATOR_SHORT_CIRCUIT }
            );

            // Теперь ни одна ячейка 2-го ряда не checkable
            assert.equal(storage.IsCheckable(cellA), false);
            assert.equal(storage.IsCheckable(cellB), false);

            // При этом ячейки на другом ряду (row 0) остаются доступными
            assert.equal(storage.IsCheckable({ row: 0, column: 0 }), true);
        });
    });

    // =========================================================================
    // 3. Обработка аварий и переходов автомата: UpdateStatus, OnStateChanged
    // =========================================================================
    describe('UpdateStatus() и OnStateChanged() — фиксация состояний хранилища', () => {
        it('UpdateStatus() безопасно игнорирует объекты ошибок, не являющиеся экземплярами внутреннего класса StorageFault', () => {
            storage.UpdateStatus(new Error('Generic error'));
            storage.UpdateStatus({ code: FAULTS.ERR_TAMPER, index: 0 });

            // Ни одна ячейка не должна изменить статус OK
            assert.equal(
                sectionState.Cells.every((c) => c.Status === SPIRAL_CELL_STATE.OK),
                true
            );
        });

        it('OnStateChanged() форматирует и передает запись о смене состояния автомата в ProxyLogger', () => {
            logs.length = 0;

            storage.OnStateChanged({
                prevState: ClassSpiralSectionStorage.STATE.IDLE,
                eventName: storage.EVENTS.TEST_COMMAND,
                state: ClassSpiralSectionStorage.STATE.TESTING,
            });

            assert.equal(logs.length, 1);
            assert.equal(logs[0].msg, '[STORAGE] STATE: IDLE --[TEST_COMMAND]--> TESTING');
        });
    });
});
