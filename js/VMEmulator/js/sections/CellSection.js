const { EventEmitter2 } = require('eventemitter2');
const { CELL_CONSTANTS, CELL_FAULTS } = require('./CellSectionConstants.js');
const { FAULTS } = require('../constants.js');
const { peekValueInRange, EVENTS } = require('../utils/emuUtils.js');

/**
 * Эмулятор постаматной секции ячеек (CellSection), работающий напрямую через ProxyChannelStub.
 */
class CellSection {
    /**
     * @param {object} params
     * @param {import('../../../tests/helpers/ProxyChannelStub.js').ProxyChannelStub} params.proxy
     * @param {object} params.channels
     * @param {{ rows: number, cols: number }} [params.size={ rows: 10, cols: 5 }]
     * @param {object} [params.advOpts]
     * @param {EventEmitter2} [params.events]
     * @param {Function} [params.log=console.log]
     */
    constructor({ proxy, channels, size = { rows: 10, cols: 5 }, advOpts = {}, events, log = console.log }) {
        this.proxy = proxy;
        this.channels = channels;
        this.size = size;
        this.advOpts = advOpts;
        this.events = events ?? new EventEmitter2();
        this.log = log;

        this.CURR = {
            idle: peekValueInRange(CELL_CONSTANTS.CURRENT_RANGE.IDLE),
            workOk: peekValueInRange(CELL_CONSTANTS.CURRENT_RANGE.WORK_OK),
            overload: peekValueInRange(CELL_CONSTANTS.CURRENT_RANGE.OVERLOAD),
            short: peekValueInRange(CELL_CONSTANTS.CURRENT_RANGE.SHORT),
        };

        this.pendingTimers = new Set();
        this.portListenersOff = [];
        this.ledListenerOff = null;
        this.lastLedCommand = null;
        this.activePortValues = new Map();
    }

    _delay(ms) {
        return new Promise((res) => {
            const t = setTimeout(() => {
                this.pendingTimers.delete(t);
                res();
            }, ms);
            this.pendingTimers.add(t);
        });
    }

    /**
     * Преобразование линейного индекса ячейки в { row, col }
     * @param {number} index
     * @returns {{ row: number, col: number }}
     */
    IndexToPos(index) {
        const width = this.size?.cols ?? 5;
        return { row: Math.floor(index / width), col: index % width };
    }

    /**
     * Преобразование координат { row, col } в линейный индекс
     * @param {number} row
     * @param {number} col
     * @returns {number}
     */
    PosToIndex(row, col) {
        const width = this.size?.cols ?? 5;
        return row * width + col;
    }

    _getCurrentChannel() {
        return this.channels?.electroChannels?.curr ?? this.channels?.current;
    }

    _getVoltageChannel() {
        return this.channels?.electroChannels?.voltage ?? this.channels?.voltage;
    }

    _getTamperChannels() {
        return this.channels?.storageChannels?.tamperChannels ?? this.channels?.tamperChannels ?? [];
    }

    _getPortChannels() {
        return this.channels?.storageChannels?.portChannels ?? this.channels?.portChannels ?? [];
    }

    _getLedChannel() {
        return this.channels?.ledChannels?.ledCtrl ?? this.channels?.ledCtrl;
    }

    _getRowPortChannel(row) {
        const portChannels = this._getPortChannels();
        const rowChannels = this.advOpts?.row?.channels ?? this.advOpts?.cellOpts?.row?.channels;
        if (rowChannels && rowChannels[row] !== undefined) {
            const portIdx = rowChannels[row];
            return portChannels[portIdx] ?? portIdx;
        }
        return portChannels[row];
    }

    _getColPortChannel(col) {
        const portChannels = this._getPortChannels();
        const colChannels = this.advOpts?.col?.channels ?? this.advOpts?.cellOpts?.col?.channels;
        if (colChannels && colChannels[col] !== undefined) {
            const portIdx = colChannels[col];
            return portChannels[portIdx] ?? portIdx;
        }
        const offset = this.size?.rows ?? 10;
        return portChannels[offset + col];
    }

