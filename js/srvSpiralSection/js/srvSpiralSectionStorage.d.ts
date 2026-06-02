export interface TypeSpiralSectionStorageChannels {
    matrixCtrlChannel: string;
    spiralTamperChannels: [string];
    current: string;
    voltageChannel: string;
    short: string;
    powerOff: string;
}

export interface TypeSpiralSectionStorageOpts {
    busNumber: number;
    size: {
        rows: number;
        cols: number;
    };
}

export interface TypeSpiralSectionUnitOpts {
    index: number;
    coords: TypeCoords;
    tamperInd: number;
}

export interface TypeSpiralSectionUnitEvents {
    DISPENSE_COMMAND: string;
    DISPENSED_SINGLE: string;
    COMPLETED: string;
    ROTATE_TIMEOUT: string;
    FAULT: string;
    DISPENSE_RESULT: string;
    RECOVERED: string;
    TEST_COMMAND: string;
    TEST_DONE: string;
}

export interface TypeUnit {
    index: number;
    coords: TypeCoords;
    capacity: number;
    itemsLoaded: number;
    itemsLeft: number;
    itemsRequested: number;
    itemsDispensed: number;
    status: string;
    tamperInd: number;
}

type TypeUnits = Object<string, TypeUnit>;

export interface TypeOrder {
    unitIndex: number;
    itemsRequested: number;
    itemsDispensed: number;
}

export interface TypeTask {
    res: Function;
    rej: Function;
}

export interface TypeSpiralSectionUnitContext {
    currentOrder: TypeOrder | null;
    currentTask: TypeTask;
    rows: number;
    cols: number;
    units: [TypeUnit];
    state: string;
    stateChangeTimestamp: number;
    dispenseTimer: import('./srvUtils.js').TypeTimer;
    fallbackTimer: import("./srvUtils.js").TypeTimer;
}

export interface TypeCoords {
    col: number;
    row: number;
}

export interface TypeElectrCurrentState {
    IDLE: number;
    WORK_OK: number;
    STUCK: number;
}