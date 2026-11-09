const { EventEmitter2 } = require('eventemitter2');

const DEFAULT_MAX_LISTENERS = 100;

/**
 * Универсальный тестовый стаб/шпион для `ProxyChannel`.
 * Не зависит от предметной области (секций, моторов, датчиков, структуры конфигов).
 * Реализует базовый контракт `TypeProxyCh` (`GetValue`, `SetValue`, `Events`)
 * и предоставляет чистый API для инъекции данных, перехвата записей и инспекции вызовов.
 */
class ProxyChannelStub {
    /**
     * @param {object} [options={}]
     * @param {Record<string, any>} [options.initialValues={}] Начальные значения каналов `{ [channelName]: value }`
     * @param {boolean} [options.emitOnSetValue=false] Эмитить ли `${channel}-value` автоматически при вызове `SetValue`
     */
    constructor({ initialValues = {}, emitOnSetValue = false } = {}) {
        /**
         * Эмиттер событий изменения каналов (`${channelName}-value`)
         * @type {EventEmitter2}
         */
        this.Events = new EventEmitter2({ maxListeners: DEFAULT_MAX_LISTENERS });

        /**
         * Хранилище текущих значений каналов
         * @type {Map<string, any>}
         */
        this._values = new Map();

        /**
         * История вызовов `SetValue(channel, value)`
         * @type {Array<{ channel: string, value: any, prevValue: any, timestamp: number }>}
         */
        this._setHistory = [];

        /**
         * История вызовов `GetValue(channel)`
         * @type {Array<{ channel: string, value: any, timestamp: number }>}
         */
        this._getHistory = [];

        /**
         * Обработчики перехвата записи в конкретный канал
         * @type {Map<string, Set<Function>>}
         */
        this._setHooks = new Map();

        /**
         * Глобальные обработчики перехвата любой записи
         * @type {Set<Function>}
         */
        this._anySetHooks = new Set();

        /**
         * Кастомные/динамические геттеры для `GetValue(channel)`
         * @type {Map<string, Function>}
         */
        this._getters = new Map();

        this._emitOnSetValue = emitOnSetValue;

        this.seed(initialValues, { emit: false });
    }

    // =========================================================================
    // 1. Контракт ProxyChannel (вызывается тестируемым кодом)
    // =========================================================================

    /**
     * Синхронное чтение значения канала
     * @param {string} channel
     * @returns {any}
     */
    GetValue(channel) {
        let value;
        if (this._getters.has(channel)) {
            const getter = this._getters.get(channel);
            value = getter(this._values.get(channel), this);
            this._values.set(channel, value);
        } else {
            value = this._values.get(channel);
        }

        this._getHistory.push({
            channel,
            value,
            timestamp: Date.now(),
        });

        return value;
    }

    /**
     * Запись значения в канал со стороны тестируемого кода
     * @param {string} channel
     * @param {any} value
     */
    SetValue(channel, value) {
        const prevValue = this._values.get(channel);
        this._values.set(channel, value);

        this._setHistory.push({
            channel,
            value,
            prevValue,
            timestamp: Date.now(),
        });

        if (this._emitOnSetValue) {
            this.Events.emit(`${channel}-value`, { Value: value });
        }

        const hooks = this._setHooks.get(channel);
        if (hooks && hooks.size > 0) {
            for (const hook of [...hooks]) {
                hook(value, prevValue, this);
            }
        }

        if (this._anySetHooks.size > 0) {
            for (const hook of [...this._anySetHooks]) {
                hook(channel, value, prevValue, this);
            }
        }
    }

    // =========================================================================
    // 2. Управление состоянием каналов из теста (Stub Injection API)
    // =========================================================================

    /**
     * Устанавливает значение в канал со стороны теста (внешней среды)
     * и опционально эмитит событие `${channel}-value` без записи в историю `SetValue`.
     *
     * @param {string} channel
     * @param {any} value
     * @param {object} [opts={}]
     * @param {boolean} [opts.emit=true] Эмитить ли событие `${channel}-value`
     * @returns {this}
     */
    inject(channel, value, { emit = true } = {}) {
        this._values.set(channel, value);
        if (emit) {
            this.Events.emit(`${channel}-value`, { Value: value });
        }
        return this;
    }

    /**
     * Пакетная установка значений нескольких каналов
     * @param {Record<string, any>} valuesMap Объект `{ [channel]: value }`
     * @param {object} [opts={}]
     * @param {boolean} [opts.emit=false] Эмитить ли события при инициализации
     * @returns {this}
     */
    seed(valuesMap, { emit = false } = {}) {
        for (const [channel, value] of Object.entries(valuesMap)) {
            this.inject(channel, value, { emit });
        }
        return this;
    }

