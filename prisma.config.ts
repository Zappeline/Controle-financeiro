import { defineConfig } from "prisma/config";
import * as fs from "fs";

const envFile = fs.readFileSync(".env", "utf-8");
const match = envFile.match(/DATABASE_URL="([^"]+)"/);
const databaseUrl = match ? match[1] : "";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: databaseUrl,
  },
});
