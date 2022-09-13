import { Handler } from "@netlify/functions";
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

const handler: Handler = async (event) => {
  // if (!event.body) throw new Error("Event body is required");
  // const { data } = JSON.parse(event.body) as {
  //   data: {
  //     workouts: [];
  //     metrics: {
  //       name: "heart_rate";
  //       units: "count/min";
  //       data: [
  //         {
  //           Min: number;
  //           Max: number;
  //           date: string;
  //           Avg: number;
  //         }
  //       ];
  //     }[];
  //   };
  // };

  const data2 = await prisma.heart_rate.findMany();
  console.log(data2);

  // const heartRate = data.metrics.find((metric) => metric.name === "heart_rate");
  // if (heartRate && false) {
  //   for (const { date, Avg } of heartRate.data)
  //     await prisma.heart_rate.create({
  //       data: { date: new Date(date), value: Math.round(Avg) },
  //     });
  // }

  return {
    statusCode: 200,
    body: JSON.stringify({ success: true }, null, 2),
    headers: {
      "Cache-Control": "no-cache, no-store, must-revalidate",
      "Content-Type": "application/json; charset=utf-8",
    },
  };
};

export { handler };