    /**
     * Инициализация штатных начальных показаний датчиков постамата в покое
     * (все дверцы закрыты TAMPER_ON = 1, порты выключены = 0, ток IDLE).
     * @param {{ allClosed?: boolean }} [opts]
     */
    seedDefaultHardware({ allClosed = true } = {}) {
        if (!this.proxy) return;

        const initial = {};
        const tampers = this._getTamperChannels();
        const ports = this._getPortChannels();
        const currCh = this._getCurrentChannel();
        const voltCh = this._getVoltageChannel();
        const ledCh = this._getLedChannel();

        const totalCells = tampers.length || ((this.size?.rows ?? 10) * (this.size?.cols ?? 5));
        const tamperVal = allClosed ? CELL_CONSTANTS.TAMPER_ON : CELL_CONSTANTS.TAMPER_OFF;

        for (let i = 0; i < totalCells; i++) {
            const chName = tampers[i];
            if (chName) {
                initial[chName] = tamperVal;
            }
        }

        for (let i = 0; i < ports.length; i++) {
            const pName = ports[i];
            if (pName) {
                initial[pName] = 0;
            }
        }

        if (currCh) initial[currCh] = this.CURR.idle;
        if (voltCh) initial[voltCh] = 12.0;
        if (ledCh) initial[ledCh] = { target: 'off', Num: null };

        this.proxy.seed(initial);

        this.attachPortBehavior();
    }

    /** Алиас seedDefaultHardware() для совместимости */
    seedDefaultSensors(opts) {
        this.seedDefaultHardware(opts);
    }

    /**
     * Установка значения тока и прокачка буфера
     * @param {number} ampValue
     * @param {{ pushToBuffer?: boolean, samples?: number }} [opts]
     */
    setCurrent(ampValue, { pushToBuffer = true, samples = 2 } = {}) {
        const currCh = this._getCurrentChannel();
        if (!currCh || !this.proxy) return;

        if (pushToBuffer) {
            for (let i = 0; i < samples; i++) {
                this.proxy.inject(currCh, ampValue, { emit: true });
            }
        } else {
            this.proxy.inject(currCh, ampValue, { emit: false });
        }
    }

    /**
     * Подача импульса тока на время durationMs с последующим возвратом к resumeCurrent
     * @param {number} spikeCurrent
     * @param {number} durationMs
     * @param {number} [resumeCurrent]
     */
    async pulseCurrent(spikeCurrent, durationMs, resumeCurrent = this.CURR.workOk) {
        this.setCurrent(spikeCurrent, { pushToBuffer: true });
        await this._delay(durationMs);
        this.setCurrent(resumeCurrent, { pushToBuffer: true });
    }

    /**
     * Установка напряжения силовой шины
     * @param {number} voltValue
     * @param {{ pushToBuffer?: boolean, samples?: number }} [opts]
     */
    setVoltage(voltValue, { pushToBuffer = true, samples = 3 } = {}) {
        const voltCh = this._getVoltageChannel();
        if (!voltCh || !this.proxy) return;

        if (pushToBuffer) {
            for (let i = 0; i < samples; i++) {
                this.proxy.inject(voltCh, voltValue, { emit: true });
            }
        } else {
            this.proxy.inject(voltCh, voltValue, { emit: false });
        }
    }

    /**
     * Установка концевика дверцы ячейки (isClosed ? TAMPER_ON : TAMPER_OFF)
     * @param {number} index Индекс ячейки
     * @param {boolean} isClosed
     * @param {{ emit?: boolean }} [opts]
     */
    setCellTamper(index, isClosed, { emit = true } = {}) {
        const tampers = this._getTamperChannels();
        const chName = tampers[index];
        if (!chName || !this.proxy) return;

        const val = isClosed ? CELL_CONSTANTS.TAMPER_ON : CELL_CONSTANTS.TAMPER_OFF;
        this.proxy.inject(chName, val, { emit });
    }

    /**
     * Имитация открытия дверцы ячейки клиентом или отщелкиванием замка (TAMPER_OFF = 0)
     * @param {number} index
     * @param {{ emit?: boolean }} [opts]
     */
    openCell(index, { emit = true } = {}) {
        this.setCellTamper(index, false, { emit });
    }

