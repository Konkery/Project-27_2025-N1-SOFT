const CELL_STATE = {
    OK: 'OK',
    OVERLOAD: 'OVERLOAD',
    BLOCKED: 'BLOCKED',
    SERVICE: 'SERVICE',
    TAMPER_ERROR: 'TAMPER_ERROR',
    ACTUATOR_SHORT_CIRCUIT: 'ACTUATOR_SHORT_CIRCUIT',
    ACTUATOR_NO_POWER: 'ACTUATOR_NO_POWER'
};

const IO_STATE = {
    OK: 'OK',
    ERR_NO_LINK: 'ERR_NO_LINK'
};

const IO_PORT_STATE = {
    OK: 'OK',
    ERROR: 'ERROR'
};

const SPIRAL_LIFT_STATE = {
    OK: 'OK',
    LIFT_SHORT_CIRCUIT: 'LIFT_SHORT_CIRCUIT',
    LIFT_NO_POWER: 'LIFT_NO_POWER',
    LIFT_TAMPER_ERROR: 'LIFT_TAMPER_ERROR',
    LIFT_LEVEL_ERROR: 'LIFT_LEVEL_ERROR'
};

const ROW_COL_STATE = {
    OK: 'OK',
    BLOCKED: 'BLOCKED'
};

const SECTION_STATE = {
    OK: 'OK',
    BLOCKED: 'BLOCKED'
};

const BUS_VOLTAGE_STATE = {
    OK: 'OK',
    ERR_HIGH: 'ERR_HIGH',
    ERR_LOW: 'ERR_LOW' 
};

const BUS_CURRENT_STATE = {
    OK: 'OK',
    ERR_HIGH: 'ERR_HIGH'
};

const BUS_TEMP_STATE = {
    OK: 'OK',
    ERR_HIGH: 'ERR_HIGH',
    ERR_LOW: 'ERR_LOW'    
};

const GLOBAL_MACHINE_STATE = {
    OK: 'OK',
    SERVICE: 'SERVICE',
    DEPLOY: 'DEPLOY'
};

const GLOBAL_INPUT_VOLTAGE_STATE = {
    OK: 'OK',
    ERR_HIGH: 'ERR_HIGH',
    ERR_LOW: 'ERR_LOW'
};

const GLOBAL_ENV_TEMP_STATE = {
    OK: 'OK',
    ERR_HIGH: 'ERR_HIGH',
    ERR_LOW: 'ERR_LOW'
};

const GLOBAL_ENV_HUM_STATE = {
    OK: 'OK',
    ERR_HIGH: 'ERR_HIGH'
};

const GLOBAL_NET_STATE = {
    ONLINE: 'ONLINE',
    OFFLINE: 'OFFLINE',
    ERR_NO_LINK: 'ERR_NO_LINK'
};

class ClassStatesController {
    static STATES = {
        GLOBAL_MACHINE_STATE: GLOBAL_MACHINE_STATE,
        GLOBAL_INPUT_VOLTAGE_STATE: GLOBAL_INPUT_VOLTAGE_STATE,
        GLOBAL_ENV_TEMP_STATE: GLOBAL_ENV_TEMP_STATE,
        GLOBAL_ENV_HUM_STATE: GLOBAL_ENV_HUM_STATE,
        GLOBAL_NET_STATE: GLOBAL_NET_STATE,
        BUS_VOLTAGE_STATE: BUS_VOLTAGE_STATE,
        BUS_CURRENT_STATE: BUS_CURRENT_STATE,
        BUS_TEMP_STATE: BUS_TEMP_STATE,
        SECTION_STATE: SECTION_STATE,
        ROW_COL_STATE: ROW_COL_STATE,
        SPIRAL_LIFT_STATE: SPIRAL_LIFT_STATE,
        CELL_STATE: CELL_STATE,
        IO_STATE: IO_STATE,
        IO_PORT_STATE: IO_PORT_STATE
    };

    #_Global = {};
    #_Buses = {};
    #_Sections = {};

