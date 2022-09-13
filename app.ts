import { PrismaClient } from "@prisma/client";
import parser from "body-parser";
import { createHash } from "crypto";
import express from "express";
import asyncPool from "tiny-async-pool";
import { z } from "zod";
import { MAX_POOL_SIZE } from "./constants";

const db = new PrismaClient();
const app = express();
app.use(parser.json({ limit: "100mb" }));
const port = process.env.PORT || 3000;

app.get("/", async (req, res) => {
  const { before, after, type, value, unit } = z
    .object({
      before: z.date().optional(),
      after: z.date().optional(),
      type: z.string().optional(),
      value: z.number().optional(),
      unit: z.string().optional(),
    })
    .parse({
      ...req.query,
      before:
        typeof req.query.before === "string"
          ? new Date(req.query.before)
          : undefined,
      after:
        typeof req.query.after === "string"
          ? new Date(req.query.after)
          : undefined,
      value:
        typeof req.query.value === "string"
          ? Number(req.query.value)
          : undefined,
    });

  const where = {
    date: { gte: after, lte: before },
    type,
    value,
    unit,
  } as const;
  const count = await db.healthkit_record.count({
    where,
  });
  const aggregations = await db.healthkit_record.aggregate({
    where,
    _avg: { value: true },
    _sum: { value: true },
    _min: { value: true },
    _max: { value: true },
  });
  return res.header("Cache-Control", "public, max-age=3600").json({
    count,
    ...aggregations,
  });
});

app.get("/data", async (req, res) => {
  const { before, after, type, value, unit, sort } = z
    .object({
      before: z.date().optional(),
      after: z.date().optional(),
      type: z.string().optional(),
      value: z.number().optional(),
      unit: z.string().optional(),
      sort: z.string().optional(),
    })
    .parse({
      ...req.query,
      before:
        typeof req.query.before === "string"
          ? new Date(req.query.before)
          : undefined,
      after:
        typeof req.query.after === "string"
          ? new Date(req.query.after)
          : undefined,
      value:
        typeof req.query.value === "string"
          ? Number(req.query.value)
          : undefined,
    });

  const where = {
    date: { gte: after, lte: before },
    type,
    value,
    unit,
  } as const;
  try {
    const data = await db.healthkit_record.findMany({
      where,
      take: 100,
      orderBy: sort ? { [sort.split(":")[0]]: sort.split(":")[1] } : undefined,
    });
    return res.header("Cache-Control", "public, max-age=3600").json(data);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error });
  }
});

app.post("/", async (req, res) => {
  if (!req.body) return res.status(400).json({ success: false });
  res.status(200).json({ success: true });
  const { data } = req.body as {
    data: {
      workouts: [];
      metrics: {
        name: string;
        units: string;
        data: {
          date: string;
          Avg?: number;
          qty?: number;
        }[];
      }[];
    };
  };
  const total = data.metrics.flatMap((i) => i.data).length;
  let i = 0;
  for (const set of data.metrics)
    for await (const record of asyncPool(MAX_POOL_SIZE, set.data, (entry) => {
      i++;
      const hash = createHash("md5")
        .update(JSON.stringify(entry))
        .digest("hex");
      const value =
        ("Avg" in entry ? entry.Avg : "qty" in entry ? entry.qty : 0) ?? 0;
      return db.healthkit_record.upsert({
        where: { hash },
        create: {
          date: new Date(entry.date),
          value,
          type: set.name,
          unit: set.units,
          hash: createHash("md5").update(JSON.stringify(entry)).digest("hex"),
        },
        update: {},
      });
    })) {
      console.log("Created", record.id, `${i}/${total}`);
    }
});

app.listen(port, () => console.log(`Listening on port ${port}`));
