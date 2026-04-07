module.exports = [
    //{ ID: 4, Status: "active", Name: "PLC31", Type: "source", Property: "rw", Protocol: "lhp", DN: "", IP: "192.168.50.161", Port: "8080", SensorChExpected: 64 },
    //{ ID: 6, Status: "active", Name: "hubc445", Type: "source", Property: "r", Protocol: "rpi", DN: "", IP: "192.168.50.233", Port: "7777", SensorChExpected: 64 },
    // { ID: 7, Status: "active", Name: "Broker01", Type: "source", Property: "w", Protocol: "mqttgw", DN: "", IP: "localhost", Port: "9001", Login: 'operator2', Password: '34pass', SensorChExpected: 64 },
    //{ ID: 8, Status: "active", Name: "Broker01", Type: "source", Property: "rw", Protocol: "mqtt", DN: "", IP: "localhost", Port: "1883", Login: 'operator2', Password: '34pass', SensorChExpected: 64 },
    //{ ID: 9, Status: "active", Name: "ADAM-6217", Type: "source", Property: "rw", Protocol: "modbus", DN: "", IP: "10.110.91.2", Port: "502", SensorChExpected: 5, Groups: [{type: 'holdReg', startReg: 2, numRegs: 3, interval: 1000}, {type: 'holdReg', startReg: 5, numRegs: 2, interval: 3000}] },
    //{ ID: 10,Status: "active", Name: "ADAM-6256", Type: "source", Property: "rw", Protocol: "modbus", DN: "", IP: "10.110.91.1", Port: "502", SensorChExpected: 4, Groups: [{type: 'Coil', startReg: 21, numRegs: 4}] },
    { ID: 12, Status: "active", Name: "VendingMachineSource", Type: "source", Property: "rw", Protocol: "mqtt", DN: "", IP: "localhost", Port: "1883", Login: 'operator3', Password: 'pwd567', SensorChExpected: 64 },
    // { ID: 11, Status: "active", Name: "HighLevelSource",      Type: "source", Property: "rw", Protocol: "mqtt", DN: "", IP: "localhost", Port: "1883", Login: 'operator3', Password: 'pwd567', SensorChExpected: 64 },
    {
        ID: 20,
        Status: "active",
        Name: "KC-MATRIX-CTRL",
        Type: "source",
        Property: "rw",
        Protocol: "mmtrxmotor",
        DN: "",
        IP: "10.110.81.101",
        Port: "10001",
        SensorChExpected: 1,
        Groups: [{ mbID: 128 }, { mbID: 129 }],
        AdvOpts: {
            sourceAxis: "row",
            row: { source: 128, channels: [0, 1, 2, 3, 4, 5, 6, 7] },
            col: { source: 129, channels: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] }
        }
    },
    {
        ID: 21,
        Status: "active",
        Name: "KC-HBRIDGE-CTRL",
        Type: "source",
        Property: "rw",
        DN: "",
        IP: "10.110.81.101",
        Port: "10001",
        SensorChExpected: 1,
        Protocol: "mhbridge",
        Groups: [
            { mbID: 128 }
        ],
        AdvOpts: {
            source: 130,

            keys: {
                s1: 8,
                s3: 9,
                s2: 10,
                s4: 11
            },
            // safeSwitchDelay: 10   // мс задержка между шагами
        }
    },
    { ID: 30, Status: "active", Name: "ADAM-SPIRAL2", Type: "source", Property: "rw", Protocol: "modbustcp", DN: "", IP: "10.130.1.102", Port: "502", SensorChExpected: 8, Groups: [{ mbID: 1, type: 'Coil', beh: 'Sensor', startReg: 2, numRegs: 4, interval: 1000 }, { mbID: 1, type: 'Coil', beh: 'Actuator', startReg: 17, numRegs: 4 }] },
    { ID: 31, Status: "active", Name: "ADAM-SPIRAL1", Type: "source", Property: "rw", Protocol: "modbustcp", DN: "", IP: "10.130.1.101", Port: "502", SensorChExpected: 8, Groups: [{ mbID: 2, type: 'Coil', beh: 'Actuator', startReg: 18, numRegs: 4 }] },
];