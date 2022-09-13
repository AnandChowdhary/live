import { PrismaClient } from "@prisma/client";
import parser from "body-parser";
import { createHash } from "crypto";
import express from "express";
import asyncPool from "tiny-async-pool";
import { MAX_POOL_SIZE } from "./constants";

const db = new PrismaClient();
const app = express();
app.use(parser.json({ limit: "100mb" }));
const port = process.env.PORT || 3000;

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
