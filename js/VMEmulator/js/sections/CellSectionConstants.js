/**
 * Константы постаматной секции ячеек (CellSection).
 */

const CELL_CONSTANTS = {
    // Состояния концевиков ячеек
    TAMPER_ON: 1,      // Дверца закрыта
    TAMPER_OFF: 0,     // Дверца открыта

    // Состояния соленоида замка
    LOCK_ON: 1,        // Напряжение подано
    LOCK_OFF: 0,       // Обесточен

    // Тайминги управления
    UNLOCK_TIMEOUT: 50,         // Время срабатывания механизма соленоида (мс)
    STEP_DELAY_MS: 100,         // Пауза между шагами переключения ключей матрицы (мс)
    WARN_TIMEOUT_MS: 15000,     // Таймаут открытой двери до предупреждения (15 с)
    ERROR_TIMEOUT_MS: 150000,   // Таймаут открытой двери до аварии (150 с / 2.5 мин)
    KC868_ECHO_TIMEOUT_MS: 50,  // Таймаут квитирования порта (мс)

    // Электрические параметры цепи соленоидов
    SUPPLY_VOLTAGE: 12.0,       // Номинальное напряжение питания шины соленоидов (В)

    ELECTR_CURR_STATE: {
        IDLE: 'IDLE',
        WORK_OK: 'WORK_OK',
        OVERLOAD: 'OVERLOAD',
        SHORT: 'SHORT',
    },

    CURRENT_RANGE: {
        // [low, high) в Амперах
        IDLE: [0, 0.1],          // Ток покоя / холостого хода (< 0.05 А)
        WORK_OK: [2.6, 3.6],     // Рабочий ток импульса соленоида (~3.0 А)
        OVERLOAD: [3.6, 4.5],    // Повышенная нагрузка
        SHORT: [4.5, Infinity],  // Короткое замыкание (> 4.50 А)
    },

    // Пороги контроля тока при пошаговой коммутации
    DELTA_LEAK_CURRENT: 0.05,        // Порог утечки/пробоя ключа на шаге 1 и 4 (А)
    SHORT_THRESHOLD_CURRENT: 4.50,   // Порог отсечки КЗ на шаге 2 (А)

    // Команды адресной светодиодной подсветки ячейки (ledChannels.ledCtrl)
    LED_TARGET: {
        ON: 'on',
        OFF: 'off',
        WARN: 'warn',
        ERROR: 'error',
    },

    // Состояния конечного автомата открытия ячейки
    CELL_STATE: {
        IDLE: 'IDLE',
        LOW_PORT_UP: 'LOW_PORT_UP',
        HIGH_PORT_UP: 'HIGH_PORT_UP',
        LOW_PORT_DOWN: 'LOW_PORT_DOWN',
        HIGH_PORT_DOWN: 'HIGH_PORT_DOWN',
        OPEN: 'OPEN',
        WARN: 'WARN',
        ERROR: 'ERROR',
    },
};

/**
 * Коды типовых аварий постаматной секции
 */
const CELL_FAULTS = {
    NONE: 0,
    TAMPER_ALREADY_OPEN: 1,      // Дверца уже открыта перед стартом операции
    TAMPER_SPONTANEOUS_OPEN: 2,  // Самопроизвольное открытие дверцы в покое (взлом/отказ)
    ROW_PORT_LEAK: 3,            // Пробой ключа строки GND (утечка тока на Step 1)
    SOLENOID_SHORT_CIRCUIT: 4,   // Короткое замыкание соленоида замка на Step 2 (> 4.5 А)
    ROW_PORT_STUCK: 5,           // Залипание ключа строки при попытке отключения на Step 3
    COL_PORT_STUCK: 6,           // Залипание ключа столбца при попытке отключения на Step 4
    DOOR_OPEN_TIMEOUT: 7,        // Превышение допустимого времени открытой двери клиентом
};

module.exports = {
    CELL_CONSTANTS,
    CELL_FAULTS,
};
