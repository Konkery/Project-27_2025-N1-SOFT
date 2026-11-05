const { EventEmitter2 } = require('eventemitter2');
const { BOX_CONSTANTS } = require('./constants.js');
const { Lift } = require('../hardware/Lift.js');
const { SpiralSection } = require('./sections/SpiralSection.js');
const { CellSection } = require('./sections/CellSection.js');

/**
 * Единая точка входа эмулятора вендингового аппарата поверх ProxyChannelStub.
 */
class DeviceEmulator {
    /**
     * @param {object} params
     * @param {import('../../../tests/helpers/ProxyChannelStub.js').ProxyChannelStub} params.ProxyCh
     * @param {import('../../srvSpiralSection/js/srvSpiralSection.js').TypeSpiralSectionChannels} params.channels
     * @param {{ rows: number, cols: number }} [params.size={ rows: 8, cols: 12 }]
     * @param {Function} [params.log=console.log]
     */
    constructor({ ProxyCh, channels, size = { rows: 8, cols: 12 }, log = console.log }) {
        this.events = new EventEmitter2();
        this.proxy = ProxyCh;
        /** @type {import('../../srvSpiralSection/js/srvSpiralSection.js').TypeSpiralSectionChannels} */
        this.ch = channels;
        this.size = size;
        this.log = log ?? console.log;

        if (channels?.liftChannels) {
            this.lift = new Lift({
                proxy: this.proxy,
                channels: channels.liftChannels,
                events: this.events,
                log: this.log,
            });
        }

        if (channels?.storageChannels) {
            this.spiralSection = new SpiralSection({
                proxy: this.proxy,
                channels: channels.storageChannels,
                size: this.size,
                events: this.events,
                log: this.log,
            });
        }

        if (channels?.cellChannels) {
            this.cellSection = new CellSection({
                proxy: this.proxy,
                channels: channels.cellChannels,
                size: this.size,
                events: this.events,
                log: this.log,
            });
        }
    }

    /**
     * Инициализирует все подключенные подсистемы штатными показаниями датчиков в состоянии покоя.
     */
    seedDefaults() {
        this.lift?.seedDefaultHardware();
        this.spiralSection?.seedDefaultHardware();
        this.cellSection?.seedDefaultHardware();
        if (this.ch?.door) {
            this.proxy.inject(this.ch.door, BOX_CONSTANTS.DOOR_CLOSED, { emit: false });
        }
        if (this.ch?.boxChannels?.optic) {
            this.proxy.inject(this.ch.boxChannels.optic, BOX_CONSTANTS.BOX_CLOSED, { emit: false });
        }
        if (this.ch?.boxChannels?.lock) {
            this.proxy.inject(this.ch.boxChannels.lock, BOX_CONSTANTS.UNLOCK_OFF, { emit: false });
        }
    }

    getState() {
        return {
            lift: this.lift?.getState?.(),
            storage: this.spiralSection?.getState?.(),
            cell: this.cellSection?.getState?.(),
        };
    }

    cleanup() {
        this.lift?.cleanup();
        this.spiralSection?.cleanup();
        this.cellSection?.cleanup();
    }

    reset() {
        this.cleanup();
        this.cellSection?.reset();
    }
}

module.exports = { DeviceEmulator };
