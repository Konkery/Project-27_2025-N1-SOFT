class BitMask {
    constructor(capacity) {
        if (!Number.isInteger(capacity) || capacity <= 0) {
            throw new TypeError("Capacity must be a positive integer");
        }
        this.capacity = capacity;
        this.fullMask = (1n << BigInt(capacity)) - 1n;
        this.mask = 0n;
    }

    _checkIndex(i) {
        if (!Number.isInteger(i) || i < 0 || i >= this.capacity) {
            throw new RangeError(`Index must be in range [0, ${this.capacity - 1}]`);
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

module.exports = { BitMask };
