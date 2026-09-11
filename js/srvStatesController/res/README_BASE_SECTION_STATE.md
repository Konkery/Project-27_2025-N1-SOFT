<div style="font-family: 'Open Sans', sans-serif; font-size: 16px">

# srvMQTTClient

<div style="color: #555">
<p align="center">
<img src="./res/logo.png" width="400" title="hover text">
</p>
</div>

## Лицензия
////

### Описание
Модуль реализует функционал модуля *srvBaseSectionState** серверного фреймворка. Служба предназначена для унифицированного представления объекта состояния секции.

### Подписки
- 'all-init-stage1-set' — инициализация службы;
- 'modbusclient-send' — обработка входящих сообщений;
- 'all-connect' — подключение к источникам;
- 'add-disconnect' — отключение от источников;
```js
{
    com: 'modbusclient-send', 
    arg: [source_name],  
    value: [topicName, payload] 
}
```

### События
- 'proxymodbus-msg-get' — отправка сообщения с собранными данными на прокси-сервис для дальнейшей обработки.
```js
{
    com: 'proxymodbus-msg-get',
    arg: [source_name],
    value: [ topic_name, payload ]
}
```

### Поля
<div style="color: #555">

- #_Servers — объект, коллекция подключений.
- #_Sockets — объект, коллекция TCP-сокетов.

</div>

### Конструктор
<div style="color: #555">

- _busList — список шин, созданных в проекте;
- _node — объект узла;

</div>

### Методы

<div style="color: #555">

- HandlerEvents_all_init_stage1_set(_topic, _msg) — обрабатывает событие инициализации, получает имена источников;
  
- HandlerEvents_modbusclient_send(_topic, _msg) — принимает сообщение и отправляет его в указанный регистр источника;

- HandlerEvents_all_connect(_topic, _msg) — подключается к источникам и запускает опрос каналов;

- HandlerEvents_all_disconnect(_topic, _msg) — отключается от всех источников;

- EmitEvents_proxymodbus_msg_get({ value, arg }) — отправляет по modbusBus сообщение на прокси-службу;

- Start() — запускает опрос каналов;

- Connect() — подключается к источникам.

</div>

### Пример
```js

```
</div>