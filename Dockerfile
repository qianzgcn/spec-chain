FROM node:22.22.0-bookworm-slim AS dependencies

WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1 \
    DATABASE_URL=file:./data/install.db \
    PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

COPY package.json package-lock.json ./
COPY prisma/schema.prisma ./prisma/schema.prisma
COPY prisma.config.ts ./
RUN npm install --global npm@11.11.1 \
    && npm ci

FROM dependencies AS build

COPY . .

# 构建阶段只用于完成 Next.js 静态分析，不会作为正式运行密钥使用。
ENV NODE_ENV=production \
    DATABASE_URL=file:./data/build.db \
    APP_ENCRYPTION_KEY=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA= \
    SESSION_COOKIE_SECURE=false

RUN npm run build \
    && npm prune --omit=dev

FROM node:22.22.0-bookworm-slim AS runtime

WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PLAYWRIGHT_BROWSERS_PATH=/ms-playwright \
    PORT=3000

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /ms-playwright /ms-playwright
RUN npm install --global npm@11.11.1 \
    && node node_modules/playwright/cli.js install-deps chromium \
    && node -e "const fs=require('node:fs');const browser=require('playwright').chromium;if(!fs.existsSync(browser.executablePath()))process.exit(1)"

COPY --from=build /app/.next ./.next
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/package-lock.json ./package-lock.json
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/prisma.config.ts ./prisma.config.ts
COPY --from=build /app/public ./public
COPY --from=build /app/scripts ./scripts
COPY --from=build /app/src ./src
COPY --from=build /app/tsconfig.json ./tsconfig.json

RUN mkdir -p /app/data \
    && chown node:node /app/data

USER node
EXPOSE 3000

CMD ["npm", "run", "start"]
