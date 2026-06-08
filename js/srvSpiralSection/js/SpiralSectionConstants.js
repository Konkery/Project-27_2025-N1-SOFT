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

function parseValue(val, name) {
    let num = Number(val);
    if (isNaN(num)) {
        const errorMsg = `Invalid configuration: Variable "${name}" is expected to be a number, but received ${JSON.stringify(val)} (type: ${typeof val})`;
        console.error(errorMsg);
        throw new Error(errorMsg);
    }
    return num;
}

const STORAGE_CONSTANSTS = {
    SHORT_CH_VAL: parseValue(process.env.SHORT_CH_VAL, 'SHORT_CH_VAL'),
    POWER_OFF_CH_VAL: parseValue(process.env.POWER_OFF_CH_VAL, 'POWER_OFF_CH_VAL'),

    TAMPER_ON: parseValue(process.env.STORAGE_TAMPER_ON, 'STORAGE_TAMPER_ON'),
    TAMPER_OFF: parseValue(process.env.STORAGE_TAMPER_OFF, 'STORAGE_TAMPER_OFF'),
    TAMPER_UNDEFINED: parseValue(process.env.STORAGE_TAMPER_UNDEFINED, 'STORAGE_TAMPER_UNDEFINED'),

    AVG_ROTATION_TIME: parseValue(process.env.STORAGE_AVG_ROTATION_TIME, 'STORAGE_AVG_ROTATION_TIME'),
    FULL_ROTATION_TIMEOUT: parseValue(process.env.STORAGE_FULL_ROTATION_TIMEOUT, 'STORAGE_FULL_ROTATION_TIMEOUT'),

    MONITOR_INTERVAL: parseValue(process.env.MONITOR_INTERVAL, 'MONITOR_INTERVAL'),

    CURRENT_RANGE: parseRange(
        process.env.STORAGE_CURRENT_RANGE
    ),
    
    ELECTR_CURR_STATE: {
        IDLE: 'IDLE',
        WORK_OK: 'WORK_OK',
        OVERLOAD: 'STUCK',
        SHORT: 'SHORT'
    }
}
const LIFT_CONSTANTS = {
    LIFT_LEVEL_ON: parseValue(process.env.LIFT_LEVEL_ON, 'LIFT_LEVEL_ON'),
    LIFT_LEVEL_OFF: parseValue(process.env.LIFT_LEVEL_OFF, 'LIFT_LEVEL_OFF'),

    LIFT_BOTTOM_TAMPER_ON: parseValue(process.env.LIFT_BOTTOM_TAMPER_ON, 'LIFT_BOTTOM_TAMPER_ON'),
    LIFT_BOTTOM_TAMPER_OFF: parseValue(process.env.LIFT_BOTTOM_TAMPER_OFF, 'LIFT_BOTTOM_TAMPER_OFF'),
    LIFT_BOTTOM_TAMPER_DEBOUNCE: parseValue(process.env.LIFT_BOTTOM_TAMPER_DEBOUNCE, 'LIFT_BOTTOM_TAMPER_DEBOUNCE'),

    DOUBLE_TRIGGER_WINDOW: parseValue(process.env.LIFT_DOUBLE_TRIGGER_WINDOW, 'LIFT_DOUBLE_TRIGGER_WINDOW'),

    ELEVATE_NEXT_AVG_TIME: parseValue(process.env.LIFT_ELEVATE_NEXT_AVG_TIME, 'LIFT_ELEVATE_NEXT_AVG_TIME'),
    ELEVATE_NEXT_OVERLOAD_TIME: parseValue(process.env.LIFT_ELEVATE_NEXT_OVERLOAD_TIME, 'LIFT_ELEVATE_NEXT_OVERLOAD_TIME'),
    ELEVATE_NEXT_MAX_TIME: parseValue(process.env.LIFT_ELEVATE_NEXT_MAX_TIME, 'LIFT_ELEVATE_NEXT_MAX_TIME'),

    MOTOR_RES_MAX_TIME: parseValue(process.env.LIFT_MOTOR_RES_MAX_TIME, 'LIFT_MOTOR_RES_MAX_TIME'),
    MONITOR_INTERVAL: parseValue(process.env.MONITOR_INTERVAL, 'MONITOR_INTERVAL'),

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

const BOX_CONSTANTS = {
    OPENED_TIME_SEC: parseValue(process.env.OPENED_TIME_SEC, 'OPENED_TIME_SEC'),
    DOOR_CLOSED: parseValue(process.env.DOOR_CLOSED, 'DOOR_CLOSED'),
    BOX_CLOSED:  parseValue(process.env.BOX_CLOSED, 'BOX_CLOSED'),
    UNLOCK_ON: parseValue(process.env.UNLOCK_ON, 'UNLOCK_ON'),
    UNLOCK_OFF: parseValue(process.env.UNLOCK_OFF, 'UNLOCK_OFF'),
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
    TAMPER_BAD_POS: 19,
    ACTUATOR_OVERLOAD: 10,
    ACTUATOR_OVERLOAD_1: 11,
    ACTUATOR_OVERLOAD_2: 12,

    IO_DRIVER_ERR: 13,
    IO_TIMEOUT: 14,
    IO_PORT_ERR: 15,
    IO_PORT_ERR_1: 16,
    IO_PORT_ERR_2: 17,

    FALLBACK_TIMEOUT: 18,
    DOOR_OPENED: 20
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
    [FAULTS.NONE]: "Нет ошибки",
    [FAULTS.LIFT_SHORT_CIRCUIT]: "Короткое замыкание двигателя лифта",
    [FAULTS.LIFT_NO_POWER]: "Отсутствует питание двигателя лифта",
    [FAULTS.LIFT_OVERLOAD]: "Перегрузка двигателя лифта",
    [FAULTS.LIFT_CTRL_UNDEFINED]: "Неопределённое состояние управления лифтом",

    [FAULTS.LEVEL_SENSOR_FAIL]: "Отказ датчика уровня",
    [FAULTS.BOTTOM_TAMPER_FAIL]: "Отказ нижнего тампера",
    [FAULTS.TAMPER_BAD_POS]: "Одна из спиралей находится в некорректном начальном положении",
    [FAULTS.ACTUATOR_NO_POWER]: "Отсутствует питание актуатора",
    [FAULTS.ACTUATOR_SHORT_CIRCUIT]: "Короткое замыкание актуатора",
    [FAULTS.TAMPER_ERROR]: "Ошибка сигнала тампера",
    [FAULTS.ACTUATOR_OVERLOAD]: "Перегрузка актуатора",

    [FAULTS.IO_DRIVER_ERR]: "Ошибка драйвера ввода-вывода",
    [FAULTS.IO_TIMEOUT]: "Таймаут обмена с устройством ввода-вывода",
    [FAULTS.IO_PORT_ERR]: "Ошибка порта ввода-вывода",

    [FAULTS.FALLBACK_TIMEOUT]: "Выполнение команды прервано из за превышения ожидаемого таймаута",
    [FAULTS.DOOR_OPENED]: "Дверь открыта, выполнение транзакции заблокировано"
}

module.exports = { STORAGE_CONSTANSTS, LIFT_CONSTANTS, BOX_CONSTANTS, CELL_CONSTANTS, FAULTS, FAULT_DESC_RU };