    /**
     * Имитация закрытия дверцы ячейки клиентом (TAMPER_ON = 1)
     * @param {number} index
     * @param {{ emit?: boolean }} [opts]
     */
    closeCell(index, { emit = true } = {}) {
        this.setCellTamper(index, true, { emit });
    }

    /**
     * Генерация кратковременного открывания дверцы (0 -> возврат в 1)
     * @param {number} index
     * @param {number} [pulseOpenMs=100]
     */
    async pulseCellTamper(index, pulseOpenMs = 100) {
        this.openCell(index, { emit: true });
        if (pulseOpenMs > 0) {
            await this._delay(pulseOpenMs);
        }
        this.closeCell(index, { emit: true });
    }

    /**
     * Настраивает реакцию на дискретные каналы управления портами матрицы:
     * - Отслеживает состояние ключей строк и столбцов.
     * - Управляет током: Step 1 (GND), Step 2 (V+ соленоид), Step 3 (off GND), Step 4 (off V+).
     * - При замкнутой ячейке (Step 2) отщелкивает концевик ячейки и эмитит событие CELL_UNLOCKED.
     *
     * @param {object} [opts]
     * @param {boolean} [opts.shortOnStep1=false] Имитация утечки/пробоя на Step 1 (ток > 0.05 А)
     * @param {boolean} [opts.shortOnStep2=false] Имитация КЗ на Step 2 (ток > 4.50 А)
     * @param {boolean} [opts.stuckLowOnStep3=false] Имитация залипания ключа строки на Step 3
     * @param {boolean} [opts.stuckHighOnStep4=false] Имитация залипания ключа столбца на Step 4
     * @param {boolean} [opts.autoUnlockDoor=true] Авто-отщелкивание дверцы ячейки при включении
     * @param {number} [opts.unlockDelayMs=CELL_CONSTANTS.UNLOCK_TIMEOUT] Задержка срабатывания соленоида
     * @param {Function} [opts.onUnlock=null] Колбэк при успешном открытии ячейки
     */
    attachPortBehavior({
        shortOnStep1 = false,
        shortOnStep2 = false,
        stuckLowOnStep3 = false,
        stuckHighOnStep4 = false,
        autoUnlockDoor = true,
        unlockDelayMs = CELL_CONSTANTS.UNLOCK_TIMEOUT ?? 50,
        onUnlock = null,
    } = {}) {
        this._detachPortListeners();
        if (!this.proxy) return;

        const ports = this._getPortChannels();
        const rows = this.size?.rows ?? 10;
        const cols = this.size?.cols ?? 5;

        this.activePortValues.clear();

        for (const portCh of ports) {
            if (!portCh) continue;
            this.activePortValues.set(portCh, this.proxy.GetValue(portCh) ?? 0);

            const off = this.proxy.onSet(portCh, (val) => {
                this.activePortValues.set(portCh, Number(val));

                queueMicrotask(() => {
                    this._recalcActiveMatrix({
                        shortOnStep1,
                        shortOnStep2,
                        stuckLowOnStep3,
                        stuckHighOnStep4,
                        autoUnlockDoor,
                        unlockDelayMs,
                        onUnlock,
                    });
                });
            });

            this.portListenersOff.push(off);
        }

        const ledCh = this._getLedChannel();
        if (ledCh) {
            this.ledListenerOff = this.proxy.onSet(ledCh, (payload) => {
                this.lastLedCommand = payload;
            });
        }
    }