    /**
     * Принудительный эмит события `${channel}-value` (например, для ответа на `Events.waitFor`)
     * @param {string} channel
     * @param {any} [value] Если не указано, используется текущее значение в канале
     * @returns {this}
     */
    emitChannelValue(channel, value = undefined) {
        const actual = value !== undefined ? value : this._values.get(channel);
        if (value !== undefined) {
            this._values.set(channel, actual);
        }
        this.Events.emit(`${channel}-value`, { Value: actual });
        return this;
    }

    /**
     * Назначает функцию-геттер или очередь значений для `GetValue(channel)`
     * @param {string} channel
     * @param {Function | Array<any>} getterOrSequence Функция `(currentVal, stub) => nextVal` или массив значений по шагам
     * @returns {this}
     */
    mockGetter(channel, getterOrSequence) {
        if (typeof getterOrSequence === 'function') {
            this._getters.set(channel, getterOrSequence);
            return this;
        }
        if (Array.isArray(getterOrSequence) && getterOrSequence.length > 0) {
            let idx = 0;
            this._values.set(channel, getterOrSequence[0]);
            this._getters.set(channel, () => {
                const val = getterOrSequence[Math.min(idx, getterOrSequence.length - 1)];
                idx++;
                return val;
            });
            return this;
        }
        throw new TypeError('getterOrSequence must be a function or a non-empty array');
    }

    /**
     * Удаляет кастомный геттер канала
     * @param {string} channel
     * @returns {this}
     */
    clearGetter(channel) {
        this._getters.delete(channel);
        return this;
    }

    // =========================================================================
    // 3. Перехват вызовов SetValue (Hooks API)
    // =========================================================================

    /**
     * Подписка на вызов `SetValue(channel, value)` со стороны тестируемого модуля
     * @param {string} channel
     * @param {(value: any, prevValue: any, stub: ProxyChannelStub) => void} handler
     * @returns {() => void} Функция отписки
     */
    onSet(channel, handler) {
        if (!this._setHooks.has(channel)) {
            this._setHooks.set(channel, new Set());
        }
        const hooks = this._setHooks.get(channel);
        hooks.add(handler);
        return () => hooks.delete(handler);
    }

    /**
     * Однократная подписка на вызов `SetValue(channel, value)`
     * @param {string} channel
     * @param {(value: any, prevValue: any, stub: ProxyChannelStub) => void} handler
     * @returns {() => void}
     */
    onceSet(channel, handler) {
        const off = this.onSet(channel, (value, prevValue, stub) => {
            off();
            handler(value, prevValue, stub);
        });
        return off;
    }

    /**
     * Подписка на вызов `SetValue` любого канала
     * @param {(channel: string, value: any, prevValue: any, stub: ProxyChannelStub) => void} handler
     * @returns {() => void} Функция отписки
     */
    onAnySet(handler) {
        this._anySetHooks.add(handler);
        return () => this._anySetHooks.delete(handler);
    }

    // =========================================================================
    // 4. Инспекция истории (Spy API)
    // =========================================================================

    /**
     * История вызовов `SetValue` (всех или по конкретному каналу)
     * @param {string} [channel]
     * @returns {Array<{ channel: string, value: any, prevValue: any, timestamp: number }>}
     */
    getSetHistory(channel = undefined) {
        if (!channel) return [...this._setHistory];
        return this._setHistory.filter((entry) => entry.channel === channel);
    }

    /**
     * История вызовов `GetValue` (всех или по конкретному каналу)
     * @param {string} [channel]
     * @returns {Array<{ channel: string, value: any, timestamp: number }>}
     */
    getGetHistory(channel = undefined) {
        if (!channel) return [...this._getHistory];
        return this._getHistory.filter((entry) => entry.channel === channel);
    }

    /**
     * Массив значений, записанных в канал через `SetValue` в хронологическом порядке
     * @param {string} channel
     * @returns {any[]}
     */
    getSentValues(channel) {
        return this._setHistory
            .filter((entry) => entry.channel === channel)
            .map((entry) => entry.value);
    }

    /**
     * Последнее значение, записанное в канал через `SetValue`
     * @param {string} channel
     * @returns {any}
     */
    getLastSentValue(channel) {
        for (let i = this._setHistory.length - 1; i >= 0; i--) {
            if (this._setHistory[i].channel === channel) {
                return this._setHistory[i].value;
            }
        }
        return undefined;
    }

    /**
     * Очищает историю вызовов `SetValue` и `GetValue`
     * @returns {this}
     */
    clearHistory() {
        this._setHistory = [];
        this._getHistory = [];
        return this;
    }

    /**
     * Полный сброс состояния стаба (значений, хуков, геттеров и истории)
     * @param {object} [opts={}]
     * @param {boolean} [opts.removeListeners=false] Очистить ли также подписки на `this.Events`
     * @returns {this}
     */
    reset({ removeListeners = false } = {}) {
        this._values.clear();
        this._setHooks.clear();
        this._anySetHooks.clear();
        this._getters.clear();
        this.clearHistory();

        if (removeListeners) {
            this.Events.removeAllListeners();
        }
        return this;
    }
}

module.exports = { ProxyChannelStub };
