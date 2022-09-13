import { PrismaClient } from "@prisma/client";
import dayjs from "dayjs";
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
  const { before, after, type, value, unit, breakdown } = z
    .object({
      before: z.date().optional(),
      after: z.date().optional(),
      type: z.string().optional(),
      value: z.number().optional(),
      unit: z.string().optional(),
      breakdown: z.string().optional().default("day"),
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
  const first = await db.healthkit_record.findFirst({
    where,
    orderBy: { date: "asc" },
  });
  const last = await db.healthkit_record.findFirst({
    where,
    orderBy: { date: "desc" },
  });
  const aggregations = await db.healthkit_record.aggregate({
    where,
    _count: { value: true },
    _avg: { value: true },
    _sum: { value: true },
    _min: { value: true },
    _max: { value: true },
  });
  const breakdowns: [Date, Date][] = [];
  if (first && last) {
    if (breakdown === "day") {
      const start = dayjs(first.date)
        .hour(0)
        .minute(0)
        .second(0)
        .millisecond(0);
      const diff = dayjs(last.date).diff(start, "days");
      for (let i = 0; i < diff; i++)
        breakdowns.push([
          start.add(i, "day").toDate(),
          start
            .add(i, "day")
            .hour(23)
            .minute(59)
            .second(59)
            .millisecond(9999)
            .toDate(),
        ]);
    } else if (breakdown === "week") {
      const start = dayjs(first.date)
        .hour(0)
        .minute(0)
        .second(0)
        .millisecond(0);
      const diff = dayjs(last.date).diff(start, "weeks");
      for (let i = 0; i < diff; i++)
        breakdowns.push([
          start.add(i, "week").toDate(),
          start
            .add(i + 1, "week")
            .subtract(1, "day")
            .hour(23)
            .minute(59)
            .second(59)
            .millisecond(9999)
            .toDate(),
        ]);
    } else if (breakdown === "month") {
      const start = dayjs(first.date)
        .hour(0)
        .minute(0)
        .second(0)
        .millisecond(0);
      const diff = dayjs(last.date).diff(start, "months");
      for (let i = 0; i < diff; i++)
        breakdowns.push([
          start.add(i, "month").toDate(),
          start
            .add(i + 1, "month")
            .subtract(1, "day")
            .hour(23)
            .minute(59)
            .second(59)
            .millisecond(9999)
            .toDate(),
        ]);
    } else if (breakdown === "year") {
      const start = dayjs(first.date)
        .hour(0)
        .minute(0)
        .second(0)
        .millisecond(0);
      const diff = dayjs(last.date).diff(start, "years");
      for (let i = 0; i < diff; i++)
        breakdowns.push([
          start.add(i, "year").toDate(),
          start
            .add(i + 1, "year")
            .subtract(1, "day")
            .hour(23)
            .minute(59)
            .second(59)
            .millisecond(9999)
            .toDate(),
        ]);
    } else if (breakdown === "hour") {
      const start = dayjs(first.date).minute(0).second(0).millisecond(0);
      const diff = dayjs(last.date).diff(start, "hours");
      for (let i = 0; i < diff; i++)
        breakdowns.push([
          start.add(i, "hour").toDate(),
          start.add(i, "hour").minute(59).second(59).millisecond(9999).toDate(),
        ]);
    }
  }

  const brokenDown: any[] = [];
  for await (const { start, end, data } of asyncPool(
    MAX_POOL_SIZE,
    breakdowns,
    async ([start, end]) => {
      return {
        start,
        end,
        data: await db.healthkit_record.aggregate({
          where: { ...where, date: { gte: start, lte: end } },
          _count: { value: true },
          _avg: { value: true },
          _sum: { value: true },
          _min: { value: true },
          _max: { value: true },
        }),
      };
    }
  )) {
    brokenDown.push({
      start,
      end,
      count: data._count.value,
      average: data._avg.value,
      sum: data._sum.value,
      minimum: data._min.value,
      maximum: data._max.value,
    });
  }

  return res.header("Cache-Control", "public, max-age=3600").json({
    count: aggregations._count.value,
    average: aggregations._avg.value,
    sum: aggregations._sum.value,
    minimum: aggregations._min.value,
    maximum: aggregations._max.value,
    breakdown: brokenDown.sort((a, b) => a.start.getTime() - b.start.getTime()),
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
