/**
 * @typedef {Object} TypeStateActions
 * @property {string} state
 * @property {Function} action
 */

/**
 * @typedef {Object.<string, Object.<string, TypeStateActions>>} TypeStatesGraph
 */

class ClassFSM {
    _StateGraph;
    #_PrevState;
    _State;
    #_StateChangeTimestamp;
    #_Queue = [];
    #_Running = false;
    #_Processing = false;
    
    // Храним ссылки на обработчики для корректной отписки
    #_BoundListeners = new Map();
    #_EE = null;

    constructor({ stateGraph, defaultState, onStateChanged }) {
        this._StateGraph = stateGraph;
        this._State = defaultState;
        this._DefaultState = defaultState;
        this.OnStateChanged = onStateChanged;
    }

    get PrevState() { return this.#_PrevState; }
    get State() { return this._State; }
    get StateChangeTimestamp() { return this.#_StateChangeTimestamp; }

    Run(ee, events) {
        if (this.#_Running) return true;
        
        this.#_Running = true;
        this.#_EE = ee;

        for (const eventName of events) {
            const listener = (...args) => this._HandleEvent(eventName, args);
            this.#_BoundListeners.set(eventName, listener);
            ee.on(eventName, listener);
        }

        return true;
    }

    End() {
        if (!this.#_Running || !this.#_EE) return false;

        for (const [eventName, listener] of this.#_BoundListeners.entries()) {
            this.#_EE.removeListener(eventName, listener);
        }
        
        this.#_BoundListeners.clear();
        this.#_EE = null;
        this.#_Running = false;
        
        return true;
    }

    Dispatch(eventName, ...args) {
        this._HandleEvent(eventName, args);
    }


    _HandleEvent(eventName, args) {
        const currentStateGraph = this._StateGraph[this._State];
        if (!currentStateGraph || !currentStateGraph[eventName]) return; // Игнорируем невалидные события

        const { state, action } = currentStateGraph[eventName];
        
        if (typeof state === 'string') {
            this.#ChangeState({ 
                eventName,
                state, 
                action: typeof action === 'function' ? () => action(...args) : () => {} 
            });
        }
    }

    // Убрали async/await. Смена состояния происходит строго синхронно.
    #ChangeState({ eventName, state, action }) {
        this.#_Queue.push({ eventName, state, action });
        this.#Process(); 
    }

    #Process() {
        if (this.#_Processing) return;
        this.#_Processing = true;

        while (this.#_Queue.length > 0) {
            const { eventName, state, action } = this.#_Queue.shift();
            
            this.#_PrevState = this._State;
            this._State = state;
            this.#_StateChangeTimestamp = Date.now();

            if (typeof this.OnStateChanged === 'function') {
                this.OnStateChanged({ eventName, state, prevState: this.#_PrevState });
            }

            try {
                action();
            } catch (err) {
                console.error(`[FSM] Ошибка выполнения action при переходе в ${state}:`, err);
            }
        }

        this.#_Processing = false;
    }

    Reset() {
        this._State = this._DefaultState;
        this.#_Queue = [];
        this.#_Processing = false;
    }
}

module.exports = { ClassFSM };
