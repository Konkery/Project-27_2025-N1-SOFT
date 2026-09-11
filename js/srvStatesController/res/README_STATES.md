<div style="font-family: 'Open Sans', sans-serif; font-size: 16px">

# srvStates

<div style="color: #555">
<p align="center">
<!-- <img src="./res/logo.png" width="400" title="hover text"> -->
</p>
</div>

## Лицензия
////

### Описание
Модуль содержит константы и перечисления (типы), определяющие все возможные состояния компонентов аппарата. Этот файл является единым источником истины для допустимых значений флагов.

### Подписки
- Нет

### События
- Нет

### Поля (Константы)
<div style="color: #555">

- `STATE` — базовые состояния (`OK`, `BLOCKED`, `ERROR`, `SERVICE`).
- `CELL_STATE` — расширенные состояния ячеек (наследует `STATE`, добавляет `OVERLOAD`, `TAMPER_ERROR`, `ACTUATOR_SHORT_CIRCUIT`, `ACTUATOR_NO_POWER`).
- `IO_STATE` — состояния модулей ввода-вывода (`OK`, `ERR_NO_LINK`).
- `IO_PORT_STATE` — состояния портов ввода-вывода (`OK`, `ERROR`).
- `MEAS_STATE` — состояния измеряемых величин (`OK`, `ERR_HIGH`, `ERR_LOW`).
- `GLOBAL_MACHINE_STATE` — глобальные режимы аппарата (`OK`, `SERVICE`, `DEPLOY`).
- `NET_STATE` — состояния сетевых хабов (`ONLINE`, `OFFLINE`, `ERR_NO_LINK`).
- `AVAILABLE` / `RUNNING` — бинарные флаги (`YES`, `NO`).

</div>

### Конструктор
- Отсутствует (только константы и типы)

### Методы
- Отсутствуют

### Пример
```typescript
import { CELL_STATE, CellStateKeys } from './srvStates';

let myCellStatus: CellStateKeys = CELL_STATE.OK;
```
</div>