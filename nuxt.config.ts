// nuxt.config.ts
import { defineNuxtConfig } from 'nuxt/config'
import { execSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'

// Build identity shown in the footer and written to public/version.json.
function gitCommit(): string {
  try {
    return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim()
  }
  catch {
    return 'unknown'
  }
}
const commit = process.env.NUXT_PUBLIC_COMMIT || gitCommit()
const builtAt = new Date().toISOString()

// Backend (Flask) that serves /api, /firmware and /admin in production.
const backend = process.env.BACKEND_URL || 'http://127.0.0.1:5000'

// Written at config load so `public/version.json` ships in dev, build and generate.
mkdirSync('public', { recursive: true })
writeFileSync('public/version.json', JSON.stringify({ commit, builtAt }) + '\n')

export default defineNuxtConfig({
  modules: ['@nuxt/eslint'],

  ssr: false,
  devtools: { enabled: false },

  app: {
    head: {
      htmlAttrs: { lang: 'en', 'data-theme': 'dark' },
      title: 'Radio setup',
      meta: [
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
        { name: 'color-scheme', content: 'dark' },
      ],
    },
  },
  css: ['~/assets/css/main.css'],

  runtimeConfig: {
    public: { commit },
  },

  routeRules: {
    '/': { prerender: true },
  },

  compatibilityDate: '2024-09-03',

  nitro: {
    // `pnpm dev` forwards the backend routes to the Flask app.
    devProxy: {
      '/api': { target: `${backend}/api`, changeOrigin: true },
      '/firmware': { target: `${backend}/firmware`, changeOrigin: true },
      '/admin': { target: `${backend}/admin`, changeOrigin: true },
    },
  },

  postcss: {
    plugins: {
      tailwindcss: {},
      autoprefixer: {},
    },
  },
  eslint: {
    config: {
      stylistic: true,
      typescript: true,
    },
  },
})
