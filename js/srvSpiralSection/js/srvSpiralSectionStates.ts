import { BaseSectionState, ISectionParams } from "../../srvStatesController/js/srvBaseSectionState";
import { CELL_STATE } from "../../srvStatesController/ts/IBaseSectionStates";
import {
    SPIRAL_CELL_STATE,
    LIFT_STATE,
    DELIVERY_BOX_STATE,
} from "../../srvStatesController/ts/ISpiralSectionStates";

export {
    SPIRAL_CELL_STATE,
    LIFT_STATE,
    DELIVERY_BOX_STATE,
};

export class SpiralSectionState extends BaseSectionState<SPIRAL_CELL_STATE | CELL_STATE> {
    public Lift: LIFT_STATE;
    public DeliveryBox: DELIVERY_BOX_STATE;

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