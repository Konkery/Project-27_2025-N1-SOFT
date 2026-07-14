const { randomUUID } = require('node:crypto');
const { default: StatesController } = require('../../srvStatesController/js/srvSectionStateController');
const { GLOBAL_MACHINE_STATE, /*BUS_MEAS_STATE,*/ AVAILABLE, SECTION_STATUS } = require('../../srvStatesController/js/srvStates');

const EventEmitter = require('eventemitter2').EventEmitter2;

const COMMANDS = {
    GetItem: 'GetItem', //– запрос на выдачу ТМЦ из указанных ячеек;
    GetAll: 'GetAll', // – выдача ТМЦ, открытие всех ячеек (массив Cells в данном случае не учитывается);
    SetItem: 'SetItem', // – загрузка ТМЦ в указанные ячейки;
    SetAll: 'SetAll', // – загрузка ТМЦ во все ячейки по загруженной конфигурации;
    GetStatus: 'GetStatus',// – получение статуса аппарата;
    Reboot: 'Reboot', //– перезагрузка аппарата;
    SetConfig: 'SetConfig', ///– загрузка конфигурационного файла;
    Maintenance: 'Maintenance', //– перевод аппарата в режим обслуживания
}
class ClassProxySection {
    /**
     * 
     * @param {object} param0 
     * @param {[import('./Messages').TypeTarget]} param0.sections 
     * @param {StatesController} param0.StateController
     */
    constructor({ sections, StateController }) {
        /** @type {EventEmitter} */
        this.Events = new EventEmitter();
        this._Sections = sections;
        this._StateController = StateController;
    }
    /**
     * @returns {Array<{ topic: string, payload: any }>}
     */
    get BaseTopics() {
        return [
            { topic: 'Machine/Sections', payload: this._Sections },
        ];
    }

    /**
     * 
     * @param {object} param0 
     * @param {import("./Messages").Transaction} param0.Transaction
     * @returns {[{ section: import('./Messages').TypeTarget, order: import('./Messages').Order }]}
     */
    ProcessTransaction({ Transaction }) {
        if (!this.GlobalStateAllowsCommand()) return;
        const { ID, Orders, UserID, Source } = Transaction;
        
        // for (const _order of Orders) {
        return Orders.map(_order => {
            // const section = this.GetSectionByTarget(_order.Target);
            const sectionState = this._StateController.Machine.States.Sections[_order.Target.name];
            if (!sectionState) return;
            // const sectionState = this._StateController.Machine.States.Sections[section.name];
            if (sectionState.Status != SECTION_STATUS.IDLE) return;
            if (sectionState.IsAvailable != AVAILABLE.YES) return;
            const order = this.ProcessOrder(ID, _order);
            return { section: sectionState.Name ?? _order.Target.name, order };
            // this.RouteCommand(order);
        }).filter(Boolean);
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
    }
    
    /**
     * @param {import("./Messages").TypeTarget} tag 
     * @returns {import("./Messages").TypeTarget | undefined}
     */
    GetSectionByTarget(tag) {
        return this._Sections.find(section => section.id === tag.id || section.name === tag.name);
    }

    /**
     * @method
     * @param {import("./Messages").Order} order 
     */
    ProcessOrder(id, order) {
        // TODO: фильтр сообщений для Target
        // let ID = v4();
        if (order?.Command?.toLowerCase() == COMMANDS.GetItem.toLowerCase()) {
            // if (!this.IsGetItemOrderValid(order)) return;
            return { ID: id, ...order };
        }
    }
    
    /**
     * @method
     * @param {import("./Messages").Order} order 
     */
    IsGetItemOrderValid(order) {
        if (order.Cells.length == 0) return false;
        const section = this._StateController.Machine.States.Sections[order.Target.name];
        if (!section) return false;
        // const sectionState = this._StateController.sections.get(section.name);
        const hasFaultCells = order.Cells.some(cell => !sectionState.isCellAvailable(cell));
        return hasFaultCells;
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
     * @param {import("./Messages").Transaction} command 
     * @param {import('./Messages').TypeTarget} Target 
     * @param {import('./Messages').Cell} Cell 
     * @returns {import("./Messages").Response}
     */
    CreateResponse(command, Target, Cell) {
        const ID = randomUUID();
        // command.Orders.
        const { ID: ParentID } = command;
        // ParentID
        return {
            Response: {
                ID,					 // уникальный идентификатор
                ParentID,			 // идентификатор транзакции, на которую отвечаем
                Timestamp: new Date().getTime(),  //new Date().toString().slice(0, 33)  // время выполнения транзакции
                Target: Target,
                Cell,
                Result: 'OK',                     
                Message: 'Transaction successful'     
            }
        }
    }

    GlobalStateAllowsCommand() {
        const { Mode, Env } = this._StateController.Machine.States;
        return Mode == GLOBAL_MACHINE_STATE.OK;
            // && [...Env.values()].some(sensor => sensor.critical && sensor.state != MEAS_STATE.OK);
            
    }
}

module.exports = ClassProxySection;