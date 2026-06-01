'use strict';

export const STATE = {
    OK: 'OK',
    BLOCKED: 'BLOCKED',
    ERROR: 'ERROR',
    SERVICE: 'SERVICE'
} as const;

export default STATE;

export const CELL_STATE = {
    ...STATE,

    OVERLOAD: 'OVERLOAD',

    TAMPER_ERROR: 'TAMPER_ERROR',

    ACTUATOR_SHORT_CIRCUIT: 'ACTUATOR_SHORT_CIRCUIT',
    ACTUATOR_NO_POWER: 'ACTUATOR_NO_POWER'
} as const;

export type CellStateKeys = typeof CELL_STATE[keyof typeof CELL_STATE];

export const IO_STATE = {
    OK: 'OK',
    ERR_NO_LINK: 'ERR_NO_LINK'
} as const;

export const IO_PORT_STATE = {
    OK: 'OK',
    ERROR: 'ERROR'
} as const;

export type IoPortStateKeys = typeof IO_PORT_STATE[keyof typeof IO_PORT_STATE]

export const MEAS_STATE = {
    OK: 'OK',
    ERR_HIGH: 'ERR_HIGH',
    ERR_LOW: 'ERR_LOW'
} as const;

export type MeasKeys = typeof MEAS_STATE[keyof typeof MEAS_STATE];

export type BUS_STATE = {
    voltage: MeasKeys,
    current: MeasKeys,
    temp: MeasKeys
}

export const GLOBAL_MACHINE_STATE = {
    OK: 'OK',
    SERVICE: 'SERVICE',
    DEPLOY: 'DEPLOY'
} as const;

export const NET_STATE = {
    ONLINE: 'ONLINE',
    OFFLINE: 'OFFLINE',
    ERR_NO_LINK: 'ERR_NO_LINK'
} as const;

export type NetStateKeys = typeof NET_STATE[keyof typeof NET_STATE];

export const AVAILABLE = {
    YES: 'YES',
    NO: 'NO'
} as const;