const { default: EventEmitter2 } = require("eventemitter2");
const assert = require('assert');
/**
 * @typedef {Object} TypeStateActions
 * @property {string} state
 * @property {Function} action
 */

/**
 * @typedef {Object.<string, TypeStateActions?} TypeStatesGraph
 */

/**
 * @class
 * @description Реализует конечный автомат
 */
class ClassFSM {
    /** @type {TypeStatesGraph}*/
    _StateGraph;
    /** @type {string} */
    #_PrevState;
    /** @type {string} */
    _State;
    /** @type {number} */
    #_StateChangeTimestamp;
    /** @type {[TypeStateActions]} */
    #_Queue = [];
    #_Running = false;
    #_Processing = false;

    /**
     * @constructor
     * @param {object} param0
     * @param {TypeStatesGraph} param0.stateGraph
     */
    constructor({ stateGraph, defaultState, onStateChanged }) {
        this._StateGraph = stateGraph;
        this._State = defaultState;
        this._DefaultState = defaultState;
        this.OnStateChanged = onStateChanged;
    }

    /**
     * @getter
     * @returns {string}
     */
    get PrevState() {
        return this.#_PrevState;
    }

    /**
     * @getter
     * @returns {string} 
     */
    get State() {
        return this._State;
    }
    /**
     * @getter
     * @returns {number}
     */
    get StateChangeTimestamp() {
        return this.#_StateChangeTimestamp;
    }

    /**
     * @method
     * @param {EventEmitter2} ee 
     * @param {[string]} events 
     */
    Run(ee, events) {
        if (this.#_Running) return true;

        const self = this;
        const onEvent = function (...args) {
            const { event } = this;
            assert.strictEqual(typeof event, 'string');
            let graph = {...self._StateGraph}
            let st = self.State
            if (!(self._StateGraph[self.State][event])) return; // nothing happens

            const { state, action } = self._StateGraph[self.State][event];
            const actionBind = () => action(...args);
            if (typeof state == 'string' && typeof action == 'function')
                self.#ChangeState({ state, action: actionBind });
        };

        for (const event of events) {
            ee.on(event, onEvent);
        }

        this.End = () => {
            const defaultEnd = this.End;
            for (const event of events) {
                ee.removeListener(event, onEvent);
            }
            this.End = defaultEnd;
            return true;
        }

        return true;
    }

    End() {
        return false;
    }
    /**
     * 
     * @param {TypeStateActions}} param0 
     * @param {[any]} argsArr 
     */
    async #ChangeState({ state, action }) {
        this.#_Queue.push({ state, action });
        await this.#Process();
    }

    async #Process() {
        if (this.#_Processing) return;
        this.#_Processing = true;

        while (this.#_Queue.length) {
            const { state, action } = this.#_Queue.shift();
            this.#_PrevState = this._State;
            this._State = state;
            this.#_StateChangeTimestamp = new Date().getTime();
            action();
            if (typeof this.OnStateChanged == 'function')
                this.OnStateChanged({ state, prevState: this.PrevState });

            // TODO: maybe need to handle async funcs in specific way
            // action?.constructor?.name == 'Function' ? action()
            //     : action?.constructor?.name == 'AsyncFunction' ? await action() : undefined;
        }

        this.#_Processing = false;
    }
    
    СreateStateChangeChecker() {
        let { State: savedState, StateChangeTimestamp: savedTime } = this;
        return () => {
            return this.State == savedState || this.StateChangeTimestamp != savedTime;
        }
    }

    OnStateChanged() {

    }

    Reset() {
        this._State = this._DefaultState;
    }
}

module.exports = { ClassFSM };