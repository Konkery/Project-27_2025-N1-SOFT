"use strict";
/**
 * SpiralStateAdapter.ts
 *
 * Anti-Corruption Layer (ACL) между доменной логикой спиральной секции (srvSpiralSection)
 * и контроллером состояний (srvStatesController).
 *
 * Принципы:
 * 1. Инкапсуляция: код секции оперирует только доменными методами и получает только булевы флаги.
 * 2. Никаких магических строк и приведений `as any`: все поля строго типизированы.
 * 3. Поддержка автономной работы секции при `state == null`.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.SpiralStateAdapter = void 0;
const IBaseSectionStates_1 = require("../../srvStatesController/ts/IBaseSectionStates");
const ISpiralSectionStates_1 = require("../../srvStatesController/ts/ISpiralSectionStates");
// @ts-ignore
const SpiralSectionConstants_1 = require("./SpiralSectionConstants");
// Маппинг числовых кодов ошибок в статусы цифрового двойника лифта
const FAULT_TO_LIFT_STATUS = {
    [SpiralSectionConstants_1.FAULTS.BOTTOM_TAMPER_FAIL]: ISpiralSectionStates_1.LIFT_STATE.ERR_TAMPER,
    [SpiralSectionConstants_1.FAULTS.IO_DRIVER_ERR]: ISpiralSectionStates_1.LIFT_STATE.BLOCKED,
    [SpiralSectionConstants_1.FAULTS.IO_PORT_ERR]: ISpiralSectionStates_1.LIFT_STATE.BLOCKED,
    [SpiralSectionConstants_1.FAULTS.LEVEL_SENSOR_FAIL]: ISpiralSectionStates_1.LIFT_STATE.ERR_LEVEL,
    [SpiralSectionConstants_1.FAULTS.LIFT_NO_POWER]: ISpiralSectionStates_1.LIFT_STATE.NO_POWER,
    [SpiralSectionConstants_1.FAULTS.LIFT_SHORT_CIRCUIT]: ISpiralSectionStates_1.LIFT_STATE.SHORT_CIRCUIT,
    [SpiralSectionConstants_1.FAULTS.LIFT_OVERLOAD]: ISpiralSectionStates_1.LIFT_STATE.OVERLOAD,
    [SpiralSectionConstants_1.FAULTS.LIFT_CTRL_UNDEFINED]: ISpiralSectionStates_1.LIFT_STATE.BLOCKED,
    [SpiralSectionConstants_1.FAULTS.TAMPER_BAD_POS]: ISpiralSectionStates_1.LIFT_STATE.ERR_TAMPER,
};
// Маппинг числовых кодов ошибок в статусы люка выдачи
const FAULT_TO_BOX_STATUS = {
    [SpiralSectionConstants_1.FAULTS.IO_DRIVER_ERR]: ISpiralSectionStates_1.DELIVERY_BOX_STATUS.BLOCKED,
    [SpiralSectionConstants_1.FAULTS.IO_PORT_ERR]: ISpiralSectionStates_1.DELIVERY_BOX_STATUS.BLOCKED,
    [SpiralSectionConstants_1.FAULTS.ERR_TAMPER]: ISpiralSectionStates_1.DELIVERY_BOX_STATUS.ERR_MECHANICAL,
};
// Маппинг числовых кодов ошибок в статусы ячеек матрицы
const FAULT_TO_CELL_STATUS = {
    [SpiralSectionConstants_1.FAULTS.ACTUATOR_SHORT_CIRCUIT]: ISpiralSectionStates_1.SPIRAL_CELL_STATE.ACTUATOR_SHORT_CIRCUIT,
    [SpiralSectionConstants_1.FAULTS.ACTUATOR_NO_POWER]: ISpiralSectionStates_1.SPIRAL_CELL_STATE.ACTUATOR_NO_POWER,
    [SpiralSectionConstants_1.FAULTS.ERR_TAMPER]: ISpiralSectionStates_1.SPIRAL_CELL_STATE.ERR_TAMPER,
    [SpiralSectionConstants_1.FAULTS.TAMPER_BAD_POS]: ISpiralSectionStates_1.SPIRAL_CELL_STATE.ERR_TAMPER_BAD_POS,
    [SpiralSectionConstants_1.FAULTS.IO_DRIVER_ERR]: ISpiralSectionStates_1.SPIRAL_CELL_STATE.BLOCKED,
    [SpiralSectionConstants_1.FAULTS.IO_PORT_ERR]: ISpiralSectionStates_1.SPIRAL_CELL_STATE.BLOCKED,
    [SpiralSectionConstants_1.FAULTS.IO_TIMEOUT]: ISpiralSectionStates_1.SPIRAL_CELL_STATE.BLOCKED,
};
class SpiralStateAdapter {
    #_State;
    // Локальное плоское хранилище для автономного режима (когда state == null)
    #_LiftStatus = ISpiralSectionStates_1.LIFT_STATE.OK;
    #_LiftAction = ISpiralSectionStates_1.LIFT_ACTION.IDLE;
    #_LiftResource = IBaseSectionStates_1.AVAILABLE_STATE.YES;
    #_BoxStatus = ISpiralSectionStates_1.DELIVERY_BOX_STATUS.OK;
    #_BoxAction = ISpiralSectionStates_1.DELIVERY_BOX_ACTION.CLOSED;
    #_BoxResource = IBaseSectionStates_1.AVAILABLE_STATE.YES;
    #_DoorState = undefined;
    #_SectionStatus = IBaseSectionStates_1.SECTION_STATUS.OK;
    #_SectionAction = IBaseSectionStates_1.SECTION_ACTION.IDLE;
    #_SectionAvailable = IBaseSectionStates_1.AVAILABLE_STATE.YES;
    #_Cells = new Map();
    constructor(state) {
        this.#_State = state ?? null;
    }
    // =========================================================================
    // ЛИФТ: БУЛЕВЫ ГЕТТЕРЫ (QUERIES)
    // =========================================================================
    get IsLiftAvailable() {
        const status = this.#_GetLiftStatus();
        return status !== ISpiralSectionStates_1.LIFT_STATE.SHORT_CIRCUIT && status !== ISpiralSectionStates_1.LIFT_STATE.OVERLOAD;
    }
    get IsLiftOk() {
        return this.#_GetLiftStatus() === ISpiralSectionStates_1.LIFT_STATE.OK;
    }
    get HasLiftLevelError() {
        return this.#_GetLiftStatus() === ISpiralSectionStates_1.LIFT_STATE.ERR_LEVEL;
    }
    #_GetLiftStatus() {
        return this.#_State ? this.#_State.Lift.Status : this.#_LiftStatus;
    }
    // =========================================================================
    // ЛИФТ: МЕТОДЫ-МУТАЦИИ (COMMANDS)
    // =========================================================================
    SetLiftMoving(direction) {
        const action = direction === 'UP' ? ISpiralSectionStates_1.LIFT_ACTION.MOVING_UP : ISpiralSectionStates_1.LIFT_ACTION.MOVING_DOWN;
        this.#_LiftAction = action;
        if (this.#_State) {
            this.#_State.Lift.Action = action;
        }
    }
    SetLiftIdle() {
        this.#_LiftAction = ISpiralSectionStates_1.LIFT_ACTION.IDLE;
        if (this.#_State) {
            this.#_State.Lift.Action = ISpiralSectionStates_1.LIFT_ACTION.IDLE;
        }
    }
    SetLiftFault(faultCode) {
        const mappedStatus = FAULT_TO_LIFT_STATUS[faultCode];
        if (mappedStatus) {
            this.#_LiftStatus = mappedStatus;
            if (mappedStatus === ISpiralSectionStates_1.LIFT_STATE.SHORT_CIRCUIT || mappedStatus === ISpiralSectionStates_1.LIFT_STATE.BLOCKED) {
                this.#_LiftResource = IBaseSectionStates_1.AVAILABLE_STATE.NO;
            }
            if (this.#_State) {
                this.#_State.Lift.Status = mappedStatus;
                if (mappedStatus === ISpiralSectionStates_1.LIFT_STATE.SHORT_CIRCUIT || mappedStatus === ISpiralSectionStates_1.LIFT_STATE.BLOCKED) {
                    this.#_State.Lift.Resource = IBaseSectionStates_1.AVAILABLE_STATE.NO;
                }
            }
        }
    }
    SetLiftReady() {
        this.#_LiftStatus = ISpiralSectionStates_1.LIFT_STATE.OK;
        this.#_LiftAction = ISpiralSectionStates_1.LIFT_ACTION.IDLE;
        this.#_LiftResource = IBaseSectionStates_1.AVAILABLE_STATE.YES;
        if (this.#_State) {
            this.#_State.Lift.Status = ISpiralSectionStates_1.LIFT_STATE.OK;
            this.#_State.Lift.Action = ISpiralSectionStates_1.LIFT_ACTION.IDLE;
            this.#_State.Lift.Resource = IBaseSectionStates_1.AVAILABLE_STATE.YES;
        }
    }
    // =========================================================================
    // СЕРВИСНАЯ ДВЕРЬ И ЛЮК ВЫДАЧИ: БУЛЕВЫ ГЕТТЕРЫ (QUERIES)
    // =========================================================================
    get IsDoorClosed() {
        const door = this.#_State ? this.#_State.Door : this.#_DoorState;
        return door === IBaseSectionStates_1.DOOR_STATE.CLOSED || door === undefined;
    }
    get IsBoxClosed() {
        const action = this.#_State ? this.#_State.DeliveryBox.Action : this.#_BoxAction;
        return action === ISpiralSectionStates_1.DELIVERY_BOX_ACTION.CLOSED;
    }
    // =========================================================================
    // СЕРВИСНАЯ ДВЕРЬ И ЛЮК ВЫДАЧИ: МЕТОДЫ-МУТАЦИИ (COMMANDS)
    // =========================================================================
    SetDoor(isClosed) {
        const door = isClosed ? IBaseSectionStates_1.DOOR_STATE.CLOSED : IBaseSectionStates_1.DOOR_STATE.OPEN;
        this.#_DoorState = door;
        if (this.#_State) {
            this.#_State.Door = door;
        }
    }
    SetBoxOpen() {
        this.#_BoxAction = ISpiralSectionStates_1.DELIVERY_BOX_ACTION.OPEN;
        if (this.#_State) {
            this.#_State.DeliveryBox.Action = ISpiralSectionStates_1.DELIVERY_BOX_ACTION.OPEN;
        }
    }
    SetBoxClose() {
        this.#_BoxAction = ISpiralSectionStates_1.DELIVERY_BOX_ACTION.CLOSED;
        if (this.#_State) {
            this.#_State.DeliveryBox.Action = ISpiralSectionStates_1.DELIVERY_BOX_ACTION.CLOSED;
        }
    }
    SetBoxFault(faultCode) {
        const mappedStatus = FAULT_TO_BOX_STATUS[faultCode];
        if (mappedStatus) {
            this.#_BoxStatus = mappedStatus;
            if (this.#_State) {
                this.#_State.DeliveryBox.Status = mappedStatus;
            }
        }
    }
    SetBoxReady() {
        this.#_BoxStatus = ISpiralSectionStates_1.DELIVERY_BOX_STATUS.OK;
        this.#_BoxAction = ISpiralSectionStates_1.DELIVERY_BOX_ACTION.CLOSED;
        this.#_BoxResource = IBaseSectionStates_1.AVAILABLE_STATE.YES;
        if (this.#_State) {
            this.#_State.DeliveryBox.Status = ISpiralSectionStates_1.DELIVERY_BOX_STATUS.OK;
            this.#_State.DeliveryBox.Action = ISpiralSectionStates_1.DELIVERY_BOX_ACTION.CLOSED;
            this.#_State.DeliveryBox.Resource = IBaseSectionStates_1.AVAILABLE_STATE.YES;
        }
    }
    // =========================================================================
    // СЕКЦИЯ: БУЛЕВЫ ГЕТТЕРЫ (QUERIES)
    // =========================================================================
    get IsSectionBlocked() {
        const status = this.#_State ? this.#_State.Status : this.#_SectionStatus;
        return status === IBaseSectionStates_1.SECTION_STATUS.BLOCKED;
    }
    get IsSectionAvailable() {
        const avail = this.#_State ? this.#_State.IsAvailable : this.#_SectionAvailable;
        return avail === IBaseSectionStates_1.AVAILABLE_STATE.YES;
    }
    // =========================================================================
    // СЕКЦИЯ: МЕТОДЫ-МУТАЦИИ (COMMANDS)
    // =========================================================================
    SetSectionDispense() {
        this.#_SectionStatus = IBaseSectionStates_1.SECTION_STATUS.DISPENSE;
        this.#_SectionAction = IBaseSectionStates_1.SECTION_ACTION.DISPENSE;
        this.#_SectionAvailable = IBaseSectionStates_1.AVAILABLE_STATE.NO;
        if (this.#_State) {
            this.#_State.Status = IBaseSectionStates_1.SECTION_STATUS.DISPENSE;
            this.#_State.Action = IBaseSectionStates_1.SECTION_ACTION.DISPENSE;
            this.#_State.IsAvailable = IBaseSectionStates_1.AVAILABLE_STATE.NO;
        }
    }
    SetSectionDelivery() {
        this.#_SectionStatus = IBaseSectionStates_1.SECTION_STATUS.DELIVERY;
        if (this.#_State) {
            this.#_State.Status = IBaseSectionStates_1.SECTION_STATUS.DELIVERY;
        }
    }
    SetSectionBlocked() {
        this.#_SectionStatus = IBaseSectionStates_1.SECTION_STATUS.BLOCKED;
        this.#_SectionAvailable = IBaseSectionStates_1.AVAILABLE_STATE.NO;
        if (this.#_State) {
            this.#_State.Status = IBaseSectionStates_1.SECTION_STATUS.BLOCKED;
            this.#_State.IsAvailable = IBaseSectionStates_1.AVAILABLE_STATE.NO;
        }
    }
    SetSectionIdle() {
        this.#_SectionStatus = IBaseSectionStates_1.SECTION_STATUS.IDLE;
        this.#_SectionAction = IBaseSectionStates_1.SECTION_ACTION.IDLE;
        this.#_SectionAvailable = IBaseSectionStates_1.AVAILABLE_STATE.YES;
        if (this.#_State) {
            this.#_State.Status = IBaseSectionStates_1.SECTION_STATUS.IDLE;
            this.#_State.Action = IBaseSectionStates_1.SECTION_ACTION.IDLE;
            this.#_State.IsAvailable = IBaseSectionStates_1.AVAILABLE_STATE.YES;
        }
    }
    // =========================================================================
    // ЯЧЕЙКИ: БУЛЕВЫ ГЕТТЕРЫ (QUERIES)
    // =========================================================================
    #_GetCellStatus(index) {
        if (this.#_State && this.#_State.Cells && this.#_State.Cells[index]) {
            return this.#_State.Cells[index].Status ?? ISpiralSectionStates_1.SPIRAL_CELL_STATE.OK;
        }
        return this.#_Cells.get(index)?.Status ?? ISpiralSectionStates_1.SPIRAL_CELL_STATE.OK;
    }
    IsCellAvailable(index) {
        const status = this.#_GetCellStatus(index);
        return (status === ISpiralSectionStates_1.SPIRAL_CELL_STATE.OK ||
            status === ISpiralSectionStates_1.SPIRAL_CELL_STATE.ERR_TAMPER ||
            status === ISpiralSectionStates_1.SPIRAL_CELL_STATE.ACTUATOR_NO_POWER);
    }
    IsCellCheckable(index) {
        const status = this.#_GetCellStatus(index);
        return (status === ISpiralSectionStates_1.SPIRAL_CELL_STATE.OK ||
            status === ISpiralSectionStates_1.SPIRAL_CELL_STATE.ERR_TAMPER_BAD_POS ||
            status === ISpiralSectionStates_1.SPIRAL_CELL_STATE.ACTUATOR_NO_POWER);
    }
    IsCellShorted(index) {
        return this.#_GetCellStatus(index) === ISpiralSectionStates_1.SPIRAL_CELL_STATE.ACTUATOR_SHORT_CIRCUIT;
    }
    IsCellOk(index) {
        return this.#_GetCellStatus(index) === ISpiralSectionStates_1.SPIRAL_CELL_STATE.OK;
    }
    HasCellNoPower(index) {
        return this.#_GetCellStatus(index) === ISpiralSectionStates_1.SPIRAL_CELL_STATE.ACTUATOR_NO_POWER;
    }
    HasCellOverload(index) {
        const status = this.#_GetCellStatus(index);
        return status === ISpiralSectionStates_1.SPIRAL_CELL_STATE.OVERLOAD_I || status === ISpiralSectionStates_1.SPIRAL_CELL_STATE.OVERLOAD;
    }
    // =========================================================================
    // ЯЧЕЙКИ: МЕТОДЫ-МУТАЦИИ (COMMANDS)
    // =========================================================================
    #_GetOrCreateLocalCell(index) {
        let cell = this.#_Cells.get(index);
        if (!cell) {
            cell = {
                Status: ISpiralSectionStates_1.SPIRAL_CELL_STATE.OK,
                Action: ISpiralSectionStates_1.CELL_ACTION.IDLE,
                Resource: IBaseSectionStates_1.AVAILABLE_STATE.YES,
            };
            this.#_Cells.set(index, cell);
        }
        return cell;
    }
    SetCellDispenseStart(index) {
        const cell = this.#_GetOrCreateLocalCell(index);
        cell.Action = ISpiralSectionStates_1.CELL_ACTION.ACTION;
        if (this.#_State && this.#_State.Cells && this.#_State.Cells[index]) {
            this.#_State.Cells[index].Action = ISpiralSectionStates_1.CELL_ACTION.ACTION;
        }
    }
    SetCellDispenseEnd(index) {
        const cell = this.#_GetOrCreateLocalCell(index);
        cell.Action = ISpiralSectionStates_1.CELL_ACTION.IDLE;
        if (this.#_State && this.#_State.Cells && this.#_State.Cells[index]) {
            this.#_State.Cells[index].Action = ISpiralSectionStates_1.CELL_ACTION.IDLE;
        }
    }
    SetCellFault(index, faultCode) {
        const mappedStatus = FAULT_TO_CELL_STATUS[faultCode];
        if (mappedStatus) {
            const cell = this.#_GetOrCreateLocalCell(index);
            cell.Status = mappedStatus;
            if (mappedStatus === ISpiralSectionStates_1.SPIRAL_CELL_STATE.ACTUATOR_SHORT_CIRCUIT) {
                cell.Resource = IBaseSectionStates_1.AVAILABLE_STATE.NO;
            }
            if (this.#_State && this.#_State.Cells && this.#_State.Cells[index]) {
                this.#_State.Cells[index].Status = mappedStatus;
                if (mappedStatus === ISpiralSectionStates_1.SPIRAL_CELL_STATE.ACTUATOR_SHORT_CIRCUIT) {
                    this.#_State.Cells[index].Resource = IBaseSectionStates_1.AVAILABLE_STATE.NO;
                }
            }
        }
    }
    SetCellOk(index) {
        const cell = this.#_GetOrCreateLocalCell(index);
        cell.Status = ISpiralSectionStates_1.SPIRAL_CELL_STATE.OK;
        if (this.#_State && this.#_State.Cells && this.#_State.Cells[index]) {
            this.#_State.Cells[index].Status = ISpiralSectionStates_1.SPIRAL_CELL_STATE.OK;
        }
    }
    SetCellOverload(index) {
        const cell = this.#_GetOrCreateLocalCell(index);
        cell.Status = ISpiralSectionStates_1.SPIRAL_CELL_STATE.OVERLOAD_I;
        if (this.#_State && this.#_State.Cells && this.#_State.Cells[index]) {
            this.#_State.Cells[index].Status = ISpiralSectionStates_1.SPIRAL_CELL_STATE.OVERLOAD_I;
        }
    }
    ClearCellsOverload() {
        // Сброс перегрузки в локальном хранилище
        for (const cell of this.#_Cells.values()) {
            if (cell.Status === ISpiralSectionStates_1.SPIRAL_CELL_STATE.OVERLOAD_I) {
                cell.Status = ISpiralSectionStates_1.SPIRAL_CELL_STATE.OK;
            }
        }
        // Сброс перегрузки в инжектированном состоянии
        if (this.#_State && this.#_State.Cells) {
            for (const cell of this.#_State.Cells) {
                if (cell && cell.Status === ISpiralSectionStates_1.SPIRAL_CELL_STATE.OVERLOAD_I) {
                    cell.Status = ISpiralSectionStates_1.SPIRAL_CELL_STATE.OK;
                }
            }
        }
    }
    SetCellReady(index) {
        const cell = this.#_GetOrCreateLocalCell(index);
        cell.Status = ISpiralSectionStates_1.SPIRAL_CELL_STATE.OK;
        cell.Action = ISpiralSectionStates_1.CELL_ACTION.IDLE;
        cell.Resource = IBaseSectionStates_1.AVAILABLE_STATE.YES;
        if (this.#_State && this.#_State.Cells && this.#_State.Cells[index]) {
            this.#_State.Cells[index].Status = ISpiralSectionStates_1.SPIRAL_CELL_STATE.OK;
            this.#_State.Cells[index].Action = ISpiralSectionStates_1.CELL_ACTION.IDLE;
            this.#_State.Cells[index].Resource = IBaseSectionStates_1.AVAILABLE_STATE.YES;
        }
    }
    // =========================================================================
    // СБРОС (RESET)
    // =========================================================================
    Reset() {
        this.#_LiftStatus = ISpiralSectionStates_1.LIFT_STATE.OK;
        this.#_LiftAction = ISpiralSectionStates_1.LIFT_ACTION.IDLE;
        this.#_LiftResource = IBaseSectionStates_1.AVAILABLE_STATE.YES;
        this.#_BoxStatus = ISpiralSectionStates_1.DELIVERY_BOX_STATUS.OK;
        this.#_BoxAction = ISpiralSectionStates_1.DELIVERY_BOX_ACTION.CLOSED;
        this.#_BoxResource = IBaseSectionStates_1.AVAILABLE_STATE.YES;
        this.#_DoorState = undefined;
        this.#_SectionStatus = IBaseSectionStates_1.SECTION_STATUS.OK;
        this.#_SectionAction = IBaseSectionStates_1.SECTION_ACTION.IDLE;
        this.#_SectionAvailable = IBaseSectionStates_1.AVAILABLE_STATE.YES;
        this.#_Cells.clear();
        if (this.#_State) {
            this.#_State.Reset();
        }
    }
}
exports.SpiralStateAdapter = SpiralStateAdapter;
exports.default = SpiralStateAdapter;
