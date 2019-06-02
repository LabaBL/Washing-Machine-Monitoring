// Piezo Vibration Sensor - Small Horizontal
// Triple axis accelerometer BMA220

#include <BMA220.h>
#include <ArduinoJson.h>

String id = "<INSERT GUID FOR WASHING MACHINE>";
BMA220 bma;
const int PIEZO_PIN = A0; // Piezo output

// Readings buffer
const int READ_SPEED = 25; // In ms
const int BUFFER_SIZE = (1000/READ_SPEED); // Read for 1 second 
float vibration_buffer[BUFFER_SIZE];
int x_buffer[BUFFER_SIZE];
int y_buffer[BUFFER_SIZE];
int z_buffer[BUFFER_SIZE];

// Results buffer
const int SEND_SIZE = 15; // 1 unit per data point
float vibration_min_results[SEND_SIZE];
float vibration_max_results[SEND_SIZE];
float vec_dist_results[SEND_SIZE];

void setup() {
  Serial.begin(9600);
  while (!bma.begin()) {
        Serial.println(F("No valid BMA220 sensor found, check wiring"));
        delay(100);
    }
}

void loop() {
  // Read data every 25 ms, register 1 data point per second, send data every 15 seconds
  for(int j = 0; j < SEND_SIZE; j++) {
  
    for(int i = 0; i < BUFFER_SIZE; i++) {
      // Vibration sensor
      int piezoADC = analogRead(PIEZO_PIN);
      float piezoV = piezoADC / 1023.0 * 5.0;
      vibration_buffer[i] = piezoV;
  
      // Accelerometer
      int x = bma.readAcceleration(XAXIS);
      int y = bma.readAcceleration(YAXIS);
      int z = bma.readAcceleration(ZAXIS);
      x_buffer[i] = x;
      y_buffer[i] = y;
      z_buffer[i] = z;
      
      delay(READ_SPEED);
    }
  
    // Find min/max vibrations
    float min = vibration_buffer[0];
    float max = vibration_buffer[0];
    for(int i = 1; i < BUFFER_SIZE; i++) {
      float x = vibration_buffer[i];
      if(x < min) min = x;
      if(x > max) max = x;
    }
  
    // Find max distance between vectors
    float max_dist = 0.0;
    for(int i = 1; i < BUFFER_SIZE; i++) {
      int x_2 = (x_buffer[i] - x_buffer[i-1]) * (x_buffer[i] - x_buffer[i-1]);
      int y_2 = (y_buffer[i] - y_buffer[i-1]) * (y_buffer[i] - y_buffer[i-1]);
      int z_2 = (z_buffer[i] - z_buffer[i-1]) * (z_buffer[i] - z_buffer[i-1]);

      float dist = sqrt(x_2 + y_2 + z_2);
      if(dist > max_dist) max_dist = dist;
    }
  
    // Insert data into send buffer
    vibration_min_results[j] = min;
    vibration_max_results[j] = max;
    vec_dist_results[j] = max_dist;
  
    // Reset buffer data
    for(int i = 0; i < BUFFER_SIZE; i++) {
      vibration_buffer[i] = 0.0;
    }
  }

  // Serialize to JSON and send data
  const size_t capacity = 3*JSON_ARRAY_SIZE(SEND_SIZE) + JSON_OBJECT_SIZE(4);
  DynamicJsonDocument doc(capacity);
  
  doc["machine_id"] = id; 
  JsonArray dists = doc.createNestedArray("vector_dists");
  JsonArray mins = doc.createNestedArray("vibration_mins");
  JsonArray maxs = doc.createNestedArray("vibration_maxs");

  for(int i = 0; i< SEND_SIZE; i++) {
    dists.add(vec_dist_results[i]);
    mins.add(vibration_min_results[i]);
    maxs.add(vibration_max_results[i]);
  }
  
  serializeJson(doc, Serial); // This sends the data
 
  // Reset send buffer
  for(int i = 0; i< SEND_SIZE; i++) {
    // Overwrite info
    vibration_min_results[i] = 0.0;
    vibration_max_results[i] = 0.0;
    vec_dist_results[i] = 0.0;
  }
}
