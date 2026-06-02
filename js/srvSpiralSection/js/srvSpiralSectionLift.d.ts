export interface TypeSpiralSectionLiftChannels {
    liftMotorCtrl: string;
    liftBottomTamper: [string];
    liftTopTamper: [string];
    liftLevelSensor: string;
    current: string;
    short: string;
}

export interface TypeSpiralSectionLiftOpts {
    maxLevel: number;
    busNumber: number;
}

export interface TypeSpiralSectionLiftEvents {
    IDLE: string;
    ELEVATE_TO_BASE_COMMAND: string;
    ELEVATE_TO_BOTTOM_COMMAND: string;
    BOTTOM_LEVEL_REACHED: string;
    COLLECT_LEVEL_REACHED: string;
    BASE_LEVEL_REACHED: string;
    ELEVATE_COMMAND: string;
    ELEVATE_TIMEOUT: string;
    FAULT: string;
}

export interface TypeTask {
    res: Function;
    rej: Function;
}

export interface TypeSpiralSectionLiftContext {
    currentLevel: number | undefined;
    requiredLevel: number | undefined;
    currentTask: TypeTask;
    timer: import("./srvUtils").TypeTimer;
    fallbackTimer: import("./srvUtils").TypeTimer;
}
