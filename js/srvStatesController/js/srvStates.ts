'use strict';

export const STATE = {
    OK: 'OK',
    BLOCKED: 'BLOCKED',
    ERROR: 'ERROR',
    SERVICE: 'SERVICE'
} as const;

export default STATE;
 
export const CELL_STATE = {
    OK: 'OK',
    OPENING: 'OPENING',
    OVERLOAD_I: 'OVERLOAD_I',
    OVERLOAD_V: 'OVERLOAD_V',
    BLOCKED: 'BLOCKED',
    ERROR: 'ERROR',
    SERVICE: 'SERVICE',
    ERR_TAMPER: 'ERR_TAMPER',
    ERR_TAMPER_BAD_POS: 'ERR_TAMPER_BAD_POS',
    ACTUATOR_SHORT_CIRCUIT: 'ACTUATOR_SHORT_CIRCUIT',
    ACTUATOR_NO_POWER: 'ACTUATOR_NO_POWER',
    ERR_MECHANICAL: 'ERR_MECHANICAL',
    // Legacy support:
    OVERLOAD: 'OVERLOAD',
    TAMPER_ERROR: 'TAMPER_ERROR',
} as const;

export type CellStateKeys = typeof CELL_STATE[keyof typeof CELL_STATE];

export const LIFT_STATE = {
    OK: 'OK',
    OVERLOAD: 'OVERLOAD',
    BLOCKED: 'BLOCKED',
    SHORT_CIRCUIT: 'SHORT_CIRCUIT',
    NO_POWER: 'NO_POWER',
    ERR_TAMPER: 'ERR_TAMPER',
    ERR_LEVEL: 'ERR_LEVEL',
    ERR_MECHANICAL: 'ERR_MECHANICAL',
    // Legacy support:
    TAMPER_ERROR: 'TAMPER_ERROR',
    LEVEL_ERROR: 'LEVEL_ERROR',
} as const;

export type LiftStateKeys = typeof LIFT_STATE[keyof typeof LIFT_STATE];

export const SECTION_STATUS = {
    IDLE: 'IDLE',
    DISPENSE: 'DISPENSE',
    LOADING: 'LOADING'
} as const;

export type SectionStatusKeys = typeof SECTION_STATUS[keyof typeof SECTION_STATUS];

export const LINE_STATE = {
    OK: 'OK',
    BLOCKED: 'BLOCKED'
} as const;

export type LineStateKeys = typeof LINE_STATE[keyof typeof LINE_STATE];

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
    Voltage: MeasKeys,
    Current: MeasKeys,
    Temp: MeasKeys
}

export const GLOBAL_MACHINE_STATE = {
    OK: 'OK',
    ERROR: 'ERROR',
    SERVICE: 'SERVICE',
    DEPLOY: 'DEPLOY'
} as const;

export type GlobalMachineStateKeys = typeof GLOBAL_MACHINE_STATE[keyof typeof GLOBAL_MACHINE_STATE];

export const NET_STATE = {
    ONLINE: 'ONLINE',
    OFFLINE: 'OFFLINE',
    ERR_NO_LINK: 'ERR_NO_LINK'
} as const;

export type NetStateKeys = typeof NET_STATE[keyof typeof NET_STATE];

// --- Networking sub-states ---

export const NET_SUMMARY_STATE = {
    READY: 'READY',
    OK: 'OK',
    DEGRADED: 'DEGRADED',
    FAIL: 'FAIL',
    OFFLINE: 'OFFLINE',
    UNKNOWN: 'UNKNOWN'
} as const;
export type NetSummaryStateKeys = typeof NET_SUMMARY_STATE[keyof typeof NET_SUMMARY_STATE];

export const NET_DEVICE_STATE = {
    ONLINE: 'ONLINE',
    OFFLINE: 'OFFLINE',
    ERR_API: 'ERR_API',
    ERR_CONFIG: 'ERR_CONFIG',
    ERR_MANAGEMENT: 'ERR_MANAGEMENT',
    ERR_NO_LINK: 'ERR_NO_LINK',
    ERR_NO_IP: 'ERR_NO_IP',
    ERR_SERVICE_ACCESS: 'ERR_SERVICE_ACCESS',
    ERR_NO_POE: 'ERR_NO_POE',
    ERR_AUTH: 'ERR_AUTH',
    UNKNOWN: 'UNKNOWN'
} as const;
export type NetDeviceStateKeys = typeof NET_DEVICE_STATE[keyof typeof NET_DEVICE_STATE];

export const NET_LINK_STATE = {
    UP: 'UP',
    DOWN: 'DOWN',
    ERR_SPEED: 'ERR_SPEED',
    ERR_ERRORS: 'ERR_ERRORS',
    UNKNOWN: 'UNKNOWN'
} as const;
export type NetLinkStateKeys = typeof NET_LINK_STATE[keyof typeof NET_LINK_STATE];

