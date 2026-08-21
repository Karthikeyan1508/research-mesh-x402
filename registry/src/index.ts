import express from "express";
import rateLimit from "express-rate-limit";
import pino from "pino";
import { z } from "zod";

const logger = pino({ level: process.env.LOG_LEVEL || "info", name: "registry" });

function sendProblem(res: express.Response, status: number, title: string, detail: string) {
  res
    .status(status)
    .type("application/problem+json")
    .json({ type: "about:blank", title, status, detail });
}

const app = express();
app.use(express.json());
app.use(
  rateLimit({
    windowMs: 60 * 1000,
    max: 120,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (_req, res) => sendProblem(res, 429, "Too Many Requests", "Rate limit exceeded, try again shortly."),
  })
);
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

const RegisterBodySchema = z.object({
  resourceUrl: z.string().min(1, "resourceUrl must be a non-empty string"),
  tags: z.array(z.string()).optional(),
  accepts: z.array(z.any()).optional(),
  schema: z
    .object({
      description: z.string().optional(),
      input: z.any().optional(),
      output: z.any().optional(),
    })
    .optional(),
});

app.post("/register", (req, res) => {
  const parsed = RegisterBodySchema.safeParse(req.body);
  if (!parsed.success) {
    logger.warn({ issues: parsed.error.issues }, "rejected malformed /register body");
    sendProblem(res, 400, "Invalid Request Body", parsed.error.issues.map((i) => i.message).join("; "));
    return;
  }
  const { resourceUrl, tags, accepts, schema } = parsed.data;

  logger.info({ tags, resourceUrl }, "registering capability");

  const id = Buffer.from(`POST:${resourceUrl}`).toString("base64");
  const resource: DiscoveryResource = {
    id,
    resourceUrl,
    method: "POST",
    description: schema?.description || "Dynamic TrustMesh Agent",
    mimeType: "application/json",
    accepts: accepts || [],
    tags: tags || [],
    discoveryInfo: schema
      ? {
          input: {
            type: "http",
            method: "POST",
            bodyType: "json",
            body: schema.input || {},
          },
          output: schema.output
            ? {
                type: "json",
                example: schema.output,
              }
            : undefined,
        }
      : undefined,
    lastUpdated: new Date().toISOString(),
  };

  registry.set(resourceUrl, resource);
  res.json({ success: true, registered: resource });
});

app.get("/discover", (req, res) => {
  const capability = String(req.query.capability || "");
  logger.info({ capability }, "discover request received");

  const allItems = Array.from(registry.values());
  const matchingItems = capability ? allItems.filter((item) => item.tags?.includes(capability)) : allItems;

  res.json({
    x402Version: 2,
    items: matchingItems,
    pagination: {
      limit: 50,
      offset: 0,
      total: matchingItems.length,
    },
  });
});

app.listen(PORT, () => {
  logger.info(`Local Bazaar registry listening on port :${PORT}`);
});
