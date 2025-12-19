FROM node:22-alpine

# Defaults to 0 for random OS-allocated port but here we need a predictable fixed value to expose
ENV PORT=80

# Please provide your own secret if you deploy somewhere!
ENV SECRET="JWT signing secret"

# Let the app know it is running in container
ENV CONTAINER=true

RUN mkdir /app
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm i

# Build
COPY . .
RUN npm run build:app

EXPOSE 80

# Command to run the application
CMD ["/app/node_modules/.bin/ts-node", "--transpile-only", "./src/index.ts"]
