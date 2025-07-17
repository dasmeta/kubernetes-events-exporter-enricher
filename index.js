const express = require("express");
const bodyParser = require("body-parser");
const k8s = require("@kubernetes/client-node");
const axios = require("axios");

const DOWNSTREAM_WEBHOOK = process.env.DOWNSTREAM_WEBHOOK;

const kc = new k8s.KubeConfig();

if(process.env.KUBERNETES_CONFIG_PATH) {

    kc.loadFromFile(process.env.KUBERNETES_CONFIG_PATH)
    const cluster =  kc.getCurrentCluster()
    cluster.skipTLSVerify = true;
    delete cluster.caData;
    delete cluster.caFile;

} else {
    kc.loadFromCluster()
}

const coreV1 = kc.makeApiClient(k8s.CoreV1Api);
const appsV1 = kc.makeApiClient(k8s.AppsV1Api);
const batchV1 = kc.makeApiClient(k8s.BatchV1Api);
const nodeV1 = kc.makeApiClient(k8s.NodeV1Api);
const autoscalingV1 = kc.makeApiClient(k8s.AutoscalingV1Api);
const autoscalingV2 = kc.makeApiClient(k8s.AutoscalingV2Api);
const customObjects = kc.makeApiClient(k8s.CustomObjectsApi);

async function getHPA(ref) {
  if (ref.apiVersion === "autoscaling/v2") {
    return (await autoscalingV2.readNamespacedHorizontalPodAutoscaler({ name: ref.name, namespace: ref.namespace }));
  } else if (ref.apiVersion === "autoscaling/v1") {
    return (await autoscalingV1.readNamespacedHorizontalPodAutoscaler({ name: ref.name, namespace: ref.namespace }));
  } else {
    throw new Error(`Unsupported HPA apiVersion: ${ref.apiVersion}`);
  }
}

async function getData(ref) {
    switch (ref.kind) {
        case "Pod":
            return coreV1.readNamespacedPod({name: ref.name, namespace: ref.namespace});
        case "Deployment":
            return appsV1.readNamespacedDeployment({name: ref.name, namespace: ref.namespace});
        case "StatefulSet":
            return appsV1.readNamespacedStatefulSet({name: ref.name, namespace: ref.namespace});
        case "ReplicaSet":
            return appsV1.readNamespacedReplicaSet({name: ref.name, namespace: ref.namespace});
        case "DaemonSet":
            return appsV1.readNamespacedDaemonSet({name: ref.name, namespace: ref.namespace});
        case "Service":
            return coreV1.readNamespacedService({name: ref.name, namespace: ref.namespace});
        case "HorizontalPodAutoscaler":
            return getHPA(ref);
        // Add more as needed
        default:
            throw new Error(`Fetching kind=${ref.kind} not implemented`);
    }
}

const app = express();
app.use(bodyParser.json());

app.get('/healthz', (req, res) => res.send('ok'));

app.post("/events", async (req, res) => {

    const event = req.body;

    const involvedObject = event.involvedObject;
    let definition = {}; 

    if (!involvedObject.kind || !involvedObject.namespace || !involvedObject.name) {
        console.log("Missing kind, namespace, or name in involvedObject");
    }

    try {
        definition = await getData(involvedObject);
    } catch(err) {
        console.log(`Something wrong with fetching definition: ${err.message}`);
    }

    event.definition = definition;

    axios.post(DOWNSTREAM_WEBHOOK, event);

    res.json({ ok: true });
});

const port = process.env.PORT || 8080;
const server = app.listen(port, () => {
  console.log(`kuberneres-events-exporter-enricher listening on port ${port}`);
});

process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down...');
  server.close(() => {
    console.log('HTTP server closed. Exiting.');
    process.exit(0);
  });
});