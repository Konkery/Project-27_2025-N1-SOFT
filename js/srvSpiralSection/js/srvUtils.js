/**
 * @typedef {Object} TypeTimer
 * @property {(timeoutMs?: number) => TypeTimer} set
 * @property {() => TypeTimer} clear
 * @property {(timeoutMs?: number) => TypeTimer} reset
 * @property {() => boolean} isActive
 */

/**
 * Создает управляемый таймер.
 *
 * @param {Function} cb - Колбэк, вызываемый по таймауту
 * @param {number} timeoutMs - Таймаут по умолчанию
 * @returns {TypeTimer}
 */
const CreateTimer = (cb, timeoutMs) => {
    if (typeof cb !== 'function') {
        throw new TypeError('cb must be a function');
    }

    if (typeof timeoutMs !== 'number' || timeoutMs < 0) {
        throw new TypeError('timeoutMs must be a non-negative number');
    }

    /** @type {NodeJS.Timeout | null} */
    let timer = null;

    const api = {
        set(t) {
            const delay = typeof t === 'number' ? t : timeoutMs;

            // предотвращаем множественный запуск
            if (timer) 
                clearTimeout(timer);
            

            timer = setTimeout(() => {
                timer = null;
                cb();
            }, delay);

            return api;
        },

        clear() {
            if (timer) {
                clearTimeout(timer);
                timer = null;
            }
            return api;
        },

        reset(t) {
            if (!timer) return
            return api.clear().set(t);
        },

        isActive() {
            return timer !== null;
        }
    };

    return api;
};

class ClassFault {
    constructor({ code, critical }) {
        this.code = code;
        this.critical = critical;
    }
}

function isWithinTolerance(x1, x2, delta) {
    let e = 0.00001;
    x1 += e;
    x2 += e;
    // Проверка на деление на ноль
    if (x1 === 0) {
        // Если x1 = 0, то сравниваем абсолютное изменение с 5% от 1 (или можно использовать другой подход)
        // Вариант 1: считаем, что изменение более чем на 0.05 недопустимо
        return Math.abs(x2) <= delta;
        // Вариант 2: если x1 = 0, то любое изменение считается бесконечным процентом
        // return false;
    }
    
    const percentChange = Math.abs((x2 - x1) / x1) * 100;
    return percentChange <= delta * 100;
}

class BitMask {
    constructor(capacity, reversed) {
        if (capacity <= 0 || capacity >= 64) {
            throw new Error("capacity must be in range 1..63");
        }

        this.capacity = capacity;
        this.mask = 0n;

        // Маска допустимых битов: например capacity=5 -> 0b11111
        this.fullMask = (1n << BigInt(capacity)) - 1n;
    }

    _checkIndex(i) {
        if (i < 0 || i >= this.capacity) {
            throw new RangeError(`index ${i} out of bounds`);
        }
    }

    // Установить бит в 1
    setUnlocked(i) {
        this._checkIndex(i);
        this.mask |= (1n << BigInt(i));
    }

    // Установить бит в 0
    setLocked(i) {
        this._checkIndex(i);
        this.mask &= ~(1n << BigInt(i));
    }

    // Все биты = 1 (в рамках capacity)
    unlockAll() {
        this.mask = this.fullMask;
    }

    // Все биты = 0
    lockAll() {
        this.mask = 0n;
    }

    // Проверка: заблокирован ли бит
    isLocked(i) {
        this._checkIndex(i);
        return ((this.mask >> BigInt(i)) & 1n) === 0n;
    }

    // Количество единичных битов
    get unlockedCount() {
        return this._popcount(this.mask);
    }

    // Количество нулевых битов в пределах capacity
    get lockedCount() {
        return this.capacity - this.unlockedCount;
    }

    // Быстрый popcount для BigInt
    _popcount(x) {
        let count = 0;
        while (x) {
            x &= (x - 1n);
            count++;
        }
        return count;
    }
}

module.exports = { createTimer: CreateTimer, ClassFault, isWithinTolerance, BitMask };