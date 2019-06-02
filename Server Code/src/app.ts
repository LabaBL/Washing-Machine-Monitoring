#!/usr/bin/env node

import express from 'express';
import http from 'http';
import monk from 'monk';
import { Guid } from "guid-typescript";

const db_url = 'localhost:27018/data';

const app = express();
var bodyParser = require('body-parser');
app.use(bodyParser.json());
const server = http.createServer(app);

/* TYPES */

type Machine = {
    machine_id: Guid,
    name: string,
    place: string
    out_of_order: boolean
}

type Data = {
    machine_id: Guid,
    vector_dists: number[],
    vibration_mins: number[],
    vibration_maxs: number[]
}

type Status = {
    machine_id: Guid,
    status: string,
    timestamp: Date
}

enum Status_Options {
    Not_Connected = "Not Connected",
    Free = "Free",
    In_Use = "In Use",
    Irregular_Behavior = "Irregular Behavior",
    Out_of_Order = "Out of Order"
}

/* ENDPOINTS */

// Get time of last updated washing by id
app.get("/data/lastupdated", async (req, res) => {
    console.log(req.body)

    const id = req.query.id;

    try {
        const db = monk(db_url);
        const query = { limit: 1, sort: { timestamp: -1 }, fields: "timestamp" };
        const result = await db.get('data').find({ machine_id: id }, query);
        db.close();
        res.json(result);
    }
    catch (e) {
        console.log(e);
        res.status(503);
    }
});

// Get status
app.get("/status", async (req, res, next) => {
    console.log(req.body)

    try {
        const machine_id = req.query.id;
        const db = monk(db_url);

        // Find out whether machine exists
        const exist = await db.get('machines').count({ machine_id: machine_id })
        if (exist == 0) { // Halt execution if machine does not exist
            res.status(400).json("Machine does not exist.")
            db.close();
            next();
            return;
        }

        // Find out whether machine is reported as "Out of Order"
        const machine = await db.get('machines').findOne({ machine_id: machine_id }, { fields: "out_of_order" })
        const mac = machine as unknown as Machine;
        if (mac.out_of_order) {
            res.json({ "status": Status_Options.Out_of_Order, "timestamp": new Date(Date.now()) });
            db.close();
            next();
            return;
        }

        // Is the machine connected and posting data to server?
        const lu_query = { limit: 1, sort: { timestamp: -1 }, fields: "timestamp" };
        const last_updated = await db.get('data').findOne({ machine_id: machine_id }, lu_query);
        const lu = new Date(last_updated.timestamp);

        if (isNaN(lu.getTime())) {
            res.json("No status available.");
            db.close();
            next();
            return;
        }

        const diff = Date.now().valueOf() - lu.valueOf();
        if (diff > 180000) { // 180.000 ms is 3 minutes
            res.json({ "status": Status_Options.Not_Connected, "timestamp": new Date(Date.now()) })
            db.close();
            next();
            return;
        }

        // Determine the status of the machine (based on data from the last 4 minutes)
        const limit = 240
        const status_query = { limit: limit, sort: { timestamp: -1 } }; // 1 status = 1 second
        const status_res = await db.get('status').find({ machine_id: machine_id }, status_query) as unknown[] as Status[];
        const free = status_res.filter((elem, i, arr) => { return (elem.status == Status_Options.Free) })
        const in_use = status_res.filter((elem, i, arr) => { return (elem.status == Status_Options.In_Use) })
        const irr_behavior = status_res.filter((elem, i, arr) => { return (elem.status == Status_Options.Irregular_Behavior) })
        console.log("Number of \"Free\": " + free.length);
        console.log("Number of \"In Use\": " + in_use.length);
        console.log("Number of \"Irregular Behavior\": " + irr_behavior.length);
        if (irr_behavior.length > (limit * 0.1)) { // If more than 10% is reported as "Irregular Behavior" then report this
            res.json({ "status": Status_Options.Irregular_Behavior, "timestamp": status_res[0].timestamp });
            db.close();
            next();
            return;
        }
        else if (free.length > limit / 2) {
            res.json({ "status": Status_Options.Free, "timestamp": status_res[0].timestamp });
            db.close();
            next();
            return;
        }
        else if (in_use.length > limit / 2) {
            res.json({ "status": Status_Options.In_Use, "timestamp": status_res[0].timestamp });
            db.close();
            next();
            return;
        }
        else { // If equal, return the newest status
            res.json({ "status": status_res[0].status, "timestamp": status_res[0].timestamp });
            db.close();
            next();
            return;
        }
    }
    catch (e) {
        console.log(e);
        res.status(503);
    }
});

