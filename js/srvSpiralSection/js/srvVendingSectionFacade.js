const { EventEmitter2 } = require("eventemitter2");
const { ClassFault } = require('./srvUtils');
const { FAULT_DESC_RU, FAULTS } = require('./SpiralSectionConstants');
const { default: BaseSectionState } = require("../../srvStatesController/js/srvBaseSectionState");
const { ClassSpiralSection } = require("./srvSpiralSection");

let sleep = require('timers/promises').setTimeout;

class ClassVendingSectionFacade {

    _Context = { 
        order: null,
        currentTask: null
    };

    /**@type {EventEmitter2} */
    #_Events = new EventEmitter2();
    /** @type {import('../../srvProxySection/js/Messages').TypeTarget} */
    _Target = null;
    /** @type {BaseSectionState} */
    #_SectionState = null;
    /** @type {ClassSpiralSection} */
    #_Section = null;

    /**
     * 
     * @param {object} param0
     * @param {TypeProxyCh} param0.ProxyCh
     * @param {TypeSpiralSectionChannels} param0.channels
     * @param {TypeSpiralSectionOpts} param0.advOpts
     * @param {TypeTransactionTarget} param0.target
     * @param {BaseSectionState} param0.sectionState
     */
    constructor({ section, target, sectionState }) {
        this._Target = target;
        this.#_Section = section; //new ClassSpiralSection({ ProxyCh, channels, advOpts, SectionState });
        this.#_SectionState = sectionState;
        this.Init();
    }

    get Target() { return this._Target; }

    get Events() {
        // TODO: return proxy
        return this.#_Events;
    }

    /**
     * @param {TypeTransaction} transaction 
     * @param {object} param0 
     */
    async PerformTransaction(transaction, param0) {
        const { mock } = param0 ?? {}; 
        const { ID, Cells } = transaction;
        if (this._Context.order) 
            return this.HandleErr(new Error('Выполняется предыдущая операция'));
        
        this._Context.order = { ID, Cells };
        return (mock ? this._ExecuteMock(Cells) : this.#_Section.Execute(Cells)).finally(() => {
            this._Context.order = null;
        });
    }

    /**
     * 
     * @param {import('../../srvProxySection/js/Messages').Cell} cell 
     * @param {boolean} error 
     * @returns 
     */
    OnResult(cell, errorMessage='') {
        const { ID } = this._Context?.order ?? {};
        if (ID) {
            this.SendResponse({
                Response: {
                    ID: crypto.randomUUID(),
                    ParentID: ID,			        // идентификатор транзакции, на которую отвечаем
                    Timestamp: new Date().getTime(),
                    Target: this._Target,
                    Cell: cell,
                    Result: errorMessage ? 'FAIL' : 'OK',           
                    Message: errorMessage ? errorMessage : 'Операция выполнена успешно'
                }  
            });
        };
    }

    SendResponse(msg) {
        this.#_Events.emit('response', msg);
    }

    Reset() {
        this._Context.currentTask?.rej?.(new Error('Reset'));
        this._Context.currentTask = null;
        this._Context.order = null;
    }

    HandleErr(e, prefixMsg) {
        let errMsg = (e instanceof Error) ?
            `${prefixMsg}: ${e.message}.`
            : (e instanceof ClassFault) ?
            `${prefixMsg}: ${FAULT_DESC_RU[e.code]}.`
            :`${prefixMsg}: ошибка не определена.`;
        console.log(`[SPIRAL] Error ${errMsg}`);
        this.OnResult(null, errMsg);
    }

    HandleFail(cell, fault) {
        const prefixMsg = 'Ошибка при выдаче ТМЦ';
        let errMsg = (fault instanceof ClassFault) ?
            `${prefixMsg}: ${FAULT_DESC_RU[fault.code]}.`
          : `${prefixMsg}: ошибка не определена.`;
        console.log(`[SPIRAL] Fail ${errMsg}`);
        this.OnResult(cell, errMsg);
    }

    HandleDispense(cell) {
        return this.OnResult(cell);
    }


    /**
     * @description
     * Выполняет имитацию выдачи:
     * @param {[import('../../srvProxySection/js/Messages').Cell]} _cells 
     */
    async _ExecuteMock(_cells) {
        try {
            /** @type {[TypeTransactionCell]} */
            const orders = [..._cells];
            for (const order of orders) {
                for (let i = 0; i < order.quantity; i++) {
                    console.log(`[MOCK] Dispense row=${order.row}, column=${order.column}, item=${i + 1}/${order.quantity}`);
                    // имитация успешной выдачи
                    this.OnResult({...order, quantity: 1 }, '');

                    await sleep(1000);
                }
            }

        } catch (e) {
            this.HandleErr(e, 'Ошибка выполнении MOCK транзакции');
        }
    }
}


module.exports = { ClassVendingSectionFacade };