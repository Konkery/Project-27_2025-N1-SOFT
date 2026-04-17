const STORAGE_CONSTANSTS = {
    SHORT_CH_VAL: 1,

    TAMPER_ON: 0,
    TAMPER_OFF: 1,
    TAMPER_UNDEFINED: 0,
    AVG_ROTATION_TIME: 2000,
    FULL_ROTATION_TIMEOUT: 2500,
    
    ELECTR_CURR_STATE: {
        IDLE: 'IDLE',
        WORK_OK: 'WORK_OK',
        OVERLOAD: 'OVERLOAD',
        SHORT: 'SHORT'
    },

    CURRENT_RANGE: {
        // [a, b)
        IDLE: [0, 0.03],
        WORK_OK: [0.03, 0.18],
        OVERLOAD: [0.19, 0.225],
        SHORT: [0.225, Infinity]
    }
}
const LIFT_CONSTANTS = {
    TAMPER_ON: 1,
    TAMPER_OFF: 0,

    LIFT_LEVEL_ON: 1,
    LIFT_LEVEL_OFF: 0,
    
    LIFT_BOTTOM_TAMPER_ON: 1,
    LIFT_BOTTOM_TAMPER_DEBOUNCE: 1000,
    DOUBLE_TRIGGER_WINDOW: 100, //ms
    ELEVATE_NEX_AVG_TIME: 1000,
    ELEVATE_NEXT_OVERLOAD_TIME: 2300,
    ELEVATE_NEXT_MAX_TIME: 2500,

    MOTOR_RES_MAX_TIME: 200,

    ELECTR_CURR_STATE: {
        IDLE: 'IDLE',
        WORK_OK: 'WORK_OK',
        OVERLOAD: 'OVERLOAD',
        SHORT: 'SHORT'
    },

    CURRENT_RANGE: {
        // [a, b)
        IDLE: [0, 0.5],
        WORK_OK: [0.5, 3.2],
        OVERLOAD: [3.2, 3.75],
        SHORT: [3.75, Infinity]
    }
}

const FAULTS = {
    NONE: 0,

    LIFT_SHORT_CIRCUIT: 1,
    LIFT_NO_POWER: 2,
    LIFT_OVERLOAD: 3,
    LIFT_OVERLOAD_1: 31,
    LIFT_OVERLOAD_2: 32,
    LIFT_CTRL_UNDEFINED: 4,

    LEVEL_SENSOR_FAIL: 5,
    BOTTOM_TAMPER_FAIL: 6,

    ACTUATOR_NO_POWER: 7,
    ACTUATOR_SHORT_CIRCUIT: 8,
    TAMPER_ERROR: 9,
    ACTUATOR_OVERLOAD: 10,
    ACTUATOR_OVERLOAD_1: 11,
    ACTUATOR_OVERLOAD_2: 12,

    IO_DRIVER_ERR: 13,
    IO_TIMEOUT: 14,
    IO_PORT_ERR: 15,
    IO_PORT_ERR_1: 16,
    IO_PORT_ERR_2: 17,
};

const CELL_CONSTANTS = {
    TAMPER_ON: 1,
    TAMPER_OFF: 0,

    LOCK_ON: 1,
    LOCK_OFF: 0,
    UNLOCK_TIMEOUT: 50,

    ELECTR_CURR_STATE: {
        IDLE: 'IDLE',
        WORK_OK: 'WORK_OK',
        OVERLOAD: 'STUCK',
        SHORT: 'SHORT'
    },

    CURRENT_RANGE: {
        // [a, b)
        IDLE: [0, 2.8],
        WORK_OK: [2.8, 3.2],
        OVERLOAD: [3.2, 3.75],
        SHORT: [3.75, Infinity]
    }
}

module.exports = { STORAGE_CONSTANSTS, LIFT_CONSTANTS, CELL_CONSTANTS, FAULTS }