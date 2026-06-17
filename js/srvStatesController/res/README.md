<div style="font-family: 'Open Sans', sans-serif; font-size: 16px">

# srvSectionStateController

<div style="color: #555">
<p align="center">
<!-- <img src="./res/logo.png" width="400" title="hover text"> -->
</p>
</div>

## Лицензия
////

### Описание
Модуль реализует функционал центрального контроллера состояний аппарата (`StatesController`). Служба предназначена для инициализации, хранения и реактивного управления единым деревом состояния (`IRootState`) и конфигурации (`IConfig`) всего аппарата. 

Модуль использует паттерн Deep Proxy для автоматического отслеживания изменений любых публичных полей (массивов, объектов, примитивов) и трансляции этих изменений внешним подписчикам (например, через MQTT) с помощью внедренных портов (`IPortService`). Обеспечивает строгую типизацию секций (через Generics) и двунаправленную синхронизацию состояния (Broker -> State -> Broker).

**Связанные модули:**
- [srvBaseSectionState](./README_BASE_SECTION_STATE.md) — Базовый класс состояния отдельной секции аппарата.
- [srvSectionStateController (JS)](./README_SECTION_STATE_CONTROLLER_JS.md) — Документация для старой (JavaScript) версии контроллера состояний.
- [srvReactiveProxy](./README_REACTIVE_PROXY.md) — Утилита глубокого проксирования.
- [srvStates](./README_STATES.md) — Справочник констант всех возможных состояний системы.

### Подписки (Внутренние события EventEmitter)
Служба наследуется от `EventEmitter2` и подписывается на собственные события, генерируемые `srvReactiveProxy` при мутации состояния.
- `update` — генерируется при изменении любого поля в реактивном дереве `Machine.States`.
```js
// Структура события update
{
    path: string[], // Путь к измененному свойству, например: ['Global', 'Mode']
    topic?: string, // Склеенный топик
    state: any,     // Новое значение
    init?: boolean  // Флаг первичной инициализации дерева
}
```

### Внешнее взаимодействие (через IPortService)
Контроллер взаимодействует с внешним миром через массив внедренных `portServices` (например, `MqttPortService`):
- `service.Pub(topic, state)` — отправка измененного состояния в брокер.
- `service.Sub(rootTopic + '/#')` — подписка на все входящие изменения.
- `service.on('message', ...)` — обработка входящих изменений для применения к локальному дереву через `ApplyExternalState`.

### Поля
<div style="color: #555">

- `Machine: IRootState<TSections>` — Публичное, реактивное дерево состояния аппарата. Включает в себя динамические `States` (Global, Sections) и статическую конфигурацию `Config`.
- `portServices: IPortService[]` — Массив сервисов для двунаправленной синхронизации.
- `_isApplyingExternal: boolean` — Внутренний флаг защиты от эхо-циклов (предотвращает ре-публикацию состояний, пришедших извне).
- `rootTopic: string` — Корневой префикс для топиков (по умолчанию `'Machine/'`).

</div>

### Конструктор
<div style="color: #555">

Инициализируется объектом `IConstructorParams` и объектом `IConfig`.

```typescript
constructor(opts: IConstructorParams<TSections>, config: IConfig)
```

**Параметры `opts`:**
- `busCount: number` — Количество электрических шин аппарата.
- `sections: TSections` — Массив экземпляров классов секций, унаследованных от `BaseSectionState` (Dependency Injection).
- `global: IGlobalStateParams` — Конфигурация глобальных параметров (массивы имен датчиков окружения и уровней сетевых хабов).
- `portServices: IPortService[]` — Массив сервисов публикации/подписки.

**Параметры `config` (`IConfig`):**
Содержит статические параметры конфигурации аппарата (сетевые доступы, параметры IO и т.д.), загруженные из переменных окружения.

</div>

### Методы

<div style="color: #555">

- `ApplyExternalState(topic: string, payload: any)` — Парсит топик, пришедший от внешнего брокера, очищает его от `rootTopic`, проходит по дереву `Machine` и применяет `payload`. Защищен от эхо-циклов.
  
- `emitInitialTree(obj: any, basePath: string[])` — Рекурсивно обходит сырое дерево состояний при старте и генерирует события `update` с флагом `init: true` для первичной синхронизации внешних брокеров.

- `onUpdate({ prop, state })` — Обработчик внутреннего события `update`. Отправляет измененное состояние во все зарегистрированные `portServices`.

- `Destroy()` — Отписывается от всех локальных событий.

- `Reset()` — Вызывает метод `Reset()` у всех зарегистрированных секций (в `Machine.States.Sections`), сбрасывая их состояние к начальному.

</div>

### Структуры данных (Интерфейсы)
<div style="color: #555">

**IRootState:**
```typescript
interface IRootState<TSections extends BaseSectionState<any>[]> {
    States: {
        Global: {
            Mode: string;
            Input_Voltage: string;
            Env: Record<string, string>; // Ключ - имя датчика, Значение - статус (OK, ERR_HIGH и тд)
            Net: INetHubState;
            Buses: BUS_STATE[];
        };
        Sections: TSections; // Строго типизированный массив переданных секций
    };
    Config: IConfig;
}
```

**INetHubState:**
```typescript
interface INetHubState {
    Hub_Low: NetStateKeys;
    Hub_Mid: NetStateKeys;
    Hub_High: NetStateKeys;
}
```

**IConfig:**
```typescript
interface IConfig {
    Sections: ISectionParams[];
    Global: IGlobalParams;
}
```

**IGlobalParams:**
```typescript
interface IGlobalParams {
    Buses: IBusParams[];
    Env: IEnvSensorParams[];
    Net: unknown;
}
```

**ISectionParams:**
```typescript
export interface ISectionParams {
    Name: string,
    Id?: string,
    IOList: string[];
    Size: { rows: number, cols: number };
}
```
</div>

### Пример использования
```typescript
import { MqttPortService } from './srvMQTTPortService';
import StatesController from './srvSectionStateController';
import { SpiralSectionState } from '../srvSpiralSection/js/srvSpiralSectionStates';

const mqttService = new MqttPortService('mqtt://localhost:1883', 'client-1');
const spiralSection = new SpiralSectionState({ Name: 'spiral', IOList: ['MainIO'] });

const controller = new StatesController({
    busCount: 2,
    sections: [spiralSection],
    global: {
        hubLevels: ['Hub_Low', 'Hub_Mid', 'Hub_High'],
        envSensors: [{ Name: 'TempSensor', ChName: 'ch1' }]
    },
    portServices: [mqttService]
}, Config);

// Изменение поля автоматически сгенерирует MQTT топик:
// 'Machine/States/Global/Mode' со значением 'SERVICE'
controller.Machine.States.Global.Mode = 'SERVICE'; 

// Строгая типизация сохранена (TypeScript видит методы SpiralSectionState)
controller.Machine.States.Sections[0].Cells[0] = 'TAMPER_ERROR'; 
```
</div>