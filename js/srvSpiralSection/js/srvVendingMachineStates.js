'use strict';

/**
 * Унифицированные состояния
 */
const COMMON = {
    OK: 'OK',
    ERROR: 'ERROR',
    YES: 'YES',
    NO: 'NO'
};

/**
 * Глобальные состояния
 */
const GLOBAL = {
    MACHINE_STATE: {
        OK: 'OK',
        SERVICE: 'SERVICE',
        DEPLOY: 'DEPLOY'
    },

    INPUT_VOLTAGE: {
        OK: 'OK',
        ERR_HIGH: 'ERR_HIGH',
        ERR_LOW: 'ERR_LOW'
    },

    ENV: {
        TEMP: {
            OK: 'OK',
            ERR_HIGH: 'ERR_HIGH',
            ERR_LOW: 'ERR_LOW'
        },
        HUM: {
            OK: 'OK',
            ERR_HIGH: 'ERR_HIGH'
        }
    },

    HUB: {
        NET: {
            ONLINE: 'ONLINE',
            OFFLINE: 'OFFLINE',
            ERR_NO_LINK: 'ERR_NO_LINK'
        }
    }
};

/**
 * Шины питания
 */
const BUSES = {
    VOLTAGE: {
        OK: 'OK',
        ERR_HIGH: 'ERR_HIGH',
        ERR_LOW: 'ERR_LOW'
    },

    CURRENT: {
        OK: 'OK',
        ERR_HIGH: 'ERR_HIGH'
    },

    TEMP: {
        OK: 'OK',
        ERR_HIGH: 'ERR_HIGH',
        ERR_LOW: 'ERR_LOW'
    }
};

/**
 * Секции
 */
const SECTIONS = {
    AVAILABLE: {
        YES: 'YES',
        NO: 'NO'
    },

    LIFT: {
        STATUS: {
            OK: 'OK',
            SHORT_CIRCUIT: 'LIFT_SHORT_CIRCUIT',
            NO_POWER: 'LIFT_NO_POWER',
            TAMPER_ERROR: 'LIFT_TAMPER_ERROR',
            LEVEL_ERROR: 'LIFT_LEVEL_ERROR',
            OVERLOAD: 'OVERLOAD',
            BLOCKED: 'BLOCKED'
        }
    }
};

/**
 * Строки / колонки (справочные)
 */
const ROW_COL = {
    AVAILABLE: {
        YES: 'YES',
        NO: 'NO'
    }
};

/**
 * Ячейки (ключевая часть)
 */
const CELLS = {
    STATUS: {
        OK: 'OK',
        OVERLOAD: 'OVERLOAD',
        BLOCKED: 'BLOCKED',
        SERVICE: 'SERVICE',
        TAMPER_ERROR: 'TAMPER_ERROR',
        ACTUATOR_SHORT_CIRCUIT: 'ACTUATOR_SHORT_CIRCUIT',
        ACTUATOR_NO_POWER: 'ACTUATOR_NO_POWER'
    }
};

/**
 * IO модули
 */
const IO = {
    MODULE_STATUS: {
        OK: 'OK',
        ERR_NO_LINK: 'ERR_NO_LINK'
    },

    PORT_STATUS: {
        OK: 'OK',
        ERROR: 'ERROR'
    }
};

/**
 * Экспорт (единая точка)
 */
module.exports = { 
    STATES: {
        COMMON,
        GLOBAL,
        BUSES,
        SECTIONS,
        ROW_COL,
        CELLS,
        IO
    }
};