const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');

const { ClassSpiralSectionStorage } = require('../../../js/srvSpiralSectionStorage');
const { STORAGE_CONSTANSTS, COMMON_CONSTANTS, FAULTS } = require('../../../js/SpiralSectionConstants');
const { SpiralSectionState, SPIRAL_CELL_STATE } = require('../../../js/srvSpiralSectionStates');
const { ProxyChannelStub } = require('../../helpers/ProxyChannelStub');
const { SpiralSection } = require('../../../js/Emu');

// --- Константы, отражающие внутренние параметры ClassSpiralSectionStorage (не вынесенные в SpiralSectionConstants) ---
const CURR_BUFFER_SIZE = 2;
const VOLT_BUFFER_SIZE = 3;

// --- Константы тестовой фикстуры и граничных сценариев ---
const ROWS = 4;
const COLS = 3;
const BUS_NUMBER = 1;

const CUSTOM_GRID_WIDTH = 4;
const CUSTOM_GRID_TEST_INDEX = 5;

const IDLE_TEST_CURRENT = 0.10;
const WORK_TEST_CURRENT = 0.20;
const GAP_UNDEFINED_CURRENT = 0.27;
const OVERLOAD_TEST_CURRENT = 0.80;
const SHORT_HIGH_TEST_CURRENT = 3.00;

const SHORT_CURRENT_DELTA = 0.05;
const SAFE_VOLTAGE_DELTA = 0.5;
const DEEP_VOLTAGE_DROP_DELTA = 4;

const TEST_DISPENSED_COUNT = 2;
const TEST_BUFFER_CURRENT_SAMPLE = 0.22;
const TEST_BUFFER_VOLTAGE_SAMPLE = 24.5;

const INVALID_ROW_INDEX = 99;
const INVALID_QUANTITY = 0;
const VALID_QUANTITY = 1;
const INVALID_DURATION_MS = 0;
const VALID_DURATION_MS = 500;