    constructor () {
        if (this.Instance) {
            return this.Instance;
        } else {
            ClassStatesController.prototype.Instance = this;
        }

        this.Init ();
    }

    Init () {
        this.#_Global = {
            Machine: null,
            Input_Voltage: null,
            Env: {
                Up: {
                    Temp: null,
                    Hum: null
                },
                Down: {
                    Temp: null,
                    Hum: null
                }
            },
            Net: {
                Hi: null,
                Med: null,
                Low: null
            }
        };

        this.#_Buses = {
            Bus_1: {
                Voltage: null,
                Current: null,
                Temp: null
            },
            Bus_2: {
                Voltage: null,
                Current: null,
                Temp: null
            },
            Bus_3: {
                Voltage: null,
                Current: null,
                Temp: null
            },
            Bus_4: {
                Voltage: null,
                Current: null,
                Temp: null
            },
            Bus_5: {
                Voltage: null,
                Current: null,
                Temp: null
            }
        };

        this.#_Sections = {
            Spiral: {
                Row: [],
                Col: [],
                Cells: [],
                IO: {
                    Low: {
                        State: null,
                        Ports: []
                    },
                    High: {
                        State: null,
                        Ports: []
                    }
                },
                Lift: null
            },
            Postomat: {
                Row: [],
                Col: [],
                Cells: [],
                IO: {
                    Low: {
                        State: null,
                        Ports: []
                    },
                    High: {
                        State: null,
                        Ports: []
                    }
                }
            }
        };
    }

    /**
     * @method
     * @description Возвращает ответ, находится-ли указанная ячейка постоматной секции в доступном статусе
     * @param {Number} _index       - индекс ячейки 
     * @returns {Number}            - 0 или 1
     */
    CellAvailable_post ( _index ) {
        return ([ClassStatesController.STATES.CELL_STATE.OK, ClassStatesController.STATES.CELL_STATE.OVERLOAD].includes(this.#_Sections.Postomat.Cells[_index]));
    }

    /**
     * @method
     * @description Возвращает ответ, находится-ли указанная ячейка спиральной секции в доступном статусе
     * @param {Number} _index       - индекс ячейки 
     * @returns {Number}            - 0 или 1
     */
    CellAvailable_spiral ( _index ) {
        return ([ClassStatesController.STATES.CELL_STATE.OK, ClassStatesController.STATES.CELL_STATE.OVERLOAD].includes(this.#_Sections.Spiral.Cells[_index]));
    }

    /**
     * @method
     * @description Устанавливает статус указанной ячейки постоматной секции
     * @param {Number} _index       - индекс ячейки 
     * @param {STATE} _state        - статус из коллекции this.STATES.CELL_STATE
     */
    SetCellState_post ( _index, _state ) {
        if (Object.values(ClassStatesController.STATES.CELL_STATE).includes(_state)) {
            this.#_Sections.Postomat.Cells[_index] = _state;
        }
    }

    /**
     * @method
     * @description Устанавливает статус указанной ячейки спиральной секции
     * @param {Number} _index       - индекс ячейки 
     * @param {STATE} _state        - статус из коллекции this.STATES.CELL_STATE
     */
    SetCellState_spiral ( _index, _state ) {
        if (Object.values(ClassStatesController.STATES.CELL_STATE).includes(_state)) {
            this.#_Sections.Spiral.Cells[_index] = _state;
        }
    }

    /**
     * @method
     * @description Возвращает текущиий статус ячейки постомата
     * @param {Number} _index       - индекс ячейки 
     * @returns {STATE} _state      - статус из коллекции this.STATES.CELL_STATE
     */
    GetCellState_post ( _index ) {
        return this.#_Sections.Postomat.Cells[_index];
    }

    /**
     * @method
     * @description Возвращает текущиий статус ячейки спиральной секции
     * @param {Number} _index       - индекс ячейки 
     * @returns {STATE} _state      - статус из коллекции this.STATES.CELL_STATE
     */
    GetCellState_spiral ( _index ) {
        return this.#_Sections.Spiral.Cells[_index];
    }

    /**
     * @method
     * @description Устанавливает статус соединения с контроллером нижнего плеча постоматной секции
     * @param {STATE} _state        - статус из коллекции this.STATES.IO
     */
    SetLowIOState_post ( _state ) {
        if (Object.values(ClassStatesController.STATES.IO_STATE).includes(_state)) {
            this.#_Sections.Postomat.IO.Low.State = _state;
        }
    }

    /**
     * @method
     * @description Устанавливает статус соединения с контроллером верхнего плеча постоматной секции
     * @param {STATE} _state        - статус из коллекции this.STATES.IO
     */
    SetHighIOState_post ( _state ) {
        if (Object.values(ClassStatesController.STATES.IO_STATE).includes(_state)) {
            this.#_Sections.Postomat.IO.High.State = _state;
        }
    }

    /**
     * @method
     * @description Устанавливает статус соединения с контроллером нижнего плеча спиральной секции
     * @param {STATE} _state        - статус из коллекции this.STATES.IO
     */
    SetLowIOState_spiral ( _state ) {
        if (Object.values(ClassStatesController.STATES.IO_STATE).includes(_state)) {
            this.#_Sections.Spiral.IO.Low.State = _state;
        }
    }

    /**
     * @method
     * @description Устанавливает статус соединения с контроллером верхнего плеча спиральной секции
     * @param {STATE} _state        - статус из коллекции this.STATES.IO
     */
    SetHighIOState_spiral ( _state ) {
        if (Object.values(ClassStatesController.STATES.IO_STATE).includes(_state)) {
            this.#_Sections.Spiral.IO.High.State = _state;
        }
    }

    /**
     * @method
     * @description Устанавливает статус указанного порта контроллера нижнего плеча постоматной секции
     * @param {Number} _index       - индекс порта 
     * @param {STATE} _state        - статус из коллекции this.STATES.IO_PORT_STATE
     */
    SetLowIOPort_post ( _index, _state ) {
        if (Object.values(ClassStatesController.STATES.IO_PORT_STATE).includes(_state)) {
            this.#_Sections.Postomat.IO.Low.Ports[_index] = _state;
        }
    }

    /**
     * @method
     * @description Устанавливает статус указанного порта контроллера верхнего плеча постоматной секции
     * @param {Number} _index       - индекс порта 
     * @param {STATE} _state        - статус из коллекции this.STATES.IO_PORT_STATE
     */
    SetHighIOPort_post ( _index, _state ) {
        if (Object.values(ClassStatesController.STATES.IO_PORT_STATE).includes(_state)) {
            this.#_Sections.Postomat.IO.High.Ports[_index] = _state;
        }
    }

    /**
     * @method
     * @description Устанавливает статус указанного порта контроллера нижнего плеча спиральной секции
     * @param {Number} _index       - индекс порта 
     * @param {STATE} _state        - статус из коллекции this.STATES.IO_PORT_STATE
     */
    SetLowIOPort_spiral ( _index, _state ) {
        if (Object.values(ClassStatesController.STATES.IO_PORT_STATE).includes(_state)) {
            this.#_Sections.Spiral.IO.Low.Ports[_index] = _state;
        }
    }

    /**
     * @method
     * @description Устанавливает статус указанного порта контроллера верхнего плеча спиральной секции
     * @param {Number} _index       - индекс порта 
     * @param {STATE} _state        - статус из коллекции this.STATES.IO_PORT_STATE
     */
    SetHighIOPort_spiral ( _index, _state ) {
        if (Object.values(ClassStatesController.STATES.IO_PORT_STATE).includes(_state)) {
            this.#_Sections.Spiral.IO.High.Ports[_index] = _state;
        }
    }

    /**
     * @method
     * @description Возвращает текущиий статус контроллера нижнего плеча постоматной секции
     * @returns {STATE} _state      - статус из коллекции this.STATES.IO
     */
    GetLowIOState_post () {
        return this.#_Sections.Postomat.IO.Low.State;
    }

    /**
     * @method
     * @description Возвращает текущиий статус контроллера верхнего плеча постоматной секции
     * @returns {STATE} _state      - статус из коллекции this.STATES.IO
     */
    GetHighIOState_post () {
        return this.#_Sections.Postomat.IO.High.State;
    }

    /**
     * @method
     * @description Возвращает текущиий статус контроллера нижнего плеча спиральной секции
     * @returns {STATE} _state      - статус из коллекции this.STATES.IO
     */
    GetLowIOState_spiral () {
        return this.#_Sections.Spiral.IO.Low.State;
    }

    /**
     * @method
     * @description Возвращает текущиий статус контроллера верхнего плеча спиральной секции
     * @returns {STATE} _state      - статус из коллекции this.STATES.IO
     */
    GetHighIOState_spiral () {
        return this.#_Sections.Spiral.IO.High.State;
    }

    /**
     * @method
     * @description Возвращает текущиий статус указанного порта контроллера нижнего плеча постоматной секции
     * @param {Number} _index       - индекс порта 
     * @returns {STATE} _state      - статус из коллекции this.STATES.IO_PORT_STATES
     */
    GetLowIOPortState_post ( _index ) {
        return this.#_Sections.Postomat.IO.Low.Ports[_index];
    }

    /**
     * @method
     * @description Возвращает текущиий статус указанного порта контроллера верхнего плеча постоматной секции
     * @param {Number} _index       - индекс порта 
     * @returns {STATE} _state      - статус из коллекции this.STATES.IO_PORT_STATES
     */
    GetHighIOPortState_post ( _index ) {
        return this.#_Sections.Postomat.IO.High.Ports[_index];
    }

    /**
     * @method
     * @description Возвращает текущиий статус указанного порта контроллера нижнего плеча спиральной секции
     * @param {Number} _index       - индекс порта 
     * @returns {STATE} _state      - статус из коллекции this.STATES.IO_PORT_STATES
     */
    GetLowIOPortState_spiral ( _index ) {
        return this.#_Sections.Spiral.IO.Low.Ports[_index];
    }

    /**
     * @method
     * @description Возвращает текущиий статус указанного порта контроллера верхнего плеча спиральной секции
     * @param {Number} _index       - индекс порта 
     * @returns {STATE} _state      - статус из коллекции this.STATES.IO_PORT_STATES
     */
    GetHighIOPortState_spiral ( _index ) {
        return this.#_Sections.Spiral.IO.High.Ports[_index];
    }

    /**
     * @method
     * @description Устанавливает статус указанной строки постоматной секции
     * @param {Number} _index       - индекс строки 
     * @param {STATE} _state        - статус из коллекции this.STATES.ROW_COL_STATE
     */
    SetRowState_post ( _index, _state ) {
        if (Object.values(ClassStatesController.STATES.ROW_COL_STATE).includes(_state)) {
             this.#_Sections.Postomat.Row[_index] = _state;
        }
    }

    /**
     * @method
     * @description Устанавливает статус указанного столбца постоматной секции
     * @param {Number} _index       - индекс столбца 
     * @param {STATE} _state        - статус из коллекции this.STATES.ROW_COL_STATE
     */
    SetColState_post ( _index, _state ) {
        if (Object.values(ClassStatesController.STATES.ROW_COL_STATE).includes(_state)) {
             this.#_Sections.Postomat.Col[_index] = _state;
        }
    }

    /**
     * @method
     * @description Устанавливает статус указанной строки спиральной секции
     * @param {Number} _index       - индекс строки 
     * @param {STATE} _state        - статус из коллекции this.STATES.ROW_COL_STATE
     */
    SetRowState_spiral ( _index, _state ) {
        if (Object.values(ClassStatesController.STATES.ROW_COL_STATE).includes(_state)) {
             this.#_Sections.Spiral.Row[_index] = _state;
        }
    }

    /**
     * @method
     * @description Устанавливает статус указанного столбца спиральной секции
     * @param {Number} _index       - индекс столбца 
     * @param {STATE} _state        - статус из коллекции this.STATES.ROW_COL_STATE
     */
    SetColState_spiral ( _index, _state ) {
        if (Object.values(ClassStatesController.STATES.ROW_COL_STATE).includes(_state)) {
             this.#_Sections.Spiral.Col[_index] = _state;
        }
    }

    /**
     * @method
     * @description Возвращает статус указанной строки постоматной секции
     * @param {Number} _index       - индекс строки 
     * @returns {STATE} _state      - статус из коллекции this.STATES.ROW_COL_STATE
     */
    GetRowState_post ( _index ) {
        return this.#_Sections.Postomat.Row[_index];
    }

    /**
     * @method
     * @description Возвращает статус указанного столбца постоматной секции
     * @param {Number} _index       - индекс строки 
     * @returns {STATE} _state      - статус из коллекции this.STATES.ROW_COL_STATE
     */
    GetColState_post ( _index ) {
        return this.#_Sections.Postomat.Col[_index];
    }

    /**
     * @method
     * @description Возвращает статус указанной строки спиральной секции
     * @param {Number} _index       - индекс строки 
     * @returns {STATE} _state      - статус из коллекции this.STATES.ROW_COL_STATE
     */
    GetRowState_spiral ( _index ) {
        return this.#_Sections.Spiral.Row[_index];
    }

    /**
     * @method
     * @description Возвращает статус указанного столбца спиральной секции
     * @param {Number} _index       - индекс строки 
     * @returns {STATE} _state      - статус из коллекции this.STATES.ROW_COL_STATE
     */
    GetColState_spiral ( _index ) {
        return this.#_Sections.Spiral.Col[_index];
    }

    /**
     * @method
     * @description Устанавливает статус постоматной секции
     * @param {STATE} _state      - статус из коллекции this.STATES.ROW_COL_STATE
     */
    SetSectionState_post ( _state ) {
        if (Object.values(ClassStatesController.STATES.ROW_COL_STATE).includes(_state)) {
            this.#_Sections.Postomat.State = _state;
        }
    }

    /**
     * @method
     * @description Устанавливает статус спиральной секции
     * @param {STATE} _state      - статус из коллекции this.STATES.ROW_COL_STATE
     */
    SetSectionState_spiral ( _state ) {
        if (Object.values(ClassStatesController.STATES.ROW_COL_STATE).includes(_state)) {
            this.#_Sections.Spiral.State = _state;
        }
    }

    SetSectionBlocked_spiral () {
        this.#_Sections.Spiral.State = this.STATES.ROW_COL_STATE.BLOCKED;
    }

    GetSectionState_post () {
        return this.#_Sections.Postomat.State;
    }

    GetSectionState_spiral () {
        return this.#_Sections.Spiral.State;
    }

    

    SetLiftStateOK () {
        this.#_Sections.Spiral.Lift = this.STATES.SPIRAL_LIFT_STATE.OK;
    }

    SetLiftStateShortCircuit () {
        this.#_Sections.Spiral.Lift = this.STATES.SPIRAL_LIFT_STATE.LIFT_SHORT_CIRCUIT;
    }

    SetLiftStateNoPower () {
        this.#_Sections.Spiral.Lift = this.STATES.SPIRAL_LIFT_STATE.LIFT_NO_POWER;
    }

    SetLiftStateTamperError () {
        this.#_Sections.Spiral.Lift = this.STATES.SPIRAL_LIFT_STATE.LIFT_TAMPER_ERROR;
    }

    SetLiftStateLevelError () {
        this.#_Sections.Spiral.Lift = this.STATES.SPIRAL_LIFT_STATE.LIFT_LEVEL_ERROR;
    }

    GetLiftState () {
        return this.#_Sections.Spiral.Lift;
    }


    SetBusVoltageStateOK ( _BusNum ) {
        switch (_BusNum) {
            case 1:
                
                break;
        
            default:
                break;
        }
    }
}