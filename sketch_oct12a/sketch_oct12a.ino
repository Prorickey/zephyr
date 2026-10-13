#include <Arduino.h>

#define LED 2

#include <VescUart.h>
VescUart vesc;

#include <SPI.h>
#include "ICM42688.h"

#define IMU_CS_PIN 5

ICM42688 IMU(SPI, IMU_CS_PIN);

void setup() {
  Serial.begin(115200);  
  while(!Serial);

  pinMode(LED, OUTPUT);                 
  Serial2.begin(115200, SERIAL_8N1, 16, 17);   
  vesc.setSerialPort(&Serial2);

  Serial.println("Initializing Teyleten Robot ICM42688...");

  int status = IMU.begin();
  if (status < 0) {
    Serial.print("IMU initialization failed! Error code: ");
    Serial.println(status);
    while (1) { delay(10); } 
  }

  Serial.println("ICM42688 ready and polling data!");
}

bool pitchMotorControl = true;

double pitch = 0;
double alpha = 0.98;

double duty = 0.30;

bool ledStatus = false;
unsigned long lastLEDChange = 0;
unsigned long lastStatPrint = 0;
unsigned long motorDirectionLastChange = 0;
int direction = true;

double dt = 0.0001; // seconds

void loop() {
  unsigned long startTime = micros();

  if(lastLEDChange + 100 < millis()) {
    ledStatus = !ledStatus;
    lastLEDChange = millis();
  }

  if(ledStatus) digitalWrite(LED, HIGH);
  else digitalWrite(LED, LOW);

  if(motorDirectionLastChange + 2000 < millis()) {
    direction = !direction;
    motorDirectionLastChange = millis();
  }

  if(pitchMotorControl) vesc.setDuty(pitch / 180.0);
  else if(direction) vesc.setDuty(-duty);
  else vesc.setDuty(duty);

  IMU.getAGT(); 

  double ax = IMU.accX();
  double ay = IMU.accY();
  double az = IMU.accZ();
  double gy = IMU.gyrY();
  double gx = IMU.gyrX();

  float accelPitch = atan2(-ay, sqrt(ax*ax + az*az)) * RAD_TO_DEG;
  pitch = alpha * (pitch + gx * dt) + (1 - alpha) * accelPitch;

  if(lastStatPrint + 500 < millis()) {
    if (vesc.getVescValues()) {
      Serial.printf("RPM: %.0f  V: %.1f  I: %.2f\n",
        vesc.data.rpm, vesc.data.inpVoltage, vesc.data.avgMotorCurrent);
    } else {
      Serial.println("No response from VESC");
    }  

    Serial.print("Accel X: "); Serial.print(ax); Serial.print(" g\t");
    Serial.print("Accel Y: "); Serial.print(ay); Serial.print(" g\t");
    Serial.print("Accel Z: "); Serial.print(az); Serial.println(" g");
    Serial.print("Gyro X: ");  Serial.print(gx); Serial.print(" dps\t");
    Serial.print("Gyro Y: ");  Serial.print(gy); Serial.print(" dps\t");
    Serial.print("Gyro Z: ");  Serial.print(IMU.gyrZ()); Serial.println(" dps");
    Serial.printf("Pitch: %.2fdeg\n", pitch);
    Serial.println("----------------------------------------------");

    lastStatPrint = millis();
  } 

  dt = (micros() - startTime) / 1000000;
}
