#!/usr/bin/env bun

/**
 * Simple HTTP server for dashboard development
 */

const port = parseInt(process.argv.find(arg => arg.startsWith('--port='))?.split('=')[1] || '3001')

const server = Bun.serve({
  port,
  async fetch(req) {
    const url = new URL(req.url)
    
    // Serve static files
    if (url.pathname === '/' || url.pathname === '/index.html') {
      return new Response(Bun.file('./dashboard.html'))
    }
    
    if (url.pathname === '/simple') {
      return new Response(Bun.file('./simple.html'))
    }
    
    if (url.pathname === '/example') {
      return new Response(Bun.file('./example.html'))
    }
    
    // Serve built files from dist
    if (url.pathname.startsWith('/dist/')) {
      const filePath = `.${url.pathname}`
      return new Response(Bun.file(filePath))
    }
    
    // Serve source files for development
    if (url.pathname.startsWith('/src/')) {
      const filePath = `.${url.pathname}`
      return new Response(Bun.file(filePath))
    }
    
    return new Response('Not Found', { status: 404 })
  },
})

console.log(`🚀 Dashboard server running on http://localhost:${port}`)
console.log(`📊 Available routes:`)
console.log(`   http://localhost:${port}/          - Main dashboard`)
console.log(`   http://localhost:${port}/simple    - Simple dashboard`)
console.log(`   http://localhost:${port}/example   - Example dashboard`)