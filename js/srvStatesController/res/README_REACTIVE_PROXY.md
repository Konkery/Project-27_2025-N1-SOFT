<div style="font-family: 'Open Sans', sans-serif; font-size: 16px">

# srvReactiveProxy

<div style="color: #555">
<p align="center">
<!-- <img src="./res/logo.png" width="400" title="hover text"> -->
</p>
</div>

## Лицензия
////

### Описание
Модуль реализует фабрику глубокого проксирования (Deep Proxy) для создания реактивных объектов состояния. Функция оборачивает переданный объект (или массив) и рекурсивно перехватывает операции чтения и записи. 

При изменении значения свойства генерируется событие `update` через переданный `EventEmitter2`, что позволяет легко транслировать мутации состояния во внешние брокеры (например, MQTT).

Модуль спроектирован с учетом сохранения ООП-иерархии: он безопасно обходит методы классов, символы и служебные свойства (начинающиеся с `_`), сохраняя строгую типизацию исходных объектов (Zero-Type-Loss).

### Подписки
- Нет

### События
- Эмитит событие `update` через переданный экземпляр `EventEmitter2`.

```js
// Структура события update
{
    path: string[], // Массив ключей от корня до измененного свойства
    topic: string,  // Путь, склеенный через слеш (например, 'Global/Mode')
    state: any      // Новое значение свойства
}
```

### Поля
<div style="color: #555">

- `proxyCache` (internal) — объект `WeakMap` для хранения уже созданных прокси-оберток. Предотвращает зацикливание при циклических ссылках и повторное проксирование одних и тех же объектов.

</div>

### Конструктор
- Отсутствует

### Методы

<div style="color: #555">

- `createReactiveState<T>(target: T, emitter: EventEmitter2, basePath: string[] = []): T` — главная функция фабрики. Принимает целевой объект `target` и эмиттер. Возвращает проксированный объект того же типа `T`. 
  - Ловушка `get` — рекурсивно проксирует вложенные объекты при их чтении. Привязывает контекст (`bind`) для извлеченных функций.
  - Ловушка `set` — проверяет изменение значения. Если значение изменилось (`oldValue !== newValue`), применяет его к оригинальному объекту и вызывает `emitter.emit('update', ...)`.

</div>

### Пример
```typescript
import EventEmitter2 from 'eventemitter2';
import { createReactiveState } from './srvReactiveProxy';

const emitter = new EventEmitter2();
const rawState = { Global: { Mode: 'OK' } };

const state = createReactiveState(rawState, emitter);

emitter.on('update', (event) => {
    console.log(`Topic: ${event.topic}, Value: ${event.state}`); 
    // Topic: Global/Mode, Value: SERVICE
});

state.Global.Mode = 'SERVICE';
```
</div>