<div style="font-family: 'Open Sans', sans-serif; font-size: 16px">

# ClassStatesController (Legacy / JS Version)

<div style="color: #555">
<p align="center">
<!-- <img src="./res/logo.png" width="400" title="hover text"> -->
</p>
</div>

## Лицензия
////

### Описание
Модуль реализует функционал центрального контроллера состояний аппарата (`StatesController`) для старой архитектуры на JavaScript. Служба предназначена для инициализации, хранения и реактивного управления единым деревом состояния (`rawState`), но использует более старые подходы без строгой типизации TypeScript Generics.

В этом модуле также реализован механизм Deep Proxy через утилиту `createReactiveState`, которая обеспечивает отслеживание изменений состояния и их автоматическую трансляцию во внешние сервисы (например, MQTT брокер).

### Подписки (Внутренние события EventEmitter)
Служба наследуется от `EventEmitter2` и подписывается на собственные события, генерируемые `srvReactiveProxy` при мутации состояния:
- `update` — генерируется при изменении любого поля в реактивном дереве `state`.

### Внешнее взаимодействие (через IPortService)
Контроллер взаимодействует с внешним миром через массив внедренных `portServices` (например, `MqttPortService`):
- `service.Pub(prop, state)` — отправка измененного состояния в брокер.
- `service.Sub('#')` — подписка на все входящие изменения.
- `service.on('message', ...)` — обработка входящих изменений для применения к локальному дереву через `applyExternalState`.

### Поля
<div style="color: #555">

- `state` — Публичное, реактивное дерево состояния аппарата.
- `portServices` — Массив сервисов для двунаправленной синхронизации.
- `_isApplyingExternal` — Внутренний флаг защиты от эхо-циклов (предотвращает ре-публикацию состояний, пришедших извне).

</div>

### Конструктор
<div style="color: #555">

Инициализируется конфигурационным объектом `opts`.

```javascript
constructor(opts)
```

**Параметры `opts`:**
- `busCount` — Количество электрических шин аппарата.
- `sections` — Объект с экземплярами секций.
- `global` — Конфигурация глобальных параметров (массивы имен датчиков окружения и уровней сетевых хабов).
- `portServices` — Массив сервисов публикации/подписки.

</div>

### Методы

<div style="color: #555">

- `applyExternalState(topic, value)` — Парсит топик, пришедший от внешнего брокера, проходит по локальному дереву `state` и применяет `value`. Защищен от эхо-циклов флагом `_isApplyingExternal`.
  
- `emitInitialTree(obj, basePath)` — Рекурсивно обходит сырое дерево состояний при старте и генерирует события `update` с флагом `init: true` для первичной синхронизации внешних брокеров.

- `onUpdate({ prop, state })` — Обработчик внутреннего события `update`. Отправляет измененное состояние во все зарегистрированные `portServices`.

- `destroy()` — Отписывается от всех локальных событий.

</div>

### Пример использования
```javascript
const mqttService = new MqttPortService('mqtt://localhost:1883', 'client-1');

const controller = new StatesController({
    busCount: 2,
    sections: {
        spiral: new SpiralSectionState({ name: 'spiral', ioList: ['MainIO'] })
    },
    global: {
        hubLevels: ['Hub_Low', 'Hub_Mid', 'Hub_High'],
        envSensors: [{ name: 'TempSensor', active: true, critical: true }]
    },
    portServices: [mqttService]
});

// Изменение поля автоматически сгенерирует MQTT публикацию
controller.state.global.machine = 'SERVICE'; 
```
</div>