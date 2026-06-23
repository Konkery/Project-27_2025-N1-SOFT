import { BaseSectionState } from "../../srvStatesController/js/srvBaseSectionState";
import { ISectionParams } from "../../srvStatesController/js/srvSectionStateController";
import { CELL_STATE, LIFT_STATE, LiftStateKeys } from "../../srvStatesController/js/srvStates";

export { LIFT_STATE, LiftStateKeys };

export const SPIRAL_CELL_STATE = {
    ...CELL_STATE,
    TAMPER_BAD_POS_ERROR: "TAMPER_BAD_POS_ERROR",
} as const;

export type SpiralCellStateKeys = typeof SPIRAL_CELL_STATE[keyof typeof SPIRAL_CELL_STATE];

export const DELIVERY_BOX_STATE = {
    OPENED: 'OPENED',
    CLOSED: 'CLOSED',
    ERR_MECHANICAL: 'ERR_MECHANICAL'
} as const;

export type DeliveryBoxStateKeys = typeof DELIVERY_BOX_STATE[keyof typeof DELIVERY_BOX_STATE];

export class SpiralSectionState extends BaseSectionState<SpiralCellStateKeys> {
    public Lift: LiftStateKeys;
    public DeliveryBox: DeliveryBoxStateKeys;

    constructor(config: ISectionParams) {
        super(config);
        this.Lift = LIFT_STATE.OK;
        this.DeliveryBox = DELIVERY_BOX_STATE.CLOSED;
    }

    public override Reset(): void {
        super.Reset();
        this.Lift = LIFT_STATE.OK;
        this.DeliveryBox = DELIVERY_BOX_STATE.CLOSED;
    }
}

export default SpiralSectionState;