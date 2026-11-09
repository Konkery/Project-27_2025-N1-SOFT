const { DeviceEmulator } = require('./js/DeviceEmulator.js');
const { Lift } = require('./hardware/Lift.js');
const { Matrix } = require('./hardware/Matrix.js');
const { SpiralSection } = require('./js/sections/SpiralSection.js');
const { CellSection } = require('./js/sections/CellSection.js');
const { BitMask } = require('./js/utils/BitMask.js');
const {
    peekValueInRange,
    getRangeAbove,
    getRangeBelow,
    LOWEST_LEVEL,
    EVENTS,
    TARGET,
} = require('./js/utils/emuUtils.js');
const {
    LIFT_CONSTANTS,
    STORAGE_CONSTANSTS,
    COMMON_CONSTANTS,
    FAULTS,
    CELL_CONSTANTS,
    CELL_FAULTS,
    BOX_CONSTANTS,
} = require('./js/constants.js');

module.exports = {
    // Фасад
    DeviceEmulator,

    // Hardware
    Lift,
    Matrix,

    // Sections
    SpiralSection,
    CellSection,

    // Utils
    BitMask,
    peekValueInRange,
    getRangeAbove,
    getRangeBelow,
    LOWEST_LEVEL,
    EVENTS,
    TARGET,

    // Константы
    FAULTS,
    LIFT_CONSTANTS,
    STORAGE_CONSTANSTS,
    COMMON_CONSTANTS,
    CELL_CONSTANTS,
    CELL_FAULTS,
    BOX_CONSTANTS,
};
