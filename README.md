# GHZ-NDS — gRPC Load Testing UI

Web-based UI untuk menjalankan gRPC load test menggunakan `@grpc/grpc-js`. Upload file `.proto`, konfigurasikan parameter test (concurrency, jumlah request, data), dan lihat hasilnya langsung di browser.

![Next.js](https://img.shields.io/badge/Next.js-16-black) ![Docker](https://img.shields.io/badge/Docker-ready-blue) ![gRPC](https://img.shields.io/badge/gRPC-load%20test-green)

---

## Quick Start (Docker)

Cara paling cepat tanpa perlu clone repo atau install dependencies:

```bash
docker run -p 3000:3000 ghcr.io/andrianns/ghz-nds
```

Buka **http://localhost:3000** di browser.

### Target Address

| OS    | Target Address untuk gRPC server lokal         |
| ----- | ---------------------------------------------- |
| macOS | `host.docker.internal:PORT`                    |
| Linux | Gunakan `--network host` lalu `localhost:PORT` |

**Contoh Linux:**

```bash
docker run --network host ghcr.io/andrianns/ghz-nds
```

### Update ke versi terbaru

```bash
docker pull ghcr.io/andrianns/ghz-nds:latest
docker run -p 3000:3000 ghcr.io/andrianns/ghz-nds
```

---

## Development (Local)

```bash
git clone https://github.com/Andrianns/ghz-nds.git
cd ghz-nds
npm install
npm run dev
```

Buka **http://localhost:3000**. Target address bisa langsung pakai `localhost:PORT`.

---

## Build & Push Docker Image

```bash
docker build -t ghcr.io/andrianns/ghz-nds:latest .
docker push ghcr.io/andrianns/ghz-nds:latest
```

---

## Cara Pakai

1. **Upload/paste file `.proto`** di panel kiri
2. **Pilih service dan method** yang mau di-test
3. **Isi target address** gRPC server (contoh: `localhost:8081` atau `host.docker.internal:8081`)
4. **Konfigurasi step** — atur concurrency (`c`) dan jumlah request (`n`)
5. **Isi request data** dalam format JSON
6. **Klik Run** dan lihat hasilnya

---

## Tech Stack

- **Next.js 16** — Frontend + API routes
- **@grpc/grpc-js** — gRPC client untuk load testing
- **@grpc/proto-loader** — Parse file `.proto`
- **Tailwind CSS** — Styling
- **Framer Motion** — Animasi
- **html2canvas** — Export hasil sebagai gambar
