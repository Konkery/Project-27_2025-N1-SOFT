const { EventEmitter2 } = require("eventemitter2");

class ClassScrapSection {
    constructor() {
        this._Events = new EventEmitter2();
    }
    /**
     * @param {import('../../srvProxySection/js/Messages').Order} transaction 
     * @param {object} param0 
     */
    async PerformTransaction(transaction) { 
        const { ID, Command } = transaction;
        if (Command?.toLowerCase() == 'getweight') {
            this.SendResponse({ ID, Weight: Math.round(Math.random() * 1000) });
        }
    }

    SendResponse({ ID, Weight }) {
        this._Events.emit('response',{
            Response: {
                ID: crypto.randomUUID(),
                ParentID: ID,			        // идентификатор транзакции, на которую отвечаем
                Timestamp: new Date().getTime(),
                Target: this._Target,
                Result: Weight,           
                Message: 'Операция выполнена успешно'
            }  
        });
    };
}

module.exports = ClassScrapSection;