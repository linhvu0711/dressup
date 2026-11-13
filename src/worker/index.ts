import { drizzle } from "drizzle-orm/d1";
import { createApp } from "./app";
import { schema } from "./db";

export default createApp((env) => drizzle(env.DB, { schema }));
