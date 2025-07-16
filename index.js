const express = require("express");
const bodyParser = require("body-parser");
const k8s = require("@kubernetes/client-node");
const axios = require("axios");

const app = express();
app.use(bodyParser.json());

app.post("/events", async (req, res) => {

    const event = req.body;

    console.log("RECEIVED EVENT");
    console.log(JSON.stringify(event, null, 2));

    res.json({ ok: true });
});

const port = process.env.PORT || 8080;
app.listen(port, () => {
  console.log(`kuberneres-events-exporter enricher listening on port ${port}`);
});