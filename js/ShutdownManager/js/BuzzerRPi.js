const { setTimeout } = require('timers/promises');

const ON = 0;
const OFF = 1;

class ClassBuzzerRPi {
    /**@type {import('../../../../HorizonServer/js/srvProxyChannel/js/srvProxyChannel')} */
    #_ProxyChannel = null;
    #_ProxyLogger = null;
    constructor({ channel, ProxyChannel, ProxyLogger }) {
        this.channel = channel;
        this.#_ProxyChannel = ProxyChannel;
        this.#_ProxyLogger = ProxyLogger;
        this.isDestroyed = false;

        this.#_ProxyChannel.SetValue(this.channel, OFF);
    }

    /**
     * Базовый метод для генерации одиночного сигнала заданной длительности
     * @param {number} durationMs - длительность звука в миллисекундах
     */
    async _beep(durationMs) {
        if (this.isDestroyed) return;

        this.#_ProxyChannel.SetValue(this.channel, ON);
        await setTimeout(durationMs);

        if (!this.isDestroyed) 
            this.#_ProxyChannel.SetValue(this.channel, OFF);
    }

    /**
     * Звуковая индикация при старте
     * Паттерн: два коротких быстрых сигнала
     */
    async IndicateStartup() {
        await this._beep(100);
        await setTimeout(100);
        await this._beep(100);
    }

    /**
     * Звуковая индикация в начале выключения
     * Паттерн: три сигнала средней длины, предупреждающие о начале процесса
     */
    async IndicateShutdownStart() {
        for (let i = 0; i < 3; i++) {
            await this._beep(300);
            await setTimeout(200);
        }
    }

    /**
     * Звуковая индикация перед самым выключением
     * Паттерн: один непрерывный длинный сигнал
     */
    async IndicateShutdownFinal() {
        await this._beep(1000);
        this.Destroy(); // Автоматически освобождаем ресурс после финального сигнала
    }

    /**
     * Корректное освобождение GPIO
     */
    Destroy() {
        if (!this.isDestroyed) {
            this.#_ProxyChannel.SetValue(this.channel, OFF);
            this.isDestroyed = true;
        }
    }
}

module.exports = ClassBuzzerRPi;