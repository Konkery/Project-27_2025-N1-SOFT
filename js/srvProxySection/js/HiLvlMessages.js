/**
 * Globally unique identifier (GUID/UUID).
 * Формат: строка длиной 36 символов.
 * Пример: "550e8400-e29b-41d4-a716-446655440000"
 * @typedef {string} GUID
 */

/**
 * Timestamp in RFC-like textual format.
 * Пример: "Fri, 02 Feb 1996 08:04:05"
 * @typedef {string} Timestamp
 */

/**
 * Идентификатор пользователя системы.
 * @typedef {string} UserID
 */

/**
 * Аппарат (устройство), участвующий в выполнении транзакции.
 * Например: торговый автомат, складской модуль, робот и т.д.
 *
 * @typedef {Object} TypeTarget
 *
 * @property {GUID} id
 * Уникальный идентификатор аппарата.
 *
 * @property {string} name
 * Человекочитаемое имя аппарата.
 * Пример: "Machine-1-spiral"
 */

/**
 * Описание отдельной ячейки хранения.
 *
 * @typedef {Object} Cell
 *
 * @property {number} row
 * Номер строки ячейки.
 *
 * @property {number} column
 * Номер столбца ячейки.
 *
 * @property {number} quantity
 * Количество единиц ТМЦ в ячейке.
 *
 * @property {GUID} itemID
 * Уникальный идентификатор товара (ТМЦ).
 */

/**
 * Операция, выполняемая в рамках транзакции.
 * Может содержать несколько ячеек.
 *
 * @typedef {Object} Order
 *
 * @property {TypeTarget} Target
 * Аппарат, которому адресована команда.
 *
 * @property {string} Command
 * Команда выполнения.
 *
 * Возможные значения (пример):
 * - "getItem"
 * - "putItem"
 * - "checkStatus"
 *
 * @property {Cell[]} Cells
 * Список ячеек, к которым применяется команда.
 */

/**
 * Основная транзакция верхнего уровня.
 * Содержит одну или несколько операций (Orders).
 *
 * @typedef {Object} Transaction
 *
 * @property {GUID} ID
 * Уникальный идентификатор транзакции.
 *
 * @property {Timestamp} Timestamp
 * Время формирования транзакции.
 *
 * @property {UserID} UserID
 * Идентификатор пользователя, инициировавшего транзакцию.
 *
 * @property {string} Source
 * Источник транзакции.
 *
 * Возможные значения:
 * - "HiLvl" — верхний уровень
 * - "LoLvl" — нижний уровень
 *
 * @property {Order[]} Orders
 * Список операций, входящих в транзакцию.
 */

/**
 * Ответ на выполнение транзакции.
 * Формируется аппаратом после обработки команды.
 *
 * @typedef {Object} Response
 *
 * @property {GUID} ID
 * Уникальный идентификатор ответа.
 *
 * @property {GUID} ParentID
 * Идентификатор транзакции,
 * на которую формируется ответ.
 *
 * @property {Timestamp} Timestamp
 * Время формирования ответа.
 *
 * @property {TypeTarget} Target
 * Аппарат, сформировавший ответ.
 *
 * @property {Cell} Cell
 * Ячейка, к которой относится ответ.
 *
 * Обычно соответствует одной операции.
 *
 * @property {"OK" | "ERROR" | "PARTIAL"} Result
 * Результат выполнения.
 *
 * Возможные значения:
 * - "OK" — успешно
 * - "ERROR" — ошибка
 * - "PARTIAL" — частичное выполнение
 *
 * @property {string} Message
 * Человекочитаемое описание результата.
 * Используется для диагностики.
 */

module.exports = { 
    Transaction,
    Response,
    Order,
    Cell,
    Target: TypeTarget
}