export const NET_IP_STATE = {
    OK: 'OK',
    ERR_NO_IP: 'ERR_NO_IP',
    ERR_WRONG_IP: 'ERR_WRONG_IP',
    ERR_DUPLICATE_IP: 'ERR_DUPLICATE_IP',
    UNKNOWN: 'UNKNOWN'
} as const;
export type NetIpStateKeys = typeof NET_IP_STATE[keyof typeof NET_IP_STATE];

export const NET_ARP_STATE = {
    OK: 'OK',
    ERR_MAC_CHANGED: 'ERR_MAC_CHANGED',
    ERR_MAC_DUPLICATE: 'ERR_MAC_DUPLICATE',
    ERR_MISSING_ARP: 'ERR_MISSING_ARP',
    UNKNOWN: 'UNKNOWN'
} as const;
export type NetArpStateKeys = typeof NET_ARP_STATE[keyof typeof NET_ARP_STATE];

export const NET_GATEWAY_STATE = {
    OK: 'OK',
    ERR_NO_GATEWAY: 'ERR_NO_GATEWAY',
    ERR_GATEWAY_UNREACHABLE: 'ERR_GATEWAY_UNREACHABLE',
    UNKNOWN: 'UNKNOWN'
} as const;
export type NetGatewayStateKeys = typeof NET_GATEWAY_STATE[keyof typeof NET_GATEWAY_STATE];

export const NET_ROUTE_STATE = {
    OK: 'OK',
    OFFLINE: 'OFFLINE',
    DEGRADED: 'DEGRADED',
    FAIL: 'FAIL',
    NOT_REQUIRED: 'NOT_REQUIRED',
    UNKNOWN: 'UNKNOWN'
} as const;
export type NetRouteStateKeys = typeof NET_ROUTE_STATE[keyof typeof NET_ROUTE_STATE];

export const NET_QUALITY_STATE = {
    OK: 'OK',
    WARN_LATENCY: 'WARN_LATENCY',
    WARN_JITTER: 'WARN_JITTER',
    WARN_PACKET_LOSS: 'WARN_PACKET_LOSS',
    FAIL_STORM: 'FAIL_STORM',
    FAIL_MAC_FLAP: 'FAIL_MAC_FLAP',
    UNKNOWN: 'UNKNOWN'
} as const;
export type NetQualityStateKeys = typeof NET_QUALITY_STATE[keyof typeof NET_QUALITY_STATE];

export const NET_POE_STATE = {
    OK: 'OK',
    OFF: 'OFF',
    WARN_BUDGET: 'WARN_BUDGET',
    ERR_BUDGET: 'ERR_BUDGET',
    ERR_MANAGEMENT: 'ERR_MANAGEMENT',
    ERR_POWER_LOW: 'ERR_POWER_LOW',
    ERR_POWER_HIGH: 'ERR_POWER_HIGH',
    ERR_PORT: 'ERR_PORT',
    UNKNOWN: 'UNKNOWN'
} as const;
export type NetPoeStateKeys = typeof NET_POE_STATE[keyof typeof NET_POE_STATE];

export const NET_CAMERA_SERVICE_STATE = {
    OK: 'OK',
    ERR_CONNECT: 'ERR_CONNECT',
    ERR_AUTH: 'ERR_AUTH',
    ERR_TIMEOUT: 'ERR_TIMEOUT',
    ERR_NO_STREAM: 'ERR_NO_STREAM',
    UNKNOWN: 'UNKNOWN'
} as const;
export type NetCameraServiceStateKeys = typeof NET_CAMERA_SERVICE_STATE[keyof typeof NET_CAMERA_SERVICE_STATE];

export const NET_NTP_STATE = {
    OK: 'OK',
    SYNC: 'SYNC',
    UNSYNC: 'UNSYNC',
    ERR_NO_RESPONSE: 'ERR_NO_RESPONSE',
    ERR_BAD_TIME: 'ERR_BAD_TIME',
    ERR_STRATUM: 'ERR_STRATUM',
    ERR_OFFSET: 'ERR_OFFSET',
    ERR_NO_SERVER: 'ERR_NO_SERVER',
    WARN_OFFSET: 'WARN_OFFSET',
    UNKNOWN: 'UNKNOWN'
} as const;
export type NetNtpStateKeys = typeof NET_NTP_STATE[keyof typeof NET_NTP_STATE];

export const NET_DNS_STATE = {
    OK: 'OK',
    ERR_NO_RESPONSE: 'ERR_NO_RESPONSE',
    ERR_BAD_RESPONSE: 'ERR_BAD_RESPONSE',
    ERR_MISSING_RECORD: 'ERR_MISSING_RECORD',
    ERR_WRONG_RECORD: 'ERR_WRONG_RECORD',
    ERR_BAD_RESOLVER: 'ERR_BAD_RESOLVER',
    ERR_LOCAL_RESOLVE: 'ERR_LOCAL_RESOLVE',
    ERR_EXTERNAL_RESOLVE: 'ERR_EXTERNAL_RESOLVE',
    UNKNOWN: 'UNKNOWN'
} as const;
export type NetDnsStateKeys = typeof NET_DNS_STATE[keyof typeof NET_DNS_STATE];

