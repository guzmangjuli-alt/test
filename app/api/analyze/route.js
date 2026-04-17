import { analyzeSignal } from "@/lib/analysis";

export async function POST(req) {
  const data = await req.json();

  const result = analyzeSignal(data);

  return Response.json({
    ...data,
    ...result
  });
}
