import { BaseSectionState, ISectionParams } from "../../srvStatesController/js/srvBaseSectionState";
import { CELL_STATE } from "../../srvStatesController/js/srvStates";
// import { IEventStateUpdate } from '../../srvStatesController/js/srvSectionStateController';

export const SPIRAL_CELL_STATE = {
    ...CELL_STATE,
    TAMPER_BAD_POS_ERROR: "TAMPER_BAD_POS_ERROR",
} as const;

export type SpiralCellStateKeys = typeof SPIRAL_CELL_STATE[keyof typeof SPIRAL_CELL_STATE];

export const LIFT_STATE = {
    OK:            'OK',
    OVERLOAD:      'OVERLOAD',
    BLOCKED:       'BLOCKED',
    SHORT_CIRCUIT: 'SHORT_CIRCUIT',
    NO_POWER:      'NO_POWER',
    TAMPER_ERROR:  'TAMPER_ERROR',
    LEVEL_ERROR:   'LEVEL_ERROR'
} as const;

export type LiftStateKeys = typeof LIFT_STATE[keyof typeof LIFT_STATE];

export class SpiralSectionState extends BaseSectionState<SpiralCellStateKeys> {
    public liftState: LiftStateKeys;
    constructor(config: ISectionParams) {
        super(config);
        this.liftState = LIFT_STATE.OK;
    }
}

export default SpiralSectionState;