export const NET_MQTT_STATE = {
    OK: 'OK',
    ERR_TCP: 'ERR_TCP',
    ERR_AUTH: 'ERR_AUTH',
    ERR_PUBSUB: 'ERR_PUBSUB',
    ERR_LATENCY: 'ERR_LATENCY',
    ERR_HUB_LOW: 'ERR_HUB_LOW',
    ERR_HUB_MID: 'ERR_HUB_MID',
    ERR_HUB_HI: 'ERR_HUB_HI',
    ERR_RECONNECTS: 'ERR_RECONNECTS',
    WARN_STALE: 'WARN_STALE',
    ERR_INVALID: 'ERR_INVALID',
    UNKNOWN: 'UNKNOWN'
} as const;
export type NetMqttStateKeys = typeof NET_MQTT_STATE[keyof typeof NET_MQTT_STATE];

export const NET_DB_SERVICE_STATE = {
    OK: 'OK',
    ERR_TCP: 'ERR_TCP',
    ERR_AUTH: 'ERR_AUTH',
    ERR_COMMAND: 'ERR_COMMAND',
    WARN_LATENCY: 'WARN_LATENCY',
    WARN_MEMORY: 'WARN_MEMORY',
    ERR_REPLICA: 'ERR_REPLICA',
    WARN_STORAGE: 'WARN_STORAGE',
    UNKNOWN: 'UNKNOWN'
} as const;
export type NetDbServiceStateKeys = typeof NET_DB_SERVICE_STATE[keyof typeof NET_DB_SERVICE_STATE];

export const NET_NODERED_STATE = {
    OK: 'OK',
    ERR_HTTP: 'ERR_HTTP',
    ERR_FLOWS: 'ERR_FLOWS',
    ERR_MQTT: 'ERR_MQTT',
    ERR_DEPLOY: 'ERR_DEPLOY',
    UNKNOWN: 'UNKNOWN'
} as const;
export type NetNodeRedStateKeys = typeof NET_NODERED_STATE[keyof typeof NET_NODERED_STATE];

export const NET_GRAYLOG_STATE = {
    OK: 'OK',
    ERR_HTTP: 'ERR_HTTP',
    ERR_INPUTS: 'ERR_INPUTS',
    ERR_INDEXER: 'ERR_INDEXER',
    WARN_QUEUE: 'WARN_QUEUE',
    ERR_HUB_LOW: 'ERR_HUB_LOW',
    ERR_HUB_MID: 'ERR_HUB_MID',
    ERR_HUB_HI: 'ERR_HUB_HI',
    ERR_ROUTER: 'ERR_ROUTER',
    ERR_SW_POE: 'ERR_SW_POE',
    DELAYED: 'DELAYED',
    UNKNOWN: 'UNKNOWN'
} as const;
export type NetGraylogStateKeys = typeof NET_GRAYLOG_STATE[keyof typeof NET_GRAYLOG_STATE];

export const NET_SECURITY_STATE = {
    OK: 'OK',
    DETECTED: 'DETECTED',
    WARN_OPEN_PORT: 'WARN_OPEN_PORT',
    FAIL_FORBIDDEN_SERVICE: 'FAIL_FORBIDDEN_SERVICE',
    ERR_RULE_MISSING: 'ERR_RULE_MISSING',
    ERR_RULE_DISABLED: 'ERR_RULE_DISABLED',
    ERR_POLICY: 'ERR_POLICY',
    FAIL_DEFAULT_PASSWORD: 'FAIL_DEFAULT_PASSWORD',
    WARN_EXPIRED_CERT: 'WARN_EXPIRED_CERT',
    WARN_TLS_NAME: 'WARN_TLS_NAME',
    UNKNOWN: 'UNKNOWN'
} as const;
export type NetSecurityStateKeys = typeof NET_SECURITY_STATE[keyof typeof NET_SECURITY_STATE];

export const NET_DEGRADED_STATE = {
    NONE: 'NONE',
    CAMERAS_ONLY: 'CAMERAS_ONLY',
    EXTERNAL_ONLY: 'EXTERNAL_ONLY',
    LOGGING_ONLY: 'LOGGING_ONLY',
    SINGLE_HUB: 'SINGLE_HUB',
    CORE_SERVICE: 'CORE_SERVICE',
    UNKNOWN: 'UNKNOWN'
} as const;
export type NetDegradedStateKeys = typeof NET_DEGRADED_STATE[keyof typeof NET_DEGRADED_STATE];

export const AVAILABLE = {
    YES: 'YES',
    NO: 'NO'
} as const;

export const RUNNING = {
    YES: 'YES',
    NO: 'NO'
} as const;