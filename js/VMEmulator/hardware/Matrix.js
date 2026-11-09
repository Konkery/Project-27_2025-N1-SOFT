class Matrix {
    constructor(size) {
        this.rows = size.rows;
        this.cols = size.cols;
        this.sourceState = null;
        this.groundState = null;
        this.entryActive = Array.from({ length: this.rows }, () =>
            Array(this.cols).fill(0)
        );
        this.portFault = {
            sourceStuckOn: Array(this.rows).fill(false),
            groundStuckOn: Array(this.cols).fill(false),
        };
        this.reset();
    }

    setSource(col, val) {
        if (col < 0 || col >= this.cols) throw Error(`Invalid col value`);
        this.sourceState[col] = val ? 1 : 0;
        this._recalcMatrix();
    }

    setGround(row, val) {
        if (row < 0 || row >= this.rows) throw Error(`Invalid row value`);
        this.groundState[row] = val ? 1 : 0;
        this._recalcMatrix();
    }

    reset() {
        this.sourceState = Array(this.rows).fill(0); // строки
        this.groundState = Array(this.cols).fill(0); // столбцы

        this.entryActive = Array.from({ length: this.rows }, () =>
            Array(this.cols).fill(0)
        );
        this.portFault = {
            sourceStuckOn: Array(this.rows).fill(false),
            groundStuckOn: Array(this.cols).fill(false),
        };
    }

    _recalcMatrix() {
        let activeCount = 0;
        for (let row = 0; row < this.rows; row++) {
            for (let col = 0; col < this.cols; col++) {
                const prev = this.entryActive[row][col];

                const sourceOn = this.sourceState[col] || this.portFault.sourceStuckOn[col];
                const groundOn = this.groundState[row] || this.portFault.groundStuckOn[row];

                const next = sourceOn && groundOn ? 1 : 0;
                // --- включение ---
                if (prev === 0 && next === 1) {
                    this.onOn({ row, col });
                }
                // --- отключение ---
                if (prev === 1 && next === 0) {
                    this.onOff({ row, col });
                }
                this.entryActive[row][col] = next;

                if (next === 1) {
                    activeCount++;
                }
            }
        }
    }

    countActive() {
        let activeCount = 0;
        for (let r of this.entryActive) {
            for (let c of r) {
                if (c == 1) activeCount++;
            }
        }
        return activeCount;
    }

    onOn({ row, col }) {}

    onOff({ row, col }) {}

    // Аварийные сценарии (заглушки)
    // Пробой Source (залипание в 1)
    injectSourceStuckOn(row) {
        this.portFault.sourceStuckOn[row] = true;
        this.sourceState[row] = 1;
        this._recalcMatrix();
    }
    // Пробой Ground
    injectGroundStuckOn(col) {
        this.portFault.groundStuckOn[col] = true;
        this.groundState[col] = 1;
        this._recalcMatrix();
    }
    // Сброс аварии
    clearStuck() {
        this.portFault.sourceStuckOn.fill(false);
        this.portFault.groundStuckOn.fill(false);
    }
}

module.exports = { Matrix };
