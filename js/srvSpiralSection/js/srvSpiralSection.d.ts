export interface TypeProxyCh {
    SetValue: Function;
    GetValue: Function;
    Value: any;
    Events: EventEmitter2;
}

export interface TypeProxyLogger {
    Log: (args: { level: string; msg: string; obj?: any }) => void;
}

export interface TypeDeliveryBoxChannels {
    lock: string;
    optic: string;
}

export interface TypeSpiralSectionChannels {
    storageChannels: import('./srvSpiralSectionStorage.d.ts').TypeSpiralSectionStorageChannels;
    liftChannels: import('./srvSpiralSectionLift.d.ts').TypeSpiralSectionLiftChannels;
    boxChannels: TypeDeliveryBoxChannels;
    door: string;
}

export interface TypeSpiralSectionOpts {
    storageOpts: import('./srvSpiralSectionStorage.d.ts').TypeSpiralSectionStorageOpts;
    liftOpts: import('./srvSpiralSectionLift.d.ts').TypeSpiralSectionLiftOpts;
}

export interface TypeSpiralSectionEvents {
    DISPENSE_START: string;
    OPERATION_FINISHED: string;
    UNLOADING_DONE: string;
    DISPENSE_START_MOCK: string;
    INTERRUPT: string;
}

export interface TypeOrder {
    row: number;
    column: number;
    quantity: number;
}