import express from "express";
import { createHash } from "crypto";
import parser from "body-parser";
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();
const app = express();
app.use(parser.json({ limit: "100mb" }));
const port = process.env.PORT || 3000;

app.post("/heart-rate", async (req, res) => {
  if (!req.body) return res.status(400).json({ success: false });

  res.status(400).json({ success: true });
  const { data } = req.body as {
    data: {
      workouts: [];
      metrics: {
        name: "heart_rate";
        units: "count/min";
        data: [
          {
            Min: number;
            Max: number;
            date: string;
            Avg: number;
          }
        ];
      }[];
    };
  };
  console.log(new Date());
  const heartRate = data.metrics.find((metric) => metric.name === "heart_rate");
  if (heartRate) {
    for (const entry of heartRate.data) {
      const hash = createHash("md5")
        .update(JSON.stringify(entry))
        .digest("hex");
      console.log(hash);
      await db.heart_rate.upsert({
        where: { hash },
        create: {
          date: new Date(entry.date),
          value: Math.round(entry.Avg),
          hash: createHash("md5").update(JSON.stringify(entry)).digest("hex"),
        },
        update: {},
      });
    }
  }
});

app.get("/heart-rate", async (req, res) => {
  const data = await db.heart_rate.findMany();
  res.json(data);
});

app.listen(port, () => console.log(`HelloNode app listening on port ${port}!`));
