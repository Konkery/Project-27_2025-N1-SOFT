module.exports = [
    // { ChStatus: "active", ChType: "sensor", Name: "spiral-tamper-0", ChMeas: "", SourceName: "VendingMachineSource", DeviceId: "vm-spiral-motor-tampers", ChNum: 0, DeviceHash: "2", Address: "/VendingMachine/spiral/tamper-0", ValueType: "number" },
    
    { ChStatus: "active", ChType: "actuator", Name: "matrix-ctrl", ChMeas: "", SourceName: "KC-MATRIX-CTRL", DeviceId: "vm-spiral-lift-matrix", ChNum: 0, DeviceHash: "1", Address: "/VendingMachine/spiral/matrix-ctrl", ValueType: "number", ValueConfirm: true },
    // spiral tampers
    { ChStatus: "active", ChType: "sensor", Name: "spiral-tamper-0", ChMeas: "", SourceName: "VendingMachineSource", DeviceId: "vm-spiral-motor-tampers", ChNum: 0, DeviceHash: "2", Address: "/VendingMachine/spiral/tamper-0", ValueType: "number" },
    { ChStatus: "active", ChType: "sensor", Name: "spiral-tamper-1", ChMeas: "", SourceName: "VendingMachineSource", DeviceId: "vm-spiral-motor-tampers", ChNum: 1, DeviceHash: "2", Address: "/VendingMachine/spiral/tamper-1", ValueType: "number" },
    { ChStatus: "active", ChType: "sensor", Name: "spiral-tamper-2", ChMeas: "", SourceName: "VendingMachineSource", DeviceId: "vm-spiral-motor-tampers", ChNum: 2, DeviceHash: "2", Address: "/VendingMachine/spiral/tamper-2", ValueType: "number" },
    { ChStatus: "active", ChType: "sensor", Name: "spiral-tamper-3", ChMeas: "", SourceName: "VendingMachineSource", DeviceId: "vm-spiral-motor-tampers", ChNum: 3, DeviceHash: "2", Address: "/VendingMachine/spiral/tamper-3", ValueType: "number" },
    { ChStatus: "active", ChType: "sensor", Name: "spiral-tamper-4", ChMeas: "", SourceName: "VendingMachineSource", DeviceId: "vm-spiral-motor-tampers", ChNum: 4, DeviceHash: "2", Address: "/VendingMachine/spiral/tamper-4", ValueType: "number" },
    { ChStatus: "active", ChType: "sensor", Name: "spiral-tamper-5", ChMeas: "", SourceName: "VendingMachineSource", DeviceId: "vm-spiral-motor-tampers", ChNum: 5, DeviceHash: "2", Address: "/VendingMachine/spiral/tamper-5", ValueType: "number" },
    { ChStatus: "active", ChType: "sensor", Name: "spiral-tamper-6", ChMeas: "", SourceName: "VendingMachineSource", DeviceId: "vm-spiral-motor-tampers", ChNum: 6, DeviceHash: "2", Address: "/VendingMachine/spiral/tamper-6", ValueType: "number" },
    { ChStatus: "active", ChType: "sensor", Name: "spiral-tamper-7", ChMeas: "", SourceName: "VendingMachineSource", DeviceId: "vm-spiral-motor-tampers", ChNum: 7, DeviceHash: "2", Address: "/VendingMachine/spiral/tamper-7", ValueType: "number" },
    // spiral power monitor 
    { ChStatus: "active", ChType: "sensor", Name: "spiral-current", ChMeas: "", SourceName: "VendingMachineSource", DeviceId: "vm-spiral-storage-power", ChNum: 0, DeviceHash: "3", Address: "/VendingMachine/spiral/current", ValueType: "number" },
    { ChStatus: "active", ChType: "sensor", Name: "spiral-voltage", ChMeas: "", SourceName: "VendingMachineSource", DeviceId: "vm-spiral-storage-power", ChNum: 1, DeviceHash: "3", Address: "/VendingMachine/spiral/voltage", ValueType: "number" },
    { ChStatus: "active", ChType: "sensor", Name: "spiral-short",   ChMeas: "", SourceName: "VendingMachineSource", DeviceId: "vm-spiral-short",        ChNum: 0, DeviceHash: "3",  Address: "/VendingMachine/spiral/short",   ValueType: "number" },

    // lift
    { ChStatus: "active", ChType: "actuator", Name: "lift-motor-ctrl", ChMeas: "", SourceName: "KC-HBRIDGE-CTRL",       DeviceId: "vm-spiral-lift-motor",        ChNum: 0, DeviceHash: "4", Address: "/VendingMachine/lift/motor-ctrl", ValueType: "number", ValueConfirm: true },
    { ChStatus: "active", ChType: "sensor", Name: "lift-bottom-tamper", ChMeas: "", SourceName: "VendingMachineSource", DeviceId: "vm-spiral-lift-tampers",      ChNum: 0, DeviceHash: "5", Address: "/VendingMachine/lift/bottom-tamper", ValueType: "number" },
    { ChStatus: "active", ChType: "sensor", Name: "lift-level-sensor", ChMeas: "", SourceName: "VendingMachineSource",  DeviceId: "vm-spiral-lift-level-sensor", ChNum: 0, DeviceHash: "6", Address: "/VendingMachine/lift/level-sensor",  ValueType: "number" },
    { ChStatus: "active", ChType: "sensor", Name: "lift-current",      ChMeas: "", SourceName: "VendingMachineSource",  DeviceId: "vm-spiral-lift-power",        ChNum: 0, DeviceHash: "3", Address: "/VendingMachine/lift/current",     ValueType: "number" },
    
    { ChStatus: "active", ChType: "sensor", Name: "cell-tamper",  ChMeas: "", SourceName: "VendingMachineSource",  DeviceId: "vm-cell-tamper", ChNum: 0, DeviceHash: "5", Address: "/VendingMachine/cell/tamper",  ValueType: "string" },
    { ChStatus: "active", ChType: "sensor", Name: "cell-current", ChMeas: "", SourceName: "VendingMachineSource",  DeviceId: "vm-cell-power",  ChNum: 0, DeviceHash: "3", Address: "/VendingMachine/cell/current", ValueType: "number" },
    { ChStatus: "active", ChType: "sensor", Name: "cell-short",   ChMeas: "", SourceName: "VendingMachineSource",  DeviceId: "vm-cell-short",  ChNum: 0, DeviceHash: "3", Address: "/VendingMachine/cell/short",   ValueType: "number" },

    { ChStatus: "active", ChType: "actuator", Name: "test-write", ChMeas: "", SourceName: "VendingMachineSource",  DeviceId: "test", ChNum: 0, DeviceHash: "4", Address: "/VendingMachine/test-write", ValueType: "number" },

    { ChStatus: "active", ChType: "actuator",ChAlias: "spiral-DO_1",         ChMeas: "status", SourceName: "ADAM-SPIRAL2",DeviceId: "adamspiral",ChNum: 17, DeviceHash: "e8fb-b1b0-2899-488d", Address: "", Config: {}, ValueType: "number" },
    { ChStatus: "active", ChType: "actuator",ChAlias: "spiral-DO_2",         ChMeas: "status", SourceName: "ADAM-SPIRAL2",DeviceId: "adamspiral",ChNum: 18, DeviceHash: "e8fb-b1b0-2899-488d", Address: "", Config: {}, ValueType: "number" },
    { ChStatus: "active", ChType: "actuator",ChAlias: "spiral-DO_3",         ChMeas: "status", SourceName: "ADAM-SPIRAL2",DeviceId: "adamspiral",ChNum: 19, DeviceHash: "e8fb-b1b0-2899-488d", Address: "", Config: {}, ValueType: "number" },
    { ChStatus: "active", ChType: "actuator",ChAlias: "spiral-DO_4",         ChMeas: "status", SourceName: "ADAM-SPIRAL2",DeviceId: "adamspiral",ChNum: 20, DeviceHash: "e8fb-b1b0-2899-488d", Address: "", Config: {}, ValueType: "number" },
    
    { ChStatus: "active", ChType: "sensor",  ChAlias: "spiral-DI_1",         ChMeas: "status", SourceName: "ADAM-SPIRAL2",DeviceId: "adamspiral",ChNum: 1, DeviceHash: "e8fb-b1b0-2899-488d", Address: "", Config: {}, ValueType: "number" },
    { ChStatus: "active", ChType: "sensor",  ChAlias: "spiral-DI_2",         ChMeas: "status", SourceName: "ADAM-SPIRAL2",DeviceId: "adamspiral",ChNum: 2, DeviceHash: "e8fb-b1b0-2899-488d", Address: "", Config: {}, ValueType: "number" },
    { ChStatus: "active", ChType: "sensor",  ChAlias: "spiral-DI_3",         ChMeas: "status", SourceName: "ADAM-SPIRAL2",DeviceId: "adamspiral",ChNum: 3, DeviceHash: "e8fb-b1b0-2899-488d", Address: "", Config: {}, ValueType: "number" },
    { ChStatus: "active", ChType: "sensor",  ChAlias: "spiral-DI_4",         ChMeas: "status", SourceName: "ADAM-SPIRAL2",DeviceId: "adamspiral",ChNum: 4, DeviceHash: "e8fb-b1b0-2899-488d", Address: "", Config: {}, ValueType: "number" },
   
    
    { ChStatus: "active", ChType: "actuator",ChAlias: "lift-DO_1",         ChMeas: "status", SourceName: "ADAM-SPIRAL1",DeviceId: "adamspiral",ChNum: 2, DeviceHash: "e8fb-b1b0-2899-488d", Address: "", Config: {} },
    { ChStatus: "active", ChType: "actuator",ChAlias: "lift-DO_2",         ChMeas: "status", SourceName: "ADAM-SPIRAL1",DeviceId: "adamspiral",ChNum: 3, DeviceHash: "e8fb-b1b0-2899-488d", Address: "", Config: {} },
    { ChStatus: "active", ChType: "actuator",ChAlias: "lift-DO_3",         ChMeas: "status", SourceName: "ADAM-SPIRAL1",DeviceId: "adamspiral",ChNum: 4, DeviceHash: "e8fb-b1b0-2899-488d", Address: "", Config: {} },
    { ChStatus: "active", ChType: "actuator",ChAlias: "lift-DO_4",         ChMeas: "status", SourceName: "ADAM-SPIRAL1",DeviceId: "adamspiral",ChNum: 5, DeviceHash: "e8fb-b1b0-2899-488d", Address: "", Config: {} },
]

