import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';

// Max duration for Vercel serverless (set to 60s, adjust based on your plan)
export const maxDuration = 60;

interface CallResult {
  latency: number; // in nanoseconds
  error: string | null;
  statusCode: string;
}

function hrtimeToNs(hr: [number, number]): number {
  return hr[0] * 1e9 + hr[1];
}

function buildHistogram(latencies: number[], bucketCount = 10): { mark: number; count: number; frequency: number }[] {
  if (latencies.length === 0) return [];

  const sorted = [...latencies].sort((a, b) => a - b);
  const min = sorted[0];
  const max = sorted[sorted.length - 1];

  if (min === max) {
    return [{ mark: min / 1e9, count: latencies.length, frequency: 1 }];
  }

  const bucketSize = (max - min) / bucketCount;
  const buckets: { mark: number; count: number }[] = [];

  for (let i = 0; i < bucketCount; i++) {
    buckets.push({ mark: (min + bucketSize * (i + 1)) / 1e9, count: 0 });
  }

  for (const lat of latencies) {
    let idx = Math.floor((lat - min) / bucketSize);
    if (idx >= bucketCount) idx = bucketCount - 1;
    buckets[idx].count++;
  }

  const total = latencies.length;
  return buckets.map(b => ({ ...b, frequency: b.count / total }));
}

function buildLatencyDistribution(latencies: number[]): { percentage: number; latency: number }[] {
  if (latencies.length === 0) return [];
  const sorted = [...latencies].sort((a, b) => a - b);
  const percentiles = [10, 25, 50, 75, 90, 95, 99];
  return percentiles.map(p => {
    const idx = Math.max(0, Math.ceil((p / 100) * sorted.length) - 1);
    return { percentage: p, latency: sorted[idx] };
  });
}

function makeUnaryCall(
  client: any,
  methodName: string,
  requestData: object,
  metadataObj: grpc.Metadata
): Promise<CallResult> {
  return new Promise((resolve) => {
    const startTime = process.hrtime();

    client[methodName](requestData, metadataObj, (err: grpc.ServiceError | null, _response: any) => {
      const elapsed = process.hrtime(startTime);
      const latencyNs = hrtimeToNs(elapsed);

      if (err) {
        resolve({
          latency: latencyNs,
          error: err.message || err.code?.toString() || 'Unknown error',
          statusCode: grpc.status[err.code] || `UNKNOWN(${err.code})`,
        });
      } else {
        resolve({
          latency: latencyNs,
          error: null,
          statusCode: 'OK',
        });
      }
    });
  });
}

export async function POST(req: NextRequest) {
  let tempDir: string | null = null;

  try {
    const body = await req.json();
    const { protoContent, service, method, address, config, metadata } = body;

    if (!protoContent || !service || !method || !address) {
      const missing = [];
      if (!protoContent) missing.push('protoContent');
      if (!service) missing.push('service');
      if (!method) missing.push('method');
      if (!address) missing.push('address');
      return NextResponse.json({ error: 'Missing required fields', missing }, { status: 400 });
    }

    const concurrency = config?.c || 10;
    const totalRequests = config?.n || 100;
    const requestData = config?.data || {};

    // Write proto to temp file for proto-loader
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ghz-'));
    const protoPath = path.join(tempDir, 'service.proto');
    await fs.writeFile(protoPath, protoContent);

    // Load proto definition
    const packageDefinition = await protoLoader.load(protoPath, {
      keepCase: true,
      longs: String,
      enums: String,
      defaults: true,
      oneofs: true,
    });

    const proto = grpc.loadPackageDefinition(packageDefinition);

    // Navigate to the service (e.g. "mypackage.MyService")
    let ServiceConstructor: any = proto;
    const serviceParts = service.split('.');
    for (const part of serviceParts) {
      ServiceConstructor = ServiceConstructor?.[part];
    }

    if (!ServiceConstructor) {
      return NextResponse.json({ error: `Service "${service}" not found in proto definition` }, { status: 400 });
    }

    // Create client
    const client = new ServiceConstructor(
      address,
      grpc.credentials.createInsecure()
    );

    // Prepare metadata
    const grpcMetadata = new grpc.Metadata();
    if (metadata && typeof metadata === 'object') {
      for (const [key, value] of Object.entries(metadata)) {
        grpcMetadata.add(key, String(value));
      }
    }

    // Find the correct method name (case-insensitive match for camelCase)
    const clientMethods = Object.keys(Object.getPrototypeOf(client)).filter(k => !k.startsWith('$'));
    const methodName = clientMethods.find(
      m => m.toLowerCase() === method.toLowerCase()
    ) || method;

    // Run load test with concurrency
    const allResults: CallResult[] = [];
    const overallStart = process.hrtime();

    let completed = 0;
    const runWorker = async () => {
      while (completed < totalRequests) {
        const idx = completed++;
        if (idx >= totalRequests) break;
        const result = await makeUnaryCall(client, methodName, requestData, grpcMetadata);
        allResults.push(result);
      }
    };

    // Launch concurrent workers
    const workers = [];
    for (let i = 0; i < Math.min(concurrency, totalRequests); i++) {
      workers.push(runWorker());
    }
    await Promise.all(workers);

    const overallElapsed = process.hrtime(overallStart);
    const totalDurationNs = hrtimeToNs(overallElapsed);

    // Close client
    client.close();

    // Compute statistics
    const latencies = allResults.map(r => r.latency);
    const successLatencies = allResults.filter(r => !r.error).map(r => r.latency);

    const count = allResults.length;
    const totalLatencyNs = latencies.reduce((a, b) => a + b, 0);
    const average = count > 0 ? totalLatencyNs / count : 0;
    const fastest = count > 0 ? Math.min(...latencies) : 0;
    const slowest = count > 0 ? Math.max(...latencies) : 0;
    const rps = totalDurationNs > 0 ? (count / (totalDurationNs / 1e9)) : 0;

    // Status code distribution
    const statusCodeDistribution: { [key: string]: number } = {};
    const errorDist: { [key: string]: number } = {};

    for (const r of allResults) {
      statusCodeDistribution[r.statusCode] = (statusCodeDistribution[r.statusCode] || 0) + 1;
      if (r.error) {
        errorDist[r.error] = (errorDist[r.error] || 0) + 1;
      }
    }

    // Build response in ghz-compatible format
    const result = {
      date: new Date().toISOString(),
      count,
      total: totalDurationNs,
      average,
      fastest,
      slowest,
      rps,
      errorDist,
      statusCodeDistribution,
      latencyDistribution: buildLatencyDistribution(latencies),
      histogram: buildHistogram(latencies),
      details: allResults.map(r => ({
        latency: r.latency,
        error: r.error || '',
        status: r.statusCode,
      })),
    };

    return NextResponse.json(result);

  } catch (error: any) {
    console.error('API Error: - route.ts:228', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  } finally {
    if (tempDir) {
      try {
        await fs.rm(tempDir, { recursive: true, force: true });
      } catch (e) {
        console.error('Failed to clean up temp dir: - route.ts:235', e);
      }
    }
  }
}
