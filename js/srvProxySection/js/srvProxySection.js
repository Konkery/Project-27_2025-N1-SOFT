// const Queue = require("./queue");
const EventEmitter = require('eventemitter2').EventEmitter2;

/**
 * @typedef {Object<string, import('./HiLvlMessages').TypeTarget>} TypeProxySectionConfig
 */

class ClassProxySection /*extends EventEmitter*/ {
    /**
     * @param {[TypeProxySectionConfig]} sections 
     */
    constructor({ sections }) {
        /** @type {EventEmitter} */
        this.Events = new EventEmitter();
        this._Targets = { spiral: sections.spiral, postomat: sections.postomat };

        /*this._Targets = sections.reduce((pr, curr) => {
            pr[curr] = { name: curr, comQueue: this.#CreateComAsyncQueue() };
            return pr;
        }, {});*/
    }

    get BaseTopics() {
        return [
            { topic: 'Machine/Sections', payload: this._Targets },
            // { topic: '' }
        ];
    }

    /**
     * 
     * @param {object} param0 
     * @param {import("./HiLvlMessages").Transaction} param0.Transaction
     */
    ProcessCommand({ Transaction }) {
        const { ID, Orders, UserID, Source } = Transaction;
        return Orders
            .map(_order => ({
                section: this.GetSectionByTarget(_order.Target), 
                order: this.ProcessOrder(ID, _order)
            }))
            .filter(({ section, order }) => section && order);

        // const section = this.GetSectionByTarget(order.Target);
        // this._Targets[section]?.comQueue.addTask(ID, order);
    }

    /**
     * @param {object} param0
     * @param {string} param0.section
     * @param {import("./HiLvlMessages").Response} param0.Response 
     */
    ProcessResponse({ Response }) {
        let section = this.GetSectionByTarget(Response.Target);
        if (section)
            return { topic: 'Machine/Response', payload: Response };

        /*switch (section.toLowerCase()) {
            case 'spiral':
                return { topic: 'Machine/Spiral/Response', payload: response };
            case 'postomat':
                return { topic: 'Machine/Postomat/Response', payload: response };
            default:
                break;
        }*/
    }

    /**
     * @param {import("./HiLvlMessages").TypeTarget} tag 
     */
    GetSectionByTarget(tag) {
        return Object.keys(this._Targets).find(section => this._Targets[section].id == tag.id || this._Targets[section].name == tag.name);
        // return this._Targets[tag.name] ? tag.name : undefined;
    }

    /**
     * @method
     * @param {import("./HiLvlMessages").Order} command 
     */
    ProcessOrder(id, command) {
        // TODO: фильтр сообщений для Target
        // let ID = v4();
        if (command.Command == 'getItem') {
            return { ID: id, ...command };
        }
    }

    /**
     * 
     * @param {object} param0 
     * @returns 
     */
    ProcessHID(param0) {
        const { type, barcode, device } = param0 ?? {};
        if (!['qr', 'rfid'].includes(type.toLowerCase?.())) return;
        return { 
            topic: `Machine/${type.toUpperCase()}`,
            payload: {
                Transaction: {
                    ID: crypto.randomUUID(),					
                    Timestamp: new Date().getTime(),
                    User: {	},						
                    Source: `Lo-level - ${type.toUpperCase()}`,        
                    Target: {								
                        id: '',							 // идентификатор аппарата
                        name: 'Hi-level',				 // имя объекта назначения
                        type: 'Hi-level control',	
                        article: '12qw-5577-a7f8'			
                    },
                    Order: { barcode }	
                }
            }
        }
    }

    FilterResp(com, resp) {
        return com.ID == resp.ParentID;
    }

    RouteCommand(msg) {
        this.Events.emit('command', msg);
    }

    RouteResponse(msg) {
        this.Events.emit('response', msg);
    }

    /**
     * 
     * @param {import("./HiLvlMessages").Transaction} command 
     * @param {import("./HiLvlMessages").Response} resp 
     * @returns {import("./HiLvlMessages").Response}
     */
    CreateResponse(command, resp) {
        const ID = 0; //TODO
        // const Target = 
        const { ID: ParentID } = command;
        // ParentID
        return {
            Response: {
                ID,					 // уникальный идентификатор
                ParentID,			 // идентификатор транзакции, на которую отвечаем
                Timestamp: new Date().getTime(),  //new Date().toString().slice(0, 33)  // время выполнения транзакции
                Target: {						// аппарат, которому предоставляется данная транзакция
                    id: 'GUID',					// идентификатор аппарата
                    name: 'Machine-1-spiral',	// имя аппарата
                },
                Cell: {
                    row: 2,					 // строка
                    column: 5,				 // столбец
                    quantity: 3,				 // количество ТМЦ
                    itemID: 'GUID'
                },
                Result: 'OK',                          // Результат выполнения транзакций
                Message: 'Transaction successful'      // развернутое сообщение о проведённой транзакции
            }
        }
    }
    /*
    #CreateComAsyncQueue() {
        new Queue({
            concurrency: 1,
            wait: Infinity,
            timeout: 60 * 1000,
            process: this.ProcessOrder.bind(this),
            done: (error, task) => {
                console.log('Done:', { error, task });
            },
            success: (task) => {
                console.log('Success:', { task });
            },
            failure: (err, task) => {
                console.log('Failure:', { err, task });
            },
            drain: () => {
                console.log('Queue drain');
            },
        });
    }*/
}

module.exports = ClassProxySection;