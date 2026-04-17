function parseRange(json) {
    const obj = JSON.parse(json)

    // null → Infinity
    for (const key in obj) {
        if (obj[key][1] === null) {
            obj[key][1] = Infinity
        }
    }

    return obj
}

function parseValue(_var) {
    let val = Number(_var);
    if (isNaN(val)) 
        throw new Error('Invalid arg')
    return val
}

const STORAGE_CONSTANSTS = {
    SHORT_CH_VAL: parseValue(process.env.STORAGE_SHORT_CH_VAL),

    TAMPER_ON: parseValue(process.env.STORAGE_TAMPER_ON),
    TAMPER_OFF: parseValue(process.env.STORAGE_TAMPER_OFF),
    TAMPER_UNDEFINED: parseValue(process.env.STORAGE_TAMPER_UNDEFINED),

    AVG_ROTATION_TIME: parseValue(process.env.STORAGE_AVG_ROTATION_TIME),
    FULL_ROTATION_TIMEOUT: parseValue(process.env.STORAGE_FULL_ROTATION_TIMEOUT),

    CURRENT_RANGE: parseRange(
        process.env.STORAGE_CURRENT_RANGE
    ),
    
    ELECTR_CURR_STATE: {
        IDLE: 'IDLE',
        WORK_OK: 'WORK_OK',
        OVERLOAD: 'STUCK'
    }
}
const LIFT_CONSTANTS = {
    TAMPER_ON: parseValue(process.env.LIFT_TAMPER_ON),
    TAMPER_OFF: parseValue(process.env.LIFT_TAMPER_OFF),

    LIFT_LEVEL_ON: parseValue(process.env.LIFT_LEVEL_ON),
    LIFT_LEVEL_OFF: parseValue(process.env.LIFT_LEVEL_OFF),

    LIFT_BOTTOM_TAMPER_ON: parseValue(process.env.LIFT_BOTTOM_TAMPER_ON),
    LIFT_BOTTOM_TAMPER_DEBOUNCE: parseValue(process.env.LIFT_BOTTOM_TAMPER_DEBOUNCE),

    DOUBLE_TRIGGER_WINDOW: parseValue(process.env.LIFT_DOUBLE_TRIGGER_WINDOW),

    ELEVATE_NEXT_AVG_TIME: parseValue(process.env.LIFT_ELEVATE_NEXT_AVG_TIME),
    ELEVATE_NEXT_OVERLOAD_TIME: parseValue(process.env.LIFT_ELEVATE_NEXT_OVERLOAD_TIME),
    ELEVATE_NEXT_MAX_TIME: parseValue(process.env.LIFT_ELEVATE_NEXT_MAX_TIME),

    MOTOR_RES_MAX_TIME: parseValue(process.env.LIFT_MOTOR_RES_MAX_TIME),

    CURRENT_RANGE: parseRange(
        process.env.LIFT_CURRENT_RANGE
    ),

    ELECTR_CURR_STATE: {
        IDLE: 'IDLE',
        WORK_OK: 'WORK_OK',
        OVERLOAD: 'STUCK',
        SHORT: 'SHORT'
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

const FAULT_DESC_RU = {
    0: "Нет ошибки",

    1: "Короткое замыкание двигателя лифта",
    2: "Отсутствует питание двигателя лифта",
    3: "Перегрузка двигателя лифта",
    4: "Неопределённое состояние управления лифтом",

    5: "Отказ датчика уровня",
    6: "Отказ нижнего тампера",

    7: "Отсутствует питание актуатора",
    8: "Короткое замыкание актуатора",
    9: "Ошибка сигнала тампера",
    10: "Перегрузка актуатора",

    13: "Ошибка драйвера ввода-вывода",
    14: "Таймаут обмена с устройством ввода-вывода",
    15: "Ошибка порта ввода-вывода"
}

module.exports = { STORAGE_CONSTANSTS, LIFT_CONSTANTS, CELL_CONSTANTS, FAULTS, FAULT_DESC_RU };