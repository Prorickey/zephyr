#define LED 2

#include <VescUart.h>
VescUart vesc;

void setup() {
  pinMode(LED, OUTPUT);
  Serial.begin(115200);                          // USB debug
  Serial2.begin(115200, SERIAL_8N1, 16, 17);     // RX=16, TX=17
  vesc.setSerialPort(&Serial2);
}

int a = 0;
int direction = true;

void loop() {
  // Serial.println("Hello, World!");
  // digitalWrite(LED, HIGH); 
  // delay(1000);               

  // bool on = true;

  // for(int i = 0; i < 10; i++) {
  //   if(on) {
  //     on = false;
  //     digitalWrite(LED, LOW);
  //   } else {
  //     on = true;
  //     digitalWrite(LED, HIGH);
  //   }

  //   delay(100);
  // }     

  if (vesc.getVescValues()) {
    Serial.printf("RPM: %.0f  V: %.1f  I: %.2f\n",
      vesc.data.rpm, vesc.data.inpVoltage, vesc.data.avgMotorCurrent);
  } else {
    Serial.println("No response from VESC");
  }    

  if(a == 20) {
    if(direction) {
      vesc.setDuty(-0.30);
      direction = false;
    } else {
      vesc.setDuty(0.30);
      direction = true;
    }
    a = 0;
  } else {
    a++;
  }

  delay(50);   
}
