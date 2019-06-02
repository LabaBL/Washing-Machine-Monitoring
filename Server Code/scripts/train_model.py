import sklearn
import os
import requests
import pickle
import json
import pandas as pd
from pandas.io.json import json_normalize
import numpy as np
from sklearn.cluster import KMeans
from sklearn.preprocessing import MinMaxScaler
from sklearn.ensemble import IsolationForest
from sklearn.neighbors import LocalOutlierFactor
from sklearn.covariance import EllipticEnvelope
from bson.json_util import dumps
from bson.objectid import ObjectId
import datetime
import matplotlib.pyplot as pl
import pymongo
import sys


def save_model(model, filename):
    dir_path = "scripts/models"
    if not os.path.exists(dir_path):
        os.mkdir(dir_path)
    pickle.dump(model, open("{}/{}".format(dir_path, filename), 'wb'))


def retrieve_data():
    # API Retrieval
    url = "<INSERT SERVER ENDPOINT HERE>"
    r = requests.get(url)
    json_object = r.json()

    # DB Retrieval, for local use
    # client = pymongo.MongoClient("mongodb://localhost:27018/")
    # db = client["data"]
    # json_object = db["data"].find()
    # client.close()

    return json_object


def train_model():
    data = json_normalize(retrieve_data())

    if data.empty:  # Early termination if no data was retrieved
        print("No data retrieved, terminating script")
        sys.exit()

    vib_dist = (data["vibration_max"] - data["vibration_min"])
    vec_dist = data["vector_distance"]

    # SCALE DATA, ISOLATED
    frame = {'vector_distance': vec_dist, 'vibration_distance': vib_dist}
    data_2d = pd.DataFrame(frame).dropna()

    scaler = MinMaxScaler()
    training_data = scaler.fit_transform(data_2d)

    # K MEANS CLUSTERING
    # Initialize the two centroids in minimum and maximum
    init_cnts = np.array([[0.0, 0.0], [1.0, 1.0]])
    clustering = KMeans(n_clusters=2, random_state=42, init=init_cnts)
    clustering.fit(training_data)

    # OUTLIER DETECTION
    outlier = EllipticEnvelope(contamination=0.00075, random_state=42)
    outlier.fit(training_data)

    # SAVE MODELS
    print("Saving scaler")
    save_model(scaler, "scaler.sav")
    print("Saving clustering model")
    save_model(clustering, "kmeans_model.sav")
    print("Saving outlier model")
    save_model(outlier, "outlier_model.sav")


train_model()
