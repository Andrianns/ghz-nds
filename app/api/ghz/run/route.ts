import { NextRequest, NextResponse } from 'next/server';
import { exec } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { promisify } from 'util';

const execAsync = promisify(exec);

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { protoContent, service, method, address, config, metadata } = body;

    if (!protoContent || !service || !method || !address) {
      const missing = [];
      if (!protoContent) missing.push('protoContent');
      if (!service) missing.push('service');
      if (!method) missing.push('method');
      if (!address) missing.push('address');
      console.error('API Validation Failed. Missing fields:', missing);
      return NextResponse.json({ error: 'Missing required fields', missing }, { status: 400 });
    }

    // Create a temporary directory for the proto file
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ghz-'));
    const protoPath = path.join(tempDir, 'service.proto');

    try {
      // Write the proto content to the temp file
      await fs.writeFile(protoPath, protoContent);

      // Construct the ghz command
      // config: { c: number, n: number, data: object, ... }
      const args = [
        `--proto "${protoPath}"`,
        `--call "${service}.${method}"`,
        `-c ${config.c || 10}`,
        `-n ${config.n || 100}`,
        `--insecure`, // Assuming localhost uses insecure
        `--format json`,
        `"${address}"`
      ];

      if (config.data) {
        // user might pass data as object or string
        const dataStr = typeof config.data === 'string' ? config.data : JSON.stringify(config.data);
        // Escape double quotes for shell safety - simple version
        // For better safety we should write data to a file too or be careful with escaping
        const dataPath = path.join(tempDir, 'data.json');
        await fs.writeFile(dataPath, dataStr);
        args.push(`-d @"${dataPath}"`);
      }

      if (metadata && Object.keys(metadata).length > 0) {
        const metadataStr = typeof metadata === 'string' ? metadata : JSON.stringify(metadata);
        const metadataPath = path.join(tempDir, 'metadata.json');
        await fs.writeFile(metadataPath, metadataStr);
        args.push(`-m @"${metadataPath}"`);
      }


      let ghzPath = 'ghz';

      // Check if ghz is available in PATH
      try {
        await execAsync('command -v ghz');
      } catch (e) {
        // Not in PATH, check /tmp/ghz
        const tempGhz = path.join(os.tmpdir(), 'ghz-binary', 'ghz');
        const tempGhzDir = path.dirname(tempGhz);

        try {
          await fs.access(tempGhz);
          ghzPath = tempGhz;
        } catch (e) {
          // Not in /tmp, download it (Linux only for Vercel)
          // Note: This assumes Linux environment (Vercel). For local dev without ghz, this might fail on Mac if we download linux binary.
          // We should detect OS.
          const platform = os.platform(); // 'darwin', 'linux', 'win32'
          let downloadUrl = '';

          if (platform === 'linux') {
            downloadUrl = 'https://github.com/bojand/ghz/releases/download/v0.120.0/ghz-linux-x86_64.tar.gz';
          } else if (platform === 'darwin') {
            const arch = os.arch();
            if (arch === 'arm64') {
              downloadUrl = 'https://github.com/bojand/ghz/releases/download/v0.120.0/ghz-darwin-arm64.tar.gz';
            } else {
              downloadUrl = 'https://github.com/bojand/ghz/releases/download/v0.120.0/ghz-darwin-x86_64.tar.gz';
            }
          }

          if (downloadUrl) {
            console.log(`Downloading ghz from ${downloadUrl}...`);
            await fs.mkdir(tempGhzDir, { recursive: true });
            await execAsync(`curl -L "${downloadUrl}" | tar xz -C "${tempGhzDir}" ghz`);
            ghzPath = tempGhz;
          } else {
            throw new Error("GHZ binary not found and auto-download not supported for this platform.");
          }
        }
      }

      // Execute ghz
      const command = `${ghzPath} ${args.join(' ')}`;
      console.log('Executing Command:', command);

      try {
        const { stdout, stderr } = await execAsync(command);

        if (stderr) {
          console.log('GHZ Stderr:', stderr);
        }
        if (stdout) {
          // console.log('GHZ Stdout:', stdout); // potential huge output
        }

        // Parse the JSON output from ghz
        let result;
        try {
          result = JSON.parse(stdout);
        } catch (e) {
          console.error("Failed to parse ghz output:", stdout);
          return NextResponse.json({
            error: 'Failed to parse ghz output',
            raw: stdout,
            stderr,
            command
          }, { status: 500 });
        }

        return NextResponse.json(result);

      } catch (execError: any) {
        console.error("GHZ Parsed Error:", execError);
        // execAsync throws if exit code is not 0
        return NextResponse.json({
          error: 'GHZ execution failed',
          stderr: execError.stderr,
          stdout: execError.stdout,
          message: execError.message,
          command
        }, { status: 500 });
      }

    } finally {
      // Clean up
      try {
        await fs.rm(tempDir, { recursive: true, force: true });
      } catch (e) {
        console.error('Failed to clean up temp dir:', e);
      }
    }

  } catch (error: any) {
    console.error('API Error:', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
