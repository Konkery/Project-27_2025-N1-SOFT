import { BaseSectionState, ISectionParams } from "../../srvStatesController/js/srvBaseSectionState";
import { CELL_STATE, AVAILABLE_STATE } from "../../srvStatesController/ts/IBaseSectionStates";
import {
    SPIRAL_CELL_STATE,
    LIFT_STATE,
    LIFT_ACTION,
    DELIVERY_BOX_STATUS,
    DELIVERY_BOX_ACTION,
    DELIVERY_BOX_STATE,
    LiftState,
    DeliveryBoxState,
} from "../../srvStatesController/ts/ISpiralSectionStates";

export {
    SPIRAL_CELL_STATE,
    LIFT_STATE,
    LIFT_ACTION,
    DELIVERY_BOX_STATUS,
    DELIVERY_BOX_ACTION,
    DELIVERY_BOX_STATE,
    LiftState,
    DeliveryBoxState,
};

export class SpiralSectionState extends BaseSectionState<SPIRAL_CELL_STATE | CELL_STATE> {
    public Lift: LiftState;
    public DeliveryBox: DeliveryBoxState;

    constructor(config: ISectionParams) {
        super(config);
        this.Lift = {
            Status: LIFT_STATE.OK,
            Action: LIFT_ACTION.IDLE,
            Resource: AVAILABLE_STATE.YES,
        };
        this.DeliveryBox = {
            Status: DELIVERY_BOX_STATUS.OK,
            Action: DELIVERY_BOX_ACTION.CLOSED,
            Resource: AVAILABLE_STATE.YES,
        };
    }

    public override Reset(): void {
        super.Reset();
        this.Lift = {
            Status: LIFT_STATE.OK,
            Action: LIFT_ACTION.IDLE,
            Resource: AVAILABLE_STATE.YES,
        };
        this.DeliveryBox = {
            Status: DELIVERY_BOX_STATUS.OK,
            Action: DELIVERY_BOX_ACTION.CLOSED,
            Resource: AVAILABLE_STATE.YES,
        };
    }
}

export default SpiralSectionState;
