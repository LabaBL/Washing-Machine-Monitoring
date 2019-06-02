#!/user/bin/env python

import serial
import time
import json
import requests

# Connection Setup
post_url = "<INSERT URL TO SERVER ENDPOINT HERE>"


def send_data(data):
    try:
        r = requests.post(post_url, json=data)
        print("Status: {}".format(r.status_code))

    except Exception as e:
        print(e)


def is_json(myjson):
    try:
        json_object = json.loads(myjson)
    except ValueError:
        return False
    return True


# MAIN SCRIPT
# Serial Setup
port = "<INSERT USB SERIAL PORT HERE>"  # For example "/dev/ttyACM0"
rate = 9600
found = False
ser = None

while True:  # Outer look, run forever
    while not found:
        try:
            print("Trying to connect to Arduino")
            ser = serial.Serial(port, rate)
            ser.flushInput()
            found = True
            print("Arduino found")
        except:
            if ser is not None:
                ser.close()
            print("No Arduino found")
            time.sleep(0.5)

    while found:
        try:
            if ser.inWaiting() > 0:
                print("Reading data")
                time.sleep(0.5)  # Make time for all data to be sent
                bytes_of_data = ser.inWaiting()
                data = ser.read(bytes_of_data)
                data = str(data, encoding='utf-8')

                valid_json = is_json(data)
                print("Is valid JSON: {}".format(valid_json))
                if valid_json:
                    json_data = json.loads(data)
                    print(data)
                    print("Sending data")
                    send_data(json_data)

                # Reset
                ser.flushInput()
        except Exception as e:
            if ser is not None:
                ser.close()
            print("Arduino disconnected")
            print(e)
            found = False
