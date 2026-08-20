import express from "express";

const app = express();
app.use(express.json());
const PORT = 4025;

interface DiscoveryResource {
  id: string;
  resourceUrl: string;
  method: string;
  description?: string;
  mimeType?: string;
  accepts: any[];
  tags?: string[];
  discoveryInfo?: {
    input: any;
    output?: any;
  };
  lastUpdated: string;
}

const registry: Map<string, DiscoveryResource> = new Map();

app.post("/register", (req, res) => {
  const { resourceUrl, tags, accepts, schema } = req.body;
  if (!resourceUrl) {
    res.status(400).json({ error: "Missing resourceUrl" });
    return;
  }

  console.log(`[registry] Registering capability tags [${tags?.join(", ")}] for resource: ${resourceUrl}`);

  const id = Buffer.from(`POST:${resourceUrl}`).toString("base64");
  const resource: DiscoveryResource = {
    id,
    resourceUrl,
    method: "POST",
    description: schema?.description || "Dynamic TrustMesh Agent",
    mimeType: "application/json",
    accepts: accepts || [],
    tags: tags || [],
    discoveryInfo: schema ? {
      input: {
        type: "http",
        method: "POST",
        bodyType: "json",
        body: schema.input || {}
      },
      output: schema.output ? {
        type: "json",
        example: schema.output
      } : undefined
    } : undefined,
    lastUpdated: new Date().toISOString()
  };

  registry.set(resourceUrl, resource);
  res.json({ success: true, registered: resource });
});

app.get("/discover", (req, res) => {
  const capability = String(req.query.capability || "");
  console.log(`[registry] Discover request received for capability: "${capability}"`);

  const allItems = Array.from(registry.values());
  const matchingItems = capability 
    ? allItems.filter(item => item.tags?.includes(capability))
    : allItems;

  res.json({
    x402Version: 2,
    items: matchingItems,
    pagination: {
      limit: 50,
      offset: 0,
      total: matchingItems.length
    }
  });
});

app.listen(PORT, () => {
  console.log(`[registry] Local Bazaar registry listening on port :${PORT}`);
});
