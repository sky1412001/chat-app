import server from "../src/server";

export const config = {
  runtime: "nodejs",
};

export default async function handler(req: any, res: any) {
  const url = new URL(req.url, `http://${req.headers.host}`);

  // Convert Node headers → Fetch headers properly
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (typeof value === "string") {
      headers.set(key, value);
    } else if (Array.isArray(value)) {
      headers.set(key, value.join(","));
    }
  }

  // Fix body handling
  const hasBody = !["GET", "HEAD"].includes(req.method);

  const request = new Request(url.toString(), {
    method: req.method,
    headers,
    body: hasBody ? req : undefined,
  });

  try {
    const response = await server.fetch(request, process.env, {});

    res.statusCode = response.status;

    // Copy response headers safely
    response.headers.forEach((value, key) => {
      res.setHeader(key, value);
    });

    // Stream-safe response handling
    const arrayBuffer = await response.arrayBuffer();
    res.end(Buffer.from(arrayBuffer));
  } catch (err: any) {
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json");
    res.end(
      JSON.stringify({
        error: "Internal Server Error",
        message: err?.message || "Unknown error",
      })
    );
  }
}