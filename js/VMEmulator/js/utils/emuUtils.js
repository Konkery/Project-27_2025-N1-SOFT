const peekValueInRange = ([low, high]) =>
    Number.isFinite(high) ? Number(((low + high) / 2).toFixed(3)) : low + 1;

const getRangeAbove = ([low, high], delta = 0.05) =>
    Number.isFinite(high) ? Number((high + delta).toFixed(3)) : Number((low + delta).toFixed(3));

const getRangeBelow = ([low, high], delta = 0.05) =>
    Math.max(0, Number((low - delta).toFixed(3)));

const LOWEST_LEVEL = 0;

const EVENTS = {
    STOP: 'STOP',
    MOVE: 'MOVE',
    LEVEL: 'LEVEL',
    MOTOR_START: 'ROTATE',
    DISPENSED: 'DISPENSED',
    BOTTOM_TAMPER: 'BOTTOM',
    TOP_TAMPER: 'TOP',
    CELL_UNLOCKED: 'UNLOCKED',
};

const TARGET = {
    LIFT: 'lift',
    SPIRAL: 'spiral',
    CELL: 'cell',
};

module.exports = {
    peekValueInRange,
    getRangeAbove,
    getRangeBelow,
    LOWEST_LEVEL,
    EVENTS,
    TARGET,
};
