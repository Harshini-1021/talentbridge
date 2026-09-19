# TalentBridge — multi-stage build.
#
# Secrets are never build args: NEXT_PUBLIC_* values are needed at build time
# for the client bundle, so they are passed as build args deliberately and are
# public by definition. Every private key (Gemini, Groq) is read from the
# environment at run time and never enters a layer.

# ---- dependencies ---------------------------------------------------------
FROM node:24-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# ---- build ----------------------------------------------------------------
FROM node:24-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Public, client-side configuration only. Inlined into the browser bundle.
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL
ENV NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY
ENV NEXT_TELEMETRY_DISABLED=1

RUN npm run build

# ---- runtime --------------------------------------------------------------
FROM node:24-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Run as an unprivileged user rather than root.
RUN addgroup --system --gid 1001 nodejs \
 && adduser  --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000

# GEMINI_API_KEY and GROQ_API_KEY are supplied at run time:
#   docker run --env-file .env.local -p 3000:3000 talentbridge
CMD ["node", "server.js"]
