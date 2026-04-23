#!/usr/bin/env python3

from evdev import InputDevice, ecodes
import signal
import select
import http.client
import json

# --- CONFIG ---

DEV = '/dev/input/by-id/usb-413d_2107-event-kbd'

HTTP_HOST = '10.110.71.231' #'10.130.1.11'
HTTP_PORT = 2003 #2107
HTTP_PATH = '/rfid'

# --- KEYMAP ---

KEYMAP = {
    ecodes.KEY_A: ('a', 'A'), ecodes.KEY_B: ('b', 'B'), ecodes.KEY_C: ('c', 'C'),
    ecodes.KEY_D: ('d', 'D'), ecodes.KEY_E: ('e', 'E'), ecodes.KEY_F: ('f', 'F'),
    ecodes.KEY_G: ('g', 'G'), ecodes.KEY_H: ('h', 'H'), ecodes.KEY_I: ('i', 'I'),
    ecodes.KEY_J: ('j', 'J'), ecodes.KEY_K: ('k', 'K'), ecodes.KEY_L: ('l', 'L'),
    ecodes.KEY_M: ('m', 'M'), ecodes.KEY_N: ('n', 'N'), ecodes.KEY_O: ('o', 'O'),
    ecodes.KEY_P: ('p', 'P'), ecodes.KEY_Q: ('q', 'Q'), ecodes.KEY_R: ('r', 'R'),
    ecodes.KEY_S: ('s', 'S'), ecodes.KEY_T: ('t', 'T'), ecodes.KEY_U: ('u', 'U'),
    ecodes.KEY_V: ('v', 'V'), ecodes.KEY_W: ('w', 'W'), ecodes.KEY_X: ('x', 'X'),
    ecodes.KEY_Y: ('y', 'Y'), ecodes.KEY_Z: ('z', 'Z'),
    ecodes.KEY_1: ('1', '!'), ecodes.KEY_2: ('2', '@'), ecodes.KEY_3: ('3', '#'),
    ecodes.KEY_4: ('4', '$'), ecodes.KEY_5: ('5', '%'), ecodes.KEY_6: ('6', '^'),
    ecodes.KEY_7: ('7', '&'), ecodes.KEY_8: ('8', '*'), ecodes.KEY_9: ('9', '('),
    ecodes.KEY_0: ('0', ')'),
    ecodes.KEY_SPACE: (' ', ' '),
    ecodes.KEY_MINUS: ('-', '_'), ecodes.KEY_EQUAL: ('=', '+'),
    ecodes.KEY_LEFTBRACE: ('[', '{'), ecodes.KEY_RIGHTBRACE: (']', '}'),
    ecodes.KEY_BACKSLASH: ('\\', '|'), ecodes.KEY_SEMICOLON: (';', ':'),
    ecodes.KEY_APOSTROPHE: ("'", '"'), ecodes.KEY_GRAVE: ('`', '~'),
    ecodes.KEY_COMMA: (',', '<'), ecodes.KEY_DOT: ('.', '>'), ecodes.KEY_SLASH: ('/', '?'),
    ecodes.KEY_KP0: ('0', '0'), ecodes.KEY_KP1: ('1', '1'), ecodes.KEY_KP2: ('2', '2'),
    ecodes.KEY_KP3: ('3', '3'), ecodes.KEY_KP4: ('4', '4'), ecodes.KEY_KP5: ('5', '5'),
    ecodes.KEY_KP6: ('6', '6'), ecodes.KEY_KP7: ('7', '7'), ecodes.KEY_KP8: ('8', '8'),
    ecodes.KEY_KP9: ('9', '9'), ecodes.KEY_KPDOT: ('.', '.'),
    ecodes.KEY_KPSLASH: ('/', '/'), ecodes.KEY_KPASTERISK: ('*', '*'),
    ecodes.KEY_KPMINUS: ('-', '-'), ecodes.KEY_KPPLUS: ('+', '+'),
}

# --- STATE ---

running = True
shift_pressed = False
buffer = ''

# --- SIGNAL HANDLING ---

def stop(sig, frame):
    global running
    running = False

signal.signal(signal.SIGINT, stop)
signal.signal(signal.SIGTERM, stop)

# --- HTTP SEND ---

def send_buffer(data):

    try:
        conn = http.client.HTTPConnection(
            HTTP_HOST,
            HTTP_PORT,
            timeout=0.5
        )

        payload = json.dumps({
            "barcode": data,
            "type": "rfid",
            "device": "usb-413d_2107"
        })

        headers = {
            "Content-Type": "application/json"
        }

        conn.request(
            "POST",
            HTTP_PATH,
            payload,
            headers
        )

        response = conn.getresponse()

        # важно — прочитать ответ
        print(response.read())

        conn.close()

    except Exception:
        # можно добавить retry или лог
        pass


def flush_buffer():
    global buffer

    if buffer:
        print(buffer)
        send_buffer(buffer)
        buffer = ''


# --- DEVICE ---

dev = InputDevice(DEV)
dev.grab()

# --- MAIN LOOP ---

try:
    while running:

        ready, _, _ = select.select([dev.fd], [], [], 0.5)

        if not ready:
            continue

        for event in dev.read():

            if event.type != ecodes.EV_KEY:
                continue

            # Shift
            if event.code in (
                ecodes.KEY_LEFTSHIFT,
                ecodes.KEY_RIGHTSHIFT
            ):
                shift_pressed = event.value != 0
                continue

            # только key down
            if event.value != 1:
                continue

            # Enter → отправка
            if event.code in (
                ecodes.KEY_ENTER,
                ecodes.KEY_KPENTER
            ):
                flush_buffer()
                continue

            # Backspace
            if event.code == ecodes.KEY_BACKSPACE:
                buffer = buffer[:-1]
                continue

            chars = KEYMAP.get(event.code)

            if chars:
                buffer += (
                    chars[1]
                    if shift_pressed
                    else chars[0]
                )

finally:
    try:
        dev.ungrab()
    except:
        pass