// Post status
app.post("/status", async (req, res) => {
    console.log(req.body)
    const dto = req.body as Status;
    if (!dto) res.sendStatus(400);

    try {
        const db = monk(db_url);
        const result = await db.get('status').insert(dto);
        db.close();
        res.json(result);
    } catch (e) {
        console.log(e);
        res.status(503);
    }
});


// Get all machines in database
app.get("/machines", async (_, res) => {
    try {
        const db = monk(db_url);
        const result = await db.get('machines').find();
        res.json(result);
        db.close();
    }
    catch (e) {
        console.log(e);
        res.status(503);
    }
});


// Post machine to server
app.post("/machine", async (req, res, next) => {
    console.log(req.body)
    const dto = req.body as Machine;
    if (!dto) res.sendStatus(400);

    try {
        const db = monk(db_url);
        const machines = db.get('machines')
        const exist = await machines.count({ machine_id: dto.machine_id })

        if (exist == 0) { // Only create machine, if it does not already exist
            const result = await machines.insert(dto);
            res.json(result);
            db.close();
            next();
            return;
        }
        else {
            res.status(400).json("Machine already registered.");
            db.close();
            next();
            return;
        }
    }
    catch (e) {
        console.log(e);
        res.status(503);
    }
});

// Update machine
app.put("/machine", async (req, res, next) => {
    console.log(req.body)
    const dto = req.body as Machine;
    if (!dto) res.sendStatus(400);

    try {
        const db = monk(db_url);
        const machines = db.get('machines')
        const exist = await machines.count({ machine_id: dto.machine_id })
        if (exist > 0) { // Only update machine, if it exists
            const result = await machines.update({ machine_id: dto.machine_id }, { $set: { name: dto.name, place: dto.place, out_of_order: dto.out_of_order } });
            res.json(result);
            db.close();
            next();
            return;
        }
        else {
            res.status(400).json("Machine does not exist.");
            db.close();
            next();
            return;
        }
    }
    catch (e) {
        console.log(e);
        res.status(503);
    }
});

// Get data from last X seconds
app.get("/data", async (req, res) => {
    console.log(req.body)

    try {
        const x = req.query.x;
        const inputDate = new Date(Date.now() - (1000 * x));

        const db = monk(db_url);
        const result = await db.get('data').find({ "timestamp": { $gte: inputDate } });
        db.close();
        res.json(result);
    }
    catch (e) {
        console.log(e);
        res.status(503);
    }
});

// Post data to server 
app.post("/data", async (req, res) => {
    console.log(req.body)
    const dto = req.body as Data;
    if (!dto) res.sendStatus(400);

    try {
        var no_datapoints = dto.vector_dists.length;
        var timestamp: Date = new Date(Date.now() - (1000 * no_datapoints)); // Subtract 1 second per datapoint

        // Format data per timestep
        var l = []
        for (var i = 0; i < no_datapoints; i++) {
            var dp = {
                "machine_id": dto.machine_id,
                "timestamp": timestamp,
                "vector_distance": dto.vector_dists[i],
                "vibration_min": dto.vibration_mins[i],
                "vibration_max": dto.vibration_maxs[i],
            }
            l.push(dp)
            timestamp = new Date(timestamp.getTime() + 1000) // Add 1 second
        }

        // Post results to db
        const db = monk(db_url);
        const result = await db.get("data").insert(l);
        db.close();
        res.json(result);

        // Execute python script to label new data
        const { spawn } = require('child_process');
        spawn("python3",
            [
                "scripts/determine_status.py",
                dto.machine_id
            ]);
    }
    catch (e) {
        console.log(e);
        res.status(503);
    }
});

// Base path
app.get('/', function (_, res) {
    try {
        res.sendFile(__dirname + '/index.html');
    }
    catch (e) {
        console.log(e);
        res.status(500);
    }
});


/* START UP SERVER */
app.use("/images", express.static(__dirname + "/images"));

const db = monk(db_url);
try {
    db.create('machines');
    db.create('data');
    db.create('status');
    db.close();
}
catch (e) {
    // Do nothing
    console.log(e);
}

server.listen(3000, () =>
    console.info("Server is running and listening on port: 3000"),
);