    _recalcActiveMatrix({
        shortOnStep1,
        shortOnStep2,
        stuckLowOnStep3,
        stuckHighOnStep4,
        autoUnlockDoor,
        unlockDelayMs,
        onUnlock,
    }) {
        const rows = this.size?.rows ?? 10;
        const cols = this.size?.cols ?? 5;

        let activeRow = -1;
        let activeCol = -1;
        let activeRowsCount = 0;
        let activeColsCount = 0;

        for (let r = 0; r < rows; r++) {
            const ch = this._getRowPortChannel(r);
            if (this.activePortValues.get(ch) === 1) {
                activeRow = r;
                activeRowsCount++;
            }
        }

        for (let c = 0; c < cols; c++) {
            const ch = this._getColPortChannel(c);
            if (this.activePortValues.get(ch) === 1) {
                activeCol = c;
                activeColsCount++;
            }
        }

        // Состояние 1: Замкнута только строка (Step 1: LOW_PORT_UP)
        if (activeRowsCount > 0 && activeColsCount === 0) {
            if (shortOnStep1) {
                this.setCurrent(this.CURR.idle + 0.15); // утечка тока > 0.05 А
            } else {
                this.setCurrent(this.CURR.idle);
            }
            return;
        }

        // Состояние 2: Замкнуты и строка, и столбец (Step 2: HIGH_PORT_UP — соленоид запитан)
        if (activeRowsCount > 0 && activeColsCount > 0) {
            if (shortOnStep2) {
                this.setCurrent(5.2); // Ток КЗ > 4.5 А
            } else {
                this.setCurrent(this.CURR.workOk);
                if (autoUnlockDoor && activeRow >= 0 && activeCol >= 0) {
                    const cellIndex = this.PosToIndex(activeRow, activeCol);
                    const timer = setTimeout(() => {
                        this.pendingTimers.delete(timer);
                        this.openCell(cellIndex, { emit: true });
                        this.events.emit(EVENTS.CELL_UNLOCKED, { row: activeRow, col: activeCol, index: cellIndex });
                        if (typeof onUnlock === 'function') {
                            onUnlock({ row: activeRow, col: activeCol, index: cellIndex });
                        }
                    }, unlockDelayMs);
                    this.pendingTimers.add(timer);
                }
            }
            return;
        }

        // Состояние 3: Строка отключена, но столбец еще включен (Step 3: LOW_PORT_DOWN)
        if (activeRowsCount === 0 && activeColsCount > 0) {
            if (stuckLowOnStep3) {
                this.setCurrent(this.CURR.workOk); // ток не упал
            } else {
                this.setCurrent(this.CURR.idle);
            }
            return;
        }

        // Состояние 4: Оба отключены (Step 4: HIGH_PORT_DOWN)
        if (activeRowsCount === 0 && activeColsCount === 0) {
            if (stuckHighOnStep4) {
                this.setCurrent(this.CURR.idle + 0.1); // ток покоя не восстановился
            } else {
                this.setCurrent(this.CURR.idle);
            }
        }
    }

    /**
     * Автоматическая симуляция отпирания замка при получении команд сервиса
     * с опциональным закрытием дверцы клиентом через autoCloseAfterMs
     * @param {object} [opts]
     * @param {number} [opts.autoCloseAfterMs] Автоматическое закрытие дверцы через N мс
     * @param {number} [opts.unlockDelayMs=50]
     */
    simulateUnlock({ autoCloseAfterMs = null, unlockDelayMs = 50 } = {}) {
        return this.attachPortBehavior({
            autoUnlockDoor: true,
            unlockDelayMs,
            onUnlock: ({ index }) => {
                if (Number.isFinite(autoCloseAfterMs) && autoCloseAfterMs > 0) {
                    const timer = setTimeout(() => {
                        this.pendingTimers.delete(timer);
                        this.closeCell(index, { emit: true });
                    }, autoCloseAfterMs);
                    this.pendingTimers.add(timer);
                }
            },
        });
    }

    _detachPortListeners() {
        for (const off of this.portListenersOff) {
            if (typeof off === 'function') off();
        }
        this.portListenersOff = [];

        if (typeof this.ledListenerOff === 'function') {
            this.ledListenerOff();
            this.ledListenerOff = null;
        }
    }

    getState() {
        return {
            current: this.proxy?.GetValue(this._getCurrentChannel()),
            voltage: this.proxy?.GetValue(this._getVoltageChannel()),
            lastLed: this.lastLedCommand,
        };
    }

    cleanup() {
        this._detachPortListeners();
        for (const t of this.pendingTimers) {
            clearTimeout(t);
        }
        this.pendingTimers.clear();
        this.activePortValues.clear();
    }

    reset() {
        this.cleanup();
        this.lastLedCommand = null;
    }
}

module.exports = { CellSection };
