import { Handler } from "@netlify/functions";
import { countries } from "countries-list";
import got from "got";
import { parse } from "node-html-parser";

const handler: Handler = async () => {
  const { body: zeroHtml } = await got.get(
    "https://gyrosco.pe/anand-chowdhary/zero/?_pjax=%23page"
  );
  const zero = parse(zeroHtml);
  const coordinates = [
    Math.round(
      parseFloat(
        zero.querySelector("[data-latitude]")?.getAttribute("data-latitude") ??
          "0"
      ) * 100
    ) / 100,
    Math.round(
      parseFloat(
        zero
          .querySelector("[data-longitude]")
          ?.getAttribute("data-longitude") ?? "0"
      ) * 100
    ) / 100,
  ];
  // const x = (zero.querySelector(".location-time-ago")?.innerText ?? "").replace(
  //   /[^0-9a-zA-Z\s]/g,
  //   ""
  // );

  const geocode = await got
    .get(
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${coordinates[0]}&lon=${coordinates[1]}`,
      { headers: { "User-Agent": "github@anandchowdhary.com" } }
    )
    .json<{
      name: string;
      display_name: string;
      address: Record<string, string> & {
        country: string;
        country_code: string;
      };
    }>();
  const country = countries[geocode.address.country_code.toUpperCase()];

  const { body: sportsHtml } = await got.get(
    "https://gyrosco.pe/anand-chowdhary/zero/sport/?_pjax=%23page"
  );

  return {
    statusCode: 200,
    body: JSON.stringify(
      {
        updatedAt: new Date().toISOString(),
        approximateLocation: {
          coordinates,
          label:
            geocode.address.village ??
            geocode.address.town ??
            geocode.address.city ??
            geocode.address.suburb ??
            geocode.address.county ??
            geocode.address.state ??
            country.name,
          country: { code: geocode.address.country_code, ...country },
        },
      },
      null,
      2
    ),
    headers: {
      "Cache-Control": "public, max-age=3600",
      "Content-Type": "application/json; charset=utf-8",
    },
  };
};

export { handler };
