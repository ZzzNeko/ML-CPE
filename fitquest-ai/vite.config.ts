import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig, type Plugin } from 'vite'

// Local stand-in for api/heartrate.ts (Vercel Functions do not run under `vite dev`).
// Keeps the latest reading in memory so the ESP32 can POST to http://<PC-IP>:5173/api/heartrate.
function heartRateDevApi(): Plugin {
  const latest = new Map<string, Record<string, unknown>>()
  return {
    name: 'heartrate-dev-api',
    configureServer(server) {
      server.middlewares.use('/api/heartrate', (req, res) => {
        res.setHeader('Content-Type', 'application/json')
        res.setHeader('Cache-Control', 'no-store')
        if (req.method === 'POST') {
          let raw = ''
          req.on('data', (chunk: Buffer) => { raw += chunk.toString() })
          req.on('end', () => {
            try {
              const body = JSON.parse(raw) as Record<string, unknown>
              const device = typeof body.device === 'string' ? body.device : 'fitquest-band-01'
              latest.set(device, { bpm: body.bpm ?? null, finger: body.finger === true, battery: body.battery ?? null, rssi: body.rssi ?? null, at: Date.now() })
              res.end('{"ok":true}')
            } catch {
              res.statusCode = 400
              res.end('{"error":"invalid json"}')
            }
          })
          return
        }
        const device = new URL(req.url ?? '', 'http://localhost').searchParams.get('device') ?? 'fitquest-band-01'
        const d = latest.get(device)
        res.end(JSON.stringify(d ? { ...d, online: Date.now() - (d.at as number) < 15000 } : { online: false }))
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), heartRateDevApi()],
  server: {
    host: true,
    allowedHosts: ['.onrender.com'],
    watch: {
      ignored: ['**/Segmented Movements/**'],
    },
  },
  preview: {
    host: true,
    allowedHosts: ['.onrender.com'],
  },
})
