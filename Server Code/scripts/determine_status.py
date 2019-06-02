#!/usr/bin/env python3

import pymongo
import pickle
import sklearn
import pandas as pd
from pandas.io.json import json_normalize
from sklearn.preprocessing import MinMaxScaler
import sys
import os
from bson.json_util import dumps
from pandas.io.json import json_normalize
import json

db_url = "mongodb://localhost:27018/"

# READ "machine_id" FROM COMMAND LINE
if len(sys.argv) != 2:
    print("No machine_id given, terminating script")
    sys.exit()  # Early termination, if no machine_id given
machine_id = sys.argv[1]

# RETRIEVE NEWEST DATA
client = pymongo.MongoClient(db_url)
db = client["data"]
data = db["data"].find({"machine_id": machine_id}).sort(
    [('timestamp', -1)]).limit(15)  # 15 newest data points for specific machine
client.close()
if data.count() == 0:  # Early termination if no data was retrieved
    print("No data retrieved, terminating script")
    sys.exit()

# TRANSLATE JSON TO DATAFRAME, NORMALIZE DATA
json = json.loads(dumps(data))  # Cursor -> JSON
data = json_normalize(json)     # JSON -> DataFrame
vib_dist = (data["vibration_max"] - data["vibration_min"])
vec_dist = data["vector_distance"]

frame = {'vector_distance': vec_dist, 'vibration_distance': vib_dist}
data_2d = pd.DataFrame(frame).dropna()

# LOAD MODELS AND SCALER
scaler = pickle.load(
    open(f"{os.getcwd()}/scripts/models/scaler.sav", 'rb'))
clustering = pickle.load(
    open(f"{os.getcwd()}/scripts/models/kmeans_model.sav", 'rb'))
outlier = pickle.load(
    open(f"{os.getcwd()}/scripts/models/outlier_model.sav", 'rb'))

# SCALE DATA
input_data = scaler.transform(data_2d)

# INITIALIZE STATUSES
statuses = list()
for i in range(input_data.shape[0]):
    statuses.insert(
        i, {"machine_id": machine_id, "status": None, "timestamp": pd.to_datetime(data["timestamp.$date"][i], unit='ms').to_pydatetime()})

# PREDICT STATUS OF REMAINING DATA
labels = clustering.predict(input_data)
free_cnt = 0
in_use_cnt = 0
irr_behav_cnt = 0
for i in range(len(labels)):
    if(labels[i] == 0):
        statuses[i]["status"] = "Free"
        free_cnt = free_cnt + 1
    elif(labels[i] == 1):
        statuses[i]["status"] = "In Use"
        in_use_cnt = in_use_cnt + 1

# PREDICT OUTLIERS (AKA. IRREGULAR BEHAVIOR" IN INCOMING DATA
predictions = outlier.predict(input_data)
# Add "Irregular Behavior" status to outliers (can only be set for points that have already been identified as "In Use")
for i in range(len(predictions)):
    if(predictions[i] == -1 and statuses[i]["status"] == "In Use"):
        statuses[i]["status"] = "Irregular Behavior"
        irr_behav_cnt = irr_behav_cnt + 1

# REMOVE POTENTIAL "NULL" VALUES
output = list()
for i in range(len(statuses)):
    if statuses[i]["status"] is not None:
        output.append(statuses[i])

# SAVE STATUTES TO DB
client = pymongo.MongoClient(db_url)
db = client["data"]
status = db["status"]
status.insert_many(output)
client.close()