describe('ClassSpiralSectionStorage — утилитарные и вспомогательные функции (без управления моторами)', () => {
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

        // Дожидаемся микротаска стартового MotorOffAll() в Init()
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
    // 1. Преобразование координат и уровней: IndexToPos, PosToInd, GetLevelByIndex, MaxLevel
    // =========================================================================
    describe('Координатная сетка матрицы: IndexToPos(), PosToInd(), GetLevelByIndex(), MaxLevel', () => {
        it('MaxLevel возвращает количество рядов (полок) хранилища', () => {
            assert.equal(storage.MaxLevel, ROWS);
        });

        it('IndexToPos() и PosToInd() взаимно обратимо преобразуют линейный индекс и координаты { row, col / column }', () => {
            // Матрица 4x3 (индексы 0..11)
            assert.deepEqual(storage.IndexToPos(0), { row: 0, col: 0 });
            assert.deepEqual(storage.IndexToPos(2), { row: 0, col: 2 });
            assert.deepEqual(storage.IndexToPos(3), { row: 1, col: 0 });
            assert.deepEqual(storage.IndexToPos(7), { row: 2, col: 1 });
            assert.deepEqual(storage.IndexToPos(11), { row: 3, col: 2 });

            // Проверка кастомной ширины _width в IndexToPos
            assert.deepEqual(storage.IndexToPos(CUSTOM_GRID_TEST_INDEX, CUSTOM_GRID_WIDTH), { row: 1, col: 1 });

            // PosToInd поддерживает как поле col, так и поле column
            assert.equal(storage.PosToInd({ row: 0, col: 0 }), 0);
            assert.equal(storage.PosToInd({ row: 2, col: 1 }), 7);
            assert.equal(storage.PosToInd({ row: 2, column: 1 }), 7);
            assert.equal(storage.PosToInd({ row: 3, column: 2 }), 11);
        });

        it('GetLevelByIndex() вычисляет физический уровень полки снизу вверх (rows - row)', () => {
            // При ROWS = 4:
            // row 0 (верхняя полка, индексы 0..2) -> уровень 4 (ROWS)
            assert.equal(storage.GetLevelByIndex(0), ROWS);
            assert.equal(storage.GetLevelByIndex(2), ROWS);
            // row 1 (индексы 3..5) -> уровень 3 (ROWS - 1)
            assert.equal(storage.GetLevelByIndex(4), ROWS - 1);
            // row 3 (нижняя полка, индексы 9..11) -> уровень 1
            assert.equal(storage.GetLevelByIndex(9), 1);
            assert.equal(storage.GetLevelByIndex(11), 1);
        });
    });

    // =========================================================================
    // 2. Итераторы матрицы: RowIterator, RowIndexIterator, ColIterator, UnitsByScope
    // =========================================================================
    describe('Итераторы ячеек: RowIterator(), RowIndexIterator(), ColIterator(), UnitsByScope()', () => {
        it('RowIterator() и RowIndexIterator() возвращают все ячейки указанного ряда и выбрасывают RangeError при выходе за границы', () => {
            const row1Units = [...storage.RowIterator(1)];
            assert.equal(row1Units.length, COLS);
            assert.deepEqual(
                row1Units.map((u) => u.index),
                [3, 4, 5]
            );
            assert.deepEqual(
                row1Units.map((u) => u.coords),
                [
                    { row: 1, col: 0 },
                    { row: 1, col: 1 },
                    { row: 1, col: 2 },
                ]
            );

            const row2Units = [...storage.RowIndexIterator(2)];
            assert.deepEqual(
                row2Units.map((u) => u.index),
                [6, 7, 8]
            );

            assert.throws(() => [...storage.RowIterator(-1)], RangeError);
            assert.throws(() => [...storage.RowIterator(ROWS)], RangeError);
            assert.throws(() => [...storage.RowIndexIterator(-1)], RangeError);
            assert.throws(() => [...storage.RowIndexIterator(ROWS)], RangeError);
        });

        it('ColIterator() возвращает все ячейки указанного столбца сверху вниз и выбрасывает RangeError при выходе за границы', () => {
            const col1Units = [...storage.ColIterator(1)];
            assert.equal(col1Units.length, ROWS);
            assert.deepEqual(
                col1Units.map((u) => u.index),
                [1, 4, 7, 10]
            );

            assert.throws(() => [...storage.ColIterator(-1)], RangeError);
            assert.throws(() => [...storage.ColIterator(COLS)], RangeError);
        });

        it('UnitsByScope() выбирает ячейку (single), ряд (row), колонку (col) или всю матрицу (all)', () => {
            // Базовая ячейка index = 4 -> { row: 1, col: 1 }
            const baseCellIndex = 4;
            const single = [...storage.UnitsByScope(baseCellIndex, 'single')].map((u) => u.index);
            assert.deepEqual(single, [baseCellIndex]);

            const rowScope = [...storage.UnitsByScope(baseCellIndex, 'row')].map((u) => u.index);
            assert.deepEqual(rowScope, [3, 4, 5]);

            const colScope = [...storage.UnitsByScope(baseCellIndex, 'col')].map((u) => u.index);
            assert.deepEqual(colScope, [1, 4, 7, 10]);

            const allScope = [...storage.UnitsByScope(baseCellIndex, 'all')].map((u) => u.index);
            assert.equal(allScope.length, ROWS * COLS);

            assert.throws(() => [...storage.UnitsByScope(baseCellIndex, 'invalid_scope')], /Invalid scope/);
        });
    });

    // =========================================================================
    // 3. Контроль тока и КЗ: CheckCurrentState(), IsShorted()
    // =========================================================================
    describe('CheckCurrentState() и IsShorted()', () => {
        const { CURRENT_RANGE, ELECTR_CURR_STATE } = STORAGE_CONSTANSTS;

        it('CheckCurrentState() классифицирует ток по диапазонам STORAGE_CONSTANSTS.CURRENT_RANGE', () => {
            // IDLE: [0, 0.15), WORK_OK: [0.15, 0.25), OVERLOAD: [0.3, 1.4), SHORT: [1.4, Infinity)
            assert.equal(storage.CheckCurrentState(CURRENT_RANGE.IDLE[0]), ELECTR_CURR_STATE.IDLE);
            assert.equal(storage.CheckCurrentState(IDLE_TEST_CURRENT), ELECTR_CURR_STATE.IDLE);

            assert.equal(storage.CheckCurrentState(CURRENT_RANGE.WORK_OK[0]), ELECTR_CURR_STATE.WORK_OK);
            assert.equal(storage.CheckCurrentState(WORK_TEST_CURRENT), ELECTR_CURR_STATE.WORK_OK);

            // Зазор между WORK_OK (0.25) и OVERLOAD (0.30) возвращает undefined
            assert.equal(storage.CheckCurrentState(GAP_UNDEFINED_CURRENT), undefined);

            assert.equal(storage.CheckCurrentState(CURRENT_RANGE.OVERLOAD[0]), ELECTR_CURR_STATE.OVERLOAD);
            assert.equal(storage.CheckCurrentState(OVERLOAD_TEST_CURRENT), ELECTR_CURR_STATE.OVERLOAD);

            assert.equal(storage.CheckCurrentState(CURRENT_RANGE.SHORT[0]), ELECTR_CURR_STATE.SHORT);
            assert.equal(storage.CheckCurrentState(SHORT_HIGH_TEST_CURRENT), ELECTR_CURR_STATE.SHORT);
        });

        it('CheckCurrentState() использует фильтрованное значение из _I_CurrBuffer, если аргумент не передан', () => {
            emuStorage.setCurrent(WORK_TEST_CURRENT, { pushToBuffer: true, samples: CURR_BUFFER_SIZE });
            assert.equal(storage.CheckCurrentState(), ELECTR_CURR_STATE.WORK_OK);

            storage._I_CurrBuffer.Clear();
            assert.equal(storage.CheckCurrentState(), undefined);
        });

        it('IsShorted() возвращает true при превышении тока КЗ (> 1.4A) или падении напряжения (<= MIN_VOLTAGE)', () => {
            const shortI = CURRENT_RANGE.SHORT[0]; // 1.4A
            const minV = COMMON_CONSTANTS.MIN_VOLTAGE; // 16V

            // Нормальный режим
            emuStorage.setCurrent(WORK_TEST_CURRENT, { pushToBuffer: false });
            emuStorage.setVoltage(STORAGE_CONSTANSTS.SUPPLY_VOLTAGE, { pushToBuffer: false });
            assert.equal(storage.IsShorted(), false);

            // Ток на границе (1.4A) -> еще false, выше 1.4A -> true
            emuStorage.setCurrent(shortI, { pushToBuffer: false });
            assert.equal(storage.IsShorted(), false);

            emuStorage.setCurrent(shortI + SHORT_CURRENT_DELTA, { pushToBuffer: false });
            assert.equal(storage.IsShorted(), true);

            // Возвращаем ток в норму, но роняем напряжение до MIN_VOLTAGE (16V)
            emuStorage.setCurrent(IDLE_TEST_CURRENT, { pushToBuffer: false });
            emuStorage.setVoltage(minV + SAFE_VOLTAGE_DELTA, { pushToBuffer: false });
            assert.equal(storage.IsShorted(), false);

            emuStorage.setVoltage(minV, { pushToBuffer: false });
            assert.equal(storage.IsShorted(), true);

            emuStorage.setVoltage(minV - DEEP_VOLTAGE_DROP_DELTA, { pushToBuffer: false });
            assert.equal(storage.IsShorted(), true);
        });
    });

    // =========================================================================
    // 4. Обновление контекста, статусов и проверки доступности ячеек
    // =========================================================================
    describe('UpdateStorageContext(), ClearOverloadStatus(), IsAvailable(), IsCheckable()', () => {
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

            sectionState.Cells[ind].Status = SPIRAL_CELL_STATE.ACTUATOR_SHORT_CIRCUIT;
            assert.equal(storage.IsAvailable(cell), false);
        });

        it('IsCheckable() проверяет допустимость статуса ячейки и блокирует весь ряд, если хотя бы у одной ячейки ряда статус ACTUATOR_SHORT_CIRCUIT', () => {
            const cellA = { row: 2, column: 0 };
            const cellB = { row: 2, column: 2 };
            const indA = storage.PosToInd(cellA);

            // По умолчанию все ячейки OK -> доступны для проверки
            assert.equal(storage.IsCheckable(cellA), true);
            assert.equal(storage.IsCheckable({ row: 2, col: 2 }), true);

            // Статусы ERR_TAMPER_BAD_POS и ACTUATOR_NO_POWER также разрешают проверку
            sectionState.Cells[indA].Status = SPIRAL_CELL_STATE.ERR_TAMPER_BAD_POS;
            assert.equal(storage.IsCheckable(cellA), true);

            sectionState.Cells[indA].Status = SPIRAL_CELL_STATE.ACTUATOR_NO_POWER;
            assert.equal(storage.IsCheckable(cellA), true);

            // Статус ERR_TAMPER или BLOCKED запрещает проверку конкретной ячейки, но соседняя в ряду еще доступна
            sectionState.Cells[indA].Status = SPIRAL_CELL_STATE.ERR_TAMPER;
            assert.equal(storage.IsCheckable(cellA), false);
            assert.equal(storage.IsCheckable(cellB), true);

            // Если в ячейке ряда (например, indA) зафиксировано КЗ (ACTUATOR_SHORT_CIRCUIT в units),
            // то IsCheckable возвращает false для ВСЕХ ячеек этого ряда (включая исправную cellB)
            storage.UpdateStorageContext(
                { index: indA },
                { scope: 'single', status: SPIRAL_CELL_STATE.ACTUATOR_SHORT_CIRCUIT }
            );
            assert.equal(storage.IsCheckable(cellA), false);
            assert.equal(storage.IsCheckable(cellB), false);

            // При этом ячейки на другом ряду (row 0) остаются доступными
            assert.equal(storage.IsCheckable({ row: 0, column: 0 }), true);
        });
    });

    // =========================================================================
    // 5. Пассивные обработчики, геттеры и валидация параметров
    // =========================================================================
    describe('Пассивные обработчики, логгеры и валидация входных аргументов', () => {
        it('SetCurrentHandler и SetVoltageHandler накапливают значения в буферах _I_CurrBuffer и _V_VoltBuffer', () => {
            storage._I_CurrBuffer.Clear();
            storage._V_VoltBuffer.Clear();

            emuStorage.setCurrent(TEST_BUFFER_CURRENT_SAMPLE, {
                pushToBuffer: true,
                samples: CURR_BUFFER_SIZE,
            });
            emuStorage.setVoltage(TEST_BUFFER_VOLTAGE_SAMPLE, {
                pushToBuffer: true,
                samples: VOLT_BUFFER_SIZE,
            });

            assert.equal(storage._I_CurrBuffer.Filter(), TEST_BUFFER_CURRENT_SAMPLE);
            assert.equal(storage._V_VoltBuffer.Filter(), TEST_BUFFER_VOLTAGE_SAMPLE);
        });

        it('SetTamperHandlers игнорирует сигналы тамперов спиралей, когда опрос выключен (#_Polling === false)', () => {
            let dispensedEventFired = false;
            storage.Events.on('dispense', () => {
                dispensedEventFired = true;
            });

            // В состоянии IDLE (#_Polling === false) переключение тампера не должно вызывать OnDispensedSingle
            emuStorage.setRowTamper(0, false, { emit: true });
            emuStorage.setRowTamper(0, true, { emit: true });

            assert.equal(dispensedEventFired, false);
            assert.equal(storage.State, ClassSpiralSectionStorage.STATE.IDLE);
        });

        it('UpdateStatus() безопасно игнорирует объекты ошибок, не являющиеся экземплярами внутреннего класса StorageFault', () => {
            storage.UpdateStatus(new Error('Generic error'));
            storage.UpdateStatus({ code: FAULTS.ERR_TAMPER, index: 0 });

            // Ни одна ячейка не должна изменить статус OK
            assert.equal(
                sectionState.Cells.every((c) => c.Status === SPIRAL_CELL_STATE.OK),
                true
            );
        });

        it('LogTransaction() и OnStateChanged() записывают отформатированные сообщения в ProxyLogger', () => {
            logs.length = 0;

            storage.LogTransaction('CONNECT_GND');
            assert.equal(logs.length, 1);
            assert.deepEqual(logs[0], {
                level: 'D',
                msg: '[STORAGE] CONNECT_GND',
            });

            storage.OnStateChanged({
                prevState: ClassSpiralSectionStorage.STATE.IDLE,
                eventName: storage.EVENTS.TEST_COMMAND,
                state: ClassSpiralSectionStorage.STATE.TESTING,
            });
            assert.equal(logs.length, 2);
            assert.equal(logs[1].msg, '[STORAGE] STATE: IDLE --[TEST_COMMAND]--> TESTING');
        });

        it('Dispense() и RunMotor() синхронно отклоняют промис при невалидных координатах, quantity < 1 или duration <= 0 без запуска FSM', async () => {
            // Невалидный quantity
            await assert.rejects(
                () => storage.Dispense({ row: 0, column: 0, quantity: INVALID_QUANTITY }),
                /\[Storage\] Невалидные параметры/
            );
            // Индекс за пределами матрицы
            await assert.rejects(
                () => storage.Dispense({ row: INVALID_ROW_INDEX, column: 0, quantity: VALID_QUANTITY }),
                /\[Storage\] Невалидные параметры/
            );

            // Невалидный duration в RunMotor
            await assert.rejects(
                () => storage.RunMotor({ row: 0, column: 0, duration: INVALID_DURATION_MS }),
                /\[Storage\] Невалидные параметры/
            );
            await assert.rejects(
                () => storage.RunMotor({ row: INVALID_ROW_INDEX, column: 0, duration: VALID_DURATION_MS }),
                /\[Storage\] Невалидные параметры/
            );

            assert.equal(storage.State, ClassSpiralSectionStorage.STATE.IDLE);
        });
    });
});
