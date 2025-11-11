addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request))
})

async function handleRequest(request) {
  const url = new URL(request.url)
  const ip = url.searchParams.get('ip')

  if (!ip) {
    return new Response(JSON.stringify({ error: "Parameter 'ip' is required." }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // Basic IP validation could be added here if needed
  // For now, we assume the input is a valid IP address.

  try {
    const result = await checkCloudflareEndpoint(ip)
    return new Response(JSON.stringify(result, null, 2), {
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (e) {
    const errorMessage = `An error occurred while processing the IP ${ip}: ${e.message}`
    console.error(errorMessage)
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}

const TARGET_HOST = 'speed.cloudflare.com'
const TARGET_PATH = '/meta'
const TIMEOUT = 3000 // Timeout in milliseconds

async function checkCloudflareEndpoint(targetIp) {
  const url = `https://${TARGET_HOST}${TARGET_PATH}`
  const start_time = Date.now()

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT)

  const fetchOptions = {
    method: 'GET',
    headers: {
      'Host': TARGET_HOST, // Explicitly set Host header
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
    },
    signal: controller.signal,
    // This is the key part: override DNS resolution to point to the target IP.
    // The connection will be made to port 443 (default for https).
    cf: { resolve: targetIp, tls: { sni: { name: TARGET_HOST } } }
  }

  try {
    const response = await fetch(url, fetchOptions)
    const connection_time = Date.now() - start_time
    clearTimeout(timeoutId)

    if (!response.ok) {
        throw new Error(`Endpoint returned non-2xx status: ${response.status}`)
    }

    const data = await response.json()

    return {
      ip: targetIp,
      status: "VALID_CLOUDFLARE_ENDPOINT",
      isp: data.asOrganization || "Unknown",
      countryCode: data.country || "Unknown",
      asn: data.asn || "Unknown",
      colo: data.colo || "Unknown",
      httpProtocol: data.httpProtocol || "Unknown",
      delay: `${Math.round(connection_time)} ms`,
      latitude: data.latitude || "Unknown",
      longitude: data.longitude || "Unknown",
    }

  } catch (e) {
    clearTimeout(timeoutId)
    return {
      ip: targetIp,
      status: "INVALID_OR_UNREACHABLE",
      error: e.message,
    }
  }
}
