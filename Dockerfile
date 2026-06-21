FROM node:20-alpine

# Install ffmpeg and fonts for drawtext
RUN apk add --no-cache ffmpeg fontconfig ttf-freefont ttf-dejavu

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci

# Copy source and build
COPY . .
RUN npm run build

EXPOSE 3000
CMD ["npm", "start"]